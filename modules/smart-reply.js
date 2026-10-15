// Current-chat drafts only, rendered inside the AtendeAI dock. Never sends messages.
const SmartReplyModule = (() => {
  const PANEL_ID = "atendeai-smart-reply";
  const DOCK_ID = "containerBotoesGemini";
  const LEGACY_KEYS = ["atendeai_smart_reply_profiles_v1", "atendeai_smart_reply_profile"];
  const GENERIC_ERROR = "Não foi possível sugerir uma resposta. Tente novamente.";
  const CHANGED = "O atendimento mudou. Clique em Sugerir resposta no atendimento desejado.";
  let session = null;
  const text = value => String(value || "").replace(/\s+/g, " ").trim();
  const chatToken = () => ChatCaptureModule.identificarAtendimentoResposta();
  const samples = () => globalThis.StyleSamplesModule;
  const capture = () => ChatCaptureModule.capturarConversaRotulada(samples()?.selfName?.() || "");

  const draftText = el => el.isContentEditable || el.contentEditable === "true" ? el.textContent || "" : el.value || "";
  function setComposer(el, value) {
    el.focus();
    if (el.isContentEditable || el.contentEditable === "true") {
      el.textContent = value;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      if (setter) setter.call(el, value); else el.value = value;
      el.setSelectionRange(value.length, value.length);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function node(tag, label, className) {
    const el = document.createElement(tag);
    if (label) el.textContent = label;
    if (className) el.className = className;
    return el;
  }
  function setDisabled(el, value) {
    // Avoid generating a new mutation for the card's own observer.
    if (el.disabled !== value) el.disabled = value;
  }
  function setPreview(s, value, loading = false) {
    Array.from(s.preview.children).forEach(child => child.remove());
    s.preview.textContent = value;
    if (loading) for (let i = 0; i < 3; i++) s.preview.appendChild(node("span", "", "smart-reply-skeleton"));
  }
  function showChoices(s, visible) { s.choices.hidden = !visible; s.actions.hidden = visible; }
  function lockDock(dock) {
    const previous = { width: dock.style.width, height: dock.style.height };
    // Freeze the dock's footprint: the card may only use pixels the dock already covers.
    dock.style.width = `${dock.offsetWidth}px`;
    dock.style.height = `${dock.offsetHeight}px`;
    dock.setAttribute("data-reply-open", "true");
    return () => {
      dock.style.width = previous.width; dock.style.height = previous.height;
      dock.removeAttribute("data-reply-open");
    };
  }
  function close() {
    const s = session, panel = document.getElementById(PANEL_ID);
    const restoreFocus = panel && document.activeElement && panel.contains(document.activeElement);
    s?.observer?.disconnect(); s?.unsubscribe?.(); s?.unlock?.();
    session = null;
    panel?.remove();
    if (restoreFocus) document.getElementById("btnSmartReply")?.focus();
  }
  function current(s) { return session === s && !s.identityChanged && !!s.token && chatToken() === s.token; }
  function syncChat(s) {
    if (session !== s) return;
    if (s.token && chatToken() !== s.token) s.identityChanged = true;
    const changed = !current(s);
    if (!changed && s.freshness && !s.stale && !s.busy) {
      s.stale = text(capture().fullConversation) !== s.freshness.conversation
        || text(SmartReplyContextModule.getForCurrentChat()) !== s.freshness.promptComplement;
    }
    const warning = !s.token ? "" : changed ? CHANGED : s.stale ? "Mensagem nova. Use ↻ Outra." : "";
    if (s.warning.textContent !== warning) s.warning.textContent = warning;
    const busy = s.busy ? "true" : "false";
    if (s.panel.getAttribute("aria-busy") !== busy) s.panel.setAttribute("aria-busy", busy);
    setDisabled(s.insert, changed || s.stale || s.busy || !s.reply);
    setDisabled(s.regenerate, changed || s.busy);
    setDisabled(s.direct, changed || s.busy);
    if (s.badge.hidden === s.usedComplement) s.badge.hidden = !s.usedComplement;
    if ((changed || s.stale) && !s.choices.hidden) showChoices(s, false);
  }
  async function generate(s, regenerate) {
    syncChat(s);
    if (session !== s || s.busy || !current(s)) return;
    const instruction = text(s.direct.value).slice(0, 600);
    s.busy = true; s.reply = ""; s.status.textContent = "";
    setPreview(s, "", true); showChoices(s, false);
    syncChat(s);
    try {
      await SmartReplyContextModule.sync();
      if (session !== s || !current(s)) return;
      const snapshot = capture();
      const promptComplement = SmartReplyContextModule.getForCurrentChat();
      if (!snapshot.conversation) throw new Error("Abra uma conversa com mensagens para sugerir uma resposta.");
      if (promptComplement.length > 2000) throw new Error("O adendo excede o limite de 2.000 caracteres.");
      // Every generation reads the chat as it is now; freshness then guards the shown reply.
      s.freshness = { conversation: text(snapshot.fullConversation), promptComplement: text(promptComplement) };
      s.stale = false; s.usedComplement = !!promptComplement;
      const payload = { action: "gerarResposta", conversation: snapshot.conversation, regenerate };
      if (promptComplement) payload.promptComplement = promptComplement;
      if (instruction) payload.replyInstruction = instruction;
      const styleSamples = samples()?.forRequest?.(snapshot.fullConversation) || [];
      if (styleSamples.length) payload.styleSamples = styleSamples;
      const result = await MessagingHelper.send(payload);
      if (session !== s) return;
      if (!result?.success || !String(result.reply || "").trim()) throw new Error(result?.erro || GENERIC_ERROR);
      s.busy = false; syncChat(s);
      // The chat may have changed while the API answered: never show a reply for another context.
      if (!current(s) || s.stale) { setPreview(s, ""); return; }
      s.reply = result.reply.trim();
      setPreview(s, s.reply);
    } catch (err) {
      if (session !== s) return;
      setPreview(s, "");
      s.status.textContent = err?.message || GENERIC_ERROR;
    } finally {
      if (session === s) {
        if (s.busy && !s.reply && !s.status.textContent) setPreview(s, "");
        s.busy = false; syncChat(s);
      }
    }
  }
  function insert(s, mode, expected) {
    syncChat(s);
    if (!current(s) || s.stale || s.busy || !s.reply) return;
    const el = ChatCaptureModule.encontrarComposer();
    if (!el || !capture().conversation.trim()) {
      s.status.textContent = "Não foi possível localizar com segurança o campo de mensagem deste atendimento.";
      return;
    }
    const value = draftText(el);
    if (value.trim() && (!mode || expected?.el !== el || expected.value !== value)) {
      showChoices(s, true);
      s.pendingDraft = { el, value };
      s.status.textContent = "Já existe um rascunho. Escolha substituir, acrescentar ou cancelar.";
      return;
    }
    // Recheck immediately before mutation; choices never retain a different composer.
    syncChat(s);
    if (!current(s) || s.stale || ChatCaptureModule.encontrarComposer() !== el) return;
    setComposer(el, mode === "append" && value ? `${value}\n${s.reply}` : s.reply);
    samples()?.noteInserted?.(s.reply);
    close();
  }
  async function open() {
    const token = chatToken();
    if (session && session.token === token && current(session)) { session.panel.focus(); return; }
    close();
    const dock = document.getElementById(DOCK_ID);
    if (!dock) return;
    const s = { token, reply: "", busy: false, stale: false, identityChanged: false, usedComplement: false };
    session = s;
    const panel = node("section", "", "smart-reply-card");
    panel.id = PANEL_ID;
    panel.setAttribute("aria-label", "Sugestão de resposta");
    panel.setAttribute("tabindex", "-1");
    s.panel = panel;
    const header = node("div", "", "smart-reply-header");
    header.appendChild(node("strong", "Sugestão"));
    s.badge = node("span", "adendo", "smart-reply-badge");
    s.badge.title = "O Adendo para resposta foi usado"; s.badge.hidden = true;
    header.appendChild(s.badge);
    const x = node("button", "×", "smart-reply-close"); x.type = "button";
    x.setAttribute("aria-label", "Fechar sugestão");
    x.addEventListener("click", close); header.appendChild(x);
    s.preview = node("div", "", "smart-reply-text");
    s.preview.setAttribute("tabindex", "0");
    s.preview.setAttribute("aria-label", "Texto sugerido");
    s.preview.setAttribute("aria-live", "polite");
    s.warning = node("div", "", "smart-reply-warning"); s.warning.setAttribute("role", "status");
    s.status = node("div", "", "smart-reply-status"); s.status.setAttribute("role", "status");
    s.direct = node("input", "", "smart-reply-direct");
    s.direct.type = "text"; s.direct.maxLength = 600; s.direct.placeholder = "Direcionar: o que dizer?";
    s.direct.setAttribute("aria-label", "Direcionar a resposta. Enter gera de novo.");
    s.direct.addEventListener("keydown", event => {
      if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      return generate(s, false);
    });
    s.regenerate = node("button", "↻ Outra", "smart-reply-secondary"); s.regenerate.type = "button";
    s.regenerate.addEventListener("click", () => generate(s, true));
    s.insert = node("button", "Inserir", "smart-reply-primary"); s.insert.type = "button";
    s.insert.addEventListener("click", () => insert(s));
    s.actions = node("div", "", "smart-reply-actions");
    s.actions.appendChild(s.regenerate); s.actions.appendChild(s.insert);
    s.choices = node("div", "", "smart-reply-draft-choices"); s.choices.hidden = true;
    for (const [label, mode, cls] of [["Substituir", "replace", "smart-reply-primary"],
      ["Acrescentar", "append", "smart-reply-secondary"], ["Cancelar", "cancel", "smart-reply-secondary"]]) {
      const button = node("button", label, cls); button.type = "button";
      button.addEventListener("click", () => {
        if (mode === "cancel") { showChoices(s, false); s.status.textContent = ""; }
        else insert(s, mode, s.pendingDraft);
      });
      s.choices.appendChild(button);
    }
    panel.addEventListener("keydown", event => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); insert(s); }
    });
    for (const el of [header, s.preview, s.warning, s.status, s.direct, s.actions, s.choices]) panel.appendChild(el);
    s.unlock = lockDock(dock);
    dock.appendChild(panel);
    globalThis.ThemeModule?.apply?.(panel);
    panel.focus();
    if (!token) {
      s.status.textContent = "Não foi possível identificar com segurança o atendimento ativo. Reabra a conversa.";
      syncChat(s); return;
    }
    ChatCaptureModule.observarAtendimentoResposta();
    s.unsubscribe = SmartReplyContextModule.onChanged(() => syncChat(s));
    s.observer = new MutationObserver(records => {
      if (records.some(record => !s.panel.contains(record.target))) syncChat(s);
    });
    s.observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    await generate(s, false);
  }
  function retireLegacyProfiles() {
    try { chrome.storage.local.remove(LEGACY_KEYS, () => void chrome.runtime?.lastError); }
    catch { /* Extension context invalidated: nothing to retire now. */ }
  }
  document.addEventListener("keydown", event => { if (event.key === "Escape" && session) close(); });
  // Textarea value edits do not create DOM mutations; capture input without intercepting it.
  document.addEventListener("input", () => { if (session) syncChat(session); }, true);
  return { open, close, retireLegacyProfiles };
})();
window.SmartReplyModule = SmartReplyModule;
