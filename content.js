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

    if (popupVisible) {
      enableOutsideClickToClose(root);
    }
  }
});

// Revert page to original
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

// Full-page translation (manual button click)
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
        const trimmed = node.nodeValue.trim();
        if (!trimmed) return NodeFilter.FILTER_REJECT;

        const p = node.parentNode;
        if (
          !p ||
          p.nodeName === "SCRIPT" ||
          p.nodeName === "STYLE" ||
          p.nodeName === "TEXTAREA" ||
          p.nodeName === "INPUT" ||
          p.nodeName === "BUTTON" ||
          p.isContentEditable ||
          window.getComputedStyle(p).display === "none" ||
          window.getComputedStyle(p).visibility === "hidden"
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        if (p.closest('[data-translated="true"], .parallel-translator-text-wrapper')) {
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

  const BATCH_SIZE = 20;
  const batches = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push({
      texts: texts.slice(i, i + BATCH_SIZE),
      nodes: nodes.slice(i, i + BATCH_SIZE)
    });
  }

  try {
    await Promise.all(
      batches.map(batch => translateBatch(batch, targetLang, mode))
    );
    console.log(`content.js translation (${mode}) complete: ${nodes.length} nodes.`);
  } catch (err) {
    console.error("content.js translation error:", err);
  } finally {
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

// Incremental translation (auto on new content)
async function translateIncremental(targetLang = "auto", mode = "replace") {
  const newNodes = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: node => {
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        // skip already translated
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
  const BATCH_SIZE = 20;
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

// Helper to translate a single batch
async function translateBatch({ texts: batchTexts, nodes: batchNodes }, targetLang, mode) {
  const ids = batchNodes.map((_, i) => i);

  const res = await fetch("https://parallel-llm-translator.onrender.com/translate_webpage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ids,
      texts: batchTexts,
      language: targetLang
    })
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    console.error("content.js 400 from translate endpoint:", errJson.error || errJson);
    throw new Error("Bad Request from translation API");
  }

  const json = await res.json();
  let translations;
  if (Array.isArray(json.translations)) {
    translations = json.translations;
  } else {
    const raw =
      (typeof json.result === "string" ? json.result
        : typeof json.translation === "string" ? json.translation
        : "")
      .replace(/^"+|"+$/g, "");

    let cleaned = raw.split("\n\n").map(s => s.trim());
    while (cleaned.length < batchTexts.length) cleaned.push("");
    if (cleaned.length > batchTexts.length) cleaned.length = batchTexts.length;

    translations = batchNodes.map((node, i) =>
      cleaned[i] !== "" ? cleaned[i] : node.nodeValue
    );
  }

  translations.forEach((translated, i) => {
    const node = batchNodes[i];
    const parent = node.parentNode;
    if (!parent) return;

    if (mode === "dual") {
      const wrapper = document.createElement("span");
      wrapper.className = "translated-dual";
      wrapper.dataset.originalText = node.nodeValue;
      wrapper.dataset.translated = "true";

      const original = document.createElement("span");
      original.className = "original-text";
      original.textContent = node.nodeValue;

      const tSpan = document.createElement("span");
      tSpan.className = "translated-text";
      tSpan.textContent = translated;

      wrapper.appendChild(original);
      wrapper.appendChild(document.createElement("br"));
      wrapper.appendChild(tSpan);
      parent.replaceChild(wrapper, node);
    } else {
      parent.dataset.originalText = node.nodeValue;
      parent.dataset.translated = "true";
      node.nodeValue = translated;
    }
  });
}

// MutationObserver with debounce
let observerTimeout = null;
const observer = new MutationObserver(() => {
  if (observerTimeout) clearTimeout(observerTimeout);
  observerTimeout = setTimeout(() => {
    chrome.storage.local.get(["targetLang", "displayMode"], data => {
      translateIncremental(data.targetLang || "en", data.displayMode || "replace");
    });
  }, 1000);
});

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
