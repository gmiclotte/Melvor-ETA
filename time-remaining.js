// ==UserScript==
// @name		Melvor ETA
// @namespace	http://tampermonkey.net/
// @version		0.3.4-0.19
// @description Shows xp/h and mastery xp/h, and the time remaining until certain targets are reached. Takes into account Mastery Levels and other bonuses.
// @description Please report issues on https://github.com/gmiclotte/Melvor-Time-Remaining/issues or message TinyCoyote#1769 on Discord
// @description The last part of the version number is the most recent version of Melvor that was tested with this script. More recent versions might break the script.
// @description	Forked from Breindahl#2660's Melvor TimeRemaining script v0.6.2.2., originally developed by Breindahl#2660, Xhaf#6478 and Visua#9999
// @author		GMiclotte
// @match       https://*.melvoridle.com/*
// @exclude     https://wiki.melvoridle.com*
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
    // true to show action times
    SHOW_ACTION_TIME: false,
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
    // change the ding sound level
    DING_VOLUME: 0.1,
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
        SHOW_ACTION_TIME: 'Show action times',
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
        CONSTANTS.skill.Agility,
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
            ding.volume = ETASettings.DING_VOLUME;
            ding.play();
            return;
        }
    }
}

ETA.time = (ding, target, current, msg) => {
    return {ding: ding, target: target, current: current, msg: msg};
};

ETA.setTimeLeft = function (initial, times) {
    // save previous
    ETA.timeLeftLast = ETA.timeLeftCurrent;
    // set current
    ETA.timeLeftCurrent = {
        skillID: initial.skillID,
        action: initial.currentAction.toString(),
        times: times.filter(x => x.ding),
    }
}


//////////////
//containers//
//////////////

const tempContainer = (id) => {
    return html2Node(''
        + '<div class="font-size-base font-w600 text-center text-muted">'
        + `	<small id ="${id}" class="mb-2" style="display:block;clear:both;white-space:pre-line" data-toggle="tooltip" data-placement="top" data-html="true" title="" data-original-title="">`
        + '	</small>'
        + `	<small id ="${id}" class="mb-2" style="display:block;clear:both;white-space:pre-line">`
        + `<div id="${id + '-YouHave'}"/>`
        + '	</small>'
        + '</div>');
}

ETA.makeProcessingDisplays = function () {
    // smithing
    let node = document.getElementById('smith-item-have');
    node.parentNode.insertBefore(tempContainer('timeLeftSmithing'), node.nextSibling);
    // fletching
    node = document.getElementById('fletch-item-have');
    node.parentNode.insertBefore(tempContainer('timeLeftFletching'), node.nextSibling);
    // Runecrafting
    node = document.getElementById('runecraft-item-have');
    node.parentNode.insertBefore(tempContainer('timeLeftRunecrafting'), node.nextSibling);
    // Crafting
    node = document.getElementById('craft-item-have');
    node.parentNode.insertBefore(tempContainer('timeLeftCrafting'), node.nextSibling);
    // Herblore
    node = document.getElementById('herblore-item-have');
    node.parentNode.insertBefore(tempContainer('timeLeftHerblore'), node.nextSibling);
    // Cooking
    node = document.getElementById('skill-cooking-food-selected-qty');
    node = node.parentNode.parentNode.parentNode;
    node.parentNode.insertBefore(tempContainer('timeLeftCooking'), node.nextSibling);
    // Firemaking
    node = document.getElementById('skill-fm-logs-selected-qty');
    node = node.parentNode.parentNode.parentNode;
    node.parentNode.insertBefore(tempContainer('timeLeftFiremaking'), node.nextSibling);
    // Alt. Magic
    node = document.getElementById('magic-item-have-and-div');
    node.parentNode.insertBefore(tempContainer('timeLeftMagic'), node.nextSibling);
}

ETA.makeMiningDisplay = function () {
    miningData.forEach((_, i) => {
        const node = document.getElementById(`mining-ore-img-${i}`);
        node.parentNode.insertBefore(tempContainer(`timeLeftMining-${i}`), node);
    });
}

ETA.makeThievingDisplay = function () {
    thievingNPC.forEach((_, i) => {
        const node = document.getElementById(`success-rate-${i}`).parentNode;
        node.parentNode.insertBefore(tempContainer(`timeLeftThieving-${i}`), node.nextSibling);
    });
}

ETA.makeWoodcuttingDisplay = function () {
    trees.forEach((_, i) => {
        const node = document.getElementById(`tree-rates-${i}`);
        node.parentNode.insertBefore(tempContainer(`timeLeftWoodcutting-${i}`), node.nextSibling);
    });
    const node = document.getElementById('skill-woodcutting-multitree').parentNode;
    node.parentNode.insertBefore(tempContainer('timeLeftWoodcutting-Secondary'), node.nextSibling);
}

ETA.makeFishingDisplay = function () {
    fishingAreas.forEach((_, i) => {
        const node = document.getElementById(`fishing-area-${i}-selected-fish-xp`);
        node.parentNode.insertBefore(tempContainer(`timeLeftFishing-${i}`), node.nextSibling);
    });
}

ETA.makeAgilityDisplay = function () {
    chosenAgilityObstacles.forEach(i => {
        if (i === -1) {
            return;
        }
        if (document.getElementById(`timeLeftAgility-${i}`)) {
            // element already exists
            return;
        }
        let node = document.getElementById(`agility-obstacle-${i}`);
        node = node.children[0].children[0].children[0];
        node.insertBefore(tempContainer(`timeLeftAgility-${i}`), node.children[3]);
    });
    if (document.getElementById('timeLeftAgility-Secondary')) {
        // element already exists
        return;
    }
    document.getElementById('agility-breakdown-items').appendChild(tempContainer('timeLeftAgility-Secondary'));
}

html2Node = (html) => {
    var template = document.createElement('template');
    html = html.trim(); // Never return a text node of whitespace as the result
    template.innerHTML = html;
    return template.content.firstChild;
}

////////////////
//main wrapper//
////////////////

ETA.timeRemainingWrapper = function (skillID, checkTaskComplete) {
    // populate the main `time remaining` variables
    if (isGathering(skillID)) {
        gatheringWrapper(skillID, checkTaskComplete);
    } else {
        productionWrapper(skillID, checkTaskComplete);
    }
}

function gatheringWrapper(skillID, checkTaskComplete) {
    let data = [];
    let current;
    // gathering skills
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

        case CONSTANTS.skill.Agility:
            data = [];
            // only keep active chosen obstacles
            for (const x of chosenAgilityObstacles) {
                if (x >= 0) {
                    data.push(x);
                } else {
                    break;
                }
            }
            current = -1; // never progress bar or ding for single obstacle
            break
    }
    if (data.length > 0) {
        if (skillID !== CONSTANTS.skill.Agility) {
            data.forEach((x, i) => {
                if (skillID === CONSTANTS.skill.Woodcutting && currentlyCutting === 2 && currentTrees.includes(i)) {
                    return;
                }
                let initial = initialVariables(skillID, checkTaskComplete);
                if (initial.skillID === CONSTANTS.skill.Fishing) {
                    initial.fishID = selectedFish[i];
                    if (initial.fishID === null) {
                        return;
                    }
                }
                initial.currentAction = i;
                if (initial.skillID === CONSTANTS.skill.Agility) {
                    initial.currentAction = x;
                    initial.agilityObstacles = data;
                }
                asyncTimeRemaining(initial);
            });
        }
        if (skillID === CONSTANTS.skill.Woodcutting) {
            if (currentlyCutting === 2) {
                // init first tree
                let initial = initialVariables(skillID, checkTaskComplete);
                initial.currentAction = currentTrees;
                initial.multiple = ETA.PARALLEL;
                // run time remaining
                asyncTimeRemaining(initial);
            } else {
                // wipe the display, there's no way of knowing which tree is being cut
                document.getElementById(`timeLeft${skillName[skillID]}-Secondary`).textContent = '';
            }
        }
        if (skillID === CONSTANTS.skill.Agility) {
            // init first tree
            let initial = initialVariables(skillID, checkTaskComplete);
            initial.currentAction = data;
            initial.agilityObstacles = data;
            initial.multiple = ETA.PARALLEL;
            // run time remaining
            asyncTimeRemaining(initial);
        }
    }
}

function productionWrapper(skillID, checkTaskComplete) {
    // production skills
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
    if (initial.currentAction === undefined || initial.currentAction === null) {
        return;
    }
    asyncTimeRemaining(initial);
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

    // constants
    ETA.SINGLE = 0;
    ETA.PARALLEL = 1;
    ETA.SEQUENTIAL = 2;

    // data
    ETA.insigniaModifier = 1 - items[CONSTANTS.item.Clue_Chasers_Insignia].increasedItemChance / 100;
    // (25 - 10) / 100 = 0.15
    ETA.rhaelyxChargePreservation = (items[CONSTANTS.item.Crown_of_Rhaelyx].chanceToPreserve - items[CONSTANTS.item.Crown_of_Rhaelyx].baseChanceToPreserve) / 100;

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
        ["Agility", "startAgility"],
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
            case 26:
                skillName = "Agility";
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
    ETA.makeAgilityDisplay();

    // remake Agility display after loading the Agility Obstacles
    ETA.loadAgilityRef = loadAgility;
    loadAgility = (...args) => {
        ETA.loadAgilityRef(...args);
        ETA.log('Remaking Agility display');
        ETA.makeAgilityDisplay();
        try {
            ETA.timeRemainingWrapper(CONSTANTS.skill.Agility, false);
        } catch (e) {
            console.error(e);
        }
    }

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
function getQtyOfItem(itemID) {
    const bankID = getBankId(itemID);
    if (bankID === -1) {
        return 0;
    }
    return bank[bankID].qty;
}

// help function for time display
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

//Return the preservation for any mastery and pool
function masteryPreservation(initial, masteryXp, poolXp) {
    if (!initial.hasMastery) {
        return 0;
    }
    const masteryLevel = convertXpToLvl(masteryXp);
    let preservationChance = 0;
    switch (initial.skillID) {
        case CONSTANTS.skill.Cooking:
            if (poolXp >= initial.poolLim[2])
                preservationChance += 10;
            break;
        case CONSTANTS.skill.Smithing:
            let smithingMasteryLevel = masteryLevel;
            if (smithingMasteryLevel >= 99) preservationChance += 30;
            else if (smithingMasteryLevel >= 80) preservationChance += 20;
            else if (smithingMasteryLevel >= 60) preservationChance += 15;
            else if (smithingMasteryLevel >= 40) preservationChance += 10;
            else if (smithingMasteryLevel >= 20) preservationChance += 5;
            if (poolXp >= initial.poolLim[1])
                preservationChance += 5;
            if (poolXp >= initial.poolLim[2])
                preservationChance += 5;
            break;
        case CONSTANTS.skill.Fletching:
            preservationChance += 0.2 * masteryLevel - 0.2;
            if (masteryLevel >= 99)
                preservationChance += 5;
            break;
        case CONSTANTS.skill.Crafting:
            preservationChance += 0.2 * masteryLevel - 0.2;
            if (masteryLevel >= 99)
                preservationChance += 5;
            if (poolXp >= initial.poolLim[1])
                preservationChance += 5;
            break;
        case CONSTANTS.skill.Runecrafting:
            if (poolXp >= initial.poolLim[2])
                preservationChance += 10;
            break;
        case CONSTANTS.skill.Herblore:
            preservationChance += 0.2 * masteryLevel - 0.2;
            if (masteryLevel >= 99)
                preservationChance += 5;
            if (poolXp >= initial.poolLim[2])
                preservationChance += 5;
            break;
    }
    return preservationChance;
}

// Adjust interval based on unlocked bonuses
function intervalAdjustment(initial, poolXp, masteryXp, skillInterval) {
    let flatReduction = initial.flatIntervalReduction;
    let percentReduction = initial.percentIntervalReduction;
    let adjustedInterval = skillInterval;
    // compute mastery or pool dependent modifiers
    switch (initial.skillID) {
        case CONSTANTS.skill.Woodcutting:
            if (convertXpToLvl(masteryXp) >= 99) {
                flatReduction += 200;
            }
            break;
        case CONSTANTS.skill.Firemaking:
            if (poolXp >= initial.poolLim[1]) {
                percentReduction += 10;
            }
            percentReduction += convertXpToLvl(masteryXp) * 0.1;
            break;
        case CONSTANTS.skill.Mining:
            if (poolXp >= initial.poolLim[2]) {
                flatReduction += 200;
            }
            break;
        case CONSTANTS.skill.Crafting:
            if (poolXp >= initial.poolLim[2]) {
                adjustedInterval -= 200;
            }
            break;
        case CONSTANTS.skill.Fletching:
            if (poolXp >= initial.poolLim[3]) {
                adjustedInterval -= 200;
            }
            break;
        case CONSTANTS.skill.Agility:
            percentReduction += 3 * Math.floor(convertXpToLvl(masteryXp) / 10);
            break;
    }
    // apply modifiers
    adjustedInterval *= 1 - percentReduction / 100;
    adjustedInterval -= flatReduction;
    return Math.ceil(adjustedInterval);
}

// Adjust interval based on down time
// This only applies to Mining, Thieving and Agility
function intervalRespawnAdjustment(initial, currentInterval, poolXp, masteryXp, agiLapTime) {
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
            if (glovesTracker[CONSTANTS.shop.gloves.Thieving_Gloves].isActive
                && glovesTracker[CONSTANTS.shop.gloves.Thieving_Gloves].remainingActions > 0 // TODO: handle charge use
                && equippedItems[CONSTANTS.equipmentSlot.Gloves] === CONSTANTS.item.Thieving_Gloves) {
                successRate += 10;
            }
            successRate = Math.min(100, successRate) / 100;
            // stunTime = 3s + time of the failed action, since failure gives no xp or mxp
            let stunTime = 3000 + adjustedInterval;
            // compute average time per action
            adjustedInterval = adjustedInterval * successRate + stunTime * (1 - successRate);
            break;

        case CONSTANTS.skill.Agility:
            adjustedInterval = agiLapTime;
    }
    return Math.ceil(adjustedInterval);
}

// Adjust skill Xp based on unlocked bonuses
function skillXpAdjustment(initial, itemXp, itemID, poolXp, masteryXp) {
    let staticXpBonus = initial.staticXpBonus;
    switch (initial.skillID) {
        case CONSTANTS.skill.Herblore:
            if (poolXp >= initial.poolLim[1]) {
                staticXpBonus += 0.03;
            }
            break;
    }
    let xpMultiplier = 1;
    switch (initial.skillID) {
        case CONSTANTS.skill.Runecrafting:
            if (poolXp >= initial.poolLim[1] && items[itemID].type === "Rune") {
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
            if (glovesTracker[CONSTANTS.shop.gloves.Smithing_Gloves].isActive
                && glovesTracker[CONSTANTS.shop.gloves.Smithing_Gloves].remainingActions > 0 // TODO: handle charge use
                && equippedItems[CONSTANTS.equipmentSlot.Gloves] === CONSTANTS.item.Smithing_Gloves) {
                xpMultiplier += 0.5;
            }
            break;
        }
    }
    return itemXp * staticXpBonus * xpMultiplier;
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
        actions *= ETA.insigniaModifier;
    }
    if (skillID === CONSTANTS.skill.Cooking) {
        actions /= 1 - calcBurnChance(masteryXp);
    }
    return actions;
}

function isGathering(skillID) {
    return [
        CONSTANTS.skill.Woodcutting,
        CONSTANTS.skill.Fishing,
        CONSTANTS.skill.Mining,
        CONSTANTS.skill.Thieving,
        CONSTANTS.skill.Agility
    ].includes(skillID);
}

function initialVariables(skillID, checkTaskComplete) {
    let initial = {
        skillID: skillID,
        checkTaskComplete: checkTaskComplete,
        staticXpBonus: 1,
        flatIntervalReduction: 0,
        percentIntervalReduction: 0,
        skillReq: [], // Needed items for craft and their quantities
        recordCraft: Infinity, // Amount of craftable items for limiting resource
        hasMastery: skillID !== CONSTANTS.skill.Magic, // magic has no mastery, so we often check this
        multiple: ETA.SINGLE,
        // gathering skills are treated differently, so we often check this
        isGathering: isGathering(skillID),
        // Generate default values for script
        // skill
        skillXp: skillXP[skillID],
        targetLevel: ETASettings.getTargetLevel(skillID, skillLevel[skillID]),
        skillLim: [], // Xp needed to reach next level
        skillLimLevel: [],
        // mastery
        masteryLim: [], // Xp needed to reach next level
        masteryLimLevel: [0],
        totalMasteryLevel: 0,
        // pool
        poolXp: 0,
        targetPool: 0,
        targetPoolXp: 0,
        poolLim: [], // Xp need to reach next pool checkpoint
        staticPreservation: 0,
        maxPoolXp: 0,
        tokens: 0,
        poolLimCheckpoints: [10, 25, 50, 95, 100, Infinity], //Breakpoints for mastery pool bonuses followed by Infinity
        //////////////
        //DEPRECATED//
        //////////////
        masteryID: 0,
        masteryXp: 0,
        skillInterval: 0,
        itemID: undefined,
        itemXp: 0,
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
    // static preservation
    initial.staticPreservation += playerModifiers.increasedGlobalPreservationChance;
    initial.staticPreservation -= playerModifiers.decreasedGlobalPreservationChance;
    initial.staticPreservation += getTotalFromModifierArray("increasedSkillPreservationChance", skillID);
    initial.staticPreservation -= getTotalFromModifierArray("decreasedSkillPreservationChance", skillID)
    if (equippedItems.includes(CONSTANTS.item.Crown_of_Rhaelyx) && initial.hasMastery && !initial.isGathering) {
        initial.staticPreservation += items[CONSTANTS.item.Crown_of_Rhaelyx].baseChanceToPreserve; // Add base 10% chance
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
    for (let i of items[initial.itemID].smithReq) {
        const req = {...i};
        if (req.id === CONSTANTS.item.Coal_Ore && skillCapeEquipped(CONSTANTS.item.Smithing_Skillcape)) {
            req.qty /= 2;
        }
        initial.skillReq.push(req);
    }
    initial.masteryLimLevel = [20, 40, 60, 80, 99, Infinity]; // Smithing Mastery Limits
    return initial;
}

function configureFletching(initial) {
    initial.itemID = fletchingItems[initial.currentAction].itemID;
    initial.itemXp = items[initial.itemID].fletchingXP;
    initial.skillInterval = 2000;
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
    for (let i of items[initial.itemID].runecraftReq) {
        initial.skillReq.push(i);
    }
    initial.masteryLimLevel = [99, Infinity]; // Runecrafting has no Mastery bonus
    return initial;
}

function configureCrafting(initial) {
    initial.itemID = craftingItems[initial.currentAction].itemID;
    initial.itemXp = items[initial.itemID].craftingXP;
    initial.skillInterval = 3000;
    items[initial.itemID].craftReq.forEach(i => initial.skillReq.push(i));
    return initial;
}

function configureHerblore(initial) {
    initial.itemID = herbloreItemData[initial.currentAction].itemID[getHerbloreTier(initial.currentAction)];
    initial.itemXp = herbloreItemData[initial.currentAction].herbloreXP;
    initial.skillInterval = 2000;
    for (let i of items[initial.itemID].herbloreReq) {
        initial.skillReq.push(i);
    }
    return initial;
}

function configureCooking(initial) {
    initial.itemID = initial.currentAction;
    initial.itemXp = items[initial.itemID].cookingXP;
    initial.skillInterval = 3000;
    initial.skillReq = [{id: initial.itemID, qty: 1}];
    initial.masteryLimLevel = [99, Infinity]; //Cooking has no Mastery bonus
    initial.itemID = items[initial.itemID].cookedItemID;
    return initial;
}

function configureFiremaking(initial) {
    initial.itemID = initial.currentAction;
    initial.itemXp = logsData[initial.currentAction].xp * (1 + bonfireBonus / 100);
    initial.skillInterval = logsData[initial.currentAction].interval;
    initial.skillReq = [{id: initial.itemID, qty: 1}];
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
    initial.itemXp = ALTMAGIC[initial.currentAction].magicXP;
    return initial;
}

function configureGathering(initial) {
    initial.skillReq = [];
    initial.recordCraft = 0;
    initial.masteryID = initial.currentAction;
    return initial;
}

function configureMining(initial) {
    initial.itemID = miningData[initial.currentAction].ore;
    initial.itemXp = items[initial.itemID].miningXP;
    initial.skillInterval = 3000;
    return configureGathering(initial);
}

function configureThieving(initial) {
    initial.itemID = undefined;
    initial.itemXp = thievingNPC[initial.currentAction].xp;
    initial.skillInterval = 3000;
    return configureGathering(initial);
}

function configureWoodcutting(initial) {
    const wcAction = x => {
        return {
            itemID: x,
            itemXp: trees[x].xp,
            skillInterval: trees[x].interval,
            masteryID: x,
        };
    }
    if (!isNaN(initial.currentAction)) {
        initial.actions = [wcAction(initial.currentAction)];
    } else {
        initial.actions = initial.currentAction.map(x => wcAction(x));
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
    initial = configureGathering(initial);
    // correctly set masteryID
    initial.masteryID = fishingAreas[initial.currentAction].fish[initial.fishID];
    return initial
}

function configureAgility(initial) {
    const agiAction = x => {
        return {
            itemXp: agilityObstacles[x].completionBonuses.xp,
            skillInterval: agilityObstacles[x].interval,
            masteryID: x,
        };
    }
    if (!isNaN(initial.currentAction)) {
        initial.actions = [agiAction(initial.currentAction)];
    } else {
        initial.actions = initial.currentAction.map(x => agiAction(x));
    }
    return configureGathering(initial);
}

// Calculate mastery xp based on unlocked bonuses
function calcMasteryXpToAdd(initial, totalMasteryLevel, skillXp, masteryXp, poolXp, timePerAction, itemID) {
    const modifiedTimePerAction = getTimePerActionModifierMastery(initial.skillID, timePerAction, itemID);
    let xpModifier = initial.staticMXpBonus;
    // General Mastery Xp formula
    let xpToAdd = ((calcTotalUnlockedItems(initial.skillID, skillXp) * totalMasteryLevel) / getTotalMasteryLevelForSkill(initial.skillID) + convertXpToLvl(masteryXp) * (getTotalItemsInSkill(initial.skillID) / 10)) * (modifiedTimePerAction / 1000) / 2;
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
            if (initial.actions[0].masteryID !== i) {
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
    // Combine base and modifiers
    xpToAdd *= xpModifier;
    // minimum 1 mastery xp per action
    if (xpToAdd < 1) {
        xpToAdd = 1;
    }
    // BurnChance affects average mastery Xp
    if (initial.skillID === CONSTANTS.skill.Cooking) {
        let burnChance = calcBurnChance(masteryXp);
        xpToAdd *= (1 - burnChance);
    }
    // Fishing junk gives no mastery xp
    if (initial.skillID === CONSTANTS.skill.Fishing) {
        let junkChance = calcJunkChance(initial, masteryXp, poolXp);
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

function perAction(masteryXp, targetMasteryXp) {
    return {
        // mastery
        masteryXp: masteryXp,
        targetMasteryReached: masteryXp >= targetMasteryXp,
        targetMasteryTime: 0,
        targetMasteryResources: 0,
        // estimated number of actions taken so far
        actions: 0,
    }
}

function currentVariables(initial, resources) {
    let current = {
        actionCount: 0,
        activeTotalTime: 0,
        sumTotalTime: 0,
        // skill
        skillXp: initial.skillXp,
        targetSkillReached: initial.skillXp >= initial.targetXp,
        targetSkillTime: 0,
        targetSkillResources: 0,
        // pool
        poolXp: initial.poolXp,
        targetPoolReached: initial.poolXp >= initial.targetPoolXp,
        targetPoolTime: 0,
        targetPoolResources: 0,
        totalMasteryLevel: initial.totalMasteryLevel,
        // items
        chargeUses: 0, // estimated remaining charge uses
        tokens: initial.tokens,
        // stats per action
        actions: initial.actions.map(x => perAction(x.masteryXp, x.targetMasteryXp)),
        // available resources
        resources: resources,
    };
    // Check for Crown of Rhaelyx
    if (equippedItems.includes(CONSTANTS.item.Crown_of_Rhaelyx) && initial.hasMastery && !initial.isGathering) {
        let rhaelyxCharge = getQtyOfItem(CONSTANTS.item.Charge_Stone_of_Rhaelyx);
        current.chargeUses = rhaelyxCharge * 1000; // average crafts per Rhaelyx Charge Stone
    }
    return current;
}

function gainPerAction(initial, current, averageActionTime) {
    return current.actions.map((x, i) => {
        const gain = {
            xpPerAction: skillXpAdjustment(initial, initial.actions[i].itemXp, initial.actions[i].itemID, current.poolXp, x.masteryXp),
            masteryXpPerAction: 0,
            poolXpPerAction: 0,
            tokensPerAction: 0,
            tokenXpPerAction: 0,
        };

        if (initial.hasMastery) {
            gain.masteryXpPerAction = calcMasteryXpToAdd(initial, current.totalMasteryLevel, current.skillXp, x.masteryXp, current.poolXp, averageActionTime[i], initial.actions[i].itemID);
            gain.poolXpPerAction = calcPoolXpToAdd(current.skillXp, gain.masteryXpPerAction);
            gain.tokensPerAction = 1 / actionsPerToken(initial.skillID, current.skillXp, x.masteryXp);
            gain.tokenXpPerAction = initial.maxPoolXp / 1000 * gain.tokensPerAction;
        }
        return gain;
    });
}

// Actions until limit
function getLim(lims, xp, max) {
    const lim = lims.find(element => element > xp);
    if (xp < max && max < lim) {
        return Math.ceil(max);
    }
    return Math.ceil(lim);
}

function actionsToBreakpoint(initial, current, noResources = false) {
    // Adjustments
    const totalChanceToUse = 1 - initial.staticPreservation / 100
        - masteryPreservation(initial, current.actions[0].masteryXp, current.poolXp) / 100;
    const currentIntervals = current.actions.map((x, i) => intervalAdjustment(initial, current.poolXp, x.masteryXp, initial.actions[i].skillInterval));
    if (initial.skillID === CONSTANTS.skill.Agility) {
        current.agiLapTime = currentIntervals.reduce((a, b) => a + b, 0);
    }
    const averageActionTimes = current.actions.map((x, i) => intervalRespawnAdjustment(initial, currentIntervals[i], current.poolXp, x.masteryXp, current.agiLapTime));
    // Current Xp
    let gains = gainPerAction(initial, current, currentIntervals);

    // average gains
    const avgXpPerS = gains.map((x, i) => x.xpPerAction / averageActionTimes[i] * 1000).reduce((a, b) => a + b, 0);
    let avgPoolPerS = gains.map((x, i) => x.poolXpPerAction / averageActionTimes[i] * 1000).reduce((a, b) => a + b, 0);
    const masteryPerS = gains.map((x, i) => x.masteryXpPerAction / averageActionTimes[i] * 1000);
    const avgTokenXpPerS = gains.map((x, i) => x.tokenXpPerAction / averageActionTimes[i] * 1000).reduce((a, b) => a + b, 0);
    const avgTokensPerS = gains.map((x, i) => x.tokensPerAction / averageActionTimes[i] * 1000).reduce((a, b) => a + b, 0);
    // TODO rescale sequential gains ?

    // get time to next breakpoint
    // skill
    const skillXpToLimit = getLim(initial.skillLim, current.skillXp, initial.targetXp) - current.skillXp;
    const skillXpSeconds = skillXpToLimit / avgXpPerS;
    // mastery
    let masteryXpSeconds = Infinity;
    const allMasteryXpSeconds = [];
    if (initial.hasMastery) {
        initial.actions.forEach((x, i) => {
            const masteryXpToLimit = getLim(initial.skillLim, current.actions[i].masteryXp, x.targetMasteryXp) - current.actions[i].masteryXp;
            allMasteryXpSeconds.push(masteryXpToLimit / masteryPerS[i]);
        });
        masteryXpSeconds = Math.min(...allMasteryXpSeconds);
    }
    // pool
    let poolXpSeconds = Infinity;
    if (initial.hasMastery) {
        const poolXpToLimit = getLim(initial.poolLim, current.poolXp, initial.targetPoolXp) - current.poolXp;
        poolXpSeconds = poolXpToLimit / avgPoolPerS;
    }
    // resources
    let resourceSeconds = Infinity;
    // estimate actions remaining with current resources
    if (!noResources) {
        if (initial.actions.length > 1) {
            ETA.log('Attempting to simulate multiple different production actions at once, this is not implemented!')
        }
        // estimate amount of actions possible with remaining resources
        // number of actions with rhaelyx charges
        let resourceActions = Math.min(current.chargeUses, current.resources / (totalChanceToUse - ETA.rhaelyxChargePreservation));
        // remaining resources
        const resWithoutCharge = Math.max(0, current.resources - current.chargeUses * (totalChanceToUse - ETA.rhaelyxChargePreservation));
        // add number of actions without rhaelyx charges
        resourceActions = Math.ceil(resourceActions + resWithoutCharge / totalChanceToUse);
        resourceSeconds = resourceActions * averageActionTimes[0] / 1000;
    }

    // Minimum actions based on limits
    const rawExpectedS = Math.min(skillXpSeconds, masteryXpSeconds, poolXpSeconds, resourceSeconds)
    const expectedMS = Math.ceil(1000 * rawExpectedS);
    const expectedS = expectedMS / 1000;
    const expectedActions = averageActionTimes.map(x => expectedMS / x);
    // estimate total remaining actions
    if (!noResources) {
        current.actionCount += expectedActions[0];
    }

    // add token xp to pool xp if desired
    if (ETASettings.USE_TOKENS) {
        avgPoolPerS += avgTokenXpPerS;
    }

    // Take away resources based on expectedActions
    if (!initial.isGathering) {
        // Update remaining Rhaelyx Charge uses
        current.chargeUses -= expectedActions[0];
        if (current.chargeUses < 0) {
            current.chargeUses = 0;
        }
        // Update remaining resources
        if (rawExpectedS === resourceSeconds) {
            current.resources = 0; // No more limits
        } else {
            let resUsed = 0;
            if (expectedActions[0] < current.chargeUses) {
                // won't run out of charges yet
                resUsed = expectedActions[0] * Math.max(0, totalChanceToUse - ETA.rhaelyxChargePreservation);
            } else {
                // first use charges
                resUsed = current.chargeUses * Math.max(0, totalChanceToUse - ETA.rhaelyxChargePreservation);
                // remaining actions are without charges
                resUsed += (expectedActions[0] - current.chargeUses) * Math.max(0, totalChanceToUse);
            }
            current.resources = Math.round(current.resources - resUsed);
        }
    }

    // time for current loop
    // gain tokens, unless we're using them
    if (!ETASettings.USE_TOKENS) {
        current.tokens += avgTokensPerS * expectedS;
    }
    // Update time and Xp
    switch (initial.multiple) {
        case ETA.SINGLE:
            current.activeTotalTime += expectedMS / averageActionTimes[0] * currentIntervals[0];
            break;

        case ETA.PARALLEL:
            current.activeTotalTime += expectedMS / averageActionTimes.reduce((a, b) => (a + b), 0) * currentIntervals.reduce((a, b) => (a + b), 0);
            break;

        case ETA.SEQUENTIAL:
            const loopTime = averageActionTimes.reduce((a, b) => (a + b), 0) / currentIntervals.length;
            const activeTime = currentIntervals.reduce((a, b) => (a + b), 0);
            current.activeTotalTime += expectedMS / loopTime * activeTime;
            break;
    }
    current.sumTotalTime += expectedMS;
    current.skillXp += avgXpPerS * expectedS;
    current.actions.forEach((x, i) => current.actions[i].masteryXp += gains[i].masteryXpPerAction * expectedActions[i]);
    current.poolXp += avgPoolPerS * expectedS;
    // Time for target skill level, 99 mastery, and 100% pool
    if (!current.targetSkillReached && initial.targetXp <= current.skillXp) {
        current.targetSkillTime = current.sumTotalTime;
        current.targetSkillReached = true;
        current.targetSkillResources = initial.recordCraft - current.resources;
    }
    current.actions.forEach((x, i) => {
        if (!x.targetMasteryReached && initial.actions[i].targetMasteryXp <= x.masteryXp) {
            x.targetMasteryTime = current.sumTotalTime;
            x.targetMasteryReached = true;
            x.targetMasteryResources = initial.recordCraft - current.resources;
        }
    });
    if (!current.targetPoolReached && initial.targetPoolXp <= current.poolXp) {
        current.targetPoolTime = current.sumTotalTime;
        current.targetPoolReached = true;
        current.targetPoolResources = initial.recordCraft - current.resources;
    }
    // Update total mastery level
    current.totalMasteryLevel = initial.totalMasteryLevel;
    initial.actions.forEach((x, i) => {
        const y = current.actions[i];
        const masteryLevel = convertXpToLvl(y.masteryXp);
        if (x.masteryLevel !== masteryLevel) {
            // increase total mastery
            current.totalMasteryLevel += masteryLevel - x.masteryLevel;
            if (masteryLevel === 99 && x.lastMasteryLevel !== 99) {
                halveAgilityMasteryDebuffs(initial, initial.actions[i].masteryID);
            }
            x.lastMasteryLevel = masteryLevel;
        }
    });
    // return updated values
    return current;
}

function halveAgilityMasteryDebuffs(initial, id) {
    if (initial.skillID !== CONSTANTS.skill.Agility) {
        return;
    }
    // check if we need to halve one of the debuffs
    const m = agilityObstacles[id].modifiers;
    // xp
    initial.staticXpBonus += getBuff(m, 'decreasedGlobalSkillXP', 'decreasedSkillXP') / 100 / 2;
    // mxp
    initial.staticMXpBonus += getBuff(m, 'decreasedGlobalMasteryXP', 'decreasedMasteryXP') / 100 / 2;
    // interval
    initial.percentIntervalReduction += getBuff(m, 'increasedSkillIntervalPercent') / 2;
    initial.flatIntervalReduction += getBuff(m, 'increasedSkillInterval') / 2;
}

function getBuff(modifier, global, specific) {
    let change = 0;
    if (global && modifier[global]) {
        change += modifier[global];
    }
    if (specific && modifier[specific]) {
        modifier[specific].forEach(x => {
            if (x[0] === CONSTANTS.skill.Agility) {
                change += x[1];
            }
        });
    }
    return change;
}

function currentXpRates(initial) {
    let rates = {
        xpH: 0,
        masteryXpH: 0,
        poolH: 0,
        tokensH: 0,
        actionTime: 0,
    };
    initial.actions.forEach((x, i) => {
        const initialInterval = intervalAdjustment(initial, initial.poolXp, x.masteryXp, x.skillInterval);
        const initialAverageActionTime = intervalRespawnAdjustment(initial, initialInterval, initial.poolXp, x.masteryXp, initial.agiLapTime);
        rates.xpH += skillXpAdjustment(initial, x.itemXp, x.itemID, initial.poolXp, x.masteryXp) / initialAverageActionTime * 1000 * 3600;
        if (initial.hasMastery) {
            // compute current mastery xp / h using the getMasteryXpToAdd from the game or the method from this script
            // const masteryXpPerAction = getMasteryXpToAdd(initial.skillID, initial.masteryID, initialInterval);
            const masteryXpPerAction = calcMasteryXpToAdd(initial, initial.totalMasteryLevel, initial.skillXp, x.masteryXp, initial.poolXp, initialInterval, x.itemID);
            rates.masteryXpH += masteryXpPerAction / initialAverageActionTime * 1000 * 3600;
            // pool percentage per hour
            rates.poolH += calcPoolXpToAdd(initial.skillXp, masteryXpPerAction) / initialAverageActionTime * 1000 * 3600 / initial.maxPoolXp;
            rates.tokensH += 3600 * 1000 / initialAverageActionTime / actionsPerToken(initial.skillID, initial.skillXp, x.masteryXp);
        }
        rates.actionTime += initialInterval;
        rates.timePerAction = initialAverageActionTime;
    });
    return rates;
}

function getXpRates(initial, current) {
    // compute exp rates, either current or average until resources run out
    let rates = {};
    if (ETASettings.CURRENT_RATES || initial.recordCraft === 0) {
        // compute current rates
        rates = currentXpRates(initial);
    } else {
        // compute average rates until resources run out
        rates.xpH = (current.skillXp - initial.skillXp) * 3600 * 1000 / current.sumTotalTime;
        rates.masteryXpH = initial.actions.map((x, i) => (current.actions[i].masteryXp - x.masteryXp) * 3600 * 1000 / current.sumTotalTime);
        // average pool percentage per hour
        rates.poolH = (current.poolXp - initial.poolXp) * 3600 * 1000 / current.sumTotalTime / initial.maxPoolXp;
        rates.tokensH = (current.tokens - initial.tokens) * 3600 * 1000 / current.sumTotalTime;
        rates.actionTime = current.activeTotalTime / current.actionCount;
        rates.timePerAction = current.sumTotalTime / current.actionCount;
    }
    // each token contributes one thousandth of the pool and then convert to percentage
    rates.poolH = (rates.poolH + rates.tokensH / 1000) * 100;
    return rates;
}

// Calculates expected time, taking into account Mastery Level advancements during the craft
function calcExpectedTime(initial) {
    // initialize the expected time variables
    let current = currentVariables(initial, initial.recordCraft, initial.actions);

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
        actionCount: Math.floor(current.actionCount),
        finalSkillXp: current.skillXp,
        finalMasteryXp: current.actions.map(x => x.masteryXp),
        finalPoolXp: current.poolXp,
        finalPoolPercentage: poolXpToPercentage(current.poolXp),
        targetPoolTime: current.targetPoolTime,
        targetMasteryTime: current.actions.map(x => x.targetMasteryTime),
        targetSkillTime: current.targetSkillTime,
        rates: getXpRates(initial, current),
        tokens: current.tokens,
    };
    // continue calculations until time to all targets is found
    while (!current.targetSkillReached || (initial.hasMastery && (!current.actions.map(x => x.targetMasteryReached).reduce((a, b) => a && b, true) || !current.targetPoolReached))) {
        current = actionsToBreakpoint(initial, current, true);
    }
    // if it is a gathering skill, then set final values to the values when reaching the final target
    if (initial.isGathering) {
        expectedTime.finalSkillXp = current.skillXp;
        expectedTime.finalMasteryXp = current.actions.map(x => x.masteryXp);
        expectedTime.finalPoolXp = current.poolXp;
        expectedTime.finalPoolPercentage = poolXpToPercentage(current.poolXp);
        expectedTime.tokens = current.tokens;
    }
    // set time to targets
    expectedTime.targetSkillTime = current.targetSkillTime;
    expectedTime.targetMasteryTime = current.actions.map(x => x.targetMasteryTime);
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
        case CONSTANTS.skill.Agility:
            initial = configureAgility(initial);
            break;
    }
    // configure interval reductions
    initial.percentIntervalReduction += getTotalFromModifierArray("decreasedSkillIntervalPercent", initial.skillID);
    initial.percentIntervalReduction -= getTotalFromModifierArray("increasedSkillIntervalPercent", initial.skillID);
    initial.flatIntervalReduction += getTotalFromModifierArray("decreasedSkillInterval", initial.skillID);
    initial.flatIntervalReduction -= getTotalFromModifierArray("increasedSkillInterval", initial.skillID);
    if (initial.skillID === CONSTANTS.skill.Agility) {
        // add agility potion effect
        if (herbloreBonuses[26].bonus[0] === 0 && herbloreBonuses[26].charges > 0) {
            initial.percentIntervalReduction += herbloreBonuses[26].bonus[1];
        }
        // set initial lap time
        initial.agiLapTime = 0;
        if (initial.skillID === CONSTANTS.skill.Agility) {
            const poolXp = MASTERY[initial.skillID].pool;
            initial.agilityObstacles.forEach(x => {
                const masteryXp = MASTERY[initial.skillID].xp[x];
                const interval = agilityObstacles[x].interval;
                initial.agiLapTime += intervalAdjustment(initial, poolXp, masteryXp, interval);
            });
        }
    }
    // Configure initial mastery values for all skills with masteries
    if (initial.hasMastery) {
        // mastery
        initial.totalMasteryLevel = getCurrentTotalMasteryLevelForSkill(initial.skillID);
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

    // convert single action skills to `actions` format
    // TODO: put it in this format straight away and remove the duplication
    if (initial.actions === undefined) {
        initial.actions = [{
            itemID: initial.itemID,
            itemXp: initial.itemXp,
            skillInterval: initial.skillInterval,
            masteryID: initial.masteryID, // this might still be undefined at this point
        }];
    }

    // further configure the `actions`
    initial.actions.forEach(x => {
        if (initial.hasMastery) {
            if (!initial.isGathering) {
                x.masteryID = items[x.itemID].masteryID[1];
            }
            x.masteryXp = MASTERY[initial.skillID].xp[x.masteryID];
            x.masteryLevel = convertXpToLvl(x.masteryXp);
            x.lastMasteryLevel = x.masteryLevel;
            x.targetMastery = ETASettings.getTargetMastery(initial.skillID, convertXpToLvl(x.masteryXp));
            x.targetMasteryXp = convertLvlToXp(x.targetMastery);
        }
    });

    // Get itemXp Bonuses from gear and pets
    initial.staticXpBonus = getStaticXPBonuses(initial.skillID);
    initial.staticMXpBonus = getStaticMXPBonuses(initial.skillID);

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

function getStaticXPBonuses(skill) {
    let xpMultiplier = 1;
    xpMultiplier += getTotalFromModifierArray("increasedSkillXP", skill) / 100;
    xpMultiplier -= getTotalFromModifierArray("decreasedSkillXP", skill) / 100;
    xpMultiplier += (playerModifiers.increasedGlobalSkillXP - playerModifiers.decreasedGlobalSkillXP) / 100;
    return xpMultiplier;
}

function getStaticMXPBonuses(skill) {
    let xpMultiplier = 1;
    xpMultiplier += getTotalFromModifierArray("increasedMasteryXP", skill) / 100;
    xpMultiplier -= getTotalFromModifierArray("decreasedMasteryXP", skill) / 100;
    xpMultiplier += (playerModifiers.increasedGlobalMasteryXP - playerModifiers.decreasedGlobalMasteryXP) / 100;
    return xpMultiplier;
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
    if (timeLeftElement !== null) {
        generateTooltips(initial, ms, results, timeLeftElement, now, {noMastery: initial.actions.length > 1});
    }
    if (initial.actions.length > 1) {
        const actions = [...initial.actions];
        const currentActions = [...initial.currentAction];
        actions.forEach((a, i) => {
            initial.actions = [a];
            initial.currentAction = currentActions[i];
            const singleTimeLeftElement = injectHTML(initial, {rates: currentXpRates(initial)}, ms.resources, now, false);
            if (singleTimeLeftElement !== null) {
                const aux = {
                    finalMasteryXp: [results.finalMasteryXp[i]],
                    current: {actions: [{targetMasteryResources: 0}]},
                }
                generateTooltips(initial, {mastery: results.current.actions[i].targetMasteryTime}, aux, singleTimeLeftElement, now, {
                    noSkill: true,
                    noPool: true
                });
            }
        });
        //reset
        initial.actions = actions;
        initial.currentAction = currentActions;
    }

    // TODO fix this for woodcutting and agility
    if (initial.actions.length === 1) {
        // Set global variables to track completion
        let times = [];
        if (!initial.isGathering) {
            times.push(ETA.time(ETASettings.DING_RESOURCES, 0, -ms.resources, "Processing finished."));
        }
        times.push(ETA.time(ETASettings.DING_LEVEL, initial.targetLevel, convertXpToLvl(initial.skillXp), "Target level reached."));
        if (initial.hasMastery) {
            initial.actions.forEach((x, i) =>
                times.push(ETA.time(ETASettings.DING_MASTERY, x.targetMastery, convertXpToLvl(x.masteryXp), "Target mastery reached."))
            );
            times.push(ETA.time(ETASettings.DING_POOL, initial.targetPool, 100 * initial.poolXp / initial.maxPoolXp, "Target pool reached."));
        }
        ETA.setTimeLeft(initial, times);
        if (initial.checkTaskComplete) {
            ETA.taskComplete();
        }
        if (!initial.isGathering) {
            generateProgressBars(initial, results, 0 /*TODO add proper action index here, usually it's 0 though*/);
        }
    }
}

function injectHTML(initial, results, msLeft, now, initialRun = true) {
    let timeLeftElementId = `timeLeft${skillName[initial.skillID]}`;
    if (initial.actions.length > 1) {
        timeLeftElementId += "-Secondary";
    } else if (initial.isGathering) {
        timeLeftElementId += "-" + initial.currentAction;
    }
    const timeLeftElement = document.getElementById(timeLeftElementId);
    if (timeLeftElement === null) {
        switch (initial.skillID) {
            case CONSTANTS.skill.Thieving:
                ETA.makeThievingDisplay();
                break;
            case CONSTANTS.skill.Agility:
                ETA.makeAgilityDisplay();
                break;
        }
        if (initialRun) {
            // try running the method again
            return injectHTML(initial, results, msLeft, now, false);
        }
        return null;
    }
    let finishedTime = addMSToDate(now, msLeft);
    timeLeftElement.textContent = "";
    if (ETASettings.SHOW_XP_RATE) {
        timeLeftElement.textContent = "Xp/h: " + formatNumber(Math.floor(results.rates.xpH));
        if (initial.hasMastery) {
            timeLeftElement.textContent += "\r\nMXp/h: " + formatNumber(Math.floor(results.rates.masteryXpH))
                + `\r\nPool/h: ${results.rates.poolH.toFixed(2)}%`
        }
    }
    if (ETASettings.SHOW_ACTION_TIME) {
        timeLeftElement.textContent += "\r\nAction time: " + formatNumber(Math.ceil(results.rates.actionTime) / 1000) + 's';
        timeLeftElement.textContent += "\r\nActions/h: " + formatNumber(Math.round(100 * 3600 * 1000 / Math.floor(results.rates.timePerAction)) / 100);
    }
    if (!initial.isGathering) {
        if (msLeft === 0) {
            timeLeftElement.textContent += "\r\nNo resources!";
        } else {
            timeLeftElement.textContent += "\r\nActions: " + formatNumber(results.actionCount)
                + "\r\nTime: " + msToHms(msLeft)
                + "\r\nETA: " + dateFormat(now, finishedTime);
        }
    }
    initial.actions.map(x => {
        if ((initial.isGathering || initial.skillID === CONSTANTS.skill.Cooking) && x.itemID !== undefined) {
            const youHaveElementId = timeLeftElementId + "-YouHave";
            $("#" + youHaveElementId).replaceWith(''
                + `<small id="${youHaveElementId}">`
                + `<span>You have: ${formatNumber(getQtyOfItem(x.itemID))}</span>`
                + `<img class="skill-icon-xs mr-2" src="${items[x.itemID].media}">`
                + "</small>"
            );
        }
    });
    timeLeftElement.style.display = "block";
    return timeLeftElement;
}

function generateTooltips(initial, ms, results, timeLeftElement, now, flags = {}) {
    // Generate progression Tooltips
    if (!timeLeftElement._tippy) {
        tippy(timeLeftElement, {
            allowHTML: true,
            interactive: false,
            animation: false,
        });
    }
    let tooltip = '';
    // level tooltip
    if (!flags.noSkill) {
        const finalLevel = convertXpToLvl(results.finalSkillXp, true)
        const levelProgress = getPercentageInLevel(results.finalSkillXp, results.finalSkillXp, "skill");
        tooltip += finalLevelElement(
            'Final Level',
            formatLevel(finalLevel, levelProgress) + ' / 99',
            'success',
        ) + tooltipSection(initial, now, ms.skill, initial.targetLevel, results.current.targetSkillResources);
    }
    // mastery tooltip
    if (!flags.noMastery && initial.hasMastery) {
        // don't show mastery target when combining multiple actions
        const finalMastery = convertXpToLvl(results.finalMasteryXp[0]);
        const masteryProgress = getPercentageInLevel(results.finalMasteryXp[0], results.finalMasteryXp[0], "mastery");
        tooltip += finalLevelElement(
            'Final Mastery',
            formatLevel(finalMastery, masteryProgress) + ' / 99',
            'info',
        ) + tooltipSection(initial, now, ms.mastery, initial.actions[0].targetMastery, results.current.actions.map(x => x.targetMasteryResources));
    }
    // pool tooltip
    if (!flags.noPool && initial.hasMastery) {
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

function generateProgressBars(initial, results, idx) {
    // skill
    const skillProgress = getPercentageInLevel(initial.skillXp, results.finalSkillXp, "skill", true);
    $(`#skill-progress-bar-end-${initial.skillID}`).css("width", skillProgress + "%");
    // mastery
    if (initial.hasMastery) {
        const masteryProgress = getPercentageInLevel(initial.actions[idx].masteryXp, results.finalMasteryXp[idx], "mastery", true);
        $(`#${initial.skillID}-mastery-pool-progress-end`).css("width", masteryProgress + "%");
        // pool
        const poolProgress = (results.finalPoolPercentage > 100) ?
            100 - ((initial.poolXp / initial.maxPoolXp) * 100) :
            (results.finalPoolPercentage - ((initial.poolXp / initial.maxPoolXp) * 100)).toFixed(4);
        $(`#mastery-pool-progress-end-${initial.skillID}`).css("width", poolProgress + "%");
    }
}
