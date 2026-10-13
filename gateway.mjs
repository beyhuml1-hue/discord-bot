export async function gatewayTick(host,env,r,handlePrefix){
 if(host.gateway?.readyState===1)return;
 if(host.gatewayConnecting)return;
 const stored=await r.botGet('gateway-session'),last=await r.botGet('gateway-attempt');if(last&&Date.now()-last.at<60000)return;
 const budget=await r.botGet('gateway-identifies')||{day:'',count:0},day=new Date().toISOString().slice(0,10);if(budget.day!==day){budget.day=day;budget.count=0;}if(!stored?.session_id&&budget.count>=100){await r.botPut('gateway-status',{ready:false,error:'Daily connection retry budget reached.'});return;}
 host.gatewayConnecting=true;await r.botPut('gateway-attempt',{at:Date.now()});
 try{let url=stored?.resume_gateway_url;if(!url){const response=await fetch('https://discord.com/api/v10/gateway/bot',{headers:{Authorization:'Bot '+env.DISCORD_BOT_TOKEN}});if(!response.ok)throw Error('Discord gateway discovery failed.');url=(await response.json()).url;}const endpoint=new URL(url);endpoint.protocol='https:';endpoint.search='?v=10&encoding=json';const response=await fetch(endpoint,{headers:{Upgrade:'websocket'}});if(!response.webSocket)throw Error('Discord gateway connection failed.');const ws=response.webSocket;host.gateway=ws;let seq=stored?.seq??null,ack=true,timer=null;let chain=Promise.resolve();
 const stop=()=>{clearInterval(timer);if(host.gateway===ws)host.gateway=null;};
 const heartbeat=()=>{if(ws.readyState!==1)return;if(!ack){ws.close(4000,'Heartbeat timeout');return;}ack=false;ws.send(JSON.stringify({op:1,d:seq}));};
 ws.addEventListener('message',event=>{chain=chain.then(async()=>{const p=JSON.parse(event.data);if(p.s!==null&&p.s!==undefined)seq=p.s;
 if(p.op===10){timer=setInterval(heartbeat,p.d.heartbeat_interval);heartbeat();if(stored?.session_id)ws.send(JSON.stringify({op:6,d:{token:env.DISCORD_BOT_TOKEN,session_id:stored.session_id,seq:stored.seq}}));else{budget.count++;await r.botPut('gateway-identifies',budget);ws.send(JSON.stringify({op:2,d:{token:env.DISCORD_BOT_TOKEN,intents:33281,properties:{os:'linux',browser:'Everything Bots',device:'Everything Bots'}}}));}}
 if(p.op===11)ack=true;if(p.op===1)heartbeat();if(p.op===7){ws.close(4000,'Reconnect');}if(p.op===9){if(!p.d)await r.botPut('gateway-session',null);ws.close(4000,'Session retry');}
 if(p.t==='READY'){await r.botPut('gateway-session',{session_id:p.d.session_id,resume_gateway_url:p.d.resume_gateway_url,seq});await r.botPut('gateway-status',{ready:true,at:Date.now()});}
 if(p.t==='RESUMED')await r.botPut('gateway-status',{ready:true,at:Date.now()});
 if(p.t==='MESSAGE_CREATE')await handlePrefix(env,r,p.d);
 if(p.op===0){const session=await r.botGet('gateway-session');if(session)await r.botPut('gateway-session',{...session,seq});}
 }).catch(async()=>{await r.botPut('gateway-status',{ready:ws.readyState===1,error:'An incoming event could not be processed.',at:Date.now()});});});
 ws.addEventListener('close',event=>{stop();r.botPut('gateway-status',{ready:false,code:event.code,at:Date.now()});if([4007,4009].includes(event.code))r.botPut('gateway-session',null);});ws.addEventListener('error',stop);ws.accept();await r.botPut('gateway-status',{ready:false,connecting:true,at:Date.now()});
 }catch(e){await r.botPut('gateway-status',{ready:false,error:e.message,at:Date.now()});}finally{host.gatewayConnecting=false;}
}
