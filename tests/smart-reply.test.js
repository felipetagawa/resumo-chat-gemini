const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Node {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.listeners = {}; this.attrs = {};
    this.style = { width: '', height: '' }; this.value = ''; this.textContent = ''; this.hidden = false;
    this.offsetWidth = 200; this.offsetHeight = 50; this.events = [];
  }
  appendChild(n) { this.children.push(n); n.parent = this; return n; }
  setAttribute(k, v) { this.attrs[k] = v; this.onAttribute?.(this); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
  async emit(k, extra = {}) { for (const fn of this.listeners[k] || []) await fn({ target: this, preventDefault() {}, ...extra }); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); this.parent = null; }
  focus() { this.focused = true; }
  contains(n) { return n === this || this.children.some(child => child.contains(n)); }
  closest() { return null; }
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  dispatchEvent(event) { this.events.push(event.type); }
}
const all = n => [n, ...n.children.flatMap(all)];
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness(store = {}) {
  const body = new Node('body'), composer = new Node('textarea');
  const dock = new Node('div'); dock.id = 'containerBotoesGemini'; dock.offsetWidth = 188; dock.offsetHeight = 320;
  body.appendChild(dock);
  const live = { conversation: 'Gabriel: preciso de ajuda', complement: 'verificação em andamento', name: 'Gabriel',
    platform: 'webchat', time: '06/10/26 08:14', selfName: '', samples: [], inserted: null };
  const card = new Node();
  card.querySelector = selector => {
    if (selector === '.contact-name') return { textContent: live.name };
    if (selector.includes('phase=')) return { getAttribute: () => live.time, textContent: '08:14' };
    if (selector.includes('platform')) return { getAttribute: () => `/assets/img/platform/mini/${live.platform}.svg` };
    return null;
  };
  card.getAttribute = () => null;
  const listeners = {}, observers = [], sent = [], pendingMutations = [];
  let resolveReply, deferred = false, fail = false, messageSource, messageNodes = [];
  function replyMessages() {
    if (messageSource !== live.conversation) {
      messageSource = live.conversation;
      messageNodes = live.conversation.split('\n').filter(line => line.trim()).map(line => {
        const [, name, value] = line.trim().match(/^([^:]+):\s*([\s\S]*)$/);
        return { classList: { contains: cls => cls === 'sent' && name !== live.name },
          querySelector: selector => ({ innerText: selector === '.name' ? name : value }) };
      });
    }
    return messageNodes;
  }
  const document = { body, activeElement: null,
    createElement: tag => {
      const n = new Node(tag);
      n.onAttribute = target => { if (observers.some(o => o.observing && !o.disconnected)) pendingMutations.push({ target, type: 'attributes' }); };
      return n;
    },
    getElementById: id => all(body).find(n => n.id === id) || null,
    querySelector: sel => sel === '.sz_contact.active' ? card : null,
    querySelectorAll: sel => sel === '.msg' ? replyMessages() : sel === '.sz_contact.active' ? [card] : [composer],
    addEventListener(k, fn) { (listeners[k] ||= []).push(fn); },
    createRange() { return { selectNodeContents() {}, collapse() {} }; } };
  const context = { document, window: { getSelection: () => ({ removeAllRanges() {}, addRange() {} }) },
    chrome: { runtime: {}, storage: { local: {
      get(keys, cb) { cb(JSON.parse(JSON.stringify(store))); },
      set(data, cb) { Object.assign(store, JSON.parse(JSON.stringify(data))); cb?.(); },
      remove(keys, cb) { [].concat(keys).forEach(k => delete store[k]); cb?.(); } } } },
    getComputedStyle: () => ({ visibility: 'visible' }), HTMLTextAreaElement: Node,
    Event: class { constructor(type) { this.type = type; } },
    MutationObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() { this.observing = true; } disconnect() { this.disconnected = true; } },
    SmartReplyContextModule: { async sync() {}, getForCurrentChat: () => live.complement, onChanged: () => () => {} },
    StyleSamplesModule: { selfName: () => live.selfName, forRequest: () => live.samples, noteInserted: value => { live.inserted = value; } },
    RecoveryBufferModule: new Proxy({}, { get() { assert.fail('Recovery must not participate'); } }),
    MessagingHelper: { async send(payload) {
      sent.push(JSON.parse(JSON.stringify(payload)));
      if (fail) return { success: false, erro: 'Falha temporária' };
      if (deferred) return new Promise(resolve => { resolveReply = resolve; });
      return { success: true, reply: 'Pode informar o erro exibido?' };
    } } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('modules/chat-capture.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('modules/smart-reply.js', 'utf8'), context);
  const find = predicate => all(body).find(predicate);
  const byClass = cls => find(n => String(n.className || '').split(' ').includes(cls));
  return { module: context.window.SmartReplyModule, live, composer, dock, store, sent, byClass,
    panel: () => document.getElementById('atendeai-smart-reply'),
    button: label => find(n => n.tagName === 'button' && n.textContent === label),
    status: () => ['smart-reply-warning', 'smart-reply-status'].map(c => byClass(c)?.textContent || '').join(' ').trim(),
    defer() { deferred = true; }, respond(reply = 'Resposta tardia') { resolveReply({ success: true, reply }); },
    fail() { fail = true; }, succeed() { fail = false; },
    notify(records = [{ target: card }]) { observers.filter(o => !o.disconnected).forEach(o => o.fn(records)); },
    flushMutations() {
      let cycles = 0;
      while (pendingMutations.length) {
        assert.ok(++cycles <= 10, 'observer loop');
        const batch = pendingMutations.splice(0);
        observers.filter(o => !o.disconnected).forEach(o => o.fn(batch));
      }
    },
    escape() { (listeners.keydown || []).forEach(fn => fn({ key: 'Escape' })); } };
}

test('abre dentro do dock, gera uma vez com conversa rotulada e insere sem enviar', async () => {
  const h = harness(); await h.module.open();
  assert.equal(h.panel().parent, h.dock);
  assert.deepEqual(h.sent, [{ action: 'gerarResposta', conversation: 'Cliente (Gabriel): preciso de ajuda',
    promptComplement: 'verificação em andamento', regenerate: false }]);
  assert.equal(h.byClass('smart-reply-text').textContent, 'Pode informar o erro exibido?');
  assert.equal(h.composer.value, ''); assert.deepEqual(h.composer.events, []);
  await h.button('Inserir').emit('click');
  assert.equal(h.composer.value, 'Pode informar o erro exibido?');
  assert.deepEqual(h.composer.events, ['input']);
  assert.equal(h.live.inserted, 'Pode informar o erro exibido?');
  assert.equal(h.panel(), null);
});

test('o card congela o tamanho atual do dock, mesmo curto, e devolve ao fechar', async () => {
  const h = harness(); h.dock.offsetHeight = 140;
  await h.module.open();
  assert.equal(h.dock.style.width, '188px'); assert.equal(h.dock.style.height, '140px');
  assert.equal(h.dock.getAttribute('data-reply-open'), 'true');
  h.escape();
  assert.equal(h.panel(), null);
  assert.equal(h.dock.style.width, ''); assert.equal(h.dock.style.height, '');
  assert.equal(h.dock.getAttribute('data-reply-open'), null);
});

test('sem dock ou sem identidade segura não chama a API', async () => {
  const h = harness(); h.dock.remove(); await h.module.open();
  assert.equal(h.panel(), null); assert.equal(h.sent.length, 0);
  const h2 = harness(); h2.live.platform = ''; await h2.module.open();
  assert.equal(h2.sent.length, 0); assert.match(h2.status(), /Reabra a conversa/);
});

test('rotula Você e Outro técnico, envia amostras e o Direcionar com Enter', async () => {
  const h = harness();
  h.live.conversation = 'Gabriel: o XML não valida\nFelipe Okamoto: me manda o XML\nAna Suporte: já pedi antes';
  h.live.selfName = 'Felipe Okamoto'; h.live.samples = ['Opa, consegue me mandar um print?'];
  await h.module.open();
  assert.equal(h.sent[0].conversation, 'Cliente (Gabriel): o XML não valida\nVocê: me manda o XML\nOutro técnico: já pedi antes');
  assert.deepEqual(h.sent[0].styleSamples, ['Opa, consegue me mandar um print?']);
  const direct = h.byClass('smart-reply-direct'); direct.value = '  peça o XML e diga que vou verificar ';
  await direct.emit('keydown', { key: 'Enter' });
  assert.equal(h.sent[1].replyInstruction, 'peça o XML e diga que vou verificar');
  assert.equal(h.sent[1].regenerate, false);
  // A suggestion was on screen: Enter revises it, then the field is free for the next adjustment.
  assert.equal(h.sent[1].currentReply, 'Pode informar o erro exibido?');
  assert.equal(direct.value, '');
  await h.button('↻ Outra').emit('click');
  assert.equal(h.sent[2].regenerate, true);
  assert.equal(h.sent[2].currentReply, undefined);
});

test('a sugestão é editável e Inserir usa o texto editado', async () => {
  const h = harness();
  await h.module.open();
  const preview = h.byClass('smart-reply-text');
  assert.equal(preview.contentEditable, 'plaintext-only');
  assert.equal(h.byClass('smart-reply-direct').placeholder, 'Ajustar: mais curto, mais formal…');
  preview.textContent = 'Pode me mandar um print do erro?';
  await preview.emit('input');
  await h.button('Inserir').emit('click');
  assert.equal(h.composer.value, 'Pode me mandar um print do erro?');
  assert.equal(h.live.inserted, 'Pode me mandar um print do erro?');
});

test('ajustar envia o texto editado e uma falha não apaga o rascunho', async () => {
  const h = harness();
  await h.module.open();
  const preview = h.byClass('smart-reply-text'), direct = h.byClass('smart-reply-direct');
  preview.textContent = 'Consigo sim, me passa o AnyDesk do segundo PC?';
  await preview.emit('input');
  h.fail();
  direct.value = 'mais formal';
  await direct.emit('keydown', { key: 'Enter' });
  assert.deepEqual([h.sent[1].currentReply, h.sent[1].replyInstruction],
    ['Consigo sim, me passa o AnyDesk do segundo PC?', 'mais formal']);
  assert.equal(preview.textContent, 'Consigo sim, me passa o AnyDesk do segundo PC?');
  assert.equal(direct.value, 'mais formal', 'the instruction stays for a retry');
  assert.match(h.status(), /Falha temporária/);
});

test('sem sugestão na tela, Enter só direciona uma nova', async () => {
  const h = harness(); h.fail();
  await h.module.open();
  assert.equal(h.byClass('smart-reply-text').contentEditable, 'false');
  assert.equal(h.byClass('smart-reply-direct').placeholder, 'Direcionar: o que dizer?');
  h.succeed();
  const direct = h.byClass('smart-reply-direct'); direct.value = 'peça o XML';
  await direct.emit('keydown', { key: 'Enter' });
  assert.equal(h.sent[1].currentReply, undefined);
  assert.equal(h.sent[1].replyInstruction, 'peça o XML');
});

test('sem selfName as mensagens enviadas saem como Técnico e sem amostras', async () => {
  const h = harness(); h.live.conversation = 'Gabriel: oi\nFelipe Okamoto: bom dia';
  await h.module.open();
  assert.equal(h.sent[0].conversation, 'Cliente (Gabriel): oi\nTécnico: bom dia');
  assert.equal(Object.hasOwn(h.sent[0], 'styleSamples'), false);
});

test('troca de atendimento durante a geração descarta a resposta e trava as ações', async () => {
  const h = harness(); h.defer();
  const opening = h.module.open(); await tick();
  h.live.name = 'Outra Pessoa'; h.live.time = '06/10/26 09:00'; h.live.conversation = 'Outra Pessoa: oi'; h.notify();
  h.respond(); await opening;
  assert.equal(h.byClass('smart-reply-text').textContent, '');
  assert.equal(h.button('Inserir').disabled, true); assert.equal(h.button('↻ Outra').disabled, true);
  assert.match(h.status(), /atendimento mudou/);
  h.live.name = 'Gabriel'; h.live.time = '06/10/26 08:14'; h.live.conversation = 'Gabriel: preciso de ajuda'; h.notify();
  assert.equal(h.button('↻ Outra').disabled, true, 'identityChanged is sticky');
});

test('mensagem nova trava Inserir até ↻ Outra, que recaptura a conversa', async () => {
  const h = harness(); await h.module.open();
  h.live.conversation += '\nGabriel: e agora, como faço?'; h.notify();
  assert.equal(h.button('Inserir').disabled, true);
  assert.match(h.status(), /Mensagem nova/);
  assert.equal(h.button('↻ Outra').disabled, false);
  await h.button('↻ Outra').emit('click');
  assert.match(h.sent.at(-1).conversation, /e agora, como faço\?/);
  assert.equal(h.button('Inserir').disabled, false);
  assert.equal(h.status(), '');
});

test('rascunho existente pede escolha e Acrescentar preserva o texto do técnico', async () => {
  const h = harness(); h.composer.value = 'rascunho meu'; await h.module.open();
  await h.button('Inserir').emit('click');
  assert.equal(h.composer.value, 'rascunho meu');
  assert.equal(h.byClass('smart-reply-draft-choices').hidden, false);
  assert.equal(h.byClass('smart-reply-actions').hidden, true);
  await h.button('Cancelar').emit('click');
  assert.equal(h.byClass('smart-reply-actions').hidden, false);
  await h.button('Inserir').emit('click');
  await h.button('Acrescentar').emit('click');
  assert.equal(h.composer.value, 'rascunho meu\nPode informar o erro exibido?');
  assert.equal(h.panel(), null);
});

test('falha mostra o erro da API e ↻ Outra tenta de novo', async () => {
  const h = harness(); h.fail(); await h.module.open();
  assert.match(h.status(), /Falha temporária/);
  assert.equal(h.button('Inserir').disabled, true);
  h.succeed(); await h.button('↻ Outra').emit('click');
  assert.equal(h.byClass('smart-reply-text').textContent, 'Pode informar o erro exibido?');
  assert.equal(h.button('Inserir').disabled, false);
});

test('Ctrl+Enter insere pelo teclado', async () => {
  const h = harness(); await h.module.open();
  await h.panel().emit('keydown', { key: 'Enter', ctrlKey: true });
  assert.equal(h.composer.value, 'Pode informar o erro exibido?');
});

test('mutações do próprio card não geram loop nem segunda request', async () => {
  const h = harness(); await h.module.open(); h.flushMutations();
  assert.equal(h.sent.length, 1);
});

test('adendo vazio não vai no payload e o selo só aparece quando usado', async () => {
  const h = harness(); h.live.complement = ''; await h.module.open();
  assert.equal(Object.hasOwn(h.sent[0], 'promptComplement'), false);
  assert.equal(h.byClass('smart-reply-badge').hidden, true);
  const h2 = harness(); await h2.module.open();
  assert.equal(h2.byClass('smart-reply-badge').hidden, false);
});

test('retireLegacyProfiles apaga só as chaves de perfil antigas', () => {
  const store = { atendeai_smart_reply_profiles_v1: { version: 1, items: [] }, atendeai_smart_reply_profile: 'EMPATHETIC',
    customInstructions: 'LEGACY_NO_MIGRATION' };
  harness(store).module.retireLegacyProfiles();
  assert.deepEqual(Object.keys(store), ['customInstructions']);
});
