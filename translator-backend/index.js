// index.js

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import admin from 'firebase-admin';
import { OAuth2Client } from 'google-auth-library';
import { PROMPTS, SYSTEM_MESSAGE } from './prompts.js';

// Load environment variables (including FIREBASE_SERVICE_ACCOUNT)
dotenv.config();

// Parse service account from env var
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  throw new Error("Missing FIREBASE_SERVICE_ACCOUNT environment variable");
}
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

const app       = express();
const PORT      = process.env.PORT || 3000;
const API_KEY   = process.env.OPENAI_API_KEY;
const CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID;

// Restrict CORS to only your extension and localhost
app.use(cors());
app.use(express.json());

// Initialize Google OAuth2 client
const googleClient = new OAuth2Client(CLIENT_ID);

// Firebase Admin init
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

/**
 * Middleware: verify incoming Bearer ID token (must be ID token)
 */
async function verifyIdToken(req, res, next) {
  const auth = req.headers.authorization || '';
  const match = auth.match(/^Bearer (.+)$/);
  if (!match) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: match[1],
      audience: CLIENT_ID
    });
    const payload = ticket.getPayload();
    req.uid   = payload.sub;
    req.email = payload.email;
    next();
  } catch (err) {
    console.error('ID token verification failed:', err);
    res.status(401).json({ error: 'Invalid ID token' });
  }
}

/**
 * POST /api/user
 * Upsert the signed-in user’s record in Firestore
 */
app.post('/api/user', verifyIdToken, async (req, res) => {
  const { tier, creditsRemaining, lastUpdated } = req.body;
  if (
    typeof tier !== 'string' ||
    typeof creditsRemaining !== 'number' ||
    typeof lastUpdated !== 'string'
  ) {
    return res.status(400).json({ error: 'Invalid body fields' });
  }
  try {
    await db.collection('users').doc(req.uid).set({
      email:       req.email,
      tier,
      credit:      creditsRemaining,
      lastUpdated: admin.firestore.Timestamp.fromDate(new Date(lastUpdated))
    }, { merge: true });
    res.json({ success: true });
  } catch (err) {
    console.error('Error writing user:', err);
    res.status(500).json({ error: 'Could not write user data' });
  }
});

/**
 * GET /api/user/me
 * Fetch the current user’s stored metadata
 */
app.get('/api/user/me', verifyIdToken, async (req, res) => {
  try {
    const snap = await db.collection('users').doc(req.uid).get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    const data = snap.data();
    res.json({
      uid:              req.uid,
      email:            req.email,
      tier:             data.tier,
      creditsRemaining: data.credit,
      lastUpdated:      data.lastUpdated.toDate().toISOString()
    });
  } catch (err) {
    console.error('Error reading user:', err);
    res.status(500).json({ error: 'Could not read user data' });
  }
});

/**
 * Secure, atomic model resolution with Firestore transaction
 */
async function getModelForRequest(uid) {
  if (!uid) return 'gpt-3.5-turbo';
  try {
    return await db.runTransaction(async tx => {
      const ref  = db.collection('users').doc(uid);
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : null;
      const credit = data?.credit ?? 0;

      if (credit > 0) {
        tx.update(ref, { credit: admin.firestore.FieldValue.increment(-1) });
        return 'gpt-4';
      } else {
        return 'gpt-3.5-turbo';
      }
    });
  } catch (err) {
    console.error('Error in credit transaction:', err);
    return 'gpt-3.5-turbo';
  }
}

/**
 * Call OpenAI Chat Completion
 */
async function callOpenAI({ system, user, model }) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type":  "application/json"
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

/**
 * Helper to create LLM routes
 */
function createLLMRoute(path, promptBuilder) {
  app.post(path, async (req, res) => {
    const { text, language, uid } = req.body;
    console.log(`[${path.toUpperCase()}]`, { textLength: text?.length, language, uid });
    if (
      typeof text !== "string" || !text ||
      typeof language !== "string" || !language
    ) {
      return res.status(400).json({ error: 'Invalid input types.' });
    }
    const userPrompt = promptBuilder(text, language);
    try {
      const model    = await getModelForRequest(uid);
      const response = await callOpenAI({ system: SYSTEM_MESSAGE, user: userPrompt, model });
      res.json({ result: response });
    } catch (err) {
      console.error(`Error in ${path}:`, err);
      res.status(500).json({ error: 'OpenAI request failed.' });
    }
  });
}

// Generic LLM routes
createLLMRoute('/translate', PROMPTS.translate);
createLLMRoute('/explain',   PROMPTS.explain_phrase);
createLLMRoute('/enhance',   PROMPTS.enhance_text);
createLLMRoute('/summarize', PROMPTS.summarize_webpage);

// Full-page translation
app.post('/translate_webpage', async (req, res) => {
  const { ids, texts, language, uid } = req.body;
  console.log('[TRANSLATE_WEBPAGE]', {
    idsCount:   Array.isArray(ids) ? ids.length : null,
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
    reply = await callOpenAI({ system: SYSTEM_MESSAGE, user: userPrompt, model });
  } catch (err) {
    console.error('Error calling OpenAI for /translate_webpage:', err);
    return res.status(500).json({ error: 'OpenAI request failed.' });
  }
  let parsed;
  try {
    parsed = JSON.parse(reply);
  } catch {
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
