import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ProceduralTextureSet } from '../game/textures';
import { TRUCK_CONSTANTS } from '../game/physics';
import type {
  GameScreen,
  GraphicsQuality,
  UpgradeLevels,
  VehiclePhysicsState,
} from '../game/types';
import type { ProceduralTerrain } from '../game/terrain';

interface MonsterTruckModelProps {
  physicsRef: React.MutableRefObject<VehiclePhysicsState>;
  terrainRef: React.MutableRefObject<ProceduralTerrain>;
  textures: ProceduralTextureSet;
  upgrades: UpgradeLevels;
  quality: GraphicsQuality;
  screen: GameScreen;
  garageSpinRef: React.MutableRefObject<number>;
}

const AXLE_HALF_Z = 1.18;

const NITRO_FLAME_VERTEX = `
  uniform float uTime;
  uniform float uIntensity;
  varying vec2 vUv;
  varying vec3 vNormalDir;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Height along cone (0 at exhaust tip -> 1 at flame tail)
    float h = clamp(vUv.y, 0.0, 1.0);
    float wave = sin(h * 14.0 - uTime * 42.0) * 0.065 * h * uIntensity;
    float flutter = cos(h * 22.0 - uTime * 64.0) * 0.04 * h * uIntensity;
    pos.x += wave;
    pos.z += flutter;

    // Slight radial breathing near the middle of the plasma jet
    float pulse = 1.0 + sin(uTime * 52.0 - h * 9.0) * 0.14 * h;
    pos.x *= pulse;
    pos.z *= pulse;

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    vNormalDir = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const NITRO_FLAME_FRAGMENT = `
  uniform float uTime;
  uniform float uIntensity;
  varying vec2 vUv;
  varying vec3 vNormalDir;
  varying vec3 vViewDir;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    // Tip of exhaust is vUv.y = 0, outer tip of flame is vUv.y = 1
    float h = clamp(vUv.y, 0.0, 1.0);
    float n1 = noise(vec2(vUv.x * 6.0, h * 5.0 - uTime * 16.0));
    float n2 = noise(vec2(vUv.x * 12.0 + 3.1, h * 9.0 - uTime * 28.0));
    float turb = n1 * 0.65 + n2 * 0.35;

    // Soft glowing edge + intense center plasma
    float rim = abs(dot(normalize(vNormalDir), normalize(vViewDir)));
    float core = pow(clamp(rim, 0.0, 1.0), 0.75);

    // Hot white-cyan core -> vivid electric cyan -> deep cobalt blue outer plasma
    vec3 colBase = vec3(0.78, 0.99, 1.0);
    vec3 colMid = vec3(0.0, 0.72, 1.0);
    vec3 colTip = vec3(0.04, 0.24, 0.96);

    vec3 col = mix(colBase, colMid, smoothstep(0.04, 0.36, h + (turb - 0.5) * 0.18));
    col = mix(col, colTip, smoothstep(0.32, 0.86, h));

    float tipFade = 1.0 - smoothstep(0.48, 0.98, h + (0.5 - turb) * 0.24);
    float baseFade = smoothstep(0.0, 0.08, h);
    float alpha = tipFade * baseFade * (0.62 + 0.38 * core) * uIntensity;

    gl_FragColor = vec4(col * (1.05 + turb * 0.32), clamp(alpha, 0.0, 0.96));
  }
`;

export const MonsterTruckModel: React.FC<MonsterTruckModelProps> = ({
  physicsRef,
  terrainRef,
  textures,
  upgrades,
  quality,
  screen,
  garageSpinRef,
}) => {
  const rootRef = useRef<THREE.Group>(null);
  const chassisRef = useRef<THREE.Group>(null);
  const rearAxleGroupRef = useRef<THREE.Group>(null);
  const frontAxleGroupRef = useRef<THREE.Group>(null);

  // Articulated 4-link trailing arm refs connecting chassis belly to moving axles
  const rearLinkRef = useRef<THREE.Group>(null);
  const frontLinkRef = useRef<THREE.Group>(null);

  const rearSpringLeftRef = useRef<THREE.Mesh>(null);
  const rearSpringRightRef = useRef<THREE.Mesh>(null);
  const frontSpringLeftRef = useRef<THREE.Mesh>(null);
  const frontSpringRightRef = useRef<THREE.Mesh>(null);

  const mudflapLeftRef = useRef<THREE.Mesh>(null);
  const mudflapRightRef = useRef<THREE.Mesh>(null);

  const wheelRefs = [
    useRef<THREE.Group>(null), // Rear-Left (+Z)
    useRef<THREE.Group>(null), // Rear-Right (-Z)
    useRef<THREE.Group>(null), // Front-Left (+Z)
    useRef<THREE.Group>(null), // Front-Right (-Z)
  ];

  const flameLeftRef = useRef<THREE.Group>(null);
  const flameRightRef = useRef<THREE.Group>(null);
  const nitroLightRef = useRef<THREE.PointLight>(null);
  const contactShadowRef = useRef<THREE.Mesh>(null);

  // Build composite procedural geometries once & dispose cleanly on unmount
  const geometries = useMemo(() => {
    // 1. Extruded beveled pickup truck body profile
    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(-2.15, -0.18);
    bodyShape.lineTo(2.15, -0.18);
    bodyShape.lineTo(2.26, 0.08);
    bodyShape.lineTo(2.16, 0.56); // Nose / grille
    bodyShape.lineTo(1.12, 0.68); // Hood
    bodyShape.lineTo(0.62, 1.32); // Windshield pillar
    bodyShape.lineTo(-0.72, 1.32); // Cab roof
    bodyShape.lineTo(-0.88, 0.64); // Rear cab window drop
    bodyShape.lineTo(-2.12, 0.6); // Pickup bed top
    bodyShape.lineTo(-2.22, 0.14); // Tailgate
    bodyShape.closePath();

    const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
      depth: 1.56,
      bevelEnabled: true,
      bevelThickness: 0.11,
      bevelSize: 0.08,
      bevelSegments: 3,
      steps: 1,
    });
    bodyGeo.translate(0, 0, -0.78);

    // 2. Tubular chrome rollcage curves
    const cageCurveLeft = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.78, 0.6, 0.64),
      new THREE.Vector3(-0.92, 1.34, 0.58),
      new THREE.Vector3(-1.35, 1.24, 0.56),
      new THREE.Vector3(-1.98, 0.58, 0.6),
    ]);
    const cageGeoLeft = new THREE.TubeGeometry(cageCurveLeft, 20, 0.058, 8, false);

    const cageCurveRight = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.78, 0.6, -0.64),
      new THREE.Vector3(-0.92, 1.34, -0.58),
      new THREE.Vector3(-1.35, 1.24, -0.56),
      new THREE.Vector3(-1.98, 0.58, -0.6),
    ]);
    const cageGeoRight = new THREE.TubeGeometry(cageCurveRight, 20, 0.058, 8, false);

    // 3. Helical coil spring geometry along Y from 0 to -1 (scaled dynamically with compression)
    const coilPts: THREE.Vector3[] = [];
    const turns = 6.5;
    const samples = 52;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const a = t * turns * Math.PI * 2;
      coilPts.push(new THREE.Vector3(Math.cos(a) * 0.13, -t, Math.sin(a) * 0.13));
    }
    const coilCurve = new THREE.CatmullRomCurve3(coilPts);
    const coilSpringGeo = new THREE.TubeGeometry(coilCurve, 48, 0.03, 6, false);

    // 4. Sculpted Monster Tire via LatheGeometry
    const r = TRUCK_CONSTANTS.WHEEL_RADIUS;
    const halfW = 0.44;
    const tireProfile = [
      new THREE.Vector2(r * 0.5, -halfW * 0.88),
      new THREE.Vector2(r * 0.88, -halfW),
      new THREE.Vector2(r, -halfW * 0.84),
      new THREE.Vector2(r * 1.015, -halfW * 0.35),
      new THREE.Vector2(r * 1.015, halfW * 0.35),
      new THREE.Vector2(r, halfW * 0.84),
      new THREE.Vector2(r * 0.88, halfW),
      new THREE.Vector2(r * 0.5, halfW * 0.88),
    ];
    const tireGeo = new THREE.LatheGeometry(tireProfile, 28);
    tireGeo.rotateX(Math.PI / 2);

    // 5. Sculpted Plasma Flame Plume Geometry (open-base tapered nozzle cone with UV.y = 0 at base -> 1 at tip)
    const flamePoints = [
      new THREE.Vector2(0.08, 0.0),
      new THREE.Vector2(0.25, 0.16),
      new THREE.Vector2(0.29, 0.44),
      new THREE.Vector2(0.21, 0.92),
      new THREE.Vector2(0.1, 1.42),
      new THREE.Vector2(0.01, 1.85),
    ];
    const flameOuterGeo = new THREE.LatheGeometry(flamePoints, 16);

    const innerPoints = [
      new THREE.Vector2(0.05, 0.0),
      new THREE.Vector2(0.14, 0.15),
      new THREE.Vector2(0.12, 0.52),
      new THREE.Vector2(0.02, 1.05),
    ];
    const flameCoreGeo = new THREE.LatheGeometry(innerPoints, 12);

    return {
      bodyGeo,
      cageGeoLeft,
      cageGeoRight,
      coilSpringGeo,
      tireGeo,
      flameOuterGeo,
      flameCoreGeo,
    };
  }, []);

  const materials = useMemo(() => {
    const crimsonPaint = new THREE.MeshPhysicalMaterial({
      color: '#E01A22',
      metalness: 0.44,
      roughness: 0.34,
      roughnessMap: textures.paintRoughnessMap,
      clearcoat: 1.0,
      clearcoatRoughness: 0.09,
    });
    const flameSideMat = new THREE.MeshPhysicalMaterial({
      map: textures.flameLiveryMap,
      roughnessMap: textures.paintRoughnessMap,
      metalness: 0.32,
      roughness: 0.34,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const chrome = new THREE.MeshStandardMaterial({
      color: '#F4F8FC',
      metalness: 0.96,
      roughness: 0.12,
    });
    const darkChassis = new THREE.MeshStandardMaterial({
      color: '#1A2029',
      metalness: 0.62,
      roughness: 0.48,
    });
    const carbonTrim = new THREE.MeshStandardMaterial({
      color: '#13171F',
      metalness: 0.38,
      roughness: 0.42,
    });
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#0D213A',
      metalness: 0.18,
      roughness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
    });
    const rubber = new THREE.MeshStandardMaterial({
      color: '#20242B',
      map: textures.tireTreadMap,
      bumpMap: textures.tireBumpMap,
      bumpScale: 0.11,
      roughness: 0.9,
      metalness: 0.04,
    });
    const brakeDiscMat = new THREE.MeshStandardMaterial({
      color: '#9BA6B2',
      metalness: 0.88,
      roughness: 0.32,
    });
    const shockGold = new THREE.MeshStandardMaterial({
      color: '#FFBF00',
      metalness: 0.85,
      roughness: 0.2,
    });
    const shockRed = new THREE.MeshStandardMaterial({
      color: '#FF362E',
      metalness: 0.55,
      roughness: 0.28,
    });
    const headlightMat = new THREE.MeshStandardMaterial({
      color: '#FFFBEB',
      emissive: '#FFE89A',
      emissiveIntensity: 2.5,
      roughness: 0.12,
    });
    const taillightMat = new THREE.MeshStandardMaterial({
      color: '#FF2424',
      emissive: '#FF1515',
      emissiveIntensity: 1.6,
      roughness: 0.18,
    });
    const nitroTankMat = new THREE.MeshStandardMaterial({
      color: '#00B8FF',
      metalness: 0.78,
      roughness: 0.18,
      emissive: '#0066CC',
      emissiveIntensity: 0.42,
    });

    // AAA Custom Animated Blue Plasma Nitro ShaderMaterial (NormalBlending keeps rich cobalt blue vivid against bright sky!)
    const nitroPlasmaShader = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 1.0 },
      },
      vertexShader: NITRO_FLAME_VERTEX,
      fragmentShader: NITRO_FLAME_FRAGMENT,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const flameCoreMat = new THREE.MeshBasicMaterial({
      color: '#D6FCFF',
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const shadowMat = new THREE.MeshBasicMaterial({
      map: textures.contactShadowMap,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    return {
      crimsonPaint,
      flameSideMat,
      chrome,
      darkChassis,
      carbonTrim,
      glass,
      rubber,
      brakeDiscMat,
      shockGold,
      shockRed,
      headlightMat,
      taillightMat,
      nitroTankMat,
      nitroPlasmaShader,
      flameCoreMat,
      shadowMat,
    };
  }, [textures]);

  useEffect(() => {
    return () => {
      geometries.bodyGeo.dispose();
      geometries.cageGeoLeft.dispose();
      geometries.cageGeoRight.dispose();
      geometries.coilSpringGeo.dispose();
      geometries.tireGeo.dispose();
      geometries.flameOuterGeo.dispose();
      geometries.flameCoreGeo.dispose();
      Object.values(materials).forEach((m) => m.dispose());
    };
  }, [geometries, materials]);

  const timeRef = useRef(0);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    timeRef.current += dt;
    const t = timeRef.current;
    const phys = physicsRef.current;

    if (!rootRef.current || !chassisRef.current) return;

    // Advance plasma flame shader time smoothly
    materials.nitroPlasmaShader.uniforms.uTime.value = t;

    const isShowcase =
      screen === 'menu' || screen === 'garage' || screen === 'missions' || screen === 'settings';

    if (isShowcase) {
      const idleBob = Math.sin(t * 14) * 0.011 + Math.sin(t * 2.4) * 0.032;
      rootRef.current.position.set(0, phys.y, 0);
      rootRef.current.rotation.set(0, screen === 'garage' ? garageSpinRef.current : 0, 0);

      chassisRef.current.position.set(0, idleBob, 0);
      chassisRef.current.rotation.set(0, 0, Math.sin(t * 1.9) * 0.014);
      chassisRef.current.scale.set(1, 1, 1);

      const idleDrop = -(TRUCK_CONSTANTS.REST_STRUT_LEN - 0.14 - TRUCK_CONSTANTS.SUSPENSION_ATTACH_Y);
      if (rearAxleGroupRef.current) {
        rearAxleGroupRef.current.position.set(-TRUCK_CONSTANTS.WHEEL_BASE_HALF, idleDrop, 0);
      }
      if (frontAxleGroupRef.current) {
        frontAxleGroupRef.current.position.set(TRUCK_CONSTANTS.WHEEL_BASE_HALF, idleDrop, 0);
      }

      // Align articulated 4-link arms cleanly in showcase mode
      const linkAngle = Math.atan2(idleDrop - -0.28, TRUCK_CONSTANTS.WHEEL_BASE_HALF - 0.35);
      if (rearLinkRef.current) rearLinkRef.current.rotation.z = -linkAngle;
      if (frontLinkRef.current) frontLinkRef.current.rotation.z = linkAngle;

      const springLen = Math.max(0.35, -(idleDrop - TRUCK_CONSTANTS.SUSPENSION_ATTACH_Y) + idleBob);
      for (const sRef of [rearSpringLeftRef, rearSpringRightRef, frontSpringLeftRef, frontSpringRightRef]) {
        if (sRef.current) sRef.current.scale.set(1, springLen, 1);
      }

      materials.taillightMat.emissiveIntensity = 1.6;
      materials.nitroTankMat.emissiveIntensity = 0.45 + Math.sin(t * 3.5) * 0.15;

      // Subtle pilot plasma flame preview in Garage when Nitro is upgraded
      const showPilotFlame = upgrades.nitro > 0 && screen === 'garage';
      if (flameLeftRef.current && flameRightRef.current) {
        flameLeftRef.current.visible = showPilotFlame;
        flameRightRef.current.visible = showPilotFlame;
        if (showPilotFlame) {
          materials.nitroPlasmaShader.uniforms.uIntensity.value = 0.72;
          const pulse = 0.3 + Math.sin(t * 28) * 0.06;
          flameLeftRef.current.scale.set(0.55, pulse, 0.55);
          flameRightRef.current.scale.set(0.55, pulse, 0.55);
        }
      }
      if (nitroLightRef.current) {
        nitroLightRef.current.intensity = showPilotFlame ? 1.8 : 0;
      }

      if (contactShadowRef.current) {
        const g0 = terrainRef.current.sample(0);
        contactShadowRef.current.visible = true;
        contactShadowRef.current.position.set(0, g0.height + 0.06, 0);
        contactShadowRef.current.rotation.set(-Math.PI / 2, 0, 0);
        contactShadowRef.current.scale.set(5.9, 3.8, 1);
        materials.shadowMat.opacity = 0.76;
      }
      return;
    }

    // Active Gameplay Transform (exact physics sync — untouched!)
    rootRef.current.position.set(phys.x, phys.y, 0);
    rootRef.current.rotation.set(0, 0, phys.angle);

    // Juicy spring-damped chassis squash-and-stretch on heavy landings
    const sq = phys.squash * 0.11;
    chassisRef.current.position.set(0, -sq * 0.48, 0);
    chassisRef.current.rotation.set(0, 0, 0);
    chassisRef.current.scale.set(1 + sq * 0.48, 1 - sq, 1 + sq * 0.36);

    // Compute local axle positions from real suspension compression
    const maxLen = TRUCK_CONSTANTS.MAX_STRUT_LEN;
    const minLen = TRUCK_CONSTANTS.MIN_STRUT_LEN;
    const rearStrut = maxLen - phys.rearCompression * (maxLen - minLen);
    const frontStrut = maxLen - phys.frontCompression * (maxLen - minLen);

    const rearLocalY = TRUCK_CONSTANTS.SUSPENSION_ATTACH_Y - rearStrut;
    const frontLocalY = TRUCK_CONSTANTS.SUSPENSION_ATTACH_Y - frontStrut;

    if (rearAxleGroupRef.current) {
      rearAxleGroupRef.current.position.set(-TRUCK_CONSTANTS.WHEEL_BASE_HALF, rearLocalY, 0);
    }
    if (frontAxleGroupRef.current) {
      frontAxleGroupRef.current.position.set(TRUCK_CONSTANTS.WHEEL_BASE_HALF, frontLocalY, 0);
    }

    // Dynamically pivot articulated 4-link trailing arms between chassis belly & live axles!
    const armSpanX = TRUCK_CONSTANTS.WHEEL_BASE_HALF - 0.32;
    if (rearLinkRef.current) {
      const dyRear = rearLocalY - -0.28;
      rearLinkRef.current.rotation.z = -Math.atan2(dyRear, armSpanX);
    }
    if (frontLinkRef.current) {
      const dyFront = frontLocalY - -0.28;
      frontLinkRef.current.rotation.z = Math.atan2(dyFront, armSpanX);
    }

    // Animate visible helical coil springs compressing & extending!
    const springScaleRear = Math.max(0.32, rearStrut);
    const springScaleFront = Math.max(0.32, frontStrut);
    if (rearSpringLeftRef.current) rearSpringLeftRef.current.scale.set(1, springScaleRear, 1);
    if (rearSpringRightRef.current) rearSpringRightRef.current.scale.set(1, springScaleRear, 1);
    if (frontSpringLeftRef.current) frontSpringLeftRef.current.scale.set(1, springScaleFront, 1);
    if (frontSpringRightRef.current) frontSpringRightRef.current.scale.set(1, springScaleFront, 1);

    // Dynamic rear mudflap sway reacting to truck speed & bumps
    const flapSway = THREE.MathUtils.clamp(
      phys.vx * 0.025 + Math.sin(t * 24) * Math.min(0.08, Math.abs(phys.vx) * 0.004),
      -0.25,
      0.72
    );
    if (mudflapLeftRef.current) mudflapLeftRef.current.rotation.z = -flapSway;
    if (mudflapRightRef.current) mudflapRightRef.current.rotation.z = -flapSway;

    // Reactive brake lights flare bright red when braking!
    materials.taillightMat.emissiveIntensity = phys.isBraking ? 4.8 : 1.5;

    // Rotate all 4 oversized monster wheels smoothly
    for (let i = 0; i < 4; i++) {
      const w = wheelRefs[i].current;
      if (w) {
        w.rotation.z = phys.wheelAngle;
      }
    }

    // Animated Blue Plasma Nitro Exhaust Flames + Dynamic Cyan Exhaust Illumination
    const nitroOn = phys.nitroActive && !phys.crashed;
    materials.nitroTankMat.emissiveIntensity = nitroOn ? 1.85 : 0.42;

    if (flameLeftRef.current && flameRightRef.current) {
      flameLeftRef.current.visible = nitroOn;
      flameRightRef.current.visible = nitroOn;
      if (nitroOn) {
        const surge = 1.0 + phys.nitroSurge * 0.42;
        const flicker = 0.92 + Math.sin(t * 64) * 0.2 + Math.cos(t * 97) * 0.1;
        const boostScale = (1.05 + upgrades.nitro * 0.15) * surge;
        materials.nitroPlasmaShader.uniforms.uIntensity.value = 1.0 + phys.nitroSurge * 0.35;
        flameLeftRef.current.scale.set(
          1.05 * surge * 0.92,
          flicker * boostScale,
          1.05 * surge * 0.92
        );
        flameRightRef.current.scale.set(
          1.05 * surge * 0.92,
          (2.0 - flicker) * boostScale,
          1.05 * surge * 0.92
        );
      }
    }

    if (nitroLightRef.current) {
      if (nitroOn && quality !== 'low') {
        nitroLightRef.current.intensity = 6.5 + Math.sin(t * 58) * 1.8 + phys.nitroSurge * 3.5;
      } else {
        nitroLightRef.current.intensity = 0;
      }
    }

    // Grounded Contact Shadow hugging exact terrain slope underneath truck
    if (contactShadowRef.current) {
      const ground = terrainRef.current.sample(phys.x);
      const heightAbove = Math.max(0, phys.y - 1.35 - ground.height);
      const fade = Math.max(0, 1 - heightAbove / 10.0);
      contactShadowRef.current.visible = !ground.isGap && fade > 0.02;
      contactShadowRef.current.position.set(phys.x, ground.height + 0.06, 0);
      const slopeAngle = Math.atan(ground.slope);
      contactShadowRef.current.rotation.set(-Math.PI / 2, 0, 0);
      contactShadowRef.current.rotateY(-slopeAngle);
      const spread = 1 + heightAbove * 0.12;
      contactShadowRef.current.scale.set(5.9 * spread, 3.8 * spread, 1);
      materials.shadowMat.opacity = 0.78 * fade;
    }
  });

  // Visual upgrade cues reflected live on the 3D monster truck
  const blowerScale = 1 + upgrades.engine * 0.11;
  const shockMat = upgrades.suspension >= 2 ? materials.shockGold : materials.shockRed;
  const nitroTankScale = 1 + upgrades.nitro * 0.1;

  const renderWheel = (
    ref: React.RefObject<THREE.Group | null>,
    zPos: number,
    key: string
  ) => (
    <group key={key} ref={ref} position={[0, 0, zPos]}>
      {/* Main grooved chevron monster rubber tire */}
      <mesh geometry={geometries.tireGeo} material={materials.rubber} castShadow receiveShadow />
      {/* 14 Sculpted heavy off-road lug ribs for crisp rotation feedback */}
      {Array.from({ length: 14 }).map((_, idx) => {
        const angle = (idx / 14) * Math.PI * 2;
        const r = TRUCK_CONSTANTS.WHEEL_RADIUS - 0.015;
        return (
          <mesh
            key={idx}
            position={[Math.cos(angle) * r, Math.sin(angle) * r, 0]}
            rotation={[0, 0, angle]}
            material={materials.rubber}
          >
            <boxGeometry args={[0.11, 0.15, 0.82]} />
          </mesh>
        );
      })}
      {/* Recessed metallic brake rotor disc inside wheel barrel */}
      <mesh rotation={[Math.PI / 2, 0, 0]} material={materials.brakeDiscMat}>
        <cylinderGeometry args={[0.35, 0.35, 0.45, 16]} />
      </mesh>
      {/* Deep brushed chrome beadlock rim barrel */}
      <mesh rotation={[Math.PI / 2, 0, 0]} material={materials.chrome} castShadow>
        <cylinderGeometry args={[0.43, 0.43, 0.72, 18]} />
      </mesh>
      {/* Inner dark rim cavity */}
      <mesh rotation={[Math.PI / 2, 0, 0]} material={materials.darkChassis}>
        <cylinderGeometry args={[0.36, 0.36, 0.75, 16]} />
      </mesh>
      {/* 6-Spoke Star Alloy Rim + Red Anodized Center Hubcap */}
      {[0, 1, 2].map((s) => (
        <mesh
          key={s}
          rotation={[0, 0, (s * Math.PI) / 3]}
          material={materials.chrome}
        >
          <boxGeometry args={[0.74, 0.11, 0.8]} />
        </mesh>
      ))}
      <mesh rotation={[Math.PI / 2, 0, 0]} material={materials.crimsonPaint}>
        <cylinderGeometry args={[0.16, 0.16, 0.86, 12]} />
      </mesh>
      {/* Chrome Lug Bolts around Hub */}
      {[0, 1, 2, 3, 4, 5].map((b) => {
        const a = (b / 6) * Math.PI * 2;
        return (
          <mesh
            key={b}
            position={[Math.cos(a) * 0.24, Math.sin(a) * 0.24, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            material={materials.chrome}
          >
            <cylinderGeometry args={[0.028, 0.028, 0.84, 6]} />
          </mesh>
        );
      })}
    </group>
  );

  return (
    <>
      <group ref={rootRef}>
        {/* Sprung Chassis + Body Group */}
        <group ref={chassisRef}>
          {/* 1. Primary Sculpted Beveled Pickup Shell with Metallic-Flake Clearcoat */}
          <mesh
            geometry={geometries.bodyGeo}
            material={materials.crimsonPaint}
            castShadow
            receiveShadow
          />

          {/* 2. Side Crimson Flame Livery Plates (+Z camera side & -Z far side) */}
          <mesh position={[0.02, 0.24, 0.895]} material={materials.flameSideMat}>
            <planeGeometry args={[4.12, 0.75]} />
          </mesh>
          <mesh
            position={[0.02, 0.24, -0.895]}
            rotation={[0, Math.PI, 0]}
            material={materials.flameSideMat}
          >
            <planeGeometry args={[4.12, 0.75]} />
          </mesh>

          {/* 3. Sculpted Carbon Fender Flares + Side-View Mirrors */}
          {[-1.38, 1.38].map((fx, i) => (
            <group key={i} position={[fx, 0.02, 0]}>
              <mesh position={[0, 0.35, 0.88]} material={materials.carbonTrim}>
                <boxGeometry args={[1.42, 0.14, 0.22]} />
              </mesh>
              <mesh position={[0, 0.35, -0.88]} material={materials.carbonTrim}>
                <boxGeometry args={[1.42, 0.14, 0.22]} />
              </mesh>
            </group>
          ))}
          {[-1.02, 1.02].map((mz, i) => (
            <group key={i} position={[0.56, 0.76, mz]}>
              <mesh material={materials.carbonTrim}>
                <boxGeometry args={[0.14, 0.18, 0.24]} />
              </mesh>
              <mesh position={[0.075, 0, 0]} material={materials.crimsonPaint}>
                <boxGeometry args={[0.04, 0.16, 0.22]} />
              </mesh>
            </group>
          ))}

          {/* 4. Tinted Windshield, Side Windows & Driver Racing Helmet */}
          <mesh position={[0.82, 0.99, 0]} rotation={[0, 0, -0.66]} material={materials.glass}>
            <boxGeometry args={[0.1, 0.78, 1.48]} />
          </mesh>
          <mesh position={[-0.08, 0.98, 0.885]} material={materials.glass}>
            <boxGeometry args={[1.22, 0.5, 0.05]} />
          </mesh>
          <mesh position={[-0.08, 0.98, -0.885]} material={materials.glass}>
            <boxGeometry args={[1.22, 0.5, 0.05]} />
          </mesh>
          {/* Driver Helmet + Visor */}
          <mesh position={[-0.05, 0.96, 0.22]} material={materials.chrome}>
            <sphereGeometry args={[0.21, 14, 14]} />
          </mesh>
          <mesh position={[0.1, 0.98, 0.22]} material={materials.glass}>
            <boxGeometry args={[0.16, 0.11, 0.26]} />
          </mesh>

          {/* 5. Cab Roof Aero Spoiler + Chrome Tubular Rollcage + Roof Lightbar */}
          <group position={[-0.68, 1.44, 0]}>
            <mesh rotation={[0, 0, 0.14]} material={materials.carbonTrim} castShadow>
              <boxGeometry args={[0.42, 0.06, 1.54]} />
            </mesh>
            <mesh position={[0, -0.05, 0.58]} material={materials.crimsonPaint}>
              <boxGeometry args={[0.24, 0.14, 0.07]} />
            </mesh>
            <mesh position={[0, -0.05, -0.58]} material={materials.crimsonPaint}>
              <boxGeometry args={[0.24, 0.14, 0.07]} />
            </mesh>
          </group>

          <mesh geometry={geometries.cageGeoLeft} material={materials.chrome} castShadow />
          <mesh geometry={geometries.cageGeoRight} material={materials.chrome} castShadow />
          <mesh
            position={[-0.96, 1.34, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            material={materials.chrome}
          >
            <cylinderGeometry args={[0.058, 0.058, 1.18, 10]} />
          </mesh>
          {/* Roof Auxiliary Spotlights */}
          {[-0.36, 0, 0.36].map((lz, i) => (
            <group key={i} position={[0.45, 1.45, lz]}>
              <mesh material={materials.darkChassis}>
                <boxGeometry args={[0.18, 0.14, 0.18]} />
              </mesh>
              <mesh position={[0.1, 0, 0]} material={materials.headlightMat}>
                <boxGeometry args={[0.04, 0.1, 0.14]} />
              </mesh>
            </group>
          ))}

          {/* 6. Hood Chrome V8 Supercharger Blower (scales with Engine upgrades) */}
          <group position={[1.48, 0.72, 0]} scale={[blowerScale, blowerScale, blowerScale]}>
            <mesh material={materials.chrome} castShadow>
              <boxGeometry args={[0.7, 0.32, 0.6]} />
            </mesh>
            <mesh position={[0.08, 0.22, 0]} material={materials.chrome}>
              <boxGeometry args={[0.54, 0.16, 0.46]} />
            </mesh>
            {[-0.13, 0, 0.13].map((bz, idx) => (
              <mesh
                key={idx}
                position={[0.36, 0.22, bz]}
                rotation={[0, 0, Math.PI / 2]}
                material={materials.crimsonPaint}
              >
                <cylinderGeometry args={[0.058, 0.058, 0.06, 10]} />
              </mesh>
            ))}
          </group>

          {/* 7. Detailed Front Radiator Grille Slats, Chrome Bullbar, Tow Hooks & Rear Bumper */}
          <mesh position={[2.24, 0.32, 0]} material={materials.darkChassis}>
            <boxGeometry args={[0.12, 0.44, 1.38]} />
          </mesh>
          {[-0.1, 0.02, 0.14].map((gy, idx) => (
            <mesh key={idx} position={[2.31, 0.28 + gy, 0]} material={materials.chrome}>
              <boxGeometry args={[0.03, 0.04, 1.24]} />
            </mesh>
          ))}
          <mesh position={[2.42, 0.04, 0]} material={materials.chrome} castShadow>
            <boxGeometry args={[0.24, 0.24, 1.78]} />
          </mesh>
          {/* Red Heavy-Duty Tow Hooks */}
          {[-0.44, 0.44].map((tz, i) => (
            <mesh key={i} position={[2.56, 0.02, tz]} material={materials.crimsonPaint}>
              <torusGeometry args={[0.08, 0.026, 8, 12]} />
            </mesh>
          ))}
          <mesh position={[2.45, 0.36, 0.52]} rotation={[0, 0, 0.22]} material={materials.chrome}>
            <cylinderGeometry args={[0.048, 0.048, 0.56, 8]} />
          </mesh>
          <mesh position={[2.45, 0.36, -0.52]} rotation={[0, 0, 0.22]} material={materials.chrome}>
            <cylinderGeometry args={[0.048, 0.048, 0.56, 8]} />
          </mesh>
          <mesh position={[2.38, 0.56, 0]} rotation={[Math.PI / 2, 0, 0]} material={materials.chrome}>
            <cylinderGeometry args={[0.048, 0.048, 1.12, 8]} />
          </mesh>
          {/* Rear Bumper + Swaying Rear Mudflaps */}
          <mesh position={[-2.32, 0.02, 0]} material={materials.chrome} castShadow>
            <boxGeometry args={[0.22, 0.22, 1.76]} />
          </mesh>
          <mesh
            ref={mudflapLeftRef}
            position={[-2.18, -0.26, 1.06]}
            material={materials.carbonTrim}
          >
            <boxGeometry args={[0.05, 0.42, 0.46]} />
          </mesh>
          <mesh
            ref={mudflapRightRef}
            position={[-2.18, -0.26, -1.06]}
            material={materials.carbonTrim}
          >
            <boxGeometry args={[0.05, 0.42, 0.46]} />
          </mesh>

          {/* 8. Headlights & Reactive Brake Taillights */}
          {[-0.54, 0.54].map((z, i) => (
            <React.Fragment key={i}>
              <mesh position={[2.28, 0.38, z]} material={materials.headlightMat}>
                <boxGeometry args={[0.08, 0.2, 0.28]} />
              </mesh>
              <mesh position={[-2.25, 0.36, z]} material={materials.taillightMat}>
                <boxGeometry args={[0.08, 0.22, 0.28]} />
              </mesh>
            </React.Fragment>
          ))}

          {/* 9. Twin Cryo Nitro Tanks + Dual Chrome Exhaust Stacks + Custom GLSL Blue Plasma Flames */}
          {[-0.3, 0.3].map((nz, i) => (
            <mesh
              key={i}
              position={[-1.48, 0.68, nz]}
              rotation={[0, 0, 1.28]}
              scale={[nitroTankScale, nitroTankScale, nitroTankScale]}
              material={materials.nitroTankMat}
              castShadow
            >
              <capsuleGeometry args={[0.16, 0.52, 6, 12]} />
            </mesh>
          ))}

          {[
            { z: 0.72, ref: flameLeftRef },
            { z: -0.72, ref: flameRightRef },
          ].map((stack, i) => (
            <group key={i} position={[-1.24, 0.84, stack.z]} rotation={[0, 0, 0.96]}>
              <mesh material={materials.chrome} castShadow>
                <cylinderGeometry args={[0.09, 0.1, 1.02, 12]} />
              </mesh>
              {/* Heated chrome exhaust collar */}
              <mesh position={[0, 0.49, 0]} material={materials.darkChassis}>
                <cylinderGeometry args={[0.105, 0.105, 0.08, 12]} />
              </mesh>
              {/* Animated GLSL Blue Plasma Jet Cones */}
              <group ref={stack.ref} position={[0, 0.52, 0]} visible={false}>
                <mesh
                  geometry={geometries.flameOuterGeo}
                  material={materials.nitroPlasmaShader}
                />
                <mesh
                  geometry={geometries.flameCoreGeo}
                  material={materials.flameCoreMat}
                />
              </group>
            </group>
          ))}

          {/* Live Dynamic Cyan Point Light pulsing behind exhausts during Nitro Boost */}
          <pointLight
            ref={nitroLightRef}
            position={[-2.35, 1.65, 0]}
            color="#00D9FF"
            intensity={0}
            distance={14}
            decay={2}
          />

          {/* 10. Steel Ladder Chassis Frame Underbody + Skid Plate */}
          <mesh position={[0, -0.26, 0.48]} material={materials.darkChassis} castShadow>
            <boxGeometry args={[3.95, 0.2, 0.16]} />
          </mesh>
          <mesh position={[0, -0.26, -0.48]} material={materials.darkChassis} castShadow>
            <boxGeometry args={[3.95, 0.2, 0.16]} />
          </mesh>
          <mesh position={[0, -0.34, 0]} material={materials.darkChassis}>
            <boxGeometry args={[1.3, 0.28, 0.88]} />
          </mesh>
          <mesh position={[1.72, -0.32, 0]} rotation={[0, 0, 0.35]} material={materials.chrome}>
            <boxGeometry args={[0.72, 0.06, 0.92]} />
          </mesh>

          {/* 11. Articulated 4-Link Suspension Trailing Arms (pivot dynamically with axle travel!) */}
          <group ref={rearLinkRef} position={[-0.32, -0.28, 0]}>
            <mesh position={[-0.56, 0, 0.54]} material={shockMat}>
              <boxGeometry args={[1.18, 0.08, 0.08]} />
            </mesh>
            <mesh position={[-0.56, 0, -0.54]} material={shockMat}>
              <boxGeometry args={[1.18, 0.08, 0.08]} />
            </mesh>
          </group>
          <group ref={frontLinkRef} position={[0.32, -0.28, 0]}>
            <mesh position={[0.56, 0, 0.54]} material={shockMat}>
              <boxGeometry args={[1.18, 0.08, 0.08]} />
            </mesh>
            <mesh position={[0.56, 0, -0.54]} material={shockMat}>
              <boxGeometry args={[1.18, 0.08, 0.08]} />
            </mesh>
          </group>

          {/* 12. Visible Helical Coil-Over Springs + Anodized Piggyback Shock Reservoirs */}
          <mesh
            ref={rearSpringLeftRef}
            position={[-TRUCK_CONSTANTS.WHEEL_BASE_HALF, TRUCK_CONSTANTS.SUSPENSION_ATTACH_Y, 0.66]}
            geometry={geometries.coilSpringGeo}
            material={shockMat}
          />
          <mesh
            ref={rearSpringRightRef}
            position={[-TRUCK_CONSTANTS.WHEEL_BASE_HALF, TRUCK_CONSTANTS.SUSPENSION_ATTACH_Y, -0.66]}
            geometry={geometries.coilSpringGeo}
            material={shockMat}
          />
          <mesh
            ref={frontSpringLeftRef}
            position={[TRUCK_CONSTANTS.WHEEL_BASE_HALF, TRUCK_CONSTANTS.SUSPENSION_ATTACH_Y, 0.66]}
            geometry={geometries.coilSpringGeo}
            material={shockMat}
          />
          <mesh
            ref={frontSpringRightRef}
            position={[TRUCK_CONSTANTS.WHEEL_BASE_HALF, TRUCK_CONSTANTS.SUSPENSION_ATTACH_Y, -0.66]}
            geometry={geometries.coilSpringGeo}
            material={shockMat}
          />
          {/* Piggyback Shock Reservoir Canisters */}
          {[-TRUCK_CONSTANTS.WHEEL_BASE_HALF + 0.18, TRUCK_CONSTANTS.WHEEL_BASE_HALF - 0.18].map(
            (sx, i) => (
              <React.Fragment key={i}>
                <mesh position={[sx, -0.34, 0.68]} material={materials.shockGold}>
                  <cylinderGeometry args={[0.055, 0.055, 0.38, 10]} />
                </mesh>
                <mesh position={[sx, -0.34, -0.68]} material={materials.shockGold}>
                  <cylinderGeometry args={[0.055, 0.055, 0.38, 10]} />
                </mesh>
              </React.Fragment>
            )
          )}
        </group>

        {/* Rear Solid Axle + Telescoping Shock Pistons + Oversized Monster Wheels */}
        <group
          ref={rearAxleGroupRef}
          position={[-TRUCK_CONSTANTS.WHEEL_BASE_HALF, -0.95, 0]}
        >
          <mesh rotation={[Math.PI / 2, 0, 0]} material={materials.darkChassis} castShadow>
            <cylinderGeometry args={[0.115, 0.115, AXLE_HALF_Z * 2, 12]} />
          </mesh>
          <mesh material={materials.crimsonPaint}>
            <sphereGeometry args={[0.23, 12, 12]} />
          </mesh>
          <mesh position={[0, 0.44, 0.66]} material={materials.chrome}>
            <cylinderGeometry args={[0.048, 0.048, 0.9, 8]} />
          </mesh>
          <mesh position={[0, 0.44, -0.66]} material={materials.chrome}>
            <cylinderGeometry args={[0.048, 0.048, 0.9, 8]} />
          </mesh>
          {renderWheel(wheelRefs[0], AXLE_HALF_Z, 'rl')}
          {renderWheel(wheelRefs[1], -AXLE_HALF_Z, 'rr')}
        </group>

        {/* Front Solid Axle + Telescoping Shock Pistons + Oversized Monster Wheels */}
        <group
          ref={frontAxleGroupRef}
          position={[TRUCK_CONSTANTS.WHEEL_BASE_HALF, -0.95, 0]}
        >
          <mesh rotation={[Math.PI / 2, 0, 0]} material={materials.darkChassis} castShadow>
            <cylinderGeometry args={[0.115, 0.115, AXLE_HALF_Z * 2, 12]} />
          </mesh>
          <mesh material={materials.crimsonPaint}>
            <sphereGeometry args={[0.23, 12, 12]} />
          </mesh>
          <mesh position={[0, 0.44, 0.66]} material={materials.chrome}>
            <cylinderGeometry args={[0.048, 0.048, 0.9, 8]} />
          </mesh>
          <mesh position={[0, 0.44, -0.66]} material={materials.chrome}>
            <cylinderGeometry args={[0.048, 0.048, 0.9, 8]} />
          </mesh>
          {renderWheel(wheelRefs[2], AXLE_HALF_Z, 'fl')}
          {renderWheel(wheelRefs[3], -AXLE_HALF_Z, 'fr')}
        </group>
      </group>

      {/* Soft Contact Shadow Grounding beneath the Truck */}
      <mesh
        ref={contactShadowRef}
        position={[0, 0.03, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={materials.shadowMat}
      >
        <planeGeometry args={[1, 1]} />
      </mesh>
    </>
  );
};
