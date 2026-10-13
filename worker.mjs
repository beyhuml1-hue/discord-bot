import {gatewayTick} from './gateway.mjs';
import verification, {VerificationRegistry as ExistingRegistry} from './verification.mjs';
import {manager, interactions, configurePrimary, processAITickets, checkServerJoins, notifyTransfer, handlePrefix} from './manager.mjs';
export class VerificationRegistry extends ExistingRegistry {
  constructor(state,env){super(state,env);this.env=env;}
  async ensureAIAlarm(){await gatewayTick(this,this.env,this,handlePrefix);if(!await this.state.storage.getAlarm())await this.state.storage.setAlarm(Date.now()+1000);}
  async alarm(){await this.state.storage.setAlarm(Date.now()+15000);await gatewayTick(this,this.env,this,handlePrefix);await processAITickets(this.env,this);}
  async aiReserve(channel,message){return this.state.storage.transaction(async tx=>{const key='bot:ai-claim:'+channel+':'+message,previous=await tx.get(key);if(previous&&!(previous.status==='generation_failed'&&Date.now()-previous.created_at>15000))return false;const day=new Date().toISOString().slice(0,10),budget=await tx.get('bot:ai-budget')||{day,count:0};if(budget.day!==day){budget.day=day;budget.count=0;}if(budget.count>=100)return false;budget.count++;await tx.put('bot:ai-budget',budget);await tx.put(key,{status:'reserved',created_at:Date.now()});return true;});}
  async aiStatus(){return {available:Boolean(this.env.AI),model:'@cf/meta/llama-3.2-3b-instruct',budget:await this.botGet('ai-budget')||null};}
  async botGet(key){return this.state.storage.get('bot:'+key);}
  async botPut(key,value){await this.state.storage.put('bot:'+key,value);}
  async botPatch(key,changes){return this.state.storage.transaction(async tx=>{const old=await tx.get('bot:'+key);if(!old)return null;const row={...old,...changes};await tx.put('bot:'+key,row);return row;});}
  async botList(prefix,limit=200){return Array.from((await this.state.storage.list({prefix:'bot:'+prefix,limit})).values());}
  async botClaim(key,value){return this.state.storage.transaction(async tx=>{if(await tx.get('bot:'+key))return false;await tx.put('bot:'+key,value);return true;});}
  async voucherClaim(bot,code,user){return this.state.storage.transaction(async tx=>{const key='bot:voucher:'+bot+':'+code,v=await tx.get(key);if(!v||v.disabled||v.expires<=Date.now())throw Error('This voucher is unavailable or expired.');const claim='bot:claim:'+bot+':'+code+':'+user;if(await tx.get(claim))throw Error('You already claimed this voucher.');if(v.used>=v.limit)throw Error('This voucher has reached its claim limit.');v.used++;await tx.put(key,v);const row={bot,code,user,status:v.role?'pending':'claimed',created_at:Date.now(),reward:v.reward,role:v.role,guild:v.guild};await tx.put(claim,row);return row;});}
  async botAudit(row){const key='audit:'+String(9999999999999-Date.now())+':'+crypto.randomUUID();await this.botPut(key,{...row,created_at:Date.now()});const rows=await this.state.storage.list({prefix:'bot:audit:',limit:1000});const old=[...rows.keys()].slice(300);if(old.length)await this.state.storage.delete(old);}
}
const VERIFY='https://verify.lb000.xyz',BOT='https://bot.lb000.xyz';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const cookie=(req,name)=>String(req.headers.get('cookie')||'').split(/;\s*/).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';
const digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
const nonce=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
const redirect=(url,cookies=[])=>{const h=new Headers({Location:url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});for(const c of cookies)h.append('Set-Cookie',c);return new Response(null,{status:303,headers:h});};
function assetHeaders(r){const h=new Headers(r.headers);h.set('Cache-Control','no-store');h.set('X-Content-Type-Options','nosniff');h.set('X-Frame-Options','DENY');h.set('Referrer-Policy','no-referrer');h.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://cdn.discordapp.com; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");return new Response(r.body,{status:r.status,headers:h});}
export default {
  async scheduled(event,env,ctx){if(event.cron==='17 3 * * *')verification.scheduled(event,env,ctx);ctx.waitUntil(env.REGISTRY.getByName('community').ensureAIAlarm());ctx.waitUntil(checkServerJoins(env,env.REGISTRY.getByName('community')));},
  async fetch(req,env,ctx){
    const u=new URL(req.url),r=env.REGISTRY.getByName('community');
    try{
      if(u.origin===BOT&&u.pathname.startsWith('/interactions/'))return interactions(req,env,r,ctx);
      if(u.origin===VERIFY&&u.pathname==='/owner/start'){
        const n=u.searchParams.get('nonce');if(!/^[a-f0-9]{64}$/.test(n||''))return json({error:'Start sign-in from the bot dashboard.'},400);
        const start=await verification.fetch(new Request(VERIFY+'/api/oauth/start',{method:'POST',headers:{Origin:VERIFY,'Content-Type':'application/json','CF-Connecting-IP':req.headers.get('CF-Connecting-IP')||'unknown'},body:JSON.stringify({admin:true})}),env);
        const data=await start.json();if(!start.ok)return json(data,start.status);
        return redirect(data.url,[...start.headers.getSetCookie(),`bot_login_nonce=${n}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`]);
      }
      if(u.origin===VERIFY&&u.pathname==='/oauth/callback'){
        const result=await verification.fetch(req,env);
        if(result.status===303&&result.headers.get('location')==='/admin'){
          const n=cookie(req,'bot_login_nonce');if(!/^[a-f0-9]{64}$/.test(n))return redirect(BOT);
          const c=result.headers.getSetCookie().find(x=>x.startsWith('verify_session='));if(!c)return json({error:'Sign-in could not finish.'},503);
          const t=nonce();await r.statePut(await digest('handoff:'+t),{nonce:n,session:c.split(';')[0].slice('verify_session='.length),expires:Date.now()+60000});
          return redirect(BOT+'/auth/finish?ticket='+t,[...result.headers.getSetCookie(),'bot_login_nonce=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0']);
        }return result;
      }
      if(u.origin===VERIFY&&['/admin','/admin/','/admin.html'].includes(u.pathname))return redirect(BOT+'/admin');
      if(u.origin===VERIFY&&u.pathname.startsWith('/api/admin'))return json({error:'Manage members at bot.lb000.xyz.'},403);
      if(u.origin!==BOT)return verification.fetch(req,env);
      if(u.pathname==='/auth/finish'){
        const t=u.searchParams.get('ticket')||'';if(!/^[a-f0-9]{64}$/.test(t))return redirect(BOT+'/?error=Sign-in+expired');
        const d=await r.stateTake(await digest('handoff:'+t));if(!d||d.nonce!==cookie(req,'bot_login_nonce'))return redirect(BOT+'/?error=Start+sign-in+again');
        return redirect(BOT,[`verify_session=${d.session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`,'bot_login_nonce=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0']);
      }
      if(u.pathname==='/api/login'||u.pathname==='/api/oauth/start'){
        if(req.method!=='POST'||req.headers.get('origin')!==BOT)return json({error:'Invalid origin.'},403);
        const n=nonce();return new Response(JSON.stringify({url:VERIFY+'/owner/start?nonce='+n}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':`bot_login_nonce=${n}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`}});
      }
      if(u.pathname.startsWith('/api/manage/'))return manager(req,{...env,PUBLIC_ORIGIN:BOT},r);
      if(u.pathname==='/api/setup-primary'&&req.method==='POST'){
        // Deployment-only setup uses an existing server secret and never runs from a public GET.
        if(!env.BOT_DEPLOY_KEY||req.headers.get('authorization')!=='Bearer '+env.BOT_DEPLOY_KEY)return json({error:'Setup authorization required.'},403);
        const result=await configurePrimary(env,r);await checkServerJoins(env,r);return json({...result,gateway:await r.botGet('gateway-status')});
      }
      if(u.pathname.startsWith('/api/')){const result=await verification.fetch(req,{...env,PUBLIC_ORIGIN:BOT});if(result.ok&&req.method==='POST'&&['/api/admin/transfer','/api/admin/retry'].includes(u.pathname)){const data=await result.clone().json();ctx.waitUntil(notifyTransfer(env,r,data));}return result;}
      const a=new URL(req.url);if(u.pathname==='/')a.pathname='/dashboard.html';
      if(u.pathname==='/admin'||u.pathname==='/admin/')a.pathname='/admin.html';
      return assetHeaders(await env.ASSETS.fetch(new Request(a,req)));
    }catch(e){return json({error:e.status?e.message:'The service could not complete this action. Please try again.'},e.status||503);}
  }
};
