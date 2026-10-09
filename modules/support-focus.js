// Local priorities. No transcript, model calls or AI payload integration.
const SupportFocusModule = (() => {
  const KEY = "atendeai_support_focus_v1", TTL = 86400000;
  const PRIORITIES = Object.freeze({ NOW: "Agora", NEXT: "Próximo", LOW: "Baixa" });
  const SUGGESTED_TAGS = Object.freeze(["Fiscal", "Retorno", "Cliente", "Terceiro", "Param.", "Urgente"]);
  const LEGACY_TAGS = Object.freeze(["Bloqueante", "Em teste", "Aguardando cliente", "Aguardando terceiro", "NF-e"]);
  const TAGS = Object.freeze([...SUGGESTED_TAGS, ...LEGACY_TAGS.filter(t => !SUGGESTED_TAGS.includes(t))]);
  const LEGACY = Object.freeze({ MY_TURN: [], CHECKING: ["Em teste"], WAITING_CUSTOMER: ["Aguardando cliente"], WAITING_THIRD_PARTY: ["Aguardando terceiro"] });
  let root, observer, timer, identity, editor, preview, anchor;
  let editing = false, editorEpoch = 0, generation = 0, renderKey = "", cached = { items: {} }, inboundWatch;
  let activeFilter = "ALL";
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
    const el = document.createElement(tag);
    if (className) el.className = `atendeai-focus-${className}`;
    if (label) el.textContent = label;
    return el;
  }

  function button(label, fn, className = "button") {
    const el = node("button", label, className); el.type = "button"; el.addEventListener("click", fn); return el;
  }

  function clear(el) { Array.from(el.children).forEach(child => child.remove()); }
  function paint(el) { globalThis.ThemeModule?.apply(el); }
  function closePreview() { preview?.remove(); preview = null; }

  function closeEditor(restore = false) {
    const previousAnchor = anchor;
    ++editorEpoch; editing = false; editor?.remove(); editor = null;
    anchor = null;
    if (restore && previousAnchor) {
      try { previousAnchor.focus?.(); } catch {}
    }
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

  const counts = p => tracked().filter(i => i.priority === p).length;

  function renderSummary() {
    if (!root) return;
    clear(root);
    const countNow = counts("NOW");
    const countNext = counts("NEXT");
    const countLow = counts("LOW");
    const totalPrioritized = countNow + countNext + countLow;

    const summarySection = node("div", "", "summary");
    const toggleBtn = button("", () => {
      activeFilter = activeFilter === "ALL" ? "PRIORITIZED" : "ALL";
      applyFilter();
      renderSummary();
    }, "toggle");

    toggleBtn.setAttribute("aria-label", `Prioridades: ${countNow} agora, ${countNext} próx., ${countLow} baixa`);
    toggleBtn.title = totalPrioritized === 0
      ? "Nenhum atendimento acompanhado nesta fila."
      : `Prioridades | ${countNow} agora · ${countNext} próx. · ${countLow} baixa`;

    if (totalPrioritized === 0) {
      const emptyNote = node("span", "Nenhum atendimento com prioridade", "empty");
      toggleBtn.appendChild(emptyNote);
    } else {
      const countNowEl = node("span", `Agora: `, "count atendeai-focus-count-now");
      const nowB = document.createElement("b"); nowB.textContent = String(countNow); countNowEl.appendChild(nowB);
      const countNextEl = node("span", ` · Próx.: `, "count atendeai-focus-count-next");
      const nextB = document.createElement("b"); nextB.textContent = String(countNext); countNextEl.appendChild(nextB);
      const countLowEl = node("span", ` · Baixa: `, "count atendeai-focus-count-low");
      const lowB = document.createElement("b"); lowB.textContent = String(countLow); countLowEl.appendChild(lowB);

      toggleBtn.appendChild(countNowEl);
      toggleBtn.appendChild(countNextEl);
      toggleBtn.appendChild(countLowEl);
    }
    summarySection.appendChild(toggleBtn);
    root.appendChild(summarySection);

    const filterBtn = button(activeFilter === "PRIORITIZED" ? "Filtro ativo" : "Filtrar", () => {
      activeFilter = activeFilter === "ALL" ? "PRIORITIZED" : "ALL";
      applyFilter();
      renderSummary();
    }, "filter");
    filterBtn.setAttribute("aria-pressed", String(activeFilter === "PRIORITIZED"));
    filterBtn.title = activeFilter === "PRIORITIZED"
      ? "Filtro ativo: exibindo apenas atendimentos priorizados (clique para ver todos)"
      : "Filtrar atendimentos com prioridade";
    root.appendChild(filterBtn);
  }

  function applyFilter() {
    const cardList = cards();
    for (const card of cardList) {
      if (activeFilter === "PRIORITIZED") {
        const id = safeIdentity(card);
        const hasPriority = id && cached.items[id.sourceId] && cached.items[id.sourceId].priority;
        card.style.display = hasPriority ? "" : "none";
      } else {
        card.style.display = "";
      }
    }
  }

  function renderCard(card) {
    const cardId = safeIdentity(card);
    const item = cardId ? cached.items[cardId.sourceId] : null;
    let slot = card.querySelector(".atendeai-focus-card-slot");
    if (!slot) {
      slot = node("div", "", "card-slot");
      card.appendChild(slot);
    }
    clear(slot);
    paint(slot);

    const badges = node("div", "", "card-badges");
    slot.appendChild(badges);

    const isCardActive = /(?:^|\s)(?:active|selected|open)(?:\s|$)/.test(String(card.className));

    if (cardId) {
      if (item && item.priority) {
        const prioKey = item.priority.toLowerCase();
        const prioLabel = item.priority === "NOW" ? "● Agora" : item.priority === "NEXT" ? "● Próx." : "● Baixa";
        const ariaLabel = isCardActive ? "Organizar atendimento" : `Organizar ${cardId.displayName}`;
        const badgeBtn = button(prioLabel, e => {
          e?.preventDefault?.(); e?.stopPropagation?.();
          showEditor(cached.items[cardId?.sourceId] || item, e?.currentTarget || e?.target, card, cardId);
        }, `badge atendeai-focus-badge-${prioKey}`);
        badgeBtn.setAttribute("aria-label", ariaLabel);
        badgeBtn.title = `Prioridade: ${prioLabel} — clique para editar`;
        badges.appendChild(badgeBtn);

        // Short tags (up to 3)
        for (const tag of (item.tags || []).slice(0, 3)) {
          badges.appendChild(node("span", tag, "tag"));
        }

        // Local Alert
        if (item.alert) {
          const alertSpan = node("span", "🔔 Resposta", "alert");
          alertSpan.setAttribute("role", "status");
          alertSpan.title = "Cliente respondeu neste atendimento";
          badges.appendChild(alertSpan);
        }

        // Optional Next Step
        if (item.nextStep) {
          const stepDiv = node("div", `↳ ${item.nextStep}`, "step");
          stepDiv.title = item.nextStep;
          slot.appendChild(stepDiv);
        }
      } else {
        // Safe card, not prioritized yet
        const ariaLabel = isCardActive ? "Organizar atendimento" : `Organizar ${cardId.displayName}`;
        const triggerBtn = button("＋ Prioridade", e => {
          e?.preventDefault?.(); e?.stopPropagation?.();
          showEditor(item, e?.currentTarget || e?.target, card, cardId);
        }, "trigger");
        triggerBtn.setAttribute("aria-label", ariaLabel);
        triggerBtn.title = `Definir prioridade para ${cardId.displayName}`;
        badges.appendChild(triggerBtn);
      }
    } else {
      // Unsafe card in real SZ without data-chat-id
      const disabledIndicator = node("span", "Prioridade indisponível", "trigger atendeai-focus-trigger-disabled");
      disabledIndicator.title = "Identidade do atendimento não autenticada no SZ (salvamento bloqueado por segurança)";
      badges.appendChild(disabledIndicator);
    }
  }

  function renderAllCards() {
    cards().forEach(renderCard);
    applyFilter();
  }

  function positionPanel(panel, source) {
    const r = source?.getBoundingClientRect?.();
    const w = window.innerWidth || 1024, h = window.innerHeight || 768, margin = 8;
    const width = Math.min(270, w - margin * 2);
    panel.style.width = `${width}px`;
    if (!r) {
      panel.style.left = `${margin}px`;
      panel.style.top = `${margin}px`;
      return true;
    }
    const height = panel.getBoundingClientRect?.().height || 260;
    let y = r.bottom + 4;
    if (y + height > h - margin) y = r.top - height - 4;
    y = Math.max(margin, Math.min(y, h - height - margin));
    let x = r.left;
    const bounds = safeList()?.getBoundingClientRect?.();
    if (bounds) {
      x = Math.max(bounds.left + 4, Math.min(x, bounds.right - width - 4));
    }
    x = Math.max(margin, Math.min(x, w - width - margin));
    panel.style.left = `${Math.round(x)}px`;
    panel.style.top = `${Math.round(y)}px`;
    return true;
  }

  function showPreview(card) {
    closePreview(); if (editing) return;
    const id = safeIdentity(card), item = id && cached.items[id.sourceId]; if (!item) return;
    preview = node("aside", "", "preview"); preview.setAttribute("role", "tooltip");
    summary(preview, item); document.body.appendChild(preview); paint(preview);
    if (!positionPanel(preview, card)) closePreview();
  }

  function showEditor(item, source, card, cardId) {
    closeEditor(); closePreview(); editing = true; anchor = source;
    const epoch = ++editorEpoch;
    const targetId = cardId || (card ? safeIdentity(card) : (identity || currentIdentity()));
    const currentItem = (targetId && cached.items[targetId.sourceId]) || item;
    const data = normalize(currentItem);
    const panel = node("section", "", "editor");
    editor = panel;
    panel.setAttribute("role", "dialog");

    if (!targetId) {
      panel.setAttribute("aria-label", "Atendimento sem ID seguro");
      panel.appendChild(node("strong", "Atendimento sem identificador seguro", "name"));
      panel.appendChild(node("div", "Identidade do atendimento não identificada de forma segura no SZ. Salvamento bloqueado para não misturar atendimentos.", "feedback"));
      const actions = node("div", "", "actions");
      actions.appendChild(button("Fechar", () => closeEditor(true)));
      panel.appendChild(actions);
      document.body.appendChild(panel);
      paint(panel);
      positionPanel(panel, source);
      return;
    }

    const expected = { ...targetId };
    panel.setAttribute("aria-label", `Organizar ${expected.displayName}`);
    panel.appendChild(node("strong", expected.displayName, "name"));
    panel.appendChild(node("div", "Prioridade — ordem de atenção", "label"));

    let selected = currentItem ? data.priority : "NEXT";
    const tags = new Set(data.tags);
    const choices = node("div", "", "choices");
    const priorityButtons = [];
    for (const [key, label] of Object.entries(PRIORITIES)) {
      const choice = button(label, () => {
        selected = key;
        priorityButtons.forEach(([k, b]) => b.setAttribute("aria-pressed", String(k === selected)));
      }, "choice");
      choice.setAttribute("aria-pressed", String(key === selected));
      priorityButtons.push([key, choice]);
      choices.appendChild(choice);
    }
    panel.appendChild(choices);

    panel.appendChild(node("div", "Tags — situação do atendimento", "label"));
    const tagChoices = node("div", "", "choices");
    for (const tag of TAGS) {
      const choice = button(tag, () => {
        if (tags.has(tag)) tags.delete(tag);
        else tags.add(tag);
        choice.setAttribute("aria-pressed", String(tags.has(tag)));
      }, "choice");
      choice.setAttribute("aria-pressed", String(tags.has(tag)));
      tagChoices.appendChild(choice);
    }
    panel.appendChild(tagChoices);

    const label = node("label", "Próximo passo (opcional)", "label");
    label.setAttribute("for", "atendeai-focus-next-step");
    panel.appendChild(label);

    const input = node("textarea", "", "input");
    input.id = "atendeai-focus-next-step";
    input.rows = 2;
    input.maxLength = 300;
    input.value = data.nextStep;
    panel.appendChild(input);

    const feedback = node("div", "", "feedback");
    feedback.setAttribute("role", "status");
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
      } catch {
        if (epoch !== editorEpoch) return;
        feedback.textContent = "Não foi possível salvar. Tente novamente.";
        panel.querySelectorAll("button, textarea").forEach(b => { b.disabled = false; });
      }
    }

    actions.appendChild(button("Salvar alterações", () => save("save"), "button atendeai-focus-primary"));
    actions.appendChild(button("Cancelar", () => closeEditor(true)));
    actions.appendChild(button("Limpar", () => save("clear")));
    if (currentItem?.alert) actions.appendChild(button("Marcar revisado", () => save("review")));
    panel.appendChild(actions);
    panel.appendChild(feedback);

    document.body.appendChild(panel);
    paint(panel);
    positionPanel(panel, source);

    panel.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); closeEditor(true); }
      if (event.key === "Tab") {
        const controls = Array.from(panel.querySelectorAll("button, textarea")).filter(b => !b.disabled);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });

    priorityButtons[0][1].focus();
  }

  function centralBudget(list) {
    const parent = list.parentElement, bounds = parent.getBoundingClientRect?.();
    if (!bounds) return 242;
    const style = el => globalThis.getComputedStyle ? getComputedStyle(el) : {};
    const pixels = value => Number.parseFloat(value) || 0;
    const parentStyle = style(parent);
    const innerHeight = (parent.clientHeight ?? bounds.height)
      - pixels(parentStyle.paddingTop) - pixels(parentStyle.paddingBottom);
    const siblings = Array.from(parent.children).filter(el => {
      const s = style(el);
      return el !== root && s.display !== "none" && !/^(absolute|fixed)$/.test(s.position);
    });
    const occupied = siblings.reduce((height, el) => {
      const s = style(el);
      return height + (el === list ? 0 : el.getBoundingClientRect?.().height || 0)
        + pixels(s.marginTop) + pixels(s.marginBottom);
    }, 0);
    const gaps = siblings.length * pixels(parentStyle.rowGap);
    const nativeMinimum = Math.max(200, pixels(style(list).minHeight));
    return Math.floor(innerHeight - occupied - gaps - nativeMinimum);
  }

  function safeList() {
    const candidates = [];
    for (const list of document.querySelectorAll(".chats-list, .contacts-list, .contact-list, .scroll-list")) {
      if (list === document.body || !list.parentElement || !list.querySelector(".sz_contact")) continue;
      if (list.querySelector("input, textarea, .msg") || /(?:^|\s)sz_contact(?:\s|$)/.test(String(list.className))) continue;
      const r = list.getBoundingClientRect?.();
      const ownHeight = root?.parentElement === list.parentElement ? root.getBoundingClientRect?.().height || 0 : 0;
      if (r && (r.width < 210 || r.height + ownHeight < 200 || r.left < 0
        || r.right > window.innerWidth / 2 || r.top < 0 || r.bottom > window.innerHeight)) continue;
      const parent = list.parentElement;
      let insideCard = false;
      for (let el = parent; el; el = el.parentElement) {
        if (el.classList?.contains("sz_contact")) { insideCard = true; break; }
      }
      if (insideCard) continue;
      if (parent === document.body && globalThis.getComputedStyle) continue;
      if (Array.from(parent.querySelectorAll("input, textarea, .msg")).some(el => !root?.contains(el))) continue;
      const bounds = parent.getBoundingClientRect?.();
      if (bounds && (bounds.width > window.innerWidth / 2 || bounds.left < 0
        || bounds.right > window.innerWidth / 2 || bounds.height < 242)) continue;
      if (globalThis.getComputedStyle) {
        const parentStyle = getComputedStyle(list.parentElement), listStyle = getComputedStyle(list);
        if (parentStyle.display !== "flex" || parentStyle.flexDirection !== "column"
          || /^(absolute|fixed)$/.test(listStyle.position)
          || Number(listStyle.flexShrink) === 0 || !/^(auto|scroll)$/.test(listStyle.overflowY)) continue;
      }
      if (centralBudget(list) < 42) continue;
      if (Array.from(parent.querySelectorAll(".sz_contact")).some(card => !list.contains(card))) continue;
      candidates.push(list);
    }
    return candidates.length === 1 ? candidates[0] : null;
  }

  function placeCentral() {
    const list = safeList();
    if (!list) { root?.remove(); root = null; closeEditor(); closePreview(); return; }
    const maxHeight = `${Math.min(242, centralBudget(list))}px`;
    if (root?.parentElement === list.parentElement) {
      if (root.style.maxHeight !== maxHeight) root.style.maxHeight = maxHeight;
      const siblings = Array.from(list.parentElement.children);
      if (siblings[siblings.indexOf(list) - 1] !== root) list.parentElement.insertBefore(root, list);
      return;
    }
    root?.remove(); root = node("section", "", "central"); root.setAttribute("aria-label", "AtendeAI — Prioridades locais");
    root.style.maxHeight = maxHeight;
    list.parentElement.insertBefore(root, list); paint(root); renderKey = "";
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
    const request = ++generation; placeCentral();
    const current = currentIdentity(), messageId = verifiedInbound(current);
    if (current?.sourceId !== identity?.sourceId) { closeEditor(); closePreview(); }
    identity = current;
    try {
      const state = await enqueue(async () => {
        const state = await read(), item = current && state.items[current.sourceId];
        if (item && messageId && currentIdentity()?.sourceId === current.sourceId && item.alert?.messageId !== messageId) {
          state.items[current.sourceId] = { ...item, alert: { messageId, detectedAt: Date.now() } };
          await storage("set", { [KEY]: state });
        }
        return state;
      });
      if (request !== generation) return;
      if (currentIdentity()?.sourceId !== current?.sourceId) { schedule(); return; }
      cached = state;
      const key = JSON.stringify([identity, tracked(), activeFilter]);
      if (key !== renderKey && !editing) {
        renderKey = key;
        renderSummary();
      }
      renderAllCards();
    } catch {
      if (request !== generation) return;
      cached = { items: {} }; renderKey = "";
      if (root) {
        clear(root);
        root.appendChild(node("div", "Prioridades indisponíveis", "feedback"));
      }
      renderAllCards();
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
    document.querySelectorAll(".atendeai-focus-anchor, .atendeai-focus-badge, .atendeai-focus-card, .atendeai-focus-card-slot").forEach(el => el.remove());
    closeEditor(); closePreview(); root?.remove(); root = null; identity = null; renderKey = ""; inboundWatch = null;
    cards().forEach(c => { c.style.display = ""; });
    activeFilter = "ALL";
    if (!observer) {
      observer = new MutationObserver(records => {
        if ((root && !document.body.contains(root)) || records.some(r => !own(r.target) && !(r.type === "childList" && [...r.addedNodes, ...r.removedNodes].length && [...r.addedNodes, ...r.removedNodes].every(own)))) {
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
