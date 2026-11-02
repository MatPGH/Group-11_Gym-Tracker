const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Small DOM adapter for exercising real row events and the async finish flow.
// No browser, database, or user account is changed by these tests.
function setup() {
  const elements = [];
  function element() {
    const item = { value: '', checked: false, disabled: false, textContent: '', attributes: {}, children: [], listeners: {}, style: {},
      classList: { add() {}, toggle() {} },
      append(...nodes) { this.children.push(...nodes); },
      setAttribute(k, v) { this.attributes[k] = v; }, removeAttribute(k) { delete this.attributes[k]; },
      addEventListener(name, action) { (this.listeners[name] ||= []).push(action); },
      focus() { this.focused = true; },
      showModal() { this.open = true; }, close() { this.open = false; (this.listeners.close || []).forEach(fn => fn()); }
    };
    elements.push(item); return item;
  }
  const ids = new Map();
  const get = selector => { if (!ids.has(selector)) ids.set(selector, element()); return ids.get(selector); };
  const requests = [];
  let rejectSave = false;
  const context = vm.createContext({
    console, Map, Set, Number, JSON, Promise,
    document: { querySelector: get, querySelectorAll: () => [], createElement: element },
    window: { addEventListener() {}, confirm() { throw new Error('Native browser dialog must not be used'); } },
    sessionStorage: { removeItem() {} }, clearWorkoutDraft() {}, location: { href: '' },
    gymApi: async (url, options) => {
      if (url === '/profile') return new Promise(() => {}); // initialization is separate from this test
      requests.push({ url, options });
      if (options.method === 'PUT') {
        if (rejectSave) throw new Error('Connection interrupted');
        return { set: { id: 1, ...JSON.parse(options.body) } };
      }
      return { workout: { id: 1, end_time: new Date().toISOString() } };
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/active-workout.js'), 'utf8'), context);
  vm.runInContext(`workoutId = 1; workoutDetails = { sets: [] }; createSetRow({id:1, set_number:1, weight:135, reps:8, completed:true});`, context);
  const input = label => elements.find(el => el.attributes['aria-label'] === label);
  const edit = (label, value) => { const el = input(label); el.value = value; (el.listeners.input || []).forEach(fn => fn()); return el; };
  return { run: code => vm.runInContext(code, context), get, edit, requests, context, rejectSave: value => { rejectSave = value; } };
}
test('zero/blank repetitions and blank weight cannot open finish confirmation', async () => {
  for (const [label, value] of [['Set 1 reps', '0'], ['Set 1 reps', ''], ['Set 1 weight', '']]) {
    const app = setup(), input = app.edit(label, value);
    await app.run('finishWorkout()');
    assert.equal(app.get('#finish-dialog').open, undefined);
    assert.ok(input.focused);
    assert.equal(app.requests.length, 0);
  }
});
test('latest edits save before the app dialog; only confirming redirects to Progress', async () => {
  const app = setup(); app.edit('Set 1 reps', '6');
  await app.run('finishWorkout()');
  assert.equal(app.get('#finish-dialog').open, true);
  assert.equal(app.requests.length, 1);
  assert.equal(JSON.parse(app.requests[0].options.body).reps, 6);
  assert.equal(app.context.location.href, '');
  await app.run('confirmFinishWorkout()');
  assert.equal(app.requests[1].url, '/workouts/1/finish');
  assert.equal(app.context.location.href, 'progress.html');
  await app.run('confirmFinishWorkout()');
  assert.equal(app.requests.length, 2, 'double confirmation cannot finish twice');
});
test('a failed set save blocks finishing and retry preserves the edited value', async () => {
  const app = setup(); app.edit('Set 1 weight', '185'); app.rejectSave(true);
  await app.run('finishWorkout()');
  assert.equal(app.get('#finish-dialog').open, undefined);
  assert.match(app.get('#workout-error').textContent, /Could not save/);
  assert.ok(!app.requests.some(r => r.url.endsWith('/finish')));
  app.rejectSave(false); await app.run('finishWorkout()');
  assert.equal(app.get('#finish-dialog').open, true);
  assert.equal(JSON.parse(app.requests[1].options.body).weight, 185);
});
test('cancel keeps the workout open without submitting Finish', async () => {
  const app = setup(); await app.run('finishWorkout()');
  app.get('#cancel-finish').listeners.click[0]();
  assert.equal(app.get('#finish-dialog').open, false);
  assert.equal(app.requests.length, 0);
  assert.equal(app.context.location.href, '');
});
