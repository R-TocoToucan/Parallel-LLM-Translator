let popupInjected = false;

document.addEventListener("keydown", async (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === "b") {
    // Capture the highlighted text from the page
    const selectedText = window.getSelection().toString().trim();
    console.log("Selected text:", selectedText);

    let root = document.getElementById("parallel-translator-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "parallel-translator-root";
      document.body.appendChild(root);

      const shadow = root.attachShadow({ mode: "open" });

      // Load HTML for the popup
      const htmlURL = chrome.runtime.getURL("popup.html");
      const htmlText = await fetch(htmlURL).then((res) => res.text());
      const wrapper = document.createElement("div");
      wrapper.innerHTML = htmlText;
      shadow.appendChild(wrapper);

      // Load CSS
      const style = document.createElement("link");
      style.rel = "stylesheet";
      style.href = chrome.runtime.getURL("popup_style.css");
      shadow.appendChild(style);

      // Dynamically import your popup script
      const scriptURL = chrome.runtime.getURL("popup.js");
      const popupModule = await import(scriptURL);
      
      // Pass the captured selectedText into initializePopup
      popupModule.initializePopup(shadow, selectedText);
    } else {
      // If the popup already exists, toggle its display
      root.style.display = root.style.display === "none" ? "block" : "none";

      // Optional: update textareas with the new selected text if needed.
      const shadow = root.shadowRoot;
      const allTextareas = shadow.querySelectorAll(".original-textarea");
      allTextareas.forEach((ta) => {
        ta.value = selectedText;
      });
    }
  }
});
