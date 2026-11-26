import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ProceduralTerrain } from '../game/terrain';
import type { ProceduralTextureSet } from '../game/textures';
import type { GraphicsQuality, SurfaceType, VehiclePhysicsState } from '../game/types';

export interface VfxEmitterHandle {
  spawnWheelDust: (
    x: number,
    y: number,
    speed: number,
    slip: number,
    surface: SurfaceType,
    isRear: boolean
  ) => void;
  spawnNitroTrail: (x: number, y: number, vx: number, vy: number, angle: number) => void;
  spawnSpeedStreak: (camX: number, camY: number, speed: number, isNitro: boolean) => void;
  spawnAirTrail: (x: number, y: number, vx: number, vy: number) => void;
  spawnJumpBurst: (x: number, y: number) => void;
  spawnLandingImpact: (x: number, y: number, intensity: number, slope: number) => void;
  spawnCoinBurst: (x: number, y: number) => void;
  spawnFuelBurst: (x: number, y: number) => void;
  spawnCrashExplosion: (x: number, y: number) => void;
  clearAll: () => void;
}

interface CollectiblesAndVfxProps {
  terrainRef: React.MutableRefObject<ProceduralTerrain>;
  physicsRef: React.MutableRefObject<VehiclePhysicsState>;
  textures: ProceduralTextureSet;
  quality: GraphicsQuality;
  vfxRef: React.MutableRefObject<VfxEmitterHandle | null>;
}

interface SolidParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rot: number;
  vrot: number;
  age: number;
  life: number;
  sizeStart: number;
  sizeEnd: number;
  stretchX: number;
  gravity: number;
  drag: number;
  bounce: boolean;
  r: number;
  g: number;
  b: number;
}

interface DustPuffSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rot: number;
  vrot: number;
  age: number;
  life: number;
  sizeStart: number;
  sizeEnd: number;
  drag: number;
  lift: number;
  r: number;
  g: number;
  b: number;
}

interface StreakSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  len: number;
  thick: number;
  angle: number;
  r: number;
  g: number;
  b: number;
}

interface ShockwaveSlot {
  active: boolean;
  x: number;
  y: number;
  slope: number;
  age: number;
  delay: number;
  life: number;
  maxScale: number;
  isGold: boolean;
}

interface FlareSlot {
  active: boolean;
  x: number;
  y: number;
  age: number;
  life: number;
  maxScale: number;
  color: THREE.Color;
}

const MAX_COINS = 80;
const MAX_FUELS = 12;
const MAX_SHOCKWAVES = 10;
const MAX_FLARES = 10;

export const CollectiblesAndVfx: React.FC<CollectiblesAndVfxProps> = ({
  terrainRef,
  physicsRef,
  textures,
  quality,
  vfxRef,
}) => {
  const maxSolid = quality === 'low' ? 120 : quality === 'medium' ? 210 : 320;
  const maxPuffs = quality === 'low' ? 65 : quality === 'medium' ? 120 : 185;
  const maxStreaks = quality === 'low' ? 32 : quality === 'medium' ? 56 : 84;
  const ambientCount = quality === 'low' ? 24 : quality === 'medium' ? 44 : 68;

  const coinInstRef = useRef<THREE.InstancedMesh>(null);
  const coinGlintInstRef = useRef<THREE.InstancedMesh>(null);
  const fuelBodyInstRef = useRef<THREE.InstancedMesh>(null);
  const fuelCapInstRef = useRef<THREE.InstancedMesh>(null);

  const solidInstRef = useRef<THREE.InstancedMesh>(null);
  const puffInstRef = useRef<THREE.InstancedMesh>(null);
  const streakInstRef = useRef<THREE.InstancedMesh>(null);
  const ambientInstRef = useRef<THREE.InstancedMesh>(null);

  const shockwaveRefs = useRef<(THREE.Mesh | null)[]>([]);
  const flareRefs = useRef<(THREE.Mesh | null)[]>([]);

  // Fixed-capacity pools (zero GC in render loop)
  const solidPoolRef = useRef<SolidParticleSlot[]>([]);
  const solidCursorRef = useRef(0);

  const puffPoolRef = useRef<DustPuffSlot[]>([]);
  const puffCursorRef = useRef(0);

  const streakPoolRef = useRef<StreakSlot[]>([]);
  const streakCursorRef = useRef(0);

  const shockwavesRef = useRef<ShockwaveSlot[]>(
    Array.from({ length: MAX_SHOCKWAVES }, () => ({
      active: false,
      x: 0,
      y: 0,
      slope: 0,
      age: 0,
      delay: 0,
      life: 0.45,
      maxScale: 4,
      isGold: false,
    }))
  );

  const flaresRef = useRef<FlareSlot[]>(
    Array.from({ length: MAX_FLARES }, () => ({
      active: false,
      x: 0,
      y: 0,
      age: 0,
      life: 0.3,
      maxScale: 2.5,
      color: new THREE.Color('#FFD93D'),
    }))
  );

  // Sync pools when quality changes
  useMemo(() => {
    solidPoolRef.current = Array.from({ length: maxSolid }, () => ({
      active: false,
      x: 0,
      y: -999,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      rot: 0,
      vrot: 0,
      age: 0,
      life: 1,
      sizeStart: 0.2,
      sizeEnd: 0,
      stretchX: 1,
      gravity: 0,
      drag: 0.96,
      bounce: false,
      r: 1,
      g: 1,
      b: 1,
    }));
    solidCursorRef.current = 0;
  }, [maxSolid]);

  useMemo(() => {
    puffPoolRef.current = Array.from({ length: maxPuffs }, () => ({
      active: false,
      x: 0,
      y: -999,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      rot: 0,
      vrot: 0,
      age: 0,
      life: 1,
      sizeStart: 0.5,
      sizeEnd: 1.8,
      drag: 0.94,
      lift: 1.2,
      r: 0.85,
      g: 0.75,
      b: 0.6,
    }));
    puffCursorRef.current = 0;
  }, [maxPuffs]);

  useMemo(() => {
    streakPoolRef.current = Array.from({ length: maxStreaks }, () => ({
      active: false,
      x: 0,
      y: -999,
      z: 0,
      vx: 0,
      vy: 0,
      age: 0,
      life: 0.22,
      len: 2.0,
      thick: 0.14,
      angle: 0,
      r: 0.2,
      g: 0.9,
      b: 1.0,
    }));
    streakCursorRef.current = 0;
  }, [maxStreaks]);

  const ambientSeeds = useMemo(
    () =>
      Array.from({ length: ambientCount }, (_, i) => ({
        ox: (Math.sin(i * 19.7) * 0.5 + 0.5) * 46 - 16,
        oy: (Math.cos(i * 31.3) * 0.5 + 0.5) * 16 - 2,
        oz: (Math.sin(i * 47.1) * 0.5 + 0.5) * 12 - 6,
        phase: i * 1.37,
        speed: 0.45 + (i % 5) * 0.14,
      })),
    [ambientCount]
  );

  // Geometries & materials
  const assets = useMemo(() => {
    const coinGeo = new THREE.CylinderGeometry(0.58, 0.58, 0.17, 20);
    coinGeo.rotateX(Math.PI / 2);

    const coinMat = new THREE.MeshStandardMaterial({
      color: '#FFC800',
      emissive: '#FF9A00',
      emissiveIntensity: 0.42,
      metalness: 0.92,
      roughness: 0.14,
    });

    const glintGeo = new THREE.PlaneGeometry(0.85, 0.85);
    const glintMat = new THREE.MeshBasicMaterial({
      map: textures.sparkleFlareMap,
      color: '#FFF4B8',
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const fuelBodyGeo = new THREE.BoxGeometry(0.76, 0.94, 0.46);
    const fuelBodyMat = new THREE.MeshStandardMaterial({
      color: '#E52521',
      emissive: '#A81010',
      emissiveIntensity: 0.3,
      roughness: 0.3,
      metalness: 0.24,
    });

    const fuelCapGeo = new THREE.BoxGeometry(0.42, 0.22, 0.28);
    fuelCapGeo.translate(0.14, 0.55, 0);
    const fuelCapMat = new THREE.MeshStandardMaterial({
      color: '#FFDC38',
      emissive: '#FFAA00',
      emissiveIntensity: 0.35,
      roughness: 0.22,
      metalness: 0.55,
    });

    const solidGeo = new THREE.DodecahedronGeometry(0.45, 0);
    const solidMat = new THREE.MeshStandardMaterial({
      color: '#FFFFFF',
      roughness: 0.72,
      metalness: 0.15,
      flatShading: true,
    });

    // Soft painterly volumetric dust puff sprite quad
    const puffGeo = new THREE.PlaneGeometry(1, 1);
    const puffMat = new THREE.MeshBasicMaterial({
      map: textures.dustPuffMap,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Glowing additive 3D speed streak / nitro trail ribbon
    const streakGeo = new THREE.PlaneGeometry(1, 1);
    const streakMat = new THREE.MeshBasicMaterial({
      map: textures.sparkleFlareMap,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const ambientGeo = new THREE.OctahedronGeometry(0.085, 0);
    const ambientMat = new THREE.MeshBasicMaterial({
      color: '#FFF9D6',
      transparent: true,
      opacity: 0.58,
    });

    const shockGeo = new THREE.PlaneGeometry(1, 1);
    const shockMats = Array.from(
      { length: MAX_SHOCKWAVES },
      () =>
        new THREE.MeshBasicMaterial({
          map: textures.shockwaveRingMap,
          color: '#FFF3DC',
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        })
    );

    const flareGeo = new THREE.PlaneGeometry(1, 1);
    const flareMats = Array.from(
      { length: MAX_FLARES },
      () =>
        new THREE.MeshBasicMaterial({
          map: textures.sparkleFlareMap,
          color: '#FFE066',
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        })
    );

    return {
      coinGeo,
      coinMat,
      glintGeo,
      glintMat,
      fuelBodyGeo,
      fuelBodyMat,
      fuelCapGeo,
      fuelCapMat,
      solidGeo,
      solidMat,
      puffGeo,
      puffMat,
      streakGeo,
      streakMat,
      ambientGeo,
      ambientMat,
      shockGeo,
      shockMats,
      flareGeo,
      flareMats,
    };
  }, [textures]);

  useEffect(() => {
    return () => {
      assets.coinGeo.dispose();
      assets.coinMat.dispose();
      assets.glintGeo.dispose();
      assets.glintMat.dispose();
      assets.fuelBodyGeo.dispose();
      assets.fuelBodyMat.dispose();
      assets.fuelCapGeo.dispose();
      assets.fuelCapMat.dispose();
      assets.solidGeo.dispose();
      assets.solidMat.dispose();
      assets.puffGeo.dispose();
      assets.puffMat.dispose();
      assets.streakGeo.dispose();
      assets.streakMat.dispose();
      assets.ambientGeo.dispose();
      assets.ambientMat.dispose();
      assets.shockGeo.dispose();
      assets.shockMats.forEach((m) => m.dispose());
      assets.flareGeo.dispose();
      assets.flareMats.forEach((m) => m.dispose());
    };
  }, [assets]);

  // Fixed-pool allocators
  const emitSolid = (
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    sizeStart: number,
    sizeEnd: number,
    gravity: number,
    drag: number,
    r: number,
    g: number,
    b: number,
    bounce = false,
    stretchX = 1
  ) => {
    const pool = solidPoolRef.current;
    if (pool.length === 0) return;
    const p = pool[solidCursorRef.current];
    solidCursorRef.current = (solidCursorRef.current + 1) % pool.length;
    p.active = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.rot = Math.random() * Math.PI * 2;
    p.vrot = (Math.random() - 0.5) * 11;
    p.age = 0;
    p.life = life;
    p.sizeStart = sizeStart;
    p.sizeEnd = sizeEnd;
    p.stretchX = stretchX;
    p.gravity = gravity;
    p.drag = drag;
    p.bounce = bounce;
    p.r = r;
    p.g = g;
    p.b = b;
  };

  const emitPuff = (
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    sizeStart: number,
    sizeEnd: number,
    drag: number,
    lift: number,
    r: number,
    g: number,
    b: number
  ) => {
    const pool = puffPoolRef.current;
    if (pool.length === 0) return;
    const p = pool[puffCursorRef.current];
    puffCursorRef.current = (puffCursorRef.current + 1) % pool.length;
    p.active = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.rot = Math.random() * Math.PI * 2;
    p.vrot = (Math.random() - 0.5) * 2.4;
    p.age = 0;
    p.life = life;
    p.sizeStart = sizeStart;
    p.sizeEnd = sizeEnd;
    p.drag = drag;
    p.lift = lift;
    p.r = r;
    p.g = g;
    p.b = b;
  };

  const emitStreak = (
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    life: number,
    len: number,
    thick: number,
    angle: number,
    r: number,
    g: number,
    b: number
  ) => {
    const pool = streakPoolRef.current;
    if (pool.length === 0) return;
    const s = pool[streakCursorRef.current];
    streakCursorRef.current = (streakCursorRef.current + 1) % pool.length;
    s.active = true;
    s.x = x;
    s.y = y;
    s.z = z;
    s.vx = vx;
    s.vy = vy;
    s.age = 0;
    s.life = life;
    s.len = len;
    s.thick = thick;
    s.angle = angle;
    s.r = r;
    s.g = g;
    s.b = b;
  };

  const triggerShockwave = (
    x: number,
    y: number,
    slope: number,
    maxScale: number,
    life: number,
    delay = 0,
    isGold = false
  ) => {
    const sw = shockwavesRef.current.find((s) => !s.active) ?? shockwavesRef.current[0];
    sw.active = true;
    sw.x = x;
    sw.y = y;
    sw.slope = slope;
    sw.age = -delay;
    sw.delay = delay;
    sw.life = life;
    sw.maxScale = maxScale;
    sw.isGold = isGold;
  };

  const triggerFlare = (x: number, y: number, maxScale: number, life: number, hex: string) => {
    const fl = flaresRef.current.find((f) => !f.active) ?? flaresRef.current[0];
    fl.active = true;
    fl.x = x;
    fl.y = y;
    fl.age = 0;
    fl.life = life;
    fl.maxScale = maxScale;
    fl.color.set(hex);
  };

  // Expose AAA imperative VFX API to simulation loop
  useEffect(() => {
    const qMult = quality === 'low' ? 0.5 : quality === 'medium' ? 0.78 : 1.0;

    vfxRef.current = {
      spawnWheelDust: (x, y, speed, slip, surface, isRear) => {
        const energy = Math.min(1.6, 0.35 + speed * 0.045 + slip * 0.65);

        // 1. Soft billowing dust cloud puffs scaled by wheel speed & surface material
        const puffCount = Math.max(1, Math.round((isRear ? 3 : 2) * qMult * (slip > 0.5 ? 1.4 : 1)));
        for (let i = 0; i < puffCount; i++) {
          const zSide = (i % 2 === 0 ? 1.12 : -1.12) + (Math.random() - 0.5) * 0.36;
          let r = 0.72,
            g = 0.53,
            b = 0.34; // rich warm dirt dust
          if (surface === 'grass') {
            r = 0.55;
            g = 0.64;
            b = 0.34;
          } else if (surface === 'rock') {
            r = 0.64;
            g = 0.69;
            b = 0.74;
          } else if (surface === 'ramp') {
            r = 0.84;
            g = 0.68;
            b = 0.42;
          }
          emitPuff(
            x + (Math.random() - 0.5) * 0.38,
            y + 0.18 + Math.random() * 0.24,
            zSide,
            -Math.max(2.2, speed * 0.3) - Math.random() * 2.4,
            1.1 + Math.random() * (1.7 * energy),
            (Math.random() - 0.5) * 1.15,
            0.52 + Math.random() * 0.38,
            0.68 + energy * 0.42,
            2.05 + energy * 1.15,
            0.93,
            1.2,
            r,
            g,
            b
          );
        }

        // 2. Solid kicked-up surface chunks (emerald grass blades, dirt clods, rock chips & scrape sparks!)
        const chunkCount = Math.max(1, Math.round((isRear ? 3 : 2) * qMult * (0.7 + slip * 0.7)));
        for (let i = 0; i < chunkCount; i++) {
          const zSide = i % 2 === 0 ? 1.14 : -1.14;
          const isGrassBlade = surface === 'grass' && Math.random() > 0.38;
          const isRockSpark = surface === 'rock' && slip > 0.45 && Math.random() > 0.68;
          const isRampSpark = surface === 'ramp' && speed > 11 && Math.random() > 0.65;

          let r = 0.56,
            g = 0.38,
            b = 0.22;
          let stretch = 1;
          let grav = 13.5;

          if (isGrassBlade) {
            r = 0.26;
            g = 0.78;
            b = 0.28;
            stretch = 2.4;
          } else if (isRockSpark || isRampSpark) {
            r = 1.0;
            g = 0.72;
            b = 0.2;
            stretch = 2.8;
            grav = 9.0;
          } else if (surface === 'rock') {
            r = 0.5;
            g = 0.55;
            b = 0.6;
          } else if (surface === 'ramp') {
            r = 0.82;
            g = 0.56;
            b = 0.24;
            stretch = 1.9;
          }

          emitSolid(
            x + (Math.random() - 0.5) * 0.35,
            y + Math.random() * 0.18,
            zSide + (Math.random() - 0.5) * 0.28,
            -Math.max(2.4, speed * 0.44) - Math.random() * 3.6,
            2.1 + Math.random() * (3.2 * energy),
            (Math.random() - 0.5) * 1.8,
            0.35 + Math.random() * 0.28,
            isRockSpark || isRampSpark ? 0.14 : 0.16 + Math.min(0.18, speed * 0.008),
            0.03,
            grav,
            0.96,
            r,
            g,
            b,
            false,
            stretch
          );
        }
      },

      spawnNitroTrail: (x, y, vx, vy, angle) => {
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        // World position of swept-back dual exhaust tips
        const exX = x - cosA * 1.72 - sinA * 1.14;
        const exY = y - sinA * 1.72 + cosA * 1.14;

        // 1. Glowing cyan plasma trail ribbons streaming from dual stacks
        for (let s = 0; s < 2; s++) {
          const zSide = s === 0 ? 0.72 : -0.72;
          emitStreak(
            exX + (Math.random() - 0.5) * 0.15,
            exY + (Math.random() - 0.5) * 0.15,
            zSide,
            vx * 0.18 - cosA * (14 + Math.random() * 6),
            vy * 0.18 - sinA * 8 + 1.8,
            0.2 + Math.random() * 0.1,
            2.2 + Math.random() * 1.6,
            0.34 + Math.random() * 0.16,
            angle - 0.22,
            0.04,
            0.78,
            1.0
          );
        }

        // 2. Electric cyan & hot-white glowing exhaust embers
        const emberCount = Math.max(2, Math.round(4 * qMult));
        for (let i = 0; i < emberCount; i++) {
          const zSide = i % 2 === 0 ? 0.72 : -0.72;
          const hotWhite = Math.random() > 0.52;
          emitSolid(
            exX + (Math.random() - 0.5) * 0.2,
            exY + (Math.random() - 0.5) * 0.2,
            zSide + (Math.random() - 0.5) * 0.2,
            vx * 0.22 - cosA * (10 + Math.random() * 8),
            vy * 0.22 - sinA * 6 + 2.0 + Math.random() * 2.8,
            (Math.random() - 0.5) * 1.8,
            0.22 + Math.random() * 0.18,
            hotWhite ? 0.22 : 0.3,
            0.02,
            -1.2,
            0.91,
            hotWhite ? 0.92 : 0.04,
            hotWhite ? 0.99 : 0.84,
            1.0,
            false,
            1.8
          );
        }
      },

      spawnSpeedStreak: (camX, camY, speed, isNitro) => {
        const count = isNitro ? Math.max(1, Math.round(2 * qMult)) : 1;
        for (let i = 0; i < count; i++) {
          const sy = camY + (Math.random() - 0.45) * 12;
          const sz = Math.random() > 0.5 ? 2.5 + Math.random() * 4.5 : -2.5 - Math.random() * 4.0;
          emitStreak(
            camX + 18 + Math.random() * 8,
            sy,
            sz,
            -Math.max(26, speed * 1.9),
            (Math.random() - 0.5) * 1.5,
            0.26 + Math.random() * 0.14,
            isNitro ? 4.2 + Math.random() * 2.8 : 2.6 + Math.random() * 1.8,
            isNitro ? 0.14 : 0.08,
            0,
            isNitro ? 0.35 : 0.92,
            isNitro ? 0.95 : 0.98,
            1.0
          );
        }
      },

      spawnAirTrail: (x, y, vx, vy) => {
        const ang = Math.atan2(vy, Math.max(2, vx));
        emitStreak(
          x - 1.5,
          y - 0.5,
          1.15,
          vx * 0.15,
          vy * 0.15,
          0.22,
          2.2,
          0.11,
          ang,
          0.95,
          0.98,
          1.0
        );
      },

      spawnJumpBurst: (x, y) => {
        const puffCount = Math.max(4, Math.round(8 * qMult));
        for (let i = 0; i < puffCount; i++) {
          emitPuff(
            x + (Math.random() - 0.5) * 2.4,
            y + 0.15,
            (Math.random() - 0.5) * 2.2,
            (Math.random() - 0.5) * 5.2,
            1.6 + Math.random() * 3.2,
            (Math.random() - 0.5) * 2.8,
            0.52 + Math.random() * 0.28,
            0.65,
            2.1,
            0.92,
            1.2,
            0.84,
            0.72,
            0.55
          );
        }
        const clodCount = Math.max(4, Math.round(9 * qMult));
        for (let i = 0; i < clodCount; i++) {
          emitSolid(
            x + (Math.random() - 0.5) * 2.0,
            y + 0.1,
            (Math.random() - 0.5) * 2.2,
            (Math.random() - 0.5) * 6.5,
            2.4 + Math.random() * 4.5,
            (Math.random() - 0.5) * 3.5,
            0.48 + Math.random() * 0.25,
            0.24,
            0.03,
            14,
            0.96,
            0.66,
            0.5,
            0.34
          );
        }
      },

      spawnLandingImpact: (x, y, intensity, slope) => {
        // 1. Dual-wave expanding shockwave rings aligned to exact terrain slope!
        triggerShockwave(x, y + 0.1, slope, 4.4 + intensity * 5.8, 0.34 + intensity * 0.18, 0, false);
        if (intensity > 0.35) {
          triggerShockwave(
            x,
            y + 0.14,
            slope,
            6.2 + intensity * 7.5,
            0.48 + intensity * 0.24,
            0.06,
            false
          );
        }

        // 2. Radial billowing ground-hugging dust shockwave ring
        const puffCount = Math.max(7, Math.round((9 + intensity * 14) * qMult));
        for (let i = 0; i < puffCount; i++) {
          const ang = (i / puffCount) * Math.PI * 2 + Math.random() * 0.3;
          const radSpd = (3.8 + Math.random() * 5.8) * (0.6 + intensity * 0.85);
          emitPuff(
            x + Math.cos(ang) * 1.4,
            y + 0.22,
            Math.sin(ang) * 1.1,
            Math.cos(ang) * radSpd,
            1.1 + Math.random() * (2.6 * intensity + 0.8),
            Math.sin(ang) * radSpd * 0.65,
            0.55 + Math.random() * 0.42,
            0.72 + intensity * 0.55,
            2.4 + intensity * 1.85,
            0.91,
            1.15,
            0.8,
            0.67,
            0.48
          );
        }

        // 3. Flying surface dirt & rock chunks kicked outward by suspension bottoming
        const chunkCount = Math.max(6, Math.round((8 + intensity * 12) * qMult));
        for (let i = 0; i < chunkCount; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = (3.5 + Math.random() * 7.2) * (0.55 + intensity * 0.8);
          emitSolid(
            x + (Math.random() - 0.5) * 2.5,
            y + 0.15,
            (Math.random() - 0.5) * 2.1,
            Math.cos(ang) * spd,
            2.4 + Math.random() * (5.2 * intensity + 1.8),
            Math.sin(ang) * spd * 0.65,
            0.5 + Math.random() * 0.36,
            0.22 + intensity * 0.18,
            0.04,
            15.5,
            0.96,
            0.64,
            0.47,
            0.3
          );
        }
      },

      spawnCoinBurst: (x, y) => {
        // 1. Bright 4-point golden starburst flash + golden ring pop
        triggerFlare(x, y, 3.4, 0.28, '#FFF08A');
        triggerShockwave(x, y, 0, 2.8, 0.26, 0, true);

        // 2. Shimmering radial golden particle explosion
        const sparkCount = Math.max(8, Math.round(18 * qMult));
        for (let i = 0; i < sparkCount; i++) {
          const a = (i / sparkCount) * Math.PI * 2 + Math.random() * 0.25;
          const spd = 3.6 + Math.random() * 5.8;
          const bright = i % 3 === 0;
          emitSolid(
            x,
            y,
            (Math.random() - 0.5) * 0.5,
            Math.cos(a) * spd,
            Math.sin(a) * spd + 2.2,
            (Math.random() - 0.5) * 4.2,
            0.42 + Math.random() * 0.28,
            bright ? 0.28 : 0.2,
            0.01,
            9.5,
            0.94,
            1.0,
            bright ? 0.96 : 0.78,
            bright ? 0.55 : 0.08,
            false,
            bright ? 1.8 : 1.1
          );
        }
      },

      spawnFuelBurst: (x, y) => {
        triggerFlare(x, y, 3.8, 0.34, '#6EE7B7');
        const count = Math.max(8, Math.round(18 * qMult));
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          const spd = 3.6 + Math.random() * 5.0;
          const isGreen = i % 2 === 0;
          emitSolid(
            x,
            y,
            (Math.random() - 0.5) * 0.6,
            Math.cos(a) * spd,
            Math.sin(a) * spd + 2.6,
            (Math.random() - 0.5) * 3.4,
            0.48 + Math.random() * 0.26,
            0.26,
            0.02,
            7.0,
            0.93,
            isGreen ? 0.2 : 1.0,
            isGreen ? 0.95 : 0.32,
            isGreen ? 0.48 : 0.2
          );
        }
      },

      spawnCrashExplosion: (x, y) => {
        // 1. Bright fiery crash impact flash + giant ground shockwave
        triggerFlare(x, y + 0.5, 6.2, 0.36, '#FF9E44');
        triggerShockwave(x, y - 0.4, 0, 9.5, 0.62, 0, false);

        // 2. Massive billowing dust & dark crash smoke clouds
        const smokeCount = Math.max(12, Math.round(24 * qMult));
        for (let i = 0; i < smokeCount; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 2.0 + Math.random() * 7.2;
          const isDarkSmoke = i < smokeCount * 0.45;
          emitPuff(
            x + (Math.random() - 0.5) * 2.0,
            y + (Math.random() - 0.5) * 1.1,
            (Math.random() - 0.5) * 1.8,
            Math.cos(ang) * spd,
            Math.abs(Math.sin(ang)) * spd + 1.8,
            (Math.random() - 0.5) * 4.5,
            0.95 + Math.random() * 0.65,
            0.95 + Math.random() * 0.6,
            3.6 + Math.random() * 1.9,
            0.92,
            1.4,
            isDarkSmoke ? 0.32 : 0.78,
            isDarkSmoke ? 0.3 : 0.64,
            isDarkSmoke ? 0.32 : 0.46
          );
        }

        // 3. Tumbling 3D crimson body panels, chrome struts & glowing sparks that BOUNCE off terrain!
        const debrisCount = Math.max(18, Math.round(42 * qMult));
        for (let i = 0; i < debrisCount; i++) {
          const isSpark = i < debrisCount * 0.35;
          const isCrimsonPanel = !isSpark && i % 3 === 0;
          const isChromeStrut = !isSpark && i % 3 === 1;
          const ang = Math.random() * Math.PI * 2;
          const spd = isSpark ? 8 + Math.random() * 13 : 5 + Math.random() * 10;

          emitSolid(
            x + (Math.random() - 0.5) * 1.8,
            y + 0.3 + (Math.random() - 0.5) * 1.0,
            (Math.random() - 0.5) * 1.6,
            Math.cos(ang) * spd,
            Math.abs(Math.sin(ang)) * spd + (isSpark ? 6.5 : 5.8),
            (Math.random() - 0.5) * 6.5,
            isSpark ? 0.55 + Math.random() * 0.35 : 1.5 + Math.random() * 0.8,
            isSpark ? 0.16 : 0.32 + Math.random() * 0.18,
            isSpark ? 0.02 : 0.24,
            isSpark ? 14 : 21,
            0.985,
            isSpark ? 1.0 : isCrimsonPanel ? 0.92 : isChromeStrut ? 0.86 : 0.22,
            isSpark ? 0.68 : isCrimsonPanel ? 0.14 : isChromeStrut ? 0.9 : 0.24,
            isSpark ? 0.14 : isCrimsonPanel ? 0.16 : isChromeStrut ? 0.95 : 0.28,
            !isSpark, // Debris bounces off terrain!
            isSpark ? 2.6 : isChromeStrut ? 2.2 : 1.4
          );
        }
      },

      clearAll: () => {
        solidPoolRef.current.forEach((p) => {
          p.active = false;
        });
        puffPoolRef.current.forEach((p) => {
          p.active = false;
        });
        streakPoolRef.current.forEach((s) => {
          s.active = false;
        });
        shockwavesRef.current.forEach((sw) => {
          sw.active = false;
        });
        flaresRef.current.forEach((fl) => {
          fl.active = false;
        });
      },
    };

    return () => {
      vfxRef.current = null;
    };
  }, [quality, vfxRef]);

  // Pre-allocated scratch helpers (zero GC in useFrame!)
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorScratch = useMemo(() => new THREE.Color(), []);
  const elapsedRef = useRef(0);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    elapsedRef.current += dt;
    const t = elapsedRef.current;
    const phys = physicsRef.current;
    const simDt = dt * phys.timeScale;
    const camQuat = state.camera.quaternion;

    // 1. Update visible gold coins (+ orbiting sunlight glint!) & fuel canisters
    const items = terrainRef.current.getCollectiblesInRange(phys.x - 22, phys.x + 115);
    let coinIdx = 0;
    let fuelIdx = 0;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const bob = Math.sin(t * 3.6 + it.id * 0.7) * 0.2;
      if (it.type === 'coin' && coinIdx < MAX_COINS) {
        dummy.position.set(it.x, it.y + bob, 0);
        dummy.rotation.set(0, t * 3.4 + it.id * 0.45, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        coinInstRef.current?.setMatrixAt(coinIdx, dummy.matrix);

        // Shimmering sunlight glint hovering at upper edge of spinning gold coin
        const pulse = 0.55 + 0.45 * Math.sin(t * 6.5 + it.id * 1.1);
        dummy.position.set(it.x + 0.24, it.y + bob + 0.28, 0.35);
        dummy.quaternion.copy(camQuat);
        dummy.scale.set(pulse, pulse, pulse);
        dummy.updateMatrix();
        coinGlintInstRef.current?.setMatrixAt(coinIdx, dummy.matrix);

        coinIdx++;
      } else if (it.type === 'fuel' && fuelIdx < MAX_FUELS) {
        dummy.position.set(it.x, it.y + bob, 0);
        dummy.rotation.set(0, Math.sin(t * 2.2 + it.id) * 0.45, Math.sin(t * 2.8) * 0.08);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        fuelBodyInstRef.current?.setMatrixAt(fuelIdx, dummy.matrix);
        fuelCapInstRef.current?.setMatrixAt(fuelIdx, dummy.matrix);
        fuelIdx++;
      }
    }

    if (coinInstRef.current) {
      coinInstRef.current.count = coinIdx;
      coinInstRef.current.instanceMatrix.needsUpdate = true;
    }
    if (coinGlintInstRef.current) {
      coinGlintInstRef.current.count = coinIdx;
      coinGlintInstRef.current.instanceMatrix.needsUpdate = true;
    }
    if (fuelBodyInstRef.current && fuelCapInstRef.current) {
      fuelBodyInstRef.current.count = fuelIdx;
      fuelCapInstRef.current.count = fuelIdx;
      fuelBodyInstRef.current.instanceMatrix.needsUpdate = true;
      fuelCapInstRef.current.instanceMatrix.needsUpdate = true;
    }

    // 2. Step Solid Chunks, Clods, Sparks & Ground-Bouncing Crash Debris
    if (solidInstRef.current) {
      const pool = solidPoolRef.current;
      const terrain = terrainRef.current;
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (!p.active) {
          dummy.position.set(0, -999, 0);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          solidInstRef.current.setMatrixAt(i, dummy.matrix);
          continue;
        }

        p.age += simDt;
        if (p.age >= p.life) {
          p.active = false;
          dummy.position.set(0, -999, 0);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          solidInstRef.current.setMatrixAt(i, dummy.matrix);
          continue;
        }

        const dragStep = Math.pow(p.drag, simDt * 60);
        p.vx *= dragStep;
        p.vz *= dragStep;
        p.vy = p.vy * dragStep - p.gravity * simDt;
        p.x += p.vx * simDt;
        p.y += p.vy * simDt;
        p.z += p.vz * simDt;
        p.rot += p.vrot * simDt;

        // Real terrain bounce for crash debris shards during slow-motion!
        if (p.bounce && p.vy < 0) {
          const gH = terrain.sample(p.x).height + 0.14;
          if (p.y < gH) {
            p.y = gH;
            p.vy = -p.vy * 0.42;
            p.vx *= 0.72;
            p.vrot *= 0.65;
          }
        }

        const lifeT = p.age / p.life;
        const size = p.sizeStart + (p.sizeEnd - p.sizeStart) * lifeT;

        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(p.rot, p.rot * 0.7, p.rot * 0.4);
        dummy.scale.set(size * p.stretchX, size, size);
        dummy.updateMatrix();
        solidInstRef.current.setMatrixAt(i, dummy.matrix);

        colorScratch.setRGB(p.r, p.g, p.b);
        solidInstRef.current.setColorAt(i, colorScratch);
      }
      solidInstRef.current.instanceMatrix.needsUpdate = true;
      if (solidInstRef.current.instanceColor) {
        solidInstRef.current.instanceColor.needsUpdate = true;
      }
    }

    // 3. Step Soft Volumetric Billowing Dust Puff Clouds (camera-facing)
    if (puffInstRef.current) {
      const pool = puffPoolRef.current;
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (!p.active) {
          dummy.position.set(0, -999, 0);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          puffInstRef.current.setMatrixAt(i, dummy.matrix);
          continue;
        }

        p.age += simDt;
        if (p.age >= p.life) {
          p.active = false;
          dummy.position.set(0, -999, 0);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          puffInstRef.current.setMatrixAt(i, dummy.matrix);
          continue;
        }

        const dragStep = Math.pow(p.drag, simDt * 60);
        p.vx *= dragStep;
        p.vz *= dragStep;
        p.vy = p.vy * dragStep + p.lift * simDt;
        p.x += p.vx * simDt;
        p.y += p.vy * simDt;
        p.z += p.vz * simDt;
        p.rot += p.vrot * simDt;

        const lifeT = p.age / p.life;
        // Billow out smoothly then taper neatly before disappearing
        const fadeOut = lifeT > 0.68 ? 1 - (lifeT - 0.68) / 0.32 : 1;
        const size = (p.sizeStart + (p.sizeEnd - p.sizeStart) * Math.sqrt(lifeT)) * fadeOut;

        dummy.position.set(p.x, p.y, p.z);
        dummy.quaternion.copy(camQuat);
        dummy.rotateZ(p.rot);
        dummy.scale.set(size, size, size);
        dummy.updateMatrix();
        puffInstRef.current.setMatrixAt(i, dummy.matrix);

        // Soften tint subtly as cloud dissipates
        const bright = 0.85 + lifeT * 0.15;
        colorScratch.setRGB(p.r * bright, p.g * bright, p.b * bright);
        puffInstRef.current.setColorAt(i, colorScratch);
      }
      puffInstRef.current.instanceMatrix.needsUpdate = true;
      if (puffInstRef.current.instanceColor) {
        puffInstRef.current.instanceColor.needsUpdate = true;
      }
    }

    // 4. Step 3D Glowing Nitro Trails & Speed Streaks
    if (streakInstRef.current) {
      const pool = streakPoolRef.current;
      for (let i = 0; i < pool.length; i++) {
        const s = pool[i];
        if (!s.active) {
          dummy.position.set(0, -999, 0);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          streakInstRef.current.setMatrixAt(i, dummy.matrix);
          continue;
        }

        s.age += simDt;
        if (s.age >= s.life) {
          s.active = false;
          dummy.position.set(0, -999, 0);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          streakInstRef.current.setMatrixAt(i, dummy.matrix);
          continue;
        }

        s.x += s.vx * simDt;
        s.y += s.vy * simDt;
        const lifeT = s.age / s.life;
        const alphaScale = 1 - lifeT;

        dummy.position.set(s.x, s.y, s.z);
        dummy.rotation.set(0, 0, s.angle);
        dummy.scale.set(s.len * (0.55 + alphaScale * 0.75), s.thick * alphaScale, 1);
        dummy.updateMatrix();
        streakInstRef.current.setMatrixAt(i, dummy.matrix);

        colorScratch.setRGB(s.r * alphaScale, s.g * alphaScale, s.b * alphaScale);
        streakInstRef.current.setColorAt(i, colorScratch);
      }
      streakInstRef.current.instanceMatrix.needsUpdate = true;
      if (streakInstRef.current.instanceColor) {
        streakInstRef.current.instanceColor.needsUpdate = true;
      }
    }

    // 5. Step Dual-Ring Landing Shockwaves & Golden Coin Rings
    const swList = shockwavesRef.current;
    for (let i = 0; i < MAX_SHOCKWAVES; i++) {
      const sw = swList[i];
      const mesh = shockwaveRefs.current[i];
      const mat = assets.shockMats[i];
      if (!mesh) continue;

      if (!sw.active) {
        mesh.visible = false;
        continue;
      }
      sw.age += simDt;
      if (sw.age < 0) {
        mesh.visible = false;
        continue;
      }
      if (sw.age >= sw.life) {
        sw.active = false;
        mesh.visible = false;
        continue;
      }

      const progress = sw.age / sw.life;
      const eased = 1 - Math.pow(1 - progress, 3);
      const scale = 0.8 + eased * sw.maxScale;
      mesh.visible = true;
      mesh.position.set(sw.x, sw.y, sw.isGold ? 0.35 : 0);
      if (sw.isGold) {
        mesh.quaternion.copy(camQuat);
        mesh.scale.set(scale, scale, 1);
        mat.color.set('#FFD84D');
      } else {
        mesh.rotation.set(-Math.PI / 2, 0, 0);
        mesh.rotateY(-Math.atan(sw.slope));
        mesh.scale.set(scale, scale * 0.74, 1);
        mat.color.set('#FFF3DC');
      }
      mat.opacity = (1 - progress) * (sw.isGold ? 0.95 : 0.88);
    }

    // 6. Step Starburst Coin / Fuel / Crash Flash Flares
    const flList = flaresRef.current;
    for (let i = 0; i < MAX_FLARES; i++) {
      const fl = flList[i];
      const mesh = flareRefs.current[i];
      const mat = assets.flareMats[i];
      if (!mesh) continue;

      if (!fl.active) {
        mesh.visible = false;
        continue;
      }
      fl.age += simDt;
      if (fl.age >= fl.life) {
        fl.active = false;
        mesh.visible = false;
        continue;
      }
      const p = fl.age / fl.life;
      const scale = fl.maxScale * (0.3 + Math.sin(p * Math.PI) * 0.9);
      mesh.visible = true;
      mesh.position.set(fl.x, fl.y, 0.55);
      mesh.quaternion.copy(camQuat);
      mesh.rotateZ(p * 1.4);
      mesh.scale.set(scale, scale, 1);
      mat.color.copy(fl.color);
      mat.opacity = (1 - p) * 0.95;
    }

    // 7. Floating sunlit alpine ambient pollen / dust motes
    if (ambientInstRef.current) {
      for (let i = 0; i < ambientSeeds.length; i++) {
        const s = ambientSeeds[i];
        const px = phys.x + ((s.ox + t * s.speed + 24) % 48) - 20;
        const py = phys.y + s.oy + Math.sin(t * 1.4 + s.phase) * 0.95;
        const pz = s.oz + Math.cos(t * 1.1 + s.phase) * 0.65;
        dummy.position.set(px, py, pz);
        dummy.rotation.set(t + s.phase, t * 0.6, 0);
        const sc = 0.7 + Math.sin(t * 2.5 + s.phase) * 0.35;
        dummy.scale.set(sc, sc, sc);
        dummy.updateMatrix();
        ambientInstRef.current.setMatrixAt(i, dummy.matrix);
      }
      ambientInstRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* Rotating Gold Coins + Orbiting Sunlight Glints */}
      <instancedMesh
        ref={coinInstRef}
        args={[assets.coinGeo, assets.coinMat, MAX_COINS]}
        frustumCulled={false}
        castShadow={quality === 'high'}
      />
      <instancedMesh
        ref={coinGlintInstRef}
        args={[assets.glintGeo, assets.glintMat, MAX_COINS]}
        frustumCulled={false}
      />

      {/* Glowing Red Fuel Jerrycans */}
      <instancedMesh
        ref={fuelBodyInstRef}
        args={[assets.fuelBodyGeo, assets.fuelBodyMat, MAX_FUELS]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={fuelCapInstRef}
        args={[assets.fuelCapGeo, assets.fuelCapMat, MAX_FUELS]}
        frustumCulled={false}
      />

      {/* Pooled Layer 1: Solid Clods, Grass Blades, Sparks & Ground-Bouncing Crash Debris */}
      <instancedMesh
        key={`solid-${maxSolid}`}
        ref={solidInstRef}
        args={[assets.solidGeo, assets.solidMat, maxSolid]}
        frustumCulled={false}
      />

      {/* Pooled Layer 2: Soft Volumetric Billowing Dust & Smoke Clouds */}
      <instancedMesh
        key={`puff-${maxPuffs}`}
        ref={puffInstRef}
        args={[assets.puffGeo, assets.puffMat, maxPuffs]}
        frustumCulled={false}
      />

      {/* Pooled Layer 3: Glowing Additive 3D Nitro Trails & Speed Streaks */}
      <instancedMesh
        key={`streak-${maxStreaks}`}
        ref={streakInstRef}
        args={[assets.streakGeo, assets.streakMat, maxStreaks]}
        frustumCulled={false}
      />

      {/* Floating Sunlit Alpine Dust Motes */}
      <instancedMesh
        key={`amb-${ambientCount}`}
        ref={ambientInstRef}
        args={[assets.ambientGeo, assets.ambientMat, ambientCount]}
        frustumCulled={false}
      />

      {/* Dual-Ring Landing Shockwaves & Golden Coin Rings */}
      {assets.shockMats.map((mat, i) => (
        <mesh
          key={`sw-${i}`}
          ref={(el) => {
            shockwaveRefs.current[i] = el;
          }}
          geometry={assets.shockGeo}
          material={mat}
          visible={false}
        />
      ))}

      {/* Starburst Coin, Fuel & Crash Flash Flares */}
      {assets.flareMats.map((mat, i) => (
        <mesh
          key={`fl-${i}`}
          ref={(el) => {
            flareRefs.current[i] = el;
          }}
          geometry={assets.flareGeo}
          material={mat}
          visible={false}
        />
      ))}
    </group>
  );
};
