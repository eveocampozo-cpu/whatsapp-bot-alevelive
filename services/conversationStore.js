/**
 * Conversation Store Service
 * Almacena y analiza el historial completo de conversaciones
 * 
 * Este servicio reemplaza al userState.js simplificado y proporciona:
 * - Historial completo de mensajes con timestamps
 * - Resolución de contexto para replies
 * - Tracking de preguntas pendientes del bot
 * - Formato de transcripción para GPT
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONVERSATIONS_FILE = path.join(__dirname, "../data/conversations.json");

// Cache en memoria
let conversationsCache = {};

// Límite de mensajes a mantener por conversación
const MAX_MESSAGES_PER_CONVERSATION = 50;

// =============================================================================
// PERSISTENCE
// =============================================================================

function loadConversations() {
  try {
    if (fs.existsSync(CONVERSATIONS_FILE)) {
      const data = fs.readFileSync(CONVERSATIONS_FILE, "utf-8");
      conversationsCache = JSON.parse(data);
      console.log(`📂 Conversaciones cargadas: ${Object.keys(conversationsCache).length}`);
    } else {
      conversationsCache = {};
      saveConversations();
    }
  } catch (error) {
    console.error("❌ Error cargando conversaciones:", error.message);
    conversationsCache = {};
  }
}

function saveConversations() {
  try {
    const dir = path.dirname(CONVERSATIONS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(conversationsCache, null, 2));
  } catch (error) {
    console.error("❌ Error guardando conversaciones:", error.message);
  }
}

// =============================================================================
// CONVERSATION MANAGEMENT
// =============================================================================

/**
 * Crea una nueva conversación
 * @param {string} userId
 * @param {string} userName
 * @returns {Object}
 */
function createConversation(userId, userName = null) {
  return {
    odId: userId,
    userName: userName,
    createdAt: new Date().toISOString(),
    lastMessageAt: null,
    messageCount: 0,
    messages: [],
    
    // Metadata de análisis
    analysis: {
      pendingQuestions: [],       // Preguntas que hizo el bot sin respuesta
      lastBotQuestion: null,      // Última pregunta del bot
      topicsDiscussed: []         // Temas tocados
    }
  };
}

/**
 * Obtiene o crea una conversación
 * @param {string} userId
 * @param {string} userName
 * @returns {Object}
 */
export function getConversation(userId, userName = null) {
  if (!conversationsCache[userId]) {
    conversationsCache[userId] = createConversation(userId, userName);
    saveConversations();
  }
  
  // Actualizar nombre si se proporciona
  if (userName && !conversationsCache[userId].userName) {
    conversationsCache[userId].userName = userName;
    saveConversations();
  }
  
  return conversationsCache[userId];
}

/**
 * Añade un mensaje a la conversación
 * @param {string} userId
 * @param {Object} messageData
 */
export function addMessage(userId, messageData) {
  const conversation = getConversation(userId, messageData.profileName);
  
  const message = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    role: messageData.role,                    // "bot" | "user"
    content: messageData.content || "",
    timestamp: new Date().toISOString(),
    
    // Tipo de contenido
    type: messageData.type || "text",          // text, audio, image, video, sticker
    mediaAnalysis: messageData.mediaAnalysis || null,
    
    // Contexto de reply
    isReply: messageData.isReply || false,
    replyToMessageId: messageData.replyToMessageId || null,
    replyToContent: messageData.replyToContent || null,
    
    // Para mensajes del bot
    messageSid: messageData.messageSid || null,
    isPendingQuestion: messageData.isPendingQuestion || false
  };
  
  conversation.messages.push(message);
  conversation.messageCount++;
  conversation.lastMessageAt = message.timestamp;
  
  // Limpiar mensajes antiguos si excede el límite
  if (conversation.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
    conversation.messages = conversation.messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
  }
  
  // Si es una pregunta del bot, trackearla
  if (message.role === "bot" && message.isPendingQuestion) {
    conversation.analysis.pendingQuestions.push({
      id: message.id,
      content: message.content,
      timestamp: message.timestamp
    });
    conversation.analysis.lastBotQuestion = message.content;
    
    // Limitar a últimas 3 preguntas pendientes
    if (conversation.analysis.pendingQuestions.length > 3) {
      conversation.analysis.pendingQuestions = conversation.analysis.pendingQuestions.slice(-3);
    }
  }
  
  // Si es respuesta del usuario, limpiar preguntas pendientes más antiguas
  if (message.role === "user") {
    // Mantener solo la pregunta más reciente
    if (conversation.analysis.pendingQuestions.length > 1) {
      conversation.analysis.pendingQuestions = conversation.analysis.pendingQuestions.slice(-1);
    }
  }
  
  saveConversations();
  return message;
}

/**
 * Marca una pregunta del bot como pendiente
 * @param {string} userId
 * @param {string} questionContent
 */
export function markPendingQuestion(userId, questionContent) {
  const conversation = getConversation(userId);
  conversation.analysis.lastBotQuestion = questionContent;
  saveConversations();
}

/**
 * Resuelve el contexto de un reply usando el MessageSid
 * @param {string} userId
 * @param {string} originalMessageSid
 * @returns {Object|null}
 */
export function resolveReply(userId, originalMessageSid) {
  const conversation = getConversation(userId);
  
  // Buscar el mensaje original por SID
  const originalMessage = conversation.messages.find(m => m.messageSid === originalMessageSid);
  
  if (originalMessage) {
    return {
      id: originalMessage.id,
      content: originalMessage.content,
      role: originalMessage.role,
      timestamp: originalMessage.timestamp
    };
  }
  
  return null;
}

/**
 * Obtiene un mensaje por su ID
 * @param {string} userId
 * @param {string} messageId
 * @returns {Object|null}
 */
export function getMessageById(userId, messageId) {
  const conversation = getConversation(userId);
  return conversation.messages.find(m => m.id === messageId) || null;
}

// =============================================================================
// CONTEXT BUILDING FOR GPT
// =============================================================================

/**
 * Calcula tiempo relativo legible
 * @param {string} timestamp
 * @returns {string}
 */
function getRelativeTime(timestamp) {
  const now = Date.now();
  const msgTime = new Date(timestamp).getTime();
  const diffMs = now - msgTime;
  const diffMin = Math.floor(diffMs / 60000);
  
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin}min`;
  if (diffMin < 60 * 24) return `hace ${Math.floor(diffMin / 60)}h`;
  return `hace ${Math.floor(diffMin / 60 / 24)}d`;
}

/**
 * Trunca texto
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
function truncate(text, maxLength) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

/**
 * Formatea el historial de conversación para GPT
 * @param {Object[]} messages
 * @param {number} maxMessages
 * @returns {string}
 */
function formatTranscript(messages, maxMessages = 25) {
  // Tomar los últimos N mensajes
  const recentMessages = messages.slice(-maxMessages);
  
  if (recentMessages.length === 0) {
    return "(Primera interacción - no hay historial previo, puedes saludar)";
  }
  
  let transcript = "";
  
  for (const msg of recentMessages) {
    const time = getRelativeTime(msg.timestamp);
    const sender = msg.role === 'bot' ? '🤖 EVELIN' : '👤 USUARIO';
    
    // Indicador de tipo de media
    let typeIndicator = '';
    if (msg.type === 'audio') typeIndicator = ' [AUDIO]';
    if (msg.type === 'image') typeIndicator = ' [IMAGEN]';
    if (msg.type === 'video') typeIndicator = ' [VIDEO]';
    if (msg.type === 'sticker') typeIndicator = ' [STICKER]';
    
    // Indicador de reply
    let replyIndicator = '';
    if (msg.isReply && msg.replyToContent) {
      replyIndicator = `\n   ↳ Respondiendo a: "${truncate(msg.replyToContent, 50)}"`;
    }
    
    // Indicador de pregunta pendiente
    let questionIndicator = '';
    if (msg.role === 'bot' && msg.isPendingQuestion) {
      questionIndicator = ' [PREGUNTA]';
    }
    
    transcript += `[${time}] ${sender}${typeIndicator}${questionIndicator}:${replyIndicator}\n`;
    transcript += `${msg.content || "(sin texto)"}\n\n`;
  }
  
  return transcript.trim();
}

/**
 * Construye el contexto completo para GPT
 * @param {string} userId
 * @returns {Object}
 */
export function buildContextForGPT(userId) {
  const conv = getConversation(userId);
  
  // Calcular tiempo desde última interacción
  const lastMsgTime = conv.lastMessageAt ? new Date(conv.lastMessageAt) : null;
  const timeSinceLastMsg = lastMsgTime ? Math.floor((Date.now() - lastMsgTime) / 60000) : 0;
  
  // Detectar gaps significativos de tiempo
  let timeContext = "";
  if (timeSinceLastMsg > 60 * 24) { // Más de 1 día
    const days = Math.floor(timeSinceLastMsg / 60 / 24);
    timeContext = `\n⏰ NOTA TEMPORAL: Han pasado ${days} día(s) desde el último mensaje. Considera resumir dónde quedaron sutilmente.`;
  } else if (timeSinceLastMsg > 60) { // Más de 1 hora
    const hours = Math.floor(timeSinceLastMsg / 60);
    timeContext = `\n⏰ NOTA TEMPORAL: Han pasado ${hours} hora(s) desde el último mensaje.`;
  }
  
  // Contexto de preguntas pendientes del bot
  let pendingContext = "";
  const pendingQuestions = conv.analysis.pendingQuestions;
  if (pendingQuestions.length > 0) {
    const questionsFormatted = pendingQuestions
      .map(q => `- "${truncate(q.content, 60)}" (${getRelativeTime(q.timestamp)})`)
      .join("\n");
    pendingContext = `\n📌 PREGUNTAS PENDIENTES QUE HICISTE (el usuario podría estar respondiendo a alguna):\n${questionsFormatted}`;
  }
  
  // Última pregunta específica
  let lastQuestionContext = "";
  if (conv.analysis.lastBotQuestion) {
    lastQuestionContext = `\n❓ ÚLTIMA PREGUNTA: "${truncate(conv.analysis.lastBotQuestion, 80)}"`;
  }
  
  // Formatear transcripción
  const transcript = formatTranscript(conv.messages);
  
  return {
    transcript: transcript,
    messageCount: conv.messageCount,
    timeContext: timeContext,
    pendingContext: pendingContext + lastQuestionContext,
    isFirstMessage: conv.messageCount === 0,
    userName: conv.userName
  };
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Resetea una conversación
 * @param {string} userId
 * @returns {boolean}
 */
export function resetConversation(userId) {
  if (conversationsCache[userId]) {
    delete conversationsCache[userId];
    saveConversations();
    console.log(`🔄 Conversación reseteada: ${userId}`);
    return true;
  }
  return false;
}

/**
 * Obtiene resumen de todas las conversaciones
 * @returns {Object}
 */
export function getConversationsSummary() {
  const conversations = Object.entries(conversationsCache);
  return {
    total: conversations.length,
    active: conversations.filter(([_, c]) => {
      const lastMsg = c.lastMessageAt ? new Date(c.lastMessageAt) : null;
      if (!lastMsg) return false;
      const hoursSince = (Date.now() - lastMsg.getTime()) / (1000 * 60 * 60);
      return hoursSince < 24;
    }).length,
    conversations: conversationsCache
  };
}

/**
 * Inicializa el servicio
 */
export function initConversationStore() {
  loadConversations();
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  getConversation,
  addMessage,
  markPendingQuestion,
  resolveReply,
  getMessageById,
  buildContextForGPT,
  resetConversation,
  getConversationsSummary,
  initConversationStore
};
