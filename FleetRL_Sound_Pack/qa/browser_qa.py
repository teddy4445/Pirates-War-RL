#!/usr/bin/env python3
"""Integration/preview smoke tests. Requires playwright and a Chromium install."""
import contextlib, functools, http.server, json, threading, time, shutil
from pathlib import Path
from urllib.parse import urlparse
import mimetypes, base64
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
handler=functools.partial(QuietHandler,directory=str(ROOT))
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}/'
report={}
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium') or None,args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1440,'height':1050},device_scale_factor=1)
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content((ROOT/'preview/index.html').read_text())
        report['previewTestMode']='Self-contained HTML injected into about:blank; direct file navigation is blocked by the test browser administrator.'
        report['offlineCards']=page.locator('.card').count()
        assert report['offlineCards']==49
        page.locator('[data-play="cannon_fire_01"]').click()
        page.wait_for_function('window.__audioPreviewTest.getActive() > 0')
        page.wait_for_timeout(800)
        assert page.evaluate('window.__audioPreviewTest.getActive()')==0
        decoded=page.evaluate('window.__audioPreviewTest.decodeAll()')
        assert len(decoded)==49
        reference=json.loads((ROOT/'audio-manifest.json').read_text())
        for e,d in zip(reference['entries'],decoded):
            assert e['id']==d['id']
            assert abs(e['durationS']-d['duration']) < .03,(e['id'],e['durationS'],d)
            assert e['channels']==d['channels']
        report['allOggDecoded']=decoded
        page.locator('[data-category="ambience"]').click()
        page.locator('[data-play="ocean_calm_loop"]').click()
        page.wait_for_function('window.__audioPreviewTest.getActive() === 1')
        page.keyboard.press('Escape')
        assert page.evaluate('window.__audioPreviewTest.getActive()')==0
        page.locator('#mute').click();assert page.locator('#mute').get_attribute('aria-pressed')=='true'
        page.locator('#mute').click()
        report['offlinePlaybackLoopStopMute']='passed'
        page.locator('[data-category="all"]').click()
        page.locator('#search').fill('flag')
        assert page.locator('.card').count()>=8
        page.locator('#search').fill('')
        page.screenshot(path=str(ROOT/'qa/preview-desktop.png'),full_page=False)
        page.set_viewport_size({'width':390,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(ROOT/'qa/preview-mobile.png'),full_page=False)
        report['desktopAndMobileLayout']='passed'
        source=(ROOT/'integration/fleetrl-audio.js').read_text().replace('export class FleetRLAudio','class FleetRLAudio')
        page.add_script_tag(content=source+'\nwindow.FleetRLAudio=FleetRLAudio;')
        mapping={}
        for entry in reference['entries']:
            for fmt in ['ogg','wav']:
                rel=entry['files'][fmt]
                mapping['/'+rel]=base64.b64encode((ROOT/rel).read_bytes()).decode()
        mapping['/audio-manifest.json']=base64.b64encode((ROOT/'audio-manifest.json').read_bytes()).decode()
        page.evaluate("""mapping=>{window.__originalFetch=window.fetch;window.fetch=async url=>{
          const key=new URL(String(url)).pathname;
          if(!(key in mapping))return new Response('Not found',{status:404});
          const raw=atob(mapping[key]),bytes=new Uint8Array(raw.length);
          for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
          return new Response(bytes,{status:200});
        };} """,mapping)
        report['helperTestTransport']='Fetch mocked with local file bytes because browser policy blocks navigation; real Web Audio decoding and playback exercised.'
        result=page.evaluate('''async()=>{
          const a=await window.FleetRLAudio.fromManifest('https://assets.fleetrl.test/audio-manifest.json');
          await a.unlock(); await a.preload({includeAmbience:true});
          const hidden=await a.playEvent('cannon_fire',{id:'hidden'},{permitted:false});
          if(hidden!==false)throw Error('Hidden sound leaked');
          const duplicate=await Promise.all([
            a.playEvent('cannon_fire',{id:'evt-1'},{permitted:true}),
            a.playEvent('cannon_fire',{id:'evt-1'},{permitted:true})]);
          if(duplicate.filter(Boolean).length!==1)throw Error('Duplicate event played');
          a.resetTimeline();
          await Promise.all(a.manifest.entries.filter(e=>!e.loop).slice(0,25).map(e=>a.play(e.id)));
          const voices=a.active.size;if(voices>a.maxVoices)throw Error('Voice limit exceeded');
          a.resetTimeline();
          const amb=await a.startAmbience('ocean_calm_loop');
          if(!amb||!a.ambient.source.loop)throw Error('Loop start failed');
          a.setMuted(true);if(await a.play('ui_click'))throw Error('Muted sound emitted');
          a.setMuted(false);a.resetTimeline();
          a.setVolumes({master:5,effects:-3});
          if(a.levels.master!==1||a.levels.effects!==0)throw Error('Gain clamping failed');
          const count=a.buffers.size;
          await a.dispose();if(a.context!==null)throw Error('Dispose failed');
          return {loadedBuffers:count,hiddenBlocked:!hidden,duplicateAccepted:duplicate.filter(Boolean).length,maxObservedVoices:voices,loopStarted:amb,gainClamping:true,disposed:true};
        }''')
        report['webAudioHelper']=result
        assert not errors,errors
        report['uncaughtBrowserErrors']=errors
        browser.close()
    report['passed']=True
finally:
    server.shutdown()
(ROOT/'qa/browser-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='allOggDecoded'},indent=2))
