const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./mini-dom');

function fixture() {
  const document = createDocument();
  const el = (tag, attrs = {}, value = '') => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    n.textContent = value;
    Object.defineProperty(n, 'innerText', { get() { return this.textContent; } });
    n.classList = { contains: cls => n.className.split(' ').includes(cls) };
    return n;
  };
  const card = el('div', { class: 'sz_contact active', 'data-chat-id': 'A' });
  card.appendChild(el('div', { class: 'contact-name' }, 'Ana Silva'));
  document.body.appendChild(card);
  const chat = el('div', { 'data-chat-id': 'A' }); document.body.appendChild(chat);
  const message = (name, value, sent = false, parent = chat) => {
    const msg = el('div', { class: sent ? 'msg sent' : 'msg' });
    msg.appendChild(el('div', { class: 'name' }, name));
    const body = el('div', { class: 'message' }); body.appendChild(el('span', {}, value));
    msg.appendChild(body); parent.appendChild(msg); return msg;
  };
  const observers = [];
  const context = { document, window: {}, MutationObserver: class {
    constructor(fn) { this.fn = fn; observers.push(this); } observe() {}
  } }; vm.createContext(context);
  vm.runInContext(fs.readFileSync('modules/chat-capture.js', 'utf8'), context);
  return { capture: context.window.ChatCaptureModule, document, el, chat, card, message,
    notify() { observers.forEach(o => o.fn([])); } };
}

test('Recentes keeps the last 12 valid textual messages in order and preserves both speakers', () => {
  const h = fixture();
  for (let i = 1; i <= 15; i++) h.message(i % 2 ? 'Ana' : 'Técnico', `fala ${i}`, i % 2 === 0);
  h.message('Automático', 'sistema'); h.message('Ana', '  '); h.message('Automático: bot', 'sistema 2');
  const result = h.capture.capturarContextoResposta();
  assert.equal(result.conversation, 'Técnico: fala 4\nAna: fala 5\nTécnico: fala 6\nAna: fala 7\nTécnico: fala 8\nAna: fala 9\nTécnico: fala 10\nAna: fala 11\nTécnico: fala 12\nAna: fala 13\nTécnico: fala 14\nAna: fala 15');
  assert.match(result.fullConversation, /^Ana: fala 1/);
  assert.doesNotMatch(result.conversation, /sistema/);
});

test('Última mensagem chooses the last customer text, never the last technician message', () => {
  const h = fixture(); h.message('Ana', 'primeira'); h.message('Ana Silva', 'pergunta atual');
  h.message('Técnico', 'resposta do técnico', true); h.message('Automático', 'aviso'); h.message('Ana', '');
  assert.equal(h.capture.capturarContextoResposta('LAST_CUSTOMER').conversation, 'Ana Silva: pergunta atual');
});

test('missing customer text, unknown sender and missing active attendance fail safely', () => {
  const h = fixture(); h.message('Técnico', 'só técnico', true); h.message('Outro técnico', 'sem classe sent');
  assert.equal(h.capture.capturarContextoResposta('LAST_CUSTOMER').conversation, '');
  h.card.remove(); assert.equal(h.capture.capturarContextoResposta().conversation, '');
});

test('available conversation preserves wide capture and existing omission strategy above 16000', () => {
  const h = fixture(); h.message('Ana', 'INICIO' + 'a'.repeat(8000));
  h.message('Ana', 'ULTIMA PERGUNTA'); h.message('Técnico', 'b'.repeat(17000) + 'FIM', true);
  const result = h.capture.capturarContextoResposta('AVAILABLE');
  assert.ok(result.conversation.length <= 16000);
  assert.match(result.conversation, /^Ana: INICIO/); assert.match(result.conversation, /ULTIMA PERGUNTA/);
  assert.match(result.conversation, /omitido/); assert.ok(result.conversation.endsWith('FIM'));
  assert.ok(result.fullConversation.length > 16000);
});

test('recent and last customer modes remain within the API limit with very long messages', () => {
  const h = fixture(); h.message('Ana', 'x'.repeat(20000) + 'PERGUNTA_FINAL');
  for (const mode of ['RECENT', 'LAST_CUSTOMER']) {
    const result = h.capture.capturarContextoResposta(mode);
    assert.ok(result.conversation.length <= 16000); assert.ok(result.conversation.startsWith('Ana: '));
    assert.ok(result.conversation.endsWith('PERGUNTA_FINAL'));
  }
});

test('hidden and foreign attendance messages do not enter any mode or freshness snapshot', () => {
  const h = fixture(); h.message('Ana', 'ATIVO');
  const other = h.el('div', { 'data-chat-id': 'B' }); h.document.body.appendChild(other);
  h.message('Maria', 'OUTRO_CLIENTE', false, other); h.message('Técnico', 'OUTRO_TECNICO', true, other);
  const hidden = h.el('div', { hidden: 'hidden' }); h.document.body.appendChild(hidden);
  h.message('Ana', 'OCULTO', false, hidden);
  for (const mode of ['RECENT', 'LAST_CUSTOMER', 'AVAILABLE']) {
    const result = h.capture.capturarContextoResposta(mode);
    assert.equal(result.conversation, 'Ana: ATIVO'); assert.equal(result.fullConversation, 'Ana: ATIVO');
  }
  h.card.setAttribute('data-chat-id', 'B'); h.card.children[0].textContent = 'Maria';
  assert.equal(h.capture.capturarContextoResposta('LAST_CUSTOMER').conversation, 'Maria: OUTRO_CLIENTE');
});

test('unlabelled messages preserve speaker identification while last customer requires received evidence', () => {
  const h = fixture(); h.message('', 'enviado', true); const received = h.message('', 'recebido');
  received.setAttribute('class', 'msg received');
  assert.equal(h.capture.capturarContextoResposta().conversation, 'Técnico: enviado\nCliente: recebido');
  assert.equal(h.capture.capturarContextoResposta('LAST_CUSTOMER').conversation, 'Cliente: recebido');
});

test('report capture keeps its legacy contract independent of reply modes', () => {
  const h = fixture(); h.message('Ana', 'relatório'); h.message('Técnico', 'retorno', true);
  assert.equal(h.capture.capturarTextoChat(), 'Ana: relatório\nTécnico: retorno');
});

test('two active cards or a changed header with the old unscoped transcript block capture', () => {
  const h = fixture(); h.message('Ana', 'CLIENTE_ANTERIOR', false, h.document.body);
  h.message('Técnico', 'RESPOSTA_ANTERIOR', true, h.document.body);
  h.card.children[0].textContent = 'Maria';
  for (const mode of ['RECENT', 'LAST_CUSTOMER', 'AVAILABLE']) {
    assert.equal(h.capture.capturarContextoResposta(mode).conversation, '');
  }
  h.card.children[0].textContent = 'Ana Silva';
  h.document.body.appendChild(h.el('div', { class: 'sz_contact active', 'data-chat-id': 'B' }));
  assert.equal(h.capture.capturarContextoResposta().conversation, '');
});

test('foreign inbound text without attendance attributes is excluded from the active context', () => {
  const h = fixture(); h.message('Ana', 'ATIVO', false, h.document.body);
  h.message('Maria', 'OUTRO_CLIENTE', false, h.document.body);
  assert.equal(h.capture.capturarContextoResposta('AVAILABLE').conversation, 'Ana: ATIVO');
});

test('available mode uses the exact 16000-character boundary without omitting shorter text', () => {
  const h = fixture(); const msg = h.message('Ana', 'a'.repeat(15995));
  const exact = h.capture.capturarContextoResposta('AVAILABLE').conversation;
  assert.equal(exact.length, 16000); assert.doesNotMatch(exact, /omitido/);
  msg.querySelector('.message span').textContent += 'b';
  const over = h.capture.capturarContextoResposta('AVAILABLE').conversation;
  assert.ok(over.length <= 16000); assert.match(over, /omitido/); assert.ok(over.endsWith('b'));
});

test('audio or attachment messages without textual spans do not count toward the last 12', () => {
  const h = fixture(); h.message('Ana', 'pergunta');
  for (let i = 0; i < 15; i++) {
    const msg = h.message('Ana', ''); msg.querySelector('.message span').remove();
    msg.querySelector('.message').appendChild(h.el('audio', { src: 'audio-local' }));
  }
  assert.equal(h.capture.capturarContextoResposta().conversation, 'Ana: pergunta');
  assert.equal(h.capture.capturarContextoResposta('LAST_CUSTOMER').conversation, 'Ana: pergunta');
});

test('unscoped technician-only text cannot establish ownership of the active attendance', () => {
  const h = fixture(); h.message('Técnico', 'OLD_TECH_ONLY', true, h.document.body);
  h.card.setAttribute('data-chat-id', 'B'); h.card.children[0].textContent = 'Maria';
  for (const mode of ['RECENT', 'AVAILABLE']) assert.equal(h.capture.capturarContextoResposta(mode).conversation, '');
  h.message('Técnico', 'OWNED_TECH_ONLY', true, h.chat); h.chat.setAttribute('data-chat-id', 'B');
  assert.equal(h.capture.capturarContextoResposta().conversation, 'Técnico: OWNED_TECH_ONLY');
});

test('same-name attendance switch cannot reuse unscoped message nodes from the previous attendance', () => {
  const h = fixture(); h.message('Ana', 'OLD_CUSTOMER', false, h.document.body);
  assert.equal(h.capture.capturarContextoResposta('LAST_CUSTOMER').conversation, 'Ana: OLD_CUSTOMER');
  h.card.setAttribute('data-chat-id', 'B');
  for (const mode of ['RECENT', 'LAST_CUSTOMER', 'AVAILABLE']) assert.equal(h.capture.capturarContextoResposta(mode).conversation, '');
  h.message('Ana', 'NEW_CUSTOMER', false, h.document.body);
  assert.equal(h.capture.capturarContextoResposta('LAST_CUSTOMER').conversation, 'Ana: NEW_CUSTOMER');
});

test('watching attendance before first generation protects a same-name switch without an earlier preview', () => {
  const h = fixture(); h.message('Ana', 'OLD_CUSTOMER', false, h.document.body);
  h.capture.observarAtendimentoResposta();
  h.card.setAttribute('data-chat-id', 'B'); h.notify();
  assert.equal(h.capture.capturarContextoResposta('LAST_CUSTOMER').conversation, '');
  h.message('Ana', 'NEW_CUSTOMER', false, h.document.body); h.notify();
  assert.equal(h.capture.capturarContextoResposta().conversation, 'Ana: NEW_CUSTOMER');
});

test('changing container ownership before replacing its messages does not retarget old nodes', () => {
  const h = fixture(); h.message('Ana', 'OLD_CUSTOMER'); h.message('Técnico', 'OLD_TECH', true);
  h.capture.observarAtendimentoResposta();
  h.card.setAttribute('data-chat-id', 'B'); h.chat.setAttribute('data-chat-id', 'B'); h.notify();
  for (const mode of ['RECENT', 'LAST_CUSTOMER', 'AVAILABLE']) assert.equal(h.capture.capturarContextoResposta(mode).conversation, '');
  h.message('Ana', 'NEW_CUSTOMER'); h.notify();
  assert.equal(h.capture.capturarContextoResposta('AVAILABLE').conversation, 'Ana: NEW_CUSTOMER');
});
