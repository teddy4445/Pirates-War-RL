import { FleetRLAudio } from './fleetrl-audio.js';

// Copy audio/, audio-manifest.json and this helper into your app's public assets.
const audio = await FleetRLAudio.fromManifest('/assets/fleetrl-audio/audio-manifest.json');

document.querySelector('#enable-audio').addEventListener('click', async () => {
  await audio.unlock();
  await audio.preload(); // The user can use the game silently while this loads.
  void audio.play('ui_confirm');
});

// Adapter illustration: replace engine event names with the game's exact schema.
export function presentShot(event, viewer) {
  // Compute this from the authorized observation/presentation layer, not audio.
  const permitted = viewer.mode === 'omniscient-spectator' || viewer.visibleEventIds.has(event.id);
  void audio.playEvent('cannon_fire', event, { permitted, pan: 0 });
}
export function onReplaySeek() { audio.resetTimeline(); }
export function onFastReplay(rate) { if (rate > 2) audio.stopAll(); }
export { audio };
