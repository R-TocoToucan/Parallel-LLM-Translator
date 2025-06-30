// settings.js

import {
  signIn,
  signOut,
  getProfile,
  syncUserData,
  getAppUserData
} from './authService.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const userInfo   = document.getElementById('user-info');
  const creditInfo = document.getElementById('credit-info');
  const authBtn    = document.getElementById('auth-toggle');
  const modelSel   = document.getElementById('model-select');
  const uiLangSel  = document.getElementById('ui-lang-select');
  const manageBtn  = document.getElementById('manage-dictionary');

  // Helper to swap classes
  function swapClass(el, from, to) {
    if (!el.classList.replace(from, to)) el.classList.add(to);
  }

  // Update account section UI
  async function updateAccountUI(token) {
    if (token) {
      const profile = await getProfile(token);
      userInfo.textContent = `Signed in as ${profile.name || profile.email}`;
      swapClass(authBtn, 'auth-sign-in', 'auth-sign-out');
      authBtn.textContent = 'Sign Out';
      authBtn.dataset.signedIn = 'true';

      await syncUserData(token);
      const me = await getAppUserData(token);
      creditInfo.textContent = `Remaining Credits: ${me.creditsRemaining}`;
    } else {
      userInfo.textContent = 'Not signed in';
      creditInfo.textContent = '';
      swapClass(authBtn, 'auth-sign-out', 'auth-sign-in');
      authBtn.textContent = 'Sign In';
      authBtn.dataset.signedIn = 'false';
    }
  }

  // Load & save preferences
  chrome.storage.local.get(
    ['translationModel', 'uiLang'],
    prefs => {
      modelSel.value  = prefs.translationModel || 'gpt-3.5-turbo';
      uiLangSel.value = prefs.uiLang           || 'en';
    }
  );
  modelSel.addEventListener('change', () =>
    chrome.storage.local.set({ translationModel: modelSel.value })
  );
  uiLangSel.addEventListener('change', () =>
    chrome.storage.local.set({ uiLang: uiLangSel.value })
  );

  // Auth button logic
  authBtn.addEventListener('click', async () => {
    if (authBtn.dataset.signedIn === 'true') {
      await signOut();
      localStorage.removeItem('googleToken');
      await updateAccountUI(null);
    } else {
      try {
        const token = await signIn();
        localStorage.setItem('googleToken', token);
        await updateAccountUI(token);
      } catch {
        await updateAccountUI(null);
      }
    }
  });

  // Initialize account UI on load
  const existing = localStorage.getItem('googleToken');
  await updateAccountUI(existing);

  // ───────────────────────────────────────────────────────────
  // Manage Dictionary → open side panel instead of new window
  // ───────────────────────────────────────────────────────────
  manageBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tabId = tabs[0]?.id;
      if (!tabId) return;

      // Point the panel at dictionary.html and enable it, then show
      chrome.sidePanel.setOptions(
        { tabId, path: 'dictionary.html', enabled: true },
        () => chrome.sidePanel.open({ tabId })
      );
    });
  });
});
