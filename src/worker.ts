export interface Env { DB: D1Database; ASSETS: Fetcher; BOOTSTRAP_SECRET?: string }
const json=(body:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const bytes=(n=32)=>crypto.getRandomValues(new Uint8Array(n));
const hex=(b:Uint8Array)=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const sha=async(s:string)=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))));
async function hashPassword(password:string,salt:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:210000,hash:'SHA-256'},key,256)))}
const cookie=(token:string,maxAge:number)=>`cs_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=${maxAge}`;
const clean=(s:unknown)=>typeof s==='string'?s.trim():'';
const validEmail=(s:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)&&s.length<=254;
const allowedOrigin=(req:Request)=>{const origin=req.headers.get('origin');return !origin||origin===new URL(req.url).origin};
async function payload(req:Request){try{return await req.json() as Record<string,unknown>}catch{return null}}
async function session(req:Request,env:Env){const token=req.headers.get('cookie')?.match(/(?:^|;\s*)cs_session=([^;]+)/)?.[1];if(!token)return null;return env.DB.prepare('SELECT users.id,users.email,users.display_name,users.role FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?').bind(await sha(token),Date.now()).first<{id:string;email:string;display_name:string;role:string}>()}
function checkWorkspace(d:any){return d&&typeof d==='object'&&!Array.isArray(d)&&['purchases','items','movements','products','batches','orders','posts'].every(k=>Array.isArray(d[k]))&&d.settings&&typeof d.settings==='object'}
async function handler(req:Request,env:Env):Promise<Response>{
 const path=new URL(req.url).pathname;
 if(!path.startsWith('/api/'))return env.ASSETS.fetch(req);
 if(!allowedOrigin(req))return json({error:'Invalid origin'},403);
 if(!['GET','POST','PUT'].includes(req.method))return json({error:'Method not allowed'},405);
 if(path==='/api/health')return json({ok:true});
 if(path==='/api/setup'&&req.method==='POST'){
  const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{n:number}>();
  if((count?.n||0)>0)return json({error:'Workspace already initialized'},409);
  if(!env.BOOTSTRAP_SECRET||env.BOOTSTRAP_SECRET.length<20)return json({error:'Server setup secret not configured'},503);
  const b=await payload(req);if(!b||clean(b.setupCode)!==env.BOOTSTRAP_SECRET)return json({error:'Invalid setup code'},403);
  const email=clean(b.email).toLowerCase(),password=clean(b.password),name=clean(b.name);
  if(!validEmail(email)||password.length<12||name.length<2)return json({error:'Valid email, name and 12+ character password required'},400);
  const salt=hex(bytes(16)),id=crypto.randomUUID();
  try{await env.DB.prepare('INSERT INTO users(id,email,display_name,password_hash,salt,role) VALUES(?,?,?,?,?,?)').bind(id,email,name,await hashPassword(password,salt),salt,'admin').run()}catch{return json({error:'Setup failed; retry or sign in'},409)}
  return json({ok:true});
 }
 if(path==='/api/login'&&req.method==='POST'){
  const b=await payload(req);const email=clean(b?.email).toLowerCase(),password=clean(b?.password);
  const user=await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first<any>();
  const dummySalt='00000000000000000000000000000000';
  const computed=await hashPassword(password,user?.salt||dummySalt);
  if(!user||computed!==user.password_hash)return json({error:'Incorrect email or password'},401);
  const token=hex(bytes(32)),age=60*60*24*7;
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await sha(token),user.id,Date.now()+age*1000).run();
  return json({user:{id:user.id,email:user.email,name:user.display_name,role:user.role}},200,{'set-cookie':cookie(token,age)});
 }
 const user=await session(req,env);
 if(!user)return json({error:'Not signed in'},401);
 if(path==='/api/me'&&req.method==='GET')return json({user:{id:user.id,email:user.email,name:user.display_name,role:user.role}});
 if(path==='/api/logout'&&req.method==='POST'){
  const token=req.headers.get('cookie')?.match(/(?:^|;\s*)cs_session=([^;]+)/)?.[1];
  if(token)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha(token)).run();
  return json({ok:true},200,{'set-cookie':cookie('',0)});
 }
 if(path==='/api/workspace'&&req.method==='GET'){
  const row=await env.DB.prepare('SELECT data,revision FROM workspace WHERE id=1').first<{data:string;revision:number}>();
  return json({data:row?JSON.parse(row.data):null,revision:row?.revision??0});
 }
 if(path==='/api/workspace'&&req.method==='PUT'){
  const b=await payload(req);
  if(!b||!checkWorkspace(b.data)||!Number.isInteger(b.revision))return json({error:'Invalid workspace data or revision'},400);
  const serialized=JSON.stringify(b.data);if(serialized.length>2_000_000)return json({error:'Workspace exceeds 2 MB'},413);
  const current=await env.DB.prepare('SELECT revision FROM workspace WHERE id=1').first<{revision:number}>();
  if(!current){
   if(b.revision!==0)return json({error:'Outdated workspace; reload'},409);
   const inserted=await env.DB.prepare('INSERT OR IGNORE INTO workspace(id,data,revision,updated_by) VALUES(1,?,1,?)').bind(serialized,user.id).run();
   if(!inserted.meta.changes)return json({error:'Workspace changed; reload'},409);
   await env.DB.prepare('INSERT INTO activity(user_id,action,revision) VALUES(?,?,?)').bind(user.id,'workspace.save',1).run();
   return json({revision:1});
  }
  const result=await env.DB.prepare('UPDATE workspace SET data=?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=?').bind(serialized,user.id,b.revision).run();
  if(!result.meta.changes)return json({error:'Workspace changed by another user; reload before saving'},409);
  const revision=(b.revision as number)+1;
  await env.DB.prepare('INSERT INTO activity(user_id,action,revision) VALUES(?,?,?)').bind(user.id,'workspace.save',revision).run();
  return json({revision});
 }
 if(path==='/api/users'&&req.method==='GET'){
  const users=await env.DB.prepare('SELECT id,email,display_name AS name,role FROM users ORDER BY created_at').all();
  return json({users:users.results});
 }
 if(path==='/api/users'&&req.method==='POST'){
  if(user.role!=='admin')return json({error:'Admin only'},403);
  const b=await payload(req);const email=clean(b?.email).toLowerCase(),name=clean(b?.name),password=clean(b?.password);
  if(!validEmail(email)||name.length<2||password.length<12)return json({error:'Valid email, name and 12+ character password required'},400);
  const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{n:number}>();
  if((count?.n||0)>=2)return json({error:'This workspace is limited to two accounts'},409);
  const salt=hex(bytes(16));
  try{await env.DB.prepare('INSERT INTO users(id,email,display_name,password_hash,salt,role) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),email,name,await hashPassword(password,salt),'member').run()}catch{return json({error:'Email already registered'},409)}
  return json({ok:true},201);
 }
 if(path==='/api/password'&&req.method==='POST'){
  const b=await payload(req);const old=clean(b?.currentPassword),next=clean(b?.newPassword);
  if(next.length<12)return json({error:'New password must contain at least 12 characters'},400);
  const stored=await env.DB.prepare('SELECT salt,password_hash FROM users WHERE id=?').bind(user.id).first<{salt:string;password_hash:string}>();
  if(!stored||await hashPassword(old,stored.salt)!==stored.password_hash)return json({error:'Current password is incorrect'},403);
  const salt=hex(bytes(16));await env.DB.prepare('UPDATE users SET salt=?,password_hash=? WHERE id=?').bind(salt,await hashPassword(next,salt),user.id).run();
  await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id).run();
  return json({ok:true},200,{'set-cookie':cookie('',0)});
 }
 return json({error:'Not found'},404);
}
export default {fetch(req:Request,env:Env){return handler(req,env).catch(e=>{console.error('API failure',e);return json({error:'Server error'},500)})}};
