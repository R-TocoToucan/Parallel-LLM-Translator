// userService.js
// 1 credit = 100 tokens on gpt-4o-mini  (fine-grained 1:3:15 billing)

import { safeFetchWithRefresh, getProfile } from './authService.js';

const BACKEND_URL = 'https://parallel-llm-translator.onrender.com';
const LS_KEY      = 'ptUserCache';
const DEFAULTS    = { email: null, tier: 'free', creditsRemaining: 0 };

/* ═══════════  MODEL PRICING  ═══════════ */
/* baseline: 1 credit covers 100 tokens on 4o-mini */
const TOKENS_PER_CREDIT_BASE = 100;

const MODEL_FACTOR = {
  'gpt-4o-mini':   1,   // 1 credit / 100 tok
  'gpt-3.5-turbo': 3,   // 3 credits / 100 tok
  'gpt-4o':       15    // 15 credits / 100 tok
};

/* quick ≈ TikToken: chars ÷ 4 */
export const estimateTokens = txt => Math.ceil((txt || '').length / 4);

export function creditsNeeded(tokens, model = 'gpt-4o-mini') {
  const factor = MODEL_FACTOR[model] ?? 1;
  return Math.max(1, Math.ceil(tokens / TOKENS_PER_CREDIT_BASE * factor));
}

/* ═══════════  CACHE HELPERS  ═══════════ */
function read()  { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; } }
function write(o){ localStorage.setItem(LS_KEY, JSON.stringify(o)); }

/* ═══════════  INIT AFTER SIGN-IN  ═══════════ */
export async function initUserCache() {
  const profile = await getProfile();
  const res     = await safeFetchWithRefresh(`${BACKEND_URL}/api/user/me`);
  const api     = res.ok ? await res.json() : {};
  const merged  = { ...DEFAULTS, ...api, email: profile.email };
  write(merged);
  return merged;
}

/* ═══════════  GETTERS  ═══════════ */
export const getEmail   = () => read().email;
export const getTier    = () => read().tier || 'free';
export const getCredits = () => read().creditsRemaining ?? 0;

/* ═══════════  CREDIT-LEVEL CONSUMPTION  ═══════════ */
export async function consumeCredits(credits = 1) {
  credits = Math.max(1, credits);
  const cache = read();
  if ((cache.creditsRemaining ?? 0) < credits) return false;

  cache.creditsRemaining -= credits;          // optimistic
  write(cache);

  const res = await safeFetchWithRefresh(
    `${BACKEND_URL}/api/consume`,
    {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ amount: credits })
    }
  );

  if (res.ok) {
    const { creditsRemaining } = await res.json();
    cache.creditsRemaining = creditsRemaining;
    write(cache);
    return true;
  }

  /* rollback */
  cache.creditsRemaining += credits;
  write(cache);
  return false;
}

/* ═══════════  TOKEN-LEVEL HELPER  ═══════════ */
export async function consumeTokens(tokenCount, model = 'gpt-4o-mini') {
  const need = creditsNeeded(Math.max(1, tokenCount), model);
  return consumeCredits(need);
}

/* ═══════════  MANUAL REFRESH  ═══════════ */
export async function refreshFromServer() {
  const res = await safeFetchWithRefresh(`${BACKEND_URL}/api/user/me`);
  if (!res.ok) throw new Error('refresh failed');
  const api = await res.json();
  write({ ...read(), ...api });
  return api;
}
