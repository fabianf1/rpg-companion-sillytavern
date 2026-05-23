/**
 * HTML Utilities Module
 * Provides safe HTML escaping to prevent XSS vulnerabilities
 */

/**
 * Escapes HTML special characters to prevent XSS attacks.
 * Uses DOM-based escaping for maximum compatibility.
 *
 * @param {string} text - Text to escape (can be null/undefined)
 * @returns {string} Escaped HTML string, or empty string if input is falsy
 *
 * @example
 * escapeHtml('<script>alert("xss")</script>')
 * // Returns: '&lt;script&gt;alert("xss")&lt;/script&gt;'
 *
 * @example
 * escapeHtml(null) // Returns: ''
 */
export function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}
