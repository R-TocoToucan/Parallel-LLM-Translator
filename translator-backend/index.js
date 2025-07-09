// index.js – backend (Node / Express)
/* ───────────────────────────────────────────────────────────────
 *  Imports & basic setup
 * ─────────────────────────────────────────────────────────────── */
import express from 'express';
import cors    from 'cors';
import dotenv  from 'dotenv';
import fetch   from 'node-fetch';
import admin   from 'firebase-admin';
import { OAuth2Client } from 'google-auth-library';

import { PROMPTS, SYSTEM_MESSAGE } from './prompts.js';

dotenv.config();

/* ───── secrets from env ───── */
if (!process.env.FIREBASE_SERVICE_ACCOUNT)
  throw new Error('Missing FIREBASE_SERVICE_ACCOUNT');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const API_KEY        = process.env.OPENAI_API_KEY;
const CLIENT_ID      = process.env.GOOGLE_WEB_CLIENT_ID;
const ADMIN_SECRET   = process.env.ADMIN_SECRET;

/* ───── express basic ───── */
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/* ───── Firebase Admin & Google OAuth verify ───── */
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db           = admin.firestore();
const googleClient = new OAuth2Client(CLIENT_ID);

/* ───────────────────────────────────────────────────────────────
 *  Constants – quotas & allowed models
 * ─────────────────────────────────────────────────────────────── */
const WEEKLY_QUOTA = {           // 100-token credits
  free   : 10_000,               // was 1 000
  premium: 500_000,              // was 50 000
  team   : 2_000_000             // was 200 000
};
const quotaForTier = t => WEEKLY_QUOTA[t] ?? WEEKLY_QUOTA.free;

const ALLOWED_MODELS = ['gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4o'];

/* ───────────────────────────────────────────────────────────────
 *  Middleware – verify Google ID-token (Bearer)
 * ─────────────────────────────────────────────────────────────── */
async function verifyIdToken(req, res, next) {
  const m = (req.headers.authorization || '').match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ error: 'Missing Authorization' });
  try {
    const ticket  = await googleClient.verifyIdToken({ idToken: m[1], audience: CLIENT_ID });
    const p = ticket.getPayload();
    req.uid   = p.sub;
    req.email = p.email;
    next();
  } catch (err) {
    console.error('verifyIdToken', err);
    res.status(401).json({ error: 'Invalid ID token' });
  }
}

/* ───────────────────────────────────────────────────────────────
 *  Helper – weekly rolling refresh (users idle ≥ 7 days)
 * ─────────────────────────────────────────────────────────────── */
async function refreshOldUsers() {
  const cutoffMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const cutoffTs = admin.firestore.Timestamp.fromMillis(cutoffMs);

  const snap = await db.collection('users').where('lastRefresh', '<=', cutoffTs).get();
  if (snap.empty) return;

  const batch = db.batch();
  const nowTs = admin.firestore.Timestamp.now();

  snap.forEach(doc => {
    const tier  = doc.data().tier || 'free';
    batch.update(doc.ref, { credit: quotaForTier(tier), lastRefresh: nowTs });
  });

  await batch.commit();
  console.log(`[RollingRefresh] reset ${snap.size} users`);
}

/* ───────────────────────────────────────────────────────────────
 *  Helper – monthly hard reset (1st of month UTC)
 * ─────────────────────────────────────────────────────────────── */
async function resetMonthlyCredits() {
  const FREE_CREDITS = 3_000;
  const PLUS_CREDITS = 30_000;

  const snap = await db.collection('users').get();
  if (snap.empty) return;

  const batch = db.batch();
  snap.forEach(doc => {
    const tier = doc.data().tier ?? 'free';
    const amt  = tier === 'plus' ? PLUS_CREDITS : FREE_CREDITS;
    batch.update(doc.ref, { credit: amt });
  });

  await batch.commit();
  console.log(`[MonthlyReset] set ${snap.size} users → ${FREE_CREDITS}/${PLUS_CREDITS}`);
}

/* ───────────────────────────────────────────────────────────────
 *  Secure admin endpoints for cron jobs
 * ─────────────────────────────────────────────────────────────── */
function adminGuard(req, res, next) {
  if (req.headers['x-admin-secret'] !== ADMIN_SECRET)
    return res.status(403).json({ error: 'Forbidden' });
  next();
}

app.post('/admin/rolling_refresh', adminGuard, async (req, res) => {
  try       { await refreshOldUsers(); res.json({ ok: true }); }
  catch (e) { console.error('rolling_refresh', e); res.status(500).json({ error: 'refresh failed' }); }
});

app.post('/admin/monthly_reset', adminGuard, async (req, res) => {
  try       { await resetMonthlyCredits(); res.json({ ok: true }); }
  catch (e) { console.error('monthly_reset', e); res.status(500).json({ error: 'reset failed' }); }
});

/* ───────────────────────────────────────────────────────────────
 *  POST /api/user – upsert user record
 * ─────────────────────────────────────────────────────────────── */
app.post('/api/user', verifyIdToken, async (req, res) => {
  const { tier, lastUpdated } = req.body;
  if (typeof tier !== 'string' || typeof lastUpdated !== 'string')
    return res.status(400).json({ error: 'Invalid body' });

  try {
    const ref  = db.collection('users').doc(req.uid);
    const snap = await ref.get();
    const now  = admin.firestore.Timestamp.now();

    await ref.set({
      email      : req.email,
      tier,
      credit     : snap.exists ? snap.data().credit : quotaForTier(tier),
      createdAt  : snap.exists ? snap.data().createdAt : now,
      lastUpdated: admin.firestore.Timestamp.fromDate(new Date(lastUpdated)),
      lastRefresh: snap.exists ? snap.data().lastRefresh || now : now
    }, { merge: true });

    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/user', err);
    res.status(500).json({ error: 'Could not write user data' });
  }
});

/* ───────────────────────────────────────────────────────────────
 *  GET /api/user/me
 * ─────────────────────────────────────────────────────────────── */
app.get('/api/user/me', verifyIdToken, async (req, res) => {
  try {
    const snap = await db.collection('users').doc(req.uid).get();
    if (!snap.exists) return res.status(404).json({ error: 'User not found' });
    const d = snap.data();
    res.json({
      uid             : req.uid,
      email           : req.email,
      tier            : d.tier,
      creditsRemaining: d.credit,
      lastUpdated     : d.lastUpdated?.toDate().toISOString() || null
    });
  } catch (err) {
    console.error('GET /api/user/me', err);
    res.status(500).json({ error: 'Could not read user data' });
  }
});

/* ───────────────────────────────────────────────────────────────
 *  POST /api/consume – atomic credit deduction
 * ─────────────────────────────────────────────────────────────── */
app.post('/api/consume', verifyIdToken, async (req, res) => {
  const amount = Math.max(1, parseInt(req.body.amount ?? 1, 10));
  try {
    const remaining = await db.runTransaction(async tx => {
      const ref  = db.collection('users').doc(req.uid);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('User missing');
      const current = snap.data().credit ?? 0;
      if (current < amount) return null;
      tx.update(ref, { credit: admin.firestore.FieldValue.increment(-amount) });
      return current - amount;
    });
    if (remaining === null)
      return res.status(402).json({ error: 'Insufficient credits' });
    res.json({ creditsRemaining: remaining });
  } catch (err) {
    console.error('/api/consume', err);
    res.status(500).json({ error: 'consume failed' });
  }
});

/* ───────────────────────────────────────────────────────────────
 *  OpenAI chat helper
 * ─────────────────────────────────────────────────────────────── */
async function callOpenAI({ system, user, model }) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method : 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user }
      ],
      temperature: 0.3
    })
  });
  const d = await r.json();
  return d.choices?.[0]?.message?.content?.trim() || null;
}

/* ───────────────────────────────────────────────────────────────
 *  Factory to create text-only LLM endpoints
 * ─────────────────────────────────────────────────────────────── */
function createLLMRoute(path, promptBuilder) {
  app.post(path, verifyIdToken, async (req, res) => {
    const { text, language, model = 'gpt-4o-mini' } = req.body;
    if (typeof text !== 'string' || !text || typeof language !== 'string')
      return res.status(400).json({ error: 'Invalid input' });
    if (!ALLOWED_MODELS.includes(model))
      return res.status(400).json({ error: 'Model not allowed' });

    try {
      const prompt = promptBuilder(text, language);
      const reply  = await callOpenAI({ system: SYSTEM_MESSAGE, user: prompt, model });
      res.json({ result: reply });
    } catch (err) {
      console.error(`${path} error`, err);
      res.status(500).json({ error: 'OpenAI failed' });
    }
  });
}

/* generic text endpoints */
createLLMRoute('/translate', PROMPTS.translate);
createLLMRoute('/explain',   PROMPTS.explain_phrase);
createLLMRoute('/enhance',   PROMPTS.enhance_text);
createLLMRoute('/summarize', PROMPTS.summarize_webpage);

/* ───────────────────────────────────────────────────────────────
 *  Bulk translate_webpage endpoint
 * ─────────────────────────────────────────────────────────────── */
app.post('/translate_webpage', verifyIdToken, async (req, res) => {
  const { ids, texts, language, model = 'gpt-4o-mini' } = req.body;
  if (!Array.isArray(ids) || !Array.isArray(texts) ||
      ids.length !== texts.length || typeof language !== 'string')
    return res.status(400).json({ error: 'Invalid body structure' });
  if (!ALLOWED_MODELS.includes(model))
    return res.status(400).json({ error: 'Model not allowed' });

  try {
    const prompt = PROMPTS.translate_webpage(ids, texts, language);
    const raw    = await callOpenAI({ system: SYSTEM_MESSAGE, user: prompt, model });

    /* robust JSON parse */
    let parsed;
    try       { parsed = JSON.parse(raw); }
    catch (e) {
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('No JSON object');
      parsed = JSON.parse(m[0]);
    }

    const outputs = parsed.outputs ?? parsed.translations;
    if (!Array.isArray(outputs) || outputs.length !== texts.length)
      throw new Error('Wrong JSON structure');

    res.json({ translations: outputs });
  } catch (err) {
    console.error('/translate_webpage', err);
    res.status(500).json({ error: 'translation failed' });
  }
});

/* ───────────────────────────────────────────────────────────────
 *  Start server
 * ─────────────────────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`Translator backend running on http://localhost:${PORT}`);
});
