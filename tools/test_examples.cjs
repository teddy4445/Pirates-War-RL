#!/usr/bin/env node
/** Execute only the trusted bundled examples as fixtures. Node vm is NOT the product sandbox. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
function loadTrustedFixture(file) {
  const context=vm.createContext({Math,Number,Array,Boolean,Error});
  new vm.Script(fs.readFileSync(path.join(root,'examples',file),'utf8')).runInContext(context,{timeout:1000});
  assert.equal(typeof context.act,'function'); assert.equal(typeof context.reset,'function');
  return context;
}
const ship={id:'blue-0',teamId:'blue',position:{x:230,y:450},velocity:{x:0,y:0},heading:0,
 health:100,alive:true,cooldownTicks:0,respawnTicksRemaining:0,protectionTicksRemaining:0,carriedFlagId:null};
const obs={apiVersion:'fleetrl-agent-v1',teamId:'blue',ships:[ship],enemies:[],
 bases:[{teamId:'blue',deliveryZone:{center:{x:200,y:450}},approach:{x:170,y:450}},
 {teamId:'rose',deliveryZone:{center:{x:1400,y:450}},approach:{x:1430,y:450}}],
 flags:[{id:'blue-flag',ownerTeamId:'blue',known:true,state:'at-home',position:{x:146,y:450}},
 {id:'rose-flag',ownerTeamId:'rose',known:false,state:'unknown',position:null}],
 legal:{'blue-0':{canFire:true,pickupFlagIds:[],giveTargetShipIds:[],placeSiteIds:[],canDrop:false}}};
function validate(result) {
 assert(Array.isArray(result.actions));
 const ids=new Set();
 for(const a of result.actions){
   assert.equal(a.shipId,'blue-0'); assert(!ids.has(a.shipId)); ids.add(a.shipId);
   assert(Number.isFinite(a.throttle)&&Math.abs(a.throttle)<=1);
   assert(Number.isFinite(a.turn)&&Math.abs(a.turn)<=1);
   assert.equal(typeof a.fire,'boolean'); assert.equal(typeof a.interact.type,'string');
 }
}
async function main(){
 const script=loadTrustedFixture('agent-script.js');script.reset({});
 const result=script.act(obs,{});validate(result);assert.equal(result.actions.length,1);
 assert.equal(result.actions[0].throttle,1);
 const dead=structuredClone(obs); dead.ships[0].alive=false;
 assert.equal(script.act(dead,{}).actions.length,0);
 const pickup=structuredClone(obs);pickup.legal['blue-0'].pickupFlagIds=['rose-flag'];
 assert.equal(script.act(pickup,{}).actions[0].interact.type,'pickup');
 const pack=JSON.parse(fs.readFileSync(path.join(root,'examples/constant-forward.agent.json'),'utf8'));
 const layer=pack.model.layers[0];
 const x=Array(64).fill(.42);
 const y=layer.bias.map((bias,j)=>bias+x.reduce((sum,value,i)=>sum+layer.weights[j*64+i]*value,0));
 assert.equal(y.length,22);assert.equal(y.indexOf(Math.max(...y)),7);
 const neural=loadTrustedFixture('neural-agent.js');neural.reset({});
 const api={encodeShipV1:id=>{assert.equal(id,'blue-0');return Array(64).fill(0);},
 predict:async(id,rows)=>{assert.equal(id,'policy');assert.equal(rows.length,1);return [y];},
 decodeDiscreteV1:(id,a)=>{assert.equal(a,7);return {shipId:id,throttle:1,turn:0,fire:false,interact:{type:'none'}};}};
 validate(await neural.act(obs,api));
 assert.equal((await neural.act(dead,api)).actions.length,0);
 await assert.rejects(neural.act(obs,{...api,predict:async()=>[Array(22).fill(NaN)]}),/Non-finite/);
 await assert.rejects(neural.act(obs,{...api,predict:async()=>[]}),/batch mismatch/);
 console.log('PASS: trusted script syntax/control fixtures; untrained Dense forward pass; async neural bridge shape, empty-fleet, and error fixtures.');
 console.log('These are trusted fixture checks; production QuickJS/TF.js/browser integration is covered by Vitest and Playwright.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
