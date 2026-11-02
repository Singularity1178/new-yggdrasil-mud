export type StatKey = "hp" | "mp" | "atk" | "mag" | "def" | "res" | "agi";
export type Stats = Record<StatKey, number>;

export type Element =
  | "slash" | "pierce" | "blunt" | "fire" | "ice" | "lightning" | "acid"
  | "holy" | "unholy" | "poison" | "void";

export type RaceCategory = "humanoid" | "demihuman" | "heteromorphic";
export type School = "arcane" | "divine" | "nature" | "necro";
export type WeaponType =
  | "sword" | "greatsword" | "katana" | "axe" | "mace" | "spear" | "scythe" | "dagger"
  | "bow" | "gun" | "staff" | "wand" | "fist" | "whip";
export type ArmorType = "cloth" | "light" | "medium" | "heavy";
export type Slot =
  | "mainhand" | "offhand" | "head" | "body" | "cloak" | "hands" | "feet" | "belt" | "neck" | "ring1" | "ring2";

export type Grade = "low" | "middle" | "high" | "top" | "relic" | "legacy" | "divine" | "world";

export type Trait =
  | "undead" | "immune_death" | "immune_mental" | "immune_poison" | "immune_crit" | "immune_paralysis"
  | "immune_timestop" | "heal_inverted" | "weak_fire" | "weak_holy" | "weak_blunt" | "weak_ice"
  | "weak_unholy" | "weak_lightning" | "resist_physical" | "resist_fire" | "resist_ice" | "resist_holy"
  | "resist_unholy" | "immune_fire" | "immune_ice" | "immune_acid" | "immune_holy" | "immune_unholy"
  | "regen" | "lifedrain" | "flight" | "darkvision" | "world_item_holder" | "resist_death"
  | "barred_cities" | "shapeshift" | "construct" | "resist_lightning";

export type StatusId =
  | "stun" | "timestop" | "fear" | "poison" | "burn" | "slow" | "silence" | "charm" | "bleed"
  | "defdown" | "atkdown" | "freeze" | "despair";

export interface ClassReq {
  classes?: Record<string, number>;
  anyOf?: Record<string, number>; // at least one of these at given level
  karmaMin?: number;
  karmaMax?: number;
  totalLevel?: number;
  races?: string[]; // race ids
  raceCategories?: RaceCategory[];
  notRaceTags?: Trait[]; // e.g. undead cannot take
  achievement?: string;
  title?: string; // title prefix required (e.g. world_champion)
}

export interface ClassDef {
  id: string;
  name: string;
  kind: "racial" | "job";
  rank: "base" | "advanced" | "rare" | "world";
  maxLevel: number;
  desc: string;
  req: ClassReq;
  stats: Partial<Stats>; // per level
  schools?: { school: School; cap: number }[];
  weapons?: WeaponType[];
  armor?: ArmorType[];
  skills?: { level: number; id: string }[];
  traits?: { level: number; trait: Trait }[];
  casterWeight?: number; // contributes to spell slots / metamagic (0..1)
  tags?: string[];
}

export interface RaceDef {
  id: string;
  name: string;
  category: RaceCategory;
  desc: string;
  lore: string;
  base: Stats;
  karma: number;
  traits: Trait[];
  startClass?: string; // racial class taken at level 1 for demi/hetero
  homeRoom: string;
}

export interface StatusApply { id: StatusId; chance: number; turns: number; power?: number }
export interface BuffApply { id: string; name: string; turns: number; mods?: Partial<Stats>; flags?: string[] }
export interface SummonSpec {
  name: string; level: number; // negative = offset from caster level
  count?: number; mult?: number; taunt?: boolean; turns: number; element?: Element; undying?: boolean;
}

export interface Effect {
  kind: "damage" | "heal" | "buff" | "debuff" | "death" | "timestop" | "summon" | "cleanse" | "special";
  stat?: "atk" | "mag";
  power?: number;
  element?: Element;
  aoe?: boolean;
  hits?: number;
  status?: StatusApply;
  buff?: BuffApply;
  summon?: SummonSpec;
  deathChance?: number;
  onResist?: StatusId;
  drain?: number;
  karmaScale?: "good" | "evil";
  ignoreDef?: boolean;
  magicArrow?: boolean;
  special?: string;
  turns?: number; // timestop turns
  selfHpCost?: number; // fraction
}

export interface SpellDef {
  id: string;
  name: string;
  tier: number; // 0..10, 11 = Super Tier
  schools: School[];
  mp: number;
  desc: string;
  effect: Effect;
  combatOnly?: boolean;
}

export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  cd?: number; // combat turns cooldown
  perDay?: number; // uses per in-game day
  cdHours?: number; // in-game hours cooldown
  mp?: number;
  effect?: Effect;
  passive?: { mods?: Partial<Stats>; traits?: Trait[] };
}

export interface Restrictions {
  classes?: string[]; // need any of these class ids
  raceCategories?: RaceCategory[];
  notRaceTags?: Trait[];
  karmaMin?: number;
  karmaMax?: number;
  races?: string[];
}

export interface Item {
  uid: string;
  id: string;
  name: string;
  type: "weapon" | "armor" | "accessory" | "consumable" | "crystal" | "material" | "world" | "cash";
  grade: Grade;
  level: number;
  slot?: Slot | "ring";
  weaponType?: WeaponType;
  armorType?: ArmorType;
  twoHanded?: boolean;
  power?: number;
  element?: Element;
  stats?: Partial<Stats>;
  traits?: Trait[];
  restrict?: Restrictions;
  capacity?: number;
  crystals?: string[];
  use?: string; // consumable effect id
  price: number;
  desc: string;
  qty?: number;
  twenty?: boolean; // one of the Twenty world items (single-use)
}

export interface MonsterAbility {
  name: string;
  power?: number;
  element?: Element;
  aoe?: boolean;
  status?: StatusApply;
  chance: number; // weight
  special?: "timestop" | "death" | "heal" | "drain" | "summon" | "buff" | "dispel";
  deathChance?: number;
}

export interface MonsterDef {
  id: string;
  name: string;
  level: number;
  family: string; // undead, demon, angel, human, beast, insect, dragon, elemental, giant, construct, fae, player
  karma: number;
  hpMult?: number;
  atkMult?: number;
  defMult?: number;
  element?: Element;
  traits?: Trait[];
  weak?: Element[];
  resist?: Element[];
  immune?: Element[];
  abilities?: MonsterAbility[];
  boss?: boolean;
  worldEnemy?: boolean;
  drops?: { id: string; chance: number }[];
  gold?: number;
  desc?: string;
}

export interface Room {
  id: string;
  name: string;
  world: string;
  desc: string;
  exits: Partial<Record<"n" | "s" | "e" | "w" | "u" | "d", string>>;
  safe?: boolean;
  city?: "humanoid" | "heteromorph" | "neutral";
  services?: ("temple" | "shop" | "forge" | "inn" | "gacha" | "gate" | "arena" | "altar" | "hall")[];
  encounters?: string[];
  rate?: number;
  boss?: string;
  levelRange?: [number, number];
  shop?: string[];
}

export interface Buff { id: string; name: string; turns: number; mods?: Partial<Stats>; flags?: string[] }
export interface StatusInst { id: StatusId; turns: number; power?: number }

export interface Combatant {
  key: string;
  defId: string;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  atk: number;
  mag: number;
  def: number;
  res: number;
  agi: number;
  karma: number;
  family: string;
  element: Element;
  traits: Trait[];
  weak: Element[];
  resist: Element[];
  immune: Element[];
  abilities: MonsterAbility[];
  statuses: StatusInst[];
  boss?: boolean;
  worldEnemy?: boolean;
  charmed?: boolean;
}

export interface Summon {
  key: string;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  atk: number;
  element: Element;
  turns: number;
  taunt?: boolean;
  undying?: boolean;
  buffs?: SummonBuff[]; // buffs cast on this summon by the player
}

export interface SummonBuff { id: string; name: string; turns: number; mods: Partial<Stats>; flags?: string[] }

export interface CombatState {
  enemies: Combatant[];
  summons: Summon[];
  round: number;
  superCasting?: { spellId: string; turnsLeft: number; meta?: string[] };
  bossRoom?: string;
  arena?: { world: string; round: number };
  playerTimestop?: number; // turns player is frozen
  flee?: boolean;
  goalActive?: boolean;
  perfectWarrior?: boolean;
  usedTenthOrSuperFinisher?: boolean;
  noFlee?: boolean;
  pk?: boolean;
}

export interface CharState {
  name: string;
  raceId: string;
  karma: number;
  exp: number;
  classes: Record<string, number>;
  history: string[];
  hp: number;
  mp: number;
  gold: number;
  room: string;
  respawn: string;
  inventory: Item[];
  equipment: Partial<Record<Slot, Item>>;
  spells: string[];
  cooldowns: Record<string, number>; // combat-turn cooldowns
  timeCd: Record<string, number>; // game-time cooldowns (minute when ready)
  dayUses: Record<string, number>; // per-day uses consumed
  day: number;
  superUsed: number;
  time: number; // game minutes
  combat: CombatState | null;
  buffs: Buff[];
  statuses: StatusInst[];
  achievements: string[];
  counters: Record<string, number>;
  bossKills: Record<string, number>; // bossId -> game time killed
  dead: boolean;
  deathItem?: { room: string; item: Item; until: number } | null;
  gachaTickets: number;
  shootingStar: number;
  event?: { kind: string; data?: Record<string, unknown> } | null;
  titles: string[]; // titles you have earned, e.g. world_champion:asgard
  chronicle: { at: number; text: string }[]; // personal log of milestones
}

export interface Line { t: string; c?: string }
