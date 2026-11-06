const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument, collect, textOf } = require('./mini-dom');

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
  const document = createDocument();
  const opened = [];
  const StorageHelper = {
    get: (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve)),
    set: (data) => new Promise((resolve) => chrome.storage.local.set(data, resolve)),
    remove: async () => {}
  };
  const context = { window: { open: (...args) => opened.push(args) }, document, Date, Math, JSON, console, setTimeout, clearTimeout, chrome, StorageHelper,
    UIBuilder: { gerarIdUnico: () => 'id' }, DOMHelpers: { removeElement() {} } };
  vm.createContext(context);
  ['retornos-schedule', 'retornos-store', 'retornos-list', 'agenda'].forEach((n) =>
    vm.runInContext(fs.readFileSync(`modules/${n}.js`, 'utf8'), context));
  return { A: context.window.AgendaModule, R: context.window.RetornosStore, store, document, opened };
}

const settle = () => new Promise((r) => setTimeout(r, 20));
const buttonsOf = (root) => collect(root).filter((n) => n.tagName === 'button');
const DUE = new Date(2026, 10, 20, 8, 0).getTime();

test('tabs by sector: Suporte gets Retornos and Notas, Suporte switched off only Notas, Pré-atendimento keeps the four old tabs', async () => {
  const labels = async (A) => [...(await A._test.tabsForCurrentUser()).map((t) => t.label)];
  assert.deepEqual(await labels(load().A), ['Retornos', 'Notas']);
  const off = load({ atendeai_user_sector: 'suporte', atendeai_retornos_settings_v1: { enabled: false } });
  assert.deepEqual(await labels(off.A), ['Notas']);
  const pre = load({ atendeai_user_sector: 'preatendimento' });
  assert.deepEqual(await labels(pre.A), ['Calendário', 'CRM', 'Kanban', 'Notas']);
  assert.equal(await pre.A._test.agendaMode(), 'legacy');
  assert.equal(await load().A._test.agendaMode(), 'retornos');
  assert.equal(await off.A._test.agendaMode(), 'notas');
});

test('the Retornos tab lists returns grouped, with Abrir (new tab) and Remover, and explains itself when empty', async () => {
  const { A, R, document, opened } = load();
  const container = document.createElement('div'); document.body.appendChild(container);
  await A._test.iniciarRetornos(container);
  assert.match(textOf(container), /Nenhum retorno marcado\./);
  await R.upsertCrm({ protocolo: '1', atendimentoId: '55', cliente: 'Padaria Pão Quente', problema: 'NF-e', telefones: [], dueAt: DUE }, DUE - 86400000);
  await settle();
  assert.match(textOf(container), /Padaria Pão Quente/);
  buttonsOf(container).find((b) => b.textContent === 'Abrir').click();
  assert.deepEqual(opened[0], ['https://www.sistemaempresarialweb.com.br/crm-atendimento/55', '_blank', 'noopener']);
  buttonsOf(container).find((b) => b.getAttribute('aria-label') === 'Remover retorno').click();
  await settle();
  assert.equal((await R.list()).length, 0);
});

test('"+ Lembrete" adds a manual reminder from just a text and a date/time, marked "anotado à mão" with no Abrir', async () => {
  const { A, R, document } = load();
  const container = document.createElement('div'); document.body.appendChild(container);
  await A._test.iniciarRetornos(container);
  buttonsOf(container).find((b) => b.textContent === '+ Lembrete').click();
  const text = collect(container).find((n) => n.id === 'atendeai-retornos-manual-text');
  const when = collect(container).find((n) => n.id === 'atendeai-retornos-manual-when');
  text.value = 'ligar para o contador';
  when.value = '2026-11-20T08:00';
  buttonsOf(container).find((b) => b.textContent === 'Salvar lembrete').click();
  await settle();
  const [item] = await R.list();
  assert.equal(item.kind, 'manual');
  assert.equal(item.text, 'ligar para o contador');
  assert.equal(item.dueAt, DUE);
  assert.match(textOf(container), /anotado à mão/);
  assert.equal(buttonsOf(container).some((b) => b.textContent === 'Abrir'), false);
});

test('opening the tab migrates the old agenda once: today-onwards events become reminders, older ones go to "Da agenda antiga (N)"', async () => {
  const seed = { atendeai_user_sector: 'suporte', usuarioAgendaEventsV2: {
    novo: { id: 'novo', title: 'Treinamento', date: '2099-01-01', status: 'todo' },
    velho: { id: 'velho', title: 'Retorno antigo', date: '2020-01-01', status: 'todo' }
  } };
  const { A, document, store } = load(seed);
  const container = document.createElement('div'); document.body.appendChild(container);
  await A._test.iniciarRetornos(container);
  await settle();
  const text = textOf(container);
  assert.match(text, /Treinamento/);
  assert.match(text, /Da agenda antiga \(1\)/);
  assert.match(text, /Retorno antigo/);
  assert.equal(Object.keys(store.usuarioAgendaEventsV2).length, 2, 'old data is kept');
});

test('Pré-atendimento never migrates or sees Retornos', async () => {
  const { A, document, R } = load({ atendeai_user_sector: 'preatendimento', usuarioAgendaEventsV2: { a: { id: 'a', title: 'x', date: '2099-01-01', status: 'todo' } } });
  const container = document.createElement('div'); document.body.appendChild(container);
  await A._test.iniciarRetornos(container);
  assert.equal((await R.list()).length, 0);
});
