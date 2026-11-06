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

test('the last-save note carries what the CRM answered (messages, scripts), without long numbers', async () => {
  const { C, R } = load();
  C._test.setLeaveWait(10);
  const xml = '<partial-response><changes><update id="frmAtendimento:growl"><![CDATA[x]]></update>'
    + '<eval><![CDATA[PF(\'growl\').renderMessage({"summary":"Fora do expediente","detail":"Agende entre 8h e 17h, protocolo 1790172575959","severity":"error"});]]></eval></changes></partial-response>';
  await drive(realPage(), C, [['send', SALVAR], ['complete', SALVAR, xml]]);
  await new Promise((r) => setTimeout(r, 60));
  const last = await R.getLastSave();
  assert.equal(last.outcome, 'recusado', 'an error toast without leaving the screen is a refusal');
  assert.match(last.detail, /mensagem: Agende entre 8h e 17h, protocolo …/);
  assert.match(last.detail, /script: PF\('growl'\)\.renderMessage/);
  assert.match(last.detail, /atualizou: growl/);
  assert.ok(!last.detail.includes('1790172575959'));
});

// The real answer to a refused Salvar (06/11/2026): validation messages arrive as a Growl script.
const growlRefusal = '<?xml version=\'1.0\' encoding=\'UTF-8\'?><partial-response><changes>'
  + '<update id="frmTop:growl"><![CDATA[<span id="frmTop:growl"></span><script id="frmTop:growl_s">PrimeFaces.cw("Growl","widget_frmTop_growl",{id:"frmTop:growl",sticky:false,life:7000,escape:true,keepAlive:false,msgs:[{summary:"Atenção",detail:"O problema deve ter ao menos 10 caracteres!",severity:\'warn\'},{summary:"Atenção",detail:"A resolução deve ter ao menos 30 caracteres!",severity:\'warn\'},{summary:"Atenção",detail:"O formulário possui campos não preenchidos ou inválidos",severity:\'warn\'}]})</script>]]></update>'
  + '<update id="frmAtendimento:tbvAtendimento:0"><![CDATA[x]]></update><extension ln="primefaces" type="args"></extension></changes></partial-response>';

test('the real refusal (validation toasts, empty args, no redirect) is recognized as a refusal and its messages are shown', async () => {
  const { C, R } = load();
  const page = realPage();
  await C.start(page.doc, { location: { href: 'https://www.sistemaempresarialweb.com.br/crm-atendimento/1250257' } });
  const fire = (signal) => page.doc.listeners.filter((l) => l.type === 'atendeai:crm-ajax').forEach((l) => l.fn({ detail: JSON.stringify(signal) }));
  fire({ phase: 'send', source: SALVAR, status: 0 });
  fire({ phase: 'complete', source: SALVAR, status: 200, args: {}, responseText: growlRefusal });
  await wait();
  assert.equal((await R.list()).length, 0);
  const last = await R.getLastSave();
  assert.equal(last.outcome, 'recusado');
  assert.match(last.detail, /mensagem: O problema deve ter ao menos 10 caracteres! \/ A resolução deve ter ao menos 30 caracteres!/);
});

test('a warning toast does not block a save when the CRM then leaves the screen', async () => {
  const { C, R } = load();
  const page = realPage();
  const withWarnAndRedirect = growlRefusal.replace('</changes>', '<redirect url="/crm-chamado-por-tecnico"/></changes>');
  await drive(page, C, [['send', SALVAR], ['complete', SALVAR, withWarnAndRedirect]]);
  assert.equal((await R.list()).length, 1);
});

// The real answer to an accepted Salvar (06/11/2026): no redirect, a success toast, the form refreshed.
const growlSaved = '<?xml version=\'1.0\' encoding=\'UTF-8\'?><partial-response><changes>'
  + '<update id="frmTop:growl"><![CDATA[<span id="frmTop:growl"></span><script id="frmTop:growl_s">PrimeFaces.cw("Growl","widget_frmTop_growl",{id:"frmTop:growl",sticky:false,life:7000,escape:true,keepAlive:false,msgs:[{summary:"Salvo",detail:"Atendimento salvo com sucesso!",severity:\'info\'}]})</script>]]></update>'
  + '<update id="frmAtendimento"><![CDATA[x]]></update><update id="labelJS"><![CDATA[x]]></update><extension ln="primefaces" type="args"></extension></changes></partial-response>';

test('the real success answer (toast "Atendimento salvo com sucesso!", no redirect) stores the return', async () => {
  const { C, R } = load();
  await drive(realPage(), C, [['send', SALVAR], ['complete', SALVAR, growlSaved]]);
  const [item] = await R.list();
  assert.equal(item.protocolo, '1790172575959');
  assert.equal(item.dueAt, new Date(2026, 10, 9, 15, 15).getTime());
  assert.equal((await R.getLastSave()).outcome, 'guardado');
});

test('the real success answer on Finalizar removes the return', async () => {
  const { C, R } = load();
  await R.upsertCrm({ protocolo: '1790172575959', atendimentoId: '1250257', cliente: 'X', dueAt: new Date(2026, 10, 12, 8, 0).getTime() }, 1);
  await drive(realPage({ mode: 'finalizar' }), C, [['send', SALVAR], ['complete', SALVAR, growlSaved]]);
  assert.equal((await R.list()).length, 0);
});

// PrimeFaces re-renders frmAtendimento after its ajax calls: the whole form (and the line inside it)
// is replaced by fresh markup. `protocolo` changes the attendance the fresh form shows.
function rerender(page, { protocolo } = {}) {
  const fresh = realPage();
  page.form.remove();
  page.doc.body.prepend(fresh.form);
  page.form = fresh.form;
  if (protocolo) page.doc.getElementById('frmAtendimento:tbvAtendimento:j_idt22').value = protocolo;
}

test('an unticked "Me lembrar" stays unticked when the form is re-rendered; another attendance starts ticked', async () => {
  const { L } = load();
  const page = realPage();
  await L.mount(page.doc);
  const box = page.doc.getElementById('atendeai-retornos-remember');
  box.checked = false; box.fire('change');
  rerender(page);
  assert.equal(page.doc.getElementById('atendeai-retornos-line'), null, 'the re-render dropped the line');
  assert.equal(await L.mount(page.doc), true);
  assert.equal(page.doc.getElementById('atendeai-retornos-remember').checked, false);
  assert.equal(page.doc.getElementById('atendeai-retornos-hint').textContent, 'Este agendamento não vira lembrete.');
  rerender(page, { protocolo: '1790172575960' });
  await L.mount(page.doc);
  assert.equal(page.doc.getElementById('atendeai-retornos-remember').checked, true, 'a different attendance starts ticked');
});

test('Salvar sent after a re-render, before the line is back, still honours the unticked "Me lembrar"', async () => {
  const { C, R, L } = load();
  const page = realPage();
  await L.mount(page.doc);
  const box = page.doc.getElementById('atendeai-retornos-remember');
  box.checked = false; box.fire('change');
  rerender(page);
  await drive(page, C, [['send', SALVAR], ['complete', SALVAR, growlSaved]]);
  assert.equal((await R.list()).length, 0, 'an opted-out schedule never becomes a reminder');
  await L.mount(page.doc);
  await drive(page, C, [['send', SALVAR], ['complete', SALVAR, growlSaved]]);
  assert.equal((await R.list()).length, 0, 'nor after the line is back');
});

// The real success answer also re-renders the whole form (`x` in growlSaved). Realistic markup for it:
// the Salvar button's ajax call mentions the confirmation dialog, and a field keeps an error style.
const salvarMarkup = '<button id="frmAtendimento:tbvAtendimento:j_idt92" name="frmAtendimento:tbvAtendimento:j_idt92" class="ui-button ui-widget ui-state-default ui-corner-all ui-button-text-only botaoPrimario" onclick="PrimeFaces.ab({s:&quot;frmAtendimento:tbvAtendimento:j_idt92&quot;,f:&quot;frmAtendimento&quot;,u:&quot;frmAtendimento frmTop:growl&quot;,onco:function(xhr,status,args,data){if(args.agendaProxima){PF(\'dlgConfirmarAgendamento\').show();}}});return false;" type="submit"><span class="ui-button-text ui-c">Salvar</span></button>';
const errorField = '<input id="frmAtendimento:tbvAtendimento:problema" name="frmAtendimento:tbvAtendimento:problema" type="text" value="NFS-e rejeitada" class="ui-inputfield ui-inputtext ui-widget ui-state-default ui-corner-all ui-state-error" aria-invalid="true" />';
const formUpdate = (markup) => `<update id="frmAtendimento"><![CDATA[<form id="frmAtendimento" name="frmAtendimento" method="post" action="/crm-atendimento/1250257">${markup}</form>]]></update>`;

test('the success toast wins over the re-rendered form, even when its markup mentions the dialog and has an error-styled field', async () => {
  const { C, R } = load();
  const xml = growlSaved.replace('<update id="frmAtendimento"><![CDATA[x]]></update>', formUpdate(errorField + salvarMarkup));
  assert.notEqual(xml, growlSaved);
  await drive(realPage(), C, [['send', SALVAR], ['complete', SALVAR, xml]]);
  assert.equal((await R.list()).length, 1);
  assert.equal((await R.getLastSave()).outcome, 'guardado');
});

test('only a script that really shows "Confirmar Agendamento" makes Salvar wait for Continuar, not the form markup', async () => {
  const { C, R } = load();
  const markupOnly = `<partial-response><changes>${formUpdate(salvarMarkup)}</changes></partial-response>`;
  const verdict = C.interpretSave({ phase: 'complete', status: 200, source: SALVAR, responseText: markupOnly }, { doc: realPage().doc, radioMode: 'agendar' });
  assert.notEqual(verdict.outcome, 'pending', 'the dialog named in the re-rendered form is not the dialog being shown');
  const shows = `<partial-response><changes>${formUpdate(errorField + salvarMarkup)}<eval><![CDATA[PF('block').hide();PF('dlgConfirmarAgendamento').show();]]></eval></changes></partial-response>`;
  const page = realPage();
  await drive(page, C, [['send', SALVAR], ['complete', SALVAR, shows]]);
  assert.equal((await R.list()).length, 0, 'the dialog is not a save');
  await drive(page, C, [['send', CONTINUAR], ['complete', CONTINUAR, growlSaved]]);
  assert.equal((await R.list()).length, 1, 'Continuar finishes the save that was waiting');
});

test('args.agendaProxima makes Salvar wait for Continuar: the real button opens the dialog from its own oncomplete', async () => {
  const { C, R } = load();
  const asks = `<partial-response><changes>${formUpdate(salvarMarkup)}<extension ln="primefaces" type="args">{"agendaProxima":true}</extension></changes></partial-response>`;
  const page = realPage();
  await drive(page, C, [['send', SALVAR], ['complete', SALVAR, asks]]);
  assert.equal((await R.list()).length, 0, 'the dialog is not a save');
  await drive(page, C, [['send', CONTINUAR], ['complete', CONTINUAR, growlSaved]]);
  assert.equal((await R.list()).length, 1, 'Continuar finishes the save that was waiting');
});

test('Finalizar removes the return even when its answer re-rendered the form without the Salvar button', async () => {
  const { C, R } = load();
  await R.upsertCrm({ protocolo: '1790172575959', atendimentoId: '1250257', cliente: 'X', dueAt: new Date(2026, 10, 12, 8, 0).getTime() }, 1);
  const page = realPage({ mode: 'finalizar' });
  await C.start(page.doc, { location: { href: 'https://www.sistemaempresarialweb.com.br/crm-atendimento/1250257' } });
  const fire = (signal) => page.doc.listeners.filter((l) => l.type === 'atendeai:crm-ajax').forEach((l) => l.fn({ detail: JSON.stringify(signal) }));
  fire({ phase: 'send', source: SALVAR, status: 0 });
  page.doc.getElementById(SALVAR).remove();
  fire({ phase: 'complete', source: SALVAR, status: 200, responseText: growlSaved });
  await wait();
  assert.equal((await R.list()).length, 0, 'the answer pairs with the Salvar sent, by its source');
  assert.equal((await R.getLastSave()).outcome, 'removido');
});
