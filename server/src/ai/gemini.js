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
    'Write a vivid first-person story about this image in no more than three sentences (under 90 words total).',
    'Make the provided context the emotional center of the story and reference its key details directly.',
    'If the context mentions people, places, or activities, weave them explicitly into the narration.',
    'Call out at least one concrete visual detail you notice in the photo (fur texture, colors, lighting, background cues).',
    'Blend in sensory cues suggested by the photo—sight, sound, smell, temperature—to keep the narration grounded.',
    'Avoid bullet points, object lists, or meta commentary; keep the prose flowing and spoken-word friendly.',
  ];

  if (typeof position === 'number' && typeof total === 'number') {
    lines.push(`This memory sits ${position + 1} of ${total} in a tunnel of moments.`);
  }

  if (title) {
    lines.push(`Original file name for reference: ${title}`);
  }

  if (context && context.trim()) {
    lines.push(`Use this user-provided context to guide the story and state its core elements explicitly: ${context.trim()}`);
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

function normalizeMemories(memories) {
  if (!Array.isArray(memories)) return [];

  return memories
    .map((memory, index) => {
      if (memory === null || memory === undefined) {
        return '';
      }

      if (typeof memory === 'string') {
        return memory.trim();
      }

      if (typeof memory === 'object') {
        const segments = [];

        if (typeof memory.story?.text === 'string' && memory.story.text.trim()) {
          segments.push(memory.story.text.trim());
        }

        if (typeof memory.context === 'string' && memory.context.trim()) {
          segments.push(memory.context.trim());
        }

        if (typeof memory.title === 'string' && memory.title.trim()) {
          segments.push(`Title: ${memory.title.trim()}`);
        } else if (typeof memory.originalName === 'string' && memory.originalName.trim()) {
          segments.push(`File: ${memory.originalName.trim()}`);
        }

        if (typeof memory.description === 'string' && memory.description.trim()) {
          segments.push(memory.description.trim());
        }

        const combined = segments.join('. ').trim();
        if (combined) {
          return combined;
        }
      }

      return '';
    })
    .map((entry) => entry.replace(/\s+/g, ' ').trim())
    .filter((entry) => entry.length > 0);
}

async function summarizeMemories(memories) {
  if (!hasGeminiKey || !gemini) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const normalized = normalizeMemories(memories);
  if (normalized.length === 0) {
    const error = new Error('No memories provided to summarize.');
    error.code = 'NO_MEMORIES';
    throw error;
  }

  const bulletList = normalized.map((entry, index) => `${index + 1}. ${entry}`).join('\n');
  const prompt = [
    'You are delivering the closing narration for a memory tunnel experience.',
    'Weave the following memory snippets into a cohesive 3-4 sentence monologue (under 130 words) that feels reflective, optimistic, and deeply personal.',
    'Reference each listed memory directly, showing how they connect to a larger story.',
    'Keep it first person, fluid, and ready for spoken narration.',
    'Memories:',
    bulletList,
  ].join('\n');
  const res = await gemini.models.generateContent({
    model: DEFAULT_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  const summary = extractText(res);
  if (!summary) {
    const error = new Error('Gemini returned an empty summary.');
    error.code = 'EMPTY_SUMMARY';
    throw error;
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
