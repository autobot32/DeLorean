const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
const gemini = hasGeminiKey
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, apiVersion: 'v1' })
  : null;
// Vision-capable with low latency and cost.
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

function buildStoryPrompt({ context, title, position, total }) {
  const lines = [
    'You are a warm, poetic narrator guiding someone through their memories.',
    'Write a vivid, 3-5 sentence first-person story about this image.',
    'Lean into sensory details, emotions, and meaning. Do not list objects or give instructions.',
    'Keep it concise, flowing, and suitable for spoken narration.',
  ];

  if (typeof position === 'number' && typeof total === 'number') {
    lines.push(`This memory sits ${position + 1} of ${total} in a tunnel of moments.`);
  }

  if (title) {
    lines.push(`Original file name for reference: ${title}`);
  }

  if (context && context.trim()) {
    lines.push(`Use this user-provided context to guide the story: ${context.trim()}`);
  } else {
    lines.push('No additional context was provided; rely on the atmosphere and emotion from the image itself.');
  }

  lines.push('Return only the story paragraph—no bullet points, headings, or closing summaries.');
  return lines.join('\n');
}

function extractText(response) {
  if (!response) return '';

  if (typeof response.text === 'function') {
    const textResult = response.text();
    if (typeof textResult === 'string' && textResult.trim().length > 0) {
      return textResult.trim();
    }
  }

  if (typeof response.response?.text === 'function') {
    const textResult = response.response.text();
    if (typeof textResult === 'string' && textResult.trim().length > 0) {
      return textResult.trim();
    }
  }

  const candidates = response.candidates || response.response?.candidates;
  if (Array.isArray(candidates)) {
    const parts = candidates
      .flatMap((candidate) => candidate?.content?.parts || [])
      .map((part) => part?.text)
      .filter((value) => typeof value === 'string' && value.trim().length > 0);

    if (parts.length > 0) {
      return parts.join(' ').trim();
    }
  }

  return '';
}

async function summarizeMemories(memories) {
  if (!hasGeminiKey || !gemini) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const prompt = `Turn these memories into a short narrative:\n${memories.join('\n')}`;
  const res = await gemini.models.generateContent({
    model: DEFAULT_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  const summary = extractText(res);
  if (!summary) {
    throw new Error('Gemini returned an empty summary.');
  }
  return summary;
}

async function generateMemoryStory({ imagePath, mimeType = 'image/webp', context, title, position, total }) {
  if (!hasGeminiKey || !gemini) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  if (!imagePath) {
    throw new Error('Missing image path for Gemini story generation.');
  }

  const absolutePath = path.resolve(imagePath);
  const fileBuffer = await fs.promises.readFile(absolutePath);
  const inlineData = {
    mimeType,
    data: fileBuffer.toString('base64'),
  };

  const prompt = buildStoryPrompt({ context, title, position, total });

  const response = await gemini.models.generateContent({
    model: DEFAULT_MODEL,
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }, { inlineData }],
      },
    ],
    generationConfig: {
      temperature: 0.8,
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 512,
    },
  });

  const text = extractText(response);

  if (!text) {
    const debugInfo = {
      hasTextFunction: typeof response?.text === 'function',
      candidateCount: Array.isArray(response?.candidates)
        ? response.candidates.length
        : Array.isArray(response?.response?.candidates)
          ? response.response.candidates.length
          : 0,
      finishReasons: (response?.candidates || response?.response?.candidates || []).map(
        (candidate) => candidate?.finishReason,
      ),
      safetyBlocks: (response?.candidates || response?.response?.candidates || []).map(
        (candidate) => candidate?.safetyRatings,
      ),
    };
    console.warn('[Gemini] Empty story response', debugInfo);
    throw new Error('Gemini returned an empty story.');
  }

  return { text, prompt };
}

module.exports = {
  hasGeminiKey,
  summarizeMemories,
  generateMemoryStory,
};
