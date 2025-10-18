const express = require('express');
const cors = require('cors');

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const allowedOrigins = CLIENT_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);

const app = express();
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
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

app.listen(PORT, () => {
  console.log(`DeLorean server listening on http://localhost:${PORT}`);
  console.log(`Accepting client connections from: ${allowedOrigins.join(', ')}`);
});
