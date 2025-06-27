// authService.js

const BACKEND_URL      = "https://parallel-llm-translator.onrender.com";
const GOOGLE_CLIENT_ID = "277604934909-g4k6ndulm1tuhosglhiaegsebs9q1omq.apps.googleusercontent.com";

/**
 * Generate a cryptographically‐strong nonce
 */
function makeNonce() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // fallback to 16 random bytes as hex
  const arr = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Sign in: force account chooser & return Google OAuth tokens
 */
export async function signIn() {
  // 1) Clear any cached tokens so we always get a fresh prompt
  await chrome.identity.clearAllCachedAuthTokens();

  // 2) Build the OAuth URL to request both access_token and id_token
  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl     = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id",     GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("response_type", "token id_token");
  authUrl.searchParams.set("redirect_uri",  redirectUri);
  authUrl.searchParams.set("scope",         "openid email profile");
  authUrl.searchParams.set("prompt",        "select_account");

  // 3) Generate and attach the nonce
  const nonce = makeNonce();
  localStorage.setItem("oauthNonce", nonce);
  authUrl.searchParams.set("nonce", nonce);

  // 4) Launch the flow and extract both tokens
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl.href, interactive: true },
      redirectUrl => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!redirectUrl) {
          return reject(new Error("Empty redirect URL"));
        }

        // Parse access_token
        const atMatch = redirectUrl.match(/[#&]access_token=([^&]+)/);
        // Parse id_token
        const idMatch = redirectUrl.match(/[#&]id_token=([^&]+)/);

        if (!atMatch || !idMatch) {
          return reject(new Error("Missing access_token or id_token in redirect"));
        }

        const accessToken = atMatch[1];
        const idToken     = idMatch[1];

        // Persist both tokens
        localStorage.setItem("googleToken",   accessToken);
        localStorage.setItem("googleIdToken", idToken);

        resolve(accessToken);
      }
    );
  });
}

/**
 * Sign out: clear Chrome’s token cache and remove our stored copies
 */
export async function signOut() {
  await chrome.identity.clearAllCachedAuthTokens();
  localStorage.removeItem("googleToken");
  localStorage.removeItem("googleIdToken");
  localStorage.removeItem("oauthNonce");
}

/**
 * Fetch Google profile (contains sub, email, name, …)
 * Uses the access token for the UserInfo endpoint
 */
export async function getProfile(token) {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error("Profile fetch failed");
  return res.json();  // { sub, email, name, picture, … }
}

/**
 * Safe fetch that retries once on 401 by re-authenticating
 */
async function safeFetchWithRefresh(url, options) {
  // Attach latest ID token
  let idToken = localStorage.getItem("googleIdToken");
  options.headers = options.headers || {};
  options.headers.Authorization = `Bearer ${idToken}`;

  let res = await fetch(url, options);
  if (res.status === 401) {
    // Token expired → force re-sign in
    await signIn();
    idToken = localStorage.getItem("googleIdToken");
    options.headers.Authorization = `Bearer ${idToken}`;
    res = await fetch(url, options);
  }
  return res;
}

/**
 * Sync (or create) the user record in your backend Firestore
 * Uses the ID token for authentication
 */
export async function syncUserData() {
  const profile = await getProfile(localStorage.getItem("googleToken"));
  const appData = {
    uid:              profile.sub,
    email:            profile.email,
    tier:             "free",
    creditsRemaining: 1000,
    lastUpdated:      new Date().toISOString()
  };

  const res = await safeFetchWithRefresh(`${BACKEND_URL}/api/user`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(appData)
  });
  if (!res.ok) throw new Error("Failed to save user data");
  return res.json();
}

/**
 * Fetch the current user’s app-specific data from your backend
 * Uses the ID token for authentication
 */
export async function getAppUserData() {
  const res = await safeFetchWithRefresh(`${BACKEND_URL}/api/user/me`, {
    method: "GET"
  });
  if (!res.ok) throw new Error("Failed to fetch user data");
  return res.json();
}
