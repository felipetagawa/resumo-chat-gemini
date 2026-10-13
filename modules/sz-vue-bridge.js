// Minimal and secure read-only bridge to extract attendance protocol from Vue in the MAIN world.
// Sets sanitized DOM attributes (data-sz-attendance-session, data-sz-protocol, data-sz-attendance) on .sz_contact cards
// so isolated content scripts can safely read them without touching native SZ attributes.
// Never uses contact._id, name or phone as attendance identity.
// Rejects duplicate protocols across cards fail-closed.
(() => {
  if (globalThis.__atendeai_sz_bridge_initialized__) return;
  globalThis.__atendeai_sz_bridge_initialized__ = true;

  const BRIDGE_ATTR = "data-atendeai-sz-bridge";
  const SESSION_ATTR = "data-sz-attendance-session";
  const PROTOCOL_ATTR = "data-sz-protocol";
  const ATTENDANCE_ATTR = "data-sz-attendance";

  const BRAZILIAN_DDD = "(?:1[1-9]|2[12478]|3[1-578]|4[1-9]|5[13-5]|6[1-9]|7[13-579]|8[1-9]|9[1-9])";
  const BR_PHONE_REGEXES = [
    new RegExp(`^55${BRAZILIAN_DDD}9\\d{8}$`),     // 13 digits: 55 + DDD + 9 mobile
    new RegExp(`^55${BRAZILIAN_DDD}[2-5]\\d{7}$`),  // 12 digits: 55 + DDD + landline
    new RegExp(`^${BRAZILIAN_DDD}9\\d{8}$`),       // 11 digits: DDD + 9 mobile
    new RegExp(`^${BRAZILIAN_DDD}[2-5]\\d{7}$`)    // 10 digits: DDD + landline
  ];

  function isPhoneLike(value) {
    const compact = String(value || "").trim();
    if (!compact) return false;
    // Explicit phone formatting (e.g. +55..., (11) 99999-8888, 99999-9999)
    if (/^\+?\d{1,4}[-.\s(]/.test(compact) || /\(\d{2}\)/.test(compact) || /\b\d{4,5}-\d{4}\b/.test(compact)) {
      return true;
    }
    const digits = compact.replace(/\D/g, "");
    // Year-based timestamp protocols (e.g. 2024..., 2025..., 2026...) or 14+ digit IDs are valid protocols, NOT phones
    if (/^20[2-9]\d{6,}$/.test(digits) || digits.length >= 14) {
      return false;
    }
    return BR_PHONE_REGEXES.some(r => r.test(digits));
  }

  function hashProtocol(str) {
    let h = 2166136261;
    const s = String(str || "");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return `att_${(h >>> 0).toString(16)}`;
  }

  function findContactsRoot() {
    return document.querySelector('.content.active #contact-fields.contacts-field.contact-scroll') ||
      document.querySelector('.content.active #contact-fields') ||
      document.querySelector('#contact-fields.contacts-field.contact-scroll') ||
      document.querySelector('#contact-fields') ||
      document.querySelector('.contacts-field.contact-scroll') ||
      document.querySelector('.chats-list, .contacts-list, .contact-list, .scroll-list');
  }

  function getCards() {
    const root = findContactsRoot();
    if (root) {
      const cardsInRoot = Array.from(root.querySelectorAll(".sz_contact")).filter(el => el?.isConnected !== false);
      if (cardsInRoot.length > 0) return cardsInRoot;
    }
    return Array.from(document.querySelectorAll(".sz_contact")).filter(el => el?.isConnected !== false);
  }

  function extractContact(card) {
    if (!card) return null;
    let curr = card;
    let fallbackContact = null;
    for (let depth = 0; depth < 4 && curr && curr !== document.body; depth++) {
      const vm = curr.__vue__;
      if (vm) {
        const props = vm.$props || vm;
        const contact = props.contact || vm.contact;
        if (contact && typeof contact === "object") {
          // If this contact is already an attendance contact with protocol, return it immediately
          if (contact.isAttendance === true && (typeof contact.protocol === "string" || typeof contact.protocol === "number")) {
            return contact;
          }
          if (!fallbackContact) fallbackContact = contact;
        }
      }
      curr = curr.parentElement;
    }
    return fallbackContact;
  }

  function isValidAttendanceContact(contact) {
    if (!contact || typeof contact !== "object") return false;
    if (contact.isAttendance !== true) return false;
    const rawProtocol = contact.protocol;
    if (typeof rawProtocol !== "string" && typeof rawProtocol !== "number") return false;
    const protocol = String(rawProtocol).trim();
    if (!protocol || isPhoneLike(protocol)) return false;

    // Contact IDs and phone numbers cannot prove attendance identity
    const contactId = String(contact._id || contact.contact_id || "").trim();
    if (contactId && protocol === contactId) return false;

    const rawPhone = contact.phone || contact.cellphone || contact.number || contact.telefone;
    if (rawPhone) {
      const phoneDigits = String(rawPhone).replace(/\D/g, "");
      const protDigits = protocol.replace(/\D/g, "");
      if (phoneDigits && protDigits && phoneDigits === protDigits) return false;
    }

    return true;
  }

  const diag = {
    totalCards: 0,
    withVue: 0,
    withContact: 0,
    withProtocol: 0,
    accepted: 0,
    syncCount: 0,
    lastSyncTimestamp: 0,
    rejections: {
      noVue: 0,
      noContact: 0,
      inactive: 0,
      missingProtocol: 0,
      phoneLike: 0,
      matchesContactId: 0,
      matchesPhone: 0,
      duplicateProtocol: 0
    }
  };

  try {
    globalThis.__atendeai_sz_bridge_diag__ = diag;
  } catch (_) {}

  function syncCards() {
    const cards = getCards();
    diag.syncCount++;
    diag.lastSyncTimestamp = Date.now();
    diag.totalCards = cards.length;
    diag.withVue = 0;
    diag.withContact = 0;
    diag.withProtocol = 0;
    diag.accepted = 0;
    Object.keys(diag.rejections).forEach(k => { diag.rejections[k] = 0; });

    if (!cards.length) return;

    // First pass: extract protocol candidates and check uniqueness
    const candidates = new Map();
    const counts = new Map();

    for (const card of cards) {
      let hasVm = false;
      let curr = card;
      for (let depth = 0; depth < 4 && curr && curr !== document.body; depth++) {
        if (curr.__vue__) { hasVm = true; break; }
        curr = curr.parentElement;
      }
      if (hasVm) diag.withVue++;

      const contact = extractContact(card);
      if (contact && typeof contact === "object") {
        diag.withContact++;
      } else {
        if (!hasVm) diag.rejections.noVue++;
        else diag.rejections.noContact++;
        continue;
      }

      if (contact.isAttendance !== true) {
        diag.rejections.inactive++;
        continue;
      }

      const rawProtocol = contact.protocol;
      if (typeof rawProtocol !== "string" && typeof rawProtocol !== "number") {
        diag.rejections.missingProtocol++;
        continue;
      }

      const protocol = String(rawProtocol).trim();
      if (!protocol) {
        diag.rejections.missingProtocol++;
        continue;
      }
      diag.withProtocol++;

      if (isPhoneLike(protocol)) {
        diag.rejections.phoneLike++;
        continue;
      }

      const contactId = String(contact._id || contact.contact_id || "").trim();
      if (contactId && protocol === contactId) {
        diag.rejections.matchesContactId++;
        continue;
      }

      const rawPhone = contact.phone || contact.cellphone || contact.number || contact.telefone;
      if (rawPhone) {
        const phoneDigits = String(rawPhone).replace(/\D/g, "");
        const protDigits = protocol.replace(/\D/g, "");
        if (phoneDigits && protDigits && phoneDigits === protDigits) {
          diag.rejections.matchesPhone++;
          continue;
        }
      }

      candidates.set(card, protocol);
      counts.set(protocol, (counts.get(protocol) || 0) + 1);
    }

    let modified = false;

    // Second pass: apply only unique, verified protocols; remove stale/invalid ones
    for (const card of cards) {
      const protocol = candidates.get(card);
      const isUnique = protocol && counts.get(protocol) === 1;

      if (isUnique) {
        diag.accepted++;
        const sessionToken = hashProtocol(protocol);
        const currentSession = card.getAttribute(SESSION_ATTR);
        const currentAttendance = card.getAttribute(ATTENDANCE_ATTR);
        const hasProtocol = card.getAttribute(PROTOCOL_ATTR) != null;
        if (currentSession !== sessionToken || currentAttendance !== "true" || hasProtocol) {
          card.setAttribute(SESSION_ATTR, sessionToken);
          if (hasProtocol) {
            if (typeof card.removeAttribute === "function") card.removeAttribute(PROTOCOL_ATTR);
            else if (card.attrs) delete card.attrs[PROTOCOL_ATTR];
          }
          card.setAttribute(ATTENDANCE_ATTR, "true");
          modified = true;
        }
      } else {
        if (protocol && counts.get(protocol) > 1) {
          diag.rejections.duplicateProtocol++;
        }
        // Clean up if attendance ended, protocol missing, or duplicate detected
        if (card.getAttribute(SESSION_ATTR) != null || card.getAttribute(PROTOCOL_ATTR) != null || card.getAttribute(ATTENDANCE_ATTR) != null) {
          if (typeof card.removeAttribute === "function") {
            card.removeAttribute(SESSION_ATTR);
            card.removeAttribute(PROTOCOL_ATTR);
            card.removeAttribute(ATTENDANCE_ATTR);
          } else if (card.attrs) {
            delete card.attrs[SESSION_ATTR];
            delete card.attrs[PROTOCOL_ATTR];
            delete card.attrs[ATTENDANCE_ATTR];
          }
          modified = true;
        }
      }
    }

    if (modified && typeof document.dispatchEvent === "function") {
      const evt = typeof CustomEvent === "function"
        ? new CustomEvent("atendeai:sz-bridge-synced", { detail: { count: counts.size } })
        : { type: "atendeai:sz-bridge-synced" };
      document.dispatchEvent(evt);
    }
  }

  function init() {
    document.documentElement?.setAttribute(BRIDGE_ATTR, "ready");
    syncCards();

    let debounceTimer = null;
    const scheduleSync = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(syncCards, 60);
    };

    const observer = new MutationObserver((records) => {
      const hasRelevantMutation = records.some((r) => {
        if (r.target?.nodeType === 1) {
          if (r.target.classList?.contains("sz_contact") || r.target.closest?.(".sz_contact")) return true;
          if (r.target.classList?.contains("chats-list") || r.target.classList?.contains("contacts-list") ||
              r.target.classList?.contains("contact-list") || r.target.classList?.contains("scroll-list") ||
              r.target.classList?.contains("contacts-field") || r.target.id === "contact-fields") return true;
        }
        if (r.type === "childList") {
          for (const n of r.addedNodes) {
            if (n.nodeType === 1 && (n.classList?.contains("sz_contact") || n.querySelector?.(".sz_contact") || n.closest?.(".sz_contact") || n.id === "contact-fields" || n.classList?.contains("contacts-field"))) return true;
          }
          for (const n of r.removedNodes) {
            if (n.nodeType === 1 && (n.classList?.contains("sz_contact") || n.querySelector?.(".sz_contact"))) return true;
          }
        }
        return false;
      });
      if (hasRelevantMutation) scheduleSync();
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });

    document.addEventListener("atendeai:request-sz-sync", syncCards);
    window.addEventListener("focus", syncCards);

    // Heartbeat check for asynchronous Vue WebSocket/HTTP updates
    const heartbeat = typeof setInterval === "function" ? setInterval(syncCards, 1500) : null;
    if (heartbeat && typeof window.addEventListener === "function") {
      window.addEventListener("pagehide", () => clearInterval(heartbeat), { once: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
