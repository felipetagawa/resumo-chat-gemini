const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const BRIDGE_SOURCE = fs.readFileSync(
  path.resolve(process.cwd(), "modules/crm-primefaces-bridge.js"),
  "utf8"
);
const SUGGESTION_SOURCE = fs.readFileSync(
  path.resolve(process.cwd(), "modules/documentation-suggestion.js"),
  "utf8"
);

const INPUT_ID = "frmAtendimento:tbvAtendimento:documentacao_input";
const PANEL_ID = "frmAtendimento:tbvAtendimento:documentacao_panel";
const COMPONENT_ID = "frmAtendimento:tbvAtendimento:documentacao";
const HINPUT_ID = "frmAtendimento:tbvAtendimento:documentacao_hinput";
const STATUS_ATTR = "data-atendeai-documentation-bridge";

function createItem(id, label) {
  return {
    tagName: "li",
    attrs: {
      "data-item-value": String(id),
      "data-item-label": String(label)
    },
    clicked: false,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    },
    click() {
      this.clicked = true;
      if (typeof this.onNativeClick === "function") this.onNativeClick();
    }
  };
}

function createCrmHarness({
  items = [],
  widgetFactory,
  enhanceWindow,
  extraWindow = {},
  extraDocument = {},
  extraContext = {}
} = {}) {
  const attrs = {};
  const input = { id: INPUT_ID, value: "" };
  const hidden = { id: HINPUT_ID, value: "" };
  const panelItems = items.map(([id, label]) => createItem(id, label));
  const panelListeners = {};

  const panel = {
    id: PANEL_ID,
    style: { setProperty() {}, removeProperty() {}, display: "" },
    querySelectorAll(selector) {
      if (String(selector).includes("data-item-value")) return panelItems.slice();
      return [];
    },
    addEventListener(type, fn) {
      (panelListeners[type] ||= []).push(fn);
    },
    removeEventListener(type, fn) {
      panelListeners[type] = (panelListeners[type] || []).filter((item) => item !== fn);
    }
  };

  const elements = new Map([
    [INPUT_ID, input],
    [PANEL_ID, panel],
    [HINPUT_ID, hidden]
  ]);

  const listeners = {};
  const documentElement = {
    setAttribute(name, value) {
      attrs[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    }
  };

  const document = {
    documentElement,
    getElementById(id) {
      return elements.get(id) || null;
    },
    addEventListener(type, fn) {
      (listeners[type] ||= []).push(fn);
    },
    dispatchEvent(event) {
      for (const fn of listeners[event.type] || []) fn(event);
      return true;
    },
    ...extraDocument
  };

  const defaultWidget = {
    id: COMPONENT_ID,
    input: {
      attr(name) {
        return name === "id" ? INPUT_ID : null;
      }
    },
    hinput: {
      val(value) {
        if (value !== undefined) hidden.value = String(value);
        return hidden.value;
      }
    },
    search() {},
    selectItem(item) {
      const id = item.attr("data-item-value");
      const label = item.attr("data-item-label");
      input.value = label;
      hidden.value = id;
    }
  };

  const widget = widgetFactory
    ? widgetFactory({ input, hidden, panelItems, defaultWidget })
    : defaultWidget;

  const window = {
    ...extraWindow,
    PrimeFaces: {
      getWidgetById(id) {
        return id === COMPONENT_ID ? widget : null;
      },
      widgets: widget ? { documentacao: widget } : {}
    }
  };
  enhanceWindow?.(window);

  const context = {
    window,
    document,
    console,
    CustomEvent,
    Date,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    ...extraContext
  };
  vm.createContext(context);
  vm.runInContext(BRIDGE_SOURCE, context);

  return {
    attrs,
    input,
    hidden,
    panelItems,
    documentElement,
    document,
    widget,
    window,
    context,
    status() {
      return documentElement.getAttribute(STATUS_ATTR);
    }
  };
}

function loadBridge(options = {}) {
  const harness = createCrmHarness(options);

  function select(id, label) {
    harness.documentElement.setAttribute("data-atendeai-documentation-select-id", id);
    harness.documentElement.setAttribute("data-atendeai-documentation-select-label", label);
    harness.document.dispatchEvent(new CustomEvent("atendeai:crm-documentation-select", {
      detail: { id, label }
    }));
    return harness.status();
  }

  return {
    attrs: harness.attrs,
    input: harness.input,
    hidden: harness.hidden,
    panelItems: harness.panelItems,
    widget: harness.widget,
    select,
    status: harness.status
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBridgeStatus(bridge, timeoutMs = 600) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const status = bridge.status();
    if (status === "selected" || status === "select-failed") return status;
    await delay(20);
  }
  return bridge.status();
}

function loadLearning({ store = {} } = {}) {
  const LEARNING_SOURCE = fs.readFileSync(
    path.resolve(process.cwd(), "modules/documentation-learning.js"),
    "utf8"
  );
  const context = {
    window: {},
    console,
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
  return { module: context.window.DocumentationLearningModule, store };
}

function loadSuggestionWithDom(document, learningModule) {
  const context = {
    window: { DocumentationLearningModule: learningModule },
    console,
    chrome: {},
    document,
    location: { pathname: "/crm-atendimento/teste" },
    setTimeout,
    clearTimeout,
    Event,
    KeyboardEvent: class {},
    CustomEvent,
    Date
  };
  vm.createContext(context);
  vm.runInContext(SUGGESTION_SOURCE, context);
  return context.window.DocumentationSuggestionModule.__test;
}

function createStubElement(tag = "div") {
  const children = [];
  const el = {
    tagName: String(tag).toUpperCase(),
    style: { cssText: "" },
    children,
    textContent: "",
    type: "button",
    get firstChild() {
      return children[0] || null;
    },
    appendChild(child) {
      children.push(child);
      return child;
    },
    removeChild(child) {
      const i = children.indexOf(child);
      if (i >= 0) children.splice(i, 1);
      return child;
    },
    addEventListener() {},
    querySelector() {
      return null;
    }
  };
  return el;
}

function loadIntegratedSelect({ items = [], widgetFactory, learningModule, enhanceWindow } = {}) {
  const harness = createCrmHarness({
    items,
    widgetFactory,
    enhanceWindow,
    extraWindow: { DocumentationLearningModule: learningModule },
    extraDocument: { createElement: createStubElement },
    extraContext: {
      chrome: {},
      location: { pathname: "/crm-atendimento/teste" }
    }
  });
  vm.runInContext(SUGGESTION_SOURCE, harness.context);

  return {
    input: harness.input,
    hidden: harness.hidden,
    widget: harness.widget,
    panelItems: harness.panelItems,
    document: harness.document,
    window: harness.window,
    api: harness.context.window.DocumentationSuggestionModule.__test,
    status: harness.status
  };
}

function createManualLearningDom() {
  const attrs = {};
  const input = { id: INPUT_ID, value: "" };
  const hidden = { id: HINPUT_ID, value: "" };
  const panelListeners = {};
  const panel = {
    id: PANEL_ID,
    addEventListener(type, fn) {
      (panelListeners[type] ||= []).push(fn);
    },
    removeEventListener(type, fn) {
      panelListeners[type] = (panelListeners[type] || []).filter((item) => item !== fn);
    },
    dispatch(event) {
      for (const fn of panelListeners[event.type] || []) fn(event);
    }
  };
  const problem = { id: "crm-input-problema", value: "" };
  const elements = new Map([
    [INPUT_ID, input],
    [PANEL_ID, panel],
    [HINPUT_ID, hidden],
    [problem.id, problem]
  ]);
  const document = {
    documentElement: {
      setAttribute(name, value) {
        attrs[name] = String(value);
      },
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
      }
    },
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelector() {
      return null;
    },
    addEventListener() {},
    dispatchEvent() {
      return true;
    }
  };
  return { document, input, hidden, panel, attrs, problem };
}

function loadSuggestionApi() {
  const context = {
    window: {},
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

test("P1. select por id usa item exato", () => {
  const bridge = loadBridge({
    items: [
      ["100", "IE incorreta"],
      ["232", "REJEIÇÃO 232: IE DO DESTINATÁRIO NÃO INFORMADA"],
      ["101", "IE ausente"]
    ]
  });

  const status = bridge.select("232", "REJEIÇÃO 232: IE DO DESTINATÁRIO NÃO INFORMADA");

  assert.equal(status, "selected");
  assert.equal(bridge.hidden.value, "232");
  assert.equal(bridge.input.value, "REJEIÇÃO 232: IE DO DESTINATÁRIO NÃO INFORMADA");
});

test("P2. label igual com id diferente não seleciona item errado", () => {
  const bridge = loadBridge({
    items: [
      ["A", "IE ausente"],
      ["B", "IE ausente"]
    ]
  });

  const status = bridge.select("B", "IE ausente");

  assert.equal(status, "selected");
  assert.equal(bridge.hidden.value, "B");
  assert.notEqual(bridge.hidden.value, "A");
});

test("P3. candidate-not-found falha fechado", () => {
  const bridge = loadBridge({
    items: [["100", "IE incorreta"]]
  });

  const status = bridge.select("999", "IE ausente");

  assert.equal(status, "candidate-not-found");
  assert.equal(bridge.hidden.value, "");
  assert.equal(bridge.input.value, "");
});

test("P4. widget-not-found falha fechado", () => {
  const bridge = loadBridge({
    items: [["232", "REJEIÇÃO 232"]],
    widgetFactory: () => null
  });

  const status = bridge.select("232", "REJEIÇÃO 232");

  assert.equal(status, "widget-not-found");
});

test("P5. input apenas alterado visualmente NÃO é suficiente para considerar sucesso", async () => {
  const bridge = loadBridge({
    items: [["232", "REJEIÇÃO 232: IE DO DESTINATÁRIO NÃO INFORMADA"]],
    widgetFactory: ({ input, defaultWidget }) => ({
      ...defaultWidget,
      hinput: {
        val() {
          return "";
        }
      },
      selectItem(item) {
        input.value = item.attr("data-item-label");
      }
    })
  });

  const immediate = bridge.select("232", "REJEIÇÃO 232: IE DO DESTINATÁRIO NÃO INFORMADA");

  assert.equal(bridge.input.value, "REJEIÇÃO 232: IE DO DESTINATÁRIO NÃO INFORMADA");
  assert.notEqual(immediate, "selected");
  assert.equal(await waitForBridgeStatus(bridge), "select-failed");
});

test("P6. seleção confirmada retorna selected", () => {
  const bridge = loadBridge({
    items: [["539", "REJEIÇÃO 539: IE NÃO HABILITADA"]]
  });

  assert.equal(bridge.status(), "ready");
  const status = bridge.select("539", "REJEIÇÃO 539: IE NÃO HABILITADA");
  assert.equal(status, "selected");
  assert.equal(bridge.hidden.value, "539");
});

test("P7. auto-fill só acontece para mode=single", () => {
  const api = loadSuggestionApi();
  assert.equal(api.shouldAutofill({
    mode: "single",
    suggestions: [{ id: "232", label: "REJEIÇÃO 232", probability: 0.8 }]
  }, { autofillEnabled: true }), true);
});

test("P8. multiple nunca auto-fill", () => {
  const api = loadSuggestionApi();
  assert.equal(api.shouldAutofill({
    mode: "multiple",
    suggestions: [
      { id: "1", label: "IE incorreta", probability: 0.48 },
      { id: "2", label: "IE ausente", probability: 0.43 }
    ]
  }, { autofillEnabled: true }), false);
});

test("P9. uncertain nunca auto-fill", () => {
  const api = loadSuggestionApi();
  assert.equal(api.shouldAutofill({
    mode: "uncertain",
    suggestions: [{ id: "1", label: "IE incorreta", probability: 0.4 }]
  }, { autofillEnabled: true }), false);
});

test("P10. auto-fill disabled nunca auto-fill", () => {
  const api = loadSuggestionApi();
  assert.equal(api.shouldAutofill({
    mode: "single",
    suggestions: [{ id: "232", label: "REJEIÇÃO 232", probability: 0.8 }]
  }, { autofillEnabled: false }), false);
});

test("PF1. hinput atualizando depois de pequeno atraso ainda resulta selected", async () => {
  const stack = loadIntegratedSelect({
    items: [["232", "REJEIÇÃO 232: IE DO DESTINATÁRIO NÃO INFORMADA"]],
    widgetFactory: ({ input, hidden, defaultWidget }) => ({
      ...defaultWidget,
      selectItem(item) {
        input.value = item.attr("data-item-label");
        setTimeout(() => {
          hidden.value = item.attr("data-item-value");
        }, 80);
      }
    })
  });

  const ok = await stack.api.selectDocumentation(
    "232",
    "REJEIÇÃO 232: IE DO DESTINATÁRIO NÃO INFORMADA"
  );

  assert.equal(ok, true);
  assert.equal(stack.status(), "selected");
  assert.equal(stack.hidden.value, "232");
});

test("PF2. hinput nunca atualizado resulta select-failed após timeout bounded", async () => {
  const startedAt = Date.now();
  const stack = loadIntegratedSelect({
    items: [["232", "REJEIÇÃO 232: IE DO DESTINATÁRIO NÃO INFORMADA"]],
    widgetFactory: ({ input, defaultWidget }) => ({
      ...defaultWidget,
      selectItem(item) {
        input.value = item.attr("data-item-label");
      }
    })
  });

  const ok = await stack.api.selectDocumentation(
    "232",
    "REJEIÇÃO 232: IE DO DESTINATÁRIO NÃO INFORMADA"
  );

  const elapsed = Date.now() - startedAt;
  assert.equal(ok, false);
  assert.equal(stack.status(), "select-failed");
  assert.ok(elapsed < 1200, `timeout bounded, elapsed=${elapsed}`);
});

test("PF3. click humano sem seleção confirmada não aprende", async () => {
  const { module, store } = loadLearning();
  const KEY = "atendeai_documentation_learning_v1";
  const { document, panel } = createManualLearningDom();
  const api = loadSuggestionWithDom(document, module);
  const item = {
    getAttribute(name) {
      if (name === "data-item-value") return "B";
      if (name === "data-item-label") return "IE incorreta";
      return null;
    }
  };

  api.watchTrustedManualSelection({
    lastConfirmedId: "A",
    suggestionIds: ["B"],
    context: "IE do destinatário está incorreta",
    labelsById: new Map([
      ["A", "IE ausente"],
      ["B", "IE incorreta"]
    ])
  });

  panel.dispatch({
    type: "click",
    isTrusted: true,
    target: {
      closest() {
        return item;
      }
    }
  });

  await delay(550);
  assert.equal(store[KEY], undefined);
});

test("PF4. click humano + hinput confirmado aprende", async () => {
  const { module, store } = loadLearning();
  const KEY = "atendeai_documentation_learning_v1";
  const { document, panel, input, hidden } = createManualLearningDom();
  const api = loadSuggestionWithDom(document, module);
  const item = {
    getAttribute(name) {
      if (name === "data-item-value") return "B";
      if (name === "data-item-label") return "IE incorreta";
      return null;
    }
  };

  api.watchTrustedManualSelection({
    lastConfirmedId: "A",
    suggestionIds: ["B"],
    context: "IE do destinatário está incorreta",
    labelsById: new Map([
      ["A", "IE ausente"],
      ["B", "IE incorreta"]
    ])
  });

  panel.dispatch({
    type: "click",
    isTrusted: true,
    target: {
      closest() {
        return item;
      }
    }
  });

  await delay(40);
  input.value = "IE incorreta";
  hidden.value = "B";
  await delay(80);

  assert.equal(store[KEY].docs.B.confirmations, 1);
  assert.ok(Object.keys(store[KEY].docs.A.negativeFeatures || {}).length >= 1);
});

function panelItem(id, label) {
  return {
    getAttribute(name) {
      if (name === "data-item-value") return id;
      if (name === "data-item-label") return label;
      return null;
    }
  };
}

function dispatchManualClick(panel, item, { trusted = true } = {}) {
  panel.dispatch({
    type: "click",
    isTrusted: trusted,
    target: {
      closest() {
        return item;
      }
    }
  });
}

test("ML1. manual confirmado fora do top 3 aprende positivo", async () => {
  const { module, store } = loadLearning();
  const KEY = "atendeai_documentation_learning_v1";
  const { document, panel, input, hidden, problem } = createManualLearningDom();
  const api = loadSuggestionWithDom(document, module);
  const contextText = "IE do destinatário está incorreta";
  problem.value = contextText;

  api.watchTrustedManualSelection({
    lastConfirmedId: null,
    suggestionIds: ["X", "Y", "Z"],
    context: contextText,
    labelsById: new Map()
  });

  dispatchManualClick(panel, panelItem("B", "IE incorreta"));
  await delay(20);
  input.value = "IE incorreta";
  hidden.value = "B";
  await delay(80);

  assert.equal(store[KEY].docs.B.confirmations, 1);
  assert.ok(Object.keys(store[KEY].docs.B.positiveFeatures || {}).length >= 1);
  assert.equal(store[KEY].docs.A, undefined);
  assert.doesNotMatch(JSON.stringify(store[KEY]), /IE do destinatário está incorreta/);
});

test("ML2. manual fora do top 3 sem hinput confirmado não aprende", async () => {
  const { module, store } = loadLearning();
  const KEY = "atendeai_documentation_learning_v1";
  const { document, panel, input, problem } = createManualLearningDom();
  const api = loadSuggestionWithDom(document, module);
  problem.value = "IE do destinatário está incorreta";

  api.watchTrustedManualSelection({
    lastConfirmedId: null,
    suggestionIds: ["X", "Y", "Z"],
    context: "IE do destinatário está incorreta",
    labelsById: new Map()
  });

  dispatchManualClick(panel, panelItem("B", "IE incorreta"));
  await delay(20);
  input.value = "IE incorreta";
  await delay(550);

  assert.equal(store[KEY], undefined);
});

test("ML3. A auto-filled -> B manual, mesmo contexto: positivo B + negativo A", async () => {
  const { module, store } = loadLearning();
  const KEY = "atendeai_documentation_learning_v1";
  const { document, panel, input, hidden, problem } = createManualLearningDom();
  const api = loadSuggestionWithDom(document, module);
  const sessionContext = "A IE do destinatário está incorreta";
  problem.value = "a ie do destinatario esta incorreta";

  api.watchTrustedManualSelection({
    lastConfirmedId: "A",
    suggestionIds: ["A"],
    context: sessionContext,
    labelsById: new Map([["A", "IE ausente"]])
  });

  dispatchManualClick(panel, panelItem("B", "IE incorreta"));
  await delay(20);
  input.value = "IE incorreta";
  hidden.value = "B";
  await delay(80);

  assert.equal(store[KEY].docs.B.confirmations, 1);
  assert.ok(Object.keys(store[KEY].docs.B.positiveFeatures || {}).length >= 1);
  assert.ok(Object.keys(store[KEY].docs.A.negativeFeatures || {}).length >= 1);
  assert.doesNotMatch(JSON.stringify(store[KEY]), /destinatário está incorreta/);
});

test("ML4. A auto-filled -> contexto mudou -> B manual: positivo B sem negativo em A", async () => {
  const { module, store } = loadLearning();
  const KEY = "atendeai_documentation_learning_v1";
  const { document, panel, input, hidden, problem } = createManualLearningDom();
  const api = loadSuggestionWithDom(document, module);
  problem.value = "IE do destinatário não foi informada";

  api.watchTrustedManualSelection({
    lastConfirmedId: "A",
    suggestionIds: ["A"],
    context: "IE do destinatário não foi informada",
    labelsById: new Map([["A", "REJEIÇÃO 232: IE DO DESTINATÁRIO NÃO INFORMADA"]])
  });

  dispatchManualClick(panel, panelItem("B", "IE incorreta"));
  problem.value = "A IE do destinatário está incorreta";
  await delay(20);
  input.value = "IE incorreta";
  hidden.value = "B";
  await delay(80);

  assert.equal(store[KEY].docs.B.confirmations, 1);
  assert.ok(store[KEY].docs.B.positiveFeatures.incorreta || store[KEY].docs.B.positiveFeatures.ie);
  assert.equal(store[KEY].docs.A, undefined);
  assert.doesNotMatch(JSON.stringify(store[KEY]), /está incorreta|nao foi informada|não foi informada/);
});

test("ML5. synthetic click fora do top 3 não aprende", async () => {
  const { module, store } = loadLearning();
  const KEY = "atendeai_documentation_learning_v1";
  const { document, panel, input, hidden, problem } = createManualLearningDom();
  const api = loadSuggestionWithDom(document, module);
  problem.value = "IE do destinatário está incorreta";

  api.watchTrustedManualSelection({
    lastConfirmedId: null,
    suggestionIds: ["X", "Y", "Z"],
    context: "IE do destinatário está incorreta",
    labelsById: new Map()
  });

  dispatchManualClick(panel, panelItem("B", "IE incorreta"), { trusted: false });
  await delay(20);
  input.value = "IE incorreta";
  hidden.value = "B";
  await delay(80);

  assert.equal(store[KEY], undefined);
});

const LABEL_232 = "REJEIÇÃO 232: IE DO DESTINATÁRIO NÃO INFORMADA";
const LEARNING_KEY = "atendeai_documentation_learning_v1";

function createFlowStats() {
  return {
    clicks: 0,
    selectItemCalls: 0,
    itemSelectCalls: 0,
    ajaxCalls: 0,
    fetchCalls: 0,
    xhrCalls: 0
  };
}

function bindPrimeFacesItemClick(panelItems, input, hidden, stats, fireItemSelect) {
  for (const el of panelItems) {
    el.onNativeClick = () => {
      stats.clicks += 1;
      input.value = el.getAttribute("data-item-label");
      hidden.value = el.getAttribute("data-item-value");
      if (typeof fireItemSelect === "function") {
        fireItemSelect(el.getAttribute("data-item-value"));
      }
    };
  }
}

function widgetWithItemSelectApi({ input, hidden, defaultWidget, stats, panelItems, nativeMode }) {
  const itemSelectBehavior = function itemSelectBehavior() {
    stats.itemSelectCalls += 1;
  };
  const widget = {
    ...defaultWidget,
    cfg: {
      behaviors: {
        itemSelect: itemSelectBehavior
      }
    },
    hasBehavior(name) {
      return name === "itemSelect";
    },
    invokeItemSelectBehavior() {
      itemSelectBehavior();
    },
    callBehavior(name) {
      if (name === "itemSelect") itemSelectBehavior();
    },
    selectItem(item) {
      stats.selectItemCalls += 1;
      const id = item.attr("data-item-value");
      const label = item.attr("data-item-label");
      input.value = label;
      hidden.value = id;
    }
  };

  if (nativeMode === "full") {
    bindPrimeFacesItemClick(panelItems, input, hidden, stats, () => widget.invokeItemSelectBehavior());
  } else if (nativeMode === "values-only") {
    bindPrimeFacesItemClick(panelItems, input, hidden, stats, null);
  }

  return widget;
}

test("PFREAL1 fluxo preferido é click do item, não selectItem direto", async () => {
  const stats = createFlowStats();
  const bridge = loadBridge({
    items: [["232", LABEL_232]],
    widgetFactory: ({ input, hidden, panelItems, defaultWidget }) => (
      widgetWithItemSelectApi({ input, hidden, defaultWidget, stats, panelItems, nativeMode: "full" })
    )
  });

  const immediate = bridge.select("232", LABEL_232);
  const status = immediate === "selected" ? immediate : await waitForBridgeStatus(bridge);

  assert.equal(status, "selected");
  assert.ok(stats.clicks >= 1, "deve ativar o <li> real");
  assert.equal(stats.selectItemCalls, 0);
  assert.equal(bridge.hidden.value, "232");
});

test("PFREAL2 click que já dispara itemSelect não duplica itemSelect", async () => {
  const stats = createFlowStats();
  const bridge = loadBridge({
    items: [["232", LABEL_232]],
    widgetFactory: ({ input, hidden, panelItems, defaultWidget }) => (
      widgetWithItemSelectApi({ input, hidden, defaultWidget, stats, panelItems, nativeMode: "full" })
    )
  });

  bridge.select("232", LABEL_232);
  assert.equal(await waitForBridgeStatus(bridge), "selected");
  assert.equal(stats.itemSelectCalls, 1);
  assert.equal(stats.selectItemCalls, 0);
});

test("PFREAL3 fallback selectItem + behavior dispara itemSelect exatamente uma vez", async () => {
  const stats = createFlowStats();
  const bridge = loadBridge({
    items: [["232", LABEL_232]],
    widgetFactory: ({ input, hidden, panelItems, defaultWidget }) => (
      widgetWithItemSelectApi({ input, hidden, defaultWidget, stats, panelItems, nativeMode: null })
    )
  });

  const immediate = bridge.select("232", LABEL_232);
  const status = immediate === "selected" ? immediate : await waitForBridgeStatus(bridge);

  assert.equal(status, "selected");
  assert.equal(stats.selectItemCalls, 1);
  assert.equal(stats.itemSelectCalls, 1);
});

test("PFREAL4 sem behavior itemSelect não inventa Ajax manual", async () => {
  const stats = createFlowStats();
  const bridge = loadBridge({
    items: [["232", LABEL_232]],
    widgetFactory: ({ input, hidden, defaultWidget }) => ({
      ...defaultWidget,
      cfg: { behaviors: {} },
      hasBehavior() {
        return false;
      },
      selectItem(item) {
        stats.selectItemCalls += 1;
        input.value = item.attr("data-item-label");
        hidden.value = item.attr("data-item-value");
      }
    }),
    enhanceWindow(window) {
      window.fetch = () => {
        stats.fetchCalls += 1;
        return Promise.resolve();
      };
      window.XMLHttpRequest = function XMLHttpRequest() {
        stats.xhrCalls += 1;
      };
      window.PrimeFaces.ajax = {
        Request() {
          stats.ajaxCalls += 1;
        }
      };
    }
  });

  const immediate = bridge.select("232", LABEL_232);
  const status = immediate === "selected" ? immediate : await waitForBridgeStatus(bridge);

  assert.equal(status, "selected");
  assert.equal(stats.ajaxCalls, 0);
  assert.equal(stats.fetchCalls, 0);
  assert.equal(stats.xhrCalls, 0);
  assert.equal(typeof bridge.widget.invokeItemSelectBehavior, "undefined");
});

test("PFREAL5 input+hinput corretos sem fluxo exigido NÃO dão falso selected", async () => {
  const stats = createFlowStats();
  const bridge = loadBridge({
    items: [["232", LABEL_232]],
    widgetFactory: ({ input, hidden, panelItems, defaultWidget }) => {
      const widget = {
        ...defaultWidget,
        cfg: {
          behaviors: {
            itemSelect() {
              stats.itemSelectCalls += 1;
            }
          }
        },
        hasBehavior(name) {
          return name === "itemSelect";
        },
        selectItem(item) {
          stats.selectItemCalls += 1;
          input.value = item.attr("data-item-label");
          hidden.value = item.attr("data-item-value");
        }
      };
      bindPrimeFacesItemClick(panelItems, input, hidden, stats, null);
      return widget;
    }
  });

  const immediate = bridge.select("232", LABEL_232);
  assert.notEqual(immediate, "selected");
  assert.equal(await waitForBridgeStatus(bridge, 1800), "select-failed");
  assert.equal(bridge.input.value === LABEL_232 && bridge.hidden.value === "232", false);
  assert.equal(stats.itemSelectCalls, 0);
});

test("PFREAL6 candidate-not-found continua seguro", () => {
  const stats = createFlowStats();
  const bridge = loadBridge({
    items: [["100", "IE incorreta"]],
    widgetFactory: ({ defaultWidget }) => ({
      ...defaultWidget,
      cfg: {
        behaviors: {
          itemSelect() {
            stats.itemSelectCalls += 1;
          }
        }
      },
      selectItem() {
        stats.selectItemCalls += 1;
      }
    }),
    enhanceWindow(window) {
      window.fetch = () => {
        stats.fetchCalls += 1;
        return Promise.resolve();
      };
    }
  });

  const status = bridge.select("232", LABEL_232);

  assert.equal(status, "candidate-not-found");
  assert.equal(bridge.hidden.value, "");
  assert.equal(bridge.input.value, "");
  assert.equal(stats.selectItemCalls, 0);
  assert.equal(stats.itemSelectCalls, 0);
  assert.equal(stats.fetchCalls, 0);
});

test("PFREAL7 auto-fill segue o mesmo fluxo real que [Usar]", async () => {
  const stats = createFlowStats();
  const { module, store } = loadLearning();
  const stack = loadIntegratedSelect({
    items: [["232", LABEL_232]],
    learningModule: module,
    widgetFactory: ({ input, hidden, panelItems, defaultWidget }) => (
      widgetWithItemSelectApi({ input, hidden, defaultWidget, stats, panelItems, nativeMode: "full" })
    )
  });

  assert.equal(stack.api.shouldAutofill({
    mode: "single",
    suggestions: [{ id: "232", label: LABEL_232, probability: 0.8 }]
  }, { autofillEnabled: true }), true);

  const ok = await stack.api.selectDocumentation("232", LABEL_232);
  await stack.api.rememberAutofillOutcome({
    source: "autofill",
    suggestion: { id: "232", label: LABEL_232 },
    context: "Cliente está emitindo NF-e e aparece que a IE do destinatário não foi informada"
  });

  assert.equal(ok, true);
  assert.equal(stack.status(), "selected");
  assert.ok(stats.clicks >= 1);
  assert.equal(stats.selectItemCalls, 0);
  assert.equal(stats.itemSelectCalls, 1);
  assert.equal(store[LEARNING_KEY], undefined);
});

test("PFREAL8 [Usar] só aprende depois de seleção completa", async () => {
  const stats = createFlowStats();
  const { module, store } = loadLearning();
  const stack = loadIntegratedSelect({
    items: [["232", LABEL_232]],
    learningModule: module,
    widgetFactory: ({ input, hidden, panelItems, defaultWidget }) => (
      widgetWithItemSelectApi({ input, hidden, defaultWidget, stats, panelItems, nativeMode: "full" })
    )
  });

  const resultEl = createStubElement("div");
  let ok;
  if (typeof stack.api.useSuggestedDocumentation === "function") {
    ok = await stack.api.useSuggestedDocumentation(
      resultEl,
      { id: "232", label: LABEL_232, probability: 0.9 },
      { mode: "single", suggestions: [{ id: "232", label: LABEL_232, probability: 0.9 }], latencyMs: 10 },
      10,
      3,
      { context: "Rejeição 232: IE do destinatário não foi informada", labelsById: new Map() }
    );
  } else {
    ok = await stack.api.selectDocumentation("232", LABEL_232);
    if (ok && stack.api.shouldLearnFromSelection({ source: "use-button" })) {
      await module.recordPositive({
        docId: "232",
        label: LABEL_232,
        context: "Rejeição 232: IE do destinatário não foi informada"
      });
    }
  }

  assert.equal(ok, true);
  assert.ok(stats.clicks >= 1);
  assert.equal(stats.selectItemCalls, 0);
  assert.equal(stats.itemSelectCalls, 1);
  assert.equal(store[LEARNING_KEY].docs["232"].confirmations, 1);
});

test("PFREAL9 falha de ciclo completo não aprende", async () => {
  const stats = createFlowStats();
  const { module, store } = loadLearning();
  const stack = loadIntegratedSelect({
    items: [["232", LABEL_232]],
    learningModule: module,
    widgetFactory: ({ input, hidden, panelItems, defaultWidget }) => {
      const widget = {
        ...defaultWidget,
        cfg: {
          behaviors: {
            itemSelect() {
              stats.itemSelectCalls += 1;
            }
          }
        },
        hasBehavior(name) {
          return name === "itemSelect";
        },
        selectItem(item) {
          stats.selectItemCalls += 1;
          input.value = item.attr("data-item-label");
          hidden.value = item.attr("data-item-value");
        }
      };
      bindPrimeFacesItemClick(panelItems, input, hidden, stats, null);
      return widget;
    }
  });

  const resultEl = createStubElement("div");
  let ok;
  if (typeof stack.api.useSuggestedDocumentation === "function") {
    ok = await stack.api.useSuggestedDocumentation(
      resultEl,
      { id: "232", label: LABEL_232, probability: 0.9 },
      { mode: "single", suggestions: [{ id: "232", label: LABEL_232, probability: 0.9 }], latencyMs: 10 },
      10,
      3,
      { context: "Rejeição 232: IE do destinatário não foi informada", labelsById: new Map() }
    );
  } else {
    ok = await stack.api.selectDocumentation("232", LABEL_232);
    if (ok && stack.api.shouldLearnFromSelection({ source: "use-button" })) {
      await module.recordPositive({
        docId: "232",
        label: LABEL_232,
        context: "Rejeição 232: IE do destinatário não foi informada"
      });
    }
  }

  assert.equal(ok, false);
  assert.equal(stack.status(), "select-failed");
  assert.equal(stats.itemSelectCalls, 0);
  assert.equal(store[LEARNING_KEY], undefined);
});

test("PFREAL10 timeout bounded não trava a página", async () => {
  const startedAt = Date.now();
  const stack = loadIntegratedSelect({
    items: [["232", LABEL_232]],
    widgetFactory: ({ defaultWidget }) => ({
      ...defaultWidget,
      cfg: {
        behaviors: {
          itemSelect() {}
        }
      },
      hasBehavior(name) {
        return name === "itemSelect";
      },
      selectItem() {}
    })
  });

  const ok = await stack.api.selectDocumentation("232", LABEL_232);
  const elapsed = Date.now() - startedAt;

  assert.equal(ok, false);
  assert.equal(stack.status(), "select-failed");
  assert.ok(elapsed < 2000, `timeout bounded, elapsed=${elapsed}`);
  assert.ok(elapsed >= 400, `should wait for the ajax cycle, elapsed=${elapsed}`);
});
