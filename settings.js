document.addEventListener('DOMContentLoaded', () => {
  const uiLang = document.getElementById('ui-lang-select');
  const model = document.getElementById('model-select');
  const userInfo = document.getElementById('user-info');
  const creditInfo = document.getElementById('credit-info');
  const authBtn = document.getElementById('auth-toggle');
  const dictBtn = document.getElementById('manage-dictionary');

  // Load preferences from localStorage
  uiLang.value = localStorage.getItem('uiLang') || 'en';
  model.value = localStorage.getItem('translationModel') || 'gpt-3.5-turbo';

  uiLang.addEventListener('change', () => localStorage.setItem('uiLang', uiLang.value));
  model.addEventListener('change', () => localStorage.setItem('translationModel', model.value));

  // Personal Dictionary
  dictBtn.addEventListener('click', () => {
    alert('Dictionary manager not implemented yet.');
  });

  // Fetch user profile info from Google
  async function fetchGoogleProfile(token) {
    try {
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Profile fetch failed");
      return await res.json();
    } catch (err) {
      console.error("Error fetching profile:", err);
      return null;
    }
  }

  // Fetch credit info from backend
  function fetchCredits(token) {
    fetch('https://parallel-llm-translator.onrender.com/user/credits', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        creditInfo.textContent = `Remaining Credits: ${data.credits || 0}`;
      })
      .catch(() => {
        creditInfo.textContent = 'Could not load credits';
      });
  }

  // Update auth button UI
  function updateAuthUI(signedIn, profile) {
    if (signedIn) {
      authBtn.textContent = 'Sign Out';
      authBtn.dataset.signedIn = 'true';
      authBtn.style.display = 'block';
      userInfo.textContent = `Signed in as ${profile.name || profile.email}`;
    } else {
      authBtn.textContent = 'Sign In';
      authBtn.dataset.signedIn = 'false';
      userInfo.textContent = 'Not signed in';
      creditInfo.textContent = '';
    }
  }

  // Handle Sign In / Sign Out toggle
  authBtn.addEventListener('click', () => {
    const isSignedIn = authBtn.dataset.signedIn === 'true';

    if (isSignedIn) {
      // Sign Out
      const token = localStorage.getItem("googleToken");
      if (token) {
        chrome.identity.removeCachedAuthToken({ token }, () => {
          console.log("Token removed.");
        });
      }
      localStorage.removeItem("googleToken");
      updateAuthUI(false, {});
    } else {
      // Force new sign-in by invalidating any cached token first
      chrome.identity.getAuthToken({ interactive: false }, (oldToken) => {
        if (oldToken) {
          chrome.identity.removeCachedAuthToken({ token: oldToken }, () => {
            getNewToken();
          });
        } else {
          getNewToken();
        }
      });
    }
  });

  // Request new token and fetch profile
  function getNewToken() {
    chrome.identity.getAuthToken({ interactive: true }, async (token) => {
      if (!token) {
        userInfo.textContent = 'Sign-in failed';
        return;
      }

      localStorage.setItem("googleToken", token);
      const profile = await fetchGoogleProfile(token);
      if (profile) {
        updateAuthUI(true, profile);
        fetchCredits(token);
      } else {
        userInfo.textContent = 'Signed in';
        fetchCredits(token);
      }
    });
  }

  // On load: check if already signed in
  const existingToken = localStorage.getItem("googleToken");
  if (existingToken) {
    fetchGoogleProfile(existingToken).then(profile => {
      if (profile) {
        updateAuthUI(true, profile);
        fetchCredits(existingToken);
      } else {
        updateAuthUI(false, {});
      }
    });
  } else {
    updateAuthUI(false, {});
  }
});
