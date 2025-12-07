-- ============================================
-- ZugHug Raid Priority System - Database Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE user_role AS ENUM ('member', 'officer', 'admin');
CREATE TYPE wow_class AS ENUM (
  'warrior', 'paladin', 'hunter', 'rogue', 'priest',
  'shaman', 'mage', 'warlock', 'druid'
);
CREATE TYPE wow_role AS ENUM ('tank', 'healer', 'dps');
CREATE TYPE item_tier AS ENUM ('S', 'A', 'B', 'C', 'D');
CREATE TYPE audit_action AS ENUM (
  'weight_change', 'manual_adjustment', 'item_tier_change',
  'player_link', 'role_change', 'data_import', 'loot_assigned'
);
CREATE TYPE import_source AS ENUM ('raidlogger', 'warcraftlogs', 'raidhelper', 'manual');
CREATE TYPE import_status AS ENUM ('pending', 'success', 'failed', 'partial');

-- ============================================
-- CORE TABLES
-- ============================================

-- Users (linked to Discord OAuth)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  discord_id TEXT UNIQUE NOT NULL,
  discord_username TEXT NOT NULL,
  discord_avatar TEXT,
  role user_role DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Players (WoW characters)
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  realm TEXT DEFAULT 'Dreamscythe',
  class wow_class NOT NULL,
  role wow_role NOT NULL,
  main_id UUID REFERENCES players(id) ON DELETE SET NULL,
  is_main BOOLEAN DEFAULT TRUE,
  is_pug BOOLEAN DEFAULT FALSE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  wcl_character_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, realm)
);

-- Create index for alt lookups
CREATE INDEX idx_players_main_id ON players(main_id);
CREATE INDEX idx_players_user_id ON players(user_id);

-- Raids (individual raid instances)
CREATE TABLE raids (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  zone TEXT NOT NULL,
  raid_date DATE NOT NULL,
  wcl_report_id TEXT,
  raidhelper_event_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(zone, raid_date)
);

-- Create index for date lookups
CREATE INDEX idx_raids_date ON raids(raid_date DESC);
CREATE INDEX idx_raids_zone ON raids(zone);

-- Attendance records
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  raid_id UUID NOT NULL REFERENCES raids(id) ON DELETE CASCADE,
  present BOOLEAN DEFAULT TRUE,
  on_time BOOLEAN DEFAULT TRUE,
  benched BOOLEAN DEFAULT FALSE,
  minutes_present INTEGER DEFAULT 0,
  notes TEXT,
  source import_source DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, raid_id)
);

CREATE INDEX idx_attendance_player ON attendance(player_id);
CREATE INDEX idx_attendance_raid ON attendance(raid_id);

-- Item tier configuration
CREATE TABLE item_tiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tier item_tier NOT NULL,
  points INTEGER NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tier)
);

-- Insert default item tiers
INSERT INTO item_tiers (tier, points, description, is_default) VALUES
  ('S', 100, 'Legendaries, BIS trinkets, ultra-rare', FALSE),
  ('A', 60, 'Tier tokens, weapons, high-demand', FALSE),
  ('B', 30, 'General upgrades, solid gear', TRUE),
  ('C', 10, 'Offspec, minor upgrades', FALSE),
  ('D', 0, 'Free roll, not tracked', FALSE);

-- Items (specific items with tier overrides)
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tier_override item_tier,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_items_item_id ON items(item_id);

-- Loot drops (who got what)
CREATE TABLE loot_drops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  raid_id UUID NOT NULL REFERENCES raids(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL,
  item_name TEXT NOT NULL,
  tier item_tier NOT NULL DEFAULT 'B',
  base_points INTEGER NOT NULL,
  council_approved BOOLEAN DEFAULT TRUE,
  council_votes JSONB DEFAULT '{}',
  source import_source DEFAULT 'manual',
  dropped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_loot_drops_player ON loot_drops(player_id);
CREATE INDEX idx_loot_drops_raid ON loot_drops(raid_id);
CREATE INDEX idx_loot_drops_date ON loot_drops(dropped_at DESC);

-- Parse data (from Warcraft Logs)
CREATE TABLE parses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  raid_id UUID REFERENCES raids(id) ON DELETE SET NULL,
  encounter_name TEXT NOT NULL,
  spec TEXT,
  parse_percent DECIMAL(5,2) NOT NULL CHECK (parse_percent >= 0 AND parse_percent <= 100),
  ilvl_parse_percent DECIMAL(5,2) CHECK (ilvl_parse_percent >= 0 AND ilvl_parse_percent <= 100),
  dps DECIMAL(12,2),
  hps DECIMAL(12,2),
  wcl_report_id TEXT,
  fight_id INTEGER,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_parses_player ON parses(player_id);
CREATE INDEX idx_parses_raid ON parses(raid_id);

-- Buff uptime data
CREATE TABLE buff_uptimes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  raid_id UUID NOT NULL REFERENCES raids(id) ON DELETE CASCADE,
  buff_name TEXT NOT NULL,
  uptime_percent DECIMAL(5,2) NOT NULL CHECK (uptime_percent >= 0 AND uptime_percent <= 100),
  source import_source DEFAULT 'raidlogger',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, raid_id, buff_name)
);

CREATE INDEX idx_buff_uptimes_player ON buff_uptimes(player_id);
CREATE INDEX idx_buff_uptimes_raid ON buff_uptimes(raid_id);

-- ============================================
-- SCORING CONFIGURATION
-- ============================================

-- Weight configuration (singleton table)
CREATE TABLE weight_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  attendance_weight DECIMAL(4,2) DEFAULT 40.00 CHECK (attendance_weight >= 0 AND attendance_weight <= 100),
  performance_weight DECIMAL(4,2) DEFAULT 25.00 CHECK (performance_weight >= 0 AND performance_weight <= 100),
  buff_weight DECIMAL(4,2) DEFAULT 15.00 CHECK (buff_weight >= 0 AND buff_weight <= 100),
  time_since_loot_weight DECIMAL(4,2) DEFAULT 10.00 CHECK (time_since_loot_weight >= 0 AND time_since_loot_weight <= 100),
  loot_penalty_weight DECIMAL(4,2) DEFAULT 10.00 CHECK (loot_penalty_weight >= 0 AND loot_penalty_weight <= 100),
  decay_rate DECIMAL(4,3) DEFAULT 0.900 CHECK (decay_rate >= 0 AND decay_rate <= 1),
  lookback_weeks INTEGER DEFAULT 8,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

-- Insert default weights
INSERT INTO weight_config (id) VALUES (1);

-- Manual score adjustments
CREATE TABLE score_adjustments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  adjustment INTEGER NOT NULL,
  reason TEXT NOT NULL,
  expires_at DATE,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_score_adjustments_player ON score_adjustments(player_id);

-- ============================================
-- AUDIT & IMPORT LOGS
-- ============================================

-- Audit log (publicly viewable)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  action audit_action NOT NULL,
  target_type TEXT,
  target_id UUID,
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

-- Import history
CREATE TABLE import_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source import_source NOT NULL,
  status import_status NOT NULL,
  records_processed INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_message TEXT,
  raw_payload JSONB,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_import_logs_source ON import_logs(source);
CREATE INDEX idx_import_logs_created ON import_logs(created_at DESC);

-- ============================================
-- API KEYS (for RaidLogger webhook)
-- ============================================

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  permissions TEXT[] DEFAULT ARRAY['webhook:write'],
  created_by UUID REFERENCES users(id),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MATERIALIZED VIEW: Player Scores
-- ============================================

-- This will be refreshed by a function after data changes
CREATE MATERIALIZED VIEW player_scores AS
WITH 
  config AS (SELECT * FROM weight_config WHERE id = 1),
  
  -- Attendance calculation (last N weeks)
  attendance_stats AS (
    SELECT 
      p.id AS player_id,
      COUNT(CASE WHEN a.present THEN 1 END)::DECIMAL / NULLIF(COUNT(r.id), 0) * 100 AS attendance_pct
    FROM players p
    CROSS JOIN config c
    LEFT JOIN raids r ON r.raid_date >= CURRENT_DATE - (c.lookback_weeks * 7)
    LEFT JOIN attendance a ON a.player_id = COALESCE(p.main_id, p.id) AND a.raid_id = r.id
    WHERE p.is_main = TRUE OR p.main_id IS NULL
    GROUP BY p.id
  ),
  
  -- Performance calculation (average parse)
  performance_stats AS (
    SELECT 
      p.id AS player_id,
      AVG(pr.parse_percent) AS avg_parse
    FROM players p
    CROSS JOIN config c
    LEFT JOIN parses pr ON pr.player_id = COALESCE(p.main_id, p.id)
    LEFT JOIN raids r ON r.id = pr.raid_id AND r.raid_date >= CURRENT_DATE - (c.lookback_weeks * 7)
    WHERE p.is_main = TRUE OR p.main_id IS NULL
    GROUP BY p.id
  ),
  
  -- Buff uptime average
  buff_stats AS (
    SELECT 
      p.id AS player_id,
      AVG(bu.uptime_percent) AS avg_buff_uptime
    FROM players p
    CROSS JOIN config c
    LEFT JOIN buff_uptimes bu ON bu.player_id = COALESCE(p.main_id, p.id)
    LEFT JOIN raids r ON r.id = bu.raid_id AND r.raid_date >= CURRENT_DATE - (c.lookback_weeks * 7)
    WHERE p.is_main = TRUE OR p.main_id IS NULL
    GROUP BY p.id
  ),
  
  -- Time since last loot (normalized to 0-100)
  loot_timing AS (
    SELECT 
      p.id AS player_id,
      LEAST(
        EXTRACT(DAY FROM NOW() - MAX(ld.dropped_at))::DECIMAL / 28 * 100,
        100
      ) AS time_since_loot_score
    FROM players p
    LEFT JOIN loot_drops ld ON ld.player_id = COALESCE(p.main_id, p.id)
    WHERE p.is_main = TRUE OR p.main_id IS NULL
    GROUP BY p.id
  ),
  
  -- Loot penalty with decay
  loot_penalty AS (
    SELECT 
      p.id AS player_id,
      SUM(
        ld.base_points * POWER(c.decay_rate, EXTRACT(WEEK FROM NOW() - ld.dropped_at))
      ) AS decayed_loot_value
    FROM players p
    CROSS JOIN config c
    LEFT JOIN loot_drops ld ON ld.player_id = COALESCE(p.main_id, p.id)
      AND ld.dropped_at >= CURRENT_DATE - (c.lookback_weeks * 7)
    WHERE p.is_main = TRUE OR p.main_id IS NULL
    GROUP BY p.id
  ),
  
  -- Manual adjustments (active only)
  adjustments AS (
    SELECT 
      player_id,
      SUM(adjustment) AS total_adjustment
    FROM score_adjustments
    WHERE expires_at IS NULL OR expires_at > CURRENT_DATE
    GROUP BY player_id
  )

SELECT 
  p.id,
  p.name,
  p.class,
  p.role,
  p.is_pug,
  COALESCE(ast.attendance_pct, 0) AS attendance_pct,
  COALESCE(pst.avg_parse, 0) AS performance_pct,
  COALESCE(bst.avg_buff_uptime, 0) AS buff_pct,
  COALESCE(lt.time_since_loot_score, 100) AS time_since_loot,
  COALESCE(lp.decayed_loot_value, 0) AS loot_penalty_value,
  COALESCE(adj.total_adjustment, 0) AS manual_adjustment,
  (
    (COALESCE(ast.attendance_pct, 0) * cfg.attendance_weight / 100) +
    (COALESCE(pst.avg_parse, 0) * cfg.performance_weight / 100) +
    (COALESCE(bst.avg_buff_uptime, 0) * cfg.buff_weight / 100) +
    (COALESCE(lt.time_since_loot_score, 100) * cfg.time_since_loot_weight / 100) -
    (LEAST(COALESCE(lp.decayed_loot_value, 0), 100) * cfg.loot_penalty_weight / 100) +
    COALESCE(adj.total_adjustment, 0)
  ) AS total_score,
  NOW() AS calculated_at
FROM players p
CROSS JOIN config cfg
LEFT JOIN attendance_stats ast ON ast.player_id = p.id
LEFT JOIN performance_stats pst ON pst.player_id = p.id
LEFT JOIN buff_stats bst ON bst.player_id = p.id
LEFT JOIN loot_timing lt ON lt.player_id = p.id
LEFT JOIN loot_penalty lp ON lp.player_id = p.id
LEFT JOIN adjustments adj ON adj.player_id = p.id
WHERE p.is_main = TRUE OR p.main_id IS NULL;

-- Index for fast sorting
CREATE UNIQUE INDEX idx_player_scores_id ON player_scores(id);
CREATE INDEX idx_player_scores_total ON player_scores(total_score DESC);
CREATE INDEX idx_player_scores_class ON player_scores(class);
CREATE INDEX idx_player_scores_role ON player_scores(role);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to refresh scores
CREATE OR REPLACE FUNCTION refresh_player_scores()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY player_scores;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function for audit logging
CREATE OR REPLACE FUNCTION log_weight_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (user_id, action, target_type, old_value, new_value)
  VALUES (
    NEW.updated_by,
    'weight_change',
    'weight_config',
    to_jsonb(OLD),
    to_jsonb(NEW)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER weight_config_audit
AFTER UPDATE ON weight_config
FOR EACH ROW
EXECUTE FUNCTION log_weight_change();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply timestamp triggers
CREATE TRIGGER update_users_timestamp BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_players_timestamp BEFORE UPDATE ON players
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_items_timestamp BEFORE UPDATE ON items
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_item_tiers_timestamp BEFORE UPDATE ON item_tiers
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE raids ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE loot_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE parses ENABLE ROW LEVEL SECURITY;
ALTER TABLE buff_uptimes ENABLE ROW LEVEL SECURITY;
ALTER TABLE weight_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Everyone can read most data
CREATE POLICY "Anyone can view users" ON users FOR SELECT USING (true);
CREATE POLICY "Anyone can view players" ON players FOR SELECT USING (true);
CREATE POLICY "Anyone can view raids" ON raids FOR SELECT USING (true);
CREATE POLICY "Anyone can view attendance" ON attendance FOR SELECT USING (true);
CREATE POLICY "Anyone can view loot_drops" ON loot_drops FOR SELECT USING (true);
CREATE POLICY "Anyone can view parses" ON parses FOR SELECT USING (true);
CREATE POLICY "Anyone can view buff_uptimes" ON buff_uptimes FOR SELECT USING (true);
CREATE POLICY "Anyone can view weight_config" ON weight_config FOR SELECT USING (true);
CREATE POLICY "Anyone can view item_tiers" ON item_tiers FOR SELECT USING (true);
CREATE POLICY "Anyone can view items" ON items FOR SELECT USING (true);
CREATE POLICY "Anyone can view audit_logs" ON audit_logs FOR SELECT USING (true);

-- Officers and Admins can write
CREATE POLICY "Officers can manage players" ON players 
FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE discord_id = auth.jwt()->>'sub' AND role IN ('officer', 'admin'))
);

CREATE POLICY "Officers can manage raids" ON raids 
FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE discord_id = auth.jwt()->>'sub' AND role IN ('officer', 'admin'))
);

CREATE POLICY "Officers can manage attendance" ON attendance 
FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE discord_id = auth.jwt()->>'sub' AND role IN ('officer', 'admin'))
);

CREATE POLICY "Officers can manage loot" ON loot_drops 
FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE discord_id = auth.jwt()->>'sub' AND role IN ('officer', 'admin'))
);

CREATE POLICY "Officers can manage weights" ON weight_config 
FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE discord_id = auth.jwt()->>'sub' AND role IN ('officer', 'admin'))
);

CREATE POLICY "Officers can manage item tiers" ON item_tiers 
FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE discord_id = auth.jwt()->>'sub' AND role IN ('officer', 'admin'))
);

CREATE POLICY "Officers can manage items" ON items 
FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE discord_id = auth.jwt()->>'sub' AND role IN ('officer', 'admin'))
);

CREATE POLICY "Officers can adjust scores" ON score_adjustments 
FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE discord_id = auth.jwt()->>'sub' AND role IN ('officer', 'admin'))
);

-- Admin only
CREATE POLICY "Admins can manage users" ON users 
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users WHERE discord_id = auth.jwt()->>'sub' AND role = 'admin')
);

CREATE POLICY "Admins can manage API keys" ON api_keys 
FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE discord_id = auth.jwt()->>'sub' AND role = 'admin')
);

CREATE POLICY "Officers can view import logs" ON import_logs 
FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE discord_id = auth.jwt()->>'sub' AND role IN ('officer', 'admin'))
);

-- Service role bypasses RLS for webhooks
-- (handled automatically by Supabase service role key)

-- ============================================
-- SAMPLE DATA FOR TESTING (optional)
-- ============================================

-- Uncomment to add test data:
/*
INSERT INTO players (name, class, role, is_pug) VALUES
  ('Tankbro', 'warrior', 'tank', FALSE),
  ('Healzilla', 'priest', 'healer', FALSE),
  ('Pewpewmage', 'mage', 'dps', FALSE),
  ('Stabbyface', 'rogue', 'dps', FALSE),
  ('Randomdude', 'hunter', 'dps', TRUE);

INSERT INTO raids (name, zone, raid_date) VALUES
  ('Weekly MC', 'Molten Core', CURRENT_DATE - 7),
  ('Weekly BWL', 'Blackwing Lair', CURRENT_DATE - 6),
  ('Weekly Naxx', 'Naxxramas', CURRENT_DATE - 5);
*/
