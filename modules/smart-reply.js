// "Sugerir resposta": a chat window, like "Consultar Docs", where every answer is a message
// ready for the customer. One conversation per attendance (ReplyChatStore). Never sends messages.
const SmartReplyModule = (() => {
  const PANEL_ID = "atendeai-smart-reply";
  const LEGACY_KEYS = ["atendeai_smart_reply_profiles_v1", "atendeai_smart_reply_profile"];
  const DOCS_ORIGIN = "https://docs.softensistemas.com.br/";
  const GENERIC_ERROR = "Não foi possível sugerir uma resposta. Tente novamente.";
  const NO_IDENTITY = "Não foi possível identificar com segurança o atendimento ativo. Reabra a conversa.";
  const CHANGED = "O atendimento mudou antes de gerar. Envie de novo neste atendimento.";
  const STALE = "O cliente mandou mensagem nova. Envie algo para atualizar.";
  // One-click kinds of message (sent as intent; the API keeps the rules for each).
  const INTENTS = [
    ["resolver", "Resolver", "Resolver o problema com o manual e os avisos"],
    ["pedir_info", "Pedir info", "Pedir o que falta para avançar (print, XML, erro)"],
    ["aviso", "Aviso", "Explicar o aviso relacionado ao caso"],
    ["cliente_dificil", "Cliente difícil", "Responder com calma e firmeza a um cliente irritado"],
    ["cobrar_retorno", "Cobrar", "Cobrar retorno do cliente que parou de responder"],
    ["encerrar", "Encerrar", "Confirmar o que foi resolvido e se despedir"]
  ];
  const MAX_MESSAGE = 1500;
  const notices = () => globalThis.DailyNoticesModule;
  const samples = () => globalThis.StyleSamplesModule;
  const chats = () => ReplyChatStore;
  let session = null;
  // Per attendance, shared by every opening of the window: a reply on its way outlives the window that asked.
  const cache = new Map(), busy = new Set();
  const text = value => String(value || "").replace(/\s+/g, " ").trim();
  const chatToken = () => ChatCaptureModule.identificarAtendimentoResposta();
  const capture = () => ChatCaptureModule.capturarConversaRotulada(samples()?.selfName?.() || "");

  function node(tag, label, className) {
    const el = document.createElement(tag);
    if (label) el.textContent = label;
    if (className) el.className = className;
    return el;
  }
  const clear = el => Array.from(el.children).forEach(child => child.remove());
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
  function setDisabled(el, value) { if (el.disabled !== value) el.disabled = value; }
  function setHidden(el, value) { if (el.hidden !== value) el.hidden = value; }
  function setText(el, value) { if (el.textContent !== value) el.textContent = value; }

  // What a reply was written from: the conversation as captured plus the addendum. A different basis = stale.
  function basisOf(fullConversation, complement) {
    const source = `${text(fullConversation)}\u0001${text(complement)}`;
    let hash = 5381;
    for (let i = 0; i < source.length; i++) hash = ((hash * 33) ^ source.charCodeAt(i)) >>> 0;
    return `${source.length}:${hash.toString(36)}`;
  }
  function currentBasis() {
    return basisOf(capture().fullConversation, globalThis.SmartReplyContextModule?.getForCurrentChat?.() || "");
  }
  function safeSources(sources) {
    return (Array.isArray(sources) ? sources : [])
      .filter(item => item && typeof item.url === "string" && item.url.startsWith(DOCS_ORIGIN))
      .slice(0, 3)
      .map(item => ({ title: text(item.title).slice(0, 80) || "Manual", url: item.url }));
  }
  const latestReply = conversation => {
    const last = conversation?.messages?.[conversation.messages.length - 1];
    return last && last.role === "assistant" && !last.error ? last : null;
  };

  // ---------- rendering ----------
  function buildChips(s, className) {
    const wrap = node("div", "", className);
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Tipo de resposta");
    for (const [key, label, description] of INTENTS) {
      const button = node("button", label, "smart-reply-chip"); button.type = "button";
      button.title = description;
      button.setAttribute("data-intent", key);
      button.addEventListener("click", () => send(s, { text: label, intent: key }));
      wrap.appendChild(button);
    }
    return wrap;
  }
  function syncChips(s) {
    const blocked = !s.token || busy.has(s.token);
    for (const wrap of [s.emptyChips, s.compactChips]) {
      if (!wrap) continue;
      for (const button of wrap.children) {
        // "Aviso" only makes sense while there is an active notice.
        setHidden(button, button.getAttribute("data-intent") === "aviso" && !s.noticeCount);
        setDisabled(button, blocked);
      }
    }
  }
  function renderSources(sources) {
    const wrap = node("div", "", "smart-reply-sources");
    wrap.appendChild(node("span", "Base:", "smart-reply-sources-label"));
    for (const item of sources) {
      const link = node("a", item.title, "smart-reply-source");
      link.href = item.url; link.target = "_blank"; link.rel = "noopener noreferrer";
      link.title = item.title;
      wrap.appendChild(link);
    }
    return wrap;
  }
  function renderReply(s, m) {
    const msg = node("div", "", "smart-reply-msg smart-reply-bot");
    msg.appendChild(node("span", "Resposta para o cliente", "smart-reply-label"));
    msg.appendChild(node("div", m.content, "smart-reply-reply"));
    const actions = node("div", "", "smart-reply-msg-actions");
    const copy = node("button", "Copiar", "smart-reply-link"); copy.type = "button";
    copy.addEventListener("click", () => copyReply(m, copy));
    const insertButton = node("button", "Inserir no chat", "smart-reply-insert"); insertButton.type = "button";
    insertButton.addEventListener("click", () => insert(s, m));
    actions.appendChild(copy); actions.appendChild(insertButton);
    s.insertButtons.push({ button: insertButton, message: m });
    msg.appendChild(actions);
    const sources = safeSources(m.sources);
    if (sources.length) msg.appendChild(renderSources(sources));
    return msg;
  }
  function renderError(s, m, isLast) {
    const msg = node("div", "", "smart-reply-msg smart-reply-bot smart-reply-error");
    msg.appendChild(node("p", m.content));
    if (isLast) {
      const retry = node("button", "Tentar de novo", "smart-reply-link"); retry.type = "button";
      retry.addEventListener("click", () => {
        const conversation = s.conversation;
        conversation.messages.pop();
        const ask = conversation.messages.pop();
        if (!ask || ask.role !== "user") { render(s); return; }
        return send(s, { text: ask.content, intent: ask.intent });
      });
      msg.appendChild(retry);
    }
    return msg;
  }
  function render(s) {
    if (session !== s) return;
    const { list } = s;
    const messages = s.conversation?.messages || [];
    clear(list);
    s.emptyChips = null;
    s.insertButtons = [];
    if (!messages.length) {
      const empty = node("div", "", "smart-reply-empty");
      s.emptyChips = buildChips(s, "smart-reply-chips");
      empty.appendChild(s.emptyChips);
      empty.appendChild(node("p", "Escolha o tipo de resposta, ou escreva o que quer dizer ao cliente.", "smart-reply-hint"));
      list.appendChild(empty);
    }
    messages.forEach((m, index) => {
      if (m.role === "user") list.appendChild(node("div", m.content, "smart-reply-msg smart-reply-user"));
      else if (m.error) list.appendChild(renderError(s, m, index === messages.length - 1));
      else list.appendChild(renderReply(s, m));
    });
    if (s.token && busy.has(s.token)) {
      const typing = node("div", "Escrevendo a resposta…", "smart-reply-msg smart-reply-bot smart-reply-typing");
      typing.setAttribute("role", "status");
      list.appendChild(typing);
    }
    list.scrollTop = list.scrollHeight;
    sync(s);
  }
  function renderContext(s) {
    clear(s.reading);
    if (!s.token) return;
    s.reading.appendChild(node("span", "Lendo o atendimento de "));
    s.reading.appendChild(node("strong", ChatCaptureModule.capturarNomeCliente?.() || "cliente"));
  }

  // ---------- Copiar / Inserir no chat ----------
  async function copyReply(m, button) {
    try {
      await navigator.clipboard.writeText(m.content);
      // A pasted-and-sent suggestion must not be learned as the technician's own voice.
      samples()?.noteInserted?.(m.content);
      setText(button, "Copiado");
    } catch { setText(button, "Não copiou"); }
    setTimeout(() => setText(button, "Copiar"), 1500);
  }
  /** Only the latest reply, for the attendance open now, written from the conversation as it is now. */
  function canInsert(s, m) {
    return session === s && !!m && m === latestReply(s.conversation) && !!s.token
      && chatToken() === s.token && !busy.has(s.token) && !s.stale;
  }
  function showChoices(s, visible) {
    setHidden(s.choices, !visible);
    if (!visible) s.pendingDraft = null;
  }
  function insert(s, m, mode, expected) {
    sync(s);
    if (!canInsert(s, m)) return;
    const el = ChatCaptureModule.encontrarComposer();
    if (!el || !capture().conversation.trim()) {
      setText(s.feedback, "Não foi possível localizar com segurança o campo de mensagem deste atendimento.");
      return;
    }
    const value = draftText(el);
    if (value.trim() && (!mode || expected?.el !== el || expected.value !== value || expected.message !== m)) {
      s.pendingDraft = { el, value, message: m };
      setHidden(s.choices, false);
      setText(s.feedback, "");
      return;
    }
    // Recheck immediately before writing; a choice never retains a different composer.
    sync(s);
    if (!canInsert(s, m) || ChatCaptureModule.encontrarComposer() !== el) return;
    setComposer(el, mode === "append" && value ? `${value}\n${m.content}` : m.content);
    samples()?.noteInserted?.(m.content);
    setText(s.feedback, "");
    showChoices(s, false);
  }

  // ---------- Avisos ----------
  async function refreshNotices(s) {
    const list = (await notices()?.list?.()) || [];
    if (session !== s) return;
    s.noticeCount = list.length;
    setText(s.noticesToggle, list.length ? `Avisos (${list.length})` : "Avisos");
    clear(s.noticesList);
    if (!list.length) s.noticesList.appendChild(node("div", "Nenhum aviso ativo.", "smart-reply-notice-empty"));
    for (const item of list) {
      const row = node("div", "", "smart-reply-notice");
      row.appendChild(node("span", item.text, "smart-reply-notice-text"));
      row.appendChild(node("span", notices().untilLabel(item.expiresAt), "smart-reply-notice-until"));
      const remove = node("button", "×", "smart-reply-notice-remove"); remove.type = "button";
      remove.setAttribute("aria-label", "Remover aviso");
      remove.addEventListener("click", async () => { await notices().remove(item.id); return refreshNotices(s); });
      row.appendChild(remove);
      s.noticesList.appendChild(row);
    }
    syncChips(s);
  }
  function buildNoticesPanel(s) {
    const panel = node("div", "", "smart-reply-notices"); panel.hidden = true;
    panel.appendChild(node("div", "Avisos: a sugestão leva em conta quando o cliente fala do assunto. Ficam só neste navegador; remova quando a situação normalizar.", "smart-reply-notices-help"));
    s.noticesList = node("div", "", "smart-reply-notice-list");
    panel.appendChild(s.noticesList);
    const input = node("textarea", "", "smart-reply-notice-input");
    input.rows = 2; input.maxLength = notices()?.MAX_TEXT || 500;
    input.placeholder = "Ex.: SEFAZ-MG instável desde 9h, notas saindo em contingência";
    input.setAttribute("aria-label", "Novo aviso");
    input.addEventListener("keydown", event => { if (event.key !== "Escape") event.stopPropagation?.(); });
    const duration = node("select", "", "smart-reply-notice-duration");
    duration.setAttribute("aria-label", "Validade do aviso");
    for (const [value, label] of notices()?.DURATIONS || []) {
      const option = node("option", label); option.value = value; duration.appendChild(option);
    }
    duration.value = "today";
    const add = node("button", "Adicionar", "smart-reply-link"); add.type = "button";
    add.addEventListener("click", async () => {
      if (!String(input.value || "").trim() || !notices()) return;
      await notices().add(input.value, duration.value);
      input.value = "";
      return refreshNotices(s);
    });
    const row = node("div", "", "smart-reply-notice-add");
    row.appendChild(duration); row.appendChild(add);
    panel.appendChild(input); panel.appendChild(row);
    return panel;
  }

  // ---------- state ----------
  /** Keeps buttons, the stale note and the identity status in step with the page; no DOM churn when unchanged. */
  function sync(s) {
    if (session !== s) return;
    const token = chatToken();
    if (token && token !== s.token) { void switchTo(s, token); return; }
    setText(s.status, token ? "" : NO_IDENTITY);
    const writing = !!s.token && busy.has(s.token);
    const reply = latestReply(s.conversation);
    s.stale = !!reply && !writing && token === s.token && reply.basis !== currentBasis();
    setHidden(s.staleNote, !s.stale);
    setHidden(s.badge, !reply?.usedComplement);
    for (const { button, message } of s.insertButtons || []) setDisabled(button, !canInsert(s, message));
    if (!s.choices.hidden && !canInsert(s, s.pendingDraft?.message)) showChoices(s, false);
    setHidden(s.compactChips, !(s.conversation?.messages?.length));
    setDisabled(s.input, !token);
    setDisabled(s.sendButton, !token || writing);
    setDisabled(s.freshButton, !s.token || writing);
    const ariaBusy = writing ? "true" : "false";
    if (s.panel.getAttribute("aria-busy") !== ariaBusy) s.panel.setAttribute("aria-busy", ariaBusy);
    syncChips(s);
  }
  async function conversationFor(s, token) {
    if (!cache.has(token)) {
      const loaded = await chats().load(token);
      // Another load for the same token may have finished first: keep a single object per attendance.
      if (!cache.has(token)) cache.set(token, loaded);
    }
    return cache.get(token);
  }
  async function switchTo(s, token) {
    const request = ++s.switchRequest;
    s.token = token;
    s.conversation = null;
    renderContext(s);
    const conversation = await conversationFor(s, token);
    if (session !== s || request !== s.switchRequest) return;
    s.conversation = conversation;
    render(s);
  }

  async function send(s, { text: ask, intent }) {
    const token = s.token, conversation = s.conversation;
    const content = String(ask || "").trim().slice(0, MAX_MESSAGE);
    if (session !== s || !token || !conversation || !content || busy.has(token)) return;
    if (chatToken() !== token) { sync(s); return; }
    conversation.messages.push(intent ? { role: "user", content, intent, at: Date.now() } : { role: "user", content, at: Date.now() });
    if (!intent) s.input.value = "";
    busy.add(token);
    render(s);
    void chats().save(conversation);
    try {
      await globalThis.SmartReplyContextModule?.sync?.();
      // The capture below must read the attendance this conversation belongs to.
      if (chatToken() !== token) throw new Error(CHANGED);
      const snapshot = capture();
      const promptComplement = globalThis.SmartReplyContextModule?.getForCurrentChat?.() || "";
      if (!snapshot.conversation) throw new Error("Abra uma conversa com mensagens para sugerir uma resposta.");
      if (promptComplement.length > 2000) throw new Error("O adendo excede o limite de 2.000 caracteres.");
      const basis = basisOf(snapshot.fullConversation, promptComplement);
      const payload = { action: "gerarResposta", conversation: snapshot.conversation, messages: chats().forApi(conversation.messages) };
      if (intent) payload.intent = intent;
      if (promptComplement) payload.promptComplement = promptComplement;
      const activeNotices = (await notices()?.forRequest?.()) || [];
      if (activeNotices.length) payload.notices = activeNotices;
      const styleSamples = samples()?.forRequest?.(snapshot.fullConversation) || [];
      if (styleSamples.length) payload.styleSamples = styleSamples;
      const result = await MessagingHelper.send(payload);
      if (!result?.success || !String(result.reply || "").trim()) throw new Error(result?.erro || GENERIC_ERROR);
      conversation.messages.push({ role: "assistant", content: result.reply.trim(), sources: safeSources(result.sources),
        basis, usedComplement: !!promptComplement, at: Date.now() });
    } catch (err) {
      conversation.messages.push({ role: "assistant", error: true, content: err?.message || GENERIC_ERROR, at: Date.now() });
    } finally {
      busy.delete(token);
      // Saved to the attendance it was asked for, even if the technician moved on; never once Nova replaced it.
      if (cache.get(token) === conversation) await chats().save(conversation);
      // Shown in whichever window is open on that attendance now, even if it is not the one that asked.
      const current = session;
      if (current?.token === token) { render(current); current.input.focus(); }
    }
  }

  // ---------- window ----------
  function close() {
    const s = session, panel = document.getElementById(PANEL_ID);
    const restoreFocus = panel && document.activeElement && panel.contains(document.activeElement);
    s?.observer?.disconnect(); s?.unsubscribe?.();
    session = null;
    panel?.remove();
    if (restoreFocus) document.getElementById("btnSmartReply")?.focus();
  }

  async function open() {
    if (session) { close(); return; }
    // Both chat windows sit in the same corner: only one at a time.
    globalThis.DocsModule?.close?.();
    const s = { token: "", conversation: null, switchRequest: 0, noticeCount: 0, stale: false,
      insertButtons: [], pendingDraft: null };
    session = s;
    const panel = node("section", "", "smart-reply-window");
    panel.id = PANEL_ID;
    panel.setAttribute("aria-label", "Sugerir resposta");
    panel.setAttribute("tabindex", "-1");
    s.panel = panel;

    const header = node("div", "", "smart-reply-header");
    header.appendChild(node("strong", "Sugerir resposta", "smart-reply-title"));
    const fresh = node("button", "Nova", "smart-reply-link"); fresh.type = "button";
    s.freshButton = fresh;
    fresh.addEventListener("click", () => {
      // Clearing while a reply is on its way would lose it and let the save bring the old chat back.
      if (!s.token || busy.has(s.token)) return;
      const token = s.token;
      // Replaced before the clear is queued: the next ask goes to the new one, saved after the clear.
      s.conversation = { token, messages: [], updatedAt: 0 };
      cache.set(token, s.conversation);
      render(s); s.input.focus();
      return chats().clear(token);
    });
    const x = node("button", "×", "smart-reply-close"); x.type = "button";
    x.setAttribute("aria-label", "Fechar");
    x.addEventListener("click", close);
    header.appendChild(fresh); header.appendChild(x);

    s.context = node("div", "", "smart-reply-context");
    s.reading = node("span", "", "smart-reply-reading");
    s.badge = node("span", "adendo", "smart-reply-badge"); s.badge.hidden = true;
    s.badge.title = "O Adendo para resposta foi usado";
    s.noticesToggle = node("button", "Avisos", "smart-reply-notices-toggle"); s.noticesToggle.type = "button";
    s.noticesToggle.setAttribute("aria-expanded", "false");
    s.context.appendChild(s.reading); s.context.appendChild(s.badge); s.context.appendChild(s.noticesToggle);
    s.noticesPanel = buildNoticesPanel(s);
    s.noticesToggle.addEventListener("click", () => {
      s.noticesPanel.hidden = !s.noticesPanel.hidden;
      s.noticesToggle.setAttribute("aria-expanded", String(!s.noticesPanel.hidden));
    });
    s.feedback = node("div", "", "smart-reply-feedback"); s.feedback.setAttribute("role", "status");
    s.choices = node("div", "", "smart-reply-draft-choices"); s.choices.hidden = true;
    s.choices.appendChild(node("span", "Já existe um rascunho no campo do SZ.", "smart-reply-draft-text"));
    for (const [label, mode] of [["Substituir", "replace"], ["Acrescentar", "append"], ["Cancelar", "cancel"]]) {
      const button = node("button", label, mode === "replace" ? "smart-reply-insert" : "smart-reply-link"); button.type = "button";
      button.addEventListener("click", () => {
        if (mode === "cancel") { showChoices(s, false); return; }
        const pending = s.pendingDraft;
        return insert(s, pending?.message, mode, pending);
      });
      s.choices.appendChild(button);
    }
    s.status = node("div", "", "smart-reply-status"); s.status.setAttribute("role", "status");
    s.list = node("div", "", "smart-reply-messages");
    s.list.setAttribute("aria-live", "polite");
    s.staleNote = node("div", STALE, "smart-reply-stale"); s.staleNote.hidden = true;
    s.staleNote.setAttribute("role", "status");
    s.compactChips = buildChips(s, "smart-reply-chips smart-reply-chips-compact");
    s.compactChips.hidden = true;

    const form = node("form", "", "smart-reply-form");
    s.input = node("textarea", "", "smart-reply-input");
    s.input.rows = 2; s.input.maxLength = MAX_MESSAGE;
    s.input.placeholder = "Diga o que responder, ou corrija a última… (Enter envia)";
    s.input.setAttribute("aria-label", "O que responder ao cliente");
    s.sendButton = node("button", "Enviar", "smart-reply-send"); s.sendButton.type = "submit";
    form.appendChild(s.input); form.appendChild(s.sendButton);
    form.addEventListener("submit", event => { event.preventDefault(); return send(s, { text: s.input.value }); });
    s.input.addEventListener("keydown", event => {
      // Esc (close) and Ctrl+Enter (insert) still reach the window.
      if (event.key === "Escape" || (event.key === "Enter" && (event.ctrlKey || event.metaKey))) return;
      // SZ's global shortcuts must not see what is typed here.
      event.stopPropagation?.();
      if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        return send(s, { text: s.input.value });
      }
    });

    panel.addEventListener("keydown", event => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        // SZ must never see the keystroke that just filled its composer (it could send it).
        event.stopPropagation?.();
        insert(s, latestReply(s.conversation));
      }
    });
    for (const el of [header, s.context, s.noticesPanel, s.status, s.list, s.staleNote, s.feedback, s.choices, s.compactChips, form]) panel.appendChild(el);
    document.body.appendChild(panel);
    globalThis.ThemeModule?.apply?.(panel);

    const token = chatToken();
    if (token) {
      s.token = token;
      renderContext(s);
      s.conversation = await conversationFor(s, token);
      if (session !== s) return;
    }
    ChatCaptureModule.observarAtendimentoResposta?.();
    s.unsubscribe = globalThis.SmartReplyContextModule?.onChanged?.(() => sync(s));
    s.observer = new MutationObserver(records => {
      if (records.some(record => !s.panel.contains(record.target))) sync(s);
    });
    s.observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    render(s);
    void refreshNotices(s);
    s.input.focus();
  }

  function retireLegacyProfiles() {
    try { chrome.storage.local.remove(LEGACY_KEYS, () => void chrome.runtime?.lastError); }
    catch { /* Extension context invalidated: nothing to retire now. */ }
  }
  document.addEventListener("keydown", event => { if (event.key === "Escape" && session) close(); });
  // Textarea value edits (the addendum) do not create DOM mutations; capture input without intercepting it.
  document.addEventListener("input", () => { if (session) sync(session); }, true);
  return { open, close, retireLegacyProfiles };
})();
window.SmartReplyModule = SmartReplyModule;
