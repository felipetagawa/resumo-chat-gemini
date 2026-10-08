const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { MiniNode, createDocument, collect } = require('./mini-dom');

// Parse the small HTML templates used by the real MessagesModule and UIBuilder.
// CSS assertions here inspect declarations, not browser-computed styles.
class TemplateNode extends MiniNode {
  constructor(tag) {
    super(tag);
    this._style = {};
    Object.defineProperty(this, 'style', {
      get: () => this._style,
      set: value => { this._style = typeof value === 'string' ? { cssText: value } : value; }
    });
  }
  set innerHTML(html) {
    this.children = [];
    const stack = [this];
    for (const token of html.match(/<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith('</')) { stack.pop(); continue; }
      if (token.startsWith('<')) {
        const tag = token.match(/^<([\w-]+)/)?.[1];
        if (!tag) continue;
        const node = new TemplateNode(tag);
        for (const [, name, value] of token.matchAll(/([\w-]+)="([^"]*)"/g)) {
          node.setAttribute(name, value);
          if (name === 'style') node.style = value;
          if (name === 'value') node.value = value;
        }
        stack.at(-1).appendChild(node);
        if (!['input', 'br'].includes(tag)) stack.push(node);
      } else {
        stack.at(-1).textContent += token.trim();
        if (stack.at(-1).tagName === 'textarea') stack.at(-1).value += token.trim();
      }
    }
  }
  insertBefore(node, sibling) {
    node.parentElement = this;
    this.children.splice(this.children.indexOf(sibling), 0, node);
  }
  querySelector(selector) {
    if (selector === 'span:last-child') return this.querySelectorAll('span').at(-1);
    const attribute = selector.match(/^\[([\w-]+)="([^"]*)"\]$/);
    if (attribute) return collect(this).find(node => node.getAttribute(attribute[1]) === attribute[2]) || null;
    return super.querySelector(selector);
  }
  async fire(type) {
    const event = { target: this, stopPropagation() {} };
    await this[`on${type}`]?.(event);
    for (const fn of this.listeners[type] || []) await fn(event);
  }
  checkValidity() { return true; }
  reportValidity() {}
}

function harness({ sector = 'suporte', customMessages = ['Mensagem personalizada'], preference = 'dark' } = {}) {
  const document = createDocument();
  document.createElement = tag => new TemplateNode(tag);
  const store = { customMessages, messageShortcuts: { fixed_0: 'fixa', custom_0: 'minha' }, atendeai_user_sector: sector, atendeai_theme: preference };
  const media = { matches: true, addEventListener(type, fn) { this.listener = fn; } };
  const listeners = [], observers = [], copied = [], alerts = [];
  const context = {
    document, window: { matchMedia: () => media }, console,
    setTimeout: () => 0, Event: class {}, getComputedStyle: () => ({ visibility: 'visible' }),
    navigator: { clipboard: { writeText: text => copied.push(text) } },
    alert: text => alerts.push(text), confirm: () => true,
    MutationObserver: class { constructor(fn) { observers.push(fn); } observe() {} },
    chrome: { runtime: {}, storage: { local: { get(keys, fn) { fn(structuredClone(store)); } }, onChanged: { addListener(fn) { listeners.push(fn); } } } },
    StorageHelper: { get: async () => structuredClone(store), set: async data => Object.assign(store, structuredClone(data)) }
  };
  vm.createContext(context);
  for (const file of ['theme', 'ui-builder', 'messages']) vm.runInContext(fs.readFileSync(`modules/${file}.js`, 'utf8'), context);
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  return {
    ...context, store, media, copied, alerts, flush,
    async open() { await context.window.ThemeModule.init(); context.window.MessagesModule.toggleMensagens(); await flush(); return document.getElementById('popupMensagensPadrao'); },
    scan(node) { observers[0]([{ addedNodes: [node] }]); },
    change(value) { listeners[0]({ atendeai_theme: { newValue: value } }, 'local'); }
  };
}

test('rendered message cards and hover never override theme tokens with fixed colors', async () => {
  const h = harness(), popup = await h.open();
  const colors = /#[a-f\d]{3,8}\b|rgba?\(|\b(?:white|black)\b/i;
  for (const node of collect(popup)) {
    await node.fire?.('mouseenter'); await node.fire?.('mouseover');
    assert.doesNotMatch(Object.values(node.style).join(';'), colors);
    await node.fire?.('mouseleave'); await node.fire?.('mouseout');
    assert.doesNotMatch(Object.values(node.style).join(';'), colors);
  }
});

test('open popup and registration/edit forms follow Dark, Light and changing System', async () => {
  for (const preference of ['dark', 'light', 'system']) {
    const h = harness({ preference }), popup = await h.open();
    h.scan(popup);
    const expected = preference === 'light' ? 'light' : 'dark';
    assert.equal(popup.getAttribute('data-atendeai-theme'), expected);
    await popup.querySelector('#acordeon-custom').querySelector('button').fire('click');
    let modal = h.document.querySelector('.atendeai-modal-overlay');
    assert.equal(modal.getAttribute('data-atendeai-messages-form'), '');
    assert.equal(modal.getAttribute('data-atendeai-theme'), expected);
    h.change('light');
    assert.equal(popup.getAttribute('data-atendeai-theme'), 'light');
    assert.equal(modal.getAttribute('data-atendeai-theme'), 'light');
    h.change('system'); h.media.matches = false; h.media.listener();
    assert.equal(popup.getAttribute('data-atendeai-theme'), 'light');
    assert.equal(modal.getAttribute('data-atendeai-theme'), 'light');
    h.media.matches = true; h.media.listener();
    assert.equal(popup.getAttribute('data-atendeai-theme'), 'dark');
    assert.equal(modal.getAttribute('data-atendeai-theme'), 'dark');
    await modal.querySelector('#btnCancelModal').fire('click');
    await popup.querySelector('.btn-editar').fire('click');
    modal = h.document.querySelector('.atendeai-modal-overlay');
    assert.equal(modal.getAttribute('data-atendeai-messages-form'), '');
    assert.equal(modal.getAttribute('data-atendeai-theme'), 'dark');
  }
});

test('copy, composer insertion, shortcuts, CRUD, accordions and popup closing are preserved', async () => {
  const h = harness(), popup = await h.open();
  const copy = popup.querySelector('.btn-copiar'); await copy.fire('click');
  assert.equal(h.copied.length, 1); assert.ok(h.copied[0].includes('IBS'));
  const composer = new TemplateNode('textarea'); composer.id = 'twemoji-textarea';
  composer.offsetWidth = composer.offsetHeight = 100; composer.dispatchEvent = () => {};
  h.document.body.appendChild(composer);
  await popup.querySelector('.btn-enviar').fire('click');
  assert.equal(composer.value, h.copied[0]);
  const input = popup.querySelector('input'); input.value = 'novo'; await input.fire('change'); await h.flush();
  assert.equal(h.store.messageShortcuts.fixed_0, 'novo');
  let current = h.document.getElementById('popupMensagensPadrao');
  const accordion = current.querySelector('#acordeon-fixas');
  await accordion.children[0].fire('click'); assert.equal(accordion.children[1].style.maxHeight, '0');
  await accordion.children[0].fire('click'); assert.equal(accordion.children[1].style.maxHeight, 'none');
  await current.querySelector('#acordeon-custom').querySelector('button').fire('click');
  let modal = h.document.querySelector('.atendeai-modal-overlay');
  modal.querySelector('[name="shortcut"]').value = 'cadastro'; modal.querySelector('[name="message"]').value = 'Nova';
  await modal.querySelector('#btnSaveModal').fire('click'); await h.flush();
  assert.deepEqual(h.store.customMessages, ['Mensagem personalizada', 'Nova']);
  assert.equal(h.store.messageShortcuts.custom_1, 'cadastro');
  current = h.document.getElementById('popupMensagensPadrao'); await current.querySelector('.btn-editar').fire('click');
  modal = h.document.querySelector('.atendeai-modal-overlay');
  modal.querySelector('[name="shortcut"]').value = 'editada'; modal.querySelector('[name="message"]').value = 'Editada';
  await modal.querySelector('#btnSaveModal').fire('click'); await h.flush();
  assert.equal(h.store.customMessages[0], 'Editada'); assert.equal(h.store.messageShortcuts.custom_0, 'editada');
  current = h.document.getElementById('popupMensagensPadrao'); await current.querySelector('.btn-excluir').fire('click'); await h.flush();
  assert.deepEqual(h.store.customMessages, ['Nova']); assert.equal(h.store.messageShortcuts.custom_0, 'cadastro');
  current = h.document.getElementById('popupMensagensPadrao'); await current.querySelector('#fecharMensagensFlutuante').fire('click');
  assert.equal(h.document.getElementById('popupMensagensPadrao'), null);
});

test('pre-service keeps its fixed messages and hides custom messages', async () => {
  const h = harness({ sector: 'preatendimento' }), popup = await h.open();
  assert.equal(popup.querySelector('#acordeon-custom'), null);
  assert.equal(popup.querySelectorAll('.btn-copiar').length, 8);
});

test('popup constrains viewport geometry and has only one scrolling content area', () => {
  const css = fs.readFileSync('styles/modals.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = selector => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, group]) => group.trim() === selector).map(([, , body]) => body).join(';');
  const popup = rule('#popupMensagensPadrao');
  assert.match(popup, /max-height:\s*min\(600px,\s*calc\(100(?:d)?vh - min\(130px, 20vh\) - 16px\)\)/);
  assert.match(popup, /box-sizing:\s*border-box/);
  assert.match(popup, /width:\s*min\(450px,\s*calc\(100vw - 40px\)\)/);
  assert.match(rule('#popupMensagensPadrao .messages-header'), /flex-shrink:\s*0/);
  const content = rule('#popupMensagensPadrao #conteudoMensagens');
  assert.match(content, /min-height:\s*0/);
  assert.match(content, /overflow-y:\s*auto/);
  assert.doesNotMatch(popup, /overflow(?:-y)?:\s*(?:auto|scroll)/);
});
