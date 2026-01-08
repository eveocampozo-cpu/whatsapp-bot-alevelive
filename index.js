import express from "express";
import dotenv from "dotenv";
import twilio from "twilio";

// Services
import { transcribeAudio, generateResponse } from "./services/openai.js";
import { downloadMedia, parseIncomingMessage, getMediaByType } from "./services/twilio.js";
import { loadAndIndexDocument, initializeFromDrive, getDocumentInfo, getDocumentContent, clearAll } from "./services/googleDrive.js";
import { getSemanticContext, getRAGInfo, clearRAG } from "./services/rag.js";

// Config
import { buildSystemPrompt, AUDIO_CONTEXT_PREFIX, FALLBACK_RESPONSES } from "./config/systemPrompt.js";

dotenv.config();

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

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
    // PROCESS IMAGE (disabled)
    // ==================================================
    if (message.hasImage) {
      console.log("📸 Imagen detectada, ignorando...");
      res.status(200).send("");
      return;
    }

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
  console.log("🚀 AleveLive WhatsApp AI (RAG + Embeddings)");
  console.log("==================================================");
  console.log("📱 Webhook: POST /webhook");
  console.log("💚 Health: GET /health");
  console.log("🔍 Debug: POST /debug/search");
  console.log("🔐 Admin: POST /admin/refresh, /admin/clear");
  console.log("==================================================");
  console.log("");
  console.log("📋 Comandos WhatsApp (admin):");
  console.log("   ACTUALIZAR RAG [password] - Reindexar desde Drive");
  console.log("   LIMPIAR RAG [password]    - Limpiar índice");
  console.log("   ESTADO RAG [password]     - Ver estado");
  console.log("==================================================");
  
  // Initialize RAG from Google Docs
  await initializeFromDrive();
  
  const ragInfo = getRAGInfo();
  console.log("");
  console.log(ragInfo.indexed 
    ? `✅ RAG listo: ${ragInfo.chunks} chunks indexados`
    : "⚠️ RAG vacío - usa ACTUALIZAR RAG para indexar");
  console.log("==================================================");
});
