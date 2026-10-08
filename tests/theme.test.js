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

test('late message popup and shared form roots update live without touching SZ or their contents', async () => {
  const h = themeHarness({ store: { atendeai_theme: 'system' }, dark: false });
  const native = el('div', { class: 'sz_contact' }); h.document.body.appendChild(native);
  await h.module.init();
  const popup = el('div', { id: 'popupMensagensPadrao' });
  const input = el('input'); input.value = 'rascunho'; popup.appendChild(input);
  const modal = el('div', { class: 'modal-overlay atendeai-modal-overlay', 'data-atendeai-messages-form': '' });
  h.document.body.appendChild(popup); h.document.body.appendChild(modal);
  h.observers[0].fn([{ addedNodes: [popup, modal] }]);
  for (const root of [popup, modal]) assert.equal(root.getAttribute('data-atendeai-theme'), 'light');
  h.media.matches = true; h.media.listener();
  for (const root of [popup, modal]) assert.equal(root.getAttribute('data-atendeai-theme'), 'dark');
  h.changeListeners[0]({ atendeai_theme: { newValue: 'light' } }, 'local');
  h.media.listener();
  for (const root of [popup, modal]) assert.equal(root.getAttribute('data-atendeai-theme'), 'light');
  assert.equal(input.value, 'rascunho');
  assert.equal(native.getAttribute('data-atendeai-theme'), null);
});

test('dock status follows light, dark and system without painting native cards', async () => {
  for (const preference of ['light', 'dark', 'system']) {
    const h = themeHarness({ store: { atendeai_theme: preference }, dark: true });
    const sz = el('div', { class: 'sz_contact' });
    const pill = el('span', { class: 'atendeai-focus-status atendeai-focus-pill' });
    const dock = el('div', { id: 'containerBotoesGemini' }); dock.appendChild(pill); h.document.body.appendChild(dock); h.document.body.appendChild(sz);
    await h.module.init();
    assert.equal(dock.getAttribute('data-atendeai-theme'), preference === 'light' ? 'light' : 'dark');
    assert.equal(sz.getAttribute('data-atendeai-theme'), null);
    if (preference === 'system') {
      h.media.matches = false; h.media.listener();
      assert.equal(dock.getAttribute('data-atendeai-theme'), 'light');
    }
    const inserted = el('section', { class: 'smart-reply-preview' });
    h.document.body.appendChild(inserted);
    h.observers[0].fn([{ addedNodes: [inserted] }]);
    assert.equal(inserted.getAttribute('data-atendeai-theme'), dock.getAttribute('data-atendeai-theme'));
    assert.equal(sz.getAttribute('data-atendeai-theme'), null);
  }
});

test('every exclusive theme root declares its own light and dark token scope', async () => {
  const css = fs.readFileSync('styles/tokens.css', 'utf8');
  for (const preference of ['dark', 'light', 'system']) {
    const h = themeHarness({ store: { atendeai_theme: preference } });
    const source = fs.readFileSync('modules/theme.js', 'utf8');
    const ids = [...source.match(/const ROOT_IDS = Object.freeze\(\[([\s\S]*?)\]\)/)[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
    const classes = [...source.match(/const ROOT_CLASSES = Object.freeze\(\[([\s\S]*?)\]\)/)[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
    for (const [prefix, names] of [['#', ids], ['.', classes]]) {
      for (const name of names) {
        const node = el('div', prefix === '#' ? { id: name } : { class: name });
        h.document.body.appendChild(node);
        assert.ok(css.includes(`${prefix}${name}[data-atendeai-theme="dark"]`), name);
      }
    }
    await h.module.init();
    for (const node of h.document.body.children) assert.equal(node.getAttribute('data-atendeai-theme'), preference === 'light' ? 'light' : 'dark');
    if (preference === 'system') {
      h.media.matches = false; h.media.listener();
      for (const node of h.document.body.children) assert.equal(node.getAttribute('data-atendeai-theme'), 'light');
    }
  }
});

test('text, placeholder and semantic button token pairs have normal-text contrast in both themes', () => {
  const css = fs.readFileSync('styles/tokens.css', 'utf8');
  const blocks = [...css.matchAll(/\{([^{}]*--ai-bg:[^{}]*)\}/g)].map(m => m[1]);
  function luminance(hex) {
    const rgb = hex.match(/[a-f\d]{2}/gi).map(n => parseInt(n, 16) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  }
  const light = Object.fromEntries([...blocks[0].matchAll(/(--ai-[\w-]+):\s*(#[a-f\d]{6})/gi)].map(m => [m[1], m[2]]));
  const dark = { ...light, ...Object.fromEntries([...blocks[1].matchAll(/(--ai-[\w-]+):\s*(#[a-f\d]{6})/gi)].map(m => [m[1], m[2]])) };
  for (const [theme, tokens] of [['light', light], ['dark', dark]]) {
    const pairs = [];
    for (const fg of ['text', 'text-secondary', 'text-muted']) for (const bg of ['bg', 'surface', 'surface-muted', 'surface-hover']) pairs.push([fg, bg]);
    for (const state of ['primary', 'primary-hover', 'primary-active']) pairs.push(['on-primary', state]);
    for (const state of ['primary', 'success', 'warning', 'danger']) pairs.push([state, `${state}-soft`]);
    for (const [fg, bg] of pairs) {
      assert.ok(tokens[`--ai-${fg}`], fg);
      const a = luminance(tokens[`--ai-${fg}`]), b = luminance(tokens[`--ai-${bg}`]);
      assert.ok((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5, `${theme}: ${fg} on ${bg}`);
    }
  }
});
