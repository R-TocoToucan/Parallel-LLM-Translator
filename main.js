// main.js – popup / main UI

/* ──────────────────────────────────────────
 * Imports
 * ────────────────────────────────────────── */
import {
  getEmail,
  getCredits,
  getTier,
  initUserCache,
  consumeCredits      // (use later if you deduct credits here)
} from './userService.js';

import {
  signIn,
  signOut,
  getProfile,         // for immediate display name
  syncUserData,
  getAppUserData
} from './authService.js';

console.log('main.js loaded');

/* ──────────────────────────────────────────
 * Element references
 * ────────────────────────────────────────── */
const userInfoEl       = document.getElementById('user-info');
const authBtn          = document.getElementById('auth-btn');
const darkToggle       = document.getElementById('dark-toggle');
const displayModeSelect= document.getElementById('display-mode');

/* ──────────────────────────────────────────
 * Helper – paint UI from cached data
 * ────────────────────────────────────────── */
function paintFromCache() {
  const email   = getEmail();
  const credits = getCredits();
  const tier    = getTier();

  if (email) {
    userInfoEl.textContent =
      `Signed in as ${email} (Tier: ${tier}, Credits: ${credits})`;
  } else {
    userInfoEl.textContent = 'Not signed in';
  }
}

/* ──────────────────────────────────────────
 * Sign-In / Sign-Out
 * ────────────────────────────────────────── */
authBtn?.addEventListener('click', async () => {
  if (authBtn.dataset.signedIn === 'true') {
    /* ───── Sign-Out ─────────────────────── */
    await signOut();
    authBtn.dataset.signedIn = 'false';
    paintFromCache();                         // cache now empty defaults
  } else {
    /* ───── Sign-In ──────────────────────── */
    try {
      await signIn();                         // Google OAuth
      chrome.runtime.sendMessage({ type: 'AUTH_SUCCESS' });
      await initUserCache();                  // cheap if bg already did it

      await syncUserData();                  // ensure Firestore record

      /* Optional: fetch again for absolute latest */
      const appUser = await getAppUserData();
      console.log('App user', appUser);

      authBtn.dataset.signedIn = 'true';
      paintFromCache();
    } catch (err) {
      console.error('Sign-in failed', err);
      paintFromCache();                      // fall back to cached (guest)
    }
  }
});

/* ──────────────────────────────────────────
 * Language list & dropdown code (unchanged)
 * ────────────────────────────────────────── */
const languages = [
  { label:'Auto Detect', favorited:true,  sourceOnly:true },
  { label:'English',     favorited:true },
  { label:'Korean',      favorited:true },
  { label:'Japanese',    favorited:false },
  { label:'Chinese',     favorited:false },
];

function createDropdown(id, label, items, filterFn = () => true) {
  const container = document.getElementById(id);
  const button    = document.createElement('button');
  button.className = 'dropdown-btn';
  button.innerHTML = `${label} <i class="fas fa-chevron-down"></i>`;

  const list = document.createElement('div');
  list.className  = 'dropdown-list';
  list.id         = `${id}-list`;

  const filtered = items.filter(filterFn);

  chrome.storage.local.get(
    ['favorites','sourceLang','targetLang'],
    data => {
      const key = id.includes('source') ? 'sourceLang' : 'targetLang';
      const last = data[key];

      if (Array.isArray(data.favorites)) {
        filtered.forEach(item => {
          item.favorited = data.favorites.includes(item.label);
        });
      }

      const render = () => {
        list.innerHTML = '';
        [...filtered]
          .sort((a,b)=> b.favorited - a.favorited)
          .forEach(item => {
            const div = document.createElement('div');
            div.className = 'dropdown-item';
            div.innerHTML =
              `<span>${item.label}</span>` +
              `<i class="fas fa-star star-icon${item.favorited?' favorited':''}"></i>`;

            div.querySelector('.star-icon')
               .addEventListener('click', e => {
                 e.stopPropagation();
                 item.favorited = !item.favorited;
                 const favs = filtered.filter(i=>i.favorited).map(i=>i.label);
                 chrome.storage.local.set({ favorites: favs });
                 render();
               });

            div.addEventListener('click', () => {
              button.innerHTML =
                `${item.label} <i class="fas fa-chevron-down"></i>`;
              list.classList.remove('open');
              chrome.storage.local.set({ [key]: item.label });
            });
            list.appendChild(div);
          });
      };

      if (last) {
        button.innerHTML = `${last} <i class="fas fa-chevron-down"></i>`;
      }
      render();
    });

  button.addEventListener('click', e => {
    e.stopPropagation();
    list.classList.toggle('open');
  });
  document.addEventListener('click', e => {
    if (!list.contains(e.target)) list.classList.remove('open');
  });

  container.append(button, list);
}

function getSelectedLanguage(dropdownId) {
  const btn = document
                .getElementById(dropdownId)
                ?.querySelector('.dropdown-btn');
  return btn ? btn.innerText.trim() : null;
}

/* ──────────────────────────────────────────
 * Translate button
 * ────────────────────────────────────────── */
function bindTranslateButton() {
  document.getElementById('translate-btn')?.addEventListener('click', () => {
    const targetLang = getSelectedLanguage('target-dropdown') || 'Korean';
    chrome.storage.local.get(['displayMode','translationModel'], data => {
      const mode  = data.displayMode      || 'replace';
      const model = data.translationModel || 'gpt-3.5-turbo';

      chrome.tabs.query({ active:true, currentWindow:true }, tabs => {
        const tabId = tabs[0]?.id;
        if (!tabId) return;
        chrome.tabs.sendMessage(tabId, {
          type:'translatePage',
          targetLang,
          mode,
          model
        });
      });
    });
  });
}

/* ──────────────────────────────────────────
 * Dark-mode toggle
 * ────────────────────────────────────────── */
if (darkToggle) {
  const applyTheme = () =>
    document.body.classList.toggle('light', !darkToggle.checked);
  darkToggle.addEventListener('change', applyTheme);
  darkToggle.checked = true;
  applyTheme();
}

/* ──────────────────────────────────────────
 * Initial DOMContentLoaded work
 * ────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  /* dropdowns */
  createDropdown('source-dropdown','Select Language', languages);
  createDropdown('target-dropdown','Select Language', languages,
                 item => !item.sourceOnly);

  /* displayMode select */
  if (displayModeSelect) {
    chrome.storage.local.get(['displayMode'], d => {
      if (d.displayMode) displayModeSelect.value = d.displayMode;
    });
    displayModeSelect.addEventListener(
      'change',
      () => chrome.storage.local.set({ displayMode: displayModeSelect.value })
    );
  }

  /* show cached info */
  paintFromCache();

  /* if already signed-in (token present) warm cache once */
  if (localStorage.getItem('googleIdToken')) {
    await initUserCache().catch(()=>{});
    authBtn.dataset.signedIn = 'true';
    paintFromCache();
  }

  bindTranslateButton();
});

/* ──────────────────────────────────────────
 * Listen for CACHE_READY broadcasts
 * ────────────────────────────────────────── */
chrome.runtime.onMessage.addListener(msg => {
  if (msg?.type === 'CACHE_READY') paintFromCache();
});
