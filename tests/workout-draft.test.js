const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorkoutDraft, saveWorkoutDraft, readWorkoutDraft, clearWorkoutDraft } = require('../frontend/workout-draft');
const values = new Map();
global.sessionStorage = {
  setItem(key, value) { values.set(key, value); },
  getItem(key) { return values.get(key) ?? null; },
  removeItem(key) { values.delete(key); }
};
const exercises = [
  { exercise_id: 2, name: 'Squat', target_sets: 4, target_reps: 6, exercise_order: 9 },
  { exercise_id: 1, name: 'Bench', target_sets: 3, target_reps: 10, exercise_order: 4 }
];
test('routine selection carries ordered targets without changing the saved routine', () => {
  const original = structuredClone(exercises);
  const draft = createWorkoutDraft(1, 'routine', '  Strength  ', 7, exercises);
  assert.equal(draft.name, 'Strength');
  assert.equal(draft.routineId, 7);
  assert.deepEqual(draft.exercises.map(e => [e.exercise_id, e.target_sets, e.target_reps, e.exercise_order]), [[2,4,6,1],[1,3,10,2]]);
  assert.deepEqual(exercises, original);
  draft.exercises[0].target_reps = 9;
  assert.equal(exercises[0].target_reps, 6);
});
test('custom and empty choices remain separate from reusable routines', () => {
  assert.equal(createWorkoutDraft(1, 'custom', 'Today', null, exercises).routineId, null);
  assert.deepEqual(createWorkoutDraft(1, 'empty', 'Empty workout', null, []).exercises, []);
  for (const args of [[1,'custom','Today',null,[]],[1,'routine','Plan',null,exercises],[1,'empty','Blank',7,[]],[1,'empty','Blank',null,exercises]]) {
    assert.throws(() => createWorkoutDraft(...args));
  }
});
test('a new choice replaces the old draft and belongs only to its signed-in user', () => {
  saveWorkoutDraft(createWorkoutDraft(1, 'routine', 'Plan', 7, exercises));
  assert.equal(readWorkoutDraft(1).routineId, 7);
  saveWorkoutDraft(createWorkoutDraft(1, 'empty', 'Blank', null, []));
  assert.equal(readWorkoutDraft(1).mode, 'empty');
  assert.equal(readWorkoutDraft(2), null);
  assert.equal(readWorkoutDraft(1), null, 'another-account draft is removed');
});
test('invalid or outdated stored drafts are discarded', () => {
  const key = 'gymTracker.workoutDraft';
  for (const text of ['invalid JSON', JSON.stringify({version:2,userId:1}), JSON.stringify({...createWorkoutDraft(1,'routine','Plan',7,exercises),exercises:[{exercise_id:-1}]})]) {
    values.set(key, text);
    assert.equal(readWorkoutDraft(1), null);
    assert.equal(values.has(key), false);
  }
});
test('invalid targets cannot enter the handoff and storage failure is actionable', () => {
  for (const invalid of [{...exercises[0], target_sets:0},{...exercises[0], target_reps:1.5},{...exercises[0],exercise_id:true}]) {
    assert.throws(() => createWorkoutDraft(1,'custom','Today',null,[invalid]));
  }
  assert.throws(() => createWorkoutDraft(1,'custom','x'.repeat(101),null,exercises));
  assert.throws(() => createWorkoutDraft(1,'custom','Today',null,Array(31).fill(exercises[0])));
  const original = global.sessionStorage;
  global.sessionStorage = { setItem() { throw new Error('Blocked'); }, getItem() {throw new Error('Blocked');},removeItem(){throw new Error('Blocked');} };
  assert.throws(() => saveWorkoutDraft(createWorkoutDraft(1,'empty','Blank',null,[])), /Allow site storage/);
  assert.equal(readWorkoutDraft(1), null);
  clearWorkoutDraft();
  global.sessionStorage = original;
});
