// Pré-atendimento markings on SoftenChat list cards: timer + 💸, on the cards the page-world bridge
// flagged as the agent's own (data-atendeai-minha="1").
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument, el } = require('./mini-dom');

const KEY = 'atendeai_softenchat_pre_v1';
const MIN = 60000, DIA = 86400000;

function card(id, { minha = true } = {}) {
  const attrs = { role: 'button', tabindex: '0' };
  if (id) attrs['data-atendeai-conversa'] = id;
  if (id && minha) attrs['data-atendeai-minha'] = '1';
  return el('div', attrs, [
    el('span', { class: 'flex items-center gap-1 min-w-0 h-5' }, [el('span', { class: 'text-[10px] truncate', text: 'FELIPE · Squad D' })]),
    el('span', {}, [el('span', { class: 'font-semibold', text: 'Ana' })]),
    el('span')]);
}

async function load(cards, { sector = 'preatendimento', name = 'Felipe', stored = {}, now = 1_800_000_000_000, api } = {}) {
  const document = createDocument();
  document.body.appendChild(el('main', {}, [el('aside', {}, [el('div', {}, cards)])]));
  const data = { atendeai_user_sector: sector, atendeai_user_name: name, [KEY]: structuredClone(stored) };
  const calls = [];
  const clock = { now };
  const context = {
    document, console,
    Date: class extends Date { static now() { return clock.now; } },
    setInterval() { return 1; }, clearInterval() {}, setTimeout(fn) { fn(); return 1; }, clearTimeout() {},
    chrome: { storage: {
      local: {
        get(keys, cb) { cb(Object.fromEntries([].concat(keys).map(k => [k, data[k]]))); },
        set(obj, cb) { Object.assign(data, structuredClone(obj)); cb?.(); }
      },
      onChanged: { addListener() {} }
    } },
    SoftenChatCapture: {
      ativo: () => true,
      apiGet: async path => { calls.push(path); return (api || (() => { throw new Error('offline'); }))(path); }
    }
  };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync('modules/softenchat-pre-marcacoes.js', 'utf8'), context);
  const mod = context.SoftenChatPreMarcacoes;
  await mod.init();
  await new Promise(r => setImmediate(r));
  return { mod, data, calls, clock, document };
}

const slotOf = c => c.children[0].querySelector('.atendeai-pre-slot');

test('formats the elapsed time like the SZ timer, and as days past 24 h', async () => {
  const { mod } = await load([], { sector: 'suporte' });
  assert.equal(mod._formatar(0), '00:00:00');
  assert.equal(mod._formatar(754000), '00:12:34');
  assert.equal(mod._formatar(DIA - 1000), '23:59:59');
  assert.equal(mod._formatar(DIA + 3 * 3600000), '1d 03h');
  assert.equal(mod._formatar(-5000), '00:00:00');
});

test('colors: green under 5 min, yellow under 10, red from 10', async () => {
  const { mod } = await load([], { sector: 'suporte' });
  assert.equal(mod._cor(4.9 * MIN), '#41925f');
  assert.equal(mod._cor(5 * MIN), '#a09742');
  assert.equal(mod._cor(9.9 * MIN), '#a09742');
  assert.equal(mod._cor(10 * MIN), '#e75a5a');
});

test('start: assumedAt, or a later transfer to me', async () => {
  const { mod } = await load([], { sector: 'suporte' });
  const assumed = '2026-11-16T12:00:00.000Z';
  assert.equal(mod._inicioDe({ assumedAt: assumed }, 'u1'), Date.parse(assumed));
  assert.equal(mod._inicioDe({ assumedAt: assumed, transfers: [
    { toUserId: 'u1', createdAt: '2026-11-16T13:00:00.000Z' },
    { toUserId: 'u2', createdAt: '2026-11-16T14:00:00.000Z' }] }, 'u1'), Date.parse('2026-11-16T13:00:00.000Z'));
  assert.equal(mod._inicioDe({ assumedAt: assumed, transfers: [{ toUserId: 'u1', createdAt: '2026-11-16T11:00:00.000Z' }] }, 'u1'), Date.parse(assumed));
  assert.equal(mod._inicioDe({ assumedAt: null, transfers: [] }, 'u1'), null);
  assert.equal(mod._inicioDe(null, 'u1'), null);
});

test('the Suporte sector, or Pré-atendimento without a name, draws nothing', async () => {
  for (const opts of [{ sector: 'suporte' }, { sector: 'preatendimento', name: '' }]) {
    const c = card('c1');
    await load([c], opts);
    assert.equal(slotOf(c), null);
  }
});

test('my card gets timer and 💸 as the last thing of its first line; others get nothing', async () => {
  const mine = card('c1');
  const other = card('c2', { minha: false });
  const unknown = card(null);
  await load([mine, other, unknown]);
  const slot = slotOf(mine);
  assert.ok(slot);
  const line = mine.children[0];
  assert.equal(line.children[line.children.length - 1], slot);
  assert.equal(slot.getAttribute('data-conversa'), 'c1');
  assert.ok(slot.querySelector('.atendeai-pre-timer'));
  assert.equal(slot.querySelector('.atendeai-pre-timer').getAttribute('title'), 'Tempo de atendimento (desde que ficou com você)');
  assert.equal(slot.querySelector('.atendeai-pre-neg').getAttribute('aria-pressed'), 'false');
  assert.equal(slotOf(other), null);
  assert.equal(slotOf(unknown), null);
});

test('the timer counts from assumedAt read once from the API', async () => {
  const now = Date.parse('2026-11-16T12:07:12.000Z');
  const api = path => path === '/auth/me' ? { id: 'u1' } : { id: 'c1', assumedAt: '2026-11-16T12:00:00.000Z' };
  const c = card('c1');
  const { mod, data, calls } = await load([c], { now, api });
  mod._varrer();
  assert.equal(data[KEY].c1.inicio, Date.parse('2026-11-16T12:00:00.000Z'));
  assert.equal(data[KEY].c1.fonte, 'api');
  assert.equal(slotOf(c).querySelector('.atendeai-pre-timer').textContent, '00:07:12');
  assert.equal(slotOf(c).querySelector('.atendeai-pre-timer').style.background, '#a09742');
  mod._varrer(); mod._varrer();
  assert.equal(calls.filter(p => p.startsWith('/conversations/')).length, 1);
});

test('without the API the timer counts from the first time the card was seen, and keeps it', async () => {
  const now = 1_800_000_000_000;
  const c = card('c1');
  const { data, calls } = await load([c], { now });
  assert.equal(data[KEY].c1.inicio, now);
  assert.equal(data[KEY].c1.fonte, 'visto');
  const before = calls.length;
  const c2 = card('c1');
  const again = await load([c2], { now: now + 5 * MIN, stored: data[KEY] });
  assert.equal(again.data[KEY].c1.inicio, now);
  assert.equal(slotOf(c2).querySelector('.atendeai-pre-timer').textContent, '00:05:00');
  assert.ok(before >= 1);
});

test('💸 toggles, is saved per conversation, and never reaches the card', async () => {
  const c = card('c1');
  const { data } = await load([c]);
  const neg = slotOf(c).querySelector('.atendeai-pre-neg');
  let stopped = 0;
  const ev = { stopPropagation() { stopped += 1; }, preventDefault() {} };
  neg.fire('pointerdown', ev); neg.fire('mousedown', ev); neg.fire('keydown', { ...ev, key: 'Enter' });
  neg.fire('click', ev);
  assert.equal(stopped, 4);
  assert.equal(data[KEY].c1.neg, true);
  assert.equal(neg.getAttribute('aria-pressed'), 'true');
  neg.fire('click', ev);
  assert.equal(data[KEY].c1.neg, false);
  assert.equal(neg.getAttribute('aria-pressed'), 'false');
});

test('a saved 💸 comes back on reload', async () => {
  const c = card('c1');
  await load([c], { stored: { c1: { inicio: 1_800_000_000_000, neg: true, vistoEm: 1_800_000_000_000, fonte: 'api' } } });
  assert.equal(slotOf(c).querySelector('.atendeai-pre-neg').getAttribute('aria-pressed'), 'true');
});

test('a card no longer mine, or reused for another conversation, loses or swaps its slot', async () => {
  const c = card('c1');
  const { mod } = await load([c]);
  const first = slotOf(c);
  c.setAttribute('data-atendeai-conversa', 'c2');
  mod._varrer();
  assert.notEqual(slotOf(c), first);
  assert.equal(slotOf(c).getAttribute('data-conversa'), 'c2');
  c.removeAttribute('data-atendeai-minha');
  mod._varrer();
  assert.equal(slotOf(c), null);
});

test('records not seen as mine for 7 days are dropped on start', async () => {
  const now = 1_800_000_000_000;
  const { data } = await load([], { now, stored: {
    velho: { inicio: now - 9 * DIA, neg: true, vistoEm: now - 8 * DIA, fonte: 'api' },
    recente: { inicio: now - 2 * DIA, neg: false, vistoEm: now - 6 * DIA, fonte: 'api' } } });
  assert.equal(data[KEY].velho, undefined);
  assert.ok(data[KEY].recente);
});
