'use strict';
const dialog = document.querySelector('#feature-dialog');
const messages = {
  'Profile picture': 'This is a picture placeholder. Image upload is not available yet.',
  'Delete Account': 'Account deletion is not available in this preview. No account has been deleted.'
};
document.querySelectorAll('[data-feature]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelector('#dialog-title').textContent = button.dataset.feature;
    document.querySelector('#dialog-message').textContent = messages[button.dataset.feature];
    dialog.showModal();
  });
});
const form = document.querySelector('#profile-form');
const pageStatus = document.querySelector('#page-status');
function setBusy(busy) {
  if (form) form.querySelectorAll('input, button').forEach(control => { control.disabled = busy; });
}
function showUser(user) {
  document.querySelectorAll('[data-user-name]').forEach(element => { element.textContent = user.name; });
  if (form) {
    form.elements.displayName.value = user.name;
    form.elements.units.value = user.weightUnit;
  }
}
async function loadPage() {
  setBusy(true);
  try {
    const { user } = await gymApi('/profile');
    showUser(user);
    document.body.dataset.auth = 'ready';
    setBusy(false);
    pageStatus.textContent = '';
    if (document.querySelector('#recent-workouts')) {
      const data = await gymApi('/dashboard');
      for (const metric of ['workoutsThisWeek', 'savedRoutines', 'trainingStreak']) {
        document.querySelector(`[data-metric="${metric}"]`).textContent = data[metric];
      }
      const recent = document.querySelector('#recent-workouts');
      recent.replaceChildren();
      if (!data.recentWorkouts.length) {
        recent.textContent = 'No completed workouts yet. Your activity will appear here after you finish a workout.';
      } else {
        for (const workout of data.recentWorkouts) {
          const item = document.createElement('p');
          item.textContent = `Workout #${workout.id} · ${new Date(workout.endTime).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}`;
          recent.append(item);
        }
      }
    }
  } catch (error) {
    pageStatus.textContent = `${error.message} Refresh this page to try again.`;
  }
}
if (form) {
  const name = form.elements.displayName;
  name.addEventListener('input', () => name.setCustomValidity(''));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const value = name.value.trim();
    name.setCustomValidity(value ? '' : 'Please enter a display name.');
    if (!form.reportValidity()) return;
    const units = form.elements.units.value;
    const status = document.querySelector('#profile-status');
    setBusy(true);
    status.textContent = 'Saving…';
    try {
      const { user } = await gymApi('/profile', { method: 'PUT', body: JSON.stringify({ name: value, weightUnit: units }) });
      showUser(user);
      status.textContent = `Settings saved. Weight units: ${user.weightUnit}.`;
    } catch (error) {
      status.textContent = `Could not save settings. ${error.message}`;
    } finally {
      setBusy(false);
    }
  });
}
document.querySelectorAll('[data-logout]').forEach(button => {
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await gymApi('/auth/logout', { method: 'POST', body: '{}' });
      location.replace('login.html');
    } catch (error) {
      pageStatus.textContent = `Could not log out. ${error.message}`;
      button.disabled = false;
    }
  });
});
window.addEventListener('pageshow', event => { if (event.persisted) loadPage(); });
loadPage();
