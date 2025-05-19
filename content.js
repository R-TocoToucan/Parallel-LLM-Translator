// content.js

let popupVisible = false;
let outsideClickListener = null;

// Get selected text and its coordinates
function getSelectedTextAndCoords() {
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();

  let coords = null;
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      coords = {
        top: rect.top + window.scrollY + 20,
        left: rect.left + window.scrollX
      };
    }
  }

  return { selectedText, coords };
}

// Create popup root
function createPopupRoot(coords) {
  const root = document.createElement("div");
  root.id = "parallel-translator-root";

  if (coords) {
    root.style.position = "absolute";
    root.style.top      = coords.top + "px";
    root.style.left     = coords.left + "px";
  } else {
    root.style.position = "fixed";
    root.style.bottom   = "20px";
    root.style.right    = "20px";
  }

  root.style.zIndex = "999999";
  document.body.appendChild(root);
  return root.attachShadow({ mode: "open" });
}

function movePopupTo(root, coords) {
  if (coords) {
    root.style.position = "absolute";
    root.style.top      = coords.top + "px";
    root.style.left     = coords.left + "px";
    root.style.bottom   = "";
    root.style.right    = "";
  } else {
    root.style.position = "fixed";
    root.style.top      = "";
    root.style.left     = "";
    root.style.bottom   = "20px";
    root.style.right    = "20px";
  }
}

function enableOutsideClickToClose(root) {
  outsideClickListener = event => {
    if (!root.contains(event.target)) {
      root.style.display = "none";
      popupVisible = false;
      document.removeEventListener("mousedown", outsideClickListener);
      outsideClickListener = null;
    }
  };
  document.addEventListener("mousedown", outsideClickListener);
}

async function loadPopupContent(shadow, selectedText) {
  const htmlURL  = chrome.runtime.getURL("popup.html");
  const htmlText = await fetch(htmlURL).then(r => r.text());
  const wrapper  = document.createElement("div");
  wrapper.innerHTML = htmlText;
  shadow.appendChild(wrapper);

  const style = document.createElement("link");
  style.rel  = "stylesheet";
  style.href = chrome.runtime.getURL("popup_style.css");
  shadow.appendChild(style);

  const scriptURL = chrome.runtime.getURL("popup.js");
  const popupModule = await import(scriptURL);
  popupModule.initializePopup(shadow, selectedText);
}

function updatePopupText(shadow, selectedText) {
  shadow.querySelectorAll(".original-textarea").forEach(ta => {
    ta.value = selectedText;
  });
}

document.addEventListener("keydown", async e => {
  if (e.ctrlKey && e.key.toLowerCase() === "b") {
    const { selectedText, coords } = getSelectedTextAndCoords();
    let root = document.getElementById("parallel-translator-root");

    if (!root) {
      const shadow = createPopupRoot(coords);
      await loadPopupContent(shadow, selectedText);
      popupVisible = true;
    } else {
      const shadow = root.shadowRoot;
      if (popupVisible) {
        root.style.display = "none";
        popupVisible = false;
      } else {
        movePopupTo(root, coords);
        root.style.display = "block";
        popupVisible = true;
        updatePopupText(shadow, selectedText);
      }
    }

    if (popupVisible) enableOutsideClickToClose(root);
  }
});

// Revert page to original by unwrapping our wrappers
function revertPageTranslation() {
  const wrappers = document.querySelectorAll(".parallel-translator-text-wrapper");
  wrappers.forEach(wrapper => {
    const original = wrapper.dataset.originalText;
    if (original == null) return;
    const parent = wrapper.parentNode;

    if (wrapper.dataset.translated === "dual") {
      const sib = wrapper.nextSibling;
      if (sib && sib.classList && sib.classList.contains("parallel-translator-translated-wrapper")) {
        parent.removeChild(sib);
      }
    }

    parent.replaceChild(document.createTextNode(original), wrapper);
  });
  console.log("[content.js] Reverted to original text.");
}

// Optimized per-node batch translation via /translate_webpage
async function translatePage(targetLang = "auto", mode = "replace") {
  observer.disconnect();
  revertPageTranslation();

  // 1) Collect all text nodes first
  const textNodes = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: node => {
        const txt = node.nodeValue.trim();
        if (!txt) return NodeFilter.FILTER_REJECT;

        const p = node.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        const style = window.getComputedStyle(p);
        if (style.display === "none" || style.visibility === "hidden") {
          return NodeFilter.FILTER_REJECT;
        }

        // Skip unwanted containers
        if (p.closest("script,style,textarea,input,button,nav,header,footer,aside,form,select,option")) {
          return NodeFilter.FILTER_REJECT;
        }

        if (p.isContentEditable) {
          return NodeFilter.FILTER_REJECT;
        }

        // Skip nodes we already wrapped
        if (p.classList && p.classList.contains("parallel-translator-text-wrapper")) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }
  if (!textNodes.length) {
    console.log("[content.js] No new text to translate.");
    observer.observe(document.body, { childList: true, subtree: true });
    return;
  }

  // 2) Wrap each text node and assign an ID
  const wrappers = textNodes.map((tn, i) => {
    const span = document.createElement("span");
    span.className = "parallel-translator-text-wrapper";
    span.dataset.ttId         = i;
    span.dataset.originalText = tn.nodeValue;
    span.textContent          = tn.nodeValue;
    tn.parentNode.replaceChild(span, tn);
    return span;
  });

  // 3) Build arrays of ids and texts
  const ids   = wrappers.map(w => Number(w.dataset.ttId));
  const texts = wrappers.map(w => w.textContent);

  // 4) Send one POST to /translate_webpage
  let json;
  try {
    const resp = await fetch("https://parallel-llm-translator.onrender.com/translate_webpage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, texts, language: targetLang, tier: "free" })
    });
    if (!resp.ok) throw await resp.json();
    json = await resp.json();  // { translations: [...] }
  } catch (err) {
    console.error("[⚠️ content.js] Translate API error:", err);
    observer.observe(document.body, { childList: true, subtree: true });
    return;
  }

  // 5) Map translations back into each wrapper
  const { translations } = json;
  wrappers.forEach((span, i) => {
    const t = translations[i] != null ? translations[i] : span.dataset.originalText;
    if (mode === "dual") {
      span.dataset.translated = "dual";
      const tspan = document.createElement("span");
      tspan.className = "parallel-translator-translated-wrapper";
      tspan.textContent = t;
      span.after(document.createElement("br"), tspan);
    } else {
      span.dataset.translated = "true";
      span.textContent = t;
    }
  });

  console.log(`[content.js] Translation (${mode}) complete: ${wrappers.length} nodes.`);
  observer.observe(document.body, { childList: true, subtree: true });
}

// MutationObserver with debounce
let observerTimeout = null;
const observer = new MutationObserver(() => {
  if (observerTimeout) clearTimeout(observerTimeout);
  observerTimeout = setTimeout(() => {
    chrome.storage.local.get(["targetLang","displayMode"], data => {
      translatePage(data.targetLang || "en", data.displayMode || "replace");
    });
  }, 1000);
});

function enableDynamicTranslation() {
  observer.observe(document.body, { childList: true, subtree: true });
}

// Manual translate via popup message
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "translatePage") {
    translatePage(msg.targetLang, msg.mode);
    sendResponse({ status: "started" });
  }
});

// Ctrl+Shift+Z to revert manually
document.addEventListener("keydown", e => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "z") {
    revertPageTranslation();
  }
});
