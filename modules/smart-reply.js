// Current-chat drafts only. No recovery storage, private notes or send actions.
const SmartReplyModule = (() => {
  const PANEL_ID = "atendeai-smart-reply";
  const CONTEXT_MODES = {
    RECENT: { label: "Recentes", description: "Últimas 12 mensagens textuais" },
    LAST_CUSTOMER: { label: "Última mensagem", description: "Última mensagem textual do cliente" },
    AVAILABLE: { label: "Conversa disponível", description: "Todo o texto disponível, até 16.000 caracteres" }
  };
  const contextMode = mode => Object.hasOwn(CONTEXT_MODES, mode) ? mode : "RECENT";
  let session = null;
  const text = value => String(value || "").replace(/\s+/g, " ").trim();

  const chatToken = () => ChatCaptureModule.identificarAtendimentoResposta();

  function composer() {
    const candidates = Array.from(document.querySelectorAll('textarea[placeholder*="Digite"], div[contenteditable="true"][role="textbox"], div[contenteditable="true"][placeholder*="Digite"], #twemoji-textarea'))
      .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0 && getComputedStyle(el).visibility !== "hidden"
        && !el.closest?.(`#${PANEL_ID}, #containerBotoesGemini, [id^="atendeai-"]`));
    return candidates.length === 1 ? candidates[0] : null;
  }
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
  function mountContextControl(button) {
    ChatCaptureModule.observarAtendimentoResposta();
    const element = node("div", "", "atendeai-reply-control");
    const select = node("select", "", "atendeai-reply-context-select");
    select.id = "atendeai-reply-context-mode";
    select.setAttribute("aria-label", "Contexto para a próxima resposta");
    for (const [value, mode] of Object.entries(CONTEXT_MODES)) {
      const option = node("option", `${mode.label} — ${mode.description}`);
      option.value = value; select.appendChild(option);
    }
    const arrow = node("span", "▾", "atendeai-reply-context-arrow");
    arrow.setAttribute("aria-hidden", "true");
    function paint() {
      const mode = contextMode(select.value), label = CONTEXT_MODES[mode];
      select.title = `Contexto: ${label.label}. ${label.description}. Escolha e clique em Sugerir resposta.`;
      button.title = `Sugerir resposta · ${label.label}`;
      element.setAttribute("data-context-chosen", String(mode !== "RECENT"));
    }
    select.value = "RECENT"; select.addEventListener("change", paint);
    element.appendChild(button); element.appendChild(select); element.appendChild(arrow); paint();
    return { element, consumeMode() {
      const mode = contextMode(select.value);
      select.value = "RECENT"; paint(); return mode;
    } };
  }
  function close() {
    const panel = document.getElementById(PANEL_ID);
    const restoreFocus = panel && document.activeElement && panel.contains(document.activeElement);
    session?.observer?.disconnect();
    session?.unsubscribe?.();
    session?.profilesUnsubscribe?.();
    session = null;
    document.getElementById(PANEL_ID)?.remove();
    if (restoreFocus) document.getElementById("btnSmartReply")?.focus();
  }
  function current(s) { return session === s && s.token && chatToken() === s.token; }
  function setDisabled(el, value) {
    // Avoid generating a new attribute mutation for the preview's own observer.
    if (el.disabled !== value) el.disabled = value;
  }
  function syncChat(s) {
    if (session !== s) return;
    const changed = !current(s);
    // Compare the full capture, including any text omitted from the API payload.
    // Once stale, only an explicit new suggestion can capture a new snapshot.
    if (!changed && s.freshness && !s.stale) {
      s.stale = text(ChatCaptureModule.capturarContextoResposta(s.mode).fullConversation) !== s.freshness.conversation
        || text(SmartReplyContextModule.getForCurrentChat()) !== s.freshness.promptComplement;
    }
    const warning = changed ? "O atendimento ativo mudou. Volte à conversa original ou clique em Sugerir resposta no atendimento desejado."
      : s.stale ? "Novas informações chegaram neste atendimento. Gere uma nova resposta." : "";
    if (s.warning.textContent !== warning) s.warning.textContent = warning;
    const nextBusy = s.busy ? "true" : "false";
    if (s.panel?.getAttribute("aria-busy") !== nextBusy) s.panel.setAttribute("aria-busy", nextBusy);
    setDisabled(s.insert, changed || s.stale || s.busy || !s.reply || s.profileChanged);
    setDisabled(s.regenerate, changed || s.stale || s.busy || !s.snapshot);
    setDisabled(s.profile, s.busy);
    setDisabled(s.manageProfiles, s.busy);
    if ((changed || s.stale) && !s.choices.hidden) s.choices.hidden = true;
  }
  async function generate(s, regenerate) {
    syncChat(s);
    if (session !== s || s.busy || !current(s) || s.stale || !s.snapshot) return;
    s.busy = true;
    s.reply = "";
    s.preview.textContent = "Gerando resposta…";
    s.status.textContent = "";
    s.choices.hidden = true;
    syncChat(s);
    try {
      const style = SmartReplyProfilesModule.wire(s.profile.value);
      s.generatedStyle = JSON.stringify(style);
      const payload = { action: "gerarResposta", conversation: s.snapshot.conversation, ...style, regenerate };
      if (s.snapshot.promptComplement) payload.promptComplement = s.snapshot.promptComplement;
      const result = await MessagingHelper.send(payload);
      if (session !== s) return;
      if (!result?.success || !String(result.reply || "").trim()) throw new Error(result?.erro || "Não foi possível sugerir uma resposta. Tente novamente.");
      s.reply = result.reply.trim();
      s.profileChanged = s.generatedStyle !== JSON.stringify(SmartReplyProfilesModule.wire(s.profile.value));
      s.preview.textContent = s.reply;
    } catch (err) {
      if (session !== s) return;
      s.preview.textContent = "";
      s.status.textContent = err?.message || "Não foi possível sugerir uma resposta. Tente novamente.";
    } finally {
      if (session === s) { s.busy = false; syncChat(s); }
    }
  }
  function insert(s, mode, expected) {
    syncChat(s);
    if (!current(s) || s.stale || s.busy || !s.reply || s.profileChanged) return;
    const el = composer();
    if (!el || !ChatCaptureModule.capturarContextoResposta(s.mode).conversation.trim()) {
      s.status.textContent = "Não foi possível localizar com segurança o campo de mensagem deste atendimento.";
      return;
    }
    const value = draftText(el);
    if (value.trim() && (!mode || expected?.el !== el || expected.value !== value)) {
      s.choices.hidden = false;
      s.pendingDraft = { el, value };
      s.status.textContent = "Já existe um rascunho. Escolha substituir, acrescentar ou cancelar.";
      return;
    }
    // Recheck immediately before mutation; choices never retain a different composer.
    syncChat(s);
    if (!current(s) || s.stale || composer() !== el) return;
    setComposer(el, mode === "append" && value ? `${value}\n${s.reply}` : s.reply);
    close();
  }
  function refreshProfiles(s, changed = false) {
    const previous = s.profile.value, previousStyle = s.selectedStyle;
    Array.from(s.profile.children).forEach(el => el.remove());
    for (const p of SmartReplyProfilesModule.list()) {
      const option = node("option", p.builtin ? p.name : `Meu: ${p.name}`); option.value = p.id; s.profile.appendChild(option);
    }
    s.profile.value = SmartReplyProfilesModule.defaultId();
    s.selectedStyle = JSON.stringify(SmartReplyProfilesModule.wire(s.profile.value));
    if (changed && (previous !== s.profile.value || previousStyle !== s.selectedStyle)) {
      s.profileChanged = true;
      s.status.textContent = "Perfil alterado. Clique em Outra resposta para aplicar ao rascunho.";
    }
    syncChat(s);
  }
  async function open(mode = "RECENT") {
    close();
    const s = { token: chatToken(), mode: contextMode(mode), reply: "", busy: true, profileChanged: false, stale: false };
    session = s;
    const panel = node("section", "", "smart-reply-preview");
    panel.id = PANEL_ID;
    panel.setAttribute("aria-label", "Resposta sugerida");
    panel.setAttribute("tabindex", "-1");
    s.panel = panel;
    const header = node("div", "", "smart-reply-header");
    const heading = node("div", "", "smart-reply-heading");
    heading.appendChild(node("strong", "Resposta sugerida"));
    heading.appendChild(node("span", "Revise antes de inserir no campo de mensagem.", "smart-reply-kicker"));
    const contextBadge = node("span", `Contexto: ${CONTEXT_MODES[s.mode].label}`, "atendeai-reply-context-badge");
    contextBadge.title = CONTEXT_MODES[s.mode].description;
    heading.appendChild(contextBadge);
    header.appendChild(heading);
    const x = node("button", "×", "smart-reply-close"); x.type = "button"; x.setAttribute("aria-label", "Fechar resposta sugerida");
    x.addEventListener("click", close); header.appendChild(x);
    s.preview = node("div", "", "smart-reply-text");
    s.status = node("div", "", "smart-reply-status"); s.status.setAttribute("role", "status");
    s.warning = node("div", "", "smart-reply-warning"); s.warning.setAttribute("role", "status");
    s.insert = node("button", "Inserir", "smart-reply-insert"); s.insert.type = "button";
    s.insert.addEventListener("click", () => insert(s));
    s.regenerate = node("button", "↻ Outra resposta", "smart-reply-regenerate"); s.regenerate.type = "button";
    s.regenerate.addEventListener("click", () => generate(s, true));
    s.profile = node("select", "", "smart-reply-profile"); s.profile.setAttribute("aria-label", "Perfil da resposta e padrão");
    s.profile.value = "DIRECT";
    s.profile.addEventListener("change", async () => {
      if (!SmartReplyProfilesModule.get(s.profile.value)) s.profile.value = "DIRECT";
      s.profileChanged = true;
      s.status.textContent = "Perfil padrão salvo. Clique em Outra resposta para aplicar ao rascunho.";
      syncChat(s);
      try { await SmartReplyProfilesModule.setDefault(s.profile.value); }
      catch { s.status.textContent = "Não foi possível salvar o perfil padrão."; }
    });
    s.manageProfiles = node("button", "Perfis", "smart-reply-regenerate"); s.manageProfiles.type = "button";
    s.manageProfiles.setAttribute("aria-expanded", "false");
    s.choices = node("div", "", "smart-reply-draft-choices"); s.choices.hidden = true;
    for (const [label, mode] of [["Substituir", "replace"], ["Acrescentar", "append"], ["Cancelar", "cancel"]]) {
      const choiceClass = mode === "replace" ? "smart-reply-choice-primary"
        : mode === "cancel" ? "smart-reply-choice-ghost" : "smart-reply-choice";
      const button = node("button", label, choiceClass); button.type = "button";
      button.addEventListener("click", () => {
        if (mode === "cancel") { s.choices.hidden = true; s.status.textContent = ""; }
        else insert(s, mode, s.pendingDraft);
      });
      s.choices.appendChild(button);
    }
    const actions = node("div", "", "smart-reply-actions");
    for (const el of [s.insert, s.regenerate, s.profile, s.manageProfiles]) actions.appendChild(el);
    for (const el of [header, s.warning, s.preview, s.status, actions, s.choices]) panel.appendChild(el);
    document.body.appendChild(panel);
    panel.focus();
    globalThis.ThemeModule?.apply?.(panel);
    const manager = SmartReplyProfilesUI.mount(panel);
    s.manageProfiles.addEventListener("click", () => s.manageProfiles.setAttribute("aria-expanded", String(manager.toggle())));
    refreshProfiles(s);
    await SmartReplyContextModule.sync();
    if (session !== s) return;
    if (s.token && chatToken() !== s.token) { s.busy = false; syncChat(s); return; }
    const capture = ChatCaptureModule.capturarContextoResposta(s.mode);
    const conversation = capture.conversation;
    const promptComplement = SmartReplyContextModule.getForCurrentChat();
    if (!conversation || !s.token || promptComplement.length > 2000) {
      s.busy = false;
      s.status.textContent = !conversation ? s.mode === "LAST_CUSTOMER"
        ? "Não há mensagem textual válida do cliente neste atendimento. Escolha outro contexto ou aguarde uma mensagem."
        : "Abra uma conversa com mensagens para sugerir uma resposta."
        : !s.token ? "Não foi possível identificar com segurança o atendimento ativo. Reabra a conversa."
          : "O adendo excede o limite de 2.000 caracteres.";
      syncChat(s); return;
    }
    s.snapshot = { conversation, promptComplement };
    if (promptComplement) heading.appendChild(node("span", "Usando adendo para resposta", "smart-reply-kicker"));
    s.unsubscribe = SmartReplyContextModule.onChanged(() => syncChat(s));
    s.freshness = { conversation: text(capture.fullConversation), promptComplement: text(promptComplement) };
    s.observer = new MutationObserver(records => {
      if (records.some(record => !s.panel.contains(record.target))) syncChat(s);
    });
    s.observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    syncChat(s);
    try {
      await SmartReplyProfilesModule.load();
      if (session !== s) return;
      refreshProfiles(s);
      s.profilesUnsubscribe = SmartReplyProfilesModule.onChanged(() => { if (session === s) refreshProfiles(s, true); });
    } catch { /* Default DIRECT remains available if local storage fails. */ }
    if (session !== s) return;
    s.busy = false;
    syncChat(s);
    await generate(s, false);
  }
  document.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
  // Textarea value edits do not create DOM mutations; capture input without intercepting it.
  document.addEventListener("input", () => { if (session) syncChat(session); }, true);
  return { open, mountContextControl };
})();
window.SmartReplyModule = SmartReplyModule;
