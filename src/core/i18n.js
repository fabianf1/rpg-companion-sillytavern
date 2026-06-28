//- No-op in case this is running outside of SillyTavern
const { extension_settings } =
	typeof self.SillyTavern !== "undefined"
		? self.SillyTavern.getContext()
		: { extension_settings: {} };

import { extensionFolderPath } from "./config.js";

class Internationalization {
	constructor() {
		this.currentLanguage = "en";
		this.translations = {};
		this._listeners = {};
	}

	addEventListener(event, callback) {
		if (!this._listeners[event]) {
			this._listeners[event] = [];
		}
		this._listeners[event].push(callback);
	}

	dispatchEvent(event, data) {
		if (this._listeners[event]) {
			this._listeners[event].forEach((callback) => callback(data));
		}
	}

	async init() {
		const savedLanguage = localStorage.getItem("rpgCompanionLanguage") || "en";
		this.currentLanguage = savedLanguage;

		await this.loadTranslations(this.currentLanguage);
		this.applyTranslations(document.body);

		const langSelect = document.getElementById("rpg-companion-language-select");
		if (langSelect) {
			langSelect.value = this.currentLanguage;
		}
	}

	async loadTranslations(lang) {
		const fetchUrl = `/${extensionFolderPath}/src/i18n/${lang}.json`;
		try {
			const response = await fetch(fetchUrl);
			if (!response.ok) {
				console.error(
					`[RPG-Companion-i18n] Failed to load translation file for ${lang}. Status: ${response.status}`,
				);
				if (lang !== "en") {
					return this.loadTranslations("en");
				}
				return;
			}
			this.translations = await response.json();
		} catch (error) {
			console.error(
				"[RPG-Companion-i18n] CRITICAL error loading translation file:",
				error,
			);
			// If loading fails and we're not already trying English, fall back to English
			if (lang !== "en") {
				console.warn("[RPG-Companion-i18n] Falling back to English translations");
				await this.loadTranslations("en");
			}
		}
	}

	applyTranslations(rootElement) {
		if (!rootElement) {
			return;
		}

		// 1. Translate textContent
		const textElements = rootElement.querySelectorAll("[data-i18n-key]");
		textElements.forEach((element) => {
			const key = element.dataset.i18nKey;
			const translation = this.getTranslation(key);
			if (translation) {
				element.textContent = translation;
			}
		});

		// 2. Translate title attribute
		const titleElements = rootElement.querySelectorAll("[data-i18n-title]");
		titleElements.forEach((element) => {
			const key = element.dataset.i18nTitle;
			const translation = this.getTranslation(key);
			if (translation) {
				element.setAttribute("title", translation);
			}
		});

		// 3. Translate aria-label attribute
		const ariaLabelElements = rootElement.querySelectorAll(
			"[data-i18n-aria-label]",
		);
		ariaLabelElements.forEach((element) => {
			const key = element.dataset.i18nAriaLabel;
			const translation = this.getTranslation(key);
			if (translation) {
				element.setAttribute("aria-label", translation);
			}
		});

		// 4. Translate placeholder attribute
		const placeholderElements = rootElement.querySelectorAll(
			"[data-i18n-placeholder]",
		);
		placeholderElements.forEach((element) => {
			const key = element.dataset.i18nPlaceholder;
			const translation = this.getTranslation(key);
			if (translation) {
				element.setAttribute("placeholder", translation);
			}
		});

		// 5. Translate alt attribute
		const altElements = rootElement.querySelectorAll("[data-i18n-alt]");
		altElements.forEach((element) => {
			const key = element.dataset.i18nAlt;
			const translation = this.getTranslation(key);
			if (translation) {
				element.setAttribute("alt", translation);
			}
		});
	}

	getTranslation(key) {
		// Return translation if found, otherwise fall back to the key itself
		// This ensures UI always shows something meaningful even if translation is missing
		return this.translations[key] || key;
	}

	async setLanguage(lang) {
		this.currentLanguage = lang;
		localStorage.setItem("rpgCompanionLanguage", lang);
		await this.loadTranslations(lang);
		this.applyTranslations(document.body);
		this.dispatchEvent("languageChanged");
	}
}

export const i18n = new Internationalization();
