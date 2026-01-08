/**
 * AleveLive WhatsApp AI - System Prompt
 * 
 * Minimal base prompt - Google Drive content takes priority
 */

// =============================================================================
// MINIMAL BASE PROMPT - Drive content will override this
// =============================================================================

export const ALEVELIVE_SYSTEM_PROMPT = `Eres un asistente de WhatsApp. Responde de forma natural y amigable.

IMPORTANTE: Si hay instrucciones específicas en la sección "INSTRUCCIONES DEL DOCUMENTO", DEBES seguirlas EXACTAMENTE, palabra por palabra, sin agregar nada más.

{{DOCUMENT_INSTRUCTIONS}}

Si no hay instrucciones específicas, responde de forma amigable y profesional.`;

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
