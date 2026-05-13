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
	const depth = extensionSettings.updateDepth;
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
	let systemMessage = `You are an RPG Companion module that tracks character relationships. Your ONLY task is to update the relationship data between characters based on the conversation history.\n\n`;

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
function buildRelationshipInstructionMessage() {
	const statusList = statusOptions.map((s) => `"${s}"`).join(", ");

	let instruction = `</history>\n\n`;
	instruction += `Based on the conversation above, update the relationship data between characters.\n\n`;

	// Include current relationships as context
	const currentRelationships = getTrackerDataForContext("relationships");
	if (currentRelationships && currentRelationships.length > 0) {
		instruction += `<current_relationships>\n`;
		instruction += JSON.stringify(currentRelationships, null, 2);
		instruction += `\n</current_relationships>\n\n`;
	} else {
		instruction += `No existing relationships yet.\n\n`;
	}

	instruction += `Provide ONLY the updated relationships array in the exact JSON format below. Do NOT include any other text, commentary, or roleplay response.\n\n`;

	instruction += `FORMAT:\n`;
	instruction += `\`\`\`json\n`;
	instruction += `{\n`;
	instruction += `  "relationships": [\n`;
	instruction += `    {\n`;
	instruction += `      "character1": "CharacterName",\n`;
	instruction += `      "character2": "OtherCharacterName",\n`;
	instruction += `      "status": "Status",\n`;
	instruction += `      "feelsTowards": "How character1 feels about character2 (keyword or very short sentence)",\n`;
	instruction += `      "wantsFrom": "What character1 wants from character2 (keyword or very short sentence)",\n`;
	instruction += `      "secretsFrom": "Secrets character1 keeps from character2 (keyword or very short sentence)",\n`;
	instruction += `      "feelsTowards2": "How character2 feels about character1 (keyword or very short sentence)",\n`;
	instruction += `      "wantsFrom2": "What character2 wants from character1 (keyword or very short sentence)",\n`;
	instruction += `      "secretsFrom2": "Secrets character2 keeps from character1 (keyword or very short sentence)"\n`;
	instruction += `    }\n`;
	instruction += `  ]\n`;
	instruction += `}\n`;
	instruction += `\`\`\`\n\n`;

	instruction += `RULES:\n`;
	instruction += `- Status must be one of: ${statusList}\n`;
	instruction += `- Include ALL known character pairs that have interacted or have a defined relationship\n`;
	instruction += `- If a character is not in the scene and/or not relevant, do NOT include or update their relationships\n`;
	instruction += `- "feelsTowards" is from character1's perspective toward character2\n`;
	instruction += `- "wantsFrom" is what character1 desires from character2\n`;
	instruction += `- "secretsFrom" are secrets character1 keeps from character2\n`;
	instruction += `- "feelsTowards2", "wantsFrom2", "secretsFrom2" are from character2's perspective toward character1\n`;
	instruction += `- Keep all fields concise (keywords or very short sentences)\n`;
	instruction += `- If a relationship hasn't changed, keep the existing data\n`;
	instruction += `- Do NOT wrap the JSON in code fences. Output the JSON object directly.\n`;

	return instruction;
}
