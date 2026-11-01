'use strict';

const ACTIVE_WORKOUT_KEY = 'gymTracker.activeWorkout';
const pageStatus = document.querySelector('#page-status');
const pageError = document.querySelector('#workout-error');
const workoutContent = document.querySelector('#workout-content');
const exerciseContainer = document.querySelector('#active-exercises');
const finishButton = document.querySelector('#finish-workout');
const emptyWorkoutBuilder = document.querySelector('#empty-workout-builder');
const emptyExercisesContainer = document.querySelector('#empty-exercises');
const addEmptyExerciseButton = document.querySelector('#add-empty-exercise');

let exerciseCatalog = [];

let currentUser = null;
let workoutId = null;
let workoutDraft = null;
let workoutDetails = null;
let pendingSaves = 0;
let finishing = false;

function setPageError(message) {
  pageError.textContent = message || '';
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
      saved.draft.exercises
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


function createEmptyExerciseCard() {
  const card = document.createElement('section');
  card.className = 'empty-exercise-card';

  const heading = document.createElement('h3');
  heading.textContent = 'Choose an exercise';

  const exerciseLabel = document.createElement('label');
  exerciseLabel.textContent = 'Exercise';

  const exerciseSelect = document.createElement('select');
  exerciseSelect.required = true;

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select an exercise';
  placeholder.selected = true;
  placeholder.disabled = true;
  exerciseSelect.append(placeholder);

  for (const exercise of exerciseCatalog) {
    const option = document.createElement('option');
    option.value = String(exercise.id);
    option.textContent = exercise.name;
    exerciseSelect.append(option);
  }

  exerciseLabel.append(exerciseSelect);

  const setsSection = document.createElement('div');
  setsSection.hidden = true;

  const setsHeading = document.createElement('h4');
  setsHeading.textContent = 'Sets';

  const setsContainer = document.createElement('div');
  setsContainer.className = 'empty-sets';

  const addSetButton = document.createElement('button');
  addSetButton.type = 'button';
  addSetButton.className = 'text-button';
  addSetButton.textContent = '+ Add Set';

  const removeExerciseButton = document.createElement('button');
  removeExerciseButton.type = 'button';
  removeExerciseButton.className = 'text-button';
  removeExerciseButton.textContent = 'Remove Exercise';

  function addEmptySet() {
    const row = document.createElement('div');
    row.className = 'empty-set-row';

    const setNumber = document.createElement('span');
    setNumber.textContent = `Set ${setsContainer.children.length + 1}`;

    const weightLabel = document.createElement('label');
    weightLabel.textContent = `Weight (${currentUser.weightUnit || 'lbs'})`;

    const weightInput = document.createElement('input');
    weightInput.type = 'number';
    weightInput.min = '0';
    weightInput.step = '0.1';
    weightInput.value = '0';
    weightInput.required = true;
    weightInput.addEventListener('focus', () => {
      if (weightInput.value === '0') {
        weightInput.select();
      }
    });
    weightLabel.append(weightInput);

    const repsLabel = document.createElement('label');
    repsLabel.textContent = 'Reps';

    const repsInput = document.createElement('input');
    repsInput.type = 'number';
    repsInput.min = '1';
    repsInput.step = '1';
    repsInput.value = '10';
    repsInput.required = true;
    repsLabel.append(repsInput);

    const removeSetButton = document.createElement('button');
    removeSetButton.type = 'button';
    removeSetButton.className = 'text-button';
    removeSetButton.textContent = 'Remove';

    removeSetButton.addEventListener('click', () => {
      row.remove();

      Array.from(setsContainer.children).forEach((setRow, index) => {
        setRow.querySelector('span').textContent = `Set ${index + 1}`;
      });
    });

    row.append(setNumber, weightLabel, repsLabel, removeSetButton);
    setsContainer.append(row);
  }

  exerciseSelect.addEventListener('change', () => {
    if (exerciseSelect.value) {
      setsSection.hidden = false;

      if (setsContainer.children.length === 0) {
        addEmptySet();
      }
    } else {
      setsSection.hidden = true;
      setsContainer.replaceChildren();
    }
  });

  addSetButton.addEventListener('click', addEmptySet);

  removeExerciseButton.addEventListener('click', () => card.remove());

  setsSection.append(setsHeading, setsContainer, addSetButton);

  card.append(
    heading,
    exerciseLabel,
    setsSection,
    removeExerciseButton
  );

  emptyExercisesContainer.append(card);
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
  document.querySelector('#workout-name').textContent = workoutDraft.name;
  document.querySelector('#workout-description').textContent =
    workoutDraft.exercises.length
      ? `${workoutDraft.exercises.length} ${workoutDraft.exercises.length === 1 ? 'exercise' : 'exercises'} in this session. Your changes are saved as you go.`
      : 'No exercises were selected for this session.';

  exerciseContainer.replaceChildren();

  const unit = currentUser.weightUnit || 'lbs';

  for (const exercise of workoutDraft.exercises) {
    const card = document.createElement('section');
    card.className = 'card active-exercise-card';

    const heading = document.createElement('div');
    heading.className = 'active-exercise-heading';

    const title = document.createElement('h2');
    title.textContent = exercise.name;

    const target = document.createElement('p');
    target.className = 'field-help';
    target.textContent = `Target: ${exercise.target_sets} sets × ${exercise.target_reps} reps`;

    heading.append(title, target);

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

  const isEmptyMode = workoutDraft.mode === 'empty';

  emptyWorkoutBuilder.hidden = !isEmptyMode;
  exerciseContainer.hidden = isEmptyMode && workoutDraft.exercises.length === 0;

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
  weightInput.step = '0.1';
  weightInput.inputMode = 'decimal';
  weightInput.value = String(set.weight);
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

  const save = async () => {
    const weight = Number(weightInput.value);
    const reps = Number(repsInput.value);

    if (!Number.isFinite(weight) || weight < 0) {
      setPageError('Weight must be zero or greater.');
      weightInput.focus();
      return false;
    }
    if (!Number.isSafeInteger(reps) || reps < 1) {
      setPageError('Reps must be a positive whole number.');
      repsInput.focus();
      return false;
    }

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
          reps,
          completed: completeInput.checked
        })
      });

      Object.assign(set, result.set);
      row.classList.toggle('is-complete', set.completed);
      completeText.textContent = set.completed ? 'Done' : 'Mark done';
      updateProgress();
      return true;
    } catch (error) {
      completeInput.checked = set.completed;
      setPageError(`Could not save set ${set.set_number}. ${error.message}`);
      return false;
    } finally {
      pendingSaves--;
      controls.forEach(control => { control.disabled = false; });
      finishButton.disabled = pendingSaves > 0 || finishing;
    }
  };

  weightInput.addEventListener('change', save);
  repsInput.addEventListener('change', save);
  completeInput.addEventListener('change', save);

  return row;
}

async function refreshWorkoutDetails() {
  const data = await gymApi(`/workouts/${workoutId}`);
  workoutDetails = data.workout;
  return workoutDetails;
}

async function ensureTargetSets() {
  await refreshWorkoutDetails();

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
          reps: exercise.target_reps,
          completed: false
        })
      });
    }
  }

  await refreshWorkoutDetails();
}

async function addSet(exercise, currentSets) {
  if (pendingSaves > 0 || finishing) return;

  const lastSet = currentSets[currentSets.length - 1];
  const nextNumber = currentSets.reduce((max, set) => Math.max(max, set.set_number), 0) + 1;

  try {
    setPageError('');
    const result = await gymApi(`/workouts/${workoutId}/sets`, {
      method: 'POST',
      body: JSON.stringify({
        exercise_id: exercise.exercise_id,
        set_number: nextNumber,
        weight: lastSet ? lastSet.weight : 0,
        reps: lastSet ? lastSet.reps : exercise.target_reps,
        completed: false
      })
    });

    workoutDetails.sets.push(result.set);
    renderWorkout();
    setPageError('Set added.');
  } catch (error) {
    setPageError(`Could not add a set. ${error.message}`);
  }
}

async function finishWorkout() {
  if (pendingSaves > 0 || finishing) {
    setPageError('Wait for your set changes to finish saving before finishing the workout.');
    return;
  }

  const confirmed = window.confirm('Finish this workout? You will no longer be able to edit its sets.');
  if (!confirmed) return;

  finishing = true;
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
    location.href = 'history.html';
  } catch (error) {
    pageStatus.textContent = '';
    setPageError(`Could not finish your workout. ${error.message}`);
    finishing = false;
    finishButton.disabled = false;
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
addEmptyExerciseButton.addEventListener('click', createEmptyExerciseCard);
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
        location.replace('history.html');
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

    if (workoutDraft.mode === 'empty') {
      await loadExerciseCatalog();
      if (emptyExercisesContainer.children.length === 0) {
        createEmptyExerciseCard();
      }
    } else {
      await ensureTargetSets();
    }
    renderWorkout();
    pageStatus.textContent = '';

  } catch (error) {
    document.body.dataset.auth = 'ready';
    pageStatus.textContent = '';
    setPageError(`Could not load your active workout. ${error.message}`);
  }
})();
