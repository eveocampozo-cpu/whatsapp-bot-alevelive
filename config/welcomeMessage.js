/**
 * Welcome Message Configuration
 * Customize messages sent during the onboarding flow
 */

// Agency TikTok link
export const AGENCY_LINK = "https://www.tiktok.com/@aleve.live.agency?is_from_webapp=1&sender_device=pc";

// =============================================================================
// WELCOME MESSAGES (First contact)
// =============================================================================

/**
 * Build initial welcome message (before first audio)
 */
export function buildWelcomeMessage(userName = null) {
  const greeting = userName 
    ? `Holaaa ${userName}! 💖` 
    : "Holaaa linda! 💖";

  return `${greeting}

Te voy a enviar el link de la agencia para que puedas revisarlo tú misma con calma y tengas más confianza 😊

También te enviaré un audio explicándote todo el proceso para que te quede súper claro!

👇 Este es el link de la agencia:
${AGENCY_LINK}`;
}

/**
 * Message sent after first audio
 */
export const STREAMER_MESSAGE = "Yo soy streamer y quien da las capacitaciones..";

/**
 * Question to gauge interest
 */
export const INTEREST_QUESTION = "te gustaría aprender? 💖";

// =============================================================================
// AUDIO URLS
// =============================================================================

/**
 * Get welcome audio URL (first audio)
 */
export function getWelcomeAudioUrl() {
  const baseUrl = process.env.BASE_URL;
  if (!baseUrl) {
    console.warn("⚠️ BASE_URL no configurada, no se enviará audio");
    return null;
  }
  return `${baseUrl}/media/audio_bienvenida.ogg`;
}

/**
 * Get interest audio URL (second audio, sent when user shows interest)
 */
export function getInterestAudioUrl() {
  const baseUrl = process.env.BASE_URL;
  if (!baseUrl) {
    console.warn("⚠️ BASE_URL no configurada, no se enviará audio de interés");
    return null;
  }
  return `${baseUrl}/media/audio_interes.ogg`;
}

// =============================================================================
// INTEREST DETECTION PROMPT (for GPT)
// =============================================================================

/**
 * Prompt to ask GPT if user showed interest
 */
export const INTEREST_DETECTION_PROMPT = `Analiza el mensaje del usuario y determina si muestra interés en aprender o unirse.

Responde SOLO con "SI" o "NO".

- "SI" si el usuario muestra interés (quiere aprender, dice sí, acepta, muestra entusiasmo, hace preguntas sobre cómo empezar)
- "NO" si el usuario no muestra interés claro, rechaza, o hace preguntas que no indican interés directo

Mensaje del usuario: "{{MESSAGE}}"

Respuesta (SI o NO):`;

export default {
  AGENCY_LINK,
  STREAMER_MESSAGE,
  INTEREST_QUESTION,
  INTEREST_DETECTION_PROMPT,
  buildWelcomeMessage,
  getWelcomeAudioUrl,
  getInterestAudioUrl
};
