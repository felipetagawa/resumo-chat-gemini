const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { el, createDocument } = require('./mini-dom');

function themeHarness({ store = {}, dark = true } = {}) {
  const document = createDocument();
  const observers = [];
  const changeListeners = [];
  const media = {
    matches: dark,
    addEventListener(type, fn) { this.listener = fn; }
  };
  const context = {
    document,
    window: { matchMedia: () => media },
    console,
    MutationObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} disconnect() {} },
    chrome: {
      runtime: {},
      storage: {
        local: {
          get(keys, callback) { callback(structuredClone(store)); },
          set(data, callback) { Object.assign(store, structuredClone(data)); callback(); }
        },
        onChanged: { addListener(fn) { changeListeners.push(fn); } }
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('modules/theme.js', 'utf8'), context);
  return { document, store, context, media, changeListeners, observers, module: context.window.ThemeModule };
}

test('UX5: Dark é default sem storage anterior', async () => {
  const h = themeHarness();
  const dock = el('div', { id: 'containerBotoesGemini' });
  h.document.body.appendChild(dock);
  await h.module.init();
  h.module.apply(dock);
  assert.equal(h.module.preference(), 'dark');
  assert.equal(dock.getAttribute('data-atendeai-theme'), 'dark');
});

test('UX6: Light funciona', async () => {
  const h = themeHarness({ store: { atendeai_theme: 'light' } });
  const dock = el('div', { id: 'containerBotoesGemini' });
  h.document.body.appendChild(dock);
  await h.module.init();
  assert.equal(dock.getAttribute('data-atendeai-theme'), 'light');
});

test('UX7: System respeita prefers-color-scheme', async () => {
  const dark = themeHarness({ store: { atendeai_theme: 'system' }, dark: true });
  const light = themeHarness({ store: { atendeai_theme: 'system' }, dark: false });
  const dockDark = el('div', { id: 'containerBotoesGemini' });
  const dockLight = el('div', { id: 'containerBotoesGemini' });
  dark.document.body.appendChild(dockDark);
  light.document.body.appendChild(dockLight);
  await dark.module.init();
  await light.module.init();
  assert.equal(dockDark.getAttribute('data-atendeai-theme'), 'dark');
  assert.equal(dockLight.getAttribute('data-atendeai-theme'), 'light');
});

test('UX8: Tema não altera elemento nativo do SZ', async () => {
  const h = themeHarness();
  const dock = el('div', { id: 'containerBotoesGemini' });
  const sz = el('div', { class: 'sz_contact' });
  h.document.body.appendChild(dock);
  h.document.body.appendChild(sz);
  await h.module.init();
  h.module.apply();
  h.module.apply(sz);
  assert.equal(dock.getAttribute('data-atendeai-theme'), 'dark');
  assert.equal(sz.getAttribute('data-atendeai-theme'), null);
});
