chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: "parallel-translate",
      title: "Translate with Parallel Translator",
      contexts: ["selection"]
    });
  });
  
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "parallel-translate" && tab.id && info.selectionText) {
      chrome.tabs.sendMessage(tab.id, {
        type: "parallel-translate-context",
        selectedText: info.selectionText
      });
    }
  });
  