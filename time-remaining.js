// ==UserScript==
// @name		Melvor ETA
// @namespace	http://tampermonkey.net/
// @version		0.0.3-0.17
// @description Shows xp/h and mastery xp/h, and the time remaining until certain targets are reached. Takes into account Mastery Levels and other bonuses.
// @description Please report issues on https://github.com/gmiclotte/Melvor-Time-Remaining/issues or message TinyCoyote#1769 on Discord
// @description The last part of the version number is the most recent version of Melvor that was tested with this script. More recent versions might break the script.
// @description	Forked from Breindahl#2660's Melvor TimeRemaining script v0.6.2.2.
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
	console.log('Melvor TimeRemaining Loaded');

	// settings can be toggled from the console, or edited here
	window.timeRemainingSettings = {
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
		// Default target level is 99, this can be changed
		GLOBAL_TARGET_LEVEL: 99,
		// skill specific target levels can be defined here, these can override the global target level
		TARGET_LEVEL: {
			// [CONSTANTS.skill.Firemaking]: undefined,
		},
		// returns the appropriate target level
		getTargetLevel: (skillID) => {
			if (timeRemainingSettings.TARGET_LEVEL[skillID] === undefined) {
				return timeRemainingSettings.GLOBAL_TARGET_LEVEL;
			}
			return timeRemainingSettings.TARGET_LEVEL[skillID];
		}
	};

	// Function to check if task is complete
	function taskComplete(skillID) {
		if (window.timeLeftLast > 1 && window.timeLeftCurrent === 0) {
			notifyPlayer(skillID, "Task Done", "danger");
			console.log('Melvor TimeRemaining: task done');
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
	function secondsToHms(d, isShortClock = timeRemainingSettings.IS_SHORT_CLOCK) {
		d = Number(d);
		// split seconds in hours, minutes and seconds
		let h = Math.floor(d / 3600);
		let m = Math.floor(d % 3600 / 60);
		let s = Math.floor(d % 3600 % 60);
		// no comma in short form
		// ` and ` if hours and minutes or hours and seconds
		// `, ` if hours and minutes and seconds
		let hDisplayComma = " ";
		if (!isShortClock && h > 0) {
			if ((m === 0 && s > 0) || (s === 0 && m > 0)) {
				hDisplayComma = " and ";
			} else if (s > 0 && m > 0) {
				hDisplayComma = ", ";
			}
		}
		// no comma in short form
		// ` and ` if minutes and seconds
		let mDisplayComma = " ";
		if (!isShortClock && m > 0 && s > 0) {
			mDisplayComma = " and ";
		}
		// append h/hour/hours etc depending on isShortClock, then concat and return
		return appendName(h, "hour", isShortClock) + hDisplayComma
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
	function DateFormat(now, then, is12h = timeRemainingSettings.IS_12H_CLOCK, isShortClock = timeRemainingSettings.IS_SHORT_CLOCK){
		let days = daysBetween(now, then);
		if (isShortClock) {
			days = (days === 0) ? "" : ` + ${days}d`;
		} else {
			days = (days === 0) ? "" : (days === 1) ? " tomorrow" : ` + ${days} days`;
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
		return hours + ':' + minutes + amOrPm + days;
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
			case CONSTANTS.skill.Fletching:
				if (poolXp >= initial.poolLim[3]) adjustedInterval -= 200;
				break;

			case CONSTANTS.skill.Firemaking:
				if (poolXp >= initial.poolLim[1]) adjustedInterval *= 0.9;
				let decreasedBurnInterval = 1 - convertXpToLvl(masteryXp) * 0.001;
				adjustedInterval *= decreasedBurnInterval;
				break;

			case CONSTANTS.skill.Mining:
				// pool bonus speed
				if (poolXp >= initial.poolLim[2]) {
					adjustedInterval -= 200;
				}
				break;
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
				successRate = Math.max(100, successRate) / 100;
				// compute average time per action
				let stunTime = 3000;
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
				if (poolXp >= initial.poolLim[1] && items[initial.item].type === "Rune") xpMultiplier += 1.5;
				break;

			case CONSTANTS.skill.Cooking: {
				let burnChance = calcBurnChance(masteryXp);
				let cookXp = initial.itemXp * (1 - burnChance);
				let burnXp = 1 * burnChance;
				return cookXp + burnXp;
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
			maxXp: convertLvlToXp(timeRemainingSettings.getTargetLevel(skillID)),
			maxMasteryXp: convertLvlToXp(99),
		}
		//Breakpoints for mastery bonuses - default all levels starting at 2 to 99, followed by Infinity
		initial.masteryLimLevel = Array.from({ length: 98 }, (_, i) => i + 2);
		initial.masteryLimLevel.push(Infinity);
		//Breakpoints for mastery bonuses - default all levels starting at 2 to 199, followed by Infinity
		initial.skillLimLevel = Array.from({ length: 198 }, (_, i) => i + 2);
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
			if (window.selectedFletchLog === undefined) {
				window.selectedFletchLog = 0;
			}
			initial.skillReq = [initial.skillReq[window.selectedFletchLog]];
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

	// Calculate mastery xp based on unlocked bonuses
	function calcMasteryXpToAdd(initial, timePerAction, skillXp, masteryXp, poolXp, totalMasteryLevel) {
		let xpModifier = 1;
		// General Mastery Xp formula
		let xpToAdd = (((calcTotalUnlockedItems(initial.skillID, skillXp) * totalMasteryLevel) / getTotalMasteryLevelForSkill(initial.skillID) + convertXpToLvl(masteryXp) * (getTotalItemsInSkill(initial.skillID) / 10)) * (timePerAction / 1000)) / 2;
		// Skill specific mastery pool modifier
		if (poolXp >= initial.poolLim[0]) {
			xpModifier += 0.05;
		}
		// Firemaking pool and log modifiers
		if (initial.skillID === CONSTANTS.skill.Firemaking) {
			// If current skill is Firemaking, we need to apply mastery progression from actions and use updated poolXp values
			if (poolXp >= initial.poolLim[3]) {
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
			if (convertXpToLvl(masteryXp) >= 99) {
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
		if (xpToAdd < 1) {
			xpToAdd = 1;
		}
		// BurnChance affects average mastery Xp
		if (initial.skillID === CONSTANTS.skill.Cooking) {
			let burnChance = calcBurnChance(masteryXp);
			xpToAdd *= (1 - burnChance);
		}
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

	function currentVariables(initial, resources) {
		let current = {
			resources: resources,
			sumTotalTime: 0,
			maxPoolTime: 0,
			maxMasteryTime: 0,
			maxSkillTime: 0,
			maxPoolReached: initial.poolXp >= initial.maxPoolXp,
			masteryXp: initial.masteryXp,
			skillXp: initial.skillXp,
			poolXp: initial.poolXp,
			maxMasteryReached: initial.masteryXp >= initial.maxMasteryXp,
			maxSkillReached: initial.skillXp >= initial.maxXp,
			totalMasteryLevel: initial.totalMasteryLevel,
			chargeUses: 0, // estimated remaining charge uses
			actions: 0, // estimated number of actions taken so far
		};
		return current;
	}

	function calcTimeToBreakpoint(initial, current, noResources = false) {
		const rhaelyxChargePreservation = 0.15;

		// Adjustments
		let totalChanceToUse = 1 - masteryPreservation(initial, current.masteryXp, initial.chanceToKeep) - poolPreservation(initial, current.poolXp);
		let currentInterval = intervalAdjustment(initial, current.poolXp, current.masteryXp);
		let averageActionTime = intervalRespawnAdjustment(initial, currentInterval, current.poolXp, current.masteryXp);

		// Current Xp
		let xpPerAction = skillXpAdjustment(initial, current.poolXp, current.masteryXp);
		let masteryXpPerAction = calcMasteryXpToAdd(initial, currentInterval, current.skillXp, current.masteryXp, current.poolXp, current.totalMasteryLevel);
		let poolXpPerAction = calcPoolXpToAdd(current.skillXp, masteryXpPerAction);

		// Distance to Limits
		let skillXpToLimit = initial.skillLim.find(element => element > current.skillXp) - current.skillXp;
		let masteryXpToLimit = initial.masteryLim.find(element => element > current.masteryXp) - current.masteryXp;
		let poolXpToLimit = initial.poolLim.find(element => element > current.poolXp) - current.poolXp;

		// Actions to limits
		let skillXpActions = skillXpToLimit / xpPerAction;
		let masteryXpActions = masteryXpToLimit / masteryXpPerAction;
		let poolXpActions = poolXpToLimit / poolXpPerAction;

		// Minimum actions based on limits
		let expectedActions = Math.ceil(Math.min(masteryXpActions, skillXpActions, poolXpActions));

		// Take away resources based on expectedActions
		if (!noResources) {
			// estimate amount of actions possible with remaining resources
			// number of actions with rhaelyx charges
			let resourceActions = Math.min(current.chargeUses, current.resources / (totalChanceToUse - rhaelyxChargePreservation));
			// remaining resources
			let resWithoutCharge = Math.max(0, current.resources - current.chargeUses * (totalChanceToUse - rhaelyxChargePreservation));
			// add number of actions without rhaelyx charges
			resourceActions = Math.ceil(resourceActions + resWithoutCharge / totalChanceToUse);
			expectedActions = Math.min(expectedActions, resourceActions);
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
			// estimate total remaining actions
			current.actions += expectedActions;
		}

		// time for current loop
		let timeToAdd = expectedActions * averageActionTime;
		// Update time and Xp
		current.sumTotalTime += timeToAdd;
		current.skillXp += xpPerAction * expectedActions;
		current.masteryXp += masteryXpPerAction * expectedActions;
		current.poolXp += poolXpPerAction * expectedActions;
		// Time for target skill level, 99 mastery, and 100% pool
		if (!current.maxSkillReached && initial.maxXp <= current.skillXp) {
			current.maxSkillTime = current.sumTotalTime;
			current.maxSkillReached = true;
		}
		if (!current.maxMasteryReached && initial.maxMasteryXp <= current.masteryXp) {
			current.maxMasteryTime = current.sumTotalTime;
			current.maxMasteryReached = true;
		}
		if (!current.maxPoolReached && initial.maxPoolXp <= current.poolXp) {
			current.maxPoolTime = current.sumTotalTime;
			current.maxPoolReached = true;
		}
		// Level up mastery if hitting Mastery limit
		if (expectedActions === masteryXpActions) {
			current.totalMasteryLevel++;
		}
		// return updated values
		return current;
	}

	// Calculates expected time, taking into account Mastery Level advancements during the craft
	function calcExpectedTime(initial, resources) {
		// initialize the expected time variables
		let current = currentVariables(initial, resources);
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
			current = calcTimeToBreakpoint(initial, current);
		}
		// compute current xp/h and mxp/h
		let initialInterval = intervalAdjustment(initial,  initial.poolXp, initial.masteryXp);
		let initialAverageActionTime = intervalRespawnAdjustment(initial, initialInterval, initial.poolXp, initial.masteryXp);
		let xph = skillXpAdjustment(initial,  initial.poolXp, initial.masteryXp) / initialAverageActionTime * 1000 * 3600;
		// compute current mastery xp / h using the getMasteryXpToAdd from the game
		let masteryXph = getMasteryXpToAdd(initial.skillID, initial.masteryID, initialInterval) / initialAverageActionTime * 1000 * 3600;
		// alternative: compute through the calcMasteryXpToAdd method from this script, they should be the same !
		// let masteryXph = calcMasteryXpToAdd(initialInterval, initial.skillXp, initial.masteryXp, initial.poolXp, initial.masteryLevel) / initialAverageActionTime * 1000 * 3600;
		// compute average (mastery) xp/h until resources run out
		let avgXph = (current.skillXp - initial.skillXp) * 3600 * 1000 / current.sumTotalTime;
		let avgMasteryXph = (current.masteryXp - initial.masteryXp) * 3600 * 1000 / current.sumTotalTime;
		const poolXpToPercentage = (poolXp, maxPoolXp) => Math.min((poolXp / maxPoolXp) * 100, timeRemainingSettings.UNCAP_POOL ? Infinity : 100).toFixed(2);
		let expectedTime = {
			"timeLeft" :  Math.round(current.sumTotalTime),
			"actions": current.actions,
			"finalSkillXp" : current.skillXp,
			"finalMasteryXp" : current.masteryXp,
			"finalPoolPercentage" : poolXpToPercentage(current.poolXp, initial.maxPoolXp),
			"maxPoolTime" : current.maxPoolTime,
			"maxMasteryTime" : current.maxMasteryTime,
			"maxSkillTime" : current.maxSkillTime,
			"masteryXph": timeRemainingSettings.CURRENT_RATES || initial.isGathering ? masteryXph : avgMasteryXph,
			"xph" : timeRemainingSettings.CURRENT_RATES || initial.isGathering ? xph : avgXph,
		};
		//
		while(!current.maxSkillReached || !current.maxMasteryReached || !current.maxPoolReached) {
			current = calcTimeToBreakpoint(initial, current, true);
		}
		if (initial.isGathering) {
			expectedTime.finalSkillXp = current.skillXp;
			expectedTime.finalMasteryXp = current.masteryXp;
			expectedTime.finalPoolPercentage = poolXpToPercentage(current.poolXp, initial.maxPoolXp);
		}
		expectedTime.maxSkillTime = current.maxSkillTime;
		expectedTime.maxMasteryTime = current.maxMasteryTime;
		expectedTime.maxPoolTime = current.maxPoolTime;
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

			}
			data.forEach((_, i) => {
				initial.currentAction = i;
				timeRemaining(initial)
			});
		} else {
			timeRemaining(initial);
		}
	}

	// Main function
	function timeRemaining(initial) {
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
		}
		// Configure initial mastery values for all skills with masteries
		if (!initial.isMagic) {
			initial.poolXp = MASTERY[initial.skillID].pool;
			initial.maxPoolXp = getMasteryPoolTotalXP(initial.skillID);
			initial.totalMasteryLevel = getTotalMasteryLevelForSkill(initial.skillID);
			if (initial.skillID === CONSTANTS.skill.Thieving) {
				initial.masteryID = initial.currentAction;
			} else {
				initial.masteryID = items[initial.item].masteryID[1];
			}
			initial.masteryXp = MASTERY[initial.skillID].xp[initial.masteryID];
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
			let	itemReq = initial.skillReq[i].qty;
			//Check how many of required resource in Bank
			let itemQty = getQtyOfItem(initial.skillReq[i].id);
			// Calculate max items you can craft for each itemReq
			let itemCraft = Math.floor(itemQty / itemReq);
			// Calculate limiting factor and set new record
			if(itemCraft < initial.recordCraft) {
				initial.recordCraft = itemCraft;
			}
		}

		//Time left
		let results = 0;
		let timeLeft = 0;
		let timeLeftPool = 0;
		let timeLeftMastery = 0;
		let timeLeftSkill = 0;
		if (initial.isMagic) {
			timeLeft = Math.round(initial.recordCraft * initial.skillInterval / 1000);
		} else {
			results = calcExpectedTime(initial, initial.recordCraft);
			timeLeft = Math.round(results.timeLeft / 1000);
			timeLeftPool = Math.round(results.maxPoolTime / 1000);
			timeLeftMastery = Math.round(results.maxMasteryTime / 1000);
			timeLeftSkill = Math.round(results.maxSkillTime / 1000);
		}

		//Global variables to keep track of when a craft is complete
		window.timeLeftLast = window.timeLeftCurrent;
		window.timeLeftCurrent = timeLeft;

		//Inject timeLeft HTML
		let now = new Date();
		let timeLeftElementId = "timeLeft".concat(skillName[initial.skillID]);
		if (initial.isGathering) {
			timeLeftElementId += "-" + initial.currentAction;
		}
		let timeLeftElement = document.getElementById(timeLeftElementId);
		if (timeLeftElement !== null) {
			let finishedTime = AddSecondsToDate(now, timeLeft);
			if (timeRemainingSettings.SHOW_XP_RATE && !initial.isMagic && !initial.isGathering) {
				timeLeftElement.textContent = "Xp/h: " + formatNumber(Math.floor(results.xph))
					+ "\r\nMXp/h: " + formatNumber(Math.floor(results.masteryXph))
					+ "\r\nActions: " + formatNumber(results.actions)
					+ "\r\nTime: " + secondsToHms(timeLeft)
					+ "\r\nFinish: " + DateFormat(now, finishedTime);
			} else if(initial.isGathering) {
				timeLeftElement.textContent = "Xp/h: " + formatNumber(Math.floor(results.xph))
					+ "\r\nMXp/h: " + formatNumber(Math.floor(results.masteryXph));
			} else {
				timeLeftElement.textContent = "Will take: " + secondsToHms(timeLeft) + "\r\n Expected finished: " + DateFormat(now, finishedTime);
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
			let wrapper = ['<div class="row"><div class="col-6" style="white-space: nowrap;"><h3 class="block-title m-1" style="color:white;" >','</h3></div><div class="col-6" style="white-space: nowrap;"><h3 class="block-title m-1 pl-1"><span class="p-1 bg-',' rounded" style="text-align:center; display: inline-block;line-height: normal;width: 70px;color:white;">','</span>','</h3></div></div>'];
			let percentageSkill = (getPercentageInLevel(results.finalSkillXp,results.finalSkillXp,"skill")).toFixed(1);
			let percentageSkillElement = (percentageSkill === 0) ? '' : ` +${percentageSkill}%`;
			let finalSkillLevelElement = wrapper[0] + 'Final Skill Level ' + wrapper[1] + 'success' + wrapper[2] + convertXpToLvl(results.finalSkillXp,true) + ' / 99' + wrapper[3] + percentageSkillElement + wrapper[4];
			let timeLeftSkillElement = '';
			if (timeLeftSkill > 0){
				let finishedTimeSkill = AddSecondsToDate(now,timeLeftSkill);
				timeLeftSkillElement = '<div class="row"><div class="col-12 font-size-sm text-uppercase text-muted mb-1" style="text-align:center"><small style="display:inline-block;clear:both;white-space:pre-line;color:white;">Time to ' + timeRemainingSettings.getTargetLevel(initial.skillID) + ': ' + secondsToHms(timeLeftSkill) + '<br> Expected finished: ' + DateFormat(now,finishedTimeSkill) + '</small></div></div>';
			}
			let percentageMastery = (getPercentageInLevel(results.finalMasteryXp,results.finalMasteryXp,"mastery")).toFixed(1);
			let percentageMasteryElement = (percentageMastery === 0) ? '' : ` +${percentageMastery}%`;
			let finalMasteryLevelElement = wrapper[0] + 'Final Mastery Level ' + wrapper[1] + 'info' + wrapper[2] + convertXpToLvl(results.finalMasteryXp) + ' / 99' + wrapper[3] + percentageMasteryElement + wrapper[4];
			let timeLeftMasteryElement = '';
			if (timeLeftMastery > 0){
				let finishedTimeMastery = AddSecondsToDate(now,timeLeftMastery);
				timeLeftMasteryElement = '<div class="row"><div class="col-12 font-size-sm text-uppercase text-muted mb-1" style="text-align:center"><small style="display:inline-block;clear:both;white-space:pre-line;color:white;">Time to 99: ' + secondsToHms(timeLeftMastery) + '<br> Expected finished: ' + DateFormat(now,finishedTimeMastery) + '</small></div></div>';
			}
			let finalPoolPercentageElement = wrapper[0] + 'Final Mastery Pool ' + wrapper[1] + 'warning' + wrapper[2] + results.finalPoolPercentage + '%' + wrapper[3] + wrapper[4];
			let timeLeftPoolElement = '';
			if (timeLeftPool > 0){
				let finishedTimePool = AddSecondsToDate(now,timeLeftPool);
				timeLeftPoolElement = '<div class="row"><div class="col-12 font-size-sm text-uppercase text-muted mb-1" style="text-align:center"><small class="" style="display:inline-block;clear:both;white-space:pre-line;color:white;">Time to 100%: ' + secondsToHms(timeLeftPool) + '<br> Expected finished: ' + DateFormat(now,finishedTimePool) + '</small></div></div>';
			}
			let tooltip = '<div class="col-12 mt-1">' + finalSkillLevelElement + timeLeftSkillElement + finalMasteryLevelElement + timeLeftMasteryElement + finalPoolPercentageElement + timeLeftPoolElement +'</div>';
			timeLeftElement._tippy.setContent(tooltip);

			let poolProgress = (results.finalPoolPercentage > 100) ?
				100 - ((initial.poolXp / initial.maxPoolXp) * 100) :
				(results.finalPoolPercentage - ((initial.poolXp / initial.maxPoolXp)*100)).toFixed(4);
			$(`#mastery-pool-progress-end-${initial.skillID}`).css("width", poolProgress + "%");
			let masteryProgress = getPercentageInLevel(initial.masteryXp,results.finalMasteryXp,"mastery",true);
			$(`#${initial.skillID}-mastery-pool-progress-end`).css("width", masteryProgress + "%");
			let skillProgress = getPercentageInLevel(initial.skillXp, results.finalSkillXp,"skill",true);
			$(`#skill-progress-bar-end-${initial.skillID}`).css("width", skillProgress + "%");
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
	].forEach(skill => {
		let skillName = skill[0];
		// wrap the start method
		let startName = skill[1];
		// original methods are kept in the startRef object
		startRef[skillName] = window[startName];
		window[startName] = function(...args) {
			startRef[skillName](...args);
			try {
				timeRemainingWrapper(CONSTANTS.skill[skillName]);
			} catch (e) {
				console.error(e);
			}
		};
	});

	// Create timeLeft containers
	let TempContainer = ['<div class="font-size-sm font-w600 text-uppercase text-center text-muted"><small id ="','" class="mb-2" style="display:block;clear:both;white-space: pre-line" data-toggle="tooltip" data-placement="top" data-html="true" title="" data-original-title=""></small></div>'];
	let TempContainerAlt = ['<div class="font-size-sm text-uppercase text-muted"><small id ="','" class="mt-2" style="display:block;clear:both;white-space: pre-line" data-toggle="tooltip" data-placement="top" data-html="true" title="" data-original-title=""></small></div>'];

	$("#smith-item-have").after(TempContainer[0] + "timeLeftSmithing" + TempContainer[1]);
	$("#fletch-item-have").after(TempContainer[0] + "timeLeftFletching" + TempContainer[1]);
	$("#runecraft-item-have").after(TempContainer[0] + "timeLeftRunecrafting" + TempContainer[1]);
	$("#craft-item-have").after(TempContainer[0] + "timeLeftCrafting" + TempContainer[1]);
	$("#herblore-item-have").after(TempContainer[0] + "timeLeftHerblore" + TempContainer[1]);
	$("#skill-cooking-food-selected-qty").after(TempContainerAlt[0] + "timeLeftCooking" + TempContainerAlt[1]);
	$("#skill-fm-logs-selected-qty").after(TempContainerAlt[0] + "timeLeftFiremaking" + TempContainerAlt[1]);
	$("#magic-item-have-and-div").after(TempContainer[0] + "timeLeftMagic" + TempContainer[1]);
	{
		miningData.forEach((_, i) => {
			$(`#mining-ore-img-${i}`).before(TempContainer[0] + `timeLeftMining-${i}` + TempContainer[1])
		});
	}
	{
		thievingNPC.forEach((_, i) => {
			$(`#success-rate-${i}`).parent().after(TempContainer[0] + `timeLeftThieving-${i}` + TempContainer[1])
		});
	}

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
		}
	}

	const scriptLoader = setInterval(loadScript, 1000);
})();