// index.js

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import admin from 'firebase-admin';
import { PROMPTS, SYSTEM_MESSAGE } from './prompts.js';
import serviceAccount from './path/to/your-service-account.json'; // Replace this

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENAI_API_KEY;

// Firebase Admin init
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

app.use(cors());
app.use(express.json());

// Secure model resolution with backend-enforced credit logic
async function getModelForRequest(uid) {
  if (!uid) return 'gpt-3.5-turbo'; // Guest user fallback

  try {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return 'gpt-3.5-turbo';

    const data = doc.data();
    const credit = data.credit ?? 0;

    if (credit > 0) {
      await db.collection('users').doc(uid).update({
        credit: admin.firestore.FieldValue.increment(-1)
      });
      return 'gpt-4';
    } else {
      return 'gpt-3.5-turbo';
    }
  } catch (err) {
    console.error('Error checking user credit:', err);
    return 'gpt-3.5-turbo';
  }
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
        { role: "user",   content: user }
      ],
      temperature: 0.3
    })
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

function createLLMRoute(path, promptBuilder) {
  app.post(path, async (req, res) => {
    const { text, language, uid } = req.body;
    console.log(`[${path.toUpperCase()}]`, { textLength: text?.length, language, uid });

    if (typeof text !== "string" || !text || typeof language !== "string" || !language) {
      return res.status(400).json({ error: 'Invalid input types.' });
    }

    const userPrompt = promptBuilder(text, language);
    try {
      const model = await getModelForRequest(uid);
      const response = await callOpenAI({
        system: SYSTEM_MESSAGE,
        user: userPrompt,
        model
      });
      res.json({ result: response });
    } catch (err) {
      console.error(`Error in ${path}:`, err);
      res.status(500).json({ error: 'OpenAI request failed.' });
    }
  });
}

// Generic LLM routes
createLLMRoute('/translate',   PROMPTS.translate);
createLLMRoute('/explain',     PROMPTS.explain_phrase);
createLLMRoute('/enhance',     PROMPTS.enhance_text);
createLLMRoute('/summarize',   PROMPTS.summarize_webpage);

// Full-page translation
app.post('/translate_webpage', async (req, res) => {
  const { ids, texts, language, uid } = req.body;
  console.log('[TRANSLATE_WEBPAGE]', {
    idsCount: Array.isArray(ids) ? ids.length : null,
    textsCount: Array.isArray(texts) ? texts.length : null,
    language,
    uid
  });

  if (
    !Array.isArray(ids) ||
    !Array.isArray(texts) ||
    ids.length !== texts.length ||
    texts.some(t => typeof t !== 'string') ||
    typeof language !== 'string' ||
    !language
  ) {
    return res.status(400).json({
      error: 'Invalid input: expected { ids: number[], texts: string[], language: string }'
    });
  }

  const userPrompt = PROMPTS.translate_webpage(ids, texts, language);

  let reply;
  try {
    const model = await getModelForRequest(uid);
    reply = await callOpenAI({
      system: SYSTEM_MESSAGE,
      user: userPrompt,
      model
    });
  } catch (err) {
    console.error('Error calling OpenAI for /translate_webpage:', err);
    return res.status(500).json({ error: 'OpenAI request failed.' });
  }

  let parsed;
  try {
    parsed = JSON.parse(reply);
  } catch (err) {
    const match = reply.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch (e) {
        console.error('Fallback JSON parse failed:', match[0], e);
        return res.status(500).json({ error: 'Invalid JSON from LLM.' });
      }
    } else {
      console.error('No JSON object found in LLM reply:', reply);
      return res.status(500).json({ error: 'No JSON in LLM reply.' });
    }
  }

  const outputs = Array.isArray(parsed.outputs)
    ? parsed.outputs
    : Array.isArray(parsed.translations)
      ? parsed.translations
      : null;

  if (!outputs) {
    console.error('LLM JSON missing "outputs" or "translations":', parsed);
    return res.status(500).json({ error: 'LLM returned unexpected JSON structure.' });
  }

  if (outputs.length !== texts.length) {
    console.error('Length mismatch: expected', texts.length, 'got', outputs.length);
    return res.status(500).json({ error: 'LLM returned wrong number of items.' });
  }

  res.json({ translations: outputs });
});

app.listen(PORT, () => {
  console.log(`Translator backend is running on http://localhost:${PORT}`);
});
