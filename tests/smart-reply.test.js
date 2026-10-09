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
  focus() { this.focused = true; this.onFocus?.(); }
  contains(n) { return n === this || this.children.some(child => child.contains(n)); }
  closest() { return null; }
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  dispatchEvent(event) { this.events.push(event.type); }
}
const all = n => [n, ...n.children.flatMap(all)];
function harness(store = {}, realContext = false) {
  const body = new Node('body'), composer = new Node('textarea');
  const live = { conversation: 'Gabriel: preciso de ajuda', complement: 'verificação em andamento', name: 'Gabriel', platform: 'webchat', time: '06/10/26 08:14', explicit: '' };
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
  let messageSource, messageNodes = [];
  function replyMessages() {
    if (messageSource !== live.conversation) {
      messageSource = live.conversation;
      messageNodes = live.conversation.split('\n').filter(line => line.trim()).map(line => {
        const match = line.trim().match(/^([^:]+):\s*([\s\S]*)$/);
        const name = match ? match[1] : '', value = match ? match[2] : line.trim();
        return { classList: { contains: cls => cls === 'sent' && /^Técnico/.test(name) },
          querySelector: selector => ({ innerText: selector === '.name' ? name : value }) };
      });
    }
    return messageNodes;
  }
  const document = { body, createElement: tag => {
    const n = new Node(tag);
    n.onFocus = () => { document.activeElement = n; };
    n.onAttribute = target => {
      if (observers.some(o => o.observing && !o.disconnected)) pendingMutations.push({ target, type: 'attributes' });
    };
    return n;
  },
    getElementById: id => all(body).find(n => n.id === id) || null,
    querySelector: sel => sel === '.sz_contact.active' ? card : null,
    querySelectorAll: sel => sel === '.msg' ? replyMessages() : sel === '.sz_contact.active' ? [card] : [composer],
    addEventListener(k, fn) { (listeners[k] ||= []).push(fn); },
    createRange() { return { selectNodeContents() {}, collapse() {} }; }
  };
  let sequence = 0;
  const context = { document, window: { getSelection: () => ({ removeAllRanges() {}, addRange() {} }) },
    crypto: { randomUUID: () => `profile-${++sequence}` },
    chrome: { runtime: {}, storage: { local: {
      get(keys, callback) { callback(structuredClone(store)); },
      set(data, callback) { Object.assign(store, structuredClone(data)); callback(); }
    } } },
    getComputedStyle: () => ({ visibility: 'visible' }), HTMLTextAreaElement: Node,
    Event: class { constructor(type) { this.type = type; } },
    MutationObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() { this.observing = true; } disconnect() { this.disconnected = true; } },
    StorageHelper: { async get() { return store; }, async set(data) { Object.assign(store, data); } },
    SmartReplyContextModule: { async sync() {}, getForCurrentChat: () => live.complement, onChanged: () => () => {} },
    ObservationsModule: { getPromptComplementForCurrentChat: () => live.summary || 'SUMMARY_ONLY',
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
  vm.runInContext(fs.readFileSync('modules/chat-capture.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('modules/smart-reply-profiles.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('modules/smart-reply-profiles-ui.js', 'utf8'), context);
  if (realContext) {
    context.setTimeout = setTimeout; context.clearTimeout = clearTimeout;
    context.RecoveryBufferModule = { getCurrentConversationIdentity: () => ({ sourceId: `chat:${live.name}|${live.time}` }) };
    vm.runInContext(fs.readFileSync('modules/smart-reply-context.js', 'utf8'), context);
  }
  vm.runInContext(fs.readFileSync('modules/smart-reply.js', 'utf8'), context);
  const panel = () => document.getElementById('atendeai-smart-reply');
  const button = label => all(body).find(n => n.tagName === 'button' && n.textContent === label);
  const profile = () => all(body).find(n => n.getAttribute('aria-label') === 'Perfil da resposta e padrão');
  const status = () => all(body).filter(n => /smart-reply-(status|warning)/.test(n.className)).map(n => n.textContent).join(' ');
  return { module: context.window.SmartReplyModule, context, document, live, composer, store, sent, panel, button, profile, status,
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

async function openGenerated(h, mode) { await h.module.open(mode); await h.button('Gerar resposta').emit('click'); }

test('E1/E7/E8: gera um preview e insere no composer vazio sem enviar ou ler notas/recovery', async () => {
  const h = harness(); await openGenerated(h);
  assert.deepEqual(h.sent, [{ action: 'gerarResposta', conversation: 'Gabriel: preciso de ajuda',
    promptComplement: 'verificação em andamento', profile: 'DIRECT', regenerate: false }]);
  assert.equal(h.composer.value, ''); assert.deepEqual(h.composer.events, []);
  await h.button('Inserir').emit('click');
  assert.equal(h.composer.value, 'Pode informar o erro exibido?');
  assert.deepEqual(h.composer.events, ['input']); assert.equal(h.panel(), null);
});

test('E2/E3/E4: regeneracao usa snapshot original, perfil escolhido persiste sem chamada automatica', async () => {
  const h = harness(); await openGenerated(h);
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
  const next = harness(h.store); await openGenerated(next);
  assert.equal(next.sent[0].profile, 'DIDACTIC');
});

test('E5: troca de chat antes da resposta mostra aviso e bloqueia insercao e regeneracao', async () => {
  const h = harness(); h.defer(); const pending = openGenerated(h);
  await new Promise(setImmediate);
  h.live.name = 'Maria'; h.notify(); h.respond(); await pending;
  assert.match(h.status(), /atendimento ativo mudou/);
  await h.button('Inserir').emit('click'); await h.button('↻ Outra resposta').emit('click');
  assert.equal(h.sent.length, 1); assert.equal(h.composer.value, '');
  h.live.name = 'Gabriel'; h.notify();
  await h.button('Inserir').emit('click'); assert.equal(h.composer.value, '');
});

for (const key of ['time', 'platform', 'explicit']) test(`token impede insercao se ${key} do atendimento mudou`, async () => {
  const h = harness(); await openGenerated(h); h.live[key] = 'outro';
  await h.button('Inserir').emit('click'); assert.equal(h.composer.value, '');
});

for (const [choice, expected] of [['Substituir', 'Pode informar o erro exibido?'], ['Acrescentar', 'meu rascunho\nPode informar o erro exibido?'], ['Cancelar', 'meu rascunho']]) {
  test(`E6: rascunho existente exige escolha ${choice}`, async () => {
    const h = harness(); h.composer.value = 'meu rascunho'; await openGenerated(h);
    await h.button('Inserir').emit('click'); assert.equal(h.composer.value, 'meu rascunho');
    await h.button(choice).emit('click'); assert.equal(h.composer.value, expected);
  });
}

test('confirmacao pendente revalida chat e rascunho editado', async () => {
  const h = harness(); h.composer.value = 'rascunho'; await openGenerated(h);
  await h.button('Inserir').emit('click'); h.composer.value = 'rascunho novo';
  await h.button('Substituir').emit('click'); assert.equal(h.composer.value, 'rascunho novo');
  h.live.name = 'Maria'; await h.button('Acrescentar').emit('click');
  assert.equal(h.composer.value, 'rascunho novo');
});

test('E9: sem transcript ou identidade segura nao chama API', async () => {
  for (const missing of ['conversation', 'time']) {
    const h = harness(); h.live[missing] = ''; await openGenerated(h);
    assert.equal(h.sent.length, 0); assert.equal(h.button('Inserir').disabled, true);
    assert.ok(h.status().length > 0);
  }
});

test('falha nao perde rascunho, permite retry manual; fechar cancela resposta tardia', async () => {
  const h = harness(); h.composer.value = 'não perder'; h.fail(); await openGenerated(h);
  assert.match(h.status(), /Falha temporária/); assert.equal(h.composer.value, 'não perder');
  h.succeed(); await h.button('↻ Outra resposta').emit('click'); assert.equal(h.sent.length, 2);
  h.defer(); const pending = h.button('↻ Outra resposta').emit('click'); await new Promise(setImmediate);
  h.escape(); h.respond(); await pending; assert.equal(h.panel(), null); assert.equal(h.composer.value, 'não perder');
});

test('contexto longo preserva inicio, fim e ultima fala do cliente em uma chamada', async () => {
  const h = harness();
  h.live.conversation = 'INICIO\n' + 'x'.repeat(5000) + '\nGabriel: ÚLTIMA FALA DO CLIENTE\n' + 'Técnico: '.repeat(5000) + '\nRECENTE';
  await openGenerated(h, 'AVAILABLE'); const conversation = h.sent[0].conversation;
  assert.ok(conversation.length <= 16000); assert.ok(conversation.includes('INICIO'));
  assert.ok(conversation.endsWith('RECENTE')); assert.ok(conversation.includes('ÚLTIMA FALA DO CLIENTE'));
  assert.equal(h.sent.length, 1);
});

test('contenteditable recebe apenas input; composer ausente nao altera draft', async () => {
  const h = harness(); h.composer.isContentEditable = true; await openGenerated(h);
  await h.button('Inserir').emit('click'); assert.equal(h.composer.textContent, 'Pode informar o erro exibido?');
  assert.deepEqual(h.composer.events, ['input']);
  const absent = harness(); absent.composer.offsetWidth = 0; await openGenerated(absent);
  await absent.button('Inserir').emit('click'); assert.equal(absent.composer.value, '');
  assert.match(absent.status(), /campo de mensagem/);
});

test('configuracoes carregam e salvam somente o perfil default aceito', async () => {
  const source = fs.readFileSync('options.js', 'utf8');
  const start = source.indexOf('    const base = await storageGet(["history"');
  const end = source.indexOf('    renderHistory(base.history', start);
  const profile = new Node('select');
  const store = { atendeai_smart_reply_profile: 'EMPATHETIC', privateNote: 'segredo' };
  const context = { el: { smartReplyProfile: profile }, document: { createElement: tag => new Node(tag) },
    SmartReplyProfilesModule: harness(store).context.window.SmartReplyProfilesModule,
    storageGet: async () => store, storageSet: async data => Object.assign(store, data) };
  vm.createContext(context);
  await vm.runInContext(`(async () => { ${source.slice(start, end)} })()`, context);
  assert.equal(profile.value, 'EMPATHETIC');
  profile.value = 'DIDACTIC'; await profile.emit('change');
  const h = harness(store); await openGenerated(h);
  assert.equal(h.sent[0].profile, 'DIDACTIC');
  assert.equal(store.privateNote, 'segredo');
  profile.value = 'JEV'; await profile.emit('change');
  assert.equal(store.atendeai_smart_reply_profile, 'DIDACTIC');
});

test('duas geracoes sobrepostas nao retargetam resposta tardia ao novo preview', async () => {
  const h = harness(); h.defer(); const first = openGenerated(h); await new Promise(setImmediate);
  h.live.name = 'Maria';
  h.live.conversation = 'Maria: ajuda';
  h.normal(); await openGenerated(h);
  h.respond(); await first;
  const preview = all(h.document.body).find(n => n.className === 'smart-reply-text');
  assert.equal(preview.textContent, 'Pode informar o erro exibido?');
  assert.equal(h.sent.length, 2);
  assert.equal(h.sent[1].conversation, 'Maria: ajuda');
  assert.equal(h.composer.value, '');
});

test('nova mensagem no mesmo atendimento durante request torna a resposta desatualizada', async () => {
  const h = harness(); h.defer(); const pending = openGenerated(h); await new Promise(setImmediate);
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
  const h = harness(); await openGenerated(h);
  h.live.conversation += '\nGabriel: novo detalhe'; h.notify();
  assert.equal(h.button('Inserir').disabled, true);
  await h.button('Inserir').emit('click'); await h.button('↻ Outra resposta').emit('click');
  assert.equal(h.composer.value, ''); assert.equal(h.sent.length, 1);
  // Reverting the text does not silently revive a stale snapshot.
  h.live.conversation = h.sent[0].conversation; h.notify();
  assert.equal(h.button('Inserir').disabled, true);
  h.live.conversation += '\nGabriel: contexto atualizado'; await openGenerated(h);
  assert.equal(h.sent.length, 2); assert.equal(h.sent[1].conversation, h.live.conversation);
  await h.button('Inserir').emit('click'); assert.equal(h.composer.events.length, 1);
});

test('promptComplement editado por input bloqueia inserir e regenerar sem atualizar snapshot', async () => {
  const h = harness(); await openGenerated(h);
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
    const h = harness(); await openGenerated(h); h.live.complement = 'alterado';
    await h.button(action).emit('click');
    assert.match(h.status(), /Novas informações chegaram/);
    assert.equal(h.sent.length, 1); assert.deepEqual(h.composer.events, []);
  }
});

test('whitespace irrelevante preserva freshness e regeneracao usa exatamente o snapshot original', async () => {
  const h = harness(); await openGenerated(h);
  h.live.conversation = ' \n Gabriel:\t preciso   de ajuda \r\n';
  h.live.complement = '\t verificação \n em   andamento  '; h.notify(); h.input();
  assert.equal(h.button('Inserir').disabled, false);
  assert.equal(h.button('↻ Outra resposta').disabled, false);
  await h.button('↻ Outra resposta').emit('click');
  assert.deepEqual(h.sent[1], { ...h.sent[0], regenerate: true });
  await h.button('Inserir').emit('click'); assert.deepEqual(h.composer.events, ['input']);
});

test('freshness considera transcript completo inclusive trecho omitido do payload', async () => {
  const h = harness(); h.live.conversation = 'Gabriel: ' + 'a'.repeat(10000) + 'b'.repeat(10000);
  await openGenerated(h); const payload = h.sent[0].conversation;
  h.live.conversation = h.live.conversation.slice(0, 7000) + 'novo detalhe' + h.live.conversation.slice(7012);
  h.notify(); assert.equal(h.button('Inserir').disabled, true);
  assert.equal(h.sent[0].conversation, payload); assert.equal(h.sent.length, 1);
});

test('mudanca de privateNote nao afeta freshness e nunca entra no payload', async () => {
  const store = { privateNote: 'segredo inicial' }; const h = harness(store);
  await openGenerated(h); store.privateNote = 'segredo atualizado'; h.notify(); h.input();
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
    const h = harness(); h.composer.value = 'meu rascunho'; await openGenerated(h);
    await h.button('Inserir').emit('click'); h.live.conversation += '\nGabriel: novidade';
    await h.button(choice).emit('click');
    assert.equal(h.composer.value, 'meu rascunho'); assert.deepEqual(h.composer.events, []);
    assert.match(h.status(), /Novas informações chegaram/);
  }
});


test('S1/S2/S4/S5: explicit generation sends once and own mutations never sync or rewrite aria-busy', async () => {
  const h = harness(); await openGenerated(h);
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
  const opening = openGenerated(h);
  h.flushMutations();
  await opening;
  h.flushMutations();
  assert.equal(h.sent.length, 1);
  assert.deepEqual(h.panel().attributeWrites.filter(([key]) => key === 'aria-busy').map(([, value]) => value),
    ['false', 'true', 'false']);
});

test('F14: local Focus nextStep never enters Smart Reply payload', async () => {
  const h = harness({ atendeai_support_focus_v1: { version: 1, items: { x: { status: 'CHECKING', nextStep: 'FOCUS_ONLY_SECRET' } } } });
  await openGenerated(h);
  assert.equal(h.sent.length, 1);
  assert.equal(JSON.stringify(h.sent).includes('FOCUS_ONLY_SECRET'), false);
  assert.deepEqual(Object.keys(h.sent[0]).sort(), ['action', 'conversation', 'profile', 'promptComplement', 'regenerate']);
});

test('SMART1: Smart Reply continua chegando a exatamente uma request', async () => {
  const h = harness();
  const opening = openGenerated(h);
  h.flushMutations();
  await opening;
  h.flushMutations();
  assert.equal(h.sent.length, 1);
  assert.deepEqual(h.sent[0], {
    action: 'gerarResposta', conversation: 'Gabriel: preciso de ajuda',
    promptComplement: 'verificação em andamento', profile: 'DIRECT', regenerate: false
  });
});

test('SMART2: Mutação interna do preview continua sem loop', async () => {
  const h = harness(); await openGenerated(h);
  const panel = h.panel();
  const before = panel.attributeWrites.filter(([key]) => key === 'aria-busy').length;
  for (let i = 0; i < 20; i++) h.notify([{ target: panel.children[0] }]);
  h.flushMutations();
  assert.equal(h.sent.length, 1);
  assert.equal(panel.attributeWrites.filter(([key]) => key === 'aria-busy').length, before);
});

test('summary-only observations never enter Smart Reply or invalidate freshness', async () => {
  const h = harness(); await openGenerated(h); h.live.summary = 'SUMMARY_CHANGED'; h.notify(); h.input();
  assert.equal(h.button('Inserir').disabled, false);
  assert.ok(!JSON.stringify(h.sent).includes('SUMMARY'));
  h.live.complement = 'ATUALIZADO'; h.input(); assert.equal(h.button('Inserir').disabled, true);
  await openGenerated(h); assert.equal(h.sent.at(-1).promptComplement, 'ATUALIZADO');
});

test('main preview manages custom profiles and applies a new style only on explicit regeneration', async () => {
  const h = harness({ privateNote: 'PRIVATE_ONLY', summaryObservation: 'SUMMARY_ONLY' }); await openGenerated(h);
  await h.button('Perfis').emit('click');
  const manager = all(h.document.body).find(n => n.className === 'smart-reply-profiles-panel');
  const manageButton = label => all(manager).find(n => n.tagName === 'button' && n.textContent === label);
  assert.equal(manager.hidden, false); assert.ok(all(manager).some(n => n.textContent === 'Regras sempre aplicadas'));
  assert.equal(all(manager).filter(n => n.textContent === 'Duplicar e personalizar').length, 3);
  await h.button('+ Novo perfil').emit('click');
  const name = h.document.getElementById('atendeai-reply-profile-name'), instruction = h.document.getElementById('atendeai-reply-profile-instruction');
  assert.equal(name.maxLength, 40); assert.equal(instruction.maxLength, 600);
  name.value = 'Meu tom'; instruction.value = 'STYLE_CUSTOM'; await h.button('Salvar perfil').emit('click');
  await h.button('Definir como padrão').emit('click');
  const customRow = all(manager).find(n => n.getAttribute('data-profile-id') === h.context.window.SmartReplyProfilesModule.defaultId());
  assert.equal(customRow.children[0].children[0].textContent, 'Meu tom');
  assert.equal(customRow.children[0].children[1].textContent, 'Padrão');
  assert.deepEqual(customRow.children[1].children.map(n => n.textContent), ['Definir como padrão', 'Editar', 'Excluir']);
  assert.equal(all(manager).find(n => n.className === 'smart-reply-profiles-chip').textContent, 'Meu tom');
  const preview = all(h.document.body).find(n => n.className === 'smart-reply-text');
  assert.equal(preview.textContent, 'Pode informar o erro exibido?'); assert.equal(h.sent.length, 1);
  assert.equal(h.button('Inserir').disabled, true);
  await h.button('↻ Outra resposta').emit('click');
  assert.equal(h.sent[1].profile, 'CUSTOM'); assert.equal(h.sent[1].styleInstruction, 'STYLE_CUSTOM');
  assert.equal(h.sent[1].promptComplement, 'verificação em andamento');
  assert.equal(JSON.stringify(h.sent).includes('PRIVATE_ONLY'), false); assert.equal(JSON.stringify(h.sent).includes('SUMMARY_ONLY'), false);
  await h.button('Editar').emit('click'); h.document.getElementById('atendeai-reply-profile-instruction').value = 'STYLE_EDITED';
  await h.button('Salvar perfil').emit('click'); assert.equal(h.button('Inserir').disabled, true);
  assert.equal(h.sent.length, 2); await h.button('↻ Outra resposta').emit('click'); assert.equal(h.sent[2].styleInstruction, 'STYLE_EDITED');
  await h.button('Excluir').emit('click'); assert.ok(h.button('Confirmar exclusão'));
  await manageButton('Cancelar').emit('click'); assert.equal(h.context.window.SmartReplyProfilesModule.list().length, 4);
  await h.button('Excluir').emit('click'); await h.button('Confirmar exclusão').emit('click');
  assert.equal(h.profile().value, 'DIRECT'); assert.equal(h.store.atendeai_smart_reply_profile, 'DIRECT');
  await h.button('↻ Outra resposta').emit('click'); assert.equal(h.sent.at(-1).profile, 'DIRECT'); assert.equal(Object.hasOwn(h.sent.at(-1), 'styleInstruction'), false);
});

test('real addendum edits invalidate preview immediately and next generation reads the updated value', async () => {
  const h = harness({}, true);
  const field = new Node('textarea'); field.id = 'atendeai-reply-addendum'; h.document.body.appendChild(field);
  const addendum = h.context.window.SmartReplyContextModule;
  await addendum.sync(); addendum.bind(); field.value = 'LIGAÇÃO_A'; await field.emit('input'); await addendum.flush();
  await openGenerated(h); assert.equal(h.sent[0].promptComplement, 'LIGAÇÃO_A');
  field.value = 'ANYDESK_ATUALIZADO'; await field.emit('input');
  assert.equal(h.button('Inserir').disabled, true); assert.match(h.status(), /Gere uma nova resposta/);
  await openGenerated(h); assert.equal(h.sent[1].promptComplement, 'ANYDESK_ATUALIZADO');
  await addendum.flush();
});

test('main manager duplicates a builtin and cancellation never mutates the builtin', async () => {
  const h = harness(); await openGenerated(h); await h.button('Perfis').emit('click');
  await h.button('Duplicar e personalizar').emit('click');
  const m = h.context.window.SmartReplyProfilesModule, original = m.get('DIRECT').instruction;
  assert.equal(m.list().length, 4); const copy = m.list().find(p => !p.builtin);
  assert.equal(copy.instruction, original);
  h.document.getElementById('atendeai-reply-profile-instruction').value = 'UNSAVED';
  const manager = all(h.document.body).find(n => n.className === 'smart-reply-profiles-panel');
  await all(manager).find(n => n.tagName === 'button' && n.textContent === 'Cancelar').emit('click');
  assert.equal(m.get(copy.id).instruction, original); assert.equal(m.get('DIRECT').instruction, original);
  assert.equal(h.sent.length, 1);
});

test('editing style while a request is pending cannot authorize insertion of a reply with the old style', async () => {
  const h = harness(); await openGenerated(h); const m = h.context.window.SmartReplyProfilesModule;
  const p = await m.save({ name: 'Estilo', instruction: 'OLD_STYLE' }); await m.setDefault(p.id);
  h.defer(); const pending = h.button('↻ Outra resposta').emit('click'); await new Promise(setImmediate);
  await m.save({ id: p.id, name: p.name, instruction: 'NEW_STYLE' }); h.respond(); await pending;
  assert.equal(h.sent.at(-1).styleInstruction, 'OLD_STYLE'); assert.equal(h.button('Inserir').disabled, true);
  h.normal(); await h.button('↻ Outra resposta').emit('click'); assert.equal(h.sent.at(-1).styleInstruction, 'NEW_STYLE');
  assert.equal(h.button('Inserir').disabled, false);
});

test('options retires the unused global prompt while preserving legacy storage', async () => {
  const source = fs.readFileSync('options.js', 'utf8'), html = fs.readFileSync('options.html', 'utf8');
  assert.doesNotMatch(source, /customInstructions/); assert.doesNotMatch(html, /id="customInstructions"|Prompt Personalizado/);
  const store = { customInstructions: 'LEGACY_NO_MIGRATION' }, h = harness(store); await openGenerated(h);
  assert.equal(store.customInstructions, 'LEGACY_NO_MIGRATION'); assert.equal(JSON.stringify(h.sent).includes('LEGACY'), false);
});

test('manager prioritizes create and resets scroll for reachable editor actions', async () => {
 const h=harness();await openGenerated(h);const root=h.document.getElementById('atendeai-smart-reply');await h.button('Perfis').emit('click');
 assert.equal(root.getAttribute('data-profiles-open'),'true');
 const body=all(root).find(n=>n.className==='smart-reply-profiles-body');
 const sections=body.children;
 assert.deepEqual(sections.map(n=>n.getAttribute('aria-label')),['Perfil atual','Meus perfis','Perfis padrão',null]);
 assert.equal(sections[3].children[0].textContent,'Regras sempre aplicadas');
 const current=sections[0];
 assert.equal(current.children[0].tagName,'h3');assert.equal(current.children[0].textContent,'Perfil atual');
 assert.equal(current.children[1].textContent,'Direta');assert.equal(current.children[1].tagName,'span');
 const header=sections[1].children[0];
 assert.equal(header.children[0].textContent,'Meus perfis');assert.equal(header.children[0].tagName,'h3');
 assert.equal(header.children[1],h.button('+ Novo perfil'));
 assert.equal(sections[2].children.filter(n=>n.getAttribute('data-profile-id')).length,3);
 for(const row of sections[2].children.filter(n=>n.getAttribute('data-profile-id'))){
  assert.equal(row.children[0].tagName,'h4');assert.equal(row.children[1].tagName,'p');
  assert.equal(row.children[2].children[0].textContent,'Duplicar e personalizar');
 }
 body.scrollTop=999;await h.button('+ Novo perfil').emit('click');assert.equal(body.scrollTop,0);
 assert.equal(body.children[0].className,'smart-reply-profiles-editor');
 assert.ok(body.contains(h.button('Salvar perfil')));assert.ok(all(body).some(n=>n.tagName==='button'&&n.textContent==='Cancelar'));
 await h.button('Perfis').emit('click');assert.equal(root.getAttribute('data-profiles-open'),'false');
 assert.equal(all(root).find(n=>n.className==='smart-reply-text').textContent,'Pode informar o erro exibido?');
});

test('default generation sends only last 12 messages; old omitted messages still invalidate freshness', async () => {
  const h = harness(); h.live.conversation = Array.from({ length: 15 }, (_, i) => `Gabriel: fala ${i + 1}`).join('\n');
  await openGenerated(h);
  assert.equal(h.sent.length, 1); assert.ok(h.sent[0].conversation.startsWith('Gabriel: fala 4\n'));
  assert.ok(h.sent[0].conversation.endsWith('Gabriel: fala 15'));
  assert.ok(all(h.panel()).some(n => n.textContent === 'Contexto: Recentes'));
  h.live.conversation = h.live.conversation.replace('fala 1\n', 'antiga alterada\n'); h.notify();
  await h.button('↻ Outra resposta').emit('click'); await h.button('Inserir').emit('click');
  assert.equal(h.sent.length, 1); assert.equal(h.composer.value, ''); assert.match(h.status(), /Gere uma nova resposta/);
});

test('last customer generation ignores later technician text and regenerates the same snapshot and addendum', async () => {
  const h = harness(); h.live.conversation = 'Gabriel: anterior\nGabriel: pergunta\nTécnico: retorno';
  await openGenerated(h, 'LAST_CUSTOMER');
  assert.equal(h.sent[0].conversation, 'Gabriel: pergunta');
  assert.ok(all(h.panel()).some(n => n.textContent === 'Contexto: Última mensagem do cliente'));
  h.profile().value = 'EMPATHETIC'; await h.profile().emit('change');
  assert.equal(h.sent.length, 1); await h.button('↻ Outra resposta').emit('click');
  assert.deepEqual(h.sent[1], { ...h.sent[0], regenerate: true, profile: 'EMPATHETIC' });
});

test('last customer without valid received text shows guidance and makes no request', async () => {
  const h = harness(); h.live.conversation = 'Técnico: apenas envio'; await openGenerated(h, 'LAST_CUSTOMER');
  assert.equal(h.sent.length, 0); assert.equal(h.button('Inserir').disabled, true);
  assert.match(h.status(), /mensagem textual.*cliente/);
});

test('dock control opens preparation without native dropdown or requests', async () => {
 const h=harness(); const primary=h.document.createElement('button');
 const control=h.module.mountContextControl(primary);
 primary.addEventListener('click',()=>h.module.open(control.consumeMode()));
 h.document.body.appendChild(control.element); await primary.emit('click');
 assert.equal(h.sent.length,0); assert.ok(h.button('Gerar resposta'));
 assert.equal(all(control.element).some(n=>n.tagName==='select'),false);
});

test('all modes reject chat switches and changed messages while a request is pending', async () => {
  for (const mode of ['RECENT', 'LAST_CUSTOMER', 'AVAILABLE']) {
    for (const change of ['chat', 'text']) {
      const h = harness(); h.defer(); const pending = openGenerated(h, mode); await new Promise(setImmediate);
      if (change === 'chat') h.live.name = 'Maria'; else h.live.conversation += '\nTécnico: nova informação';
      h.notify(); h.respond(); await pending;
      await h.button('Inserir').emit('click'); await h.button('↻ Outra resposta').emit('click');
      assert.equal(h.sent.length, 1); assert.equal(h.composer.value, ''); assert.ok(h.status().trim());
    }
  }
});

test('custom style and independent addendum work in all modes without leaking private fields', async () => {
  for (const mode of ['RECENT', 'LAST_CUSTOMER', 'AVAILABLE']) {
    const h = harness({ privateNote: 'PRIVATE_SECRET', summaryObservation: 'REPORT_SECRET' });
    const profiles = h.context.window.SmartReplyProfilesModule;
    const p = await profiles.save({ name: 'Meu tom', instruction: 'STYLE_CUSTOM' }); await profiles.setDefault(p.id);
    await openGenerated(h, mode); await h.button('↻ Outra resposta').emit('click');
    assert.equal(h.sent.length, 2); assert.equal(h.sent[0].profile, 'CUSTOM');
    assert.equal(h.sent[0].styleInstruction, 'STYLE_CUSTOM'); assert.equal(h.sent[0].promptComplement, 'verificação em andamento');
    assert.deepEqual(h.sent[1], { ...h.sent[0], regenerate: true }); assert.doesNotMatch(JSON.stringify(h.sent), /PRIVATE_SECRET|REPORT_SECRET/);
  }
});

 test('preparation opens and closes without requests and generation is explicit', async () => {
 const h=harness(); h.fail(); await h.module.open(); assert.equal(h.sent.length,0);
 assert.ok(h.button('Gerar resposta')); assert.equal(h.composer.value,'');
 h.escape(); await h.module.open(); assert.equal(h.sent.length,0); h.succeed();
 await h.button('Gerar resposta').emit('click'); assert.equal(h.sent.length,1);
 });
 test('one-off instruction stays separate and is never stored', async () => {
 const h=harness(); await h.module.open();
 const field=h.document.getElementById('atendeai-reply-instruction');
 assert.ok(field); field.value='Peça a versão'; await field.emit('input'); assert.equal(h.sent.length,0);
 await h.button('Gerar resposta').emit('click');
 assert.equal(h.sent[0].replyInstruction,'Peça a versão'); assert.equal(h.sent[0].promptComplement,'verificação em andamento');
 assert.ok(!JSON.stringify(h.store).includes('Peça a versão'));
 });

test('preparation changes never generate; duplicate explicit clicks send once',async()=>{
 const h=harness(); await h.module.open();
 h.profile().value='EMPATHETIC'; await h.profile().emit('change');
 const context=all(h.panel()).find(n=>n.getAttribute('aria-label')==='Contexto'); context.value='LAST_CUSTOMER';await context.emit('change');
 const instruction=h.document.getElementById('atendeai-reply-instruction'); instruction.value='Peça a versão';await instruction.emit('input');
 assert.equal(h.sent.length,0);h.defer();const pending=h.button('Gerar resposta').emit('click');await new Promise(setImmediate);
 await h.button('Gerar resposta').emit('click');assert.equal(h.sent.length,1);h.respond();await pending;
 assert.equal(h.sent[0].profile,'EMPATHETIC');assert.equal(h.sent[0].replyInstruction,'Peça a versão');
});
test('chat switch during preparation requires opening a new panel',async()=>{
 const h=harness();await h.module.open();h.live.name='Maria';h.notify();h.live.name='Gabriel';h.notify();
 await h.button('Gerar resposta').emit('click');assert.equal(h.sent.length,0);assert.match(h.status(),/atendimento ativo mudou/);
});
test('instruction limit and empty backward-compatible contract',async()=>{
 const h=harness();await h.module.open();const field=h.document.getElementById('atendeai-reply-instruction');
 field.value='a'.repeat(601);await h.button('Gerar resposta').emit('click');assert.equal(h.sent.length,0);assert.match(h.status(),/600/);
 field.value='  ';await h.button('Gerar resposta').emit('click');assert.equal(h.sent.length,1);assert.equal(Object.hasOwn(h.sent[0],'replyInstruction'),false);
 await h.button('Voltar para editar as opções').emit('click');field.value='Peça uma captura';await field.emit('input');assert.equal(h.sent.length,1);
 await h.button('Inserir').emit('click');assert.equal(h.composer.value,'');await h.button('Gerar resposta').emit('click');assert.equal(h.sent.length,2);
});

test('late profile loading cannot release the generation lock',async()=>{
 const h=harness();let loaded;h.context.window.SmartReplyProfilesModule.load=()=>new Promise(resolve=>loaded=resolve);
 h.defer();const opening=h.module.open();const pending=h.button('Gerar resposta').emit('click');await new Promise(setImmediate);
 loaded();await opening;const duplicate=h.button('Gerar resposta').emit('click');await new Promise(setImmediate);assert.equal(h.sent.length,1);
 h.respond();await pending;
});

test('profile selection preserves keyboard focus after default persistence',async()=>{
 const h=harness();await h.module.open();const group=h.profile(), option=group.children[1];option.focus();await option.emit('click');await new Promise(setImmediate);
 assert.ok(group.contains(h.document.activeElement));assert.equal(h.document.activeElement.value,'EMPATHETIC');
});

test('generated text receives review focus and Escape returns to dock',async()=>{
 const h=harness();const dock=h.document.createElement('button');dock.id='btnSmartReply';h.document.body.appendChild(dock);
 await h.module.open();h.button('Gerar resposta').focus();await h.button('Gerar resposta').emit('click');
 assert.equal(h.document.activeElement.className,'smart-reply-text');h.escape();assert.equal(h.document.activeElement,dock);
});
