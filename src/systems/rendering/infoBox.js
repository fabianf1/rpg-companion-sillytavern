/**
 * Info Box Rendering Module
 * Handles rendering of the info box dashboard with weather, date, time, and location widgets
 */

import { i18n } from "../../core/i18n.js";
import {
	saveChatData,
	saveSettings,
	updateMessageSwipeData,
} from "../../core/persistence.js";
import { $infoBoxContainer, extensionSettings } from "../../core/state.js";
import { convertTimeFormat } from "../../utils/itemParser.js";
import { setItemLock, isItemLocked } from "../generation/lockManager.js";
import { getTrackerDataForContext } from "../generation/trackerDataUtils.js";
import { updateFabWidgets } from "../ui/mobile.js";
import { escapeHtml } from "../../utils/html.js";
import { getLockIconHtml } from "../../utils/lockIcon.js";
import { convertTemperature } from "../../utils/format.js";

// Constants
const TRACKER_NAME = "infoBox";
const MAX_RECENT_EVENTS = 3;
const EVENT_FIELDS = ["event1", "event2", "event3"];
const DATE_FIELDS = ["weekday", "month", "year"];

/**
 * Renders the info box as a visual dashboard with calendar, weather, temperature, clock, and map widgets.
 * Includes event listeners for editable fields.
 */
/**
 * State tracking for render optimization - skips re-render if data unchanged
 */
let lastInfoBoxDataHash = null;

/**
 * Computes a simple hash of data for change detection
 * @param {*} data - Data to hash
 * @returns {string} Hash string
 */
function computeDataHash(data) {
	try {
		return JSON.stringify(data);
	} catch {
		return null;
	}
}

export function renderInfoBox() {
	// console.log('[RPG InfoBox Render] ==================== RENDERING INFO BOX ====================');
	// console.log('[RPG InfoBox Render] showInfoBox setting:', extensionSettings.showInfoBox);
	// console.log('[RPG InfoBox Render] Container exists:', !!$infoBoxContainer);

	if (!extensionSettings.showInfoBox || !$infoBoxContainer) {
		// console.log('[RPG InfoBox Render] Exiting: showInfoBox or container is false');
		return;
	}

	// Read info box data from swipe store
	const infoBoxData = getTrackerDataForContext("infoBox");

	// State diffing: Skip render if data hasn't changed
	const currentHash = computeDataHash(infoBoxData);
	if (currentHash && currentHash === lastInfoBoxDataHash) {
		return; // Skip re-render - data unchanged
	}
	lastInfoBoxDataHash = currentHash;
	// console.log('[RPG InfoBox Render] infoBoxData length:', infoBoxData ? infoBoxData.length : 'null');
	// console.log('[RPG InfoBox Render] infoBoxData preview:', infoBoxData ? infoBoxData.substring(0, 200) : 'null');

	// If no data yet, hide the container (e.g., after cache clear)
	if (!infoBoxData) {
		console.log("[RPG InfoBox Render] No data, hiding container");
		$infoBoxContainer.empty().hide();
		return;
	}

	// Show container and add updating class for animation
	$infoBoxContainer.show();
	if (extensionSettings.enableAnimations) {
		$infoBoxContainer.addClass("rpg-content-updating");
	}

	// console.log('[RPG Companion] renderInfoBox called with data:', infoBoxData);

	const data = {
		date: "",
		weekday: "",
		month: "",
		year: "",
		weatherIcon: "",
		weatherCondition: "",
		tempOutdoor: "",
		tempOutdoorValue: 0,
		tempOutdoorUnit: "C",
		tempIndoor: "",
		tempIndoorValue: 0,
		tempIndoorUnit: "C",
		tempIndoorClimate: "",
		hasIndoorTemp: false,
		timeStart: "",
		timeEnd: "",
		location: "",
	};

	// Extract from v3 JSON structure (new format: icon/condition)
	data.weatherIcon = infoBoxData.weather?.icon || "";
	data.weatherCondition = infoBoxData.weather?.condition || "";
	// Temperature: new nested structure with outdoor/indoor
	data.tempOutdoorValue = infoBoxData.temperature?.outdoor?.value || 0;
	data.tempOutdoorUnit = infoBoxData.temperature?.outdoor?.unit || "C";
	data.tempOutdoor = data.tempOutdoorValue ? `${data.tempOutdoorValue}°${data.tempOutdoorUnit}` : "";
	data.tempIndoorValue = infoBoxData.temperature?.indoor?.value || 0;
	data.tempIndoorUnit = infoBoxData.temperature?.indoor?.unit || "C";
	data.tempIndoor = data.tempIndoorValue ? `${data.tempIndoorValue}°${data.tempIndoorUnit}` : "";
	data.tempIndoorClimate = infoBoxData.temperature?.indoor?.climate || "";
	data.hasIndoorTemp = !!infoBoxData.temperature?.indoor;
	data.timeStart = infoBoxData.time?.start || "";
	data.timeEnd = infoBoxData.time?.end || "";
	data.location = infoBoxData.location?.value || "";

	// Parse date string to extract weekday, month, year
	if (infoBoxData.date?.value) {
		data.date = infoBoxData.date.value;
		// Expected format: "Tuesday, October 17th, 2023"
		const dateParts = data.date.split(",").map((p) => p.trim());
		data.weekday = dateParts[0] || "";
		data.month = dateParts[1] || "";
		data.year = dateParts[2] || "";
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
		let monthDisplay = data.month || "MON";
		let weekdayDisplay = data.weekday || "DAY";
		const yearDisplay = data.year || "YEAR";

		// Apply format based on config
		const dateFormat = config.widgets.date.format || "dd/mm/yy";
		if (dateFormat === "dd/mm/yy") {
			monthDisplay = monthDisplay.substring(0, 3).toUpperCase();
			weekdayDisplay = weekdayDisplay.substring(0, 3).toUpperCase();
		} else if (dateFormat === "mm/dd/yy") {
			// For US format, show month first, day second
			monthDisplay = monthDisplay.substring(0, 3).toUpperCase();
			weekdayDisplay = weekdayDisplay.substring(0, 3).toUpperCase();
		} else if (dateFormat === "yyyy-mm-dd") {
			// ISO format - show full names
			// monthDisplay = monthDisplay;
			// weekdayDisplay = weekdayDisplay;
		}

		const dateLockIconHtml = getLockIconHtml(TRACKER_NAME, "date");

		row1Widgets.push(`
            <div class="rpg-dashboard-widget rpg-calendar-widget">
                ${dateLockIconHtml}
                <div class="rpg-calendar-top rpg-editable" contenteditable="true" data-field="month" data-full-value="${escapeHtml(data.month || "")}" title="${i18n.getTranslation("infoBox.clickToEdit")}">${monthDisplay}</div>
                <div class="rpg-calendar-day" title="${i18n.getTranslation("infoBox.clickToEdit")}"><span class="rpg-calendar-day-text rpg-editable" contenteditable="true" data-field="weekday" data-full-value="${escapeHtml(data.weekday || "")}">${weekdayDisplay}</span></div>
                <div class="rpg-calendar-year rpg-editable" contenteditable="true" data-field="year" data-full-value="${escapeHtml(data.year || "")}" title="${i18n.getTranslation("infoBox.clickToEdit")}">${yearDisplay}</div>
            </div>
        `);
	}

	// Weather widget - combined with outdoor temperature if enabled
	if (config?.widgets?.weather?.enabled) {
		const weatherIcon = data.weatherIcon || "🌤️";
		const weatherCondition =
			data.weatherCondition || i18n.getTranslation("infoBox.weatherFallback");
		const weatherLockIconHtml = getLockIconHtml(TRACKER_NAME, "weather");

		// Check if temperature is also enabled - show outdoor temp beside weather
		let outdoorTempHtml = "";
		if (config?.widgets?.temperature?.enabled) {
			const preferredUnit = config.widgets.temperature.unit || "C";

			// Process outdoor temperature
			let outdoorValue = data.tempOutdoorValue || (preferredUnit === "F" ? 68 : 20);
			let outdoorUnit = data.tempOutdoorUnit || preferredUnit;

			// Apply unit conversion if needed
			if (data.tempOutdoorValue) {
				if (preferredUnit === "F" && outdoorUnit === "C") {
					outdoorValue = convertTemperature(outdoorValue, "C", "F");
					outdoorUnit = "F";
				} else if (preferredUnit === "C" && outdoorUnit === "F") {
					outdoorValue = convertTemperature(outdoorValue, "F", "C");
					outdoorUnit = "C";
				}
			}

			const outdoorLockIconHtml = getLockIconHtml(TRACKER_NAME, "temperature.outdoor");
			const display = `${outdoorValue}°${outdoorUnit}`;

			outdoorTempHtml = `
                <div class="rpg-weather-temp">
                    <div class="rpg-thermometer-mini">
                        <div class="rpg-thermometer-mini-tube">
                            <div class="rpg-thermometer-mini-fill"></div>
                        </div>
                    </div>
                    <div class="rpg-temp-value rpg-editable" contenteditable="true" data-field="temperatureOutdoor" title="${i18n.getTranslation("infoBox.clickToEdit")}">${display}</div>
                    ${outdoorLockIconHtml}
                </div>
            `;
		}

		row1Widgets.push(`
            <div class="rpg-dashboard-widget rpg-weather-widget rpg-weather-with-temp">
                ${weatherLockIconHtml}
                <div class="rpg-weather-content">
                    <div class="rpg-weather-icon rpg-editable" contenteditable="true" data-field="weatherIcon" title="${i18n.getTranslation("userStats.clickToEditEmoji")}">${weatherIcon}</div>
                    <div class="rpg-weather-condition rpg-editable" contenteditable="true" data-field="weatherCondition" title="${i18n.getTranslation("infoBox.clickToEdit")}">${escapeHtml(weatherCondition)}</div>
                </div>
                ${outdoorTempHtml}
            </div>
        `);
	} else if (config?.widgets?.temperature?.enabled) {
		// Temperature widget standalone if weather is disabled
		const preferredUnit = config.widgets.temperature.unit || "C";

		// Helper to build a thermometer gauge
		const buildThermometerGauge = (value, unit, label, lockIcon, editableField, climate = "") => {
			const inCelsius = unit === "F" ? convertTemperature(value, "F", "C") : value;
			const percent = Math.min(100, Math.max(0, ((inCelsius + 20) / 60) * 100));
			const color = inCelsius < 10 ? "#4a90e2" : inCelsius < 25 ? "#67c23a" : "#e94560";
			const display = `${value}°${unit}`;
			const climateHtml = climate ? `<div class="rpg-temp-climate">${escapeHtml(climate)}</div>` : "";

			return `
                <div class="rpg-temp-gauge">
                    <div class="rpg-temp-gauge-header">${lockIcon} <span class="rpg-temp-gauge-label">${label}</span></div>
                    <div class="rpg-thermometer">
                        <div class="rpg-thermometer-bulb"></div>
                        <div class="rpg-thermometer-tube">
                            <div class="rpg-thermometer-fill" style="height: ${percent}%; background: ${color}"></div>
                        </div>
                    </div>
                    <div class="rpg-temp-value rpg-editable" contenteditable="true" data-field="${editableField}" title="${i18n.getTranslation("infoBox.clickToEdit")}">${display}</div>
                    ${climateHtml}
                </div>
            `;
		};

		// --- Outdoor temperature ---
		let outdoorValue = data.tempOutdoorValue || (preferredUnit === "F" ? 68 : 20);
		let outdoorUnit = data.tempOutdoorUnit || preferredUnit;

		// Apply unit conversion if needed
		if (data.tempOutdoorValue) {
			if (preferredUnit === "F" && outdoorUnit === "C") {
				outdoorValue = convertTemperature(outdoorValue, "C", "F");
				outdoorUnit = "F";
			} else if (preferredUnit === "C" && outdoorUnit === "F") {
				outdoorValue = convertTemperature(outdoorValue, "F", "C");
				outdoorUnit = "C";
			}
		}

		const outdoorLockIconHtml = getLockIconHtml(TRACKER_NAME, "temperature.outdoor");
		const outdoorGauge = buildThermometerGauge(outdoorValue, outdoorUnit, "🌤️", outdoorLockIconHtml, "temperatureOutdoor");

		// --- Indoor temperature (optional) ---
		let indoorGauge = "";
		if (data.hasIndoorTemp) {
			let indoorValue = data.tempIndoorValue || 20;
			let indoorUnit = data.tempIndoorUnit || preferredUnit;

			// Apply unit conversion if needed
			if (data.tempIndoorValue) {
				if (preferredUnit === "F" && indoorUnit === "C") {
					indoorValue = convertTemperature(indoorValue, "C", "F");
					indoorUnit = "F";
				} else if (preferredUnit === "C" && indoorUnit === "F") {
					indoorValue = convertTemperature(indoorValue, "F", "C");
					indoorUnit = "C";
				}
			}

			const indoorLockIconHtml = getLockIconHtml(TRACKER_NAME, "temperature.indoor");
			indoorGauge = buildThermometerGauge(indoorValue, indoorUnit, "🏠", indoorLockIconHtml, "temperatureIndoor", data.tempIndoorClimate);
		}

		row1Widgets.push(`
            <div class="rpg-dashboard-widget rpg-temp-widget${data.hasIndoorTemp ? " rpg-temp-has-indoor" : ""}">
                <div class="rpg-temp-gauges">
                    ${outdoorGauge}
                    ${indoorGauge}
                </div>
            </div>
        `);
	}

	// Indoor temperature widget - separate block (only if enabled, weather is enabled, and indoor temp exists)
	if (config?.widgets?.temperature?.enabled && config?.widgets?.weather?.enabled && data.hasIndoorTemp) {
		const preferredUnit = config.widgets.temperature.unit || "C";

		// Process indoor temperature
		let indoorValue = data.tempIndoorValue || 20;
		let indoorUnit = data.tempIndoorUnit || preferredUnit;

		// Apply unit conversion if needed
		if (data.tempIndoorValue) {
			if (preferredUnit === "F" && indoorUnit === "C") {
				indoorValue = convertTemperature(indoorValue, "C", "F");
				indoorUnit = "F";
			} else if (preferredUnit === "C" && indoorUnit === "F") {
				indoorValue = convertTemperature(indoorValue, "F", "C");
				indoorUnit = "C";
			}
		}

		const indoorLockIconHtml = getLockIconHtml(TRACKER_NAME, "temperature.indoor");
		const display = `${indoorValue}°${indoorUnit}`;
		const climateHtml = data.tempIndoorClimate ? `<div class="rpg-indoor-climate">${escapeHtml(data.tempIndoorClimate)}</div>` : "";

		row1Widgets.push(`
            <div class="rpg-dashboard-widget rpg-indoor-temp-widget">
                ${indoorLockIconHtml}
                <div class="rpg-indoor-temp-header">🏠</div>
                <div class="rpg-temp-value rpg-editable" contenteditable="true" data-field="temperatureIndoor" title="${i18n.getTranslation("infoBox.clickToEdit")}">${display}</div>
                ${climateHtml}
            </div>
        `);
	}

	// Time widget - show if enabled
	if (config?.widgets?.time?.enabled) {
		// Get both start and end times
		const timeStartDisplay = data.timeStart || "12:00";
		const timeEndDisplay = data.timeEnd || data.timeStart || "12:00";

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

		const timeLockIconHtml = getLockIconHtml(TRACKER_NAME, "time");

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
                    <div class="rpg-time-value rpg-editable" contenteditable="true" data-field="timeStart" title="${i18n.getTranslation("infoBox.clickToEdit")}">${timeStartDisplay}</div>
                    <span class="rpg-time-separator">→</span>
                    <div class="rpg-time-value rpg-editable" contenteditable="true" data-field="timeEnd" title="${i18n.getTranslation("infoBox.clickToEdit")}">${timeEndDisplay}</div>
                </div>
            </div>
        `);
	}

	// Only create row 1 if there are widgets to show
	if (row1Widgets.length > 0) {
		html += '<div class="rpg-dashboard rpg-dashboard-row-1">';
		html += row1Widgets.join("");
		html += "</div>";
	}

	// Row 2: Location widget (full width) - show if enabled
	if (config?.widgets?.location?.enabled) {
		const locationDisplay =
			data.location || i18n.getTranslation("infoBox.locationFallback");
		const locationLockIconHtml = getLockIconHtml(TRACKER_NAME, "location");

		html += `
            <div class="rpg-dashboard rpg-dashboard-row-2">
                <div class="rpg-dashboard-widget rpg-location-widget">
                    ${locationLockIconHtml}
                    <div class="rpg-map-bg">
                        <div class="rpg-map-marker">📍</div>
                    </div>
                    <div class="rpg-location-text rpg-editable" contenteditable="true" data-field="location" title="${i18n.getTranslation("infoBox.clickToEdit")}">${escapeHtml(locationDisplay)}</div>
                </div>
            </div>
        `;
	}

	// Row 3: Recent Events widget (notebook style) - show if enabled
	if (config?.widgets?.recentEvents?.enabled) {
		// Parse Recent Events from infoBox
		let recentEvents = [];
		if (infoBoxData && Array.isArray(infoBoxData.recentEvents)) {
			recentEvents = infoBoxData.recentEvents;
		}

		const validEvents = recentEvents.filter(
			(e) =>
				e && e.trim() && e !== "Event 1" && e !== "Event 2" && e !== "Event 3",
		);

		// If no valid events, show at least one placeholder
		if (validEvents.length === 0) {
			validEvents.push("Click to add event");
		}

		const eventsLockIconHtml = getLockIconHtml(TRACKER_NAME, "recentEvents");

		html += `
            <div class="rpg-dashboard rpg-dashboard-row-3">
                <div class="rpg-dashboard-widget rpg-events-widget">
                    ${eventsLockIconHtml}
                    <div class="rpg-notebook-header">
                        <div class="rpg-notebook-ring"></div>
                        <div class="rpg-notebook-ring"></div>
                        <div class="rpg-notebook-ring"></div>
                    </div>
                    <div class="rpg-notebook-title" data-i18n-key="infobox.recentEvents.title">${i18n.getTranslation("infobox.recentEvents.title")}</div>
                    <div class="rpg-notebook-lines">
        `;

		// Dynamically generate event lines (max 3)
		for (let i = 0; i < Math.min(validEvents.length, MAX_RECENT_EVENTS); i++) {
			html += `
                        <div class="rpg-notebook-line">
                            <span class="rpg-bullet">•</span>
                            <span class="rpg-event-text rpg-editable" contenteditable="true" data-field="${EVENT_FIELDS[i]}" title="${i18n.getTranslation("infoBox.clickToEdit")}">${escapeHtml(validEvents[i])}</span>
                        </div>
            `;
		}

		// If we have less than 3 events, add empty placeholders with + icon
		for (let i = validEvents.length; i < MAX_RECENT_EVENTS; i++) {
			html += `
                        <div class="rpg-notebook-line rpg-event-add">
                            <span class="rpg-bullet">+</span>
                            <span class="rpg-event-text rpg-editable rpg-event-placeholder" contenteditable="true" data-field="${EVENT_FIELDS[i]}" title="Click to add event" data-i18n-key="infobox.recentEvents.addEventPlaceholder">${i18n.getTranslation("infobox.recentEvents.addEventPlaceholder")}</span>
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
	html += "</div>";

	$infoBoxContainer.html(html);

	// Add dynamic text scaling for location field
	const updateLocationTextSize = ($element) => {
		const text = $element.text();
		const charCount = text.length;
		$element.css("--char-count", Math.min(charCount, 100));
	};

	// Initial size update for location
	const $locationText = $infoBoxContainer.find('[data-field="location"]');
	if ($locationText.length) {
		updateLocationTextSize($locationText);
	}

	// Add event handlers for editable Info Box fields
	$infoBoxContainer.find(".rpg-editable").on("blur", function () {
		const $this = $(this);
		const field = $this.data("field");
		const value = $this.text().trim();

		// For date fields, update the data-full-value immediately
		if (field === "month" || field === "weekday" || field === "year") {
			$this.data("full-value", value);
			// Update the display to show abbreviated version
			if (field === "month" || field === "weekday") {
				$this.text(value.substring(0, 3).toUpperCase());
			} else {
				$this.text(value);
			}
		}

		// Update location text size dynamically
		if (field === "location") {
			updateLocationTextSize($this);
		}

		// Handle recent events separately
		if (EVENT_FIELDS.includes(field)) {
			updateRecentEvent(field, value);
		} else {
			updateInfoBoxField(field, value);
		}

		// Update FAB widgets to reflect changes
		updateFabWidgets();
	});

	// Update location size on input as well (real-time)
	$infoBoxContainer.find('[data-field="location"]').on("input", function () {
		updateLocationTextSize($(this));
	});

	// For date fields, show full value on focus
	$infoBoxContainer
		.find(`[${DATE_FIELDS.map((f) => `data-field="${f}"`).join("], [")}]`)
		.on("focus", function () {
			const fullValue = $(this).data("full-value");
			if (fullValue) {
				$(this).text(fullValue);
			}
		});

	// Add event handler for lock icons (support both click and touch)
	$infoBoxContainer
		.find(".rpg-section-lock-icon")
		.on("click touchend", function (e) {
			e.preventDefault();
			e.stopPropagation();
			const $lockIcon = $(this);
			const tracker = $lockIcon.data("tracker");
			const path = $lockIcon.data("path");

			const isLocked = isItemLocked(tracker, path);
			const newLockState = !isLocked;
			setItemLock(tracker, path, newLockState);

			// Update icon
			$lockIcon.text(newLockState ? "🔒" : "🔓");
			$lockIcon.attr(
				"title",
				newLockState
					? i18n.getTranslation("infoBox.locked")
					: i18n.getTranslation("infoBox.unlocked"),
			);
			$lockIcon.toggleClass("locked", newLockState);

			// Save settings to persist lock state
			saveSettings();
		});

	// Remove updating class after animation
	if (extensionSettings.enableAnimations) {
		setTimeout(
			() => $infoBoxContainer.removeClass("rpg-content-updating"),
			500,
		);
	}

	// Update weather effect after rendering
	if (window.RPGCompanion?.updateWeatherEffect) {
		window.RPGCompanion.updateWeatherEffect();
	}
}

/**
 * Persist infoBox data changes and re-render.
 * Centralizes the save + render pattern used by update functions.
 * @param {object} infoBoxData - Modified infoBox data to persist
 */
function persistInfoBoxChanges(infoBoxData) {
	updateMessageSwipeData(TRACKER_NAME, infoBoxData);
	saveChatData();
	renderInfoBox();
}

/**
 * Updates a specific field in the Info Box data and re-renders.
 * Handles complex field reconstruction logic for date parts, weather, temperature, time, and location.
 *
 * @param {string} field - Field name to update
 * @param {string} value - New value for the field
 */
function updateInfoBoxField(field, value) {
	const infoBoxData = getTrackerDataForContext(TRACKER_NAME);
	if (!infoBoxData) {
		return;
	}

	// Update the appropriate field based on v3 structure
	if (field === "weatherIcon") {
		if (!infoBoxData.weather) infoBoxData.weather = {};
		infoBoxData.weather.icon = value;
	} else if (field === "weatherCondition") {
		if (!infoBoxData.weather) infoBoxData.weather = {};
		infoBoxData.weather.condition = value;
	} else if (field === "temperatureOutdoor") {
		// Parse temperature value and unit for outdoor
		const tempMatch = value.match(/(-?\d+)\s*°?\s*([CF]?)/i);
		if (tempMatch) {
			if (!infoBoxData.temperature) infoBoxData.temperature = {};
			if (!infoBoxData.temperature.outdoor) infoBoxData.temperature.outdoor = {};
			infoBoxData.temperature.outdoor.value = parseInt(tempMatch[1]);
			infoBoxData.temperature.outdoor.unit = (tempMatch[2] || "C").toUpperCase();
		}
	} else if (field === "temperatureIndoor") {
		// Parse temperature value and unit for indoor
		const tempMatch = value.match(/(-?\d+)\s*°?\s*([CF]?)/i);
		if (tempMatch) {
			if (!infoBoxData.temperature) infoBoxData.temperature = {};
			if (!infoBoxData.temperature.indoor) infoBoxData.temperature.indoor = {};
			infoBoxData.temperature.indoor.value = parseInt(tempMatch[1]);
			infoBoxData.temperature.indoor.unit = (tempMatch[2] || "C").toUpperCase();
		}
	} else if (field === "timeStart") {
		if (!infoBoxData.time) infoBoxData.time = {};
		infoBoxData.time.start = convertTimeFormat(
			value,
			extensionSettings.trackerConfig.infoBox.widgets.time.format,
		);
	} else if (field === "timeEnd") {
		if (!infoBoxData.time) infoBoxData.time = {};
		infoBoxData.time.end = convertTimeFormat(
			value,
			extensionSettings.trackerConfig.infoBox.widgets.time.format,
		);
	} else if (field === "location") {
		if (!infoBoxData.location) infoBoxData.location = {};
		infoBoxData.location.value = value;
	} else if (DATE_FIELDS.includes(field)) {
		// Update date components
		if (!infoBoxData.date) infoBoxData.date = {};
		const currentDate = infoBoxData.date.value || "";
		const dateParts = currentDate.split(",").map((p) => p.trim());

		if (field === "weekday") {
			dateParts[0] = value;
		} else if (field === "month") {
			dateParts[1] = value;
		} else if (field === "year") {
			dateParts[2] = value;
		}

		infoBoxData.date.value = dateParts.filter((p) => p).join(", ");
	}

	// Persist changes
	persistInfoBoxChanges(infoBoxData);
}

/**
 * Update a recent event in the committed tracker data
 * @param {string} field - event1, event2, or event3
 * @param {string} value - New event text
 */
function updateRecentEvent(field, value) {
	const eventIndex = EVENT_FIELDS.indexOf(field);

	if (eventIndex === -1) return;

	// Read current info box from swipe store
	const infoBoxData = getTrackerDataForContext(TRACKER_NAME);
	if (!infoBoxData) {
		return;
	}

	if (!infoBoxData.recentEvents) {
		infoBoxData.recentEvents = [];
	}
	// Ensure array has enough slots
	while (infoBoxData.recentEvents.length <= eventIndex) {
		infoBoxData.recentEvents.push("");
	}
	infoBoxData.recentEvents[eventIndex] = value;

	// Persist changes
	persistInfoBoxChanges(infoBoxData);
}
