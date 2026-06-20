/**
 * User Stats Rendering Module
 * Handles rendering of the user stats panel with progress bars and classic RPG stats
 */

import { user_avatar } from "../../../../../../../script.js";
import { getContext } from "../../../../../../extensions.js";
import { i18n } from "../../core/i18n.js";
import {
	saveChatData,
	saveSettings,
	updateMessageSwipeData,
} from "../../core/persistence.js";
import {
	$userStatsContainer,
	extensionSettings,
	FALLBACK_AVATAR_DATA_URI,
} from "../../core/state.js";
import { getSafeThumbnailUrl } from "../../utils/avatars.js";
import { escapeHtml } from "../../utils/html.js";
import { getLockIconHtml } from "../../utils/lockIcon.js";
import { buildInventorySummary } from "../generation/inventoryFormatter.js";
import { isItemLocked, setItemLock } from "../generation/lockManager.js";
import { getTrackerDataForContext } from "../generation/trackerDataUtils.js";
import { updateFabWidgets } from "../ui/mobile.js";
import { getStatBarColors } from "../ui/theme.js";

/**
 * Default user stats configuration (shared between renderUserStats and buildUserStatsText)
 */
const DEFAULT_USER_STATS_CONFIG = {
	customStats: [
		{ id: "health", name: "Health", enabled: true },
		{ id: "satiety", name: "Satiety", enabled: true },
		{ id: "energy", name: "Energy", enabled: true },
		{ id: "hygiene", name: "Hygiene", enabled: true },
		{ id: "arousal", name: "Arousal", enabled: true },
	],
	rpgAttributes: [
		{ id: "str", name: "STR", enabled: true },
		{ id: "dex", name: "DEX", enabled: true },
		{ id: "con", name: "CON", enabled: true },
		{ id: "int", name: "INT", enabled: true },
		{ id: "wis", name: "WIS", enabled: true },
		{ id: "cha", name: "CHA", enabled: true },
	],
	statusSection: {
		enabled: true,
		showMoodEmoji: true,
		customFields: ["Conditions"],
	},
	skillsSection: { enabled: false, label: "Skills" },
};

/**
 * Extracts the base name (before parentheses) and converts to snake_case for use as JSON key.
 * Example: "Conditions (up to 5 traits)" -> "conditions"
 * @param {string} name - Field name, possibly with parenthetical description
 * @returns {string} snake_case key from the base name only
 */
function toFieldKey(name) {
	const baseName = name.replace(/\s*\(.*\)\s*$/, "").trim();
	return baseName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

/**
 * Helper to extract stat value from tracker data (handles both flat and array formats)
 * @param {object} trackerData - The tracker data object from swipe store
 * @param {string} statId - The stat ID to extract (e.g., 'health', 'energy')
 * @param {number} defaultValue - Default value if not found
 * @returns {number} The stat value
 */
function getStatValue(trackerData, statId, defaultValue = 100) {
	if (!trackerData) return defaultValue;

	// Try flat format first (tracker data)
	if (trackerData[statId] !== undefined) {
		return trackerData[statId];
	}

	// Try array format (stats array in tracker data)
	if (trackerData.stats && Array.isArray(trackerData.stats)) {
		const stat = trackerData.stats.find((s) => s.id === statId);
		if (stat && stat.value !== undefined) {
			return stat.value;
		}
	}

	return defaultValue;
}

/**
 * Helper to extract status field value from tracker data
 * @param {object} trackerData - The tracker data object from swipe store
 * @param {string} fieldKey - The field key (e.g., 'mood', 'conditions')
 * @param {string} defaultValue - Default value if not found
 * @returns {string} The field value
 */
function getStatusField(trackerData, fieldKey, defaultValue = "") {
	if (!trackerData) return defaultValue;

	// Try flat format first
	if (trackerData[fieldKey] !== undefined) {
		return trackerData[fieldKey];
	}

	// Try status object format
	if (trackerData.status && typeof trackerData.status === "object") {
		// Try the field key directly
		if (trackerData.status[fieldKey] !== undefined) {
			return trackerData.status[fieldKey];
		}
		// Try lowercase field name
		const lowerKey = fieldKey.toLowerCase();
		if (trackerData.status[lowerKey] !== undefined) {
			return trackerData.status[lowerKey];
		}
		// Try mood field if looking for mood
		if (fieldKey === "mood" && trackerData.status.mood !== undefined) {
			return trackerData.status.mood;
		}
	}

	return defaultValue;
}

/**
 * Builds the user stats text string using custom stat names
 * @returns {string} Formatted stats text for tracker
 */
export function buildUserStatsText() {
	const trackerData = getTrackerDataForContext("userStats");
	const config = extensionSettings.trackerConfig?.userStats || {
		customStats: DEFAULT_USER_STATS_CONFIG.customStats,
		statusSection: DEFAULT_USER_STATS_CONFIG.statusSection,
		skillsSection: DEFAULT_USER_STATS_CONFIG.skillsSection,
	};

	let text = "";

	if (!trackerData) {
		return text.trim();
	}

	// Add enabled custom stats
	const enabledStats = config.customStats.filter(
		(stat) => stat && stat.enabled && stat.name && stat.id,
	);
	for (const stat of enabledStats) {
		const value = getStatValue(trackerData, stat.id, 100);
		text += `${stat.name}: ${value}%\n`;
	}

	// Add status section if enabled
	if (config.statusSection.enabled) {
		if (config.statusSection.showMoodEmoji) {
			text += `${getStatusField(trackerData, "mood", "")}: `;
		}
		text += `${getStatusField(trackerData, "conditions", "None")}\n`;
	}

	// Add inventory summary
	const inventory = getStatusField(trackerData, "inventory", {});
	const inventorySummary = buildInventorySummary(inventory);
	text += inventorySummary;

	// Add skills if enabled
	if (config.skillsSection.enabled) {
		const skills = getStatusField(trackerData, "skills", null);
		if (skills) {
			if (Array.isArray(skills)) {
				text += `\n${config.skillsSection.label}: ${skills.map((s) => s.name || s).join(", ")}`;
			} else {
				text += `\n${config.skillsSection.label}: ${skills}`;
			}
		}
	}

	return text.trim();
}

/**
 * State tracking for render optimization - skips re-render if data unchanged
 */
let lastUserStatsDataHash = null;

/**
 * Computes a simple hash of data for change detection
 * @param {*} data - Data to hash
 * @returns {string} Hash string
 */
function computeDataHash(data) {
	try {
		return JSON.stringify(data);
	} catch {
		return null;
	}
}

/**
 * Renders the user stats panel with health bars, mood, inventory, and classic stats.
 * Includes event listeners for editable fields.
```
 */
export function renderUserStats() {
	if (!extensionSettings.showUserStats || !$userStatsContainer) {
		console.warn(
			"[RPG Companion] User stats panel is disabled or container not found. Skipping render.",
		);
		return;
	}

	// Check if tracker data exists (from swipe store or extensionSettings)
	const trackerData = getTrackerDataForContext("userStats");

	// State diffing: Skip render if data hasn't changed
	const currentHash = computeDataHash(trackerData);
	if (currentHash && currentHash === lastUserStatsDataHash) {
		return; // Skip re-render - data unchanged
	}
	lastUserStatsDataHash = currentHash;

	if (!trackerData) {
		// Always render to the #rpg-user-stats container
		$userStatsContainer.html(
			'<div class="rpg-inventory-empty">No statuses generated yet</div>',
		);
		// Clear the tracker message display
		$("#rpg-tracker-message").hide();
		return;
	}

	const stats = trackerData;
	const config =
		extensionSettings.trackerConfig?.userStats || DEFAULT_USER_STATS_CONFIG;
	const userName = getContext().name1;

	// Get user portrait
	let userPortrait = FALLBACK_AVATAR_DATA_URI;
	if (user_avatar) {
		const thumbnailUrl = getSafeThumbnailUrl("persona", user_avatar);
		if (thumbnailUrl) {
			userPortrait = thumbnailUrl;
		}
	}

	// Create gradient from low to high color with opacity
	const colors = getStatBarColors();
	const gradient = `linear-gradient(to right, ${colors.low}, ${colors.high})`;

	let html = '<div class="rpg-stats-content">';
	html += '<div class="rpg-stats-left">';

	// User info row
	const showLevel =
		extensionSettings.trackerConfig?.userStats?.showLevel !== false;
	html += `
        <div class="rpg-user-info-row">
            <img src="${escapeHtml(userPortrait)}" alt="${escapeHtml(userName)}" class="rpg-user-portrait" onerror="this.style.opacity='0.5';this.onerror=null;" />
            <span class="rpg-user-name">${escapeHtml(userName)}</span>
            ${showLevel
			? `<span style="opacity: 0.5;">|</span>
            <span class="rpg-level-label">${i18n.getTranslation("userStats.level")}</span>
            <span class="rpg-level-value rpg-editable" contenteditable="true" data-field="level" title="${i18n.getTranslation("userStats.clickToEditLevel")}">${extensionSettings.level}</span>`
			: ""
		}
        </div>
    `;

	// Dynamic stats grid - only show enabled stats
	html += getLockIconHtml("userStats", "stats");
	html += '<div class="rpg-stats-grid">';
	const enabledStats = config.customStats.filter(
		(stat) => stat && stat.enabled && stat.name && stat.id,
	);
	const displayMode = config.statsDisplayMode || "percentage";

	for (const stat of enabledStats) {
		const value = getStatValue(stats, stat.id, 100);
		const maxValue = stat.maxValue || 100;

		// Calculate percentage for bar fill
		let percentage;
		let displayValue;

		if (displayMode === "number") {
			// In number mode, value is already the number (0 to maxValue)
			percentage = maxValue > 0 ? (value / maxValue) * 100 : 100;
			displayValue = `${value}/${maxValue}`;
		} else {
			// In percentage mode, value is 0-100
			percentage = value;
			displayValue = `${value}%`;
		}

		html += `
            <div class="rpg-stat-row">
                <span class="rpg-stat-label rpg-editable-stat-name" contenteditable="true" data-field="${stat.id}" title="${i18n.getTranslation("userStats.clickToEditStatName")}">${stat.name}:</span>
                <div class="rpg-stat-bar" style="background: ${gradient}">
                    <div class="rpg-stat-fill" style="width: ${100 - percentage}%"></div>
                </div>
                <span class="rpg-stat-value rpg-editable-stat" contenteditable="true" data-field="${stat.id}" data-max="${maxValue}" data-mode="${displayMode}" title="${i18n.getTranslation("userStats.clickToEditStatValue")}">${displayValue}</span>
            </div>
        `;
	}
	html += "</div>";

	// Status section (conditionally rendered)
	if (config.statusSection.enabled) {
		html += '<div class="rpg-mood">';
		html += getLockIconHtml("userStats", "status");

		if (config.statusSection.showMoodEmoji) {
			html += `<div class="rpg-mood-emoji rpg-editable" contenteditable="true" data-field="mood" title="${i18n.getTranslation("userStats.clickToEditEmoji")}">${getStatusField(stats, "mood", "")}</div>`;
		}

		// Render custom status fields
		if (
			config.statusSection.customFields &&
			config.statusSection.customFields.length > 0
		) {
			for (const fieldName of config.statusSection.customFields) {
				const fieldKey = toFieldKey(fieldName);
				let fieldValue = getStatusField(stats, fieldKey, "None");
				// Handle array format (from JSON)
				if (Array.isArray(fieldValue)) {
					fieldValue = fieldValue.join(", ") || "None";
				} else if (typeof fieldValue === "string") {
					// Strip brackets if present (from JSON array format)
					fieldValue = fieldValue.replace(/^\[|\]$/g, "").trim();
				}
				html += `<div class="rpg-mood-conditions rpg-editable" contenteditable="true" data-field="${fieldKey}" title="Click to edit ${fieldName}">${fieldValue}</div>`;
			}
		}

		html += "</div>";
	}

	// Skills section (conditionally rendered)
	if (config.skillsSection.enabled) {
		let skillsValue = "None";
		// Handle JSON array format: [{name: "Art"}, {name: "Coding"}]
		const skillsData = getStatusField(stats, "skills", null);
		if (skillsData) {
			if (Array.isArray(skillsData)) {
				skillsValue = skillsData.map((s) => s.name || s).join(", ") || "None";
			} else if (typeof skillsData === "string") {
				skillsValue = skillsData;
			}
		}
		html += `
            <div class="rpg-skills-section">`;
		html += getLockIconHtml("userStats", "skills");
		html += `
                <span class="rpg-skills-label">${config.skillsSection.label}:</span>
                <div class="rpg-skills-value rpg-editable" contenteditable="true" data-field="skills" title="${i18n.getTranslation("userStats.clickToEditSkills")}">${skillsValue}</div>
            </div>
        `;
	}

	html += "</div>"; // Close rpg-stats-left

	// RPG Attributes section (dynamically generated from config)
	// Check if RPG Attributes section is enabled
	const showRPGAttributes =
		config.showRPGAttributes !== undefined ? config.showRPGAttributes : true;

	if (showRPGAttributes) {
		// Use attributes from config, with fallback to defaults if not configured
		const rpgAttributes =
			config.rpgAttributes && config.rpgAttributes.length > 0
				? config.rpgAttributes
				: [
					{ id: "str", name: "STR", enabled: true },
					{ id: "dex", name: "DEX", enabled: true },
					{ id: "con", name: "CON", enabled: true },
					{ id: "int", name: "INT", enabled: true },
					{ id: "wis", name: "WIS", enabled: true },
					{ id: "cha", name: "CHA", enabled: true },
				];
		const enabledAttributes = rpgAttributes.filter(
			(attr) => attr && attr.enabled && attr.name && attr.id,
		);

		if (enabledAttributes.length > 0) {
			html += `
            <div class="rpg-stats-right">
                <div class="rpg-classic-stats">
                    <div class="rpg-classic-stats-grid">
        `;

			enabledAttributes.forEach((attr) => {
				// Use tracker data first, then classicStats from settings, then default to 10
				const trackerValue = trackerData?.classicStats?.[attr.id];
				const value =
					trackerValue !== undefined
						? trackerValue
						: extensionSettings.classicStats[attr.id] !== undefined
							? extensionSettings.classicStats[attr.id]
							: 10;
				html += `
                        <div class="rpg-classic-stat" data-stat="${attr.id}">
                            <span class="rpg-classic-stat-label">${attr.name}</span>
                            <div class="rpg-classic-stat-buttons">
                                <button class="rpg-classic-stat-btn rpg-stat-decrease" data-stat="${attr.id}">−</button>
                                <span class="rpg-classic-stat-value">${value}</span>
                                <button class="rpg-classic-stat-btn rpg-stat-increase" data-stat="${attr.id}">+</button>
                            </div>
                        </div>
            `;
			});

			html += `
                    </div>
                </div>
            </div>
        `;
		}
	}

	html += "</div>"; // Close rpg-stats-content

	// console.log('[RPG UserStats Render] Generated HTML length:', html.length);
	// console.log('[RPG UserStats Render] HTML preview:', html.substring(0, 300));
	// console.log('[RPG UserStats Render] Container exists:', !!$userStatsContainer, '$userStatsContainer length:', $userStatsContainer?.length);

	// Always render to the #rpg-user-stats container (mobile layout just moves it around in DOM)
	$userStatsContainer.html(html);
	// console.log('[RPG UserStats Render] ✓ HTML rendered to #rpg-user-stats container');

	// Add delegated event listeners for editable fields (more efficient than per-element handlers)
	$userStatsContainer
		.off("blur", ".rpg-editable-stat")
		.on("blur", ".rpg-editable-stat", function () {
			const field = $(this).data("field");
			const mode = $(this).data("mode");
			const maxValue = parseInt($(this).data("max")) || 100;
			const textValue = $(this).text().trim();
			let value;

			if (mode === "number") {
				// In number mode, parse "X/MAX" or just "X"
				const parts = textValue.split("/");
				value = parseInt(parts[0]);

				// Validate and clamp value between 0 and maxValue
				if (isNaN(value)) {
					value = 0;
				}
				value = Math.max(0, Math.min(maxValue, value));
			} else {
				// In percentage mode, parse "X%" or just "X"
				value = parseInt(textValue.replace("%", ""));

				// Validate and clamp value between 0 and 100
				if (isNaN(value)) {
					value = 0;
				}
				value = Math.max(0, Math.min(100, value));
			}

			// Update tracker data
			trackerData[field] = value;
			updateMessageSwipeData(trackerData);

			// Update and persist data
			saveSettings();
			saveChatData();

			// Reset hash to force re-render after user edit
			lastUserStatsDataHash = null;
			// Re-render to update the bar and FAB widgets
			renderUserStats();
			updateFabWidgets();
		});

	// Mood emoji editing
	$userStatsContainer
		.off("blur", ".rpg-mood-emoji.rpg-editable")
		.on("blur", ".rpg-mood-emoji.rpg-editable", function () {
			const value = $(this).text().trim();
			// Update tracker data
			trackerData.mood = value || "😐";
			updateMessageSwipeData(trackerData);

			// Update and persist data
			saveSettings();
			saveChatData();
		});

	// Mood conditions editing
	$userStatsContainer
		.off("blur", ".rpg-mood-conditions.rpg-editable")
		.on("blur", ".rpg-mood-conditions.rpg-editable", function () {
			const value = $(this).text().trim();
			const fieldKey = $(this).data("field");
			// Update tracker data
			trackerData[fieldKey] = value || "None";
			updateMessageSwipeData(trackerData);

			// Update and persist data
			saveSettings();
			saveChatData();
		});

	// Skills editing
	$userStatsContainer
		.off("blur", ".rpg-skills-value.rpg-editable")
		.on("blur", ".rpg-skills-value.rpg-editable", function () {
			const value = $(this).text().trim();
			// Update tracker data
			trackerData.skills = value || "None";
			updateMessageSwipeData(trackerData);

			// Update and persist data
			saveSettings();
			saveChatData();
		});

	// Stat name editing
	$userStatsContainer
		.off("blur", ".rpg-editable-stat-name")
		.on("blur", ".rpg-editable-stat-name", function () {
			const field = $(this).data("field");
			const value = $(this).text().trim().replace(":", "");

			if (!extensionSettings.statNames) {
				extensionSettings.statNames = {
					health: "Health",
					satiety: "Satiety",
					energy: "Energy",
					hygiene: "Hygiene",
					arousal: "Arousal",
				};
			}

			extensionSettings.statNames[field] =
				value || extensionSettings.statNames[field];

			// Update and persist data
			updateMessageSwipeData();
			saveSettings();
			saveChatData();

			// Reset hash to force re-render after user edit
			lastUserStatsDataHash = null;
			// Re-render to update the display
			renderUserStats();
		});

	// Level editing
	$userStatsContainer
		.off("blur", ".rpg-level-value.rpg-editable")
		.on("blur", ".rpg-level-value.rpg-editable", function () {
			let value = parseInt($(this).text().trim());
			if (isNaN(value) || value < 1) {
				value = 1;
			}
			// Set reasonable max level
			value = Math.min(100, value);

			extensionSettings.level = value;

			// Update and persist data
			updateMessageSwipeData();
			saveSettings();
			saveChatData();

			// Reset hash to force re-render after user edit
			lastUserStatsDataHash = null;
			// Re-render to update the display
			renderUserStats();
		});

	// Prevent line breaks in level field
	$userStatsContainer
		.off("keydown", ".rpg-level-value.rpg-editable")
		.on("keydown", ".rpg-level-value.rpg-editable", function (e) {
			if (e.key === "Enter") {
				e.preventDefault();
				$(this).blur();
			}
		});

	// Add event listener for section lock icon clicks (support both click and touch)
	$userStatsContainer
		.find(".rpg-section-lock-icon")
		.on("click touchend", function (e) {
			e.preventDefault();
			e.stopPropagation();
			const $icon = $(this);
			const trackerType = $icon.data("tracker");
			const itemPath = $icon.data("path");
			const currentlyLocked = isItemLocked(trackerType, itemPath);

			// Toggle lock state
			setItemLock(trackerType, itemPath, !currentlyLocked);

			// Update icon
			const newIcon = !currentlyLocked ? "🔒" : "🔓";
			const newTitle = !currentlyLocked
				? i18n.getTranslation("infoBox.locked")
				: i18n.getTranslation("infoBox.unlocked");
			$icon.text(newIcon);
			$icon.attr("title", newTitle);

			// Toggle 'locked' class for persistent visibility
			$icon.toggleClass("locked", !currentlyLocked);

			// Save settings
			saveSettings();
		});

	// Update tracker message display
	updateTrackerMessageDisplay();
}

/**
 * Updates the tracker message display in the sidebar.
 * Shows the message ID where tracker data was found and warns if outdated.
 */
function updateTrackerMessageDisplay() {
	const $display = $("#rpg-tracker-message");
	const lastTrackerMessageId = extensionSettings.lastTrackerMessage;

	// Hide if no tracker message is set
	if (!lastTrackerMessageId) {
		$display.hide();
		return;
	} else {
		$display.show();
	}

	const chatToSearch = getContext().chat;
	if (!chatToSearch) {
		$display.hide();
		return;
	}

	// Check if the tracker message is the latest message
	let lastAssistantMessage = chatToSearch.length - 1;
	for (let i = chatToSearch.length - 1; i >= 0; i--) {
		const message = chatToSearch[i];
		// Skip user and system messages
		if (message.is_user || message.is_system) {
			continue;
		}
		lastAssistantMessage = i;
		break;
	}

	const isOutdated = lastAssistantMessage !== lastTrackerMessageId;

	const label =
		i18n.getTranslation("template.mainPanel.trackerMessage") ||
		"Tracker from message: ";
	const outdatedLabel =
		i18n.getTranslation("template.mainPanel.trackerMessageOutdated") ||
		" (outdated)";

	const $element = $display.find("#rpg-tracker-message-text");
	$element.text(
		`${label}${lastTrackerMessageId}${isOutdated ? outdatedLabel : ""}`,
	);

	// Add/remove outdated class
	if (isOutdated) {
		$display.addClass("rpg-tracker-outdated");
	} else {
		$display.removeClass("rpg-tracker-outdated");
	}
}
