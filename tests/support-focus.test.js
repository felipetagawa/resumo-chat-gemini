const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { el, createDocument, collect, textOf } = require('./mini-dom');
const KEY = 'atendeai_support_focus_v1';
const BADGES_KEY = 'atendeai_support_focus_badges_enabled';
function harness(store = {}, locks) {
  const document = createDocument(), observers = [], timers = new Map(), changeListeners = []; let seq = 0, clock = 100000000;
  const context = { document, window: {}, console, navigator: { locks }, Date: class extends Date { static now() { return clock; } },
    setTimeout(fn) { timers.set(++seq, fn); return seq; }, clearTimeout(id) { timers.delete(id); },
    MutationObserver: class { constructor(fn) { this.fn=fn; observers.push(this); } observe() {} disconnect() {} },
    StorageHelper: { async get() { return structuredClone(store); }, async set(data) { Object.assign(store, structuredClone(data)); } },
    MessagingHelper: { send() { assert.fail('Focus must never call messaging'); } },
    chrome: { runtime: {}, storage: { local: {
      get(keys, callback) { callback(structuredClone(store)); },
      set(data, callback) { Object.assign(store, structuredClone(data)); callback(); }
    }, onChanged: { addListener(fn) { changeListeners.push(fn); } } } } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('modules/recovery-buffer.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('modules/support-focus.js', 'utf8'), context);
  const dock = el('div', { id: 'containerBotoesGemini' }); document.body.appendChild(dock);
  function card(name, time, active = false, id = '') {
    const c = el('div', { class: 'sz_contact' + (active ? ' active' : ''), 'data-chat-id': id }, [
      el('div', { class: 'contact-layout' }, [el('div', { class: 'content' }, [el('div', { class: 'name_in_hours' }, [
        el('div', { class: 'name' }, [el('span', { class: 'contact-name', text: name })])])])]),
      el('img', { alt: 'platform', src: '/assets/img/platform/mini/webchat.svg' }),
      el('div', { class: 'contact-times', phase: 'attendance' }, [el('span', { class: 'times', title: time })])]);
    document.body.appendChild(c); return c;
  }
  const lucia=card('Lucia', '06/10/26 08:14', true), cassia=card('Cássia', '06/10/26 08:15');
  const button = label => collect(dock).find(n => n.tagName === 'button' && n.textContent === label);
  async function click(label) { await Promise.all(button(label).click()); }
  async function flush(records = [{ target: document.body }]) {
    observers.forEach(o => o.fn(records));
    const pending=[...timers.values()]; timers.clear(); for(const fn of pending) await fn();
  }
  async function mount() { await context.window.SupportFocusModule.mount(dock); }
  async function save() { await click('Alterar'); await click('◐ Verificando'); dock.querySelector('.atendeai-focus-input').value='Conferir emissão'; await click('Salvar'); }
  function addMessage({ name = 'Lucia', text = 'preciso de ajuda', sent = false, auto = false } = {}) {
    const msg = el('div', { class: sent ? 'msg sent' : 'msg' }, [
      el('div', { class: 'name', text: auto ? 'Automático' : name }),
      el('div', { class: 'message' }, [el('span', { text })])
    ]);
    document.body.appendChild(msg);
    return msg;
  }
  async function setStorage(data) {
    const changes = {};
    for (const [key, value] of Object.entries(data)) changes[key] = { oldValue: store[key], newValue: value };
    Object.assign(store, structuredClone(data));
    changeListeners.forEach(fn => fn(changes, 'local'));
    await flush([]);
  }
  return { document, dock, lucia, cassia, card, store, context, button, click, flush, mount, save, addMessage, setStorage, changeListeners, tick(ms=1000) { clock+=ms; }, advance() { clock+=86400001; } };
}
test('F1/F2/F8/F9/F11/F12: local save, restore, accessible badge and idempotent rerender', async () => {
  const h=harness(); await h.mount(); await h.save();
  const id=h.context.window.RecoveryBufferModule.getConversationIdentityFromCard(h.lucia).sourceId;
  assert.equal(h.store[KEY].items[id].status, 'CHECKING'); assert.equal(h.store[KEY].items[id].nextStep, 'Conferir emissão');
  await h.mount(); assert.match(textOf(h.dock), /Verificando/); assert.match(textOf(h.dock), /Conferir emissão/);
  for(let i=0;i<3;i++) await h.flush();
  assert.equal(h.lucia.querySelectorAll('.atendeai-focus-badge').length, 1);
  const badge=h.lucia.querySelector('.atendeai-focus-badge'); assert.equal(badge.textContent,'◐');
  assert.equal(badge.getAttribute('title'), 'Verificando — Conferir emissão'); assert.equal(badge.getAttribute('aria-label'),badge.getAttribute('title'));
  h.lucia.remove(); const replacement=h.card('Lucia','06/10/26 08:14',true); await h.flush();
  assert.equal(replacement.querySelectorAll('.atendeai-focus-badge').length,1);
});
test('F3/F5: same name with new attendance and Lucia to Cássia never share state', async () => {
  const h=harness(); await h.mount(); await h.save(); h.lucia.className='sz_contact'; h.cassia.className='sz_contact active'; await h.flush();
  assert.match(textOf(h.dock),/Cássia/); assert.match(textOf(h.dock),/Sem estado definido/); assert.doesNotMatch(textOf(h.dock),/Conferir emissão/);
  h.cassia.className='sz_contact'; h.card('Lucia','06/10/26 09:00',true); await h.flush(); assert.match(textOf(h.dock),/Sem estado definido/);
});
test('F4: unsafe identity never offers editing or persists by name', async () => {
  const h=harness(); h.lucia.querySelector('.times').setAttribute('title',''); await h.mount(); assert.equal(h.button('Alterar'),undefined); assert.equal(Object.keys(h.store[KEY]?.items || {}).length,0);
});
test('F6/F10: clear removes item and badge', async () => {
  const h=harness(); await h.mount(); await h.save(); await h.click('Alterar'); await h.click('Limpar');
  assert.equal(Object.keys(h.store[KEY].items).length,0); assert.equal(h.lucia.querySelector('.atendeai-focus-badge'),null); assert.match(textOf(h.dock),/Sem estado definido/);
});
test('F7: reading and writing clean expired items', async () => {
  const h=harness(); await h.mount(); await h.save(); h.advance(); await h.flush();
  assert.equal(Object.keys(h.store[KEY].items).length,0); assert.equal(h.lucia.querySelector('.atendeai-focus-badge'),null);
});
test('own focus mutation is ignored and unsafe mount is skipped', async () => {
  const h=harness(); await h.mount(); await h.save();
  h.lucia.querySelector('.times').setAttribute('title','06/10/26 09:00');
  await h.flush([{target:h.lucia.querySelector('.atendeai-focus-badge')}]); assert.match(textOf(h.dock),/Verificando/);
  await h.flush(); assert.match(textOf(h.dock),/Sem estado definido/);
  const other=h.card('Lucia','06/10/26 08:14'); other.querySelector('.contact-name').remove(); await h.flush(); assert.equal(other.querySelector('.atendeai-focus-badge'),null);
});

test('F13/F14: saved Focus stays out of actual report and direct Smart Reply requests', async () => {
  const h = harness(); await h.mount(); await h.save();
  const sent = [];
  Object.assign(h.context, {
    DOMHelpers: { exists: () => false, createElement: tag => el(tag, { id: 'containerBotoesGemini' }) },
    getIconHTML: () => '', guardFeature: fn => fn, initializeExtensionDock: () => {},
    ChatCaptureModule: { capturarTextoChat: () => 'Lucia: ajuda', capturarNomeCliente: () => 'Lucia' },
    ObservationsModule: { getPromptComplementForCurrentChat: () => 'Observação técnica' },
    SummaryModule: { exibirResumo() {} }, MAX_PROMPT_COMPLEMENT_CHARS: 2000,
    MessagingHelper: { async send(payload) { sent.push(JSON.parse(JSON.stringify(payload))); return { success: true, reply: 'Resposta', resumo: 'Resumo' }; } },
    alert(message) { assert.fail(message); }
  });
  const create = h.document.createElement;
  h.document.createElement = tag => { const n = create(tag); n.insertAdjacentHTML = () => {}; return n; };
  vm.runInContext(fs.readFileSync('modules/smart-reply.js', 'utf8'), h.context);
  const source = fs.readFileSync('content.js', 'utf8');
  vm.runInContext(source.slice(source.indexOf('function criarBotoesFlutuantes('), source.indexOf('\nMessagingHelper.addListener(')), h.context);
  h.dock.remove();
  h.context.criarBotoesFlutuantes({ btnSmartReply: true, btnConsultarDocsLoop: true, btnResumoGemini: true }, 'suporte');
  await new Promise(setImmediate);
  const smart = h.document.getElementById('btnSmartReply');
  const docs = h.document.getElementById('btnConsultarDocsLoop');
  const report = h.document.getElementById('btnResumoGemini');
  const preserved = h.document.getElementById('btnConversasPreservadas');
  assert.equal(smart.parentElement, docs.parentElement);
  assert.equal(report.parentElement, preserved.parentElement);
  assert.equal(h.document.getElementById('btnAssistenteIA'), null);
  assert.equal(h.document.getElementById('btnDica'), null);
  const dock = h.document.getElementById('containerBotoesGemini');
  assert.ok(dock.children.indexOf(smart.parentElement) < dock.children.indexOf(report.parentElement));
  await Promise.all(smart.click()); await Promise.all(report.click());
  assert.deepEqual(sent, [
    { action: 'gerarResposta', conversation: 'Lucia: ajuda', profile: 'DIRECT', regenerate: false, promptComplement: 'Observação técnica' },
    { action: 'gerarResumo', texto: 'Lucia: ajuda', promptComplement: 'Observação técnica' }
  ]);
  assert.equal(JSON.stringify(sent).includes('Conferir emissão'), false);
  // The new direct button honors both legacy false and an explicit new override.
  for (const [visibility, shown, docsShown] of [
    [{ btnAssistenteIA: false, btnConsultarDocsLoop: true }, false, true],
    [{ btnAssistenteIA: false, btnSmartReply: true, btnConsultarDocsLoop: false }, true, false],
    [{ btnAssistenteIA: true, btnSmartReply: false }, false, false],
    [{}, true, false]
  ]) {
    h.document.getElementById('containerBotoesGemini').remove();
    h.context.criarBotoesFlutuantes(visibility, 'suporte'); await new Promise(setImmediate);
    assert.equal(Boolean(h.document.getElementById('btnSmartReply')), shown);
    assert.equal(Boolean(h.document.getElementById('btnConsultarDocsLoop')), docsShown);
  }
});

test('editor cannot save after chat switch, all four states and text bound are exact', async () => {
  const h = harness(); await h.mount(); await h.click('Alterar');
  assert.deepEqual(h.dock.querySelectorAll('.atendeai-focus-choice').map(n => n.textContent),
    ['● Minha vez', '◐ Verificando', '○ Aguardando cliente', '↗ Aguardando terceiro']);
  await h.click('● Minha vez'); h.dock.querySelector('.atendeai-focus-input').value = 'x'.repeat(350);
  await h.click('Salvar');
  assert.equal(Object.values(h.store[KEY].items)[0].nextStep.length, 300);
  await h.click('Alterar');
  h.lucia.className = 'sz_contact'; h.cassia.className = 'sz_contact active';
  h.dock.querySelector('.atendeai-focus-input').value = 'Não salvar em Cássia'; await h.click('Salvar');
  assert.equal(Object.keys(h.store[KEY].items).length, 1);
  assert.equal(Object.values(h.store[KEY].items)[0].displayName, 'Lucia');
  assert.match(textOf(h.dock), /Cássia/); assert.match(textOf(h.dock), /Sem estado definido/);
});

test('explicit identity takes priority and phone/name/msg_ref never provide Focus identity', async () => {
  const h = harness();
  const recovery = h.context.window.RecoveryBufferModule;
  h.lucia.setAttribute('data-chat-id', 'chat-lucia');
  assert.equal(recovery.getConversationIdentityFromCard(h.lucia).sourceId, 'data-chat-id:chat-lucia');
  h.lucia.setAttribute('data-chat-id', '+55 (11) 99999-1234');
  h.lucia.querySelector('.times').setAttribute('title', '');
  h.lucia.appendChild(el('span', { msg_ref: 'message-only' }));
  assert.equal(recovery.getConversationIdentityFromCard(h.lucia), null);
  await h.mount(); assert.equal(h.button('Alterar'), undefined);
});

test('Focus storage error keeps editor and reports failure without false saved state', async () => {
  const h = harness(); await h.mount(); await h.click('Alterar'); await h.click('◐ Verificando');
  h.context.chrome.storage.local.set = (data, callback) => {
    h.context.chrome.runtime.lastError = { message: 'quota exceeded' }; callback(); delete h.context.chrome.runtime.lastError;
  };
  await h.click('Salvar');
  assert.match(textOf(h.dock), /Não foi possível salvar/);
  assert.equal(h.button('Salvar').disabled, false);
  assert.equal(h.store[KEY], undefined);
});

test('storage read pending across chat switch cannot save an old editor', async () => {
  const h = harness(); await h.mount(); await h.save(); await h.click('Alterar');
  const before = structuredClone(h.store);
  h.dock.querySelector('.atendeai-focus-input').value = 'Rascunho antigo';
  let deliver;
  const originalGet = h.context.chrome.storage.local.get;
  h.context.chrome.storage.local.get = (keys, callback) => { deliver = () => { h.context.chrome.storage.local.get = originalGet; callback(structuredClone(h.store)); }; };
  const pending = h.click('Salvar'); await new Promise(setImmediate);
  h.lucia.className = 'sz_contact'; h.cassia.className = 'sz_contact active';
  deliver(); await pending;
  assert.deepEqual(h.store, before);
  assert.match(textOf(h.dock), /Cássia/);
});

test('nextStep alone is local and saving an empty editor removes the item', async () => {
  const h = harness(); await h.mount(); await h.click('Alterar');
  h.dock.querySelector('.atendeai-focus-input').value = 'Cliente enviar XML'; await h.click('Salvar');
  assert.equal(Object.values(h.store[KEY].items)[0].status, '');
  assert.match(textOf(h.dock), /Cliente enviar XML/);
  assert.equal(h.lucia.querySelector('.atendeai-focus-badge'), null);
  await h.click('Alterar'); h.dock.querySelector('.atendeai-focus-input').value = ' '; await h.click('Salvar');
  assert.equal(Object.keys(h.store[KEY].items).length, 0);
});

test('two tabs saving different attendances preserve both items under the shared local lock', async () => {
  const store = {}; let lockQueue = Promise.resolve();
  const locks = { request(name, task) {
    assert.equal(name, KEY);
    const result = lockQueue.then(task, task); lockQueue = result.catch(() => {}); return result;
  } };
  const a = harness(store, locks), b = harness(store, locks);
  b.lucia.className = 'sz_contact'; b.cassia.className = 'sz_contact active';
  await Promise.all([a.mount(), b.mount()]);
  for (const h of [a, b]) { await h.click('Alterar'); await h.click('◐ Verificando'); }
  a.dock.querySelector('.atendeai-focus-input').value = 'Passo Lucia';
  b.dock.querySelector('.atendeai-focus-input').value = 'Passo Cássia';
  await Promise.all([a.click('Salvar'), b.click('Salvar')]);
  assert.equal(Object.keys(store[KEY].items).length, 2);
  assert.deepEqual(Object.values(store[KEY].items).map(item => item.nextStep).sort(), ['Passo Cássia', 'Passo Lucia']);
});

test('visibility options retain old preference, direct override, Docs and sector defaults', async () => {
  const source = fs.readFileSync('options.js', 'utf8');
  const configs = source.slice(source.indexOf('  const BUTTON_CONFIGS'), source.indexOf('  const FIXED_MESSAGES'));
  const functions = source.slice(source.indexOf('  function getDefaultVisibility'), source.indexOf('  renderFixedMessagesBySector();', source.indexOf('  function getDefaultVisibility')));
  for (const sector of ['suporte', 'preatendimento']) {
    for (const settings of [undefined, { btnAssistenteIA: false, btnConsultarDocsLoop: true }, { btnAssistenteIA: true, btnSmartReply: false }]) {
      const store = { atendeai_visibility: settings, sector };
      const context = { VISIBILITY_KEY: 'atendeai_visibility', SECTOR_KEY: 'sector',
        storageGet: async () => structuredClone(store), storageSet: async data => Object.assign(store, data),
        el: { visibilityOptions: { querySelectorAll: () => [{ value: 'btnSmartReply', checked: true }] } } };
      vm.createContext(context); vm.runInContext(configs + functions, context);
      const loaded = await context.loadVisibilitySettings();
      assert.equal(loaded.btnSmartReply, settings ? false : true);
      if (settings?.btnConsultarDocsLoop) assert.equal(loaded.btnConsultarDocsLoop, true);
      await context.saveVisibilitySettings();
      assert.equal(store.atendeai_visibility.btnSmartReply, true);
      if (settings?.btnAssistenteIA !== undefined) assert.equal(store.atendeai_visibility.btnAssistenteIA, settings.btnAssistenteIA);
    }
  }
  assert.doesNotMatch(configs, /btnAssistenteIA|btnDica|Dropdown/);
});

test('UX1: Support Focus inicia resumido', async () => {
  const h = harness(); await h.mount();
  assert.equal(h.dock.querySelector('.atendeai-focus-choice'), null);
  assert.equal(h.dock.querySelector('.atendeai-focus-input'), null);
  assert.equal(h.button('Alterar')?.getAttribute('aria-expanded'), 'false');
  assert.match(textOf(h.dock), /Próximo passo não definido/);
  assert.doesNotMatch(textOf(h.dock), /Aguardando cliente/);
});

test('UX2: Alterar expande editor', async () => {
  const h = harness(); await h.mount(); await h.click('Alterar');
  assert.equal(h.dock.querySelectorAll('.atendeai-focus-choice').length, 4);
  assert.ok(h.dock.querySelector('.atendeai-focus-input'));
  assert.ok(h.button('Salvar'));
});

test('UX3: Salvar recolhe editor', async () => {
  const h = harness(); await h.mount(); await h.save();
  assert.equal(h.dock.querySelector('.atendeai-focus-choice'), null);
  assert.equal(h.dock.querySelector('.atendeai-focus-input'), null);
  assert.equal(h.button('Alterar')?.textContent, 'Alterar');
  assert.match(textOf(h.dock), /Verificando/);
});

test('UX4: Limpar recolhe editor', async () => {
  const h = harness(); await h.mount(); await h.save(); await h.click('Alterar'); await h.click('Limpar');
  assert.equal(h.dock.querySelector('.atendeai-focus-choice'), null);
  assert.equal(h.button('Alterar')?.textContent, 'Alterar');
});

test('UX9: Badge toggle false remove badges e não apaga storage', async () => {
  const h = harness(); await h.mount(); await h.save();
  const id = h.context.window.RecoveryBufferModule.getConversationIdentityFromCard(h.lucia).sourceId;
  assert.equal(h.lucia.querySelectorAll('.atendeai-focus-badge').length, 1);
  await h.setStorage({ [BADGES_KEY]: false });
  assert.equal(h.lucia.querySelector('.atendeai-focus-badge'), null);
  assert.equal(h.store[KEY].items[id].status, 'CHECKING');
  assert.match(textOf(h.dock), /Verificando/);
});

test('UX10: Reativar badge recria indicadores', async () => {
  const h = harness(); await h.mount(); await h.save();
  await h.setStorage({ [BADGES_KEY]: false });
  assert.equal(h.lucia.querySelector('.atendeai-focus-badge'), null);
  await h.setStorage({ [BADGES_KEY]: true });
  assert.equal(h.lucia.querySelectorAll('.atendeai-focus-badge').length, 1);
  assert.equal(h.lucia.querySelector('.atendeai-focus-badge').textContent, '◐');
});

test('UX11: Não existe barra/header de foco superior', () => {
  const files = ['content.js', 'modules/support-focus.js', 'modules/ui-builder.js', 'modules/theme.js'];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /Seu foco agora|Responder primeiro|ranking 1\/2\/3/);
    assert.doesNotMatch(source, /atendeai-focus-topbar|atendeai-focus-header|focus-priority-bar/);
  }
});

test('AUTO1: Baseline inicial não marca MY_TURN retroativamente', async () => {
  const h = harness();
  h.addMessage({ text: 'histórico antigo' });
  h.addMessage({ text: 'outra mensagem antiga' });
  await h.mount();
  assert.equal(h.store[KEY], undefined);
  assert.doesNotMatch(textOf(h.dock), /Minha vez/);
});

test('AUTO2: Nova mensagem inbound depois do baseline marca MY_TURN', async () => {
  const h = harness();
  h.addMessage({ text: 'histórico conhecido' });
  await h.mount();
  h.addMessage({ text: 'nova dúvida do cliente' });
  await h.flush();
  const id = h.context.window.RecoveryBufferModule.getConversationIdentityFromCard(h.lucia).sourceId;
  assert.equal(h.store[KEY].items[id].status, 'MY_TURN');
  assert.equal(h.store[KEY].items[id].nextStep, '');
  assert.match(textOf(h.dock), /Minha vez/);
});

test('AUTO3: Mensagem .sent não marca MY_TURN', async () => {
  const h = harness();
  h.addMessage({ text: 'histórico conhecido' });
  await h.mount();
  h.addMessage({ text: 'resposta do técnico', sent: true });
  await h.flush();
  assert.equal(h.store[KEY], undefined);
  assert.doesNotMatch(textOf(h.dock), /Minha vez/);
});

test('AUTO4: Automático não marca MY_TURN', async () => {
  const h = harness();
  h.addMessage({ text: 'histórico conhecido' });
  await h.mount();
  h.addMessage({ text: 'protocolo gerado', auto: true });
  await h.flush();
  assert.equal(h.store[KEY], undefined);
});

test('AUTO5: Rerender da mesma mensagem não gera nova transição', async () => {
  const h = harness();
  h.addMessage({ text: 'histórico conhecido' });
  await h.mount();
  const inbound = h.addMessage({ text: 'nova dúvida' });
  await h.flush();
  const id = h.context.window.RecoveryBufferModule.getConversationIdentityFromCard(h.lucia).sourceId;
  const first = h.store[KEY].items[id].updatedAt;
  h.tick(5000);
  inbound.querySelector('.message span').textContent = 'nova dúvida editada';
  await h.flush([{ target: inbound }]);
  assert.equal(h.store[KEY].items[id].status, 'MY_TURN');
  assert.equal(h.store[KEY].items[id].updatedAt, first);
});

test('AUTO6: Nova inbound em outro atendimento não escreve na identidade anterior', async () => {
  const h = harness(); await h.mount(); await h.save();
  const luciaId = h.context.window.RecoveryBufferModule.getConversationIdentityFromCard(h.lucia).sourceId;
  h.lucia.className = 'sz_contact'; h.cassia.className = 'sz_contact active';
  await h.flush();
  h.addMessage({ name: 'Cássia', text: 'mensagem da Cássia' });
  await h.flush();
  assert.equal(h.store[KEY].items[luciaId].status, 'CHECKING');
  assert.equal(h.store[KEY].items[luciaId].displayName, 'Lucia');
});

test('AUTO7: Nenhuma MessagingHelper/API é chamada pelo Support Focus automático', async () => {
  const h = harness();
  h.addMessage({ text: 'histórico conhecido' });
  await h.mount();
  h.addMessage({ text: 'nova inbound' });
  await h.flush();
  assert.equal(h.store[KEY] && Object.values(h.store[KEY].items)[0].status, 'MY_TURN');
});
