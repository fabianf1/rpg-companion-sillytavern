/**
 * Character Card Prompt Builder Module
 * Builds a focused prompt for generating/updating character card data.
 * Called when character cards need to be generated or refreshed.
 */

import { chat } from "../../../../../../../script.js";
import { getContext } from "../../../../../../extensions.js";
import { extensionSettings } from "../../core/state.js";
import { getAllCharacterCards } from "./characterCardLorebookManager.js";
import { getTrackerDataForContext } from "./trackerDataUtils.js";

/**
 * Gets the list of enabled fields for character cards.
 * @returns {Array<{id: string, name: string, description: string}>} Enabled fields
 */
function getEnabledFields() {
    const config = extensionSettings.characterCards || {};
    return (config.fields || []).filter((f) => f.enabled);
}

/**
 * Builds the character card update prompt for a dedicated API call.
 * Focused on generating/updating NPC profile cards.
 *
 * @returns {Array<{role: string, content: string}>} Array of message objects for API
 */
export async function generateCharacterCardPrompt() {
    const userName = getContext().name1;
    const depth =
        extensionSettings.relationUpdateDepth ?? extensionSettings.updateDepth ?? 4;
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
function buildCharacterCardSystemMessage(userName, _fields) {
    let msg = `You are an RPG Lore Keeper and Wiki Editor. Your objective is to extract and maintain stable, encyclopedic character profiles for NPCs based on the ongoing story.\n\n`;

    msg += `CORE PRINCIPLE: STABILITY\n`;
    msg += `- Character cards document WHO a character is, not WHAT they are currently doing.\n`;
    msg += `- Capture permanent or long-term traits: core personality, historical background, intrinsic physical traits, and foundational motivations.\n`;
    msg += `- Completely ignore episodic events, immediate story actions, passing moods, temporary equipment, or current locations.\n\n`;

    msg += `EXAMPLES OF BAD VS. GOOD EXTRACTS:\n`;
    msg += `[BAD - Episodic]: "Currently fighting goblins and feeling angry because John stole her sword."\n`;
    msg += `[GOOD - Stable]: "A hot-headed warrior who detests thievery and values martial prowess."\n\n`;

    msg += `[BAD - Fleeting State]: "Just confessed her love to the protagonist and is now blushing."\n`;
    msg += `[GOOD - Stable Trait]: "Harbors a deep-seated romantic affection for ${userName}."\n\n`;

    msg += `[BAD - Current Location]: "Hiding in the tavern basement."\n`;
    msg += `[GOOD - Background]: "A local resident of the village who frequents the tavern."\n\n`;

    msg += `If there is not enough evidence to confidently establish a permanent trait for a given field, output null. Do not guess based on a single line of dialogue.\n\n`;

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
    instruction += `Based on the context above, generate or update character cards for the NPCs.\n\n`;

    // Include character thoughts data for reference (ensures same characters are used)
    const characterThoughtsData = getTrackerDataForContext("characterThoughts");
    if (characterThoughtsData && Array.isArray(characterThoughtsData)) {
        instruction += `<character_tracker>\n`;
        for (const char of characterThoughtsData) {
            if (char.name && char.name !== userName) {
                instruction += `--- ${char.name} ---\n`;
                if (char.details && typeof char.details === "object") {
                    for (const [key, value] of Object.entries(char.details)) {
                        if (value !== null && value !== undefined) {
                            instruction += `${key}: ${value}\n`;
                        }
                    }
                }
                if (char.stats && Array.isArray(char.stats)) {
                    const statsStr = char.stats
                        .map((s) => `${s.name}: ${s.value}`)
                        .join(", ");
                    instruction += `Stats: ${statsStr}\n`;
                }
                if (char.thoughts) {
                    const thoughtsContent =
                        typeof char.thoughts === "object"
                            ? char.thoughts.content
                            : char.thoughts;
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
        .map((f) => `      "${f.id}": "stable value or null"`)
        .join(",\n");

    instruction += `RULES FOR UPDATING AND CREATING CARDS:\n`;
    instruction += `1. **High Bar for Changes**: For existing characters, do NOT update a field unless a permanent truth or major, unchangeable lore detail has been explicitly revealed.\n`;
    instruction += `2. **Absolute Continuity**: Preserve existing field values entirely unless the new dialogue directly overrides a fundamental trait (e.g., discovering their true age, lineage, or a permanent physical change like losing an eye).\n`;
    instruction += `3. **Ignore the Transient**: Do NOT alter cards to match fleeting emotional states, immediate plot destinations, or temporary equipment.\n`;
    instruction += `4. **Conciseness**: Each field must be a concise structural description (1-2 sentences max) or null if unknown.\n`;
    instruction += `5. **Scope**: Do NOT include the protagonist ("${userName}") as a character card.\n`;
    instruction += `6. **Efficiency**: Return ONLY the cards that need to be created or meaningfully updated. If no cards require stable updates, return an empty array: {"characterCards": []}\n\n`;

    instruction += `TRIGGER KEYWORDS:\n`;
    instruction += `- Include 2-4 keywords that will trigger this character's card in the lorebook.\n`;
    instruction += `- Use the character's name (first and last if available), nicknames, and 2-3 describing keywords.\n`;
    instruction += `- Describing keywords should be unique identifiers (e.g., "sorceress", "innkeeper", "blacksmith").\n`;
    instruction += `- Example: For "Elena Blackwood the Sorceress", use: ["Elena", "Blackwood", "Elena Blackwood", "sorceress"]\n\n`;

    instruction += `Provide ONLY the character cards in the exact JSON format below. Output the JSON object directly, NOT wrapped in code fences.\n\n`;

    instruction += `FORMAT:\n`;
    instruction += `{\n`;
    instruction += `  "characterCards": [\n`;
    instruction += `    {\n`;
    instruction += `      "name": "CharacterName",\n`;
    instruction += `      "triggerKeywords": ["keyword1", "keyword2"],\n`;
    instruction += `${fieldList}\n`;
    instruction += `    }\n`;
    instruction += `  ]\n`;
    instruction += `}\n`;

    return instruction;
}
