// main.js

console.log("main.js is loaded");

// Initialize Firebase using CDN
const firebaseConfig = {
  apiKey: "AIzaSyCS3QI-AHSzzlYT6DZyAsvTTyz4MlZUx2k",
  authDomain: "parallel-translator.firebaseapp.com",
  projectId: "parallel-translator",
  storageBucket: "parallel-translator.firebasestorage.app",
  messagingSenderId: "449814379859",
  appId: "1:449814379859:web:3858a2a57d387b26ae75a6",
  measurementId: "G-FKRR9NG4ST"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const ui = new firebaseui.auth.AuthUI(auth);

// Show FirebaseUI on click
document.getElementById('show-login')?.addEventListener('click', () => {
  const authContainer = document.getElementById('firebaseui-auth-container');

  if (authContainer.style.display === 'block') {
    // If the sign-in options are already visible, hide them
    authContainer.style.display = 'none';
  } else {
    // Otherwise, show the sign-in options
    authContainer.style.display = 'block';
    ui.start('#firebaseui-auth-container', {
      signInOptions: [
        firebase.auth.GoogleAuthProvider.PROVIDER_ID,
        firebase.auth.EmailAuthProvider.PROVIDER_ID
      ],
      callbacks: {
        signInSuccessWithAuthResult: function (authResult) {
          const user = authResult.user;
          user.getIdToken().then(token => {
            localStorage.setItem('firebaseToken', token);
            const userInfo = document.getElementById('user-info');
            if (userInfo) userInfo.textContent = `Signed in as ${user.displayName}`;
          });
          return false;
        }
      }
    });
  }
});

// --- UPDATE: Use deployed server, not localhost ---
const BACKEND_URL = 'https://parallel-llm-translator.onrender.com/translate';

// Helper function to get the associated toggle button for a given dropdown list.
function getToggleButtonForDropdown(dropdown) {
  // Assume the toggle button is the immediate previous sibling.
  let toggleBtn = dropdown.previousElementSibling;
  if (!toggleBtn || !toggleBtn.classList.contains('dropdown-btn')) {
    const dropdownId = dropdown.getAttribute('id');
    if (dropdownId) {
      toggleBtn = document.querySelector(`[data-dropdown="${dropdownId}"]`);
    }
  }
  return toggleBtn;
}

// Create dropdown for language selection
const createDropdown = (id, label, initialItems, filterFn = () => true) => {
  const container = document.getElementById(id);
  const btn = document.createElement('button');
  btn.className = 'dropdown-btn';
  btn.innerHTML = `${label} <i class="fas fa-chevron-down"></i>`;

  const list = document.createElement('div');
  list.className = 'dropdown-list';
  list.setAttribute('id', id + '-list');

  // Filter out sourceOnly items if requested (e.g., for target-dropdown)
  let items = initialItems.filter(filterFn);

  // Restore favorites and last selected from local storage
  chrome.storage.local.get(['favorites', 'sourceLang', 'targetLang'], (data) => {
    const key = (id === 'source-dropdown') ? 'sourceLang' : 'targetLang';
    const lastSelected = data[key];

    // Reapply saved favorites
    if (data.favorites && Array.isArray(data.favorites)) {
      items.forEach(item => {
        item.favorited = data.favorites.includes(item.label);
      });
    }

    // Sorting with favorites on top (already in your original logic)
    const renderList = () => {
      list.innerHTML = '';
      const sortedItems = [...items].sort((a, b) => b.favorited - a.favorited);

      sortedItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'dropdown-item';
        div.innerHTML = `
          <span>${item.label}</span>
          <i class="fas fa-star star-icon${item.favorited ? ' favorited' : ''}"></i>
        `;

        const star = div.querySelector('.star-icon');
        star.addEventListener('click', e => {
          e.stopPropagation();
          item.favorited = !item.favorited;
          const updatedFavorites = items
            .filter(i => i.favorited)
            .map(i => i.label);
          chrome.storage.local.set({ favorites: updatedFavorites });
          renderList();
        });

        div.addEventListener('click', () => {
          btn.innerHTML = `${item.label} <i class="fas fa-chevron-down"></i>`;
          list.classList.remove('open');
          chrome.storage.local.set({ [key]: item.label });
        });

        list.appendChild(div);
      });
    };

    // Restore last selected language label into the button
    if (lastSelected) {
      btn.innerHTML = `${lastSelected} <i class="fas fa-chevron-down"></i>`;
    }

    renderList();
  });

  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    list.classList.toggle('open');
  });

  // Close dropdown on outside click
  document.addEventListener('click', (event) => {
    const dropdown = document.querySelector('.dropdown-list.open');
    if (dropdown && !dropdown.contains(event.target)) {
      dropdown.classList.remove('open');
    }
  });

  container.appendChild(btn);
  container.appendChild(list);
};

// Languages for dropdown
const languages = [
  { label: 'Auto Detect', favorited: true, sourceOnly: true },
  { label: 'English', favorited: true },
  { label: 'Korean', favorited: true },
  { label: 'Japanese', favorited: false },
  { label: 'Chinese', favorited: false },
];

function getSelectedLanguageFromDropdown(dropdownId) {
  const dropdown = document.getElementById(dropdownId);
  const btn = dropdown?.querySelector('.dropdown-btn');
  return btn ? btn.innerText.trim() : null;
}

function applySelectTheme(providerSelect) {
  if (document.body.classList.contains('light')) {
    providerSelect.style.backgroundColor = '#ddd';
    providerSelect.style.color = '#000';
  } else {
    providerSelect.style.backgroundColor = '#3c3c3c';
    providerSelect.style.color = '#fff';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Initialize dropdowns
  createDropdown('source-dropdown', 'Select Language', languages);
  createDropdown('target-dropdown', 'Select Language', languages, item => !item.sourceOnly);

  // Settings UI toggle
  const settingsBtn = document.querySelector('.settings-btn');
  const translatorUI = document.getElementById('translator-ui');
  const settingsUI = document.getElementById('settings-ui');
  const backBtn = document.getElementById('back-btn');

  if (settingsBtn && translatorUI && settingsUI) {
    const switchView = (view) => {
      if (view === 'settings') {
        translatorUI.style.display = 'none';
        settingsUI.style.display = 'block';
      } else {
        settingsUI.style.display = 'none';
        translatorUI.style.display = 'block';
      }
    };

    settingsBtn.addEventListener('click', () => {
      switchView('settings');
    });

    backBtn?.addEventListener('click', () => {
      switchView('translator');
    });
  }

  // Dark mode toggle. 다크모드 토글
  const darkToggle = document.getElementById('dark-toggle');
  const providerSelect = document.getElementById('provider');

  const syncThemeWithToggle = () => {
    document.body.classList.toggle('light', !darkToggle.checked);
    applySelectTheme(providerSelect);
    console.log("darkToggle:", darkToggle);
  };

  darkToggle.addEventListener('change', (e) => {
    console.log("[DEBUG] Toggle changed:", e.target.checked);
    document.body.classList.toggle('light', !e.target.checked);
    applySelectTheme(providerSelect);
  });

  // Dark mode default 기본 다크모드
  darkToggle.checked = true;
  syncThemeWithToggle();

  // main behavior (show/hide translator)
  const main = document.querySelector('.main-translator');
  const closeBtn = document.querySelector('.main-close');
  const translateBtn = document.getElementById('translate-btn');
  console.log("[DEBUG] Translate button element:", translateBtn);  // DEBUG line

  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'b') {
      main.style.display = main.style.display === 'none' ? 'flex' : 'none';
    }
  });

  closeBtn?.addEventListener('click', () => {
    main.style.display = 'none';
  });

  // 🔁 NEW: Full Page Translation — send message to content script
  translateBtn?.addEventListener('click', () => {
    const targetLang = getSelectedLanguageFromDropdown('target-dropdown') || 'Korean';
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs[0]?.id) return;
      chrome.tabs.sendMessage(
        tabs[0].id,
        { type: 'translatePage', targetLang },
        resp => console.log('Content script replied:', resp)
      );
    });
  });
});
