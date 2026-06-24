const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { nanoid } = require('nanoid');

const app = express();

// Serve the frontend from /temple-website
const FRONTEND_DIR = path.resolve(__dirname, '..', 'temple-website');
const UPLOAD_DIR = path.resolve(__dirname, 'uploads');
const FILES_DIR = path.resolve(UPLOAD_DIR, 'files');
const DB_PATH = path.resolve(UPLOAD_DIR, 'db.json');

fs.mkdirSync(FILES_DIR, { recursive: true });
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify({ files: [] }, null, 2), 'utf8');
}

app.use(cors());
app.use(express.json());
app.use(express.static(FRONTEND_DIR));

function readDB() {
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  return JSON.parse(raw || '{"files":[]}');
}

function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, FILES_DIR);
  },
  filename: function (_req, file, cb) {
    const id = nanoid(12);
    const ext = path.extname(file.originalname || '');
    cb(null, `${id}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50 MB
  }
});

// List uploaded files
app.get('/api/files', (_req, res) => {
  const db = readDB();
  res.json(db.files);
});

// Upload a file (admin passcode is enforced ONLY on frontend in this simple version)
app.post('/api/files', upload.single('file'), (req, res) => {
  const { title = '', description = '', fileType = '' } = req.body || {};

  if (!req.file) {
    return res.status(400).json({ error: 'file_missing' });
  }
  if (!title.trim()) {
    // Keep the file on disk? In this simple backend, we delete it if title invalid.
    try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    return res.status(400).json({ error: 'title_missing' });
  }

  const id = path.basename(req.file.filename, path.extname(req.file.filename));
  const record = {
    id,
    title: title.trim(),
    description: String(description || '').trim(),
    fileType: String(fileType || '').trim(),
    originalName: req.file.originalname,
    storedName: req.file.filename,
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploadedAt: new Date().toISOString()
  };

  const db = readDB();
  db.files.unshift(record);
  writeDB(db);

  res.status(201).json(record);
});

// Download a file by id
app.get('/api/files/:id/download', (req, res) => {
  const { id } = req.params;
  const db = readDB();
  const record = db.files.find((f) => f.id === id);
  if (!record) return res.status(404).send('Not found');

  const fullPath = path.resolve(FILES_DIR, record.storedName);
  if (!fs.existsSync(fullPath)) return res.status(404).send('File missing on disk');

  res.download(fullPath, record.originalName);
});

// Delete a file by id
app.delete('/api/files/:id', (req, res) => {
  const { id } = req.params;
  const db = readDB();
  const idx = db.files.findIndex((f) => f.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not_found' });

  const [record] = db.files.splice(idx, 1);
  writeDB(db);

  const fullPath = path.resolve(FILES_DIR, record.storedName);
  try { fs.unlinkSync(fullPath); } catch { /* ignore */ }

  res.json({ ok: true });
});

// SPA-ish fallback: serve index.html for any other route
app.get('*', (_req, res) => {
  res.sendFile(path.resolve(FRONTEND_DIR, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Temple website running at http://localhost:${PORT}`);
  console.log(`Uploads stored in: ${FILES_DIR}`);
  console.log(`Metadata stored in: ${DB_PATH}`);
});

