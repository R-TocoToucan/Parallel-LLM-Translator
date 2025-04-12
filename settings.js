// settings.js

document.addEventListener('DOMContentLoaded', () => {
    const provider = document.getElementById('provider-select');
    const theme = document.getElementById('theme-select');
    const uiLang = document.getElementById('ui-lang-select');
    const model = document.getElementById('model-select');
    const displayStyle = document.getElementById('display-style-select');
    const userInfo = document.getElementById('user-info');
    const signOutBtn = document.getElementById('sign-out');
  
    // Load from localStorage
    provider.value = localStorage.getItem('defaultProvider') || 'openai';
    theme.value = localStorage.getItem('theme') || 'system';
    uiLang.value = localStorage.getItem('uiLang') || 'en';
    model.value = localStorage.getItem('translationModel') || 'gpt-3.5-turbo';
    displayStyle.value = localStorage.getItem('webDisplayStyle') || 'inline';
  
    // Save to localStorage on change
    provider.addEventListener('change', () => localStorage.setItem('defaultProvider', provider.value));
    theme.addEventListener('change', () => localStorage.setItem('theme', theme.value));
    uiLang.addEventListener('change', () => localStorage.setItem('uiLang', uiLang.value));
    model.addEventListener('change', () => localStorage.setItem('translationModel', model.value));
    displayStyle.addEventListener('change', () => localStorage.setItem('webDisplayStyle', displayStyle.value));
  
    // Firebase auth user info
    firebase.auth().onAuthStateChanged(user => {
      if (user) {
        userInfo.textContent = `Signed in as ${user.displayName || user.email}`;
      } else {
        userInfo.textContent = 'Not signed in';
      }
    });
  
    // Sign out
    signOutBtn.addEventListener('click', () => {
      firebase.auth().signOut().then(() => {
        userInfo.textContent = 'Signed out';
      });
    });
  });
  