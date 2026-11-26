import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Coins,
  Flag,
  Flame,
  Fuel,
  Gauge,
  Gift,
  Lock,
  Music,
  Play,
  RotateCcw,
  Settings,
  Sliders,
  Target,
  Trophy,
  Volume2,
  VolumeX,
  Wrench,
  Zap,
} from 'lucide-react';
import {
  areAllDailyMissionsComplete,
  formatMissionProgress,
  getTimeUntilResetLabel,
} from '../game/missions';
import {
  getStatBarPercentages,
  getUpgradeCost,
  MAX_UNLOCKABLE_LEVEL,
  UPGRADE_DEFINITIONS,
} from '../game/storage';
import type {
  CrashReason,
  DailyMission,
  DailyMissionState,
  GameSettings,
  GraphicsQuality,
  MissionMetric,
  PlayerProfile,
  UpgradeKey,
} from '../game/types';
import { GameLogo } from './GameLogo';

function MissionIcon({ metric, className = 'h-4 w-4' }: { metric: MissionMetric; className?: string }) {
  switch (metric) {
    case 'distance_run':
      return <Flag className={`${className} text-sky-400`} />;
    case 'consecutive_backflips':
      return <RotateCcw className={`${className} text-amber-400`} />;
    case 'coins_daily':
      return <Coins className={`${className} text-yellow-400`} />;
    case 'nitro_daily':
      return <Flame className={`${className} text-cyan-400`} />;
    case 'big_jumps_daily':
      return <Zap className={`${className} text-violet-400`} />;
    case 'fuel_run':
      return <Fuel className={`${className} text-emerald-400`} />;
  }
}

/* ============================================================================
   1. MAIN MENU OVERLAY (Live 3D Alpine Monster Truck Backdrop)
   ============================================================================ */
interface MainMenuProps {
  profile: PlayerProfile;
  onPlay: () => void;
  onOpenGarage: () => void;
  onOpenMissions: () => void;
  onOpenSettings: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  profile,
  onPlay,
  onOpenGarage,
  onOpenMissions,
  onOpenSettings,
}) => {
  const completedCount = profile.dailyMissions.missions.filter((m) => m.completed).length;
  const totalCount = profile.dailyMissions.missions.length;
  const canClaimAllClear =
    areAllDailyMissionsComplete(profile.dailyMissions) && !profile.dailyMissions.allClearClaimed;

  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex flex-col justify-between p-4 sm:p-6">
      {/* Upper Calm Sky Area: Logo + Best Distance & Coins */}
      <div className="flex flex-col items-center gap-3 pt-1 sm:pt-2">
        <GameLogo variant="hero" />

        <div className="flex items-center gap-3 rounded-2xl border border-white/25 bg-[#0F172A]/82 px-5 py-2 shadow-xl">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-sky-200">
              Best
            </span>
            <span className="font-arcade text-lg font-bold text-white tabular-nums">
              {profile.bestDistance}m
            </span>
          </div>
          <div className="h-5 w-px bg-white/20" />
          <div className="flex items-center gap-1.5">
            <Coins className="h-4 w-4 text-amber-400" />
            <span className="font-arcade text-lg font-bold text-amber-300 tabular-nums">
              {profile.coins}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Action Dock (keeps center 3D Crimson Flame Monster Truck 100% unobstructed!) */}
      <div className="flex flex-col items-center gap-3 pb-2">
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={onOpenGarage}
            className="font-arcade flex items-center gap-2 rounded-2xl border-2 border-white/30 bg-[#0F172A]/88 px-5 py-3.5 text-base font-bold uppercase tracking-wider text-white shadow-lg transition-transform hover:border-amber-400 hover:bg-[#1E293B] active:scale-95"
          >
            <Wrench className="h-5 w-5 text-amber-400" />
            Garage
          </button>

          <button
            type="button"
            onClick={onOpenMissions}
            className={`font-arcade relative flex items-center gap-2 rounded-2xl border-2 px-5 py-3.5 text-base font-bold uppercase tracking-wider text-white shadow-lg transition-transform active:scale-95 ${
              canClaimAllClear
                ? 'border-amber-400 bg-[#1B263B]/95 hover:bg-[#23324D]'
                : 'border-white/30 bg-[#0F172A]/88 hover:border-emerald-400 hover:bg-[#1E293B]'
            }`}
          >
            <Target className="h-5 w-5 text-emerald-400" />
            Missions
            <span
              className={`rounded-md px-1.5 py-0.5 text-xs font-extrabold tabular-nums ${
                canClaimAllClear
                  ? 'bg-amber-400 text-slate-950'
                  : completedCount === totalCount
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-700 text-sky-200'
              }`}
            >
              {canClaimAllClear ? 'CLAIM' : `${completedCount}/${totalCount}`}
            </span>
          </button>

          <button
            type="button"
            onClick={onPlay}
            className="font-arcade flex items-center gap-2.5 rounded-2xl border-b-4 border-amber-700 bg-gradient-to-b from-amber-400 via-amber-500 to-orange-500 px-9 py-4 text-2xl font-extrabold italic tracking-wider text-slate-950 shadow-[0_8px_28px_rgba(245,158,11,0.5)] transition-transform hover:brightness-105 active:translate-y-0.5 active:scale-95"
          >
            <Play className="h-7 w-7 fill-slate-950" />
            PLAY
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="font-arcade flex items-center gap-2 rounded-2xl border-2 border-white/30 bg-[#0F172A]/88 px-5 py-3.5 text-base font-bold uppercase tracking-wider text-white shadow-lg transition-transform hover:border-sky-400 hover:bg-[#1E293B] active:scale-95"
          >
            <Settings className="h-5 w-5 text-sky-400" />
            Settings
          </button>
        </div>

        <p className="rounded-lg bg-[#0F172A]/72 px-3.5 py-1 text-xs font-medium tracking-wide text-sky-100">
          A / D or ← / → Drive & Air Tilt · Space / Shift Nitro · Esc Pause
        </p>
      </div>
    </div>
  );
};

/* ============================================================================
   2. PAUSE MODAL
   ============================================================================ */
interface PauseModalProps {
  settings: GameSettings;
  dailyMissions: DailyMissionState;
  onResume: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
  onUpdateSettings: (partial: Partial<GameSettings>) => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  settings,
  dailyMissions,
  onResume,
  onRestart,
  onMainMenu,
  onUpdateSettings,
}) => {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/65 p-4">
      <div className="w-full max-w-md rounded-3xl border-2 border-white/20 bg-[#0F172A] p-6 shadow-2xl">
        <h2 className="font-arcade mb-4 text-center text-3xl font-extrabold italic tracking-wider text-white">
          PAUSED
        </h2>

        {/* Compact Live Daily Missions Tracker */}
        <div className="mb-4 rounded-2xl border border-white/12 bg-slate-900/90 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
              <Target className="h-3.5 w-3.5" />
              Daily Missions
            </div>
            <span className="font-arcade text-xs font-bold text-slate-400 tabular-nums">
              {dailyMissions.missions.filter((m) => m.completed).length}/
              {dailyMissions.missions.length}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {dailyMissions.missions.map((m) => {
              const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
              return (
                <div key={m.id} className="flex items-center gap-2 text-xs">
                  {m.completed ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  ) : (
                    <MissionIcon metric={m.metric} className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`truncate font-semibold ${
                          m.completed ? 'text-emerald-300 line-through' : 'text-slate-200'
                        }`}
                      >
                        {m.description}
                      </span>
                      <span className="font-arcade shrink-0 text-[11px] font-bold text-amber-300 tabular-nums">
                        +{m.rewardCoins}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full rounded-full ${
                          m.completed ? 'bg-emerald-400' : 'bg-sky-400'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="font-arcade flex w-full items-center justify-center gap-2 rounded-2xl border-b-4 border-emerald-800 bg-gradient-to-b from-emerald-400 to-emerald-600 py-3.5 text-xl font-extrabold italic tracking-wide text-slate-950 transition-transform active:scale-95"
          >
            <Play className="h-5 w-5 fill-slate-950" />
            RESUME
          </button>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onRestart}
              className="font-arcade flex w-full items-center justify-center gap-1.5 rounded-2xl border border-white/20 bg-slate-800 py-3 text-base font-bold uppercase tracking-wider text-white transition-colors hover:bg-slate-700"
            >
              <RotateCcw className="h-4 w-4 text-amber-400" />
              Restart
            </button>

            <button
              type="button"
              onClick={onMainMenu}
              className="font-arcade flex w-full items-center justify-center gap-1.5 rounded-2xl border border-white/15 bg-slate-900 py-3 text-base font-bold uppercase tracking-wider text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Main Menu
            </button>
          </div>
        </div>

        {/* Quick Audio & Quality Bar */}
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-3.5">
          <button
            type="button"
            onClick={() => onUpdateSettings({ sfxMuted: !settings.sfxMuted })}
            className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 hover:border-sky-400"
          >
            {settings.sfxMuted ? (
              <VolumeX className="h-4 w-4 text-red-400" />
            ) : (
              <Volume2 className="h-4 w-4 text-emerald-400" />
            )}
            {settings.sfxMuted ? 'Muted' : 'Audio On'}
          </button>

          <div className="flex overflow-hidden rounded-xl border border-white/15 bg-slate-900">
            {(['low', 'medium', 'high'] as GraphicsQuality[]).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onUpdateSettings({ quality: q })}
                className={`px-2.5 py-1.5 text-xs font-bold uppercase ${
                  settings.quality === q
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   3. GAME OVER MODAL
   ============================================================================ */
interface GameOverModalProps {
  distance: number;
  runCoins: number;
  missionBonusCoins: number;
  completedMissions: DailyMission[];
  bestConsecutiveBackflips: number;
  bestDistance: number;
  isNewRecord: boolean;
  reason: CrashReason;
  dailyMissions: DailyMissionState;
  onRestart: () => void;
  onGarage: () => void;
  onMissions: () => void;
  onClaimAllClear: () => void;
  onMainMenu: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  distance,
  runCoins,
  missionBonusCoins,
  completedMissions,
  bestConsecutiveBackflips,
  bestDistance,
  isNewRecord,
  reason,
  dailyMissions,
  onRestart,
  onGarage,
  onMissions,
  onClaimAllClear,
  onMainMenu,
}) => {
  const headline =
    reason === 'fuel'
      ? 'OUT OF FUEL!'
      : reason === 'canyon'
      ? 'CANYON DROP!'
      : 'TRUCK CRASHED!';

  const totalRunEarned = runCoins + missionBonusCoins;
  const completedTotal = dailyMissions.missions.filter((m) => m.completed).length;
  const canClaimAllClear =
    areAllDailyMissionsComplete(dailyMissions) && !dailyMissions.allClearClaimed;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/68 p-4">
      <div className="w-full max-w-md rounded-3xl border-2 border-red-500/45 bg-[#0F172A] p-6 shadow-2xl">
        <div className="text-center">
          {isNewRecord && (
            <div className="font-arcade mb-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-slate-950">
              <Trophy className="h-3.5 w-3.5" />
              New Best Record!
            </div>
          )}
          <h2 className="font-arcade text-4xl font-extrabold italic tracking-wide text-red-400">
            {headline}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {bestConsecutiveBackflips >= 2
              ? `Best Backflip Streak: ${bestConsecutiveBackflips}x · Coins banked in Garage.`
              : 'Coins collected have been banked in your Garage.'}
          </p>
        </div>

        {/* Run Telemetry Cards */}
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <div className="rounded-2xl border border-white/15 bg-slate-800/90 p-3 text-center">
            <div className="text-[11px] font-bold uppercase tracking-wider text-sky-300">
              Distance
            </div>
            <div className="font-arcade mt-1 text-2xl font-extrabold text-white tabular-nums">
              {distance}m
            </div>
          </div>

          <div className="rounded-2xl border border-amber-400/35 bg-slate-800/90 p-3 text-center">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
              Earned
            </div>
            <div className="font-arcade mt-1 flex items-center justify-center gap-1 text-2xl font-extrabold text-amber-300 tabular-nums">
              +{totalRunEarned}
            </div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-slate-800/90 p-3 text-center">
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
              Best
            </div>
            <div className="font-arcade mt-1 text-2xl font-extrabold text-emerald-300 tabular-nums">
              {bestDistance}m
            </div>
          </div>
        </div>

        {/* Daily Mission Rewards Breakdown (when missions completed during this run) */}
        {completedMissions.length > 0 && (
          <div className="mt-3.5 rounded-2xl border border-emerald-400/40 bg-emerald-950/35 p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-arcade flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-emerald-300">
                <Trophy className="h-3.5 w-3.5 text-amber-400" />
                Mission Rewards
              </span>
              <span className="font-arcade text-sm font-extrabold text-amber-300 tabular-nums">
                +{missionBonusCoins} Coins
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {completedMissions.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-xs text-slate-200">
                  <span className="flex items-center gap-1.5 truncate">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <span className="truncate font-semibold">{m.title}</span>
                  </span>
                  <span className="font-arcade shrink-0 font-bold text-amber-300 tabular-nums">
                    +{m.rewardCoins}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instant Claim CTA if all 3 Daily Missions were completed! */}
        {canClaimAllClear && (
          <button
            type="button"
            onClick={onClaimAllClear}
            className="font-arcade mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-sm font-extrabold uppercase tracking-wider text-slate-950 shadow-lg transition-transform hover:brightness-105 active:scale-95"
          >
            <Gift className="h-4 w-4" />
            Claim All-Clear Bonus · +{dailyMissions.allClearBonus} Coins
          </button>
        )}

        {/* Actions */}
        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onRestart}
            className="font-arcade flex w-full items-center justify-center gap-2 rounded-2xl border-b-4 border-amber-700 bg-gradient-to-b from-amber-400 to-orange-500 py-3.5 text-xl font-extrabold italic tracking-wider text-slate-950 shadow-lg transition-transform active:scale-95"
          >
            <RotateCcw className="h-5 w-5" />
            RACE AGAIN
          </button>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onGarage}
              className="font-arcade flex items-center justify-center gap-1.5 rounded-2xl border border-white/20 bg-slate-800 py-2.5 text-sm font-bold uppercase tracking-wider text-white hover:border-amber-400 hover:bg-slate-700"
            >
              <Wrench className="h-4 w-4 text-amber-400" />
              Garage
            </button>
            <button
              type="button"
              onClick={onMissions}
              className="font-arcade flex items-center justify-center gap-1.5 rounded-2xl border border-white/20 bg-slate-800 py-2.5 text-sm font-bold uppercase tracking-wider text-white hover:border-emerald-400 hover:bg-slate-700"
            >
              <Target className="h-4 w-4 text-emerald-400" />
              {completedTotal}/{dailyMissions.missions.length}
            </button>
            <button
              type="button"
              onClick={onMainMenu}
              className="font-arcade flex items-center justify-center gap-1.5 rounded-2xl border border-white/15 bg-slate-900 py-2.5 text-sm font-bold uppercase tracking-wider text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Menu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   4. GARAGE SCREEN (Live 3D Truck Preview + Unlockable & Locked Upgrades)
   ============================================================================ */
interface GarageScreenProps {
  profile: PlayerProfile;
  onBuyUpgrade: (key: UpgradeKey) => void;
  onPlay: () => void;
  onBack: () => void;
}

export const GarageScreen: React.FC<GarageScreenProps> = ({
  profile,
  onBuyUpgrade,
  onPlay,
  onBack,
}) => {
  const statBars = getStatBarPercentages(profile.upgrades);

  const iconForUpgrade = (key: UpgradeKey) => {
    switch (key) {
      case 'engine':
        return <Gauge className="h-4 w-4 text-red-400" />;
      case 'suspension':
        return <Zap className="h-4 w-4 text-amber-400" />;
      case 'nitro':
        return <Flame className="h-4 w-4 text-cyan-400" />;
      case 'fuel':
        return <Fuel className="h-4 w-4 text-emerald-400" />;
    }
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex flex-col justify-between p-3 sm:p-5">
      {/* Top Bar: Back + Truck Title + Coin Bank */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-white/25 bg-[#0F172A]/88 px-4 py-2.5 text-sm font-bold text-white shadow-lg hover:border-amber-400"
          >
            <ArrowLeft className="h-4 w-4" />
            Menu
          </button>
          <div className="rounded-xl border border-white/20 bg-[#0F172A]/84 px-4 py-2 shadow-lg">
            <div className="font-arcade text-lg leading-tight font-extrabold italic tracking-wide text-white sm:text-xl">
              CRIMSON FLAME <span className="text-red-400">01</span>
            </div>
            <div className="text-[11px] font-medium text-sky-300">
              Drag truck to inspect 360°
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-xl border border-amber-400/50 bg-[#0F172A]/90 px-4 py-2 shadow-lg">
            <Coins className="h-5 w-5 text-amber-400" />
            <span className="font-arcade text-xl font-extrabold text-amber-300 tabular-nums">
              {profile.coins}
            </span>
          </div>
          <button
            type="button"
            onClick={onPlay}
            className="font-arcade pointer-events-auto hidden items-center gap-1.5 rounded-xl border-b-4 border-amber-700 bg-gradient-to-b from-amber-400 to-orange-500 px-5 py-2.5 text-base font-extrabold italic tracking-wider text-slate-950 shadow-lg sm:flex"
          >
            <Play className="h-4 w-4 fill-slate-950" />
            RACE
          </button>
        </div>
      </div>

      {/* Bottom Compact Garage Dock (keeps center 3D Monster Truck fully visible!) */}
      <div className="pointer-events-auto mx-auto w-full max-w-5xl rounded-3xl border border-white/20 bg-[#0F172A]/92 p-3.5 shadow-2xl sm:p-4">
        {/* Compact Vehicle Stat Meters */}
        <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2 border-b border-white/10 pb-3 sm:grid-cols-4">
          {[
            { label: 'Top Speed', val: statBars.speed, color: 'bg-red-500' },
            { label: 'Suspension', val: statBars.suspension, color: 'bg-amber-400' },
            { label: 'Nitro Power', val: statBars.nitro, color: 'bg-cyan-400' },
            { label: 'Fuel Tank', val: statBars.fuel, color: 'bg-emerald-400' },
          ].map((s) => (
            <div key={s.label}>
              <div className="mb-1 flex justify-between text-[11px] font-bold uppercase tracking-wider text-slate-300">
                <span>{s.label}</span>
                <span className="font-arcade text-white tabular-nums">{Math.round(s.val)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${s.color}`}
                  style={{ width: `${Math.min(100, s.val)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* 4 Upgrade Cards (Unlockable Levels 1-4 + Locked Pro Tier 5) */}
        <div className="grid max-h-[34vh] grid-cols-1 gap-2.5 overflow-y-auto sm:max-h-none sm:grid-cols-2 lg:grid-cols-4">
          {UPGRADE_DEFINITIONS.map((def) => {
            const level = profile.upgrades[def.key];
            const cost = getUpgradeCost(def.key, level);
            const canAfford = cost !== null && profile.coins >= cost;
            const maxed = level >= MAX_UNLOCKABLE_LEVEL;

            return (
              <div
                key={def.key}
                className="flex flex-col justify-between rounded-2xl border border-white/15 bg-slate-800/90 p-3"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {iconForUpgrade(def.key)}
                      <span className="font-arcade text-sm font-bold text-white">
                        {def.label}
                      </span>
                    </div>
                    <span className="font-arcade text-xs font-bold text-sky-300 tabular-nums">
                      Lv.{level}/{MAX_UNLOCKABLE_LEVEL}
                    </span>
                  </div>

                  <p className="mt-1 text-[11px] leading-snug text-slate-400">
                    {def.tagline}
                  </p>

                  {/* Rank Pips (4 unlockable + 1 locked Pro preview slot) */}
                  <div className="mt-2.5 flex items-center gap-1">
                    {Array.from({ length: MAX_UNLOCKABLE_LEVEL }).map((_, idx) => (
                      <div
                        key={idx}
                        className={`h-2 flex-1 rounded-sm ${
                          idx < level ? 'bg-amber-400' : 'bg-slate-700'
                        }`}
                      />
                    ))}
                    <div
                      title={`${def.lockedTierName} — ${def.lockedRequirement}`}
                      className="flex h-2 flex-1 items-center justify-center rounded-sm bg-slate-900 ring-1 ring-slate-600"
                    />
                  </div>

                  {/* Locked Apex Tier Preview Row */}
                  <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                    <Lock className="h-3 w-3 shrink-0 text-slate-500" />
                    <span className="truncate">
                      Tier 5: {def.lockedTierName}
                    </span>
                  </div>
                </div>

                {/* Purchase Button */}
                <button
                  type="button"
                  disabled={maxed || !canAfford}
                  onClick={() => onBuyUpgrade(def.key)}
                  className={`font-arcade mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-bold uppercase tracking-wide transition-transform active:scale-95 ${
                    maxed
                      ? 'cursor-default border border-slate-600 bg-slate-900 text-slate-400'
                      : canAfford
                      ? 'bg-gradient-to-b from-amber-400 to-orange-500 text-slate-950 hover:brightness-105'
                      : 'cursor-not-allowed border border-white/10 bg-slate-900/90 text-slate-400'
                  }`}
                >
                  {maxed ? (
                    <>
                      <Lock className="h-3.5 w-3.5" />
                      Pro Locked
                    </>
                  ) : (
                    <>
                      <Coins className="h-3.5 w-3.5" />
                      Upgrade · {cost}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   5. SETTINGS MODAL (Graphics Quality, Volume, Mute, Music, Reset Save)
   ============================================================================ */
interface SettingsModalProps {
  settings: GameSettings;
  onUpdateSettings: (partial: Partial<GameSettings>) => void;
  onResetSave: () => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onUpdateSettings,
  onResetSave,
  onClose,
}) => {
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/68 p-4">
      <div className="w-full max-w-md rounded-3xl border-2 border-white/20 bg-[#0F172A] p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="h-5 w-5 text-sky-400" />
            <h2 className="font-arcade text-2xl font-extrabold italic tracking-wide text-white">
              SETTINGS
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/20 bg-slate-800 px-3 py-1.5 text-xs font-bold uppercase text-slate-200 hover:border-sky-400"
          >
            Done
          </button>
        </div>

        <div className="flex flex-col gap-5">
          {/* Graphics Quality Preset */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-200">Graphics Quality</span>
              <span className="text-xs text-sky-300">
                {settings.quality === 'low'
                  ? 'Fastest Mobile FPS'
                  : settings.quality === 'medium'
                  ? 'Balanced Shadows & VFX'
                  : 'Full Shadows & Rich VFX'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['low', 'medium', 'high'] as GraphicsQuality[]).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onUpdateSettings({ quality: q })}
                  className={`font-arcade rounded-xl border py-2.5 text-sm font-bold uppercase tracking-wider transition-colors ${
                    settings.quality === q
                      ? 'border-sky-300 bg-sky-500 text-slate-950'
                      : 'border-white/15 bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Master Volume Slider */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-200">Master Volume</span>
              <span className="font-arcade text-sm font-bold text-amber-300 tabular-nums">
                {Math.round(settings.masterVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.masterVolume * 100)}
              onChange={(e) =>
                onUpdateSettings({
                  masterVolume: Number(e.target.value) / 100,
                  sfxMuted: Number(e.target.value) === 0 ? true : settings.sfxMuted,
                })
              }
              className="h-2.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-700 accent-amber-400"
            />
          </div>

          {/* Mute SFX & Background Music Toggles */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onUpdateSettings({ sfxMuted: !settings.sfxMuted })}
              className={`flex items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-bold ${
                settings.sfxMuted
                  ? 'border-red-500/50 bg-red-950/60 text-red-300'
                  : 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
              }`}
            >
              {settings.sfxMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              {settings.sfxMuted ? 'Sound Muted' : 'Sound Active'}
            </button>

            <button
              type="button"
              onClick={() => onUpdateSettings({ musicEnabled: !settings.musicEnabled })}
              className={`flex items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-bold ${
                settings.musicEnabled
                  ? 'border-sky-400/50 bg-sky-950/50 text-sky-300'
                  : 'border-white/15 bg-slate-800 text-slate-400'
              }`}
            >
              <Music className="h-4 w-4" />
              {settings.musicEnabled ? 'Music On' : 'Music Off'}
            </button>
          </div>

          {/* Safe Inline Reset Progress Confirmation */}
          <div className="border-t border-white/10 pt-4">
            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="w-full rounded-xl border border-red-500/30 bg-red-950/30 py-2.5 text-xs font-bold uppercase tracking-wider text-red-300 hover:bg-red-950/60"
              >
                Reset Best Distance & Upgrades
              </button>
            ) : (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-red-500/50 bg-red-950/60 p-2.5">
                <span className="text-xs font-semibold text-red-200">
                  Clear all local progress?
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-bold text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onResetSave();
                      setConfirmReset(false);
                    }}
                    className="rounded-lg bg-red-600 px-3 py-1 text-xs font-bold text-white"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   6. DAILY MISSIONS MODAL (Rotating Daily Objectives + All-Clear Bonus Chest)
   ============================================================================ */
interface DailyMissionsModalProps {
  profile: PlayerProfile;
  onClaimAllClear: () => void;
  onPlay: () => void;
  onClose: () => void;
}

export const DailyMissionsModal: React.FC<DailyMissionsModalProps> = ({
  profile,
  onClaimAllClear,
  onPlay,
  onClose,
}) => {
  const [resetLabel, setResetLabel] = useState(() => getTimeUntilResetLabel());

  useEffect(() => {
    const id = window.setInterval(() => {
      setResetLabel(getTimeUntilResetLabel());
    }, 30000);
    return () => window.clearInterval(id);
  }, []);

  const { dailyMissions } = profile;
  const completedCount = dailyMissions.missions.filter((m) => m.completed).length;
  const totalCount = dailyMissions.missions.length;
  const allComplete = areAllDailyMissionsComplete(dailyMissions);
  const canClaimAllClear = allComplete && !dailyMissions.allClearClaimed;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-3xl border-2 border-white/20 bg-[#0F172A] p-5 shadow-2xl sm:p-6">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-emerald-400" />
              <h2 className="font-arcade text-2xl font-extrabold italic tracking-wide text-white sm:text-3xl">
                DAILY MISSIONS
              </h2>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-sky-300">
              <Clock className="h-3.5 w-3.5" />
              New challenges in {resetLabel}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-xl border border-amber-400/45 bg-slate-900 px-3 py-1.5">
              <Coins className="h-4 w-4 text-amber-400" />
              <span className="font-arcade text-base font-extrabold text-amber-300 tabular-nums">
                {profile.coins}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/20 bg-slate-800 px-3 py-1.5 text-xs font-bold uppercase text-slate-200 hover:border-sky-400"
            >
              Done
            </button>
          </div>
        </div>

        {/* 3 Daily Mission Cards */}
        <div className="flex flex-col gap-3 overflow-y-auto pr-0.5">
          {dailyMissions.missions.map((mission) => {
            const pct = Math.min(100, Math.round((mission.progress / mission.target) * 100));
            return (
              <div
                key={mission.id}
                className={`rounded-2xl border p-3.5 transition-colors ${
                  mission.completed
                    ? 'border-emerald-400/50 bg-emerald-950/30'
                    : 'border-white/15 bg-slate-800/90'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                        mission.completed
                          ? 'border-emerald-400/50 bg-emerald-500/20'
                          : 'border-white/15 bg-slate-900'
                      }`}
                    >
                      {mission.completed ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <MissionIcon metric={mission.metric} className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-arcade text-base font-bold text-white">
                          {mission.title}
                        </span>
                        <span className="rounded bg-slate-900/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-300">
                          {mission.mode === 'single_run' ? 'Single Run' : 'Daily Total'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-300">{mission.description}</p>
                    </div>
                  </div>

                  <div
                    className={`font-arcade flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-sm font-extrabold tabular-nums ${
                      mission.completed
                        ? 'border border-emerald-400/40 bg-emerald-500/20 text-emerald-300'
                        : 'border border-amber-400/40 bg-amber-400/15 text-amber-300'
                    }`}
                  >
                    <Coins className="h-3.5 w-3.5" />+{mission.rewardCoins}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[11px] font-bold">
                    <span className={mission.completed ? 'text-emerald-300' : 'text-slate-300'}>
                      {mission.completed ? 'Completed · Reward Banked' : formatMissionProgress(mission)}
                    </span>
                    <span className="font-arcade text-sky-200 tabular-nums">{pct}%</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-900">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        mission.completed
                          ? 'bg-gradient-to-r from-emerald-400 to-teal-300'
                          : 'bg-gradient-to-r from-sky-500 to-cyan-300'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* All-Clear Mastery Bonus Chest */}
        <div className="mt-4 rounded-2xl border border-amber-400/35 bg-slate-900/95 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-amber-400" />
              <div>
                <div className="font-arcade text-sm font-extrabold uppercase tracking-wide text-white">
                  Daily All-Clear Bonus
                </div>
                <div className="text-[11px] text-slate-400">
                  Complete all {totalCount} missions today ({completedCount}/{totalCount})
                </div>
              </div>
            </div>

            {canClaimAllClear ? (
              <button
                type="button"
                onClick={onClaimAllClear}
                className="font-arcade flex items-center gap-1.5 rounded-xl border-b-2 border-amber-700 bg-gradient-to-b from-amber-400 to-orange-500 px-3.5 py-2 text-sm font-extrabold uppercase tracking-wider text-slate-950 shadow-md transition-transform hover:brightness-105 active:scale-95"
              >
                <Coins className="h-4 w-4" />
                Claim +{dailyMissions.allClearBonus}
              </button>
            ) : dailyMissions.allClearClaimed ? (
              <span className="font-arcade flex items-center gap-1 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-extrabold uppercase text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                Claimed
              </span>
            ) : (
              <span className="font-arcade flex items-center gap-1 rounded-xl border border-white/15 bg-slate-800 px-3 py-1.5 text-sm font-extrabold text-amber-300 tabular-nums">
                <Coins className="h-3.5 w-3.5" />+{dailyMissions.allClearBonus}
              </span>
            )}
          </div>

          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-300"
              style={{ width: `${Math.round((completedCount / totalCount) * 100)}%` }}
            />
          </div>
        </div>

        {/* Quick Race CTA */}
        <button
          type="button"
          onClick={onPlay}
          className="font-arcade mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border-b-4 border-amber-700 bg-gradient-to-b from-amber-400 to-orange-500 py-3 text-lg font-extrabold italic tracking-wider text-slate-950 shadow-lg transition-transform hover:brightness-105 active:scale-95"
        >
          <Play className="h-5 w-5 fill-slate-950" />
          RACE NOW
        </button>
      </div>
    </div>
  );
};
