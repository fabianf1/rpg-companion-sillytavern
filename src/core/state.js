/**
 * Core State Management Module
 * Centralizes all extension state variables
 */

/**
 * Default avatar image (SVG with question mark) as base64 data URI
 * Used as fallback when no avatar is available
 */
export const FALLBACK_AVATAR_DATA_URI =
	"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2NjY2NjYyIgb3BhY2l0eT0iMC4zIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIiBmaWxsPSIjMzY2IiBmb250LXNpemU9IjQwIj4/PC90ZXh0Pjwvc3ZnPg==";

/**
 * Extension settings - persisted to SillyTavern settings
 */
export let extensionSettings = {
	settingsVersion: 7, // Version number for settings migrations (v7 = removed HTML, Dialogue Coloring, Deception, Omniscience, CYOA features)
	enabled: true,
	autoUpdate: false,
	updateDepth: 4, // How many messages to include in the context
	relationUpdateDepth: 4, // How many messages to include for relationship updates
	generationMode: "single", // 'single' - generates RPG data separately (manual or auto)
	parallelTrackerGeneration: false, // Run RPG and relationship generation in parallel when refreshing tracker info
	connectionProfile: "", // Connection Manager profile name for tracker generation (empty = use current)
	showUserStats: true,
	showInfoBox: true,
	showCharacterThoughts: true,
	showInventory: true, // Show inventory section (v2 system)
	showQuests: true, // Show quests section
	showRelationships: true, // Show relationships tracking and button
	showCharacterCards: true, // Show character card tracking (lorebook-based NPC profiles)
	showThoughtsInChat: true, // Show thoughts overlay in chat
	narratorMode: false, // Use character card as narrator instead of fixed character references
	customNarratorPrompt: "", // Custom narrator mode prompt text (empty = use default)
	customContextInstructionsPrompt: "", // Custom context instructions prompt text (empty = use default)

	enableDynamicWeather: true, // Enable dynamic weather effects based on Info Box weather field (v2: enabled by default)
	weatherBackground: true, // Show weather effects in background (behind chat)
	weatherForeground: false, // Show weather effects in foreground (on top of chat)
	dismissedHolidayPromo: false, // User dismissed the holiday promotion banner

	showDynamicWeatherToggle: true, // Show Dynamic Weather Effects toggle in main panel
	showNarratorMode: true, // Show Narrator Mode toggle in main panel
	skipInjectionsForGuided: "none", // skip injections for instruct injections and quiet prompts (GuidedGenerations compatibility)
	enableRandomizedPlot: true, // Show randomized plot progression button above chat input
	enableNaturalPlot: true, // Show natural plot progression button above chat input
	retryAttempts: 0, // Number of retry attempts for API failures (0 = no retries)
	retryBaseDelay: 2000, // Base delay in ms for exponential backoff
	partialRefreshSelections: {}, // Per-section toggles for partial refresh modal (empty = all visible sections selected at runtime)
	minReplyLength: 100, // Minimum reply length (characters) for auto-update (0 = disabled)
	// History persistence settings - inject selected tracker data into historical messages
	historyPersistence: {
		enabled: false, // Master toggle for history persistence feature
		messageCount: 5, // Number of messages to include (0 = all available)
		injectionPosition: "assistant_message_end", // 'user_message_end', 'assistant_message_end', 'extra_user_message', 'extra_assistant_message'
		contextPreamble: "", // Optional custom preamble text (empty = use default short one)
		sendAllEnabledOnRefresh: false, // If true, sends all enabled stats from preset instead of only persistInHistory-enabled stats on Refresh RPG Info
	},
	panelPosition: "right", // 'left', 'right', or 'top'
	theme: "default", // Theme: default, sci-fi, fantasy, cyberpunk, custom
	customColors: {
		bg: "#1a1a2e",
		bgOpacity: 100,
		accent: "#16213e",
		accentOpacity: 100,
		text: "#eaeaea",
		textOpacity: 100,
		highlight: "#e94560",
		highlightOpacity: 100,
	},
	statBarColorLow: "#cc3333", // Color for low stat values (red)
	statBarColorLowOpacity: 100,
	statBarColorHigh: "#33cc66", // Color for high stat values (green)
	statBarColorHighOpacity: 100,
	enableAnimations: true, // Enable smooth animations for stats and content updates
	mobileFabPosition: {
		top: "calc(var(--topBarBlockSize) + 60px)",
		right: "12px",
	}, // Saved position for mobile FAB button
	// Mobile FAB widget display options (8-position system around the button)
	mobileFabWidgets: {
		enabled: true, // Master toggle for FAB widgets
		weatherIcon: { enabled: true, position: 0 }, // Weather emoji (☀️, 🌧️, etc.)
		weatherDesc: { enabled: true, position: 1 }, // Weather description text
		clock: { enabled: true, position: 2 }, // Current time display
		date: { enabled: true, position: 3 }, // Date display
		location: { enabled: true, position: 4 }, // Location name
		stats: { enabled: true, position: 5 }, // All stats as compact numbers
		attributes: { enabled: true, position: 6 }, // Compact RPG attributes display
	},
	// Desktop strip widget display options (shown in collapsed panel strip)
	desktopStripWidgets: {
		enabled: true, // Master toggle for strip widgets (enabled by default)
		weatherIcon: { enabled: true }, // Weather emoji (☀️, 🌧️, etc.)
		clock: { enabled: true }, // Current time display
		date: { enabled: true }, // Date display
		location: { enabled: true }, // Location name
		stats: { enabled: true }, // All stats as compact numbers
		attributes: { enabled: true }, // Compact RPG attributes display
	},
	userStats: JSON.stringify(
		{
			stats: [
				{ id: "health", name: "Health", value: 100 },
				{ id: "satiety", name: "Satiety", value: 100 },
				{ id: "energy", name: "Energy", value: 100 },
				{ id: "hygiene", name: "Hygiene", value: 100 },
				{ id: "arousal", name: "Arousal", value: 0 },
			],
			status: {
				mood: "😐",
				conditions: "None",
			},
			inventory: {
				onPerson: [],
				stored: [],
			},
			appearance: {
				clothing: [],
				hair: "",
				scent: "",
				posture: "",
				physicalFeatures: "",
			},
			quests: {
				main: null,
				optional: [],
			},
		},
		null,
		2,
	),
	statNames: {
		health: "Health",
		satiety: "Satiety",
		energy: "Energy",
		hygiene: "Hygiene",
		arousal: "Arousal",
	},
	trackerConfig: {
		userStats: {
			// Stats display mode: 'percentage' or 'number'
			statsDisplayMode: "percentage",
			// Array of custom stats (allows add/remove/rename)
			customStats: [
				{
					id: "health",
					name: "Health",
					enabled: true,
					persistInHistory: false,
					maxValue: 100,
				},
				{
					id: "satiety",
					name: "Satiety",
					enabled: true,
					persistInHistory: false,
					maxValue: 100,
				},
				{
					id: "energy",
					name: "Energy",
					enabled: true,
					persistInHistory: false,
					maxValue: 100,
				},
				{
					id: "hygiene",
					name: "Hygiene",
					enabled: true,
					persistInHistory: false,
					maxValue: 100,
				},
				{
					id: "arousal",
					name: "Arousal",
					enabled: true,
					persistInHistory: false,
					maxValue: 100,
				},
			],
			// RPG Attributes (customizable D&D-style attributes)
			showRPGAttributes: true,
			showLevel: true, // Show/hide level in UI and prompts
			alwaysSendAttributes: false, // If true, always send attributes; if false, only send with dice rolls
			rpgAttributes: [
				{ id: "str", name: "STR", enabled: true, persistInHistory: false },
				{ id: "dex", name: "DEX", enabled: true, persistInHistory: false },
				{ id: "con", name: "CON", enabled: true, persistInHistory: false },
				{ id: "int", name: "INT", enabled: true, persistInHistory: false },
				{ id: "wis", name: "WIS", enabled: true, persistInHistory: false },
				{ id: "cha", name: "CHA", enabled: true, persistInHistory: false },
			],
			// Status section config
			statusSection: {
				enabled: true,
				showMoodEmoji: true,
				customFields: ["Conditions"], // User can edit what to track
				persistInHistory: false, // Persist status in historical messages
			},
			// Optional skills field
			skillsSection: {
				enabled: false,
				label: "Skills", // User-editable
				customFields: [], // Array of skill names
				persistInHistory: false, // Persist skills in historical messages
			},
			// Inventory persistence
			inventoryPersistInHistory: false, // Persist inventory in historical messages
			// Quests persistence
			questsPersistInHistory: false, // Persist quests in historical messages
		},
		infoBox: {
			widgets: {
				date: {
					enabled: true,
					format: "Weekday, Month, Year",
					persistInHistory: true,
				}, // Date enabled by default for history
				weather: { enabled: true, persistInHistory: true }, // Weather enabled by default for history
				temperature: { enabled: true, unit: "C", persistInHistory: false }, // 'C' or 'F'
				time: { enabled: true, persistInHistory: true, format: "24h" }, // '12h' (12-hour), '24h' (24-hour)
				location: { enabled: true, persistInHistory: true }, // Location enabled by default for history
				recentEvents: { enabled: true, persistInHistory: false },
			},
		},
		presentCharacters: {
			// Fixed fields (always shown)
			showEmoji: true,
			showName: true,
			// Relationship fields configuration
			relationships: {
				enabled: true,
				// Relationship to emoji mapping (shown on character portraits)
				// Keys define the allowed status options for AI prompts
				relationshipEmojis: {
					Lover: "❤️",
					Friend: "⭐",
					Ally: "🤝",
					Enemy: "⚔️",
					Neutral: "⚖️",
				},
				// Only track relationships where protagonist is one of the two characters
				relationshipsProtagonistOnly: false,
			},
			// Custom fields (appearance, demeanor, etc. - shown after relationship, separated by |)
			customFields: [
				{
					id: "appearance",
					name: "Appearance",
					enabled: true,
					description:
						"Visible physical appearance (clothing, hair, notable features)",
					persistInHistory: false,
				},
				{
					id: "demeanor",
					name: "Demeanor",
					enabled: true,
					description: "Observable demeanor or emotional state",
					persistInHistory: false,
				},
			],
			// Thoughts configuration (separate line)
			thoughts: {
				enabled: true,
				name: "Thoughts",
				description:
					"Internal Monologue (in first person from character's POV, up to three sentences long)",
				persistInHistory: false,
			},
			// Character stats toggle (optional feature)
			characterStats: {
				enabled: false,
				customStats: [
					{ id: "health", name: "Health", enabled: true },
					{ id: "arousal", name: "Arousal", enabled: true },
				],
			},
		},
		// Character Cards configuration (lorebook-based NPC profiles)
		characterCards: {
			enabled: true,
			lorebookName: "", // User-selected lorebook name (empty = use default world info)
			updateInterval: 10, // Messages between automatic character card updates
			messageCounter: 0, // Tracks messages since last update (runtime only, not persisted)
			// Default fields for character cards
			fields: [
				{ id: "name", name: "Name", enabled: true, description: "Character's full name" },
				{ id: "age", name: "Age", enabled: true, description: "Character's approximate age" },
				{ id: "appearance", name: "Appearance", enabled: true, description: "General physical appearance (hair, build, distinguishing features)" },
				{ id: "demeanor", name: "Demeanor", enabled: true, description: "General demeanor and typical behavior" },
				{ id: "role", name: "Role", enabled: true, description: "Character's role or occupation in the story" },
				{ id: "personality", name: "Personality", enabled: true, description: "Core personality traits and temperament" },
				{ id: "background", name: "Background", enabled: true, description: "Brief history or backstory" },
			],
			// Custom fields added by the user
			customFields: [],
		},
	},
	quests: {
		main: null, // Current main quest (object or null)
		optional: [], // Array of optional quests (objects or strings)
	},
	infoBox: JSON.stringify(
		{
			date: {
				value: new Date().toLocaleDateString("en-US", {
					weekday: "long",
					year: "numeric",
					month: "long",
					day: "numeric",
				}),
			},
			weather: { emoji: "☀️", forecast: "Clear skies" },
			temperature: { value: 20, unit: "C" },
			time: { start: "00:00", end: "00:00" },
			location: { value: "Unknown Location" },
		},
		null,
		2,
	),
	characterThoughts: JSON.stringify(
		{
			characters: [],
		},
		null,
		2,
	),
	level: 1, // User's character level
	classicStats: {
		str: 10,
		dex: 10,
		con: 10,
		int: 10,
		wis: 10,
		cha: 10,
	},
	lastDiceRoll: null, // Store last dice roll result
	showDiceDisplay: true, // Show the "Last Roll" display in the panel
	lastTrackerMessage: null, // Track which message ID contains the last tracker data
	collapsedInventoryLocations: [], // Array of collapsed storage location names
	inventoryViewModes: {
		onPerson: "list", // 'list' or 'grid' view mode for On Person section
		stored: "list", // 'list' or 'grid' view mode for Stored section
		assets: "list", // 'list' or 'grid' view mode for Assets section
	},
	npcAvatars: {}, // Store custom avatar images for NPCs (key: character name, value: base64 data URI)
	// Lock state for tracker items (v3 JSON format feature)
	lockedItems: {
		userStats: {}, // Object mapping stat IDs to boolean locked state (e.g., {"health": true, "satiety": false})
		infoBox: {},
		characters: {}, // Object mapping character names to their locked fields (e.g., {"Sarah": {relationship: true, thoughts: false}})
	},
	// Preset management for tracker configurations
	presetManager: {
		// Map of preset ID to preset data (contains name and trackerConfig)
		presets: {},
		// Map of character/group entity to preset ID (e.g., "char_0": "preset_123", "group_abc": "preset_456")
		// Note: This is stored separately and NOT exported with presets
		characterAssociations: {},
		// Currently active preset ID
		activePresetId: null,
		// Default preset ID (used when no character association exists)
		defaultPresetId: null,
	},
};

/**
 * Tracks whether the last action was a swipe
 */
export let lastActionWasSwipe = false;

/**
 * Flag indicating if generation is in progress
 */
export let isGenerating = false;

/**
 * Tracks if we're currently doing a plot progression
 */
export let isPlotProgression = false;

/**
 * Flag indicating if we're actively expecting a new message from generation
 * (as opposed to loading chat history)
 */
export let isAwaitingNewMessage = false;

/**
 * Temporary storage for pending dice roll (not saved until user clicks "Save Roll")
 */
export let pendingDiceRoll = null;

/**
 * AbortController for canceling in-flight generation
 */
export let currentGenerationAbortController = null;

/**
 * Sets the abort controller for current generation
 * @param {AbortController|null} controller - AbortController instance or null to clear
 */
export function setGenerationAbortController(controller) {
	currentGenerationAbortController = controller;
}

/**
 * Gets the current abort controller
 * @returns {AbortController|null} Current abort controller or null
 */
export function getGenerationAbortController() {
	return currentGenerationAbortController;
}

/**
 * Aborts the current generation if one is in progress
 */
export function abortCurrentGeneration() {
	if (currentGenerationAbortController) {
		console.log("[RPG Companion] Aborting current generation...");
		currentGenerationAbortController.abort();
		currentGenerationAbortController = null;
	}
}

/**
 * Feature flags for gradual rollout of new features
 */
export const FEATURE_FLAGS = {
	useNewInventory: true, // Enable v2 inventory system with categorized storage
};

/**
 * UI Element References (jQuery objects)
 */
export let $panelContainer = null;
export let $userStatsContainer = null;
export let $infoBoxContainer = null;
export let $thoughtsContainer = null;
export let $inventoryContainer = null;
export let $appearanceContainer = null;
export let $questsContainer = null;

/**
 * State setters - provide controlled mutation of state variables
 */
export function setExtensionSettings(newSettings) {
	extensionSettings = newSettings;
}

export function updateExtensionSettings(updates) {
	Object.assign(extensionSettings, updates);
}

export function setLastActionWasSwipe(value) {
	lastActionWasSwipe = value;
}

export function setIsGenerating(value) {
	isGenerating = value;
}

export function setIsPlotProgression(value) {
	isPlotProgression = value;
}

export function setIsAwaitingNewMessage(value) {
	isAwaitingNewMessage = value;
}

export function setPendingDiceRoll(roll) {
	pendingDiceRoll = roll;
}

export function getPendingDiceRoll() {
	return pendingDiceRoll;
}

export function setPanelContainer($element) {
	$panelContainer = $element;
}

export function setUserStatsContainer($element) {
	$userStatsContainer = $element;
}

export function setInfoBoxContainer($element) {
	$infoBoxContainer = $element;
}

export function setThoughtsContainer($element) {
	$thoughtsContainer = $element;
}

export function setInventoryContainer($element) {
	$inventoryContainer = $element;
}

export function setQuestsContainer($element) {
	$questsContainer = $element;
}

export function setAppearanceContainer($element) {
	$appearanceContainer = $element;
}
