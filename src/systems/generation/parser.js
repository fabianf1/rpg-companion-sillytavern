/**
 * Parser Module
 * Handles parsing of AI responses to extract tracker data
 * Supports both legacy text format and new v3 JSON format
 */
import { addDebugLog, extensionSettings } from "../../core/state.js";
import { convertTimeFormat } from "../../utils/itemParser.js";
import { repairJSON } from "../../utils/jsonRepair.js";

/**
 * Helper to log to both console and debug logs array
 */
function debugLog(message, data = null) {
	// console.log(message, data || '');
	if (extensionSettings.debugMode) {
		addDebugLog(message, data);
	}
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
	const parsed = repairJSON(cleanedResponse.substring(startIdx, i).trim());
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
