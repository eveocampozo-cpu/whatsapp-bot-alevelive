import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import twilio from "twilio";

dotenv.config();

const app = express();

/**
 * IMPORTANTE:
 * Twilio envía application/x-www-form-urlencoded
 * Esto DEBE ir antes que express.json()
 */
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const { MessagingResponse } = twilio.twiml;

// ==================================================
// WEBHOOK PRINCIPAL WHATSAPP (INBOUND)
// ==================================================
app.post("/webhook", async (req, res) => {
  console.log("==================================================");
  console.log("📬 Webhook WhatsApp recibido");
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);

  const incomingMsg = req.body.Body;
  const from = req.body.From;

  // Respuesta por defecto (fallback seguro)
  let reply =
    "Hola 👋 Soy AleveLive, agencia TikTok LIVE 🎯 Escríbenos y te guiamos para comenzar.";

  if (!incomingMsg || !from) {
    console.error("❌ Body inválido: falta Body o From");
  } else {
    console.log("📩 Mensaje recibido:", incomingMsg);
    console.log("👤 De:", from);

    try {
      console.log("🤖 Llamando a OpenAI...");

      const aiResponse = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-5-mini",
          messages: [
            {
              role: "system",
              content:
                "Eres un asesor profesional de AleveLive, agencia TikTok LIVE. Responde claro, amable y profesional. Máximo 200 caracteres."
            },
            {
              role: "user",
              content: incomingMsg
            }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          timeout: 10000 // evita que Twilio espere demasiado
        }
      );

      reply =
        aiResponse.data.choices[0]?.message?.content || reply;

      console.log("🤖 Respuesta GPT:", reply);
    } catch (error) {
      console.error(
        "❌ Error llamando a OpenAI:",
        error.response?.data || error.message
      );
    }
  }

  // ==================================================
  // RESPUESTA ÚNICA Y OFICIAL A TWILIO (TwiML)
  // ==================================================
  console.log("📤 Enviando respuesta TwiML a Twilio");

  const twiml = new MessagingResponse();
  twiml.message(reply);

  res.status(200);
  res.set("Content-Type", "text/xml");
  res.send(twiml.toString());

  console.log("✅ TwiML enviado correctamente");
  console.log("==================================================");
});

// ==================================================
// SERVER
// ==================================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Webhook WhatsApp activo en puerto ${PORT}`);
});
