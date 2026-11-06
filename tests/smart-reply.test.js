const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Node {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.listeners = {}; this.attrs = {}; this.className = '';
    this.style = { width: '', height: '' }; this.value = ''; this.textContent = ''; this.hidden = false;
    this.offsetWidth = 200; this.offsetHeight = 50; this.events = [];
  }
  appendChild(n) { this.children.push(n); n.parent = this; return n; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
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
const deepText = n => n.textContent + n.children.map(deepText).join('');
const visible = n => { for (let p = n; p; p = p.parent) if (p.hidden) return false; return true; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };

function harness(store = {}) {
  const body = new Node('body'), composer = new Node('textarea');
  const live = { conversation: 'Gabriel: preciso de ajuda', complement: 'verificação em andamento', name: 'Gabriel',
    platform: 'webchat', time: '06/10/26 08:14', selfName: '', samples: [], inserted: null, clipboard: null, clipboardFails: false };
  const card = new Node();
  card.querySelector = selector => {
    if (selector === '.contact-name') return { textContent: live.name, innerText: live.name };
    if (selector.includes('phase=')) return { getAttribute: () => live.time, textContent: '08:14' };
    if (selector.includes('platform')) return { getAttribute: () => `/assets/img/platform/mini/${live.platform}.svg` };
    return null;
  };
  card.getAttribute = () => null;
  const listeners = {}, observers = [], sent = [];
  let resolveReply, deferred = false, fail = false, nextReply = null, messageSource, messageNodes = [];
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
    createElement: tag => new Node(tag),
    getElementById: id => all(body).find(n => n.id === id) || null,
    querySelector: sel => sel === '.sz_contact.active' ? card : null,
    querySelectorAll: sel => sel === '.msg' ? replyMessages() : sel === '.sz_contact.active' ? [card] : [composer],
    addEventListener(k, fn) { (listeners[k] ||= []).push(fn); },
    createRange() { return { selectNodeContents() {}, collapse() {} }; } };
  const context = { document, window: { getSelection: () => ({ removeAllRanges() {}, addRange() {} }) },
    navigator: { clipboard: { async writeText(value) { if (live.clipboardFails) throw new Error('denied'); live.clipboard = value; } } },
    setTimeout: () => 0,
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
      const reply = nextReply || { success: true, reply: 'Pode informar o erro exibido?', sources: [] };
      nextReply = null;
      return reply;
    } } };
  vm.createContext(context);
  context.globalThis = context;
  vm.runInContext(fs.readFileSync('modules/chat-capture.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('modules/reply-chat-store.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('modules/smart-reply.js', 'utf8'), context);
  const find = predicate => all(body).find(predicate);
  const hasClass = (n, cls) => String(n.className || '').split(' ').includes(cls);
  const byClass = cls => find(n => hasClass(n, cls));
  const allByClass = cls => all(body).filter(n => hasClass(n, cls));
  const module = context.window.SmartReplyModule;
  const button = label => find(n => n.tagName === 'button' && n.textContent === label && visible(n));
  const buttons = label => all(body).filter(n => n.tagName === 'button' && n.textContent === label);
  const notify = () => observers.filter(o => !o.disconnected).forEach(o => o.fn([{ target: card }]));
  const switchTo = async (name, time, conversation) => {
    live.name = name; live.time = time; live.conversation = conversation; notify(); await settle();
  };
  return { module, context, live, composer, store, sent, byClass, allByClass, button, buttons, switchTo, notify,
    panel: () => document.getElementById('atendeai-smart-reply'),
    input: () => byClass('smart-reply-input'),
    replies: () => allByClass('smart-reply-reply').filter(visible).map(n => n.textContent),
    status: () => deepText(byClass('smart-reply-status') || new Node()).trim(),
    useNotices(fake) { context.DailyNoticesModule = fake; },
    nextReply(value) { nextReply = value; },
    defer() { deferred = true; }, respond(reply = 'Resposta tardia') { deferred = false; resolveReply({ success: true, reply, sources: [] }); },
    fail() { fail = true; }, succeed() { fail = false; },
    keydown(event) { (listeners.keydown || []).forEach(fn => fn(event)); },
    escape() { (listeners.keydown || []).forEach(fn => fn({ key: 'Escape' })); } };
}

async function openAndResolve(h) {
  await h.module.open(); await settle();
  await h.button('Resolver').emit('click'); await settle();
}

test('abrir mostra a janela vazia com os botões rápidos e não chama a API', async () => {
  const h = harness(); await h.module.open(); await settle();
  assert.equal(h.panel().parent.tagName, 'body');
  assert.equal(h.sent.length, 0);
  const chips = h.byClass('smart-reply-chips').children;
  assert.deepEqual(chips.filter(c => !c.hidden).map(c => c.textContent), ['Resolver', 'Pedir info', 'Cliente difícil', 'Cobrar', 'Encerrar']);
  assert.equal(deepText(h.byClass('smart-reply-reading')).trim(), 'Lendo o atendimento de Gabriel');
  assert.match(deepText(h.byClass('smart-reply-empty')), /Escolha o tipo de resposta, ou escreva o que quer dizer ao cliente\./);
  assert.equal(h.input().placeholder, 'Diga o que responder, ou corrija a última… (Enter envia)');
});

test('clicar em Resolver manda a intenção e o histórico, e a resposta aparece pronta para o cliente', async () => {
  const h = harness(); await openAndResolve(h);
  assert.deepEqual(h.sent, [{ action: 'gerarResposta', conversation: 'Cliente (Gabriel): preciso de ajuda', intent: 'resolver',
    messages: [{ role: 'user', content: 'Resolver' }], promptComplement: 'verificação em andamento' }]);
  const bot = h.byClass('smart-reply-bot');
  assert.equal(deepText(h.byClass('smart-reply-label')), 'Resposta para o cliente');
  assert.deepEqual(h.replies(), ['Pode informar o erro exibido?']);
  const reply = h.byClass('smart-reply-reply');
  assert.ok(!['true', 'plaintext-only'].includes(String(reply.contentEditable)), 'the reply is not edited in place');
  assert.ok(bot.contains(reply));
  assert.equal(deepText(h.byClass('smart-reply-user')), 'Resolver');
  assert.ok(visible(h.byClass('smart-reply-chips-compact')), 'quick replies stay available after the first answer');
  assert.equal(h.composer.value, ''); assert.deepEqual(h.composer.events, []);
});

test('as páginas do manual aparecem como Base: e só links oficiais viram link', async () => {
  const h = harness();
  h.nextReply({ success: true, reply: 'Consulta a chave na SEFAZ.', sources: [
    { title: 'Rejeição 539', url: 'https://docs.softensistemas.com.br/x' }, { title: 'Mal', url: 'https://evil.example/' }] });
  await openAndResolve(h);
  const sources = h.byClass('smart-reply-sources');
  assert.ok(visible(sources));
  assert.match(deepText(sources), /^Base:/);
  const links = h.allByClass('smart-reply-source');
  assert.equal(links.length, 1);
  assert.equal(links[0].tagName, 'a');
  assert.equal(links[0].href, 'https://docs.softensistemas.com.br/x');
  assert.equal(links[0].target, '_blank');
  assert.equal(links[0].rel, 'noopener noreferrer');
  h.input().value = 'mais curto'; await h.input().emit('keydown', { key: 'Enter' }); await settle();
  assert.equal(h.replies().length, 2);
  assert.equal(h.allByClass('smart-reply-sources').filter(visible).length, 1, 'a reply without sources shows no Base:');
});

test('mensagem livre com Enter manda o histórico inteiro com a resposta anterior', async () => {
  const h = harness(); await openAndResolve(h);
  h.input().value = '  ela já tentou  ';
  await h.input().emit('keydown', { key: 'Enter' }); await settle();
  assert.deepEqual(h.sent[1].messages, [{ role: 'user', content: 'Resolver' }, { role: 'assistant', content: 'Pode informar o erro exibido?' },
    { role: 'user', content: 'ela já tentou' }]);
  assert.equal(h.sent[1].intent, undefined);
  assert.equal(h.sent[1].regenerate, undefined);
  assert.equal(h.input().value, '');
  assert.equal(h.replies().length, 2);
});

test('Shift+Enter não envia e as teclas não chegam aos atalhos do SZ', async () => {
  const h = harness(); await h.module.open(); await settle();
  let stopped = 0;
  const stopPropagation = () => { stopped++; };
  h.input().value = 'linha um';
  await h.input().emit('keydown', { key: 'Enter', shiftKey: true, stopPropagation });
  await h.input().emit('keydown', { key: 'a', stopPropagation });
  assert.equal(h.sent.length, 0);
  assert.equal(stopped, 2);
  h.escape();
  assert.equal(h.panel(), null, 'Esc closes the window');
});

test('a conversa fica salva por atendimento e volta ao reabrir', async () => {
  const h = harness(); await openAndResolve(h);
  h.module.close(); assert.equal(h.panel(), null);
  await h.module.open(); await settle();
  assert.deepEqual(h.replies(), ['Pode informar o erro exibido?']);
  assert.equal(deepText(h.byClass('smart-reply-user')), 'Resolver');
  assert.equal(h.sent.length, 1, 'reopening never calls the API');
  await h.module.open();
  assert.equal(h.panel(), null, 'the dock button toggles the window');
});

test('Nova limpa só a conversa deste atendimento', async () => {
  const h = harness(); await openAndResolve(h);
  await h.switchTo('Marta', '06/10/26 09:00', 'Marta: a nota não sai');
  await h.button('Resolver').emit('click'); await settle();
  await h.button('Nova').emit('click'); await settle();
  assert.deepEqual(h.replies(), []);
  assert.ok(h.byClass('smart-reply-empty'));
  await h.switchTo('Gabriel', '06/10/26 08:14', 'Gabriel: preciso de ajuda');
  assert.deepEqual(h.replies(), ['Pode informar o erro exibido?']);
});

test('trocar de atendimento com a janela aberta mostra a conversa do outro', async () => {
  const h = harness(); await openAndResolve(h);
  await h.switchTo('Marta', '06/10/26 09:00', 'Marta: a nota não sai');
  assert.equal(deepText(h.byClass('smart-reply-reading')).trim(), 'Lendo o atendimento de Marta');
  assert.deepEqual(h.replies(), []);
  await h.button('Pedir info').emit('click'); await settle();
  assert.equal(h.sent[1].conversation, 'Cliente (Marta): a nota não sai');
  assert.deepEqual(h.sent[1].messages, [{ role: 'user', content: 'Pedir info' }]);
});

test('resposta que chega depois da troca vai para o atendimento de origem e não aparece no novo', async () => {
  const h = harness(); h.defer();
  await h.module.open(); await settle();
  const pending = h.button('Resolver').emit('click'); await settle();
  await h.switchTo('Marta', '06/10/26 09:00', 'Marta: a nota não sai');
  h.respond('Tarde'); await pending; await settle();
  assert.deepEqual(h.replies(), [], 'never shown in the attendance now open');
  await h.switchTo('Gabriel', '06/10/26 08:14', 'Gabriel: preciso de ajuda');
  assert.deepEqual(h.replies(), ['Tarde']);
});

test('falha mostra o erro com Tentar de novo, que reenvia a mesma mensagem', async () => {
  const h = harness(); h.fail();
  await openAndResolve(h);
  assert.match(deepText(h.byClass('smart-reply-error')), /Falha temporária/);
  h.succeed();
  await h.button('Tentar de novo').emit('click'); await settle();
  assert.deepEqual(h.sent[1].messages, [{ role: 'user', content: 'Resolver' }]);
  assert.equal(h.sent[1].intent, 'resolver');
  assert.equal(h.byClass('smart-reply-error'), undefined);
  assert.deepEqual(h.replies(), ['Pode informar o erro exibido?']);
});

test('sem identidade segura não gera e mostra o aviso', async () => {
  const h = harness(); h.live.platform = '';
  await h.module.open(); await settle();
  assert.match(h.status(), /Não foi possível identificar com segurança o atendimento ativo\. Reabra a conversa\./);
  await h.buttons('Resolver')[0].emit('click'); await settle();
  assert.equal(h.sent.length, 0);
});

test('mensagem nova do cliente mostra o aviso de atualização', async () => {
  const h = harness(); await openAndResolve(h);
  const stale = () => h.byClass('smart-reply-stale');
  assert.ok(!visible(stale()));
  h.live.conversation += '\nGabriel: e agora?'; h.notify(); await settle();
  assert.ok(visible(stale()));
  assert.equal(deepText(stale()), 'O cliente mandou mensagem nova. Envie algo para atualizar.');
  h.input().value = 'responde isso'; await h.input().emit('keydown', { key: 'Enter' }); await settle();
  assert.match(h.sent.at(-1).conversation, /e agora\?/);
  assert.ok(!visible(stale()));
});

test('retireLegacyProfiles apaga só as chaves de perfil antigas', () => {
  const store = { atendeai_smart_reply_profiles_v1: { version: 1, items: [] }, atendeai_smart_reply_profile: 'EMPATHETIC',
    customInstructions: 'LEGACY_NO_MIGRATION' };
  harness(store).module.retireLegacyProfiles();
  assert.deepEqual(Object.keys(store), ['customInstructions']);
});

function fakeNotices() {
  let active = [];
  return {
    DURATIONS: [['today', 'Até hoje 23h59']], MAX_TEXT: 500,
    async list() { return active.map((text, i) => ({ id: `n${i}`, text, expiresAt: Date.now() + 3600000 })); },
    async forRequest() { return active.slice(); },
    async add(text) { active.push(text); }, async remove() { active = []; },
    untilLabel: () => 'até 23h59'
  };
}

test('Inserir no chat escreve no campo sem enviar, avisa as amostras e mantém a janela aberta', async () => {
  const h = harness(); await openAndResolve(h);
  await h.button('Inserir no chat').emit('click');
  assert.equal(h.composer.value, 'Pode informar o erro exibido?');
  assert.deepEqual(h.composer.events, ['input']);
  assert.equal(h.live.inserted, 'Pode informar o erro exibido?');
  assert.notEqual(h.panel(), null);
});

test('rascunho existente pede Substituir, Acrescentar ou Cancelar', async () => {
  const h = harness(); h.composer.value = 'rascunho meu'; await openAndResolve(h);
  await h.button('Inserir no chat').emit('click');
  assert.equal(h.composer.value, 'rascunho meu');
  const choices = h.byClass('smart-reply-draft-choices');
  assert.ok(visible(choices));
  await h.button('Cancelar').emit('click');
  assert.ok(!visible(choices));
  await h.button('Inserir no chat').emit('click');
  await h.button('Acrescentar').emit('click');
  assert.equal(h.composer.value, 'rascunho meu\nPode informar o erro exibido?');
  assert.ok(!visible(choices));
  h.composer.value = 'outro rascunho';
  await h.button('Inserir no chat').emit('click');
  await h.button('Substituir').emit('click');
  assert.equal(h.composer.value, 'Pode informar o erro exibido?');
});

test('Copiar copia o texto, avisa as amostras e mostra Copiado', async () => {
  const h = harness(); await openAndResolve(h);
  const copy = h.button('Copiar');
  await copy.emit('click');
  assert.equal(h.live.clipboard, 'Pode informar o erro exibido?');
  assert.equal(h.live.inserted, 'Pode informar o erro exibido?');
  assert.equal(copy.textContent, 'Copiado');
});

test('Copiar sem permissão mostra Não copiou', async () => {
  const h = harness(); h.live.clipboardFails = true; await openAndResolve(h);
  const copy = h.button('Copiar');
  await copy.emit('click');
  assert.equal(copy.textContent, 'Não copiou');
  assert.equal(h.live.inserted, null);
});

test('só a resposta mais recente pode ser inserida', async () => {
  const h = harness(); await openAndResolve(h);
  h.input().value = 'mais curto'; await h.input().emit('keydown', { key: 'Enter' }); await settle();
  const inserts = h.buttons('Inserir no chat');
  assert.equal(inserts.length, 2);
  assert.equal(inserts[0].disabled, true);
  assert.equal(inserts[1].disabled, false);
  assert.equal(h.buttons('Copiar').every(b => !b.disabled), true);
});

test('mensagem nova do cliente trava Inserir mas Copiar continua', async () => {
  const h = harness(); await openAndResolve(h);
  h.live.conversation += '\nGabriel: e agora?'; h.notify(); await settle();
  assert.equal(h.buttons('Inserir no chat')[0].disabled, true);
  await h.buttons('Inserir no chat')[0].emit('click');
  assert.equal(h.composer.value, '');
  await h.button('Copiar').emit('click');
  assert.equal(h.live.clipboard, 'Pode informar o erro exibido?');
});

test('sem atendimento identificado Inserir fica travado', async () => {
  const h = harness(); await openAndResolve(h);
  h.live.platform = ''; h.notify(); await settle();
  assert.equal(h.buttons('Inserir no chat')[0].disabled, true);
  assert.match(h.status(), /Reabra a conversa/);
  await h.buttons('Inserir no chat')[0].emit('click');
  assert.equal(h.composer.value, '');
});

test('Ctrl+Enter insere a resposta mais recente', async () => {
  const h = harness(); await openAndResolve(h);
  await h.panel().emit('keydown', { key: 'Enter', ctrlKey: true });
  assert.equal(h.composer.value, 'Pode informar o erro exibido?');
  let stopped = 0;
  await h.input().emit('keydown', { key: 'Enter', ctrlKey: true, stopPropagation() { stopped++; } });
  assert.equal(stopped, 0, 'Ctrl+Enter bubbles from the input to the window');
  assert.equal(h.sent.length, 1, 'Ctrl+Enter never sends a chat message');
});

test('Avisos abre o painel, adiciona e remove; Aviso só aparece com aviso ativo', async () => {
  const h = harness(); h.useNotices(fakeNotices());
  await h.module.open(); await settle();
  const toggle = h.byClass('smart-reply-notices-toggle');
  assert.equal(toggle.textContent, 'Avisos');
  assert.equal(h.button('Aviso'), undefined, 'hidden without notices');
  await toggle.emit('click');
  assert.ok(visible(h.byClass('smart-reply-notices')));
  h.byClass('smart-reply-notice-input').value = 'SEFAZ-MG instável desde 9h';
  await h.button('Adicionar').emit('click'); await settle();
  assert.equal(toggle.textContent, 'Avisos (1)');
  assert.ok(h.button('Aviso'));
  await h.button('Aviso').emit('click'); await settle();
  assert.equal(h.sent.at(-1).intent, 'aviso');
  assert.deepEqual(h.sent.at(-1).notices, ['SEFAZ-MG instável desde 9h']);
  const remove = h.allByClass('smart-reply-notice-remove')[0];
  assert.equal(remove.getAttribute('aria-label'), 'Remover aviso');
  await remove.emit('click'); await settle();
  assert.equal(toggle.textContent, 'Avisos');
});

test('selo adendo só aparece quando o adendo foi usado', async () => {
  const h = harness(); h.live.complement = '';
  await openAndResolve(h);
  const badge = h.byClass('smart-reply-badge');
  assert.equal(badge.textContent, 'adendo');
  assert.ok(!visible(badge));
  assert.equal(h.sent[0].promptComplement, undefined);
  h.live.complement = 'cliente já reinstalou';
  h.input().value = 'de novo'; await h.input().emit('keydown', { key: 'Enter' }); await settle();
  assert.ok(visible(badge));
});

test('abrir o Sugerir resposta fecha o Consultar Docs', async () => {
  const h = harness();
  let closed = 0;
  h.context.DocsModule = { close() { closed++; } };
  await h.module.open(); await settle();
  assert.equal(closed, 1);
  assert.ok(h.panel());
});

test('Ctrl+Enter insere sem deixar a tecla chegar aos atalhos do SZ', async () => {
  const h = harness(); await openAndResolve(h);
  let stopped = 0, prevented = 0;
  await h.panel().emit('keydown', { key: 'Enter', ctrlKey: true, stopPropagation() { stopped++; }, preventDefault() { prevented++; } });
  assert.equal(h.composer.value, 'Pode informar o erro exibido?');
  assert.equal(stopped, 1, 'SZ must never see the Ctrl+Enter that just filled its composer');
  assert.equal(prevented, 1);
});

test('Nova fica travado enquanto a resposta está a caminho e a conversa não volta depois', async () => {
  const h = harness(); h.defer();
  await h.module.open(); await settle();
  const pending = h.button('Resolver').emit('click'); await settle();
  const nova = h.button('Nova');
  assert.equal(nova.disabled, true);
  await nova.emit('click'); await settle();
  h.respond('Chegou'); await pending; await settle();
  assert.deepEqual(h.replies(), ['Chegou'], 'the reply that was paid for is shown, not lost');
  assert.equal(h.button('Nova').disabled, false);
  await h.button('Nova').emit('click'); await settle();
  h.module.close(); await h.module.open(); await settle();
  assert.deepEqual(h.replies(), [], 'a cleared conversation stays cleared');
});

test('resposta a caminho sobrevive a fechar e reabrir a janela e Nova não traz a conversa de volta', async () => {
  const h = harness(); h.defer();
  await h.module.open(); await settle();
  const pending = h.button('Resolver').emit('click'); await settle();
  h.module.close(); await h.module.open(); await settle();
  assert.ok(h.byClass('smart-reply-typing'), 'the reopened window shows the reply on its way');
  assert.equal(h.button('Enviar').disabled, true);
  assert.equal(h.button('Nova').disabled, true);
  await h.button('Nova').emit('click'); await settle();
  h.respond('Chegou'); await pending; await settle();
  assert.deepEqual(h.replies(), ['Chegou'], 'the reply shows up in the window open now');
  assert.equal(h.byClass('smart-reply-typing'), undefined);
  await h.button('Nova').emit('click'); await settle();
  h.module.close(); await h.module.open(); await settle();
  assert.deepEqual(h.replies(), [], 'a cleared conversation stays cleared');
  assert.deepEqual(Object.keys(h.store.atendeai_reply_chats_v1.items), [], 'nor does storage bring it back');
});

test('um botão rápido logo depois de Nova vai para a conversa nova e fica salvo', async () => {
  const h = harness(); await openAndResolve(h);
  const clearing = h.button('Nova').emit('click');
  await h.button('Pedir info').emit('click'); await clearing; await settle();
  assert.deepEqual(h.allByClass('smart-reply-user').map(n => n.textContent), ['Pedir info']);
  assert.deepEqual(h.replies(), ['Pode informar o erro exibido?']);
  assert.deepEqual(Object.values(h.store.atendeai_reply_chats_v1.items).map(item => item.messages.map(m => m.content)),
    [['Pedir info', 'Pode informar o erro exibido?']]);
});
