/**
 * Relationships Rendering Module
 * Handles rendering of character relationship pairs in a dedicated modal
 */

import { i18n } from "../../core/i18n.js";
import { extensionSettings } from "../../core/state.js";
import { getTrackerDataForContext } from "../generation/trackerDataUtils.js";
import {
	updateMessageSwipeData,
	saveChatData,
} from "../../core/persistence.js";

/**
 * Helper to log debug messages
 */
function debugLog(message, data = null) {
	if (extensionSettings.debugMode) {
		console.log(`[RPG Relationships] ${message}`, data || "");
	}
}

/**
 * Gets the allowed relationship status options from configuration
 * @returns {string[]} Array of allowed status values
 */
function getAllowedRelationshipStatuses() {
	const relationshipEmojis =
		extensionSettings.trackerConfig?.presentCharacters?.relationships
			?.relationshipEmojis || {};
	return Object.keys(relationshipEmojis);
}

/**
 * Gets the emoji for a relationship status
 * @param {string} status - The relationship status
 * @returns {string} The corresponding emoji or empty string
 */
function getRelationshipEmoji(status) {
	const relationshipEmojis =
		extensionSettings.trackerConfig?.presentCharacters?.relationships
			?.relationshipEmojis || {};
	return relationshipEmojis[status] || "";
}

/**
 * Renders the relationships modal content.
 * Called after relationship data is updated.
 */
export function renderRelationships() {
	const $modal = $("#rpg-relationships-popup");
	if (!$modal.length) return;

	const $body = $modal.find(".rpg-relationships-popup-body");
	const relationships = getTrackerDataForContext("relationships");

	console.log(
		"[RPG Companion] Rendering relationships with data:",
		relationships,
	);
	if (
		!relationships ||
		!Array.isArray(relationships) ||
		relationships.length === 0
	) {
		console.log(
			"[RPG Companion] No relationships data found, showing empty state.",
		);
		$body.html(
			`<div class="rpg-relationships-empty">${i18n.getTranslation("relationships.noRelationships")}</div>`,
		);
		return;
	}

	const allowedStatuses = getAllowedRelationshipStatuses();
	let html = '<div class="rpg-relationships-list">';

	for (let i = 0; i < relationships.length; i++) {
		const rel = relationships[i];
		const c1 = rel.character1 || "?";
		const c2 = rel.character2 || "?";
		const status = rel.status || "Neutral";
		const feelsTowards = rel.feelsTowards || "";
		const wantsFrom = rel.wantsFrom || "";
		const secretsFrom = rel.secretsFrom || "";
		const feelsTowards2 = rel.feelsTowards2 || "";
		const wantsFrom2 = rel.wantsFrom2 || "";
		const secretsFrom2 = rel.secretsFrom2 || "";

		html += '<div class="rpg-relationship-card">';
		html += `<div class="rpg-relationship-header">`;
		html += `<span class="rpg-relationship-names">${escapeHtml(c1)} ↔ ${escapeHtml(c2)}</span>`;

		// Status dropdown with emoji
		html += `<select class="rpg-relationship-status-select rpg-rel-status-${status.toLowerCase()}" data-index="${i}" data-field="status" title="${i18n.getTranslation("relationships.clickToEdit")}">`;
		for (const allowedStatus of allowedStatuses) {
			const statusEmoji = getRelationshipEmoji(allowedStatus);
			const selected = allowedStatus === status ? " selected" : "";
			html += `<option value="${escapeHtml(allowedStatus)}"${selected}>${statusEmoji} ${escapeHtml(allowedStatus)}</option>`;
		}
		html += `</select>`;
		html += `</div>`;

		// Character 1 → Character 2 (feelsTowards, wantsFrom, secretsFrom)
		html += '<div class="rpg-relationship-direction">';
		html += `<span class="rpg-relationship-arrow">${escapeHtml(c1)} → ${escapeHtml(c2)}</span>`;
		html += `<span class="rpg-relationship-feels rpg-editable" contenteditable="true" data-index="${i}" data-field="feelsTowards" data-placeholder="${i18n.getTranslation("relationships.feels")}" title="${i18n.getTranslation("relationships.clickToEdit")}">${escapeHtml(feelsTowards)}</span>`;
		html += `<span class="rpg-relationship-wants"><span class="rpg-rel-label">${i18n.getTranslation("relationships.wants")}:</span> <span class="rpg-editable" contenteditable="true" data-index="${i}" data-field="wantsFrom" title="${i18n.getTranslation("relationships.clickToEdit")}">${escapeHtml(wantsFrom)}</span></span>`;
		html += `<span class="rpg-relationship-secret"><span class="rpg-rel-label">${i18n.getTranslation("relationships.secret")}:</span> <span class="rpg-editable" contenteditable="true" data-index="${i}" data-field="secretsFrom" title="${i18n.getTranslation("relationships.clickToEdit")}">${escapeHtml(secretsFrom)}</span></span>`;
		html += "</div>";

		// Character 2 → Character 1 (feelsTowards2, wantsFrom2, secretsFrom2)
		html += '<div class="rpg-relationship-direction">';
		html += `<span class="rpg-relationship-arrow">${escapeHtml(c2)} → ${escapeHtml(c1)}</span>`;
		html += `<span class="rpg-relationship-feels rpg-editable" contenteditable="true" data-index="${i}" data-field="feelsTowards2" data-placeholder="${i18n.getTranslation("relationships.feels")}" title="${i18n.getTranslation("relationships.clickToEdit")}">${escapeHtml(feelsTowards2)}</span>`;
		html += `<span class="rpg-relationship-wants"><span class="rpg-rel-label">${i18n.getTranslation("relationships.wants")}:</span> <span class="rpg-editable" contenteditable="true" data-index="${i}" data-field="wantsFrom2" title="${i18n.getTranslation("relationships.clickToEdit")}">${escapeHtml(wantsFrom2)}</span></span>`;
		html += `<span class="rpg-relationship-secret"><span class="rpg-rel-label">${i18n.getTranslation("relationships.secret")}:</span> <span class="rpg-editable" contenteditable="true" data-index="${i}" data-field="secretsFrom2" title="${i18n.getTranslation("relationships.clickToEdit")}">${escapeHtml(secretsFrom2)}</span></span>`;
		html += "</div>";

		html += "</div>";
	}

	html += "</div>";
	$body.html(html);

	// Attach event handlers for editing
	_attachEditHandlers($body);
}

/**
 * Opens the relationships modal
 */
export function openRelationshipsModal() {
	const $modal = $("#rpg-relationships-popup");
	if (!$modal.length) return;

	// Apply theme
	const theme = extensionSettings.theme || "default";
	$modal.attr("data-theme", theme);

	// Apply custom theme if needed
	if (theme === "custom") {
		_applyCustomTheme($modal);
	}

	// Render content
	renderRelationships();

	// Open modal
	$modal.addClass("is-open");
	$modal.removeClass("is-closing");

	// Focus management
	$modal.find("#rpg-close-relationships").focus();
}

/**
 * Closes the relationships modal
 */
export function closeRelationshipsModal() {
	const $modal = $("#rpg-relationships-popup");
	if (!$modal.length) return;

	$modal.addClass("is-closing");
	$modal.removeClass("is-open");

	setTimeout(() => {
		$modal.removeClass("is-closing");
	}, 200);
}

/**
 * Applies custom theme colors to the modal
 * @param {jQuery} $modal - The modal element
 */
function _applyCustomTheme($modal) {
	const $content = $modal.find(".rpg-relationships-popup-content");
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
 * Attaches edit event handlers to editable fields in the relationships modal
 * @param {jQuery} $body - The modal body element
 */
function _attachEditHandlers($body) {
	// Handle status dropdown changes
	$body.find(".rpg-relationship-status-select").on("change", function () {
		const index = parseInt($(this).data("index"));
		const value = $(this).val();
		_updateRelationshipField(index, "status", value);

		// Update the dropdown's status class
		const allowedStatuses = getAllowedRelationshipStatuses();
		for (const status of allowedStatuses) {
			$(this).removeClass(`rpg-rel-status-${status.toLowerCase()}`);
		}
		$(this).addClass(`rpg-rel-status-${value.toLowerCase()}`);
	});

	// Handle editable text field blur
	$body.find(".rpg-editable").on("blur", function () {
		const index = parseInt($(this).data("index"));
		const field = $(this).data("field");
		const value = $(this).text().trim();
		_updateRelationshipField(index, field, value);
	});

	// Prevent click events on editable elements from bubbling
	$body.find(".rpg-editable").on("click mousedown", (e) => {
		e.stopPropagation();
	});

	// Handle empty field focus - remove placeholder styling
	$body.find(".rpg-editable.rpg-empty-field").on("focus", function () {
		$(this).removeClass("rpg-empty-field");
		$(this).removeAttr("data-placeholder");
	});

	// Restore placeholder if field becomes empty on blur
	$body.find(".rpg-editable").on("blur", function () {
		const $this = $(this);
		if (!$this.text().trim()) {
			const field = $this.data("field");
			if (field) {
				$this.addClass("rpg-empty-field");
				$this.attr("data-placeholder", field);
			}
		}
	});

	// Handle Enter key on editable fields - blur to save
	$body.find(".rpg-editable").on("keydown", function (e) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			$(this).trigger("blur");
		}
	});
}

/**
 * Updates a single field in a relationship and persists the change
 * @param {number} index - Index of the relationship in the array
 * @param {string} field - Field name to update
 * @param {string} value - New value
 */
function _updateRelationshipField(index, field, value) {
	const relationships = getTrackerDataForContext("relationships");
	if (!relationships || !Array.isArray(relationships)) {
		console.warn("[RPG Companion] No relationships data to update");
		return;
	}

	if (index < 0 || index >= relationships.length) {
		console.warn(`[RPG Companion] Invalid relationship index: ${index}`);
		return;
	}

	const rel = relationships[index];
	if (!rel) {
		console.warn(`[RPG Companion] Relationship at index ${index} not found`);
		return;
	}

	// Update the field
	rel[field] = value;

	debugLog(`Updated relationship ${index}.${field} =`, value);

	// Persist to swipe store
	updateMessageSwipeData("relationships", relationships);
	saveChatData();

	// Don't re-render for text field edits to avoid losing focus
	// Re-render for status changes to update styling
	if (field === "status") {
		renderRelationships();
	}
}

/**
 * Simple HTML escaping
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
	if (typeof str !== "string") return String(str || "");
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}
