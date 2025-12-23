import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import twilio from "twilio";

dotenv.config();

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Inicializa Twilio client
let client;
try {
  client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  console.log("✅ Twilio client inicializado correctamente");
} catch (e) {
  console.error("❌ Error inicializando Twilio:", e.message);
}

// Webhook principal para recibir mensajes
app.post("/webhook", async (req, res) => {
  console.log("📬 Webhook recibido");
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);

  const incomingMsg = req.body.Body;
  const from = req.body.From;

  if (!incomingMsg || !from) {
    console.error("❌ Mensaje o número de remitente no recibido");
    return res.sendStatus(400);
  }

  console.log("📩 Mensaje recibido:", incomingMsg, "De:", from);

  let reply = "Lo siento, ocurrió un error procesando tu mensaje.";

  // Llamada a OpenAI
  try {
    const aiResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content:
              "Eres un asistente profesional, amable y claro que responde mensajes de WhatsApp. Nuestra empresa es AleveLive y el mensaje de inicio debe ser informativo sobre la agencia de AleveLive, 📌 Agencia TikTokLIVE, 🎯 Streamers y darle una bienvenida e informacion inicial en tono altamente profesional pero amigable sobre la agencia de tiktoker. Guia al usuario en todas sus preguntas, por el como comienzo, recuerda guiarlo y ser coherente con sus preguntas y respuestas. El mensaje debe ser maximo de 200 caracteres. se inteligente en tus respuestas eres asesor al cliente"
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
        }
      }
    );
    reply = aiResponse.data.choices[0]?.message?.content || reply;
    console.log("🤖 Respuesta de GPT:", reply);
  } catch (error) {
    console.error("❌ Error llamando a OpenAI:", error.response?.data || error.message);
  }

  // Enviar mensaje con Twilio y log completo
  try {
    if (!process.env.TWILIO_WHATSAPP_NUMBER) {
      console.error("❌ No tienes TWILIO_WHATSAPP_NUMBER configurado");
    } else {
      console.log("📤 Enviando mensaje a WhatsApp...");
      const message = await client.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: from,
        body: reply,
        statusCallback: "https://unexpeditious-ardell-moonish.ngrok-free.dev/status"
      });
      console.log("✅ Mensaje enviado:", message.sid);
      console.log("Mensaje completo:", message);
    }
  } catch (twilioError) {
    console.error(
      "❌ Error enviando mensaje con Twilio:",
      twilioError.code,
      twilioError.message,
      twilioError.moreInfo
    );
  }

  // Responder 200 a Twilio
  res.sendStatus(200);
});

// Endpoint para recibir callbacks de estado
app.post("/status", (req, res) => {
  const { MessageSid, MessageStatus, ErrorCode, ErrorMessage, To } = req.body;
  
  console.log("📊 Status Callback:");
  console.log(`   SID: ${MessageSid}`);
  console.log(`   Estado: ${MessageStatus}`);
  console.log(`   Para: ${To}`);
  
  if (ErrorCode) {
    console.log(`   ❌ Error ${ErrorCode}: ${ErrorMessage}`);
  }
  
  // Estados posibles: queued, sent, delivered, read, failed, undelivered
  if (MessageStatus === 'delivered') {
    console.log("   ✅ Mensaje entregado exitosamente!");
  } else if (MessageStatus === 'read') {
    console.log("   👀 Mensaje leído!");
  } else if (MessageStatus === 'failed' || MessageStatus === 'undelivered') {
    console.log("   ❌ Mensaje NO entregado");
  }
  
  res.sendStatus(200);
});


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Webhook WhatsApp activo en puerto ${PORT}`);
});
