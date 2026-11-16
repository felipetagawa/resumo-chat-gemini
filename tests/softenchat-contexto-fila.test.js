// tests/softenchat-contexto-fila.test.js
// Contexto na fila on SoftenChat: AnyDesk + problem line inside each list card, from the API transcript.
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, el } = require('./queue-context-harness');
const KEY = 'atendeai_queue_context_v1';

// SoftenChat list (2026-11-09 map): main > aside > scroll box > card[role=button][tabindex=0] with 3 lines.
// The page-world bridge adds data-atendeai-conversa to each card it can read.
function softenHarness({ store = {}, send, conversas = {}, cache = Object.keys(conversas) } = {}) {
  const h = harness({ store, send });
  const asked = [];
  const cached = new Set(cache);
  h.context.setInterval = () => 0;
  h.context.SoftenChatCapture = {
    ativo: () => true,
    observar() {},
    conversasAbertas: () => Object.keys(conversas),
    emCache: id => cached.has(id),
    atualizar: async id => { asked.push(id); },
    mensagens: id => conversas[id] || []
  };
  const scroll = el('div', { class: 'flex-1 min-h-0 overflow-y-auto' });
  h.document.body.appendChild(el('main', {}, [el('aside', {}, [scroll])]));
  function card(conversa) {
    const attrs = { role: 'button', tabindex: '0' };
    if (conversa) attrs['data-atendeai-conversa'] = conversa;
    const c = el('div', attrs, [el('span', { text: 'Equipe' }), el('span', { text: 'ROBERTA' }), el('span', { text: 'última' })]);
    scroll.appendChild(c);
    return c;
  }
  return { ...h, card, asked };
}
const cliente = message => ({ customer: true, sent: false, message });
const tecnico = message => ({ customer: false, sent: true, message });
const ia = message => ({ customer: false, sent: false, message });
const stored = (anydesk, text) => ({ anydesk, problem: text ? { text, source: 'ai' } : null, aiAttempts: 1, updatedAt: 1_000_000_000 });

test('faixa salva aparece DENTRO do card, como ultima linha, sem mexer nas linhas nativas', async () => {
  const h = softenHarness({ store: { [KEY]: { version: 3, items: { 'softenchat:c1': stored('123456789', 'Não emite NF-e') } } } });
  const c1 = h.card('c1'); h.card('c2');
  const nativas = c1.children.slice();
  await h.mount();
  assert.equal(h.strips().length, 1);
  const strip = c1.children[3];
  assert.equal(strip.className, 'atendeai-queue-ctx');
  assert.equal(strip.getAttribute('data-host'), 'softenchat');
  assert.equal(strip.getAttribute('data-for-chat'), 'softenchat:c1');
  assert.deepEqual(c1.children.slice(0, 3), nativas);
  assert.equal(strip.querySelector('.atendeai-queue-ctx-code').textContent, '🖥 123 456 789');
  assert.equal(strip.querySelector('.atendeai-queue-ctx-problem').textContent, 'Não emite NF-e');
});

test('conversa aberta: AnyDesk e linha do problema saem da API e vao para o card dela', async () => {
  const h = softenHarness({
    conversas: { c1: [
      ia('Olá! Já vou chamar um atendente.'),
      cliente('Bom dia, não consigo emitir nota fiscal no sistema'),
      tecnico('Me passa o anydesk por favor'),
      cliente('123 456 789')
    ] },
    send: () => ({ success: true, linha: 'Erro ao emitir nota fiscal' })
  });
  const c1 = h.card('c1');
  await h.mount();
  const item = h.store[KEY].items['softenchat:c1'];
  assert.equal(item.anydesk, '123456789');
  assert.deepEqual(item.problem, { text: 'Erro ao emitir nota fiscal', source: 'ai' });
  assert.equal(h.sent[0].action, 'gerarLinhaProblema');
  assert.match(h.sent[0].mensagens, /não consigo emitir nota fiscal/);
  assert.doesNotMatch(h.sent[0].mensagens, /atendente/); // the AI agent's greeting is not the customer
  await h.mutate();
  const strip = c1.children[3];
  assert.equal(strip.querySelector('.atendeai-queue-ctx-code').textContent, '🖥 123 456 789');
  assert.equal(strip.querySelector('.atendeai-queue-ctx-problem').textContent, 'Erro ao emitir nota fiscal');
});

test('conversa ainda nao lida: pede a API e nao grava nada; card sem a ponte: nenhuma faixa', async () => {
  const h = softenHarness({ conversas: { c1: [cliente('123456789')] }, cache: [],
    store: { [KEY]: { version: 3, items: { 'softenchat:c9': stored('987654321', null) } } } });
  h.card(null);
  await h.mount();
  assert.deepEqual(h.asked, ['c1']);
  assert.equal(h.store[KEY].items['softenchat:c1'], undefined);
  assert.equal(h.strips().length, 0);
});

test('clique, duplo clique e teclas na faixa nao chegam ao card (que abriria a conversa)', async () => {
  const h = softenHarness({ store: { [KEY]: { version: 3, items: { 'softenchat:c1': stored('123456789', 'Erro XML') } } } });
  h.card('c1');
  await h.mount();
  const strip = h.strips()[0];
  for (const type of ['pointerdown', 'mousedown', 'click', 'dblclick', 'keydown']) {
    let stopped = false;
    strip.fire(type, { stopPropagation() { stopped = true; } });
    assert.ok(stopped, type);
  }
});

test('opcoes: AnyDesk desligado tira o codigo; com as duas desligadas a faixa some', async () => {
  const h = softenHarness({ store: { [KEY]: { version: 3, items: { 'softenchat:c1': stored('123456789', 'Erro XML') } } } });
  const c1 = h.card('c1');
  await h.mount();
  await h.setPref('atendeai_queue_context_anydesk', false);
  assert.equal(c1.children[3].querySelector('.atendeai-queue-ctx-code'), null);
  assert.equal(c1.children[3].querySelector('.atendeai-queue-ctx-problem').textContent, 'Erro XML');
  await h.setPref('atendeai_queue_context_problem', false);
  assert.equal(h.strips().length, 0);
});

test('card que passa a mostrar outra conversa troca a faixa', async () => {
  const h = softenHarness({ store: { [KEY]: { version: 3, items: {
    'softenchat:c1': stored('111111111', null), 'softenchat:c2': stored('222222222', null) } } } });
  const card = h.card('c1');
  await h.mount();
  assert.equal(card.children[3].getAttribute('data-for-chat'), 'softenchat:c1');
  card.setAttribute('data-atendeai-conversa', 'c2');
  await h.mutate();
  assert.equal(h.strips().length, 1);
  assert.equal(card.children[3].getAttribute('data-for-chat'), 'softenchat:c2');
});
