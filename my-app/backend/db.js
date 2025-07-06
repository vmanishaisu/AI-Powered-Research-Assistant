const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'files.db'));

db.run('PRAGMA foreign_keys = ON');

db.serialize(() => {
  // Create the chats table
  db.run(`
    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT DEFAULT 'Untitled',
      messages TEXT
    )
  `);

  // Check if the pdfs table already exists
  db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='pdfs'`, (err, row) => {
    if (err) {
      console.error("Failed to check for 'pdfs' table:", err);
      return;
    }

    if (row) {
      // The pdfs table exists, let's check if it has the right foreign key setup
      db.all("PRAGMA foreign_key_list(pdfs)", (fkErr, fkRows) => {
        if (fkErr) {
          console.error("Failed to inspect foreign keys:", fkErr);
          return;
        }

        const hasCascade = fkRows.some(row => row.on_delete.toUpperCase() === 'CASCADE');
        if (!hasCascade) {
          console.log("Migrating 'pdfs' table to support ON DELETE CASCADE...");

          db.serialize(() => {
            db.run(`
              CREATE TABLE IF NOT EXISTS pdfs_temp (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id INTEGER,
                filename TEXT,
                filepath TEXT,
                uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                mimetype TEXT,
                FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
              )
            `);

            db.run(`
              INSERT INTO pdfs_temp (id, chat_id, filename, filepath, uploaded_at, mimetype)
              SELECT id, chat_id, filename, filepath, uploaded_at, mimetype FROM pdfs
            `);

            db.run(`DROP TABLE pdfs`);
            db.run(`ALTER TABLE pdfs_temp RENAME TO pdfs`);

            console.log("Migration completed: 'pdfs' now uses ON DELETE CASCADE.");
          });
        } else {
          console.log("'pdfs' table already has ON DELETE CASCADE.");
        }
      });
    } else {
      // Create the pdfs table with ON DELETE CASCADE
      db.run(`
        CREATE TABLE pdfs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_id INTEGER,
          filename TEXT,
          filepath TEXT,
          uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          mimetype TEXT,
          FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
        )
      `);
      console.log("'pdfs' table created with ON DELETE CASCADE.");
    }
  });
});

module.exports = db;
