const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const extensionRoot = "/Users/felipeokamoto/Documents/Repositorios/resumo-chat-gemini/resumo-chat-gemini";

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
  const source = fs.readFileSync(sourcePath, "utf8").replace(
    `  return {
    init,
    openDrawer,
    getPromptComplementForCurrentChat,
    getCurrentChatMeta
  };`,
    `  return {
    init,
    openDrawer,
    getPromptComplementForCurrentChat,
    getCurrentChatMeta,
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
