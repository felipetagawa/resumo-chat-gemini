const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { el, createDocument } = require('./mini-dom');

function harness() {
  const document = createDocument(), handlers = {}, writes = [];
  const saved = { position: { x: 1100, y: 100 }, size: 'large', minimized: false };
  const window = { innerWidth: 1440, innerHeight: 900, addEventListener(type, fn) { handlers[type] = fn; }, removeEventListener() {} };
  const list = el('div', { class: 'chats-list' });
  list.getBoundingClientRect = () => ({ left: 48, right: 368 }); document.body.appendChild(list);
  const dock = el('div', { id: 'containerBotoesGemini' }); document.body.appendChild(dock);
  dock.getBoundingClientRect = () => ({ left: 1100, top: 100, width: (dock.getAttribute('data-minimized') === 'true' ? 72 : 188) * (Number(dock.style.zoom) || 1), height: 300 });
  const store = { atendeai_dock_preferences: structuredClone(saved) };
  const reply = { closed: 0, close() { this.closed++; dock.setAttribute('data-reply-open', 'false'); } };
  const context = { SmartReplyModule: reply, document, window, chrome: { runtime: {}, storage: { local: {
    get(keys, cb) { cb(structuredClone(store)); },
    set(data, cb) { Object.assign(store, structuredClone(data)); writes.push(data); cb(); }
  } } } };
  vm.createContext(context);
  const source = fs.readFileSync('content.js', 'utf8');
  vm.runInContext(source.slice(source.indexOf('async function initializeExtensionDock'), source.indexOf('function criarBotoesFlutuantes')), context);
  return { dock, window, handlers, writes, store, saved, reply, init: () => context.initializeExtensionDock(dock) };
}

test('narrow viewport compacts dock temporarily and retains saved size, position and minimization', async () => {
  const h = harness(); await h.init();
  h.window.innerWidth = 480; h.handlers.resize();
  assert.equal(h.dock.getAttribute('data-minimized'), 'true');
  assert.equal(h.dock.getAttribute('data-compact-viewport'), 'true');
  assert.deepEqual(h.store.atendeai_dock_preferences, h.saved); assert.equal(h.writes.length, 0);
  h.window.innerWidth = 1440; h.handlers.resize();
  assert.equal(h.dock.getAttribute('data-minimized'), 'false');
  assert.equal(h.dock.style.left, `${1100 / 1.15}px`); assert.equal(h.dock.style.zoom, '1.15');
  assert.deepEqual(h.store.atendeai_dock_preferences, h.saved);
});

test('all dock actions remain expandable on demand in compact viewport without persisting temporary state', async () => {
  const h = harness(); await h.init(); h.window.innerWidth = 480; h.handlers.resize();
  const toggle = h.dock.querySelector('.gemini-dock-toggle');
  assert.equal(toggle.getAttribute('aria-label'), 'Expandir ações do dock');
  await Promise.all(toggle.click()); assert.equal(h.dock.getAttribute('data-minimized'), 'false');
  await Promise.all(toggle.click()); assert.equal(h.dock.getAttribute('data-minimized'), 'true');
  assert.deepEqual(h.store.atendeai_dock_preferences, h.saved); assert.equal(h.writes.length, 0);
});

test('mudar tamanho, minimizar ou redimensionar não fecha a janela do Sugerir resposta', async () => {
  const h = harness(); await h.init();
  // Even a leftover attribute from the old in-dock card must not close the window.
  h.dock.setAttribute('data-reply-open', 'true');
  await Promise.all(h.dock.querySelector('.gemini-dock-size').click());
  await Promise.all(h.dock.querySelector('.gemini-dock-toggle').click());
  h.handlers.resize();
  assert.equal(h.reply.closed, 0, 'the reply window is fixed on the page, not inside the dock');
});

test('Consultar Docs é o botão do grupo e Sugerir resposta o link embaixo', () => {
  const src = fs.readFileSync('content.js', 'utf8');
  const group = src.slice(src.indexOf("replyGroup.className"), src.indexOf("container.appendChild(replyGroup)"));
  assert.ok(group.indexOf('appendChild(botaoDocs)') >= 0 && group.indexOf('appendChild(botaoDocs)') < group.indexOf('appendChild(botaoSmartReply)'));
  assert.match(src, /botaoDocs\.className \+= ' gemini-hero'/);
  assert.match(src, /botaoSmartReply\.className = 'gemini-preserved-link';/);
  assert.doesNotMatch(src, /botaoSmartReply\.className \+= ' gemini-hero/);
  assert.doesNotMatch(src, /data-reply-open/);
  const options = fs.readFileSync('options.js', 'utf8');
  assert.ok(options.indexOf('id: "btnConsultarDocsLoop", label: "Consultar Docs"') < options.indexOf('id: "btnSmartReply", label: "↳ Sugerir resposta"'));
});
