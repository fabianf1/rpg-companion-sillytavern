import {
	event_types,
	eventSource,
	saveSettingsDebounced,
} from "../../../../script.js";
import {
	renderExtensionTemplateAsync,
	extension_settings as st_extension_settings,
	getContext,
} from "../../../extensions.js";

// Core modules
import { extensionName } from "./src/core/config.js";
import { registerAllEvents } from "./src/core/events.js";
import { i18n } from "./src/core/i18n.js";
import { loadSettings, saveSettings } from "./src/core/persistence.js";
import {
	abortCurrentGeneration,
	extensionSettings,
	setAppearanceContainer,
	setInfoBoxContainer,
	setInventoryContainer,
	setPanelContainer,
	setQuestsContainer,
	setThoughtsContainer,
	setUserStatsContainer,
} from "./src/core/state.js";
import { setupClassicStatsButtons } from "./src/systems/features/classicStats.js";
import {
	detectConflictingRegexScripts,
	ensureHtmlCleaningRegex,
	ensureTrackerCleaningRegex,
} from "./src/systems/features/htmlCleaning.js";
import { ensureJsonCleaningRegex } from "./src/systems/features/jsonCleaning.js";
// Feature modules
import {
	sendPlotProgression,
	setupPlotButtons,
} from "./src/systems/features/plotProgression.js";
// Generation & Parsing modules
import {
	getAvailableConnectionProfiles,
	updateRPGData,
} from "./src/systems/generation/apiClient.js";
import { updateRelationships } from "./src/systems/generation/relationshipApiClient.js";
import { onGenerationStarted } from "./src/systems/generation/injector.js";
// Integration modules
import {
	clearExtensionPrompts,
	initHistoryInjection,
	onCharacterChanged,
	onGenerationEnded,
	onMessageDeleted,
	onMessageReceived,
	onMessageSent,
	onMessageSwiped,
	updatePersonaAvatar,
} from "./src/systems/integration/sillytavern.js";
// Interaction modules
import { initInventoryEventListeners } from "./src/systems/interaction/inventoryActions.js";
import { renderAppearance } from "./src/systems/rendering/appearance.js";
import { renderInfoBox } from "./src/systems/rendering/infoBox.js";
import { renderInventory } from "./src/systems/rendering/inventory.js";
import { renderQuests } from "./src/systems/rendering/quests.js";
import { renderRelationships } from "./src/systems/rendering/relationships.js";
import {
	renderThoughts,
	updateChatThoughts,
} from "./src/systems/rendering/thoughts.js";
// Rendering modules
import { renderUserStats } from "./src/systems/rendering/userStats.js";
import {
	setupDesktopTabs,
	updateStripWidgets,
} from "./src/systems/ui/desktop.js";
import {
	applyPanelPosition,
	setupCollapseToggle,
	togglePlotButtons,
	updatePanelVisibility,
	updateSectionVisibility,
} from "./src/systems/ui/layout.js";
import {
	setupContentEditableScrolling,
	setupMobileKeyboardHandling,
	setupMobileTabs,
	setupMobileToggle,
	updateFabWidgets,
	updateMobileTabLabels,
} from "./src/systems/ui/mobile.js";
import {
	addDiceQuickReply,
	getPartialRefreshModal,
	openPartialRefreshPopup,
	setupDiceRoller,
	setupPartialRefreshPopup,
	setupRelationshipsPopup,
	setupSettingsPopup,
	updateDiceDisplay,
} from "./src/systems/ui/modals.js";
import { initPromptsEditor } from "./src/systems/ui/promptsEditor.js";
import {
	bindSettingsUI,
	syncSettingsUI,
} from "./src/systems/ui/settingsBinder.js";
import { initSnowflakes } from "./src/systems/ui/snowflakes.js";
// UI Systems modules
import {
	applyTheme,
	toggleAnimations,
	toggleCustomColors,
	updateFeatureTogglesVisibility,
} from "./src/systems/ui/theme.js";
import { initTrackerEditor } from "./src/systems/ui/trackerEditor.js";
import {
	initWeatherEffects,
	toggleDynamicWeather,
	updateWeatherEffect,
} from "./src/systems/ui/weatherEffects.js";
import { log, error as logError } from "./src/utils/logger.js";

/**
 * Updates UI elements that are dynamically generated and not covered by data-i18n-key.
 */
function updateDynamicLabels() {
	// Update "Full Refresh" button refresh content, but only if it's not disabled
	const refreshBtn = document.getElementById("rpg-full-refresh");
	if (refreshBtn && !refreshBtn.disabled) {
		const refreshText =
			i18n.getTranslation("template.mainPanel.fullRefresh") || "Full Refresh";
		const $refreshContent = $(refreshBtn).find(".rpg-btn-refresh-content");
		if ($refreshContent.length) {
			$refreshContent.html(`<i class="fa-solid fa-sync"></i> ${refreshText}`);
		}
	}

	// Update "Partial" button content
	const partialBtn = document.getElementById("rpg-partial-refresh");
	if (partialBtn && !partialBtn.disabled) {
		const partialText =
			i18n.getTranslation("template.mainPanel.partialRefresh") || "Partial";
		const $partialContent = $(partialBtn).find(".rpg-btn-partial-content");
		if ($partialContent.length) {
			$partialContent.html(
				`<i class="fa-solid fa-pen-ruler"></i> ${partialText}`,
			);
		}
	}

	// Update "Last Roll" label
	updateDiceDisplay();

	// Update mobile tab labels
	updateMobileTabLabels();
}

/**
 * Adds the extension settings to the Extensions tab.
 */
async function addExtensionSettings() {
	// Load the HTML template for the settings
	const settingsHtml = await renderExtensionTemplateAsync(
		extensionName,
		"settings",
	);
	$("#extensions_settings2").append(settingsHtml);

	// Set up the enable/disable toggle
	$("#rpg-extension-enabled")
		.prop("checked", extensionSettings.enabled)
		.on("change", async function () {
			const wasEnabled = extensionSettings.enabled;
			extensionSettings.enabled = $(this).prop("checked");
			saveSettings();

			if (!extensionSettings.enabled && wasEnabled) {
				// Disabling extension - remove UI elements
				clearExtensionPrompts();
				updateChatThoughts(); // Remove thought bubbles

				// Disable dynamic weather effects
				toggleDynamicWeather(false);

				// Remove panel and toggle buttons
				$("#rpg-companion-panel").remove();
				$("#rpg-mobile-toggle").remove();
				$("#rpg-collapse-toggle").remove();
				$("#rpg-plot-buttons").remove(); // Remove plot buttons
			} else if (extensionSettings.enabled && !wasEnabled) {
				// Enabling extension - initialize UI
				await initUI();
				updateChatThoughts(); // Create thought bubbles if data exists
			}
		});

	// Set up language selector
	const langSelect = $("#rpg-companion-language-select");
	if (langSelect.length) {
		langSelect.val(i18n.currentLanguage);
		langSelect.on("change", async function () {
			const selectedLanguage = $(this).val();
			await i18n.setLanguage(selectedLanguage);
			// We need to re-apply translations to the settings panel specifically
			i18n.applyTranslations(document.getElementById("extensions_settings2"));
		});
	}
}

/**
 * Populates the Connection Profile dropdown from the Connection Manager extension.
 */
function populateConnectionProfileDropdown() {
	const $select = $("#rpg-connection-profile");
	if (!$select.length) return;

	const currentValue = extensionSettings.connectionProfile || "";
	$select.empty();
	$select.append('<option value="">Use Current</option>');

	const profiles = getAvailableConnectionProfiles();
	log("Available connection profiles:", profiles);
	for (const profile of profiles) {
		$select.append($("<option>").val(profile.id).text(profile.name));
	}

	// Restore saved value; if saved profile no longer exists, reset
	if (currentValue && profiles.some((p) => p.id === currentValue)) {
		$select.val(currentValue);
	} else if (currentValue && !profiles.some((p) => p.id === currentValue)) {
		extensionSettings.connectionProfile = "";
		saveSettings();
		$select.val("");
	}
}

/**
 * Initializes the UI for the extension.
 */
async function initUI() {
	// Initialize i18n
	await i18n.init();

	// Only initialize UI if extension is enabled
	if (!extensionSettings.enabled) {
		log("Extension is disabled, skipping UI initialization.");
		return;
	}

	// Load the HTML template using SillyTavern's template system
	const templateHtml = await renderExtensionTemplateAsync(
		extensionName,
		"template",
	);

	// Append panel to body - positioning handled by CSS
	$("body").append(templateHtml);

	// Add mobile toggle button (FAB - Floating Action Button)
	const theme = extensionSettings.theme || "default";
	const mobileToggleHtml = `
        <button id="rpg-mobile-toggle" class="rpg-mobile-toggle" data-theme="${theme}" title="Toggle RPG Panel">
            <i class="fa-solid fa-dice-d20"></i>
        </button>
    `;
	$("body").append(mobileToggleHtml);

	// Hide mobile toggle on desktop viewport (> 1000px)
	if (window.innerWidth > 1000) {
		$("#rpg-mobile-toggle").hide();
	}

	// Cache UI elements using state setters
	setPanelContainer($("#rpg-companion-panel"));
	setUserStatsContainer($("#rpg-user-stats"));
	setInfoBoxContainer($("#rpg-info-box"));
	setThoughtsContainer($("#rpg-thoughts"));
	setInventoryContainer($("#rpg-inventory"));
	setAppearanceContainer($("#rpg-appearance"));
	setQuestsContainer($("#rpg-quests"));

	// Re-apply translations to the entire body to catch all new elements from the template
	i18n.applyTranslations(document.body);

	// Set up min reply length input
	$("#rpg-min-reply-length").val(extensionSettings.minReplyLength || 100);

	// ── Bind all settings UI controls via data-driven bindings ──
	bindSettingsUI();

	// ── Sync all settings UI controls to current values ──
	syncSettingsUI();

	// ── Manual bindings (non-settings actions) ──

	// Dismiss promo button
	$("#rpg-dismiss-promo").on("click", () => {
		extensionSettings.dismissedHolidayPromo = true;
		saveSettings();
		$("#rpg-holiday-promo").fadeOut(300);
	});

	// Full Refresh button (left half of split button)
	$("#rpg-full-refresh").on("click", async () => {
		if (!extensionSettings.enabled) return;
		const context = getContext();
		const chat = context.chat;
		const targetMessage =
			chat && chat.length > 0 ? chat[chat.length - 1] : null;
		const targetSwipeId = targetMessage ? targetMessage.swipe_id || 0 : 0;
		await updateRPGData(false, null, targetMessage, targetSwipeId);
		await updateRelationships(targetMessage, targetSwipeId);
	});

	// Partial Refresh button (right half of split button) - opens modal
	$("#rpg-partial-refresh").on("click", () => {
		if (!extensionSettings.enabled) return;
		const context = getContext();
		const chat = context.chat;
		const targetMessage =
			chat && chat.length > 0 ? chat[chat.length - 1] : null;
		const targetSwipeId = targetMessage ? targetMessage.swipe_id || 0 : 0;
		const modal = getPartialRefreshModal();
		if (modal) {
			modal.onExecute = async (selectedSections) => {
				await updateRPGData(
					false,
					selectedSections,
					targetMessage,
					targetSwipeId,
				);
				if (selectedSections.includes("relationships")) {
					await updateRelationships(targetMessage, targetSwipeId);
				}
			};
			openPartialRefreshPopup();
		}
	});

	// Cancel button (replaces split button during generation)
	$("#rpg-refresh-cancel").on("click", () => {
		log("Cancel button clicked");
		abortCurrentGeneration();
	});

	// Strip widget refresh button
	$("#rpg-strip-refresh").on("click", async () => {
		if (!extensionSettings.enabled) return;
		const context = getContext();
		const chat = context.chat;
		const targetMessage =
			chat && chat.length > 0 ? chat[chat.length - 1] : null;
		const targetSwipeId = targetMessage ? targetMessage.swipe_id || 0 : 0;
		await updateRPGData(false, null, targetMessage, targetSwipeId);
		await updateRelationships(targetMessage, targetSwipeId);
	});

	// Strip cancel button
	$("#rpg-strip-cancel").on("click", () => {
		log("Strip cancel button clicked");
		abortCurrentGeneration();
	});

	// Hide holiday promo if previously dismissed
	if (extensionSettings.dismissedHolidayPromo) {
		$("#rpg-holiday-promo").hide();
	}

	populateConnectionProfileDropdown();

	// ── Post-init: update UI state and render ──
	updatePanelVisibility();
	updateSectionVisibility();
	applyTheme();
	applyPanelPosition();
	toggleCustomColors();
	toggleAnimations();
	updateFeatureTogglesVisibility();
	togglePlotButtons();
	initWeatherEffects();
	setupMobileToggle();
	if (window.innerWidth > 1000) {
		setupDesktopTabs();
	} else {
		setupMobileTabs();
	}
	setupCollapseToggle();
	renderUserStats();
	renderInfoBox();
	renderThoughts();
	renderInventory();
	renderAppearance();
	renderQuests();
	renderRelationships();
	updateDiceDisplay();
	updateFabWidgets();
	updateStripWidgets();
	setupDiceRoller();
	setupClassicStatsButtons();
	setupSettingsPopup();
	setupPartialRefreshPopup();
	setupRelationshipsPopup();
	initTrackerEditor();
	initPromptsEditor();
	addDiceQuickReply();
	setupPlotButtons(sendPlotProgression);
	setupMobileKeyboardHandling();
	setupContentEditableScrolling();
	initInventoryEventListeners();

	// Expose weather effect functions globally for cross-module access
	if (!window.RPGCompanion) {
		window.RPGCompanion = {};
	}
	window.RPGCompanion.updateWeatherEffect = updateWeatherEffect;
}

/**
 * Main initialization function.
 */
jQuery(async () => {
	try {
		log("Starting initialization...");

		// Load settings with validation
		try {
			loadSettings();
		} catch (error) {
			logError("Settings load failed, continuing with defaults:", error);
		}

		// Initialize i18n early for the settings panel
		await i18n.init();

		// Set up a central listener for language changes to update dynamic UI parts
		i18n.addEventListener("languageChanged", updateDynamicLabels);

		// Add extension settings to Extensions tab
		try {
			await addExtensionSettings();
		} catch (error) {
			logError("Failed to add extension settings tab:", error);
			// Don't throw - extension can still work without settings tab
		}

		// Initialize UI
		try {
			await initUI();
		} catch (error) {
			logError("UI initialization failed:", error);
			throw error; // This is critical - can't continue without UI
		}

		// Import the HTML cleaning regex if needed
		try {
			await ensureHtmlCleaningRegex(
				st_extension_settings,
				saveSettingsDebounced,
			);
		} catch (error) {
			logError("HTML regex import failed:", error);
			// Non-critical - continue without it
		}

		// Import the tracker cleaning regex (removes old together mode JSON from prompts)
		try {
			await ensureTrackerCleaningRegex(
				st_extension_settings,
				saveSettingsDebounced,
			);
		} catch (error) {
			logError("Tracker cleaning regex import failed:", error);
			// Non-critical - continue without it
		}

		// Import the JSON cleaning regex to clean up JSON in messages
		// This cleans historical messages when displayed
		try {
			await ensureJsonCleaningRegex(
				st_extension_settings,
				saveSettingsDebounced,
			);
		} catch (error) {
			logError("JSON cleaning regex setup failed:", error);
			// Non-critical - continue without it
		}

		// Detect conflicting regex scripts from old manual formatters
		try {
			const conflicts = detectConflictingRegexScripts(st_extension_settings);
			if (conflicts.length > 0) {
				log(
					"Detected old manual formatting regex scripts that may conflict:",
					conflicts,
				);
			}
		} catch (error) {
			logError("Conflict detection failed:", error);
			// Non-critical - continue anyway
		}

		// Initialize history injection event listeners
		// This must be done before event registration so listeners are ready
		try {
			initHistoryInjection();
		} catch (error) {
			logError("History injection init failed:", error);
			// Non-critical - continue without it
		}

		// Register all event listeners
		try {
			registerAllEvents({
				[event_types.MESSAGE_SENT]: onMessageSent,
				[event_types.GENERATION_STARTED]: onGenerationStarted,
				[event_types.MESSAGE_RECEIVED]: onMessageReceived,
				[event_types.GENERATION_STOPPED]: onGenerationEnded,
				[event_types.GENERATION_ENDED]: onGenerationEnded,
				[event_types.CHAT_CHANGED]: [onCharacterChanged, updatePersonaAvatar],
				[event_types.MESSAGE_SWIPED]: onMessageSwiped,
				[event_types.MESSAGE_DELETED]: onMessageDeleted,
				[event_types.USER_MESSAGE_RENDERED]: updatePersonaAvatar,
				[event_types.SETTINGS_UPDATED]: updatePersonaAvatar,
			});
			// Re-populate connection profile dropdown when profiles are created/deleted/updated
			const onConnectionProfileChanged = () =>
				populateConnectionProfileDropdown();
			eventSource.on(
				event_types.CONNECTION_PROFILE_CREATED,
				onConnectionProfileChanged,
			);
			eventSource.on(
				event_types.CONNECTION_PROFILE_DELETED,
				onConnectionProfileChanged,
			);
			eventSource.on(
				event_types.CONNECTION_PROFILE_UPDATED,
				onConnectionProfileChanged,
			);
		} catch (error) {
			logError("Event registration failed:", error);
			throw error; // This is critical - can't continue without events
		}

		// Initialize snowflakes effect if enabled
		try {
			initSnowflakes();
		} catch (error) {
			logError("Snowflakes initialization failed:", error);
			// Non-critical - continue without it
		}

		log("✅ Extension loaded successfully.");
	} catch (error) {
		logError("❌ Critical initialization failure:", error);
		logError("Error details:", error.message, error.stack);

		// Show user-friendly error message
		toastr.error(
			"RPG Companion failed to initialize. Check console for details. Please try refreshing the page or resetting extension settings.",
			"RPG Companion Error",
			{ timeOut: 10000 },
		);
	}
});
