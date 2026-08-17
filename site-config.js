/*
  이 파일만 자주 수정하면 됩니다.
  이미지 파일은 /assets 폴더에 넣고 아래 경로만 바꿔주세요.
*/

window.SITE_CONFIG = {
  siteTitle: "CP CAFE",
  eventDate: "2026.11.28 — 11.29",

  hero: {
    title: "CP CAFE",
    subtitle: "11월 28–29일, 이틀 동안 만나요.",
    note: "홈페이지는 정상적으로 작동합니다. 디자인 취향에 대해서는 책임지지 않습니다.",
    image: "./assets/main-placeholder.svg",
    imageAlt: "카페 메인 비주얼"
  },

  monthlyMenu: {
    heading: "이번 달의 추천 메뉴",
    badge: "★ AUGUST SPECIAL ★",
    name: "추천 메뉴 이름",
    description: "이번 달의 사진과 소개 문구를 이곳에 넣어주세요.",
    comment: "이번 달엔 이걸 드셔보세요^^",
    image: "./assets/monthly-placeholder.svg",
    imageAlt: "이번 달 추천 메뉴 이미지"
  },

  // 맛집 제보를 받을 Google Form 등의 주소를 넣으세요.
  recommendationFormUrl: "",

  // 맛집은 이 배열에 계속 추가하면 됩니다.
  // 실제 맛집을 넣기 전까지는 샘플 3개가 표시됩니다.
  restaurants: [
    {
      name: "첫 번째 추천 맛집",
      location: "서울 · 지역 입력",
      menu: "추천 메뉴 입력",
      comment: "한줄 추천 이유를 적어주세요.",
      url: "#"
    },
    {
      name: "두 번째 추천 맛집",
      location: "서울 · 지역 입력",
      menu: "추천 메뉴 입력",
      comment: "맛집 제보를 받은 뒤 골라서 추가하면 됩니다.",
      url: "#"
    },
    {
      name: "세 번째 추천 맛집",
      location: "서울 · 지역 입력",
      menu: "추천 메뉴 입력",
      comment: "사진 없이 텍스트만으로도 충분히 운영할 수 있습니다.",
      url: "#"
    }
  ],

  test: {
    enabled: false,
    title: "당신은 어떤 손님일까요?",
    description: "테스트 기준과 문항이 정해지면 이 영역에 바로 연결됩니다."
  },

  info: {
    // true로 바꾸면 INFO 카드가 공개됩니다.
    enabled: false,
    items: [
      { title: "DATE", text: "2026.11.28 — 11.29" },
      { title: "PLACE", text: "장소 입력" },
      { title: "HOURS", text: "운영시간 입력" },
      { title: "NOTICE", text: "안내사항 입력" }
    ]
  }
};
