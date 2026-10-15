// tests/queue-context-wiring.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const sz = manifest.content_scripts.find(entry => entry.js.includes('content.js'));

test('queue context scripts load in dependency order before content.js', () => {
  const order = ['modules/queue-context-parse.js', 'modules/queue-context-store.js',
    'modules/queue-context-capture.js', 'modules/queue-context.js', 'content.js'].map(f => sz.js.indexOf(f));
  assert.ok(order.every(i => i >= 0), 'all files present');
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.ok(sz.js.indexOf('utils/messaging.js') < order[0]);
  assert.ok(sz.css.includes('styles/queue-context.css'));
});

test('priority center is fully removed', () => {
  for (const file of ['manifest.json', 'content.js', 'modules/theme.js', 'styles/tokens.css']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.ok(!/support-focus|SupportFocusModule|atendeai-focus-/.test(source), file);
  }
  for (const file of ['modules/support-focus.js', 'styles/support-focus.css', 'tests/support-focus.test.js']) {
    assert.equal(fs.existsSync(file), false, file);
  }
  assert.match(fs.readFileSync('content.js', 'utf8'), /QueueContextModule\.mount\(\)/);
});
