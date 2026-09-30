const DocumentationSuggestionModule = (() => {
  const DOCUMENTATION_INPUT_ID = "frmAtendimento:tbvAtendimento:documentacao_input";
  const DOCUMENTATION_PANEL_ID = "frmAtendimento:tbvAtendimento:documentacao_panel";
  const UI_ID = "atendeai-documentation-suggestion";
  const MAX_JEV_CANDIDATES = 200;
  const LOAD_TIMEOUT_MS = 3000;

  const cache = new Map();

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  function extractPanelCandidates(panel) {
    const seen = new Set();
    return [...panel.querySelectorAll("li[data-item-value][data-item-label]")]
      .map((element) => ({
        id: String(element.dataset.itemValue || "").trim(),
        label: String(element.dataset.itemLabel || element.textContent || "").trim()
      }))
      .filter((candidate) => {
        if (!candidate.id || !candidate.label || seen.has(candidate.id)) return false;
        seen.add(candidate.id);
        return true;
      });
  }

  async function waitForCandidates(panel) {
    const startedAt = Date.now();
    let previousCount = -1;
    let stableReads = 0;

    while (Date.now() - startedAt < LOAD_TIMEOUT_MS) {
      const count = extractPanelCandidates(panel).length;

      if (count > 0 && count === previousCount) {
        stableReads += 1;
        if (stableReads >= 2) {
          return extractPanelCandidates(panel);
        }
      } else {
        stableReads = 0;
      }

      previousCount = count;
      await delay(120);
    }

    return extractPanelCandidates(panel);
  }

  async function loadCandidatesSilently() {
    const cacheKey = location.pathname;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const input = document.getElementById(DOCUMENTATION_INPUT_ID);
    const panel = document.getElementById(DOCUMENTATION_PANEL_ID);

    if (!input || !panel) {
      throw new Error("Campo de Documentação do CRM não encontrado.");
    }

    panel.style.setProperty("visibility", "hidden", "important");
    panel.style.setProperty("opacity", "0", "important");
    panel.style.setProperty("pointer-events", "none", "important");

    try {
      const bridgeStatus = document.documentElement?.getAttribute(
        "data-atendeai-documentation-bridge"
      );

      if (!bridgeStatus) {
        throw new Error("Integração PrimeFaces ainda não está pronta. Recarregue a página.");
      }

      document.dispatchEvent(new CustomEvent("atendeai:crm-documentation-search"));

      await delay(50);

      const requestedStatus = document.documentElement?.getAttribute(
        "data-atendeai-documentation-bridge"
      );

      if (requestedStatus === "widget-not-found") {
        throw new Error("Autocomplete de Documentação do CRM não foi encontrado.");
      }

      if (requestedStatus === "error") {
        throw new Error("O CRM não conseguiu iniciar a busca de documentações.");
      }

      const candidates = await waitForCandidates(panel);
      if (!candidates.length) {
        throw new Error("O CRM não retornou documentações para este atendimento.");
      }

      cache.set(cacheKey, candidates);
      return candidates;
    } finally {
      panel.style.removeProperty("visibility");
      panel.style.removeProperty("opacity");
      panel.style.removeProperty("pointer-events");
      panel.style.display = "none";
    }
  }

  const STOP_WORDS = new Set([
    "cliente", "esta", "está", "com", "uma", "para", "por", "que", "não", "nao",
    "foi", "tem", "erro", "duvida", "dúvida", "sistema", "nota", "fiscal", "ao",
    "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas", "e", "a", "o"
  ].map(normalizeText));

  function extractExplicitCodes(context) {
    const codes = new Set();
    const text = String(context || "");
    const regex = /\b(?:rejei[cç][aã]o|erro)\s*[:#-]?\s*(\d{3,4})\b/gi;
    let match;
    while ((match = regex.exec(text)) !== null) {
      codes.add(match[1]);
    }
    return [...codes];
  }

  function prefilterCandidates(candidates, context, limit = MAX_JEV_CANDIDATES) {
    const normalizedContext = normalizeText(context);
    const tokens = [...new Set(
      normalizedContext
        .split(" ")
        .filter(token => token.length >= 3 && !STOP_WORDS.has(token))
    )];
    const codes = extractExplicitCodes(context);

    const ranked = candidates.map((candidate, index) => {
      const normalizedLabel = normalizeText(candidate.label);
      let score = 0;

      for (const code of codes) {
        const codeRegex = new RegExp(`(^|\\s)${code}(\\s|$)`);
        if (codeRegex.test(normalizedLabel)) score += 1000;
      }

      for (const token of tokens) {
        if (normalizedLabel.includes(token)) score += 5;
      }

      for (let i = 0; i < tokens.length - 1; i++) {
        const pair = `${tokens[i]} ${tokens[i + 1]}`;
        if (normalizedLabel.includes(pair)) score += 12;
      }

      if (normalizedContext.length >= 10 && normalizedLabel.includes(normalizedContext)) {
        score += 100;
      }

      return { candidate, score, index };
    });

    ranked.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });

    return ranked.slice(0, Math.min(limit, ranked.length)).map(item => item.candidate);
  }

  function getCurrentContext() {
    const problem = document.getElementById("crm-input-problema")?.value?.trim();
    if (problem) return problem;

    const resolution = document.querySelector(
      '[id="frmAtendimento:tbvAtendimento:resolucao"], textarea[name*="resolucao"], textarea[id*="resolucao"]'
    )?.value?.trim();

    return resolution || "";
  }

  function clearElement(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  function addText(parent, tag, text, styleText = "") {
    const element = document.createElement(tag);
    element.textContent = String(text || "");
    if (styleText) element.style.cssText = styleText;
    parent.appendChild(element);
    return element;
  }

  function renderResult(resultEl, response, totalCandidates, sentCandidates) {
    clearElement(resultEl);

    const suggestions = Array.isArray(response?.suggestions) ? response.suggestions : [];
    const title = response?.mode === "single"
      ? "Documentação sugerida"
      : response?.mode === "uncertain"
        ? "Documentação pouco clara"
        : "Possíveis documentações";

    addText(resultEl, "div", title,
      "font-size:11px;font-weight:800;text-transform:uppercase;color:#64748b;margin-bottom:6px;");

    if (!suggestions.length) {
      addText(resultEl, "div", "Não foi possível identificar uma documentação com segurança.",
        "font-size:12px;color:#475569;line-height:1.4;");
    } else {
      suggestions.slice(0, 3).forEach((item) => {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:8px;justify-content:space-between;align-items:flex-start;margin-top:5px;";

        addText(row, "span", item.label,
          "font-size:12px;color:#1f2937;line-height:1.35;flex:1;");
        addText(row, "strong", `${Math.round(Number(item.probability || 0) * 100)}%`,
          "font-size:12px;color:#2563eb;white-space:nowrap;");

        resultEl.appendChild(row);
      });
    }

    addText(
      resultEl,
      "div",
      `${totalCandidates} opções do CRM • ${sentCandidates} analisadas • ${Number(response?.latencyMs || 0)} ms`,
      "font-size:10px;color:#94a3b8;margin-top:8px;"
    );
  }

  function renderMessage(resultEl, message, isError = false) {
    clearElement(resultEl);
    addText(
      resultEl,
      "div",
      message,
      `font-size:12px;line-height:1.4;color:${isError ? "#b91c1c" : "#475569"};`
    );
  }

  function createUi(input) {
    if (document.getElementById(UI_ID)) return;

    const wrapper = document.createElement("div");
    wrapper.id = UI_ID;
    wrapper.style.cssText = "margin-top:6px;width:100%;box-sizing:border-box;";

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "✨ Sugerir documentação";
    button.style.cssText = [
      "border:1px solid #93c5fd",
      "background:#eff6ff",
      "color:#1d4ed8",
      "border-radius:6px",
      "padding:7px 10px",
      "font-size:12px",
      "font-weight:700",
      "cursor:pointer"
    ].join(";");

    const result = document.createElement("div");
    result.style.cssText = [
      "display:none",
      "margin-top:6px",
      "padding:9px 10px",
      "border:1px solid #dbeafe",
      "border-radius:6px",
      "background:#fff",
      "max-width:520px"
    ].join(";");

    button.addEventListener("click", async () => {
      const context = getCurrentContext();
      if (!context) {
        result.style.display = "block";
        renderMessage(result, "Preencha o problema/dúvida ou cole o resumo antes de sugerir.", true);
        return;
      }

      button.disabled = true;
      button.textContent = "Carregando documentações...";
      result.style.display = "block";
      renderMessage(result, "Consultando as opções válidas deste Produto no CRM...");

      try {
        const allCandidates = await loadCandidatesSilently();
        const candidates = prefilterCandidates(allCandidates, context);

        button.textContent = "Analisando...";
        renderMessage(result, `Analisando ${candidates.length} de ${allCandidates.length} documentações...`);

        const response = await sendMessage({
          action: "classificarDocumentacao",
          context,
          candidates
        });

        if (!response?.success) {
          throw new Error(response?.erro || "Não foi possível sugerir a documentação.");
        }

        renderResult(result, response.classification, allCandidates.length, candidates.length);
      } catch (error) {
        renderMessage(result, error?.message || "Falha ao sugerir documentação.", true);
      } finally {
        button.disabled = false;
        button.textContent = "✨ Sugerir documentação";
      }
    });

    wrapper.appendChild(button);
    wrapper.appendChild(result);

    const host = input.closest(".ui-autocomplete") || input.parentElement;
    host.insertAdjacentElement("afterend", wrapper);
  }

  async function init() {
    const startedAt = Date.now();

    while (Date.now() - startedAt < 10000) {
      const input = document.getElementById(DOCUMENTATION_INPUT_ID);
      if (input) {
        createUi(input);
        return;
      }
      await delay(200);
    }

    console.warn("AtendeAI: campo de Documentação não encontrado para sugestão.");
  }

  return {
    init,
    __test: {
      normalizeText,
      extractExplicitCodes,
      prefilterCandidates
    }
  };
})();

window.DocumentationSuggestionModule = DocumentationSuggestionModule;
