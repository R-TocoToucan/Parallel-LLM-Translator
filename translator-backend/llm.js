import fetch from "node-fetch";
const API_KEY = process.env.OPENAI_API_KEY;

export async function callLLM({ system, user, model = "gpt-3.5-turbo" }) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      temperature: 0.3
    })
  });

  const data = await res.json();
  const result = data.choices?.[0]?.message?.content?.trim();
  return result || null;
}
