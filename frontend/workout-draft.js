'use strict';
// Temporary, per-tab handoff only. Completed workouts must be saved by the backend.
const WORKOUT_DRAFT_KEY = 'gymTracker.workoutDraft';
function createWorkoutDraft(userId, mode, name, routineId, exercises) {
  if (!Number.isSafeInteger(userId) || userId < 1 || !['routine', 'custom', 'empty'].includes(mode)) {
    throw new Error('Choose a valid workout.');
  }
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
    throw new Error('Use a workout name of 1–100 characters.');
  }
  if (!Array.isArray(exercises) || exercises.length > 30 ||
      (mode === 'empty' ? exercises.length !== 0 : exercises.length === 0) ||
      (mode === 'routine' ? !Number.isSafeInteger(routineId) || routineId < 1 : routineId !== null)) {
    throw new Error('Choose a valid workout and exercise list.');
  }
  const normalized = exercises.map((exercise, index) => {
    if (!exercise || !Number.isSafeInteger(exercise.exercise_id) || exercise.exercise_id < 1 ||
        typeof exercise.name !== 'string' || !exercise.name.trim() ||
        !Number.isInteger(exercise.target_sets) || exercise.target_sets < 1 || exercise.target_sets > 100 ||
        !Number.isInteger(exercise.target_reps) || exercise.target_reps < 1 || exercise.target_reps > 1000) {
      throw new Error('An exercise has invalid targets. Choose the workout again.');
    }
    return { exercise_id: exercise.exercise_id, name: exercise.name,
      target_sets: exercise.target_sets, target_reps: exercise.target_reps, exercise_order: index + 1 };
  });
  return { version: 1, userId, mode, name: name.trim(), routineId, exercises: normalized };
}
function saveWorkoutDraft(draft) {
  const checked = createWorkoutDraft(draft.userId, draft.mode, draft.name, draft.routineId, draft.exercises);
  try { sessionStorage.setItem(WORKOUT_DRAFT_KEY, JSON.stringify(checked)); }
  catch { throw new Error('Your browser could not keep this selection. Allow site storage and try again.'); }
}
function readWorkoutDraft(userId) {
  try {
    const draft = JSON.parse(sessionStorage.getItem(WORKOUT_DRAFT_KEY));
    if (!draft) return null;
    if (draft.version !== 1 || draft.userId !== userId) throw new Error('Stale selection');
    return createWorkoutDraft(userId, draft.mode, draft.name, draft.routineId, draft.exercises);
  } catch {
    clearWorkoutDraft();
    return null;
  }
}
function clearWorkoutDraft() {
  try { sessionStorage.removeItem(WORKOUT_DRAFT_KEY); } catch { /* Storage may be blocked. */ }
}
function renderWorkoutExercises(container, exercises) {
  container.replaceChildren();
  for (const exercise of exercises) {
    const item = document.createElement('li');
    item.textContent = exercise.name;
    const targets = document.createElement('span');
    targets.textContent = exercise.target_sets + ' sets × ' + exercise.target_reps + ' reps';
    item.append(targets);
    container.append(item);
  }
}
function wireWorkoutLogout(status) {
  document.querySelectorAll('[data-logout]').forEach(button => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await gymApi('/auth/logout', { method: 'POST', body: '{}' });
        clearWorkoutDraft();
        location.replace('login.html');
      } catch (error) { status.textContent = error.message; button.disabled = false; }
    });
  });
  // Revalidate authentication before revealing a page restored from browser history.
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createWorkoutDraft, saveWorkoutDraft, readWorkoutDraft, clearWorkoutDraft };
}
