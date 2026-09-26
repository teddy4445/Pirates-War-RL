import type { WorldEvent } from "../sim/types";

type AudioContextConstructor = typeof AudioContext;
type SoundGroup = { files: string[]; gain: number };

const base = import.meta.env.BASE_URL;
const sounds: Record<string, SoundGroup> = {
  CannonFired: { files: ["cannon_fire_01.ogg", "cannon_fire_02.ogg", "cannon_fire_03.ogg"], gain: .72 },
  ProjectileHitShip: { files: ["wood_hit_01.ogg", "wood_hit_02.ogg", "wood_hit_03.ogg"], gain: .63 },
  ProjectileHitTerrain: { files: ["water_hit_01.ogg", "water_hit_02.ogg", "water_hit_03.ogg"], gain: .57 },
  ShipContact: { files: ["ship_collision_01.ogg", "ship_collision_02.ogg"], gain: .48 },
  ShipSunk: { files: ["ship_sink_01.ogg", "ship_sink_02.ogg"], gain: .67 },
  ShipRespawned: { files: ["ship_respawn.ogg"], gain: .5 },
  FlagPickedUp: { files: ["flag_pickup_01.ogg", "flag_pickup_02.ogg"], gain: .55 },
  FlagGiven: { files: ["flag_give.ogg"], gain: .5 },
  FlagPlaced: { files: ["flag_place.ogg"], gain: .5 },
  FlagDroppedWater: { files: ["flag_drop_water.ogg"], gain: .5 },
  FlagRelocatedToIsland: { files: ["flag_place.ogg"], gain: .58 },
  FlagCaptured: { files: ["flag_capture.ogg"], gain: .7 },
  FlagRecovered: { files: ["flag_recover.ogg"], gain: .55 },
};
const cues: Record<string, SoundGroup> = {
  ui_click: { files: ["ui_click_01.ogg", "ui_click_02.ogg"], gain: .38 },
  ui_back: { files: ["ui_back.ogg"], gain: .42 },
  ui_confirm: { files: ["ui_confirm.ogg"], gain: .5 },
  ui_error: { files: ["ui_error.ogg"], gain: .52 },
  ui_pause: { files: ["ui_pause.ogg"], gain: .45 },
  ui_resume: { files: ["ui_resume.ogg"], gain: .45 },
  match_start: { files: ["match_start.ogg"], gain: .62 },
  match_victory: { files: ["match_victory.ogg"], gain: .68 },
  match_draw: { files: ["match_draw.ogg"], gain: .6 },
  tournament_complete: { files: ["tournament_complete.ogg"], gain: .68 },
};

const hash = (text: string): number => [...text].reduce((value, character) => Math.imul(value ^ character.charCodeAt(0), 16_777_619) >>> 0, 2_166_136_261);

export class FleetAudioMixer {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private effects: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<AudioBuffer>>();
  private voices = new Set<AudioBufferSourceNode>();
  private ambience: AudioBufferSourceNode | null = null;
  private heard = new Set<string>();
  private muted = localStorage.getItem("fleetrl.audio.muted") === "true";
  private masterValue = Number(localStorage.getItem("fleetrl.audio.master") ?? .35);

  get isUnlocked(): boolean { return this.context !== null; }
  get isMuted(): boolean { return this.muted; }

  async unlock(): Promise<void> {
    const Constructor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext);
    if (!Constructor) throw new Error("Web Audio is unavailable in this browser.");
    if (!this.context) {
      this.context = new Constructor();
      this.master = this.context.createGain(); this.effects = this.context.createGain();
      this.effects.connect(this.master); this.master.connect(this.context.destination);
      this.effects.gain.value = .7; this.applyGain();
    }
    await this.context.resume();
  }

  setMuted(value: boolean): void { this.muted = value; localStorage.setItem("fleetrl.audio.muted", String(value)); this.applyGain(); }
  setMaster(value: number): void { this.masterValue = Math.max(0, Math.min(1, value)); localStorage.setItem("fleetrl.audio.master", String(this.masterValue)); this.applyGain(); }
  getMaster(): number { return this.masterValue; }
  resetCursor(): void { this.heard.clear(); }

  private applyGain(): void { if (this.master && this.context) this.master.gain.setValueAtTime(this.muted ? 0 : this.masterValue, this.context.currentTime); }

  private async buffer(file: string): Promise<AudioBuffer> {
    const existing = this.buffers.get(file); if (existing) return existing;
    const loading = this.pending.get(file); if (loading) return loading;
    if (!this.context) throw new Error("Audio must be unlocked by a user gesture.");
    const promise = fetch(`${base}assets/audio/${file}`).then(async response => {
      if (!response.ok) throw new Error(`Unable to load audio ${file}.`);
      const decoded = await this.context!.decodeAudioData(await response.arrayBuffer());
      this.buffers.set(file, decoded); this.pending.delete(file); return decoded;
    });
    this.pending.set(file, promise); return promise;
  }

  async playEvent(event: WorldEvent): Promise<void> {
    if (!this.context || !this.effects || this.muted || this.heard.has(event.id)) return;
    this.heard.add(event.id);
    const group = sounds[event.type]; if (!group) return;
    if (this.voices.size >= 12) return;
    const file = group.files[hash(event.id) % group.files.length]!;
    try {
      const source = this.context.createBufferSource(); source.buffer = await this.buffer(file);
      const gain = this.context.createGain(); gain.gain.value = group.gain;
      source.connect(gain); gain.connect(this.effects); this.voices.add(source);
      source.addEventListener("ended", () => { source.disconnect(); gain.disconnect(); this.voices.delete(source); }, { once: true });
      source.start();
    } catch (error) { console.warn(error); }
  }

  playEvents(events: readonly WorldEvent[]): void { for (const event of events) void this.playEvent(event); }

  async playCue(id: keyof typeof cues): Promise<void> {
    if (!this.context || !this.effects || this.muted) return;
    const group = cues[id]; if (!group || this.voices.size >= 12) return; const file = group.files[hash(`${id}-${performance.now()}`) % group.files.length]!;
    try { const source = this.context.createBufferSource(); source.buffer = await this.buffer(file); const gain = this.context.createGain(); gain.gain.value = group.gain; source.connect(gain); gain.connect(this.effects); this.voices.add(source); source.addEventListener("ended", () => { source.disconnect(); gain.disconnect(); this.voices.delete(source); }, { once: true }); source.start(); } catch (error) { console.warn(error); }
  }

  async startAmbience(kind: "calm" | "harbor" = "calm"): Promise<void> {
    if (!this.context || !this.effects || this.muted || this.ambience) return;
    try { const source = this.context.createBufferSource(); source.buffer = await this.buffer(kind === "calm" ? "ocean_calm_loop.ogg" : "ocean_harbor_loop.ogg"); source.loop = true; const gain = this.context.createGain(); gain.gain.value = .12; source.connect(gain); gain.connect(this.effects); source.start(); this.ambience = source; source.addEventListener("ended", () => { source.disconnect(); gain.disconnect(); if (this.ambience === source) this.ambience = null; }, { once: true }); } catch (error) { console.warn(error); }
  }

  stopAmbience(): void { if (!this.ambience) return; try { this.ambience.stop(); } catch { /* already stopped */ } this.ambience = null; }
}

export const fleetAudio = new FleetAudioMixer();
