/**
 * Character Card Lorebook Manager Module
 * Handles CRUD operations for character card entries in lorebooks.
 * Wraps the SillyTavern lorebook API (applyLBChanges) with character-card-specific logic.
 *
 * Entry format:
 *   comment: "[CharCard] CharacterName"  — prefixed for easy filtering
 *   key: [characterName, ...keywords]    — triggers for when to display
 *   content: JSON string of card fields  — the actual card data
 */

import { extensionSettings } from "../../core/state.js";
import { getContext } from "../../../../../../extensions.js";
import { log, error as logError } from "../../utils/logger.js";
import { chat_metadata, saveChatDebounced } from "../../../../../../../script.js";

/** Prefix used in lorebook entry comments to identify character card entries */
export const CHARCARD_ENTRY_PREFIX = "[CharCard]";

/** Simple in-memory cache for lorebook data (30s TTL) */
const _wiCache = {};
const _wiPromises = {};

/**
 * Gets the configured lorebook name for character cards.
 * Falls back to empty string (default world info) if not set.
 * @returns {string} The lorebook name to use
 */
export function getCharacterCardLorebookName() {
    return extensionSettings.characterCards?.lorebookName || "";
}

/**
 * Gets the character-specific lorebook name for the current character.
 * @returns {string|null} The character lorebook name, or null if none
 */
export function getCharacterLorebookName() {
    const ctx = getContext();
    const charId = ctx.characterId;
    const character = ctx.characters?.[charId];
    if (!character) return null;

    const baseWorldName = character.data?.extensions?.world || character.world;
    if (baseWorldName && typeof baseWorldName === "string") return baseWorldName;

    // Access ST_WorldInfo if available
    const ST_WorldInfo = window.ST_WorldInfo;
    let fileName = character.avatar;
    // Try to get the proper filename via ST_Utils if available
    if (window.ST_Utils && typeof window.ST_Utils.getCharaFilename === "function") {
        try {
            fileName = window.ST_Utils.getCharaFilename(charId);
        } catch {
            // Fall back to avatar
        }
    }
    const charLoreList = ST_WorldInfo?.world_info?.charLore || window.world_info?.charLore;
    if (fileName && Array.isArray(charLoreList)) {
        const extraCharLore = charLoreList.find((e) => e.name === fileName);
        if (extraCharLore?.extraBooks?.[0]) return extraCharLore.extraBooks[0];
    }

    return null;
}

/**
 * Gets the chat-specific lorebook name for the current chat.
 * @returns {string|null} The chat lorebook name, or null if none
 */
export function getChatLorebookName() {
    const ctx = getContext();
    // Access ST_WorldInfo if available
    const ST_WorldInfo = window.ST_WorldInfo;
    const wiKey = ST_WorldInfo?.METADATA_KEY || window.WI_METADATA_KEY || "world_info";
    const chatWorldName = ctx.chatMetadata?.[wiKey];
    if (chatWorldName && typeof chatWorldName === "string") return chatWorldName;

    const personaWorldName = ctx.powerUserSettings?.persona_description_lorebook;
    if (personaWorldName && typeof personaWorldName === "string") return personaWorldName;

    return null;
}

const CHARACTER_CARD_LOREBOOK_METADATA_KEY = "rpg_companion_character_card_lorebook";

function getChatMetadataRoot() {
    if (!chat_metadata || typeof chat_metadata !== "object") return null;
    return chat_metadata;
}

function getChatMetadataId() {
    const ctx = getContext();
    const firstMessage = ctx.chat?.[0];
    if (!firstMessage || typeof firstMessage !== "object") return "default";
    return String(firstMessage.id ?? firstMessage.messageId ?? firstMessage.uid ?? "default");
}

/**
 * Gets the saved lorebook name for character cards from chat metadata.
 * This is a per-chat setting (one lorebook for all character cards in the chat).
 * @returns {string} The saved lorebook name, or empty string if none (None selected)
 */
export function getCharacterCardLorebookForChat() {
    const root = getChatMetadataRoot();
    if (!root) return "";
    const chatKey = getChatMetadataId();
    return root[CHARACTER_CARD_LOREBOOK_METADATA_KEY]?.[chatKey] || false;
}

/**
 * Saves the chosen lorebook for character cards in chat metadata.
 * This is a per-chat setting (one lorebook for all character cards in the chat).
 * @param {string} lorebookName - The lorebook name, or empty string for "None"
 */
export function setCharacterCardLorebookForChat(lorebookName) {
    const root = getChatMetadataRoot();
    if (!root) return;

    if (!root[CHARACTER_CARD_LOREBOOK_METADATA_KEY]) {
        root[CHARACTER_CARD_LOREBOOK_METADATA_KEY] = {};
    }

    const chatKey = getChatMetadataId();

    if (!lorebookName) {
        // Setting to "None" - remove the key
        delete root[CHARACTER_CARD_LOREBOOK_METADATA_KEY][chatKey];
        if (Object.keys(root[CHARACTER_CARD_LOREBOOK_METADATA_KEY]).length === 0) {
            delete root[CHARACTER_CARD_LOREBOOK_METADATA_KEY];
        }
    } else {
        root[CHARACTER_CARD_LOREBOOK_METADATA_KEY][chatKey] = lorebookName;
    }

    saveChatDebounced();
}

const CHARACTER_CARD_COUNTER_METADATA_KEY = "rpg_companion_character_card_counter";

/**
 * Gets the message counter for character cards from chat metadata.
 * This is a per-chat counter for auto-update triggers.
 * @returns {number} The current counter value, or 0 if not set
 */
export function getCharacterCardCounter() {
    const root = getChatMetadataRoot();
    if (!root) return 0;
    const chatKey = getChatMetadataId();
    return root[CHARACTER_CARD_COUNTER_METADATA_KEY]?.[chatKey] || 0;
}

/**
 * Sets the message counter for character cards in chat metadata.
 * This is a per-chat counter for auto-update triggers.
 * @param {number} counter - The counter value to set
 */
export function setCharacterCardCounter(counter) {
    const root = getChatMetadataRoot();
    if (!root) return;

    if (!root[CHARACTER_CARD_COUNTER_METADATA_KEY]) {
        root[CHARACTER_CARD_COUNTER_METADATA_KEY] = {};
    }

    const chatKey = getChatMetadataId();


    root[CHARACTER_CARD_COUNTER_METADATA_KEY][chatKey] = counter;

    saveChatDebounced();
}

/**
 * Increments the message counter for character cards in chat metadata.
 * @returns {number} The new counter value after incrementing
 */
export function incrementCharacterCardCounter() {
    const currentCounter = getCharacterCardCounter();
    const newCounter = currentCounter + 1;
    setCharacterCardCounter(newCounter);
    return newCounter;
}

/**
 * Resets the message counter for character cards in chat metadata.
 */
export function resetCharacterCardCounter() {
    setCharacterCardCounter(0);
}

/**
 * Gets all active lorebook names from SillyTavern.
 * Mirrors the logic from reference.js getActiveLorebookNames().
 * @returns {string[]} Array of active lorebook names
 */
export function getActiveLorebookNames() {
    const ctx = getContext();
    const names = new Set();

    // Access ST_WorldInfo if available (SillyTavern's WorldInfo module)
    const ST_WorldInfo = window.ST_WorldInfo;

    // 1. GLOBAL
    const globalBooks = ST_WorldInfo?.selected_world_info || window.selected_world_info || [];
    if (Array.isArray(globalBooks)) {
        globalBooks.forEach((n) => {
            if (n) names.add(n);
        });
    }

    // 2. CHARACTER
    const charId = ctx.characterId;
    const character = ctx.characters?.[charId];
    if (character) {
        const baseWorldName = character.data?.extensions?.world || character.world;
        if (baseWorldName && typeof baseWorldName === "string")
            names.add(baseWorldName);

        let fileName = character.avatar;
        // Try to get the proper filename via ST_Utils if available
        if (window.ST_Utils && typeof window.ST_Utils.getCharaFilename === "function") {
            try {
                fileName = window.ST_Utils.getCharaFilename(charId);
            } catch {
                // Fall back to avatar
            }
        }
        const charLoreList = ST_WorldInfo?.world_info?.charLore || window.world_info?.charLore;
        if (fileName && Array.isArray(charLoreList)) {
            const extraCharLore = charLoreList.find((e) => e.name === fileName);
            if (extraCharLore && Array.isArray(extraCharLore.extraBooks)) {
                extraCharLore.extraBooks.forEach((book) => {
                    if (book) names.add(book);
                });
            }
        }
    }

    // 3. CHAT
    const wiKey = ST_WorldInfo?.METADATA_KEY || window.WI_METADATA_KEY || "world_info";
    const chatWorldName = ctx.chatMetadata?.[wiKey];
    if (chatWorldName && typeof chatWorldName === "string")
        names.add(chatWorldName);

    // 4. PERSONA
    const personaWorldName = ctx.powerUserSettings?.persona_description_lorebook;
    if (personaWorldName && typeof personaWorldName === "string")
        names.add(personaWorldName);

    return [...names].filter(Boolean);
}

/**
 * Fetches a lorebook's data by name.
 * Uses getContext() and direct API calls, matching reference.js pattern.
 * @param {string} name - The lorebook name
 * @returns {Promise<Object|null>} The lorebook data object or null
 */
async function fetchWorldInfoBook(name) {
    if (_wiCache[name] && Date.now() - (_wiCache[name]._ts || 0) < 30000)
        return _wiCache[name];
    if (_wiPromises[name]) return _wiPromises[name];

    const ctx = getContext();

    _wiPromises[name] = (async () => {
        try {
            let data = null;
            if (typeof ctx.loadWorldInfo === "function") {
                data = await ctx.loadWorldInfo(name);
            } else {
                const res = await fetch("/api/worldinfo/get", {
                    method: "POST",
                    headers: {
                        ...ctx.getRequestHeaders(),
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ name }),
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                data = await res.json();
            }
            if (!data) return null;
            data._ts = Date.now();
            _wiCache[name] = data;
            return data;
        } catch (e) {
            logError(
                `[RPG Companion] WI load failed for "${name}":`,
                e,
            );
            return null;
        } finally {
            delete _wiPromises[name];
        }
    })();

    return _wiPromises[name];
}

/**
 * Saves a lorebook's data by name.
 * Uses getContext() and direct API calls, matching reference.js pattern.
 * @param {string} name - The lorebook name
 * @param {Object} data - The lorebook data object to save
 */
async function saveWorldInfoBook(name, data) {
    const ctx = getContext();
    const payload = { ...data };
    delete payload._ts;
    try {
        if (typeof ctx.saveWorldInfo === "function") {
            await ctx.saveWorldInfo(name, payload);
        } else {
            const res = await fetch("/api/worldinfo/edit", {
                method: "POST",
                headers: {
                    ...ctx.getRequestHeaders(),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ name, data: payload }),
            });
            if (!res.ok) {
                const errText = await res.text().catch(() => res.statusText);
                throw new Error(`HTTP ${res.status}: ${errText}`);
            }
        }
    } catch (e) {
        logError(
            `[RPG Companion] saveWorldInfoBook failed for "${name}":`,
            e,
        );
        throw e;
    }
    delete _wiCache[name];

    try {
        if (typeof ctx.reloadWorldInfoEditor === "function") {
            ctx.reloadWorldInfoEditor(name, true);
        }
    } catch {
        // Non-critical
    }
}

/**
 * Builds the entry comment/name for a character card.
 * Format: "[CharCard] CharacterName"
 * @param {string} characterName - The character's name
 * @returns {string} The formatted entry comment
 */
export function buildEntryComment(characterName) {
    return `${CHARCARD_ENTRY_PREFIX} ${characterName}`;
}

/**
 * Checks if a lorebook entry is a character card entry.
 * @param {Object} entry - A lorebook entry
 * @returns {boolean} True if the entry is a character card
 */
export function isCharacterCardEntry(entry) {
    return (entry.comment || "").startsWith(CHARCARD_ENTRY_PREFIX);
}

/**
 * Extracts the character name from a character card entry comment.
 * @param {string} comment - The entry comment
 * @returns {string} The character name (without prefix)
 */
export function extractCharacterName(comment) {
    if (!comment?.startsWith(CHARCARD_ENTRY_PREFIX)) return "";
    return comment.slice(CHARCARD_ENTRY_PREFIX.length).trim();
}

/**
 * Gets all character card entries from the configured lorebook.
 * @param {string} [lorebookName] - Optional lorebook name to search in (instead of global config)
 * @returns {Promise<Array<{entry: Object, characterName: string, bookName: string}>>}
 *   Array of objects with the entry, extracted character name, and book name
 */
export async function getAllCharacterCardEntries(lorebookName = "") {
    const bookName = lorebookName || getCharacterCardLorebookName();
    const booksToSearch = bookName ? [bookName] : getActiveLorebookNames();
    const results = [];

    for (const name of booksToSearch) {
        const data = await fetchWorldInfoBook(name);
        if (!data?.entries) continue;

        for (const entry of Object.values(data.entries)) {
            if (isCharacterCardEntry(entry)) {
                results.push({
                    entry,
                    characterName: extractCharacterName(entry.comment),
                    bookName: name,
                });
            }
        }
    }

    return results;
}

/**
 * Finds a specific character card entry by character name.
 * @param {string} characterName - The character name to search for
 * @param {string} [lorebookName] - Optional lorebook name to search in (instead of global config)
 * @returns {Promise<{entry: Object, bookName: string}|null>} The entry and book name, or null
 */
export async function findCharacterCardEntry(characterName, lorebookName = "") {
    const bookName = lorebookName || getCharacterCardLorebookName();
    const booksToSearch = bookName ? [bookName] : getActiveLorebookNames();
    const targetComment = buildEntryComment(characterName).toLowerCase();
    const targetName = characterName.toLowerCase();

    for (const name of booksToSearch) {
        const data = await fetchWorldInfoBook(name);
        if (!data?.entries) continue;

        for (const entry of Object.values(data.entries)) {
            const comment = (entry.comment || "").toLowerCase();
            if (comment === targetComment || comment === targetName) {
                return { entry, bookName: name };
            }
            // Fuzzy match: comment contains the name
            if (isCharacterCardEntry(entry) && comment.includes(targetName)) {
                return { entry, bookName: name };
            }
        }
    }

    return null;
}

/**
 * Parses the card data from a lorebook entry's content field.
 * @param {string} content - The JSON string from the entry content
 * @returns {Object|null} Parsed card data object, or null if invalid
 */
export function parseCardContent(content) {
    if (!content) return null;
    try {
        const trimmed = content.trim();
        // Try direct JSON parse
        if (trimmed.startsWith("{")) {
            return JSON.parse(trimmed);
        }
        // Try extracting from code fences
        const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[1].trim());
        }
        return null;
    } catch {
        logError("[RPG Companion] Failed to parse character card content:", content);
        return null;
    }
}

/**
 * Serializes card data to a JSON string for storage in a lorebook entry.
 * @param {Object} cardData - The card data object
 * @returns {string} JSON string representation
 */
export function serializeCardContent(cardData) {
    return JSON.stringify(cardData, null, 2);
}

/**
 * Saves a character card to a lorebook.
 * Creates a new entry if one doesn't exist, or updates the existing entry.
 *
 * @param {string} characterName - The character's name
 * @param {Object} cardData - The card data object (field values)
 * @param {string[]} [additionalTriggers=[]] - Additional trigger keywords
 * @param {string} [lorebookName] - Optional lorebook name override (per-card). Falls back to global setting.
 * @returns {Promise<boolean>} True if save was successful
 */
export async function saveCharacterCard(
    characterName,
    cardData,
    additionalTriggers = [],
    lorebookName = "",
) {
    const bookName = lorebookName || getCharacterCardLorebookName();
    if (!bookName) {
        logError(
            "[RPG Companion] No lorebook configured for character cards. Set one in Settings → Character Cards or select one per card.",
        );
        return false;
    }

    const data = await fetchWorldInfoBook(bookName);
    if (!data) {
        logError(
            `[RPG Companion] Lorebook "${bookName}" not found or not active.`,
        );
        return false;
    }

    const comment = buildEntryComment(characterName);
    const content = serializeCardContent(cardData);

    // Build trigger keys: character name + additional keywords
    const triggers = [characterName, ...additionalTriggers].filter(Boolean);

    // Check if entry already exists (search in the target lorebook)
    const existing = await findCharacterCardEntry(characterName, bookName);
    if (existing) {
        // Update existing entry
        existing.entry.content = content;
        existing.entry.key = triggers;
        existing.entry.comment = comment;
        log(
            `[RPG Companion] Updated character card for "${characterName}" in "${existing.bookName}"`,
        );
    } else {
        // Create new entry
        const uids = Object.keys(data.entries).map(Number);
        const newUid = uids.length ? Math.max(...uids) + 1 : 1;
        data.entries[newUid] = {
            uid: newUid,
            key: triggers,
            keysecondary: [],
            content,
            comment,
            disable: false,
            group: "",
            selective: false,
            constant: triggers.length === 0,
            position: 0,
            depth: 4,
            displayIndex: newUid,
            prevent_recursion: false,
            delayUntilRecursion: false,
            scan_depth: null,
            match_whole_words: null,
            use_group_scoring: false,
            case_sensitive: null,
            automation_id: "",
            role: null,
            vectorized: false,
            sticky: null,
            cooldown: null,
            delay: null,
        };
        log(
            `[RPG Companion] Created character card for "${characterName}" in "${bookName}"`,
        );
    }

    try {
        await saveWorldInfoBook(bookName, data);
        log(
            `[RPG Companion] Saved lorebook "${bookName}" with character card for "${characterName}"`,
        );
        return true;
    } catch (e) {
        logError(
            `[RPG Companion] Failed to save lorebook "${bookName}":`,
            e,
        );
        return false;
    }
}

/**
 * Deletes a character card entry from the lorebook.
 *
 * @param {string} characterName - The character's name
 * @returns {Promise<boolean>} True if deletion was successful
 */
export async function deleteCharacterCard(characterName) {
    const existing = await findCharacterCardEntry(characterName);
    if (!existing) {
        log(
            `[RPG Companion] No character card found for "${characterName}" to delete.`,
        );
        return false;
    }

    const bookName = existing.bookName;
    const data = await fetchWorldInfoBook(bookName);
    if (!data?.entries) return false;

    delete data.entries[existing.entry.uid];

    try {
        await saveWorldInfoBook(bookName, data);
        log(
            `[RPG Companion] Deleted character card for "${characterName}" from "${bookName}"`,
        );
        return true;
    } catch (e) {
        logError(
            `[RPG Companion] Failed to save lorebook after deleting card for "${characterName}":`,
            e,
        );
        return false;
    }
}

/**
 * Gets all character card data from the lorebook, parsed into objects.
 * @returns {Promise<Array<{characterName: string, cardData: Object, bookName: string}>>}
 */
export async function getAllCharacterCards() {
    const entries = await getAllCharacterCardEntries();
    return entries
        .map(({ entry, characterName, bookName }) => ({
            characterName,
            cardData: parseCardContent(entry.content),
            bookName,
            triggerKeywords: entry.key || [],
        }))
        .filter((card) => card.cardData !== null);
}

/**
 * Populates the lorebook dropdown in settings with available lorebooks.
 * @param {HTMLSelectElement} selectElement - The select element to populate
 */
export async function populateLorebookDropdown(selectElement) {
    if (!selectElement) return;

    const currentValue =
        extensionSettings.characterCards?.lorebookName || "";
    const activeNames = getActiveLorebookNames();

    selectElement.innerHTML = '<option value="">Default World Info</option>';
    for (const name of activeNames) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        selectElement.appendChild(option);
    }

    // Restore saved value
    if (currentValue && activeNames.includes(currentValue)) {
        selectElement.value = currentValue;
    } else if (currentValue && !activeNames.includes(currentValue)) {
        extensionSettings.characterCards.lorebookName = "";
        selectElement.value = "";
    }
}

/**
 * Gets structured lorebook options for a dropdown, categorized by type.
 * Returns options: None (default), Character lorebook, Chat lorebook, then other active lorebooks.
 * @returns {Array<{value: string, label: string, group: string}>} Dropdown options
 */
export function getLorebookOptionsForDropdown() {
    const options = [];
    const seen = new Set();

    // 1. None option (default)
    options.push({ value: "", label: "None", group: "default" });

    // 2. Character lorebook
    const charLorebook = getCharacterLorebookName();
    if (charLorebook) {
        options.push({
            value: charLorebook,
            label: `Character: ${charLorebook}`,
            group: "character",
        });
        seen.add(charLorebook.toLowerCase());
    }

    // 3. Chat lorebook
    const chatLorebook = getChatLorebookName();
    if (chatLorebook && !seen.has(chatLorebook.toLowerCase())) {
        options.push({
            value: chatLorebook,
            label: `Chat: ${chatLorebook}`,
            group: "chat",
        });
        seen.add(chatLorebook.toLowerCase());
    }

    // 4. All other active lorebooks (global, etc.)
    const activeNames = getActiveLorebookNames();
    for (const name of activeNames) {
        if (!seen.has(name.toLowerCase())) {
            options.push({
                value: name,
                label: name,
                group: "other",
            });
            seen.add(name.toLowerCase());
        }
    }

    return options;
}
