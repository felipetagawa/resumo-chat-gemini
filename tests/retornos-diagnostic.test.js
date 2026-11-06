const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { el, createDocument } = require('./mini-dom');

function load(store = {}) {
  const context = { window: {}, Date, chrome: { runtime: {}, storage: { local: {
    get(keys, cb) { cb(JSON.parse(JSON.stringify(store))); },
    set(data, cb) { Object.assign(store, JSON.parse(JSON.stringify(data))); cb?.(); } } } } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('modules/retornos-diagnostic.js', 'utf8'), context);
  return { diag: context.window.RetornosDiagnostic, store };
}

test('redactParams keeps the routing fields, masks the rest and reduces the ViewState to its length', () => {
  const { diag } = load();
  const out = diag.redactParams({
    'javax.faces.source': 'frmAtendimento:tbvAtendimento:btnSalvar',
    'javax.faces.partial.render': 'frmAtendimento',
    'frmAtendimento:tbvAtendimento:lblOnOf': 'false',
    'frmAtendimento:tbvAtendimento:solicitante': 'Maria da Silva',
    'javax.faces.ViewState': 'abcdef123456'
  });
  assert.equal(out['javax.faces.source'], 'frmAtendimento:tbvAtendimento:btnSalvar');
  assert.equal(out['frmAtendimento:tbvAtendimento:lblOnOf'], 'false');
  assert.equal(out['frmAtendimento:tbvAtendimento:solicitante'], 'aaaaa aa aaaaa');
  assert.deepEqual({ ...out['javax.faces.ViewState'] }, { length: 12 });
});

test('redactResponse keeps message texts, masks everything else and reads the args extension', () => {
  const { diag } = load();
  const xml = '<partial-response><changes>'
    + '<update id="frmAtendimento:msgs"><![CDATA[<span class="ui-messages-error-detail">Informe o problema</span>]]></update>'
    + '<update id="x"><![CDATA[Cliente Fulano 123]]></update>'
    + '<redirect url="/crm-atendimento/123"/>'
    + '<extension ln="primefaces" type="args">{"validationFailed":true}</extension>'
    + '</changes></partial-response>';
  const out = diag.redactResponse(xml);
  assert.equal(out.updates[0].id, 'frmAtendimento:msgs');
  assert.match(out.updates[0].text, /Informe o problema/);
  assert.equal(out.updates[1].text, 'aaaaaaa aaaaaa 999');
  assert.equal(out.redirect, '/crm-atendimento/999');
  assert.deepEqual({ ...out.args }, { validationFailed: true });
});

test('record does nothing while off, and keeps only the latest 40 entries when on', async () => {
  const off = load();
  await off.diag.record({ kind: 'click' });
  assert.equal(off.store.atendeai_retornos_diag_log, undefined);
  const on = load({ atendeai_retornos_diag_on: true });
  for (let i = 0; i < 45; i++) await on.diag.record({ kind: 'click', i });
  const log = on.store.atendeai_retornos_diag_log;
  assert.equal(log.length, 40);
  assert.equal(log[0].i, 5);
  assert.equal(log[39].i, 44);
  assert.ok(log[0].at);
  assert.equal(JSON.parse(await on.diag.export()).length, 40);
  await on.diag.clear();
  assert.deepEqual(on.store.atendeai_retornos_diag_log, []);
});

test('snapshotDom lists fields with label and value shape, never the value, and the buttons', () => {
  const { diag } = load();
  const doc = createDocument();
  const form = el('form', { id: 'frmAtendimento' }, [
    el('label', { for: 'f1', text: 'Solicitante' }),
    el('input', { id: 'f1', name: 'frmAtendimento:solic', type: 'text' }),
    el('input', { id: 'frmAtendimento:tbvAtendimento:lblOnOf:0', name: 'frmAtendimento:tbvAtendimento:lblOnOf', type: 'radio', value: 'false' }),
    el('button', { id: 'btnSalvar', text: 'Salvar' })
  ]);
  form.querySelector('#f1').value = 'Maria da Silva';
  doc.body.appendChild(form);
  const snap = diag.snapshotDom(doc);
  const f1 = snap.fields.find((f) => f.id === 'f1');
  assert.equal(f1.label, 'Solicitante');
  assert.equal(f1.valueShape, 'aaaaa aa aaaaa');
  assert.ok(!JSON.stringify(snap).includes('Maria'));
  assert.deepEqual([...snap.buttons.map((b) => b.id)], ['btnSalvar']);
});

test('redactParams understands the CRM\'s jakarta.faces.* names and keeps the component source', () => {
  const { diag } = load();
  const out = diag.redactParams({ 'jakarta.faces.source': 'frmAtendimento:tbvAtendimento:j_idt92', 'jakarta.faces.ViewState': 'abc', 'frmAtendimento:tbvAtendimento:problema': 'NF-e' });
  assert.equal(out['jakarta.faces.source'], 'frmAtendimento:tbvAtendimento:j_idt92');
  assert.deepEqual({ ...out['jakarta.faces.ViewState'] }, { length: 3 });
  assert.equal(out['frmAtendimento:tbvAtendimento:problema'], 'aa-a');
});
