import type { Effect, Element, School, SpellDef, StatusApply, StatusId, Stats } from "../types";

const st = (id: StatusId, chance: number, turns: number, power?: number): StatusApply => ({ id, chance, turns, power });
const dm = (power: number, element: Element, x: Partial<Effect> = {}): Effect => ({ kind: "damage", stat: "mag", power, element, ...x });
const bf = (id: string, name: string, turns: number, mods: Partial<Stats> = {}, flags: string[] = []): Effect => ({ kind: "buff", buff: { id, name, turns, mods, flags } });
const su = (name: string, level: number, turns: number, x: Partial<NonNullable<Effect["summon"]>> = {}): Effect => ({ kind: "summon", summon: { name, level, turns, ...x } });
const hl = (power: number, x: Partial<Effect> = {}): Effect => ({ kind: "heal", stat: "mag", power, ...x });
const de = (s: StatusApply, aoe = false): Effect => ({ kind: "debuff", status: s, aoe });

export const mpCost = (tier: number) => (tier === 0 ? 3 : tier >= 11 ? 0 : Math.round(5 + tier * tier * 3.3));

const A: School[] = ["arcane"], D: School[] = ["divine"], N: School[] = ["nature"], X: School[] = ["necro"];
const ANY: School[] = ["arcane", "divine", "nature", "necro"];

function sp(id: string, name: string, tier: number, schools: School[], desc: string, effect: Effect, extra: Partial<SpellDef> = {}): SpellDef {
  return { id, name, tier, schools, mp: mpCost(tier), desc, effect, ...extra };
}

export const SPELLS: SpellDef[] = [
  // ═══ 0th tier (cantrips) ═══
  sp("spark", "Spark", 0, A, "A tiny burst of arcane energy.", dm(0.7, "void")),
  sp("minor_mend", "Minor Mend", 0, D, "Mends small wounds.", hl(0.8)),
  sp("thorn_prick", "Thorn Prick", 0, N, "Shoots a sharp thorn.", dm(0.7, "pierce")),
  sp("chill_touch", "Chill Touch", 0, X, "A touch of negative energy.", dm(0.7, "unholy")),
  // ═══ 1st tier ═══
  sp("magic_arrow", "Magic Arrow", 1, A, "Fires arrows of pure mana. The number of arrows equals the highest tier you can cast, so Momonga fires 10.", dm(0.42, "void", { magicArrow: true })),
  sp("lesser_strength", "Lesser Strength", 1, A, "+15% ATK for 5 turns.", bf("lesser_str", "Lesser Strength", 5, { atk: 15 })),
  sp("sleep", "Sleep", 1, A, "Puts a target to sleep (stun). Fails on the mentally immune.", de(st("stun", 0.6, 2))),
  sp("charm_person", "Charm Person", 1, A, "A low-level charm. Humanoid foes may fight for you.", de(st("charm", 0.45, 2))),
  sp("ray_negative", "Ray of Negative Energy", 1, X, "Negative energy. Hurts the living and heals the undead.", dm(1.0, "unholy")),
  sp("summon_undead_1", "Summon Undead 1st", 1, X, "Summons zombie animals.", su("Zombie Hound", -12, 5, { element: "slash" })),
  sp("light_healing", "Light Healing", 1, D, "Heals minor wounds. Damages undead.", hl(1.2)),
  sp("bless", "Bless", 1, D, "+10% ATK/MAG/DEF for 5 turns.", bf("bless", "Bless", 5, { atk: 10, mag: 10, def: 10 })),
  sp("entangle", "Entangle", 1, N, "Vines hold a foe in place.", de(st("stun", 0.5, 1))),
  sp("acorn_burst", "Acorn Burst", 1, N, "Explosive seeds.", dm(1.0, "blunt")),
  // ═══ 2nd tier ═══
  sp("acid_arrow", "Acid Arrow", 2, A, "A bolt of caustic acid.", dm(1.25, "acid", { status: st("defdown", 0.3, 3) })),
  sp("shockwave", "Shockwave", 2, A, "An invisible shockwave that crushes plate armor.", dm(1.2, "blunt")),
  sp("invisibility", "Invisibility", 2, A, "Turn invisible: evade attacks for 3 turns.", bf("invis", "Invisibility", 3, {}, ["evade"])),
  sp("lesser_dex", "Lesser Dexterity", 2, A, "+20% AGI for 5 turns.", bf("lesser_dex", "Lesser Dexterity", 5, { agi: 20 })),
  sp("fear", "Fear", 2, X, "Fills a target with terror.", de(st("fear", 0.7, 3))),
  sp("middle_cure", "Middle Cure Wounds", 2, D, "Moderate healing.", hl(1.7)),
  sp("summon_angel_2", "Summon Angel 2nd", 2, D, "Summons Angel Guardians.", su("Angel Guardian", -10, 5, { count: 2, element: "holy" })),
  sp("flame_blade", "Flame Blade", 2, N, "A burning scimitar of fire.", dm(1.3, "fire")),
  // ═══ 3rd tier ═══
  sp("fireball", "Fireball", 3, A, "A classic exploding sphere of fire that hits all enemies.", dm(1.15, "fire", { aoe: true, status: st("burn", 0.3, 2, 0.03) })),
  sp("lightning", "Lightning", 3, A, "A bolt of lightning that pierces all enemies in a line.", dm(1.6, "lightning", { aoe: true, power: 1.1 })),
  sp("fly", "Fly", 3, A, "Take to the skies: evasion and +15% AGI.", bf("fly", "Fly", 4, { agi: 15 }, ["evade"])),
  sp("haste", "Haste", 3, A, "+40% AGI for 4 turns, which also boosts crits and dodge.", bf("haste", "Haste", 4, { agi: 40 })),
  sp("slow", "Slow", 3, A, "Slows a foe's movements.", de(st("slow", 0.8, 3))),
  sp("summon_undead_3", "Summon Undead 3rd", 3, X, "Summons Skeletal Warriors.", su("Skeletal Warrior", -9, 6, { count: 2, element: "slash" })),
  sp("summon_angel_3", "Summon Angel 3rd", 3, D, "Summons Archangel Flame, the favorite of the Sunlight Scripture.", su("Archangel Flame", -8, 6, { count: 2, element: "fire" })),
  sp("holy_smite", "Holy Smite", 3, D, "A pillar of holy light.", dm(1.6, "holy", { karmaScale: "good" })),
  sp("lions_heart", "Lion's Heart", 3, D, "Immunity to fear and mental effects, +15% ATK.", bf("lionheart", "Lion's Heart", 6, { atk: 15 }, ["lionheart"])),
  sp("remove_affliction", "Remove Affliction", 3, D, "Removes poison, burn, fear and other ailments.", { kind: "cleanse" }),
  sp("call_lightning", "Call Lightning", 3, N, "Calls lightning from the sky.", dm(1.7, "lightning")),
  // ═══ 4th tier ═══
  sp("wall_of_fire", "Wall of Fire", 4, A, "A blazing wall that hits all enemies.", dm(1.35, "fire", { aoe: true, status: st("burn", 0.5, 3, 0.04) })),
  sp("ice_storm", "Ice Storm", 4, A, "Hail and ice on all enemies.", dm(1.3, "ice", { aoe: true, status: st("slow", 0.3, 2) })),
  sp("enervation", "Enervation", 4, X, "Drains a target's vitality.", dm(1.7, "unholy", { drain: 0.3 })),
  sp("summon_undead_4", "Summon Undead 4th", 4, X, "Summons a Death Warrior.", su("Death Warrior", -8, 6, { element: "slash", taunt: true })),
  sp("holy_ray", "Holy Ray", 4, D, "A focused beam of holy light.", dm(2.0, "holy")),
  sp("cure_serious", "Cure Serious Wounds", 4, D, "Strong healing.", hl(2.4)),
  sp("spike_growth", "Spike Growth", 4, N, "Spikes erupt beneath all enemies.", dm(1.3, "pierce", { aoe: true, status: st("bleed", 0.4, 3, 0.03) })),
  // ═══ 5th tier ═══
  sp("dragon_lightning", "Dragon Lightning", 5, A, "Lightning shaped like a dragon.", dm(2.3, "lightning")),
  sp("cone_of_cold", "Cone of Cold", 5, A, "Freezing blast on all enemies.", dm(1.6, "ice", { aoe: true, status: st("freeze", 0.2, 1) })),
  sp("teleportation", "Teleportation", 5, A, "Out of combat, teleports you to your respawn temple.", { kind: "special", special: "teleport_home" }),
  sp("raise_dead", "Raise Dead", 5, D, "Out of combat, scribes a Scroll of Raise Dead (500g). If you die, it cuts the penalty to −4 levels.", { kind: "special", special: "scribe_raise_dead" }),
  sp("flame_strike", "Flame Strike", 5, D, "Holy fire from the heavens.", dm(2.3, "holy", { status: st("burn", 0.4, 3, 0.04) })),
  sp("insect_plague", "Insect Plague", 5, N, "A plague of insects swarms all enemies.", dm(1.5, "poison", { aoe: true, status: st("poison", 0.6, 3, 0.04) })),
  sp("summon_undead_5", "Summon Undead 5th", 5, X, "Summons Corpse Collectors.", su("Corpse Collector", -7, 6, { count: 2, element: "blunt" })),
  sp("lesser_magic_ward", "Greater Magic Shield", 5, A, "+50% RES for 5 turns.", bf("magicshield", "Greater Magic Shield", 5, { res: 50 })),
  // ═══ 6th tier ═══
  sp("disintegrate", "Disintegrate", 6, A, "A green ray that disintegrates matter.", dm(2.8, "void")),
  sp("control_weather", "Control Weather", 6, N, "Calls a storm that strikes all enemies.", dm(1.9, "lightning", { aoe: true })),
  sp("heal", "Heal", 6, D, "A powerful heal that also cures ailments. Damages undead greatly.", hl(3.5, { special: "cleanse" })),
  sp("antilife_cocoon", "Antilife Cocoon", 6, X, "A barrier against the living: +60% DEF for 3 turns.", bf("cocoon", "Antilife Cocoon", 3, { def: 60 })),
  sp("wall_of_skeleton", "Wall of Skeleton", 6, X, "A wall of bones that taunts enemies.", su("Wall of Skeleton", -5, 4, { taunt: true, mult: 0.6, element: "blunt" })),
  sp("summon_undead_6", "Summon Undead 6th", 6, X, "Summons Bone Vultures.", su("Bone Vulture", -6, 6, { count: 3, element: "pierce" })),
  sp("mass_cure", "Mass Cure Wounds", 6, D, "Heals you and your summons.", hl(2.6, { aoe: true })),
  // ═══ 7th tier ═══
  sp("chain_dragon_lightning", "Chain Dragon Lightning", 7, A, "Dragon lightning that chains through all enemies.", dm(2.2, "lightning", { aoe: true })),
  sp("hellflame", "Hellflame", 7, A, "A tiny black flame that swells to consume its target.", dm(3.2, "fire", { status: st("burn", 0.8, 4, 0.06) })),
  sp("greater_teleportation", "Greater Teleportation", 7, A, "Out of combat, teleports you to any town in your current world.", { kind: "special", special: "teleport_town" }),
  sp("undeath_army", "Undeath Army", 7, X, "Raises an army of undead.", su("Undead Legionnaire", -8, 6, { count: 5, element: "slash" })),
  sp("negative_burst", "Negative Burst", 7, X, "A wave of negative energy hits all enemies. Undead casters are healed.", dm(2.0, "unholy", { aoe: true, special: "negburst" })),
  sp("resurrection", "Resurrection", 7, D, "Out of combat, scribes a Scroll of Resurrection (2,000g). If you die, it cuts the penalty to −3 levels.", { kind: "special", special: "scribe_resurrection" }),
  sp("summon_angel_7", "Summon Angel 7th", 7, D, "Summons a Principality of Observation, which boosts allies' defense.", su("Principality of Observation", -6, 6, { taunt: true, element: "holy", mult: 1.1 })),
  sp("mass_heal", "Mass Heal", 7, D, "Large heal for you and your summons.", hl(3.4, { aoe: true })),
  sp("earth_surge", "Earth Surge", 7, N, "The ground erupts under all enemies.", dm(2.3, "blunt", { aoe: true, status: st("stun", 0.25, 1) })),
  // ═══ 8th tier ═══
  sp("death", "Death", 8, X, "Instant death. Undead and constructs are immune. On a resist, deals a little negative damage.", { kind: "death", deathChance: 0.6, stat: "mag", power: 1.0 }),
  sp("summon_primal_fire", "Summon Primal Fire Elemental", 8, A, "Summons a level-80+ Primal Fire Elemental.", su("Primal Fire Elemental", -2, 6, { element: "fire", mult: 1.15 })),
  sp("greater_hardening", "Greater Hardening", 8, A, "+70% DEF/RES for 4 turns.", bf("hardening", "Greater Hardening", 4, { def: 70, res: 70 })),
  sp("summon_angel_8", "Summon Angel 8th", 8, D, "Summons a Dominion Authority, whose Holy Smite lays waste to cities.", su("Dominion Authority", -1, 6, { element: "holy", mult: 1.25 })),
  sp("sunburst", "Sunburst", 8, D, "Searing holy light on all enemies. Blinds them (ATK down).", dm(2.4, "holy", { aoe: true, status: st("atkdown", 0.6, 3) })),
  sp("earthquake", "Earthquake", 8, N, "Mare's favorite: the earth swallows all enemies.", dm(2.6, "blunt", { aoe: true, status: st("stun", 0.3, 1) })),
  sp("explosion_wn", "Explode Mine", 8, A, "A magic mine that detonates in a large blast.", dm(2.5, "fire", { aoe: true })),
  // ═══ 9th tier ═══
  sp("grasp_heart", "Grasp Heart", 9, X, "Ainz's favorite spell. Crushes the target's heart. If resisted, the target is stunned instead.", { kind: "death", deathChance: 0.7, onResist: "stun", stat: "mag", power: 1.4 }),
  sp("true_death", "True Death", 9, X, "Instant death that leaves nothing to resurrect. Very high chance.", { kind: "death", deathChance: 0.8, stat: "mag", power: 1.2 }),
  sp("cry_banshee", "Cry of the Banshee", 9, X, "An instant death wail that hits all enemies.", { kind: "death", deathChance: 0.45, aoe: true, stat: "mag", power: 0.8 }),
  sp("vermillion_nova", "Vermillion Nova", 9, A, "A pillar of crimson flame. The strongest single-target fire spell below Super Tier.", dm(4.0, "fire")),
  sp("call_greater_thunder", "Call Greater Thunder", 9, A, "Enormous thunderbolts fused from countless strands.", dm(3.6, "lightning", { status: st("stun", 0.25, 1) })),
  sp("explosion", "Explosion", 9, A, "A massive detonation on all enemies.", dm(2.8, "fire", { aoe: true })),
  sp("gravity_maelstrom", "Gravity Maelstrom", 9, A, "A black sphere of crushing gravity.", dm(3.8, "void", { ignoreDef: true })),
  sp("true_resurrection", "True Resurrection", 9, D, "Out of combat, scribes a Scroll of True Resurrection (6,000g). If you die, it cuts the penalty to −2 levels.", { kind: "special", special: "scribe_true_resurrection" }),
  sp("mass_greater_heal", "Mass Greater Heal", 9, D, "Massive healing for you and your summons, plus a cleanse.", hl(4.5, { aoe: true, special: "cleanse" })),
  sp("storm_of_vengeance", "Storm of Vengeance", 9, N, "A storm of acid rain and lightning.", dm(2.8, "lightning", { aoe: true, status: st("defdown", 0.5, 3) })),
  sp("summon_undead_9", "Summon Undead 9th", 9, X, "Summons a Soul Eater, which devours souls.", su("Soul Eater", -2, 6, { element: "unholy", mult: 1.2 })),
  // ═══ 10th tier ═══
  sp("time_stop", "Time Stop", 10, A, "Stops time: enemies lose 3 turns. Anyone without time stop countermeasures is helpless. Most level 70+ foes are immune.", { kind: "timestop", turns: 3 }),
  sp("reality_slash", "Reality Slash", 10, A, "Slices space itself, ignoring nearly all magical defense. A lesser version of World Break.", dm(4.8, "void", { ignoreDef: true }), { mp: 420 }),
  sp("meteor_fall", "Meteor Fall", 10, A, "A blinding meteor falls from the heavens onto all enemies.", dm(3.2, "fire", { aoe: true, status: st("atkdown", 0.5, 2) })),
  sp("armageddon_evil", "Armageddon - Evil", 10, A, "Summons an army of demons. YGGDRASIL players don't think much of them.", su("Armageddon Demon", -15, 6, { count: 8, element: "fire" })),
  sp("perfect_warrior", "Perfect Warrior", 10, A, "Converts your caster levels into warrior power. You can use any weapon and armor (+80% ATK/DEF, +40% HP), but you can't cast spells until the battle ends.", bf("perfect_warrior", "Perfect Warrior", 99, { atk: 80, def: 80, hp: 40 }, ["perfect_warrior"])),
  sp("beryl", "Body of Effulgent Beryl", 10, A, "Reduces blunt damage, and fully negates one blunt hit.", bf("beryl", "Body of Effulgent Beryl", 6, { def: 30 }, ["beryl"])),
  sp("gate", "Gate", 10, A, "Out of combat, opens a Gate to the hub of any of the Nine Worlds, for free.", { kind: "special", special: "gate" }),
  sp("summon_undead_10", "Summon Undead 10th", 10, X, "Summons a Doom Lord or an Elemental Skull.", su("Doom Lord", 0, 6, { element: "unholy", mult: 1.25 })),
  sp("summon_angel_10", "Summon Angel 10th", 10, D, "Summons a Seraph Empyrean.", su("Seraph Empyrean", 0, 6, { element: "holy", mult: 1.3 })),
  sp("uriel", "Uriel", 10, ANY, "Any magic caster can learn it. Does its listed holy fire damage only at +500 karma, and less as karma drops. For an evil caster it's weaker than a 1st-tier spell.", dm(5.2, "holy", { special: "uriel" })),
  sp("wrath_of_yggdrasil", "Wrath of the World Tree", 10, N, "Roots of the World Tree crush all enemies.", dm(3.3, "blunt", { aoe: true, status: st("stun", 0.3, 1) })),
  // ═══ SUPER TIER (level 70+) ═══
  sp("fallen_down", "Fallen Down", 11, ANY, "SUPER TIER. A column of blue-white light erases a target. Nigun's sealed Dominion Authority couldn't even use it.", dm(9.0, "holy", { ignoreDef: true })),
  sp("ia_shub_niggurath", "Iä Shub-Niggurath", 11, ANY, "SUPER TIER. Offers a mass instant-death sacrifice to the Black Goat, then summons 5 Dark Young. Pair it with The Goal of All Life is Death.", { kind: "death", deathChance: 0.85, aoe: true, special: "dark_young", stat: "mag", power: 2.0 }),
  sp("pantheon", "Pantheon", 11, ANY, "SUPER TIER. Summons six level-80 Cherubim Gatekeepers.", su("Cherubim Gatekeeper", 80, 8, { count: 6, element: "holy", taunt: true })),
  sp("creation", "Creation", 11, ANY, "SUPER TIER. Rewrites the field itself. Ainz froze an entire lake with it. Massive ice damage on all enemies, with freeze.", dm(5.0, "ice", { aoe: true, status: st("freeze", 0.7, 2) })),
  sp("wish_upon_a_star", "Wish Upon a Star", 11, ANY, "SUPER TIER. Costs 1 level of EXP (free with the Ultimate Shooting Star Super ring). Grants a random wish.", { kind: "special", special: "wish" }),
];

export const SPELL_MAP: Record<string, SpellDef> = Object.fromEntries(SPELLS.map((s) => [s.id, s]));

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
