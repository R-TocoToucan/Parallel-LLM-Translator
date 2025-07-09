// background.js  – MV3 service-worker (module)

// ──────────────────────────────────────────
//  Imports (runs only in background context)
// ──────────────────────────────────────────
import { initUserCache } from './userService.js';   // client-side module

/* flag so we don’t fetch /api/user/me more than once per sign-in */
let cacheReady = false;

// ──────────────────────────────────────────
//  Context-menu to translate selected text
// ──────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id      : 'parallel-translate',
    title   : 'Translate with Parallel Translator',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'parallel-translate' &&
      tab.id && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      type        : 'parallel-translate-context',
      selectedText: info.selectionText
    });
  }
});

// ──────────────────────────────────────────
//  Dictionary side-panel on demand
// ──────────────────────────────────────────
chrome.runtime.onMessage.addListener(msg => {
  if (msg.action === 'openDictionaryPanel') {
    console.log('BG received openDictionaryPanel for tab', msg.tabId);
    chrome.sidePanel.setOptions(
      { tabId: msg.tabId, path: 'dictionary.html', enabled: true },
      () => chrome.sidePanel.open({ tabId: msg.tabId })
    );
  }

  // ───────── AUTH_SUCCESS → warm user cache once
  if (msg.type === 'AUTH_SUCCESS' && !cacheReady) {
    initUserCache()
      .then(() => {
        cacheReady = true;
        /* broadcast to all extension pages */
        chrome.runtime.sendMessage({ type: 'CACHE_READY' });
      })
      .catch(err => console.error('initUserCache failed', err));
  }
});
