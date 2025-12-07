import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

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
  time?: number;
  votes?: Record<string, boolean>;
  approved?: boolean;
}

interface RaidLoggerBuff {
  player: string;
  name: string;
  uptime: number;
}

interface RaidLoggerPayload {
  zone: string;
  startTime: number;
  endTime?: number;
  attendees?: RaidLoggerAttendee[];
  members?: RaidLoggerAttendee[];
  loot?: RaidLoggerLoot[];
  drops?: RaidLoggerLoot[];
  buffs?: RaidLoggerBuff[];
  wclUrl?: string;
  logs?: string;
}

const CLASS_MAP: Record<string, string> = {
  'WARRIOR': 'warrior', 'PALADIN': 'paladin', 'HUNTER': 'hunter',
  'ROGUE': 'rogue', 'PRIEST': 'priest', 'SHAMAN': 'shaman',
  'MAGE': 'mage', 'WARLOCK': 'warlock', 'DRUID': 'druid',
  'warrior': 'warrior', 'paladin': 'paladin', 'hunter': 'hunter',
  'rogue': 'rogue', 'priest': 'priest', 'shaman': 'shaman',
  'mage': 'mage', 'warlock': 'warlock', 'druid': 'druid',
};

interface RouteParams {
  params: Promise<{ key: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { key } = await params;

  try {
    const expectedKey = process.env.RAIDLOGGER_API_KEY;
    if (!expectedKey || key !== expectedKey) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const payload: RaidLoggerPayload = await request.json();
    const attendees = payload.attendees || payload.members || [];
    const lootDrops = payload.loot || payload.drops || [];
    const buffs = payload.buffs || [];
    const wclReportUrl = payload.wclUrl || payload.logs;

    if (!payload.zone) {
      return NextResponse.json({ error: 'Missing zone' }, { status: 400 });
    }

    const supabase = createAdminClient();
    let recordsProcessed = 0;
    let recordsFailed = 0;
    const errors: string[] = [];

    let wclReportId: string | null = null;
    if (wclReportUrl) {
      const match = wclReportUrl.match(/reports\/([a-zA-Z0-9]+)/);
      if (match) wclReportId = match[1];
    }

    const raidDate = new Date(payload.startTime).toISOString().split('T')[0];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingRaid } = await supabase
      .from('raids')
      .select('id')
      .eq('zone', payload.zone)
      .eq('raid_date', raidDate)
      .maybeSingle() as { data: { id: string } | null };

    let raidId: string;

    if (existingRaid) {
      raidId = existingRaid.id;
      if (wclReportId) {
        await supabase.from('raids').update({ wcl_report_id: wclReportId }).eq('id', raidId);
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
        .single() as { data: { id: string } | null; error: Error | null };

      if (raidError || !newRaid) {
        throw new Error(`Failed to create raid: ${raidError?.message}`);
      }
      raidId = newRaid.id;
    }

    for (const attendee of attendees) {
      try {
        const normalizedClass = CLASS_MAP[attendee.class] || CLASS_MAP[attendee.class?.toUpperCase()] || 'warrior';

        const { data: existingPlayer } = await supabase
          .from('players')
          .select('id')
          .eq('name', attendee.name)
          .maybeSingle() as { data: { id: string } | null };

        let playerId: string;

        if (existingPlayer) {
          playerId = existingPlayer.id;
        } else {
          const { data: newPlayer, error: playerError } = await supabase
            .from('players')
            .insert({ name: attendee.name, class: normalizedClass, role: 'dps', is_main: true, is_pug: false })
            .select('id')
            .single() as { data: { id: string } | null; error: Error | null };

          if (playerError || !newPlayer) {
            errors.push(`Failed to create player ${attendee.name}`);
            recordsFailed++;
            continue;
          }
          playerId = newPlayer.id;
        }

        const joinTime = attendee.joinTime;
        const leaveTime = attendee.leaveTime || payload.endTime || Date.now();
        const minutesPresent = Math.max(0, Math.round((leaveTime - joinTime) / 1000 / 60));

        const { error: attendanceError } = await supabase.from('attendance').upsert({
          player_id: playerId,
          raid_id: raidId,
          present: true,
          on_time: true,
          benched: false,
          minutes_present: minutesPresent,
          source: 'raidlogger',
        }, { onConflict: 'player_id,raid_id' });

        if (attendanceError) {
          errors.push(`Attendance error for ${attendee.name}`);
          recordsFailed++;
        } else {
          recordsProcessed++;
        }
      } catch {
        errors.push(`Error processing ${attendee.name}`);
        recordsFailed++;
      }
    }

    for (const loot of lootDrops) {
      try {
        const { data: player } = await supabase
          .from('players')
          .select('id')
          .eq('name', loot.receiver)
          .maybeSingle() as { data: { id: string } | null };

        if (!player) {
          errors.push(`Loot receiver not found: ${loot.receiver}`);
          recordsFailed++;
          continue;
        }

        const { data: itemOverride } = await supabase
          .from('items')
          .select('tier_override')
          .eq('item_id', loot.itemId)
          .maybeSingle() as { data: { tier_override: string } | null };

        const { data: defaultTier } = await supabase
          .from('item_tiers')
          .select('tier, points')
          .eq('is_default', true)
          .maybeSingle() as { data: { tier: string; points: number } | null };

        let tier = 'B';
        let basePoints = 30;

        if (itemOverride?.tier_override) {
          tier = itemOverride.tier_override;
          const { data: tierConfig } = await supabase
            .from('item_tiers')
            .select('points')
            .eq('tier', tier)
            .maybeSingle() as { data: { points: number } | null };
          basePoints = tierConfig?.points || 30;
        } else if (defaultTier) {
          tier = defaultTier.tier;
          basePoints = defaultTier.points;
        }

        const { error: lootError } = await supabase.from('loot_drops').insert({
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
          errors.push(`Loot error for ${loot.itemName}`);
          recordsFailed++;
        } else {
          recordsProcessed++;
        }
      } catch {
        errors.push(`Error processing loot ${loot.itemName}`);
        recordsFailed++;
      }
    }

    for (const buff of buffs) {
      try {
        const { data: player } = await supabase
          .from('players')
          .select('id')
          .eq('name', buff.player)
          .maybeSingle() as { data: { id: string } | null };

        if (!player) continue;

        const { error: buffError } = await supabase.from('buff_uptimes').upsert({
          player_id: player.id,
          raid_id: raidId,
          buff_name: buff.name,
          uptime_percent: buff.uptime,
          source: 'raidlogger',
        }, { onConflict: 'player_id,raid_id,buff_name' });

        if (buffError) recordsFailed++;
        else recordsProcessed++;
      } catch {
        recordsFailed++;
      }
    }

    await supabase.from('import_logs').insert({
      source: 'raidlogger',
      status: recordsFailed > 0 ? (recordsProcessed > 0 ? 'partial' : 'failed') : 'success',
      records_processed: recordsProcessed,
      records_failed: recordsFailed,
      error_message: errors.length > 0 ? errors.slice(0, 10).join('; ') : null,
    });

    try { await supabase.rpc('refresh_player_scores'); } catch { /* non-critical */ }

    return NextResponse.json({
      success: true,
      raidId,
      zone: payload.zone,
      date: raidDate,
      recordsProcessed,
      recordsFailed,
      duration: `${Date.now() - startTime}ms`,
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { key } = await params;
  if (key === process.env.RAIDLOGGER_API_KEY) {
    return NextResponse.json({ status: 'ok', message: 'RaidLogger webhook ready' });
  }
  return NextResponse.json({ status: 'error', message: 'Invalid API key' }, { status: 401 });
}
