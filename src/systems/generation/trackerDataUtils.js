/**
 * Tracker Data Utilities Module
 * Handles retrieval of tracker data from chat messages and swipe stores.
 * Extracted from promptBuilder.js to break circular dependencies.
 */

import { getContext } from "../../../../../../extensions.js";
import { extensionSettings } from "../../core/state.js";

/**
 * Finds the last assistant message in a message array.
 * Used for determining which message should get current context vs historical context.
 *
 * @param {Array} messages - Array of chat messages
 * @returns {number} Index of the last assistant message, or -1 if not found
 */
export function findLastAssistantMessageIndex(messages) {
	for (let i = messages.length - 1; i >= 0; i--) {
		if (!messages[i].is_user && !messages[i].is_system) {
			return i;
		}
	}
	return -1;
}

/**
 * Reads tracker data from a specific swipe in a message.
 * Checks message.extra first (in-memory), then message.swipe_info (serialized on save).
 *
 * @param {Object} message - The chat message object
 * @param {number} swipeId - The swipe index to read
 * @returns {Object|null} The rpg_companion_swipes data for this swipe, or null
 */
export function getSwipeData(message, swipeId) {
	// Primary: in-memory extra (current session or after recent write)
	const fromExtra = message.extra?.rpg_companion_swipes?.[swipeId];
	if (fromExtra) return fromExtra;

	// Fallback: swipe_info (populated by ST when loading from disk)
	const fromSwipeInfo =
		message.swipe_info?.[swipeId]?.extra?.rpg_companion_swipes?.[swipeId];
	if (fromSwipeInfo) return fromSwipeInfo;

	return null;
}

/**
 * Reads tracker data from the authoritative swipe store.
 * Searches backward through chat to find the last assistant message with swipe data.
 *
 * @param {string} trackerKey - Which tracker to read: 'userStats', 'infoBox', or 'characterThoughts'
 * @param {Array} currentChat - The chat array to search (defaults to getContext().chat)
 * @returns {string|null} The tracker data for this key, or null if not found
 */
export function getTrackerDataForContext(trackerKey, currentChat = null) {
	const chatToSearch = currentChat || getContext().chat;
	if (!chatToSearch) return null;

	// Reset last tracker message at the beginning of context gathering
	extensionSettings.lastTrackerMessage = null;

	// Walk backward to find the last assistant message with swipe data
	for (let i = chatToSearch.length - 1; i >= 0; i--) {
		const message = chatToSearch[i];
		// Skip user and system messages
		if (message.is_user || message.is_system) {
			continue;
		}

		// Found an assistant message - try to get its swipe data
		const swipeId = message.swipe_id || 0;
		const swipeData = getSwipeData(message, swipeId);
		if (swipeData && swipeData[trackerKey]) {
			console.log(
				`[RPG Companion] Found tracker data for "${trackerKey}" in message ID ${message.id}. Message: ${i}/${chatToSearch.length - 1}, swipe ${swipeId}`,
			);
			// Track the message ID of the last message with tracker data
			extensionSettings.lastTrackerMessage = i;
			return swipeData[trackerKey];
		}
	}

	return null;
}