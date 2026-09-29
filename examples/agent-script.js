// Trusted starter source for import into the QuickJS/WASM agent runtime.
// This is a simple flag chaser, not a trained or robust navigation policy.
let decisions = 0;
function reset(context) {
  decisions = 0;
}
function wrapAngle(a) {
  return ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
}
function act(obs, api) {
  decisions += 1;
  const home = obs.bases.find(b => b.teamId === obs.teamId);
  const enemyBase = obs.bases.find(b => b.teamId !== obs.teamId);
  if (!home || !enemyBase) throw new Error('Both public bases are required.');
  const enemyFlag = obs.flags.find(f => f.ownerTeamId !== obs.teamId);
  const ownFlag = obs.flags.find(f => f.ownerTeamId === obs.teamId);
  const actions = [];
  for (const ship of obs.ships) {
    if (!ship.alive) continue; // Missing/dead ships receive neutral control.
    const recovering = ownFlag && ownFlag.known &&
      (ownFlag.state === 'in-water' || ownFlag.state === 'on-land');
    const target = ship.carriedFlagId ? home.deliveryZone.center :
      recovering ? ownFlag.position :
      enemyFlag && enemyFlag.known && enemyFlag.position ? enemyFlag.position : enemyBase.approach;
    const error = wrapAngle(Math.atan2(target.y-ship.position.y,target.x-ship.position.x)-ship.heading);
    const legal = obs.legal[ship.id];
    let interaction = { type: 'none' };
    if (legal && legal.pickupFlagIds.length) interaction = {type:'pickup',flagId:legal.pickupFlagIds[0]};
    const fireTarget = obs.enemies.filter(enemy => enemy.alive && legal && legal.fireTargetShipIds.includes(enemy.id))
      .sort((a,b) => Math.hypot(a.position.x-ship.position.x,a.position.y-ship.position.y)-Math.hypot(b.position.x-ship.position.x,b.position.y-ship.position.y) || a.id.localeCompare(b.id))[0];
    const fire = Boolean(legal && legal.canFire && fireTarget);
    const farFromHome = Math.hypot(ship.position.x-home.deliveryZone.center.x,ship.position.y-home.deliveryZone.center.y) > 460;
    const nearestThreat = obs.enemies.filter(enemy => enemy.alive).sort((a,b) => Math.hypot(a.position.x-ship.position.x,a.position.y-ship.position.y)-Math.hypot(b.position.x-ship.position.x,b.position.y-ship.position.y) || a.id.localeCompare(b.id))[0];
    const safeToScuttle = !nearestThreat;
    const scuttle = Boolean(legal && legal.canScuttle && !ship.carriedFlagId && !legal.pickupFlagIds.length && ship.health <= 20 && farFromHome && safeToScuttle);
    actions.push({shipId:ship.id,throttle:Math.abs(error)<.8 ? 1 : .25,
      turn:Math.max(-1,Math.min(1,error/.5)),fire,fireTargetShipId:fireTarget ? fireTarget.id : null,scuttle,interact:interaction});
  }
  return {actions};
}
