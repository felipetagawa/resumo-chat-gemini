const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load() {
  const context = { window: {}, Date };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('modules/retornos-schedule.js', 'utf8'), context);
  return context.window.RetornosSchedule;
}
const S = load();
const at = (d, h = 10, m = 0) => new Date(2026, 10, d, h, m, 0);
const stamp = (date) => [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()].join('-');

test('default shortcuts are Amanhã 08:00, Amanhã 14:00 and Segunda 08:00', () => {
  const list = S.defaultShortcuts();
  assert.deepEqual([...list.map((s) => `${s.day} ${s.time}`)], ['amanha 08:00', 'amanha 14:00', 'seg 08:00']);
  assert.equal(new Set(list.map((s) => s.id)).size, 3);
});

test('"Amanhã" is the next day, but a Friday or Saturday jumps to Monday and the label says so', () => {
  const amanha = { id: 'a', day: 'amanha', time: '08:00' };
  assert.equal(stamp(S.resolveShortcut(amanha, at(5))), '2026-11-6-8-0');     // quinta -> sexta
  assert.equal(stamp(S.resolveShortcut(amanha, at(6))), '2026-11-9-8-0');     // sexta -> segunda
  assert.equal(stamp(S.resolveShortcut(amanha, at(7))), '2026-11-9-8-0');     // sábado -> segunda
  assert.equal(stamp(S.resolveShortcut(amanha, at(8))), '2026-11-9-8-0');     // domingo -> segunda
  assert.equal(S.shortcutLabel(amanha, at(5)), 'Amanhã 08:00');
  assert.equal(S.shortcutLabel(amanha, at(6)), 'Segunda 08:00');
});

test('"Segunda" is always the next Monday after today, never today', () => {
  const seg = { id: 's', day: 'seg', time: '08:00' };
  assert.equal(stamp(S.resolveShortcut(seg, at(5))), '2026-11-9-8-0');
  assert.equal(stamp(S.resolveShortcut(seg, at(9))), '2026-11-16-8-0');
  assert.equal(stamp(S.resolveShortcut({ id: 'd', day: 'depois', time: '09:30' }, at(5))), '2026-11-7-9-30');
  assert.equal(stamp(S.resolveShortcut({ id: 'q', day: 'qui', time: '10:00' }, at(5))), '2026-11-12-10-0');
});

test('invalid shortcut times fall back to 08:00 instead of throwing', () => {
  assert.equal(stamp(S.resolveShortcut({ id: 'x', day: 'amanha', time: '99:99' }, at(5))), '2026-11-6-8-0');
  assert.equal(stamp(S.resolveShortcut({ id: 'x', day: 'nada', time: '08:00' }, at(5))), '2026-11-6-8-0');
});

test('snooze offers 15 min, 1 h and tomorrow 08:00 (Monday after a Friday)', () => {
  const options = S.snoozeOptions(at(6, 18, 0));
  assert.deepEqual([...options.map((o) => o.id)], ['15m', '1h', 'tomorrow']);
  assert.equal(options[0].at, at(6, 18, 15).getTime());
  assert.equal(options[1].at, at(6, 19, 0).getTime());
  assert.equal(options[2].at, at(9, 8, 0).getTime());
  assert.equal(options[2].label, 'Segunda 08:00');
  assert.equal(S.snoozeOptions(at(5, 18, 0))[2].label, 'Amanhã 08:00');
});

test('CRM date text round-trips as dd/MM/yyyy HH:mm and rejects garbage', () => {
  assert.equal(S.toCrmValue(at(9, 8, 0)), '09/11/2026 08:00');
  assert.equal(stamp(S.parseCrmValue('09/11/2026 08:00')), '2026-11-9-8-0');
  assert.equal(S.parseCrmValue('09/11/2026'), null);
  assert.equal(S.parseCrmValue('31/02/2026 08:00'), null);
  assert.equal(S.parseCrmValue(''), null);
});

test('groupRetornos splits overdue, today and next, each ordered by due time', () => {
  const now = at(5, 10).getTime();
  const items = [
    { key: 'c', dueAt: at(7, 8).getTime() },
    { key: 'a', dueAt: at(4, 15).getTime() },
    { key: 'b', dueAt: at(5, 11).getTime() },
    { key: 'a2', dueAt: at(5, 9).getTime() }
  ];
  const g = S.groupRetornos(items, now);
  assert.deepEqual([...g.atrasados.map((i) => i.key)], ['a', 'a2']);
  assert.deepEqual([...g.hoje.map((i) => i.key)], ['b']);
  assert.deepEqual([...g.proximos.map((i) => i.key)], ['c']);
});

test('labels say when it is and when it was scheduled, in plain Portuguese', () => {
  const now = at(5, 10).getTime();
  assert.equal(S.whenLabel(at(5, 8).getTime(), now), 'hoje 08:00');
  assert.equal(S.whenLabel(at(6, 14).getTime(), now), 'amanhã 14:00');
  assert.equal(S.whenLabel(at(4, 8).getTime(), now), 'ontem 08:00');
  assert.equal(S.whenLabel(at(9, 8).getTime(), now), 'seg 09/11 08:00');
  assert.equal(S.createdLabel(at(4, 9).getTime(), now), 'agendado ontem por você');
  assert.equal(S.createdLabel(at(5, 9).getTime(), now), 'agendado hoje por você');
  assert.equal(S.createdLabel(at(2, 9).getTime(), now), 'agendado em 02/11 por você');
});

test('name and phone normalization', () => {
  assert.equal(S.normalizeName('  João   da Silva, ME! '), 'joao da silva me');
  assert.equal(S.phoneKey('(11) 98888-7777'), '88887777');
  assert.equal(S.phoneKey('12345'), '');
});

test('matchChat prefers the phone, then a full name, and says nothing when in doubt', () => {
  const retornos = [
    { key: '1', cliente: 'Padaria Pão Quente', solicitante: 'Maria Souza', telefones: ['(11) 98888-7777'] },
    { key: '2', cliente: 'Mercado Bom Preço', solicitante: 'Carlos', telefones: ['11 3333-4444'] }
  ];
  assert.equal(S.matchChat(retornos, { name: 'zzz', phone: '5511988887777' }).key, '1');
  assert.equal(S.matchChat(retornos, { name: 'maria souza', phone: '' }).key, '1');
  assert.equal(S.matchChat(retornos, { name: 'Mercado Bom Preço' }).key, '2');
  assert.equal(S.matchChat(retornos, { name: 'Carlos' }), null, 'one-word names are not reliable');
  assert.equal(S.matchChat(retornos, { name: 'Pessoa Qualquer', phone: '11 97777-0000' }), null);
  const dup = [...retornos, { key: '3', cliente: 'Outra Loja', solicitante: 'Maria Souza', telefones: [] }];
  assert.equal(S.matchChat(dup, { name: 'Maria Souza' }), null, 'two different returns for the same name');
  assert.equal(S.matchChat([], { name: 'Maria Souza' }), null);
});
