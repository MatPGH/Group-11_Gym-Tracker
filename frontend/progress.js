'use strict';
const pageStatus = document.querySelector('#page-status');
const content = document.querySelector('#progress-content');
const exerciseSelect = document.querySelector('#progress-exercise');
const rangeSelect = document.querySelector('#progress-range');
const details = document.querySelector('#workout-details');
const historyList = document.querySelector('#history-list');
let workouts = [], unit = 'lbs', page = 1, selection = null, detailRequest = 0, lastDetailButton = null;
const PAGE_SIZE = 5;
const number = value => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
const date = (value, options = {}) => new Date(value).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', ...options });
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function drawChart() {
  const container = document.querySelector('#chart-container');
  container.replaceChildren();
  const empty = document.querySelector('#chart-empty'), dataRows = document.querySelector('#chart-data-rows');
  dataRows.replaceChildren();
  const { points } = selection;
  empty.hidden = points.length > 0;
  document.querySelector('#chart-data').hidden = points.length === 0;
  empty.textContent = workouts.length ? 'No logged sets match these filters. Try another exercise or time range.' : 'Your progress starts with your first workout. Finish a workout to see your logged sets here.';
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
    const names = [...new Set(sets.map(s => s.exercise_name))];
    description.append(node('strong', weightText), node('small', workout.routine_name || names.join(' · ') || `Workout #${workout.id}`));
    const arrow = node('span', '›', 'history-chevron'); arrow.setAttribute('aria-hidden', 'true');
    button.append(when, description, arrow);
    button.setAttribute('aria-label', `View workout from ${date(workout.start_time, { year: 'numeric' })}, ${weightText}`);
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
    if (!sets.length) body.append(node('p', 'This workout has no completed sets.'));
    for (const exerciseId of new Set(sets.map(s => s.exercise_id))) {
      const exerciseSets = sets.filter(s => s.exercise_id === exerciseId);
      body.append(node('h3', exerciseSets[0].exercise_name));
      const wrap = node('div', undefined, 'detail-table-wrap'), table = node('table'), head = node('thead'), row = node('tr');
      table.append(node('caption', `${exerciseSets[0].exercise_name} · completed sets`));
      for (const title of ['Set', `Weight (${unit})`, 'Reps']) { const th = node('th', title); th.scope = 'col'; row.append(th); }
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
    const { user } = await gymApi('/profile'), data = await gymApi('/workouts/history');
    unit = user.weightUnit; workouts = data.workouts;
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
