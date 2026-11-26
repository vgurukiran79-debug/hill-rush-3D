import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ProceduralTerrain } from '../game/terrain';
import type { ProceduralTextureSet } from '../game/textures';
import type { GraphicsQuality, VehiclePhysicsState } from '../game/types';

interface EndlessTerrainProps {
  terrainRef: React.MutableRefObject<ProceduralTerrain>;
  physicsRef: React.MutableRefObject<VehiclePhysicsState>;
  textures: ProceduralTextureSet;
  quality: GraphicsQuality;
  runKey: number;
}

const CHUNK_LENGTH = 30;
const CHUNK_COUNT = 8;
const X_SEGMENTS = 36;
const Z_PROFILE = [-38, -22, -10.5, -3.9, -2.5, 0, 2.5, 3.8, 5.2, 5.8];
const Z_VERTS = Z_PROFILE.length;

function hash2(a: number, b: number): number {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function buildTerrainChunkGeometry(): THREE.BufferGeometry {
  const vCount = (X_SEGMENTS + 1) * Z_VERTS;
  const positions = new Float32Array(vCount * 3);
  const colors = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);

  const indices: number[] = [];
  for (let ix = 0; ix < X_SEGMENTS; ix++) {
    for (let iz = 0; iz < Z_VERTS - 1; iz++) {
      const a = ix * Z_VERTS + iz;
      const b = (ix + 1) * Z_VERTS + iz;
      const c = (ix + 1) * Z_VERTS + (iz + 1);
      const d = ix * Z_VERTS + (iz + 1);
      indices.push(a, d, b, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

const _tmpColor = new THREE.Color();
const _cGrassBright = new THREE.Color('#4BC85B');
const _cGrassRich = new THREE.Color('#2B9A42');
const _cMeadowFar = new THREE.Color('#3AA65A');
const _cDirtTrack = new THREE.Color('#A96F3D');
const _cDirtDark = new THREE.Color('#7A4C28');
const _cRock = new THREE.Color('#70808D');
const _cRockDark = new THREE.Color('#4A5763');
const _cRamp = new THREE.Color('#E8A73A');
const _cRampStripe = new THREE.Color('#C46E1B');
const _cCliffSoil = new THREE.Color('#694A32');
const _cCliffDeep = new THREE.Color('#433529');

function fillTerrainChunk(
  geo: THREE.BufferGeometry,
  terrain: ProceduralTerrain,
  chunkStartX: number
): void {
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const colAttr = geo.attributes.color as THREE.BufferAttribute;
  const uvAttr = geo.attributes.uv as THREE.BufferAttribute;

  const dx = CHUNK_LENGTH / X_SEGMENTS;

  for (let ix = 0; ix <= X_SEGMENTS; ix++) {
    const wx = chunkStartX + ix * dx;
    const sample = terrain.sample(wx);
    const roadY = sample.height;
    const surf = sample.surface;

    for (let iz = 0; iz < Z_VERTS; iz++) {
      const z = Z_PROFILE[iz];
      const vIdx = ix * Z_VERTS + iz;
      let y = roadY;

      if (z < -3.9) {
        const distBack = -z - 3.9;
        const hillWave =
          Math.sin(wx * 0.055 + z * 0.08) * (distBack * 0.24) +
          Math.cos(wx * 0.12 - z * 0.05) * (distBack * 0.11);
        y = roadY + distBack * 0.22 + hillWave;
        if (sample.isGap) {
          y = roadY + Math.max(0, distBack - 4) * 0.35;
        }
      } else if (z > 3.8 && z < 5.5) {
        y = roadY - (z - 3.8) * 1.15;
      } else if (z >= 5.5) {
        y = roadY - 26;
      }

      posAttr.setXYZ(vIdx, wx, y, z);
      uvAttr.setXY(vIdx, wx * 0.12, z * 0.15);

      const onTrack = z >= -2.55 && z <= 2.55;
      if (z >= 5.0) {
        _tmpColor.copy(z > 5.4 ? _cCliffDeep : _cCliffSoil);
      } else if (surf === 'gap') {
        _tmpColor.copy(onTrack ? _cRockDark : _cRock);
      } else if (surf === 'ramp' && onTrack) {
        const stripe = Math.floor(wx * 1.1) % 2 === 0;
        _tmpColor.copy(stripe ? _cRamp : _cRampStripe);
      } else if (surf === 'rock' && onTrack) {
        _tmpColor.copy(Math.abs(z) < 1.2 ? _cRock : _cRockDark);
      } else if (onTrack) {
        if (surf === 'dirt' || Math.abs(z) < 1.85) {
          const inRut = Math.abs(Math.abs(z) - 1.1) < 0.55;
          _tmpColor.copy(inRut ? _cDirtDark : _cDirtTrack);
        } else {
          _tmpColor.copy(_cGrassBright);
        }
      } else if (z < -12) {
        _tmpColor.copy(_cMeadowFar);
      } else {
        const tint = (Math.sin(wx * 0.18 + z * 0.3) + 1) * 0.5;
        _tmpColor.copy(_cGrassRich).lerp(_cGrassBright, tint);
      }

      colAttr.setXYZ(vIdx, _tmpColor.r, _tmpColor.g, _tmpColor.b);
    }
  }

  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;
  uvAttr.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
}

function applyWindSway(
  mat: THREE.MeshStandardMaterial,
  windUniform: { value: number },
  swayAmp: number
): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windUniform;
    shader.vertexShader = `uniform float uWindTime;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      float windHeight = max(0.0, position.y);
      #ifdef USE_INSTANCING
        float instPhase = instanceMatrix[3][0] * 0.27 + instanceMatrix[3][2] * 0.19;
      #else
        float instPhase = 0.0;
      #endif
      float gust = sin(uWindTime * 1.9 + instPhase) * 0.7 + sin(uWindTime * 3.4 + instPhase * 1.7) * 0.3;
      transformed.x += gust * windHeight * ${swayAmp.toFixed(4)};
      transformed.z += cos(uWindTime * 1.5 + instPhase) * windHeight * ${(swayAmp * 0.45).toFixed(4)};
      `
    );
  };
}

export const EndlessTerrain: React.FC<EndlessTerrainProps> = ({
  terrainRef,
  physicsRef,
  textures,
  quality,
  runKey,
}) => {
  const chunkMeshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const chunkGeos = useMemo(
    () => Array.from({ length: CHUNK_COUNT }, () => buildTerrainChunkGeometry()),
    []
  );
  const chunkSlotIndex = useRef<number[]>(Array(CHUNK_COUNT).fill(-9999));

  const trunkInstRef = useRef<THREE.InstancedMesh>(null);
  const foliageLowInstRef = useRef<THREE.InstancedMesh>(null);
  const foliageHighInstRef = useRef<THREE.InstancedMesh>(null);
  const rockInstRef = useRef<THREE.InstancedMesh>(null);
  const bushInstRef = useRef<THREE.InstancedMesh>(null);
  const postInstRef = useRef<THREE.InstancedMesh>(null);

  const backdropGroupRef = useRef<THREE.Group>(null);
  const cloudGroupRef = useRef<THREE.Group>(null);
  const sunbeamGroupRef = useRef<THREE.Group>(null);

  const windUniform = useMemo(() => ({ value: 0 }), []);

  const propCounts = useMemo(() => {
    const mult = quality === 'low' ? 0.5 : quality === 'medium' ? 0.78 : 1.0;
    return {
      trees: Math.floor(140 * mult),
      rocks: Math.floor(110 * mult),
      bushes: Math.floor(130 * mult),
      posts: Math.floor(56 * mult),
    };
  }, [quality]);

  const terrainMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        map: textures.terrainGrainMap,
        roughness: 0.87,
        metalness: 0.02,
      }),
    [textures]
  );

  // Rich Alpine Sky Dome Shader with warm sunlit atmospheric horizon glow
  const skyMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uZenith: { value: new THREE.Color('#1866D6') },
          uMidSky: { value: new THREE.Color('#5DB2F6') },
          uHorizon: { value: new THREE.Color('#CDEEFF') },
          uWarmGlow: { value: new THREE.Color('#FFF5D6') },
          uSunDir: { value: new THREE.Vector3(0.45, 0.56, -0.68).normalize() },
        },
        vertexShader: `
          varying vec3 vWorldDir;
          void main() {
            vWorldDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uZenith;
          uniform vec3 uMidSky;
          uniform vec3 uHorizon;
          uniform vec3 uWarmGlow;
          uniform vec3 uSunDir;
          varying vec3 vWorldDir;
          void main() {
            float h = clamp(vWorldDir.y, 0.0, 1.0);
            vec3 col = mix(uHorizon, uMidSky, smoothstep(0.0, 0.34, h));
            col = mix(col, uZenith, smoothstep(0.32, 0.88, h));
            float sunDot = max(dot(normalize(vWorldDir), uSunDir), 0.0);
            // Warm atmospheric Mie scattering halo around sun
            col += uWarmGlow * pow(sunDot, 7.0) * 0.24;
            col += vec3(1.0, 0.96, 0.84) * pow(sunDot, 28.0) * 0.48;
            col += vec3(1.0, 0.99, 0.94) * smoothstep(0.995, 0.9992, sunDot) * 0.95;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    []
  );

  // Sunbeam god-ray material & distant valley mist material
  const atmosphereMats = useMemo(() => {
    const beamMat = new THREE.MeshBasicMaterial({
      map: textures.sunbeamMap,
      color: '#FFF6D6',
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mistMat = new THREE.MeshBasicMaterial({
      color: '#D4F0FF',
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    return { beamMat, mistMat };
  }, [textures]);

  // Shared geometries & wind-animated materials for instanced alpine props
  const propAssets = useMemo(() => {
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.28, 1.6, 7);
    trunkGeo.translate(0, 0.8, 0);

    const foliageLowGeo = new THREE.ConeGeometry(1.55, 3.0, 7);
    foliageLowGeo.translate(0, 2.5, 0);

    const foliageHighGeo = new THREE.ConeGeometry(1.12, 2.6, 7);
    foliageHighGeo.translate(0, 4.1, 0);

    const rockGeo = new THREE.DodecahedronGeometry(0.95, 0);
    rockGeo.translate(0, 0.42, 0);

    const bushGeo = new THREE.IcosahedronGeometry(0.75, 1);
    bushGeo.scale(1.25, 0.85, 1.1);
    bushGeo.translate(0, 0.45, 0);

    const postGeo = new THREE.BoxGeometry(0.18, 1.15, 0.18);
    postGeo.translate(0, 0.55, 0);

    const trunkMat = new THREE.MeshStandardMaterial({ color: '#6E472B', roughness: 0.92 });
    const foliageLowMat = new THREE.MeshStandardMaterial({ color: '#247A3C', roughness: 0.82 });
    const foliageHighMat = new THREE.MeshStandardMaterial({ color: '#33994B', roughness: 0.78 });
    const rockMat = new THREE.MeshStandardMaterial({
      color: '#7D8B96',
      roughness: 0.86,
      flatShading: true,
    });
    const bushMat = new THREE.MeshStandardMaterial({ color: '#45B854', roughness: 0.8 });
    const postMat = new THREE.MeshStandardMaterial({ color: '#D4A56A', roughness: 0.78 });

    // Inject smooth rolling alpine breeze sway into foliage & bushes (full PBR shadows preserved!)
    applyWindSway(foliageLowMat, windUniform, 0.036);
    applyWindSway(foliageHighMat, windUniform, 0.048);
    applyWindSway(bushMat, windUniform, 0.055);

    return {
      trunkGeo,
      foliageLowGeo,
      foliageHighGeo,
      rockGeo,
      bushGeo,
      postGeo,
      trunkMat,
      foliageLowMat,
      foliageHighMat,
      rockMat,
      bushMat,
      postMat,
    };
  }, [windUniform]);

  // Two-layer parallax alpine peaks (mid-range forested ridges + far snow-capped summits)
  const midRidges = useMemo(() => {
    const list: { x: number; z: number; h: number; r: number }[] = [];
    for (let i = 0; i < 18; i++) {
      const h1 = hash2(i, 5);
      const h2 = hash2(i, 9);
      list.push({
        x: -220 + i * 26 + (h1 - 0.5) * 12,
        z: -62 - h2 * 18,
        h: 20 + h1 * 18,
        r: 20 + h2 * 14,
      });
    }
    return list;
  }, []);

  const distantPeaks = useMemo(() => {
    const peaks: { x: number; z: number; h: number; r: number; snow: boolean }[] = [];
    for (let i = 0; i < 24; i++) {
      const h1 = hash2(i, 11);
      const h2 = hash2(i, 23);
      peaks.push({
        x: -240 + i * 24 + (h1 - 0.5) * 14,
        z: -95 - h2 * 56,
        h: 36 + h1 * 50,
        r: 22 + h2 * 22,
        snow: h1 > 0.22,
      });
    }
    return peaks;
  }, []);

  const clouds = useMemo(() => {
    const list: { x: number; y: number; z: number; scale: number; speed: number; phase: number }[] =
      [];
    for (let i = 0; i < 15; i++) {
      const h1 = hash2(i, 41);
      const h2 = hash2(i, 79);
      list.push({
        x: -165 + i * 27 + (h1 - 0.5) * 18,
        y: 25 + h2 * 24,
        z: -42 - h1 * 48,
        scale: 1.45 + h2 * 1.7,
        speed: 0.65 + h1 * 0.95,
        phase: i * 1.4,
      });
    }
    return list;
  }, []);

  const sunbeams = useMemo(
    () => [
      { x: -38, y: 24, z: -48, w: 18, h: 68, phase: 0.4 },
      { x: -6, y: 26, z: -56, w: 22, h: 74, phase: 1.7 },
      { x: 26, y: 24, z: -46, w: 16, h: 66, phase: 2.9 },
      { x: 58, y: 27, z: -54, w: 24, h: 76, phase: 4.1 },
    ],
    []
  );

  useEffect(() => {
    return () => {
      chunkGeos.forEach((g) => g.dispose());
      terrainMaterial.dispose();
      skyMaterial.dispose();
      atmosphereMats.beamMat.dispose();
      atmosphereMats.mistMat.dispose();
      propAssets.trunkGeo.dispose();
      propAssets.foliageLowGeo.dispose();
      propAssets.foliageHighGeo.dispose();
      propAssets.rockGeo.dispose();
      propAssets.bushGeo.dispose();
      propAssets.postGeo.dispose();
      propAssets.trunkMat.dispose();
      propAssets.foliageLowMat.dispose();
      propAssets.foliageHighMat.dispose();
      propAssets.rockMat.dispose();
      propAssets.bushMat.dispose();
      propAssets.postMat.dispose();
    };
  }, [chunkGeos, terrainMaterial, skyMaterial, atmosphereMats, propAssets]);

  const lastPropWindowRef = useRef(-99999);
  useEffect(() => {
    chunkSlotIndex.current.fill(-9999);
    lastPropWindowRef.current = -99999;
  }, [runKey, quality]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorScratch = useMemo(() => new THREE.Color(), []);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    const truckX = physicsRef.current.x;
    const terrain = terrainRef.current;

    // Drive wind-animated alpine foliage shader uniform
    windUniform.value = t;

    // 1. Recycle & update procedural terrain chunks around truckX
    const baseChunkIdx = Math.floor((truckX - 55) / CHUNK_LENGTH);
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const targetChunkIdx = baseChunkIdx + i;
      const slot = ((targetChunkIdx % CHUNK_COUNT) + CHUNK_COUNT) % CHUNK_COUNT;
      if (chunkSlotIndex.current[slot] !== targetChunkIdx) {
        chunkSlotIndex.current[slot] = targetChunkIdx;
        const startX = targetChunkIdx * CHUNK_LENGTH;
        terrain.ensureGeneratedTo(startX + CHUNK_LENGTH + 40);
        fillTerrainChunk(chunkGeos[slot], terrain, startX);
      }
    }

    // 2. Repopulate instanced trees, rocks, bushes, and roadside posts as truck advances
    const propWindowStart = Math.floor((truckX - 60) / 15) * 15;
    if (propWindowStart !== lastPropWindowRef.current) {
      lastPropWindowRef.current = propWindowStart;
      const span = 235;

      if (trunkInstRef.current && foliageLowInstRef.current && foliageHighInstRef.current) {
        const count = propCounts.trees;
        const step = span / count;
        for (let i = 0; i < count; i++) {
          const gridSlot = Math.floor(propWindowStart / step) + i;
          const h1 = hash2(gridSlot, 1);
          const h2 = hash2(gridSlot, 2);
          const h3 = hash2(gridSlot, 3);
          const wx = gridSlot * step + (h1 - 0.5) * step * 0.7;
          const wz = -5.2 - h2 * 24.5;
          const samp = terrain.sample(wx);

          const distBack = -wz - 3.9;
          const hillWave =
            Math.sin(wx * 0.055 + wz * 0.08) * (distBack * 0.24) +
            Math.cos(wx * 0.12 - wz * 0.05) * (distBack * 0.11);
          const wy = samp.isGap
            ? samp.height + Math.max(0, distBack - 4) * 0.35 - 0.25
            : samp.height + distBack * 0.22 + hillWave - 0.25;

          const scale = 0.78 + h3 * 0.72;
          dummy.position.set(wx, wy, wz);
          dummy.rotation.set(0, h1 * Math.PI * 2, (h2 - 0.5) * 0.08);
          dummy.scale.set(scale, scale * (0.9 + h1 * 0.32), scale);
          dummy.updateMatrix();

          trunkInstRef.current.setMatrixAt(i, dummy.matrix);
          foliageLowInstRef.current.setMatrixAt(i, dummy.matrix);
          foliageHighInstRef.current.setMatrixAt(i, dummy.matrix);

          colorScratch.setHSL(0.35 + (h2 - 0.5) * 0.05, 0.55, 0.32 + h3 * 0.12);
          foliageLowInstRef.current.setColorAt(i, colorScratch);
          colorScratch.setHSL(0.34 + (h1 - 0.5) * 0.05, 0.6, 0.4 + h3 * 0.12);
          foliageHighInstRef.current.setColorAt(i, colorScratch);
        }
        trunkInstRef.current.instanceMatrix.needsUpdate = true;
        foliageLowInstRef.current.instanceMatrix.needsUpdate = true;
        foliageHighInstRef.current.instanceMatrix.needsUpdate = true;
        if (foliageLowInstRef.current.instanceColor)
          foliageLowInstRef.current.instanceColor.needsUpdate = true;
        if (foliageHighInstRef.current.instanceColor)
          foliageHighInstRef.current.instanceColor.needsUpdate = true;
      }

      if (rockInstRef.current) {
        const count = propCounts.rocks;
        const step = span / count;
        for (let i = 0; i < count; i++) {
          const gridSlot = Math.floor(propWindowStart / step) + i;
          const h1 = hash2(gridSlot, 13);
          const h2 = hash2(gridSlot, 17);
          const h3 = hash2(gridSlot, 19);
          const wx = gridSlot * step + (h1 - 0.5) * step * 0.65;
          const samp = terrain.sample(wx);
          const isBack = h2 > 0.25;
          const wz = isBack ? -3.4 - h2 * 14.5 : 3.25 + h3 * 1.1;

          let wy = samp.height - 0.2;
          if (wz < -3.9) {
            const distBack = -wz - 3.9;
            wy +=
              distBack * 0.22 +
              Math.sin(wx * 0.055 + wz * 0.08) * (distBack * 0.24) +
              Math.cos(wx * 0.12 - wz * 0.05) * (distBack * 0.11);
          } else if (wz > 3.8) {
            wy -= (wz - 3.8) * 1.15;
          }

          const s = (samp.surface === 'rock' ? 1.15 : 0.68) * (0.65 + h3 * 0.9);
          dummy.position.set(wx, wy, wz);
          dummy.rotation.set(h1 * 2, h2 * 4, h3 * 2);
          dummy.scale.set(s * 1.25, s * 0.78, s);
          dummy.updateMatrix();
          rockInstRef.current.setMatrixAt(i, dummy.matrix);

          const lum = 0.44 + h1 * 0.16;
          colorScratch.setHSL(0.57, 0.1, lum);
          rockInstRef.current.setColorAt(i, colorScratch);
        }
        rockInstRef.current.instanceMatrix.needsUpdate = true;
        if (rockInstRef.current.instanceColor)
          rockInstRef.current.instanceColor.needsUpdate = true;
      }

      if (bushInstRef.current) {
        const count = propCounts.bushes;
        const step = span / count;
        for (let i = 0; i < count; i++) {
          const gridSlot = Math.floor(propWindowStart / step) + i;
          const h1 = hash2(gridSlot, 29);
          const h2 = hash2(gridSlot, 31);
          const h3 = hash2(gridSlot, 37);
          const wx = gridSlot * step + (h1 - 0.5) * step * 0.8;
          const samp = terrain.sample(wx);
          const wz = h2 > 0.2 ? -3.6 - h3 * 14 : 3.45 + h1 * 0.7;

          if (samp.isGap) {
            dummy.scale.set(0, 0, 0);
          } else {
            let wy = samp.height - 0.12;
            if (wz < -3.9) {
              const distBack = -wz - 3.9;
              wy +=
                distBack * 0.22 +
                Math.sin(wx * 0.055 + wz * 0.08) * (distBack * 0.24) +
                Math.cos(wx * 0.12 - wz * 0.05) * (distBack * 0.11);
            }
            const s = 0.55 + h3 * 0.85;
            dummy.position.set(wx, wy, wz);
            dummy.rotation.set(0, h1 * Math.PI * 2, 0);
            dummy.scale.set(s, s * 0.85, s);
          }
          dummy.updateMatrix();
          bushInstRef.current.setMatrixAt(i, dummy.matrix);

          colorScratch.setHSL(0.32 + (h1 - 0.5) * 0.07, 0.62, 0.44 + h2 * 0.12);
          bushInstRef.current.setColorAt(i, colorScratch);
        }
        bushInstRef.current.instanceMatrix.needsUpdate = true;
        if (bushInstRef.current.instanceColor)
          bushInstRef.current.instanceColor.needsUpdate = true;
      }

      if (postInstRef.current) {
        const count = propCounts.posts;
        const step = 4.2;
        const baseSlot = Math.floor(propWindowStart / step);
        for (let i = 0; i < count; i++) {
          const wx = (baseSlot + i) * step;
          const samp = terrain.sample(wx);
          if (samp.isGap) {
            dummy.scale.set(0, 0, 0);
          } else {
            dummy.position.set(wx, samp.height - 0.1, -3.15);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, 1, 1);
          }
          dummy.updateMatrix();
          postInstRef.current.setMatrixAt(i, dummy.matrix);
        }
        postInstRef.current.instanceMatrix.needsUpdate = true;
      }
    }

    // 3. Anchor sky dome & multi-layer parallax alpine ranges smoothly with truck
    if (backdropGroupRef.current) {
      backdropGroupRef.current.position.set(truckX, physicsRef.current.y * 0.22 - 8, 0);
    }

    // 4. Drift & gently bob alpine clouds
    if (cloudGroupRef.current) {
      cloudGroupRef.current.position.set(truckX * 0.85, physicsRef.current.y * 0.25, 0);
      const children = cloudGroupRef.current.children;
      for (let i = 0; i < children.length; i++) {
        const c = children[i];
        c.position.x -= clouds[i].speed * dt;
        c.position.y = clouds[i].y + Math.sin(t * 0.45 + clouds[i].phase) * 0.65;
        if (c.position.x < -195) c.position.x = 195;
      }
    }

    // 5. Gently shimmer angled alpine sunbeam shafts across the mountain valley
    if (sunbeamGroupRef.current) {
      sunbeamGroupRef.current.position.set(truckX, physicsRef.current.y * 0.3, 0);
      atmosphereMats.beamMat.opacity = 0.36 + Math.sin(t * 0.7) * 0.08;
    }
  });

  return (
    <group>
      {/* Pooled Endless Mountain Terrain Chunks */}
      {chunkGeos.map((geo, i) => (
        <mesh
          key={i}
          ref={(el) => {
            chunkMeshRefs.current[i] = el;
          }}
          geometry={geo}
          material={terrainMaterial}
          receiveShadow
          frustumCulled={false}
        />
      ))}

      {/* Instanced Wind-Animated Alpine Pine Trees */}
      <instancedMesh
        ref={trunkInstRef}
        args={[propAssets.trunkGeo, propAssets.trunkMat, propCounts.trees]}
        frustumCulled={false}
        castShadow={quality === 'high'}
      />
      <instancedMesh
        ref={foliageLowInstRef}
        args={[propAssets.foliageLowGeo, propAssets.foliageLowMat, propCounts.trees]}
        frustumCulled={false}
        castShadow={quality !== 'low'}
        receiveShadow
      />
      <instancedMesh
        ref={foliageHighInstRef}
        args={[propAssets.foliageHighGeo, propAssets.foliageHighMat, propCounts.trees]}
        frustumCulled={false}
        castShadow={quality === 'high'}
      />

      {/* Instanced Granite Boulders, Wind-Animated Bushes & Trail Posts */}
      <instancedMesh
        ref={rockInstRef}
        args={[propAssets.rockGeo, propAssets.rockMat, propCounts.rocks]}
        frustumCulled={false}
        receiveShadow
      />
      <instancedMesh
        ref={bushInstRef}
        args={[propAssets.bushGeo, propAssets.bushMat, propCounts.bushes]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={postInstRef}
        args={[propAssets.postGeo, propAssets.postMat, propCounts.posts]}
        frustumCulled={false}
      />

      {/* Alpine Sky Dome, Layered Atmospheric Valley Mist & Multi-Depth Parallax Peaks */}
      <group ref={backdropGroupRef}>
        <mesh material={skyMaterial}>
          <sphereGeometry args={[280, 24, 16]} />
        </mesh>

        {/* Mid-ground hazy pine ridges for rich depth separation */}
        {midRidges.map((rg, idx) => (
          <mesh key={`mid-${idx}`} position={[rg.x, -12 + rg.h * 0.5, rg.z]}>
            <coneGeometry args={[rg.r, rg.h, 6]} />
            <meshStandardMaterial color="#428B6D" roughness={0.96} flatShading />
          </mesh>
        ))}

        {/* Soft Alpine Valley Atmospheric Mist Band */}
        <mesh position={[0, 4, -76]} material={atmosphereMats.mistMat}>
          <planeGeometry args={[480, 34]} />
        </mesh>

        {/* Far Snow-Capped Alpine Peaks */}
        {distantPeaks.map((pk, idx) => (
          <group key={idx} position={[pk.x, -16, pk.z]}>
            <mesh position={[0, pk.h * 0.5, 0]}>
              <coneGeometry args={[pk.r, pk.h, 6]} />
              <meshStandardMaterial
                color={idx % 2 === 0 ? '#6794B5' : '#5382A4'}
                roughness={0.95}
                flatShading
              />
            </mesh>
            {pk.snow && (
              <mesh position={[0, pk.h * 0.84, 0]}>
                <coneGeometry args={[pk.r * 0.35, pk.h * 0.35, 6]} />
                <meshStandardMaterial color="#F5FAFF" roughness={0.72} flatShading />
              </mesh>
            )}
          </group>
        ))}
      </group>

      {/* Lightweight Drifting Alpine Sunbeam Shafts (God Rays) */}
      {quality !== 'low' && (
        <group ref={sunbeamGroupRef}>
          {sunbeams.map((bm, idx) => (
            <mesh
              key={idx}
              position={[bm.x, bm.y, bm.z]}
              rotation={[0, 0, -0.38]}
              material={atmosphereMats.beamMat}
            >
              <planeGeometry args={[bm.w, bm.h]} />
            </mesh>
          ))}
        </group>
      )}

      {/* Moving & Gently Bobbing Stylized Low-Poly Alpine Clouds */}
      <group ref={cloudGroupRef}>
        {clouds.map((cl, idx) => (
          <group key={idx} position={[cl.x, cl.y, cl.z]} scale={cl.scale}>
            <mesh>
              <dodecahedronGeometry args={[2.3, 0]} />
              <meshStandardMaterial color="#FFFFFF" roughness={0.94} flatShading />
            </mesh>
            <mesh position={[2.1, -0.35, 0.2]} scale={[0.78, 0.72, 0.8]}>
              <dodecahedronGeometry args={[2.1, 0]} />
              <meshStandardMaterial color="#F4FAFF" roughness={0.94} flatShading />
            </mesh>
            <mesh position={[-2.0, -0.4, -0.2]} scale={[0.75, 0.68, 0.78]}>
              <dodecahedronGeometry args={[2.0, 0]} />
              <meshStandardMaterial color="#EAF5FF" roughness={0.94} flatShading />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
};
