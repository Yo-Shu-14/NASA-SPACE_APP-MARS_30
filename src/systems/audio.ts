import { BuildingId, BuildingStatus, BuildingMalfunctionKind } from '../types/building';
import {
  BuildingEventImpact,
  CutsceneMood,
  CutsceneSpeaker,
  EventPhenomenon,
  EventSeverity,
} from '../types/event';

export type MusicTheme =
  | 'none'
  | 'main_menu'
  | 'intro_cutscene'
  | 'gameplay_ambient'
  | 'event_solar_storm'
  | 'event_sep_storm'
  | 'event_global_dust'
  | 'ending_victory'
  | 'ending_survived_failed'
  | 'ending_failure'
  | 'mission_report_pass'
  | 'mission_report_fail';

class SoundEffectsEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private noiseBuffer: AudioBuffer | null = null;
  private lastPlayedAt = new Map<string, number>();

  private musicGain: GainNode | null = null;
  private currentTheme: MusicTheme = 'none';
  private musicTimer: number | null = null;
  private musicStep = 0;

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.ctx && this.musicGain) {
      const now = this.ctx.currentTime;
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
      this.musicGain.gain.linearRampToValueAtTime(muted || this.currentTheme === 'none' ? 0.0001 : 0.72, now + 0.25);
    }
    if (muted) {
      this.stopMusicLoop();
    } else if (this.currentTheme !== 'none') {
      this.startMusicLoop();
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  /** Called on first user gesture so Main Menu music starts smoothly once Web Audio is unlocked. */
  public unlockAudio() {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx
        .resume()
        .then(() => {
          if (!this.muted && this.currentTheme !== 'none' && this.musicStep === 0) {
            this.startMusicLoop();
          }
        })
        .catch(() => undefined);
    } else if (this.currentTheme !== 'none' && (this.musicTimer === null || this.musicStep === 0)) {
      this.startMusicLoop();
    }
  }

  public setMusicTheme(theme: MusicTheme) {
    if (theme === this.currentTheme) return;
    this.currentTheme = theme;
    this.musicStep = 0;
    this.stopMusicLoop();

    if (this.ctx && this.musicGain) {
      const now = this.ctx.currentTime;
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setValueAtTime(Math.max(0.0001, this.musicGain.gain.value), now);
      this.musicGain.gain.linearRampToValueAtTime(
        theme === 'none' || this.muted ? 0.0001 : 0.75,
        now + 0.55
      );
    }

    if (theme !== 'none' && !this.muted) {
      this.startMusicLoop();
    }
  }

  private ensureMusicBus(ctx: AudioContext): GainNode {
    if (!this.musicGain) {
      this.musicGain = ctx.createGain();
      this.musicGain.gain.setValueAtTime(this.muted || this.currentTheme === 'none' ? 0.0001 : 0.75, ctx.currentTime);
      this.musicGain.connect(ctx.destination);
    }
    return this.musicGain;
  }

  private stopMusicLoop() {
    if (this.musicTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private startMusicLoop() {
    if (typeof window === 'undefined' || this.muted || this.currentTheme === 'none') return;
    this.stopMusicLoop();
    const stepMs =
      this.currentTheme === 'event_solar_storm' ||
      this.currentTheme === 'event_sep_storm' ||
      this.currentTheme === 'event_global_dust'
        ? 2100
        : this.currentTheme === 'gameplay_ambient'
        ? 3400
        : 2700;

    // Schedule first phrase gently after short settling delay
    this.playMusicPhrase();
    this.musicTimer = window.setInterval(() => {
      this.playMusicPhrase();
    }, stepMs);
  }

  private playMusicVoice(
    freq: number,
    duration: number,
    type: OscillatorType,
    peak: number,
    delay = 0
  ) {
    if (this.muted || this.currentTheme === 'none') return;
    const ctx = this.getContext();
    if (!ctx || ctx.state !== 'running') return;
    const bus = this.ensureMusicBus(ctx);

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(type === 'triangle' ? 1450 : 1200, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + Math.min(0.65, duration * 0.36));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    osc.start(now);
    osc.stop(now + duration + 0.08);
  }

  private playMusicNoise(
    duration: number,
    centerFreq: number,
    q: number,
    peak: number,
    delay = 0
  ) {
    if (this.muted || this.currentTheme === 'none') return;
    const ctx = this.getContext();
    if (!ctx || ctx.state !== 'running') return;
    const bus = this.ensureMusicBus(ctx);

    const now = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(centerFreq, now);
    filter.Q.setValueAtTime(q, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + duration * 0.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    src.start(now);
    src.stop(now + duration + 0.06);
  }

  private playMusicPhrase() {
    if (this.muted || this.currentTheme === 'none') return;
    const ctx = this.getContext();
    if (!ctx || ctx.state !== 'running') return;

    const step = this.musicStep++;
    const bar = step % 4;
    const alt = Math.floor(step / 4) % 2 === 1;

    switch (this.currentTheme) {
      case 'main_menu': {
        // Serene Martian horizon pad (D sus2 -> A add9 -> G maj7 -> D/F#)
        const chords: number[][] = [
          [146.83, 220.0, 329.63],
          [110.0, 164.81, 246.94],
          [196.0, 293.66, 369.99],
          [185.0, 293.66, 440.0],
        ];
        const bellNotes = alt
          ? [587.33, 659.25, 587.33, 440.0]
          : [440.0, 587.33, 493.88, 659.25];
        const c = chords[bar];
        this.playMusicVoice(c[0], 2.9, 'sine', 0.022, 0);
        this.playMusicVoice(c[1], 2.7, 'sine', 0.016, 0.15);
        this.playMusicVoice(c[2], 2.4, 'triangle', 0.011, 0.35);
        this.playMusicVoice(bellNotes[bar], 1.5, 'sine', 0.012, 0.95);
        break;
      }

      case 'intro_cutscene': {
        // Wonder & departure orbital swell (C -> G -> Am -> F)
        const roots = [130.81, 196.0, 220.0, 174.61];
        const fifths = [261.63, 293.66, 329.63, 261.63];
        const highs = alt
          ? [523.25, 587.33, 659.25, 523.25]
          : [392.0, 440.0, 493.88, 440.0];
        this.playMusicVoice(roots[bar], 2.8, 'sine', 0.024, 0);
        this.playMusicVoice(fifths[bar], 2.5, 'triangle', 0.013, 0.25);
        this.playMusicVoice(highs[bar], 1.7, 'sine', 0.011, 1.0);
        break;
      }

      case 'gameplay_ambient': {
        // Soft, meditative Jezero horizon cycle (8-bar F Lydian / D Dorian drift)
        const cycle = step % 8;
        const pads: number[][] = [
          [174.61, 261.63, 392.0], // Fadd9
          [146.83, 220.0, 329.63], // Dm9
          [130.81, 196.0, 329.63], // Cmaj7
          [196.0, 293.66, 440.0], // Gsus2
          [174.61, 261.63, 440.0], // Fmaj7
          [164.81, 246.94, 392.0], // Em7
          [146.83, 220.0, 349.23], // Dm7
          [130.81, 220.0, 293.66], // C6/9
        ];
        const chimes = [523.25, 659.25, 587.33, 440.0, 659.25, 783.99, 587.33, 523.25];
        const c = pads[cycle];
        this.playMusicVoice(c[0], 3.7, 'sine', 0.015, 0);
        this.playMusicVoice(c[1], 3.4, 'sine', 0.01, 0.22);
        this.playMusicVoice(c[2], 3.1, 'triangle', 0.007, 0.5);
        // Play delicate crystalline note only on alternating phrases to keep it airy & non-repetitive
        if (cycle % 2 === 0 || step % 3 === 0) {
          this.playMusicVoice(chimes[cycle], 1.8, 'sine', 0.0075, 1.35);
        }
        break;
      }

      case 'event_solar_storm': {
        // Shimmering CME electromagnetic tension (F#m -> D -> E -> C#m)
        const bass = [185.0, 146.83, 164.81, 138.59];
        const shimmer = alt
          ? [554.37, 587.33, 659.25, 493.88]
          : [440.0, 493.88, 554.37, 440.0];
        this.playMusicVoice(bass[bar], 2.2, 'triangle', 0.02, 0);
        this.playMusicVoice(bass[bar] * 1.5, 2.0, 'sine', 0.014, 0.15);
        this.playMusicVoice(shimmer[bar], 0.9, 'sine', 0.013, 0.55);
        this.playMusicVoice(shimmer[(bar + 1) % 4], 0.85, 'sine', 0.01, 1.25);
        break;
      }

      case 'event_sep_storm': {
        // Crisp cosmic-ray spark arpeggios (Em -> C -> D -> Bm)
        const bass = [164.81, 130.81, 146.83, 123.47];
        const spark = alt
          ? [659.25, 783.99, 587.33, 739.99]
          : [493.88, 523.25, 587.33, 659.25];
        this.playMusicVoice(bass[bar], 2.1, 'sine', 0.022, 0);
        this.playMusicVoice(spark[bar], 0.6, 'triangle', 0.012, 0.2);
        this.playMusicVoice(spark[bar] * 1.25, 0.55, 'sine', 0.01, 0.8);
        this.playMusicVoice(spark[(bar + 2) % 4], 0.65, 'sine', 0.01, 1.45);
        break;
      }

      case 'event_global_dust': {
        // Sweeping planetary dust gale wind + solemn low fifths (Dm -> Bb -> A -> Dm)
        const bass = [146.83, 116.54, 110.0, 146.83];
        this.playMusicNoise(2.15, alt ? 520 : 390, 1.1, 0.014, 0);
        this.playMusicVoice(bass[bar], 2.2, 'triangle', 0.018, 0);
        this.playMusicVoice(bass[bar] * 1.5, 2.0, 'sine', 0.014, 0.25);
        this.playMusicVoice(bass[bar] * 2.0, 1.3, 'sine', 0.009, 0.9);
        break;
      }

      case 'ending_victory': {
        // Warm hopeful Martian dawn progression (G -> D -> Em -> C)
        const chords: number[][] = [
          [196.0, 293.66, 392.0],
          [146.83, 220.0, 369.99],
          [164.81, 246.94, 392.0],
          [130.81, 261.63, 329.63],
        ];
        const melody = alt
          ? [587.33, 739.99, 783.99, 659.25]
          : [493.88, 587.33, 659.25, 523.25];
        const c = chords[bar];
        this.playMusicVoice(c[0], 2.8, 'sine', 0.024, 0);
        this.playMusicVoice(c[1], 2.6, 'sine', 0.016, 0.12);
        this.playMusicVoice(c[2], 2.4, 'triangle', 0.012, 0.25);
        this.playMusicVoice(melody[bar], 1.6, 'sine', 0.015, 0.85);
        break;
      }

      case 'ending_survived_failed': {
        // Bittersweet twilight resolution (Am -> F -> Dm -> E)
        const chords: number[][] = [
          [220.0, 261.63, 329.63],
          [174.61, 261.63, 349.23],
          [146.83, 220.0, 349.23],
          [164.81, 246.94, 329.63],
        ];
        const c = chords[bar];
        this.playMusicVoice(c[0], 2.8, 'sine', 0.022, 0);
        this.playMusicVoice(c[1], 2.5, 'sine', 0.014, 0.2);
        this.playMusicVoice(c[2], 2.2, 'sine', 0.012, 0.4);
        break;
      }

      case 'ending_failure': {
        // Calm respectful farewell ambient bed (Dm -> C -> Bb -> Am)
        const roots = [146.83, 130.81, 116.54, 110.0];
        const upper = [220.0, 196.0, 174.61, 164.81];
        this.playMusicVoice(roots[bar], 2.9, 'sine', 0.022, 0);
        this.playMusicVoice(upper[bar], 2.6, 'sine', 0.014, 0.22);
        this.playMusicVoice(upper[bar] * 1.5, 1.9, 'sine', 0.008, 0.9);
        break;
      }

      case 'mission_report_pass': {
        // Gentle celebratory reflection pad (Cmaj7 -> Gmaj7)
        const chords: number[][] = [
          [130.81, 261.63, 329.63, 493.88],
          [196.0, 293.66, 369.99, 493.88],
          [174.61, 261.63, 329.63, 440.0],
          [196.0, 246.94, 392.0, 587.33],
        ];
        const c = chords[bar];
        this.playMusicVoice(c[0], 2.8, 'sine', 0.02, 0);
        this.playMusicVoice(c[1], 2.6, 'sine', 0.014, 0.15);
        this.playMusicVoice(c[2], 2.4, 'sine', 0.012, 0.3);
        this.playMusicVoice(c[3], 1.8, 'sine', 0.01, alt ? 1.1 : 0.75);
        break;
      }

      case 'mission_report_fail': {
        // Quiet reflective debrief pad (Am7 -> Fmaj7 -> Dm7 -> Em7)
        const chords: number[][] = [
          [110.0, 220.0, 261.63, 392.0],
          [174.61, 261.63, 349.23, 440.0],
          [146.83, 220.0, 261.63, 329.63],
          [164.81, 246.94, 293.66, 392.0],
        ];
        const c = chords[bar];
        this.playMusicVoice(c[0], 2.9, 'sine', 0.02, 0);
        this.playMusicVoice(c[1], 2.6, 'sine', 0.013, 0.2);
        this.playMusicVoice(c[2], 2.2, 'sine', 0.01, 0.45);
        this.playMusicVoice(c[3], 1.6, 'sine', 0.008, 1.0);
        break;
      }
    }
  }

  private canPlay(key: string, cooldownMs: number): boolean {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const prev = this.lastPlayedAt.get(key) ?? 0;
    if (now - prev < cooldownMs) return false;
    this.lastPlayedAt.set(key, now);
    return true;
  }

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const length = ctx.sampleRate * 1.5;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      // Soft pink-ish filtered noise for natural air/wind/machinery hiss
      data[i] = (lastOut + 0.06 * white) / 1.06;
      lastOut = data[i];
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'triangle',
    gainPeak = 0.08,
    delay = 0,
    endFreq?: number
  ) {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(24, endFreq), now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainPeak), now + Math.min(0.025, duration * 0.35));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  private playFilteredNoise(
    duration: number,
    filterType: BiquadFilterType,
    centerFreq: number,
    q: number,
    gainPeak: number,
    delay = 0,
    endFreq?: number
  ) {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(centerFreq, now);
    if (endFreq !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + duration);
    }
    filter.Q.setValueAtTime(q, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainPeak, now + Math.min(0.08, duration * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + duration + 0.04);
  }

  // --- Core UI & Interaction Feedback ---
  public playSelect() {
    this.playTone(480, 0.07, 'triangle', 0.055, 0, 520);
  }

  public playTick() {
    this.playTone(620, 0.05, 'sine', 0.05);
  }

  public playError() {
    this.playTone(220, 0.12, 'triangle', 0.055, 0, 175);
  }

  public playWorkStart(taskKind: 'restore' | 'repair' | 'clean' | 'plant' | 'harvest') {
    if (!this.canPlay('work_start', 200)) return;
    if (taskKind === 'clean') {
      this.playFilteredNoise(0.22, 'bandpass', 1400, 1.8, 0.045, 0, 2200);
      this.playTone(540, 0.08, 'sine', 0.04, 0.04, 680);
    } else if (taskKind === 'plant') {
      this.playFilteredNoise(0.18, 'lowpass', 700, 1.0, 0.04);
      this.playTone(392, 0.09, 'sine', 0.05, 0.05, 494);
    } else if (taskKind === 'harvest') {
      this.playTone(440, 0.08, 'triangle', 0.05, 0, 554);
    } else {
      // Metallic wrench / boot clink
      this.playTone(280, 0.06, 'square', 0.025, 0, 190);
      this.playTone(520, 0.08, 'triangle', 0.045, 0.04);
    }
  }

  public playRepair() {
    this.playTone(392, 0.09, 'triangle', 0.075, 0);
    this.playTone(523.25, 0.11, 'triangle', 0.075, 0.07);
    this.playTone(659.25, 0.16, 'sine', 0.08, 0.14);
    this.playTone(783.99, 0.14, 'sine', 0.045, 0.22);
  }

  public playPlantSeeds() {
    this.playFilteredNoise(0.2, 'bandpass', 950, 2.2, 0.035, 0, 1300);
    this.playTone(440, 0.1, 'sine', 0.055, 0.05);
    this.playTone(554.37, 0.14, 'sine', 0.055, 0.12);
  }

  public playHarvest() {
    this.playTone(523.25, 0.09, 'sine', 0.075, 0);
    this.playTone(659.25, 0.09, 'sine', 0.075, 0.06);
    this.playTone(783.99, 0.16, 'sine', 0.085, 0.12);
  }

  public playShelterToggle(entering: boolean) {
    if (entering) {
      // Heavy airlock seal + downward pressure lock
      this.playFilteredNoise(0.24, 'lowpass', 650, 1.4, 0.05, 0, 220);
      this.playTone(340, 0.12, 'triangle', 0.06, 0.04, 190);
      this.playTone(480, 0.09, 'sine', 0.045, 0.14);
    } else {
      // Airlock unseal + upward relief
      this.playFilteredNoise(0.22, 'bandpass', 1100, 1.5, 0.04, 0, 1800);
      this.playTone(320, 0.1, 'triangle', 0.055, 0.04, 480);
    }
  }

  public playTutorialStepComplete() {
    if (!this.canPlay('tutorial_step', 350)) return;
    this.playTone(587.33, 0.09, 'sine', 0.06, 0);
    this.playTone(880, 0.15, 'sine', 0.065, 0.075);
  }

  public playDecisionChosen() {
    this.playTone(440, 0.08, 'triangle', 0.055, 0);
    this.playTone(587.33, 0.13, 'sine', 0.065, 0.07);
  }

  public playEndDay() {
    this.playTone(330, 0.13, 'sine', 0.065, 0);
    this.playTone(440, 0.18, 'sine', 0.065, 0.1);
  }

  public playAlert() {
    if (!this.canPlay('alert', 450)) return;
    this.playTone(340, 0.12, 'sawtooth', 0.04, 0, 290);
    this.playTone(255, 0.16, 'sawtooth', 0.04, 0.13, 220);
  }

  public playVictory() {
    this.playTone(523.25, 0.12, 'triangle', 0.075, 0);
    this.playTone(659.25, 0.12, 'triangle', 0.075, 0.1);
    this.playTone(783.99, 0.14, 'triangle', 0.075, 0.2);
    this.playTone(1046.5, 0.28, 'sine', 0.085, 0.32);
  }

  // --- GIL AI Robotic Voice & Activation Cues ---
  public playGilActivate() {
    if (!this.canPlay('gil_activate', 450)) return;
    this.playTone(680, 0.05, 'sine', 0.045, 0, 960);
    this.playTone(1040, 0.07, 'triangle', 0.04, 0.05, 1280);
  }

  public playGilChirp(
    emotion: 'happy' | 'excited' | 'surprised' | 'worried' | 'concerned' | 'relieved' | 'calm' | 'alert' | 'determined' = 'happy'
  ) {
    if (!this.canPlay('gil_chirp', 550)) return;
    if (emotion === 'excited' || emotion === 'happy' || emotion === 'relieved') {
      this.playTone(760, 0.055, 'sine', 0.04, 0, 920);
      this.playTone(1060, 0.065, 'sine', 0.042, 0.055, 1220);
      if (emotion === 'excited') {
        this.playTone(1360, 0.08, 'triangle', 0.035, 0.115, 1480);
      }
    } else if (emotion === 'surprised') {
      this.playTone(580, 0.065, 'triangle', 0.045, 0, 1140);
      this.playTone(1240, 0.07, 'sine', 0.035, 0.07);
    } else if (emotion === 'alert' || emotion === 'worried') {
      this.playTone(620, 0.07, 'triangle', 0.04, 0, 480);
      this.playTone(460, 0.09, 'sine', 0.042, 0.075, 370);
    } else {
      // calm / determined / concerned
      this.playTone(640, 0.055, 'sine', 0.038, 0, 740);
      this.playTone(820, 0.07, 'sine', 0.035, 0.06, 780);
    }
  }

  // --- Broken vs Operational Infrastructure Audio Signatures ---
  public playBrokenBuzz(severe = false) {
    if (!this.canPlay('broken_buzz', 500)) return;
    // Electrical 110Hz buzz + subtle spark crackle
    this.playTone(112, 0.19, 'sawtooth', severe ? 0.032 : 0.022, 0, 92);
    this.playFilteredNoise(0.11, 'bandpass', 2800, 3.2, severe ? 0.038 : 0.024, 0.03, 1600);
    if (severe) {
      this.playTone(540, 0.07, 'square', 0.018, 0.12, 420);
    }
  }

  public playMechanicalClank(severe = false) {
    if (!this.canPlay('mech_clank', 500)) return;
    // Muted mechanical clunk + air/valve hiss
    this.playTone(155, 0.09, 'triangle', 0.05, 0, 88);
    this.playTone(115, 0.12, 'sawtooth', 0.02, 0.06, 72);
    this.playFilteredNoise(0.18, 'highpass', 1700, 1.2, severe ? 0.035 : 0.022, 0.05);
  }

  public playWarningSignal() {
    if (!this.canPlay('warn_signal', 800)) return;
    this.playTone(840, 0.08, 'sine', 0.035, 0);
    this.playTone(620, 0.11, 'sine', 0.032, 0.09);
  }

  public playOperationalHum(buildingId: BuildingId) {
    if (!this.canPlay(`op_hum_${buildingId}`, 600)) return;
    switch (buildingId) {
      case 'solar_panels':
      case 'energy_storage':
        // Clean electric inverter harmonic swell
        this.playTone(220, 0.22, 'sine', 0.032, 0, 240);
        this.playTone(440, 0.2, 'sine', 0.022, 0.02, 460);
        break;
      case 'oxygen_generator':
      case 'oxygen_storage':
        // Soft steady air-scrubber flow
        this.playFilteredNoise(0.26, 'bandpass', 900, 1.4, 0.026, 0, 1150);
        this.playTone(330, 0.18, 'sine', 0.025, 0.03);
        break;
      case 'water_recycling':
      case 'water_storage':
        // Liquid droplet shimmer + gentle pump hum
        this.playTone(520, 0.07, 'sine', 0.036, 0, 790);
        this.playTone(185, 0.22, 'sine', 0.024, 0.04, 195);
        break;
      case 'greenhouse':
        // Warm organic chime
        this.playTone(440, 0.14, 'sine', 0.028, 0);
        this.playTone(554.37, 0.16, 'sine', 0.026, 0.05);
        break;
      case 'radiation_shelter':
      case 'main_habitat':
      case 'maintenance_facility':
      default:
        // Steady habitat relay + warm cabin tone
        this.playTone(260, 0.18, 'sine', 0.028, 0, 270);
        this.playTone(392, 0.14, 'triangle', 0.02, 0.04);
        break;
    }
  }

  public playBuildingInspectCue(params: {
    buildingId: BuildingId;
    status: BuildingStatus;
    malfunctionKind?: BuildingMalfunctionKind;
    dustLevel?: number;
    frostLevel?: number;
    locked?: boolean;
  }) {
    if (params.locked) {
      this.playError();
      return;
    }

    const isElectricalBuilding =
      params.buildingId === 'solar_panels' ||
      params.buildingId === 'energy_storage' ||
      params.buildingId === 'maintenance_facility';

    const hasFault =
      params.status === 'inactive' ||
      params.status === 'damaged' ||
      Boolean(params.malfunctionKind) ||
      (params.dustLevel ?? 0) >= 45 ||
      (params.frostLevel ?? 0) >= 25;

    if (hasFault) {
      const severe = params.status === 'inactive';
      if (isElectricalBuilding || params.malfunctionKind === 'electrical' || params.malfunctionKind === 'electronic') {
        this.playBrokenBuzz(severe);
      } else {
        this.playMechanicalClank(severe);
      }
      if (severe) {
        this.playWarningSignal();
      }
      return;
    }

    this.playOperationalHum(params.buildingId);
  }

  // --- Environmental & Ambient Outpost Cues ---
  public playEnvironmentEventCue(phenomenon: EventPhenomenon) {
    if (!this.canPlay(`env_${phenomenon}`, 1100)) return;
    switch (phenomenon) {
      case 'marsquake':
        // Deep tectonic thump + sub-bass ground shudder + stone crack
        this.playTone(62, 0.5, 'sawtooth', 0.056, 0, 34);
        this.playFilteredNoise(0.46, 'lowpass', 260, 1.3, 0.068, 0, 105);
        this.playTone(108, 0.16, 'triangle', 0.045, 0.08, 58);
        break;
      case 'dust_devils':
        // Swirling localized dust vortex whoosh
        this.playFilteredNoise(0.55, 'bandpass', 480, 1.8, 0.054, 0, 1080);
        this.playTone(300, 0.22, 'triangle', 0.028, 0.05, 440);
        break;
      case 'global_dust_storm':
        // Heavy planetary gale roar + sandblast hiss
        this.playFilteredNoise(0.75, 'bandpass', 360, 1.15, 0.068, 0, 740);
        this.playTone(92, 0.34, 'sawtooth', 0.036, 0.03, 66);
        break;
      case 'water_ice_clouds':
        // High chill frost breeze + crystalline bell shimmer
        this.playFilteredNoise(0.36, 'bandpass', 1550, 2.1, 0.028, 0, 920);
        this.playTone(1046.5, 0.16, 'sine', 0.038, 0, 1396.91);
        this.playTone(1567.98, 0.2, 'sine', 0.03, 0.08, 1244.51);
        break;
      case 'solar_flare_xray_uv':
        // Sweeping X-ray plasma shimmer + UV arc
        this.playTone(620, 0.16, 'sine', 0.042, 0, 1180);
        this.playTone(460, 0.2, 'triangle', 0.032, 0.08, 720);
        break;
      case 'solar_storm_response':
        // Deep geomagnetic aurora swell + magnetic harmonic
        this.playTone(130.81, 0.32, 'triangle', 0.045, 0, 98);
        this.playTone(493.88, 0.22, 'sine', 0.038, 0.05, 659.25);
        this.playFilteredNoise(0.24, 'bandpass', 1650, 2.2, 0.024, 0.08, 900);
        break;
      case 'solar_energetic_particles':
        // Rapid high-energy particle streak + static snap
        this.playTone(980, 0.09, 'triangle', 0.038, 0, 1520);
        this.playFilteredNoise(0.18, 'bandpass', 2600, 2.8, 0.034, 0.04, 1300);
        this.playTone(680, 0.14, 'sine', 0.032, 0.1, 440);
        break;
      case 'secondary_neutron_cascades':
        // Geiger dosimeter scatter burst + cosmic impact ping
        this.playTone(1320, 0.045, 'triangle', 0.036, 0, 1680);
        this.playTone(1560, 0.045, 'triangle', 0.032, 0.07, 1020);
        this.playTone(280, 0.15, 'sawtooth', 0.024, 0.09, 210);
        break;
    }
  }

  /** Periodic atmospheric hazard pulse while a live event animation plays out in Jezero. */
  public playEventLoopPulse(eventId: string) {
    if (!this.canPlay(`evt_loop_${eventId}`, 2350)) return;
    switch (eventId) {
      case 'marsquake':
        // Intermittent subterranean aftershock rumble + gravel settle
        this.playTone(58, 0.48, 'sawtooth', 0.038, 0, 36);
        this.playFilteredNoise(0.42, 'lowpass', 220, 1.35, 0.048, 0.04, 95);
        break;
      case 'dust_devils':
        // Gusting vortex wind swirl passing over panels
        this.playFilteredNoise(0.68, 'bandpass', 430, 1.65, 0.04, 0, 980);
        this.playTone(240, 0.28, 'sine', 0.02, 0.06, 360);
        break;
      case 'global_dust_storm':
        // Heavy roaring storm gust + distant static crackle
        this.playFilteredNoise(0.95, 'bandpass', 340, 1.1, 0.058, 0, 690);
        this.playTone(86, 0.44, 'sawtooth', 0.028, 0.06, 68);
        this.playFilteredNoise(0.14, 'bandpass', 2400, 2.4, 0.024, 0.35, 1100);
        break;
      case 'water_ice_cloud_formation':
        // Cold cryo breeze + delicate frost ice chime
        this.playFilteredNoise(0.55, 'bandpass', 1500, 1.9, 0.022, 0, 880);
        this.playTone(1174.66, 0.14, 'sine', 0.024, 0.08, 1396.91);
        this.playTone(1567.98, 0.18, 'sine', 0.02, 0.18, 1480);
        break;
      case 'secondary_neutron_cascades':
        // Irregular Geiger counter ticks + cosmic ray scatter
        this.playTone(1260, 0.035, 'triangle', 0.028, 0, 1520);
        this.playTone(1490, 0.035, 'triangle', 0.024, 0.16, 1120);
        this.playTone(1180, 0.04, 'sine', 0.024, 0.34, 880);
        break;
      case 'solar_flare_xray_uv':
        // High-frequency solar X-ray shimmer + harmonic sweep
        this.playTone(680, 0.22, 'sine', 0.032, 0, 1080);
        this.playTone(880, 0.24, 'triangle', 0.024, 0.1, 560);
        break;
      case 'solar_storm_response':
        // Deep CME geomagnetic groan + pulsing aurora static
        this.playTone(104, 0.45, 'triangle', 0.038, 0, 82);
        this.playTone(440, 0.24, 'sine', 0.026, 0.08, 587.33);
        this.playFilteredNoise(0.32, 'bandpass', 1800, 2.0, 0.022, 0.12, 920);
        break;
      case 'solar_energetic_particles':
        // Sharp ionizing particle zip streaks + relay crackle
        this.playTone(940, 0.09, 'triangle', 0.03, 0, 1480);
        this.playFilteredNoise(0.18, 'bandpass', 2700, 2.6, 0.028, 0.08, 1350);
        this.playTone(1180, 0.08, 'sine', 0.026, 0.28, 760);
        break;
    }
  }

  /** Very gentle background outpost pulse (max once every ~16s) to keep Mars alive without distraction. */
  public playSubtleAmbientPulse(hasBrokenCritical: boolean, windy: boolean) {
    if (!this.canPlay('ambient_pulse', 16000)) return;
    if (windy) {
      this.playFilteredNoise(0.65, 'bandpass', 480, 1.1, 0.012, 0, 620);
    }
    if (hasBrokenCritical) {
      this.playTone(116, 0.14, 'triangle', 0.011, 0.08, 98);
    } else if (this.currentTheme !== 'gameplay_ambient') {
      this.playTone(220, 0.24, 'sine', 0.012, 0.05, 224);
    }
  }

  public playMinorEventSting(eventId: string) {
    if (!this.canPlay(`minor_sting_${eventId}`, 1800)) return;
    switch (eventId) {
      case 'marsquake':
        // Tectonic deep bass rumble + rocky fissure crack + settling aftershock
        this.playTone(62, 0.52, 'sawtooth', 0.052, 0, 34);
        this.playFilteredNoise(0.46, 'lowpass', 280, 1.3, 0.062, 0, 95);
        this.playTone(104, 0.26, 'triangle', 0.048, 0.14, 58);
        this.playTone(145, 0.12, 'square', 0.018, 0.06, 82);
        break;
      case 'secondary_neutron_cascades':
        // Geiger counter cosmic-ray burst + secondary cascade scatter
        this.playTone(1240, 0.045, 'triangle', 0.042, 0, 1620);
        this.playTone(1520, 0.05, 'triangle', 0.036, 0.075, 980);
        this.playTone(1740, 0.06, 'sine', 0.036, 0.15, 1140);
        this.playTone(320, 0.22, 'sawtooth', 0.028, 0.18, 220);
        this.playFilteredNoise(0.18, 'bandpass', 2400, 2.6, 0.026, 0.1, 1350);
        break;
      case 'water_ice_cloud_formation':
        // High chill breeze + crisp crystalline frost chime progression
        this.playFilteredNoise(0.54, 'bandpass', 1480, 2.0, 0.032, 0, 820);
        this.playTone(1046.5, 0.18, 'sine', 0.04, 0.02, 1318.5);
        this.playTone(1318.5, 0.2, 'sine', 0.036, 0.1, 1567.98);
        this.playTone(1567.98, 0.24, 'sine', 0.03, 0.18, 1396.91);
        break;
      case 'dust_devils':
        // Swirling vortex wind sweep rising & curling across Jezero
        this.playFilteredNoise(0.72, 'bandpass', 380, 1.5, 0.058, 0, 1240);
        this.playTone(260, 0.28, 'triangle', 0.036, 0.04, 460);
        this.playTone(390, 0.28, 'sine', 0.028, 0.22, 220);
        break;
      case 'solar_flare_xray_uv':
        // Bright solar X-ray chirp + dual UV shelter alert cadence
        this.playTone(660, 0.16, 'sine', 0.046, 0, 1280);
        this.playTone(940, 0.18, 'triangle', 0.038, 0.1, 620);
        this.playTone(760, 0.22, 'sine', 0.036, 0.22, 480);
        this.playFilteredNoise(0.2, 'bandpass', 2100, 2.2, 0.022, 0.05, 1100);
        break;
      default:
        this.playAlert();
        break;
    }
  }

  // --- Contextual Major Event & Crew Reaction Cues ---
  public playCrewReactionCue(speaker: CutsceneSpeaker, mood: CutsceneMood) {
    if (speaker === 'GIL') {
      this.playGilChirp(mood);
      return;
    }
    if (!this.canPlay(`crew_${speaker}`, 320)) return;

    const up = mood === 'excited' || mood === 'determined' || mood === 'calm';
    switch (speaker) {
      case 'Player':
        // Commander crisp two-note comm chime
        this.playTone(up ? 440 : 392, 0.07, 'triangle', 0.032, 0, up ? 523.25 : 349.23);
        this.playTone(up ? 587.33 : 330, 0.08, 'sine', 0.028, 0.055);
        break;
      case 'Brent':
        // Power Specialist diagnostic relay blip
        this.playTone(up ? 510 : 380, 0.06, 'sine', 0.03, 0, up ? 610 : 310);
        this.playTone(680, 0.055, 'triangle', 0.02, 0.05);
        break;
      case 'MJ':
        // Medic / Bio-systems soft pulse
        this.playTone(up ? 523.25 : 415.3, 0.07, 'sine', 0.03, 0);
        this.playTone(up ? 659.25 : 370, 0.08, 'sine', 0.025, 0.06);
        break;
      case 'Darryl':
        // Life-Support low steady valve/comm tone
        this.playTone(up ? 330 : 277.18, 0.08, 'triangle', 0.03, 0, up ? 392 : 246.94);
        break;
      case 'Magno':
        // Workshop metallic ping
        this.playTone(up ? 587.33 : 466.16, 0.055, 'triangle', 0.028, 0);
        this.playTone(up ? 740 : 415, 0.07, 'sine', 0.022, 0.045);
        break;
    }
  }

  public playMajorEventSting(eventId: string) {
    if (!this.canPlay(`major_sting_${eventId}`, 2500)) return;
    if (eventId === 'solar_storm_response') {
      // Deep CME magnetic surge + urgent dual solar alarm wave + aurora crackle
      this.playTone(98, 0.44, 'sine', 0.058, 0, 68);
      this.playTone(370, 0.24, 'triangle', 0.05, 0.02, 587.33);
      this.playTone(659.25, 0.26, 'sine', 0.048, 0.14, 440);
      this.playTone(523.25, 0.26, 'triangle', 0.042, 0.28, 370);
      this.playFilteredNoise(0.32, 'bandpass', 1800, 2.1, 0.03, 0.08, 950);
    } else if (eventId === 'solar_energetic_particles') {
      // Intense cosmic-ray cascade bursts + deep radiation pulse + static discharge
      this.playTone(146.83, 0.42, 'triangle', 0.054, 0, 104);
      this.playTone(880, 0.09, 'triangle', 0.044, 0.02, 1520);
      this.playTone(1046.5, 0.1, 'sine', 0.042, 0.09, 659.25);
      this.playTone(1318.5, 0.16, 'sine', 0.042, 0.17, 784);
      this.playFilteredNoise(0.28, 'bandpass', 2500, 2.5, 0.036, 0.06, 1150);
    } else if (eventId === 'global_dust_storm') {
      // Planetary dust gale roar + static lightning crack + ominous low brassy fifth (super-major scale)
      this.playFilteredNoise(1.05, 'bandpass', 360, 1.15, 0.072, 0, 780);
      this.playTone(130.81, 0.44, 'sawtooth', 0.042, 0, 92);
      this.playTone(196.0, 0.48, 'triangle', 0.044, 0.14, 146.83);
      this.playTone(98.0, 0.52, 'sine', 0.054, 0.28, 65.41);
      this.playFilteredNoise(0.2, 'bandpass', 2600, 2.2, 0.032, 0.34, 1200);
    } else {
      this.playAlert();
    }
  }

  /**
   * Timed to visual hazard impact: punchy explosion/boom followed by staggered
   * breaking, debris, frost crackle, or electrical malfunction cues.
   */
  public playInfrastructureDamageAudio(params: {
    eventId: string;
    phenomenon: EventPhenomenon;
    severity: EventSeverity;
    impacts: BuildingEventImpact[];
    impactIntensity?: 'full' | 'decision';
  }) {
    if (!params.impacts.length || !this.canPlay('infra_damage', 950)) return;

    const { phenomenon, severity, impacts, impactIntensity = 'full' } = params;
    const hasShutdown = impacts.some((i) => Boolean(i.shutdown));
    const hasPhysicalHullHit = impacts.some((i) => i.conditionDelta < 0);
    const hasFrost = impacts.some((i) => (i.frostAdded ?? 0) > 0 || i.malfunctionKind === 'frost');
    const hasElectrical = impacts.some(
      (i) => i.malfunctionKind === 'electrical' || i.malfunctionKind === 'electronic'
    );
    const hasDustOnly = !hasPhysicalHullHit && !hasShutdown && !hasFrost && !hasElectrical;

    // Gentle wind-thud + sand scatter if dust_devils only coated panels without hull damage
    if (hasDustOnly) {
      this.playFilteredNoise(0.46, 'bandpass', 520, 1.3, 0.058, 0, 280);
      this.playTone(145, 0.2, 'triangle', 0.046, 0.03, 72);
      return;
    }

    const scale =
      impactIntensity === 'decision'
        ? 0.8
        : hasShutdown || severity === 'super_major'
        ? 1.24
        : severity === 'major'
        ? 1.08
        : 0.94;

    // Phase 1 (t = 0s): Impactful explosion / boom synced to camera shake & first impact ring
    this.playTone(112, 0.46, 'sine', Math.min(0.125, 0.092 * scale), 0, 26);
    this.playTone(186, 0.28, 'triangle', Math.min(0.09, 0.068 * scale), 0.005, 42);
    this.playFilteredNoise(
      0.56,
      'lowpass',
      480,
      1.1,
      Math.min(0.105, 0.076 * scale),
      0,
      80
    );
    if (hasShutdown || severity === 'super_major') {
      // Extra metallic hull-breach transient snap when facility goes offline or super-major hits
      this.playTone(255, 0.16, 'sawtooth', 0.042, 0.02, 60);
    }

    // Phase 1b: Contextual phenomenon resonance layer
    if (phenomenon === 'marsquake') {
      this.playTone(54, 0.44, 'sawtooth', 0.046, 0.05, 32);
    } else if (phenomenon === 'global_dust_storm' || phenomenon === 'dust_devils') {
      this.playFilteredNoise(0.42, 'bandpass', 620, 1.3, 0.046, 0.06, 260);
    } else if (
      phenomenon === 'solar_storm_response' ||
      phenomenon === 'solar_energetic_particles' ||
      phenomenon === 'solar_flare_xray_uv'
    ) {
      this.playTone(760, 0.12, 'triangle', 0.032, 0.05, 380);
    }

    // Phase 2 (t = 0.14s–0.34s): Breaking, debris scatter & malfunction signature
    if (hasShutdown) {
      // Heavy structural crunch + descending system power-down sweep
      this.playFilteredNoise(0.3, 'bandpass', 720, 1.6, 0.056, 0.14, 240);
      this.playTone(310, 0.26, 'sawtooth', 0.034, 0.18, 76);
      this.playTone(132, 0.2, 'triangle', 0.046, 0.26, 68);
    } else if (hasFrost || phenomenon === 'water_ice_clouds') {
      // Brittle ice fracture crackle + cryo pipe clunk
      this.playFilteredNoise(0.26, 'highpass', 2200, 1.2, 0.046, 0.14, 1300);
      this.playTone(1520, 0.12, 'sine', 0.038, 0.16, 890);
      this.playTone(170, 0.18, 'triangle', 0.042, 0.24, 92);
    } else if (hasElectrical) {
      // High-voltage arc snap + shorted electrical buzz
      this.playFilteredNoise(0.22, 'bandpass', 2600, 2.4, 0.048, 0.15, 1300);
      this.playTone(124, 0.26, 'sawtooth', 0.034, 0.2, 74);
      this.playTone(580, 0.09, 'square', 0.022, 0.26, 390);
    } else {
      // Physical hull cracking + tumbling rocky/metal debris scatter
      this.playFilteredNoise(0.28, 'bandpass', 860, 1.5, 0.05, 0.14, 340);
      this.playTone(165, 0.16, 'triangle', 0.046, 0.17, 88);
      this.playFilteredNoise(0.3, 'lowpass', 410, 1.2, 0.038, 0.27, 155);
    }
  }

  public playEventMomentCue(moment: 'briefing_open' | 'choices_ready' | 'outcome_resolved') {
    if (!this.canPlay(`evt_moment_${moment}`, 450)) return;
    if (moment === 'briefing_open') {
      this.playTone(520, 0.07, 'sine', 0.035, 0, 680);
    } else if (moment === 'choices_ready') {
      this.playTone(440, 0.07, 'triangle', 0.04, 0);
      this.playTone(587.33, 0.1, 'sine', 0.042, 0.06);
    } else {
      this.playTone(493.88, 0.08, 'sine', 0.042, 0);
      this.playTone(659.25, 0.14, 'sine', 0.045, 0.07);
    }
  }

  // --- Distinct Mission Outcome Sound Effects ---
  public playOutcomeFanfare(kind: string) {
    if (!this.canPlay(`outcome_${kind}`, 1200)) return;
    if (kind === 'victory_sustainable') {
      // Triumphant radiant 5-note Major sunrise fanfare
      this.playTone(392, 0.16, 'triangle', 0.065, 0);
      this.playTone(523.25, 0.16, 'triangle', 0.07, 0.11);
      this.playTone(659.25, 0.2, 'sine', 0.075, 0.22);
      this.playTone(783.99, 0.32, 'sine', 0.08, 0.34);
      this.playTone(1046.5, 0.55, 'sine', 0.065, 0.48);
      this.playTone(523.25, 0.6, 'sine', 0.035, 0.48);
    } else if (kind === 'victory_improvements') {
      // Earnest relieved Major triad with warm harmonic settle
      this.playTone(349.23, 0.16, 'triangle', 0.055, 0);
      this.playTone(440, 0.18, 'sine', 0.06, 0.12);
      this.playTone(523.25, 0.24, 'sine', 0.065, 0.24);
      this.playTone(659.25, 0.38, 'sine', 0.055, 0.38);
    } else if (kind === 'survived_failed') {
      // Bittersweet unresolved minor/sus cadence
      this.playTone(392, 0.22, 'sine', 0.05, 0);
      this.playTone(466.16, 0.24, 'sine', 0.05, 0.18);
      this.playTone(349.23, 0.42, 'triangle', 0.045, 0.38);
    } else if (kind === 'fail_oxygen') {
      // Soft air-pressure drop + descending minor interval
      this.playFilteredNoise(0.6, 'bandpass', 1250, 1.5, 0.034, 0, 240);
      this.playTone(392, 0.24, 'sine', 0.046, 0.08, 293.66);
      this.playTone(261.63, 0.45, 'sine', 0.046, 0.34, 220);
    } else if (kind === 'fail_water') {
      // Hollow pump shutoff + dry descending fifth
      this.playTone(349.23, 0.22, 'sine', 0.046, 0, 246.94);
      this.playTone(220, 0.42, 'triangle', 0.042, 0.22, 164.81);
    } else if (kind === 'fail_food') {
      // Quiet low dusk chord
      this.playTone(329.63, 0.24, 'sine', 0.046, 0);
      this.playTone(293.66, 0.24, 'sine', 0.046, 0.22);
      this.playTone(246.94, 0.46, 'sine', 0.046, 0.44);
    } else if (kind === 'fail_radiation') {
      // Urgent dosimeter triple chirp + solemn low warning tone
      this.playTone(980, 0.06, 'square', 0.025, 0);
      this.playTone(980, 0.06, 'square', 0.025, 0.1);
      this.playTone(840, 0.07, 'square', 0.022, 0.2);
      this.playTone(261.63, 0.42, 'triangle', 0.048, 0.32, 185);
    } else {
      // fail_condition: gentle med-monitor pulse + solemn evacuation chord
      this.playTone(587.33, 0.09, 'sine', 0.04, 0);
      this.playTone(311.13, 0.26, 'triangle', 0.046, 0.14, 246.94);
      this.playTone(233.08, 0.44, 'sine', 0.046, 0.36, 185);
    }
  }

  public playHealthWarning(severe = false) {
    if (!this.canPlay('health_warn', 1400)) return;
    // Urgent med-monitor downward two-tone pulse
    this.playTone(severe ? 698.46 : 622.25, 0.08, 'triangle', severe ? 0.048 : 0.036, 0);
    this.playTone(severe ? 466.16 : 440, 0.14, 'sine', severe ? 0.048 : 0.036, 0.085);
  }

  public playHealthRecovery() {
    if (!this.canPlay('health_recover', 900)) return;
    // Warm reassuring two-note med-bay recovery chime
    this.playTone(523.25, 0.09, 'sine', 0.038, 0);
    this.playTone(659.25, 0.16, 'sine', 0.042, 0.075);
  }

  public playEndingCue(kind: string) {
    this.playOutcomeFanfare(kind);
  }
}

export const soundFX = new SoundEffectsEngine();
