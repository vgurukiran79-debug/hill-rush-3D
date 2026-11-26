import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { soundEngine } from '../game/audio';
import { createInitialVehicleState, VehiclePhysicsEngine } from '../game/physics';
import { getVehicleStats } from '../game/storage';
import { ProceduralTerrain } from '../game/terrain';
import { createProceduralTextures } from '../game/textures';
import type {
  CrashReason,
  FloatingTextItem,
  GameScreen,
  GraphicsQuality,
  HudSnapshot,
  InputState,
  PhysicsEvent,
  RunStatsSnapshot,
  UpgradeLevels,
  VehiclePhysicsState,
} from '../game/types';
import { CollectiblesAndVfx, type VfxEmitterHandle } from './CollectiblesAndVfx';
import { EndlessTerrain } from './EndlessTerrain';
import { MonsterTruckModel } from './MonsterTruckModel';

export interface GameCanvasProps {
  screen: GameScreen;
  quality: GraphicsQuality;
  upgrades: UpgradeLevels;
  bestDistance: number;
  runKey: number;
  inputRef: React.MutableRefObject<InputState>;
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onRunStatsUpdate: (stats: RunStatsSnapshot) => void;
  onRunFinished: (
    distance: number,
    coinsCollected: number,
    reason: CrashReason,
    stats: RunStatsSnapshot
  ) => void;
}

const isSoftwareGl = (() => {
  if (typeof document === 'undefined') return false;
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
})();

interface SceneCoreProps extends GameCanvasProps {
  garageSpinRef: React.MutableRefObject<number>;
  garageDraggingRef: React.MutableRefObject<boolean>;
}

const SceneCore: React.FC<SceneCoreProps> = ({
  screen,
  quality,
  upgrades,
  bestDistance,
  runKey,
  inputRef,
  onHudUpdate,
  onRunStatsUpdate,
  onRunFinished,
  garageSpinRef,
  garageDraggingRef,
}) => {
  const { gl, scene, camera } = useThree();

  const terrainRef = useRef<ProceduralTerrain>(new ProceduralTerrain(1337));
  const physicsEngineRef = useRef<VehiclePhysicsEngine>(new VehiclePhysicsEngine());
  const physicsStateRef = useRef<VehiclePhysicsState>(
    createInitialVehicleState(terrainRef.current)
  );
  const vfxRef = useRef<VfxEmitterHandle | null>(null);

  const sunLightRef = useRef<THREE.DirectionalLight>(null);
  const sunTargetRef = useRef<THREE.Object3D>(new THREE.Object3D());

  const runFinishedSentRef = useRef(false);
  const hudTimerRef = useRef(0);
  const nitroTrailTimerRef = useRef(0);
  const speedStreakTimerRef = useRef(0);
  const airTrailTimerRef = useRef(0);

  // Coin streak combo tracker for exciting floating score popups
  const coinComboRef = useRef({ count: 0, lastAt: 0 });
  const floatingTextsRef = useRef<(FloatingTextItem & { expiresAt: number })[]>([]);
  const nextPopupIdRef = useRef(1);
  const eventsScratchRef = useRef<PhysicsEvent[]>([]);
  const projVecRef = useRef(new THREE.Vector3());

  // Studio PBR Environment Map (RoomEnvironment via PMREMGenerator) + Alpine Horizon Fog
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    scene.fog = new THREE.FogExp2('#C4EAFF', 0.0048);
    scene.add(sunTargetRef.current);

    return () => {
      scene.environment = null;
      scene.remove(sunTargetRef.current);
      envRT.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  // Adjust renderer pixel ratio & shadows dynamically for Android/Desktop Graphics Quality
  useEffect(() => {
    const maxDpr = isSoftwareGl
      ? 1
      : quality === 'low'
      ? 1.0
      : quality === 'medium'
      ? 1.5
      : Math.min(window.devicePixelRatio || 1, 2);
    gl.setPixelRatio(maxDpr);
    gl.shadowMap.enabled = !isSoftwareGl && quality !== 'low';
  }, [gl, quality]);

  const textures = useMemo(
    () => createProceduralTextures(gl.capabilities.getMaxAnisotropy()),
    [gl]
  );

  useEffect(() => {
    return () => {
      textures.dispose();
    };
  }, [textures]);

  // Reset physics & terrain whenever a new run begins
  useEffect(() => {
    terrainRef.current.reset(1337 + runKey * 97);
    physicsEngineRef.current.reset();
    physicsStateRef.current = createInitialVehicleState(terrainRef.current);
    runFinishedSentRef.current = false;
    coinComboRef.current = { count: 0, lastAt: 0 };
    floatingTextsRef.current = [];
    vfxRef.current?.clearAll();

    onHudUpdate({
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
    });
  }, [runKey, onHudUpdate]);

  useEffect(() => {
    soundEngine.setEngineActive(screen === 'playing');
  }, [screen]);

  const vehicleStats = useMemo(() => getVehicleStats(upgrades), [upgrades]);

  // Pre-allocated camera scratch vectors & smooth roll state (zero GC)
  const camTargetPos = useMemo(() => new THREE.Vector3(), []);
  const camLookAt = useMemo(() => new THREE.Vector3(), []);
  const currentLookAt = useRef(new THREE.Vector3(2, 2, 0));
  const currentRollRef = useRef(0);

  const pushFloatingText = (
    worldX: number,
    worldY: number,
    text: string,
    color: string,
    subText?: string,
    scale = 1
  ) => {
    const v = projVecRef.current;
    v.set(worldX, worldY + 0.9, 0).project(camera);
    const xPct = Math.max(14, Math.min(86, (v.x * 0.5 + 0.5) * 100));
    const yPct = Math.max(16, Math.min(76, (-v.y * 0.5 + 0.5) * 100));
    floatingTextsRef.current.push({
      id: nextPopupIdRef.current++,
      text,
      subText,
      color,
      xPercent: xPct,
      yPercent: yPct,
      scale,
      expiresAt: performance.now() + 920,
    });
    if (floatingTextsRef.current.length > 9) {
      floatingTextsRef.current.shift();
    }
  };

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const phys = physicsStateRef.current;
    const perspCam = camera as THREE.PerspectiveCamera;

    // 1. Step gameplay physics & trigger gameplay-connected VFX + audio
    if (screen === 'playing') {
      const events = eventsScratchRef.current;
      physicsEngineRef.current.step(
        phys,
        dt,
        inputRef.current,
        vehicleStats,
        terrainRef.current,
        events
      );

      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        switch (ev.type) {
          case 'wheelDust':
            vfxRef.current?.spawnWheelDust(
              ev.x,
              ev.y,
              ev.speed,
              ev.slip,
              ev.surface,
              ev.isRear
            );
            break;
          case 'jump':
            vfxRef.current?.spawnJumpBurst(ev.x, ev.y);
            soundEngine.playJump();
            break;
          case 'land':
            vfxRef.current?.spawnLandingImpact(ev.x, ev.y, ev.intensity, ev.slope);
            soundEngine.playLand(ev.intensity);
            if (ev.airTime > 0.85 && !phys.crashed) {
              pushFloatingText(
                ev.x,
                ev.y + 2.6,
                'BIG AIR!',
                '#38BDF8',
                `${ev.airTime.toFixed(1)}s`,
                1.15
              );
            }
            break;
          case 'flip': {
            vfxRef.current?.spawnCoinBurst(ev.x, ev.y);
            soundEngine.playStunt();
            const label =
              ev.direction === 'backflip'
                ? ev.count >= 2
                  ? `${ev.count}x BACKFLIP!`
                  : 'BACKFLIP!'
                : ev.count >= 2
                ? `${ev.count}x FRONTFLIP!`
                : 'FRONTFLIP!';
            const sub =
              ev.direction === 'backflip' && ev.consecutiveBackflips >= 2
                ? `${ev.consecutiveBackflips}x STREAK · +${ev.bonusCoins}`
                : `+${ev.bonusCoins} STUNT`;
            pushFloatingText(ev.x, ev.y + 0.6, label, '#FDE047', sub, 1.24);
            break;
          }
          case 'coin': {
            vfxRef.current?.spawnCoinBurst(ev.x, ev.y);
            soundEngine.playCoin();
            const nowMs = performance.now();
            if (nowMs - coinComboRef.current.lastAt < 1350) {
              coinComboRef.current.count += 1;
            } else {
              coinComboRef.current.count = 1;
            }
            coinComboRef.current.lastAt = nowMs;
            const combo = coinComboRef.current.count;
            pushFloatingText(
              ev.x,
              ev.y,
              `+${ev.value}`,
              '#FFE047',
              combo >= 3 ? `${combo}x STREAK` : undefined,
              combo >= 3 ? 1.18 : 1.0
            );
            break;
          }
          case 'fuel':
            vfxRef.current?.spawnFuelBurst(ev.x, ev.y);
            soundEngine.playFuel();
            pushFloatingText(ev.x, ev.y, '+FUEL!', '#4ADE80', 'TANK REFILLED', 1.15);
            break;
          case 'crash':
            if (ev.reason !== 'fuel') {
              vfxRef.current?.spawnCrashExplosion(ev.x, ev.y);
              soundEngine.playCrash();
            }
            break;
        }
      }

      // Emit glowing blue nitro plasma ribbons & exhaust sparks while boosting
      if (phys.nitroActive && !phys.crashed) {
        nitroTrailTimerRef.current += dt;
        if (nitroTrailTimerRef.current >= 0.022) {
          nitroTrailTimerRef.current = 0;
          vfxRef.current?.spawnNitroTrail(phys.x, phys.y, phys.vx, phys.vy, phys.angle);
        }
      }

      // Emit 3D speed streaks during Nitro OR thrilling high-speed descents (> 66 km/h)
      const speedKmh = Math.abs(phys.vx) * 3.6;
      if (!phys.crashed && (phys.nitroActive || speedKmh > 66)) {
        speedStreakTimerRef.current += dt;
        const interval = phys.nitroActive ? 0.036 : 0.085;
        if (speedStreakTimerRef.current >= interval) {
          speedStreakTimerRef.current = 0;
          vfxRef.current?.spawnSpeedStreak(
            perspCam.position.x,
            perspCam.position.y,
            Math.abs(phys.vx),
            phys.nitroActive
          );
        }
      }

      // Subtle airborne wind streaks during big jumps
      if (!phys.crashed && phys.airborneTime > 0.28 && Math.hypot(phys.vx, phys.vy) > 9) {
        airTrailTimerRef.current += dt;
        if (airTrailTimerRef.current >= 0.065) {
          airTrailTimerRef.current = 0;
          vfxRef.current?.spawnAirTrail(phys.x, phys.y, phys.vx, phys.vy);
        }
      }

      // Continuous procedural V8 engine, tire dirt roll, and nitro jet audio
      soundEngine.updateDriving(
        phys.vx,
        inputRef.current.accelerate || inputRef.current.brake,
        phys.nitroActive,
        phys.rearGrounded || phys.frontGrounded,
        phys.rearGrounded ? phys.rearSurface : phys.frontSurface,
        phys.crashed
      );

      // Show Game Over modal after brief dramatic slow-motion crash window
      if (phys.crashed && !runFinishedSentRef.current) {
        const delay = phys.crashReason === 'fuel' ? 0.45 : 1.25;
        if (phys.crashTimer >= delay) {
          runFinishedSentRef.current = true;
          const finalStats: RunStatsSnapshot = {
            distance: phys.distance,
            runCoins: phys.runCoins,
            runBackflips: phys.runBackflips,
            consecutiveBackflips: phys.consecutiveBackflips,
            bestConsecutiveBackflips: phys.bestConsecutiveBackflips,
            runFrontflips: phys.runFrontflips,
            runBigJumps: phys.runBigJumps,
            runNitroSeconds: phys.runNitroSeconds,
            runFuelPickups: phys.runFuelPickups,
          };
          onRunStatsUpdate(finalStats);
          onRunFinished(phys.distance, phys.runCoins, phys.crashReason, finalStats);
        }
      }

      // Throttled HUD & Daily Mission progress snapshot (~20 Hz)
      hudTimerRef.current += dt;
      if (hudTimerRef.current >= 0.05) {
        hudTimerRef.current = 0;
        const nowMs = performance.now();
        if (floatingTextsRef.current.length > 0) {
          floatingTextsRef.current = floatingTextsRef.current.filter(
            (ft) => ft.expiresAt > nowMs
          );
        }
        const activeCombo =
          nowMs - coinComboRef.current.lastAt < 1350 ? coinComboRef.current.count : 0;

        onRunStatsUpdate({
          distance: phys.distance,
          runCoins: phys.runCoins,
          runBackflips: phys.runBackflips,
          consecutiveBackflips: phys.consecutiveBackflips,
          bestConsecutiveBackflips: phys.bestConsecutiveBackflips,
          runFrontflips: phys.runFrontflips,
          runBigJumps: phys.runBigJumps,
          runNitroSeconds: phys.runNitroSeconds,
          runFuelPickups: phys.runFuelPickups,
        });

        onHudUpdate({
          distance: phys.distance,
          runCoins: phys.runCoins,
          fuel: phys.fuel,
          nitro: phys.nitro,
          speedKmh: Math.round(speedKmh),
          nitroActive: phys.nitroActive,
          airborne: phys.airborneTime > 0.25,
          lowFuel: phys.fuel < 26 && !phys.crashed,
          crashReason: phys.crashReason,
          isNewRecord: phys.distance > bestDistance && phys.distance > 0,
          crashFlash: phys.impactFlash,
          highSpeed: speedKmh > 68 && !phys.crashed,
          coinCombo: activeCombo,
          consecutiveBackflips: phys.consecutiveBackflips,
          runBackflips: phys.runBackflips,
          floatingTexts: floatingTextsRef.current.map(({ expiresAt: _e, ...rest }) => rest),
        });
      }
    } else if (screen === 'garage' && !garageDraggingRef.current) {
      garageSpinRef.current += dt * 0.46;
    }

    // 2. Smooth Cinematic Camera Director with Organic Multi-Frequency Shake
    const t = state.clock.elapsedTime;
    let targetRoll = 0;

    if (screen === 'menu' || screen === 'missions' || screen === 'settings') {
      // Hero alpine 3/4 showcase angle with gentle cinematic dolly drift
      camTargetPos.set(
        2.95 + Math.sin(t * 0.34) * 1.05,
        3.15 + Math.sin(t * 0.52) * 0.2,
        10.25 + Math.cos(t * 0.28) * 0.35
      );
      camLookAt.set(0.6, 2.35, 0);
      perspCam.fov = THREE.MathUtils.damp(perspCam.fov, 46, 4, dt);
    } else if (screen === 'garage') {
      camTargetPos.set(0.6, 2.55, 7.6);
      camLookAt.set(0.15, 1.15, 0);
      perspCam.fov = THREE.MathUtils.damp(perspCam.fov, 44, 5, dt);
    } else {
      // Cinematic Side-View 3D Chase Camera
      const groundNow = terrainRef.current.sample(phys.x);
      const groundAhead = terrainRef.current.sample(phys.x + Math.max(6, phys.vx * 0.55));
      const airHeight = Math.max(0, phys.y - groundNow.height - 1.5);

      const speedLead = THREE.MathUtils.clamp(phys.vx * 0.26, -1.8, 6.4);
      const verticalPreview = THREE.MathUtils.clamp(
        (groundAhead.height - groundNow.height) * 0.22 + phys.vy * 0.1,
        -2.2,
        3.2
      );
      const jumpZoom = Math.min(7.2, airHeight * 0.78);
      const nitroPull = phys.nitroActive ? 1.5 + phys.nitroSurge * 0.9 : 0;
      const crashZoom = phys.crashed && phys.crashReason !== 'fuel' ? -2.8 : 0;

      // Multi-frequency organic trauma shake (X, Y, and subtle camera roll jolt)
      const trauma = phys.cameraShake * phys.cameraShake * 0.56 + phys.cameraShake * 0.16;
      const shakeX =
        trauma > 0.004
          ? (Math.sin(t * 68) * 0.6 + Math.cos(t * 119) * 0.4) * trauma
          : 0;
      const shakeY =
        trauma > 0.004
          ? (Math.cos(t * 82) * 0.6 - Math.sin(t * 137) * 0.4) * trauma
          : 0;
      const shakeRoll =
        trauma > 0.004 ? Math.sin(t * 95) * trauma * 0.045 : 0;

      // Subtle cinematic banking into steep climbs & fast drops
      const slopeBank = THREE.MathUtils.clamp(
        -phys.vx * groundNow.slope * 0.0016,
        -0.025,
        0.025
      );
      targetRoll = slopeBank + shakeRoll;

      camTargetPos.set(
        phys.x + 2.9 + speedLead + shakeX,
        phys.y + 3.25 + airHeight * 0.26 + verticalPreview * 0.35 + shakeY,
        Math.max(12.2, 17.6 + jumpZoom + nitroPull + crashZoom)
      );
      camLookAt.set(
        phys.x + 3.3 + speedLead * 0.72,
        phys.y + 0.85 + verticalPreview * 0.25,
        0
      );

      const targetFov = phys.crashed
        ? 43
        : phys.nitroActive
        ? 55 + phys.nitroSurge * 3.5
        : 47 + Math.min(4.5, airHeight * 0.36 + Math.abs(phys.vx) * 0.06);
      perspCam.fov = THREE.MathUtils.damp(perspCam.fov, targetFov, 6.5, dt);
    }

    const posAlpha = 1 - Math.exp(-(screen === 'playing' ? 6.2 : 5.2) * dt);
    const lookAlpha = 1 - Math.exp(-8.2 * dt);
    perspCam.position.lerp(camTargetPos, posAlpha);
    currentLookAt.current.lerp(camLookAt, lookAlpha);
    perspCam.lookAt(currentLookAt.current);

    currentRollRef.current = THREE.MathUtils.damp(currentRollRef.current, targetRoll, 9, dt);
    if (Math.abs(currentRollRef.current) > 0.0002) {
      perspCam.rotateZ(currentRollRef.current);
    }
    perspCam.updateProjectionMatrix();

    // 3. Keep Warm Directional Sun & tight shadow frustum tracking the monster truck
    if (sunLightRef.current) {
      sunLightRef.current.position.set(phys.x + 17, phys.y + 27, 19);
      sunTargetRef.current.position.set(phys.x + 2, phys.y, 0);
      sunTargetRef.current.updateMatrixWorld();
    }
  });

  const shadowMapSize = quality === 'high' ? 2048 : 1024;

  return (
    <>
      {/* Studio-Calibrated Crisp Alpine Daylight 3-Point Rig */}
      <hemisphereLight args={['#8CCBFF', '#2A5528', 0.68]} />
      <directionalLight
        ref={sunLightRef}
        target={sunTargetRef.current}
        position={[17, 27, 19]}
        intensity={2.15}
        color="#FFF0CC"
        castShadow={!isSoftwareGl && quality !== 'low'}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={2}
        shadow-camera-far={76}
        shadow-camera-left={-22}
        shadow-camera-right={28}
        shadow-camera-top={22}
        shadow-camera-bottom={-16}
        shadow-bias={-0.0004}
        shadow-normalBias={0.028}
      />
      {/* Cool Sky Rim Backlight separating crimson bodywork & chrome rollcage */}
      <directionalLight position={[-14, 12, -16]} intensity={0.48} color="#B8E0FF" />

      <EndlessTerrain
        terrainRef={terrainRef}
        physicsRef={physicsStateRef}
        textures={textures}
        quality={quality}
        runKey={runKey}
      />

      <MonsterTruckModel
        physicsRef={physicsStateRef}
        terrainRef={terrainRef}
        textures={textures}
        upgrades={upgrades}
        quality={quality}
        screen={screen}
        garageSpinRef={garageSpinRef}
      />

      <CollectiblesAndVfx
        terrainRef={terrainRef}
        physicsRef={physicsStateRef}
        textures={textures}
        quality={quality}
        vfxRef={vfxRef}
      />
    </>
  );
};

export const GameCanvas: React.FC<GameCanvasProps> = (props) => {
  const garageSpinRef = useRef(0.55);
  const garageDraggingRef = useRef(false);
  const lastDragXRef = useRef(0);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (props.screen !== 'garage') return;
    garageDraggingRef.current = true;
    lastDragXRef.current = e.clientX;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!garageDraggingRef.current || props.screen !== 'garage') return;
    const dx = e.clientX - lastDragXRef.current;
    lastDragXRef.current = e.clientX;
    garageSpinRef.current += dx * 0.012;
  };

  const handlePointerEnd = () => {
    garageDraggingRef.current = false;
  };

  return (
    <div
      className="fixed inset-0 h-full w-full overflow-hidden"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={handlePointerEnd}
    >
      <Canvas
        shadows={!isSoftwareGl && props.quality !== 'low'}
        dpr={isSoftwareGl ? 1 : [1, 2]}
        camera={{ fov: 47, near: 0.25, far: 420, position: [3, 3.2, 11] }}
        gl={{
          antialias: !isSoftwareGl,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.96,
        }}
      >
        <SceneCore
          {...props}
          garageSpinRef={garageSpinRef}
          garageDraggingRef={garageDraggingRef}
        />
      </Canvas>
    </div>
  );
};
