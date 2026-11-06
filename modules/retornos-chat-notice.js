// Notice when the technician opens, on SZ.chat, the chat of a client who has a pending return.
// Shown only when the chat↔return match is reliable (phone first, then a full name); otherwise silent.
const RetornosChatNotice = (() => {
  const NOTICE_ID = "atendeai-retornos-chat-notice";

  async function check({ name, phone } = {}, options = {}) {
    const doc = options.doc || document;
    const store = globalThis.RetornosStore, S = globalThis.RetornosSchedule, L = globalThis.RetornosList;
    const now = (options.now || (() => Date.now()))();
    doc.getElementById(NOTICE_ID)?.remove();
    if (!store || !(await store.isActive())) return;
    const crm = (await store.list()).filter((r) => r.kind === "crm" && !r.legacy);
    const match = S.matchChat(crm, { name, phone });
    if (!match) return;

    const close = L.make(doc, "button", { type: "button", class: "atendeai-retornos-btn", "aria-label": "Fechar", text: "×" });
    close.addEventListener("click", () => doc.getElementById(NOTICE_ID)?.remove());
    const actions = L.make(doc, "div", { class: "atendeai-retornos-actions" });
    if (match.atendimentoId) {
      const open = L.make(doc, "button", { type: "button", class: "atendeai-retornos-btn", "data-kind": "primary", text: "Abrir no CRM" });
      open.addEventListener("click", () => (options.open || ((...a) => window.open(...a)))(L.openUrl(match), "_blank", "noopener"));
      actions.appendChild(open);
    }
    actions.appendChild(close);
    const notice = L.make(doc, "div", { id: NOTICE_ID, class: "atendeai-retornos-chat-notice", role: "status" }, [
      L.make(doc, "span", { class: "atendeai-retornos-seal", text: "AtendeAI" }),
      L.make(doc, "p", { class: "atendeai-retornos-chat-text", text: `Você tem retorno marcado com este cliente (${S.whenLabel(match.dueAt, now)})` }),
      actions
    ]);
    globalThis.RetornosAlert.stack(doc, "sz").appendChild(notice);
    globalThis.ThemeModule?.apply?.(notice);
  }

  return { check, NOTICE_ID };
})();

globalThis.RetornosChatNotice = RetornosChatNotice;
if (typeof window !== "undefined") window.RetornosChatNotice = RetornosChatNotice;
