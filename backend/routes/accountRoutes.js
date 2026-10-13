const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const users = require('../models/userModel');
const accounts = require('../models/accountModel');
const router = express.Router();

router.use(requireAuth);
router.use(async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const user = await users.findById(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Please sign in first.' });
  req.accountUser = user;
  next();
});
const publicProfile = user => ({ id: user.id, name: user.name, email: user.email, weightUnit: user.weight_unit });
router.get('/profile', (req, res) => res.json({ user: publicProfile(req.accountUser) }));
router.put('/profile', async (req, res) => {
  const { name, weightUnit } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 60) {
    return res.status(400).json({ error: 'Display name must contain 1–60 characters.' });
  }
  if (!['lbs', 'kg'].includes(weightUnit)) {
    return res.status(400).json({ error: 'Choose pounds (lbs) or kilograms (kg).' });
  }
  const user = await accounts.updateProfile(req.session.userId, name.trim(), weightUnit);
  res.json({ user: publicProfile(user) });
});
router.get('/dashboard', async (req, res) => res.json(await accounts.dashboard(req.session.userId)));

module.exports = router;
