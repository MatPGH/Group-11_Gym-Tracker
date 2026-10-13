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

// Parse JSON and form bodies sent by the View (browser).
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sign-in sessions (FR-02, FR-03). The browser keeps a cookie; the server
// remembers which user it belongs to. The secret comes from .env so it is
// never stored in the code.
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  sessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('SESSION_SECRET is not set in .env, so everyone is signed out whenever the server restarts.');
}
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,       // page scripts can't read the cookie
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7 // stay signed in for 7 days
  }
}));

// Serve the front-end pages (HTML/CSS/JS) from /frontend.
// Uses an absolute path so the server works no matter which folder you start it from.
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// All backend endpoints live under /api.
app.use('/api', apiRoutes);

// Unknown routes and errors.
app.use(notFound);
app.use(errorHandler);

module.exports = app;
