export type GameScreen =
  | 'menu'
  | 'playing'
  | 'paused'
  | 'gameover'
  | 'garage'
  | 'missions'
  | 'settings';

export type GraphicsQuality = 'low' | 'medium' | 'high';

export type UpgradeKey = 'engine' | 'suspension' | 'nitro' | 'fuel';

export type SurfaceType = 'grass' | 'dirt' | 'rock' | 'ramp' | 'gap';

export type CrashReason = 'flipped' | 'canyon' | 'fuel' | null;

export type MissionMetric =
  | 'distance_run'
  | 'consecutive_backflips'
  | 'coins_daily'
  | 'nitro_daily'
  | 'big_jumps_daily'
  | 'fuel_run';

export type MissionMode = 'single_run' | 'daily_total';

export interface DailyMission {
  id: string;
  metric: MissionMetric;
  title: string;
  description: string;
  target: number;
  progress: number;
  rewardCoins: number;
  completed: boolean;
  mode: MissionMode;
  unit: string;
}

export interface DailyMissionState {
  dateKey: string; // Local calendar date YYYY-MM-DD
  missions: DailyMission[];
  allClearBonus: number;
  allClearClaimed: boolean;
}

export interface MissionToastItem {
  id: number;
  title: string;
  rewardCoins: number;
  isAllClearReady?: boolean;
}

export interface RunStatsSnapshot {
  distance: number;
  runCoins: number;
  runBackflips: number;
  consecutiveBackflips: number;
  bestConsecutiveBackflips: number;
  runFrontflips: number;
  runBigJumps: number;
  runNitroSeconds: number;
  runFuelPickups: number;
}

export interface UpgradeLevels {
  engine: number; // 0..4 unlocked (tier 5 is locked Apex preview)
  suspension: number;
  nitro: number;
  fuel: number;
}

export interface GameSettings {
  quality: GraphicsQuality;
  masterVolume: number; // 0..1
  sfxMuted: boolean;
  musicEnabled: boolean;
}

export interface PlayerProfile {
  bestDistance: number;
  coins: number;
  upgrades: UpgradeLevels;
  settings: GameSettings;
  dailyMissions: DailyMissionState;
}

export interface VehicleStats {
  maxSpeed: number; // m/s
  engineTorque: number;
  springStiffness: number;
  springDamping: number;
  airControlTorque: number;
  nitroThrust: number;
  nitroDrainRate: number;
  nitroRegenRate: number;
  fuelDrainBase: number;
  fuelDrainThrottle: number;
}

export interface InputState {
  accelerate: boolean;
  brake: boolean;
  nitro: boolean;
}

export interface FloatingTextItem {
  id: number;
  text: string;
  subText?: string;
  color: string;
  xPercent: number;
  yPercent: number;
  scale?: number;
}

export interface HudSnapshot {
  distance: number;
  runCoins: number;
  fuel: number; // 0..100
  nitro: number; // 0..100
  speedKmh: number;
  nitroActive: boolean;
  airborne: boolean;
  lowFuel: boolean;
  crashReason: CrashReason;
  isNewRecord: boolean;
  crashFlash: number; // 0..1 brief hit flash on heavy crash
  highSpeed: boolean;
  coinCombo: number;
  consecutiveBackflips: number;
  runBackflips: number;
  floatingTexts: FloatingTextItem[];
}

export interface TerrainSample {
  height: number;
  slope: number;
  normalX: number;
  normalY: number;
  surface: SurfaceType;
  isGap: boolean;
  gapFloorY: number;
}

export interface CollectibleItem {
  id: number;
  type: 'coin' | 'fuel';
  x: number;
  y: number;
  collected: boolean;
  value: number;
}

export interface VehiclePhysicsState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angularVel: number;
  wheelAngle: number;
  rearCompression: number; // 0 (extended) .. 1 (fully compressed)
  frontCompression: number;
  rearGrounded: boolean;
  frontGrounded: boolean;
  rearWheelY: number;
  frontWheelY: number;
  rearWheelX: number;
  frontWheelX: number;
  rearSurface: SurfaceType;
  frontSurface: SurfaceType;
  airborneTime: number;
  wasAirborne: boolean;
  airRotationAccum: number;
  pendingBackflips: number;
  pendingFrontflips: number;
  runBackflips: number;
  consecutiveBackflips: number;
  bestConsecutiveBackflips: number;
  runFrontflips: number;
  runBigJumps: number;
  runNitroSeconds: number;
  runFuelPickups: number;
  fuel: number;
  nitro: number;
  nitroActive: boolean;
  isBraking: boolean;
  wheelSlip: number;
  nitroSurge: number;
  impactFlash: number;
  distance: number;
  maxX: number;
  runCoins: number;
  crashed: boolean;
  crashReason: CrashReason;
  crashTimer: number;
  roofContactTimer: number;
  outOfFuelTimer: number;
  timeScale: number;
  cameraShake: number;
  squash: number;
}

export type PhysicsEvent =
  | { type: 'jump'; x: number; y: number; speed: number }
  | { type: 'land'; x: number; y: number; intensity: number; slope: number; airTime: number }
  | {
      type: 'flip';
      x: number;
      y: number;
      direction: 'backflip' | 'frontflip';
      count: number;
      consecutiveBackflips: number;
      bonusCoins: number;
    }
  | { type: 'coin'; x: number; y: number; value: number }
  | { type: 'fuel'; x: number; y: number }
  | { type: 'crash'; x: number; y: number; reason: CrashReason }
  | {
      type: 'wheelDust';
      x: number;
      y: number;
      speed: number;
      slip: number;
      surface: SurfaceType;
      isRear: boolean;
    };
