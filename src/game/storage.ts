import { ensureCurrentDailyMissions, generateDailyMissions } from './missions';
import type {
  GameSettings,
  GraphicsQuality,
  PlayerProfile,
  UpgradeKey,
  UpgradeLevels,
  VehicleStats,
} from './types';

const STORAGE_KEY = 'hill_rush_3d_profile_v1';

export const MAX_UNLOCKABLE_LEVEL = 4;

export interface UpgradeDefinition {
  key: UpgradeKey;
  label: string;
  tagline: string;
  statName: string;
  costs: number[]; // length 4 -> levels 1..4
  lockedTierName: string;
  lockedRequirement: string;
}

export const UPGRADE_DEFINITIONS: UpgradeDefinition[] = [
  {
    key: 'engine',
    label: 'V8 Supercharger',
    tagline: 'Higher hill-climbing torque & top speed',
    statName: 'Top Speed',
    costs: [120, 260, 480, 820],
    lockedTierName: 'Apex Twin-Turbo V12',
    lockedRequirement: 'Pro Championship Locked',
  },
  {
    key: 'suspension',
    label: 'Coil-Over Shocks',
    tagline: 'Smoother landings, grip & air stability',
    statName: 'Suspension',
    costs: [100, 240, 440, 760],
    lockedTierName: 'Hydraulic Baja Pro',
    lockedRequirement: 'Pro Championship Locked',
  },
  {
    key: 'nitro',
    label: 'Cryo Nitro System',
    tagline: 'Stronger boost thrust & faster recharge',
    statName: 'Nitro Power',
    costs: [140, 300, 520, 880],
    lockedTierName: 'Plasma Overdrive',
    lockedRequirement: 'Pro Championship Locked',
  },
  {
    key: 'fuel',
    label: 'Endurance Tank',
    tagline: 'Slower fuel burn for longer mountain runs',
    statName: 'Fuel Tank',
    costs: [90, 210, 400, 700],
    lockedTierName: 'Fusion Reserve Cell',
    lockedRequirement: 'Pro Championship Locked',
  },
];

export const DEFAULT_SETTINGS: GameSettings = {
  quality: 'high',
  masterVolume: 0.72,
  sfxMuted: false,
  musicEnabled: true,
};

export function createDefaultProfile(): PlayerProfile {
  return {
    bestDistance: 0,
    coins: 150, // Starter coins so players can test or save toward their first upgrade
    upgrades: {
      engine: 0,
      suspension: 0,
      nitro: 0,
      fuel: 0,
    },
    settings: { ...DEFAULT_SETTINGS },
    dailyMissions: generateDailyMissions(),
  };
}

export const DEFAULT_PROFILE: PlayerProfile = createDefaultProfile();

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function parseQuality(value: unknown): GraphicsQuality {
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  return 'high';
}

export function loadProfile(): PlayerProfile {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultProfile();
    const parsed = JSON.parse(raw) as Partial<PlayerProfile>;
    const upgradesRaw = parsed.upgrades ?? ({} as Partial<UpgradeLevels>);
    const settingsRaw = parsed.settings ?? ({} as Partial<GameSettings>);

    return {
      bestDistance: clampInt(parsed.bestDistance, 0, 999999, 0),
      coins: clampInt(parsed.coins, 0, 9999999, DEFAULT_PROFILE.coins),
      upgrades: {
        engine: clampInt(upgradesRaw.engine, 0, MAX_UNLOCKABLE_LEVEL, 0),
        suspension: clampInt(upgradesRaw.suspension, 0, MAX_UNLOCKABLE_LEVEL, 0),
        nitro: clampInt(upgradesRaw.nitro, 0, MAX_UNLOCKABLE_LEVEL, 0),
        fuel: clampInt(upgradesRaw.fuel, 0, MAX_UNLOCKABLE_LEVEL, 0),
      },
      settings: {
        quality: parseQuality(settingsRaw.quality),
        masterVolume:
          typeof settingsRaw.masterVolume === 'number' && Number.isFinite(settingsRaw.masterVolume)
            ? Math.max(0, Math.min(1, settingsRaw.masterVolume))
            : DEFAULT_SETTINGS.masterVolume,
        sfxMuted: Boolean(settingsRaw.sfxMuted),
        musicEnabled:
          typeof settingsRaw.musicEnabled === 'boolean'
            ? settingsRaw.musicEnabled
            : DEFAULT_SETTINGS.musicEnabled,
      },
      dailyMissions: ensureCurrentDailyMissions(parsed.dailyMissions),
    };
  } catch {
    return createDefaultProfile();
  }
}

export function saveProfile(profile: PlayerProfile): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore storage quota or private-mode errors gracefully
  }
}

export function getUpgradeCost(key: UpgradeKey, currentLevel: number): number | null {
  const def = UPGRADE_DEFINITIONS.find((d) => d.key === key);
  if (!def || currentLevel >= MAX_UNLOCKABLE_LEVEL) return null;
  return def.costs[currentLevel] ?? null;
}

export function getVehicleStats(upgrades: UpgradeLevels): VehicleStats {
  const eng = upgrades.engine;
  const susp = upgrades.suspension;
  const nit = upgrades.nitro;
  const fuel = upgrades.fuel;

  return {
    maxSpeed: 23.5 + eng * 2.4,
    engineTorque: 27.5 + eng * 3.8,
    springStiffness: 112 + susp * 14,
    springDamping: 18.8 + susp * 2.2,
    airControlTorque: 6.4 + susp * 0.65,
    nitroThrust: 22.5 + nit * 3.8,
    nitroDrainRate: 30 - nit * 2.6,
    nitroRegenRate: 7.5 + nit * 1.6,
    fuelDrainBase: 1.55 - fuel * 0.16,
    fuelDrainThrottle: 2.25 - fuel * 0.24,
  };
}

export function getStatBarPercentages(upgrades: UpgradeLevels): {
  speed: number;
  suspension: number;
  nitro: number;
  fuel: number;
} {
  return {
    speed: 48 + upgrades.engine * 11,
    suspension: 46 + upgrades.suspension * 11.5,
    nitro: 45 + upgrades.nitro * 12,
    fuel: 48 + upgrades.fuel * 11,
  };
}
