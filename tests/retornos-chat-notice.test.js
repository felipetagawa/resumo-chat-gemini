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
      set(data, cb) { Object.assign(store, JSON.parse(JSON.stringify(data))); listeners.forEach((fn) => fn({}, 'local')); cb?.(); }
    },
    onChanged: { addListener: (fn) => listeners.push(fn), removeListener() {} }
  } };
  const document = createDocument();
  const originalCreate = document.createElement.bind(document);
  // Elements built from innerHTML are not parsed by mini-dom: give the old toast code harmless handles.
  document.createElement = (tag) => { const n = originalCreate(tag); const real = n.querySelector.bind(n); n.querySelector = (sel) => real(sel) || { addEventListener() {}, remove() {} }; return n; };
  const removed = [];
  const opened = [];
  const StorageHelper = { get: (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve)), set: async () => {} };
  const context = { window: { open: (...a) => opened.push(a) }, document, Date, Math, JSON, console, setTimeout, clearTimeout, chrome, StorageHelper,
    DOMHelpers: { removeElement: (id) => removed.push(id) }, UIBuilder: { compararDatas: () => true, formatarDataEvento: (d) => d },
    AgendaModule: { exibirAgenda() {} } };
  vm.createContext(context);
  ['retornos-schedule', 'retornos-store', 'retornos-list', 'retornos-alert', 'retornos-chat-notice', 'notifications'].forEach((n) =>
    vm.runInContext(fs.readFileSync(`modules/${n}.js`, 'utf8'), context));
  return { N: context.window.RetornosChatNotice, Notifications: context.window.NotificationsModule, R: context.window.RetornosStore, document, removed, opened, store };
}

const DUE = new Date(2026, 10, 9, 8, 0).getTime();
const NOW = new Date(2026, 10, 9, 7, 0).getTime();
const crm = (protocolo, extra = {}) => ({ protocolo, atendimentoId: '9' + protocolo, cliente: 'Padaria Pão Quente', solicitante: 'Maria Souza', telefones: ['(11) 98888-7777'], problema: 'NF-e', dueAt: DUE, ...extra });
const buttonsOf = (root) => collect(root).filter((n) => n.tagName === 'button');
const settle = () => new Promise((r) => setTimeout(r, 20));

test('opening a chat with a matching return shows the AtendeAI notice with Abrir no CRM and ×', async () => {
  const { N, R, document, opened } = load();
  await R.upsertCrm(crm('1'), NOW);
  await N.check({ name: 'Maria Souza' }, { now: () => NOW });
  const notice = document.getElementById('atendeai-retornos-chat-notice');
  assert.ok(notice);
  const text = textOf(notice);
  assert.match(text, /AtendeAI/);
  assert.match(text, /Você tem retorno marcado com este cliente \(hoje 08:00\)/);
  buttonsOf(notice).find((b) => b.textContent === 'Abrir no CRM').click();
  assert.deepEqual(opened[0], ['https://www.sistemaempresarialweb.com.br/crm-atendimento/91', '_blank', 'noopener']);
  buttonsOf(notice).find((b) => b.getAttribute('aria-label') === 'Fechar').click();
  assert.equal(document.getElementById('atendeai-retornos-chat-notice'), null);
});

test('it matches by phone first, and says nothing when the match is not reliable', async () => {
  const { N, R, document } = load();
  await R.upsertCrm(crm('1'), NOW);
  await N.check({ name: 'zzz', phone: '5511988887777' }, { now: () => NOW });
  assert.ok(document.getElementById('atendeai-retornos-chat-notice'));
  await N.check({ name: 'Maria' }, { now: () => NOW });
  assert.equal(document.getElementById('atendeai-retornos-chat-notice'), null, 'a stale notice leaves when the chat changes to a non-match');
  await R.upsertCrm(crm('2', { cliente: 'Outra Loja' }), NOW);
  await N.check({ name: 'Maria Souza' }, { now: () => NOW });
  assert.equal(document.getElementById('atendeai-retornos-chat-notice'), null, 'two returns for the same name is doubt');
});

test('no Abrir no CRM without an id, and manual reminders never match a chat', async () => {
  const { N, R, document } = load();
  await R.upsertCrm(crm('1', { atendimentoId: '' }), NOW);
  await R.addManual({ text: 'Maria Souza ligar', dueAt: DUE }, NOW);
  await N.check({ name: 'Maria Souza' }, { now: () => NOW });
  const notice = document.getElementById('atendeai-retornos-chat-notice');
  assert.ok(notice);
  assert.equal(buttonsOf(notice).some((b) => b.textContent === 'Abrir no CRM'), false);
});

test('nothing shows for other sectors or when the feature is off', async () => {
  const pre = load({ atendeai_user_sector: 'preatendimento' });
  await pre.R.upsertCrm(crm('1'), NOW);
  await pre.N.check({ name: 'Maria Souza' }, { now: () => NOW });
  assert.equal(pre.document.getElementById('atendeai-retornos-chat-notice'), null);
  const off = load({ atendeai_user_sector: 'suporte', atendeai_retornos_settings_v1: { enabled: false } });
  await off.R.upsertCrm(crm('1'), NOW);
  await off.N.check({ name: 'Maria Souza' }, { now: () => NOW });
  assert.equal(off.document.getElementById('atendeai-retornos-chat-notice'), null);
});

function withActiveChat(document, name) {
  const list = el('div', { class: 'chats-list' }, [el('div', { class: 'chat active' }, [el('span', { class: 'chat-name', text: name })])]);
  document.body.appendChild(list);
}

test('NotificationsModule: Suporte uses the retorno notice and never the old agenda toast; Pré-atendimento keeps the old behavior', async () => {
  const sup = load({ atendeai_user_sector: 'suporte', usuarioAgendaEventsV2: { a: { id: 'a', title: 'x', client: 'Maria Souza', date: '2026-11-09' } } });
  await sup.R.upsertCrm(crm('1'), Date.now());
  withActiveChat(sup.document, 'Maria Souza');
  sup.Notifications.verificarNotificacoesChat();
  await settle();
  assert.equal(sup.removed.includes('gemini-notification-toast'), false, 'old toast path never runs for Suporte');

  const pre = load({ atendeai_user_sector: 'preatendimento', usuarioAgendaEventsV2: { a: { id: 'a', title: 'Evento', client: 'Maria Souza', date: '2026-11-09' } } });
  withActiveChat(pre.document, 'Maria Souza');
  pre.Notifications.verificarNotificacoesChat();
  await settle();
  assert.equal(pre.removed.includes('gemini-notification-toast'), true, 'the old toast path still runs for Pré-atendimento');
});

test('NotificationsModule: the old overdue-events toast is skipped for Suporte and kept for Pré-atendimento', async () => {
  const seed = (sector) => ({ atendeai_user_sector: sector, usuarioAgendaEventsV2: { a: { id: 'a', title: 'Evento', date: '2020-01-01', status: 'todo' } } });
  const sup = load(seed('suporte'));
  await sup.Notifications.verificarEventosVencidos();
  assert.equal(sup.removed.includes('gemini-overdue-toast'), false);
  const pre = load(seed('preatendimento'));
  await pre.Notifications.verificarEventosVencidos();
  assert.equal(pre.removed.includes('gemini-overdue-toast'), true);
});
