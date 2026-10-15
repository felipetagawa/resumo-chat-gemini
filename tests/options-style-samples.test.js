const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('options mostra e limpa as amostras de estilo, sem perfis nem prompt global', async () => {
  const source = fs.readFileSync('options.js', 'utf8'), html = fs.readFileSync('options.html', 'utf8');
  assert.doesNotMatch(source + html, /SmartReplyProfilesModule|smart-reply-profiles|smartReplyProfile|Empática|Didática/);
  assert.match(html, /id="clearStyleSamples"/); assert.match(html, /id="styleSamplesCount"/);
  assert.doesNotMatch(source, /customInstructions/); assert.doesNotMatch(html, /id="customInstructions"|Prompt Personalizado/);
  const start = source.indexOf('    // Style samples:');
  const end = source.indexOf('    renderHistory(base.history', start);
  assert.ok(start > 0 && end > start);
  const store = { atendeai_style_samples_v1: { version: 1, selfName: 'Felipe', items: [{ text: 'a', at: 1 }, { text: 'b', at: 2 }] },
    customInstructions: 'LEGACY_NO_MIGRATION' };
  const listeners = {};
  const button = { addEventListener(k, fn) { listeners[k] = fn; } };
  const el = { clearStyleSamples: button, styleSamplesCount: { textContent: '' }, status: { textContent: '' } };
  const context = { el, storageGet: async () => JSON.parse(JSON.stringify(store)),
    chrome: { storage: { local: { remove(key, cb) { delete store[key]; cb(); } } } } };
  vm.createContext(context);
  await vm.runInContext(`(async () => { ${source.slice(start, end)} })()`, context);
  assert.equal(el.styleSamplesCount.textContent, '2');
  await listeners.click();
  assert.equal(el.styleSamplesCount.textContent, '0');
  assert.equal(store.atendeai_style_samples_v1, undefined);
  assert.equal(store.customInstructions, 'LEGACY_NO_MIGRATION');
});
