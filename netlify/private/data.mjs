// Public-safe defaults. Import the real itinerary with supabase/seed.local.sql.
export const initial={hero:'/photos/oreum.webp',note:'먹고, 걷고, 쉬고. 우리만의 제주.',days:['THU','FRI','SAT','SUN'].map((weekday,i)=>({date:String(26+i),weekday,theme:`제주 여행 ${i+1}일차`,subtitle:'우리 페이스로 채워가는 하루',stops:i===0?[{id:'example-stop',name:'첫 번째 장소',time:'10:00',type:'관광',note:'일정 편집에서 장소를 추가해 주세요.',address:'',lat:'',lng:'',image:'/photos/coast.webp'}]:[]}))};
export const shopping=['물','간식','충전기'];
