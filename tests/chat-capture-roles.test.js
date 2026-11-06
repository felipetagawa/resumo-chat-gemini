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
  const message = (name, value, sent = false) => {
    const msg = el('div', { class: sent ? 'msg sent' : 'msg' });
    msg.appendChild(el('div', { class: 'name' }, name));
    const body = el('div', { class: 'message' }); body.appendChild(el('span', {}, value));
    msg.appendChild(body); chat.appendChild(msg); return msg;
  };
  const context = { document, window: {}, MutationObserver: class { observe() {} } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('modules/chat-capture.js', 'utf8'), context);
  return { capture: context.window.ChatCaptureModule, message };
}

test('rótulos por papel: cliente com nome, Você, Outro técnico', () => {
  const h = fixture();
  h.message('Ana Silva', 'o XML não valida');
  h.message('Felipe Okamoto', 'me manda o XML', true);
  h.message('Carlos Suporte', 'já pedi antes', true);
  const result = h.capture.capturarConversaRotulada('felipe  okamoto');
  assert.equal(result.conversation, 'Cliente (Ana Silva): o XML não valida\nVocê: me manda o XML\nOutro técnico: já pedi antes');
  assert.equal(result.fullConversation, result.conversation);
});

test('sem selfName as mensagens enviadas saem como Técnico e o atendimento inteiro entra quando cabe', () => {
  const h = fixture();
  for (let i = 1; i <= 40; i++) h.message(i % 2 ? 'Ana Silva' : 'Felipe Okamoto', `fala ${i}`, i % 2 === 0);
  const result = h.capture.capturarConversaRotulada('');
  assert.match(result.conversation, /^Cliente \(Ana Silva\): fala 1\nTécnico: fala 2\n/);
  assert.ok(result.conversation.endsWith('Técnico: fala 40'));
  assert.equal(result.conversation, result.fullConversation);
});

test('atendimento longo: mantém o começo, marca o meio omitido e traz as mais recentes', () => {
  const h = fixture();
  h.message('Ana Silva', 'Ao emitir a NF-e aparece rejeição 539 duplicidade');
  for (let i = 2; i <= 120; i++) h.message(i % 2 ? 'Ana Silva' : 'Felipe Okamoto', `mensagem ${i} ${'x'.repeat(200)}`, i % 2 === 0);
  h.message('Ana Silva', 'e aí, resolveu?');
  const result = h.capture.capturarConversaRotulada('');
  assert.ok(result.conversation.length <= 16000, String(result.conversation.length));
  assert.match(result.conversation, /^Cliente \(Ana Silva\): Ao emitir a NF-e aparece rejeição 539 duplicidade\n/);
  assert.match(result.conversation, /\n\[\d+ mensagens do meio omitidas\]\n/);
  assert.ok(result.conversation.endsWith('Cliente (Ana Silva): e aí, resolveu?'));
  const omitted = Number(result.conversation.match(/\[(\d+) mensagens/)[1]);
  const lines = result.conversation.split('\n').length;
  assert.equal(lines - 1 + omitted, 121, 'every message is either sent or counted as omitted');
});

test('primeira mensagem enorme é cortada no começo sem estourar o limite', () => {
  const h = fixture();
  h.message('Ana Silva', 'P'.repeat(9000));
  for (let i = 2; i <= 60; i++) h.message(i % 2 ? 'Ana Silva' : 'Felipe Okamoto', `m${i} ${'y'.repeat(300)}`, i % 2 === 0);
  const result = h.capture.capturarConversaRotulada('');
  assert.ok(result.conversation.length <= 16000);
  assert.match(result.conversation, /^Cliente \(Ana Silva\): P+ …\n/);
  assert.ok(result.conversation.split('\n')[0].length <= 3000);
});

test('mensagensDaResposta expõe autor e direção sem dados extras', () => {
  const h = fixture();
  h.message('Ana Silva', 'oi'); h.message('Felipe Okamoto', 'bom dia', true);
  const list = JSON.parse(JSON.stringify(h.capture.mensagensDaResposta()));
  assert.deepEqual(list, [{ author: 'Ana Silva', message: 'oi', sent: false }, { author: 'Felipe Okamoto', message: 'bom dia', sent: true }]);
});

test('mensagem enviada sem nome de autor continua Técnico mesmo com selfName conhecido', () => {
  const h = fixture();
  h.message('Ana Silva', 'oi');
  h.message('Felipe Okamoto', 'bom dia', true);
  h.message('', 'sigo olhando aqui', true);
  const result = h.capture.capturarConversaRotulada('Felipe Okamoto');
  assert.equal(result.conversation, 'Cliente (Ana Silva): oi\nVocê: bom dia\nTécnico: sigo olhando aqui');
});

// Real SZ shape (2026-10-16): no ids, no sent/received classes, the platform icon marks the customer,
// and SZ signs the technician's text with their name.
test('bolhas reais do SZ: ícone marca o cliente, nome sozinho marca o técnico', () => {
  const { el } = require('./mini-dom');
  const document = createDocument();
  document.body.appendChild(el('div', { class: 'sz_contact active' }, [
    el('img', { alt: 'platform', src: '/assets/img/platform/mini/webchat.svg' }),
    el('div', { class: 'contact-name', text: 'ROBERTA' }),
    el('div', { class: 'contact-times', phase: 'attendance' }, [el('span', { class: 'times', title: '16/10/26 08:20', text: '08:28' })])]));
  const bubble = (name, text, customer) => el('div', { class: 'msg' }, [el('div', { class: 'bubble' }, [
    el('div', { class: 'txt' }, [el('div', { class: 'message-details' }, [
      ...(customer ? [el('img', { class: 'icon-platform-mini', src: '/assets/img/platform/mini/webchat.svg' })] : []),
      el('div', { class: 'name', title: name, text: name })])]),
    el('div', { class: 'txt' }, [el('div', { class: 'message' }, [el('span', { text })])])])]);
  const chat = el('div', { class: 'chat' }, [bubble('ROBERTA', 'Eu consigo conectar vcs 2?', true),
    bubble('Felipe', 'Felipe: tem o whatsapp deles?', false)]);
  document.body.appendChild(chat);
  const context = { document, window: {}, MutationObserver: class { observe() {} } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('modules/chat-capture.js', 'utf8'), context);
  const capture = context.window.ChatCaptureModule;
  assert.equal(capture.capturarConversaRotulada('felipe').conversation,
    'Cliente (ROBERTA): Eu consigo conectar vcs 2?\nVocê: tem o whatsapp deles?');
  assert.deepEqual(JSON.parse(JSON.stringify(capture.mensagensDaResposta().filter(m => m.sent))),
    [{ author: 'Felipe', message: 'tem o whatsapp deles?', sent: true }]);
});
