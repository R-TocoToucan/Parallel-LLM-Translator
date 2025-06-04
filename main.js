// main.js
document.addEventListener("DOMContentLoaded", () => {
  console.log("main.js is loaded");

  const auth = firebase.auth();
  const ui = new firebaseui.auth.AuthUI(auth);

  const { initUserService, bumpUsage } = window.userService;

  // --- USER SERVICE INIT ---
  initUserService((user, userRef) => {
    const userInfoEl = document.getElementById("user-info");
    if (user) {
      console.log("Signed in as", user.email);
      if (userInfoEl) userInfoEl.textContent = `Signed in as ${user.displayName || user.email}`;
    } else {
      console.log("Not signed in");
      if (userInfoEl) userInfoEl.textContent = `Not signed in`;
    }
  });

  // Show FirebaseUI on click
  document.getElementById('show-login')?.addEventListener('click', () => {
    const authContainer = document.getElementById('firebaseui-auth-container');

    if (authContainer.style.display === 'block') {
      authContainer.style.display = 'none';
    } else {
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
            });
            return false;
          }
        }
      });
    }
  });

  // --- USE DEPLOYED SERVER ---
  const BACKEND_URL = 'https://parallel-llm-translator.onrender.com/translate';

  const languages = [
    { label: 'Auto Detect', favorited: true, sourceOnly: true },
    { label: 'English', favorited: true },
    { label: 'Korean', favorited: true },
    { label: 'Japanese', favorited: false },
    { label: 'Chinese', favorited: false }
  ];

  const createDropdown = (id, label, initialItems, filterFn = () => true) => {
    const container = document.getElementById(id);
    const btn = document.createElement('button');
    btn.className = 'dropdown-btn';
    btn.innerHTML = `${label} <i class="fas fa-chevron-down"></i>`;

    const list = document.createElement('div');
    list.className = 'dropdown-list';
    list.setAttribute('id', id + '-list');

    const items = initialItems.filter(filterFn);

    chrome.storage.local.get(['favorites', 'sourceLang', 'targetLang'], (data) => {
      const key = (id === 'source-dropdown') ? 'sourceLang' : 'targetLang';
      const lastSelected = data[key];

      if (Array.isArray(data.favorites)) {
        items.forEach(item => {
          item.favorited = data.favorites.includes(item.label);
        });
      }

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
            const updatedFavorites = items.filter(i => i.favorited).map(i => i.label);
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

      if (lastSelected) {
        btn.innerHTML = `${lastSelected} <i class="fas fa-chevron-down"></i>`;
      }

      renderList();
    });

    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      list.classList.toggle('open');
    });

    document.addEventListener('click', (event) => {
      const openList = document.querySelector('.dropdown-list.open');
      if (openList && !openList.contains(event.target)) {
        openList.classList.remove('open');
      }
    });

    container.appendChild(btn);
    container.appendChild(list);
  };

  createDropdown('source-dropdown', 'Select Language', languages);
  createDropdown('target-dropdown', 'Select Language', languages, item => !item.sourceOnly);

  const getSelectedLanguageFromDropdown = (dropdownId) => {
    const dropdown = document.getElementById(dropdownId);
    const btn = dropdown?.querySelector('.dropdown-btn');
    return btn ? btn.innerText.trim() : null;
  };

  const applySelectTheme = (el) => {
    if (document.body.classList.contains('light')) {
      el.style.backgroundColor = '#ddd';
      el.style.color = '#000';
    } else {
      el.style.backgroundColor = '#3c3c3c';
      el.style.color = '#fff';
    }
  };

  const displayModeSelect = document.getElementById('display-mode');
  if (displayModeSelect) {
    chrome.storage.local.get(['displayMode'], (data) => {
      if (data.displayMode) displayModeSelect.value = data.displayMode;
    });

    displayModeSelect.addEventListener('change', () => {
      chrome.storage.local.set({ displayMode: displayModeSelect.value });
    });

    applySelectTheme(displayModeSelect);
  }

  const settingsBtn = document.querySelector('.settings-btn');
  const translatorUI = document.getElementById('translator-ui');
  const settingsUI = document.getElementById('settings-ui');
  const backBtn = document.getElementById('back-btn');

  if (settingsBtn && translatorUI && settingsUI) {
    const switchView = (view) => {
      translatorUI.style.display = view === 'settings' ? 'none' : 'block';
      settingsUI.style.display = view === 'settings' ? 'block' : 'none';
    };
    settingsBtn.addEventListener('click', () => switchView('settings'));
    backBtn?.addEventListener('click', () => switchView('translator'));
  }

  const darkToggle = document.getElementById('dark-toggle');
  const syncThemeWithToggle = () => {
    document.body.classList.toggle('light', !darkToggle.checked);
    if (displayModeSelect) applySelectTheme(displayModeSelect);
  };
  darkToggle.addEventListener('change', (e) => {
    document.body.classList.toggle('light', !e.target.checked);
    if (displayModeSelect) applySelectTheme(displayModeSelect);
  });
  darkToggle.checked = true;
  syncThemeWithToggle();

  const main = document.querySelector('.main-translator');
  const closeBtn = document.querySelector('.main-close');
  const translateBtn = document.getElementById('translate-btn');

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'b') {
      if (main) {
        main.style.display = main.style.display === 'none' ? 'flex' : 'none';
      }
    }
  });

  closeBtn?.addEventListener('click', () => {
    if (main) main.style.display = 'none';
  });

  translateBtn?.addEventListener('click', async () => {
    const targetLang = getSelectedLanguageFromDropdown('target-dropdown') || 'Korean';
    chrome.storage.local.get(['displayMode'], async (data) => {
      const mode = data.displayMode || 'replace';
      chrome.tabs.query({ active: true, currentWindow: true }, async tabs => {
        if (!tabs[0]?.id) return;
        chrome.tabs.sendMessage(
          tabs[0].id,
          { type: 'translatePage', targetLang, mode },
          resp => console.log('Content script replied:', resp)
        );

        const currentUser = auth.currentUser;
        if (currentUser) {
          try {
            await bumpUsage(currentUser.uid, 'translations');
          } catch (err) {
            console.warn("Failed to bump usage:", err);
          }
        }
      });
    });
  });
});
