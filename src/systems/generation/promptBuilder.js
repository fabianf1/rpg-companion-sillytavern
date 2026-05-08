/**
 * Prompt Builder Module
 * Handles all AI prompt generation for RPG tracker data
 */

/**
 * Default HTML prompt text
 */
export const DEFAULT_HTML_PROMPT = `If appropriate, include inline HTML, CSS, and JS segments whenever they enhance visual storytelling (e.g., for in-world screens, posters, books, letters, signs, crests, labels, etc.). Style them to match the setting's theme (e.g., fantasy, sci-fi), keep the text readable, and embed all assets directly (using inline SVGs only with no external scripts, libraries, or fonts). Use these elements freely and naturally within the narrative as characters would encounter them, including animations, 3D effects, pop-ups, dropdowns, websites, and so on. Do not wrap the HTML/CSS/JS in code fences!`;

/**
 * Default Dialogue Coloring prompt text
 */
export const DEFAULT_DIALOGUE_COLORING_PROMPT = `Wrap all character/NPC "dialogues" in unique <font color=######>tags</font>, exemplary: <font color=#abc123>"You're pretty good."</font> Assign a distinct color to each speaker and reuse it whenever they speak again.`;

/**
 * Default Narrator Mode prompt text (customizable by users)
 */
export const DEFAULT_NARRATOR_PROMPT = `Infer the identity and details of characters present in each scene from the story context below. Do not use fixed character references; instead, identify characters naturally based on their actions, dialogue, and descriptions in the narrative.`;

/**
 * Default Context Instructions prompt text (customizable by users)
 */
export const DEFAULT_CONTEXT_INSTRUCTIONS_PROMPT = `The context above is information about the current scene, and what follows is the last message in the chat history. Ensure these details naturally reflect and influence the narrative. Character behavior, dialogue, and story events should acknowledge these conditions when relevant, such as fatigue affecting performance, low hygiene influencing social interactions, environmental factors shaping the scene, or a character's emotional state coloring their responses.`;

// generateSeparateUpdatePrompt and related functions are now imported from ./separatePromptBuilder.js
