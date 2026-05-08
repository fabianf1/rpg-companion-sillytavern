/**
 * Character Info Builder Module
 * Handles extraction and formatting of character card information for AI prompt context
 */

import { characters, this_chid } from "../../../../../../../script.js";
import {
	getGroupMembers,
	groups,
	selected_group,
} from "../../../../../../group-chats.js";
import { extensionSettings } from "../../core/state.js";

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default narrator prompt text
 */
const DEFAULT_NARRATOR_PROMPT = `You are the narrator, responsible for describing the world, characters, and events in vivid detail. Your role is to set the scene, describe actions and reactions, and move the story forward in an engaging way.`;

// ============================================================================
// CHARACTER CARD INFO
// ============================================================================

/**
 * Gets character card information for current chat (handles both single and group chats)
 * @returns {string} Formatted character information
 */
export function getCharacterCardsInfo() {
	let characterInfo = "";

	// Narrator mode: use character card as narrator context, infer characters from story context
	if (extensionSettings.narratorMode) {
		if (this_chid !== undefined && characters && characters[this_chid]) {
			const character = characters[this_chid];
			characterInfo +=
				"You are acting as the narrator for this story. The narrator card provides context for the story tone and style:\n\n";
			characterInfo += `<narrator>\n`;

			if (character.description) {
				characterInfo += `${character.description}\n`;
			}

			if (character.personality) {
				characterInfo += `${character.personality}\n`;
			}

			characterInfo += `</narrator>\n\n`;

			// Use custom narrator prompt if available, otherwise use default
			const narratorPrompt =
				extensionSettings.customNarratorPrompt || DEFAULT_NARRATOR_PROMPT;
			characterInfo += narratorPrompt + "\n\n";
		}
		return characterInfo;
	}

	// Check if in group chat
	if (selected_group) {
		// Find the current group directly from the groups array
		const group = groups.find((g) => g.id === selected_group);
		const groupMembers = getGroupMembers(selected_group);

		if (groupMembers && groupMembers.length > 0) {
			characterInfo += "Characters in this roleplay:\n\n";

			// Filter out disabled (muted) members
			const disabledMembers = group?.disabled_members || [];
			let characterIndex = 0;

			groupMembers.forEach((member) => {
				if (!member || !member.name) return;

				// Skip muted characters - check against avatar filename
				if (member.avatar && disabledMembers.includes(member.avatar)) {
					return;
				}

				characterIndex++;
				characterInfo += `<character${characterIndex}="${member.name}">\n`;

				if (member.description) {
					characterInfo += `${member.description}\n`;
				}

				if (member.personality) {
					characterInfo += `${member.personality}\n`;
				}

				characterInfo += `</character${characterIndex}>\n\n`;
			});
		}
	} else if (this_chid !== undefined && characters && characters[this_chid]) {
		// Single character chat
		const character = characters[this_chid];

		characterInfo += "Character in this roleplay:\n\n";
		characterInfo += `<character="${character.name}">\n`;

		if (character.description) {
			characterInfo += `${character.description}\n`;
		}

		if (character.personality) {
			characterInfo += `${character.personality}\n`;
		}

		characterInfo += `</character>\n\n`;
	}

	return characterInfo;
}

// ============================================================================
// ATTRIBUTES STRING
// ============================================================================

/**
 * Builds a dynamic attributes string based on configured RPG attributes.
 * Uses custom attribute names and values from classicStats.
 *
 * @returns {string} Formatted attributes string (e.g., "STR 10, DEX 12, INT 15, LVL 5")
 */
export function buildAttributesString() {
	const trackerConfig = extensionSettings.trackerConfig;
	const classicStats = extensionSettings.classicStats;
	const userStatsConfig = trackerConfig?.userStats;

	// Get enabled attributes from config
	const rpgAttributes = userStatsConfig?.rpgAttributes || [
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

	// Build attributes string dynamically
	const attributeParts = enabledAttributes.map((attr) => {
		const value =
			classicStats[attr.id] !== undefined ? classicStats[attr.id] : 10;
		return `${attr.name} ${value}`;
	});

	// Add level at the end (if enabled)
	const showLevel =
		extensionSettings.trackerConfig?.userStats?.showLevel !== false; // Default to true
	if (showLevel) {
		attributeParts.push(`LVL ${extensionSettings.level}`);
	}

	return attributeParts.join(", ");
}
