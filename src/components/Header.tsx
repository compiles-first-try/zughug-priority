'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { User } from '@supabase/supabase-js';

interface HeaderProps {
  user: User;
}

export default function Header({ user }: HeaderProps) {
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  // Get avatar URL from Discord
  const avatarUrl = user.user_metadata?.avatar_url || 
    `https://cdn.discordapp.com/embed/avatars/${parseInt(user.id) % 5}.png`;
  const username = user.user_metadata?.full_name || 
    user.user_metadata?.name || 
    user.email || 
    'Raider';

  return (
    <header className="bg-surface border-b border-secondary">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚔️</span>
            <div>
              <h1 className="text-lg font-bold text-white">ZugHug</h1>
              <p className="text-xs text-gray-400 hidden sm:block">Loot Priority</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <a href="/dashboard" className="text-white hover:text-primary transition-colors">
              Leaderboard
            </a>
            <a href="/dashboard/loot" className="text-gray-400 hover:text-white transition-colors">
              Loot History
            </a>
            <a href="/dashboard/raids" className="text-gray-400 hover:text-white transition-colors">
              Raids
            </a>
          </nav>

          {/* User Menu */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium text-white">{username}</p>
                <p className="text-xs text-gray-400">Member</p>
              </div>
              <div className="relative w-9 h-9 rounded-full overflow-hidden bg-secondary">
                <Image
                  src={avatarUrl}
                  alt={username}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
            </div>
            
            <button
              onClick={handleSignOut}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-white 
                         hover:bg-secondary rounded transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
