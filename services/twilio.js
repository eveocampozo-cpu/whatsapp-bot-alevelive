/**
 * Twilio Service Module
 * Handles media download and message parsing for WhatsApp webhooks
 */

import axios from "axios";

// Get credentials at runtime (after dotenv has loaded)
const getAccountSid = () => process.env.TWILIO_ACCOUNT_SID;
const getAuthToken = () => process.env.TWILIO_AUTH_TOKEN;

/**
 * Download media from Twilio with authentication
 * @param {string} mediaUrl - Twilio media URL
 * @returns {Promise<{buffer: Buffer, contentType: string}>} Media buffer and content type
 */
export async function downloadMedia(mediaUrl) {
  console.log("📥 Descargando media de Twilio:", mediaUrl);

  const accountSid = getAccountSid();
  const authToken = getAuthToken();

  if (!accountSid || !authToken) {
    throw new Error("Credenciales de Twilio no configuradas");
  }

  try {
    const response = await axios.get(mediaUrl, {
      auth: {
        username: accountSid,
        password: authToken,
      },
      responseType: "arraybuffer",
      timeout: 30000,
    });

    console.log("✅ Media descargada, tamaño:", response.data.length, "bytes");
    
    return {
      buffer: Buffer.from(response.data),
      contentType: response.headers["content-type"],
    };
  } catch (error) {
    console.error("❌ Error descargando media:", error.message);
    throw new Error("No pude descargar el archivo multimedia");
  }
}

/**
 * Parse incoming WhatsApp message from Twilio webhook
 * @param {Object} body - Request body from Twilio webhook
 * @returns {Object} Parsed message data
 */
export function parseIncomingMessage(body) {
  const numMedia = parseInt(body.NumMedia || "0", 10);
  const mediaItems = [];

  // Collect all media items
  for (let i = 0; i < numMedia; i++) {
    mediaItems.push({
      url: body[`MediaUrl${i}`],
      contentType: body[`MediaContentType${i}`],
    });
  }

  return {
    // Basic message info
    messageSid: body.MessageSid,
    from: body.From,
    to: body.To,
    body: body.Body || "",
    
    // Media info
    numMedia: numMedia,
    mediaItems: mediaItems,
    
    // WhatsApp specific
    profileName: body.ProfileName,
    waId: body.WaId,
    
    // Helper flags
    hasMedia: numMedia > 0,
    hasAudio: mediaItems.some(m => m.contentType?.startsWith("audio/")),
    hasImage: mediaItems.some(m => m.contentType?.startsWith("image/")),
    hasVideo: mediaItems.some(m => m.contentType?.startsWith("video/")),
  };
}

/**
 * Get the first media item of a specific type
 * @param {Object} parsedMessage - Parsed message from parseIncomingMessage
 * @param {string} type - Media type prefix (e.g., "audio/", "image/")
 * @returns {Object|null} Media item or null
 */
export function getMediaByType(parsedMessage, type) {
  return parsedMessage.mediaItems.find(m => m.contentType?.startsWith(type)) || null;
}

/**
 * Convert buffer to base64 data URL
 * @param {Buffer} buffer - File buffer
 * @param {string} contentType - MIME type
 * @returns {string} Base64 data URL
 */
export function bufferToBase64Url(buffer, contentType) {
  const base64 = buffer.toString("base64");
  return `data:${contentType};base64,${base64}`;
}

export default {
  downloadMedia,
  parseIncomingMessage,
  getMediaByType,
  bufferToBase64Url,
};
