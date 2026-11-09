const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument, el } = require('./mini-dom');

// SoftenChat shape (bundle of 2026-11-09): one <article data-conversa> per open conversation,
// header with the customer's name in span.font-bold, composer is the article's textarea.
function conversa(id, nome, telefone = '') {
  const composer = el('textarea', { 'aria-label': `Mensagem para ${nome}`, placeholder: 'Mensagem' });
  composer.offsetWidth = 200; composer.offsetHeight = 36;
  const article = el('article', { 'data-conversa': id }, [
    el('header', { title: `${nome}${telefone ? ` (${telefone})` : ''} — WhatsApp · Suporte · Felipe` }, [
      el('span', { class: 'text-[13px] font-bold truncate', text: nome })]),
    el('div', { class: 'flex-1 overflow-y-auto' }),
    el('div', {}, [composer])]);
  return { article, composer };
}

function load(nodes, { messages = {}, auth = { accessToken: 'tok' }, path = '/soften/chat', meId = 'me-1' } = {}) {
  const document = createDocument();
  nodes.forEach(node => document.body.appendChild(node));
  const calls = [];
  const storage = { auth: auth ? JSON.stringify(auth) : null };
  const context = {
    document, console,
    location: { hostname: 'chat.softensistemas.com.br', origin: 'https://chat.softensistemas.com.br', pathname: path },
    localStorage: { getItem: key => storage[key] ?? null },
    getComputedStyle: () => ({ visibility: 'visible' }),
    MutationObserver: class { observe() {} },
    fetch: async (url, init) => {
      if (url.endsWith('/auth/me')) return { ok: true, json: async () => ({ id: meId, fullName: 'Felipe' }) };
      calls.push({ url, init });
      const id = decodeURIComponent(url.match(/conversations\/([^/]+)\/messages/)[1]);
      const before = new URL(url).searchParams.get('before');
      const all = messages[id] || [];
      // Like SoftenChat: the newest page first, ascending; ?before=<id> gives the page before it.
      const end = before ? all.findIndex(m => m.id === before) : all.length;
      return { ok: true, json: async () => all.slice(Math.max(0, end - 100), end) };
    },
    setTimeout, clearTimeout
  };
  context.globalThis = context; context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('modules/softenchat-capture.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('modules/chat-capture.js', 'utf8'), context);
  return { capture: context.window.ChatCaptureModule, soften: context.window.SoftenChatCapture, document, calls };
}

const msg = (fromType, content, sentAt, extra = {}) => ({ id: sentAt, fromType, content, sentAt, type: 'text', ...extra });

test('uma conversa aberta: resumo le a API com o token da sessao e rotula cliente, tecnico e IA', async () => {
  const a = conversa('c1', 'ROBERTA', '5511999990000');
  const { capture, calls } = load([a.article], { messages: { c1: [
    msg('human', 'Bom dia, em que posso ajudar?', '2026-11-09T12:01:00Z'),
    msg('user', 'O sistema nao abre', '2026-11-09T12:00:30Z'),
    msg('nina', 'Ola! Ja vou chamar um atendente.', '2026-11-09T12:00:00Z'),
    msg('system', 'Conversa atribuida', '2026-11-09T12:00:40Z'),
    msg('human', 'nota so pra equipe', '2026-11-09T12:00:50Z', { metadata: { internal: true } })
  ] } });
  await capture.prepararCaptura();
  assert.equal(calls[0].url, 'https://chat.softensistemas.com.br/soften/api/conversations/c1/messages?limit=100');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.equal(capture.capturarTextoChat(),
    'Agente de IA: Ola! Ja vou chamar um atendente.\nROBERTA: O sistema nao abre\nTécnico: Bom dia, em que posso ajudar?');
  assert.equal(capture.capturarNomeCliente(), 'ROBERTA');
  assert.equal(capture.identificarAtendimentoResposta(), 'softenchat:c1');
});

test('resposta sugerida: so o tecnico conta como voz propria; a IA nao', async () => {
  const a = conversa('c1', 'ROBERTA');
  const { capture } = load([a.article], { messages: { c1: [
    msg('nina', 'Ola!', '2026-11-09T12:00:00Z'),
    msg('user', 'Preciso de ajuda', '2026-11-09T12:00:10Z'),
    msg('human', 'Claro', '2026-11-09T12:00:20Z')
  ] } });
  await capture.prepararCaptura();
  assert.deepEqual(JSON.parse(JSON.stringify(capture.mensagensDaResposta().map(m => m.sent))), [false, false, true]);
  assert.equal(capture.capturarConversaRotulada('').conversation,
    'Agente de IA: Ola!\nCliente (ROBERTA): Preciso de ajuda\nTécnico: Claro');
});

test('varias conversas abertas: vale a que tem o foco; sem escolha, nao le nenhuma', async () => {
  const a = conversa('c1', 'ROBERTA'), b = conversa('c2', 'MARCOS');
  const { capture, document, calls } = load([a.article, b.article], { messages: { c2: [msg('user', 'oi', '2026-11-09T12:00:00Z')] } });
  assert.equal(capture.identificarAtendimentoResposta(), '');
  assert.equal(capture.encontrarComposer(), null);
  assert.equal(await capture.prepararCaptura(), false);
  assert.equal(calls.length, 0);
  document.activeElement = b.composer;
  await capture.prepararCaptura();
  assert.equal(capture.capturarNomeCliente(), 'MARCOS');
  assert.equal(capture.encontrarComposer(), b.composer);
  assert.equal(capture.capturarTextoChat(), 'MARCOS: oi');
});

test('a conversa escolhida continua valendo quando o foco vai para o botao da extensao', async () => {
  const a = conversa('c1', 'ROBERTA'), b = conversa('c2', 'MARCOS');
  const { capture, document } = load([a.article, b.article]);
  capture.observarAtendimentoResposta();
  const focusin = document.listeners.find(l => l.type === 'focusin').fn;
  focusin({ target: a.composer });
  document.activeElement = el('button');
  assert.equal(capture.identificarAtendimentoResposta(), 'softenchat:c1');
  assert.equal(capture.encontrarComposer(), a.composer);
});

test('anexos viram um rotulo legivel em vez de [image]', () => {
  const { soften } = load([]);
  assert.equal(soften._normalizar(msg('user', '[image]', 'x', { type: 'image' }), 'ANA').message, '[Imagem]');
  assert.equal(soften._normalizar(msg('user', 'segue o print', 'x', { type: 'image' }), 'ANA').message, 'segue o print');
});

test('nome do cliente sai do title do cabecalho quando nao ha o span em negrito', () => {
  const article = el('article', { 'data-conversa': 'c9' }, [el('header', { title: 'JOSE DA SILVA (5511988887777) — WhatsApp · Suporte · Ana' })]);
  const { capture } = load([article]);
  assert.equal(capture.capturarNomeCliente(), 'JOSE DA SILVA');
});

test('sem sessao salva, nao chama a API', async () => {
  const a = conversa('c1', 'ROBERTA');
  const { capture, calls } = load([a.article], { auth: null });
  assert.equal(await capture.prepararCaptura(), false);
  assert.equal(calls.length, 0);
  assert.equal(capture.capturarTextoChat(), '');
});

test('caminho real da empresa: /soften-sistemas/chat le a API em /soften-sistemas/api', async () => {
  const a = conversa('c1', 'ROBERTA');
  const { capture, calls } = load([a.article], { path: '/soften-sistemas/chat' });
  await capture.prepararCaptura();
  assert.equal(calls[0].url, 'https://chat.softensistemas.com.br/soften-sistemas/api/conversations/c1/messages?limit=100');
});

const human = (content, sentAt, autor) => msg('human', content, sentAt, { metadata: { autor } });

test('autor vem de metadata.autor: o proprio tecnico vira Voce, o colega vira Outro tecnico', async () => {
  const a = conversa('c1', 'ROBERTA');
  const { capture } = load([a.article], { messages: { c1: [
    msg('user', 'Oi', '2026-11-09T12:00:00Z'),
    human('Bom dia', '2026-11-09T12:00:10Z', { id: 'me-1', nome: 'Felipe' }),
    human('Transferi', '2026-11-09T12:00:20Z', { id: 'x-2', nome: 'Ana' })
  ] } });
  await capture.prepararCaptura();
  assert.equal(capture.capturarTextoChat(), 'ROBERTA: Oi\nFelipe: Bom dia\nAna: Transferi');
  assert.equal(capture.capturarConversaRotulada('').conversation,
    'Cliente (ROBERTA): Oi\nVocê: Bom dia\nOutro técnico: Transferi');
  assert.equal(capture.mensagensDaResposta()[1].author, 'Felipe');
});

test('com o painel de informacoes aberto, a nota do cliente nao e confundida com o campo de resposta', () => {
  const a = conversa('c1', 'ROBERTA');
  const nota = el('textarea', { placeholder: 'Nota' }); nota.offsetWidth = 200; nota.offsetHeight = 60;
  a.article.appendChild(el('div', { role: 'dialog', 'aria-label': 'Informações do cliente' }, [nota]));
  const { capture } = load([a.article]);
  assert.equal(capture.encontrarComposer(), a.composer);
});

test('conversa nao assumida (sem campo de resposta): nenhum composer', () => {
  const article = el('article', { 'data-conversa': 'c1' }, [el('header', {}, [el('span', { class: 'font-bold', text: 'ROBERTA' })])]);
  const { capture } = load([article]);
  assert.equal(capture.encontrarComposer(), null);
});

test('historico longo: busca paginas anteriores com before ate 300 mensagens, em ordem', async () => {
  const a = conversa('c1', 'ROBERTA');
  const history = Array.from({ length: 250 }, (_, i) =>
    msg(i % 2 ? 'user' : 'human', `m${i}`, new Date(Date.UTC(2026, 10, 9, 10, 0, i)).toISOString(), { id: `id${i}` }));
  const { capture, calls } = load([a.article], { messages: { c1: history } });
  await capture.prepararCaptura();
  const lines = capture.capturarTextoChat().split('\n');
  assert.equal(lines.length, 250);
  assert.match(lines[0], /m0$/);
  assert.match(lines[249], /m249$/);
  assert.equal(calls.length, 3);
  assert.match(calls[1].url, /before=id150$/);
});

test('identificador do contato: telefone ou visitor do widget, da conversa em foco', () => {
  const a = conversa('c1', 'ROBERTA', '5511999990000'), b = conversa('c2', 'MARCOS', 'visitor_ab12');
  const { soften, document } = load([a.article, b.article]);
  document.activeElement = a.composer;
  assert.equal(soften.identificadorDoContato(), '5511999990000');
  document.activeElement = b.composer;
  assert.equal(soften.identificadorDoContato(), 'visitor_ab12');
});

test('aviso ao abrir conversa: usa a conversa em foco e passa o telefone para os retornos', async () => {
  const a = conversa('c1', 'ROBERTA', '5511999990000'), b = conversa('c2', 'MARCOS');
  const { document } = load([a.article, b.article]);
  const checks = [];
  const context = { document, console, location: { hostname: 'chat.softensistemas.com.br' },
    StorageHelper: { get: async () => ({ atendeai_user_sector: 'suporte' }) },
    RetornosChatNotice: { check: async arg => checks.push(arg) } };
  context.globalThis = context; context.window = context;
  // Reuse the adapter loaded above for the same document.
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('modules/softenchat-capture.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('modules/notifications.js', 'utf8'), context);
  const n = context.NotificationsModule || context.window.NotificationsModule;
  n.verificarNotificacoesChat();
  assert.equal(checks.length, 0); // duas abertas, nenhuma escolhida
  document.activeElement = a.composer;
  n.verificarNotificacoesChat();
  n.verificarNotificacoesChat();
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(JSON.parse(JSON.stringify(checks)), [{ name: 'ROBERTA', phone: '5511999990000' }]);
});
