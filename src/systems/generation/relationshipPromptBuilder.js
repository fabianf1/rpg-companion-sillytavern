/**
 * Relationship Prompt Builder Module
 * Builds a focused prompt for updating character relationships.
 * Called after onMessageSent to update relationships in a separate LLM call.
 */

import { chat } from "../../../../../../../script.js";
import { getContext } from "../../../../../../extensions.js";
import { extensionSettings } from "../../core/state.js";
import { getTrackerDataForContext } from "./trackerDataUtils.js";

/**
 * Builds the relationship update prompt for a dedicated API call.
 * Focused only on relationships — the LLM should only provide updated relationships.
 *
 * @returns {Array<{role: string, content: string}>} Array of message objects for API
 */
export function generateRelationshipUpdatePrompt() {
	const userName = getContext().name1;
	const depth = extensionSettings.relationUpdateDepth ?? extensionSettings.updateDepth;
	// Get status options from relationshipEmojis keys (the keys define allowed statuses)
	const relationshipEmojis = extensionSettings.trackerConfig?.presentCharacters
		?.relationships?.relationshipEmojis || {
		Lover: "❤️",
		Friend: "⭐",
		Ally: "🤝",
		Enemy: "⚔️",
		Neutral: "⚖️",
	};
	const statusOptions = Object.keys(relationshipEmojis);

	const messages = [];

	// System message
	const systemMessage = buildRelationshipSystemMessage(userName, statusOptions);
	messages.push({ role: "system", content: systemMessage });

	// Chat history for context
	const recentMessages = chat.slice(-depth);
	for (let i = 0; i < recentMessages.length; i++) {
		const message = recentMessages[i];
		messages.push({
			role: message.is_user ? "user" : "assistant",
			content: message.mes,
		});
	}

	// Instruction message
	const instructionMessage = buildRelationshipInstructionMessage(
		userName,
		statusOptions,
	);
	messages.push({ role: "user", content: instructionMessage });

	return messages;
}

/**
 * Builds the system message for relationship updates.
 *
 * @param {string} userName - The user's character name
 * @param {string[]} statusOptions - Available relationship status options
 * @returns {string} The system message
 */
function buildRelationshipSystemMessage(userName, _statusOptions) {
	let systemMessage = `You are an RPG Companion module that maintains a cumulative record of character relationships. Your task is to update the enduring relationship state between character pairs based on the conversation.\n\n`;

	systemMessage += `CRITICAL: You are tracking LONG-TERM RELATIONSHIP DYNAMICS, not momentary reactions.\n`;
	systemMessage += `- Focus on the overall relationship trajectory, not the latest exchange\n`;
	systemMessage += `- A single conversation should rarely cause dramatic relationship shifts\n`;
	systemMessage += `- Relationships evolve gradually through accumulated interactions\n`;
	systemMessage += `- If insufficient information exists for a field, use null rather than fabricating\n\n`;

	systemMessage += `Here is the description of the protagonist for reference:\n`;
	systemMessage += `<protagonist name="${userName}">\n{{persona}}\n</protagonist>\n\n`;

	systemMessage += `Here are the last few messages in the conversation history:\n<history>`;

	return systemMessage;
}

/**
 * Builds the instruction message for relationship updates.
 *
 * @param {string} userName - The user's character name
 * @param {string[]} statusOptions - Available relationship status options
 * @returns {string} The instruction message
 */
function buildRelationshipInstructionMessage(userName, statusOptions) {
	const statusList = statusOptions.map((s) => `"${s}"`).join(", ");

	let instruction = `</history>\n\n`;
	instruction += `Update the relationship data between characters based on the conversation above.\n\n`;

	// Include current relationships as context
	let currentRelationships = getTrackerDataForContext("relationships");
	if (currentRelationships && currentRelationships.length > 0) {
		// If protagonist-only mode is enabled, filter to only protagonist-involved pairs
		if (
			extensionSettings.trackerConfig?.presentCharacters?.relationships
				?.relationshipsProtagonistOnly
		) {
			currentRelationships = currentRelationships.filter((rel) => {
				const c1 = rel.character1 || "";
				const c2 = rel.character2 || "";
				return c1 === userName || c2 === userName;
			});
		}
		instruction += `<current_relationships>\n`;
		instruction += JSON.stringify(currentRelationships, null, 2);
		instruction += `\n</current_relationships>\n\n`;
	} else {
		instruction += `No existing relationships yet.\n\n`;
	}

	instruction += `Provide ONLY the updated relationships array in the exact JSON format below. Do NOT include any other text, commentary, or roleplay response.\n\n`;

	instruction += `FORMAT:\n`;
	instruction += `{\n`;
	instruction += `  "relationships": [\n`;
	instruction += `    {\n`;
	instruction += `      "character1": "CharacterName",\n`;
	instruction += `      "character2": "OtherCharacterName",\n`;
	instruction += `      "status": "Status",\n`;
	instruction += `      "feelsTowards": "Enduring feeling of character1 toward character2, or null if unknown",\n`;
	instruction += `      "wantsFrom": "Core desire of character1 from character2, or null if unknown",\n`;
	instruction += `      "secretsFrom": "Secret character1 hides specifically FROM character2, or null if none",\n`;
	instruction += `      "feelsTowards2": "Enduring feeling of character2 toward character1, or null if unknown",\n`;
	instruction += `      "wantsFrom2": "Core desire of character2 from character1, or null if unknown",\n`;
	instruction += `      "secretsFrom2": "Secret character2 hides specifically FROM character1, or null if none"\n`;
	instruction += `    }\n`;
	instruction += `  ]\n`;
	instruction += `}\n\n`;

	instruction += `RULES:\n`;
	instruction += `- Status must be one of: ${statusList}\n`;
	instruction += `- Only include character pairs that have a meaningful relationship history\n`;
	instruction += `- If nothing meaningful has changed in a relationship, preserve the existing data exactly\n`;
	instruction += `- Use null for any field you cannot reliably determine from the overall relationship context — do not fabricate\n`;
	instruction += `- Each field must be 1-5 words capturing the underlying dynamic, not a description of recent events\n`;
	instruction += `- "feelsTowards" / "feelsTowards2": the enduring emotional stance (e.g. "deep affection", "wary respect", "distrust"). NOT what they felt in the last scene\n`;
	instruction += `- "wantsFrom" / "wantsFrom2": the core ongoing desire (e.g. "loyalty", "freedom", "revenge"). NOT a momentary request\n`;
	instruction += `- "secretsFrom" / "secretsFrom2": interpersonal secrets BETWEEN the two characters only. NOT secrets about third parties or general matters. Use null if none exist\n`;
	instruction += `- Do NOT reference specific dialogue, actions, or scenes — abstract to the relationship level\n`;
	instruction += `- Output the JSON object directly, NOT wrapped in code fences\n`;

	// Add protagonist-only rule if enabled
	if (
		extensionSettings.trackerConfig?.presentCharacters?.relationships
			?.relationshipsProtagonistOnly
	) {
		instruction += `- Only include relationships where the protagonist ("${userName}") is one of the two characters (either character1 or character2). Exclude relationships between two NPCs.\n`;
	}

	return instruction;
}
