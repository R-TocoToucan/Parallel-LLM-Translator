let popupVisible = false;
let outsideClickListener = null;

/* ────────── glossary helpers ────────── */
// Build the key that identifies one glossary, e.g. "English→Korean"
function pairKey(src, tgt) {
  return `${src.trim()}→${tgt.trim()}`;
}
// Keep only the glossary rows that occur in this batch of text
function filterGlossary(textArray, glossary) {
  const haystack = textArray.join('\n').toLowerCase();
  return glossary.filter(({ term }) =>
    term && haystack.includes(term.toLowerCase()));
}

/* ────────── popup helpers ────────── */
function getSelectedTextAndCoords() {
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();
  let coords = null;
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      coords = { top: rect.top + window.scrollY + 20, left: rect.left + window.scrollX };
    }
  }
  return { selectedText, coords };
}
function createPopupRoot(coords) {
  const root = document.createElement('div');
  root.id = 'parallel-translator-root';
  if (coords) {
    Object.assign(root.style, { position: 'absolute', top: coords.top + 'px', left: coords.left + 'px' });
  } else {
    Object.assign(root.style, { position: 'fixed', bottom: '20px', right: '20px' });
  }
  root.style.zIndex = '999999';
  document.body.appendChild(root);
  return root.attachShadow({ mode: 'open' });
}
function movePopupTo(root, coords) {
  if (coords) {
    Object.assign(root.style, { position: 'absolute', top: coords.top + 'px', left: coords.left + 'px', bottom: '', right: '' });
  } else {
    Object.assign(root.style, { position: 'fixed', top: '', left: '', bottom: '20px', right: '20px' });
  }
}
function enableOutsideClickToClose(root) {
  outsideClickListener = e => {
    if (!root || !root.contains(e.target)) {
      root.style.display = 'none';
      popupVisible = false;
      document.removeEventListener('mousedown', outsideClickListener);
      outsideClickListener = null;
    }
  };
  document.addEventListener('mousedown', outsideClickListener);
}
async function loadPopupContent(shadow, selectedText) {
  const html = await fetch(chrome.runtime.getURL('popup.html')).then(r => r.text());
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  shadow.appendChild(wrap);

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('popup_style.css');
  shadow.appendChild(link);

  const { initializePopup } = await import(chrome.runtime.getURL('popup.js'));
  initializePopup(shadow, selectedText);
}
function updatePopupText(shadow, selectedText) {
  shadow.querySelectorAll('.original-textarea').forEach(ta => (ta.value = selectedText));
}
async function openTranslatorPopup(selectedText, coords) {
  let root = document.getElementById('parallel-translator-root');
  if (!root) {
    const shadow = createPopupRoot(coords);
    await loadPopupContent(shadow, selectedText);
    popupVisible = true;
  } else {
    const shadow = root.shadowRoot;
    if (popupVisible) {
      root.style.display = 'none';
      popupVisible = false;
    } else {
      movePopupTo(root, coords);
      shadow.getElementById('selection-popup')?.classList.remove('hidden');
      ['function-popups', 'explanation-section', 'translation-section', 'enhancement-section']
        .forEach(id => shadow.getElementById(id)?.classList.add('hidden'));
      root.style.display = 'block';
      popupVisible = true;
      updatePopupText(shadow, selectedText);
    }
  }
  if (popupVisible) enableOutsideClickToClose(root);
}

/* ────────── page-translation helpers ────────── */
function revertPageTranslation() {
  document.querySelectorAll('[data-translated="true"]').forEach(el => {
    const orig = el.dataset.originalText;
    if (!orig) return;
    if (el.classList.contains('translated-dual')) {
      el.replaceWith(document.createTextNode(orig));
    } else if (el.firstChild?.nodeType === Node.TEXT_NODE) {
      el.firstChild.nodeValue = orig;
      delete el.dataset.translated;
      delete el.dataset.originalText;
    }
  });
}

let observerTimeout = null;
const observer = new MutationObserver(() => {
  if (observerTimeout) clearTimeout(observerTimeout);
  observerTimeout = setTimeout(() => {
    chrome.storage.local.get(['targetLang', 'displayMode'], d =>
      translateIncremental(d.targetLang || 'en', d.displayMode || 'replace'));
  }, 1000);
});

/* ────────── full page translate ────────── */
async function translatePage(targetLang = 'auto', mode = 'replace') {
  observer.disconnect();
  revertPageTranslation();
  const texts = [], nodes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: n => {
      const txt = n.nodeValue.trim();
      if (!txt || /^[\d]+$/.test(txt)) return NodeFilter.FILTER_REJECT;
      const p = n.parentNode;
      if (!p ||
          ['SCRIPT','STYLE','TEXTAREA','INPUT','BUTTON'].includes(p.nodeName) ||
          p.isContentEditable ||
          getComputedStyle(p).display === 'none' ||
          getComputedStyle(p).visibility === 'hidden' ||
          p.closest('[data-translated="true"], .parallel-translator-text-wrapper'))
        return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  for (let n; (n = walker.nextNode()); ) { texts.push(n.nodeValue); nodes.push(n); }
  if (!nodes.length) { observer.observe(document.body, { childList:true, subtree:true }); return; }

  const BATCH = 10, batches = [];
  for (let i = 0; i < texts.length; i += BATCH)
    batches.push({ texts: texts.slice(i,i+BATCH), nodes: nodes.slice(i,i+BATCH) });

  try { await Promise.all(batches.map(b => translateBatch(b, targetLang, mode))); }
  catch (e) { console.error('translatePage error', e); }
  finally { observer.observe(document.body, { childList:true, subtree:true }); }
}

/* ────────── incremental translate ────────── */
async function translateIncremental(targetLang='auto', mode='replace') {
  const newNodes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: n => {
      if (!n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (n.parentNode.closest('[data-translated="true"], .parallel-translator-text-wrapper'))
        return NodeFilter.FILTER_REJECT;
      const p = n.parentNode;
      if (!p || p.isContentEditable) return NodeFilter.FILTER_REJECT;
      const s = getComputedStyle(p);
      if (s.display === 'none' || s.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  for (let n; (n = walker.nextNode()); ) newNodes.push(n);
  if (!newNodes.length) return;

  const texts = newNodes.map(n => n.nodeValue);
  const BATCH = 10, batches = [];
  for (let i = 0; i < texts.length; i += BATCH)
    batches.push({ texts: texts.slice(i,i+BATCH), nodes: newNodes.slice(i,i+BATCH) });
  try { await Promise.all(batches.map(b => translateBatch(b, targetLang, mode))); }
  catch (e) { console.error('incremental translation error', e); }
}

/* ────────── translateBatch – first part modified ────────── */
async function translateBatch({ texts: batchTexts, nodes: batchNodes }, targetLang, mode) {

  /* load user-chosen model + glossary */
  const { sourceLang = 'Auto Detect', translationModel = 'gpt-3.5-turbo' } =
        await chrome.storage.local.get(['sourceLang','translationModel']);
  const gKey = pairKey(sourceLang, targetLang);
  const { [gKey]: fullGlossary = [] } = await chrome.storage.local.get([gKey]);
  const glossary = filterGlossary(batchTexts, fullGlossary);

  /* build payload */
  const ids = batchNodes.map((_, i) => i);
  const payload = { ids,
                    texts   : batchTexts,
                    language: targetLang,
                    model   : translationModel,
                    glossary };

  let json;
  try {
    const res = await fetch('https://parallel-llm-translator.onrender.com/translate_webpage', {
      method : 'POST',
      headers: { 'Content-Type':'application/json' },
      body   : JSON.stringify(payload)
    });
    if (!res.ok) {
      console.error('translateBatch HTTP', res.status, await res.text());
      throw new Error(`HTTP ${res.status}`);
    }
    json = await res.json();
  } catch (err) {
    console.error('translateBatch fetch error', err);
    batchNodes.forEach((n,i)=>injectTranslation(n, batchTexts[i], mode));
    return;
  }

  const raw = json.outputs ?? json.translations ?? [];
  const map = new Map();
  raw.forEach((e,i) => {
    const t = typeof e === 'string'
      ? e.trim()
      : (e?.text || e?.translatedText || e?.translation || '').trim();
    if (t) map.set(i, t);
  });

  batchTexts.forEach((orig, idx) => {
    const txt = map.get(idx) || orig;
    injectTranslation(batchNodes[idx], txt, mode);
  });
}

/* ────────── injectTranslation ────────── */
function injectTranslation(node, text, mode) {
  const parent = node.parentNode;
  if (!parent) return;

  if (mode === 'dual') {
    const wrapper = document.createElement('span');
    wrapper.className = 'translated-dual';
    wrapper.dataset.originalText = node.nodeValue;
    wrapper.dataset.translated   = 'true';

    const orig = document.createElement('span');
    orig.className = 'original-text';
    orig.textContent = node.nodeValue;

    const trans = document.createElement('span');
    trans.className = 'translated-text';
    trans.textContent = text;

    wrapper.append(orig, document.createElement('br'), trans);
    parent.replaceChild(wrapper, node);
  } else {
    parent.dataset.originalText = node.nodeValue;
    parent.dataset.translated   = 'true';
    node.nodeValue = text;
  }
}

/* ────────── keybindings & messages ────────── */
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'b') {
    const { selectedText, coords } = getSelectedTextAndCoords();
    openTranslatorPopup(selectedText, coords);
  }
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z') {
    revertPageTranslation();
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'parallel-translate-context') {
    const sel = window.getSelection();
    const range = sel.rangeCount ? sel.getRangeAt(0) : null;
    let coords = null;
    if (range) {
      const rect = range.getBoundingClientRect();
      if (rect.width && rect.height)
        coords = { top: rect.top + scrollY + 20, left: rect.left + scrollX };
    }
    openTranslatorPopup(msg.selectedText, coords);
  }
  if (msg.type === 'translatePage') {
    translatePage(msg.targetLang, msg.mode);
    sendResponse({ status: 'started' });
  }
});
