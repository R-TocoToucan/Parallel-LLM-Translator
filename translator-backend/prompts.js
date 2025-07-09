// prompts.js  – full file with glossary support

/* ──────────────────────────────────────────────────────────────
 *  System prompt
 * ────────────────────────────────────────────────────────────── */
export const SYSTEM_MESSAGE = `
You are a professional translator. Follow instructions exactly and output only the requested content.
`.trim();

/* ──────────────────────────────────────────────────────────────
 *  Helper – insert a precise glossary section when needed
 * ────────────────────────────────────────────────────────────── */
function glossaryBlock(glossary) {
  if (!Array.isArray(glossary) || !glossary.length) return '';

  const lines = glossary
    .map(({ term, replacement }) => `  • ${term} → ${replacement}`)
    .join('\n');

  return `
─────────────────────  GLOSSARY  ─────────────────────
For every occurrence of each SOURCE term in the input
(text or phrase, case-insensitive, ignore surrounding punctuation)
replace it **exactly** with the corresponding TARGET term
in your output. Do NOT invent new replacements.

${lines}
──────────────────────────────────────────────────────
`;
}

/* ──────────────────────────────────────────────────────────────
 *  Prompt builders
 * ────────────────────────────────────────────────────────────── */
export const PROMPTS = {
  /* 1) Translate selected text (popup) */
  translate: (text, targetLang, glossary = []) => `
Translate the text into ${targetLang}, preserving tone and style.
${glossaryBlock(glossary)}
Return **only** the translated text – no commentary.

${text}
  `.trim(),

  // For full-page (ID-wrapped) translation
translate_webpage: (ids, texts, targetLang) => `
  You will receive exactly this JSON as input (do not change it):
  
  ${JSON.stringify({ ids, texts }, null, 2)}
  
  Translate each element of "texts" into ${targetLang}, preserving tone and style.
  Then respond *only* with a JSON object in this exact shape (no code fences, no comments, no extra keys, no explanation):
  
  {
    "ids": [${ids.join(",")}],
    "outputs": [
      /* exactly ${ids.length} translated strings in the same order */
    ]
  }
  `,

  explain_phrase: (text, lang) => `
Explain the meaning and usage of the following phrase for a language learner:
– Give a simple definition  
– Provide one usage note if needed  
– Give one or two example sentences  
Output only the explanation in ${lang}, no extra formatting.

${text}
  `,

  enhance_text: (text) => `
Improve the following text by correcting grammar, refining word choice, and enhancing clarity and fluency.
Return only the improved version, without explanations or formatting.

${text}
  `,

  summarize_webpage: (text, lang) => `
Summarize the main content of the following webpage in ${lang}.
Focus on the article or post and key replies; ignore HTML, ads, navigation, and unrelated content.
Output a clear, concise summary without extra formatting.

${text}
  `,
};
