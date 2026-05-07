/**
 * Modal Management Module
 * Handles DiceModal and SettingsModal ES6 classes with state management
 */

import { getContext } from "../../../../../../extensions.js";
import { i18n } from "../../core/i18n.js";
import {
	clearCache,
	saveChatData,
	saveSettings,
	updateMessageSwipeData,
} from "../../core/persistence.js";
import {
	$infoBoxContainer,
	$thoughtsContainer,
	$userStatsContainer,
	extensionSettings,
	getPendingDiceRoll,
	setPendingDiceRoll,
} from "../../core/state.js";
import {
	addDiceQuickReply as addDiceQuickReplyCore,
	clearDiceRoll as clearDiceRollCore,
	rollDice as rollDiceCore,
	updateDiceDisplay as updateDiceDisplayCore,
} from "../features/dice.js";

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
