/**
 * OpenAI Service Module
 * Handles text generation, image analysis (GPT-4o Vision), and audio transcription (Whisper)
 */

import axios from "axios";
import FormData from "form-data";

const OPENAI_BASE_URL = "https://api.openai.com/v1";

// Get API key at runtime (after dotenv has loaded)
const getApiKey = () => process.env.OPENAI_API_KEY;

/**
 * Transcribe audio using OpenAI Whisper API
 * @param {Buffer} audioBuffer - Audio file buffer
 * @param {string} filename - Original filename with extension
 * @returns {Promise<string>} Transcribed text
 */
export async function transcribeAudio(audioBuffer, filename = "audio.ogg") {
  console.log("🎵 Transcribiendo audio con Whisper...");
  
  const formData = new FormData();
  formData.append("file", audioBuffer, {
    filename: filename,
    contentType: "audio/ogg",
  });
  formData.append("model", "whisper-1");
  formData.append("language", "es"); // Spanish by default, Whisper auto-detects if needed

  try {
    const response = await axios.post(
      `${OPENAI_BASE_URL}/audio/transcriptions`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${getApiKey()}`,
          ...formData.getHeaders(),
        },
        timeout: 30000,
      }
    );

    console.log("✅ Audio transcrito:", response.data.text);
    return response.data.text;
  } catch (error) {
    console.error("❌ Error transcribiendo audio:", error.response?.data || error.message);
    throw new Error("No pude escuchar el audio correctamente. ¿Podrías escribirme?");
  }
}

/**
 * Generate AI response using GPT-4o with optional image
 * @param {Array} messages - Conversation messages array
 * @param {string|null} imageUrl - Optional Base64 image URL for vision
 * @returns {Promise<string>} AI response
 */
export async function generateResponse(messages, imageUrl = null) {
  console.log("🤖 Generando respuesta con GPT-4o...");

  // Build the user content with optional image
  const lastUserMessage = messages[messages.length - 1];
  
  if (imageUrl) {
    // Multimodal request with image
    lastUserMessage.content = [
      {
        type: "text",
        text: lastUserMessage.content,
      },
      {
        type: "image_url",
        image_url: {
          url: imageUrl,
          detail: "low", // Use low detail for faster processing
        },
      },
    ];
  }

  try {
    const response = await axios.post(
      `${OPENAI_BASE_URL}/chat/completions`,
      {
        model: "gpt-4o",
        messages: messages,
        max_tokens: 500,
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${getApiKey()}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    const reply = response.data.choices[0]?.message?.content || "";
    console.log("✅ Respuesta GPT-4o:", reply);
    return reply;
  } catch (error) {
    console.error("❌ Error generando respuesta:", error.response?.data || error.message);
    throw new Error("Hubo un problema procesando tu mensaje. ¿Podrías intentarlo de nuevo?");
  }
}

/**
 * Analyze image and generate description context
 * @param {string} imageBase64Url - Base64 encoded image with data URL prefix
 * @returns {Promise<string>} Image description
 */
export async function analyzeImage(imageBase64Url) {
  console.log("📸 Analizando imagen con GPT-4o Vision...");

  try {
    const response = await axios.post(
      `${OPENAI_BASE_URL}/chat/completions`,
      {
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Describe brevemente esta imagen en español en máximo 50 palabras. Sé conciso.",
              },
              {
                type: "image_url",
                image_url: {
                  url: imageBase64Url,
                  detail: "low",
                },
              },
            ],
          },
        ],
        max_tokens: 150,
      },
      {
        headers: {
          Authorization: `Bearer ${getApiKey()}`,
          "Content-Type": "application/json",
        },
        timeout: 20000,
      }
    );

    const description = response.data.choices[0]?.message?.content || "una imagen";
    console.log("✅ Descripción de imagen:", description);
    return description;
  } catch (error) {
    console.error("❌ Error analizando imagen:", error.response?.data || error.message);
    return "una imagen (no pude analizarla en detalle)";
  }
}

export default {
  transcribeAudio,
  generateResponse,
  analyzeImage,
};
