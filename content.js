const TARGET_URL = "https://softeninformatica.sz.chat/user/agent";
let modulosInicializados = false;
const MAX_PROMPT_COMPLEMENT_CHARS = 2000;

const NAME_KEY = "atendeai_user_name";
const SECTOR_KEY = "atendeai_user_sector";
let extensionContextInvalid = false;
let checkingConfig = false;
let onboardingSaving = false;

function handleConfigError(error) {
  if (extensionContextInvalid) return;
  const invalid = !chrome.runtime?.id || /extension context invalidated/i.test(error?.message || "");
  if (invalid) {
    extensionContextInvalid = true;
    clearInterval(initInterval);
    document.getElementById("atendeai-onboarding-overlay")?.remove();
    const dock = document.getElementById("containerBotoesGemini");
    dock?.dockCleanup?.();
    dock?.remove();
  }
  let notice = document.getElementById("atendeai-context-notice");
  if (!notice) {
    notice = document.createElement("div");
    notice.id = "atendeai-context-notice";
    notice.setAttribute("role", "status");
    document.body.appendChild(notice);
    globalThis.ThemeModule?.apply?.(notice);
  }
  notice.textContent = invalid
    ? "O AtendeAI foi atualizado. Recarregue esta página para continuar utilizando os recursos."
    : "Não foi possível ler a configuração do AtendeAI. Tente novamente ou recarregue a página.";
}

// Callback errors must reject too: an API failure is not an empty profile.
function configStorage(method, value) {
  return new Promise((resolve, reject) => {
    try {
      if (extensionContextInvalid || !chrome.runtime?.id) throw new Error("Extension context invalidated.");
      chrome.storage.local[method](value, data => {
        try {
          const error = chrome.runtime.lastError;
          if (error) throw new Error(error.message);
          if (extensionContextInvalid || !chrome.runtime?.id) throw new Error("Extension context invalidated.");
          resolve(data);
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}
const storageGet = keys => configStorage("get", keys);
const storageSet = data => configStorage("set", data);

function getUserSectorSafe() {
  try {
    return String(localStorage.getItem(SECTOR_KEY) || "").trim().toLowerCase();
  } catch (e) {
    return "";
  }
}

function getUserNameSafe() {
  try {
    return String(localStorage.getItem(NAME_KEY) || "").trim();
  } catch (e) {
    return "";
  }
}

function isValidSector(sector) {
  return sector === "suporte" || sector === "preatendimento";
}

// Only pré-atendimento needs a name (its fixed greeting says "Eu sou o atendente {{NOME}}").
function isConfiguredProfile(name, sector) {
  return isValidSector(sector) && (sector !== "preatendimento" || !!name);
}

async function isUserConfigured() {
  const { name, sector } = await getUserConfig();
  return isConfiguredProfile(name, sector);
}

function inicializarModulos() {
  if (modulosInicializados) return;

  ShortcutsModule.init();
  NotificationsModule.init();

  PreControlModule.init();
  ObservationsModule.init();
  RecoveryBufferModule.init();
  // Track attendance ownership from page load, so a same-name switch is caught before the first suggestion.
  ChatCaptureModule.observarAtendimentoResposta();
  StyleSamplesModule.start();
  SmartReplyModule.retireLegacyProfiles();
  void globalThis.ThemeModule?.init?.();
  // Retornos automáticos: the alert checks the Suporte sector and the on/off switch itself.
  void globalThis.RetornosAlert?.start?.(document, { placement: "sz" });

  modulosInicializados = true;
}

// One drawn icon set for the dock: 24px grid, 1.75 stroke, round joins.
const DOCK_ICONS = {
  report: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  docs: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
  reply: '<path d="M11 3.5l1.9 4.6 4.6 1.9-4.6 1.9L11 16.5l-1.9-4.6L4.5 10l4.6-1.9z"/><path d="M18.5 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>',
  messages: '<path d="M20 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/><path d="M8 8h8M8 12h5"/>',
  agenda: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  notes: '<path d="M12 20h8"/><path d="M16.5 3.6a2.1 2.1 0 0 1 3 3L7.5 18.6 3.5 19.5l.9-4z"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  product: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>'
};

const getIconHTML = (icon) => {
  if (icon === "loading") return '<span class="icon gemini-spinner" aria-hidden="true"></span>';
  const paths = DOCK_ICONS[icon];
  if (!paths) return "";
  return `<span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${paths}</svg></span>`;
};

function createOnboardingModal() {
  if (extensionContextInvalid) return;
  if (document.getElementById("atendeai-onboarding-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "atendeai-onboarding-overlay";

  const modal = document.createElement("div");
  modal.className = "atendeai-onb-card";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "atendeai-onb-title");

  // No self-closing tags besides inputs: the onboarding test parses this template.
  modal.innerHTML = `
    <div class="atendeai-onb-brand">AtendeAI</div>
    <h2 id="atendeai-onb-title" class="atendeai-onb-title">Como você atende?</h2>
    <p class="atendeai-onb-lead">O setor define quais ferramentas aparecem no dock. Dá para trocar depois em Configurações.</p>

    <fieldset class="atendeai-onb-options">
      <legend class="atendeai-onb-sr">Setor</legend>
      <label class="atendeai-onb-option">
        <input type="radio" name="onboarding-sector" value="suporte" checked />
        <span class="atendeai-onb-option-title">Suporte técnico</span>
        <span class="atendeai-onb-option-text">Gerar Relatório, Sugerir resposta, Docs e Agenda.</span>
      </label>
      <label class="atendeai-onb-option">
        <input type="radio" name="onboarding-sector" value="preatendimento" />
        <span class="atendeai-onb-option-title">Pré-atendimento</span>
        <span class="atendeai-onb-option-text">Identificar produto, mensagens de triagem e tempo na fila.</span>
      </label>
    </fieldset>

    <div id="onboarding-name-wrap" class="atendeai-onb-field" hidden>
      <label for="onboarding-name-input" class="atendeai-onb-label">Seu nome na saudação</label>
      <input type="text" id="onboarding-name-input" autocomplete="given-name" placeholder="Ex.: Ana" />
      <div class="atendeai-onb-hint">Entra em “Eu sou o atendente <b id="onboarding-name-echo">Ana</b> do pré-atendimento…”</div>
    </div>

    <button id="onboarding-save-btn" type="button" class="atendeai-onb-submit">Começar</button>
    <div id="onboarding-save-error" role="alert"></div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  globalThis.ThemeModule?.apply?.(overlay);

  const saveBtn = modal.querySelector("#onboarding-save-btn");
  const nameInput = modal.querySelector("#onboarding-name-input");
  const nameWrap = modal.querySelector("#onboarding-name-wrap");
  const feedback = modal.querySelector("#onboarding-save-error");
  const selectedSector = () => modal.querySelector('input[name="onboarding-sector"]:checked')?.value;

  const syncNameField = () => {
    const needsName = selectedSector() === "preatendimento";
    if (nameWrap) nameWrap.hidden = !needsName;
    if (feedback) feedback.textContent = "";
  };
  modal.addEventListener("change", (e) => {
    if (e.target?.name === "onboarding-sector") syncNameField();
  });
  const nameEcho = modal.querySelector("#onboarding-name-echo");
  nameInput?.addEventListener?.("input", () => {
    if (nameEcho) nameEcho.textContent = (nameInput.value || "").trim() || "Ana";
  });
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target?.tagName === "INPUT") saveBtn?.click();
  });
  setTimeout(() => modal.querySelector('input[name="onboarding-sector"]:checked')?.focus?.(), 0);

  saveBtn.addEventListener("click", async () => {
    if (onboardingSaving || extensionContextInvalid) return;
    const sector = selectedSector();
    const name = (nameInput.value || "").trim();

    if (!isValidSector(sector)) {
      feedback.textContent = "Escolha um setor para continuar.";
      return;
    }
    if (sector === "preatendimento" && !name) {
      feedback.textContent = "Informe seu nome: ele aparece na saudação do pré-atendimento.";
      nameInput?.focus?.();
      return;
    }

    onboardingSaving = true;
    saveBtn.disabled = true;
    feedback.textContent = "";
    try {
      // A second tab/options may have configured the profile since this opened.
      const saved = await storageGet([NAME_KEY, SECTOR_KEY, "atendeai_visibility"]);
      if (!isConfiguredProfile(sanitizeName(saved[NAME_KEY]), sanitizeSector(saved[SECTOR_KEY]))) {
        const isPre = sector === "preatendimento";
        const data = { [SECTOR_KEY]: sector };
        if (isPre) data[NAME_KEY] = name;
        if (!Object.prototype.hasOwnProperty.call(saved, "atendeai_visibility")) {
          data.atendeai_visibility = {
            btnAgenda: true, btnMessages: true, btnSmartReply: true,
            btnConsultarDocsLoop: true, btnResumoGemini: !isPre,
            btnChamadoManual: !isPre, btnProductClassifier: isPre
          };
        }
        // One confirmed write prevents partial profile/visibility success.
        await storageSet(data);
      }
      overlay.remove();
    } catch (error) {
      feedback.textContent = "Não foi possível salvar a configuração. Tente novamente.";
      if (!chrome.runtime?.id || /extension context invalidated/i.test(error?.message || "")) handleConfigError(error);
      return;
    } finally {
      onboardingSaving = false;
      saveBtn.disabled = false;
    }
    await checkAndInit();
  });
}

function sanitizeName(v) {
  return String(v || "").trim();
}
function sanitizeSector(v) {
  return String(v || "").trim().toLowerCase();
}

async function getUserConfig() {
  const data = await storageGet([NAME_KEY, SECTOR_KEY]);
  return { name: sanitizeName(data[NAME_KEY]), sector: sanitizeSector(data[SECTOR_KEY]) };
}

function guardFeature(actionFn) {
  return async (...args) => {
    try {
      if (extensionContextInvalid) return;
      const ok = await isUserConfigured();
      if (!ok) {
        // Missing profile: the same one-screen setup as the first access.
        createOnboardingModal();
        return;
      }
    } catch (error) {
      handleConfigError(error);
      return;
    }

    return actionFn(...args);
  };
}

async function initializeExtensionDock(container) {
  const key = "atendeai_dock_preferences";
  const scales = { compact: 0.85, normal: 1, large: 1.15 };
  const saved = await new Promise((resolve) => {
    try {
      chrome.storage.local.get([key], (data) => {
        resolve(chrome.runtime.lastError ? {} : data?.[key] || {});
      });
    } catch { resolve({}); }
  });
  if (document.getElementById("containerBotoesGemini") !== container) return;
  let size = Object.hasOwn(scales, saved.size) ? saved.size : "normal";
  let minimized = saved.minimized === true;
  let position = saved.position;
  let preferredPosition = saved.position;
  let viewportExpanded = false;
  let drag = null;

  const toolbar = document.createElement("div");
  toolbar.className = "gemini-dock-toolbar";
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "gemini-dock-handle";
  handle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>';
  handle.setAttribute("aria-label", "Arrastar dock");
  handle.title = "Arrastar dock";
  const sizeButton = document.createElement("button");
  sizeButton.type = "button";
  sizeButton.className = "gemini-dock-size";
  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "gemini-dock-toggle";
  const brand = document.createElement("span");
  brand.className = "gemini-dock-brand";
  brand.textContent = "AtendeAI";
  toolbar.appendChild(handle);
  toolbar.appendChild(brand);
  toolbar.appendChild(sizeButton);
  toolbar.appendChild(toggleButton);
  container.prepend(toolbar);

  function clampPosition(next) {
    const rect = container.getBoundingClientRect();
    const x = Number.isFinite(next?.x) ? next.x : rect.left;
    const y = Number.isFinite(next?.y) ? next.y : rect.top;
    position = {
      x: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))
    };
    // CSS zoom scales coordinates too; store and clamp viewport pixels.
    container.style.left = `${position.x / scales[size]}px`;
    container.style.top = `${position.y / scales[size]}px`;
    container.style.right = "auto";
    container.style.bottom = "auto";
  }

  function persist() {
    preferredPosition = position;
    chrome.storage.local.set({ [key]: { position, size, minimized } }, () => {
      if (chrome.runtime.lastError) console.error("Não foi possível salvar a posição do dock.");
    });
  }

  function applySize() {
    const nativeList = document.querySelector("#contact-fields, .contacts-field.contact-scroll, .chats-list, .contacts-list, .contact-list");
    const listRect = nativeList?.getBoundingClientRect();
    // The visual QA found the full dock covering the left queue on narrow windows.
    // Compact only while the right-hand corridor cannot fit it; keep saved preferences.
    const viewportCompact = !!listRect && listRect.left < window.innerWidth / 2
      && window.innerWidth - listRect.right < 188 * scales[size] + 16;
    const effectiveMinimized = viewportCompact ? !viewportExpanded : minimized;
    container.setAttribute("data-minimized", String(effectiveMinimized));
    container.setAttribute("data-compact-viewport", String(viewportCompact));
    sizeButton.textContent = `${Math.round(scales[size] * 100)}%`;
    sizeButton.setAttribute("aria-label", `Tamanho do dock: ${sizeButton.textContent}. Clique para alternar.`);
    sizeButton.title = "Alternar tamanho: 85%, 100%, 115%";
    sizeButton.hidden = effectiveMinimized;
    toggleButton.innerHTML = effectiveMinimized
      ? '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m7 14 5-5 5 5"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 12h12"/></svg>';
    toggleButton.setAttribute("aria-label", viewportCompact ? viewportExpanded ? "Recolher ações do dock" : "Expandir ações do dock" : minimized ? "Restaurar dock" : "Minimizar dock");
    toggleButton.setAttribute("aria-expanded", String(!effectiveMinimized));
    toggleButton.title = viewportCompact ? "Ações do dock sob demanda nesta janela" : minimized ? "Restaurar dock" : "Minimizar dock";
    container.style.zoom = String(scales[size]);
    container.style.maxWidth = `${Math.max(1, window.innerWidth - 16) / scales[size]}px`;
    container.style.maxHeight = `${Math.max(1, window.innerHeight - 16) / scales[size]}px`;
    container.style.overflow = container.scrollHeight > container.clientHeight
      || container.scrollWidth > container.clientWidth ? "auto" : "visible";
    if (viewportCompact && !viewportExpanded) {
      const rect = container.getBoundingClientRect();
      clampPosition({ x: window.innerWidth - rect.width - 8, y: preferredPosition?.y ?? position?.y });
    } else clampPosition(preferredPosition || position);
  }

  sizeButton.addEventListener("click", () => {
    const sizes = ["compact", "normal", "large"];
    size = sizes[(sizes.indexOf(size) + 1) % sizes.length];
    applySize();
    persist();
  });
  toggleButton.addEventListener("click", () => {
    if (container.getAttribute("data-compact-viewport") === "true") {
      viewportExpanded = !viewportExpanded;
      applySize();
      return;
    }
    minimized = !minimized;
    applySize();
    persist();
  });
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: position.x, startY: position.y };
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    clampPosition({ x: drag.startX + event.clientX - drag.x, y: drag.startY + event.clientY - drag.y });
  });
  const finishDrag = () => {
    if (!drag) return;
    drag = null;
    persist();
  };
  handle.addEventListener("pointerup", finishDrag);
  handle.addEventListener("pointercancel", finishDrag);
  handle.addEventListener("lostpointercapture", finishDrag);
  const onResize = () => { viewportExpanded = false; applySize(); };
  window.addEventListener("resize", onResize);
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => clampPosition(position)) : null;
  observer?.observe(container);
  container.dockCleanup = () => { window.removeEventListener("resize", onResize); observer?.disconnect(); };
  applySize();
}

function criarBotoesFlutuantes(visibility, userSector) {
  if (DOMHelpers.exists("containerBotoesGemini")) {
    document.getElementById("containerBotoesGemini")?.dockCleanup?.();
    DOMHelpers.removeElement("containerBotoesGemini");
  }



  const isVisible = (key, defaultVal = true) => {
    if (!visibility) return defaultVal;
    return visibility[key] === true;
  };

  const container = DOMHelpers.createElement("div", {
    id: "containerBotoesGemini",
    style: {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      zIndex: "999998",
      display: "flex",
      flexDirection: "column"
    }
  });

  const createButton = (id, text, icon, onClick) => {
    const btn = document.createElement("button");
    btn.id = id;
    btn.className = "gemini-floating-btn";

    btn.type = "button";
    btn.innerHTML = `${getIconHTML(icon, text)}<span class="label">${text}</span>`;
    btn.addEventListener("click", onClick);
    return btn;
  };

  const productClassifierResult = document.createElement("div");
  productClassifierResult.id = "productClassifierResult";
  productClassifierResult.className = "product-classifier-result";
  productClassifierResult.hidden = true;

  const clearProductClassifierResult = () => {
    while (productClassifierResult.firstChild) {
      productClassifierResult.removeChild(productClassifierResult.firstChild);
    }
  };

  const appendProductClassifierText = (className, text) => {
    const element = document.createElement("div");
    element.className = className;
    element.textContent = String(text || "");
    productClassifierResult.appendChild(element);
    return element;
  };

  const renderProductClassifierMessage = (title, message) => {
    clearProductClassifierResult();
    appendProductClassifierText("product-classifier-title", title);
    appendProductClassifierText("product-classifier-empty", message);
    productClassifierResult.hidden = false;
  };

  const renderProductClassification = (classification) => {
    const suggestions = Array.isArray(classification?.suggestions)
      ? classification.suggestions.filter(Boolean)
      : [];

    if (!suggestions.length) {
      renderProductClassifierMessage("Produto", "Não identificado");
      return;
    }

    const formatPercent = (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return "";
      return `${Math.round(n * 100)}%`;
    };

    clearProductClassifierResult();

    if (classification.mode === "single") {
      appendProductClassifierText("product-classifier-title", "Produto sugerido");
      appendProductClassifierText("product-classifier-primary", suggestions[0].product);
      productClassifierResult.hidden = false;
      return;
    }

    const title = classification.mode === "uncertain"
      ? "Produto pouco claro"
      : "Possíveis produtos";

    appendProductClassifierText("product-classifier-title", title);

    const list = document.createElement("div");
    list.className = "product-classifier-list";

    suggestions.slice(0, 3).forEach((item) => {
      const row = document.createElement("div");
      row.className = "product-classifier-option";

      const label = document.createElement("span");
      label.textContent = String(item.product || "");

      const probability = document.createElement("strong");
      probability.textContent = formatPercent(item.probability);

      row.appendChild(label);
      row.appendChild(probability);
      list.appendChild(row);
    });

    productClassifierResult.appendChild(list);
    productClassifierResult.hidden = false;
  };

  const botaoClassificarProduto = createButton(
    "btnClassificarProduto",
    "Identificar produto",
    "product",
    guardFeature(async () => {
      const btn = document.getElementById("btnClassificarProduto");
      const originalHtml = btn?.innerHTML || "";

      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `${getIconHTML("loading")}<span class="label">Identificando…</span>`;
      }

      const conversation = ChatCaptureModule.capturarTextoChat();
      if (!conversation) {
        renderProductClassifierMessage("Produto", "Conversa não encontrada");
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalHtml;
        }
        return;
      }

      try {
        const response = await MessagingHelper.send({
          action: "classificarProduto",
          conversation
        });

        if (!response?.success) {
          throw new Error(response?.erro || "Não foi possível identificar o produto.");
        }

        renderProductClassification(response.classification);
      } catch (error) {
        renderProductClassifierMessage(
          "Produto",
          error?.message || "Falha ao identificar"
        );
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalHtml || `${getIconHTML("product")}<span class="label">Identificar produto</span>`;
        }
      }
    })
  );

  const botaoDocs = createButton(
    "btnConsultarDocs",
    "Consultar Docs",
    "docs",
    guardFeature(() => DocsModule.exibirPainelConsultaDocs())
  );

  const botaoResumo = createButton("btnResumoGemini", "Gerar Relatório", "report",
    guardFeature(async () => {
      const btn = document.getElementById("btnResumoGemini");
      const texto = ChatCaptureModule.capturarTextoChat();
      const clientName = ChatCaptureModule.capturarNomeCliente(); // Captura nome para histórico

      if (!texto) {
        await RecoveryBufferModule.openReportFallback();
        return;
      }

      btn.disabled = true;
      btn.innerHTML = `${getIconHTML("loading")}<span class="label">Gerando…</span>`;

      try {
        const summaryObservation = ObservationsModule.getPromptComplementForCurrentChat();
        const validatedPromptComplement = summaryObservation;

        if (validatedPromptComplement.length > MAX_PROMPT_COMPLEMENT_CHARS) {
          alert(`O campo "Observações para o resumo" excede o limite de ${MAX_PROMPT_COMPLEMENT_CHARS} caracteres.`);
          return;
        }

        const payload = {
          action: "gerarResumo",
          texto
        };
        if (summaryObservation) payload.promptComplement = summaryObservation;

        const response = await MessagingHelper.send(payload);
        if (response && response.resumo) SummaryModule.exibirResumo(response.resumo, clientName); // Passa nome para salvar corretamente
        else if (response && response.erro) alert("Erro ao gerar resumo: " + response.erro);
      } catch (error) {
        alert("Erro de comunicação: " + error.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = `${getIconHTML("report")}<span class="label">Gerar Relatório</span>`;
      }
    })
  );
  botaoResumo.className += " gemini-hero";

  const botaoConversasPreservadas = document.createElement("button");
  botaoConversasPreservadas.id = "btnConversasPreservadas";
  botaoConversasPreservadas.type = "button";
  botaoConversasPreservadas.className = "gemini-preserved-link";
  botaoConversasPreservadas.textContent = "Conversas preservadas";
  botaoConversasPreservadas.addEventListener("click", guardFeature(() => {
    return RecoveryBufferModule.openPreservedBuffers();
  }));

  // Consultar Docs is the hero of its group; Sugerir resposta is the smaller link below it.
  const botaoSmartReply = createButton('btnSmartReply', 'Sugerir resposta', '',
    guardFeature(() => SmartReplyModule.open()));
  botaoSmartReply.className = 'gemini-preserved-link';
  botaoSmartReply.textContent = 'Sugerir resposta';
  botaoDocs.id = 'btnConsultarDocsLoop';
  botaoDocs.className += ' gemini-hero';

  const botaoMessages = createButton(
    "btnMessages",
    "Mensagens Padrão",
    "messages",
    guardFeature(() => MessagesModule.toggleMensagens())
  );

  const botaoAgenda = createButton(
    "btnAgenda",
    "Agenda & Gestão",
    "agenda",
    guardFeature(() => AgendaModule.exibirAgenda())
  );

  // Botão de Configurações padrão para todos os setores (substitui Chamado Manual)
  const botaoObservacoes = createButton(
    "btnObservacoes",
    "Observações",
    "notes",
    guardFeature(() => ObservationsModule.openDrawer())
  );
  botaoObservacoes.insertAdjacentHTML(
    "beforeend",
    '<span class="atendeai-observations-dot" hidden aria-hidden="true"></span><span class="atendeai-observations-ia" hidden>IA</span>'
  );

  const botaoConfiguracoes = createButton(
    "btnConfiguracoes",
    "Configurações",
    "settings",
    () => {
      try {
        chrome.runtime.sendMessage({ action: "openOptions" });
      } catch (e) {
        const url = chrome.runtime.getURL("options.html");
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
  );

  if (userSector === "preatendimento") {
    botaoClassificarProduto.className += " gemini-hero gemini-hero-solo";
    container.appendChild(botaoClassificarProduto);
    container.appendChild(productClassifierResult);
  }

  // Gerar Relatório is the main feature: first and the only gold action. Consultar Docs (with Sugerir resposta as its link) sits right below it.
  if (isVisible("btnResumoGemini")) {
    const reportGroup = document.createElement("div");
    reportGroup.className = "gemini-report-group gemini-group-accent";
    reportGroup.appendChild(botaoResumo);
    reportGroup.appendChild(botaoConversasPreservadas);
    container.appendChild(reportGroup);
  }
  const showSmartReply = visibility?.btnSmartReply ?? visibility?.btnAssistenteIA ?? true;
  if (showSmartReply || isVisible('btnConsultarDocsLoop')) {
    const replyGroup = document.createElement('div');
    replyGroup.className = 'gemini-report-group';
    if (isVisible('btnConsultarDocsLoop')) replyGroup.appendChild(botaoDocs);
    if (showSmartReply) replyGroup.appendChild(botaoSmartReply);
    container.appendChild(replyGroup);
  }
  const divider = document.createElement("div");
  divider.className = "gemini-dock-divider";
  divider.setAttribute("role", "presentation");
  container.appendChild(divider);
  if (isVisible("btnMessages")) container.appendChild(botaoMessages);
  if (isVisible("btnAgenda")) container.appendChild(botaoAgenda);
  container.appendChild(botaoObservacoes);
  container.appendChild(botaoConfiguracoes); // Sempre mostra Configurações

  document.body.appendChild(container);
  globalThis.ThemeModule?.apply?.(container);
  void globalThis.ThemeModule?.init?.()?.then?.(() => globalThis.ThemeModule.apply(container));
  void QueueContextModule.mount();
  void initializeExtensionDock(container);
}

MessagingHelper.addListener((request, sender, sendResponse) => {
  const botaoResumo = document.getElementById("btnResumoGemini");
  const botaoMessages = document.getElementById("btnMessages");

  if (botaoResumo) {
    botaoResumo.disabled = false;
    botaoResumo.innerHTML = `${getIconHTML("report")}<span class="label">Gerar Relatório</span>`;
  }

  if (botaoMessages) {
    botaoMessages.disabled = false;
    botaoMessages.innerHTML = `${getIconHTML("messages")}<span class="label">Mensagens Padrão</span>`;
  }

  if (request.action === "exibirResumo") {
    SummaryModule.exibirResumo(request.resumo);
  } else if (request.action === "exibirDica") {
    SummaryModule.exibirDica(request.dica);
  } else if (request.action === "exibirErro") {
    alert("Erro: " + request.erro);
  }

  return true;
});

console.log("✅ Main Loop: Checking...");
async function checkAndInit() {
  if (extensionContextInvalid) return;
  // An old callback may never complete after an update; do not let a busy
  // check/save prevent the next cycle from noticing the lost context.
  if (!chrome.runtime?.id) {
    handleConfigError(new Error("Extension context invalidated."));
    return;
  }
  if (checkingConfig || onboardingSaving) return;
  const currentUrl = window.location.href;
  const isTarget = currentUrl.startsWith(TARGET_URL);


  if (!isTarget) {
    if (modulosInicializados) {
      console.log("DEBUG: Leaving target area, cleaning up.");
      modulosInicializados = false;
      DOMHelpers.removeElement("containerBotoesGemini");
      DOMHelpers.removeElement("atendeai-onboarding-overlay");
    }
    return;
  }

  checkingConfig = true;
  try {
    const configured = await isUserConfigured();
    if (extensionContextInvalid || !window.location.href.startsWith(TARGET_URL)) return;
    document.getElementById("atendeai-context-notice")?.remove();
    inicializarModulos();
    NotificationsModule.verificarNotificacoesChat();
    if (!configured) {
      if (!document.getElementById("atendeai-onboarding-overlay")) {
        console.log("DEBUG: Not configured, showing onboarding modal.");
        createOnboardingModal();
      }
      return;
    }

    const modal = document.getElementById("atendeai-onboarding-overlay");
    if (modal) {
      console.log("DEBUG: Configured, removing modal.");
      modal.remove();
    }

    // Preserve the effective loop's behavior: create the dock only when absent.
    if (!document.getElementById("containerBotoesGemini")) {
      const items = await storageGet(["atendeai_visibility", SECTOR_KEY]);
      if (!extensionContextInvalid && window.location.href.startsWith(TARGET_URL)
          && !document.getElementById("containerBotoesGemini")) {
        const visibility = items.atendeai_visibility || {};
        const rawSector = items[SECTOR_KEY];
        const sector = String(rawSector || "").trim().toLowerCase();

        criarBotoesFlutuantes(visibility, sector);
      }
    }
  } catch (error) {
    handleConfigError(error);
  } finally {
    checkingConfig = false;
  }
}

const initInterval = setInterval(checkAndInit, 2000);

console.log("✅ AtendeAI Manager: Extensão carregada e modularizada!");
