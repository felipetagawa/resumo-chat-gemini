// "Retorno agora": the in-browser alert shown on every open SZ.chat and CRM tab when a return is due.
// It stays until the technician closes (×) or snoozes it; both choices live in storage, so closing
// it in one tab closes it in all of them. It never offers to open the attendance: at that moment the
// technician goes to call the client on SZ.chat.
const RetornosAlert = (() => {
  const STACK_ID = "atendeai-retornos-stack";
  const ALERT_ID = "atendeai-retornos-alert";
  const SAFETY_MS = 30000;
  const MAX_TIMER_MS = 3600000;

  function stack(doc, placement) {
    let node = doc.getElementById(STACK_ID);
    if (!node) {
      node = globalThis.RetornosList.make(doc, "div", { id: STACK_ID, class: "atendeai-retornos-stack" });
      doc.body.appendChild(node);
    }
    if (placement) node.setAttribute("data-placement", placement);
    return node;
  }

  function line(doc, store, item, now, clock, onDone) {
    const L = globalThis.RetornosList, S = globalThis.RetornosSchedule;
    const manual = item.kind === "manual";
    const title = manual ? item.text : item.cliente || "Cliente sem nome";
    const sub = manual
      ? `anotado à mão · ${S.whenLabel(item.dueAt, now)}`
      : [item.problema, `${S.createdLabel(item.createdAt, now)} · era ${S.whenLabel(item.dueAt, now)}`].filter(Boolean).join(" · ");
    const close = L.make(doc, "button", { type: "button", class: "atendeai-retornos-btn atendeai-retornos-close", "aria-label": "Fechar", title: "Fechar (o retorno continua na lista)", text: "×" });
    close.addEventListener("click", async () => { await store.acknowledge(item.key); onDone(); });
    const snooze = L.make(doc, "div", { class: "atendeai-retornos-snooze" }, [
      L.make(doc, "span", { class: "atendeai-retornos-snooze-label", text: "Adiar:" })
    ]);
    S.snoozeOptions(new Date(now)).forEach((option) => {
      const button = L.make(doc, "button", { type: "button", class: "atendeai-retornos-btn", text: option.label });
      // The alert can stay on screen for a long time: the chosen delay counts from the click.
      button.addEventListener("click", async () => {
        const at = S.snoozeOptions(new Date(clock())).find((o) => o.id === option.id).at;
        await store.snooze(item.key, at);
        onDone();
      });
      snooze.appendChild(button);
    });
    return L.make(doc, "div", { class: "atendeai-retornos-alert-item" }, [
      L.make(doc, "div", { class: "atendeai-retornos-alert-line" }, [
        L.make(doc, "div", { class: "atendeai-retornos-who" }, [
          L.make(doc, "div", { class: "atendeai-retornos-client", text: title }),
          L.make(doc, "div", { class: "atendeai-retornos-what", text: sub })
        ]),
        close
      ]),
      snooze
    ]);
  }

  function render(doc, store, items, now, clock, placement, onDone) {
    const existing = doc.getElementById(ALERT_ID);
    if (!items.length) {
      existing?.remove();
      return;
    }
    existing?.remove();
    const L = globalThis.RetornosList;
    const head = L.make(doc, "div", { class: "atendeai-retornos-alert-head" }, [
      L.make(doc, "span", { class: "atendeai-retornos-seal", text: "AtendeAI" }),
      L.make(doc, "span", { class: "atendeai-retornos-alert-title", text: items.length > 1 ? `Retornos agora (${items.length})` : "Retorno agora" })
    ]);
    if (items.length > 1) {
      const all = L.make(doc, "button", { type: "button", class: "atendeai-retornos-btn atendeai-retornos-close", text: "Fechar todos" });
      all.addEventListener("click", async () => { for (const item of items) await store.acknowledge(item.key); onDone(); });
      head.appendChild(all);
    }
    const alert = L.make(doc, "div", { id: ALERT_ID, class: "atendeai-retornos-alert", role: "alert" }, [head]);
    items.forEach((item) => alert.appendChild(line(doc, store, item, now, clock, onDone)));
    stack(doc, placement).appendChild(alert);
    globalThis.ThemeModule?.apply?.(alert);
  }

  async function start(doc, options = {}) {
    if (doc._atendeaiRetornosAlert) return doc._atendeaiRetornosAlert;
    const store = globalThis.RetornosStore;
    const now = options.now || (() => Date.now());
    const setTimer = options.setTimer || ((fn, ms) => setTimeout(fn, ms));
    const clearTimer = options.clearTimer || ((id) => clearTimeout(id));
    let timer = null, safety = null, stopped = false;

    async function refresh() {
      if (stopped) return;
      clearTimer(timer);
      timer = null;
      try {
        if (!(await store.isActive())) { doc.getElementById(ALERT_ID)?.remove(); return; }
        const t = now();
        const due = await store.pending(t);
        const signature = due.map((i) => `${i.key}@${i.alertAt}`).join("|");
        const shown = doc.getElementById(ALERT_ID);
        if (!due.length) shown?.remove();
        else if (!shown || shown._signature !== signature) {
          render(doc, store, due, t, now, options.placement, () => { void refresh(); });
          const node = doc.getElementById(ALERT_ID);
          if (node) node._signature = signature;
        }
        const next = (await store.list())
          .filter((i) => !i.legacy && i.alertAt > t && i.ackedAt !== i.alertAt)
          .map((i) => i.alertAt).sort((a, b) => a - b)[0];
        if (next != null) timer = setTimer(() => { void refresh(); }, Math.min(Math.max(next - t, 0) + 250, MAX_TIMER_MS));
      } catch (error) {
        console.warn("AtendeAI: aviso de retorno falhou.", error);
      }
    }

    // Old manual agenda events (today onwards) must alert without anyone opening the Retornos tab first.
    try { await store.migrateAgenda(now()); } catch { /* never block the alert */ }
    const unsubscribe = store.onChange(() => { void refresh(); });
    // The timer is not enough alone: the computer may sleep, or its clock may change.
    safety = setTimer(function tick() { void refresh(); safety = setTimer(tick, SAFETY_MS); }, SAFETY_MS);
    await refresh();
    const handle = { refresh, stop() { stopped = true; clearTimer(timer); clearTimer(safety); unsubscribe(); doc.getElementById(ALERT_ID)?.remove(); doc._atendeaiRetornosAlert = null; } };
    doc._atendeaiRetornosAlert = handle;
    return handle;
  }

  return { start, stack, STACK_ID, ALERT_ID };
})();

globalThis.RetornosAlert = RetornosAlert;
if (typeof window !== "undefined") {
  window.RetornosAlert = RetornosAlert;
  // CRM tabs have no dock/orchestrator: this script starts itself there (SZ.chat starts it from content.js).
  if (typeof location !== "undefined" && /(^|\.)sistemaempresarialweb\.com\.br$/.test(location.hostname)) {
    void RetornosAlert.start(document, { placement: "crm" });
  }
}
