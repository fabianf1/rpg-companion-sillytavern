/**
 * Format Utilities Module
 * Provides common formatting functions for display values
 */

/**
 * Converts temperature between Celsius and Fahrenheit.
 *
 * @param {number} value - Temperature value to convert
 * @param {string} from - Source unit ("C" or "F")
 * @param {string} to - Target unit ("C" or "F")
 * @returns {number} Converted temperature value (rounded to nearest integer)
 *
 * @example
 * convertTemperature(0, "C", "F") // Returns: 32
 * convertTemperature(100, "C", "F") // Returns: 212
 * convertTemperature(32, "F", "C") // Returns: 0
 * convertTemperature(212, "F", "C") // Returns: 100
 */
export function convertTemperature(value, from, to) {
    if (from === to) return value;
    if (from === "C" && to === "F") {
        return Math.round((value * 9) / 5 + 32);
    }
    if (from === "F" && to === "C") {
        return Math.round(((value - 32) * 5) / 9);
    }
    return value;
}
