'use strict';
// UTC dates match the Dashboard. Metrics use every matching completed set.
const progressData = {
  select(workouts, exerciseId, days, now = new Date()) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (days !== 'all') start.setUTCDate(start.getUTCDate() - Number(days) + 1);
    const selected = workouts.filter(w => w.end_time && new Date(w.start_time) <= now &&
      (days === 'all' || new Date(w.start_time) >= start))
      .map(w => ({ ...w, matchingSets: w.sets.filter(s => exerciseId === 'all' || String(s.exercise_id) === String(exerciseId)) }))
      .filter(w => exerciseId === 'all' || w.matchingSets.length)
      .sort((a, b) => new Date(b.start_time) - new Date(a.start_time) || b.id - a.id);
    const weights = selected.flatMap(w => w.matchingSets.map(s => s.weight));
    return { workouts: selected,
      points: selected.filter(w => w.matchingSets.length).slice().reverse().map(w => ({
        id: w.id, date: w.start_time, weight: Math.max(...w.matchingSets.map(s => s.weight))
      })),
      max: weights.length ? Math.max(...weights) : null,
      average: weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : null };
  }
};
if (typeof module !== 'undefined' && module.exports) module.exports = progressData;
