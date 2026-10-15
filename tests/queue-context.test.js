// tests/queue-context.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./queue-context-harness');
const KEY = 'atendeai_queue_context_v1';
const item = (anydesk, text, source = 'ai') =>
  ({ anydesk, problem: text ? { text, source } : null, aiRequested: true, updatedAt: 1_000_000_000 });

test('strip is a sibling right after its card and never touches the card', async () => {
  const h = harness({ store: { [KEY]: { version: 1, items: { 'lucia-1': item('123456789', 'Não emite DANFE') } } } });
  const lucia = h.card('Lucia', 'lucia-1'); h.card('Cássia', 'cassia-1');
  const before = lucia.children.slice();
  await h.mount();
  const strip = lucia.nextElementSibling;
  assert.equal(strip.className, 'atendeai-queue-ctx');
  assert.equal(strip.getAttribute('data-for-chat'), 'lucia-1');
  assert.deepEqual(lucia.children, before);
  assert.equal(strip.querySelector('.atendeai-queue-ctx-code').textContent, '🖥 123 456 789');
  assert.equal(strip.querySelector('.atendeai-queue-ctx-problem').textContent, 'Não emite DANFE');
  assert.equal(strip.querySelector('.atendeai-queue-ctx-problem').title, 'Não emite DANFE');
  assert.equal(h.strips().length, 1);
});

test('no content, unknown or duplicated chat id: no strip', async () => {
  const h = harness({ store: { [KEY]: { version: 1, items: { dup: item('123456789', 'x') } } } });
  h.card('Ana', 'dup'); h.card('Ana 2', 'dup'); h.card('Bia', 'empty');
  await h.mount();
  assert.equal(h.strips().length, 0);
});

test('anydesk only renders without separator; heuristic line is marked', async () => {
  const h = harness({ store: { [KEY]: { version: 1, items: {
    a: item('123456789', null), b: item(null, 'erro xml', 'heuristic') } } } });
  h.card('A', 'a'); h.card('B', 'b'); await h.mount();
  const [sa, sb] = h.strips();
  assert.equal(sa.querySelector('.atendeai-queue-ctx-sep'), null);
  assert.equal(sb.querySelector('.atendeai-queue-ctx-code'), null);
  assert.equal(sb.querySelector('.atendeai-queue-ctx-problem').getAttribute('data-source'), 'heuristic');
});

test('reorder and removal are reconciled by chat id, never by index', async () => {
  const h = harness({ store: { [KEY]: { version: 1, items: { l: item('111111111', 'L'), c: item('222222222', 'C') } } } });
  const l = h.card('Lucia', 'l'), c = h.card('Cássia', 'c'); await h.mount();
  h.list.insertBefore(c, l); await h.mutate();
  assert.equal(c.nextElementSibling.getAttribute('data-for-chat'), 'c');
  assert.equal(l.nextElementSibling.getAttribute('data-for-chat'), 'l');
  l.remove(); await h.mutate();
  assert.deepEqual(h.strips().map(s => s.getAttribute('data-for-chat')), ['c']);
});

test('positioned or transformed cards disable the feature', async () => {
  for (const style of [{ position: 'absolute' }, { transform: 'translateY(64px)' }]) {
    const h = harness({ store: { [KEY]: { version: 1, items: { l: item('111111111', 'L') } } } });
    const l = h.card('Lucia', 'l'); Object.assign(l.style, style);
    await h.mount();
    assert.equal(h.strips().length, 0); assert.match(h.warns.join('\n'), /desligado/);
  }
});

test('any overlap with neighbour cards removes all strips and disables', async () => {
  const h = harness({ store: { [KEY]: { version: 1, items: { l: item('111111111', 'L') } } } });
  const l = h.card('Lucia', 'l'), c = h.card('Cássia', 'c');
  l.getBoundingClientRect = () => ({ top: 0, bottom: 60, left: 0, right: 300 });
  c.getBoundingClientRect = () => ({ top: 76, bottom: 136, left: 0, right: 300 });
  await h.mount();
  const strip = l.nextElementSibling;
  strip.getBoundingClientRect = () => ({ top: 70, bottom: 86, left: 0, right: 300 });
  await h.mutate();
  assert.equal(h.strips().length, 0); assert.match(h.warns.join('\n'), /sobreposição/);
  h.store[KEY].items.c = item('222222222', 'C'); await h.mutate();
  assert.equal(h.strips().length, 0);
});

test('indent aligns to the contact name when geometry is available', async () => {
  const h = harness({ store: { [KEY]: { version: 1, items: { l: item('111111111', 'L') } } } });
  const l = h.card('Lucia', 'l');
  l.getBoundingClientRect = () => ({ top: 0, bottom: 60, left: 10, right: 300 });
  l.querySelector('.contact-name').getBoundingClientRect = () => ({ top: 5, bottom: 20, left: 92, right: 200 });
  await h.mount();
  assert.equal(l.nextElementSibling.style.paddingLeft, '82px');
});

test('own strip mutations do not schedule work', async () => {
  const h = harness({ store: { [KEY]: { version: 1, items: { l: item('111111111', 'L') } } } });
  const l = h.card('Lucia', 'l'); await h.mount();
  const strip = l.nextElementSibling;
  h.notify([{ target: h.list, addedNodes: [strip], removedNodes: [] }, { target: strip, addedNodes: [], removedNodes: [] }]);
  assert.equal(h.timers.size, 0);
  h.notify([{ target: h.list, addedNodes: [], removedNodes: [] }]);
  assert.equal(h.timers.size, 1);
});
