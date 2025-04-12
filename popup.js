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

  // Get the selected text 하이라이트된 텍스트로 채우기
  const translationTextarea = shadowRoot.getElementById("translation-original-text");
  const enhancementTextarea = shadowRoot.getElementById("enhancement-original-text");

  if (translationTextarea) {
    translationTextarea.value = selectedText;
  }
  if (enhancementTextarea) {
    enhancementTextarea.value = selectedText;
  }

  function showSelectionPopup() {
    console.log("Showing selection popup");
    selectionPopup.classList.remove("hidden");
    functionPopups.classList.add("hidden");
    explanationSection.classList.add("hidden");
    translationSection.classList.add("hidden");
    enhancementSection.classList.add("hidden");
  }

  function showFunctionPopup(functionName) {
    console.log("Showing function popup for:", functionName);
    selectionPopup.classList.add("hidden");
    functionPopups.classList.remove("hidden");
    explanationSection.classList.toggle("hidden", functionName !== "explanation");
    translationSection.classList.toggle("hidden", functionName !== "translation");
    enhancementSection.classList.toggle("hidden", functionName !== "enhancement");
  }

  functionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const fn = btn.getAttribute("data-function");
      console.log("Function button clicked:", fn);
      showFunctionPopup(fn);
    });
  });

  // Event Listeners

  closeBtn?.addEventListener("click", () => {
    console.log("Close button clicked - hiding popup");
    shadowRoot.host.style.display = "none"; // 팝업 제거
  });

  // Drag Functionality Implementation 드래그 기능
  let posX = 0, posY = 0, initialX = 0, initialY = 0;
  let draggingStarted = false;

  // Use the popup container as the draggable element.
  popupContainer.addEventListener("mousedown", function(e) {
    console.log("mousedown on draggable", e);
    // If Shift is not pressed, check if an interactive element was clicked.
    if (!e.shiftKey) {
      const path = e.composedPath();
      console.log("composedPath:", path);
      if (
        path.some(
          (el) =>
            el instanceof HTMLElement &&
            el.matches &&
            el.matches("button, input, textarea, select, .function-button, .close-btn")
        )
      ) {
        console.log("Interactive element detected; skipping drag.");
        return;
      }
    } else {
      console.log("Shift key pressed, forcing drag.");
    }
    
    e.preventDefault();
    
    // On the first drag, set explicit top/left based on the current position.
    if (!draggingStarted) {
      const rect = popupContainer.getBoundingClientRect();
      popupContainer.style.top = rect.top + "px";
      popupContainer.style.left = rect.left + "px";
      popupContainer.style.bottom = "auto";
      popupContainer.style.right = "auto";
      // Set fixed positioning to enable dynamic top/left updates.
      popupContainer.style.position = "fixed";
      draggingStarted = true;
      console.log("Drag started. Initial position set to:", rect.top, rect.left);
    }
    
    initialX = e.clientX;
    initialY = e.clientY;
    console.log("Drag initiated at client coordinates:", initialX, initialY);
    
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
    console.log("Dragging... New position:", popupContainer.style.top, popupContainer.style.left);
  }

  function closeDragElement() {
    console.log("mouseup detected - ending drag");
    document.removeEventListener("mousemove", elementDrag);
    document.removeEventListener("mouseup", closeDragElement);
  }

  /*
  //..Enter as click In progress. 엔터키로 해당 요소 “클릭”처럼 동작하게 하기
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && document.activeElement) {
      const active = document.activeElement;
      
      // 커스텀 버튼이면서 클릭 가능한 경우
      if (active.classList.contains('dropdown-btn')) {
        active.click(); // 드롭다운 열기
      } else if (active.classList.contains('dropdown-item')) {
        active.click(); // 아이템 선택
      } else if (active.classList.contains('tabButton')) {
        active.click(); // 탭 전환
      } else if (active.tagName === 'BUTTON') {
        active.click(); // 일반 버튼
      }
    }
  });
  */

  backButton?.addEventListener("click", () => {
    console.log("Back button clicked. Showing selection popup.");
    showSelectionPopup();
  });

  showSelectionPopup();
}
