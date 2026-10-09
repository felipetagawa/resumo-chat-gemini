// Current-chat drafts only. No recovery storage, private notes or send actions.
const SmartReplyModule = (() => {
  const PANEL_ID = "atendeai-smart-reply";
  const CONTEXT_MODES = {
    RECENT: { label: "Recentes", description: "Últimas 12 mensagens textuais" },
    LAST_CUSTOMER: { label: "Última mensagem do cliente", description: "Última mensagem textual do cliente" },
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
    button.title = 'Preparar resposta';
    return { element: button, consumeMode: () => 'RECENT' };
  }
  // Compact keyboard-native radio controls; no browser option popup.
  function choiceControl(label, options, value, onChange) {
    const group = node('div', '', 'smart-reply-options');
    group.setAttribute('role', 'radiogroup'); group.setAttribute('aria-label', label);
    group.value = value;
    group.paint = () => {
      for (const button of group.children) {
        const selected = button.value === group.value;
        if (button.getAttribute('aria-checked') !== String(selected)) button.setAttribute('aria-checked', String(selected));
        button.tabIndex = selected ? 0 : -1;
        button.disabled = !!group.disabled;
      }
    };
    group.addOptions = entries => {
      const children = Array.from(group.children);
      // Updating only the default must not replace the technician's focused radio.
      if (children.length === entries.length && entries.every(([id, name], i) => children[i].value === id && children[i].textContent === name)) {
        group.paint(); return;
      }
      const restoreFocus = group.contains(document.activeElement);
      children.forEach(el => el.remove());
      for (const [id, name] of entries) {
        const button = node('button', name, 'smart-reply-option');
        button.type = 'button'; button.value = id; button.setAttribute('role', 'radio');
        button.addEventListener('click', () => {
          if (group.disabled) return;
          group.value = id; group.paint(); onChange();
        });
        button.addEventListener('keydown', event => {
          if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key) || group.disabled) return;
          event.preventDefault();
          const buttons = Array.from(group.children), index = buttons.indexOf(button);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length-1
            : (index + (['ArrowLeft','ArrowUp'].includes(event.key) ? -1 : 1) + buttons.length) % buttons.length;
          buttons[next].click(); buttons[next].focus();
        });
        group.appendChild(button);
      }
      group.paint();
      if (restoreFocus) Array.from(group.children).find(button => button.value === group.value)?.focus();
    };
    group.addEventListener('change', () => { group.paint(); onChange(); });
    group.addOptions(options); return group;
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
  function current(s) { return session === s && !s.identityChanged && s.token && chatToken() === s.token; }
  function setDisabled(el, value) {
    // Avoid generating a new attribute mutation for the preview's own observer.
    if (el.disabled !== value) el.disabled = value;
  }
  function syncChat(s) {
    if (session !== s) return;
    if (s.token && chatToken() !== s.token) s.identityChanged = true;
    const changed = !current(s);
    // Compare the full capture, including any text omitted from the API payload.
    // Once stale, only an explicit new suggestion can capture a new snapshot.
    if (!changed && s.freshness && !s.stale) {
      s.stale = text(ChatCaptureModule.capturarContextoResposta(s.mode).fullConversation) !== s.freshness.conversation
        || text(SmartReplyContextModule.getForCurrentChat()) !== s.freshness.promptComplement;
    }
    const warning = changed ? "O atendimento ativo mudou. Clique em Sugerir resposta no atendimento desejado para preparar novamente."
      : s.stale ? "Novas informações chegaram neste atendimento. Gere uma nova resposta." : "";
    if (s.warning.textContent !== warning) s.warning.textContent = warning;
    const nextBusy = s.busy ? "true" : "false";
    if (s.panel?.getAttribute("aria-busy") !== nextBusy) s.panel.setAttribute("aria-busy", nextBusy);
    setDisabled(s.insert, changed || s.stale || s.busy || !s.reply || s.profileChanged);
    setDisabled(s.regenerate, changed || s.stale || s.busy || !s.snapshot);
    setDisabled(s.profile, s.busy);
    s.profile.paint();
    setDisabled(s.context, s.busy); s.context.paint();
    setDisabled(s.instruction, s.busy);
    setDisabled(s.generate, changed || s.busy);
    setDisabled(s.edit, changed || s.busy);
    const heading = s.editing ? "Preparar resposta" : "Resposta sugerida";
    if (s.heading.textContent !== heading) s.heading.textContent = heading;
    s.preparation.hidden = !s.editing;
    s.generate.hidden = !s.editing;
    s.insert.hidden = s.editing;
    s.regenerate.hidden = s.editing;
    s.edit.hidden = s.editing;
    s.preview.hidden = s.editing;
    setDisabled(s.manageProfiles, s.busy);
    if ((changed || s.stale) && !s.choices.hidden) s.choices.hidden = true;
  }
  async function generate(s, regenerate) {
    syncChat(s);
    if (session !== s || s.busy || !current(s) || (regenerate && (s.stale || !s.snapshot))) return;
    const instruction = s.instruction.value || '';
    if (instruction.length > 600) { s.status.textContent = 'A instrução excede o limite de 600 caracteres.'; return; }
    // Set the lock before any asynchronous storage/capture operation.
    s.busy = true;
    syncChat(s);
    try { await SmartReplyContextModule.sync(); }
    catch { s.busy = false; s.status.textContent = 'Não foi possível preparar o adendo. Tente novamente.'; syncChat(s); return; }
    if (session !== s) return;
    if (!current(s)) { s.busy = false; syncChat(s); return; }
    if (!regenerate) {
      const capture = ChatCaptureModule.capturarContextoResposta(s.mode);
      const promptComplement = SmartReplyContextModule.getForCurrentChat();
      if (!capture.conversation || !s.token || promptComplement.length > 2000) {
        s.busy = false;
        s.status.textContent = !capture.conversation ? s.mode === 'LAST_CUSTOMER'
          ? 'Não há mensagem textual válida do cliente neste atendimento. Escolha outro contexto.'
          : 'Abra uma conversa com mensagens para sugerir uma resposta.'
          : 'O adendo excede o limite de 2.000 caracteres.';
        syncChat(s); return;
      }
      s.snapshot = { conversation: capture.conversation, promptComplement };
      s.freshness = { conversation: text(capture.fullConversation), promptComplement: text(promptComplement) };
      s.stale = false;
    }
    syncChat(s);
    if (!current(s) || s.stale) { s.busy = false; syncChat(s); return; }
    s.editing = false;
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
      if (instruction.trim()) payload.replyInstruction = instruction.trim();
      const result = await MessagingHelper.send(payload);
      if (session !== s) return;
      if (!result?.success || !String(result.reply || "").trim()) throw new Error(result?.erro || "Não foi possível sugerir uma resposta. Tente novamente.");
      s.reply = result.reply.trim();
      syncChat(s);
      if (!current(s) || s.stale) { s.reply = ""; s.preview.textContent = ""; return; }
      s.profileChanged = s.generatedStyle !== JSON.stringify(SmartReplyProfilesModule.wire(s.profile.value));
      s.preview.textContent = s.reply;
      s.preview.focus();
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
    const entries = [];
    for (const p of SmartReplyProfilesModule.list()) {
      const option = [p.id, p.builtin ? p.name : `Meu: ${p.name}`]; entries.push(option);
    }
    s.profile.value = SmartReplyProfilesModule.defaultId();
    s.profile.addOptions(entries);
    s.selectedStyle = JSON.stringify(SmartReplyProfilesModule.wire(s.profile.value));
    if (changed && (previous !== s.profile.value || previousStyle !== s.selectedStyle)) {
      s.profileChanged = true;
      s.status.textContent = s.editing ? "Perfil alterado. Clique em Gerar resposta para aplicar."
        : "Perfil alterado. Clique em Outra resposta para aplicar ao rascunho.";
    }
    syncChat(s);
  }
  async function open(mode = "RECENT") {
    close();
    const s = { token: chatToken(), mode: contextMode(mode), reply: "", busy: false, editing: true, profileChanged: false, stale: false };
    session = s;
    const panel = node("section", "", "smart-reply-preview");
    panel.id = PANEL_ID;
    panel.setAttribute("aria-label", "Preparar resposta");
    panel.setAttribute("tabindex", "-1");
    s.panel = panel;
    const header = node("div", "", "smart-reply-header");
    const heading = node("div", "", "smart-reply-heading");
    s.heading = node("strong", "Preparar resposta"); heading.appendChild(s.heading);
    heading.appendChild(node("span", "Revise antes de inserir no campo de mensagem.", "smart-reply-kicker"));
    const contextBadge = node("span", `Contexto: ${CONTEXT_MODES[s.mode].label}`, "atendeai-reply-context-badge");
    contextBadge.title = CONTEXT_MODES[s.mode].description;
    heading.appendChild(contextBadge);
    header.appendChild(heading);
    const x = node("button", "×", "smart-reply-close"); x.type = "button"; x.setAttribute("aria-label", "Fechar resposta sugerida");
    x.addEventListener("click", close); header.appendChild(x);
    s.preview = node("div", "", "smart-reply-text");
    s.preview.setAttribute("tabindex", "0");
    s.preview.setAttribute("aria-label", "Texto sugerido para revisão");
    s.status = node("div", "", "smart-reply-status"); s.status.setAttribute("role", "status");
    s.warning = node("div", "", "smart-reply-warning"); s.warning.setAttribute("role", "status");
    s.insert = node("button", "Inserir", "smart-reply-insert"); s.insert.type = "button";
    s.insert.addEventListener("click", () => insert(s));
    s.regenerate = node("button", "↻ Outra resposta", "smart-reply-regenerate"); s.regenerate.type = "button";
    s.regenerate.addEventListener("click", () => generate(s, true));
    s.preparation = node('div', '', 'smart-reply-preparation');
    s.context = choiceControl('Contexto', Object.entries(CONTEXT_MODES).map(([id, item]) => [id, item.label]), s.mode, () => {
      s.mode = contextMode(s.context.value); contextBadge.textContent = 'Contexto: ' + CONTEXT_MODES[s.mode].label;
      contextBadge.title = CONTEXT_MODES[s.mode].description;
      s.profileChanged = true; syncChat(s);
    });
    s.profile = choiceControl('Perfil da resposta e padrão', [], 'DIRECT', async () => {
      s.profileChanged = true;
      s.status.textContent = 'Clique em Gerar resposta para aplicar as opções.';
      syncChat(s);
      try { await SmartReplyProfilesModule.setDefault(s.profile.value); }
      catch { s.status.textContent = 'Não foi possível salvar o perfil padrão.'; }
    });
    s.instruction = node('textarea', '', 'smart-reply-instruction');
    s.instruction.id = 'atendeai-reply-instruction'; s.instruction.maxLength = 600; s.instruction.rows = 3;
    s.instruction.placeholder = 'Ex.: Peça ao cliente mais detalhes sobre o erro e diga que vou verificar.';
    s.instruction.setAttribute('aria-label', 'Instrução para esta resposta (opcional, até 600 caracteres)');
    s.instruction.addEventListener('input', () => { s.profileChanged = true; syncChat(s); });
    for (const [label, control] of [['Contexto',s.context],['Perfil',s.profile],['Instrução opcional · somente esta geração',s.instruction]]) {
      const section = node('div', '', 'smart-reply-field'); section.appendChild(node('span', label)); section.appendChild(control); s.preparation.appendChild(section);
    }
    s.generate = node('button', 'Gerar resposta', 'smart-reply-insert'); s.generate.type = 'button';
    s.generate.addEventListener('click', () => generate(s, false));
    s.edit = node('button', 'Voltar para editar as opções', 'smart-reply-regenerate'); s.edit.type = 'button';
    s.edit.addEventListener('click', () => { if (s.busy) return; s.editing = true; s.reply = ''; s.preview.textContent = ''; s.choices.hidden = true; syncChat(s); s.instruction.focus(); });
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
    for (const el of [s.generate, s.insert, s.regenerate, s.edit, s.manageProfiles]) actions.appendChild(el);
    for (const el of [header, s.warning, s.preparation, s.preview, s.status, actions, s.choices]) panel.appendChild(el);
    document.body.appendChild(panel);
    panel.focus();
    globalThis.ThemeModule?.apply?.(panel);
    const manager = SmartReplyProfilesUI.mount(panel);
    s.manageProfiles.addEventListener("click", () => s.manageProfiles.setAttribute("aria-expanded", String(manager.toggle())));
    refreshProfiles(s);
    s.unsubscribe = SmartReplyContextModule.onChanged(() => syncChat(s));
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
    syncChat(s);
  }
  document.addEventListener("pointerdown", event => { if (session && !session.panel.contains(event.target) && !event.target.closest?.("#btnSmartReply")) close(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
  // Textarea value edits do not create DOM mutations; capture input without intercepting it.
  document.addEventListener("input", () => { if (session) syncChat(session); }, true);
  return { open, mountContextControl };
})();
window.SmartReplyModule = SmartReplyModule;
