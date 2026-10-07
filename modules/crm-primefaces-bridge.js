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
  const SELECT_CONFIRM_TIMEOUT_WITH_BEHAVIOR_MS = 1400;
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

  function confirmValues(widget, id, label) {
    const input = document.getElementById(INPUT_ID);
    if (normalize(input?.value) !== normalize(label)) return false;

    const hiddenValue = readHiddenValue(widget);
    return Boolean(hiddenValue) && String(hiddenValue) === String(id);
  }

  function hasConfiguredItemSelectBehavior(widget) {
    if (!widget) return false;
    if (typeof widget.hasBehavior === "function") {
      try {
        if (widget.hasBehavior("itemSelect") === true) return true;
      } catch (_) {
        /* ignore feature-detect errors */
      }
    }
    return typeof widget.cfg?.behaviors?.itemSelect === "function";
  }

  function confirmSelection(widget, id, label, observer) {
    if (!confirmValues(widget, id, label)) return false;
    if (hasConfiguredItemSelectBehavior(widget) && observer.count() === 0) return false;
    return true;
  }

  function noopObserver() {
    return {
      count() {
        return 0;
      },
      restore() {}
    };
  }

  function observeItemSelect(widget) {
    if (!widget) return noopObserver();

    const state = { count: 0, restored: false };
    const restorers = [];
    const behaviors = widget.cfg && widget.cfg.behaviors;
    const originalBehavior = behaviors && behaviors.itemSelect;
    const hasBehaviorFn = typeof originalBehavior === "function";

    function install(target, name, wrap) {
      const original = target?.[name];
      if (typeof original !== "function") return;
      const wrapped = wrap(original);
      target[name] = wrapped;
      restorers.push(() => {
        target[name] = original;
      });
    }

    if (hasBehaviorFn) {
      install(behaviors, "itemSelect", (original) => function wrappedItemSelectBehavior() {
        state.count += 1;
        return original.apply(this, arguments);
      });
    }

    install(widget, "callBehavior", (original) => function wrappedCallBehavior(name) {
      const result = original.apply(this, arguments);
      if (name === "itemSelect" && !hasBehaviorFn) state.count += 1;
      return result;
    });

    install(widget, "invokeItemSelectBehavior", (original) => {
      const wrapped = function wrappedInvokeItemSelectBehavior() {
        const before = state.count;
        const result = original.apply(this, arguments);
        if (state.count === before && hasConfiguredItemSelectBehavior(widget)) {
          state.count += 1;
        }
        return result;
      };
      wrapped.__atendeaiArity = original.length;
      return wrapped;
    });

    return {
      count() {
        return state.count;
      },
      restore() {
        if (state.restored) return;
        state.restored = true;
        restorers.forEach((fn) => {
          try {
            fn();
          } catch (_) {
            /* ignore restore errors */
          }
        });
      }
    };
  }

  function itemValueOf(item) {
    try {
      if (typeof item?.attr === "function") {
        const value = item.attr("data-item-value");
        if (value != null && String(value)) return String(value);
      }
      if (typeof item?.getAttribute === "function") {
        return String(item.getAttribute("data-item-value") || "");
      }
      if (item?.[0]?.getAttribute) {
        return String(item[0].getAttribute("data-item-value") || "");
      }
    } catch (_) {
      return "";
    }
    return "";
  }

  function makeSyntheticEvent() {
    try {
      if (typeof MouseEvent === "function") {
        return new MouseEvent("click", { bubbles: true, cancelable: true });
      }
    } catch (_) {
      /* fall through */
    }
    return { type: "click", bubbles: true };
  }

  function fireWidgetItemSelect(widget, item) {
    if (typeof widget.invokeItemSelectBehavior === "function") {
      const arity = Number(
        widget.invokeItemSelectBehavior.__atendeaiArity ?? widget.invokeItemSelectBehavior.length
      ) || 0;
      const itemValue = itemValueOf(item);
      const event = makeSyntheticEvent();
      try {
        if (arity >= 2) widget.invokeItemSelectBehavior(event, itemValue);
        else if (arity === 1) widget.invokeItemSelectBehavior(itemValue);
        else widget.invokeItemSelectBehavior();
      } catch (_) {
        try {
          widget.invokeItemSelectBehavior();
        } catch (__) {
          /* ignore */
        }
      }
      return true;
    }

    if (typeof widget.callBehavior === "function") {
      try {
        widget.callBehavior("itemSelect");
        return true;
      } catch (_) {
        return false;
      }
    }

    return false;
  }

  function triggerDomEvent(element, type) {
    if (!element || typeof element.dispatchEvent !== "function") return false;
    try {
      const EventCtor = typeof MouseEvent === "function" ? MouseEvent : Event;
      return element.dispatchEvent(new EventCtor(type, { bubbles: true, cancelable: true }));
    } catch (_) {
      return false;
    }
  }

  function activateViaJQuery(element) {
    const jquery = window.jQuery || window.$;
    if (typeof jquery !== "function") return false;
    try {
      const wrapped = jquery(element);
      if (typeof wrapped.trigger === "function") {
        wrapped.trigger("mousedown");
        wrapped.trigger("click");
        return true;
      }
      if (typeof wrapped.click === "function") {
        wrapped.click();
        return true;
      }
    } catch (_) {
      return false;
    }
    return false;
  }

  function activatePrimaryItem(element) {
    if (!element) return false;
    triggerDomEvent(element, "mousedown");
    if (typeof element.click === "function") {
      element.click();
      return true;
    }
    return activateViaJQuery(element);
  }

  function markItemSelectFired(observer) {
    if (observer.count() > 0) setStatus("item-select-fired");
  }

  function finishSuccess(observer) {
    markItemSelectFired(observer);
    observer.restore();
    setStatus("selected");
  }

  function finishIfConfirmed(widget, id, label, observer) {
    if (!confirmSelection(widget, id, label, observer)) return false;
    finishSuccess(observer);
    return true;
  }

  function waitIfItemSelectFired(widget, id, label, observer) {
    if (observer.count() === 0) return false;
    markItemSelectFired(observer);
    confirmSelectionWhenReady(widget, id, label, observer);
    return true;
  }

  function revertPartialSelection(widget, id, label) {
    const input = document.getElementById(INPUT_ID);
    const matchesInput = Boolean(input) && normalize(input.value) === normalize(label);
    const matchesHidden = String(readHiddenValue(widget) || "") === String(id);
    if (!matchesInput && !matchesHidden) return;

    try {
      if (input) input.value = "";
      const hidden = document.getElementById(HIDDEN_ID);
      if (hidden) hidden.value = "";
      if (typeof widget?.hinput?.val === "function") widget.hinput.val("");
    } catch (_) {
      /* ignore */
    }

    try {
      if (typeof widget.search === "function") {
        widget.search(label || "%%%");
      }
    } catch (_) {
      /* ignore */
    }

    const item = findExactItem(id, label);
    if (!item) return;
    try {
      item.classList?.add("ui-state-highlight");
    } catch (_) {
      /* ignore */
    }
  }

  function confirmTimeoutMs(widget) {
    return hasConfiguredItemSelectBehavior(widget)
      ? SELECT_CONFIRM_TIMEOUT_WITH_BEHAVIOR_MS
      : SELECT_CONFIRM_TIMEOUT_MS;
  }

  function confirmSelectionWhenReady(widget, id, label, observer) {
    const settle = () => {
      if (!confirmSelection(widget, id, label, observer)) return false;
      clearSelectConfirmTimer();
      finishSuccess(observer);
      return true;
    };

    if (settle()) return;

    const startedAt = Date.now();
    const timeout = confirmTimeoutMs(widget);
    selectConfirmTimer = setInterval(() => {
      if (settle()) return;
      if (Date.now() - startedAt >= timeout) {
        clearSelectConfirmTimer();
        observer.restore();
        revertPartialSelection(widget, id, label);
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

  function runPrimaryNativeItemFlow(widget, element, id, label, observer) {
    setStatus("activating-item");
    const primaryUsed = activatePrimaryItem(element);

    if (primaryUsed && finishIfConfirmed(widget, id, label, observer)) return true;
    if (waitIfItemSelectFired(widget, id, label, observer)) return true;

    if (!confirmSelection(widget, id, label, observer)) {
      activateViaJQuery(element);
    }

    if (finishIfConfirmed(widget, id, label, observer)) return true;
    return waitIfItemSelectFired(widget, id, label, observer);
  }

  function runControlledFallback(widget, item, id, label, observer) {
    if (typeof widget.selectItem === "function") {
      widget.selectItem(item);
    }

    if (hasConfiguredItemSelectBehavior(widget) && observer.count() === 0) {
      fireWidgetItemSelect(widget, item);
    }

    markItemSelectFired(observer);
    confirmSelectionWhenReady(widget, id, label, observer);
  }

  function selectDocumentation(id, label) {
    const observer = { current: noopObserver() };
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

      setStatus("candidate-found");
      observer.current = observeItemSelect(widget);

      if (runPrimaryNativeItemFlow(widget, element, id, label, observer.current)) return;

      runControlledFallback(widget, wrapItem(element), id, label, observer.current);
    } catch (error) {
      clearSelectConfirmTimer();
      observer.current.restore();
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
