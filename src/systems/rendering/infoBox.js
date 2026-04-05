/**
 * Info Box Rendering Module
 * Handles rendering of the info box dashboard with weather, date, time, and location widgets
 */

import { getContext } from '../../../../../../extensions.js';
import {
    extensionSettings,
    $infoBoxContainer
} from '../../core/state.js';
import { saveChatData, updateMessageSwipeData, saveSettings } from '../../core/persistence.js';
import { getTrackerDataForContext } from '../generation/promptBuilder.js';
import { i18n } from '../../core/i18n.js';
import { isItemLocked } from '../generation/lockManager.js';
import { repairJSON } from '../../utils/jsonRepair.js';
import { updateFabWidgets } from '../ui/mobile.js';

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
 * Helper to separate emoji from text in a string
 * Handles cases where there's no comma or space after emoji
 * @param {string} str - String potentially containing emoji followed by text
 * @returns {{emoji: string, text: string}} Separated emoji and text
 */
function separateEmojiFromText(str) {
    if (!str) return { emoji: '', text: '' };

    str = str.trim();

    // Regex to match emoji at the start (handles most emoji including compound ones)
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
 * Renders the info box as a visual dashboard with calendar, weather, temperature, clock, and map widgets.
 * Includes event listeners for editable fields.
 */
export function renderInfoBox() {
    // console.log('[RPG InfoBox Render] ==================== RENDERING INFO BOX ====================');
    // console.log('[RPG InfoBox Render] showInfoBox setting:', extensionSettings.showInfoBox);
    // console.log('[RPG InfoBox Render] Container exists:', !!$infoBoxContainer);

    if (!extensionSettings.showInfoBox || !$infoBoxContainer) {
        // console.log('[RPG InfoBox Render] Exiting: showInfoBox or container is false');
        return;
    }

    // Read info box data from swipe store
    const infoBoxData = getTrackerDataForContext('infoBox');
    // console.log('[RPG InfoBox Render] infoBoxData length:', infoBoxData ? infoBoxData.length : 'null');
    // console.log('[RPG InfoBox Render] infoBoxData preview:', infoBoxData ? infoBoxData.substring(0, 200) : 'null');

    // If no data yet, hide the container (e.g., after cache clear)
    if (!infoBoxData) {
        console.log('[RPG InfoBox Render] No data, hiding container');
        $infoBoxContainer.empty().hide();
        return;
    }

    // Show container and add updating class for animation
    $infoBoxContainer.show();
    if (extensionSettings.enableAnimations) {
        $infoBoxContainer.addClass('rpg-content-updating');
    }

    // console.log('[RPG Companion] renderInfoBox called with data:', infoBoxData);

    let data = {
        date: '',
        weekday: '',
        month: '',
        year: '',
        weatherEmoji: '',
        weatherForecast: '',
        temperature: '',
        tempValue: 0,
        timeStart: '',
        timeEnd: '',
        location: '',
        characters: []
    };

    // Check if data is v3 JSON format
    const jsonData = repairJSON(infoBoxData);
    if (jsonData) {
        // Extract from v3 JSON structure
        data.weatherEmoji = jsonData.weather?.emoji || '';
        data.weatherForecast = jsonData.weather?.forecast || '';
        data.temperature = jsonData.temperature ? `${jsonData.temperature.value}°${jsonData.temperature.unit}` : '';
        data.tempValue = jsonData.temperature?.value || 0;
        data.timeStart = jsonData.time?.start || '';
        data.timeEnd = jsonData.time?.end || '';
        data.location = jsonData.location?.value || '';

        // Parse date string to extract weekday, month, year
        if (jsonData.date?.value) {
            data.date = jsonData.date.value;
            // Expected format: "Tuesday, October 17th, 2023"
            const dateParts = data.date.split(',').map(p => p.trim());
            data.weekday = dateParts[0] || '';
            data.month = dateParts[1] || '';
            data.year = dateParts[2] || '';
        }
    } else {
        return;
    }

    // Get tracker configuration
    const config = extensionSettings.trackerConfig?.infoBox;

    // Build visual dashboard HTML
    // Wrap all content in a scrollable container
    let html = '<div class="rpg-info-content">';

    // Row 1: Date, Weather, Temperature, Time widgets
    const row1Widgets = [];

    // Calendar widget - show if enabled
    if (config?.widgets?.date?.enabled) {
        // Apply date format conversion
        let monthDisplay = data.month || 'MON';
        let weekdayDisplay = data.weekday || 'DAY';
        let yearDisplay = data.year || 'YEAR';

        // Apply format based on config
        const dateFormat = config.widgets.date.format || 'dd/mm/yy';
        if (dateFormat === 'dd/mm/yy') {
            monthDisplay = monthDisplay.substring(0, 3).toUpperCase();
            weekdayDisplay = weekdayDisplay.substring(0, 3).toUpperCase();
        } else if (dateFormat === 'mm/dd/yy') {
            // For US format, show month first, day second
            monthDisplay = monthDisplay.substring(0, 3).toUpperCase();
            weekdayDisplay = weekdayDisplay.substring(0, 3).toUpperCase();
        } else if (dateFormat === 'yyyy-mm-dd') {
            // ISO format - show full names
            monthDisplay = monthDisplay;
            weekdayDisplay = weekdayDisplay;
        }

        const dateLockIconHtml = getLockIconHtml('infoBox', 'date');

        row1Widgets.push(`
            <div class="rpg-dashboard-widget rpg-calendar-widget">
                ${dateLockIconHtml}
                <div class="rpg-calendar-top rpg-editable" contenteditable="true" data-field="month" data-full-value="${data.month || ''}" title="${i18n.getTranslation('infoBox.clickToEdit')}">${monthDisplay}</div>
                <div class="rpg-calendar-day" title="${i18n.getTranslation('infoBox.clickToEdit')}"><span class="rpg-calendar-day-text rpg-editable" contenteditable="true" data-field="weekday" data-full-value="${data.weekday || ''}">${weekdayDisplay}</span></div>
                <div class="rpg-calendar-year rpg-editable" contenteditable="true" data-field="year" data-full-value="${data.year || ''}" title="${i18n.getTranslation('infoBox.clickToEdit')}">${yearDisplay}</div>
            </div>
        `);
    }

    // Weather widget - show if enabled
    if (config?.widgets?.weather?.enabled) {
        const weatherEmoji = data.weatherEmoji || '🌤️';
        const weatherForecast = data.weatherForecast || i18n.getTranslation('infoBox.weatherFallback');
        const weatherLockIconHtml = getLockIconHtml('infoBox', 'weather');

        row1Widgets.push(`
            <div class="rpg-dashboard-widget rpg-weather-widget">
                ${weatherLockIconHtml}
                <div class="rpg-weather-icon rpg-editable" contenteditable="true" data-field="weatherEmoji" title="${i18n.getTranslation('userStats.clickToEditEmoji')}">${weatherEmoji}</div>
                <div class="rpg-weather-forecast rpg-editable" contenteditable="true" data-field="weatherForecast" title="${i18n.getTranslation('infoBox.clickToEdit')}">${weatherForecast}</div>
            </div>
        `);
    }

    // Temperature widget - show if enabled
    if (config?.widgets?.temperature?.enabled) {
        let tempDisplay = data.temperature || '20°C';
        let tempValue = data.tempValue || 20;

        // Apply temperature unit conversion
        const preferredUnit = config.widgets.temperature.unit || 'C';
        if (data.temperature) {
            // Detect current unit in the data
            const isCelsius = tempDisplay.includes('°C');
            const isFahrenheit = tempDisplay.includes('°F');

            if (preferredUnit === 'F' && isCelsius) {
                // Convert C to F
                const fahrenheit = Math.round((tempValue * 9 / 5) + 32);
                tempDisplay = `${fahrenheit}°F`;
                tempValue = fahrenheit;
            } else if (preferredUnit === 'C' && isFahrenheit) {
                // Convert F to C
                const celsius = Math.round((tempValue - 32) * 5 / 9);
                tempDisplay = `${celsius}°C`;
                tempValue = celsius;
            }
        } else {
            // No data yet, use default for preferred unit
            tempDisplay = preferredUnit === 'F' ? '68°F' : '20°C';
            tempValue = preferredUnit === 'F' ? 68 : 20;
        }

        // Calculate thermometer display (convert to Celsius for consistent thresholds)
        const tempInCelsius = preferredUnit === 'F' ? Math.round((tempValue - 32) * 5 / 9) : tempValue;
        const tempPercent = Math.min(100, Math.max(0, ((tempInCelsius + 20) / 60) * 100));
        const tempColor = tempInCelsius < 10 ? '#4a90e2' : tempInCelsius < 25 ? '#67c23a' : '#e94560';
        const tempLockIconHtml = getLockIconHtml('infoBox', 'temperature');

        row1Widgets.push(`
            <div class="rpg-dashboard-widget rpg-temp-widget">
                ${tempLockIconHtml}
                <div class="rpg-thermometer">
                    <div class="rpg-thermometer-bulb"></div>
                    <div class="rpg-thermometer-tube">
                        <div class="rpg-thermometer-fill" style="height: ${tempPercent}%; background: ${tempColor}"></div>
                    </div>
                </div>
                <div class="rpg-temp-value rpg-editable" contenteditable="true" data-field="temperature" title="${i18n.getTranslation('infoBox.clickToEdit')}">${tempDisplay}</div>
            </div>
        `);
    }

    // Time widget - show if enabled
    if (config?.widgets?.time?.enabled) {
        // Get both start and end times
        const timeStartDisplay = data.timeStart || '12:00';
        const timeEndDisplay = data.timeEnd || data.timeStart || '12:00';

        // Parse end time for clock hands (use end time for visual display)
        const timeMatch = timeEndDisplay.match(/(\d+):(\d+)/);
        let hourAngle = 0;
        let minuteAngle = 0;
        if (timeMatch) {
            const hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            hourAngle = (hours % 12) * 30 + minutes * 0.5; // 30° per hour + 0.5° per minute
            minuteAngle = minutes * 6; // 6° per minute
        }

        const timeLockIconHtml = getLockIconHtml('infoBox', 'time');

        row1Widgets.push(`
            <div class="rpg-dashboard-widget rpg-clock-widget">
                ${timeLockIconHtml}
                <div class="rpg-clock">
                    <div class="rpg-clock-face">
                        <div class="rpg-clock-hour" style="transform: rotate(${hourAngle}deg)"></div>
                        <div class="rpg-clock-minute" style="transform: rotate(${minuteAngle}deg)"></div>
                        <div class="rpg-clock-center"></div>
                    </div>
                </div>
                <div class="rpg-time-range">
                    <div class="rpg-time-value rpg-editable" contenteditable="true" data-field="timeStart" title="${i18n.getTranslation('infoBox.clickToEdit')}">${timeStartDisplay}</div>
                    <span class="rpg-time-separator">→</span>
                    <div class="rpg-time-value rpg-editable" contenteditable="true" data-field="timeEnd" title="${i18n.getTranslation('infoBox.clickToEdit')}">${timeEndDisplay}</div>
                </div>
            </div>
        `);
    }

    // Only create row 1 if there are widgets to show
    if (row1Widgets.length > 0) {
        html += '<div class="rpg-dashboard rpg-dashboard-row-1">';
        html += row1Widgets.join('');
        html += '</div>';
    }

    // Row 2: Location widget (full width) - show if enabled
    if (config?.widgets?.location?.enabled) {
        const locationDisplay = data.location || i18n.getTranslation('infoBox.locationFallback');
        const locationLockIconHtml = getLockIconHtml('infoBox', 'location');

        html += `
            <div class="rpg-dashboard rpg-dashboard-row-2">
                <div class="rpg-dashboard-widget rpg-location-widget">
                    ${locationLockIconHtml}
                    <div class="rpg-map-bg">
                        <div class="rpg-map-marker">📍</div>
                    </div>
                    <div class="rpg-location-text rpg-editable" contenteditable="true" data-field="location" title="${i18n.getTranslation('infoBox.clickToEdit')}">${locationDisplay}</div>
                </div>
            </div>
        `;
    }

    // Row 3: Recent Events widget (notebook style) - show if enabled
    if (config?.widgets?.recentEvents?.enabled) {
        // Parse Recent Events from infoBox (supports both JSON and text formats)
        let recentEvents = [];
        if (infoBoxData) {
            // Try JSON format first
            try {
                const parsed = typeof infoBoxData === 'string'
                    ? JSON.parse(infoBoxData)
                    : infoBoxData;

                if (parsed && Array.isArray(parsed.recentEvents)) {
                    recentEvents = parsed.recentEvents;
                }
            } catch (e) {
                // Fall back to old text format
                const recentEventsLine = infoBoxData.split('\n').find(line => line.startsWith('Recent Events:'));
                if (recentEventsLine) {
                    const eventsString = recentEventsLine.replace('Recent Events:', '').trim();
                    if (eventsString) {
                        recentEvents = eventsString.split(',').map(e => e.trim()).filter(e => e);
                    }
                }
            }
        }

        const validEvents = recentEvents.filter(e => e && e.trim() && e !== 'Event 1' && e !== 'Event 2' && e !== 'Event 3');

        // If no valid events, show at least one placeholder
        if (validEvents.length === 0) {
            validEvents.push('Click to add event');
        }

        const eventsLockIconHtml = getLockIconHtml('infoBox', 'recentEvents');

        html += `
            <div class="rpg-dashboard rpg-dashboard-row-3">
                <div class="rpg-dashboard-widget rpg-events-widget">
                    ${eventsLockIconHtml}
                    <div class="rpg-notebook-header">
                        <div class="rpg-notebook-ring"></div>
                        <div class="rpg-notebook-ring"></div>
                        <div class="rpg-notebook-ring"></div>
                    </div>
                    <div class="rpg-notebook-title" data-i18n-key="infobox.recentEvents.title">${i18n.getTranslation('infobox.recentEvents.title')}</div>
                    <div class="rpg-notebook-lines">
        `;

        // Dynamically generate event lines (max 3)
        for (let i = 0; i < Math.min(validEvents.length, 3); i++) {
            html += `
                        <div class="rpg-notebook-line">
                            <span class="rpg-bullet">•</span>
                            <span class="rpg-event-text rpg-editable" contenteditable="true" data-field="event${i + 1}" title="${i18n.getTranslation('infoBox.clickToEdit')}">${validEvents[i]}</span>
                        </div>
            `;
        }

        // If we have less than 3 events, add empty placeholders with + icon
        for (let i = validEvents.length; i < 3; i++) {
            html += `
                        <div class="rpg-notebook-line rpg-event-add">
                            <span class="rpg-bullet">+</span>
                            <span class="rpg-event-text rpg-editable rpg-event-placeholder" contenteditable="true" data-field="event${i + 1}" title="Click to add event" data-i18n-key="infobox.recentEvents.addEventPlaceholder">${i18n.getTranslation('infobox.recentEvents.addEventPlaceholder')}</span>
                        </div>
            `;
        }

        html += `
                    </div>
                </div>
            </div>
        `;
    }

    // Close the scrollable content wrapper
    html += '</div>';

    $infoBoxContainer.html(html);

    // Add dynamic text scaling for location field
    const updateLocationTextSize = ($element) => {
        const text = $element.text();
        const charCount = text.length;
        $element.css('--char-count', Math.min(charCount, 100));
    };

    // Initial size update for location
    const $locationText = $infoBoxContainer.find('[data-field="location"]');
    if ($locationText.length) {
        updateLocationTextSize($locationText);
    }

    // Add event handlers for editable Info Box fields
    $infoBoxContainer.find('.rpg-editable').on('blur', function () {
        const $this = $(this);
        const field = $this.data('field');
        const value = $this.text().trim();

        // For date fields, update the data-full-value immediately
        if (field === 'month' || field === 'weekday' || field === 'year') {
            $this.data('full-value', value);
            // Update the display to show abbreviated version
            if (field === 'month' || field === 'weekday') {
                $this.text(value.substring(0, 3).toUpperCase());
            } else {
                $this.text(value);
            }
        }

        // Update location text size dynamically
        if (field === 'location') {
            updateLocationTextSize($this);
        }

        // Handle recent events separately
        if (field === 'event1' || field === 'event2' || field === 'event3') {
            updateRecentEvent(field, value);
        } else {
            updateInfoBoxField(field, value);
        }

        // Update FAB widgets to reflect changes
        updateFabWidgets();
    });

    // Update location size on input as well (real-time)
    $infoBoxContainer.find('[data-field="location"]').on('input', function () {
        updateLocationTextSize($(this));
    });

    // For date fields, show full value on focus
    $infoBoxContainer.find('[data-field="month"], [data-field="weekday"], [data-field="year"]').on('focus', function () {
        const fullValue = $(this).data('full-value');
        if (fullValue) {
            $(this).text(fullValue);
        }
    });

    // Add event handler for lock icons (support both click and touch)
    $infoBoxContainer.find('.rpg-section-lock-icon').on('click touchend', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const $lockIcon = $(this);
        const tracker = $lockIcon.data('tracker');
        const path = $lockIcon.data('path');

        // Import lockManager dynamically to avoid circular dependencies
        import('../generation/lockManager.js').then(({ setItemLock, isItemLocked }) => {
            const isLocked = isItemLocked(tracker, path);
            const newLockState = !isLocked;
            setItemLock(tracker, path, newLockState);

            // Update icon
            $lockIcon.text(newLockState ? '🔒' : '🔓');
            $lockIcon.attr('title', newLockState ? i18n.getTranslation('infoBox.locked') : i18n.getTranslation('infoBox.unlocked'));
            $lockIcon.toggleClass('locked', newLockState);

            // Save settings to persist lock state
            saveSettings();
        });
    });

    // Remove updating class after animation
    if (extensionSettings.enableAnimations) {
        setTimeout(() => $infoBoxContainer.removeClass('rpg-content-updating'), 500);
    }

    // Update weather effect after rendering
    if (window.RPGCompanion?.updateWeatherEffect) {
        window.RPGCompanion.updateWeatherEffect();
    }
}

/**
 * Updates a specific field in the Info Box data and re-renders.
 * Handles complex field reconstruction logic for date parts, weather, temperature, time, and location.
 *
 * @param {string} field - Field name to update
 * @param {string} value - New value for the field
 */
export function updateInfoBoxField(field, value) {
    // Read current info box from swipe store
    let infoBoxData = getTrackerDataForContext('infoBox');
    if (!infoBoxData) {
        // Initialize with empty info box if it doesn't exist
        infoBoxData = 'Info Box\n---\n';
    }

    // Check if data is in v3 JSON format
    const trimmed = infoBoxData.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        console.log('[RPG Companion] Updating info box field (v3 JSON):', { field, value });
        // Handle v3 JSON format
        const jsonData = repairJSON(infoBoxData);
        if (jsonData) {
            // Update the appropriate field based on v3 structure
            if (field === 'weatherEmoji') {
                if (!jsonData.weather) jsonData.weather = {};
                jsonData.weather.emoji = value;
            } else if (field === 'weatherForecast') {
                if (!jsonData.weather) jsonData.weather = {};
                jsonData.weather.forecast = value;
            } else if (field === 'temperature') {
                // Parse temperature value and unit
                const tempMatch = value.match(/(-?\d+)\s*°?\s*([CF]?)/i);
                if (tempMatch) {
                    if (!jsonData.temperature) jsonData.temperature = {};
                    jsonData.temperature.value = parseInt(tempMatch[1]);
                    jsonData.temperature.unit = (tempMatch[2] || 'C').toUpperCase();
                }
            } else if (field === 'timeStart') {
                if (!jsonData.time) jsonData.time = {};
                jsonData.time.start = value;
            } else if (field === 'timeEnd') {
                if (!jsonData.time) jsonData.time = {};
                jsonData.time.end = value;
            } else if (field === 'location') {
                if (!jsonData.location) jsonData.location = {};
                jsonData.location.value = value;
            } else if (field === 'weekday' || field === 'month' || field === 'year') {
                // Update date components
                if (!jsonData.date) jsonData.date = {};
                let currentDate = jsonData.date.value || '';
                const dateParts = currentDate.split(',').map(p => p.trim());

                if (field === 'weekday') {
                    dateParts[0] = value;
                } else if (field === 'month') {
                    dateParts[1] = value;
                } else if (field === 'year') {
                    dateParts[2] = value;
                }

                jsonData.date.value = dateParts.filter(p => p).join(', ');
            }

            // Save back as JSON and persist to swipe store
            const updatedData = JSON.stringify(jsonData, null, 2);
            extensionSettings.infoBox = updatedData; // Update settings cache
            updateMessageSwipeData();
            saveChatData();
            renderInfoBox();
            return;
        }
    }
}

/**
 * Update a recent event in the committed tracker data
 * @param {string} field - event1, event2, or event3
 * @param {string} value - New event text
 */
function updateRecentEvent(field, value) {
    const eventIndex = {
        'event1': 0,
        'event2': 1,
        'event3': 2
    }[field];

    if (eventIndex === undefined) return;

    // Read current info box from swipe store
    let infoBoxData = getTrackerDataForContext('infoBox');
    if (!infoBoxData) {
        infoBoxData = 'Info Box\n---\n';
    }

    // Handle v3 JSON format
    const jsonData = repairJSON(infoBoxData);
    if (jsonData) {
        if (!jsonData.recentEvents) {
            jsonData.recentEvents = [];
        }
        // Ensure array has enough slots
        while (jsonData.recentEvents.length <= eventIndex) {
            jsonData.recentEvents.push('');
        }
        jsonData.recentEvents[eventIndex] = value;

        // Save back as JSON and persist
        const updatedData = JSON.stringify(jsonData, null, 2);
        extensionSettings.infoBox = updatedData;
        updateMessageSwipeData();
        saveChatData();
        renderInfoBox();
    }
}
