const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Node {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.listeners = {}; this.attrs = {};
    this.style = {}; this.value = ''; this.textContent = ''; this.hidden = false;
    this.offsetWidth = 200; this.offsetHeight = 50; this.events = [];
  }
  appendChild(n) { this.children.push(n); n.parent = this; return n; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k] || null; }
  addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
  async emit(k) { for (const fn of this.listeners[k] || []) await fn({ target: this }); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); }
  focus() { this.focused = true; }
  closest() { return null; }
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  dispatchEvent(event) { this.events.push(event.type); }
}
const all = n => [n, ...n.children.flatMap(all)];
function harness(store = {}) {
  const body = new Node('body'), composer = new Node('textarea');
  const live = { conversation: 'Gabriel: preciso de ajuda', complement: 'verificação em andamento', name: 'Gabriel', platform: 'webchat', time: '06/10/26 08:14', explicit: '', messages: [] };
  const card = new Node();
  card.querySelector = selector => {
    if (selector === '.contact-name') return { textContent: live.name };
    if (selector.includes('phase=')) return { getAttribute: () => live.time, textContent: '08:14' };
    if (selector.includes('platform')) return { getAttribute: () => `/assets/img/platform/mini/${live.platform}.svg` };
    return null;
  };
  card.getAttribute = attr => attr === 'data-chat-id' ? live.explicit : null;
  const listeners = {}, observers = [], sent = [];
  let resolveReply, rejectReply;
  let deferred = false, fail = false;
  const document = { body, createElement: tag => new Node(tag),
    getElementById: id => all(body).find(n => n.id === id) || null,
    querySelector: sel => sel === '.sz_contact.active' ? card : null,
    querySelectorAll: sel => sel === '.msg' ? live.messages : [composer],
    addEventListener(k, fn) { (listeners[k] ||= []).push(fn); },
    createRange() { return { selectNodeContents() {}, collapse() {} }; }
  };
  const context = { document, window: { getSelection: () => ({ removeAllRanges() {}, addRange() {} }) },
    getComputedStyle: () => ({ visibility: 'visible' }), HTMLTextAreaElement: Node,
    Event: class { constructor(type) { this.type = type; } },
    MutationObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
    StorageHelper: { async get() { return store; }, async set(data) { Object.assign(store, data); } },
    ChatCaptureModule: { capturarTextoChat: () => live.conversation },
    ObservationsModule: { getPromptComplementForCurrentChat: () => live.complement,
      getCurrentObservationSnapshot() { assert.fail('private-note snapshot must never be read'); } },
    RecoveryBufferModule: new Proxy({}, { get() { assert.fail('Recovery must not participate'); } }),
    MessagingHelper: { async send(payload) {
      sent.push(JSON.parse(JSON.stringify(payload)));
      if (fail) throw new Error('Falha temporária');
      if (deferred) return new Promise((resolve, reject) => { resolveReply = resolve; rejectReply = reject; });
      return { success: true, reply: 'Pode informar o erro exibido?' };
    } }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('modules/smart-reply.js', 'utf8'), context);
  const panel = () => document.getElementById('atendeai-smart-reply');
  const button = label => all(body).find(n => n.tagName === 'button' && n.textContent === label);
  const profile = () => all(body).find(n => n.tagName === 'select');
  const status = () => all(body).filter(n => /smart-reply-(status|warning)/.test(n.className)).map(n => n.textContent).join(' ');
  return { module: context.window.SmartReplyModule, document, live, composer, store, sent, panel, button, profile, status,
    defer() { deferred = true; }, respond() { resolveReply({ success: true, reply: 'Resposta de Gabriel' }); },
    normal() { deferred = false; },
    fail() { fail = true; }, succeed() { fail = false; },
    notify() { observers.filter(o => !o.disconnected).forEach(o => o.fn()); },
    escape() { (listeners.keydown || []).forEach(fn => fn({ key: 'Escape' })); }
  };
}

test('E1/E7/E8: gera um preview e insere no composer vazio sem enviar ou ler notas/recovery', async () => {
  const h = harness(); await h.module.open();
  assert.deepEqual(h.sent, [{ action: 'gerarResposta', conversation: 'Gabriel: preciso de ajuda',
    promptComplement: 'verificação em andamento', profile: 'DIRECT', regenerate: false }]);
  assert.equal(h.composer.value, ''); assert.deepEqual(h.composer.events, []);
  await h.button('Inserir').emit('click');
  assert.equal(h.composer.value, 'Pode informar o erro exibido?');
  assert.deepEqual(h.composer.events, ['input']); assert.equal(h.panel(), null);
});

test('E2/E3/E4: regeneracao usa snapshot original, perfil escolhido persiste sem chamada automatica', async () => {
  const h = harness(); await h.module.open();
  const options = h.profile().children.map(n => n.value);
  assert.deepEqual(options, ['DIRECT', 'EMPATHETIC', 'DIDACTIC']);
  h.live.conversation = 'Gabriel: nova mensagem'; h.live.complement = 'outra observação';
  for (const profile of ['EMPATHETIC', 'DIDACTIC']) {
    const before = h.sent.length;
    h.profile().value = profile; await h.profile().emit('change');
    assert.equal(h.sent.length, before); assert.equal(h.button('Inserir').disabled, true);
    await h.button('↻ Outra resposta').emit('click');
    assert.equal(h.sent.at(-1).conversation, h.sent[0].conversation);
    assert.equal(h.sent.at(-1).promptComplement, h.sent[0].promptComplement);
    assert.equal(h.sent.at(-1).profile, profile); assert.equal(h.sent.at(-1).regenerate, true);
  }
  const next = harness(h.store); await next.module.open();
  assert.equal(next.sent[0].profile, 'DIDACTIC');
});

test('E5: troca de chat antes da resposta mostra aviso e bloqueia insercao e regeneracao', async () => {
  const h = harness(); h.defer(); const pending = h.module.open();
  await new Promise(setImmediate);
  h.live.name = 'Maria'; h.notify(); h.respond(); await pending;
  assert.match(h.status(), /atendimento ativo mudou/);
  await h.button('Inserir').emit('click'); await h.button('↻ Outra resposta').emit('click');
  assert.equal(h.sent.length, 1); assert.equal(h.composer.value, '');
  h.live.name = 'Gabriel'; h.notify();
  await h.button('Inserir').emit('click'); assert.equal(h.composer.value, 'Resposta de Gabriel');
});

for (const key of ['time', 'platform', 'explicit']) test(`token impede insercao se ${key} do atendimento mudou`, async () => {
  const h = harness(); await h.module.open(); h.live[key] = 'outro';
  await h.button('Inserir').emit('click'); assert.equal(h.composer.value, '');
});

for (const [choice, expected] of [['Substituir', 'Pode informar o erro exibido?'], ['Acrescentar', 'meu rascunho\nPode informar o erro exibido?'], ['Cancelar', 'meu rascunho']]) {
  test(`E6: rascunho existente exige escolha ${choice}`, async () => {
    const h = harness(); h.composer.value = 'meu rascunho'; await h.module.open();
    await h.button('Inserir').emit('click'); assert.equal(h.composer.value, 'meu rascunho');
    await h.button(choice).emit('click'); assert.equal(h.composer.value, expected);
  });
}

test('confirmacao pendente revalida chat e rascunho editado', async () => {
  const h = harness(); h.composer.value = 'rascunho'; await h.module.open();
  await h.button('Inserir').emit('click'); h.composer.value = 'rascunho novo';
  await h.button('Substituir').emit('click'); assert.equal(h.composer.value, 'rascunho novo');
  h.live.name = 'Maria'; await h.button('Acrescentar').emit('click');
  assert.equal(h.composer.value, 'rascunho novo');
});

test('E9: sem transcript ou identidade segura nao chama API', async () => {
  for (const missing of ['conversation', 'time']) {
    const h = harness(); h.live[missing] = ''; await h.module.open();
    assert.equal(h.sent.length, 0); assert.equal(h.button('Inserir').disabled, true);
    assert.ok(h.status().length > 0);
  }
});

test('falha nao perde rascunho, permite retry manual; fechar cancela resposta tardia', async () => {
  const h = harness(); h.composer.value = 'não perder'; h.fail(); await h.module.open();
  assert.match(h.status(), /Falha temporária/); assert.equal(h.composer.value, 'não perder');
  h.succeed(); await h.button('↻ Outra resposta').emit('click'); assert.equal(h.sent.length, 2);
  h.defer(); const pending = h.button('↻ Outra resposta').emit('click'); await new Promise(setImmediate);
  h.escape(); h.respond(); await pending; assert.equal(h.panel(), null); assert.equal(h.composer.value, 'não perder');
});

test('contexto longo preserva inicio, fim e ultima fala do cliente em uma chamada', async () => {
  const h = harness();
  h.live.conversation = 'INICIO\n' + 'x'.repeat(5000) + '\nGabriel: ÚLTIMA FALA DO CLIENTE\n' + 'Técnico: '.repeat(5000) + '\nRECENTE';
  h.live.messages = [{ classList: { contains: () => false }, querySelector: s => ({ innerText: s === '.name' ? 'Gabriel' : 'ÚLTIMA FALA DO CLIENTE' }) }];
  await h.module.open(); const conversation = h.sent[0].conversation;
  assert.ok(conversation.length <= 16000); assert.ok(conversation.startsWith('INICIO'));
  assert.ok(conversation.endsWith('RECENTE')); assert.ok(conversation.includes('ÚLTIMA FALA DO CLIENTE'));
  assert.equal(h.sent.length, 1);
});

test('contenteditable recebe apenas input; composer ausente nao altera draft', async () => {
  const h = harness(); h.composer.isContentEditable = true; await h.module.open();
  await h.button('Inserir').emit('click'); assert.equal(h.composer.textContent, 'Pode informar o erro exibido?');
  assert.deepEqual(h.composer.events, ['input']);
  const absent = harness(); absent.composer.offsetWidth = 0; await absent.module.open();
  await absent.button('Inserir').emit('click'); assert.equal(absent.composer.value, '');
  assert.match(absent.status(), /campo de mensagem/);
});

test('configuracoes carregam e salvam somente o perfil default aceito', async () => {
  const source = fs.readFileSync('options.js', 'utf8');
  const start = source.indexOf('    const base = await storageGet(["customInstructions"');
  const end = source.indexOf('    renderHistory(base.history', start);
  const profile = new Node('select');
  const store = { atendeai_smart_reply_profile: 'EMPATHETIC', privateNote: 'segredo' };
  const context = { el: { smartReplyProfile: profile },
    storageGet: async () => store, storageSet: async data => Object.assign(store, data) };
  vm.createContext(context);
  await vm.runInContext(`(async () => { ${source.slice(start, end)} })()`, context);
  assert.equal(profile.value, 'EMPATHETIC');
  profile.value = 'DIDACTIC'; await profile.emit('change');
  const h = harness(store); await h.module.open();
  assert.equal(h.sent[0].profile, 'DIDACTIC');
  assert.equal(store.privateNote, 'segredo');
  profile.value = 'JEV'; await profile.emit('change');
  assert.equal(store.atendeai_smart_reply_profile, 'DIDACTIC');
});

test('duas geracoes sobrepostas nao retargetam resposta tardia ao novo preview', async () => {
  const h = harness(); h.defer(); const first = h.module.open(); await new Promise(setImmediate);
  h.live.name = 'Maria';
  h.live.conversation = 'Maria: ajuda';
  h.normal(); await h.module.open();
  h.respond(); await first;
  const preview = all(h.document.body).find(n => n.className === 'smart-reply-text');
  assert.equal(preview.textContent, 'Pode informar o erro exibido?');
  assert.equal(h.sent.length, 2);
  assert.equal(h.sent[1].conversation, 'Maria: ajuda');
  assert.equal(h.composer.value, '');
});
