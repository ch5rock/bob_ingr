# CP CAFE V1

GitHub Pages + Firebase Firestore로 운영하는 참여형 CP 카페 홈페이지 V1입니다.

구조:
- HOME
- 이번 달 추천 메뉴
- 추천 맛집
- 방명록
- 손님 유형 테스트
- INFO

## 1. 제일 먼저 수정할 파일

### `site-config.js`

이 파일만 수정해도 대부분의 내용이 바뀝니다.

수정 가능:
- 사이트 제목
- 행사 날짜
- 메인 문구 / 메인 이미지
- 이번 달 추천 메뉴 문구 / 이미지
- 추천 맛집 목록
- 맛집 제보 폼 URL
- 테스트 공개 여부
- INFO 공개 여부와 내용

이미지 파일은 `assets` 폴더에 넣고 경로만 바꾸면 됩니다.

예:
```js
image: "./assets/september-menu.jpg"
```

---

## 2. 추천 맛집 제보 폼 연결

Google Form 등을 하나 만든 뒤 `site-config.js`의 아래 부분에 주소를 넣으세요.

```js
recommendationFormUrl: "https://forms.gle/..."
```

추천 맛집 제보 자체는 Firebase를 쓰지 않습니다.

제보를 받은 뒤 운영자가 골라서 `restaurants` 배열에 직접 추가합니다.

---

## 3. Firebase 연결

방명록에만 Firebase를 사용합니다.

### Firebase Console에서

1. 새 프로젝트 생성
2. `Authentication`
3. 로그인 제공업체에서 `익명(Anonymous)` 활성화
4. `Firestore Database` 생성
5. 웹 앱 추가
6. Firebase SDK 설정의 `firebaseConfig` 확인
7. 이 프로젝트의 `firebase.js`에 값 붙여넣기
8. Firestore Rules에 `firestore.rules` 내용 적용

웹 Firebase config는 프런트 코드에 공개되는 값입니다.
보안을 담당하는 것은 Firestore Security Rules입니다.

---

## 4. Firebase 읽기 절약 설계

지난번처럼 read가 빠르게 소진되는 것을 막기 위해 다음과 같이 구성했습니다.

- 사이트 접속만으로 방명록을 읽지 않음
- 사용자가 방명록 섹션 근처에 왔을 때만 로딩
- 한 번에 최근 6개만 조회
- 아래로 내려가면 다음 6개 자동 로딩
- `onSnapshot()` 실시간 리스너 사용 안 함
- 새 댓글 등록 후 전체 목록 재조회 안 함
- 방명록 첫 화면은 10분 동안 `sessionStorage` 캐시
- "새 글 확인"을 눌렀을 때만 강제 새로고침
- 추천 맛집 / 추천 메뉴 / INFO / 테스트는 Firestore를 사용하지 않음

즉 Firebase는 실제로 공유 데이터가 필요한 방명록에만 집중합니다.

---

## 5. 방명록 좋아요

좋아요는 사용자가 실제로 버튼을 눌렀을 때만 Firebase를 사용합니다.

한 좋아요는 transaction으로:
- 방명록 문서 읽기
- 해당 UID가 이미 좋아요했는지 확인
- likes 하위 문서 생성
- likeCount +1

방문만 해서는 좋아요 관련 read/write가 발생하지 않습니다.

---

## 6. GitHub Pages 배포

저장소에 이 파일들을 그대로 올린 뒤:

`Settings > Pages`

에서 배포 브랜치를 선택하면 됩니다.

추천:
- Branch: `main`
- Folder: `/ (root)`

---

## 7. 테스트 추가

현재 TEST 영역은 준비중 상태입니다.

나중에 테스트 기준이 정해지면:
- 문항
- 선택지
- 점수 계산
- 결과 유형

만 추가하면 됩니다.

Firebase를 사용하지 않고 브라우저 JavaScript에서 계산하도록 만드는 것을 권장합니다.

---

## 8. INFO 공개

`site-config.js`

```js
info: {
  enabled: true,
  items: [
    { title: "PLACE", text: "..." }
  ]
}
```

`enabled: true`로 바꾸면 표시됩니다.

---

## 9. 이미지 교체

기본 SVG는 자리 표시용입니다.

예:
```text
assets/
  main.jpg
  august-menu.jpg
```

그리고 `site-config.js`에서:

```js
hero: {
  image: "./assets/main.jpg"
}

monthlyMenu: {
  image: "./assets/august-menu.jpg"
}
```

처럼 바꾸면 됩니다.
