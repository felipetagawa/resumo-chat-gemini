(() => {
  const SEARCH_EVENT = "atendeai:crm-documentation-search";
  const SELECT_EVENT = "atendeai:crm-documentation-select";
  const COMPONENT_ID = "frmAtendimento:tbvAtendimento:documentacao";
  const INPUT_ID = "frmAtendimento:tbvAtendimento:documentacao_input";
  const PANEL_ID = "frmAtendimento:tbvAtendimento:documentacao_panel";
  const HIDDEN_ID = "frmAtendimento:tbvAtendimento:documentacao_hinput";
  const STATUS_ATTR = "data-atendeai-documentation-bridge";
  const SELECT_ID_ATTR = "data-atendeai-documentation-select-id";
  const SELECT_LABEL_ATTR = "data-atendeai-documentation-select-label";
  const SELECT_CONFIRM_TIMEOUT_MS = 450;
  const SELECT_CONFIRM_INTERVAL_MS = 50;

  let selectConfirmTimer = null;

  function setStatus(status) {
    document.documentElement?.setAttribute(STATUS_ATTR, status);
  }

  function clearSelectConfirmTimer() {
    if (selectConfirmTimer != null) {
      clearInterval(selectConfirmTimer);
      selectConfirmTimer = null;
    }
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
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

  function wrapItem(element) {
    if (!element) return null;
    if (typeof element.attr === "function") return element;

    const jquery = window.jQuery || window.$;
    if (typeof jquery === "function") {
      try {
        return jquery(element);
      } catch (_) {
        /* fall through to a minimal wrapper */
      }
    }

    return {
      0: element,
      attr(name) {
        return element.getAttribute(name);
      }
    };
  }

  function findExactItem(id, label) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return null;

    const wantedId = String(id);
    const matches = [...panel.querySelectorAll("li[data-item-value][data-item-label]")]
      .filter((item) => String(item.getAttribute("data-item-value") || "") === wantedId);
    if (!matches.length) return null;

    if (!label) return matches[0];

    const expected = normalize(label);
    return matches.find((item) => normalize(item.getAttribute("data-item-label")) === expected)
      || matches[0];
  }

  function readHiddenValue(widget) {
    try {
      if (typeof widget?.hinput?.val === "function") {
        const value = widget.hinput.val();
        if (Array.isArray(value)) return String(value[0] || "").trim();
        if (value != null && String(value).trim()) return String(value).trim();
      }

      const hidden = document.getElementById(HIDDEN_ID);
      if (hidden?.value) return String(hidden.value).trim();

      const selected = hidden?.querySelector?.("option[selected], option:checked");
      if (selected?.value) return String(selected.value).trim();
    } catch (_) {
      return "";
    }
    return "";
  }

  function confirmSelection(widget, id, label) {
    const input = document.getElementById(INPUT_ID);
    if (normalize(input?.value) !== normalize(label)) return false;

    const hiddenValue = readHiddenValue(widget);
    return Boolean(hiddenValue) && String(hiddenValue) === String(id);
  }

  function confirmSelectionWhenReady(widget, id, label) {
    if (confirmSelection(widget, id, label)) {
      setStatus("selected");
      return;
    }

    const startedAt = Date.now();
    selectConfirmTimer = setInterval(() => {
      if (confirmSelection(widget, id, label)) {
        clearSelectConfirmTimer();
        setStatus("selected");
        return;
      }
      if (Date.now() - startedAt >= SELECT_CONFIRM_TIMEOUT_MS) {
        clearSelectConfirmTimer();
        setStatus("select-failed");
      }
    }, SELECT_CONFIRM_INTERVAL_MS);
  }

  function readSelectPayload(event) {
    const detail = event?.detail || {};
    const root = document.documentElement;
    return {
      id: String(detail.id || root?.getAttribute(SELECT_ID_ATTR) || "").trim(),
      label: String(detail.label || root?.getAttribute(SELECT_LABEL_ATTR) || "").trim()
    };
  }

  function selectDocumentation(id, label) {
    try {
      clearSelectConfirmTimer();

      const widget = findWidget();
      if (!widget) {
        setStatus("widget-not-found");
        return;
      }

      setStatus("selecting");

      const element = findExactItem(id, label);
      if (!element) {
        setStatus("candidate-not-found");
        return;
      }

      const item = wrapItem(element);
      if (typeof widget.selectItem === "function") {
        widget.selectItem(item);
      } else if (typeof element.click === "function") {
        element.click();
      } else {
        setStatus("select-failed");
        return;
      }

      confirmSelectionWhenReady(widget, id, label);
    } catch (error) {
      clearSelectConfirmTimer();
      console.warn("AtendeAI: falha ao selecionar documentação PrimeFaces.", error);
      setStatus("select-failed");
    }
  }

  document.addEventListener(SEARCH_EVENT, () => {
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

  document.addEventListener(SELECT_EVENT, (event) => {
    const { id, label } = readSelectPayload(event);
    if (!id) {
      setStatus("select-failed");
      return;
    }
    selectDocumentation(id, label);
  });

  setStatus("ready");
})();
