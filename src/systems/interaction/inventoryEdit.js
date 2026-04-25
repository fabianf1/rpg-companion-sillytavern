/**
 * Inventory Item Editing Module
 * Handles inline editing of inventory item names
 */

import { extensionSettings } from '../../core/state.js';
import { saveChatData, updateMessageSwipeData } from '../../core/persistence.js';
import { buildInventorySummary } from '../generation/promptBuilder.js';
import { getTrackerDataForContext } from '../generation/promptBuilder.js';
import { renderInventory } from '../rendering/inventory.js';
import { sanitizeItemName } from '../../utils/security.js';

/**
 * Helper to get inventory from tracker data (handles both flat and object formats)
 * @returns {Object} Inventory object
 */
function getInventoryFromTracker() {
    const trackerData = getTrackerDataForContext('userStats');
    if (!trackerData) return { onPerson: [], clothing: [], stored: {}, assets: {} };
    
    // Get inventory from tracker data
    if (trackerData.inventory) {
        return trackerData.inventory;
    }
    
    // Try object format (onPerson, clothing, stored, assets)
    return {
        onPerson: trackerData.onPerson || [],
        clothing: trackerData.clothing || [],
        stored: trackerData.stored || {},
        assets: trackerData.assets || {}
    };
}

/**
 * Updates an existing inventory item's name.
 * Validates, sanitizes, and persists the change.
 *
 * @param {string} field - Field name ('onPerson', 'stored', 'assets')
 * @param {number} index - Index of item in the array
 * @param {string} newName - New name for the item
 * @param {string} [location] - Location name (required for 'stored' field)
 */
export function updateInventoryItem(field, index, newName, location) {
    const inventory = getInventoryFromTracker();

    // Validate and sanitize the new item name
    const sanitizedName = sanitizeItemName(newName);
    if (!sanitizedName) {
        console.warn('[RPG Companion] Invalid item name, reverting change');
        // Re-render to revert the change in UI
        renderInventory();
        return;
    }

    // Get current items for the field as array
    let currentItems;
    if (field === 'stored') {
        if (!location) {
            console.error('[RPG Companion] Location required for stored items');
            return;
        }
        currentItems = inventory.stored[location] || [];
    } else {
        currentItems = inventory[field] || [];
    }

    // Ensure we have an array
    if (!Array.isArray(currentItems)) {
        currentItems = [];
    }

    // Validate index
    if (index < 0 || index >= currentItems.length) {
        console.error(`[RPG Companion] Invalid item index: ${index}`);
        return;
    }

    // Update the item at this index (preserve quantity if it exists)
    const currentItem = currentItems[index];
    if (typeof currentItem === 'object' && currentItem !== null) {
        currentItems[index] = { name: sanitizedName, quantity: currentItem.quantity || 1 };
    } else {
        currentItems[index] = { name: sanitizedName, quantity: 1 };
    }

    // Update the inventory with array
    if (field === 'stored') {
        inventory.stored[location] = currentItems;
    } else {
        inventory[field] = currentItems;
    }

    // Update tracker data with modified inventory
    const trackerData = getTrackerDataForContext('userStats') || {};
    trackerData.inventory = inventory;
    updateMessageSwipeData('userStats', trackerData);
    
    // Save to swipe store directly
    saveChatData();

    // Re-render inventory
    renderInventory();
}

/**
 * Updates the user stats in the swipe store to include current inventory.
 * Maintains JSON format if current data is JSON, otherwise uses text format.
 * This ensures manual edits are immediately visible to AI in next generation.
 * @private
 */
function updateSwipeStoreInventory() {
    // Read current user stats from swipe store
    const currentData = getTrackerDataForContext('userStats');
    
    if (currentData) {
        // Check if data is in JSON format (object or JSON string)
        const isJSON = typeof currentData === 'object' || (typeof currentData === 'string' && (currentData.trim().startsWith('{') || currentData.trim().startsWith('[')));
        
        if (isJSON) {
            // Maintain JSON format
            try {
                // Ensure we have an object to work with
                const jsonData = typeof currentData === 'object' ? currentData : JSON.parse(currentData);
                if (jsonData && typeof jsonData === 'object') {
                    // Update inventory in JSON
                    const stats = getTrackerDataForContext('userStats');

                    // Convert inventory back to v3 format (arrays of {name, quantity})
                    const convertToV3Items = (itemString) => {
                        if (!itemString) return [];
                        const items = itemString.split(',').map(s => s.trim()).filter(s => s);
                        return items.map(item => {
                            const qtyMatch = item.match(/^(\d+)x\s+(.+)$/);
                            if (qtyMatch) {
                                return { name: qtyMatch[2].trim(), quantity: parseInt(qtyMatch[1]) };
                            }
                            return { name: item, quantity: 1 };
                        });
                    };

                    jsonData.inventory = {
                        onPerson: convertToV3Items(stats.inventory.onPerson),
                        clothing: convertToV3Items(stats.inventory.clothing),
                        stored: stats.inventory.stored || {},
                        assets: convertToV3Items(stats.inventory.assets)
                    };

                    // Persist to swipe store as object
                    updateMessageSwipeData('userStats', jsonData);
                    return;
                }
            } catch (e) {
                console.warn('[RPG Companion] Failed to parse JSON, falling back to text format:', e);
            }
        }
    }

    // Fall back to text format
    const stats = getTrackerDataForContext('userStats');
    const inventorySummary = buildInventorySummary(stats.inventory);
    const statsText =
        `Health: ${stats.health}%\n` +
        `Satiety: ${stats.satiety}%\n` +
        `Energy: ${stats.energy}%\n` +
        `Hygiene: ${stats.hygiene}%\n` +
        `Arousal: ${stats.arousal}%\n` +
        `${stats.mood}: ${stats.conditions}\n` +
        `${inventorySummary}`;
    
    // Persist to swipe store
    updateMessageSwipeData('userStats', statsText);
}
