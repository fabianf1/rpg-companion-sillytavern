/**
 * Core Configuration Module
 * Extension metadata and configuration constants
 */

export const extensionName = "third-party/rpg-companion-sillytavern";

/**
 * Dynamically determine extension path based on current location
 * This supports both global (public/extensions) and user-specific (data/default-user/extensions) installations
 */
const currentScriptPath = import.meta.url;
const isUserExtension =
	currentScriptPath.includes("/data/") ||
	currentScriptPath.includes("\\data\\");
export const extensionFolderPath = isUserExtension
	? `data/default-user/extensions/${extensionName}`
	: `scripts/extensions/${extensionName}`;

/**
 * Mobile breakpoint in pixels
 * Below this width, the extension uses mobile UI (FAB, mobile tabs, etc.)
 * Above this width, the extension uses desktop UI (strip widgets, desktop tabs)
 */
export const MOBILE_BREAKPOINT = 1000;
