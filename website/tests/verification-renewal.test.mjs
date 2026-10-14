import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../verification.mjs',import.meta.url),'utf8');
const start=source.indexOf('          const previous = await registry.verifiedGet');
const end=source.indexOf('\n        } finally {',start);
assert(start>=0&&end>start);
const run=new (Object.getPrototypeOf(async function(){}).constructor)('registry','pending','token','user','env','sealToken','assignVerifiedRole','fail', 'let already_verified=false,server_name,server_id,dm_sent=false,role_granted=false;'+source.slice(start,end));
test('Already verified accounts save newly approved renewable permission',async()=>{
 let saved=0,roles=0;const registry={record:async()=>{},verifiedGet:async()=>({id:'member'}),tokenSave:async(id,row)=>{assert.equal(id,'member');assert.equal(row.encrypted,true);saved++;}};
 await run(registry,{server:{id:'server',name:'Server'},future_consent:true},{access_token:'fixture',refresh_token:'fixture-refresh',expires_in:3600},{id:'member',username:'Fixture'},{},async()=>({encrypted:true}),async()=>{roles++;},m=>Error(m));
 assert.equal(saved,1);assert.equal(roles,1);
});
test('Already verified accounts without new consent do not create or erase permission',async()=>{
 await run({record:async()=>{},verifiedGet:async()=>({id:'member'}),tokenSave:async()=>assert.fail('No new consent'),tokenDelete:async()=>assert.fail('Do not erase existing permission')},{server:{id:'server',name:'Server'},future_consent:false},{},{id:'member'},{},async()=>assert.fail(),async()=>true,m=>Error(m));
});
