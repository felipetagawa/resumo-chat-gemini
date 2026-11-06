const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument, collect, textOf } = require('./mini-dom');

const T0 = new Date(2026, 10, 9, 8, 0, 0).getTime();

function load(seed = { atendeai_user_sector: 'suporte' }) {
  const store = seed;
  const listeners = [];
  const chrome = { runtime: {}, storage: {
    local: {
      get(keys, cb) { const out = {}; (Array.isArray(keys) ? keys : [keys]).forEach((k) => { if (k in store) out[k] = JSON.parse(JSON.stringify(store[k])); }); cb(out); },
      set(data, cb) {
        const changes = {}; Object.keys(data).forEach((k) => { changes[k] = { newValue: data[k] }; });
        Object.assign(store, JSON.parse(JSON.stringify(data)));
        listeners.forEach((fn) => fn(changes, 'local')); cb?.();
      }
    },
    onChanged: { addListener: (fn) => listeners.push(fn), removeListener: (fn) => listeners.splice(listeners.indexOf(fn), 1) }
  } };
  const context = { window: {}, Date, Math, JSON, console, setTimeout, clearTimeout, chrome };
  vm.createContext(context);
  ['retornos-schedule', 'retornos-store', 'retornos-list', 'retornos-alert'].forEach((n) =>
    vm.runInContext(fs.readFileSync(`modules/${n}.js`, 'utf8'), context));
  return { A: context.window.RetornosAlert, R: context.window.RetornosStore, store };
}

function clock(start = T0) {
  const timers = [];
  return {
    t: start,
    now() { return this.t; },
    timers,
    setTimer(fn, ms) { timers.push({ fn, ms }); return timers.length; },
    clearTimer() {}
  };
}

const crm = (protocolo, dueAt, extra = {}) => ({ protocolo, atendimentoId: '9' + protocolo, cliente: 'Padaria Pão Quente', solicitante: 'Maria Souza', telefones: ['11988887777'], problema: 'NF-e rejeitada', dueAt, ...extra });
const buttonsOf = (root) => collect(root).filter((n) => n.tagName === 'button');
const settle = () => new Promise((r) => setTimeout(r, 15));

test('a due return shows "Retorno agora" with the client, the problem and when it was scheduled', async () => {
  const { A, R } = load();
  await R.upsertCrm(crm('1', T0), T0 - 86400000);
  const doc = createDocument(); const c = clock();
  await A.start(doc, { now: () => c.now(), setTimer: (f, m) => c.setTimer(f, m), clearTimer: () => {} }).then((h) => h.refresh());
  const alert = doc.getElementById('atendeai-retornos-alert');
  assert.ok(alert);
  const text = textOf(alert);
  assert.match(text, /AtendeAI/);
  assert.match(text, /Retorno agora/);
  assert.match(text, /Padaria Pão Quente/);
  assert.match(text, /NF-e rejeitada/);
  assert.match(text, /agendado ontem por você/);
  assert.equal(buttonsOf(alert).some((b) => /abrir/i.test(b.textContent)), false, 'no "Abrir atendimento" here');
});

test('it stays on screen: nothing schedules its removal', async () => {
  const { A, R } = load();
  await R.upsertCrm(crm('1', T0), T0);
  const doc = createDocument(); const c = clock();
  const h = await A.start(doc, { now: () => c.now(), setTimer: (f, m) => c.setTimer(f, m), clearTimer: () => {} });
  await h.refresh();
  assert.ok(doc.getElementById('atendeai-retornos-alert'));
  c.t += 3600000; await h.refresh();
  assert.ok(doc.getElementById('atendeai-retornos-alert'), 'still there an hour later');
});

test('× marks it seen (the return stays in the list), and Adiar moves it to the chosen time', async () => {
  const { A, R } = load();
  await R.upsertCrm(crm('1', T0), T0);
  const doc = createDocument(); const c = clock();
  const h = await A.start(doc, { now: () => c.now(), setTimer: (f, m) => c.setTimer(f, m), clearTimer: () => {} });
  await h.refresh();
  const labels = buttonsOf(doc.getElementById('atendeai-retornos-alert')).map((b) => b.textContent);
  assert.ok(labels.includes('15 min') && labels.includes('1 h'));
  buttonsOf(doc.getElementById('atendeai-retornos-alert')).find((b) => b.textContent === '15 min').click();
  await settle();
  assert.equal((await R.list())[0].alertAt, T0 + 15 * 60000);
  assert.equal(doc.getElementById('atendeai-retornos-alert'), null, 'snoozed alert leaves the screen');
  c.t = T0 + 15 * 60000; await h.refresh();
  assert.ok(doc.getElementById('atendeai-retornos-alert'), 'and comes back when the time arrives');
  buttonsOf(doc.getElementById('atendeai-retornos-alert')).find((b) => b.getAttribute('aria-label') === 'Fechar').click();
  await settle();
  assert.equal(doc.getElementById('atendeai-retornos-alert'), null);
  assert.equal((await R.list()).length, 1);
  assert.equal((await R.pending(T0 + 3600000)).length, 0);
});

test('two returns due together become one grouped alert with a line each and "Fechar todos"', async () => {
  const { A, R } = load();
  await R.upsertCrm(crm('1', T0 - 60000), T0 - 86400000);
  await R.upsertCrm(crm('2', T0, { cliente: 'Mercado Bom Preço' }), T0 - 86400000);
  const doc = createDocument(); const c = clock();
  const h = await A.start(doc, { now: () => c.now(), setTimer: (f, m) => c.setTimer(f, m), clearTimer: () => {} });
  await h.refresh();
  const alert = doc.getElementById('atendeai-retornos-alert');
  assert.equal(doc.querySelectorAll('div').filter((n) => n.className.includes('atendeai-retornos-alert-item')).length, 2);
  assert.match(textOf(alert), /Mercado Bom Preço/);
  buttonsOf(alert).find((b) => b.textContent === 'Fechar todos').click();
  await settle();
  assert.equal(doc.getElementById('atendeai-retornos-alert'), null);
  assert.equal((await R.pending(T0 + 1)).length, 0);
});

test('a return that is not due yet schedules its own timer, and shows only then', async () => {
  const { A, R } = load();
  await R.upsertCrm(crm('1', T0 + 10 * 60000), T0);
  const doc = createDocument(); const c = clock();
  const h = await A.start(doc, { now: () => c.now(), setTimer: (f, m) => c.setTimer(f, m), clearTimer: () => {} });
  await h.refresh();
  assert.equal(doc.getElementById('atendeai-retornos-alert'), null);
  assert.ok(c.timers.some((t) => t.ms > 0 && t.ms <= 10 * 60000 + 1000));
  c.t += 10 * 60000; await h.refresh();
  assert.ok(doc.getElementById('atendeai-retornos-alert'));
});

test('an acknowledgement made by another tab removes the alert here', async () => {
  const { A, R } = load();
  await R.upsertCrm(crm('1', T0), T0);
  const doc = createDocument(); const c = clock();
  await A.start(doc, { now: () => c.now(), setTimer: (f, m) => c.setTimer(f, m), clearTimer: () => {} });
  await settle();
  assert.ok(doc.getElementById('atendeai-retornos-alert'));
  await R.acknowledge('1');
  await settle();
  assert.equal(doc.getElementById('atendeai-retornos-alert'), null);
});

test('nothing shows for other sectors or when the feature is off, and "Da agenda antiga" entries never alert', async () => {
  const pre = load({ atendeai_user_sector: 'preatendimento', atendeai_retornos_v1: { version: 1, items: { '1': { key: '1', kind: 'crm', protocolo: '1', cliente: 'X', dueAt: T0, alertAt: T0, ackedAt: null, updatedAt: T0, createdAt: T0, telefones: [] } } } });
  const doc = createDocument(); const c = clock();
  const h = await pre.A.start(doc, { now: () => c.now(), setTimer: (f, m) => c.setTimer(f, m), clearTimer: () => {} });
  await h.refresh();
  assert.equal(doc.getElementById('atendeai-retornos-alert'), null);

  const { A, R } = load();
  await R.upsertCrm(crm('7', T0), T0 - 1000);
  await R.setSettings({ enabled: false });
  const doc2 = createDocument();
  await (await A.start(doc2, { now: () => c.now(), setTimer: (f, m) => c.setTimer(f, m), clearTimer: () => {} })).refresh();
  assert.equal(doc2.getElementById('atendeai-retornos-alert'), null);

  const legacy = load({ atendeai_user_sector: 'suporte', atendeai_retornos_v1: { version: 1, items: { 'manual:old': { key: 'manual:old', kind: 'manual', text: 'velho', legacy: true, dueAt: T0 - 1e9, alertAt: T0 - 1e9, ackedAt: T0 - 1e9, updatedAt: 1, createdAt: 1, telefones: [] } } } });
  const doc3 = createDocument();
  await (await legacy.A.start(doc3, { now: () => c.now(), setTimer: (f, m) => c.setTimer(f, m), clearTimer: () => {} })).refresh();
  assert.equal(doc3.getElementById('atendeai-retornos-alert'), null);
});

test('the alert lives in a stack container that is a sibling layer, with a CRM placement for the CRM tabs', async () => {
  const { A, R } = load();
  await R.upsertCrm(crm('1', T0), T0);
  const doc = createDocument(); const c = clock();
  const h = await A.start(doc, { now: () => c.now(), setTimer: (f, m) => c.setTimer(f, m), clearTimer: () => {}, placement: 'crm' });
  await h.refresh();
  const stack = doc.getElementById('atendeai-retornos-stack');
  assert.equal(stack.getAttribute('data-placement'), 'crm');
  assert.equal(stack.parentElement, doc.body);
  assert.ok(stack.contains(doc.getElementById('atendeai-retornos-alert')));
});
