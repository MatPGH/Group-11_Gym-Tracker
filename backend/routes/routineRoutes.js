// Routine routes (FR-06 to FR-08).
// Trello cards: "Connect Routine pages to the backend - Wasif" and
// "Make routines save, edit, and delete in SQLite - Taylor"
const express = require('express');
const notImplemented = require('../middleware/notImplemented');

const router = express.Router();

router.get('/', notImplemented);       // list the user's routines
router.post('/', notImplemented);      // FR-06 create
router.put('/:id', notImplemented);    // FR-07 edit
router.delete('/:id', notImplemented); // FR-08 delete

module.exports = router;
