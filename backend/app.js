// Builds the Express app (kept separate from server.js so it can be tested
// without opening a port).
const path = require('path');
const express = require('express');

const apiRoutes = require('./routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Parse JSON and form bodies sent by the View (browser).
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the front-end pages (HTML/CSS/JS) from /frontend.
// Uses an absolute path so the server works no matter which folder you start it from.
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// All backend endpoints live under /api.
app.use('/api', apiRoutes);

// Unknown routes and errors.
app.use(notFound);
app.use(errorHandler);

module.exports = app;
