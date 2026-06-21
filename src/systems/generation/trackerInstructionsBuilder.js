/**
 * Tracker Instructions Builder Module
 * Handles generation of tracker instructions, examples, and contextual summaries for AI prompts
 */

import { getContext } from "../../../../../../extensions.js";
import { extensionSettings } from "../../core/state.js";
import { buildAttributesString } from "./characterInfoBuilder.js";
import {
	addLockInstruction,
	buildCharactersJSONInstruction,
	buildInfoBoxJSONInstruction,
	buildUserStatsJSONInstruction,
} from "./jsonPromptHelpers.js";
import { applyLocks } from "./lockManager.js";
import { getTrackerDataForContext } from "./trackerDataUtils.js";
import {
	formatRelationshipsForContext,
	formatTrackerDataForContext,
} from "./valueFormatter.js";

// ============================================================================
// TRACKER EXAMPLE
// ============================================================================

/**
 * Generates an example block showing current tracker states in markdown code blocks.
 * Uses COMMITTED data (not displayed data) for generation context.
 *
 * @returns {string} Formatted example text with tracker data in code blocks
 */
export function generateTrackerExample() {
	let example = "";

	// Use authoritative swipe store data for generation context
	// Apply locks before sending to AI (for JSON format only)
	// Build unified JSON structure with proper wrapper keys
	const parts = [];

	const userStatsData = getTrackerDataForContext("userStats");
	const infoBoxData = getTrackerDataForContext("infoBox");
	const characterThoughtsData = getTrackerDataForContext("characterThoughts");

	if (extensionSettings.showUserStats && userStatsData) {
		// Apply locks to object data
		const lockedData = applyLocks(userStatsData, "userStats");
		parts.push(`  "userStats": ${JSON.stringify(lockedData, null, 2)}`);
	}

	if (extensionSettings.showInfoBox && infoBoxData) {
		// Apply locks to object data
		const lockedData = applyLocks(infoBoxData, "infoBox");
		parts.push(`  "infoBox": ${JSON.stringify(lockedData, null, 2)}`);
	}

	if (extensionSettings.showCharacterThoughts && characterThoughtsData) {
		// Filter to only include characters in scene for context injection
		let filteredData = characterThoughtsData;
		if (Array.isArray(characterThoughtsData)) {
			filteredData = characterThoughtsData.filter(
				(char) => char.inScene !== false,
			);
		} else if (characterThoughtsData?.characters) {
			filteredData = {
				...characterThoughtsData,
				characters: characterThoughtsData.characters.filter(
					(char) => char.inScene !== false,
				),
			};
		}

		// Apply locks to object data
		const lockedData = applyLocks(filteredData, "characters");
		parts.push(`  "characters": ${JSON.stringify(lockedData, null, 2)}`);
	}

	// If we have JSON parts, wrap them in unified structure
	if (parts.length > 0) {
		example = "{\n" + parts.join(",\n") + "\n}";
	}

	return example.trim();
}

// ============================================================================
// TRACKER INSTRUCTIONS
// ============================================================================

/**
 * Generates the instruction portion - format specifications and guidelines.
 * NOW USES JSON FORMAT (v3) instead of text format
 *
 * @param {boolean} includeHtmlPrompt - Whether to include the HTML prompt (true for main generation, false for separate tracker generation); Deprecated since HTML prompt is not used anymore
 * @param {boolean} includeContinuation - Whether to include "After updating the trackers, continue..." instruction
 * @param {boolean} includeAttributes - Whether to include RPG attributes (false for separate tracker generation)
 * @param {Array<string>} [selectedSections] - Optional array of section names to include (for partial refresh)
 * @returns {string} Formatted instruction text for the AI
 */
export function generateTrackerInstructions(
	_includeHtmlPrompt = true,
	_includeContinuation = false,
	includeAttributes = true,
	selectedSections = null,
) {
	const userName = getContext().name1;
	const trackerConfig = extensionSettings.trackerConfig;
	let instructions = "";

	// Determine which trackers are enabled based on selectedSections or show* settings
	// Nested sub-sections (stats, status, skills, appearance, inventory, quests) are part of userStats
	const nestedSubSections = [
		"stats",
		"status",
		"skills",
		"appearance",
		"inventory",
		"quests",
	];
	const hasNestedSections = selectedSections
		? selectedSections.some((s) => nestedSubSections.includes(s))
		: false;

	const shouldIncludeUserStats = selectedSections
		? hasNestedSections
		: extensionSettings.showUserStats;
	const shouldIncludeInfoBox = selectedSections
		? selectedSections.includes("infoBox")
		: extensionSettings.showInfoBox;
	const shouldIncludeCharacterThoughts = selectedSections
		? selectedSections.includes("characterThoughts")
		: extensionSettings.showCharacterThoughts;

	// Extract nested sub-sections from selectedSections
	const userStatsSubSections = selectedSections
		? selectedSections.filter((s) => nestedSubSections.includes(s))
		: null;

	// Check if any trackers are enabled
	const hasAnyTrackers =
		shouldIncludeUserStats ||
		shouldIncludeInfoBox ||
		shouldIncludeCharacterThoughts;

	// Only add tracker instructions if at least one tracker is enabled
	if (hasAnyTrackers) {
		// Universal instruction header
		instructions +=
			"\nAt the start of every reply, you must attach an update to the trackers in EXACTLY the JSON format shown below as a single unified JSON object containing all enabled tracker fields. ";

		// If partial refresh, add a note about which sections to update
		if (selectedSections) {
			const sectionNames = [];
			if (shouldIncludeUserStats) {
				if (userStatsSubSections && userStatsSubSections.length > 0) {
					// For nested sub-sections, be explicit about the JSON path
					const pathParts = userStatsSubSections.map((s) => `userStats.${s}`);
					sectionNames.push('"' + pathParts.join('" and "') + '"');
				} else {
					sectionNames.push('"userStats"');
				}
			}
			if (shouldIncludeInfoBox) sectionNames.push('"infoBox"');
			if (shouldIncludeCharacterThoughts) sectionNames.push('"characters"');

			// For nested sub-sections within userStats, add extra clarity
			if (userStatsSubSections && userStatsSubSections.length > 0) {
				const pathDescriptions = userStatsSubSections.map(
					(s) => `"userStats.${s}"`,
				);
				instructions += `\nThe JSON example below shows the full userStats structure for reference, but you should ONLY modify the ${pathDescriptions.join(" and ")} field(s) within userStats. Copy all other userStats fields (stats, status, skills, and any non-selected sub-sections) exactly as they appear in <previous_tracker_state> above. `;
			}
		}

		// Append custom instruction portion if available
		const customPrompt = extensionSettings.customTrackerInstructionsPrompt;
		if (customPrompt) {
			instructions += customPrompt.replace(/{userName}/g, userName);
		} else {
			instructions += `Replace X with actual numbers (e.g., 69) and replace all placeholders with concrete in-world details that ${userName} perceives about the current scene and the present characters. For example: "Location" becomes "Forest Clearing", "Mood Emoji" becomes "😊". DO NOT include ${userName} in the characters section, only NPCs. Prefer brief, keyword-like descriptions — a few terse phrases (e.g. "tall, scarred, worn cloak") if applicable, NOT full sentences or paragraphs. `;
			instructions += `Trackers are a SNAPSHOT of the present moment — what IS true NOW. Update ONLY what changed in the last message. Do NOT track future events, plans, intentions, or what WILL happen. If a character says they will change clothes, record what they wear NOW, not what they will wear.`;
		}

		// Add lock instruction
		instructions += addLockInstruction("");

		// Add format specifications for each enabled tracker using JSON
		// Wrap all trackers in a unified JSON structure
		const enabledTrackers = [];
		if (shouldIncludeUserStats) {
			enabledTrackers.push("userStats");
		}
		if (shouldIncludeInfoBox) {
			enabledTrackers.push("infoBox");
		}
		if (shouldIncludeCharacterThoughts) {
			enabledTrackers.push("characters");
		}

		if (enabledTrackers.length > 0) {
			instructions +=
				"\n\nFORMAT:\n\nProvide EXACTLY ONE JSON code block with ALL tracker sections wrapped in a single object:\n\n```json\n{\n";

			if (shouldIncludeUserStats) {
				instructions += '  "userStats": ';
				const userStatsJSON = buildUserStatsJSONInstruction();
				// Add 2 spaces to all lines after the first to properly nest within root object
				instructions += userStatsJSON
					.split("\n")
					.map((line, i) => (i === 0 ? line : "  " + line))
					.join("\n");
				instructions +=
					enabledTrackers.indexOf("userStats") < enabledTrackers.length - 1
						? ",\n"
						: "\n";
			}

			if (shouldIncludeInfoBox) {
				instructions += '  "infoBox": ';
				const infoBoxJSON = buildInfoBoxJSONInstruction();
				// Add 2 spaces to all lines after the first to properly nest within root object
				instructions += infoBoxJSON
					.split("\n")
					.map((line, i) => (i === 0 ? line : "  " + line))
					.join("\n");
				instructions +=
					enabledTrackers.indexOf("infoBox") < enabledTrackers.length - 1
						? ",\n"
						: "\n";
			}

			if (shouldIncludeCharacterThoughts) {
				instructions += '  "characters": ';
				const charactersJSON = buildCharactersJSONInstruction();
				// Add 2 spaces to all lines after the first to properly nest within root object
				instructions += charactersJSON
					.split("\n")
					.map((line, i) => (i === 0 ? line : "  " + line))
					.join("\n");
			}

			instructions +=
				"\n}\n```\n\nDo NOT output multiple separate JSON objects. Everything must be in ONE unified object with the keys shown above.";
		}

		// Include attributes based on settings (only if includeAttributes is true)
		if (includeAttributes) {
			const alwaysSendAttributes =
				trackerConfig?.userStats?.alwaysSendAttributes;
			const showRPGAttributes =
				trackerConfig?.userStats?.showRPGAttributes !== false;
			const shouldSendAttributes = alwaysSendAttributes && showRPGAttributes;

			if (shouldSendAttributes) {
				const attributesString = buildAttributesString();
				instructions += `${userName}'s attributes: ${attributesString}\n`;
			}
		}

		// Add dice roll context if there was one (independent of attributes)
		if (extensionSettings.lastDiceRoll) {
			const roll = extensionSettings.lastDiceRoll;
			const showRPGAttributes =
				trackerConfig?.userStats?.showRPGAttributes !== false;
			const alwaysSendAttributes =
				trackerConfig?.userStats?.alwaysSendAttributes;
			const hasAttributes =
				includeAttributes && alwaysSendAttributes && showRPGAttributes;

			if (hasAttributes) {
				instructions += `${userName} rolled ${roll.total} on the last ${roll.formula} roll. Based on their attributes, decide whether they succeeded or failed the action they attempted.\n\n`;
			} else {
				instructions += `${userName} rolled ${roll.total} on the last ${roll.formula} roll. Decide whether they succeeded or failed the action they attempted.\n\n`;
			}
		} else if (
			includeAttributes &&
			trackerConfig?.userStats?.alwaysSendAttributes &&
			trackerConfig?.userStats?.showRPGAttributes !== false
		) {
			instructions += `\n`;
		}
	}

	return instructions;
}

// ============================================================================
// CONTEXTUAL SUMMARY
// ============================================================================

/**
 * Generates a formatted contextual summary for SEPARATE mode injection.
 * Includes the full tracker data in original format (without code fences and separators).
 * Uses COMMITTED data (not displayed data) for generation context.
 *
 * @returns {string} Formatted contextual summary
 */
export function generateContextualSummary() {
	// Use COMMITTED data for generation context, not displayed data
	const userName = getContext().name1;
	const trackerConfig = extensionSettings.trackerConfig;
	let summary = "";

	// Add User Stats tracker data if enabled
	if (extensionSettings.showUserStats) {
		const userStatsData = getTrackerDataForContext("userStats");
		if (userStatsData) {
			try {
				const formatted = formatTrackerDataForContext(
					userStatsData,
					"userStats",
					userName,
				);
				if (formatted) {
					summary += formatted + "\n";
				}
			} catch (e) {
				console.warn(
					"[RPG Companion] Failed to format userStats for context:",
					e,
				);
			}
		}
	}

	// Add Info Box tracker data if enabled
	if (extensionSettings.showInfoBox) {
		const infoBoxData = getTrackerDataForContext("infoBox");
		if (infoBoxData) {
			try {
				const formatted = formatTrackerDataForContext(
					infoBoxData,
					"infoBox",
					userName,
				);
				if (formatted) {
					summary += formatted + "\n";
				}
			} catch (e) {
				console.warn(
					"[RPG Companion] Failed to format infoBox for context:",
					e,
				);
			}
		}
	}

	// Add Present Characters tracker data if enabled
	if (extensionSettings.showCharacterThoughts) {
		const characterThoughtsData = getTrackerDataForContext("characterThoughts");
		if (characterThoughtsData) {
			try {
				// Filter to only include characters in scene for context injection
				let filteredData = characterThoughtsData;
				if (Array.isArray(characterThoughtsData)) {
					filteredData = characterThoughtsData.filter(
						(char) => char.inScene !== false,
					);
				} else if (characterThoughtsData?.characters) {
					filteredData = {
						...characterThoughtsData,
						characters: characterThoughtsData.characters.filter(
							(char) => char.inScene !== false,
						),
					};
				}

				const formatted = formatTrackerDataForContext(
					filteredData,
					"characters",
					userName,
				);
				if (formatted) {
					summary += formatted + "\n";
				}
			} catch (e) {
				console.warn(
					"[RPG Companion] Failed to format characters for context:",
					e,
				);
			}
		}
	}

	// Add Relationships data if enabled
	if (extensionSettings.showRelationships) {
		const relationshipsData = getTrackerDataForContext("relationships");
		if (relationshipsData && Array.isArray(relationshipsData)) {
			try {
				// Filter relationships to only include pairs where at least one character is in scene
				const characterThoughtsData =
					getTrackerDataForContext("characterThoughts");
				const charactersInScene = new Set();

				// Build set of characters currently in scene
				if (characterThoughtsData) {
					const chars = Array.isArray(characterThoughtsData)
						? characterThoughtsData
						: characterThoughtsData?.characters || [];
					for (const char of chars) {
						if (char.inScene !== false && char.name) {
							charactersInScene.add(char.name.toLowerCase());
						}
					}
				}

				// Filter relationships: include if either character is in scene
				const filteredRelationships = relationshipsData.filter((rel) => {
					const c1 = (rel.character1 || "").toLowerCase();
					const c2 = (rel.character2 || "").toLowerCase();
					return charactersInScene.has(c1) || charactersInScene.has(c2);
				});

				const formatted = formatRelationshipsForContext(filteredRelationships);
				if (formatted) {
					summary += formatted + "\n";
				}
			} catch (e) {
				console.warn(
					"[RPG Companion] Failed to format relationships for context:",
					e,
				);
			}
		}
	}

	// Include attributes based on settings
	const alwaysSendAttributes = trackerConfig?.userStats?.alwaysSendAttributes;
	const showRPGAttributes =
		trackerConfig?.userStats?.showRPGAttributes !== false;
	const shouldSendAttributes = alwaysSendAttributes && showRPGAttributes;

	if (shouldSendAttributes) {
		const attributesString = buildAttributesString();
		summary += `${userName}'s attributes: ${attributesString}\n`;
	}

	// Add dice roll context if there was one (independent of attributes)
	if (extensionSettings.lastDiceRoll) {
		const roll = extensionSettings.lastDiceRoll;

		if (shouldSendAttributes) {
			summary += `${userName} rolled ${roll.total} on the last ${roll.formula} roll. Based on their attributes, decide whether they succeeded or failed the action they attempted.\n\n`;
		} else {
			summary += `${userName} rolled ${roll.total} on the last ${roll.formula} roll. Decide whether they succeeded or failed the action they attempted.\n\n`;
		}
	} else if (shouldSendAttributes) {
		summary += `\n`;
	}

	return summary.trim();
}

// ============================================================================
// RPG PROMPT TEXT
// ============================================================================

/**
 * Generates the RPG tracking prompt text (for backward compatibility with separate mode).
 * Uses COMMITTED data (not displayed data) for generation context.
 *
 * @param {Array<string>} [selectedSections] - Optional array of section names to include (for partial refresh)
 * @returns {string} Full prompt text for separate tracker generation
 */
export function generateRPGPromptText(selectedSections = null) {
	// Use authoritative swipe store data for generation context
	let promptText = "";

	promptText += `Here are the previous tracker values (state BEFORE the last assistant message) that you should use as a reference:\n`;
	promptText += `<previous_tracker_state>\n`;

	// Get data from authoritative swipe store
	const userStatsData = getTrackerDataForContext("userStats");
	const infoBoxData = getTrackerDataForContext("infoBox");
	const characterThoughtsData = getTrackerDataForContext("characterThoughts");

	// Build unified JSON structure for previous trackers (v3.1 format)
	// ALWAYS include ALL available data regardless of selectedSections
	// so the LLM has full context about what to update
	const hasAnyPreviousData =
		userStatsData || infoBoxData || characterThoughtsData;

	if (hasAnyPreviousData) {
		const unifiedPrevious = {};

		// Always include all available data for full context
		if (userStatsData) {
			const lockedData = applyLocks(userStatsData, "userStats");
			unifiedPrevious.userStats = lockedData;
		}

		if (infoBoxData) {
			const lockedData = applyLocks(infoBoxData, "infoBox");
			unifiedPrevious.infoBox = lockedData;
		}

		if (characterThoughtsData) {
			const lockedData = applyLocks(characterThoughtsData, "characters");
			unifiedPrevious.characters = lockedData;
		}

		// If we successfully built a unified structure, display it
		if (Object.keys(unifiedPrevious).length > 0) {
			promptText += JSON.stringify(unifiedPrevious, null, 2) + "\n";
		}
	} else {
		promptText += `None - this is the first update.\n`;
	}

	promptText += `</previous_tracker_state>\n`;

	// Don't include HTML prompt, continuation instruction, or attributes for separate tracker generation
	promptText += generateTrackerInstructions(
		false,
		false,
		false,
		selectedSections,
	);

	return promptText;
}
