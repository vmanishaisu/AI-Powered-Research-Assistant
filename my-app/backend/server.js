require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { OpenAI } = require('openai');
const pdf = require('pdf-parse');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});
const upload = multer({ storage });

let dynamicOpenAIKey = process.env.OPENAI_API_KEY;

// Retrieve all chats from the database, ordered by most recent
app.get('/chats', (req, res) => {
  db.all(`SELECT * FROM chats ORDER BY id DESC`, (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }
    // Parse the messages field for each chat, handling errors gracefully
    const parsedRows = rows.map(row => {
      let messages = [];
      try {
        messages = row.messages ? JSON.parse(row.messages) : [];
        if (!Array.isArray(messages)) messages = [];
      } catch {
        messages = [];
      }
      return { ...row, messages };
    });
    res.json(parsedRows);
  });
});

// Create a new chat with a title, optional folder_id, and empty messages
app.post('/chats', (req, res) => {
  const { title, folder_id } = req.body;
  db.run(
    `INSERT INTO chats (title, folder_id, messages) VALUES (?, ?, ?)`,
    [title || 'Untitled', folder_id || null, '[]'],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).send('Failed to create chat');
      }
      res.json({ id: this.lastID, title: title || 'Untitled', folder_id: folder_id || null, messages: [] });
    }
  );
});

// Save the messages array for a specific chat
app.post('/chats/:chatId/messages', (req, res) => {
  const { chatId } = req.params;
  const { messages } = req.body;
  if (!Array.isArray(messages)) {
    return res.status(400).send('Messages must be an array');
  }
  db.run(`UPDATE chats SET messages = ? WHERE id = ?`, [JSON.stringify(messages), chatId], function (err) {
    if (err) {
      console.error(err);
      return res.status(500).send('Failed to save messages');
    }
    res.sendStatus(200);
  });
});

// Upload a PDF or image file to a specific chat
app.post('/upload/:chatId', upload.single('file'), (req, res) => {
  const chatId = req.params.chatId;
  const file = req.file;
  if (!file) return res.status(400).send('No file uploaded');
  // Make sure the chat exists before saving the file
  db.get('SELECT id FROM chats WHERE id = ?', [chatId], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }
    if (!row) {
      return res.status(400).send('Chat does not exist');
    }
    db.run(
      `INSERT INTO pdfs (chat_id, filename, filepath, mimetype) VALUES (?, ?, ?, ?)`,
      [chatId, file.originalname, file.path, file.mimetype],
      function (err) {
        if (err) {
          console.error(err);
          return res.status(500).send('Database error');
        }
        res.json({ id: this.lastID, filename: file.originalname });
      }
    );
  });
});

// Retrieve all PDFs for a specific chat
app.get('/chats/:chatId/pdfs', (req, res) => {
  const chatId = req.params.chatId;
  db.all(`SELECT * FROM pdfs WHERE chat_id = ? ORDER BY uploaded_at DESC`, [chatId], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }
    res.json(rows);
  });
});

// Rename a chat with a new title
app.put('/chats/:chatId', (req, res) => {
  const { chatId } = req.params;
  const { title } = req.body;
  if (!title || typeof title !== 'string') {
    return res.status(400).send('Invalid title');
  }
  db.run('UPDATE chats SET title = ? WHERE id = ?', [title, chatId], function (err) {
    if (err) {
      console.error(err);
      return res.status(500).send('Failed to rename chat');
    }
    res.sendStatus(200);
  });
});

// Delete a chat and all its associated PDFs
app.delete('/chats/:chatId', (req, res) => {
  const { chatId } = req.params;
  // First, remove all PDFs linked to the chat
  db.run('DELETE FROM pdfs WHERE chat_id = ?', [chatId], function (err) {
    if (err) {
      console.error(err);
      return res.status(500).send('Failed to delete PDFs');
    }
    // Then, remove the chat itself
    db.run('DELETE FROM chats WHERE id = ?', [chatId], function (err2) {
      if (err2) {
        console.error(err2);
        return res.status(500).send('Failed to delete chat');
      }
      res.sendStatus(200);
    });
  });
});

// Set the OpenAI API key at runtime via an API endpoint
app.post('/api/set-openai-key', (req, res) => {
  dynamicOpenAIKey = req.body.apikey;
  if (!dynamicOpenAIKey) return res.status(400).json({ error: 'API key required' });
  res.json({ success: true });
});

// Handle Q&A requests using OpenAI, with support for PDF and image context
app.post('/api/ask', async (req, res) => {
  const { question, chatId } = req.body;
  if (!question) return res.status(400).json({ error: 'Question is required' });
  if (!dynamicOpenAIKey) return res.status(400).json({ error: 'OpenAI API key not set.' });

  console.log("🔹 Question:", question);
  console.log("🔹 Chat ID:", chatId);
  console.log("🔹 Using OpenAI Key:", dynamicOpenAIKey);

  const openai = new OpenAI({ apiKey: dynamicOpenAIKey });
  let messages = [];
  let useVisionModel = false;
  let context = '';

  // Load previous chat messages
  if (chatId) {
    try {
      const chatRow = await new Promise((resolve, reject) => {
        db.get('SELECT messages FROM chats WHERE id = ?', [chatId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (chatRow?.messages) {
        const previousMessages = JSON.parse(chatRow.messages);
        if (Array.isArray(previousMessages)) {
          messages = [...previousMessages];
        }
      }
    } catch (err) {
      // console.error("❌ Failed to load previous messages:", err);
    }
  }

  // Determine if the question is document-related
  const isPDFRelated = /summarize|explain|according to|in the pdf|based on the document|tools used|abstract|what does it say|methods used/i.test(question);

  // Try to get file context if needed
  if (chatId && isPDFRelated) {
    try {
      const fileRow = await new Promise((resolve, reject) => {
        db.get(
          'SELECT filepath, mimetype FROM pdfs WHERE chat_id = ? ORDER BY uploaded_at DESC LIMIT 1',
          [chatId],
          (err, row) => (err ? reject(err) : resolve(row))
        );
      });

      if (fileRow && fileRow.filepath && fs.existsSync(fileRow.filepath)) {
        const dataBuffer = fs.readFileSync(fileRow.filepath);

        if (fileRow.mimetype === 'application/pdf') {
          const pdfData = await pdf(dataBuffer);
          // console.log("📄 Extracted PDF text length:", pdfData.text.length);
          context = `The following document has been uploaded for reference:\n\n"""${pdfData.text.substring(0, 3000)}"""\n\n`;
        } else if (fileRow.mimetype.startsWith('image/')) {
          const base64Image = dataBuffer.toString('base64');
          messages.push({
            role: 'user',
            content: [
              { type: 'text', text: question },
              {
                type: 'image_url',
                image_url: { url: `data:${fileRow.mimetype};base64,${base64Image}` },
              },
            ],
          });
          useVisionModel = true;
        }
      }
    } catch (err) {
      // console.error("❌ Error extracting file context:", err);
    }
  }

  // Inject system context and user message
  if (!useVisionModel) {
    if (context) {
      messages.unshift({ role: 'system', content: context });
    }
    messages.push({ role: 'user', content: question });
  }

  // Clean up the message list to make sure it's valid
  messages = messages.filter(
    (m) =>
      m &&
      typeof m === 'object' &&
      ['user', 'assistant', 'system'].includes(m.role) &&
      (typeof m.content === 'string' || Array.isArray(m.content))
  );

  // Log the final messages we're sending to OpenAI
  // console.log("🧹 Final messages sent to OpenAI:");
  // console.dir(messages, { depth: null });

  // Send to OpenAI
  let answer = '';
  try {
    const completion = await openai.chat.completions.create({
      model: useVisionModel ? 'gpt-4-vision-preview' : 'gpt-3.5-turbo',
      messages,
      max_tokens: 512,
    });

    answer = completion.choices?.[0]?.message?.content || "OpenAI returned an empty response.";
    messages.push({ role: 'assistant', content: answer });
  } catch (err) {
    // console.error("❌ OpenAI Completion Error:", err.response?.data || err.message || err);
    return res.status(500).json({ error: 'Failed to get answer from OpenAI.' });
  }

  // Save updated messages to database
  if (chatId) {
    db.run(
      `UPDATE chats SET messages = ? WHERE id = ?`,
      [JSON.stringify(messages), chatId],
      (err) => {
        if (err) console.error("❌ Failed to save messages:", err);
      }
    );
  }

  // Generate follow-up questions
  let followups = [];
  try {
    const followupPrompt = `Based on the previous answer, suggest 3 relevant follow-up questions a user might ask next. Respond with each question on a new line, no numbering or extra text.`;

    const followupCompletion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        ...messages,
        { role: 'user', content: followupPrompt }
      ],
      max_tokens: 100,
    });

    followups = followupCompletion.choices?.[0]?.message?.content
      ?.split('\n')
      .map(q => q.trim())
      .filter(q => q.length > 0) || [];
  } catch (err) {
    console.error("⚠️ Follow-up question generation failed:", err.response?.data || err.message || err);
  }

  res.json({ answer, followups });
});

// Serve a file by ID
app.get('/files/:fileId', (req, res) => {
  const { fileId } = req.params;
  db.get('SELECT filepath, mimetype, filename FROM pdfs WHERE id = ?', [fileId], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }
    if (!row) return res.status(404).send('File not found');
    if (!fs.existsSync(row.filepath)) return res.status(404).send('File not found on disk');
    
    res.setHeader('Content-Type', row.mimetype);
    res.setHeader('Content-Disposition', `inline; filename="${row.filename}"`);
    res.sendFile(row.filepath);
  });
});

// Delete a file from disk and database
app.delete('/files/:fileId', (req, res) => {
  const { fileId } = req.params;
  db.get('SELECT filepath FROM pdfs WHERE id = ?', [fileId], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }
    if (!row) return res.status(404).send('File not found');
    // Delete the file from disk
    try {
      if (fs.existsSync(row.filepath)) fs.unlinkSync(row.filepath);
    } catch (e) {
      console.error('Failed to delete file from disk:', e);
    }
    // Delete from database
    db.run('DELETE FROM pdfs WHERE id = ?', [fileId], function (err2) {
      if (err2) {
        console.error(err2);
        return res.status(500).send('Failed to delete file');
      }
      res.sendStatus(200);
    });
  });
});

// FOLDER ENDPOINTS
// List all folders
app.get('/folders', (req, res) => {
  db.all('SELECT * FROM folders ORDER BY id DESC', (err, rows) => {
    if (err) return res.status(500).send('Database error');
    res.json(rows);
  });
});
// Create a new folder
app.post('/folders', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).send('Folder name required');
  db.run('INSERT INTO folders (name) VALUES (?)', [name], function (err) {
    if (err) return res.status(500).send('Database error');
    res.json({ id: this.lastID, name });
  });
});
// Rename a folder
app.put('/folders/:folderId', (req, res) => {
  const { folderId } = req.params;
  const { name } = req.body;
  if (!name) return res.status(400).send('Folder name required');
  db.run('UPDATE folders SET name = ? WHERE id = ?', [name, folderId], function (err) {
    if (err) return res.status(500).send('Database error');
    res.sendStatus(200);
  });
});
// Delete a folder and all its chats and PDFs
app.delete('/folders/:folderId', (req, res) => {
  const { folderId } = req.params;
  // First, delete all PDFs for chats in this folder
  db.all('SELECT id FROM chats WHERE folder_id = ?', [folderId], (err, chats) => {
    if (err) return res.status(500).send('Database error');
    const chatIds = chats.map(c => c.id);
    if (chatIds.length > 0) {
      db.run(`DELETE FROM pdfs WHERE chat_id IN (${chatIds.map(() => '?').join(',')})`, chatIds, function (err2) {
        if (err2) return res.status(500).send('Database error');
        // Now delete the chats
        db.run('DELETE FROM chats WHERE folder_id = ?', [folderId], function (err3) {
          if (err3) return res.status(500).send('Database error');
          // Finally, delete the folder
          db.run('DELETE FROM folders WHERE id = ?', [folderId], function (err4) {
            if (err4) return res.status(500).send('Database error');
            res.sendStatus(200);
          });
        });
      });
    } else {
      // No chats, just delete the folder
      db.run('DELETE FROM folders WHERE id = ?', [folderId], function (err4) {
        if (err4) return res.status(500).send('Database error');
        res.sendStatus(200);
      });
    }
  });
});
// Get chats by folder
app.get('/folders/:folderId/chats', (req, res) => {
  const { folderId } = req.params;
  db.all('SELECT * FROM chats WHERE folder_id = ? ORDER BY id DESC', [folderId], (err, rows) => {
    if (err) return res.status(500).send('Database error');
    // Parse messages for each chat
    const parsedRows = rows.map(row => {
      let messages = [];
      try {
        messages = row.messages ? JSON.parse(row.messages) : [];
        if (!Array.isArray(messages)) messages = [];
      } catch {
        messages = [];
      }
      return { ...row, messages };
    });
    res.json(parsedRows);
  });
});
// Move a chat to a folder
app.put('/chats/:chatId/folder', (req, res) => {
  const { chatId } = req.params;
  const { folder_id } = req.body;
  db.run('UPDATE chats SET folder_id = ? WHERE id = ?', [folder_id, chatId], function (err) {
    if (err) return res.status(500).send('Database error');
    res.sendStatus(200);
  });
});

app.listen(5000, () => console.log('Backend running on http://localhost:5000'));