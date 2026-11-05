const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load(store = {}) {
  const context = { window: {}, Date, chrome: { runtime: {}, storage: { local: {
    get(keys, cb) { cb(JSON.parse(JSON.stringify(store))); },
    set(data, cb) { Object.assign(store, JSON.parse(JSON.stringify(data))); cb?.(); } } } } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('modules/daily-notices.js', 'utf8'), context);
  return { notices: context.window.DailyNoticesModule, store };
}

test('validity: hours, days, a week, no expiry, and and "today" ends at 23:59 local', () => {
  const { expiryFor } = load().notices._test;
  const now = new Date(2026, 10, 5, 10, 0, 0).getTime();
  assert.equal(expiryFor('2h', now) - now, 2 * 3600000);
  assert.equal(expiryFor('4h', now) - now, 4 * 3600000);
  assert.equal(expiryFor('24h', now) - now, 24 * 3600000);
  assert.equal(expiryFor('3d', now) - now, 3 * 86400000);
  assert.equal(expiryFor('7d', now) - now, 7 * 86400000);
  assert.ok(expiryFor('forever', now) > now + 100 * 365 * 86400000, '"Até eu remover" never expires');
  const end = new Date(expiryFor('today', now));
  assert.equal(end.getDate(), 5); assert.equal(end.getHours(), 23); assert.equal(end.getMinutes(), 59);
});

test('expired notices disappear from storage and from requests; at most five are kept', async () => {
  const { notices, store } = load({ atendeai_daily_notices_v1: [
    { id: 'old', text: 'manutenção ontem', expiresAt: Date.now() - 1000 },
    { id: 'ok', text: 'SEFAZ-MG instável', expiresAt: Date.now() + 3600000 }
  ] });
  assert.deepEqual([...await notices.forRequest()], ['SEFAZ-MG instável']);
  assert.equal(store.atendeai_daily_notices_v1.length, 1);
  for (let i = 0; i < 6; i++) await notices.add(`aviso ${i}`, '2h');
  const list = await notices.list();
  assert.equal(list.length, 5);
  assert.equal(list.at(-1).text, 'aviso 5');
  await notices.remove(list[0].id);
  assert.equal((await notices.list()).length, 4);
  await notices.add('   ', 'today');
  assert.equal((await notices.list()).length, 4, 'blank notices are ignored');
});

test('a notice without expiry survives reads and says "até você remover"', async () => {
  const { notices } = load();
  await notices.add('SEFAZ-MG instável esta semana', 'forever');
  const [item] = await notices.list();
  assert.equal(notices.untilLabel(item.expiresAt), 'até você remover');
  assert.deepEqual([...await notices.forRequest()], ['SEFAZ-MG instável esta semana']);
});
