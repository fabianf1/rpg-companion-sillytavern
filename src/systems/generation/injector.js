/**
 * Prompt Injector Module
 * Handles injection of RPG tracker prompts into the generation context
 */

import { getContext } from '../../../../../../extensions.js';
import { extension_prompt_types, extension_prompt_roles, setExtensionPrompt, eventSource, event_types } from '../../../../../../../script.js';
import {
    extensionSettings,
    isGenerating,
    lastActionWasSwipe
} from '../../core/state.js';
import { getTrackerDataForContext } from './promptBuilder.js';
import { evaluateSuppression } from './suppression.js';
import {
    generateTrackerExample,
    generateTrackerInstructions,
    generateContextualSummary,
    formatHistoricalTrackerData,
    DEFAULT_HTML_PROMPT,
    DEFAULT_DIALOGUE_COLORING_PROMPT,
    DEFAULT_DECEPTION_PROMPT,
    DEFAULT_OMNISCIENCE_FILTER_PROMPT,
    DEFAULT_CYOA_PROMPT,
    DEFAULT_SPOTIFY_PROMPT,
    DEFAULT_NARRATOR_PROMPT,
    DEFAULT_CONTEXT_INSTRUCTIONS_PROMPT,
    SPOTIFY_FORMAT_INSTRUCTION
} from './promptBuilder.js';
import { restoreCheckpointOnLoad } from '../features/chapterCheckpoint.js';

// ============================================================================
// CONSTANTS AND CONFIGURATION
// ============================================================================

/**
 * Injection depth constants for clarity
 */
const INJECTION_DEPTHS = {
    FIRST_MESSAGE: 0,
    BEFORE_LAST_MESSAGE: 1,
    TRACKER_CONTEXT: 1
};

/**
 * Feature configuration for prompt injection
 * Reduces code duplication by standardizing how features are injected
 */
const PROMPT_FEATURES = [
    { name: 'html', key: 'enableHtmlPrompt', default: DEFAULT_HTML_PROMPT, depth: INJECTION_DEPTHS.FIRST_MESSAGE },
    { name: 'dialogueColoring', key: 'enableDialogueColoring', default: DEFAULT_DIALOGUE_COLORING_PROMPT, depth: INJECTION_DEPTHS.FIRST_MESSAGE },
    { name: 'deception', key: 'enableDeceptionSystem', default: DEFAULT_DECEPTION_PROMPT, depth: INJECTION_DEPTHS.FIRST_MESSAGE },
    { name: 'omniscience', key: 'enableOmniscienceFilter', default: DEFAULT_OMNISCIENCE_FILTER_PROMPT, depth: INJECTION_DEPTHS.FIRST_MESSAGE },
    { name: 'spotify', key: 'enableSpotifyMusic', default: DEFAULT_SPOTIFY_PROMPT, depth: INJECTION_DEPTHS.FIRST_MESSAGE },
    { name: 'cyoa', key: 'enableCYOA', default: DEFAULT_CYOA_PROMPT, depth: INJECTION_DEPTHS.FIRST_MESSAGE }
];

// Track suppression state for event handler
let currentSuppressionState = false;

// Track last chat length we committed at to prevent duplicate commits from streaming
let lastCommittedChatLength = -1;

// Store context map for prompt injection (used by event handlers)
let pendingContextMap = new Map();

// Flag to track if injection already happened in BEFORE_COMBINE
let historyInjectionDone = false;

/**
 * Builds a map of historical context data from ST chat messages with rpg_companion_swipes data.
 * Returns a map keyed by message index with formatted context strings.
 * The index stored depends on the injection position setting.
 *
 * @returns {Map<number, string>} Map of target message index to formatted context string
 */
function buildHistoricalContextMap() {
    const historyPersistence = extensionSettings.historyPersistence;
    if (!historyPersistence || !historyPersistence.enabled) {
        return new Map();
    }

    const context = getContext();
    const chat = context.chat;
    if (!chat || chat.length < 2) {
        return new Map();
    }

    const trackerConfig = extensionSettings.trackerConfig;
    const userName = context.name1;
    const position = historyPersistence.injectionPosition || 'assistant_message_end';
    const contextMap = new Map();

    // Determine how many messages to include (0 = all available)
    const messageCount = historyPersistence.messageCount || 0;
    const maxMessages = messageCount === 0 ? chat.length : Math.min(messageCount, chat.length);

    // Find the last assistant message - this is the one that gets current context via setExtensionPrompt
    // We should NOT add historical context to it when injecting into assistant messages
    // But when injecting into user messages, we DO need to process it to get context for the preceding user message
    let lastAssistantIndex = -1;
    for (let i = chat.length - 1; i >= 0; i--) {
        if (!chat[i].is_user && !chat[i].is_system) {
            lastAssistantIndex = i;
            break;
        }
    }

    // Iterate through messages to find those with tracker data
    // For user_message_end: start from the last assistant message (we need its context for the preceding user message)
    // For assistant_message_end: start from before the last assistant message (it gets current context via setExtensionPrompt)
    let processedCount = 0;
    const startIndex = position === 'user_message_end'
        ? lastAssistantIndex
        : (lastAssistantIndex > 0 ? lastAssistantIndex - 1 : chat.length - 2);

    for (let i = startIndex; i >= 0 && (messageCount === 0 || processedCount < maxMessages); i--) {
        const message = chat[i];

        // Skip system messages
        if (message.is_system) {
            continue;
        }

        // Only assistant messages have rpg_companion_swipes data
        if (message.is_user) {
            continue;
        }

        // Get the rpg_companion_swipes data for current swipe
        // Data can be in two places:
        // 1. message.extra.rpg_companion_swipes (current session, before save)
        // 2. message.swipe_info[swipeId].extra.rpg_companion_swipes (loaded from file)
        const currentSwipeId = message.swipe_id || 0;
        let swipeData = message.extra?.rpg_companion_swipes;

        // If not in message.extra, check swipe_info
        if (!swipeData && message.swipe_info && message.swipe_info[currentSwipeId]) {
            swipeData = message.swipe_info[currentSwipeId].extra?.rpg_companion_swipes;
        }

        if (!swipeData) {
            continue;
        }

        const trackerData = swipeData[currentSwipeId];
        if (!trackerData) {
            continue;
        }

        // Format the historical tracker data using the shared function
        const formattedContext = formatHistoricalTrackerData(trackerData, trackerConfig, userName);
        if (!formattedContext) {
            continue;
        }

        // Build the context wrapper
        const preamble = historyPersistence.contextPreamble || 'Context for that moment:';
        const wrappedContext = `\n${preamble}\n${formattedContext}`;

        // Determine which message index to store based on injection position
        let targetIndex = i; // Default: the assistant message itself

        if (position === 'user_message_end') {
            // Find the preceding user message before this assistant message
            // This is the user message that prompted this assistant response
            for (let j = i - 1; j >= 0; j--) {
                if (chat[j].is_user && !chat[j].is_system) {
                    targetIndex = j;
                    break;
                }
            }
            // If no user message found before, skip this one
            if (targetIndex === i) {
                continue;
            }
        }
        // For assistant_message_end, extra_user_message, extra_assistant_message:
        // We inject into the assistant message itself (for now - extra messages handled differently)

        // Store the context keyed by target index
        // If multiple assistant messages map to the same user message, append
        if (contextMap.has(targetIndex)) {
            contextMap.set(targetIndex, contextMap.get(targetIndex) + wrappedContext);
        } else {
            contextMap.set(targetIndex, wrappedContext);
        }

        processedCount++;
    }

    return contextMap;
}

/**
 * Prepares historical context for injection into prompts.
 * This builds the context map and stores it for use by prompt event handlers.
 * Does NOT modify the original chat messages.
 */
function prepareHistoricalContextInjection() {
    const historyPersistence = extensionSettings.historyPersistence;
    if (!historyPersistence || !historyPersistence.enabled) {
        pendingContextMap = new Map();
        return;
    }

    if (currentSuppressionState || !extensionSettings.enabled) {
        pendingContextMap = new Map();
        return;
    }

    const context = getContext();
    const chat = context.chat;
    if (!chat || chat.length < 2) {
        pendingContextMap = new Map();
        historyInjectionDone = false;
        return;
    }

    // Build and store the context map for use by prompt handlers
    pendingContextMap = buildHistoricalContextMap();
    historyInjectionDone = false; // Reset flag for new generation
}

/**
 * Finds the best match position for message content in the prompt.
 * Tries full content first, then progressively smaller suffixes.
 *
 * @param {string} prompt - The prompt to search in
 * @param {string} messageContent - The message content to find
 * @returns {{start: number, end: number}|null} - Position info or null if not found
 */
function findMessageInPrompt(prompt, messageContent) {
    if (!messageContent || !prompt) {
        return null;
    }

    // Try to find the full content first
    let searchIndex = prompt.lastIndexOf(messageContent);

    if (searchIndex !== -1) {
        return { start: searchIndex, end: searchIndex + messageContent.length };
    }

    // If full content not found, try last N characters with progressively smaller chunks
    // This handles cases where messages are truncated in the prompt
    const searchLengths = [500, 300, 200, 100, 50];

    for (const len of searchLengths) {
        if (messageContent.length <= len) {
            continue;
        }

        const searchContent = messageContent.slice(-len);
        searchIndex = prompt.lastIndexOf(searchContent);

        if (searchIndex !== -1) {
            return { start: searchIndex, end: searchIndex + searchContent.length };
        }
    }

    return null;
}

/**
 * Injects historical context into a text completion prompt string.
 * Searches for message content in the prompt and appends context after matches.
 *
 * @param {string} prompt - The text completion prompt
 * @returns {string} - The modified prompt with injected context
 */
function injectContextIntoTextPrompt(prompt) {
    if (pendingContextMap.size === 0) {
        return prompt;
    }

    const context = getContext();
    const chat = context.chat;
    let modifiedPrompt = prompt;
    let injectedCount = 0;

    // Sort by message index descending so we inject from end to start
    // This prevents position shifts from affecting earlier injections
    const sortedEntries = Array.from(pendingContextMap.entries()).sort((a, b) => b[0] - a[0]);

    // Process each message that needs context injection
    for (const [msgIdx, ctxContent] of sortedEntries) {
        const message = chat[msgIdx];
        if (!message || typeof message.mes !== 'string') {
            continue;
        }

        // Find the message content in the prompt
        const position = findMessageInPrompt(modifiedPrompt, message.mes);

        if (!position) {
            // Message not found in prompt (might be truncated or not included)
            console.debug(`[RPG Companion] Could not find message ${msgIdx} in prompt for context injection`);
            continue;
        }

        // Insert the context after the message content
        modifiedPrompt = modifiedPrompt.slice(0, position.end) + ctxContent + modifiedPrompt.slice(position.end);
        injectedCount++;
    }

    if (injectedCount > 0) {
        console.log(`[RPG Companion] Injected historical context into ${injectedCount} positions in text prompt`);
    }

    return modifiedPrompt;
}

/**
 * Injects historical context into a chat completion message array.
 * Modifies the content of messages in the array directly.
 *
 * @param {Array} chatMessages - The chat completion message array
 * @returns {Array} - The modified message array with injected context
 */
function injectContextIntoChatPrompt(chatMessages) {
    if (pendingContextMap.size === 0 || !Array.isArray(chatMessages)) {
        return chatMessages;
    }

    const context = getContext();
    const chat = context.chat;
    let injectedCount = 0;

    // Process each message that needs context injection
    for (const [msgIdx, ctxContent] of pendingContextMap) {
        const originalMessage = chat[msgIdx];
        if (!originalMessage || typeof originalMessage.mes !== 'string') {
            continue;
        }

        const messageContent = originalMessage.mes;

        // Find this message in the chat completion array by matching content
        // Try full content first, then progressively smaller suffixes
        let found = false;

        for (const promptMsg of chatMessages) {
            if (!promptMsg.content || typeof promptMsg.content !== 'string') {
                continue;
            }

            // Try full content match
            if (promptMsg.content.includes(messageContent)) {
                promptMsg.content = promptMsg.content + ctxContent;
                injectedCount++;
                found = true;
                break;
            }

            // Try suffix matches for truncated messages
            const searchLengths = [500, 300, 200, 100, 50];
            for (const len of searchLengths) {
                if (messageContent.length <= len) {
                    continue;
                }

                const searchContent = messageContent.slice(-len);
                if (promptMsg.content.includes(searchContent)) {
                    promptMsg.content = promptMsg.content + ctxContent;
                    injectedCount++;
                    found = true;
                    break;
                }
            }

            if (found) {
                break;
            }
        }

        if (!found) {
            console.debug(`[RPG Companion] Could not find message ${msgIdx} in chat prompt for context injection`);
        }
    }

    if (injectedCount > 0) {
        console.log(`[RPG Companion] Injected historical context into ${injectedCount} messages in chat prompt`);
    }

    return chatMessages;
}

/**
 * Injects historical context into finalMesSend message array (text completion).
 * Iterates through chat and finalMesSend in order, matching by content to skip injected messages.
 *
 * @param {Array} finalMesSend - The array of message objects {message: string, extensionPrompts: []}
 * @returns {number} - Number of injections made
 */
function injectContextIntoFinalMesSend(finalMesSend) {
    if (pendingContextMap.size === 0 || !Array.isArray(finalMesSend) || finalMesSend.length === 0) {
        return 0;
    }

    const context = getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) {
        return 0;
    }

    let injectedCount = 0;

    // Build a map from chat index to finalMesSend index by matching content in order
    // This handles injected messages (author's note, OOC, etc.) that exist in finalMesSend but not in chat
    const chatToMesSendMap = new Map();
    let mesSendIdx = 0;

    for (let chatIdx = 0; chatIdx < chat.length && mesSendIdx < finalMesSend.length; chatIdx++) {
        const chatMsg = chat[chatIdx];
        if (!chatMsg || chatMsg.is_system) {
            continue;
        }

        const chatContent = chatMsg.mes || '';

        // Look for this chat message in finalMesSend starting from current position
        // Skip any finalMesSend entries that don't match (they're injected content)
        while (mesSendIdx < finalMesSend.length) {
            const mesSendObj = finalMesSend[mesSendIdx];
            if (!mesSendObj || !mesSendObj.message) {
                mesSendIdx++;
                continue;
            }

            // Check if this finalMesSend message contains the chat content
            // Use a substring match since instruct formatting adds prefixes/suffixes
            // Match with sufficient content (first 50 chars or full message if shorter)
            const matchContent = chatContent.length > 50
                ? chatContent.substring(0, 50)
                : chatContent;

            if (matchContent && mesSendObj.message.includes(matchContent)) {
                // Found a match - record the mapping
                chatToMesSendMap.set(chatIdx, mesSendIdx);
                mesSendIdx++;
                break;
            }

            // This finalMesSend entry doesn't match - it's injected content, skip it
            mesSendIdx++;
        }
    }

    // Now inject context using the map
    for (const [chatIdx, ctxContent] of pendingContextMap) {
        const targetMesSendIdx = chatToMesSendMap.get(chatIdx);

        if (targetMesSendIdx === undefined) {
            console.debug(`[RPG Companion] Chat message ${chatIdx} not found in finalMesSend mapping`);
            continue;
        }

        const mesSendObj = finalMesSend[targetMesSendIdx];
        if (!mesSendObj || !mesSendObj.message) {
            continue;
        }

        // Append context to this message
        mesSendObj.message = mesSendObj.message + ctxContent;
        injectedCount++;
        console.debug(`[RPG Companion] Injected context for chat[${chatIdx}] into finalMesSend[${targetMesSendIdx}]`);
    }

    return injectedCount;
}

/**
 * Event handler for GENERATE_BEFORE_COMBINE_PROMPTS (text completion).
 * Injects historical context into the finalMesSend array before prompt combination.
 * This is more reliable than post-combine string searching.
 *
 * @param {Object} eventData - Event data with finalMesSend and other properties
 */
function onGenerateBeforeCombinePrompts(eventData) {
    if (!eventData || !Array.isArray(eventData.finalMesSend)) {
        return;
    }

    // Skip for OpenAI (uses chat completion)
    if (eventData.api === 'openai') {
        return;
    }

    // Only inject if we have pending context
    if (pendingContextMap.size === 0) {
        return;
    }

    const injectedCount = injectContextIntoFinalMesSend(eventData.finalMesSend);
    if (injectedCount > 0) {
        console.log(`[RPG Companion] Injected historical context into ${injectedCount} messages in finalMesSend`);
        historyInjectionDone = true; // Mark as done to prevent double injection
    }
}

/**
 * Event handler for GENERATE_AFTER_COMBINE_PROMPTS (text completion).
 * This is now a backup/fallback - primary injection happens in BEFORE_COMBINE.
 * Also fixes newline spacing after </context> tag.
 *
 * @param {Object} eventData - Event data with prompt property
 */
function onGenerateAfterCombinePrompts(eventData) {
    if (!eventData || typeof eventData.prompt !== 'string') {
        return;
    }

    if (eventData.dryRun) {
        return;
    }

    let didInjectHistory = false;

    // Inject historical context if available and not already done
    if (!historyInjectionDone && pendingContextMap.size > 0) {
        // Fallback injection for edge cases where BEFORE_COMBINE didn't work
        console.log('[RPG Companion] Using fallback string-based injection (AFTER_COMBINE)');
        eventData.prompt = injectContextIntoTextPrompt(eventData.prompt);
        didInjectHistory = true;
    }

    // Always fix newlines around context tags (whether we just injected or not)
    eventData.prompt = eventData.prompt.replace(/<context>/g, '\n<context>');
    eventData.prompt = eventData.prompt.replace(/<\/context>/g, '</context>\n');
}

/**
 * Event handler for CHAT_COMPLETION_PROMPT_READY.
 * Injects historical context into the chat message array.
 * Also fixes newline spacing around <context> tags.
 *
 * @param {Object} eventData - Event data with chat property
 */
function onChatCompletionPromptReady(eventData) {
    if (!eventData || !Array.isArray(eventData.chat)) {
        return;
    }

    if (eventData.dryRun) {
        return;
    }

    // Inject historical context if we have pending context
    if (pendingContextMap.size > 0) {
        eventData.chat = injectContextIntoChatPrompt(eventData.chat);
        // DON'T clear pendingContextMap here - let it persist for other generations
        // (e.g., prewarm extensions). It will be cleared on GENERATION_ENDED.
    }

    // Fix newlines around context tags for all messages
    for (const message of eventData.chat) {
        if (message.content && typeof message.content === 'string') {
            message.content = message.content.replace(/<context>/g, '\n<context>');
            message.content = message.content.replace(/<\/context>/g, '</context>\n');
        }
    }
}

/**
 * Helper function to inject all enabled prompt features
 * Reduces code duplication and makes feature injection consistent
 *
 * @param {string} mode - Either 'together' or 'separate'
 * @param {boolean} shouldSuppress - Whether to skip injection due to suppression
 */
function injectPromptFeatures(mode, shouldSuppress) {
    PROMPT_FEATURES.forEach(feature => {
        if (extensionSettings[feature.key] && !shouldSuppress) {
            const promptText = extensionSettings[`custom${feature.name.charAt(0).toUpperCase() + feature.name.slice(1)}Prompt`] || feature.default;
            const prompt = `\n- ${promptText}\n`;
            setExtensionPrompt(`rpg-companion-${feature.name}`, prompt, extension_prompt_types.IN_CHAT, feature.depth, false);
        } else {
            setExtensionPrompt(`rpg-companion-${feature.name}`, '', extension_prompt_types.IN_CHAT, feature.depth, false);
        }
    });
}

/**
 * Validates extension settings structure
 * @param {Object} settings - The extension settings to validate
 * @returns {boolean} True if settings are valid
 */
function validateSettings(settings) {
    if (!settings || typeof settings !== 'object') {
        console.error('[RPG Companion] Invalid extensionSettings: must be an object');
        return false;
    }
    
    const requiredKeys = ['enabled', 'generationMode', 'historyPersistence', 'trackerConfig'];
    const missingKeys = requiredKeys.filter(key => !(key in settings));
    
    if (missingKeys.length > 0) {
        console.warn(`[RPG Companion] Missing required settings: ${missingKeys.join(', ')}`);
        return false;
    }
    
    return true;
}

/**
 * Event handler for generation start.
 * Manages tracker data commitment and prompt injection based on generation mode.
 *
 * @param {string} type - Event type
 * @param {Object} data - Event data
 * @param {boolean} dryRun - If true, this is a dry run (page reload, prompt preview, etc.) - skip all logic
 */
export async function onGenerationStarted(type, data, dryRun) {
    // Skip dry runs (page reload, prompt manager preview, etc.)
    if (dryRun) {
        console.debug('[RPG Companion] Skipping onGenerationStarted: dry run detected');
        return;
    }

    // Validate settings before proceeding
    if (!validateSettings(extensionSettings)) {
        console.error('[RPG Companion] Invalid settings detected, aborting generation');
        return;
    }

    console.debug('[RPG Companion] onGenerationStarted called');
    console.debug('[RPG Companion] enabled:', extensionSettings.enabled);
    console.debug('[RPG Companion] generationMode:', extensionSettings.generationMode);

    // Skip tracker injection for image generation requests
    if (data?.quietImage || data?.quiet_image || data?.isImageGeneration) {
        console.debug('[RPG Companion] Detected image generation, skipping tracker injection');
        return;
    }

    if (!extensionSettings.enabled) {
        // Extension is disabled - clear all prompts
        console.debug('[RPG Companion] Extension disabled, clearing all prompts');
        setExtensionPrompt('rpg-companion-inject', '', extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.FIRST_MESSAGE, false);
        setExtensionPrompt('rpg-companion-example', '', extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.FIRST_MESSAGE, false);
        setExtensionPrompt('rpg-companion-html', '', extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.FIRST_MESSAGE, false);
        setExtensionPrompt('rpg-companion-dialogue-coloring', '', extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.FIRST_MESSAGE, false);
        setExtensionPrompt('rpg-companion-spotify', '', extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.FIRST_MESSAGE, false);
        setExtensionPrompt('rpg-companion-context', '', extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.BEFORE_LAST_MESSAGE, false);
        return;
    }

    const context = getContext();
    const chat = context.chat;
    
    // Detect if a guided generation is active
    const suppression = evaluateSuppression(extensionSettings, context, data);
    const { shouldSuppress, skipMode, isGuidedGeneration, isImpersonationGeneration, hasQuietPrompt } = suppression;

    if (shouldSuppress) {
        console.debug(`[RPG Companion] Suppression active (mode=${skipMode}). isGuided=${isGuidedGeneration}, isImpersonation=${isImpersonationGeneration}, hasQuietPrompt=${hasQuietPrompt} - skipping RPG tracker injections for this generation.`);

        // Clear any existing RPG Companion prompts to prevent conflicts
        setExtensionPrompt('rpg-companion-inject', '', extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.FIRST_MESSAGE, false);
        setExtensionPrompt('rpg-companion-example', '', extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.FIRST_MESSAGE, false);
        setExtensionPrompt('rpg-companion-html', '', extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.FIRST_MESSAGE, false);
        setExtensionPrompt('rpg-companion-spotify', '', extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.FIRST_MESSAGE, false);
        setExtensionPrompt('rpg-companion-context', '', extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.BEFORE_LAST_MESSAGE, false);
    }

    // Ensure checkpoint is applied before generation
    await restoreCheckpointOnLoad();

    const currentChatLength = chat ? chat.length : 0;

    // For TOGETHER mode: Commit when user sends message (before first generation)
    if (extensionSettings.generationMode === 'together') {
        // By the time onGenerationStarted fires, ST has already added the placeholder AI message
        // So we check the second-to-last message to see if user just sent a message
        const secondToLastMessage = chat && chat.length > 1 ? chat[chat.length - 2] : null;
        const isUserMessage = secondToLastMessage && secondToLastMessage.is_user;

        // Commit if:
        // 1. Second-to-last message is from USER (user just sent message)
        // 2. Not a swipe (lastActionWasSwipe = false)
        // 3. Haven't already committed for this chat length (prevent streaming duplicates)
        const shouldCommit = isUserMessage && !lastActionWasSwipe && currentChatLength !== lastCommittedChatLength;

        if (shouldCommit) {
            console.debug('[RPG Companion] TOGETHER MODE COMMIT: User sent message - committing data');
            lastCommittedChatLength = currentChatLength;
        } else if (lastActionWasSwipe) {
            console.debug('[RPG Companion] Skipping commit: swipe (using previous committed data)');
        } else if (!isUserMessage) {
            console.debug('[RPG Companion] Skipping commit: second-to-last message is not user message');
        }
    }

    // For SEPARATE mode: Check if we need to commit extension data
    if (extensionSettings.generationMode === 'separate' && !isGenerating) {
        if (!lastActionWasSwipe) {
            console.debug('[RPG Companion] SEPARATE MODE: New message - data already in swipe store');
        } else {
            console.debug('[RPG Companion] SEPARATE MODE: Swipe - using existing Swipe Store Data');
        }
    }

    // Use the swipe store data as source for generation
    const swipeUserStats = getTrackerDataForContext('userStats');
    console.debug('[RPG Companion] Using Swipe Store Data for generation');

    if (extensionSettings.generationMode === 'together') {
        const exampleRaw = generateTrackerExample();
        // Wrap example in ```json``` code blocks for consistency with format instructions
        const example = exampleRaw ? `\`\`\`json\n${exampleRaw}\n\`\`\`\n` : null;
        const instructions = generateTrackerInstructions(false, true);

        // Clear separate mode context injection - not used in together mode
        setExtensionPrompt('rpg-companion-context', '', extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.BEFORE_LAST_MESSAGE, false);

        // Find the last assistant message in the chat history
        let lastAssistantDepth = -1; // -1 means not found
        if (chat && chat.length > 0) {
            for (let depth = 1; depth < chat.length; depth++) {
                const index = chat.length - 1 - depth;
                const message = chat[index];
                // Check for assistant message: not user and not system
                if (!message.is_user && !message.is_system) {
                    lastAssistantDepth = depth;
                    break;
                }
            }
        }

        // If we have previous tracker data and found an assistant message, inject it as an assistant message
        if (!shouldSuppress && example && lastAssistantDepth > 0) {
            setExtensionPrompt('rpg-companion-example', example, extension_prompt_types.IN_CHAT, lastAssistantDepth, false, extension_prompt_roles.ASSISTANT);
            console.debug('[RPG Companion] Injected tracker example as assistant message at depth:', lastAssistantDepth);
        }

        // Inject the instructions as a user message at depth 0 (right before generation)
        if (!shouldSuppress) {
            setExtensionPrompt('rpg-companion-inject', instructions, extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.FIRST_MESSAGE, false, extension_prompt_roles.USER);
        }

        // Inject all enabled prompt features using the helper function
        injectPromptFeatures('together', shouldSuppress);

    } else if (extensionSettings.generationMode === 'separate') {
        // In SEPARATE mode, inject the contextual summary for main roleplay generation
        const contextSummary = generateContextualSummary();

        if (contextSummary) {
            // Use custom context instructions prompt if set, otherwise use default
            const contextInstructionsText = extensionSettings.customContextInstructionsPrompt || DEFAULT_CONTEXT_INSTRUCTIONS_PROMPT;

            const wrappedContext = `\n<context>\n${contextSummary}\n${contextInstructionsText}\n</context>\n`;

            // Inject context at depth 1 (before last user message)
            if (!shouldSuppress) {
                setExtensionPrompt('rpg-companion-context', wrappedContext, extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.BEFORE_LAST_MESSAGE, false);
            }
            console.debug('[RPG Companion] Injected contextual summary for separate mode');
        } else {
            // Clear if no data yet
            setExtensionPrompt('rpg-companion-context', '', extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.BEFORE_LAST_MESSAGE, false);
        }

        // Inject all enabled prompt features using the helper function
        injectPromptFeatures('separate', shouldSuppress);

        // Clear together mode injections
        setExtensionPrompt('rpg-companion-inject', '', extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.FIRST_MESSAGE, false);
        setExtensionPrompt('rpg-companion-example', '', extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.FIRST_MESSAGE, false);
    } else {
        // Unknown mode - clear all injections
        console.warn('[RPG Companion] Unknown generation mode, clearing all prompts');
        setExtensionPrompt('rpg-companion-inject', '', extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.FIRST_MESSAGE, false);
        setExtensionPrompt('rpg-companion-example', '', extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.FIRST_MESSAGE, false);
        setExtensionPrompt('rpg-companion-context', '', extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.BEFORE_LAST_MESSAGE, false);
        setExtensionPrompt('rpg-companion-html', '', extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.FIRST_MESSAGE, false);
        setExtensionPrompt('rpg-companion-dialogue-coloring', '', extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.FIRST_MESSAGE, false);
        setExtensionPrompt('rpg-companion-deception', '', extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.FIRST_MESSAGE, false);
        setExtensionPrompt('rpg-companion-omniscience', '', extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.FIRST_MESSAGE, false);
        setExtensionPrompt('rpg-companion-zzz-cyoa', '', extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.FIRST_MESSAGE, false);
        setExtensionPrompt('rpg-companion-spotify', '', extension_prompt_types.IN_CHAT, INJECTION_DEPTHS.FIRST_MESSAGE, false);
    }

    // Set suppression state for the historical context injection
    currentSuppressionState = shouldSuppress;

    // Prepare historical context for injection into prompts
    prepareHistoricalContextInjection();
    
    console.debug('[RPG Companion] Generation setup complete');
}

/**
 * Initialize the history injection event listeners.
 * These are persistent listeners that inject context into ALL generations
 * while pendingContextMap has data. Should be called once at extension init.
 *
 * @returns {void}
 */
export function initHistoryInjectionListeners() {
    // Validate that eventSource is available
    if (!eventSource || typeof eventSource.on !== 'function') {
        console.error('[RPG Companion] Event source not available, cannot initialize listeners');
        return;
    }

    // Register persistent listeners for prompt injection
    // These check pendingContextMap and only inject if there's data

    // Primary: BEFORE_COMBINE for text completion (more reliable - modifies message objects)
    eventSource.on(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, onGenerateBeforeCombinePrompts);

    // Fallback: AFTER_COMBINE for text completion (string-based injection)
    eventSource.on(event_types.GENERATE_AFTER_COMBINE_PROMPTS, onGenerateAfterCombinePrompts);

    // Chat completion (OpenAI, etc.)
    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, onChatCompletionPromptReady);

    console.debug('[RPG Companion] History injection listeners initialized');
}

