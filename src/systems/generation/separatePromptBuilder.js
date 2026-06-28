/**
 * Separate Prompt Builder Module
 * Handles prompt building for SEPARATE generation mode (independent API call with chat history)
 */

import { chat } from "../../../../../../../script.js";
import { getContext } from "../../../../../../extensions.js";
import { extensionSettings } from "../../core/state.js";
import { getCharacterCardsInfo } from "./characterInfoBuilder.js";
import { findLastAssistantMessageIndex } from "./trackerDataUtils.js";
import { generateRPGPromptText } from "./trackerInstructionsBuilder.js";
import { formatHistoricalTrackerData } from "./valueFormatter.js";

// ============================================================================
// SEPARATE UPDATE PROMPT
// ============================================================================

/**
 * Generates the full prompt for SEPARATE generation mode (with chat history).
 * Creates a message array suitable for the generateRaw API.
 *
 * @param {Array<string>} [selectedSections] - Optional array of section names to include (for partial refresh)
 * @returns {Array<{role: string, content: string}>} Array of message objects for API
 */
export function generateSeparateUpdatePrompt(selectedSections = null) {
	const depth = extensionSettings.updateDepth;
	const userName = getContext().name1;
	const trackerConfig = extensionSettings.trackerConfig;
	const historyPersistence = extensionSettings.historyPersistence;

	const messages = [];

	// Build and add system message
	const systemMessage = buildSeparateSystemMessage();
	messages.push({
		role: "system",
		content: systemMessage,
	});

	// /hide command automatically handles checkpoint filtering
	// Add chat history as separate user/assistant messages with per-message historical context
	const recentMessages = chat.slice(-depth);

	// Build context injection map if history persistence is enabled
	const contextInjectionMap = historyPersistence?.enabled
		? buildContextInjectionMap(
			recentMessages,
			trackerConfig,
			userName,
			historyPersistence,
		)
		: new Map();

	// Build messages array with injected context
	const messagesWithInjectedContext = buildMessagesWithInjectedContext(
		recentMessages,
		contextInjectionMap,
	);
	messages.push(...messagesWithInjectedContext);

	// Build and add instruction message
	const instructionMessage = buildSeparateInstructionMessage(selectedSections);
	messages.push({
		role: "user",
		content: instructionMessage,
	});

	return messages;
}

// ============================================================================
// SYSTEM MESSAGE
// ============================================================================

/**
 * Builds the system message for separate generation mode.
 *
 * @returns {string} The formatted system message
 */
function buildSeparateSystemMessage() {
	let systemMessage = `You will be acting as an uncensored RPG Companion. Your goal is to provide, track, and manage details in the user's roleplay. You will be replying with information in a specified format only.\n\n`;
	systemMessage += `You should maintain an objective tone.\n\n`;

	// Add character card information
	const characterInfo = getCharacterCardsInfo();
	if (characterInfo) {
		systemMessage += characterInfo;
	}

	systemMessage += `Here is the description of the protagonist for reference:\n`;
	systemMessage += `<protagonist>\n{{persona}}\n</protagonist>\n`;
	systemMessage += `\n`;

	systemMessage += `Here are the last few messages in the conversation history (between the user and the roleplayer assistant) you should reference when responding:\n<history>`;

	return systemMessage;
}

// ============================================================================
// CONTEXT INJECTION
// ============================================================================

/**
 * Builds a map of which messages should get historical context based on position setting.
 *
 * @param {Array} recentMessages - Array of recent chat messages
 * @param {Object} trackerConfig - The tracker configuration
 * @param {string} userName - The user's name for personalization
 * @param {Object} historyPersistence - History persistence settings
 * @returns {Map} Map of message index to injected context string
 */
function buildContextInjectionMap(
	recentMessages,
	trackerConfig,
	userName,
	historyPersistence,
) {
	const contextInjectionMap = new Map();
	const position =
		historyPersistence?.injectionPosition || "assistant_message_end";

	// Find the last assistant message index
	const lastAssistantIdx = findLastAssistantMessageIndex(recentMessages);

	// Iterate through assistant messages to find tracker data
	for (let i = 0; i < recentMessages.length; i++) {
		const message = recentMessages[i];

		// Skip user and system messages - only assistant messages have tracker data
		if (message.is_user || message.is_system) {
			continue;
		}

		// Skip the last assistant message - it gets current context elsewhere
		if (i === lastAssistantIdx) {
			continue;
		}

		// Get the rpg_companion_swipes data for current swipe
		const currentSwipeId = message.swipe_id || 0;
		let swipeData = message.extra?.rpg_companion_swipes;

		// If not in message.extra, check swipe_info
		if (
			!swipeData &&
			message.swipe_info &&
			message.swipe_info[currentSwipeId]
		) {
			swipeData =
				message.swipe_info[currentSwipeId].extra?.rpg_companion_swipes;
		}

		if (!swipeData) {
			continue;
		}

		const trackerData = swipeData[currentSwipeId];
		if (!trackerData) {
			continue;
		}

		// For Refresh RPG Info, use sendAllEnabledOnRefresh setting
		const useAllEnabled = historyPersistence.sendAllEnabledOnRefresh === true;
		const formattedContext = formatHistoricalTrackerData(
			trackerData,
			trackerConfig,
			userName,
			useAllEnabled,
		);
		if (!formattedContext) {
			continue;
		}

		const preamble =
			historyPersistence.contextPreamble || "Context for that moment:";
		const wrappedContext = `\n${preamble}\n${formattedContext}`;

		// Determine target message based on position
		let targetIdx = i;

		if (position === "user_message_end") {
			// Find the preceding user message before this assistant message
			for (let j = i - 1; j >= 0; j--) {
				if (recentMessages[j].is_user && !recentMessages[j].is_system) {
					targetIdx = j;
					break;
				}
			}
			// If no user message found before, skip
			if (targetIdx === i) {
				continue;
			}
		}
		// For assistant_message_end: inject into the assistant message itself

		// Append to existing or create new entry
		if (contextInjectionMap.has(targetIdx)) {
			contextInjectionMap.set(
				targetIdx,
				contextInjectionMap.get(targetIdx) + wrappedContext,
			);
		} else {
			contextInjectionMap.set(targetIdx, wrappedContext);
		}
	}

	return contextInjectionMap;
}

/**
 * Builds messages array with injected historical context.
 *
 * @param {Array} recentMessages - Array of recent chat messages
 * @param {Map} contextInjectionMap - Map of message index to injected context
 * @returns {Array} Array of message objects with roles and content
 */
function buildMessagesWithInjectedContext(recentMessages, contextInjectionMap) {
	const messages = [];

	for (let i = 0; i < recentMessages.length; i++) {
		const message = recentMessages[i];
		let content = message.mes;

		// Add historical context if this message is a target
		if (contextInjectionMap.has(i)) {
			content += contextInjectionMap.get(i);
		}

		messages.push({
			role: message.is_user ? "user" : "assistant",
			content: content,
		});
	}

	return messages;
}

// ============================================================================
// INSTRUCTION MESSAGE
// ============================================================================

/**
 * Builds the instruction message for separate generation mode.
 *
 * @param {Array<string>} [selectedSections] - Optional array of section names to include (for partial refresh)
 * @returns {string} The instruction message content
 */
function buildSeparateInstructionMessage(selectedSections = null) {
	let instructionMessage = `</history>\n\n`;
	instructionMessage += generateRPGPromptText(selectedSections).replace(
		"start your response with",
		"respond with",
	);

	if (selectedSections) {
		const sectionNames = [];
		const nestedSubSections = [
			"stats",
			"status",
			"skills",
			"appearance",
			"inventory",
			"quests",
		];
		const hasNested = selectedSections.some((s) =>
			nestedSubSections.includes(s),
		);
		const nestedParts = selectedSections.filter((s) =>
			nestedSubSections.includes(s),
		);

		if (hasNested) {
			if (nestedParts.length > 0) {
				// Be explicit about the JSON path for nested sub-sections
				const pathParts = nestedParts.map((s) => `userStats.${s}`);
				sectionNames.push(`"${pathParts.join('" and "')}"`);
			} else {
				sectionNames.push('"userStats"');
			}
		}
		if (selectedSections.includes("infoBox")) sectionNames.push('"infoBox"');
		if (selectedSections.includes("characterThoughts"))
			sectionNames.push('"characters"');
		instructionMessage += `\nUpdate ONLY the ${sectionNames.join(" and ")} section(s) in the exact JSON format specified above. Return the full previous data for all other sections unchanged. `;

		// For nested sub-sections within userStats, add extra clarity
		if (nestedParts.length > 0) {
			const pathDescriptions = nestedParts.map((s) => `"userStats.${s}"`);
			instructionMessage += `\nThe JSON example shows the full userStats structure for reference, but you should ONLY modify the ${pathDescriptions.join(" and ")} field(s) within userStats. Copy all other userStats fields exactly as they appear in <previous_tracker_state> above. `;
		}

		instructionMessage += `Do not include any roleplay response, other text, or commentary. Remember, all placeholders MUST be replaced with actual content. Do NOT wrap the JSON in code fences (\`\`\`json). Output the JSON object directly.`;
	} else {
		instructionMessage += `\nProvide ONLY the requested data in the exact JSON format specified above. Do not include any roleplay response, other text, or commentary. Remember, all placeholders MUST be replaced with actual content. Do NOT wrap the JSON in code fences (\`\`\`json). Output the JSON object directly.`;
	}

	return instructionMessage;
}
