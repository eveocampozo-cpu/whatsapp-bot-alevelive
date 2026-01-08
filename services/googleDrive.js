/**
 * Google Drive Service
 * Fetches Google Docs content and integrates with RAG system
 */

import axios from "axios";
import { indexDocument, getRAGInfo, clearRAG, initRAG } from "./rag.js";

// =============================================================================
// CONFIGURATION
// =============================================================================

const getDocId = () => process.env.GOOGLE_DOC_ID;

// State for document content
let lastDocumentContent = "";
let lastFetchTime = null;

// =============================================================================
// FETCH DOCUMENT
// =============================================================================

/**
 * Fetch Google Doc content as plain text
 * @param {string} docId - Google Doc ID (optional)
 * @returns {Promise<string>} Text content
 */
export async function fetchGoogleDoc(docId = null) {
  const id = docId || getDocId();
  
  if (!id) {
    throw new Error("GOOGLE_DOC_ID no está configurado en .env");
  }

  const url = `https://docs.google.com/document/d/${id}/export?format=txt`;
  console.log("📄 Descargando documento de Google Docs...");
  
  try {
    const response = await axios.get(url, {
      timeout: 30000,
      responseType: "text"
    });

    const content = response.data?.trim() || "";
    console.log("✅ Documento descargado:", content.length, "caracteres");
    
    lastDocumentContent = content;
    lastFetchTime = new Date();
    
    return content;
  } catch (error) {
    console.error("❌ Error descargando documento:", error.message);
    
    if (error.response?.status === 401 || error.response?.status === 403) {
      throw new Error("Documento no compartido. Configúralo como 'Cualquier persona con el enlace'");
    }
    
    throw new Error(`Error descargando: ${error.message}`);
  }
}

// =============================================================================
// RAG INTEGRATION
// =============================================================================

/**
 * Load and index document from Google Docs
 * This is the main function to update the RAG system
 * @returns {Promise<{success: boolean, chunks: number, message: string}>}
 */
export async function loadAndIndexDocument() {
  try {
    // Fetch document
    const content = await fetchGoogleDoc();
    
    if (!content || content.length < 20) {
      return {
        success: false,
        chunks: 0,
        message: "Documento vacío o muy corto. Agrega más contenido."
      };
    }

    // Index for RAG
    const result = await indexDocument(content);
    
    return {
      success: result.success,
      chunks: result.chunks,
      cached: result.cached,
      message: result.cached 
        ? "Documento sin cambios, usando índice existente"
        : `Documento indexado: ${result.chunks} secciones`
    };

  } catch (error) {
    console.error("❌ Error en loadAndIndexDocument:", error.message);
    throw error;
  }
}

/**
 * Initialize from Google Docs on startup
 */
export async function initializeFromDrive() {
  // First, try to load existing vector store
  initRAG();
  
  const docId = getDocId();
  if (!docId) {
    console.log("⚠️ GOOGLE_DOC_ID no configurado, usando RAG existente o vacío");
    return;
  }

  try {
    console.log("🔄 Inicializando RAG desde Google Drive...");
    const result = await loadAndIndexDocument();
    console.log(`✅ ${result.message}`);
  } catch (error) {
    console.error("❌ Error inicializando desde Drive:", error.message);
    console.log("📚 Continuando con RAG existente o vacío");
  }
}

// =============================================================================
// INFO & STATE
// =============================================================================

/**
 * Get current document state
 */
export function getDocumentInfo() {
  const ragInfo = getRAGInfo();
  
  return {
    hasContent: lastDocumentContent.length > 0,
    contentLength: lastDocumentContent.length,
    lastFetch: lastFetchTime?.toISOString() || null,
    preview: lastDocumentContent.substring(0, 150) + (lastDocumentContent.length > 150 ? "..." : ""),
    rag: ragInfo
  };
}

/**
 * Get raw document content
 */
export function getDocumentContent() {
  return lastDocumentContent;
}

/**
 * Clear everything
 */
export function clearAll() {
  lastDocumentContent = "";
  lastFetchTime = null;
  clearRAG();
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  fetchGoogleDoc,
  loadAndIndexDocument,
  initializeFromDrive,
  getDocumentInfo,
  getDocumentContent,
  clearAll
};
