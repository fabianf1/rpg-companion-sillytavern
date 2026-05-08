/**
 * Inventory Formatter Module
 * Handles formatting of inventory data for AI prompt context
 */

// ============================================================================
// INVENTORY ITEM FORMATTING
// ============================================================================

/**
 * Converts an inventory item object to a display string
 * @param {Object} item - Inventory item object with name and optional quantity
 * @returns {string} Formatted item string (e.g., "Sword" or "3x Potions")
 */
function inventoryItemToString(item) {
	if (!item?.name) return "";
	if (item.quantity && item.quantity > 1) {
		return `${item.quantity}x ${item.name}`;
	}
	return item.name;
}

/**
 * Converts an array of inventory items to a comma-separated string
 * @param {Array} items - Array of inventory item objects
 * @returns {string} Comma-separated string of items, or 'None' if empty
 */
function inventoryArrayToString(items) {
	if (!Array.isArray(items) || items.length === 0) {
		return "None";
	}
	return items.map(inventoryItemToString).join(", ");
}

// ============================================================================
// INVENTORY SUMMARY
// ============================================================================

/**
 * Builds a formatted inventory summary for AI context injection.
 * Converts v2 inventory structure to multi-line plaintext format.
 *
 * @param {InventoryV2|string} inventory - Current inventory (v2 or legacy string)
 * @returns {string} Formatted inventory summary for prompt injection
 * @example
 * // v2 input: { onPerson: [{name: "Sword"}], stored: { Home: [{name: "Gold"}] }, assets: [{name: "Horse"}], version: 2 }
 * // Returns: "On Person: Sword\nStored - Home: Gold\nAssets: Horse"
 */
export function buildInventorySummary(inventory) {
	// Handle legacy v1 string format
	if (typeof inventory === "string") {
		return inventory;
	}

	// Handle v2 object format (array-based)
	let summary = "";

	// Add On Person section
	if (inventory.onPerson) {
		const onPersonStr = inventoryArrayToString(inventory.onPerson);
		if (onPersonStr !== "None") {
			summary += `On Person: ${onPersonStr}\n`;
		}
	}

	// Add Clothing section
	if (inventory.clothing) {
		const clothingStr = inventoryArrayToString(inventory.clothing);
		if (clothingStr !== "None") {
			summary += `Clothing: ${clothingStr}\n`;
		}
	}

	// Add Stored sections for each location
	if (inventory.stored && Object.keys(inventory.stored).length > 0) {
		for (const [location, items] of Object.entries(inventory.stored)) {
			if (Array.isArray(items)) {
				const itemsStr = inventoryArrayToString(items);
				if (itemsStr !== "None") {
					summary += `Stored - ${location}: ${itemsStr}\n`;
				}
			}
		}
	}

	// Add Assets section
	if (inventory.assets) {
		const assetsStr = inventoryArrayToString(inventory.assets);
		if (assetsStr !== "None") {
			summary += `Assets: ${assetsStr}`;
		}
	}

	return summary.trim();
}
