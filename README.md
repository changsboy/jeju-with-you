# Jeju, with you ♡

2026년 11월 26–29일 제주 여행을 위한 React + Vite 모바일 앱입니다. Netlify Functions가 공유 비밀번호를 확인하고 Supabase의 일정과 비공개 사진을 중계합니다.

## 실행과 검증

Node 22.12 이상을 사용합니다.

```sh
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:ui
```

`npm run dev`는 프런트엔드만 실행합니다. 실제 인증과 저장을 로컬에서 실행하려면 Netlify CLI의 `netlify dev`와 서버 환경변수가 필요합니다. API 단위 테스트는 Supabase 응답을 대체하고, 모바일 UI 테스트도 API 응답을 대체합니다. 실제 클라우드 연결 검증을 대신하지 않습니다.

## 기존 Netlify 사이트에 연결

1. Supabase SQL Editor에서 `supabase/schema.sql`을 실행합니다.
2. 원본 일정은 이 작업 컴퓨터의 `supabase/seed.local.sql`에 보존되어 있습니다. Git에는 포함되지 않습니다. 원본을 사용하려면 schema 실행 직후 이 SQL을 실행하세요. 이미 저장된 데이터는 덮어쓰지 않습니다.
3. 기존 Netlify 프로젝트 `statuesque-biscochitos-f0d7a6`의 Project configuration → Developer settings → Continuous deployment에서 저장소 연결 설정을 열고 `changsboy/jeju-with-you`의 `main`을 연결합니다. 기존 프로젝트에서 연결하면 사이트 이름을 유지할 수 있습니다.
4. 빌드 명령은 `npm run build`, publish 경로는 `dist`, Functions 경로는 `netlify/functions`입니다. `netlify.toml`에 기록되어 있습니다. Node 버전은 22를 선택합니다.
5. 아래 환경변수를 Netlify UI의 Environment variables에 설정합니다. Production 컨텍스트와 Functions 스코프(또는 All scopes)를 포함하고 재배포합니다. TOML에 비밀값을 적지 않습니다.

| 환경변수 | 값 |
| --- | --- |
| APP_PASSWORD | 둘이 공유하는 긴 비밀번호 |
| COOKIE_SECRET | `openssl rand -hex 32`로 생성하는 임의 값 |
| SUPABASE_URL | Supabase 프로젝트 URL |
| SUPABASE_SERVICE_ROLE_KEY | 서버 전용 service role 키 |

비밀값은 Git, 채팅, `VITE_` 변수에 넣지 않습니다. `.env.example`에는 이름만 참고할 수 있습니다.

## 사용법

- 비밀번호로 로그인하며 HttpOnly / Secure / SameSite=Lax 쿠키가 30일 유지됩니다.
- 일정 편집에서 장소 추가·수정·삭제·순서 변경 후 저장합니다. 날짜 이동은 미저장 변경을 유지합니다.
- 사진은 브라우저에서 압축한 후 업로드하며 바로 저장합니다. 업로드 시 현재 일정 변경도 함께 저장됩니다.
- 장보기 체크 후 변경 저장을 누르면 두 사람에게 공유됩니다.
- 편집하지 않을 때 45초마다 최신 상태를 확인합니다. 동시 저장은 버전 충돌을 표시하고 변경을 덮어쓰지 않습니다. 충돌 시 현재 수정 내용을 확인한 뒤 최신 일정 불러오기로 다시 시작합니다.
- 장소 이름 또는 지도 버튼을 누르면 상세정보·주소·메모·사진을 확인하고 네이버/카카오 지도를 고를 수 있습니다.
- 좌표가 있는 출발지/도착지는 두 지도 앱 모두 자동차 경로로 연결합니다. 현재 위치는 지도 앱에서 처리합니다. 좌표가 없으면 장소명·주소 검색으로 명확하게 표시합니다.
- 앱 실행 후 1.8초 동안 화면이 백그라운드로 가지 않으면 웹 지도로 전환합니다. 웹 지도로 열기 링크도 제공합니다. 앱 설치 여부 감지는 브라우저 제약으로 완벽하지 않아 실제 iOS/Android 기기 검증이 필요합니다.
- 방문 완료 체크, 한국 시간 기준 오늘 일정, 선택한 날짜의 첫 미방문 장소로 이동, 전체 일정 공유·복사를 지원합니다. 공유 버튼은 기기의 공유창을 열며 사용자가 대상을 선택합니다.
- 가장 최근에 삭제한 장소는 삭제 취소로 복원할 수 있습니다. 복원 후 다시 저장하세요. 최신 일정 불러오기/로그아웃/페이지 새로고침 시 취소 기록은 초기화됩니다.
- 업로드한 사진 삭제 시 기본 이미지로 되돌리고 저장한 뒤, 다른 장소에서 사용하지 않는 사진을 Storage에서 삭제합니다. 여러 장소가 같은 사진을 사용하면 파일을 보존합니다.

## 보안과 제한

일정과 모든 여행 이미지는 인증된 API로만 제공되며 정적 빌드에는 포함되지 않습니다. 저장소의 기본 일정은 개인정보가 없는 예시입니다. 로그인 페이지는 CSS 배경만 사용합니다. Supabase 테이블은 RLS를 켜고 anon/authenticated 접근 권한을 제거하며 사진 버킷은 private입니다.

비밀번호나 COOKIE_SECRET을 변경하면 기존 쿠키가 무효화됩니다. 로그아웃은 해당 브라우저의 쿠키를 제거합니다. 사진 응답에는 no-store를 적용합니다. 기기마다 별도 로그인이 필요합니다.

업로드는 JPG/PNG/WEBP를 지원하며 압축 후 최대 4MB입니다. 사진 교체나 장소 삭제로 생긴 이전 파일은 자동 정리하지 않습니다. 사진 삭제 버튼으로 삭제한 파일은 다른 곳에서 참조하지 않을 때 정리합니다. 로그인은 Netlify가 전달한 클라이언트 IP의 HMAC 기준으로 15분에 10회 제한됩니다. SQL 스키마를 실행해야 로그인 제한 함수가 준비됩니다. 사진 MIME과 파일 시그니처를 함께 검사합니다.

기본 이미지는 AI 생성 이미지이며 실제 업체 사진이 아닙니다. 실제 영업시간과 장소 정보는 별도로 확인하세요.

## 구현 근거와 남은 배포 확인

- [네이버 공식 URL Scheme](https://guide-gov.ncloud-docs.com/release-20260820/docs/naveropenapiv3-maps-url-scheme-url-scheme): 웹 URL을 appname에 전달하며 route/car와 search를 사용합니다.
- [카카오 공식 URL Scheme](https://apis.map.kakao.com/ios_v2/docs/getting-started/urlscheme/): route/search와 모바일 웹 대체 경로를 사용합니다.
- [Netlify Git 빌드 설정](https://docs.netlify.com/build/configure-builds/overview/) · [Functions 환경변수](https://docs.netlify.com/build/functions/environment-variables/)

실제 일정의 확인된 주소·좌표·출처는 Git에서 제외한 seed.local.sql에 함께 보존합니다. 원본 장소는 삭제하지 않았습니다. 미확인 농장, 렌터카 업체, 동명 회포장 업체는 임의 좌표를 넣지 않았습니다. 오름의 대표 좌표는 주차장 진입점과 다를 수 있어 주차장 검색을 사용합니다.

배포 후 두 기기에서 로그인, 일정 저장/동기화, 사진 업로드/삭제, 로그아웃 뒤 API 401, 지도 앱 설치/미설치 상태의 웹 대체를 확인해야 합니다. 기존 Netlify 주소는 새 앱 배포가 확인되기 전까지 기존 사이트입니다.
