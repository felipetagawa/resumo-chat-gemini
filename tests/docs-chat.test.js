const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./mini-dom');

function load() {
  const document = createDocument();
  const context = { document, window: {}, console, setTimeout, globalThis: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('modules/docs.js', 'utf8'), context);
  return context.window.DocsModule._test;
}

test('messagesForApi keeps the latest alternating turns within the API limits and drops errors', () => {
  const { messagesForApi } = load();
  const messages = [];
  for (let i = 0; i < 15; i++) {
    messages.push({ role: 'user', content: `pergunta ${i}` });
    messages.push({ role: 'assistant', content: `resposta ${i}`, sources: [] });
  }
  messages.push({ role: 'user', content: 'última' });
  const out = messagesForApi(messages);
  assert.ok(out.length <= 19);
  assert.equal(out[0].role, 'user');
  assert.equal(out.at(-1).content, 'última');
  out.forEach((m, i) => assert.equal(m.role, i % 2 === 0 ? 'user' : 'assistant'));

  const withError = messagesForApi([{ role: 'user', content: 'a' }, { role: 'assistant', error: true, content: 'falhou' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(withError)), [{ role: 'user', content: 'a' }]);

  const long = messagesForApi([
    { role: 'user', content: 'x'.repeat(2000) }, { role: 'assistant', content: 'y'.repeat(2000) },
    ...Array.from({ length: 6 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'z'.repeat(2000) })),
    { role: 'assistant', content: 'w'.repeat(2000) }, { role: 'user', content: 'fim' }
  ]);
  assert.ok(long.reduce((n, m) => n + m.content.length, 0) <= 16000);
  assert.equal(long[0].role, 'user');
});

test('safeSources only keeps links to the official documentation site', () => {
  const { safeSources } = load();
  const out = safeSources([
    { n: 1, title: 'Cancelar NF-e', url: 'https://docs.softensistemas.com.br/books/siem-nf-e/page/x', updated: '2026-01-02' },
    { n: 2, title: 'Phishing', url: 'https://evil.example/' },
    { n: 3, title: 'JS', url: 'javascript:alert(1)' }
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, 'Cancelar NF-e');
});

test('conversation title and dates are short and readable', () => {
  const { titleFrom, formatDate } = load();
  assert.equal(titleFrom('  como   cancelar  '), 'como cancelar');
  assert.ok(titleFrom('a'.repeat(100)).length <= 58);
  assert.equal(formatDate('2026-11-03 16:08:59'), '03/11/2026');
  assert.equal(formatDate(''), '');
});
