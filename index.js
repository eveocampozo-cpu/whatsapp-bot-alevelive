import express from "express";
import dotenv from "dotenv";
import twilio from "twilio";

// Services
import { transcribeAudio, generateResponse, analyzeImage } from "./services/openai.js";
import { downloadMedia, parseIncomingMessage, getMediaByType, bufferToBase64Url } from "./services/twilio.js";

// Config
import { ALEVELIVE_SYSTEM_PROMPT, AUDIO_CONTEXT_PREFIX, IMAGE_CONTEXT_PREFIX } from "./config/systemPrompt.js";

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

// Fallback response when AI fails
const FALLBACK_RESPONSE = "¡Hola! 👋 Soy Alex de AleveLive. Tuve un pequeño problema técnico. ¿Podrías escribirme de nuevo?";

// ==================================================
// WEBHOOK PRINCIPAL WHATSAPP (INBOUND)
// ==================================================
app.post("/webhook", async (req, res) => {
  console.log("==================================================");
  console.log("📬 Webhook WhatsApp recibido");
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  console.log("Body:", JSON.stringify(req.body, null, 2));

  let reply = FALLBACK_RESPONSE;

  try {
    // Parse incoming message
    const message = parseIncomingMessage(req.body);
    
    if (!message.from) {
      console.error("❌ Body inválido: falta From");
      return sendTwimlResponse(res, reply);
    }

    console.log("📩 De:", message.from);
    console.log("👤 Nombre:", message.profileName);
    console.log("📝 Texto:", message.body);
    console.log("🎬 Media:", message.numMedia, "archivos");

    // Build user message content
    let userContent = message.body || "";
    let imageBase64Url = null;

    // ==================================================
    // PROCESS AUDIO (Voice Notes)
    // ==================================================
    if (message.hasAudio) {
      console.log("🎵 Audio detectado, procesando...");
      
      try {
        const audioMedia = getMediaByType(message, "audio/");
        if (audioMedia) {
          const { buffer } = await downloadMedia(audioMedia.url);
          const transcription = await transcribeAudio(buffer, "voice.ogg");
          
          // Prepend transcription context
          userContent = `${AUDIO_CONTEXT_PREFIX}"${transcription}"${userContent ? `\n\nTexto adicional: ${userContent}` : ""}`;
          console.log("✅ Audio procesado y transcrito");
        }
      } catch (audioError) {
        console.error("❌ Error procesando audio:", audioError.message);
        userContent = userContent || "Envié un audio pero no se pudo procesar. ¿Me pueden ayudar?";
      }
    }

    // ==================================================
    // PROCESS IMAGE (DISABLED - ignoring images completely)
    // ==================================================
    if (message.hasImage) {
      console.log("📸 Imagen detectada, ignorando sin respuesta...");
      // No respondemos nada cuando es una imagen
      res.status(200).send("");
      return;
      
      /*
      // TODO: Habilitar análisis de imágenes cuando se necesite
      try {
        const imageMedia = getMediaByType(message, "image/");
        if (imageMedia) {
          const { buffer, contentType } = await downloadMedia(imageMedia.url);
          imageBase64Url = bufferToBase64Url(buffer, contentType);
          
          // Analyze image to get context
          const imageDescription = await analyzeImage(imageBase64Url);
          
          // Add image context to message
          userContent = `${IMAGE_CONTEXT_PREFIX}La imagen muestra: ${imageDescription}${userContent ? `\n\nMensaje del usuario: ${userContent}` : ""}`;
          console.log("✅ Imagen procesada y analizada");
        }
      } catch (imageError) {
        console.error("❌ Error procesando imagen:", imageError.message);
        userContent = userContent || "Envié una imagen. ¿La puedes ver?";
      }
      */
    }

    // ==================================================
    // GENERATE AI RESPONSE
    // ==================================================
    if (!userContent.trim()) {
      userContent = "Hola";
    }

    console.log("🤖 Generando respuesta AI...");
    console.log("📋 Contenido a procesar:", userContent.substring(0, 200) + "...");

    const messages = [
      {
        role: "system",
        content: ALEVELIVE_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: userContent,
      },
    ];

    reply = await generateResponse(messages, message.hasImage ? imageBase64Url : null);
    
    // Truncate if too long for WhatsApp (1600 char limit)
    if (reply.length > 1500) {
      reply = reply.substring(0, 1497) + "...";
    }

    console.log("✅ Respuesta generada:", reply.substring(0, 100) + "...");

  } catch (error) {
    console.error("❌ Error general en webhook:", error.message);
    console.error(error.stack);
  }

  // Send TwiML response
  sendTwimlResponse(res, reply);
});

/**
 * Send TwiML response to Twilio
 * @param {Response} res - Express response object
 * @param {string} message - Message to send
 */
function sendTwimlResponse(res, message) {
  console.log("📤 Enviando respuesta TwiML a Twilio");
  
  const twiml = new MessagingResponse();
  twiml.message(message);

  res.status(200);
  res.set("Content-Type", "text/xml");
  res.send(twiml.toString());

  console.log("✅ TwiML enviado correctamente");
  console.log("==================================================");
}

// ==================================================
// HEALTH CHECK ENDPOINT
// ==================================================
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    service: "AleveLive WhatsApp AI"
  });
});

// ==================================================
// SERVER
// ==================================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("==================================================");
  console.log("🚀 AleveLive WhatsApp AI activo en puerto", PORT);
  console.log("📱 Webhook: POST /webhook");
  console.log("💚 Health: GET /health");
  console.log("==================================================");
  
  // Validate environment
  const requiredEnvVars = ["OPENAI_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"];
  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  
  if (missingVars.length > 0) {
    console.warn("⚠️ Variables de entorno faltantes:", missingVars.join(", "));
  } else {
    console.log("✅ Todas las variables de entorno configuradas");
  }
});
