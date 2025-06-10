console.log("main.js loaded");

const BACKEND_URL = "https://parallel-llm-translator.onrender.com/translate";

// Safely initialize user service
function waitForUserServiceInit(callback) {
  const interval = setInterval(() => {
    if (window.userService && window.userService.initUserService) {
      clearInterval(interval);
      callback();
    }
  }, 50);
}

// Authenticate using chrome.identity
async function getGoogleAuthToken() {
  return new Promise((resolve, reject) => {
    if (!chrome.identity) {
      reject(new Error("chrome.identity not available"));
      return;
    }

    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(chrome.runtime.lastError || new Error("Token retrieval failed"));
      } else {
        resolve(token);
      }
    });
  });
}

function updateUserDisplay(userEmail) {
  const userInfoEl = document.getElementById("user-info");
  if (userInfoEl) {
    userInfoEl.textContent = userEmail ? `Signed in as ${userEmail}` : "Not signed in";
  }
}

// Google Sign-In
document.getElementById("show-login")?.addEventListener("click", async () => {
  try {
    const token = await getGoogleAuthToken();
    console.log("Google token acquired:", token);
    localStorage.setItem("googleToken", token);
    updateUserDisplay("Google User");
  } catch (err) {
    console.error("Google Sign-In failed:", err);
    updateUserDisplay(null);
  }
});

// Language dropdowns
const languages = [
  { label: "Auto Detect", favorited: true, sourceOnly: true },
  { label: "English", favorited: true },
  { label: "Korean", favorited: true },
  { label: "Japanese", favorited: false },
  { label: "Chinese", favorited: false },
];

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

function getSelectedLanguage(dropdownId) {
  const dropdown = document.getElementById(dropdownId);
  const btn = dropdown?.querySelector(".dropdown-btn");
  return btn ? btn.innerText.trim() : null;
}

// Translate button
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

// Dark mode
const darkToggle = document.getElementById("dark-toggle");
if (darkToggle) {
  const syncTheme = () => {
    document.body.classList.toggle("light", !darkToggle.checked);
  };
  darkToggle.addEventListener("change", syncTheme);
  darkToggle.checked = true;
  syncTheme();
}

// Drag toggle & layout init
document.addEventListener("DOMContentLoaded", () => {
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
    initUserService((user) => {
      updateUserDisplay(user?.email || null);
    });
  });
});
