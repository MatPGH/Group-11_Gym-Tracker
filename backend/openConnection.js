// Each transaction owns one connection, for both development and hosting.
module.exports = function openConnection(db) {
  if (db.openConnection) return db.openConnection();
  return new Promise((resolve, reject) => {
    const opened = new (require('sqlite3').Database)(db.filename,
      error => error ? reject(error) : resolve(opened));
  });
};
