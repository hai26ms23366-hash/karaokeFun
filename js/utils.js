/**
 * Utility functions for Karaoke MVP
 */

/**
 * Gets the base URL for the current deployment.
 * Essential for GitHub Pages where the app might be in a subfolder like /KaraokeFun/
 * @returns {string} The base URL ending without a slash
 */
export function getBaseUrl() {
    // window.location.pathname could be "/KaraokeFun/tv.html" or "/"
    // We want to find the directory path.
    const path = window.location.pathname;
    let directory = path.substring(0, path.lastIndexOf('/'));
    if (!directory) {
        directory = '';
    }
    return window.location.origin + directory;
}

/**
 * Generates a random room code
 * @param {number} length 
 * @returns {string}
 */
export function generateRoomCode(length = 6) {
    const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed similar looking chars (O, 0, 1, I)
    let result = "";
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charset.length);
        result += charset[randomIndex];
    }
    return result;
}

/**
 * Simple debounce function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Rate limit / throttle function to prevent spamming commands
 */
export function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}
