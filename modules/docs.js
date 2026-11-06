// "Consultar Docs": a conversation with the SoftenDocs manual. Answers cite numbered
// sources (docs.softensistemas.com.br) and conversations stay in this browser only.
const DocsModule = (() => {
  const POPUP_ID = "geminiDocsPopup";
  const STORAGE_KEY = "atendeai_docs_chats_v1";
  const PRODUCT_KEY = "atendeai_docs_chat_product";
  const DOCS_ORIGIN = "https://docs.softensistemas.com.br/";
  const PRODUCTS = ["Soften SIEM", "GerencieAqui", "SoftenFood"];
  // Mirrors the API limits (POST /api/docs/chat).
  const MAX_API_MESSAGES = 19, MAX_MESSAGE_CHARS = 2000, MAX_TOTAL_CHARS = 16000;
  const MAX_CONVERSATIONS = 30, MAX_STORED_MESSAGES = 60;

  let state = null;

  // ---------- storage ----------
  function storageGet(key) {
    return new Promise((resolve) => {
      try { chrome.storage.local.get([key], (data) => resolve(chrome.runtime?.lastError ? undefined : data?.[key])); }
      catch { resolve(undefined); }
    });
  }
  function storageSet(key, value) {
    return new Promise((resolve) => {
      try { chrome.storage.local.set({ [key]: value }, () => resolve()); }
      catch { resolve(); }
    });
  }
  async function loadConversations() {
    const list = await storageGet(STORAGE_KEY);
    return Array.isArray(list) ? list.filter((c) => c && c.id && Array.isArray(c.messages)) : [];
  }
  async function saveConversation(conversation) {
    const list = (await loadConversations()).filter((c) => c.id !== conversation.id);
    conversation.messages = conversation.messages.slice(-MAX_STORED_MESSAGES);
    list.unshift(conversation);
    await storageSet(STORAGE_KEY, list.slice(0, MAX_CONVERSATIONS));
  }
  async function deleteConversation(id) {
    await storageSet(STORAGE_KEY, (await loadConversations()).filter((c) => c.id !== id));
  }

  // ---------- pure helpers (tested) ----------
  /** The most recent turns the API accepts: starts with a question, alternates, within the limits. */
  function messagesForApi(messages) {
    const turns = messages.filter((m) => !m.error && (m.role === "user" || m.role === "assistant"))
      .map((m) => ({ role: m.role, content: String(m.content || "").slice(0, MAX_MESSAGE_CHARS) }));
    let out = turns.slice(-MAX_API_MESSAGES);
    const total = () => out.reduce((sum, m) => sum + m.content.length, 0);
    while (out.length > 1 && (out[0].role !== "user" || total() > MAX_TOTAL_CHARS)) out = out.slice(1);
    return out;
  }

  function safeSources(sources) {
    return (Array.isArray(sources) ? sources : [])
      .filter((s) => s && typeof s.url === "string" && s.url.startsWith(DOCS_ORIGIN))
      .slice(0, 10)
      .map((s) => ({
        n: Number(s.n) || 0, title: String(s.title || s.url).slice(0, 200),
        product: String(s.product || ""), url: s.url, updated: String(s.updated || "")
      }));
  }

  function titleFrom(question) {
    const t = String(question || "").replace(/\s+/g, " ").trim();
    return t.length > 60 ? `${t.slice(0, 57)}…` : t;
  }

  function formatDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
  }

  // ---------- rendering ----------
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /** Inline **bold** and [n] citations, built as DOM nodes (model text never becomes HTML). */
  function appendInline(parent, line, sourcesByN) {
    const parts = String(line).split(/(\*\*[^*]+\*\*|\[\d{1,2}\])/g);
    for (const part of parts) {
      if (!part) continue;
      const bold = /^\*\*([^*]+)\*\*$/.exec(part);
      const cite = /^\[(\d{1,2})\]$/.exec(part);
      if (bold) parent.appendChild(el("strong", "", bold[1]));
      else if (cite && sourcesByN.has(Number(cite[1]))) {
        const source = sourcesByN.get(Number(cite[1]));
        const a = el("a", "gemini-docs-cite", cite[1]);
        a.href = source.url; a.target = "_blank"; a.rel = "noopener noreferrer";
        a.title = source.title;
        parent.appendChild(a);
      } else parent.appendChild(document.createTextNode(part));
    }
  }

  function renderAnswer(text, sources) {
    const box = el("div", "gemini-docs-answer");
    const sourcesByN = new Map(sources.map((s) => [s.n, s]));
    let list = null;
    for (const raw of String(text || "").split("\n")) {
      const line = raw.trimEnd();
      const item = /^\s*(?:(\d+)[.)]|[-*•])\s+(.*)$/.exec(line);
      if (item) {
        const ordered = !!item[1];
        if (!list || (list.tagName === "OL") !== ordered) {
          list = el(ordered ? "ol" : "ul");
          if (ordered && Number(item[1]) > 1) list.start = Number(item[1]);
          box.appendChild(list);
        }
        const li = el("li");
        appendInline(li, item[2], sourcesByN);
        list.appendChild(li);
        continue;
      }
      list = null;
      if (!line.trim()) continue;
      const heading = /^#{1,4}\s+(.*)$/.exec(line);
      const p = el(heading ? "strong" : "p", heading ? "gemini-docs-heading" : "");
      appendInline(p, heading ? heading[1] : line, sourcesByN);
      box.appendChild(p);
    }
    return box;
  }

  function renderSources(sources) {
    const wrap = el("div", "gemini-docs-sources");
    for (const s of sources) {
      const row = el("a", "gemini-docs-source");
      row.href = s.url; row.target = "_blank"; row.rel = "noopener noreferrer";
      row.appendChild(el("span", "gemini-docs-source-n", String(s.n)));
      row.appendChild(el("span", "gemini-docs-source-title", s.title));
      const meta = [s.product, s.updated ? `atualizado em ${formatDate(s.updated)}` : ""].filter(Boolean).join(" · ");
      if (meta) row.appendChild(el("span", "gemini-docs-source-meta", meta));
      wrap.appendChild(row);
    }
    return wrap;
  }

  function copyButton(text) {
    const button = el("button", "gemini-docs-link", "Copiar");
    button.type = "button";
    button.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(text); button.textContent = "Copiado"; }
      catch { button.textContent = "Não copiou"; }
      setTimeout(() => { button.textContent = "Copiar"; }, 1500);
    });
    return button;
  }

  function renderMessages() {
    const { list, conversation } = state;
    list.replaceChildren();
    if (!conversation.messages.length) {
      const empty = el("div", "gemini-docs-empty");
      empty.appendChild(el("strong", "", "Pergunte sobre o sistema"));
      empty.appendChild(el("p", "", "As respostas vêm do docs.softensistemas.com.br, com link para cada página usada."));
      for (const example of ["Como cancelar uma NF-e no Soften SIEM?", "Rejeição 539 duplicidade de NF-e",
        "Como dar entrada de nota por XML no GerencieAqui?"]) {
        const chip = el("button", "gemini-docs-example", example);
        chip.type = "button";
        chip.addEventListener("click", () => { state.input.value = example; send(); });
        empty.appendChild(chip);
      }
      list.appendChild(empty);
      return;
    }
    conversation.messages.forEach((m, index) => {
      if (m.role === "user") { list.appendChild(el("div", "gemini-docs-msg gemini-docs-user", m.content)); return; }
      const msg = el("div", "gemini-docs-msg gemini-docs-bot");
      if (m.error) {
        msg.classList.add("gemini-docs-error");
        msg.appendChild(el("p", "", m.content));
        if (index === conversation.messages.length - 1) {
          const retry = el("button", "gemini-docs-link", "Tentar de novo");
          retry.type = "button";
          retry.addEventListener("click", () => {
            conversation.messages.pop();
            const question = conversation.messages.pop();
            state.input.value = question?.content || "";
            send();
          });
          msg.appendChild(retry);
        }
      } else {
        const sources = safeSources(m.sources);
        msg.appendChild(renderAnswer(m.content, sources));
        if (sources.length) msg.appendChild(renderSources(sources));
        const actions = el("div", "gemini-docs-msg-actions");
        actions.appendChild(copyButton(m.content));
        msg.appendChild(actions);
      }
      list.appendChild(msg);
    });
    if (state.busy) {
      const typing = el("div", "gemini-docs-msg gemini-docs-bot gemini-docs-typing", "Consultando a documentação…");
      typing.setAttribute("role", "status");
      list.appendChild(typing);
    }
    list.scrollTop = list.scrollHeight;
  }

  async function renderHistory() {
    const { history } = state;
    history.replaceChildren();
    const conversations = await loadConversations();
    if (!conversations.length) {
      history.appendChild(el("p", "gemini-docs-empty-history", "Nenhuma conversa salva ainda."));
      return;
    }
    for (const c of conversations) {
      const row = el("div", "gemini-docs-history-row");
      const open = el("button", "gemini-docs-history-open");
      open.type = "button";
      open.appendChild(el("span", "gemini-docs-history-title", c.title || "Conversa"));
      open.appendChild(el("span", "gemini-docs-history-meta",
        `${new Date(c.updatedAt || 0).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · ${Math.ceil(c.messages.length / 2)} pergunta(s)`));
      open.addEventListener("click", () => { state.conversation = c; showHistory(false); renderMessages(); });
      const remove = el("button", "gemini-docs-history-delete", "Excluir");
      remove.type = "button";
      remove.setAttribute("aria-label", `Excluir conversa ${c.title || ""}`);
      remove.addEventListener("click", async () => {
        await deleteConversation(c.id);
        if (state.conversation.id === c.id) state.conversation = newConversation();
        renderHistory();
      });
      row.appendChild(open);
      row.appendChild(remove);
      history.appendChild(row);
    }
  }

  function showHistory(visible) {
    state.history.hidden = !visible;
    state.list.hidden = visible;
    state.form.hidden = visible;
    state.historyButton.textContent = visible ? "Voltar" : "Conversas";
    if (visible) renderHistory();
  }

  function newConversation() {
    return { id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: "", messages: [], updatedAt: Date.now() };
  }

  // ---------- conversation ----------
  async function send() {
    if (!state || state.busy) return;
    const question = state.input.value.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!question) return;
    const conversation = state.conversation;
    conversation.messages.push({ role: "user", content: question });
    if (!conversation.title) conversation.title = titleFrom(question);
    state.input.value = "";
    state.busy = true;
    state.sendButton.disabled = true;
    renderMessages();
    try {
      const response = await MessagingHelper.send({
        action: "docsChat",
        messages: messagesForApi(conversation.messages),
        product: state.product.value || null
      });
      if (!response?.success || !String(response.answer || "").trim()) {
        throw new Error(response?.erro || "Não foi possível consultar a documentação agora.");
      }
      conversation.messages.push({ role: "assistant", content: response.answer.trim(), sources: safeSources(response.sources) });
    } catch (error) {
      conversation.messages.push({ role: "assistant", error: true, content: error?.message || "Não foi possível consultar a documentação agora." });
    } finally {
      conversation.updatedAt = Date.now();
      if (state?.conversation === conversation) {
        state.busy = false;
        state.sendButton.disabled = false;
        renderMessages();
        state.input.focus();
      }
      await saveConversation(conversation);
    }
  }

  function close() {
    document.getElementById(POPUP_ID)?.remove();
    state = null;
  }

  async function exibirPainelConsultaDocs() {
    if (document.getElementById(POPUP_ID)) { close(); return; }
    // Both chat windows sit in the same corner: only one at a time.
    globalThis.SmartReplyModule?.close?.();

    const popup = el("section");
    popup.id = POPUP_ID;
    popup.setAttribute("aria-label", "Consultar documentação");

    const header = el("div", "gemini-docs-header");
    header.appendChild(el("strong", "gemini-docs-title", "Consultar documentação"));
    const historyButton = el("button", "gemini-docs-link", "Conversas"); historyButton.type = "button";
    const newButton = el("button", "gemini-docs-link", "Nova"); newButton.type = "button";
    const close = el("button", "gemini-docs-close", "×"); close.type = "button";
    close.setAttribute("aria-label", "Fechar");
    header.append(historyButton, newButton, close);

    const product = el("select", "gemini-docs-product");
    product.id = "geminiDocsProduct";
    product.setAttribute("aria-label", "Produto");
    product.appendChild(new Option("Todos os produtos", ""));
    PRODUCTS.forEach((p) => product.appendChild(new Option(p, p)));
    const savedProduct = await storageGet(PRODUCT_KEY);
    product.value = PRODUCTS.includes(savedProduct) ? savedProduct : "";
    product.addEventListener("change", () => storageSet(PRODUCT_KEY, product.value));

    const list = el("div", "gemini-docs-messages");
    list.setAttribute("aria-live", "polite");
    const history = el("div", "gemini-docs-history"); history.hidden = true;

    const form = el("form", "gemini-docs-form");
    const input = el("textarea", "gemini-docs-input");
    input.id = "inputBuscaDocs";
    input.rows = 2; input.maxLength = MAX_MESSAGE_CHARS;
    input.placeholder = "Pergunte sobre o sistema… (Enter envia)";
    input.setAttribute("aria-label", "Pergunta");
    const sendButton = el("button", "gemini-docs-send", "Enviar"); sendButton.type = "submit";
    sendButton.id = "btnBuscarDocs";
    form.append(input, sendButton);

    popup.append(header, product, list, history, form);
    document.body.appendChild(popup);
    globalThis.ThemeModule?.apply?.(popup);

    state = { popup, list, history, form, input, product, sendButton, historyButton, busy: false, conversation: newConversation() };
    const recent = (await loadConversations())[0];
    // Reopening within an hour continues the last conversation.
    if (recent && Date.now() - (recent.updatedAt || 0) < 60 * 60 * 1000) state.conversation = recent;

    close.addEventListener("click", () => { popup.remove(); state = null; });
    newButton.addEventListener("click", () => { state.conversation = newConversation(); showHistory(false); renderMessages(); input.focus(); });
    historyButton.addEventListener("click", () => showHistory(state.history.hidden));
    form.addEventListener("submit", (event) => { event.preventDefault(); send(); });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { popup.remove(); state = null; return; }
      // SZ's global shortcuts must not see what is typed here.
      event.stopPropagation();
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); }
    });

    renderMessages();
    setTimeout(() => input.focus(), 50);
  }

  return {
    exibirPainelConsultaDocs,
    close,
    _test: { messagesForApi, safeSources, titleFrom, formatDate, renderAnswer }
  };
})();

window.DocsModule = DocsModule;
