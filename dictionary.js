// dictionary.js
document.addEventListener('DOMContentLoaded', () => {
  const dictContainer = document.getElementById('dict-container');
  const addBtn  = document.getElementById('add-entry-btn');
  const backBtn = document.getElementById('back-btn');


  /* ── Back to Settings ─────────────────────────────────── */
  backBtn.addEventListener('click', () => {
    window.location.href = chrome.runtime.getURL('settings.html');
  });

  /* ── Load existing entries ────────────────────────────── */
  chrome.storage.local.get(['dictionary'], data => {
    (data.dictionary || []).forEach(({ term, replacement }) =>
      addRow(term, replacement)
    );
  });

  addBtn.addEventListener('click', () => addRow('', ''));

  /* ── Build one row ────────────────────────────────────── */
  function addRow(term, replacement) {
    const row   = document.createElement('div');
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
    rem.textContent = '×';
    rem.className   = 'remove-btn';
    rem.addEventListener('click', () => {
      row.remove();
      saveAll();
    });

    [t, r].forEach(i => i.addEventListener('change', saveAll));

    row.append(t, arrow, r, rem);
    dictContainer.append(row);
  }

  /* ── Save entire dictionary ───────────────────────────── */
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
