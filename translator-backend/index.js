import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENAI_API_KEY;

app.use(cors());
app.use(express.json());

app.post('/translate', async (req, res) => {
    const { text, sourceLang, targetLang, model, tier = 'free' } = req.body;
  
    const selectedModel = tier === 'pro' ? 'gpt-4' : 'gpt-3.5-turbo';

    if (!text || !sourceLang || !targetLang) {
      return res.status(400).json({ error: 'Missing input fields.' });
    }

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            {
              role: "system",
              content: `You are a professional translator. Translate from ${sourceLang} to ${targetLang}. Return only the translated text.`
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
      const translated = data.choices?.[0]?.message?.content?.trim();
      res.json({ translation: translated || "Translation failed." });
  
    } catch (error) {
      console.error("Translation error:", error);
      res.status(500).json({ error: 'Translation failed.' });
    }
  });
  

app.listen(PORT, () => {
  console.log(`🟢 Translator backend is running on http://localhost:${PORT}`);
});
