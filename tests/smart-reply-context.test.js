const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { el, createDocument } = require('./mini-dom');
const KEY = 'atendeai_smart_reply_context_v1';
function harness(store = {}) {
  let sourceId = 'chat:A', now = 100000000, blocked;
  const document = createDocument(), timers = new Map(); let seq = 0;
  const field = el('textarea', { id: 'atendeai-reply-addendum' });
  document.body.appendChild(field);
  const context = { document, window: {}, console,
    Date: class extends Date { static now() { return now; } },
    setTimeout(fn) { timers.set(++seq, fn); return seq; }, clearTimeout(id) { timers.delete(id); },
    RecoveryBufferModule: { getCurrentConversationIdentity: () => sourceId ? { sourceId } : null },
    StorageHelper: { async get() { if (blocked) await blocked; return structuredClone(store); },
      async set(data) { Object.assign(store, structuredClone(data)); } }
  };
  vm.createContext(context); vm.runInContext(fs.readFileSync('modules/smart-reply-context.js', 'utf8'), context);
  const module = context.window.SmartReplyContextModule;
  return { module, store, field, context,
    switch(id) { sourceId = id; }, expire() { now += 86400001; },
    block() { let release; blocked = new Promise(r => { release = r; }); return () => { blocked = null; release(); }; },
    async edit(value) { field.value = value; await Promise.all((field.listeners.input || []).map(fn => fn())); },
    async flush() { const batch = [...timers.values()]; timers.clear(); for (const fn of batch) await fn(); }
  };
}
test('dedicated storage restores only the matching attendance and expires after 24 hours', async () => {
  const h = harness(); await h.module.sync(); h.module.bind(); await h.edit('AUDIO_A'); await h.flush();
  assert.equal(h.module.getForCurrentChat(), 'AUDIO_A');
  h.switch('chat:B'); assert.equal(h.module.getForCurrentChat(), ''); await h.module.sync();
  assert.equal(h.field.value, ''); await h.edit('REMOTE_B'); await h.flush();
  h.switch('chat:A'); await h.module.sync(); assert.equal(h.field.value, 'AUDIO_A');
  const reload = harness(h.store); await reload.module.sync(); reload.module.bind(); assert.equal(reload.field.value, 'AUDIO_A');
  h.expire(); assert.equal(h.module.getForCurrentChat(), ''); await h.module.sync();
  assert.deepEqual(Object.keys(h.store[KEY].items), []); assert.equal(h.field.value, '');
});
test('rapid switch and delayed storage read cannot write or render A in B', async () => {
  const h = harness(); await h.module.sync(); h.module.bind(); await h.edit('PENDING_A');
  const release = h.block(); const saving = h.flush(); await Promise.resolve();
  h.switch('chat:B'); const loading = h.module.sync(); assert.equal(h.field.value, '');
  release(); await Promise.all([saving, loading]);
  assert.equal(h.module.getForCurrentChat(), ''); assert.equal(h.store[KEY]?.items['chat:B'], undefined);
  assert.equal(h.store[KEY].items['chat:A'].text, 'PENDING_A');
});

test('switch before debounce saves captured A only and a late A load never paints B', async () => {
  const h = harness(); await h.module.sync(); h.module.bind(); await h.edit('ONLY_A');
  h.switch('chat:B'); await h.module.sync(); assert.equal(h.field.value, '');
  assert.equal(h.store[KEY].items['chat:A'].text, 'ONLY_A'); assert.equal(h.store[KEY].items['chat:B'], undefined);
  const release = h.block(); h.switch('chat:A'); const a = h.module.sync();
  h.switch('chat:B'); const b = h.module.sync(); release(); await Promise.all([a, b]);
  assert.equal(h.field.value, ''); assert.equal(h.module.getForCurrentChat(), '');
});
test('unsafe identity disables association; input and payload are bounded to 2000', async () => {
  const h = harness(); await h.module.sync(); h.module.bind(); await h.edit('x'.repeat(2200)); await h.flush();
  assert.equal(h.field.value.length, 2000); assert.equal(h.module.getForCurrentChat().length, 2000);
  assert.equal(h.store[KEY].items['chat:A'].text.length, 2000);
  h.switch(''); await h.module.sync(); assert.equal(h.field.disabled, true); assert.equal(h.field.value, '');
  await h.edit('DO_NOT_ASSOCIATE'); await h.flush(); assert.equal(Object.keys(h.store[KEY].items).length, 1);
});
test('retention stays bounded and clearing deletes only the active attendance', async () => {
  const h = harness();
  for (let i = 0; i < 55; i++) { h.switch(`chat:${i}`); await h.module.sync(); h.module.bind(); await h.edit(`addendum ${i}`); await h.flush(); }
  assert.equal(Object.keys(h.store[KEY].items).length, 50);
  const preserved = Object.keys(h.store[KEY].items).filter(id => id !== 'chat:54').sort();
  await h.edit(''); await h.flush(); assert.equal(Object.keys(h.store[KEY].items).length, 49);
  assert.equal(h.store[KEY].items['chat:54'], undefined);
  assert.deepEqual(Object.keys(h.store[KEY].items).sort(), preserved);
});
