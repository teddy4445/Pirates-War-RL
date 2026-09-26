// Copy this as agent.js inside a real, validated model package.
// The platform provides the helpers; no TensorFlow code runs in the guest.
function reset(context) {}
function argmaxFinite(values) {
  if (!Array.isArray(values) || values.length !== 22) throw new Error('Expected 22 model scores.');
  let best = 0;
  for (let i=0;i<values.length;i++) {
    if (!Number.isFinite(values[i])) throw new Error('Non-finite model output.');
    if (values[i]>values[best]) best=i;
  }
  return best;
}
async function act(obs, api) {
  const ships=obs.ships.filter(s=>s.alive).sort((a,b)=>a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (!ships.length) return {actions:[]};
  const inputs=ships.map(ship=>api.encodeShipV1(ship.id));
  const outputs=await api.predict('policy',inputs);
  if (!Array.isArray(outputs) || outputs.length !== ships.length) throw new Error('Model batch mismatch.');
  return {actions:ships.map((ship,i)=>api.decodeDiscreteV1(ship.id,argmaxFinite(outputs[i])))};
}
