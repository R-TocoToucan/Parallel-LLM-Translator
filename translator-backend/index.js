// index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { PROMPTS, SYSTEM_MESSAGE } from './prompts.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENAI_API_KEY;

app.use(cors());
app.use(express.json());

function getModel(tier) {
  return tier === 'pro' ? 'gpt-4' : 'gpt-3.5-turbo';
}

async function callOpenAI({ system, user, model }) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      temperature: 0.3
    })
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

function createLLMRoute(path, promptBuilder) {
  app.post(path, async (req, res) => {
    const { text, language, tier = 'free' } = req.body;

    console.log(`[📥 ${path.toUpperCase()} Request]:`, { text, language, tier });

    if (typeof text !== "string" || text.length === 0|| typeof language !== "string" || language.length === 0) {
      return res.status(400).json({ error: 'Invalid input types.' });
    }

    const userPrompt = promptBuilder(text, language);

    try {
      const response = await callOpenAI({
        system: SYSTEM_MESSAGE,
        user: userPrompt,
        model: getModel(tier),
      });
      res.json({ result: response });
    } catch (err) {
      console.error(`Error in ${path}:`, err);
      res.status(500).json({ error: 'OpenAI request failed.' });
    }
  });
}

// Register endpoints
createLLMRoute('/translate', PROMPTS.translate_webpage);
createLLMRoute('/explain', PROMPTS.explain_phrase);
createLLMRoute('/enhance', PROMPTS.enhance_text);
createLLMRoute('/summarize', PROMPTS.summarize_webpage);

app.listen(PORT, () => {
  console.log(`Translator backend is running on http://localhost:${PORT}`);
});
