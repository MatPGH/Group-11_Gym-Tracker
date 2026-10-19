// SQLite persistence for personal routines. Each write owns its connection so
// concurrent requests cannot join or roll back another request's transaction.
const sqlite3 = require('sqlite3');
const db = require('../database');

function runSql(connection, sql, params = []) {
  return new Promise((resolve, reject) => {
    connection.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getExercises(routineId, connection = db) {
  return new Promise((resolve, reject) => {
    connection.all(
      `SELECT re.exercise_id, e.name, re.target_sets, re.target_reps, re.exercise_order
       FROM routine_exercises re JOIN exercises e ON re.exercise_id = e.id
       WHERE re.routine_id = ? ORDER BY re.exercise_order`,
      [routineId], (err, rows) => err ? reject(err) : resolve(rows)
    );
  });
}

async function listByUser(userId) {
  const rows = await new Promise((resolve, reject) => {
    db.all(
      'SELECT id, user_id AS userId, name, description FROM routines WHERE user_id = ? ORDER BY id DESC',
      [userId], (err, rows) => err ? reject(err) : resolve(rows)
    );
  });
  return Promise.all(rows.map(async routine => ({
    ...routine, exercises: await getExercises(routine.id)
  })));
}

async function findById(routineId, connection = db) {
  const routine = await new Promise((resolve, reject) => {
    connection.get(
      'SELECT id, user_id AS userId, name, description FROM routines WHERE id = ?',
      [routineId], (err, row) => err ? reject(err) : resolve(row)
    );
  });
  return routine ? { ...routine, exercises: await getExercises(routineId, connection) } : null;
}

// Queue routine writes to avoid blocking SQLite's worker pool on competing locks.
let pendingWrite = Promise.resolve();
function transaction(work) {
  const next = pendingWrite.then(() => runTransaction(work));
  pendingWrite = next.catch(() => {});
  return next;
}

async function runTransaction(work) {
  const connection = await new Promise((resolve, reject) => {
    const opened = new sqlite3.Database(db.filename, err => err ? reject(err) : resolve(opened));
  });
  connection.configure('busyTimeout', 5000);
  let begun = false;
  try {
    await runSql(connection, 'PRAGMA foreign_keys = ON');
    // Acquire the write lock before reading, avoiding deferred lock upgrades.
    await runSql(connection, 'BEGIN IMMEDIATE');
    begun = true;
    const result = await work(connection);
    await runSql(connection, 'COMMIT');
    begun = false;
    return result;
  } catch (err) {
    if (begun) await runSql(connection, 'ROLLBACK').catch(() => {});
    if (err.message.includes('FOREIGN KEY constraint failed')) {
      err.status = 400;
      err.message = "One of the exercises doesn't exist.";
    }
    throw err;
  } finally {
    await new Promise((resolve, reject) => connection.close(err => err ? reject(err) : resolve()));
  }
}

async function insertExercises(connection, routineId, exercises) {
  for (const exercise of exercises) {
    await runSql(connection,
      `INSERT INTO routine_exercises
       (routine_id, exercise_id, target_sets, target_reps, exercise_order)
       VALUES (?, ?, ?, ?, ?)`,
      [routineId, exercise.exerciseId, exercise.targetSets, exercise.targetReps, exercise.order]
    );
  }
}

function create(userId, data) {
  return transaction(async connection => {
    const result = await runSql(connection,
      'INSERT INTO routines (user_id, name, description) VALUES (?, ?, ?)',
      [userId, data.name, data.description]);
    await insertExercises(connection, result.lastID, data.exercises);
    return findById(result.lastID, connection);
  });
}

function update(routineId, data) {
  return transaction(async connection => {
    const existing = await findById(routineId, connection);
    if (!existing) {
      const err = new Error('Routine not found.');
      err.status = 404;
      throw err;
    }
    await runSql(connection, 'UPDATE routines SET name = ?, description = ? WHERE id = ?',
      [data.name, data.description, routineId]);
    await runSql(connection, 'DELETE FROM routine_exercises WHERE routine_id = ?', [routineId]);
    await insertExercises(connection, routineId, data.exercises);
    return findById(routineId, connection);
  });
}

function remove(routineId) {
  return transaction(async connection => {
    // Historical workouts and their sets survive deletion of their template.
    await runSql(connection, 'UPDATE workouts SET routine_id = NULL WHERE routine_id = ?', [routineId]);
    await runSql(connection, 'DELETE FROM routine_exercises WHERE routine_id = ?', [routineId]);
    await runSql(connection, 'DELETE FROM routines WHERE id = ?', [routineId]);
  });
}

module.exports = { listByUser, findById, create, update, remove };
