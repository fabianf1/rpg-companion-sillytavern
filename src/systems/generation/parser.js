/**
 * Parser Module
 * Handles parsing of AI responses to extract tracker data
 * Supports both legacy text format and new v3 JSON format
 */
import { extensionSettings } from "../../core/state.js";
import { convertTimeFormat } from "../../utils/itemParser.js";
import { repairJSON } from "../../utils/jsonRepair.js";

/**
 * Helper to log debug messages when debug mode is enabled
 */
function debugLog(message, data = null) {
	if (extensionSettings.debugMode) {
		console.debug('[RPG Companion]', message, data ?? '');
	}
}

// ============================================================================
// WHITELIST CONSTANTS FOR SANITIZATION
// =================================================================

/** Top-level keys allowed in parsed JSON */
const TOP_LEVEL_KEYS = ["userStats", "infoBox", "characters"];

/** Keys allowed in userStats object */
const USER_STATS_KEYS = [
	"stats",
	"status",
	"skills",
	"inventory",
	"appearance",
	"quests",
];

/** Keys allowed in stats array items */
const STATS_ITEM_KEYS = ["id", "name", "value"];

/** Keys allowed in inventory object */
const INVENTORY_KEYS = ["onPerson", "stored", "assets"];

/** Keys allowed in inventory item objects */
const INVENTORY_ITEM_KEYS = ["name", "quantity", "location"];

/** Keys allowed in appearance object */
const APPEARANCE_KEYS = [
	"clothing",
	"accessories",
	"physicalFeatures",
	"hair",
	"scent",
	"posture",
	"demeanor",
];

/** Keys allowed in appearance array items */
const APPEARANCE_ITEM_KEYS = ["name"];

/** Keys allowed in quests object */
const QUESTS_KEYS = ["main", "optional"];

/** Keys allowed in quest objects (main and optional items) */
const QUEST_ITEM_KEYS = ["title", "completed", "date", "location"];

/** Keys allowed in infoBox object */
const INFO_BOX_KEYS = [
	"date",
	"weather",
	"temperature",
	"time",
	"location",
	"recentEvents",
];

/** Keys allowed in infoBox sub-objects */
const INFO_BOX_DATE_KEYS = ["value"];
const INFO_BOX_WEATHER_KEYS = ["icon", "condition"];
const INFO_BOX_TEMPERATURE_KEYS = ["outdoor", "indoor"];
const INFO_BOX_TEMPERATURE_OUTDOOR_KEYS = ["value", "unit"];
const INFO_BOX_TEMPERATURE_INDOOR_KEYS = ["value", "unit", "climate"];
const INFO_BOX_TIME_KEYS = ["start", "end"];
const INFO_BOX_LOCATION_KEYS = ["value"];

/** Keys allowed in character objects */
const CHARACTER_KEYS = [
	"name",
	"emoji",
	"details",
	"stats",
	"thoughts",
	"locked",
];

/** Keys allowed in character.stats array items */
const CHARACTER_STATS_ITEM_KEYS = ["name", "value"];

/** Keys allowed in character.thoughts object */
const CHARACTER_THOUGHTS_KEYS = ["content"];

// ============================================================================
// SANITIZATION HELPERS
// =================================================================

/**
 * Creates a shallow copy of an object containing only whitelisted keys.
 * Logs stripped keys in debug mode.
 * @param {Object} obj - Object to filter
 * @param {string[]} allowedKeys - Array of allowed key names
 * @param {string} path - Path for debug logging (e.g., "userStats.inventory")
 * @returns {Object} Filtered object with only allowed keys
 */
function filterObjectKeys(obj, allowedKeys, path = "") {
	if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
		return obj;
	}

	const result = {};
	const strippedKeys = [];

	for (const key of Object.keys(obj)) {
		if (allowedKeys.includes(key)) {
			result[key] = obj[key];
		} else {
			strippedKeys.push(key);
		}
	}

	if (strippedKeys.length > 0) {
		console.warn(
			`[RPG Parser] Stripped unexpected keys from ${path}:`,
			strippedKeys,
		);
	}

	return result;
}

/**
 * Sanitizes an array of objects, filtering each item's keys.
 * @param {Array} arr - Array to sanitize
 * @param {string[]} allowedKeys - Allowed keys for each item
 * @param {string} path - Path for debug logging
 * @returns {Array} Sanitized array
 */
function sanitizeArrayItems(arr, allowedKeys, path) {
	if (!Array.isArray(arr)) return arr;

	return arr.map((item, index) => {
		if (item && typeof item === "object" && !Array.isArray(item)) {
			return filterObjectKeys(item, allowedKeys, `${path}[${index}]`);
		}
		// Allow primitives (strings, numbers) as-is
		return item;
	});
}

/**
 * Sanitizes the userStats object deeply.
 * @param {Object} userStats - The userStats object from parsed JSON
 * @returns {Object} Sanitized userStats
 */
function sanitizeUserStats(userStats) {
	if (!userStats || typeof userStats !== "object") {
		return userStats;
	}

	// Get dynamic allowed keys for status (mood + custom fields from config)
	const statusAllowedKeys = ["mood"];
	const customFields =
		extensionSettings.trackerConfig?.userStats?.statusSection?.customFields ||
		[];
	for (const field of customFields) {
		const fieldKey = toSnakeCase(field);
		statusAllowedKeys.push(fieldKey);
	}

	// Get dynamic allowed keys for details (custom fields from presentCharacters config)
	const detailsAllowedKeys = [];
	const charCustomFields =
		extensionSettings.trackerConfig?.presentCharacters?.customFields || [];
	for (const field of charCustomFields) {
		if (field?.enabled && field?.name) {
			const fieldKey = toSnakeCase(field.name);
			detailsAllowedKeys.push(fieldKey);
			detailsAllowedKeys.push(field.name); // Allow both snake_case and original
		}
	}

	const result = filterObjectKeys(userStats, USER_STATS_KEYS, "userStats");

	// Sanitize stats array
	if (result.stats && Array.isArray(result.stats)) {
		result.stats = sanitizeArrayItems(
			result.stats,
			STATS_ITEM_KEYS,
			"userStats.stats",
		);
	}

	// Sanitize status object
	if (result.status && typeof result.status === "object") {
		result.status = filterObjectKeys(
			result.status,
			statusAllowedKeys,
			"userStats.status",
		);
	}

	// Sanitize skills array (items can be objects with {name} or plain strings)
	if (result.skills && Array.isArray(result.skills)) {
		result.skills = result.skills.map((item, index) => {
			if (item && typeof item === "object" && !Array.isArray(item)) {
				return filterObjectKeys(item, ["name"], `userStats.skills[${index}]`);
			}
			return item; // Allow plain strings
		});
	}

	// Sanitize inventory
	if (result.inventory && typeof result.inventory === "object") {
		result.inventory = filterObjectKeys(
			result.inventory,
			INVENTORY_KEYS,
			"userStats.inventory",
		);

		// Sanitize onPerson array
		if (Array.isArray(result.inventory.onPerson)) {
			result.inventory.onPerson = sanitizeArrayItems(
				result.inventory.onPerson,
				INVENTORY_ITEM_KEYS,
				"userStats.inventory.onPerson",
			);
		}

		// Sanitize stored object (each location is an array of items)
		if (
			result.inventory.stored &&
			typeof result.inventory.stored === "object"
		) {
			for (const location of Object.keys(result.inventory.stored)) {
				if (Array.isArray(result.inventory.stored[location])) {
					result.inventory.stored[location] = sanitizeArrayItems(
						result.inventory.stored[location],
						INVENTORY_ITEM_KEYS,
						`userStats.inventory.stored.${location}`,
					);
				}
			}
		}

		// Sanitize assets array
		if (Array.isArray(result.inventory.assets)) {
			result.inventory.assets = sanitizeArrayItems(
				result.inventory.assets,
				INVENTORY_ITEM_KEYS,
				"userStats.inventory.assets",
			);
		}
	}

	// Sanitize appearance
	if (result.appearance && typeof result.appearance === "object") {
		result.appearance = filterObjectKeys(
			result.appearance,
			APPEARANCE_KEYS,
			"userStats.appearance",
		);

		// Sanitize array fields (clothing, accessories, physicalFeatures)
		for (const arrayField of ["clothing", "accessories", "physicalFeatures"]) {
			if (Array.isArray(result.appearance[arrayField])) {
				result.appearance[arrayField] = sanitizeArrayItems(
					result.appearance[arrayField],
					APPEARANCE_ITEM_KEYS,
					`userStats.appearance.${arrayField}`,
				);
			}
		}
	}

	// Sanitize quests
	if (result.quests && typeof result.quests === "object") {
		result.quests = filterObjectKeys(
			result.quests,
			QUESTS_KEYS,
			"userStats.quests",
		);

		// Sanitize main quest
		if (result.quests.main && typeof result.quests.main === "object") {
			result.quests.main = filterObjectKeys(
				result.quests.main,
				QUEST_ITEM_KEYS,
				"userStats.quests.main",
			);
		}

		// Sanitize optional quests array
		if (Array.isArray(result.quests.optional)) {
			result.quests.optional = sanitizeArrayItems(
				result.quests.optional,
				QUEST_ITEM_KEYS,
				"userStats.quests.optional",
			);
		}
	}

	return result;
}

/**
 * Sanitizes the infoBox object deeply.
 * @param {Object} infoBox - The infoBox object from parsed JSON
 * @returns {Object} Sanitized infoBox
 */
function sanitizeInfoBox(infoBox) {
	if (!infoBox || typeof infoBox !== "object") {
		return infoBox;
	}

	const result = filterObjectKeys(infoBox, INFO_BOX_KEYS, "infoBox");

	// Sanitize date
	if (result.date && typeof result.date === "object") {
		result.date = filterObjectKeys(
			result.date,
			INFO_BOX_DATE_KEYS,
			"infoBox.date",
		);
	}

	// Sanitize weather (with migration from old format)
	if (result.weather && typeof result.weather === "object") {
		// Migrate old format: {emoji, forecast} -> {icon, condition}
		if ("emoji" in result.weather && !("icon" in result.weather)) {
			result.weather.icon = result.weather.emoji;
			delete result.weather.emoji;
			console.log("[RPG Parser] Migrated weather.emoji -> weather.icon");
		}
		if ("forecast" in result.weather && !("condition" in result.weather)) {
			result.weather.condition = result.weather.forecast;
			delete result.weather.forecast;
			console.log("[RPG Parser] Migrated weather.forecast -> weather.condition");
		}
		result.weather = filterObjectKeys(
			result.weather,
			INFO_BOX_WEATHER_KEYS,
			"infoBox.weather",
		);
	}

	// Sanitize temperature (with migration from old format)
	if (result.temperature && typeof result.temperature === "object") {
		// Migrate old format: {value, unit} -> {outdoor: {value, unit}}
		if ("value" in result.temperature && !("outdoor" in result.temperature)) {
			const oldValue = result.temperature.value;
			const oldUnit = result.temperature.unit || "C";
			result.temperature = {
				outdoor: { value: oldValue, unit: oldUnit }
			};
			console.log("[RPG Parser] Migrated temperature to outdoor format");
		}

		// Filter top-level temperature keys
		result.temperature = filterObjectKeys(
			result.temperature,
			INFO_BOX_TEMPERATURE_KEYS,
			"infoBox.temperature",
		);

		// Sanitize outdoor temperature
		if (result.temperature.outdoor && typeof result.temperature.outdoor === "object") {
			result.temperature.outdoor = filterObjectKeys(
				result.temperature.outdoor,
				INFO_BOX_TEMPERATURE_OUTDOOR_KEYS,
				"infoBox.temperature.outdoor",
			);
		}

		// Sanitize indoor temperature (optional)
		if (result.temperature.indoor && typeof result.temperature.indoor === "object") {
			result.temperature.indoor = filterObjectKeys(
				result.temperature.indoor,
				INFO_BOX_TEMPERATURE_INDOOR_KEYS,
				"infoBox.temperature.indoor",
			);
		}
	}

	// Sanitize time
	if (result.time && typeof result.time === "object") {
		result.time = filterObjectKeys(
			result.time,
			INFO_BOX_TIME_KEYS,
			"infoBox.time",
		);
	}

	// Sanitize location
	if (result.location && typeof result.location === "object") {
		result.location = filterObjectKeys(
			result.location,
			INFO_BOX_LOCATION_KEYS,
			"infoBox.location",
		);
	}

	// recentEvents is an array of strings - no object keys to strip
	// but we can validate it's an array
	if (result.recentEvents && !Array.isArray(result.recentEvents)) {
		console.warn(
			"[RPG Parser] infoBox.recentEvents is not an array, converting to empty array",
		);
		result.recentEvents = [];
	}

	return result;
}

/**
 * Sanitizes the characters array deeply.
 * @param {Array} characters - The characters array from parsed JSON
 * @returns {Array} Sanitized characters
 */
function sanitizeCharacters(characters) {
	if (!Array.isArray(characters)) {
		return characters;
	}

	// Get dynamic allowed keys for details (custom fields from config)
	const detailsAllowedKeys = [];
	const charCustomFields =
		extensionSettings.trackerConfig?.presentCharacters?.customFields || [];
	for (const field of charCustomFields) {
		if (field?.enabled && field?.name) {
			const fieldKey = toSnakeCase(field.name);
			detailsAllowedKeys.push(fieldKey);
			detailsAllowedKeys.push(field.name); // Allow both snake_case and original
		}
	}

	return characters.map((char, index) => {
		if (!char || typeof char !== "object") {
			return char;
		}

		// Filter top-level character keys
		const sanitized = filterObjectKeys(
			char,
			CHARACTER_KEYS,
			`characters[${index}]`,
		);

		// Sanitize details object
		if (sanitized.details && typeof sanitized.details === "object") {
			sanitized.details = filterObjectKeys(
				sanitized.details,
				detailsAllowedKeys,
				`characters[${index}].details`,
			);
		}

		// Sanitize stats array
		if (sanitized.stats && Array.isArray(sanitized.stats)) {
			sanitized.stats = sanitizeArrayItems(
				sanitized.stats,
				CHARACTER_STATS_ITEM_KEYS,
				`characters[${index}].stats`,
			);
		}

		// Sanitize thoughts object
		if (sanitized.thoughts && typeof sanitized.thoughts === "object") {
			sanitized.thoughts = filterObjectKeys(
				sanitized.thoughts,
				CHARACTER_THOUGHTS_KEYS,
				`characters[${index}].thoughts`,
			);
		}

		return sanitized;
	});
}

/**
 * Converts a string to snake_case.
 * @param {string} str - String to convert
 * @returns {string} snake_case string
 */
function toSnakeCase(str) {
	if (!str || typeof str !== "string") return "";
	return str
		.toLowerCase()
		.replace(/\s+/g, "_")
		.replace(/[^a-z0-9_]/g, "");
}

/**
 * Sanitizes the entire parsed JSON object by stripping unexpected fields
 * at every nesting level.
 * @param {Object} parsed - The parsed JSON object from AI response
 * @returns {Object} Sanitized object with only whitelisted fields
 */
export function sanitizeParsedData(parsed) {
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return parsed;
	}

	// Filter top-level keys
	const result = filterObjectKeys(parsed, TOP_LEVEL_KEYS, "root");

	// Sanitize each section
	if (result.userStats) {
		result.userStats = sanitizeUserStats(result.userStats);
	}

	if (result.infoBox) {
		result.infoBox = sanitizeInfoBox(result.infoBox);
	}

	if (result.characters) {
		result.characters = sanitizeCharacters(result.characters);
	}

	return result;
}

/**
 * Parses the model response to extract the different data sections.
 * Extracts tracker data from markdown code blocks in the AI response.
 * Handles both separate code blocks and combined code blocks gracefully.
 *
 * @param {string} responseText - The raw AI response text
 * @returns {{userStats: string|null, infoBox: string|null, characterThoughts: string|null}} Parsed tracker data
 */
export function parseResponse(response) {
	debugLog(
		"[RPG Parser] ==================== PARSING AI RESPONSE ====================",
	);
	debugLog("[RPG Parser] Response Raw:", response);

	// Clean response and find first JSON object
	const cleanedResponse = response.content.replace(/FORMAT:\s*/gi, "");
	const startIdx = cleanedResponse.indexOf("{");

	if (startIdx === -1) {
		console.warn("[RPG Parser] No JSON structure found in response");
		return { userStats: null, infoBox: null, characterThoughts: null };
	}

	// Match braces to extract complete JSON object
	let depth = 1,
		i = startIdx + 1;
	let inString = false,
		escapeNext = false;

	while (i < cleanedResponse.length && depth > 0) {
		const char = cleanedResponse[i];
		if (escapeNext) {
			escapeNext = false;
		} else if (char === "\\") {
			escapeNext = true;
		} else if (char === '"') {
			inString = !inString;
		} else if (!inString) {
			if (char === "{") depth++;
			else if (char === "}") depth--;
		}
		i++;
	}

	// Parse and validate the JSON object
	const rawParsed = repairJSON(cleanedResponse.substring(startIdx, i).trim());

	// Sanitize: strip any unexpected fields at every nesting level
	const parsed = rawParsed ? sanitizeParsedData(rawParsed) : rawParsed;

	if (parsed && (parsed.userStats || parsed.infoBox || parsed.characters)) {
		debugLog("[RPG Parser] Returning unified JSON parse results");

		// Apply time format conversion if time data exists
		if (
			parsed.infoBox?.time &&
			extensionSettings.trackerConfig.infoBox.widgets.time.format !== "none"
		) {
			const preference =
				extensionSettings.trackerConfig.infoBox.widgets.time.format;
			if (parsed.infoBox.time.start) {
				parsed.infoBox.time.start = convertTimeFormat(
					parsed.infoBox.time.start,
					preference,
				);
			}
			if (parsed.infoBox.time.end) {
				parsed.infoBox.time.end = convertTimeFormat(
					parsed.infoBox.time.end,
					preference,
				);
			}
			debugLog("[RPG Parser] Applied time format conversion:", preference);
		}

		return {
			userStats: parsed.userStats ? parsed.userStats : null,
			infoBox: parsed.infoBox ? parsed.infoBox : null,
			characterThoughts: parsed.characters ? parsed.characters : null,
		};
	}

	console.warn("[RPG Parser] No valid JSON structure found in response");
	return { userStats: null, infoBox: null, characterThoughts: null };
} // End parseResponse

/**
 * Helper: Extract code blocks from text
 * @param {string} text - Text containing markdown code blocks
 * @returns {Array<string>} Array of code block contents
 */
export function extractCodeBlocks(text) {
	const codeBlockRegex = /```([^`]+)```/g;
	const matches = [...text.matchAll(codeBlockRegex)];
	return matches.map((match) => match[1].trim());
}

/**
 * Helper: Parse stats section from code block content
 * @param {string} content - Code block content
 * @returns {boolean} True if this is a stats section
 */
export function isStatsSection(content) {
	return content.match(/Stats\s*\n\s*---/i) !== null;
}

/**
 * Helper: Parse info box section from code block content
 * @param {string} content - Code block content
 * @returns {boolean} True if this is an info box section
 */
export function isInfoBoxSection(content) {
	return content.match(/Info Box\s*\n\s*---/i) !== null;
}

/**
 * Helper: Parse character thoughts section from code block content
 * @param {string} content - Code block content
 * @returns {boolean} True if this is a character thoughts section
 */
export function isCharacterThoughtsSection(content) {
	return (
		content.match(/Present Characters\s*\n\s*---/i) !== null ||
		content.includes(" | ")
	);
}
