const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const users = require('../models/userModel');
const accounts = require('../models/accountModel');
const extras = require('../models/profileExtrasModel');
const { verifyPassword } = require('../utils/password');
const validPicture = require('../utils/profilePicture');
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

router.get('/profile/picture', async (req, res) => res.json({ image: await extras.picture(req.session.userId) }));
router.put('/profile/picture', async (req, res) => {
  const image = req.body?.image;
  if (image !== null) {
    if (typeof image !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) {
      return res.status(400).json({ error: 'Choose a PNG, JPEG, or WebP picture using the upload control.' });
    }
    if (!validPicture(image)) {
      return res.status(400).json({ error: 'Picture must be a valid PNG up to 512 × 512 pixels and 256 KB.' });
    }
  }
  await extras.savePicture(req.session.userId, image);
  res.json({ image });
});

router.delete('/account', async (req, res) => {
  if (req.body?.confirmation !== 'DELETE') return res.status(400).json({ error: 'Type DELETE to confirm account deletion.' });
  const user = await users.findByEmail(req.accountUser.email);
  if (typeof req.body.password !== 'string' || !await verifyPassword(req.body.password, user.password_hash)) {
    return res.status(400).json({ error: 'Enter your current password to delete your account.' });
  }
  await extras.deleteAccount(req.session.userId);
  req.session.destroy(error => {
    res.clearCookie('connect.sid');
    if (error) return res.status(500).json({ error: 'Account deleted. Sign out or close this window.' });
    res.json({ message: 'Account and saved data deleted.' });
  });
});

module.exports = router;
