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
  setAttribute(k, v) { (this.attributeWrites ||= []).push([k, v]); this.attrs[k] = v; this.onAttribute?.(this); }
  getAttribute(k) { return this.attrs[k] || null; }
  addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
  async emit(k) { for (const fn of this.listeners[k] || []) await fn({ target: this }); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); }
  focus() { this.focused = true; }
  contains(n) { return n === this || this.children.some(child => child.contains(n)); }
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
  const listeners = {}, observers = [], sent = [], pendingMutations = [];
  let resolveReply, rejectReply;
  let deferred = false, fail = false;
  const document = { body, createElement: tag => {
    const n = new Node(tag);
    n.onAttribute = target => {
      if (observers.some(o => o.observing && !o.disconnected)) pendingMutations.push({ target, type: 'attributes' });
    };
    return n;
  },
    getElementById: id => all(body).find(n => n.id === id) || null,
    querySelector: sel => sel === '.sz_contact.active' ? card : null,
    querySelectorAll: sel => sel === '.msg' ? live.messages : [composer],
    addEventListener(k, fn) { (listeners[k] ||= []).push(fn); },
    createRange() { return { selectNodeContents() {}, collapse() {} }; }
  };
  const context = { document, window: { getSelection: () => ({ removeAllRanges() {}, addRange() {} }) },
    getComputedStyle: () => ({ visibility: 'visible' }), HTMLTextAreaElement: Node,
    Event: class { constructor(type) { this.type = type; } },
    MutationObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() { this.observing = true; } disconnect() { this.disconnected = true; } },
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
    notify(records = [{ target: card }]) { observers.filter(o => !o.disconnected).forEach(o => o.fn(records)); },
    flushMutations() {
      let cycles = 0;
      while (pendingMutations.length) {
        assert.ok(++cycles <= 10, 'observer loop starves the storage/API continuation');
        const batch = pendingMutations.splice(0);
        observers.filter(o => !o.disconnected).forEach(o => o.fn(batch));
      }
    },
    input() { (listeners.input || []).forEach(fn => fn({ type: 'input' })); },
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

test('nova mensagem no mesmo atendimento durante request torna a resposta desatualizada', async () => {
  const h = harness(); h.defer(); const pending = h.module.open(); await new Promise(setImmediate);
  h.live.conversation += '\nGabriel: apareceu outro erro';
  // No observer delivery is needed: completion must revalidate the context itself.
  h.respond(); await pending;
  assert.match(h.status(), /Novas informações chegaram/);
  assert.equal(h.button('Inserir').disabled, true);
  assert.equal(h.button('↻ Outra resposta').disabled, true);
  await h.button('Inserir').emit('click'); await h.button('↻ Outra resposta').emit('click');
  assert.deepEqual(h.composer.events, []); assert.equal(h.sent.length, 1);
});

test('nova mensagem depois do preview bloqueia insercao e exige nova captura explicita', async () => {
  const h = harness(); await h.module.open();
  h.live.conversation += '\nGabriel: novo detalhe'; h.notify();
  assert.equal(h.button('Inserir').disabled, true);
  await h.button('Inserir').emit('click'); await h.button('↻ Outra resposta').emit('click');
  assert.equal(h.composer.value, ''); assert.equal(h.sent.length, 1);
  // Reverting the text does not silently revive a stale snapshot.
  h.live.conversation = h.sent[0].conversation; h.notify();
  assert.equal(h.button('Inserir').disabled, true);
  h.live.conversation += '\nGabriel: contexto atualizado'; await h.module.open();
  assert.equal(h.sent.length, 2); assert.equal(h.sent[1].conversation, h.live.conversation);
  await h.button('Inserir').emit('click'); assert.equal(h.composer.events.length, 1);
});

test('promptComplement editado por input bloqueia inserir e regenerar sem atualizar snapshot', async () => {
  const h = harness(); await h.module.open();
  h.live.complement = 'nova informação técnica'; h.input();
  assert.match(h.status(), /Gere uma nova resposta/);
  assert.equal(h.button('Inserir').disabled, true);
  assert.equal(h.button('↻ Outra resposta').disabled, true);
  await h.button('Inserir').emit('click'); await h.button('↻ Outra resposta').emit('click');
  assert.equal(h.sent.length, 1); assert.equal(h.composer.value, '');
  assert.equal(h.sent[0].promptComplement, 'verificação em andamento');
});

test('acoes revalidam freshness mesmo sem notificacao de DOM ou input', async () => {
  for (const action of ['Inserir', '↻ Outra resposta']) {
    const h = harness(); await h.module.open(); h.live.complement = 'alterado';
    await h.button(action).emit('click');
    assert.match(h.status(), /Novas informações chegaram/);
    assert.equal(h.sent.length, 1); assert.deepEqual(h.composer.events, []);
  }
});

test('whitespace irrelevante preserva freshness e regeneracao usa exatamente o snapshot original', async () => {
  const h = harness(); await h.module.open();
  h.live.conversation = ' \n Gabriel:\t preciso   de ajuda \r\n';
  h.live.complement = '\t verificação \n em   andamento  '; h.notify(); h.input();
  assert.equal(h.button('Inserir').disabled, false);
  assert.equal(h.button('↻ Outra resposta').disabled, false);
  await h.button('↻ Outra resposta').emit('click');
  assert.deepEqual(h.sent[1], { ...h.sent[0], regenerate: true });
  await h.button('Inserir').emit('click'); assert.deepEqual(h.composer.events, ['input']);
});

test('freshness considera transcript completo inclusive trecho omitido do payload', async () => {
  const h = harness(); h.live.conversation = 'a'.repeat(10000) + 'b'.repeat(10000);
  await h.module.open(); const payload = h.sent[0].conversation;
  h.live.conversation = h.live.conversation.slice(0, 7000) + 'novo detalhe' + h.live.conversation.slice(7012);
  h.notify(); assert.equal(h.button('Inserir').disabled, true);
  assert.equal(h.sent[0].conversation, payload); assert.equal(h.sent.length, 1);
});

test('mudanca de privateNote nao afeta freshness e nunca entra no payload', async () => {
  const store = { privateNote: 'segredo inicial' }; const h = harness(store);
  await h.module.open(); store.privateNote = 'segredo atualizado'; h.notify(); h.input();
  assert.equal(h.button('Inserir').disabled, false);
  await h.button('↻ Outra resposta').emit('click');
  for (const payload of h.sent) {
    assert.deepEqual(Object.keys(payload).sort(), ['action', 'conversation', 'profile', 'promptComplement', 'regenerate']);
    assert.equal(JSON.stringify(payload).includes('segredo'), false);
  }
  await h.button('Inserir').emit('click'); assert.deepEqual(h.composer.events, ['input']);
});

test('contexto alterado durante escolha de composer bloqueia substituir e acrescentar', async () => {
  for (const choice of ['Substituir', 'Acrescentar']) {
    const h = harness(); h.composer.value = 'meu rascunho'; await h.module.open();
    await h.button('Inserir').emit('click'); h.live.conversation += '\nGabriel: novidade';
    await h.button(choice).emit('click');
    assert.equal(h.composer.value, 'meu rascunho'); assert.deepEqual(h.composer.events, []);
    assert.match(h.status(), /Novas informações chegaram/);
  }
});


test('S1/S2/S4/S5: opening sends once and own mutations never sync or rewrite aria-busy', async () => {
  const h = harness(); await h.module.open();
  const panel = h.panel();
  const before = panel.attributeWrites.filter(([key]) => key === 'aria-busy').length;
  h.live.conversation += '\nGabriel: nova mensagem';
  for (let i = 0; i < 20; i++) h.notify([{ target: panel.children[0] }]);
  assert.equal(h.button('Inserir').disabled, false, 'internal mutations must not run freshness');
  assert.equal(panel.attributeWrites.filter(([key]) => key === 'aria-busy').length, before);
  assert.equal(h.sent.length, 1);
  h.notify();
  assert.equal(h.button('Inserir').disabled, true, 'S3: external mutation checks freshness');
  assert.equal(panel.attributeWrites.filter(([key]) => key === 'aria-busy').length, before);
});

test('S1/S4: attribute mutation delivery settles before API continuation and sends exactly once', async () => {
  const h = harness();
  const opening = h.module.open();
  h.flushMutations();
  await opening;
  h.flushMutations();
  assert.equal(h.sent.length, 1);
  assert.deepEqual(h.panel().attributeWrites.filter(([key]) => key === 'aria-busy').map(([, value]) => value),
    ['true', 'false', 'true', 'false']);
});

test('F14: local Focus nextStep never enters Smart Reply payload', async () => {
  const h = harness({ atendeai_support_focus_v1: { version: 1, items: { x: { status: 'CHECKING', nextStep: 'FOCUS_ONLY_SECRET' } } } });
  await h.module.open();
  assert.equal(h.sent.length, 1);
  assert.equal(JSON.stringify(h.sent).includes('FOCUS_ONLY_SECRET'), false);
  assert.deepEqual(Object.keys(h.sent[0]).sort(), ['action', 'conversation', 'profile', 'promptComplement', 'regenerate']);
});
