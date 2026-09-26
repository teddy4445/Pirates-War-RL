/** Browser-only presentation audio. Never import into the simulation or agent sandbox. */
const clamp = (v, lo=0, hi=1) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
export class FleetRLAudio {
  static async fromManifest(url) {
    const u = new URL(url, location.href);
    const response = await fetch(u);
    if (!response.ok) throw new Error(`Audio manifest HTTP ${response.status}`);
    return new FleetRLAudio(await response.json(), new URL('.',u));
  }
  constructor(manifest, baseURL) {
    this.manifest=manifest; this.baseURL=new URL(baseURL,location.href);
    this.entries=new Map(manifest.entries.map(e=>[e.id,e]));
    this.groups=manifest.groups||{};
    this.context=null; this.master=null; this.buses={}; this.buffers=new Map();
    this.active=new Set(); this.seen=new Set(); this.pendingIds=new Set(); this.last=new Map();
    this.generation=0; this.ambient=null; this.ambientRequest=0;
    this.maxVoices=manifest.mixDefaults?.maxEffectVoices||12;
    this.levels={master:.6,effects:.7,ui:.6,ambience:.22,...manifest.mixDefaults};
    this.muted=false; this.variationCounter=new Map();
  }
  /** Call only in direct response to a user action, e.g. Enable audio / Play. */
  async unlock() {
    if(!this.context) {
      this.context=new AudioContext();
      this.master=this.context.createGain(); this.master.connect(this.context.destination);
      for(const name of ['effects','ui','ambience']) {
        this.buses[name]=this.context.createGain(); this.buses[name].connect(this.master);
      }
      this.setVolumes({});
    }
    if(this.context.state==='suspended') await this.context.resume();
    return this.context.state==='running';
  }
  setVolumes(values) {
    for(const name of ['master','effects','ui','ambience']) if(name in values) this.levels[name]=clamp(values[name]);
    if(this.context) {
      this.master.gain.setTargetAtTime(this.muted?0:this.levels.master,this.context.currentTime,.012);
      for(const name of ['effects','ui','ambience']) this.buses[name].gain.setTargetAtTime(this.levels[name],this.context.currentTime,.012);
    }
  }
  setMuted(muted) {this.muted=!!muted; this.setVolumes({});}
  async _load(entry) {
    if(!this.context) throw new Error('Call unlock() from a user gesture first.');
    if(!this.buffers.has(entry.id)) {
      const promise=(async()=>{
        // PCM source for exact loops. Ogg is an optional effect-size optimization.
        const paths=entry.loop?[entry.files.wav]:[entry.files.ogg,entry.files.wav].filter(Boolean);
        let lastError;
        for(const rel of paths)try {
          const res=await fetch(new URL(rel,this.baseURL));
          if(!res.ok)throw new Error(`Audio HTTP ${res.status}: ${entry.id}`);
          return await this.context.decodeAudioData(await res.arrayBuffer());
        }catch(e){lastError=e;}
        throw lastError||new Error(`No audio source: ${entry.id}`);
      })();
      this.buffers.set(entry.id,promise);
      promise.catch(()=>this.buffers.delete(entry.id));
    }
    return this.buffers.get(entry.id);
  }
  async preload({includeAmbience=false}={}) {
    if(!this.context) throw new Error('Call unlock() first.');
    return Promise.all([...this.entries.values()].filter(e=>includeAmbience||!e.loop).map(e=>this._load(e)));
  }
  _choose(name) {
    if(this.entries.has(name))return this.entries.get(name);
    const list=this.groups[name]; if(!list?.length)return null;
    // Cosmetic round-robin only: never consume the simulation's random stream.
    const i=this.variationCounter.get(name)||0;this.variationCounter.set(name,i+1);
    return this.entries.get(list[i%list.length]);
  }
  /** Return a promise; do NOT await this in the simulation stepping loop. */
  async play(name,{eventId=null,audible=true,pan=0,gain=1,playbackRate=1,priority=null}={}) {
    if(!audible || this.muted || this.context?.state!=='running')return false;
    if(eventId!==null&&(this.seen.has(eventId)||this.pendingIds.has(eventId)))return false;
    const entry=this._choose(name);if(!entry||entry.loop)return false;
    const now=this.context.currentTime;
    if(now-(this.last.get(name)??-Infinity)<entry.minIntervalMs/1000)return false;
    if(eventId!==null)this.pendingIds.add(eventId);
    const generation=this.generation;
    try {
      const buffer=await this._load(entry);
      if(generation!==this.generation||this.muted||this.context.state!=='running')return false;
      const time=this.context.currentTime;
      // Recheck after asynchronous load, since another request may have played first.
      if(time-(this.last.get(name)??-Infinity)<entry.minIntervalMs/1000)return false;
      const p=priority??entry.priority;
      if(this.active.size>=this.maxVoices) {
        const victim=[...this.active].sort((a,b)=>a.priority-b.priority||a.started-b.started)[0];
        if(victim&&victim.priority>p)return false;
        if(victim){victim.source.stop();this.active.delete(victim);}
      }
      const source=this.context.createBufferSource(),volume=this.context.createGain(),panner=this.context.createStereoPanner();
      source.buffer=buffer;source.playbackRate.value=clamp(playbackRate,.8,1.2);
      volume.gain.value=entry.recommendedGain*clamp(gain,0,1.5);panner.pan.value=clamp(pan,-1,1);
      const bus=['ui','training','match'].includes(entry.category)?this.buses.ui:this.buses.effects;
      source.connect(volume);volume.connect(panner);panner.connect(bus);
      const voice={source,volume,panner,priority:p,started:time};this.active.add(voice);
      source.onended=()=>{this.active.delete(voice);source.disconnect();volume.disconnect();panner.disconnect();};
      source.start();this.last.set(name,time);
      if(eventId!==null){this.seen.add(eventId);if(this.seen.size>4096)this.seen.delete(this.seen.values().next().value);}
      return true;
    } catch(error) {console.warn('FleetRL audio skipped:',error);return false;}
    finally{if(eventId!==null)this.pendingIds.delete(eventId);}
  }
  /** Fail-closed routing for world events. UI callers can use play() directly. */
  playEvent(name,event,{permitted=false,pan=0}={}) {
    if(!permitted||!event||typeof event.id!=='string')return Promise.resolve(false);
    return this.play(name,{eventId:event.id,audible:true,pan});
  }
  async startAmbience(id='ocean_calm_loop') {
    if(this.context?.state!=='running')return false;
    const entry=this.entries.get(id);if(!entry?.loop)return false;
    this.stopAmbience();const request=++this.ambientRequest,generation=this.generation;
    try {
      const b=await this._load(entry);
      if(request!==this.ambientRequest||generation!==this.generation||this.context.state!=='running')return false;
      const source=this.context.createBufferSource(),volume=this.context.createGain();source.buffer=b;
      source.loop=true;source.loopStart=0;source.loopEnd=b.duration;
      volume.gain.setValueAtTime(0,this.context.currentTime);
      volume.gain.linearRampToValueAtTime(entry.recommendedGain,this.context.currentTime+.25);
      source.connect(volume);volume.connect(this.buses.ambience);source.start();
      this.ambient={source,volume};source.onended=()=>{source.disconnect();volume.disconnect();};return true;
    } catch(error){console.warn('FleetRL ambience skipped:',error);return false;}
  }
  stopAmbience() {
    ++this.ambientRequest;
    if(this.ambient&&this.context){const {source,volume}=this.ambient;volume.gain.cancelScheduledValues(this.context.currentTime);volume.gain.setTargetAtTime(0,this.context.currentTime,.04);source.stop(this.context.currentTime+.2);this.ambient=null;}
  }
  stopAll() {
    ++this.generation;
    for(const voice of this.active){try{voice.source.stop();}catch{}}
    this.active.clear();this.stopAmbience();this.pendingIds.clear();
  }
  /** Call on match changes and replay seeks; don't emit skipped historical events. */
  resetTimeline() {this.stopAll();this.seen.clear();this.last.clear();this.variationCounter.clear();}
  async dispose() {this.stopAll();this.buffers.clear();if(this.context)await this.context.close();this.context=null;}
}
