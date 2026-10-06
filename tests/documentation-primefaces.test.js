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

function loadBridge({ items = [], widgetFactory } = {}) {
  const attrs = {};
  const input = { id: INPUT_ID, value: "" };
  const hidden = { id: HINPUT_ID, value: "" };
  const panelItems = items.map(([id, label]) => createItem(id, label));

  const panel = {
    id: PANEL_ID,
    querySelectorAll(selector) {
      if (String(selector).includes("data-item-value")) return panelItems.slice();
      return [];
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
    }
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
    PrimeFaces: {
      getWidgetById(id) {
        return id === COMPONENT_ID ? widget : null;
      },
      widgets: widget ? { documentacao: widget } : {}
    }
  };

  const context = { window, document, console, CustomEvent, Date, setTimeout, clearTimeout, setInterval, clearInterval };
  vm.createContext(context);
  vm.runInContext(BRIDGE_SOURCE, context);

  function select(id, label) {
    documentElement.setAttribute("data-atendeai-documentation-select-id", id);
    documentElement.setAttribute("data-atendeai-documentation-select-label", label);
    document.dispatchEvent(new CustomEvent("atendeai:crm-documentation-select", {
      detail: { id, label }
    }));
    return documentElement.getAttribute(STATUS_ATTR);
  }

  return {
    attrs,
    input,
    hidden,
    panelItems,
    widget,
    select,
    status() {
      return documentElement.getAttribute(STATUS_ATTR);
    }
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

function loadIntegratedSelect({ items = [], widgetFactory, learningModule } = {}) {
  const attrs = {};
  const input = { id: INPUT_ID, value: "" };
  const hidden = { id: HINPUT_ID, value: "" };
  const panelItems = items.map(([id, label]) => createItem(id, label));

  const panel = {
    id: PANEL_ID,
    querySelectorAll(selector) {
      if (String(selector).includes("data-item-value")) return panelItems.slice();
      return [];
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
    }
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

  const context = {
    window: {
      DocumentationLearningModule: learningModule,
      PrimeFaces: {
        getWidgetById(id) {
          return id === COMPONENT_ID ? widget : null;
        },
        widgets: widget ? { documentacao: widget } : {}
      }
    },
    document,
    console,
    chrome: {},
    location: { pathname: "/crm-atendimento/teste" },
    CustomEvent,
    Date,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  };
  vm.createContext(context);
  vm.runInContext(BRIDGE_SOURCE, context);
  vm.runInContext(SUGGESTION_SOURCE, context);

  return {
    input,
    hidden,
    widget,
    api: context.window.DocumentationSuggestionModule.__test,
    status() {
      return documentElement.getAttribute(STATUS_ATTR);
    }
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
  const elements = new Map([
    [INPUT_ID, input],
    [PANEL_ID, panel],
    [HINPUT_ID, hidden]
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
    addEventListener() {},
    dispatchEvent() {
      return true;
    }
  };
  return { document, input, hidden, panel, attrs };
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
