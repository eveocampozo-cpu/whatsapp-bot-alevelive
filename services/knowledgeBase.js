/**
 * AleveLive Knowledge Base - RAG System
 * 
 * Dynamic knowledge base that can be loaded from Google Docs
 * Provides context retrieval for AI responses
 */

// =============================================================================
// DEFAULT KNOWLEDGE BASE (fallback when Google Doc is empty/unavailable)
// =============================================================================

const DEFAULT_KNOWLEDGE_BASE = {
  capacitaciones: {
    keywords: ["capacitación", "capacitaciones", "entrenamientos", "formación", "aprender", "curso", "clases"],
    content: `
## CAPACITACIONES

📅 **Horarios**: Martes y jueves a las 7 PM (hora Colombia)
📢 **Anuncio**: Se publican en el grupo de WhatsApp 10 minutos antes
❓ **Preguntas**: Al finalizar se abre espacio para dudas

### ¿Son obligatorias?
No son obligatorias, pero SÍ muy recomendadas. Te ayudan a crecer y monetizar mejor.
    `.trim()
  },

  batallas: {
    keywords: ["batalla", "batallas", "vs", "versus", "competir", "pelear", "enfrentamiento"],
    content: `
## BATALLAS EN TIKTOK LIVE

### ¿Cuándo se activan?
Las batallas aparecen después de transmitir 3 veces en días CONSECUTIVOS.

### ¿Son obligatorias?
NO son obligatorias, pero son una ESTRATEGIA PODEROSA para crecer y que los donadores te apoyen más.
    `.trim()
  },

  ganancias: {
    keywords: ["ganar", "ganancias", "dinero", "pago", "pagar", "diamantes", "retirar", "retiro", "cuánto", "saldo", "banco", "bancaria", "vincular", "cobrar", "cobra"],
    content: `
## GANANCIAS EN TIKTOK LIVE

### ¿Cuánto puedo ganar?
- 🌱 Principiantes: $100-500 USD/mes
- 📈 Intermedios: $500-2,000 USD/mes  
- 🚀 Avanzados: $2,000-10,000+ USD/mes

### ¿La agencia se queda con algo?
❌ NO. Somos agencia verificada por TikTok, ellos nos pagan directamente.
✅ TODO lo que generes es 100% TUYO.

### ¿Cómo vinculo mi cuenta bancaria?
Perfil → Saldo → Saldo estimado → Recompensas live → Retirar → Añadir método de pago
    `.trim()
  },

  metas: {
    keywords: ["hora", "horas", "días", "metas", "objetivo", "objetivos", "requisito", "requisitos", "mínimo", "bonificación", "bonificar", "cumplir"],
    content: `
## METAS Y REQUISITOS

### ¿Cuántas horas debo hacer?
- TikTok exige: **60 horas al mes** mínimo
- Para bonificar: mínimo **20 días** y **60 horas** al mes
- Por día: mínimo **2 horas** recomendadas

### ⚠️ MUY IMPORTANTE:
Si haces menos de 1 hora por día, esos minutos NO se acumulan y el día NO cuenta.
    `.trim()
  },

  vinculacion: {
    keywords: ["unir", "unirme", "ingresar", "entrar", "interesada", "interesado", "cómo empiezo", "quiero ser", "formulario", "invitación", "aceptar"],
    content: `
## PROCESO PARA UNIRTE A ALEVELIVE

### Requisitos:
✅ Ser mayor de 18 años
✅ Tener al menos 50-1000 seguidores en TikTok
✅ 2-3 horas disponibles al día

### Pasos:
1. Llenar formulario de TikTok (datos básicos, TikTok revisa en ~24h)
2. Si nunca has hecho live, hacer uno de 30 minutos
3. Aceptar invitación de la agencia en notificaciones
4. ¡Listo! Recibir documento de bienvenida
    `.trim()
  },

  beneficios: {
    keywords: ["beneficio", "beneficios", "ventaja", "ventajas", "qué gano", "por qué unirme", "agencia"],
    content: `
## BENEFICIOS DE ALEVELIVE

✅ Bonificación por cumplimiento de metas
✅ Manager personal asignado
✅ Capacitaciones continuas
✅ Representación directa con TikTok Live
✅ Comunidad de creadores en WhatsApp
✅ Pases para perfil elite disponibles

### ¿La agencia cobra algo?
❌ NO cobramos NADA
❌ NO pedimos porcentaje
✅ Tus ganancias son 100% tuyas
    `.trim()
  },

  moderadores: {
    keywords: ["moderador", "moderadores", "mod", "mods", "añadir", "poner moderador"],
    content: `
## CÓMO PONER MODERADORES EN TU LIVE

1. En tu live, toca la foto de perfil del usuario
2. Click en los tres puntitos (arriba derecha)
3. Añadir moderador
4. Baja hasta "Gestiona a tus invitados"
5. Confirmar

⚠️ Elige a alguien de tu ENTERA CONFIANZA
    `.trim()
  },

  normas: {
    keywords: ["norma", "normas", "restricción", "restricciones", "prohibido", "advertencia", "suspender", "suspensión", "bloqueo"],
    content: `
## NORMAS DE TIKTOK LIVE

🚫 CONTENIDO PROHIBIDO:
- Nada sexual ni sugestivo
- Alcohol, drogas
- Violencia, armas
- Malas palabras, bullying
- Exceso de piel

⚠️ Si te suspenden:
TikTok Studio → LIVE → Herramientas → Normas y guías → Restricciones
Ahí puedes ver el motivo y apelar.
    `.trim()
  }
};

// =============================================================================
// DYNAMIC KNOWLEDGE BASE STATE
// =============================================================================

let currentKnowledgeBase = { ...DEFAULT_KNOWLEDGE_BASE };
let lastRefreshTime = null;
let refreshSource = "default";

// =============================================================================
// KNOWLEDGE BASE MANAGEMENT
// =============================================================================

/**
 * Update the knowledge base with new data from Google Docs
 * @param {Object} newKnowledgeBase - New KB structure
 * @param {string} source - Source identifier
 */
export function updateKnowledgeBase(newKnowledgeBase, source = "google_docs") {
  if (!newKnowledgeBase || Object.keys(newKnowledgeBase).length === 0) {
    console.log("⚠️ Knowledge base vacío, manteniendo el actual");
    return false;
  }

  currentKnowledgeBase = newKnowledgeBase;
  lastRefreshTime = new Date();
  refreshSource = source;
  
  console.log(`✅ Knowledge base actualizado desde ${source}`);
  console.log(`   Categorías: ${Object.keys(currentKnowledgeBase).join(", ")}`);
  
  return true;
}

/**
 * Reset to default knowledge base
 */
export function resetToDefault() {
  currentKnowledgeBase = { ...DEFAULT_KNOWLEDGE_BASE };
  lastRefreshTime = new Date();
  refreshSource = "default";
  console.log("🔄 Knowledge base reseteado a valores por defecto");
}

/**
 * Get metadata about current knowledge base
 */
export function getKnowledgeBaseInfo() {
  return {
    categories: Object.keys(currentKnowledgeBase),
    categoryCount: Object.keys(currentKnowledgeBase).length,
    lastRefresh: lastRefreshTime?.toISOString() || null,
    source: refreshSource
  };
}

// =============================================================================
// INTENT DETECTION
// =============================================================================

/**
 * Detecta las categorías relevantes basándose en keywords
 * @param {string} userMessage - Mensaje del usuario
 * @returns {string[]} - Array de categorías detectadas
 */
export function detectIntent(userMessage) {
  const message = userMessage.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const detectedCategories = [];

  for (const [category, data] of Object.entries(currentKnowledgeBase)) {
    for (const keyword of data.keywords) {
      const normalizedKeyword = keyword.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (message.includes(normalizedKeyword)) {
        if (!detectedCategories.includes(category)) {
          detectedCategories.push(category);
        }
        break;
      }
    }
  }

  return detectedCategories;
}

// =============================================================================
// CONTEXT RETRIEVAL
// =============================================================================

/**
 * Obtiene el contexto relevante del knowledge base
 * @param {string} userMessage - Mensaje del usuario
 * @param {number} maxCategories - Máximo de categorías a incluir
 * @returns {string} - Contexto combinado
 */
export function getRelevantContext(userMessage, maxCategories = 2) {
  const categories = detectIntent(userMessage);
  
  if (categories.length === 0) {
    return "";
  }

  const contexts = categories
    .slice(0, maxCategories)
    .map(cat => currentKnowledgeBase[cat]?.content || "")
    .filter(c => c.length > 0);

  if (contexts.length === 0) {
    return "";
  }

  return `
---
INFORMACIÓN RELEVANTE PARA ESTA PREGUNTA:
${contexts.join("\n\n---\n")}
---
  `.trim();
}

// =============================================================================
// EXPORTS
// =============================================================================

export const KNOWLEDGE_BASE = currentKnowledgeBase;

export default {
  KNOWLEDGE_BASE,
  detectIntent,
  getRelevantContext,
  updateKnowledgeBase,
  resetToDefault,
  getKnowledgeBaseInfo
};
