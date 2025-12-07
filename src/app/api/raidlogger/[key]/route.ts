import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// RaidLogger payload types (based on addon export.js structure)
interface RaidLoggerAttendee {
  name: string;
  class: string;
  race?: string;
  level?: number;
  joinTime: number;
  leaveTime?: number;
  online?: boolean;
}

interface RaidLoggerLoot {
  itemId: number;
  itemName: string;
  itemLink?: string;
  receiver: string;
  time?: number;
  boss?: string;
  votes?: Record<string, boolean>;
  approved?: boolean;
}

interface RaidLoggerBuff {
  player: string;
  name: string;
  uptime: number;
}

interface RaidLoggerPayload {
  // Raid info
  id?: string;
  zone: string;
  instance?: string;
  startTime: number;
  endTime?: number;
  
  // Data arrays
  attendees?: RaidLoggerAttendee[];
  members?: RaidLoggerAttendee[]; // Alternative field name
  loot?: RaidLoggerLoot[];
  drops?: RaidLoggerLoot[]; // Alternative field name
  buffs?: RaidLoggerBuff[];
  
  // Optional metadata
  wclUrl?: string;
  logs?: string;
  guild?: string;
  realm?: string;
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
  // Also handle lowercase
  'warrior': 'warrior',
  'paladin': 'paladin',
  'hunter': 'hunter',
  'rogue': 'rogue',
  'priest': 'priest',
  'shaman': 'shaman',
  'mage': 'mage',
  'warlock': 'warlock',
  'druid': 'druid',
};

interface RouteParams {
  params: Promise<{ key: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { key } = await params;
  
  try {
    // Validate API key from URL path
    const expectedKey = process.env.RAIDLOGGER_API_KEY;
    if (!expectedKey || key !== expectedKey) {
      console.log('Invalid API key provided:', key?.substring(0, 8) + '...');
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    const payload: RaidLoggerPayload = await request.json();
    
    // Log incoming payload structure for debugging
    console.log('RaidLogger payload received:', {
      zone: payload.zone,
      attendeeCount: (payload.attendees || payload.members)?.length,
      lootCount: (payload.loot || payload.drops)?.length,
      buffCount: payload.buffs?.length,
    });

    // Normalize field names (addon might use different names)
    const attendees = payload.attendees || payload.members || [];
    const lootDrops = payload.loot || payload.drops || [];
    const buffs = payload.buffs || [];
    const wclReportUrl = payload.wclUrl || payload.logs;

    // Validate required fields
    if (!payload.zone) {
      return NextResponse.json(
        { error: 'Missing required field: zone' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    let recordsProcessed = 0;
    let recordsFailed = 0;
    const errors: string[] = [];

    // Extract WCL report ID from URL if provided
    let wclReportId: string | null = null;
    if (wclReportUrl) {
      const match = wclReportUrl.match(/reports\/([a-zA-Z0-9]+)/);
      if (match) {
        wclReportId = match[1];
      }
    }

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
      
      // Update WCL report ID if provided
      if (wclReportId) {
        await supabase
          .from('raids')
          .update({ wcl_report_id: wclReportId })
          .eq('id', raidId);
      }
    } else {
      const { data: newRaid, error: raidError } = await supabase
        .from('raids')
        .insert({
          name: `${payload.zone} - ${raidDate}`,
          zone: payload.zone,
          raid_date: raidDate,
          wcl_report_id: wclReportId,
        })
        .select('id')
        .single();

      if (raidError || !newRaid) {
        throw new Error(`Failed to create raid: ${raidError?.message}`);
      }
      raidId = newRaid.id;
    }

    // 2. Process attendees
    for (const attendee of attendees) {
      try {
        const normalizedClass = CLASS_MAP[attendee.class] || CLASS_MAP[attendee.class?.toUpperCase()] || 'warrior';
        
        // Find or create player
        const { data: existingPlayer } = await supabase
          .from('players')
          .select('id')
          .eq('name', attendee.name)
          .single();

        let playerId: string;
        
        if (existingPlayer) {
          playerId = existingPlayer.id;
        } else {
          const { data: newPlayer, error: playerError } = await supabase
            .from('players')
            .insert({
              name: attendee.name,
              class: normalizedClass,
              role: 'dps',
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
        const joinTime = attendee.joinTime;
        const leaveTime = attendee.leaveTime || payload.endTime || Date.now();
        const minutesPresent = Math.max(0, Math.round((leaveTime - joinTime) / 1000 / 60));

        // Upsert attendance
        const { error: attendanceError } = await supabase
          .from('attendance')
          .upsert({
            player_id: playerId,
            raid_id: raidId,
            present: true,
            on_time: true,
            benched: false,
            minutes_present: minutesPresent,
            source: 'raidlogger',
          }, {
            onConflict: 'player_id,raid_id',
          });

        if (attendanceError) {
          errors.push(`Attendance error for ${attendee.name}: ${attendanceError.message}`);
          recordsFailed++;
        } else {
          recordsProcessed++;
        }
      } catch (err) {
        errors.push(`Error processing ${attendee.name}: ${err}`);
        recordsFailed++;
      }
    }

    // 3. Process loot
    for (const loot of lootDrops) {
      try {
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

        // Check for item tier override
        const { data: itemOverride } = await supabase
          .from('items')
          .select('tier_override')
          .eq('item_id', loot.itemId)
          .single();

        // Get default tier
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
            dropped_at: loot.time ? new Date(loot.time).toISOString() : new Date().toISOString(),
          });

        if (lootError) {
          errors.push(`Loot error for ${loot.itemName}: ${lootError.message}`);
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
    for (const buff of buffs) {
      try {
        const playerName = buff.player;
        
        const { data: player } = await supabase
          .from('players')
          .select('id')
          .eq('name', playerName)
          .single();

        if (!player) continue;

        const { error: buffError } = await supabase
          .from('buff_uptimes')
          .upsert({
            player_id: player.id,
            raid_id: raidId,
            buff_name: buff.name,
            uptime_percent: buff.uptime,
            source: 'raidlogger',
          }, {
            onConflict: 'player_id,raid_id,buff_name',
          });

        if (buffError) {
          errors.push(`Buff error: ${buffError.message}`);
          recordsFailed++;
        } else {
          recordsProcessed++;
        }
      } catch (err) {
        errors.push(`Buff processing error: ${err}`);
        recordsFailed++;
      }
    }

    // 5. Log the import
    await supabase.from('import_logs').insert({
      source: 'raidlogger',
      status: recordsFailed > 0 ? (recordsProcessed > 0 ? 'partial' : 'failed') : 'success',
      records_processed: recordsProcessed,
      records_failed: recordsFailed,
      error_message: errors.length > 0 ? errors.slice(0, 10).join('; ') : null,
      raw_payload: payload as unknown as Record<string, unknown>,
    });

    // 6. Refresh scores
    try {
      await supabase.rpc('refresh_player_scores');
    } catch {
      // Non-critical
    }

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      raidId,
      zone: payload.zone,
      date: raidDate,
      recordsProcessed,
      recordsFailed,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
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

// Health check
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { key } = await params;
  const expectedKey = process.env.RAIDLOGGER_API_KEY;
  
  if (key === expectedKey) {
    return NextResponse.json({ 
      status: 'ok',
      message: 'RaidLogger webhook is ready',
    });
  }
  
  return NextResponse.json({ 
    status: 'error',
    message: 'Invalid API key',
  }, { status: 401 });
}
