/**
 * OpenAI Service Module
 * Handles text generation, image analysis (GPT-4o Vision), and audio transcription (Whisper)
 * Enhanced with retry logic and optimized parameters
 */

import axios from "axios";
import FormData from "form-data";

const OPENAI_BASE_URL = "https://api.openai.com/v1";

// Get API key at runtime (after dotenv has loaded)
const getApiKey = () => process.env.OPENAI_API_KEY;

// Retry configuration
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Sleep helper for retry delays
 * @param {number} ms - Milliseconds to sleep
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry wrapper with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} retries - Number of retries
 * @param {number} delay - Base delay in ms
 */
async function withRetry(fn, retries = MAX_RETRIES, delay = BASE_DELAY_MS) {
  let lastError;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on 4xx errors (client errors)
      if (error.response?.status >= 400 && error.response?.status < 500) {
        throw error;
      }
      
      if (attempt < retries) {
        const waitTime = delay * Math.pow(2, attempt - 1);
        console.log(`⏳ Intento ${attempt}/${retries} falló. Reintentando en ${waitTime}ms...`);
        await sleep(waitTime);
      }
    }
  }
  
  throw lastError;
}

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

  return withRetry(async () => {
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
  });
}

/**
 * Generate AI response using GPT-4o with optional image
 * Enhanced with RAG context injection
 * 
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

  return withRetry(async () => {
    const response = await axios.post(
      `${OPENAI_BASE_URL}/chat/completions`,
      {
        model: "gpt-5.1",
        messages: messages,
        max_tokens: 400, // Optimized for WhatsApp (1600 char limit)
        temperature: 0.6, // Slightly lower for more consistent responses
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
    console.log("✅ Respuesta GPT-4o:", reply.substring(0, 100) + "...");
    return reply;
  });
}

/**
 * Analyze image and generate description context
 * @param {string} imageBase64Url - Base64 encoded image with data URL prefix
 * @returns {Promise<string>} Image description
 */
export async function analyzeImage(imageBase64Url) {
  console.log("📸 Analizando imagen con GPT-4o Vision...");

  return withRetry(async () => {
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
        temperature: 0.5,
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
  }).catch((error) => {
    console.error("❌ Error analizando imagen:", error.response?.data || error.message);
    return "una imagen (no pude analizarla en detalle)";
  });
}

export default {
  transcribeAudio,
  generateResponse,
  analyzeImage,
};
