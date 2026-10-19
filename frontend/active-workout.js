'use strict';
const status = document.querySelector('#page-status');
wireWorkoutLogout(status);
(async () => {
  try {
    const { user } = await gymApi('/profile');
    const draft = readWorkoutDraft(user.id);
    document.body.dataset.auth = 'ready';
    if (!draft) {
      status.textContent = 'No workout is selected. Return to Start Workout to choose one.';
      return;
    }
    document.querySelector('#draft-name').textContent = draft.name;
    document.querySelector('#draft-mode').textContent = { routine: 'SAVED ROUTINE', custom: 'CUSTOM WORKOUT', empty: 'EMPTY WORKOUT' }[draft.mode];
    document.querySelector('#draft-description').textContent = draft.exercises.length
      ? draft.exercises.length + (draft.exercises.length === 1 ? ' exercise selected. Targets are shown below.' : ' exercises selected. Targets are shown below.')
      : 'No exercises selected. Your workout starts blank.';
    renderWorkoutExercises(document.querySelector('#draft-exercises'), draft.exercises);
    document.querySelector('#draft-summary').hidden = false;
    status.textContent = '';
  } catch (error) { status.textContent = error.message; }
})();
