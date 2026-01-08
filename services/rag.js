/**
 * RAG Service - Embeddings & Semantic Search
 * 
 * Full RAG implementation using OpenAI embeddings for semantic search
 */

import axios from "axios";
import fs from "fs";
import path from "path";

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const getApiKey = () => process.env.OPENAI_API_KEY;

// Vector store - in memory with file persistence
let vectorStore = {
  chunks: [],      // { id, text, embedding }
  lastIndexed: null,
  documentHash: null
};

const VECTOR_STORE_PATH = "./data/vector_store.json";

// =============================================================================
// EMBEDDINGS API
// =============================================================================

/**
 * Get embedding vector for text using OpenAI
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} - Embedding vector
 */
async function getEmbedding(text) {
  const response = await axios.post(
    `${OPENAI_BASE_URL}/embeddings`,
    {
      model: "text-embedding-3-small",
      input: text.substring(0, 8000) // Max input length
    },
    {
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        "Content-Type": "application/json"
      },
      timeout: 30000
    }
  );

  return response.data.data[0].embedding;
}

/**
 * Get embeddings for multiple texts (batch)
 * @param {string[]} texts - Array of texts
 * @returns {Promise<number[][]>} - Array of embedding vectors
 */
async function getEmbeddings(texts) {
  // Filter out empty texts and limit length
  const validTexts = texts
    .filter(t => t && t.trim().length > 0)
    .map(t => t.substring(0, 8000));

  if (validTexts.length === 0) return [];

  const response = await axios.post(
    `${OPENAI_BASE_URL}/embeddings`,
    {
      model: "text-embedding-3-small",
      input: validTexts
    },
    {
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        "Content-Type": "application/json"
      },
      timeout: 60000
    }
  );

  return response.data.data.map(d => d.embedding);
}

// =============================================================================
// CHUNKING
// =============================================================================

/**
 * Split document into meaningful chunks
 * Tries to split by Q&A pairs, paragraphs, or fixed size
 * @param {string} text - Full document text
 * @returns {string[]} - Array of chunks
 */
function chunkDocument(text) {
  const chunks = [];
  
  // Clean text
  text = text.replace(/\r\n/g, "\n").trim();
  
  if (text.length < 100) {
    return [text];
  }

  // Try to split by common FAQ patterns
  // Pattern 1: "Pregunta: ... Respuesta: ..."
  // Pattern 2: "¿...? R/ ..."
  // Pattern 3: Double newlines (paragraphs)
  
  // First try Q&A pattern with "¿"
  const qaPattern = /(?=¿[^?]+\?)/g;
  let parts = text.split(qaPattern).filter(p => p.trim().length > 20);
  
  if (parts.length > 3) {
    // Good split by questions
    chunks.push(...parts.map(p => p.trim()));
  } else {
    // Try splitting by double newlines
    parts = text.split(/\n\n+/).filter(p => p.trim().length > 20);
    
    if (parts.length > 3) {
      chunks.push(...parts.map(p => p.trim()));
    } else {
      // Fall back to fixed-size chunks (~500 chars)
      const words = text.split(/\s+/);
      let currentChunk = [];
      let currentLength = 0;
      
      for (const word of words) {
        currentChunk.push(word);
        currentLength += word.length + 1;
        
        if (currentLength > 500) {
          chunks.push(currentChunk.join(" "));
          currentChunk = [];
          currentLength = 0;
        }
      }
      
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(" "));
      }
    }
  }

  console.log(`📦 Documento dividido en ${chunks.length} chunks`);
  return chunks;
}

// =============================================================================
// VECTOR STORE MANAGEMENT
// =============================================================================

/**
 * Simple hash for change detection
 */
function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

/**
 * Save vector store to file
 */
function saveVectorStore() {
  try {
    const dir = path.dirname(VECTOR_STORE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(VECTOR_STORE_PATH, JSON.stringify(vectorStore, null, 2));
    console.log("💾 Vector store guardado");
  } catch (error) {
    console.error("❌ Error guardando vector store:", error.message);
  }
}

/**
 * Load vector store from file
 */
function loadVectorStore() {
  try {
    if (fs.existsSync(VECTOR_STORE_PATH)) {
      const data = fs.readFileSync(VECTOR_STORE_PATH, "utf-8");
      vectorStore = JSON.parse(data);
      console.log(`📂 Vector store cargado: ${vectorStore.chunks.length} chunks`);
      return true;
    }
  } catch (error) {
    console.error("❌ Error cargando vector store:", error.message);
  }
  return false;
}

/**
 * Index a document - create embeddings for all chunks
 * @param {string} documentText - Full document text
 * @returns {Promise<{success: boolean, chunks: number}>}
 */
export async function indexDocument(documentText) {
  console.log("🔄 Indexando documento para RAG...");
  
  const docHash = hashText(documentText);
  
  // Check if already indexed
  if (vectorStore.documentHash === docHash && vectorStore.chunks.length > 0) {
    console.log("✅ Documento ya indexado, sin cambios");
    return { success: true, chunks: vectorStore.chunks.length, cached: true };
  }

  try {
    // Chunk the document
    const chunks = chunkDocument(documentText);
    
    if (chunks.length === 0) {
      console.log("⚠️ No hay chunks para indexar");
      return { success: false, chunks: 0 };
    }

    console.log(`🧮 Generando embeddings para ${chunks.length} chunks...`);
    
    // Get embeddings for all chunks
    const embeddings = await getEmbeddings(chunks);
    
    // Build vector store
    vectorStore = {
      chunks: chunks.map((text, i) => ({
        id: i,
        text: text,
        embedding: embeddings[i]
      })),
      lastIndexed: new Date().toISOString(),
      documentHash: docHash
    };

    // Save to file
    saveVectorStore();

    console.log(`✅ Documento indexado: ${vectorStore.chunks.length} chunks`);
    return { success: true, chunks: vectorStore.chunks.length, cached: false };

  } catch (error) {
    console.error("❌ Error indexando documento:", error.message);
    throw error;
  }
}

// =============================================================================
// SEMANTIC SEARCH
// =============================================================================

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Search for relevant chunks based on query
 * @param {string} query - User's question
 * @param {number} topK - Number of results to return
 * @returns {Promise<{text: string, score: number}[]>}
 */
export async function searchRelevantChunks(query, topK = 3) {
  if (vectorStore.chunks.length === 0) {
    console.log("⚠️ Vector store vacío, no hay chunks para buscar");
    return [];
  }

  try {
    // Get embedding for query
    const queryEmbedding = await getEmbedding(query);
    
    // Calculate similarity with all chunks
    const results = vectorStore.chunks.map(chunk => ({
      text: chunk.text,
      score: cosineSimilarity(queryEmbedding, chunk.embedding)
    }));
    
    // Sort by score and return top K
    results.sort((a, b) => b.score - a.score);
    
    const topResults = results.slice(0, topK).filter(r => r.score > 0.3); // Min threshold
    
    console.log(`🔍 Búsqueda: "${query.substring(0, 50)}..." → ${topResults.length} resultados relevantes`);
    
    return topResults;
    
  } catch (error) {
    console.error("❌ Error en búsqueda semántica:", error.message);
    return [];
  }
}

/**
 * Get relevant context for a query (formatted for prompt injection)
 * @param {string} query - User's question
 * @param {number} topK - Number of chunks to include
 * @returns {Promise<string>}
 */
export async function getSemanticContext(query, topK = 3) {
  const results = await searchRelevantChunks(query, topK);
  
  if (results.length === 0) {
    return "";
  }

  const context = results
    .map((r, i) => `[Relevancia: ${(r.score * 100).toFixed(0)}%]\n${r.text}`)
    .join("\n\n---\n\n");

  return `
═══════════════════════════════════════════════════════════════════════════════
📚 INFORMACIÓN RELEVANTE ENCONTRADA EN LA BASE DE CONOCIMIENTO:
═══════════════════════════════════════════════════════════════════════════════

${context}

═══════════════════════════════════════════════════════════════════════════════
Usa esta información para responder de manera precisa.
═══════════════════════════════════════════════════════════════════════════════
  `.trim();
}

// =============================================================================
// INFO & MANAGEMENT
// =============================================================================

/**
 * Get RAG system info
 */
export function getRAGInfo() {
  return {
    indexed: vectorStore.chunks.length > 0,
    chunks: vectorStore.chunks.length,
    lastIndexed: vectorStore.lastIndexed,
    documentHash: vectorStore.documentHash
  };
}

/**
 * Clear the vector store
 */
export function clearRAG() {
  vectorStore = {
    chunks: [],
    lastIndexed: null,
    documentHash: null
  };
  
  try {
    if (fs.existsSync(VECTOR_STORE_PATH)) {
      fs.unlinkSync(VECTOR_STORE_PATH);
    }
  } catch (e) {}
  
  console.log("🗑️ RAG limpiado");
}

/**
 * Initialize RAG - load from file if exists
 */
export function initRAG() {
  loadVectorStore();
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  indexDocument,
  searchRelevantChunks,
  getSemanticContext,
  getRAGInfo,
  clearRAG,
  initRAG
};
