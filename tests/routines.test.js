// Tests for the routine controller (FR-06 to FR-08, FR-17, FR-18).
// Uses a pretend in-memory routine model, so it checks the rules in the
// controller without needing the database. Run with: npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Swap in a fake routine model before the controller loads it.
const store = [];
let nextId = 1;
const calls = [];
const fakeModel = {
  async listByUser(userId) { return store.filter(r => r.userId === userId); },
  async findById(id) { return store.find(r => r.id === id) || null; },
  async create(userId, data) {
    calls.push(['create', userId, data]);
    const routine = { id: nextId++, userId, ...data };
    store.push(routine);
    return routine;
  },
  async update(id, data) {
    calls.push(['update', id, data]);
    const routine = store.find(r => r.id === id);
    Object.assign(routine, data);
    return routine;
  },
  async remove(id) {
    calls.push(['remove', id]);
    store.splice(store.findIndex(r => r.id === id), 1);
  }
};
const modelPath = require.resolve(path.join(__dirname, '../backend/models/routineModel'));
require.cache[modelPath] = { id: modelPath, filename: modelPath, loaded: true, exports: fakeModel };
const routines = require('../backend/controllers/routineController');

// Calls a controller function with a pretend request and returns { status, body }.
function call(handler, { userId, body, id } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(data) { resolve({ status: this.statusCode, body: data }); return this; }
    };
    const req = { session: { userId }, body, params: { id: id === undefined ? undefined : String(id) } };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

const valid = {
  name: '  Upper Body  ',
  description: ' Chest and back ',
  exercises: [
    { exercise_id: 1, target_sets: 3, target_reps: 10, exercise_order: 1 },
    { exerciseId: '5', targetSets: '4', targetReps: '12' }
  ]
};
const ALICE = 1;
const BOB = 2;

test('input checks reject bad routines (FR-18)', () => {
  const bad = [
    {},
    { ...valid, name: '   ' },
    { ...valid, name: 'x'.repeat(101) },
    { ...valid, description: 42 },
    { ...valid, description: 'x'.repeat(256) },
    { ...valid, exercises: [] },
    { ...valid, exercises: 'bench' },
    { ...valid, exercises: Array(31).fill(valid.exercises[0]) },
    { ...valid, exercises: [{ exercise_id: '', target_sets: 3, target_reps: 10 }] },
    { ...valid, exercises: [{ exercise_id: 1, target_sets: 0, target_reps: 10 }] },
    { ...valid, exercises: [{ exercise_id: 1, target_sets: 101, target_reps: 10 }] },
    { ...valid, exercises: [{ exercise_id: 1, target_sets: 2.5, target_reps: 10 }] },
    { ...valid, exercises: [{ exercise_id: 1, target_sets: 3, target_reps: -5 }] },
    { ...valid, exercises: [{ exercise_id: 1, target_sets: 3, target_reps: 1001 }] },
    { ...valid, exercises: [null] }
  ];
  for (const body of bad) {
    assert.ok(routines.readRoutineInput(body).error, `should reject ${JSON.stringify(body).slice(0, 80)}`);
  }
  assert.ok(routines.readRoutineInput(undefined).error);
});

test('input is cleaned and accepts both snake_case and camelCase names', () => {
  const { data, error } = routines.readRoutineInput(valid);
  assert.equal(error, undefined);
  assert.deepEqual(data, {
    name: 'Upper Body',
    description: 'Chest and back',
    exercises: [
      { exerciseId: 1, targetSets: 3, targetReps: 10, order: 1 },
      { exerciseId: 5, targetSets: 4, targetReps: 12, order: 2 }
    ]
  });
  assert.equal(routines.readRoutineInput({ ...valid, description: undefined }).data.description, '');
});

test('create saves for the signed-in user only, ignoring any userId in the body (FR-06)', async () => {
  const r = await call(routines.createRoutine, { userId: ALICE, body: { ...valid, userId: BOB } });
  assert.equal(r.status, 201);
  assert.equal(r.body.routine.name, 'Upper Body');
  assert.equal(r.body.routine.userId, undefined, 'userId is never sent to the browser');
  assert.equal(calls.at(-1)[1], ALICE);

  const badRequest = await call(routines.createRoutine, { userId: ALICE, body: { name: 'No exercises' } });
  assert.equal(badRequest.status, 400);
  assert.match(badRequest.body.error, /at least one exercise/);
});

test('list only shows your own routines (FR-17)', async () => {
  await call(routines.createRoutine, { userId: BOB, body: { ...valid, name: 'Bob legs' } });
  const alice = await call(routines.listRoutines, { userId: ALICE });
  assert.equal(alice.status, 200);
  assert.deepEqual(alice.body.routines.map(r => r.name), ['Upper Body']);
  const bob = await call(routines.listRoutines, { userId: BOB });
  assert.deepEqual(bob.body.routines.map(r => r.name), ['Bob legs']);
});

test('edit works on your own routine and is blocked on anyone else\'s (FR-07, FR-17)', async () => {
  const aliceRoutineId = 1;
  const bobRoutineId = 2;
  const ok = await call(routines.updateRoutine, { userId: ALICE, id: aliceRoutineId, body: { ...valid, name: 'Push Day' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.routine.name, 'Push Day');

  for (const id of [bobRoutineId, 999, 'abc', 0, -1]) {
    const blocked = await call(routines.updateRoutine, { userId: ALICE, id, body: valid });
    assert.equal(blocked.status, 404, `id ${id}`);
  }
  assert.equal(store.find(r => r.id === bobRoutineId).name, 'Bob legs', "Bob's routine is unchanged");

  const invalid = await call(routines.updateRoutine, { userId: ALICE, id: aliceRoutineId, body: { ...valid, name: '' } });
  assert.equal(invalid.status, 400);
});

test('delete works on your own routine and is blocked on anyone else\'s (FR-08, FR-17)', async () => {
  const blocked = await call(routines.deleteRoutine, { userId: ALICE, id: 2 });
  assert.equal(blocked.status, 404);
  assert.ok(store.some(r => r.id === 2), "Bob's routine still exists");

  const ok = await call(routines.deleteRoutine, { userId: ALICE, id: 1 });
  assert.equal(ok.status, 200);
  assert.deepEqual(calls.at(-1), ['remove', 1]);
  assert.equal((await call(routines.listRoutines, { userId: ALICE })).body.routines.length, 0);
});
