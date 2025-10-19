const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');

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

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    files: 20,
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (_, file, cb) => {
    if (file?.mimetype?.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image uploads are supported.'));
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

app.post('/api/uploads', upload.array('images', 20), async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No images received.' });
  }

  try {
    const manifest = readStoredUploads();
    const now = Date.now();
    const createdEntries = [];

    for (const file of req.files) {
      const timestamp = Date.now();
      const randomSuffix = Math.round(Math.random() * 1e6);
      const baseName = path
        .basename(file.originalname, path.extname(file.originalname))
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 32) || 'image';
      const filename = `${baseName}-${timestamp}-${randomSuffix}.webp`;
      const targetPath = path.join(UPLOADS_DIR, filename);

      let outputInfo;
      try {
        outputInfo = await sharp(file.buffer, { failOnError: false })
          .rotate()
          .webp({ quality: 90 })
          .toFile(targetPath);
      } catch (error) {
        throw new Error(`Failed to process image ${file.originalname}: ${error.message}`);
      }

      const record = {
        id: randomUUID(),
        originalName: file.originalname,
        originalMimeType: file.mimetype,
        mimeType: 'image/webp',
        size: outputInfo.size,
        width: outputInfo.width ?? null,
        height: outputInfo.height ?? null,
        filename,
        relativePath: `/uploads/${filename}`,
        order: manifest.length,
        createdAt: now,
      };

      manifest.push(record);
      createdEntries.push({
        ...record,
        url: `${req.protocol}://${req.get('host')}${record.relativePath}`,
      });
    }

    writeStoredUploads(manifest);

    return res.status(201).json({
      assets: createdEntries,
      stored: createdEntries,
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/uploads', (req, res) => {
  const manifest = readStoredUploads();
  const assets = manifest.map((record) => ({
    ...record,
    url: `${req.protocol}://${req.get('host')}${record.relativePath}`,
  }));
  res.json({ assets });
});

app.delete('/api/uploads/:id', (req, res) => {
  const manifest = readStoredUploads();
  const index = manifest.findIndex((record) => record.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: 'Upload not found.' });
  }

  const [removed] = manifest.splice(index, 1);
  writeStoredUploads(manifest);

  try {
    const filePath = path.join(UPLOADS_DIR, removed.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.warn(`Failed to delete file ${removed.filename}:`, error);
  }

  return res.status(200).json({
    removed: {
      ...removed,
      url: `${req.protocol}://${req.get('host')}${removed.relativePath}`,
    },
  });
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
