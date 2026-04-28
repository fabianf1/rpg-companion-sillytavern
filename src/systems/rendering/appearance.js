/**
 * Appearance Rendering Module
 * Handles UI rendering for user appearance (clothing, hair, scent, posture, physical features)
 * TODO: Handle quantity for accessories (e.g. "2 rings")
 */

import { extensionSettings, $appearanceContainer } from '../../core/state.js';
import { saveSettings, updateMessageSwipeData } from '../../core/persistence.js';
import { getTrackerDataForContext } from '../generation/promptBuilder.js';
import { isItemLocked, setItemLock } from '../generation/lockManager.js';
import { i18n } from '../../core/i18n.js';

/**
 * Helper to generate lock icon HTML if setting is enabled
 * @param {string} tracker - Tracker name
 * @param {string} path - Item path
 * @returns {string} Lock icon HTML or empty string
 */
function getLockIconHtml(tracker, path) {
    const showLockIcons = extensionSettings.showLockIcons ?? true;
    if (!showLockIcons) return '';

    const isLocked = isItemLocked(tracker, path);
    const lockIcon = isLocked ? '🔒' : '🔓';
    const lockTitle = isLocked ? 'Locked' : 'Unlocked';
    const lockedClass = isLocked ? ' locked' : '';
    return `<span class="rpg-section-lock-icon${lockedClass}" data-tracker="${tracker}" data-path="${path}" title="${lockTitle}">${lockIcon}</span>`;
}

/**
 * HTML escape helper
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Helper to render item cards for array-based appearance fields
 * @param {Array} items - Array of items (objects with name property)
 * @param {string} field - Field name (clothing, accessories, physicalFeatures)
 * @param {string} emptyMessage - Message to display when empty
 * @param {string} viewMode - View mode (list or grid)
 * @returns {string} HTML for items
 */
function renderAppearanceItems(items, field, emptyMessage, viewMode = 'list') {
    if (!Array.isArray(items) || items.length === 0) {
        return `<div class="rpg-inventory-empty">${emptyMessage}</div>`;
    }

    const listViewClass = viewMode === 'list' ? 'rpg-item-list-view' : 'rpg-item-grid-view';
    const itemsHtml = items.map((item, index) => {
        // Support both object format {name: "Item"} and legacy string format
        const itemName = typeof item === 'object' ? (item.name || '') : item;
        const itemQuantity = typeof item === 'object' ? item.quantity : null;
        
        const lockIconHtml = getLockIconHtml('userStats', `appearance.${field}.${index}`);

        if (viewMode === 'grid') {
            // Grid view: card-style items
            return `
            <div class="rpg-item-card" data-field="${field}" data-index="${index}">
                ${lockIconHtml}
                <button class="rpg-appearance-item-remove" data-action="remove-item" data-field="${field}" data-index="${index}" title="Remove item">
                    <i class="fa-solid fa-times"></i>
                </button>
                <span class="rpg-appearance-item-name rpg-editable" contenteditable="true" data-field="${field}" data-index="${index}" title="Click to edit">${escapeHtml(itemName)}</span>
            </div>
            `;
        } else {
            // List view: full-width rows
            return `
            <div class="rpg-item-row" data-field="${field}" data-index="${index}">
                ${lockIconHtml}
                <span class="rpg-appearance-item-name rpg-editable" contenteditable="true" data-field="${field}" data-index="${index}" title="Click to edit">${escapeHtml(itemName)}</span>
                <button class="rpg-appearance-item-remove" data-action="remove-item" data-field="${field}" data-index="${index}" title="Remove item">
                    <i class="fa-solid fa-times"></i>
                </button>
            </div>
            `;
        }
    }).join('');

    return `<div class="rpg-item-list ${listViewClass}">${itemsHtml}</div>`;
}

/**
 * Renders the appearance section with all appearance fields using inventory-style patterns
 * @returns {string} HTML for appearance section
 */
export function renderAppearance() {
    if (!$appearanceContainer) {
        console.warn('[RPG Companion] Container not found. Skipping render.');
        return;
    }

    // Check if tracker data exists (from swipe store or extensionSettings)
    const trackerData = getTrackerDataForContext('userStats');
    
    if (!trackerData || !trackerData.appearance) {
        $appearanceContainer.html('<div class="rpg-inventory-empty">No appearance generated yet</div>');
        return;
    }
    const appearanceData = trackerData.appearance;

    // Extract appearance fields with defaults
    const hair = appearanceData.hair || '';
    const scent = appearanceData.scent || '';
    const posture = appearanceData.posture || '';
    const demeanor = appearanceData.demeanor || '';
    const clothing = Array.isArray(appearanceData.clothing) ? appearanceData.clothing : [];
    const accessories = Array.isArray(appearanceData.accessories) ? appearanceData.accessories : [];
    const physicalFeatures = Array.isArray(appearanceData.physicalFeatures) ? appearanceData.physicalFeatures : [];

    // Get view modes from settings (default to 'list')
    const viewModes = extensionSettings.appearanceViewModes || {
        clothing: 'list',
        accessories: 'list',
        physicalFeatures: 'list'
    };

    // Generate items HTML for each section
    const clothingItemsHtml = renderAppearanceItems(clothing, 'clothing', 'Not wearing anything', viewModes.clothing);
    const accessoriesItemsHtml = renderAppearanceItems(accessories, 'accessories', 'No accessories', viewModes.accessories);
    const physicalFeaturesItemsHtml = renderAppearanceItems(physicalFeatures, 'physicalFeatures', 'No physical features described', viewModes.physicalFeatures);

    const contentHtml = `
        <div class="rpg-inventory-container">
            <div class="rpg-inventory-views">
                <!-- Hair Field -->
                <div class="rpg-inventory-section">
                    <div class="rpg-inventory-header">
                        <h4 data-i18n-key="appearance.hair">Hair</h4>
                    </div>
                    <div class="rpg-inventory-content">
                        <div class="rpg-appearance-textarea-container">
                            <span class="rpg-appearance-input rpg-editable" contenteditable="true" data-field="hair" data-tracker="userStats" data-path="appearance.hair" placeholder="Describe the hair..." title="Click to edit">${escapeHtml(hair)}</span>
                            ${getLockIconHtml('userStats', 'appearance.hair')}
                        </div>
                    </div>
                </div>

                <!-- Scent Field -->
                <div class="rpg-inventory-section">
                    <div class="rpg-inventory-header">
                        <h4 data-i18n-key="appearance.scent">Scent</h4>
                    </div>
                    <div class="rpg-inventory-content">
                        <div class="rpg-appearance-textarea-container">
                            <span class="rpg-appearance-input rpg-editable" contenteditable="true" data-field="scent" data-tracker="userStats" data-path="appearance.scent" placeholder="Describe the scent..." title="Click to edit">${escapeHtml(scent)}</span>
                            ${getLockIconHtml('userStats', 'appearance.scent')}
                        </div>
                    </div>
                </div>

                <!-- Posture Field -->
                <div class="rpg-inventory-section">
                    <div class="rpg-inventory-header">
                        <h4 data-i18n-key="appearance.posture">Posture</h4>
                    </div>
                    <div class="rpg-inventory-content">
                        <div class="rpg-appearance-textarea-container">
                            <span class="rpg-appearance-input rpg-editable" contenteditable="true" data-field="posture" data-tracker="userStats" data-path="appearance.posture" placeholder="Describe the posture..." title="Click to edit">${escapeHtml(posture)}</span>
                            ${getLockIconHtml('userStats', 'appearance.posture')}
                        </div>
                    </div>
                </div>

                <!-- Demeanor Field -->
                <div class="rpg-inventory-section">
                    <div class="rpg-inventory-header">
                        <h4 data-i18n-key="appearance.demeanor">Demeanor</h4>
                    </div>
                    <div class="rpg-inventory-content">
                        <div class="rpg-appearance-textarea-container">
                            <span class="rpg-appearance-input rpg-editable" contenteditable="true" data-field="demeanor" data-tracker="userStats" data-path="appearance.demeanor" placeholder="Describe the demeanor/expression..." title="Click to edit">${escapeHtml(demeanor)}</span>
                            ${getLockIconHtml('userStats', 'appearance.demeanor')}
                        </div>
                    </div>
                </div>

                <!-- Clothing Section -->
                <div class="rpg-inventory-section" data-section="clothing">
                    <div class="rpg-inventory-header">
                        <h4 data-i18n-key="inventory.section.clothing">Clothing</h4>
                        <div class="rpg-inventory-header-actions">
                            <div class="rpg-view-toggle">
                                <button class="rpg-view-btn ${viewModes.clothing === 'list' ? 'active' : ''}" data-action="switch-view" data-field="clothing" data-view="list" title="List view">
                                    <i class="fa-solid fa-list"></i>
                                </button>
                                <button class="rpg-view-btn ${viewModes.clothing === 'grid' ? 'active' : ''}" data-action="switch-view" data-field="clothing" data-view="grid" title="Grid view">
                                    <i class="fa-solid fa-th"></i>
                                </button>
                            </div>
                            <button class="rpg-appearance-add-btn" data-action="add-item" data-field="clothing" title="Add clothing item">
                                <i class="fa-solid fa-plus"></i> Add Item
                            </button>
                        </div>
                    </div>
                    <div class="rpg-inventory-content">
                        ${clothingItemsHtml}
                    </div>
                </div>

                <!-- Accessories Section -->
                <div class="rpg-inventory-section" data-section="accessories">
                    <div class="rpg-inventory-header">
                        <h4 data-i18n-key="appearance.accessories">Accessories</h4>
                        <div class="rpg-inventory-header-actions">
                            <div class="rpg-view-toggle">
                                <button class="rpg-view-btn ${viewModes.accessories === 'list' ? 'active' : ''}" data-action="switch-view" data-field="accessories" data-view="list" title="List view">
                                    <i class="fa-solid fa-list"></i>
                                </button>
                                <button class="rpg-view-btn ${viewModes.accessories === 'grid' ? 'active' : ''}" data-action="switch-view" data-field="accessories" data-view="grid" title="Grid view">
                                    <i class="fa-solid fa-th"></i>
                                </button>
                            </div>
                            <button class="rpg-appearance-add-btn" data-action="add-item" data-field="accessories" title="Add accessory">
                                <i class="fa-solid fa-plus"></i> Add Item
                            </button>
                        </div>
                    </div>
                    <div class="rpg-inventory-content">
                        ${accessoriesItemsHtml}
                    </div>
                </div>

                <!-- Physical Features Section -->
                <div class="rpg-inventory-section" data-section="physicalFeatures">
                    <div class="rpg-inventory-header">
                        <h4 data-i18n-key="appearance.physicalFeatures">Physical Features</h4>
                        <div class="rpg-inventory-header-actions">
                            <div class="rpg-view-toggle">
                                <button class="rpg-view-btn ${viewModes.physicalFeatures === 'list' ? 'active' : ''}" data-action="switch-view" data-field="physicalFeatures" data-view="list" title="List view">
                                    <i class="fa-solid fa-list"></i>
                                </button>
                                <button class="rpg-view-btn ${viewModes.physicalFeatures === 'grid' ? 'active' : ''}" data-action="switch-view" data-field="physicalFeatures" data-view="grid" title="Grid view">
                                    <i class="fa-solid fa-th"></i>
                                </button>
                            </div>
                            <button class="rpg-appearance-add-btn" data-action="add-item" data-field="physicalFeatures" title="Add physical feature">
                                <i class="fa-solid fa-plus"></i> Add Item
                            </button>
                        </div>
                    </div>
                    <div class="rpg-inventory-content">
                        ${physicalFeaturesItemsHtml}
                    </div>
                </div>
            </div>
        </div>
    `;
    // Render and add event handlers
    $appearanceContainer.html(contentHtml);
    setupAppearanceEventHandlers();
}

/**
 * Sets up event handlers for appearance UI elements
 */
function setupAppearanceEventHandlers() {
    const $container = $appearanceContainer;
    if ($container.length === 0) return;

    // Handle lock/unlock icon clicks
    $container.off('click', '.rpg-section-lock-icon').on('click', '.rpg-section-lock-icon', function(e) {
        e.stopPropagation();
        const tracker = $(this).data('tracker');
        const path = $(this).data('path');
        setItemLock(tracker, path);
        renderAppearance();
    });

    // Handle view mode toggle
    $container.off('click', '.rpg-view-btn').on('click', '.rpg-view-btn', function(e) {
        e.stopPropagation();
        const field = $(this).data('field');
        const viewMode = $(this).data('view');

        // Update settings
        if (!extensionSettings.appearanceViewModes) {
            extensionSettings.appearanceViewModes = {};
        }
        extensionSettings.appearanceViewModes[field] = viewMode;
        saveSettings();

        // Update display
        renderAppearance();
    });

    // Handle add item button clicks
    $container.off('click', '.rpg-appearance-add-btn').on('click', '.rpg-appearance-add-btn', function(e) {
        e.stopPropagation();
        const field = $(this).data('field');

        // Get current tracker data
        const trackerData = getTrackerDataForContext('userStats') || {};
        const currentItems = Array.isArray(trackerData.appearance?.[field]) ? [...trackerData.appearance[field]] : [];

        // Add new empty item object
        if (field === 'accessories') {
            currentItems.push({name: '', quantity: 1});
        } else {
            currentItems.push({name: ''});
        }

        // Update swipe store
        const updatedData = {
            ...trackerData,
            appearance: {
                ...trackerData.appearance,
                [field]: currentItems
            }
        };
        updateMessageSwipeData('userStats', updatedData);

        // Update display
        renderAppearance();
    });

    // Handle remove item button clicks
    $container.off('click', '.rpg-appearance-item-remove').on('click', '.rpg-appearance-item-remove', function(e) {
        e.stopPropagation();
        const field = $(this).data('field');
        const index = parseInt($(this).data('index'));

        console.log(`[RPG Companion] Remove item - field: ${field}, index: ${index}`);

        // Get current tracker data
        const trackerData = getTrackerDataForContext('userStats') || {};
        const currentItems = Array.isArray(trackerData.appearance?.[field]) ? [...trackerData.appearance[field]] : [];

        // Remove item
        currentItems.splice(index, 1);

        // Update swipe store
        const updatedData = {
            ...trackerData,
            appearance: {
                ...trackerData.appearance,
                [field]: currentItems
            }
        };
        updateMessageSwipeData('userStats', updatedData);

        // Update display
        renderAppearance();
    });

    // Handle text field changes (hair, scent, posture, demeanor) - save on blur only
    $container.off('blur', '.rpg-appearance-input').on('blur', '.rpg-appearance-input', function(e) {
        const field = $(this).data('field');
        const value = $(this).text().trim();

        console.log(`[RPG Companion] Text field changed - field: ${field}, value: ${value}`);
        
        // Get current tracker data
        const trackerData = getTrackerDataForContext('userStats') || {};
        
        // Update text field in appearance object
        const updatedData = {
            ...trackerData,
            appearance: {
                ...trackerData.appearance,
                [field]: value
            }
        };

        console.log('[RPG Companion] Updated appearance data:', updatedData);
        // Update swipe store
        updateMessageSwipeData('userStats', updatedData);
    });

    // Handle array item name changes (clothing, accessories, physicalFeatures)
    $container.off('input', '.rpg-appearance-item-name').on('input', '.rpg-appearance-item-name', function(e) {
        const field = $(this).data('field');
        const index = parseInt($(this).data('index'));
        const value = $(this).text().trim();

        console.log(`[RPG Companion] Item name changed - field: ${field}, index: ${index}, value: ${value}`);
        
        // Get current tracker data
        const trackerData = getTrackerDataForContext('userStats') || {};
        const currentItems = Array.isArray(trackerData.appearance?.[field]) ? [...trackerData.appearance[field]] : [];
        
        // Update item name
        if (currentItems[index]) {
            if (typeof currentItems[index] === 'object') {
                currentItems[index] = { ...currentItems[index], name: value };
            } else {
                currentItems[index] = value;
            }
        }

        const updatedData = {
            ...trackerData,
            appearance: {
                ...trackerData.appearance,
                [field]: currentItems
            }
        };

        console.log('[RPG Companion] Updated appearance data:', updatedData);
        // Update swipe store
        updateMessageSwipeData('userStats', updatedData);
    });
}

/**
 * Initializes the appearance section
 */
export function initAppearance() {
    // Check if appearance container exists
    if (!$appearanceContainer || $appearanceContainer.length === 0) return;

    // Initial render
    renderAppearance();

    // Setup event handlers
    setupAppearanceEventHandlers();
}
