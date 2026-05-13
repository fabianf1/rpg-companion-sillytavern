/**
 * Relationship API Client Module
 * Handles dedicated API calls for relationship tracking updates.
 * Called after onMessageSent to update relationships in a separate LLM call.
 */

import { getContext } from "../../../../../../extensions.js";
import {
	saveChatData,
} from "../../core/persistence.js";
import { extensionSettings } from "../../core/state.js";
import { renderRelationships } from "../rendering/relationships.js";
import { renderThoughts } from "../rendering/thoughts.js";
import { getCurrentProfile } from "./apiClient.js";
import { generateRelationshipUpdatePrompt } from "./relationshipPromptBuilder.js";

/**
 * Updates relationship data using a dedicated API call.
 * Called from onMessageSent after the main message is sent.
 * Uses a focused prompt that only asks the LLM to update relationships.
 *
 * @param {Object} [targetMessage] - Pre-captured assistant message to store results on
 * @param {number} [targetSwipeId] - Pre-captured swipe ID for the target message
 */
export async function updateRelationships(
	targetMessage = null,
	targetSwipeId = null,
) {
	console.log("[RPG Companion] Starting relationship update...");
	if (!extensionSettings.enabled) {
		console.log(
			"[RPG Companion] Module is disabled, skipping relationship update.",
		);
		return;
	}

	if (!extensionSettings.showRelationships) {
		console.log(
			"[RPG Companion] showRelationships setting is false, skipping relationship update.",
		);
		return;
	}

	// Show loading spinner on the relationships button
	const $relBtn = $("#rpg-open-relationships");
	const $relIcon = $relBtn.find("i");
	const originalIconClass = $relIcon.attr("class") || "fa-solid fa-heart";
	$relIcon.removeClass().addClass("fa-solid fa-spinner fa-spin");
	$relBtn.prop("disabled", true);

	try {
		const prompt = generateRelationshipUpdatePrompt();
		const profile = getCurrentProfile();

		if (!profile) {
			console.warn(
				"[RPG Companion] No connection profile available for relationship update",
			);
			return;
		}

		const response =
			await getContext().ConnectionManagerRequestService.sendRequest(
				profile,
				prompt,
				0,
			);

		console.log(
			"[RPG Companion] Received relationship update response:",
			response,
		);

		if (response) {
			const parsedData = parseRelationshipResponse(response);
			console.log("[RPG Companion] Parsed relationship data:", parsedData);

			if (parsedData?.relationships) {
				// Use pre-captured message/swipeId if provided, otherwise fall back to updateMessageSwipeData
				if (!targetMessage.extra) {
					targetMessage.extra = {};
				}
				if (!targetMessage.extra.rpg_companion_swipes) {
					targetMessage.extra.rpg_companion_swipes = {};
				}
				if (!targetMessage.extra.rpg_companion_swipes[targetSwipeId]) {
					targetMessage.extra.rpg_companion_swipes[targetSwipeId] = {};
				}
				targetMessage.extra.rpg_companion_swipes[targetSwipeId].relationships =
					parsedData.relationships;
				// Re-render the relationships display
				renderRelationships();
				renderThoughts();
			}

			// Save to chat metadata
			saveChatData();
		}
	} catch (error) {
		console.error("[RPG Companion] Error updating relationships:", error);
	} finally {
		// Restore button to original state
		$relIcon.removeClass().addClass(originalIconClass);
		$relBtn.prop("disabled", false);
	}
}

/**
 * Parses the AI response to extract relationship data.
 * Handles both raw JSON and code-fenced JSON.
 *
 * @param {string} response - The raw AI response text
 * @returns {Object|null} Parsed relationship data with relationships array, or null
 */
function parseRelationshipResponse(response) {
	if (!response?.content) return null;

	const content = response.content;

	try {
		// Try direct JSON parse first
		const trimmed = content.trim();
		if (trimmed.startsWith("{")) {
			return JSON.parse(trimmed);
		}

		// Try to extract JSON from code fences
		const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (jsonMatch) {
			return JSON.parse(jsonMatch[1].trim());
		}

		// Try to find a JSON object anywhere in the response
		const objectMatch = trimmed.match(/\{[\s\S]*"relationships"[\s\S]*\}/);
		if (objectMatch) {
			return JSON.parse(objectMatch[0]);
		}
	} catch (e) {
		console.warn("[RPG Companion] Failed to parse relationship response:", e);
	}

	return null;
}
