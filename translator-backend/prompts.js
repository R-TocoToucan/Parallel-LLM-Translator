// prompts.js
export const PROMPTS = {
  // For popup/selected‐text translation
  translate: (text, targetLang) => `
Translate the following text into ${targetLang}, preserving tone and style.
Output only the translated text—no explanations or commentary.

${text}
  `,

  // For full‐page (ID‐wrapped) translation
  translate_webpage: (ids, texts, targetLang) => `
You will receive a JSON object with two arrays: "ids" (unique numeric IDs) and "texts" (the strings to translate).

Translate each element of "texts" into ${targetLang}, preserving tone, style, and natural flow.
Do NOT modify, remove, or reorder the "ids" array.

Respond with valid JSON only, exactly this format (no code fences, no extra commentary):
{
  "ids": [${ids.join(",")}],
  "outputs": [
    /* translated strings in the same order */
  ]
}

Here is the input:
${JSON.stringify({ ids, texts }, null, 2)}
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
