// "Meus retornos" strip on /crm-chamado-por-tecnico, above the native CHAMADOS table (which it never
// touches), plus the table sync and the one-time news notice. The table lists the technician's open
// chamados, scheduled ones included, so a return whose protocol is gone from a fully loaded table
// was finished, cancelled or transferred somewhere else, and is dropped.
const RetornosStrip = (() => {
  const STRIP_ID = "atendeai-retornos-strip";
  const NEWS_ID = "atendeai-retornos-news";
  const TABLE_ID = "frmTabela:dtTPos";
  const BODY_ID = "frmTabela:dtTPos_data";
  const REQUIRED_HEADERS = ["agendamento", "protocolo", "cliente", "produto"];
  const norm = (v) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();

  function cellValue(td) {
    const title = td.querySelector?.(".ui-column-title")?.textContent || "";
    const text = String(td.textContent ?? "");
    return title ? text.replace(title, "") : text;
  }

  // Recognized only when it is surely the full CHAMADOS table; otherwise nothing may be removed.
  function readTable(doc) {
    const none = { recognized: false, protocolos: [] };
    const wrapper = doc.getElementById(TABLE_ID);
    const body = doc.getElementById(BODY_ID);
    if (!wrapper || !body) return none;
    if (wrapper.querySelectorAll(".ui-paginator").length) return none;
    const headers = [...wrapper.querySelectorAll("thead th")].map((th) => norm(th.textContent));
    if (!REQUIRED_HEADERS.every((h) => headers.includes(h))) return none;
    const column = headers.indexOf("protocolo");
    const rows = [...body.querySelectorAll("tr")].filter((tr) => !/ui-datatable-empty-message/.test(tr.className || ""));
    if (!rows.length) return none;
    const protocolos = [];
    for (const row of rows) {
      const cell = [...row.children][column];
      const digits = cell ? cellValue(cell).replace(/\D/g, "") : "";
      if (!digits) return none;
      protocolos.push(digits);
    }
    return { recognized: true, protocolos };
  }

  function buildStrip(doc) {
    const L = globalThis.RetornosList;
    const counts = L.make(doc, "div", { class: "atendeai-retornos-counts" });
    const holder = L.make(doc, "div", { class: "atendeai-retornos-body" });
    const head = L.make(doc, "div", { class: "atendeai-retornos-strip-head" }, [
      L.make(doc, "span", { class: "atendeai-retornos-seal", text: "AtendeAI" }),
      L.make(doc, "span", { class: "atendeai-retornos-strip-title", text: "Meus retornos" }),
      counts
    ]);
    const strip = L.make(doc, "section", { id: STRIP_ID, class: "atendeai-retornos-strip", "aria-label": "Meus retornos do AtendeAI" }, [head, holder]);
    strip._counts = counts;
    strip._body = holder;
    return strip;
  }

  async function paint(doc, strip, opts) {
    const store = globalThis.RetornosStore, L = globalThis.RetornosList;
    const items = await store.list();
    const now = opts.now();
    L.render(strip._body, {
      doc, items, now, withManual: false,
      onOpen: (item) => opts.open(L.openUrl(item), "_blank", "noopener"),
      onRemove: async (item) => { await store.remove(item.key); }
    });
    const c = L.counts(items.filter((i) => i.kind === "crm"), now);
    while (strip._counts.children.length) strip._counts.children[0].remove();
    [[c.atrasados, "atrasados", "late"], [c.hoje, "hoje", "today"], [c.proximos, "próximos", "next"]].forEach(([n, label, tone]) => {
      strip._counts.appendChild(L.make(doc, "span", { class: "atendeai-retornos-count", "data-tone": tone, text: `${n} ${label}` }));
    });
    globalThis.ThemeModule?.apply?.(strip);
  }

  async function mount(doc, options = {}) {
    const store = globalThis.RetornosStore;
    const opts = { open: () => {}, now: () => Date.now(), ...options };
    if (!store || !(await store.isActive())) return false;
    if (doc.getElementById(STRIP_ID)) return false;
    const table = doc.getElementById(TABLE_ID);
    if (!table?.parentElement) return false;
    const strip = buildStrip(doc);
    table.parentElement.insertBefore(strip, table);
    await paint(doc, strip, opts);
    store.onChange(() => { void paint(doc, strip, opts); });
    return true;
  }

  async function showNews(doc) {
    const store = globalThis.RetornosStore, L = globalThis.RetornosList;
    if (doc.getElementById(NEWS_ID) || !(await store.isActive()) || (await store.getFlag("newsSeen"))) return;
    const ok = L.make(doc, "button", { type: "button", class: "atendeai-retornos-btn", "data-kind": "primary", text: "Entendi" });
    const steps = L.make(doc, "ol", {}, [
      "Agende no CRM como sempre.", "O AtendeAI guarda e te avisa na hora.", "Abra direto pela faixa “Meus retornos”."
    ].map((text) => L.make(doc, "li", { text })));
    const news = L.make(doc, "div", { id: NEWS_ID, class: "atendeai-retornos-news", role: "dialog", "aria-label": "Novidade do AtendeAI" }, [
      L.make(doc, "span", { class: "atendeai-retornos-seal", text: "AtendeAI" }),
      L.make(doc, "div", { class: "atendeai-retornos-news-title", text: "Seus retornos agora te encontram" }),
      steps,
      L.make(doc, "div", { class: "atendeai-retornos-actions" }, [ok])
    ]);
    ok.addEventListener("click", async () => { await store.setFlag("newsSeen", true); news.remove(); });
    globalThis.RetornosAlert.stack(doc, "crm").appendChild(news);
  }

  async function start(doc, win, options = {}) {
    const store = globalThis.RetornosStore;
    const opts = { open: (url, target, features) => win.open(url, target, features), now: () => Date.now(), auto: true, ...options };
    let lastSignature = null, lastTableAt = opts.now();

    async function sync() {
      if (!(await store.isActive())) return [];
      const table = readTable(doc);
      if (!table.recognized) return [];
      const signature = table.protocolos.join(",");
      if (signature !== lastSignature) { lastSignature = signature; lastTableAt = opts.now(); }
      return store.syncWithTable(table.protocolos, lastTableAt);
    }

    async function tick() {
      try {
        if (!doc.getElementById(STRIP_ID)) await mount(doc, opts);
        if (doc.getElementById(STRIP_ID)) await showNews(doc);
        await sync();
      } catch (error) { console.warn("AtendeAI: faixa de retornos falhou.", error); }
    }

    if (opts.auto) {
      let pending = null;
      const later = () => { clearTimeout(pending); pending = setTimeout(() => { void tick(); }, 1500); };
      try { new MutationObserver(later).observe(doc.body, { childList: true, subtree: true }); } catch { /* no observer */ }
      setInterval(() => { void tick(); }, 20000);
      void tick();
      setTimeout(() => { void tick(); }, 700);
    }
    return { sync, showNews: () => showNews(doc), refresh: tick };
  }

  return { readTable, mount, start, showNews, STRIP_ID, NEWS_ID };
})();

globalThis.RetornosStrip = RetornosStrip;
if (typeof window !== "undefined") {
  window.RetornosStrip = RetornosStrip;
  if (typeof document !== "undefined" && typeof location !== "undefined" && /\/crm-chamado-por-tecnico/.test(location.pathname)) {
    void RetornosStrip.start(document, window);
  }
}
