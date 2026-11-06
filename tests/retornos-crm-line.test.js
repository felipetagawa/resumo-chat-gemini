const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { el, createDocument, collect, textOf } = require('./mini-dom');

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
  ['retornos-schedule', 'retornos-store', 'retornos-capture', 'retornos-crm-line'].forEach((name) =>
    vm.runInContext(fs.readFileSync(`modules/${name}.js`, 'utf8'), context));
  return { L: context.window.RetornosCrmLine, S: context.window.RetornosSchedule, store };
}

function pageDoc({ mode = 'agendar' } = {}) {
  const doc = createDocument();
  const events = [];
  doc.dispatchEvent = (e) => { events.push(e); return true; };
  const radioA = el('input', { id: 'frmAtendimento:tbvAtendimento:lblOnOf:0', type: 'radio', name: 'frmAtendimento:tbvAtendimento:lblOnOf', value: 'false' });
  const radioF = el('input', { id: 'frmAtendimento:tbvAtendimento:lblOnOf:1', type: 'radio', name: 'frmAtendimento:tbvAtendimento:lblOnOf', value: 'true' });
  (mode === 'agendar' ? radioA : radioF).checked = true;
  const dateInput = el('input', { id: 'frmAtendimento:tbvAtendimento:agendamento_input', type: 'text' });
  const calendar = el('span', { class: 'ui-calendar' }, [dateInput]);
  const row = el('div', { class: 'ui-g-12' }, [el('label', { text: 'Data do agendamento' }), calendar, el('div', { id: 'after', text: 'abaixo' })]);
  const form = el('form', { id: 'frmAtendimento' }, [
    el('div', {}, [radioA, el('label', { for: radioA.id, text: 'Agendar' }), radioF, el('label', { for: radioF.id, text: 'Finalizar' })]),
    row
  ]);
  doc.body.appendChild(form);
  return { doc, events, radioA, radioF, row, calendar, dateInput };
}

const byId = (doc, id) => doc.getElementById(id);
const buttons = (line) => collect(line).filter((n) => n.tagName === 'button');

test('the AtendeAI line sits right below the native date field, is branded, and is a sibling (nothing native is touched)', async () => {
  const { L } = load();
  const { doc, row, calendar } = pageDoc();
  const before = row.children.length;
  assert.equal(await L.mount(doc), true);
  const line = byId(doc, 'atendeai-retornos-line');
  assert.ok(line);
  assert.equal(line.parentElement, row);
  assert.equal(row.children.indexOf(line), row.children.indexOf(calendar) + 1);
  assert.equal(row.children.length, before + 1);
  assert.match(textOf(line), /AtendeAI/);
  assert.equal(calendar.children.length, 1, 'the native calendar keeps only its own input');
});

test('it appears only while Agendar is selected', async () => {
  const { L } = load();
  const { doc, radioA, radioF } = pageDoc({ mode: 'finalizar' });
  await L.mount(doc);
  const line = byId(doc, 'atendeai-retornos-line');
  assert.equal(line.hidden, true);
  radioF.checked = false; radioA.checked = true;
  L.sync(doc);
  assert.equal(line.hidden, false);
});

test('shortcuts follow the settings and a click writes the CRM format to the native field through the bridge event', async () => {
  const { L, S } = load();
  const { doc, events } = pageDoc();
  await L.mount(doc);
  const line = byId(doc, 'atendeai-retornos-line');
  const labels = buttons(line).filter((b) => b.className.includes('atendeai-retornos-shortcut')).map((b) => b.textContent);
  const now = new Date();
  const expected = [...S.defaultShortcuts().map((s) => S.shortcutLabel(s, now))];
  assert.deepEqual([...labels], expected);
  const first = buttons(line).find((b) => b.className.includes('atendeai-retornos-shortcut'));
  first.click();
  const event = events.find((e) => e.type === 'atendeai:crm-set-date');
  assert.ok(event);
  assert.equal(event.detail, S.toCrmValue(S.resolveShortcut(S.defaultShortcuts()[0], now)));
});

test('free date and time fill the native field once both are chosen', async () => {
  const { L } = load();
  const { doc, events } = pageDoc();
  await L.mount(doc);
  const date = byId(doc, 'atendeai-retornos-date');
  const time = byId(doc, 'atendeai-retornos-time');
  date.value = '2026-11-09';
  date.fire('change');
  assert.equal(events.filter((e) => e.type === 'atendeai:crm-set-date').length, 0, 'waits for the time');
  time.value = '10:30';
  time.fire('change');
  assert.equal(events.at(-1).detail, '09/11/2026 10:30');
});

test('the "Me lembrar" box starts checked and its sentence follows it', async () => {
  const { L } = load();
  const { doc } = pageDoc();
  await L.mount(doc);
  const box = byId(doc, 'atendeai-retornos-remember');
  const hint = byId(doc, 'atendeai-retornos-hint');
  assert.equal(box.checked, true);
  assert.equal(hint.textContent, 'Ao salvar, eu guardo este retorno e te aviso na hora.');
  box.checked = false;
  box.fire('change');
  assert.equal(hint.textContent, 'Este agendamento não vira lembrete.');
  box.checked = true;
  box.fire('change');
  assert.equal(hint.textContent, 'Ao salvar, eu guardo este retorno e te aviso na hora.');
});

test('Enter inside the AtendeAI fields never submits the CRM form, and the controls have no form names', async () => {
  const { L } = load();
  const { doc } = pageDoc();
  await L.mount(doc);
  const date = byId(doc, 'atendeai-retornos-date');
  let prevented = 0;
  date.fire('keydown', { key: 'Enter', preventDefault() { prevented++; } });
  assert.equal(prevented, 1);
  const named = collect(byId(doc, 'atendeai-retornos-line')).filter((n) => n.getAttribute('name'));
  assert.equal(named.length, 0, 'unnamed controls are never posted with the CRM form');
  assert.ok(buttons(byId(doc, 'atendeai-retornos-line')).every((b) => b.getAttribute('type') === 'button'));
});

test('mounts once, and not for other sectors, when switched off, or without the native date field', async () => {
  const { L } = load();
  const { doc } = pageDoc();
  assert.equal(await L.mount(doc), true);
  assert.equal(await L.mount(doc), false);
  assert.equal(doc.querySelectorAll('div').filter((n) => n.id === 'atendeai-retornos-line').length, 1);
  const pre = load({ atendeai_user_sector: 'preatendimento' });
  assert.equal(await pre.L.mount(pageDoc().doc), false);
  const off = load({ atendeai_user_sector: 'suporte', atendeai_retornos_settings_v1: { enabled: false } });
  assert.equal(await off.L.mount(pageDoc().doc), false);
  const empty = createDocument();
  assert.equal(await load().L.mount(empty), false);
});
