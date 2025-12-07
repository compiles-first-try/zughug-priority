import { createClient } from '@/lib/supabase/server';
import Leaderboard from '@/components/Leaderboard';
import type { PlayerScore, WowClass, WowRole } from '@/types/database';

// Mock data for initial testing (will be replaced with real data)
const MOCK_SCORES: PlayerScore[] = [
  { id: '1', name: 'Tankbro', class: 'warrior', role: 'tank', is_pug: false, attendance_pct: 95, performance_pct: 85, buff_pct: 90, time_since_loot: 60, loot_penalty_value: 30, manual_adjustment: 0, total_score: 78.5, calculated_at: new Date().toISOString() },
  { id: '2', name: 'Healzilla', class: 'priest', role: 'healer', is_pug: false, attendance_pct: 100, performance_pct: 92, buff_pct: 95, time_since_loot: 40, loot_penalty_value: 60, manual_adjustment: 0, total_score: 75.2, calculated_at: new Date().toISOString() },
  { id: '3', name: 'Pewpewmage', class: 'mage', role: 'dps', is_pug: false, attendance_pct: 85, performance_pct: 99, buff_pct: 88, time_since_loot: 20, loot_penalty_value: 45, manual_adjustment: 0, total_score: 72.1, calculated_at: new Date().toISOString() },
  { id: '4', name: 'Stabbyface', class: 'rogue', role: 'dps', is_pug: false, attendance_pct: 90, performance_pct: 88, buff_pct: 75, time_since_loot: 80, loot_penalty_value: 20, manual_adjustment: 5, total_score: 71.8, calculated_at: new Date().toISOString() },
  { id: '5', name: 'Natureboi', class: 'druid', role: 'healer', is_pug: false, attendance_pct: 80, performance_pct: 78, buff_pct: 92, time_since_loot: 100, loot_penalty_value: 10, manual_adjustment: 0, total_score: 68.4, calculated_at: new Date().toISOString() },
  { id: '6', name: 'Holysmiter', class: 'paladin', role: 'healer', is_pug: false, attendance_pct: 75, performance_pct: 82, buff_pct: 85, time_since_loot: 50, loot_penalty_value: 55, manual_adjustment: 0, total_score: 62.3, calculated_at: new Date().toISOString() },
  { id: '7', name: 'Arrowhead', class: 'hunter', role: 'dps', is_pug: false, attendance_pct: 70, performance_pct: 75, buff_pct: 70, time_since_loot: 90, loot_penalty_value: 15, manual_adjustment: 0, total_score: 58.9, calculated_at: new Date().toISOString() },
  { id: '8', name: 'Darkbinder', class: 'warlock', role: 'dps', is_pug: false, attendance_pct: 65, performance_pct: 91, buff_pct: 82, time_since_loot: 30, loot_penalty_value: 70, manual_adjustment: -5, total_score: 55.2, calculated_at: new Date().toISOString() },
  { id: '9', name: 'Earthshaker', class: 'shaman', role: 'healer', is_pug: false, attendance_pct: 60, performance_pct: 70, buff_pct: 78, time_since_loot: 70, loot_penalty_value: 25, manual_adjustment: 0, total_score: 52.1, calculated_at: new Date().toISOString() },
  { id: '10', name: 'Randomdude', class: 'hunter', role: 'dps', is_pug: true, attendance_pct: 20, performance_pct: 65, buff_pct: 50, time_since_loot: 100, loot_penalty_value: 0, manual_adjustment: 0, total_score: 38.5, calculated_at: new Date().toISOString() },
];

export default async function DashboardPage() {
  const supabase = await createClient();
  
  // Try to fetch real data, fall back to mock data
  let scores: PlayerScore[] = MOCK_SCORES;
  let isUsingMockData = true;
  
  try {
    const { data, error } = await supabase
      .from('player_scores')
      .select('*')
      .order('total_score', { ascending: false });
    
    if (!error && data && data.length > 0) {
      scores = data as PlayerScore[];
      isUsingMockData = false;
    }
  } catch {
    // Use mock data if view doesn't exist yet
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Loot Priority</h1>
          <p className="text-gray-400 text-sm">
            Current standings based on attendance, performance, and loot history
          </p>
        </div>
        
        {isUsingMockData && (
          <div className="px-3 py-1 bg-yellow-500/20 border border-yellow-500/50 rounded text-yellow-400 text-sm">
            Showing demo data
          </div>
        )}
      </div>

      {/* Leaderboard */}
      <Leaderboard scores={scores} />
    </div>
  );
}
