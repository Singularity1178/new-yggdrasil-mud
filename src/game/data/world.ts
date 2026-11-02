import type { MonsterAbility, MonsterDef, Room } from "../types";

// ───────────────────────── MONSTERS ─────────────────────────
const ab = (name: string, chance: number, x: Partial<MonsterAbility> = {}): MonsterAbility => ({ name, chance, power: 1.4, ...x });
const TIMESTOP = ab("Time Stop", 1, { special: "timestop", power: 0 });
const DEATH = (c = 0.35) => ab("Death", 1, { special: "death", deathChance: c, power: 0 });
const GRASP = ab("Grasp Heart", 1, { special: "death", deathChance: 0.45, power: 0 });
const HEAL = ab("Heal", 1, { special: "heal", power: 0 });
const DISPEL = ab("Greater Break Item", 1, { special: "dispel", power: 0 });

function M(id: string, name: string, level: number, family: string, karma: number, o: Partial<MonsterDef> = {}): MonsterDef {
  return { id, name, level, family, karma, ...o };
}
const UND = { traits: ["undead", "immune_death", "immune_mental", "immune_poison"] as MonsterDef["traits"], weak: ["fire", "holy"] as MonsterDef["weak"], immune: ["poison"] as MonsterDef["immune"] };

export const MONSTERS: MonsterDef[] = [
  // Midgard
  M("slime", "Green Slime", 1, "slime", 0, { weak: ["lightning"], resist: ["blunt"], element: "acid", hpMult: 0.8 }),
  M("wolf", "Grey Wolf", 2, "beast", 0, { element: "slash", abilities: [ab("Bite", 1, { power: 1.3 })] }),
  M("goblin_scout", "Goblin Scout", 3, "goblin", -30, { element: "pierce" }),
  M("giant_rat", "Giant Rat", 2, "beast", -5, { element: "pierce", hpMult: 0.7, abilities: [ab("Plague Bite", 1, { status: { id: "poison", chance: 0.3, turns: 3, power: 0.03 } })] }),
  M("forest_spider", "Forest Spider", 5, "insect", -10, { weak: ["fire"], element: "poison", abilities: [ab("Venom Fang", 1, { element: "poison", status: { id: "poison", chance: 0.5, turns: 3, power: 0.04 } })] }),
  M("treant_sapling", "Treant Sapling", 6, "plant", 10, { weak: ["fire"], resist: ["blunt", "pierce"], element: "blunt", hpMult: 1.3 }),
  M("bandit", "Bandit", 7, "human", -60, { element: "slash", gold: 2 }),
  M("bandit_mage", "Bandit Magic Caster", 8, "human", -60, { element: "fire", abilities: [ab("Fireball", 1, { element: "fire", aoe: true, power: 1.1 })], gold: 2 }),
  M("ogre", "Hill Ogre", 10, "giant", -40, { element: "blunt", hpMult: 1.5, atkMult: 1.15, abilities: [ab("Club Smash", 1, { power: 1.6, status: { id: "stun", chance: 0.2, turns: 1 } })] }),
  M("skeleton", "Skeleton", 10, "undead", -50, { ...UND, weak: ["fire", "holy", "blunt"], element: "slash" }),
  M("ghoul", "Ghoul", 12, "undead", -60, { ...UND, element: "slash", abilities: [ab("Paralyzing Claw", 1, { status: { id: "stun", chance: 0.25, turns: 1 } })] }),
  M("zombie", "Rotting Zombie", 11, "undead", -40, { ...UND, element: "blunt", hpMult: 1.4 }),
  M("treant_guardian", "Forest Guardian Treant", 11, "plant", 50, { boss: true, hpMult: 4, atkMult: 1.2, weak: ["fire"], resist: ["blunt", "pierce"], element: "blunt", abilities: [ab("Root Crush", 1, { power: 1.6, aoe: true }), ab("Bark Heal", 0.4, { special: "heal" })], drops: [{ id: "ring_sustenance", chance: 0.15 }] }),
  M("catacomb_lord", "Catacomb Lord (Elder Lich)", 16, "undead", -120, { ...UND, boss: true, hpMult: 4.2, element: "unholy", abilities: [ab("Fireball", 1, { element: "fire", aoe: true }), ab("Summon Skeletons", 0.4, { special: "summon" }), ab("Negative Ray", 1, { element: "unholy", power: 1.7 })], drops: [{ id: "bone_crown", chance: 0.12 }] }),
  // Alfheim
  M("pixie", "Mischief Pixie", 13, "fae", 20, { element: "void", hpMult: 0.7, abilities: [ab("Sleep Dust", 1, { status: { id: "stun", chance: 0.3, turns: 1 }, power: 0.6 })] }),
  M("dire_wolf", "Dire Wolf", 14, "beast", 0, { element: "slash" }),
  M("dryad", "Dryad", 16, "fae", 40, { element: "pierce", abilities: [ab("Thorn Lash", 1), HEAL] }),
  M("will_o_wisp", "Will-o'-Wisp", 18, "spirit", -20, { element: "lightning", resist: ["slash", "pierce", "blunt"], hpMult: 0.8 }),
  M("water_spirit", "Lake Spirit", 20, "elemental", 10, { element: "ice", weak: ["lightning"], immune: ["ice"] }),
  M("dark_elf_ranger", "Rogue Dark Elf Ranger", 22, "human", -40, { element: "pierce", abilities: [ab("Arrow Rain", 1, { aoe: true, power: 1.2 })], gold: 2 }),
  M("grove_elder", "Elder Spirit of the Grove", 26, "fae", 80, { boss: true, hpMult: 4.2, element: "lightning", abilities: [ab("Call Lightning", 1, { element: "lightning", power: 1.8 }), ab("Nature's Wrath", 1, { aoe: true, element: "blunt" }), HEAL], drops: [{ id: "elven_starbow", chance: 0.18 }, { id: "tarnkappe", chance: 0.05 }] }),
  // Vanaheim
  M("hippogriff", "Hippogriff", 23, "beast", 10, { element: "slash" }),
  M("vanir_warrior", "Vanir Warrior Spirit", 26, "spirit", 30, { element: "slash", resist: ["unholy"] }),
  M("golem", "Stone Golem", 28, "construct", 0, { traits: ["immune_death", "immune_mental", "immune_poison", "construct"], resist: ["slash", "pierce"], weak: ["blunt", "lightning"], hpMult: 1.8, defMult: 1.4, element: "blunt" }),
  M("harpy", "Storm Harpy", 30, "beast", -30, { element: "lightning", abilities: [ab("Shriek", 1, { status: { id: "fear", chance: 0.4, turns: 2 }, power: 0.8, aoe: true })] }),
  M("archangel_flame", "Archangel Flame", 31, "angel", 150, { element: "fire", resist: ["holy"], weak: ["unholy"] }),
  M("storm_roc", "Storm Roc", 36, "beast", 0, { boss: true, hpMult: 4.5, element: "lightning", abilities: [ab("Thunder Dive", 1, { power: 1.9, element: "lightning" }), ab("Gale", 1, { aoe: true, element: "slash" })], drops: [{ id: "tarnkappe", chance: 0.1 }] }),
  // Nidavellir
  M("kobold_miner", "Kobold Miner", 33, "goblin", -20, { element: "blunt", gold: 2 }),
  M("rock_worm", "Rock Worm", 35, "beast", 0, { element: "acid", hpMult: 1.6, resist: ["slash"] }),
  M("dark_dwarf", "Dark Dwarf Runecaster", 37, "human", -80, { element: "fire", abilities: [ab("Rune Blast", 1, { element: "fire", power: 1.7 })], gold: 2 }),
  M("iron_golem", "Iron Golem", 40, "construct", 0, { traits: ["immune_death", "immune_mental", "immune_poison", "construct"], resist: ["slash", "pierce", "fire"], weak: ["lightning", "acid"], hpMult: 2, defMult: 1.5, element: "blunt" }),
  M("fire_elemental", "Fire Elemental", 41, "elemental", 0, { element: "fire", immune: ["fire"], weak: ["ice"] }),
  M("magma_wyrm", "Magma Wyrm", 46, "dragon", -50, { boss: true, hpMult: 5, element: "fire", immune: ["fire"], weak: ["ice"], abilities: [ab("Magma Breath", 1, { aoe: true, element: "fire", power: 1.6, status: { id: "burn", chance: 0.5, turns: 3, power: 0.04 } }), ab("Tail Lash", 1, { power: 1.8 })], drops: [{ id: "dwarven_rune_axe", chance: 0.2 }, { id: "mat_adamantite", chance: 0.6 }] }),
  // Jotunheim
  M("frost_wolf", "Frost Wolf", 43, "beast", 0, { element: "ice", immune: ["ice"], weak: ["fire"] }),
  M("troll", "Ice Troll", 46, "giant", -60, { element: "blunt", hpMult: 1.7, traits: ["regen"], weak: ["fire", "acid"] }),
  M("frost_giant", "Frost Giant", 49, "giant", -50, { element: "ice", immune: ["ice"], weak: ["fire"], hpMult: 1.9, atkMult: 1.2 }),
  M("yeti", "Yeti", 47, "beast", 0, { element: "ice", resist: ["ice"] }),
  M("giant_shaman", "Giant Shaman", 51, "giant", -60, { element: "ice", abilities: [ab("Blizzard", 1, { aoe: true, element: "ice" }), HEAL] }),
  M("jarl", "Frost Giant Jarl Hrimgrim", 56, "giant", -80, { boss: true, hpMult: 5.5, atkMult: 1.2, element: "ice", immune: ["ice"], weak: ["fire"], abilities: [ab("Glacier Smash", 1, { power: 2, element: "ice", status: { id: "freeze", chance: 0.3, turns: 1 } }), ab("Avalanche", 1, { aoe: true, element: "ice", power: 1.5 })], drops: [{ id: "megingjord", chance: 0.08 }, { id: "mat_star_silver", chance: 0.4 }] }),
  // Niflheim
  M("mist_wraith", "Mist Wraith", 53, "undead", -100, { ...UND, element: "unholy", resist: ["slash", "pierce", "blunt"], abilities: [ab("Life Siphon", 1, { element: "unholy", special: "drain" })] }),
  M("ice_drake", "Ice Drake", 56, "dragon", -20, { element: "ice", immune: ["ice"], weak: ["fire"], hpMult: 1.5, abilities: [ab("Frost Breath", 1, { aoe: true, element: "ice" })] }),
  M("banshee", "Banshee", 58, "undead", -150, { ...UND, element: "unholy", abilities: [ab("Wail", 1, { special: "death", deathChance: 0.25, power: 0 }), ab("Scream", 1, { aoe: true, status: { id: "fear", chance: 0.5, turns: 2 } })] }),
  M("frost_lich", "Frost Lich", 61, "undead", -200, { ...UND, element: "ice", immune: ["ice", "poison"], abilities: [ab("Cone of Cold", 1, { aoe: true, element: "ice", power: 1.6 }), DEATH(0.3)] }),
  M("nidhogg_spawn", "Spawn of Níðhöggr", 66, "dragon", -150, { boss: true, hpMult: 6, element: "poison", traits: ["immune_poison"], abilities: [ab("Venom Breath", 1, { aoe: true, element: "poison", status: { id: "poison", chance: 0.7, turns: 4, power: 0.05 } }), ab("Rend", 1, { power: 2 })], drops: [{ id: "death_ward_amulet", chance: 0.3 }, { id: "mat_star_silver", chance: 0.6 }] }),
  // Helheim
  M("bog_horror", "Grendela Bog Horror", 61, "beast", -80, { element: "acid", hpMult: 1.6 }),
  M("death_knight_m", "Death Knight", 64, "undead", -200, { ...UND, element: "slash", hpMult: 2, abilities: [ab("Flamberge Cleave", 1, { power: 1.7 })] }),
  M("elder_lich_m", "Elder Lich", 66, "undead", -250, { ...UND, element: "unholy", abilities: [ab("Fireball", 1, { aoe: true, element: "fire", power: 1.4 }), DEATH(0.3), ab("Lightning", 1, { element: "lightning", power: 1.7 })] }),
  M("soul_eater", "Soul Eater", 70, "undead", -300, { ...UND, traits: ["undead", "immune_death", "immune_mental", "immune_poison", "immune_timestop"], element: "unholy", abilities: [ab("Soul Devour", 1, { special: "death", deathChance: 0.3, power: 0 }), ab("Trample", 1, { power: 1.8 })] }),
  M("hel_shade", "Shade of Hel", 69, "undead", -300, { ...UND, element: "unholy", resist: ["slash", "pierce", "blunt"] }),
  M("garmr", "Garmr, Hound of Hel", 78, "beast", -350, { boss: true, hpMult: 6.5, atkMult: 1.25, element: "unholy", traits: ["immune_timestop", "immune_death"], abilities: [ab("Hellfire Howl", 1, { aoe: true, element: "fire", power: 1.6 }), ab("Rend Soul", 1, { power: 2.2, element: "unholy" }), TIMESTOP], drops: [{ id: "staff_of_hel", chance: 0.2 }, { id: "chronos_pendant", chance: 0.25 }, { id: "mat_celestial_uranium", chance: 0.3 }] }),
  // Nazarick surface — the 1,500-player raid failed here
  M("old_guarder", "Nazarick Old Guarder", 84, "undead", -300, { ...UND, traits: ["undead", "immune_death", "immune_mental", "immune_poison", "immune_timestop"], element: "slash", hpMult: 1.6 }),
  M("eight_edge", "Eight Edge Assassin", 88, "insect", -300, { traits: ["immune_timestop"], element: "slash", atkMult: 1.3, abilities: [ab("Eight Blades", 1, { power: 0.5, special: undefined, aoe: false }), ab("Assassinate", 1, { special: "death", deathChance: 0.2, power: 0 })] }),
  M("shadow_demon", "Shadow Demon", 86, "demon", -300, { traits: ["immune_timestop"], element: "unholy", weak: ["holy"] }),
  // Muspelheim
  M("fire_giant", "Fire Giant", 77, "giant", -100, { element: "fire", immune: ["fire"], weak: ["ice"], hpMult: 1.9, atkMult: 1.2, traits: ["immune_timestop"] }),
  M("salamander", "Elder Salamander", 79, "elemental", -40, { element: "fire", immune: ["fire"], weak: ["ice"], traits: ["immune_timestop"] }),
  M("efreet", "Efreet Lord", 82, "elemental", -100, { element: "fire", immune: ["fire"], traits: ["immune_timestop"], abilities: [ab("Hellflame", 1, { element: "fire", power: 2, status: { id: "burn", chance: 0.6, turns: 3, power: 0.05 } }), TIMESTOP] }),
  M("flame_dragon", "Crimson Dragon", 85, "dragon", -100, { element: "fire", immune: ["fire"], weak: ["ice"], hpMult: 2, traits: ["immune_timestop"], abilities: [ab("Inferno Breath", 1, { aoe: true, element: "fire", power: 1.7 })] }),
  M("surtr", "Surtr, Lord of Muspelheim", 90, "giant", -300, { boss: true, hpMult: 7, atkMult: 1.3, element: "fire", immune: ["fire"], weak: ["ice"], traits: ["immune_timestop", "immune_death"], abilities: [ab("Flame of Ragnarök", 1, { aoe: true, element: "fire", power: 2 }), ab("Laevateinn Slash", 1, { power: 2.4, element: "fire" }), TIMESTOP], drops: [{ id: "laevateinn", chance: 0.25 }, { id: "brisingamen", chance: 0.05 }, { id: "mat_celestial_uranium", chance: 0.6 }] }),
  // Asgard
  M("einherjar_m", "Einherjar Champion", 89, "human", 150, { element: "slash", traits: ["immune_timestop"], abilities: [ab("Valhalla Strike", 1, { power: 1.8 })] }),
  M("valkyrie_m", "Valkyrie", 92, "angel", 200, { element: "holy", traits: ["immune_timestop"], abilities: [ab("Spear of Light", 1, { element: "holy", power: 1.8 }), HEAL] }),
  M("seraph_m", "Seraph Empyrean", 96, "angel", 400, { element: "holy", resist: ["holy"], weak: ["unholy"], traits: ["immune_timestop", "immune_death"], abilities: [ab("Holy Smite", 1, { element: "holy", aoe: true, power: 1.7 }), TIMESTOP, ab("Fallen Down Fragment", 0.5, { element: "holy", power: 2.6 })] }),
  M("aesir_guard", "Aesir Sentinel", 94, "construct", 100, { traits: ["immune_timestop", "immune_death", "construct"], element: "lightning", hpMult: 2, defMult: 1.3 }),
  M("odin_shadow", "Shadow of Odin, the All-Father", 100, "god", 200, { boss: true, hpMult: 8, atkMult: 1.35, element: "lightning", traits: ["immune_timestop", "immune_death", "immune_mental"], abilities: [ab("Gungnir Throw", 1, { power: 2.6, element: "lightning" }), ab("Rune of Annihilation", 1, { aoe: true, power: 2 }), TIMESTOP, DISPEL], drops: [{ id: "gungnir", chance: 0.25 }, { id: "mjolnir", chance: 0.15 }, { id: "brisingamen", chance: 0.15 }] }),
  // Colosseum champions (Tournament of the Nine Worlds)
  M("champ_1", "Tournament Finalist: 'Ruinous' Warlord", 100, "player", 0, { element: "slash", hpMult: 3, atkMult: 1.2, traits: ["immune_timestop", "immune_death"], abilities: [ab("World Breaker Lite", 1, { power: 2.2 }), ab("Fortress", 0.5, { special: "buff" })] }),
  M("champ_2", "Tournament Finalist: Arch-Sage of Twilight", 100, "player", 0, { element: "fire", hpMult: 2.6, atkMult: 1.25, traits: ["immune_timestop", "immune_death"], abilities: [ab("Vermillion Nova", 1, { element: "fire", power: 2.4 }), TIMESTOP, GRASP] }),
  M("champ_3", "Reigning World Champion (NPC Record)", 100, "player", 0, { element: "void", hpMult: 4, atkMult: 1.3, traits: ["immune_timestop", "immune_death", "immune_mental"], abilities: [ab("World Break", 1, { power: 3, element: "void" }), ab("Champion's Fortress", 0.4, { special: "buff" }), DISPEL] }),
  // PKers (simulated players hunting heteromorphs)
  M("pker_fighter", "Human PKer [Fighter]", 10, "player", -100, { element: "slash", hpMult: 1.4, atkMult: 1.15, abilities: [ab("Power Strike", 1, { power: 1.7 })], gold: 4 }),
  M("pker_cleric", "Human PKer [Cleric]", 10, "player", -100, { element: "holy", hpMult: 1.2, abilities: [ab("Holy Smite", 1, { element: "holy", power: 1.6 }), HEAL], gold: 4 }),
  M("pker_mage", "Human PKer [Wizard]", 10, "player", -100, { element: "fire", hpMult: 1.0, abilities: [ab("Fireball", 1, { aoe: true, element: "fire", power: 1.4 })], gold: 4 }),
  // WORLD ENEMIES
  M("we_wrath", "Demon Lord of Wrath [World Enemy]", 100, "demon", -500, { boss: true, worldEnemy: true, hpMult: 22, atkMult: 1.6, element: "fire", weak: ["holy"], immune: ["fire"], traits: ["immune_timestop", "immune_death", "immune_mental"], abilities: [ab("Seventh Hellfire", 1, { aoe: true, element: "fire", power: 2.2 }), ab("Wrathful Annihilation", 1, { power: 3, element: "unholy" }), TIMESTOP, DISPEL, GRASP], drops: [{ id: "abyssal_blade", chance: 0.5 }] }),
  M("we_nidhogg", "Níðhöggr, Devourer of the World Tree [World Enemy]", 100, "dragon", -400, { boss: true, worldEnemy: true, hpMult: 25, atkMult: 1.55, element: "poison", traits: ["immune_timestop", "immune_death", "immune_poison", "immune_mental"], abilities: [ab("Root-Rot Breath", 1, { aoe: true, element: "acid", power: 2.1, status: { id: "defdown", chance: 0.6, turns: 3 } }), ab("World-Gnaw", 1, { power: 3.1 }), TIMESTOP, ab("Corrupting Venom", 1, { element: "poison", status: { id: "poison", chance: 0.8, turns: 4, power: 0.06 } })] }),
  M("we_fenrir", "Fenrir, Wolf of Ragnarök [World Enemy]", 100, "beast", -300, { boss: true, worldEnemy: true, hpMult: 28, atkMult: 1.7, element: "slash", traits: ["immune_timestop", "immune_death", "immune_mental"], abilities: [ab("Sun-Devouring Maw", 1, { power: 3.3 }), ab("Ragnarök Howl", 1, { aoe: true, status: { id: "fear", chance: 0.7, turns: 2 }, power: 1.8 }), TIMESTOP, DISPEL], drops: [{ id: "gungnir", chance: 0.4 }] }),
];
export const MONSTER_MAP: Record<string, MonsterDef> = Object.fromEntries(MONSTERS.map((m) => [m.id, m]));

// ───────────────────────── ROOMS ─────────────────────────
const CITY_SHOP_BASE = ["pot_minor", "pot_heal", "mana_minor", "mana_pot", "neg_vial", "antidote", "return_scroll", "mat_iron"];
export const WORLDS: Record<string, { name: string; hub: string; range: string; desc: string }> = {
  midgard: { name: "Midgard", hub: "mid_town", range: "1-16", desc: "The human realm and starting world." },
  alfheim: { name: "Alfheim", hub: "alf_town", range: "12-26", desc: "Realm of elves and fae." },
  vanaheim: { name: "Vanaheim", hub: "van_town", range: "22-36", desc: "Realm of the Vanir and sky-temples." },
  nidavellir: { name: "Nidavellir", hub: "nid_town", range: "32-46", desc: "Underground realm of dwarves and forges." },
  jotunheim: { name: "Jotunheim", hub: "jot_camp", range: "42-56", desc: "Frozen land of giants." },
  niflheim: { name: "Niflheim", hub: "nif_haven", range: "52-66", desc: "Primordial mist and ice." },
  helheim: { name: "Helheim", hub: "hel_city", range: "60-78 (Nazarick 84-88)", desc: "Realm of the dead. The Great Tomb of Nazarick lies in its Grendela Swamp." },
  muspelheim: { name: "Muspelheim", hub: "mus_forge", range: "75-90", desc: "Realm of fire giants." },
  asgard: { name: "Asgard", hub: "asg_landing", range: "88-100", desc: "Realm of the gods. Valhalla bars heteromorphs." },
};

const svc = (...s: NonNullable<Room["services"]>) => s;
export const ROOMS: Room[] = [
  // ─── Midgard ───
  { id: "mid_town", name: "Freya's Crossing", world: "midgard", city: "humanoid", safe: true, services: svc("temple", "shop", "forge", "inn", "gacha", "gate", "hall"), shop: [...CITY_SHOP_BASE, "scroll_raise_dead"], exits: { e: "mid_plains" }, desc: "A bustling human town and the start of many adventures. Banners flutter over the Resurrection Temple. Guards eye heteromorphs with open hostility." },
  { id: "mid_outcast", name: "Outcast Hollow", world: "midgard", city: "heteromorph", safe: true, services: svc("temple", "shop", "forge", "inn", "gacha", "gate", "altar", "hall"), shop: [...CITY_SHOP_BASE, "neg_vial_greater"], exits: { w: "mid_plains" }, desc: "A hidden hamlet where heteromorphic players gather, away from the PKers. Someone has scrawled 'Ainz Ooal Gown was here' on a wall." },
  { id: "mid_plains", name: "Green Plains", world: "midgard", levelRange: [1, 4], encounters: ["slime", "wolf", "goblin_scout", "giant_rat"], rate: 0.55, exits: { w: "mid_town", e: "mid_outcast", n: "mid_forest", s: "mid_hills" }, desc: "Rolling green fields where new players hunt slimes. The towns lie west and east." },
  { id: "mid_forest", name: "Old Forest", world: "midgard", levelRange: [4, 8], encounters: ["forest_spider", "treant_sapling", "wolf", "goblin_scout"], rate: 0.6, exits: { s: "mid_plains", n: "mid_shrine" }, desc: "Ancient trees blot out the sun. Spider webs glisten between the branches." },
  { id: "mid_shrine", name: "Deep Forest Shrine", world: "midgard", levelRange: [8, 11], encounters: ["treant_sapling", "forest_spider"], rate: 0.45, boss: "treant_guardian", exits: { s: "mid_forest" }, desc: "A moss-covered shrine guarded by a towering treant. (Type 'challenge' to fight the boss.)" },
  { id: "mid_hills", name: "Bandit Hills", world: "midgard", levelRange: [6, 11], encounters: ["bandit", "bandit_mage", "ogre", "wolf"], rate: 0.6, exits: { n: "mid_plains", d: "mid_catacombs" }, desc: "Rocky hills full of bandit camps, a popular PK spot. Stairs lead down into old catacombs." },
  { id: "mid_catacombs", name: "Midgard Catacombs", world: "midgard", levelRange: [10, 16], encounters: ["skeleton", "ghoul", "zombie"], rate: 0.65, boss: "catacomb_lord", exits: { u: "mid_hills" }, desc: "Cold stone corridors lined with bones. An Elder Lich rules the deepest crypt." },
  // ─── Alfheim ───
  { id: "alf_town", name: "Lightglade", world: "alfheim", city: "humanoid", safe: true, services: svc("temple", "shop", "forge", "inn", "gate"), shop: [...CITY_SHOP_BASE, "mat_mithril", "scroll_raise_dead"], exits: { n: "alf_woods" }, desc: "An elven city of crystal towers woven into giant trees." },
  { id: "alf_woods", name: "Glowing Woods", world: "alfheim", levelRange: [12, 17], encounters: ["pixie", "dire_wolf", "dryad"], rate: 0.6, exits: { s: "alf_town", e: "alf_lake", n: "alf_ring" }, desc: "Bioluminescent fungi light the forest floor." },
  { id: "alf_ring", name: "Fairy Ring", world: "alfheim", levelRange: [15, 21], encounters: ["pixie", "will_o_wisp", "dryad"], rate: 0.6, exits: { s: "alf_woods", n: "alf_grove" }, desc: "A circle of mushrooms that hums with fae magic." },
  { id: "alf_lake", name: "Spirit Lake", world: "alfheim", levelRange: [18, 24], encounters: ["water_spirit", "will_o_wisp", "dark_elf_ranger"], rate: 0.6, exits: { w: "alf_woods" }, desc: "A mirror-still lake where spirits dance." },
  { id: "alf_grove", name: "Heart Grove", world: "alfheim", levelRange: [22, 26], encounters: ["dryad", "dark_elf_ranger"], rate: 0.4, boss: "grove_elder", exits: { s: "alf_ring" }, desc: "The heart of Alfheim's forest, guarded by an ancient spirit." },
  // ─── Vanaheim ───
  { id: "van_town", name: "Vanir Haven", world: "vanaheim", city: "neutral", safe: true, services: svc("temple", "shop", "forge", "inn", "gate"), shop: [...CITY_SHOP_BASE, "mat_mithril", "pot_greater", "scroll_raise_dead"], exits: { e: "van_steppe" }, desc: "A neutral trading port. Everyone is welcome, heteromorphs included." },
  { id: "van_steppe", name: "Windswept Steppe", world: "vanaheim", levelRange: [22, 28], encounters: ["hippogriff", "vanir_warrior", "harpy"], rate: 0.6, exits: { w: "van_town", e: "van_ruins" }, desc: "Endless grassland under a vast sky." },
  { id: "van_ruins", name: "Vanir Ruins", world: "vanaheim", levelRange: [26, 32], encounters: ["golem", "vanir_warrior", "archangel_flame"], rate: 0.6, exits: { w: "van_steppe", u: "van_sky" }, desc: "Collapsed temples guarded by golems and wandering angels." },
  { id: "van_sky", name: "Sky Temple", world: "vanaheim", levelRange: [30, 36], encounters: ["harpy", "archangel_flame"], rate: 0.5, boss: "storm_roc", exits: { d: "van_ruins" }, desc: "A temple floating among storm clouds." },
  // ─── Nidavellir ───
  { id: "nid_town", name: "Forgehold", world: "nidavellir", city: "humanoid", safe: true, services: svc("temple", "shop", "forge", "inn", "gate"), shop: [...CITY_SHOP_BASE, "mat_mithril", "mat_orichalcum", "pot_greater", "mana_greater", "scroll_resurrection"], exits: { d: "nid_mines" }, desc: "A great dwarven forge-city. The hammers never stop. Forging here costs 20% less." },
  { id: "nid_mines", name: "Deep Mines", world: "nidavellir", levelRange: [32, 38], encounters: ["kobold_miner", "rock_worm", "dark_dwarf"], rate: 0.6, exits: { u: "nid_town", d: "nid_deep" }, desc: "Twisting mine shafts full of ore and danger." },
  { id: "nid_deep", name: "Rune Halls", world: "nidavellir", levelRange: [36, 42], encounters: ["iron_golem", "dark_dwarf", "fire_elemental"], rate: 0.6, exits: { u: "nid_mines", d: "nid_magma" }, desc: "Ancient halls carved with glowing runes." },
  { id: "nid_magma", name: "Magma Core", world: "nidavellir", levelRange: [40, 46], encounters: ["fire_elemental", "rock_worm"], rate: 0.45, boss: "magma_wyrm", exits: { u: "nid_deep" }, desc: "Rivers of lava. A wyrm sleeps in the molten heart." },
  // ─── Jotunheim ───
  { id: "jot_camp", name: "Giant's Gate Camp", world: "jotunheim", city: "neutral", safe: true, services: svc("temple", "shop", "forge", "inn", "gate"), shop: [...CITY_SHOP_BASE, "mat_orichalcum", "mat_adamantite", "pot_greater", "mana_greater", "scroll_resurrection"], exits: { n: "jot_tundra" }, desc: "An adventurers' camp at the foot of colossal mountains." },
  { id: "jot_tundra", name: "Frozen Tundra", world: "jotunheim", levelRange: [42, 48], encounters: ["frost_wolf", "yeti", "troll"], rate: 0.6, exits: { s: "jot_camp", n: "jot_peaks" }, desc: "Blizzards howl across endless ice." },
  { id: "jot_peaks", name: "Giant Peaks", world: "jotunheim", levelRange: [46, 52], encounters: ["frost_giant", "troll", "giant_shaman"], rate: 0.6, exits: { s: "jot_tundra", n: "jot_hall" }, desc: "Mountain passes guarded by giants." },
  { id: "jot_hall", name: "Hall of the Jarl", world: "jotunheim", levelRange: [50, 56], encounters: ["frost_giant", "giant_shaman"], rate: 0.4, boss: "jarl", exits: { s: "jot_peaks" }, desc: "A great hall of ice where the Frost Giant Jarl sits enthroned." },
  // ─── Niflheim ───
  { id: "nif_haven", name: "Mistward Outpost", world: "niflheim", city: "neutral", safe: true, services: svc("temple", "shop", "forge", "inn", "gate"), shop: [...CITY_SHOP_BASE, "mat_adamantite", "pot_greater", "mana_greater", "scroll_resurrection", "death_ward_amulet"], exits: { e: "nif_mist" }, desc: "A lantern-lit outpost in the eternal fog." },
  { id: "nif_mist", name: "Primordial Mist", world: "niflheim", levelRange: [52, 58], encounters: ["mist_wraith", "ice_drake", "banshee"], rate: 0.6, exits: { w: "nif_haven", e: "nif_glacier" }, desc: "You can barely see your own hand." },
  { id: "nif_glacier", name: "Eternal Glacier", world: "niflheim", levelRange: [56, 62], encounters: ["ice_drake", "frost_lich", "banshee"], rate: 0.6, exits: { w: "nif_mist", d: "nif_well" }, desc: "A glacier older than the worlds themselves." },
  { id: "nif_well", name: "Hvergelmir Spring", world: "niflheim", levelRange: [60, 66], encounters: ["frost_lich", "ice_drake"], rate: 0.4, boss: "nidhogg_spawn", exits: { u: "nif_glacier", d: "nif_roots" }, desc: "The boiling spring from which all rivers flow. Something huge gnaws in the depths below." },
  { id: "nif_roots", name: "Roots of the World Tree", world: "niflheim", levelRange: [100, 100], boss: "we_nidhogg", exits: { u: "nif_well" }, desc: "WORLD ENEMY ZONE. The roots of Yggdrasil itself, gnawed by Níðhöggr. In YGGDRASIL, World Enemies were raid bosses fought by whole guilds." },
  // ─── Helheim ───
  { id: "hel_city", name: "Necropolis of Hel", world: "helheim", city: "heteromorph", safe: true, services: svc("temple", "shop", "forge", "inn", "gacha", "gate", "altar"), shop: [...CITY_SHOP_BASE, "neg_vial_greater", "mat_adamantite", "mat_star_silver", "pot_supreme", "mana_greater", "scroll_true_res", "chronos_pendant", "death_ward_amulet"], exits: { n: "hel_swamp", e: "hel_wastes" }, desc: "A city of the dead that welcomes heteromorphs. Humans pay double here." },
  { id: "hel_swamp", name: "Grendela Swamp", world: "helheim", levelRange: [60, 67], encounters: ["bog_horror", "death_knight_m", "hel_shade"], rate: 0.6, exits: { s: "hel_city", n: "nazarick" }, desc: "A poisonous swamp full of giant frog-like monsters. Somewhere to the north lies a great tomb." },
  { id: "nazarick", name: "Great Tomb of Nazarick (Surface)", world: "helheim", levelRange: [84, 88], encounters: ["old_guarder", "eight_edge", "shadow_demon", "soul_eater"], rate: 0.7, exits: { s: "hel_swamp" }, desc: "The legendary stronghold of the guild Ainz Ooal Gown. Here, 41 members repelled a raid of 1,500 players. The mausoleum doors are sealed. Only the 41 Supreme Beings may enter. Its guards are merciless." },
  { id: "hel_wastes", name: "Wastes of the Dead", world: "helheim", levelRange: [65, 72], encounters: ["elder_lich_m", "soul_eater", "hel_shade", "death_knight_m"], rate: 0.6, exits: { w: "hel_city", e: "hel_gate", d: "hel_abyss" }, desc: "Grey ashen plains where the undead march endlessly. A chasm opens downward." },
  { id: "hel_gate", name: "Gates of Hel", world: "helheim", levelRange: [70, 78], encounters: ["soul_eater", "elder_lich_m"], rate: 0.4, boss: "garmr", exits: { w: "hel_wastes" }, desc: "The black gates guarded by the hound Garmr." },
  { id: "hel_abyss", name: "Seventh Abyss", world: "helheim", levelRange: [100, 100], boss: "we_wrath", exits: { u: "hel_wastes" }, desc: "WORLD ENEMY ZONE. The lair of one of the Seven Demon Lords of the Deadly Sins." },
  // ─── Muspelheim ───
  { id: "mus_forge", name: "Ember Bastion", world: "muspelheim", city: "neutral", safe: true, services: svc("temple", "shop", "forge", "inn", "gate"), shop: [...CITY_SHOP_BASE, "mat_star_silver", "pot_supreme", "mana_greater", "scroll_true_res", "chronos_pendant", "elixir"], exits: { s: "mus_fields" }, desc: "A fortified outpost at the edge of the fire realm." },
  { id: "mus_fields", name: "Burning Fields", world: "muspelheim", levelRange: [75, 82], encounters: ["fire_giant", "salamander", "efreet"], rate: 0.6, exits: { n: "mus_forge", s: "mus_caldera" }, desc: "The ground itself is on fire." },
  { id: "mus_caldera", name: "Great Caldera", world: "muspelheim", levelRange: [80, 87], encounters: ["flame_dragon", "efreet", "fire_giant"], rate: 0.6, exits: { n: "mus_fields", s: "mus_throne" }, desc: "A volcanic crater where crimson dragons nest." },
  { id: "mus_throne", name: "Throne of Surtr", world: "muspelheim", levelRange: [86, 90], encounters: ["fire_giant", "flame_dragon"], rate: 0.4, boss: "surtr", exits: { n: "mus_caldera" }, desc: "A throne of black obsidian. The lord of flames waits for Ragnarök." },
  // ─── Asgard ───
  { id: "asg_landing", name: "Bifröst Landing", world: "asgard", city: "neutral", safe: true, services: svc("temple", "shop", "forge", "inn", "gate"), shop: [...CITY_SHOP_BASE, "mat_star_silver", "mat_celestial_uranium", "pot_supreme", "mana_greater", "scroll_true_res", "chronos_pendant", "elixir"], exits: { n: "asg_valhalla", e: "asg_fields", w: "asg_colosseum" }, desc: "The rainbow bridge lands here. Valhalla shines to the north and the Colosseum stands to the west." },
  { id: "asg_valhalla", name: "Valhalla", world: "asgard", city: "humanoid", safe: true, services: svc("temple", "shop", "inn", "gacha", "hall"), shop: [...CITY_SHOP_BASE, "pot_supreme", "elixir", "mat_celestial_uranium"], exits: { s: "asg_landing" }, desc: "The golden hall of the honored dead. Heteromorphs are forbidden." },
  { id: "asg_colosseum", name: "Colosseum of the Nine Worlds", world: "asgard", safe: true, services: svc("arena"), exits: { e: "asg_landing" }, desc: "Where World Champions are crowned. Type 'arena' for info, or 'challenge <world>' to enter the Tournament for that world's title (Lv95+)." },
  { id: "asg_fields", name: "Fields of Ida", world: "asgard", levelRange: [88, 94], encounters: ["einherjar_m", "valkyrie_m", "aesir_guard"], rate: 0.6, exits: { w: "asg_landing", n: "asg_halls" }, desc: "Golden fields where gods once played." },
  { id: "asg_halls", name: "Halls of the Aesir", world: "asgard", levelRange: [93, 100], encounters: ["seraph_m", "aesir_guard", "valkyrie_m"], rate: 0.6, exits: { s: "asg_fields", u: "asg_throne", e: "asg_ragnarok" }, desc: "Endless corridors of divine light." },
  { id: "asg_throne", name: "Hliðskjálf", world: "asgard", levelRange: [98, 100], boss: "odin_shadow", exits: { d: "asg_halls" }, desc: "The high seat from which all nine worlds can be seen." },
  { id: "asg_ragnarok", name: "Field of Vígríðr", world: "asgard", levelRange: [100, 100], boss: "we_fenrir", exits: { w: "asg_halls" }, desc: "WORLD ENEMY ZONE. The prophesied battlefield of Ragnarök, where Fenrir strains at his chains." },
];
export const ROOM_MAP: Record<string, Room> = Object.fromEntries(ROOMS.map((r) => [r.id, r]));
export const WORLD_ITEM_IDS = ["wi_longinus", "wi_ginnungagap", "wi_downfall", "wi_avarice"];
