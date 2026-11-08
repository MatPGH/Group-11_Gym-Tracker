'use strict';
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
const trainingDate = document.querySelector('#training-date');
if (trainingDate) trainingDate.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
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
          const item = document.createElement('a');
          item.className = 'recent-row';
          item.href = 'progress.html#workout-history';
          const date = document.createElement('time');
          date.dateTime = workout.endTime;
          date.textContent = new Date(workout.endTime).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' });
          const title = document.createElement('strong');
          title.textContent = workout.routineName || 'Workout #' + workout.id;
          const duration = document.createElement('span');
          duration.className = 'recent-duration';
          const minutes = Math.max(0, Math.round((Date.parse(workout.endTime) - Date.parse(workout.startTime)) / 60000));
          duration.textContent = Number.isFinite(minutes) ? minutes + ' min' : '';
          const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          arrow.setAttribute('class', 'icon');
          arrow.setAttribute('aria-hidden', 'true');
          const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
          use.setAttribute('href', 'icons.svg#chevron');
          arrow.append(use);
          item.append(date, title, duration, arrow);
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
