// A page shaped like the real /crm-atendimento observed on 06/11/2026 (read-only, nothing saved):
// labels pointing at component wrappers, auto ids (j_idt92) for Salvar, a floating-label date box
// inside a `.linha` row, and the "Confirmar Agendamento" dialog with its own Continuar button.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { el, createDocument, collect } = require('./mini-dom');

function load(store = { atendeai_user_sector: 'suporte' }) {
  const context = { window: {}, Date, Math, JSON, console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    chrome: { runtime: {}, storage: {
      local: {
        get(keys, cb) { const out = {}; (Array.isArray(keys) ? keys : [keys]).forEach((k) => { if (k in store) out[k] = JSON.parse(JSON.stringify(store[k])); }); cb(out); },
        set(data, cb) { Object.assign(store, JSON.parse(JSON.stringify(data))); cb?.(); }
      },
      onChanged: { addListener() {}, removeListener() {} }
    } } };
  vm.createContext(context);
  ['retornos-schedule', 'retornos-store', 'retornos-capture', 'retornos-crm-line'].forEach((n) =>
    vm.runInContext(fs.readFileSync(`modules/${n}.js`, 'utf8'), context));
  return { C: context.window.RetornosCapture, L: context.window.RetornosCrmLine, R: context.window.RetornosStore };
}

const withText = (node, text) => { node.textContent = text; return node; };
const field = (id, value) => { const n = el('input', { id, type: 'text' }); n.value = value; return n; };

function realPage({ mode = 'agendar', date = '09/11/2026 15:15' } = {}) {
  const doc = createDocument();
  const events = [];
  doc.dispatchEvent = (e) => { events.push(e); return true; };
  const radioA = el('input', { id: 'frmAtendimento:tbvAtendimento:lblOnOf:0', type: 'radio', name: 'frmAtendimento:tbvAtendimento:lblOnOf', value: 'false' });
  const radioF = el('input', { id: 'frmAtendimento:tbvAtendimento:lblOnOf:1', type: 'radio', name: 'frmAtendimento:tbvAtendimento:lblOnOf', value: 'true' });
  (mode === 'agendar' ? radioA : radioF).checked = true;
  const dateInput = field('frmAtendimento:tbvAtendimento:dataA_input', date);
  const dataA = el('span', { id: 'frmAtendimento:tbvAtendimento:dataA', class: 'p-datepicker ui-calendar pCalendar' }, [dateInput]);
  const dateBox = el('span', { id: 'frmAtendimento:tbvAtendimento:pngDtAgenda', class: 'pW25 boxInput labelAnimado' }, [
    el('label', { class: 'pLabel', for: 'frmAtendimento:tbvAtendimento:dataA', text: 'Data do agendamento' }), dataA
  ]);
  const radios = el('div', { class: 'boxInput' }, [radioA, el('label', { for: radioA.id, text: 'Agendar' }), radioF, el('label', { for: radioF.id, text: 'Finalizar' })]);
  const row = el('div', { class: 'linha' }, [radios, dateBox]);
  const salvar = withText(el('button', { id: 'frmAtendimento:tbvAtendimento:j_idt92', class: 'ui-button botaoPrimario', type: 'submit' }), 'Salvar');
  const form = el('form', { id: 'frmAtendimento' }, [
    el('label', { text: 'Protocolo' }), field('frmAtendimento:tbvAtendimento:j_idt22', '1790172575959'),
    el('label', { text: 'Cliente' }), field('frmAtendimento:tbvAtendimento:j_idt27', 'PADARIA PAO QUENTE LTDA'),
    el('label', { for: 'frmAtendimento:tbvAtendimento:solicitanteChamado', text: 'Solicitante' }), field('frmAtendimento:tbvAtendimento:solicitanteChamado', 'Maria Souza'),
    el('label', { for: 'frmAtendimento:tbvAtendimento:contatofone', text: 'Telefone do Solicitante' }), field('frmAtendimento:tbvAtendimento:contatofone', '(11) 98888-7777'),
    el('label', { for: 'frmAtendimento:tbvAtendimento:contatocliente', text: 'Telefone do Cliente' }), field('frmAtendimento:tbvAtendimento:contatocliente', '(11) 3333-4444'),
    el('label', { for: 'frmAtendimento:tbvAtendimento:problema', text: 'Problema' }), field('frmAtendimento:tbvAtendimento:problema', 'NFS-e rejeitada'),
    row, salvar
  ]);
  const confirm = el('form', { id: 'frmConfirmarAgendamento' }, [
    withText(el('button', { id: 'frmConfirmarAgendamento:j_idt309', type: 'submit' }), 'Cancelar'),
    withText(el('button', { id: 'frmConfirmarAgendamento:j_idt310', type: 'submit' }), 'Continuar')
  ]);
  doc.body.appendChild(form);
  doc.body.appendChild(confirm);
  return { doc, events, row, form, dateInput, radioA, radioF };
}

const SALVAR = 'frmAtendimento:tbvAtendimento:j_idt92';
const CONTINUAR = 'frmConfirmarAgendamento:j_idt310';
const CANCELAR = 'frmConfirmarAgendamento:j_idt309';
const redirectXml = '<partial-response><changes><redirect url="/crm-chamado-por-tecnico"/></changes></partial-response>';
const confirmXml = '<partial-response><changes><eval><![CDATA[PF(\'block\').hide();PF(\'dlgConfirmarAgendamento\').show();]]></eval></changes></partial-response>';
const noRedirectXml = '<partial-response><changes><update id="frmAtendimento"><![CDATA[x]]></update></changes></partial-response>';
const wait = () => new Promise((r) => setTimeout(r, 25));

async function drive(page, C, steps, win = { location: { href: 'https://www.sistemaempresarialweb.com.br/crm-atendimento/1250257' } }) {
  await C.start(page.doc, win);
  const fire = (signal) => page.doc.listeners.filter((l) => l.type === 'atendeai:crm-ajax').forEach((l) => l.fn({ detail: JSON.stringify(signal) }));
  for (const [phase, source, xml] of steps) fire({ phase, source, status: phase === 'send' ? 0 : 200, responseText: phase === 'complete' ? xml : '' });
  await wait();
}

test('findDateInput resolves the label that points at the calendar span to the real dataA_input', () => {
  const { C } = load();
  const { doc, dateInput } = realPage();
  assert.equal(C.findDateInput(doc), dateInput);
});

test('readPage reads the observed fields: protocol, client, requester, both phones, problem and the date text', () => {
  const { C } = load();
  const { doc } = realPage();
  const page = C.readPage(doc, 'https://www.sistemaempresarialweb.com.br/crm-atendimento/1250257');
  assert.equal(page.protocolo, '1790172575959');
  assert.equal(page.atendimentoId, '1250257');
  assert.equal(page.cliente, 'PADARIA PAO QUENTE LTDA');
  assert.equal(page.solicitante, 'Maria Souza');
  assert.deepEqual([...page.telefones], ['(11) 98888-7777', '(11) 3333-4444']);
  assert.equal(page.problema, 'NFS-e rejeitada');
  assert.equal(page.dateText, '09/11/2026 15:15');
  assert.equal(page.mode, 'agendar');
});

test('the line goes after the whole .linha row (full width), not inside the narrow floating-label date box', async () => {
  const { L } = load();
  const { doc, row, form } = realPage();
  assert.equal(await L.mount(doc), true);
  const line = doc.getElementById('atendeai-retornos-line');
  assert.equal(line.parentElement, form);
  assert.equal(form.children.indexOf(line), form.children.indexOf(row) + 1);
  const box = doc.getElementById('frmAtendimento:tbvAtendimento:pngDtAgenda');
  assert.equal(collect(box).includes(line), false);
});

test('shortcuts send the real input id so the bridge writes to dataA_input, not to the span', async () => {
  const { L } = load();
  const { doc, events } = realPage();
  await L.mount(doc);
  collect(doc.getElementById('atendeai-retornos-line')).find((b) => b.tagName === 'button').click();
  const sent = JSON.parse(events.find((e) => e.type === 'atendeai:crm-set-date').detail);
  assert.equal(sent.id, 'frmAtendimento:tbvAtendimento:dataA_input');
  assert.match(sent.value, /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
});

test('Salvar with Agendar, accepted (the CRM leaves the screen): the return is stored with the native date', async () => {
  const { C, R } = load();
  const page = realPage();
  await drive(page, C, [['send', SALVAR], ['complete', SALVAR, redirectXml]]);
  const [item] = await R.list();
  assert.equal(item.protocolo, '1790172575959');
  assert.equal(item.atendimentoId, '1250257');
  assert.equal(item.dueAt, new Date(2026, 10, 9, 15, 15).getTime());
  assert.equal(item.cliente, 'PADARIA PAO QUENTE LTDA');
});

test('Salvar that opens "Confirmar Agendamento" stores nothing until Continuar; Continuar finishes the save', async () => {
  const { C, R } = load();
  const page = realPage();
  await drive(page, C, [['send', SALVAR], ['complete', SALVAR, confirmXml]]);
  assert.equal((await R.list()).length, 0, 'the dialog is not a save');
  await drive(page, C, [['send', CONTINUAR], ['complete', CONTINUAR, redirectXml]]);
  assert.equal((await R.list()).length, 1);
});

test('Cancelar in the confirmation dialog leaves nothing stored, and a later Continuar does not resurrect it', async () => {
  const { C, R } = load();
  const page = realPage();
  await drive(page, C, [['send', SALVAR], ['complete', SALVAR, confirmXml], ['send', CANCELAR], ['complete', CANCELAR, noRedirectXml]]);
  assert.equal((await R.list()).length, 0);
  await drive(page, C, [['send', CONTINUAR], ['complete', CONTINUAR, redirectXml]]);
  assert.equal((await R.list()).length, 0, 'Continuar without a pending Salvar is ignored');
});

test('a Salvar answer that is not clearly a save (no redirect) or has a validation error changes nothing', async () => {
  const { C, R } = load();
  await R.upsertCrm({ protocolo: '1790172575959', atendimentoId: '1250257', cliente: 'X', dueAt: new Date(2026, 10, 12, 8, 0).getTime() }, 1);
  const page = realPage({ mode: 'finalizar' });
  await drive(page, C, [['send', SALVAR], ['complete', SALVAR, noRedirectXml]]);
  assert.equal((await R.list()).length, 1, 'Finalizar without proof of saving does not remove');
  const bad = '<partial-response><changes><extension ln="primefaces" type="args">{"validationFailed":true}</extension></changes></partial-response>';
  await drive(realPage({ mode: 'finalizar' }), C, [['send', SALVAR], ['complete', SALVAR, bad]]);
  assert.equal((await R.list()).length, 1);
});

test('Finalizar accepted removes the return; other buttons in the form are ignored', async () => {
  const { C, R } = load();
  await R.upsertCrm({ protocolo: '1790172575959', atendimentoId: '1250257', cliente: 'X', dueAt: new Date(2026, 10, 12, 8, 0).getTime() }, 1);
  const page = realPage({ mode: 'finalizar' });
  await drive(page, C, [['send', 'frmAtendimento:tbvAtendimento:outroBotao'], ['complete', 'frmAtendimento:tbvAtendimento:outroBotao', redirectXml]]);
  assert.equal((await R.list()).length, 1);
  await drive(page, C, [['send', SALVAR], ['complete', SALVAR, redirectXml]]);
  assert.equal((await R.list()).length, 0);
});

test('Agendar with the "Me lembrar" box unchecked removes an existing return and creates none', async () => {
  const { C, R, L } = load();
  await R.upsertCrm({ protocolo: '1790172575959', atendimentoId: '1250257', cliente: 'X', dueAt: new Date(2026, 10, 12, 8, 0).getTime() }, 1);
  const page = realPage();
  await L.mount(page.doc);
  const box = page.doc.getElementById('atendeai-retornos-remember');
  box.checked = false;
  await drive(page, C, [['send', SALVAR], ['complete', SALVAR, redirectXml]]);
  assert.equal((await R.list()).length, 0);
});

test('the parsed args that pfAjaxComplete provides decide a refusal even when the XML shows nothing', async () => {
  const { C, R } = load();
  const page = realPage();
  await C.start(page.doc, { location: { href: 'https://www.sistemaempresarialweb.com.br/crm-atendimento/1250257' } });
  const fire = (signal) => page.doc.listeners.filter((l) => l.type === 'atendeai:crm-ajax').forEach((l) => l.fn({ detail: JSON.stringify(signal) }));
  fire({ phase: 'send', source: SALVAR, status: 0 });
  fire({ phase: 'complete', source: SALVAR, status: 200, responseText: redirectXml, args: { validationFailed: true } });
  await wait();
  assert.equal((await R.list()).length, 0);
});

test('the signal is also read from the mirrored attribute when the event detail is lost between worlds', async () => {
  const { C, R } = load();
  const page = realPage();
  const attrs = {};
  page.doc.documentElement = { getAttribute: (k) => attrs[k] ?? null, setAttribute: (k, v) => { attrs[k] = v; } };
  await C.start(page.doc, { location: { href: 'https://www.sistemaempresarialweb.com.br/crm-atendimento/1250257' } });
  const fire = (signal) => { attrs['data-atendeai-crm-ajax'] = JSON.stringify(signal); page.doc.listeners.filter((l) => l.type === 'atendeai:crm-ajax').forEach((l) => l.fn({ detail: null })); };
  fire({ phase: 'send', source: SALVAR, status: 0 });
  fire({ phase: 'complete', source: SALVAR, status: 200, responseText: redirectXml });
  await wait();
  assert.equal((await R.list()).length, 1);
});

test('an answer without proof of leaving is confirmed when the page unloads right after, and not otherwise', async () => {
  const { C, R } = load();
  const page = realPage();
  const unload = [];
  const win = { location: { href: 'https://www.sistemaempresarialweb.com.br/crm-atendimento/1250257' },
    addEventListener: (t, fn) => unload.push([t, fn]), removeEventListener() {} };
  await drive(page, C, [['send', SALVAR], ['complete', SALVAR, noRedirectXml]], win);
  assert.equal((await R.list()).length, 0, 'not yet: nothing proves it saved');
  unload.find(([t]) => t === 'beforeunload')[1]();
  await wait();
  assert.equal((await R.list()).length, 1, 'the CRM left the screen, so it did save');
});

test('every save the browser sees leaves a plain-language last-save note, with no personal data', async () => {
  const { C, R } = load();
  await drive(realPage(), C, [['send', SALVAR], ['complete', SALVAR, redirectXml]]);
  let last = await R.getLastSave();
  assert.equal(last.outcome, 'guardado');
  assert.equal(last.mode, 'agendar');
  assert.ok(!JSON.stringify(last).includes('PADARIA'));
  const bad = '<partial-response><changes><extension ln="primefaces" type="args">{"validationFailed":true}</extension></changes></partial-response>';
  await drive(realPage(), C, [['send', SALVAR], ['complete', SALVAR, bad]]);
  last = await R.getLastSave();
  assert.equal(last.outcome, 'recusado');
  await drive(realPage({ mode: 'finalizar' }), C, [['send', SALVAR], ['complete', SALVAR, redirectXml]]);
  assert.equal((await R.getLastSave()).outcome, 'removido');
});

test('when a save is not confirmed, the last-save note carries what the CRM answered (messages, scripts), without long numbers', async () => {
  const { C, R } = load();
  C._test.setLeaveWait(10);
  const xml = '<partial-response><changes><update id="frmAtendimento:growl"><![CDATA[x]]></update>'
    + '<eval><![CDATA[PF(\'growl\').renderMessage({"summary":"Fora do expediente","detail":"Agende entre 8h e 17h, protocolo 1790172575959","severity":"error"});]]></eval></changes></partial-response>';
  await drive(realPage(), C, [['send', SALVAR], ['complete', SALVAR, xml]]);
  await new Promise((r) => setTimeout(r, 60));
  const last = await R.getLastSave();
  assert.equal(last.outcome, 'sem-confirmacao');
  assert.match(last.detail, /mensagem: Fora do expediente \/ Agende entre 8h e 17h, protocolo …/);
  assert.match(last.detail, /script: PF\('growl'\)\.renderMessage/);
  assert.match(last.detail, /atualizou: growl/);
  assert.ok(!last.detail.includes('1790172575959'));
});
