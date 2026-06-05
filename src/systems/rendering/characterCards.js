/**
 * Character Cards Rendering Module
 * Handles rendering of character card entries in a dedicated modal.
 * Cards are stored in lorebook entries and rendered here for viewing/editing.
 */

import { escapeHtml } from "../../utils/html.js";
import { i18n } from "../../core/i18n.js";
import { extensionSettings } from "../../core/state.js";
import {
	getAllCharacterCards,
	saveCharacterCard,
	deleteCharacterCard,
	getLorebookOptionsForDropdown,
	getCharacterCardLorebookForChat,
	setCharacterCardLorebookForChat,
	getCharacterCardCounter,
} from "../generation/characterCardLorebookManager.js";
import { updateCharacterCards } from "../generation/characterCardApiClient.js";

/** Tracks the currently focused character name (from the thoughts.js button click) */
let _focusedCharacterName = null;
/** Tracks whether there are unsaved changes in the modal */
let _hasUnsavedChanges = false;

/**
 * Renders the character cards modal content.
 * Fetches all cards from the lorebook and displays them.
 */
export async function renderCharacterCards() {
	const $modal = $("#rpg-character-cards-popup");
	if (!$modal.length) return;

	const $body = $modal.find(".rpg-character-cards-popup-body");

	// Get the current lorebook selection for this chat
	const currentLorebook = getCharacterCardLorebookForChat();

	// Build lorebook dropdown for the entire chat (not per-card)
	const lorebookOptions = getLorebookOptionsForDropdown();
	let lorebookSelectHtml = `<select id="rpg-character-cards-lorebook-select" class="rpg-character-cards-lorebook-select" title="${i18n.getTranslation("characterCards.lorebookLabel")}">`;
	for (const opt of lorebookOptions) {
		const selected = opt.value === currentLorebook ? " selected" : "";
		lorebookSelectHtml += `<option value="${escapeHtml(opt.value)}"${selected}>${escapeHtml(opt.label)}</option>`;
	}
	lorebookSelectHtml += "</select>";

	// Build header with lorebook selector
	let html = '<div class="rpg-character-cards-header">';
	html += `<label class="rpg-character-cards-lorebook-label">${i18n.getTranslation("characterCards.lorebookLabel")}:</label>`;
	html += lorebookSelectHtml;
	html += '</div>';

	// Build settings row with counter and update interval
	const currentCounter = getCharacterCardCounter();
	const updateInterval = extensionSettings.characterCards?.updateInterval ?? 10;
	html += '<div class="rpg-character-cards-settings">';
	html += `<div class="rpg-character-cards-setting">`;
	html += `<span class="rpg-character-cards-setting-label">${i18n.getTranslation("characterCards.counterLabel")}:</span>`;
	html += `<span class="rpg-character-cards-setting-value">${currentCounter}/${updateInterval}</span>`;
	html += `</div>`;
	html += `<div class="rpg-character-cards-setting">`;
	html += `<label class="rpg-character-cards-setting-label" for="rpg-character-cards-interval">${i18n.getTranslation("characterCards.updateIntervalLabel")}:</label>`;
	html += `<input type="number" id="rpg-character-cards-interval" class="rpg-character-cards-setting-input" value="${updateInterval}" min="0" max="100" step="1">`;
	html += `</div>`;
	html += '</div>';

	// Fetch all cards
	const cards = await getAllCharacterCards();

	if (!cards || cards.length === 0) {
		html += `<div class="rpg-character-cards-empty">${i18n.getTranslation("characterCards.noCards")}</div>`;
		$body.html(html);
		_attachLorebookHandler($body);
		return;
	}

	// Get enabled fields for display order
	const config = extensionSettings.characterCards || {};
	const allFields = [
		...(config.fields || []),
		...(config.customFields || []).map((f) => ({
			id: f.id,
			name: f.name,
			enabled: true,
			description: f.description || f.name,
		})),
	];
	const enabledFields = allFields.filter((f) => f.enabled);

	html += '<div class="rpg-character-cards-list">';

	for (const card of cards) {
		const charName = card.characterName || "Unknown";
		const cardData = card.cardData || {};
		const isFocused = _focusedCharacterName && _focusedCharacterName.toLowerCase() === charName.toLowerCase();
		const isExpanded = isFocused;

		// Build card HTML - collapsed by default, expand if focused
		html += `<div class="rpg-character-card${isFocused ? " rpg-character-card-focused" : ""}${isExpanded ? " expanded" : ""}" data-character="${escapeHtml(charName)}">`;
		html += `<div class="rpg-character-card-header">`;
		html += `<i class="fa-solid fa-chevron-right rpg-character-card-expand-icon" aria-hidden="true"></i>`;
		html += `<span class="rpg-character-card-name"><i class="fa-solid fa-id-card" aria-hidden="true"></i> ${escapeHtml(charName)}</span>`;
		html += `<div class="rpg-character-card-actions">`;
		html += `<button class="rpg-character-card-save rpg-btn-small" data-character="${escapeHtml(charName)}" title="${i18n.getTranslation("characterCards.save")}"><i class="fa-solid fa-floppy-disk"></i></button>`;
		html += `<button class="rpg-character-card-delete rpg-btn-small rpg-btn-danger" data-character="${escapeHtml(charName)}" title="${i18n.getTranslation("characterCards.delete")}"><i class="fa-solid fa-trash"></i></button>`;
		html += `</div>`;
		html += `</div>`;

		// Render fields
		html += '<div class="rpg-character-card-fields">';

		// Always show name first (from card data)
		if (cardData.name) {
			html += _renderField("name", "Name", cardData.name);
		}

		// Render enabled fields in order
		for (const field of enabledFields) {
			if (field.id === "name") continue; // Already rendered above
			const value = cardData[field.id];
			if (value !== undefined && value !== null) {
				html += _renderField(field.id, field.name, value);
			}
		}

		// Render any extra fields in the card data that aren't in the enabled fields list
		const knownFieldIds = new Set(enabledFields.map((f) => f.id));
		for (const [key, value] of Object.entries(cardData)) {
			if (key === "name") continue;
			if (knownFieldIds.has(key)) continue;
			if (value !== undefined && value !== null) {
				html += _renderField(key, key, value);
			}
		}

		// Render trigger keywords field
		const triggerKeywords = card.triggerKeywords || [];
		const keywordsValue = Array.isArray(triggerKeywords) ? triggerKeywords.join(", ") : "";
		html += `<div class="rpg-character-card-field rpg-character-card-keywords-field" data-field-id="_triggerKeywords">`;
		html += `<div class="rpg-character-card-field-label">${i18n.getTranslation("characterCards.triggerKeywords")}</div>`;
		html += `<div class="rpg-character-card-field-value rpg-editable" contenteditable="true" data-placeholder="${i18n.getTranslation("characterCards.editField")}">${escapeHtml(keywordsValue)}</div>`;
		html += `<div class="rpg-character-card-field-note">${i18n.getTranslation("characterCards.triggerKeywordsNote")}</div>`;
		html += `</div>`;

		html += "</div>"; // .rpg-character-card-fields
		html += "</div>"; // .rpg-character-card
	}

	html += "</div>"; // .rpg-character-cards-list
	$body.html(html);

	// Attach event handlers
	_attachCardHandlers($body);
	_attachLorebookHandler($body);

	// Scroll to focused card if applicable
	if (_focusedCharacterName) {
		const $focused = $body.find(".rpg-character-card-focused");
		if ($focused.length) {
			setTimeout(() => {
				$focused[0].scrollIntoView({ behavior: "smooth", block: "center" });
			}, 100);
		}
	}

	// Clear focused character after rendering
	_focusedCharacterName = null;
}

/**
 * Attaches event handler for the lorebook dropdown.
 * @param {jQuery} $body - The modal body element
 */
function _attachLorebookHandler($body) {
	$body.find("#rpg-character-cards-lorebook-select").on("change", function () {
		const lorebookName = $(this).val() || "";
		setCharacterCardLorebookForChat(lorebookName);
	});
}

/**
 * Renders a single field row for a character card.
 * @param {string} fieldId - The field identifier
 * @param {string} fieldLabel - The display label
 * @param {string} value - The field value
 * @returns {string} HTML string for the field
 */
function _renderField(fieldId, fieldLabel, value) {
	const escapedValue = escapeHtml(String(value));
	const editTitle = i18n.getTranslation("characterCards.editField");

	return `<div class="rpg-character-card-field" data-field-id="${escapeHtml(fieldId)}">
		<span class="rpg-character-card-field-label">${escapeHtml(fieldLabel)}</span>
		<span class="rpg-character-card-field-value rpg-editable" contenteditable="true"
			data-field="${escapeHtml(fieldId)}"
			data-placeholder="—"
			title="${editTitle}">${escapedValue}</span>
	</div>`;
}

/**
 * Attaches event handlers for card interactions (save, delete, edit).
 * @param {jQuery} $body - The modal body element
 */
function _attachCardHandlers($body) {
	// Save button per card
	$body.find(".rpg-character-card-save").on("click", async function () {
		const $btn = $(this);
		const characterName = $btn.data("character");
		const $card = $btn.closest(".rpg-character-card");

		// Collect field values from the card
		const { cardData, triggerKeywords } = _collectCardData($card);
		// Get the lorebook from the per-chat dropdown
		const lorebookName = getCharacterCardLorebookForChat();

		$btn.prop("disabled", true);
		$btn.find("i").removeClass("fa-floppy-disk").addClass("fa-spinner fa-spin");

		const success = await saveCharacterCard(characterName, cardData, triggerKeywords, lorebookName);

		$btn.prop("disabled", false);
		$btn.find("i").removeClass("fa-spinner fa-spin").addClass("fa-floppy-disk");

		if (success) {
			$btn.addClass("rpg-btn-success");
			$card.removeClass("rpg-character-card-dirty");
			_hasUnsavedChanges = false;
			setTimeout(() => $btn.removeClass("rpg-btn-success"), 1500);
		}
	});

	// Delete button per card
	$body.find(".rpg-character-card-delete").on("click", async function () {
		const $btn = $(this);
		const characterName = $btn.data("character");

		const confirmed = confirm(
			i18n.getTranslation("characterCards.confirmDelete"),
		);
		if (!confirmed) return;

		$btn.prop("disabled", true);
		$btn.find("i").removeClass("fa-trash").addClass("fa-spinner fa-spin");

		const success = await deleteCharacterCard(characterName);

		if (success) {
			// Remove the card from the DOM with animation
			const $card = $btn.closest(".rpg-character-card");
			$card.addClass("rpg-character-card-removing");
			setTimeout(() => {
				$card.remove();
				// Check if list is now empty
				if ($body.find(".rpg-character-card").length === 0) {
					$body.html(
						`<div class="rpg-character-cards-empty">${i18n.getTranslation("characterCards.noCards")}</div>`,
					);
				}
			}, 300);
		} else {
			$btn.prop("disabled", false);
			$btn.find("i").removeClass("fa-spinner fa-spin").addClass("fa-trash");
		}
	});

	// Expand/collapse card header
	$body.find(".rpg-character-card-header").on("click", function (e) {
		// Don't toggle if clicking on action buttons
		if ($(e.target).closest(".rpg-character-card-actions").length) return;
		const $card = $(this).closest(".rpg-character-card");
		$card.toggleClass("expanded");
	});

	// Editable field handlers
	$body.find(".rpg-editable").on("blur", function () {
		// Mark the card as having unsaved changes
		const $card = $(this).closest(".rpg-character-card");
		$card.addClass("rpg-character-card-dirty");
		_hasUnsavedChanges = true;
	});

	// Prevent click events on editable elements from bubbling
	$body.find(".rpg-editable").on("click mousedown", (e) => {
		e.stopPropagation();
	});

	// Handle empty field focus
	$body.find(".rpg-editable.rpg-empty-field").on("focus", function () {
		$(this).removeClass("rpg-empty-field");
	});

	// Handle Enter key on editable fields
	$body.find(".rpg-editable").on("keydown", function (e) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			$(this).trigger("blur");
		}
	});

	// Update interval setting
	$body.find("#rpg-character-cards-interval").on("change", function () {
		const value = parseInt($(this).val(), 10);
		if (!Number.isNaN(value) && value >= 0) {
			if (!extensionSettings.characterCards) {
				extensionSettings.characterCards = {};
			}
			extensionSettings.characterCards.updateInterval = value;
			// Update the counter display
			const $counterDisplay = $body.find(".rpg-character-cards-setting-value");
			const currentCounter = getCharacterCardCounter();
			$counterDisplay.text(`${currentCounter}/${value}`);
		}
	});
}

/**
 * Collects field data from a card DOM element.
 * @param {jQuery} $card - The card element
 * @returns {Object} The card data object
 */
function _collectCardData($card) {
	const cardData = {};
	let triggerKeywords = [];

	$card.find(".rpg-character-card-field").each(function () {
		const fieldId = $(this).data("field-id");
		const $value = $(this).find(".rpg-character-card-field-value");
		const value = $value.text().trim();

		if (fieldId === "_triggerKeywords") {
			// Parse trigger keywords as comma-separated values
			triggerKeywords = value.split(",").map((k) => k.trim()).filter(Boolean);
		} else if (fieldId && value) {
			cardData[fieldId] = value;
		}
	});

	return { cardData, triggerKeywords };
}

/**
 * Opens the character cards modal.
 * @param {string} [focusCharacterName] - Optional character name to scroll to
 */
export async function openCharacterCardsModal(focusCharacterName = null) {
	const $modal = $("#rpg-character-cards-popup");
	if (!$modal.length) return;

	// Reset unsaved changes flag
	_hasUnsavedChanges = false;

	// Apply theme
	const theme = extensionSettings.theme || "default";
	$modal.attr("data-theme", theme);

	// Apply custom theme if needed
	if (theme === "custom") {
		_applyCustomTheme($modal);
	}

	// Set focused character if provided
	if (focusCharacterName) {
		_focusedCharacterName = focusCharacterName;
	}

	// Render content
	await renderCharacterCards();

	// Open modal
	$modal.addClass("is-open");
	$modal.removeClass("is-closing");

	// Focus management
	$modal.find("#rpg-close-character-cards").focus();
}

/**
 * Closes the character cards modal.
 * @param {boolean} [force=false] - Force close without checking for unsaved changes
 */
export function closeCharacterCardsModal(force = false) {
	const $modal = $("#rpg-character-cards-popup");
	if (!$modal.length) return;

	// Check for unsaved changes
	if (!force && _hasUnsavedChanges) {
		const confirmed = confirm(i18n.getTranslation("characterCards.unsavedChanges"));
		if (!confirmed) return;
	}

	_hasUnsavedChanges = false;

	$modal.addClass("is-closing");
	$modal.removeClass("is-open");

	setTimeout(() => {
		$modal.removeClass("is-closing");
	}, 200);
}

/**
 * Handles click outside the modal to close it.
 * @param {Event} e - The click event
 */
export function handleModalBackdropClick(e) {
	const $modal = $("#rpg-character-cards-popup");
	if (!$modal.length) return;

	// Only close if clicking directly on the modal backdrop (not content)
	if (e.target === $modal[0]) {
		closeCharacterCardsModal(false);
	}
}

/**
 * Refreshes the lorebook dropdown options in the character cards modal.
 * Called when the character changes to update the available lorebooks.
 */
export function refreshLorebookDropdowns() {
	const $modal = $("#rpg-character-cards-popup");
	if (!$modal.length || !$modal.hasClass("is-open")) return;

	const lorebookOptions = getLorebookOptionsForDropdown();
	const currentLorebook = getCharacterCardLorebookForChat();

	const $select = $modal.find("#rpg-character-cards-lorebook-select");
	if (!$select.length) return;

	// Rebuild options
	let optionsHtml = "";
	for (const opt of lorebookOptions) {
		const selected = opt.value === currentLorebook ? " selected" : "";
		optionsHtml += `<option value="${escapeHtml(opt.value)}"${selected}>${escapeHtml(opt.label)}</option>`;
	}
	$select.html(optionsHtml);
}

/**
 * Applies custom theme colors to the modal.
 * @param {jQuery} $modal - The modal element
 */
function _applyCustomTheme($modal) {
	const $content = $modal.find(".rpg-character-cards-popup-content");
	if ($content.length && extensionSettings.customColors) {
		$content[0].style.setProperty(
			"--rpg-bg",
			extensionSettings.customColors.bg,
		);
		$content[0].style.setProperty(
			"--rpg-accent",
			extensionSettings.customColors.accent,
		);
		$content[0].style.setProperty(
			"--rpg-text",
			extensionSettings.customColors.text,
		);
		$content[0].style.setProperty(
			"--rpg-highlight",
			extensionSettings.customColors.highlight,
		);
	}
}

/**
 * Sets up the character cards popup functionality.
 * Binds open/close buttons and the custom event from thoughts.js.
 */
export function setupCharacterCardsPopup() {
	// Open character cards modal from the main panel button
	$("#rpg-open-character-cards").on("click", () => {
		openCharacterCardsModal();
	});

	// Close button (X)
	$("#rpg-close-character-cards").on("click", () => {
		closeCharacterCardsModal();
	});

	// Close button (footer)
	$("#rpg-close-character-cards-btn").on("click", () => {
		closeCharacterCardsModal();
	});

	// Close on backdrop click
	$("#rpg-character-cards-popup").on("click", (e) => {
		handleModalBackdropClick(e);
	});

	// Refresh all cards button (footer)
	$("#rpg-refresh-character-cards").on("click", async () => {
		const $btn = $("#rpg-refresh-character-cards");
		$btn.prop("disabled", true);
		$btn.find("i").addClass("fa-spin");

		try {
			const success = await updateCharacterCards();
			if (success) {
				await renderCharacterCards();
			}
		} finally {
			$btn.prop("disabled", false);
			$btn.find("i").removeClass("fa-spin");
		}
	});

	// Listen for the custom event dispatched by thoughts.js
	document.addEventListener("rpg-open-character-card", (e) => {
		const characterName = e.detail?.characterName;
		openCharacterCardsModal(characterName);
	});
}
