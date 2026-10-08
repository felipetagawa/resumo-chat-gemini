// Local priorities. No transcript, model calls or AI payload integration.
const SupportFocusModule = (() => {
  const KEY = "atendeai_support_focus_v1", TTL = 86400000;
  const PRIORITIES = Object.freeze({ NOW: "Agora", NEXT: "Próximo", LOW: "Baixa" });
  const TAGS = Object.freeze(["Bloqueante", "Em teste", "Aguardando cliente", "Aguardando terceiro", "NF-e"]);
  const LEGACY = Object.freeze({ MY_TURN: [], CHECKING: ["Em teste"], WAITING_CUSTOMER: ["Aguardando cliente"], WAITING_THIRD_PARTY: ["Aguardando terceiro"] });
  let root, observer, timer, identity, editor, preview, anchor, expanded = false;
  let editing = false, editorEpoch = 0, generation = 0, renderKey = "", cached = { items: {} }, inboundWatch;
  let queue = Promise.resolve();
  function enqueue(task) {
    const execute = () => globalThis.navigator?.locks?.request ? navigator.locks.request(KEY, task) : task();
    const run = queue.then(execute, execute); queue = run.catch(() => {}); return run;
  }
  function storage(method, value) {
    return new Promise((resolve, reject) => chrome.storage.local[method](value, data => {
      const error = chrome.runtime?.lastError;
      if (error) reject(new Error(error.message)); else resolve(data);
    }));
  }
  function normalize(item) {
    return { ...item,
      priority: Object.hasOwn(PRIORITIES, item?.priority) ? item.priority : item?.status === "MY_TURN" ? "NOW" : "NEXT",
      tags: Array.isArray(item?.tags) ? [...new Set(item.tags.filter(t => TAGS.includes(t)))] : Object.hasOwn(LEGACY, item?.status) ? LEGACY[item.status] : [],
      nextStep: String(item?.nextStep || "").slice(0, 300)
    };
  }
  async function read() {
    const data = await storage("get", [KEY]), stored = data?.[KEY], items = Object.create(null);
    for (const [id, item] of Object.entries(stored?.items || {})) {
      if (item?.sourceId !== id || !Number.isFinite(item.updatedAt) || item.updatedAt <= 0 || Date.now() - item.updatedAt >= TTL) continue;
      // Keep legacy records unchanged until explicit edit. Never re-key by name.
      items[id] = item;
    }
    const state = { version: stored?.version || 1, items };
    if (Object.keys(items).length !== Object.keys(stored?.items || {}).length) await storage("set", { [KEY]: state });
    return state;
  }
  function cards() { return Array.from(document.querySelectorAll(".sz_contact")); }
  function safeIdentity(card) {
    if (!card) return null;
    const value = String(card.getAttribute("data-chat-id") || "").trim();
    if (!value || cards().filter(c => String(c.getAttribute("data-chat-id") || "").trim() === value).length !== 1) return null;
    const id = RecoveryBufferModule.getConversationIdentityFromCard(card);
    // Contact IDs, generic DOM IDs and name/time stamps cannot prove attendance identity.
    return id?.sourceId === `data-chat-id:${value}` ? id : null;
  }
  function currentIdentity() {
    const active = cards().filter(c => /(?:^|\s)(?:active|selected|open)(?:\s|$)/.test(String(c.className)));
    return active.length === 1 ? safeIdentity(active[0]) : null;
  }
  function cardFor(id) {
    if (!String(id).startsWith("data-chat-id:")) return null;
    const matching = cards().filter(c => `data-chat-id:${String(c.getAttribute("data-chat-id") || "").trim()}` === id);
    return matching.length === 1 && safeIdentity(matching[0]) ? matching[0] : null;
  }
  function node(tag, label, className) {
    const el = document.createElement(tag); el.className = `atendeai-focus-${className}`;
    if (label) el.textContent = label; return el;
  }
  function button(label, fn, className = "button") {
    const el = node("button", label, className); el.type = "button"; el.addEventListener("click", fn); return el;
  }
  function clear(el) { Array.from(el.children).forEach(child => child.remove()); }
  function paint(el) { globalThis.ThemeModule?.apply(el); }
  function closePreview() { preview?.remove(); preview = null; }
  function closeEditor(restore = false) {
    const inline = editor?.classList.contains("atendeai-focus-inline"), previousAnchor = anchor;
    ++editorEpoch; editing = false; editor?.remove(); editor = null;
    anchor = null;
    if (inline && root) { renderKey = ""; render(); }
    if (restore) (inline ? root?.querySelector(".atendeai-focus-edit") : previousAnchor)?.focus();
  }
  function summary(el, item) {
    const data = normalize(item);
    el.appendChild(node("div", [PRIORITIES[data.priority], ...data.tags.slice(0, 2)].join(" · "), "meta"));
    if (data.nextStep) el.appendChild(node("div", data.nextStep, "next"));
    if (data.alert) el.appendChild(node("div", "Cliente respondeu", "alert"));
  }
  function tracked() {
    return Object.values(cached.items).filter(item => cardFor(item.sourceId)).map(normalize)
      .sort((a, b) => Object.keys(PRIORITIES).indexOf(a.priority) - Object.keys(PRIORITIES).indexOf(b.priority)
        || a.updatedAt - b.updatedAt || a.sourceId.localeCompare(b.sourceId));
  }
  function render() {
    if (!root) return;
    clear(root); const items = tracked(), counts = p => items.filter(i => i.priority === p).length;
    const header = node("div", "", "heading");
    const compact = (root.getBoundingClientRect?.().width || 320) < 280;
    const fullLabel = `Prioridades | ${counts("NOW")} agora · ${counts("NEXT")} próximos`;
    const toggle = button(`${compact ? fullLabel.replace("próximos", "próx.") : fullLabel} ${expanded ? "▴" : "▾"}`, () => {
      expanded = !expanded; renderKey = ""; render(); root.querySelector(".atendeai-focus-toggle")?.focus();
    }, "toggle");
    toggle.setAttribute("aria-expanded", String(expanded)); toggle.setAttribute("aria-controls", "atendeai-focus-list");
    toggle.setAttribute("aria-label", fullLabel); toggle.title = fullLabel;
    header.appendChild(toggle);
    if (identity) {
      const edit = button("＋", e => showEditor(cached.items[identity.sourceId], e.target), "edit");
      edit.setAttribute("aria-label", "Organizar atendimento");
      edit.title = `Organizar ${identity.displayName}`; header.appendChild(edit);
    }
    root.appendChild(header);
    if (expanded) {
      const list = node("div", "", "list"); list.id = "atendeai-focus-list";
      if (!items.length) list.appendChild(node("p", "Nenhum atendimento acompanhado nesta fila.", "empty"));
      for (const item of items) {
        const row = button("", () => { const card = cardFor(item.sourceId); if (card) card.click(); }, "row");
        row.title = "Abrir atendimento no SZ";
        const name = node("strong", cardFor(item.sourceId)?.querySelector(".contact-name")?.textContent || item.displayName, "name");
        name.title = name.textContent; row.appendChild(name); summary(row, item); list.appendChild(row);
      }
      root.appendChild(list);
    }
  }
  function safeList() {
    // Recognized list only; never infer a parent from internal card layout.
    for (const list of document.querySelectorAll(".chats-list, .contacts-list, .contact-list")) {
      if (list === document.body || !list.parentElement || !list.querySelector(".sz_contact")) continue;
      if (list.querySelector("input, textarea, .msg") || /(?:^|\s)sz_contact(?:\s|$)/.test(String(list.className))) continue;
      const r = list.getBoundingClientRect?.();
      const ownHeight = root?.parentElement === list.parentElement ? root.getBoundingClientRect?.().height || 0 : 0;
      if (r && (r.width < 210 || r.height + ownHeight < 200 || r.left > window.innerWidth / 2)) continue;
      if (globalThis.getComputedStyle) {
        const parentStyle = getComputedStyle(list.parentElement), listStyle = getComputedStyle(list);
        if (parentStyle.display !== "flex" || parentStyle.flexDirection !== "column"
          || Number(listStyle.flexShrink) === 0 || !/auto|scroll/.test(listStyle.overflowY)) continue;
      }
      return list;
    }
    return null;
  }
  function placeCentral() {
    const list = safeList();
    if (!list) { root?.remove(); root = null; closeEditor(); closePreview(); return; }
    if (root?.parentElement === list.parentElement) return;
    root?.remove(); root = node("section", "", "central"); root.setAttribute("aria-label", "AtendeAI — Prioridades locais");
    // Sibling before the native scroll container: search/header/count stay native.
    list.parentElement.insertBefore(root, list); paint(root); renderKey = "";
  }
  function positionPanel(panel, source, interactive) {
    const r = source?.getBoundingClientRect?.(); if (!r) return false;
    const w = window.innerWidth, h = window.innerHeight, margin = 8;
    const bounds = safeList()?.parentElement?.getBoundingClientRect?.();
    // Entirely inside left column, never over composer/chat. Suppress when unsafe.
    if (!bounds || bounds.width < 240 || h < 430 || (interactive && w < 600)) return false;
    const width = Math.min(interactive ? 310 : 280, bounds.width - 16);
    panel.style.width = `${width}px`; panel.style.maxHeight = `${Math.min(interactive ? 380 : 150, h * .48)}px`;
    const height = panel.getBoundingClientRect().height;
    let y = r.bottom + 4;
    if (y + height > h - margin) y = r.top - height - 4;
    if (y < margin || y + height > h - margin) return false;
    const x = Math.max(margin, Math.min(r.left, bounds.right - width - margin, w - width - margin));
    if (x < bounds.left || x + width > bounds.right) return false;
    panel.style.left = `${x}px`; panel.style.top = `${y}px`; return true;
  }
  function showPreview(card) {
    closePreview(); if (editing) return;
    const id = safeIdentity(card), item = id && cached.items[id.sourceId]; if (!item) return;
    preview = node("aside", "", "preview"); preview.setAttribute("role", "tooltip");
    summary(preview, item); document.body.appendChild(preview); paint(preview);
    if (!positionPanel(preview, card, false)) closePreview();
  }
  function showEditor(item, source) {
    if (!identity) return;
    closeEditor(); closePreview(); editing = true; anchor = source;
    const epoch = ++editorEpoch, expected = { ...identity }, data = normalize(item);
    editor = node("section", "", "editor"); const panel = editor;
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", `Organizar ${expected.displayName}`);
    panel.appendChild(node("strong", expected.displayName, "name"));
    panel.appendChild(node("div", "Prioridade — ordem de atenção", "label"));
    let selected = item ? data.priority : "NEXT"; const tags = new Set(data.tags);
    const choices = node("div", "", "choices"), priorityButtons = [];
    for (const [key, label] of Object.entries(PRIORITIES)) {
      const choice = button(label, () => { selected = key; priorityButtons.forEach(([k, b]) => b.setAttribute("aria-pressed", String(k === selected))); }, "choice");
      choice.setAttribute("aria-pressed", String(key === selected)); priorityButtons.push([key, choice]); choices.appendChild(choice);
    }
    panel.appendChild(choices); panel.appendChild(node("div", "Tags — situação do atendimento", "label"));
    const tagChoices = node("div", "", "choices");
    for (const tag of TAGS) {
      const choice = button(tag, () => { if (tags.has(tag)) tags.delete(tag); else tags.add(tag); choice.setAttribute("aria-pressed", String(tags.has(tag))); }, "choice");
      choice.setAttribute("aria-pressed", String(tags.has(tag))); tagChoices.appendChild(choice);
    }
    panel.appendChild(tagChoices);
    const label = node("label", "Próximo passo (opcional)", "label"); label.setAttribute("for", "atendeai-focus-next-step"); panel.appendChild(label);
    const input = node("textarea", "", "input"); input.id = "atendeai-focus-next-step"; input.rows = 2; input.maxLength = 300; input.value = data.nextStep; panel.appendChild(input);
    const feedback = node("div", "", "feedback"); feedback.setAttribute("role", "status");
    const actions = node("div", "", "actions");
    async function save(mode) {
      const nextStep = input.value.trim().slice(0, 300), priority = selected, selectedTags = [...tags];
      panel.querySelectorAll("button, textarea").forEach(b => { b.disabled = true; });
      try {
        const persisted = await enqueue(async () => {
          if (epoch !== editorEpoch || currentIdentity()?.sourceId !== expected.sourceId) return false;
          const state = await read();
          if (epoch !== editorEpoch || currentIdentity()?.sourceId !== expected.sourceId) return false;
          if (mode === "clear") delete state.items[expected.sourceId];
          else if (mode === "review") {
            if (state.items[expected.sourceId]) state.items[expected.sourceId] = { ...state.items[expected.sourceId], alert: null };
          } else state.items[expected.sourceId] = { ...state.items[expected.sourceId], ...expected, priority, tags: selectedTags, nextStep, updatedAt: Date.now() };
          await storage("set", { [KEY]: state }); return true;
        });
        if (epoch !== editorEpoch) return;
        closeEditor(true); renderKey = ""; await refresh();
        if (persisted && root) {
          const saved = node("div", "Salvo", "saved"); saved.setAttribute("role", "status"); root.appendChild(saved); setTimeout(() => saved.remove(), 1800);
          const edit = root.querySelector(".atendeai-focus-edit");
          if (edit) { edit.textContent = "✓"; edit.title = "Salvo — Organizar atendimento"; setTimeout(() => { edit.textContent = "＋"; }, 1800); }
        }
      } catch {
        if (epoch !== editorEpoch) return;
        feedback.textContent = "Não foi possível salvar. Tente novamente.";
        panel.querySelectorAll("button, textarea").forEach(b => { b.disabled = false; });
      }
    }
    actions.appendChild(button("Salvar alterações", () => save("save")));
    actions.appendChild(button("Cancelar", () => closeEditor(true)));
    actions.appendChild(button("Limpar", () => save("clear")));
    if (item?.alert) actions.appendChild(button("Marcar revisado", () => save("review")));
    panel.appendChild(actions); panel.appendChild(feedback); document.body.appendChild(panel); paint(panel);
    if (source?.getBoundingClientRect && !positionPanel(panel, source, true)) {
      // On narrow/short windows, use the same bounded central space instead of an overlay.
      root.querySelector(".atendeai-focus-list")?.remove();
      panel.className += " atendeai-focus-inline"; panel.style.width = "100%"; panel.style.maxHeight = "min(260px, 30vh)";
      root.appendChild(panel);
    }
    panel.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); closeEditor(true); }
      if (event.key === "Tab") {
        const controls = Array.from(panel.querySelectorAll("button, textarea")), first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    priorityButtons[0][1].focus();
  }
  function verifiedInbound(id) {
    if (!id) { inboundWatch = null; return null; }
    const chatId = id.sourceId.slice("data-chat-id:".length);
    const messages = Array.from(document.querySelectorAll(".msg")).filter(m => m.getAttribute("data-chat-id") === chatId);
    const previous = inboundWatch;
    const entries = messages.map(node => ({ node, id: node.getAttribute("data-message-id"), sequence: Number(node.getAttribute("data-message-sequence")) }));
    const sameSession = previous?.sourceId === id.sourceId;
    const seen = new Set(sameSession ? previous.seen : []);
    const highWater = sameSession ? previous.highWater : 0;
    entries.forEach(e => { if (e.id) seen.add(e.id); });
    inboundWatch = { sourceId: id.sourceId, entries, seen,
      highWater: Math.max(highWater, ...entries.map(e => Number.isSafeInteger(e.sequence) ? e.sequence : 0)) };
    // Require stable message ID, attendance ID and increasing server sequence.
    // Without this evidence, DOM changes cannot establish a customer response.
    if (!previous || previous.sourceId !== id.sourceId || !previous.entries.length || entries.length <= previous.entries.length) return null;
    if (!previous.entries.every((e, i) => e.node === entries[i]?.node && e.id === entries[i]?.id && e.sequence === entries[i]?.sequence)) return null;
    if (!entries.every(e => e.id && Number.isSafeInteger(e.sequence) && e.sequence > 0) || new Set(entries.map(e => e.id)).size !== entries.length) return null;
    if (!entries.every((e, i) => i === 0 || e.sequence > entries[i - 1].sequence)) return null;
    const incoming = entries.slice(previous.entries.length).filter(e => !previous.seen.has(e.id) && e.sequence > highWater
      && e.node.classList.contains("received") && !e.node.classList.contains("sent")
      && !/^autom[aá]tico\b/i.test(String(e.node.querySelector(".name")?.textContent || "").trim())
      && String(e.node.querySelector(".message span")?.textContent || "").trim());
    return incoming[incoming.length - 1]?.id || null;
  }
  async function refresh() {
    const request = ++generation; placeCentral(); if (!root) return;
    const current = currentIdentity(), messageId = verifiedInbound(current);
    if (current?.sourceId !== identity?.sourceId) { closeEditor(); closePreview(); } identity = current;
    try {
      const state = await enqueue(async () => {
        const state = await read(), item = current && state.items[current.sourceId];
        if (item && messageId && currentIdentity()?.sourceId === current.sourceId && item.alert?.messageId !== messageId) {
          state.items[current.sourceId] = { ...item, alert: { messageId, detectedAt: Date.now() } };
          await storage("set", { [KEY]: state });
        }
        return state;
      });
      if (request !== generation || !root) return;
      if (currentIdentity()?.sourceId !== current?.sourceId) { schedule(); return; }
      cached = state; const key = JSON.stringify([identity, tracked(), expanded]);
      if (key !== renderKey && !editing) { renderKey = key; render(); }
    } catch {
      if (request !== generation || !root) return;
      cached = { items: {} }; renderKey = ""; clear(root); root.appendChild(node("div", "Prioridades indisponíveis", "feedback"));
    }
  }
  function own(target) {
    for (let n = target; n; n = n.parentElement || n.parentNode) {
      if (String(n.className || "").split(/\s+/).some(c => c.startsWith("atendeai-focus-"))) return true;
    }
    return false;
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(refresh, 80); }
  function eventCard(target) {
    for (let n = target; n; n = n.parentElement) if (String(n.className || "").split(/\s+/).includes("sz_contact")) return n;
    return null;
  }
  async function mount() {
    document.querySelectorAll(".atendeai-focus-anchor, .atendeai-focus-badge, .atendeai-focus-card").forEach(el => el.remove());
    closeEditor(); closePreview(); root?.remove(); root = null; identity = null; expanded = false; renderKey = ""; inboundWatch = null;
    if (!observer) {
      observer = new MutationObserver(records => {
        if (records.some(r => !own(r.target) && !(r.type === "childList" && [...r.addedNodes, ...r.removedNodes].length && [...r.addedNodes, ...r.removedNodes].every(own)))) {
          if (currentIdentity()?.sourceId !== identity?.sourceId) { closeEditor(); closePreview(); inboundWatch = null; }
          schedule();
        }
      });
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
      chrome.storage.onChanged?.addListener((changes, area) => { if (area === "local" && changes[KEY]) schedule(); });
      document.addEventListener("mouseover", e => { const card = eventCard(e.target); if (card && !card.contains(e.relatedTarget)) showPreview(card); });
      document.addEventListener("mouseout", e => { const card = eventCard(e.target); if (card && !card.contains(e.relatedTarget)) closePreview(); });
      document.addEventListener("focusin", e => { const card = eventCard(e.target); if (card) showPreview(card); });
      document.addEventListener("focusout", closePreview);
      document.addEventListener("scroll", e => { closePreview(); if (!editor?.contains(e.target)) closeEditor(); }, true);
      document.addEventListener("pointerdown", e => { if (editor && !editor.contains(e.target) && !anchor?.contains(e.target)) closeEditor(); }, true);
      globalThis.window?.addEventListener?.("blur", () => { closePreview(); closeEditor(); });
      globalThis.window?.addEventListener?.("resize", () => { closePreview(); closeEditor(); schedule(); });
    }
    await refresh();
  }
  return { mount };
})();
window.SupportFocusModule = SupportFocusModule;
