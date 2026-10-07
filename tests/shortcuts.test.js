const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.value = '';
    this.selectionStart = 0;
    this.listeners = {};
    this.dataset = {};
    this._style = {};
    this.children = [];
  }
  set style(value) { this._style = typeof value === 'string' ? {} : value; }
  get style() { return this._style; }
  set innerHTML(value) {
    this.html = value;
    this.children = [...value.matchAll(/class="cmd-item" data-idx="(\d+)"/g)].map(([, idx]) => {
      const row = new Element('div'); row.dataset.idx = idx; return row;
    });
  }
  get innerHTML() { return this.html || ''; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  querySelectorAll() { return this.children; }
  querySelector(selector) { return this.children.find(row => selector.includes(`"${row.dataset.idx}"`)) || null; }
  matches() { return this.tagName === 'textarea'; }
  closest() { return null; }
  contains(node) { return this === node || this.children.includes(node); }
  getBoundingClientRect() { return { left: 20, top: 400, bottom: 450 }; }
  focus() {}
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  dispatchEvent() {}
}

async function loadShortcuts(shortcuts = ['2'], messages = shortcuts.map(s => `Mensagem ${s}`)) {
  const listeners = [];
  const body = { children: [], appendChild(node) { this.children.push(node); } };
  const document = { body, createElement: tag => new Element(tag),
    addEventListener(type, fn, capture) { listeners.push({ type, fn, capture }); } };
  let modalCount = 0;
  const UIBuilder = { criarModalFormulario() { modalCount++; } };
  const context = { document, Event: class { constructor(type) { this.type = type; } },
    window: { innerWidth: 900, addEventListener() {}, UIBuilder }, UIBuilder,
    console: { log() {}, warn() {}, error() {} },
    StorageHelper: { addListener() {}, async get() { return {
      atendeai_user_sector: 'suporte', customMessages: messages,
      messageShortcuts: Object.fromEntries(shortcuts.map((s, i) => [`custom_${i}`, s]))
    }; } } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('modules/shortcuts.js', 'utf8'), context);
  context.window.ShortcutsModule.init();
  await new Promise(setImmediate);
  const input = new Element('textarea');
  const dropdown = () => body.children.find(node => node.id === 'messageShortcutDropdown');
  async function type(text, caret = text.length) {
    input.value = text;
    input.selectionStart = caret;
    for (const l of listeners.filter(l => l.type === 'input')) await l.fn({ target: input });
  }
  function key(key, extra = {}) {
    const event = { key, target: input, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; },
      stopPropagation() { this.stopped = true; }, ...extra };
    let szCalls = 0;
    // A SZ target handler runs after document capture, before document bubble.
    for (const l of listeners.filter(l => l.type === 'keydown' && (l.capture === true || l.capture?.capture))) {
      l.fn(event); if (event.stopped) break;
    }
    if (!event.stopped) {
      szCalls++;
      for (const l of listeners.filter(l => l.type === 'keydown' && !l.capture)) l.fn(event);
    }
    return { ...event, szCalls };
  }
  async function keyup(key) {
    for (const l of listeners.filter(l => l.type === 'keyup')) await l.fn({ key, target: input });
  }
  function click(index) {
    const row = dropdown().children[index];
    for (const fn of row.listeners.pointerdown || []) fn({ preventDefault() {}, stopPropagation() {} });
  }
  return { input, dropdown, type, key, keyup, click, modalCount: () => modalCount };
}

test('/2 apenas filtra ao digitar; Espaco nao expande', async () => {
  const h = await loadShortcuts();
  await h.type('/2');
  assert.equal(h.input.value, '/2');
  assert.equal(h.dropdown().style.display, 'block');
  assert.equal(h.key(' ').prevented, false);
  await h.type('/2 ');
  assert.equal(h.input.value, '/2 ');
});

test('/2 + Enter insere o comando antes do handler SZ', async () => {
  const h = await loadShortcuts();
  await h.type('/2');
  const enter = h.key('Enter');
  assert.equal(h.input.value, 'Mensagem 2');
  assert.equal(enter.prevented, true);
  assert.equal(enter.szCalls, 0);
});

test('clique insere somente a query ativa preservando texto antes e depois', async () => {
  const h = await loadShortcuts();
  await h.type('Antes /2 depois', 8);
  h.click(0);
  assert.equal(h.input.value, 'Antes Mensagem 2 depois');
});

for (const text of ['06/10/2020', 'https://exemplo.com/2', 'www.exemplo.com/2', '/2020']) {
  test(`${text} nao executa /2 nem bloqueia Enter`, async () => {
    const h = await loadShortcuts();
    await h.type(text);
    if (text !== '/2020') assert.notEqual(h.dropdown()?.style.display, 'block');
    const enter = h.key('Enter');
    assert.equal(h.input.value, text);
    assert.equal(enter.prevented, false);
    assert.equal(enter.szCalls, 1);
    assert.equal(h.modalCount(), 0);
  });
}

test('/2 e /20 permitem continuar digitando; exato tem prioridade visual', async () => {
  const h = await loadShortcuts(['20', '2']);
  await h.type('/2');
  assert.equal(h.input.value, '/2');
  const labels = [...h.dropdown().innerHTML.matchAll(/\/(2|20)\s*<\/span>/g)].map(m => m[1]);
  assert.deepEqual(labels, ['2', '20']);
  await h.type('/20');
  assert.equal(h.input.value, '/20');
  h.key('Enter');
  assert.equal(h.input.value, 'Mensagem 20');
});

test('Enter em Cadastrar nao abre modal; clique continua criando', async () => {
  const h = await loadShortcuts();
  await h.type('/novo');
  assert.equal(h.key('Enter').prevented, false);
  assert.equal(h.modalCount(), 0);
  h.click(0);
  assert.equal(h.modalCount(), 1);
});

test('setas navegam comandos; Escape fecha sem reabrir no keyup', async () => {
  const h = await loadShortcuts(['2', '20']);
  await h.type('Texto\n/2');
  h.key('ArrowDown');
  await h.keyup('ArrowDown');
  h.key('Enter');
  assert.equal(h.input.value, 'Texto\nMensagem 20');
  await h.type('/2');
  h.key('ArrowDown');
  h.key('ArrowUp');
  h.key('Enter');
  assert.equal(h.input.value, 'Mensagem 2');
  await h.type('/2');
  h.key('Escape');
  await h.keyup('Escape');
  assert.equal(h.dropdown().style.display, 'none');
});

test('query alterada ou outro composer nao confirma uma selecao antiga', async () => {
  const h = await loadShortcuts(['2', '20']);
  await h.type('/2');
  h.input.value = '/2020'; h.input.selectionStart = 5;
  assert.equal(h.key('Enter').prevented, false);
  assert.equal(h.input.value, '/2020');
  await h.type('/2');
  assert.equal(h.key('Enter', { target: new Element('textarea') }).prevented, false);
  assert.equal(h.key('Enter', { isComposing: true }).prevented, false);
  assert.equal(h.key('Tab').prevented, false);
});

test('digitar uma data caractere por caractere nunca abre atalhos', async () => {
  const h = await loadShortcuts();
  const date = '06/10/2020';
  for (let end = 1; end <= date.length; end++) {
    await h.type(date.slice(0, end));
    assert.equal(h.input.value, date.slice(0, end));
    assert.notEqual(h.dropdown()?.style.display, 'block');
  }
});

test('Enter substitui somente a query antes do caret e Shift+Enter segue para SZ', async () => {
  const h = await loadShortcuts();
  await h.type('Antes /2 depois', 8);
  assert.equal(h.key('Enter', { shiftKey: true }).prevented, false);
  h.key('Enter');
  assert.equal(h.input.value, 'Antes Mensagem 2 depois');
});
