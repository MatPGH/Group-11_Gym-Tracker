const sqlite3 = require('sqlite3');
const db = require('../database');

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
    if (begun) {
      await runSql(connection, 'ROLLBACK').catch(() => {});
    }
    throw err;
  } finally {
    await new Promise((resolve, reject) => {
      connection.close(err => err ? reject(err) : resolve());
    });
  }
}

function create(userId, routineId = null) {
  return transaction(async connection => {
    if (routineId !== null) {
      const routine = await new Promise((resolve, reject) => {
        connection.get(
          'SELECT id FROM routines WHERE id = ? AND user_id = ?',
          [routineId, userId],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });

      if (!routine) {
        const err = new Error('Routine not found.');
        err.status = 404;
        throw err;
      }
    }

    const startTime = new Date().toISOString();

    const result = await runSql(
      connection,
      `INSERT INTO workouts (user_id, routine_id, start_time)
       VALUES (?, ?, ?)`,
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
  return new Promise((resolve, reject) => {
    connection.get(
      'SELECT id, end_time FROM workouts WHERE id = ? AND user_id = ?',
      [workoutId, userId],
      (err, row) => err ? reject(err) : resolve(row || null)
    );
  });
}

function addSet(workoutId, userId, data) {
  return transaction(async connection => {
    const workout = await findOwnWorkout(workoutId, userId, connection);

    if (!workout) {
      const err = new Error('Workout not found.');
      err.status = 404;
      throw err;
    }

    if (workout.end_time !== null) {
      const err = new Error('This workout has already been finished.');
      err.status = 400;
      throw err;
    }

    const exercise = await new Promise((resolve, reject) => {
      connection.get(
        'SELECT id FROM exercises WHERE id = ?',
        [data.exerciseId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });

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
        data.weight,
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
async function listHistory(userId) {
  return new Promise((resolve, reject) => {
    db.all(
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
      [userId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

function finishWorkout(workoutId, userId) {
  return transaction(async connection => {
    const workout = await findOwnWorkout(workoutId, userId, connection);

    if (!workout) {
      const err = new Error('Workout not found.');
      err.status = 404;
      throw err;
    }

    if (workout.end_time !== null) {
      const err = new Error('This workout has already been finished.');
      err.status = 400;
      throw err;
    }

    const endTime = new Date().toISOString();

    await runSql(
      connection,
      `UPDATE workouts
       SET end_time = ?
       WHERE id = ? AND user_id = ?`,
      [endTime, workoutId, userId]
    );

    return {
      id: workoutId,
      end_time: endTime
    };
  });
}

async function getWorkoutDetails(workoutId, userId) {
  const workout = await new Promise((resolve, reject) => {
    db.get(
      `SELECT id, routine_id, start_time, end_time, notes
       FROM workouts
       WHERE id = ? AND user_id = ?`,
      [workoutId, userId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      }
    );
  });

  if (!workout) {
    return null;
  }

  const sets = await new Promise((resolve, reject) => {
    db.all(
      `SELECT
         workout_sets.id,
         workout_sets.exercise_id,
         exercises.name AS exercise_name,
         workout_sets.set_number,
         workout_sets.weight,
         workout_sets.reps,
         workout_sets.completed
       FROM workout_sets
       JOIN exercises
         ON workout_sets.exercise_id = exercises.id
       WHERE workout_sets.workout_id = ?
       ORDER BY workout_sets.id`,
      [workoutId],
      (err, rows) => {
       if (err) reject(err);
       else {
          resolve(rows.map(set => ({
            ...set,
            completed: Boolean(set.completed)
          })));
        }
      }
    );
  });

  return { ...workout, sets };
}

module.exports = { create, addSet, listHistory, finishWorkout, getWorkoutDetails };