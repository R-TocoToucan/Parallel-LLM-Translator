
const pageSessions = new Map();

function uuid() {
  return crypto.randomUUID();
}

function log(...args) {
  const el = document.getElementById("log");
  el.textContent += args.join(" ") + "\n";
}

function getOrCreatePageSession(url) {
  if (pageSessions.has(url)) return pageSessions.get(url);
  const newSession = {
    id: uuid(),
    messages: [],
    createdAt: Date.now()
  };
  pageSessions.set(url, newSession);
  return newSession;
}

function createNewPopupSession() {
  return {
    id: uuid(),
    messages: [],
    createdAt: Date.now()
  };
}

async function callOpenAI(apiKey, session) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: session.messages
    })
  });

  if (!res.ok) {
    const err = await res.text();
    log("[❌ API Error]:", err);
    return;
  }

  const data = await res.json();
  const reply = data.choices[0].message;
  session.messages.push(reply);
  log("[✅ Assistant]:", reply.content);
  log("[Session ID]:", session.id);
  log("[Message Count]:", session.messages.length);
  log("------");
}

function sendPageRequest() {
  const apiKey = document.getElementById("apiKey").value;
  const pageUrl = document.getElementById("pageUrl").value;
  const msg = document.getElementById("userMessage").value;
  const session = getOrCreatePageSession(pageUrl);
  session.messages.push({ role: "user", content: msg });
  callOpenAI(apiKey, session);
}

function sendNewPageRequest() {
  const apiKey = document.getElementById("apiKey").value;
  const pageUrl = document.getElementById("pageUrl").value + "?new=" + uuid();
  const msg = document.getElementById("userMessage").value;
  const session = getOrCreatePageSession(pageUrl);
  session.messages.push({ role: "user", content: msg });
  callOpenAI(apiKey, session);
}

function sendPopupRequest() {
  const apiKey = document.getElementById("apiKey").value;
  const msg = document.getElementById("userMessage").value;
  const session = createNewPopupSession();
  session.messages.push({ role: "user", content: msg });
  callOpenAI(apiKey, session);
}
