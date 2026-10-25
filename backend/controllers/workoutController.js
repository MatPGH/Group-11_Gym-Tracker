
const workoutModel = require('../models/workoutModel');

// POST /api/workouts
async function startWorkout(req, res, next) {
  try {
    let routineId = null;

    if (req.body && req.body.routine_id !== undefined &&
        req.body.routine_id !== null && req.body.routine_id !== '') {
      routineId = Number(req.body.routine_id);

      if (!Number.isSafeInteger(routineId) || routineId < 1) {
        return res.status(400).json({ error: 'Choose a valid routine.' });
      }
    }

    const workout = await workoutModel.create(req.session.userId, routineId);

    return res.status(201).json({ workout });
  } catch (err) {
    return next(err);
  }
}

async function addSet(req, res, next) {
  try {
    const workoutId = Number(req.params.id);
    const input = req.body || {};

    if (!Number.isSafeInteger(workoutId) || workoutId < 1) {
      return res.status(404).json({ error: 'Workout not found.' });
    }

    const exerciseId = Number(input.exercise_id);
    const setNumber = Number(input.set_number);
    const weight = Number(input.weight);
    const reps = Number(input.reps);
    const completed = input.completed === undefined ? true : input.completed;

    if (!Number.isSafeInteger(exerciseId) || exerciseId < 1) {
      return res.status(400).json({ error: 'Choose a valid exercise.' });
    }

    if (!Number.isSafeInteger(setNumber) || setNumber < 1) {
      return res.status(400).json({ error: 'Set number must be a positive whole number.' });
    }

    if (!Number.isFinite(weight) || weight < 0) {
      return res.status(400).json({ error: 'Weight must be a non-negative number.' });
    }

    if (!Number.isSafeInteger(reps) || reps < 1) {
      return res.status(400).json({ error: 'Reps must be a positive whole number.' });
    }

    if (typeof completed !== 'boolean') {
      return res.status(400).json({ error: 'Completed must be true or false.' });
    }

    const set = await workoutModel.addSet(
      workoutId,
      req.session.userId,
      { exerciseId, setNumber, weight, reps, completed }
    );

    return res.status(201).json({ set });
  } catch (err) {
    return next(err);
  }
}
// GET /api/workouts
async function listHistory(req, res, next) {
  try {
    const workouts = await workoutModel.listHistory(req.session.userId);

    return res.status(200).json({ workouts });
  } catch (err) {
    return next(err);
  }
}

// POST /api/workouts/:id/finish
async function finishWorkout(req, res, next) {
  try {
    const workoutId = Number(req.params.id);

    if (!Number.isSafeInteger(workoutId) || workoutId < 1) {
      return res.status(404).json({ error: 'Workout not found.' });
    }

    const workout = await workoutModel.finishWorkout(
      workoutId,
      req.session.userId
    );

    return res.status(200).json({ workout });
  } catch (err) {
    return next(err);
  }
}

// GET /api/workouts/:id
async function getWorkoutDetails(req, res, next) {
  try {
    const workoutId = Number(req.params.id);

    if (!Number.isSafeInteger(workoutId) || workoutId < 1) {
      return res.status(404).json({ error: 'Workout not found.' });
    }

    const workout = await workoutModel.getWorkoutDetails(
      workoutId,
      req.session.userId
    );

    if (!workout) {
      return res.status(404).json({ error: 'Workout not found.' });
    }

    return res.status(200).json({ workout });
  } catch (err) {
    return next(err);
  }
}

module.exports = { startWorkout, addSet, listHistory, finishWorkout, getWorkoutDetails };
