// tests/queue-context-store.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const KEY = 'atendeai_queue_context_v1';

function load(store = {}, locks) {
  let clock = 1_000_000_000, sets = 0;
  const context = {
    Date: class extends Date { static now() { return clock; } },
    navigator: { locks },
    chrome: { runtime: {}, storage: { local: {
      get(keys, cb) { setImmediate(() => cb(structuredClone(store))); },
      set(data, cb) { sets++; setImmediate(() => { Object.assign(store, structuredClone(data)); cb(); }); },
      remove(keys, cb) { [].concat(keys).forEach(k => delete store[k]); cb(); }
    } } }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('modules/queue-context-store.js', 'utf8'), context);
  return { S: context.QueueContextStore, store, advance: ms => { clock += ms; }, sets: () => sets };
}

test('merge creates an item and timestamps it', async () => {
  const { S, store } = load();
  const item = await S.merge('a', { anydesk: '123456789', problem: { text: 'erro xml', source: 'heuristic' } });
  assert.equal(item.anydesk, '123456789'); assert.equal(item.problem.source, 'heuristic');
  assert.equal(store[KEY].items.a.updatedAt, 1_000_000_000);
});

test('source precedence: manual > ai > heuristic', async () => {
  const { S } = load();
  await S.merge('a', { problem: { text: 'h', source: 'heuristic' } });
  assert.equal((await S.merge('a', { problem: { text: 'ia', source: 'ai' } })).problem.text, 'ia');
  assert.equal((await S.merge('a', { problem: { text: 'h2', source: 'heuristic' } })).problem.text, 'ia');
  assert.equal((await S.merge('a', { problem: { text: 'eu', source: 'manual' } })).problem.text, 'eu');
  assert.equal((await S.merge('a', { problem: { text: 'ia2', source: 'ai' } })).problem.text, 'eu');
});

test('aiRequested is sticky and a null anydesk never clears a known one', async () => {
  const { S } = load();
  await S.merge('a', { anydesk: '123456789', aiRequested: true });
  const item = await S.merge('a', { anydesk: null, problem: null });
  assert.equal(item.aiRequested, true); assert.equal(item.anydesk, '123456789');
});

test('unchanged merge does not write; empty first merge stores nothing', async () => {
  const { S, store, sets } = load();
  assert.equal(await S.merge('a', { anydesk: null, problem: null }), null);
  assert.equal(store[KEY], undefined);
  await S.merge('a', { anydesk: '123456789' }); const before = sets();
  await S.merge('a', { anydesk: '123456789' }); assert.equal(sets(), before);
});

test('items older than 3 days are ignored and pruned; legacy keys removed', async () => {
  const { S, store, advance } = load({ atendeai_support_focus_v1: { items: {} }, atendeai_support_focus_badges_enabled: true });
  await S.merge('old', { anydesk: '123456789' });
  advance(3 * 86400000);
  await S.merge('new', { anydesk: '987654321' });
  assert.equal(await S.get('old'), null);
  assert.deepEqual(Object.keys(await S.all()), ['new']);
  await S.prune();
  assert.deepEqual(Object.keys(store[KEY].items), ['new']);
  assert.equal(store.atendeai_support_focus_v1, undefined);
  assert.equal(store.atendeai_support_focus_badges_enabled, undefined);
});

test('concurrent merges from two tabs are both persisted', async () => {
  const store = {}; let queue = Promise.resolve();
  const locks = { request(key, fn) { assert.equal(key, KEY); const run = queue.then(fn); queue = run.catch(() => {}); return run; } };
  const a = load(store, locks), b = load(store, locks);
  await Promise.all([a.S.merge('x', { anydesk: '123456789' }), b.S.merge('y', { anydesk: '987654321' })]);
  assert.deepEqual(Object.keys(store[KEY].items).sort(), ['x', 'y']);
});

test('one-time repair keeps only manual lines, since older captures could mix chats', async () => {
  const at = 1_000_000_000;
  const { S, store } = load({ [KEY]: { version: 1, items: {
    junk: { anydesk: '363528019', problem: { text: 'Iniciar', source: 'heuristic' }, aiRequested: true, updatedAt: at },
    empty: { anydesk: null, problem: { text: 'Iniciar', source: 'heuristic' }, aiRequested: true, updatedAt: at },
    good: { anydesk: null, problem: { text: 'Não emite nota', source: 'heuristic' }, aiRequested: true, updatedAt: at },
    ai: { anydesk: null, problem: { text: 'Nota rejeitada', source: 'ai' }, aiRequested: true, updatedAt: at },
    mine: { anydesk: '111222333', problem: { text: 'Boleto não gera', source: 'manual' }, aiRequested: true, updatedAt: at } } } });
  const isProblem = text => text !== 'Iniciar';
  await S.prune(isProblem);
  assert.equal(store[KEY].version, 3);
  assert.deepEqual(Object.keys(store[KEY].items), ['mine']);
  assert.deepEqual([store[KEY].items.mine.problem.text, store[KEY].items.mine.anydesk], ['Boleto não gera', null]);
  // Runs once: data captured after the repair survives the next load.
  await S.merge('good', { anydesk: '123456789' });
  await S.prune(isProblem);
  assert.equal(store[KEY].items.good.anydesk, '123456789');
});
