export type StatKey = "hp" | "mp" | "atk" | "mag" | "def" | "res" | "agi";
export type Stats = Record<StatKey, number>;

export type Element =
  | "slash" | "pierce" | "blunt" | "fire" | "ice" | "lightning" | "acid"
  | "holy" | "unholy" | "poison" | "void"
  | "silver" // bane of demons and the undead; armor blunts it, but it tears through the unarmored
  | "none"; // typeless: no resistance, immunity or weakness applies (True Dark, Explode Mine, Crystal Dagger)

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
  | "defdown" | "atkdown" | "freeze" | "despair"
  // control (Sleep/Sandman's Sand, Paralysis, Hold, Blindness, Insanity, Dominate)
  | "sleep" | "paralysis" | "hold" | "blind" | "insanity" | "dominate"
  // time & space (Temporal Stasis, Lopsided Duel)
  | "stasis" | "bound"
  // anti-magic & curses (Resist Break, Resist Weakening, Disease, Drown, Energy Drain, Control Amnesia)
  | "resbreak" | "resweak" | "disease" | "drown" | "drained" | "amnesia"
  // enemy-side magic that Dispel / Magic Destruction can strip
  | "empower" | "invisible";

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
export interface BuffApply {
  id: string; name: string; turns: number; mods?: Partial<Stats>; flags?: string[];
  /** Damage reduction (0..1) per damage type while the buff lasts (Body of Effulgent Beryl, Protection Energy...). */
  ward?: Partial<Record<Element, number>>;
  /** Each entry completely negates ONE hit of that damage type, then is used up. */
  negate?: Element[];
  /** Absorb shield sized when cast: caster MAG × poolMult. Only absorbs poolEls damage types if given. */
  poolMult?: number;
  poolEls?: Element[];
  /** Traits granted while active (Undead Form, Aspect of Elemental, Flame Resistance...). */
  traits?: Trait[];
}
export interface SummonSpec {
  name: string; level: number; // negative = offset from caster level
  count?: number; mult?: number; taunt?: boolean; turns: number; element?: Element; undying?: boolean;
  berserk?: number; // chance per round to turn on the summoner (Armageddon - Evil's demons)
  interrupt?: boolean; // spell-interrupting walls (Wall of Skeleton, Wall of Stone)
  corpses?: boolean; // needs fallen enemies to raise (Animate Dead)
}
export interface TrapSpec { name: string; power: number; element: Element; aoe?: boolean; homing?: boolean }
/** A laid magic mine. In battle it waits in CombatState.traps; laid outside battle it is bound to a room until `until`. */
export interface Trap extends TrapSpec { penetrate?: boolean; room?: string; until?: number }

export type EffectKind =
  | "damage" | "heal" | "buff" | "debuff" | "death" | "timestop" | "summon" | "cleanse" | "special"
  | "dispel" // strip enemy magic (Dispel, Magic Destruction), or your own afflictions with 'me'
  | "field" // battlefield magic: Dimensional Lock, Delay Teleportation, Greater Rejection, Force Sanctuary, Time Accelerator, Greater Magic Seal
  | "trap" // delayed detonation (Explode Mine, Drifting Master Mine)
  | "utility"; // out-of-combat magic: divination, travel, crafting, lifestyle. Utility spells don't use spell slots.
export type FieldId = "dimlock" | "delay_tp" | "rejection" | "sanctuary" | "time_accel" | "seal";

export interface Effect {
  kind: EffectKind;
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
  karmaScale?: "good" | "evil" | "pure_good"; // pure_good: zero damage to good beings, huge damage to the wicked (Shining Burst)
  ignoreDef?: boolean;
  magicArrow?: boolean;
  special?: string;
  turns?: number; // timestop turns
  selfHpCost?: number; // fraction
  pierce?: number; // fraction of the target's DEF/RES ignored (lances)
  statuses?: StatusApply[]; // extra statuses on top of `status` (Sand Field: All)
  onlyFamilies?: string[]; // only affects these monster families (Charm Person, Vermin Bane, Obey...)
  bonusVs?: { families?: string[]; elements?: Element[]; evil?: boolean; ethereal?: boolean; mult: number };
  cleanse?: StatusId[]; // kind "cleanse": only these statuses (default: all)
  levelDrain?: number; // levels drained from the target (Energy Drain)
  trap?: TrapSpec;
  field?: FieldId;
  utility?: string; // out-of-combat behaviour id
  escape?: "blink" | "home" | "town" | "anywhere"; // teleport magic used in battle = escape
  randomTargets?: boolean; // each hit picks a random enemy (Seven Trumpeter, Thousand Bone Lance)
  unblockable?: boolean; // ignores invisibility / evasion (Vermilion Nova, Obsidian Sword)
  composite?: Element[]; // damage split evenly across these types (Nuclear Blast: fire + blunt)
  hitsSummons?: boolean; // also catches your own summons (Sand Field: All)
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
  /** Out-of-combat behaviour for dual-use spells (Fly: a battle buff, or encounter-free travel outside battle). */
  ooc?: string;
  /** Metamagic that makes no sense for this spell (true = none at all). */
  noMeta?: true | string[];
  /** MP cost as a fraction of your max MP instead of the tier cost (Grand Catastrophe). */
  mpPct?: number;
  /** Signature spell: needs at least one level in this class. */
  reqClass?: string;
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
  dura?: number; // durability 0..100 (undefined = pristine). Broken gear (0) gives no stats.
  repairs?: number; // times mended by [Repair]: each one lowers the value
  appraised?: boolean; // identified by [Appraisal Magic Item]: sells for more
  conjured?: boolean; // made by [Create Greater Item]: worthless to merchants, fades on death
}

export interface MonsterAbility {
  name: string;
  power?: number;
  element?: Element;
  aoe?: boolean;
  status?: StatusApply;
  chance: number; // weight
  special?: "timestop" | "death" | "heal" | "drain" | "summon" | "buff" | "dispel"
    | "teleport" // blink away; flee the battle when badly hurt (blocked by Dimensional Lock, punished by Lopsided Duel)
    | "call" // allies teleport in (stalled by Delay Teleportation, blocked by Dimensional Lock / Greater Rejection)
    | "dimlock" // seals space around you: your teleport magic fails
    | "vanish"; // turns invisible (See Invisibility, Continual Light, AoE and unblockable spells get around it)
  deathChance?: number;
  summonId?: string; // monster id brought in by summon / call
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

export interface Buff {
  id: string; name: string; turns: number; mods?: Partial<Stats>; flags?: string[];
  ward?: Partial<Record<Element, number>>; negate?: Element[]; traits?: Trait[];
  pool?: number; poolEls?: Element[]; // remaining absorb shield HP
}
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
  fled?: boolean; // teleported out of the battle: no rewards
  summoned?: boolean; // conjured or called in mid-battle: no rewards, and Magic Destruction / Greater Rejection unmake it
  baseAtk?: number; // stats before 'empower' buffs, restored by Dispel
  baseDef?: number;
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
  berserk?: number;
  interrupt?: boolean;
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
  traps?: Trap[]; // your magic mines, detonating as enemies close in
  dimLock?: number; // your Dimensional Lock: enemies can't teleport (escape, blink or call allies)
  playerLocked?: number; // an enemy's Dimensional Lock: your teleport magic fails
  delayTp?: number; // your Delay Teleportation: enemy teleports toward you are stalled
  rejection?: number; // your Greater Rejection: enemy summons are cancelled
  arrivals?: { defId: string; lvl: number; turns: number }[]; // stalled enemy reinforcements
  accel?: number; // Time Accelerator: free, non-attacking actions left
  sanctuary?: number; // Force Sanctuary: rounds left inside the barrier
  summonsHeld?: number; // your summons are caught in your own spell
  corpsesUsed?: number; // corpses already raised with Animate Dead
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
  traps?: Trap[]; // magic mines laid outside battle (bound to a room)
  seal?: { armed?: boolean; spellId?: string; meta?: string[] } | null; // Greater Magic Seal
}

export interface Line { t: string; c?: string }
