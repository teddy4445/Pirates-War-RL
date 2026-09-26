#!/usr/bin/env node
/** Original, dependency-free procedural sound effects. No network/API calls. */
import fs from 'node:fs';
import path from 'node:path';

const VERSION = 'fleetrl-sfx-v1';
const SAMPLE_RATE = 44100;
const PRESETS = [
  ['cannon', .18], ['hit', .14], ['splash', .32], ['sink', .85],
  ['flag_pickup', .22], ['flag_give', .18], ['flag_place', .20],
  ['capture', .55], ['respawn', .38], ['ui_click', .05],
];
function parseArgs(args) {
  let out = null, seed = 101, force = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') out = args[++i];
    else if (args[i] === '--seed') seed = Number(args[++i]);
    else if (args[i] === '--force') force = true;
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if (!out || out.startsWith('--')) throw new Error('Provide --out <directory>.');
  if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff) {
    throw new Error('--seed must be an integer in [1, 4294967295].');
  }
  return { out: path.resolve(out), seed, force };
}
function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}
function synthesize(kind, duration, seed) {
  const n = Math.round(duration * SAMPLE_RATE);
  const x = new Float64Array(n), random = rng(seed || 1);
  let low = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE, u = i / (n - 1);
    const noise = random() * 2 - 1;
    low += .18 * (noise - low);
    const fade = Math.min(1, t / .005) * Math.min(1, (duration - t) / .012);
    const env = Math.max(0, fade) * Math.exp(-3.2 * u);
    let v = 0;
    if (kind === 'cannon') v = .8 * Math.sin(2 * Math.PI * (135*t - 190*t*t)) + .32*low;
    else if (kind === 'hit') v = .55*noise + .4*Math.sin(2*Math.PI*210*t);
    else if (kind === 'splash') v = low * (1 + .3*Math.sin(2*Math.PI*24*t));
    else if (kind === 'sink') v = .45*low + .3*Math.sin(2*Math.PI*(220*t - 65*t*t)) * Math.pow(Math.sin(2*Math.PI*9*t), 2);
    else if (kind === 'ui_click') v = .4*Math.sin(2*Math.PI*1150*t) + .15*noise;
    else {
      const notes = kind === 'capture' ? [523.25,659.25,783.99] :
        kind === 'flag_pickup' ? [660,880] : kind === 'flag_give' ? [550,660] :
        kind === 'flag_place' ? [660,440] : [440,660,880];
      const segment = Math.min(notes.length-1, Math.floor(u*notes.length));
      const local = t - segment * duration / notes.length;
      const gate = Math.min(1, local/.004) * Math.min(1, (duration/notes.length-local)/.008);
      v = Math.max(0,gate) * Math.exp(-4*local) * (
        Math.sin(2*Math.PI*notes[segment]*local) + .2*Math.sin(4*Math.PI*notes[segment]*local));
    }
    x[i] = v * env;
  }
  const mean = x.reduce((a,b) => a+b, 0) / n;
  // Remove DC with a tapered correction so first/last samples remain near zero.
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const edge = Math.min(1,i/220) * Math.min(1,(n-1-i)/440);
    x[i] = (x[i] - mean) * edge;
    peak = Math.max(peak, Math.abs(x[i]));
  }
  const gain = peak > 0 ? .7/peak : 0;
  const pcm = new Int16Array(n);
  let sum = 0, finalPeak = 0;
  for (let i = 0; i < n; i++) {
    pcm[i] = Math.round(x[i]*gain*32767);
    const s = pcm[i]/32768; sum += s*s; finalPeak = Math.max(finalPeak,Math.abs(s));
  }
  return { pcm, peak: finalPeak, rms: Math.sqrt(sum/n), duration: n/SAMPLE_RATE };
}
function wav(pcm) {
  const b = Buffer.alloc(44 + pcm.length*2);
  b.write('RIFF',0); b.writeUInt32LE(b.length-8,4); b.write('WAVE',8);
  b.write('fmt ',12); b.writeUInt32LE(16,16); b.writeUInt16LE(1,20);
  b.writeUInt16LE(1,22); b.writeUInt32LE(SAMPLE_RATE,24);
  b.writeUInt32LE(SAMPLE_RATE*2,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34);
  b.write('data',36); b.writeUInt32LE(pcm.length*2,40);
  for (let i=0;i<pcm.length;i++) b.writeInt16LE(pcm[i],44+i*2);
  return b;
}
function main() {
  const {out,seed,force} = parseArgs(process.argv.slice(2));
  fs.mkdirSync(out,{recursive:true});
  const names = [...PRESETS.map(([id])=>`${id}.wav`),'audio-manifest.json'];
  for (const name of names) if (!force && fs.existsSync(path.join(out,name))) {
    throw new Error(`Refusing to overwrite ${name}; use --force intentionally.`);
  }
  const entries = PRESETS.map(([id,duration],i) => {
    const s = synthesize(id,duration,(seed+i*2654435761)>>>0);
    const bytes = wav(s.pcm);
    fs.writeFileSync(path.join(out,`${id}.wav`),bytes);
    return {id,path:`${id}.wav`,bytes:bytes.length,durationS:s.duration,
      sampleRate:SAMPLE_RATE,channels:1,bitsPerSample:16,peak:s.peak,rms:s.rms};
  });
  const manifest={generator:VERSION,seed,source:'Original procedural synthesis; no external samples.',
    license:'Project-authored asset; apply the repository asset license.',entries};
  fs.writeFileSync(path.join(out,'audio-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({generator:VERSION,out,files:entries.length,seed},null,2));
}
try { main(); } catch (error) { console.error(`Audio generation failed: ${error.message}`); process.exitCode=1; }
