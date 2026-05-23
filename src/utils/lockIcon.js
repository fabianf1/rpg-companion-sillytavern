/**
 * Lock Icon Utilities Module
 * Provides consistent lock icon generation for tracker fields
 */

import { i18n } from "../core/i18n.js";
import { extensionSettings } from "../core/state.js";
import { isItemLocked } from "../systems/generation/lockManager.js";

/**
 * Generates lock icon HTML for tracker fields.
 * Uses i18n translations for accessibility titles.
 *
 * @param {string} tracker - Tracker name (e.g., "userStats", "infoBox")
 * @param {string} path - Item path (e.g., "stats", "inventory.onPerson.sword")
 * @returns {string} Lock icon HTML span element, or empty string if disabled
 *
 * @example
 * getLockIconHtml("userStats", "stats")
 * // Returns: '<span class="rpg-section-lock-icon" data-tracker="userStats" data-path="stats" title="Unlocked">🔓</span>'
 */
export function getLockIconHtml(tracker, path) {
    const showLockIcons = extensionSettings.showLockIcons ?? true;
    if (!showLockIcons) return "";

    const isLocked = isItemLocked(tracker, path);
    const lockIcon = isLocked ? "🔒" : "🔓";
    const lockTitle = isLocked
        ? i18n.getTranslation("common.locked")
        : i18n.getTranslation("common.unlocked");
    const lockedClass = isLocked ? " locked" : "";
    return `<span class="rpg-section-lock-icon${lockedClass}" data-tracker="${tracker}" data-path="${path}" title="${lockTitle}">${lockIcon}</span>`;
}
