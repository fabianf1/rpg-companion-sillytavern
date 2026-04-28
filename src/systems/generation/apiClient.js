/**
 * API Client Module
 * Handles API calls for RPG tracker generation
 */

import { chat, eventSource } from '../../../../../../../script.js';
import { executeSlashCommandsOnChatInput } from '../../../../../../../scripts/slash-commands.js';
import { getContext } from '../../../../../../extensions.js';

// Custom event name for when RPG Companion finishes updating tracker data
// Other extensions can listen for this event to know when RPG Companion is done
export const RPG_COMPANION_UPDATE_COMPLETE = 'rpg_companion_update_complete';
import {
    extensionSettings,
    isGenerating,
    setIsGenerating,
    setLastActionWasSwipe,
    setGenerationAbortController,
    $musicPlayerContainer
} from '../../core/state.js';
import { saveChatData } from '../../core/persistence.js';
import {
    generateSeparateUpdatePrompt,
} from './promptBuilder.js';
import { parseResponse } from './parser.js';
import { parseAndStoreSpotifyUrl } from '../features/musicPlayer.js';
import { renderUserStats } from '../rendering/userStats.js';
import { renderInfoBox } from '../rendering/infoBox.js';
import { removeLocks, restoreLockedContent } from './lockManager.js';
import {getTrackerDataForContext} from './promptBuilder.js';
import { renderThoughts } from '../rendering/thoughts.js';
import { renderInventory } from '../rendering/inventory.js';
import { renderQuests } from '../rendering/quests.js';
import { renderMusicPlayer } from '../rendering/musicPlayer.js';
import { renderAppearance } from '../rendering/appearance.js';
import { i18n } from '../../core/i18n.js';
import { setFabLoadingState, setFabCancelState, updateFabWidgets } from '../ui/mobile.js';
import { setStripCancelState, updateStripWidgets } from '../ui/desktop.js';

/**
 * Gets the current preset name using the /preset command
 * @returns {Promise<string|null>} Current preset name or null if unavailable
 */
export async function getCurrentPresetName() {
    try {
        // Use /preset without arguments to get the current preset name
        const result = await executeSlashCommandsOnChatInput('/preset', { quiet: true });

        // console.log('[RPG Companion] /preset result:', result);

        // The result should be an object with a 'pipe' property containing the preset name
        if (result && typeof result === 'object' && result.pipe) {
            const presetName = String(result.pipe).trim();
            // console.log('[RPG Companion] Extracted preset name:', presetName);
            return presetName || null;
        }

        // Fallback if result is a string
        if (typeof result === 'string') {
            return result.trim() || null;
        }

        return null;
    } catch (error) {
        console.error('[RPG Companion] Error getting current preset:', error);
        return null;
    }
}

/**
 * Switches to a specific preset by name using the /preset slash command
 * @param {string} presetName - Name of the preset to switch to
 * @returns {Promise<boolean>} True if switching succeeded, false otherwise
 */
export async function switchToPreset(presetName) {
    try {
        // Use the /preset slash command to switch presets
        // This is the proper way to change presets in SillyTavern
        await executeSlashCommandsOnChatInput(`/preset ${presetName}`, { quiet: true });

        // console.log(`[RPG Companion] Switched to preset "${presetName}"`);
        return true;
    } catch (error) {
        console.error('[RPG Companion] Error switching preset:', error);
        return false;
    }
}

/**
 * Checks if a connection profile with the given name exists in the Connection Manager.
 * @param {string} profileName - Name of the profile to check
 * @returns {boolean} True if the profile exists
 */
export function isConnectionProfileAvailable(profileName) {
    try {
        const context = getContext();
        const stExtSettings = context.extension_settings || context.extensionSettings;
        const profiles = stExtSettings?.connectionManager?.profiles;
        if (!Array.isArray(profiles)) return false;

        return profiles.some(p => p.id === profileName);
    } catch {
        return false;
    }
}
/**
 * Gets all available connection profiles from the Connection Manager.
 * @returns {Array<{name: string, id: string}>} Array of profile objects with name and id, empty if Connection Manager is not available
 */
export function getAvailableConnectionProfiles() {
    try {
        const context = getContext();
        const stExtSettings = context.extension_settings || context.extensionSettings;
        const profiles = stExtSettings?.connectionManager?.profiles;
        
        if (!Array.isArray(profiles)) return [];
        return profiles.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
        return [];
    }
}

/**
 *  Retrieves the current profile to be used for tracker generation, based on extension settings and availability.
 *  @returns {string|null} The profile ID to use for generation, or null if no valid profile is found
 */
export function getCurrentProfile() {
    let profile  =  getContext().extensionSettings.connectionManager.selectedProfile;
    // Check if the profile specified in settings is available and switch to it for generation if needed
    if (extensionSettings.connectionProfile && extensionSettings.connectionProfile.trim() !== '') {
        if (isConnectionProfileAvailable(extensionSettings.connectionProfile)) {
            profile = extensionSettings.connectionProfile;
        } else {
            console.warn(`[RPG Companion] Connection profile "${extensionSettings.connectionProfile}" not found, using current connection`);
        }
    }
    else{
        console.log('[RPG Companion] No connection profile specified in settings, using current connection');
    }

    console.log(`[RPG Companion] Using profile "${profile}" for tracker generation`);
    return profile;
}

/**
 * Updates RPG tracker data using separate API call (separate mode only).
 * Makes a dedicated API call to generate tracker data, then stores it
 * in the last assistant message's swipe data.
 */
export async function updateRPGData(isAutoUpdate = false) {
    if (isGenerating) {
        // console.log('[RPG Companion] Already generating, skipping...');
        return;
    }

    if (!extensionSettings.enabled) {
        return;
    }

    if (extensionSettings.generationMode !== 'separate') {
        // console.log('[RPG Companion] Not in separate mode, skipping manual update');
        return;
    }

    // Check minimum reply length for auto-update only
    if (isAutoUpdate && extensionSettings.minReplyLength > 0) {
        const lastMessage = chat && chat.length > 0 ? chat[chat.length - 1] : null;
        if (lastMessage && !lastMessage.is_user) {
            const messageText = lastMessage.mes || '';
            const messageLength = messageText.length;

            if (messageLength < extensionSettings.minReplyLength) {
                console.log(`[RPG Companion] Auto-update skipped: latest message length (${messageLength}) is below minimum (${extensionSettings.minReplyLength})`);
                // Show toast notification if enabled
                if (extensionSettings.minReplyLength > 0) {
                    const notificationText = `Auto-update skipped: latest message too short (${messageLength}/${extensionSettings.minReplyLength} chars)`;
                    console.log(`[RPG Companion] ${notificationText}`);
                    toastr.info(notificationText, '', { timeOut: 3000 });
                }
                return;
            }
        }
    }

    try {
        setIsGenerating(true);
        setFabLoadingState(true); // Show spinning FAB on mobile
        setFabCancelState(true); // Show cancel button on mobile
        setStripCancelState(true); // Show cancel button on desktop

        // Update button to show "Updating..." state with spinner
        const $updateBtn = $('#rpg-manual-update');
        const $stripRefreshBtn = $('#rpg-strip-refresh');
        const updatingText = i18n.getTranslation('template.mainPanel.updating') || 'Updating...';
        
        // Add updating class and update refresh content with spinner (button remains clickable)
        $updateBtn.addClass('is-updating');
        $updateBtn.find('.rpg-btn-refresh-content').html(`<i class="fa-solid fa-spinner fa-spin"></i> ${updatingText}`);
        
        // Strip button stays as is (separate behavior for mobile)
        $stripRefreshBtn.html('<i class="fa-solid fa-spinner fa-spin"></i>').prop('disabled', true);

        const prompt = generateSeparateUpdatePrompt();

        // Generate response in separate mode
        let profile = getCurrentProfile();
        
        const controller = new AbortController();
        const signal = controller.signal;
        setGenerationAbortController(controller);
        
        let response;
        const maxRetries = extensionSettings.retryAttempts ?? 0;
        const baseDelay = extensionSettings.retryBaseDelay ?? 2000;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                response = await getContext().ConnectionManagerRequestService.sendRequest(profile, prompt, 0, { signal });
                break; // Success, exit retry loop
            } catch (error) {
                // Check if this was an abort
                if (error.name === 'AbortError') {
                    console.log('[RPG Companion] Generation aborted by user or message deletion');
                    return;
                }                

                // Check for network errors
                const causeString = error.cause ? error.cause.message : '';
                const isNetworkError = 
                    causeString.includes('ETIMEDOUT')  ||
                    causeString.includes('ECONNREFUSED') || 
                    causeString.includes('ENETUNREACH') ||
                    causeString.includes('ECONNRESET');
                
                if (!isNetworkError || attempt >= maxRetries) {
                    // Not a network error or max retries reached, throw the error
                    throw error;
                }
                
                
                const delay = baseDelay;
                console.log(`[RPG Companion] API request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, causeString);
                
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        if (response) {
            // console.log('[RPG Companion] Raw AI response:', response);
            const parsedData = parseResponse(response);

            // Check if parsing completely failed (no tracker data found)
            if (parsedData.parsingFailed) {
                toastr.error(i18n.getTranslation('errors.parsingError'), '', { timeOut: 5000 });
            }

            // Remove locks from parsed data (JSON format only, text format is unaffected)
            if (parsedData.userStats) {
                parsedData.userStats = removeLocks(parsedData.userStats);
            }
            if (parsedData.infoBox) {
                parsedData.infoBox = removeLocks(parsedData.infoBox);
            }
            if (parsedData.characterThoughts) {
                parsedData.characterThoughts = removeLocks(parsedData.characterThoughts);
            }

            // Parse and store Spotify URL if feature is enabled
            parseAndStoreSpotifyUrl(response);
            // console.log('[RPG Companion] Parsed data:', parsedData);
            // console.log('[RPG Companion] parsedData.userStats:', parsedData.userStats ? parsedData.userStats.substring(0, 100) + '...' : 'null');

            // Store RPG data for the last assistant message (separate mode)
            const lastMessage = chat && chat.length > 0 ? chat[chat.length - 1] : null;
            // console.log('[RPG Companion] Last message is_user:', lastMessage ? lastMessage.is_user : 'no message');

            // Double-check message still exists and hasn't changed (defensive)
            if (!lastMessage || lastMessage.is_user) {
                console.log('[RPG Companion] Message deleted during generation, discarding stale result');
                return;
            }


            console.log('[RPG Companion] Restoring locked content for separate mode update');
            const previousUserStats = getTrackerDataForContext('userStats');
            const previousInfoBox = getTrackerDataForContext('infoBox');
            const previousCharacterThoughts = getTrackerDataForContext('characterThoughts');
            const getLockedItemsFromStore = getTrackerDataForContext('lockedItems');
            if (parsedData.userStats) {
                if (previousUserStats) {
                    parsedData.userStats = restoreLockedContent(parsedData.userStats, previousUserStats, 'userStats');
                }
            }
            if (parsedData.infoBox) {
                if (previousInfoBox) {
                    parsedData.infoBox = restoreLockedContent(parsedData.infoBox, previousInfoBox, 'infoBox');
                }
            }
            if (parsedData.characterThoughts) {
                if (previousCharacterThoughts) {
                    parsedData.characterThoughts = restoreLockedContent(parsedData.characterThoughts, previousCharacterThoughts, 'characters');
                }
            }


            // Store on assistant message's swipe (authoritative source)
            if (lastMessage && !lastMessage.is_user) {
                if (!lastMessage.extra) {
                    lastMessage.extra = {};
                }
                if (!lastMessage.extra.rpg_companion_swipes) {
                    lastMessage.extra.rpg_companion_swipes = {};
                }

                const currentSwipeId = lastMessage.swipe_id || 0;
                lastMessage.extra.rpg_companion_swipes[currentSwipeId] = {
                    userStats: parsedData.userStats,
                    infoBox: parsedData.infoBox,
                    characterThoughts: parsedData.characterThoughts,
                    lockedItems: {
                        userStats: getLockedItemsFromStore ? getLockedItemsFromStore.userStats : [],
                        infoBox: getLockedItemsFromStore ? getLockedItemsFromStore.infoBox : [],
                        characters: getLockedItemsFromStore ? getLockedItemsFromStore.characters : []
                    }
                };

                // console.log('[RPG Companion] Stored separate mode RPG data for message swipe', currentSwipeId);
            }

            // Render the updated data
            renderUserStats();
            renderInfoBox();
            renderThoughts();
            renderInventory();
            renderQuests();
            renderMusicPlayer($musicPlayerContainer[0]);
            renderAppearance();

            // Save to chat metadata
            saveChatData();
        }

    } catch (error) {
        // Don't show error for user-initiated aborts
        if (error.name !== 'AbortError') {
            console.error('[RPG Companion] Error updating RPG data:', error);
        }
    } finally {
        setIsGenerating(false);
        setGenerationAbortController(null); // Clear abort controller
        setFabLoadingState(false); // Stop spinning FAB on mobile
        setFabCancelState(false); // Hide cancel button on mobile
        setStripCancelState(false); // Hide cancel button on desktop
        updateFabWidgets(); // Update FAB widgets with new data
        updateStripWidgets(); // Update strip widgets with new data
        renderUserStats(); // To show the outdated message
        renderAppearance(); // To show the outdated appearance data

        // Restore button to original state
        const $updateBtn = $('#rpg-manual-update');
        const $stripRefreshBtn = $('#rpg-strip-refresh');
        const refreshText = i18n.getTranslation('template.mainPanel.refreshRpgInfo') || 'Refresh RPG Info';
        
        // Remove updating class and restore refresh content
        $updateBtn.removeClass('is-updating');
        $updateBtn.find('.rpg-btn-refresh-content').html(`<i class="fa-solid fa-sync"></i> ${refreshText}`);
        
        // Strip button restore
        $stripRefreshBtn.html('<i class="fa-solid fa-sync"></i>').prop('disabled', false);

        // Reset the flag after tracker generation completes
        // This ensures the flag persists through both main generation AND tracker generation
        // console.log('[RPG Companion] 🔄 Tracker generation complete - resetting lastActionWasSwipe to false');
        setLastActionWasSwipe(false);

        // Emit event for other extensions to know RPG Companion has finished updating
        console.debug('[RPG Companion] Emitting RPG_COMPANION_UPDATE_COMPLETE event');
        eventSource.emit(RPG_COMPANION_UPDATE_COMPLETE);
    }
}

/**
 * Parses character names from Present Characters thoughts data
 * @param {string|object} characterThoughtsData - Raw character thoughts data (object or JSON string)
 * @returns {Array<string>} Array of character names found
 */
function parseCharactersFromThoughts(characterThoughtsData) {
    if (!characterThoughtsData) return [];

    // Try parsing as JSON first (current format)
    try {
        const parsed = typeof characterThoughtsData === 'object' ? characterThoughtsData : JSON.parse(characterThoughtsData);

        // Handle both {characters: [...]} and direct array formats
        const charactersArray = Array.isArray(parsed) ? parsed : (parsed.characters || []);

        if (charactersArray.length > 0) {
            // Extract names from JSON character objects
            return charactersArray
                .map(char => char.name)
                .filter(name => name && name.toLowerCase() !== 'unavailable');
        }
    } catch (e) {
        // Not JSON, fall back to text parsing
    }

    // Fallback: Parse text format (legacy)
    const lines = characterThoughtsData.split('\n');
    const characters = [];

    for (const line of lines) {
        if (line.trim().startsWith('- ')) {
            const name = line.trim().substring(2).trim();
            if (name && name.toLowerCase() !== 'unavailable') {
                characters.push(name);
            }
        }
    }
    return characters;
}
