// translate.js
export async function translate(text, sourceLang, targetLang, apiKey, model = "gpt-3.5-turbo") {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `You are a highly skilled AI trained in language translation. Your job is to translate from ${sourceLang} to ${targetLang}. Only return the translated text — no extra notes, formatting or quotes.`
        },
        {
          role: "user",
          content: text 
        }
      ],
      temperature: 0.3
    })
  });

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "Translation failed.";
}
