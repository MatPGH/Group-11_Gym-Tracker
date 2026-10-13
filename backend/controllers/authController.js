// Account controller: register, login, logout, and "who am I" (FR-01 to FR-03).
const userModel = require('../models/userModel');
const { hashPassword, verifyPassword } = require('../utils/password');

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

// Only these fields are ever sent back to the browser.
function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, weightUnit: user.weight_unit };
}

// POST /api/auth/register  { name, email, password }  (FR-01)
async function register(req, res) {
  const { name, password } = req.body || {};
  const email = cleanEmail(req.body && req.body.email);
  const displayName = typeof name === 'string' ? name.trim() : '';

  if (!displayName) {
    return res.status(400).json({ error: 'Enter your name.' });
  }
  if (!EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
  }
  if (await userModel.findByEmail(email)) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const passwordHash = await hashPassword(password);
  let id;
  try {
    id = await userModel.create({ name: displayName, email, passwordHash });
  } catch (err) {
    // Two sign-ups with the same email at the same moment.
    if (err.code === 'SQLITE_CONSTRAINT') {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }
    throw err;
  }

  const user = await userModel.findById(id);
  return res.status(201).json({ user: publicUser(user) });
}

// POST /api/auth/login  { email, password }  (FR-02)
async function login(req, res) {
  const email = cleanEmail(req.body && req.body.email);
  const password = req.body && req.body.password;

  const user = email && typeof password === 'string' ? await userModel.findByEmail(email) : null;
  const valid = user ? await verifyPassword(password, user.password_hash) : false;

  if (!valid) {
    // Same message for wrong email or wrong password, so nobody can probe which emails exist.
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  // New session ID on login (prevents session fixation).
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Could not sign you in. Try again.' });
    req.session.userId = user.id;
    return res.json({ user: publicUser(user) });
  });
}

// POST /api/auth/logout  (FR-03)
function logout(req, res) {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Could not sign you out. Try again.' });
    res.clearCookie('connect.sid');
    return res.json({ message: 'Signed out.' });
  });
}

// GET /api/auth/me  -> the signed-in user, or 401 if nobody is signed in.
async function me(req, res) {
  const user = await userModel.findById(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: 'Not signed in.' });
  }
  return res.json({ user: publicUser(user) });
}

module.exports = { register, login, logout, me };
