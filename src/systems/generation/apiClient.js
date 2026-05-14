/**
 * API Client Module
 * Handles API calls for RPG tracker generation
 */

import { chat, eventSource } from "../../../../../../../script.js";
import { executeSlashCommandsOnChatInput } from "../../../../../../../scripts/slash-commands.js";
import { getContext } from "../../../../../../extensions.js";

// Custom event name for when RPG Companion finishes updating tracker data
// Other extensions can listen for this event to know when RPG Companion is done
export const RPG_COMPANION_UPDATE_COMPLETE = "rpg_companion_update_complete";

import { i18n } from "../../core/i18n.js";
import { saveChatData } from "../../core/persistence.js";
import {
	extensionSettings,
	isGenerating,
	setGenerationAbortController,
	setIsGenerating,
	setLastActionWasSwipe,
} from "../../core/state.js";
import { renderAppearance } from "../rendering/appearance.js";
import { renderInfoBox } from "../rendering/infoBox.js";
import { renderInventory } from "../rendering/inventory.js";
import { renderQuests } from "../rendering/quests.js";
import { renderRelationships } from "../rendering/relationships.js";
import { renderThoughts } from "../rendering/thoughts.js";
import { renderUserStats } from "../rendering/userStats.js";
import { setStripCancelState, updateStripWidgets } from "../ui/desktop.js";
import {
	setFabCancelState,
	setFabLoadingState,
	updateFabWidgets,
} from "../ui/mobile.js";
import { removeLocks, restoreLockedContent } from "./lockManager.js";
import { parseResponse } from "./parser.js";
import { getTrackerDataForContext } from "./trackerDataUtils.js";
import { generateSeparateUpdatePrompt } from "./separatePromptBuilder.js";

/**
 * Gets the current preset name using the /preset command
 * @returns {Promise<string|null>} Current preset name or null if unavailable
 */
export async function getCurrentPresetName() {
	try {
		// Use /preset without arguments to get the current preset name
		const result = await executeSlashCommandsOnChatInput("/preset", {
			quiet: true,
		});

		// console.log('[RPG Companion] /preset result:', result);

		// The result should be an object with a 'pipe' property containing the preset name
		if (result && typeof result === "object" && result.pipe) {
			const presetName = String(result.pipe).trim();
			// console.log('[RPG Companion] Extracted preset name:', presetName);
			return presetName || null;
		}

		// Fallback if result is a string
		if (typeof result === "string") {
			return result.trim() || null;
		}

		return null;
	} catch (error) {
		console.error("[RPG Companion] Error getting current preset:", error);
		return null;
	}
}

/**
 * Switches to a specific preset by name using the /preset slash command
 * @param {string} presetName - Name of the preset to switch to
 * @returns {Promise<boolean>} True if switching succeeded, false otherwise
 */
export async function switchToPreset(presetName) {
	try {
		// Use the /preset slash command to switch presets
		// This is the proper way to change presets in SillyTavern
		await executeSlashCommandsOnChatInput(`/preset ${presetName}`, {
			quiet: true,
		});

		// console.log(`[RPG Companion] Switched to preset "${presetName}"`);
		return true;
	} catch (error) {
		console.error("[RPG Companion] Error switching preset:", error);
		return false;
	}
}

/**
 * Checks if a connection profile with the given name exists in the Connection Manager.
 * @param {string} profileName - Name of the profile to check
 * @returns {boolean} True if the profile exists
 */
export function isConnectionProfileAvailable(profileName) {
	try {
		const context = getContext();
		const stExtSettings =
			context.extension_settings || context.extensionSettings;
		const profiles = stExtSettings?.connectionManager?.profiles;
		if (!Array.isArray(profiles)) return false;

		return profiles.some((p) => p.id === profileName);
	} catch {
		return false;
	}
}
/**
 * Gets all available connection profiles from the Connection Manager.
 * @returns {Array<{name: string, id: string}>} Array of profile objects with name and id, empty if Connection Manager is not available
 */
export function getAvailableConnectionProfiles() {
	try {
		const context = getContext();
		const stExtSettings =
			context.extension_settings || context.extensionSettings;
		const profiles = stExtSettings?.connectionManager?.profiles;

		if (!Array.isArray(profiles)) return [];
		return profiles.sort((a, b) => a.name.localeCompare(b.name));
	} catch {
		return [];
	}
}

/**
 *  Retrieves the current profile to be used for tracker generation, based on extension settings and availability.
 *  @returns {string|null} The profile ID to use for generation, or null if no valid profile is found
 */
export function getCurrentProfile() {
	let profile =
		getContext().extensionSettings.connectionManager.selectedProfile;
	// Check if the profile specified in settings is available and switch to it for generation if needed
	if (
		extensionSettings.connectionProfile &&
		extensionSettings.connectionProfile.trim() !== ""
	) {
		if (isConnectionProfileAvailable(extensionSettings.connectionProfile)) {
			profile = extensionSettings.connectionProfile;
		} else {
			console.warn(
				`[RPG Companion] Connection profile "${extensionSettings.connectionProfile}" not found, using current connection`,
			);
		}
	} else {
		console.log(
			"[RPG Companion] No connection profile specified in settings, using current connection",
		);
	}

	console.log(
		`[RPG Companion] Using profile "${profile}" for tracker generation`,
	);
	return profile;
}

/**
 * Updates RPG tracker data using a dedicated API call.
 * Makes a dedicated API call to generate tracker data, then stores it
 * in the last assistant message's swipe data.
 */
export async function updateRPGData(
	isAutoUpdate = false,
	selectedSections = null,
	targetMessage = null,
	targetSwipeId = null,
) {
	if (isGenerating) {
		// console.log('[RPG Companion] Already generating, skipping...');
		return;
	}

	if (!extensionSettings.enabled) {
		return;
	}

	if (extensionSettings.generationMode !== "single") {
		// console.log('[RPG Companion] Not in single mode, skipping manual update');
		return;
	}

	// Check minimum reply length for auto-update only
	if (isAutoUpdate && extensionSettings.minReplyLength > 0) {
		const lastMessage = chat && chat.length > 0 ? chat[chat.length - 1] : null;
		if (lastMessage && !lastMessage.is_user) {
			const messageText = lastMessage.mes || "";
			const messageLength = messageText.length;

			if (messageLength < extensionSettings.minReplyLength) {
				console.log(
					`[RPG Companion] Auto-update skipped: latest message length (${messageLength}) is below minimum (${extensionSettings.minReplyLength})`,
				);
				// Show toast notification if enabled
				if (extensionSettings.minReplyLength > 0) {
					const notificationText = `Auto-update skipped: latest message too short (${messageLength}/${extensionSettings.minReplyLength} chars)`;
					console.log(`[RPG Companion] ${notificationText}`);
					toastr.info(notificationText, "", { timeOut: 3000 });
				}
				return;
			}
		}
	}

	try {
		setIsGenerating(true);
		setFabLoadingState(true); // Show spinning FAB on mobile
		setFabCancelState(true); // Show cancel button on mobile
		setStripCancelState(true); // Show cancel button on desktop

		const prompt = generateSeparateUpdatePrompt(selectedSections);

		// Generate response
		const profile = getCurrentProfile();

		const controller = new AbortController();
		const signal = controller.signal;
		setGenerationAbortController(controller);

		let response;
		const maxRetries = extensionSettings.retryAttempts ?? 0;
		const baseDelay = extensionSettings.retryBaseDelay ?? 2000;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				response =
					await getContext().ConnectionManagerRequestService.sendRequest(
						profile,
						prompt,
						0,
						{ signal },
					);
				break; // Success, exit retry loop
			} catch (error) {
				// Check if this was an abort
				if (error.name === "AbortError") {
					console.log(
						"[RPG Companion] Generation aborted by user or message deletion",
					);
					return;
				}

				// Check for network errors
				const causeString = error.cause ? error.cause.message : "";
				const isNetworkError =
					causeString.includes("ETIMEDOUT") ||
					causeString.includes("ECONNREFUSED") ||
					causeString.includes("ENETUNREACH") ||
					causeString.includes("ECONNRESET");

				if (!isNetworkError || attempt >= maxRetries) {
					// Not a network error or max retries reached, throw the error
					throw error;
				}

				const delay = baseDelay;
				console.log(
					`[RPG Companion] API request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`,
					causeString,
				);

				// Wait before retrying
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}

		if (response) {
			// console.log('[RPG Companion] Raw AI response:', response);
			const parsedData = parseResponse(response);

			// Check if parsing completely failed (no tracker data found)
			if (parsedData.parsingFailed) {
				toastr.error(i18n.getTranslation("errors.parsingError"), "", {
					timeOut: 5000,
				});
			}

			// Remove locks from parsed data (JSON format only, text format is unaffected)
			if (parsedData.userStats) {
				parsedData.userStats = removeLocks(parsedData.userStats);
			}
			if (parsedData.infoBox) {
				parsedData.infoBox = removeLocks(parsedData.infoBox);
			}
			if (parsedData.characterThoughts) {
				parsedData.characterThoughts = removeLocks(
					parsedData.characterThoughts,
				);
			}

			// console.log('[RPG Companion] Parsed data:', parsedData);
			// console.log('[RPG Companion] parsedData.userStats:', parsedData.userStats ? parsedData.userStats.substring(0, 100) + '...' : 'null');

			// Store RPG data for the last assistant message (separate mode)
			// Use pre-captured targetMessage/targetSwipeId if provided (from onMessageReceived),
			// otherwise fall back to deriving from chat tail (for manual refresh)
			const lastMessage =
				targetMessage ||
				(chat && chat.length > 0 ? chat[chat.length - 1] : null);
			const currentSwipeId =
				targetSwipeId !== null
					? targetSwipeId
					: lastMessage
						? lastMessage.swipe_id || 0
						: 0;
			// console.log('[RPG Companion] Last message is_user:', lastMessage ? lastMessage.is_user : 'no message');

			// Double-check message still exists and hasn't changed (defensive)
			if (!lastMessage || lastMessage.is_user) {
				console.log(
					"[RPG Companion] Message deleted during generation, discarding stale result",
				);
				return;
			}

			console.log(
				"[RPG Companion] Restoring locked content for separate mode update",
			);
			const previousUserStats = getTrackerDataForContext("userStats");
			const previousInfoBox = getTrackerDataForContext("infoBox");
			const previousCharacterThoughts =
				getTrackerDataForContext("characterThoughts");
			const getLockedItemsFromStore = getTrackerDataForContext("lockedItems");
			if (parsedData.userStats) {
				if (previousUserStats) {
					parsedData.userStats = restoreLockedContent(
						parsedData.userStats,
						previousUserStats,
						"userStats",
					);
				}
			}
			if (parsedData.infoBox) {
				if (previousInfoBox) {
					parsedData.infoBox = restoreLockedContent(
						parsedData.infoBox,
						previousInfoBox,
						"infoBox",
					);
				}
			}
			if (parsedData.characterThoughts) {
				if (previousCharacterThoughts) {
					parsedData.characterThoughts = restoreLockedContent(
						parsedData.characterThoughts,
						previousCharacterThoughts,
						"characters",
					);
				}
			}

			// Store on assistant message's swipe (authoritative source)
			if (lastMessage && !lastMessage.is_user) {
				if (!lastMessage.extra) {
					lastMessage.extra = {};
				}
				if (!lastMessage.extra.rpg_companion_swipes) {
					lastMessage.extra.rpg_companion_swipes = {};
				}

				// currentSwipeId already derived above (from targetSwipeId or lastMessage.swipe_id)

				// For partial refresh, merge with existing data instead of overwriting
				if (selectedSections) {
					const existingData =
						lastMessage.extra.rpg_companion_swipes[currentSwipeId] || {};
					const nestedSubSections = [
						"stats",
						"status",
						"skills",
						"appearance",
						"inventory",
						"quests",
					];
					const hasNestedSections = selectedSections.some((s) =>
						nestedSubSections.includes(s),
					);

					// Handle userStats: if nested sub-sections selected, deep-merge only those
					let mergedUserStats;
					if (hasNestedSections) {
						// Deep merge: only update the selected sub-sections within userStats
						mergedUserStats = JSON.parse(
							JSON.stringify(existingData.userStats || {}),
						);
						for (const subSection of nestedSubSections) {
							if (
								selectedSections.includes(subSection) &&
								parsedData.userStats &&
								parsedData.userStats[subSection] !== undefined
							) {
								mergedUserStats[subSection] = parsedData.userStats[subSection];
							}
						}
					} else {
						mergedUserStats = existingData.userStats;
					}

					const newData = {
						userStats: mergedUserStats,
						infoBox: selectedSections.includes("infoBox")
							? parsedData.infoBox
							: existingData.infoBox,
						characterThoughts: selectedSections.includes("characterThoughts")
							? parsedData.characterThoughts
							: existingData.characterThoughts,
						lockedItems: {
							userStats: getLockedItemsFromStore
								? getLockedItemsFromStore.userStats
								: [],
							infoBox: getLockedItemsFromStore
								? getLockedItemsFromStore.infoBox
								: [],
							characters: getLockedItemsFromStore
								? getLockedItemsFromStore.characters
								: [],
						},
					};
					if (existingData.relationships) {
						newData.relationships = existingData.relationships;
					}

					lastMessage.extra.rpg_companion_swipes[currentSwipeId] = newData;
				} else {
					const existingData =
						lastMessage.extra.rpg_companion_swipes[currentSwipeId] || {};
					lastMessage.extra.rpg_companion_swipes[currentSwipeId] = {
						userStats: parsedData.userStats,
						infoBox: parsedData.infoBox,
						characterThoughts: parsedData.characterThoughts,
						lockedItems: {
							userStats: getLockedItemsFromStore
								? getLockedItemsFromStore.userStats
								: [],
							infoBox: getLockedItemsFromStore
								? getLockedItemsFromStore.infoBox
								: [],
							characters: getLockedItemsFromStore
								? getLockedItemsFromStore.characters
								: [],
						},
						relationships: existingData.relationships,
					};
				}

				// console.log('[RPG Companion] Stored separate mode RPG data for message swipe', currentSwipeId);
			}

			// Render the updated data (filtered by selectedSections if provided)
			if (selectedSections) {
				if (selectedSections.includes("userStats")) renderUserStats();
				if (selectedSections.includes("infoBox")) renderInfoBox();
				if (selectedSections.includes("characterThoughts")) renderThoughts();
				if (selectedSections.includes("appearance")) renderAppearance();
				if (selectedSections.includes("inventory")) renderInventory();
				if (selectedSections.includes("quests")) renderQuests();
			} else {
				renderUserStats();
				renderInfoBox();
				renderThoughts();
				renderAppearance();
				renderInventory();
				renderQuests();
				renderRelationships();
			}

			// Save to chat metadata
			saveChatData();
		}
	} catch (error) {
		// Don't show error for user-initiated aborts
		if (error.name !== "AbortError") {
			console.error("[RPG Companion] Error updating RPG data:", error);
		}
	} finally {
		setIsGenerating(false);
		setGenerationAbortController(null); // Clear abort controller
		setFabLoadingState(false); // Stop spinning FAB on mobile
		setFabCancelState(false); // Hide cancel button on mobile
		setStripCancelState(false); // Hide cancel button on desktop
		updateFabWidgets(); // Update FAB widgets with new data
		updateStripWidgets(); // Update strip widgets with new data
		renderUserStats(); // To show the outdated message
		renderAppearance(); // To show the outdated appearance data

		// Reset the flag after tracker generation completes
		// This ensures the flag persists through both main generation AND tracker generation
		// console.log('[RPG Companion] 🔄 Tracker generation complete - resetting lastActionWasSwipe to false');
		setLastActionWasSwipe(false);

		// Emit event for other extensions to know RPG Companion has finished updating
		console.debug(
			"[RPG Companion] Emitting RPG_COMPANION_UPDATE_COMPLETE event",
		);
		eventSource.emit(RPG_COMPANION_UPDATE_COMPLETE);
	}
}
