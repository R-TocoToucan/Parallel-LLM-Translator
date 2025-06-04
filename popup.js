/**
 * Send translation request and display result in textarea.
 * 번역 요청을 보내고 결과를 textarea에 표시
 * @param {ShadowRoot} shadowRoot Popup의 Shadow DOM 루트
 */
async function performTranslation(shadowRoot) {
  const input = shadowRoot.getElementById("translation-original-text");
  const output = shadowRoot.getElementById("translation-translated-text");
  const langSelect = shadowRoot.getElementById("translation-target-language");

  const text = input?.value.trim();
  const targetLang = langSelect?.value || "en";

  if (!text) {
    output.value = "Please enter some text.";
    return;
  }

  output.value = "Translating...";

  try {
    const res = await fetch("https://parallel-llm-translator.onrender.com/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language: targetLang, tier: "free" })
    });
    const data = await res.json();
    output.value = data.translation || data.result || "Translation failed.";
  } catch (err) {
    console.error("[Translation Error]:", err);
    output.value = "Server error.";
  }
}

/**
 * Send enhancement request and display result in textarea.
 * 문장 개선 요청을 보내고 결과를 textarea에 표시
 * @param {ShadowRoot} shadowRoot Popup의 Shadow DOM 루트
 */
async function performEnhancement(shadowRoot) {
  const input = shadowRoot.getElementById("enhancement-original-text");
  const output = shadowRoot.getElementById("enhancement-enhanced-text");
  const targetLang = shadowRoot.getElementById("enhancement-target-language")?.value || "auto";

  if (!input.value.trim()) {
    output.value = "Please enter some text.";
    return;
  }

  output.value = "Enhancing...";

  try {
    const res = await fetch("https://parallel-llm-translator.onrender.com/enhance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: input.value.trim(), language: targetLang, tier: "free" })
    });
    const data = await res.json();
    output.value = data.result || "Enhancement failed.";
  } catch (err) {
    console.error("[Enhancement Error]:", err);
    output.value = "Server error.";
  }
}

/**
 * Send explanation request and display result in textarea.
 * 선택된 텍스트 설명 요청을 보내고 결과를 textarea에 표시
 * @param {ShadowRoot} shadowRoot Popup의 Shadow DOM 루트
 */
async function performExplanation(shadowRoot) {
  // **GRAB THE CURRENT SELECTION**
  const selectedText = window.getSelection().toString().trim();
  const output = shadowRoot.getElementById("explanation-original-text");
  const langSelect = shadowRoot.getElementById("explanation-target-language");

  if (!selectedText) {
    output.value = "Please select some text to explain.";
    return;
  }

  output.value = "Explaining...";

  try {
    const res = await fetch("https://parallel-llm-translator.onrender.com/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: selectedText, language: langSelect.value || "auto", tier: "free" })
    });
    const data = await res.json();
    output.value = data.result || "Explanation failed.";
  } catch (err) {
    console.error("[Explanation Error]:", err);
    output.value = "Server error.";
  }
}

/**
 * Replace the currently selected text or active input with newText.
 */
function replaceSelectedTextInDOM(newText) {
  const activeEl = document.activeElement;
  if (!newText) return;

  if (activeEl && (activeEl.tagName === "TEXTAREA" || activeEl.tagName === "INPUT")) {
    const start = activeEl.selectionStart;
    const end   = activeEl.selectionEnd;
    activeEl.setRangeText(newText, start, end, "end");
  } else {
    const sel = window.getSelection();
    if (sel.rangeCount > 0 && sel.anchorNode.nodeType === Node.TEXT_NODE) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(newText));
    }
  }
}

// --- Popup initialization ---
export function initializePopup(shadowRoot) {
  // Restore last-used languages
  chrome.storage.local.get(
    ["translationLang", "explanationLang"],
    ({ translationLang = "auto", explanationLang = "auto" }) => {
      shadowRoot.getElementById("translation-target-language").value = translationLang;
      shadowRoot.getElementById("explanation-target-language").value = explanationLang;
    }
  );

  // Persist on change
  shadowRoot.getElementById("translation-target-language")
    .addEventListener("change", e => {
      chrome.storage.local.set({ translationLang: e.target.value });
    });
  shadowRoot.getElementById("explanation-target-language")
    .addEventListener("change", e => {
      chrome.storage.local.set({ explanationLang: e.target.value });
    });

  // Query elements
  const popupContainer  = shadowRoot.querySelector(".popup-container");
  const selectionPopup  = shadowRoot.getElementById("selection-popup");
  const functionPopups  = shadowRoot.getElementById("function-popups");
  const backButton      = shadowRoot.getElementById("back-button");
  const functionButtons = shadowRoot.querySelectorAll(".function-button");
  const explanationSec  = shadowRoot.getElementById("explanation-section");
  const translationSec  = shadowRoot.getElementById("translation-section");
  const enhancementSec  = shadowRoot.getElementById("enhancement-section");
  const closeBtn        = shadowRoot.getElementById("close-popup");

  // Prefill highlighted text for translation & enhancement
  const translationTA = shadowRoot.getElementById("translation-original-text");
  const enhancementTA = shadowRoot.getElementById("enhancement-original-text");
  const initialSelection = window.getSelection().toString();
  if (translationTA) translationTA.value = initialSelection;
  if (enhancementTA) enhancementTA.value = initialSelection;

  // Show/hide helpers
  function showSelectionPopup() {
    selectionPopup.classList.remove("hidden");
    functionPopups .classList.add("hidden");
    explanationSec .classList.add("hidden");
    translationSec .classList.add("hidden");
    enhancementSec .classList.add("hidden");
  }
  function showFunctionPopup(fn) {
    selectionPopup.classList.add("hidden");
    functionPopups .classList.remove("hidden");
    explanationSec .classList.toggle("hidden", fn !== "explanation");
    translationSec .classList.toggle("hidden", fn !== "translation");
    enhancementSec .classList.toggle("hidden", fn !== "enhancement");

    if (fn === "translation")  performTranslation(shadowRoot);
    if (fn === "enhancement")  performEnhancement(shadowRoot);
    if (fn === "explanation")  performExplanation(shadowRoot);
  }

  // Attach events
  functionButtons.forEach(btn =>
    btn.addEventListener("click", () =>
      showFunctionPopup(btn.getAttribute("data-function"))
    )
  );
  backButton?.addEventListener("click", showSelectionPopup);
  closeBtn  ?.addEventListener("click", () => (shadowRoot.host.style.display = "none"));

  // Replace buttons
  shadowRoot.querySelector("#translation-section .replace-button")
    ?.addEventListener("click", () => {
      const t = shadowRoot.getElementById("translation-translated-text").value.trim();
      replaceSelectedTextInDOM(t);
    });
  shadowRoot.querySelector("#enhancement-section .replace-button")
    ?.addEventListener("click", () => {
      const e = shadowRoot.getElementById("enhancement-enhanced-text").value.trim();
      replaceSelectedTextInDOM(e);
    });

  // Copy-to-clipboard
  shadowRoot.getElementById("translation-copy-button")?.addEventListener("click", () => {
    const txt = shadowRoot.getElementById("translation-translated-text").value.trim();
    if (txt) navigator.clipboard.writeText(txt);
  });
  shadowRoot.getElementById("explanation-copy-button")?.addEventListener("click", () => {
    const txt = shadowRoot.getElementById("explanation-original-text").value.trim();
    if (txt) navigator.clipboard.writeText(txt);
  });
  shadowRoot.getElementById("enhancement-copy-button")?.addEventListener("click", () => {
    const txt = shadowRoot.getElementById("enhancement-enhanced-text").value.trim();
    if (txt) navigator.clipboard.writeText(txt);
  });

  // Drag Functionality - 드래그 팝업
  let posX = 0, posY = 0, initialX = 0, initialY = 0, draggingStarted = false;
  popupContainer.addEventListener("mousedown", e => {
    const path = e.composedPath();
    if (!e.shiftKey && path.some(el =>
      el instanceof HTMLElement &&
      el.matches("button, input, textarea, select, .function-button, .close-btn")
    )) {
      return;
    }
    e.preventDefault();
    if (!draggingStarted) {
      const rect = popupContainer.getBoundingClientRect();
      popupContainer.style.position = "fixed";
      popupContainer.style.top  = rect.top + "px";
      popupContainer.style.left = rect.left + "px";
      popupContainer.style.bottom = "auto";
      popupContainer.style.right  = "auto";
      draggingStarted = true;
    }
    initialX = e.clientX;
    initialY = e.clientY;
    document.addEventListener("mousemove", elementDrag);
    document.addEventListener("mouseup", closeDragElement);
  });
  function elementDrag(e) {
    e.preventDefault();
    posX = initialX - e.clientX;
    posY = initialY - e.clientY;
    initialX = e.clientX;
    initialY = e.clientY;
    popupContainer.style.top  = (popupContainer.offsetTop  - posY) + "px";
    popupContainer.style.left = (popupContainer.offsetLeft - posX) + "px";
  }
  function closeDragElement() {
    document.removeEventListener("mousemove", elementDrag);
    document.removeEventListener("mouseup", closeDragElement);
  }

  // Show initial menu
  showSelectionPopup();
}
