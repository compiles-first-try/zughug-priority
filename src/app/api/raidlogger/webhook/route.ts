import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// RaidLogger payload types (based on addon structure)
interface RaidLoggerAttendee {
  name: string;
  class: string;
  joinTime: number;
  leaveTime?: number;
}

interface RaidLoggerLoot {
  itemId: number;
  itemName: string;
  receiver: string;
  votes?: Record<string, boolean>;
  approved?: boolean;
}

interface RaidLoggerBuff {
  playerName: string;
  buffName: string;
  uptime: number; // percentage 0-100
}

interface RaidLoggerPayload {
  apiKey: string;
  raidId?: string;
  zone: string;
  startTime: number;
  endTime?: number;
  attendees: RaidLoggerAttendee[];
  loot: RaidLoggerLoot[];
  buffs?: RaidLoggerBuff[];
  wclReportId?: string;
}

// Map addon class names to our enum
const CLASS_MAP: Record<string, string> = {
  'WARRIOR': 'warrior',
  'PALADIN': 'paladin',
  'HUNTER': 'hunter',
  'ROGUE': 'rogue',
  'PRIEST': 'priest',
  'SHAMAN': 'shaman',
  'MAGE': 'mage',
  'WARLOCK': 'warlock',
  'DRUID': 'druid',
};

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const payload: RaidLoggerPayload = await request.json();

    // Validate API key
    const expectedKey = process.env.RAIDLOGGER_API_KEY;
    if (!expectedKey || payload.apiKey !== expectedKey) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    // Validate required fields
    if (!payload.zone || !payload.attendees || !Array.isArray(payload.attendees)) {
      return NextResponse.json(
        { error: 'Missing required fields: zone, attendees' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    let recordsProcessed = 0;
    let recordsFailed = 0;
    const errors: string[] = [];

    // 1. Create or find the raid
    const raidDate = new Date(payload.startTime).toISOString().split('T')[0];
    
    const { data: existingRaid } = await supabase
      .from('raids')
      .select('id')
      .eq('zone', payload.zone)
      .eq('raid_date', raidDate)
      .single();

    let raidId: string;
    
    if (existingRaid) {
      raidId = existingRaid.id;
    } else {
      const { data: newRaid, error: raidError } = await supabase
        .from('raids')
        .insert({
          name: `${payload.zone} - ${raidDate}`,
          zone: payload.zone,
          raid_date: raidDate,
          wcl_report_id: payload.wclReportId || null,
        })
        .select('id')
        .single();

      if (raidError || !newRaid) {
        throw new Error(`Failed to create raid: ${raidError?.message}`);
      }
      raidId = newRaid.id;
    }

    // 2. Process attendees
    for (const attendee of payload.attendees) {
      try {
        // Find or create player
        const normalizedClass = CLASS_MAP[attendee.class.toUpperCase()] || 'warrior';
        
        const { data: existingPlayer } = await supabase
          .from('players')
          .select('id')
          .eq('name', attendee.name)
          .single();

        let playerId: string;
        
        if (existingPlayer) {
          playerId = existingPlayer.id;
        } else {
          // Create new player (default to DPS role, can be updated later)
          const { data: newPlayer, error: playerError } = await supabase
            .from('players')
            .insert({
              name: attendee.name,
              class: normalizedClass,
              role: 'dps', // Default, should be updated by officer
              is_main: true,
              is_pug: false,
            })
            .select('id')
            .single();

          if (playerError || !newPlayer) {
            errors.push(`Failed to create player ${attendee.name}: ${playerError?.message}`);
            recordsFailed++;
            continue;
          }
          playerId = newPlayer.id;
        }

        // Calculate minutes present
        const joinTime = new Date(attendee.joinTime).getTime();
        const leaveTime = attendee.leaveTime 
          ? new Date(attendee.leaveTime).getTime() 
          : (payload.endTime ? payload.endTime : Date.now());
        const minutesPresent = Math.round((leaveTime - joinTime) / 1000 / 60);

        // Upsert attendance record
        const { error: attendanceError } = await supabase
          .from('attendance')
          .upsert({
            player_id: playerId,
            raid_id: raidId,
            present: true,
            on_time: true, // Could be refined with raid start time comparison
            benched: false,
            minutes_present: minutesPresent,
            source: 'raidlogger',
          }, {
            onConflict: 'player_id,raid_id',
          });

        if (attendanceError) {
          errors.push(`Failed to record attendance for ${attendee.name}: ${attendanceError.message}`);
          recordsFailed++;
        } else {
          recordsProcessed++;
        }
      } catch (err) {
        errors.push(`Error processing attendee ${attendee.name}: ${err}`);
        recordsFailed++;
      }
    }

    // 3. Process loot
    for (const loot of payload.loot) {
      try {
        // Find player
        const { data: player } = await supabase
          .from('players')
          .select('id')
          .eq('name', loot.receiver)
          .single();

        if (!player) {
          errors.push(`Loot receiver not found: ${loot.receiver}`);
          recordsFailed++;
          continue;
        }

        // Get item tier (check for override, otherwise use default)
        const { data: itemOverride } = await supabase
          .from('items')
          .select('tier_override')
          .eq('item_id', loot.itemId)
          .single();

        const { data: defaultTier } = await supabase
          .from('item_tiers')
          .select('tier, points')
          .eq('is_default', true)
          .single();

        let tier = 'B';
        let basePoints = 30;

        if (itemOverride?.tier_override) {
          tier = itemOverride.tier_override;
          const { data: tierConfig } = await supabase
            .from('item_tiers')
            .select('points')
            .eq('tier', tier)
            .single();
          basePoints = tierConfig?.points || 30;
        } else if (defaultTier) {
          tier = defaultTier.tier;
          basePoints = defaultTier.points;
        }

        // Insert loot drop
        const { error: lootError } = await supabase
          .from('loot_drops')
          .insert({
            player_id: player.id,
            raid_id: raidId,
            item_id: loot.itemId,
            item_name: loot.itemName,
            tier: tier,
            base_points: basePoints,
            council_approved: loot.approved ?? true,
            council_votes: loot.votes || {},
            source: 'raidlogger',
            dropped_at: new Date().toISOString(),
          });

        if (lootError) {
          errors.push(`Failed to record loot ${loot.itemName}: ${lootError.message}`);
          recordsFailed++;
        } else {
          recordsProcessed++;
        }
      } catch (err) {
        errors.push(`Error processing loot ${loot.itemName}: ${err}`);
        recordsFailed++;
      }
    }

    // 4. Process buff uptimes
    if (payload.buffs && Array.isArray(payload.buffs)) {
      for (const buff of payload.buffs) {
        try {
          const { data: player } = await supabase
            .from('players')
            .select('id')
            .eq('name', buff.playerName)
            .single();

          if (!player) {
            continue; // Skip if player not found
          }

          const { error: buffError } = await supabase
            .from('buff_uptimes')
            .upsert({
              player_id: player.id,
              raid_id: raidId,
              buff_name: buff.buffName,
              uptime_percent: buff.uptime,
              source: 'raidlogger',
            }, {
              onConflict: 'player_id,raid_id,buff_name',
            });

          if (buffError) {
            errors.push(`Failed to record buff for ${buff.playerName}: ${buffError.message}`);
            recordsFailed++;
          } else {
            recordsProcessed++;
          }
        } catch (err) {
          errors.push(`Error processing buff for ${buff.playerName}: ${err}`);
          recordsFailed++;
        }
      }
    }

    // 5. Log the import
    await supabase.from('import_logs').insert({
      source: 'raidlogger',
      status: recordsFailed > 0 ? 'partial' : 'success',
      records_processed: recordsProcessed,
      records_failed: recordsFailed,
      error_message: errors.length > 0 ? errors.join('; ') : null,
      raw_payload: payload as unknown as Record<string, unknown>,
    });

    // 6. Trigger score refresh (if needed)
    try {
      await supabase.rpc('refresh_player_scores');
    } catch {
      // Non-critical, scores will be stale until next refresh
    }

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      raidId,
      recordsProcessed,
      recordsFailed,
      errors: errors.length > 0 ? errors : undefined,
      duration: `${duration}ms`,
    });

  } catch (error) {
    console.error('RaidLogger webhook error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({ 
    status: 'ok',
    endpoint: 'RaidLogger Webhook',
    version: '1.0.0',
  });
}
