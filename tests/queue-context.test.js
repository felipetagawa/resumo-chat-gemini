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

test('opening a chat stores heuristic + anydesk, then the AI line once', async () => {
  const h = harness({ send: async () => ({ success: true, linha: 'Certificado novo, não emite DANFE.' }) });
  const card = h.card('Sergio Murilo', 's-1', true);
  h.message({ name: 'Sergio Murilo', text: 'Bom dia' });
  h.message({ name: 'Sergio Murilo', text: 'Acabei de instalar um certificado e não emito danfe' });
  h.message({ name: 'Triagem', text: 'Pode me passar o AnyDesk?', side: 'sent' });
  h.message({ name: 'Sergio Murilo', text: '123 456 789' });
  h.message({ name: '', text: 'Triagem transferiu para o atendente Felipe', side: '' });
  await h.mount();
  assert.equal(h.sent.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.sent[0])), { action: 'gerarLinhaProblema',
    mensagens: 'Bom dia\nAcabei de instalar um certificado e não emito danfe\n123 456 789' });
  const stored = h.store.atendeai_queue_context_v1.items['s-1'];
  assert.equal(stored.anydesk, '123456789');
  assert.deepEqual(stored.problem, { text: 'Certificado novo, não emite DANFE', source: 'ai' });
  assert.equal(card.nextElementSibling.querySelector('.atendeai-queue-ctx-problem').textContent, 'Certificado novo, não emite DANFE');
  await h.mutate(); await h.mutate();
  assert.equal(h.sent.length, 1);
});

test('problem only after the transfer: heuristic line, no AI call', async () => {
  const h = harness();
  h.card('Gisele', 'g-1', true);
  h.message({ name: '', text: 'Triagem transferiu para o atendente Felipe', side: '' });
  h.message({ name: 'Gisele', text: 'oi' });
  h.message({ name: 'Gisele', text: 'o pdv travou na venda' });
  await h.mount();
  assert.equal(h.sent.length, 0);
  assert.deepEqual(h.store.atendeai_queue_context_v1.items['g-1'].problem, { text: 'o pdv travou na venda', source: 'heuristic' });
});

test('AI failure or rejected messaging keeps heuristic and never retries', async () => {
  for (const send of [async () => ({ success: false }), async () => { throw new Error('Extension context invalidated'); }]) {
    const h = harness({ send });
    h.card('Lucia', 'l', true);
    h.message({ name: 'Lucia', text: 'erro na rejeição 539' });
    h.message({ name: 'Felipe', text: 'Olá', side: 'sent' });
    await h.mount(); await h.mutate();
    assert.equal(h.sent.length, 1);
    const stored = h.store.atendeai_queue_context_v1.items.l;
    assert.equal(stored.aiRequested, true);
    assert.deepEqual(stored.problem, { text: 'erro na rejeição 539', source: 'heuristic' });
  }
});

test('clicking the code copies digits and shows a short confirmation', async () => {
  const h = harness({ store: { [KEY]: { version: 1, items: { l: item('123456789', 'L') } } } });
  const l = h.card('Lucia', 'l'); await h.mount();
  const code = l.nextElementSibling.querySelector('.atendeai-queue-ctx-code');
  await Promise.all(code.fire('click'));
  assert.deepEqual(h.copied, ['123456789']);
  assert.equal(code.textContent, 'copiado ✓');
  await h.flush();
  assert.equal(code.textContent, '🖥 123 456 789');
});

test('double click edits; Enter saves as manual and AI never overrides it', async () => {
  const h = harness({ store: { [KEY]: { version: 1, items: { l: item(null, 'linha da ia') } } } });
  const l = h.card('Lucia', 'l'); await h.mount();
  const strip = l.nextElementSibling;
  strip.querySelector('.atendeai-queue-ctx-problem').fire('dblclick');
  const input = strip.querySelector('.atendeai-queue-ctx-input');
  assert.equal(input.value, 'linha da ia');
  input.value = 'Rejeição 539 na NF-e do cliente';
  let propagated = true;
  await Promise.all(input.fire('keydown', { key: 'Enter', stopPropagation() { propagated = false; } }));
  await h.flush();
  assert.equal(propagated, false);
  assert.deepEqual(h.store[KEY].items.l.problem, { text: 'Rejeição 539 na NF-e do cliente', source: 'manual' });
  assert.equal(strip.querySelector('.atendeai-queue-ctx-problem').textContent, 'Rejeição 539 na NF-e do cliente');
  await h.context.QueueContextStore.merge('l', { problem: { text: 'outra ia', source: 'ai' } });
  assert.equal(h.store[KEY].items.l.problem.text, 'Rejeição 539 na NF-e do cliente');
});

test('Escape and blur cancel without saving', async () => {
  for (const finish of [i => i.fire('keydown', { key: 'Escape' }), i => i.fire('blur')]) {
    const h = harness({ store: { [KEY]: { version: 1, items: { l: item(null, 'linha da ia') } } } });
    const l = h.card('Lucia', 'l'); await h.mount();
    const strip = l.nextElementSibling;
    strip.querySelector('.atendeai-queue-ctx-problem').fire('dblclick');
    const input = strip.querySelector('.atendeai-queue-ctx-input'); input.value = 'descartar';
    await Promise.all(finish(input)); await h.flush();
    assert.equal(h.store[KEY].items.l.problem.text, 'linha da ia');
    assert.equal(strip.querySelector('.atendeai-queue-ctx-input'), null);
    assert.equal(strip.querySelector('.atendeai-queue-ctx-problem').textContent, 'linha da ia');
  }
});
