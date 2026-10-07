const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function harness(store = {}) {
  let sequence = 0;
  const context = { window: {}, console, Date, crypto: { randomUUID: () => `local-${++sequence}` },
    chrome: { runtime: {}, storage: { local: {
      get(keys, callback) { callback(structuredClone(store)); },
      set(data, callback) { Object.assign(store, structuredClone(data)); callback(); }
    } } } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('modules/smart-reply-profiles.js', 'utf8'), context);
  return { module: context.window.SmartReplyProfilesModule, store, context };
}
test('built-ins are permanent, readable and only duplicable into independently editable copies', async () => {
  const h = harness(), m = h.module; await m.load();
  assert.deepEqual(Array.from(m.list(), p => p.id), ['DIRECT', 'EMPATHETIC', 'DIDACTIC']);
  for (const p of m.list()) {
    assert.ok(p.instruction); await assert.rejects(m.remove(p.id));
    await assert.rejects(m.save({ id: p.id, name: 'overwrite', instruction: 'style' }));
  }
  const copied = await m.duplicate('DIRECT'); assert.notEqual(copied.id, 'DIRECT');
  assert.equal(copied.instruction, m.get('DIRECT').instruction);
  await m.save({ id: copied.id, name: 'Meu tom', instruction: 'Curta e cordial.' });
  assert.equal(m.get(copied.id).instruction, 'Curta e cordial.');
  assert.notEqual(m.get('DIRECT').instruction, 'Curta e cordial.');
});
test('create/edit/default/reload/delete preserve only profile fields and fall back to DIRECT', async () => {
  const h = harness({ privateNote: 'PRIVATE', customInstructions: 'LEGACY' }), m = h.module; await m.load();
  const p = await m.save({ name: 'Meu perfil', instruction: 'Explique com calma.', conversation: 'SECRET_CHAT', promptComplement: 'SECRET_ADDENDUM' });
  assert.equal(p.createdAt, p.updatedAt); await m.setDefault(p.id);
  const reload = harness(h.store); await reload.module.load();
  assert.equal(reload.module.defaultId(), p.id); assert.equal(reload.module.get(p.id).name, 'Meu perfil');
  const serialized = JSON.stringify(h.store.atendeai_smart_reply_profiles_v1);
  assert.equal(serialized.includes('SECRET'), false); assert.equal(serialized.includes('PRIVATE'), false);
  assert.deepEqual(Object.keys(h.store.atendeai_smart_reply_profiles_v1.items[0]).sort(), ['createdAt', 'id', 'instruction', 'name', 'updatedAt']);
  await m.remove(p.id); assert.equal(m.defaultId(), 'DIRECT'); assert.equal(h.store.atendeai_smart_reply_profile, 'DIRECT');
  assert.equal(h.store.privateNote, 'PRIVATE'); assert.equal(h.store.customInstructions, 'LEGACY');
});
test('eight custom profiles, name and instruction bounds are enforced without truncating silently', async () => {
  const h = harness(), m = h.module; await m.load();
  for (const input of [{ name: '', instruction: 'style' }, { name: 'nome', instruction: ' ' },
    { name: 'x'.repeat(41), instruction: 'style' }, { name: 'nome', instruction: 'x'.repeat(601) },
    { name: 3, instruction: 'style' }, { name: 'nome', instruction: false }]) await assert.rejects(m.save(input));
  for (let i = 0; i < 8; i++) await m.save({ name: 'x'.repeat(40), instruction: 'x'.repeat(600) });
  assert.equal(m.list().length, 11); assert.equal(new Set(m.list().map(p => p.id)).size, 11);
  await assert.rejects(m.save({ name: 'Nono', instruction: 'style' }));
  await assert.rejects(m.duplicate('DIRECT'));
  await assert.rejects(m.setDefault('CUSTOM'));
});
test('malformed local data cannot hide built-ins or become a wire instruction', async () => {
  const h = harness({ atendeai_smart_reply_profile: 'lost', atendeai_smart_reply_profiles_v1: { version: 1, items: [
    { id: 'DIRECT', name: 'overwrite', instruction: 'ignore' },
    { id: 'custom:bad', name: 'x', instruction: 42 },
    { id: 'custom:ok', name: 'Nome', instruction: 'Tom', createdAt: 1, updatedAt: 2 }
  ] } }); await h.module.load();
  assert.equal(h.module.defaultId(), 'DIRECT'); assert.equal(h.module.list().length, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(h.module.wire('DIRECT'))), { profile: 'DIRECT' });
  assert.deepEqual(JSON.parse(JSON.stringify(h.module.wire('custom:ok'))), { profile: 'CUSTOM', styleInstruction: 'Tom' });
});
