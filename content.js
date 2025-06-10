let popupVisible = false;
let outsideClickListener = null;

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

function createPopupRoot(coords) {
  const root = document.createElement("div");
  root.id = "parallel-translator-root";
  if (coords) {
    root.style.position = "absolute";
    root.style.top = coords.top + "px";
    root.style.left = coords.left + "px";
  } else {
    root.style.position = "fixed";
    root.style.bottom = "20px";
    root.style.right = "20px";
  }
  root.style.zIndex = "999999";
  document.body.appendChild(root);
  return root.attachShadow({ mode: "open" });
}

function movePopupTo(root, coords) {
  if (coords) {
    root.style.position = "absolute";
    root.style.top = coords.top + "px";
    root.style.left = coords.left + "px";
    root.style.bottom = "";
    root.style.right = "";
  } else {
    root.style.position = "fixed";
    root.style.top = "";
    root.style.left = "";
    root.style.bottom = "20px";
    root.style.right = "20px";
  }
}

function enableOutsideClickToClose(root) {
  outsideClickListener = event => {
    if (!root || !root.contains(event.target)) {
      if (root) root.style.display = "none";
      popupVisible = false;
      document.removeEventListener("mousedown", outsideClickListener);
      outsideClickListener = null;
    }
  };
  document.addEventListener("mousedown", outsideClickListener);
}

async function loadPopupContent(shadow, selectedText) {
  const htmlURL = chrome.runtime.getURL("popup.html");
  const htmlText = await fetch(htmlURL).then(res => res.text());
  const wrapper = document.createElement("div");
  wrapper.innerHTML = htmlText;
  shadow.appendChild(wrapper);

  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = chrome.runtime.getURL("popup_style.css");
  shadow.appendChild(style);

  const scriptURL = chrome.runtime.getURL("popup.js");
  const popupModule = await import(scriptURL);
  popupModule.initializePopup(shadow, selectedText);
}

function updatePopupText(shadow, selectedText) {
  const allTextareas = shadow.querySelectorAll(".original-textarea");
  allTextareas.forEach(ta => {
    ta.value = selectedText;
  });
}

async function openTranslatorPopup(selectedText, coords) {
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
      shadow.getElementById("selection-popup")?.classList.remove("hidden");
      shadow.getElementById("function-popups")?.classList.add("hidden");
      shadow.getElementById("explanation-section")?.classList.add("hidden");
      shadow.getElementById("translation-section")?.classList.add("hidden");
      shadow.getElementById("enhancement-section")?.classList.add("hidden");

      root.style.display = "block";
      popupVisible = true;
      updatePopupText(shadow, selectedText);
    }
  }

  if (popupVisible) {
    enableOutsideClickToClose(root);
  }
}

function revertPageTranslation() {
  const translatedEls = document.querySelectorAll('[data-translated="true"]');
  translatedEls.forEach(el => {
    const original = el.dataset.originalText;
    if (!original) return;
    if (el.classList.contains("translated-dual")) {
      el.replaceWith(document.createTextNode(original));
    } else if (el.firstChild && el.firstChild.nodeType === Node.TEXT_NODE) {
      el.firstChild.nodeValue = original;
      delete el.dataset.translated;
      delete el.dataset.originalText;
    }
  });
  console.log("content.js reverted to original text.");
}

let observerTimeout = null;
const observer = new MutationObserver(() => {
  if (observerTimeout) clearTimeout(observerTimeout);
  observerTimeout = setTimeout(() => {
    chrome.storage.local.get(["targetLang", "displayMode"], data => {
      translateIncremental(data.targetLang || "en", data.displayMode || "replace");
    });
  }, 1000);
});

async function translatePage(targetLang = "auto", mode = "replace") {
  observer.disconnect();
  revertPageTranslation();

  const texts = [];
  const nodes = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: node => {
        const txt = node.nodeValue.trim();
        if (!txt) return NodeFilter.FILTER_REJECT;
        if (/^[\d]+$/.test(txt)) return NodeFilter.FILTER_REJECT;
        const p = node.parentNode;
        if (
          !p ||
          ["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "BUTTON"].includes(p.nodeName) ||
          p.isContentEditable ||
          window.getComputedStyle(p).display === "none" ||
          window.getComputedStyle(p).visibility === "hidden" ||
          p.closest('[data-translated="true"], .parallel-translator-text-wrapper')
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let node;
  while ((node = walker.nextNode())) {
    texts.push(node.nodeValue);
    nodes.push(node);
  }

  if (!nodes.length) {
    console.log("content.js: No new text to translate.");
    observer.observe(document.body, { childList: true, subtree: true });
    return;
  }

  const BATCH_SIZE = 10;
  const batches = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push({
      texts: texts.slice(i, i + BATCH_SIZE),
      nodes: nodes.slice(i, i + BATCH_SIZE)
    });
  }

  try {
    await Promise.all(batches.map(batch => translateBatch(batch, targetLang, mode)));
    console.log(`content.js translation (${mode}) complete: ${nodes.length} nodes.`);
  } catch (err) {
    console.error("content.js translation error:", err);
  } finally {
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

async function translateIncremental(targetLang = "auto", mode = "replace") {
  const newNodes = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: node => {
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (node.parentNode.closest('[data-translated="true"], .parallel-translator-text-wrapper')) {
          return NodeFilter.FILTER_REJECT;
        }
        const p = node.parentNode;
        if (!p || p.isContentEditable) return NodeFilter.FILTER_REJECT;
        const style = window.getComputedStyle(p);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let node;
  while ((node = walker.nextNode())) {
    newNodes.push(node);
  }
  if (!newNodes.length) return;

  const texts = newNodes.map(n => n.nodeValue);
  const batches = [];
  const BATCH_SIZE = 10;
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push({
      texts: texts.slice(i, i + BATCH_SIZE),
      nodes: newNodes.slice(i, i + BATCH_SIZE)
    });
  }

  try {
    await Promise.all(batches.map(batch => translateBatch(batch, targetLang, mode)));
  } catch (err) {
    console.error("content.js incremental translation error:", err);
  }
}

async function translateBatch({ texts: batchTexts, nodes: batchNodes }, targetLang, mode) {
  const ids = batchNodes.map((_, i) => i);
  const payload = { ids, texts: batchTexts, language: targetLang };

  let json;
  try {
    const res = await fetch("https://parallel-llm-translator.onrender.com/translate_webpage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("translateBatch HTTP error", {
        status: res.status,
        statusText: res.statusText,
        errorText
      });
      throw new Error(`HTTP ${res.status}`);
    }

    json = await res.json();
  } catch (err) {
    console.error("translateBatch network error", err);
    batchNodes.forEach((n, i) => injectTranslation(n, batchTexts[i], mode));
    return;
  }

  const raw = Array.isArray(json.outputs)
    ? json.outputs
    : Array.isArray(json.translations)
    ? json.translations
    : [];

  const translationsMap = new Map();
  raw.forEach((entry, idx) => {
    let text = "";
    if (typeof entry === "string") {
      text = entry;
    } else if (entry && typeof entry === "object") {
      text = entry.text || entry.translatedText || entry.translation || "";
    }
    text = text.trim();
    if (text) {
      translationsMap.set(idx, text);
    }
  });

  batchTexts.forEach((orig, idx) => {
    const finalText = translationsMap.has(idx) ? translationsMap.get(idx) : orig;
    injectTranslation(batchNodes[idx], finalText, mode);
    console.log(`[Translated] "${orig}" -> "${finalText}"`);
  });
}

function injectTranslation(node, text, mode) {
  const parent = node.parentNode;
  if (!parent) return;

  if (mode === "dual") {
    const wrapper = document.createElement("span");
    wrapper.className = "translated-dual";
    wrapper.dataset.originalText = node.nodeValue;
    wrapper.dataset.translated = "true";

    const orig = document.createElement("span");
    orig.className = "original-text";
    orig.textContent = node.nodeValue;

    const trans = document.createElement("span");
    trans.className = "translated-text";
    trans.textContent = text;

    wrapper.append(orig, document.createElement("br"), trans);
    parent.replaceChild(wrapper, node);
  } else {
    parent.dataset.originalText = node.nodeValue;
    parent.dataset.translated = "true";
    node.nodeValue = text;
  }
}

// Keybindings
document.addEventListener("keydown", e => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "b") {
    const { selectedText, coords } = getSelectedTextAndCoords();
    openTranslatorPopup(selectedText, coords);
  }

  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "z") {
    revertPageTranslation();
  }
});

// Context menu integration (from background.js)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "parallel-translate-context") {
    const selection = window.getSelection();
    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    let coords = null;
    if (range) {
      const rect = range.getBoundingClientRect();
      if (rect.width && rect.height) {
        coords = {
          top: rect.top + window.scrollY + 20,
          left: rect.left + window.scrollX
        };
      }
    }
    openTranslatorPopup(msg.selectedText, coords);
  }

  if (msg.type === "translatePage") {
    translatePage(msg.targetLang, msg.mode);
    sendResponse({ status: "started" });
  }
});
