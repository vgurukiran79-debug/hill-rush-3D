import type {
  DailyMission,
  DailyMissionState,
  MissionMetric,
  RunStatsSnapshot,
} from './types';

export const DAILY_ALL_CLEAR_BONUS = 150;

interface MissionTemplate {
  metric: MissionMetric;
  title: string;
  description: (target: number) => string;
  targets: number[];
  rewards: number[];
  mode: 'single_run' | 'daily_total';
  unit: string;
}

const DISTANCE_TEMPLATES: MissionTemplate[] = [
  {
    metric: 'distance_run',
    title: 'Alpine Climber',
    description: (t) => `Reach ${t}m in a single run`,
    targets: [150, 220, 300],
    rewards: [120, 175, 240],
    mode: 'single_run',
    unit: 'm',
  },
  {
    metric: 'distance_run',
    title: 'Ridge Runner',
    description: (t) => `Drive ${t}m without crashing`,
    targets: [180, 250, 340],
    rewards: [145, 200, 260],
    mode: 'single_run',
    unit: 'm',
  },
];

const STUNT_TEMPLATES: MissionTemplate[] = [
  {
    metric: 'consecutive_backflips',
    title: 'Backflip Chain',
    description: (t) => `Land ${t} consecutive backflips in a run`,
    targets: [2, 2, 3],
    rewards: [180, 180, 260],
    mode: 'single_run',
    unit: 'flips',
  },
  {
    metric: 'consecutive_backflips',
    title: 'Stunt Acrobat',
    description: (t) => `Pull off ${t} backflips in a row during a run`,
    targets: [2, 3, 2],
    rewards: [190, 270, 190],
    mode: 'single_run',
    unit: 'flips',
  },
];

const ACTION_TEMPLATES: MissionTemplate[] = [
  {
    metric: 'coins_daily',
    title: 'Gold Rush',
    description: (t) => `Collect ${t} coins across today's runs`,
    targets: [140, 200, 260],
    rewards: [130, 170, 210],
    mode: 'daily_total',
    unit: 'coins',
  },
  {
    metric: 'nitro_daily',
    title: 'Nitro Junkie',
    description: (t) => `Boost with Nitro for ${t}s total today`,
    targets: [6, 9, 12],
    rewards: [135, 175, 215],
    mode: 'daily_total',
    unit: 's',
  },
  {
    metric: 'big_jumps_daily',
    title: 'Hang Time Hero',
    description: (t) => `Land ${t} Big Air jumps today`,
    targets: [3, 4, 5],
    rewards: [145, 185, 225],
    mode: 'daily_total',
    unit: 'jumps',
  },
  {
    metric: 'fuel_run',
    title: 'Endurance Driver',
    description: (t) => `Collect ${t} Fuel Cans in a single run`,
    targets: [2, 2, 3],
    rewards: [140, 140, 210],
    mode: 'single_run',
    unit: 'cans',
  },
];

export function getTodayDateKey(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTimeUntilResetLabel(now: Date = new Date()): string {
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0
  );
  const diffMs = Math.max(0, tomorrow.getTime() - now.getTime());
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

function hashDateKey(dateKey: string): number {
  let h = 2166136261;
  for (let i = 0; i < dateKey.length; i++) {
    h ^= dateKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function instantiateMission(
  template: MissionTemplate,
  dateKey: string,
  slotIndex: number,
  rand: () => number
): DailyMission {
  const tierIndex = Math.floor(rand() * template.targets.length);
  const target = template.targets[tierIndex];
  const rewardCoins = template.rewards[tierIndex];

  return {
    id: `${dateKey}_slot${slotIndex}_${template.metric}`,
    metric: template.metric,
    title: template.title,
    description: template.description(target),
    target,
    progress: 0,
    rewardCoins,
    completed: false,
    mode: template.mode,
    unit: template.unit,
  };
}

export function generateDailyMissions(dateKey: string = getTodayDateKey()): DailyMissionState {
  const rand = mulberry32(hashDateKey(dateKey));

  const distTpl = DISTANCE_TEMPLATES[Math.floor(rand() * DISTANCE_TEMPLATES.length)];
  const stuntTpl = STUNT_TEMPLATES[Math.floor(rand() * STUNT_TEMPLATES.length)];
  const actionTpl = ACTION_TEMPLATES[Math.floor(rand() * ACTION_TEMPLATES.length)];

  return {
    dateKey,
    missions: [
      instantiateMission(distTpl, dateKey, 0, rand),
      instantiateMission(stuntTpl, dateKey, 1, rand),
      instantiateMission(actionTpl, dateKey, 2, rand),
    ],
    allClearBonus: DAILY_ALL_CLEAR_BONUS,
    allClearClaimed: false,
  };
}

export function ensureCurrentDailyMissions(
  existing: Partial<DailyMissionState> | undefined,
  now: Date = new Date()
): DailyMissionState {
  const todayKey = getTodayDateKey(now);
  if (
    !existing ||
    existing.dateKey !== todayKey ||
    !Array.isArray(existing.missions) ||
    existing.missions.length !== 3
  ) {
    return generateDailyMissions(todayKey);
  }

  const sanitized: DailyMission[] = existing.missions.map((m) => {
    const target =
      typeof m.target === 'number' && Number.isFinite(m.target) && m.target > 0 ? m.target : 100;
    const progress =
      typeof m.progress === 'number' && Number.isFinite(m.progress)
        ? Math.max(0, Math.min(target, m.progress))
        : 0;
    const completed = Boolean(m.completed) || progress >= target;
    return {
      id: typeof m.id === 'string' ? m.id : `${todayKey}_${m.metric}`,
      metric: m.metric,
      title: typeof m.title === 'string' ? m.title : 'Daily Mission',
      description: typeof m.description === 'string' ? m.description : '',
      target,
      progress: completed ? target : progress,
      rewardCoins:
        typeof m.rewardCoins === 'number' && Number.isFinite(m.rewardCoins)
          ? Math.max(10, Math.round(m.rewardCoins))
          : 120,
      completed,
      mode: m.mode === 'daily_total' ? 'daily_total' : 'single_run',
      unit: typeof m.unit === 'string' ? m.unit : '',
    };
  });

  return {
    dateKey: todayKey,
    missions: sanitized,
    allClearBonus:
      typeof existing.allClearBonus === 'number' && Number.isFinite(existing.allClearBonus)
        ? existing.allClearBonus
        : DAILY_ALL_CLEAR_BONUS,
    allClearClaimed: Boolean(existing.allClearClaimed),
  };
}

export interface RunMissionDeltas {
  coinsDelta: number;
  nitroSecondsDelta: number;
  bigJumpsDelta: number;
}

export function evaluateMissionProgress(
  state: DailyMissionState,
  runStats: RunStatsSnapshot,
  deltas: RunMissionDeltas
): {
  nextState: DailyMissionState;
  newlyCompleted: DailyMission[];
  changed: boolean;
} {
  const newlyCompleted: DailyMission[] = [];
  let changed = false;

  const nextMissions = state.missions.map((mission) => {
    if (mission.completed) return mission;

    let nextProgress = mission.progress;

    switch (mission.metric) {
      case 'distance_run':
        nextProgress = Math.max(mission.progress, runStats.distance);
        break;
      case 'consecutive_backflips':
        nextProgress = Math.max(mission.progress, runStats.bestConsecutiveBackflips);
        break;
      case 'fuel_run':
        nextProgress = Math.max(mission.progress, runStats.runFuelPickups);
        break;
      case 'coins_daily':
        nextProgress = mission.progress + Math.max(0, deltas.coinsDelta);
        break;
      case 'nitro_daily':
        nextProgress = mission.progress + Math.max(0, deltas.nitroSecondsDelta);
        break;
      case 'big_jumps_daily':
        nextProgress = mission.progress + Math.max(0, deltas.bigJumpsDelta);
        break;
    }

    nextProgress = Math.min(mission.target, nextProgress);

    const completedNow = nextProgress >= mission.target - 0.0001;

    if (Math.abs(nextProgress - mission.progress) > 0.0001 || completedNow) {
      changed = true;
      const updated: DailyMission = {
        ...mission,
        progress: completedNow ? mission.target : nextProgress,
        completed: completedNow,
      };
      if (completedNow) {
        newlyCompleted.push(updated);
      }
      return updated;
    }

    return mission;
  });

  if (!changed) {
    return { nextState: state, newlyCompleted, changed: false };
  }

  return {
    nextState: {
      ...state,
      missions: nextMissions,
    },
    newlyCompleted,
    changed: true,
  };
}

export function areAllDailyMissionsComplete(state: DailyMissionState): boolean {
  return state.missions.length > 0 && state.missions.every((m) => m.completed);
}

export function formatMissionProgress(mission: DailyMission): string {
  const cur =
    mission.metric === 'nitro_daily'
      ? Number(mission.progress.toFixed(1))
      : Math.floor(mission.progress);
  const tgt = mission.target;
  if (mission.unit === 'm' || mission.unit === 's') {
    return `${cur}${mission.unit} / ${tgt}${mission.unit}`;
  }
  return `${cur} / ${tgt} ${mission.unit}`;
}
