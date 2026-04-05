/**
 * Parser Module
 * Handles parsing of AI responses to extract tracker data
 * Supports both legacy text format and new v3 JSON format
 */

import { extensionSettings, FEATURE_FLAGS, addDebugLog } from '../../core/state.js';
import { saveSettings } from '../../core/persistence.js';
import { repairJSON } from '../../utils/jsonRepair.js';

/**
 * Extracts the base name (before parentheses) and converts to snake_case for use as JSON key.
 * Example: "Conditions (up to 5 traits)" -> "conditions"
 * @param {string} name - Field name, possibly with parenthetical description
 * @returns {string} snake_case key from the base name only
 */
function toFieldKey(name) {
    const baseName = name.replace(/\s*\(.*\)\s*$/, '').trim();
    return baseName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

/**
 * Helper to separate emoji from text in a string
 * Handles cases where there's no comma or space after emoji
 * @param {string} str - String potentially containing emoji followed by text
 * @returns {{emoji: string, text: string}} Separated emoji and text
 */
function separateEmojiFromText(str) {
    if (!str) return { emoji: '', text: '' };

    str = str.trim();

    // Regex to match emoji at the start (handles most emoji including compound ones)
    // This matches emoji sequences including skin tones, gender modifiers, etc.
    const emojiRegex = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F910}-\u{1F96B}\u{1F980}-\u{1F9E0}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]+/u;
    const emojiMatch = str.match(emojiRegex);

    if (emojiMatch) {
        const emoji = emojiMatch[0];
        let text = str.substring(emoji.length).trim();

        // Remove leading comma or space if present
        text = text.replace(/^[,\s]+/, '');

        return { emoji, text };
    }

    // No emoji found - check if there's a comma separator anyway
    const commaParts = str.split(',');
    if (commaParts.length >= 2) {
        return {
            emoji: commaParts[0].trim(),
            text: commaParts.slice(1).join(',').trim()
        };
    }

    // No clear separation - return original as text
    return { emoji: '', text: str };
}

/**
 * Helper to strip enclosing brackets from text and remove placeholder brackets
 * Removes [], {}, and () from the entire text if it's wrapped, plus removes
 * placeholder content like [Location], [Mood Emoji], etc.
 * @param {string} text - Text that may contain brackets
 * @returns {string} Text with brackets and placeholders removed
 */
function stripBrackets(text) {
    if (!text) return text;

    // Remove leading and trailing whitespace first
    text = text.trim();

    // Check if the entire text is wrapped in brackets and remove them
    // This handles cases where models wrap entire sections in brackets
    while (
        (text.startsWith('[') && text.endsWith(']')) ||
        (text.startsWith('{') && text.endsWith('}')) ||
        (text.startsWith('(') && text.endsWith(')'))
    ) {
        text = text.substring(1, text.length - 1).trim();
    }

    // Remove placeholder text patterns like [Location], [Mood Emoji], [Name], etc.
    // Pattern matches: [anything with letters/spaces inside]
    // This preserves actual content while removing template placeholders
    const placeholderPattern = /\[([A-Za-z\s\/]+)\]/g;

    // Check if a bracketed text looks like a placeholder vs real content
    const isPlaceholder = (match, content) => {
        // Common placeholder words to detect
        const placeholderKeywords = [
            'location', 'mood', 'emoji', 'name', 'description', 'placeholder',
            'time', 'date', 'weather', 'temperature', 'action', 'appearance',
            'skill', 'quest', 'item', 'character', 'field', 'value', 'details',
            'relationship', 'thoughts', 'stat', 'status', 'lover', 'friend',
            'enemy', 'neutral', 'weekday', 'month', 'year', 'forecast'
        ];

        const lowerContent = content.toLowerCase().trim();

        // If it contains common placeholder keywords, it's likely a placeholder
        if (placeholderKeywords.some(keyword => lowerContent.includes(keyword))) {
            return true;
        }

        // If it's a short generic phrase (1-3 words) with only letters/spaces, might be placeholder
        const wordCount = content.trim().split(/\s+/).length;
        if (wordCount <= 3 && /^[A-Za-z\s\/]+$/.test(content)) {
            return true;
        }

        return false;
    };

    // Replace placeholders with empty string, keep real content
    text = text.replace(placeholderPattern, (match, content) => {
        if (isPlaceholder(match, content)) {
            return ''; // Remove placeholder
        }
        return match; // Keep real bracketed content
    });

    // Clean up any resulting empty labels (e.g., "Status: " with nothing after)
    text = text.replace(/^([A-Za-z\s]+):\s*$/gm, ''); // Remove lines that are just "Label: " with nothing
    text = text.replace(/^([A-Za-z\s]+):\s*,/gm, '$1:'); // Fix "Label: ," patterns
    text = text.replace(/:\s*\|/g, ':'); // Fix ": |" patterns
    text = text.replace(/\|\s*\|/g, '|'); // Fix "| |" patterns (double pipes from removed content)
    text = text.replace(/\|\s*$/gm, ''); // Remove trailing pipes at end of lines

    // Clean up multiple spaces and empty lines
    text = text.replace(/\s{2,}/g, ' '); // Multiple spaces to single space
    text = text.replace(/^\s*\n/gm, ''); // Remove empty lines

    return text.trim();
}

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
    debugLog('[RPG Parser] ==================== PARSING AI RESPONSE ====================');
    debugLog('[RPG Parser] Response Raw:', response);

    // Clean response and find first JSON object
    let cleanedResponse = response.content.replace(/FORMAT:\s*/gi, '');
    const startIdx = cleanedResponse.indexOf('{');
    
    if (startIdx === -1) {
        console.warn('[RPG Parser] No JSON structure found in response');
        return { userStats: null, infoBox: null, characterThoughts: null };
    }

    // Match braces to extract complete JSON object
    let depth = 1, i = startIdx + 1;
    let inString = false, escapeNext = false;

    while (i < cleanedResponse.length && depth > 0) {
        const char = cleanedResponse[i];
        if (escapeNext) {
            escapeNext = false;
        } else if (char === '\\') {
            escapeNext = true;
        } else if (char === '"') {
            inString = !inString;
        } else if (!inString) {
            if (char === '{') depth++;
            else if (char === '}') depth--;
        }
        i++;
    }

    // Parse and validate the JSON object
    const parsed = repairJSON(cleanedResponse.substring(startIdx, i).trim());
    if (parsed && (parsed.userStats || parsed.infoBox || parsed.characters)) {
        debugLog('[RPG Parser] Returning unified JSON parse results');
        return {
            userStats: parsed.userStats ? JSON.stringify(parsed.userStats) : null,
            infoBox: parsed.infoBox ? JSON.stringify(parsed.infoBox) : null,
            characterThoughts: parsed.characters ? JSON.stringify(parsed.characters) : null
        };
    }

    console.warn('[RPG Parser] No valid JSON structure found in response');
    return { userStats: null, infoBox: null, characterThoughts: null };
} // End parseResponse

/**
 * Parses user stats from the text and updates the extensionSettings.
 * Extracts percentages, mood, conditions, and inventory from the stats text.
 *
 * @param {string} statsText - The raw stats text from AI response
 */
export function parseUserStats(statsText) {
    debugLog('[RPG Parser] ==================== PARSING USER STATS ====================');
    debugLog('[RPG Parser] Stats text length:', statsText.length + ' chars');
    debugLog('[RPG Parser] Stats text preview:', statsText.substring(0, 200));

    try {
        // Check if this is v3 JSON format - try to parse it first
        let statsData = null;
        statsData = repairJSON(statsText);
        if (statsData) {
            debugLog('[RPG Parser] ✓ Parsed as v3 JSON format');

            // Extract stats from v3 JSON structure
            if (statsData.stats && Array.isArray(statsData.stats)) {
                // console.log('[RPG Parser] ✓ Extracting stats array, count:', statsData.stats.length);
                statsData.stats.forEach(stat => {
                    if (stat.id && typeof stat.value !== 'undefined') {
                        extensionSettings.userStats[stat.id] = stat.value;
                        // console.log(`[RPG Parser] ✓ Set ${stat.id} = ${stat.value}`);
                    }
                });
            }

            // Extract status
            if (statsData.status) {
                // console.log('[RPG Parser] ✓ Extracting status:', statsData.status);
                if (statsData.status.mood) {
                    extensionSettings.userStats.mood = statsData.status.mood;
                    // console.log('[RPG Parser] ✓ Set mood =', statsData.status.mood);
                }
                // Extract all custom status fields
                const trackerConfig = extensionSettings.trackerConfig;
                const customFields = trackerConfig?.userStats?.statusSection?.customFields || [];
                for (const fieldName of customFields) {
                    const fieldKey = toFieldKey(fieldName);
                    // Try the base key first (e.g., "conditions"), then fall back to full lowercase name
                    const value = statsData.status[fieldKey] || statsData.status[fieldName.toLowerCase()];
                    if (value) {
                        extensionSettings.userStats[fieldKey] = value;
                        // console.log(`[RPG Parser] ✓ Set ${fieldKey} =`, value);
                    }
                }
            }

            // Extract inventory (keep as arrays)
            if (statsData.inventory) {
                const inv = statsData.inventory;

                // Helper to convert items to array format
                const convertItems = (items) => {
                    if (!items || !Array.isArray(items)) return [];
                    return items.map(item => {
                        if (typeof item === 'object') {
                            // Already in object format
                            return {
                                name: item.name || item.item || '',
                                quantity: item.quantity || 1
                            };
                        } else if (typeof item === 'string') {
                            // String format - parse quantity if present
                            const qtyMatch = item.match(/^(\d+)x\s+(.+)$/);
                            if (qtyMatch) {
                                return { name: qtyMatch[2].trim(), quantity: parseInt(qtyMatch[1]) };
                            }
                            return { name: item.trim(), quantity: 1 };
                        }
                        return { name: String(item), quantity: 1 };
                    }).filter(item => item.name);
                };

                // Convert stored object {location: [items]} to keep arrays
                const convertStoredInventory = (stored) => {
                    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
                    const result = {};
                    for (const [location, items] of Object.entries(stored)) {
                        if (Array.isArray(items)) {
                            result[location] = convertItems(items);
                        } else if (typeof items === 'string') {
                            // Convert string to array
                            const itemsArray = items.split(',').map(s => s.trim()).filter(s => s);
                            result[location] = itemsArray.map(item => ({ name: item, quantity: 1 }));
                        } else {
                            result[location] = [];
                        }
                    }
                    return result;
                };

                extensionSettings.userStats.inventory = {
                    onPerson: convertItems(inv.onPerson),
                    clothing: convertItems(inv.clothing),
                    stored: convertStoredInventory(inv.stored),
                    assets: convertItems(inv.assets)
                };
                // console.log('[RPG Parser] ✓ Inventory kept as arrays:', extensionSettings.userStats.inventory);
            }

            // Extract quests (convert v3 object format to v2 string format)
            if (statsData.quests) {
                // Convert quest objects to strings
                const convertQuest = (quest) => {
                    if (!quest) return '';
                    if (typeof quest === 'string') return quest;
                    if (typeof quest === 'object') {
                        // Check for locked format: {value, locked}
                        // Recursively extract value if it's nested
                        let extracted = quest;
                        while (typeof extracted === 'object' && extracted.value !== undefined) {
                            extracted = extracted.value;
                        }
                        if (typeof extracted === 'string') return extracted;
                        // v3 format: {title, description, status}
                        return quest.title || quest.description || JSON.stringify(quest);
                    }
                    return String(quest);
                };

                extensionSettings.quests = {
                    main: convertQuest(statsData.quests.main),
                    optional: Array.isArray(statsData.quests.optional)
                        ? statsData.quests.optional.map(convertQuest)
                        : []
                };
                // console.log('[RPG Parser] ✓ Converted v3 quests:', extensionSettings.quests);
            }

            // Extract skills if present (store as object, not JSON string)
            if (statsData.skills && Array.isArray(statsData.skills)) {
                extensionSettings.userStats.skills = statsData.skills;
                // console.log('[RPG Parser] ✓ Set skills:', extensionSettings.userStats.skills);
            }

            debugLog('[RPG Parser] ✓ Successfully extracted v3 JSON data');
            saveSettings();
            return; // Done processing v3 format
        }
    } catch (error) {
        console.error('[RPG Companion] Error parsing user stats:', error);
        console.error('[RPG Companion] Stack trace:', error.stack);
        debugLog('[RPG Parser] ERROR:', error.message);
        debugLog('[RPG Parser] Stack:', error.stack);
    }
}

/**
 * Helper: Extract code blocks from text
 * @param {string} text - Text containing markdown code blocks
 * @returns {Array<string>} Array of code block contents
 */
export function extractCodeBlocks(text) {
    const codeBlockRegex = /```([^`]+)```/g;
    const matches = [...text.matchAll(codeBlockRegex)];
    return matches.map(match => match[1].trim());
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
    return content.match(/Present Characters\s*\n\s*---/i) !== null || content.includes(" | ");
}
