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

/**
 * Get interest video URL (video with steps, sent after interest audio)
 */
export function getInterestVideoUrl() {
  const baseUrl = process.env.BASE_URL;
  if (!baseUrl) {
    console.warn("⚠️ BASE_URL no configurada, no se enviará video de pasos");
    return null;
  }
  return `${baseUrl}/media/video_pasos_live_compressed.mp4`;
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

// =============================================================================
// LIVE CONFIRMATION DETECTION PROMPT (for GPT)
// =============================================================================

/**
 * Prompt to ask GPT if user confirmed they completed the live
 */
export const LIVE_CONFIRMATION_PROMPT = `Analiza el mensaje del usuario y determina si está confirmando que YA HIZO o COMPLETÓ su primer live de 30 minutos.

Responde SOLO con "SI" o "NO".

- "SI" si el usuario confirma que ya hizo el live, completó el live, terminó el live, hizo los 30 minutos, etc.
- "NO" si el usuario hace preguntas, pide ayuda, menciona problemas, o habla de otra cosa que no sea confirmar que completó el live

Ejemplos de "SI": "ya hice el live", "listo ya terminé", "ya lo hice", "ya completé los 30 min", "ya hice mi primer live"
Ejemplos de "NO": "tengo una duda", "no me funciona", "cómo hago para...", "mañana lo hago", "cuánto dura?"

Mensaje del usuario: "{{MESSAGE}}"

Respuesta (SI o NO):`;

// =============================================================================
// QR LINK CONFIRMATION DETECTION PROMPT (for GPT)
// =============================================================================

/**
 * Prompt to ask GPT if user confirmed they linked via QR
 */
export const QR_LINK_CONFIRMATION_PROMPT = `Analiza el mensaje del usuario y determina si está confirmando que YA SE VINCULÓ a la agencia a través del código QR.

Responde SOLO con "SI" o "NO".

- "SI" si el usuario confirma que ya se vinculó, escaneó el QR, completó el registro, se unió a la agencia, etc.
- "NO" si el usuario hace preguntas, pide ayuda, menciona problemas, o habla de otra cosa

Ejemplos de "SI": "listo ya me vinculé", "ya escaneé el QR", "ya me registré", "listo", "ya quedó", "ya lo hice", "sí ya"
Ejemplos de "NO": "no me funciona", "cómo hago?", "no me aparece", "tengo un problema"

Mensaje del usuario: "{{MESSAGE}}"

Respuesta (SI o NO):`;

// =============================================================================
// QR IMAGES
// =============================================================================

/**
 * Get QR image URL
 */
export function getQRImageUrl() {
  const baseUrl = process.env.BASE_URL;
  if (!baseUrl) {
    console.warn("⚠️ BASE_URL no configurada, no se enviará imagen QR");
    return null;
  }
  return `${baseUrl}/media/imagen_QR.jpeg`;
}

/**
 * Get QR steps image URL
 */
export function getQRStepsImageUrl() {
  const baseUrl = process.env.BASE_URL;
  if (!baseUrl) {
    console.warn("⚠️ BASE_URL no configurada, no se enviará imagen de pasos QR");
    return null;
  }
  return `${baseUrl}/media/imagen_pasos_QR.jpeg`;
}

export default {
  AGENCY_LINK,
  STREAMER_MESSAGE,
  INTEREST_QUESTION,
  INTEREST_DETECTION_PROMPT,
  LIVE_CONFIRMATION_PROMPT,
  QR_LINK_CONFIRMATION_PROMPT,
  buildWelcomeMessage,
  getWelcomeAudioUrl,
  getInterestAudioUrl,
  getInterestVideoUrl,
  getQRImageUrl,
  getQRStepsImageUrl
};
