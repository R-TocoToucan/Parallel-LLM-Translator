// popup.js

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
  const langSelect = shadowRoot.getElementById("enhancement-target-language");

  const text = input?.value.trim();
  const targetLang = langSelect?.value || "auto";

  if (!text) {
    output.value = "Please enter some text.";
    return;
  }

  output.value = "Enhancing...";

  try {
    const res = await fetch("https://parallel-llm-translator.onrender.com/enhance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language: targetLang, tier: "free" })
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
 * @param {string} selectedText 설명할 텍스트
 */
async function performExplanation(shadowRoot, selectedText) {
  const output = shadowRoot.getElementById("explanation-original-text");
  const langSelect = shadowRoot.getElementById("explanation-target-language");

  const text = selectedText?.trim();
  const targetLang = langSelect?.value || "auto";

  if (!text) {
    output.value = "Please select text to explain.";
    return;
  }

  output.value = "Explaining...";

  try {
    const res = await fetch("https://parallel-llm-translator.onrender.com/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language: targetLang, tier: "free" })
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
 * 현재 선택된 텍스트 또는 활성화된 입력 영역을 newText로 대체
 * @param {string} newText 새 텍스트
 */
function replaceSelectedTextInDOM(newText) {
  const activeEl = document.activeElement;
  if (!newText) return;

  // If a textarea or input is active, replace its selection
  // textarea나 input이 활성화된 경우 선택 범위를 교체
  if (activeEl && (activeEl.tagName === "TEXTAREA" || activeEl.tagName === "INPUT")) {
    const start = activeEl.selectionStart;
    const end = activeEl.selectionEnd;
    activeEl.setRangeText(newText, start, end, "end");
  } else {
    // Otherwise, replace selected TextNode in document
    // 일반 문서 영역의 선택된 TextNode를 교체
    const sel = window.getSelection();
    if (sel.rangeCount > 0 && sel.anchorNode && sel.anchorNode.nodeType === Node.TEXT_NODE) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(newText));
    }
  }
}

// --- 팝업 초기화 함수 ---
// --- Popup initialization function ---
export function initializePopup(shadowRoot, selectedText = "") {
  // Query and store DOM elements
  // DOM 요소 조회 및 저장
  const popupContainer = shadowRoot.querySelector(".popup-container");
  const selectionPopup = shadowRoot.getElementById("selection-popup");
  const functionPopups = shadowRoot.getElementById("function-popups");
  const backButton = shadowRoot.getElementById("back-button");
  const functionButtons = shadowRoot.querySelectorAll(".function-button");
  const explanationSection = shadowRoot.getElementById("explanation-section");
  const translationSection = shadowRoot.getElementById("translation-section");
  const enhancementSection = shadowRoot.getElementById("enhancement-section");
  const closeBtn = shadowRoot.getElementById("close-popup");

  // Fill highlighted text into original textarea
  // 하이라이트된 텍스트를 textarea에 기본 값으로 설정
  const translationTextarea = shadowRoot.getElementById("translation-original-text");
  const enhancementTextarea = shadowRoot.getElementById("enhancement-original-text");
  if (translationTextarea) translationTextarea.value = selectedText;
  if (enhancementTextarea) enhancementTextarea.value = selectedText;

  /**
   * Show the initial selection popup
   * 초기 선택 팝업(메뉴) 보이기
   */
  function showSelectionPopup() {
    console.log("Showing selection popup");
    selectionPopup.classList.remove("hidden");
    functionPopups.classList.add("hidden");
    explanationSection.classList.add("hidden");
    translationSection.classList.add("hidden");
    enhancementSection.classList.add("hidden");
  }

  /**
   * Show the specific function popup (translation/explanation/enhancement)
   * 기능별 팝업 보이기
   * @param {string} functionName "translation" | "explanation" | "enhancement"
   */
  function showFunctionPopup(functionName) {
    console.log("Showing function popup for:", functionName);
    selectionPopup.classList.add("hidden");
    functionPopups.classList.remove("hidden");
    explanationSection.classList.toggle("hidden", functionName !== "explanation");
    translationSection.classList.toggle("hidden", functionName !== "translation");
    enhancementSection.classList.toggle("hidden", functionName !== "enhancement");

    if (functionName === "translation") performTranslation(shadowRoot);
    if (functionName === "enhancement") performEnhancement(shadowRoot);
    if (functionName === "explanation") performExplanation(shadowRoot, selectedText);
  }

  // Attach click events to function buttons
  // 기능 버튼 클릭 이벤트 연결
  functionButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const fn = btn.getAttribute("data-function");
      console.log("Function button clicked:", fn);
      showFunctionPopup(fn);
    });
  });

  // Close button hides the popup
  // 닫기 버튼 클릭 시 팝업 숨김
  closeBtn?.addEventListener("click", () => {
    console.log("Close button clicked - hiding popup");
    shadowRoot.host.style.display = "none";
  });

  // Popup drag functionality
  // 팝업 드래그 기능 구현
  let posX = 0, posY = 0, initialX = 0, initialY = 0;
  let draggingStarted = false;
  popupContainer.addEventListener("mousedown", e => {
    console.log("mousedown on draggable", e);
    if (!e.shiftKey) {
      const path = e.composedPath();
      if (path.some(el =>
        el instanceof HTMLElement &&
        el.matches &&
        el.matches("button, input, textarea, select, .function-button, .close-btn")
      )) {
        console.log("Interactive element detected; skipping drag.");
        return;
      }
    } else {
      console.log("Shift key pressed, forcing drag.");
    }

    e.preventDefault();
    if (!draggingStarted) {
      const rect = popupContainer.getBoundingClientRect();
      popupContainer.style.top = rect.top + "px";
      popupContainer.style.left = rect.left + "px";
      popupContainer.style.bottom = "auto";
      popupContainer.style.right = "auto";
      popupContainer.style.position = "fixed";
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
    popupContainer.style.top = (popupContainer.offsetTop - posY) + "px";
    popupContainer.style.left = (popupContainer.offsetLeft - posX) + "px";
  }
  function closeDragElement() {
    document.removeEventListener("mousemove", elementDrag);
    document.removeEventListener("mouseup", closeDragElement);
  }

  // Replace Buttons for translation and enhancement
  // 번역/개선 영역 교체 버튼 이벤트
  const translateBtn = shadowRoot.querySelector("#translation-section .replace-button");
  translateBtn?.addEventListener("click", () => {
    const translatedText = shadowRoot.getElementById("translation-translated-text").value.trim();
    replaceSelectedTextInDOM(translatedText);
  });
  const enhancementReplaceBtn = shadowRoot.querySelector("#enhancement-section .replace-button");
  enhancementReplaceBtn?.addEventListener("click", () => {
    const enhancedText = shadowRoot.getElementById("enhancement-enhanced-text").value.trim();
    replaceSelectedTextInDOM(enhancedText);
  });

  // Back button returns to initial selection popup
  // 뒤로 가기 버튼: 초기 메뉴로 복귀
  backButton?.addEventListener("click", () => {
    console.log("Back button clicked. Showing selection popup.");
    showSelectionPopup();
  });

  // Clipboard copy buttons
  // 클립보드 복사 버튼 로직
  const translationCopyButton = shadowRoot.getElementById('translation-copy-button');
  const translationOutput = shadowRoot.getElementById('translation-translated-text');
  if (translationCopyButton && translationOutput) {
    translationCopyButton.addEventListener('click', () => {
      const textToCopy = translationOutput.value.trim();
      if (textToCopy) {
        navigator.clipboard.writeText(textToCopy)
          .then(() => {
            const original = translationCopyButton.textContent;
            translationCopyButton.textContent = '복사 완료!';
            setTimeout(() => translationCopyButton.textContent = original, 1500);
          })
          .catch(err => {
            console.error('Clipboard copy failed:', err);
            alert('클립보드 복사에 실패했습니다.');
          });
      }
    });
  }
  const enhancementCopyButton = shadowRoot.getElementById('enhancement-copy-button');
  const enhancementOutput = shadowRoot.getElementById('enhancement-enhanced-text');
  if (enhancementCopyButton && enhancementOutput) {
    enhancementCopyButton.addEventListener('click', () => {
      const textToCopy = enhancementOutput.value.trim();
      if (textToCopy) {
        navigator.clipboard.writeText(textToCopy)
          .then(() => {
            const original = enhancementCopyButton.textContent;
            enhancementCopyButton.textContent = '복사 완료!';
            setTimeout(() => enhancementCopyButton.textContent = original, 1500);
          })
          .catch(err => {
            console.error('Clipboard copy failed:', err);
            alert('클립보드 복사에 실패했습니다.');
          });
      }
    });
  }

  // Show initial selection popup on load
  // 초기 화면 표시
  showSelectionPopup();
}
