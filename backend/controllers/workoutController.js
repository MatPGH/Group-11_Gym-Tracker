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

// POST /api/workouts/:id/sets
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
    const completed = input.completed === undefined ? false : input.completed;
    if (input.readd !== undefined && typeof input.readd !== 'boolean') return res.status(400).json({ error: 'Choose a valid exercise action.' });
    if (input.weightUnit !== undefined && !['lbs', 'kg'].includes(input.weightUnit)) return res.status(400).json({ error: 'Choose pounds or kilograms.' });

    if (!Number.isSafeInteger(exerciseId) || exerciseId < 1) {
      return res.status(400).json({ error: 'Choose a valid exercise.' });
    }
    if (!Number.isSafeInteger(setNumber) || setNumber < 1) {
      return res.status(400).json({ error: 'Set number must be a positive whole number.' });
    }
    if (input.weight === '' || input.weight === null || !Number.isFinite(weight * 2.20462) || weight < 0) {
      return res.status(400).json({ error: 'Weight must be a non-negative number.' });
    }
    if (!Number.isSafeInteger(reps) || reps < 1) {
      return res.status(400).json({ error: 'Reps must be a positive whole number.' });
    }
    if (typeof completed !== 'boolean') {
      return res.status(400).json({ error: 'Completed must be true or false.' });
    }

    const set = await workoutModel.addSet(workoutId, req.session.userId, {
      exerciseId, setNumber, weight, reps, completed, weightUnit: input.weightUnit, readd: input.readd
    });

    return res.status(201).json({ set });
  } catch (err) {
    return next(err);
  }
}

// PUT /api/workouts/:id/sets/:setId
async function updateSet(req, res, next) {
  try {
    const workoutId = Number(req.params.id);
    const setId = Number(req.params.setId);
    const input = req.body || {};
    const weight = Number(input.weight);
    const reps = Number(input.reps);
    const completed = input.completed;
    if (input.weightUnit !== undefined && !['lbs', 'kg'].includes(input.weightUnit)) return res.status(400).json({ error: 'Choose pounds or kilograms.' });

    if (!Number.isSafeInteger(workoutId) || workoutId < 1 ||
        !Number.isSafeInteger(setId) || setId < 1) {
      return res.status(404).json({ error: 'Workout set not found.' });
    }
    if (input.weight === '' || input.weight === null || !Number.isFinite(weight * 2.20462) || weight < 0) {
      return res.status(400).json({ error: 'Weight must be a non-negative number.' });
    }
    if (!Number.isSafeInteger(reps) || reps < 1) {
      return res.status(400).json({ error: 'Reps must be a positive whole number.' });
    }
    if (typeof completed !== 'boolean') {
      return res.status(400).json({ error: 'Completed must be true or false.' });
    }

    const set = await workoutModel.updateSet(workoutId, req.session.userId, setId, {
      weight, reps, completed, weightUnit: input.weightUnit
    });

    return res.status(200).json({ set });
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

    const workout = await workoutModel.finishWorkout(workoutId, req.session.userId);
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

    const workout = await workoutModel.getWorkoutDetails(workoutId, req.session.userId);

    if (!workout) {
      return res.status(404).json({ error: 'Workout not found.' });
    }

    return res.status(200).json({ workout });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  async updateNotes(req, res, next) {
    try {
      const id = Number(req.params.id), notes = req.body?.notes;
      if (!Number.isSafeInteger(id) || id < 1) return res.status(404).json({ error: 'Workout not found.' });
      if (typeof notes !== 'string' || notes.length > 2000) return res.status(400).json({ error: 'Notes must contain at most 2,000 characters.' });
      res.json(await workoutModel.updateNotes(id, req.session.userId, notes.trim()));
    } catch (error) { next(error); }
  },
  async removeExercise(req, res, next) {
    try {
      const id = Number(req.params.id), exerciseId = Number(req.params.exerciseId);
      if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(exerciseId) || exerciseId < 1) return res.status(404).json({ error: 'Workout exercise not found.' });
      res.json(await workoutModel.removeExercise(id, req.session.userId, exerciseId));
    } catch (error) { next(error); }
  },
  async confirmWeightUnit(req, res, next) {
    try {
      const id = Number(req.params.id), unit = req.body?.weightUnit;
      if (!Number.isSafeInteger(id) || id < 1) return res.status(404).json({ error: 'Workout not found.' });
      if (!['lbs', 'kg'].includes(unit)) return res.status(400).json({ error: 'Choose the unit originally used for this workout.' });
      res.json(await workoutModel.confirmWeightUnit(id, req.session.userId, unit));
    } catch (error) { next(error); }
  },
  async completedHistory(req, res, next) {
    try {
      res.json({ workouts: await workoutModel.completedHistory(req.session.userId) });
    } catch (err) { next(err); }
  },
  startWorkout,
  addSet,
  updateSet,
  listHistory,
  finishWorkout,
  getWorkoutDetails
};

