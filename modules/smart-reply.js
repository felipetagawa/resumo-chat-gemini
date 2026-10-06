// Current-chat drafts only. No recovery storage, private notes or send actions.
const SmartReplyModule = (() => {
  const PROFILE_KEY = "atendeai_smart_reply_profile";
  const PROFILES = { DIRECT: "Direta", EMPATHETIC: "Empática", DIDACTIC: "Didática" };
  const PANEL_ID = "atendeai-smart-reply";
  let session = null;
  const text = value => String(value || "").replace(/\s+/g, " ").trim();

  function chatToken() {
    const card = document.querySelector(".sz_contact.active");
    if (!card) return "";
    for (const attr of ["data-chat-id", "data-contact-id", "data-id"]) {
      const value = text(card.getAttribute(attr));
      const digits = value.replace(/\D/g, "");
      if (value && !(/^[\d\s()+.-]+$/.test(value) && digits.length >= 10 && digits.length <= 15)) return `${attr}:${value}`;
    }
    const src = card.querySelector('img[alt="platform"]')?.getAttribute("src") || "";
    const platform = src.match(/\/assets\/img\/platform\/mini\/([\w-]+)\.svg(?:[?#].*)?$/i)?.[1]?.toLowerCase();
    const name = text(card.querySelector(".contact-name")?.textContent).toLowerCase();
    const time = card.querySelector('.contact-times[phase="attendance"] .times');
    const timestamp = text(time?.getAttribute("title") || time?.textContent);
    if (!platform || !name || !/^\d{2}\/\d{2}\/\d{2}(?:\d{2})? \d{2}:\d{2}(?::\d{2})?$/.test(timestamp)) return "";
    return `attendance:${platform}|${name.replace(/%/g, "%25").replace(/\|/g, "%7C")}|${timestamp}`;
  }

  function boundedConversation(conversation) {
    if (conversation.length <= 16000) return conversation;
    const latest = Array.from(document.querySelectorAll(".msg")).reverse().find(msg => {
      const name = text(msg.querySelector(".name")?.innerText);
      return !msg.classList.contains("sent") && !/^autom[aá]tico$/i.test(name)
        && text(msg.querySelector(".message span")?.innerText);
    });
    const name = latest?.querySelector(".name")?.innerText?.trim() || "";
    const message = latest?.querySelector(".message span")?.innerText?.trim() || "";
    const lastCustomer = message ? `${name ? name + ": " : ""}${message}` : "";
    const marker = "\n[trecho intermediário omitido]\n";
    if (!lastCustomer) return conversation.slice(0, 4000) + marker + conversation.slice(-11900);
    return conversation.slice(0, 2000) + marker + "Última interação do cliente:\n"
      + lastCustomer.slice(-6000) + marker + conversation.slice(-7800);
  }

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
  function close() {
    session?.observer?.disconnect();
    session = null;
    document.getElementById(PANEL_ID)?.remove();
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
      s.stale = text(ChatCaptureModule.capturarTextoChat()) !== s.freshness.conversation
        || text(ObservationsModule.getPromptComplementForCurrentChat()) !== s.freshness.promptComplement;
    }
    const warning = changed ? "O atendimento ativo mudou. Volte à conversa original ou clique em Sugerir resposta no atendimento desejado."
      : s.stale ? "Novas informações chegaram neste atendimento. Gere uma nova resposta." : "";
    if (s.warning.textContent !== warning) s.warning.textContent = warning;
    if (s.panel?.setAttribute) s.panel.setAttribute("aria-busy", s.busy ? "true" : "false");
    setDisabled(s.insert, changed || s.stale || s.busy || !s.reply || s.profileChanged);
    setDisabled(s.regenerate, changed || s.stale || s.busy || !s.snapshot);
    setDisabled(s.profile, s.busy);
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
      const payload = { action: "gerarResposta", conversation: s.snapshot.conversation, profile: s.profile.value, regenerate };
      if (s.snapshot.promptComplement) payload.promptComplement = s.snapshot.promptComplement;
      const result = await MessagingHelper.send(payload);
      if (session !== s) return;
      if (!result?.success || !String(result.reply || "").trim()) throw new Error(result?.erro || "Não foi possível sugerir uma resposta. Tente novamente.");
      s.reply = result.reply.trim();
      s.profileChanged = false;
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
    if (!el || !ChatCaptureModule.capturarTextoChat().trim()) {
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
  async function open() {
    close();
    const s = { token: chatToken(), reply: "", busy: true, profileChanged: false, stale: false };
    session = s;
    const panel = node("section", "", "smart-reply-preview");
    panel.id = PANEL_ID;
    panel.setAttribute("aria-label", "Resposta sugerida");
    s.panel = panel;
    const header = node("div", "", "smart-reply-header");
    const heading = node("div", "", "smart-reply-heading");
    heading.appendChild(node("strong", "Resposta sugerida"));
    heading.appendChild(node("span", "Revise antes de inserir no campo de mensagem.", "smart-reply-kicker"));
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
    for (const [value, label] of Object.entries(PROFILES)) { const option = node("option", label); option.value = value; s.profile.appendChild(option); }
    s.profile.value = "DIRECT";
    s.profile.addEventListener("change", async () => {
      if (!Object.hasOwn(PROFILES, s.profile.value)) s.profile.value = "DIRECT";
      s.profileChanged = true;
      s.status.textContent = "Perfil padrão salvo. Clique em Outra resposta para aplicar ao rascunho.";
      syncChat(s);
      try { await StorageHelper.set({ [PROFILE_KEY]: s.profile.value }); }
      catch { s.status.textContent = "Não foi possível salvar o perfil padrão."; }
    });
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
    for (const el of [s.insert, s.regenerate, s.profile]) actions.appendChild(el);
    for (const el of [header, s.warning, s.preview, s.status, actions, s.choices]) panel.appendChild(el);
    document.body.appendChild(panel);
    const conversation = String(ChatCaptureModule.capturarTextoChat() || "").trim();
    const promptComplement = ObservationsModule.getPromptComplementForCurrentChat();
    if (!conversation || !s.token || promptComplement.length > 2000) {
      s.busy = false;
      s.status.textContent = !conversation ? "Abra uma conversa com mensagens para sugerir uma resposta."
        : !s.token ? "Não foi possível identificar com segurança o atendimento ativo. Reabra a conversa."
          : "As observações excedem o limite de 2.000 caracteres.";
      syncChat(s); return;
    }
    s.snapshot = { conversation: boundedConversation(conversation), promptComplement };
    s.freshness = { conversation: text(conversation), promptComplement: text(promptComplement) };
    s.observer = new MutationObserver(() => syncChat(s));
    s.observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    syncChat(s);
    try {
      const saved = await StorageHelper.get([PROFILE_KEY]);
      if (session !== s) return;
      s.profile.value = Object.hasOwn(PROFILES, saved?.[PROFILE_KEY]) ? saved[PROFILE_KEY] : "DIRECT";
    } catch { /* Default DIRECT remains available if local storage fails. */ }
    if (session !== s) return;
    s.busy = false;
    syncChat(s);
    await generate(s, false);
  }
  document.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
  // Textarea value edits do not create DOM mutations; capture input without intercepting it.
  document.addEventListener("input", () => { if (session) syncChat(session); }, true);
  return { open };
})();
window.SmartReplyModule = SmartReplyModule;
