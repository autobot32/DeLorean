const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const allowedOrigins = CLIENT_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'uploads.json');

function ensureDirectories() {
  [UPLOADS_DIR, DATA_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
  }
}

ensureDirectories();

const app = express();
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const storage = multer.diskStorage({
  destination: (_, __, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname).toLowerCase();
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'image';
    const uniqueName = `${baseName}-${timestamp}-${Math.round(Math.random() * 1e6)}${ext || '.jpg'}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    files: 20,
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (_, file, cb) => {
    if (SUPPORTED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, WEBP, or GIF images are supported.'));
    }
  },
});

function readStoredUploads() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to read uploads manifest:', error);
    return [];
  }
}

function writeStoredUploads(records) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to persist uploads manifest:', error);
  }
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/uploads', upload.array('images', 20), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No images received.' });
  }

  const manifest = readStoredUploads();
  const now = Date.now();

  const newEntries = req.files.map((file, index) => {
    const record = {
      id: randomUUID(),
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      filename: file.filename,
      relativePath: `/uploads/${file.filename}`,
      order: manifest.length + index,
      createdAt: now,
    };

    manifest.push(record);
    return record;
  });

  writeStoredUploads(manifest);

  const responseEntries = newEntries.map((record) => ({
    ...record,
    url: `${req.protocol}://${req.get('host')}${record.relativePath}`,
  }));

  return res.status(201).json({ assets: responseEntries });
});

app.get('/api/uploads', (req, res) => {
  const manifest = readStoredUploads();
  const assets = manifest.map((record) => ({
    ...record,
    url: `${req.protocol}://${req.get('host')}${record.relativePath}`,
  }));
  res.json({ assets });
});

app.get('/api/message', (req, res) => {
  res.json({
    message: 'Hello from the DeLorean server!',
    timestamp: Date.now(),
  });
});

app.post('/api/echo', (req, res) => {
  res.json({
    received: req.body,
  });
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message });
  }

  if (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }

  return next();
});

app.listen(PORT, () => {
  console.log(`DeLorean server listening on http://localhost:${PORT}`);
  console.log(`Accepting client connections from: ${allowedOrigins.join(', ')}`);
});
