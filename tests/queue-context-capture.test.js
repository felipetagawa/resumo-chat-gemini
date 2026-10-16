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
  const ok = harness(); ok.card('Gisele Souza', 'g-1', true);
  ok.message({ name: 'Gisele Souza', text: 'preciso de ajuda' });
  assert.equal(ok.context.QueueContextCapture.read().chatId, 'g-1');
});

test('a transcript mixing two customers stores nothing (SZ mid-switch)', () => {
  const h = harness(); h.card('ROBERTA', 'r', true); h.card('LIZA', 'l');
  h.message({ name: 'LIZA', text: 'meu anydesk 987 654 321' });
  h.message({ name: 'Felipe', text: 'Me passa o AnyDesk?', side: 'sent' });
  h.message({ name: 'ROBERTA', text: '123 456 789' });
  assert.equal(h.context.QueueContextCapture.read(), null);
});

test('hidden transcripts kept in the DOM by SZ are ignored', () => {
  const h = harness(); h.card('ROBERTA', 'r', true);
  const old = h.message({ name: 'LIZA', text: 'erro no xml' }); old.checkVisibility = () => false;
  const mine = h.message({ name: 'ROBERTA', text: 'Não emite nota' }); mine.checkVisibility = () => true;
  assert.deepEqual(plain(h.context.QueueContextCapture.read().messages), [{ role: 'client', text: 'Não emite nota' }]);
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

// Real SZ bubble (2026-10-16): no sent/received classes; customer messages carry the platform icon.
function realMessage(h, { name, text, customer }) {
  const { el } = require('./queue-context-harness');
  const details = el('div', { class: 'message-details' }, [
    ...(customer ? [el('img', { src: '/assets/img/platform/mini/webchat.svg', class: 'icon-platform-mini' })] : []),
    el('div', { class: 'name', title: name, text: name })]);
  const m = el('div', { class: 'msg', id: 'msg_ref_x' }, [el('div', { class: customer ? 'bubble' : 'bubble altfollow' }, [
    el('div', { class: 'txt' }, [details, el('div', { class: 'timestamp', text: '08:12' })]),
    el('div', { class: 'txt' }, [el('div', { class: 'message' }, [el('span', { text })])])])]);
  h.transcript.appendChild(m); return m;
}

test('real SZ bubbles: platform icon marks the customer, a bare name marks the technician', () => {
  const h = harness(); h.card('ROBERTA', 'r', true);
  realMessage(h, { name: 'ROBERTA', text: 'Não emite nota', customer: true });
  realMessage(h, { name: 'Felipe', text: 'Bom dia, me passa o AnyDesk?' });
  assert.deepEqual(JSON.parse(JSON.stringify(h.context.QueueContextCapture.read())), { chatId: 'r', messages: [
    { role: 'client', text: 'Não emite nota' }, { role: 'agent', text: 'Bom dia, me passa o AnyDesk?' }] });
});

test('real SZ bubbles from another customer still fail closed', () => {
  const h = harness(); h.card('ROBERTA', 'r', true);
  realMessage(h, { name: 'LIZA', text: 'oi', customer: true });
  assert.equal(h.context.QueueContextCapture.read(), null);
});
