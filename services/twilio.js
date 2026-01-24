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
    
    // Reply context (available in Twilio production, may be missing in sandbox)
    isReply: !!body.OriginalRepliedMessageSid,
    originalRepliedMessageSid: body.OriginalRepliedMessageSid || null,
    originalRepliedMessageSender: body.OriginalRepliedMessageSender || null,
    
    // Helper flags
    hasMedia: numMedia > 0,
    hasAudio: mediaItems.some(m => m.contentType?.startsWith("audio/")),
    hasImage: mediaItems.some(m => m.contentType?.startsWith("image/")),
    hasVideo: mediaItems.some(m => m.contentType?.startsWith("video/")),
    hasSticker: mediaItems.some(m => m.contentType?.includes("webp")), // WhatsApp stickers are webp
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

/**
 * Send WhatsApp message via Twilio API (for sending additional messages/media)
 * @param {string} to - Recipient WhatsApp number (e.g., "whatsapp:+521234567890")
 * @param {string} body - Message text (can be empty if only sending media)
 * @param {string[]} mediaUrls - Optional array of public media URLs
 * @returns {Promise<Object>} Twilio message response
 */
export async function sendWhatsAppMessage(to, body, mediaUrls = []) {
  const accountSid = getAccountSid();
  const authToken = getAuthToken();
  let fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("Credenciales de Twilio no configuradas");
  }

  // Ensure from number has whatsapp: prefix
  if (!fromNumber.startsWith("whatsapp:")) {
    fromNumber = `whatsapp:${fromNumber}`;
  }

  console.log(`📤 Enviando mensaje a ${to}...`);
  console.log(`📤 Desde: ${fromNumber}`);

  try {
    // Build form data manually for proper serialization
    const params = new URLSearchParams();
    params.append("From", fromNumber);
    params.append("To", to);
    
    // Body is required by Twilio, use space if empty
    params.append("Body", body || " ");
    
    // Add each media URL separately (Twilio expects multiple MediaUrl params)
    if (mediaUrls && mediaUrls.length > 0) {
      mediaUrls.forEach(url => {
        params.append("MediaUrl", url);
      });
      console.log(`📎 Con media: ${mediaUrls.length} archivo(s)`);
    }

    const response = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      params.toString(),
      {
        auth: {
          username: accountSid,
          password: authToken,
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 30000,
      }
    );

    console.log(`✅ Mensaje enviado: ${response.data.sid}`);
    return response.data;
  } catch (error) {
    console.error("❌ Error enviando mensaje:", error.response?.data || error.message);
    throw error;
  }
}

export default {
  downloadMedia,
  parseIncomingMessage,
  getMediaByType,
  bufferToBase64Url,
  sendWhatsAppMessage,
};
