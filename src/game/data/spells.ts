import type { BuffApply, Effect, Element, FieldId, School, SpellDef, StatusApply, StatusId, Stats } from "../types";

const st = (id: StatusId, chance: number, turns: number, power?: number): StatusApply => ({ id, chance, turns, power });
const dm = (power: number, element: Element, x: Partial<Effect> = {}): Effect => ({ kind: "damage", stat: "mag", power, element, ...x });
const bf = (id: string, name: string, turns: number, mods: Partial<Stats> = {}, flags: string[] = [], x: Partial<BuffApply> = {}): Effect => ({ kind: "buff", buff: { id, name, turns, mods, flags, ...x } });
const su = (name: string, level: number, turns: number, x: Partial<NonNullable<Effect["summon"]>> = {}): Effect => ({ kind: "summon", summon: { name, level, turns, ...x } });
const hl = (power: number, x: Partial<Effect> = {}): Effect => ({ kind: "heal", stat: "mag", power, ...x });
const de = (s: StatusApply, aoe = false, x: Partial<Effect> = {}): Effect => ({ kind: "debuff", status: s, aoe, ...x });
const ut = (utility: string, x: Partial<Effect> = {}): Effect => ({ kind: "utility", utility, ...x });
const fx = (field: FieldId, turns: number): Effect => ({ kind: "field", field, turns });
const tp = (name: string, power: number, element: Element, x: { aoe?: boolean; homing?: boolean } = {}): Effect => ({ kind: "trap", trap: { name, power, element, ...x } });
const cl = (cleanse?: StatusId[]): Effect => ({ kind: "cleanse", cleanse });
const aoeBuff = (e: Effect): Effect => ({ ...e, aoe: true }); // also buffs every summon

export const mpCost = (tier: number) => (tier === 0 ? 3 : tier >= 11 ? 0 : Math.round(5 + tier * tier * 3.3));

const A: School[] = ["arcane"], D: School[] = ["divine"], N: School[] = ["nature"], X: School[] = ["necro"];
const AD: School[] = ["arcane", "divine"], AN: School[] = ["arcane", "nature"], AX: School[] = ["arcane", "necro"];
const DN: School[] = ["divine", "nature"], DX: School[] = ["divine", "necro"], NX: School[] = ["nature", "necro"];
const ADN: School[] = ["arcane", "divine", "nature"];
const ANY: School[] = ["arcane", "divine", "nature", "necro"];

/** Families that 'Person' magic (Charm Person, Dominate Person) works on. */
const HUMANOID = ["human", "goblin", "giant", "player"];
const MAGIC_WARD: Partial<Record<Element, number>> = { fire: 0.2, ice: 0.2, lightning: 0.2, acid: 0.2, holy: 0.2, unholy: 0.2, void: 0.2 };
const DISTURB_WARD: Partial<Record<Element, number>> = { fire: 0.5, ice: 0.5, lightning: 0.5, acid: 0.5, holy: 0.5, unholy: 0.5, void: 0.5, poison: 0.5 };
const ARMORED = ["construct", "human", "player", "giant"];

function sp(id: string, name: string, tier: number, schools: School[], desc: string, effect: Effect, extra: Partial<SpellDef> = {}): SpellDef {
  return { id, name, tier, schools, mp: mpCost(tier), desc, effect, ...extra };
}

export const SPELLS: SpellDef[] = [
  // ═══ 0th tier (cantrips) ═══
  sp("spark", "Spark", 0, A, "A tiny burst of arcane energy.", dm(0.7, "void")),
  sp("minor_mend", "Minor Mend", 0, D, "Mends small wounds.", hl(0.8)),
  sp("thorn_prick", "Thorn Prick", 0, N, "Shoots a sharp thorn.", dm(0.7, "pierce")),
  sp("chill_touch", "Chill Touch", 0, X, "A touch of negative energy.", dm(0.7, "unholy")),
  sp("continual_light", "Continual Light", 0, AD, "Summons a magic light whose brightness you can adjust. In battle it lights up the field and reveals invisible foes.", { kind: "debuff", special: "reveal", aoe: true }, { noMeta: true }),
  sp("lifestyle_magic", "Lifestyle Magic", 0, ANY, "Warms one bowl or plate of food. It costs as much mana as a 1st-tier spell, so it's rarely used. Out of battle: a hot meal restores 10% HP and grants Well Fed (+5% max HP).", ut("lifestyle"), { mp: mpCost(1) }),
  // ═══ 1st tier ═══
  sp("magic_arrow", "Magic Arrow", 1, A, "Arrows of pure mana that are guaranteed to hit (even invisible foes). You fire one per tier you can cast, up to 10 — Momonga fires 10. Each arrow is minuscule, but they add up.", dm(0.42, "void", { magicArrow: true, unblockable: true })),
  sp("destruction_water", "Destruction Water", 1, AN, "Makes water vanish instantly. Weaker than other 1st-tier spells against most living things, but it devastates water elementals, water spirits and slimes.", dm(0.75, "void", { bonusVs: { families: ["elemental", "spirit", "slime"], elements: ["ice", "acid"], mult: 3 } })),
  sp("light_healing", "Light Healing", 1, D, "Heals wounds with a soothing, warm green light. Damages the undead.", hl(1.2)),
  sp("ray_negative", "Ray of Negative Energy", 1, X, "A beam of dark power. Hurts the living and heals the undead.", dm(1.0, "unholy")),
  sp("acorn_burst", "Acorn Burst", 1, N, "Explosive seeds.", dm(1.0, "blunt")),
  sp("sleep", "Sleep", 1, A, "Forces a target to want to sleep (it skips its turns). A light sleep: any damage wakes it, and its allies may shake it awake. Fails on the undead, constructs and the mentally immune.", de(st("sleep", 0.65, 3, 1))),
  sp("charm_person", "Charm Person", 1, A, "The target sees you as its best friend and fights for you. Humanoids only (humans, goblins, giants). Low-level: it can't brainwash, and hurting the target breaks the charm.", de(st("charm", 0.5, 3), false, { onlyFamilies: HUMANOID })),
  sp("entangle", "Entangle", 1, N, "Vines hold a foe in place.", de(st("stun", 0.5, 1))),
  sp("ghost_sound", "Ghost Sound", 1, A, "Illusory sounds confuse and mislead a target: it may lash out at its own allies.", de(st("insanity", 0.45, 1))),
  sp("flash", "Flash", 1, AD, "Your body flares with bright, searing light that may blind every foe (blinded foes often miss).", de(st("blind", 0.5, 2), true)),
  sp("summon_undead_1", "Summon Undead 1st", 1, X, "Summons zombie animals.", su("Zombie Hound", -12, 5, { element: "slash" })),
  sp("summon_monster_1", "Summon Monster 1st", 1, AN, "Summons a low-level Lesser Air Elemental. First-tier summons only exist for a short time.", su("Lesser Air Elemental", -12, 3, { element: "lightning" })),
  sp("bless", "Bless", 1, D, "+10% ATK/MAG/DEF for 5 turns.", bf("bless", "Bless", 5, { atk: 10, mag: 10, def: 10 })),
  sp("anti_evil", "Anti-Evil Protection", 1, AD, "Defends against evil beings: attacks from creatures with negative karma deal 25% less damage. +10% RES for 6 turns.", bf("anti_evil", "Anti-Evil Protection", 6, { res: 10 }, ["anti_evil"])),
  sp("quick_march", "Quick March", 1, AN, "Instantly raises movement speed by about 20%: +20% AGI for 5 turns.", bf("quick_march", "Quick March", 5, { agi: 20 })),
  sp("magic_weapon", "Magic Weapon", 1, AD, "Temporarily enchants your weapon and sharpens its edge: +15% ATK for 5 turns.", bf("magic_weapon", "Magic Weapon", 5, { atk: 15 })),
  sp("bunny_tail", "Bunny Tail", 1, A, "Lowers aggression toward you. Non-boss enemies sometimes lose interest in attacking you, and random encounters are less likely while it lasts.", bf("bunny_tail", "Bunny Tail", 4, {}, ["low_aggro"])),
  sp("rabbit_ears", "Rabbit Ears", 1, A, "Enhances your hearing: you hear invisible foes (no misses against them), and you can't be ambushed while resting in the wild.", bf("rabbit_ears", "Rabbit Ears", 6, {}, ["keen_ears"])),
  sp("rabbit_foot", "Rabbit Foot", 1, A, "Increases your luck: +10% crit chance, and better odds of extra loot from your next victory.", bf("rabbit_foot", "Rabbit Foot", 6, {}, ["lucky"])),
  sp("camouflage", "Camouflage", 1, AN, "Your skin changes color to blend with your surroundings. In battle: evasion for 2 turns. Outside battle: your next 3 moves will likely slip past random encounters.", bf("camouflage", "Camouflage", 2, {}, ["evade"]), { ooc: "stealth:3" }),
  sp("odorless", "Odorless", 1, N, "Hides your scent so nothing can track you: your next 3 moves will likely slip past random encounters.", ut("stealth:3")),
  sp("discern_enemy", "Discern Enemy", 1, ANY, "Identifies a foe's estimated level and power: exact stats, hidden abilities (teleport, summon, time stop, instant death), resistances and active magic. A free action in battle.", ut("discern")),
  sp("detect_magic", "Detect Magic", 1, AD, "Detects magical traps and hidden magic items around you. Out of battle: reveals this area's hidden cache (once per area per day) and any mines you've laid.", ut("detect_magic")),
  sp("appraisal", "Appraisal Magic Item", 1, A, "'cast appraisal <item>': identifies an item, revealing its durability and history. Appraised items sell for 30% more.", ut("appraise")),
  sp("alarm", "Alarm", 1, AN, "A warning ward around your camp. For the next 8 in-game hours, resting in the wild can't be ambushed. Small area only.", ut("alarm")),
  sp("clean", "Clean", 1, AD, "Cleans your clothes and equipment; the Slane Theocracy's Cardinals use it daily. Out of battle: removes poison, bleeding, burns and disease.", ut("clean")),
  sp("create_water", "Create Water", 1, DN, "Lifestyle magic that creates sweet, drinkable water; the volume grows with your skill. Out of battle: restores 15% HP and puts out burns.", ut("create_water")),
  sp("compass", "Compass", 1, AN, "A ghostly needle points the way. 'cast compass <area|boss|town>': the next step and distance to a place in this world (default: the nearest town).", ut("compass")),
  sp("repair", "Repair", 1, A, "'cast repair <item>': mends a damaged or broken item. Each repair lowers the item's value by 10%, so it's not recommended too often.", ut("repair")),
  // ═══ 2nd tier ═══
  sp("acid_arrow", "Acid Arrow", 2, A, "A single-target bolt of caustic acid.", dm(1.25, "acid", { status: st("defdown", 0.3, 3) })),
  sp("shockwave", "Shock Wave", 2, A, "An invisible shock wave that distorts the air and crushes full plate armor (Ainz used it on castle gates). Ignores 40% of defense; extra damage to constructs and armored foes.", dm(1.2, "blunt", { pierce: 0.4, bonusVs: { families: ARMORED, mult: 1.25 } })),
  sp("thunderlance", "Thunderlance", 2, A, "Fires thunder like a lance, piercing 30% of the target's resistance.", dm(1.35, "lightning", { pierce: 0.3 })),
  sp("crystal_dagger", "Crystal Dagger", 2, A, "A crystal dagger appears in mid-air and shoots out. Purely physical, typeless damage that can't be resisted.", dm(1.15, "none", { pierce: 0.3 })),
  sp("acid_splash", "Acid Splash", 2, AN, "Launches a pool of acid over the enemy line.", dm(0.95, "acid", { aoe: true })),
  sp("water_splash", "Water Splash", 2, N, "A ball of water slams into the target. Extra damage to fire elementals.", dm(1.25, "blunt", { bonusVs: { families: ["elemental"], elements: ["fire"], mult: 1.6 } })),
  sp("poison_bomb", "Poison Bomb", 2, NX, "Poisonous damage to one foe.", dm(1.1, "poison", { status: st("poison", 0.7, 3, 0.04) })),
  sp("sharp_cutting_talisman", "Sharp Cutting Talisman", 2, AN, "An onmyoji talisman that slices up the target's body.", dm(1.2, "slash", { status: st("bleed", 0.4, 2, 0.03) })),
  sp("open_wounds", "Open Wounds", 2, X, "Worsens wounds: heavy bleeding.", dm(0.9, "slash", { status: st("bleed", 0.85, 3, 0.045) })),
  sp("flame_blade", "Flame Blade", 2, N, "A burning scimitar of fire.", dm(1.3, "fire")),
  sp("middle_cure", "Middle Cure Wounds", 2, D, "Moderate healing.", hl(1.7)),
  sp("fear", "Fear", 2, X, "Fills a target with terror (−30% damage, and it may cower).", de(st("fear", 0.7, 3))),
  sp("scare", "Scare", 2, X, "Induces fear in every foe.", de(st("fear", 0.45, 2), true)),
  sp("blindness", "Blindness", 2, AX, "Temporarily blinds a foe: its physical attacks often miss.", de(st("blind", 0.7, 3))),
  sp("hypnotism", "Hypnotism", 2, A, "Hypnotizes a target into a deep trance (a deep sleep that only damage breaks).", de(st("sleep", 0.55, 2, 2))),
  sp("silence", "Silence", 2, AD, "Eliminates sound in an area. Silenced foes can't cast: their spells, heals, summons and teleports fail.", de(st("silence", 0.6, 2), true)),
  sp("twine_plant", "Twine Plant", 2, N, "Vines burst from the ground and entangle a foe: held foes can't act until they break free.", de(st("hold", 0.65, 2))),
  sp("soften_steel", "Soften Steel", 2, A, "Softens a foe's armor: −30% DEF.", de(st("defdown", 0.75, 3))),
  sp("disease", "Disease", 2, X, "Inflicts a wasting illness: damage every turn, and the target hits 15% softer.", de(st("disease", 0.65, 4, 0.03))),
  sp("turn_undead", "Turn Undead", 2, D, "Repels or exorcises the undead depending on the gap in strength: undead far below your level are destroyed outright; the rest are seared and flee in terror, mindless or not.", { kind: "debuff", special: "turn_undead", aoe: true, stat: "mag", power: 1.0, onlyFamilies: ["undead"] }),
  sp("summon_angel_2", "Summon Angel 2nd", 2, D, "Summons Angel Guardians.", su("Angel Guardian", -10, 5, { count: 2, element: "holy" })),
  sp("lesser_strength", "Lesser Strength", 2, A, "Raises the target's strength: +20% ATK for 5 turns.", bf("lesser_str", "Lesser Strength", 5, { atk: 20 })),
  sp("lesser_dex", "Lesser Dexterity", 2, A, "Raises the target's dexterity: +20% AGI for 5 turns.", bf("lesser_dex", "Lesser Dexterity", 5, { agi: 20 })),
  sp("harden_steel", "Harden Steel", 2, A, "Increases the target's offensive power: +18% ATK for 5 turns.", bf("harden_steel", "Harden Steel", 5, { atk: 18 })),
  sp("reinforce_armor", "Reinforce Armor", 2, AD, "Raises the target's defense: +20% DEF for 5 turns.", bf("reinforce_armor", "Reinforce Armor", 5, { def: 20 })),
  sp("hawk_eye", "Hawk Eye", 2, AN, "Strengthens your vision to see far-off things up close: +10% crit chance and +10% AGI, and blindness can't make you miss.", bf("hawk_eye", "Hawk Eye", 5, { agi: 10 }, ["hawk_eye"])),
  sp("see_invisibility", "See Invisibility", 2, A, "Lets you see the invisible: no misses against invisible foes for 8 turns.", bf("see_invis", "See Invisibility", 8, {}, ["true_sight"])),
  sp("dark_vision", "Dark Vision", 2, AX, "Grants night vision: blindness and darkness can't make you miss.", bf("dark_vision", "Dark Vision", 8, {}, ["darkvision"], { traits: ["darkvision"] })),
  sp("invisibility", "Invisibility", 2, A, "Turn invisible: evade attacks for 3 turns. Outside battle: your next 4 moves will likely avoid random encounters.", bf("invis", "Invisibility", 3, {}, ["evade"]), { ooc: "stealth:4" }),
  sp("fog_cloud", "Fog Cloud", 2, AN, "A bank of fog covers the battlefield, blinding every foe.", de(st("blind", 0.55, 2), true)),
  sp("prot_negative", "Protection of Energy Negative", 2, D, "Limited protection from negative-energy spells and skills: −40% unholy damage (life drain, negative rays) for 6 turns.", bf("prot_negative", "Protection of Energy Negative", 6, {}, [], { ward: { unholy: 0.4 } })),
  sp("lesser_prot_energy", "Lesser Protection Energy", 2, ADN, "Reduces all energy damage (fire, ice, lightning, acid, holy, negative) by 15% for 6 turns.", bf("lesser_prot_energy", "Lesser Protection Energy", 6, {}, [], { ward: { fire: 0.15, ice: 0.15, lightning: 0.15, acid: 0.15, holy: 0.15, unholy: 0.15 } })),
  sp("temperature_change", "Temperature Change", 2, AN, "Lifestyle magic that makes water or a room comfortable: −15% fire and ice damage for 6 turns.", bf("temp_change", "Temperature Change", 6, {}, [], { ward: { fire: 0.15, ice: 0.15 } })),
  sp("cure_disease", "Cure Disease", 2, DN, "Cures disease and poison. Not strong enough for cursed sicknesses like Demon Fever (despair).", cl(["disease", "poison"])),
  sp("detect_life", "Detect Life", 2, DN, "Senses whether something is alive. Out of battle: what lives here and in neighboring areas. In battle (free action): tells living foes from undead and constructs.", ut("detect_life")),
  sp("detect_undead", "Detect Undead", 2, DX, "Identifies the undead. Out of battle: undead here and nearby. In battle (free action): marks which foes are undead.", ut("detect_undead")),
  sp("floating_eye", "Floating Eye", 2, A, "A floating eye scouts every neighboring area: monsters, level range and bosses.", ut("floating_eye")),
  sp("mass_compass", "Mass Compass", 2, AN, "A multi-target [Compass]: the full route to a place in this world. 'cast mass compass <area|boss|town>'.", ut("mass_compass")),
  sp("message", "Message", 2, AD, "Telepathic communication. 'cast message' reaches the Adventurers' Guild for news of this world's bosses; 'cast message <name>' calls someone. If they're in the game, you'll hear a call tone.", ut("message")),
  // ═══ 3rd tier ═══
  sp("fireball", "Fireball", 3, A, "A classic exploding sphere of fire that hits all enemies.", dm(1.15, "fire", { aoe: true, status: st("burn", 0.3, 2, 0.03) })),
  sp("lightning", "Lightning", 3, A, "A bolt from your fingertip that pierces every enemy in a line. Extra effective against metal armor.", dm(1.1, "lightning", { aoe: true, bonusVs: { families: ARMORED, mult: 1.25 } })),
  sp("electrosphere", "Electrosphere", 3, A, "A ball of lightning in your palm shoots out and scatters over a wide area.", dm(1.1, "lightning", { aoe: true, status: st("stun", 0.15, 1) })),
  sp("iceball", "Iceball", 3, A, "A large ball of ice that bursts over all enemies.", dm(1.1, "ice", { aoe: true, status: st("slow", 0.25, 2) })),
  sp("thunderball", "Thunderball", 3, AN, "An exploding sphere of thunder over all enemies.", dm(1.15, "lightning", { aoe: true })),
  sp("call_lightning", "Call Lightning", 3, N, "Calls lightning from the sky.", dm(1.7, "lightning")),
  sp("holy_light", "Holy Light", 3, D, "Divine light that does full damage to evil creatures.", dm(1.45, "holy", { bonusVs: { evil: true, mult: 1.3 } })),
  sp("sunlight", "Sunlight", 3, D, "Blinds the target and sears the undead.", dm(1.3, "holy", { status: st("blind", 0.5, 2), bonusVs: { families: ["undead"], mult: 1.3 } })),
  sp("explosive_talisman", "Explosive Talisman", 3, AN, "A talisman that explodes violently enough to send enemies flying (may stun).", dm(1.5, "fire", { status: st("stun", 0.3, 1) })),
  sp("lightning_bird_talisman", "Lightning Bird Talisman", 3, AN, "The talisman becomes a bird discharging pale shocks; its glare can blind.", dm(1.45, "lightning", { status: st("blind", 0.35, 2) })),
  sp("shard_buckshot", "Shard Buck Shots", 3, A, "Fist-sized crystal shards in a scattered cone: 4 sharp hits, brutal up close.", dm(0.5, "pierce", { hits: 4 })),
  sp("slow", "Slow", 3, A, "Slows a foe's movements.", de(st("slow", 0.8, 3))),
  sp("sandmans_sand", "Sandman's Sand", 3, A, "A deeper sleep than [Sleep] on every foe: shaking won't wake them, only damage will.", de(st("sleep", 0.6, 3, 2), true)),
  sp("earth_bind", "Earth Bind", 3, N, "Chains of mud fly at the target and bind it.", de(st("hold", 0.7, 3))),
  sp("lopsided_duel", "Lopsided Duel", 3, A, "Binds you to an enemy. If it tries to teleport away you're dragged along and the fight goes on... possibly among its friends. It never stops YOU from teleporting away.", de(st("bound", 0.85, 99))),
  sp("dispel", "Dispel Magic", 3, AD, "Strips magic from a foe: empowering buffs, invisibility, and any dimensional seal it put on you. 'cast dispel me' removes magical afflictions from yourself instead. Success depends on your level vs. theirs.", { kind: "dispel", power: 1 }),
  sp("heavy_recover", "Heavy Recover", 3, D, "Divine healing that flows as long as your mana holds.", hl(2.0)),
  sp("mass_cure_light", "Mass Cure Light Wounds", 3, DN, "Heals you and all your summons.", hl(1.3, { aoe: true })),
  sp("remove_affliction", "Remove Affliction", 3, D, "Removes poison, burn, fear and other ailments.", { kind: "cleanse" }),
  sp("animate_dead", "Animate Dead", 3, X, "Raises fallen enemies as zombies: one per corpse on the battlefield (up to 3).", su("Animated Corpse", -6, 6, { corpses: true, element: "blunt" })),
  sp("create_undead", "Create Undead", 3, X, "Spawns a low-tier undead minion.", su("Created Ghoul", -8, 6, { element: "slash" })),
  sp("summon_undead_3", "Summon Undead 3rd", 3, X, "Summons Skeletal Warriors.", su("Skeletal Warrior", -9, 6, { count: 2, element: "slash" })),
  sp("summon_angel_3", "Summon Angel 3rd", 3, D, "Summons Archangel Flame, the favorite of the Sunlight Scripture.", su("Archangel Flame", -8, 6, { count: 2, element: "fire" })),
  sp("summon_monster_3", "Summon Monster 3rd", 3, AN, "Summons a huge, glowing black-furred wolf that breathes flame and smells of sulfur.", su("Summoned Hellhound", -8, 6, { element: "fire" })),
  sp("spider_talisman", "Spider Talisman", 3, AN, "Entoma's talismans: an enormous spider appears the moment they hit the ground. Handy for buying time.", su("Giant Talisman Spider", -8, 5, { element: "poison", taunt: true })),
  sp("wall_of_stone", "Wall of Stone", 3, N, "Stone walls 2-3 meters high rise around you and take blows for you. Spell-interrupting: enemy casters may be disrupted.", su("Wall of Stone", -6, 4, { taunt: true, mult: 0.7, element: "blunt", interrupt: true })),
  sp("fly", "Fly", 3, A, "Take to the skies: evasion and +15% AGI. Outside battle: your next 3 moves fly over random encounters.", bf("fly", "Fly", 4, { agi: 15 }, ["evade"]), { ooc: "fly:3" }),
  sp("haste", "Haste", 3, A, "+40% AGI for 4 turns, which also boosts crits and dodge.", bf("haste", "Haste", 4, { agi: 40 })),
  sp("lions_heart", "Lion's Heart", 3, D, "Complete resistance to fear (and despair) for a single target, plus +10% ATK.", bf("lionheart_sp", "Lion's Heart", 8, { atk: 10 }, ["fearless"])),
  sp("flame_resistance", "Flame Resistance", 3, ADN, "Grants resistance to fire (half damage). Olasird'arc used it to cover a Frost Dragon's weakness.", bf("flame_res", "Flame Resistance", 8, {}, [], { traits: ["resist_fire"] })),
  sp("earth_master", "Earth Master", 3, N, "Defends against earth-enhanced attacks: −35% bludgeoning damage for 6 turns.", bf("earth_master", "Earth Master", 6, {}, [], { ward: { blunt: 0.35 } })),
  sp("shield_wall", "Shield Wall", 3, AD, "An invisible barrier that absorbs damage (scales with MAG) until it breaks.", bf("shield_wall", "Shield Wall", 5, {}, [], { poolMult: 1.2 })),
  sp("strengthen_self", "Strengthen Self", 3, AN, "Entoma's talisman: improves your physical abilities. +15% ATK and DEF.", bf("strengthen_self", "Strengthen Self", 5, { atk: 15, def: 15 })),
  sp("multiple_vision", "Multiple Vision", 3, A, "Illusory copies of yourself confuse attackers: strong evasion for 3 turns.", bf("multi_vision", "Multiple Vision", 3, {}, ["evade", "evade"])),
  sp("fox_sleep", "Fox Sleep", 3, A, "An illusion that triggers once you're badly hurt (below 30% HP): your foes think you're out of commission and hold back.", bf("fox_sleep", "Fox Sleep", 8, {}, ["fox_sleep"])),
  sp("mind_of_undeath", "Mind of Undeath", 3, X, "Protects the target's mind like an undead's: immune to fear, charm, sleep and other mind-affecting magic.", bf("mind_undeath", "Mind of Undeath", 6, {}, [], { traits: ["immune_mental"] })),
  sp("dimensional_move", "Dimensional Move", 3, A, "A short-range teleport magic casters use to put distance between themselves and their foes: escape any battle that isn't a boss fight (unless space is locked). Self only.", ut("blink", { escape: "blink" })),
  sp("hot_spring", "Hot Spring", 3, N, "Lifestyle magic imitating the druid spell [Geyser]. Out of battle: soak for half an hour to restore 35% HP and wash away poison, burns, bleeding, disease and weakness.", ut("hot_spring")),
  sp("all_appraisal", "All Appraisal Magic Item", 3, A, "Identifies every item you carry at once, down to its creator and manufacturer. Appraised items sell for 30% more.", ut("all_appraise")),
  // ═══ 4th tier ═══
  sp("wall_of_fire", "Wall of Fire", 4, A, "A blazing wall that hits all enemies.", dm(1.35, "fire", { aoe: true, status: st("burn", 0.5, 3, 0.04) })),
  sp("grand_fireball", "Grand Fireball", 4, A, "The superior version of [Fireball].", dm(1.45, "fire", { aoe: true, status: st("burn", 0.4, 3, 0.04) })),
  sp("ice_storm", "Ice Storm", 4, A, "Hail and ice on all enemies.", dm(1.3, "ice", { aoe: true, status: st("slow", 0.3, 2) })),
  sp("burn_lance", "Burn Lance", 4, A, "A piercing lance of fire.", dm(1.9, "fire", { pierce: 0.35 })),
  sp("freeze_lance", "Freeze Lance", 4, A, "A piercing lance of ice.", dm(1.9, "ice", { pierce: 0.35 })),
  sp("shock_lance", "Shock Lance", 4, A, "A piercing lance of lightning.", dm(1.9, "lightning", { pierce: 0.35 })),
  sp("silver_lance", "Silver Lance", 4, A, "A piercing lance of the silver element: great damage to demons and the undead, extra damage to the unarmored (beasts, spirits, elementals), but heavy armor blunts it.", dm(1.8, "silver", { pierce: 0.35 })),
  sp("crystal_lance", "Crystal Lance", 4, A, "Evileye's elongated, cold crystal sent flying at a foe: a piercing physical lance.", dm(1.85, "pierce", { pierce: 0.4 })),
  sp("lightning_claw", "Lightning Claw", 4, AN, "A stroke of electricity shaped like a beast's talons.", dm(1.95, "lightning", { status: st("stun", 0.15, 1) })),
  sp("piercing_wind_talisman", "Piercing Wind Talisman", 4, AN, "A powerful gale that sends enemies flying.", dm(1.2, "slash", { aoe: true, status: st("stun", 0.2, 1) })),
  sp("dehydration", "Dehydration", 4, AN, "Draws the water out of a living body. Great damage to all living beings; nothing against the undead, constructs or water elementals.", dm(2.1, "void", { special: "dehydration" })),
  sp("holy_ray", "Holy Ray", 4, D, "A ray of light that pierces its target.", dm(2.0, "holy", { pierce: 0.3 })),
  sp("enervation", "Enervation", 4, X, "Drains a target's vitality.", dm(1.7, "unholy", { drain: 0.3 })),
  sp("spike_growth", "Spike Growth", 4, N, "Spikes erupt beneath all enemies.", dm(1.3, "pierce", { aoe: true, status: st("bleed", 0.4, 3, 0.03) })),
  sp("sleep_undead", "Sleep to the Undead", 4, D, "A chance to destroy an undead foe in a single hit, ignoring its immunity to death. If it resists, holy light sears it.", { kind: "death", deathChance: 0.45, onlyFamilies: ["undead"], special: "anti_undead", element: "holy", stat: "mag", power: 1.2 }),
  sp("charm_species", "Charm Species", 4, A, "Works on any species: the target regards you as a friend and fights for you. Hurting it breaks the charm.", de(st("charm", 0.55, 3))),
  sp("paralysis", "Paralysis", 4, AX, "Paralyzes a target: it can't act, and damage won't snap it out. The undead, constructs and paralysis-immune are unaffected.", de(st("paralysis", 0.6, 2))),
  sp("green_chain", "Green Chain", 4, N, "Green chains lash out and bind every foe.", de(st("hold", 0.45, 2), true)),
  sp("resist_break", "Resist Break", 4, AX, "Breaks a foe's magic resistance: −40% RES, and your status effects and instant death land more often.", de(st("resbreak", 0.8, 4))),
  sp("evil_eye", "Evil Eye", 4, AX, "A gaze attack: picks one of several gaze effects at random (fear, charm, sleep, paralysis or blindness).", { kind: "debuff", special: "evil_eye", status: st("fear", 0.6, 2) }),
  sp("summon_undead_4", "Summon Undead 4th", 4, X, "Summons a Death Warrior.", su("Death Warrior", -8, 6, { element: "slash", taunt: true })),
  sp("summon_angel_4", "Summon Angel 4th", 4, D, "Summons a Principality of Observation (or Peace), a sturdy angel that draws attacks.", su("Principality of Observation", -8, 6, { taunt: true, element: "holy", mult: 1.05 })),
  sp("cure_serious", "Cure Serious Wounds", 4, D, "Strong healing.", hl(2.4)),
  sp("mass_middle_cure", "Mass Middle Cure Wounds", 4, DN, "Moderate healing for you and all your summons.", hl(1.8, { aoe: true })),
  sp("regenerate", "Regenerate", 4, DN, "Healing over time: regenerate 6% HP every turn for 6 turns.", bf("regenerate", "Regenerate", 6, {}, ["regen"])),
  sp("holy_aura", "Holy Aura", 4, D, "A holy aura against evil: −25% damage from evil beings, −25% negative energy damage, +25% RES.", bf("holy_aura", "Holy Aura", 6, { res: 25 }, ["anti_evil"], { ward: { unholy: 0.25 } })),
  sp("death_mask", "Death Mask", 4, X, "Guards you against gaze attacks and fear while strengthening your own terror: foes that hit you may be frightened.", bf("death_mask", "Death Mask", 6, {}, ["fearless", "fear_aura"])),
  sp("under_divine_flag", "Under Divine Flag", 4, D, "A paladin's banner: complete immunity to fear for you and everyone around you (your summons), +10% DEF.", aoeBuff(bf("divine_flag", "Under Divine Flag", 6, { def: 10 }, ["fearless"]))),
  sp("crystal_wall", "Crystal Wall", 4, AN, "A wall of earth-element crystals: −30% physical damage for 4 turns.", bf("crystal_wall", "Crystal Wall", 4, {}, [], { ward: { slash: 0.3, pierce: 0.3, blunt: 0.3 } })),
  sp("prot_energy_fire", "Protection Energy - Fire", 4, ADN, "Limited protection from fire: −30% fire damage, plus a fire-only absorb shield that scales with MAG.", bf("prot_fire", "Protection Energy - Fire", 8, {}, [], { ward: { fire: 0.3 }, poolMult: 0.9, poolEls: ["fire"] })),
  sp("prot_energy_ice", "Protection Energy - Ice", 4, ADN, "Limited protection from ice: −30% ice damage, plus an ice-only absorb shield that scales with MAG.", bf("prot_ice", "Protection Energy - Ice", 8, {}, [], { ward: { ice: 0.3 }, poolMult: 0.9, poolEls: ["ice"] })),
  sp("prot_energy_lightning", "Protection Energy - Electricity", 4, ADN, "Limited protection from electricity: −30% lightning damage, plus a lightning-only absorb shield that scales with MAG.", bf("prot_lightning", "Protection Energy - Electricity", 8, {}, [], { ward: { lightning: 0.3 }, poolMult: 0.9, poolEls: ["lightning"] })),
  sp("tremor_sense", "Tremor Sense", 4, N, "Senses the faintest tremors through the ground: reveals ground-bound creatures here and in neighboring areas, with their levels. Can't sense flyers.", ut("tremor")),
  sp("oracle", "Oracle", 4, D, "Communes with the Divine: names the best hunting grounds for your level, and grants a lucky omen.", ut("oracle")),
  // ═══ 5th tier ═══
  sp("dragon_lightning", "Dragon Lightning", 5, A, "Lightning shaped like a dragon that seeks out its target (it can't miss).", dm(2.3, "lightning", { unblockable: true })),
  sp("cone_of_cold", "Cone of Cold", 5, A, "Freezing blast on all enemies.", dm(1.6, "ice", { aoe: true, status: st("freeze", 0.2, 1) })),
  sp("force_explosion", "Force Explosion", 5, A, "Sends an invisible shockwave at the target.", dm(2.1, "blunt", { status: st("stun", 0.25, 1) })),
  sp("acid_javelin", "Acid Javelin", 5, AN, "A javelin of caustic acid.", dm(2.2, "acid", { status: st("defdown", 0.45, 3) })),
  sp("ice_pillar", "Ice Pillar", 5, AN, "Two pillars of ice sprout beneath the target.", dm(1.2, "ice", { hits: 2, status: st("freeze", 0.15, 1) })),
  sp("lightning_bird_swarm", "Lightning Bird Swarm Talisman", 5, AN, "A swarm of small lightning birds strikes every foe.", dm(1.45, "lightning", { aoe: true, status: st("blind", 0.25, 1) })),
  sp("dark", "Dark", 5, AX, "Darkness washes over every foe: typeless damage nothing can resist. Weaker than the single-target [True Dark].", dm(1.35, "none", { aoe: true })),
  sp("vermin_bane", "Vermin Bane", 5, A, "Evileye's original anti-insect mist: lethal to insects and utterly harmless to everything else. Its mana cost is enormous.", dm(4.0, "none", { aoe: true, onlyFamilies: ["insect"] }), { mp: mpCost(7) }),
  sp("flame_strike", "Flame Strike", 5, D, "Holy fire from the heavens.", dm(2.3, "holy", { status: st("burn", 0.4, 3, 0.04) })),
  sp("brilliant_radiance", "Brilliant Radiance", 5, D, "Purifies the target with holy light.", dm(2.2, "holy", { bonusVs: { evil: true, mult: 1.2 } })),
  sp("spirit_killing", "Spirit Killing", 5, AD, "Magic damage doubled against spirits, fae, elementals and ethereal beings.", dm(1.8, "void", { bonusVs: { families: ["spirit", "fae", "elemental"], ethereal: true, mult: 2 } })),
  sp("insect_plague", "Insect Plague", 5, N, "A plague of insects swarms all enemies.", dm(1.5, "poison", { aoe: true, status: st("poison", 0.6, 3, 0.04) })),
  sp("hold_of_ribs", "Hold of Ribs", 5, X, "Bones burst up to pin the target and pierce deep into its flesh.", dm(1.6, "pierce", { status: st("hold", 0.65, 2) })),
  sp("sand_field_all", "Sand Field: All", 5, A, "Evileye's strongest original spell: sand disperses everywhere, immobilizing, blinding and silencing every foe... and your own summons lose their next action too. Useless in a group fight.", de(st("hold", 0.6, 2), true, { statuses: [st("blind", 0.6, 2), st("silence", 0.6, 2)], hitsSummons: true })),
  sp("dominate", "Dominate", 5, A, "Stronger than [Charm Person]: bends a target to your will. Dominated foes fight for you, and hurting them doesn't break it. Bosses resist.", de(st("dominate", 0.5, 4))),
  sp("resist_weakening", "Resist Weakening", 5, AX, "Weakens a foe's resistances: damage types it resists or is immune to hit it normally while it lasts.", de(st("resweak", 0.75, 4))),
  sp("mass_slow", "Mass Slow", 5, A, "[Slow] on every foe at once.", de(st("slow", 0.65, 3), true)),
  sp("delay_teleport", "Delay Teleportation", 5, A, "Stalls any teleport whose destination is near you and tells you how many are coming: enemy reinforcements arrive 2 turns late (or never, if the battle ends first). Effective even against Greater Teleportation.", fx("delay_tp", 5)),
  sp("summon_undead_5", "Summon Undead 5th", 5, X, "Summons Corpse Collectors.", su("Corpse Collector", -7, 6, { count: 2, element: "blunt" })),
  sp("lesser_magic_ward", "Greater Magic Shield", 5, A, "+50% RES for 5 turns.", bf("magicshield", "Greater Magic Shield", 5, { res: 50 })),
  sp("shielding_prayer", "Shielding Prayer", 5, D, "Raises the magic attack of you and your summons (+20% MAG) and cuts magic damage taken by 20%.", aoeBuff(bf("shielding_prayer", "Shielding Prayer", 5, { mag: 20 }, [], { ward: MAGIC_WARD }))),
  sp("undying_flame", "Undying Flame", 5, NX, "Your fangs, claws and weapon blaze with bluish-white flame: +15% ATK, and your attacks add fire and negative-energy damage.", bf("undying_flame", "Undying Flame", 5, { atk: 15 }, ["undying_flame"])),
  sp("teleportation", "Teleportation", 5, A, "Out of battle: teleport to your respawn temple, or 'cast teleportation <town>' to any town in this world. In battle: escape to your temple (not from bosses, or while space is locked).", ut("teleport", { escape: "home" })),
  sp("raise_dead", "Raise Dead", 5, D, "Out of combat, scribes a Scroll of Raise Dead (500g). If you die, it cuts the penalty to −4 levels.", { kind: "special", special: "scribe_raise_dead" }),
  // ═══ 6th tier ═══
  sp("disintegrate", "Disintegrate", 6, A, "A green ray that disintegrates matter.", dm(2.8, "void")),
  sp("obsidian_sword", "Obsidian Sword", 6, A, "A great obsidian sword locks on and hones in like a missile; nearly impossible to stop or dodge. Triplet Maximize summons three.", dm(2.4, "slash", { pierce: 0.25, unblockable: true })),
  sp("flamewing", "Flamewing", 6, AN, "Wings of flame sweep across every foe.", dm(1.75, "fire", { aoe: true, status: st("burn", 0.4, 3, 0.04) })),
  sp("wall_of_hell", "Wall of Hell", 6, AX, "A wall of hellfire hems the enemy in: fire damage and burns, and no enemy can teleport out for 2 turns.", dm(1.8, "fire", { aoe: true, status: st("burn", 0.5, 3, 0.04), special: "wall_trap" })),
  sp("cacophonous_burst", "Cacophonous Burst", 6, A, "Explosive sound waves, especially effective against elementals (earth above all) and constructs.", dm(1.7, "blunt", { aoe: true, bonusVs: { families: ["elemental", "construct", "slime"], mult: 1.6 } })),
  sp("control_weather", "Control Weather", 6, N, "Calls a storm that strikes all enemies.", dm(1.9, "lightning", { aoe: true })),
  sp("explosion_wn", "Explode Mine", 6, A, "Trap magic: lays a mine that detonates when an enemy draws near, for heavy typeless damage. Twin/Triplet lay 2/3 mines; Widen makes each blast hit every foe. Laid outside battle, it waits 2 hours for whatever comes.", tp("Explode Mine", 2.5, "none")),
  sp("drown", "Drown", 6, N, "Fills the target's lungs with water. A slow countdown: when it runs out the target drowns (bosses lose a quarter of their max HP instead). Useless on things that don't breathe: undead, constructs, elementals.", de(st("drown", 0.6, 4))),
  sp("mass_hold_species", "Mass Hold Species", 6, AN, "Constricts every enemy, of any species, so they can't move.", de(st("hold", 0.55, 2), true)),
  sp("obey", "Obey", 6, X, "Fluder's own modification of Summon Undead 6th: seizes control of a weaker undead foe (lower level than you), bypassing its mental immunity.", de(st("dominate", 0.75, 5), false, { onlyFamilies: ["undead"], special: "obey" })),
  sp("magic_destruction", "Magic Destruction", 6, AD, "Destroys everything made by magic: strips buffs, unmakes summoned creatures, and tears into constructs and elementals. Success depends on your spellcasting ability.", { kind: "dispel", power: 2 }),
  sp("heal", "Heal", 6, D, "A powerful heal that also cures ailments. Damages undead greatly.", hl(3.5, { special: "cleanse" })),
  sp("mass_cure", "Mass Cure Wounds", 6, D, "Heals you and your summons.", hl(2.6, { aoe: true })),
  sp("antilife_cocoon", "Anti-Life Cocoon", 6, X, "A barrier that no life can enter: physical attacks from living creatures can't reach you for 3 turns (the undead, constructs and spells still can). +20% DEF.", bf("cocoon", "Anti-Life Cocoon", 3, { def: 20 }, ["antilife"])),
  sp("indomitability", "Indomitability", 6, AD, "You survive one otherwise fatal blow with 1 HP, whatever it is, even instant death.", bf("indomitable", "Indomitability", 6, {}, ["indomitable"])),
  sp("translocation_damage", "Translocation Damage", 6, A, "Turns damage into mana loss: 60% of every hit drains your MP instead of your HP, while you have MP.", bf("translocation", "Translocation Damage", 5, {}, ["translocation"])),
  sp("undead_form", "Undead Form", 6, X, "Briefly grants the properties of the undead, good and bad: immune to instant death, mind effects, poison and paralysis, healed by negative energy... but weak to fire and holy, and hurt by healing.", bf("undead_form", "Undead Form", 5, { def: 10 }, [], { traits: ["undead", "immune_death", "immune_mental", "immune_poison", "immune_paralysis", "heal_inverted", "weak_fire", "weak_holy"] })),
  sp("power_of_gaia", "Power of Gaia", 6, N, "The strength of the earth for you and your summons: +25% ATK and DEF.", aoeBuff(bf("gaia", "Power of Gaia", 5, { atk: 25, def: 25 }))),
  sp("wall_of_skeleton", "Wall of Skeleton", 6, X, "A wall of moving skeletons that taunts enemies. Spell-interrupting: enemy casters may be disrupted.", su("Wall of Skeleton", -5, 4, { taunt: true, mult: 0.6, element: "blunt", interrupt: true })),
  sp("summon_undead_6", "Summon Undead 6th", 6, X, "Summons Bone Vultures.", su("Bone Vulture", -6, 6, { count: 3, element: "pierce" })),
  sp("mass_fly", "Mass Fly", 6, A, "Flight for a whole group. In battle: evasion and +15% AGI. Outside battle: your next 8 moves fly over random encounters.", bf("mass_fly", "Mass Fly", 4, { agi: 15 }, ["evade"]), { ooc: "fly:8" }),
  sp("locate_object", "Locate Object", 6, AD, "Finds where an object is: your dropped death item (and how long it will lie there), or 'cast locate object <shop|forge|inn|temple|gate|gacha>' for the nearest such place in this world.", ut("locate")),
  // ═══ 7th tier ═══
  sp("chain_dragon_lightning", "Chain Dragon Lightning", 7, A, "Dragon lightning that chains through all enemies. Works great against metal armor.", dm(2.2, "lightning", { aoe: true, bonusVs: { families: ARMORED, mult: 1.2 } })),
  sp("hellflame", "Hell Flame", 7, A, "A tiny black flame latches onto the target and swells into an inferno that burns anything to ash.", dm(3.2, "fire", { status: st("burn", 0.8, 4, 0.06) })),
  sp("napalm", "Napalm", 7, A, "A column of flame appears beside the target and engulfs it.", dm(3.0, "fire", { status: st("burn", 0.7, 3, 0.05) })),
  sp("true_dark", "True Dark", 7, AX, "Absolute darkness: heavy typeless damage that no resistance, immunity or weakness affects.", dm(3.0, "none")),
  sp("hellfire_wall", "Hellfire Wall", 7, AX, "A wall of black flame surrounds the enemy and traps them. It does no physical harm but incinerates the soul (negative damage that ignores defense), and no enemy can teleport out for 2 turns.", dm(2.0, "unholy", { aoe: true, ignoreDef: true, special: "wall_trap" })),
  sp("holy_smite", "Holy Smite", 7, D, "The Dominion Authority's column of pure light. Massive damage to the evil-aligned.", dm(3.2, "holy", { karmaScale: "good", bonusVs: { evil: true, mult: 1.2 } })),
  sp("shining_burst", "Shining Burst", 7, D, "Area holy light: the lower a target's karma, the more it hurts (extra to the undead). Good-aligned beings take little or no damage.", dm(2.4, "holy", { aoe: true, karmaScale: "pure_good", bonusVs: { families: ["undead"], mult: 1.3 } })),
  sp("fire_storm", "Fire Storm", 7, DN, "A divine storm of fire on all foes.", dm(2.1, "fire", { aoe: true, status: st("burn", 0.4, 2, 0.04) })),
  sp("blasphemy", "Blasphemy", 7, X, "Desecrating words: negative energy on every foe, silencing them. Angels suffer most.", dm(2.0, "unholy", { aoe: true, status: st("silence", 0.45, 2), bonusVs: { families: ["angel"], mult: 1.5 } })),
  sp("greater_word_of_curse", "Greater Word of Curse", 7, X, "A curse spoken up close. Ainz thought of it as little more than a threat.", dm(2.6, "unholy", { status: st("despair", 0.5, 3) })),
  sp("thousand_bone_lance", "Thousand Bone Lance", 7, X, "Countless bone spears: 6 hits scattered among your foes.", dm(0.6, "pierce", { hits: 6, randomTargets: true })),
  sp("negative_burst", "Negative Burst", 7, X, "A sphere of negative energy bursts from your body and hits all enemies. Undead casters are healed.", dm(2.0, "unholy", { aoe: true, special: "negburst" })),
  sp("mass_dominate", "Mass Dominate Person", 7, A, "Brainwashes every humanoid foe at once to do your bidding.", de(st("dominate", 0.45, 4), true, { onlyFamilies: HUMANOID })),
  sp("undeath_army", "Undeath Army", 7, X, "Raises a huge horde of undead.", su("Undead Legionnaire", -8, 6, { count: 5, element: "slash" })),
  sp("summon_angel_7", "Summon Angel 7th", 7, D, "Summons a Dominion Authority, whose Holy Smite lays waste to cities.", su("Dominion Authority", -3, 6, { element: "holy", mult: 1.2 })),
  sp("mass_heal", "Mass Heal", 7, D, "Large heal for you and your summons.", hl(3.4, { aoe: true })),
  sp("greater_lethal", "Greater Lethal", 7, DX, "Channels vast negative energy. For the undead it's the strongest self-heal there is (Shalltear's favorite); cast by the living, or at an enemy, it's a devastating negative-energy strike.", hl(4.0, { special: "lethal" })),
  sp("focus_magic", "Focus Magic", 7, A, "Focuses an ally's magic (you or a summon): +35% MAG for 4 turns.", bf("focus_magic", "Focus Magic", 4, { mag: 35 })),
  sp("phoenix_flame", "Phoenix Flame", 7, DN, "Self-resurrection that even counters instant death: if you die within 10 turns, you rise with a little HP in a burst of flame that scorches nearby foes.", bf("phoenix", "Phoenix Flame", 10, {}, ["phoenix"])),
  sp("earth_surge", "Earth Surge", 7, N, "The earth rises in columns and rolls like the sea under all enemies.", dm(2.3, "blunt", { aoe: true, status: st("stun", 0.25, 1) })),
  sp("greater_teleportation", "Greater Teleportation", 7, A, "Instant travel without distance limits, always to a safe spot. Out of battle: 'cast greater teleportation <area|world>' to any area in this world or any world's town. In battle: escape to town.", ut("teleport", { escape: "town" })),
  sp("create_greater_item", "Create Greater Item", 7, A, "'cast create greater item <gear type>': conjures equipment to YGGDRASIL standards at your level (Top grade, Relic at Lv70+). Conjured gear is worthless to merchants and fades if you die; only one exists at a time.", ut("create_item")),
  sp("resurrection", "Resurrection", 7, D, "Out of combat, scribes a Scroll of Resurrection (2,000g). If you die, it cuts the penalty to −3 levels.", { kind: "special", special: "scribe_resurrection" }),
  // ═══ 8th tier ═══
  sp("death", "Death", 8, X, "Instant death. Undead and constructs are immune. On a resist, deals a little negative damage.", { kind: "death", deathChance: 0.6, stat: "mag", power: 1.0 }),
  sp("energy_drain", "Energy Drain", 8, X, "Drains the target's levels: it loses 3 (weaker, and worth less EXP), and you're fully healed and empowered by what you took. The undead and constructs have no life to drain.", dm(1.0, "unholy", { levelDrain: 3 })),
  sp("explosion", "Explosion", 8, A, "A massive detonation on all enemies.", dm(2.5, "fire", { aoe: true, status: st("stun", 0.2, 1) })),
  sp("astral_smite", "Astral Smite", 8, AD, "A strike that lands on the astral plane: devastating to ethereal beings (spirits, wraiths, shades), even temporarily ethereal ones.", dm(2.5, "void", { bonusVs: { families: ["spirit"], ethereal: true, mult: 2.2 } })),
  sp("wave_of_pain", "Wave of Pain", 8, X, "A wave of agony washes over every foe, leaving them weakened.", dm(2.1, "unholy", { aoe: true, status: st("atkdown", 0.5, 3) })),
  sp("distort_moral", "Distort Moral", 8, X, "Twists every foe's morale into despair (−20% ATK/DEF/MAG). Hurts the righteous most.", dm(1.5, "unholy", { aoe: true, karmaScale: "evil", status: st("despair", 0.55, 3) })),
  sp("sharks_cyclone", "Sharks Cyclone", 8, AN, "A tornado 100 meters high, full of six-meter sharks waiting to devour anyone sucked inside.", dm(2.3, "slash", { aoe: true, status: st("hold", 0.3, 1) })),
  sp("sodoms_fire", "Sodom's Fire and Brimstone", 8, D, "Fire and brimstone from the heavens on all foes; the wicked burn hotter.", dm(2.4, "fire", { aoe: true, karmaScale: "good", status: st("burn", 0.5, 3, 0.05) })),
  sp("sunburst", "Sunburst", 8, D, "Searing holy light on all enemies. Blinds them (ATK down).", dm(2.4, "holy", { aoe: true, status: st("atkdown", 0.6, 3) })),
  sp("earthquake", "Earthquake", 8, N, "Mare's favorite: everything in its range is destroyed, and the earth swallows all enemies.", dm(2.6, "blunt", { aoe: true, status: st("stun", 0.3, 1) })),
  sp("insanity", "Insanity", 8, AX, "Drives a foe mad: it attacks friend and foe alike.", de(st("insanity", 0.7, 3))),
  sp("greater_break_item", "Greater Break Item", 8, A, "Destroys a foe's magic items: it loses its empowering magic and 15% of its ATK and DEF for the rest of the battle (players and champions lose twice as much).", { kind: "debuff", special: "break_item" }),
  sp("dimensional_lock", "Dimensional Lock", 8, AX, "Locks space around the battle for 5 turns: no enemy can teleport, so no escapes, no blinking and no teleporting reinforcements.", fx("dimlock", 5)),
  sp("drifting_master_mine", "Drifting Master Mine", 8, A, "A mine that drifts and locks on: it detonates on the strongest enemy (highest HP) the moment any foe moves.", tp("Drifting Master Mine", 3.1, "none", { homing: true })),
  sp("force_sanctuary", "Force Sanctuary", 8, AD, "An absolute barrier that stops every attack, even instant death, for 2 rounds (Maximize/Boost: +1 round each). Inside it you can do nothing but wait while your summons fight on. A multi-hit area attack from a foe of your level may overwhelm it.", fx("sanctuary", 2)),
  sp("time_accelerator", "Time Accelerator", 8, A, "Accelerates your own time: your next 2 actions happen before anyone else can move, but you can't attack while accelerated (buff, heal, summon, lay mines or flee freely).", fx("time_accel", 2)),
  sp("greater_magic_seal", "Greater Magic Seal", 8, A, "Stores the next spell you cast (MP paid, metamagic included) instead of releasing it. 'release [#]' unleashes it later as a free action, even in another battle. Seal outside battle and walk in prepared.", fx("seal", 0)),
  sp("summon_primal_fire", "Summon Primal Fire Elemental", 8, A, "Summons a level-80+ Primal Fire Elemental.", su("Primal Fire Elemental", -2, 6, { element: "fire", mult: 1.15 })),
  sp("summon_primal_water", "Summon Primal Water Elemental", 8, AN, "Summons a level-80+ Primal Water Elemental.", su("Primal Water Elemental", -2, 6, { element: "ice", mult: 1.1 })),
  sp("summon_primal_air", "Summon Primal Air Elemental", 8, AN, "Summons a level-80+ Primal Air Elemental.", su("Primal Air Elemental", -2, 6, { element: "lightning", mult: 1.1 })),
  sp("summon_primal_earth", "Summon Primal Earth Elemental", 8, AN, "Summons a level-80+ Primal Earth Elemental that draws attacks.", su("Primal Earth Elemental", -2, 6, { element: "blunt", mult: 1.15, taunt: true })),
  sp("summon_angel_8", "Summon Angel 8th", 8, D, "Summons a Cherub Sentinel, a guardian of the upper choirs.", su("Cherub Sentinel", -1, 6, { element: "holy", mult: 1.25, taunt: true })),
  sp("all_greater_heal", "All Greater Heal", 8, D, "Greater healing for you and all your summons.", hl(3.8, { aoe: true })),
  sp("greater_hardening", "Greater Hardening", 8, A, "+70% DEF/RES for 4 turns.", bf("hardening", "Greater Hardening", 4, { def: 70, res: 70 })),
  sp("aspect_of_elemental", "Aspect of Elemental", 8, N, "Druid magic that grants an elemental's resilience: immune to poison, disease, bleeding and critical hits, and −20% elemental damage.", bf("aspect_elemental", "Aspect of Elemental", 6, {}, ["aspect"], { traits: ["immune_poison", "immune_crit"], ward: { fire: 0.2, ice: 0.2, lightning: 0.2, acid: 0.2 } })),
  sp("complete_invisibility", "Complete Invisibility", 8, A, "Far beyond [Invisibility]: not even the highest-ranked undead see through it. Strong evasion for 3 turns; outside battle, 8 moves of near-certain stealth.", bf("complete_invis", "Complete Invisibility", 3, {}, ["evade", "evade", "evade"]), { ooc: "stealth:8" }),
  sp("remote_viewing", "Remote Viewing", 8, A, "An Arcane Eye views a distant area of this world: 'cast remote viewing <area|boss>' shows its monsters and boss status.", ut("remote_view")),
  sp("planar_eye", "Planar Eye", 8, AD, "Large-scale divination over a whole world: 'cast planar eye <world>' lists every area and the state of its bosses. Too weak to pierce the defenses of the Great Tomb of Nazarick.", ut("planar_eye")),
  // ═══ 9th tier ═══
  sp("grasp_heart", "Grasp Heart", 9, X, "Ainz's favorite spell. Crushes the target's heart. If resisted, the target is stunned instead.", { kind: "death", deathChance: 0.7, onResist: "stun", stat: "mag", power: 1.4 }),
  sp("true_death", "True Death", 9, X, "Instant death that leaves nothing to resurrect. Very high chance.", { kind: "death", deathChance: 0.8, stat: "mag", power: 1.2 }),
  sp("cry_banshee", "Cry of the Banshee", 9, X, "An instant death wail that hits all enemies.", { kind: "death", deathChance: 0.45, aoe: true, stat: "mag", power: 0.8 }),
  sp("crack_in_ground", "Crack in the Ground", 9, DN, "The ground splits open under the target: instant death. Those who resist (or are immune) still take damage over time and are pinned in the fissure.", { kind: "death", deathChance: 0.55, element: "blunt", stat: "mag", power: 1.4, onResist: "hold", status: st("bleed", 1, 3, 0.05) }),
  sp("vermillion_nova", "Vermilion Nova", 9, A, "A pillar of crimson flame appears on the target without warning, sized to consume it completely. Unblockable; the strongest single-target fire spell below Super Tier.", dm(4.0, "fire", { unblockable: true })),
  sp("call_greater_thunder", "Call Greater Thunder", 9, A, "Enormous thunderbolts fused from countless strands.", dm(3.6, "lightning", { status: st("stun", 0.25, 1) })),
  sp("polar_claw", "Polar Claw", 9, AN, "A claw of air as cold as the poles. No secondary effects, but the highest damage of any ice spell.", dm(4.0, "ice")),
  sp("gravity_maelstrom", "Gravity Maelstrom", 9, A, "A black sphere of crushing gravity.", dm(3.8, "void", { ignoreDef: true })),
  sp("nuclear_blast", "Nuclear Blast", 9, A, "Consumes everything between you and the target: half fire, half bludgeoning, with poison, blindness and a huge knockback (stun). One of the weaker 9th-tier spells, and you're caught in it too (−8% HP).", dm(2.4, "fire", { aoe: true, composite: ["fire", "blunt"], selfHpCost: 0.08, status: st("poison", 0.5, 3, 0.04), statuses: [st("blind", 0.5, 2), st("stun", 0.4, 1)] })),
  sp("tempest", "Tempest", 9, N, "A storm of rain and wind batters and blinds every foe, and blows away fog and invisibility.", dm(2.4, "lightning", { aoe: true, status: st("blind", 0.4, 2), special: "reveal" })),
  sp("storm_of_vengeance", "Storm of Vengeance", 9, N, "A storm of acid rain and lightning.", dm(2.8, "lightning", { aoe: true, status: st("defdown", 0.5, 3) })),
  sp("temporal_stasis", "Temporal Stasis", 9, A, "Freezes one foe in time: it can't act, and can't be hurt either. Best used to take one enemy out of a fight with several. Time stop countermeasures halve the chance.", de(st("stasis", 0.7, 3))),
  sp("greater_rejection", "Greater Rejection", 9, AD, "Cancels enemy summoning: banishes every summoned or called enemy on the field and makes new summons fail for 5 turns.", fx("rejection", 5)),
  sp("summon_undead_9", "Summon Undead 9th", 9, X, "Summons a Soul Eater, which devours souls.", su("Soul Eater", -2, 6, { element: "unholy", mult: 1.2 })),
  sp("summon_primal_star", "Summon Primal Star Elemental", 9, A, "Summons a Primal Star Elemental, the brightest of the primal elementals.", su("Primal Star Elemental", -1, 6, { element: "holy", mult: 1.3 })),
  sp("call_lightning_lord", "Call the Lightning Lord", 9, N, "Calls down the Lightning Lord, a towering storm spirit.", su("Lightning Lord", -1, 5, { element: "lightning", mult: 1.3 })),
  sp("mass_greater_heal", "Mass Greater Heal", 9, D, "Massive healing for you and your summons, plus a cleanse.", hl(4.5, { aoe: true, special: "cleanse" })),
  sp("yggdrasil_collection", "YGGDRASIL Collection", 9, DN, "Area HP recovery for you and your summons, plus 3 turns of regeneration.", hl(3.6, { aoe: true, buff: { id: "ygg_collection", name: "YGGDRASIL Collection", turns: 3, flags: ["regen"] } })),
  sp("elemental_form", "Elemental Form", 9, N, "Become an elemental: like [Aspect of Elemental] but stronger. Immune to poison, disease, bleeding, paralysis and crits; resistant to fire, ice and lightning; +15% DEF.", bf("elemental_form", "Elemental Form", 6, { def: 15 }, ["aspect"], { traits: ["immune_poison", "immune_crit", "immune_paralysis", "resist_fire", "resist_ice", "resist_lightning"] })),
  sp("perfect_unknowable", "Perfect Unknowable", 9, A, "Invisible to the naked eye, your traces and voice erased. Strong evasion for 3 turns; outside battle, your next 12 moves have no random encounters at all.", bf("perfect_unknowable", "Perfect Unknowable", 3, {}, ["evade", "evade", "evade"]), { ooc: "stealth:12:sure" }),
  sp("gods_eye", "God's Eye", 9, AD, "An invisible eye that passes through walls anywhere in the Nine Worlds: 'cast god's eye <area|boss>'. Reveals monsters, weaknesses and boss status. Anti-divination (World Enemy lairs, Nazarick) may trace it back and burn you.", ut("gods_eye")),
  sp("lead_of_yatagarasu", "Lead of Yatagarasu", 9, AN, "A three-legged crow leads you along the shortest path to the heart of the dungeon: travel straight to this world's boss lair (or 'cast lead of yatagarasu <area>') with no random encounters.", ut("yatagarasu")),
  sp("bless_of_titania", "Bless of Titania", 9, N, "A tiny fairy appears and the fairy queen takes you along the least dangerous path: 'cast bless of titania <area|boss|town>' travels there in this world with no random encounters, and you arrive refreshed (+20% HP/MP).", ut("titania")),
  sp("true_resurrection", "True Resurrection", 9, D, "Out of combat, scribes a Scroll of True Resurrection (6,000g). If you die, it cuts the penalty to −2 levels.", { kind: "special", special: "scribe_true_resurrection" }),
  // ═══ 10th tier ═══
  sp("time_stop", "Time Stop", 10, A, "Stops time: enemies lose 3 turns. Anyone without time stop countermeasures is helpless. Most level 70+ foes are immune.", { kind: "timestop", turns: 3 }),
  sp("reality_slash", "Reality Slash", 10, A, "Slices space itself, ignoring nearly all magical defense. A lesser version of World Break.", dm(4.8, "void", { ignoreDef: true }), { mp: 420 }),
  sp("implosion", "Implosion", 10, A, "Causes the target to collapse inward.", dm(4.6, "void", { pierce: 0.5 })),
  sp("meteor_fall", "Meteor Fall", 10, A, "A blinding meteor falls from the heavens onto all enemies.", dm(3.2, "fire", { aoe: true, status: st("atkdown", 0.5, 2) })),
  sp("black_hole", "Black Hole", 10, A, "A black hole swallows everything for a moment: crushing damage to every foe, and weaklings (non-bosses 10+ levels below you) are swallowed whole.", dm(2.8, "void", { aoe: true, special: "black_hole" })),
  sp("mist_super_acid", "Mist of Super Acid", 10, AN, "A mist of strong acid engulfs all foes, eating at them and their equipment (DEF down, corrosion). You're unaffected.", dm(2.9, "acid", { aoe: true, status: st("defdown", 0.7, 3), statuses: [st("burn", 0.4, 3, 0.04)] })),
  sp("field_of_unclean", "Field of Unclean", 10, X, "Befouls the whole battlefield: negative energy, disease and despair for every foe.", dm(2.7, "unholy", { aoe: true, status: st("disease", 0.6, 4, 0.04), statuses: [st("despair", 0.35, 2)] })),
  sp("stream_of_lava", "Stream of Lava", 10, DN, "A divine river of lava floods the battlefield.", dm(3.1, "fire", { aoe: true, status: st("burn", 0.6, 3, 0.05) })),
  sp("seven_trumpeter", "Seven Trumpeter", 10, D, "Seven trumpets sound, and seven blasts of holy judgment fall on random foes.", dm(0.95, "holy", { hits: 7, randomTargets: true })),
  sp("uriel", "Uriel", 10, ANY, "Any magic caster can learn it. Does its listed holy fire damage only at +500 karma, and less as karma drops. For an evil caster it's weaker than a 1st-tier spell.", dm(5.2, "holy", { special: "uriel" })),
  sp("wrath_of_yggdrasil", "Wrath of the World Tree", 10, N, "Roots of the World Tree crush all enemies.", dm(3.3, "blunt", { aoe: true, status: st("stun", 0.3, 1) })),
  sp("grand_catastrophe", "Grand Catastrophe", 10, A, "Ulbert's trump card and the World Disaster's ultimate: it takes 60% of your max MP, and its destructive power outstrips super-tier magic. World Disaster only.", dm(7.0, "none", { aoe: true, ignoreDef: true }), { mpPct: 0.6, reqClass: "world_disaster", noMeta: true }),
  sp("control_amnesia", "Control Amnesia", 10, A, "Rewrites a target's memories: it forgets its special abilities and magic (only plain attacks remain) along with its active buffs. Bosses often resist.", { kind: "debuff", special: "amnesia", status: st("amnesia", 0.7, 99) }),
  sp("armageddon_evil", "Armageddon - Evil", 10, A, "Summons an army of demons. YGGDRASIL players don't think much of them, and demonic summons tend to go berserk: they may turn on you.", su("Armageddon Demon", -15, 6, { count: 8, element: "fire", berserk: 0.12 })),
  sp("armageddon_good", "Armageddon - Good", 10, D, "Summons an army of angels to fight for you.", su("Armageddon Angel", -15, 6, { count: 8, element: "holy" })),
  sp("summon_monster_10", "Summon Monster 10th", 10, AN, "Calls forth a high-tier monster, as Shalltear does: a Summoned Behemoth that draws attacks.", su("Summoned Behemoth", -1, 6, { element: "blunt", taunt: true, mult: 1.25 })),
  sp("summon_undead_10", "Summon Undead 10th", 10, X, "Summons a Doom Lord or an Elemental Skull.", su("Doom Lord", 0, 6, { element: "unholy", mult: 1.25 })),
  sp("summon_angel_10", "Summon Angel 10th", 10, D, "Summons a Seraph Empyrean.", su("Seraph Empyrean", 0, 6, { element: "holy", mult: 1.3 })),
  sp("perfect_warrior", "Perfect Warrior", 10, A, "Converts your caster levels into warrior power. You can use any weapon and armor (+80% ATK/DEF, +40% HP), but you can't cast spells until the battle ends.", bf("perfect_warrior", "Perfect Warrior", 99, { atk: 80, def: 80, hp: 40 }, ["perfect_warrior"]), { noMeta: true }),
  sp("beryl", "Body of Effulgent Beryl", 10, A, "Reduces bludgeoning damage by 40% while active, and completely negates the first bludgeoning hit after it's cast.", bf("beryl", "Body of Effulgent Beryl", 6, { def: 15 }, [], { ward: { blunt: 0.4 }, negate: ["blunt"] })),
  sp("aquamarine", "Body of Effulgent Aquamarine", 10, A, "Reduces piercing damage by 40% while active, and completely negates the first piercing hit after it's cast.", bf("aquamarine", "Body of Effulgent Aquamarine", 6, { def: 15 }, [], { ward: { pierce: 0.4 }, negate: ["pierce"] })),
  sp("heliodor", "Body of Effulgent Heliodor", 10, A, "Reduces slashing damage by 40% while active, and completely negates the first slashing hit after it's cast.", bf("heliodor", "Body of Effulgent Heliodor", 6, { def: 15 }, [], { ward: { slash: 0.4 }, negate: ["slash"] })),
  sp("mirror_world", "Mirror World", 10, A, "Illusion of the highest tier: a hemisphere that hides you (evasion) and reflects 30% of the damage you take back at the attacker.", bf("mirror_world", "Mirror World", 4, {}, ["evade", "reflect"])),
  sp("ultimate_disturb", "Ultimate Disturb", 10, AD, "Rapidly raises an ally's magic resistance (+150% RES, −50% magic damage) at the price of wrecking their spellcasting: you can't cast while it's on you. Best cast on a summoned tank (a1, a2...).", bf("ultimate_disturb", "Ultimate Disturb", 5, { res: 150 }, ["no_cast"], { ward: DISTURB_WARD })),
  sp("mercy_shorea", "Mercy of Shorea Robusta", 10, N, "Druid magic with a huge mana drain and three effects: slow regeneration, absolute immunity to instant death, and automatic resurrection without level loss when damage drops you to 0 (at low HP; the spell then ends).", bf("shorea", "Mercy of Shorea Robusta", 10, {}, ["regen_minor", "deathward", "shorea"]), { mp: 420 }),
  sp("gate", "Gate", 10, A, "The highest teleportation magic: no distance limit and a 0% mishap chance. Out of battle: 'cast gate <world|area>' to anywhere in the Nine Worlds, for free. In battle: escape through the portal.", ut("teleport", { escape: "anywhere" })),
  sp("create_fortress", "Create Fortress", 10, A, "Summons a fortress over 30 meters tall that is larger on the inside. Out of battle: rest safely anywhere until morning (full HP/MP; daily uses reset with the new day).", ut("fortress")),
  sp("natures_shelter", "Nature's Shelter", 10, N, "Raises a bunker from the earth that only Sword of Damocles could breach; inside lies the illusion of an endless sky. Out of battle: rest safely anywhere until morning.", ut("fortress")),
  // ═══ SUPER TIER (level 70+) ═══
  sp("fallen_down", "Fallen Down", 11, ANY, "SUPER TIER. A column of blue-white light erases a target. Nigun's sealed Dominion Authority couldn't even use it.", dm(9.0, "holy", { ignoreDef: true })),
  sp("ia_shub_niggurath", "Iä Shub-Niggurath", 11, ANY, "SUPER TIER. Offers a mass instant-death sacrifice to the Black Goat, then summons 5 Dark Young. Pair it with The Goal of All Life is Death.", { kind: "death", deathChance: 0.85, aoe: true, special: "dark_young", stat: "mag", power: 2.0 }),
  sp("pantheon", "Pantheon", 11, ANY, "SUPER TIER. Summons six level-80 Cherubim Gatekeepers.", su("Cherubim Gatekeeper", 80, 8, { count: 6, element: "holy", taunt: true })),
  sp("creation", "Creation", 11, ANY, "SUPER TIER. Rewrites the field itself. Ainz froze an entire lake with it. Massive ice damage on all enemies, with freeze.", dm(5.0, "ice", { aoe: true, status: st("freeze", 0.7, 2) })),
  sp("wish_upon_a_star", "Wish Upon a Star", 11, ANY, "SUPER TIER. Costs 1 level of EXP (free with the Ultimate Shooting Star Super ring). Grants a random wish.", { kind: "special", special: "wish" }),
];

export const SPELL_MAP: Record<string, SpellDef> = Object.fromEntries(SPELLS.map((s) => [s.id, s]));

/** Utility spells (divination, travel, crafting, lifestyle) are cast outside battle and don't use spell slots. */
export const isUtility = (sp: SpellDef) => sp.effect.kind === "utility";

const ALL_META = ["maximize", "twin", "triplet", "widen", "penetrate", "boost"];
/** Which metamagic actually does something for this spell. Anything else is ignored (and costs no MP). */
export function allowedMeta(sp: SpellDef): string[] {
  if (sp.tier >= 11 || sp.noMeta === true || sp.mpPct) return [];
  const e = sp.effect;
  let ok: string[];
  switch (e.kind) {
    case "utility": case "special": ok = []; break;
    case "buff": {
      // Maximize: lasts longer. Boost: only if there's something to strengthen. Widen: only if summons can use it.
      const b = e.buff;
      const strong = !!(b?.mods && Object.keys(b.mods).length) || !!b?.ward || !!b?.poolMult;
      const shareable = (["atk", "mag", "def", "res"] as (keyof Stats)[]).some((k) => (b?.mods?.[k] ?? 0) > 0);
      ok = ["maximize", ...(strong ? ["boost"] : []), ...(shareable ? ["widen"] : [])];
      break;
    }
    case "heal": case "cleanse": ok = ["maximize", "boost", "widen", "twin", "triplet"]; break;
    case "summon": ok = ["twin", "triplet"]; break;
    case "field": ok = e.field === "seal" ? [] : ["maximize", "boost"]; break; // +1 turn each
    case "timestop": ok = ["maximize"]; break;
    case "trap": ok = ["maximize", "boost", "twin", "triplet", "widen", "penetrate"]; break;
    default: ok = [...ALL_META]; // damage, debuff, death, dispel
  }
  if (e.aoe) ok = ok.filter((m) => m !== "widen"); // already hits everything
  if (Array.isArray(sp.noMeta)) ok = ok.filter((m) => !(sp.noMeta as string[]).includes(m));
  return ok;
}

/** The "7 rule": tier N (1..10) unlocks at total level 7×(N−1), so 1st at Lv1 and 10th at Lv63. Super Tier unlocks at 70. */
export function tierUnlockLevel(tier: number): number {
  if (tier <= 1) return 1;
  if (tier >= 11) return 70;
  return 7 * (tier - 1);
}
export function maxTierForLevel(level: number): number {
  if (level >= 70) return 11;
  let t = 1;
  for (let n = 2; n <= 10; n++) if (level >= tierUnlockLevel(n)) t = n;
  return t;
}
export const tierName = (t: number) => (t === 0 ? "0th" : t === 11 ? "Super Tier" : t === 1 ? "1st" : t === 2 ? "2nd" : t === 3 ? "3rd" : `${t}th`);
