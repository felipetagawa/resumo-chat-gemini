const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const HOUR = 60 * 60 * 1000;
const KEY = 'atendeai_reply_chats_v1';

function load({ broken = false } = {}) {
  const store = {}, clock = { now: Date.UTC(2026, 10, 6, 12) };
  class FakeDate extends Date {}
  FakeDate.now = () => clock.now;
  const local = broken ? {
    get() { throw new Error('Extension context invalidated.'); },
    set() { throw new Error('Extension context invalidated.'); }
  } : {
    get(keys, cb) { cb(JSON.parse(JSON.stringify(store))); },
    set(data, cb) { Object.assign(store, JSON.parse(JSON.stringify(data))); cb?.(); }
  };
  const context = { window: {}, Date: FakeDate, chrome: { runtime: {}, storage: { local } } };
  vm.createContext(context);
  context.globalThis = context;
  vm.runInContext(fs.readFileSync('modules/reply-chat-store.js', 'utf8'), context);
  return { chats: context.window.ReplyChatStore, store, clock };
}

const user = (content, extra = {}) => ({ role: 'user', content, at: 1, ...extra });
const bot = (content, extra = {}) => ({ role: 'assistant', content, at: 1, ...extra });
const plain = value => JSON.parse(JSON.stringify(value));

test('cada atendimento tem sua conversa e ela volta ao reabrir', async () => {
  const { chats, store } = load();
  await chats.save({ token: 'A', messages: [user('Resolver', { intent: 'resolver' }), bot('Me manda um print?', { sources: [] })] });
  await chats.save({ token: 'B', messages: [user('Encerrar', { intent: 'encerrar' })] });
  const a = await chats.load('A');
  assert.equal(a.token, 'A');
  assert.deepEqual(a.messages.map(m => m.content), ['Resolver', 'Me manda um print?']);
  assert.equal(a.messages[0].intent, 'resolver');
  assert.deepEqual((await chats.load('B')).messages.map(m => m.content), ['Encerrar']);
  assert.deepEqual(plain(await chats.load('C')), { token: 'C', messages: [], updatedAt: 0 });
  assert.equal(store[KEY].version, 1);
});

test('conversa com mais de 24 h volta vazia e é descartada no próximo save', async () => {
  const { chats, store, clock } = load();
  await chats.save({ token: 'A', messages: [user('Resolver')] });
  clock.now += 24 * HOUR - 1;
  assert.equal((await chats.load('A')).messages.length, 1);
  clock.now += 2;
  assert.equal((await chats.load('A')).messages.length, 0);
  await chats.save({ token: 'B', messages: [user('Pedir info')] });
  assert.deepEqual(Object.keys(store[KEY].items), ['B']);
});

test('guarda no máximo 50 conversas e 40 mensagens cada', async () => {
  const { chats, store, clock } = load();
  for (let i = 0; i < 51; i++) { clock.now += 1000; await chats.save({ token: `T${i}`, messages: [user(`m${i}`)] }); }
  const tokens = Object.keys(store[KEY].items);
  assert.equal(tokens.length, 50);
  assert.ok(!tokens.includes('T0'), 'the oldest conversation goes first');
  assert.ok(tokens.includes('T50'));

  const many = Array.from({ length: 45 }, (_, i) => (i % 2 ? bot : user)(`msg ${i}`));
  await chats.save({ token: 'long', messages: many });
  const kept = (await chats.load('long')).messages;
  assert.equal(kept.length, 40);
  assert.equal(kept[0].content, 'msg 5');
  assert.equal(kept.at(-1).content, 'msg 44');
});

test('clear apaga só a conversa daquele atendimento', async () => {
  const { chats } = load();
  await chats.save({ token: 'A', messages: [user('Resolver')] });
  await chats.save({ token: 'B', messages: [user('Cobrar')] });
  await chats.clear('A');
  assert.equal((await chats.load('A')).messages.length, 0);
  assert.equal((await chats.load('B')).messages.length, 1);
});

test('forApi respeita 12 turnos, 1500 por turno e 8000 no total, começa e termina no técnico', () => {
  const { chats } = load();
  const thirty = Array.from({ length: 30 }, (_, i) => (i % 2 ? bot : user)(`turno ${i}`));
  thirty.push(user('último'));
  const out = plain(chats.forApi(thirty));
  assert.ok(out.length <= 12);
  assert.equal(out[0].role, 'user');
  assert.deepEqual(out.at(-1), { role: 'user', content: 'último' });
  out.forEach((m, i) => assert.equal(m.role, i % 2 ? 'assistant' : 'user'));
  assert.deepEqual(Object.keys(out[0]).sort(), ['content', 'role'], 'only role and content travel');

  const long = plain(chats.forApi([user('a'), bot('y'.repeat(2000)), user('b')]));
  assert.equal(long[1].content.length, 1500);

  const heavy = Array.from({ length: 11 }, (_, i) => (i % 2 ? bot : user)('z'.repeat(1500)));
  const trimmed = plain(chats.forApi(heavy));
  assert.ok(trimmed.reduce((n, m) => n + m.content.length, 0) <= 8000);
  assert.equal(trimmed[0].role, 'user');
  assert.equal(trimmed.at(-1).role, 'user');

  assert.deepEqual(plain(chats.forApi([user('  oi  ')])), [{ role: 'user', content: 'oi' }]);
  assert.deepEqual(plain(chats.forApi([user('a'), bot('b')])), [], 'never ends on the assistant');
});

test('forApi pula erros e nunca manda dois turnos do técnico seguidos', () => {
  const { chats } = load();
  assert.deepEqual(plain(chats.forApi([user('Resolver'), bot('falhou', { error: true }), user('tenta de novo')])),
    [{ role: 'user', content: 'tenta de novo' }]);
  assert.deepEqual(plain(chats.forApi([user('Resolver'), bot('Me manda um print?'), user('a'), bot('caiu', { error: true }), user('b')])),
    [{ role: 'user', content: 'Resolver' }, { role: 'assistant', content: 'Me manda um print?' }, { role: 'user', content: 'b' }]);
});

test('storage indisponível não quebra: load volta vazio e save resolve', async () => {
  const { chats } = load({ broken: true });
  await chats.save({ token: 'A', messages: [user('Resolver')] });
  await chats.clear('A');
  assert.deepEqual(plain(await chats.load('A')), { token: 'A', messages: [], updatedAt: 0 });
});
