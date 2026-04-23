/**
 * Quests Rendering Module
 * Handles UI rendering for quests system (main and optional quests)
 */

import { extensionSettings, $questsContainer } from '../../core/state.js';
import { saveSettings, saveChatData, updateMessageSwipeData } from '../../core/persistence.js';
import { getTrackerDataForContext } from '../generation/promptBuilder.js';
import { isItemLocked, setItemLock } from '../generation/lockManager.js';
import { parseUserStats } from '../generation/parser.js';

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
 * Extract quest data from object or string
 * @param {string|object} quest - Quest data
 * @returns {object} Extracted quest data
 */
function extractQuestData(quest) {
    let questTitle = '';
    let questDate = '';
    let questLocation = '';
    let isCompleted = false;

    if (quest && typeof quest === 'object') {
        questTitle = quest.title || '';
        questDate = quest.date || '';
        questLocation = quest.location || '';
        isCompleted = quest.completed || false;
    } else {
        questTitle = quest || '';
    }

    return { questTitle, questDate, questLocation, isCompleted };
}

/**
 * Generate quest item HTML for display
 * @param {string} field - Field type ('main' or 'optional')
 * @param {string|object} quest - Quest data
 * @param {number} [index] - Index for optional quests
 * @returns {string} Quest item HTML
 */
function renderQuestItem(field, quest, index) {
    const { questTitle, questDate, questLocation, isCompleted } = extractQuestData(quest);
    
    // Build meta row (only if at least one field has a value)
    let metaRow = '';
    if (questDate || questLocation) {
        metaRow = `<div class="rpg-quest-meta">
            ${questDate ? `<span class="rpg-quest-meta-item">📅 ${escapeHtml(questDate)}</span>` : ''}
            ${questLocation ? `<span class="rpg-quest-meta-item">📍 ${escapeHtml(questLocation)}</span>` : ''}
        </div>`;
    }

    // Build lock path
    const lockPath = field === 'main' ? 'quests.main' : `quests.optional[${index}]` ;
    const isLocked = isItemLocked('userStats', lockPath);

    // Lock icon - always visible when locked, inside hover area when unlocked
    const lockIconHtml = isLocked 
        ? `<span class="rpg-section-lock-icon locked" data-tracker="userStats" data-path="${lockPath}" title="Locked">🔒</span>`
        : `<span class="rpg-section-lock-icon" data-tracker="userStats" data-path="${lockPath}" title="Click to lock">🔓</span>`;

    // Completed checkbox and lock icon (only when unlocked) in hover area
    const hoverActions = `
        <div class="rpg-quest-actions-hover">
            ${isLocked ? '' : `
                <button class="rpg-quest-edit" data-action="edit-quest" data-field="${field}" ${index !== undefined ? `data-index="${index}"` : ''} title="Edit quest">
                    <i class="fa-solid fa-edit"></i>
                </button>
                <button class="rpg-quest-remove" data-action="remove-quest" data-field="${field}" ${index !== undefined ? `data-index="${index}"` : ''} title="Remove quest">
                    <i class="fa-solid fa-trash"></i>
                </button>
            `}
            <label class="rpg-quest-completed-label">
                <input type="checkbox" class="rpg-quest-completed-checkbox" data-field="${field}" ${index !== undefined ? `data-index="${index}"` : ''} ${isCompleted ? 'checked' : ''} />
                <span class="rpg-quest-completed-text">Completed</span>
            </label>
        </div>
    `;

    return `
        <div class="rpg-quest-item ${isCompleted ? 'completed' : ''} ${isLocked ? 'locked' : ''}" data-field="${field}" ${index !== undefined ? `data-index="${index}"` : ''}>
            ${lockIconHtml}
            <div class="rpg-quest-title">${escapeHtml(questTitle)}</div>
            ${metaRow}
            ${hoverActions}
        </div>
    `;
}

/**
 * Generate quest form HTML for add/edit
 * @param {string} field - Field type ('main' or 'optional')
 * @param {string} action - Action type ('add' or 'edit')
 * @param {string|object} [quest] - Quest data (for edit action)
 * @returns {string} Quest form HTML
 */
function renderQuestForm(field, action, quest) {
    const isEdit = action === 'edit';
    const prefix = isEdit ? 'edit' : 'new';
    const formId = `rpg-${prefix}-quest-form-${field}`;
    const titleId = `rpg-${prefix}-quest-${field}`;
    const dateId = field === 'main' ? `rpg-${prefix}-quest-date` : `rpg-${prefix}-quest-date-${field}`;
    const locationId = field === 'main' ? `rpg-${prefix}-quest-location` : `rpg-${prefix}-quest-location-${field}`;
    const completedId = field === 'main' ? `rpg-${prefix}-quest-completed` : `rpg-${prefix}-quest-completed-${field}`;
    const actionName = isEdit ? 'save-edit-quest' : 'save-add-quest';
    const cancelName = isEdit ? 'cancel-edit-quest' : 'cancel-add-quest';
    const actionLabel = isEdit ? 'Save' : 'Add';
    const actionIcon = isEdit ? 'fa-check' : 'fa-check';
    const cancelIcon = 'fa-times';

    // Get current values if editing
    let titleValue = '';
    let dateValue = '';
    let locationValue = '';
    let completedChecked = false;

    if (isEdit && quest) {
        const { questTitle, questDate, questLocation, isCompleted } = extractQuestData(quest);
        titleValue = questTitle;
        dateValue = questDate;
        locationValue = questLocation;
        completedChecked = isCompleted;
    }

    return `
        <div class="rpg-inline-form" id="${formId}" style="display: none;">
            <input type="text" class="rpg-inline-input" id="${titleId}" value="${escapeHtml(titleValue)}" placeholder="Quest title..." />
            <div class="rpg-quest-meta">
                <input type="text" class="rpg-inline-input rpg-quest-meta-input" id="${dateId}" value="${escapeHtml(dateValue)}" placeholder="Date..." />
                <input type="text" class="rpg-inline-input rpg-quest-meta-input" id="${locationId}" value="${escapeHtml(locationValue)}" placeholder="Location..." />
            </div>
            <div class="rpg-quest-completed">
                <label class="rpg-checkbox-label">
                    <input type="checkbox" class="rpg-inline-input" id="${completedId}" ${completedChecked ? 'checked' : ''} />
                    <span class="rpg-checkbox-text">Completed</span>
                </label>
            </div>
            <div class="rpg-inline-buttons">
                ${field === 'main' && isEdit ? `
                    <button class="rpg-inline-btn rpg-inline-clear" data-action="clear-quest" data-field="${field}">
                        <i class="fa-solid fa-ban"></i> Clear
                    </button>
                ` : ''}
                <button class="rpg-inline-btn rpg-inline-cancel" data-action="${cancelName}" data-field="${field}">
                    <i class="fa-solid ${cancelIcon}"></i> Cancel
                </button>
                <button class="rpg-inline-btn rpg-inline-save" data-action="${actionName}" data-field="${field}">
                    <i class="fa-solid ${actionIcon}"></i> ${actionLabel}
                </button>
            </div>
        </div>
    `;
}


/**
 * Renders the main quest view
 * @param {string|object} mainQuest - Current main quest (string or object with title/description)
 * @returns {string} HTML for main quest view
 */
export function renderMainQuestView(mainQuest) {
    const { questTitle, questDate, questLocation, isCompleted } = extractQuestData(mainQuest);
    const hasQuest = questTitle && questTitle !== 'None';

    return `
        <div class="rpg-quest-section">
            <div class="rpg-quest-header">
                <h3 class="rpg-quest-section-title">Main Quest</h3>
                ${!hasQuest ? `<button class="rpg-add-quest-btn" data-action="add-quest" data-field="main" title="Add main quest">
                    <i class="fa-solid fa-plus"></i> Add Quest
                </button>` : ''}
            </div>
            <div class="rpg-quest-content">
                ${hasQuest ? `
                    ${renderQuestForm('main', 'edit', mainQuest)}
                    ${renderQuestItem('main', mainQuest)}
                ` : `
                    ${renderQuestForm('main', 'add')}
                    <div class="rpg-quest-empty">No active main quests</div>
                `}
            </div>
            <div class="rpg-quest-hint">
                <i class="fa-solid fa-lightbulb"></i>
                The main quest represents your primary objective in the story.
            </div>
        </div>
    `;
}

/**
 * Renders the optional quests view
 * @param {Array<string|object>} optionalQuests - Array of optional quest titles or objects
 * @returns {string} HTML for optional quests view
 */
export function renderOptionalQuestsView(optionalQuests) {
    // Filter out empty/null quests and extract titles from objects
    const quests = (optionalQuests || []).filter(q => {
        if (!q) return false;
        if (typeof q === 'string') return true; // Keep all strings (backward compat)
        if (typeof q === 'object') return q.title || q.description;
        return false;
    });

    let questsHtml = '';
    if (quests.length === 0) {
        questsHtml = '<div class="rpg-quest-empty">No active optional quests</div>';
    } else {
        questsHtml = quests.map((quest, index) => renderQuestItem('optional', quest, index)).join('');
    }

    return `
        <div class="rpg-quest-section">
            <div class="rpg-quest-header">
                <h3 class="rpg-quest-section-title">Optional Quests</h3>
                <button class="rpg-add-quest-btn" data-action="add-quest" data-field="optional" title="Add optional quest">
                    <i class="fa-solid fa-plus"></i> Add Quest
                </button>
            </div>
            <div class="rpg-quest-content">
                ${renderQuestForm('optional', 'add')}
                ${renderQuestForm('optional', 'edit')}
                <div class="rpg-quest-list">
                    ${questsHtml}
                </div>
                <div class="rpg-quest-hint">
                    <i class="fa-solid fa-info-circle"></i>
                    Optional quests are side objectives that complement your main story.
                </div>
            </div>
        </div>
    `;
}

/**
 * Main render function for quests
 */
export function renderQuests() {
    if (!extensionSettings.showInventory || !$questsContainer) {
        return;
    }

    // Get tracker data directly from swipe store
    const trackerData = getTrackerDataForContext('userStats');
    
    if (!trackerData || !trackerData.quests) {
        $questsContainer.html('<div class="rpg-inventory-empty">No quests generated yet</div>');
        return;
    }

    // Get quests data directly from trackerData (no intermediate extensionSettings)
    let mainQuest = trackerData.quests.main;
    // Recursively extract value if it's a locked object
    while (mainQuest && typeof mainQuest === 'object' && mainQuest.value !== undefined) {
        mainQuest = mainQuest.value;
    }
    const optionalQuests = trackerData.quests.optional || [];

    // Build HTML
    let html = '<div class="rpg-quests-wrapper">';

    // Render quests (no sub-tabs)
    html += '<div class="rpg-quests-panels">';
    html += renderMainQuestView(mainQuest);
    html += renderOptionalQuestsView(optionalQuests);
    html += '</div></div>';

    $questsContainer.html(html);

    // Attach event handlers
    attachQuestEventHandlers();
}

/**
 * Get quest input values from form elements
 * @param {string} field - Field type ('main' or 'optional')
 * @param {string} prefix - Form prefix ('new' or 'edit')
 * @returns {object} Quest data object
 */
function getQuestFormData(field, prefix) {
    const titleInput = $(`#rpg-${prefix}-quest-${field}`);
    const dateId = field === 'main' ? `rpg-${prefix}-quest-date` : `rpg-${prefix}-quest-date-${field}`;
    const locationId = field === 'main' ? `rpg-${prefix}-quest-location` : `rpg-${prefix}-quest-location-${field}`;
    const completedId = field === 'main' ? `rpg-${prefix}-quest-completed` : `rpg-${prefix}-quest-completed-${field}`;
    
    const titleInputVal = $(`#rpg-${prefix}-quest-${field}`);
    const dateInput = $(`#${dateId}`);
    const locationInput = $(`#${locationId}`);
    const completedInput = $(`#${completedId}`);
    
    const questTitle = titleInputVal.val().trim();
    const questDate = dateInput.val().trim();
    const questLocation = locationInput.val().trim();
    const questCompleted = completedInput.is(':checked');

    return { questTitle, questDate, questLocation, questCompleted, titleInputVal, dateInput, locationInput, completedInput };
}

/**
 * Save quest data directly to swipe store
 * @param {string} field - Field type ('main' or 'optional')
 * @param {object} questData - Quest data object
 * @param {number} [index] - Index for optional quests
 */
function saveQuestData(field, questData, index) {
    const { questTitle, questDate, questLocation, questCompleted } = questData;
    
    let trackerData = getTrackerDataForContext('userStats');
    // Build quests data object directly (no extensionSettings intermediate)
    const questsData = { main: null, optional: [] };
    
    if (field === 'main' && questTitle === 'None') {
        // Clear main quest - set to null
        trackerData.quests.main = null;
    } else if (questTitle) {
        const questObj = { title: questTitle };
        if (questDate) questObj.date = questDate;
        if (questLocation) questObj.location = questLocation;
        questObj.completed = questCompleted;

        if (field === 'main') {
            trackerData.quests.main = questObj;
        } else {
            if (index !== undefined) {
                trackerData.quests.optional[index] = questObj;
            } else {
                trackerData.quests.optional.push(questObj);
            }
        }
    }
    
    // Save directly to swipe store (no extensionSettings updates)
    updateMessageSwipeData('userStats', trackerData);
    saveChatData();
    renderQuests();
}

/**
 * Attach event handlers for quest interactions
 */
function attachQuestEventHandlers() {
    // Add quest button
    $questsContainer.find('[data-action="add-quest"]').on('click', function() {
        const field = $(this).data('field');
        $(`#rpg-new-quest-form-${field}`).show();
        $(`#rpg-new-quest-${field}`).val('').focus();
        $(`#rpg-new-quest-date${field === 'optional' ? '-' + field : ''}`).val('');
        $(`#rpg-new-quest-location${field === 'optional' ? '-' + field : ''}`).val('');
    });

    // Cancel add quest
    $questsContainer.find('[data-action="cancel-add-quest"]').on('click', function() {
        const field = $(this).data('field');
        $(`#rpg-new-quest-form-${field}`).hide();
        $(`#rpg-new-quest-${field}`).val('');
        $(`#rpg-new-quest-date${field === 'optional' ? '-' + field : ''}`).val('');
        $(`#rpg-new-quest-location${field === 'optional' ? '-' + field : ''}`).val('');
        $(`#rpg-new-quest-completed${field === 'optional' ? '-' + field : ''}`).prop('checked', false);
    });

    // Save add quest
    $questsContainer.find('[data-action="save-add-quest"]').on('click', function() {
        const field = $(this).data('field');
        const data = getQuestFormData(field, 'new');
        saveQuestData(field, data, undefined);
    });

    // Edit quest (main or optional)
    $questsContainer.find('[data-action="edit-quest"]').on('click', function() {
        const field = $(this).data('field');
        const index = $(this).data('index');
        
        if (field === 'main') {
            // Populate edit form with current main quest data
            const mainQuest = extensionSettings.quests.main;
            if (mainQuest) {
                const { questTitle, questDate, questLocation, isCompleted } = extractQuestData(mainQuest);
                $(`#rpg-edit-quest-${field}`).val(questTitle);
                $(`#rpg-edit-quest-date`).val(questDate);
                $(`#rpg-edit-quest-location`).val(questLocation);
                $(`#rpg-edit-quest-completed`).prop('checked', isCompleted);
            }
            $(`#rpg-edit-quest-form-${field}`).show();
            $('.rpg-quest-item[data-field="main"]').hide();
            $(`#rpg-edit-quest-${field}`).focus();
        } else {
            // Populate edit form with current optional quest data
            if (extensionSettings.quests.optional && extensionSettings.quests.optional[index]) {
                const quest = extensionSettings.quests.optional[index];
                const { questTitle, questDate, questLocation, isCompleted } = extractQuestData(quest);
                $(`#rpg-edit-quest-${field}`).val(questTitle);
                $(`#rpg-edit-quest-date-${field}`).val(questDate);
                $(`#rpg-edit-quest-location-${field}`).val(questLocation);
                $(`#rpg-edit-quest-completed-${field}`).prop('checked', isCompleted);
            }
            // Store the index on the form for later use by save button
            $(`#rpg-edit-quest-form-${field}`).data('edit-index', index).show();
            $(`.rpg-quest-item[data-field="optional"][data-index="${index}"]`).hide();
            $(`#rpg-edit-quest-${field}`).focus();
        }
    });

    // Cancel edit quest
    $questsContainer.find('[data-action="cancel-edit-quest"]').on('click', function() {
        const field = $(this).data('field');
        $(`#rpg-edit-quest-form-${field}`).hide();
        
        if (field === 'main') {
            $('.rpg-quest-item[data-field="main"]').show();
            $(`#rpg-edit-quest-${field}`).val('');
            $(`#rpg-edit-quest-date`).val('');
            $(`#rpg-edit-quest-location`).val('');
            $(`#rpg-edit-quest-completed`).prop('checked', false);
        } else {
            $('.rpg-quest-item[data-field="optional"]').show();
            $(`#rpg-edit-quest-${field}`).val('');
            $(`#rpg-edit-quest-date-${field}`).val('');
            $(`#rpg-edit-quest-location-${field}`).val('');
            $(`#rpg-edit-quest-completed-${field}`).prop('checked', false);
            // Clear the stored index
            $(`#rpg-edit-quest-form-${field}`).removeData('edit-index');
        }
    });

    // Save edit quest
    $questsContainer.find('[data-action="save-edit-quest"]').on('click', function() {
        const field = $(this).data('field');
        const index = field === 'optional' ? $(`#rpg-edit-quest-form-${field}`).data('edit-index') : 0;
        const data = getQuestFormData(field, 'edit');
        saveQuestData(field, data, index);
    });

    // Clear main quest
    $questsContainer.find('[data-action="clear-quest"]').on('click', function() {
        const field = $(this).data('field');
        if (field === 'main') {
            // Build quests data with cleared main quest
            const trackerData = getTrackerDataForContext('userStats');
            const questsData = trackerData?.quests || { main: null, optional: [] };
            questsData.main = { title: 'None', date: '', location: '', completed: false };
            
            // Save directly to swipe store
            updateMessageSwipeData('userStats', questsData);
            saveChatData();
            renderQuests();
        }
    });

    // Remove quest
    $questsContainer.find('[data-action="remove-quest"]').on('click', function() {
        const field = $(this).data('field');
        const index = $(this).data('index');

        // Get current quests data from swipe store
        const trackerData = getTrackerDataForContext('userStats');
        const questsData = trackerData?.quests || { main: null, optional: [] };

        if (field === 'main') {
            questsData.main = null;
        } else {
            questsData.optional.splice(index, 1);
        }
        
        // Save directly to swipe store
        updateMessageSwipeData('userStats', questsData);
        saveChatData();
        renderQuests();
    });

    // Enter key to save in forms
    $questsContainer.find('.rpg-inline-input').on('keypress', function(e) {
        if (e.which === 13) {
            const field = $(this).attr('id').includes('edit') ?
                $(this).attr('id').replace('rpg-edit-quest-', '') :
                $(this).attr('id').replace('rpg-new-quest-', '');

            if ($(this).attr('id').includes('edit')) {
                $(`[data-action="save-edit-quest"][data-field="${field}"]`).click();
            } else {
                $(`[data-action="save-add-quest"][data-field="${field}"]`).click();
            }
        }
    });

    // Add event listener for section lock icon clicks (support both click and touch)
    $questsContainer.find('.rpg-section-lock-icon').on('click touchend', function(e) {
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

    // Add event listener for completed checkbox clicks
    $questsContainer.find('.rpg-quest-completed-checkbox').on('change', function() {
        const field = $(this).data('field');
        const index = $(this).data('index');
        const isChecked = $(this).is(':checked');

        // Get current quests data from swipe store
        const trackerData = getTrackerDataForContext('userStats');
        const questsData = trackerData?.quests || { main: null, optional: [] };

        if (field === 'main') {
            if (questsData.main) {
                questsData.main.completed = isChecked;
            }
        } else {
            if (extensionSettings.quests.optional && extensionSettings.quests.optional[index]) {
                extensionSettings.quests.optional[index].completed = isChecked;
            }
        }
        // Sync quest changes to swipeStore so AI sees the update
        updateMessageSwipeData();
        saveSettings();
        saveChatData();
        renderQuests();
    });

    // Add hover effects for quest actions
    $questsContainer.on('mouseenter', '.rpg-quest-item', function() {
        $(this).find('.rpg-quest-actions-hover').show();
    }).on('mouseleave', '.rpg-quest-item', function() {
        $(this).find('.rpg-quest-actions-hover').hide();
    });
}
