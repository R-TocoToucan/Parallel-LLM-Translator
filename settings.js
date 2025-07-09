import {
  signIn,
  signOut,
  getProfile,
  syncUserData,
  getAppUserData
} from './authService.js';

document.addEventListener('DOMContentLoaded', async () => {
  /* ───────── element refs ───────── */
  const userInfo   = document.getElementById('user-info');
  const creditInfo = document.getElementById('credit-info');
  const authBtn    = document.getElementById('auth-toggle');
  const modelSel   = document.getElementById('model-select');
  const uiLangSel  = document.getElementById('ui-lang-select');
  const manageBtn  = document.getElementById('manage-dictionary');

  /* ───────── local cache helpers ───────── */
  const USER_CACHE_KEY = 'ptUserCache';
  const getCachedUser  = () => {
    try { return JSON.parse(localStorage.getItem(USER_CACHE_KEY) || '{}'); }
    catch { return {}; }
  };
  const cacheUser = obj =>
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(obj));

  /* tiny class-swap helper */
  const swapClass = (el, from, to) =>
    !el.classList.replace(from, to) && el.classList.add(to);

  /* ───────── update header UI ───────── */
  async function updateAccountUI(signedIn) {
    if (signedIn) {
      /* decode profile locally (no fetch) */
      const profile = await getProfile();
      userInfo.textContent =
        `Signed in as ${profile.name || profile.email}`;
      swapClass(authBtn, 'auth-sign-in', 'auth-sign-out');
      authBtn.textContent      = 'Sign Out';
      authBtn.dataset.signedIn = 'true';

      /* paint cached credits instantly */
      const cached = getCachedUser();
      if (cached.creditsRemaining !== undefined) {
        creditInfo.textContent =
          `Remaining Credits: ${cached.creditsRemaining}`;
      } else {
        creditInfo.textContent = '';
      }

      /* one-time backend sync per sign-in */
      if (!window._ptSynced) {
        try {
          await syncUserData();               // POST  (verifies token once)
          const fresh = await getAppUserData(); // GET   (verifies again)
          cacheUser(fresh);
          creditInfo.textContent =
            `Remaining Credits: ${fresh.creditsRemaining}`;
        } catch (e) {
          console.warn('Could not sync user data:', e);
        }
        window._ptSynced = true;              // block further auto-syncs
      }

    } else {
      /* signed-out view */
      userInfo.textContent   = 'Not signed in';
      creditInfo.textContent = '';
      swapClass(authBtn, 'auth-sign-out', 'auth-sign-in');
      authBtn.textContent      = 'Sign In';
      authBtn.dataset.signedIn = 'false';
    }
  }

  /* ───────── preferences (unchanged) ───────── */
  chrome.storage.local.get(['translationModel', 'uiLang'], p => {
    modelSel.value  = p.translationModel || 'gpt-3.5-turbo';
    uiLangSel.value = p.uiLang           || 'en';
  });
  modelSel.addEventListener('change', () =>
    chrome.storage.local.set({ translationModel: modelSel.value }));
  uiLangSel.addEventListener('change', () =>
    chrome.storage.local.set({ uiLang: uiLangSel.value }));

  /* ───────── auth button ───────── */
  authBtn.addEventListener('click', async () => {
    if (authBtn.dataset.signedIn === 'true') {
      await signOut();
      window._ptSynced = false;               // force fresh sync next login
      await updateAccountUI(false);
    } else {
      try {
        const token = await signIn();         // interactive or silent
        localStorage.setItem('googleToken', token);
        window._ptSynced = false;             // ensure one-time sync runs
        await updateAccountUI(true);
      } catch {
        await updateAccountUI(false);
      }
    }
  });

  /* ───────── first paint ───────── */
  await updateAccountUI(!!localStorage.getItem('googleIdToken'));

  /* ───────── Manage Dictionary ───────── */
  manageBtn.addEventListener('click', () => {
    window.location.href = chrome.runtime.getURL('dictionary.html');
  });
});
