/**
 * Batched Rendering Module
 * Provides utilities for batching multiple render calls into a single animation frame
 * to improve performance and reduce layout thrashing.
 */

import { renderAppearance } from "./appearance.js";
import { renderCharacterCards } from "./characterCards.js";
import { renderInfoBox } from "./infoBox.js";
import { renderInventory } from "./inventory.js";
import { renderQuests } from "./quests.js";
import { renderRelationships } from "./relationships.js";
import { renderThoughts } from "./thoughts.js";
// Import render functions directly to avoid circular dependency issues
import { renderUserStats } from "./userStats.js";

/**
 * Pending render functions to be executed in the next animation frame
 */
const pendingRenders = new Set();
let animationFrameId = null;

/**
 * Executes all pending render functions in a single animation frame.
 * This batches DOM updates to reduce layout thrashing and improve performance.
 * @param {number} _timestamp - Animation frame timestamp (provided by requestAnimationFrame)
 */
function executeBatchedRenders(_timestamp) {
    // Copy the set to prevent modifications during execution
    const renders = Array.from(pendingRenders);
    pendingRenders.clear();
    animationFrameId = null;

    // Execute all pending renders
    for (const renderFn of renders) {
        try {
            renderFn();
        } catch (error) {
            console.error("[RPG Companion] Error in batched render:", error);
        }
    }
}

/**
 * Schedules a render function to be executed in the next animation frame.
 * Multiple calls with the same function will only execute it once.
 * @param {Function} renderFn - The render function to schedule
 */
export function scheduleBatchedRender(renderFn) {
    pendingRenders.add(renderFn);

    // Schedule animation frame if not already scheduled
    if (animationFrameId === null) {
        animationFrameId = requestAnimationFrame(executeBatchedRenders);
    }
}

/**
 * Cancels all pending batched renders.
 * Useful when you need to immediately render without batching.
 */
export function cancelBatchedRenders() {
    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    pendingRenders.clear();
}

/**
 * Immediately executes all pending renders without waiting for animation frame.
 * Useful for critical updates that need to happen synchronously.
 */
export function flushBatchedRenders() {
    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
    }
    executeBatchedRenders(performance.now());
}

/**
 * Batched render function for all panels.
 * Schedules all panel renders in a single animation frame for optimal performance.
 * @param {Object} options - Which panels to render
 * @param {boolean} [options.userStats=true] - Render user stats panel
 * @param {boolean} [options.infoBox=true] - Render info box panel
 * @param {boolean} [options.thoughts=true] - Render thoughts panel
 * @param {boolean} [options.inventory=true] - Render inventory panel
 * @param {boolean} [options.appearance=true] - Render appearance panel
 * @param {boolean} [options.quests=true] - Render quests panel
 * @param {boolean} [options.relationships=true] - Render relationships panel
 * @param {boolean} [options.characterCards=true] - Render character cards
 */
export function batchedRenderAll(options = {}) {
    const {
        userStats = true,
        infoBox = true,
        thoughts = true,
        inventory = true,
        appearance = true,
        quests = true,
        relationships = true,
        characterCards = true,
    } = options;

    // Schedule render functions directly (no dynamic imports)
    if (userStats) scheduleBatchedRender(renderUserStats);
    if (infoBox) scheduleBatchedRender(renderInfoBox);
    if (thoughts) scheduleBatchedRender(renderThoughts);
    if (inventory) scheduleBatchedRender(renderInventory);
    if (appearance) scheduleBatchedRender(renderAppearance);
    if (quests) scheduleBatchedRender(renderQuests);
    if (relationships) scheduleBatchedRender(renderRelationships);
    if (characterCards) scheduleBatchedRender(renderCharacterCards);
}

/**
 * Batched render for character change events.
 * Renders all panels in a single animation frame.
 */
export function batchedRenderOnCharacterChange() {
    batchedRenderAll({
        userStats: true,
        infoBox: true,
        thoughts: true,
        inventory: true,
        appearance: true,
        quests: true,
        relationships: true,
        characterCards: false, // Character cards have their own modal
    });
}

/**
 * Batched render for message swipe events.
 * Renders all panels in a single animation frame.
 */
export function batchedRenderOnSwipe() {
    batchedRenderAll({
        userStats: true,
        infoBox: true,
        thoughts: true,
        inventory: true,
        appearance: true,
        quests: true,
        relationships: false, // Relationships don't change on swipe
        characterCards: false,
    });
}

/**
 * Batched render for message delete events.
 * Renders all panels in a single animation frame.
 */
export function batchedRenderOnDelete() {
    batchedRenderAll({
        userStats: true,
        infoBox: true,
        thoughts: true,
        inventory: true,
        appearance: true,
        quests: true,
        relationships: false,
        characterCards: false,
    });
}
