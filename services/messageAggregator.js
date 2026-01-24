/**
 * Message Aggregator Service
 * Agrupa mensajes rápidos del mismo usuario antes de procesarlos
 * 
 * Cuando un usuario envía múltiples mensajes en rápida sucesión,
 * los agregamos en uno solo antes de procesar para dar contexto completo.
 */

// Buffer de mensajes pendientes por usuario
const pendingMessages = new Map();

// Tiempo de espera antes de procesar (3 segundos)
const AGGREGATION_WINDOW_MS = 3000;

/**
 * Añade un mensaje al buffer de agregación
 * @param {string} userId - ID del usuario (whatsapp:+xxx)
 * @param {Object} message - Mensaje parseado de Twilio
 * @returns {Promise<{shouldProcess: boolean, messages: Object[], aggregatedContent: string}>}
 */
export function addMessageToBuffer(userId, message) {
  return new Promise((resolve) => {
    if (!pendingMessages.has(userId)) {
      pendingMessages.set(userId, {
        messages: [],
        timer: null,
        resolver: null
      });
    }
    
    const buffer = pendingMessages.get(userId);
    
    // Añadir mensaje al buffer con timestamp
    buffer.messages.push({
      ...message,
      receivedAt: Date.now()
    });
    
    // Cancelar timer anterior si existe
    if (buffer.timer) {
      clearTimeout(buffer.timer);
    }
    
    // Si ya hay un resolver pendiente, lo reemplazamos
    buffer.resolver = resolve;
    
    // Crear nuevo timer
    buffer.timer = setTimeout(() => {
      const messages = [...buffer.messages];
      const resolver = buffer.resolver;
      
      // Limpiar buffer
      pendingMessages.delete(userId);
      
      // Resolver con los mensajes agregados
      resolver({
        shouldProcess: true,
        messages: messages,
        aggregatedContent: aggregateMessages(messages),
        messageCount: messages.length
      });
    }, AGGREGATION_WINDOW_MS);
  });
}

/**
 * Combina múltiples mensajes en contenido unificado para GPT
 * @param {Object[]} messages - Array de mensajes
 * @returns {string} - Contenido combinado
 */
function aggregateMessages(messages) {
  if (messages.length === 1) {
    return messages[0].body || getMediaIndicator(messages[0]);
  }
  
  // Combinar mensajes con indicadores
  const parts = messages.map((m, i) => {
    let content = m.body || "";
    
    // Añadir indicador de media si aplica
    if (m.hasAudio && !content) content = "[Audio]";
    if (m.hasImage && !content) content = "[Imagen]";
    if (m.hasVideo && !content) content = "[Video]";
    if (m.hasSticker) content = "[Sticker]";
    
    // Si el mensaje tiene media Y texto, combinar
    if (m.hasAudio && m.body) content = `[Audio] ${m.body}`;
    if (m.hasImage && m.body) content = `[Imagen] ${m.body}`;
    
    return `[Mensaje ${i + 1}]: ${content}`;
  });
  
  return parts.join("\n");
}

/**
 * Obtiene indicador de media para un mensaje
 * @param {Object} message - Mensaje parseado
 * @returns {string}
 */
function getMediaIndicator(message) {
  if (message.hasAudio) return "[Audio]";
  if (message.hasImage) return "[Imagen]";
  if (message.hasVideo) return "[Video]";
  if (message.hasSticker) return "[Sticker]";
  return "";
}

/**
 * Cancela cualquier mensaje pendiente para un usuario
 * Útil para cleanup o cuando se necesita procesar inmediatamente
 * @param {string} userId
 */
export function cancelPendingMessages(userId) {
  if (pendingMessages.has(userId)) {
    const buffer = pendingMessages.get(userId);
    if (buffer.timer) {
      clearTimeout(buffer.timer);
    }
    pendingMessages.delete(userId);
  }
}

/**
 * Verifica si hay mensajes pendientes para un usuario
 * @param {string} userId
 * @returns {boolean}
 */
export function hasPendingMessages(userId) {
  return pendingMessages.has(userId);
}

/**
 * Obtiene estadísticas del agregador
 * @returns {Object}
 */
export function getAggregatorStats() {
  return {
    pendingUsers: pendingMessages.size,
    users: Array.from(pendingMessages.keys())
  };
}

export default {
  addMessageToBuffer,
  cancelPendingMessages,
  hasPendingMessages,
  getAggregatorStats
};
