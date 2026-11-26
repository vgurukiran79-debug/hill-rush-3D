import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import {
  DailyMissionsModal,
  GameOverModal,
  GarageScreen,
  MainMenu,
  PauseModal,
  SettingsModal,
} from './components/Screens';
import { soundEngine } from './game/audio';
import {
  areAllDailyMissionsComplete,
  ensureCurrentDailyMissions,
  evaluateMissionProgress,
} from './game/missions';
import {
  createDefaultProfile,
  getUpgradeCost,
  loadProfile,
  saveProfile,
} from './game/storage';
import type {
  CrashReason,
  DailyMission,
  GameScreen,
  GameSettings,
  HudSnapshot,
  InputState,
  MissionToastItem,
  PlayerProfile,
  RunStatsSnapshot,
  UpgradeKey,
} from './game/types';
import { GameCanvas } from './scene/GameCanvas';

const INITIAL_HUD: HudSnapshot = {
  distance: 0,
  runCoins: 0,
  fuel: 100,
  nitro: 100,
  speedKmh: 0,
  nitroActive: false,
  airborne: false,
  lowFuel: false,
  crashReason: null,
  isNewRecord: false,
  crashFlash: 0,
  highSpeed: false,
  coinCombo: 0,
  consecutiveBackflips: 0,
  runBackflips: 0,
  floatingTexts: [],
};

export default function App() {
  const [profile, setProfile] = useState<PlayerProfile>(() => loadProfile());
  const [screen, setScreen] = useState<GameScreen>('menu');
  const [runKey, setRunKey] = useState(1);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [missionToast, setMissionToast] = useState<MissionToastItem | null>(null);
  const [lastRunSummary, setLastRunSummary] = useState<{
    distance: number;
    coins: number;
    missionBonusCoins: number;
    completedMissions: DailyMission[];
    bestConsecutiveBackflips: number;
    isNewRecord: boolean;
    reason: CrashReason;
  }>({
    distance: 0,
    coins: 0,
    missionBonusCoins: 0,
    completedMissions: [],
    bestConsecutiveBackflips: 0,
    isNewRecord: false,
    reason: null,
  });

  // Ref-based continuous input state (never triggers React re-renders during gameplay!)
  const inputRef = useRef<InputState>({
    accelerate: false,
    brake: false,
    nitro: false,
  });

  // Track per-run cumulative deltas & missions completed during the active run
  const prevRunCountersRef = useRef({
    coins: 0,
    nitroSeconds: 0,
    bigJumps: 0,
  });
  const completedMissionsThisRunRef = useRef<DailyMission[]>([]);
  const toastTimerRef = useRef<number | null>(null);
  const nextToastIdRef = useRef(1);

  const clearInputs = useCallback(() => {
    inputRef.current.accelerate = false;
    inputRef.current.brake = false;
    inputRef.current.nitro = false;
  }, []);

  const showMissionToast = useCallback((mission: DailyMission, isAllClearReady: boolean) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setMissionToast({
      id: nextToastIdRef.current++,
      title: mission.title,
      rewardCoins: mission.rewardCoins,
      isAllClearReady,
    });
    toastTimerRef.current = window.setTimeout(() => {
      setMissionToast(null);
      toastTimerRef.current = null;
    }, 3600);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Keep Web Audio settings & localStorage synced whenever profile updates
  useEffect(() => {
    saveProfile(profile);
    soundEngine.applySettings(profile.settings);
  }, [profile]);

  const unlockAudio = useCallback(() => {
    soundEngine.unlock();
    soundEngine.applySettings(profile.settings);
  }, [profile.settings]);

  const syncDailyRollover = useCallback(() => {
    setProfile((prev) => {
      const fresh = ensureCurrentDailyMissions(prev.dailyMissions);
      if (fresh.dateKey === prev.dailyMissions.dateKey) return prev;
      return { ...prev, dailyMissions: fresh };
    });
  }, []);

  const startNewRun = useCallback(() => {
    unlockAudio();
    soundEngine.playClick();
    clearInputs();
    syncDailyRollover();
    prevRunCountersRef.current = { coins: 0, nitroSeconds: 0, bigJumps: 0 };
    completedMissionsThisRunRef.current = [];
    setMissionToast(null);
    setRunKey((k) => k + 1);
    setScreen('playing');
  }, [clearInputs, syncDailyRollover, unlockAudio]);

  const goToMenu = useCallback(() => {
    unlockAudio();
    soundEngine.playClick();
    clearInputs();
    syncDailyRollover();
    setRunKey((k) => k + 1);
    setScreen('menu');
  }, [clearInputs, syncDailyRollover, unlockAudio]);

  const openGarage = useCallback(() => {
    unlockAudio();
    soundEngine.playClick();
    clearInputs();
    setRunKey((k) => k + 1);
    setScreen('garage');
  }, [clearInputs, unlockAudio]);

  const openMissions = useCallback(() => {
    unlockAudio();
    soundEngine.playClick();
    clearInputs();
    syncDailyRollover();
    setScreen('missions');
  }, [clearInputs, syncDailyRollover, unlockAudio]);

  const openSettings = useCallback(() => {
    unlockAudio();
    soundEngine.playClick();
    setScreen('settings');
  }, [unlockAudio]);

  const pauseGame = useCallback(() => {
    soundEngine.playClick();
    clearInputs();
    setScreen('paused');
  }, [clearInputs]);

  const resumeGame = useCallback(() => {
    unlockAudio();
    soundEngine.playClick();
    setScreen('playing');
  }, [unlockAudio]);

  // Live mid-run Daily Mission progress evaluator (only updates React state when progress changes!)
  const handleRunStatsUpdate = useCallback(
    (stats: RunStatsSnapshot) => {
      const prev = prevRunCountersRef.current;
      const coinsDelta = Math.max(0, stats.runCoins - prev.coins);
      const nitroSecondsDelta = Math.max(0, stats.runNitroSeconds - prev.nitroSeconds);
      const bigJumpsDelta = Math.max(0, stats.runBigJumps - prev.bigJumps);

      prev.coins = stats.runCoins;
      prev.nitroSeconds = stats.runNitroSeconds;
      prev.bigJumps = stats.runBigJumps;

      setProfile((curr) => {
        const currentDaily = ensureCurrentDailyMissions(curr.dailyMissions);
        const { nextState, newlyCompleted, changed } = evaluateMissionProgress(
          currentDaily,
          stats,
          { coinsDelta, nitroSecondsDelta, bigJumpsDelta }
        );

        if (!changed && currentDaily.dateKey === curr.dailyMissions.dateKey) {
          return curr;
        }

        let rewardTotal = 0;
        if (newlyCompleted.length > 0) {
          for (const m of newlyCompleted) {
            rewardTotal += m.rewardCoins;
            if (!completedMissionsThisRunRef.current.some((c) => c.id === m.id)) {
              completedMissionsThisRunRef.current.push(m);
            }
          }
          soundEngine.playMissionComplete();
          const allReady = areAllDailyMissionsComplete(nextState) && !nextState.allClearClaimed;
          showMissionToast(newlyCompleted[newlyCompleted.length - 1], allReady);
        }

        return {
          ...curr,
          coins: curr.coins + rewardTotal,
          dailyMissions: nextState,
        };
      });
    },
    [showMissionToast]
  );

  const handleRunFinished = useCallback(
    (
      distance: number,
      coinsCollected: number,
      reason: CrashReason,
      finalStats: RunStatsSnapshot
    ) => {
      clearInputs();
      const completedMissions = [...completedMissionsThisRunRef.current];
      const missionBonusCoins = completedMissions.reduce((sum, m) => sum + m.rewardCoins, 0);

      setProfile((prev) => {
        const isNewRecord = distance > prev.bestDistance && distance > 0;
        const nextBest = Math.max(prev.bestDistance, distance);
        setLastRunSummary({
          distance,
          coins: coinsCollected,
          missionBonusCoins,
          completedMissions,
          bestConsecutiveBackflips: finalStats.bestConsecutiveBackflips,
          isNewRecord,
          reason,
        });
        return {
          ...prev,
          bestDistance: nextBest,
          coins: prev.coins + coinsCollected,
        };
      });
      setScreen('gameover');
    },
    [clearInputs]
  );

  const handleClaimAllClear = useCallback(() => {
    unlockAudio();
    setProfile((prev) => {
      const dm = ensureCurrentDailyMissions(prev.dailyMissions);
      if (!areAllDailyMissionsComplete(dm) || dm.allClearClaimed) return prev;
      soundEngine.playMissionComplete();
      return {
        ...prev,
        coins: prev.coins + dm.allClearBonus,
        dailyMissions: {
          ...dm,
          allClearClaimed: true,
        },
      };
    });
  }, [unlockAudio]);

  const handleBuyUpgrade = useCallback(
    (key: UpgradeKey) => {
      unlockAudio();
      setProfile((prev) => {
        const curLevel = prev.upgrades[key];
        const cost = getUpgradeCost(key, curLevel);
        if (cost === null || prev.coins < cost) return prev;
        soundEngine.playUpgrade();
        return {
          ...prev,
          coins: prev.coins - cost,
          upgrades: {
            ...prev.upgrades,
            [key]: curLevel + 1,
          },
        };
      });
    },
    [unlockAudio]
  );

  const handleUpdateSettings = useCallback(
    (partial: Partial<GameSettings>) => {
      unlockAudio();
      setProfile((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          ...partial,
        },
      }));
    },
    [unlockAudio]
  );

  const handleResetSave = useCallback(() => {
    unlockAudio();
    soundEngine.playClick();
    setProfile(createDefaultProfile());
  }, [unlockAudio]);

  // Unified Keyboard Controls + Window Blur Cleanup + Gesture Lock
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === 'ArrowRight' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'Space'
      ) {
        e.preventDefault();
      }

      unlockAudio();

      // Quick keyboard navigation for menus & pause
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (screen === 'playing') {
          pauseGame();
          return;
        }
        if (screen === 'paused') {
          resumeGame();
          return;
        }
        if (screen === 'settings' || screen === 'garage' || screen === 'missions') {
          goToMenu();
          return;
        }
      }

      if (e.code === 'Enter' || e.code === 'Space') {
        if (screen === 'menu') {
          startNewRun();
          return;
        }
        if (screen === 'gameover' && e.code === 'Enter') {
          startNewRun();
          return;
        }
      }

      if (screen !== 'playing') return;

      if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        inputRef.current.accelerate = true;
      }
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        inputRef.current.brake = true;
      }
      if (
        e.code === 'Space' ||
        e.code === 'ShiftLeft' ||
        e.code === 'ShiftRight' ||
        e.code === 'ArrowUp' ||
        e.code === 'KeyW'
      ) {
        inputRef.current.nitro = true;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        inputRef.current.accelerate = false;
      }
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        inputRef.current.brake = false;
      }
      if (
        e.code === 'Space' ||
        e.code === 'ShiftLeft' ||
        e.code === 'ShiftRight' ||
        e.code === 'ArrowUp' ||
        e.code === 'KeyW'
      ) {
        inputRef.current.nitro = false;
      }
    };

    const onBlur = () => {
      clearInputs();
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onBlur);
    };
  }, [clearInputs, goToMenu, pauseGame, resumeGame, screen, startNewRun, unlockAudio]);

  // Prevent accidental touch scroll / pinch zoom during active play on mobile
  useEffect(() => {
    const preventTouch = (e: TouchEvent) => {
      if (screen === 'playing') {
        e.preventDefault();
      }
    };
    document.addEventListener('touchmove', preventTouch, { passive: false });
    return () => document.removeEventListener('touchmove', preventTouch);
  }, [screen]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#1B6CD8]">
      {/* Isolated Persistent 3D WebGL Canvas (never remounts across HUD updates) */}
      <GameCanvas
        screen={screen}
        quality={profile.settings.quality}
        upgrades={profile.upgrades}
        bestDistance={profile.bestDistance}
        runKey={runKey}
        inputRef={inputRef}
        onHudUpdate={setHud}
        onRunStatsUpdate={handleRunStatsUpdate}
        onRunFinished={handleRunFinished}
      />

      {/* Screen & HUD Overlays */}
      {screen === 'menu' && (
        <MainMenu
          profile={profile}
          onPlay={startNewRun}
          onOpenGarage={openGarage}
          onOpenMissions={openMissions}
          onOpenSettings={openSettings}
        />
      )}

      {screen === 'playing' && (
        <GameHud
          hud={hud}
          missionToast={missionToast}
          inputRef={inputRef}
          onPause={pauseGame}
          onUnlockAudio={unlockAudio}
        />
      )}

      {screen === 'paused' && (
        <PauseModal
          settings={profile.settings}
          dailyMissions={profile.dailyMissions}
          onResume={resumeGame}
          onRestart={startNewRun}
          onMainMenu={goToMenu}
          onUpdateSettings={handleUpdateSettings}
        />
      )}

      {screen === 'gameover' && (
        <GameOverModal
          distance={lastRunSummary.distance}
          runCoins={lastRunSummary.coins}
          missionBonusCoins={lastRunSummary.missionBonusCoins}
          completedMissions={lastRunSummary.completedMissions}
          bestConsecutiveBackflips={lastRunSummary.bestConsecutiveBackflips}
          bestDistance={profile.bestDistance}
          isNewRecord={lastRunSummary.isNewRecord}
          reason={lastRunSummary.reason}
          dailyMissions={profile.dailyMissions}
          onRestart={startNewRun}
          onGarage={openGarage}
          onMissions={openMissions}
          onClaimAllClear={handleClaimAllClear}
          onMainMenu={goToMenu}
        />
      )}

      {screen === 'garage' && (
        <GarageScreen
          profile={profile}
          onBuyUpgrade={handleBuyUpgrade}
          onPlay={startNewRun}
          onBack={goToMenu}
        />
      )}

      {screen === 'missions' && (
        <DailyMissionsModal
          profile={profile}
          onClaimAllClear={handleClaimAllClear}
          onPlay={startNewRun}
          onClose={goToMenu}
        />
      )}

      {screen === 'settings' && (
        <SettingsModal
          settings={profile.settings}
          onUpdateSettings={handleUpdateSettings}
          onResetSave={handleResetSave}
          onClose={goToMenu}
        />
      )}
    </main>
  );
}
