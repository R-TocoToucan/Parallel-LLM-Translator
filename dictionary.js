// dictionary.js

document.addEventListener('DOMContentLoaded', () => {
  const dictContainer = document.getElementById('dict-container');
  const addBtn        = document.getElementById('add-entry-btn');
  const closeBtn      = document.getElementById('close-dict');

  // Close side panel or popup
  closeBtn.addEventListener('click', () => {
    if (chrome.sidePanel) {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        const tabId = tabs[0]?.id;
        if (tabId) {
          chrome.sidePanel.setOptions({ tabId, enabled: false });
        } else {
          window.close();
        }
      });
    } else {
      window.close();
    }
  });

  // Load existing dictionary entries
  chrome.storage.local.get(['dictionary'], data => {
    (data.dictionary || []).forEach(({ term, replacement }) =>
      addRow(term, replacement)
    );
  });

  // Add blank entry on click
  addBtn.addEventListener('click', () => addRow('', ''));

  // Create one editable row
  function addRow(term, replacement) {
    const row = document.createElement('div');
    row.className = 'dict-row';

    const t = document.createElement('input');
    t.placeholder = 'Term';
    t.value       = term;

    const arrow = document.createElement('span');
    arrow.textContent = '→';

    const r = document.createElement('input');
    r.placeholder = 'Replacement';
    r.value       = replacement;

    const rem = document.createElement('button');
    rem.textContent = '✕';
    rem.className   = 'remove-btn';
    rem.addEventListener('click', () => {
      row.remove();
      saveAll();
    });

    [t, r].forEach(i => i.addEventListener('change', saveAll));

    row.append(t, arrow, r, rem);
    dictContainer.append(row);
  }

  // Save entire dictionary back to storage
  function saveAll() {
    const entries = Array.from(
      document.querySelectorAll('.dict-row')
    ).map(r => {
      const [t, rIn] = r.querySelectorAll('input');
      return { term: t.value, replacement: rIn.value };
    });
    chrome.storage.local.set({ dictionary: entries });
  }
});
