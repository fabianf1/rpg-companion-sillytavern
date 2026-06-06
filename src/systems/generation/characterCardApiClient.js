/**
 * Character Card API Client Module
 * Handles dedicated API calls for character card generation/updates.
 * Follows the same pattern as relationshipApiClient.js.
 */

import { getContext } from "../../../../../../extensions.js";
import { saveChatData } from "../../core/persistence.js";
import { extensionSettings } from "../../core/state.js";
import { log, error as logError } from "../../utils/logger.js";
import { getCurrentProfile } from "./apiClient.js";
import {
    getCharacterCardLorebookForChat,
    incrementCharacterCardCounter as incrementCounterInMetadata,
    resetCharacterCardCounter as resetCounterInMetadata,
    saveCharacterCard,
} from "./characterCardLorebookManager.js";
import { generateCharacterCardPrompt } from "./characterCardPromptBuilder.js";

/**
 * Updates character cards using a dedicated API call.
 * Generates cards for new characters and updates existing ones.
 *
 * @param {Object} [targetMessage] - Pre-captured assistant message (unused for cards, kept for API consistency)
 * @param {number} [targetSwipeId] - Pre-captured swipe ID (unused for cards)
 * @param {AbortSignal} [signal] - AbortSignal from a shared AbortController for cancellation
 * @returns {Promise<boolean>} True if cards were successfully generated and saved
 */
export async function updateCharacterCards(
    targetMessage = null,
    targetSwipeId = null,
    signal = null,
) {
    log("[RPG Companion] Starting character card update...");

    if (!extensionSettings.enabled) {
        log("[RPG Companion] Module is disabled, skipping character card update.");
        return false;
    }

    if (!extensionSettings.showCharacterCards) {
        log(
            "[RPG Companion] showCharacterCards setting is false, skipping character card update.",
        );
        return false;
    }


    const lorebookName = getCharacterCardLorebookForChat();
    if (!lorebookName) {
        log(
            "[RPG Companion] No lorebook available for character cards. Please configure a lorebook in settings or select one per card.",
        );
        return false;
    }

    try {
        const prompt = await generateCharacterCardPrompt();
        console.log("[RPG Companion] Generated character card prompt:", prompt);
        const profile = getCurrentProfile();

        if (!profile) {
            logError(
                "[RPG Companion] No connection profile available for character card update",
            );
            return false;
        }

        const response =
            await getContext().ConnectionManagerRequestService.sendRequest(
                profile,
                prompt,
                0,
                { signal },
            );

        log("[RPG Companion] Received character card response:", response);

        if (response) {
            const parsedData = parseCharacterCardResponse(response);
            console.log("[RPG Companion] Parsed character card data:", parsedData);

            if (
                parsedData?.characterCards &&
                Array.isArray(parsedData.characterCards)
            ) {
                // Get enabled field IDs for filtering
                const config = extensionSettings.trackerConfig?.characterCards || {};
                const enabledFieldIds = new Set(
                    (config.fields || []).filter((f) => f.enabled).map((f) => f.id),
                );
                // Always keep triggerKeywords (handled separately)
                enabledFieldIds.add("triggerKeywords");

                // Save each card to the lorebook
                let savedCount = 0;
                for (const card of parsedData.characterCards) {
                    if (!card.name) continue;

                    // Filter card data to only include enabled fields
                    const { name: _name, triggerKeywords, ...rawCardData } = card;
                    const filteredCardData = {};
                    for (const [key, value] of Object.entries(rawCardData)) {
                        if (
                            enabledFieldIds.has(key) &&
                            value !== undefined &&
                            value !== null
                        ) {
                            filteredCardData[key] = value;
                        }
                    }

                    // Extract trigger keywords from the card data
                    const triggers = buildTriggerKeywords(card);

                    const success = await saveCharacterCard(
                        card.name,
                        filteredCardData,
                        triggers,
                        lorebookName,
                    );
                    if (success) savedCount++;
                }

                log(
                    `[RPG Companion] Saved ${savedCount}/${parsedData.characterCards.length} character cards to lorebook.`,
                );

                // Save chat data to persist the message counter
                saveChatData();

                return savedCount > 0;
            }
        }

        return false;
    } catch (error) {
        if (error.name === "AbortError") {
            log(
                "[RPG Companion] Character card update aborted by user or message deletion",
            );
            return false;
        }
        logError("[RPG Companion] Error updating character cards:", error);
        return false;
    }
}

/**
 * Parses the AI response to extract character card data.
 * Handles both raw JSON and code-fenced JSON.
 *
 * @param {Object} response - The raw AI response object
 * @returns {Object|null} Parsed data with characterCards array, or null
 */
function parseCharacterCardResponse(response) {
    if (!response?.content) return null;

    const content = response.content;

    try {
        // Try direct JSON parse first
        const trimmed = content.trim();
        if (trimmed.startsWith("{")) {
            return JSON.parse(trimmed);
        }

        // Try to extract JSON from code fences
        const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[1].trim());
        }

        // Try to find a JSON object anywhere in the response
        const objectMatch = trimmed.match(/\{[\s\S]*"characterCards"[\s\S]*\}/);
        if (objectMatch) {
            return JSON.parse(objectMatch[0]);
        }

        logError(
            "[RPG Companion] Could not parse character card response:",
            content.slice(0, 200),
        );
        return null;
    } catch (e) {
        logError(
            "[RPG Companion] Failed to parse character card JSON:",
            e,
            content.slice(0, 200),
        );
        return null;
    }
}

/**
 * Builds trigger keywords for a character card lorebook entry.
 * Uses the character name plus descriptive keywords from the card data.
 *
 * @param {Object} card - The character card data
 * @returns {string[]} Array of trigger keywords
 */
function buildTriggerKeywords(card) {
    // If AI provided explicit triggerKeywords, use those
    if (
        card.triggerKeywords &&
        Array.isArray(card.triggerKeywords) &&
        card.triggerKeywords.length > 0
    ) {
        // Ensure the character name is included
        const keywords = [...card.triggerKeywords];
        if (
            card.name &&
            !keywords.some((k) => k.toLowerCase() === card.name.toLowerCase())
        ) {
            keywords.unshift(card.name);
        }
        return [...new Set(keywords.filter(Boolean))];
    }

    // Fallback: build keywords from name and role
    const keywords = [card.name];

    // Add role/occupation as a trigger if available
    if (card.role && typeof card.role === "string") {
        const roleWords = card.role
            .split(/[,;]/)
            .map((w) => w.trim())
            .filter((w) => w.length > 2 && w.length < 30);
        keywords.push(...roleWords.slice(0, 3));
    }

    return [...new Set(keywords.filter(Boolean))];
}

/**
 * Increments the message counter and checks if an auto-update should trigger.
 * Called from onMessageReceived in sillytavern.js.
 *
 * @returns {boolean} True if the counter reached the threshold and an update should run
 */
export function incrementCharacterCardCounter() {
    if (!extensionSettings.showCharacterCards) return false;
    // Per-card lorebook selection means we don't strictly need a global lorebook
    // to count messages — the counter still works for auto-update triggers

    const interval = extensionSettings.trackerConfig?.characterCards?.updateInterval ?? 10;
    if (interval <= 0) return false; // Auto-update disabled

    const counter = incrementCounterInMetadata();

    log(`[RPG Companion] Character card message counter: ${counter}/${interval}`);

    if (counter >= interval) {
        resetCounterInMetadata();
        return true;
    }

    return false;
}

/**
 * Resets the character card message counter.
 * Called when a manual refresh is triggered.
 */
export function resetCharacterCardCounter() {
    resetCounterInMetadata();
}
