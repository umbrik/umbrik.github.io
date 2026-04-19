/* ── Configuration ────────────────────────────────────── */
let SKIP = new URLSearchParams(window.location.search).has('skip');

const CONFIG = {
  get typeSpeed()      { return SKIP ? 0 : 18; },
  get fastTypeSpeed()  { return SKIP ? 0 : 8; },
  get lineDelay()      { return SKIP ? 0 : 60; },
  get sectionDelay()   { return SKIP ? 0 : 300; },
  get spinnerDuration(){ return SKIP ? 0 : 500; },
};

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const terminal = document.getElementById('terminal');
let ALL_DATA = {};
let DATA = null;
let LANG = 'en';
let inputLocked = false;
let commandHistory = JSON.parse(sessionStorage.getItem('cv-history') || '[]');

function saveHistory() {
  sessionStorage.setItem('cv-history', JSON.stringify(commandHistory));
}

/* ── Utilities ────────────────────────────────────────── */
const sleep = ms => (SKIP || window.__forceSkip) ? Promise.resolve() : new Promise(r => setTimeout(r, ms));

async function loadLang(lang) {
  if (!ALL_DATA[lang]) {
    const res = await fetch('i18n/' + lang + '.json');
    ALL_DATA[lang] = await res.json();
  }
  return ALL_DATA[lang];
}

function scrollToBottom() {
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function createLine(cssClass) {
  const div = document.createElement('div');
  div.className = 'line' + (cssClass ? ' ' + cssClass : '');
  terminal.appendChild(div);
  scrollToBottom();
  return div;
}

function printEmptyLine() {
  return createLine('empty');
}

function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Cursor ───────────────────────────────────────────── */
let activeCursor = null;

function addCursor(parent) {
  removeCursor();
  const c = document.createElement('span');
  c.className = 'cursor';
  parent.appendChild(c);
  activeCursor = c;
  return c;
}

function removeCursor() {
  if (activeCursor?.parentNode) activeCursor.parentNode.removeChild(activeCursor);
  activeCursor = null;
}

/* ── Typewriter ───────────────────────────────────────── */
async function typeLine(text, el, speed = CONFIG.typeSpeed) {
  const cursor = addCursor(el);
  for (const ch of text) {
    el.insertBefore(document.createTextNode(ch), cursor);
    scrollToBottom();
    await sleep(speed);
  }
  return el;
}

async function typeHTML(htmlStr, el, speed = CONFIG.typeSpeed) {
  const cursor = addCursor(el);
  const temp = document.createElement('span');
  temp.innerHTML = htmlStr;

  for (const node of Array.from(temp.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      for (const ch of node.textContent) {
        el.insertBefore(document.createTextNode(ch), cursor);
        scrollToBottom();
        await sleep(speed);
      }
    } else {
      const clone = node.cloneNode(false);
      el.insertBefore(clone, cursor);
      for (const ch of node.textContent) {
        clone.textContent += ch;
        scrollToBottom();
        await sleep(speed);
      }
    }
  }
  return el;
}

async function printLine(text, cssClass, speed) {
  if (SKIP || window.__forceSkip) { printInstant(text, cssClass); return; }
  const line = createLine(cssClass);
  await typeLine(text, line, speed);
  removeCursor();
  return line;
}

async function printHTMLLine(html, cssClass, speed) {
  if (SKIP || window.__forceSkip) { printHTMLInstant(html, cssClass); return; }
  const line = createLine(cssClass);
  await typeHTML(html, line, speed);
  removeCursor();
  return line;
}

function printInstant(text, cssClass) {
  const line = createLine(cssClass);
  line.textContent = text;
  return line;
}

function printHTMLInstant(html, cssClass) {
  const line = createLine(cssClass);
  line.innerHTML = html;
  return line;
}

/* ── Spinner ──────────────────────────────────────────── */
async function showSpinner(text, duration = CONFIG.spinnerDuration) {
  if (SKIP || window.__forceSkip) return;
  const line = createLine();
  const s = document.createElement('span');
  s.className = 'spinner';
  line.appendChild(s);
  line.appendChild(document.createTextNode(' ' + text));

  let frame = 0;
  const iv = setInterval(() => {
    s.textContent = SPINNER_FRAMES[frame++ % SPINNER_FRAMES.length];
  }, 80);

  await sleep(duration);
  clearInterval(iv);
  terminal.removeChild(line);
}

/* ── Interactive Input ────────────────────────────────── */
let inputLine = null;
let inputField = null;

function createInputPrompt() {
  inputLine = createLine('input-line');
  inputLine.innerHTML = '<span class="arrow">❯</span> ';

  inputField = document.createElement('input');
  inputField.type = 'text';
  inputField.className = 'cli-input';
  inputField.setAttribute('autocomplete', 'off');
  inputField.setAttribute('spellcheck', 'false');
  inputField.setAttribute('autofocus', 'true');
  inputLine.appendChild(inputField);

  inputField.addEventListener('keydown', handleInput);
  inputField.focus();
  scrollToBottom();
}

function removeInputPrompt() {
  if (inputField) {
    inputField.removeEventListener('keydown', handleInput);
  }
  if (inputLine?.parentNode) {
    terminal.removeChild(inputLine);
  }
  inputLine = null;
  inputField = null;
}

async function handleInput(e) {
  if (e.key !== 'Enter' || inputLocked) return;
  const cmd = inputField.value.trim().toLowerCase();
  if (!cmd) return;

  inputLocked = true;

  // Freeze input as a static prompt line
  removeInputPrompt();
  printHTMLInstant(
    '<span class="arrow">❯</span> <span class="dim">' + escapeHTML(cmd) + '</span>'
  );

  await sleep(CONFIG.lineDelay);
  if (cmd !== '/clear') {
    commandHistory.push(cmd);
    saveHistory();
  }
  await executeCommand(cmd);

  // Commands that re-render (like /clear, /lang) create their own prompt
  if (cmd !== '/clear' && cmd !== '/lang') {
    inputLocked = false;
    createInputPrompt();
  }
}

// Focus input on any click, or run clicked command
document.addEventListener('click', (e) => {
  const cmdEl = e.target.closest('.cmd-link');
  if (cmdEl && !inputLocked && inputField) {
    e.preventDefault();
    inputField.value = cmdEl.dataset.cmd;
    inputField.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    return;
  }
  if (inputField && !inputLocked) inputField.focus();
});

/* ── Commands ─────────────────────────────────────────── */
async function executeCommand(cmd) {
  switch (cmd) {
    case '/about':   return cmdAbout();
    case '/role':    return cmdRole();
    case '/stack':   return cmdStack();
    case '/projects':return cmdProjects();
    case '/contacts':return cmdContacts();
    case '/help':    return cmdHelp();
    case '/skip':    return cmdSkip();
    case '/lang':    return cmdLang();
    case '/clear':   return cmdClear();
    default:         return cmdUnknown(cmd);
  }
}

async function cmdAbout() {
  await showSpinner(DATA.ui.loading + ' about...');
  printEmptyLine();
  for (const line of DATA.details.about) {
    if (line === '') { printEmptyLine(); continue; }
    await printLine('  ' + line, '', CONFIG.typeSpeed);
    await sleep(CONFIG.lineDelay);
  }
  printEmptyLine();
}

async function cmdRole() {
  await showSpinner(DATA.ui.loading + ' role...');
  const r = DATA.details.role;
  printEmptyLine();
  await printHTMLLine(
    '  <span class="job-company">' + escapeHTML(r.company) + '</span>' +
    '  <span class="dim">·</span>  ' +
    '<span class="job-role">' + escapeHTML(r.title) + '</span>',
    '', CONFIG.typeSpeed
  );
  await printHTMLLine(
    '  <span class="job-period">' + escapeHTML(r.period) + '</span>',
    '', CONFIG.fastTypeSpeed
  );
  printEmptyLine();
  for (const line of r.description) {
    await printLine('  ' + line, 'dim', CONFIG.typeSpeed);
    await sleep(CONFIG.lineDelay);
  }
  printEmptyLine();
}

async function cmdStack() {
  await showSpinner(DATA.ui.loading + ' stack...');
  printEmptyLine();
  for (const [cat, items] of Object.entries(DATA.details.stack)) {
    const labelHTML = '<span class="label">' + escapeHTML(cat) + ':</span>  ';

    if (SKIP) {
      let html = '  ' + labelHTML;
      for (const item of items) html += '<span class="tag">' + escapeHTML(item) + '</span> ';
      printHTMLInstant(html);
    } else {
      const line = createLine();
      await typeHTML('  ' + labelHTML, line, CONFIG.typeSpeed);

      for (let i = 0; i < items.length; i++) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        for (const ch of items[i]) {
          tag.textContent += ch;
          if (!tag.parentNode) line.insertBefore(tag, activeCursor);
          scrollToBottom();
          await sleep(CONFIG.fastTypeSpeed);
        }
        if (i < items.length - 1) line.insertBefore(document.createTextNode(' '), activeCursor);
      }
      removeCursor();
    }
    await sleep(CONFIG.lineDelay);
  }
  printEmptyLine();
}

async function cmdContacts() {
  await showSpinner(DATA.ui.loading + ' contacts...');
  printEmptyLine();
  for (const [label, value] of Object.entries(DATA.details.contacts)) {
    const isLink = value.startsWith('http');
    const isEmail = value.includes('@') && !isLink;
    const display = isLink ? value.replace(/^https?:\/\//, '') : value;
    let html;
    if (isLink) {
      html = '<a href="' + escapeHTML(value) + '" target="_blank" rel="noopener">' + escapeHTML(display) + '</a>';
    } else if (isEmail) {
      html = '<a href="mailto:' + escapeHTML(value) + '">' + escapeHTML(value) + '</a>';
    } else {
      html = '<span class="value">' + escapeHTML(value) + '</span>';
    }
    await printHTMLLine(
      '  <span class="label">' + escapeHTML(label) + ':</span>  ' + html,
      '', CONFIG.typeSpeed
    );
    await sleep(CONFIG.lineDelay);
  }
  printEmptyLine();
}

async function cmdProjects() {
  await showSpinner(DATA.ui.loading + ' projects...');
  const projects = DATA.details.projects || [];

  printEmptyLine();

  if (projects.length === 0) {
    await printHTMLLine(
      '  <span class="dim">' + escapeHTML(DATA.ui.projectsEmpty) + '</span>',
      '',
      CONFIG.fastTypeSpeed
    );
    printEmptyLine();
    return;
  }

  let html = '  <div class="projects-grid">';

  for (const project of projects) {
    const displayUrl = project.url.replace(/^https?:\/\//, '');
    html +=
      '<div class="project-tile">' +
      '<div class="project-title">' + escapeHTML(project.title) + '</div>' +
      '<div class="project-description">' + escapeHTML(project.description) + '</div>' +
      '<a class="project-link" href="' + escapeHTML(project.url) + '" target="_blank" rel="noopener">' +
      escapeHTML(DATA.ui.projectLink) + ' <span class="dim">→</span> ' + escapeHTML(displayUrl) +
      '</a>' +
      '</div>';
  }

  html += '</div>';
  printHTMLInstant(html);

  printEmptyLine();
}

async function cmdHelp() {
  printEmptyLine();
  await printLine('  ' + DATA.ui.available, 'dim', CONFIG.fastTypeSpeed);
  printEmptyLine();
  for (const [cmd, desc] of Object.entries(DATA.commands)) {
    await printHTMLLine(
      '  <span class="cmd-link" data-cmd="' + escapeHTML(cmd) + '">' + escapeHTML(cmd) + '</span>' +
      '<span class="dim">' + ' '.repeat(12 - cmd.length) + escapeHTML(desc) + '</span>',
      '', CONFIG.fastTypeSpeed
    );
    await sleep(CONFIG.lineDelay);
  }
  printEmptyLine();
}

async function cmdSkip() {
  SKIP = !SKIP;
  const status = SKIP ? 'ON' : 'OFF';
  await printHTMLLine(
    '  <span class="success">✔</span> <span class="dim">Skip animations: ' + status + '</span>',
    '', CONFIG.fastTypeSpeed
  );
  printEmptyLine();
}

async function cmdLang() {
  const newLang = LANG === 'en' ? 'ru' : 'en';
  const newData = await loadLang(newLang);

  // Show confirmation first in the current terminal
  await printHTMLLine(
    '  <span class="success">✔</span> <span class="dim">' + escapeHTML(newData.ui.langSwitched) + '</span>',
    '', CONFIG.fastTypeSpeed
  );
  removeCursor();
  printEmptyLine();

  // Show a new prompt line with blinking cursor before the snap
  const promptLine = createLine('prompt');
  const arrow = document.createElement('span');
  arrow.className = 'arrow';
  arrow.textContent = '❯';
  promptLine.appendChild(arrow);
  promptLine.appendChild(document.createTextNode(' '));
  addCursor(promptLine);

  // Brief pause before the magic
  await new Promise(r => setTimeout(r, 800));
  removeCursor();

  // Now apply the language switch
  LANG = newLang;
  DATA = newData;
  localStorage.setItem('cv-lang', LANG);

  const savedHistory = [...commandHistory];

  // Thanos snap: disintegrate old text into particles
  const dustParticles = await snapDisintegrate();

  // Render new language content + replay history (hidden, instant)
  terminal.innerHTML = '';
  window.__forceSkip = true;
  await renderBoot();
  // Replay previous commands
  for (const cmd of savedHistory) {
    removeInputPrompt();
    printHTMLInstant(
      '<span class="arrow">❯</span> <span class="dim">' + escapeHTML(cmd) + '</span>'
    );
    if (cmd === '/lang') {
      LANG = LANG === 'en' ? 'ru' : 'en';
      DATA = await loadLang(LANG);
      printHTMLInstant(
        '  <span class="success">✔</span> <span class="dim">' + escapeHTML(DATA.ui.langSwitched) + '</span>'
      );
      printEmptyLine();
    } else {
      await executeCommand(cmd);
    }
  }
  window.__forceSkip = false;

  // Materialize: particles converge into new text
  await snapMaterialize(dustParticles);

  // Re-enable input
  inputLocked = false;
  removeInputPrompt();
  createInputPrompt();
}

async function snapDisintegrate() {

  // Sample particles from current text
  const scattered = [];
  const lines = Array.from(terminal.querySelectorAll('.line'));

  for (const line of lines) {
    const rect = line.getBoundingClientRect();
    if (rect.height === 0) continue;
    const style = getComputedStyle(line);
    const color = style.color || '#c9d1d9';

    const spans = line.querySelectorAll('span, a');
    const sources = spans.length ? spans : [line];

    for (const src of sources) {
      const srcRect = src.getBoundingClientRect();
      if (srcRect.width < 1 || srcRect.height < 1) continue;
      const srcColor = getComputedStyle(src).color || color;
      const area = srcRect.width * srcRect.height;
      const count = Math.min(Math.ceil(area / 4), 250);

      for (let i = 0; i < count; i++) {
        const ox = srcRect.left + Math.random() * srcRect.width;
        const oy = srcRect.top + window.scrollY + Math.random() * srcRect.height;
        scattered.push({
          ox, oy,
          // Scattered end position (where dust drifts to)
          sx: ox + (Math.random() - 0.5) * 200,
          sy: oy - Math.random() * 120 - 40,
          size: 1 + Math.random() * 1.5,
          color: srcColor,
        });
      }
    }
  }

  // Animate disintegration
  const canvas = document.createElement('canvas');
  canvas.className = 'snap-canvas';
  canvas.width = window.innerWidth;
  canvas.height = Math.max(document.body.scrollHeight, window.innerHeight);
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  terminal.style.transition = 'opacity 0.4s';
  terminal.style.opacity = '0';

  const duration = 1200;
  await new Promise(resolve => {
    const start = performance.now();
    function frame(now) {
      const t = Math.min((now - start) / duration, 1);
      const ease = t * (2 - t); // easeOut
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of scattered) {
        const x = p.ox + (p.sx - p.ox) * ease;
        const y = p.oy + (p.sy - p.oy) * ease;
        const opacity = 1 - t * 0.6; // fade partially

        ctx.globalAlpha = opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(x, y - window.scrollY, p.size, p.size);
      }

      if (t < 1) requestAnimationFrame(frame);
      else { canvas.remove(); resolve(); }
    }
    requestAnimationFrame(frame);
  });

  terminal.style.transition = '';
  terminal.style.opacity = '1';

  return scattered;
}

function sampleTargetParticles() {
  const targets = [];
  const lines = Array.from(terminal.querySelectorAll('.line'));

  for (const line of lines) {
    const rect = line.getBoundingClientRect();
    if (rect.height === 0) continue;
    const style = getComputedStyle(line);
    const color = style.color || '#c9d1d9';

    const spans = line.querySelectorAll('span, a');
    const sources = spans.length ? spans : [line];

    for (const src of sources) {
      const srcRect = src.getBoundingClientRect();
      if (srcRect.width < 1 || srcRect.height < 1) continue;
      const srcColor = getComputedStyle(src).color || color;
      const area = srcRect.width * srcRect.height;
      const count = Math.min(Math.ceil(area / 4), 250);

      for (let i = 0; i < count; i++) {
        targets.push({
          tx: srcRect.left + Math.random() * srcRect.width,
          ty: srcRect.top + window.scrollY + Math.random() * srcRect.height,
          size: 1 + Math.random() * 1.5,
          color: srcColor,
        });
      }
    }
  }
  return targets;
}

async function snapMaterialize(dustParticles) {

  // Keep content invisible but layout-occupying for measurement
  terminal.style.visibility = 'hidden';
  terminal.style.opacity = '1';
  void terminal.offsetHeight;

  const targets = sampleTargetParticles();

  const canvas = document.createElement('canvas');
  canvas.className = 'snap-canvas';
  canvas.width = window.innerWidth;
  canvas.height = Math.max(document.body.scrollHeight, window.innerHeight);
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Build particle pairs: start from scattered dust, converge to target positions
  const count = Math.max(dustParticles.length, targets.length);
  const pairs = [];
  for (let i = 0; i < count; i++) {
    const dust = dustParticles[i % dustParticles.length];
    const target = targets[i % targets.length];
    pairs.push({
      // Start: scattered position from disintegrate
      sx: dust.sx + (Math.random() - 0.5) * 40,
      sy: dust.sy + (Math.random() - 0.5) * 40,
      // End: target text position
      tx: target.tx,
      ty: target.ty,
      size: target.size,
      color: target.color,
    });
  }

  const duration = 1000;
  await new Promise(resolve => {
    const start = performance.now();
    function frame(now) {
      const t = Math.min((now - start) / duration, 1);
      // easeInOut cubic
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of pairs) {
        const x = p.sx + (p.tx - p.sx) * ease;
        const y = p.sy + (p.ty - p.sy) * ease;
        const opacity = 0.4 + ease * 0.6;

        ctx.globalAlpha = opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(x, y - window.scrollY, p.size, p.size);
      }

      if (t < 1) requestAnimationFrame(frame);
      else {
        canvas.remove();
        terminal.style.visibility = 'visible';
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

async function cmdClear() {
  terminal.innerHTML = '';
  commandHistory = [];
  saveHistory();
  inputLocked = false;
  await renderBoot();
}

async function cmdUnknown(cmd) {
  await printHTMLLine(
    '<span class="keyword">  ' + escapeHTML(DATA.ui.unknown) + '</span> <span class="dim">' + escapeHTML(cmd) + '</span>',
    ''
  );
  await printHTMLLine(
    '  <span class="dim">' + escapeHTML(DATA.ui.unknownHint).replace('/help', '</span><span class="cmd-link" data-cmd="/help">/help</span><span class="dim">') + '</span>',
    '', CONFIG.fastTypeSpeed
  );
  printEmptyLine();
}

/* ── Boot Sequence ────────────────────────────────────── */
async function renderBoot() {
  // Greeting
  await printHTMLLine(
    '<span class="arrow">❯</span> <span class="dim">cv render --user ' + escapeHTML(DATA.user) + '</span>',
    'prompt', CONFIG.fastTypeSpeed
  );
  removeCursor();
  printEmptyLine();

  await showSpinner(DATA.ui.fetching);

  // One-line greeting
  await printLine('  ' + DATA.greeting, '', CONFIG.typeSpeed);
  printEmptyLine();

  // Summary lines
  await printHTMLLine(
    '  <span class="label">About:</span>    ' +
    '<span class="dim">' + escapeHTML(DATA.summary.about) + '</span>',
    '', CONFIG.fastTypeSpeed
  );
  await sleep(CONFIG.lineDelay);

  const role = DATA.details.role;
  await printHTMLLine(
    '  <span class="label">Role:</span>     ' +
    '<span class="highlight">' + escapeHTML(role.title) + '</span>' +
    '<span class="dim"> @ </span>' +
    '<span class="job-company">' + escapeHTML(role.company) + '</span>',
    '', CONFIG.fastTypeSpeed
  );
  await sleep(CONFIG.lineDelay);

  await printHTMLLine(
    '  <span class="label">Stack:</span>    ' +
    '<span class="dim">' + escapeHTML(DATA.summary.stack) + '</span>',
    '', CONFIG.fastTypeSpeed
  );
  await sleep(CONFIG.lineDelay);

  // Build clickable contact summary from details
  const contactParts = Object.entries(DATA.details.contacts).map(([label, value]) => {
    const isLink = value.startsWith('http');
    const display = label;
    return isLink
      ? '<a href="' + escapeHTML(value) + '" target="_blank" rel="noopener">' + escapeHTML(display) + '</a>'
      : '<a href="mailto:' + escapeHTML(value) + '">' + escapeHTML(value) + '</a>';
  });
  await printHTMLLine(
    '  <span class="label">Contact:</span>  ' + contactParts.join('<span class="dim"> · </span>'),
    '', CONFIG.fastTypeSpeed
  );
  printEmptyLine();

  // Help hint
  await printHTMLLine(
    '  <span class="success">Tip:</span> <span class="dim">' + escapeHTML(DATA.ui.tip) + ' </span><span class="cmd-link" data-cmd="/help">/help</span>',
    '', CONFIG.fastTypeSpeed
  );
  removeCursor();
  printEmptyLine();

  // Activate interactive prompt
  createInputPrompt();
}

async function boot() {
  try {
    // Detect language: localStorage > browser locale > default en
    const saved = localStorage.getItem('cv-lang');
    const browserLang = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
    LANG = saved || (browserLang.startsWith('ru') ? 'ru' : 'en');
    DATA = await loadLang(LANG);

    // If we have saved history, render boot + history instantly
    if (commandHistory.length > 0) {
      window.__forceSkip = true;
      await renderBoot();
      for (const cmd of commandHistory) {
        removeInputPrompt();
        printHTMLInstant(
          '<span class="arrow">❯</span> <span class="dim">' + escapeHTML(cmd) + '</span>'
        );
        if (cmd === '/lang') {
          LANG = LANG === 'en' ? 'ru' : 'en';
          DATA = await loadLang(LANG);
          printHTMLInstant(
            '  <span class="success">✔</span> <span class="dim">' + escapeHTML(DATA.ui.langSwitched) + '</span>'
          );
          printEmptyLine();
        } else {
          await executeCommand(cmd);
        }
      }
      window.__forceSkip = false;
      // Ensure interactive prompt is active after replay
      inputLocked = false;
      removeInputPrompt();
      createInputPrompt();
    } else {
      await renderBoot();
    }

  } catch (err) {
    const line = createLine('keyword');
    line.textContent = 'Error: ' + err.message;
  }
}

boot();
