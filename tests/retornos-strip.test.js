const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { el, createDocument, collect, textOf } = require('./mini-dom');

function load(seed = { atendeai_user_sector: 'suporte' }) {
  const store = seed;
  const listeners = [];
  const chrome = { runtime: {}, storage: {
    local: {
      get(keys, cb) { const out = {}; (Array.isArray(keys) ? keys : [keys]).forEach((k) => { if (k in store) out[k] = JSON.parse(JSON.stringify(store[k])); }); cb(out); },
      set(data, cb) {
        const changes = {}; Object.keys(data).forEach((k) => { changes[k] = { newValue: data[k] }; });
        Object.assign(store, JSON.parse(JSON.stringify(data)));
        listeners.forEach((fn) => fn(changes, 'local')); cb?.();
      }
    },
    onChanged: { addListener: (fn) => listeners.push(fn), removeListener: (fn) => listeners.splice(listeners.indexOf(fn), 1) }
  } };
  const context = { window: {}, Date, Math, JSON, console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, chrome };
  vm.createContext(context);
  ['retornos-schedule', 'retornos-store', 'retornos-list', 'retornos-alert', 'retornos-strip'].forEach((n) =>
    vm.runInContext(fs.readFileSync(`modules/${n}.js`, 'utf8'), context));
  return { P: context.window.RetornosStrip, R: context.window.RetornosStore, store };
}

const HEADERS = ['Agendamento', 'Protocolo', 'Cliente', 'Produto', 'Tp.Atend.', 'Ação'];

function cell(title, value) {
  const td = el('td', { role: 'gridcell' }, [el('span', { class: 'ui-column-title', text: title })]);
  td.textContent = `${title}\n                    ${value}`;
  return td;
}

function tableDoc(protocolos, { headers = HEADERS, paginator = false } = {}) {
  const doc = createDocument();
  const head = el('tr', {}, headers.map((h) => { const th = el('th', {}, [el('span', { class: 'ui-column-title', text: h })]); th.textContent = h; return th; }));
  const rows = protocolos.map((p) => el('tr', { class: 'ui-widget-content' }, [
    cell('Agendamento', 'Sem Agenda'), cell('Protocolo', p), cell('Cliente', 'Alguém'), cell('Produto', 'ERP'), cell('Tp.Atend.', 'Suporte'), cell('Ação', 'Atender')
  ]));
  const wrapper = el('div', { id: 'frmTabela:dtTPos', class: 'ui-datatable pTable' }, [
    el('table', {}, [el('thead', {}, [head]), el('tbody', { id: 'frmTabela:dtTPos_data' }, rows)]),
    ...(paginator ? [el('div', { class: 'ui-paginator' })] : [])
  ]);
  const heading = el('h3', { text: 'CHAMADOS' });
  const form = el('form', { id: 'frmTabela' }, [heading, wrapper]);
  doc.body.appendChild(form);
  return { doc, form, wrapper, heading };
}

const T = new Date(2026, 10, 9, 9, 0).getTime();
const crm = (protocolo, dueAt, extra = {}) => ({ protocolo, atendimentoId: '9' + protocolo, cliente: 'Padaria Pão Quente', solicitante: 'Maria Souza', telefones: [], problema: 'NF-e rejeitada', dueAt, ...extra });
const settle = () => new Promise((r) => setTimeout(r, 15));
const buttonsOf = (root) => collect(root).filter((n) => n.tagName === 'button');

test('readTable recognizes the native CHAMADOS table and reads protocols without the hidden column titles', () => {
  const { P } = load();
  const { doc } = tableDoc(['2611060001', '2611060002']);
  const out = P.readTable(doc);
  assert.equal(out.recognized, true);
  assert.deepEqual([...out.protocolos], ['2611060001', '2611060002']);
});

test('readTable is not sure (so nothing may be removed) with no table, no rows, other headers, or a paginator', () => {
  const { P } = load();
  assert.equal(P.readTable(createDocument()).recognized, false);
  assert.equal(P.readTable(tableDoc([]).doc).recognized, false);
  assert.equal(P.readTable(tableDoc(['1'], { headers: ['A', 'B', 'C'] }).doc).recognized, false);
  assert.equal(P.readTable(tableDoc(['1'], { paginator: true }).doc).recognized, false);
});

test('the strip is a new sibling right above the native table and never changes the table', async () => {
  const { P, R } = load();
  await R.upsertCrm(crm('2611060001', T + 3600000), T);
  const { doc, form, wrapper } = tableDoc(['2611060001']);
  const tableBefore = JSON.stringify(collect(wrapper).map((n) => [n.tagName, n.id, n.className, n.textContent, n.children.length]));
  assert.equal(await P.mount(doc, { now: () => T }), true);
  const strip = doc.getElementById('atendeai-retornos-strip');
  assert.equal(strip.parentElement, form);
  assert.equal(form.children.indexOf(strip) + 1, form.children.indexOf(wrapper));
  assert.equal(JSON.stringify(collect(wrapper).map((n) => [n.tagName, n.id, n.className, n.textContent, n.children.length])), tableBefore);
  const text = textOf(strip);
  assert.match(text, /AtendeAI/);
  assert.match(text, /Meus retornos/);
  assert.match(text, /1 hoje/);
  assert.match(text, /Padaria Pão Quente/);
  assert.equal(await P.mount(doc, {}), false, 'mounts once');
});

test('Abrir goes to crm-atendimento/<id> in a new tab; Remover drops the return; no id means no Abrir', async () => {
  const { P, R } = load();
  await R.upsertCrm(crm('1', T + 3600000), T);
  await R.upsertCrm(crm('2', T + 7200000, { atendimentoId: '' }), T);
  const { doc } = tableDoc(['1', '2']);
  const opened = [];
  await P.mount(doc, { open: (url, target, features) => opened.push([url, target, features]) });
  const strip = doc.getElementById('atendeai-retornos-strip');
  const open = buttonsOf(strip).filter((b) => b.textContent === 'Abrir');
  assert.equal(open.length, 1, 'only the return with an id can be opened');
  open[0].click();
  assert.deepEqual(opened[0], ['https://www.sistemaempresarialweb.com.br/crm-atendimento/91', '_blank', 'noopener']);
  buttonsOf(strip).find((b) => b.getAttribute('aria-label') === 'Remover retorno').click();
  await settle();
  assert.equal((await R.list()).length, 1);
});

test('empty strip explains the feature in the AtendeAI voice', async () => {
  const { P } = load();
  const { doc } = tableDoc(['1']);
  await P.mount(doc, {});
  assert.match(textOf(doc.getElementById('atendeai-retornos-strip')), /Nenhum retorno marcado\. Quando você salvar um atendimento com Agendar, ele aparece aqui com um botão para abrir direto, e eu te aviso na hora\./);
});

test('manual reminders stay out of the strip', async () => {
  const { P, R } = load();
  await R.addManual({ text: 'ligar para o contador', dueAt: T + 3600000 }, T);
  const { doc } = tableDoc(['1']);
  await P.mount(doc, {});
  assert.doesNotMatch(textOf(doc.getElementById('atendeai-retornos-strip')), /contador/);
});

test('sync removes a return whose protocol left the table, and keeps those still there', async () => {
  const { P, R } = load();
  await R.upsertCrm(crm('1', T + 3600000), T - 10000);
  await R.upsertCrm(crm('2', T + 3600000), T - 10000);
  const { doc } = tableDoc(['1']);
  const h = await P.start(doc, { location: { pathname: '/crm-chamado-por-tecnico' } }, { open() {}, now: () => T, auto: false });
  await h.sync();
  assert.deepEqual([...(await R.list()).map((r) => r.key)], ['1']);
});

test('sync removes nothing when the table is not recognized (loading, empty, paginated)', async () => {
  const { P, R } = load();
  await R.upsertCrm(crm('1', T + 3600000), T - 10000);
  for (const doc of [createDocument(), tableDoc([]).doc, tableDoc(['9'], { paginator: true }).doc]) {
    const h = await P.start(doc, { location: { pathname: '/crm-chamado-por-tecnico' } }, { open() {}, now: () => T, auto: false });
    await h.sync();
  }
  assert.equal((await R.list()).length, 1);
});

test('the news notice shows once, with three steps, and never again after "Entendi"', async () => {
  const { P, R } = load();
  const { doc } = tableDoc(['1']);
  const h = await P.start(doc, { location: { pathname: '/crm-chamado-por-tecnico' } }, { open() {}, now: () => T, auto: false });
  await h.showNews();
  const news = doc.getElementById('atendeai-retornos-news');
  assert.ok(news);
  const text = textOf(news);
  assert.match(text, /Seus retornos agora te encontram/);
  assert.match(text, /Agende no CRM como sempre\./);
  assert.match(text, /O AtendeAI guarda e te avisa na hora\./);
  assert.match(text, /Abra direto pela faixa “Meus retornos”\./);
  buttonsOf(news).find((b) => b.textContent === 'Entendi').click();
  await settle();
  assert.equal(doc.getElementById('atendeai-retornos-news'), null);
  assert.equal(await R.getFlag('newsSeen'), true);
  await h.showNews();
  assert.equal(doc.getElementById('atendeai-retornos-news'), null);
});

test('nothing mounts for other sectors or when switched off', async () => {
  const pre = load({ atendeai_user_sector: 'preatendimento' });
  const { doc } = tableDoc(['1']);
  assert.equal(await pre.P.mount(doc, {}), false);
  const h = await pre.P.start(doc, { location: { pathname: '/crm-chamado-por-tecnico' } }, { open() {}, now: () => T, auto: false });
  await h.showNews();
  assert.equal(doc.getElementById('atendeai-retornos-news'), null);
  const off = load({ atendeai_user_sector: 'suporte', atendeai_retornos_settings_v1: { enabled: false } });
  assert.equal(await off.P.mount(tableDoc(['1']).doc, {}), false);
});
