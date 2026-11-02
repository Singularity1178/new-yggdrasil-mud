import type { ArmorType, ClassDef, ClassReq, School, Stats, Trait, WeaponType } from "../types";

type P = Partial<Stats>;
const T = {
  WAR: { hp: 16, mp: 2, atk: 4.5, mag: 0.5, def: 3.5, res: 1.5, agi: 2 },
  TANK: { hp: 21, mp: 2, atk: 3, mag: 0.5, def: 5, res: 2.5, agi: 1 },
  ROGUE: { hp: 11, mp: 3, atk: 4, mag: 1, def: 2, res: 2, agi: 4.5 },
  MAGE: { hp: 8, mp: 12, atk: 1, mag: 5.5, def: 1.5, res: 3.5, agi: 2 },
  PRIEST: { hp: 11, mp: 10, atk: 2, mag: 4.5, def: 2.5, res: 4, agi: 1.5 },
  HYBRID: { hp: 13, mp: 6, atk: 3.5, mag: 3, def: 3, res: 2.5, agi: 2 },
  MONK: { hp: 14, mp: 4, atk: 4.5, mag: 1, def: 2.5, res: 2.5, agi: 4 },
  CRAFT: { hp: 11, mp: 5, atk: 2.5, mag: 2, def: 2.5, res: 2, agi: 1.5 },
  BRUTE: { hp: 22, mp: 1, atk: 5, mag: 0.2, def: 3, res: 1, agi: 1.5 },
} satisfies Record<string, P>;

const sc = (t: P, m: number): P => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round((v as number) * m * 10) / 10])) as P;
const MAX = { base: 15, advanced: 10, rare: 5, world: 5 } as const;

const MELEE: WeaponType[] = ["sword", "greatsword", "katana", "axe", "mace", "spear", "scythe", "dagger", "fist"];
const CASTER_W: WeaponType[] = ["staff", "wand", "dagger"];
const ALL_ARMOR: ArmorType[] = ["cloth", "light", "medium", "heavy"];

interface Opt {
  schools?: { school: School; cap: number }[];
  weapons?: WeaponType[];
  armor?: ArmorType[];
  skills?: [number, string][];
  traits?: [number, Trait][];
  caster?: number;
  tags?: string[];
}
function J(id: string, name: string, rank: ClassDef["rank"], stats: P, req: ClassReq, desc: string, o: Opt = {}): ClassDef {
  return mk("job", id, name, rank, stats, req, desc, o);
}
function R(id: string, name: string, rank: ClassDef["rank"], stats: P, req: ClassReq, desc: string, o: Opt = {}, maxOverride?: number): ClassDef {
  const c = mk("racial", id, name, rank, stats, req, desc, o);
  if (maxOverride) c.maxLevel = maxOverride;
  return c;
}
function mk(kind: ClassDef["kind"], id: string, name: string, rank: ClassDef["rank"], stats: P, req: ClassReq, desc: string, o: Opt): ClassDef {
  return {
    id, name, kind, rank, maxLevel: MAX[rank], desc, req, stats,
    schools: o.schools, weapons: o.weapons, armor: o.armor,
    skills: o.skills?.map(([level, id]) => ({ level, id })),
    traits: o.traits?.map(([level, trait]) => ({ level, trait })),
    casterWeight: o.caster ?? (o.schools?.length ? 1 : 0), tags: o.tags,
  };
}

const ADV = 1.2, RARE = 1.45, WORLD = 1.9;

export const CLASSES: ClassDef[] = [
  // ═════════ BASE JOB CLASSES (max 15) ═════════
  J("fighter", "Fighter", "base", T.WAR, {}, "The basic warrior. Can use every melee weapon and heavy armor.", { weapons: MELEE, armor: ALL_ARMOR, skills: [[1, "power_strike"], [5, "battle_cry"], [10, "second_wind"], [15, "cleave"]] }),
  J("monk", "Monk", "base", T.MONK, {}, "Martial artist who fights with fists and ki.", { weapons: ["fist", "staff"], armor: ["cloth", "light"], skills: [[1, "ki_strike"], [5, "iron_body"], [10, "flurry"], [15, "ki_heal"]] }),
  J("thief", "Thief", "base", T.ROGUE, {}, "Quick, crit-heavy and sneaky. Can steal gold from monsters.", { weapons: ["dagger", "sword", "bow", "whip"], armor: ["cloth", "light"], skills: [[1, "backstab"], [3, "steal"], [8, "evasion"], [12, "poison_blade"]] }),
  J("ranger", "Ranger", "base", T.ROGUE, {}, "Bow expert and tracker with some nature magic.", { weapons: ["bow", "dagger", "spear", "sword"], armor: ["cloth", "light", "medium"], schools: [{ school: "nature", cap: 4 }], caster: 0.3, skills: [[1, "aimed_shot"], [5, "hunters_mark"], [10, "arrow_rain"]] }),
  J("gunner", "Gunner", "base", sc(T.ROGUE, 1.05), {}, "YGGDRASIL's firearm specialist. Guns ignore part of the target's defense.", { weapons: ["gun", "dagger"], armor: ["cloth", "light", "medium"], skills: [[1, "quick_draw"], [5, "piercing_round"], [10, "barrage"]] }),
  J("wizard", "Wizard", "base", T.MAGE, {}, "Arcane Magic Caster. Has the largest arcane spell list.", { weapons: CASTER_W, armor: ["cloth"], schools: [{ school: "arcane", cap: 10 }], skills: [[5, "mana_shield"], [12, "arcane_focus"]] }),
  J("sorcerer", "Sorcerer", "base", sc(T.MAGE, 1.02), {}, "Innate caster with stronger elemental power than a Wizard.", { weapons: CASTER_W, armor: ["cloth"], schools: [{ school: "arcane", cap: 10 }], skills: [[5, "elemental_surge"], [12, "overload"]] }),
  J("cleric", "Cleric", "base", T.PRIEST, {}, "Divine Magic Caster. Heals, buffs and casts holy magic. Can wear medium armor.", { weapons: ["mace", "staff", "spear", "wand"], armor: ["cloth", "light", "medium"], schools: [{ school: "divine", cap: 10 }], skills: [[5, "turn_undead"], [10, "divine_grace"]] }),
  J("druid", "Druid", "base", T.PRIEST, {}, "Nature Magic Caster: earth, storms and beasts.", { weapons: ["staff", "spear", "scythe", "wand"], armor: ["cloth", "light"], schools: [{ school: "nature", cap: 10 }], skills: [[5, "barkskin"], [10, "wild_growth"]] }),
  J("shaman", "Shaman", "base", T.PRIEST, {}, "Spirit-caller who mixes nature and low-tier divine magic.", { weapons: ["staff", "spear", "mace", "wand"], armor: ["cloth", "light"], schools: [{ school: "nature", cap: 8 }, { school: "divine", cap: 5 }], skills: [[5, "spirit_totem"], [10, "ancestral_call"]] }),
  J("bard", "Bard", "base", sc(T.HYBRID, 0.95), {}, "Songs and arcane magic up to 6th tier. A favorite of 'Dream Builders'.", { weapons: ["dagger", "sword", "bow", "whip"], armor: ["cloth", "light"], schools: [{ school: "arcane", cap: 6 }], caster: 0.6, skills: [[1, "song_valor"], [5, "song_rest"], [10, "discord"]] }),
  J("summoner", "Summoner", "base", T.MAGE, {}, "Summoning specialist. Every Summoner level makes ALL your summons hit and endure harder, and they inherit your MAG. Pure summoners let their summons do most of the fighting.", { weapons: CASTER_W, armor: ["cloth"], schools: [{ school: "arcane", cap: 10 }], skills: [[1, "call_familiar"], [3, "rally_summons"], [10, "bond_power"]] }),
  J("tamer", "Beast Tamer", "base", T.ROGUE, {}, "Fights alongside tamed beasts and uses whips.", { weapons: ["whip", "bow", "dagger"], armor: ["cloth", "light", "medium"], skills: [[1, "call_beast"], [8, "beast_frenzy"]] }),
  J("alchemist", "Alchemist", "base", T.CRAFT, {}, "Throws bombs and gets more out of potions.", { weapons: ["dagger", "staff", "gun"], armor: ["cloth", "light"], skills: [[1, "alchemy_bomb"], [5, "potion_mastery"], [10, "transmute"]] }),
  J("blacksmith", "Blacksmith", "base", T.CRAFT, {}, "Crafting class. Your forged items get extra data crystal capacity and cost less.", { weapons: ["mace", "axe", "greatsword"], armor: ["light", "medium", "heavy"], skills: [[1, "forge_mastery"], [5, "armor_break"]] }),
  J("cook", "Cook", "base", T.CRAFT, {}, "In YGGDRASIL, cooked food gives buffs. Your meals are legendary.", { weapons: ["dagger", "mace"], armor: ["cloth", "light"], skills: [[1, "hearty_meal"], [8, "feast"]] }),

  // ═════════ ADVANCED JOB CLASSES (max 10) ═════════
  J("knight", "Knight", "advanced", sc(T.TANK, ADV), { classes: { fighter: 10 } }, "Armored defender with shield mastery.", { weapons: MELEE, armor: ALL_ARMOR, skills: [[1, "shield_bash"], [5, "fortress"], [10, "knights_oath"]] }),
  J("guardian", "Guardian", "advanced", sc(T.TANK, ADV * 1.05), { classes: { knight: 5 } }, "The ultimate tank, like Albedo, Overseer of the Floor Guardians.", { weapons: MELEE, armor: ALL_ARMOR, skills: [[1, "cover"], [5, "absolute_defense"], [10, "unbreakable_wall"]], traits: [[10, "immune_mental"]] }),
  J("paladin", "Paladin", "advanced", sc(T.HYBRID, ADV), { classes: { fighter: 5, cleric: 5 }, karmaMin: 100 }, "Holy warrior. Needs positive karma (100 or more). Smites evil and casts divine magic up to 6th tier.", { weapons: MELEE, armor: ALL_ARMOR, schools: [{ school: "divine", cap: 6 }], caster: 0.5, skills: [[1, "smite_evil"], [5, "lay_on_hands"], [10, "holy_aura"]] }),
  J("dark_knight", "Dark Knight", "advanced", sc(T.WAR, ADV), { classes: { fighter: 10 }, karmaMax: -100 }, "Evil knight who trades HP for power. Needs karma of -100 or lower. Albedo's class.", { weapons: MELEE, armor: ALL_ARMOR, schools: [{ school: "necro", cap: 5 }], caster: 0.3, skills: [[1, "dark_blast"], [5, "blood_pact"], [10, "abyss_slash"]] }),
  J("berserker", "Berserker", "advanced", sc(T.BRUTE, ADV), { classes: { fighter: 10 } }, "Gives up defense for raw damage.", { weapons: MELEE, armor: ["light", "medium"], skills: [[1, "rage"], [5, "reckless_blow"], [10, "undying_rage"]] }),
  J("weapon_master", "Weapon Master", "advanced", sc(T.WAR, ADV), { classes: { fighter: 15 } }, "Masters every weapon, including guns and bows.", { weapons: [...MELEE, "bow", "gun", "whip"], armor: ALL_ARMOR, skills: [[1, "weapon_arts"], [8, "thousand_cuts"]] }),
  J("champion", "Champion", "advanced", sc(T.WAR, ADV * 1.05), { classes: { fighter: 15, knight: 5 } }, "A war hero who dominates the battlefield.", { weapons: MELEE, armor: ALL_ARMOR, skills: [[1, "champion_strike"], [8, "warcry_dominance"]] }),
  J("samurai", "Samurai", "advanced", sc(T.WAR, ADV), { classes: { fighter: 10 } }, "Katana master with deadly quick-draw strikes.", { weapons: ["katana", "sword", "spear", "bow"], armor: ["light", "medium", "heavy"], skills: [[1, "iaijutsu"], [5, "mind_eye"], [10, "zantetsuken"]] }),
  J("ninja", "Ninja", "advanced", sc(T.ROGUE, ADV), { classes: { thief: 10 }, totalLevel: 60 }, "Needs total level 60, as in YGGDRASIL. Uses ninjutsu, shadow clones and arcane arts up to 5th tier.", { weapons: ["dagger", "katana", "sword", "fist"], armor: ["cloth", "light"], schools: [{ school: "arcane", cap: 5 }], caster: 0.3, skills: [[1, "shadow_clone"], [5, "ninjutsu_fire"], [10, "shadow_step"]] }),
  J("assassin", "Assassin", "advanced", sc(T.ROGUE, ADV), { classes: { thief: 10 }, karmaMax: 0 }, "Specialist in physical instant death. Needs karma of 0 or lower.", { weapons: ["dagger", "sword", "katana", "bow"], armor: ["cloth", "light"], skills: [[1, "assassinate"], [5, "vanish"], [10, "death_mark"]] }),
  J("sniper", "Sniper", "advanced", sc(T.ROGUE, ADV), { anyOf: { ranger: 10, gunner: 10 } }, "Long-range precision. Crits are devastating.", { weapons: ["bow", "gun"], armor: ["cloth", "light", "medium"], skills: [[1, "headshot"], [5, "steady_aim"]] }),
  J("gunslinger", "Gunslinger", "advanced", sc(T.ROGUE, ADV), { classes: { gunner: 10 } }, "Fires a storm of bullets, like Shizu.", { weapons: ["gun", "dagger"], armor: ["cloth", "light", "medium"], skills: [[1, "fan_the_hammer"], [8, "dead_eye"]] }),
  J("grandmaster", "Grandmaster", "advanced", sc(T.MONK, ADV), { classes: { monk: 10 } }, "Peak martial artist, like Sebas Tian.", { weapons: ["fist"], armor: ["cloth", "light"], skills: [[1, "hundred_fists"], [5, "ki_explosion"], [10, "enlightenment"]], traits: [[10, "immune_mental"]] }),
  J("valkyrie", "Valkyrie", "advanced", sc(T.HYBRID, ADV), { classes: { cleric: 5, fighter: 5 } }, "Shalltear's battle class. Divine magic up to 8th tier, plus Purification Javelin and Einherjar.", { weapons: ["spear", "sword", "mace", "greatsword"], armor: ALL_ARMOR, schools: [{ school: "divine", cap: 8 }], caster: 0.5, skills: [[1, "purification_javelin"], [5, "einherjar"], [10, "valkyrie_charge"]] }),
  J("priest", "Priest", "advanced", sc(T.PRIEST, ADV), { classes: { cleric: 10 } }, "Advanced healer. Healing and holy spells are stronger.", { weapons: ["mace", "staff", "wand"], armor: ["cloth", "light", "medium"], schools: [{ school: "divine", cap: 10 }], skills: [[5, "mass_blessing"], [10, "sanctuary"]] }),
  J("shrine_maiden", "Shrine Maiden", "advanced", sc(T.PRIEST, ADV), { classes: { cleric: 10 } }, "Purification and kagura dances. Strong against undead and demons.", { weapons: ["staff", "bow", "wand"], armor: ["cloth", "light"], schools: [{ school: "divine", cap: 10 }], skills: [[1, "purify"], [5, "kagura"]] }),
  J("high_wizard", "High Wizard", "advanced", sc(T.MAGE, ADV), { classes: { wizard: 15 } }, "Advanced arcane caster.", { weapons: CASTER_W, armor: ["cloth"], schools: [{ school: "arcane", cap: 10 }], skills: [[1, "spell_mastery"], [5, "arcane_overflow"]] }),
  J("battle_mage", "Battle Mage", "advanced", sc(T.HYBRID, ADV), { classes: { wizard: 5, fighter: 5 } }, "Fights with blade and spell, like Narberal Gamma. Arcane magic up to 8th tier.", { weapons: ["sword", "dagger", "staff", "spear", "wand"], armor: ["cloth", "light", "medium"], schools: [{ school: "arcane", cap: 8 }], caster: 0.6, skills: [[1, "spell_blade"], [5, "arcane_armor"]] }),
  J("evoker", "Evoker", "advanced", sc(T.MAGE, ADV), { anyOf: { wizard: 10, sorcerer: 10 } }, "Elemental damage specialist.", { weapons: CASTER_W, armor: ["cloth"], schools: [{ school: "arcane", cap: 10 }], skills: [[1, "elemental_mastery"], [5, "evoke_storm"]] }),
  J("necromancer", "Necromancer", "advanced", sc(T.MAGE, ADV), { anyOf: { wizard: 5, sorcerer: 5, cleric: 5 } }, "Death magic: instant death, negative energy and undead summoning. Momonga's core class.", { weapons: [...CASTER_W, "scythe"], armor: ["cloth"], schools: [{ school: "necro", cap: 10 }], skills: [[1, "raise_skeleton"], [5, "corpse_explosion"]] }),
  J("msn", "Master School Necromancer", "advanced", sc(T.MAGE, ADV * 1.05), { classes: { necromancer: 10 } }, "Mastery of necromancy. Summoned undead are stronger and instant death works more often.", { weapons: [...CASTER_W, "scythe"], armor: ["cloth"], schools: [{ school: "necro", cap: 10 }], skills: [[1, "undead_mastery"], [5, "undead_legion"]] }),
  J("sage", "Sage", "advanced", sc(T.MAGE, ADV), { classes: { wizard: 10, cleric: 10 } }, "Master of both arcane and divine magic.", { weapons: CASTER_W, armor: ["cloth"], schools: [{ school: "arcane", cap: 10 }, { school: "divine", cap: 10 }], skills: [[1, "sage_wisdom"], [5, "dual_cast"]] }),
  J("grand_summoner", "Grand Summoner", "advanced", sc(T.MAGE, ADV), { classes: { summoner: 10 } }, "Commands legions of summons. Stacks with Summoner levels: stronger, longer-lived summons and a bigger army.", { weapons: CASTER_W, armor: ["cloth"], schools: [{ school: "arcane", cap: 10 }], skills: [[1, "legion_command"], [5, "summon_legion"]] }),
  J("archdruid", "Archdruid", "advanced", sc(T.PRIEST, ADV), { classes: { druid: 10 } }, "Commands the full force of nature, like Mare Bello Fiore.", { weapons: ["staff", "spear", "scythe", "wand"], armor: ["cloth", "light"], schools: [{ school: "nature", cap: 10 }], skills: [[5, "force_of_nature"], [10, "avatar_of_nature"]] }),
  J("beast_master", "Beast Master", "advanced", sc(T.ROGUE, ADV), { classes: { tamer: 10 } }, "Calls legendary beasts, like Aura's Fenrir.", { weapons: ["whip", "bow", "dagger"], armor: ["cloth", "light", "medium"], skills: [[1, "beast_unity"], [5, "alpha_call"]] }),
  J("grand_alchemist", "Grand Alchemist", "advanced", sc(T.CRAFT, ADV), { classes: { alchemist: 10 } }, "Brews legendary elixirs.", { weapons: ["dagger", "staff", "gun"], armor: ["cloth", "light"], skills: [[1, "elixir_burst"], [5, "philosophers_brew"]] }),
  J("rune_smith", "Rune Smith", "advanced", sc(T.CRAFT, ADV * 1.1), { classes: { blacksmith: 10 } }, "Engraves runes into weapons. Dwarven pride.", { weapons: ["mace", "axe", "greatsword", "sword"], armor: ALL_ARMOR, skills: [[1, "rune_engrave"], [5, "rune_of_destruction"]] }),
  J("skald", "Skald", "advanced", sc(T.HYBRID, ADV), { classes: { bard: 10 } }, "War-poet whose sagas drive allies forward.", { weapons: ["sword", "axe", "spear", "dagger"], armor: ["light", "medium"], schools: [{ school: "arcane", cap: 6 }], caster: 0.5, skills: [[1, "war_saga"], [5, "requiem"]] }),

  // ═════════ RARE / HIDDEN JOB CLASSES (max 5) ═════════
  J("eclipse", "Eclipse", "rare", sc(T.MAGE, RARE), { classes: { msn: 5 }, totalLevel: 80, achievement: "reaper" }, "Ainz's hidden class. Lets instant death affect things that should be immune. Needs 50 instant-death kills.", { weapons: [...CASTER_W, "scythe"], armor: ["cloth"], schools: [{ school: "necro", cap: 10 }], skills: [[1, "eclipse_aura"], [5, "goal_of_all_life"]] }),
  J("hierophant", "Hierophant", "rare", sc(T.PRIEST, RARE), { classes: { priest: 10 }, karmaMin: 300 }, "Hidden divine class. Needs karma of 300 or more.", { weapons: ["mace", "staff", "wand"], armor: ["cloth", "light", "medium"], schools: [{ school: "divine", cap: 10 }], skills: [[1, "divine_intervention"]] }),
  J("sword_saint", "Sword Saint", "rare", sc(T.WAR, RARE), { classes: { samurai: 10 }, achievement: "boss_slayer" }, "Hidden class. Needs 10 bosses killed. One cut, one kill.", { weapons: ["katana", "sword", "greatsword"], armor: ["light", "medium", "heavy"], skills: [[1, "sword_saint_stance"], [5, "one_cut"]] }),
  J("dragon_slayer", "Dragon Slayer", "rare", sc(T.WAR, RARE), { totalLevel: 40, achievement: "dragon_slayer" }, "Hidden class. Needs 30 dragons slain.", { weapons: MELEE, armor: ALL_ARMOR, skills: [[1, "dragon_slay"]], traits: [[5, "resist_fire"]] }),
  J("vampire_hunter", "Vampire Hunter", "rare", sc(T.HYBRID, RARE), { totalLevel: 30, karmaMin: 0, achievement: "undead_hunter", notRaceTags: ["undead"] }, "Hidden class. Needs 100 undead slain and karma of 0 or more.", { weapons: [...MELEE, "bow", "gun"], armor: ALL_ARMOR, skills: [[1, "holy_stake"]] }),
  J("hero", "Hero", "rare", sc(T.HYBRID, RARE * 1.05), { totalLevel: 50, karmaMin: 300, achievement: "savior" }, "Hidden class. Needs karma of 300 or more and 15 travellers saved.", { weapons: MELEE, armor: ALL_ARMOR, skills: [[1, "heroic_resolve"]], traits: [[5, "immune_mental"]] }),

  // ═════════ WORLD CLASSES ═════════
  J("world_champion", "World Champion", "world", sc(T.WAR, WORLD), { classes: { fighter: 15 }, totalLevel: 95, title: "world_champion" }, "The strongest warrior class. One title per world. Win the Tournament of the Nine Worlds in Asgard. Grants World Break.", { weapons: [...MELEE, "bow", "gun"], armor: ALL_ARMOR, skills: [[1, "world_break"], [5, "champions_dominion"]], traits: [[1, "immune_timestop"]] }),
  J("world_disaster", "World Disaster", "world", sc(T.MAGE, WORLD), { classes: { wizard: 15 }, anyOf: { high_wizard: 10, evoker: 10 }, totalLevel: 95, achievement: "world_slayer_magic" }, "The strongest magic class, held by Ulbert Alain Odle. Finish a World Enemy with 10th-tier or Super Tier magic.", { weapons: CASTER_W, armor: ["cloth"], schools: [{ school: "arcane", cap: 10 }], skills: [[1, "disaster_mastery"], [5, "grand_catastrophe"]] }),

  // ═════════ HUMANOID RACIAL (optional) ═════════
  R("r_high_elf", "High Elf", "rare", { hp: 10, mp: 8, mag: 4, agi: 4, res: 3 }, { races: ["elf"] }, "Optional elven racial class.", { skills: [[1, "elven_grace"]] }),
  R("r_dark_elf", "Dark Elf Lineage", "rare", { hp: 10, mp: 6, atk: 3, agi: 5, mag: 2 }, { races: ["dark_elf"] }, "Optional dark elf racial class.", { skills: [[1, "dark_elf_agility"]] }),
  R("r_elder_dwarf", "Elder Dwarf", "rare", { hp: 18, def: 5, res: 3, atk: 2 }, { races: ["dwarf"] }, "Optional dwarven racial class.", { skills: [[1, "stoneskin"]], traits: [[5, "immune_poison"]] }),

  // ═════════ DEMI-HUMAN RACIAL ═════════
  R("r_goblin", "Goblin", "base", sc(T.ROGUE, 1.05), { races: ["goblin"] }, "Goblin racial class.", { skills: [[1, "goblin_trick"]] }),
  R("r_goblin_lord", "Goblin Lord", "advanced", sc(T.ROGUE, 1.25), { classes: { r_goblin: 10 } }, "Leader of goblin troops.", { skills: [[1, "goblin_troop"]] }),
  R("r_goblin_king", "Goblin King", "rare", sc(T.HYBRID, 1.5), { classes: { r_goblin_lord: 10 }, totalLevel: 50 }, "King of all goblins.", { skills: [[1, "goblin_army"]] }),
  R("r_orc", "Orc", "base", sc(T.BRUTE, 1.0), { races: ["orc"] }, "Orc racial class.", { skills: [[1, "bloodlust"]] }),
  R("r_orc_warlord", "Orc Warlord", "advanced", sc(T.BRUTE, 1.25), { classes: { r_orc: 10 } }, "Warlord of the orc horde.", { skills: [[1, "warlord_cry"]] }),
  R("r_lizardman", "Lizardman", "base", sc(T.HYBRID, 1.05), { races: ["lizardman"] }, "Lizardman racial class. Gives minor nature magic.", { schools: [{ school: "nature", cap: 3 }], caster: 0.2, skills: [[1, "tail_sweep"]] }),
  R("r_dragonblood", "Dragonblood Lizardman", "advanced", sc(T.HYBRID, 1.3), { classes: { r_lizardman: 10 } }, "Awakened draconic ancestry.", { schools: [{ school: "nature", cap: 6 }], caster: 0.3, skills: [[1, "dragon_blood"]], traits: [[5, "resist_fire"]] }),
  R("r_beastman", "Beastman", "base", sc(T.MONK, 1.05), { races: ["beastman"] }, "Beastman racial class.", { skills: [[1, "savage_claw"]] }),
  R("r_beast_lord", "Beast Lord", "advanced", sc(T.MONK, 1.3), { classes: { r_beastman: 10 } }, "Apex predator.", { skills: [[1, "primal_roar"]] }),
  R("r_ogre", "Ogre", "base", sc(T.BRUTE, 1.05), { races: ["ogre"] }, "Ogre racial class.", { skills: [[1, "ogre_smash"]] }),
  R("r_ogre_mage", "Ogre Mage", "advanced", { hp: 16, mp: 9, atk: 2.5, mag: 5, def: 3, res: 3, agi: 1.5 }, { classes: { r_ogre: 10 } }, "A rare magic-capable ogre.", { schools: [{ school: "arcane", cap: 8 }], caster: 0.7, skills: [[1, "ogre_regen"]], traits: [[5, "regen"]] }),

  // ═════════ HETEROMORPHIC: UNDEAD (Skeleton line) ═════════
  R("r_skeleton", "Skeleton", "base", { hp: 14, mp: 6, atk: 3, mag: 3, def: 3.5, res: 2.5, agi: 2 }, { races: ["skeleton"] }, "The base undead form. Gives minor negative-energy magic.", { schools: [{ school: "necro", cap: 2 }], caster: 0.3, skills: [[5, "bone_armor"]] }),
  R("r_skeleton_mage", "Skeleton Mage", "base", { hp: 9, mp: 13, atk: 1, mag: 6, def: 2, res: 4, agi: 2 }, { classes: { r_skeleton: 5 } }, "Magic-casting skeleton. Gives arcane and necro magic up to 6th tier.", { schools: [{ school: "arcane", cap: 6 }, { school: "necro", cap: 6 }], caster: 0.8 }),
  R("r_skeleton_warrior", "Skeleton Warrior", "base", { hp: 17, mp: 2, atk: 5, mag: 0.5, def: 4, res: 1.5, agi: 2 }, { classes: { r_skeleton: 5 } }, "Warrior skeleton.", { skills: [[1, "bone_crusher"]] }),
  R("r_elder_lich", "Elder Lich", "advanced", { hp: 10, mp: 16, atk: 1, mag: 7.5, def: 2.5, res: 5, agi: 2 }, { classes: { r_skeleton_mage: 10 } }, "Powerful undead caster. Full necro and arcane access.", { schools: [{ school: "necro", cap: 10 }, { school: "arcane", cap: 10 }], skills: [[3, "negative_touch"]], traits: [[10, "immune_timestop"]] }),
  R("r_death_knight", "Death Knight", "advanced", { hp: 26, mp: 2, atk: 5, mag: 0.5, def: 6, res: 2.5, agi: 1.5 }, { classes: { r_skeleton_warrior: 10 } }, "Undying undead knight. Survives one fatal blow per battle.", { skills: [[1, "undying"]] }),
  R("r_overlord", "Overlord", "rare", { hp: 14, mp: 22, atk: 2, mag: 10, def: 4, res: 7, agi: 3 }, { classes: { r_elder_lich: 10 }, totalLevel: 60 }, "Momonga's racial class, the ruler of the undead. Gives Aura of Despair, Create Undead and negative energy mastery.", { schools: [{ school: "necro", cap: 10 }], skills: [[1, "aura_of_despair"], [2, "create_death_knight"], [5, "overlord_mastery"]], traits: [[1, "resist_holy"]] }),
  R("r_doom_lord", "Doom Lord", "rare", { hp: 32, mp: 4, atk: 8, mag: 1, def: 7, res: 4, agi: 3 }, { classes: { r_death_knight: 10 }, totalLevel: 60 }, "Undead warlord whose strikes bring doom.", { skills: [[1, "doom_strike"], [3, "undying"]], traits: [[5, "resist_holy"]] }),
  // Vampire line
  R("r_vampire", "Vampire", "base", { hp: 15, mp: 6, atk: 4, mag: 2.5, def: 2.5, res: 2.5, agi: 3.5 }, { races: ["vampire"] }, "Blood-drinking undead.", { schools: [{ school: "necro", cap: 4 }], caster: 0.2, skills: [[1, "blood_drain"], [8, "mist_form"]] }),
  R("r_true_vampire", "True Vampire", "advanced", { hp: 20, mp: 10, atk: 6, mag: 4, def: 3.5, res: 3.5, agi: 4.5 }, { classes: { r_vampire: 10 } }, "Shalltear's racial class, an apex vampire.", { schools: [{ school: "necro", cap: 8 }], caster: 0.4, skills: [[1, "blood_frenzy"], [5, "vampire_brides"]] }),
  R("r_progenitor", "Progenitor", "rare", { hp: 26, mp: 14, atk: 8, mag: 6, def: 5, res: 5, agi: 6 }, { classes: { r_true_vampire: 10 }, totalLevel: 60 }, "Origin of a vampire bloodline.", { skills: [[1, "crimson_dominion"]], traits: [[5, "resist_fire"]] }),
  // Dullahan
  R("r_dullahan", "Dullahan", "base", sc(T.TANK, 1.05), { races: ["dullahan"] }, "Headless undead.", { skills: [[1, "headless_charge"]] }),
  R("r_headless_knight", "Headless Knight", "advanced", sc(T.TANK, 1.35), { classes: { r_dullahan: 10 } }, "Undead knight of the headless hunt.", { skills: [[1, "dark_charge"], [5, "undying"]] }),
  // Demon line
  R("r_imp", "Imp", "base", { hp: 11, mp: 9, atk: 3, mag: 4, def: 2.5, res: 3, agi: 3 }, { races: ["imp"] }, "Lesser demon.", { schools: [{ school: "arcane", cap: 5 }], caster: 0.4, skills: [[1, "hellfire_bolt"]] }),
  R("r_arch_devil", "Arch Devil", "advanced", { hp: 13, mp: 14, atk: 2.5, mag: 7, def: 3, res: 5, agi: 3 }, { classes: { r_imp: 10 } }, "Demiurge's racial class, a scheming high demon.", { schools: [{ school: "arcane", cap: 10 }], skills: [[1, "commanding_voice"], [5, "hellflame_wall"]], traits: [[5, "immune_fire"]] }),
  R("r_succubus", "Succubus", "advanced", { hp: 18, mp: 10, atk: 5, mag: 4, def: 4.5, res: 4, agi: 3.5 }, { classes: { r_imp: 10 } }, "Albedo's racial class, a seductive demon.", { schools: [{ school: "arcane", cap: 6 }], caster: 0.4, skills: [[1, "charm_kiss"]], traits: [[5, "immune_mental"]] }),
  R("r_demon_lord", "Demon Lord", "rare", { hp: 24, mp: 16, atk: 6, mag: 8, def: 5, res: 6, agi: 4 }, { anyOf: { r_arch_devil: 10, r_succubus: 10 }, totalLevel: 60 }, "Sovereign of a hell.", { skills: [[1, "demonic_avatar"]] }),
  // Insect line
  R("r_insect", "Insect", "base", { hp: 15, mp: 3, atk: 4, mag: 1.5, def: 4.5, res: 2, agi: 2.5 }, { races: ["insect"] }, "Chitinous heteromorph.", { skills: [[1, "savage_claw"], [5, "carapace"]] }),
  R("r_vermin_lord", "Vermin Lord", "advanced", { hp: 22, mp: 5, atk: 6.5, mag: 2.5, def: 6, res: 3, agi: 3 }, { classes: { r_insect: 10 } }, "Cocytus' racial class, a four-armed insect warlord.", { skills: [[1, "frost_aura"], [5, "four_arms"]], traits: [[10, "immune_ice"]] }),
  R("r_arachnoid", "Arachnoid", "advanced", { hp: 16, mp: 10, atk: 4, mag: 5, def: 4, res: 4, agi: 4 }, { classes: { r_insect: 10 } }, "Entoma's racial class, a spider-like insect.", { schools: [{ school: "nature", cap: 8 }], caster: 0.5, skills: [[1, "web_bind"], [5, "insect_swarm"]] }),
  R("r_hive_sovereign", "Hive Sovereign", "rare", { hp: 28, mp: 10, atk: 8, mag: 5, def: 7, res: 5, agi: 4 }, { anyOf: { r_vermin_lord: 10, r_arachnoid: 10 }, totalLevel: 60 }, "Ruler of all insects.", { skills: [[1, "swarm_lord"]] }),
  // Slime line
  R("r_ooze", "Ooze", "base", { hp: 20, mp: 4, atk: 3, mag: 2.5, def: 3, res: 3, agi: 1 }, { races: ["slime"] }, "Amorphous slime body.", { skills: [[1, "acid_touch"]] }),
  R("r_predatory_slime", "Predatory Slime", "advanced", { hp: 24, mp: 6, atk: 6, mag: 3, def: 4, res: 4, agi: 2.5 }, { classes: { r_ooze: 10 } }, "Solution Epsilon's racial class. Engulfs and digests prey.", { skills: [[1, "engulf"]] }),
  R("r_elder_black_ooze", "Elder Black Ooze", "advanced", { hp: 28, mp: 8, atk: 5, mag: 4, def: 4, res: 5, agi: 1.5 }, { classes: { r_ooze: 10 } }, "Corrosive ooze that dissolves equipment.", { skills: [[1, "corrosion"]] }),
  R("r_ooze_sovereign", "Ooze Sovereign", "rare", { hp: 38, mp: 10, atk: 7, mag: 6, def: 6, res: 6, agi: 2 }, { anyOf: { r_predatory_slime: 10, r_elder_black_ooze: 10 }, totalLevel: 60 }, "The primordial slime, like Herohero.", { skills: [[1, "absorb_all"]] }),
  // Doppelganger line
  R("r_doppelganger", "Doppelganger", "base", { hp: 12, mp: 8, atk: 3.5, mag: 3.5, def: 2.5, res: 2.5, agi: 3 }, { races: ["doppelganger"] }, "Shapeshifter.", { schools: [{ school: "arcane", cap: 5 }], caster: 0.4, skills: [[1, "mimic"]] }),
  R("r_greater_doppelganger", "Greater Doppelganger", "advanced", { hp: 16, mp: 12, atk: 5, mag: 5, def: 3.5, res: 3.5, agi: 4 }, { classes: { r_doppelganger: 10 } }, "Pandora's Actor's racial class. Can take on the 45 forms of the Supreme Beings at 80% of their power.", { schools: [{ school: "arcane", cap: 8 }, { school: "divine", cap: 5 }], caster: 0.6, skills: [[1, "supreme_form"]] }),
  R("r_thousand_faced", "Thousand-Faced", "rare", { hp: 22, mp: 16, atk: 7, mag: 7, def: 5, res: 5, agi: 5 }, { classes: { r_greater_doppelganger: 10 }, totalLevel: 60 }, "Perfect mimicry.", { skills: [[1, "thousand_faces"]] }),
  // Angel line
  R("r_angel", "Angel", "base", { hp: 11, mp: 10, atk: 3, mag: 4.5, def: 2.5, res: 3.5, agi: 3 }, { races: ["angel"], karmaMin: 0 }, "Celestial heteromorph. Needs karma of 0 or more.", { schools: [{ school: "divine", cap: 6 }], caster: 0.5, skills: [[1, "holy_light"]] }),
  R("r_archangel", "Archangel", "advanced", { hp: 14, mp: 14, atk: 4, mag: 6.5, def: 3, res: 5, agi: 3.5 }, { classes: { r_angel: 10 }, karmaMin: 100 }, "Higher angel. Needs karma of 100 or more.", { schools: [{ school: "divine", cap: 10 }], skills: [[1, "radiant_judgment"]], traits: [[5, "immune_holy"]] }),
  R("r_seraph", "Seraph", "rare", { hp: 20, mp: 20, atk: 5, mag: 9.5, def: 4.5, res: 7, agi: 5 }, { classes: { r_archangel: 10 }, karmaMin: 300, totalLevel: 60 }, "The highest angel. Needs karma of 300 or more.", { schools: [{ school: "divine", cap: 10 }], skills: [[1, "seraphic_flame"]] }),
  R("r_fallen_angel", "Fallen Angel", "advanced", { hp: 15, mp: 13, atk: 5, mag: 6, def: 3, res: 4, agi: 4 }, { classes: { r_angel: 5 }, karmaMax: -100 }, "An angel fallen into darkness. Needs karma of -100 or lower. Gives necro magic.", { schools: [{ school: "necro", cap: 10 }], skills: [[1, "fallen_wrath"]], traits: [[5, "resist_unholy"]] }),
  // Dragonoid line
  R("r_dragonoid", "Dragonoid", "base", { hp: 17, mp: 4, atk: 4.5, mag: 2, def: 4, res: 2.5, agi: 2.5 }, { races: ["dragonoid"] }, "Draconic heteromorph.", { skills: [[1, "dragon_breath"], [8, "dragon_scales"]] }),
  R("r_true_dragonoid", "True Dragonoid", "advanced", { hp: 24, mp: 6, atk: 6.5, mag: 3, def: 5.5, res: 3.5, agi: 3 }, { classes: { r_dragonoid: 10 } }, "Fully awakened dragon blood, like Sebas' true form.", { skills: [[1, "true_form"]] }),
  R("r_ancient_dragonoid", "Ancient Dragonoid", "rare", { hp: 34, mp: 10, atk: 9, mag: 5, def: 7, res: 5, agi: 4 }, { classes: { r_true_dragonoid: 10 }, totalLevel: 60 }, "Ancient draconic sovereign.", { skills: [[1, "draconic_apocalypse"]], traits: [[3, "immune_fire"]] }),
  // Werewolf line
  R("r_werewolf", "Werewolf", "base", sc(T.MONK, 1.05), { races: ["werewolf"] }, "Lycanthrope.", { skills: [[1, "feral_bite"], [8, "howl"]] }),
  R("r_alpha_werewolf", "Alpha Werewolf", "advanced", sc(T.MONK, 1.3), { classes: { r_werewolf: 10 } }, "Pack leader.", { skills: [[1, "pack_call"]] }),
  R("r_lycan_sovereign", "Lycan Sovereign", "rare", sc(T.MONK, 1.55), { classes: { r_alpha_werewolf: 10 }, totalLevel: 60 }, "Lord of moonlit beasts.", { skills: [[1, "moonlit_rampage"]] }),
  // Automaton line
  R("r_automaton", "Automaton", "base", sc(T.HYBRID, 1.05), { races: ["automaton"] }, "Magitech construct.", { skills: [[1, "quick_draw"], [4, "overclock"], [8, "repair_protocol"]] }),
  R("r_war_automaton", "War Automaton", "advanced", sc(T.HYBRID, 1.3), { classes: { r_automaton: 10 } }, "CZ2128 Delta's combat chassis.", { skills: [[1, "weapon_systems"]], traits: [[10, "immune_timestop"]] }),
  R("r_machina_prime", "Machina Prime", "rare", sc(T.HYBRID, 1.55), { classes: { r_war_automaton: 10 }, totalLevel: 60 }, "Ultimate construct.", { skills: [[1, "final_protocol"]] }),
];

export const CLASS_MAP: Record<string, ClassDef> = Object.fromEntries(CLASSES.map((c) => [c.id, c]));
