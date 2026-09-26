#!/usr/bin/env node
/** FleetRL original procedural sound pack. Node built-ins only; no samples/APIs. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const VERSION = 'fleetrl-audio-2.0.0';
export const SR = 44100;
const TAU = 2 * Math.PI;
function parseArgs(args) {
  let out = null, seed = 20260925, force = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') out = args[++i];
    else if (args[i] === '--seed') seed = Number(args[++i]);
    else if (args[i] === '--force') force = true;
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if (!out || out.startsWith('--')) throw new Error('Use --out <pack-root> [--seed 20260925] [--force]');
  if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff) throw new Error('Invalid seed (1..4294967295).');
  return {out: path.resolve(out), seed, force};
}
function random(seed) {
  let s = seed >>> 0 || 1;
  return () => {s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296;};
}
function hashedSeed(id, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < id.length; i++) {h ^= id.charCodeAt(i); h = Math.imul(h, 16777619);}
  return h >>> 0 || 1;
}
function buffer(seconds) {return new Float64Array(Math.round(seconds * SR));}
function rms(x) {let s = 0; for (const v of x) s += v*v; return Math.sqrt(s / x.length);}
function peak(x) {let p = 0; for (const v of x) p = Math.max(p, Math.abs(v)); return p;}
function edge(t, duration, attack=.002, release=.02) {
  if (t < 0 || t >= duration) return 0;
  return Math.min(1, t/attack) * Math.min(1, (duration-t)/release);
}
function lowpass(x, hz) {
  const y = new Float64Array(x.length), a = 1 - Math.exp(-TAU*hz/SR); let z = 0;
  for (let i = 0; i < x.length; i++) {z += a*(x[i]-z); y[i] = z;}
  return y;
}
function noise(seconds, rng, lo=100, hi=3500) {
  const x = buffer(seconds); for (let i = 0; i < x.length; i++) x[i] = rng()*2-1;
  const upper = lowpass(x, hi), lower = lowpass(upper, lo);
  for (let i = 0; i < x.length; i++) upper[i] -= lower[i];
  const r = rms(upper) || 1; for (let i = 0; i < x.length; i++) upper[i] /= r;
  return upper;
}
function mix(dst, src, at=0, gain=1) {
  const start = Math.round(at*SR);
  for (let i=0;i<src.length && i+start<dst.length;i++) if (i+start>=0) dst[i+start] += src[i]*gain;
}
function tone(seconds, f0, f1=f0, decay=.2, brightness=.1) {
  const x = buffer(seconds); let phase = 0;
  for (let i = 0; i < x.length; i++) {
    const t=i/SR, u=t/seconds;
    const f=f0*Math.pow(f1/f0,u); phase += TAU*f/SR;
    x[i]=(Math.sin(phase)+brightness*Math.sin(2*phase)+brightness*.3*Math.sin(3*phase)) * Math.exp(-t/decay) * edge(t,seconds,.0015,.022);
  }
  return x;
}
function burst(seconds, rng, lo, hi, decay, attack=.002, wobble=0) {
  const x=noise(seconds,rng,lo,hi);
  for (let i=0;i<x.length;i++) {const t=i/SR; x[i] *= edge(t,seconds,attack,.04)*Math.exp(-t/decay)*(1+wobble*Math.sin(TAU*19*t));}
  return x;
}
function pluck(seconds, hz, rng, style='wood') {
  const x=buffer(seconds);
  const modes=style==='bell' ? [[1,1,1],[2,.22,.75],[3,.07,.42],[4.12,.018,.24]] :
    style==='brass' ? [[1,1,1],[2,.36,.8],[3,.14,.6],[4,.04,.4]] :
    [[1,1,1],[2.76,.18,.37],[4.84,.05,.18]];
  const attack=style==='brass'?.018:.0035;
  for (let i=0;i<x.length;i++) {const t=i/SR; let v=0;
    for(const [ratio,amp,d] of modes) v += amp*Math.sin(TAU*hz*ratio*t)*Math.exp(-t/(seconds*.28*d));
    x[i]=v*edge(t,seconds,attack,.035);
  }
  if(style==='wood') mix(x,burst(Math.min(seconds,.03),rng,700,2200,.006),0,.025);
  return x;
}
function chime(notes, rng, duration, style='bell') {
  const x=buffer(duration);
  for(const [at,hz,amp=1,length=.45] of notes) mix(x,pluck(length,hz,rng,style),at,amp);
  return x;
}
function echo(x, taps=[[.057,.08],[.109,.04]]) {
  const src=x.slice(); for(const [at,g] of taps) mix(x,src,at,g);
}
function wood(rng, duration=.36, intensity=1, offset=0) {
  const x=buffer(duration);
  const f=155+offset;
  mix(x,tone(duration*.8,f,f*.79,.065,.12),0,.8*intensity);
  mix(x,tone(duration*.65,480+offset,420+offset,.035,.05),.005,.21*intensity);
  mix(x,burst(.11,rng,430,2900,.021),0,.24*intensity);
  mix(x,burst(.16,rng,180,1400,.037),.028,.12*intensity);
  return x;
}
function water(rng,duration=.65,intensity=1) {
  const x=buffer(duration);
  mix(x,burst(duration*.75,rng,310,5200,.115,.006,.18),.005,.36*intensity);
  mix(x,burst(duration*.6,rng,75,850,.1,.003),0,.35*intensity);
  for(let j=0;j<7;j++) {
    const at=.08+rng()*(duration*.58), hz=480+rng()*1050;
    mix(x,tone(.085+rng()*.08,hz*.8,hz*1.2,.025,.02),at,.035*intensity);
  }
  return x;
}
function bubbles(rng,duration=1.0,count=12) {
  const x=buffer(duration);
  for(let j=0;j<count;j++) {const at=.03+rng()*(duration-.2), hz=230+rng()*1050;
    mix(x,tone(.065+rng()*.09,hz*.72,hz*1.28,.024,.015),at,.05+rng()*.075);
  }
  return x;
}

// All durations are actual exported lengths; gains are initial mixer suggestions.
export const SPECS = [
  ...[1,2,3].map(v=>({id:`cannon_fire_0${v}`,name:`Cannon fire ${v}`,category:'combat',kind:'cannon',duration:.62,variant:v,gain:.72,description:'Rounded low thump, warm gunpowder puff, short tail.'})),
  {id:'cannon_reload',name:'Cannon ready',category:'combat',kind:'reload',duration:.30,gain:.45,description:'Small wooden/metal latch; use for selected ship only.'},
  ...[1,2].map(v=>({id:`cannon_flyby_0${v}`,name:`Cannonball pass ${v}`,category:'combat',kind:'flyby',duration:.34,variant:v,gain:.28,description:'Gentle passing-air swish; optional cosmetic layer.'})),
  ...[1,2,3].map(v=>({id:`wood_hit_0${v}`,name:`Hull impact ${v}`,category:'combat',kind:'wood',duration:.40,variant:v,gain:.63,description:'Compact hollow wooden knock with a splinter tick.'})),
  ...[1,2,3].map(v=>({id:`water_hit_0${v}`,name:`Water impact ${v}`,category:'combat',kind:'water',duration:.72,variant:v,gain:.57,description:'Splash, soft low plop and a few droplets.'})),
  ...[1,2].map(v=>({id:`ship_collision_0${v}`,name:`Ship bump ${v}`,category:'combat',kind:'collision',duration:.52,variant:v,gain:.48,description:'Muted hull bump and a little water; no harsh crash.'})),
  ...[1,2].map(v=>({id:`ship_sink_0${v}`,name:`Sinking ship ${v}`,category:'ship',kind:'sink',duration:1.70,variant:v,gain:.67,description:'Wooden break, submerging water and descending bubbles.'})),
  {id:'ship_respawn',name:'Ship respawn',category:'ship',kind:'respawn',duration:.88,gain:.48,description:'Light rising shimmer with a soft water arrival.'},
  {id:'low_health',name:'Low health',category:'ship',kind:'health',duration:.52,gain:.35,description:'Soft double wooden pulse; rate-limit in the game.'},
  {id:'movement_start',name:'Sails catch wind',category:'ship',kind:'movement',duration:.60,gain:.20,description:'Small air-and-water swell; not a continuous engine loop.'},
  ...[1,2].map(v=>({id:`flag_pickup_0${v}`,name:`Flag pickup ${v}`,category:'flag',kind:'pickup',duration:.46,variant:v,gain:.55,description:'Two ascending plucks for obtaining the flag.'})),
  {id:'flag_give',name:'Give flag',category:'flag',kind:'give',duration:.39,gain:.48,description:'Quick friendly handoff chime.'},
  {id:'flag_place',name:'Place flag on land',category:'flag',kind:'place',duration:.44,gain:.48,description:'Small pole tap with a resolving downward pluck.'},
  {id:'flag_drop_water',name:'Drop flag in water',category:'flag',kind:'drop',duration:.62,gain:.43,description:'Soft splash with a short downward note.'},
  {id:'flag_recover',name:'Recover own flag',category:'flag',kind:'recover',duration:.61,gain:.52,description:'Three reassuring ascending notes.'},
  {id:'flag_capture',name:'Flag delivered / point scored',category:'flag',kind:'capture',duration:1.06,gain:.65,description:'Bright, compact major arpeggio for scoring.'},
  {id:'flag_lost',name:'Own flag taken',category:'flag',kind:'lost',duration:.59,gain:.42,description:'Restrained falling chime, not a siren.'},
  {id:'ui_hover',name:'Hover / focus',category:'ui',kind:'hover',duration:.065,gain:.16,description:'Optional very quiet wooden tick; disabled by default.'},
  ...[1,2].map(v=>({id:`ui_click_0${v}`,name:`Button click ${v}`,category:'ui',kind:'click',duration:.10,variant:v,gain:.31,description:'Dry rounded button pluck.'})),
  {id:'ui_back',name:'Back / cancel',category:'ui',kind:'back',duration:.22,gain:.28,description:'Short descending two-note tap.'},
  {id:'ui_confirm',name:'Confirm',category:'ui',kind:'confirm',duration:.35,gain:.38,description:'Positive paired pluck.'},
  {id:'ui_error',name:'Invalid action',category:'ui',kind:'error',duration:.27,gain:.34,description:'Muted double knock; no piercing error buzz.'},
  {id:'ui_pause',name:'Pause',category:'ui',kind:'pause',duration:.28,gain:.28,description:'Descending pair of mellow notes.'},
  {id:'ui_resume',name:'Resume',category:'ui',kind:'resume',duration:.28,gain:.28,description:'Ascending pair of mellow notes.'},
  {id:'ui_notification',name:'Notification',category:'ui',kind:'notification',duration:.52,gain:.34,description:'One soft bell with a gentle harmonic tail.'},
  {id:'countdown_tick',name:'Countdown tick',category:'match',kind:'countdown',duration:.17,gain:.42,description:'Audible but restrained count-in knock.'},
  {id:'match_start',name:'Match begins',category:'match',kind:'start',duration:.75,gain:.59,description:'Brief upward fanfare; not a spoken countdown.'},
  {id:'match_victory',name:'Victory',category:'match',kind:'victory',duration:1.56,gain:.62,description:'Warm plucked/brassy major celebration.'},
  {id:'match_defeat',name:'Defeat',category:'match',kind:'defeat',duration:1.17,gain:.42,description:'Gentle falling phrase, suitable for a classroom.'},
  {id:'match_draw',name:'Draw',category:'match',kind:'draw',duration:.96,gain:.43,description:'Neutral suspended cadence.'},
  {id:'tournament_complete',name:'Tournament complete',category:'match',kind:'tournament',duration:2.14,gain:.65,description:'Longer original ascending celebration, used sparingly.'},
  {id:'training_start',name:'Training started',category:'training',kind:'training_start',duration:.44,gain:.34,description:'Subtle ascending working cue.'},
  {id:'training_complete',name:'Training complete',category:'training',kind:'training_complete',duration:.93,gain:.43,description:'Gentle three-note completion chime.'},
  {id:'checkpoint_saved',name:'Checkpoint saved',category:'training',kind:'saved',duration:.30,gain:.25,description:'Soft two-note checkpoint confirmation.'},
  {id:'validation_pass',name:'Agent validated',category:'training',kind:'valid',duration:.48,gain:.39,description:'Friendly positive check cue.'},
  {id:'validation_fail',name:'Agent validation failed',category:'training',kind:'invalid',duration:.44,gain:.34,description:'Calm descending diagnostic cue.'},
  {id:'ocean_calm_loop',name:'Calm ocean - seamless',category:'ambience',kind:'ocean',duration:24,channels:2,loop:true,gain:.28,description:'Soft stereo water wash; fully procedural, no recordings.'},
  {id:'ocean_harbor_loop',name:'Harbor water - seamless',category:'ambience',kind:'harbor',duration:24,channels:2,loop:true,gain:.24,description:'Gentle lapping with occasional little water burbles.'},
];
function synth(spec, rng) {
  const d=spec.duration,v=spec.variant||1; let x=buffer(d);
  switch(spec.kind) {
    case 'cannon': {
      mix(x,tone(.46,134+v*8,43+v*2,.082,.16),0,.88);
      mix(x,tone(.27,242+v*12,110,.047,.06),.003,.17);
      mix(x,burst(.40,rng,120,1950+v*170,.065,.003),0,.29);
      mix(x,burst(.49,rng,70,690,.113,.006),.024,.18);
      mix(x,wood(rng,.10,.18,40+v*15),0,.20); echo(x,[[.075,.04],[.142,.02]]); break;
    }
    case 'reload': mix(x,wood(rng,.14,.24,120),0,.7); mix(x,pluck(.16,880,rng,'wood'),.096,.16); break;
    case 'flyby': {x=noise(d,rng,320,3300); let p=0;
      for(let i=0;i<x.length;i++){const t=i/SR,u=t/d,e=Math.pow(Math.sin(Math.PI*u),2); p+=TAU*(760*(1-u)+270)/SR; x[i]=e*(x[i]*.3+Math.sin(p)*.035)*edge(t,d,.03,.06);} break;}
    case 'wood': x=wood(rng,d,1,-18+v*24); mix(x,tone(.12,700+v*130,650,.018),.012,.055); break;
    case 'water': x=water(rng,d,1); mix(x,bubbles(rng,.36,3),.20,.25); break;
    case 'collision': mix(x,wood(rng,.34,1, -36+v*12),0,.8); mix(x,wood(rng,.23,.3,40),.082,.4); mix(x,water(rng,.39,.4),.06,.4); break;
    case 'sink': mix(x,wood(rng,.42,1,0),0,.50); mix(x,wood(rng,.29,.5,42),.11,.36);
      mix(x,water(rng,.84,1),.14,.74); mix(x,burst(1.20,rng,90,1300,.34,.06),.23,.11);
      mix(x,bubbles(rng,1.22,19),.36,.84); mix(x,tone(.75,280,95,.17,.025),.27,.035); break;
    case 'respawn': mix(x,water(rng,.5,.45),0,.3); mix(x,chime([[.04,392,.24,.48],[.16,587.33,.34,.49],[.27,783.99,.42,.55]],rng,d),0,1); break;
    case 'health': mix(x,tone(.19,142,103,.047,.18),0,.70); mix(x,tone(.20,142,103,.052,.15),.235,.65); break;
    case 'movement': x=noise(d,rng,300,3700); for(let i=0;i<x.length;i++){const u=i/(x.length-1);x[i]*=Math.pow(Math.sin(Math.PI*u),2)*.14;}; mix(x,water(rng,.36,.15),.18,.4); break;
    case 'pickup': x=chime([[0,587.33,.55,.28],[.09,880,.62,.35]],rng,d,'wood'); break;
    case 'give': x=chime([[0,659.25,.48,.24],[.075,783.99,.53,.29]],rng,d,'wood'); break;
    case 'place': mix(x,wood(rng,.12,.3,180),0,.32); mix(x,chime([[.035,659.25,.35,.23],[.11,493.88,.48,.3]],rng,d,'wood'),0,1); break;
    case 'drop': mix(x,water(rng,.44,.5),.025,.55); mix(x,chime([[0,523.25,.35,.24],[.1,392,.35,.32]],rng,d,'wood'),0,.8); break;
    case 'recover': x=chime([[0,523.25,.5,.28],[.105,659.25,.5,.32],[.21,783.99,.55,.38]],rng,d); break;
    case 'capture': x=chime([[0,523.25,.46,.43],[.11,659.25,.43,.43],[.22,783.99,.43,.48],[.35,1046.5,.48,.62],[.35,523.25,.16,.6]],rng,d); echo(x); break;
    case 'lost': x=chime([[0,587.33,.48,.32],[.12,440,.4,.38],[.22,349.23,.35,.35]],rng,d,'wood'); break;
    case 'hover': x=pluck(d,1120,rng,'wood'); break;
    case 'click': x=pluck(d,780+v*65,rng,'wood'); mix(x,burst(.022,rng,600,2200,.006),0,.03); break;
    case 'back': x=chime([[0,660,.5,.13],[.068,440,.52,.15]],rng,d,'wood'); break;
    case 'confirm': x=chime([[0,659.25,.48,.23],[.09,880,.52,.25]],rng,d,'wood'); break;
    case 'error': mix(x,pluck(.12,196,rng,'wood'),0,.7); mix(x,pluck(.14,185,rng,'wood'),.095,.65); break;
    case 'pause': x=chime([[0,659.25,.45,.17],[.08,493.88,.5,.18]],rng,d,'wood'); break;
    case 'resume': x=chime([[0,493.88,.45,.17],[.08,659.25,.5,.18]],rng,d,'wood'); break;
    case 'notification': x=chime([[0,783.99,.6,.48],[.005,1174.66,.075,.39]],rng,d); break;
    case 'countdown': mix(x,pluck(.15,392,rng,'wood'),0,.7); mix(x,wood(rng,.09,.15,120),0,.2); break;
    case 'start': x=chime([[0,392,.38,.3],[.10,523.25,.44,.4],[.20,783.99,.42,.5],[.20,523.25,.16,.43]],rng,d,'brass'); break;
    case 'victory': x=chime([[0,392,.42,.4],[.14,523.25,.43,.4],[.28,659.25,.43,.45],[.42,783.99,.44,.55],[.63,1046.5,.46,.83],[.63,523.25,.22,.75],[.63,659.25,.17,.7]],rng,d,'brass'); echo(x); break;
    case 'defeat': x=chime([[0,523.25,.42,.47],[.18,440,.41,.47],[.37,349.23,.38,.70],[.37,261.63,.18,.70]],rng,d,'wood'); echo(x,[[.064,.05]]); break;
    case 'draw': x=chime([[0,392,.43,.46],[.17,523.25,.38,.47],[.33,587.33,.34,.55],[.33,392,.17,.55]],rng,d,'wood'); break;
    case 'tournament': x=chime([[0,392,.4,.42],[.14,523.25,.4,.46],[.28,659.25,.4,.46],[.42,783.99,.42,.5],[.58,659.25,.3,.42],[.72,783.99,.35,.47],[.90,1046.5,.44,1.0],[.90,523.25,.20,.95],[.90,659.25,.16,.9],[1.06,1567.98,.06,.85]],rng,d,'brass'); echo(x,[[.075,.07],[.151,.035]]); break;
    case 'training_start': x=chime([[0,440,.4,.23],[.07,554.37,.4,.26],[.14,659.25,.4,.28]],rng,d,'wood'); break;
    case 'training_complete': x=chime([[0,523.25,.45,.42],[.15,659.25,.45,.47],[.30,880,.43,.59]],rng,d); break;
    case 'saved': x=chime([[0,783.99,.35,.20],[.065,1046.5,.32,.23]],rng,d,'wood'); break;
    case 'valid': x=chime([[0,659.25,.43,.29],[.09,880,.45,.35]],rng,d); break;
    case 'invalid': x=chime([[0,440,.42,.29],[.09,349.23,.4,.33]],rng,d,'wood'); break;
    default: throw new Error(`Unrecognized synth: ${spec.kind}`);
  }
  // Mildly soften noisy transients; no hard clipping or dynamics plugin required.
  if(['cannon','wood','water','sink','collision'].includes(spec.kind)) for(let i=0;i<x.length;i++) x[i]=Math.tanh(x[i]*1.15)/1.15;
  return x;
}
function periodicNoise(n,rng,lo,hi) {
  // Warm up the one-pole filters over the same exact period to obtain a periodic state.
  const raw=new Float64Array(n);for(let i=0;i<n;i++)raw[i]=rng()*2-1;
  const y=new Float64Array(n), a=1-Math.exp(-TAU*hi/SR), b=1-Math.exp(-TAU*lo/SR);
  let u=0,l=0;for(let pass=0;pass<2;pass++)for(let i=0;i<n;i++){u+=a*(raw[i]-u);l+=b*(u-l);if(pass)y[i]=u-l;}
  const r=rms(y)||1;for(let i=0;i<n;i++) y[i]/=r;return y;
}
function circularMix(dst,src,start,gain) {
  const n=dst.length,s=Math.round(start*SR);for(let i=0;i<src.length;i++)dst[(i+s+n)%n]+=src[i]*gain;
}
function ambient(spec,rng) {
  const n=Math.round(spec.duration*SR), length=spec.duration;
  const shared=periodicNoise(n,rng,90,1800), a=periodicNoise(n,rng,380,4100), b=periodicNoise(n,rng,380,4100);
  const left=new Float64Array(n),right=new Float64Array(n);
  for(let i=0;i<n;i++) {
    const u=i/n;
    const swell=.56+.21*Math.sin(TAU*3*u+.4)+.12*Math.sin(TAU*5*u+2);
    const detail=.56+.23*Math.sin(TAU*7*u+1.3)+.08*Math.sin(TAU*11*u);
    left[i]=.15*shared[i]*swell+.085*a[i]*detail;
    right[i]=.15*shared[i]*swell+.085*b[i]*(.56+.23*Math.sin(TAU*7*u+1.6)+.08*Math.sin(TAU*11*u+.6));
  }
  const events=spec.kind==='harbor'?29:15;
  for(let j=0;j<events;j++) {
    const at=rng()*length, splash=water(rng,.55+rng()*.6,.10+rng()*.08),pan=rng();
    circularMix(left,splash,at,Math.sqrt(1-pan)*.28);circularMix(right,splash,at,Math.sqrt(pan)*.28);
    if(spec.kind==='harbor') {const bl=bubbles(rng,.35,2);circularMix(left,bl,at+.1,.045);circularMix(right,bl,at+.11,.045);}
  }
  // A tiny smooth boundary correction removes a DC-sized quantization edge while
  // retaining ambience across the loop; no silence or fade-out at the seam.
  for(const ch of [left,right]) {
    const m=ch.reduce((s,v)=>s+v,0)/n;for(let i=0;i<n;i++)ch[i]-=m;
    const target=(ch[0]+ch[n-1])/2,w=256;
    const d0=target-ch[0],d1=target-ch[n-1];
    for(let i=0;i<w;i++){const k=(1+Math.cos(Math.PI*i/(w-1)))/2;ch[i]+=d0*k;ch[n-1-i]+=d1*k;}
  }
  return [left,right];
}
function master(channels,spec) {
  if(!spec.loop) for(const x of channels) {
    const mean=x.reduce((s,v)=>s+v,0)/x.length;
    for(let i=0;i<x.length;i++){const t=i/SR; x[i]=(x[i]-mean)*edge(t,x.length/SR,.002,.026);}
    x[0]=0;x[x.length-1]=0;
  }
  let p=0, energy=0, count=0;for(const x of channels){p=Math.max(p,peak(x));for(const v of x)energy+=v*v;count+=x.length;}
  const r=Math.sqrt(energy/count)||1;
  const isUI=spec.category==='ui'||spec.category==='training';
  const cap=spec.loop?.32:isUI?.40:.66;
  const targetRms=spec.loop?.065:isUI?.085:.11;
  const gain=Math.min(cap/(p||1),targetRms/r);
  return channels.map(x=>{const y=new Int16Array(x.length);for(let i=0;i<x.length;i++)y[i]=Math.round(Math.max(-1,Math.min(1,x[i]*gain))*32767);return y;});
}
function wav(channels) {
  const n=channels[0].length,c=channels.length,dataBytes=n*c*2;
  const b=Buffer.alloc(44+dataBytes);b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(c,22);b.writeUInt32LE(SR,24);b.writeUInt32LE(SR*c*2,28);b.writeUInt16LE(c*2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(dataBytes,40);
  for(let i=0;i<n;i++)for(let k=0;k<c;k++)b.writeInt16LE(channels[k][i],44+(i*c+k)*2);
  return b;
}
export const GROUPS={
  cannon_fire:['cannon_fire_01','cannon_fire_02','cannon_fire_03'], hull_hit:['wood_hit_01','wood_hit_02','wood_hit_03'],water_impact:['water_hit_01','water_hit_02','water_hit_03'],ship_bump:['ship_collision_01','ship_collision_02'],cannon_pass:['cannon_flyby_01','cannon_flyby_02'],ship_sink:['ship_sink_01','ship_sink_02'],flag_pickup:['flag_pickup_01','flag_pickup_02'],ui_click:['ui_click_01','ui_click_02']
};
function main(){
  const {out,seed,force}=parseArgs(process.argv.slice(2));
  const targets=[...SPECS.map(s=>`audio/wav/${s.id}.wav`),'audio-manifest.json'];
  for(const f of targets)if(!force&&fs.existsSync(path.join(out,f)))throw new Error(`Refusing overwrite: ${f}. Use --force intentionally.`);
  fs.mkdirSync(path.join(out,'audio/wav'),{recursive:true});
  const entries=[];
  for(const spec of SPECS){
    const fileSeed=hashedSeed(spec.id,seed),rng=random(fileSeed);
    const raw=spec.loop?ambient(spec,rng):[synth(spec,rng)];
    const pcm=master(raw,spec),bytes=wav(pcm);
    const filename=`audio/wav/${spec.id}.wav`;fs.writeFileSync(path.join(out,filename),bytes);
    let p=0,e=0,dc=0;for(const ch of pcm)for(const q of ch){const v=q/32768;p=Math.max(p,Math.abs(v));e+=v*v;dc+=v;}
    const count=pcm[0].length*pcm.length;
    entries.push({id:spec.id,label:spec.name,category:spec.category,description:spec.description,files:{wav:filename},durationS:pcm[0].length/SR,sampleRate:SR,channels:pcm.length,bitsPerSample:16,loop:!!spec.loop,loopStartS:spec.loop?0:null,loopEndS:spec.loop?pcm[0].length/SR:null,recommendedGain:spec.gain,priority:['capture','victory','tournament'].includes(spec.kind)?100:spec.category==='ui'?30:60,minIntervalMs:spec.kind==='health'?8000:spec.kind==='hover'?120:spec.kind==='cannon'?55:spec.loop?0:70,seed:fileSeed,peak:p,peakDbfs:20*Math.log10(p||1e-12),rms:Math.sqrt(e/count),dcMean:dc/count,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  }
  const manifest={schemaVersion:1,pack:'FleetRL Sound Pack',version:VERSION,seed,source:'Original procedural synthesis from oscillators and seeded filtered noise. No third-party recordings, samples, voices, or music.',assetLicense:'Project-generated assets; see PROVENANCE.md. No claim of exclusive copyright.',entries,groups:GROUPS,mixDefaults:{master:.6,effects:.7,ui:.6,ambience:.22,maxEffectVoices:12,ambienceEnabled:false}};
  fs.writeFileSync(path.join(out,'audio-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({version:VERSION,seed,assets:entries.length,effects:entries.filter(e=>!e.loop).length,loops:entries.filter(e=>e.loop).length,totalSeconds:entries.reduce((a,e)=>a+e.durationS,0),out},null,2));
}
try {main();}catch(e){console.error(e.message);process.exitCode=1;}
