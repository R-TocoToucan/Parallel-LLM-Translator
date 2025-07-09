// authService.js

const BACKEND_URL      = "https://parallel-llm-translator.onrender.com";
const GOOGLE_CLIENT_ID = "277604934909-g4k6ndulm1tuhosglhiaegsebs9q1omq.apps.googleusercontent.com";

/* helpers */
function makeNonce() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const buf = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(buf, b => b.toString(16).padStart(2, "0")).join("");
}
function parseJwt(jwt) {
  const base64 = jwt.split(".")[1];
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, "=");
  return JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
}

/* ───────── sign-in / out ───────── */
export async function signIn({ interactive = true } = {}) {
  await chrome.identity.clearAllCachedAuthTokens();

  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl     = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id",     GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("response_type", "token id_token");
  authUrl.searchParams.set("redirect_uri",  redirectUri);
  authUrl.searchParams.set("scope",         "openid email profile");
  if (interactive) authUrl.searchParams.set("prompt", "select_account");

  authUrl.searchParams.set("nonce", makeNonce());

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl.href, interactive },
      redirectUrl => {
        if (chrome.runtime.lastError)
          return reject(new Error(chrome.runtime.lastError.message));
        if (!redirectUrl)
          return reject(new Error("Empty redirect URL"));

        const at = redirectUrl.match(/[#&]access_token=([^&]+)/);
        const id = redirectUrl.match(/[#&]id_token=([^&]+)/);
        if (!at || !id)
          return reject(new Error("Missing access_token or id_token"));

        const accessToken = decodeURIComponent(at[1]);
        const idToken     = decodeURIComponent(id[1]);

        localStorage.setItem("googleToken",   accessToken);
        localStorage.setItem("googleIdToken", idToken);

        /* force Settings to sync once after any refresh */
        window._ptSynced = false;
        resolve(accessToken);
      }
    );
  });
}

export async function signOut() {
  await chrome.identity.clearAllCachedAuthTokens();
  localStorage.removeItem("googleToken");
  localStorage.removeItem("googleIdToken");
}

/* ───────── profile & backend ───────── */
export async function getProfile() {
  const idToken = localStorage.getItem("googleIdToken");
  if (!idToken) throw new Error("No ID-token in storage");
  return parseJwt(idToken);          // { sub, email, name, picture … }
}

/* silent-first refresh logic */
export async function safeFetchWithRefresh(url, options = {}) {
  let idToken = localStorage.getItem("googleIdToken");
  options.headers = { ...(options.headers || {}), Authorization: `Bearer ${idToken}` };

  let res = await fetch(url, options);
  if (res.status === 401) {
    /* try silent refresh */
    try { await signIn({ interactive: false }); }
    catch { /* ignore silent failure */ }
    idToken = localStorage.getItem("googleIdToken");
    options.headers.Authorization = `Bearer ${idToken}`;
    res = await fetch(url, options);

    /* if still 401 → interactive prompt */
    if (res.status === 401) {
      await signIn({ interactive: true });
      idToken = localStorage.getItem("googleIdToken");
      options.headers.Authorization = `Bearer ${idToken}`;
      res = await fetch(url, options);
    }
  }
  return res;
}

export async function syncUserData() {
  const profile = await getProfile();
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

export async function getAppUserData() {
  const res = await safeFetchWithRefresh(`${BACKEND_URL}/api/user/me`);
  if (!res.ok) throw new Error("Failed to fetch user data");
  return res.json();
}
