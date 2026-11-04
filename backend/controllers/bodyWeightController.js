const bodyWeight = require('../models/bodyWeightModel');
const users = require('../models/userModel');

async function getWeightHistory(req, res) {
  try {
    const user = await users.findById(req.session.userId);
    const entries = await bodyWeight.getWeightHistory(
      req.session.userId,
      user.weight_unit
    );

    res.json({ entries });
  } catch (err) {
    res.status(500).json({ error: 'Unable to retrieve weight history.' });
  }
}

async function addWeightEntry(req, res) {
  const { date, weight } = req.body || {};

  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      date.slice(0, 4) === '0000' || !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date) {
    return res.status(400).json({ error: 'Enter a valid date.' });
  }

  if (typeof weight !== 'number' || !Number.isFinite(weight) || !Number.isFinite(weight * 2.20462) || weight <= 0) {
    return res.status(400).json({ error: 'Enter a valid weight.' });
  }

  try {
    const user = await users.findById(req.session.userId);

    if (req.params.id && (!Number.isSafeInteger(Number(req.params.id)) || Number(req.params.id) < 1)) {
      return res.status(404).json({ error: 'Weight entry not found.' });
    }
    const entry = await (req.params.id ? bodyWeight.updateWeightEntry : bodyWeight.addWeightEntry)(
      req.session.userId,
      date,
      weight,
      user.weight_unit,
      Number(req.params.id)
    );
    if (!entry) return res.status(404).json({ error: 'Weight entry not found.' });
    res.status(req.params.id ? 200 : 201).json({ entry });
  } catch (err) {
    res.status(500).json({ error: 'Unable to save weight entry.' });
  }
}

async function deleteWeightEntry(req, res) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1 || !await bodyWeight.deleteWeightEntry(req.session.userId, id)) {
    return res.status(404).json({ error: 'Weight entry not found.' });
  }
  res.json({ message: 'Weight entry deleted.' });
}
module.exports = { getWeightHistory, addWeightEntry, deleteWeightEntry };
