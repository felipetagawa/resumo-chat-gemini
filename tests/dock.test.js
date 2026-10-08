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
  const context = { document, window, chrome: { runtime: {}, storage: { local: {
    get(keys, cb) { cb(structuredClone(store)); },
    set(data, cb) { Object.assign(store, structuredClone(data)); writes.push(data); cb(); }
  } } } };
  vm.createContext(context);
  const source = fs.readFileSync('content.js', 'utf8');
  vm.runInContext(source.slice(source.indexOf('async function initializeExtensionDock'), source.indexOf('function criarBotoesFlutuantes')), context);
  return { dock, window, handlers, writes, store, saved, init: () => context.initializeExtensionDock(dock) };
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
