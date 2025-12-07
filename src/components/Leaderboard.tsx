'use client';

import { useState, useMemo } from 'react';
import type { PlayerScore, WowClass, WowRole } from '@/types/database';
import { WOW_CLASS_COLORS } from '@/types/database';

interface LeaderboardProps {
  scores: PlayerScore[];
}

type FilterClass = WowClass | 'all';
type FilterRole = WowRole | 'all';

export default function Leaderboard({ scores }: LeaderboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClass, setFilterClass] = useState<FilterClass>('all');
  const [filterRole, setFilterRole] = useState<FilterRole>('all');
  const [hidePugs, setHidePugs] = useState(true);

  const filteredScores = useMemo(() => {
    return scores.filter(player => {
      // Search filter
      if (searchQuery && !player.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      // Class filter
      if (filterClass !== 'all' && player.class !== filterClass) {
        return false;
      }
      // Role filter
      if (filterRole !== 'all' && player.role !== filterRole) {
        return false;
      }
      // PUG filter
      if (hidePugs && player.is_pug) {
        return false;
      }
      return true;
    });
  }, [scores, searchQuery, filterClass, filterRole, hidePugs]);

  const classOptions: { value: FilterClass; label: string }[] = [
    { value: 'all', label: 'All Classes' },
    { value: 'warrior', label: 'Warrior' },
    { value: 'paladin', label: 'Paladin' },
    { value: 'hunter', label: 'Hunter' },
    { value: 'rogue', label: 'Rogue' },
    { value: 'priest', label: 'Priest' },
    { value: 'shaman', label: 'Shaman' },
    { value: 'mage', label: 'Mage' },
    { value: 'warlock', label: 'Warlock' },
    { value: 'druid', label: 'Druid' },
  ];

  const roleOptions: { value: FilterRole; label: string }[] = [
    { value: 'all', label: 'All Roles' },
    { value: 'tank', label: 'Tank' },
    { value: 'healer', label: 'Healer' },
    { value: 'dps', label: 'DPS' },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-surface rounded-lg p-4 border border-secondary">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search player..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-secondary rounded
                         text-white placeholder-gray-500
                         focus:outline-none focus:border-primary"
            />
          </div>

          {/* Class Filter */}
          <select
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value as FilterClass)}
            className="px-3 py-2 bg-background border border-secondary rounded
                       text-white focus:outline-none focus:border-primary"
          >
            {classOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Role Filter */}
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value as FilterRole)}
            className="px-3 py-2 bg-background border border-secondary rounded
                       text-white focus:outline-none focus:border-primary"
          >
            {roleOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Hide PUGs Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hidePugs}
              onChange={(e) => setHidePugs(e.target.checked)}
              className="w-4 h-4 rounded border-secondary bg-background 
                         text-primary focus:ring-primary focus:ring-offset-0"
            />
            <span className="text-sm text-gray-400">Hide PUGs</span>
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-lg border border-secondary overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-secondary/50 text-left text-sm text-gray-400">
                <th className="px-4 py-3 font-medium w-12">#</th>
                <th className="px-4 py-3 font-medium">Player</th>
                <th className="px-4 py-3 font-medium text-center hidden sm:table-cell">Role</th>
                <th className="px-4 py-3 font-medium text-right hidden md:table-cell">Attend %</th>
                <th className="px-4 py-3 font-medium text-right hidden md:table-cell">Parse %</th>
                <th className="px-4 py-3 font-medium text-right hidden lg:table-cell">Buffs %</th>
                <th className="px-4 py-3 font-medium text-right hidden lg:table-cell">Time w/o Loot</th>
                <th className="px-4 py-3 font-medium text-right hidden lg:table-cell">Loot Penalty</th>
                <th className="px-4 py-3 font-medium text-right">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary">
              {filteredScores.map((player, index) => (
                <tr 
                  key={player.id}
                  className="hover:bg-secondary/30 transition-colors"
                >
                  {/* Rank */}
                  <td className="px-4 py-3 text-gray-400 font-medium">
                    {index + 1}
                  </td>

                  {/* Player Name with Class Color */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span 
                        className="font-medium"
                        style={{ color: WOW_CLASS_COLORS[player.class] }}
                      >
                        {player.name}
                      </span>
                      {player.is_pug && (
                        <span className="px-1.5 py-0.5 text-xs bg-gray-700 text-gray-400 rounded">
                          PUG
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 capitalize sm:hidden">
                      {player.role}
                    </span>
                  </td>

                  {/* Role */}
                  <td className="px-4 py-3 text-center hidden sm:table-cell">
                    <span className={`
                      px-2 py-1 text-xs rounded capitalize
                      ${player.role === 'tank' ? 'bg-blue-500/20 text-blue-400' : ''}
                      ${player.role === 'healer' ? 'bg-green-500/20 text-green-400' : ''}
                      ${player.role === 'dps' ? 'bg-red-500/20 text-red-400' : ''}
                    `}>
                      {player.role}
                    </span>
                  </td>

                  {/* Attendance */}
                  <td className="px-4 py-3 text-right hidden md:table-cell">
                    <span className={getPercentColor(player.attendance_pct)}>
                      {player.attendance_pct.toFixed(0)}%
                    </span>
                  </td>

                  {/* Parse */}
                  <td className="px-4 py-3 text-right hidden md:table-cell">
                    <span className={getParseColor(player.performance_pct)}>
                      {player.performance_pct.toFixed(0)}%
                    </span>
                  </td>

                  {/* Buffs */}
                  <td className="px-4 py-3 text-right hidden lg:table-cell">
                    <span className={getPercentColor(player.buff_pct)}>
                      {player.buff_pct.toFixed(0)}%
                    </span>
                  </td>

                  {/* Time Since Loot (normalized 0-100) */}
                  <td className="px-4 py-3 text-right hidden lg:table-cell text-gray-400">
                    {player.time_since_loot.toFixed(0)}
                  </td>

                  {/* Loot Penalty */}
                  <td className="px-4 py-3 text-right hidden lg:table-cell">
                    <span className={player.loot_penalty_value > 50 ? 'text-red-400' : 'text-gray-400'}>
                      -{player.loot_penalty_value.toFixed(0)}
                    </span>
                  </td>

                  {/* Total Score */}
                  <td className="px-4 py-3 text-right">
                    <span className="font-bold text-white text-lg">
                      {player.total_score.toFixed(1)}
                    </span>
                  </td>
                </tr>
              ))}

              {filteredScores.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    No players found matching filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        <span>Parse colors: <span className="text-gray-400">Gray &lt;25</span> | <span className="text-green-400">Green 25-49</span> | <span className="text-blue-400">Blue 50-74</span> | <span className="text-purple-400">Purple 75-94</span> | <span className="text-orange-400">Orange 95-99</span> | <span className="text-yellow-300">Gold 100</span></span>
      </div>
    </div>
  );
}

// Helper functions for coloring
function getPercentColor(value: number): string {
  if (value >= 90) return 'text-green-400';
  if (value >= 75) return 'text-yellow-400';
  if (value >= 50) return 'text-orange-400';
  return 'text-red-400';
}

function getParseColor(value: number): string {
  if (value === 100) return 'text-yellow-300 font-bold'; // Gold parse
  if (value >= 95) return 'text-orange-400'; // Orange parse
  if (value >= 75) return 'text-purple-400'; // Purple parse
  if (value >= 50) return 'text-blue-400';   // Blue parse
  if (value >= 25) return 'text-green-400';  // Green parse
  return 'text-gray-400'; // Gray parse
}
