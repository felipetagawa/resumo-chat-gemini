// SUPPORT_FOCUS_V1: local attendance notes; never participates in AI payloads.
const SupportFocusModule = (() => {
  const KEY = "atendeai_support_focus_v1";
  const TTL = 24 * 60 * 60 * 1000;
  const STATES = Object.freeze({
    MY_TURN: { label: "Minha vez", shortLabel: "Minha vez", symbol: "●" },
    CHECKING: { label: "Verificando", shortLabel: "Verificando", symbol: "◐" },
    WAITING_CUSTOMER: { label: "Aguardando cliente", shortLabel: "Cliente", symbol: "○" },
    WAITING_THIRD_PARTY: { label: "Aguardando terceiro", shortLabel: "Terceiro", symbol: "↗" }
  });
  let root, observer, timer, identity, editing = false, renderKey = "", generation = 0, editorEpoch = 0;
  let inboundWatch = null;
  let queue = Promise.resolve();
  function enqueue(task) {
    // Chrome's same-origin Web Lock also serializes whole-key read/write
    // transactions across SZ tabs, including retention cleanup.
    const execute = () => globalThis.navigator?.locks?.request
      ? navigator.locks.request(KEY, task) : task();
    const run = queue.then(execute, execute);
    queue = run.catch(() => {});
    return run;
  }
  function storage(method, value) {
    return new Promise((resolve, reject) => {
      chrome.storage.local[method](value, data => {
        const error = chrome.runtime?.lastError;
        if (error) reject(new Error(error.message));
        else resolve(data);
      });
    });
  }
  function textOf(el) {
    return String(el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  }
  function hasClass(el, name) {
    return String(el?.className || "").split(/\s+/).includes(name);
  }
  function lastInbound() {
    let count = 0;
    let last = null;
    for (const msg of document.querySelectorAll(".msg")) {
      if (hasClass(msg, "sent")) continue;
      const name = textOf(msg.querySelector(".name"));
      if (/^autom[aá]tico$/i.test(name)) continue;
      const content = textOf(msg.querySelector(".message span"));
      if (!content) continue;
      count += 1;
      last = { node: msg, name, content };
    }
    return { count, last, signature: last ? `${count}|${last.name}|${last.content}` : "0|" };
  }
  function noteInbound(identityNow) {
    if (!identityNow) {
      inboundWatch = null;
      return false;
    }
    const inbound = lastInbound();
    if (!inboundWatch || inboundWatch.sourceId !== identityNow.sourceId) {
      inboundWatch = {
        sourceId: identityNow.sourceId,
        signature: inbound.signature,
        node: inbound.last?.node || null,
        primed: inbound.count > 0
      };
      return false;
    }
    if (!inboundWatch.primed) {
      inboundWatch.signature = inbound.signature;
      inboundWatch.node = inbound.last?.node || null;
      if (inbound.count > 0) inboundWatch.primed = true;
      return false;
    }
    if (inbound.signature === inboundWatch.signature) return false;
    if (inbound.last?.node && inbound.last.node === inboundWatch.node) {
      inboundWatch.signature = inbound.signature;
      return false;
    }
    inboundWatch.signature = inbound.signature;
    inboundWatch.node = inbound.last?.node || null;
    return inbound.count > 0;
  }
  // Read/write cleanup share the same serialized queue to avoid losing rapid edits.
  async function read() {
    const data = await storage("get", [KEY]);
    const stored = data?.[KEY];
    const items = Object.create(null);
    for (const [id, item] of Object.entries(stored?.items || {})) {
      if (item?.sourceId !== id || !Number.isFinite(item.updatedAt) || item.updatedAt <= 0 || Date.now() - item.updatedAt >= TTL
        || (!Object.hasOwn(STATES, item.status) && !String(item.nextStep || "").trim())) continue;
      items[id] = item;
    }
    if (Object.keys(items).length !== Object.keys(stored?.items || {}).length) {
      await storage("set", { [KEY]: { version: 1, items } });
    }
    return { version: 1, items };
  }
  async function autoMyTurn(identityNow, state) {
    if (editing || !noteInbound(identityNow)) return state;
    if (RecoveryBufferModule.getCurrentConversationIdentity()?.sourceId !== identityNow.sourceId) return state;
    const item = state.items[identityNow.sourceId];
    if (item?.status === "MY_TURN") return state;
    state.items[identityNow.sourceId] = {
      sourceId: identityNow.sourceId,
      displayName: identityNow.displayName,
      status: "MY_TURN",
      nextStep: item?.nextStep || "",
      updatedAt: Date.now()
    };
    await storage("set", { [KEY]: state });
    return state;
  }
  function node(tag, label, className) {
    const el = document.createElement(tag);
    el.className = `atendeai-focus-${className}`;
    if (label) el.textContent = label;
    return el;
  }
  function button(label, fn, className = "button") {
    const el = node("button", label, className);
    el.type = "button";
    el.addEventListener("click", fn);
    return el;
  }
  function clearRoot() { Array.from(root.children).forEach(child => child.remove()); }
  function render(item) {
    clearRoot();
    root.hidden = !identity;
    if (!identity) return;
    const name = node("strong", identity.displayName, "name"); name.title = identity.displayName;
    root.appendChild(name);
    const state = STATES[item?.status];
    const nextStep = String(item?.nextStep || "").trim();
    if (state) {
      const status = node("div", `${state.symbol} ${state.label}`, "status");
      status.className += ` atendeai-focus-pill atendeai-focus-${item.status.toLowerCase()}`;
      root.appendChild(status);
    }
    if (nextStep) {
      root.appendChild(node("div", "Próximo passo", "kicker"));
      const next = node("div", nextStep, "next"); next.title = nextStep; root.appendChild(next);
    } else if (!state) root.appendChild(node("div", "Organize este atendimento", "next-empty"));
    const edit = button("Alterar", () => showEditor(item), "edit");
    edit.setAttribute("aria-expanded", "false");
    root.appendChild(edit);
  }
  function showEditor(item) {
    editing = true;
    const editor = ++editorEpoch;
    const expected = { ...identity };
    clearRoot();
    root.appendChild(node("strong", expected.displayName, "name"));
    let selected = Object.hasOwn(STATES, item?.status) ? item.status : "";
    const choices = node("div", "", "choices");
    const buttons = [];
    for (const [key, state] of Object.entries(STATES)) {
      const choice = button(`${state.symbol} ${state.label}`, () => {
        selected = key;
        buttons.forEach(([k, b]) => b.setAttribute("aria-pressed", String(k === selected)));
      }, "choice");
      choice.setAttribute("aria-pressed", String(key === selected));
      buttons.push([key, choice]); choices.appendChild(choice);
    }
    root.appendChild(choices);
    const label = node("label", "Próximo passo", "label");
    label.setAttribute("for", "atendeai-focus-next-step"); root.appendChild(label);
    const input = node("textarea", "", "input"); input.id = "atendeai-focus-next-step";
    input.rows = 2; input.maxLength = 300; input.value = item?.nextStep || ""; root.appendChild(input);
    const feedback = node("div", "", "feedback"); feedback.setAttribute("role", "status");
    const actions = node("div", "", "actions");
    async function save(clear) {
      const nextStep = clear ? "" : input.value.trim().slice(0, 300);
      const status = clear ? "" : selected;
      buttons.forEach(([, b]) => { b.disabled = true; });
      Array.from(actions.children).forEach(b => { b.disabled = true; });
      try {
        const persisted = await enqueue(async () => {
          if (RecoveryBufferModule.getCurrentConversationIdentity()?.sourceId !== expected.sourceId) return;
          const state = await read();
          // Recheck after asynchronous storage read: an old editor cannot save to another chat.
          if (RecoveryBufferModule.getCurrentConversationIdentity()?.sourceId !== expected.sourceId) return;
          if (!status && !nextStep) delete state.items[expected.sourceId];
          else state.items[expected.sourceId] = { ...expected, status, nextStep, updatedAt: Date.now() };
          await storage("set", { [KEY]: state });
          return true;
        });
        if (editor !== editorEpoch) return;
        editing = false; renderKey = "";
        await refresh();
        if (persisted && identity?.sourceId === expected.sourceId) {
          const saved = node("div", "Salvo", "saved"); saved.setAttribute("role", "status"); root.appendChild(saved);
          setTimeout(() => saved.remove(), 1800);
        }
      } catch {
        if (editor !== editorEpoch) return;
        feedback.textContent = "Não foi possível salvar. Tente novamente.";
        buttons.forEach(([, b]) => { b.disabled = false; });
        Array.from(actions.children).forEach(b => { b.disabled = false; });
      }
    }
    actions.appendChild(button("Salvar alterações", () => save(false)));
    actions.appendChild(button("Cancelar", async () => {
      ++editorEpoch; editing = false; renderKey = ""; await refresh();
    }));
    actions.appendChild(button("Limpar", () => save(true)));
    root.appendChild(actions); root.appendChild(feedback);
    buttons[0][1].focus();
  }
  async function refresh() {
    const request = ++generation;
    try {
      const state = await enqueue(async () => {
        const current = await read();
        return autoMyTurn(RecoveryBufferModule.getCurrentConversationIdentity(), current);
      });
      if (request !== generation || !root) return;
      const current = RecoveryBufferModule.getCurrentConversationIdentity();
      if (current?.sourceId !== identity?.sourceId) { editing = false; ++editorEpoch; }
      identity = current;
      const item = identity && state.items[identity.sourceId];
      const key = JSON.stringify([identity, item]);
      if (!editing && key !== renderKey) { renderKey = key; render(item); }
    } catch {
      if (request !== generation || !root) return;
      editing = false; renderKey = ""; clearRoot(); root.hidden = false;
      root.appendChild(node("div", "Estado indisponível", "status"));
    }
  }
  function own(target) {
    // Text mutations have a Text target; walk through detached nodes as well.
    for (let n = target; n; n = n.parentElement || n.parentNode) {
      if (String(n.className || "").split(/\s+/).some(c => c.startsWith("atendeai-focus-"))) return true;
    }
    return false;
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(refresh, 80);
  }
  async function mount(dock) {
    // Remove only legacy extension nodes from a previously mounted version.
    document.querySelectorAll(".atendeai-focus-anchor, .atendeai-focus-badge").forEach(el => el.remove());
    root?.remove();
    root = node("section", "", "card"); root.hidden = true;
    root.setAttribute("aria-label", "Estado do atendimento");
    dock.prepend(root); identity = null; editing = false; renderKey = ""; inboundWatch = null;
    ++editorEpoch;
    if (!observer) {
      observer = new MutationObserver(records => {
        // Insertion/removal of only our nodes has the SZ parent as target.
        if (records.some(record => !own(record.target) && !(record.type === "childList"
          && [...record.addedNodes, ...record.removedNodes].length
          && [...record.addedNodes, ...record.removedNodes].every(own)))) schedule();
      });
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
      chrome.storage.onChanged?.addListener((changes, area) => {
        if (area === "local" && changes[KEY]) schedule();
      });
    }
    await refresh();
  }
  return { mount };
})();
window.SupportFocusModule = SupportFocusModule;
