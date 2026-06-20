/**
 * Modal Management Module
 * Handles DiceModal and SettingsModal ES6 classes with state management
 */

import { getContext } from "../../../../../../extensions.js";
import { i18n } from "../../core/i18n.js";
import {
	clearCache,
	getTrackerDataForContext,
	saveChatData,
	saveSettings,
	updateMessageSwipeData,
} from "../../core/persistence.js";
import {
	$infoBoxContainer,
	$thoughtsContainer,
	$userStatsContainer,
	extensionSettings,
	FALLBACK_AVATAR_DATA_URI,
	getPendingDiceRoll,
	setPendingDiceRoll,
} from "../../core/state.js";
import {
	addDiceQuickReply as addDiceQuickReplyCore,
	clearDiceRoll as clearDiceRollCore,
	rollDice as rollDiceCore,
	updateDiceDisplay as updateDiceDisplayCore,
} from "../features/dice.js";
import {
	closeRelationshipsModal,
	openRelationshipsModal,
} from "../rendering/relationships.js";
import {
	removeCharacter,
	updateCharacterField,
} from "../rendering/thoughts.js";

/**
 * Modern DiceModal ES6 Class
 * Manages dice roller modal with proper state management and CSS classes
 */
export class DiceModal {
	constructor() {
		this.modal = document.getElementById("rpg-dice-popup");
		this.animation = document.getElementById("rpg-dice-animation");
		this.result = document.getElementById("rpg-dice-result");
		this.resultValue = document.getElementById("rpg-dice-result-value");
		this.resultDetails = document.getElementById("rpg-dice-result-details");
		this.rollBtn = document.getElementById("rpg-dice-roll-btn");

		this.state = "IDLE"; // IDLE, ROLLING, SHOWING_RESULT
		this.isAnimating = false;
	}

	/**
	 * Opens the modal with proper animation
	 */
	open() {
		if (this.isAnimating) return;

		// Apply theme
		const theme = extensionSettings.theme;
		this.modal.setAttribute("data-theme", theme);

		// Apply custom theme if needed
		if (theme === "custom") {
			this._applyCustomTheme();
		}

		// Reset to initial state
		this._setState("IDLE");

		// Open modal with CSS class
		this.modal.classList.add("is-open");
		this.modal.classList.remove("is-closing");

		// Focus management
		this.modal.querySelector("#rpg-dice-popup-close")?.focus();
	}

	/**
	 * Closes the modal with animation
	 */
	close() {
		if (this.isAnimating) return;

		this.isAnimating = true;
		this.modal.classList.add("is-closing");
		this.modal.classList.remove("is-open");

		// Wait for animation to complete
		setTimeout(() => {
			this.modal.classList.remove("is-closing");
			this.isAnimating = false;

			// Clear pending roll
			setPendingDiceRoll(null);
		}, 200);
	}

	/**
	 * Starts the rolling animation
	 */
	startRolling() {
		this._setState("ROLLING");
	}

	/**
	 * Shows the result
	 * @param {number} total - The total roll value
	 * @param {Array<number>} rolls - Individual roll values
	 */
	showResult(total, rolls) {
		this._setState("SHOWING_RESULT");

		// Update result values
		this.resultValue.textContent = total;
		this.resultValue.classList.add("is-animating");

		// Remove animation class after it completes
		setTimeout(() => {
			this.resultValue.classList.remove("is-animating");
		}, 500);

		// Show details if multiple rolls
		if (rolls && rolls.length > 1) {
			this.resultDetails.textContent = `Rolls: ${rolls.join(", ")}`;
		} else {
			this.resultDetails.textContent = "";
		}
	}

	/**
	 * Manages modal state changes
	 * @private
	 */
	_setState(newState) {
		this.state = newState;

		switch (newState) {
			case "IDLE":
				this.rollBtn.hidden = false;
				this.animation.hidden = true;
				this.result.hidden = true;
				break;

			case "ROLLING":
				this.rollBtn.hidden = true;
				this.animation.hidden = false;
				this.result.hidden = true;
				this.animation.setAttribute("aria-busy", "true");
				break;

			case "SHOWING_RESULT":
				this.rollBtn.hidden = true;
				this.animation.hidden = true;
				this.result.hidden = false;
				this.animation.setAttribute("aria-busy", "false");
				break;
		}
	}

	/**
	 * Applies custom theme colors
	 * @private
	 */
	_applyCustomTheme() {
		const content = this.modal.querySelector(".rpg-dice-popup-content");
		if (content && extensionSettings.customColors) {
			content.style.setProperty("--rpg-bg", extensionSettings.customColors.bg);
			content.style.setProperty(
				"--rpg-accent",
				extensionSettings.customColors.accent,
			);
			content.style.setProperty(
				"--rpg-text",
				extensionSettings.customColors.text,
			);
			content.style.setProperty(
				"--rpg-highlight",
				extensionSettings.customColors.highlight,
			);
		}
	}
}

/**
 * SettingsModal - Manages the settings popup modal
 * Handles opening, closing, theming, and animations
 */
export class SettingsModal {
	constructor() {
		this.modal = document.getElementById("rpg-settings-popup");
		this.content = this.modal?.querySelector(".rpg-settings-popup-content");
		this.isAnimating = false;
	}

	/**
	 * Opens the modal with proper animation
	 */
	open() {
		if (this.isAnimating || !this.modal) return;

		// Apply theme
		const theme = extensionSettings.theme || "default";
		this.modal.setAttribute("data-theme", theme);

		// Apply custom theme if needed
		if (theme === "custom") {
			this._applyCustomTheme();
		}

		// Open modal with CSS class
		this.modal.classList.add("is-open");
		this.modal.classList.remove("is-closing");

		// Focus management
		this.modal.querySelector("#rpg-close-settings")?.focus();
	}

	/**
	 * Closes the modal with animation
	 */
	close() {
		if (this.isAnimating || !this.modal) return;

		this.isAnimating = true;
		this.modal.classList.add("is-closing");
		this.modal.classList.remove("is-open");

		// Wait for animation to complete
		setTimeout(() => {
			this.modal.classList.remove("is-closing");
			this.isAnimating = false;
		}, 200);
	}

	/**
	 * Updates the theme in real-time (used when theme selector changes)
	 */
	updateTheme() {
		if (!this.modal) return;

		const theme = extensionSettings.theme || "default";
		this.modal.setAttribute("data-theme", theme);

		if (theme === "custom") {
			this._applyCustomTheme();
		} else {
			// Clear custom CSS variables to let theme CSS take over
			this._clearCustomTheme();
		}
	}

	/**
	 * Applies custom theme colors
	 * @private
	 */
	_applyCustomTheme() {
		if (!this.content || !extensionSettings.customColors) return;

		this.content.style.setProperty(
			"--rpg-bg",
			extensionSettings.customColors.bg,
		);
		this.content.style.setProperty(
			"--rpg-accent",
			extensionSettings.customColors.accent,
		);
		this.content.style.setProperty(
			"--rpg-text",
			extensionSettings.customColors.text,
		);
		this.content.style.setProperty(
			"--rpg-highlight",
			extensionSettings.customColors.highlight,
		);
	}

	/**
	 * Clears custom theme colors
	 * @private
	 */
	_clearCustomTheme() {
		if (!this.content) return;

		this.content.style.setProperty("--rpg-bg", "");
		this.content.style.setProperty("--rpg-accent", "");
		this.content.style.setProperty("--rpg-text", "");
		this.content.style.setProperty("--rpg-highlight", "");
	}
}

/**
 * PartialRefreshModal - Manages the partial refresh popup modal
 * Lets users select which sections to refresh before triggering generation
 */
export class PartialRefreshModal {
	constructor() {
		this.modal = document.getElementById("rpg-partial-refresh-popup");
		this.isAnimating = false;
		this.onExecute = null; // Callback set by index.js
	}

	/**
	 * Opens the modal with proper animation
	 */
	open() {
		if (this.isAnimating || !this.modal) return;

		// Apply theme
		const theme = extensionSettings.theme || "default";
		this.modal.setAttribute("data-theme", theme);

		// Restore previously saved selections
		this._restoreSelections();

		// Open modal with CSS class
		this.modal.classList.add("is-open");
		this.modal.classList.remove("is-closing");

		// Focus management
		this.modal.querySelector("#rpg-partial-refresh-close")?.focus();
	}

	/**
	 * Closes the modal with animation
	 */
	close() {
		if (this.isAnimating || !this.modal) return;

		this.isAnimating = true;
		this.modal.classList.add("is-closing");
		this.modal.classList.remove("is-open");

		setTimeout(() => {
			this.modal.classList.remove("is-closing");
			this.isAnimating = false;
		}, 200);
	}

	/**
	 * Gets the currently selected sections from checkboxes
	 * @returns {string[]} Array of section IDs (e.g. ['userStats', 'infoBox'])
	 */
	getSelectedSections() {
		if (!this.modal) return [];
		const checkboxes = this.modal.querySelectorAll(
			'.rpg-partial-refresh-sections input[type="checkbox"]',
		);
		const selected = [];
		checkboxes.forEach((cb) => {
			if (cb.checked) {
				selected.push(cb.value);
			}
		});
		return selected;
	}

	/**
	 * Saves current checkbox state to extensionSettings
	 */
	saveSelections() {
		extensionSettings.partialRefreshSelections = {};

		const checkboxes = this.modal.querySelectorAll(
			'.rpg-partial-refresh-sections input[type="checkbox"]',
		);
		checkboxes.forEach((cb) => {
			extensionSettings.partialRefreshSelections[cb.value] = cb.checked;
		});
	}

	/**
	 * Restores checkbox state from extensionSettings
	 * Falls back to trackerConfig for userStats sub-sections, show* settings for others
	 * @private
	 */
	_restoreSelections() {
		const saved = extensionSettings.partialRefreshSelections || {};
		const checkboxes = this.modal.querySelectorAll(
			'.rpg-partial-refresh-sections input[type="checkbox"]',
		);
		const trackerCfg = extensionSettings.trackerConfig?.userStats || {};
		checkboxes.forEach((cb) => {
			const section = cb.value;
			if (section in saved) {
				cb.checked = saved[section];
			} else if (section === "stats") {
				// Stats section is always enabled by default
				cb.checked = true;
			} else if (section === "status") {
				cb.checked = trackerCfg.statusSection?.enabled !== false;
			} else if (section === "skills") {
				cb.checked = trackerCfg.skillsSection?.enabled !== false;
			} else {
				// Fall back to show* setting
				const showKey =
					"show" + section.charAt(0).toUpperCase() + section.slice(1);
				cb.checked = extensionSettings[showKey] !== false;
			}
		});
		// Update execute button state based on initial selections
		this._updateExecuteButton();
	}

	/**
	 * Enables or disables the execute button based on whether any sections are selected
	 * @private
	 */
	_updateExecuteButton() {
		const btn = this.modal?.querySelector("#rpg-partial-refresh-execute");
		if (!btn) return;
		const selected = this.getSelectedSections();
		btn.disabled = selected.length === 0;
	}
}

// Global instances
let diceModal = null;
let settingsModal = null;
let partialRefreshModal = null;

/**
 * Sets up the dice roller functionality.
 * @returns {DiceModal} The initialized DiceModal instance
 */
export function setupDiceRoller() {
	// Initialize DiceModal instance
	diceModal = new DiceModal();

	// Click dice display to open popup
	$("#rpg-dice-display").on("click", () => {
		openDicePopup();
	});

	// Close popup - handle both close button and backdrop clicks
	$("#rpg-dice-popup-close").on("click", () => {
		closeDicePopup();
	});

	// Close on backdrop click (clicking outside content)
	$("#rpg-dice-popup").on("click", function (e) {
		if (e.target === this) {
			closeDicePopup();
		}
	});

	// Roll dice button
	$("#rpg-dice-roll-btn").on("click", async () => {
		await rollDiceCore(diceModal);
	});

	// Save roll button (closes popup and saves the roll)
	$("#rpg-dice-save-btn").on("click", () => {
		// Save the pending roll
		const roll = getPendingDiceRoll();
		if (roll) {
			extensionSettings.lastDiceRoll = roll;
			saveSettings();
			updateDiceDisplayCore();
			setPendingDiceRoll(null);
		}
		closeDicePopup();
	});

	// Reset on Enter key
	$("#rpg-dice-count, #rpg-dice-sides").on("keypress", (e) => {
		if (e.which === 13) {
			rollDiceCore(diceModal);
		}
	});

	// Clear dice roll button
	$("#rpg-clear-dice").on("click", (e) => {
		e.stopPropagation(); // Prevent opening the dice popup
		clearDiceRollCore();
	});
	$("#rpg-clear-dice").attr(
		"title",
		i18n.getTranslation("template.mainPanel.clearLastRoll"),
	);

	return diceModal;
}

/**
 * Sets up the settings popup functionality.
 * @returns {SettingsModal} The initialized SettingsModal instance
 */
export function setupSettingsPopup() {
	// Initialize SettingsModal instance
	settingsModal = new SettingsModal();

	// Open settings popup
	$("#rpg-open-settings").on("click", () => {
		openSettingsPopup();
	});

	// Close settings popup - close button
	$("#rpg-close-settings").on("click", () => {
		closeSettingsPopup();
	});

	// Close on backdrop click (clicking outside content)
	$("#rpg-settings-popup").on("click", function (e) {
		if (e.target === this) {
			closeSettingsPopup();
		}
	});

	// Clear cache button with dropdown
	$("#rpg-clear-cache").on("click", (e) => {
		e.stopPropagation(); // Prevent click from triggering dropdown toggle

		const $dropdown = $("#rpg-clear-cache-options");
		const isVisible = $dropdown.css("display") === "block";

		// Close any other open dropdowns
		$(".rpg-clear-cache-options").not($dropdown).css("display", "none");

		if (isVisible) {
			$dropdown.css("display", "none");
		} else {
			$dropdown.css("display", "block");
		}
	});

	// Close dropdown when clicking anywhere else
	$(document).on("click", (e) => {
		if (
			!$(e.target).closest("#rpg-clear-cache").length &&
			!$(e.target).closest("#rpg-clear-cache-options").length
		) {
			$("#rpg-clear-cache-options").css("display", "none");
		}
	});

	// Handle dropdown option changes
	$("#rpg-clear-cache-options").on(
		"click",
		'input[name="rpg-clear-cache-type"]',
		function () {
			const isCustom = $(this).val() === "custom";

			if (isCustom) {
				// Show custom options when custom is selected
				$("#rpg-clear-cache-custom-options").css("display", "block");
			} else {
				// Hide custom options when all data is selected
				$("#rpg-clear-cache-custom-options").css("display", "none");
			}
		},
	);

	// Handle clear cache execute button click
	$("#rpg-clear-cache-execute").on("click", (e) => {
		e.stopPropagation();

		// Get selected options
		const scope = $('input[name="rpg-clear-cache-scope"]:checked').val();
		const dataType = $('input[name="rpg-clear-cache-type"]:checked').val();

		// Get custom selections if custom type is selected
		const customSelection = [];
		if (dataType === "custom") {
			$(
				'#rpg-clear-cache-custom-options input[name="rpg-clear-cache-custom"]:checked',
			).each(function () {
				customSelection.push($(this).val());
			});
		}

		// Clear the dropdown
		$("#rpg-clear-cache-options").css("display", "none");

		// Execute clear based on options
		clearCache({
			scope: scope,
			dataType: dataType,
			customSelection: customSelection,
		});
	});

	return settingsModal;
}

/**
 * Opens the dice rolling popup.
 * Backwards compatible wrapper for DiceModal class.
 */
export function openDicePopup() {
	if (diceModal) {
		diceModal.open();
	}
}

/**
 * Closes the dice rolling popup.
 * Backwards compatible wrapper for DiceModal class.
 */
export function closeDicePopup() {
	if (diceModal) {
		diceModal.close();
	}
}

/**
 * Opens the settings popup.
 * Backwards compatible wrapper for SettingsModal class.
 */
export function openSettingsPopup() {
	if (settingsModal) {
		settingsModal.open();
	}
}

/**
 * Closes the settings popup.
 * Backwards compatible wrapper for SettingsModal class.
 */
export function closeSettingsPopup() {
	if (settingsModal) {
		settingsModal.close();
	}
}

/**
 * @deprecated Legacy function - use diceModal._applyCustomTheme() instead
 */
export function applyCustomThemeToPopup() {
	if (diceModal) {
		diceModal._applyCustomTheme();
	}
}

/**
 * Clears the last dice roll.
 * Backwards compatible wrapper for dice module.
 */
export function clearDiceRoll() {
	clearDiceRollCore();
}

/**
 * Updates the dice display in the sidebar.
 * Backwards compatible wrapper for dice module.
 */
export function updateDiceDisplay() {
	updateDiceDisplayCore();
}

/**
 * Adds the Roll Dice quick reply button.
 * Backwards compatible wrapper for dice module.
 */
export function addDiceQuickReply() {
	addDiceQuickReplyCore();
}

/**
 * Returns the SettingsModal instance for external use
 * @returns {SettingsModal} The global SettingsModal instance
 */
export function getSettingsModal() {
	return settingsModal;
}

/**
 * Sets up the partial refresh popup functionality.
 * @returns {PartialRefreshModal} The initialized PartialRefreshModal instance
 */
export function setupPartialRefreshPopup() {
	partialRefreshModal = new PartialRefreshModal();

	// Close button
	$("#rpg-partial-refresh-close").on("click", () => {
		closePartialRefreshPopup();
	});

	// Cancel button
	$("#rpg-partial-refresh-cancel").on("click", () => {
		closePartialRefreshPopup();
	});

	// Close on backdrop click
	$("#rpg-partial-refresh-popup").on("click", function (e) {
		if (e.target === this) {
			closePartialRefreshPopup();
		}
	});

	// Execute button
	$("#rpg-partial-refresh-execute").on("click", () => {
		if (partialRefreshModal) {
			// Save selections before executing
			partialRefreshModal.saveSelections();
			const selected = partialRefreshModal.getSelectedSections();
			partialRefreshModal.close();
			if (partialRefreshModal.onExecute && selected.length > 0) {
				partialRefreshModal.onExecute(selected);
			}
		}
	});

	// Update execute button state when checkboxes change
	const checkboxes = document.querySelectorAll(
		'.rpg-partial-refresh-sections input[type="checkbox"]',
	);
	checkboxes.forEach((cb) => {
		cb.addEventListener("change", () => {
			partialRefreshModal?._updateExecuteButton();
		});
	});

	return partialRefreshModal;
}

/**
 * Opens the partial refresh popup.
 */
export function openPartialRefreshPopup() {
	if (partialRefreshModal) {
		partialRefreshModal.open();
	}
}

/**
 * Closes the partial refresh popup.
 */
export function closePartialRefreshPopup() {
	if (partialRefreshModal) {
		partialRefreshModal.close();
	}
}

/**
 * Returns the PartialRefreshModal instance for external use
 * @returns {PartialRefreshModal} The global PartialRefreshModal instance
 */
export function getPartialRefreshModal() {
	return partialRefreshModal;
}

/**
 * Sets up the relationships popup functionality.
 */
export function setupRelationshipsPopup() {
	// Open relationships modal
	$("#rpg-open-relationships").on("click", () => {
		openRelationshipsModal();
	});

	// Close button (X)
	$("#rpg-close-relationships").on("click", () => {
		closeRelationshipsModal();
	});

	// Close button (footer)
	$("#rpg-close-relationships-btn").on("click", () => {
		closeRelationshipsModal();
	});

	// Close on backdrop click
	$("#rpg-relationships-popup").on("click", function (e) {
		if (e.target === this) {
			closeRelationshipsModal();
		}
	});
}

/**
 * Converts a field name to snake_case
 * @param {string} name - Field name to convert
 * @returns {string} snake_case version
 */
function toSnakeCase(name) {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

/**
 * Gets an icon for a field name
 * @param {string} fieldName - The field name
 * @returns {string} Font Awesome icon class
 */
function getFieldIcon(fieldName) {
	const iconMap = {
		appearance: "fa-user",
		demeanor: "fa-masks-theater",
		thoughts: "fa-comment-dots",
		mood: "fa-face-smile",
		outfit: "fa-shirt",
		location: "fa-location-dot",
		activity: "fa-person-walking",
		status: "fa-heart-pulse",
		health: "fa-heart",
		energy: "fa-bolt",
		inventory: "fa-bag-shopping",
		notes: "fa-sticky-note",
	};

	const lowerName = fieldName.toLowerCase();
	return iconMap[lowerName] || "fa-circle-info";
}

/**
 * CharacterDetailModal - Manages the character detail popup modal
 * Shows full character information when clicking a compact character card
 */
export class CharacterDetailModal {
	constructor() {
		this.modal = document.getElementById("rpg-character-detail-popup");
		this.characterName = null;
		this.isAnimating = false;
	}

	/**
	 * Opens the modal for a specific character
	 * @param {string} characterName - The name of the character to display
	 */
	open(characterName) {
		if (this.isAnimating || !this.modal) return;

		console.log(
			`[RPG Companion] Opening character detail modal for: ${characterName}`,
		);
		this.characterName = characterName;
		this._populateCharacterData();
		this._setupEventHandlers();

		// Apply theme
		const theme = extensionSettings.theme || "default";
		this.modal.setAttribute("data-theme", theme);

		// Open modal with CSS class
		this.modal.classList.add("is-open");
		this.modal.classList.remove("is-closing");
		this.modal.style.display = "flex";

		// Focus management
		this.modal.querySelector("#rpg-close-character-detail")?.focus();
	}

	/**
	 * Closes the modal with animation
	 */
	close() {
		if (this.isAnimating || !this.modal) return;

		console.log(`[RPG Companion] Closing character detail modal`);
		this.isAnimating = true;
		this.modal.classList.add("is-closing");
		this.modal.classList.remove("is-open");

		setTimeout(() => {
			this.modal.classList.remove("is-closing");
			this.modal.style.display = "none";
			this.isAnimating = false;
			this.characterName = null;
		}, 200);
	}

	/**
	 * Populates the modal with character data
	 * @private
	 */
	_populateCharacterData() {
		// Get character thoughts data from swipe store
		const characterThoughtsData = getTrackerDataForContext("characterThoughts");
		console.log(
			`[RPG Companion] Character thoughts data:`,
			characterThoughtsData,
		);

		if (!characterThoughtsData) {
			console.warn(`[RPG Companion] No character thoughts data found`);
			this.close();
			return;
		}

		// Parse the data
		let parsedData;
		try {
			parsedData =
				typeof characterThoughtsData === "object"
					? characterThoughtsData
					: JSON.parse(characterThoughtsData);
			console.log(`[RPG Companion] Parsed data:`, parsedData);
		} catch (e) {
			console.warn(
				`[RPG Companion] Failed to parse character thoughts data:`,
				e,
			);
			this.close();
			return;
		}

		// Get characters array
		const charactersArray = Array.isArray(parsedData)
			? parsedData
			: parsedData.characters || [];

		console.log(
			`[RPG Companion] Characters array (${charactersArray.length} items):`,
			charactersArray,
		);

		const character = charactersArray.find(
			(c) =>
				c.name && c.name.toLowerCase() === this.characterName.toLowerCase(),
		);

		if (!character) {
			console.warn(
				`[RPG Companion] Character not found: ${this.characterName}`,
			);
			this.close();
			return;
		}

		console.log(`[RPG Companion] Found character:`, character);

		// Get tracker config for enabled fields
		const presentCharsConfig =
			extensionSettings.trackerConfig?.presentCharacters;
		const enabledFields =
			presentCharsConfig?.customFields?.filter((f) => f?.enabled && f?.name) ||
			[];
		const characterStatsConfig = presentCharsConfig?.characterStats;
		const enabledCharStats =
			(characterStatsConfig?.enabled &&
				characterStatsConfig?.customStats?.filter(
					(s) => s?.enabled && s?.name,
				)) ||
			[];

		// Get avatar - use fallback from state
		const portrait =
			extensionSettings.npcAvatars?.[character.name] ||
			this._getCharacterAvatar(character.name);

		// Get relationship badge
		const relationship = this._getCharacterRelationship(character.name);
		const isInScene = character.inScene !== false;

		// Update header
		$("#rpg-character-detail-avatar").attr("src", portrait);
		$("#rpg-character-detail-emoji").text(character.emoji || "👤");
		$("#rpg-character-detail-name").text(character.name);

		// Show relationship status
		if (relationship) {
			$("#rpg-character-detail-relationship-badge")
				.html(
					`<span class="rpg-rel-emoji">${relationship.emoji || "❤️"}</span> ${relationship.status || "Unknown"}`,
				)
				.show();
		} else {
			$("#rpg-character-detail-relationship-badge").hide();
		}

		// Update scene status
		const $sceneStatus = $("#rpg-character-detail-scene-status");
		$sceneStatus.removeClass("in-scene not-in-scene");
		$sceneStatus.addClass(isInScene ? "in-scene" : "not-in-scene");
		$sceneStatus.html(
			`<i class="fa-solid ${isInScene ? "fa-eye" : "fa-eye-slash"}"></i> ${isInScene ? i18n.getTranslation("thoughts.inScene") : i18n.getTranslation("thoughts.notInScene")}`,
		);

		// Build dynamic fields HTML
		const $body = $(".rpg-character-detail-popup-body");
		$body.empty();

		// Get details object
		const details = character.details || {};

		// Render each enabled custom field
		for (const field of enabledFields) {
			const fieldName = field.name;
			// Try multiple variations of the field name
			const fieldValue =
				details[fieldName] ||
				details[fieldName.toLowerCase()] ||
				details[toSnakeCase(fieldName)] ||
				character[fieldName] ||
				character[toSnakeCase(fieldName)] ||
				"";

			const fieldIcon = getFieldIcon(fieldName);

			const $section = $(`
				<div class="rpg-character-detail-section">
					<h4><i class="fa-solid ${fieldIcon}"></i> <span>${fieldName}</span></h4>
					<div class="rpg-editable rpg-character-detail-field" contenteditable="true" data-field="${fieldName}">${fieldValue}</div>
				</div>
			`);
			$body.append($section);
		}

		// Render stats if enabled
		if (enabledCharStats.length > 0) {
			const stats = character.stats || {};
			const $statsSection = $(`
				<div class="rpg-character-detail-section" id="rpg-character-detail-stats-section">
					<h4><i class="fa-solid fa-chart-bar"></i> <span data-i18n-key="thoughts.stats">Stats</span></h4>
					<div class="rpg-character-detail-stats-grid"></div>
				</div>
			`);
			const $statsGrid = $statsSection.find(".rpg-character-detail-stats-grid");

			for (const stat of enabledCharStats) {
				let statValue = 100; // Default value
				// Handle array format: [{name: "Health", value: 80}]
				if (Array.isArray(stats)) {
					const statObj = stats.find((s) => s.name === stat.name);
					if (statObj && statObj.value !== undefined) {
						statValue = statObj.value;
					}
				} else if (typeof stats === "object") {
					// Handle object format: {Health: 80, Energy: 95}
					statValue = stats[stat.name] ?? 100;
				}

				const $statItem = $(`
					<div class="rpg-character-detail-stat-item">
						<span class="rpg-character-detail-stat-label">${stat.name}</span>
						<span class="rpg-character-detail-stat-value">${statValue}${typeof statValue === "number" ? "%" : ""}</span>
					</div>
				`);
				$statsGrid.append($statItem);
			}

			$body.append($statsSection);
		}

		// Setup editable field handlers
		$(".rpg-character-detail-field")
			.off("blur.characterDetail")
			.on(
				"blur.characterDetail",
				function () {
					const field = $(this).data("field");
					const value = $(this).text().trim();
					updateCharacterField(this.characterName, field, value);
				}.bind(this),
			);
	}

	/**
	 * Gets the avatar URL for a character
	 * @private
	 */
	_getCharacterAvatar(characterName) {
		try {
			const context = getContext();
			const characters = context.characters || [];

			// Try to find the character in the list
			const char = characters.find(
				(c) => c.name && c.name.toLowerCase() === characterName.toLowerCase(),
			);

			if (char?.avatar && char.avatar !== "none") {
				// Use getSafeThumbnailUrl if available
				const { getSafeThumbnailUrl } = require("../../utils/avatars.js");
				if (getSafeThumbnailUrl) {
					const thumbnailUrl = getSafeThumbnailUrl("avatar", char.avatar);
					if (thumbnailUrl) return thumbnailUrl;
				}
				return char.avatar;
			}
		} catch (e) {
			console.warn(
				`[RPG Companion] Error getting avatar for ${characterName}:`,
				e,
			);
		}

		// Return fallback avatar
		return FALLBACK_AVATAR_DATA_URI;
	}

	/**
	 * Gets the relationship for a character
	 * @private
	 */
	_getCharacterRelationship(characterName) {
		const relationshipsData = getTrackerDataForContext("relationships");
		if (!relationshipsData) return null;

		let relationships;
		try {
			relationships =
				typeof relationshipsData === "object"
					? relationshipsData
					: JSON.parse(relationshipsData);
		} catch {
			return null;
		}

		const userName = getContext()?.name1;
		if (!userName) return null;

		return relationships.find(
			(r) =>
				(r.character1 === userName && r.character2 === characterName) ||
				(r.character2 === userName && r.character1 === characterName),
		);
	}

	/**
	 * Sets up event handlers for the modal
	 * @private
	 */
	_setupEventHandlers() {
		const self = this;

		// Close button (X)
		$("#rpg-close-character-detail")
			.off("click.characterDetail")
			.on("click.characterDetail", (e) => {
				e.preventDefault();
				e.stopPropagation();
				console.log(`[RPG Companion] Close button (X) clicked`);
				self.close();
			});

		// Close button (footer)
		$("#rpg-character-detail-close-btn")
			.off("click.characterDetail")
			.on("click.characterDetail", (e) => {
				e.preventDefault();
				e.stopPropagation();
				console.log(`[RPG Companion] Close button (footer) clicked`);
				self.close();
			});

		// Close on backdrop click
		$("#rpg-character-detail-popup")
			.off("click.characterDetail")
			.on("click.characterDetail", function (e) {
				if (e.target === this) {
					console.log(`[RPG Companion] Backdrop clicked, closing modal`);
					self.close();
				}
			});

		// Toggle scene status
		$("#rpg-character-detail-toggle-scene")
			.off("click.characterDetail")
			.on("click.characterDetail", (e) => {
				e.preventDefault();
				e.stopPropagation();
				self._toggleSceneStatus();
			});

		// Remove character
		$("#rpg-character-detail-remove")
			.off("click.characterDetail")
			.on("click.characterDetail", (e) => {
				e.preventDefault();
				e.stopPropagation();
				self._removeCharacter();
			});

		// Avatar upload
		$("#rpg-character-detail-avatar-upload")
			.off("click.characterDetail")
			.on("click.characterDetail", (e) => {
				e.preventDefault();
				e.stopPropagation();
				self._uploadAvatar();
			});

		// Editable fields
		$(".rpg-character-detail-field")
			.off("blur.characterDetail")
			.on("blur.characterDetail", function () {
				const field = $(this).data("field");
				const value = $(this).text().trim();
				self._updateField(field, value);
			});
	}

	/**
	 * Toggles the character's scene status
	 * @private
	 */
	_toggleSceneStatus() {
		if (!this.characterName) return;

		const trackerData = getTrackerDataForContext();
		const character = trackerData?.presentCharacters?.find(
			(c) => c.name === this.characterName,
		);

		if (!character) return;

		const newInScene = character.inScene !== false;
		updateCharacterField(this.characterName, "inScene", !newInScene);
		this._populateCharacterData();
	}

	/**
	 * Removes the character from the tracker
	 * @private
	 */
	_removeCharacter() {
		if (!this.characterName) return;

		if (confirm(i18n.getTranslation("thoughts.confirmRemove"))) {
			removeCharacter(this.characterName);
			this.close();
		}
	}

	/**
	 * Handles avatar upload
	 * @private
	 */
	_uploadAvatar() {
		if (!this.characterName) return;

		const fileInput = $(
			'<input type="file" accept="image/*" style="display: none;">',
		);

		fileInput.on("change", () => {
			const file = fileInput[0].files[0];
			if (!file) return;

			const reader = new FileReader();
			reader.onload = (e) => {
				const imageUrl = e.target.result;

				if (!extensionSettings.npcAvatars) {
					extensionSettings.npcAvatars = {};
				}
				extensionSettings.npcAvatars[this.characterName] = imageUrl;
				saveSettings();

				$("#rpg-character-detail-avatar").attr("src", imageUrl);
				console.log(
					`[RPG Companion] Avatar uploaded for ${this.characterName}`,
				);
			};

			reader.readAsDataURL(file);
		});

		fileInput.trigger("click");
	}

	/**
	 * Updates a character field
	 * @private
	 */
	_updateField(field, value) {
		if (!this.characterName || !field) return;
		updateCharacterField(this.characterName, field, value);
	}
}

// Global instance
let characterDetailModal = null;

/**
 * Sets up the character detail modal functionality.
 * @returns {CharacterDetailModal} The initialized CharacterDetailModal instance
 */
export function setupCharacterDetailPopup() {
	characterDetailModal = new CharacterDetailModal();

	// Listen for custom event from thoughts.js
	document.addEventListener("rpg-open-character-detail", (e) => {
		const { characterName } = e.detail;
		console.log(
			`[RPG Companion] Received rpg-open-character-detail event for: ${characterName}`,
		);
		if (characterDetailModal && characterName) {
			characterDetailModal.open(characterName);
		}
	});

	return characterDetailModal;
}

/**
 * Opens the character detail popup.
 * @param {string} characterName - The name of the character to display
 */
export function openCharacterDetailPopup(characterName) {
	if (characterDetailModal && characterName) {
		characterDetailModal.open(characterName);
	}
}

/**
 * Closes the character detail popup.
 */
export function closeCharacterDetailPopup() {
	if (characterDetailModal) {
		characterDetailModal.close();
	}
}

/**
 * Returns the CharacterDetailModal instance for external use
 * @returns {CharacterDetailModal} The global CharacterDetailModal instance
 */
export function getCharacterDetailModal() {
	return characterDetailModal;
}
