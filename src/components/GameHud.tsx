import React, { useState } from 'react';
import { Flame, Fuel, Pause, Coins, Gauge, Trophy, RotateCcw } from 'lucide-react';
import type { HudSnapshot, InputState, MissionToastItem } from '../game/types';
import { GameLogo } from './GameLogo';

interface GameHudProps {
  hud: HudSnapshot;
  missionToast: MissionToastItem | null;
  inputRef: React.MutableRefObject<InputState>;
  onPause: () => void;
  onUnlockAudio: () => void;
}

const SPEED_LINE_ROWS = [
  { top: 10, w: 34, delay: 0.0, h: 3 },
  { top: 18, w: 22, delay: 0.07, h: 2 },
  { top: 27, w: 42, delay: 0.03, h: 3 },
  { top: 38, w: 28, delay: 0.11, h: 2 },
  { top: 52, w: 36, delay: 0.05, h: 3 },
  { top: 64, w: 24, delay: 0.14, h: 2 },
  { top: 76, w: 40, delay: 0.08, h: 3 },
  { top: 86, w: 30, delay: 0.02, h: 2 },
];

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  missionToast,
  inputRef,
  onPause,
  onUnlockAudio,
}) => {
  const [pressed, setPressed] = useState({
    brake: false,
    accelerate: false,
    nitro: false,
  });

  const bindControl = (key: keyof InputState) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      onUnlockAudio();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore if pointer capture unavailable
      }
      inputRef.current[key] = true;
      setPressed((p) => (p[key] ? p : { ...p, [key]: true }));
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      inputRef.current[key] = false;
      setPressed((p) => (p[key] ? { ...p, [key]: false } : p));
    },
    onPointerCancel: () => {
      inputRef.current[key] = false;
      setPressed((p) => (p[key] ? { ...p, [key]: false } : p));
    },
    onLostPointerCapture: () => {
      inputRef.current[key] = false;
      setPressed((p) => (p[key] ? { ...p, [key]: false } : p));
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const fuelPct = Math.max(0, Math.min(100, Math.round(hud.fuel)));
  const nitroPct = Math.max(0, Math.min(100, Math.round(hud.nitro)));
  const showSpeedLines = hud.nitroActive || hud.highSpeed;

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between overflow-hidden select-none">
      {/* Layered Arcade Speed Streaks & Cyan Nitro Screen Edge Glow */}
      {showSpeedLines && (
        <div
          className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-150"
          style={{
            boxShadow: hud.nitroActive
              ? 'inset 0 0 105px 22px rgba(0, 212, 255, 0.46)'
              : 'inset 0 0 65px 10px rgba(186, 230, 253, 0.2)',
          }}
        >
          {SPEED_LINE_ROWS.map((row, idx) => (
            <div
              key={idx}
              className="animate-speed-line absolute right-0 rounded-full"
              style={{
                top: `${row.top}%`,
                width: `${hud.nitroActive ? row.w : row.w * 0.72}%`,
                height: `${row.h}px`,
                background: hud.nitroActive
                  ? 'linear-gradient(to left, rgba(224,252,255,0.95), rgba(0,212,255,0.65), transparent)'
                  : 'linear-gradient(to left, rgba(255,255,255,0.58), rgba(186,230,253,0.25), transparent)',
                animationDelay: `${row.delay}s`,
                animationDuration: hud.nitroActive ? '0.2s' : '0.32s',
              }}
            />
          ))}
        </div>
      )}

      {/* Brief Warm Impact Hit-Flash Vignette on Major Crashes */}
      {hud.crashFlash > 0.02 && (
        <div
          className="pointer-events-none fixed inset-0 z-10"
          style={{
            opacity: Math.min(1, hud.crashFlash),
            background:
              'radial-gradient(circle at center, rgba(255,244,214,0.22) 25%, rgba(239,68,68,0.55) 100%)',
          }}
        />
      )}

      {/* Floating +10 Coin / Streak / +FUEL / BIG AIR Popups */}
      <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
        {hud.floatingTexts.map((ft) => (
          <div
            key={ft.id}
            className="animate-score-pop font-arcade absolute flex flex-col items-center leading-none"
            style={{
              left: `${ft.xPercent}%`,
              top: `${ft.yPercent}%`,
              color: ft.color,
            }}
          >
            <span
              className="text-2xl font-extrabold italic tracking-wide sm:text-3xl"
              style={{
                transform: ft.scale ? `scale(${ft.scale})` : undefined,
                textShadow:
                  '0 3px 0 rgba(10,16,28,0.95), 0 0 14px rgba(255,212,59,0.7)',
              }}
            >
              {ft.text}
            </span>
            {ft.subText && (
              <span
                className="mt-0.5 rounded bg-[#0F172A]/85 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white"
              >
                {ft.subText}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* TOP BAR: Left = Logo + Distance + Pause | Right = Coins + Fuel + Nitro */}
      <div className="relative z-20 flex items-start justify-between gap-2 p-3 sm:p-4">
        {/* TOP LEFT CLUSTER */}
        <div className="flex flex-col items-start gap-2">
          <div className="flex items-center gap-2">
            <GameLogo variant="compact" />
            <button
              type="button"
              onClick={onPause}
              aria-label="Pause Game"
              className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-xl border-2 border-white/25 bg-[#0F172A]/85 text-white shadow-lg transition-transform active:scale-95 hover:border-[#FFB800] hover:bg-[#1E293B]"
            >
              <Pause className="h-5 w-5" />
            </button>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-[#0F172A]/82 px-3.5 py-1.5 shadow-md">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-sky-300">
                Distance
              </div>
              <div className="font-arcade flex items-baseline gap-1 text-2xl leading-none font-bold text-white tabular-nums sm:text-3xl">
                {hud.distance}
                <span className="text-sm font-semibold text-amber-400">m</span>
              </div>
            </div>
            <div className="h-7 w-px bg-white/15" />
            <div className="flex items-center gap-1.5">
              <Gauge
                className={`h-4 w-4 ${
                  hud.nitroActive ? 'text-cyan-300' : 'text-sky-300'
                }`}
              />
              <div className="font-arcade text-base font-bold text-sky-100 tabular-nums sm:text-lg">
                {hud.speedKmh}
                <span className="ml-0.5 text-[11px] font-semibold text-sky-300">km/h</span>
              </div>
            </div>
          </div>

          {hud.consecutiveBackflips >= 1 && (
            <div className="flex items-center gap-1.5 rounded-xl border border-amber-400/60 bg-[#0F172A]/88 px-3 py-1 shadow-md">
              <RotateCcw className="h-3.5 w-3.5 text-amber-400" />
              <span className="font-arcade text-xs font-extrabold uppercase tracking-wider text-amber-300 tabular-nums">
                {hud.consecutiveBackflips}x Backflip{hud.consecutiveBackflips > 1 ? ' Streak!' : ''}
              </span>
            </div>
          )}
        </div>

        {/* TOP CENTER CELEBRATORY MISSION COMPLETE TOAST */}
        {missionToast && (
          <div className="pointer-events-none absolute top-3 left-1/2 z-30 -translate-x-1/2 sm:top-4">
            <div className="flex items-center gap-2.5 rounded-2xl border-2 border-amber-400 bg-[#0F172A]/95 px-4 py-2 shadow-[0_8px_28px_rgba(245,158,11,0.45)]">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-slate-950">
                <Trophy className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="font-arcade text-[10px] leading-none font-extrabold uppercase tracking-widest text-emerald-400">
                  Mission Complete!
                </div>
                <div className="font-arcade mt-0.5 truncate text-sm leading-tight font-bold text-white sm:text-base">
                  {missionToast.title}
                </div>
                {missionToast.isAllClearReady && (
                  <div className="text-[10px] font-bold text-amber-300">
                    All 3 Done — Claim Bonus!
                  </div>
                )}
              </div>
              <div className="font-arcade ml-1 flex shrink-0 items-center gap-1 rounded-lg bg-amber-400 px-2.5 py-1 text-sm font-extrabold text-slate-950 tabular-nums">
                <Coins className="h-3.5 w-3.5" />+{missionToast.rewardCoins}
              </div>
            </div>
          </div>
        )}

        {/* TOP RIGHT CLUSTER: Coins, Fuel, Nitro */}
        <div className="flex flex-col items-end gap-2">
          {/* Coin Counter with Combo Streak Tag */}
          <div className="flex items-center gap-2 rounded-xl border border-amber-400/50 bg-[#0F172A]/86 px-3.5 py-1.5 shadow-md">
            <Coins className="h-5 w-5 text-amber-400" />
            <span className="font-arcade text-xl leading-none font-bold text-amber-300 tabular-nums sm:text-2xl">
              {hud.runCoins}
            </span>
            {hud.coinCombo >= 3 && (
              <span className="font-arcade rounded-md bg-amber-400 px-1.5 py-0.5 text-[11px] leading-none font-extrabold text-slate-950 tabular-nums">
                {hud.coinCombo}x
              </span>
            )}
          </div>

          {/* Fuel & Nitro Meters */}
          <div className="flex w-40 flex-col gap-1.5 rounded-xl border border-white/20 bg-[#0F172A]/84 p-2.5 shadow-md sm:w-48">
            <div className="flex items-center gap-2">
              <Fuel
                className={`h-4 w-4 shrink-0 ${
                  hud.lowFuel ? 'text-red-400' : 'text-emerald-400'
                }`}
              />
              <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full transition-[width] duration-75 ${
                    hud.lowFuel
                      ? 'bg-gradient-to-r from-red-600 to-orange-500'
                      : 'bg-gradient-to-r from-emerald-500 to-lime-400'
                  }`}
                  style={{ width: `${fuelPct}%` }}
                />
              </div>
              <span className="font-arcade w-8 text-right text-xs font-bold text-slate-200 tabular-nums">
                {fuelPct}%
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Flame
                className={`h-4 w-4 shrink-0 ${
                  hud.nitroActive ? 'text-cyan-300' : 'text-sky-400'
                }`}
              />
              <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full transition-[width] duration-75 ${
                    hud.nitroActive
                      ? 'bg-gradient-to-r from-cyan-300 via-sky-200 to-white'
                      : 'bg-gradient-to-r from-blue-500 to-cyan-400'
                  }`}
                  style={{ width: `${nitroPct}%` }}
                />
              </div>
              <span className="font-arcade w-8 text-right text-xs font-bold text-cyan-200 tabular-nums">
                {nitroPct}%
              </span>
            </div>
          </div>

          {hud.lowFuel && (
            <div className="font-arcade rounded-lg border border-red-400 bg-red-600/92 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-lg">
              Low Fuel — Grab Red Can!
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM CONTROLS: Mobile-First Tactile Pedals */}
      <div className="relative z-20 flex items-end justify-between px-3 pb-4 sm:px-6 sm:pb-6">
        {/* Bottom Left: BRAKE / REVERSE */}
        <button
          type="button"
          {...bindControl('brake')}
          aria-label="Brake or Reverse"
          className={`pointer-events-auto flex h-24 w-28 flex-col items-center justify-center rounded-2xl border-b-4 shadow-xl transition-transform sm:h-28 sm:w-36 ${
            pressed.brake
              ? 'translate-y-1 scale-95 border-red-900 bg-red-600 text-white'
              : 'border-red-950 bg-gradient-to-b from-red-500 to-red-700 text-white hover:brightness-110'
          }`}
        >
          <span className="font-arcade text-lg font-extrabold italic tracking-wide sm:text-xl">
            BRAKE
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-red-100">
            Reverse / Tilt
          </span>
        </button>

        {/* Bottom Right: NITRO + ACCELERATE */}
        <div className="flex items-end gap-2.5 sm:gap-3.5">
          <button
            type="button"
            {...bindControl('nitro')}
            disabled={nitroPct < 2}
            aria-label="Nitro Boost"
            className={`pointer-events-auto flex h-20 w-24 flex-col items-center justify-center rounded-2xl border-b-4 shadow-xl transition-transform sm:h-24 sm:w-28 ${
              nitroPct < 2
                ? 'cursor-not-allowed border-slate-800 bg-slate-700/80 text-slate-400'
                : pressed.nitro || hud.nitroActive
                ? 'translate-y-1 scale-95 border-cyan-900 bg-cyan-400 text-slate-950 shadow-[0_0_28px_rgba(0,212,255,0.92)]'
                : 'border-blue-950 bg-gradient-to-b from-cyan-400 to-blue-600 text-white hover:brightness-110'
            }`}
          >
            <Flame className="mb-0.5 h-5 w-5 sm:h-6 sm:w-6" />
            <span className="font-arcade text-base font-extrabold italic tracking-wide sm:text-lg">
              NITRO
            </span>
          </button>

          <button
            type="button"
            {...bindControl('accelerate')}
            aria-label="Accelerate"
            className={`pointer-events-auto flex h-24 w-28 flex-col items-center justify-center rounded-2xl border-b-4 shadow-xl transition-transform sm:h-28 sm:w-36 ${
              pressed.accelerate
                ? 'translate-y-1 scale-95 border-emerald-950 bg-emerald-500 text-white'
                : 'border-emerald-950 bg-gradient-to-b from-emerald-400 to-emerald-600 text-white hover:brightness-110'
            }`}
          >
            <span className="font-arcade text-lg font-extrabold italic tracking-wide sm:text-xl">
              GAS
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-100">
              Accelerate / Tilt
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
