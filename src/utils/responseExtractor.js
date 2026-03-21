/**
 * Response Extractor Utility
 *
 * Handles extraction of text content from various API response formats.
 * Fixes the "No message generated" error caused by Claude models with
 * extended thinking, where the API response `content` field is an array
 * of content blocks instead of a single string.
 *
 * Also provides a safe wrapper around SillyTavern's `generateRaw` that
 * intercepts the raw fetch response as a fallback.
 */

import { generateRaw } from '../../../../../../../script.js';

/**
 * Extracts text from any API response shape (Anthropic content-block arrays,
 * OpenAI choices, plain strings, etc.).
 *
 * @param {*} response - The raw API response (string, array, or object)
 * @returns {string} The extracted text content
 */
export function extractTextFromResponse(response) {
    if (!response) return '';
    if (typeof response === 'string') return response;

    // Response itself is an array of content blocks (Anthropic extended thinking)
    if (Array.isArray(response)) {
        const texts = response
            .filter(b => b && b.type === 'text' && typeof b.text === 'string')
            .map(b => b.text);
        if (texts.length > 0) return texts.join('\n');

        const strings = response.filter(item => typeof item === 'string');
        if (strings.length > 0) return strings.join('\n');

        return JSON.stringify(response);
    }

    // response.content (string or Anthropic content array)
    if (response.content !== undefined && response.content !== null) {
        if (typeof response.content === 'string') return response.content;
        if (Array.isArray(response.content)) {
            const texts = response.content
                .filter(b => b && b.type === 'text' && typeof b.text === 'string')
                .map(b => b.text);
            if (texts.length > 0) return texts.join('\n');
        }
    }

    // OpenAI choices format
    if (response.choices?.[0]?.message?.content) {
        const c = response.choices[0].message.content;
        if (typeof c === 'string') return c;
        if (Array.isArray(c)) {
            const texts = c
                .filter(b => b && b.type === 'text' && typeof b.text === 'string')
                .map(b => b.text);
            if (texts.length > 0) return texts.join('\n');
        }
    }

    // Other common fields
    if (typeof response.text === 'string') return response.text;
    if (typeof response.message === 'string') return response.message;
    if (response.message?.content && typeof response.message.content === 'string') {
        return response.message.content;
    }

    return JSON.stringify(response);
}
