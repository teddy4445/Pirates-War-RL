#!/usr/bin/env python3
"""Build a portable audition page and a short mixed showcase. Requires numpy,
soundfile and ffmpeg. Original WAV synthesis itself needs only Node."""
from pathlib import Path
import json, base64, shutil, subprocess
import numpy as np
import soundfile as sf

ROOT=Path(__file__).resolve().parents[1]
SR=44100
m=json.loads((ROOT/'audio-manifest.json').read_text())
by_id={e['id']:e for e in m['entries']}
def load(name):
    a,sr=sf.read(ROOT/by_id[name]['files']['wav'],always_2d=True)
    assert sr==SR
    return a

mix=np.zeros((40*SR,2),dtype=np.float64)
ambient=load('ocean_calm_loop')
amb=np.tile(ambient,(2,1))[:len(mix)]
env=np.minimum(1,np.arange(len(mix))/SR/1.5)*np.minimum(1,(len(mix)-1-np.arange(len(mix)))/SR/2)
mix+=amb*env[:,None]*.16
sequence=[
(1.0,'countdown_tick',-.1),(1.6,'countdown_tick',.1),(2.2,'countdown_tick',0),(2.85,'match_start',0),
(4.0,'movement_start',-.3),(4.7,'cannon_fire_01',-.5),(5.08,'water_hit_01',.4),
(5.9,'cannon_fire_02',.5),(6.25,'wood_hit_01',-.3),(6.9,'cannon_fire_03',-.4),
(7.24,'wood_hit_02',.4),(7.8,'ship_collision_01',.1),(8.5,'ship_sink_01',.3),
(10.5,'ship_respawn',-.2),(11.8,'flag_pickup_01',0),(12.65,'flag_give',-.15),
(13.4,'flag_place',.15),(14.2,'flag_drop_water',0),(15.2,'flag_recover',0),
(16.3,'flag_capture',0),(18.0,'ui_click_01',0),(18.3,'ui_click_02',0),
(18.8,'ui_confirm',0),(19.45,'ui_error',0),(20.0,'ui_pause',0),(20.5,'ui_resume',0),
(21.3,'training_start',0),(22.0,'checkpoint_saved',0),(22.6,'validation_pass',0),
(23.4,'validation_fail',0),(24.2,'training_complete',0),(26.0,'match_defeat',0),
(27.6,'match_draw',0),(29.0,'match_victory',0),(31.0,'tournament_complete',0),
(34.0,'cannon_fire_01',-.45),(34.42,'water_hit_02',.3),(35.2,'flag_pickup_02',0),
(36.2,'flag_capture',0)
]
for at,name,pan in sequence:
    a=load(name);e=by_id[name];s=int(round(at*SR));n=min(len(a),len(mix)-s)
    if a.shape[1]==1:
        stereo=np.concatenate([a*np.sqrt((1-pan)/2),a*np.sqrt((1+pan)/2)],axis=1)
    else:stereo=a
    gain=.95*e['recommendedGain']
    mix[s:s+n]+=stereo[:n]*gain
# Conservative peak scaling, then short sample-accurate edges.
p=np.max(np.abs(mix));mix*=min(1.4,10**(-3/20)/max(p,1e-12))
fade=min(512,len(mix)//2);mix[:fade]*=np.linspace(0,1,fade)[:,None];mix[-fade:]*=np.linspace(1,0,fade)[:,None]
tmp=ROOT/'preview/showcase.wav';sf.write(tmp,mix,SR,subtype='PCM_16')
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(tmp),'-c:a','libmp3lame','-b:a','192k','-metadata','title=FleetRL - sound pack showcase',str(ROOT/'preview/showcase.mp3')],check=True)
tmp.unlink()
(ROOT/'preview/showcase-cues.json').write_text(json.dumps([{'timeS':t,'id':i,'pan':p}for t,i,p in sequence],indent=2)+'\n')

data={'entries':[], 'demo':base64.b64encode((ROOT/'preview/showcase.mp3').read_bytes()).decode()}
for e in m['entries']:
    data['entries'].append({k:e[k] for k in ['id','label','category','description','durationS','loop','recommendedGain']})
    data['entries'][-1]['base64']=base64.b64encode((ROOT/e['files']['ogg']).read_bytes()).decode()
html=r'''<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FleetRL | Sound Studio</title>
<style>
:root{color-scheme:dark;--bg:#0c1724;--panel:#152534;--edge:#2c4050;--ink:#eef4f6;--muted:#9eb3c1;--mint:#79ddcb;--gold:#edc97b;--soft:#1c3343}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}button,input{font:inherit}button{cursor:pointer}button:focus-visible,input:focus-visible{outline:3px solid var(--gold);outline-offset:3px}button:disabled{cursor:wait;opacity:.6}.shell{max-width:1250px;margin:auto;padding:28px 30px 60px}.brand{display:flex;gap:11px;align-items:center;font-size:15px;font-weight:700}.mark{display:grid;place-items:center;width:34px;height:34px;border:1px solid var(--mint);color:var(--mint);border-radius:9px}.brand small{font-size:12px;font-weight:400;color:var(--muted);margin-left:auto}.hero{display:flex;align-items:end;gap:20px;margin:35px 0 25px}.eyebrow{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--mint);font-weight:650}h1{font-size:42px;letter-spacing:-1.8px;line-height:1.12;margin:10px 0 12px}.sub{color:var(--muted);max-width:700px;line-height:1.65;font-size:15px;margin:0}.badges{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.badge{font-size:12px;background:var(--panel);border:1px solid var(--edge);border-radius:20px;padding:6px 11px}.bar{position:sticky;top:0;z-index:2;background:#152534f5;border:1px solid var(--edge);border-radius:14px;padding:17px 20px;display:flex;gap:13px;align-items:center;flex-wrap:wrap;backdrop-filter:blur(12px)}.primary,.secondary{border:0;border-radius:8px;padding:11px 16px;font-weight:650;font-size:13px}.primary{background:var(--mint);color:#112532}.secondary{background:var(--soft);color:var(--ink);border:1px solid var(--edge)}.master{margin-left:auto;display:flex;align-items:center;gap:10px;font-size:12px;color:var(--muted)}input[type=range]{accent-color:var(--mint);width:130px}label.check{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted)}input[type=checkbox]{accent-color:var(--mint)}.now{display:flex;align-items:center;gap:11px;min-height:63px;border-bottom:1px solid var(--edge);font-size:13px;margin:0 2px 23px}.dot{width:8px;height:8px;background:var(--edge);border-radius:50%}.dot.on{background:var(--mint);box-shadow:0 0 10px #79ddcb66}#now{font-weight:600}#detail{color:var(--muted);font-size:12px;margin-left:auto}.filter{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:0 0 22px}.filter button{background:none;border:1px solid var(--edge);color:var(--muted);border-radius:20px;padding:8px 12px;font-size:12px}.filter button.active{background:var(--mint);color:#112532;border-color:var(--mint)}.search{margin-left:auto;width:190px;background:var(--panel);color:var(--ink);border:1px solid var(--edge);border-radius:8px;padding:10px 12px;font-size:12px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}.card{border:1px solid var(--edge);background:var(--panel);border-radius:12px;padding:18px;display:flex;flex-direction:column;min-height:188px}.card.playing{border-color:var(--mint);box-shadow:inset 0 0 0 1px #79ddcb33}.meta{display:flex;justify-content:space-between;align-items:center;font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--muted)}.meta .duration{color:var(--gold);letter-spacing:0}.card h2{font-size:17px;letter-spacing:-.3px;margin:11px 0 7px}.card p{margin:0;color:var(--muted);font-size:12px;line-height:1.6;flex:1}.bottom{display:flex;gap:8px;align-items:center;margin-top:16px}.play{border:1px solid #3c675f;color:var(--mint);background:#1b393d;border-radius:7px;padding:7px 12px;font-size:12px;font-weight:650}.filename{font-family:ui-monospace,Consolas,monospace;font-size:10px;color:#6e8c9e;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-left:auto}.empty{color:var(--muted);grid-column:1/-1;padding:40px;text-align:center}.notes{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:28px;padding-top:22px;border-top:1px solid var(--edge)}.notes h3{font-size:13px;margin:0 0 8px}.notes p{font-size:12px;line-height:1.8;color:var(--muted);margin:0}.footer{font-size:11px;color:#6e8c9e;margin-top:28px}.status{color:var(--gold);font-size:12px;line-height:1.5;margin-top:14px}kbd{font-family:inherit;border:1px solid var(--edge);padding:1px 5px;border-radius:4px}@media(max-width:900px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.master{margin-left:0}.brand small{display:none}}@media(max-width:550px){.shell{padding:20px 15px 40px}h1{font-size:33px}.grid,.notes{grid-template-columns:1fr}.bar{padding:12px;gap:8px}.search{margin-left:0;width:100%}#detail{display:none}.master{width:100%}}
</style></head><body><main class="shell">
<div class="brand"><span class="mark" aria-hidden="true">&#9875;</span>FleetRL <small>Original procedural audio / no external samples</small></div>
<div class="hero"><div><div class="eyebrow">Asset library / volume 01</div><h1>A little sound.<br>A lot more life.</h1><p class="sub">Soft cannon thumps, wooden impacts, playful objective chimes and quiet ocean water. Audition the complete sound pack before bringing it into your pirate arena.</p><div class="badges"><span class="badge">47 one-shot effects</span><span class="badge">2 stereo ocean loops</span><span class="badge">WAV + Ogg in the bundle</span><span class="badge">Works offline</span></div></div></div>
<div class="bar"><button class="primary" id="showcase">Play 40-second showcase</button><button class="secondary" id="stop">Stop all</button><label class="check"><input type="checkbox" id="solo" checked>One sound at a time</label><label class="master">Volume <input aria-label="Master volume" type="range" min="0" max="100" value="60" id="volume"><span id="percent">60%</span></label><button class="secondary" id="mute" aria-pressed="false">Mute</button></div>
<div class="now" role="status" aria-live="polite"><span class="dot" id="dot"></span><span id="now">Ready to listen</span><span id="detail">Select a sound below. No audio autoplays.</span></div>
<div class="filter" id="filters"><input class="search" id="search" type="search" aria-label="Search sounds" placeholder="Search sounds..."></div><div class="grid" id="grid"></div>
<div class="status" id="error" role="alert"></div>
<div class="notes"><section><h3>Keep the game readable</h3><p>Use sound once per game event, not once per frame. Rotate shot and impact variations. Keep ambience quiet and off by default in class. Do not play hidden enemy sounds in fog-of-war views.</p></section><section><h3>Ready for your project</h3><p>The ZIP includes 44.1 kHz / 16-bit WAV masters, compressed Ogg copies, a manifest, source synthesis code and a Web Audio playback helper. This page embeds its previews; no server or internet connection is needed. <kbd>Esc</kbd> stops playback.</p></section></div>
<p class="footer">49 authored synthesis recipes and variations. File levels and loops are technically checked; final listening and in-game mix approval remain yours. Preview uses compressed files; use PCM buffers for exact ambience loops.</p>
<script id="audio-data" type="application/json">__DATA__</script>
<script>
(()=>{'use strict';
const data=JSON.parse(document.getElementById('audio-data').textContent), assets=data.entries;
const $=id=>document.getElementById(id), active=new Map(),decoded=new Map();let ctx=null,master=null,muted=false,category='all',generation=0,counter=0;
const categories=[['all','All sounds'],['combat','Combat'],['ship','Ships'],['flag','Flags'],['ui','Interface'],['match','Match & tournament'],['training','Training'],['ambience','Ocean loops']];
for(const [id,label] of categories){const b=document.createElement('button');b.textContent=label;b.dataset.category=id;b.classList.toggle('active',id==='all');b.onclick=()=>{category=id;for(const t of $('filters').querySelectorAll('button'))t.classList.toggle('active',t===b);render();};$('filters').insertBefore(b,$('search'));}
function render(){const q=$('search').value.trim().toLowerCase();const selected=assets.filter(e=>(category==='all'||e.category===category)&&(`${e.label} ${e.id} ${e.description}`).toLowerCase().includes(q));$('grid').replaceChildren();
for(const e of selected){const c=document.createElement('article');c.className='card';c.dataset.sound=e.id;c.innerHTML=`<div class="meta"><span>${e.category}</span><span class="duration">${e.durationS.toFixed(e.durationS<1?2:1)} s${e.loop?' / LOOP':''}</span></div><h2>${e.label}</h2><p>${e.description}</p><div class="bottom"><button class="play" data-play="${e.id}">${e.loop?'Play loop':'Play sound'}</button><span class="filename" title="${e.id}.wav">${e.id}.wav</span></div>`;c.querySelector('button').onclick=()=>play(e).catch(fail);$('grid').append(c);}
if(!selected.length){const d=document.createElement('div');d.className='empty';d.textContent='No matching sounds.';$('grid').append(d);}sync();}
function status(label,detail=''){ $('now').textContent=label;$('detail').textContent=detail; }
function sync(){let running=active.size>0;$('dot').classList.toggle('on',running);for(const c of $('grid').children)c.classList.toggle('playing',[...active.values()].some(v=>v.id===c.dataset.sound));}
async function ensure(){if(!ctx){ctx=new AudioContext();master=ctx.createGain();master.connect(ctx.destination);updateGain();}if(ctx.state!=='running')await ctx.resume();return ctx;}
function bytes(encoded){const s=atob(encoded),a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return a.buffer;}
async function decode(id,encoded){if(!decoded.has(id)){const p=ctx.decodeAudioData(bytes(encoded));decoded.set(id,p);p.catch(()=>decoded.delete(id));}return decoded.get(id);}
function stop(){++generation;for(const v of active.values())try{v.source.stop();}catch{}active.clear();status('Playback stopped','Choose another sound to continue.');sync();}
async function play(e){await ensure();if($('solo').checked)stop();const g=generation;status('Loading '+e.label,'');const b=await decode(e.id,e.base64);if(g!==generation)return;if(active.size>=12){const first=active.values().next().value;first.source.stop();}
const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=b;source.loop=e.loop;gain.gain.value=e.loop?.6:e.recommendedGain;source.connect(gain);gain.connect(master);const token=++counter;active.set(token,{source,id:e.id});source.onended=()=>{active.delete(token);source.disconnect();gain.disconnect();if(!active.size)status('Ready to listen','Select a sound below.');sync();};source.start();status(e.label,e.loop?'Looping / Stop all to finish':e.id+'.wav');sync();}
function updateGain(){const v=Number($('volume').value)/100;$('percent').textContent=Math.round(v*100)+'%';if(master)master.gain.setTargetAtTime(muted?0:v,ctx.currentTime,.015);}
function fail(e){$('error').textContent='Could not play this sound: '+e.message;status('Playback unavailable','Try a current desktop browser.');}
$('showcase').onclick=async()=>{try{await ensure();stop();const g=generation;status('Loading showcase','');const b=await decode('__demo',data.demo);if(g!==generation)return;const source=ctx.createBufferSource();source.buffer=b;source.connect(master);const token=++counter;active.set(token,{source,id:'__demo'});source.onended=()=>{active.delete(token);source.disconnect();if(!active.size)status('Showcase finished','Audition individual sounds below.');sync();};source.start();status('FleetRL / sound pack showcase','40 seconds / combat, flags, interface and tournament');sync();}catch(e){fail(e);}};
$('stop').onclick=stop;$('volume').oninput=updateGain;$('search').oninput=render;$('mute').onclick=()=>{muted=!muted;$('mute').textContent=muted?'Unmute':'Mute';$('mute').setAttribute('aria-pressed',String(muted));updateGain();};
document.addEventListener('keydown',e=>{if(e.key==='Escape')stop();});window.addEventListener('pagehide',stop);
window.__audioPreviewTest={assets,decodeAll:async()=>{await ensure();const results=[];for(const e of assets){const b=await decode(e.id,e.base64);results.push({id:e.id,duration:b.duration,channels:b.numberOfChannels});}return results;},getActive:()=>active.size};render();
})();
</script></main></body></html>'''
html=html.replace('__DATA__',json.dumps(data,separators=(',',':')))
(ROOT/'preview/index.html').write_text(html)
print(f'Built audition page ({len(html)/1e6:.2f} MB) and 40-second showcase.')
