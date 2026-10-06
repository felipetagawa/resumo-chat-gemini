const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const LEARNING_SOURCE = fs.readFileSync(
  path.resolve(process.cwd(), "modules/documentation-learning.js"),
  "utf8"
);
const SUGGESTION_SOURCE = fs.readFileSync(
  path.resolve(process.cwd(), "modules/documentation-suggestion.js"),
  "utf8"
);

const KEY = "atendeai_documentation_learning_v1";
const AUTOFILL_KEY = "atendeai_documentation_autofill_enabled";
const LEARNING_ENABLED_KEY = "atendeai_documentation_learning_enabled";
const THEME_KEY = "atendeai_theme";
const DAY = 24 * 60 * 60 * 1000;

function loadLearning({ store = {}, now = Date.now() } = {}) {
  const context = {
    window: {},
    console,
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    chrome: {
      storage: {
        local: {
          get(keys, callback) {
            const wanted = Array.isArray(keys) ? keys : [keys];
            const data = {};
            wanted.forEach((key) => {
              if (Object.prototype.hasOwnProperty.call(store, key)) data[key] = structuredClone(store[key]);
            });
            callback(data);
          },
          set(data, callback) {
            Object.assign(store, structuredClone(data));
            callback();
          },
          remove(keys, callback) {
            const list = Array.isArray(keys) ? keys : [keys];
            list.forEach((key) => {
              delete store[key];
            });
            callback();
          }
        }
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(LEARNING_SOURCE, context);
  return { module: context.window.DocumentationLearningModule, store, setNow(value) { now = value; } };
}

function loadSuggestionWithLearning(learningModule) {
  const context = {
    window: { DocumentationLearningModule: learningModule },
    console,
    chrome: {},
    document: {},
    location: { pathname: "/crm-atendimento/teste" },
    setTimeout,
    clearTimeout,
    Event,
    KeyboardEvent: class {},
    CustomEvent
  };
  vm.createContext(context);
  vm.runInContext(SUGGESTION_SOURCE, context);
  return context.window.DocumentationSuggestionModule.__test;
}

test("L1. auto-fill NÃO aprende sozinho", async () => {
  const { module, store } = loadLearning();
  const api = loadSuggestionWithLearning(module);
  await api.rememberAutofillOutcome?.({
    source: "autofill",
    suggestion: { id: "232", label: "REJEIÇÃO 232: IE DO DESTINATÁRIO NÃO INFORMADA" },
    context: "IE do destinatário não foi informada"
  });
  assert.equal(store[KEY], undefined);
  assert.equal(api.shouldLearnFromSelection({ source: "autofill" }), false);
});

test("L2. [Usar] confirmado aprende", async () => {
  const { module, store } = loadLearning();
  assert.equal(module.shouldLearnFromSelection({ source: "use-button" }), true);
  await module.recordPositive({
    docId: "232",
    label: "REJEIÇÃO 232: IE DO DESTINATÁRIO NÃO INFORMADA",
    context: "Rejeição 232: IE do destinatário não foi informada"
  });
  const doc = store[KEY].docs["232"];
  assert.equal(doc.confirmations, 1);
  assert.ok(doc.positiveFeatures["232"] || doc.positiveFeatures["nao informada"]);
});

test("L3. correção manual confiável A → B: positivo B; negativo leve A", async () => {
  const { module, store } = loadLearning();
  await module.recordCorrection({
    previousId: "A",
    previousLabel: "IE ausente",
    selectedId: "B",
    selectedLabel: "IE incorreta",
    context: "A IE do destinatário está incorreta"
  });
  assert.equal(store[KEY].docs.B.confirmations, 1);
  assert.ok(Object.keys(store[KEY].docs.A.negativeFeatures || {}).length >= 1);
  assert.notEqual(store[KEY].docs.A.confirmations, 1);
});

test("L4. click sintético da extensão não conta como click humano", () => {
  const { module } = loadLearning();
  assert.equal(module.shouldLearnFromSelection({
    source: "manual",
    event: { isTrusted: false }
  }), false);
  assert.equal(module.shouldLearnFromSelection({
    source: "manual",
    event: { isTrusted: true }
  }), true);
});

test("L5. aprendizado disabled não grava nada", async () => {
  const { module, store } = loadLearning({
    store: { [LEARNING_ENABLED_KEY]: false }
  });
  await module.recordPositive({
    docId: "232",
    label: "REJEIÇÃO 232: IE DO DESTINATÁRIO NÃO INFORMADA",
    context: "Rejeição 232"
  });
  assert.equal(store[KEY], undefined);
});

test("L6. não persiste transcript/contexto integral", async () => {
  const { module, store } = loadLearning();
  const transcript = "Cliente João disse que precisa emitir a nota e repetiu o problema várias vezes no chat inteiro do atendimento com muitos detalhes pessoais.";
  await module.recordPositive({
    docId: "232",
    label: "REJEIÇÃO 232: IE DO DESTINATÁRIO NÃO INFORMADA",
    context: `${transcript} Rejeição 232 IE não informada`
  });
  const persisted = JSON.stringify(store[KEY]);
  assert.doesNotMatch(persisted, /chat inteiro|detalhes pessoais|Cliente João disse/);
  assert.doesNotMatch(persisted, new RegExp(transcript.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("L7. não persiste telefone/email/CNPJ/protocolo", async () => {
  const { module, store } = loadLearning();
  await module.recordPositive({
    docId: "232",
    label: "REJEIÇÃO 232: IE DO DESTINATÁRIO NÃO INFORMADA",
    context: "Rejeição 232 IE não informada CNPJ 12.345.678/0001-90 tel 11987654321 email cliente@empresa.com protocolo 99887766"
  });
  const persisted = JSON.stringify(store[KEY]);
  assert.doesNotMatch(persisted, /12\.345\.678\/0001-90|11987654321|cliente@empresa\.com|99887766/);
});

test("L8. código explícito pode ser feature", async () => {
  const { module } = loadLearning();
  const features = module.extractSafeFeatures(
    "Cliente recebeu rejeição 232 ao emitir.",
    "REJEIÇÃO 232: IE DO DESTINATÁRIO NÃO INFORMADA"
  );
  assert.ok(features["232"]);
});

test("L9. número arbitrário não é feature", () => {
  const { module } = loadLearning();
  const features = module.extractSafeFeatures(
    "O pedido 445566 falhou na IE do destinatário não informada",
    "REJEIÇÃO 232: IE DO DESTINATÁRIO NÃO INFORMADA"
  );
  assert.equal(features["445566"], undefined);
  assert.equal(features["232"], undefined);
});

test("L10. TTL 90 dias", async () => {
  const now = 1_700_000_000_000;
  const { module, store } = loadLearning({
    now,
    store: {
      [KEY]: {
        version: 1,
        docs: {
          old: {
            updatedAt: now - (91 * DAY),
            confirmations: 4,
            positiveFeatures: { ie: 2 },
            negativeFeatures: {}
          },
          fresh: {
            updatedAt: now - (10 * DAY),
            confirmations: 1,
            positiveFeatures: { ausente: 1 },
            negativeFeatures: {}
          }
        }
      }
    }
  });
  const memory = await module.loadMemory();
  assert.equal(memory.docs.old, undefined);
  assert.ok(memory.docs.fresh);
  assert.equal(store[KEY].docs.old, undefined);
});

test("L11. máximo 300 docs", async () => {
  const now = 1_700_000_000_000;
  const docs = {};
  for (let i = 0; i < 300; i++) {
    docs[`doc-${i}`] = {
      updatedAt: now - ((300 - i) * 1000),
      confirmations: 1,
      positiveFeatures: { ie: 1 },
      negativeFeatures: {}
    };
  }
  const { module, store } = loadLearning({ now, store: { [KEY]: { version: 1, docs } } });
  await module.recordPositive({
    docId: "doc-new",
    label: "IE ausente",
    context: "IE ausente no cadastro"
  });
  assert.equal(Object.keys(store[KEY].docs).length, 300);
  assert.ok(store[KEY].docs["doc-new"]);
  assert.equal(store[KEY].docs["doc-0"], undefined);
});

test("L12. máximo de features por doc respeitado", async () => {
  const { module, store } = loadLearning();
  const extraTokens = Array.from({ length: 30 }, (_, i) => `term${String(i).padStart(2, "0")}`).join(" ");
  const label = `REJEIÇÃO 232 IE ${extraTokens}`;
  await module.recordPositive({
    docId: "232",
    label,
    context: `Rejeição 232 IE ${extraTokens}`
  });
  const features = store[KEY].docs["232"].positiveFeatures;
  assert.ok(Object.keys(features).length <= 24);
});

test("L13. Limpar aprendizado remove apenas learning storage", async () => {
  const { module, store } = loadLearning({
    store: {
      [KEY]: { version: 1, docs: { a: { updatedAt: Date.now(), confirmations: 1, positiveFeatures: {}, negativeFeatures: {} } } },
      [AUTOFILL_KEY]: false,
      [LEARNING_ENABLED_KEY]: true,
      [THEME_KEY]: "dark"
    }
  });
  await module.clearLearning();
  assert.equal(store[KEY], undefined);
  assert.equal(store[AUTOFILL_KEY], false);
  assert.equal(store[LEARNING_ENABLED_KEY], true);
  assert.equal(store[THEME_KEY], "dark");
});

test('M1. "cliente" NÃO faz match com feature "ie"', () => {
  const { module } = loadLearning();
  assert.equal(module.containsTerm("cliente com erro", "ie"), false);
  const features = module.extractSafeFeatures("cliente com erro", "IE ausente");
  assert.equal(features.ie, undefined);
});

test('M2. "problema na IE" faz match com feature "ie"', () => {
  const { module } = loadLearning();
  assert.equal(module.containsTerm("problema na ie", "ie"), true);
  assert.equal(module.containsTerm("problema na IE", "ie"), true);
});

test('M3. bigram "nao informada" exige sequência/token boundary', () => {
  const { module } = loadLearning();
  assert.equal(module.containsTerm("ie do destinatario nao informada", "nao informada"), true);
  assert.equal(module.containsTerm("informada incorretamente", "nao informada"), false);
});

test("M4. 20 confirmações sem feature matching => memoryBoost 0", () => {
  const { module } = loadLearning();
  const doc = {
    updatedAt: Date.now(),
    confirmations: 20,
    positiveFeatures: { ie: 8, ausente: 8 },
    negativeFeatures: {}
  };
  assert.equal(module.memoryBoostFor(doc, "como ajustar estoque manualmente"), 0);
});

test("M5. confirmações + feature matching => boost contextual > 0", () => {
  const { module } = loadLearning();
  const doc = {
    updatedAt: Date.now(),
    confirmations: 20,
    positiveFeatures: { ie: 8, ausente: 8 },
    negativeFeatures: {}
  };
  assert.ok(module.memoryBoostFor(doc, "IE ausente no destinatário") > 0);
});
