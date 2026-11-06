// Shared rendering of the returns list: the "Meus retornos" strip and Agenda & Gestão › Retornos.
// Built with createElement/textContent only (no innerHTML), so stored text can never become markup.
const RetornosList = (() => {
  const CRM_ORIGIN = "https://www.sistemaempresarialweb.com.br";
  const EMPTY_TEXT = "Nenhum retorno marcado. Quando você salvar um atendimento com Agendar, ele aparece aqui com um botão para abrir direto, e eu te aviso na hora.";

  function make(doc, tag, props = {}, children = []) {
    const node = doc.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
      if (key === "text") node.textContent = value;
      else if (key === "class") node.className = value;
      else if (key === "id") node.id = value;
      else node.setAttribute(key, value);
    });
    children.forEach((child) => node.appendChild(child));
    return node;
  }

  const openUrl = (item) => (item?.atendimentoId ? `${CRM_ORIGIN}/crm-atendimento/${encodeURIComponent(item.atendimentoId)}` : "");

  function counts(items, now = Date.now()) {
    const g = globalThis.RetornosSchedule.groupRetornos((items || []).filter((i) => !i.legacy), now);
    return { atrasados: g.atrasados.length, hoje: g.hoje.length, proximos: g.proximos.length };
  }

  function row(doc, item, now, { tone, onOpen, onRemove }) {
    const S = globalThis.RetornosSchedule;
    const isManual = item.kind === "manual";
    const who = make(doc, "div", { class: "atendeai-retornos-who" }, [
      make(doc, "div", { class: "atendeai-retornos-client", text: isManual ? item.text : (item.cliente || "Cliente sem nome") })
    ]);
    const detail = isManual ? "" : item.problema || "";
    if (detail) who.appendChild(make(doc, "div", { class: "atendeai-retornos-what", text: detail }));
    const actions = make(doc, "div", { class: "atendeai-retornos-actions" });
    if (!isManual && item.atendimentoId && onOpen) {
      const open = make(doc, "button", { type: "button", class: "atendeai-retornos-btn", "data-kind": "primary", text: "Abrir" });
      open.addEventListener("click", () => onOpen(item));
      actions.appendChild(open);
    }
    if (onRemove) {
      const remove = make(doc, "button", { type: "button", class: "atendeai-retornos-btn", text: "Remover", "aria-label": "Remover retorno" });
      remove.addEventListener("click", () => onRemove(item));
      actions.appendChild(remove);
    }
    const when = make(doc, "div", { class: "atendeai-retornos-when", text: S.whenLabel(item.dueAt, now) });
    if (isManual) who.children[0]?.appendChild(make(doc, "span", { class: "atendeai-retornos-tag", text: "anotado à mão" }));
    return make(doc, "div", { class: "atendeai-retornos-row", "data-tone": tone }, [when, who, actions]);
  }

  function render(container, { doc = container.ownerDocument || document, items = [], now = Date.now(), withManual = false, showLegacy = false, onOpen, onRemove } = {}) {
    while (container.children.length) container.children[0].remove();
    const S = globalThis.RetornosSchedule;
    const live = items.filter((i) => !i.legacy && (withManual || i.kind === "crm"));
    const legacy = showLegacy ? items.filter((i) => i.legacy) : [];
    const list = make(doc, "div", { class: "atendeai-retornos-list" });
    if (!live.length) list.appendChild(make(doc, "p", { class: "atendeai-retornos-empty", text: EMPTY_TEXT }));
    const g = S.groupRetornos(live, now);
    [["Atrasados", g.atrasados, "late"], ["Hoje", g.hoje, "today"], ["Próximos", g.proximos, "next"]].forEach(([title, group, tone]) => {
      if (!group.length) return;
      const section = make(doc, "div", { class: "atendeai-retornos-group" }, [
        make(doc, "h4", { class: "atendeai-retornos-group-title", "data-tone": tone, text: `${title} (${group.length})` })
      ]);
      group.forEach((item) => section.appendChild(row(doc, item, now, { tone, onOpen, onRemove })));
      list.appendChild(section);
    });
    if (legacy.length) {
      const details = make(doc, "details", { class: "atendeai-retornos-legacy" }, [
        make(doc, "summary", { text: `Da agenda antiga (${legacy.length})` })
      ]);
      legacy.sort((a, b) => b.dueAt - a.dueAt).forEach((item) => details.appendChild(row(doc, item, now, { tone: "legacy", onRemove })));
      list.appendChild(details);
    }
    container.appendChild(list);
    return list;
  }

  return { render, counts, openUrl, make, EMPTY_TEXT, CRM_ORIGIN };
})();

globalThis.RetornosList = RetornosList;
if (typeof window !== "undefined") window.RetornosList = RetornosList;
