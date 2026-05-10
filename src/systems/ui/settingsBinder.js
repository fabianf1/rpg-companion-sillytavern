/**
 * Settings Binding Module
 * Data-driven binding between DOM elements and extensionSettings.
 * Eliminates repetitive boilerplate for toggle/select/input change handlers.
 */

import { saveSettings } from "../../core/persistence.js";
import { extensionSettings } from "../../core/state.js";
import { renderAppearance } from "../rendering/appearance.js";
import { renderInfoBox } from "../rendering/infoBox.js";
import { renderInventory } from "../rendering/inventory.js";
import { renderQuests } from "../rendering/quests.js";
import { renderThoughts, updateChatThoughts } from "../rendering/thoughts.js";
import { renderUserStats } from "../rendering/userStats.js";
import { updateStripWidgets } from "./desktop.js";
import {
	applyPanelPosition,
	togglePlotButtons,
	updateGenerationModeUI,
	updateSectionVisibility,
} from "./layout.js";
import { updateFabWidgets } from "./mobile.js";
import { getSettingsModal, updateDiceDisplay } from "./modals.js";
import {
	applyCustomTheme,
	applyTheme,
	toggleCustomColors,
	updateFeatureTogglesVisibility,
	updateSettingsPopupTheme,
} from "./theme.js";
import {
	toggleDynamicWeather,
	updateWeatherSubOptionsVisibility,
} from "./weatherEffects.js";

/**
 * @typedef {Object} BindingEntry
 * @property {string} selector - CSS selector for the DOM element
 * @property {string} key - Dot-notation path into extensionSettings (e.g. "showUserStats" or "customColors.bg")
 * @property {"boolean"|"string"|"int"} type - How to read/write the value
 * @property {Function} [onUpdate] - Optional callback after setting the value
 * @property {*} [defaultValue] - Default value if setting is undefined
 * @property {boolean} [saveOnInput] - For range sliders: save on change event instead of input
 */

/**
 * Binding map: each entry describes one settings UI control.
 */
export const SETTING_BINDINGS = [
	// ── Section Visibility Toggles ──
	{ selector: "#rpg-toggle-auto-update", key: "autoUpdate", type: "boolean" },
	{
		selector: "#rpg-toggle-user-stats",
		key: "showUserStats",
		type: "boolean",
		onUpdate: updateSectionVisibility,
	},
	{
		selector: "#rpg-toggle-info-box",
		key: "showInfoBox",
		type: "boolean",
		onUpdate: updateSectionVisibility,
	},
	{
		selector: "#rpg-toggle-thoughts",
		key: "showCharacterThoughts",
		type: "boolean",
		onUpdate: updateSectionVisibility,
	},
	{
		selector: "#rpg-toggle-inventory",
		key: "showInventory",
		type: "boolean",
		onUpdate: updateSectionVisibility,
	},
	{
		selector: "#rpg-toggle-quests",
		key: "showQuests",
		type: "boolean",
		onUpdate: updateSectionVisibility,
	},
	{
		selector: "#rpg-toggle-lock-icons",
		key: "showLockIcons",
		type: "boolean",
		defaultValue: true,
		onUpdate: () => {
			renderUserStats();
			renderInfoBox();
			renderThoughts();
			renderInventory();
			renderQuests();
			renderAppearance();
		},
	},
	{
		selector: "#rpg-toggle-thoughts-in-chat",
		key: "showThoughtsInChat",
		type: "boolean",
		onUpdate: updateChatThoughts,
	},
	{
		selector: "#rpg-toggle-dice-display",
		key: "showDiceDisplay",
		type: "boolean",
		onUpdate: updateDiceDisplay,
	},
	{
		selector: "#rpg-toggle-relationships",
		key: "showRelationships",
		type: "boolean",
		onUpdate: updateSectionVisibility,
	},
	{
		selector: "#rpg-relationship-status-options",
		key: "trackerConfig.presentCharacters.relationships.statusOptions",
		type: "commaSeparated",
		defaultValue: ["Friends", "Enemies", "Lovers", "Rivals", "Family", "Neutral"],
	},

	// ── Feature Toggles ──
	{
		selector: "#rpg-toggle-dynamic-weather",
		key: "enableDynamicWeather",
		type: "boolean",
		onUpdate: () =>
			toggleDynamicWeather(extensionSettings.enableDynamicWeather),
	},
	{ selector: "#rpg-toggle-narrator", key: "narratorMode", type: "boolean" },
	{
		selector: "#rpg-toggle-randomized-plot",
		key: "enableRandomizedPlot",
		type: "boolean",
		defaultValue: true,
		onUpdate: togglePlotButtons,
	},
	{
		selector: "#rpg-toggle-natural-plot",
		key: "enableNaturalPlot",
		type: "boolean",
		defaultValue: true,
		onUpdate: togglePlotButtons,
	},

	// ── Feature Toggle Visibility ──
	{
		selector: "#rpg-toggle-show-dynamic-weather-toggle",
		key: "showDynamicWeatherToggle",
		type: "boolean",
		defaultValue: true,
		onUpdate: () => {
			if (!extensionSettings.showDynamicWeatherToggle) {
				extensionSettings.enableDynamicWeather = false;
				$("#rpg-toggle-dynamic-weather").prop("checked", false);
				toggleDynamicWeather(false);
			}
			updateFeatureTogglesVisibility();
			updateWeatherSubOptionsVisibility();
		},
	},
	{
		selector: "#rpg-toggle-show-narrator-mode",
		key: "showNarratorMode",
		type: "boolean",
		defaultValue: true,
		onUpdate: () => {
			if (!extensionSettings.showNarratorMode) {
				extensionSettings.narratorMode = false;
				$("#rpg-toggle-narrator").prop("checked", false);
			}
			updateFeatureTogglesVisibility();
		},
	},

	// ── Weather Sub-options (radio buttons) ──
	{
		selector: "#rpg-toggle-weather-background",
		key: "weatherBackground",
		type: "boolean",
		defaultValue: true,
		onUpdate: () => {
			if (extensionSettings.weatherBackground) {
				extensionSettings.weatherForeground = false;
				$("#rpg-toggle-weather-foreground").prop("checked", false);
				reapplyWeather();
			}
		},
	},
	{
		selector: "#rpg-toggle-weather-foreground",
		key: "weatherForeground",
		type: "boolean",
		defaultValue: false,
		onUpdate: () => {
			if (extensionSettings.weatherForeground) {
				extensionSettings.weatherBackground = false;
				$("#rpg-toggle-weather-background").prop("checked", false);
				reapplyWeather();
			}
		},
	},

	// ── Select / Dropdown Inputs ──
	{
		selector: "#rpg-position-select",
		key: "panelPosition",
		type: "string",
		onUpdate: () => {
			applyPanelPosition();
			updateChatThoughts();
		},
	},
	{ selector: "#rpg-update-depth", key: "updateDepth", type: "int" },
	{
		selector: "#rpg-generation-mode",
		key: "generationMode",
		type: "string",
		onUpdate: updateGenerationModeUI,
	},
	{
		selector: "#rpg-retry-attempts",
		key: "retryAttempts",
		type: "int",
		defaultValue: 0,
	},
	{
		selector: "#rpg-retry-base-delay",
		key: "retryBaseDelay",
		type: "int",
		defaultValue: 2000,
	},
	{
		selector: "#rpg-min-reply-length",
		key: "minReplyLength",
		type: "int",
		defaultValue: 0,
	},
	{
		selector: "#rpg-connection-profile",
		key: "connectionProfile",
		type: "string",
		defaultValue: "",
	},
	{
		selector: "#rpg-skip-guided-mode",
		key: "skipInjectionsForGuided",
		type: "string",
	},
	{
		selector: "#rpg-theme-select",
		key: "theme",
		type: "string",
		onUpdate: () => {
			applyTheme();
			toggleCustomColors();
			updateSettingsPopupTheme(getSettingsModal());
			updateChatThoughts();
		},
	},

	// ── Stat Bar Colors ──
	{
		selector: "#rpg-stat-bar-color-low",
		key: "statBarColorLow",
		type: "string",
		onUpdate: renderUserStats,
	},
	{
		selector: "#rpg-stat-bar-color-high",
		key: "statBarColorHigh",
		type: "string",
		onUpdate: renderUserStats,
	},

	// ── Custom Colors ──
	{
		selector: "#rpg-custom-bg",
		key: "customColors.bg",
		type: "string",
		onUpdate: applyCustomThemeIfNeeded,
	},
	{
		selector: "#rpg-custom-accent",
		key: "customColors.accent",
		type: "string",
		onUpdate: applyCustomThemeIfNeeded,
	},
	{
		selector: "#rpg-custom-text",
		key: "customColors.text",
		type: "string",
		onUpdate: applyCustomThemeIfNeeded,
	},
	{
		selector: "#rpg-custom-highlight",
		key: "customColors.highlight",
		type: "string",
		onUpdate: applyCustomThemeIfNeeded,
	},

	// ── Mobile FAB Widget Toggles ──
	{
		selector: "#rpg-toggle-fab-widgets-enabled",
		key: "mobileFabWidgets.enabled",
		type: "boolean",
		defaultValue: false,
		onUpdate: () => {
			updateFabWidgets();
			$("#rpg-fab-widget-options").toggle(
				extensionSettings.mobileFabWidgets?.enabled || false,
			);
		},
	},
	{
		selector: "#rpg-toggle-fab-weather-icon",
		key: "mobileFabWidgets.weatherIcon.enabled",
		type: "boolean",
		defaultValue: false,
		onUpdate: updateFabWidgets,
	},
	{
		selector: "#rpg-toggle-fab-weather-desc",
		key: "mobileFabWidgets.weatherDesc.enabled",
		type: "boolean",
		defaultValue: false,
		onUpdate: updateFabWidgets,
	},
	{
		selector: "#rpg-toggle-fab-clock",
		key: "mobileFabWidgets.clock.enabled",
		type: "boolean",
		defaultValue: false,
		onUpdate: updateFabWidgets,
	},
	{
		selector: "#rpg-toggle-fab-date",
		key: "mobileFabWidgets.date.enabled",
		type: "boolean",
		defaultValue: false,
		onUpdate: updateFabWidgets,
	},
	{
		selector: "#rpg-toggle-fab-location",
		key: "mobileFabWidgets.location.enabled",
		type: "boolean",
		defaultValue: false,
		onUpdate: updateFabWidgets,
	},
	{
		selector: "#rpg-toggle-fab-stats",
		key: "mobileFabWidgets.stats.enabled",
		type: "boolean",
		defaultValue: false,
		onUpdate: updateFabWidgets,
	},
	{
		selector: "#rpg-toggle-fab-attributes",
		key: "mobileFabWidgets.attributes.enabled",
		type: "boolean",
		defaultValue: false,
		onUpdate: updateFabWidgets,
	},

	// ── Desktop Strip Widget Toggles ──
	{
		selector: "#rpg-toggle-strip-widgets-enabled",
		key: "desktopStripWidgets.enabled",
		type: "boolean",
		defaultValue: false,
		onUpdate: () => {
			updateStripWidgets();
			$("#rpg-strip-widget-options").toggle(
				extensionSettings.desktopStripWidgets?.enabled || false,
			);
		},
	},
	{
		selector: "#rpg-toggle-strip-weather-icon",
		key: "desktopStripWidgets.weatherIcon.enabled",
		type: "boolean",
		defaultValue: true,
		onUpdate: updateStripWidgets,
	},
	{
		selector: "#rpg-toggle-strip-clock",
		key: "desktopStripWidgets.clock.enabled",
		type: "boolean",
		defaultValue: true,
		onUpdate: updateStripWidgets,
	},
	{
		selector: "#rpg-toggle-strip-date",
		key: "desktopStripWidgets.date.enabled",
		type: "boolean",
		defaultValue: true,
		onUpdate: updateStripWidgets,
	},
	{
		selector: "#rpg-toggle-strip-location",
		key: "desktopStripWidgets.location.enabled",
		type: "boolean",
		defaultValue: true,
		onUpdate: updateStripWidgets,
	},
	{
		selector: "#rpg-toggle-strip-stats",
		key: "desktopStripWidgets.stats.enabled",
		type: "boolean",
		defaultValue: true,
		onUpdate: updateStripWidgets,
	},
	{
		selector: "#rpg-toggle-strip-attributes",
		key: "desktopStripWidgets.attributes.enabled",
		type: "boolean",
		defaultValue: true,
		onUpdate: updateStripWidgets,
	},
];

// ── Opacity Slider Bindings (separate because they use "input" + "change") ──

/**
 * Opacity slider binding descriptor.
 * @typedef {Object} OpacityBinding
 * @property {string} selector - CSS selector for the range input
 * @property {string} valueSelector - CSS selector for the display span
 * @property {string} key - Dot-notation path into extensionSettings
 * @property {number} [defaultValue] - Default opacity value
 */

/** @type {OpacityBinding[]} */
export const OPACITY_SLIDER_BINDINGS = [
	{
		selector: "#rpg-stat-bar-color-low-opacity",
		valueSelector: "#rpg-stat-bar-color-low-opacity-value",
		key: "statBarColorLowOpacity",
		defaultValue: 100,
	},
	{
		selector: "#rpg-stat-bar-color-high-opacity",
		valueSelector: "#rpg-stat-bar-color-high-opacity-value",
		key: "statBarColorHighOpacity",
		defaultValue: 100,
	},
	{
		selector: "#rpg-custom-bg-opacity",
		valueSelector: "#rpg-custom-bg-opacity-value",
		key: "customColors.bgOpacity",
		defaultValue: 100,
	},
	{
		selector: "#rpg-custom-accent-opacity",
		valueSelector: "#rpg-custom-accent-opacity-value",
		key: "customColors.accentOpacity",
		defaultValue: 100,
	},
	{
		selector: "#rpg-custom-text-opacity",
		valueSelector: "#rpg-custom-text-opacity-value",
		key: "customColors.textOpacity",
		defaultValue: 100,
	},
	{
		selector: "#rpg-custom-highlight-opacity",
		valueSelector: "#rpg-custom-highlight-opacity-value",
		key: "customColors.highlightOpacity",
		defaultValue: 100,
	},
];

// ── Helper Functions ──

/**
 * Sets a nested value on an object using dot-notation path.
 * @param {Object} obj
 * @param {string} path - e.g. "customColors.bg"
 * @param {*} value
 */
function setNestedValue(obj, path, value) {
	const keys = path.split(".");
	let current = obj;
	for (let i = 0; i < keys.length - 1; i++) {
		if (current[keys[i]] === undefined || current[keys[i]] === null) {
			current[keys[i]] = {};
		}
		current = current[keys[i]];
	}
	current[keys[keys.length - 1]] = value;
}

/**
 * Gets a nested value from an object using dot-notation path.
 * @param {Object} obj
 * @param {string} path - e.g. "customColors.bg"
 * @returns {*}
 */
function getNestedValue(obj, path) {
	const keys = path.split(".");
	let current = obj;
	for (const key of keys) {
		if (current === undefined || current === null) return undefined;
		current = current[key];
	}
	return current;
}

/**
 * Re-applies weather effect by toggling it off and on.
 */
function reapplyWeather() {
	if (extensionSettings.enableDynamicWeather) {
		toggleDynamicWeather(false);
		toggleDynamicWeather(true);
	}
}

/**
 * Applies custom theme only if the "custom" theme is selected.
 */
function applyCustomThemeIfNeeded() {
	if (extensionSettings.theme === "custom") {
		applyCustomTheme();
		updateSettingsPopupTheme(getSettingsModal());
		updateChatThoughts();
	}
}

/**
 * Debounce utility: returns a function that delays invoking `fn` until
 * `delay` ms have elapsed since the last invocation.
 * @param {Function} fn
 * @param {number} delay - milliseconds
 * @returns {Function}
 */
function debounce(fn, delay) {
	let timer = null;
	return function (...args) {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			fn.apply(this, args);
			timer = null;
		}, delay);
	};
}

// ── Public API ──

/**
 * Binds all settings UI controls to their change/input handlers.
 * Call once after the settings HTML is in the DOM.
 */
export function bindSettingsUI() {
	// ── Standard bindings (change event) ──
	for (const binding of SETTING_BINDINGS) {
		const $el = $(binding.selector);
		if (!$el.length) continue;

		$el.on("change", function () {
			let value;
			if (binding.type === "boolean") {
				value = $(this).prop("checked");
			} else if (binding.type === "int") {
				value = parseInt(String($(this).val()), 10) || 0;
			} else if (binding.type === "commaSeparated") {
				value = String($(this).val())
					.split(",")
					.map((s) => s.trim())
					.filter((s) => s.length > 0);
			} else {
				value = String($(this).val());
			}

			setNestedValue(extensionSettings, binding.key, value);
			saveSettings();

			if (binding.onUpdate) {
				binding.onUpdate();
			}
		});
	}

	// ── Opacity slider bindings (input + change) ──
	for (const slider of OPACITY_SLIDER_BINDINGS) {
		const $slider = $(slider.selector);
		if (!$slider.length) continue;

		// Determine which render function to call based on the slider key
		const renderOnInput = getRenderForOpacitySlider(slider.key);

		$slider.on(
			"input",
			debounce(function () {
				const opacity = Number($(this).val());
				setNestedValue(extensionSettings, slider.key, opacity);
				$(slider.valueSelector).text(`${opacity}%`);
				if (renderOnInput) renderOnInput();
			}, 50),
		);

		$slider.on("change", () => {
			saveSettings();
		});
	}
}

/**
 * Syncs all settings UI controls to reflect current extensionSettings values.
 * Call after loading settings or when reverting.
 */
export function syncSettingsUI() {
	for (const binding of SETTING_BINDINGS) {
		const $el = $(binding.selector);
		if (!$el.length) continue;

		const value = getNestedValue(extensionSettings, binding.key);
		const resolved =
			value !== undefined && value !== null ? value : binding.defaultValue;

		if (binding.type === "boolean") {
			$el.prop("checked", !!resolved);
		} else if (binding.type === "int") {
			$el.val(Number(resolved));
		} else if (binding.type === "commaSeparated") {
			$el.val(Array.isArray(resolved) ? resolved.join(", ") : String(resolved));
		} else {
			$el.val(String(resolved));
		}
	}

	// ── Opacity sliders ──
	for (const slider of OPACITY_SLIDER_BINDINGS) {
		const $slider = $(slider.selector);
		if (!$slider.length) continue;

		const value = getNestedValue(extensionSettings, slider.key);
		const resolved =
			value !== undefined && value !== null ? value : slider.defaultValue;
		$slider.val(resolved);
		$(slider.valueSelector).text(`${resolved}%`);
	}
}

/**
 * Returns the appropriate render function for an opacity slider based on its settings key.
 * @param {string} key
 * @returns {Function|null}
 */
function getRenderForOpacitySlider(key) {
	if (key.startsWith("statBarColor")) {
		return renderUserStats;
	}
	if (key.startsWith("customColors")) {
		return () => {
			if (extensionSettings.theme === "custom") {
				applyCustomTheme();
				updateSettingsPopupTheme(getSettingsModal());
				updateChatThoughts();
			}
		};
	}
	return null;
}
