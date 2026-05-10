/**
 * Value Formatter Module
 * Handles formatting of tracker data values for AI context injection.
 * Extracted from promptBuilder.js to reduce file size and improve maintainability.
 */

import { extensionSettings } from "../../core/state.js";

/**
 * Helper to extract value from potentially locked fields and common object formats.
 * Recursively unwraps locked objects {value, locked} and handles arrays, objects, etc.
 *
 * @param {*} field - The field value to extract
 * @returns {string} Extracted string value
 */
export function getValue(field) {
	if (field === null || field === undefined) return "";

	// If it's a locked object with {value, locked}, extract the value
	if (
		field &&
		typeof field === "object" &&
		!Array.isArray(field) &&
		"value" in field
	) {
		return getValue(field.value); // Recursively handle in case value itself is locked
	}

	// If it's a regular value, return as string
	if (typeof field !== "object") {
		return String(field);
	}

	// For arrays of strings, join them
	if (Array.isArray(field)) {
		return field
			.map((item) => getValue(item))
			.filter(Boolean)
			.join(", ");
	}

	// Handle common object formats
	if (field && typeof field === "object") {
		// Status object: {mood, [customFields...]}
		if ("mood" in field) {
			const statusParts = [];
			const mood = getValue(field.mood);
			if (mood) statusParts.push(mood);

			// Add all other status fields (custom fields)
			for (const [key, value] of Object.entries(field)) {
				if (key !== "mood") {
					const fieldValue = getValue(value);
					if (fieldValue && fieldValue !== "None") {
						statusParts.push(fieldValue);
					}
				}
			}
			return statusParts.join(" - ");
		}

		// Skill/item/quest objects: {name}, {title}, {name, quantity}
		if ("name" in field) {
			const name = getValue(field.name);
			if ("quantity" in field && field.quantity > 1) {
				return `${name} (x${field.quantity})`;
			}
			return name;
		}

		if ("title" in field) {
			return getValue(field.title);
		}

		// Time object: {start, end}
		if ("start" in field && "end" in field) {
			return `${getValue(field.start)} - ${getValue(field.end)}`;
		}

		// Weather object: {emoji, forecast}
		if ("emoji" in field && "forecast" in field) {
			return `${getValue(field.emoji)} ${getValue(field.forecast)}`;
		}

		// Generic object fallback: create key-value pairs for small objects
		const keys = Object.keys(field);
		if (keys.length > 0 && keys.length <= 3) {
			const values = keys
				.map((k) => {
					const val = getValue(field[k]);
					return val ? `${k}: ${val}` : null;
				})
				.filter(Boolean);

			if (values.length > 0) {
				return values.join(", ");
			}
		}
	}

	return "";
}

/**
 * Formats tracker data as human-readable text for context injection.
 * Converts JSON format to a concise, natural language summary.
 *
 * @param {string|Object} jsonData - JSON formatted tracker data
 * @param {string} trackerType - Type of tracker ('userStats', 'infoBox', 'characters')
 * @param {string} userName - User's name for personalization
 * @returns {string} Formatted text summary
 */
export function formatTrackerDataForContext(jsonData, trackerType, userName) {
	if (!jsonData) return "";

	try {
		const data = typeof jsonData === "string" ? JSON.parse(jsonData) : jsonData;
		let formatted = "";

		if (trackerType === "userStats") {
			formatted += `${userName}'s Stats:\n`;

			// Get display mode and custom stats config for maxValue lookup
			const userStatsConfig = extensionSettings.trackerConfig?.userStats;
			const displayMode = userStatsConfig?.statsDisplayMode || "percentage";
			const customStats = userStatsConfig?.customStats || [];

			// Helper to get maxValue for a stat by id
			const getMaxValue = (statId) => {
				const statConfig = customStats.find((s) => s.id === statId);
				return statConfig?.maxValue || 100;
			};

			// Helper to format stat value based on display mode
			const formatStatValue = (value, statId) => {
				if (displayMode === "number") {
					const maxValue = getMaxValue(statId);
					return `${value}/${maxValue}`;
				}
				return value;
			};

			// Handle stats array format: [{id, name, value}, ...]
			if (data.stats && Array.isArray(data.stats)) {
				for (const stat of data.stats) {
					if (stat && stat.value !== undefined) {
						const statName =
							stat.name ||
							(stat.id
								? stat.id.charAt(0).toUpperCase() + stat.id.slice(1)
								: "Unknown");
						const statId = stat.id || statName.toLowerCase();
						formatted += `${statName}: ${formatStatValue(stat.value, statId)}\n`;
					}
				}
			} else {
				// Fallback: handle flat format {health: 10, mana: 20, ...}
				const statFieldOrder = [
					"health",
					"mana",
					"stamina",
					"satiety",
					"hygiene",
					"energy",
					"arousal",
				];
				const specialFields = [
					"status",
					"mood",
					"skills",
					"inventory",
					"quests",
				];

				for (const statName of statFieldOrder) {
					if (data[statName] !== undefined) {
						const value = getValue(data[statName]);
						if (value) {
							const displayName =
								statName.charAt(0).toUpperCase() + statName.slice(1);
							formatted += `${displayName}: ${formatStatValue(value, statName)}\n`;
						}
					}
				}

				// Custom numeric stats
				for (const [key, value] of Object.entries(data)) {
					if (
						!statFieldOrder.includes(key) &&
						!specialFields.includes(key) &&
						typeof value === "number"
					) {
						const displayName = key.charAt(0).toUpperCase() + key.slice(1);
						formatted += `${displayName}: ${formatStatValue(getValue(value), key)}\n`;
					}
				}
			}

			// Status/mood
			if (data.status) formatted += `Status: ${getValue(data.status)}\n`;
			if (data.mood) formatted += `Mood: ${getValue(data.mood)}\n`;

			// Skills - handle both array and object format
			if (data.skills) {
				if (Array.isArray(data.skills)) {
					const skillsList = data.skills
						.map((s) => getValue(s))
						.filter((s) => s)
						.join(", ");
					if (skillsList) formatted += `Skills: ${skillsList}\n`;
				} else if (typeof data.skills === "object") {
					const skillsList = Object.entries(data.skills)
						.map(([name, val]) => {
							const skillName = getValue(name);
							const skillVal = getValue(val);
							return skillVal ? `${skillName}: ${skillVal}` : skillName;
						})
						.filter((s) => s)
						.join(", ");
					if (skillsList) formatted += `Skills: ${skillsList}\n`;
				}
			}

			// Inventory sections
			if (data.inventory) {
				const inv = data.inventory;

				if (
					inv.onPerson &&
					Array.isArray(inv.onPerson) &&
					inv.onPerson.length > 0
				) {
					const items = inv.onPerson.map((i) => getValue(i)).filter((i) => i);
					if (items.length > 0) formatted += `On Person: ${items.join(", ")}\n`;
				} else {
					formatted += `On Person: None\n`;
				}

				if (
					inv.clothing &&
					Array.isArray(inv.clothing) &&
					inv.clothing.length > 0
				) {
					const items = inv.clothing.map((i) => getValue(i)).filter((i) => i);
					if (items.length > 0) formatted += `Clothing: ${items.join(", ")}\n`;
				} else {
					formatted += `Clothing: Nothing worn\n`;
				}

				if (
					inv.stored &&
					typeof inv.stored === "object" &&
					!Array.isArray(inv.stored)
				) {
					const locations = Object.keys(inv.stored);
					if (locations.length === 0) {
						formatted += `Stored: No storage locations\n`;
					} else {
						let hasStoredItems = false;
						for (const [location, items] of Object.entries(inv.stored)) {
							if (Array.isArray(items) && items.length > 0) {
								const itemsList = items
									.map((i) => getValue(i))
									.filter((i) => i);
								if (itemsList.length > 0) {
									formatted += `${getValue(location)}: ${itemsList.join(", ")}\n`;
									hasStoredItems = true;
								}
							}
						}
						if (!hasStoredItems) {
							formatted += `Stored: No stored items\n`;
						}
					}
				} else {
					formatted += `Stored: No storage locations\n`;
				}

				if (inv.assets && Array.isArray(inv.assets) && inv.assets.length > 0) {
					const items = inv.assets.map((i) => getValue(i)).filter((i) => i);
					if (items.length > 0) formatted += `Assets: ${items.join(", ")}\n`;
				} else {
					formatted += `Assets: None\n`;
				}
			}

			// Quests
			if (data.quests) {
				const quests = data.quests;

				// Main quest - handle string, array, or object with {title, completed, date, location}
				if (quests.main) {
					if (typeof quests.main === "string") {
						const mainQuest = getValue(quests.main);
						if (mainQuest) formatted += `Main Quest: ${mainQuest}\n`;
					} else if (Array.isArray(quests.main) && quests.main.length > 0) {
						const questsList = quests.main
							.map((q) => getValue(q))
							.filter((q) => q);
						if (questsList.length > 0)
							formatted += `Main Quests: ${questsList.join(", ")}\n`;
					} else if (typeof quests.main === "object") {
						const questTitle = getValue(quests.main.title);
						const questCompleted =
							quests.main.completed !== undefined
								? quests.main.completed
									? "✅"
									: "❌"
								: "";
						const questDate = getValue(quests.main.date);
						const questLocation = getValue(quests.main.location);

						const mainQuestDetails = [];
						if (questTitle) mainQuestDetails.push(questTitle);
						if (questCompleted) mainQuestDetails.push(questCompleted);
						if (questDate) mainQuestDetails.push(`📅 ${questDate}`);
						if (questLocation) mainQuestDetails.push(`📍 ${questLocation}`);

						if (mainQuestDetails.length > 0) {
							formatted += `Main Quest: ${mainQuestDetails.join(" - ")}\n`;
						}
					}
				}

				// Optional quests
				if (
					quests.optional &&
					Array.isArray(quests.optional) &&
					quests.optional.length > 0
				) {
					const questsList = quests.optional
						.map((q) => {
							if (typeof q === "string") {
								return getValue(q);
							} else if (q && typeof q === "object") {
								const questTitle = getValue(q.title);
								const questCompleted =
									q.completed !== undefined ? (q.completed ? "✅" : "❌") : "";
								const questDate = getValue(q.date);
								const questLocation = getValue(q.location);

								const questDetails = [];
								if (questTitle) questDetails.push(questTitle);
								if (questCompleted) questDetails.push(questCompleted);
								if (questDate) questDetails.push(`📅 ${questDate}`);
								if (questLocation) questDetails.push(`📍 ${questLocation}`);

								return questDetails.length > 0
									? questDetails.join(" - ")
									: null;
							}
							return null;
						})
						.filter((q) => q);

					if (questsList.length > 0)
						formatted += `Optional Quests: ${questsList.join(", ")}\n`;
				}
			}
		} else if (trackerType === "infoBox") {
			formatted += `Info Box:\n`;
			if (data.location) formatted += `Location: ${getValue(data.location)}\n`;
			if (data.date) formatted += `Date: ${getValue(data.date)}\n`;
			if (data.time) formatted += `Time: ${getValue(data.time)}\n`;
			if (data.weather) formatted += `Weather: ${getValue(data.weather)}\n`;
			if (data.temperature)
				formatted += `Temperature: ${getValue(data.temperature)}\n`;

			// Custom fields
			const knownFields = [
				"location",
				"date",
				"time",
				"weather",
				"temperature",
			];
			for (const [key, value] of Object.entries(data)) {
				if (!knownFields.includes(key)) {
					const val = getValue(value);
					if (val) {
						const displayName = key
							.replace(/([A-Z])/g, " $1")
							.replace(/^./, (str) => str.toUpperCase())
							.trim();
						formatted += `${displayName}: ${val}\n`;
					}
				}
			}
		} else if (trackerType === "characters") {
			if (Array.isArray(data)) {
				formatted += `Present Characters:\n`;
				for (const char of data) {
					const charName = getValue(char.name) || "Unknown";
					formatted += `- ${charName}:\n`;

					// Details section - parse all custom fields
					if (char.details && typeof char.details === "object") {
						for (const [key, value] of Object.entries(char.details)) {
							const fieldValue = getValue(value);
							if (fieldValue) {
								const fieldName = key
									.replace(/_/g, " ")
									.replace(/([A-Z])/g, " $1")
									.replace(/^./, (str) => str.toUpperCase())
									.trim();
								formatted += `  ${fieldName}: ${fieldValue}\n`;
							}
						}
					}

					// Relationship - check both Relationship (new format) and relationship (old format)
					const relationshipValue = char.Relationship || char.relationship;
					if (relationshipValue) {
						let relValue;
						if (
							typeof relationshipValue === "object" &&
							!Array.isArray(relationshipValue) &&
							"status" in relationshipValue
						) {
							relValue = getValue(relationshipValue.status);
						} else {
							relValue = getValue(relationshipValue);
						}
						if (relValue) formatted += `  Relationship: ${relValue}\n`;
					}

					// Thoughts
					if (char.thoughts) {
						let thoughtValue;
						if (
							typeof char.thoughts === "object" &&
							!Array.isArray(char.thoughts) &&
							"content" in char.thoughts
						) {
							thoughtValue = getValue(char.thoughts.content);
						} else {
							thoughtValue = getValue(char.thoughts);
						}
						if (thoughtValue) formatted += `  Thoughts: ${thoughtValue}\n`;
					}

					// Stats
					if (
						char.stats &&
						typeof char.stats === "object" &&
						!Array.isArray(char.stats)
					) {
						const statsList = Object.entries(char.stats)
							.map(([name, val]) => {
								const statValue = getValue(val);
								return statValue ? `${name}: ${statValue}` : null;
							})
							.filter((s) => s)
							.join(", ");
						if (statsList) formatted += `  Stats: ${statsList}\n`;
					}
				}
			}
		}

		return formatted;
	} catch (e) {
		console.warn(
			"[RPG Companion] Failed to format tracker data for context:",
			e,
		);
		console.warn("[RPG Companion] Error details:", e.stack);
		return "";
	}
}

/**
 * Formats relationship data for AI context injection.
 * Converts the relationships array into a readable text format.
 *
 * @param {Array} relationships - Array of relationship objects
 * @returns {string} Formatted relationship text or empty string
 */
export function formatRelationshipsForContext(relationships) {
	if (
		!relationships ||
		!Array.isArray(relationships) ||
		relationships.length === 0
	) {
		return "";
	}
	console.log(
		`[RPG Companion] Formatting ${relationships.length} relationships for context.`,
	);

	const lines = relationships.map((rel) => {
		const c1 = rel.character1 || "?";
		const c2 = rel.character2 || "?";
		const status = rel.status || "Neutral";

		// Character 1 → Character 2
		const feelsTowards = rel.feelsTowards ? ` [${rel.feelsTowards}]` : "";
		const wantsFrom = rel.wantsFrom ? ` [wants: ${rel.wantsFrom}]` : "";
		const secretsFrom = rel.secretsFrom ? ` [secret: ${rel.secretsFrom}]` : "";

		// Character 2 → Character 1
		const feelsTowards2 = rel.feelsTowards2 ? ` [${rel.feelsTowards2}]` : "";
		const wantsFrom2 = rel.wantsFrom2 ? ` [wants: ${rel.wantsFrom2}]` : "";
		const secretsFrom2 = rel.secretsFrom2
			? ` [secret: ${rel.secretsFrom2}]`
			: "";

		const c1ToC2 = `${c1} → ${c2}:${feelsTowards}${wantsFrom}${secretsFrom}`;
		const c2ToC1 = `${c2} → ${c1}:${feelsTowards2}${wantsFrom2}${secretsFrom2}`;

		return `${c1} ↔ ${c2}: ${status} | ${c1ToC2} | ${c2ToC1}`;
	});

	const output = `Relationships:\n${lines.join("\n")}`;
	console.log(
		`[RPG Companion] Formatted relationships for context:\n${output}`,
	);

	return output;
}

/**
 * Formats historical tracker data from a message's rpg_companion_swipes data.
 * Only includes tracker fields that have persistInHistory enabled in trackerConfig,
 * unless useAllEnabled is true, in which case it includes all enabled fields.
 *
 * @param {Object} trackerData - The tracker data from message.extra.rpg_companion_swipes[swipeId]
 * @param {Object} trackerConfig - The tracker configuration from extensionSettings.trackerConfig
 * @param {string} userName - The user's name for personalization
 * @param {boolean} [useAllEnabled=false] - If true, include all enabled fields instead of only persistInHistory fields
 * @returns {string} Formatted historical context or empty string if nothing to include
 */
export function formatHistoricalTrackerData(
	trackerData,
	trackerConfig,
	userName,
	useAllEnabled = false,
) {
	if (!trackerData || !trackerConfig) {
		return "";
	}

	// Helper to check if a field should be included
	const shouldInclude = (config) => {
		if (useAllEnabled) {
			return config?.enabled !== false;
		}
		return config?.persistInHistory === true;
	};

	// Helper to check if a stat/attribute should be included
	const shouldIncludeStat = (configStat) => {
		if (useAllEnabled) {
			return configStat?.enabled !== false;
		}
		return configStat?.persistInHistory === true;
	};

	let formatted = "";

	try {
		// Process userStats if present and has persistence-enabled fields
		if (trackerData.userStats) {
			const userStatsConfig = trackerConfig.userStats;
			const userStatsData = trackerData.userStats;

			let statsFormatted = "";

			// Custom stats with persistInHistory enabled (or enabled if useAllEnabled)
			if (
				userStatsData.stats &&
				Array.isArray(userStatsData.stats) &&
				userStatsConfig.customStats
			) {
				for (const stat of userStatsData.stats) {
					const configStat = userStatsConfig.customStats.find(
						(s) => s.id === stat.id,
					);
					if (shouldIncludeStat(configStat) && stat.value !== undefined) {
						const statName = stat.name || configStat.name || stat.id;
						statsFormatted += `${statName}: ${stat.value}, `;
					}
				}
			}

			// Status section
			if (
				shouldInclude(userStatsConfig.statusSection) &&
				userStatsData.status
			) {
				const mood = getValue(
					userStatsData.status.mood || userStatsData.status,
				);
				if (mood && userStatsConfig.statusSection.showMoodEmoji)
					statsFormatted += `Mood: ${mood}, `;

				// Add all custom status fields
				const customFields = userStatsConfig.statusSection.customFields || [];
				for (const fieldName of customFields) {
					const fieldKey = fieldName.toLowerCase();
					const fieldValue = getValue(userStatsData.status[fieldKey]);
					if (fieldValue && fieldValue !== "None") {
						statsFormatted += `${fieldName}: ${fieldValue}, `;
					}
				}
			}

			// Skills section
			if (
				shouldInclude(userStatsConfig.skillsSection) &&
				userStatsData.skills
			) {
				const skillsList = Array.isArray(userStatsData.skills)
					? userStatsData.skills
							.map((s) => getValue(s))
							.filter((s) => s)
							.join(", ")
					: getValue(userStatsData.skills);
				if (skillsList) statsFormatted += `Skills: ${skillsList}, `;
			}

			// Inventory
			const shouldIncludeInventory =
				useAllEnabled || userStatsConfig.inventoryPersistInHistory;
			if (shouldIncludeInventory && userStatsData.inventory) {
				const inv = userStatsData.inventory;
				if (
					inv.onPerson &&
					Array.isArray(inv.onPerson) &&
					inv.onPerson.length > 0
				) {
					const items = inv.onPerson.map((i) => getValue(i)).filter((i) => i);
					if (items.length > 0)
						statsFormatted += `On Person: ${items.join(", ")}, `;
				} else {
					statsFormatted += `On Person: No items, `;
				}
				if (
					inv.clothing &&
					Array.isArray(inv.clothing) &&
					inv.clothing.length > 0
				) {
					const items = inv.clothing.map((i) => getValue(i)).filter((i) => i);
					if (items.length > 0)
						statsFormatted += `Clothing: ${items.join(", ")}, `;
				} else {
					statsFormatted += `Clothing: Nothing worn, `;
				}
			}

			// Quests
			const shouldIncludeQuests =
				useAllEnabled || userStatsConfig.questsPersistInHistory;
			if (shouldIncludeQuests && userStatsData.quests) {
				const quests = userStatsData.quests;
				if (quests.main) {
					const mainQuestDetails = [];

					if (typeof quests.main === "string") {
						const mainQuest = getValue(quests.main);
						if (mainQuest && mainQuest !== "None")
							mainQuestDetails.push(mainQuest);
					} else if (quests.main && typeof quests.main === "object") {
						const questTitle = getValue(quests.main.title);
						const questCompleted =
							quests.main.completed !== undefined
								? quests.main.completed
									? "✅"
									: "❌"
								: "";
						const questDate = getValue(quests.main.date);
						const questLocation = getValue(quests.main.location);

						if (questTitle) mainQuestDetails.push(questTitle);
						if (questCompleted) mainQuestDetails.push(questCompleted);
						if (questDate) mainQuestDetails.push(`📅 ${questDate}`);
						if (questLocation) mainQuestDetails.push(`📍 ${questLocation}`);
					}

					if (
						mainQuestDetails.length > 0 &&
						mainQuestDetails.join(" - ") !== "None"
					) {
						statsFormatted += `Quest: ${mainQuestDetails.join(" - ")}, `;
					}
				}
			}

			if (statsFormatted) {
				formatted += `${userName}: ${statsFormatted.slice(0, -2)}\n`;
			}
		}

		// Process appearance if present and has persistence-enabled fields
		if (trackerData.userStats && trackerData.userStats.appearance) {
			const userStatsConfig = trackerConfig.userStats;
			const appearanceData = trackerData.userStats.appearance;
			const shouldIncludeAppearance =
				useAllEnabled || userStatsConfig.appearancePersistInHistory;

			if (shouldIncludeAppearance && appearanceData) {
				let appearanceFormatted = "";

				// Description (clothing, hair, physical features)
				if (appearanceData.description) {
					const description = getValue(appearanceData.description);
					if (description)
						appearanceFormatted += `Appearance: ${description}, `;
				}

				// Hair
				if (appearanceData.hair) {
					const hair = getValue(appearanceData.hair);
					if (hair) appearanceFormatted += `Hair: ${hair}, `;
				}

				// Scent
				if (appearanceData.scent) {
					const scent = getValue(appearanceData.scent);
					if (scent) appearanceFormatted += `Scent: ${scent}, `;
				}

				// Posture
				if (appearanceData.posture) {
					const posture = getValue(appearanceData.posture);
					if (posture) appearanceFormatted += `Posture: ${posture}, `;
				}

				// Clothing (from appearance.clothing, not inventory.clothing)
				if (
					appearanceData.clothing &&
					Array.isArray(appearanceData.clothing) &&
					appearanceData.clothing.length > 0
				) {
					const items = appearanceData.clothing
						.map((i) => getValue(i))
						.filter((i) => i);
					if (items.length > 0)
						appearanceFormatted += `Clothing: ${items.join(", ")}, `;
				} else if (
					appearanceData.clothing &&
					Array.isArray(appearanceData.clothing) &&
					appearanceData.clothing.length === 0
				) {
					appearanceFormatted += `Clothing: Nothing worn, `;
				}

				// Features (physical features like scars, tattoos, etc.)
				if (
					appearanceData.features &&
					Array.isArray(appearanceData.features) &&
					appearanceData.features.length > 0
				) {
					const features = appearanceData.features
						.map((f) => getValue(f))
						.filter((f) => f);
					if (features.length > 0)
						appearanceFormatted += `Features: ${features.join(", ")}, `;
				}

				if (appearanceFormatted) {
					formatted += `${userName}: ${appearanceFormatted.slice(0, -2)}\n`;
				}
			}
		}

		// Process infoBox if present and has persistence-enabled widgets
		if (trackerData.infoBox) {
			const infoBoxConfig = trackerConfig.infoBox;
			const infoBoxData = trackerData.infoBox;

			let infoFormatted = "";

			// Date
			if (shouldInclude(infoBoxConfig.widgets.date) && infoBoxData.date) {
				const date = getValue(infoBoxData.date);
				if (date) infoFormatted += `Date: ${date}, `;
			}

			// Time
			if (shouldInclude(infoBoxConfig.widgets.time) && infoBoxData.time) {
				const time = getValue(infoBoxData.time);
				if (time) infoFormatted += `Time: ${time}, `;
			}

			// Weather
			if (shouldInclude(infoBoxConfig.widgets.weather) && infoBoxData.weather) {
				const weather = getValue(infoBoxData.weather);
				if (weather) infoFormatted += `Weather: ${weather}, `;
			}

			// Temperature
			if (
				shouldInclude(infoBoxConfig.widgets.temperature) &&
				infoBoxData.temperature
			) {
				const temp = getValue(infoBoxData.temperature);
				if (temp) infoFormatted += `Temp: ${temp}, `;
			}

			// Location
			if (
				shouldInclude(infoBoxConfig.widgets.location) &&
				infoBoxData.location
			) {
				const location = getValue(infoBoxData.location);
				if (location) infoFormatted += `Location: ${location}, `;
			}

			// Recent Events
			if (
				shouldInclude(infoBoxConfig.widgets.recentEvents) &&
				infoBoxData.recentEvents
			) {
				const events = getValue(infoBoxData.recentEvents);
				if (events) infoFormatted += `Events: ${events}, `;
			}

			if (infoFormatted) {
				formatted += infoFormatted.slice(0, -2) + "\n";
			}
		}

		// Process characterThoughts if present and has persistence-enabled fields
		if (trackerData.characterThoughts) {
			const charsConfig = trackerConfig.presentCharacters;
			const charsData = trackerData.characterThoughts;

			// Characters can be an array or wrapped in an object
			const characters = Array.isArray(charsData)
				? charsData
				: charsData.characters || [];

			for (const char of characters) {
				if (!char || !char.name) continue;

				let charFormatted = "";

				// Custom fields (appearance, demeanor, etc.)
				if (char.details && typeof char.details === "object") {
					for (const field of charsConfig.customFields) {
						if (shouldIncludeStat(field) && char.details[field.id]) {
							const value = getValue(char.details[field.id]);
							if (value) charFormatted += `${field.name}: ${value}, `;
						}
					}
				}

				// Thoughts
				if (shouldInclude(charsConfig.thoughts) && char.thoughts) {
					const thoughts =
						typeof char.thoughts === "object" && char.thoughts.content
							? getValue(char.thoughts.content)
							: getValue(char.thoughts);
					if (thoughts) charFormatted += `Thinking: ${thoughts}, `;
				}

				if (charFormatted) {
					formatted += `${getValue(char.name)}: ${charFormatted.slice(0, -2)}\n`;
				}
			}
		}

		return formatted.trim();
	} catch (e) {
		console.warn(
			"[RPG Companion] Failed to format historical tracker data:",
			e,
		);
		return "";
	}
}
