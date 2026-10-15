// tests/queue-context-capture.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./queue-context-harness');

const plain = value => JSON.parse(JSON.stringify(value));

test('reads roles from the open transcript', () => {
  const h = harness(); h.card('Sergio Murilo de Oliveira', 's-1', true);
  h.message({ name: 'Sergio Murilo de Oliveira', text: 'foi renovado em agosto' });
  h.message({ name: 'Automático', text: 'O seu atendimento será iniciado agora', side: 'sent' });
  h.message({ name: 'Felipe', text: 'Olá, boa tarde', side: 'sent' });
  h.message({ name: '', text: 'Triagem transferiu para o atendente Felipe', side: '' });
  assert.deepEqual(plain(h.context.QueueContextCapture.read()), { chatId: 's-1', messages: [
    { role: 'client', text: 'foi renovado em agosto' },
    { role: 'system', text: 'O seu atendimento será iniciado agora' },
    { role: 'agent', text: 'Olá, boa tarde' },
    { role: 'system', text: 'Triagem transferiu para o atendente Felipe' }] });
});

test('a first name alone never confirms ownership', () => {
  const h = harness(); h.card('Gisele Souza', 'g-1', true);
  h.message({ name: 'Gisele', text: 'pois não' });
  assert.equal(h.context.QueueContextCapture.read(), null);
  h.message({ name: 'Gisele Souza', text: 'preciso de ajuda' });
  assert.equal(h.context.QueueContextCapture.read().chatId, 'g-1');
});

test('two cards with the same full name fail closed', () => {
  const h = harness(); h.card('Ana Souza', 'a', true); h.card('Ana Souza', 'b');
  h.message({ name: 'Ana Souza', text: 'oi' });
  assert.equal(h.context.QueueContextCapture.read(), null);
});

test('fails closed: no single active card, or transcript of another customer', () => {
  const none = harness(); none.card('A', 'a'); none.message({ name: 'A', text: 'oi' });
  assert.equal(none.context.QueueContextCapture.read(), null);
  const two = harness(); two.card('A', 'a', true); two.card('B', 'b', true); two.message({ name: 'A', text: 'oi' });
  assert.equal(two.context.QueueContextCapture.read(), null);
  const swapped = harness(); swapped.card('Cássia', 'c', true); swapped.message({ name: 'Lucia', text: 'erro no xml' });
  assert.equal(swapped.context.QueueContextCapture.read(), null);
});

test('messages owned by another chat id are skipped', () => {
  const h = harness(); h.card('Lucia', 'l', true);
  h.message({ name: 'Lucia', text: 'mensagem certa' });
  h.message({ name: 'Lucia', text: 'mensagem de outro chat' }).setAttribute('data-chat-id', 'x');
  assert.deepEqual(plain(h.context.QueueContextCapture.read().messages.map(m => m.text)), ['mensagem certa']);
});
