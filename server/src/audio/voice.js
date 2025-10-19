// server/src/audio/voice.js
const fs = require('fs');
const path = require('path');
const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js');

const DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // ElevenLabs "Bella" voice
const rawVoiceId = (process.env.ELEVENLABS_VOICE_ID || '').trim();
const VOICE_ID = rawVoiceId && !rawVoiceId.startsWith('your-') ? rawVoiceId : DEFAULT_VOICE_ID;
const hasElevenLabsKey = Boolean(process.env.ELEVENLABS_API_KEY);
const elevenLabs = hasElevenLabsKey
  ? new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY })
  : null;

async function synthesizeToFile(text, id) {
  if (!hasElevenLabsKey) {
    throw new Error('ELEVENLABS_API_KEY is not configured on the server.');
  }

  const audioDir = path.join(__dirname, '..', 'audio');
  await fs.promises.mkdir(audioDir, { recursive: true });
  const outPath = path.join(__dirname, '..', 'audio', `${id}.mp3`);
  const audioStream = await elevenLabs.textToSpeech.convert(VOICE_ID, {
    model_id: 'eleven_turbo_v2',
    text,
    voice_settings: { stability: 0.3, similarity_boost: 0.7 },
  });
  const chunks = [];
  for await (const chunk of audioStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const audioBuffer = Buffer.concat(chunks);
  await fs.promises.writeFile(outPath, audioBuffer);
  return outPath;
}

module.exports = { synthesizeToFile };
