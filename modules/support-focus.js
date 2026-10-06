// SUPPORT_FOCUS_V1: local attendance notes; never participates in AI payloads.
const SupportFocusModule = (() => {
  const KEY = "atendeai_support_focus_v1";
  const BADGES_KEY = "atendeai_support_focus_badges_enabled";
  const TTL = 24 * 60 * 60 * 1000;
  const STATES = Object.freeze({
    MY_TURN: { label: "Minha vez", symbol: "●" },
    CHECKING: { label: "Verificando", symbol: "◐" },
    WAITING_CUSTOMER: { label: "Aguardando cliente", symbol: "○" },
    WAITING_THIRD_PARTY: { label: "Aguardando terceiro", symbol: "↗" }
  });
  let root, observer, timer, identity, editing = false, renderKey = "", generation = 0;
  let badgesEnabled = true;
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
    const data = await storage("get", [KEY, BADGES_KEY]);
    badgesEnabled = data?.[BADGES_KEY] !== false;
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
  function describe(item) {
    const state = STATES[item?.status];
    return [state?.label || "Sem estado definido", item?.nextStep].filter(Boolean).join(" — ");
  }
  function decorate(items) {
    if (!badgesEnabled) {
      document.querySelectorAll(".atendeai-focus-badge").forEach(badge => badge.remove());
      return;
    }
    for (const card of document.querySelectorAll(".sz_contact")) {
      const id = RecoveryBufferModule.getConversationIdentityFromCard(card);
      const item = id && items[id.sourceId];
      const state = STATES[item?.status];
      const name = card.querySelector(".contact-layout .content .name_in_hours .name .contact-name");
      const badges = Array.from(card.querySelectorAll(".atendeai-focus-badge"));
      if (!state || !name?.parentElement) { badges.forEach(b => b.remove()); continue; }
      let badge = badges.shift();
      badges.forEach(b => b.remove());
      if (badge && badge.parentElement !== name.parentElement) { badge.remove(); badge = null; }
      if (!badge) { badge = node("span", "", "badge"); name.parentElement.appendChild(badge); }
      const className = `atendeai-focus-badge atendeai-focus-${item.status.toLowerCase()}`;
      if (badge.className !== className) badge.className = className;
      if (badge.textContent !== state.symbol) badge.textContent = state.symbol;
      for (const attr of ["title", "aria-label"]) {
        const label = describe(item);
        if (badge.getAttribute(attr) !== label) badge.setAttribute(attr, label);
      }
    }
  }
  function render(item) {
    clearRoot();
    root.hidden = !identity;
    if (!identity) return;
    const name = node("strong", identity.displayName, "name"); name.title = identity.displayName;
    root.appendChild(name);
    const state = STATES[item?.status];
    const status = node("div", state ? `${state.symbol} ${state.label}` : "Sem estado definido", "status");
    if (state) status.className += ` atendeai-focus-${item.status.toLowerCase()}`;
    root.appendChild(status);
    root.appendChild(node("div", "Próximo passo", "kicker"));
    const nextStep = String(item?.nextStep || "").trim();
    const next = node("div", nextStep || "Próximo passo não definido", nextStep ? "next" : "next-empty");
    if (nextStep) next.title = nextStep;
    root.appendChild(next);
    const edit = button("Alterar", () => showEditor(item), "edit");
    edit.setAttribute("aria-expanded", "false");
    root.appendChild(edit);
  }
  function showEditor(item) {
    editing = true;
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
        await enqueue(async () => {
          if (RecoveryBufferModule.getCurrentConversationIdentity()?.sourceId !== expected.sourceId) return;
          const state = await read();
          // Recheck after asynchronous storage read: an old editor cannot save to another chat.
          if (RecoveryBufferModule.getCurrentConversationIdentity()?.sourceId !== expected.sourceId) return;
          if (!status && !nextStep) delete state.items[expected.sourceId];
          else state.items[expected.sourceId] = { ...expected, status, nextStep, updatedAt: Date.now() };
          await storage("set", { [KEY]: state });
        });
        editing = false; renderKey = "";
        await refresh();
      } catch {
        feedback.textContent = "Não foi possível salvar. Tente novamente.";
        buttons.forEach(([, b]) => { b.disabled = false; });
        Array.from(actions.children).forEach(b => { b.disabled = false; });
      }
    }
    actions.appendChild(button("Salvar", () => save(false)));
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
      if (current?.sourceId !== identity?.sourceId) editing = false;
      identity = current;
      decorate(state.items);
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
    root?.remove();
    root = node("section", "", "card"); root.hidden = true;
    root.setAttribute("aria-label", "Estado do atendimento");
    dock.prepend(root); identity = null; editing = false; renderKey = ""; inboundWatch = null;
    if (!observer) {
      observer = new MutationObserver(records => {
        // Insertion/removal of only our nodes has the SZ parent as target.
        if (records.some(record => !own(record.target) && !(record.type === "childList"
          && [...record.addedNodes, ...record.removedNodes].length
          && [...record.addedNodes, ...record.removedNodes].every(own)))) schedule();
      });
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
      chrome.storage.onChanged?.addListener((changes, area) => {
        if (area === "local" && (changes[KEY] || changes[BADGES_KEY])) schedule();
      });
    }
    await refresh();
  }
  return { mount };
})();
window.SupportFocusModule = SupportFocusModule;
