// Database types generated from Supabase schema

export type UserRole = 'member' | 'officer' | 'admin';
export type WowClass = 'warrior' | 'paladin' | 'hunter' | 'rogue' | 'priest' | 'shaman' | 'mage' | 'warlock' | 'druid';
export type WowRole = 'tank' | 'healer' | 'dps';
export type ItemTier = 'S' | 'A' | 'B' | 'C' | 'D';
export type AuditAction = 'weight_change' | 'manual_adjustment' | 'item_tier_change' | 'player_link' | 'role_change' | 'data_import' | 'loot_assigned';
export type ImportSource = 'raidlogger' | 'warcraftlogs' | 'raidhelper' | 'manual';
export type ImportStatus = 'pending' | 'success' | 'failed' | 'partial';

export interface User {
  id: string;
  discord_id: string;
  discord_username: string;
  discord_avatar: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Player {
  id: string;
  name: string;
  realm: string;
  class: WowClass;
  role: WowRole;
  main_id: string | null;
  is_main: boolean;
  is_pug: boolean;
  user_id: string | null;
  wcl_character_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Raid {
  id: string;
  name: string;
  zone: string;
  raid_date: string;
  wcl_report_id: string | null;
  raidhelper_event_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface Attendance {
  id: string;
  player_id: string;
  raid_id: string;
  present: boolean;
  on_time: boolean;
  benched: boolean;
  minutes_present: number;
  notes: string | null;
  source: ImportSource;
  created_at: string;
}

export interface ItemTierConfig {
  id: string;
  tier: ItemTier;
  points: number;
  description: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface Item {
  id: string;
  item_id: number;
  name: string;
  tier_override: ItemTier | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LootDrop {
  id: string;
  player_id: string;
  raid_id: string;
  item_id: number;
  item_name: string;
  tier: ItemTier;
  base_points: number;
  council_approved: boolean;
  council_votes: Record<string, boolean>;
  source: ImportSource;
  dropped_at: string;
  created_at: string;
}

export interface Parse {
  id: string;
  player_id: string;
  raid_id: string | null;
  encounter_name: string;
  spec: string | null;
  parse_percent: number;
  ilvl_parse_percent: number | null;
  dps: number | null;
  hps: number | null;
  wcl_report_id: string | null;
  fight_id: number | null;
  recorded_at: string;
  created_at: string;
}

export interface BuffUptime {
  id: string;
  player_id: string;
  raid_id: string;
  buff_name: string;
  uptime_percent: number;
  source: ImportSource;
  created_at: string;
}

export interface WeightConfig {
  id: number;
  attendance_weight: number;
  performance_weight: number;
  buff_weight: number;
  time_since_loot_weight: number;
  loot_penalty_weight: number;
  decay_rate: number;
  lookback_weeks: number;
  updated_at: string;
  updated_by: string | null;
}

export interface ScoreAdjustment {
  id: string;
  player_id: string;
  adjustment: number;
  reason: string;
  expires_at: string | null;
  created_by: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: AuditAction;
  target_type: string | null;
  target_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}

export interface ImportLog {
  id: string;
  source: ImportSource;
  status: ImportStatus;
  records_processed: number;
  records_failed: number;
  error_message: string | null;
  raw_payload: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
}

export interface PlayerScore {
  id: string;
  name: string;
  class: WowClass;
  role: WowRole;
  is_pug: boolean;
  attendance_pct: number;
  performance_pct: number;
  buff_pct: number;
  time_since_loot: number;
  loot_penalty_value: number;
  manual_adjustment: number;
  total_score: number;
  calculated_at: string;
}

// WoW Class color mapping for UI
export const WOW_CLASS_COLORS: Record<WowClass, string> = {
  warrior: '#C79C6E',
  paladin: '#F58CBA',
  hunter: '#ABD473',
  rogue: '#FFF569',
  priest: '#FFFFFF',
  shaman: '#0070DE',
  mage: '#69CCF0',
  warlock: '#9482C9',
  druid: '#FF7D0A',
};

// Database type for Supabase client
export interface Database {
  public: {
    Tables: {
      users: { Row: User; Insert: Omit<User, 'id' | 'created_at' | 'updated_at'>; Update: Partial<User> };
      players: { Row: Player; Insert: Omit<Player, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Player> };
      raids: { Row: Raid; Insert: Omit<Raid, 'id' | 'created_at'>; Update: Partial<Raid> };
      attendance: { Row: Attendance; Insert: Omit<Attendance, 'id' | 'created_at'>; Update: Partial<Attendance> };
      item_tiers: { Row: ItemTierConfig; Insert: Omit<ItemTierConfig, 'id' | 'created_at' | 'updated_at'>; Update: Partial<ItemTierConfig> };
      items: { Row: Item; Insert: Omit<Item, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Item> };
      loot_drops: { Row: LootDrop; Insert: Omit<LootDrop, 'id' | 'created_at'>; Update: Partial<LootDrop> };
      parses: { Row: Parse; Insert: Omit<Parse, 'id' | 'created_at'>; Update: Partial<Parse> };
      buff_uptimes: { Row: BuffUptime; Insert: Omit<BuffUptime, 'id' | 'created_at'>; Update: Partial<BuffUptime> };
      weight_config: { Row: WeightConfig; Insert: Partial<WeightConfig>; Update: Partial<WeightConfig> };
      score_adjustments: { Row: ScoreAdjustment; Insert: Omit<ScoreAdjustment, 'id' | 'created_at'>; Update: Partial<ScoreAdjustment> };
      audit_logs: { Row: AuditLog; Insert: Omit<AuditLog, 'id' | 'created_at'>; Update: never };
      import_logs: { Row: ImportLog; Insert: Omit<ImportLog, 'id' | 'created_at'>; Update: Partial<ImportLog> };
    };
    Views: {
      player_scores: { Row: PlayerScore };
    };
  };
}
