/**
 * Inventory Rendering Module
 * Handles UI rendering for inventory v2 system
 */

import { extensionSettings, $inventoryContainer } from '../../core/state.js';
import { saveSettings } from '../../core/persistence.js';
import { getInventoryRenderOptions, restoreFormStates } from '../interaction/inventoryActions.js';
import { updateInventoryItem } from '../interaction/inventoryEdit.js';
// parseItems is no longer imported - arrays are used directly
import { isItemLocked, setItemLock } from '../generation/lockManager.js';
import { getTrackerDataForContext } from '../generation/promptBuilder.js';

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
 * Converts a location name to a safe ID for use in HTML element IDs.
 * Must match the logic used in inventoryActions.js.
 * @param {string} locationName - The location name
 * @returns {string} Safe ID string
 */
export function getLocationId(locationName) {
    // Remove all non-alphanumeric characters except spaces, then replace spaces with hyphens
    return locationName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-');
}

/**
 * Renders the inventory sub-tab navigation (On Person, Clothing, Stored, Assets)
 * @param {string} activeTab - Currently active sub-tab ('onPerson', 'clothing', 'stored', 'assets')
 * @returns {string} HTML for sub-tab navigation
 */
export function renderInventorySubTabs(activeTab = 'onPerson') {
    return `
        <div class="rpg-inventory-subtabs">
            <button class="rpg-inventory-subtab ${activeTab === 'onPerson' ? 'active' : ''}" data-tab="onPerson">
                On Person
            </button>
            <button class="rpg-inventory-subtab ${activeTab === 'clothing' ? 'active' : ''}" data-tab="clothing">
                Clothing
            </button>
            <button class="rpg-inventory-subtab ${activeTab === 'stored' ? 'active' : ''}" data-tab="stored">
                Stored
            </button>
            <button class="rpg-inventory-subtab ${activeTab === 'assets' ? 'active' : ''}" data-tab="assets">
                Assets
            </button>
        </div>
    `;
}

/**
 * Renders the "On Person" inventory view with list or grid display
 * @param {Array<{name: string, quantity?: number}>} onPersonItems - Current on-person items as array of objects
 * @param {string} viewMode - View mode ('list' or 'grid')
 * @returns {string} HTML for on-person view with items and add button
 */
export function renderOnPersonView(onPersonItems, viewMode = 'list') {
    // Convert array to display strings for UI
    const displayItems = Array.isArray(onPersonItems) 
        ? onPersonItems.map(item => typeof item === 'object' ? item.name : item)
        : [];

    let itemsHtml = '';
    if (displayItems.length === 0) {
        itemsHtml = '<div class="rpg-inventory-empty">No items carried</div>';
    } else {
        if (viewMode === 'grid') {
            // Grid view: card-style items
            itemsHtml = displayItems.map((item, index) => {
                const originalItem = Array.isArray(onPersonItems) ? onPersonItems[index] : null;
                const lockIconHtml = getLockIconHtml('userStats', `inventory.onPerson.${originalItem && typeof originalItem === 'object' ? originalItem.name : item}`);
                return `
                <div class="rpg-item-card" data-field="onPerson" data-index="${index}">
                    ${lockIconHtml}
                    <button class="rpg-item-remove" data-action="remove-item" data-field="onPerson" data-index="${index}" title="Remove item">
                        <i class="fa-solid fa-times"></i>
                    </button>
                    <span class="rpg-item-name rpg-editable" contenteditable="true" data-field="onPerson" data-index="${index}" title="Click to edit">${escapeHtml(item)}</span>
                </div>
            `}).join('');
        } else {
            // List view: full-width rows
            itemsHtml = displayItems.map((item, index) => {
                const originalItem = Array.isArray(onPersonItems) ? onPersonItems[index] : null;
                const lockIconHtml = getLockIconHtml('userStats', `inventory.onPerson.${originalItem && typeof originalItem === 'object' ? originalItem.name : item}`);
                return `
                <div class="rpg-item-row" data-field="onPerson" data-index="${index}">
                    ${lockIconHtml}
                    <span class="rpg-item-name rpg-editable" contenteditable="true" data-field="onPerson" data-index="${index}" title="Click to edit">${escapeHtml(item)}</span>
                    <button class="rpg-item-remove" data-action="remove-item" data-field="onPerson" data-index="${index}" title="Remove item">
                        <i class="fa-solid fa-times"></i>
                    </button>
                </div>
            `}).join('');
        }
    }

    const listViewClass = viewMode === 'list' ? 'rpg-item-list-view' : 'rpg-item-grid-view';

    return `
        <div class="rpg-inventory-section" data-section="onPerson">
            <div class="rpg-inventory-header">
                <h4>Items Currently Carried</h4>
                <div class="rpg-inventory-header-actions">
                    <div class="rpg-view-toggle">
                        <button class="rpg-view-btn ${viewMode === 'list' ? 'active' : ''}" data-action="switch-view" data-field="onPerson" data-view="list" title="List view">
                            <i class="fa-solid fa-list"></i>
                        </button>
                        <button class="rpg-view-btn ${viewMode === 'grid' ? 'active' : ''}" data-action="switch-view" data-field="onPerson" data-view="grid" title="Grid view">
                            <i class="fa-solid fa-th"></i>
                        </button>
                    </div>
                    <button class="rpg-inventory-add-btn" data-action="add-item" data-field="onPerson" title="Add new item">
                        <i class="fa-solid fa-plus"></i> Add Item
                    </button>
                </div>
            </div>
            <div class="rpg-inventory-content">
                <div class="rpg-inline-form" id="rpg-add-item-form-onPerson" style="display: none;">
                    <input type="text" class="rpg-inline-input" id="rpg-new-item-onPerson" placeholder="Enter item name..." />
                    <div class="rpg-inline-buttons">
                        <button class="rpg-inline-btn rpg-inline-cancel" data-action="cancel-add-item" data-field="onPerson">
                            <i class="fa-solid fa-times"></i> Cancel
                        </button>
                        <button class="rpg-inline-btn rpg-inline-save" data-action="save-add-item" data-field="onPerson">
                            <i class="fa-solid fa-check"></i> Add
                        </button>
                    </div>
                </div>
                <div class="rpg-item-list ${listViewClass}">
                    ${itemsHtml}
                </div>
            </div>
        </div>
    `;
}

/**
 * Renders the "Clothing" inventory view with list or grid display
 * @param {Array<{name: string, quantity?: number}>} clothingItems - Current clothing items as array of objects
 * @param {string} viewMode - View mode ('list' or 'grid')
 * @returns {string} HTML for clothing view with items and add button
 */
export function renderClothingView(clothingItems, viewMode = 'list') {
    // Convert array to display strings for UI
    const displayItems = Array.isArray(clothingItems) 
        ? clothingItems.map(item => typeof item === 'object' ? item.name : item)
        : [];

    let itemsHtml = '';
    if (displayItems.length === 0) {
        itemsHtml = '<div class="rpg-inventory-empty">No clothing worn</div>';
    } else {
        if (viewMode === 'grid') {
            // Grid view: card-style items
            itemsHtml = displayItems.map((item, index) => {
                const originalItem = Array.isArray(clothingItems) ? clothingItems[index] : null;
                const lockIconHtml = getLockIconHtml('userStats', `inventory.clothing.${originalItem && typeof originalItem === 'object' ? originalItem.name : item}`);
                return `
                <div class="rpg-item-card" data-field="clothing" data-index="${index}">
                    ${lockIconHtml}
                    <button class="rpg-item-remove" data-action="remove-item" data-field="clothing" data-index="${index}" title="Remove item">
                        <i class="fa-solid fa-times"></i>
                    </button>
                    <span class="rpg-item-name rpg-editable" contenteditable="true" data-field="clothing" data-index="${index}" title="Click to edit">${escapeHtml(item)}</span>
                </div>
            `}).join('');
        } else {
            // List view: full-width rows
            itemsHtml = displayItems.map((item, index) => {
                const originalItem = Array.isArray(clothingItems) ? clothingItems[index] : null;
                const lockIconHtml = getLockIconHtml('userStats', `inventory.clothing.${originalItem && typeof originalItem === 'object' ? originalItem.name : item}`);
                return `
                <div class="rpg-item-row" data-field="clothing" data-index="${index}">
                    ${lockIconHtml}
                    <span class="rpg-item-name rpg-editable" contenteditable="true" data-field="clothing" data-index="${index}" title="Click to edit">${escapeHtml(item)}</span>
                    <button class="rpg-item-remove" data-action="remove-item" data-field="clothing" data-index="${index}" title="Remove item">
                        <i class="fa-solid fa-times"></i>
                    </button>
                </div>
            `}).join('');
        }
    }

    const listViewClass = viewMode === 'list' ? 'rpg-item-list-view' : 'rpg-item-grid-view';

    return `
        <div class="rpg-inventory-section" data-section="clothing">
            <div class="rpg-inventory-header">
                <h4>Clothing Worn</h4>
                <div class="rpg-inventory-header-actions">
                    <div class="rpg-view-toggle">
                        <button class="rpg-view-btn ${viewMode === 'list' ? 'active' : ''}" data-action="switch-view" data-field="clothing" data-view="list" title="List view">
                            <i class="fa-solid fa-list"></i>
                        </button>
                        <button class="rpg-view-btn ${viewMode === 'grid' ? 'active' : ''}" data-action="switch-view" data-field="clothing" data-view="grid" title="Grid view">
                            <i class="fa-solid fa-th"></i>
                        </button>
                    </div>
                    <button class="rpg-inventory-add-btn" data-action="add-item" data-field="clothing" title="Add new clothing item">
                        <i class="fa-solid fa-plus"></i> Add Clothing
                    </button>
                </div>
            </div>
            <div class="rpg-inventory-content">
                <div class="rpg-inline-form" id="rpg-add-item-form-clothing" style="display: none;">
                    <input type="text" class="rpg-inline-input" id="rpg-new-item-clothing" placeholder="Enter clothing item..." />
                    <div class="rpg-inline-buttons">
                        <button class="rpg-inline-btn rpg-inline-cancel" data-action="cancel-add-item" data-field="clothing">
                            <i class="fa-solid fa-times"></i> Cancel
                        </button>
                        <button class="rpg-inline-btn rpg-inline-save" data-action="save-add-item" data-field="clothing">
                            <i class="fa-solid fa-check"></i> Add
                        </button>
                    </div>
                </div>
                <div class="rpg-item-list ${listViewClass}">
                    ${itemsHtml}
                </div>
            </div>
        </div>
    `;
}

/**
 * Renders the "Stored" inventory view with collapsible locations and list/grid views
 * @param {Object.<string, Array<{name: string, quantity?: number}>>} stored - Stored items by location (arrays of objects)
 * @param {string[]} collapsedLocations - Array of collapsed location names
 * @param {string} viewMode - View mode ('list' or 'grid')
 * @returns {string} HTML for stored inventory with all locations
 */
export function renderStoredView(stored, collapsedLocations = [], viewMode = 'list') {
    const locations = Object.keys(stored || {});

    let html = `
        <div class="rpg-inventory-section" data-section="stored">
            <div class="rpg-inventory-header">
                <h4>Storage Locations</h4>
                <div class="rpg-inventory-header-actions">
                    <div class="rpg-view-toggle">
                        <button class="rpg-view-btn ${viewMode === 'list' ? 'active' : ''}" data-action="switch-view" data-field="stored" data-view="list" title="List view">
                            <i class="fa-solid fa-list"></i>
                        </button>
                        <button class="rpg-view-btn ${viewMode === 'grid' ? 'active' : ''}" data-action="switch-view" data-field="stored" data-view="grid" title="Grid view">
                            <i class="fa-solid fa-th"></i>
                        </button>
                    </div>
                    <button class="rpg-inventory-add-btn" data-action="add-location" title="Add new storage location">
                        <i class="fa-solid fa-plus"></i> Add Location
                    </button>
                </div>
            </div>
            <div class="rpg-inventory-content">
                <div class="rpg-inline-form" id="rpg-add-location-form" style="display: none;">
                    <input type="text" class="rpg-inline-input" id="rpg-new-location-name" placeholder="Enter location name..." />
                    <div class="rpg-inline-buttons">
                        <button class="rpg-inline-btn rpg-inline-cancel" data-action="cancel-add-location">
                            <i class="fa-solid fa-times"></i> Cancel
                        </button>
                        <button class="rpg-inline-btn rpg-inline-save" data-action="save-add-location">
                            <i class="fa-solid fa-check"></i> Save
                        </button>
                    </div>
                </div>
    `;

    if (locations.length === 0) {
        html += `
                <div class="rpg-inventory-empty">
                    No storage locations yet. Click "Add Location" to create one.
                </div>
        `;
    } else {
        for (const location of locations) {
            const locationItems = stored[location] || [];
            // Convert array to display strings for UI
            const displayItems = Array.isArray(locationItems) 
                ? locationItems.map(item => typeof item === 'object' ? item.name : item)
                : [];
            const isCollapsed = collapsedLocations.includes(location);
            const locationId = getLocationId(location);

            let itemsHtml = '';
            if (displayItems.length === 0) {
                itemsHtml = '<div class="rpg-inventory-empty">No items stored here</div>';
            } else {
                if (viewMode === 'grid') {
                    // Grid view: card-style items
                    itemsHtml = displayItems.map((item, index) => {
                        const originalItem = Array.isArray(locationItems) ? locationItems[index] : null;
                        const lockIconHtml = getLockIconHtml('userStats', `inventory.stored.${location}.${originalItem && typeof originalItem === 'object' ? originalItem.name : item}`);
                        return `
                        <div class="rpg-item-card" data-field="stored" data-location="${escapeHtml(location)}" data-index="${index}">
                            ${lockIconHtml}
                            <button class="rpg-item-remove" data-action="remove-item" data-field="stored" data-location="${escapeHtml(location)}" data-index="${index}" title="Remove item">
                                <i class="fa-solid fa-times"></i>
                            </button>
                            <span class="rpg-item-name rpg-editable" contenteditable="true" data-field="stored" data-location="${escapeHtml(location)}" data-index="${index}" title="Click to edit">${escapeHtml(item)}</span>
                        </div>
                    `}).join('');
                } else {
                    // List view: full-width rows
                    itemsHtml = displayItems.map((item, index) => {
                        const originalItem = Array.isArray(locationItems) ? locationItems[index] : null;
                        const lockIconHtml = getLockIconHtml('userStats', `inventory.stored.${location}.${originalItem && typeof originalItem === 'object' ? originalItem.name : item}`);
                        return `
                        <div class="rpg-item-row" data-field="stored" data-location="${escapeHtml(location)}" data-index="${index}">
                            ${lockIconHtml}
                            <span class="rpg-item-name rpg-editable" contenteditable="true" data-field="stored" data-location="${escapeHtml(location)}" data-index="${index}" title="Click to edit">${escapeHtml(item)}</span>
                            <button class="rpg-item-remove" data-action="remove-item" data-field="stored" data-location="${escapeHtml(location)}" data-index="${index}" title="Remove item">
                                <i class="fa-solid fa-times"></i>
                            </button>
                        </div>
                    `}).join('');
                }
            }

            const listViewClass = viewMode === 'list' ? 'rpg-item-list-view' : 'rpg-item-grid-view';

            html += `
                <div class="rpg-storage-location ${isCollapsed ? 'collapsed' : ''}" data-location="${escapeHtml(location)}">
                    <div class="rpg-storage-header">
                        <button class="rpg-storage-toggle" data-action="toggle-location" data-location="${escapeHtml(location)}">
                            <i class="fa-solid fa-chevron-${isCollapsed ? 'right' : 'down'}"></i>
                        </button>
                        <h5 class="rpg-storage-name">${escapeHtml(location)}</h5>
                        <div class="rpg-storage-actions">
                            <button class="rpg-inventory-remove-btn" data-action="remove-location" data-location="${escapeHtml(location)}" title="Remove this storage location">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="rpg-storage-content" ${isCollapsed ? 'style="display:none;"' : ''}>
                        <div class="rpg-inline-form" id="rpg-add-item-form-stored-${locationId}" style="display: none;">
                            <input type="text" class="rpg-inline-input rpg-location-item-input" data-location="${escapeHtml(location)}" placeholder="Enter item name..." />
                            <div class="rpg-inline-buttons">
                                <button class="rpg-inline-btn rpg-inline-cancel" data-action="cancel-add-item" data-field="stored" data-location="${escapeHtml(location)}">
                                    <i class="fa-solid fa-times"></i> Cancel
                                </button>
                                <button class="rpg-inline-btn rpg-inline-save" data-action="save-add-item" data-field="stored" data-location="${escapeHtml(location)}">
                                    <i class="fa-solid fa-check"></i> Add
                                </button>
                            </div>
                        </div>
                        <div class="rpg-item-list ${listViewClass}">
                            ${itemsHtml}
                        </div>
                        <div class="rpg-storage-add-item-container">
                            <button class="rpg-inventory-add-btn" data-action="add-item" data-field="stored" data-location="${escapeHtml(location)}" title="Add item to this location">
                                <i class="fa-solid fa-plus"></i> Add Item
                            </button>
                        </div>
                    </div>
                    <div class="rpg-inline-confirmation" id="rpg-remove-confirm-${locationId}" style="display: none;">
                        <p>Remove "${escapeHtml(location)}"? This will delete all items stored there.</p>
                        <div class="rpg-inline-buttons">
                            <button class="rpg-inline-btn rpg-inline-cancel" data-action="cancel-remove-location" data-location="${escapeHtml(location)}">
                                <i class="fa-solid fa-times"></i> Cancel
                            </button>
                            <button class="rpg-inline-btn rpg-inline-confirm" data-action="confirm-remove-location" data-location="${escapeHtml(location)}">
                                <i class="fa-solid fa-check"></i> Confirm
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    html += `
            </div>
        </div>
    `;

    return html;
}

/**
 * Renders the "Assets" inventory view with list or grid display
 * @param {Array<{name: string, quantity?: number}>} assets - Current assets (vehicles, property, equipment) as array of objects
 * @param {string} viewMode - View mode ('list' or 'grid')
 * @returns {string} HTML for assets view with items and add button
 */
export function renderAssetsView(assets, viewMode = 'list') {
    // Convert array to display strings for UI
    const displayItems = Array.isArray(assets) 
        ? assets.map(item => typeof item === 'object' ? item.name : item)
        : [];

    let itemsHtml = '';
    if (displayItems.length === 0) {
        itemsHtml = '<div class="rpg-inventory-empty">No assets owned</div>';
    } else {
        if (viewMode === 'grid') {
            // Grid view: card-style items
            itemsHtml = displayItems.map((item, index) => {
                const originalItem = Array.isArray(assets) ? assets[index] : null;
                const lockIconHtml = getLockIconHtml('userStats', `inventory.assets.${originalItem && typeof originalItem === 'object' ? originalItem.name : item}`);
                return `
                <div class="rpg-item-card" data-field="assets" data-index="${index}">
                    ${lockIconHtml}
                    <button class="rpg-item-remove" data-action="remove-item" data-field="assets" data-index="${index}" title="Remove asset">
                        <i class="fa-solid fa-times"></i>
                    </button>
                    <span class="rpg-item-name rpg-editable" contenteditable="true" data-field="assets" data-index="${index}" title="Click to edit">${escapeHtml(item)}</span>
                </div>
            `}).join('');
        } else {
            // List view: full-width rows
            itemsHtml = displayItems.map((item, index) => {
                const originalItem = Array.isArray(assets) ? assets[index] : null;
                const lockIconHtml = getLockIconHtml('userStats', `inventory.assets.${originalItem && typeof originalItem === 'object' ? originalItem.name : item}`);
                return `
                <div class="rpg-item-row" data-field="assets" data-index="${index}">
                    ${lockIconHtml}
                    <span class="rpg-item-name rpg-editable" contenteditable="true" data-field="assets" data-index="${index}" title="Click to edit">${escapeHtml(item)}</span>
                    <button class="rpg-item-remove" data-action="remove-item" data-field="assets" data-index="${index}" title="Remove asset">
                        <i class="fa-solid fa-times"></i>
                    </button>
                </div>
            `}).join('');
        }
    }

    const listViewClass = viewMode === 'list' ? 'rpg-item-list-view' : 'rpg-item-grid-view';

    return `
        <div class="rpg-inventory-section" data-section="assets">
            <div class="rpg-inventory-header">
                <h4>Vehicles, Property & Major Possessions</h4>
                <div class="rpg-inventory-header-actions">
                    <div class="rpg-view-toggle">
                        <button class="rpg-view-btn ${viewMode === 'list' ? 'active' : ''}" data-action="switch-view" data-field="assets" data-view="list" title="List view">
                            <i class="fa-solid fa-list"></i>
                        </button>
                        <button class="rpg-view-btn ${viewMode === 'grid' ? 'active' : ''}" data-action="switch-view" data-field="assets" data-view="grid" title="Grid view">
                            <i class="fa-solid fa-th"></i>
                        </button>
                    </div>
                    <button class="rpg-inventory-add-btn" data-action="add-item" data-field="assets" title="Add new asset">
                        <i class="fa-solid fa-plus"></i> Add Asset
                    </button>
                </div>
            </div>
            <div class="rpg-inventory-content">
                <div class="rpg-inline-form" id="rpg-add-item-form-assets" style="display: none;">
                    <input type="text" class="rpg-inline-input" id="rpg-new-item-assets" placeholder="Enter asset name..." />
                    <div class="rpg-inline-buttons">
                        <button class="rpg-inline-btn rpg-inline-cancel" data-action="cancel-add-item" data-field="assets">
                            <i class="fa-solid fa-times"></i> Cancel
                        </button>
                        <button class="rpg-inline-btn rpg-inline-save" data-action="save-add-item" data-field="assets">
                            <i class="fa-solid fa-check"></i> Add
                        </button>
                    </div>
                </div>
                <div class="rpg-item-list ${listViewClass}">
                    ${itemsHtml}
                </div>
                <div class="rpg-inventory-hint">
                    <i class="fa-solid fa-info-circle"></i>
                    Assets include vehicles (cars, motorcycles), property (homes, apartments),
                    and major equipment (workshop tools, special items).
                </div>
            </div>
        </div>
    `;
}

/**
 * Generates inventory HTML (internal helper)
 * @param {InventoryV2} inventory - Inventory data to render
 * @param {Object} options - Rendering options
 * @param {string} options.activeSubTab - Currently active sub-tab ('onPerson', 'stored', 'assets')
 * @param {string[]} options.collapsedLocations - Collapsed storage locations
 * @returns {string} Complete HTML for inventory tab content
 */
function generateInventoryHTML(inventory, options = {}) {
    const {
        activeSubTab = 'onPerson',
        collapsedLocations = []
    } = options;

    // Handle legacy v1 format - convert to v2 for display
    // let inventory = inventory;
    if (typeof inventory === 'string') {
        inventory = {
            onPerson: inventory,
            stored: {},
            assets: 'None'
        };
    }

    // Ensure v2 structure has all required fields
    if (!inventory || typeof inventory !== 'object') {
        inventory = {
            onPerson: [],
            stored: {},
            assets: []
        };
    }

    // Additional safety check: ensure required properties exist and are correct type (arrays now)
    if (!inventory.onPerson || !Array.isArray(inventory.onPerson)) {
        inventory.onPerson = [];
    }
    if (!inventory.clothing || !Array.isArray(inventory.clothing)) {
        inventory.clothing = [];
    }
    if (!inventory.stored || typeof inventory.stored !== 'object' || Array.isArray(inventory.stored)) {
        inventory.stored = {};
    }
    // Convert stored location strings to arrays
    if (inventory.stored) {
        for (const location of Object.keys(inventory.stored)) {
            const locationItems = inventory.stored[location];
            if (typeof locationItems === 'string') {
                // Convert string to array for backward compatibility
                inventory.stored[location] = locationItems === 'None' || locationItems === '' ? [] : [locationItems];
            } else if (!Array.isArray(locationItems)) {
                inventory.stored[location] = [];
            }
        }
    }
    if (!inventory.assets || !Array.isArray(inventory.assets)) {
        inventory.assets = [];
    }

    let html = `
        <div class="rpg-inventory-container">
            ${renderInventorySubTabs(activeSubTab)}
            <div class="rpg-inventory-views">
    `;

    // Get view modes from settings (default to 'list')
    const viewModes = extensionSettings.inventoryViewModes || {
        onPerson: 'list',
        clothing: 'list',
        stored: 'list',
        assets: 'list'
    };

    // Render the active view
    switch (activeSubTab) {
        case 'onPerson':
            html += renderOnPersonView(inventory.onPerson, viewModes.onPerson);
            break;
        case 'clothing':
            html += renderClothingView(inventory.clothing, viewModes.clothing);
            break;
        case 'stored':
            html += renderStoredView(inventory.stored, collapsedLocations, viewModes.stored);
            break;
        case 'assets':
            html += renderAssetsView(inventory.assets, viewModes.assets);
            break;
        default:
            html += renderOnPersonView(inventory.onPerson, viewModes.onPerson);
    }

    html += `
            </div>
        </div>
    `;

    return html;
}

/**
 * Updates the inventory display in the DOM (used by inventoryActions)
 * @param {string} containerId - ID of container element to update
 * @param {Object} options - Rendering options (passed to generateInventoryHTML)
 */
export function updateInventoryDisplay(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`[RPG Companion] Inventory container not found: ${containerId}`);
        return;
    }

    const inventory = getTrackerDataForContext('userStats')?.inventory ?? extensionSettings.userStats.inventory;
    console.log('[RPG Companion] Updating inventory display with data:', inventory, 'and options:', options);
    const html = generateInventoryHTML(inventory, options);
    container.innerHTML = html;

    // Restore form states after re-rendering
    restoreFormStates();
}

/**
 * Main inventory rendering function (matches pattern of other render functions)
 * Gets data from state/settings and updates DOM directly.
 * Call this after AI generation, character changes, or swipes.
 */
export function renderInventory() {
    // Early return if container doesn't exist or section is hidden
    if (!$inventoryContainer || !extensionSettings.showInventory) {
        return;
    }

    // Check if tracker data exists (from swipe store or extensionSettings)
    const trackerData = getTrackerDataForContext('userStats');

    if(!trackerData || !trackerData.inventory) {
        console.warn('[RPG Companion] No inventory data found in tracker for userStats context.');
        $inventoryContainer.html('<div class="rpg-inventory-empty">No inventory generated yet</div>')
        return;
    }
    const inventory = trackerData.inventory;

    // Get current render options (active tab, collapsed locations)
    const options = getInventoryRenderOptions();

    // Generate HTML and update DOM
    const html = generateInventoryHTML(inventory, options);
    $inventoryContainer.html(html);

    // Restore form states after re-rendering (fixes Bug #1)
    restoreFormStates();

    // Event listener for editing item names (mobile-friendly contenteditable)
    $inventoryContainer.find('.rpg-item-name.rpg-editable').on('blur', function() {
        const field = $(this).data('field');
        const index = parseInt($(this).data('index'));
        const location = $(this).data('location');
        const newName = $(this).text().trim();
        updateInventoryItem(field, index, newName, location);
    });

    // Add event listener for section lock icon clicks (support both click and touch)
    $inventoryContainer.find('.rpg-section-lock-icon').on('click touchend', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const $icon = $(this);
        const trackerType = $icon.data('tracker');
        const itemPath = $icon.data('path');
        const currentlyLocked = isItemLocked(trackerType, itemPath);

        // Toggle lock state
        setItemLock(trackerType, itemPath, !currentlyLocked);

        // Update icon
        const newIcon = !currentlyLocked ? '🔒' : '🔓';
        const newTitle = !currentlyLocked ? 'Locked' : 'Unlocked';
        $icon.text(newIcon);
        $icon.attr('title', newTitle);

        // Toggle 'locked' class for persistent visibility
        $icon.toggleClass('locked', !currentlyLocked);

        // Save settings
        saveSettings();
    });
}

/**
 * Escapes HTML special characters to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
