/**
 * JSON Prompt Builder Helpers
 * Helper functions for building JSON format tracker prompts
 */

import { getContext } from "../../../../../../extensions.js";
import { i18n } from "../../core/i18n.js";
import { extensionSettings } from "../../core/state.js";
import { getWeatherKeywordsAsPromptString } from "../ui/weatherEffects.js";

/**
 * Converts a field name to snake_case for use as JSON key
 * Example: "Test Tracker" -> "test_tracker"
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
 * Extracts the base name (before parentheses) and converts to snake_case for use as JSON key.
 * Parenthetical content is treated as a description/hint, not part of the key.
 * Example: "Conditions (up to 5 traits)" -> "conditions"
 * Example: "Status Effects" -> "status_effects"
 * @param {string} name - Field name, possibly with parenthetical description
 * @returns {string} snake_case key from the base name only
 */
function toFieldKey(name) {
	const baseName = name.replace(/\s*\(.*\)\s*$/, "").trim();
	return toSnakeCase(baseName);
}

/**
 * Builds User Stats JSON format instruction
 * Always shows ALL sub-sections in the example for full context.
 * The instruction text (not the example) tells the LLM which to update.
 * @returns {string} JSON format instruction for user stats
 */
export function buildUserStatsJSONInstruction() {
	const userName = getContext().name1;
	const trackerConfig = extensionSettings.trackerConfig;
	const userStatsConfig = trackerConfig?.userStats;
	const enabledStats =
		userStatsConfig?.customStats?.filter((s) => s && s.enabled && s.name) || [];
	const displayMode = userStatsConfig?.statsDisplayMode || "percentage";

	const sections = [];

	// Stats section
	let statsSection = '  "stats": [\n';
	for (let i = 0; i < enabledStats.length; i++) {
		const stat = enabledStats[i];
		const comma = i < enabledStats.length - 1 ? "," : "";
		if (displayMode === "number") {
			const maxValue = stat.maxValue || 100;
			statsSection += `    {"id": "${stat.id}", "name": "${stat.name}", "value": X}${comma}  // 0 to ${maxValue}\n`;
		} else {
			statsSection += `    {"id": "${stat.id}", "name": "${stat.name}", "value": X}${comma}  // 0 to 100 (percentage)\n`;
		}
	}
	statsSection += "  ]";
	sections.push(statsSection);

	// Status section
	if (userStatsConfig?.statusSection?.enabled) {
		let statusSection = '  "status": {\n';
		if (userStatsConfig.statusSection.showMoodEmoji) {
			statusSection += '    "mood": "Mood Emoji"';
		}
		const customFields = userStatsConfig.statusSection.customFields || [];
		if (customFields.length > 0) {
			for (let i = 0; i < customFields.length; i++) {
				const fieldName = customFields[i].toLowerCase();
				const fieldKey = toFieldKey(fieldName);
				const comma =
					i === customFields.length - 1 &&
					!userStatsConfig.statusSection.showMoodEmoji
						? ""
						: userStatsConfig.statusSection.showMoodEmoji ||
								i < customFields.length - 1
							? ",\n"
							: "\n";
				if (i === 0 && userStatsConfig.statusSection.showMoodEmoji) {
					statusSection += ",\n";
				}
				statusSection += `    "${fieldKey}": "[${fieldName}]"${comma}`;
			}
		}
		if (
			!userStatsConfig.statusSection.showMoodEmoji &&
			customFields.length > 0
		) {
			statusSection += "\n";
		}
		statusSection += "  }";
		sections.push(statusSection);
	}

	// Skills section
	if (userStatsConfig?.skillsSection?.enabled) {
		sections.push(
			'  "skills": [\n    {"name": "Skill1"},\n    {"name": "Skill2"}\n  ]',
		);
	}

	// Always show ALL sub-sections in the example for full context.
	// The instruction text (not the example) tells the LLM which to update.
	const showInventory = extensionSettings.showInventory;
	const showAppearance = true;
	const showQuests = true;

	// Inventory section
	if (showInventory) {
		sections.push(
			'  "inventory": {\n    "onPerson": [\n      {"name": "Item1", "quantity": X},\n      {"name": "Item2", "quantity": X}\n    ],\n    "stored": {\n      "Location1": [\n        {"name": "Item", "quantity": X}\n      ]\n    },\n    "assets": [\n      {"name": "Asset1", "location": "Location"}\n    ]\n  }',
		);
	}

	// Appearance section
	if (showAppearance) {
		sections.push(
			'  "appearance": {\n    "clothing": [\n      {"name": "Clothing1"}\n    ],\n    "accessories": [\n      {"name": "accessory1"}\n    ],\n    "physicalFeatures": [\n      {"name": "physicalFeature1"}\n    ],\n    "hair": "Hair Description",\n    "scent": "Scent Description",\n    "posture": "Posture Description",\n    "demeanor": "Demeanor/Expression"\n  }',
		);
	}

	// Quests section
	if (showQuests) {
		sections.push(
			'  "quests": {\n    "main": {\n      "title": "QuestTitle",\n      "completed": false,\n      "date": "Date and/or Time",\n      "location": "Location"\n    },\n    "optional": [\n      {\n        "title": "SideQuest1",\n        "completed": false,\n        "date": "Date and/or Time",\n        "location": "Location"\n      }\n    ]\n  }',
		);
	}

	return "{\n" + sections.join(",\n") + "\n}";
}

/**
 * Builds Info Box JSON format instruction
 * @returns {string} JSON format instruction for info box
 */
export function buildInfoBoxJSONInstruction() {
	const infoBoxConfig = extensionSettings.trackerConfig?.infoBox;
	const widgets = infoBoxConfig?.widgets || {};

	let instruction = "{\n";
	let hasFields = false;

	if (widgets.date?.enabled) {
		const dateFormat = widgets.date.format || "Weekday, Month, Year";
		instruction += `  "date": {"value": "${dateFormat}"}`;
		hasFields = true;
	}

	if (widgets.weather?.enabled) {
		// Get valid weather keywords for the current language to guide LLM generation
		const currentLang = i18n.currentLanguage || "en";
		const weatherHint = getWeatherKeywordsAsPromptString(currentLang);
		instruction +=
			(hasFields ? ",\n" : "") +
			`  "weather": {"emoji": "Weather Emoji", "forecast": "Forecast"}  // ${weatherHint}`;
		hasFields = true;
	}

	if (widgets.temperature?.enabled) {
		const unit = widgets.temperature.unit === "F" ? "F" : "C";
		instruction +=
			(hasFields ? ",\n" : "") +
			`  "temperature": {"value": X, "unit": "${unit}"}`;
		hasFields = true;
	}

	if (widgets.time?.enabled) {
		instruction +=
			(hasFields ? ",\n" : "") +
			'  "time": {"start": "TimeStart", "end": "TimeEnd"}';
		hasFields = true;
	}

	if (widgets.location?.enabled) {
		instruction +=
			(hasFields ? ",\n" : "") + '  "location": {"value": "Location"}';
		hasFields = true;
	}

	if (widgets.recentEvents?.enabled) {
		instruction +=
			(hasFields ? ",\n" : "") +
			'  "recentEvents": ["Event1", "Event2", "Event3"]';
		hasFields = true;
	}

	instruction += "\n}";
	return instruction;
}

/**
 * Builds Present Characters JSON format instruction
 * @returns {string} JSON format instruction for present characters
 */
export function buildCharactersJSONInstruction() {
	const userName = getContext().name1;
	const presentCharsConfig = extensionSettings.trackerConfig?.presentCharacters;
	const enabledFields =
		presentCharsConfig?.customFields?.filter((f) => f && f.enabled && f.name) ||
		[];
	const relationshipsEnabled =
		presentCharsConfig?.relationships?.enabled !== false;
	const thoughtsConfig = presentCharsConfig?.thoughts;
	const characterStats = presentCharsConfig?.characterStats;
	const enabledCharStats =
		(characterStats?.enabled &&
			characterStats?.customStats?.filter((s) => s && s.enabled && s.name)) ||
		[];

	let instruction = "[\n";
	instruction += "  {\n";
	instruction += '    "name": "CharacterName",\n';
	instruction += '    "emoji": "Character Emoji"';

	// Details fields
	if (enabledFields.length > 0) {
		instruction += ',\n    "details": {\n';
		for (let i = 0; i < enabledFields.length; i++) {
			const field = enabledFields[i];
			const fieldKey = toSnakeCase(field.name);
			const comma = i < enabledFields.length - 1 ? "," : "";
			instruction += `      "${fieldKey}": "${field.description}"${comma}\n`;
		}
		instruction += "    }";
	}

	// Relationship
	if (relationshipsEnabled) {
		const relationshipFields = presentCharsConfig?.relationshipFields || [];
		const options = relationshipFields.join("/");
		instruction +=
			',\n    "relationship": {"status": "(choose one: ' + options + ')"}';
	}

	// Stats
	if (enabledCharStats.length > 0) {
		instruction += ',\n    "stats": [\n';
		for (let i = 0; i < enabledCharStats.length; i++) {
			const stat = enabledCharStats[i];
			const comma = i < enabledCharStats.length - 1 ? "," : "";
			instruction += `      {"name": "${stat.name}", "value": X}${comma}\n`;
		}
		instruction += "    ]";
	}

	// Thoughts
	if (thoughtsConfig?.enabled) {
		const thoughtsDescription =
			thoughtsConfig.description || "Internal monologue";
		instruction += `,\n    "thoughts": {"content": "${thoughtsDescription}"}`;
	}

	instruction += "\n  }\n";
	instruction += "]";

	return instruction;
}

/**
 * Adds lock information to instruction text
 * @param {string} baseInstruction - Base instruction text
 * @returns {string} Instruction with lock information added
 */
export function addLockInstruction(baseInstruction) {
	return (
		baseInstruction +
		'\n\nIMPORTANT: If an item, stat, quest, or field has "locked": true in its object, you MUST NOT change its value. Keep it exactly as it appears in the previous trackers. Only unlocked items can be modified. The "locked" field should ONLY be included if the item is actually locked - omit it for unlocked items.'
	);
}
