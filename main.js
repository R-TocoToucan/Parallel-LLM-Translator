// main.js

import {
  initUserService,
  getCredit,
  decrementCredit,
  getUserTier,
  updateUserTier
} from "./userService.js";

import {
  signIn,
  signOut,
  getProfile,
  syncUserData,
  getAppUserData
} from "./authService.js";

console.log("main.js loaded");

//
// Wait for userService to initialize / userService가 초기화될 때까지 대기
//
function waitForUserServiceInit(callback) {
  initUserService(callback);
}

//
// Update UI to reflect signed-in or signed-out state
//
async function updateUserDisplay(accessToken) {
  const userInfoEl = document.getElementById("user-info");
  const authBtn    = document.getElementById("auth-btn");
  if (!userInfoEl || !authBtn) return;

  if (accessToken) {
    // Signed in: show profile name/email
    const profile     = await getProfile(accessToken);
    const displayName = profile.name || profile.email || "Signed in";
    userInfoEl.textContent   = `Signed in as ${displayName}`;
    authBtn.textContent      = "Sign Out";
    authBtn.classList.replace("auth-sign-in", "auth-sign-out");
    authBtn.dataset.signedIn = "true";
  } else {
    // Not signed in
    userInfoEl.textContent   = "Not signed in";
    authBtn.textContent      = "Sign In";
    authBtn.classList.replace("auth-sign-out", "auth-sign-in");
    authBtn.dataset.signedIn = "false";
  }
}

//
// Handle Sign In / Sign Out button clicks
//
document.getElementById("auth-btn")?.addEventListener("click", async () => {
  const userInfoEl = document.getElementById("user-info");
  const authBtn    = document.getElementById("auth-btn");

  if (authBtn.dataset.signedIn === "true") {
    // ─── Sign Out ─────────────────────────────────────────
    await signOut();
    await updateUserDisplay(null);

    // Show guest tier/credits
    const tier    = await getUserTier();
    const credits = await getCredit();
    userInfoEl.textContent += ` (Tier: ${tier}, Credits: ${credits})`;
  } else {
    // ─── Sign In ──────────────────────────────────────────
    try {
      // Get fresh access & ID tokens
      const accessToken = await signIn();

      // Update UI with profile
      await updateUserDisplay(accessToken);

      // Sync or create Firestore user record
      await syncUserData();

      // Fetch real tier/credits from backend
      const appUser = await getAppUserData();
      userInfoEl.textContent +=
        ` (Tier: ${appUser.tier}, Credits: ${appUser.creditsRemaining})`;

      console.log("User data synced & loaded successfully");
    } catch (err) {
      console.error("Sign-in flow failed:", err);

      // Fallback to guest view
      await updateUserDisplay(null);
      const tier    = await getUserTier();
      const credits = await getCredit();
      userInfoEl.textContent += ` (Tier: ${tier}, Credits: ${credits})`;
    }
  }
});

//
// 언어 목록 정의
//
const languages = [
  { label: "Auto Detect", favorited: true, sourceOnly: true },
  { label: "English",     favorited: true },
  { label: "Korean",      favorited: true },
  { label: "Japanese",    favorited: false },
  { label: "Chinese",     favorited: false },
];

//
// 드롭다운 생성
//
function createDropdown(id, label, items, filterFn = () => true) {
  const container = document.getElementById(id);
  const button    = document.createElement("button");
  button.className = "dropdown-btn";
  button.innerHTML = `${label} <i class="fas fa-chevron-down"></i>`;

  const list = document.createElement("div");
  list.className = "dropdown-list";
  list.setAttribute("id", id + "-list");

  const filtered = items.filter(filterFn);

  chrome.storage.local.get(
    ["favorites", "sourceLang", "targetLang"],
    data => {
      const key          = id.includes("source") ? "sourceLang" : "targetLang";
      const lastSelected = data[key];

      if (Array.isArray(data.favorites)) {
        filtered.forEach(item => {
          item.favorited = data.favorites.includes(item.label);
        });
      }

      const render = () => {
        list.innerHTML = "";
        const sorted = [...filtered].sort((a, b) => b.favorited - a.favorited);
        sorted.forEach(item => {
          const div = document.createElement("div");
          div.className = "dropdown-item";
          div.innerHTML =
            `<span>${item.label}</span>` +
            `<i class="fas fa-star star-icon${item.favorited ? " favorited" : ""}"></i>`;

          const star = div.querySelector(".star-icon");
          star.addEventListener("click", e => {
            e.stopPropagation();
            item.favorited = !item.favorited;
            const updated = filtered
              .filter(i => i.favorited)
              .map(i => i.label);
            chrome.storage.local.set({ favorites: updated });
            render();
          });

          div.addEventListener("click", () => {
            button.innerHTML = `${item.label} <i class="fas fa-chevron-down"></i>`;
            list.classList.remove("open");
            chrome.storage.local.set({ [key]: item.label });
          });

          list.appendChild(div);
        });
      };

      if (lastSelected) {
        button.innerHTML = `${lastSelected} <i class="fas fa-chevron-down"></i>`;
      }

      render();
    }
  );

  button.addEventListener("click", event => {
    event.stopPropagation();
    list.classList.toggle("open");
  });

  document.addEventListener("click", event => {
    if (!list.contains(event.target)) list.classList.remove("open");
  });

  container.appendChild(button);
  container.appendChild(list);
}

//
// 선택된 언어 가져오기
//
function getSelectedLanguage(dropdownId) {
  const dropdown = document.getElementById(dropdownId);
  const btn      = dropdown?.querySelector(".dropdown-btn");
  return btn ? btn.innerText.trim() : null;
}

//
// Bind Translate Button
// Bind Translate Button
function bindTranslateButton() {
  document.getElementById("translate-btn")?.addEventListener("click", () => {
    const targetLang = getSelectedLanguage("target-dropdown") || "Korean";
    chrome.storage.local.get(
      ["displayMode", "translationModel"],
      data => {
        const mode  = data.displayMode  || "replace";
        const model = data.translationModel || "gpt-3.5-turbo";

        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          const tabId = tabs[0]?.id;
          if (!tabId) return;

          chrome.tabs.sendMessage(tabId, {
            type: "translatePage",
            targetLang,
            mode,
            model
          });
        });
      }
    );
  });
}

//
// 다크모드 토글 동기화
//
const darkToggle = document.getElementById("dark-toggle");
if (darkToggle) {
  const syncTheme = () => {
    document.body.classList.toggle("light", !darkToggle.checked);
  };
  darkToggle.addEventListener("change", syncTheme);
  darkToggle.checked = true;
  syncTheme();
}

//
// 초기 UI 세팅
//
document.addEventListener("DOMContentLoaded", async () => {
  createDropdown("source-dropdown", "Select Language", languages);
  createDropdown(
    "target-dropdown",
    "Select Language",
    languages,
    item => !item.sourceOnly
  );

  const displayModeSelect = document.getElementById("display-mode");
  if (displayModeSelect) {
    chrome.storage.local.get(["displayMode"], data => {
      if (data.displayMode) displayModeSelect.value = data.displayMode;
    });
    displayModeSelect.addEventListener("change", () => {
      chrome.storage.local.set({ displayMode: displayModeSelect.value });
    });
  }

  waitForUserServiceInit((user, data) => {
    // optional: use local userService data if needed
  });

  // Update UI based on existing token (if any)
  const accessToken = localStorage.getItem("googleToken");
  await updateUserDisplay(accessToken);

  if (accessToken) {
    // If signed in from before, try to show real user data
    try {
      const appUser = await getAppUserData();
      document.getElementById("user-info").textContent +=
        ` (Tier: ${appUser.tier}, Credits: ${appUser.creditsRemaining})`;
    } catch (e) {
      console.warn("Could not fetch app user data:", e);
      const tier    = await getUserTier();
      const credits = await getCredit();
      document.getElementById("user-info").textContent +=
        ` (Tier: ${tier}, Credits: ${credits})`;
    }
  } else {
    // Guest
    const tier    = await getUserTier();
    const credits = await getCredit();
    document.getElementById("user-info").textContent +=
      ` (Tier: ${tier}, Credits: ${credits})`;
  }

  // Finally bind the translate button
  bindTranslateButton();
});
