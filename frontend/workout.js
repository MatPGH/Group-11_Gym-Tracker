'use strict';
const pageStatus = document.querySelector('#page-status');
const continueButton = document.querySelector('#continue-workout');
const routineList = document.querySelector('#workout-routines');
const catalogList = document.querySelector('#workout-catalog');
const customName = document.querySelector('#workout-name');
const search = document.querySelector('#exercise-search');
const selectedExercises = new Map();
let user;
let mode = 'routine';
let routines = [];
let catalog = [];
let selectedRoutineId = null;
let busy = false;

wireWorkoutLogout(pageStatus);

function selection() {
  if (mode === 'routine') {
    const routine = routines.find(item => item.id === selectedRoutineId);
    return routine ? { name: routine.name, routineId: routine.id, exercises: routine.exercises } : null;
  }
  if (mode === 'custom') {
    return { name: customName.value.trim() || 'Custom workout', routineId: null,
      exercises: [...selectedExercises.values()].map(exercise => ({
        exercise_id: exercise.id, name: exercise.name, target_sets: 3, target_reps: 10
      })) };
  }
  return { name: 'Empty workout', routineId: null, exercises: [] };
}

function renderPreview() {
  const choice = selection();
  document.querySelector('#preview-heading').textContent = choice ? choice.name : 'Choose a routine to continue';
  document.querySelector('#preview-detail').textContent = !choice
    ? 'Your exercises and targets will appear here.'
    : mode === 'empty' ? 'No exercises selected. Begin with a blank workout.'
    : choice.exercises.length + (choice.exercises.length === 1 ? ' exercise selected.' : ' exercises selected.') + (mode === 'custom' ? ' Initial targets: 3 sets × 10 reps.' : '');
  renderWorkoutExercises(document.querySelector('#preview-exercises'), choice ? choice.exercises : []);
  continueButton.disabled = busy || !user || !choice || (mode !== 'empty' && choice.exercises.length === 0);
}

function chooseMode(nextMode) {
  if (busy) return;
  mode = nextMode;
  document.querySelectorAll('[data-mode]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  });
  for (const type of ['routine', 'custom', 'empty']) {
    document.querySelector('#' + type + '-panel').hidden = type !== mode;
  }
  pageStatus.textContent = '';
  renderPreview();
}

function renderRoutines() {
  routineList.replaceChildren();
  for (const routine of routines) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'card workout-choice';
    button.setAttribute('aria-pressed', String(selectedRoutineId === routine.id));
    const name = document.createElement('strong');
    name.textContent = routine.name;
    const detail = document.createElement('span');
    detail.textContent = routine.exercises.length + (routine.exercises.length === 1 ? ' exercise' : ' exercises') + (routine.description ? ' · ' + routine.description : '');
    button.append(name, detail);
    button.addEventListener('click', () => {
      if (busy) return;
      selectedRoutineId = routine.id;
      renderRoutines();
      // Keep keyboard focus on the chosen card after rendering.
      const index = routines.findIndex(item => item.id === selectedRoutineId);
      routineList.children[index].focus();
      pageStatus.textContent = 'Selected ' + routine.name + '. Review your selection below.';
      renderPreview();
    });
    routineList.append(button);
  }
}

function renderCatalog() {
  catalogList.replaceChildren();
  const query = search.value.trim().toLowerCase();
  const matches = catalog.filter(exercise =>
    [exercise.name, exercise.muscle_group, exercise.equipment].some(value =>
      String(value || '').toLowerCase().includes(query)));
  document.querySelector('#catalog-status').textContent = catalog.length
    ? (matches.length ? matches.length + ' exercises found. ' : 'No exercises match your search. ') +
      selectedExercises.size + ' selected (maximum 30).'
    : 'No exercises are available yet.';
  for (const exercise of matches) {
    const label = document.createElement('label');
    label.className = 'catalog-exercise';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = selectedExercises.has(exercise.id);
    const text = document.createElement('span');
    text.textContent = exercise.name;
    const detail = document.createElement('small');
    detail.textContent = [exercise.muscle_group, exercise.equipment].filter(Boolean).join(' · ');
    text.append(detail);
    input.addEventListener('change', () => {
      if (input.checked && selectedExercises.size >= 30) {
        input.checked = false;
        pageStatus.textContent = 'A workout can have at most 30 exercises.';
        return;
      }
      if (input.checked) selectedExercises.set(exercise.id, exercise);
      else selectedExercises.delete(exercise.id);
      document.querySelector('#catalog-status').textContent = matches.length + ' exercises found. ' + selectedExercises.size + ' selected (maximum 30).';
      pageStatus.textContent = '';
      renderPreview();
    });
    label.append(input, text);
    catalogList.append(label);
  }
}

function setBusy(value) {
  busy = value;
  document.querySelectorAll('#main button, #main input').forEach(control => { control.disabled = value; });
  renderPreview();
}

document.querySelectorAll('[data-mode]').forEach(button => {
  button.addEventListener('click', () => chooseMode(button.dataset.mode));
});
search.addEventListener('input', renderCatalog);
customName.addEventListener('input', renderPreview);
document.querySelector('#reload-options').addEventListener('click', () => location.reload());

continueButton.addEventListener('click', async () => {
  const chosenMode = mode;
  let choice = selection();
  if (!choice || busy) return;
  setBusy(true);
  pageStatus.textContent = 'Preparing your selection…';
  try {
    const current = await gymApi('/profile');
    if (current.user.id !== user.id) {
      clearWorkoutDraft();
      location.replace('workout.html');
      return;
    }
    if (chosenMode === 'routine') {
      // Refresh targets and ownership in case this routine changed in another tab.
      const fresh = await gymApi('/routines');
      const routine = fresh.routines.find(item => item.id === choice.routineId);
      if (!routine) throw new Error('That routine is no longer available. Reload your workout choices.');
      choice = { name: routine.name, routineId: routine.id, exercises: routine.exercises };
    }
    const draft = createWorkoutDraft(user.id, chosenMode, choice.name, choice.routineId, choice.exercises);
    saveWorkoutDraft(draft);
    location.href = 'active-workout.html';
  } catch (error) {
    pageStatus.textContent = error.message;
    document.querySelector('#reload-options').hidden = false;
  } finally { setBusy(false); }
});

(async () => {
  try {
    const data = await gymApi('/profile');
    user = data.user;
    pageStatus.textContent = '';
    readWorkoutDraft(user.id); // Discard stale or other-account selections.
    const results = await Promise.allSettled([gymApi('/routines'), gymApi('/exercises')]);
    const routineResult = results[0];
    if (routineResult.status === 'fulfilled' && Array.isArray(routineResult.value.routines)) {
      routines = routineResult.value.routines;
      document.querySelector('#routine-status').textContent = routines.length
        ? 'Choose a routine to see its exercises and targets.'
        : 'You have no saved routines yet. Create one in Routines, or choose a custom or empty workout.';
      renderRoutines();
      const requestedId = new URLSearchParams(location.search).get('routine');
      if (requestedId !== null) {
        const match = routines.find(item => String(item.id) === requestedId);
        if (match) selectedRoutineId = match.id;
        else pageStatus.textContent = 'That routine is not available. Choose another workout.';
        renderRoutines();
      }
    } else {
      document.querySelector('#routine-status').textContent = 'Could not load your routines. Reload to try again, or choose a custom or empty workout.';
      document.querySelector('#reload-options').hidden = false;
    }
    const catalogResult = results[1];
    if (catalogResult.status === 'fulfilled') {
      const exercises = Array.isArray(catalogResult.value) ? catalogResult.value : catalogResult.value.exercises;
      if (Array.isArray(exercises)) { catalog = exercises; renderCatalog(); }
      else throw new Error('Could not load the exercise catalog. Reload to try again.');
    } else {
      document.querySelector('#catalog-status').textContent = 'Could not load exercises. Reload to try again, or choose a saved routine or empty workout.';
      document.querySelector('#reload-options').hidden = false;
    }
    document.body.dataset.auth = 'ready';
    renderPreview();
  } catch (error) { pageStatus.textContent = error.message + ' Refresh this page to try again.'; }
})();
