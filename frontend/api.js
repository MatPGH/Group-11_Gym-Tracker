'use strict';
window.gymApi = async function (path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
    credentials: 'same-origin', cache: 'no-store', ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !location.pathname.endsWith('/login.html')) {
      location.replace('login.html');
    }
    throw new Error(data.error || 'Request failed. Please try again.');
  }
  return data;
};
