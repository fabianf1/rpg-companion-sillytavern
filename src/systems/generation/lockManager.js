/**
 * Lock Manager
 * Handles applying and removing locks for tracker items
 * Locks prevent AI from modifying specific values
 */

import { extensionSettings, isGenerating } from '../../core/state.js';
import { repairJSON } from '../../utils/jsonRepair.js';
import { getContext } from '../../../../../../extensions.js';
import { saveChatData, updateMessageSwipeData } from '../../core/persistence.js';
import {getTrackerDataForContext} from './promptBuilder.js';

/**
 * Get the current swipe ID from the active message
 * @returns {number} The current swipe ID
 */
function getCurrentSwipeId() {
    const context = getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) {
        return 0;
    }
    
    // Find the last assistant message
    for (let i = chat.length - 1; i >= 0; i--) {
        const message = chat[i];
        if (!message.is_user && !message.is_system) {
            return message.swipe_id || 0;
        }
    }
    return 0;
}

/**
 * Get lock settings from swipeStore for current message/swipe
 * @param {string} trackerType - Type of tracker ('userStats', 'infoBox', 'characters')
 * @returns {Object} The locked items configuration for this tracker type
 */
export function getLockedItemsFromSwipeStore(trackerType) {
    const lockedItems = getTrackerDataForContext('lockedItems');
    if (lockedItems && lockedItems[trackerType]) {
        return lockedItems[trackerType];
    }
    else{
        return {};
    }
}

/**
 * Set lock settings in swipeStore for current message/swipe
 * @param {string} trackerType - Type of tracker ('userStats', 'infoBox', 'characters')
 * @param {Object} lockedItems - The locked items configuration to save
 */
function setLockedItemsInSwipeStore(trackerType, lockedItems) {
    if(isGenerating){
        console.warn('[RPG Lock Manager] Attempted to set locked items while generation is in progress.');
        return;
    }

    if (!extensionSettings.lockedItems) {
        extensionSettings.lockedItems = {
            userStats: {},
            infoBox: {},
            characters: {}
        };
    }
    extensionSettings.lockedItems[trackerType] = lockedItems;
    updateMessageSwipeData(); // Update swipe data to trigger re-render of lock icons in UI
    saveChatData(); // Save changes to persistence
}

/**
 * Apply locks to tracker data before sending to AI.
 * Adds "locked": true to locked items in JSON format.
 *
 * @param {string} trackerData - JSON string of tracker data
 * @param {string} trackerType - Type of tracker ('userStats', 'infoBox', 'characters')
 * @returns {string} Tracker data with locks applied
 */
export function applyLocks(trackerData, trackerType) {
    if (!trackerData) return trackerData;

    // Try to parse as JSON
    const parsed = repairJSON(trackerData);
    if (!parsed) {
        // Not JSON format, return as-is (text format doesn't support locks)
        return trackerData;
    }

    // Get locked items from swipeStore
    const lockedItems = getLockedItemsFromSwipeStore(trackerType);

    // Apply locks based on tracker type
    switch (trackerType) {
        case 'userStats':
            return applyUserStatsLocks(parsed, lockedItems);
        case 'infoBox':
            return applyInfoBoxLocks(parsed, lockedItems);
        case 'characters':
            return applyCharactersLocks(parsed, lockedItems);
        default:
            return trackerData;
    }
}

/**
 * Apply locks to User Stats tracker
 * @param {Object} data - Parsed user stats data
 * @param {Object} lockedItems - Locked items configuration
 * @returns {string} JSON string with locks applied
 */
function applyUserStatsLocks(data, lockedItems) {
    // Lock individual stats within stats object
    if (data.stats && lockedItems.stats) {
        // Handle both section lock and individual stat locks
        const isStatsLocked = lockedItems.stats === true;
        if (isStatsLocked) {
            // Lock entire stats section
            for (const statName in data.stats) {
                data.stats[statName] = {
                    value: data.stats[statName].value || data.stats[statName],
                    locked: true
                };
            }
        } else {
            // Lock individual stats
            for (const statName in lockedItems.stats) {
                if (lockedItems.stats[statName] && data.stats[statName] !== undefined) {
                    data.stats[statName] = {
                        value: data.stats[statName].value || data.stats[statName],
                        locked: true
                    };
                }
            }
        }
    }

    // Lock status field
    if (data.status && lockedItems.status) {
        data.status = {
            ...data.status,
            locked: true
        };
    }

    // Lock individual skills
    if (data.skills && lockedItems.skills) {
        if (Array.isArray(data.skills)) {
            data.skills = data.skills.map(skill => {
                if (typeof skill === 'string') {
                    if (lockedItems.skills[skill]) {
                        return { name: skill, locked: true };
                    }
                    return skill;
                } else if (skill.name && lockedItems.skills[skill.name]) {
                    return { ...skill, locked: true };
                }
                return skill;
            });
        }
    }

    // Lock inventory items - match by item name instead of index
    if (data.inventory && lockedItems.inventory) {
        // Helper function to apply locks based on item name
        const applyInventoryLocks = (items, category) => {
            if (!Array.isArray(items)) return items;
            if (!lockedItems.inventory[category]) return items;

            return items.map((item) => {
                // Get item name from object format (name property)
                const itemName = item?.name || '';

                // Check if this specific item name is locked
                if (lockedItems.inventory[category][itemName]) {
                    return { ...item, locked: true };
                }
                return item;
            });
        };

        // Apply locks to onPerson items
        if (data.inventory.onPerson) {
            data.inventory.onPerson = applyInventoryLocks(data.inventory.onPerson, 'onPerson');
        }

        // Apply locks to clothing items
        if (data.inventory.clothing) {
            data.inventory.clothing = applyInventoryLocks(data.inventory.clothing, 'clothing');
        }

        // Apply locks to assets
        if (data.inventory.assets) {
            data.inventory.assets = applyInventoryLocks(data.inventory.assets, 'assets');
        }

        // Apply locks to stored items - match by item name
        if (data.inventory.stored && lockedItems.inventory.stored) {
            for (const location in data.inventory.stored) {
                if (Array.isArray(data.inventory.stored[location]) && lockedItems.inventory.stored[location]) {
                    data.inventory.stored[location] = data.inventory.stored[location].map((item) => {
                        const itemName = item?.name || '';
                        if (lockedItems.inventory.stored[location][itemName]) {
                            return { ...item, locked: true };
                        }
                        return item;
                    });
                }
            }
        }
    }

    // Lock individual quests - handle paths like "quests.main" and "quests.optional[0]"
    if (data.quests && lockedItems.quests) {
        // Check if main quest is locked (entire section)
        if (data.quests.main && lockedItems.quests.main === true) {
            data.quests.main = { value: data.quests.main, locked: true };
        }

        // Check individual optional quests
        if (data.quests.optional && Array.isArray(data.quests.optional)) {
            data.quests.optional = data.quests.optional.map((quest, index) => {
                const bracketPath = `optional[${index}]`;
                if (lockedItems.quests[bracketPath]) {
                    return typeof quest === 'string'
                        ? { title: quest, locked: true }
                        : { ...quest, locked: true };
                }
                return quest;
            });
        }
    }

    return JSON.stringify(data, null, 2);
}

/**
 * Apply locks to Info Box tracker
 * @param {Object} data - Parsed info box data
 * @param {Object} lockedItems - Locked items configuration
 * @returns {string} JSON string with locks applied
 */
function applyInfoBoxLocks(data, lockedItems) {
    if (lockedItems.date && data.date) {
        data.date = { ...data.date, locked: true };
    }

    if (lockedItems.weather && data.weather) {
        data.weather = { ...data.weather, locked: true };
    }

    if (lockedItems.temperature && data.temperature) {
        data.temperature = { ...data.temperature, locked: true };
    }

    if (lockedItems.time && data.time) {
        data.time = { ...data.time, locked: true };
    }

    if (lockedItems.location && data.location) {
        data.location = { ...data.location, locked: true };
    }

    if (lockedItems.recentEvents && data.recentEvents) {
        data.recentEvents = { ...data.recentEvents, locked: true };
    }

    return JSON.stringify(data, null, 2);
}

/**
 * Apply locks to Characters tracker
 * @param {Object} data - Parsed characters data
 * @param {Object} lockedItems - Locked items configuration
 * @returns {string} JSON string with locks applied
 */
function applyCharactersLocks(data, lockedItems) {
    // console.log('[RPG Lock Manager] applyCharactersLocks called');
    // console.log('[RPG Lock Manager] Locked items:', JSON.stringify(lockedItems, null, 2));
    // console.log('[RPG Lock Manager] Input data:', JSON.stringify(data, null, 2));

    // Handle both array format and object format
    let characters = Array.isArray(data) ? data : (data.characters || []);

    characters = characters.map((char, index) => {
        const charName = char.name || char.characterName;

        // Check if entire character is locked (index-based)
        if (lockedItems[index] === true) {
            // console.log('[RPG Lock Manager] Locking entire character by index:', index);
            return { ...char, locked: true };
        }

        // Check if character name exists in locked items (could be nested object for field locks or boolean for full lock)
        const charLocks = lockedItems[charName];

        if (charLocks === true) {
            // Entire character is locked
            // console.log('[RPG Lock Manager] Locking entire character:', charName);
            return { ...char, locked: true };
        } else if (charLocks && typeof charLocks === 'object') {
            // Character has field-level locks
            const modifiedChar = { ...char };

            for (const fieldName in charLocks) {
                if (charLocks[fieldName] === true) {
                    // Check both the original field name and snake_case version
                    // (AI returns snake_case, but locks are stored with original configured names)
                    // Use the same conversion as toSnakeCase in thoughts.js
                    const snakeCaseFieldName = fieldName
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '_')
                        .replace(/^_+|_+$/g, '');

                    let locked = false;

                    // Check at root level first (backward compatibility)
                    if (modifiedChar[fieldName] !== undefined) {
                        // console.log('[RPG Lock Manager] Applying lock to field:', `${charName}.${fieldName}`);
                        modifiedChar[fieldName] = {
                            value: modifiedChar[fieldName],
                            locked: true
                        };
                        locked = true;
                    } else if (modifiedChar[snakeCaseFieldName] !== undefined) {
                        // console.log('[RPG Lock Manager] Applying lock to snake_case field:', `${charName}.${snakeCaseFieldName} (from ${fieldName})`);
                        modifiedChar[snakeCaseFieldName] = {
                            value: modifiedChar[snakeCaseFieldName],
                            locked: true
                        };
                        locked = true;
                    }

                    // Check in nested objects (details, relationship, thoughts)
                    if (!locked && modifiedChar.details) {
                        if (modifiedChar.details[fieldName] !== undefined) {
                            // console.log('[RPG Lock Manager] Applying lock to details field:', `${charName}.details.${fieldName}`);
                            if (!modifiedChar.details || typeof modifiedChar.details !== 'object') {
                                modifiedChar.details = {};
                            } else {
                                modifiedChar.details = { ...modifiedChar.details };
                            }
                            modifiedChar.details[fieldName] = {
                                value: modifiedChar.details[fieldName],
                                locked: true
                            };
                            locked = true;
                        } else if (modifiedChar.details[snakeCaseFieldName] !== undefined) {
                            // console.log('[RPG Lock Manager] Applying lock to details snake_case field:', `${charName}.details.${snakeCaseFieldName} (from ${fieldName})`);
                            if (!modifiedChar.details || typeof modifiedChar.details !== 'object') {
                                modifiedChar.details = {};
                            } else {
                                modifiedChar.details = { ...modifiedChar.details };
                            }
                            modifiedChar.details[snakeCaseFieldName] = {
                                value: modifiedChar.details[snakeCaseFieldName],
                                locked: true
                            };
                            locked = true;
                        }
                    }

                    // Check in relationship object
                    if (!locked && modifiedChar.relationship) {
                        if (modifiedChar.relationship[fieldName] !== undefined) {
                            // console.log('[RPG Lock Manager] Applying lock to relationship field:', `${charName}.relationship.${fieldName}`);
                            modifiedChar.relationship = { ...modifiedChar.relationship };
                            modifiedChar.relationship[fieldName] = {
                                value: modifiedChar.relationship[fieldName],
                                locked: true
                            };
                            locked = true;
                        } else if (modifiedChar.relationship[snakeCaseFieldName] !== undefined) {
                            // console.log('[RPG Lock Manager] Applying lock to relationship snake_case field:', `${charName}.relationship.${snakeCaseFieldName} (from ${fieldName})`);
                            modifiedChar.relationship = { ...modifiedChar.relationship };
                            modifiedChar.relationship[snakeCaseFieldName] = {
                                value: modifiedChar.relationship[snakeCaseFieldName],
                                locked: true
                            };
                            locked = true;
                        }
                    }

                    // Check in thoughts object
                    if (!locked && modifiedChar.thoughts) {
                        if (modifiedChar.thoughts[fieldName] !== undefined) {
                            // console.log('[RPG Lock Manager] Applying lock to thoughts field:', `${charName}.thoughts.${fieldName}`);
                            modifiedChar.thoughts = { ...modifiedChar.thoughts };
                            modifiedChar.thoughts[fieldName] = {
                                value: modifiedChar.thoughts[fieldName],
                                locked: true
                            };
                            locked = true;
                        } else if (modifiedChar.thoughts[snakeCaseFieldName] !== undefined) {
                            // console.log('[RPG Lock Manager] Applying lock to thoughts snake_case field:', `${charName}.thoughts.${snakeCaseFieldName} (from ${fieldName})`);
                            modifiedChar.thoughts = { ...modifiedChar.thoughts };
                            modifiedChar.thoughts[snakeCaseFieldName] = {
                                value: modifiedChar.thoughts[snakeCaseFieldName],
                                locked: true
                            };
                            locked = true;
                        }
                    }
                }
            }

            return modifiedChar;
        }

        // No locks for this character
        return char;
    });

    const result = Array.isArray(data)
        ? JSON.stringify(characters, null, 2)
        : JSON.stringify({ ...data, characters }, null, 2);

    // console.log('[RPG Lock Manager] Output data:', result);
    return result;
}

/**
 * Remove locks from tracker data received from AI.
 * Strips "locked": true from all items to clean up the data.
 *
 * @param {string} trackerData - JSON string of tracker data
 * @returns {string} Tracker data with locks removed
 */
export function removeLocks(trackerData) {
    if (!trackerData) return trackerData;

    // Try to parse as JSON
    const parsed = repairJSON(trackerData);
    if (!parsed) {
        // Not JSON format, return as-is
        return trackerData;
    }

    // Recursively remove all "locked" properties
    const cleaned = removeLockedProperties(parsed);

    return JSON.stringify(cleaned, null, 2);
}

/**
 * Recursively remove "locked" properties from an object
 * @param {*} obj - Object to clean
 * @returns {*} Object with locked properties removed
 */
function removeLockedProperties(obj) {
    if (Array.isArray(obj)) {
        return obj.map(item => removeLockedProperties(item));
    } else if (obj !== null && typeof obj === 'object') {
        const cleaned = {};
        for (const key in obj) {
            if (key !== 'locked') {
                cleaned[key] = removeLockedProperties(obj[key]);
            }
        }
        return cleaned;
    }
    return obj;
}

/**
 * Check if a specific item is locked
 * @param {string} trackerType - Type of tracker
 * @param {string} itemPath - Path to the item (e.g., 'stats.Health', 'quests.main.0')
 * @returns {boolean} Whether the item is locked
 */
export function isItemLocked(trackerType, itemPath) {
    const lockedItems = getLockedItemsFromSwipeStore(trackerType);
    if (!lockedItems) return false;

    const parts = itemPath.split('.');
    let current = lockedItems;

    for (const part of parts) {
        if (current[part] === undefined) return false;
        current = current[part];
    }

    return !!current;
}

/**
 * Toggle lock state for a specific item
 * @param {string} trackerType - Type of tracker
 * @param {string} itemPath - Path to the item
 * @param {boolean} locked - New lock state
 */
export function setItemLock(trackerType, itemPath, locked) {
    // Get current locked items from swipeStore
    let lockedItems = getLockedItemsFromSwipeStore(trackerType);;
    
    // Initialize if not exists
    if (!lockedItems) {
        lockedItems = {};
    }

    const parts = itemPath.split('.');
    let current = lockedItems;

    // Navigate to parent of target
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current[part]) {
            current[part] = {};
        }
        current = current[part];
    }

    // Set or remove lock
    const finalKey = parts[parts.length - 1];
    if (locked) {
        current[finalKey] = true;
    } else {
        delete current[finalKey];
    }

    // Save back to swipeStore
    setLockedItemsInSwipeStore(trackerType, lockedItems);

    // console.log('[RPG Lock Manager] Locked items after set:', JSON.stringify(lockedItems, null, 2));
}

/**
 * Restore locked content that was removed or modified by the AI.
 * Compares new data with previous data and restores locked items that are missing or have zero values.
 *
 * @param {string} trackerData - JSON string of tracker data from AI (with locks removed)
 * @param {string} previousData - JSON string of previous tracker data (with locks still applied)
 * @param {string} trackerType - Type of tracker ('userStats', 'infoBox', 'characters')
 * @returns {string} Tracker data with locked content restored
 */
export function restoreLockedContent(trackerData, previousData, trackerType) {
    if (!trackerData || !previousData) {
        console.log('[RPG Lock Manager] restoreLockedContent: Missing data, skipping restoration');
        return trackerData;
    }

    // Try to parse both as JSON
    const parsedNew = repairJSON(trackerData);
    const parsedPrev = repairJSON(previousData);
    
    if (!parsedNew) {
        console.warn('[RPG Lock Manager] New data not valid JSON, cannot restore locked content');
        return trackerData;
    }
    
    if (!parsedPrev) {
        console.warn('[RPG Lock Manager] Previous data not valid JSON, cannot restore locked content');
        return trackerData;
    }

    // Get locked items from swipeStore
    const lockedItems = getLockedItemsFromSwipeStore(trackerType);
    console.log('[RPG Lock Manager] Locked Items:', lockedItems);

    // Apply restoration based on tracker type
    let result;
    switch (trackerType) {
        case 'userStats':
            result = restoreUserStats(parsedNew, parsedPrev, lockedItems);
            break;
        case 'infoBox':
            result = restoreInfoBox(parsedNew, parsedPrev, lockedItems);
            break;
        case 'characters':
            result = restoreCharacters(parsedNew, parsedPrev, lockedItems);
            break;
        default:
            result = parsedNew;
    }

    const resultString = JSON.stringify(result, null, 2);
    
    return resultString;
}

/**
 * Restore locked content for User Stats tracker
 * @param {Object} newData - Parsed new data from AI
 * @param {Object} prevData - Parsed previous data
 * @param {Object} lockedItems - Locked items configuration
 * @returns {Object} Data with locked content restored
 */
function restoreUserStats(newData, prevData, lockedItems) {
    // console.log('[RPG Lock Manager] === restoreUserStats START ===');
    // console.log('[RPG Lock Manager] New Data:', newData,);
    // console.log('[RPG Lock Manager] Previous Data:', prevData);
    // console.log('[RPG Lock Manager] Locked Items:', lockedItems);
    
    const result = { ...newData };
    
    // Restore locked stats
    if (lockedItems.stats && lockedItems.stats === true && prevData.stats) {
        // console.log('[RPG Lock Manager] Restoring all stats (section locked)');
        // Lock entire stats section - restore all stats
        if (!result.stats) {
            result.stats = [];
        }
        
        // Merge stats from previous data
        const existingIds = result.stats.map(s => s.id);
        for (const prevStat of prevData.stats) {
            if (!existingIds.includes(prevStat.id)) {
                console.warn('[RPG Lock Manager] Stat missing, restoring:', prevStat.id);
                // Stat is missing, add it from previous data
                result.stats.push({ ...prevStat });
            } else {
                // Copy old value for locked stats to ensure they are preserved even if AI modified them
                const newStatIndex = result.stats.findIndex(s => s.id === prevStat.id);
                result.stats[newStatIndex] = { ...prevStat };
            }
        }
    }
    
    // Restore locked status
    if (lockedItems.status && prevData.status) {
        // console.log('[RPG Lock Manager] Restoring status fields');
        if (!result.status) {
            // console.log('[RPG Lock Manager] Status is missing, restoring from previous');
            result.status = { ...prevData.status };
        } else {
            // Check if status fields are missing or have empty values
            const statusFields = Object.keys(lockedItems.status);
            for (const field of statusFields) {
                if (lockedItems.status[field] && prevData.status[field] !== undefined) {
                    result.status[field] = prevData.status[field];
                }
            }
        }
    }
    
    // Restore locked skills
    if (lockedItems.skills && prevData.skills && Array.isArray(prevData.skills)) {
        // console.log('[RPG Lock Manager] Restoring skills');
        if (!result.skills) {
            result.skills = [];
        }
        
        // Check each locked skill
        for (const skillName in lockedItems.skills) {
            if (lockedItems.skills[skillName]) {
                // console.log('[RPG Lock Manager] Checking skill:', skillName);
                const newSkillIndex = result.skills.findIndex(s => 
                    typeof s === 'string' ? s === skillName : s.name === skillName
                );
                const prevSkillIndex = prevData.skills.findIndex(s => 
                    typeof s === 'string' ? s === skillName : s.name === skillName
                );
                
                if (prevSkillIndex !== -1) {
                    if (newSkillIndex === -1) {
                        console.log('[RPG Lock Manager] Skill', skillName, 'is missing, restoring from previous');
                        // Skill is missing, add it from previous data
                        result.skills.push(prevData.skills[prevSkillIndex]);
                    }
                    else{
                        // Skill exists, but we should also restore its value in case AI modified it
                        if (typeof prevData.skills[prevSkillIndex] === 'object' && typeof result.skills[newSkillIndex] === 'object') {
                            result.skills[newSkillIndex] = { ...prevData.skills[prevSkillIndex] };
                        }
                    }
                }
            }
        }
    }
    
    // Restore locked inventory items
    if (lockedItems.inventory && prevData.inventory) {
        console.log('[RPG Lock Manager] Restoring inventory');
        const restoreInventoryCategory = (category) => {
            if (!result.inventory) {
                result.inventory = {};
            }
            if (!result.inventory[category]) {
                result.inventory[category] = [];
            }
            
            const lockedCategory = lockedItems.inventory[category];
            const prevCategory = prevData.inventory[category];
            
            if (lockedCategory && prevCategory && Array.isArray(prevCategory)) {
                for (const itemName in lockedCategory) {
                    if (lockedCategory[itemName]) {
                        // console.log('[RPG Lock Manager] Checking inventory item:', itemName, 'in category:', category);
                        // Find item in new data by name
                        const newItemIndex = result.inventory[category].findIndex(item => {
                            const name = typeof item === 'string' ? item : (item.item || item.name || '');
                            return name === itemName;
                        });
                        
                        const prevItemIndex = prevCategory.findIndex(item => {
                            const name = typeof item === 'string' ? item : (item.item || item.name || '');
                            return name === itemName;
                        });
                        
                        if (prevItemIndex !== -1) {
                            if (newItemIndex === -1) {
                                console.log('[RPG Lock Manager] Inventory item', itemName, 'is missing, restoring from previous');
                                // Item is missing, add it from previous data
                                result.inventory[category].push(prevCategory[prevItemIndex]);
                            }
                        }
                    }
                }
            }
        };
        
        restoreInventoryCategory('onPerson');
        restoreInventoryCategory('clothing');
        restoreInventoryCategory('assets');
        
        // Restore stored items
        if (result.inventory.stored && prevData.inventory.stored) {
            for (const location in lockedItems.inventory.stored) {
                if (lockedItems.inventory.stored[location]) {
                    // console.log('[RPG Lock Manager] Restoring stored items at location:', location);
                    if (!result.inventory.stored[location]) {
                        result.inventory.stored[location] = [];
                    }
                    
                    const lockedLocation = lockedItems.inventory.stored[location];
                    const prevLocation = prevData.inventory.stored[location];
                    
                    if (lockedLocation && prevLocation && Array.isArray(prevLocation)) {
                        for (const itemName in lockedLocation) {
                            if (lockedLocation[itemName]) {
                                // console.log('[RPG Lock Manager] Checking stored item:', itemName, 'at location:', location);
                                const newItemIndex = result.inventory.stored[location].findIndex(item => {
                                    const name = typeof item === 'string' ? item : (item.item || item.name || '');
                                    return name === itemName;
                                });
                                
                                const prevItemIndex = prevLocation.findIndex(item => {
                                    const name = typeof item === 'string' ? item : (item.item || item.name || '');
                                    return name === itemName;
                                });
                                
                                if (prevItemIndex !== -1 && newItemIndex === -1) {
                                    // console.log('[RPG Lock Manager] Stored item', itemName, 'is missing, restoring from previous');
                                    result.inventory.stored[location].push(prevLocation[prevItemIndex]);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Restore locked quests
    if (lockedItems.quests && prevData.quests) {
        console.log('[RPG Lock Manager] Restoring quests');
        // Restore main quest
        if (lockedItems.quests.main && prevData.quests.main) {
            if (!result.quests) {
                result.quests = {};
            }
            if (prevData.quests.main) {
                console.log('[RPG Lock Manager] Main quest has changed, restoring from previous');
                result.quests.main = prevData.quests.main;
            }
        }
        
        // Restore optional quests
        if (lockedItems.quests.optional && Array.isArray(prevData.quests.optional)) {
            if (!result.quests) {
                result.quests = {};
            }
            if (!result.quests.optional) {
                result.quests.optional = [];
            }
            
            // Check each locked optional quest
            for (const key in lockedItems.quests) {
                if (key.startsWith('optional[') && lockedItems.quests[key]) {
                    const indexMatch = key.match(/optional\[(\d+)\]/);
                    if (indexMatch) {
                        const index = parseInt(indexMatch[1], 10);
                        if (index < prevData.quests.optional.length) {
                            const prevQuest = prevData.quests.optional[index];
                            console.log('[RPG Lock Manager] Checking optional quest at index:', index, 'quest:', prevQuest);
                            
                            // If index exists in result, overwrite with previous data (like stats/skills do)
                            if (index < result.quests.optional.length) {
                                console.log('[RPG Lock Manager] Optional quest at index', index, 'exists but may be modified, restoring from previous');
                                result.quests.optional[index] = { ...prevQuest };
                            } else {
                                // Index is missing or at the end, append it
                                console.log('[RPG Lock Manager] Optional quest at index', index, 'is missing, appending from previous');
                                result.quests.optional.push(prevQuest);
                            }
                        }
                    }
                }
            }
        }
    }
    
    // console.log('[RPG Lock Manager] === restoreUserStats END ===');
    // console.log('[RPG Lock Manager] Result:', result);
    
    return result;
}

/**
 * Restore locked content for Info Box tracker
 * @param {Object} newData - Parsed new data from AI
 * @param {Object} prevData - Parsed previous data
 * @param {Object} lockedItems - Locked items configuration
 * @returns {Object} Data with locked content restored
 */
function restoreInfoBox(newData, prevData, lockedItems) {
    // console.log('[RPG Lock Manager] === restoreInfoBox START ===');
    // console.log('[RPG Lock Manager] New Data:', newData);
    // console.log('[RPG Lock Manager] Previous Data:', prevData);
    // console.log('[RPG Lock Manager] Locked Items:', lockedItems);

    const result = { ...newData };
    
    // Restore locked fields
    const fields = ['date', 'weather', 'temperature', 'time', 'location', 'recentEvents'];
    for (const field of fields) {
        if (lockedItems[field] && prevData[field]) {
            console.log('[RPG Lock Manager] Restoring info box field:', field);
            result[field] = { ...prevData[field] };
        }
    }
    
    // console.log('[RPG Lock Manager] === restoreInfoBox END ===');
    // console.log('[RPG Lock Manager] Result:', result,);
    
    return result;
}

/**
 * Restore locked content for Characters tracker
 * @param {Object} newData - Parsed new data from AI
 * @param {Object} prevData - Parsed previous data
 * @param {Object} lockedItems - Locked items configuration
 * @returns {Object} Data with locked content restored
 */
function restoreCharacters(newData, prevData, lockedItems) {
    // console.log('[RPG Lock Manager] === restoreCharacters START ===');
    // console.log('[RPG Lock Manager] New Data:', newData);
    // console.log('[RPG Lock Manager] Previous Data:', prevData);
    // console.log('[RPG Lock Manager] Locked Items:', lockedItems);

    // Handle both array format and object format
    let charactersNew = Array.isArray(newData) ? newData : (newData.characters || []);
    let charactersPrev = Array.isArray(prevData) ? prevData : (prevData.characters || []);
    
    console.log('[RPG Lock Manager] New characters count:', charactersNew.length);
    console.log('[RPG Lock Manager] Previous characters count:', charactersPrev.length);
    
    // Build map of locked characters by name
    const lockedCharNames = new Set();
    for (const key in lockedItems) {
        if (lockedItems[key] === true || (typeof lockedItems[key] === 'object' && Object.keys(lockedItems[key]).length > 0)) {
            lockedCharNames.add(key);
        }
    }
    console.log('[RPG Lock Manager] Locked character names:', Array.from(lockedCharNames));
    
    // Restore missing characters
    for (const prevChar of charactersPrev) {
        const charName = prevChar.name || prevChar.characterName;
        
        if (!charactersNew.some(c => (c.name || c.characterName) === charName)) {
            console.log('[RPG Lock Manager] Character', charName, 'is missing, restoring from previous');
            // Character is missing, add it from previous data
            charactersNew.push({ ...prevChar });
        }
    }
    
    // Restore locked fields for existing characters
    charactersNew = charactersNew.map(char => {
        const charName = char.name || char.characterName;
        const charLocks = lockedItems[charName];
        
        if (!charLocks) {
            return char;
        }
        
        const resultChar = { ...char };
        
        // console.log('[RPG Lock Manager] Processing character:', charName);

        const prevChar = charactersPrev.find(c => (c.name || c.characterName) === charName);
        if(!prevChar){
            console.warn('[RPG Lock Manager] Previous character data not found for:', charName, 'cannot restore locked fields');
            return resultChar;
        }
        
        // Check if entire character is locked
        if (charLocks === true) {
            // console.log('[RPG Lock Manager] Character', charName, 'is fully locked, restoring all fields from previous');
            return { ...prevChar };
        }
        
        // Check field-level locks
        for (const fieldName in charLocks) {
            if (charLocks[fieldName] === true) {
                // console.log('[RPG Lock Manager] Restoring locked field:', fieldName, 'for character:', charName);
                
                // Full restore - overwrite with previous value from any location
                if (prevChar[fieldName] !== undefined) {
                    resultChar[fieldName] = prevChar[fieldName];
                } else if (prevChar.details && prevChar.details[fieldName] !== undefined) {
                    resultChar.details[fieldName] = prevChar.details[fieldName];
                } else if (prevChar.relationship && prevChar.relationship[fieldName] !== undefined) {
                    resultChar.relationship[fieldName] = prevChar.relationship[fieldName];
                } else if (prevChar.thoughts && prevChar.thoughts[fieldName] !== undefined) {
                    resultChar.thoughts[fieldName] = prevChar.thoughts[fieldName];
                }
            }
        }
        
        return resultChar;
    });
    
    const result = Array.isArray(newData)
        ? charactersNew
        : { ...newData, characters: charactersNew };
    
    // console.log('[RPG Lock Manager] === restoreCharacters END ===');
    // console.log('[RPG Lock Manager] Result:', result);
    
    return result;
}

/**
 * Remove lock entries for a specific inventory item
 * @param {string} trackerType - Type of tracker ('userStats')
 * @param {string} field - Field name ('onPerson', 'stored', 'assets')
 * @param {string} itemName - Name of the item to unlock
 * @param {string} [location] - Location name (required for 'stored' field)
 */
export function removeInventoryItemLock(trackerType, field, itemName, location) {
    // Get current locked items from swipeStore
    let lockedItems = getLockedItemsFromSwipeStore(trackerType);
    
    // Check if inventory locks exist
    if (!lockedItems || !lockedItems.inventory) {
        return;
    }
    
    // Remove lock based on field type
    if (field === 'onPerson') {
        if (lockedItems.inventory.onPerson && lockedItems.inventory.onPerson[itemName]) {
            delete lockedItems.inventory.onPerson[itemName];
            console.log('[RPG Lock Manager] Removed lock for onPerson item:', itemName);
        }
    } else if (field === 'assets') {
        if (lockedItems.inventory.assets && lockedItems.inventory.assets[itemName]) {
            delete lockedItems.inventory.assets[itemName];
            console.log('[RPG Lock Manager] Removed lock for assets item:', itemName);
        }
    } else if (field === 'stored' && location) {
        if (lockedItems.inventory.stored && lockedItems.inventory.stored[location] && lockedItems.inventory.stored[location][itemName]) {
            delete lockedItems.inventory.stored[location][itemName];
            console.log('[RPG Lock Manager] Removed lock for stored item:', itemName, 'at location:', location);
        }
    }
    
    // Save updated locks back to swipeStore
    setLockedItemsInSwipeStore(trackerType, lockedItems);
}