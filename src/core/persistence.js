/**
 * Core Persistence Module
 * Handles saving/loading extension settings and chat data
 */

import { saveSettingsDebounced, chat_metadata, saveChatDebounced } from '../../../../../../script.js';
import { getContext } from '../../../../../extensions.js';
import {
    extensionSettings,
    updateExtensionSettings,
    FEATURE_FLAGS
} from './state.js';
import { validateStoredInventory } from '../utils/security.js';

const extensionName = 'third-party/rpg-companion-sillytavern';

/**
 * Validates extension settings structure
 * @param {Object} settings - Settings object to validate
 * @returns {boolean} True if valid, false otherwise
 */
function validateSettings(settings) {
    if (!settings || typeof settings !== 'object') {
        return false;
    }

    // Check for required top-level properties
    if (typeof settings.enabled !== 'boolean' ||
        typeof settings.autoUpdate !== 'boolean' ||
        !settings.userStats || typeof settings.userStats !== 'object') {
        console.warn('[RPG Companion] Settings validation failed: missing required properties');
        return false;
    }

    // Validate userStats structure
    const stats = settings.userStats;
    if (typeof stats.health !== 'number' ||
        typeof stats.satiety !== 'number' ||
        typeof stats.energy !== 'number') {
        console.warn('[RPG Companion] Settings validation failed: invalid userStats structure');
        return false;
    }

    return true;
}

/**
 * Loads the extension settings from the global settings object.
 * Automatically migrates v1 inventory to v2 format if needed.
 */
export function loadSettings() {
    try {
        const context = getContext();
        const extension_settings = context.extension_settings || context.extensionSettings;

        // Validate extension_settings structure
        if (!extension_settings || typeof extension_settings !== 'object') {
            console.warn('[RPG Companion] extension_settings is not available, using default settings');
            return;
        }

        if (extension_settings[extensionName]) {
            const savedSettings = extension_settings[extensionName];

            // Validate loaded settings
            if (!validateSettings(savedSettings)) {
                console.warn('[RPG Companion] Loaded settings failed validation, using defaults');
                console.warn('[RPG Companion] Invalid settings:', savedSettings);
                // Save valid defaults to replace corrupt data
                saveSettings();
                return;
            }

            updateExtensionSettings(savedSettings);

            // Perform settings migrations based on version
            const currentVersion = extensionSettings.settingsVersion || 1;
            let settingsChanged = false;

            // Migration to version 5: Add opacity properties for all colors
            if (currentVersion < 5) {
                console.error('[RPG Companion] Below version 6 not supported. Some settings may not be migrated correctly. Please update to the latest version to ensure all features work properly.');
            }

            // Migration to version 6
            if (currentVersion < 6) {
                // Remove externalApiSettings from settings
                if(extensionSettings.externalApiSettings){
                    delete extensionSettings.externalApiSettings;
                    localStorage.removeItem('rpg_companion_external_api_key'); // Clear the API key
                }

                //extensionSettings.settingsVersion = 6; // During development keep disabled
                settingsChanged = true;
            }

            // Save migrated settings
            if (settingsChanged) {
                saveSettings();
            }

            // console.log('[RPG Companion] Settings loaded:', extensionSettings);
        } else {
            // console.log('[RPG Companion] No saved settings found, using defaults');
        }

        // Migrate to trackerConfig if it doesn't exist
        if (!extensionSettings.trackerConfig) {
            // console.log('[RPG Companion] Migrating to trackerConfig format');
            migrateToTrackerConfig();
            saveSettings(); // Persist migration
        }

        // Migrate to preset manager system if presets don't exist
        migrateToPresetManager();

        // Initialize custom status fields
        initializeCustomStatusFields();

        // Ensure all stats have maxValue (for number display mode)
        ensureStatsHaveMaxValue();
    } catch (error) {
        console.error('[RPG Companion] Error loading settings:', error);
        console.error('[RPG Companion] Error details:', error.message, error.stack);
        console.warn('[RPG Companion] Using default settings due to load error');
        // Settings will remain at defaults from state.js
    }

    // Validate inventory structure (Bug #3 fix)
    validateInventoryStructure(extensionSettings.userStats.inventory, 'settings');
}

/**
 * Saves the extension settings to the global settings object.
 */
export function saveSettings() {
    const context = getContext();
    const extension_settings = context.extension_settings || context.extensionSettings;

    if (!extension_settings) {
        console.error('[RPG Companion] extension_settings is not available, cannot save');
        return;
    }

    extension_settings[extensionName] = extensionSettings;
    saveSettingsDebounced();
}

/**
 * Saves RPG data to the current chat's metadata.
 */
export function saveChatData() {
    saveChatDebounced();
}

/**
 * Updates the last assistant message's swipe data with current tracker data.
 * This ensures user edits are preserved across swipes and included in generation context.
 */
/**
 * Updates the last assistant message's swipe data with current tracker data.
 * Called when user edits tracker fields (stats, conditions, etc).
 * Reads current swipe data, updates it with extensionSettings, and writes back.
 */
export function updateMessageSwipeData() {
    const chat = getContext().chat;
    if (!chat || chat.length === 0) {
        console.warn('[RPG Companion] No chat messages found, cannot update swipe data');
        return;
    }

    // Find the last assistant message
    console.log(`[RPG Companion] Updating message swipe data. Chat length: ${chat.length}`);
    for (let i = chat.length - 1; i >= 0; i--) {
        const message = chat[i];
        if (!message.is_user && !message.is_system) {
            if (!message.extra) {
                continue; // No extra field, skip this message
            }
            if (!message.extra.rpg_companion_swipes) {
                continue; // No extra field, skip this message
            }

            const swipeId = message.swipe_id || 0;
            const currentSwipeData = message.extra.rpg_companion_swipes[swipeId] || {};
            console.log(`[RPG Companion] Updating message:`, i, 'Swipe:', swipeId);
            
            // Build updated user stats data
            // If previous data was JSON, maintain JSON format; otherwise use text
            let userStatsData = null;
            if (currentSwipeData.userStats) {
                const trimmed = currentSwipeData.userStats.trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                    // Maintain JSON format
                    try {
                        const jsonData = JSON.parse(currentSwipeData.userStats);
                        if (jsonData && typeof jsonData === 'object') {
                            const stats = extensionSettings.userStats;
                            
                            // Update stats array values from extensionSettings
                            if (jsonData.stats && Array.isArray(jsonData.stats)) {
                                jsonData.stats = jsonData.stats.map(stat => ({
                                    ...stat,
                                    value: stats[stat.id] !== undefined ? stats[stat.id] : stat.value
                                }));
                            }
                            
                            // Update status fields
                            if (jsonData.status) {
                                jsonData.status.mood = stats.mood || '😐';
                                const customFields = extensionSettings.trackerConfig?.userStats?.statusSection?.customFields || [];
                                for (const fieldName of customFields) {
                                    const fieldKey = fieldName.toLowerCase().replace(/\s+/g, '_');
                                    jsonData.status[fieldKey] = stats[fieldKey] || 'None';
                                }
                            }
                            
                            // Update inventory
                            if (stats.inventory) {
                                jsonData.inventory = stats.inventory;
                            }
                            
                            // Update quests
                            if (extensionSettings.quests) {
                                jsonData.quests = extensionSettings.quests;
                            }
                            
                            // Update skills
                            if (stats.skills !== undefined) {
                                jsonData.skills = stats.skills;
                            }
                            
                            userStatsData = JSON.stringify(jsonData, null, 2);
                        }
                    } catch (e) {
                        console.warn('[RPG Companion] Failed to update JSON userStats:', e);
                        // Fall through to text format
                    }
                }
            }
            // Infobox
            if (currentSwipeData.infoBox) {
                currentSwipeData.infoBox = extensionSettings.infoBox;
            }
            
            // Update swipe data with current tracker information
            message.extra.rpg_companion_swipes[swipeId] = {
                userStats: userStatsData !== null ? userStatsData : currentSwipeData.userStats,
                infoBox: currentSwipeData.infoBox,
                characterThoughts: currentSwipeData.characterThoughts,
                lockedItems: {
                    userStats: extensionSettings.lockedItems.userStats,
                    infoBox: extensionSettings.lockedItems.infoBox,
                    characters: extensionSettings.lockedItems.characters
                }
            };

            // console.log('[RPG Companion] Updated message swipe data after user edit');
            break;
        }
    }
}

/**
 * Validates and repairs inventory structure to prevent corruption.
 * Ensures all v2 fields exist and are the correct type.
 * Fixes Bug #3: Location disappears when switching tabs
 *
 * @param {Object} inventory - Inventory object to validate
 * @param {string} source - Source of load ('settings' or 'chat') for logging
 * @private
 */
function validateInventoryStructure(inventory, source) {
    if (!inventory || typeof inventory !== 'object') {
        console.error(`[RPG Companion] Invalid inventory from ${source}, resetting to defaults`);
        extensionSettings.userStats.inventory = {
            version: 2,
            onPerson: [],
            stored: {},
            assets: []
        };
        saveSettings();
        return;
    }

    let needsSave = false;

    // Ensure v2 structure
    if (inventory.version !== 2) {
        console.warn(`[RPG Companion] Inventory from ${source} missing version, setting to 2`);
        inventory.version = 2;
        needsSave = true;
    }

    // Validate onPerson field - should be an array
    if (!Array.isArray(inventory.onPerson)) {
        console.warn(`[RPG Companion] Invalid onPerson from ${source}, resetting to empty array`);
        inventory.onPerson = [];
        needsSave = true;
    }

    // Validate stored field (CRITICAL for Bug #3)
    if (!inventory.stored || typeof inventory.stored !== 'object' || Array.isArray(inventory.stored)) {
        console.error(`[RPG Companion] Corrupted stored inventory from ${source}, resetting to empty object`);
        inventory.stored = {};
        needsSave = true;
    } else {
        // Validate stored object keys/values - each should be an array
        const storedNeedsSave = validateStoredInventoryStructure(inventory.stored);
        if (storedNeedsSave) {
            console.warn(`[RPG Companion] Cleaned stored inventory from ${source}`);
            needsSave = true;
        }
    }

    // Validate assets field - should be an array
    if (!Array.isArray(inventory.assets)) {
        console.warn(`[RPG Companion] Invalid assets from ${source}, resetting to empty array`);
        inventory.assets = [];
        needsSave = true;
    }

    // Persist repairs if needed
    if (needsSave) {
        // console.log(`[RPG Companion] Repaired inventory structure from ${source}, saving...`);
        saveSettings();
        if (source === 'chat') {
            saveChatData();
        }
    }
}

/**
 * Validates stored inventory structure - ensures each location contains an array
 * @param {Object} stored - Stored inventory object
 * @returns {boolean} True if validation failed and needs save
 */
function validateStoredInventoryStructure(stored) {
    let needsSave = false;
    
    for (const location in stored) {
        if (!Array.isArray(stored[location])) {
            console.warn(`[RPG Companion] Stored location "${location}" is not an array, converting to array`);
            // Convert string to array
            if (typeof stored[location] === 'string') {
                const items = stored[location].split(',').map(s => s.trim()).filter(s => s);
                // Convert to object format
                stored[location] = items.map(item => ({ name: item, quantity: 1 }));
            } else {
                stored[location] = [];
            }
            needsSave = true;
        }
    }
    
    return needsSave;
}

/**
 * Migrates old settings format to new trackerConfig format
 * Converts statNames to customStats array and sets up default config
 */
function migrateToTrackerConfig() {
    // Initialize trackerConfig if it doesn't exist
    if (!extensionSettings.trackerConfig) {
        extensionSettings.trackerConfig = {
            userStats: {
                customStats: [],
                showRPGAttributes: true,
                rpgAttributes: [
                    { id: 'str', name: 'STR', enabled: true },
                    { id: 'dex', name: 'DEX', enabled: true },
                    { id: 'con', name: 'CON', enabled: true },
                    { id: 'int', name: 'INT', enabled: true },
                    { id: 'wis', name: 'WIS', enabled: true },
                    { id: 'cha', name: 'CHA', enabled: true }
                ],
                statusSection: {
                    enabled: true,
                    showMoodEmoji: true,
                    customFields: ['Conditions']
                },
                skillsSection: {
                    enabled: false,
                    label: 'Skills'
                }
            },
            infoBox: {
                widgets: {
                    date: { enabled: true, format: 'Weekday, Month, Year' },
                    weather: { enabled: true },
                    temperature: { enabled: true, unit: 'C' },
                    time: { enabled: true },
                    location: { enabled: true },
                    recentEvents: { enabled: true }
                }
            },
            presentCharacters: {
                showEmoji: true,
                showName: true,
                customFields: [
                    { id: 'physicalState', label: 'Physical State', enabled: true, placeholder: 'Visible Physical State (up to three traits)' },
                    { id: 'demeanor', label: 'Demeanor Cue', enabled: true, placeholder: 'Observable Demeanor Cue (one trait)' },
                    { id: 'relationship', label: 'Relationship', enabled: true, type: 'relationship', placeholder: 'Enemy/Neutral/Friend/Lover' },
                    { id: 'internalMonologue', label: 'Internal Monologue', enabled: true, placeholder: 'Internal Monologue (in first person from character\'s POV, up to three sentences long)' }
                ],
                characterStats: {
                    enabled: false,
                    stats: []
                }
            }
        };
    }

    // Migrate old statNames to customStats if statNames exists
    if (extensionSettings.statNames && extensionSettings.trackerConfig.userStats.customStats.length === 0) {
        const statOrder = ['health', 'satiety', 'energy', 'hygiene', 'arousal'];
        extensionSettings.trackerConfig.userStats.customStats = statOrder.map(id => ({
            id: id,
            name: extensionSettings.statNames[id] || id.charAt(0).toUpperCase() + id.slice(1),
            enabled: true
        }));
        // console.log('[RPG Companion] Migrated statNames to customStats array');
    }

    // Ensure all stats have corresponding values in userStats
    if (extensionSettings.userStats) {
        for (const stat of extensionSettings.trackerConfig.userStats.customStats) {
            if (extensionSettings.userStats[stat.id] === undefined) {
                extensionSettings.userStats[stat.id] = stat.id === 'arousal' ? 0 : 100;
            }
        }
    }

    // Migrate old showRPGAttributes boolean to rpgAttributes array
    if (extensionSettings.trackerConfig.userStats.showRPGAttributes !== undefined) {
        const shouldShow = extensionSettings.trackerConfig.userStats.showRPGAttributes;
        extensionSettings.trackerConfig.userStats.rpgAttributes = [
            { id: 'str', name: 'STR', enabled: shouldShow },
            { id: 'dex', name: 'DEX', enabled: shouldShow },
            { id: 'con', name: 'CON', enabled: shouldShow },
            { id: 'int', name: 'INT', enabled: shouldShow },
            { id: 'wis', name: 'WIS', enabled: shouldShow },
            { id: 'cha', name: 'CHA', enabled: shouldShow }
        ];
        delete extensionSettings.trackerConfig.userStats.showRPGAttributes;
        // console.log('[RPG Companion] Migrated showRPGAttributes to rpgAttributes array');
    }

    // Ensure rpgAttributes exists even if no migration was needed
    if (!extensionSettings.trackerConfig.userStats.rpgAttributes) {
        extensionSettings.trackerConfig.userStats.rpgAttributes = [
            { id: 'str', name: 'STR', enabled: true },
            { id: 'dex', name: 'DEX', enabled: true },
            { id: 'con', name: 'CON', enabled: true },
            { id: 'int', name: 'INT', enabled: true },
            { id: 'wis', name: 'WIS', enabled: true },
            { id: 'cha', name: 'CHA', enabled: true }
        ];
    }

    // Ensure showRPGAttributes exists (defaults to true)
    if (extensionSettings.trackerConfig.userStats.showRPGAttributes === undefined) {
        extensionSettings.trackerConfig.userStats.showRPGAttributes = true;
    }

    // Ensure all rpgAttributes have corresponding values in classicStats
    if (extensionSettings.classicStats) {
        for (const attr of extensionSettings.trackerConfig.userStats.rpgAttributes) {
            if (extensionSettings.classicStats[attr.id] === undefined) {
                extensionSettings.classicStats[attr.id] = 10;
            }
        }
    }

    // Migrate old presentCharacters structure to new format
    if (extensionSettings.trackerConfig.presentCharacters) {
        const pc = extensionSettings.trackerConfig.presentCharacters;

        // Check if using old flat customFields structure (has 'label' or 'placeholder' keys)
        if (pc.customFields && pc.customFields.length > 0) {
            const hasOldFormat = pc.customFields.some(f => f.label || f.placeholder || f.type === 'relationship');

            if (hasOldFormat) {
                // console.log('[RPG Companion] Migrating Present Characters to new structure');

                // Extract relationship fields from old customFields
                const relationshipFields = ['Lover', 'Friend', 'Ally', 'Enemy', 'Neutral'];

                // Extract non-relationship fields and convert to new format
                const newCustomFields = pc.customFields
                    .filter(f => f.type !== 'relationship' && f.id !== 'internalMonologue')
                    .map(f => ({
                        id: f.id,
                        name: f.label || f.name || 'Field',
                        enabled: f.enabled !== false,
                        description: f.placeholder || f.description || ''
                    }));

                // Extract thoughts config from old Internal Monologue field
                const thoughtsField = pc.customFields.find(f => f.id === 'internalMonologue');
                const thoughts = {
                    enabled: thoughtsField ? (thoughtsField.enabled !== false) : true,
                    name: 'Thoughts',
                    description: thoughtsField?.placeholder || 'Internal Monologue (in first person from character\'s POV, up to three sentences long)'
                };

                // Update to new structure
                pc.relationshipFields = relationshipFields;
                pc.customFields = newCustomFields;
                pc.thoughts = thoughts;

                // console.log('[RPG Companion] Present Characters migration complete');
                saveSettings(); // Persist the migration
            }
        }

        // Ensure new structure exists even if migration wasn't needed
        if (!pc.relationshipFields) {
            pc.relationshipFields = ['Lover', 'Friend', 'Ally', 'Enemy', 'Neutral'];
        }
        if (!pc.relationshipEmojis) {
            // Create default emoji mapping from relationshipFields
            pc.relationshipEmojis = {
                'Lover': '❤️',
                'Friend': '⭐',
                'Ally': '🤝',
                'Enemy': '⚔️',
                'Neutral': '⚖️'
            };
        }

        // Migrate to new relationships structure if not already present
        if (!pc.relationships) {
            pc.relationships = {
                enabled: true, // Default to enabled for backward compatibility
                relationshipEmojis: pc.relationshipEmojis || {
                    'Lover': '❤️',
                    'Friend': '⭐',
                    'Ally': '🤝',
                    'Enemy': '⚔️',
                    'Neutral': '⚖️'
                }
            };
        }

        if (!pc.thoughts) {
            pc.thoughts = {
                enabled: true,
                name: 'Thoughts',
                description: 'Internal Monologue (in first person from character\'s POV, up to three sentences long)'
            };
        }
    }
}

// ============================================================================
// Preset Management Functions
// ============================================================================

/**
 * Gets the entity key for the current character or group
 * @returns {string|null} Entity key in format "char_{id}" or "group_{id}", or null if no character selected
 */
export function getCurrentEntityKey() {
    const context = getContext();
    if (context.groupId) {
        return `group_${context.groupId}`;
    } else if (context.characterId !== undefined && context.characterId !== null) {
        return `char_${context.characterId}`;
    }
    return null;
}

/**
 * Gets the display name for the current character or group
 * @returns {string} Display name for the current entity
 */
export function getCurrentEntityName() {
    const context = getContext();
    if (context.groupId) {
        const group = context.groups?.find(g => g.id === context.groupId);
        return group?.name || 'Group Chat';
    } else if (context.characterId !== undefined && context.characterId !== null) {
        return context.name2 || 'Character';
    }
    return 'No Character';
}

/**
 * Migrates existing trackerConfig to the preset system if presetManager doesn't exist
 * Creates a "Default" preset from the current trackerConfig
 */
export function migrateToPresetManager() {
    if (!extensionSettings.presetManager || Object.keys(extensionSettings.presetManager.presets || {}).length === 0) {
        // console.log('[RPG Companion] Migrating to preset manager system');

        // Initialize presetManager if it doesn't exist
        if (!extensionSettings.presetManager) {
            extensionSettings.presetManager = {
                presets: {},
                characterAssociations: {},
                activePresetId: null,
                defaultPresetId: null
            };
        }

        // Create default preset from existing trackerConfig
        const defaultPresetId = 'preset_default';
        extensionSettings.presetManager.presets[defaultPresetId] = {
            id: defaultPresetId,
            name: 'Default',
            trackerConfig: JSON.parse(JSON.stringify(extensionSettings.trackerConfig))
        };
        extensionSettings.presetManager.activePresetId = defaultPresetId;
        extensionSettings.presetManager.defaultPresetId = defaultPresetId;

        // console.log('[RPG Companion] Created Default preset from existing trackerConfig');
        saveSettings();
    }
}

/**
 * Initializes custom status fields in userStats based on trackerConfig
 * Ensures all defined custom status fields have a value in the userStats object
 */
function initializeCustomStatusFields() {
    const customFields = extensionSettings.trackerConfig?.userStats?.statusSection?.customFields || [];

    // Initialize each custom field if it doesn't exist
    for (const fieldName of customFields) {
        const fieldKey = fieldName.toLowerCase();
        if (extensionSettings.userStats[fieldKey] === undefined) {
            extensionSettings.userStats[fieldKey] = 'None';
            // console.log(`[RPG Companion] Initialized custom status field: ${fieldKey}`);
        }
    }
}

/**
 * Ensures all custom stats have a maxValue property
 * This migration supports the number display mode feature
 */
function ensureStatsHaveMaxValue() {
    const customStats = extensionSettings.trackerConfig?.userStats?.customStats || [];

    for (const stat of customStats) {
        if (stat && stat.maxValue === undefined) {
            stat.maxValue = 100; // Default to 100 for backward compatibility
            // console.log(`[RPG Companion] Added maxValue to stat: ${stat.id || stat.name}`);
        }
    }

    // Ensure statsDisplayMode is set (default to percentage)
    if (extensionSettings.trackerConfig?.userStats &&
        extensionSettings.trackerConfig.userStats.statsDisplayMode === undefined) {
        extensionSettings.trackerConfig.userStats.statsDisplayMode = 'percentage';
        // console.log('[RPG Companion] Initialized statsDisplayMode to percentage');
    }
}

/**
 * Gets all available presets
 * @returns {Object} Map of preset ID to preset data
 */
export function getPresets() {
    return extensionSettings.presetManager?.presets || {};
}

/**
 * Gets a specific preset by ID
 * @param {string} presetId - The preset ID
 * @returns {Object|null} The preset object or null if not found
 */
export function getPreset(presetId) {
    return extensionSettings.presetManager?.presets?.[presetId] || null;
}

/**
 * Gets the currently active preset ID
 * @returns {string|null} The active preset ID or null
 */
export function getActivePresetId() {
    return extensionSettings.presetManager?.activePresetId || null;
}

/**
 * Gets the default preset ID
 * @returns {string|null} The default preset ID or null
 */
export function getDefaultPresetId() {
    return extensionSettings.presetManager?.defaultPresetId || null;
}

/**
 * Sets a preset as the default
 * @param {string} presetId - The preset ID to set as default
 */
export function setDefaultPreset(presetId) {
    if (extensionSettings.presetManager.presets[presetId]) {
        extensionSettings.presetManager.defaultPresetId = presetId;
        saveSettings();
        // console.log(`[RPG Companion] Set preset ${presetId} as default`);
    }
}

/**
 * Checks if the given preset is the default
 * @param {string} presetId - The preset ID to check
 * @returns {boolean} True if it's the default preset
 */
export function isDefaultPreset(presetId) {
    return extensionSettings.presetManager?.defaultPresetId === presetId;
}

/**
 * Creates a new preset from the current trackerConfig
 * @param {string} name - Name for the new preset
 * @returns {string} The ID of the newly created preset
 */
export function createPreset(name) {
    const presetId = `preset_${Date.now()}`;
    extensionSettings.presetManager.presets[presetId] = {
        id: presetId,
        name: name,
        trackerConfig: JSON.parse(JSON.stringify(extensionSettings.trackerConfig)),
        historyPersistence: extensionSettings.historyPersistence
            ? JSON.parse(JSON.stringify(extensionSettings.historyPersistence))
            : null
    };
    // Also set it as the active preset so edits go to the new preset
    extensionSettings.presetManager.activePresetId = presetId;
    saveSettings();
    // console.log(`[RPG Companion] Created preset "${name}" with ID ${presetId}`);
    return presetId;
}

/**
 * Saves the current trackerConfig and historyPersistence to the specified preset
 * @param {string} presetId - The preset ID to save to
 */
export function saveToPreset(presetId) {
    const preset = extensionSettings.presetManager.presets[presetId];
    if (preset) {
        preset.trackerConfig = JSON.parse(JSON.stringify(extensionSettings.trackerConfig));
        preset.historyPersistence = extensionSettings.historyPersistence
            ? JSON.parse(JSON.stringify(extensionSettings.historyPersistence))
            : null;
        saveSettings();
        // console.log(`[RPG Companion] Saved current config to preset "${preset.name}"`);
    }
}

/**
 * Loads a preset's trackerConfig and historyPersistence as the active configuration
 * @param {string} presetId - The preset ID to load
 * @returns {boolean} True if loaded successfully, false otherwise
 */
export function loadPreset(presetId) {
    const preset = extensionSettings.presetManager.presets[presetId];
    if (preset && preset.trackerConfig) {
        extensionSettings.trackerConfig = JSON.parse(JSON.stringify(preset.trackerConfig));
        // Load historyPersistence if present, otherwise use defaults
        if (preset.historyPersistence) {
            extensionSettings.historyPersistence = JSON.parse(JSON.stringify(preset.historyPersistence));
        } else {
            // Default values for presets that don't have historyPersistence yet
            extensionSettings.historyPersistence = {
                enabled: false,
                messageCount: 5,
                injectionPosition: 'assistant_message_end',
                contextPreamble: ''
            };
        }
        extensionSettings.presetManager.activePresetId = presetId;
        saveSettings();
        // console.log(`[RPG Companion] Loaded preset "${preset.name}"`);
        return true;
    }
    return false;
}

/**
 * Renames a preset
 * @param {string} presetId - The preset ID to rename
 * @param {string} newName - The new name for the preset
 */
export function renamePreset(presetId, newName) {
    const preset = extensionSettings.presetManager.presets[presetId];
    if (preset) {
        preset.name = newName;
        saveSettings();
        // console.log(`[RPG Companion] Renamed preset to "${newName}"`);
    }
}

/**
 * Deletes a preset
 * @param {string} presetId - The preset ID to delete
 * @returns {boolean} True if deleted, false if it's the last preset (can't delete)
 */
export function deletePreset(presetId) {
    const presets = extensionSettings.presetManager.presets;
    const presetIds = Object.keys(presets);

    // Don't delete if it's the last preset
    if (presetIds.length <= 1) {
        // console.warn('[RPG Companion] Cannot delete the last preset');
        return false;
    }

    // Remove any character associations using this preset
    const associations = extensionSettings.presetManager.characterAssociations;
    for (const entityKey of Object.keys(associations)) {
        if (associations[entityKey] === presetId) {
            delete associations[entityKey];
        }
    }

    // Delete the preset
    delete presets[presetId];

    // If the deleted preset was active, switch to the first available preset
    if (extensionSettings.presetManager.activePresetId === presetId) {
        const remainingIds = Object.keys(presets);
        if (remainingIds.length > 0) {
            loadPreset(remainingIds[0]);
        }
    }

    saveSettings();
    // console.log(`[RPG Companion] Deleted preset ${presetId}`);
    return true;
}

/**
 * Associates the current preset with the current character/group
 */
export function associatePresetWithCurrentEntity() {
    const entityKey = getCurrentEntityKey();
    const activePresetId = extensionSettings.presetManager.activePresetId;

    if (entityKey && activePresetId) {
        extensionSettings.presetManager.characterAssociations[entityKey] = activePresetId;
        saveSettings();
        // console.log(`[RPG Companion] Associated preset ${activePresetId} with ${entityKey}`);
    }
}

/**
 * Removes the preset association for the current character/group
 */
export function removePresetAssociationForCurrentEntity() {
    const entityKey = getCurrentEntityKey();
    if (entityKey && extensionSettings.presetManager.characterAssociations[entityKey]) {
        delete extensionSettings.presetManager.characterAssociations[entityKey];
        saveSettings();
        // console.log(`[RPG Companion] Removed preset association for ${entityKey}`);
    }
}

/**
 * Gets the preset ID associated with the current character/group
 * @returns {string|null} The associated preset ID or null
 */
export function getPresetForCurrentEntity() {
    const entityKey = getCurrentEntityKey();
    if (entityKey) {
        return extensionSettings.presetManager.characterAssociations[entityKey] || null;
    }
    return null;
}

/**
 * Checks if the current character/group has a preset association
 * @returns {boolean} True if there's an association
 */
export function hasPresetAssociation() {
    const entityKey = getCurrentEntityKey();
    return entityKey && extensionSettings.presetManager.characterAssociations[entityKey] !== undefined;
}

/**
 * Checks if the current character/group is associated with the currently active preset
 * @returns {boolean} True if the current entity is associated with the active preset
 */
export function isAssociatedWithCurrentPreset() {
    const entityKey = getCurrentEntityKey();
    const activePresetId = extensionSettings.presetManager?.activePresetId;
    if (!entityKey || !activePresetId) return false;
    return extensionSettings.presetManager.characterAssociations[entityKey] === activePresetId;
}

/**
 * Auto-switches to the preset associated with the current character/group
 * Called when character changes. Falls back to default preset if no association.
 * @returns {boolean} True if a preset was switched, false otherwise
 */
export function autoSwitchPresetForEntity() {
    const associatedPresetId = getPresetForCurrentEntity();

    // If there's a character-specific preset, use it
    if (associatedPresetId && associatedPresetId !== extensionSettings.presetManager.activePresetId) {
        // Check if the preset still exists
        if (extensionSettings.presetManager.presets[associatedPresetId]) {
            return loadPreset(associatedPresetId);
        } else {
            // Preset was deleted, remove the stale association
            removePresetAssociationForCurrentEntity();
        }
    }

    // No character association - fall back to default preset if set
    if (!associatedPresetId) {
        const defaultPresetId = extensionSettings.presetManager.defaultPresetId;
        if (defaultPresetId &&
            defaultPresetId !== extensionSettings.presetManager.activePresetId &&
            extensionSettings.presetManager.presets[defaultPresetId]) {
            return loadPreset(defaultPresetId);
        }
    }

    return false;
}

/**
 * Exports presets for sharing (without character associations)
 * @param {string[]} presetIds - Array of preset IDs to export, or empty for all
 * @returns {Object} Export data object
 */
export function exportPresets(presetIds = []) {
    const presetsToExport = {};
    const allPresets = extensionSettings.presetManager.presets;

    // If no specific IDs provided, export all
    const idsToExport = presetIds.length > 0 ? presetIds : Object.keys(allPresets);

    for (const id of idsToExport) {
        if (allPresets[id]) {
            presetsToExport[id] = {
                id: allPresets[id].id,
                name: allPresets[id].name,
                trackerConfig: allPresets[id].trackerConfig
            };
        }
    }

    return {
        version: '1.0',
        exportDate: new Date().toISOString(),
        presets: presetsToExport
        // Note: characterAssociations are intentionally NOT exported
    };
}

/**
 * Imports presets from an export file
 * @param {Object} importData - The imported data object
 * @param {boolean} overwrite - If true, overwrites existing presets with same name
 * @returns {number} Number of presets imported
 */
export function importPresets(importData, overwrite = false) {
    if (!importData.presets || typeof importData.presets !== 'object') {
        throw new Error('Invalid import data: missing presets');
    }

    let importCount = 0;
    const existingNames = new Set(
        Object.values(extensionSettings.presetManager.presets).map(p => p.name.toLowerCase())
    );

    for (const [originalId, preset] of Object.entries(importData.presets)) {
        if (!preset.name || !preset.trackerConfig) {
            continue; // Skip invalid presets
        }

        let name = preset.name;
        const nameLower = name.toLowerCase();

        // Check for name collision
        if (existingNames.has(nameLower)) {
            if (overwrite) {
                // Find and delete the existing preset with this name
                for (const [existingId, existingPreset] of Object.entries(extensionSettings.presetManager.presets)) {
                    if (existingPreset.name.toLowerCase() === nameLower) {
                        delete extensionSettings.presetManager.presets[existingId];
                        break;
                    }
                }
            } else {
                // Generate a unique name
                let counter = 1;
                while (existingNames.has(`${nameLower} (${counter})`)) {
                    counter++;
                }
                name = `${preset.name} (${counter})`;
            }
        }

        // Create new preset with new ID
        const newId = `preset_${Date.now()}_${importCount}`;
        extensionSettings.presetManager.presets[newId] = {
            id: newId,
            name: name,
            trackerConfig: JSON.parse(JSON.stringify(preset.trackerConfig))
        };
        existingNames.add(name.toLowerCase());
        importCount++;
    }

    if (importCount > 0) {
        saveSettings();
    }

    return importCount;
}

