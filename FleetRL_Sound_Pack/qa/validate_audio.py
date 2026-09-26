#!/usr/bin/env python3
"""Numerical and regeneration QA. pip install numpy scipy soundfile"""
import hashlib,json,subprocess,tempfile
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
ROOT=Path(__file__).resolve().parents[1]
m=json.loads((ROOT/'audio-manifest.json').read_text())
checks=[]
for e in m['entries']:
    f=ROOT/e['files']['wav'];a,sr=sf.read(f,always_2d=True);info=sf.info(f)
    assert sr==44100 and info.subtype=='PCM_16'
    assert len(a)==round(e['durationS']*sr)
    assert a.shape[1]==e['channels']
    assert np.isfinite(a).all() and np.max(np.abs(a))<.67
    assert np.sqrt(np.mean(a*a))>.001
    assert hashlib.sha256(f.read_bytes()).hexdigest()==e['sha256']
    seam=float(np.max(np.abs(a[0]-a[-1])))
    if e['loop']: assert seam==0 and a.shape[1]==2
    else: assert np.max(np.abs(a[[0,-1]]))==0
    true_peak=float(np.max(np.abs(resample_poly(a,4,1,axis=0))))
    assert true_peak<.95,(e['id'],true_peak)
    o,osr=sf.read(ROOT/e['files']['ogg'],always_2d=True)
    assert osr==sr and len(o)==len(a) and o.shape[1]==a.shape[1]
    assert np.isfinite(o).all() and np.max(np.abs(o))<1
    checks.append({'id':e['id'],'frames':len(a),'channels':a.shape[1],
                   'peakDbfs':float(20*np.log10(np.max(np.abs(a)))),
                   'estimatedTruePeak4xDbfs':float(20*np.log10(true_peak)),
                   'rmsDbfs':float(20*np.log10(np.sqrt(np.mean(a*a)))),
                   'absoluteDcMean':float(np.max(np.abs(np.mean(a,axis=0)))),
                   'wavLoopEndpointDifference':seam if e['loop'] else None,
                   'oggFrames':len(o),'oggDecoded':True,'sha256Checked':True})
with tempfile.TemporaryDirectory(prefix='fleetrl-qa-') as temp:
    run=subprocess.run(['node',str(ROOT/'source/generate_audio.mjs'),'--out',temp,'--seed',str(m['seed'])],capture_output=True,text=True,check=True)
    for e in m['entries']:
        assert hashlib.sha256((Path(temp)/e['files']['wav']).read_bytes()).hexdigest()==e['sha256']
    # The generator must refuse accidental replacement and invalid inputs.
    overwrite=subprocess.run(['node',str(ROOT/'source/generate_audio.mjs'),'--out',temp],capture_output=True,text=True)
    assert overwrite.returncode!=0 and 'Refusing overwrite' in overwrite.stderr
    invalid=subprocess.run(['node',str(ROOT/'source/generate_audio.mjs'),'--out',temp,'--seed','0'],capture_output=True,text=True)
    assert invalid.returncode!=0 and 'Invalid seed' in invalid.stderr
    unknown=subprocess.run(['node',str(ROOT/'source/generate_audio.mjs'),'--banana'],capture_output=True,text=True)
    assert unknown.returncode!=0 and 'Unknown argument' in unknown.stderr
report={'passed':True,'assetsChecked':len(checks),'wavFormat':'44.1 kHz PCM16',
        'sameSeedWavRegeneration':'bit-identical SHA-256 for all 49 assets',
        'overwriteProtection':'passed','invalidArguments':'passed','entries':checks,
        'listeningReview':'Not performed. No acoustic/headphone audition was available; numerical tests do not establish perceptual quality.',
        'gameIntegration':'Example/helper only; not integrated into an implemented FleetRL game.'}
(ROOT/'qa/audio-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='entries'},indent=2))
print('Worst true peak dBFS:',max(e['estimatedTruePeak4xDbfs']for e in checks))
print('Worst DC:',max(e['absoluteDcMean']for e in checks))
