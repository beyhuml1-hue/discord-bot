import {handlePrefix,checkServerJoins} from './manager.mjs';
export async function runtime(req,env,r){
 const fail=(error,status)=>Response.json({error},{status});
 if(req.method!=='POST')return fail('Use POST.',405);const timestamp=req.headers.get('X-Runtime-Time')||'',signature=req.headers.get('X-Runtime-Signature')||'',raw=await req.text();
 if(raw.length>12000||!/^\d+$/.test(timestamp)||Math.abs(Date.now()/1000-Number(timestamp))>60||!/^[a-f0-9]{64}$/.test(signature)||!env.DISCORD_BOT_TOKEN)return fail('Invalid runtime signature.',401);
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.DISCORD_BOT_TOKEN),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('HMAC',key,new Uint8Array(signature.match(/.{2}/g).map(x=>parseInt(x,16))),new TextEncoder().encode(timestamp+'.'+raw)))return fail('Invalid runtime signature.',401);
 let body;try{body=JSON.parse(raw);}catch{return fail('Invalid JSON.',400);}
 if(!/^[a-f0-9]{32}$/.test(body.nonce||'')||!await r.botClaim('runtime-request:'+body.nonce,{at:Date.now()}))return fail('Request already handled.',409);
 const action=new URL(req.url).pathname.split('/').pop();
 if(action==='heartbeat'){
 if(!/^[a-f0-9]{32}$/.test(body.instance||''))return fail('Invalid runtime instance.',400);
 const old=await r.botGet('python-runtime');if(old&&old.expires>Date.now()&&old.instance!==body.instance)return fail('Another Python instance is already active.',409);if(!old||old.instance!==body.instance){const slot='runtime-slot:'+Math.floor(Date.now()/90000);if(!await r.botClaim(slot,{instance:body.instance}))return fail('Wait up to 90 seconds before starting another instance.',409);}const lease={instance:body.instance,expires:Date.now()+90000};await r.botPut('python-runtime',lease);
 await r.ensureAIAlarm();return Response.json({ok:true,expires:lease.expires});
 }
 if(action==='release'){const lease=await r.botGet('python-runtime');if(lease?.instance===body.instance)await r.botPut('python-runtime',null);return Response.json({ok:true});}
 const lease=await r.botGet('python-runtime');if(!lease||lease.instance!==body.instance||lease.expires<Date.now())return fail('Runtime lease expired.',409);
 if(action==='joined'){await checkServerJoins(env,r);return Response.json({ok:true});}
 if(action==='message'){
 if(![body.channel_id,body.message_id].every(x=>/^\d{17,22}$/.test(x||'')))return fail('Invalid message ID.',400);
 const headers={Authorization:'Bot '+env.DISCORD_BOT_TOKEN};const [channel,message]=await Promise.all([fetch('https://discord.com/api/v10/channels/'+body.channel_id,{headers}),fetch('https://discord.com/api/v10/channels/'+body.channel_id+'/messages/'+body.message_id,{headers})]);if(!channel.ok||!message.ok)return fail('Discord could not read this command.',403);
 const ch=await channel.json(),m=await message.json();if(!ch.guild_id||m.author?.bot||m.webhook_id)return fail('Use a human command in a server.',400);
 await handlePrefix(env,r,{...m,guild_id:ch.guild_id,channel_id:ch.id});return Response.json({ok:true});
 }
 return fail('Unknown runtime action.',404);
}
