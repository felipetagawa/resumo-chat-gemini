// tests/queue-context.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./queue-context-harness');
const KEY = 'atendeai_queue_context_v1';
const item = (anydesk, text, source = 'ai') =>
  ({ anydesk, problem: text ? { text, source } : null, aiRequested: true, updatedAt: 1_000_000_000 });

test('strip is a sibling right after its card and never touches the card', async () => {
  const h = harness({ store: { [KEY]: { version: 3, items: { 'lucia-1': item('123456789', 'Não emite DANFE') } } } });
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
  const h = harness({ store: { [KEY]: { version: 3, items: { dup: item('123456789', 'x') } } } });
  h.card('Ana', 'dup'); h.card('Ana 2', 'dup'); h.card('Bia', 'empty');
  await h.mount();
  assert.equal(h.strips().length, 0);
});

test('anydesk only renders without separator; a heuristic line is never shown', async () => {
  const h = harness({ store: { [KEY]: { version: 3, items: {
    a: item('123456789', null), b: item(null, 'erro xml', 'heuristic'), c: item('987654321', 'bom dia preciso de', 'heuristic') } } } });
  h.card('A', 'a'); h.card('B', 'b'); h.card('C', 'c'); await h.mount();
  assert.deepEqual(h.strips().map(s => s.getAttribute('data-for-chat')), ['a', 'c']);
  const [sa, sc] = h.strips();
  assert.equal(sa.querySelector('.atendeai-queue-ctx-sep'), null);
  assert.equal(sc.querySelector('.atendeai-queue-ctx-problem'), null);
  assert.equal(sc.querySelector('.atendeai-queue-ctx-sep'), null);
});

test('options switches hide each part live, and the problem switch skips the AI call', async () => {
  const h = harness({ store: { atendeai_queue_context_problem: false,
    [KEY]: { version: 3, items: { a: item('123456789', 'NF-e rejeição 539'), b: item(null, 'Certificado vencido') } } } });
  h.card('A', 'a'); h.card('B', 'b'); await h.mount();
  assert.deepEqual(h.strips().map(s => s.getAttribute('data-for-chat')), ['a']);
  assert.equal(h.strips()[0].querySelector('.atendeai-queue-ctx-problem'), null);
  await h.setPref('atendeai_queue_context_problem', true);
  assert.equal(h.strips().length, 2);
  await h.setPref('atendeai_queue_context_anydesk', false);
  assert.equal(h.strips()[0].querySelector('.atendeai-queue-ctx-code'), null);
  assert.equal(h.strips()[0].querySelector('.atendeai-queue-ctx-problem').textContent, 'NF-e rejeição 539');
  await h.setPref('atendeai_queue_context_problem', false);
  assert.equal(h.strips().length, 0);
});

test('reorder and removal are reconciled by chat id, never by index', async () => {
  const h = harness({ store: { [KEY]: { version: 3, items: { l: item('111111111', 'L'), c: item('222222222', 'C') } } } });
  const l = h.card('Lucia', 'l'), c = h.card('Cássia', 'c'); await h.mount();
  h.list.insertBefore(c, l); await h.mutate();
  assert.equal(c.nextElementSibling.getAttribute('data-for-chat'), 'c');
  assert.equal(l.nextElementSibling.getAttribute('data-for-chat'), 'l');
  l.remove(); await h.mutate();
  assert.deepEqual(h.strips().map(s => s.getAttribute('data-for-chat')), ['c']);
});

test('positioned or transformed cards disable the feature', async () => {
  for (const style of [{ position: 'absolute' }, { transform: 'translateY(64px)' }]) {
    const h = harness({ store: { [KEY]: { version: 3, items: { l: item('111111111', 'L') } } } });
    const l = h.card('Lucia', 'l'); Object.assign(l.style, style);
    await h.mount();
    assert.equal(h.strips().length, 0); assert.match(h.warns.join('\n'), /desligado/);
  }
});

test('any overlap with neighbour cards removes all strips and disables', async () => {
  const h = harness({ store: { [KEY]: { version: 3, items: { l: item('111111111', 'L') } } } });
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

test('strip sits at the list margin, never indented to the contact name', async () => {
  const h = harness({ store: { [KEY]: { version: 3, items: { l: item('111111111', 'L') } } } });
  const l = h.card('Lucia', 'l');
  l.getBoundingClientRect = () => ({ top: 0, bottom: 60, left: 10, right: 300 });
  l.querySelector('.contact-name').getBoundingClientRect = () => ({ top: 5, bottom: 20, left: 92, right: 200 });
  await h.mount();
  assert.equal(l.nextElementSibling.style.paddingLeft || '', '');
});

test('own strip mutations do not schedule work', async () => {
  const h = harness({ store: { [KEY]: { version: 3, items: { l: item('111111111', 'L') } } } });
  const l = h.card('Lucia', 'l'); await h.mount();
  const strip = l.nextElementSibling;
  h.notify([{ target: h.list, addedNodes: [strip], removedNodes: [] }, { target: strip, addedNodes: [], removedNodes: [] }]);
  assert.equal(h.timers.size, 0);
  h.notify([{ target: h.list, addedNodes: [], removedNodes: [] }]);
  assert.equal(h.timers.size, 1);
});

test('opening a chat stores heuristic + anydesk, then the AI line once', async () => {
  const h = harness({ send: async () => ({ success: true, linha: 'Certificado novo sem DANFE.' }) });
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
  assert.deepEqual(stored.problem, { text: 'Certificado novo sem DANFE', source: 'ai' });
  assert.equal(card.nextElementSibling.querySelector('.atendeai-queue-ctx-problem').textContent, 'Certificado novo sem DANFE');
  await h.mutate(); await h.mutate();
  assert.equal(h.sent.length, 1);
});

test('problem switch off: the AnyDesk code is still captured but the AI is never called', async () => {
  const h = harness({ store: { atendeai_queue_context_problem: false }, send: async () => ({ success: true, linha: 'x' }) });
  const card = h.card('Sergio Murilo', 's-1', true);
  h.message({ name: 'Sergio Murilo', text: 'Acabei de instalar um certificado e não emito danfe' });
  h.message({ name: 'Triagem', text: 'Pode me passar o AnyDesk?', side: 'sent' });
  h.message({ name: 'Sergio Murilo', text: '123 456 789' });
  await h.mount();
  assert.equal(h.sent.length, 0);
  assert.equal(card.nextElementSibling.querySelector('.atendeai-queue-ctx-code').textContent, '🖥 123 456 789');
});

test('problem only after the transfer: AI once the customer describes it, not for a greeting', async () => {
  const h = harness({ send: async () => ({ success: true, linha: 'PDV trava na venda' }) });
  h.card('Gisele', 'g-1', true);
  h.message({ name: '', text: 'Triagem transferiu para o atendente Felipe', side: '' });
  h.message({ name: 'Gisele', text: 'oi' });
  await h.mount();
  assert.equal(h.sent.length, 0);
  h.message({ name: 'Gisele', text: 'o pdv travou na venda' });
  await h.mutate();
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].mensagens, 'oi\no pdv travou na venda');
  assert.deepEqual(h.store.atendeai_queue_context_v1.items['g-1'].problem, { text: 'PDV trava na venda', source: 'ai' });
});

test('AI failure retries after two minutes, at most three times per chat', async () => {
  for (const send of [async () => ({ success: false }), async () => { throw new Error('Extension context invalidated'); }]) {
    const h = harness({ send });
    h.card('Lucia', 'l', true);
    h.message({ name: 'Lucia', text: 'erro na rejeição 539' });
    h.message({ name: 'Felipe', text: 'Olá', side: 'sent' });
    await h.mount(); await h.mutate();
    assert.equal(h.sent.length, 1);
    h.advance(119_000); await h.mutate();
    assert.equal(h.sent.length, 1);
    for (let i = 0; i < 4; i++) { h.advance(120_000); await h.mutate(); }
    assert.equal(h.sent.length, 3);
    const stored = h.store.atendeai_queue_context_v1.items.l;
    assert.equal(stored.aiAttempts, 3);
    assert.deepEqual(stored.problem, { text: 'erro na rejeição 539', source: 'heuristic' });
  }
});

test('an answer without a usable line retries only after the customer writes more', async () => {
  const h = harness({ send: async () => ({ success: true, linha: '' }) });
  h.card('Lucia', 'l', true);
  h.message({ name: 'Lucia', text: 'preciso de ajuda' });
  h.message({ name: 'Felipe', text: 'Olá', side: 'sent' });
  await h.mount();
  h.advance(300_000); await h.mutate();
  assert.equal(h.sent.length, 1);
  h.message({ name: 'Lucia', text: 'a nota deu rejeição 539' });
  await h.mutate();
  assert.equal(h.sent.length, 1);
});

test('chats asked once under 1.6.0 get another try', async () => {
  const h = harness({ store: { [KEY]: { version: 3, items: { l: item(null, 'erro na rejeição 539', 'heuristic') } } },
    send: async () => ({ success: true, linha: 'NF-e rejeição 539' }) });
  h.card('Lucia', 'l', true);
  h.message({ name: 'Lucia', text: 'erro na rejeição 539' });
  h.message({ name: 'Felipe', text: 'Olá', side: 'sent' });
  await h.mount();
  assert.equal(h.sent.length, 1);
  assert.deepEqual(h.store[KEY].items.l.problem, { text: 'NF-e rejeição 539', source: 'ai' });
});

test('clicking the code copies digits and shows a short confirmation', async () => {
  const h = harness({ store: { [KEY]: { version: 3, items: { l: item('123456789', 'L') } } } });
  const l = h.card('Lucia', 'l'); await h.mount();
  const code = l.nextElementSibling.querySelector('.atendeai-queue-ctx-code');
  await Promise.all(code.fire('click'));
  assert.deepEqual(h.copied, ['123456789']);
  assert.equal(code.textContent, 'copiado ✓');
  await h.flush();
  assert.equal(code.textContent, '🖥 123 456 789');
});

test('double click edits; Enter saves as manual and AI never overrides it', async () => {
  const h = harness({ store: { [KEY]: { version: 3, items: { l: item(null, 'linha da ia') } } } });
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
    const h = harness({ store: { [KEY]: { version: 3, items: { l: item(null, 'linha da ia') } } } });
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

test('final review: an unrelated SZ mutation during inline edit keeps the editor and the save works', async () => {
  const h = harness({ store: { [KEY]: { version: 3, items: { l: item(null, 'linha da ia') } } } });
  const l = h.card('Lucia', 'l'); await h.mount();
  const strip = l.nextElementSibling;
  strip.querySelector('.atendeai-queue-ctx-problem').fire('dblclick');
  await h.mutate();
  const input = strip.querySelector('.atendeai-queue-ctx-input');
  assert.ok(input, 'editor survives'); assert.equal(l.nextElementSibling, strip);
  input.value = 'Linha corrigida';
  await Promise.all(input.fire('keydown', { key: 'Enter' })); await h.flush();
  assert.deepEqual(h.store[KEY].items.l.problem, { text: 'Linha corrigida', source: 'manual' });
});

test('final review: cards wrapped in their own container disable the feature', async () => {
  const { el } = require('./queue-context-harness');
  const h = harness({ store: { [KEY]: { version: 3, items: { l: item('111111111', 'L') } } } });
  const l = h.card('Lucia', 'l'); const wrapper = el('div', { class: 'item' });
  h.list.appendChild(wrapper); wrapper.appendChild(l);
  await h.mount();
  assert.equal(h.strips().length, 0); assert.match(h.warns.join('\n'), /desligado/);
});

test('unsupported list layouts render no strips; the supported one still does', async () => {
  const variants = {
    'clipped overflow': l => { l.style.overflowY = 'hidden'; },
    'no native scroll anywhere': l => { l.style.overflowY = 'visible'; },
    'clipping ancestor': l => { l.style.overflowY = 'visible'; l.parentElement.style.overflowY = 'hidden'; },
    'too narrow': l => { l.getBoundingClientRect = () => ({ top: 0, bottom: 400, left: 0, right: 150, width: 150, height: 400 }); },
    'too short': l => { l.getBoundingClientRect = () => ({ top: 0, bottom: 120, left: 0, right: 300, width: 300, height: 120 }); },
    'right column': l => { l.getBoundingClientRect = () => ({ top: 0, bottom: 400, left: 900, right: 1200, width: 300, height: 400 }); }
  };
  for (const [name, change] of Object.entries(variants)) {
    const h = harness({ store: { [KEY]: { version: 3, items: { l: item('111111111', 'L') } } } });
    h.context.innerWidth = 1280;
    h.card('Lucia', 'l'); change(h.list);
    await h.mount();
    assert.equal(h.strips().length, 0, name);
    assert.match(h.warns.join('\n'), /sem faixas/, `${name} explains itself`);
  }
  const ok = harness({ store: { [KEY]: { version: 3, items: { l: item('111111111', 'L') } } } });
  ok.context.innerWidth = 1280;
  ok.card('Lucia', 'l'); ok.list.getBoundingClientRect = () => ({ top: 0, bottom: 400, left: 0, right: 300, width: 300, height: 400 });
  await ok.mount();
  assert.equal(ok.strips().length, 1);
});

test('switching to a same-first-name customer never stores the previous transcript', async () => {
  const h = harness();
  const a = h.card('Ana Souza', 'a', true); const b = h.card('Ana Silva', 'b');
  h.message({ name: 'Ana', text: 'Não emite DANFE' });
  h.message({ name: 'Ana', text: '123 456 789' });
  h.message({ name: 'Felipe', text: 'Olá, boa tarde', side: 'sent' });
  a.className = 'sz_contact'; b.className = 'sz_contact active';
  await h.mount();
  assert.equal(h.store.atendeai_queue_context_v1?.items?.b, undefined);
  assert.equal(h.sent.length, 0);
});

// Shape observed on the real SZ page (2026-10-16): no id attributes on cards, one native
// .sz_contact-wrapper per card, a block #contact-fields list scrolled by .active_contacts_list.
function realSz(h, cards) {
  const { el } = require('./queue-context-harness');
  const scroller = el('div', { class: 'active_contacts_list scroll-list' }); scroller.style.overflowY = 'auto';
  const list = el('div', { id: 'contact-fields', class: 'contacts-field contact-scroll' });
  const host = el('div', { class: 'contacts' });
  h.list.remove(); h.document.body.appendChild(scroller); scroller.appendChild(list); list.appendChild(host);
  list.getBoundingClientRect = () => ({ top: 0, bottom: 599, left: 62, right: 348, width: 286, height: 599 });
  const nodes = cards.map(([name, stamp, active]) => {
    const card = el('div', { class: 'sz_contact' + (active ? ' active' : ''), role: 'button' }, [
      el('div', { class: 'name' }, [el('img', { src: '/assets/img/platform/mini/webchat.svg', alt: 'platform' }),
        el('div', { class: 'contact-name text-ellipsis', title: `${name} `, text: name })]),
      el('div', { class: 'contact-times', phase: 'attendance' }, [el('span', { class: 'times', title: stamp, text: 'Ontem' })])]);
    const wrapper = el('div', { class: 'sz_contact-wrapper', id: 'contact' }, [card]);
    host.appendChild(wrapper); return card;
  });
  return { list, host, nodes };
}

test('real SZ layout: strip goes after the native wrapper, keyed by the attendance identity', async () => {
  const id = 'attendance:webchat|liza|15/10/26 17:46';
  const h = harness({ store: { [KEY]: { version: 3, items: { [id]: item('123456789', 'Não emite DANFE') } } } });
  h.context.innerWidth = 1179;
  const { host, nodes } = realSz(h, [['LIZA', '15/10/26 17:46', true], ['CÁSSIA', '15/10/26 18:02']]);
  await h.mount();
  assert.equal(h.strips().length, 1, h.warns.join('\n'));
  const strip = nodes[0].parentElement.nextElementSibling;
  assert.equal(strip.className, 'atendeai-queue-ctx');
  assert.equal(strip.parentElement, host);
  assert.equal(strip.getAttribute('data-for-chat'), id);
  assert.equal(h.warns.length, 0);
});

test('real SZ layout: a card without a usable attendance time gets no strip', async () => {
  const h = harness({ store: { [KEY]: { version: 3, items: { 'attendance:webchat|liza|Ontem': item('123456789', 'x') } } } });
  h.context.innerWidth = 1179;
  const { nodes } = realSz(h, [['LIZA', 'Ontem', true]]);
  await h.mount();
  assert.equal(h.strips().length, 0);
  assert.equal(h.context.QueueContextCapture.idOf(nodes[0]), null);
});

test('missing queue list is reported once, not silently', async () => {
  const h = harness({ store: { [KEY]: { version: 3, items: { l: item('111111111', 'L') } } } });
  h.card('Lucia', 'l'); h.list.className = 'something-else';
  await h.mount(); await h.mutate();
  assert.equal(h.warns.filter(w => /não encontrada/.test(w)).length, 1);
});
