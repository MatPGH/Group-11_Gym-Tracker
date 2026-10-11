// S1-05 is a UI preview. S1-09 will load and save profile data through the backend.
'use strict';
const dialog = document.querySelector('#feature-dialog');
const messages = {
  'Start Workout': 'Workout selection and logging are coming in a later sprint.',
  'Routines': 'Routine pages are coming in a later task.',
  'View Progress': 'Progress charts will be available when workout tracking is connected.',
  'Workout History': 'Workout history will be available when workout logging is connected.',
  'Profile picture': 'This is a picture placeholder. Image upload is not available yet.',
  'Log Out': 'Sign-in and sign-out are not connected to this page yet. No session has been changed.',
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
if (form) {
  const name = form.elements.displayName;
  name.addEventListener('input', () => name.setCustomValidity(''));
  form.addEventListener('submit', event => {
    event.preventDefault();
    const value = name.value.trim();
    name.setCustomValidity(value ? '' : 'Please enter a display name.');
    if (!form.reportValidity()) return;
    name.value = value;
    document.querySelector('#display-name').textContent = value;
    const units = form.elements.units.value;
    document.querySelector('#profile-status').textContent = `Preview updated for ${value} using ${units}. These changes have not been saved to an account.`;
  });
}
