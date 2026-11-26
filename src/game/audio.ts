import type { GameSettings, SurfaceType } from './types';

export class ProceduralAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;

  // Continuous engine nodes
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  // Continuous tire dirt noise nodes
  private tireNoise: AudioBufferSourceNode | null = null;
  private tireFilter: BiquadFilterNode | null = null;
  private tireGain: GainNode | null = null;

  // Continuous nitro jet nodes
  private nitroNoise: AudioBufferSourceNode | null = null;
  private nitroFilter: BiquadFilterNode | null = null;
  private nitroOsc: OscillatorNode | null = null;
  private nitroGain: GainNode | null = null;

  private noiseBuffer: AudioBuffer | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;

  private settings: GameSettings = {
    quality: 'high',
    masterVolume: 0.72,
    sfxMuted: false,
    musicEnabled: true,
  };
  private isUnlocked = false;
  private engineActive = false;

  public applySettings(next: GameSettings): void {
    this.settings = { ...next };
    this.syncVolumes();
    this.syncMusicLoop();
  }

  public unlock(): void {
    if (this.isUnlocked) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this.settings.sfxMuted ? 0 : this.settings.masterVolume;
      master.connect(ctx.destination);
      this.masterGain = master;

      const sfx = ctx.createGain();
      sfx.gain.value = 1;
      sfx.connect(master);
      this.sfxGain = sfx;

      const music = ctx.createGain();
      music.gain.value = this.settings.musicEnabled ? 0.16 : 0;
      music.connect(master);
      this.musicGain = music;

      // Create reusable 2-second procedural noise buffer
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const out = noiseBuf.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        out[i] = (lastOut + 0.08 * white) / 1.08;
        lastOut = out[i];
      }
      this.noiseBuffer = noiseBuf;

      this.setupContinuousLoops(ctx, sfx, noiseBuf);
      this.isUnlocked = true;
      this.syncVolumes();
      this.syncMusicLoop();
    } catch {
      // Gracefully disable audio if browser blocks context creation
    }
  }

  private setupContinuousLoops(
    ctx: AudioContext,
    sfxBus: GainNode,
    noiseBuf: AudioBuffer
  ): void {
    // 1. V8 Monster Truck Engine (dual detuned oscillators -> warm lowpass)
    const engGain = ctx.createGain();
    engGain.gain.value = 0.0001;
    const engFilter = ctx.createBiquadFilter();
    engFilter.type = 'lowpass';
    engFilter.frequency.value = 260;
    engFilter.Q.value = 2.6;

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 48;

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 24.5;

    osc1.connect(engFilter);
    osc2.connect(engFilter);
    engFilter.connect(engGain);
    engGain.connect(sfxBus);
    osc1.start();
    osc2.start();

    this.engineOsc1 = osc1;
    this.engineOsc2 = osc2;
    this.engineFilter = engFilter;
    this.engineGain = engGain;

    // 2. Tire / Dirt Surface Roll Noise
    const tireSrc = ctx.createBufferSource();
    tireSrc.buffer = noiseBuf;
    tireSrc.loop = true;
    const tireFilter = ctx.createBiquadFilter();
    tireFilter.type = 'bandpass';
    tireFilter.frequency.value = 340;
    tireFilter.Q.value = 1.2;
    const tireGain = ctx.createGain();
    tireGain.gain.value = 0.0001;

    tireSrc.connect(tireFilter);
    tireFilter.connect(tireGain);
    tireGain.connect(sfxBus);
    tireSrc.start();

    this.tireNoise = tireSrc;
    this.tireFilter = tireFilter;
    this.tireGain = tireGain;

    // 3. Nitro Jet Boost
    const nitroSrc = ctx.createBufferSource();
    nitroSrc.buffer = noiseBuf;
    nitroSrc.loop = true;
    const nitroFilter = ctx.createBiquadFilter();
    nitroFilter.type = 'bandpass';
    nitroFilter.frequency.value = 1150;
    nitroFilter.Q.value = 0.9;

    const nitroOsc = ctx.createOscillator();
    nitroOsc.type = 'sine';
    nitroOsc.frequency.value = 210;
    const nitroOscGain = ctx.createGain();
    nitroOscGain.gain.value = 0.25;

    const nitroGain = ctx.createGain();
    nitroGain.gain.value = 0.0001;

    nitroSrc.connect(nitroFilter);
    nitroFilter.connect(nitroGain);
    nitroOsc.connect(nitroOscGain);
    nitroOscGain.connect(nitroGain);
    nitroGain.connect(sfxBus);
    nitroSrc.start();
    nitroOsc.start();

    this.nitroNoise = nitroSrc;
    this.nitroFilter = nitroFilter;
    this.nitroOsc = nitroOsc;
    this.nitroGain = nitroGain;
  }

  private syncVolumes(): void {
    if (!this.ctx || !this.masterGain || !this.musicGain) return;
    const now = this.ctx.currentTime;
    const masterTarget = this.settings.sfxMuted ? 0 : this.settings.masterVolume;
    this.masterGain.gain.setTargetAtTime(masterTarget, now, 0.04);
    this.musicGain.gain.setTargetAtTime(
      this.settings.musicEnabled && !this.settings.sfxMuted ? 0.14 : 0,
      now,
      0.08
    );
  }

  private syncMusicLoop(): void {
    const shouldPlay =
      this.isUnlocked && this.settings.musicEnabled && !this.settings.sfxMuted;
    if (shouldPlay && this.musicTimer === null) {
      // Energetic upbeat alpine arcade synth bass + bright pluck groove (128 BPM 8th notes)
      const bassNotes = [110, 110, 146.83, 146.83, 130.81, 130.81, 164.81, 146.83];
      const leadNotes = [440, 523.25, 659.25, 587.33, 523.25, 659.25, 783.99, 659.25];
      this.musicTimer = window.setInterval(() => {
        if (!this.ctx || !this.musicGain || this.ctx.state !== 'running') return;
        const now = this.ctx.currentTime;
        const step = this.musicStep % 8;

        // Bass pulse
        const bOsc = this.ctx.createOscillator();
        const bGain = this.ctx.createGain();
        bOsc.type = 'triangle';
        bOsc.frequency.setValueAtTime(bassNotes[step], now);
        bGain.gain.setValueAtTime(0.28, now);
        bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
        bOsc.connect(bGain);
        bGain.connect(this.musicGain);
        bOsc.start(now);
        bOsc.stop(now + 0.22);

        // Bright arcade synth pluck on off-beats
        if (this.musicStep % 2 === 0 || step === 7) {
          const lOsc = this.ctx.createOscillator();
          const lGain = this.ctx.createGain();
          lOsc.type = 'sine';
          lOsc.frequency.setValueAtTime(leadNotes[step], now);
          lGain.gain.setValueAtTime(0.14, now);
          lGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
          lOsc.connect(lGain);
          lGain.connect(this.musicGain);
          lOsc.start(now);
          lOsc.stop(now + 0.17);
        }

        this.musicStep++;
      }, 234);
    } else if (!shouldPlay && this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  public setEngineActive(active: boolean): void {
    this.engineActive = active;
    if (!active && this.ctx && this.engineGain && this.tireGain && this.nitroGain) {
      const now = this.ctx.currentTime;
      this.engineGain.gain.setTargetAtTime(0.0001, now, 0.08);
      this.tireGain.gain.setTargetAtTime(0.0001, now, 0.06);
      this.nitroGain.gain.setTargetAtTime(0.0001, now, 0.06);
    }
  }

  public updateDriving(
    speed: number,
    throttle: boolean,
    nitro: boolean,
    grounded: boolean,
    surface: SurfaceType,
    crashed: boolean
  ): void {
    if (!this.isUnlocked || !this.ctx || !this.engineActive) return;
    if (!this.engineOsc1 || !this.engineOsc2 || !this.engineFilter || !this.engineGain) return;
    if (!this.tireFilter || !this.tireGain || !this.nitroGain || !this.nitroOsc || !this.nitroFilter)
      return;

    const now = this.ctx.currentTime;
    const absSpeed = Math.min(35, Math.abs(speed));

    // Engine RPM modulation
    if (crashed) {
      this.engineGain.gain.setTargetAtTime(0.0001, now, 0.12);
    } else {
      const baseFreq = 44 + absSpeed * 2.55 + (throttle ? 24 : 0) + (nitro ? 42 : 0);
      this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, 0.06);
      this.engineOsc2.frequency.setTargetAtTime(baseFreq * 0.505, now, 0.06);
      this.engineFilter.frequency.setTargetAtTime(
        220 + absSpeed * 28 + (throttle ? 280 : 0) + (nitro ? 650 : 0),
        now,
        0.07
      );
      this.engineGain.gain.setTargetAtTime(
        throttle || nitro ? 0.19 : 0.095,
        now,
        0.08
      );
    }

    // Tire dirt / rock rolling sound
    const tireTarget =
      !crashed && grounded && absSpeed > 1.5
        ? Math.min(0.18, (absSpeed / 26) * (surface === 'rock' ? 0.2 : surface === 'dirt' ? 0.16 : 0.1))
        : 0.0001;
    this.tireGain.gain.setTargetAtTime(tireTarget, now, 0.05);
    this.tireFilter.frequency.setTargetAtTime(
      surface === 'rock' ? 580 : surface === 'dirt' ? 390 : 250,
      now,
      0.06
    );

    // Nitro jet roar + turbine pitch rise
    const nitroTarget = !crashed && nitro ? 0.22 : 0.0001;
    this.nitroGain.gain.setTargetAtTime(nitroTarget, now, 0.04);
    this.nitroOsc.frequency.setTargetAtTime(nitro ? 290 + absSpeed * 9 : 180, now, 0.05);
    this.nitroFilter.frequency.setTargetAtTime(nitro ? 1550 : 850, now, 0.05);
  }

  public playCoin(): void {
    if (!this.ctx || !this.sfxGain || this.settings.sfxMuted) return;
    const now = this.ctx.currentTime;
    const notes = [987.77, 1318.51]; // B5 -> E6 arcade sparkle
    notes.forEach((freq, i) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const t = now + i * 0.055;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.19);
    });
  }

  public playFuel(): void {
    if (!this.ctx || !this.sfxGain || this.settings.sfxMuted) return;
    const now = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, i) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const t = now + i * 0.045;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.17);
    });
  }

  public playJump(): void {
    if (!this.ctx || !this.sfxGain || this.settings.sfxMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.16);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  public playLand(intensity: number): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || this.settings.sfxMuted) return;
    const now = this.ctx.currentTime;
    const strength = Math.max(0.2, Math.min(1, intensity));

    // Deep sub-thud
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(105 + strength * 40, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.18);
    gain.gain.setValueAtTime(0.32 * strength, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.21);

    // Dirt crunch transient
    const nSrc = this.ctx.createBufferSource();
    nSrc.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500 + strength * 700;
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.2 * strength, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    nSrc.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.sfxGain);
    nSrc.start(now);
    nSrc.stop(now + 0.15);
  }

  public playCrash(): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || this.settings.sfxMuted) return;
    const now = this.ctx.currentTime;

    // Explosive noise burst
    const nSrc = this.ctx.createBufferSource();
    nSrc.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1600, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + 0.55);
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.45, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    nSrc.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.sfxGain);
    nSrc.start(now);
    nSrc.stop(now + 0.62);

    // Sub impact boom
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(24, now + 0.45);
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.5);
  }

  public playUpgrade(): void {
    if (!this.ctx || !this.sfxGain || this.settings.sfxMuted) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const t = now + idx * 0.06;
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }

  public playStunt(): void {
    if (!this.ctx || !this.sfxGain || this.settings.sfxMuted) return;
    const now = this.ctx.currentTime;
    const notes = [587.33, 880, 1174.66];
    notes.forEach((f, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const t = now + idx * 0.055;
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.24, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.22);
    });
  }

  public playMissionComplete(): void {
    if (!this.ctx || !this.sfxGain || this.settings.sfxMuted) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    notes.forEach((f, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx === notes.length - 1 ? 'sine' : 'triangle';
      const t = now + idx * 0.065;
      const dur = idx === notes.length - 1 ? 0.42 : 0.24;
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.24, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    });
  }

  public playClick(): void {
    if (!this.ctx || !this.sfxGain || this.settings.sfxMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.05);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public dispose(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    try {
      this.engineOsc1?.stop();
      this.engineOsc2?.stop();
      this.tireNoise?.stop();
      this.nitroNoise?.stop();
      this.nitroOsc?.stop();
      void this.ctx?.close();
    } catch {
      // ignore cleanup errors
    }
    this.ctx = null;
    this.isUnlocked = false;
  }
}

export const soundEngine = new ProceduralAudioEngine();
