'use strict';
const form = document.querySelector('#auth-form');
const toggle = document.querySelector('#auth-toggle');
const status = document.querySelector('#auth-status');
let signup = false;
toggle.addEventListener('click', () => {
  signup = !signup;
  document.querySelector('#signup-fields').hidden = !signup;
  form.elements.name.required = signup;
  form.elements.password.autocomplete = signup ? 'new-password' : 'current-password';
  document.querySelector('#auth-heading').textContent = signup ? 'Create Account' : 'Sign In';
  document.querySelector('#auth-submit').textContent = signup ? 'Create Account' : 'Sign In';
  toggle.textContent = signup ? 'Already have an account? Sign in' : 'Create an account';
  status.textContent = '';
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  const body = JSON.stringify({ name: form.elements.name.value, email: form.elements.email.value, password: form.elements.password.value });
  form.querySelectorAll('input, button').forEach(control => { control.disabled = true; });
  toggle.disabled = true;
  status.textContent = signup ? 'Creating account…' : 'Signing in…';
  try {
    if (signup) await gymApi('/auth/register', { method: 'POST', body });
    await gymApi('/auth/login', { method: 'POST', body });
    location.replace('index.html');
  } catch (error) {
    status.textContent = signup ? `${error.message} If your account was created, switch to Sign In to retry.` : error.message;
  } finally {
    form.querySelectorAll('input, button').forEach(control => { control.disabled = false; });
    toggle.disabled = false;
  }
});
