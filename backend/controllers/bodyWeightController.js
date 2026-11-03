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

  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Enter a valid date.' });
  }

  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) {
    return res.status(400).json({ error: 'Enter a valid weight.' });
  }

  try {
    const user = await users.findById(req.session.userId);

    const entry = await bodyWeight.addWeightEntry(
      req.session.userId,
      date,
      weight,
      user.weight_unit
    );

    res.status(201).json({ entry });
  } catch (err) {
    res.status(500).json({ error: 'Unable to save weight entry.' });
  }
}

module.exports = { getWeightHistory, addWeightEntry };