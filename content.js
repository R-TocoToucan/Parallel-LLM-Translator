// content.js

let popupInjected = false;
let popupVisible = false; // 팝업 표시 여부 관리
let outsideClickListener = null; // Listener for outside click to close popup 외부 클릭시 닫기

// Get the currently selected text and its coordinates 현제 좌표 구하기
function getSelectedTextAndCoords() {
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();

  let coords = null;
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      coords = {
        top: rect.top + window.scrollY + 20, // 약간 아래로 오프셋
        left: rect.left + window.scrollX
      };
    }
  }

  return { selectedText, coords };
}

// Create the popup root div and position it 팝업창 위치 설정
function createPopupRoot(coords) {
  const root = document.createElement("div");
  root.id = "parallel-translator-root";

  if (coords) {
    root.style.position = "absolute";
    root.style.top = coords.top + "px";
    root.style.left = coords.left + "px";
  } else {
    // Default position 좌표가 없으면 기본적으로 오른쪽 아래로
    root.style.position = "fixed";
    root.style.bottom = "20px";
    root.style.right = "20px";
  }

  root.style.zIndex = "999999";
  document.body.appendChild(root);

  return root.attachShadow({ mode: "open" });
}

// Move popup to new coordinates or fallback to bottom-right 좌표 이동 또는 기본 위치 설정
function movePopupTo(root, coords) {
  if (coords) {
    root.style.position = "absolute";
    root.style.top = coords.top + "px"; // 새 선택 위치로 이동
    root.style.left = coords.left + "px"; // 새 선택 위치로 이동
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

// Detect clicks outside the popup and hide it
function enableOutsideClickToClose(root) {
  outsideClickListener = (event) => {
    if (!root.contains(event.target)) {
      root.style.display = "none";
      popupVisible = false;
      document.removeEventListener("mousedown", outsideClickListener);
      outsideClickListener = null;
    }
  };
  document.addEventListener("mousedown", outsideClickListener);
}

// Load popup HTML, CSS, and JS into the shadow DOM
async function loadPopupContent(shadow, selectedText) {
  const htmlURL = chrome.runtime.getURL("popup.html");
  const htmlText = await fetch(htmlURL).then((res) => res.text());
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

// Update existing popup textareas if popup already exists
function updatePopupText(shadow, selectedText) {
  const allTextareas = shadow.querySelectorAll(".original-textarea");
  allTextareas.forEach((ta) => {
    ta.value = selectedText;
  });
}

// Main trigger - listen for Ctrl+B
document.addEventListener("keydown", async (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === "b") {
    // Capture the highlighted text from the page
    const { selectedText, coords } = getSelectedTextAndCoords();
    console.log("Selected text:", selectedText);

    // Create Popup 선택한 텍스트 위치에 팝업창 생성
    let root = document.getElementById("parallel-translator-root");
    if (!root) {
      const shadow = createPopupRoot(coords);
      await loadPopupContent(shadow, selectedText);
      popupVisible = true; // 새로 만들었으므로 표시 상태로 설정
    } else {
      const shadow = root.shadowRoot;
      if (popupVisible) {
        // 팝업이 열려있으면 닫기
        root.style.display = "none";
        popupVisible = false;
      } else {
        // 팝업이 닫혀있으면 새 좌표로 이동 후 열기
        movePopupTo(root, coords);
        root.style.display = "block";
        popupVisible = true;
        updatePopupText(shadow, selectedText);
      }
    }
    // Close on outside click
    if (popupVisible) enableOutsideClickToClose(root);
  }
});


// --- Full-page translation logic moved into content.js ---
async function translatePage(targetLang = 'en') {
  const texts = [];
  const nodes = [];

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const trimmed = node.nodeValue.trim();
        if (!trimmed) return NodeFilter.FILTER_REJECT;
        const p = node.parentNode;
        if (
          p.nodeName === 'SCRIPT' ||
          p.nodeName === 'STYLE'  ||
          p.nodeName === 'TEXTAREA' ||
          p.nodeName === 'INPUT' ||
          p.nodeName === 'BUTTON' ||
          p.isContentEditable
        ) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let n;
  while (n = walker.nextNode()) {
    texts.push(n.nodeValue);
    nodes.push(n);
  }

  if (texts.length === 0) {
    console.log("[content.js] No text to translate.");
    return;
  }

  console.log(`[content.js] Translating ${texts.length} nodes…`);
  try {
    // Build a single-string payload
    const payload = {
      text: texts.join("\n\n"),
      language: targetLang,
      tier: 'free'
    };

    const res = await fetch(
      'https://parallel-llm-translator.onrender.com/translate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    if (!res.ok) {
      console.error(`[content.js] Translate API returned HTTP ${res.status}`);
      return;
    }

    const json = await res.json();
    const translatedFull = json.result || json.translations || json.translation || "";
    const splits = translatedFull
    .split("\n\n")
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
    // Reassign back to original text nodes
    splits.forEach((t, i) => {
      if (nodes[i]) nodes[i].nodeValue = t;
    });

    console.log('[✅ content.js] Page translation complete.');
  } catch (err) {
    console.error('[❌ content.js] Translation failed:', err);
  }
}

// Listen for translatePage messages from the popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'translatePage') {
    translatePage(msg.targetLang);
    sendResponse({ status: 'started' });
  }
});
