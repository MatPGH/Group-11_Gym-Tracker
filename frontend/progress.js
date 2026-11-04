'use strict';
const pageStatus = document.querySelector('#page-status');
const content = document.querySelector('#progress-content');
const exerciseSelect = document.querySelector('#progress-exercise');
const rangeSelect = document.querySelector('#progress-range');
const details = document.querySelector('#workout-details');
const historyList = document.querySelector('#history-list');
let workouts = [], unit = 'lbs', page = 1, selection = null, detailRequest = 0, lastDetailButton = null;
const PAGE_SIZE = 5;
let bodyWeightEntries = [];
let savingBodyWeight = false;
let editingWeightId = null, deletingWeightId = null, deletingWeight = false;
let originalEditedWeight = null;
const bodyWeightForm = document.querySelector('#body-weight-form');
const number = value => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
const date = (value, options = {}) => new Date(value).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', ...options });

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function renderBodyWeightHistory() {
  const rows = document.querySelector('#body-weight-rows');
  const empty = document.querySelector('#body-weight-empty');

  rows.replaceChildren();

  if (!bodyWeightEntries.length) {
    empty.textContent = 'No weight entries yet. Add your first entry above.';
    empty.hidden = false;
    return;
  }

  empty.hidden = true;

  bodyWeightEntries.forEach(entry => {
    const row = document.createElement('tr');

    const dateCell = node('td', date(entry.date, { year: 'numeric' }));
    const weightCell = node('td', `${number(entry.weight)} ${unit}`);

    const actions = node('td');
    const edit = node('button', 'Edit', 'text-button');
    edit.type = 'button';
    edit.setAttribute('aria-label', `Edit weight for ${entry.date}`);
    edit.addEventListener('click', () => {
      if (savingBodyWeight) return;
      editingWeightId = entry.id;
      document.querySelector('#body-weight-date').value = entry.date;
      document.querySelector('#body-weight-input').value = Math.round(entry.weight * 10) / 10;
      originalEditedWeight = { value: entry.weight, display: document.querySelector('#body-weight-input').value };
      document.querySelector('#save-body-weight').textContent = 'Save Changes';
      document.querySelector('#cancel-weight-edit').hidden = false;
      document.querySelector('#body-weight-status').textContent = `Editing entry for ${entry.date}.`;
      document.querySelector('#body-weight-input').focus();
    });
    const remove = node('button', 'Delete', 'text-button danger');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Delete weight for ${entry.date}`);
    remove.addEventListener('click', () => {
      if (savingBodyWeight) return;
      deletingWeightId = entry.id;
      document.querySelector('#delete-weight-description').textContent = `Delete ${number(entry.weight)} ${unit} recorded on ${date(entry.date, { year: 'numeric' })}? This cannot be undone.`;
      document.querySelector('#delete-weight-status').textContent = '';
      document.querySelector('#delete-weight-dialog').showModal();
    });
    actions.append(edit, remove);
    row.append(dateCell, weightCell, actions);
    rows.append(row);
  });
}
bodyWeightForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (savingBodyWeight) return;

  const status = document.querySelector('#body-weight-status');
  const dateInput = document.querySelector('#body-weight-date');
  const weightInput = document.querySelector('#body-weight-input');

  const dateValue = dateInput.value;
  const weightValue = editingWeightId !== null && originalEditedWeight?.display === weightInput.value
    ? originalEditedWeight.value : Number(weightInput.value);

  if (!dateValue || !Number.isFinite(weightValue) || weightValue <= 0) {
    status.textContent = 'Enter a valid date and weight.';
    return;
  }

  savingBodyWeight = true;
  const controls = bodyWeightForm.querySelectorAll('input, button');
  controls.forEach(control => { control.disabled = true; });
  status.textContent = 'Saving weight...';

  try {
    await gymApi(editingWeightId === null ? '/body-weight' : `/body-weight/${editingWeightId}`, {
      method: editingWeightId === null ? 'POST' : 'PUT',
      body: JSON.stringify({
        date: dateValue,
        weight: weightValue
      })
    });

    resetWeightForm();
    status.textContent = 'Weight entry saved successfully.';
    try { await refreshWeights(); }
    catch (error) { status.textContent = `Weight saved. Refresh the page to reload history. ${error.message}`; }
  } catch (error) {
    status.textContent = error.message || 'Unable to save weight entry.';
  } finally {
    savingBodyWeight = false;
    controls.forEach(control => { control.disabled = false; });
  }
});
function resetWeightForm() {
  editingWeightId = null;
  originalEditedWeight = null;
  bodyWeightForm.reset();
  document.querySelector('#save-body-weight').textContent = 'Save Weight';
  document.querySelector('#cancel-weight-edit').hidden = true;
}
async function refreshWeights() {
  bodyWeightEntries = (await gymApi('/body-weight')).entries;
  renderBodyWeightHistory();
}
document.querySelector('#cancel-weight-edit').addEventListener('click', () => {
  if (savingBodyWeight) return;
  resetWeightForm();
  document.querySelector('#body-weight-status').textContent = 'Edit canceled.';
});
const deleteWeightDialog = document.querySelector('#delete-weight-dialog');
document.querySelector('#cancel-delete-weight').addEventListener('click', () => deleteWeightDialog.close());
deleteWeightDialog.addEventListener('cancel', event => { if (deletingWeight) event.preventDefault(); });
document.querySelector('#confirm-delete-weight').addEventListener('click', async () => {
  if (deletingWeight || deletingWeightId === null) return;
  deletingWeight = true;
  deleteWeightDialog.querySelectorAll('button').forEach(button => { button.disabled = true; });
  const status = document.querySelector('#delete-weight-status');
  status.textContent = 'Deleting entry…';
  try {
    await gymApi(`/body-weight/${deletingWeightId}`, { method: 'DELETE' });
    if (editingWeightId === deletingWeightId) resetWeightForm();
    deletingWeightId = null;
    deleteWeightDialog.close();
    document.querySelector('#body-weight-status').textContent = 'Weight entry deleted.';
    document.querySelector('#body-weight-input').focus();
    try { await refreshWeights(); }
    catch (error) { document.querySelector('#body-weight-status').textContent = `Entry deleted. Refresh to reload history. ${error.message}`; }
  } catch (error) { status.textContent = error.message; }
  finally {
    deletingWeight = false;
    deleteWeightDialog.querySelectorAll('button').forEach(button => { button.disabled = false; });
  }
});
function drawChart() {
  const container = document.querySelector('#chart-container');
  container.replaceChildren();
  const empty = document.querySelector('#chart-empty'), dataRows = document.querySelector('#chart-data-rows');
  dataRows.replaceChildren();
  const { points } = selection;
  empty.hidden = points.length > 0;
  document.querySelector('#chart-data').hidden = points.length === 0;
  empty.textContent = workouts.length ? 'No logged sets match these filters. Try another exercise or time range.' : 'Your progress starts with your first workout. Finish a workout to see your logged sets here.';
  if (selection.workouts.some(workout => workout.weight_unit === null) && !points.length) empty.textContent = 'Open an older workout below and confirm its original weight unit to include it in your progress chart.';
  document.querySelector('#max-weight').textContent = selection.max === null ? '—' : `${number(selection.max)} ${unit}`;
  document.querySelector('#average-weight').textContent = selection.average === null ? '—' : `${number(selection.average)} ${unit}`;
  document.querySelector('#chart-caption').textContent = `Heaviest completed set per session · ${exerciseSelect.selectedOptions[0].textContent}. Summary values use all matching completed sets.`;
  if (!points.length) return;
  const svgNode = (tag, attrs, text) => {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const svg = svgNode('svg', { viewBox: '0 0 600 250', role: 'img', 'aria-labelledby': 'chart-title chart-description' });
  svg.append(svgNode('title', { id: 'chart-title' }, 'Workout weight progress'), svgNode('desc', { id: 'chart-description' }, `${points.length} sessions. Heaviest set: ${number(selection.max)} ${unit}. The data table below contains every plotted value.`));
  const left = 50, right = 575, top = 32, bottom = 210;
  const max = Math.max(1, ...points.map(p => p.weight)) * 1.15;
  const minTime = +new Date(points[0].date), maxTime = +new Date(points[points.length - 1].date);
  const x = p => minTime === maxTime ? (left + right) / 2 : left + ((+new Date(p.date) - minTime) / (maxTime - minTime)) * (right - left);
  const y = weight => bottom - weight / max * (bottom - top);
  for (let i = 0; i <= 4; i++) {
    const weight = max * i / 4;
    svg.append(svgNode('line', { x1: left, x2: right, y1: y(weight), y2: y(weight), class: 'chart-grid' }), svgNode('text', { x: left - 10, y: y(weight) + 4, 'text-anchor': 'end', class: 'chart-label' }, number(weight)));
  }
  svg.append(svgNode('polyline', { points: points.map(p => `${x(p)},${y(p.weight)}`).join(' '), class: 'chart-line' }));
  points.forEach((point, index) => {
    const dot = svgNode('circle', { cx: x(point), cy: y(point.weight), r: 4, class: 'chart-point' });
    dot.append(svgNode('title', {}, `${date(point.date)}: ${number(point.weight)} ${unit}`)); svg.append(dot);
    if (points.length <= 8) svg.append(svgNode('text', { x: x(point), y: y(point.weight) - 11, 'text-anchor': 'middle', class: 'chart-value' }, number(point.weight)));
    if (index === 0 || index === points.length - 1) svg.append(svgNode('text', { x: x(point), y: bottom + 24, 'text-anchor': index === 0 && points.length > 1 ? 'start' : index ? 'end' : 'middle', class: 'chart-label' }, date(point.date)));
    const row = node('tr'); row.append(node('td', date(point.date, { year: 'numeric' })), node('td', `${number(point.weight)} ${unit}`)); dataRows.append(row);
  });
  container.append(svg);
}
function renderHistory() {
  historyList.replaceChildren();
  const items = selection.workouts, totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  page = Math.min(page, totalPages);
  document.querySelector('#history-count').textContent = `${items.length} ${items.length === 1 ? 'session' : 'sessions'}`;
  const empty = document.querySelector('#history-empty');
  empty.hidden = items.length > 0;
  empty.textContent = workouts.length ? 'No finished workouts match your filters.' : 'No finished workouts yet. Your sessions will appear here after you finish a workout.';
  for (const workout of items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)) {
    const button = node('button', undefined, 'history-row'); button.type = 'button'; button.setAttribute('aria-controls', 'workout-details');
    const when = node('span', date(workout.start_time), 'history-date'); when.append(node('small', new Date(workout.start_time).getUTCFullYear()));
    const description = node('span', undefined, 'history-description'), sets = workout.matchingSets;
    const weightText = sets.length ? `${sets.length} ${sets.length === 1 ? 'set' : 'sets'}: ${sets.slice(0, 4).map(s => number(s.weight)).join(', ')}${sets.length > 4 ? ', …' : ''} ${unit}` : 'No completed sets';
    const summaryText = workout.weight_unit === null && sets.length ? `${sets.length} sets · original units unconfirmed` : weightText;
    const names = [...new Set(sets.map(s => s.exercise_name))];
    description.append(node('strong', summaryText), node('small', workout.routine_name || names.join(' · ') || `Workout #${workout.id}`));
    const arrow = node('span', '›', 'history-chevron'); arrow.setAttribute('aria-hidden', 'true');
    button.append(when, description, arrow);
    button.setAttribute('aria-label', `View workout from ${date(workout.start_time, { year: 'numeric' })}, ${summaryText}`);
    button.addEventListener('click', () => openDetails(workout.id, button)); historyList.append(button);
  }
  document.querySelector('#history-pagination').hidden = items.length <= PAGE_SIZE;
  document.querySelector('#history-previous').disabled = page <= 1;
  document.querySelector('#history-next').disabled = page >= totalPages;
  document.querySelector('#history-page').textContent = `Page ${page} of ${totalPages}`;
}
function closeDetails(returnFocus = false) {
  detailRequest++; details.hidden = true;
  if (returnFocus && lastDetailButton?.isConnected) lastDetailButton.focus();
}
async function openDetails(id, button) {
  const request = ++detailRequest;
  lastDetailButton = button; details.hidden = false;
  const message = document.querySelector('#details-status'), body = document.querySelector('#details-content');
  body.replaceChildren(); document.querySelector('#details-heading').textContent = 'Workout details'; message.textContent = 'Loading workout…';
  details.focus(); details.scrollIntoView({ block: 'start' });
  try {
    const { workout } = await gymApi(`/workouts/${id}`);
    if (request !== detailRequest) return;
    document.querySelector('#details-heading').textContent = `Workout · ${date(workout.start_time, { year: 'numeric' })}`;
    const duration = Math.max(0, Math.round((new Date(workout.end_time) - new Date(workout.start_time)) / 60000));
    const time = value => new Date(value).toLocaleTimeString(undefined, { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' });
    body.append(node('p', `${time(workout.start_time)} – ${time(workout.end_time)} UTC · ${duration < 1 ? 'Under 1 minute' : `${duration} min`}`));
    const sets = workout.sets.filter(s => s.completed);
    const workoutUnit = workout.weight_unit === null ? 'unit unconfirmed' : (workout.display_unit || unit);
    if (workout.weight_unit === null) {
      const form = node('form', undefined, 'legacy-unit-form');
      const prompt = node('p', 'This older workout did not record its unit. Choose the unit originally used for these weights so they can convert correctly.');
      const label = node('label', 'Original weight unit');
      const select = node('select'); select.id = `legacy-unit-${id}`; label.htmlFor = select.id;
      for (const [value, text] of [['', 'Choose original unit'], ['lbs', 'Pounds (lbs)'], ['kg', 'Kilograms (kg)']]) {
        const option = node('option', text); option.value = value; select.append(option);
      }
      select.required = true;
      const confirm = node('button', 'Confirm original unit', 'primary'); confirm.type = 'submit';
      const status = node('p', undefined, 'status'); status.setAttribute('role', 'status');
      form.append(prompt, label, select, confirm, status); body.append(form);
      let confirming = false;
      form.addEventListener('submit', async event => {
        event.preventDefault(); if (confirming || !select.value) return;
        confirming = true; confirm.disabled = true; select.disabled = true; status.textContent = 'Saving original unit…';
        try {
          await gymApi(`/workouts/${id}/weight-unit`, { method: 'PUT', body: JSON.stringify({ weightUnit: select.value }) });
          await loadProgress();
          await openDetails(id, null);
        } catch (error) { status.textContent = error.message; }
        finally { confirming = false; confirm.disabled = false; select.disabled = false; }
      });
    }
    if (!sets.length) body.append(node('p', 'This workout has no completed sets.'));
    for (const exerciseId of new Set(sets.map(s => s.exercise_id))) {
      const exerciseSets = sets.filter(s => s.exercise_id === exerciseId);
      body.append(node('h3', exerciseSets[0].exercise_name));
      const wrap = node('div', undefined, 'detail-table-wrap'), table = node('table'), head = node('thead'), row = node('tr');
      table.append(node('caption', `${exerciseSets[0].exercise_name} · completed sets`));
      for (const title of ['Set', `Weight (${workoutUnit})`, 'Reps']) { const th = node('th', title); th.scope = 'col'; row.append(th); }
      head.append(row); table.append(head);
      const tbody = node('tbody');
      for (const set of exerciseSets) { const tr = node('tr'); tr.append(node('td', set.set_number), node('td', number(set.weight)), node('td', set.reps)); tbody.append(tr); }
      table.append(tbody); wrap.append(table); body.append(wrap);
    }
    if (workout.notes) body.append(node('h3', 'Notes'), node('p', workout.notes, 'detail-notes'));
    message.textContent = '';
  } catch (error) {
    if (request !== detailRequest) return;
    message.textContent = `Could not load this workout. ${error.message}`;
    const retry = node('button', 'Try again', 'text-button'); retry.type = 'button'; retry.addEventListener('click', () => openDetails(id, button)); body.append(retry);
  }
}
function applyFilters() {
  closeDetails(); page = 1;
  selection = progressData.select(workouts, exerciseSelect.value, rangeSelect.value);
  drawChart(); renderHistory();
}
async function loadProgress() {
  closeDetails(); content.hidden = true; document.querySelector('#retry-progress').hidden = true; pageStatus.textContent = 'Loading your workouts…';
  try {
    const { user } = await gymApi('/profile');
    const data = await gymApi('/workouts/history');
    const weightData = await gymApi('/body-weight');
    unit = user.weightUnit; workouts = data.workouts;
    bodyWeightEntries = weightData.entries;
    document.querySelector('#body-weight-unit').textContent = unit;
    renderBodyWeightHistory();
    const exercises = new Map();
    for (const workout of workouts) for (const set of workout.sets) exercises.set(set.exercise_id, set.exercise_name);
    exerciseSelect.replaceChildren();
    const all = node('option', 'All exercises'); all.value = 'all'; exerciseSelect.append(all);
    for (const [id, name] of [...exercises].sort((a, b) => a[1].localeCompare(b[1]))) { const option = node('option', name); option.value = id; exerciseSelect.append(option); }
    document.body.dataset.auth = 'ready'; content.hidden = false; applyFilters(); pageStatus.textContent = '';
    if (location.hash === '#workout-history') document.querySelector('#workout-history').scrollIntoView();
  } catch (error) {
    document.body.dataset.auth = 'ready'; pageStatus.textContent = `Could not load your progress. ${error.message}`; document.querySelector('#retry-progress').hidden = false;
  }
}
document.querySelector('#progress-filters').addEventListener('submit', event => { event.preventDefault(); applyFilters(); pageStatus.textContent = `${selection.workouts.length} finished workouts found.`; });
document.querySelector('#retry-progress').addEventListener('click', loadProgress);
document.querySelector('#close-details').addEventListener('click', () => closeDetails(true));
for (const [selector, step] of [['#history-previous', -1], ['#history-next', 1]]) document.querySelector(selector).addEventListener('click', () => { page += step; closeDetails(); renderHistory(); document.querySelector('#workout-history').focus(); });
document.querySelector('[data-logout]').addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true;
  try { await gymApi('/auth/logout', { method: 'POST', body: '{}' }); location.replace('login.html'); }
  catch (error) { pageStatus.textContent = error.message; button.disabled = false; }
});
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
loadProgress();
