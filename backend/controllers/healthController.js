// Controller for GET /api/health.
exports.getHealth = async (req, res) => {
  try {
    await new Promise((resolve, reject) => require('../database').get('SELECT 1', (error) => error ? reject(error) : resolve()));
  } catch {
    return res.status(503).json({ status: 'unavailable' });
  }
  res.json({ status: 'ok', time: new Date().toISOString() });
};
