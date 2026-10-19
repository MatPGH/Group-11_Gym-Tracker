// Routine model: the SQLite code for routines lives here (the "M" in MVC).
// Trello card: "Make routines save, edit, and delete in SQLite - Taylor"
//
// The routes and controller (Wasif's card) are finished and call the five
// functions below. Each one currently answers "501 not connected yet". Replace
// the body of each function with the real SQL; nothing else needs to change.
//
// Data the controller passes in (already checked and cleaned):
//   userId       number, the signed-in user (req.session.userId)
//   routineId    number
//   data = {
//     name:        string, 1-100 characters
//     description: string, may be ''
//     exercises:   [{ exerciseId, targetSets, targetReps, order }]   (1 or more, order starts at 1)
//   }
//
// Each routine you return should look like this (Laura's page reads these names):
//   {
//     id, userId, name, description,
//     exercises: [{ exercise_id, name, target_sets, target_reps, exercise_order }]
//   }
//   - exercises sorted by exercise_order; `name` comes from the exercises table
//   - userId is used for the owner check and is never sent to the browser
//
// Tables: routines (id, user_id, name, description) and
//         routine_exercises (routine_id, exercise_id, target_sets, target_reps, exercise_order)
const db = require('../database');

function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve({
          lastID: this.lastID,
          changes: this.changes
        });
      }
    });
  });
}

function getExercises(routineId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT re.exercise_id, e.name, re.target_sets, re.target_reps, re.exercise_order
       FROM routine_exercises re
       JOIN exercises e ON re.exercise_id = e.id
       WHERE re.routine_id = ?
       ORDER BY re.exercise_order`,
      [routineId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }  
    );
  });
}

// All of one user's routines, newest first. Return [] if they have none.
function listByUser(userId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, user_id AS userId, name, description
       FROM routines
       WHERE user_id = ?
       ORDER BY id DESC`,
      [userId],
      async (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        try {
          const routines = await Promise.all(
            rows.map(async (routine) => {
              routine.exercises = await getExercises(routine.id);
              return routine;
            })
          );

          resolve(routines);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

// One routine by id (any owner), or null if it doesn't exist.
// The controller compares routine.userId with the signed-in user.
function findById(routineId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, user_id AS userId, name, description
       FROM routines
       WHERE id = ?`,
      [routineId],
      async (err, routine) => {
        if (err) {
          reject(err);
          return;
        }

        if (!routine) {
          resolve(null);
          return;
        }

        try {
          routine.exercises = await getExercises(routine.id);
          resolve(routine);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

// Insert the routine and its exercises, then return the saved routine.
// If an exerciseId doesn't exist in the exercises table, throw an error
// with err.status = 400 and a message like "One of the exercises doesn't exist."
async function create(userId, data) {
  await runSql('BEGIN TRANSACTION');

  try {
    const result = await runSql(
      'INSERT INTO routines (user_id, name, description) VALUES (?, ?, ?)',
      [userId, data.name, data.description]
    );

    const routineId = result.lastID;

    for (const exercise of data.exercises) {
      await runSql(
        `INSERT INTO routine_exercises
         (routine_id, exercise_id, target_sets, target_reps, exercise_order)
         VALUES (?, ?, ?, ?, ?)`,
        [
          routineId,
          exercise.exerciseId,
          exercise.targetSets,
          exercise.targetReps,
          exercise.order
        ]
      );
    }

    await runSql('COMMIT');

    return await findById(routineId);
  } catch (err) {
    await runSql('ROLLBACK').catch(() => {});

    if (err.message.includes('FOREIGN KEY constraint failed')) {
      err.status = 400;
      err.message = "One of the exercises doesn't exist.";
    }

    throw err;
  }
}

// Replace the routine's name, description, and full exercise list
// (simplest: delete its routine_exercises rows and insert the new ones),
// then return the saved routine. Same 400 rule for unknown exercises.
async function update(routineId, data) {
  await runSql('BEGIN TRANSACTION');

  try {
    const routine = await findById(routineId);
    if (!routine) {
      throw new Error('Routine not found.');
    }
    
    await runSql(
      'UPDATE routines SET name = ?, description = ? WHERE id = ?',
      [data.name, data.description, routineId]
    );

    await runSql(
      'DELETE FROM routine_exercises WHERE routine_id = ?',
      [routineId]
    );

    for (const exercise of data.exercises) {
      await runSql(
        `INSERT INTO routine_exercises
         (routine_id, exercise_id, target_sets, target_reps, exercise_order)
         VALUES (?, ?, ?, ?, ?)`,
        [
          routineId,
          exercise.exerciseId,
          exercise.targetSets,
          exercise.targetReps,
          exercise.order
        ]
      );
    }

    await runSql('COMMIT');

    return await findById(routineId);
  } catch (err) {
    await runSql('ROLLBACK').catch(() => {});

    if (err.message.includes('FOREIGN KEY constraint failed')) {
      err.status = 400;
      err.message = "One of the exercises doesn't exist.";
    }

    throw err;
  }
}

// Delete the routine and its routine_exercises rows.
// FR-08: past workouts must stay saved. workouts.routine_id points at the
// routine, so first run: UPDATE workouts SET routine_id = NULL WHERE routine_id = ?
// (otherwise the foreign key blocks the delete).
async function remove(routineId) {
  await runSql('BEGIN TRANSACTION');

  try {
    await runSql(
      'UPDATE workouts SET routine_id = NULL WHERE routine_id = ?',
      [routineId]
    );

    await runSql(
      'DELETE FROM routine_exercises WHERE routine_id = ?',
      [routineId]
    );

    await runSql(
      'DELETE FROM routines WHERE id = ?',
      [routineId]
    );

    await runSql('COMMIT');
  } catch (err) {
    await runSql('ROLLBACK').catch(() => {});
    throw err;
  }
}

module.exports = { listByUser, findById, create, update, remove };
