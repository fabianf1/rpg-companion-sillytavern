/**
 * Security Utilities Module
 * Handles input sanitization and validation to prevent security vulnerabilities
 */

import { parseItems } from './itemParser.js';

/**
 * List of dangerous property names that could cause prototype pollution
 * or shadow critical object methods.
 * @private
 */
const BLOCKED_PROPERTY_NAMES = [
    '__proto__',
    'constructor',
    'prototype',
    'toString',
    'valueOf',
    'hasOwnProperty',
    '__defineGetter__',
    '__defineSetter__',
    '__lookupGetter__',
    '__lookupSetter__'
];

/**
 * Validates and sanitizes storage location names.
 * Prevents prototype pollution and object property shadowing attacks.
 *
 * @param {string} name - Location name to validate
 * @returns {string|null} Sanitized location name or null if invalid/dangerous
 *
 * @example
 * sanitizeLocationName("Home") // "Home"
 * sanitizeLocationName("__proto__") // null (blocked, logs warning)
 * sanitizeLocationName("A".repeat(300)) // "AAA..." (truncated to 200 chars)
 */
export function sanitizeLocationName(name) {
    if (!name || typeof name !== 'string') {
        return null;
    }

    const trimmed = name.trim();

    // Empty check
    if (trimmed === '') {
        return null;
    }

    // Check for dangerous property names (case-insensitive)
    const lowerName = trimmed.toLowerCase();
    if (BLOCKED_PROPERTY_NAMES.some(blocked => lowerName === blocked.toLowerCase())) {
        console.warn(`[RPG Companion] Blocked dangerous location name: "${trimmed}"`);
        return null;
    }

    // Max length check (reasonable location name)
    const MAX_LOCATION_LENGTH = 200;
    if (trimmed.length > MAX_LOCATION_LENGTH) {
        console.warn(`[RPG Companion] Location name too long (${trimmed.length} chars), truncating to ${MAX_LOCATION_LENGTH}`);
        return trimmed.slice(0, MAX_LOCATION_LENGTH);
    }

    return trimmed;
}

/**
 * Validates and sanitizes item names.
 * Prevents excessively long item names that could cause DoS or UI issues.
 *
 * @param {string} name - Item name to validate
 * @returns {string|null} Sanitized item name or null if invalid
 *
 * @example
 * sanitizeItemName("Sword") // "Sword"
 * sanitizeItemName("") // null
 * sanitizeItemName("A".repeat(600)) // "AAA..." (truncated to 500 chars)
 */
export function sanitizeItemName(name) {
    if (!name || typeof name !== 'string') {
        return null;
    }

    const trimmed = name.trim();

    // Empty check
    if (trimmed === '' || trimmed.toLowerCase() === 'none') {
        return null;
    }

    // Max length check (reasonable item name with description)
    const MAX_ITEM_LENGTH = 500;
    if (trimmed.length > MAX_ITEM_LENGTH) {
        console.warn(`[RPG Companion] Item name too long (${trimmed.length} chars), truncating to ${MAX_ITEM_LENGTH}`);
        return trimmed.slice(0, MAX_ITEM_LENGTH);
    }

    return trimmed;
}

/**
 * Validates and cleans a stored inventory object.
 * Ensures all keys are safe property names and all values are arrays (new format).
 * Cleans items within each location (removes corrupted/dangerous items).
 * Preserves empty locations (with empty arrays) so users can add items later.
 * Prevents prototype pollution attacks via object keys.
 * Handles both legacy string format and new array format.
 *
 * @param {Object} stored - Raw stored inventory object
 * @returns {Object} Cleaned stored inventory object (always a plain object)
 *
 * @example
 * validateStoredInventory({ "Home": "Sword, Shield" })
 * // → { "Home": [{name: "Sword"}, {name: "Shield"}] }
 *
 * validateStoredInventory({ "Home": [{name: "Sword"}] })
 * // → { "Home": [{name: "Sword"}] }
 *
 * validateStoredInventory({ "Home": [{name: "Sword"}, {name: "__proto__"}] })
 * // → { "Home": [{name: "Sword"}] } (dangerous item removed, logged)
 *
 * validateStoredInventory({ "Home": [] })
 * // → { "Home": [] } (empty location preserved)
 *
 * validateStoredInventory({ "__proto__": "malicious" })
 * // → {} (dangerous key removed, logged)
 *
 * validateStoredInventory(null)
 * // → {} (invalid input, returns empty object)
 */
export function validateStoredInventory(stored) {
    // Handle invalid input
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
        return {};
    }

    const cleaned = {};

    // Validate each property
    for (const key in stored) {
        // Only check own properties (not inherited)
        if (!Object.prototype.hasOwnProperty.call(stored, key)) {
            continue;
        }

        // Sanitize the location name
        const sanitizedKey = sanitizeLocationName(key);
        if (!sanitizedKey) {
            // Key was invalid or dangerous, skip it
            continue;
        }

        const value = stored[key];
        let cleanedValue;

        // Handle both string format (legacy) and array format (new)
        if (typeof value === 'string') {
            // Legacy string format - parse and convert to array
            const items = parseItems(value);
            cleanedValue = items.map(item => ({ name: item, quantity: 1 }));
        } else if (Array.isArray(value)) {
            // New array format - validate each item
            cleanedValue = value.filter(item => {
                if (!item || typeof item !== 'object') {
                    console.warn(`[RPG Companion] Invalid item in stored inventory "${sanitizedKey}", skipping`);
                    return false;
                }
                if (!item.name || typeof item.name !== 'string') {
                    console.warn(`[RPG Companion] Item missing name in stored inventory "${sanitizedKey}", skipping`);
                    return false;
                }
                // Validate and sanitize item name
                const sanitizedItemName = sanitizeItemName(item.name);
                if (!sanitizedItemName) {
                    console.warn(`[RPG Companion] Invalid item name in stored inventory "${sanitizedKey}", skipping`);
                    return false;
                }
                // Create clean item object
                const cleanItem = { name: sanitizedItemName };
                if (item.quantity && typeof item.quantity === 'number') {
                    cleanItem.quantity = item.quantity;
                }
                return true;
            });
        } else {
            console.warn(`[RPG Companion] Invalid stored inventory value for location "${sanitizedKey}", skipping`);
            continue;
        }

        // Always keep the location (even if empty)
        cleaned[sanitizedKey] = cleanedValue;

        // Warn if we had to clean corrupted items
        const originalCount = typeof value === 'string' ? parseItems(value).length : (Array.isArray(value) ? value.length : 0);
        const cleanedCount = cleanedValue.length;
        if (cleanedCount < originalCount && originalCount > 0) {
            console.warn(`[RPG Companion] Cleaned corrupted items from location "${sanitizedKey}": ${originalCount} items → ${cleanedCount} items`);
        }
    }

    return cleaned;
}

/**
 * Maximum number of items allowed in a single inventory section.
 * Prevents DoS via extremely large item lists.
 * @constant {number}
 */
export const MAX_ITEMS_PER_SECTION = 500;
