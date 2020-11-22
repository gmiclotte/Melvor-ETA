// ==UserScript==
// @name		Melvor ETA
// @namespace	http://tampermonkey.net/
// @version		0.1.18-0.17
// @description Shows xp/h and mastery xp/h, and the time remaining until certain targets are reached. Takes into account Mastery Levels and other bonuses.
// @description Please report issues on https://github.com/gmiclotte/Melvor-Time-Remaining/issues or message TinyCoyote#1769 on Discord
// @description The last part of the version number is the most recent version of Melvor that was tested with this script. More recent versions might break the script.
// @description	Forked from Breindahl#2660's Melvor TimeRemaining script v0.6.2.2., originally developed by Breindahl#2660, Xhaf#6478 and Visua#9999
// @author		GMiclotte
// @match		https://melvoridle.com/*
// @match		https://www.melvoridle.com/*
// @match		https://test.melvoridle.com/*
// @grant		none
// ==/UserScript==
/* jshint esversion: 9 */

// script to inject
function script() {
	// Loading script
	console.log('Melvor ETA Loaded');

	// settings can be changed from the console, the default values here will be overwritten by the values in localStorage['ETASettings']
	window.ETASettings = {
		/*
			toggles
		 */
		// true for 12h clock (AM/PM), false for 24h clock
		IS_12H_CLOCK: false,
		// true for short clock `xxhxxmxxs`, false for long clock `xx hours, xx minutes and xx seconds`
		IS_SHORT_CLOCK: true,
		// true for alternative main display with xp/h, mastery xp/h and action count
		SHOW_XP_RATE: true,
		// true to allow final pool percentage > 100%
		UNCAP_POOL: true,
		// true will show the current xp/h and mastery xp/h; false shows average if using all resources
		// does not affect anything if SHOW_XP_RATE is false
		CURRENT_RATES: false,
		// set to true to include mastery tokens in time until 100% pool
		USE_TOKENS: false,
		// set to true to show partial level progress in the ETA tooltips
		SHOW_PARTIAL_LEVELS: false,
		// set to true to hide the required resources in the ETA tooltips
		HIDE_REQUIRED: false,
		/*
			targets
		 */
		// Default global target level / mastery / pool% is 99 / 99 / 100
		GLOBAL_TARGET_LEVEL: 99,
		GLOBAL_TARGET_MASTERY: 99,
		GLOBAL_TARGET_POOL: 100,
		// skill specific targets can be defined here, these override the global targets
		TARGET_LEVEL: {
			// [CONSTANTS.skill.Firemaking]: 120,
		},
		TARGET_MASTERY: {
			// [CONSTANTS.skill.Herblore]: 90,
		},
		TARGET_POOL: {
			// [CONSTANTS.skill.Crafting]: 25,
		},
		// returns the appropriate target
		getTarget: (global, specific, defaultTarget) => {
			let target = defaultTarget;
			if (Number.isInteger(global)) {
				target = global;
			}
			if (Number.isInteger(specific)) {
				target = specific;
			}
			if (target <= 0) {
				target = defaultTarget;
			}
 			return Math.ceil(target);
		},
		getTargetLevel: (skillID) => {
			return ETASettings.getTarget(ETASettings.GLOBAL_TARGET_LEVEL, ETASettings.TARGET_LEVEL[skillID], 99);
		},
		getTargetMastery: (skillID) => {
			return ETASettings.getTarget(ETASettings.GLOBAL_TARGET_MASTERY, ETASettings.TARGET_MASTERY[skillID], 99);
		},
		getTargetPool: (skillID) => {
			return ETASettings.getTarget(ETASettings.GLOBAL_TARGET_POOL, ETASettings.TARGET_POOL[skillID], 100);
		},

		/*
			methods
		 */
		// save settings to local storage
		save: () => {
			localStorage['ETASettings'] = window.JSON.stringify(ETASettings);
		}
	};

	// Function to check if task is complete
	function taskComplete(skillID) {
		if (window.timeLeftLast > 1 && window.timeLeftCurrent === 0) {
			notifyPlayer(skillID, "Task Done", "danger");
			console.log('Melvor ETA: task done');
			let ding = new Audio("https://www.myinstants.com/media/sounds/ding-sound-effect.mp3");
			ding.volume=0.1;
			ding.play();
		}
	}

	// Function to get unformatted number for Qty
	function getQtyOfItem(itemID) {
		for (let i = 0; i < bank.length; i++) {
			if (bank[i].id === itemID) {
				return bank[i].qty;
			}
		}
		return 0;
	}

	function appendName(t, name, isShortClock) {
		if (t === 0) {
			return "";
		}
		if (isShortClock) {
			return t + name[0];
		}
		let result = t + " " + name;
		if (t === 1) {
			return result;
		}
		return result + "s";
	}

	// Convert seconds to hours/minutes/seconds and format them
	function secondsToHms(time, isShortClock = ETASettings.IS_SHORT_CLOCK) {
		time = Number(time);
		// split seconds in days, hours, minutes and seconds
		let d = Math.floor(time / 86400)
		let h = Math.floor(time % 86400 / 3600);
		let m = Math.floor(time % 3600 / 60);
		let s = Math.floor(time % 60);
		// no comma in short form
		// ` and ` if hours and minutes or hours and seconds
		// `, ` if hours and minutes and seconds
		let dDisplayComma = " ";
		if (!isShortClock && d > 0) {
			let count = (h > 0) + (m > 0) + (s > 0);
			if (count === 1) {
				dDisplayComma = " and ";
			} else if (count > 1) {
				dDisplayComma = ", ";
			}
		}
		let hDisplayComma = " ";
		if (!isShortClock && h > 0) {
			let count = (m > 0) + (s > 0);
			if (count === 1) {
				hDisplayComma = " and ";
			} else if (count > 1) {
				hDisplayComma = ", ";
			}
		}
		// no comma in short form
		// ` and ` if minutes and seconds
		let mDisplayComma = " ";
		if (!isShortClock && m > 0) {
			if (s > 0) {
				mDisplayComma = " and ";
			}
		}
		// append h/hour/hours etc depending on isShortClock, then concat and return
		return appendName(d, "day", isShortClock) + dDisplayComma
			+ appendName(h, "hour", isShortClock) + hDisplayComma
			+ appendName(m, "minute", isShortClock) + mDisplayComma
			+ appendName(s, "second", isShortClock);
	}

	// Add seconds to date
	function AddSecondsToDate(date, seconds) {
		return new Date(date.getTime() + seconds * 1000);
	}

	// Days between now and then
	function daysBetween(now, then) {
		const startOfDayNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		return Math.floor((then - startOfDayNow) / 1000 / 60 / 60 / 24 + (startOfDayNow.getTimezoneOffset() - then.getTimezoneOffset()) / (60 * 24));
	}

	// Format date 24 hour clock
	function DateFormat(now, then, is12h = ETASettings.IS_12H_CLOCK, isShortClock = ETASettings.IS_SHORT_CLOCK){
		let format = {weekday: "short", month: "short", day: "numeric"};
		let date = then.toLocaleString(undefined, format);
		if (date === now.toLocaleString(undefined, format)) {
			date = "";
		} else {
			date += " at ";
		}
		let hours = then.getHours();
		let minutes = then.getMinutes();
		// convert to 12h clock if required
		let amOrPm = '';
		if (is12h) {
			amOrPm = hours >= 12 ? 'pm' : 'am';
			hours = (hours % 12) || 12;
		} else {
			// only pad 24h clock hours
			hours = hours < 10 ? '0' + hours : hours;
		}
		// pad minutes
		minutes = minutes < 10 ? '0' + minutes : minutes;
		// concat and return remaining time
		return date + hours + ':' + minutes + amOrPm;
	}

	// Level to Xp Array
	const lvlToXp = Array.from({ length: 200 }, (_, i) => exp.level_to_xp(i));

	// Convert level to Xp needed to reach that level
	function convertLvlToXp(level) {
		if (level === Infinity) { return Infinity; }
		let xp = 0;
		if (level === 1) { return xp; }
		xp = lvlToXp[level] + 1;
		return xp;
	}

	// Convert Xp value to level
	function convertXpToLvl(xp, noCap = false) {
		let level = 1;
		while (lvlToXp[level] < xp) { level++; }
		level--;
		if (level < 1) { level = 1; }
		else if (!noCap && level > 99) { level = 99; }
		return level;
	}

	// Get Mastery Level of given Skill and Mastery ID
	function getMasteryLevel(skill, masteryID) {
		return convertXpToLvl(MASTERY[skill].xp[masteryID]);
	}

	// Progress in current level
	function getPercentageInLevel(currentXp, finalXp, type, bar = false) {
		let currentLevel = convertXpToLvl(currentXp, true);
		if (currentLevel >= 99 && (type === "mastery" || bar === true)) return 0;
		let currentLevelXp = convertLvlToXp(currentLevel);
		let nextLevelXp = convertLvlToXp(currentLevel+1);
		let diffLevelXp = nextLevelXp - currentLevelXp;
		let currentLevelPercentage = (currentXp - currentLevelXp) / diffLevelXp * 100;
		if (bar === true) {
			let finalLevelPercentage = ((finalXp - currentXp) > (nextLevelXp - currentXp)) ? 100 - currentLevelPercentage : ((finalXp - currentXp)/diffLevelXp*100).toFixed(4);
			return finalLevelPercentage;
		}
		else {
			return currentLevelPercentage;
		}
	}

	//Return the chanceToKeep for any mastery EXp
	function masteryPreservation(initial, masteryEXp, chanceToRefTable){
		let chanceTo = chanceToRefTable;
		if (masteryEXp >= initial.masteryLim[0]) {
			for (let i = 0; i < initial.masteryLim.length; i++) {
				if (initial.masteryLim[i] <= masteryEXp && masteryEXp < initial.masteryLim[i+1]) {
					return chanceTo[i+1];
				}
			}
		} else {return chanceTo[0];}
	}

	// Adjust interval based on unlocked bonuses
	function intervalAdjustment(initial, poolXp, masteryXp) {
		let adjustedInterval = initial.skillInterval;
		switch (initial.skillID) {
			case CONSTANTS.skill.Firemaking:
				if (poolXp >= initial.poolLim[1]) {
					adjustedInterval *= 0.9;
				}
				adjustedInterval *= 1 - convertXpToLvl(masteryXp) * 0.001;
				break;

			case CONSTANTS.skill.Crafting:
			case CONSTANTS.skill.Mining:
				// pool bonus speed
				if (poolXp >= initial.poolLim[2]) {
					adjustedInterval -= 200;
				}
				break;

			case CONSTANTS.skill.Fletching:
				if (poolXp >= initial.poolLim[3]) {
					adjustedInterval -= 200;
				}
				break;

			case CONSTANTS.skill.Woodcutting:
				if (convertXpToLvl(masteryXp) >= 99) {
					adjustedInterval -= 200;
				}
		}
		return adjustedInterval;
	}

	// Adjust interval based on unlocked bonuses
	function intervalRespawnAdjustment(initial, currentInterval, poolXp, masteryXp) {
		let adjustedInterval = currentInterval;
		switch (initial.skillID) {
			case CONSTANTS.skill.Mining:
				// compute max rock HP
				let rockHP = 5 /*base*/ + convertXpToLvl(masteryXp);
				if (petUnlocked[4]) {
					rockHP += 5;
				}
				if (poolXp >= initial.poolLim[3]) {
					rockHP += 10;
				}
				// potions can preserve rock HP
				let preservation = herbloreBonuses[10].bonus[1]
				if (preservation !== null) {
					rockHP /= (1 - preservation / 100);
				}
				// compute average time per action
				let spawnTime = miningData[initial.currentAction].respawnInterval;
				if (poolXp > initial.poolLim[1]) {
					spawnTime *= 0.9;
				}
				adjustedInterval = (adjustedInterval * rockHP + spawnTime) / rockHP;
				break;

			case CONSTANTS.skill.Thieving:
				let successRate = 0;
				let npc = thievingNPC[initial.currentAction];
				if (convertXpToLvl(masteryXp) >= 99) {
					successRate = 100;
				} else {
					let increasedSuccess = 0;
					if (poolXp >= initial.poolLim[1]) {
						increasedSuccess = 10;
					}
					successRate = Math.floor((skillLevel[CONSTANTS.skill.Thieving] - npc.level) * 0.7
						+ convertXpToLvl(masteryXp) * 0.25
						+ npc.baseSuccess) + increasedSuccess;
				}
				if (successRate > npc.maxSuccess && convertXpToLvl(masteryXp) < 99) {
					successRate = npc.maxSuccess;
				}
				if (glovesTracker[CONSTANTS.shop.gloves.Thieving].isActive
					&& glovesTracker[CONSTANTS.shop.gloves.Thieving].remainingActions > 0 // TODO: handle charge use
					&& equippedItems[CONSTANTS.equipmentSlot.Gloves] === CONSTANTS.item.Thieving_Gloves) {
					successRate += 10;
				}
				successRate = Math.min(100, successRate) / 100;
				// stunTime = 3s + time of the failed action, since failure gives no xp or mxp
				let stunTime = 3000 + adjustedInterval;
				// compute average time per action
				adjustedInterval = adjustedInterval * successRate + stunTime * (1 - successRate);
				break;
		}
		return adjustedInterval;
	}

	// Adjust preservation chance based on unlocked bonuses
	function poolPreservation(initial, poolXp) {
		let preservation = 0;
		switch (initial.skillID) {
			case CONSTANTS.skill.Smithing:
				if (poolXp >= initial.poolLim[1]) preservation += 5;
				if (poolXp >= initial.poolLim[2]) preservation += 5;
				break;

			case CONSTANTS.skill.Runecrafting:
				if (poolXp >= initial.poolLim[2]) preservation += 10;
				break;

			case CONSTANTS.skill.Herblore:
				if (poolXp >= initial.poolLim[2]) preservation += 5;
				break;

			case CONSTANTS.skill.Cooking:
				if (poolXp >= initial.poolLim[2]) preservation += 10;
				break;
		}
		return preservation / 100;
	}

	// Adjust skill Xp based on unlocked bonuses
	function skillXpAdjustment(initial, poolXp, masteryXp) {
		let xpMultiplier = 1;
		switch (initial.skillID) {
			case CONSTANTS.skill.Runecrafting:
				if (poolXp >= initial.poolLim[1] && items[initial.item].type === "Rune") {
					xpMultiplier += 1.5;
				}
				break;

			case CONSTANTS.skill.Cooking: {
				let burnChance = calcBurnChance(masteryXp);
				let cookXp = initial.itemXp * (1 - burnChance);
				let burnXp = 1 * burnChance;
				return cookXp + burnXp;
			}

			case CONSTANTS.skill.Fishing: {
				let junkChance = calcJunkChance(initial, masteryXp, poolXp);
				let fishXp = initial.itemXp * (1 - junkChance);
				let junkXp = 1 * junkChance;
				return fishXp + junkXp;
			}

			case CONSTANTS.skill.Smithing: {
				if (glovesTracker[CONSTANTS.shop.gloves.Smithing].isActive
					&& glovesTracker[CONSTANTS.shop.gloves.Smithing].remainingActions > 0 // TODO: handle charge use
					&& equippedItems[CONSTANTS.equipmentSlot.Gloves] === CONSTANTS.item.Smithing_Gloves) {
					xpMultiplier += 0.5;
				}
				break;
			}
		}
		return initial.itemXp * xpMultiplier;
	}

	// Calculate total number of unlocked items for skill based on current skill level
	function calcTotalUnlockedItems(skillID, skillXp) {
		let count = 0;
		let currentSkillLevel = convertXpToLvl(skillXp);
		for (let i = 0; i < MILESTONES[skillName[skillID]].length; i++) {
			if (currentSkillLevel >= MILESTONES[skillName[skillID]][i].level) count++;
		}
		return count;
	}

	// compute average actions per mastery token
	function actionsPerToken(skillID, skillXp) {
		let actions = 20000 / calcTotalUnlockedItems(skillID, skillXp);
		if (equippedItems.includes(CONSTANTS.item.Clue_Chasers_Insignia)) {
			actions *= 0.9;
		}
		return actions;
	}

	function initialVariables(skillID) {
		let initial = {
			skillID: skillID,
			item: 0,
			itemXp: 0,
			skillInterval: 0,
			masteryID: 0,
			skillXp: skillXP[skillID], // Current skill Xp
			masteryXp: 0, // Current amount of Mastery experience
			totalMasteryLevel: 0,
			poolXp: 0,
			maxPoolXp: 0,
			targetPoolXp: 0,
			masteryLim: [], // Xp needed to reach next level
			skillLim: [], // Xp needed to reach next level
			poolLim: [], // Xp need to reach next pool checkpoint
			skillReq: [], // Needed items for craft and their quantities
			recordCraft: Infinity, // Amount of craftable items for limiting resource
			isMagic: skillID === CONSTANTS.skill.Magic, // magic has no mastery, so we often check this
			// gathering skills are treated differently, so we often check this
			isGathering: skillID === CONSTANTS.skill.Woodcutting
				|| skillID === CONSTANTS.skill.Fishing
				|| skillID === CONSTANTS.skill.Mining
				|| skillID === CONSTANTS.skill.Thieving,
			// Generate default values for script
			poolLimCheckpoints: [10, 25, 50, 95, 100, Infinity], //Breakpoints for mastery pool bonuses followed by Infinity
			maxXp: convertLvlToXp(ETASettings.getTargetLevel(skillID)),
			maxMasteryXp: convertLvlToXp(ETASettings.getTargetMastery(skillID)),
			tokens: 0,
		}
		//Breakpoints for mastery bonuses - default all levels starting at 2 to 99, followed by Infinity
		initial.masteryLimLevel = Array.from({ length: 98 }, (_, i) => i + 2);
		initial.masteryLimLevel.push(Infinity);
		//Breakpoints for mastery bonuses - default all levels starting at 2 to 99, followed by Infinity
		initial.skillLimLevel = Array.from({ length: 98 }, (_, i) => i + 2);
		initial.skillLimLevel.push(Infinity);
		// Chance to keep at breakpoints - default 0.2% per level
		initial.chanceToKeep = Array.from({ length: 99 }, (_, i) => i *0.002);
		initial.chanceToKeep[98] += 0.05; // Level 99 Bonus
		return initial;
	}

	function skillCapeEquipped(capeID) {
		return equippedItems.includes(capeID)
			|| equippedItems.includes(CONSTANTS.item.Max_Skillcape)
			|| equippedItems.includes(CONSTANTS.item.Cape_of_Completion);
	}

	function configureSmithing(initial) {
		initial.item = smithingItems[selectedSmith].itemID;
		initial.itemXp = items[initial.item].smithingXP;
		initial.skillInterval = 2000;
		if (godUpgrade[3]) initial.skillInterval *= 0.8;
		for (let i of items[initial.item].smithReq) {
			initial.skillReq.push(i);
		}
		initial.masteryLimLevel = [20, 40, 60, 80, 99, Infinity]; // Smithing Mastery Limits
		initial.chanceToKeep = [0, 0.05, 0.10, 0.15, 0.20, 0.30]; //Smithing Mastery bonus percentages
		if (petUnlocked[5]) initial.chanceToKeep = initial.chanceToKeep.map(n => n + PETS[5].chance / 100); // Add Pet Bonus
		return initial;
	}

	function configureFletching(initial) {
		initial.item = fletchingItems[selectedFletch].itemID;
		initial.itemXp = items[initial.item].fletchingXP;
		initial.skillInterval = 2000;
		if (godUpgrade[0]) initial.skillInterval *= 0.8;
		if (petUnlocked[8]) initial.skillInterval -= 200;
		for (let i of items[initial.item].fletchReq) {
			initial.skillReq.push(i);
		}
		//Special Case for Arrow Shafts
		if (initial.item === CONSTANTS.item.Arrow_Shafts) {
			if (selectedFletchLog === undefined) {
				selectedFletchLog = 0;
			}
			initial.skillReq = [initial.skillReq[selectedFletchLog]];
		}
		return initial;
	}

	function configureRunecrafting(initial) {
		initial.item = runecraftingItems[selectedRunecraft].itemID;
		initial.itemXp = items[initial.item].runecraftingXP;
		initial.skillInterval = 2000;
		if (godUpgrade[1]) initial.skillInterval *= 0.8;
		for (let i of items[initial.item].runecraftReq) {
			initial.skillReq.push(i);
		}
		initial.masteryLimLevel = [99, Infinity]; // Runecrafting has no Mastery bonus
		initial.chanceToKeep = [0, 0]; //Thus no chance to keep
		if (skillCapeEquipped(CONSTANTS.item.Runecrafting_Skillcape)) {
			initial.chanceToKeep[0] += 0.35;
		}
		if (petUnlocked[10]) initial.chanceToKeep[0] += PETS[10].chance / 100;
		initial.chanceToKeep[1] = initial.chanceToKeep[0];
		return initial;
	}

	function configureCrafting(initial) {
		initial.item = craftingItems[selectedCraft].itemID;
		initial.itemXp = items[initial.item].craftingXP;
		initial.skillInterval = 3000;
		if (godUpgrade[0]) initial.skillInterval *= 0.8;
		if (skillCapeEquipped(CONSTANTS.item.Crafting_Skillcape)) {
			initial.skillInterval -= 500;
		}
		if (petUnlocked[9]) initial.skillInterval -= 200;
		items[initial.item].craftReq.forEach(i=>initial.skillReq.push(i));
		return initial;
	}

	function configureHerblore(initial){
		initial.item = herbloreItemData[selectedHerblore].itemID[getHerbloreTier(selectedHerblore)];
		initial.itemXp = herbloreItemData[selectedHerblore].herbloreXP;
		initial.skillInterval = 2000;
		if (godUpgrade[1]) initial.skillInterval *= 0.8;
		for (let i of items[initial.item].herbloreReq) {
			initial.skillReq.push(i);
		}
		return initial;
	}

	function configureCooking(initial) {
		initial.item = selectedFood;
		initial.itemXp = items[initial.item].cookingXP;
		if (currentCookingFire > 0) {
			initial.itemXp *= (1 + cookingFireData[currentCookingFire - 1].bonusXP / 100);
		}
		initial.skillInterval = 3000;
		if (godUpgrade[3]) initial.skillInterval *= 0.8;
		initial.skillReq = [{id: initial.item, qty: 1}];
		initial.masteryLimLevel = [99, Infinity]; //Cooking has no Mastery bonus
		initial.chanceToKeep = [0, 0]; //Thus no chance to keep
		initial.item = items[initial.item].cookedItemID;
		return initial;
	}

	function configureFiremaking(initial) {
		initial.item = selectedLog;
		initial.itemXp = logsData[selectedLog].xp * (1 + bonfireBonus / 100);
		initial.skillInterval = logsData[selectedLog].interval;
		if (godUpgrade[3]) initial.skillInterval *= 0.8;
		initial.skillReq = [{id: initial.item, qty: 1}];
		initial.chanceToKeep.fill(0); // Firemaking Mastery does not provide preservation chance
		return initial;
	}

	function configureMagic(initial) {
		initial.skillInterval = 2000;
		//Find need runes for spell
		if (ALTMAGIC[selectedAltMagic].runesRequiredAlt !== undefined && useCombinationRunes) {
			for (let i of ALTMAGIC[selectedAltMagic].runesRequiredAlt) {
				initial.skillReq.push({...i});
			}
		}
		else {
			for (let i of ALTMAGIC[selectedAltMagic].runesRequired) {
				initial.skillReq.push({...i});
			}
		}
		// Get Rune discount
		for (let i = 0; i < initial.skillReq.length; i++) {
			if (items[equippedItems[CONSTANTS.equipmentSlot.Weapon]].providesRune !== undefined) {
				if (items[equippedItems[CONSTANTS.equipmentSlot.Weapon]].providesRune.includes(initial.skillReq[i].id)) {
					let capeMultiplier = 1;
					if (skillCapeEquipped(CONSTANTS.item.Magic_Skillcape)) capeMultiplier = 2; // Add cape multiplier
					initial.skillReq[i].qty -= items[equippedItems[CONSTANTS.equipmentSlot.Weapon]].providesRuneQty * capeMultiplier;
				}
			}
		}
		initial.skillReq = initial.skillReq.filter(item => item.qty > 0); // Remove all runes with 0 cost
		//Other items
		if (ALTMAGIC[selectedAltMagic].selectItem === 1 && selectedMagicItem[1] !== null) { // Spells that just use 1 item
			initial.skillReq.push({id: selectedMagicItem[1], qty: 1});
		}
		else if (ALTMAGIC[selectedAltMagic].selectItem === -1) { // Spells that doesn't require you to select an item
			if (ALTMAGIC[selectedAltMagic].needCoal) { // Rags to Riches II
				initial.skillReq.push({id: 48, qty: 1});
			}
		}
		else if (selectedMagicItem[0] !== null && ALTMAGIC[selectedAltMagic].selectItem === 0) { // SUPERHEAT
			for (let i of items[selectedMagicItem[0]].smithReq) {
				initial.skillReq.push({...i});
			}
			if (ALTMAGIC[selectedAltMagic].ignoreCoal) {
				initial.skillReq = initial.skillReq.filter(item => item.id !== 48);
			}
		}
		initial.masteryLimLevel = [Infinity]; //AltMagic has no Mastery bonus
		initial.chanceToKeep = [0]; //Thus no chance to keep
		return initial;
	}

	function configureGathering(initial) {
		initial.skillReq = [];
		initial.chanceToKeep = initial.chanceToKeep.map(_ => 0); // No chance to keep for gathering
		initial.recordCraft = 0;
		initial.masteryID = initial.currentAction;
		return initial;
	}

	function configureMining(initial) {
		initial.item = miningData[initial.currentAction].ore;
		initial.itemXp = items[initial.item].miningXP;
		initial.skillInterval = 3000;
		if (godUpgrade[2]) initial.skillInterval *= 0.8;
		initial.skillInterval *= 1 - pickaxeBonusSpeed[currentPickaxe] / 100;
		return configureGathering(initial);
	}

	function configureThieving(initial) {
		initial.item = thievingNPC[initial.currentAction];
		initial.itemXp = initial.item.xp;
		initial.skillInterval = 3000;
		if (skillCapeEquipped(CONSTANTS.item.Thieving_Skillcape)) {
			initial.skillInterval -= 500;
		}
		return configureGathering(initial);
	}

	function configureWoodcutting(initial) {
		initial.item = trees[initial.currentAction];
		initial.itemXp = initial.item.xp;
		initial.skillInterval = initial.item.interval;
		if (godUpgrade[2]) {
			initial.skillInterval *= 0.8;
		}
		initial.skillInterval *= 1 - axeBonusSpeed[currentAxe] / 100;
		if (skillCapeEquipped(CONSTANTS.item.Woodcutting_Skillcape)) {
			initial.skillInterval /= 2;
		}
		return configureGathering(initial);
	}

	function configureFishing(initial) {
		initial.item = items[fishingItems[fishingAreas[initial.currentAction].fish[initial.fishID]].itemID];
		initial.itemXp = initial.item.fishingXP;
		// base avg interval
		let avgRoll = 0.5;
		const max = initial.item.maxFishingInterval;
		const min = initial.item.minFishingInterval;
		initial.skillInterval = Math.floor(avgRoll * (max - min)) + min;
		// handle gear and rod
		let fishingAmuletBonus = 1;
		if (equippedItems.includes(CONSTANTS.item.Amulet_of_Fishing)) {
			fishingAmuletBonus = 1 - items[CONSTANTS.item.Amulet_of_Fishing].fishingSpeedBonus / 100;
		}
		initial.skillInterval = Math.floor(initial.skillInterval * fishingAmuletBonus * (1 - rodBonusSpeed[currentRod] / 100));
		initial = configureGathering(initial);
		// correctly set masteryID
		initial.masteryID = fishingAreas[initial.currentAction].fish[initial.fishID];
		return initial
	}

	// Calculate mastery xp based on unlocked bonuses
	function calcMasteryXpToAdd(initial, current, timePerAction) {
		let xpModifier = 1;
		// General Mastery Xp formula
		let xpToAdd = (
			(calcTotalUnlockedItems(initial.skillID, current.skillXp) * current.totalMasteryLevel) / getTotalMasteryLevelForSkill(initial.skillID)
			+ convertXpToLvl(current.masteryXp) * (getTotalItemsInSkill(initial.skillID) / 10)
		) * (timePerAction / 1000) / 2;
		// Skill specific mastery pool modifier
		if (current.poolXp >= initial.poolLim[0]) {
			xpModifier += 0.05;
		}
		// Firemaking pool and log modifiers
		if (initial.skillID === CONSTANTS.skill.Firemaking) {
			// If current skill is Firemaking, we need to apply mastery progression from actions and use updated poolXp values
			if (current.poolXp >= initial.poolLim[3]) {
				xpModifier += 0.05;
			}
			for (let i = 0; i < MASTERY[CONSTANTS.skill.Firemaking].xp.length; i++) {
				// The logs you are not burning
				if (initial.masteryID !== i) {
					if (getMasteryLevel(CONSTANTS.skill.Firemaking, i) >= 99) {
						xpModifier += 0.0025;
					}
				}
			}
			// The log you are burning
			if (convertXpToLvl(current.masteryXp) >= 99) {
				xpModifier += 0.0025;
			}
		} else {
			// For all other skills, you use the game function to grab your FM mastery progression
			if (getMasteryPoolProgress(CONSTANTS.skill.Firemaking) >= masteryCheckpoints[3]) {
				xpModifier += 0.05;
			}
			for (let i = 0; i < MASTERY[CONSTANTS.skill.Firemaking].xp.length; i++) {
				if (getMasteryLevel(CONSTANTS.skill.Firemaking, i) >= 99) {
					xpModifier += 0.0025;
				}
			}
		}
		// Ty modifier
		if (petUnlocked[21]) {
			xpModifier += 0.03;
		}
		// AROM modifier
		if (equippedItems.includes(CONSTANTS.item.Ancient_Ring_Of_Mastery)) {
			xpModifier += items[CONSTANTS.item.Ancient_Ring_Of_Mastery].bonusMasteryXP;
		}
		// Combine base and modifiers
		xpToAdd *= xpModifier;
		// minimum 1 mastery xp per action
		if (xpToAdd < 1) {
			xpToAdd = 1;
		}
		// BurnChance affects average mastery Xp
		if (initial.skillID === CONSTANTS.skill.Cooking) {
			let burnChance = calcBurnChance(current.masteryXp);
			xpToAdd *= (1 - burnChance);
		}
		// Fishing junk gives no mastery xp
		if (initial.skillID === CONSTANTS.skill.Fishing) {
			let junkChance = calcJunkChance(initial, current.masteryXp, current.poolXp);
			xpToAdd *= (1 - junkChance);
		}
		// return average mastery xp per action
		return xpToAdd;
	}

	// Calculate pool Xp based on mastery Xp
	function calcPoolXpToAdd(skillXp, masteryXp) {
		if (convertXpToLvl(skillXp) >= 99) {return masteryXp / 2; }
		else { return masteryXp / 4; }
	}

	// Calculate burn chance based on mastery level
	function calcBurnChance(masteryXp) {
		let burnChance = 0;
		if (skillCapeEquipped(CONSTANTS.item.Cooking_Skillcape)) {
			return burnChance;
		}
		if (equippedItems.includes(CONSTANTS.item.Cooking_Gloves)) {
			return burnChance;
		}
		let primaryBurnChance = (30 - convertXpToLvl(masteryXp) * 0.6) / 100;
		let secondaryBurnChance = 0.01;
		if (primaryBurnChance <= 0) {
			return secondaryBurnChance;
		}
		burnChance = 1 - (1 - primaryBurnChance) * (1 - secondaryBurnChance);
		return burnChance;
	}

	// calculate junk chance
	function calcJunkChance(initial, masteryXp, poolXp) {
		// base
		let junkChance = fishingAreas[initial.currentAction].junkChance;
		// mastery turns 3% junk in 3% special
		let masteryLevel = convertXpToLvl(masteryXp);
		if (masteryLevel >= 50) {
			junkChance -= 3;
		}
		// potion
		if (herbloreBonuses[7].bonus[0] === 0 && herbloreBonuses[7].charges > 0) {
			junkChance -= herbloreBonuses[7].bonus[1];
		}
		// no junk if mastery level > 65 or pool > 25%
		if (masteryLevel >= 65
			|| junkChance < 0
			|| poolXp >= initial.poolLim[1]) {
			junkChance = 0;
		}
		return junkChance / 100;
	}

	function currentVariables(initial, resources) {
		let current = {
			sumTotalTime: 0,
			// skill
			skillXp: initial.skillXp,
			maxSkillReached: initial.skillXp >= initial.maxXp,
			maxSkillTime: 0,
			maxSkillResources: 0,
			// mastery
			masteryXp: initial.masteryXp,
			maxMasteryReached: initial.masteryXp >= initial.maxMasteryXp,
			maxMasteryTime: 0,
			maxMasteryResources: 0,
			// pool
			poolXp: initial.poolXp,
			maxPoolReached: initial.poolXp >= initial.targetPoolXp,
			maxPoolTime: 0,
			maxPoolResources: 0,
			totalMasteryLevel: initial.totalMasteryLevel,
			// items
			resources: resources,
			chargeUses: 0, // estimated remaining charge uses
			tokens: initial.tokens,
			// estimated number of actions taken so far
			actions: 0,
		};
		return current;
	}

	function gainPerAction(initial, current, currentInterval) {
		let gains = {};
		gains.xpPerAction = skillXpAdjustment(initial, current.poolXp, current.masteryXp);
		gains.masteryXpPerAction = calcMasteryXpToAdd(initial, current, currentInterval);
		gains.poolXpPerAction = calcPoolXpToAdd(current.skillXp, gains.masteryXpPerAction);
		gains.tokensPerAction = 1 / actionsPerToken(initial.skillID, current.skillXp);
		gains.tokenXpPerAction = initial.maxPoolXp / 1000 * gains.tokensPerAction;
		return gains
	}

	function syncSecondary(current) {
		current.secondary.skillXp = current.skillXp;
		current.secondary.poolXp = current.poolXp;
		current.secondary.totalMasteryLevel = current.secondary.totalMasteryLevel;
		return current;
	}

	function actionsToBreakpoint(initial, current, noResources = false) {
		const rhaelyxChargePreservation = 0.15;

		// Adjustments
		const totalChanceToUse = 1 - masteryPreservation(initial, current.masteryXp, initial.chanceToKeep) - poolPreservation(initial, current.poolXp);
		const currentInterval = intervalAdjustment(initial, current.poolXp, current.masteryXp);
		const averageActionTime = intervalRespawnAdjustment(initial, currentInterval, current.poolXp, current.masteryXp);

		// Current Xp
		let gains = gainPerAction(initial, current, currentInterval);
		if (initial.secondary !== undefined) {
			// sync xp, pool and total mastery
			current = syncSecondary(current);
			// compute gains per secondary action
			const secondaryInterval = intervalAdjustment(initial.secondary, current.poolXp, current.masteryXp);
			const secondaryGains = gainPerAction(initial.secondary, current.secondary, secondaryInterval);
			// add average secondary gains to primary gains
			[
				'xpPerAction',
				'poolXpPerAction',
				'tokensPerAction',
				'tokenXpPerAction',
			].forEach(x => {
				gains[x] += secondaryGains[x] / secondaryInterval * currentInterval;
			});
			gains.secondaryMasteryXpPerPrimaryAction = secondaryGains.masteryXpPerAction / secondaryInterval * currentInterval;
		}
		if (ETASettings.USE_TOKENS) {
			gains.poolXpPerAction += gains.tokenXpPerAction;
		}

		// Distance to Limits
		getLim = (lims, xp, max) => {
			const lim = lims.find(element => element > xp);
			if (xp < max && max < lim) {
				return Math.ceil(max);
			}
			return Math.ceil(lim);
		}
		const skillXpToLimit = getLim(initial.skillLim, current.skillXp, initial.maxXp) - current.skillXp;
		const masteryXpToLimit = getLim(initial.skillLim, current.masteryXp, initial.maxMasteryXp) - current.masteryXp;
		let secondaryMasteryXpToLimit = Infinity;
		if (initial.secondary !== undefined) {
			secondaryMasteryXpToLimit = getLim(initial.secondary.skillLim, current.secondary.masteryXp, initial.secondary.maxMasteryXp) - current.secondary.masteryXp;
		}
		const poolXpToLimit = getLim(initial.poolLim, current.poolXp, initial.targetPoolXp) - current.poolXp;

		// Actions to limits
		const skillXpActions = skillXpToLimit / gains.xpPerAction;
		const masteryXpActions = masteryXpToLimit / gains.masteryXpPerAction;
		let secondaryMasteryXpPrimaryActions = Infinity;
		if (initial.secondary !== undefined) {
			secondaryMasteryXpPrimaryActions = secondaryMasteryXpToLimit / gains.secondaryMasteryXpPerPrimaryAction;
		}
		const poolXpActions = poolXpToLimit / gains.poolXpPerAction;

		// Minimum actions based on limits
		let expectedActions = Math.ceil(Math.min(skillXpActions, masteryXpActions, secondaryMasteryXpPrimaryActions, poolXpActions));

		// estimate actions remaining with current resources
		let resourceActions = 0;
		if (!noResources) {
			// estimate amount of actions possible with remaining resources
			// number of actions with rhaelyx charges
			resourceActions = Math.min(current.chargeUses, current.resources / (totalChanceToUse - rhaelyxChargePreservation));
			// remaining resources
			const resWithoutCharge = Math.max(0, current.resources - current.chargeUses * (totalChanceToUse - rhaelyxChargePreservation));
			// add number of actions without rhaelyx charges
			resourceActions = Math.ceil(resourceActions + resWithoutCharge / totalChanceToUse);
			expectedActions = Math.min(expectedActions, resourceActions);
			// estimate total remaining actions
			current.actions += expectedActions;
		}
		// Take away resources based on expectedActions
		if (!initial.isGathering) {
			// Update remaining Rhaelyx Charge uses
			current.chargeUses -= expectedActions;
			if (current.chargeUses < 0) {
				current.chargeUses = 0;
			}
			// Update remaining resources
			if (expectedActions === resourceActions) {
				current.resources = 0; // No more limits
			} else {
				let resUsed = 0;
				if (expectedActions < current.chargeUses) {
					// won't run out of charges yet
					resUsed = expectedActions * (totalChanceToUse - rhaelyxChargePreservation);
				} else {
					// first use charges
					resUsed = current.chargeUses * (totalChanceToUse - rhaelyxChargePreservation);
					// remaining actions are without charges
					resUsed += (expectedActions - current.chargeUses) * totalChanceToUse;
				}
				current.resources = Math.round(current.resources - resUsed);
			}
		}

		// time for current loop
		const timeToAdd = expectedActions * averageActionTime;
		// gain tokens, unless we're using them
		if (!ETASettings.USE_TOKENS) {
			current.tokens += expectedActions * gains.tokensPerAction;
		}
		// Update time and Xp
		current.sumTotalTime += timeToAdd;
		current.skillXp += gains.xpPerAction * expectedActions;
		current.masteryXp += gains.masteryXpPerAction * expectedActions;
		if (initial.secondary !== undefined) {
			current.secondary.masteryXp += gains.secondaryMasteryXpPerPrimaryAction * expectedActions;
		}
		current.poolXp += gains.poolXpPerAction * expectedActions;
		// Time for target skill level, 99 mastery, and 100% pool
		if (!current.maxSkillReached && initial.maxXp <= current.skillXp) {
			current.maxSkillTime = current.sumTotalTime;
			current.maxSkillReached = true;
			current.maxSkillResources = initial.recordCraft - current.resources;
		}
		if (!current.maxMasteryReached && initial.maxMasteryXp <= current.masteryXp) {
			current.maxMasteryTime = current.sumTotalTime;
			current.maxMasteryReached = true;
			current.maxMasteryResources = initial.recordCraft - current.resources;
		}
		if (initial.secondary !== undefined) {
			if (!current.secondary.maxMasteryReached && initial.maxMasteryXp <= current.secondary.masteryXp) {
				current.secondary.maxMasteryTime = current.secondary.sumTotalTime;
				current.secondary.maxMasteryReached = true;
				current.secondary.maxMasteryResources = initial.recordCraft - current.secondary.resources;
			}
		}
		if (!current.maxPoolReached && initial.targetPoolXp <= current.poolXp) {
			current.maxPoolTime = current.sumTotalTime;
			current.maxPoolReached = true;
			current.maxPoolResources = initial.recordCraft - current.resources;
		}
		// Level up mastery if hitting Mastery limit
		if (expectedActions === masteryXpActions) {
			current.totalMasteryLevel++;
		}
		if (expectedActions === secondaryMasteryXpPrimaryActions) {
			current.totalMasteryLevel++;
		}
		// return updated values
		return current;
	}

	function currentRates(initial) {
		let rates = {};
		const initialInterval = intervalAdjustment(initial, initial.poolXp, initial.masteryXp);
		const initialAverageActionTime = intervalRespawnAdjustment(initial, initialInterval, initial.poolXp, initial.masteryXp);
		rates.xpH = skillXpAdjustment(initial, initial.poolXp, initial.masteryXp) / initialAverageActionTime * 1000 * 3600;
		// compute current mastery xp / h using the getMasteryXpToAdd from the game or the method from this script
		// const masteryXpPerAction = getMasteryXpToAdd(initial.skillID, initial.masteryID, initialInterval);
		const masteryXpPerAction = calcMasteryXpToAdd(initial, initial, initialInterval);
		rates.masteryXpH = masteryXpPerAction / initialAverageActionTime * 1000 * 3600;
		// pool percentage per hour
		rates.poolH = calcPoolXpToAdd(initial.skillXp, masteryXpPerAction) / initialAverageActionTime * 1000 * 3600 / initial.maxPoolXp;
		rates.tokensH = 3600 * 1000 / initialAverageActionTime / actionsPerToken(initial.skillID, initial.skillXp);
		return rates;
	}

	function rates(initial, current) {
		// compute exp rates, either current or average until resources run out
		let rates = {};
		if (ETASettings.CURRENT_RATES || initial.isGathering || initial.recordCraft === 0) {
			// compute current rates
			rates = currentRates(initial);
			if (initial.secondary !== undefined) {
				const secondaryRates = currentRates(initial.secondary);
				Object.getOwnPropertyNames(rates).forEach(x => {
					rates[x] += secondaryRates[x];
				});
			}
		} else {
			// compute average rates until resources run out
			rates.xpH = (current.skillXp - initial.skillXp) * 3600 * 1000 / current.sumTotalTime;
			rates.masteryXpH = (current.masteryXp - initial.masteryXp) * 3600 * 1000 / current.sumTotalTime;
			if (initial.secondary !== undefined) {
				rates.masteryXpH += (current.secondary.masteryXp - initial.secondary.masteryXp) * 3600 * 1000 / current.sumTotalTime;
			}
			// average pool percentage per hour
			rates.poolH = (current.poolXp - initial.poolXp) * 3600 * 1000 / current.sumTotalTime / initial.maxPoolXp;
			rates.tokensH = (current.tokens - initial.tokens) * 3600 * 1000 / current.sumTotalTime;
		}
		// each token contributes one thousandth of the pool and then convert to percentage
		rates.poolH = (rates.poolH + rates.tokensH / 1000) * 100;
		return rates;
	}

	// Calculates expected time, taking into account Mastery Level advancements during the craft
	function calcExpectedTime(initial) {
		// initialize the expected time variables
		let current = currentVariables(initial, initial.recordCraft);
		if (initial.secondary !== undefined) {
			current.secondary = currentVariables(initial.secondary, initial.secondary.recordCraft);
		}
		// Check for Crown of Rhaelyx
		if (equippedItems.includes(CONSTANTS.item.Crown_of_Rhaelyx) && !initial.isMagic) {
			for (let i = 0; i < initial.masteryLimLevel.length; i++) {
				initial.chanceToKeep[i] += 0.10; // Add base 10% chance
			}
			let rhaelyxCharge = getQtyOfItem(CONSTANTS.item.Charge_Stone_of_Rhaelyx);
			current.chargeUses = rhaelyxCharge * 1000; // average crafts per Rhaelyx Charge Stone
		}
		// loop until out of resources
		while (current.resources > 0) {
			current = actionsToBreakpoint(initial, current);
		}

		// method to convert final pool xp to percentage
		const poolCap = ETASettings.UNCAP_POOL ? Infinity : 100
		const poolXpToPercentage = poolXp => Math.min((poolXp / initial.maxPoolXp) * 100, poolCap).toFixed(2);
		// create result object
		let expectedTime = {
			"timeLeft": Math.round(current.sumTotalTime),
			"actions": current.actions,
			"finalSkillXp" : current.skillXp,
			"finalMasteryXp" : current.masteryXp,
			"finalPoolPercentage" : poolXpToPercentage(current.poolXp),
			"maxPoolTime" : current.maxPoolTime,
			"maxMasteryTime" : current.maxMasteryTime,
			"maxSkillTime" : current.maxSkillTime,
			"rates": rates(initial),
			"tokens": current.tokens,
		};
		// continue calculations until time to all targets is found
		while(!current.maxSkillReached || !current.maxMasteryReached || !current.maxPoolReached) {
			current = actionsToBreakpoint(initial, current, true);
		}
		// if it is a gathering skill, then set final values to the values when reaching the final target
		if (initial.isGathering) {
			expectedTime.finalSkillXp = current.skillXp;
			expectedTime.finalMasteryXp = current.masteryXp;
			expectedTime.finalPoolPercentage = poolXpToPercentage(current.poolXp);
			expectedTime.tokens = current.tokens;
		}
		// set time to targets
		expectedTime.maxSkillTime = current.maxSkillTime;
		expectedTime.maxMasteryTime = current.maxMasteryTime;
		expectedTime.maxPoolTime = current.maxPoolTime;
		// return the resulting data object
		expectedTime.current = current;
		return expectedTime;
	}

	function timeRemainingWrapper(skillID) {
		// populate the main `time remaining` variables
		let initial = initialVariables(skillID);
		if (initial.isGathering) {
			let data = [];
			switch (initial.skillID) {
				case CONSTANTS.skill.Mining:
					data = miningData;
					break;

				case CONSTANTS.skill.Thieving:
					data = thievingNPC;
					break;

				case CONSTANTS.skill.Woodcutting:
					data = trees;
					break;

				case CONSTANTS.skill.Fishing:
					data = fishingAreas;
					break;
			}
			data.forEach((_, i) => {
				if (initial.skillID === CONSTANTS.skill.Fishing) {
					initial.fishID = selectedFish[i];
					if (initial.fishID === null) {
						return;
					}
				}
				initial.currentAction = i;
				timeRemaining(initial)
			});
			if (skillID === CONSTANTS.skill.Woodcutting) {
				if (currentlyCutting === 2) {
					// init first tree
					initial = initialVariables(skillID);
					initial.currentAction = currentTrees[0];
					// configure secondary tree
					initial.secondary = initialVariables(skillID);
					initial.secondary.currentAction = currentTrees[1];
					initial.secondary = setupTimeRemaining(initial.secondary);
					// run time remaining
					timeRemaining(initial);
				} else {
					// wipe the display, there's no way of knowing which tree is being cut
					document.getElementById(`timeLeft${skillName[initial.skillID]}-Secondary`).textContent = '';
				}
			}
		} else {
			timeRemaining(initial);
		}
	}

	function setupTimeRemaining(initial) {
		// Set current skill and pull matching variables from game with script
		switch (initial.skillID) {
			case CONSTANTS.skill.Smithing:
				initial = configureSmithing(initial);
				break;
			case CONSTANTS.skill.Fletching:
				initial = configureFletching(initial);
				break;
			case CONSTANTS.skill.Runecrafting:
				initial = configureRunecrafting(initial);
				break;
			case CONSTANTS.skill.Crafting:
				initial = configureCrafting(initial);
				break;
			case CONSTANTS.skill.Herblore:
				initial = configureHerblore(initial);
				break;
			case CONSTANTS.skill.Cooking:
				initial = configureCooking(initial);
				break;
			case CONSTANTS.skill.Firemaking:
				initial = configureFiremaking(initial);
				break;
			case CONSTANTS.skill.Magic:
				initial = configureMagic(initial);
				break;
			case CONSTANTS.skill.Mining:
				initial = configureMining(initial);
				break;
			case CONSTANTS.skill.Thieving:
				initial = configureThieving(initial);
				break;
			case CONSTANTS.skill.Woodcutting:
				initial = configureWoodcutting(initial);
				break;
			case CONSTANTS.skill.Fishing:
				initial = configureFishing(initial);
				break;
		}
		// Configure initial mastery values for all skills with masteries
		if (!initial.isMagic) {
			initial.poolXp = MASTERY[initial.skillID].pool;
			initial.maxPoolXp = getMasteryPoolTotalXP(initial.skillID);
			initial.targetPoolXp = initial.maxPoolXp;
			if (ETASettings.getTargetPool(initial.skillID) !== 100) {
				initial.targetPoolXp = initial.maxPoolXp / 100 * ETASettings.getTargetPool(initial.skillID);
			}
			initial.totalMasteryLevel = getCurrentTotalMasteryLevelForSkill(initial.skillID);
			if (!initial.isGathering) {
				initial.masteryID = items[initial.item].masteryID[1];
			}
			initial.masteryXp = MASTERY[initial.skillID].xp[initial.masteryID];
			initial.tokens = getQtyOfItem(CONSTANTS.item["Mastery_Token_" + skillName[initial.skillID]])
		}

		// Apply itemXp Bonuses from gear and pets
		initial.itemXp = addXPBonuses(initial.skillID, initial.itemXp);

		// Populate masteryLim from masteryLimLevel
		for (let i = 0; i < initial.masteryLimLevel.length; i++) {
			initial.masteryLim[i] = convertLvlToXp(initial.masteryLimLevel[i]);
		}
		// Populate skillLim from skillLimLevel
		for (let i = 0; i < initial.skillLimLevel.length; i++) {
			initial.skillLim[i] = convertLvlToXp(initial.skillLimLevel[i]);
		}
		// Populate poolLim from masteryCheckpoints
		for (let i = 0; i < initial.poolLimCheckpoints.length; i++) {
			initial.poolLim[i] = initial.maxPoolXp * initial.poolLimCheckpoints[i] / 100;
		}

		// Get Item Requirements and Current Requirements
		for (let i = 0; i < initial.skillReq.length; i++) {
			let itemReq = initial.skillReq[i].qty;
			//Check how many of required resource in Bank
			let itemQty = getQtyOfItem(initial.skillReq[i].id);
			// Calculate max items you can craft for each itemReq
			let itemCraft = Math.floor(itemQty / itemReq);
			// Calculate limiting factor and set new record
			if (itemCraft < initial.recordCraft) {
				initial.recordCraft = itemCraft;
			}
		}
		return initial;
	}
	// Main function
	function timeRemaining(initial) {
		initial = setupTimeRemaining(initial);
		//Time left
		let results = 0;
		let rates = {};
		let timeLeft = 0;
		let timeLeftPool = 0;
		let timeLeftMastery = 0;
		let timeLeftSkill = 0;
		let tokens = 0;
		let current = {};
		if (initial.isMagic) {
			timeLeft = Math.round(initial.recordCraft * initial.skillInterval / 1000);
		} else {
			results = calcExpectedTime(initial);
			rates = results.rates;
			timeLeft = Math.round(results.timeLeft / 1000);
			timeLeftPool = Math.round(results.maxPoolTime / 1000);
			timeLeftMastery = Math.round(results.maxMasteryTime / 1000);
			timeLeftSkill = Math.round(results.maxSkillTime / 1000);
			tokens = Math.round(results.tokens);
			current = results.current;
		}

		//Global variables to keep track of when a craft is complete
		window.timeLeftLast = window.timeLeftCurrent;
		window.timeLeftCurrent = timeLeft;

		//Inject timeLeft HTML
		let now = new Date();
		let timeLeftElementId = `timeLeft${skillName[initial.skillID]}`;
		if (initial.secondary !== undefined) {
			timeLeftElementId += "-Secondary";
		} else if (initial.isGathering) {
			timeLeftElementId += "-" + initial.currentAction;
		}
		if (initial.skillID === CONSTANTS.skill.Thieving && document.getElementById(timeLeftElementId) === null) {
			makeThievingDisplay();
		}
		let timeLeftElement = document.getElementById(timeLeftElementId);
		if (timeLeftElement !== null) {
			let finishedTime = AddSecondsToDate(now, timeLeft);
			timeLeftElement.textContent = "";
			if (ETASettings.SHOW_XP_RATE && !initial.isMagic) {
				timeLeftElement.textContent = "Xp/h: " + formatNumber(Math.floor(rates.xpH))
					+ "\r\nMXp/h: " + formatNumber(Math.floor(rates.masteryXpH))
					+ `\r\nPool/h: ${rates.poolH.toFixed(2)}%`
			}
			if (!initial.isGathering) {
				if (timeLeft === 0) {
					timeLeftElement.textContent += "\r\nNo resources!";
				} else {
					timeLeftElement.textContent += "\r\nActions: " + formatNumber(results.actions)
						+ "\r\nTime: " + secondsToHms(timeLeft)
						+ "\r\nETA: " + DateFormat(now, finishedTime);
				}
			}
			timeLeftElement.style.display = "block";
		}
		if (!initial.isMagic) {
			// Generate progression Tooltips
			if (!timeLeftElement._tippy) {
				tippy(timeLeftElement, {
					allowHTML: true,
					interactive: false,
					animation: false,
				});
			}
			const wrapOpen = '<div class="row no-gutters">';
			const wrapFirst = s => {
				return ''
					+ '<div class="col-6" style="white-space: nowrap;">'
					+ '    <h3 class="font-size-base m-1" style="color:white;" >'
					+ `        <span class="p-1" style="text-align:center; display: inline-block;line-height: normal;color:white;">`
					+ s
					+ '        </span>'
					//+ '    </h3>'
					+ '</div>';
			}
			const wrapSecond = (tag, s) => {
				return ''
					+ '<div class="col-6" style="white-space: nowrap;">'
					+ '    <h3 class="font-size-base m-1" style="color:white;" >'
					+ `        <span class="p-1 bg-${tag} rounded" style="text-align:center; display: inline-block;line-height: normal;width: 100px;color:white;">`
					+ s
					+ '        </span>'
					+ '    </h3>'
					+ '</div>';
			}
			const timeLeftToHTML = (target, time, finish, resources) => {
				return ''
					+ `Time to ${target}: ${time}`
					+ '<br>'
					+ `ETA: ${finish}`
					+ resourcesLeftToHTML(resources);
			}
			const resourcesLeftToHTML = (resources) => {
				if (ETASettings.HIDE_REQUIRED || initial.isGathering || resources === 0) {
					return '';
				}
				let req = initial.skillReq.map(x =>
					`<span>${formatNumber(x.qty * resources)}</span><img class="skill-icon-xs mr-2" src="${items[x.id].media}">`
				).join('');
				return `<br/>Requires: ${req}`;
			}
			const wrapTimeLeft = (s) => {
				return ''
					+ '<div class="row no-gutters">'
					+ '    <span class="col-12 m-1" style="padding:0.5rem 1.25rem;min-height:2.5rem;font-size:0.875rem;line-height:1.25rem;text-align:center">'
					+ s
					+ '    </span>'
					+ '</div>';
			}
			const wrapClose = '</div>';
			const formatLevel = (level, progress) => {
				if (!ETASettings.SHOW_PARTIAL_LEVELS) {
					return level;
				}
				progress = Math.floor(progress);
				if (progress !== 0) {
					level = (level + progress / 100).toFixed(2);
				}
				return level;
			}
			// final level and time to target level
			let finalLevel = convertXpToLvl(results.finalSkillXp, true)
			let levelProgress = getPercentageInLevel(results.finalSkillXp, results.finalSkillXp, "skill");
			finalLevel = formatLevel(finalLevel, levelProgress);
			let finalSkillLevelElement = wrapOpen + wrapFirst('Final Level') + wrapSecond('success', finalLevel + ' / 99') + wrapClose;
			let timeLeftSkillElement = '';
			if (timeLeftSkill > 0) {
				let finishedTimeSkill = AddSecondsToDate(now, timeLeftSkill);
				timeLeftSkillElement = wrapTimeLeft(
					timeLeftToHTML(
						ETASettings.getTargetLevel(initial.skillID),
						secondsToHms(timeLeftSkill),
						DateFormat(now, finishedTimeSkill),
						current.maxSkillResources,
					),
				);
			}
			// final mastery and time to target mastery
			let finalMastery = convertXpToLvl(results.finalMasteryXp);
			let masteryProgress = getPercentageInLevel(results.finalMasteryXp, results.finalMasteryXp, "mastery");
			finalMastery = formatLevel(finalMastery, masteryProgress);
			let finalMasteryLevelElement = wrapOpen + wrapFirst('Final Mastery') + wrapSecond('info', finalMastery + ' / 99') + wrapClose;
			let timeLeftMasteryElement = '';
			if (timeLeftMastery > 0) {
				let finishedTimeMastery = AddSecondsToDate(now, timeLeftMastery);
				timeLeftMasteryElement = wrapTimeLeft(
					timeLeftToHTML(
						ETASettings.getTargetMastery(initial.skillID),
						secondsToHms(timeLeftMastery),
						DateFormat(now, finishedTimeMastery),
						current.maxMasteryResources,
					),
				);
			}
			// final pool and time to target pool
			const finalPoolPercentageElement = wrapOpen + wrapFirst('Final Pool XP') + wrapSecond('warning', results.finalPoolPercentage + '%') + wrapClose;
			let timeLeftPoolElement = '';
			if (tokens > 0 || timeLeftPool > 0) {
				let finishedTimePool = AddSecondsToDate(now, timeLeftPool);
				timeLeftPoolElement = wrapTimeLeft(
					(tokens === 0
							? ''
							: `Final token count: ${tokens}`
					)
					+ (tokens === 0 || timeLeftPool === 0 ? '' : '<br>')
					+ (timeLeftPool === 0
						? ''
						: timeLeftToHTML(
							`${ETASettings.getTargetPool(initial.skillID)}%`,
							secondsToHms(timeLeftPool),
							DateFormat(now, finishedTimePool),
							current.maxPoolResources,
						)
					),
				);
			}
			let tooltip = ''
				+ '<div>'
				+ finalSkillLevelElement + timeLeftSkillElement
				+ (initial.secondary === undefined
					? (finalMasteryLevelElement + timeLeftMasteryElement)
					: '') // don't show mastery target when combining multiple actions
				+ finalPoolPercentageElement + timeLeftPoolElement
				+ '</div>';
			timeLeftElement._tippy.setContent(tooltip);

			{
				let poolProgress = (results.finalPoolPercentage > 100) ?
					100 - ((initial.poolXp / initial.maxPoolXp) * 100) :
					(results.finalPoolPercentage - ((initial.poolXp / initial.maxPoolXp) * 100)).toFixed(4);
				$(`#mastery-pool-progress-end-${initial.skillID}`).css("width", poolProgress + "%");
				let masteryProgress = getPercentageInLevel(initial.masteryXp, results.finalMasteryXp, "mastery", true);
				$(`#${initial.skillID}-mastery-pool-progress-end`).css("width", masteryProgress + "%");
				let skillProgress = getPercentageInLevel(initial.skillXp, results.finalSkillXp, "skill", true);
				$(`#skill-progress-bar-end-${initial.skillID}`).css("width", skillProgress + "%");
			}
		}
	}

	// select and start craft overrides
	const selectRef = {};
	const startRef = {};
	[	// skill name, select names, < start name >
		// start name is only required if the start method is not of the form `start${skill name}`
		// production skills
		["Smithing", ["Smith"]],
		["Fletching", ["Fletch"]],
		["Runecrafting", ["Runecraft"]],
		["Crafting", ["Craft"]],
		["Herblore", ["Herblore"]],
		["Cooking", ["Food"]],
		["Firemaking", ["Log"], "burnLog"],
		// alt magic
		["Magic", ["Magic", "ItemForMagic"], "castMagic"],
		// gathering skills go in a the next loop
	].forEach(skill => {
		let skillName = skill[0];
		// wrap the select methods
		let selectNames = skill[1];
		selectNames.forEach(entry => {
			let selectName = "select" + entry;
			// original methods are kept in the selectRef object
			selectRef[selectName] = window[selectName];
			window[selectName] = function(...args) {
				selectRef[selectName](...args);
				try {
					timeRemainingWrapper(CONSTANTS.skill[skillName]);
				} catch (e) {
					console.error(e);
				}
			};
		});
		// wrap the start methods
		let startName = "start" + skillName;
		if (skill.length > 2) {
			// override default start name if required
			startName = skill[2];
		}
		// original methods are kept in the startRef object
		startRef[skillName] = window[startName];
		window[startName] = function(...args) {
			startRef[skillName](...args);
			try {
				timeRemainingWrapper(CONSTANTS.skill[skillName]);
				taskComplete(CONSTANTS.skill[skillName]);
			} catch (e) {
				console.error(e);
			}
		};
	});
	[	// skill name, start name
		// gathering skills
		["Mining", "mineRock"],
		["Thieving", "pickpocket"],
		["Woodcutting", "cutTree"],
		["Fishing", "startFishing"],
		["Fishing", "selectFish"],
	].forEach(skill => {
		let skillName = skill[0];
		// wrap the start method
		let startName = skill[1];
		// original methods are kept in the startRef object
		startRef[startName] = window[startName];
		window[startName] = function(...args) {
			startRef[startName](...args);
			try {
				timeRemainingWrapper(CONSTANTS.skill[skillName]);
			} catch (e) {
				console.error(e);
			}
		};
	});

	const changePageRef = changePage;
	changePage = function(...args) {
		let skillName = undefined;
		switch (args[0]) {
			case 0:
				skillName = "Woodcutting";
				break;
			case 7:
				skillName = "Fishing";
				break;
			case 10:
				skillName = "Mining";
				break;
			case 14:
				skillName = "Thieving";
				break;
		}
		if (skillName !== undefined) {
			try {
				timeRemainingWrapper(CONSTANTS.skill[skillName]);
			} catch (e) {
				console.error(e);
			}
		}
		changePageRef(...args);
	};

	// Create timeLeft containers
	const tempContainer = (id) => {
		return ''
			+ '<div class="font-size-base font-w600 text-center text-muted">'
			+ `    <small id ="${id}" class="mb-2" style="display:block;clear:both;white-space:pre-line" data-toggle="tooltip" data-placement="top" data-html="true" title="" data-original-title="">`
			+ '    </small>'
			+ '</div>';
	}

	$("#smith-item-have").after(tempContainer("timeLeftSmithing"));
	$("#fletch-item-have").after(tempContainer("timeLeftFletching"));
	$("#runecraft-item-have").after(tempContainer("timeLeftRunecrafting"));
	$("#craft-item-have").after(tempContainer("timeLeftCrafting"));
	$("#herblore-item-have").after(tempContainer("timeLeftHerblore"));
	$("#skill-cooking-food-selected-qty").parent().parent().parent().after(tempContainer("timeLeftCooking"));
	$("#skill-fm-logs-selected-qty").parent().parent().parent().after(tempContainer("timeLeftFiremaking"));
	$("#magic-item-have-and-div").after(tempContainer("timeLeftMagic"));
	function makeMiningDisplay() {
		miningData.forEach((_, i) => {
			$(`#mining-ore-img-${i}`).before(tempContainer(`timeLeftMining-${i}`))
		});
	}
	makeMiningDisplay();
	function makeThievingDisplay() {
		thievingNPC.forEach((_, i) => {
			$(`#success-rate-${i}`).parent().after(tempContainer(`timeLeftThieving-${i}`))
		});
	}
	makeThievingDisplay(); // this has to be a function because in some scenarios the thieving display disappears, so we need to remake it
	function makeWoodcuttingDisplay() {
		trees.forEach((_, i) => {
			$(`#tree-rates-${i}`).after(tempContainer(`timeLeftWoodcutting-${i}`))
		});
		$('#skill-progress-current-axe').parent().before(tempContainer('timeLeftWoodcutting-Secondary'))
	}
	makeWoodcuttingDisplay();
	function makeFishingDisplay() {
		fishingAreas.forEach((_, i) => {
			$(`#fishing-area-${i}-selected-fish-xp`).after(tempContainer(`timeLeftFishing-${i}`))
		});
	}
	makeFishingDisplay();

	// Mastery Pool progress
	for(let id in SKILLS) {
		if(SKILLS[id].hasMastery) {
			let bar = $(`#mastery-pool-progress-${id}`)[0];
			$(bar).after(`<div id="mastery-pool-progress-end-${id}" class="progress-bar bg-warning" role="progressbar" style="width: 0%; background-color: #e5ae679c !important;"></div>`);
		}
	}

	// Mastery Progress bars
	for(let id in SKILLS) {
		if(SKILLS[id].hasMastery) {
			let name = skillName[id].toLowerCase();
			let bar = $(`#${name}-mastery-progress`)[0];
			$(bar).after(`<div id="${id}-mastery-pool-progress-end" class="progress-bar bg-info" role="progressbar" style="width: 0%; background-color: #5cace59c !important;"></div>`);
		}
	}

	// Mastery Skill progress
	for(let id in SKILLS) {
		if(SKILLS[id].hasMastery) {
			let bar = $(`#skill-progress-bar-${id}`)[0];
			$(bar).after(`<div id="skill-progress-bar-end-${id}" class="progress-bar bg-info" role="progressbar" style="width: 0%; background-color: #5cace59c !important;"></div>`);
		}
	}
}

// inject the script
(function () {
	function injectScript(main) {
		const scriptElement = document.createElement('script');
		scriptElement.textContent = `try {(${main})();} catch (e) {console.log(e);}`;
		document.body.appendChild(scriptElement).parentNode.removeChild(scriptElement);
	}

	function loadScript() {
		if ((window.isLoaded && !window.currentlyCatchingUp)
			|| (typeof unsafeWindow !== 'undefined' && unsafeWindow.isLoaded && !unsafeWindow.currentlyCatchingUp)) {
			// Only load script after game has opened
			clearInterval(scriptLoader);
			injectScript(script);
			// load settings from local storage
			if (localStorage['ETASettings'] !== undefined) {
				const stored = window.JSON.parse(localStorage['ETASettings']);
				Object.getOwnPropertyNames(stored).forEach(x => {
					ETASettings[x] = stored[x];
				});
				ETASettings.save();
			}
			// regularly save settings to local storage
			setInterval(ETASettings.save, 1000)
		}
	}

	const scriptLoader = setInterval(loadScript, 1000);
})();