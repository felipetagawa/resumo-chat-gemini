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

test("data-chat-id da conversa aberta e a identidade e sobrevive a reinicio da sessao", async () => {
  const harness = loadRecoveryModule();
  const message = el("div", { class: "msg" });
  harness.document.body.appendChild(el("div", { "data-chat-id": "chat-42" }, [message]));
  harness.document.body.appendChild(el("div", {
    class: "sz_contact active",
    "data-contact-id": "outro-card"
  }));

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
