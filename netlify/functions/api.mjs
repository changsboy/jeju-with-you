import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { initial, shopping } from '../private/data.mjs';

const COOKIE='jeju_session';
const MONTH=30*24*60*60;
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(statusCode,data,extra={})=>({statusCode,headers:{...headers,...extra},body:JSON.stringify(data)});
const secret=()=>process.env.COOKIE_SECRET||'';
const sign=(value)=>crypto.createHmac('sha256',secret()).update(process.env.APP_PASSWORD || '').update('\0').update(value).digest('hex');
const safeEqual=(a,b)=>{const A=Buffer.from(String(a)),B=Buffer.from(String(b));return A.length===B.length&&crypto.timingSafeEqual(A,B)};
const sessionToken=()=>{const data=String(Date.now()+MONTH*1000);return `${data}.${sign(data)}`};
const authorized=(event)=>{
 const raw=event.headers.cookie||event.headers.Cookie||'';
 const token=raw.split(';').map(s=>s.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(!token)return false;
 const [expiry,mac,...rest]=token.split('.');
 return !rest.length&&/^\d{13}$/.test(expiry)&&Number(expiry)>Date.now()&&safeEqual(mac,sign(expiry));
};
const cookie=(value,age)=>`${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const service=()=>{
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error('Supabase environment variables not configured');
 return {url:url.replace(/\/$/,''),key};
};
async function db(path,options={}){
 const {url,key}=service();
 const r=await fetch(`${url}${path}`,{...options,headers:{apikey:key,Authorization:`Bearer ${key}`,...(options.headers||{})}});
 if(!r.ok)throw new Error(`Storage/database request failed (${r.status}): ${(await r.text()).slice(0,160)}`);
 return r;
}
function validState(data){
 const text=(x)=>typeof x==='string'&&x.length<=5000;
 const image=(x)=>typeof x==='string'&&(/^[\/]photos\/[a-z-]+\.webp$/.test(x)||/^uploaded:[a-f0-9-]{36}\.(jpg|png|webp)$/.test(x));
 if(!data||!Array.isArray(data.days)||data.days.length!==4||!text(data.note)||!image(data.hero))return false;
 const ids=new Set();
 return data.days.every(d=>d&&['date','weekday','theme','subtitle'].every(k=>text(d[k]))&&Array.isArray(d.stops)&&d.stops.length<=100&&d.stops.every(s=>{
  if(!s||!['id','name','time','type','note','address'].every(k=>text(s[k]))||!s.name.trim()||!image(s.image)||ids.has(s.id))return false;
  ids.add(s.id);return ['lat','lng'].every(k=>s[k]===''||(Number.isFinite(Number(s[k]))&&Math.abs(Number(s[k]))<=(k==='lat'?90:180)));
 }))&&(!data.shopping||Array.isArray(data.shopping)&&data.shopping.every(text))&&(!data.shoppingDone||Array.isArray(data.shoppingDone)&&data.shoppingDone.every(text));
}
export async function handler(event){
 try{
  if(!process.env.APP_PASSWORD||!secret())return reply(503,{error:'서버 설정이 완료되지 않았어요.'});
  const action=event.queryStringParameters?.action||'state';
  const method=event.httpMethod;
  if (!['GET','POST','PUT'].includes(method)) return reply(405,{error:'지원하지 않는 요청이에요.'});
  const origin=event.headers.origin||event.headers.Origin;
  const host=event.headers.host||event.headers.Host;
  if(method!=='GET' && origin && (!host || new URL(origin).host!==host)) return reply(403,{error:'허용되지 않은 요청이에요.'});
  if(action==='login'&&method==='POST'){
   const input=JSON.parse(event.body||'{}');
   if(!safeEqual(input.password||'',process.env.APP_PASSWORD))return reply(401,{error:'비밀번호가 달라요.'});
   const token=sessionToken();
   return reply(200,{ok:true},{'Set-Cookie':cookie(token,MONTH)});
  }
  if(action==='logout'&&method==='POST')return reply(200,{ok:true},{'Set-Cookie':cookie('',0)});
  if(!authorized(event))return reply(401,{error:'로그인이 필요해요.'});
  if(action==='check'&&method==='GET')return reply(200,{ok:true});
  if(action==='state'&&method==='GET'){
   const r=await db('/rest/v1/trip_state?id=eq.1&select=data,updated_at');
   const rows=await r.json();
   if (!rows?.[0]) return reply(503,{error:'Supabase 초기 설정이 필요해요.'});
   return reply(200,{data:rows[0].data?.days?.length ? rows[0].data : {...initial,shopping,shoppingDone:[]},revision:rows[0].updated_at});
  }
  if(action==='state'&&method==='PUT'){
   const body=JSON.parse(event.body||'{}');
   if(!validState(body.data)||typeof body.revision!=='string'||JSON.stringify(body.data).length>250000)return reply(400,{error:'잘못된 일정 데이터예요.'});
   const revision=new Date().toISOString();
   const r=await db(`/rest/v1/trip_state?id=eq.1&updated_at=eq.${encodeURIComponent(body.revision)}`,{method:'PATCH',headers:{'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify({data:body.data,updated_at:revision})});
   const rows=await r.json();
   if(!rows.length)return reply(409,{error:'다른 기기에서 먼저 저장했어요. 변경 내용은 보존되어 있어요. 최신 일정 불러오기 후 다시 수정해 주세요.'});
   return reply(200,{ok:true,revision:rows[0].updated_at});
  }
  if(action==='upload'&&method==='POST'){
   const body=JSON.parse(event.body||'{}');
   const allowed=['image/jpeg','image/png','image/webp'];
   if(!allowed.includes(body.type)||typeof body.base64!=='string'||body.base64.length>5_500_000)return reply(400,{error:'5MB 미만 JPG·PNG·WEBP만 가능해요.'});
   const bytes=Buffer.from(body.base64,'base64');
   if(bytes.length>4_000_000)return reply(400,{error:'사진을 더 작게 줄여주세요.'});
   const ext=body.type==='image/jpeg'?'jpg':body.type==='image/png'?'png':'webp';
   const path=`${crypto.randomUUID()}.${ext}`;
   await db(`/storage/v1/object/trip-private/${path}`,{method:'POST',headers:{'Content-Type':body.type,'x-upsert':'false'},body:bytes});
   return reply(200,{path});
  }
  if(action==='stock'&&method==='GET'){
   const name=event.queryStringParameters?.name||'';
   if(!/^(sashimi|brunch|hairtail|camellia|coast|tangerine|cafe|ranch|oreum|sea-cafe|soup|bbq)\.webp$/.test(name)) return reply(404,{error:'사진이 없어요.'});
   const buffer=await readFile(`${process.cwd()}/netlify/private/photos/${name}`);
   return {statusCode:200,isBase64Encoded:true,headers:{'Content-Type':'image/webp','Cache-Control':'no-store'},body:buffer.toString('base64')};
  }
  if(action==='photo'&&method==='GET'){
   const path=event.queryStringParameters?.path||'';
   if(!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(path))return reply(400,{error:'잘못된 사진 경로예요.'});
   const r=await db(`/storage/v1/object/authenticated/trip-private/${path}`);
   const buffer=Buffer.from(await r.arrayBuffer());
   return {statusCode:200,isBase64Encoded:true,headers:{'Content-Type':r.headers.get('content-type')||'image/webp','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},body:buffer.toString('base64')};
  }
  return reply(404,{error:'찾을 수 없는 요청이에요.'});
 }catch(err){if(err instanceof SyntaxError)return reply(400,{error:'잘못된 요청 형식이에요.'});console.error(err.message);return reply(500,{error:'서버 요청 처리 중 문제가 생겼어요. 환경변수와 Supabase 설정을 확인해 주세요.'})}
}
