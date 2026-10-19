// Routine controller: list, create, edit, and delete routines (FR-06 to FR-08).
// Trello card: "Connect Routine pages to the backend - Wasif"
//
// Every route requires sign-in (see routineRoutes.js). This file checks the
// input (FR-18) and makes sure people only see or change their own routines
// (FR-17). The actual saving is done by models/routineModel.js.
const routineModel = require('../models/routineModel');

// Limits match the form on Laura's Routines page.
const LIMITS = {
  nameLength: 100,
  descriptionLength: 255,
  maxExercises: 30,
  sets: { min: 1, max: 100 },
  reps: { min: 1, max: 1000 }
};

function isWholeNumberBetween(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

// Turns the request body into clean data, or returns { error } explaining what's wrong.
// Accepts the snake_case names Laura's page sends (exercise_id, target_sets,
// target_reps) and camelCase (exerciseId, targetSets, targetReps).
function readRoutineInput(body) {
  const input = body || {};
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) return { error: 'Enter a routine name.' };
  if (name.length > LIMITS.nameLength) {
    return { error: `Routine name must be ${LIMITS.nameLength} characters or fewer.` };
  }

  let description = '';
  if (input.description !== undefined && input.description !== null) {
    if (typeof input.description !== 'string') return { error: 'Description must be text.' };
    description = input.description.trim();
    if (description.length > LIMITS.descriptionLength) {
      return { error: `Description must be ${LIMITS.descriptionLength} characters or fewer.` };
    }
  }

  if (!Array.isArray(input.exercises) || input.exercises.length === 0) {
    return { error: 'Add at least one exercise.' };
  }
  if (input.exercises.length > LIMITS.maxExercises) {
    return { error: `A routine can have at most ${LIMITS.maxExercises} exercises.` };
  }

  const exercises = [];
  for (let i = 0; i < input.exercises.length; i++) {
    const item = input.exercises[i] || {};
    const exerciseId = Number(item.exercise_id ?? item.exerciseId);
    const targetSets = Number(item.target_sets ?? item.targetSets);
    const targetReps = Number(item.target_reps ?? item.targetReps);
    const position = `Exercise ${i + 1}`;

    if (!isWholeNumberBetween(exerciseId, 1, Number.MAX_SAFE_INTEGER)) {
      return { error: `${position}: choose an exercise from the list.` };
    }
    if (!isWholeNumberBetween(targetSets, LIMITS.sets.min, LIMITS.sets.max)) {
      return { error: `${position}: sets must be a whole number from ${LIMITS.sets.min} to ${LIMITS.sets.max}.` };
    }
    if (!isWholeNumberBetween(targetReps, LIMITS.reps.min, LIMITS.reps.max)) {
      return { error: `${position}: reps must be a whole number from ${LIMITS.reps.min} to ${LIMITS.reps.max}.` };
    }
    // Order comes from the position in the list, so it is always 1, 2, 3...
    exercises.push({ exerciseId, targetSets, targetReps, order: i + 1 });
  }

  return { data: { name, description, exercises } };
}

// What the browser gets back (no userId).
function publicRoutine(routine) {
  return {
    id: routine.id,
    name: routine.name,
    description: routine.description || '',
    exercises: routine.exercises || []
  };
}

// Loads the routine from the URL and checks it belongs to the signed-in user.
// Someone else's routine gets the same 404 as a missing one, so nobody can
// find out which routine ids exist (FR-17).
async function findOwnRoutine(req, res) {
  const routineId = Number(req.params.id);
  if (!Number.isInteger(routineId) || routineId < 1) {
    res.status(404).json({ error: 'Routine not found.' });
    return null;
  }
  const routine = await routineModel.findById(routineId);
  if (!routine || routine.userId !== req.session.userId) {
    res.status(404).json({ error: 'Routine not found.' });
    return null;
  }
  return routine;
}

// GET /api/routines  ->  { routines: [...] }
async function listRoutines(req, res) {
  const routines = await routineModel.listByUser(req.session.userId);
  res.json({ routines: routines.map(publicRoutine) });
}

// POST /api/routines  (FR-06)  ->  201 { routine }
async function createRoutine(req, res) {
  const { data, error } = readRoutineInput(req.body);
  if (error) return res.status(400).json({ error });

  const routine = await routineModel.create(req.session.userId, data);
  return res.status(201).json({ routine: publicRoutine(routine) });
}

// PUT /api/routines/:id  (FR-07)  ->  { routine }
async function updateRoutine(req, res) {
  const existing = await findOwnRoutine(req, res);
  if (!existing) return undefined;

  const { data, error } = readRoutineInput(req.body);
  if (error) return res.status(400).json({ error });

  const routine = await routineModel.update(existing.id, data);
  return res.json({ routine: publicRoutine(routine) });
}

// DELETE /api/routines/:id  (FR-08)  ->  { message }
// The page asks "Are you sure?" before calling this. Past workouts stay saved.
async function deleteRoutine(req, res) {
  const existing = await findOwnRoutine(req, res);
  if (!existing) return undefined;

  await routineModel.remove(existing.id);
  return res.json({ message: 'Routine deleted.' });
}

module.exports = { listRoutines, createRoutine, updateRoutine, deleteRoutine, readRoutineInput, LIMITS };
