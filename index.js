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
import { isNewUser, isWaitingForInterest, isWaitingForLive, isWaitingForQRLink, markWelcomeSent, markWaitingForLive, markWaitingForQRLink, markCompleted, markAsActive, resetUser, getUsersSummary, initUserState } from "./services/userState.js";

// Config
import { buildSystemPrompt, AUDIO_CONTEXT_PREFIX, IMAGE_CONTEXT_PREFIX, FALLBACK_RESPONSES } from "./config/systemPrompt.js";
import { buildWelcomeMessage, getWelcomeAudioUrl, getInterestAudioUrl, getInterestVideoUrl, getQRImageUrl, getQRStepsImageUrl, STREAMER_MESSAGE, INTEREST_QUESTION, INTEREST_DETECTION_PROMPT, LIVE_CONFIRMATION_PROMPT, QR_LINK_CONFIRMATION_PROMPT } from "./config/welcomeMessage.js";

// ES Module dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Serve static media files (for audio/images)
// Serve static media files (for audio/images)
app.use("/media", (req, res, next) => {
  console.log(`📂 Acceso a media: ${req.url}`);
  // Force content type for OGG to ensure Twilio/WhatsApp validity
  if (req.url.endsWith(".ogg")) {
    res.setHeader("Content-Type", "audio/ogg");
  }
  next();
}, express.static(path.join(__dirname, "media")));

const { MessagingResponse } = twilio.twiml;

// Admin password
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "alevelive2024";

// ==================================================
// CONVERSATION MEMORY
// ==================================================
const conversationMemory = new Map();
const CONVERSATION_TTL_MS = 30 * 60 * 1000;

function getConversationContext(userId) {
  if (!conversationMemory.has(userId)) {
    conversationMemory.set(userId, {
      messages: [],
      lastInteraction: Date.now(),
      userName: null
    });
  }
  
  const context = conversationMemory.get(userId);
  context.lastInteraction = Date.now();
  cleanupOldConversations();
  
  return context;
}

function addToConversation(userId, role, content) {
  const context = getConversationContext(userId);
  context.messages.push({ role, content });
  
  if (context.messages.length > 6) {
    context.messages = context.messages.slice(-6);
  }
}

function cleanupOldConversations() {
  const now = Date.now();
  for (const [userId, context] of conversationMemory.entries()) {
    if (now - context.lastInteraction > CONVERSATION_TTL_MS) {
      conversationMemory.delete(userId);
    }
  }
}

// ==================================================
// WEBHOOK PRINCIPAL WHATSAPP
// ==================================================
app.post("/webhook", async (req, res) => {
  console.log("==================================================");
  console.log("📬 Webhook WhatsApp recibido");

  let reply = FALLBACK_RESPONSES.general;

  try {
    const message = parseIncomingMessage(req.body);
    
    if (!message.from) {
      console.error("❌ Body inválido: falta From");
      return sendTwimlResponse(res, reply);
    }

    console.log("📩 De:", message.from);
    console.log("👤 Nombre:", message.profileName);
    console.log("📝 Texto:", message.body);

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
            ? `✅ RAG actualizado!\n\n� ${result.chunks} secciones indexadas\n📄 ${info.contentLength} caracteres\n${result.cached ? "⚡ Sin cambios (cache)" : "🆕 Documento re-indexado"}`
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

    // Resetear usuario (para pruebas)
    const resetMatch = message.body?.match(/^RESETEAR\s+USUARIO\s+(\S+)\s+(.+)$/i);
    if (resetMatch) {
      const targetUser = resetMatch[1].trim();
      const password = resetMatch[2].trim();
      if (password === ADMIN_PASSWORD) {
        // Handle both formats: +521234567890 or whatsapp:+521234567890
        const userId = targetUser.startsWith("whatsapp:") ? targetUser : `whatsapp:${targetUser}`;
        const success = resetUser(userId);
        reply = success 
          ? `✅ Usuario ${targetUser} reseteado. Recibirá bienvenida en su próximo mensaje.`
          : `⚠️ Usuario ${targetUser} no encontrado.`;
        return sendTwimlResponse(res, reply);
      }
    }

    // Ver usuarios
    const usersMatch = message.body?.match(/^VER\s+USUARIOS\s+(.+)$/i);
    if (usersMatch) {
      const password = usersMatch[1].trim();
      if (password === ADMIN_PASSWORD) {
        const summary = getUsersSummary();
        reply = `👥 Usuarios:\n\nTotal: ${summary.total}\n🆕 Nuevos: ${summary.new}\n✅ Activos: ${summary.active}`;
        return sendTwimlResponse(res, reply);
      }
    }

    // Get conversation context
    const conversationContext = getConversationContext(message.from);
    
    if (message.profileName && !conversationContext.userName) {
      conversationContext.userName = message.profileName;
    }

    let userContent = message.body || "";

    // ==================================================
    // PROCESS AUDIO
    // ==================================================
    if (message.hasAudio) {
      console.log("🎵 Audio detectado...");
      try {
        const audioMedia = getMediaByType(message, "audio/");
        if (audioMedia) {
          const { buffer } = await downloadMedia(audioMedia.url);
          const transcription = await transcribeAudio(buffer, "voice.ogg");
          userContent = `${AUDIO_CONTEXT_PREFIX}"${transcription}"${userContent ? `\n\nTexto adicional: ${userContent}` : ""}`;
          console.log("✅ Audio transcrito");
        }
      } catch (audioError) {
        console.error("❌ Error audio:", audioError.message);
        userContent = userContent || "Envié un audio pero no se pudo procesar.";
      }
    }

    // ==================================================
    // PROCESS IMAGE
    // ==================================================
    let imageDescription = null;
    if (message.hasImage) {
      console.log("📸 Imagen detectada, analizando...");
      try {
        const imageMedia = getMediaByType(message, "image/");
        if (imageMedia) {
          const { buffer, contentType } = await downloadMedia(imageMedia.url);
          const imageBase64Url = bufferToBase64Url(buffer, contentType);
          imageDescription = await analyzeImage(imageBase64Url);
          userContent = `${IMAGE_CONTEXT_PREFIX}Descripción: ${imageDescription}${userContent ? `\n\nMensaje del usuario: ${userContent}` : ""}`;
          console.log("✅ Imagen analizada:", imageDescription.substring(0, 50) + "...");
        }
      } catch (imageError) {
        console.error("❌ Error imagen:", imageError.message);
        userContent = userContent || "Envié una imagen pero no se pudo procesar.";
      }
    }

    // ==================================================
    // STATE MACHINE FLOW
    // ==================================================
    
    // STATE 1: NEW USER - Send welcome sequence
    if (isNewUser(message.from)) {
      console.log("🆕 Usuario nuevo detectado, enviando secuencia de bienvenida...");
      
      // Build personalized welcome message
      const welcomeMessage = buildWelcomeMessage(message.profileName);
      
      // Mark as WELCOME_SENT (waiting for interest)
      markWelcomeSent(message.from, message.profileName);
      
      // Send welcome message as the TwiML response
      reply = welcomeMessage;
      
      // Add to conversation memory
      addToConversation(message.from, "user", userContent || "Hola");
      addToConversation(message.from, "assistant", welcomeMessage);
      
      console.log("✅ Bienvenida enviada, iniciando secuencia de mensajes...");
      
      // Helper function for delays
      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      
      // Send sequence in background (don't await - let TwiML response go first)
      const userTo = message.from; // Capture for closure
      const audioUrl = getWelcomeAudioUrl();
      
      (async () => {
        try {
          // Wait 3s, then send streamer message
          console.log("⏳ Esperando 3s para enviar mensaje streamer...");
          await delay(3000);
          await sendWhatsAppMessage(userTo, STREAMER_MESSAGE);
          console.log("💬 [1/3] Mensaje streamer enviado");
          
          // Wait 3s, then send audio
          console.log("⏳ Esperando 3s para enviar audio...");
          await delay(3000);
          if (audioUrl) {
            console.log("🔊 Enviando audio:", audioUrl);
            await sendWhatsAppMessage(userTo, "", [audioUrl]);
            console.log("🎵 [2/3] Audio de bienvenida enviado");
          } else {
            console.log("⚠️ No hay BASE_URL configurada, no se envía audio");
          }
          
          // Wait 3s, then send interest question
          console.log("⏳ Esperando 3s para enviar pregunta...");
          await delay(3000);
          await sendWhatsAppMessage(userTo, INTEREST_QUESTION);
          console.log("❓ [3/3] Pregunta de interés enviada");
          
          console.log("✅ Secuencia completa para:", userTo);
          
        } catch (err) {
          console.error("❌ Error en secuencia de bienvenida:", err.message);
        }
      })();
      
    // STATE 2: WAITING FOR INTEREST - Check response and send second audio if interested
    } else if (isWaitingForInterest(message.from)) {
      console.log("⏳ Usuario en espera de interés, analizando respuesta con GPT...");
      
      // Use GPT to detect interest
      const interestPrompt = INTEREST_DETECTION_PROMPT.replace("{{MESSAGE}}", userContent);
      const interestMessages = [{ role: "user", content: interestPrompt }];
      const interestResponse = await generateResponse(interestMessages, null);
      const showedInterest = interestResponse.trim().toUpperCase().includes("SI");
      
      console.log(`🤖 GPT dice: "${interestResponse.trim()}" → Interés: ${showedInterest}`);
      
      if (showedInterest) {
        console.log("✅ Usuario mostró interés!");
        
        // Mark as waiting for live confirmation
        markWaitingForLive(message.from);
        
        // Send positive response
        reply = "¡Súper! 🎉 Te envío un audio explicándote todo el proceso para que puedas empezar!";
        
        // Send second audio and then video in sequence
        const interestAudioUrl = getInterestAudioUrl();
        const interestVideoUrl = getInterestVideoUrl();
        
        if (interestAudioUrl) {
          setTimeout(async () => {
            try {
              await sendWhatsAppMessage(message.from, "", [interestAudioUrl]);
              console.log("🎵 Audio de interés enviado");
              
              // Send video 5 seconds after audio
              if (interestVideoUrl) {
                setTimeout(async () => {
                  try {
                    await sendWhatsAppMessage(message.from, "👆 Aquí te dejo un video con los pasos para que puedas comenzar! 🎬", [interestVideoUrl]);
                    console.log("🎬 Video de pasos enviado");
                    
                    // Send live scheduling question 5 seconds after video
                    setTimeout(async () => {
                      try {
                        await sendWhatsAppMessage(message.from, "Cuando te quedaría fácil hacer este primer live?");
                        console.log("📅 Pregunta de horario enviada");
                      } catch (err) {
                        console.error("❌ Error enviando pregunta de horario:", err.message);
                      }
                    }, 5000);
                  } catch (err) {
                    console.error("❌ Error enviando video de pasos:", err.message);
                  }
                }, 5000);
              }
            } catch (err) {
              console.error("❌ Error enviando audio de interés:", err.message);
            }
          }, 3000);
        }
        
      } else {
        console.log("🤔 Usuario no mostró interés directo, usando RAG...");
        
        // Mark as active without interest flag
        markAsActive(message.from, false);
        
        // Use RAG to respond naturally to whatever they said
        const semanticContext = await getSemanticContext(userContent, 3);
        const docContent = getDocumentContent();
        const systemPrompt = buildSystemPrompt(semanticContext, docContent);
        
        const messages = [
          { role: "system", content: systemPrompt },
          ...conversationContext.messages,
          { role: "user", content: userContent }
        ];
        
        reply = await generateResponse(messages, null);
      }
      
      addToConversation(message.from, "user", userContent);
      addToConversation(message.from, "assistant", reply);
      
    // STATE 3: WAITING FOR LIVE CONFIRMATION
    } else if (isWaitingForLive(message.from)) {
      console.log("⏳ Usuario esperando confirmación de live...");
      
      // Use GPT to detect if user confirmed they did the live
      const livePrompt = LIVE_CONFIRMATION_PROMPT.replace("{{MESSAGE}}", userContent);
      const liveMessages = [{ role: "user", content: livePrompt }];
      const liveResponse = await generateResponse(liveMessages, null);
      const confirmedLive = liveResponse.trim().toUpperCase().includes("SI");
      
      console.log(`🤖 GPT dice: "${liveResponse.trim()}" → Confirmó live: ${confirmedLive}`);
      
      if (confirmedLive) {
        console.log("✅ Usuario confirmó que hizo el live!");
        
        // Mark as waiting for QR link
        markWaitingForQRLink(message.from);
        
        // Send QR registration message
        reply = "Ya lo que sigue es hacer el registro con la agencia a traves de un QR y ya te envio las instrucciones☺️";
        
        // Send QR images in sequence
        const qrImageUrl = getQRImageUrl();
        const qrStepsImageUrl = getQRStepsImageUrl();
        
        setTimeout(async () => {
          try {
            // Send first QR image
            if (qrImageUrl) {
              await sendWhatsAppMessage(message.from, "", [qrImageUrl]);
              console.log("📱 Imagen QR enviada");
            }
            
            // Send second image (steps) after 3 seconds
            setTimeout(async () => {
              try {
                if (qrStepsImageUrl) {
                  await sendWhatsAppMessage(message.from, "", [qrStepsImageUrl]);
                  console.log("📋 Imagen pasos QR enviada");
                }
                
                // Send follow-up message after 3 seconds
                setTimeout(async () => {
                  try {
                    await sendWhatsAppMessage(message.from, "Me vas contando si te funciona o si tienes alguna dificultad💖");
                    console.log("💬 Mensaje de seguimiento QR enviado");
                  } catch (err) {
                    console.error("❌ Error enviando mensaje seguimiento:", err.message);
                  }
                }, 3000);
              } catch (err) {
                console.error("❌ Error enviando imagen pasos QR:", err.message);
              }
            }, 3000);
          } catch (err) {
            console.error("❌ Error enviando imagen QR:", err.message);
          }
        }, 3000);
        
      } else {
        console.log("🤔 Usuario no confirmó live, usando RAG...");
        
        // Use RAG to respond to their question/message
        const semanticContext = await getSemanticContext(userContent, 3);
        const docContent = getDocumentContent();
        const systemPrompt = buildSystemPrompt(semanticContext, docContent);
        
        const messages = [
          { role: "system", content: systemPrompt },
          ...conversationContext.messages,
          { role: "user", content: userContent }
        ];
        
        reply = await generateResponse(messages, null);
      }
      
      addToConversation(message.from, "user", userContent);
      addToConversation(message.from, "assistant", reply);
      
    // STATE 4: WAITING FOR QR LINK CONFIRMATION
    } else if (isWaitingForQRLink(message.from)) {
      console.log("⏳ Usuario esperando confirmación de vinculación QR...");
      
      // Use GPT to detect if user confirmed they linked via QR
      const qrPrompt = QR_LINK_CONFIRMATION_PROMPT.replace("{{MESSAGE}}", userContent);
      const qrMessages = [{ role: "user", content: qrPrompt }];
      const qrResponse = await generateResponse(qrMessages, null);
      const confirmedQR = qrResponse.trim().toUpperCase().includes("SI");
      
      console.log(`🤖 GPT dice: "${qrResponse.trim()}" → Confirmó QR: ${confirmedQR}`);
      
      if (confirmedQR) {
        console.log("✅ Usuario confirmó vinculación QR!");
        
        // Mark as completed
        markCompleted(message.from);
        
        // Get user's name for personalized message
        const userName = conversationContext.userName || "amiga";
        
        // Send completion message
        reply = `Perfecto ${userName}! Ya nosotros enviamos a revision la solicitud con TIKTOK y entre hoy y mañana podemos aceptar la invitacion☺️`;
        
      } else {
        console.log("🤔 Usuario no confirmó QR, usando RAG...");
        
        // Use RAG to respond to their question/message
        const semanticContext = await getSemanticContext(userContent, 3);
        const docContent = getDocumentContent();
        const systemPrompt = buildSystemPrompt(semanticContext, docContent);
        
        const messages = [
          { role: "system", content: systemPrompt },
          ...conversationContext.messages,
          { role: "user", content: userContent }
        ];
        
        reply = await generateResponse(messages, null);
      }
      
      addToConversation(message.from, "user", userContent);
      addToConversation(message.from, "assistant", reply);
      
    // STATE 5: COMPLETED or ACTIVE USER - Use RAG normally
    } else {
      // ==================================================
      // RAG: SEMANTIC SEARCH FOR RELEVANT CONTEXT
      // ==================================================
      if (!userContent.trim()) {
        userContent = "Hola";
      }

      console.log("🔍 Buscando contexto relevante con RAG...");
      
      // Get semantically relevant context from vector store
      const semanticContext = await getSemanticContext(userContent, 3);
      
      // Get full document content for direct instructions
      const docContent = getDocumentContent();
      
      console.log("📚 Contexto RAG:", semanticContext ? `${semanticContext.length} chars` : "ninguno");
      console.log("📄 Documento:", docContent ? `${docContent.length} chars` : "vacío");
      
      // Build prompt with semantic context + document content
      const systemPrompt = buildSystemPrompt(semanticContext, docContent);

      // ==================================================
      // GENERATE AI RESPONSE
      // ==================================================
      console.log("🤖 Generando respuesta...");

      addToConversation(message.from, "user", userContent);

      const messages = [
        { role: "system", content: systemPrompt },
        ...conversationContext.messages
      ];

      reply = await generateResponse(messages, null);
      
      addToConversation(message.from, "assistant", reply);
      
      if (reply.length > 1500) {
        reply = reply.substring(0, 1497) + "...";
      }

      console.log("✅ Respuesta:", reply.substring(0, 100) + "...");
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
    if (error.message.includes("audio")) {
      reply = FALLBACK_RESPONSES.audioError;
    }
  }

  sendTwimlResponse(res, reply);
});

function sendTwimlResponse(res, message) {
  const twiml = new MessagingResponse();
  twiml.message(message);
  res.status(200).set("Content-Type", "text/xml").send(twiml.toString());
  console.log("✅ Respuesta enviada");
  console.log("==================================================");
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
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    service: "AleveLive WhatsApp AI (RAG Embeddings)",
    conversations: conversationMemory.size,
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
      contextLength: context.length,
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
  console.log("==================================================");
  console.log("🚀 AleveLive WhatsApp AI (RAG + Welcome Flow)");
  console.log("==================================================");
  console.log("📱 Webhook: POST /webhook");
  console.log("📁 Media: GET /media/*");
  console.log("💚 Health: GET /health");
  console.log("🔍 Debug: POST /debug/search");
  console.log("🔐 Admin: POST /admin/refresh, /admin/clear");
  console.log("==================================================");
  console.log("");
  console.log("📋 Comandos WhatsApp (admin):");
  console.log("   ACTUALIZAR RAG [password]           - Reindexar desde Drive");
  console.log("   LIMPIAR RAG [password]              - Limpiar índice");
  console.log("   ESTADO RAG [password]               - Ver estado RAG");
  console.log("   RESETEAR USUARIO [numero] [password] - Resetear usuario");
  console.log("   VER USUARIOS [password]             - Ver resumen usuarios");
  console.log("==================================================");
  
  // Initialize user state service
  initUserState();
  
  // Initialize RAG from Google Docs
  await initializeFromDrive();
  
  const ragInfo = getRAGInfo();
  const usersSummary = getUsersSummary();
  console.log("");
  console.log(ragInfo.indexed 
    ? `✅ RAG listo: ${ragInfo.chunks} chunks indexados`
    : "⚠️ RAG vacío - usa ACTUALIZAR RAG para indexar");
  console.log(`👥 Usuarios: ${usersSummary.total} total (${usersSummary.active} activos)`);
  console.log("==================================================");
});
