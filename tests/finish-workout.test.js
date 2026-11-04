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
      focus() { this.focused = true; }, querySelectorAll() { return []; },
      showModal() { this.open = true; }, close() { this.open = false; (this.listeners.close || []).forEach(fn => fn()); }
    };
    elements.push(item); return item;
  }
  const ids = new Map();
  const get = selector => { if (!ids.has(selector)) ids.set(selector, element()); return ids.get(selector); };
  const requests = [];
  let rejectSave = false;
  let rejectNotes = false;
  const context = vm.createContext({
    console, Map, Set, Number, JSON, Promise,
    document: { querySelector: get, querySelectorAll: () => [], createElement: element },
    window: { addEventListener() {}, confirm() { throw new Error('Native browser dialog must not be used'); } },
    sessionStorage: { removeItem() {}, setItem() {} }, clearWorkoutDraft() {}, location: { href: '' },
    createWorkoutDraft: require('../frontend/workout-draft').createWorkoutDraft,
    gymApi: async (url, options) => {
      if (url === '/profile') return new Promise(() => {}); // initialization is separate from this test
      requests.push({ url, options });
      if (url.endsWith('/notes')) {
        if (rejectNotes) throw new Error('Notes connection interrupted');
        return { notes: JSON.parse(options.body).notes.trim() };
      }
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
  return { run: code => vm.runInContext(code, context), get, edit, requests, context, rejectSave: value => { rejectSave = value; }, rejectNotes: value => { rejectNotes = value; } };
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

test('session notes save before Finish opens, and a failed save blocks Finish until retry', async () => {
  const app = setup();
  app.get('#workout-notes').value = ' Felt strong today ';
  app.rejectNotes(true);
  await app.run('finishWorkout()');
  assert.equal(app.get('#finish-dialog').open, undefined);
  assert.equal(app.get('#workout-notes').value, ' Felt strong today ');
  assert.match(app.get('#notes-status').textContent, /Could not save notes/);
  assert.equal(app.get('#workout-notes').disabled, false);
  app.rejectNotes(false); await app.run('finishWorkout()');
  assert.equal(app.get('#workout-notes').value, 'Felt strong today');
  assert.equal(app.get('#finish-dialog').open, true);
  assert.ok(app.requests.every(request => request.url.endsWith('/notes')));
});

test('removal discards invalid inputs in the removed exercise and preserves edits in other exercises', async () => {
  const app = setup();
  app.run(`currentUser={id:1,weightUnit:'lbs'};
    workoutDraft=createWorkoutDraft(1,'custom','Today',null,[1,2].map(id=>({exercise_id:id,name:'Exercise '+id,target_sets:1,target_reps:8})));
    workoutDetails={sets:[{id:1,exercise_id:1},{id:2,exercise_id:2}]};
    setSavers.clear();
    createSetRow({id:1,exercise_id:1,set_number:1,weight:100,reps:8,completed:true});
    createSetRow({id:2,exercise_id:2,set_number:2,weight:200,reps:8,completed:true});
    exerciseToRemove=workoutDraft.exercises[0]; renderWorkout=()=>{};`);
  app.edit('Set 2 weight', '205');
  // Set 1 in this helper's initial row is unrelated; mark the actual removal row invalid.
  app.run("[...setSavers.values()].find(s=>s.exerciseId===1).validate=()=>{throw new Error('Removed exercise must not be validated');}");
  await app.get('#confirm-remove-exercise').listeners.click[0]();
  assert.equal(app.requests[0].options.method, 'PUT');
  assert.equal(JSON.parse(app.requests[0].options.body).weight, 205);
  assert.equal(app.requests[1].options.method, 'DELETE');
  assert.equal(app.requests[1].url, '/workouts/1/exercises/1');
  assert.equal(app.run('workoutDraft.exercises.length'), 1);
  assert.equal(app.run('workoutDetails.sets[0].exercise_id'), 2);
});

test('canceling exercise removal makes no request', () => {
  const app = setup(); app.get('#remove-exercise-dialog').showModal();
  app.get('#cancel-remove-exercise').listeners.click[0]();
  assert.equal(app.get('#remove-exercise-dialog').open, false);
  assert.equal(app.requests.length, 0);
});

test('editing reps preserves the full precision of converted workout weights', async () => {
  const app = setup();
  app.run("currentUser={id:1,weightUnit:'kg'}; setSavers.clear(); createSetRow({id:3,exercise_id:1,set_number:3,weight:100/2.20462,reps:8,completed:true});");
  app.edit('Set 3 reps', '9');
  await app.run('saveVisibleSets()');
  assert.equal(JSON.parse(app.requests[0].options.body).weight, 100/2.20462);
  assert.equal(JSON.parse(app.requests[0].options.body).weightUnit, 'kg');
});

test('refresh recovery excludes removed exercises and preserves the routine association when adding logged exercises', () => {
  const app = setup();
  app.run(`currentUser={id:1,weightUnit:'lbs'};
    workoutDraft=createWorkoutDraft(1,'routine','Plan',7,[{exercise_id:1,name:'Bench',target_sets:3,target_reps:8}]);
    workoutDetails={removed_exercise_ids:[1],sets:[]}; applyRemovedExercises();`);
  assert.equal(app.run('workoutDraft.exercises.length'), 0);
  assert.equal(app.run('workoutDraft.routineId'), 7);
  app.run("workoutDetails.sets=[{exercise_id:2,exercise_name:'Squat'}]; includeLoggedExercises();");
  assert.equal(app.run('workoutDraft.exercises[0].exercise_id'), 2);
  assert.equal(app.run('workoutDraft.mode'), 'routine');
  assert.equal(app.run('workoutDraft.routineId'), 7);
});
