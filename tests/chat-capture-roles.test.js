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

test('sem selfName as mensagens enviadas saem como Técnico e só as 12 últimas entram', () => {
  const h = fixture();
  for (let i = 1; i <= 14; i++) h.message(i % 2 ? 'Ana Silva' : 'Felipe Okamoto', `fala ${i}`, i % 2 === 0);
  const result = h.capture.capturarConversaRotulada('');
  assert.match(result.conversation, /^Cliente \(Ana Silva\): fala 3\nTécnico: fala 4\n/);
  assert.match(result.fullConversation, /^Cliente \(Ana Silva\): fala 1/);
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
