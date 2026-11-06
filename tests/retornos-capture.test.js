const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { el, createDocument } = require('./mini-dom');

function load(store = { atendeai_user_sector: 'suporte' }) {
  const context = { window: {}, Date, Math, JSON, console, setTimeout, clearTimeout, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    chrome: { runtime: {}, storage: {
      local: {
        get(keys, cb) { const out = {}; (Array.isArray(keys) ? keys : [keys]).forEach((k) => { if (k in store) out[k] = JSON.parse(JSON.stringify(store[k])); }); cb(out); },
        set(data, cb) { Object.assign(store, JSON.parse(JSON.stringify(data))); cb?.(); }
      },
      onChanged: { addListener() {}, removeListener() {} }
    } } };
  vm.createContext(context);
  ['retornos-schedule', 'retornos-store', 'retornos-capture'].forEach((name) =>
    vm.runInContext(fs.readFileSync(`modules/${name}.js`, 'utf8'), context));
  return { C: context.window.RetornosCapture, R: context.window.RetornosStore, store, context };
}

const SYNTHETIC_SIGNATURES = [
  { mode: 'agendar', source: /btnAgendarSyn$/ },
  { mode: 'finalizar', source: /btnFinalizarSyn$/ },
  { mode: 'radio', source: /btnSalvarSyn$/ }
];
const okXml = '<partial-response><changes><redirect url="/crm-chamado-por-tecnico"/></changes></partial-response>';
const ok = (source, extra = {}) => ({ phase: 'complete', status: 200, source, responseText: okXml, ...extra });

test('with no recorded signature, interpretSave never decides anything (fails closed)', () => {
  const { C } = load();
  C._test.setSignatures([]);
  assert.equal(C.interpretSave(ok('frm:btnAgendarSyn'), {}), null);
});

test('interpretSave: ok only for a matching signature with an accepted response; refused on validation; null otherwise', () => {
  const { C } = load();
  C._test.setSignatures(SYNTHETIC_SIGNATURES);
  assert.deepEqual({ ...C.interpretSave(ok('frm:btnAgendarSyn'), {}) }, { outcome: 'ok', mode: 'agendar' });
  assert.deepEqual({ ...C.interpretSave(ok('frm:btnFinalizarSyn'), {}) }, { outcome: 'ok', mode: 'finalizar' });
  assert.deepEqual({ ...C.interpretSave(ok('frm:btnSalvarSyn'), { radioMode: 'finalizar' }) }, { outcome: 'ok', mode: 'finalizar' });
  assert.deepEqual({ ...C.interpretSave(ok('frm:btnSalvarSyn'), { radioMode: null }) }, { outcome: 'unknown', mode: null });
  assert.equal(C.interpretSave(ok('frm:outroBotao'), {}), null);
  assert.equal(C.interpretSave({ ...ok('frm:btnAgendarSyn'), phase: 'send' }, {}), null);
  const failed = '<partial-response><changes><extension ln="primefaces" type="args">{"validationFailed":true}</extension></changes></partial-response>';
  assert.deepEqual({ ...C.interpretSave(ok('frm:btnAgendarSyn', { responseText: failed }), {}) }, { outcome: 'refused', mode: 'agendar' });
  const withError = '<partial-response><changes><update id="frm:msgs"><![CDATA[<div class="ui-messages-error">x</div>]]></update></changes></partial-response>';
  assert.equal(C.interpretSave(ok('frm:btnAgendarSyn', { responseText: withError }), {}).outcome, 'refused');
  assert.equal(C.interpretSave(ok('frm:btnAgendarSyn', { status: 500 }), {}).outcome, 'refused');
});

test('interpretSave also reads the redacted response saved by the diagnostic mode', () => {
  const { C } = load();
  C._test.setSignatures(SYNTHETIC_SIGNATURES);
  const redacted = (response) => ({ phase: 'complete', status: 200, source: 'frm:btnAgendarSyn', response });
  assert.equal(C.interpretSave(redacted({ args: { validationFailed: true }, hasError: false, redirect: null }), {}).outcome, 'refused');
  assert.equal(C.interpretSave(redacted({ args: null, hasError: true, redirect: null }), {}).outcome, 'refused');
  assert.equal(C.interpretSave(redacted({ args: null, hasError: false, redirect: '/crm-chamado-por-tecnico' }), {}).outcome, 'ok');
});

test('recorded fixtures (tests/fixtures/retornos) replay through interpretSave', () => {
  const dir = path.join(process.cwd(), 'tests/fixtures/retornos');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  if (!files.length) { assert.ok(true, 'no recordings yet: see plan Task 1, step 8'); return; }
  const { C } = load();
  files.forEach((file) => {
    const fixture = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const expected = fixture.expect || {};
    const entries = Array.isArray(fixture) ? fixture : fixture.log;
    const complete = entries.filter((e) => e.kind === 'ajax' && e.phase === 'complete');
    const decided = complete.map((e) => C.interpretSave({ ...e, phase: 'complete' }, { radioMode: expected.mode })).filter(Boolean);
    if (expected.outcome) assert.equal(decided.at(-1)?.outcome, expected.outcome, file);
  });
});

test('applySave: Agendar with the box checked creates, reschedules, and unchecked removes; Finalizar removes; refused changes nothing', async () => {
  const { C, R } = load();
  const page = { protocolo: '2611060001', atendimentoId: '555', cliente: 'Padaria Pão Quente', solicitante: 'Maria', telefones: ['11988887777'], problema: 'NF-e', dateText: '09/11/2026 08:00' };
  const now = new Date(2026, 10, 6, 10, 0).getTime();
  await C.applySave({ outcome: 'ok', mode: 'agendar' }, page, true, now);
  assert.equal((await R.list())[0].dueAt, new Date(2026, 10, 9, 8, 0).getTime());
  await C.applySave({ outcome: 'ok', mode: 'agendar' }, { ...page, dateText: '10/11/2026 14:00' }, true, now + 1000);
  const list = await R.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].dueAt, new Date(2026, 10, 10, 14, 0).getTime());
  await C.applySave({ outcome: 'refused', mode: 'finalizar' }, page, true, now);
  await C.applySave({ outcome: 'unknown', mode: null }, page, true, now);
  assert.equal((await R.list()).length, 1, 'refused and unknown never remove');
  await C.applySave({ outcome: 'ok', mode: 'agendar' }, page, false, now);
  assert.equal((await R.list()).length, 0, 'box unchecked removes an existing return');
  await C.applySave({ outcome: 'ok', mode: 'agendar' }, page, false, now);
  assert.equal((await R.list()).length, 0, 'and creates nothing');
  await C.applySave({ outcome: 'ok', mode: 'agendar' }, page, true, now);
  await C.applySave({ outcome: 'ok', mode: 'finalizar' }, page, true, now);
  assert.equal((await R.list()).length, 0, 'Finalizar removes');
});

test('applySave never stores a return without a protocol or with an unreadable date', async () => {
  const { C, R } = load();
  const now = Date.now();
  await C.applySave({ outcome: 'ok', mode: 'agendar' }, { protocolo: '', dateText: '09/11/2026 08:00' }, true, now);
  await C.applySave({ outcome: 'ok', mode: 'agendar' }, { protocolo: '1', dateText: 'amanhã' }, true, now);
  assert.equal((await R.list()).length, 0);
});

function pageDoc() {
  const doc = createDocument();
  const radioA = el('input', { id: 'frmAtendimento:tbvAtendimento:lblOnOf:0', type: 'radio', name: 'frmAtendimento:tbvAtendimento:lblOnOf', value: 'false' });
  const radioF = el('input', { id: 'frmAtendimento:tbvAtendimento:lblOnOf:1', type: 'radio', name: 'frmAtendimento:tbvAtendimento:lblOnOf', value: 'true' });
  radioA.checked = true;
  const dateInput = el('input', { id: 'frmAtendimento:tbvAtendimento:agendamento_input', type: 'text' });
  dateInput.value = '09/11/2026 08:00';
  const resolucao = el('textarea', { id: 'frmAtendimento:tbvAtendimento:resolucao' });
  resolucao.value = 'PROBLEMA / DÚVIDA: Erro ao emitir NF-e\n\nSOLUÇÃO APRESENTADA: reiniciado';
  const prob = el('input', { id: 'probField', type: 'text' }); prob.value = '';
  const form = el('form', { id: 'frmAtendimento' }, [
    el('div', {}, [el('label', { for: 'protoField', text: 'Protocolo' }), el('span', { id: 'protoField', text: '2611060001' })]),
    el('div', {}, [el('label', { text: 'Cliente' }), el('span', { text: 'Padaria Pão Quente' })]),
    el('div', {}, [el('label', { text: 'Solicitante' }), el('span', { text: 'Maria Souza' })]),
    el('div', {}, [el('label', { text: 'Telefone' }), el('span', { text: '(11) 98888-7777' })]),
    el('div', {}, [el('label', { for: 'probField', text: 'Problema' }), prob]),
    el('div', {}, [radioA, el('label', { for: radioA.id, text: 'Agendar' }), radioF, el('label', { for: radioF.id, text: 'Finalizar' })]),
    el('div', { class: 'ui-calendar' }, [dateInput]),
    resolucao
  ]);
  doc.body.appendChild(form);
  return { doc, radioA, radioF, dateInput, prob, resolucao };
}

test('readMode follows the checked radio by its label (Agendar / Finalizar), not by a guessed value', () => {
  const { C } = load();
  const { doc, radioA, radioF } = pageDoc();
  assert.equal(C.readMode(doc), 'agendar');
  radioA.checked = false; radioF.checked = true;
  assert.equal(C.readMode(doc), 'finalizar');
  radioF.checked = false;
  assert.equal(C.readMode(doc), null);
});

test('readPage extracts protocol, id from the URL, client, requester, phones, problem and the native date text', () => {
  const { C } = load();
  const { doc, prob } = pageDoc();
  const page = C.readPage(doc, 'https://www.sistemaempresarialweb.com.br/crm-atendimento/98765?x=1');
  assert.equal(page.protocolo, '2611060001');
  assert.equal(page.atendimentoId, '98765');
  assert.equal(page.cliente, 'Padaria Pão Quente');
  assert.equal(page.solicitante, 'Maria Souza');
  assert.deepEqual([...page.telefones], ['(11) 98888-7777']);
  assert.equal(page.dateText, '09/11/2026 08:00');
  assert.equal(page.mode, 'agendar');
  assert.equal(page.problema, 'Erro ao emitir NF-e', 'empty Problema falls back to the first line of the Resolução');
  prob.value = 'Impressora fiscal';
  assert.equal(C.readPage(doc, '/crm-atendimento/1').problema, 'Impressora fiscal');
  assert.equal(C.readPage(doc, 'https://www.sistemaempresarialweb.com.br/crm-atendimento').atendimentoId, '');
});

test('start: the page snapshot taken at send time becomes a return when the save is accepted', async () => {
  const { C, R, store } = load();
  C._test.setSignatures(SYNTHETIC_SIGNATURES);
  const { doc } = pageDoc();
  const win = { location: { href: 'https://www.sistemaempresarialweb.com.br/crm-atendimento/98765' } };
  await C.start(doc, win);
  const fire = (signal) => doc.listeners.filter((l) => l.type === 'atendeai:crm-ajax').forEach((l) => l.fn({ detail: JSON.stringify(signal) }));
  fire({ phase: 'send', source: 'frm:btnSalvarSyn', status: 0 });
  fire(ok('frm:btnSalvarSyn'));
  await new Promise((r) => setTimeout(r, 20));
  const list = await R.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].atendimentoId, '98765');
  assert.equal(list[0].protocolo, '2611060001');
  assert.ok(store.atendeai_retornos_v1);
});

test('start does nothing for other sectors or when the feature is off', async () => {
  const { C, R } = load({ atendeai_user_sector: 'preatendimento' });
  C._test.setSignatures(SYNTHETIC_SIGNATURES);
  const { doc } = pageDoc();
  await C.start(doc, { location: { href: '/crm-atendimento/1' } });
  assert.equal(doc.listeners.filter((l) => l.type === 'atendeai:crm-ajax').length, 0);
  assert.equal((await R.list()).length, 0);
});
