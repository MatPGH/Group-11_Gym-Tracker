// Entry point: loads settings from .env and starts the HTTP server.
require('dotenv').config();

const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Gym Tracker server running on http://localhost:${PORT}`);
});
