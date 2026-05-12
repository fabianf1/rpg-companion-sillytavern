/**
 * Relationships Rendering Module
 * Handles rendering of character relationship pairs in a dedicated modal
 */

import { i18n } from "../../core/i18n.js";
import { extensionSettings } from "../../core/state.js";
import { getTrackerDataForContext } from "../generation/trackerDataUtils.js";

/**
 * Helper to log debug messages
 */
function debugLog(message, data = null) {
	if (extensionSettings.debugMode) {
		console.log(`[RPG Relationships] ${message}`, data || "");
	}
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

	let html = '<div class="rpg-relationships-list">';

	for (const rel of relationships) {
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
		html += `<span class="rpg-relationship-status rpg-rel-status-${status.toLowerCase()}">${escapeHtml(status)}</span>`;
		html += `</div>`;

		// Character 1 → Character 2 (feelsTowards, wantsFrom, secretsFrom)
		if (feelsTowards || wantsFrom || secretsFrom) {
			html += '<div class="rpg-relationship-direction">';
			html += `<span class="rpg-relationship-arrow">${escapeHtml(c1)} → ${escapeHtml(c2)}</span>`;
			if (feelsTowards) {
				html += `<span class="rpg-relationship-feels">${escapeHtml(feelsTowards)}</span>`;
			}
			if (wantsFrom) {
				html += `<span class="rpg-relationship-wants"><span class="rpg-rel-label">${i18n.getTranslation("relationships.wants")}:</span> ${escapeHtml(wantsFrom)}</span>`;
			}
			if (secretsFrom) {
				html += `<span class="rpg-relationship-secret"><span class="rpg-rel-label">${i18n.getTranslation("relationships.secret")}:</span> ${escapeHtml(secretsFrom)}</span>`;
			}
			html += "</div>";
		}

		// Character 2 → Character 1 (feelsTowards2, wantsFrom2, secretsFrom2)
		if (feelsTowards2 || wantsFrom2 || secretsFrom2) {
			html += '<div class="rpg-relationship-direction">';
			html += `<span class="rpg-relationship-arrow">${escapeHtml(c2)} → ${escapeHtml(c1)}</span>`;
			if (feelsTowards2) {
				html += `<span class="rpg-relationship-feels">${escapeHtml(feelsTowards2)}</span>`;
			}
			if (wantsFrom2) {
				html += `<span class="rpg-relationship-wants"><span class="rpg-rel-label">${i18n.getTranslation("relationships.wants")}:</span> ${escapeHtml(wantsFrom2)}</span>`;
			}
			if (secretsFrom2) {
				html += `<span class="rpg-relationship-secret"><span class="rpg-rel-label">${i18n.getTranslation("relationships.secret")}:</span> ${escapeHtml(secretsFrom2)}</span>`;
			}
			html += "</div>";
		}

		html += "</div>";
	}

	html += "</div>";
	$body.html(html);
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
