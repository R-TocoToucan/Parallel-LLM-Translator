console.log("main.js loaded");

const BACKEND_URL = "https://parallel-llm-translator.onrender.com";
const GOOGLE_CLIENT_ID = "277604934909-g4k6ndulm1tuhosglhiaegsebs9q1omq.apps.googleusercontent.com";

// Wait for userService to initialize / userService가 초기화될 때까지 대기
function waitForUserServiceInit(callback) {
  const interval = setInterval(() => {
    if (window.userService && window.userService.initUserService) {
      clearInterval(interval);
      callback();
    }
  }, 50);
}

// Get OAuth token using launchWebAuthFlow (forces account chooser)
// launchWebAuthFlow를 사용하여 Google 토큰 요청 (계정 선택 강제)
async function getGoogleTokenViaLaunch() {
  const redirectUri = chrome.identity.getRedirectURL(); // 확장 전용 redirect URI

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("response_type", "token");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile");
  authUrl.searchParams.set("prompt", "select_account"); // 계정 선택 창 강제 표시

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive: true }, (redirectUrl) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!redirectUrl) return reject(new Error("Empty redirect"));

      const tokenMatch = redirectUrl.match(/[#&]access_token=([^&]*)/);
      if (!tokenMatch) return reject(new Error("No access token found"));
      resolve(tokenMatch[1]);
    });
  });
}

// Fetch user profile from Google using access token
// Google 사용자 정보 불러오기
async function getGoogleProfile(token) {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Profile fetch failed");
    return await res.json(); // { name, email, ... }
  } catch (e) {
    console.error("Failed to fetch profile:", e);
    return {};
  }
}

// Update UI to reflect signed-in or signed-out state
// 로그인 UI 상태 갱신
async function updateUserDisplay(token) {
  const userInfoEl = document.getElementById("user-info");
  const authBtn = document.getElementById("auth-btn");

  if (!userInfoEl || !authBtn) return;

  authBtn.classList.remove("auth-sign-in", "auth-sign-out");

  if (token) {
    const profile = await getGoogleProfile(token);
    const displayName = profile.name || profile.email || "Signed in";
    userInfoEl.textContent = `Signed in as ${displayName}`;
    authBtn.innerHTML = `Sign Out`;
    authBtn.classList.add("auth-sign-out");
    authBtn.dataset.signedIn = "true";
  } else {
    userInfoEl.textContent = "Not signed in";
    authBtn.innerHTML = `Sign In`;
    authBtn.classList.add("auth-sign-in");
    authBtn.dataset.signedIn = "false";
  }
}

// Handle sign-in and sign-out button clicks
// 로그인 / 로그아웃 버튼 처리
document.getElementById("auth-btn")?.addEventListener("click", async () => {
  const authBtn = document.getElementById("auth-btn");

  if (authBtn?.dataset.signedIn === "true") {
    // 로그아웃 처리
    await chrome.identity.clearAllCachedAuthTokens(); // 모든 토큰 및 사용자 기본 계정 설정 제거
    localStorage.removeItem("googleToken");
    await updateUserDisplay(null);
  } else {
    try {
      const token = await getGoogleTokenViaLaunch(); // 로그인 시도
      localStorage.setItem("googleToken", token);
      await updateUserDisplay(token);
    } catch (err) {
      console.error("Google Sign-In failed:", err);
      await updateUserDisplay(null);
    }
  }
});

// 언어 목록 정의
const languages = [
  { label: "Auto Detect", favorited: true, sourceOnly: true },
  { label: "English", favorited: true },
  { label: "Korean", favorited: true },
  { label: "Japanese", favorited: false },
  { label: "Chinese", favorited: false },
];

// 드롭다운 생성
function createDropdown(id, label, items, filterFn = () => true) {
  const container = document.getElementById(id);
  const button = document.createElement("button");
  button.className = "dropdown-btn";
  button.innerHTML = `${label} <i class="fas fa-chevron-down"></i>`;

  const list = document.createElement("div");
  list.className = "dropdown-list";
  list.setAttribute("id", id + "-list");

  const filtered = items.filter(filterFn);

  chrome.storage.local.get(["favorites", "sourceLang", "targetLang"], (data) => {
    const key = id.includes("source") ? "sourceLang" : "targetLang";
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
        div.innerHTML = `<span>${item.label}</span><i class="fas fa-star star-icon${item.favorited ? " favorited" : ""}"></i>`;

        const star = div.querySelector(".star-icon");
        star.addEventListener("click", e => {
          e.stopPropagation();
          item.favorited = !item.favorited;
          const updated = filtered.filter(i => i.favorited).map(i => i.label);
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
  });

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    list.classList.toggle("open");
  });

  document.addEventListener("click", (event) => {
    if (!list.contains(event.target)) list.classList.remove("open");
  });

  container.appendChild(button);
  container.appendChild(list);
}

// 선택된 언어 가져오기
function getSelectedLanguage(dropdownId) {
  const dropdown = document.getElementById(dropdownId);
  const btn = dropdown?.querySelector(".dropdown-btn");
  return btn ? btn.innerText.trim() : null;
}

// 번역 버튼 처리
document.getElementById("translate-btn")?.addEventListener("click", () => {
  const targetLang = getSelectedLanguage("target-dropdown") || "Korean";
  chrome.storage.local.get(["displayMode"], (data) => {
    const mode = data.displayMode || "replace";
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) return;
      chrome.tabs.sendMessage(tabs[0].id, {
        type: "translatePage",
        targetLang,
        mode,
      }, (resp) => {
        console.log("Translate response:", resp);
      });
    });
  });
});

// 다크모드 토글 동기화
const darkToggle = document.getElementById("dark-toggle");
if (darkToggle) {
  const syncTheme = () => {
    document.body.classList.toggle("light", !darkToggle.checked);
  };
  darkToggle.addEventListener("change", syncTheme);
  darkToggle.checked = true;
  syncTheme();
}

// 초기 UI 세팅
document.addEventListener("DOMContentLoaded", async () => {
  createDropdown("source-dropdown", "Select Language", languages);
  createDropdown("target-dropdown", "Select Language", languages, item => !item.sourceOnly);

  const displayModeSelect = document.getElementById("display-mode");
  if (displayModeSelect) {
    chrome.storage.local.get(["displayMode"], (data) => {
      if (data.displayMode) displayModeSelect.value = data.displayMode;
    });
    displayModeSelect.addEventListener("change", () => {
      chrome.storage.local.set({ displayMode: displayModeSelect.value });
    });
  }

  waitForUserServiceInit(() => {
    const { initUserService } = window.userService;
    initUserService(() => {});
  });

  const token = localStorage.getItem("googleToken");
  await updateUserDisplay(token);
});
