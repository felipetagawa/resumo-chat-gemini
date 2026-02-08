const DEFAULT_API_BASE_URL = "https://gemini-resumo-298442462030.southamerica-east1.run.app";

// rastreia versao
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install" || details.reason === "update") {
    try {
      const manifest = chrome.runtime.getManifest();
      const currentVersion = manifest.version;

      const { versionHistory } = await chrome.storage.local.get(["versionHistory"]);
      let history = versionHistory || [];

      // Se o histórico está vazio, adicionar versões anteriores conhecidas
      if (history.length === 0) {
        // Adicionar versão 1.4.6 como primeira entrada
        history.push({
          version: "1.4.6",
          timestamp: Date.now() - 86400000 // 1 dia atrás
        });
      }

      // Verificar se a versão atual já está registrada
      const alreadyRecorded = history.some(item => item.version === currentVersion);

      if (!alreadyRecorded) {
        history.push({
          version: currentVersion,
          timestamp: Date.now()
        });

        await chrome.storage.local.set({ versionHistory: history });
        console.log(`Versão ${currentVersion} registrada no histórico`);
      }
    } catch (e) {
      console.error("Error tracking version history:", e);
    }
  }
});

async function getApiBaseUrl() {
  try {
    const { apiBaseUrl } = await chrome.storage.local.get(["apiBaseUrl"]);
    const v = String(apiBaseUrl || "").trim();
    return v || DEFAULT_API_BASE_URL;
  } catch (_) {
    return DEFAULT_API_BASE_URL;
  }
}

function sendTabMessageSafe(tabId, payload) {
  try {
    if (tabId) chrome.tabs.sendMessage(tabId, payload);
  } catch (_) { }
}

async function apiFetchJson(url, options = {}) {
  const resp = await fetch(url, options);

  let json = null;
  let text = "";
  try {
    json = await resp.json();
  } catch (_) {
    try {
      text = await resp.text();
    } catch (_) { }
  }

  if (!resp.ok) {
    const msg =
      (json && (json.erro || json.message)) ||
      (text ? text.slice(0, 400) : "") ||
      `HTTP ${resp.status}`;
    const err = new Error(msg);
    err.status = resp.status;
    err.body = json ?? text;
    throw err;
  }

  return json ?? {};
}

function normalizeDateStr(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function normalizeName(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function normalizeBool(v) {
  if (v == null) return null;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes" || s === "sim") return true;
  if (s === "false" || s === "0" || s === "no" || s === "nao" || s === "não") return false;
  return null;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const safeSend = (data) => {
    try { sendResponse(data); } catch (_) { }
  };

  const tabId = sender?.tab?.id;

  if (request?.action === "openOptions") {
    try {
      chrome.runtime.openOptionsPage();
    } catch (e) {
      const url = chrome.runtime.getURL("options.html");
      chrome.tabs.create({ url });
    }
    safeSend({ success: true });
    return true;
  }

  if (request?.action === "gerarResumo") {
    (async () => {
      try {
        const apiBaseUrl = await getApiBaseUrl();
        const { texto } = request;

        const storageData = await chrome.storage.local.get(["customInstructions", "history"]);
        const customInstructions = storageData.customInstructions || "";

        let textoFinal = texto;
        if (customInstructions.trim()) {
          textoFinal =
            `INSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${customInstructions}\n\n---\n\nHISTÓRICO DO CHAT:\n${texto}`;
        }

        const json = await apiFetchJson(`${apiBaseUrl}/api/gemini/resumir`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texto: textoFinal })
        });

        const resumoTexto = json.summary || json.resumo || "";

        const novoItem = { timestamp: Date.now(), summary: resumoTexto };
        const history = storageData.history || [];
        history.push(novoItem);
        if (history.length > 20) history.shift();
        await chrome.storage.local.set({ history });

        sendTabMessageSafe(tabId, { action: "exibirResumo", resumo: resumoTexto });
        safeSend({ success: true, resumo: resumoTexto });

      } catch (err) {
        const msg = "Erro: " + (err?.message || String(err));
        sendTabMessageSafe(tabId, { action: "exibirErro", erro: msg });
        safeSend({ erro: msg });
      }
    })();

    return true;
  }

  if (request?.action === "gerarDica") {
    (async () => {
      try {
        const apiBaseUrl = await getApiBaseUrl();
        const { texto } = request;

        const json = await apiFetchJson(`${apiBaseUrl}/api/chamado/processar-dica`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texto })
        });

        safeSend({ success: true, dica: json });

      } catch (err) {
        safeSend({ success: false, erro: "Erro ao processar dica: " + (err?.message || String(err)) });
      }
    })();

    return true;
  }

  if (request?.action === "buscarDocumentacao") {
    (async () => {
      try {
        const apiBaseUrl = await getApiBaseUrl();
        const { query } = request;

        const url = new URL(`${apiBaseUrl}/api/docs/search`);
        if (query) url.searchParams.append("query", query);
        url.searchParams.append("categoria", "manuais");

        const json = await apiFetchJson(url.toString(), { method: "GET" });
        safeSend({ sucesso: true, resultado: json });

      } catch (err) {
        safeSend({ sucesso: false, erro: (err?.message || String(err)) });
      }
    })();

    return true;
  }

  if (request?.action === "preControl:create") {
    (async () => {
      try {
        const apiBaseUrl = await getApiBaseUrl();

        const payload = { ...(request?.payload || {}) };
        payload.negociation = !!payload.negociation;

        if (payload.name != null) payload.name = String(payload.name).trim();
        if (payload.nameClient != null) payload.nameClient = String(payload.nameClient).trim();

        await apiFetchJson(`${apiBaseUrl}/api/pre-controls`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        sendTabMessageSafe(tabId, { action: "preControl:sucesso" });
        safeSend({ success: true });

      } catch (err) {
        const msg = "Erro: " + (err?.message || String(err));
        sendTabMessageSafe(tabId, { action: "exibirErro", erro: msg });
        safeSend({ success: false, erro: msg });
      }
    })();

    return true;
  }

  if (request?.action === "preControl:query") {
    (async () => {
      try {
        const apiBaseUrl = await getApiBaseUrl();

        const name = normalizeName(request?.name);
        const date = normalizeDateStr(request?.date);
        const dateFrom = normalizeDateStr(request?.dateFrom);
        const dateTo = normalizeDateStr(request?.dateTo);
        const negociation = normalizeBool(request?.negociation);

        const url = new URL(`${apiBaseUrl}/api/pre-controls`);

        const page = request?.page != null ? String(request.page) : null;
        const size = request?.size != null ? String(request.size) : null;

        if (name) url.searchParams.set("name", name);

        if (dateFrom || dateTo) {
          if (dateFrom) url.searchParams.set("dateFrom", dateFrom);
          if (dateTo) url.searchParams.set("dateTo", dateTo);
        } else if (date) {
          url.searchParams.set("date", date);
        }

        if (negociation !== null) url.searchParams.set("negociation", String(negociation));

        if (page) url.searchParams.set("page", page);
        if (size) url.searchParams.set("size", size);

        const json = await apiFetchJson(url.toString(), { method: "GET" });
        safeSend({ success: true, data: json });

      } catch (err) {
        const msg = "Erro: " + (err?.message || String(err));
        sendTabMessageSafe(tabId, { action: "exibirErro", erro: msg });
        safeSend({ success: false, erro: msg });
      }
    })();

    return true;
  }

  return false;
});