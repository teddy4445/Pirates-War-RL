export const denseWorkerControllerSource = `
function reset() {}
function mask(obs, ship) {
  const legal=obs.legal[ship.id], result=Array(22).fill(false);
  if (!ship.alive) { result[4]=true; return result; }
  for (let i=0;i<9;i++) result[i]=true;
  if (legal.canFire) for (let i=9;i<18;i++) result[i]=true;
  result[18]=legal.pickupFlagIds.length>0; result[19]=legal.giveTargetShipIds.length>0; result[20]=legal.placementSiteIds.length>0; result[21]=legal.canDrop;
  return result;
}
async function act(obs, api) {
  const ships=obs.ships.filter(ship=>ship.alive).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  if (!ships.length) return {actions:[]};
  const outputs=await api.predict("policy",ships.map(ship=>api.encodeShipV1(ship.id)));
  return {actions:ships.map((ship,row)=>{const allowed=mask(obs,ship), values=outputs[row]; let best=allowed.findIndex(Boolean); for(let i=best+1;i<22;i++) if(allowed[i]&&values[i]>values[best]) best=i; return api.decodeDiscreteV1(ship.id,best);})};
}`;
