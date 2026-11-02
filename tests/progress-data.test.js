const { test } = require('node:test');
const assert = require('node:assert/strict');
const { select } = require('../frontend/progress-data');
const now = new Date('2026-11-02T18:00:00Z');
function workout(id, start, sets, end = '2026-11-02T18:00:00Z') {
  return { id, start_time: start, end_time: end, sets: sets.map(([exercise_id, weight]) => ({ exercise_id, weight })) };
}
test('history is newest first, plots oldest first, and averages sets rather than session averages', () => {
  const data = [workout(1, '2026-10-31T12:00:00Z', [[1, 100], [1, 120]]), workout(2, '2026-11-01T12:00:00Z', [[1, 200], [2, 300]])];
  const result = select(data, '1', '30', now);
  assert.deepEqual(result.workouts.map(w => w.id), [2, 1]);
  assert.deepEqual(result.points.map(p => p.weight), [120, 200]);
  assert.equal(result.max, 200);
  assert.equal(result.average, 140);
  assert.equal(data[1].sets.length, 2, 'filtering does not mutate source data');
});
test('seven-day filter includes UTC boundary and excludes old, future, and unfinished sessions', () => {
  const result = select([
    workout(1, '2026-10-27T00:00:00Z', [[1, 100]]),
    workout(2, '2026-10-26T23:59:59Z', [[1, 200]]),
    workout(3, '2026-11-03T00:00:00Z', [[1, 300]]),
    workout(4, '2026-11-02T00:00:00Z', [[1, 400]], null)
  ], 'all', '7', now);
  assert.deepEqual(result.workouts.map(w => w.id), [1]);
});
test('empty sessions remain in all-exercise history but do not invent chart points or zero averages', () => {
  const data = [workout(1, '2026-11-01T00:00:00Z', [])];
  const result = select(data, 'all', 'all', now);
  assert.equal(result.workouts.length, 1);
  assert.deepEqual(result.points, []);
  assert.equal(result.max, null);
  assert.equal(result.average, null);
  assert.equal(select(data, '1', 'all', now).workouts.length, 0);
});
test('zero-weight bodyweight sets are valid data, and tied dates sort consistently by ID', () => {
  const result = select([workout(1, '2026-11-01T00:00:00Z', [[1, 0]]), workout(2, '2026-11-01T00:00:00Z', [[1, 0]])], 'all', 'all', now);
  assert.deepEqual(result.workouts.map(w => w.id), [2, 1]);
  assert.equal(result.max, 0); assert.equal(result.average, 0);
});
