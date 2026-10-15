const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const KEY = 'atendeai_style_samples_v1';
const plain = value => JSON.parse(JSON.stringify(value));
function harness(store = {}, { deferTimers = false, failSet = false } = {}) {
  const listeners = {}, timers = [];
  const composer = { value: '', textContent: '', isContentEditable: false, contains: n => n === composer };
  const chat = { token: 'chat:A', messages: [] };
  const context = {
    window: {}, navigator: {},
    document: { body: {}, addEventListener(k, fn) { (listeners[k] ||= []).push(fn); } },
    chrome: { storage: { onChanged: { addListener() {} } } },
    setTimeout: fn => { if (deferTimers) timers.push(fn); else fn(); return 1; }, clearTimeout() {},
    MutationObserver: class { observe() {} },
    StorageHelper: { async get() { return plain(store); }, async set(data) { if (failSet) throw new Error('quota'); Object.assign(store, plain(data)); } },
    ChatCaptureModule: { identificarAtendimentoResposta: () => chat.token,
      mensagensDaResposta: () => chat.messages.map(m => ({ ...m })), encontrarComposer: () => composer }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('modules/smart-reply-samples.js', 'utf8'), context);
  const M = context.window.StyleSamplesModule;
  M.start();
  return { M, store, composer, chat,
    type(text) { composer.value = text; (listeners.input || []).forEach(fn => fn({ target: composer })); },
    clearComposer() { composer.value = ''; composer.textContent = ''; },
    send(author, message) { chat.messages.push({ author, message, sent: true }); },
    runTimers() { timers.splice(0).forEach(fn => fn()); },
    async tick(now) { M._tick(now); await M._idle(); } };
}
const TEXT = 'Opa, consegue me mandar o XML dessa nota?';

test('filtros: tamanho e dados sensíveis', () => {
  const { M } = harness();
  assert.equal(M.accept(TEXT), true);
  assert.equal(M.accept('Data: 15/10/2026, pode ser?'), true);
  for (const bad of ['ok, beleza', 'x'.repeat(301), 'Meu CPF é 123.456.789-09 tá?', 'CNPJ 12.345.678/0001-90 confere?',
    'Chave 3524 1012 3456 7800 0123 5500 1000 0012 3410 0001 2345', 'Me liga no (11) 98765-4321 depois', 'Manda pra ana@empresa.com.br por favor',
    'Acessa https://exemplo.com.br e me fala', 'Meu AnyDesk é 123 456 789, conecta aí',
    'Pode ligar no (11) 3456-7890 que te atendo', 'Me liga no 3456-7890 ok pessoal?', 'Acessa sistema.com.br/login e me fala']) assert.equal(M.accept(bad), false, bad);
});

test('envio confirmado grava amostra e aprende selfName', async () => {
  const h = harness();
  h.type(TEXT); h.clearComposer(); h.send('Felipe Okamoto', TEXT); await h.tick(1000);
  assert.equal(h.store[KEY].selfName, 'Felipe Okamoto');
  assert.deepEqual(h.store[KEY].items.map(i => i.text), [TEXT]);
  assert.equal(h.M.selfName(), 'Felipe Okamoto');
});

test('mensagem renderizada antes de limpar o composer ainda confirma', async () => {
  const h = harness();
  h.type(TEXT); h.send('Felipe Okamoto', TEXT); await h.tick(1000);
  assert.equal(h.store[KEY], undefined);
  h.clearComposer(); await h.tick(1500);
  assert.equal(h.store[KEY].items.length, 1);
});

test('texto diferente, prazo vencido ou troca de atendimento não confirmam', async () => {
  const a = harness(); a.type(TEXT); a.clearComposer(); a.send('Felipe Okamoto', 'Outra frase bem diferente aqui'); await a.tick(1000);
  assert.equal(a.store[KEY], undefined);
  const b = harness(); b.type(TEXT); b.clearComposer(); await b.tick(1000); b.send('Felipe Okamoto', TEXT); await b.tick(12001);
  assert.equal(b.store[KEY], undefined);
  const c = harness(); c.type(TEXT); c.clearComposer(); await c.tick(1000); c.chat.token = 'chat:B'; c.send('Felipe Okamoto', TEXT); await c.tick(2000);
  assert.equal(c.store[KEY], undefined);
});

test('texto idêntico já existente não confirma; só uma mensagem nova confirma', async () => {
  const h = harness(); h.send('Carlos Suporte', TEXT);
  h.type(TEXT); h.clearComposer(); await h.tick(1000);
  assert.equal(h.store[KEY], undefined);
  h.send('Felipe Okamoto', TEXT); await h.tick(1200);
  assert.equal(h.store[KEY].selfName, 'Felipe Okamoto');
});

test('outro autor confirmado apaga as amostras antigas; anti-eco não grava a sugestão inserida', async () => {
  const h = harness({ [KEY]: { version: 1, selfName: 'Ana', items: [{ text: 'Frase antiga da Ana aqui', at: Date.now() }] } });
  await h.M.load();
  h.M.noteInserted(TEXT);
  h.type(TEXT); h.clearComposer(); h.send('Felipe Okamoto', TEXT); await h.tick(1000);
  assert.equal(h.store[KEY].selfName, 'Felipe Okamoto');
  assert.deepEqual(h.store[KEY].items, []);
});

test('composer contenteditable usa textContent', async () => {
  const h = harness(); h.composer.isContentEditable = true; h.composer.textContent = TEXT;
  h.type(''); h.composer.textContent = TEXT; h.type('');
  h.clearComposer(); h.send('Felipe Okamoto', TEXT); await h.tick(1000);
  assert.equal(h.store[KEY].items.length, 1);
});

test('carga limita a 40, expira 60 dias e forRequest exclui o chat atual e limita a 8', async () => {
  const now = Date.now();
  const items = Array.from({ length: 45 }, (_, i) => ({ text: `Amostra número ${i} do técnico`, at: now - i * 1000 }));
  items.push({ text: 'Amostra velha demais do técnico', at: now - 61 * 24 * 60 * 60 * 1000 });
  const h = harness({ [KEY]: { version: 1, selfName: 'Felipe', items } });
  await h.M.load();
  assert.equal(h.M.count(), 40);
  const picked = plain(h.M.forRequest('Você: Amostra número 0 do técnico'));
  assert.equal(picked.length, 8);
  assert.equal(picked.includes('Amostra número 0 do técnico'), false);
  assert.equal(picked[0], 'Amostra número 1 do técnico');
  await h.M.clear();
  assert.equal(h.M.count(), 0); assert.equal(h.M.selfName(), '');
});

test('envio rápido: mensagem renderizada e composer limpo antes do contador de 250 ms ainda confirma', async () => {
  const h = harness({}, { deferTimers: true });
  h.type(TEXT); h.clearComposer(); h.send('Felipe Okamoto', TEXT);
  h.runTimers(); await h.tick(1000);
  assert.equal(h.store[KEY].selfName, 'Felipe Okamoto');
  assert.deepEqual(h.store[KEY].items.map(i => i.text), [TEXT]);
});

test('envio rápido não confirma quando só existia a mesma frase de um colega', async () => {
  const h = harness({}, { deferTimers: true });
  h.send('Carlos Suporte', TEXT);
  h.type(TEXT); h.clearComposer(); h.runTimers(); await h.tick(1000);
  assert.equal(h.store[KEY], undefined);
});

test('telefones locais e URLs sem esquema são rejeitados; datas e frases comuns continuam aceitas', () => {
  const { M } = harness();
  for (const bad of ['Me liga no 34567890 depois', 'Abra suporte.empresa.tech/login para conferir', 'Meu zap é 3456 7890 pode chamar',
    'Entra em portal.empresa.com.br pra baixar', 'Baixa em empresa.com/download agora', 'Abra empresa.support para conferir', 'Acesse empresa.digital para baixar', 'Veja empresa.software para conferir', 'Fala no 11987654321 então ok'])
    assert.equal(M.accept(bad), false, bad);
  for (const good of ['Data: 15/10/2026, pode ser?', 'Vou enviar o arquivo nota.xml agora mesmo', 'Mandei o relatorio.pdf e o backup.zip pra você', 'Versão 2.4.1 instalada, tudo certo?',
    'Consegue me mandar o print da tela agora?', 'Vence em 15.10.2026, ok pessoal?'])
    assert.equal(M.accept(good), true, good);
});

test('amostras sensíveis já guardadas não entram no pedido e saem do armazenamento', async () => {
  const now = Date.now();
  const h = harness({ [KEY]: { version: 1, selfName: 'Felipe', items: [
    { text: 'Me liga no 34567890 depois', at: now }, { text: 'Abra suporte.empresa.tech/login para conferir', at: now - 1 },
    { text: TEXT, at: now - 2 }] } });
  await h.M.load();
  assert.deepEqual(plain(h.M.forRequest('')), [TEXT]);
  assert.deepEqual(h.store[KEY].items.map(i => i.text), [TEXT]);
});

test('amostras vencidas são removidas do armazenamento ao carregar, sem perder gravações concorrentes', async () => {
  const now = Date.now();
  const h = harness({ [KEY]: { version: 1, selfName: 'Felipe Okamoto', items: [
    { text: 'Amostra velha demais do técnico', at: now - 61 * 24 * 60 * 60 * 1000 }, { text: TEXT, at: now }] } });
  const loading = h.M.load();
  h.type('Pode me mandar o print da tela?'); h.clearComposer(); h.send('Felipe Okamoto', 'Pode me mandar o print da tela?');
  await loading; await h.tick(1000);
  const texts = h.store[KEY].items.map(i => i.text);
  assert.equal(texts.includes('Amostra velha demais do técnico'), false);
  assert.deepEqual(texts.sort(), ['Pode me mandar o print da tela?', TEXT].sort());
});

test('falha ao gravar a poda mantém a memória limpa e não lança', async () => {
  const now = Date.now();
  const h = harness({ [KEY]: { version: 1, selfName: 'Felipe', items: [
    { text: 'Amostra velha demais do técnico', at: now - 61 * 24 * 60 * 60 * 1000 }, { text: TEXT, at: now }] } }, { failSet: true });
  await h.M.load();
  assert.equal(h.M.count(), 1);
});

test('domínios com sufixos fora de lista saem do armazenamento e do pedido', async () => {
  const now = Date.now();
  const h = harness({ [KEY]: { version: 1, selfName: 'Felipe', items: [
    { text: 'Abra empresa.support para conferir', at: now }, { text: 'Veja empresa.software para conferir', at: now - 1 },
    { text: 'Vou enviar o arquivo nota.xml agora mesmo', at: now - 2 }] } });
  await h.M.load();
  assert.deepEqual(plain(h.M.forRequest('')), ['Vou enviar o arquivo nota.xml agora mesmo']);
  assert.deepEqual(h.store[KEY].items.map(i => i.text), ['Vou enviar o arquivo nota.xml agora mesmo']);
});
