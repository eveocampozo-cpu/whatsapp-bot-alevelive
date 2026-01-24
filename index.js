import express from "express";
import dotenv from "dotenv";
import twilio from "twilio";
import path from "path";
import { fileURLToPath } from "url";

// Services
import { transcribeAudio, generateResponse, analyzeImage } from "./services/openai.js";
import { downloadMedia, parseIncomingMessage, getMediaByType, bufferToBase64Url, sendWhatsAppMessage } from "./services/twilio.js";
import { loadAndIndexDocument, initializeFromDrive, getDocumentInfo, getDocumentContent, clearAll } from "./services/googleDrive.js";
import { getSemanticContext, getRAGInfo, clearRAG } from "./services/rag.js";
import { 
  getConversation, 
  addMessage, 
  buildContextForGPT, 
  markPendingQuestion,
  resolveReply,
  resetConversation,
  getConversationsSummary,
  initConversationStore 
} from "./services/conversationStore.js";

// Config
import { 
  buildSystemPrompt, 
  AUDIO_CONTEXT_PREFIX, 
  IMAGE_CONTEXT_PREFIX, 
  FALLBACK_RESPONSES 
} from "./config/systemPrompt.js";
import { 
  AGENCY_LINK,
  getWelcomeAudioUrl, 
  getInterestAudioUrl, 
  getInterestVideoUrl, 
  getQRImageUrl, 
  getQRStepsImageUrl 
} from "./config/welcomeMessage.js";

// ES Module dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Serve static media files (for audio/images)
app.use("/media", (req, res, next) => {
  console.log(`📂 Acceso a media: ${req.url}`);
  if (req.url.endsWith(".ogg")) {
    res.setHeader("Content-Type", "audio/ogg");
  }
  next();
}, express.static(path.join(__dirname, "media")));

const { MessagingResponse } = twilio.twiml;

// Admin password
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "alevelive2024";

// ==================================================
// HELPER: Parse GPT Response for Actions
// ==================================================

/**
 * Parsea la respuesta de GPT para extraer acciones de media y mensajes separados
 * @param {string} response - Respuesta de GPT
 * @returns {{messages: string[], actions: Object}}
 */
function parseGPTResponse(response) {
  const actions = {
    sendWelcomeAudio: response.includes('[ENVIAR:AUDIO_BIENVENIDA]'),
    sendInterestAudio: response.includes('[ENVIAR:AUDIO_INTERES]'),
    sendStepsVideo: response.includes('[ENVIAR:VIDEO_PASOS]'),
    sendQRImage: response.includes('[ENVIAR:IMAGEN_QR]'),
    sendQRStepsImage: response.includes('[ENVIAR:IMAGEN_PASOS_QR]')
  };
  
  // Remover tags de acciones de la respuesta
  let cleanResponse = response
    .replace(/\[ENVIAR:[A-Z_]+\]/g, '')
    .trim();
  
  // Dividir por [MENSAJE_APARTE] para mensajes separados
  let messages = cleanResponse
    .split(/\[MENSAJE_APARTE\]/i)
    .map(m => m.trim())
    .filter(m => m.length > 0);
  
  // Si no hay mensajes, crear uno por defecto
  if (messages.length === 0) {
    messages = ["¡Listo! 😊"];
  }
  
  // Limpiar espacios y saltos de línea excesivos
  messages = messages.map(m => 
    m.replace(/\n{3,}/g, '\n\n')   // 3+ saltos → máximo 2 (un espacio normal entre párrafos)
     .replace(/\r\n/g, '\n')       // Normalizar Windows line breaks
     .replace(/  +/g, ' ')         // Múltiples espacios → 1 espacio
     .replace(/\n /g, '\n')        // Espacio después de salto → eliminar
     .replace(/ \n/g, '\n')        // Espacio antes de salto → eliminar
     .trim()
  );
  
  return { messages, actions };
}

/**
 * Envía mensajes adicionales via API (para mensajes separados después del primero)
 * @param {string} userId - ID del usuario
 * @param {string[]} messages - Mensajes adicionales a enviar
 */
async function sendAdditionalMessages(userId, messages) {
  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  
  for (const message of messages) {
    await delay(1500); // 1.5s entre mensajes para parecer natural
    try {
      await sendWhatsAppMessage(userId, message, []);
      addMessage(userId, { role: "bot", content: message, type: "text" });
      console.log("💬 Mensaje adicional enviado:", message.substring(0, 50) + "...");
    } catch (error) {
      console.error("❌ Error enviando mensaje adicional:", error.message);
    }
  }
}

/**
 * Ejecuta acciones de envío de media en background
 * @param {string} userId - ID del usuario
 * @param {Object} actions - Acciones a ejecutar
 */
async function executeMediaActions(userId, actions) {
  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  
  try {
    // Audio de bienvenida
    if (actions.sendWelcomeAudio) {
      await delay(2000);
      const url = getWelcomeAudioUrl();
      if (url) {
        await sendWhatsAppMessage(userId, "", [url]);
        addMessage(userId, { role: "bot", content: "(Audio de bienvenida enviado)", type: "audio" });
        console.log("🎵 Audio de bienvenida enviado");
      }
    }
    
    // Audio de interés
    if (actions.sendInterestAudio) {
      await delay(2000);
      const url = getInterestAudioUrl();
      if (url) {
        await sendWhatsAppMessage(userId, "", [url]);
        addMessage(userId, { role: "bot", content: "(Audio de interés enviado)", type: "audio" });
        console.log("🎵 Audio de interés enviado");
      }
    }
    
    // Video de pasos (SIEMPRE después del audio de interés)
    if (actions.sendStepsVideo) {
      await delay(3000); // Delay antes de enviar
      const url = getInterestVideoUrl();
      if (url) {
        await sendWhatsAppMessage(userId, "Mira este video con los pasos 🎬", [url]);
        addMessage(userId, { role: "bot", content: "Mira este video con los pasos 🎬", type: "video" });
        console.log("🎬 Video de pasos enviado");
        // Delay adicional para que Twilio procese y entregue el video antes de continuar
        await delay(2000);
      }
    }
    
    // QR
    if (actions.sendQRImage) {
      await delay(2000);
      const url = getQRImageUrl();
      if (url) {
        await sendWhatsAppMessage(userId, "Aquí está el QR para vincularte 📱", [url]);
        addMessage(userId, { role: "bot", content: "(Imagen QR enviada)", type: "image" });
        console.log("📱 Imagen QR enviada");
      }
    }
    
    // Pasos del QR
    if (actions.sendQRStepsImage) {
      await delay(2000);
      const url = getQRStepsImageUrl();
      if (url) {
        await sendWhatsAppMessage(userId, "Y estos son los pasos para escanearlo 👆", [url]);
        addMessage(userId, { role: "bot", content: "(Pasos QR enviados)", type: "image" });
        console.log("📋 Imagen pasos QR enviada");
      }
    }
  } catch (error) {
    console.error("❌ Error ejecutando acciones de media:", error.message);
  }
}

/**
 * Detecta si un mensaje contiene una pregunta
 * @param {string} text - Texto del mensaje
 * @returns {boolean}
 */
function containsQuestion(text) {
  if (!text) return false;
  // Detecta signos de interrogación o patrones de pregunta comunes
  return text.includes("?") || 
         /^(cómo|cuándo|dónde|qué|cuál|quién|por qué|cuánto)/i.test(text.trim()) ||
         /te gustaría|quieres|puedes|podrías/i.test(text);
}

// ==================================================
// WEBHOOK PRINCIPAL WHATSAPP
// ==================================================
app.post("/webhook", async (req, res) => {
  console.log("\n══════════════════════════════════════════════════");
  console.log("📬 Webhook WhatsApp recibido");
  console.log("⏰ Timestamp:", new Date().toISOString());

  let reply = FALLBACK_RESPONSES.general;

  try {
    // 1. Parsear mensaje entrante
    const message = parseIncomingMessage(req.body);
    
    if (!message.from) {
      console.error("❌ Body inválido: falta From");
      return sendTwimlResponse(res, reply);
    }

    console.log("📩 De:", message.from);
    console.log("👤 Nombre:", message.profileName);
    console.log("📝 Texto:", message.body);
    console.log("↩️ Es Reply:", message.isReply);

    // ==================================================
    // ADMIN COMMANDS VIA WHATSAPP
    // ==================================================
    
    // Actualizar RAG desde Google Docs
    const updateMatch = message.body?.match(/^ACTUALIZAR\s+RAG\s+(.+)$/i);
    if (updateMatch) {
      const password = updateMatch[1].trim();
      if (password === ADMIN_PASSWORD) {
        try {
          console.log("🔄 Admin: Actualizando RAG...");
          const result = await loadAndIndexDocument();
          const info = getDocumentInfo();
          
          reply = result.success 
            ? `✅ RAG actualizado!\n\n📦 ${result.chunks} secciones indexadas\n📄 ${info.contentLength} caracteres\n${result.cached ? "⚡ Sin cambios (cache)" : "🆕 Documento re-indexado"}`
            : `⚠️ ${result.message}`;
        } catch (error) {
          reply = `❌ Error: ${error.message}`;
        }
        return sendTwimlResponse(res, reply);
      } else {
        reply = "❌ Password incorrecto";
        return sendTwimlResponse(res, reply);
      }
    }

    // Limpiar RAG
    const clearMatch = message.body?.match(/^LIMPIAR\s+RAG\s+(.+)$/i);
    if (clearMatch) {
      const password = clearMatch[1].trim();
      if (password === ADMIN_PASSWORD) {
        clearAll();
        reply = "✅ RAG limpiado completamente";
        return sendTwimlResponse(res, reply);
      }
    }

    // Ver estado
    const statusMatch = message.body?.match(/^ESTADO\s+RAG\s+(.+)$/i);
    if (statusMatch) {
      const password = statusMatch[1].trim();
      if (password === ADMIN_PASSWORD) {
        const info = getDocumentInfo();
        reply = `📊 Estado del RAG:\n\n📦 Chunks: ${info.rag.chunks}\n📄 Documento: ${info.contentLength} chars\n⏰ Indexado: ${info.rag.lastIndexed || "Nunca"}\n\n📝 Preview:\n${info.preview || "(vacío)"}`;
        return sendTwimlResponse(res, reply);
      }
    }

    // Resetear conversación de usuario (para pruebas)
    const resetMatch = message.body?.match(/^RESETEAR\s+USUARIO\s+(\S+)\s+(.+)$/i);
    if (resetMatch) {
      const targetUser = resetMatch[1].trim();
      const password = resetMatch[2].trim();
      if (password === ADMIN_PASSWORD) {
        const userId = targetUser.startsWith("whatsapp:") ? targetUser : `whatsapp:${targetUser}`;
        const success = resetConversation(userId);
        reply = success 
          ? `✅ Conversación de ${targetUser} reseteada. Recibirá bienvenida en su próximo mensaje.`
          : `⚠️ Usuario ${targetUser} no encontrado.`;
        return sendTwimlResponse(res, reply);
      }
    }

    // Ver usuarios/conversaciones
    const usersMatch = message.body?.match(/^VER\s+USUARIOS\s+(.+)$/i);
    if (usersMatch) {
      const password = usersMatch[1].trim();
      if (password === ADMIN_PASSWORD) {
        const summary = getConversationsSummary();
        reply = `👥 Conversaciones:\n\nTotal: ${summary.total}\n🟢 Activas (24h): ${summary.active}`;
        return sendTwimlResponse(res, reply);
      }
    }

    // ==================================================
    // 2. PROCESAR CONTENIDO DEL MENSAJE
    // ==================================================
    
    let userContent = message.body || "";
    let messageType = "text";
    let mediaAnalysis = null;

    // Procesar audio
    if (message.hasAudio) {
      console.log("🎵 Audio detectado, transcribiendo...");
      try {
        const audioMedia = getMediaByType(message, "audio/");
        if (audioMedia) {
          const { buffer } = await downloadMedia(audioMedia.url);
          const transcription = await transcribeAudio(buffer, "voice.ogg");
          userContent = transcription;
          messageType = "audio";
          mediaAnalysis = transcription;
          console.log("✅ Audio transcrito:", transcription.substring(0, 50) + "...");
        }
      } catch (audioError) {
        console.error("❌ Error audio:", audioError.message);
        userContent = userContent || "(Audio no procesado)";
      }
    }

    // Procesar imagen
    if (message.hasImage) {
      console.log("📸 Imagen detectada, analizando...");
      try {
        const imageMedia = getMediaByType(message, "image/");
        if (imageMedia) {
          const { buffer, contentType } = await downloadMedia(imageMedia.url);
          const imageBase64Url = bufferToBase64Url(buffer, contentType);
          const description = await analyzeImage(imageBase64Url);
          userContent = `[Imagen: ${description}]${userContent ? ` ${userContent}` : ""}`;
          messageType = "image";
          mediaAnalysis = description;
          console.log("✅ Imagen analizada:", description.substring(0, 50) + "...");
        }
      } catch (imageError) {
        console.error("❌ Error imagen:", imageError.message);
        userContent = userContent || "[Imagen no procesada]";
      }
    }

    // Manejar stickers
    if (message.hasSticker) {
      userContent = userContent || "[Sticker]";
      messageType = "sticker";
    }

    // Si el mensaje está completamente vacío
    if (!userContent.trim()) {
      userContent = "(Mensaje vacío)";
    }

    // ==================================================
    // 3. RESOLVER CONTEXTO DE REPLY
    // ==================================================
    
    let replyContext = null;
    if (message.isReply && message.originalRepliedMessageSid) {
      replyContext = resolveReply(message.from, message.originalRepliedMessageSid);
      if (replyContext) {
        console.log("↩️ Es reply a:", replyContext.content?.substring(0, 50) + "...");
      } else {
        console.log("↩️ Reply detectado pero mensaje original no encontrado en historial");
      }
    }

    // ==================================================
    // 4. GUARDAR MENSAJE DEL USUARIO
    // ==================================================
    
    addMessage(message.from, {
      role: "user",
      content: userContent,
      type: messageType,
      mediaAnalysis: mediaAnalysis,
      isReply: !!replyContext,
      replyToMessageId: replyContext?.id || null,
      replyToContent: replyContext?.content || null,
      profileName: message.profileName
    });

    // ==================================================
    // 5. CONSTRUIR CONTEXTO COMPLETO PARA GPT
    // ==================================================
    
    console.log("📚 Construyendo contexto para GPT...");
    
    // Obtener contexto de la conversación
    const conversationContext = buildContextForGPT(message.from);
    
    // Obtener contexto semántico del RAG
    const ragContext = await getSemanticContext(userContent, 3);
    
    // Obtener instrucciones del documento
    const documentContent = getDocumentContent();
    
    console.log(`📊 Contexto: ${conversationContext.messageCount} mensajes, RAG: ${ragContext ? 'sí' : 'no'}`);
    console.log(`🕐 Primera interacción: ${conversationContext.isFirstMessage}`);

    // Construir el prompt del sistema completo
    const systemPrompt = buildSystemPrompt({
      ragContext: ragContext,
      documentContent: documentContent,
      conversationTranscript: conversationContext.transcript,
      timeContext: conversationContext.timeContext,
      pendingQuestionsContext: conversationContext.pendingContext
    });

    // ==================================================
    // 6. GENERAR RESPUESTA CON GPT-4o
    // ==================================================
    
    console.log("🤖 Generando respuesta inteligente...");

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ];

    const rawReply = await generateResponse(messages, null);
    
    // DEBUG: Log raw GPT response to verify tags
    console.log("═══════════════════════════════════════════════════");
    console.log("🔍 RAW GPT RESPONSE:");
    console.log(rawReply);
    console.log("═══════════════════════════════════════════════════");
    console.log("🔍 Contains [MENSAJE_APARTE]:", rawReply.includes('[MENSAJE_APARTE]'));
    console.log("🔍 Contains [ENVIAR:AUDIO_BIENVENIDA]:", rawReply.includes('[ENVIAR:AUDIO_BIENVENIDA]'));
    
    // Parsear respuesta y extraer acciones + mensajes separados
    const { messages: responseMessages, actions } = parseGPTResponse(rawReply);
    
    // El primer mensaje va como respuesta TwiML
    reply = responseMessages[0] || "¡Listo! 😊";

    // Limitar longitud para WhatsApp
    if (reply.length > 1500) {
      reply = reply.substring(0, 1497) + "...";
    }

    console.log("✅ Respuesta:", reply.substring(0, 100) + "...");
    console.log("📦 Mensajes parseados:", responseMessages.length);
    console.log("📦 Mensajes adicionales:", responseMessages.slice(1));
    console.log("📦 Acciones:", JSON.stringify(actions));

    // ==================================================
    // 7. GUARDAR RESPUESTA DEL BOT
    // ==================================================
    
    const isQuestion = containsQuestion(reply);
    
    addMessage(message.from, {
      role: "bot",
      content: reply,
      type: "text",
      isPendingQuestion: isQuestion,
      messageSid: message.messageSid // Para tracking de replies futuros
    });

    if (isQuestion) {
      markPendingQuestion(message.from, reply);
    }

    // ==================================================
    // 8. SECUENCIA DE ENVÍO: MEDIA → MENSAJES ADICIONALES
    // ==================================================
    // ORDEN GARANTIZADO:
    // 1. Respuesta TwiML ya enviada (el mensaje principal)
    // 2. Acciones de media (audio, video, imágenes) 
    // 3. Mensajes adicionales (las preguntas van AL FINAL)
    
    const hasMediaActions = Object.values(actions).some(v => v);
    const pendingMessages = responseMessages.slice(1);
    
    // Función que ejecuta la secuencia completa
    async function executeSequentialFlow(userId, mediaActions, textMessages) {
      const waitMs = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      
      console.log("🔄 Iniciando secuencia de envío...");
      console.log("   - Media actions:", JSON.stringify(mediaActions));
      console.log("   - Mensajes adicionales:", textMessages.length);
      
      // ========================
      // PASO 1: ENVIAR MEDIA
      // ========================
      const hasMedia = Object.values(mediaActions).some(v => v);
      if (hasMedia) {
        console.log("📤 [PASO 1/2] Enviando media...");
        
        // Audio de bienvenida
        if (mediaActions.sendWelcomeAudio) {
          await waitMs(2000);
          const url = getWelcomeAudioUrl();
          if (url) {
            await sendWhatsAppMessage(userId, "", [url]);
            console.log("   ✓ Audio bienvenida enviado");
          }
        }
        
        // Audio de interés
        if (mediaActions.sendInterestAudio) {
          await waitMs(2000);
          const url = getInterestAudioUrl();
          if (url) {
            await sendWhatsAppMessage(userId, "", [url]);
            console.log("   ✓ Audio interés enviado");
          }
        }
        
        // Video de pasos
        if (mediaActions.sendStepsVideo) {
          await waitMs(3000);
          const url = getInterestVideoUrl();
          if (url) {
            await sendWhatsAppMessage(userId, "Mira este video con los pasos 🎬", [url]);
            console.log("   ✓ Video enviado");
            await waitMs(5000); // Esperar a que el video se procese
          }
        }
        
        // QR
        if (mediaActions.sendQRImage) {
          await waitMs(2000);
          const url = getQRImageUrl();
          if (url) {
            await sendWhatsAppMessage(userId, "Aquí está el QR para vincularte 📱", [url]);
            console.log("   ✓ QR enviado");
          }
        }
        
        // Pasos QR
        if (mediaActions.sendQRStepsImage) {
          await waitMs(2000);
          const url = getQRStepsImageUrl();
          if (url) {
            await sendWhatsAppMessage(userId, "Y estos son los pasos para escanearlo 👆", [url]);
            console.log("   ✓ Pasos QR enviados");
          }
        }
        
        console.log("✅ [PASO 1/2] Media completado");
        
        // ⚠️ ESPERA CRÍTICA: Twilio procesa texto más rápido que audio/video
        // Debemos esperar a que el media se entregue antes de enviar texto
        console.log("⏳ Esperando 8 segundos para que Twilio entregue el media...");
        await waitMs(3000);
      }
      
      // ========================
      // PASO 2: ENVIAR MENSAJES
      // ========================
      // ESTO SOLO SE EJECUTA DESPUÉS DE QUE TODO EL MEDIA TERMINE
      if (textMessages.length > 0) {
        console.log("💬 [PASO 2/2] Enviando mensajes adicionales...");
        
        for (const msg of textMessages) {
          await waitMs(2000); // Esperar antes de cada mensaje
          await sendWhatsAppMessage(userId, msg, []);
          console.log("   ✓ Mensaje enviado:", msg.substring(0, 40) + "...");
        }
        
        console.log("✅ [PASO 2/2] Mensajes completados");
      }
      
      console.log("🏁 Secuencia de envío finalizada");
    }
    
    // Ejecutar la secuencia en background (no bloquea TwiML)
    if (hasMediaActions || pendingMessages.length > 0) {
      executeSequentialFlow(message.from, actions, pendingMessages)
        .catch(err => console.error("❌ Error en secuencia:", err.message));
    }

  } catch (error) {
    console.error("❌ Error general:", error.message);
    console.error(error.stack);
    
    if (error.message.includes("audio")) {
      reply = FALLBACK_RESPONSES.audioError;
    } else if (error.message.includes("image") || error.message.includes("imagen")) {
      reply = FALLBACK_RESPONSES.imageError;
    }
  }

  sendTwimlResponse(res, reply);
});

/**
 * Envía respuesta TwiML
 */
function sendTwimlResponse(res, message) {
  const twiml = new MessagingResponse();
  twiml.message(message);
  res.status(200).set("Content-Type", "text/xml").send(twiml.toString());
  console.log("✅ Respuesta TwiML enviada");
  console.log("══════════════════════════════════════════════════\n");
}

// ==================================================
// ADMIN ENDPOINTS
// ==================================================

app.post("/admin/refresh", async (req, res) => {
  const password = req.headers["x-admin-password"] || req.body?.password;
  
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await loadAndIndexDocument();
    res.json({
      success: result.success,
      ...result,
      document: getDocumentInfo()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/admin/clear", (req, res) => {
  const password = req.headers["x-admin-password"] || req.body?.password;
  
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  clearAll();
  res.json({ success: true, message: "RAG cleared" });
});

// ==================================================
// INFO ENDPOINTS
// ==================================================

app.get("/health", (req, res) => {
  const convSummary = getConversationsSummary();
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    service: "AleveLive WhatsApp AI (Intelligent Conversation)",
    conversations: {
      total: convSummary.total,
      active: convSummary.active
    },
    rag: getRAGInfo(),
    document: getDocumentInfo()
  });
});

app.post("/debug/search", async (req, res) => {
  const { query } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: "query is required" });
  }

  try {
    const context = await getSemanticContext(query, 3);
    res.json({
      query,
      contextLength: context?.length || 0,
      context: context || "(no relevant context found)",
      ragInfo: getRAGInfo()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================================================
// SERVER
// ==================================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log("══════════════════════════════════════════════════");
  console.log("🚀 AleveLive WhatsApp AI - Intelligent Conversation");
  console.log("══════════════════════════════════════════════════");
  console.log("📱 Webhook: POST /webhook");
  console.log("📁 Media: GET /media/*");
  console.log("💚 Health: GET /health");
  console.log("🔍 Debug: POST /debug/search");
  console.log("🔐 Admin: POST /admin/refresh, /admin/clear");
  console.log("══════════════════════════════════════════════════");
  console.log("");
  console.log("📋 Comandos WhatsApp (admin):");
  console.log("   ACTUALIZAR RAG [password]           - Reindexar desde Drive");
  console.log("   LIMPIAR RAG [password]              - Limpiar índice");
  console.log("   ESTADO RAG [password]               - Ver estado RAG");
  console.log("   RESETEAR USUARIO [numero] [password] - Resetear conversación");
  console.log("   VER USUARIOS [password]             - Ver resumen conversaciones");
  console.log("══════════════════════════════════════════════════");
  
  // Initialize conversation store
  initConversationStore();
  
  // Initialize RAG from Google Docs
  await initializeFromDrive();
  
  const ragInfo = getRAGInfo();
  const convSummary = getConversationsSummary();
  console.log("");
  console.log(ragInfo.indexed 
    ? `✅ RAG listo: ${ragInfo.chunks} chunks indexados`
    : "⚠️ RAG vacío - usa ACTUALIZAR RAG para indexar");
  console.log(`💬 Conversaciones: ${convSummary.total} total (${convSummary.active} activas 24h)`);
  console.log("══════════════════════════════════════════════════");
});
