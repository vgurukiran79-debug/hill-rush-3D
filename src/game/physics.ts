import { ProceduralTerrain } from './terrain';
import type {
  InputState,
  PhysicsEvent,
  VehiclePhysicsState,
  VehicleStats,
} from './types';

export const TRUCK_CONSTANTS = {
  WHEEL_BASE_HALF: 1.42, // Distance from chassis center to each axle along local X
  WHEEL_RADIUS: 0.78,
  SUSPENSION_ATTACH_Y: -0.22, // Local Y where struts attach to chassis
  REST_STRUT_LEN: 0.94,
  MIN_STRUT_LEN: 0.42,
  MAX_STRUT_LEN: 1.06,
  GRAVITY: 25.5,
  CHASSIS_MASS: 1.0,
  CHASSIS_INERTIA: 1.55,
  START_X: 0,
};

export function createInitialVehicleState(terrain: ProceduralTerrain): VehiclePhysicsState {
  const startX = TRUCK_CONSTANTS.START_X;
  const g = terrain.sample(startX).height;
  const wheelY = g + TRUCK_CONSTANTS.WHEEL_RADIUS;
  const chassisY = wheelY + TRUCK_CONSTANTS.REST_STRUT_LEN - 0.14 - TRUCK_CONSTANTS.SUSPENSION_ATTACH_Y;

  return {
    x: startX,
    y: chassisY,
    vx: 0,
    vy: 0,
    angle: 0,
    angularVel: 0,
    wheelAngle: 0,
    rearCompression: 0.22,
    frontCompression: 0.22,
    rearGrounded: true,
    frontGrounded: true,
    rearWheelX: startX - TRUCK_CONSTANTS.WHEEL_BASE_HALF,
    rearWheelY: wheelY,
    frontWheelX: startX + TRUCK_CONSTANTS.WHEEL_BASE_HALF,
    frontWheelY: wheelY,
    rearSurface: 'grass',
    frontSurface: 'grass',
    airborneTime: 0,
    wasAirborne: false,
    airRotationAccum: 0,
    pendingBackflips: 0,
    pendingFrontflips: 0,
    runBackflips: 0,
    consecutiveBackflips: 0,
    bestConsecutiveBackflips: 0,
    runFrontflips: 0,
    runBigJumps: 0,
    runNitroSeconds: 0,
    runFuelPickups: 0,
    fuel: 100,
    nitro: 100,
    nitroActive: false,
    isBraking: false,
    wheelSlip: 0,
    nitroSurge: 0,
    impactFlash: 0,
    distance: 0,
    maxX: startX,
    runCoins: 0,
    crashed: false,
    crashReason: null,
    crashTimer: 0,
    roofContactTimer: 0,
    outOfFuelTimer: 0,
    timeScale: 1,
    cameraShake: 0,
    squash: 0,
  };
}

export class VehiclePhysicsEngine {
  private accumulator = 0;
  private readonly fixedDt = 1 / 120;
  private dustTimer = 0;
  private jumpCooldown = 0;

  public reset(): void {
    this.accumulator = 0;
    this.dustTimer = 0;
    this.jumpCooldown = 0;
  }

  public step(
    state: VehiclePhysicsState,
    rawDt: number,
    input: InputState,
    stats: VehicleStats,
    terrain: ProceduralTerrain,
    eventsOut: PhysicsEvent[]
  ): void {
    eventsOut.length = 0;
    const clampedDt = Math.min(rawDt, 0.05);

    // Smoothly recover slow-motion time scale after a major crash
    if (state.crashed) {
      state.crashTimer += clampedDt;
      if (state.crashTimer < 0.78) {
        state.timeScale = 0.24;
      } else {
        state.timeScale = Math.min(1, state.timeScale + clampedDt * 1.75);
      }
    } else {
      state.timeScale = 1;
    }

    // Decay camera shake, landing squash, nitro surge, and crash hit flash smoothly in real time
    state.cameraShake = Math.max(0, state.cameraShake - clampedDt * 2.5);
    state.squash = Math.max(0, state.squash - clampedDt * 4.2);
    state.nitroSurge = Math.max(0, state.nitroSurge - clampedDt * 2.8);
    state.impactFlash = Math.max(0, state.impactFlash - clampedDt * 3.1);

    this.accumulator += clampedDt * state.timeScale;
    let substeps = 0;
    const maxSubsteps = 8;

    while (this.accumulator >= this.fixedDt && substeps < maxSubsteps) {
      this.substep(state, this.fixedDt, input, stats, terrain, eventsOut);
      this.accumulator -= this.fixedDt;
      substeps++;
    }
    if (substeps === maxSubsteps) {
      this.accumulator = 0;
    }
  }

  private substep(
    s: VehiclePhysicsState,
    dt: number,
    input: InputState,
    stats: VehicleStats,
    terrain: ProceduralTerrain,
    eventsOut: PhysicsEvent[]
  ): void {
    const cosA = Math.cos(s.angle);
    const sinA = Math.sin(s.angle);

    // Local axes of chassis
    const rightX = cosA;
    const rightY = sinA;
    const upX = -sinA;
    const upY = cosA;

    // Can the driver apply engine power?
    const hasFuel = s.fuel > 0.05;
    const canDrive = !s.crashed && hasFuel;
    const gas = canDrive && input.accelerate ? 1 : 0;
    const brake = canDrive && input.brake ? 1 : 0;
    s.isBraking = brake > 0;

    // Nitro logic
    const wantsNitro = canDrive && input.nitro && s.nitro > 1.5;
    if (wantsNitro) {
      if (!s.nitroActive) {
        s.nitroSurge = 1.0;
        s.cameraShake = Math.max(s.cameraShake, 0.26);
      }
      s.nitroActive = true;
      s.nitro = Math.max(0, s.nitro - stats.nitroDrainRate * dt);
      s.runNitroSeconds += dt;
      s.cameraShake = Math.max(s.cameraShake, 0.16);
    } else {
      s.nitroActive = false;
      if (!s.crashed) {
        const regenBoost = !s.rearGrounded && !s.frontGrounded ? 1.45 : 1.0;
        s.nitro = Math.min(100, s.nitro + stats.nitroRegenRate * regenBoost * dt);
      }
    }

    // Fuel consumption
    if (!s.crashed) {
      const burn =
        stats.fuelDrainBase +
        (gas > 0 || brake > 0 ? stats.fuelDrainThrottle : 0) +
        (s.nitroActive ? 1.15 : 0);
      s.fuel = Math.max(0, s.fuel - burn * dt);
    }

    // Accumulate forces and torque on chassis
    let fx = 0;
    let fy = -TRUCK_CONSTANTS.GRAVITY * TRUCK_CONSTANTS.CHASSIS_MASS;
    let torque = 0;

    // Evaluate both suspension struts (rear = -WHEEL_BASE_HALF, front = +WHEEL_BASE_HALF)
    const wheelOffsets = [-TRUCK_CONSTANTS.WHEEL_BASE_HALF, TRUCK_CONSTANTS.WHEEL_BASE_HALF];
    let groundedCount = 0;
    let maxImpactSpeed = 0;
    let avgSlope = 0;

    for (let i = 0; i < 2; i++) {
      const localX = wheelOffsets[i];
      const localY = TRUCK_CONSTANTS.SUSPENSION_ATTACH_Y;

      // Attachment point in world coordinates
      const attachX = s.x + rightX * localX + upX * localY;
      const attachY = s.y + rightY * localX + upY * localY;

      // Strut points downward along chassis -up (blended slightly with world -Y for arcade stability)
      const strutDirX = -upX * 0.72;
      const strutDirY = -upY * 0.72 - 0.28;
      const strutNorm = Math.hypot(strutDirX, strutDirY) || 1;
      const dx = strutDirX / strutNorm;
      const dy = strutDirY / strutNorm;

      // Fully extended wheel hub position
      const extWheelX = attachX + dx * TRUCK_CONSTANTS.MAX_STRUT_LEN;
      const extWheelY = attachY + dy * TRUCK_CONSTANTS.MAX_STRUT_LEN;

      const ground = terrain.sample(extWheelX);
      const minHubY = ground.height + TRUCK_CONSTANTS.WHEEL_RADIUS;

      let grounded = false;
      let compression = 0;
      let wheelX = extWheelX;
      let wheelY = extWheelY;

      // Only engage wheel suspension if truck isn't completely upside down
      if (cosA > -0.2 && extWheelY <= minHubY) {
        grounded = true;
        groundedCount++;
        avgSlope += ground.slope;

        wheelY = minHubY;
        // Distance from attachment to constrained wheel hub
        const actualStrutLen = Math.max(
          TRUCK_CONSTANTS.MIN_STRUT_LEN,
          Math.hypot(wheelX - attachX, wheelY - attachY)
        );
        const deflection = Math.max(0, TRUCK_CONSTANTS.REST_STRUT_LEN - actualStrutLen);
        compression = Math.max(
          0,
          Math.min(
            1,
            (TRUCK_CONSTANTS.MAX_STRUT_LEN - actualStrutLen) /
              (TRUCK_CONSTANTS.MAX_STRUT_LEN - TRUCK_CONSTANTS.MIN_STRUT_LEN)
          )
        );

        // Velocity at wheel attachment point
        const rX = attachX - s.x;
        const rY = attachY - s.y;
        const velX = s.vx - s.angularVel * rY;
        const velY = s.vy + s.angularVel * rX;

        // Relative velocity along surface normal
        const vDotN = velX * ground.normalX + velY * ground.normalY;
        if (-vDotN > maxImpactSpeed) {
          maxImpactSpeed = -vDotN;
        }

        // Spring + Damper force along surface normal
        const springF = deflection * stats.springStiffness;
        const damperF = -vDotN * stats.springDamping;
        let normalForce = Math.max(0, springF + damperF);

        // Hard bottom-out safety force so chassis NEVER clips through terrain!
        const minAttachY = minHubY + TRUCK_CONSTANTS.MIN_STRUT_LEN * 0.85;
        if (attachY < minAttachY) {
          const pen = minAttachY - attachY;
          normalForce += pen * 420 + Math.max(0, -velY) * 28;
        }

        const nFx = ground.normalX * normalForce;
        const nFy = ground.normalY * normalForce;
        fx += nFx;
        fy += nFy;
        torque += rX * nFy - rY * nFx;

        // Tangent vector pointing forward uphill/downhill along ground
        const tanX = ground.normalY;
        const tanY = -ground.normalX;
        const speedAlongGround = s.vx * tanX + s.vy * tanY;

        // Traction / drive force
        const surfaceGrip =
          ground.surface === 'rock'
            ? 0.92
            : ground.surface === 'dirt'
            ? 0.96
            : ground.surface === 'ramp'
            ? 1.08
            : 1.0;

        let driveForce = 0;
        const maxSpd = s.nitroActive ? stats.maxSpeed * 1.42 : stats.maxSpeed;

        if (gas > 0) {
          if (speedAlongGround < maxSpd) {
            const speedFactor = 1 - Math.max(0, speedAlongGround / (maxSpd * 1.15)) * 0.42;
            driveForce += stats.engineTorque * 0.56 * surfaceGrip * speedFactor;
          }
          // Subtle arcade wheelie torque when accelerating hard on rear wheel
          if (i === 0) {
            torque += 1.45;
          }
        }
        if (brake > 0) {
          if (speedAlongGround > 1.0) {
            // Strong responsive braking
            driveForce -= stats.engineTorque * 0.82 * surfaceGrip;
          } else if (speedAlongGround > -stats.maxSpeed * 0.48) {
            // Reverse gear
            driveForce -= stats.engineTorque * 0.46 * surfaceGrip;
          }
        }
        if (s.nitroActive) {
          driveForce += stats.nitroThrust * 0.62;
        }

        // Rolling resistance when coasting
        if (gas === 0 && brake === 0 && !s.nitroActive) {
          driveForce -= speedAlongGround * (s.crashed ? 3.2 : 0.62);
        }

        const tFx = tanX * driveForce;
        const tFy = tanY * driveForce;
        fx += tFx;
        fy += tFy;
        torque += (rX * tFy - rY * tFx) * 0.22;
      }

      if (i === 0) {
        s.rearGrounded = grounded;
        s.rearCompression = compression;
        s.rearWheelX = wheelX;
        s.rearWheelY = wheelY;
        s.rearSurface = ground.surface;
      } else {
        s.frontGrounded = grounded;
        s.frontCompression = compression;
        s.frontWheelX = wheelX;
        s.frontWheelY = wheelY;
        s.frontSurface = ground.surface;
      }
    }

    const isGrounded = groundedCount > 0;
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);

    // Airborne dynamics & responsive arcade air tilt
    if (!isGrounded) {
      if (!s.wasAirborne && s.airborneTime === 0 && s.vy > 3.2 && this.jumpCooldown <= 0 && !s.crashed) {
        this.jumpCooldown = 0.55;
        eventsOut.push({
          type: 'jump',
          x: s.x,
          y: s.y - 1.2,
          speed: Math.hypot(s.vx, s.vy),
        });
      }
      s.wasAirborne = true;
      s.airborneTime += dt;

      if (!s.crashed) {
        // Track continuous airborne rotation for clean backflips & frontflips
        s.airRotationAccum += s.angularVel * dt;
        const MULTI_FLIP_WRAP = Math.PI * 1.92;
        if (s.airRotationAccum >= MULTI_FLIP_WRAP) {
          s.pendingBackflips += 1;
          s.airRotationAccum -= Math.PI * 2;
        } else if (s.airRotationAccum <= -MULTI_FLIP_WRAP) {
          s.pendingFrontflips += 1;
          s.airRotationAccum += Math.PI * 2;
        }

        // Responsive arcade air pitch: Accelerate pitches nose UP (backflip), Brake pitches nose DOWN (frontflip)
        if (gas > 0) {
          torque += stats.airControlTorque * 1.85;
        }
        if (brake > 0) {
          torque -= stats.airControlTorque * 1.9;
        }
        // Nitro in mid-air thrusts forward along chassis nose!
        if (s.nitroActive) {
          fx += rightX * stats.nitroThrust * 0.85;
          fy += Math.max(0, rightY) * stats.nitroThrust * 0.55 + 3.5;
        }
      }

      // Snappy angular damping when releasing air controls so landings feel crisp and controllable
      const airDamp = gas > 0 || brake > 0 ? 1.85 : 2.75;
      torque -= s.angularVel * airDamp;
    } else {
      // Landing event & stunt banking detection!
      if (s.wasAirborne && !s.crashed) {
        const landY = Math.min(s.rearWheelY, s.frontWheelY) - TRUCK_CONSTANTS.WHEEL_RADIUS;
        const LAND_FLIP_MIN = Math.PI * 1.42; // ~255 deg rotated over inverted & landed cleanly on wheels
        const landedBackflips =
          s.pendingBackflips + (s.airRotationAccum >= LAND_FLIP_MIN ? 1 : 0);
        const landedFrontflips =
          s.pendingFrontflips + (s.airRotationAccum <= -LAND_FLIP_MIN ? 1 : 0);

        if (s.airborneTime >= 0.85) {
          s.runBigJumps += 1;
        }

        if (landedBackflips > 0) {
          s.runBackflips += landedBackflips;
          s.consecutiveBackflips += landedBackflips;
          if (s.consecutiveBackflips > s.bestConsecutiveBackflips) {
            s.bestConsecutiveBackflips = s.consecutiveBackflips;
          }
          const bonusCoins = landedBackflips * 25;
          s.runCoins += bonusCoins;
          eventsOut.push({
            type: 'flip',
            x: s.x,
            y: landY + 1.8,
            direction: 'backflip',
            count: landedBackflips,
            consecutiveBackflips: s.consecutiveBackflips,
            bonusCoins,
          });
        } else if (landedFrontflips > 0) {
          s.runFrontflips += landedFrontflips;
          s.consecutiveBackflips = 0;
          const bonusCoins = landedFrontflips * 25;
          s.runCoins += bonusCoins;
          eventsOut.push({
            type: 'flip',
            x: s.x,
            y: landY + 1.8,
            direction: 'frontflip',
            count: landedFrontflips,
            consecutiveBackflips: 0,
            bonusCoins,
          });
        } else if (s.airborneTime > 0.78) {
          // A full jump landed without a backflip resets the consecutive backflip streak
          s.consecutiveBackflips = 0;
        }

        if (s.airborneTime > 0.3) {
          const intensity = Math.min(1, Math.max(0.18, maxImpactSpeed / 16));
          s.cameraShake = Math.max(s.cameraShake, intensity * 0.8);
          s.squash = Math.max(s.squash, intensity * 0.92);
          eventsOut.push({
            type: 'land',
            x: s.x,
            y: landY,
            intensity,
            slope: avgSlope / groundedCount,
            airTime: s.airborneTime,
          });
        }
      }
      s.wasAirborne = false;
      s.airborneTime = 0;
      s.airRotationAccum = 0;
      s.pendingBackflips = 0;
      s.pendingFrontflips = 0;

      // Grounded pitch damping prevents chassis oscillation jitter
      torque -= s.angularVel * 4.8;
    }

    // Aerodynamic drag
    fx -= s.vx * 0.14;
    fy -= s.vy * 0.06;

    // Semi-implicit Euler integration
    s.vx += (fx / TRUCK_CONSTANTS.CHASSIS_MASS) * dt;
    s.vy += (fy / TRUCK_CONSTANTS.CHASSIS_MASS) * dt;
    s.angularVel += (torque / TRUCK_CONSTANTS.CHASSIS_INERTIA) * dt;

    // Clamp extreme angular velocity for guaranteed stability
    s.angularVel = Math.max(-7.5, Math.min(7.5, s.angularVel));
    s.vx = Math.max(-18, Math.min(stats.maxSpeed * 1.65, s.vx));
    s.vy = Math.max(-34, Math.min(28, s.vy));

    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.angle += s.angularVel * dt;

    // Prevent driving backwards off the world edge
    if (s.x < -12) {
      s.x = -12;
      if (s.vx < 0) s.vx = 0;
    }

    // Keep chassis belly above terrain (hard anti-tunnel floor)
    const centerSample = terrain.sample(s.x);
    const minBellyY = centerSample.height + 0.72;
    if (s.y < minBellyY) {
      s.y = minBellyY;
      if (s.vy < 0) s.vy = -s.vy * 0.12;
      s.vx *= 0.96;
    }

    // Roof / rollcage collision check (detects true flips!)
    const roofLocalPts = [
      { lx: -0.45, ly: 1.48 },
      { lx: 0.45, ly: 1.42 },
    ];
    let roofHit = false;
    for (let r = 0; r < roofLocalPts.length; r++) {
      const pt = roofLocalPts[r];
      const wx = s.x + rightX * pt.lx + upX * pt.ly;
      const wy = s.y + rightY * pt.lx + upY * pt.ly;
      const gH = terrain.sample(wx).height;
      if (wy < gH + 0.12) {
        roofHit = true;
        // Push chassis out of terrain on roof impact
        const push = gH + 0.12 - wy;
        s.y += push;
        if (s.vy < 0) s.vy = -s.vy * 0.15;
        s.vx *= 0.92;
        s.angularVel *= 0.85;
      }
    }

    if (roofHit && cosA < 0.15) {
      s.roofContactTimer += dt;
      if (!s.crashed && s.roofContactTimer > 0.12) {
        this.triggerCrash(s, 'flipped', eventsOut);
      }
    } else {
      s.roofContactTimer = Math.max(0, s.roofContactTimer - dt * 2.5);
    }

    // Canyon gap fall crash detection
    if (!s.crashed && centerSample.isGap && s.y < centerSample.gapFloorY + 3.2) {
      this.triggerCrash(s, 'canyon', eventsOut);
    }

    // Out-of-fuel check (allow truck to coast to a stop first!)
    if (!s.crashed && s.fuel <= 0.01) {
      if (Math.abs(s.vx) < 1.0 && isGrounded) {
        s.outOfFuelTimer += dt;
        if (s.outOfFuelTimer > 1.35) {
          this.triggerCrash(s, 'fuel', eventsOut);
        }
      } else {
        s.outOfFuelTimer = 0;
      }
    }

    // Wheel rotation visual angle
    if (isGrounded) {
      s.wheelAngle -= (s.vx / TRUCK_CONSTANTS.WHEEL_RADIUS) * dt;
    } else {
      const airSpin = gas > 0 ? -15 : brake > 0 ? 11 : -s.vx * 0.7;
      s.wheelAngle += airSpin * dt;
    }

    // Distance tracking
    if (s.x > s.maxX) {
      s.maxX = s.x;
      s.distance = Math.floor(s.maxX);
    }

    // Collectible pickup check
    if (!s.crashed) {
      const nearby = terrain.getCollectiblesInRange(s.x - 3.5, s.x + 3.5);
      for (let c = 0; c < nearby.length; c++) {
        const item = nearby[c];
        const dxC = item.x - s.x;
        const dyC = item.y - s.y;
        if (dxC * dxC + dyC * dyC < 2.25 * 2.25) {
          item.collected = true;
          if (item.type === 'coin') {
            s.runCoins += item.value;
            eventsOut.push({ type: 'coin', x: item.x, y: item.y, value: item.value });
          } else {
            s.fuel = Math.min(100, s.fuel + item.value);
            s.runFuelPickups += 1;
            s.outOfFuelTimer = 0;
            eventsOut.push({ type: 'fuel', x: item.x, y: item.y });
          }
        }
      }
    }

    // Wheel dust & material-reactive roostertail cadence
    this.dustTimer += dt;
    const speedMag = Math.abs(s.vx);
    // Compute wheel slip factor (high when launching hard, climbing steeply, braking hard, or boosting)
    const slip =
      isGrounded && !s.crashed
        ? Math.min(
            1,
            (gas > 0 && speedMag < 10 ? 0.75 : 0) +
              (brake > 0 && speedMag > 5 ? 0.85 : 0) +
              (s.nitroActive ? 0.95 : 0) +
              Math.min(0.45, speedMag / 34)
          )
        : 0;
    s.wheelSlip = slip;

    // Subtle rocky terrain chassis vibration feedback
    if (isGrounded && speedMag > 6 && (s.rearSurface === 'rock' || s.frontSurface === 'rock')) {
      s.cameraShake = Math.max(s.cameraShake, Math.min(0.14, speedMag * 0.005));
    }

    const emitInterval = s.nitroActive
      ? 0.022
      : slip > 0.65
      ? 0.032
      : speedMag > 5
      ? 0.042
      : 0.09;

    if (this.dustTimer >= emitInterval && isGrounded && (speedMag > 1.8 || gas > 0 || s.nitroActive)) {
      this.dustTimer = 0;
      if (s.rearGrounded) {
        eventsOut.push({
          type: 'wheelDust',
          x: s.rearWheelX - 0.38,
          y: s.rearWheelY - TRUCK_CONSTANTS.WHEEL_RADIUS + 0.08,
          speed: speedMag + (gas > 0 ? 5.5 : 0) + (s.nitroActive ? 10 : 0),
          slip,
          surface: s.rearSurface,
          isRear: true,
        });
      }
      if (s.frontGrounded && (speedMag > 5.5 || brake > 0)) {
        eventsOut.push({
          type: 'wheelDust',
          x: s.frontWheelX - 0.25,
          y: s.frontWheelY - TRUCK_CONSTANTS.WHEEL_RADIUS + 0.08,
          speed: speedMag * 0.72 + (brake > 0 ? 4 : 0),
          slip: slip * 0.7,
          surface: s.frontSurface,
          isRear: false,
        });
      }
    }
  }

  private triggerCrash(
    s: VehiclePhysicsState,
    reason: 'flipped' | 'canyon' | 'fuel',
    eventsOut: PhysicsEvent[]
  ): void {
    s.crashed = true;
    s.crashReason = reason;
    s.crashTimer = 0;
    s.nitroActive = false;
    s.pendingBackflips = 0;
    s.pendingFrontflips = 0;
    s.consecutiveBackflips = 0;
    if (reason !== 'fuel') {
      s.cameraShake = 1.15;
      s.impactFlash = 1.0;
      s.timeScale = 0.24;
    }
    eventsOut.push({ type: 'crash', x: s.x, y: s.y, reason });
  }
}
