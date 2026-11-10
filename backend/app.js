// Builds the Express app (kept separate from server.js so it can be tested
// without opening a port).
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');

const apiRoutes = require('./routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const production = process.env.NODE_ENV === 'production';
const db = require('./database');
app.disable('x-powered-by');
if (production) app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  if (production) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    // Render's internal health probe can use HTTP. Public pages require HTTPS.
    if (!(req.method === 'GET' && req.path === '/api/health') && req.get('x-forwarded-proto') !== 'https') return res.status(400).json({ error: 'Use HTTPS to access Gym Tracker.' });
    const origin = req.get('origin');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin && origin !== 'https://' + req.get('host')) {
      return res.status(403).json({ error: 'Request origin is not allowed.' });
    }
  }
  next();
});
if (production) app.use('/api/auth', require('express-rate-limit').rateLimit({
  windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'Too many sign-in requests. Please try again later.' }
}));
const databaseReady = require('./migrateDatabase')(require('./database'));
databaseReady.catch(error => console.error('Database migration failed:', error.message));
app.use(async (req, res, next) => {
  try { await databaseReady; next(); } catch (error) { next(error); }
});

// Parse JSON and form bodies sent by the View (browser).
app.use('/api/profile/picture', express.json({ limit: '400kb' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sign-in sessions (FR-02, FR-03). The browser keeps a cookie; the server
// remembers which user it belongs to. The secret comes from .env so it is
// never stored in the code.
let sessionSecret = process.env.SESSION_SECRET;
if (production && (!sessionSecret || sessionSecret.length < 32 || sessionSecret.startsWith('change-me'))) {
  throw new Error('A strong SESSION_SECRET of at least 32 characters is required in production.');
}
if (!sessionSecret) {
  sessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('SESSION_SECRET is not set in .env, so everyone is signed out whenever the server restarts.');
}
const sessionStore = db.pool ? new (require('connect-pg-simple')(session))({
  pool: db.pool, createTableIfMissing: false, pruneSessionInterval: false
}) : undefined;
app.locals.sessionStore = sessionStore;
app.use(session({
  store: sessionStore,
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: production,
    httpOnly: true,       // page scripts can't read the cookie
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7 // stay signed in for 7 days
  }
}));

// Serve the front-end pages (HTML/CSS/JS) from /frontend.
// Uses an absolute path so the server works no matter which folder you start it from.
app.get('/history.html', (req, res) => res.redirect(302, '/progress.html#workout-history'));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// All backend endpoints live under /api.
app.use('/api', apiRoutes);

// Unknown routes and errors.
app.use(notFound);
app.use(errorHandler);

module.exports = app;
