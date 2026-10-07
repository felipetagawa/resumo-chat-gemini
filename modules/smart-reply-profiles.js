// Persistent style preferences only. No attendance data belongs in this store.
const SmartReplyProfilesModule = (() => {
  const KEY = "atendeai_smart_reply_profiles_v1", DEFAULT_KEY = "atendeai_smart_reply_profile";
  const BUILT_INS = Object.freeze([
    Object.freeze({ id: "DIRECT", name: "Direta", instruction: "Concisa, objetiva, educada, mínimo preâmbulo; próximo passo útil.", builtin: true }),
    Object.freeze({ id: "EMPATHETIC", name: "Empática", instruction: "Reconheça brevemente a frustração, sem excesso de desculpas nem admitir culpa; próximo passo útil.", builtin: true }),
    Object.freeze({ id: "DIDACTIC", name: "Didática", instruction: "Linguagem simples para cliente não técnico, evite jargão; passos concisos quando necessários.", builtin: true })
  ]);
  let items = [], selected = "DIRECT", queue = Promise.resolve();
  const listeners = new Set();
  function storage(method, value) {
    return new Promise((resolve, reject) => {
      chrome.storage.local[method](value, result => {
        const error = chrome.runtime?.lastError;
        if (error) reject(new Error("Não foi possível salvar/carregar os perfis.")); else resolve(result);
      });
    });
  }
  function enqueue(task) {
    const run = () => globalThis.navigator?.locks?.request ? navigator.locks.request(KEY, task) : task();
    const result = queue.then(run, run); queue = result.catch(() => {}); return result;
  }
  function validText(name, instruction) {
    return typeof name === "string" && name.trim().length > 0 && name.length <= 40
      && typeof instruction === "string" && instruction.trim().length > 0 && instruction.length <= 600;
  }
  function get(id) { const item = BUILT_INS.find(p => p.id === id) || items.find(p => p.id === id); return item ? { ...item } : null; }
  function list() { return [...BUILT_INS, ...items].map(p => ({ ...p })); }
  async function read() {
    const data = await storage("get", [KEY, DEFAULT_KEY]);
    const stored = data?.[KEY];
    const seen = new Set(); items = [];
    if (stored?.version === 1 && Array.isArray(stored.items)) for (const p of stored.items) {
      if (items.length === 8) break;
      if (typeof p?.id !== "string" || !p.id.startsWith("custom:") || seen.has(p.id)
        || !validText(p.name, p.instruction) || !Number.isFinite(p.createdAt) || !Number.isFinite(p.updatedAt)) continue;
      seen.add(p.id); items.push({ id: p.id, name: p.name, instruction: p.instruction, createdAt: p.createdAt, updatedAt: p.updatedAt });
    }
    selected = get(data?.[DEFAULT_KEY]) ? data[DEFAULT_KEY] : "DIRECT";
  }
  function notify() { listeners.forEach(fn => fn()); }
  async function load() { return enqueue(async () => { await read(); return list(); }); }
  async function save(input) {
    if (!validText(input?.name, input?.instruction)) throw new Error("Informe nome (até 40 caracteres) e estilo (até 600 caracteres). Não deixe campos vazios.");
    return enqueue(async () => {
      await read();
      const existing = input.id ? items.find(p => p.id === input.id) : null;
      if (input.id && !existing) throw new Error("Somente os seus perfis podem ser editados.");
      if (!existing && items.length >= 8) throw new Error("Você pode ter até 8 perfis personalizados.");
      const now = Date.now();
      const profile = { id: existing?.id || `custom:${crypto.randomUUID()}`, name: input.name.trim(), instruction: input.instruction.trim(),
        createdAt: existing?.createdAt || now, updatedAt: now };
      const next = existing ? items.map(p => p.id === profile.id ? profile : p) : [...items, profile];
      await storage("set", { [KEY]: { version: 1, items: next } });
      items = next; notify(); return { ...profile };
    });
  }
  async function duplicate(id) {
    const profile = get(id); if (!profile?.builtin) throw new Error("Escolha um perfil padrão para duplicar.");
    return save({ name: `${profile.name} personalizada`, instruction: profile.instruction });
  }
  async function setDefault(id) {
    return enqueue(async () => {
      await read(); if (!get(id)) throw new Error("Perfil indisponível.");
      await storage("set", { [DEFAULT_KEY]: id }); selected = id; notify();
    });
  }
  async function remove(id) {
    return enqueue(async () => {
      await read(); if (!items.some(p => p.id === id)) throw new Error("Perfis padrão não podem ser excluídos.");
      const next = items.filter(p => p.id !== id), fallback = selected === id ? "DIRECT" : selected;
      await storage("set", { [KEY]: { version: 1, items: next }, [DEFAULT_KEY]: fallback });
      items = next; selected = fallback; notify();
    });
  }
  function wire(id) {
    const p = get(id); if (!p) throw new Error("Perfil indisponível. Escolha outro perfil.");
    return p.builtin ? { profile: p.id } : { profile: "CUSTOM", styleInstruction: p.instruction };
  }
  return { load, list, get, save, duplicate, remove, setDefault, wire, defaultId: () => selected,
    onChanged(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
})();
window.SmartReplyProfilesModule = SmartReplyProfilesModule;
