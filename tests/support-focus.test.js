const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { el, createDocument, collect, textOf } = require('./mini-dom');
const KEY = 'atendeai_support_focus_v1';
const BADGES_KEY = 'atendeai_support_focus_badges_enabled';
test('central starts collapsed outside dock and leaves native cards untouched', async()=>{
 const h=harness(); const children=[...h.lucia.children]; await h.mount();
 assert.ok(h.document.querySelector('.atendeai-focus-central'));
 assert.equal(h.dock.querySelector('.atendeai-focus-card'),null);
 assert.equal(h.document.querySelector('.atendeai-focus-list'),null);
 assert.deepEqual(h.lucia.children,children); assert.equal(h.document.querySelector('.atendeai-focus-input'),null);
});
test('own UI mutations and remount do not multiply roots or storage transactions',async()=>{
 const h=harness();await h.mount();await h.save();let reads=0;const get=h.context.chrome.storage.local.get;
 h.context.chrome.storage.local.get=(keys,cb)=>{reads++;get(keys,cb);};
 await h.flush([{target:h.document.querySelector('.atendeai-focus-central')}]);assert.equal(reads,0);
 await h.mount();assert.equal(h.document.querySelectorAll('.atendeai-focus-central').length,1);assert.equal(h.dock.children.length,0);
});
test('manual priority, tags and optional step survive switching and remount',async()=>{
 const h=harness(); await h.mount(); await h.save();
 await h.click('Organizar atendimento'); await h.click('Bloqueante'); await h.click('Salvar alterações');
 const item=Object.values(h.store[KEY].items)[0]; assert.equal(item.priority,'NEXT'); assert.deepEqual(item.tags,['Bloqueante']);
 h.lucia.className='sz_contact'; h.cassia.className='sz_contact active'; await h.flush(); await h.save();
 assert.equal(Object.keys(h.store[KEY].items).length,2); await h.mount(); assert.equal(Object.keys(h.store[KEY].items).length,2);
});
test('same names and fallback identities never share saved data',async()=>{
 const h=harness(); await h.mount(); await h.save(); h.lucia.className='sz_contact';
 const other=h.card('Lucia','06/10/26 08:14',true,'lucia-2'); await h.flush(); await h.click('Organizar atendimento');
 assert.equal(h.document.querySelector('.atendeai-focus-input').value,''); await h.click('Cancelar');
 other.setAttribute('data-chat-id',''); await h.flush(); assert.equal(h.button('Organizar atendimento'),undefined);
 assert.equal(Object.keys(h.store[KEY].items).length,1);
});
test('duplicate explicit ids are rejected and contact ids are not attendance ids',async()=>{
 const h=harness(); h.card('Other','06/10/26 08:16',false,'lucia-1'); await h.mount(); assert.equal(h.button('Organizar atendimento'),undefined);
 h.lucia.setAttribute('data-chat-id',''); h.lucia.setAttribute('data-contact-id','contact'); await h.flush(); assert.equal(h.button('Organizar atendimento'),undefined);
});
test('old records reuse exact source only, preserve old status and next step',async()=>{
 const old={sourceId:'data-chat-id:lucia-1',displayName:'Lucia',status:'WAITING_CUSTOMER',nextStep:'XML',updatedAt:100000000};
 const h=harness({[KEY]:{version:1,items:{[old.sourceId]:old}}}); await h.mount(); await h.click('Organizar atendimento');
 assert.equal(h.document.querySelector('.atendeai-focus-input').value,'XML'); await h.click('Salvar alterações');
 const item=h.store[KEY].items[old.sourceId]; assert.equal(item.status,'WAITING_CUSTOMER'); assert.equal(item.priority,'NEXT'); assert.deepEqual(item.tags,['Aguardando cliente']);
});
test('pending editor save cannot cross attendance switch',async()=>{
 const h=harness(); await h.mount(); await h.save(); await h.click('Organizar atendimento'); const before=structuredClone(h.store);
 let deliver; const get=h.context.chrome.storage.local.get;
 h.context.chrome.storage.local.get=(keys,cb)=>{deliver=()=>{h.context.chrome.storage.local.get=get;cb(structuredClone(h.store));};};
 const saving=h.click('Salvar alterações'); await new Promise(setImmediate); h.lucia.className='sz_contact'; h.cassia.className='sz_contact active'; deliver(); await saving; assert.deepEqual(h.store,before);
});
test('retention and concurrent local transactions are preserved',async()=>{
 const store={}; let queue=Promise.resolve(); const locks={request(key,fn){assert.equal(key,KEY);const run=queue.then(fn);queue=run.catch(()=>{});return run;}};
 const a=harness(store,locks),b=harness(store,locks); b.lucia.className='sz_contact';b.cassia.className='sz_contact active';
 await Promise.all([a.mount(),b.mount()]); await Promise.all([a.save(),b.save()]); assert.equal(Object.keys(store[KEY].items).length,2);
 a.advance(); await a.flush(); assert.equal(Object.keys(store[KEY].items).length,0);
});
test('cancel is transactional and quota error preserves editor',async()=>{
 const h=harness(); await h.mount(); await h.save(); const before=structuredClone(h.store);
 await h.click('Organizar atendimento');await h.click('Agora');await h.click('Cancelar');assert.deepEqual(h.store,before);
 await h.click('Organizar atendimento'); h.context.chrome.storage.local.set=(d,cb)=>{h.context.chrome.runtime.lastError={message:'quota'};cb();delete h.context.chrome.runtime.lastError;};
 await h.click('Salvar alterações');assert.match(textOf(h.document.body),/Não foi possível salvar/); assert.ok(h.document.querySelector('.atendeai-focus-input'));
});
test('preview/time/text changes never raise alerts or alter priority',async()=>{
 const h=harness(); await h.mount(); await h.save(); const before=structuredClone(h.store);
 h.addMessage({text:'new text'}); await h.flush(); h.lucia.querySelector('.times').setAttribute('title','08/10/26 12:00'); await h.flush(); assert.deepEqual(h.store,before);
});
function identifiedMessage(h,id,seq){const m=h.addMessage({text:id}); m.className='msg received';m.setAttribute('data-chat-id','lucia-1');m.setAttribute('data-message-id',id);m.setAttribute('data-message-sequence',String(seq));return m;}
test('verified append gives a local alert without changing manual priority',async()=>{
 const h=harness(); identifiedMessage(h,'m1',1); await h.mount();await h.save();identifiedMessage(h,'m2',2);await h.flush();
 const item=Object.values(h.store[KEY].items)[0];assert.equal(item.priority,'NEXT');assert.equal(item.alert.messageId,'m2');
 await h.flush();assert.equal(Object.values(h.store[KEY].items)[0].alert.messageId,'m2');
 await h.click('Organizar atendimento');await h.click('Marcar revisado');assert.equal(Object.values(h.store[KEY].items)[0].alert,null);
});
test('message remount, wrong attendance and older sequence fail closed',async()=>{
 const h=harness();const first=identifiedMessage(h,'m1',4);await h.mount();await h.save();const before=structuredClone(h.store);
 first.remove();identifiedMessage(h,'m1',4);await h.flush();identifiedMessage(h,'old',2);await h.flush();
 const wrong=identifiedMessage(h,'wrong',5);wrong.setAttribute('data-chat-id','cassia-1');await h.flush();assert.deepEqual(h.store,before);
});
test('unsafe list mount never falls back into native cards or dock',async()=>{
 const h=harness();h.list.className='unknown';await h.mount();assert.equal(h.document.querySelector('.atendeai-focus-central'),null);assert.equal(h.dock.children.length,0);
});
test('canceling inline editor restores the expanded priority list',async()=>{
 const h=harness(); await h.mount(); await h.save(); const toggle=h.document.querySelector('.atendeai-focus-toggle'); await Promise.all(toggle.click());
 await h.click('Organizar atendimento'); const panel=h.document.querySelector('.atendeai-focus-editor');
 h.document.querySelector('.atendeai-focus-list').remove();panel.className+=' atendeai-focus-inline';h.document.querySelector('.atendeai-focus-central').appendChild(panel);
 await h.click('Cancelar');assert.ok(h.document.querySelector('.atendeai-focus-list'));
});
test('clear removes only current record; next step is bounded and optional',async()=>{
 const h=harness(); await h.mount(); await h.click('Organizar atendimento');h.document.querySelector('.atendeai-focus-input').value='x'.repeat(350);await h.click('Salvar alterações');
 assert.equal(Object.values(h.store[KEY].items)[0].nextStep.length,300);
 h.lucia.className='sz_contact';h.cassia.className='sz_contact active';await h.flush();await h.save();await h.click('Organizar atendimento');await h.click('Limpar');
 assert.equal(Object.keys(h.store[KEY].items).length,1);assert.equal(Object.values(h.store[KEY].items)[0].sourceId,'data-chat-id:lucia-1');
});
test('untagged next priority can be saved with no next step',async()=>{
 const h=harness();await h.mount();await h.click('Organizar atendimento');await h.click('Salvar alterações');
 const item=Object.values(h.store[KEY].items)[0];assert.equal(item.nextStep,'');assert.deepEqual(item.tags,[]);assert.equal(item.priority,'NEXT');
});
test('automatic, outbound and untracked messages cannot create local alerts',async()=>{
 for(const mode of ['sent','auto','untracked','unknown']){
  const h=harness();identifiedMessage(h,'m1',1);await h.mount();if(mode!=='untracked')await h.save();const before=structuredClone(h.store);
  const m=identifiedMessage(h,'m2',2);if(mode==='sent')m.className='msg sent';if(mode==='unknown')m.className='msg';if(mode==='auto')m.querySelector('.name').textContent='Automático';await h.flush();assert.deepEqual(h.store,before);
 }
});
test('review acknowledgment does not resurrect an already seen message after DOM rebuild',async()=>{
 const h=harness(); const m=identifiedMessage(h,'m1',1);await h.mount();await h.save();const newMsg=identifiedMessage(h,'m2',2);await h.flush();await h.click('Organizar atendimento');await h.click('Marcar revisado');
 newMsg.remove();await h.flush();identifiedMessage(h,'m2',2);await h.flush();assert.equal(Object.values(h.store[KEY].items)[0].alert,null);
});
test('legacy attendance stamp records remain unchanged and are never re-keyed by name',async()=>{
 const id='attendance:webchat|lucia|06/10/26 08:14',old={sourceId:id,displayName:'Lucia',status:'MY_TURN',nextStep:'Legacy private step',updatedAt:100000000};
 const h=harness({[KEY]:{version:1,items:{[id]:old}}});await h.mount();await h.click('Organizar atendimento');assert.equal(h.document.querySelector('.atendeai-focus-input').value,'');await h.click('Cancelar');
 assert.deepEqual(h.store[KEY].items[id],old);assert.equal(h.document.querySelectorAll('.atendeai-focus-row').length,0);
});
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
  function card(name, time, active = false, id = name === 'Lucia' ? 'lucia-1' : 'cassia-1') {
    const c = el('div', { class: 'sz_contact' + (active ? ' active' : ''), 'data-chat-id': id }, [
      el('div', { class: 'contact-layout' }, [el('div', { class: 'content' }, [el('div', { class: 'name_in_hours' }, [
        el('div', { class: 'name' }, [el('span', { class: 'contact-name', text: name })])])])]),
      el('img', { alt: 'platform', src: '/assets/img/platform/mini/webchat.svg' }),
      el('div', { class: 'contact-times', phase: 'attendance' }, [el('span', { class: 'times', title: time })])]);
    list.appendChild(c); return c;
  }
  const list=el('div', {class:'chats-list'}); document.body.appendChild(list);
  const lucia=card('Lucia', '06/10/26 08:14', true), cassia=card('Cássia', '06/10/26 08:15');
  const button = label => collect(document.body).find(n => n.tagName === 'button' && (n.textContent === label || n.getAttribute('aria-label') === label));
  async function click(label) { await Promise.all(button(label).click()); }
  async function flush(records = [{ target: document.body }]) {
    observers.forEach(o => o.fn(records));
    const pending=[...timers.values()]; timers.clear(); for(const fn of pending) await fn();
  }
  async function mount() { await context.window.SupportFocusModule.mount(dock); }
  async function save() { await click('Organizar atendimento'); await click('Próximo'); document.querySelector('.atendeai-focus-input').value='Conferir emissão'; await click('Salvar alterações'); }
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
  return { list, document, dock, lucia, cassia, card, store, context, button, click, flush, mount, save, addMessage, setStorage, changeListeners, tick(ms=1000) { clock+=ms; }, advance() { clock+=86400001; } };
}
test('F13/F14: saved Focus stays out of actual report and direct Smart Reply requests', async () => {
  const h = harness(); await h.mount(); await h.save();
  const sent = [];
  Object.assign(h.context, {
    DOMHelpers: { exists: () => false, createElement: tag => el(tag, { id: 'containerBotoesGemini' }) },
    getIconHTML: () => '', guardFeature: fn => fn, initializeExtensionDock: () => {},
    ObservationsModule: { getPromptComplementForCurrentChat: () => 'Observação técnica' },
    SummaryModule: { exibirResumo() {} }, MAX_PROMPT_COMPLEMENT_CHARS: 2000,
    MessagingHelper: { async send(payload) { sent.push(JSON.parse(JSON.stringify(payload))); return { success: true, reply: 'Resposta', resumo: 'Resumo' }; } },
    alert(message) { assert.fail(message); }
  });
  const create = h.document.createElement;
  h.document.createElement = tag => { const n = create(tag); n.insertAdjacentHTML = () => {}; return n; };
  h.addMessage({ text: 'ajuda' });
  vm.runInContext(fs.readFileSync('modules/chat-capture.js', 'utf8'), h.context);
  vm.runInContext(fs.readFileSync('modules/smart-reply-context.js', 'utf8'), h.context);
  vm.runInContext(fs.readFileSync('modules/smart-reply-profiles.js', 'utf8'), h.context);
  vm.runInContext(fs.readFileSync('modules/smart-reply-profiles-ui.js', 'utf8'), h.context);
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
  assert.equal(smart.parentElement.parentElement, docs.parentElement);
  assert.equal(report.parentElement, preserved.parentElement);
  assert.equal(h.document.getElementById('btnAssistenteIA'), null);
  assert.equal(h.document.getElementById('btnDica'), null);
  const dock = h.document.getElementById('containerBotoesGemini');
  assert.ok(dock.children.indexOf(smart.parentElement.parentElement) < dock.children.indexOf(report.parentElement));
  await Promise.all(smart.click()); await Promise.all(report.click());
  assert.deepEqual(sent, [
    { action: 'gerarResposta', conversation: 'Lucia: ajuda', profile: 'DIRECT', regenerate: false },
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
