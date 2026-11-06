const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./mini-dom');

// Client names come from SZ (a webchat customer types their own name) and summaries can echo
// customer messages: both must reach the page as text, never as markup.
const HOSTILE = '<img src=x onerror="alert(1)">';

function load(file, extra = {}) {
  const document = createDocument();
  const context = {
    document, window: {}, console: { log() {}, error() {}, warn() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    setTimeout() { return 0; }, clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    chrome: { storage: { local: { get() {}, set() {} } } },
    ...extra
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  return context;
}

test('resumo formatado mostra marcacao do cliente como texto, mantendo negrito e quebras', () => {
  const { window } = load('modules/summary.js');
  const html = window.SummaryModule.formatarResumoComNegrito(`**CLIENTE:** ${HOSTILE}\nlinha 2 & "aspas"`);
  assert.ok(!html.includes('<img'), html);
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'), html);
  assert.ok(html.includes('<strong>CLIENTE:</strong>'), html);
  assert.ok(html.includes('<br>linha 2 &amp; &quot;aspas&quot;'), html);
});

test('item do historico no CRM mostra nome e problema como texto', () => {
  const context = load('modules/crm-automation.js');
  const module = vm.runInContext('CRMAutomationModule', context);
  const nodes = module.historyItemContent(context.document, HOSTILE, `${HOSTILE} problema`);
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].textContent, HOSTILE);
  assert.equal(nodes[1].textContent, `${HOSTILE} problema`);
  assert.ok(nodes.every(node => node.innerHTML === undefined), 'built without innerHTML');
});

test('item do historico sem problema mostra o texto padrao', () => {
  const context = load('modules/crm-automation.js');
  const module = vm.runInContext('CRMAutomationModule', context);
  const nodes = module.historyItemContent(context.document, 'ROBERTA', '');
  assert.equal(nodes[1].textContent, 'Sem descrição do problema...');
});
