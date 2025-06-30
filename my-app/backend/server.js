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

// Create a new chat with a title and empty messages
app.post('/chats', (req, res) => {
  const { title } = req.body;
  db.run(`INSERT INTO chats (title, messages) VALUES (?, ?)`, [title || 'Untitled', '[]'], function (err) {
    if (err) {
      console.error(err);
      return res.status(500).send('Failed to create chat');
    }
    res.json({ id: this.lastID, title: title || 'Untitled', messages: [] });
  });
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
  // Check that the chatId exists before saving the file
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
  const openai = new OpenAI({ apiKey: dynamicOpenAIKey });

  let context = "";
  let messages = [{ role: 'user', content: question }];

  // If a chatId is provided, try to find the most recent PDF or image for context
  if (chatId) {
    try {
      const row = await new Promise((resolve, reject) => {
        db.get('SELECT filepath, mimetype FROM pdfs WHERE chat_id = ? ORDER BY uploaded_at DESC LIMIT 1', [chatId], (err, row) => {
          if (err) reject(err);
          resolve(row);
        });
      });

      if (row && row.filepath && fs.existsSync(row.filepath)) {
        // If the file is a PDF, extract its text and use it as context for the question
        if (row.mimetype === 'application/pdf') {
          const dataBuffer = fs.readFileSync(row.filepath);
          const pdfData = await pdf(dataBuffer);
          context = `Based on the following document content, please answer the user's question. Document content: """${pdfData.text.substring(0, 4000)}"""\n\n`;
          messages = [{ role: 'user', content: `${context}Question: ${question}` }];
        }
        // If the file is an image, encode it as base64 and send to the vision model
        else if (row.mimetype.startsWith('image/')) {
          const dataBuffer = fs.readFileSync(row.filepath);
          const base64Image = dataBuffer.toString('base64');
          messages = [
            {
              role: 'user',
              content: [
                { type: 'text', text: question },
                {
                  type: 'image_url',
                  image_url: { url: `data:${row.mimetype};base64,${base64Image}` },
                },
              ],
            },
          ];
        }
      }
    } catch (err) {
      console.error(err);
      // If an error occurs, continue without context
    }
  }

  let answer = '';
  try {
    if (messages[0].content instanceof Array || (messages[0].content && messages[0].content[0]?.type === 'text')) {
      // Use the vision model for images
      const completion = await openai.chat.completions.create({
        model: 'gpt-4-vision-preview',
        messages,
        max_tokens: 512,
      });
      answer = completion.choices[0].message.content;
    } else {
      // Use the text model for regular questions or PDFs
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages,
        max_tokens: 512,
      });
      answer = completion.choices[0].message.content;
    }

    // Request follow-up questions from OpenAI based on the previous answer
    const followupPrompt = `Based on the previous answer, suggest 3 relevant follow-up questions a user might ask next. Respond with each question on a new line, no numbering or extra text.`;
    const followupCompletion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        ...messages,
        { role: 'assistant', content: answer },
        { role: 'user', content: followupPrompt }
      ],
      max_tokens: 100,
    });
    const followups = followupCompletion.choices[0].message.content
      .split('\n')
      .map(q => q.trim())
      .filter(q => q.length > 0);

    res.json({ answer, followups });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get answer from OpenAI.' });
  }
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

app.listen(5000, () => console.log('Backend running on http://localhost:5000'));
