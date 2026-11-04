const sqlite3 = require('sqlite3');
const db = require('../database');
const KG_TO_LBS = 2.20462;
const storedWeight = (weight, unit) => unit === 'kg' ? weight * KG_TO_LBS : weight;
const displayWeight = (weight, unit) => unit === 'kg' ? weight / KG_TO_LBS : weight;
async function userUnit(userId, connection = db) {
  return (await getRow(connection, 'SELECT weight_unit FROM users WHERE id = ?', [userId]))?.weight_unit || 'lbs';
}
async function requireActive(connection, workoutId, userId) {
  const workout = await findOwnWorkout(workoutId, userId, connection);
  if (!workout) throw notFoundError('Workout not found.');
  if (workout.end_time !== null) throw Object.assign(new Error('This workout has already been finished.'), { status: 400 });
  return workout;
}

function runSql(connection, sql, params = []) {
  return new Promise((resolve, reject) => {
    connection.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

let pendingWrite = Promise.resolve();

function transaction(work) {
  const next = pendingWrite.then(() => runTransaction(work));
  pendingWrite = next.catch(() => {});
  return next;
}

async function runTransaction(work) {
  const connection = await new Promise((resolve, reject) => {
    const opened = new sqlite3.Database(db.filename, err =>
      err ? reject(err) : resolve(opened)
    );
  });

  connection.configure('busyTimeout', 5000);
  let begun = false;

  try {
    await runSql(connection, 'PRAGMA foreign_keys = ON');
    await runSql(connection, 'BEGIN IMMEDIATE');
    begun = true;

    const result = await work(connection);

    await runSql(connection, 'COMMIT');
    begun = false;
    return result;
  } catch (err) {
    if (begun) 
      await runSql(connection, 'ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await new Promise((resolve, reject) => {
      connection.close(err => err ? reject(err) : resolve());
    });
  }
}

function getRow(connection, sql, params = []) {
  return new Promise((resolve, reject) => {
    connection.get(sql, params, (err, row) =>
      err ? reject(err) : resolve(row || null)
    );
  });
}

function getAll(connection, sql, params = []) {
  return new Promise((resolve, reject) => {
    connection.all(sql, params, (err, rows) =>
      err ? reject(err) : resolve(rows || [])
    );
  });
}

function notFoundError(message) {
  const err = new Error(message);
  err.status = 404;
  return err;
}

function create(userId, routineId = null) {
  return transaction(async connection => {
    if (routineId !== null) {
      const routine = await getRow(
        connection,
        'SELECT id FROM routines WHERE id = ? AND user_id = ?',
        [routineId, userId]
      );

      if (!routine) throw notFoundError('Routine not found.');
    }

    const startTime = new Date().toISOString();
    const result = await runSql(
      connection,
      `INSERT INTO workouts (user_id, routine_id, start_time, weight_unit)
       VALUES (?, ?, ?, 'lbs')`,
      [userId, routineId, startTime]
    );

    return {
      id: result.lastID,
      routine_id: routineId,
      start_time: startTime,
      end_time: null,
      notes: null
    };
  });
}

async function findOwnWorkout(workoutId, userId, connection = db) {
  return getRow(
    connection,
    'SELECT id, end_time, weight_unit FROM workouts WHERE id = ? AND user_id = ?',
    [workoutId, userId]
  );
}

function addSet(workoutId, userId, data) {
  return transaction(async connection => {
    const active = await requireActive(connection, workoutId, userId);
    if (!active.weight_unit) throw Object.assign(new Error('Confirm the original weight unit before editing this older workout.'), { status: 409 });
    const unit = data.weightUnit || await userUnit(userId, connection);
    const removed = await getRow(connection, 'SELECT 1 FROM workout_removed_exercises WHERE workout_id = ? AND exercise_id = ?', [workoutId, data.exerciseId]);
    if (removed && !data.readd) throw Object.assign(new Error('This exercise was removed. Add it again from the exercise picker.'), { status: 409 });
    if (data.readd) await runSql(connection, 'DELETE FROM workout_removed_exercises WHERE workout_id = ? AND exercise_id = ?', [workoutId, data.exerciseId]);

    const exercise = await getRow(
      connection,
      'SELECT id FROM exercises WHERE id = ?',
      [data.exerciseId]
    );

    if (!exercise) {
      const err = new Error('Exercise not found.');
      err.status = 400;
      throw err;
    }

    const result = await runSql(
      connection,
      `INSERT INTO workout_sets
       (workout_id, exercise_id, set_number, weight, reps, completed)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        workoutId,
        data.exerciseId,
        data.setNumber,
        storedWeight(data.weight, unit),
        data.reps,
        data.completed ? 1 : 0
      ]
    );

    return {
      id: result.lastID,
      workout_id: workoutId,
      exercise_id: data.exerciseId,
      set_number: data.setNumber,
      weight: data.weight,
      reps: data.reps,
      completed: data.completed
    };
  });
}

function updateSet(workoutId, userId, setId, data) {
  return transaction(async connection => {
    const active = await requireActive(connection, workoutId, userId);
    if (!active.weight_unit) throw Object.assign(new Error('Confirm the original weight unit before editing this older workout.'), { status: 409 });
    const unit = data.weightUnit || await userUnit(userId, connection);

    const existingSet = await getRow(
      connection,
      `SELECT id, workout_id, exercise_id, set_number
       FROM workout_sets
       WHERE id = ? AND workout_id = ?`,
      [setId, workoutId]
    );

    if (!existingSet) throw notFoundError('Workout set not found.');

    await runSql(
      connection,
      `UPDATE workout_sets
       SET weight = ?, reps = ?, completed = ?
       WHERE id = ? AND workout_id = ?`,
      [storedWeight(data.weight, unit), data.reps, data.completed ? 1 : 0, setId, workoutId]
    );

    return {
      ...existingSet,
      weight: data.weight,
      reps: data.reps,
      completed: data.completed
    };
  });
}

async function listHistory(userId) {
  return getAll(
    db,
    `SELECT
       workouts.id,
       workouts.routine_id,
       workouts.start_time,
       workouts.end_time,
       workouts.notes,
       COUNT(workout_sets.id) AS total_sets
     FROM workouts
     LEFT JOIN workout_sets
       ON workouts.id = workout_sets.workout_id
     WHERE workouts.user_id = ?
     GROUP BY workouts.id
     ORDER BY workouts.start_time DESC`,
    [userId]
  );
}

function finishWorkout(workoutId, userId) {
  return transaction(async connection => {
    const workout = await findOwnWorkout(workoutId, userId, connection);

    if (!workout) throw notFoundError('Workout not found.');
    if (workout.end_time !== null) {
      const err = new Error('This workout has already been finished.');
      err.status = 400;
      throw err;
    }

    // Only sets the user marked done are kept. Unchecked rows are placeholders
    // the page created from the routine's targets, not lifts that happened, so
    // they must not count in history or progress.
    const removed = await runSql(
      connection,
      'DELETE FROM workout_sets WHERE workout_id = ? AND completed = 0',
      [workoutId]
    );

    const endTime = new Date().toISOString();
    await runSql(
      connection,
      `UPDATE workouts
       SET end_time = ?
       WHERE id = ? AND user_id = ?`,
      [endTime, workoutId, userId]
    );

    return { id: workoutId, end_time: endTime, removed_sets: removed.changes };
  });
}

async function getWorkoutDetails(workoutId, userId) {
  const workout = await getRow(
    db,
    `SELECT id, routine_id, start_time, end_time, notes, weight_unit
     FROM workouts
     WHERE id = ? AND user_id = ?`,
    [workoutId, userId]
  );

  if (!workout) return null;

  const rows = await getAll(
    db,
    `SELECT
       workout_sets.id,
       workout_sets.exercise_id,
       exercises.name AS exercise_name,
       workout_sets.set_number,
       workout_sets.weight,
       workout_sets.reps,
       workout_sets.completed
     FROM workout_sets
     JOIN exercises ON workout_sets.exercise_id = exercises.id
     WHERE workout_sets.workout_id = ?
     ORDER BY workout_sets.exercise_id, workout_sets.set_number`,
    [workoutId]
  );

  const unit = await userUnit(userId);
  const sets = rows.map(set => ({
    ...set,
    weight: workout.weight_unit ? displayWeight(set.weight, unit) : set.weight,
    completed: Boolean(set.completed)
  }));

  const removed = await getAll(db, 'SELECT exercise_id FROM workout_removed_exercises WHERE workout_id = ?', [workoutId]);
  return { ...workout, display_unit: workout.weight_unit ? unit : null, removed_exercise_ids: removed.map(row => row.exercise_id), sets };
}

// Load only the signed-in user's finished sessions, including their logged sets.
// Details/notes remain available through the existing owner-checked detail route.
async function completedHistory(userId) {
  const workouts = await getAll(db,
    `SELECT w.id, w.routine_id, w.start_time, w.end_time, w.weight_unit, r.name AS routine_name
     FROM workouts w LEFT JOIN routines r ON w.routine_id = r.id
     WHERE w.user_id = ? AND w.end_time IS NOT NULL
     ORDER BY datetime(w.start_time) DESC, w.id DESC`, [userId]);
  const sets = await getAll(db,
    `SELECT s.workout_id, s.exercise_id, e.name AS exercise_name,
            s.set_number, s.weight, s.reps
     FROM workout_sets s JOIN workouts w ON s.workout_id = w.id
     JOIN exercises e ON s.exercise_id = e.id
     WHERE w.user_id = ? AND w.end_time IS NOT NULL AND s.completed = 1
     ORDER BY s.id`, [userId]);
  const grouped = new Map(workouts.map(w => [w.id, { ...w, sets: [] }]));
  const unit = await userUnit(userId);
  for (const set of sets) {
    const workout = grouped.get(set.workout_id);
    if (workout) workout.sets.push({ ...set, weight: workout.weight_unit ? displayWeight(set.weight, unit) : set.weight });
  }
  return [...grouped.values()];
}

function updateNotes(workoutId, userId, notes) {
  return transaction(async connection => {
    await requireActive(connection, workoutId, userId);
    await runSql(connection, 'UPDATE workouts SET notes = ? WHERE id = ? AND user_id = ?', [notes, workoutId, userId]);
    return { notes };
  });
}

function removeExercise(workoutId, userId, exerciseId) {
  return transaction(async connection => {
    await requireActive(connection, workoutId, userId);
    const result = await runSql(connection, 'DELETE FROM workout_sets WHERE workout_id = ? AND exercise_id = ?', [workoutId, exerciseId]);
    if (!result.changes) throw notFoundError('Exercise not found in this workout.');
    await runSql(connection, 'INSERT OR IGNORE INTO workout_removed_exercises(workout_id,exercise_id) VALUES(?,?)', [workoutId, exerciseId]);
    return { removed_sets: result.changes };
  });
}

function confirmWeightUnit(workoutId, userId, unit) {
  return transaction(async connection => {
    const workout = await findOwnWorkout(workoutId, userId, connection);
    if (!workout) throw notFoundError('Workout not found.');
    if (workout.weight_unit) throw Object.assign(new Error('The original unit has already been confirmed.'), { status: 409 });
    if (unit === 'kg') await runSql(connection, 'UPDATE workout_sets SET weight = weight * ? WHERE workout_id = ?', [KG_TO_LBS, workoutId]);
    await runSql(connection, "UPDATE workouts SET weight_unit = 'lbs' WHERE id = ? AND user_id = ?", [workoutId, userId]);
    return { message: 'Original unit confirmed.' };
  });
}

module.exports = {create, addSet, updateSet, listHistory, finishWorkout, getWorkoutDetails, completedHistory, updateNotes, removeExercise, confirmWeightUnit};
