// ==UserScript==
// @name		Melvor ETA
// @namespace	http://tampermonkey.net/
// @version		0.1.35-0.18.2
// @description Shows xp/h and mastery xp/h, and the time remaining until certain targets are reached. Takes into account Mastery Levels and other bonuses.
// @description Please report issues on https://github.com/gmiclotte/Melvor-Time-Remaining/issues or message TinyCoyote#1769 on Discord
// @description The last part of the version number is the most recent version of Melvor that was tested with this script. More recent versions might break the script.
// @description	Forked from Breindahl#2660's Melvor TimeRemaining script v0.6.2.2., originally developed by Breindahl#2660, Xhaf#6478 and Visua#9999
// @author		GMiclotte
// @match        https://*.melvoridle.com/*
// @exclude      https://wiki.melvoridle.com*
// @noframes
// @grant		none
// ==/UserScript==

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
    // set to true to play a sound when we run out of resources or reach a target
    DING_RESOURCES: true,
    DING_LEVEL: true,
    DING_MASTERY: true,
    DING_POOL: true,
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
    getNext: (current, list) => {
        if (list === undefined) {
            return list
        }
        if (list.length !== undefined) {
            for (let i = 0; i < list.length; i++) {
                if (list[i] > current) {
                    return list[i];
                }
            }
            return Math.max(list);
        }
        return list;
    },
    getTarget: (current, global, specific, defaultTarget) => {
        if (current !== null) {
            global = ETASettings.getNext(current, global);
            specific = ETASettings.getNext(current, specific);
        }
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
    getTargetLevel: (skillID, currentLevel) => {
        return ETASettings.getTarget(currentLevel, ETASettings.GLOBAL_TARGET_LEVEL, ETASettings.TARGET_LEVEL[skillID], 99);
    },
    getTargetMastery: (skillID, currentMastery) => {
        return ETASettings.getTarget(currentMastery, ETASettings.GLOBAL_TARGET_MASTERY, ETASettings.TARGET_MASTERY[skillID], 99);
    },
    getTargetPool: (skillID, currentPool) => {
        return ETASettings.getTarget(currentPool, ETASettings.GLOBAL_TARGET_POOL, ETASettings.TARGET_POOL[skillID], 100);
    },

    /*
        methods
     */
    // save settings to local storage
    save: () => {
        window.localStorage['ETASettings'] = window.JSON.stringify(window.ETASettings);
    }
};

// global object
window.ETA = {};

ETA.log = function (...args) {
    console.log("Melvor ETA:", ...args)
}

ETA.createSettingsMenu = () => {
    // check if combat sim methods are available
    if (window.MICSR === undefined || MICSR.TabCard === undefined) {
        ETA.menuCreationAttempts = (ETA.menuCreationAttempts || 0) + 1;
        if (ETA.menuCreationAttempts > 10) {
            ETA.log('Failed to add settings menu!')
        } else {
            // try again in 50 ms
            setTimeout(ETA.createSettingsMenu, 50);
        }
        return;
    }

    // set names
    ETA.menuItemID = 'etaButton';
    ETA.modalID = 'etaModal';

    // clean up in case elements already exist
    MICSR.destroyMenu(ETA.menuItemID, ETA.modalID);

    // create wrappers and access point
    ETA.content = document.createElement('div');
    ETA.content.className = 'mcsTabContent';
    MICSR.addMenuItem('ETA Settings', 'assets/media/main/settings_header.svg', ETA.menuItemID, 'etaModal')
    MICSR.addModal('ETA Settings', ETA.modalID, [ETA.content])

    // add toggles card
    ETA.addToggles();

    // add global target card
    ETA.addGlobalTargetInputs();

    // add target card
    ETA.addTargetInputs();

    // log
    ETA.log('added settings menu!')
}

ETA.addToggles = () => {
    ETA.togglesCard = new MICSR.Card(ETA.content, '', '150px', true);
    const titles = {
        IS_12H_CLOCK: 'Use 12h clock',
        IS_SHORT_CLOCK: 'Use short time format',
        SHOW_XP_RATE: 'Show XP rates',
        UNCAP_POOL: 'Show pool past 100%',
        CURRENT_RATES: 'Show current rates',
        USE_TOKENS: '"Use" Mastery tokens',
        SHOW_PARTIAL_LEVELS: 'Show partial levels',
        HIDE_REQUIRED: 'Hide required resources',
        DING_RESOURCES: 'Ding when out of resources',
        DING_LEVEL: 'Ding on level target',
        DING_MASTERY: 'Ding on mastery target',
        DING_POOL: 'Ding on pool target',
    };
    Object.getOwnPropertyNames(titles).forEach(property => {
        const title = titles[property];
        ETA.togglesCard.addToggleRadio(
            title,
            property,
            ETASettings,
            property,
            ETASettings[property],
        );
    });
}

ETA.addGlobalTargetInputs = () => {
    ETA.globalTargetsCard = new MICSR.Card(ETA.content, '', '150px', true);
    [
        {id: 'LEVEL', label: 'Global level targets', defaultValue: [99]},
        {id: 'MASTERY', label: 'Global mastery targets', defaultValue: [99]},
        {id: 'POOL', label: 'Global pool targets (%)', defaultValue: [100]},
    ].forEach(target => {
        const globalKey = 'GLOBAL_TARGET_' + target.id;
        ETA.globalTargetsCard.addNumberArrayInput(
            target.label,
            ETASettings,
            globalKey,
            target.defaultValue
        );
    });

}

ETA.addTargetInputs = () => {
    ETA.skillTargetCard = new MICSR.TabCard('ETA-target', true, ETA.content, '', '150px', true);
    [
        CONSTANTS.skill.Woodcutting,
        CONSTANTS.skill.Fishing,
        CONSTANTS.skill.Firemaking,
        CONSTANTS.skill.Cooking,
        CONSTANTS.skill.Mining,
        CONSTANTS.skill.Smithing,
        CONSTANTS.skill.Thieving,
        CONSTANTS.skill.Fletching,
        CONSTANTS.skill.Crafting,
        CONSTANTS.skill.Runecrafting,
        CONSTANTS.skill.Herblore,
        CONSTANTS.skill.Magic,
    ].forEach(i => {
        const card = ETA.skillTargetCard.addTab(SKILLS[i].name, SKILLS[i].media, '', '150px');
        card.addSectionTitle(SKILLS[i].name + ' Targets');
        [
            {id: 'LEVEL', label: 'Level targets'},
            {id: 'MASTERY', label: 'Mastery targets'},
            {id: 'POOL', label: 'Pool targets (%)'},
        ].forEach(target => {
            const key = 'TARGET_' + target.id;
            card.addNumberArrayInput(
                target.label,
                ETASettings[key],
                i,
            );
        });
    });
}


////////
//ding//
////////
// Function to check if task is complete
ETA.taskComplete = function () {
    const last = ETA.timeLeftLast;
    const current = ETA.timeLeftCurrent;
    if (last === undefined) {
        return;
    }
    if (last.skillID !== current.skillID) {
        // started a different skill, don't ding
        return;
    }
    if (last.action !== current.action) {
        // started a different action, don't ding
        return;
    }
    if (last.times.length !== current.times.length) {
        // ding settings were changed, don't ding
        return;
    }
    // ding if any targets were reached
    for (let i = 0; i < last.times.length; i++) {
        const lastTime = last.times[i];
        const currentTime = current.times[i];
        if (lastTime.current >= lastTime.target) {
            // target already reached
            continue;
        }
        if (currentTime.current >= lastTime.target) { // current level is higher than previous target
            notifyPlayer(last.skillID, currentTime.msg, "danger");
            ETA.log(currentTime.msg);
            let ding = new Audio("https://www.myinstants.com/media/sounds/ding-sound-effect.mp3");
            ding.volume = 0.1;
            ding.play();
            return;
        }
    }
}

ETA.time = (ding, target, time, current, msg) => {
    return {ding: ding, target: target, current: current, msg: msg};
};

ETA.setTimeLeft = function (initial, times) {
    // save previous
    ETA.timeLeftLast = ETA.timeLeftCurrent;
    // set current
    ETA.timeLeftCurrent = {
        skillID: initial.skillID,
        action: initial.currentAction,
        times: times.filter(x => x.ding),
    }
}


//////////////
//containers//
//////////////

const tempContainer = (id) => {
    return ''
        + '<div class="font-size-base font-w600 text-center text-muted">'
        + `	<small id ="${id}" class="mb-2" style="display:block;clear:both;white-space:pre-line" data-toggle="tooltip" data-placement="top" data-html="true" title="" data-original-title="">`
        + '	</small>'
        + `	<small id ="${id}" class="mb-2" style="display:block;clear:both;white-space:pre-line">`
        + `<div id="${id + '-YouHave'}"/>`
        + '	</small>'
        + '</div>';
}

ETA.makeProcessingDisplays = function () {
    $("#smith-item-have").after(tempContainer("timeLeftSmithing"));
    $("#fletch-item-have").after(tempContainer("timeLeftFletching"));
    $("#runecraft-item-have").after(tempContainer("timeLeftRunecrafting"));
    $("#craft-item-have").after(tempContainer("timeLeftCrafting"));
    $("#herblore-item-have").after(tempContainer("timeLeftHerblore"));
    $("#skill-cooking-food-selected-qty").parent().parent().parent().after(tempContainer("timeLeftCooking"));
    $("#skill-fm-logs-selected-qty").parent().parent().parent().after(tempContainer("timeLeftFiremaking"));
    $("#magic-item-have-and-div").after(tempContainer("timeLeftMagic"));
}

ETA.makeMiningDisplay = function () {
    miningData.forEach((_, i) => {
        $(`#mining-ore-img-${i}`).before(tempContainer(`timeLeftMining-${i}`))
    });
}

ETA.makeThievingDisplay = function () {
    thievingNPC.forEach((_, i) => {
        $(`#success-rate-${i}`).parent().after(tempContainer(`timeLeftThieving-${i}`))
    });
}

ETA.makeWoodcuttingDisplay = function () {
    trees.forEach((_, i) => {
        $(`#tree-rates-${i}`).after(tempContainer(`timeLeftWoodcutting-${i}`))
    });
    $('#skill-woodcutting-multitree').parent().after(tempContainer('timeLeftWoodcutting-Secondary'))
}

ETA.makeFishingDisplay = function () {
    fishingAreas.forEach((_, i) => {
        $(`#fishing-area-${i}-selected-fish-xp`).after(tempContainer(`timeLeftFishing-${i}`))
    });
}


////////////////
//main wrapper//
////////////////

ETA.timeRemainingWrapper = function (skillID, checkTaskComplete) {
    // populate the main `time remaining` variables
    let data = [];
    let current;
    switch (skillID) {
        case CONSTANTS.skill.Mining:
            data = miningData;
            current = currentRock;
            break;

        case CONSTANTS.skill.Thieving:
            data = thievingNPC;
            current = npcID;
            break;

        case CONSTANTS.skill.Woodcutting:
            data = trees;
            current = -1; // never progress bar or ding for single tree
            break;

        case CONSTANTS.skill.Fishing:
            data = fishingAreas;
            current = currentFishingArea;
            break;
    }
    if (data.length > 0) {
        data.forEach((_, i) => {
            let initial = initialVariables(skillID, checkTaskComplete);
            if (initial.skillID === CONSTANTS.skill.Fishing) {
                initial.fishID = selectedFish[i];
                if (initial.fishID === null) {
                    return;
                }
            }
            initial.isMainAction = i === current;
            initial.currentAction = i;
            asyncTimeRemaining(initial);
        });
        if (skillID === CONSTANTS.skill.Woodcutting) {
            if (currentlyCutting === 2) {
                // init first tree
                let initial = initialVariables(skillID, checkTaskComplete);
                initial.currentAction = currentTrees[0];
                // configure secondary tree
                initial.secondary = initialVariables(skillID, checkTaskComplete);
                initial.secondary.currentAction = currentTrees[1];
                initial.secondary = setupTimeRemaining(initial.secondary);
                // run time remaining
                asyncTimeRemaining(initial);
            } else {
                // wipe the display, there's no way of knowing which tree is being cut
                document.getElementById(`timeLeft${skillName[skillID]}-Secondary`).textContent = '';
            }
        }
    } else {
        let initial = initialVariables(skillID, checkTaskComplete);
        switch (initial.skillID) {
            case CONSTANTS.skill.Smithing:
                initial.currentAction = selectedSmith;
                break;
            case CONSTANTS.skill.Fletching:
                initial.currentAction = selectedFletch;
                break;
            case CONSTANTS.skill.Runecrafting:
                initial.currentAction = selectedRunecraft;
                break;
            case CONSTANTS.skill.Crafting:
                initial.currentAction = selectedCraft;
                break;
            case CONSTANTS.skill.Herblore:
                initial.currentAction = selectedHerblore;
                break;
            case CONSTANTS.skill.Cooking:
                initial.currentAction = selectedFood;
                break;
            case CONSTANTS.skill.Firemaking:
                initial.currentAction = selectedLog;
                break;
            case CONSTANTS.skill.Magic:
                initial.currentAction = selectedAltMagic;
                break;
        }
        asyncTimeRemaining(initial);
    }
}

function asyncTimeRemaining(initial) {
    setTimeout(
        function () {
            timeRemaining(initial);
        },
        0,
    );
}

/////////////
//injection//
/////////////
function script() {
    // Loading script
    ETA.log('loading...');

    // lvlToXp cache
    ETA.lvlToXp = Array.from({length: 200}, (_, i) => exp.level_to_xp(i));

    // select and start craft overrides
    ETA.selectRef = {};
    ETA.startRef = {};
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
            ETA.selectRef[selectName] = window[selectName];
            window[selectName] = function (...args) {
                ETA.selectRef[selectName](...args);
                try {
                    ETA.timeRemainingWrapper(CONSTANTS.skill[skillName], false);
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
        ETA.startRef[skillName] = window[startName];
        window[startName] = function (...args) {
            ETA.startRef[skillName](...args);
            try {
                ETA.timeRemainingWrapper(CONSTANTS.skill[skillName], true);
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
        ETA.startRef[startName] = window[startName];
        window[startName] = function (...args) {
            ETA.startRef[startName](...args);
            try {
                ETA.timeRemainingWrapper(CONSTANTS.skill[skillName], true);
            } catch (e) {
                console.error(e);
            }
        };
    });

    ETA.changePageRef = changePage;
    changePage = function (...args) {
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
                ETA.timeRemainingWrapper(CONSTANTS.skill[skillName], false);
            } catch (e) {
                console.error(e);
            }
        }
        ETA.changePageRef(...args);
    };

    // Create timeLeft containers
    ETA.makeProcessingDisplays();
    ETA.makeMiningDisplay();
    ETA.makeThievingDisplay();
    ETA.makeWoodcuttingDisplay();
    ETA.makeFishingDisplay();

    // Mastery Pool progress
    for (let id in SKILLS) {
        if (SKILLS[id].hasMastery) {
            let bar = $(`#mastery-pool-progress-${id}`)[0];
            $(bar).after(`<div id="mastery-pool-progress-end-${id}" class="progress-bar bg-warning" role="progressbar" style="width: 0%; background-color: #e5ae679c !important;"></div>`);
        }
    }

    // Mastery Progress bars
    for (let id in SKILLS) {
        if (SKILLS[id].hasMastery) {
            let name = skillName[id].toLowerCase();
            let bar = $(`#${name}-mastery-progress`)[0];
            $(bar).after(`<div id="${id}-mastery-pool-progress-end" class="progress-bar bg-info" role="progressbar" style="width: 0%; background-color: #5cace59c !important;"></div>`);
        }
    }

    // Mastery Skill progress
    for (let id in SKILLS) {
        if (SKILLS[id].hasMastery) {
            let bar = $(`#skill-progress-bar-${id}`)[0];
            $(bar).after(`<div id="skill-progress-bar-end-${id}" class="progress-bar bg-info" role="progressbar" style="width: 0%; background-color: #5cace59c !important;"></div>`);
        }
    }
    //
    ETA.log('loaded!');
    setTimeout(ETA.createSettingsMenu, 50);
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
            if (window.localStorage['ETASettings'] !== undefined) {
                const stored = window.JSON.parse(window.localStorage['ETASettings']);
                Object.getOwnPropertyNames(stored).forEach(x => {
                    window.ETASettings[x] = stored[x];
                });
                window.ETASettings.save();
            }
            // regularly save settings to local storage
            setInterval(window.ETASettings.save, 1000)
        }
    }

    const scriptLoader = setInterval(loadScript, 200);
})();

////////////////////
//internal methods//
////////////////////
// Function to get unformatted number for Qty
window.bankCache = {};

function getQtyOfItem(itemID) {
    const cache = window.bankCache[itemID];
    if (cache !== undefined && bank[cache] !== undefined && bank[cache].id === itemID) {
        return bank[cache].qty;
    }
    for (let i = 0; i < bank.length; i++) {
        if (bank[i].id === itemID) {
            window.bankCache[itemID] = i;
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

// Convert milliseconds to hours/minutes/seconds and format them
function msToHms(ms, isShortClock = ETASettings.IS_SHORT_CLOCK) {
    let seconds = Number(ms / 1000);
    // split seconds in days, hours, minutes and seconds
    let d = Math.floor(seconds / 86400)
    let h = Math.floor(seconds % 86400 / 3600);
    let m = Math.floor(seconds % 3600 / 60);
    let s = Math.floor(seconds % 60);
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
function addMSToDate(date, ms) {
    return new Date(date.getTime() + ms);
}

// Format date 24 hour clock
function dateFormat(now, then, is12h = ETASettings.IS_12H_CLOCK) {
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

// Convert level to Xp needed to reach that level
function convertLvlToXp(level) {
    if (level === Infinity) {
        return Infinity;
    }
    let xp = 0;
    if (level === 1) {
        return xp;
    }
    xp = ETA.lvlToXp[level] + 1;
    return xp;
}

// binary search for optimization
function binarySearch(array, pred) {
    let lo = -1, hi = array.length;
    while (1 + lo < hi) {
        const mi = lo + ((hi - lo) >> 1);
        if (pred(array[mi])) {
            hi = mi;
        } else {
            lo = mi;
        }
    }
    return hi;
}

// Convert Xp value to level
function convertXpToLvl(xp, noCap = false) {
    let level = binarySearch(ETA.lvlToXp, (t) => (xp <= t)) - 1;
    if (level < 1) {
        level = 1;
    } else if (!noCap && level > 99) {
        level = 99;
    }
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
    let nextLevelXp = convertLvlToXp(currentLevel + 1);
    let diffLevelXp = nextLevelXp - currentLevelXp;
    let currentLevelPercentage = (currentXp - currentLevelXp) / diffLevelXp * 100;
    if (bar === true) {
        let finalLevelPercentage = ((finalXp - currentXp) > (nextLevelXp - currentXp)) ? 100 - currentLevelPercentage : ((finalXp - currentXp) / diffLevelXp * 100).toFixed(4);
        return finalLevelPercentage;
    } else {
        return currentLevelPercentage;
    }
}

//Return the chanceToKeep for any mastery EXp
function masteryPreservation(initial, masteryEXp, chanceToRefTable) {
    if (!initial.hasMastery) {
        return 0;
    }
    let chanceTo = chanceToRefTable;
    if (masteryEXp >= initial.masteryLim[0]) {
        for (let i = 0; i < initial.masteryLim.length; i++) {
            if (initial.masteryLim[i] <= masteryEXp && masteryEXp < initial.masteryLim[i + 1]) {
                return chanceTo[i + 1];
            }
        }
    } else {
        return chanceTo[0];
    }
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
    let itemXp = initial.itemXp;
    let xpMultiplier = 1;
    switch (initial.skillID) {
        case CONSTANTS.skill.Runecrafting:
            if (poolXp >= initial.poolLim[1] && items[initial.itemID].type === "Rune") {
                xpMultiplier += 1.5;
            }
            break;

        case CONSTANTS.skill.Cooking: {
            const burnChance = calcBurnChance(masteryXp);
            const cookXp = itemXp * (1 - burnChance);
            const burnXp = 1 * burnChance;
            itemXp = cookXp + burnXp;
            break;
        }

        case CONSTANTS.skill.Fishing: {
            const junkChance = calcJunkChance(initial, masteryXp, poolXp);
            const fishXp = itemXp * (1 - junkChance);
            const junkXp = 1 * junkChance;
            itemXp = (fishXp + junkXp);
            if (equippedItems.includes(CONSTANTS.item.Pirates_Lost_Ring)) {
                xpMultiplier += items[CONSTANTS.item.Pirates_Lost_Ring].fishingBonusXP / 100;
            }
            break;
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
    return itemXp * xpMultiplier;
}

// Calculate total number of unlocked items for skill based on current skill level
ETA.msLevelMap = {};

function calcTotalUnlockedItems(skillID, skillXp) {
    const currentSkillLevel = convertXpToLvl(skillXp);
    if (ETA.msLevelMap[skillID] === undefined) {
        ETA.msLevelMap[skillID] = MILESTONES[skillName[skillID]].map(x => x.level)
    }
    return binarySearch(ETA.msLevelMap[skillID], (t) => currentSkillLevel < t);
}

// compute average actions per mastery token
function actionsPerToken(skillID, skillXp, masteryXp) {
    let actions = 20000 / calcTotalUnlockedItems(skillID, skillXp);
    if (equippedItems.includes(CONSTANTS.item.Clue_Chasers_Insignia)) {
        actions *= 0.9;
    }
    if (skillID === CONSTANTS.skill.Cooking) {
        actions /= 1 - calcBurnChance(masteryXp);
    }
    return actions;
}

function initialVariables(skillID, checkTaskComplete) {
    let initial = {
        skillID: skillID,
        checkTaskComplete: checkTaskComplete,
        itemID: undefined,
        itemXp: 0,
        skillInterval: 0,
        masteryID: 0,
        skillReq: [], // Needed items for craft and their quantities
        recordCraft: Infinity, // Amount of craftable items for limiting resource
        hasMastery: skillID !== CONSTANTS.skill.Magic, // magic has no mastery, so we often check this
        isMainAction: true,
        // gathering skills are treated differently, so we often check this
        isGathering: skillID === CONSTANTS.skill.Woodcutting
            || skillID === CONSTANTS.skill.Fishing
            || skillID === CONSTANTS.skill.Mining
            || skillID === CONSTANTS.skill.Thieving,
        // Generate default values for script
        // skill
        skillXp: skillXP[skillID],
        targetLevel: ETASettings.getTargetLevel(skillID, skillLevel[skillID]),
        skillLim: [], // Xp needed to reach next level
        skillLimLevel: [],
        // mastery
        masteryXp: 0,
        targetMastery: 0,
        targetMasteryXp: 0,
        masteryLim: [], // Xp needed to reach next level
        masteryLimLevel: [0],
        totalMasteryLevel: 0,
        // pool
        poolXp: 0,
        targetPool: 0,
        targetPoolXp: 0,
        poolLim: [], // Xp need to reach next pool checkpoint
        chanceToKeep: [],
        maxPoolXp: 0,
        tokens: 0,
        poolLimCheckpoints: [10, 25, 50, 95, 100, Infinity], //Breakpoints for mastery pool bonuses followed by Infinity
    }
    // skill
    initial.targetXp = convertLvlToXp(initial.targetLevel);
    // Breakpoints for skill bonuses - default all levels starting at 2 to 99, followed by Infinity
    initial.skillLimLevel = Array.from({length: 98}, (_, i) => i + 2);
    initial.skillLimLevel.push(Infinity);
    // mastery
    // Breakpoints for mastery bonuses - default all levels starting at 2 to 99, followed by Infinity
    if (initial.hasMastery) {
        initial.masteryLimLevel = Array.from({length: 98}, (_, i) => i + 2);
    }
    initial.masteryLimLevel.push(Infinity);
    // Chance to keep at breakpoints - default 0.2% per level
    if (initial.hasMastery) {
        initial.chanceToKeep = Array.from({length: 99}, (_, i) => i * 0.002);
        initial.chanceToKeep[98] += 0.05; // Level 99 Bonus
    }
    return initial;
}

function skillCapeEquipped(capeID) {
    return equippedItems.includes(capeID)
        || equippedItems.includes(CONSTANTS.item.Max_Skillcape)
        || equippedItems.includes(CONSTANTS.item.Cape_of_Completion);
}

function configureSmithing(initial) {
    initial.itemID = smithingItems[initial.currentAction].itemID;
    initial.itemXp = items[initial.itemID].smithingXP;
    initial.skillInterval = 2000;
    if (godUpgrade[3]) initial.skillInterval *= 0.8;
    for (let i of items[initial.itemID].smithReq) {
        const req = {...i};
        if (req.id === CONSTANTS.item.Coal_Ore && skillCapeEquipped(CONSTANTS.item.Smithing_Skillcape)) {
            req.qty /= 2;
        }
        initial.skillReq.push(req);
    }
    initial.masteryLimLevel = [20, 40, 60, 80, 99, Infinity]; // Smithing Mastery Limits
    initial.chanceToKeep = [0, 0.05, 0.10, 0.15, 0.20, 0.30]; //Smithing Mastery bonus percentages
    if (petUnlocked[5]) initial.chanceToKeep = initial.chanceToKeep.map(n => n + PETS[5].chance / 100); // Add Pet Bonus
    return initial;
}

function configureFletching(initial) {
    initial.itemID = fletchingItems[initial.currentAction].itemID;
    initial.itemXp = items[initial.itemID].fletchingXP;
    initial.skillInterval = 2000;
    if (godUpgrade[0]) initial.skillInterval *= 0.8;
    if (petUnlocked[8]) initial.skillInterval -= 200;
    for (let i of items[initial.itemID].fletchReq) {
        initial.skillReq.push(i);
    }
    //Special Case for Arrow Shafts
    if (initial.itemID === CONSTANTS.item.Arrow_Shafts) {
        if (selectedFletchLog === undefined) {
            selectedFletchLog = 0;
        }
        initial.skillReq = [initial.skillReq[selectedFletchLog]];
    }
    return initial;
}

function configureRunecrafting(initial) {
    initial.itemID = runecraftingItems[initial.currentAction].itemID;
    initial.itemXp = items[initial.itemID].runecraftingXP;
    initial.skillInterval = 2000;
    if (godUpgrade[1]) initial.skillInterval *= 0.8;
    for (let i of items[initial.itemID].runecraftReq) {
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
    initial.itemID = craftingItems[initial.currentAction].itemID;
    initial.itemXp = items[initial.itemID].craftingXP;
    initial.skillInterval = 3000;
    if (godUpgrade[0]) initial.skillInterval *= 0.8;
    if (skillCapeEquipped(CONSTANTS.item.Crafting_Skillcape)) {
        initial.skillInterval -= 500;
    }
    if (petUnlocked[9]) initial.skillInterval -= 200;
    items[initial.itemID].craftReq.forEach(i => initial.skillReq.push(i));
    return initial;
}

function configureHerblore(initial) {
    initial.itemID = herbloreItemData[initial.currentAction].itemID[getHerbloreTier(initial.currentAction)];
    initial.itemXp = herbloreItemData[initial.currentAction].herbloreXP;
    initial.skillInterval = 2000;
    if (godUpgrade[1]) initial.skillInterval *= 0.8;
    for (let i of items[initial.itemID].herbloreReq) {
        initial.skillReq.push(i);
    }
    return initial;
}

function configureCooking(initial) {
    initial.itemID = initial.currentAction;
    initial.itemXp = items[initial.itemID].cookingXP;
    if (currentCookingFire > 0) {
        initial.itemXp *= (1 + cookingFireData[currentCookingFire - 1].bonusXP / 100);
    }
    initial.skillInterval = 3000;
    if (godUpgrade[3]) initial.skillInterval *= 0.8;
    initial.skillReq = [{id: initial.itemID, qty: 1}];
    initial.masteryLimLevel = [99, Infinity]; //Cooking has no Mastery bonus
    initial.chanceToKeep = [0, 0]; //Thus no chance to keep
    initial.itemID = items[initial.itemID].cookedItemID;
    return initial;
}

function configureFiremaking(initial) {
    initial.itemID = initial.currentAction;
    initial.itemXp = logsData[initial.currentAction].xp * (1 + bonfireBonus / 100);
    initial.skillInterval = logsData[initial.currentAction].interval;
    if (godUpgrade[3]) initial.skillInterval *= 0.8;
    initial.skillReq = [{id: initial.itemID, qty: 1}];
    initial.chanceToKeep.fill(0); // Firemaking Mastery does not provide preservation chance
    return initial;
}

function configureMagic(initial) {
    initial.skillInterval = 2000;
    //Find need runes for spell
    if (ALTMAGIC[initial.currentAction].runesRequiredAlt !== undefined && useCombinationRunes) {
        for (let i of ALTMAGIC[initial.currentAction].runesRequiredAlt) {
            initial.skillReq.push({...i});
        }
    } else {
        for (let i of ALTMAGIC[initial.currentAction].runesRequired) {
            initial.skillReq.push({...i});
        }
    }
    // Get Rune discount
    let capeMultiplier = 1;
    if (skillCapeEquipped(CONSTANTS.item.Magic_Skillcape)) {
        // Add cape multiplier
        capeMultiplier = 2;
    }
    for (let i = 0; i < initial.skillReq.length; i++) {
        if (items[equippedItems[CONSTANTS.equipmentSlot.Weapon]].providesRune !== undefined) {
            if (items[equippedItems[CONSTANTS.equipmentSlot.Weapon]].providesRune.includes(initial.skillReq[i].id)) {
                initial.skillReq[i].qty -= items[equippedItems[CONSTANTS.equipmentSlot.Weapon]].providesRuneQty * capeMultiplier;
            }
        }
    }
    initial.skillReq = initial.skillReq.filter(item => item.qty > 0); // Remove all runes with 0 cost
    //Other items
    if (ALTMAGIC[initial.currentAction].selectItem === 1 && selectedMagicItem[1] !== null) { // Spells that just use 1 item
        let found = false;
        for (const req of initial.skillReq) {
            if (req.id === selectedMagicItem[1]) {
                req.qty++;
                found = true;
            }
        }
        if (!found) {
            initial.skillReq.push({id: selectedMagicItem[1], qty: 1});
        }
    } else if (ALTMAGIC[initial.currentAction].selectItem === -1) { // Spells that doesn't require you to select an item
        if (ALTMAGIC[initial.currentAction].needCoal) { // Rags to Riches II
            initial.skillReq.push({id: 48, qty: 1});
        }
    } else if (selectedMagicItem[0] !== null && ALTMAGIC[initial.currentAction].selectItem === 0) { // SUPERHEAT
        for (let i of items[selectedMagicItem[0]].smithReq) {
            initial.skillReq.push({...i});
        }
        if (ALTMAGIC[initial.currentAction].ignoreCoal) {
            initial.skillReq = initial.skillReq.filter(item => item.id !== 48);
        }
    }
    initial.masteryLimLevel = [Infinity]; //AltMagic has no Mastery bonus
    initial.chanceToKeep = [0]; //Thus no chance to keep
    initial.itemXp = ALTMAGIC[initial.currentAction].magicXP;
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
    initial.itemID = miningData[initial.currentAction].ore;
    initial.itemXp = items[initial.itemID].miningXP;
    initial.skillInterval = 3000;
    if (godUpgrade[2]) initial.skillInterval *= 0.8;
    initial.skillInterval *= 1 - pickaxeBonusSpeed[currentPickaxe] / 100;
    return configureGathering(initial);
}

function configureThieving(initial) {
    initial.itemID = undefined;
    initial.itemXp = thievingNPC[initial.currentAction].xp;
    initial.skillInterval = 3000;
    if (skillCapeEquipped(CONSTANTS.item.Thieving_Skillcape)) {
        initial.skillInterval -= 500;
    }
    return configureGathering(initial);
}

function configureWoodcutting(initial) {
    initial.itemID = initial.currentAction;
    initial.itemXp = trees[initial.itemID].xp;
    initial.skillInterval = trees[initial.itemID].interval;
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
    initial.itemID = fishingItems[fishingAreas[initial.currentAction].fish[initial.fishID]].itemID;
    initial.itemXp = items[initial.itemID].fishingXP;
    // base avg interval
    let avgRoll = 0.5;
    const max = items[initial.itemID].maxFishingInterval;
    const min = items[initial.itemID].minFishingInterval;
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
    switch (initial.skillID) {
        case CONSTANTS.skill.Firemaking:
            timePerAction = logsData[initial.itemID].interval * 0.6;
            break;
        case CONSTANTS.skill.Cooking:
            timePerAction = 2400;
            break;
        case CONSTANTS.skill.Smithing:
            timePerAction = 1600;
            break;
        case CONSTANTS.skill.Fletching:
            timePerAction = 1200;
            break;
        case CONSTANTS.skill.Crafting:
            timePerAction = 1500;
            break;
        case CONSTANTS.skill.Runecrafting:
            timePerAction = 1600;
            break;
        case CONSTANTS.skill.Herblore:
            timePerAction = 1600;
            break;
    }
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
    if (convertXpToLvl(skillXp) >= 99) {
        return masteryXp / 2;
    } else {
        return masteryXp / 4;
    }
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
        targetSkillReached: initial.skillXp >= initial.targetXp,
        targetSkillTime: 0,
        targetSkillResources: 0,
        // mastery
        masteryXp: initial.masteryXp,
        targetMasteryReached: initial.masteryXp >= initial.targetMasteryXp,
        targetMasteryTime: 0,
        targetMasteryResources: 0,
        // pool
        poolXp: initial.poolXp,
        targetPoolReached: initial.poolXp >= initial.targetPoolXp,
        targetPoolTime: 0,
        targetPoolResources: 0,
        totalMasteryLevel: initial.totalMasteryLevel,
        // items
        resources: resources,
        chargeUses: 0, // estimated remaining charge uses
        tokens: initial.tokens,
        // estimated number of actions taken so far
        actions: 0,
    };
    // set secondary if it exists
    if (initial.secondary !== undefined) {
        current.secondary = currentVariables(initial.secondary, initial.secondary.recordCraft);
    }
    // Check for Crown of Rhaelyx
    if (equippedItems.includes(CONSTANTS.item.Crown_of_Rhaelyx) && initial.hasMastery && !initial.isGathering) {
        for (let i = 0; i < initial.masteryLimLevel.length; i++) {
            initial.chanceToKeep[i] += 0.10; // Add base 10% chance
        }
        let rhaelyxCharge = getQtyOfItem(CONSTANTS.item.Charge_Stone_of_Rhaelyx);
        current.chargeUses = rhaelyxCharge * 1000; // average crafts per Rhaelyx Charge Stone
    }
    return current;
}

function gainPerAction(initial, current, currentInterval) {
    const gains = {
        xpPerAction: skillXpAdjustment(initial, current.poolXp, current.masteryXp),
        masteryXpPerAction: 0,
        poolXpPerAction: 0,
        tokensPerAction: 0,
        tokenXpPerAction: 0,
    };
    if (initial.hasMastery) {
        gains.masteryXpPerAction = calcMasteryXpToAdd(initial, current, currentInterval);
        gains.poolXpPerAction = calcPoolXpToAdd(current.skillXp, gains.masteryXpPerAction);
        gains.tokensPerAction = 1 / actionsPerToken(initial.skillID, current.skillXp, current.masteryXp);
        gains.tokenXpPerAction = initial.maxPoolXp / 1000 * gains.tokensPerAction;
    }
    return gains
}

function syncSecondary(current) {
    current.secondary.skillXp = current.skillXp;
    current.secondary.poolXp = current.poolXp;
    current.secondary.totalMasteryLevel = current.totalMasteryLevel;
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

    // Actions until limit
    getLim = (lims, xp, max) => {
        const lim = lims.find(element => element > xp);
        if (xp < max && max < lim) {
            return Math.ceil(max);
        }
        return Math.ceil(lim);
    }
    // skill
    const skillXpToLimit = getLim(initial.skillLim, current.skillXp, initial.targetXp) - current.skillXp;
    const skillXpActions = skillXpToLimit / gains.xpPerAction;
    // mastery variables
    let masteryXpActions = Infinity;
    let secondaryMasteryXpPrimaryActions = Infinity;
    let poolXpActions = Infinity;
    if (initial.hasMastery) {
        // mastery
        const masteryXpToLimit = getLim(initial.skillLim, current.masteryXp, initial.targetMasteryXp) - current.masteryXp;
        masteryXpActions = masteryXpToLimit / gains.masteryXpPerAction;
        if (initial.secondary !== undefined) {
            const secondaryMasteryXpToLimit = getLim(initial.secondary.skillLim, current.secondary.masteryXp, initial.secondary.targetMasteryXp) - current.secondary.masteryXp;
            secondaryMasteryXpPrimaryActions = secondaryMasteryXpToLimit / gains.secondaryMasteryXpPerPrimaryAction;
        }
        // pool
        const poolXpToLimit = getLim(initial.poolLim, current.poolXp, initial.targetPoolXp) - current.poolXp;
        poolXpActions = poolXpToLimit / gains.poolXpPerAction;
    }

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
    if (!current.targetSkillReached && initial.targetXp <= current.skillXp) {
        current.targetSkillTime = current.sumTotalTime;
        current.targetSkillReached = true;
        current.targetSkillResources = initial.recordCraft - current.resources;
    }
    if (!current.targetMasteryReached && initial.targetMasteryXp <= current.masteryXp) {
        current.targetMasteryTime = current.sumTotalTime;
        current.targetMasteryReached = true;
        current.targetMasteryResources = initial.recordCraft - current.resources;
    }
    if (initial.secondary !== undefined) {
        if (!current.secondary.targetMasteryReached && initial.targetMasteryXp <= current.secondary.masteryXp) {
            current.secondary.targetMasteryTime = current.secondary.sumTotalTime;
            current.secondary.targetMasteryReached = true;
            current.secondary.targetMasteryResources = initial.recordCraft - current.secondary.resources;
        }
    }
    if (!current.targetPoolReached && initial.targetPoolXp <= current.poolXp) {
        current.targetPoolTime = current.sumTotalTime;
        current.targetPoolReached = true;
        current.targetPoolResources = initial.recordCraft - current.resources;
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

function currentXpRates(initial) {
    let rates = {};
    const initialInterval = intervalAdjustment(initial, initial.poolXp, initial.masteryXp);
    const initialAverageActionTime = intervalRespawnAdjustment(initial, initialInterval, initial.poolXp, initial.masteryXp);
    rates.xpH = skillXpAdjustment(initial, initial.poolXp, initial.masteryXp) / initialAverageActionTime * 1000 * 3600;
    if (initial.hasMastery) {
        // compute current mastery xp / h using the getMasteryXpToAdd from the game or the method from this script
        // const masteryXpPerAction = getMasteryXpToAdd(initial.skillID, initial.masteryID, initialInterval);
        const masteryXpPerAction = calcMasteryXpToAdd(initial, initial, initialInterval);
        rates.masteryXpH = masteryXpPerAction / initialAverageActionTime * 1000 * 3600;
        // pool percentage per hour
        rates.poolH = calcPoolXpToAdd(initial.skillXp, masteryXpPerAction) / initialAverageActionTime * 1000 * 3600 / initial.maxPoolXp;
        rates.tokensH = 3600 * 1000 / initialAverageActionTime / actionsPerToken(initial.skillID, initial.skillXp, initial.masteryXp);
    }
    return rates;
}

function getXpRates(initial, current) {
    // compute exp rates, either current or average until resources run out
    let rates = {};
    if (ETASettings.CURRENT_RATES || initial.isGathering || initial.recordCraft === 0) {
        // compute current rates
        rates = currentXpRates(initial);
        if (initial.secondary !== undefined) {
            const secondaryRates = currentXpRates(initial.secondary);
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

    // loop until out of resources
    while (current.resources > 0) {
        current = actionsToBreakpoint(initial, current);
    }

    // method to convert final pool xp to percentage
    const poolCap = ETASettings.UNCAP_POOL ? Infinity : 100
    const poolXpToPercentage = poolXp => Math.min((poolXp / initial.maxPoolXp) * 100, poolCap).toFixed(2);
    // create result object
    let expectedTime = {
        timeLeft: Math.round(current.sumTotalTime),
        actions: current.actions,
        finalSkillXp: current.skillXp,
        finalMasteryXp: current.masteryXp,
        finalPoolXp: current.poolXp,
        finalPoolPercentage: poolXpToPercentage(current.poolXp),
        targetPoolTime: current.targetPoolTime,
        targetMasteryTime: current.targetMasteryTime,
        targetSkillTime: current.targetSkillTime,
        rates: getXpRates(initial, current),
        tokens: current.tokens,
    };
    // continue calculations until time to all targets is found
    while (!current.targetSkillReached || (initial.hasMastery && (!current.targetMasteryReached || !current.targetPoolReached))) {
        current = actionsToBreakpoint(initial, current, true);
    }
    // if it is a gathering skill, then set final values to the values when reaching the final target
    if (initial.isGathering) {
        expectedTime.finalSkillXp = current.skillXp;
        expectedTime.finalMasteryXp = current.masteryXp;
        expectedTime.finalPoolXp = current.poolXp;
        expectedTime.finalPoolPercentage = poolXpToPercentage(current.poolXp);
        expectedTime.tokens = current.tokens;
    }
    // set time to targets
    expectedTime.targetSkillTime = current.targetSkillTime;
    expectedTime.targetMasteryTime = current.targetMasteryTime;
    expectedTime.targetPoolTime = current.targetPoolTime;
    // return the resulting data object
    expectedTime.current = current;
    return expectedTime;
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
    if (initial.hasMastery) {
        // mastery
        initial.totalMasteryLevel = getCurrentTotalMasteryLevelForSkill(initial.skillID);
        if (!initial.isGathering) {
            initial.masteryID = items[initial.itemID].masteryID[1];
        }
        initial.masteryXp = MASTERY[initial.skillID].xp[initial.masteryID];
        initial.targetMastery = ETASettings.getTargetMastery(initial.skillID, convertXpToLvl(initial.masteryXp));
        initial.targetMasteryXp = convertLvlToXp(initial.targetMastery);
        // pool
        initial.poolXp = MASTERY[initial.skillID].pool;
        initial.maxPoolXp = getMasteryPoolTotalXP(initial.skillID);
        initial.targetPool = ETASettings.getTargetPool(initial.skillID, 100 * initial.poolXp / initial.maxPoolXp);
        initial.targetPoolXp = initial.maxPoolXp;
        if (initial.targetPool !== 100) {
            initial.targetPoolXp = initial.maxPoolXp / 100 * initial.targetPool;
        }
        initial.tokens = getQtyOfItem(CONSTANTS.item["Mastery_Token_" + skillName[initial.skillID]])
    }

    // Apply itemXp Bonuses from gear and pets
    initial.itemXp = addXPBonuses(initial.skillID, initial.itemXp, true);

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
    const results = calcExpectedTime(initial);
    const ms = {
        resources: Math.round(results.timeLeft),
        skill: Math.round(results.targetSkillTime),
        mastery: Math.round(results.targetMasteryTime),
        pool: Math.round(results.targetPoolTime),
    };
    //Inject timeLeft HTML
    const now = new Date();
    const timeLeftElement = injectHTML(initial, results, ms.resources, now);
    generateTooltips(initial, ms, results, timeLeftElement, now);

    if (initial.isMainAction) {
        // Set global variables to track completion
        let times = [];
        if (!initial.isGathering) {
            times.push(ETA.time(ETASettings.DING_RESOURCES, 0, ms.resources, -ms.resources, "Processing finished."));
        }
        times.push(ETA.time(ETASettings.DING_LEVEL, initial.targetLevel, ms.skill, convertXpToLvl(initial.skillXp), "Target level reached."));
        if (initial.hasMastery) {
            times.push(ETA.time(ETASettings.DING_MASTERY, initial.targetMastery, ms.mastery, convertXpToLvl(initial.masteryXp), "Target mastery reached."));
            times.push(ETA.time(ETASettings.DING_POOL, initial.targetPool, ms.pool, 100 * initial.poolXp / initial.maxPoolXp, "Target pool reached."));
        }
        ETA.setTimeLeft(initial, times);
        if (initial.checkTaskComplete) {
            ETA.taskComplete();
        }
        if (!initial.isGathering) {
            generateProgressBars(initial, results);
        }
    }
}

function injectHTML(initial, results, msLeft, now) {
    let timeLeftElementId = `timeLeft${skillName[initial.skillID]}`;
    if (initial.secondary !== undefined) {
        timeLeftElementId += "-Secondary";
    } else if (initial.isGathering) {
        timeLeftElementId += "-" + initial.currentAction;
    }
    if (initial.skillID === CONSTANTS.skill.Thieving && document.getElementById(timeLeftElementId) === null) {
        ETA.makeThievingDisplay();
    }
    const timeLeftElement = document.getElementById(timeLeftElementId);
    if (timeLeftElement !== null) {
        let finishedTime = addMSToDate(now, msLeft);
        timeLeftElement.textContent = "";
        if (ETASettings.SHOW_XP_RATE) {
            timeLeftElement.textContent = "Xp/h: " + formatNumber(Math.floor(results.rates.xpH));
            if (initial.hasMastery) {
                timeLeftElement.textContent += "\r\nMXp/h: " + formatNumber(Math.floor(results.rates.masteryXpH))
                    + `\r\nPool/h: ${results.rates.poolH.toFixed(2)}%`
            }
        }
        if (!initial.isGathering) {
            if (msLeft === 0) {
                timeLeftElement.textContent += "\r\nNo resources!";
            } else {
                timeLeftElement.textContent += "\r\nActions: " + formatNumber(results.actions)
                    + "\r\nTime: " + msToHms(msLeft)
                    + "\r\nETA: " + dateFormat(now, finishedTime);
            }
        }
        if ((initial.isGathering || initial.skillID === CONSTANTS.skill.Cooking) && initial.itemID !== undefined && initial.secondary === undefined) {
            const youHaveElementId = timeLeftElementId + "-YouHave";
            $("#" + youHaveElementId).replaceWith(''
                + `<small id="${youHaveElementId}">`
                + `<span>You have: ${formatNumber(getQtyOfItem(initial.itemID))}</span>`
                + `<img class="skill-icon-xs mr-2" src="${items[initial.itemID].media}">`
                + "</small>"
            );
        }
        timeLeftElement.style.display = "block";
    }
    return timeLeftElement;
}

function generateTooltips(initial, ms, results, timeLeftElement, now) {
    // Generate progression Tooltips
    if (!timeLeftElement._tippy) {
        tippy(timeLeftElement, {
            allowHTML: true,
            interactive: false,
            animation: false,
        });
    }
    // level tooltip
    const finalLevel = convertXpToLvl(results.finalSkillXp, true)
    const levelProgress = getPercentageInLevel(results.finalSkillXp, results.finalSkillXp, "skill");
    let tooltip = finalLevelElement(
        'Final Level',
        formatLevel(finalLevel, levelProgress) + ' / 99',
        'success',
    ) + tooltipSection(initial, now, ms.skill, initial.targetLevel, results.current.targetSkillResources);
    // mastery tooltip
    if (initial.hasMastery && initial.secondary === undefined) {
        // don't show mastery target when combining multiple actions
        const finalMastery = convertXpToLvl(results.finalMasteryXp);
        const masteryProgress = getPercentageInLevel(results.finalMasteryXp, results.finalMasteryXp, "mastery");
        tooltip += finalLevelElement(
            'Final Mastery',
            formatLevel(finalMastery, masteryProgress) + ' / 99',
            'info',
        ) + tooltipSection(initial, now, ms.mastery, initial.targetMastery, results.current.targetMasteryResources);
    }
    // pool tooltip
    if (initial.hasMastery) {
        tooltip += finalLevelElement(
            'Final Pool XP',
            results.finalPoolPercentage + '%',
            'warning',
        )
        let prepend = ''
        const tokens = Math.round(results.tokens);
        if (tokens > 0) {
            prepend += `Final token count: ${tokens}`;
            if (ms.pool > 0) {
                prepend += '<br>';
            }
        }
        tooltip += tooltipSection(initial, now, ms.pool, `${initial.targetPool}%`, results.current.targetPoolResources, prepend);
    }
    // wrap and return
    timeLeftElement._tippy.setContent(`<div>${tooltip}</div>`);
}

function tooltipSection(initial, now, ms, target, resources, prepend = '') {
    // final level and time to target level
    if (ms > 0) {
        return wrapTimeLeft(
            prepend + timeLeftToHTML(
            initial,
            target,
            msToHms(ms),
            dateFormat(now, addMSToDate(now, ms)),
            resources,
            ),
        );
    } else if (prepend !== '') {
        return wrapTimeLeft(
            prepend,
        );
    }
    return '';
}

function finalLevelElement(finalName, finalTarget, label) {
    return ''
        + '<div class="row no-gutters">'
        + '  <div class="col-6" style="white-space: nowrap;">'
        + '    <h3 class="font-size-base m-1" style="color:white;" >'
        + `      <span class="p-1" style="text-align:center; display: inline-block;line-height: normal;color:white;">`
        + finalName
        + '      </span>'
        + '    </h3>'
        + '  </div>'
        + '  <div class="col-6" style="white-space: nowrap;">'
        + '    <h3 class="font-size-base m-1" style="color:white;" >'
        + `      <span class="p-1 bg-${label} rounded" style="text-align:center; display: inline-block;line-height: normal;width: 100px;color:white;">`
        + finalTarget
        + '      </span>'
        + '    </h3>'
        + '  </div>'
        + '</div>';
}

const timeLeftToHTML = (initial, target, time, finish, resources) => `Time to ${target}: ${time}<br>ETA: ${finish}` + resourcesLeftToHTML(initial, resources);

const resourcesLeftToHTML = (initial, resources) => {
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
        + '	<span class="col-12 m-1" style="padding:0.5rem 1.25rem;min-height:2.5rem;font-size:0.875rem;line-height:1.25rem;text-align:center">'
        + s
        + '	</span>'
        + '</div>';
}

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

function generateProgressBars(initial, results) {
    // skill
    const skillProgress = getPercentageInLevel(initial.skillXp, results.finalSkillXp, "skill", true);
    $(`#skill-progress-bar-end-${initial.skillID}`).css("width", skillProgress + "%");
    // mastery
    if (initial.hasMastery) {
        const masteryProgress = getPercentageInLevel(initial.masteryXp, results.finalMasteryXp, "mastery", true);
        $(`#${initial.skillID}-mastery-pool-progress-end`).css("width", masteryProgress + "%");
        // pool
        const poolProgress = (results.finalPoolPercentage > 100) ?
            100 - ((initial.poolXp / initial.maxPoolXp) * 100) :
            (results.finalPoolPercentage - ((initial.poolXp / initial.maxPoolXp) * 100)).toFixed(4);
        $(`#mastery-pool-progress-end-${initial.skillID}`).css("width", poolProgress + "%");
    }
}