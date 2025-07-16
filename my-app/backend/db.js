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

  // Create the folders table
  db.run(`
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    )
  `);

  // Add folder_id to chats if it doesn't exist
  db.all(`PRAGMA table_info(chats)`, (err, columns) => {
    if (err) {
      console.error("Failed to check chats columns:", err);
      return;
    }
    const hasFolderId = Array.isArray(columns) && columns.some(col => col.name === 'folder_id');
    if (!hasFolderId) {
      db.run(`ALTER TABLE chats ADD COLUMN folder_id INTEGER REFERENCES folders(id)`, (err2) => {
        if (err2) {
          if (err2.message && err2.message.includes('duplicate column name')) {
            console.log("folder_id column already exists in chats table.");
          } else {
            console.error("Error adding folder_id column:", err2);
          }
        } else {
          console.log("Added folder_id column to chats table.");
        }
      });
    } else {
      console.log("folder_id column already exists in chats table.");
    }
  });

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
