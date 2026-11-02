import type { ArmorType, Element, Grade, Item, Slot, Stats, Trait, WeaponType } from "../types";

export const GRADES: Record<Grade, { name: string; mult: number; cap: number; color: string; order: number }> = {
  low: { name: "Low Grade", mult: 1.0, cap: 1, color: "#9ca3af", order: 0 },
  middle: { name: "Middle Grade", mult: 1.25, cap: 2, color: "#e5e7eb", order: 1 },
  high: { name: "High Grade", mult: 1.55, cap: 3, color: "#4ade80", order: 2 },
  top: { name: "Top Grade", mult: 1.9, cap: 4, color: "#60a5fa", order: 3 },
  relic: { name: "Relic", mult: 2.3, cap: 5, color: "#c084fc", order: 4 },
  legacy: { name: "Legacy", mult: 2.8, cap: 6, color: "#f59e0b", order: 5 },
  divine: { name: "Divine (God-Class)", mult: 3.5, cap: 8, color: "#f43f5e", order: 6 },
  world: { name: "World Item", mult: 4.5, cap: 0, color: "#fde047", order: 7 },
};
export const GRADE_ORDER: Grade[] = ["low", "middle", "high", "top", "relic", "legacy", "divine"];

export const MATERIAL_NAMES: Record<Grade, string> = {
  low: "Iron", middle: "Steel", high: "Mithril", top: "Orichalcum", relic: "Adamantite", legacy: "Star Silver", divine: "Celestial Uranium", world: "World",
};

/** Forging recipe per grade: material id, qty, gold */
export const FORGE: Record<Exclude<Grade, "world">, { mat: string; qty: number; gold: number; minLevel: number }> = {
  low: { mat: "mat_iron", qty: 1, gold: 80, minLevel: 1 },
  middle: { mat: "mat_iron", qty: 3, gold: 400, minLevel: 5 },
  high: { mat: "mat_mithril", qty: 2, gold: 2000, minLevel: 15 },
  top: { mat: "mat_orichalcum", qty: 2, gold: 8000, minLevel: 30 },
  relic: { mat: "mat_adamantite", qty: 2, gold: 25000, minLevel: 45 },
  legacy: { mat: "mat_star_silver", qty: 2, gold: 80000, minLevel: 60 },
  divine: { mat: "mat_celestial_uranium", qty: 3, gold: 250000, minLevel: 75 },
};

interface EquipType {
  name: string; slot: Slot; weaponType?: WeaponType; armorType?: ArmorType; twoHanded?: boolean;
  power?: number; element?: Element; per: Partial<Stats>;
}
export const EQUIP_TYPES: Record<string, EquipType> = {
  longsword: { name: "Longsword", slot: "mainhand", weaponType: "sword", power: 1.0, element: "slash", per: { atk: 1.2 } },
  greatsword: { name: "Greatsword", slot: "mainhand", weaponType: "greatsword", twoHanded: true, power: 1.35, element: "slash", per: { atk: 1.7 } },
  katana: { name: "Katana", slot: "mainhand", weaponType: "katana", twoHanded: true, power: 1.25, element: "slash", per: { atk: 1.5, agi: 0.3 } },
  axe: { name: "Battle Axe", slot: "mainhand", weaponType: "axe", power: 1.1, element: "slash", per: { atk: 1.3 } },
  mace: { name: "Mace", slot: "mainhand", weaponType: "mace", power: 1.05, element: "blunt", per: { atk: 1.2, res: 0.2 } },
  spear: { name: "Spear", slot: "mainhand", weaponType: "spear", twoHanded: true, power: 1.25, element: "pierce", per: { atk: 1.55 } },
  scythe: { name: "War Scythe", slot: "mainhand", weaponType: "scythe", twoHanded: true, power: 1.3, element: "slash", per: { atk: 1.5, mag: 0.4 } },
  dagger: { name: "Dagger", slot: "mainhand", weaponType: "dagger", power: 0.85, element: "pierce", per: { atk: 0.9, agi: 0.5 } },
  bow: { name: "Longbow", slot: "mainhand", weaponType: "bow", twoHanded: true, power: 1.15, element: "pierce", per: { atk: 1.45, agi: 0.3 } },
  gun: { name: "Magitech Rifle", slot: "mainhand", weaponType: "gun", twoHanded: true, power: 1.2, element: "pierce", per: { atk: 1.5 } },
  staff: { name: "Staff", slot: "mainhand", weaponType: "staff", twoHanded: true, power: 0.7, element: "blunt", per: { mag: 1.7, mp: 2 } },
  wand: { name: "Wand", slot: "mainhand", weaponType: "wand", power: 0.5, element: "void", per: { mag: 1.15, mp: 1 } },
  gauntlets: { name: "Battle Gauntlets", slot: "mainhand", weaponType: "fist", power: 1.05, element: "blunt", per: { atk: 1.3, agi: 0.2 } },
  whip: { name: "Whip", slot: "mainhand", weaponType: "whip", power: 0.95, element: "slash", per: { atk: 1.1, agi: 0.3 } },
  shield: { name: "Shield", slot: "offhand", armorType: "medium", per: { def: 1.0, res: 0.4 } },
  tome: { name: "Grimoire", slot: "offhand", armorType: "cloth", per: { mag: 0.6, mp: 2 } },
  robe: { name: "Robe", slot: "body", armorType: "cloth", per: { def: 0.5, res: 1.1, mp: 2 } },
  leather: { name: "Leather Armor", slot: "body", armorType: "light", per: { def: 0.9, res: 0.5, agi: 0.3 } },
  chainmail: { name: "Chainmail", slot: "body", armorType: "medium", per: { def: 1.3, res: 0.5, hp: 2 } },
  plate: { name: "Full Plate", slot: "body", armorType: "heavy", per: { def: 1.8, res: 0.5, hp: 4, agi: -0.1 } },
  hood: { name: "Hood", slot: "head", armorType: "cloth", per: { res: 0.5, mp: 1 } },
  helm: { name: "Helm", slot: "head", armorType: "medium", per: { def: 0.6, hp: 1 } },
  greathelm: { name: "Great Helm", slot: "head", armorType: "heavy", per: { def: 0.8, hp: 2 } },
  gloves: { name: "Gloves", slot: "hands", armorType: "light", per: { atk: 0.3, def: 0.3 } },
  boots: { name: "Boots", slot: "feet", armorType: "light", per: { agi: 0.5, def: 0.3 } },
  cloak: { name: "Cloak", slot: "cloak", per: { res: 0.6, agi: 0.2 } },
  belt: { name: "Belt", slot: "belt", per: { hp: 2, def: 0.2 } },
  amulet: { name: "Amulet", slot: "neck", per: { res: 0.5, mp: 1, mag: 0.3 } },
  ring: { name: "Ring", slot: "ring1", per: { atk: 0.25, mag: 0.25, hp: 1 } },
};

let uidCounter = 0;
export const newUid = () => `${Date.now().toString(36)}${(uidCounter++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

export function genEquip(type: string, grade: Grade, level: number, nameOverride?: string): Item {
  const t = EQUIP_TYPES[type] ?? EQUIP_TYPES.longsword;
  const g = GRADES[grade];
  const lv = Math.max(1, level);
  const stats: Partial<Stats> = {};
  for (const [k, v] of Object.entries(t.per)) stats[k as keyof Stats] = Math.round((v as number) * (lv + 4) * g.mult);
  const slot = t.slot === "ring1" ? "ring" : t.slot;
  return {
    uid: newUid(), id: `gen_${type}`, name: nameOverride ?? `${MATERIAL_NAMES[grade]} ${t.name}`, type: t.weaponType ? "weapon" : t.slot.startsWith("ring") || ["neck", "cloak", "belt"].includes(t.slot) ? "accessory" : "armor",
    grade, level: lv, slot, weaponType: t.weaponType, armorType: t.armorType, twoHanded: t.twoHanded,
    power: t.power ? Math.round(t.power * (1 + (g.mult - 1) * 0.25) * 100) / 100 : undefined, element: t.element, stats,
    capacity: g.cap, crystals: [], price: Math.round((lv * 12 + 20) * g.mult * g.mult), desc: `A ${g.name.toLowerCase()} ${t.name.toLowerCase()}.`,
  };
}

// ───── Data Crystals ─────
export const CRYSTAL_KINDS: Record<string, { name: string; stat?: keyof Stats; per?: number; element?: Element; trait?: Trait; minLevel: number; rare?: boolean }> = {
  str: { name: "Strength", stat: "atk", per: 0.45, minLevel: 1 },
  int: { name: "Intellect", stat: "mag", per: 0.45, minLevel: 1 },
  vit: { name: "Vitality", stat: "hp", per: 4, minLevel: 1 },
  spi: { name: "Spirit", stat: "mp", per: 3, minLevel: 1 },
  grd: { name: "Guard", stat: "def", per: 0.45, minLevel: 1 },
  wrd: { name: "Ward", stat: "res", per: 0.45, minLevel: 1 },
  swf: { name: "Swiftness", stat: "agi", per: 0.4, minLevel: 1 },
  fire: { name: "Flame Element", element: "fire", minLevel: 5 },
  ice: { name: "Frost Element", element: "ice", minLevel: 5 },
  lightning: { name: "Thunder Element", element: "lightning", minLevel: 5 },
  holy: { name: "Holy Element", element: "holy", minLevel: 15 },
  unholy: { name: "Unholy Element", element: "unholy", minLevel: 15 },
  acid: { name: "Acid Element", element: "acid", minLevel: 10 },
  fireward: { name: "Fire Resistance", trait: "resist_fire", minLevel: 10 },
  holyward: { name: "Holy Resistance", trait: "resist_holy", minLevel: 20 },
  unholyward: { name: "Unholy Resistance", trait: "resist_unholy", minLevel: 20 },
  iceward: { name: "Ice Resistance", trait: "resist_ice", minLevel: 10 },
  mind: { name: "Mental Immunity", trait: "immune_mental", minLevel: 30, rare: true },
  antivenom: { name: "Poison Immunity", trait: "immune_poison", minLevel: 15, rare: true },
  deathward: { name: "Instant Death Resistance", trait: "resist_death", minLevel: 40, rare: true },
  timestop: { name: "Time Stop Countermeasure", trait: "immune_timestop", minLevel: 60, rare: true },
  vampiric: { name: "Vampiric", trait: "lifedrain", minLevel: 35, rare: true },
  regen: { name: "Regeneration", trait: "regen", minLevel: 35, rare: true },
  flight: { name: "Flight", trait: "flight", minLevel: 25, rare: true },
};

export function genCrystal(kind: string, level: number): Item {
  const k = CRYSTAL_KINDS[kind] ?? CRYSTAL_KINDS.str;
  const lv = Math.max(1, level);
  const stats: Partial<Stats> | undefined = k.stat ? { [k.stat]: Math.max(1, Math.round((k.per ?? 0.4) * (lv + 3))) } : undefined;
  return {
    uid: newUid(), id: `cr_${kind}`, name: `Data Crystal: ${k.name}${k.stat ? ` (Lv${lv})` : ""}`, type: "crystal", grade: k.rare ? "top" : "middle",
    level: lv, stats, element: k.element, traits: k.trait ? [k.trait] : undefined, price: Math.round((k.rare ? 3000 : 25) * (1 + lv / 10)),
    desc: k.stat ? `Embed it to add +${Object.values(stats ?? {})[0]} ${String(k.stat).toUpperCase()}.` : k.element ? `Embed in a weapon to change its element to ${k.element} (+10% power).` : `Embed it to gain the ${k.trait} trait.`,
  };
}

type Def = Omit<Item, "uid">;
const C = (id: string, name: string, use: string, price: number, desc: string, extra: Partial<Def> = {}): Def => ({ id, name, type: "consumable", grade: "middle", level: 1, use, price, desc, ...extra });

export const ITEM_DEFS: Record<string, Def> = {
  // Consumables: YGGDRASIL potions are red, unlike the New World's blue ones
  pot_minor: C("pot_minor", "Minor Healing Potion (red)", "heal:150", 25, "Restores 150 HP. Damages the undead."),
  pot_heal: C("pot_heal", "Healing Potion (red)", "heal:600", 150, "Restores 600 HP. Damages the undead.", { grade: "high" }),
  pot_greater: C("pot_greater", "Greater Healing Potion (red)", "heal:2000", 800, "Restores 2000 HP. Damages the undead.", { grade: "top" }),
  pot_supreme: C("pot_supreme", "Supreme Healing Potion (red)", "heal:6000", 4000, "Restores 6000 HP. Damages the undead.", { grade: "relic" }),
  mana_minor: C("mana_minor", "Minor Mana Potion", "mana:80", 40, "Restores 80 MP."),
  mana_pot: C("mana_pot", "Mana Potion", "mana:350", 250, "Restores 350 MP.", { grade: "high" }),
  mana_greater: C("mana_greater", "Greater Mana Potion", "mana:1200", 1500, "Restores 1200 MP.", { grade: "top" }),
  neg_vial: C("neg_vial", "Vial of Negative Energy", "negheal:0.35", 120, "Heals the undead for 35% of max HP. Harms the living."),
  neg_vial_greater: C("neg_vial_greater", "Greater Vial of Negative Energy", "negheal:0.7", 1200, "Heals the undead for 70% of max HP.", { grade: "top" }),
  antidote: C("antidote", "Panacea", "cleanse", 60, "Cures all status ailments."),
  elixir: C("elixir", "Elixir of Yggdrasil", "full", 12000, "Fully restores HP and MP. Works on undead too.", { grade: "legacy" }),
  return_scroll: C("return_scroll", "Scroll of Return", "return", 100, "Teleports you to your respawn temple (out of combat)."),
  scroll_raise_dead: C("scroll_raise_dead", "Scroll of Raise Dead", "revive:4", 1200, "On death, cuts the level loss from 5 to 4.", { grade: "high" }),
  scroll_resurrection: C("scroll_resurrection", "Scroll of Resurrection", "revive:3", 5000, "On death, cuts the level loss from 5 to 3.", { grade: "top" }),
  scroll_true_res: C("scroll_true_res", "Scroll of True Resurrection", "revive:2", 15000, "On death, cuts the level loss from 5 to 2.", { grade: "relic" }),
  // Cash items (gacha)
  cash_hourglass: C("cash_hourglass", "Hourglass of Instant Casting [Cash]", "hourglass", 0, "Cash item: makes your next Super Tier spell cast instantly.", { type: "cash", grade: "top" }),
  cash_revival: C("cash_revival", "Death Penalty Protection Token [Cash]", "revive:0", 0, "Cash item: on death you lose only a little EXP and no levels.", { type: "cash", grade: "top" }),
  cash_exp: C("cash_exp", "EXP Boost Potion [Cash]", "expboost", 0, "Cash item: double EXP for your next 25 victories.", { type: "cash", grade: "high" }),
  cash_gold: C("cash_gold", "Bag of Gold Coins [Cash]", "gold:5000", 0, "Cash item: worth 5,000 gold.", { type: "cash", grade: "middle" }),
  cash_ticket: C("cash_ticket", "Gacha Ticket", "ticket", 0, "Adds 1 gacha ticket.", { type: "cash", grade: "high" }),
  // Materials (rare metals)
  mat_iron: { id: "mat_iron", name: "Iron Ingot", type: "material", grade: "low", level: 1, price: 20, desc: "Basic forging metal." },
  mat_mithril: { id: "mat_mithril", name: "Mithril Ingot", type: "material", grade: "high", level: 15, price: 600, desc: "Light, strong metal for High Grade items." },
  mat_orichalcum: { id: "mat_orichalcum", name: "Orichalcum Ingot", type: "material", grade: "top", level: 30, price: 2500, desc: "Rare metal for Top Grade items." },
  mat_adamantite: { id: "mat_adamantite", name: "Adamantite Ingot", type: "material", grade: "relic", level: 45, price: 9000, desc: "Hardest common metal. Used for Relic items." },
  mat_star_silver: { id: "mat_star_silver", name: "Star Silver", type: "material", grade: "legacy", level: 60, price: 30000, desc: "Fallen-star metal for Legacy items." },
  mat_celestial_uranium: { id: "mat_celestial_uranium", name: "Celestial Uranium", type: "material", grade: "divine", level: 75, price: 120000, desc: "Ultra-rare metal required for Divine (God-Class) items." },
  // Named equipment
  chronos_pendant: { id: "chronos_pendant", name: "Chronos Pendant", type: "accessory", grade: "top", level: 55, slot: "neck", stats: { res: 60, mp: 80 }, traits: ["immune_timestop"], price: 180000, desc: "Time stop countermeasure. Every player over level 70 needs one." },
  death_ward_amulet: { id: "death_ward_amulet", name: "Amulet of Death Ward", type: "accessory", grade: "high", level: 35, slot: "neck", stats: { res: 30, hp: 100 }, traits: ["resist_death"], price: 45000, desc: "Greatly lowers the chance that instant death works on you." },
  ring_sustenance: { id: "ring_sustenance", name: "Ring of Sustenance", type: "accessory", grade: "high", level: 20, slot: "ring", stats: { hp: 80, mp: 40 }, traits: ["regen"], price: 30000, desc: "No need to eat or sleep. Slowly regenerates HP." },
  holy_avenger: { id: "holy_avenger", name: "Holy Avenger", type: "weapon", grade: "relic", level: 40, slot: "mainhand", weaponType: "sword", power: 1.3, element: "holy", stats: { atk: 150, res: 60 }, capacity: 5, crystals: [], restrict: { classes: ["paladin", "hero"], karmaMin: 100 }, price: 60000, desc: "PALADIN or HERO only. Needs karma of 100 or more." },
  abyssal_blade: { id: "abyssal_blade", name: "Abyssal Blade", type: "weapon", grade: "relic", level: 40, slot: "mainhand", weaponType: "greatsword", twoHanded: true, power: 1.55, element: "unholy", stats: { atk: 190 }, traits: ["lifedrain"], capacity: 5, crystals: [], restrict: { karmaMax: -100 }, price: 60000, desc: "Needs karma of −100 or lower." },
  elven_starbow: { id: "elven_starbow", name: "Elven Starbow", type: "weapon", grade: "relic", level: 30, slot: "mainhand", weaponType: "bow", twoHanded: true, power: 1.35, element: "holy", stats: { atk: 120, agi: 40 }, capacity: 5, crystals: [], restrict: { races: ["elf", "dark_elf"] }, price: 40000, desc: "ELVES only." },
  dwarven_rune_axe: { id: "dwarven_rune_axe", name: "Dwarven Rune Axe", type: "weapon", grade: "relic", level: 30, slot: "mainhand", weaponType: "axe", power: 1.35, element: "fire", stats: { atk: 130, def: 30 }, capacity: 6, crystals: [], restrict: { races: ["dwarf"] }, price: 40000, desc: "DWARVES only. Runes give it extra capacity." },
  bone_crown: { id: "bone_crown", name: "Crown of Bones", type: "armor", grade: "relic", level: 35, slot: "head", armorType: "cloth", stats: { mag: 80, mp: 200, res: 40 }, capacity: 5, crystals: [], restrict: { raceCategories: ["heteromorphic"] }, price: 50000, desc: "HETEROMORPHS only." },
  seraph_halo: { id: "seraph_halo", name: "Halo of the Seraphim", type: "armor", grade: "legacy", level: 60, slot: "head", armorType: "cloth", stats: { mag: 160, res: 120, mp: 300 }, traits: ["immune_holy"], capacity: 6, crystals: [], restrict: { races: ["angel"], karmaMin: 200 }, price: 0, desc: "ANGELS only. Needs karma of 200 or more." },
  shinobi_garb: { id: "shinobi_garb", name: "Shinobi Shozoku", type: "armor", grade: "legacy", level: 60, slot: "body", armorType: "cloth", stats: { agi: 160, def: 90, atk: 60 }, capacity: 6, crystals: [], restrict: { classes: ["ninja"] }, price: 0, desc: "NINJA only." },
  spuit_lance: { id: "spuit_lance", name: "Spuit Lance", type: "weapon", grade: "divine", level: 85, slot: "mainhand", weaponType: "spear", twoHanded: true, power: 1.9, element: "pierce", stats: { atk: 520, agi: 80 }, traits: ["lifedrain"], capacity: 8, crystals: [], price: 0, desc: "Shalltear's god-class lance. Each strike drains HP." },
  hermes_trismegistus: { id: "hermes_trismegistus", name: "Hermes Trismegistus", type: "armor", grade: "divine", level: 90, slot: "body", armorType: "heavy", stats: { def: 620, res: 300, hp: 1500 }, capacity: 8, crystals: [], restrict: { classes: ["guardian", "knight", "dark_knight"] }, price: 0, desc: "Albedo's black full plate. GUARDIAN, KNIGHT or DARK KNIGHT only." },
  shadow_of_yggdrasil: { id: "shadow_of_yggdrasil", name: "Shadow of Yggdrasil", type: "weapon", grade: "divine", level: 85, slot: "mainhand", weaponType: "staff", twoHanded: true, power: 0.9, element: "blunt", stats: { mag: 560, mp: 900, res: 120 }, capacity: 8, crystals: [], restrict: { classes: ["druid", "archdruid", "shaman"] }, price: 0, desc: "Mare's god-class staff. DRUID, ARCHDRUID or SHAMAN only." },
  gungnir: { id: "gungnir", name: "Gungnir", type: "weapon", grade: "divine", level: 95, slot: "mainhand", weaponType: "spear", twoHanded: true, power: 2.0, element: "lightning", stats: { atk: 600, agi: 100 }, capacity: 8, crystals: [], price: 0, desc: "Odin's spear. It never misses." },
  laevateinn: { id: "laevateinn", name: "Laevateinn", type: "weapon", grade: "divine", level: 90, slot: "mainhand", weaponType: "sword", power: 1.8, element: "fire", stats: { atk: 540, mag: 200 }, capacity: 8, crystals: [], price: 0, desc: "The flame sword of Surtr." },
  mjolnir: { id: "mjolnir", name: "Mjölnir", type: "weapon", grade: "divine", level: 90, slot: "mainhand", weaponType: "mace", power: 1.85, element: "lightning", stats: { atk: 560, def: 80 }, capacity: 8, crystals: [], price: 0, desc: "Thor's hammer." },
  staff_of_hel: { id: "staff_of_hel", name: "Staff of Hel", type: "weapon", grade: "divine", level: 85, slot: "mainhand", weaponType: "staff", twoHanded: true, power: 0.9, element: "unholy", stats: { mag: 580, mp: 1000 }, traits: ["immune_timestop"], capacity: 8, crystals: [], restrict: { karmaMax: -200 }, price: 0, desc: "Staff of the queen of Helheim. Needs karma of −200 or lower. Comes with built-in time stop countermeasures." },
  megingjord: { id: "megingjord", name: "Megingjörð", type: "accessory", grade: "legacy", level: 70, slot: "belt", stats: { atk: 200, hp: 800 }, price: 0, desc: "Thor's belt of strength." },
  draupnir: { id: "draupnir", name: "Draupnir", type: "accessory", grade: "legacy", level: 60, slot: "ring", stats: { atk: 60, mag: 60, hp: 300 }, price: 0, desc: "A self-multiplying gold ring. Earns +50% gold." },
  brisingamen: { id: "brisingamen", name: "Brísingamen", type: "accessory", grade: "divine", level: 80, slot: "neck", stats: { mag: 260, res: 200, mp: 600 }, traits: ["immune_timestop", "resist_death"], price: 0, desc: "Freyja's necklace." },
  tarnkappe: { id: "tarnkappe", name: "Tarnkappe", type: "accessory", grade: "legacy", level: 50, slot: "cloak", stats: { agi: 150, res: 80 }, traits: ["flight"], price: 0, desc: "Cloak of concealment." },
  shooting_star: { id: "shooting_star", name: "Ultimate Shooting Star Super [Cash]", type: "accessory", grade: "divine", level: 1, slot: "ring", stats: { mag: 50, atk: 50 }, price: 0, desc: "Super-rare gacha ring with 3 free uses of Wish Upon a Star and no EXP cost. Momonga spent his entire bonus to get it." },
  // World Items
  wi_longinus: { id: "wi_longinus", name: "Longinus", type: "world", grade: "world", level: 1, use: "longinus", twenty: true, price: 0, desc: "One of the Twenty. Single use: completely erases one target, even a World Enemy. The user is erased too (death penalty doubled). Afterwards it vanishes and reappears somewhere in the Nine Worlds." },
  wi_ginnungagap: { id: "wi_ginnungagap", name: "Ginnungagap", type: "world", grade: "world", level: 1, slot: "mainhand", weaponType: "axe", twoHanded: true, power: 2.2, element: "void", stats: { atk: 650, def: 200, mag: 200 }, price: 0, desc: "World Item. Albedo's weapon. All your area attacks deal double damage. Anyone can wield it, regardless of class." },
  wi_downfall: { id: "wi_downfall", name: "Downfall of Castle and Country", type: "world", grade: "world", level: 1, use: "downfall", price: 0, desc: "World Item. Mind control that ignores immunity: the strongest non-World-Enemy foe fights for you. Once per day. It once dominated Shalltear." },
  wi_avarice: { id: "wi_avarice", name: "Avarice and Generosity", type: "world", grade: "world", level: 1, price: 0, desc: "World Item. Passive: absorbs EXP. On death it absorbs the whole penalty, so you lose no levels." },
};

export function makeItem(id: string, qty = 1): Item {
  const d = ITEM_DEFS[id];
  if (!d) throw new Error(`Unknown item ${id}`);
  return { ...structuredClone(d), uid: newUid(), qty: d.type === "consumable" || d.type === "material" || d.type === "cash" ? qty : undefined };
}

export const STACKABLE = (it: Item) => it.type === "consumable" || it.type === "material" || it.type === "cash";

export function itemLabel(it: Item): string {
  const g = GRADES[it.grade];
  const cr = it.capacity ? ` [${it.crystals?.length ?? 0}/${it.capacity}]` : "";
  return `${it.name}${it.qty && it.qty > 1 ? ` x${it.qty}` : ""} <${g.name}>${it.level > 1 && it.type !== "consumable" && it.type !== "material" ? ` Lv${it.level}` : ""}${cr}`;
}

export const GACHA_TABLE: { id: string; w: number }[] = [
  { id: "cash_gold", w: 30 }, { id: "cash_exp", w: 20 }, { id: "cash_hourglass", w: 15 }, { id: "cash_revival", w: 18 },
  { id: "pot_greater", w: 8 }, { id: "elixir", w: 3 }, { id: "ring_sustenance", w: 3 }, { id: "cash_ticket", w: 2.5 }, { id: "shooting_star", w: 0.5 },
];
