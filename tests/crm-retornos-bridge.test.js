// The page-world bridge, run against a fake jQuery that fires PrimeFaces' own events the way the
// real CRM page was observed to (06/11/2026): pfAjaxSend(event, xhr, settings) and
// pfAjaxComplete(event, xhr, settings, args), with jakarta.faces.* fields and settings.source.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load() {
  const handlers = {};
  const jq = () => ({ on(name, fn) { (handlers[name] ||= []).push(fn); } });
  const dispatched = [];
  const docListeners = {};
  const attrs = {};
  const input = { id: 'frmAtendimento:tbvAtendimento:dataA_input', value: '', dispatchEvent() { return true; } };
  const widget = { id: 'frmAtendimento:tbvAtendimento:dataA', cfg: { showTime: true, dateFormat: 'dd/mm/yy' },
    setDate(d) { const p = (n) => String(n).padStart(2, '0'); input.value = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; } };
  const document = {
    documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: (k) => attrs[k] ?? null },
    dispatchEvent: (e) => { dispatched.push(e); return true; },
    addEventListener: (type, fn) => { docListeners[type] = fn; },
    getElementById: (id) => (id === input.id ? input : null),
    querySelectorAll: () => [input]
  };
  const context = { window: { jQuery: jq, PrimeFaces: { widgets: { w: widget } } }, document, console, setInterval, clearInterval, URLSearchParams, JSON, Number, String, Event: class { constructor(t) { this.type = t; } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } } };
  context.window.document = document;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('modules/crm-retornos-bridge.js', 'utf8'), context);
  return { handlers, dispatched, docListeners, attrs, input };
}

const data = 'jakarta.faces.partial.ajax=true&jakarta.faces.source=frmAtendimento%3Atbv%3Aj_idt92&frmAtendimento%3Atbv%3Aproblema=Algo';

test('it listens to PrimeFaces events (not the generic jQuery ones) and announces send and complete', () => {
  const { handlers, dispatched } = load();
  assert.ok(handlers.pfAjaxSend && handlers.pfAjaxComplete);
  assert.equal(handlers.ajaxSend, undefined);
  handlers.pfAjaxSend[0]({}, { status: 0 }, { source: 'frmAtendimento:tbvAtendimento:j_idt92', data, url: '/crm-atendimento/1;jsessionid=abc' });
  handlers.pfAjaxComplete[0]({}, { status: 200, responseText: '<partial-response/>' }, { source: 'frmAtendimento:tbvAtendimento:j_idt92', data, url: '/crm-atendimento/1' }, { validationFailed: false });
  const [send, complete] = dispatched.map((e) => JSON.parse(e.detail));
  assert.equal(send.phase, 'send');
  assert.equal(send.source, 'frmAtendimento:tbvAtendimento:j_idt92');
  assert.equal(send.form, 'frmAtendimento');
  assert.equal(send.url, '/crm-atendimento/1');
  assert.equal(complete.phase, 'complete');
  assert.equal(complete.status, 200);
  assert.deepEqual(complete.args, { validationFailed: false });
  assert.equal(complete.responseText, '<partial-response/>');
});

test('when settings.source is missing the source comes from the jakarta (or javax) form field', () => {
  const { handlers, dispatched } = load();
  handlers.pfAjaxSend[0]({}, {}, { data, url: '/x' });
  assert.equal(JSON.parse(dispatched[0].detail).source, 'frmAtendimento:tbv:j_idt92');
  handlers.pfAjaxSend[0]({}, {}, { data: 'javax.faces.source=frmA%3Ab', url: '/x' });
  assert.equal(JSON.parse(dispatched[1].detail).source, 'frmA:b');
});

test('set-date writes the real calendar input through the widget and reports ok', () => {
  const { docListeners, attrs, input } = load();
  docListeners['atendeai:crm-set-date']({ detail: JSON.stringify({ id: 'frmAtendimento:tbvAtendimento:dataA_input', value: '09/11/2026 15:15' }) });
  assert.equal(input.value, '09/11/2026 15:15');
  assert.equal(attrs['data-atendeai-crm-set-date-result'], 'ok');
});

test('set-date falls back to the attribute when the event detail is lost between worlds', () => {
  const { docListeners, attrs, input } = load();
  attrs['data-atendeai-crm-set-date'] = JSON.stringify({ id: 'frmAtendimento:tbvAtendimento:dataA_input', value: '10/11/2026 08:00' });
  docListeners['atendeai:crm-set-date']({ detail: null });
  assert.equal(input.value, '10/11/2026 08:00');
});
