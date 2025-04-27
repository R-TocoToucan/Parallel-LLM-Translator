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

function replaceSelectedTextInDOM(newText) {
  const activeEl = document.activeElement;
  if (!newText) return;

  if (activeEl && (activeEl.tagName === "TEXTAREA" || activeEl.tagName === "INPUT")) {
    const start = activeEl.selectionStart;
    const end = activeEl.selectionEnd;
    activeEl.setRangeText(newText, start, end, "end");
  } else {
    const sel = window.getSelection();
    if (sel.rangeCount > 0 && sel.anchorNode && sel.anchorNode.nodeType === Node.TEXT_NODE) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(newText));
    }
  }
}

// --- 팝업 초기화 함수 ---

export function initializePopup(shadowRoot, selectedText = "") {
  // Query and store DOM elements
  const popupContainer = shadowRoot.querySelector(".popup-container");
  const selectionPopup = shadowRoot.getElementById("selection-popup");
  const functionPopups = shadowRoot.getElementById("function-popups");
  const backButton = shadowRoot.getElementById("back-button");
  const functionButtons = shadowRoot.querySelectorAll(".function-button");
  const explanationSection = shadowRoot.getElementById("explanation-section");
  const translationSection = shadowRoot.getElementById("translation-section");
  const enhancementSection = shadowRoot.getElementById("enhancement-section");
  const closeBtn = shadowRoot.getElementById("close-popup");

  // 하이라이트된 텍스트로 기본 채우기
  const translationTextarea = shadowRoot.getElementById("translation-original-text");
  const enhancementTextarea = shadowRoot.getElementById("enhancement-original-text");

  if (translationTextarea) {
    translationTextarea.value = selectedText;
  }
  if (enhancementTextarea) {
    enhancementTextarea.value = selectedText;
  }

  // Selection popup 보여주기
  function showSelectionPopup() {
    console.log("Showing selection popup");
    selectionPopup.classList.remove("hidden");
    functionPopups.classList.add("hidden");
    explanationSection.classList.add("hidden");
    translationSection.classList.add("hidden");
    enhancementSection.classList.add("hidden");
  }

  // 기능별 popup 보여주기
  function showFunctionPopup(functionName) {
    console.log("Showing function popup for:", functionName);
    selectionPopup.classList.add("hidden");
    functionPopups.classList.remove("hidden");
    explanationSection.classList.toggle("hidden", functionName !== "explanation");
    translationSection.classList.toggle("hidden", functionName !== "translation");
    enhancementSection.classList.toggle("hidden", functionName !== "enhancement");

    if (functionName === "translation") {
      performTranslation(shadowRoot);
    }
    if (functionName === "enhancement") {
      performEnhancement(shadowRoot);
    }
    if (functionName === "explanation") {
      performExplanation(shadowRoot, selectedText);
    }
  }

  // 버튼 클릭 이벤트 연결
  functionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const fn = btn.getAttribute("data-function");
      console.log("Function button clicked:", fn);
      showFunctionPopup(fn);
    });
  });

  // 팝업 닫기 버튼
  closeBtn?.addEventListener("click", () => {
    console.log("Close button clicked - hiding popup");
    shadowRoot.host.style.display = "none"; // 팝업 제거
  });

  // Popup drag 드래그 기능
  let posX = 0, posY = 0, initialX = 0, initialY = 0;
  let draggingStarted = false;

  popupContainer.addEventListener("mousedown", function (e) {
    console.log("mousedown on draggable", e);
    if (!e.shiftKey) {
      const path = e.composedPath();
      if (path.some(
        (el) => el instanceof HTMLElement && el.matches &&
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

  // Replace Button Actions

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

  // Back button
  backButton?.addEventListener("click", () => {
    console.log("Back button clicked. Showing selection popup.");
    showSelectionPopup();
  });

  // --- 클립보드 복사 버튼 로직 추가 ---

  const translationCopyButton = shadowRoot.getElementById('translation-copy-button');
  const translationOutput = shadowRoot.getElementById('translation-translated-text');

  if (translationCopyButton && translationOutput) {
    translationCopyButton.addEventListener('click', () => {
      const textToCopy = translationOutput.value.trim();
      if (textToCopy) {
        navigator.clipboard.writeText(textToCopy)
          .then(() => {
            const originalText = translationCopyButton.textContent;
            translationCopyButton.textContent = '복사 완료!';
            setTimeout(() => {
              translationCopyButton.textContent = originalText;
            }, 1500);
          })
          .catch(err => {
            console.error('클립보드 복사 실패:', err);
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
            const originalText = enhancementCopyButton.textContent;
            enhancementCopyButton.textContent = '복사 완료!';
            setTimeout(() => {
              enhancementCopyButton.textContent = originalText;
            }, 1500);
          })
          .catch(err => {
            console.error('클립보드 복사 실패:', err);
            alert('클립보드 복사에 실패했습니다.');
          });
      }
    });
  }

  // 초기 화면 표시
  showSelectionPopup();
}
