const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { el, createDocument, collect } = require('./mini-dom');

function setupBridge() {
  const document = createDocument();
  document.documentElement = el('html');
  const cardA = el('div', { class: 'sz_contact' });
  const cardB = el('div', { class: 'sz_contact' });
  document.body.appendChild(cardA);
  document.body.appendChild(cardB);

  cardA.removeAttribute = (name) => { delete cardA.attrs[name]; };
  cardB.removeAttribute = (name) => { delete cardB.attrs[name]; };

  let observerCb = null;
  class FakeMutationObserver {
    constructor(cb) { observerCb = cb; }
    observe() {}
    disconnect() {}
  }

  const dispatchedEvents = [];
  document.dispatchEvent = (event) => {
    dispatchedEvents.push(event);
    const listeners = document.listeners.filter(l => l.type === event.type);
    listeners.forEach(l => l.fn(event));
    return true;
  };

  const window = {
    addEventListener: () => {},
    MutationObserver: FakeMutationObserver
  };

  const context = {
    window,
    globalThis: {},
    document,
    MutationObserver: FakeMutationObserver,
    setTimeout: (fn) => setTimeout(fn, 1),
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    Array,
    Map,
    String,
    Boolean,
    console
  };
  context.globalThis = context;

  vm.createContext(context);
  const code = fs.readFileSync('modules/sz-vue-bridge.js', 'utf8');
  return { document, cardA, cardB, context, code, dispatchedEvents };
}

test('bridge synchronizes valid attendance protocols to DOM attributes without touching native data-chat-id', () => {
  const h = setupBridge();
  h.cardA.__vue__ = {
    $props: {
      contact: { protocol: 'SZ-20261013-100', isAttendance: true, _id: 'customer-1' }
    }
  };
  h.cardB.__vue__ = {
    $props: {
      contact: { protocol: 'SZ-20261013-200', isAttendance: true, _id: 'customer-2' }
    }
  };

  vm.runInContext(h.code, h.context);

  assert.equal(h.cardA.getAttribute('data-sz-protocol'), null);
  assert.ok(h.cardA.getAttribute('data-sz-attendance-session')?.startsWith('att_'));
  assert.equal(h.cardA.getAttribute('data-sz-attendance'), 'true');
  // Strict non-interference: bridge does NOT overwrite native data-chat-id
  assert.equal(h.cardA.getAttribute('data-chat-id'), null);

  assert.equal(h.cardB.getAttribute('data-sz-protocol'), null);
  assert.ok(h.cardB.getAttribute('data-sz-attendance-session')?.startsWith('att_'));
  assert.equal(h.cardB.getAttribute('data-sz-attendance'), 'true');
  assert.equal(h.cardB.getAttribute('data-chat-id'), null);

  // Dispatches atendeai:sz-bridge-synced event
  assert.ok(h.dispatchedEvents.some(e => e.type === 'atendeai:sz-bridge-synced' && e.detail.count === 2));
});

test('bridge extracts protocol when card.__vue__ exists without contact but parentElement.__vue__ has contact', () => {
  const h = setupBridge();
  const parentA = el('div', { class: 'sz_card_container' });
  const parentB = el('div', { class: 'sz_card_container' });
  h.document.body.appendChild(parentA);
  h.document.body.appendChild(parentB);
  parentA.appendChild(h.cardA);
  parentB.appendChild(h.cardB);

  // card itself has an internal component instance lacking contact
  h.cardA.__vue__ = { $props: { avatar: 'pic1.png' } };
  h.cardB.__vue__ = { $props: { avatar: 'pic2.png' } };

  // parentElement has the genuine attendance contact props
  parentA.__vue__ = {
    $props: {
      contact: { protocol: 'SZ-PARENT-01', isAttendance: true, _id: 'cust-1' }
    }
  };
  parentB.__vue__ = {
    $props: {
      contact: { protocol: 'SZ-PARENT-02', isAttendance: true, _id: 'cust-2' }
    }
  };

  vm.runInContext(h.code, h.context);

  assert.equal(h.cardA.getAttribute('data-sz-protocol'), null);
  assert.ok(h.cardA.getAttribute('data-sz-attendance-session')?.startsWith('att_'));
  assert.equal(h.cardA.getAttribute('data-sz-attendance'), 'true');
  assert.equal(h.cardB.getAttribute('data-sz-protocol'), null);
  assert.ok(h.cardB.getAttribute('data-sz-attendance-session')?.startsWith('att_'));
  assert.equal(h.cardB.getAttribute('data-sz-attendance'), 'true');
});

test('bridge fails closed on duplicate protocols across cards', () => {
  const h = setupBridge();
  h.cardA.__vue__ = {
    $props: {
      contact: { protocol: 'SZ-SAME-PROTOCOL', isAttendance: true }
    }
  };
  h.cardB.__vue__ = {
    $props: {
      contact: { protocol: 'SZ-SAME-PROTOCOL', isAttendance: true }
    }
  };

  vm.runInContext(h.code, h.context);

  assert.equal(h.cardA.getAttribute('data-sz-protocol'), null);
  assert.equal(h.cardA.getAttribute('data-sz-attendance'), null);
  assert.equal(h.cardA.getAttribute('data-chat-id'), null);
  assert.equal(h.cardB.getAttribute('data-sz-protocol'), null);
});

test('bridge fails closed when isAttendance is not true or protocol is phone-like', () => {
  const h = setupBridge();
  // isAttendance false
  h.cardA.__vue__ = {
    $props: {
      contact: { protocol: 'SZ-VALID-01', isAttendance: false }
    }
  };
  // Phone-like protocol
  h.cardB.__vue__ = {
    $props: {
      contact: { protocol: '5511999998888', isAttendance: true }
    }
  };

  vm.runInContext(h.code, h.context);

  assert.equal(h.cardA.getAttribute('data-sz-protocol'), null);
  assert.equal(h.cardA.getAttribute('data-sz-attendance'), null);
  assert.equal(h.cardB.getAttribute('data-sz-protocol'), null);
  assert.equal(h.cardB.getAttribute('data-sz-attendance'), null);
});

test('bridge removes bridge attributes when attendance ends or protocol disappears', () => {
  const h = setupBridge();
  h.cardA.__vue__ = {
    $props: {
      contact: { protocol: 'SZ-ACTIVE-01', isAttendance: true }
    }
  };

  vm.runInContext(h.code, h.context);
  assert.equal(h.cardA.getAttribute('data-sz-protocol'), null);
  assert.ok(h.cardA.getAttribute('data-sz-attendance-session')?.startsWith('att_'));

  // Attendance completed: isAttendance becomes false
  h.cardA.__vue__.$props.contact.isAttendance = false;
  // Trigger sync via custom event listener that bridge registers
  h.document.listeners.filter(l => l.type === 'atendeai:request-sz-sync').forEach(l => l.fn());

  assert.equal(h.cardA.getAttribute('data-sz-protocol'), null);
  assert.equal(h.cardA.getAttribute('data-sz-attendance-session'), null);
  assert.equal(h.cardA.getAttribute('data-sz-attendance'), null);
  assert.equal(h.cardA.getAttribute('data-chat-id'), null);
});

test('bridge syncs cards when Vue attaches props after initial mount and responds to sync request', () => {
  const h = setupBridge();
  // Initially cards have no Vue props
  vm.runInContext(h.code, h.context);
  assert.equal(h.cardA.getAttribute('data-sz-protocol'), null);
  assert.equal(h.cardA.getAttribute('data-sz-attendance-session'), null);

  // Later, Vue attaches props to parentElement
  const parentA = el('div');
  h.document.body.appendChild(parentA);
  parentA.appendChild(h.cardA);
  parentA.__vue__ = {
    $props: {
      contact: { protocol: 'SZ-ASYNC-01', isAttendance: true }
    }
  };

  // Trigger sync via event
  h.document.listeners.filter(l => l.type === 'atendeai:request-sz-sync').forEach(l => l.fn());

  assert.equal(h.cardA.getAttribute('data-sz-protocol'), null);
  assert.ok(h.cardA.getAttribute('data-sz-attendance-session')?.startsWith('att_'));
  assert.equal(h.cardA.getAttribute('data-sz-attendance'), 'true');
});

test('bridge idempotency guard prevents double initialization on globalThis', () => {
  const h = setupBridge();
  h.cardA.__vue__ = {
    $props: {
      contact: { protocol: 'SZ-GUARD-01', isAttendance: true }
    }
  };
  vm.runInContext(h.code, h.context);
  assert.equal(h.cardA.getAttribute('data-sz-protocol'), null);
  assert.ok(h.cardA.getAttribute('data-sz-attendance-session')?.startsWith('att_'));
  assert.equal(h.context.globalThis.__atendeai_sz_bridge_initialized__, true);

  // Second run should return early without errors
  vm.runInContext(h.code, h.context);
  assert.equal(h.cardA.getAttribute('data-sz-protocol'), null);
  assert.ok(h.cardA.getAttribute('data-sz-attendance-session')?.startsWith('att_'));
});

test('bridge synchronizes valid numeric attendance protocols (pure digits timestamp/sequence) without phone rejection', () => {
  const h = setupBridge();
  const parentA = el('div');
  const parentB = el('div');
  h.document.body.appendChild(parentA);
  h.document.body.appendChild(parentB);
  parentA.appendChild(h.cardA);
  parentB.appendChild(h.cardB);

  // 14-digit numeric timestamp protocols at depth 1 (parent element Vue component)
  parentA.__vue__ = {
    $props: {
      contact: { protocol: '20261013140512', isAttendance: true, _id: 'cust-1' }
    }
  };
  parentB.__vue__ = {
    $props: {
      contact: { protocol: '20261013140513', isAttendance: true, _id: 'cust-2' }
    }
  };

  vm.runInContext(h.code, h.context);

  assert.equal(h.cardA.getAttribute('data-sz-protocol'), null);
  assert.ok(h.cardA.getAttribute('data-sz-attendance-session')?.startsWith('att_'));
  assert.equal(h.cardA.getAttribute('data-sz-attendance'), 'true');
  assert.equal(h.cardB.getAttribute('data-sz-protocol'), null);
  assert.ok(h.cardB.getAttribute('data-sz-attendance-session')?.startsWith('att_'));
  assert.equal(h.cardB.getAttribute('data-sz-attendance'), 'true');
  assert.ok(h.dispatchedEvents.some(e => e.type === 'atendeai:sz-bridge-synced' && e.detail.count === 2));
});

test('bridge rejects protocol when it matches contact._id or contact phone', () => {
  const h = setupBridge();
  // Protocol identical to contact._id
  h.cardA.__vue__ = {
    $props: {
      contact: { protocol: 'cust-id-12345', isAttendance: true, _id: 'cust-id-12345' }
    }
  };
  // Protocol identical to contact phone
  h.cardB.__vue__ = {
    $props: {
      contact: { protocol: '5511988887777', isAttendance: true, phone: '(11) 98888-7777' }
    }
  };

  vm.runInContext(h.code, h.context);

  assert.equal(h.cardA.getAttribute('data-sz-protocol'), null);
  assert.equal(h.cardA.getAttribute('data-sz-attendance'), null);
  assert.equal(h.cardB.getAttribute('data-sz-protocol'), null);
  assert.equal(h.cardB.getAttribute('data-sz-attendance'), null);
});

test('bridge generates data-sz-attendance-session token and updates diagnostic step counts', () => {
  const h = setupBridge();
  h.cardA.__vue__ = {
    $props: {
      contact: { protocol: 'SZ-20261013-100', isAttendance: true, _id: 'customer-1' }
    }
  };
  h.cardB.__vue__ = {
    $props: {
      contact: { protocol: 'SZ-20261013-200', isAttendance: true, _id: 'customer-2' }
    }
  };

  vm.runInContext(h.code, h.context);

  assert.ok(h.cardA.getAttribute('data-sz-attendance-session')?.startsWith('att_'));
  assert.ok(h.cardB.getAttribute('data-sz-attendance-session')?.startsWith('att_'));
  assert.notEqual(
    h.cardA.getAttribute('data-sz-attendance-session'),
    h.cardB.getAttribute('data-sz-attendance-session')
  );

  const diag = h.context.globalThis.__atendeai_sz_bridge_diag__;
  assert.ok(diag);
  assert.equal(diag.totalCards, 2);
  assert.equal(diag.withVue, 2);
  assert.equal(diag.withContact, 2);
  assert.equal(diag.accepted, 2);
  assert.equal(diag.rejections.duplicateProtocol, 0);
});

test('bridge falls back to parentElement when card depth 0 has non-attendance contact', () => {
  const h = setupBridge();
  const parentA = el('div');
  h.document.body.appendChild(parentA);
  parentA.appendChild(h.cardA);

  // Depth 0 has contact but isAttendance is not true and no protocol
  h.cardA.__vue__ = {
    $props: {
      contact: { name: 'Card Level Inner Component', isAttendance: false }
    }
  };

  // Depth 1 (parentElement) has genuine attendance contact
  parentA.__vue__ = {
    $props: {
      contact: { protocol: 'SZ-PARENT-FALLBACK', isAttendance: true, _id: 'cust-parent' }
    }
  };

  vm.runInContext(h.code, h.context);

  assert.equal(h.cardA.getAttribute('data-sz-protocol'), null);
  assert.ok(h.cardA.getAttribute('data-sz-attendance-session')?.startsWith('att_'));
});
