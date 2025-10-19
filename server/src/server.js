const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { summarizeMemories, generateMemoryStory, hasGeminiKey } = require('./ai/gemini');
const { synthesizeToFile } = require('./audio/voice');

const fs = require('fs');
const { randomUUID } = require('crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');
const heicConvert = require('heic-convert');

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const allowedOrigins = CLIENT_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'uploads.json');
const PLACEHOLDER_CONTEXTS = [
  'A cherished moment layered with nostalgia and warmth.',
  'An adventure snapshot that still hums with excitement.',
  'A quiet pause that says more than words ever could.',
  'A shared laugh that still echoes through time.',
  'A turning point captured just before everything changed.',
  'A celebration frozen in light, love, and motion.',
];

const AUDIO_DIR = path.join(__dirname, '..', 'audio');

function ensureDirectories() {
  [UPLOADS_DIR, DATA_DIR, AUDIO_DIR].forEach((dir) => {
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
app.use('/audio', express.static(AUDIO_DIR));

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
    return normalizeRecords(JSON.parse(raw));
  } catch (error) {
    console.error('Failed to read uploads manifest:', error);
    return [];
  }
}

function writeStoredUploads(records) {
  try {
    const normalized = normalizeRecords(Array.isArray(records) ? records : []);
    fs.writeFileSync(DATA_FILE, JSON.stringify(normalized, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to persist uploads manifest:', error);
  }
}

function normalizeRecords(records = []) {
  return records.map((record, index) => normalizeRecord(record, index));
}

function normalizeRecord(record, index) {
  if (!record || typeof record !== 'object') {
    return {
      id: randomUUID(),
      order: index,
      context: null,
      story: createStoryState(null, null),
    };
  }

  const rawContext =
    typeof record.context === 'string'
      ? record.context
      : record.context && typeof record.context.text === 'string'
        ? record.context.text
        : null;
  const context =
    typeof rawContext === 'string' && rawContext.trim().length > 0 ? rawContext.trim() : null;

  const storyState = createStoryState(context, record.story);

  return {
    ...record,
    order: typeof record.order === 'number' ? record.order : index,
    context,
    story: storyState,
  };
}

function createStoryState(context, prior = {}) {
  const base = typeof prior === 'object' && prior !== null ? prior : {};
  return {
    status: typeof base.status === 'string' ? base.status : 'pending',
    text: typeof base.text === 'string' ? base.text : null,
    prompt: typeof base.prompt === 'string' ? base.prompt : null,
    updatedAt: typeof base.updatedAt === 'number' ? base.updatedAt : null,
    error: typeof base.error === 'string' ? base.error : null,
    contextHint: typeof base.contextHint === 'string' ? base.contextHint : context || null,
  };
}

function parseContextField(raw) {
  if (raw === undefined || raw === null) {
    return [];
  }

  if (Array.isArray(raw)) {
    return raw.map((value) => sanitizeContextValue(value)).filter((value) => value.length > 0);
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((value) => sanitizeContextValue(value)).filter((value) => value.length > 0);
      }
    } catch (error) {
      // treat raw as plain string
    }
    const single = sanitizeContextValue(raw);
    return single ? [single] : [];
  }

  const fallback = sanitizeContextValue(raw);
  return fallback ? [fallback] : [];
}

function sanitizeContextValue(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}

function generatePlaceholderContext(position, file) {
  const template = PLACEHOLDER_CONTEXTS[position % PLACEHOLDER_CONTEXTS.length];
  const baseName = (() => {
    if (!file?.originalname) return `Memory ${position + 1}`;
    const cleaned = path
      .basename(file.originalname, path.extname(file.originalname))
      .replace(/[_-]+/g, ' ')
      .trim();
    return cleaned || `Memory ${position + 1}`;
  })();

  return `${template} — centered around "${baseName}".`;
}

function withPublicUrl(record, req) {
  if (!record) return record;
  return {
    ...record,
    url: `${req.protocol}://${req.get('host')}${record.relativePath}`,
  };
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
    let orderCounter = manifest.length;
    const contexts = parseContextField(req.body?.contexts ?? req.body?.context);

    const normalizeToWebp = async (file) => {
      const attempt = async (inputBuffer) =>
        sharp(inputBuffer, { failOnError: false })
          .rotate()
          .webp({ quality: 90 })
          .toBuffer({ resolveWithObject: true });

      try {
        return await attempt(file.buffer);
      } catch (error) {
        const isHeicMime =
          ['image/heic', 'image/heif', 'image/heic-sequence'].includes(file.mimetype);
        const ext = (path.extname(file.originalname) || '').toLowerCase();
        const looksHeic = isHeicMime || ['.heic', '.heif'].includes(ext);

        if (looksHeic) {
          try {
            const jpegBuffer = await heicConvert({
              buffer: file.buffer,
              format: 'JPEG',
              quality: 0.95,
            });
            return await attempt(jpegBuffer);
          } catch (heicError) {
            throw new Error(
              `Failed to convert HEIC image ${file.originalname}: ${heicError.message}`,
            );
          }
        }

        throw new Error(`Failed to process image ${file.originalname}: ${error.message}`);
      }
    };

    for (let fileIndex = 0; fileIndex < req.files.length; fileIndex += 1) {
      const file = req.files[fileIndex];
      const timestamp = Date.now();
      const randomSuffix = Math.round(Math.random() * 1e6);
      const baseName =
        path
          .basename(file.originalname, path.extname(file.originalname))
          .replace(/[^a-zA-Z0-9_-]/g, '')
          .slice(0, 32) || 'image';
      const filename = `${baseName}-${timestamp}-${randomSuffix}.webp`;
      const targetPath = path.join(UPLOADS_DIR, filename);

      const { data: webpBuffer, info } = await normalizeToWebp(file);
      await fs.promises.writeFile(targetPath, webpBuffer);

      const providedContext =
        contexts[fileIndex] ?? contexts[createdEntries.length] ?? contexts[orderCounter] ?? null;
      const context =
        typeof providedContext === 'string' && providedContext.trim().length > 0
          ? providedContext.trim()
          : generatePlaceholderContext(orderCounter, file);

      const record = {
        id: randomUUID(),
        originalName: file.originalname,
        originalMimeType: file.mimetype,
        mimeType: 'image/webp',
        size: webpBuffer.length,
        width: info?.width ?? null,
        height: info?.height ?? null,
        filename,
        relativePath: `/uploads/${filename}`,
        order: orderCounter++,
        createdAt: now,
        context,
        story: createStoryState(context, { status: 'pending', updatedAt: now }),
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

app.post('/api/uploads/:id/story', async (req, res) => {
  if (!hasGeminiKey) {
    return res
      .status(503)
      .json({ error: 'Gemini API key is not configured on the server.' });
  }

  const manifest = readStoredUploads();
  const index = manifest.findIndex((record) => record.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: 'Upload not found.' });
  }

  const record = manifest[index];
  const imagePath = path.join(UPLOADS_DIR, record.filename);

  try {
    await fs.promises.access(imagePath, fs.constants.R_OK);
  } catch (error) {
    return res.status(410).json({ error: 'Image file is missing on the server.' });
  }

  const overrideContext =
    typeof req.body?.context === 'string' && req.body.context.trim().length > 0
      ? req.body.context.trim()
      : null;

  const context = overrideContext || record.context || null;
  const totalMemories = manifest.length;
  const position =
    typeof record.order === 'number' && !Number.isNaN(record.order)
      ? record.order
      : index;

  if (!req.body?.force && record.story?.status === 'ready' && record.story.text) {
    return res.json({
      story: record.story,
      asset: withPublicUrl(record, req),
      reused: true,
    });
  }

  record.context = context;
  record.story = createStoryState(context, { status: 'processing', updatedAt: Date.now() });
  writeStoredUploads(manifest);

  try {
    console.log('[Gemini] Generating story', {
      id: record.id,
      filename: record.filename,
      context,
      position,
      totalMemories,
    });

    const { text, prompt } = await generateMemoryStory({
      imagePath,
      mimeType: record.mimeType || 'image/webp',
      context,
      title: record.originalName,
      position,
      total: totalMemories,
    });

    record.story = {
      status: 'ready',
      text,
      prompt,
      updatedAt: Date.now(),
      error: null,
      contextHint: context,
    };

    manifest[index] = record;
    writeStoredUploads(manifest);

    return res.json({
      story: record.story,
      asset: withPublicUrl(record, req),
      reused: false,
    });
  } catch (error) {
    console.error('[Gemini] Story generation failed', {
      id: record.id,
      filename: record.filename,
      context,
      error: error?.message,
      stack: error?.stack,
    });
    record.story = {
      ...(record.story || {}),
      status: 'error',
      error: error.message,
      updatedAt: Date.now(),
      contextHint: context || record.story?.contextHint || null,
    };
    manifest[index] = record;
    writeStoredUploads(manifest);

    return res.status(502).json({
      error: 'Failed to generate story with Gemini.',
      details: error.message,
    });
  }
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

app.post('/api/story', async (req, res) => {
  try {
    const story = await summarizeMemories(req.body.memories || []);
    res.json({ story });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Gemini request failed' });
  }
});

app.post('/api/narrate', async (req, res) => {
  try {
    const story = await summarizeMemories(req.body.memories || []);
    const audioPath = await synthesizeToFile(story, Date.now().toString());
    res.json({ story, audio: `/audio/${path.basename(audioPath)}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Narration failed' });
  }
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
