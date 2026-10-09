const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const extensionRoot = path.resolve(process.cwd());

function createFakeDocument() {
  const elements = new Map();

  return {
    elements,
    body: {
      appendChild() {},
    },
    createElement() {
      return {
        id: "",
        className: "",
        innerHTML: "",
        dataset: {},
        style: {},
        hidden: false,
        value: "",
        checked: false,
        textContent: "",
        setAttribute() {},
        addEventListener() {},
        remove() {},
        focus() {},
        querySelector() {
          return null;
        },
      };
    },
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

function loadObservationsModule({ storageMap = {} } = {}) {
  const sourcePath = path.join(extensionRoot, "modules/observations.js");
  const source = fs.readFileSync(sourcePath, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(
    `  return {
    init,
    openDrawer,
    getPromptComplementForCurrentChat,
    getCurrentChatMeta,
    getCurrentObservationSnapshot,
    onCurrentObservationsReady
  };`,
    `  return {
    init,
    openDrawer,
    getPromptComplementForCurrentChat,
    getCurrentChatMeta,
    getCurrentObservationSnapshot,
    onCurrentObservationsReady,
    __test: {
      persistCurrentInputs,
      loadCurrentValues,
      setCurrentChatContext(meta, chatKey) {
        currentMeta = meta;
        currentChatKey = chatKey;
      },
      getCurrentValues() {
        return { ...currentValues };
      }
    }
  };`,
  );

  const document = createFakeDocument();
  const state = { map: { ...storageMap } };
  const context = {
    window: {},
    document,
    console,
    setTimeout,
    clearTimeout,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    StorageHelper: {
      async get() {
        return { atendeai_chat_observations: state.map };
      },
      async set(data) {
        state.map = data.atendeai_chat_observations || {};
      },
    },
  };

  vm.createContext(context);
  vm.runInContext(source, context);

  return {
    module: context.window.ObservationsModule,
    document,
    state,
  };
}

function backgroundResponse(summary = "summary") {
  return {
    ok: true,
    async json() {
      return { summary };
    },
    async text() {
      return "";
    },
  };
}

function loadBackground({ fetchImpl, storageData = {} }) {
  const sourcePath = path.join(extensionRoot, "background.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  let listener;
  const persisted = { ...storageData };

  const chrome = {
    runtime: {
      onInstalled: {
        addListener() {},
      },
      onMessage: {
        addListener(callback) {
          listener = callback;
        },
      },
      getManifest() {
        return { version: "1.4.9" };
      },
      openOptionsPage() {},
      getURL() {
        return "chrome://options";
      },
      lastError: null,
    },
    tabs: {
      sendMessage() {},
      create() {},
    },
    storage: {
      local: {
        async get(keys) {
          if (Array.isArray(keys)) {
            return keys.reduce((acc, key) => {
              acc[key] = persisted[key];
              return acc;
            }, {});
          }
          return { ...persisted };
        },
        async set(data) {
          Object.assign(persisted, data);
        },
      },
    },
  };

  const context = {
    chrome,
    console,
    fetch: fetchImpl,
    URL,
    AbortSignal,
    setTimeout,
    clearTimeout,
  };

  vm.createContext(context);
  vm.runInContext(source, context);

  return {
    persisted,
    async dispatch(request) {
      return new Promise((resolve) => {
        listener(request, { tab: { id: 1 } }, resolve);
      });
    },
  };
}

test("historico sem observacoes envia somente texto", async () => {
  let requestBody;
  const background = loadBackground({
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return backgroundResponse();
    },
    storageData: { history: [] },
  });

  await background.dispatch({ action: "gerarResumo", texto: "chat content" });

  assert.deepEqual(requestBody, { texto: "chat content" });
});

test("historico com observacoes envia texto e promptComplement sem substituir o historico", async () => {
  let requestBody;
  const background = loadBackground({
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return backgroundResponse();
    },
    storageData: { history: [] },
  });

  await background.dispatch({
    action: "gerarResumo",
    texto: "chat content",
    promptComplement: "observacao recente",
  });

  assert.equal(requestBody.texto, "chat content");
  assert.equal(requestBody.promptComplement, "observacao recente");
});

test("notas privadas nunca aparecem no payload e observacao vazia nao envia promptComplement", async () => {
  let requestBody;
  const background = loadBackground({
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return backgroundResponse();
    },
    storageData: { history: [] },
  });

  await background.dispatch({
    action: "gerarResumo",
    texto: "chat content",
    promptComplement: "   ",
    observationText: "nao enviar",
  });

  assert.deepEqual(requestBody, { texto: "chat content" });
  assert.equal(requestBody.observationText, undefined);
});

test("dicas inteligentes compartilham o mesmo formato de payload", async () => {
  let requestBody;
  const background = loadBackground({
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        async json() {
          return { status: "SUCESS" };
        },
        async text() {
          return "";
        },
      };
    },
  });

  await background.dispatch({
    action: "gerarDica",
    texto: "chat content",
    promptComplement: "observacao recente",
  });

  assert.deepEqual(requestBody, {
    texto: "chat content",
    promptComplement: "observacao recente",
  });
});

test("editar a observacao e gerar imediatamente usa o valor mais recente digitado", () => {
  const { module, document } = loadObservationsModule();
  document.elements.set("atendeai-prompt-complement", {
    value: "valor digitado agora",
  });

  assert.equal(
    module.getPromptComplementForCurrentChat(),
    "valor digitado agora",
  );
});

test("fechar o drawer e gerar depois mantem a observacao salva no atendimento", async () => {
  const { module, document } = loadObservationsModule();
  document.elements.set("atendeai-observation-text", { value: "nota privada" });
  document.elements.set("atendeai-prompt-complement", {
    value: "observacao para resumo",
  });
  document.elements.set("atendeai-observations-save-status", {
    textContent: "",
    dataset: {},
  });

  module.__test.setCurrentChatContext(
    { contactName: "Cliente A", phone: "5511999999999", protocol: "ABC123" },
    "protocol:abc123",
  );

  await module.__test.persistCurrentInputs();
  document.elements.delete("atendeai-prompt-complement");

  assert.equal(
    module.getPromptComplementForCurrentChat(),
    "observacao para resumo",
  );
});

test("trocar de atendimento nao reutiliza observacao de outro chat", async () => {
  const { module, document, state } = loadObservationsModule({
    storageMap: {
      "protocol:chat-a": {
        observationText: "nota a",
        promptComplement: "observacao a",
      },
      "protocol:chat-b": {
        observationText: "nota b",
        promptComplement: "observacao b",
      },
    },
  });

  document.elements.set("atendeai-observation-text", { value: "" });
  document.elements.set("atendeai-prompt-complement", { value: "" });
  document.elements.set("atendeai-observations-save-status", {
    textContent: "",
    dataset: {},
  });

  module.__test.setCurrentChatContext(
    { contactName: "Cliente A", phone: "", protocol: "chat-a" },
    "protocol:chat-a",
  );
  await module.__test.loadCurrentValues();
  assert.equal(module.getPromptComplementForCurrentChat(), "observacao a");

  module.__test.setCurrentChatContext(
    { contactName: "Cliente B", phone: "", protocol: "chat-b" },
    "protocol:chat-b",
  );
  await module.__test.loadCurrentValues();
  assert.equal(module.getPromptComplementForCurrentChat(), "observacao b");
  assert.deepEqual(Object.keys(state.map).sort(), [
    "protocol:chat-a",
    "protocol:chat-b",
  ]);
});

test("classificacao de produto envia somente a conversa para o novo endpoint", async () => {
  let requestedUrl;
  let requestBody;
  const background = loadBackground({
    fetchImpl: async (url, options) => {
      requestedUrl = String(url);
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        async json() {
          return {
            mode: "single",
            suggestions: [
              { productId: "4", product: "ESTOQUE", probability: 0.91 }
            ],
            confidence: 0.94,
            unclearProbability: 0.01,
            latencyMs: 120
          };
        },
        async text() {
          return "";
        },
      };
    },
  });

  const response = await background.dispatch({
    action: "classificarProduto",
    conversation: "Cliente informa divergencia no saldo do estoque."
  });

  assert.match(requestedUrl, /\/api\/classification\/product$/);
  assert.deepEqual(requestBody, {
    conversation: "Cliente informa divergencia no saldo do estoque."
  });
  assert.equal(response.success, true);
  assert.equal(response.classification.suggestions[0].productId, "4");
});

test("classificacao de produto vazia nao chama a API", async () => {
  let called = false;
  const background = loadBackground({
    fetchImpl: async () => {
      called = true;
      return backgroundResponse();
    },
  });

  const response = await background.dispatch({
    action: "classificarProduto",
    conversation: "   "
  });

  assert.equal(called, false);
  assert.equal(response.success, false);
});

test("sugestao de documentacao envia contexto e candidatos ao endpoint correto", async () => {
  let requestedUrl;
  let requestBody;

  const background = loadBackground({
    fetchImpl: async (url, options) => {
      requestedUrl = String(url);
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        async json() {
          return {
            mode: "single",
            suggestions: [
              { id: "1339", label: "Rejeição 610", probability: 0.97 }
            ],
            confidence: 0.99,
            unclearProbability: 0.01,
            latencyMs: 280
          };
        },
        async text() {
          return "";
        },
      };
    },
  });

  const candidates = [
    { id: "1339", label: "Rejeição 610" },
    { id: "1702", label: "Rejeição 533" }
  ];

  const response = await background.dispatch({
    action: "classificarDocumentacao",
    context: "Cliente recebeu rejeição 610.",
    candidates
  });

  assert.match(requestedUrl, /\/api\/classification\/documentation$/);
  assert.deepEqual(requestBody, {
    context: "Cliente recebeu rejeição 610.",
    candidates
  });
  assert.equal(response.success, true);
  assert.equal(response.classification.suggestions[0].id, "1339");
});

test("snapshot de observacao separa nota privada e complemento do resumo", () => {
  const { module, document } = loadObservationsModule();
  document.elements.set("atendeai-observation-text", { value: "nota privada" });
  document.elements.set("atendeai-prompt-complement", { value: "  observacao do resumo  " });
  document.elements.set("atendeai-reply-addendum", { value: "REPLY_ONLY_SECRET" });

  assert.deepEqual(JSON.parse(JSON.stringify(module.getCurrentObservationSnapshot())), {
    summaryObservation: "observacao do resumo",
    privateNote: "nota privada"
  });
});

test("snapshot sem drawer usa os valores carregados do atendimento", async () => {
  const { module } = loadObservationsModule({
    storageMap: {
      "protocol:chat-a": {
        observationText: "nota a",
        promptComplement: "observacao a"
      }
    }
  });

  module.__test.setCurrentChatContext(
    { contactName: "Cliente A", phone: "", protocol: "chat-a" },
    "protocol:chat-a"
  );
  await module.__test.loadCurrentValues();

  assert.deepEqual(JSON.parse(JSON.stringify(module.getCurrentObservationSnapshot())), {
    summaryObservation: "observacao a",
    privateNote: "nota a"
  });
});

test('Smart Reply envia somente contrato dedicado sem privateNote, recovery ou historico', async () => {
  let calls = 0;
  const persisted = { history: [{ summary: 'existente' }], privateNote: 'SEGREDO', customInstructions: 'nao encaminhar' };
  const background = loadBackground({ storageData: persisted, fetchImpl: async (url, options) => {
    calls++;
    assert.match(url, /\/api\/gemini\/responder$/);
    assert.deepEqual(JSON.parse(options.body), { conversation: 'Cliente: oi', profile: 'EMPATHETIC', regenerate: true, promptComplement: 'observacao' });
    return { ok: true, async json() { return { reply: 'Resposta' }; } };
  } });
  const response = await background.dispatch({ action: 'gerarResposta', conversation: 'Cliente: oi', profile: 'EMPATHETIC',
    regenerate: true, promptComplement: 'observacao', privateNote: 'SEGREDO', buffer: persisted, prompt: 'instrucoes' });
  assert.equal(response.success, true);
  assert.equal(response.reply, 'Resposta');
  assert.equal(calls, 1); assert.deepEqual(background.persisted.history, persisted.history);
});

test('wire contracts whitelist summary, reply, product and documentation data independently', async () => {
  const requests = [];
  const background = loadBackground({ fetchImpl: async (url, options) => {
    requests.push({ url: String(url), body: JSON.parse(options.body) });
    return { ok: true, async json() { return { reply: 'OK', resumo: 'OK', suggestions: [] }; }, async text() { return ''; } };
  } });
  const forbidden = { privateNote: 'PRIVATE_ONLY', replyAddendum: 'REPLY_ONLY', summaryObservation: 'SUMMARY_ONLY' };
  await background.dispatch({ ...forbidden, action: 'gerarResumo', texto: 'CHAT', promptComplement: 'SUMMARY_ONLY' });
  await background.dispatch({ ...forbidden, action: 'gerarResposta', conversation: 'CHAT', profile: 'DIRECT', promptComplement: 'REPLY_ONLY' });
  await background.dispatch({ ...forbidden, action: 'classificarProduto', conversation: 'CHAT' });
  await background.dispatch({ ...forbidden, action: 'classificarDocumentacao', context: 'CHAT', candidates: [{ id: '1', label: 'Documento' }] });
  assert.equal(requests.length, 4);
  assert.equal(requests[0].body.promptComplement, 'SUMMARY_ONLY');
  assert.equal(requests[1].body.promptComplement, 'REPLY_ONLY');
  assert.match(requests[1].url, /\/api\/gemini\/responder$/);
  for (const [i, request] of requests.entries()) {
    const body = JSON.stringify(request.body);
    assert.equal(body.includes('PRIVATE_ONLY'), false);
    if (i !== 0) assert.equal(body.includes('SUMMARY_ONLY'), false);
    if (i !== 1) assert.equal(body.includes('REPLY_ONLY'), false);
    assert.equal(Object.hasOwn(request.body, 'privateNote'), false);
  }
});

test('observations drawer exposes three compact sections with a dedicated bounded addendum', () => {
  const { module, document } = loadObservationsModule();
  const created = [];
  const original = document.createElement;
  document.createElement = () => {
    const node = original(); node.querySelector = selector => selector === '.atendeai-observations-client' ? { textContent: '' } : null;
    created.push(node); return node;
  };
  module.openDrawer();
  const markup = created.find(n => n.id === 'atendeai-observations-drawer').innerHTML;
  for (const label of ['Notas privadas', 'Observações para o resumo', 'Adendo para resposta']) assert.ok(markup.includes(label));
  assert.match(markup, /id="atendeai-reply-addendum" rows="3" maxlength="2000" disabled/);
  assert.ok(markup.includes('atendeai-reply-addendum-count'));
  assert.ok(markup.includes('É usado somente em Sugerir resposta.'));
  assert.doesNotMatch(markup, /Contexto para IA|rows="[67]"/);
});

test('Smart Reply valida localmente e propaga erro sem afetar composer', async () => {
  let calls = 0;
  const background = loadBackground({ fetchImpl: async () => { calls++; return { ok: false, status: 429, async json() { return { erro: 'Limite de sugestões' }; } }; } });
  for (const request of [
    { conversation: '', profile: 'DIRECT' },
    { conversation: 'x'.repeat(16001), profile: 'DIRECT' },
    { conversation: 'oi', profile: 'JEV' },
    { conversation: 'oi', profile: 'DIRECT', promptComplement: 'x'.repeat(2001) },
    { conversation: 'oi', profile: 'DIRECT', regenerate: 'prompt' }
  ]) assert.equal((await background.dispatch({ action: 'gerarResposta', ...request })).success, false);
  assert.equal(calls, 0);
  const response = await background.dispatch({ action: 'gerarResposta', conversation: 'oi', profile: 'DIRECT' });
  assert.match(response.erro, /Limite de sugestões/); assert.equal(calls, 1);
});

test('CUSTOM wire uses only styleInstruction while native requests omit it', async () => {
  const payloads = [];
  const background = loadBackground({ fetchImpl: async (url, options) => {
    payloads.push(JSON.parse(options.body)); return { ok: true, async json() { return { reply: 'OK' }; } };
  } });
  for (const styleInstruction of [undefined, '', ' ', 'x'.repeat(601), 3, {}, true]) {
    const response = await background.dispatch({ action: 'gerarResposta', conversation: 'CHAT', profile: 'CUSTOM', styleInstruction });
    assert.equal(response.success, false);
  }
  assert.equal(payloads.length, 0);
  await background.dispatch({ action: 'gerarResposta', conversation: 'CHAT', promptComplement: 'ADDENDUM', profile: 'CUSTOM',
    styleInstruction: 'x'.repeat(600), profileName: 'LOCAL_NAME', profileId: 'LOCAL_ID', privateNote: 'PRIVATE', summaryObservation: 'SUMMARY' });
  assert.deepEqual(payloads[0], { conversation: 'CHAT', promptComplement: 'ADDENDUM', profile: 'CUSTOM', styleInstruction: 'x'.repeat(600), regenerate: false });
  await background.dispatch({ action: 'gerarResposta', conversation: 'CHAT', profile: 'DIRECT', styleInstruction: 'IGNORED' });
  assert.equal(Object.hasOwn(payloads[1], 'styleInstruction'), false);
});

test('one-off replyInstruction contract validates types and keeps style and facts separate',async()=>{
 const payloads=[];const background=loadBackground({fetchImpl:async(url,options)=>{payloads.push(JSON.parse(options.body));return {ok:true,async json(){return {reply:'OK'};}};}});
 for(const replyInstruction of [3,{},true,'x'.repeat(601)]) assert.equal((await background.dispatch({action:'gerarResposta',conversation:'CHAT',profile:'DIRECT',replyInstruction})).success,false);
 assert.equal(payloads.length,0);
 await background.dispatch({action:'gerarResposta',conversation:'CHAT',profile:'CUSTOM',styleInstruction:'STYLE',promptComplement:'FACT',replyInstruction:'OBJECTIVE',privateNote:'PRIVATE',summaryObservation:'SUMMARY',nextStep:'FOCUS'});
 assert.deepEqual(payloads[0],{conversation:'CHAT',profile:'CUSTOM',regenerate:false,styleInstruction:'STYLE',promptComplement:'FACT',replyInstruction:'OBJECTIVE'});
 await background.dispatch({action:'gerarResposta',conversation:'CHAT',profile:'DIRECT',replyInstruction:'  '});assert.equal(Object.hasOwn(payloads[1],'replyInstruction'),false);
 assert.ok(!JSON.stringify(background.persisted).includes('OBJECTIVE'));
});
