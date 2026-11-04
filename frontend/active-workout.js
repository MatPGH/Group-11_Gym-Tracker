'use strict';

const ACTIVE_WORKOUT_KEY = 'gymTracker.activeWorkout';
const pageStatus = document.querySelector('#page-status');
const pageError = document.querySelector('#workout-error');
const workoutContent = document.querySelector('#workout-content');
const exerciseContainer = document.querySelector('#active-exercises');
const finishButton = document.querySelector('#finish-workout');
const emptyWorkoutBuilder = document.querySelector('#empty-workout-builder');
const emptyExerciseSelect = document.querySelector('#empty-exercise-select');
const addEmptyExerciseButton = document.querySelector('#add-empty-exercise');
const finishDialog = document.querySelector('#finish-dialog');
const setSavers = new Map();
const notesInput = document.querySelector('#workout-notes');
const removeDialog = document.querySelector('#remove-exercise-dialog');
let savedNotes = '', notesSave = null, exerciseToRemove = null, removingExercise = false;

// Exercises added to an empty workout start with one set of 10 reps.
const EMPTY_WORKOUT_START = { targetSets: 1, targetReps: 10 };

let exerciseCatalog = [];

let currentUser = null;
let workoutId = null;
let workoutDraft = null;
let workoutDetails = null;
let pendingSaves = 0;
let finishing = false;
let preparingFinish = false;
let addingSet = false; // stops a double tap on "+ Add Set" from saving two copies

function setPageError(message) {
  pageError.textContent = message || '';
}

// After the list is redrawn, put keyboard focus on the new set's weight box so
// keyboard and screen reader users don't lose their place.
function focusSetWeight(exerciseId, setNumber) {
  const input = exerciseContainer.querySelector(
    `[data-exercise-id="${exerciseId}"] input[aria-label="Set ${setNumber} weight"]`
  );
  if (input) input.focus();
}

function saveActiveSession() {
  try {
    sessionStorage.setItem(ACTIVE_WORKOUT_KEY, JSON.stringify({
      version: 1,
      userId: currentUser.id,
      workoutId,
      draft: workoutDraft
    }));
    return true;
  } catch {
    setPageError('Your workout is active, but this browser could not save its refresh recovery information. Keep this tab open until you finish.');
    return false;
  }
}

function readActiveSession(userId) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(ACTIVE_WORKOUT_KEY));
    if (!saved || saved.version !== 1 || saved.userId !== userId ||
        !Number.isSafeInteger(saved.workoutId) || saved.workoutId < 1) {
      return null;
    }

    const draft = createWorkoutDraft(
      userId,
      saved.draft.mode,
      saved.draft.name,
      saved.draft.routineId,
      saved.draft.exercises,
      true
    );

    return { workoutId: saved.workoutId, draft };
  } catch {
    sessionStorage.removeItem(ACTIVE_WORKOUT_KEY);
    return null;
  }
}

function clearActiveSession() {
  try {
    sessionStorage.removeItem(ACTIVE_WORKOUT_KEY);
  } catch {
  }
}

async function loadExerciseCatalog() {
  const data = await gymApi('/exercises');
  exerciseCatalog = Array.isArray(data) ? data : data.exercises;

  if (!Array.isArray(exerciseCatalog)) {
    throw new Error('Could not load the exercise list.');
  }
}


// ---- Empty workouts ----
// An exercise added to an empty workout becomes a normal exercise card, so its
// sets are saved to the server the same way as a routine's sets.

function fillExercisePicker() {
  const added = new Set(workoutDraft.exercises.map(exercise => exercise.exercise_id));
  emptyExerciseSelect.replaceChildren();

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select an exercise';
  emptyExerciseSelect.append(placeholder);

  for (const exercise of exerciseCatalog) {
    if (added.has(exercise.id)) continue;
    const option = document.createElement('option');
    option.value = String(exercise.id);
    option.textContent = exercise.name;
    emptyExerciseSelect.append(option);
  }
}

// Adds the chosen exercise and saves its first set right away.
async function addExerciseToEmptyWorkout() {
  if (pendingSaves > 0 || finishing || addingSet || preparingFinish || removingExercise) return;

  const exercise = exerciseCatalog.find(item => item.id === Number(emptyExerciseSelect.value));
  if (!exercise) {
    setPageError('Choose an exercise to add.');
    emptyExerciseSelect.focus();
    return;
  }

  addingSet = true;
  if (!await saveVisibleSets()) { addingSet = false; return; }
  pendingSaves++;
  finishButton.disabled = true;
  addEmptyExerciseButton.disabled = true;
  setPageError('');

  try {
    // Checked first, so a 31st exercise is refused before anything is saved.
    const updatedDraft = createWorkoutDraft(currentUser.id, workoutDraft.mode, workoutDraft.name, workoutDraft.routineId, [
      ...workoutDraft.exercises,
      {
        exercise_id: exercise.id,
        name: exercise.name,
        target_sets: EMPTY_WORKOUT_START.targetSets,
        target_reps: EMPTY_WORKOUT_START.targetReps
      }
    ]);

    const result = await gymApi(`/workouts/${workoutId}/sets`, {
      method: 'POST',
      body: JSON.stringify({
        exercise_id: exercise.id,
        set_number: 1,
        weight: 0,
        weightUnit: currentUser.weightUnit,
        readd: true,
        reps: EMPTY_WORKOUT_START.targetReps,
        completed: false
      })
    });

    workoutDraft = updatedDraft;
    saveActiveSession(); // so the exercise is still here after a refresh
    workoutDetails.sets.push(result.set);
    renderWorkout();
    focusSetWeight(exercise.id, 1);
    pageStatus.textContent = `${exercise.name} added.`;
  } catch (error) {
    setPageError(`Could not add that exercise. ${error.message}`);
  } finally {
    pendingSaves--;
    addingSet = false;
    addEmptyExerciseButton.disabled = false;
    finishButton.disabled = pendingSaves > 0 || finishing;
  }
}

// If the page was closed right after saving a set but before it remembered the
// exercise, add that exercise back from the sets the server already has.
function includeLoggedExercises() {
  for (const set of workoutDetails.sets) {
    if (workoutDraft.exercises.some(exercise => exercise.exercise_id === set.exercise_id)) continue;
    workoutDraft = createWorkoutDraft(currentUser.id, workoutDraft.mode, workoutDraft.name, workoutDraft.routineId, [
      ...workoutDraft.exercises,
      {
        exercise_id: set.exercise_id,
        name: set.exercise_name,
        target_sets: EMPTY_WORKOUT_START.targetSets,
        target_reps: EMPTY_WORKOUT_START.targetReps
      }
    ]);
  }
  saveActiveSession();
}

function updateProgress() {
  const sets = workoutDetails ? workoutDetails.sets : [];
  const completed = sets.filter(set => set.completed).length;
  const total = sets.length;
  const percentage = total ? Math.round((completed / total) * 100) : 0;

  document.querySelector('#workout-progress').textContent =
    `${completed} of ${total} sets completed`;
  document.querySelector('#progress-fill').style.width = `${percentage}%`;
  document.querySelector('#progress-track').setAttribute('aria-valuenow', String(percentage));
}

function renderWorkout() {
  const isEmptyMode = workoutDraft.mode === 'empty';

  document.querySelector('#workout-name').textContent = workoutDraft.name;
  document.querySelector('#workout-description').textContent =
    workoutDraft.exercises.length
      ? `${workoutDraft.exercises.length} ${workoutDraft.exercises.length === 1 ? 'exercise' : 'exercises'} in this session. Your changes are saved as you go.`
      : isEmptyMode
        ? 'Add an exercise below to start logging.'
        : 'No exercises were selected for this session.';

  exerciseContainer.replaceChildren();
  setSavers.clear();

  const legacyUnit = workoutDetails.weight_unit === null;
  const unit = legacyUnit ? 'unit unconfirmed' : (workoutDetails.display_unit || currentUser.weightUnit || 'lbs');
  if (workoutDetails.display_unit) currentUser.weightUnit = workoutDetails.display_unit;
  document.querySelector('#legacy-weight-notice').hidden = !legacyUnit;

  for (const exercise of workoutDraft.exercises) {
    const card = document.createElement('section');
    card.className = 'card active-exercise-card';
    card.dataset.exerciseId = String(exercise.exercise_id);

    const heading = document.createElement('div');
    heading.className = 'active-exercise-heading';

    const title = document.createElement('h2');
    title.textContent = exercise.name;

    const target = document.createElement('p');
    target.className = 'field-help';
    target.textContent = isEmptyMode
      ? 'Added for today'
      : `Target: ${exercise.target_sets} sets × ${exercise.target_reps} reps`;

    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'text-button danger';
    remove.textContent = 'Remove exercise';
    remove.setAttribute('aria-label', `Remove ${exercise.name} from workout`);
    remove.addEventListener('click', () => {
      if (pendingSaves || addingSet || removingExercise || finishing || preparingFinish) return;
      exerciseToRemove = exercise;
      document.querySelector('#remove-exercise-message').textContent = `Remove ${exercise.name} and all its sets from this workout? Your saved routine stays unchanged.`;
      document.querySelector('#remove-exercise-status').textContent = '';
      removeDialog.showModal();
    });
    heading.append(title, target, remove);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'set-table-wrap';

    const table = document.createElement('table');
    table.className = 'set-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const label of ['Set', `Weight (${unit})`, 'Reps', 'Complete']) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = label;
      headerRow.append(th);
    }
    thead.append(headerRow);

    const tbody = document.createElement('tbody');
    const exerciseSets = workoutDetails.sets
      .filter(set => set.exercise_id === exercise.exercise_id)
      .sort((a, b) => a.set_number - b.set_number);

    for (const set of exerciseSets) {
      tbody.append(createSetRow(set));
    }

    table.append(thead, tbody);
    tableWrap.append(table);

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'text-button add-set-button';
    addButton.textContent = '+ Add Set';
    addButton.addEventListener('click', () => addSet(exercise, exerciseSets));

    card.append(heading, tableWrap, addButton);
    exerciseContainer.append(card);
  }

  emptyWorkoutBuilder.hidden = false;
  exerciseContainer.hidden = isEmptyMode && workoutDraft.exercises.length === 0;
  fillExercisePicker();
  if (legacyUnit) exerciseContainer.querySelectorAll('input, button').forEach(control => { control.disabled = true; });
  addEmptyExerciseButton.disabled = legacyUnit;
  finishButton.disabled = legacyUnit || pendingSaves > 0 || finishing;

  updateProgress();
  workoutContent.hidden = false;
}

function createSetRow(set) {
  const row = document.createElement('tr');
  row.className = 'set-row';
  if (set.completed) row.classList.add('is-complete');

  const numberCell = document.createElement('th');
  numberCell.scope = 'row';
  numberCell.textContent = String(set.set_number);

  const weightCell = document.createElement('td');
  const weightInput = document.createElement('input');
  weightInput.type = 'number';
  weightInput.min = '0';
  weightInput.step = 'any';
  weightInput.inputMode = 'decimal';
  weightInput.value = String(Math.round(set.weight * 10) / 10);
  let savedWeightDisplay = weightInput.value;
  weightInput.setAttribute('aria-label', `Set ${set.set_number} weight`);
  weightInput.addEventListener('focus', () => {
  if (weightInput.value === '0') {
      weightInput.select();
    }
  });
  weightCell.append(weightInput);

  const repsCell = document.createElement('td');
  const repsInput = document.createElement('input');
  repsInput.type = 'number';
  repsInput.min = '1';
  repsInput.step = '1';
  repsInput.inputMode = 'numeric';
  repsInput.value = String(set.reps);
  repsInput.setAttribute('aria-label', `Set ${set.set_number} reps`);
  repsCell.append(repsInput);

  const completeCell = document.createElement('td');
  const completeLabel = document.createElement('label');
  completeLabel.className = 'set-complete-control';

  const completeInput = document.createElement('input');
  completeInput.type = 'checkbox';
  completeInput.checked = set.completed;
  completeInput.setAttribute('aria-label', `Mark set ${set.set_number} complete`);

  const completeText = document.createElement('span');
  completeText.textContent = set.completed ? 'Done' : 'Mark done';

  completeLabel.append(completeInput, completeText);
  completeCell.append(completeLabel);

  row.append(numberCell, weightCell, repsCell, completeCell);

  let dirty = false;
  const validate = () => {
    const weight = Number(weightInput.value);
    const reps = Number(repsInput.value);
    if (weightInput.value.trim() === '' || !Number.isFinite(weight) || weight < 0) {
      weightInput.setAttribute('aria-invalid', 'true');
      setPageError('Weight must be zero or greater.');
      weightInput.focus();
      return false;
    }
    if (repsInput.value.trim() === '' || !Number.isSafeInteger(reps) || reps < 1) {
      repsInput.setAttribute('aria-invalid', 'true');
      setPageError('Reps must be a positive whole number.');
      repsInput.focus();
      return false;
    }
    weightInput.removeAttribute('aria-invalid');
    repsInput.removeAttribute('aria-invalid');
    return true;
  };
  const save = async () => {
    if (!validate()) return false;
    const weight = weightInput.value === savedWeightDisplay ? set.weight : Number(weightInput.value);
    const reps = Number(repsInput.value);

    const controls = [weightInput, repsInput, completeInput];
    controls.forEach(control => { control.disabled = true; });
    pendingSaves++;
    finishButton.disabled = true;
    setPageError('');

    try {
      const result = await gymApi(`/workouts/${workoutId}/sets/${set.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          weight,
          weightUnit: currentUser?.weightUnit || 'lbs',
          reps,
          completed: completeInput.checked
        })
      });

      Object.assign(set, result.set);
      savedWeightDisplay = weightInput.value;
      dirty = false;
      row.classList.toggle('is-complete', set.completed);
      completeText.textContent = set.completed ? 'Done' : 'Mark done';
      updateProgress();
      return true;
    } catch (error) {
      dirty = true;
      setPageError(`Could not save set ${set.set_number}. ${error.message}`);
      return false;
    } finally {
      pendingSaves--;
      controls.forEach(control => { control.disabled = false; });
      finishButton.disabled = pendingSaves > 0 || finishing;
    }
  };

  for (const control of [weightInput, repsInput, completeInput]) {
    control.addEventListener('input', () => { dirty = true; control.removeAttribute('aria-invalid'); });
    control.addEventListener('change', () => { dirty = true; save(); });
  }
  setSavers.set(set.id, { exerciseId: set.exercise_id, validate, save, isDirty: () => dirty });

  return row;
}

async function refreshWorkoutDetails() {
  const data = await gymApi(`/workouts/${workoutId}`);
  workoutDetails = data.workout;
  return workoutDetails;
}

async function ensureTargetSets() {
  await refreshWorkoutDetails();
  applyRemovedExercises();
  if (workoutDetails.weight_unit === null) return;

  for (const exercise of workoutDraft.exercises) {
    const existing = workoutDetails.sets.filter(set => set.exercise_id === exercise.exercise_id);
    const existingNumbers = new Set(existing.map(set => set.set_number));

    for (let number = 1; number <= exercise.target_sets; number++) {
      if (existingNumbers.has(number)) continue;

      await gymApi(`/workouts/${workoutId}/sets`, {
        method: 'POST',
        body: JSON.stringify({
          exercise_id: exercise.exercise_id,
          set_number: number,
          weight: 0,
          weightUnit: currentUser.weightUnit,
          reps: exercise.target_reps,
          completed: false
        })
      });
    }
  }

  await refreshWorkoutDetails();
}

async function addSet(exercise, currentSets) {
  if (addingSet || pendingSaves > 0 || finishing || preparingFinish || removingExercise) return;
  addingSet = true;
  if (!await saveVisibleSets()) { addingSet = false; return; }

  const lastSet = currentSets[currentSets.length - 1];
  const nextNumber = currentSets.reduce((max, set) => Math.max(max, set.set_number), 0) + 1;

  // Counted as a pending save, so a second tap (or Finish) waits for this one.
  addingSet = true;
  pendingSaves++;
  finishButton.disabled = true;

  try {
    setPageError('');
    const result = await gymApi(`/workouts/${workoutId}/sets`, {
      method: 'POST',
      body: JSON.stringify({
        exercise_id: exercise.exercise_id,
        set_number: nextNumber,
        weight: lastSet ? lastSet.weight : 0,
        weightUnit: currentUser.weightUnit,
        reps: lastSet ? lastSet.reps : exercise.target_reps,
        completed: false
      })
    });

    workoutDetails.sets.push(result.set);
    renderWorkout();
    focusSetWeight(exercise.exercise_id, nextNumber);
    pageStatus.textContent = `Set ${nextNumber} added.`;
  } catch (error) {
    setPageError(`Could not add a set. ${error.message}`);
  } finally {
    addingSet = false;
    pendingSaves--;
    finishButton.disabled = pendingSaves > 0 || finishing;
  }
}

// Explain which unchecked sets will be dropped before finishing.
function finishQuestion() {
  const sets = workoutDetails ? workoutDetails.sets : [];
  const done = sets.filter(set => set.completed).length;
  const skipped = sets.length - done;

  if (done === 0) {
    return 'No sets are marked done yet. Finish anyway? The workout will be saved with no sets.';
  }
  if (skipped > 0) {
    return `Finish this workout? ${skipped} ${skipped === 1 ? 'set' : 'sets'} not marked done will not be saved, and you won't be able to edit it after.`;
  }
  return 'Finish this workout? You will no longer be able to edit its sets.';
}

async function saveVisibleSets(excludedExerciseId = null) {
  const savers = [...setSavers.values()].filter(saver => saver.exerciseId !== excludedExerciseId);
  for (const saver of savers) if (!saver.validate()) return false;
  for (const saver of savers) if (saver.isDirty() && !await saver.save()) return false;
  if (!await saveWorkoutNotes()) return false;
  return true;
}

function applyRemovedExercises() {
  const removed = new Set(workoutDetails.removed_exercise_ids || []);
  workoutDraft = createWorkoutDraft(currentUser.id, workoutDraft.mode, workoutDraft.name, workoutDraft.routineId,
    workoutDraft.exercises.filter(exercise => !removed.has(exercise.exercise_id)), true);
  saveActiveSession();
}

async function saveWorkoutNotes() {
  if (notesSave) return notesSave;
  if (notesInput.value === savedNotes) return true;
  if (notesInput.value.length > 2000) {
    document.querySelector('#notes-status').textContent = 'Notes must contain at most 2,000 characters.';
    notesInput.focus(); return false;
  }
  const value = notesInput.value;
  notesSave = (async () => {
    notesInput.disabled = true;
    document.querySelector('#save-workout-notes').disabled = true;
    pendingSaves++; finishButton.disabled = true;
    const status = document.querySelector('#notes-status');
    status.textContent = 'Saving notes…';
    try {
      const result = await gymApi(`/workouts/${workoutId}/notes`, { method: 'PUT', body: JSON.stringify({ notes: value }) });
      savedNotes = result.notes;
      notesInput.value = savedNotes;
      workoutDetails.notes = savedNotes;
      status.textContent = 'Notes saved.'; return true;
    } catch (error) {
      status.textContent = `Could not save notes. ${error.message}`; return false;
    } finally {
      pendingSaves--; notesSave = null; notesInput.disabled = false;
      document.querySelector('#save-workout-notes').disabled = false;
      finishButton.disabled = pendingSaves > 0 || finishing || removingExercise || workoutDetails?.weight_unit === null;
    }
  })();
  return notesSave;
}
notesInput.addEventListener('change', saveWorkoutNotes);
document.querySelector('#save-workout-notes').addEventListener('click', saveWorkoutNotes);

document.querySelector('#cancel-remove-exercise').addEventListener('click', () => removeDialog.close());
removeDialog.addEventListener('cancel', event => { if (removingExercise) event.preventDefault(); });
document.querySelector('#confirm-remove-exercise').addEventListener('click', async () => {
  if (!exerciseToRemove || removingExercise || pendingSaves || finishing) return;
  removingExercise = true;
  removeDialog.querySelectorAll('button').forEach(button => { button.disabled = true; });
  const exercise = exerciseToRemove;
  const status = document.querySelector('#remove-exercise-status');
  try {
    if (!await saveVisibleSets(exercise.exercise_id)) { status.textContent = 'Save or correct your other changes before removing this exercise.'; return; }
    pendingSaves++; finishButton.disabled = true;
    try {
      await gymApi(`/workouts/${workoutId}/exercises/${exercise.exercise_id}`, { method: 'DELETE' });
      workoutDraft = createWorkoutDraft(currentUser.id, workoutDraft.mode, workoutDraft.name, workoutDraft.routineId,
        workoutDraft.exercises.filter(item => item.exercise_id !== exercise.exercise_id), true);
      saveActiveSession();
      workoutDetails.sets = workoutDetails.sets.filter(set => set.exercise_id !== exercise.exercise_id);
      renderWorkout();
      removeDialog.close(); emptyExerciseSelect.focus();
      pageStatus.textContent = `${exercise.name} removed from this workout.`;
    } finally { pendingSaves--; }
  } catch (error) { status.textContent = `Could not remove exercise. ${error.message}`; }
  finally {
    removingExercise = false;
    removeDialog.querySelectorAll('button').forEach(button => { button.disabled = false; });
    finishButton.disabled = pendingSaves > 0 || finishing || workoutDetails?.weight_unit === null;
  }
});

document.querySelector('#confirm-workout-unit').addEventListener('click', async event => {
  const button = event.currentTarget;
  if (button.disabled) return;
  const unit = document.querySelector('#legacy-workout-unit').value;
  const status = document.querySelector('#legacy-unit-status');
  if (!unit) { status.textContent = 'Choose the original unit for this workout.'; return; }
  button.disabled = true;
  try {
    await gymApi(`/workouts/${workoutId}/weight-unit`, { method: 'PUT', body: JSON.stringify({ weightUnit: unit }) });
    await ensureTargetSets(); renderWorkout(); status.textContent = '';
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});

async function finishWorkout() {
  if (pendingSaves > 0 || finishing || preparingFinish || addingSet || removingExercise) {
    setPageError('Wait for your set changes to finish saving before finishing the workout.');
    return;
  }

  // Validate the visible values, including edits that never saved successfully.
  // A browser confirm used to finish with the old saved value after an error.
  preparingFinish = true;
  try {
    if (!await saveVisibleSets()) return;
    document.querySelector('#finish-message').textContent = finishQuestion();
    finishDialog.showModal();
  } finally {
    preparingFinish = false;
  }
}

async function confirmFinishWorkout() {
  if (finishing || pendingSaves > 0 || removingExercise) return;
  finishing = true;
  finishDialog.close();
  document.querySelectorAll('#workout-content input, #workout-content textarea, #workout-content button, [data-logout]').forEach(control => { control.disabled = true; });
  finishButton.disabled = true;
  pageStatus.textContent = 'Finishing workout…';
  setPageError('');

  try {
    await gymApi(`/workouts/${workoutId}/finish`, {
      method: 'POST',
      body: '{}'
    });
    clearActiveSession();
    clearWorkoutDraft();
    location.href = 'progress.html';
  } catch (error) {
    pageStatus.textContent = '';
    setPageError(`Could not finish your workout. ${error.message}`);
    finishing = false;
    document.querySelectorAll('#workout-content input, #workout-content textarea, #workout-content button, [data-logout]').forEach(control => { control.disabled = false; });
  }
}

async function logOut(button) {
  button.disabled = true;
  try {
    await gymApi('/auth/logout', { method: 'POST', body: '{}' });
    clearActiveSession();
    clearWorkoutDraft();
    location.replace('login.html');
  } catch (error) {
    setPageError(`Could not log out. ${error.message}`);
    button.disabled = false;
  }
}

finishButton.addEventListener('click', finishWorkout);
document.querySelector('#confirm-finish').addEventListener('click', confirmFinishWorkout);
document.querySelector('#cancel-finish').addEventListener('click', () => finishDialog.close());
finishDialog.addEventListener('close', () => { if (!finishing) finishButton.focus(); });
addEmptyExerciseButton.addEventListener('click', addExerciseToEmptyWorkout);
document.querySelectorAll('[data-logout]').forEach(button => {
  button.addEventListener('click', () => logOut(button));
});

window.addEventListener('pageshow', event => {
  if (event.persisted) location.reload();
});

(async function initializeActiveWorkout() {
  try {
    const profile = await gymApi('/profile');
    currentUser = profile.user;

    const activeSession = readActiveSession(currentUser.id);

    if (activeSession) {
      workoutId = activeSession.workoutId;
      workoutDraft = activeSession.draft;
      await refreshWorkoutDetails();

      if (workoutDetails.end_time) {
        clearActiveSession();
        clearWorkoutDraft();
        location.replace('progress.html');
        return;
      }
    } else {
      workoutDraft = readWorkoutDraft(currentUser.id);
      if (!workoutDraft) {
        document.body.dataset.auth = 'ready';
        pageStatus.textContent = 'No workout is selected. Return to Start Workout to choose one.';
        return;
      }

      const created = await gymApi('/workouts', {
        method: 'POST',
        body: JSON.stringify({
          routine_id: workoutDraft.mode === 'routine' ? workoutDraft.routineId : null
        })
      });

      workoutId = created.workout.id;
      saveActiveSession();
    }

    document.body.dataset.auth = 'ready';

    await loadExerciseCatalog();
    if (workoutDraft.mode === 'empty') {
      await refreshWorkoutDetails(); // sets already saved, for example after a refresh
      applyRemovedExercises();
      includeLoggedExercises();
    } else {
      await ensureTargetSets();
      includeLoggedExercises();
    }
    savedNotes = workoutDetails.notes || '';
    notesInput.value = savedNotes;
    renderWorkout();
    pageStatus.textContent = '';

  } catch (error) {
    document.body.dataset.auth = 'ready';
    pageStatus.textContent = '';
    setPageError(`Could not load your active workout. ${error.message}`);
  }
})();
