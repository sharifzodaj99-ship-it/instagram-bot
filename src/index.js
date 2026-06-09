const express = require("express");
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());

// ===== ТАНЗИМОТ (Config) =====
const CONFIG = {
  VERIFY_TOKEN: process.env.VERIFY_TOKEN || "my_secret_token_123",
  PAGE_ACCESS_TOKEN: process.env.PAGE_ACCESS_TOKEN || "",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
};

// ===== GEMINI AI ТАНЗИМ =====
const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// ===== СИСТЕМА ПРОМПТ (Тоҷикӣ + Русӣ) =====
const SYSTEM_PROMPT = `Ты — умный помощник магазина телефонов и аксессуаров. 
Ты отвечаешь на вопросы клиентов на таджикском и русском языках.

Правила:
1. Если клиент пишет на таджикском — отвечай на таджикском
2. Если клиент пишет на русском — отвечай на русском
3. Будь вежливым, дружелюбным и кратким
4. Помогай с вопросами о телефонах, ценах, доставке, гарантии
5. Если не знаешь точный ответ — скажи что соединишь с менеджером

Магазин продаёт: смартфоны (iPhone, Samsung, Xiaomi, Redmi), аксессуары (чехлы, защитные стёкла, зарядки, наушники).

Часто задаваемые вопросы (FAQ):
- Доставка: по городу бесплатно от 200 сомони, в регионы через СДЭК
- Гарантия: на все телефоны 1 год официальная гарантия
- Оплата: наличными, Алиф, Корти Милли, перевод
- Время работы: 9:00 - 20:00 каждый день
- Возврат: в течение 14 дней при сохранении упаковки

Агар мизоҷ тоҷикӣ навишта бошад:
Фурӯшгоҳи мо телефонҳои нав мефурӯшад. 
Кӯмак, гарантия ва нарх дорем.`;

// ===== ТАРИХИ СӮҲБАТ (conversation history) =====
const conversationHistory = new Map();

// ===== ФУНКСИЯИ АИ ҶАВОБ =====
async function getAIResponse(userId, userMessage) {
  try {
    // Тарихи сӯҳбатро гиред
    if (!conversationHistory.has(userId)) {
      conversationHistory.set(userId, []);
    }
    const history = conversationHistory.get(userId);

    // Тарих зиёд нашавад (охирин 10 паём)
    if (history.length > 20) {
      history.splice(0, 2);
    }

    // Чат сессия созед
    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: SYSTEM_PROMPT }],
        },
        {
          role: "model",
          parts: [
            {
              text: "Хуб, ман ёрдамчии фурӯшгоҳи телефон ҳастам. Чӣ кӯмак лозим?",
            },
          ],
        },
        ...history,
      ],
    });

    const result = await chat.sendMessage(userMessage);
    const response = result.response.text();

    // Тарихро навсозӣ кунед
    history.push({ role: "user", parts: [{ text: userMessage }] });
    history.push({ role: "model", parts: [{ text: response }] });

    return response;
  } catch (error) {
    console.error("AI Error:", error);
    return "Узр, хатое рух дод. Лутфан дубора кӯшиш кунед ё бо менеҷер тамос гиред.";
  }
}

// ===== INSTAGRAM ПАЁМ ФИРИСТОДАН =====
async function sendInstagramMessage(recipientId, message) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/me/messages`,
      {
        recipient: { id: recipientId },
        message: { text: message },
      },
      {
        params: { access_token: CONFIG.PAGE_ACCESS_TOKEN },
      }
    );
    console.log(`✅ Паём фиристода шуд ба: ${recipientId}`);
  } catch (error) {
    console.error("❌ Хато дар фиристодани паём:", error.response?.data);
  }
}

// ===== INSTAGRAM WEBHOOK ТАСДИҚ =====
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === CONFIG.VERIFY_TOKEN) {
    console.log("✅ Webhook тасдиқ шуд!");
    res.status(200).send(challenge);
  } else {
    res.status(403).send("Хато: Token нодуруст");
  }
});

// ===== INSTAGRAM ПАЁМҲОРО ҚАБУЛ КАРДАН =====
app.post("/webhook", async (req, res) => {
  res.status(200).send("OK"); // Meta зуд ҷавоб мехоҳад

  const body = req.body;

  if (body.object !== "instagram") return;

  for (const entry of body.entry || []) {
    for (const event of entry.messaging || []) {
      const senderId = event.sender?.id;
      const messageText = event.message?.text;

      // Танҳо паёмҳои матниро коркард кунед
      if (!messageText || event.message?.is_echo) continue;

      console.log(`📩 Паём аз ${senderId}: ${messageText}`);

      // AI ҷавоб гиред
      const aiResponse = await getAIResponse(senderId, messageText);

      // Ҷавоб фиристед
      await sendInstagramMessage(senderId, aiResponse);
    }
  }
});

// ===== САЛОМАТИИ СЕРВЕР =====
app.get("/", (req, res) => {
  res.json({
    status: "✅ Instagram Bot кор мекунад",
    version: "1.0.0",
    language: "Тоҷикӣ + Русӣ",
  });
});

// ===== СЕРВЕР ОҒОЗ =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер дар порт ${PORT} кор мекунад`);
  console.log(`📱 Webhook: http://localhost:${PORT}/webhook`);
});
