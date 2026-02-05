const PreControlModule = (() => {
    const NAME_KEY = "atendeai_user_name";
    const SECTOR_KEY = "atendeai_user_sector";
    const BG_ACTION_CREATE = "preControl:create";
    const ACTIVE_KEY = "pre_control_active_timers";
    const ALIAS_KEY = "pre_control_alias_map";
    const SENT_KEY = "pre_control_sent_once";
    const NEG_KEY = "pre_control_negociation_map";
    const HARD_GRACE_MS = 15000;
    const PENDING_CONFIRM_MS = 2500;
    const PENDING_CONFIRM_SCANS = 2;
    const FLUSH_MS = 1200;
    const SCAN_INTERVAL_MS = 1100;
    const START_STABLE_SCANS = 2;
    const START_STABLE_WINDOW_MS = 4500;

    let started = false;
    let observer = null;
    let tickerInterval = null;
    let scanInterval = null;
    let scanScheduled = false;

    const active = new Map();
    const startCandidates = new Map();
    const pendingClose = new Map();

    let persistedCache = {};
    let aliasMap = {};
    let negMap = {};
    let flushTimeout = null;

    const storageGet = (keys) =>
        new Promise((resolve) => chrome.storage.local.get(keys, (d) => resolve(d || {})));

    const storageSet = (obj) =>
        new Promise((resolve) => chrome.storage.local.set(obj, () => resolve()));

    function scheduleFlush() {
        if (flushTimeout) return;
        flushTimeout = setTimeout(async () => {
            flushTimeout = null;
            await storageSet({
                [ACTIVE_KEY]: persistedCache,
                [ALIAS_KEY]: aliasMap,
                [NEG_KEY]: negMap,
            });
        }, FLUSH_MS);
    }

    function sanitize(v) { return String(v || "").trim(); }
    function pad2(n) { return String(n).padStart(2, "0"); }

    function toDateYYYYMMDD(d = new Date()) {
        const y = d.getFullYear();
        const m = pad2(d.getMonth() + 1);
        const day = pad2(d.getDate());
        return `${y}-${m}-${day}`;
    }

    function msToHHMMSS(ms) {
        const total = Math.max(0, Math.floor(ms / 1000));
        const h = pad2(Math.floor(total / 3600));
        const m = pad2(Math.floor((total % 3600) / 60));
        const s = pad2(total % 60);
        return `${h}:${m}:${s}`;
    }

    function getText(el) {
        return String(el?.textContent || "").replace(/\s+/g, " ").trim();
    }

    function hashStr(str) {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0).toString(16);
    }

    function normalizeNameKey(name) {
        return String(name || "")
            .toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^\p{L}\p{N}\s]/gu, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 60);
    }

    function getNegValue(chatKey) {
        return !!(negMap[chatKey] ?? false);
    }
    function setNegValue(chatKey, value) {
        negMap[chatKey] = !!value;
        scheduleFlush();
    }
    function deleteNegValue(chatKey) {
        if (negMap[chatKey] !== undefined) {
            delete negMap[chatKey];
            scheduleFlush();
        }
    }

    async function getUserConfig() {
        const data = await storageGet([NAME_KEY, SECTOR_KEY]);
        const name = sanitize(data[NAME_KEY]);
        const sector = sanitize(data[SECTOR_KEY]).toLowerCase();
        return { name, sector };
    }

    async function shouldRun() {
        const { name, sector } = await getUserConfig();
        return !!name && sector === "preatendimento";
    }

    function findContactsRoot() {
        const el =
            document.querySelector('.content.active #contact-fields.contacts-field.contact-scroll') ||
            document.querySelector('.content.active #contact-fields') ||
            document.querySelector('#contact-fields.contacts-field.contact-scroll') ||
            document.querySelector('#contact-fields') ||
            document.querySelector('.contacts-field.contact-scroll');

        if (!el) return null;
        if (!isVisibleEl(el)) return null;

        return el;
    }

    function isContactsViewActive() {
        if (document.hidden) return false;

        if (!hasEmAtendimentoHeaderVisible()) return false;

        const root = findContactsRoot();
        if (!root) return false;

        return true;
    }

    function hasEmAtendimentoHeaderVisible() {
        const nodes = Array.from(document.querySelectorAll("div.header-text, .header-text"));
        for (const el of nodes) {
            const t = getText(el).toLowerCase();
            if (t.includes("em atendimento") && isVisibleEl(el)) return true;
        }
        return false;
    }

    function keepAliveWhilePaused(now) {
        for (const [key, item] of active.entries()) {
            if (!item) continue;

            item.lastSeenMs = now;
            item.missCount = 0;

            cancelPendingIfAny(key);
            persistSet(key, { lastSeenMs: now });
        }

        pendingClose.clear();
    }

    function isCardEmAtendimento(cardEl) {
        return !!cardEl?.querySelector?.('.contact-times[phase="attendance"]');
    }

    function getCardsEmAtendimento() {
        const root = findContactsRoot();
        if (!root) return [];
        const cards = Array.from(root.querySelectorAll(".sz_contact")).filter(el => el?.isConnected);
        return cards.filter(isCardEmAtendimento);
    }

    function extractClientName(cardEl) {
        const candidates = cardEl.querySelectorAll(".contact-name, .name, strong, b, .chat-name, .contact-name, .name");
        for (const c of candidates) {
            const t = getText(c);
            if (t && t.length >= 2) return t;
        }
        const raw = getText(cardEl);
        if (!raw) return "unknown";
        return raw.split(" ").slice(0, 4).join(" ").trim() || "unknown";
    }

    function extractNumericIdFromCard(cardEl) {
        const nodes = cardEl.querySelectorAll("small, span, div, b, strong, a");
        for (const n of nodes) {
            const t = getText(n);
            if (!t) continue;

            const m55 = t.match(/\b55\d{10,13}\b/);
            if (m55?.[0]) return `tel:${m55[0]}`;

            const mLong = t.match(/\b\d{10,15}\b/);
            if (mLong?.[0]) return `id:${mLong[0]}`;
        }
        return "";
    }

    function getPrimaryKey(cardEl) {
        if (!cardEl) return "";
        const attrs = ["data-chat-id", "data-contact-id", "data-id", "id"];
        for (const a of attrs) {
            const v = cardEl.getAttribute?.(a);
            if (v && sanitize(v)) return `${a}:${sanitize(v)}`;
        }
        const numId = extractNumericIdFromCard(cardEl);
        if (numId) return numId;
        return "";
    }

    function getCandidateKey(cardEl, nameKey) {
        const pk = getPrimaryKey(cardEl);
        if (pk) return pk;
        return `name:${nameKey}`;
    }

    function isNameKeyPresentInEmAtendimento(nameKey) {
        const cards = getCardsEmAtendimento();
        for (const c of cards) {
            const nk = normalizeNameKey(extractClientName(c));
            if (nk && nk === nameKey) return true;
        }
        return false;
    }

    function ensureTickerSlot(cardEl) {
        let slot = cardEl.querySelector(".atendeai-ticker-slot");
        if (slot && slot.isConnected) return slot;

        slot = document.createElement("div");
        slot.className = "atendeai-ticker-slot";

        cardEl.style.setProperty("position", "relative", "important");

        const TOP_SAFE = 50;
        const RIGHT_SAFE = 27;

        slot.style.cssText = `
      position:absolute;
      top:${TOP_SAFE}px;
      right:${RIGHT_SAFE}px;

      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:6px;

      z-index:2147483647;
      pointer-events:auto;
      user-select:none;
    `;

        cardEl.appendChild(slot);
        return slot;
    }

    function ensureTickerElement(cardEl) {
        const slot = ensureTickerSlot(cardEl);

        let badge = slot.querySelector(".atendeai-precontrol-ticker");
        if (badge && badge.isConnected) return badge;

        badge = document.createElement("span");
        badge.className = "atendeai-precontrol-ticker";
        badge.style.cssText = `
      display:inline-flex;
  align-items:center;
  justify-content:center;

  padding: 1px 6px;
  border-radius: 999px;

  font-size: 10px;
  font-weight: 800;
  line-height: 1;

  color: rgba(255,255,255,.92);

  background: rgba(148,163,184,.22);      /* slate bem suave */
  border: 1px solid rgba(148,163,184,.28);
  backdrop-filter: blur(6px);

  user-select:none;
  white-space:nowrap;

  min-width: 64px;
  height: 18px;

  text-align:center;
  font-variant-numeric: tabular-nums;

  box-shadow: 0 1px 6px rgba(0,0,0,.18);
`;
        badge.textContent = "00:00:00";

        slot.appendChild(badge);
        return badge;
    }

    function ensureNegElement(cardEl) {
        const slot = ensureTickerSlot(cardEl);

        let badge = slot.querySelector(".atendeai-precontrol-neg");
        if (badge && badge.isConnected) return badge;

        badge = document.createElement("span");
        badge.className = "atendeai-precontrol-neg";
        badge.style.cssText = `
      display:inline-flex;
      align-items:center;
      justify-content:center;

      width: 24px;
      height: 24px;
      border-radius: 999px;

      font-size: 14px;
      font-weight: 900;
      line-height: 1;

      color:#fff;
      background:#6b7280;

      user-select:none;
      cursor:pointer;

      flex: 0 0 auto;
      pointer-events: auto;

      box-shadow: 0 2px 10px rgba(0,0,0,.28);
    `;

        badge.textContent = "💸";
        badge.title = "Negociação: clique para alternar";
        badge.setAttribute("role", "button");
        badge.setAttribute("aria-label", "Alternar negociação");

        slot.appendChild(badge);
        return badge;
    }

    function applyNegUI(negEl, isNeg) {
        if (!negEl) return;
        negEl.style.background = isNeg ? "#5ccf86" : "#6b7280";
        negEl.title = isNeg
            ? "Negociação: SIM (clique para desativar)"
            : "Negociação: NÃO (clique para ativar)";
    }

    function removeTicker(cardEl, chatKey = null) {
        const slot = cardEl?.querySelector?.(".atendeai-ticker-slot");
        if (!slot) return;

        if (chatKey && slot.dataset?.chatkey && slot.dataset.chatkey !== chatKey) return;

        slot.remove();
    }

    function applyTickerColor(tickerEl, elapsedMs) {
        if (!tickerEl) return;
        const min = elapsedMs / 60000;
        if (min < 5) tickerEl.style.background = "#41925f";
        else if (min < 10) tickerEl.style.background = "#a09742";
        else tickerEl.style.background = "#e75a5a";
    }

    function isVisibleEl(el) {
        if (!el || !el.isConnected) return false;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    async function loadPersisted() {
        const store = await storageGet([ACTIVE_KEY, ALIAS_KEY, NEG_KEY]);
        persistedCache = store[ACTIVE_KEY] || {};
        aliasMap = store[ALIAS_KEY] || {};
        negMap = store[NEG_KEY] || {};

        for (const [chatKey, v] of Object.entries(persistedCache)) {
            if (!active.has(chatKey)) {
                active.set(chatKey, {
                    startMs: Number(v.startMs || Date.now()),
                    lastSeenMs: Number(v.lastSeenMs || Date.now()),
                    nameClient: sanitize(v.nameClient) || "unknown",
                    nameKey: sanitize(v.nameKey) || "",
                    date: sanitize(v.date) || toDateYYYYMMDD(new Date()),
                    sessionId: sanitize(v.sessionId) || "",
                    negociation: !!(v.negociation ?? negMap[chatKey] ?? false),
                    el: null,
                    tickerEl: null,
                    negEl: null,
                    missCount: 0
                });
            }
        }
    }

    function persistSet(chatKey, data) {
        const prev = persistedCache[chatKey] || {};
        const next = { ...prev, ...data };
        if (prev.startMs) next.startMs = prev.startMs;
        persistedCache[chatKey] = next;
        scheduleFlush();
    }

    function persistDelete(chatKey) {
        delete persistedCache[chatKey];
        scheduleFlush();
    }

    async function markSentOnce(sessionId, date) {
        const k = `${sessionId}::${date}`;
        const store = await storageGet([SENT_KEY]);
        const sent = store[SENT_KEY] || {};
        if (sent[k]) return false;
        sent[k] = Date.now();
        await storageSet({ [SENT_KEY]: sent });
        return true;
    }

    function migrateTimerKey(oldKey, newKey) {
        if (!oldKey || !newKey || oldKey === newKey) return;
        const old = active.get(oldKey);
        if (!old) return;

        if (pendingClose.has(oldKey)) {
            pendingClose.set(newKey, pendingClose.get(oldKey));
            pendingClose.delete(oldKey);
        }

        active.set(newKey, { ...old });
        active.delete(oldKey);

        if (persistedCache[oldKey]) {
            persistedCache[newKey] = persistedCache[oldKey];
            delete persistedCache[oldKey];
            scheduleFlush();
        }

        if (negMap[oldKey] !== undefined && negMap[newKey] === undefined) {
            negMap[newKey] = negMap[oldKey];
            delete negMap[oldKey];
            scheduleFlush();
        }
    }

    function resolveChatKey({ primaryKey, nameKey }) {
        if (primaryKey && active.has(primaryKey)) return primaryKey;

        const aliased = aliasMap[nameKey];
        if (aliased && active.has(aliased)) {
            if (primaryKey && aliased !== primaryKey) {
                migrateTimerKey(aliased, primaryKey);
                aliasMap[nameKey] = primaryKey;
                scheduleFlush();
                return primaryKey;
            }
            return aliased;
        }

        if (primaryKey) {
            aliasMap[nameKey] = primaryKey;
            scheduleFlush();
            return primaryKey;
        }

        return `name:${nameKey}`;
    }

    function touchCandidate(candidateKey, now, nameClient, nameKey) {
        const cur = startCandidates.get(candidateKey);
        if (!cur) {
            startCandidates.set(candidateKey, {
                firstSeenMs: now,
                lastSeenMs: now,
                seenCount: 1,
                nameClient,
                nameKey
            });
            return;
        }

        if (now - cur.lastSeenMs > START_STABLE_WINDOW_MS) {
            cur.firstSeenMs = now;
            cur.seenCount = 1;
            cur.lastSeenMs = now;
            cur.nameClient = nameClient;
            cur.nameKey = nameKey;
            return;
        }

        cur.lastSeenMs = now;
        cur.seenCount += 1;
        if (!cur.nameClient || cur.nameClient === "unknown") cur.nameClient = nameClient;
        if (!cur.nameKey) cur.nameKey = nameKey;
    }

    function isCandidateStable(candidateKey) {
        const c = startCandidates.get(candidateKey);
        if (!c) return false;
        return c.seenCount >= START_STABLE_SCANS;
    }

    function clearCandidate(candidateKey) {
        startCandidates.delete(candidateKey);
    }

    function ensureSessionId(nameKey, startMs) {
        return `sid:${hashStr(`${nameKey}::${startMs}`)}`;
    }

    function cancelPendingIfAny(chatKey) {
        if (pendingClose.has(chatKey)) pendingClose.delete(chatKey);
    }

    function bindNegClick(chatKey) {
        const item = active.get(chatKey);
        if (!item?.negEl) return;

        if (item.negEl.dataset.bound === "1") return;
        item.negEl.dataset.bound = "1";

        item.negEl.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            const key = item.negEl?.dataset?.chatkey || chatKey;

            const current = getNegValue(key);
            const next = !current;

            setNegValue(key, next);

            const curItem = active.get(key);
            if (curItem) {
                curItem.negociation = next;
                if (curItem.negEl) {
                    curItem.negEl.dataset.chatkey = key;
                    applyNegUI(curItem.negEl, next);
                }
                persistSet(key, { negociation: next });
                return;
            }

            item.negociation = next;
            item.negEl.dataset.chatkey = key;
            applyNegUI(item.negEl, next);
            persistSet(key, { negociation: next });
        });
    }

    function moveTickerSlotIfNeeded(oldCardEl, newCardEl) {
        if (!oldCardEl || !newCardEl) return null;
        if (oldCardEl === newCardEl) return newCardEl.querySelector(".atendeai-ticker-slot");

        const oldSlot = oldCardEl.querySelector(".atendeai-ticker-slot");
        if (!oldSlot) return null;

        const existingOnNew = newCardEl.querySelector(".atendeai-ticker-slot");
        if (existingOnNew && existingOnNew !== oldSlot) existingOnNew.remove();

        newCardEl.style.setProperty("position", "relative", "important");
        newCardEl.appendChild(oldSlot);

        return oldSlot;
    }

    function cleanupForeignSlot(cardEl, currentChatKey) {
        const slot = cardEl?.querySelector?.(".atendeai-ticker-slot");
        if (!slot) return;

        const owner = slot.dataset?.chatkey;
        if (!owner || owner === currentChatKey) return;

        const oldItem = active.get(owner);
        if (oldItem) {
            oldItem.el = null;
            oldItem.tickerEl = null;
            oldItem.negEl = null;
        }

        slot.remove();
    }

    async function startOrTouchTimer(cardEl, preName) {
        if (!isCardEmAtendimento(cardEl)) return "";

        const now = Date.now();
        const nameClient = extractClientName(cardEl);
        const nameKey = normalizeNameKey(nameClient) || "unknown";

        const primaryKey = getPrimaryKey(cardEl);
        const candidateKey = getCandidateKey(cardEl, nameKey);
        const chatKey = resolveChatKey({ primaryKey, nameKey });

        cleanupForeignSlot(cardEl, chatKey);

        cancelPendingIfAny(chatKey);

        if (!active.has(chatKey)) {
            touchCandidate(candidateKey, now, nameClient, nameKey);
            if (!isCandidateStable(candidateKey)) return "";

            clearCandidate(candidateKey);

            const date = toDateYYYYMMDD(new Date(now));
            const tickerEl = ensureTickerElement(cardEl);
            const negEl = ensureNegElement(cardEl);

            const slot = cardEl.querySelector(".atendeai-ticker-slot");
            if (slot) slot.dataset.chatkey = chatKey;
            if (negEl) negEl.dataset.chatkey = chatKey;

            const sessionId = ensureSessionId(nameKey, now);
            const persistedNeg = getNegValue(chatKey);
            applyNegUI(negEl, persistedNeg);

            active.set(chatKey, {
                startMs: now,
                lastSeenMs: now,
                nameClient,
                nameKey,
                date,
                sessionId,
                el: cardEl,
                tickerEl,
                negEl,
                negociation: persistedNeg,
                missCount: 0
            });

            aliasMap[nameKey] = chatKey;
            persistSet(chatKey, {
                startMs: now,
                lastSeenMs: now,
                nameClient,
                nameKey,
                date,
                sessionId,
                negociation: persistedNeg
            });

            bindNegClick(chatKey);
            return chatKey;
        }

        const item = active.get(chatKey);

        const oldEl = item.el;
        if (oldEl && oldEl !== cardEl) {
            const movedSlot = moveTickerSlotIfNeeded(oldEl, cardEl);

            if (movedSlot) {
                item.tickerEl = movedSlot.querySelector(".atendeai-precontrol-ticker") || null;
                item.negEl = movedSlot.querySelector(".atendeai-precontrol-neg") || null;

                movedSlot.dataset.chatkey = chatKey;
                if (item.negEl) item.negEl.dataset.chatkey = chatKey;
            } else {
                const slotNow = cardEl.querySelector(".atendeai-ticker-slot");
                if (slotNow) slotNow.dataset.chatkey = chatKey;
            }
        } else {
            const slotNow = cardEl.querySelector(".atendeai-ticker-slot");
            if (slotNow) slotNow.dataset.chatkey = chatKey;
        }

        item.el = cardEl;
        item.lastSeenMs = now;
        item.missCount = 0;

        if (!item.nameClient || item.nameClient === "unknown") item.nameClient = nameClient;
        if (!item.nameKey) item.nameKey = nameKey;

        if (!item.sessionId) item.sessionId = ensureSessionId(item.nameKey || nameKey, item.startMs);

        if (!item.tickerEl || item.tickerEl.isConnected === false || !cardEl.contains(item.tickerEl)) {
            item.tickerEl = ensureTickerElement(cardEl);
        }
        if (!item.negEl || item.negEl.isConnected === false || !cardEl.contains(item.negEl)) {
            item.negEl = ensureNegElement(cardEl);
        }

        const slotNow2 = cardEl.querySelector(".atendeai-ticker-slot");
        if (slotNow2) slotNow2.dataset.chatkey = chatKey;
        if (item.negEl) item.negEl.dataset.chatkey = chatKey;

        const negNow = !!(persistedCache?.[chatKey]?.negociation ?? negMap?.[chatKey] ?? item.negociation ?? false);
        item.negociation = negNow;
        applyNegUI(item.negEl, negNow);

        if (nameKey && aliasMap[nameKey] !== chatKey) {
            aliasMap[nameKey] = chatKey;
            scheduleFlush();
        }

        persistSet(chatKey, {
            startMs: item.startMs,
            lastSeenMs: item.lastSeenMs,
            nameClient: item.nameClient,
            nameKey: item.nameKey,
            date: item.date,
            sessionId: item.sessionId,
            negociation: !!item.negociation
        });

        bindNegClick(chatKey);
        return chatKey;
    }

    async function finalizeStop(chatKey, preName) {
        const item = active.get(chatKey);

        let startMs, nameClient, nameKey, date, sessionId, negociation;

        if (item) {
            startMs = item.startMs;
            nameClient = item.nameClient;
            nameKey = item.nameKey;
            date = item.date;
            sessionId = item.sessionId || ensureSessionId(nameKey, startMs);
            negociation = !!(item.negociation ?? persistedCache?.[chatKey]?.negociation ?? negMap?.[chatKey] ?? false);
        } else {
            const store = await storageGet([ACTIVE_KEY]);
            const persisted = store[ACTIVE_KEY] || {};
            if (!persisted[chatKey]) return;

            startMs = Number(persisted[chatKey].startMs || Date.now());
            nameClient = sanitize(persisted[chatKey].nameClient) || "unknown";
            nameKey = sanitize(persisted[chatKey].nameKey) || "";
            date = sanitize(persisted[chatKey].date) || toDateYYYYMMDD(new Date());
            sessionId = sanitize(persisted[chatKey].sessionId) || ensureSessionId(nameKey, startMs);
            negociation = !!(persisted[chatKey].negociation ?? negMap?.[chatKey] ?? false);
        }

        if (nameKey && isNameKeyPresentInEmAtendimento(nameKey)) {
            cancelPendingIfAny(chatKey);
            return;
        }

        const elapsedMs = Date.now() - Number(startMs || 0);
        const time = msToHHMMSS(elapsedMs);

        if (item?.el) removeTicker(item.el, chatKey);

        active.delete(chatKey);
        persistDelete(chatKey);
        cancelPendingIfAny(chatKey);

        if (nameKey && aliasMap[nameKey] === chatKey) {
            delete aliasMap[nameKey];
            scheduleFlush();
        }

        deleteNegValue(chatKey);

        const okToSend = await markSentOnce(sessionId, date);
        if (!okToSend) return;

        const payload = {
            name: sanitize(preName),
            nameClient: sanitize(nameClient),
            date: sanitize(date),
            time: sanitize(time),
            negociation: !!negociation
        };

        chrome.runtime.sendMessage({ action: BG_ACTION_CREATE, payload }, () => { });
    }

    async function scan(preName) {
        const now = Date.now();

        if (!isContactsViewActive()) {
            keepAliveWhilePaused(now);
            return;
        }

        const cards = getCardsEmAtendimento();
        const seen = new Set();
        const seenNameKeys = new Set();

        for (const card of cards) {
            const nameClient = extractClientName(card);
            const nameKey = normalizeNameKey(nameClient) || "unknown";
            const primaryKey = getPrimaryKey(card);

            const chatKey = resolveChatKey({ primaryKey, nameKey });
            if (chatKey) seen.add(chatKey);
            if (nameKey) seenNameKeys.add(nameKey);

            await startOrTouchTimer(card, preName);
        }

        for (const [k, p] of pendingClose.entries()) {
            if (seen.has(k)) {
                pendingClose.delete(k);
                continue;
            }
            if (p?.nameKey && seenNameKeys.has(p.nameKey)) {
                pendingClose.delete(k);
            }
        }

        for (const [key, item] of active.entries()) {
            if (seen.has(key)) continue;

            if (item?.nameKey && seenNameKeys.has(item.nameKey)) {
                item.missCount = 0;
                cancelPendingIfAny(key);
                continue;
            }

            item.missCount = (item.missCount || 0) + 1;

            const lastSeen = Number(item.lastSeenMs || 0);
            const timeMissMs = now - lastSeen;

            if (timeMissMs < HARD_GRACE_MS) continue;

            const p = pendingClose.get(key);
            if (!p) {
                pendingClose.set(key, { sinceMs: now, scans: 1, nameKey: item.nameKey || "" });
                continue;
            }

            p.scans += 1;

            const confirmByTime = (now - p.sinceMs) >= PENDING_CONFIRM_MS;
            const confirmByScans = p.scans >= PENDING_CONFIRM_SCANS;

            if (confirmByTime || confirmByScans) {
                await finalizeStop(key, preName);
            }
        }
    }

    function startTickerLoop() {
        if (tickerInterval) return;

        tickerInterval = setInterval(() => {
            const now = Date.now();
            for (const item of active.values()) {
                if (!item?.el || item.el.isConnected === false) continue;

                if (!item.tickerEl || item.tickerEl.isConnected === false || !item.el.contains(item.tickerEl)) {
                    item.tickerEl = ensureTickerElement(item.el);
                }

                const elapsed = now - item.startMs;
                item.tickerEl.textContent = msToHHMMSS(elapsed);
                applyTickerColor(item.tickerEl, elapsed);
            }
        }, 1000);
    }

    function stopTickerLoop() {
        if (tickerInterval) {
            clearInterval(tickerInterval);
            tickerInterval = null;
        }
    }

    function scheduleScan(preName) {
        if (scanScheduled) return;
        scanScheduled = true;

        setTimeout(async () => {
            scanScheduled = false;
            await scan(preName);
        }, 250);
    }

    function attachObserver(preName) {
        if (observer) return;

        observer = new MutationObserver(() => scheduleScan(preName));
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function detachObserver() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
    }

    function startScanInterval(preName) {
        if (scanInterval) return;
        scanInterval = setInterval(() => scheduleScan(preName), SCAN_INTERVAL_MS);
    }

    function stopScanInterval() {
        if (scanInterval) {
            clearInterval(scanInterval);
            scanInterval = null;
        }
    }

    async function init() {
        if (started) return;

        const ok = await shouldRun();
        if (!ok) return;

        const { name: preName } = await getUserConfig();

        await loadPersisted();
        await scan(preName);

        attachObserver(preName);
        startScanInterval(preName);
        startTickerLoop();

        started = true;
        console.log("✅ PreControlModule ativo (Pré-atendimento).");
    }

    async function stop() {
        detachObserver();
        stopScanInterval();
        stopTickerLoop();
        started = false;
    }

    return { init, stop };
})();

window.PreControlModule = PreControlModule;