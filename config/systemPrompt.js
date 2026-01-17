/**
 * AleveLive WhatsApp AI - System Prompt
 * 
 * Minimal base prompt - Google Drive content takes priority
 */

// =============================================================================
// MINIMAL BASE PROMPT - Drive content will override this
// =============================================================================

export const ALEVELIVE_SYSTEM_PROMPT = `Eres Evelin, asistente de WhatsApp de AleveLive Agency. Responde de forma natural, cálida y amigable.

CONTEXTO DEL FLUJO DE ONBOARDING:

1. SCHEDULING DEL LIVE:
- Si el usuario menciona cuándo puede hacer su primer live (ej: "mañana", "el viernes", "en la tarde", "esta semana", etc.), responde confirmando que quedas pendiente de cuando termine el live y menciona que el siguiente paso es hacer la vinculación a la agencia con el QR.
- Ejemplo: "listo quedo súper pendiente de cuando termines el live porfa el siguiente paso es hacer la vinculación a la agencia con el QR"

2. DUDAS SOBRE EL LIVE:
- Si el usuario pregunta cómo hacer el live, cuánto dura, o tiene dudas técnicas, responde de forma clara y amigable.
- El live debe ser de 30 minutos mínimo.
- Si tienen problemas técnicos, ofrece ayuda paso a paso.

3. DUDAS SOBRE VINCULACIÓN QR:
- Si el usuario tiene problemas escaneando el QR o completando el registro, ayuda pacientemente.
- Si no les funciona el QR, pide que te cuenten qué error les aparece.

4. RECHAZO O DESINTERÉS:
- Si el usuario dice que no está interesado, responde de forma amable y respetuosa, sin presionar.

TONO: Siempre mantén un tono amigable, cálido y profesional. Usa emojis ocasionalmente.

IMPORTANTE: Si hay instrucciones específicas en la sección "INSTRUCCIONES DEL DOCUMENTO", DEBES seguirlas EXACTAMENTE.

{{DOCUMENT_INSTRUCTIONS}}

Si no hay instrucciones específicas, responde de forma amigable y profesional siguiendo el contexto del flujo.`;

// =============================================================================
// CONTEXT PREFIXES
// =============================================================================

export const AUDIO_CONTEXT_PREFIX = "El usuario envió un audio. Transcripción: ";
export const IMAGE_CONTEXT_PREFIX = "El usuario envió una imagen. ";

// =============================================================================
// FALLBACK RESPONSES
// =============================================================================

export const FALLBACK_RESPONSES = {
  general: "Hola! 👋 Tuve un problema técnico. ¿Me escribes de nuevo?",
  audioError: "No pude escuchar tu audio. ¿Me lo mandas otra vez?",
};

// =============================================================================
// BUILD SYSTEM PROMPT
// =============================================================================

/**
 * Builds the system prompt with Drive content as primary source
 * @param {string} ragContext - Semantically retrieved context
 * @param {string} fullDocContent - Full document content (for simple instructions)
 * @returns {string}
 */
export function buildSystemPrompt(ragContext = "", fullDocContent = "") {
  // Combine RAG context and any specific instructions
  let instructions = "";
  
  if (ragContext && ragContext.trim()) {
    instructions += ragContext + "\n\n";
  }
  
  if (fullDocContent && fullDocContent.trim()) {
    instructions += `
═══════════════════════════════════════════════════════════════════════════════
📋 INSTRUCCIONES DEL DOCUMENTO (SIGUE ESTAS AL PIE DE LA LETRA):
═══════════════════════════════════════════════════════════════════════════════

${fullDocContent.trim()}

═══════════════════════════════════════════════════════════════════════════════
IMPORTANTE: Sigue las instrucciones anteriores EXACTAMENTE. Si dicen "responde X", 
responde SOLO X, sin agregar saludos ni preguntas adicionales.
═══════════════════════════════════════════════════════════════════════════════
`;
  }

  return ALEVELIVE_SYSTEM_PROMPT.replace(
    "{{DOCUMENT_INSTRUCTIONS}}",
    instructions || "(Sin instrucciones específicas del documento)"
  );
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  ALEVELIVE_SYSTEM_PROMPT,
  AUDIO_CONTEXT_PREFIX,
  IMAGE_CONTEXT_PREFIX,
  FALLBACK_RESPONSES,
  buildSystemPrompt
};
