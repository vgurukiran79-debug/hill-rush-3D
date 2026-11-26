import type { CollectibleItem, SurfaceType, TerrainSample } from './types';

export type SegmentKind =
  | 'start'
  | 'rolling'
  | 'uphill'
  | 'downhill'
  | 'ramp'
  | 'gap'
  | 'rocky';

export interface TerrainSegment {
  index: number;
  kind: SegmentKind;
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
  slopeStart: number;
  slopeEnd: number;
  amp: number;
  freq: number;
  phase: number;
  surface: SurfaceType;
  // Gap-specific geometry (only when kind === 'gap')
  gapStart?: number;
  gapEnd?: number;
  gapFloorY?: number;
  rampPeakY?: number;
}

function hashSeed(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967295;
}

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function hermite(t: number, y0: number, y1: number, m0: number, m1: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * y0 + h10 * m0 + h01 * y1 + h11 * m1;
}

export class ProceduralTerrain {
  private segments: TerrainSegment[] = [];
  private collectibles: Map<number, CollectibleItem[]> = new Map();
  private nextCollectibleId = 1;
  private runSeed = 1337;
  private lastFuelX = 0;

  constructor(seed = 1337) {
    this.reset(seed);
  }

  public reset(seed = Math.floor(Math.random() * 100000) + 100): void {
    this.runSeed = seed;
    this.segments = [];
    this.collectibles.clear();
    this.nextCollectibleId = 1;
    this.lastFuelX = -16;

    // Backstop flat meadow behind start so camera never sees an open edge
    this.segments.push({
      index: 0,
      kind: 'start',
      xStart: -60,
      xEnd: 18,
      yStart: 0,
      yEnd: 0,
      slopeStart: 0,
      slopeEnd: 0.08,
      amp: 0,
      freq: 0,
      phase: 0,
      surface: 'grass',
    });

    this.ensureGeneratedTo(260);
  }

  private isGenerating = false;

  public ensureGeneratedTo(targetX: number): void {
    if (this.isGenerating) return;
    this.isGenerating = true;
    try {
      while (this.segments[this.segments.length - 1].xEnd < targetX) {
        this.generateNextSegment();
      }
    } finally {
      this.isGenerating = false;
    }
  }

  private generateNextSegment(): void {
    const prev = this.segments[this.segments.length - 1];
    const idx = prev.index + 1;
    const r1 = hashSeed(this.runSeed + idx * 31);
    const r2 = hashSeed(this.runSeed + idx * 73 + 17);
    const r3 = hashSeed(this.runSeed + idx * 127 + 53);

    const dist = Math.max(0, prev.xEnd);
    const difficulty = Math.min(1, dist / 950);

    // Choose segment kind with balanced pacing and zero back-to-back gaps
    let kind: SegmentKind = 'rolling';
    if (idx === 1) {
      kind = 'rolling';
    } else if (idx === 2) {
      kind = 'ramp';
    } else if (idx === 3) {
      kind = 'uphill';
    } else if (prev.kind === 'gap' || prev.kind === 'ramp') {
      kind = r1 < 0.55 ? 'rolling' : 'downhill';
    } else {
      const roll = r1;
      const gapChance = dist > 165 ? 0.14 + difficulty * 0.08 : 0;
      const rockyChance = dist > 110 ? 0.18 + difficulty * 0.08 : 0.08;
      if (roll < gapChance) {
        kind = 'gap';
      } else if (roll < gapChance + 0.2) {
        kind = 'ramp';
      } else if (roll < gapChance + 0.2 + rockyChance) {
        kind = 'rocky';
      } else if (roll < gapChance + 0.42 + rockyChance) {
        kind = 'uphill';
      } else if (roll < gapChance + 0.62 + rockyChance) {
        kind = 'downhill';
      } else {
        kind = 'rolling';
      }
    }

    const xStart = prev.xEnd;
    const yStart = prev.yEnd;
    const slopeStart = prev.slopeEnd;

    let length = 34;
    let yEnd = yStart;
    let slopeEnd = 0.04;
    let amp = 1.6;
    let freq = 2;
    let surface: SurfaceType = 'grass';
    let gapStart: number | undefined;
    let gapEnd: number | undefined;
    let gapFloorY: number | undefined;
    let rampPeakY: number | undefined;

    switch (kind) {
      case 'rolling': {
        length = 34 + r2 * 18;
        const deltaY = (r3 - 0.42) * (4.5 + difficulty * 3.5);
        yEnd = Math.max(-14, Math.min(55, yStart + deltaY));
        slopeEnd = (r2 - 0.45) * 0.22;
        amp = 1.35 + r3 * (1.6 + difficulty * 1.1);
        freq = 1 + Math.floor(r2 * 2);
        surface = r3 > 0.45 ? 'grass' : 'dirt';
        break;
      }
      case 'uphill': {
        length = 32 + r2 * 16;
        const climb = 6.5 + r3 * (5.5 + difficulty * 5.0);
        yEnd = Math.min(72, yStart + climb);
        slopeEnd = 0.18 + r2 * 0.12;
        amp = 0.9 + r3 * 1.0;
        freq = 2;
        surface = 'dirt';
        break;
      }
      case 'downhill': {
        length = 34 + r2 * 14;
        const drop = 6.0 + r3 * (5.5 + difficulty * 4.0);
        yEnd = Math.max(-18, yStart - drop);
        slopeEnd = 0.06;
        amp = 1.0 + r2 * 1.1;
        freq = 2;
        surface = r2 > 0.5 ? 'grass' : 'dirt';
        break;
      }
      case 'ramp': {
        length = 42;
        yEnd = Math.max(-12, yStart - 1.5 + (r3 - 0.5) * 3.0);
        slopeEnd = 0.05;
        amp = 3.2 + difficulty * 1.4; // Launch height
        freq = 1;
        surface = 'ramp';
        break;
      }
      case 'rocky': {
        length = 30 + r2 * 14;
        yEnd = Math.max(-14, Math.min(60, yStart + (r3 - 0.4) * 5.0));
        slopeEnd = 0.06;
        amp = 0.72 + difficulty * 0.32; // Bumpy rock undulations
        freq = 4 + Math.floor(r2 * 2);
        surface = 'rock';
        break;
      }
      case 'gap': {
        length = 46;
        const gapWidth = 8.4 + difficulty * 3.2; // Fair, jumpable with momentum/nitro
        gapStart = xStart + 18;
        gapEnd = gapStart + gapWidth;
        rampPeakY = yStart + 3.0 + difficulty * 0.8;
        gapFloorY = yStart - 9.5;
        yEnd = yStart - 1.8; // Slightly lower forgiving landing side
        slopeEnd = 0.04;
        amp = 0;
        freq = 0;
        surface = 'gap';
        break;
      }
      default:
        break;
    }

    const seg: TerrainSegment = {
      index: idx,
      kind,
      xStart,
      xEnd: xStart + length,
      yStart,
      yEnd,
      slopeStart,
      slopeEnd,
      amp,
      freq,
      phase: r2 * Math.PI * 2,
      surface,
      gapStart,
      gapEnd,
      gapFloorY,
      rampPeakY,
    };

    this.segments.push(seg);
    this.spawnCollectiblesForSegment(seg);
  }

  private spawnCollectiblesForSegment(seg: TerrainSegment): void {
    const items: CollectibleItem[] = [];
    const len = seg.xEnd - seg.xStart;

    // Place a fuel canister every ~76-85m on a safe drivable spot
    if (seg.xStart + len * 0.5 - this.lastFuelX >= 76 && seg.kind !== 'gap') {
      const fx = seg.xStart + len * 0.52;
      const fy = this.evalSegmentHeightAndSurface(seg, fx).y;
      items.push({
        id: this.nextCollectibleId++,
        type: 'fuel',
        x: fx,
        y: fy + 1.55,
        collected: false,
        value: 45,
      });
      this.lastFuelX = fx;
    } else if (seg.kind === 'gap' && seg.gapEnd !== undefined && seg.xEnd - this.lastFuelX >= 74) {
      const fx = Math.min(seg.xEnd - 2.5, seg.gapEnd + 6.5);
      const fy = this.evalSegmentHeightAndSurface(seg, fx).y;
      items.push({
        id: this.nextCollectibleId++,
        type: 'fuel',
        x: fx,
        y: fy + 1.55,
        collected: false,
        value: 45,
      });
      this.lastFuelX = fx;
    }

    // Spawn enticing coin trails and jump arcs
    if (seg.kind === 'gap' && seg.gapStart !== undefined && seg.gapEnd !== undefined && seg.rampPeakY !== undefined) {
      // High-flying coin arc directly over the canyon gap
      const midX = (seg.gapStart + seg.gapEnd) * 0.5;
      const count = 6;
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const cx = seg.gapStart - 1.5 + t * (seg.gapEnd - seg.gapStart + 3.0);
        const arcY = seg.rampPeakY + 1.7 + Math.sin(t * Math.PI) * 3.1;
        items.push({
          id: this.nextCollectibleId++,
          type: 'coin',
          x: cx,
          y: arcY,
          collected: false,
          value: 10,
        });
      }
      // Extra bonus apex coin
      items.push({
        id: this.nextCollectibleId++,
        type: 'coin',
        x: midX,
        y: seg.rampPeakY + 5.7,
        collected: false,
        value: 10,
      });
    } else if (seg.kind === 'ramp') {
      // Coin arc off the ramp crest
      const launchX = seg.xStart + len * 0.36;
      const launchY = this.evalSegmentHeightAndSurface(seg, launchX).y;
      const count = 6;
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const cx = Math.min(seg.xEnd - 1.5, launchX + 1.5 + t * 14.5);
        const groundY = this.evalSegmentHeightAndSurface(seg, cx).y;
        const arcY = Math.max(groundY + 1.5, launchY + 1.2 + Math.sin(t * Math.PI) * 3.8);
        items.push({
          id: this.nextCollectibleId++,
          type: 'coin',
          x: cx,
          y: arcY,
          collected: false,
          value: 10,
        });
      }
    } else {
      // Ground-hugging coin ribbon along hills & climbs
      const count = 5 + (seg.index % 3);
      const margin = 4.5;
      for (let i = 0; i < count; i++) {
        const t = i / Math.max(1, count - 1);
        const cx = seg.xStart + margin + t * (len - margin * 2);
        // Avoid overlapping a fuel canister placed nearby
        if (items.some((it) => it.type === 'fuel' && Math.abs(it.x - cx) < 2.8)) {
          continue;
        }
        const groundY = this.evalSegmentHeightAndSurface(seg, cx).y;
        items.push({
          id: this.nextCollectibleId++,
          type: 'coin',
          x: cx,
          y: groundY + 1.45,
          collected: false,
          value: 10,
        });
      }
    }

    this.collectibles.set(seg.index, items);
  }

  public getCollectiblesInRange(minX: number, maxX: number): CollectibleItem[] {
    const result: CollectibleItem[] = [];
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      if (seg.xEnd < minX) continue;
      if (seg.xStart > maxX) break;
      const list = this.collectibles.get(seg.index);
      if (list) {
        for (let j = 0; j < list.length; j++) {
          const item = list[j];
          if (!item.collected && item.x >= minX && item.x <= maxX) {
            result.push(item);
          }
        }
      }
    }
    return result;
  }

  private findSegment(x: number): TerrainSegment {
    if (x <= this.segments[0].xStart) return this.segments[0];
    this.ensureGeneratedTo(x + 90);

    // Binary search segments by xStart/xEnd
    let lo = 0;
    let hi = this.segments.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const seg = this.segments[mid];
      if (x < seg.xStart) {
        hi = mid - 1;
      } else if (x > seg.xEnd) {
        lo = mid + 1;
      } else {
        return seg;
      }
    }
    return this.segments[Math.min(this.segments.length - 1, Math.max(0, lo))];
  }

  private evalSegmentHeightAndSurface(
    seg: TerrainSegment,
    x: number
  ): { y: number; surface: SurfaceType; isGap: boolean; gapFloorY: number } {
    const len = seg.xEnd - seg.xStart;
    const t = Math.max(0, Math.min(1, (x - seg.xStart) / len));

    if (seg.kind === 'start') {
      // Flat start pad then smooth blend to slopeEnd near xEnd
      if (x < 8) {
        return { y: 0, surface: 'grass', isGap: false, gapFloorY: -12 };
      }
      const u = (x - 8) / (seg.xEnd - 8);
      const y = hermite(u, 0, 0, 0, seg.slopeEnd * (seg.xEnd - 8));
      return { y, surface: 'grass', isGap: false, gapFloorY: -12 };
    }

    if (seg.kind === 'gap' && seg.gapStart !== undefined && seg.gapEnd !== undefined && seg.rampPeakY !== undefined) {
      const floorY = seg.gapFloorY ?? seg.yStart - 9.5;
      if (x < seg.gapStart) {
        // Approach ramp launching upward cleanly
        const u = (x - seg.xStart) / (seg.gapStart - seg.xStart);
        const y = hermite(
          u,
          seg.yStart,
          seg.rampPeakY,
          seg.slopeStart * (seg.gapStart - seg.xStart),
          0.38 * (seg.gapStart - seg.xStart)
        );
        return {
          y,
          surface: u > 0.38 ? 'ramp' : 'dirt',
          isGap: false,
          gapFloorY: floorY,
        };
      }
      if (x <= seg.gapEnd) {
        // Canyon abyss with deep rocky canyon bed
        const u = (x - seg.gapStart) / (seg.gapEnd - seg.gapStart);
        const wallDrop = Math.sin(u * Math.PI);
        const bedY = floorY - wallDrop * 1.2;
        return {
          y: bedY,
          surface: 'gap',
          isGap: true,
          gapFloorY: floorY,
        };
      }
      // Landing deck on far side of canyon
      const landLen = seg.xEnd - seg.gapEnd;
      const u = (x - seg.gapEnd) / landLen;
      const landLipY = seg.yStart - 0.6;
      const y = hermite(
        u,
        landLipY,
        seg.yEnd,
        -0.22 * landLen,
        seg.slopeEnd * landLen
      );
      return {
        y,
        surface: u < 0.25 ? 'rock' : 'dirt',
        isGap: false,
        gapFloorY: floorY,
      };
    }

    if (seg.kind === 'ramp') {
      // Smooth approach -> kick ramp -> dramatic dip landing zone
      const base = hermite(t, seg.yStart, seg.yEnd, seg.slopeStart * len, seg.slopeEnd * len);
      let bump = 0;
      let surf: SurfaceType = 'dirt';
      if (t < 0.38) {
        const u = t / 0.38;
        bump = smoothstep(u) * seg.amp;
        if (u > 0.35) surf = 'ramp';
      } else if (t < 0.56) {
        const u = (t - 0.38) / 0.18;
        bump = (1 - smoothstep(u)) * seg.amp;
        surf = 'dirt';
      } else {
        surf = 'grass';
      }
      return { y: base + bump, surface: surf, isGap: false, gapFloorY: base - 12 };
    }

    // Standard Hermite spine + envelope-windowed harmonic undulation (preserves C1 continuity at boundaries!)
    const base = hermite(t, seg.yStart, seg.yEnd, seg.slopeStart * len, seg.slopeEnd * len);
    const envelope = Math.sin(t * Math.PI);
    const envSq = envelope * envelope;
    let wave = 0;
    if (seg.kind === 'rocky') {
      wave =
        Math.sin(t * Math.PI * 2 * seg.freq + seg.phase) * seg.amp * envSq +
        Math.sin(t * Math.PI * 5 * seg.freq) * (seg.amp * 0.28) * envSq;
    } else {
      wave = Math.sin(t * Math.PI * 2 * seg.freq + seg.phase) * seg.amp * envSq;
    }

    return {
      y: base + wave,
      surface: seg.surface,
      isGap: false,
      gapFloorY: base - 12,
    };
  }

  public sample(x: number): TerrainSample {
    const seg = this.findSegment(x);
    const center = this.evalSegmentHeightAndSurface(seg, x);

    const eps = 0.12;
    const prevSeg = x - eps < seg.xStart ? this.findSegment(x - eps) : seg;
    const nextSeg = x + eps > seg.xEnd ? this.findSegment(x + eps) : seg;
    const hL = this.evalSegmentHeightAndSurface(prevSeg, x - eps).y;
    const hR = this.evalSegmentHeightAndSurface(nextSeg, x + eps).y;

    let slope = (hR - hL) / (2 * eps);
    // Clamp numerical derivative right on vertical canyon wall edges so physics never spikes
    if (center.isGap) {
      slope = Math.max(-0.5, Math.min(0.5, slope));
    } else {
      slope = Math.max(-1.4, Math.min(1.4, slope));
    }

    const invLen = 1 / Math.hypot(1, slope);
    const normalX = -slope * invLen;
    const normalY = invLen;

    return {
      height: center.y,
      slope,
      normalX,
      normalY,
      surface: center.surface,
      isGap: center.isGap,
      gapFloorY: center.gapFloorY,
    };
  }
}
