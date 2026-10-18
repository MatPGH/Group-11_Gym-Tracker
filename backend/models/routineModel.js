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

function notConnectedYet() {
  const err = new Error("Routines aren't saved to the database yet (waiting on the SQLite routine card).");
  err.status = 501;
  return Promise.reject(err);
}

// All of one user's routines, newest first. Return [] if they have none.
function listByUser(userId) {
  return notConnectedYet();
}

// One routine by id (any owner), or null if it doesn't exist.
// The controller compares routine.userId with the signed-in user.
function findById(routineId) {
  return notConnectedYet();
}

// Insert the routine and its exercises, then return the saved routine.
// If an exerciseId doesn't exist in the exercises table, throw an error
// with err.status = 400 and a message like "One of the exercises doesn't exist."
function create(userId, data) {
  return notConnectedYet();
}

// Replace the routine's name, description, and full exercise list
// (simplest: delete its routine_exercises rows and insert the new ones),
// then return the saved routine. Same 400 rule for unknown exercises.
function update(routineId, data) {
  return notConnectedYet();
}

// Delete the routine and its routine_exercises rows.
// FR-08: past workouts must stay saved. workouts.routine_id points at the
// routine, so first run: UPDATE workouts SET routine_id = NULL WHERE routine_id = ?
// (otherwise the foreign key blocks the delete).
function remove(routineId) {
  return notConnectedYet();
}

module.exports = { listByUser, findById, create, update, remove };
