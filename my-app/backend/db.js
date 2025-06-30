const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'files.db'));

db.run('PRAGMA foreign_keys = ON');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT DEFAULT 'Untitled',
      messages TEXT
    )
  `);

  // Create the pdfs table without the new column first, so it works with existing databases
  db.run(`
    CREATE TABLE IF NOT EXISTS pdfs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER,
      filename TEXT,
      filepath TEXT,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (chat_id) REFERENCES chats(id)
    )
  `);

  db.all("PRAGMA table_info(pdfs)", (err, columns) => {
    if (err) {
        console.error("Failed to read 'pdfs' table info:", err);
        return;
    }
    const hasMimetype = columns.some(col => col.name === 'mimetype');
    if (!hasMimetype) {
        db.run("ALTER TABLE pdfs ADD COLUMN mimetype TEXT", (alterErr) => {
            if (alterErr) {
                console.error("Failed to add 'mimetype' column:", alterErr);
            } else {
                console.log("Database updated successfully with 'mimetype' column.");
            }
        });
    }
  });
});

module.exports = db;
