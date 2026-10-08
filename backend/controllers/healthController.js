// Controller for GET /api/health.
exports.getHealth = (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
};
