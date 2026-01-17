/**
 * User State Service
 * Tracks user states with JSON persistence
 * 
 * States:
 * - NEW: First contact, never received welcome
 * - WELCOME_SENT: Received welcome, waiting for interest response
 * - WAITING_LIVE: Showed interest, waiting for live confirmation
 * - WAITING_QR_LINK: Did live, waiting for QR link confirmation
 * - COMPLETED: Fully onboarded
 * - ACTIVE: General conversation (fallback for old users)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERS_FILE = path.join(__dirname, "../data/users.json");

// User states
export const USER_STATES = {
  NEW: "NEW",
  WELCOME_SENT: "WELCOME_SENT",
  WAITING_LIVE: "WAITING_LIVE",
  WAITING_QR_LINK: "WAITING_QR_LINK",
  COMPLETED: "COMPLETED",
  ACTIVE: "ACTIVE"
};

// In-memory cache
let usersCache = {};

// =============================================================================
// PERSISTENCE
// =============================================================================

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, "utf-8");
      usersCache = JSON.parse(data);
      console.log(`📂 Usuarios cargados: ${Object.keys(usersCache).length}`);
    } else {
      usersCache = {};
      saveUsers();
    }
  } catch (error) {
    console.error("❌ Error cargando usuarios:", error.message);
    usersCache = {};
  }
}

function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersCache, null, 2));
  } catch (error) {
    console.error("❌ Error guardando usuarios:", error.message);
  }
}

// =============================================================================
// STATE FUNCTIONS
// =============================================================================

/**
 * Get user state
 * @param {string} userId
 * @returns {string} User state (NEW, WELCOME_SENT, or ACTIVE)
 */
export function getUserState(userId) {
  return usersCache[userId]?.state || USER_STATES.NEW;
}

/**
 * Check if user is new (never received welcome)
 */
export function isNewUser(userId) {
  return getUserState(userId) === USER_STATES.NEW;
}

/**
 * Check if user is waiting for interest response
 */
export function isWaitingForInterest(userId) {
  return getUserState(userId) === USER_STATES.WELCOME_SENT;
}

/**
 * Check if user is waiting for live confirmation
 */
export function isWaitingForLive(userId) {
  return getUserState(userId) === USER_STATES.WAITING_LIVE;
}

/**
 * Check if user is waiting for QR link confirmation
 */
export function isWaitingForQRLink(userId) {
  return getUserState(userId) === USER_STATES.WAITING_QR_LINK;
}

/**
 * Check if user is completed (fully onboarded)
 */
export function isCompleted(userId) {
  return getUserState(userId) === USER_STATES.COMPLETED;
}

/**
 * Check if user is active (use RAG)
 */
export function isActiveUser(userId) {
  return getUserState(userId) === USER_STATES.ACTIVE;
}

/**
 * Get full user data
 */
export function getUserData(userId) {
  return usersCache[userId] || {
    state: USER_STATES.NEW,
    name: null,
    firstContact: null,
    welcomeSentAt: null,
    interestedAt: null
  };
}

/**
 * Mark user as having received welcome (waiting for interest)
 */
export function markWelcomeSent(userId, name = null) {
  const existing = usersCache[userId] || {};
  
  usersCache[userId] = {
    ...existing,
    state: USER_STATES.WELCOME_SENT,
    name: name || existing.name,
    firstContact: existing.firstContact || new Date().toISOString(),
    welcomeSentAt: new Date().toISOString()
  };
  
  saveUsers();
  console.log(`✅ Usuario en WELCOME_SENT: ${userId}`);
}

/**
 * Mark user as waiting for live confirmation (after showing interest)
 */
export function markWaitingForLive(userId) {
  const existing = usersCache[userId] || {};
  
  usersCache[userId] = {
    ...existing,
    state: USER_STATES.WAITING_LIVE,
    interestedAt: new Date().toISOString()
  };
  
  saveUsers();
  console.log(`✅ Usuario en WAITING_LIVE: ${userId}`);
}

/**
 * Mark user as waiting for QR link confirmation (after completing live)
 */
export function markWaitingForQRLink(userId) {
  const existing = usersCache[userId] || {};
  
  usersCache[userId] = {
    ...existing,
    state: USER_STATES.WAITING_QR_LINK,
    liveCompletedAt: new Date().toISOString()
  };
  
  saveUsers();
  console.log(`✅ Usuario en WAITING_QR_LINK: ${userId}`);
}

/**
 * Mark user as completed (fully onboarded)
 */
export function markCompleted(userId) {
  const existing = usersCache[userId] || {};
  
  usersCache[userId] = {
    ...existing,
    state: USER_STATES.COMPLETED,
    completedAt: new Date().toISOString()
  };
  
  saveUsers();
  console.log(`✅ Usuario COMPLETED: ${userId}`);
}

/**
 * Mark user as active (general conversation state)
 */
export function markAsActive(userId, showedInterest = false) {
  const existing = usersCache[userId] || {};
  
  usersCache[userId] = {
    ...existing,
    state: USER_STATES.ACTIVE,
    interestedAt: showedInterest ? new Date().toISOString() : existing.interestedAt
  };
  
  saveUsers();
  console.log(`✅ Usuario ACTIVE: ${userId} (interés: ${showedInterest})`)
}

/**
 * Reset user to NEW state (for testing)
 */
export function resetUser(userId) {
  if (usersCache[userId]) {
    usersCache[userId].state = USER_STATES.NEW;
    usersCache[userId].welcomeSentAt = null;
    usersCache[userId].interestedAt = null;
    saveUsers();
    console.log(`🔄 Usuario reseteado: ${userId}`);
    return true;
  }
  return false;
}

/**
 * Get users summary
 */
export function getUsersSummary() {
  const users = Object.entries(usersCache);
  const newUsers = users.filter(([_, u]) => u.state === USER_STATES.NEW).length;
  const waitingUsers = users.filter(([_, u]) => u.state === USER_STATES.WELCOME_SENT).length;
  const activeUsers = users.filter(([_, u]) => u.state === USER_STATES.ACTIVE).length;
  
  return {
    total: users.length,
    new: newUsers,
    waiting: waitingUsers,
    active: activeUsers,
    users: usersCache
  };
}

/**
 * Initialize service
 */
export function initUserState() {
  loadUsers();
}

export default {
  USER_STATES,
  getUserState,
  isNewUser,
  isWaitingForInterest,
  isWaitingForLive,
  isWaitingForQRLink,
  isCompleted,
  isActiveUser,
  getUserData,
  markWelcomeSent,
  markWaitingForLive,
  markWaitingForQRLink,
  markCompleted,
  markAsActive,
  resetUser,
  getUsersSummary,
  initUserState
};
