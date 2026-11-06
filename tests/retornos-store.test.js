const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load(store = { atendeai_user_sector: 'suporte' }, { noChrome = false } = {}) {
  const listeners = [];
  const chrome = noChrome ? undefined : { runtime: {}, storage: {
    local: {
      get(keys, cb) {
        const list = Array.isArray(keys) ? keys : [keys];
        const out = {};
        list.forEach((k) => { if (k in store) out[k] = JSON.parse(JSON.stringify(store[k])); });
        cb(out);
      },
      set(data, cb) {
        const changes = {};
        Object.keys(data).forEach((k) => { changes[k] = { newValue: data[k] }; });
        Object.assign(store, JSON.parse(JSON.stringify(data)));
        listeners.forEach((fn) => fn(changes, 'local'));
        cb?.();
      }
    },
    onChanged: { addListener: (fn) => listeners.push(fn), removeListener: (fn) => listeners.splice(listeners.indexOf(fn), 1) }
  } };
  const context = { window: {}, Date, Math, JSON, chrome, console };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('modules/retornos-schedule.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('modules/retornos-store.js', 'utf8'), context);
  return { store, R: context.window.RetornosStore, listeners };
}

const base = { protocolo: '2611060001', atendimentoId: '555', cliente: 'Padaria Pão Quente', solicitante: 'Maria Souza', telefones: ['11988887777'], problema: 'NF-e rejeitada' };
const NOW = new Date(2026, 10, 6, 10, 0, 0).getTime();
const DUE = new Date(2026, 10, 9, 8, 0, 0).getTime();

test('upsertCrm creates a return keyed by protocol and keeps what the screen showed', async () => {
  const { R } = load();
  const r = await R.upsertCrm({ ...base, dueAt: DUE }, NOW);
  assert.equal(r.key, '2611060001');
  assert.equal(r.kind, 'crm');
  assert.equal(r.createdAt, NOW);
  assert.equal(r.alertAt, DUE);
  assert.equal(r.ackedAt, null);
  const list = await R.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].cliente, 'Padaria Pão Quente');
  assert.equal(list[0].atendimentoId, '555');
});

test('saving the same protocol again reschedules instead of duplicating, and re-arms the alert', async () => {
  const { R } = load();
  await R.upsertCrm({ ...base, dueAt: DUE }, NOW);
  await R.acknowledge('2611060001');
  const later = DUE + 86400000;
  const r = await R.upsertCrm({ ...base, atendimentoId: '', problema: '', dueAt: later }, NOW + 1000);
  assert.equal((await R.list()).length, 1);
  assert.equal(r.dueAt, later);
  assert.equal(r.alertAt, later);
  assert.equal(r.ackedAt, null);
  assert.equal(r.createdAt, NOW, 'creation time survives a reschedule');
  assert.equal(r.atendimentoId, '555', 'an empty id never erases the stored one');
  assert.equal(r.problema, 'NF-e rejeitada');
});

test('pending, acknowledge and snooze drive when the alert shows', async () => {
  const { R } = load();
  await R.upsertCrm({ ...base, dueAt: DUE }, NOW);
  assert.equal((await R.pending(DUE - 1)).length, 0);
  assert.equal((await R.pending(DUE)).length, 1);
  await R.acknowledge('2611060001');
  assert.equal((await R.pending(DUE + 60000)).length, 0, 'closed with × counts as seen');
  assert.equal((await R.list()).length, 1, 'and the return stays in the list');
  await R.snooze('2611060001', DUE + 15 * 60000);
  assert.equal((await R.pending(DUE + 14 * 60000)).length, 0);
  assert.equal((await R.pending(DUE + 15 * 60000)).length, 1);
});

test('refreshId updates the id only when it changed', async () => {
  const { R, store } = load();
  await R.upsertCrm({ ...base, dueAt: DUE }, NOW);
  assert.equal(await R.refreshId('2611060001', '555'), false);
  assert.equal(await R.refreshId('2611060001', '777'), true);
  assert.equal((await R.list())[0].atendimentoId, '777');
  assert.equal(await R.refreshId('0000', '1'), false);
  assert.ok(store.atendeai_retornos_v1);
});

test('syncWithTable removes returns whose protocol left the table, never newer ones, never manual ones', async () => {
  const { R } = load();
  await R.upsertCrm({ ...base, protocolo: 'A1', dueAt: DUE }, NOW);
  await R.upsertCrm({ ...base, protocolo: 'B2', dueAt: DUE }, NOW);
  await R.upsertCrm({ ...base, protocolo: 'C3', dueAt: DUE }, NOW + 5000);
  await R.addManual({ text: 'ligar para o contador', dueAt: DUE }, NOW);
  const removed = await R.syncWithTable(['A1'], NOW + 1000);
  assert.deepEqual([...removed], ['B2']);
  const keys = (await R.list()).map((r) => r.key).sort();
  assert.equal(keys.includes('A1'), true);
  assert.equal(keys.includes('C3'), true, 'saved after the table was read');
  assert.equal(keys.some((k) => k.startsWith('manual:')), true);
  assert.equal(keys.includes('B2'), false);
});

test('manual reminders and removal', async () => {
  const { R } = load();
  const m = await R.addManual({ text: '  retornar ao contador  ', dueAt: DUE }, NOW);
  assert.equal(m.kind, 'manual');
  assert.equal(m.text, 'retornar ao contador');
  assert.equal(await R.addManual({ text: '   ', dueAt: DUE }, NOW), null);
  await R.remove(m.key);
  assert.equal((await R.list()).length, 0);
  await R.upsertCrm({ ...base, dueAt: DUE }, NOW);
  await R.removeByProtocolo('2611060001');
  assert.equal((await R.list()).length, 0);
});

test('isActive needs the Suporte sector and the switch on; settings default to the three shortcuts', async () => {
  assert.equal(await load().R.isActive(), true);
  assert.equal(await load({ atendeai_user_sector: 'preatendimento' }).R.isActive(), false);
  assert.equal(await load({}).R.isActive(), false);
  const off = load({ atendeai_user_sector: 'suporte', atendeai_retornos_settings_v1: { enabled: false } });
  assert.equal(await off.R.isActive(), false);
  const { R } = load();
  const s = await R.getSettings();
  assert.equal(s.enabled, true);
  assert.equal(s.shortcuts.length, 3);
  await R.setSettings({ shortcuts: [{ id: 'x', day: 'seg', time: '09:00' }, { id: 'bad', day: 'seg', time: '99:00' }] });
  assert.deepEqual([...(await R.getSettings()).shortcuts].map((x) => x.time), ['09:00']);
  await R.setSettings({ enabled: false });
  assert.equal((await R.getSettings()).enabled, false);
  assert.equal((await R.getSettings()).shortcuts.length, 1);
});

test('migrateAgenda: today-onwards events alert, older ones go quiet to "Da agenda antiga", done and invalid ones are ignored, nothing is deleted', async () => {
  const seed = {
    atendeai_user_sector: 'suporte',
    usuarioAgendaEventsV2: {
      hoje: { id: 'hoje', title: 'Ligar para a Padaria', date: '2026-11-06', time: '15:00', client: 'Padaria', status: 'todo' },
      futuro: { id: 'futuro', title: 'Treinamento', date: '2026-11-20', status: 'inprogress' },
      velho: { id: 'velho', title: 'Retorno antigo', date: '2026-10-01', status: 'todo' },
      feito: { id: 'feito', title: 'Já feito', date: '2026-11-20', status: 'done' },
      semData: { id: 'semData', title: 'Sem data', status: 'todo' }
    },
    usuarioAgendaCRM: [{ id: 1 }]
  };
  const { R, store } = load(seed);
  assert.deepEqual({ ...(await R.migrateAgenda(NOW)) }, { moved: 2, legacy: 1 });
  const list = await R.list();
  assert.equal(list.length, 3);
  const hoje = list.find((r) => r.text.includes('Padaria'));
  assert.equal(hoje.kind, 'manual');
  assert.equal(hoje.dueAt, new Date(2026, 10, 6, 15, 0).getTime());
  assert.equal(hoje.legacy, undefined);
  const velho = list.find((r) => r.text.includes('antigo'));
  assert.equal(velho.legacy, true);
  assert.equal(velho.ackedAt, velho.alertAt, 'legacy items never alert');
  assert.equal((await R.pending(NOW + 400 * 86400000)).some((r) => r.legacy), false);
  assert.deepEqual({ ...(await R.migrateAgenda(NOW)) }, { moved: 0, legacy: 0 }, 'runs once');
  assert.equal((await R.list()).length, 3);
  assert.equal(Object.keys(store.usuarioAgendaEventsV2).length, 5);
  assert.equal(store.usuarioAgendaCRM.length, 1);
});

test('migrateAgenda does nothing for other sectors or when the feature is off', async () => {
  const events = { usuarioAgendaEventsV2: { a: { id: 'a', title: 'x', date: '2026-11-20', status: 'todo' } } };
  const pre = load({ atendeai_user_sector: 'preatendimento', ...events });
  assert.deepEqual({ ...(await pre.R.migrateAgenda(NOW)) }, { moved: 0, legacy: 0 });
  assert.equal((await pre.R.list()).length, 0);
  const off = load({ atendeai_user_sector: 'suporte', atendeai_retornos_settings_v1: { enabled: false }, ...events });
  assert.deepEqual({ ...(await off.R.migrateAgenda(NOW)) }, { moved: 0, legacy: 0 });
});

test('onChange fires for returns and settings and can be unsubscribed', async () => {
  const { R } = load();
  let calls = 0;
  const stop = R.onChange(() => { calls++; });
  await R.upsertCrm({ ...base, dueAt: DUE }, NOW);
  await R.setSettings({ enabled: true });
  assert.equal(calls, 2);
  stop();
  await R.remove('2611060001');
  assert.equal(calls, 2);
});

test('flags persist, and a missing chrome.storage never throws', async () => {
  const { R } = load();
  assert.equal(await R.getFlag('newsSeen'), false);
  await R.setFlag('newsSeen', true);
  assert.equal(await R.getFlag('newsSeen'), true);
  const none = load({}, { noChrome: true }).R;
  assert.deepEqual([...(await none.list())], []);
  assert.equal(await none.isActive(), false);
  assert.equal(await none.upsertCrm({ ...base, dueAt: DUE }, NOW).then(() => 'ok'), 'ok');
  assert.equal(typeof none.onChange(() => {}), 'function');
});
