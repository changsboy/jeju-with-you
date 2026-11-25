import { test, expect } from '@playwright/test';
import { initial, shopping } from '../netlify/private/data.mjs';
test('mobile login, editing, conflict preservation, shopping and logout',async({page})=>{
 let logged=false;let data=structuredClone({...initial,shopping,shoppingDone:[]});let revision='1';let conflict=false;
 await page.route('**/.netlify/functions/api?*',async route=>{
  const action=new URL(route.request().url()).searchParams.get('action');const method=route.request().method();
  const respond=(status,body)=>route.fulfill({status,json:body});
  if(action==='login'){logged=route.request().postDataJSON().password==='demo';return respond(logged?200:401,logged?{ok:true}:{error:'비밀번호가 달라요.'})}
  if(action==='logout'){logged=false;return respond(200,{ok:true})}
  if(!logged)return respond(401,{error:'로그인이 필요해요.'});
  if(action==='stock')return route.fulfill({status:200,contentType:'image/webp',path:'netlify/private/photos/cafe.webp'});
  if(action==='state'&&method==='GET')return respond(200,{data,revision});
  if(action==='state'&&method==='PUT'){
   if(conflict)return respond(409,{error:'다른 기기에서 먼저 저장했어요.'});
   data=route.request().postDataJSON().data;revision=String(+revision+1);return respond(200,{revision});
  }
  return respond(404,{});
 });
 await page.goto('/');
 await page.getByPlaceholder('비밀번호 입력').fill('bad');await page.getByRole('button',{name:'우리 여행 열기'}).click();await expect(page.getByText('비밀번호가 달라요.')).toBeVisible();
 await page.getByPlaceholder('비밀번호 입력').fill('demo');await page.getByRole('button',{name:'우리 여행 열기'}).click();
 await expect(page.getByRole('heading',{name:'첫 번째 장소'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.getByRole('button',{name:'일정 편집'}).click();await page.getByRole('button',{name:'수정',exact:true}).first().click();
 await page.getByLabel('장소 이름').fill('공항 도착 테스트');await page.getByRole('button',{name:'수정 완료'}).click();
 conflict=true;await page.getByRole('button',{name:'변경 저장',exact:true}).first().click();await expect(page.getByRole('alert')).toContainText('다른 기기');await expect(page.getByRole('heading',{name:'공항 도착 테스트'})).toBeVisible();
 conflict=false;await page.getByRole('button',{name:'변경 저장',exact:true}).first().click();await expect(page.getByText('저장 완료',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'장보기',exact:true}).click();await page.getByRole('checkbox').first().check();await page.getByRole('button',{name:'변경 저장',exact:true}).click();expect(data.shoppingDone).toHaveLength(1);
 await page.getByRole('button',{name:'로그아웃'}).click();await expect(page.getByPlaceholder('비밀번호 입력')).toBeVisible();
});
