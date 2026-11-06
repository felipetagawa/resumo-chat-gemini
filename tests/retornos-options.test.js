const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { el, createDocument, collect } = require('./mini-dom');

function load(seed = { atendeai_user_sector: 'suporte' }) {
  const store = seed;
  const listeners = [];
  const chrome = { runtime: {}, storage: {
    local: {
      get(keys, cb) { const out = {}; (Array.isArray(keys) ? keys : [keys]).forEach((k) => { if (k in store) out[k] = JSON.parse(JSON.stringify(store[k])); }); cb(out); },
      set(data, cb) {
        const changes = {}; Object.keys(data).forEach((k) => { changes[k] = { newValue: data[k] }; });
        Object.assign(store, JSON.parse(JSON.stringify(data)));
        listeners.forEach((fn) => fn(changes, 'local')); cb?.();
      }
    },
    onChanged: { addListener: (fn) => listeners.push(fn), removeListener() {} }
  } };
  const doc = createDocument();
  const ids = {};
  const mk = (tag, id, props = {}) => { const n = el(tag, { id, ...props }); ids[id] = n; return n; };
  const card = mk('div', 'retornosCard');
  card.hidden = true;
  const enabled = mk('input', 'retornosEnabled', { type: 'checkbox' }); enabled.checked = true;
  [card, enabled, mk('div', 'retornosShortcuts'), mk('button', 'retornosShortcutAdd'), mk('button', 'retornosShortcutReset'),
    mk('input', 'retornosDiagOn', { type: 'checkbox' }), mk('button', 'retornosDiagCopy'), mk('button', 'retornosDiagClear'), mk('div', 'retornosDiagStatus')]
    .forEach((n) => doc.body.appendChild(n));
  const context = { window: {}, document: doc, Date, Math, JSON, console, setTimeout, clearTimeout, chrome, navigator: {} };
  vm.createContext(context);
  ['retornos-schedule', 'retornos-store', 'retornos-diagnostic', 'retornos-options'].forEach((n) =>
    vm.runInContext(fs.readFileSync(`modules/${n}.js`, 'utf8'), context));
  return { O: context.RetornosOptions, R: context.window.RetornosStore, doc, ids, store };
}

const settle = () => new Promise((r) => setTimeout(r, 20));
const rows = (ids) => ids.retornosShortcuts.children;
const rowTimes = (ids) => [...rows(ids)].map((r) => collect(r).find((n) => n.getAttribute('data-role') === 'time').value);

test('the section is visible only for Suporte', async () => {
  const sup = load();
  await sup.O.init(sup.doc);
  assert.equal(sup.ids.retornosCard.hidden, false);
  const pre = load({ atendeai_user_sector: 'preatendimento' });
  await pre.O.init(pre.doc);
  assert.equal(pre.ids.retornosCard.hidden, true);
});

test('the on/off switch starts on and saves the choice', async () => {
  const { O, R, doc, ids } = load();
  await O.init(doc);
  assert.equal(ids.retornosEnabled.checked, true);
  ids.retornosEnabled.checked = false;
  ids.retornosEnabled.fire('change');
  await settle();
  assert.equal((await R.getSettings()).enabled, false);
  assert.equal(await R.isActive(), false);
});

test('shortcuts show the three defaults and can be edited, added, removed and restored', async () => {
  const { O, R, doc, ids } = load();
  await O.init(doc);
  assert.equal(rows(ids).length, 3);
  assert.deepEqual(rowTimes(ids), ['08:00', '14:00', '08:00']);

  const time = collect(rows(ids)[0]).find((n) => n.getAttribute('data-role') === 'time');
  time.value = '09:15';
  time.fire('change');
  await settle();
  assert.equal((await R.getSettings()).shortcuts[0].time, '09:15');

  ids.retornosShortcutAdd.click();
  await settle();
  assert.equal(rows(ids).length, 4);
  assert.equal((await R.getSettings()).shortcuts.length, 4);

  collect(rows(ids)[1]).find((n) => n.getAttribute('data-role') === 'remove').click();
  await settle();
  assert.equal(rows(ids).length, 3);
  assert.equal((await R.getSettings()).shortcuts.length, 3);

  ids.retornosShortcutReset.click();
  await settle();
  assert.deepEqual(rowTimes(ids), ['08:00', '14:00', '08:00']);
  assert.equal((await R.getSettings()).shortcuts.length, 3);
});

test('the day picker offers tomorrow, the day after and every weekday', async () => {
  const { O, doc, ids } = load();
  await O.init(doc);
  const select = collect(rows(ids)[0]).find((n) => n.getAttribute('data-role') === 'day');
  const values = select.children.map((o) => o.getAttribute('value'));
  assert.deepEqual(values, ['amanha', 'depois', 'dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']);
});

test('diagnostic toggle writes the flag, and copy/clear work on the log', async () => {
  const { O, doc, ids, store } = load();
  await O.init(doc);
  ids.retornosDiagOn.checked = true;
  ids.retornosDiagOn.fire('change');
  await settle();
  assert.equal(store.atendeai_retornos_diag_on, true);
  ids.retornosDiagClear.click();
  await settle();
  assert.deepEqual(store.atendeai_retornos_diag_log, []);
});

test('manifest: 1.8.0, still only the storage permission, every listed file exists, and load order is safe', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.equal(manifest.version, '1.8.0');
  assert.deepEqual(manifest.permissions, ['storage']);
  for (const entry of manifest.content_scripts) {
    for (const file of [...(entry.js || []), ...(entry.css || [])]) assert.ok(fs.existsSync(path.join(process.cwd(), file)), file);
    const js = entry.js || [];
    const at = (name) => js.indexOf(`modules/${name}.js`);
    if (at('retornos-store') >= 0) {
      assert.ok(at('retornos-schedule') >= 0 && at('retornos-schedule') < at('retornos-store'), 'schedule before store');
      ['retornos-list', 'retornos-alert', 'retornos-strip', 'retornos-capture', 'retornos-crm-line', 'retornos-chat-notice'].forEach((name) => {
        if (at(name) >= 0) assert.ok(at(name) > at('retornos-store'), `${name} after store`);
      });
    }
  }
  const strip = manifest.content_scripts.find((e) => (e.js || []).includes('modules/retornos-strip.js'));
  assert.ok(strip.matches.includes('https://www.sistemaempresarialweb.com.br/crm-chamado-por-tecnico*'));
  assert.ok(strip.matches.includes('https://sistemaempresarialweb.com.br/crm-chamado-por-tecnico*'));
  assert.ok(strip.css.includes('styles/tokens.css') && strip.css.includes('styles/retornos.css'));
});

test('options page loads the retornos modules before options.js and announces 1.8.0 in the changelog', () => {
  const html = fs.readFileSync('options.html', 'utf8');
  const order = ['retornos-schedule.js', 'retornos-store.js', 'retornos-diagnostic.js', 'retornos-options.js', 'options.js'].map((f) => html.indexOf(`src="${f.startsWith('options') ? '' : 'modules/'}${f}"`));
  assert.ok(order.every((i) => i >= 0));
  assert.deepEqual([...order], [...order].sort((a, b) => a - b));
  assert.match(html, /Retornos automáticos[\s\S]{0,400}guardo o retorno/);
  const log = html.slice(html.indexOf('changelog-static'));
  assert.match(log, /<strong class="app-version">v1\.8\.0<\/strong>/);
  assert.match(log, /Retornos automáticos: agende no CRM e o AtendeAI guarda, avisa na hora e abre o atendimento com um clique/);
  assert.equal((log.match(/changelog-badge">Atual/g) || []).length, 1);
});
