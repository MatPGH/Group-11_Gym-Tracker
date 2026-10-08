// Account routes (FR-01 to FR-03).
// Trello card: "Make registration, login, and logout work - Wasif"
const express = require('express');
const notImplemented = require('../middleware/notImplemented');

const router = express.Router();

router.post('/register', notImplemented); // FR-01
router.post('/login', notImplemented);    // FR-02
router.post('/logout', notImplemented);   // FR-03

module.exports = router;
