import type { RaceDef, Trait } from "../types";

const UNDEAD: Trait[] = [
  "undead", "immune_death", "immune_mental", "immune_poison", "immune_paralysis", "heal_inverted", "darkvision", "barred_cities",
];

export const RACES: RaceDef[] = [
  // ───────── HUMANOID ─────────
  {
    id: "human", name: "Human", category: "humanoid",
    desc: "No racial levels. All 100 levels go to job classes. +10% EXP. Welcome in every city.",
    lore: "The most common race in YGGDRASIL. Humans lack racial abilities, but their flexibility lets them stack more job classes than anyone.",
    base: { hp: 70, mp: 35, atk: 11, mag: 11, def: 9, res: 9, agi: 10 }, karma: 0, traits: [], homeRoom: "mid_town",
  },
  {
    id: "elf", name: "Wood Elf", category: "humanoid",
    desc: "Agile and magical, with darkvision. Optional racial class: High Elf (5).",
    lore: "Forest-dwellers of Alfheim. Elves prefer bows and nature magic.",
    base: { hp: 60, mp: 45, atk: 9, mag: 13, def: 7, res: 11, agi: 14 }, karma: 50, traits: ["darkvision"], homeRoom: "mid_town",
  },
  {
    id: "dark_elf", name: "Dark Elf", category: "humanoid",
    desc: "Agile beast-tamers and druids, with darkvision. Optional racial class: Dark Elf Lineage (5).",
    lore: "The race of the twin Floor Guardians Aura and Mare Bello Fiore.",
    base: { hp: 62, mp: 42, atk: 10, mag: 12, def: 7, res: 10, agi: 15 }, karma: 0, traits: ["darkvision"], homeRoom: "mid_town",
  },
  {
    id: "dwarf", name: "Dwarf", category: "humanoid",
    desc: "Tough smiths with fire resistance. Optional racial class: Elder Dwarf (5). Better at forging.",
    lore: "Stout craftsmen of Nidavellir, said to have the best rune-smithing in the Nine Worlds.",
    base: { hp: 85, mp: 28, atk: 12, mag: 8, def: 13, res: 9, agi: 7 }, karma: 20, traits: ["resist_fire"], homeRoom: "mid_town",
  },
  // ───────── DEMI-HUMAN ─────────
  {
    id: "goblin", name: "Goblin", category: "demihuman",
    desc: "Fast and sneaky. Racial tree: Goblin → Goblin Lord → Goblin King. 20% surcharge in human cities.",
    lore: "Weak alone, but a Goblin King can command entire troops.",
    base: { hp: 60, mp: 30, atk: 10, mag: 9, def: 8, res: 8, agi: 15 }, karma: -50, traits: ["darkvision"], startClass: "r_goblin", homeRoom: "mid_town",
  },
  {
    id: "orc", name: "Orc", category: "demihuman",
    desc: "Brutal strength. Racial tree: Orc → Orc Warlord.",
    lore: "Tusked warriors who live for battle.",
    base: { hp: 90, mp: 20, atk: 15, mag: 6, def: 10, res: 6, agi: 8 }, karma: -100, traits: [], startClass: "r_orc", homeRoom: "mid_town",
  },
  {
    id: "lizardman", name: "Lizardman", category: "demihuman",
    desc: "Scaled hide, good at shamanism. Weak to ice. Racial tree: Lizardman → Dragonblood Lizardman.",
    lore: "Marsh tribes who honor their ancestors and the strong.",
    base: { hp: 80, mp: 30, atk: 12, mag: 10, def: 12, res: 9, agi: 10 }, karma: 0, traits: ["weak_ice"], startClass: "r_lizardman", homeRoom: "mid_town",
  },
  {
    id: "beastman", name: "Beastman", category: "demihuman",
    desc: "Feral hunters with darkvision. Racial tree: Beastman → Beast Lord.",
    lore: "Each one is said to fight like ten humans.",
    base: { hp: 82, mp: 22, atk: 14, mag: 7, def: 9, res: 7, agi: 14 }, karma: -50, traits: ["darkvision"], startClass: "r_beastman", homeRoom: "mid_town",
  },
  {
    id: "ogre", name: "Ogre", category: "demihuman",
    desc: "Huge HP and attack, poor magic. Racial tree: Ogre → Ogre Mage.",
    lore: "Hulking brutes. The rare Ogre Mage breaks the stereotype.",
    base: { hp: 110, mp: 15, atk: 17, mag: 5, def: 11, res: 5, agi: 6 }, karma: -80, traits: [], startClass: "r_ogre", homeRoom: "mid_town",
  },
  // ───────── HETEROMORPHIC ─────────
  {
    id: "skeleton", name: "Skeleton (Undead)", category: "heteromorphic",
    desc: "Undead: immune to instant death, poison, mental effects and paralysis. Healing hurts you and negative energy heals you. Takes double fire and holy damage, and is weak to blunt. Can grow into Elder Lich → Overlord.",
    lore: "The path of Momonga, the Overlord of Death. Heteromorphs are barred from human cities and are favorite targets of PKers.",
    base: { hp: 70, mp: 40, atk: 10, mag: 13, def: 10, res: 12, agi: 8 }, karma: -200, traits: [...UNDEAD, "weak_fire", "weak_holy", "weak_blunt"], startClass: "r_skeleton", homeRoom: "mid_outcast",
  },
  {
    id: "vampire", name: "Vampire (Undead)", category: "heteromorphic",
    desc: "Undead with lifedrain. Weak to fire and holy. Can grow into True Vampire → Progenitor.",
    lore: "The path of Shalltear Bloodfallen, the True Vampire and Bloody Valkyrie.",
    base: { hp: 75, mp: 35, atk: 13, mag: 11, def: 10, res: 10, agi: 13 }, karma: -250, traits: [...UNDEAD, "weak_fire", "weak_holy", "lifedrain"], startClass: "r_vampire", homeRoom: "mid_outcast",
  },
  {
    id: "dullahan", name: "Dullahan (Undead)", category: "heteromorphic",
    desc: "Headless undead knight. Tankier undead, weak to holy only. Grows into Headless Knight.",
    lore: "The race of Yuri Alpha, the Pleiades' vice-captain.",
    base: { hp: 85, mp: 25, atk: 13, mag: 8, def: 14, res: 9, agi: 9 }, karma: -100, traits: [...UNDEAD, "weak_holy"], startClass: "r_dullahan", homeRoom: "mid_outcast",
  },
  {
    id: "imp", name: "Imp (Demon)", category: "heteromorphic",
    desc: "Demon: resists fire, weak to holy. Grows into Arch Devil or Succubus → Demon Lord.",
    lore: "The path of Demiurge, the Arch Devil, and Albedo, the Succubus.",
    base: { hp: 70, mp: 40, atk: 11, mag: 13, def: 9, res: 11, agi: 11 }, karma: -300, traits: ["resist_fire", "weak_holy", "darkvision", "barred_cities"], startClass: "r_imp", homeRoom: "mid_outcast",
  },
  {
    id: "insect", name: "Insect", category: "heteromorphic",
    desc: "Exoskeleton: high defense, resists ice, weak to fire. Grows into Vermin Lord or Arachnoid → Hive Sovereign.",
    lore: "The path of Cocytus, Vermin Lord and Ruler of Glacier, and Entoma Vasilissa Zeta.",
    base: { hp: 80, mp: 25, atk: 13, mag: 9, def: 15, res: 9, agi: 10 }, karma: -100, traits: ["weak_fire", "resist_ice", "darkvision", "barred_cities"], startClass: "r_insect", homeRoom: "mid_outcast",
  },
  {
    id: "slime", name: "Slime", category: "heteromorphic",
    desc: "Amorphous: immune to crits and acid, resists physical damage, weak to lightning. Grows into Predatory Slime or Elder Black Ooze.",
    lore: "The path of Solution Epsilon. Also, Herohero, the guild's legendary slime.",
    base: { hp: 95, mp: 25, atk: 10, mag: 10, def: 8, res: 10, agi: 7 }, karma: -100, traits: ["immune_crit", "resist_physical", "immune_acid", "weak_lightning", "barred_cities"], startClass: "r_ooze", homeRoom: "mid_outcast",
  },
  {
    id: "doppelganger", name: "Doppelganger", category: "heteromorphic",
    desc: "Shapeshifter: immune to mental effects. Can mimic foes and copy forms at 80% of their power. Grows into Greater Doppelganger.",
    lore: "The path of Pandora's Actor and Narberal Gamma.",
    base: { hp: 68, mp: 38, atk: 11, mag: 11, def: 9, res: 10, agi: 12 }, karma: -150, traits: ["shapeshift", "immune_mental", "barred_cities"], startClass: "r_doppelganger", homeRoom: "mid_outcast",
  },
  {
    id: "angel", name: "Angel", category: "heteromorphic",
    desc: "Holy being with flight. Resists holy, weak to unholy, starts with +300 karma. Grows into Archangel → Seraph, or falls into a Fallen Angel at low karma.",
    lore: "Heteromorphic despite its divine look. Angels often run into karma conflicts.",
    base: { hp: 68, mp: 45, atk: 11, mag: 13, def: 9, res: 13, agi: 12 }, karma: 300, traits: ["weak_unholy", "resist_holy", "flight"], startClass: "r_angel", homeRoom: "mid_outcast",
  },
  {
    id: "dragonoid", name: "Dragonoid", category: "heteromorphic",
    desc: "Draconic body: resists fire, flies, has strong stats. Grows into True Dragonoid → Ancient Dragonoid.",
    lore: "The path of Sebas Tian, butler of Nazarick, created by Touch Me.",
    base: { hp: 90, mp: 30, atk: 14, mag: 10, def: 13, res: 10, agi: 10 }, karma: 0, traits: ["resist_fire", "flight", "barred_cities"], startClass: "r_dragonoid", homeRoom: "mid_outcast",
  },
  {
    id: "werewolf", name: "Werewolf", category: "heteromorphic",
    desc: "Regenerates HP every round. Weak to holy. Grows into Alpha Werewolf → Lycan Sovereign.",
    lore: "The path of Lupusregina Beta, the cheerful (and cruel) battle maid.",
    base: { hp: 85, mp: 25, atk: 14, mag: 8, def: 10, res: 8, agi: 14 }, karma: -50, traits: ["regen", "weak_holy", "darkvision", "barred_cities"], startClass: "r_werewolf", homeRoom: "mid_outcast",
  },
  {
    id: "automaton", name: "Automaton", category: "heteromorphic",
    desc: "Construct: immune to death, poison and mental effects. Weak to lightning, and healing works at half strength. Grows into War Automaton.",
    lore: "The path of CZ2128 Delta (Shizu), gunner of the Pleiades.",
    base: { hp: 85, mp: 25, atk: 12, mag: 10, def: 14, res: 10, agi: 9 }, karma: 0, traits: ["construct", "immune_death", "immune_poison", "immune_mental", "weak_lightning", "barred_cities"], startClass: "r_automaton", homeRoom: "mid_outcast",
  },
];

export const RACE_MAP: Record<string, RaceDef> = Object.fromEntries(RACES.map((r) => [r.id, r]));
