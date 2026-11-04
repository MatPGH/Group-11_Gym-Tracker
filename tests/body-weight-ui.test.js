const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup(api) {
  const elements = new Map();
  const controls = [{ disabled: false }, { disabled: false }];
  const element = () => ({ value: '', hidden: false, listeners: {}, children: [],
    addEventListener(name, fn) { this.listeners[name] = fn; },
    setAttribute() {}, append(...nodes) { this.children.push(...nodes); },
    replaceChildren() { this.children = []; }, focus() {},
    querySelectorAll() { return controls; },
    showModal() { this.open = true; }, close() { this.open = false; },
    reset() { get('#body-weight-input').value = ''; get('#body-weight-date').value = ''; }
  });
  const get = selector => { if (!elements.has(selector)) elements.set(selector, element()); return elements.get(selector); };
  const requests = [];
  const context = vm.createContext({ console, Intl, Map, Number, Date, JSON,
    document: { querySelector: get, createElement: element }, window: { addEventListener() {} },
    gymApi: async (route, options) => {
      if (route === '/profile') return new Promise(() => {});
      requests.push({ route, options }); return api(route, options);
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/progress.js'), 'utf8'), context);
  get('#body-weight-input').value = '180'; get('#body-weight-date').value = '2026-11-04';
  return { get, controls, requests, run: code => vm.runInContext(code, context), submit: () => get('#body-weight-form').listeners.submit({ preventDefault() {} }) };
}

test('a failed weight save preserves inputs and allows a successful retry', async () => {
  let fail = true;
  const app = setup(async (route, options) => {
    if (options?.method === 'POST' && fail) throw new Error('Connection failed');
    return { entries: [] };
  });
  await app.submit();
  assert.equal(app.get('#body-weight-input').value, '180');
  assert.ok(app.controls.every(control => !control.disabled));
  assert.match(app.get('#body-weight-status').textContent, /Connection failed/);
  fail = false; await app.submit();
  assert.equal(app.get('#body-weight-input').value, '');
  assert.equal(app.requests.filter(r => r.options?.method === 'POST').length, 2);
});

test('a saved entry with a failed history refresh reports success and clears the form', async () => {
  const app = setup(async (route, options) => {
    if (!options) throw new Error('History unavailable');
    return { entry: { id: 1 } };
  });
  await app.submit();
  assert.match(app.get('#body-weight-status').textContent, /Weight saved.*Refresh/);
  assert.equal(app.get('#body-weight-input').value, '');
  assert.equal(app.requests.filter(r => r.options?.method === 'POST').length, 1);
});

test('editing only the date preserves the unrounded converted weight; cancel sends no write', async () => {
  const app = setup(async () => ({ entries: [] }));
  app.run("bodyWeightEntries = [{id:1,date:'2026-10-10',weight:180/2.20462}]; renderBodyWeightHistory();");
  const edit = app.get('#body-weight-rows').children[0].children[2].children[0];
  edit.listeners.click();
  app.get('#cancel-weight-edit').listeners.click();
  assert.equal(app.requests.length, 0);
  edit.listeners.click();
  app.get('#body-weight-date').value = '2026-10-11';
  await app.submit();
  assert.equal(app.requests[0].options.method, 'PUT');
  assert.equal(JSON.parse(app.requests[0].options.body).weight, 180/2.20462);
});

test('repeated delete confirmation while pending sends one request', () => {
  const app = setup(async () => new Promise(() => {}));
  app.run('deletingWeightId = 1');
  const confirm = app.get('#confirm-delete-weight').listeners.click;
  confirm(); confirm();
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].options.method, 'DELETE');
});
