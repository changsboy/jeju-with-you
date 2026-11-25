import {test,expect} from '@playwright/test';
import {initial,shopping} from '../netlify/private/data.mjs';
test('two independent phones sync and preserve a conflicting draft',async({page,browser})=>{
 let data=structuredClone({...initial,shopping,shoppingDone:[]});let revision='1';
 const serve=async route=>{
  const action=new URL(route.request().url()).searchParams.get('action');
  if(action==='stock')return route.fulfill({contentType:'image/webp',path:'netlify/private/photos/cafe.webp'});
  if(action==='state'&&route.request().method()==='GET')return route.fulfill({json:{data,revision}});
  if(action==='state'){
   const body=route.request().postDataJSON();
   if(body.revision!==revision)return route.fulfill({status:409,json:{error:'다른 기기에서 먼저 저장했어요.'}});
   data=body.data;revision=String(+revision+1);return route.fulfill({json:{revision}});
  }
  return route.fulfill({status:404,json:{}});
 };
 const other=await browser.newContext({viewport:{width:390,height:844}});const phone=await other.newPage();
 try{
 await page.route('**/.netlify/functions/api?*',serve);await phone.route('**/.netlify/functions/api?*',serve);
await phone.clock.install();
await page.goto('/');await phone.goto('http://127.0.0.1:4173/');await expect(phone.getByRole('heading',{name:'첫 번째 장소'})).toBeVisible();

 const edit=async(p,name)=>{await p.getByRole('button',{name:'일정 편집',exact:true}).click();await p.getByRole('button',{name:'수정',exact:true}).click();await p.getByLabel('장소 이름').fill(name);await p.getByRole('button',{name:'수정 완료',exact:true}).click()};
 await edit(page,'첫 기기 저장');await page.getByRole('button',{name:'변경 저장',exact:true}).first().click();await expect(page.getByText('저장 완료',{exact:false})).toBeVisible();
 await phone.clock.fastForward(45000);await expect(phone.getByRole('heading',{name:'첫 기기 저장'})).toBeVisible();
 await edit(phone,'둘째 기기 미저장');await edit(page,'첫 기기 새 변경');await page.getByRole('button',{name:'변경 저장',exact:true}).first().click();
 await phone.clock.fastForward(45000);await expect(phone.getByRole('heading',{name:'둘째 기기 미저장'})).toBeVisible();
 await phone.getByRole('button',{name:'변경 저장',exact:true}).first().click();await expect(phone.getByRole('alert')).toContainText('다른 기기');expect(data.days[0].stops[0].name).toBe('첫 기기 새 변경');
 }finally{await other.close()}
});
