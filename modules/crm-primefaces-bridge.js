(() => {
  const EVENT_NAME = "atendeai:crm-documentation-search";
  const COMPONENT_ID = "frmAtendimento:tbvAtendimento:documentacao";
  const INPUT_ID = "frmAtendimento:tbvAtendimento:documentacao_input";
  const STATUS_ATTR = "data-atendeai-documentation-bridge";

  function setStatus(status) {
    document.documentElement?.setAttribute(STATUS_ATTR, status);
  }

  function findWidget() {
    const primeFaces = window.PrimeFaces;
    if (!primeFaces) return null;

    if (typeof primeFaces.getWidgetById === "function") {
      const byId = primeFaces.getWidgetById(COMPONENT_ID);
      if (byId) return byId;
    }

    const widgets = Object.values(primeFaces.widgets || {});
    return widgets.find((widget) => {
      if (!widget) return false;

      const ids = Array.isArray(widget.id) ? widget.id : [widget.id];
      if (ids.includes(COMPONENT_ID)) return true;

      try {
        return widget.input?.attr?.("id") === INPUT_ID;
      } catch (_) {
        return false;
      }
    }) || null;
  }

  document.addEventListener(EVENT_NAME, () => {
    try {
      const widget = findWidget();

      if (!widget || typeof widget.search !== "function") {
        setStatus("widget-not-found");
        return;
      }

      setStatus("searching");
      widget.search("%%%");
      setStatus("requested");
    } catch (error) {
      console.warn("AtendeAI: falha ao disparar busca PrimeFaces.", error);
      setStatus("error");
    }
  });

  setStatus("ready");
})();