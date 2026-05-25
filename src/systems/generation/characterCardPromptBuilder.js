/**
 * Character Card Prompt Builder Module
 * Builds a focused prompt for generating/updating character card data.
 * Called when character cards need to be generated or refreshed.
 */

import { chat } from "../../../../../../../script.js";
import { getContext } from "../../../../../../extensions.js";
import { extensionSettings } from "../../core/state.js";
import { getTrackerDataForContext } from "./trackerDataUtils.js";
import { getAllCharacterCards } from "./characterCardLorebookManager.js";

/**
 * Gets the list of enabled fields for character cards.
 * Combines default fields and custom fields, filtering by enabled status.
 * @returns {Array<{id: string, name: string, description: string}>} Enabled fields
 */
// TODO: Fields are set per tracker config; DefaultFields should be set as standard then use the same structure; Only allow the LLm to return fields that are enab/ed wanted.
function getEnabledFields() {
    const config = extensionSettings.characterCards || {};
    const defaultFields = (config.fields || []).filter((f) => f.enabled);
    const customFields = (config.customFields || []).map((f) => ({
        id: f.id,
        name: f.name,
        description: f.description || f.name,
    }));
    return [...defaultFields, ...customFields];
}

/**
 * Builds the character card update prompt for a dedicated API call.
 * Focused on generating/updating NPC profile cards.
 *
 * @returns {Array<{role: string, content: string}>} Array of message objects for API
 */
export async function generateCharacterCardPrompt() {
    const userName = getContext().name1;
    const depth = extensionSettings.relationUpdateDepth ?? extensionSettings.updateDepth ?? 4;
    const fields = getEnabledFields();

    const messages = [];

    // System message
    const systemMessage = buildCharacterCardSystemMessage(userName, fields);
    messages.push({ role: "system", content: systemMessage });

    // Chat history for context
    const recentMessages = chat.slice(-depth);
    for (const message of recentMessages) {
        messages.push({
            role: message.is_user ? "user" : "assistant",
            content: message.mes,
        });
    }

    // Instruction message
    const instructionMessage = await buildCharacterCardInstructionMessage(
        userName,
        fields,
    );
    messages.push({ role: "user", content: instructionMessage });

    return messages;
}

/**
 * Builds the system message for character card generation.
 * @param {string} userName - The user's character name
 * @param {Array} fields - Enabled fields for cards
 * @returns {string} The system message
 */
function buildCharacterCardSystemMessage(userName, fields) {
    let msg = `You are an RPG Companion module that maintains character profile cards for NPCs in the story. Your task is to generate or update character cards based on the conversation.\n\n`;

    msg += `CRITICAL GUIDELINES:\n`;
    msg += `- Character cards capture ENDURING traits — things that don't change frequently (appearance, personality, background)\n`;
    msg += `- Do NOT include scene-specific or temporary states (current mood, current location, current activity)\n`;
    msg += `- Focus on stable, defining characteristics of each character\n`;
    msg += `- If a character hasn't been mentioned enough to fill a field, use null — do not fabricate\n`;
    msg += `- Only include characters that have appeared or been meaningfully discussed in the conversation\n\n`;

    msg += `Here is the description of the protagonist for reference:\n`;
    msg += `<protagonist name="${userName}">\n{{persona}}\n</protagonist>\n\n`;

    msg += `Here are the last few messages in the conversation history:\n<history>`;

    return msg;
}

/**
 * Builds the instruction message for character card generation.
 * @param {string} userName - The user's character name
 * @param {Array} fields - Enabled fields for cards
 * @returns {Promise<string>} The instruction message
 */
async function buildCharacterCardInstructionMessage(userName, fields) {
    let instruction = `</history>\n\n`;
    instruction += `Generate or update character cards for NPCs based on the conversation above.\n\n`;

    // Include character thoughts data for reference (ensures same characters are used)
    const characterThoughtsData = getTrackerDataForContext("characterThoughts");
    if (characterThoughtsData && Array.isArray(characterThoughtsData)) {
        instruction += `<character_tracker>\n`;
        for (const char of characterThoughtsData) {
            if (char.name && char.name !== userName) {
                instruction += `--- ${char.name} ---\n`;
                // // Include name
                // if (char.name) {
                //     instruction += `Name: ${char.name}\n`;
                // }
                // // Include emoji if present
                // if (char.emoji) {
                //     instruction += `Emoji: ${char.emoji}\n`;
                // }
                // Include all details fields
                if (char.details && typeof char.details === "object") {
                    for (const [key, value] of Object.entries(char.details)) {
                        if (value !== null && value !== undefined) {
                            instruction += `${key}: ${value}\n`;
                        }
                    }
                }
                // Include stats if present
                if (char.stats && Array.isArray(char.stats)) {
                    const statsStr = char.stats.map(s => `${s.name}: ${s.value}`).join(", ");
                    instruction += `Stats: ${statsStr}\n`;
                }
                // Include thoughts if present
                if (char.thoughts) {
                    const thoughtsContent = typeof char.thoughts === "object" ? char.thoughts.content : char.thoughts;
                    if (thoughtsContent) {
                        instruction += `Thoughts: ${thoughtsContent}\n`;
                    }
                }
                instruction += `\n`;
            }
        }
        instruction += `</character_tracker>\n\n`;
    }

    // Include existing cards as context
    const existingCards = await getAllCharacterCards();
    if (existingCards.length > 0) {
        instruction += `<existing_character_cards>\n`;
        for (const card of existingCards) {
            instruction += `--- ${card.characterName} ---\n`;
            instruction += JSON.stringify(card.cardData, null, 2);
            if (card.triggerKeywords && card.triggerKeywords.length > 0) {
                instruction += `\nTrigger Keywords: ${card.triggerKeywords.join(", ")}\n`;
            }
            instruction += `\n`;
        }
        instruction += `</existing_character_cards>\n\n`;
    } else {
        instruction += `No existing character cards yet.\n\n`;
    }

    // Build the field list for the format
    const fieldList = fields
        .map((f) => `    "${f.id}": "value or null"`)
        .join(",\n");

    instruction += `Provide ONLY the character cards in the exact JSON format below. Do NOT include any other text, commentary, or roleplay response.\n\n`;

    instruction += `FORMAT:\n`;
    instruction += `{\n`;
    instruction += `  "characterCards": [\n`;
    instruction += `    {\n`;
    instruction += `      "name": "CharacterName",\n`;
    instruction += `      "triggerKeywords": ["keyword1", "keyword2"],\n`;
    instruction += fieldList + `\n`;
    instruction += `    }\n`;
    instruction += `  ]\n`;
    instruction += `}\n\n`;

    instruction += `TRIGGER KEYWORDS:\n`;
    instruction += `- Include 2-4 keywords that will trigger this character's card in the lorebook\n`;
    instruction += `- Use the character's name (first and last if available), nicknames, and 2-3 describing keywords\n`;
    instruction += `- Describing keywords should be unique identifiers (e.g., "sorceress", "innkeeper", "blacksmith")\n`;
    instruction += `- Example: For "Elena Blackwood the Sorceress", use: ["Elena", "Blackwood", "Elena Blackwood", "sorceress"]\n\n`;

    instruction += `RULES:\n`;
    instruction += `- "name" must match the character's name as used in the conversation\n`;
    instruction += `- "triggerKeywords" should help identify the character in future mentions\n`;
    instruction += `- Each field should be a concise description (1-3 sentences) or null if unknown\n`;
    instruction += `- For existing characters, only update fields if new information has been revealed\n`;
    instruction += `- Preserve existing field values unless the conversation clearly contradicts them\n`;
    instruction += `- Do NOT include the protagonist ("${userName}") as a character card\n`;
    instruction += `- You may return ONLY the cards that need to be created or updated — you do NOT need to include unchanged cards\n`;
    instruction += `- If no cards need updating, return an empty array: {"characterCards": []}\n`;
    instruction += `- Output the JSON object directly, NOT wrapped in code fences\n`;

    return instruction;
}
