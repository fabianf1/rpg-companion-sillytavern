/**
 * Simple Logging Utility for RPG Companion
 * Provides namespaced logging with debug flag support.
 * Replace console.log/warn/error calls with logger.log/warn/error.
 */

const PREFIX = "[RPG Companion]";

/**
 * Whether debug logging is enabled.
 * Set to true during development, false in production.
 * @type {boolean}
 */
const DEBUG = false;

/**
 * General info logging.
 * @param {...any} args
 */
export function log(...args) {
	console.log(PREFIX, ...args);
}

/**
 * Warning logging.
 * @param {...any} args
 */
export function warn(...args) {
	console.warn(PREFIX, ...args);
}

/**
 * Error logging.
 * @param {...any} args
 */
export function error(...args) {
	console.error(PREFIX, ...args);
}

/**
 * Debug logging — only outputs when DEBUG is true.
 * @param {...any} args
 */
export function debug(...args) {
	if (DEBUG) {
		console.log(PREFIX, "[DEBUG]", ...args);
	}
}

const logger = { log, warn, error, debug };
export default logger;
