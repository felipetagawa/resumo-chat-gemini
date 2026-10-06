const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const extensionRoot = path.resolve(process.cwd());
const STORAGE_KEY = "atendeai_recovery_buffers_v1";

function selectorMatches(element, selector) {
  return selector.split(",").some((part) => matchesComplex(element, part.trim()));
}

function matchesComplex(element, selector) {
  const parts = selector.split(/\s+/).filter(Boolean);
  let current = element;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (index === parts.length - 1) {
      if (!matchesCompound(current, parts[index])) return false;
      continue;
    }
    current = current.parentElement;
    while (current && !matchesCompound(current, parts[index])) current = current.parentElement;
    if (!current) return false;
  }
  return true;
}

function matchesCompound(element, compound) {
  const attributes = [...compound.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)];
  if (!attributes.every(([, name, value]) => value == null
    ? element.getAttribute(name) != null : element.getAttribute(name) === value)) return false;
  compound = compound.replace(/\[[^\]]+\]/g, "");
  const tokens = compound.match(/[.#]?[A-Za-z_][\w-]*/g);
  if (!tokens || tokens.join("") !== compound) return false;
  return tokens.every((token) => {
    if (token.startsWith(".")) return element.className.split(/\s+/).filter(Boolean).includes(token.slice(1));
    if (token.startsWith("#")) return element.id === token.slice(1);
    return element.tagName === token.toLowerCase();
  });
}

class MiniNode {
  constructor(tag) {
    this.tagName = String(tag || "div").toLowerCase();
    this.attrs = {};
    this.className = "";
    this.id = "";
    this.children = [];
    this.parentElement = null;
    this.textContent = "";
    this.value = "";
    this.disabled = false;
    this.type = "";
    this.rows = 0;
    this.style = {};
    this.listeners = {};
  }

  getAttribute(name) {
    if (name === "id") return this.id || null;
    if (name === "class") return this.className || null;
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }

  setAttribute(name, value) {
    const stringValue = String(value);
    if (name === "id") this.id = stringValue;
    else if (name === "class") this.className = stringValue;
    else this.attrs[name] = stringValue;
  }

  appendChild(child) {
    if (child.parentElement) {
      child.parentElement.children = child.parentElement.children.filter((item) => item !== child);
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  prepend(child) {
    this.appendChild(child);
    this.children.unshift(this.children.pop());
  }

  setPointerCapture() {}

  contains(node) {
    return node === this || this.children.some(child => child.contains(node));
  }

  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((item) => item !== this);
    this.parentElement = null;
  }

  addEventListener(type, fn) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(fn);
  }

  querySelectorAll(selector) {
    const matches = [];
    const walk = (node) => {
      node.children.forEach((child) => {
        if (selectorMatches(child, selector)) matches.push(child);
        walk(child);
      });
    };
    walk(this);
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  click() {
    return (this.listeners.click || []).map((fn) => fn({ type: "click", target: this }));
  }
}

function el(tag, attrs = {}, children = []) {
  const node = new MiniNode(tag);
  if (attrs.class) node.className = attrs.class;
  if (attrs.id) node.id = attrs.id;
  if (attrs.text != null) node.textContent = attrs.text;
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === "class" || key === "id" || key === "text") return;
    node.setAttribute(key, value);
  });
  children.forEach((child) => node.appendChild(child));
  return node;
}

function descendants(node) {
  const all = [];
  node.children.forEach((child) => {
    all.push(child);
    all.push(...descendants(child));
  });
  return all;
}

function createDocument() {
  const body = new MiniNode("body");
  const listeners = [];
  const document = {
    body,
    hidden: false,
    listeners,
    createElement(tag) {
      return new MiniNode(tag);
    },
    getElementById(id) {
      return descendants(body).find((node) => node.id === id) || null;
    },
    querySelector(selector) {
      return document.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      return descendants(body).filter((node) => selectorMatches(node, selector));
    },
    addEventListener(type, fn) {
      listeners.push({ type, fn });
    }
  };
  return document;
}

function collect(node) {
  return [node, ...node.children.flatMap((child) => collect(child))];
}

function textOf(node) {
  return collect(node).map((item) => item.textContent || "").filter(Boolean).join("\n");
}

function lines(count, prefix) {
  return Array.from({ length: count }, (_, index) => `${prefix}: mensagem ${index + 1}`).join("\n");
}

function loadRecoveryModule({ realObservations = false } = {}) {
  const source = fs.readFileSync(path.join(extensionRoot, "modules/recovery-buffer.js"), "utf8")
    .replace(/\r\n/g, "\n");
  const document = createDocument();
  const store = {};
  const errors = [];
  const alerts = [];
  const sent = [];
  const shown = [];
  const windowListeners = [];
  const live = { transcript: "", name: "", summary: "", note: "" };
  const timers = [];
  let timerSeq = 0;
  let failWrites = false;
  let failReads = false;
  let writeCount = 0;
  let fetchCalls = 0;
  let complementCalls = 0;
  let observed = null;
  let clock = new Date(2026, 9, 6, 14, 32, 0, 0).getTime();
  const runtime = { lastError: null };

  class FakeDate extends Date {
    static now() {
      return clock;
    }
  }

  const chrome = {
    runtime,
    storage: {
      local: {
        get(keys, callback) {
          if (failReads) {
            runtime.lastError = { message: "storage unavailable" };
            callback({});
            runtime.lastError = null;
            return;
          }
          const names = Array.isArray(keys) ? keys : Object.keys(keys || {});
          const result = {};
          names.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(store, key)) {
              result[key] = JSON.parse(JSON.stringify(store[key]));
            }
          });
          callback(result);
        },
        set(obj, callback) {
          if (failWrites) {
            runtime.lastError = { message: "quota exceeded" };
            callback();
            runtime.lastError = null;
            return;
          }
          Object.entries(obj).forEach(([key, value]) => {
            store[key] = JSON.parse(JSON.stringify(value));
          });
          writeCount += 1;
          callback();
        }
      }
    }
  };

  const context = {
    window: {
      innerWidth: 1280,
      innerHeight: 800,
      addEventListener(type, fn) {
        windowListeners.push({ type, fn });
      }
    },
    document,
    console: {
      error(...args) {
        errors.push(args.map((item) => String(item)).join(" "));
      },
      log() {}
    },
    chrome,
    Date: FakeDate,
    crypto: globalThis.crypto,
    setTimeout(fn, ms) {
      const id = ++timerSeq;
      timers.push({ id, fn, ms });
      return id;
    },
    clearTimeout(id) {
      const index = timers.findIndex((timer) => timer.id === id);
      if (index >= 0) timers.splice(index, 1);
    },
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
      }

      observe(target, options) {
        observed = { target, options };
      }

      disconnect() {}
    },
    alert(message) {
      alerts.push(String(message));
    },
    fetch() {
      fetchCalls += 1;
      throw new Error("network");
    },
    ChatCaptureModule: {
      capturarTextoChat() {
        return live.transcript;
      },
      capturarNomeCliente() {
        return live.name;
      }
    },
    ObservationsModule: {
      getCurrentObservationSnapshot() {
        return {
          summaryObservation: live.summary,
          privateNote: live.note
        };
      },
      getPromptComplementForCurrentChat() {
        complementCalls += 1;
        return "observacao do chat aberto";
      }
    },
    MessagingHelper: {
      async send(payload) {
        sent.push(JSON.parse(JSON.stringify(payload)));
        return { resumo: "resumo pronto" };
      }
    },
    SummaryModule: {
      exibirResumo(texto, clientName) {
        shown.push({ texto, clientName });
      }
    },
    navigator: {
      clipboard: {
        async writeText() {
          return undefined;
        }
      }
    }
  };

  vm.createContext(context);
  let observationLoad = null;
  if (realObservations) {
    context.StorageHelper = {
      get() {
        if (observationLoad) return observationLoad;
        return Promise.resolve({ atendeai_chat_observations: store.observations || {} });
      },
      async set(data) { store.observations = data.atendeai_chat_observations; }
    };
    const observationSource = fs.readFileSync(path.join(extensionRoot, "modules/observations.js"), "utf8")
      .replace("    init,", "    syncChatContext, scheduleSave, init,");
    vm.runInContext(observationSource, context);
    context.ObservationsModule = context.window.ObservationsModule;
    context.window.ChatCaptureModule = context.ChatCaptureModule;
  }
  vm.runInContext(source, context, { filename: "recovery-buffer.js" });

  return {
    module: context.window.RecoveryBufferModule,
    observations: context.window.ObservationsModule,
    deferObservationLoad() {
      let resolve;
      observationLoad = new Promise((done) => { resolve = done; });
      return () => { resolve({ atendeai_chat_observations: store.observations }); observationLoad = null; };
    },
    document,
    window: context.window,
    live,
    store,
    errors,
    alerts,
    sent,
    shown,
    windowListeners,
    writes: () => writeCount,
    fetchCalls: () => fetchCalls,
    complementCalls: () => complementCalls,
    observed: () => observed,
    setNow(value) {
      clock = value;
    },
    now: () => clock,
    setFailWrites(value) {
      failWrites = value;
    },
    setFailReads(value) {
      failReads = value;
    },
    async flushTimers() {
      const due = timers.splice(0, timers.length);
      for (const timer of due) await timer.fn();
      await new Promise(setImmediate);
    }
  };
}

function storedBuffers(harness) {
  return harness.store[STORAGE_KEY]?.buffers || [];
}

test("captura inicial e mutacao atualizam o buffer local sem rede nem IA", async () => {
  const harness = loadRecoveryModule();
  harness.live.name = "Gabriel";
  harness.live.transcript = "Gabriel: oi";
  harness.live.summary = "observacao a";
  harness.live.note = "nota privada";

  harness.module.init();
  assert.equal(harness.writes(), 0);
  assert.equal(harness.observed().options.subtree, true);
  assert.equal(harness.fetchCalls(), 0);
  assert.equal(harness.sent.length, 0);

  harness.document.hidden = true;
  const visibility = harness.document.listeners.find((listener) => listener.type === "visibilitychange");
  await visibility.fn();

  assert.equal(harness.writes(), 1);
  assert.equal(harness.fetchCalls(), 0);
  assert.equal(harness.sent.length, 0);
  assert.equal(harness.complementCalls(), 0);
  assert.equal(storedBuffers(harness)[0].transcript, "Gabriel: oi");
  assert.equal(storedBuffers(harness)[0].summaryObservation, "observacao a");
  assert.equal(storedBuffers(harness)[0].privateNote, "nota privada");

  harness.document.hidden = false;
  harness.live.transcript = "Gabriel:  oi";
  harness.module.__test.scheduleCapture();
  await harness.flushTimers();
  assert.equal(harness.writes(), 1);

  harness.live.transcript = "Gabriel: oi\nGabriel: segunda";
  harness.module.__test.scheduleCapture();
  await harness.flushTimers();
  assert.equal(harness.writes(), 2);
  assert.equal(storedBuffers(harness)[0].transcript, "Gabriel: oi\nGabriel: segunda");
  assert.equal(harness.fetchCalls(), 0);
  assert.equal(harness.sent.length, 0);
});

test("observacao alterada grava mesmo com o transcript igual", async () => {
  const harness = loadRecoveryModule();
  harness.live.name = "Gabriel";
  harness.live.transcript = "Gabriel: oi";
  harness.live.summary = "observacao a";
  harness.live.note = "nota a";

  harness.module.__test.scheduleCapture();
  await harness.flushTimers();
  assert.equal(harness.writes(), 1);

  harness.live.summary = "observacao b";
  harness.module.__test.scheduleCapture();
  await harness.flushTimers();

  assert.equal(harness.writes(), 2);
  assert.equal(storedBuffers(harness)[0].transcript, "Gabriel: oi");
  assert.equal(storedBuffers(harness)[0].summaryObservation, "observacao b");
  assert.equal(storedBuffers(harness)[0].privateNote, "nota a");
  assert.equal(harness.sent.length, 0);
});

test("debounce segura a gravacao e nao regrava transcript igual", async () => {
  const harness = loadRecoveryModule();
  harness.live.name = "Gabriel";
  harness.live.transcript = "Gabriel: oi";

  const scheduled = harness.module.__test.scheduleCapture();
  assert.equal(harness.writes(), 0);
  assert.equal(harness.module.__test.DEBOUNCE_MS, 750);
  await scheduled;
  assert.equal(harness.writes(), 0);
  await harness.flushTimers();
  assert.equal(harness.writes(), 1);

  harness.module.__test.scheduleCapture();
  await harness.flushTimers();
  assert.equal(harness.writes(), 1);
});

test("sumir o historico grava o snapshot pendente e nao persiste transcript vazio", async () => {
  const harness = loadRecoveryModule();
  harness.live.name = "Gabriel";
  harness.live.transcript = "Gabriel: antes de fechar";
  harness.module.__test.scheduleCapture();
  assert.equal(harness.writes(), 0);

  harness.live.transcript = "";
  harness.live.name = "";
  await harness.module.__test.scheduleCapture();
  assert.equal(harness.writes(), 1);
  assert.equal(storedBuffers(harness)[0].transcript, "Gabriel: antes de fechar");

  const empty = await harness.module.__test.scheduleCapture();
  await empty;
  await harness.flushTimers();
  assert.equal(harness.writes(), 1);
});

test("troca de nome abre outro buffer e o mesmo nome continua na sessao aberta", async () => {
  const harness = loadRecoveryModule();
  harness.live.name = "Gabriel";
  harness.live.transcript = "Gabriel: um";
  harness.module.__test.scheduleCapture();

  harness.live.name = "Maria";
  harness.live.transcript = "Maria: dois";
  await harness.module.__test.scheduleCapture();
  assert.equal(storedBuffers(harness).map((buffer) => buffer.displayName).join(","), "Gabriel");

  await harness.flushTimers();
  const names = storedBuffers(harness).map((buffer) => buffer.displayName).sort();
  assert.deepEqual(names, ["Gabriel", "Maria"]);
});

test("nome igual sem id estavel nao reaproveita buffer depois que a sessao reinicia", async () => {
  const harness = loadRecoveryModule();
  assert.equal(harness.module.__test.resolveSourceId(harness.document), "");

  await harness.module.__test.persistSnapshot({
    sourceId: "",
    displayName: "Gabriel",
    transcript: "Gabriel: primeira",
    summaryObservation: "",
    privateNote: ""
  });

  harness.module.__test.resetSession();
  await harness.module.__test.persistSnapshot({
    sourceId: "",
    displayName: "Gabriel",
    transcript: "Gabriel: segunda",
    summaryObservation: "",
    privateNote: ""
  });

  const buffers = storedBuffers(harness);
  assert.equal(buffers.length, 2);
  assert.equal(new Set(buffers.map((buffer) => buffer.bufferId)).size, 2);
  assert.deepEqual(buffers.map((buffer) => buffer.transcript).sort(), [
    "Gabriel: primeira",
    "Gabriel: segunda"
  ]);
});

test("card ativo tem prioridade sobre atributos da mensagem e sobrevive a reinicio", async () => {
  const harness = loadRecoveryModule();
  const message = el("div", { class: "msg" });
  harness.document.body.appendChild(el("div", { "data-chat-id": "chat-42" }, [message]));
  harness.document.body.appendChild(el("div", {
    class: "sz_contact active",
    "data-chat-id": "chat-42"
  }));

  message.setAttribute("data-chat-id", "mensagem-nao-e-card");
  assert.equal(harness.module.__test.resolveSourceId(harness.document), "data-chat-id:chat-42");

  harness.live.name = "Gabriel";
  harness.live.transcript = "Gabriel: oi";
  harness.module.__test.scheduleCapture();
  await harness.flushTimers();
  const first = storedBuffers(harness)[0];
  assert.equal(first.sourceId, "data-chat-id:chat-42");

  harness.module.__test.resetSession();
  harness.live.name = "Gabriel atualizado";
  harness.live.transcript = "Gabriel: oi\nGabriel: depois";
  harness.module.__test.scheduleCapture();
  await harness.flushTimers();

  assert.equal(storedBuffers(harness).length, 1);
  assert.equal(storedBuffers(harness)[0].bufferId, first.bufferId);
  assert.equal(storedBuffers(harness)[0].displayName, "Gabriel atualizado");
  assert.equal(storedBuffers(harness)[0].sourceId, "data-chat-id:chat-42");
});

test("id de card e telefone nao viram identidade; protocolo tambem nao", () => {
  const harness = loadRecoveryModule();
  harness.document.body.appendChild(el("div", {
    class: "sz_contact active",
    id: "5511999999999"
  }));
  harness.document.body.appendChild(el("header", { text: "protocolo: ABC-123" }));
  assert.equal(harness.module.__test.resolveSourceId(harness.document), "");

  harness.document.body.appendChild(el("div", {
    class: "chats-list"
  }, [
    el("div", { class: "chat active", "data-chat-id": "lista-7" })
  ]));
  assert.equal(harness.module.__test.resolveSourceId(harness.document), "");
  harness.document.querySelector(".sz_contact.active").remove();
  assert.equal(harness.module.__test.resolveSourceId(harness.document), "data-chat-id:lista-7");
});

test("card ativo reutiliza data-contact-id quando a conversa nao tem atributo estavel", () => {
  const harness = loadRecoveryModule();
  harness.document.body.appendChild(el("div", { class: "msg" }));
  harness.document.body.appendChild(el("div", {
    class: "sz_contact selected",
    "data-id": "5511999999999",
    "data-contact-id": "contato-9"
  }));

  assert.equal(harness.module.__test.resolveSourceId(harness.document), "data-contact-id:contato-9");
});

test("anydesk so entra como metadado quando o contexto cita o termo", async () => {
  const harness = loadRecoveryModule();
  const transcript = "Cliente: meu AnyDesk é 123 456 789 e o pedido 12345";
  assert.equal(harness.module.__test.detectAnydeskCandidate(transcript), "123 456 789");
  assert.equal(
    harness.module.__test.detectAnydeskCandidate("Cliente: liga no 11988887777"),
    null
  );

  await harness.module.__test.persistSnapshot({
    sourceId: "data-chat-id:chat-42",
    displayName: "Gabriel",
    transcript,
    summaryObservation: "",
    privateNote: ""
  });

  const buffer = storedBuffers(harness)[0];
  assert.equal(buffer.anydeskCandidate, "123 456 789");
  assert.match(buffer.transcript, /123 456 789/);
  assert.match(buffer.transcript, /12345/);
});

test("buffers vencidos saem e o maximo fica em 10", async () => {
  const harness = loadRecoveryModule();
  const now = harness.now();
  const ttl = harness.module.__test.TTL_MS;

  await harness.module.__test.persistSnapshot({
    sourceId: "data-chat-id:velho",
    displayName: "Velho",
    transcript: "Velho: expirado",
    summaryObservation: "",
    privateNote: ""
  }, now - ttl);

  await harness.module.__test.persistSnapshot({
    sourceId: "data-chat-id:novo",
    displayName: "Novo",
    transcript: "Novo: valido",
    summaryObservation: "",
    privateNote: ""
  }, now);

  assert.deepEqual(storedBuffers(harness).map((buffer) => buffer.sourceId), ["data-chat-id:novo"]);

  for (let index = 0; index < 11; index += 1) {
    await harness.module.__test.persistSnapshot({
      sourceId: `data-chat-id:c${index}`,
      displayName: `Cliente ${index}`,
      transcript: `Cliente: conversa ${index}`,
      summaryObservation: "",
      privateNote: ""
    }, now + (index + 1) * 1000);
  }

  const ids = storedBuffers(harness).map((buffer) => buffer.sourceId);
  assert.equal(ids.length, harness.module.__test.MAX_BUFFERS);
  assert.equal(ids.includes("data-chat-id:c0"), false);
  assert.equal(ids.includes("data-chat-id:c10"), true);
  assert.equal(harness.store[STORAGE_KEY].version, 1);
});

test("limpeza remove buffer com idade igual ao ttl e mantem o mais novo", async () => {
  const harness = loadRecoveryModule();
  const now = harness.now();
  const ttl = harness.module.__test.TTL_MS;

  await harness.module.__test.persistSnapshot({
    sourceId: "data-chat-id:exato",
    displayName: "Exato",
    transcript: "Exato: limite",
    summaryObservation: "",
    privateNote: ""
  }, now - ttl);
  await harness.module.__test.persistSnapshot({
    sourceId: "data-chat-id:dentro",
    displayName: "Dentro",
    transcript: "Dentro: ok",
    summaryObservation: "",
    privateNote: ""
  }, now - ttl + 1);

  const result = await harness.module.__test.cleanup(now);
  assert.equal(result.ok, true);
  assert.deepEqual(storedBuffers(harness).map((buffer) => buffer.displayName), ["Dentro"]);
});

test("falha de storage nao confirma persistencia e o seletor nao oferece o buffer", async () => {
  const harness = loadRecoveryModule();
  harness.setFailWrites(true);

  const result = await harness.module.__test.persistSnapshot({
    sourceId: "data-chat-id:chat-42",
    displayName: "Gabriel",
    transcript: "Gabriel: oi",
    summaryObservation: "observacao a",
    privateNote: "nota"
  });

  assert.equal(result.ok, false);
  assert.equal(result.persisted, false);
  assert.equal(harness.store[STORAGE_KEY], undefined);
  assert.match(harness.errors.join("\n"), /Não foi possível salvar o buffer de recuperação/);
  assert.equal(harness.alerts.length, 0);
  assert.equal(harness.sent.length, 0);

  harness.setFailWrites(false);
  await harness.module.openReportFallback();
  const panel = harness.document.getElementById("atendeai-recovery-report-fallback");
  const panelText = textOf(panel);
  assert.match(panelText, /Conversa atual/);
  assert.match(panelText, /indisponível/);
  assert.match(panelText, /Nenhuma conversa preservada/);
  assert.doesNotMatch(panelText, /Gabriel — hoje/);
});

test("seletor usa nome e horario do buffer e o relatorio segue pelo SummaryModule", async () => {
  const harness = loadRecoveryModule();
  const now = new Date(2026, 9, 6, 14, 32, 0, 0).getTime();
  const yesterday = new Date(2026, 9, 5, 23, 10, 0, 0).getTime();
  harness.setNow(now);

  const gabrielTranscript = [
    "Gabriel: AnyDesk 123 456 789",
    ...Array.from({ length: 11 }, (_, index) => `Gabriel: mensagem ${index + 2}`)
  ].join("\n");
  const mariaTranscript = lines(27, "Maria");
  const mariaAt = new Date(2026, 9, 6, 13, 58, 0, 0).getTime();

  assert.equal(
    harness.module.formatBufferLabel({
      displayName: "Maria",
      updatedAt: yesterday
    }, now),
    "Maria — 05/10 23:10"
  );

  await harness.module.__test.persistSnapshot({
    sourceId: "data-chat-id:gabriel",
    displayName: "Gabriel",
    transcript: gabrielTranscript,
    summaryObservation: "observacao A",
    privateNote: "NOTA-PRIVADA-NAO-ENVIAR"
  }, now);
  await harness.module.__test.persistSnapshot({
    sourceId: "data-chat-id:maria",
    displayName: "Maria",
    transcript: mariaTranscript,
    summaryObservation: "observacao M",
    privateNote: "nota da maria"
  }, mariaAt);

  harness.live.summary = "observacao do chat aberto";
  harness.live.note = "nota do chat aberto";
  await harness.module.openReportFallback();

  const panel = harness.document.getElementById("atendeai-recovery-report-fallback");
  const panelText = textOf(panel);
  assert.match(panelText, /Gerar relatório/);
  assert.match(panelText, /Conversa atual/);
  assert.match(panelText, /indisponível/);
  assert.match(panelText, /Conversas preservadas/);
  assert.match(panelText, /Gabriel — hoje 14:32/);
  assert.match(panelText, /12 mensagens/);
  assert.match(panelText, /Maria — hoje 13:58/);
  assert.match(panelText, /27 mensagens/);
  assert.match(panelText, /AnyDesk: 123 456 789/);
  assert.match(panelText, /NOTA-PRIVADA-NAO-ENVIAR/);

  const gabrielItem = collect(panel).find((node) => {
    return node.className === "recovery-buffer-item" && textOf(node).includes("Gabriel — hoje 14:32");
  });
  const observation = gabrielItem.querySelector("textarea");
  observation.value = "observacao A editada";
  const generateButton = collect(gabrielItem).find((node) => {
    return node.tagName === "button" && node.textContent === "Gerar relatório";
  });

  await Promise.all(generateButton.click());

  assert.equal(harness.complementCalls(), 0);
  assert.equal(harness.sent.length, 1);
  assert.deepEqual(harness.sent[0], {
    action: "gerarResumo",
    texto: gabrielTranscript,
    promptComplement: "observacao A editada"
  });
  assert.equal(Object.hasOwn(harness.sent[0], "privateNote"), false);
  assert.doesNotMatch(JSON.stringify(harness.sent[0]), /NOTA-PRIVADA-NAO-ENVIAR/);
  assert.doesNotMatch(JSON.stringify(harness.sent[0]), /observacao do chat aberto/);
  assert.doesNotMatch(JSON.stringify(harness.sent[0]), /nota da maria/);
  assert.match(harness.sent[0].texto, /123 456 789/);
  assert.deepEqual(harness.shown, [{ texto: "resumo pronto", clientName: "Gabriel" }]);

  const gabriel = storedBuffers(harness).find((buffer) => buffer.sourceId === "data-chat-id:gabriel");
  assert.equal(gabriel.summaryObservation, "observacao A editada");
  assert.equal(gabriel.privateNote, "NOTA-PRIVADA-NAO-ENVIAR");
});

test("excluir remove so o buffer escolhido", async () => {
  const harness = loadRecoveryModule();
  const now = harness.now();
  await harness.module.__test.persistSnapshot({
    sourceId: "data-chat-id:gabriel",
    displayName: "Gabriel",
    transcript: "Gabriel: oi",
    summaryObservation: "",
    privateNote: "nota gabriel"
  }, now);
  await harness.module.__test.persistSnapshot({
    sourceId: "data-chat-id:maria",
    displayName: "Maria",
    transcript: "Maria: oi",
    summaryObservation: "",
    privateNote: "nota maria"
  }, now - 1000);

  await harness.module.openReportFallback();
  const panel = harness.document.getElementById("atendeai-recovery-report-fallback");
  const mariaItem = collect(panel).find((node) => {
    return node.className === "recovery-buffer-item" && textOf(node).includes("Maria —");
  });
  const deleteButton = collect(mariaItem).find((node) => node.textContent === "Excluir");
  await Promise.all(deleteButton.click());

  assert.deepEqual(storedBuffers(harness).map((buffer) => buffer.displayName), ["Gabriel"]);
  const nextPanel = harness.document.getElementById("atendeai-recovery-report-fallback");
  assert.match(textOf(nextPanel), /Gabriel — hoje 14:32/);
  assert.doesNotMatch(textOf(nextPanel), /Maria —/);
});

test("payload de relatorio copia so texto e observacao do buffer", () => {
  const harness = loadRecoveryModule();
  const request = harness.module.buildReportRequest({
    bufferId: "rb_1",
    sourceId: "data-chat-id:chat-42",
    displayName: "Gabriel",
    transcript: "Gabriel: oi",
    summaryObservation: "observacao A",
    privateNote: "NOTA-PRIVADA-NAO-ENVIAR",
    anydeskCandidate: "123 456 789"
  });

  assert.deepEqual(JSON.parse(JSON.stringify(request)), {
    action: "gerarResumo",
    texto: "Gabriel: oi",
    promptComplement: "observacao A"
  });

  const withoutObservation = harness.module.buildReportRequest({
    transcript: "Gabriel: oi",
    summaryObservation: "   ",
    privateNote: "NOTA-PRIVADA-NAO-ENVIAR"
  });
  assert.deepEqual(JSON.parse(JSON.stringify(withoutObservation)), {
    action: "gerarResumo",
    texto: "Gabriel: oi"
  });
});

test("buffer A preservado com chat B aberto gera o relatorio de A", async () => {
  const harness = loadRecoveryModule();
  const now = harness.now();
  const transcriptA = "Gabriel: preciso do relatorio deste atendimento";

  await harness.module.__test.persistSnapshot({
    sourceId: "data-chat-id:atendimento-a",
    displayName: "Gabriel",
    transcript: transcriptA,
    summaryObservation: "observacao A",
    privateNote: "NOTA-PRIVADA-A"
  }, now);

  harness.live.name = "Maria";
  harness.live.transcript = "Maria: este e o chat B aberto";
  harness.live.summary = "observacao B";
  harness.live.note = "nota privada B";

  await harness.module.openPreservedBuffers();
  const panel = harness.document.getElementById("atendeai-recovery-report-fallback");
  const panelText = textOf(panel);
  assert.match(panelText, /Conversas preservadas/);
  assert.match(panelText, /Gabriel — hoje 14:32/);
  assert.doesNotMatch(panelText, /indisponível/);
  assert.doesNotMatch(panelText, /Maria — hoje/);

  const gabrielItem = collect(panel).find((node) => {
    return node.className === "recovery-buffer-item" && textOf(node).includes("Gabriel — hoje 14:32");
  });
  const generateButton = collect(gabrielItem).find((node) => {
    return node.tagName === "button" && node.textContent === "Gerar relatório";
  });
  await Promise.all(generateButton.click());

  assert.equal(harness.complementCalls(), 0);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.sent[0])), {
    action: "gerarResumo",
    texto: transcriptA,
    promptComplement: "observacao A"
  });
  assert.doesNotMatch(JSON.stringify(harness.sent[0]), /NOTA-PRIVADA-A/);
  assert.doesNotMatch(JSON.stringify(harness.sent[0]), /observacao B/);
  assert.doesNotMatch(JSON.stringify(harness.sent[0]), /chat B aberto/);
  assert.deepEqual(harness.shown, [{ texto: "resumo pronto", clientName: "Gabriel" }]);
});

test("content e manifest ligam o fallback sem permissao nova", () => {
  const content = fs.readFileSync(path.join(extensionRoot, "content.js"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, "manifest.json"), "utf8"));
  const scripts = manifest.content_scripts[0].js;

  const reportStart = content.indexOf("const botaoResumo");
  const reportEnd = content.indexOf("const botaoConversasPreservadas");
  const report = content.slice(reportStart, reportEnd);

  assert.match(content, /RecoveryBufferModule\.init\(\)/);
  assert.match(report, /if \(!texto\)/);
  assert.match(report, /RecoveryBufferModule\.openReportFallback\(\)/);
  assert.doesNotMatch(report, /openPreservedBuffers/);
  assert.doesNotMatch(report, /Não foi possível capturar o texto do chat/);
  assert.match(content, /id = "btnConversasPreservadas"/);
  assert.match(content, /RecoveryBufferModule\.openPreservedBuffers\(\)/);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.ok(scripts.indexOf("modules/recovery-buffer.js") > scripts.indexOf("modules/observations.js"));
  assert.ok(scripts.indexOf("modules/recovery-buffer.js") < scripts.indexOf("content.js"));
});


test("R1/R3: load de B nao mistura observacoes de A e notifica o buffer ao concluir", async () => {
  const h = loadRecoveryModule({ realObservations: true });
  h.store.observations = {
    "contact:gabriel": { promptComplement: "OBS-A", observationText: "PRIVATE-A" },
    "contact:maria": { promptComplement: "OBS-B", observationText: "PRIVATE-B" }
  };
  h.live.name = "Gabriel";
  h.live.transcript = "Gabriel: oi";
  await h.observations.syncChatContext();
  h.module.init();
  await h.flushTimers();
  assert.equal(storedBuffers(h)[0].summaryObservation, "OBS-A");
  assert.equal(storedBuffers(h)[0].privateNote, "PRIVATE-A");

  h.live.name = "Maria";
  h.live.transcript = "Maria: oi";
  // Capture even before Observations' own observer has processed the DOM switch.
  await h.module.__test.scheduleCapture();
  await h.flushTimers();
  assert.equal(storedBuffers(h).find((b) => b.displayName === "Maria").summaryObservation, "");
  const finishLoad = h.deferObservationLoad();
  const loading = h.observations.syncChatContext();
  await h.module.__test.scheduleCapture();
  await h.flushTimers();
  const pendingB = storedBuffers(h).find((b) => b.displayName === "Maria");
  assert.equal(pendingB.summaryObservation, "");
  assert.equal(pendingB.privateNote, "");

  finishLoad();
  await loading;
  await h.flushTimers();
  const loadedB = storedBuffers(h).find((b) => b.displayName === "Maria");
  assert.equal(loadedB.summaryObservation, "OBS-B");
  assert.equal(loadedB.privateNote, "PRIVATE-B");
  assert.deepEqual(JSON.parse(JSON.stringify(h.module.buildReportRequest(loadedB))), {
    action: "gerarResumo", texto: "Maria: oi", promptComplement: "OBS-B"
  });
  assert.equal(h.sent.length, 0);
});

test("R2: debounce pendente salva valores e meta de A mesmo depois da troca para B", async () => {
  const h = loadRecoveryModule({ realObservations: true });
  h.store.observations = {};
  h.live.name = "Gabriel";
  await h.observations.syncChatContext();
  const note = el("textarea", { id: "atendeai-observation-text" });
  const summary = el("textarea", { id: "atendeai-prompt-complement" });
  h.document.body.appendChild(note);
  h.document.body.appendChild(summary);
  note.value = "PRIVATE-A editada";
  summary.value = "OBS-A editada";
  h.observations.scheduleSave();
  h.live.name = "Maria";
  await h.observations.syncChatContext();
  await h.flushTimers();
  assert.ok(h.store.observations["contact:gabriel"], "a edicao deve ser salva em Gabriel");
  assert.equal(h.store.observations["contact:gabriel"].promptComplement, "OBS-A editada");
  assert.equal(h.store.observations["contact:gabriel"].observationText, "PRIVATE-A editada");
  assert.equal(h.store.observations["contact:gabriel"].contactName, "Gabriel");
  assert.equal(h.store.observations["contact:maria"], undefined);
});


test("R2: save ja iniciado conserva A quando o read de storage termina com B aberto", async () => {
  const h = loadRecoveryModule({ realObservations: true });
  h.store.observations = {};
  h.live.name = "Gabriel";
  await h.observations.syncChatContext();
  const note = el("textarea", { id: "atendeai-observation-text" });
  const summary = el("textarea", { id: "atendeai-prompt-complement" });
  h.document.body.appendChild(note);
  h.document.body.appendChild(summary);
  note.value = "PRIVATE-A";
  summary.value = "OBS-A";
  h.observations.scheduleSave();
  const finishRead = h.deferObservationLoad();
  const saving = h.flushTimers();
  h.live.name = "Maria";
  const switching = h.observations.syncChatContext();
  finishRead();
  await Promise.all([saving, switching]);
  assert.ok(h.store.observations["contact:gabriel"], "o save em andamento pertence a Gabriel");
  assert.equal(h.store.observations["contact:gabriel"].promptComplement, "OBS-A");
  assert.equal(h.store.observations["contact:gabriel"].contactName, "Gabriel");
  assert.equal(h.store.observations["contact:maria"], undefined);
  assert.equal(h.observations.getCurrentObservationSnapshot().summaryObservation, "");
});

function attendanceCard({ name = 'CASSIA TAIS FIGURA', platform = 'webchat', timestamp = '06/10/26 08:14' } = {}) {
  return el('div', { class: 'sz_contact active' }, [
    el('div', { class: 'contact-name', text: name }),
    el('div', { class: 'contact-times', phase: 'attendance' }, [
      el('span', { class: 'times', title: timestamp, text: '08:14' })
    ]),
    el('img', { alt: 'platform', src: `/assets/img/platform/mini/${platform}.svg` })
  ]);
}

test('I1: reabrir, trocar de chat, rerender e recarregar reutiliza um buffer por atendimento', async () => {
  const h = loadRecoveryModule();
  h.live.name = 'CASSIA TAIS FIGURA';
  let firstId;
  for (let i = 0; i < 3; i++) {
    h.document.querySelector('.sz_contact.active')?.remove();
    h.document.body.appendChild(attendanceCard());
    h.module.__test.resetSession();
    h.live.transcript = `CASSIA: mensagem ${i}`;
    h.module.__test.scheduleCapture();
    await h.flushTimers();
    firstId ||= storedBuffers(h)[0].bufferId;
    assert.equal(storedBuffers(h).length, 1);
    assert.equal(storedBuffers(h)[0].bufferId, firstId);
  }
  assert.equal(storedBuffers(h)[0].sourceId, 'attendance:webchat|cassia tais figura|06/10/26 08:14');
  const reloaded = loadRecoveryModule();
  reloaded.store[STORAGE_KEY] = h.store[STORAGE_KEY];
  reloaded.document.body.appendChild(attendanceCard());
  reloaded.live.name = h.live.name;
  reloaded.live.transcript = 'CASSIA: depois do F5';
  reloaded.module.__test.scheduleCapture();
  await reloaded.flushTimers();
  assert.equal(storedBuffers(reloaded).length, 1);
  assert.equal(storedBuffers(reloaded)[0].bufferId, firstId);
  assert.equal(storedBuffers(reloaded)[0].transcript, 'CASSIA: depois do F5');
  reloaded.document.querySelector('.sz_contact.active').remove();
  reloaded.document.body.appendChild(attendanceCard({ name: 'MARIA' }));
  reloaded.live.name = 'MARIA';
  reloaded.live.transcript = 'MARIA: outro chat';
  reloaded.module.__test.scheduleCapture();
  await reloaded.flushTimers();
  reloaded.document.querySelector('.sz_contact.active').remove();
  reloaded.document.body.appendChild(attendanceCard());
  reloaded.live.name = h.live.name;
  reloaded.live.transcript = 'CASSIA: voltei';
  reloaded.module.__test.scheduleCapture();
  await reloaded.flushTimers();
  assert.equal(storedBuffers(reloaded).length, 2);
  const cassia = storedBuffers(reloaded).filter(b => b.sourceId.includes('cassia'));
  assert.equal(cassia.length, 1);
  assert.equal(cassia[0].bufferId, firstId);
  assert.equal(cassia[0].transcript, 'CASSIA: voltei');
});

for (const [label, variant] of [
  ['I2: outro timestamp separa atendimentos do mesmo nome', { timestamp: '06/10/26 09:14' }],
  ['I3: outra plataforma separa nome e timestamp iguais', { platform: 'whatsapp' }]
]) test(label, async () => {
  const h = loadRecoveryModule();
  h.live.name = 'CASSIA TAIS FIGURA';
  for (const attrs of [{}, variant]) {
    h.document.querySelector('.sz_contact.active')?.remove();
    h.document.body.appendChild(attendanceCard(attrs));
    h.live.transcript = 'CASSIA: oi';
    h.module.__test.scheduleCapture();
    await h.flushTimers();
  }
  assert.equal(storedBuffers(h).length, 2);
  assert.equal(new Set(storedBuffers(h).map(b => b.sourceId)).size, 2);
});

test('I4: msg_ref e atributos das mensagens nao alteram assinatura do card', () => {
  const h = loadRecoveryModule();
  h.document.body.appendChild(attendanceCard());
  const msg = el('div', { class: 'msg', id: 'msg_ref_primeira', 'data-chat-id': 'nao-conversa' });
  h.document.body.appendChild(msg);
  assert.equal(h.module.__test.resolveSourceId(), 'attendance:webchat|cassia tais figura|06/10/26 08:14');
  msg.id = 'msg_ref_segunda';
  assert.equal(h.module.__test.resolveSourceId(), 'attendance:webchat|cassia tais figura|06/10/26 08:14');
});

test('I5: assinatura incompleta continua no fallback local sem chave pelo nome', async () => {
  for (const attrs of [{ platform: '' }, { timestamp: '' }, { name: '' }]) {
    const h = loadRecoveryModule();
    h.document.body.appendChild(attendanceCard(attrs));
    h.live.name = 'CASSIA';
    h.live.transcript = 'CASSIA: oi';
    assert.equal(h.module.__test.resolveSourceId(), '');
    h.module.__test.scheduleCapture();
    await h.flushTimers();
    h.live.transcript += '\nCASSIA: depois';
    h.module.__test.scheduleCapture();
    await h.flushTimers();
    assert.equal(storedBuffers(h).length, 1);
    assert.equal(storedBuffers(h)[0].sourceId, '');
  }
});

for (const action of ['overlay', 'Escape', 'X', 'toggle']) test(`painel fecha por ${action} e reabre`, async () => {
  const h = loadRecoveryModule();
  h.module.init();
  await h.module.openPreservedBuffers();
  const panel = h.document.getElementById('atendeai-recovery-report-fallback');
  if (action === 'overlay') {
    const overlay = h.document.getElementById('atendeai-recovery-overlay');
    assert.ok(overlay);
    await Promise.all(overlay.click());
  } else if (action === 'Escape') {
    for (const entry of h.document.listeners.filter(e => e.type === 'keydown')) entry.fn({ key: 'Escape' });
  } else if (action === 'X') await Promise.all(panel.querySelector('button').click());
  else await h.module.openPreservedBuffers();
  assert.equal(h.document.getElementById('atendeai-recovery-report-fallback'), null);
  assert.equal(h.document.getElementById('atendeai-recovery-overlay'), null);
  await h.module.openPreservedBuffers();
  assert.ok(h.document.getElementById('atendeai-recovery-report-fallback'));
});

function loadDock(store = {}, { width = 800, height = 600 } = {}) {
  const source = fs.readFileSync(path.join(extensionRoot, 'content.js'), 'utf8');
  const start = source.indexOf('async function initializeExtensionDock(');
  assert.ok(start >= 0, 'dock deve ter inicializador');
  const end = source.indexOf('\nfunction criarBotoesFlutuantes(', start);
  const document = createDocument();
  const dock = el('div', { id: 'containerBotoesGemini' }, [el('button', { id: 'report', text: 'Gerar Relatório' })]);
  dock.getBoundingClientRect = () => ({ left: (parseFloat(dock.style.left) || 590) * Number(dock.style.zoom || 1), top: (parseFloat(dock.style.top) || 200) * Number(dock.style.zoom || 1),
    width: 190 * Number(dock.style.zoom || 1), height: 350 * Number(dock.style.zoom || 1) });
  document.body.appendChild(dock);
  const listeners = {};
  const window = { innerWidth: width, innerHeight: height,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter(f => f !== fn); } };
  const context = { document, window, console, chrome: { runtime: {}, storage: { local: {
    get(keys, cb) { cb(structuredClone(store)); },
    set(values, cb) { Object.assign(store, structuredClone(values)); cb?.(); }
  } } } };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return { dock, store, window, listeners, ready: context.initializeExtensionDock(dock) };
}

function dispatchNode(node, type, values = {}) {
  for (const fn of node.listeners[type] || []) fn({ target: node, button: 0, pointerId: 1,
    preventDefault() {}, ...values });
}

test('dock inteiro arrasta somente pelo handle e restaura posicao persistida', async () => {
  const h = loadDock();
  await h.ready;
  const handle = h.dock.querySelector('.gemini-dock-handle');
  assert.ok(handle);
  dispatchNode(h.dock.querySelector('#report'), 'pointerdown', { clientX: 600, clientY: 220 });
  assert.equal(h.store.atendeai_dock_preferences, undefined);
  dispatchNode(handle, 'pointerdown', { clientX: 600, clientY: 220 });
  dispatchNode(handle, 'pointermove', { clientX: 300, clientY: 120 });
  dispatchNode(handle, 'pointerup');
  assert.equal(h.dock.style.left, '290px');
  assert.equal(h.dock.style.top, '100px');
  assert.deepEqual(h.store.atendeai_dock_preferences.position, { x: 290, y: 100 });
  const next = loadDock(h.store);
  await next.ready;
  assert.equal(next.dock.style.left, '290px');
  assert.equal(next.dock.style.top, '100px');
});

test('dock limita drag, posicao carregada e resize aos limites do viewport', async () => {
  const h = loadDock({ atendeai_dock_preferences: { position: { x: 9000, y: -500 }, size: 'normal' } });
  await h.ready;
  assert.equal(h.dock.style.left, '602px');
  assert.equal(h.dock.style.top, '8px');
  const handle = h.dock.querySelector('.gemini-dock-handle');
  dispatchNode(handle, 'pointerdown', { clientX: 610, clientY: 10 });
  dispatchNode(handle, 'pointermove', { clientX: -1000, clientY: 5000 });
  dispatchNode(handle, 'pointerup');
  assert.equal(h.dock.style.left, '8px');
  assert.equal(h.dock.style.top, '242px');
  h.window.innerHeight = 400;
  for (const fn of h.listeners.resize) fn();
  assert.equal(h.dock.style.top, '42px');
  assert.deepEqual(h.store.atendeai_dock_preferences.position, { x: 8, y: 42 });
});

test('tres tamanhos do dock persistem e posicao continua acessivel', async () => {
  const h = loadDock();
  await h.ready;
  const control = h.dock.querySelector('.gemini-dock-size');
  assert.equal(h.dock.querySelector('select'), null);
  assert.equal(control.textContent, '100%');
  for (const [size, scale] of [['compact', '0.85'], ['normal', '1'], ['large', '1.15']]) {
    for (let i = 0; i < 3 && control.textContent !== `${Math.round(Number(scale) * 100)}%`; i++) dispatchNode(control, 'click');
    assert.equal(h.dock.style.zoom, scale);
    assert.equal(h.store.atendeai_dock_preferences.size, size);
    const next = loadDock(h.store);
    await next.ready;
    assert.equal(next.dock.style.zoom, scale);
    assert.equal(next.dock.querySelector('.gemini-dock-size').textContent, `${Math.round(Number(scale) * 100)}%`);
  }
});

test('Gerar Relatorio do chat atual envia no primeiro clique sem abrir preservadas', async () => {
  const source = fs.readFileSync(path.join(extensionRoot, 'content.js'), 'utf8');
  const start = source.indexOf('function criarBotoesFlutuantes(');
  const end = source.indexOf('\nMessagingHelper.addListener(', start);
  const document = createDocument();
  const sent = [];
  const shown = [];
  let opened = 0;
  const context = { document, console,
    DOMHelpers: { exists: () => false, createElement(tag, attrs) { return el(tag, { id: attrs.id }); } },
    getIconHTML: () => '', guardFeature: fn => fn, initializeExtensionDock: () => {},
    ChatCaptureModule: { capturarTextoChat: () => 'CASSIA: conversa atual', capturarNomeCliente: () => 'CASSIA' },
    ObservationsModule: { getPromptComplementForCurrentChat: () => 'observacao atual' },
    RecoveryBufferModule: { openReportFallback() { opened++; }, openPreservedBuffers() { opened++; } },
    MessagingHelper: { async send(payload) { sent.push(JSON.parse(JSON.stringify(payload))); return { resumo: 'pronto' }; } },
    SummaryModule: { exibirResumo(...args) { shown.push(args); } },
    MAX_PROMPT_COMPLEMENT_CHARS: 2000,
    alert(message) { assert.fail(message); }
  };
  const originalCreate = document.createElement;
  document.createElement = tag => { const node = originalCreate(tag); node.insertAdjacentHTML = () => {}; return node; };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  context.criarBotoesFlutuantes({ btnResumoGemini: true }, 'suporte');
  const report = document.getElementById('btnResumoGemini');
  const preserved = document.getElementById('btnConversasPreservadas');
  assert.equal(report.parentElement, preserved.parentElement);
  await Promise.all(report.click());
  assert.deepEqual(sent, [{ action: 'gerarResumo', texto: 'CASSIA: conversa atual', promptComplement: 'observacao atual' }]);
  assert.deepEqual(shown, [['pronto', 'CASSIA']]);
  assert.equal(opened, 0);
  assert.equal(report.disabled, false);
  await Promise.all(preserved.click());
  assert.equal(opened, 1);
});

test('buffers sem sourceId nao sao migrados quando o card ganha assinatura', async () => {
  const h = loadRecoveryModule();
  const card = attendanceCard({ timestamp: '' });
  h.document.body.appendChild(card);
  h.live.name = 'CASSIA';
  h.live.transcript = 'CASSIA: legado';
  h.module.__test.scheduleCapture();
  await h.flushTimers();
  const oldId = storedBuffers(h)[0].bufferId;
  card.querySelector('.times').setAttribute('title', '06/10/26 08:14');
  h.live.transcript = 'CASSIA: com assinatura';
  h.module.__test.scheduleCapture();
  await h.flushTimers();
  assert.equal(storedBuffers(h).length, 2);
  const old = storedBuffers(h).find(b => b.bufferId === oldId);
  assert.equal(old.sourceId, '');
  assert.equal(old.transcript, 'CASSIA: legado');
});

test('toggle durante leitura pendente cancela abertura do painel', async () => {
  const h = loadRecoveryModule();
  const pending = h.module.openPreservedBuffers();
  await h.module.openPreservedBuffers();
  await pending;
  assert.equal(h.document.getElementById('atendeai-recovery-report-fallback'), null);
  await h.module.openPreservedBuffers();
  assert.ok(h.document.getElementById('atendeai-recovery-report-fallback'));
});

test('clique em outro controle fora do painel fecha e clique interno preserva', async () => {
  const h = loadRecoveryModule();
  h.module.init();
  await h.module.openPreservedBuffers();
  const panel = h.document.getElementById('atendeai-recovery-report-fallback');
  const clicks = h.document.listeners.filter(e => e.type === 'click');
  for (const entry of clicks) entry.fn({ target: panel.querySelector('strong') });
  assert.ok(h.document.getElementById('atendeai-recovery-report-fallback'));
  for (const entry of clicks) entry.fn({ target: h.document.body });
  assert.equal(h.document.getElementById('atendeai-recovery-report-fallback'), null);
  assert.equal(h.document.getElementById('atendeai-recovery-overlay'), null);
});

test('dock recolhe e restaura sem perder posicao ou tamanho; estado persiste', async () => {
  const h = loadDock({ atendeai_dock_preferences: { position: { x: 100, y: 100 }, size: 'compact' } });
  await h.ready;
  const toggle = h.dock.querySelector('.gemini-dock-toggle');
  assert.ok(toggle);
  dispatchNode(toggle, 'click');
  assert.equal(h.dock.getAttribute('data-minimized'), 'true');
  assert.equal(toggle.getAttribute('aria-label'), 'Restaurar dock');
  assert.equal(h.store.atendeai_dock_preferences.minimized, true);
  assert.equal(h.store.atendeai_dock_preferences.size, 'compact');
  assert.deepEqual(h.store.atendeai_dock_preferences.position, { x: 100, y: 100 });
  const next = loadDock(h.store);
  await next.ready;
  assert.equal(next.dock.getAttribute('data-minimized'), 'true');
  assert.equal(next.dock.style.zoom, '0.85');
  dispatchNode(next.dock.querySelector('.gemini-dock-toggle'), 'click');
  assert.equal(next.dock.getAttribute('data-minimized'), 'false');
  assert.equal(next.dock.querySelector('.gemini-dock-toggle').getAttribute('aria-label'), 'Minimizar dock');
  assert.equal(next.store.atendeai_dock_preferences.minimized, false);
  assert.deepEqual(next.store.atendeai_dock_preferences.position, { x: 100, y: 100 });
});

const PANEL_POSITION_KEY = "atendeai_recovery_panel_position";

function buttonByText(root, text) {
  return collect(root).find((node) => node.tagName === "button" && node.textContent === text);
}

function renderedTranscript(panel) {
  const root = panel.querySelector(".recovery-transcript");
  return root.children.map((row) => {
    const author = row.querySelector(".recovery-transcript-author");
    const text = row.querySelector(".recovery-transcript-text");
    if (author && text) return `${author.textContent}: ${text.textContent}`;
    return row.textContent;
  }).join("\n");
}

function attachPanelRect(panel, size = { width: 420, height: 320 }) {
  panel.getBoundingClientRect = () => ({
    left: Number.isFinite(parseFloat(panel.style.left)) ? parseFloat(panel.style.left) : 100,
    top: Number.isFinite(parseFloat(panel.style.top)) ? parseFloat(panel.style.top) : 80,
    width: size.width,
    height: size.height
  });
}

test("R1/R13: Ver conversa aparece e as iniciais nao viram identidade do buffer", async () => {
  const h = loadRecoveryModule();
  assert.equal(h.module.__test.initialsFromName("CASSIA TAIS FIGURA"), "CTF");
  assert.equal(h.module.__test.initialsFromName("MARIA FERREIRA"), "MF");
  assert.equal(h.module.__test.initialsFromName("Gabriel"), "GA");
  const transcript = "CASSIA TAIS FIGURA: oi";
  await h.module.__test.persistSnapshot({
    sourceId: "data-chat-id:cassia",
    displayName: "CASSIA TAIS FIGURA",
    transcript,
    summaryObservation: "obs",
    privateNote: "nota"
  }, h.now());
  await h.module.__test.persistSnapshot({
    sourceId: "data-chat-id:maria",
    displayName: "MARIA FERREIRA",
    transcript: "MARIA FERREIRA: oi",
    summaryObservation: "",
    privateNote: ""
  }, h.now() - 1000);
  await h.module.openPreservedBuffers();
  const panel = h.document.getElementById("atendeai-recovery-report-fallback");
  const views = collect(panel).filter((node) => node.tagName === "button" && node.textContent === "Ver conversa");
  assert.equal(views.length, 2);
  assert.equal(panel.querySelector(".recovery-buffer-avatar").textContent, "CTF");
  assert.equal(Object.hasOwn(storedBuffers(h)[0], "initials"), false);
  assert.equal(storedBuffers(h)[0].transcript, transcript);
});

test("R2/R3/R4/R13: detalhe usa o transcript armazenado, sem API, e voltar mantem o painel", async () => {
  const h = loadRecoveryModule();
  const transcript = [
    "CASSIA TAIS FIGURA: Não estou conseguindo cadastrar corretamente os produtos.",
    "FELIPE: Vou verificar para você.",
    "veja o erro: timeout na porta 80",
    "CASSIA TAIS FIGURA: Agora apareceu outra rejeição."
  ].join("\n");
  await h.module.__test.persistSnapshot({
    sourceId: "attendance:whatsapp|cassia|06/10/26 08:14",
    displayName: "CASSIA TAIS FIGURA",
    transcript,
    summaryObservation: "observacao A",
    privateNote: "NOTA-PRIVADA-NAO-ENVIAR"
  }, h.now());
  await h.module.openPreservedBuffers();
  const panel = h.document.getElementById("atendeai-recovery-report-fallback");
  assert.equal(panel.getAttribute("data-mode"), "list");
  const before = JSON.stringify(storedBuffers(h));
  await Promise.all(buttonByText(panel, "Ver conversa").click());

  assert.equal(h.document.getElementById("atendeai-recovery-report-fallback"), panel);
  assert.equal(panel.getAttribute("data-mode"), "detail");
  assert.equal(panel.querySelector(".recovery-detail-name").textContent, "CASSIA TAIS FIGURA");
  assert.match(panel.querySelector(".recovery-detail-meta").textContent, /06\/10\/26 08:14 · 4 mensagens/);
  assert.equal(renderedTranscript(panel), transcript);
  assert.equal(panel.querySelector(".recovery-transcript-author").textContent, "CASSIA TAIS FIGURA");
  assert.deepEqual(panel.querySelectorAll(".recovery-transcript-raw").map((node) => node.textContent), [
    "FELIPE: Vou verificar para você.",
    "veja o erro: timeout na porta 80"
  ]);
  assert.equal(h.sent.length, 0);
  assert.equal(h.fetchCalls(), 0);
  assert.equal(h.shown.length, 0);
  assert.equal(h.complementCalls(), 0);
  assert.equal(JSON.stringify(storedBuffers(h)), before);
  assert.match(textOf(panel), /NOTA-PRIVADA-NAO-ENVIAR/);

  const typed = panel.querySelector("textarea");
  typed.value = "observacao editada no detalhe";
  await Promise.all(collect(panel).find((node) => node.getAttribute("aria-label") === "Voltar").click());
  assert.equal(h.document.getElementById("atendeai-recovery-report-fallback"), panel);
  assert.equal(panel.getAttribute("data-mode"), "list");
  assert.match(textOf(panel), /Conversas preservadas/);
  assert.equal(panel.querySelector("textarea").value, "observacao editada no detalhe");
  assert.equal(storedBuffers(h)[0].summaryObservation, "observacao editada no detalhe");
  assert.equal(storedBuffers(h)[0].privateNote, "NOTA-PRIVADA-NAO-ENVIAR");
  assert.equal(storedBuffers(h)[0].transcript, transcript);
  assert.equal(h.sent.length, 0);
});

test("R5/R6/R7: observacao e relatorio do detalhe seguem o buffer e excluem privateNote", async () => {
  const h = loadRecoveryModule();
  const transcript = "Gabriel: preciso do relatorio deste atendimento";
  await h.module.__test.persistSnapshot({
    sourceId: "data-chat-id:gabriel",
    displayName: "Gabriel",
    transcript,
    summaryObservation: "observacao A",
    privateNote: "NOTA-PRIVADA-NAO-ENVIAR"
  }, h.now());
  h.live.summary = "observacao do chat aberto";
  h.live.note = "nota do chat aberto";
  await h.module.openPreservedBuffers();
  const panel = h.document.getElementById("atendeai-recovery-report-fallback");
  await Promise.all(buttonByText(panel, "Ver conversa").click());
  const observation = panel.querySelector("textarea");
  observation.value = "observacao A editada";
  for (const fn of observation.listeners.input || []) fn();
  await h.flushTimers();
  assert.equal(storedBuffers(h)[0].summaryObservation, "observacao A editada");
  assert.equal(storedBuffers(h)[0].bufferId, (await h.module.__test.readState()).buffers[0].bufferId);

  await Promise.all(buttonByText(panel, "Gerar relatório").click());
  assert.equal(h.sent.length, 1);
  assert.deepEqual(h.sent[0], {
    action: "gerarResumo",
    texto: transcript,
    promptComplement: "observacao A editada"
  });
  assert.equal(Object.hasOwn(h.sent[0], "privateNote"), false);
  assert.doesNotMatch(JSON.stringify(h.sent[0]), /NOTA-PRIVADA-NAO-ENVIAR/);
  assert.doesNotMatch(JSON.stringify(h.sent[0]), /observacao do chat aberto/);
  assert.equal(storedBuffers(h)[0].privateNote, "NOTA-PRIVADA-NAO-ENVIAR");
  assert.equal(storedBuffers(h)[0].transcript, transcript);
});

test("R8/R9/R10/R11: drag do header move, limita, ignora controles e restaura posicao", async () => {
  const h = loadRecoveryModule();
  h.window.innerWidth = 800;
  h.window.innerHeight = 600;
  await h.module.__test.persistSnapshot({
    sourceId: "data-chat-id:gabriel",
    displayName: "Gabriel",
    transcript: "Gabriel: oi",
    summaryObservation: "obs",
    privateNote: "nota"
  }, h.now());
  await h.module.openPreservedBuffers();
  const panel = h.document.getElementById("atendeai-recovery-report-fallback");
  const header = panel.querySelector(".recovery-buffer-header");
  attachPanelRect(panel);
  const transcript = storedBuffers(h)[0].transcript;

  dispatchNode(header, "pointerdown", { target: buttonByText(panel, "Ver conversa"), clientX: 110, clientY: 90 });
  dispatchNode(header, "pointermove", { clientX: 400, clientY: 300 });
  assert.equal(panel.style.left || "", "");
  dispatchNode(header, "pointerdown", { target: panel.querySelector("textarea"), clientX: 110, clientY: 90 });
  dispatchNode(header, "pointermove", { clientX: 400, clientY: 300 });
  dispatchNode(header, "pointerdown", {
    target: { tagName: "a", parentElement: header },
    clientX: 110,
    clientY: 90
  });
  dispatchNode(header, "pointermove", { clientX: 400, clientY: 300 });
  assert.equal(panel.style.left || "", "");
  assert.equal(h.store[PANEL_POSITION_KEY], undefined);

  dispatchNode(header, "pointerdown", { clientX: 110, clientY: 90 });
  assert.match(panel.className, /is-dragging/);
  dispatchNode(header, "pointermove", { clientX: 160, clientY: 140 });
  dispatchNode(header, "pointerup");
  assert.equal(panel.style.left, "150px");
  assert.equal(panel.style.top, "130px");
  assert.doesNotMatch(panel.className, /is-dragging/);
  assert.deepEqual(h.store[PANEL_POSITION_KEY], { x: 150, y: 130 });
  assert.equal(storedBuffers(h)[0].transcript, transcript);
  assert.equal(h.store.atendeai_dock_preferences, undefined);

  dispatchNode(header, "pointerdown", { clientX: 160, clientY: 140 });
  dispatchNode(header, "pointermove", { clientX: -1000, clientY: 5000 });
  dispatchNode(header, "pointerup");
  assert.equal(panel.style.left, "8px");
  assert.equal(panel.style.top, "272px");

  h.window.innerWidth = 400;
  h.window.innerHeight = 300;
  const resize = h.windowListeners.find((entry) => entry.type === "resize");
  resize.fn();
  assert.equal(panel.style.left, "8px");
  assert.equal(panel.style.top, "8px");
  assert.deepEqual(h.store[PANEL_POSITION_KEY], { x: 8, y: 8 });

  const restored = loadRecoveryModule();
  restored.window.innerWidth = 800;
  restored.window.innerHeight = 600;
  restored.store[PANEL_POSITION_KEY] = { x: 9000, y: -500 };
  await restored.module.__test.persistSnapshot({
    sourceId: "data-chat-id:gabriel",
    displayName: "Gabriel",
    transcript: "Gabriel: oi",
    summaryObservation: "",
    privateNote: ""
  }, restored.now());
  await restored.module.openPreservedBuffers();
  const next = restored.document.getElementById("atendeai-recovery-report-fallback");
  assert.equal(next.style.left, "372px");
  assert.equal(next.style.top, "8px");
  assert.deepEqual(
    JSON.parse(JSON.stringify(restored.module.__test.clampPanelPosition({ x: 9000, y: -40 }, { width: 420, height: 320 }))),
    { x: 372, y: 8 }
  );
});

test("R12: Esc, X e clique fora fecham o detalhe; voltar nao fecha", async () => {
  async function openDetail(action) {
    const h = loadRecoveryModule();
    h.module.init();
    await h.module.__test.persistSnapshot({
      sourceId: "data-chat-id:gabriel",
      displayName: "Gabriel",
      transcript: "Gabriel: oi\nGabriel: segunda",
      summaryObservation: "",
      privateNote: ""
    }, h.now());
    await h.module.openPreservedBuffers();
    const panel = h.document.getElementById("atendeai-recovery-report-fallback");
    await Promise.all(buttonByText(panel, "Ver conversa").click());
    assert.equal(panel.getAttribute("data-mode"), "detail");
    if (action === "back") {
      await Promise.all(collect(panel).find((node) => node.getAttribute("aria-label") === "Voltar").click());
      assert.equal(h.document.getElementById("atendeai-recovery-report-fallback"), panel);
      assert.equal(panel.getAttribute("data-mode"), "list");
      return;
    }
    if (action === "overlay") {
      await Promise.all(h.document.getElementById("atendeai-recovery-overlay").click());
    } else if (action === "Escape") {
      for (const entry of h.document.listeners.filter((listener) => listener.type === "keydown")) {
        entry.fn({ key: "Escape" });
      }
    } else if (action === "X") {
      await Promise.all(collect(panel).find((node) => node.getAttribute("aria-label") === "Fechar").click());
    } else {
      for (const entry of h.document.listeners.filter((listener) => listener.type === "click")) {
        entry.fn({ target: h.document.body });
      }
    }
    assert.equal(h.document.getElementById("atendeai-recovery-report-fallback"), null);
    assert.equal(h.document.getElementById("atendeai-recovery-overlay"), null);
  }

  for (const action of ["back", "overlay", "Escape", "X", "outside"]) {
    await openDetail(action);
  }
});

test("transcript uniforme separa autores e linha ambigua permanece fiel", () => {
  const h = loadRecoveryModule();
  const transcript = [
    "CLIENTE: Não estou conseguindo cadastrar corretamente os produtos.",
    "FELIPE: Vou verificar para você.",
    "CLIENTE: Agora apareceu outra rejeição."
  ].join("\n");
  const parsed = h.module.__test.parseTranscript(transcript, "CLIENTE");
  assert.equal(parsed.map((entry) => entry.author ? `${entry.author}: ${entry.text}` : entry.raw).join("\n"), transcript);
  assert.equal(parsed[1].author, "FELIPE");
  const ambiguous = h.module.__test.parseTranscript("Erro: falhou", "Gabriel");
  assert.equal(JSON.stringify(ambiguous), JSON.stringify([{ raw: "Erro: falhou" }]));
  const mixed = h.module.__test.parseTranscript("Gabriel: oi\nveja o erro: timeout", "Gabriel");
  assert.equal(mixed[0].author, "Gabriel");
  assert.equal(mixed[0].text, "oi");
  assert.equal(mixed[1].raw, "veja o erro: timeout");
  assert.equal(mixed[1].author, undefined);
});
