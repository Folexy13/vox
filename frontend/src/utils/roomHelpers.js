/**
 * Room Helper Utilities
 * Functions for room code generation and sharing
 */

/**
 * Generate a random room code
 * @param {number} length - Length of the room code
 * @returns {string} Random room code
 */
export function generateRoomCode(length = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a shareable room link
 * @param {string} roomId - Room ID
 * @returns {string} Full URL to join the room
 */
export function generateRoomLink(roomId) {
  const baseUrl = window.location.origin;
  return `${baseUrl}/setup/${roomId}`;
}

/**
 * Extract room ID from a URL or string
 * @param {string} input - URL or room ID
 * @returns {string} Extracted room ID
 */
export function extractRoomId(input) {
  if (!input) return '';
  
  // Remove whitespace
  let cleaned = input.trim();
  
  // If it's a URL, extract the room ID
  if (cleaned.includes('/')) {
    const parts = cleaned.split('/');
    cleaned = parts[parts.length - 1];
  }
  
  // Remove query parameters
  if (cleaned.includes('?')) {
    cleaned = cleaned.split('?')[0];
  }
  
  // Remove hash
  if (cleaned.includes('#')) {
    cleaned = cleaned.split('#')[0];
  }
  
  return cleaned;
}

/**
 * Copy room link to clipboard
 * @param {string} roomId - Room ID
 * @returns {Promise<boolean>} True if successful
 */
export async function copyRoomLink(roomId) {
  const link = generateRoomLink(roomId);
  
  try {
    await navigator.clipboard.writeText(link);
    return true;
  } catch (err) {
    console.error('Failed to copy link:', err);
    
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = link;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    
    try {
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    } catch (e) {
      document.body.removeChild(textArea);
      return false;
    }
  }
}

/**
 * Share room link using Web Share API
 * @param {string} roomId - Room ID
 * @param {string} title - Share title
 * @returns {Promise<boolean>} True if successful
 */
export async function shareRoomLink(roomId, title = 'Join my Vox call') {
  const link = generateRoomLink(roomId);
  
  if (navigator.share) {
    try {
      await navigator.share({
        title: title,
        text: 'Join my real-time translated voice call on Vox',
        url: link,
      });
      return true;
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Share failed:', err);
      }
      return false;
    }
  } else {
    // Fallback to copy
    return copyRoomLink(roomId);
  }
}

/**
 * Validate room ID format
 * @param {string} roomId - Room ID to validate
 * @returns {boolean} True if valid
 */
export function isValidRoomId(roomId) {
  if (!roomId || typeof roomId !== 'string') return false;
  
  // Room ID should be 6-12 alphanumeric characters
  const pattern = /^[a-zA-Z0-9]{6,12}$/;
  return pattern.test(roomId);
}

export default {
  generateRoomCode,
  generateRoomLink,
  extractRoomId,
  copyRoomLink,
  shareRoomLink,
  isValidRoomId,
};
