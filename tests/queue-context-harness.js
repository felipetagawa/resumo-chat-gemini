// tests/queue-context-harness.js
const fs = require('node:fs');
const vm = require('node:vm');
const { el, createDocument } = require('./mini-dom');

const FILES = ['modules/queue-context-parse.js', 'modules/queue-context-store.js',
  'modules/queue-context-capture.js', 'modules/queue-context.js'];

function harness({ store = {}, send } = {}) {
  const document = createDocument(), timers = new Map(), observers = [], warns = [], copied = [], sent = [];
  let seq = 0, clock = 1_000_000_000;
  const context = {
    document,
    console: { warn: (...a) => warns.push(a.join(' ')), log() {}, error() {} },
    Date: class extends Date { static now() { return clock; } },
    setTimeout(fn) { timers.set(++seq, fn); return seq; },
    clearTimeout(id) { timers.delete(id); },
    MutationObserver: class {
      constructor(fn) { this.fn = fn; observers.push(this); }
      observe() {} disconnect() { this.disconnected = true; }
    },
    getComputedStyle: n => ({ position: n.style.position || 'static', transform: n.style.transform || 'none',
      display: n.style.display || 'block', flexDirection: n.style.flexDirection || 'row' }),
    navigator: { clipboard: { async writeText(v) { copied.push(v); } } },
    MessagingHelper: { async send(message) { sent.push(message); return send ? send(message) : { success: false }; } },
    chrome: { runtime: {}, storage: {
      local: {
        get(keys, cb) { cb(structuredClone(store)); },
        set(data, cb) { Object.assign(store, structuredClone(data)); cb(); },
        remove(keys, cb) { [].concat(keys).forEach(k => delete store[k]); cb(); }
      },
      onChanged: { addListener() {} }
    } }
  };
  vm.createContext(context);
  FILES.filter(f => fs.existsSync(f)).forEach(f => vm.runInContext(fs.readFileSync(f, 'utf8'), context));

  const list = el('div', { class: 'chats-list' }); document.body.appendChild(list);
  const transcript = el('div', { class: 'messages' }); document.body.appendChild(transcript);
  function card(name, id, active = false) {
    const c = el('div', { class: 'sz_contact' + (active ? ' active' : ''), 'data-chat-id': id }, [
      el('div', { class: 'name' }, [el('span', { class: 'contact-name', text: name })]),
      el('span', { class: 'badge', text: '1' })]);
    list.appendChild(c); return c;
  }
  function message({ name, text, side = 'received' }) {
    const m = el('div', { class: side ? `msg ${side}` : 'msg' }, [
      el('div', { class: 'name', text: name }), el('div', { class: 'message' }, [el('span', { text })])]);
    transcript.appendChild(m); return m;
  }
  async function flush() {
    for (let i = 0; i < 20 && timers.size; i++) {
      const pending = [...timers.values()]; timers.clear();
      for (const fn of pending) await fn();
      await new Promise(setImmediate);
    }
  }
  function notify(records) { observers.filter(o => !o.disconnected).forEach(o => o.fn(records)); }
  function mutate(records = [{ target: list, addedNodes: [], removedNodes: [] }]) { notify(records); return flush(); }
  async function mount() { await context.QueueContextModule.mount(); await flush(); }
  const strips = () => document.querySelectorAll('.atendeai-queue-ctx');
  return { context, document, list, transcript, card, message, flush, notify, mutate, mount, strips,
    store, warns, copied, sent, timers, advance(ms) { clock += ms; } };
}

module.exports = { harness, el };
