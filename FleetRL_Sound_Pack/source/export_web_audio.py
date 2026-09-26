#!/usr/bin/env python3
"""Create optional Ogg Vorbis copies and update the manifest. Requires ffmpeg."""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import shutil
import subprocess


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    root = args.root.resolve()
    if not shutil.which('ffmpeg'):
        parser.error('ffmpeg is required for Ogg export. WAV files work without it.')
    manifest_path = root / 'audio-manifest.json'
    manifest = json.loads(manifest_path.read_text())
    (root / 'audio/ogg').mkdir(parents=True, exist_ok=True)

    def convert(entry):
        rel = f"audio/ogg/{entry['id']}.ogg"
        out = root / rel
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',
                        '-i',str(root/entry['files']['wav']),'-c:a','libvorbis',
                        '-q:a','5','-map_metadata','-1',str(out)], check=True)
        entry['files']['ogg'] = rel
        entry['oggBytes'] = out.stat().st_size
        entry['oggSha256'] = hashlib.sha256(out.read_bytes()).hexdigest()
        return entry

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        manifest['entries'] = list(pool.map(convert, manifest['entries']))
    manifest['webExport'] = {'codec':'Ogg Vorbis','quality':5,
                              'note':'Use decoded WAV buffers for precision looping. Compressed files are optional.'}
    manifest_path.write_text(json.dumps(manifest, indent=2)+'\n')
    print(f"Exported {len(manifest['entries'])} Ogg files.")

if __name__ == '__main__':
    main()
