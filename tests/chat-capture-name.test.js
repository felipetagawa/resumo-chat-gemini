const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument, el } = require('./mini-dom');

// Real SZ shape (2026-10-16): every queue card carries its own .contact-name, so the first
// .contact-name on the page is the top of the queue, not the open conversation.
function queueCard(name, active = false) {
  return el('div', { class: 'sz_contact-wrapper', id: 'contact' }, [
    el('div', { class: 'sz_contact' + (active ? ' active' : ''), role: 'button' }, [
      el('div', { class: 'name' }, [
        el('img', { src: '/assets/img/platform/mini/webchat.svg', alt: 'platform' }),
        el('div', { class: 'contact-name text-ellipsis', title: `${name} `, text: name })]),
      el('div', { class: 'contact-times', phase: 'attendance' }, [el('span', { class: 'times', title: 'Ontem', text: 'Ontem' })])])]);
}

function bubble(name, text, customer) {
  const details = el('div', { class: 'message-details' }, [
    ...(customer ? [el('img', { class: 'icon-platform-mini', src: '/assets/img/platform/mini/webchat.svg' })] : []),
    el('div', { class: 'name', title: name, text: name })]);
  return el('div', { class: 'msg' }, [el('div', { class: 'bubble' }, [
    el('div', { class: 'txt' }, [details]),
    el('div', { class: 'txt' }, [el('div', { class: 'message' }, [el('span', { text })])])])]);
}

function load(nodes) {
  const document = createDocument();
  nodes.forEach(node => document.body.appendChild(node));
  const context = { document, window: {}, MutationObserver: class { observe() {} } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('modules/chat-capture.js', 'utf8'), context);
  return context.window.ChatCaptureModule;
}

test('nome vem do card ativo, nao do primeiro card da fila', () => {
  const capture = load([
    el('div', { id: 'contact-fields' }, [queueCard('DRYWALL PARIS DISTRIBUIDORA LTDA'), queueCard('ROBERTA', true)]),
    el('div', { class: 'chat' }, [bubble('Felipe', 'Felipe: bom dia', false), bubble('ROBERTA', 'oi', true)])
  ]);
  assert.equal(capture.capturarNomeCliente(), 'ROBERTA');
});

test('sem card ativo, nome vem da bolha do cliente e nunca de um card da fila', () => {
  const capture = load([
    el('div', { id: 'contact-fields' }, [queueCard('DRYWALL PARIS DISTRIBUIDORA LTDA')]),
    el('div', { class: 'chat' }, [bubble('Felipe', 'Felipe: bom dia', false), bubble('MARCOS', 'preciso de ajuda', true)])
  ]);
  assert.equal(capture.capturarNomeCliente(), 'MARCOS');
});

test('sem card ativo e sem nome na conversa, nao inventa o nome de um card da fila', () => {
  const capture = load([
    el('div', { id: 'contact-fields' }, [queueCard('DRYWALL PARIS DISTRIBUIDORA LTDA')])
  ]);
  assert.equal(capture.capturarNomeCliente(), 'Cliente');
});

function loadObservations(nodes) {
  const document = createDocument();
  nodes.forEach(node => document.body.appendChild(node));
  const store = {};
  const context = { document, window: {}, console, setTimeout, clearTimeout, MutationObserver: class { observe() {} },
    StorageHelper: { async get() { return { atendeai_chat_observations: store }; }, async set() {} } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('modules/chat-capture.js', 'utf8'), context);
  context.ChatCaptureModule = context.window.ChatCaptureModule;
  vm.runInContext(fs.readFileSync('modules/observations.js', 'utf8').replace('    init,', '    syncChatContext, init,'), context);
  return { document, observations: context.window.ObservationsModule };
}

test('Observacoes: sem protocolo nem telefone, cada conversa aberta tem a propria chave', async () => {
  const roberta = queueCard('ROBERTA', true), marcos = queueCard('MARCOS');
  const { observations } = loadObservations([
    el('div', { id: 'contact-fields' }, [queueCard('DRYWALL PARIS DISTRIBUIDORA LTDA'), roberta, marcos])
  ]);
  await observations.syncChatContext();
  assert.equal(observations.getCurrentChatMeta().chatKey, 'contact:roberta');

  roberta.children[0].className = 'sz_contact';
  marcos.children[0].className = 'sz_contact active';
  await observations.syncChatContext();
  assert.equal(observations.getCurrentChatMeta().chatKey, 'contact:marcos');
});

test('cabecalho #contact-name fora da fila continua valendo sem card ativo', () => {
  const capture = load([
    el('div', { id: 'contact-fields' }, [queueCard('DRYWALL PARIS DISTRIBUIDORA LTDA')]),
    el('header', {}, [el('div', { id: 'contact-name', text: 'JOANA' })])
  ]);
  assert.equal(capture.capturarNomeCliente(), 'JOANA');
});
