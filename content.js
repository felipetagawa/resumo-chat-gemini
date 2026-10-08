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
    document.getElementById("atendeai-config-modal-overlay")?.remove();
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
  return sector === "suporte" || sector === "preatendimento" || sector === "lider";
}

async function isUserConfigured() {
  const { name, sector } = await getUserConfig();
  return !!name && isValidSector(sector);
}

function inicializarModulos() {
  if (modulosInicializados) return;

  ShortcutsModule.init();
  NotificationsModule.init();

  PreControlModule.init();
  ObservationsModule.init();
  RecoveryBufferModule.init();
  void globalThis.ThemeModule?.init?.();

  modulosInicializados = true;
}

const getIconHTML = (icon, text) => {
  if (typeof icon === "string" && (icon.endsWith(".png") || icon.endsWith(".jpg") || icon.endsWith(".svg"))) {
    const iconUrl = chrome.runtime.getURL(icon);
    return `<span class="icon"><img src="${iconUrl}" alt="${text} icon" style="width: 16px; height: 16px; vertical-align: middle;"></span>`;
  }
  return `<span class="icon">${icon}</span>`;
};

function createOnboardingModal() {
  if (extensionContextInvalid) return;
  if (document.getElementById("atendeai-onboarding-overlay")) return;

  const LEADER_PASSWORD = "SoftengerenciamentoJB-BR";

  const overlay = document.createElement("div");
  overlay.id = "atendeai-onboarding-overlay";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 1000000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(15, 23, 42, 0.65);
    backdrop-filter: blur(8px);
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  `;

  const modal = document.createElement("div");
  modal.style.cssText = `
    width: 480px;
    max-width: 90vw;
    background: var(--ai-surface);
    color: var(--ai-text);
    border-radius: 24px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    overflow: hidden;
    animation: slideUp 0.3s ease-out;
  `;

  const header = document.createElement("div");
  header.style.cssText = `
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    padding: 24px;
    text-align: center;
    color: white;
  `;
  header.innerHTML = `
    <div style="font-size: 24px; font-weight: 800; margin-bottom: 8px;">Bem-vindo ao AtendeAI!</div>
    <div style="font-size: 14px; opacity: 0.9;">Configure seu perfil para começarmos.</div>
  `;

  const body = document.createElement("div");
  body.style.cssText = `padding: 32px 24px;`;

  body.innerHTML = `
    <div style="margin-bottom: 20px;">
      <label for="onboarding-name-input" style="display: block; font-size: 13px; font-weight: 700; color: var(--ai-text-secondary); margin-bottom: 8px;">Nome</label>
      <input type="text" id="onboarding-name-input" placeholder="Digite seu nome" style="
        width: 100%;
        padding: 12px;
        border: 2px solid var(--ai-border-strong);
        border-radius: 12px;
        font-size: 15px;
        outline: none;
        transition: border-color 0.2s;
      " />
    </div>

    <div style="margin-bottom: 14px;">
      <label style="display: block; font-size: 13px; font-weight: 700; color: var(--ai-text-secondary); margin-bottom: 12px;">Seu Setor</label>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <label style="cursor: pointer;">
          <input type="radio" name="onboarding-sector" value="suporte" checked style="display: none;" />
          <div class="sector-card" style="
            border: 2px solid var(--ai-border-strong); border-radius: 12px; padding: 12px;
            text-align: center; font-size: 14px; font-weight: 700;
            color: var(--ai-text-secondary); transition: all 0.2s;
          ">Suporte</div>
        </label>

        <label style="cursor: pointer;">
          <input type="radio" name="onboarding-sector" value="preatendimento" style="display: none;" />
          <div class="sector-card" style="
            border: 2px solid var(--ai-border-strong); border-radius: 12px; padding: 12px;
            text-align: center; font-size: 14px; font-weight: 700;
            color: var(--ai-text-secondary); transition: all 0.2s;
          ">Pré-atendimento</div>
        </label>

        <label style="cursor: pointer; grid-column: 1 / span 2;">
          <input type="radio" name="onboarding-sector" value="lider" style="display: none;" />
          <div class="sector-card" style="
            border: 2px solid var(--ai-border-strong); border-radius: 12px; padding: 12px;
            text-align: center; font-size: 14px; font-weight: 900;
            color: var(--ai-text-secondary); transition: all 0.2s;
          ">Líder</div>
        </label>
      </div>
    </div>

    <div id="leader-pass-wrap" style="display:none; margin-bottom: 20px;">
      <label style="display:block; font-size: 13px; font-weight: 800; color:var(--ai-text-secondary); margin-bottom:8px;">Senha do Líder</label>
      <input type="password" id="leader-pass-input" placeholder="Digite a senha" style="
        width: 100%;
        padding: 12px;
        border: 2px solid var(--ai-border-strong);
        border-radius: 12px;
        font-size: 15px;
        outline: none;
      "/>
      <div id="leader-pass-hint" style="margin-top:8px; font-size:12px; color:var(--ai-danger); font-weight:700;"></div>
    </div>

    <button id="onboarding-save-btn" style="
      width: 100%;
      background: #2563eb;
      color: white;
      border: none;
      padding: 14px;
      border-radius: 14px;
      font-size: 15px;
      font-weight: 800;
      cursor: pointer;
      transition: background 0.2s;
    ">Salvar e Continuar</button>
    <div id="onboarding-save-error" role="alert"></div>
  `;

  const styleRadios = () => {
    const cards = body.querySelectorAll(".sector-card");
    const inputs = body.querySelectorAll('input[name="onboarding-sector"]');
    inputs.forEach((input, index) => {
      const active = input.checked;
      cards[index].style.borderColor = active ? "var(--ai-primary)" : "var(--ai-border-strong)";
      cards[index].style.backgroundColor = active ? "var(--ai-primary-soft)" : "transparent";
      cards[index].style.color = active ? "var(--ai-primary)" : "var(--ai-text-secondary)";
    });

    const selected = body.querySelector('input[name="onboarding-sector"]:checked')?.value;
    const passWrap = body.querySelector("#leader-pass-wrap");
    if (passWrap) passWrap.style.display = (selected === "lider") ? "block" : "none";
  };

  body.addEventListener("change", (e) => {
    if (e.target.name === "onboarding-sector") styleRadios();
  });
  setTimeout(styleRadios, 0);

  modal.appendChild(header);
  modal.appendChild(body);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  globalThis.ThemeModule?.apply?.(overlay);

  const saveBtn = body.querySelector("#onboarding-save-btn");
  const nameInput = body.querySelector("#onboarding-name-input");
  const passInput = body.querySelector("#leader-pass-input");
  const passHint = body.querySelector("#leader-pass-hint");

  saveBtn.addEventListener("click", async () => {
    if (onboardingSaving || extensionContextInvalid) return;
    const name = (nameInput.value || "").trim();
    const sector = body.querySelector('input[name="onboarding-sector"]:checked')?.value;

    if (!name) {
      alert("Por favor, digite seu nome.");
      return;
    }

    if (!sector) {
      alert("Selecione um setor.");
      return;
    }

    if (sector === "lider") {
      const pass = (passInput?.value || "").trim();
      if (!pass) {
        if (passHint) passHint.textContent = "⚠️ Senha obrigatória para selecionar Líder.";
        passInput?.focus();
        return;
      }
      if (pass !== LEADER_PASSWORD) {
        if (passHint) passHint.textContent = "❌ Senha incorreta.";
        passInput?.focus();
        return;
      }
      if (passHint) passHint.textContent = "";
    }

    const feedback = body.querySelector("#onboarding-save-error");
    onboardingSaving = true;
    saveBtn.disabled = true;
    feedback.textContent = "";
    try {
      // A second tab/options may have configured the profile since this opened.
      const saved = await storageGet([NAME_KEY, SECTOR_KEY, "atendeai_visibility"]);
      if (!sanitizeName(saved[NAME_KEY]) || !isValidSector(sanitizeSector(saved[SECTOR_KEY]))) {
        const isPre = sector === "preatendimento";
        const data = { [NAME_KEY]: name, [SECTOR_KEY]: sector };
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

function guardFeature(actionFn, opts = {}) {
  const { allowLeader = false } = opts;

  return async (...args) => {
    try {
      if (extensionContextInvalid) return;
      const ok = await isUserConfigured();
      if (!ok) {
        openConfigRequiredModal();
        return;
      }
    } catch (error) {
      handleConfigError(error);
      return;
    }

    return actionFn(...args);
  };
}

function ensureConfigRequiredModal() {
  if (document.getElementById("atendeai-config-modal-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "atendeai-config-modal-overlay";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 1000000;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(15, 23, 42, 0.55);
    backdrop-filter: blur(6px);
  `;

  const modal = document.createElement("div");
  modal.id = "atendeai-config-modal";
  modal.style.cssText = `
    width: 520px;
    max-width: 92vw;
    border-radius: 16px;
    background: var(--ai-surface);
    box-shadow: 0 18px 50px rgba(0,0,0,0.28);
    overflow: hidden;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  `;

  modal.innerHTML = `
    <div style="
      padding: 16px 18px;
      background: var(--ai-primary-soft);
      color: var(--ai-primary);
    ">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <div>
          <div style="font-size:16px; font-weight:900;">Configuração necessária</div>
          <div style="margin-top:6px; font-size:12.8px; opacity:.95; font-weight:600;">
            Para usar os recursos, configure seu nome/login e setor no Portal AtendeAI.
          </div>
        </div>

        <button id="atendeai-config-modal-close" type="button" aria-label="Fechar" style="
          appearance:none;
          border:none;
          background: var(--ai-surface-hover);
          color:var(--ai-text-secondary);
          width:34px;
          height:34px;
          border-radius:10px;
          cursor:pointer;
          font-weight:900;
          display:inline-flex;
          align-items:center;
          justify-content:center;
        ">✕</button>
      </div>
    </div>

    <div style="padding: 16px 18px; color:var(--ai-text);">
      <div style="
        padding: 12px 12px;
        border-radius: 12px;
        background: var(--ai-surface-muted);
        border: 1px solid var(--ai-border);
        font-size: 13px;
        font-weight: 700;
        color: var(--ai-text-secondary);
        line-height: 1.45;
      ">
        • Nome/Login: usado para personalizar mensagens</b>)<br/>
        • Setor: define quais funcionalidades aparecem e quais atalhos são fixos.
      </div>

      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px; flex-wrap:wrap;">
        <button id="atendeai-config-modal-cancel" type="button" style="
          background:var(--ai-surface-muted);
          color:var(--ai-text);
          font-weight:900;
          border:none;
          border-radius:12px;
          padding:10px 12px;
          cursor:pointer;
        ">Agora não</button>

        <button id="atendeai-config-modal-open-portal" type="button" style="
          background:var(--ai-primary);
          color:var(--ai-on-primary);
          font-weight:900;
          border:none;
          border-radius:12px;
          padding:10px 12px;
          cursor:pointer;
        ">Abrir Portal AtendeAI</button>
      </div>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  globalThis.ThemeModule?.apply?.(overlay);

  const close = () => { overlay.style.display = "none"; };

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  document.getElementById("atendeai-config-modal-close")?.addEventListener("click", close);
  document.getElementById("atendeai-config-modal-cancel")?.addEventListener("click", close);

  document.getElementById("atendeai-config-modal-open-portal")?.addEventListener("click", async () => {
    try {
      chrome.runtime.sendMessage({ action: "openOptions" });
    } catch (e) {
      const url = chrome.runtime.getURL("options.html");
      window.open(url, "_blank", "noopener,noreferrer");
    }
    close();
  });
}

function openConfigRequiredModal() {
  ensureConfigRequiredModal();
  const overlay = document.getElementById("atendeai-config-modal-overlay");
  if (!overlay) return;
  overlay.style.display = "flex";
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
  handle.textContent = "⠿";
  handle.setAttribute("aria-label", "Arrastar dock");
  handle.title = "Arrastar dock";
  const sizeButton = document.createElement("button");
  sizeButton.type = "button";
  sizeButton.className = "gemini-dock-size";
  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "gemini-dock-toggle";
  toolbar.appendChild(handle);
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
    const nativeList = document.querySelector(".chats-list, .contacts-list, .contact-list");
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
    toggleButton.textContent = effectiveMinimized ? "▣" : "−";
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
      flexDirection: "column",
      gap: "0"
    }
  });

  const createButton = (id, text, icon, onClick) => {
    const btn = document.createElement("button");
    btn.id = id;
    btn.className = "gemini-floating-btn";

    btn.innerHTML = `${getIconHTML(icon, text)} ${text}`;
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
    "🔎",
    guardFeature(async () => {
      const btn = document.getElementById("btnClassificarProduto");
      const originalHtml = btn?.innerHTML || "";

      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="icon">⏳</span> Identificando...';
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
          btn.innerHTML = originalHtml || `${getIconHTML("🔎", "Identificar produto")} Identificar produto`;
        }
      }
    })
  );

  const botaoDocs = createButton(
    "btnConsultarDocs",
    "Consultar Docs",
    "docs.png",
    guardFeature(() => DocsModule.exibirPainelConsultaDocs())
  );

  const botaoResumo = createButton("btnResumoGemini", "Gerar Relatório", "relatorio.png",
    guardFeature(async () => {
      const btn = document.getElementById("btnResumoGemini");
      const texto = ChatCaptureModule.capturarTextoChat();
      const clientName = ChatCaptureModule.capturarNomeCliente(); // Captura nome para histórico

      if (!texto) {
        await RecoveryBufferModule.openReportFallback();
        return;
      }

      btn.disabled = true;
      btn.innerHTML = `<span class="icon">⏳</span> Gerando...`;

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
        btn.innerHTML = `${getIconHTML("relatorio.png", "Gerar Relatório")} Gerar Relatório`;
      }
    })
  );

  const botaoConversasPreservadas = document.createElement("button");
  botaoConversasPreservadas.id = "btnConversasPreservadas";
  botaoConversasPreservadas.type = "button";
  botaoConversasPreservadas.className = "gemini-preserved-link";
  botaoConversasPreservadas.textContent = "Conversas preservadas";
  botaoConversasPreservadas.addEventListener("click", guardFeature(() => {
    return RecoveryBufferModule.openPreservedBuffers();
  }));

  const botaoSmartReply = createButton('btnSmartReply', 'Sugerir resposta', '',
    guardFeature(() => SmartReplyModule.open(smartReplyControl.consumeMode())));
  botaoSmartReply.type = 'button';
  botaoSmartReply.className += ' atendeai-focus-primary';
  botaoSmartReply.innerHTML = '<svg class="atendeai-focus-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 3h14v10H8l-5 4V3Z"/><path d="M6 7h8M6 10h5"/></svg> Sugerir resposta';
  const smartReplyControl = SmartReplyModule.mountContextControl(botaoSmartReply);
  botaoDocs.id = 'btnConsultarDocsLoop';
  botaoDocs.className = 'gemini-preserved-link';
  botaoDocs.textContent = 'Consultar Docs';

  const botaoMessages = createButton(
    "btnMessages",
    "Mensagens Padrão",
    "mensagem-padrao.png",
    guardFeature(() => MessagesModule.toggleMensagens())
  );

  const botaoAgenda = createButton(
    "btnAgenda",
    "Agenda & Gestão",
    "agenda.png",
    guardFeature(() => AgendaModule.exibirAgenda())
  );

  // Botão de Configurações padrão para todos os setores (substitui Chamado Manual)
  const botaoObservacoes = createButton(
    "btnObservacoes",
    "Observações",
    "📝",
    guardFeature(() => ObservationsModule.openDrawer())
  );
  botaoObservacoes.insertAdjacentHTML(
    "beforeend",
    '<span class="atendeai-observations-dot" hidden aria-hidden="true"></span><span class="atendeai-observations-ia" hidden>IA</span>'
  );

  const botaoConfiguracoes = createButton(
    "btnConfiguracoes",
    "Configurações",
    "config.png",
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
    container.appendChild(botaoClassificarProduto);
    container.appendChild(productClassifierResult);
  }

  const showSmartReply = visibility?.btnSmartReply ?? visibility?.btnAssistenteIA ?? true;
  if (showSmartReply || isVisible('btnConsultarDocsLoop')) {
    const replyGroup = document.createElement('div');
    replyGroup.className = 'gemini-report-group';
    if (showSmartReply) replyGroup.appendChild(smartReplyControl.element);
    if (isVisible('btnConsultarDocsLoop')) replyGroup.appendChild(botaoDocs);
    container.appendChild(replyGroup);
  }
  if (isVisible("btnResumoGemini")) {
    const reportGroup = document.createElement("div");
    reportGroup.className = "gemini-report-group";
    reportGroup.appendChild(botaoResumo);
    reportGroup.appendChild(botaoConversasPreservadas);
    container.appendChild(reportGroup);
  }
  if (isVisible("btnMessages")) container.appendChild(botaoMessages);
  if (isVisible("btnAgenda")) container.appendChild(botaoAgenda);
  container.appendChild(botaoObservacoes);
  container.appendChild(botaoConfiguracoes); // Sempre mostra Configurações

  document.body.appendChild(container);
  globalThis.ThemeModule?.apply?.(container);
  void globalThis.ThemeModule?.init?.()?.then?.(() => globalThis.ThemeModule.apply(container));
  void SupportFocusModule.mount(container);
  void initializeExtensionDock(container);
}

MessagingHelper.addListener((request, sender, sendResponse) => {
  const botaoResumo = document.getElementById("btnResumoGemini");
  const botaoDica = document.getElementById("btnDica");
  const botaoMessages = document.getElementById("btnMessages");

  if (botaoResumo) {
    botaoResumo.disabled = false;
    botaoResumo.innerHTML = `${getIconHTML("relatorio.png", "Gerar Relatório")} Gerar Relatório`;
  }

  if (botaoMessages) {
    botaoMessages.disabled = false;
    botaoMessages.innerHTML = `${getIconHTML("mensagem-padrao.png", "Mensagens Padrão")} Mensagens Padrão`;
  }

  if (botaoDica) {
    botaoDica.disabled = false;
    botaoDica.innerHTML = `${getIconHTML("dicas-inteligentes.png", "Dicas Inteligentes")} Dicas Inteligentes`;
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
