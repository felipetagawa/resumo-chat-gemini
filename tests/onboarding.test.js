const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { MiniNode, createDocument } = require('./mini-dom');

// Parse the real onboarding template; Chrome storage is the external boundary.
class FormNode extends MiniNode {
  set innerHTML(html) {
    this.children = [];
    const stack = [this];
    for (const token of html.match(/<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith('</')) { stack.pop(); continue; }
      if (!token.startsWith('<')) { stack.at(-1).textContent += token.trim(); continue; }
      const tag = token.match(/^<([\w-]+)/)?.[1];
      if (!tag) continue;
      const node = new FormNode(tag);
      for (const [, key, value] of token.matchAll(/([\w-]+)="([^"]*)"/g)) {
        node.setAttribute(key, value);
        if (['value', 'name', 'type'].includes(key)) node[key] = value;
        if (key === 'style') node.style.cssText = value;
      }
      node.checked = /\schecked(?:\s|\/>)/.test(token);
      stack.at(-1).appendChild(node);
      if (!['input', 'br'].includes(tag)) stack.push(node);
    }
  }
  querySelector(selector) {
    if (selector.endsWith(':checked')) return this.querySelectorAll(selector.slice(0, -8)).find(n => n.checked) || null;
    return super.querySelector(selector);
  }
  async fire(type) { for (const fn of this.listeners[type] || []) await fn({ target: this }); }
}

function harness(saved = {}) {
  const document = createDocument();
  document.createElement = tag => new FormNode(tag);
  const store = structuredClone(saved), timers = new Map(), writes = [];
  let readError, writeError, thrownRead, thrownWrite, reads = 0, deferRead = false, pendingRead;
  const runtime = { id: 'extension-id' };
  const storage = {
    get(keys, callback) {
      reads++;
      if (thrownRead) throw new Error(thrownRead);
      if (deferRead) { pendingRead = () => callback(structuredClone(store)); return; }
      runtime.lastError = readError ? { message: readError } : undefined;
      callback(readError ? undefined : structuredClone(store));
      runtime.lastError = undefined;
    },
    set(data, callback) {
      if (thrownWrite) throw new Error(thrownWrite);
      runtime.lastError = writeError ? { message: writeError } : undefined;
      if (!writeError) { Object.assign(store, structuredClone(data)); writes.push(structuredClone(data)); }
      callback(); runtime.lastError = undefined;
    }
  };
  const noop = () => {};
  const context = {
    document, window: { location: { href: 'https://softeninformatica.sz.chat/user/agent' } },
    chrome: { runtime, storage: { local: storage } }, console: { log: noop, error: noop },
    localStorage: { getItem: () => null }, alert: noop,
    setTimeout: noop, setInterval(fn) { timers.set(1, fn); return 1; }, clearInterval(id) { timers.delete(id); },
    MessagingHelper: { addListener: noop },
    DOMHelpers: { removeElement: id => document.getElementById(id)?.remove() },
    ThemeModule: { init: async () => {}, apply: node => node.setAttribute('data-atendeai-theme', 'dark') },
    NotificationsModule: { init: noop, verificarNotificacoesChat: noop }
  };
  for (const name of ['ShortcutsModule', 'PreControlModule', 'ObservationsModule', 'RecoveryBufferModule']) context[name] = { init: noop };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('content.js', 'utf8'), context);
  // Dock features have their own tests; keep the entrypoint and onboarding real.
  context.criarBotoesFlutuantes = () => { const dock = document.createElement('div'); dock.id = 'containerBotoesGemini'; document.body.appendChild(dock); };
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  return {
    context, document, store, runtime, timers, writes,
    get reads() { return reads; },
    errorRead(message, thrown = false) { if (thrown) thrownRead = message; else readError = message; },
    errorWrite(message, thrown = false) { if (thrown) thrownWrite = message; else writeError = message; },
    delayRead() { deferRead = true; },
    releaseRead() { deferRead = false; pendingRead(); },
    async tick() { await context.checkAndInit(); await flush(); },
    async save(name = 'tecnico@example.com', sector = 'suporte') {
      document.getElementById('onboarding-name-input').value = name;
      for (const radio of document.querySelectorAll('input[name="onboarding-sector"]')) radio.checked = radio.value === sector;
      await document.getElementById('onboarding-save-btn').fire('click'); await flush();
    }
  };
}

const valid = { atendeai_user_name: 'Ana', atendeai_user_sector: 'suporte' };
test('first access saves an email login and closes only after confirmed persistence', async () => {
  const h = harness(); await h.tick();
  assert.ok(h.document.getElementById('atendeai-onboarding-overlay'));
  await h.save();
  assert.equal(h.store.atendeai_user_name, 'tecnico@example.com');
  assert.equal(h.store.atendeai_user_sector, 'suporte');
  assert.equal(h.store.atendeai_visibility.btnResumoGemini, true);
  assert.equal(h.document.getElementById('atendeai-onboarding-overlay'), null);
  assert.ok(h.document.getElementById('containerBotoesGemini'));
});
test('configured user and fresh page after manual reload never open onboarding or rewrite data', async () => {
  for (const sector of ['suporte', 'preatendimento', 'lider']) {
    const h = harness({ ...valid, atendeai_user_sector: sector }); await h.tick(); await h.tick();
    assert.equal(h.document.getElementById('atendeai-onboarding-overlay'), null);
    assert.ok(h.document.getElementById('containerBotoesGemini')); assert.equal(h.writes.length, 0);
  }
});
test('callback storage errors and synchronous read errors do not become missing configuration', async () => {
  for (const thrown of [false, true]) {
    const h = harness(valid); h.errorRead('Storage unavailable', thrown); await h.tick();
    assert.equal(h.document.getElementById('atendeai-onboarding-overlay'), null);
    assert.equal(h.writes.length, 0);
    let ran = false; await h.context.guardFeature(() => { ran = true; })();
    assert.equal(ran, false); assert.equal(h.document.getElementById('atendeai-config-modal-overlay'), null);
  }
});
test('invalid context stops polling and emits one nonblocking notice, including after onboarding opened', async () => {
  for (const mode of ['missing-id', 'throw', 'callback']) {
    const h = harness(); await h.tick();
    if (mode === 'missing-id') h.runtime.id = undefined;
    else h.errorRead('Extension context invalidated.', mode === 'throw');
    await h.tick(); const reads = h.reads;
    await h.tick(); await h.tick();
    assert.equal(h.reads, reads); assert.equal(h.timers.size, 0);
    assert.equal(h.document.getElementById('atendeai-onboarding-overlay'), null);
    assert.equal(h.document.querySelectorAll('#atendeai-context-notice').length, 1);
    assert.match(h.document.getElementById('atendeai-context-notice').textContent, /Recarregue/);
    assert.deepEqual(h.store, {});
  }
});
test('save error leaves onboarding open with visible feedback and no false success', async () => {
  for (const thrown of [false, true]) {
    const h = harness(); await h.tick(); h.errorWrite('Storage write failed', thrown); await h.save();
    assert.ok(h.document.getElementById('atendeai-onboarding-overlay'));
    assert.match(h.document.getElementById('onboarding-save-error')?.textContent || '', /salvar/i);
    assert.equal(h.document.getElementById('onboarding-save-btn').disabled, false);
    assert.deepEqual(h.store, {});
  }
});
test('invalid context while saving unblocks SZ without writing configuration', async () => {
  for (const thrown of [false, true]) {
    const h = harness(); await h.tick(); h.errorWrite('Extension context invalidated.', thrown); await h.save();
    assert.deepEqual(h.store, {});
    assert.equal(h.document.getElementById('atendeai-onboarding-overlay'), null);
    assert.ok(h.document.getElementById('atendeai-context-notice'));
  }
});
test('configuration saved elsewhere while onboarding is open is not overwritten', async () => {
  const h = harness(); await h.tick(); Object.assign(h.store, valid); await h.save('Outra pessoa');
  assert.deepEqual(h.store, valid); assert.equal(h.writes.length, 0);
  assert.equal(h.document.getElementById('atendeai-onboarding-overlay'), null);
});
test('first access preserves existing visibility preferences', async () => {
  const h = harness({ atendeai_visibility: { btnAgenda: false } }); await h.tick(); await h.save();
  assert.deepEqual(h.store.atendeai_visibility, { btnAgenda: false });
});

test('context invalidated during a pending read cannot open onboarding with a stale result', async () => {
  const h = harness(); h.delayRead(); const tick = h.tick();
  h.runtime.id = undefined; h.releaseRead(); await tick;
  assert.equal(h.document.getElementById('atendeai-onboarding-overlay'), null);
  assert.ok(h.document.getElementById('atendeai-context-notice'));
  assert.equal(h.timers.size, 0);
});

test('poll detects invalidation even while a storage callback is still pending', async () => {
  const h = harness(); h.delayRead(); const pending = h.tick();
  h.runtime.id = undefined; await h.tick();
  assert.equal(h.timers.size, 0);
  assert.ok(h.document.getElementById('atendeai-context-notice'));
  h.releaseRead(); await pending;
  assert.equal(h.document.getElementById('atendeai-onboarding-overlay'), null);
});

test('pending checks do not overlap and leaving SZ before completion never opens onboarding', async () => {
  const h = harness(); h.delayRead(); const pending = h.tick();
  await h.tick(); assert.equal(h.reads, 1);
  h.context.window.location.href = 'https://softeninformatica.sz.chat/elsewhere';
  h.releaseRead(); await pending;
  assert.equal(h.document.getElementById('atendeai-onboarding-overlay'), null);
});

test('manual reload with saved configuration restores operation after invalidation', async () => {
  const oldPage = harness(valid); await oldPage.tick(); oldPage.runtime.id = undefined; await oldPage.tick();
  assert.ok(oldPage.document.getElementById('atendeai-context-notice'));
  const reloaded = harness(oldPage.store); await reloaded.tick();
  assert.ok(reloaded.document.getElementById('containerBotoesGemini'));
  assert.equal(reloaded.document.getElementById('atendeai-onboarding-overlay'), null);
  assert.equal(reloaded.document.getElementById('atendeai-context-notice'), null);
  assert.deepEqual(reloaded.store, valid);
});

test('pre-service first access preserves its visibility defaults', async () => {
  const h = harness(); await h.tick(); await h.save('Ana', 'preatendimento');
  assert.equal(h.store.atendeai_user_sector, 'preatendimento');
  assert.equal(h.store.atendeai_visibility.btnResumoGemini, false);
  assert.equal(h.store.atendeai_visibility.btnProductClassifier, true);
});

test('leader onboarding still requires the existing password before persisting', async () => {
  const h = harness(); await h.tick(); await h.save('Ana', 'lider');
  assert.equal(h.writes.length, 0);
  assert.match(h.document.getElementById('leader-pass-hint').textContent, /obrigatória/);
  h.document.getElementById('leader-pass-input').value = 'incorreta'; await h.save('Ana', 'lider');
  assert.equal(h.writes.length, 0);
  assert.match(h.document.getElementById('leader-pass-hint').textContent, /incorreta/);
  h.document.getElementById('leader-pass-input').value = 'SoftengerenciamentoJB-BR'; await h.save('Ana', 'lider');
  assert.equal(h.store.atendeai_user_sector, 'lider');
  assert.equal(h.document.getElementById('atendeai-onboarding-overlay'), null);
});

test('onboarding surfaces and fields explicitly follow theme tokens including autofill', () => {
  const source = fs.readFileSync('content.js', 'utf8');
  const css = fs.readFileSync('styles/modals.css', 'utf8');
  assert.match(source, /background: var\(--ai-surface\)/);
  for (const state of ['', '::placeholder', ':focus', ':-webkit-autofill']) {
    assert.ok(css.includes(`#atendeai-onboarding-overlay input${state}`), state);
  }
  assert.match(css, /-webkit-text-fill-color:\s*var\(--ai-text\)/);
});
