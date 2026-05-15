/**
 * SillyTavern Integration Module
 * Handles all event listeners and integration with SillyTavern's event system
 */

import {
	chat,
	extension_prompt_types,
	setExtensionPrompt,
	user_avatar,
} from "../../../../../../../script.js";
import { getContext } from "../../../../../../extensions.js";
import {
	autoSwitchPresetForEntity,
	migrateAppearanceData,
	saveChatData,
} from "../../core/persistence.js";
// Core modules
import {
	abortCurrentGeneration,
	extensionSettings,
	isAwaitingNewMessage,
	isPlotProgression,
	lastActionWasSwipe,
	setGenerationAbortController,
	setIsAwaitingNewMessage,
	setIsPlotProgression,
	setLastActionWasSwipe,
} from "../../core/state.js";
import { i18n } from "../../core/i18n.js";
// Utils
import { getSafeThumbnailUrl } from "../../utils/avatars.js";
// Generation & Parsing
import { updateRPGData } from "../generation/apiClient.js";
import { updateRelationships } from "../generation/relationshipApiClient.js";
import { initHistoryInjectionListeners } from "../generation/injector.js";
import { getLockedItemsFromSwipeStore } from "../generation/lockManager.js";
import { renderAppearance } from "../rendering/appearance.js";
import { renderInfoBox } from "../rendering/infoBox.js";
import { renderInventory } from "../rendering/inventory.js";
import { renderQuests } from "../rendering/quests.js";
import { renderRelationships } from "../rendering/relationships.js";
import { renderThoughts, updateChatThoughts } from "../rendering/thoughts.js";
// Rendering
import { renderUserStats } from "../rendering/userStats.js";
import { updateStripWidgets } from "../ui/desktop.js";
// UI
import { updateFabWidgets } from "../ui/mobile.js";

/**
 * Reload lock settings from the current message's swipeStore
 * This ensures locks are message-specific and persist across swipes
 */
function reloadLocksFromSwipeStore() {
	console.log("[RPG Companion] Reloading locks from swipeStore...");

	// Get locks from swipeStore for each tracker type
	const userStatsLocks = getLockedItemsFromSwipeStore("userStats");
	const infoBoxLocks = getLockedItemsFromSwipeStore("infoBox");
	const charactersLocks = getLockedItemsFromSwipeStore("characters");

	// Update extensionSettings with locks from swipeStore
	extensionSettings.lockedItems = {
		userStats: userStatsLocks,
		infoBox: infoBoxLocks,
		characters: charactersLocks,
	};
}

/**
 * Event handler for when the user sends a message.
 * Sets the flag to indicate this is NOT a swipe.
 */
export function onMessageSent() {
	if (!extensionSettings.enabled) return;

	// console.log('[RPG Companion] 🟢 EVENT: onMessageSent - lastActionWasSwipe =', lastActionWasSwipe);

	// Check if this is a streaming placeholder message (content = "...")
	// When streaming is on, ST sends a "..." placeholder before generation starts
	const context = getContext();
	const chat = context.chat;
	const lastMessage = chat && chat.length > 0 ? chat[chat.length - 1] : null;

	if (lastMessage && lastMessage.mes === "...") {
		// console.log('[RPG Companion] 🟢 Ignoring onMessageSent: streaming placeholder message');
		return;
	}

	// console.log('[RPG Companion] 🟢 EVENT: onMessageSent (after placeholder check)');
	// console.log('[RPG Companion] 🟢 NOTE: lastActionWasSwipe will be reset in onMessageReceived after generation completes');

	// Set flag to indicate we're expecting a new message from generation
	// This allows auto-update to distinguish between new generations and loading chat history
	setIsAwaitingNewMessage(true);

	// // Trigger relationship update in a separate LLM call
	// // This runs after the message is sent, using a focused prompt on relationships only
	// if (extensionSettings.autoUpdate) {
	// 	setTimeout(async () => {
	// 		await updateRelationships();
	// 	}, 500);
	// }

	// FAB spinning is handled by apiClient.js when updateRPGData() is called
}

/**
 * Event handler for when a message is generated.
 */
export async function onMessageReceived(_data) {
	// console.log('[RPG Companion] onMessageReceived called, lastActionWasSwipe:', lastActionWasSwipe);

	if (!extensionSettings.enabled) {
		return;
	}

	// Reset swipe flag after generation completes
	// This ensures next user message (whether from original or swipe) triggers commit
	setLastActionWasSwipe(false);
	// console.log('[RPG Companion] 🟢 Reset lastActionWasSwipe = false (generation completed)');

	// Trigger auto-update if enabled
	// Only trigger if this is a newly generated message, not loading chat history
	if (extensionSettings.autoUpdate && isAwaitingNewMessage) {
		// Capture the target message and swipe ID before any async work
		// so both updateRPGData and updateRelationships know where to store results
		const context = getContext();
		const chat = context.chat;
		const targetMessage =
			chat && chat.length > 0 ? chat[chat.length - 1] : null;
		const targetSwipeId = targetMessage ? targetMessage.swipe_id || 0 : 0;

		setTimeout(async () => {
			await runTrackerAndRelationshipUpdate(
				true,
				null,
				targetMessage,
				targetSwipeId,
			);
		}, 500);
	}

	// Reset the awaiting flag after processing the message
	setIsAwaitingNewMessage(false);

	// Reset the swipe flag after generation completes
	// This ensures that if the user swiped → auto-reply generated → flag is now cleared
	// so the next user message will be treated as a new message (not a swipe)
	setLastActionWasSwipe(false);

	// Clear plot progression flag if this was a plot progression generation
	// Note: No need to clear extension prompt since we used quiet_prompt option
	if (isPlotProgression) {
		setIsPlotProgression(false);
		// console.log('[RPG Companion] Plot progression generation completed');
	}
}

/**
 * Orchestrates tracker and relationship updates with parallel or sequential execution.
 * Manages refresh button UI state before, during, and after generation.
 */
export async function runTrackerAndRelationshipUpdate(
	isAutoUpdate = false,
	selectedSections = null,
	targetMessage = null,
	targetSwipeId = null,
) {
	try {
		// Create shared abort controller so cancel aborts both RPG data and relationship updates
		const controller = new AbortController();
		setGenerationAbortController(controller);
		const signal = controller.signal;

		// Show button state
		const $splitBtn = $("#rpg-refresh-split-btn");
		const $updateBtn = $("#rpg-full-refresh");
		const $stripRefreshBtn = $("#rpg-strip-refresh");
		const updatingText =
			i18n.getTranslation("template.mainPanel.updating") || "Updating...";

		// Add updating class to split container (shows cancel button, hides both halves)
		$splitBtn.addClass("is-updating");
		$updateBtn
			.find(".rpg-btn-refresh-content")
			.html(`<i class="fa-solid fa-spinner fa-spin"></i> ${updatingText}`);

		// Strip button: show spinner and disable
		$stripRefreshBtn
			.html('<i class="fa-solid fa-spinner fa-spin"></i>')
			.prop("disabled", true);

		// If only "Relationships" is selected, run the relationship update flow which uses a specialized prompt and API call
		if (
			selectedSections &&
			selectedSections.length === 1 &&
			selectedSections[0] === "relationships"
		) {
			await updateRelationships(targetMessage, targetSwipeId, signal);
			return;
		}

		const updateRPG = updateRPGData(
			isAutoUpdate,
			selectedSections,
			targetMessage,
			targetSwipeId,
			signal,
		);

		if (
			!extensionSettings.showRelationships ||
			(selectedSections && !selectedSections.includes("relationships"))
		) {
			await updateRPG;
			return;
		}

		const updateRelationshipsTask = updateRelationships(
			targetMessage,
			targetSwipeId,
			signal,
		);

		if (extensionSettings.parallelTrackerGeneration) {
			await Promise.all([updateRPG, updateRelationshipsTask]);
		} else {
			await updateRPG;
			await updateRelationshipsTask;
		}
	} finally {
		// Clear the shared abort controller
		setGenerationAbortController(null);

		// Restore button state
		const $splitBtn = $("#rpg-refresh-split-btn");
		const $updateBtn = $("#rpg-full-refresh");
		const $stripRefreshBtn = $("#rpg-strip-refresh");
		const refreshText =
			i18n.getTranslation("template.mainPanel.fullRefresh") || "Full Refresh";

		// Remove updating class from split container (hides cancel, shows both halves)
		$splitBtn.removeClass("is-updating");
		$updateBtn
			.find(".rpg-btn-refresh-content")
			.html(`<i class="fa-solid fa-sync"></i> ${refreshText}`);

		// Strip button restore
		$stripRefreshBtn
			.html('<i class="fa-solid fa-sync"></i>')
			.prop("disabled", false);
	}
}

/**
 * Event handler for character change.
 */
export function onCharacterChanged() {
	console.log("[RPG Companion] 🟠 EVENT: onCharacterChanged");
	// Abort any pending or in-flight generation so
	// its result is not applied to the (now-changed) chat tail.
	abortCurrentGeneration();

	// Remove thought panel and icon when changing characters
	$("#rpg-thought-panel").remove();
	$("#rpg-thought-icon").remove();
	$("#chat").off("scroll.thoughtPanel");
	$(window).off("resize.thoughtPanel");
	$(document).off("click.thoughtPanel");

	// Auto-switch to the preset associated with this character/group (if any)
	autoSwitchPresetForEntity();

	// Apply migration
	migrateAppearanceData();

	// Reload lock settings from the current message's swipeStore
	reloadLocksFromSwipeStore();

	// Re-render with the loaded data
	renderUserStats();
	renderInfoBox();
	renderThoughts();
	renderInventory();
	renderAppearance();
	renderQuests();
	renderRelationships();

	// Update FAB widgets and strip widgets with loaded data
	updateFabWidgets();
	updateStripWidgets();

	// Update chat thought overlays
	updateChatThoughts();
}

/**
 * Event handler for when a message is swiped.
 * Loads the RPG data for the swipe the user navigated to.
 */
export function onMessageSwiped(messageIndex) {
	if (!extensionSettings.enabled) {
		return;
	}

	// console.log('[RPG Companion] 🔵 EVENT: onMessageSwiped at index:', messageIndex);

	// Abort any pending or in-flight generation so
	// its result is not applied to the (now-changed) chat tail.
	abortCurrentGeneration();

	// Get the message that was swiped
	const message = chat[messageIndex];
	if (!message || message.is_user) {
		// console.log('[RPG Companion] 🔵 Ignoring swipe - message is user or undefined');
		return;
	}

	const currentSwipeId = message.swipe_id || 0;

	// Only set flag to true if this swipe will trigger a NEW generation
	// Check if the swipe already exists (has content in the swipes array)
	const isExistingSwipe =
		message.swipes &&
		message.swipes[currentSwipeId] !== undefined &&
		message.swipes[currentSwipeId] !== null &&
		message.swipes[currentSwipeId].length > 0;

	if (!isExistingSwipe) {
		// This is a NEW swipe that will trigger generation
		setLastActionWasSwipe(true);
		setIsAwaitingNewMessage(true);
		console.log(
			"[RPG Companion] 🔵 NEW swipe detected - Set lastActionWasSwipe = true",
		);
	} else {
		// This is navigating to an EXISTING swipe - don't change the flag
		console.log(
			"[RPG Companion] 🔵 EXISTING swipe navigation - lastActionWasSwipe unchanged =",
			lastActionWasSwipe,
		);
	}

	// Re-render the panels
	renderUserStats();
	renderInfoBox();
	renderThoughts();
	renderInventory();
	renderQuests();
	renderRelationships();

	// Reload lock settings from the current message's swipeStore
	reloadLocksFromSwipeStore();

	// Update chat thought overlays
	updateChatThoughts();
}

/**
 * Event handler for when a message is deleted.
 * Re-syncs swipeStore, swipeStore, and all UI panels to the
 * new last assistant message's active swipe — or clears everything if no
 * assistant messages remain.
 */
export function onMessageDeleted() {
	if (!extensionSettings.enabled) return;

	console.log("[RPG Companion] 🗑️ EVENT: onMessageDeleted");

	// Abort any pending or in-flight generation so
	// its result is not applied to the (now-changed) chat tail.
	abortCurrentGeneration();

	// Re-render all panels.
	// Render functions now read directly from the swipe store, so no state management needed.
	renderUserStats();
	renderInfoBox();
	renderThoughts();
	renderInventory();
	renderQuests();
	renderRelationships();

	// Update widget strips.
	updateFabWidgets();
	updateStripWidgets();

	// Persist updated state.
	saveChatData();
}

/**
 * Update the persona avatar image when user switches personas
 */
export function updatePersonaAvatar() {
	const portraitImg = document.querySelector(".rpg-user-portrait");
	if (!portraitImg) {
		// console.log('[RPG Companion] Portrait image element not found in DOM');
		return;
	}

	// Get current user_avatar from context instead of using imported value
	const context = getContext();
	const currentUserAvatar = context.user_avatar || user_avatar;

	// console.log('[RPG Companion] Attempting to update persona avatar:', currentUserAvatar);

	// Try to get a valid thumbnail URL using our safe helper
	if (currentUserAvatar) {
		const thumbnailUrl = getSafeThumbnailUrl("persona", currentUserAvatar);

		if (thumbnailUrl) {
			// Only update the src if we got a valid URL
			portraitImg.src = thumbnailUrl;
			// console.log('[RPG Companion] Persona avatar updated successfully');
		} else {
			// Don't update the src if we couldn't get a valid URL
			// This prevents 400 errors and keeps the existing image
			// console.warn('[RPG Companion] Could not get valid thumbnail URL for persona avatar, keeping existing image');
		}
	} else {
		// console.log('[RPG Companion] No user avatar configured, keeping existing image');
	}
}

/**
 * Clears all extension prompts.
 */
export function clearExtensionPrompts() {
	setExtensionPrompt(
		"rpg-companion-inject",
		"",
		extension_prompt_types.IN_CHAT,
		0,
		false,
	);
	setExtensionPrompt(
		"rpg-companion-example",
		"",
		extension_prompt_types.IN_CHAT,
		0,
		false,
	);
	setExtensionPrompt(
		"rpg-companion-context",
		"",
		extension_prompt_types.IN_CHAT,
		1,
		false,
	);
	// Note: rpg-companion-plot is not cleared here since it's passed via quiet_prompt option
	// console.log('[RPG Companion] Cleared all extension prompts');
}

/**
 * Event handler for when generation stops or ends
 * Re-applies checkpoint if SillyTavern unhid messages
 */
export async function onGenerationEnded() {
	// console.log('[RPG Companion] 🏁 onGenerationEnded called');
	// Note: isGenerating flag is cleared in apiClient.js after generation completes
	// SillyTavern may auto-unhide messages when generation stops
	// Re-apply checkpoint if one exists
}

/**
 * Initialize history injection event listeners.
 * Should be called once during extension initialization.
 */
export function initHistoryInjection() {
	initHistoryInjectionListeners();
}
