// server/src/ai/gemini.js
const { GoogleGenAI } = require('@google/genai');
const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
const gemini = hasGeminiKey ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

async function summarizeMemories(memories) {
  if (!hasGeminiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const prompt = `Turn these memories into a short narrative:\n${memories.join('\n')}`;
  const res = await gemini.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });
  return res.response.text();
}

module.exports = { summarizeMemories };
