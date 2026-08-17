import { FIREBASE_CONFIG, FIREBASE_READY } from "./firebase.js";

const CONFIG = window.SITE_CONFIG ?? {};
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const GUESTBOOK_PAGE_SIZE = 6;
const GUESTBOOK_CACHE_TTL = 10 * 60 * 1000;
const CACHE_KEY = "cpCafeGuestbookCacheV1";

let firebase = null;
let authUser = null;
let guestbookStarted = false;
let guestbookLoading = false;
let guestbookDone = false;
let lastCreatedAtMs = null;
let guestbookRows = [];

/* -----------------------------
   기본 화면 구성
------------------------------ */
function text(id, value) {
  const el = document.getElementById(id);
  if (el && value !== undefined && value !== null) el.textContent = value;
}

function initContent() {
  document.title = CONFIG.siteTitle || "CP CAFE";
  text("brandText", CONFIG.siteTitle);
  text("footerBrand", CONFIG.siteTitle);
  text("heroTitle", CONFIG.hero?.title);
  text("heroSubtitle", CONFIG.hero?.subtitle);
  text("heroNote", CONFIG.hero?.note);
  text("eventDate", CONFIG.eventDate);

  const heroImage = $("#heroImage");
  if (heroImage && CONFIG.hero?.image) {
    heroImage.src = CONFIG.hero.image;
    heroImage.alt = CONFIG.hero.imageAlt || "메인 비주얼";
  }

  text("monthlyHeading", CONFIG.monthlyMenu?.heading);
  text("monthlyBadge", CONFIG.monthlyMenu?.badge);
  text("monthlyName", CONFIG.monthlyMenu?.name);
  text("monthlyDescription", CONFIG.monthlyMenu?.description);
  text("monthlyComment", CONFIG.monthlyMenu?.comment);

  const monthlyImage = $("#monthlyImage");
  if (monthlyImage && CONFIG.monthlyMenu?.image) {
    monthlyImage.src = CONFIG.monthlyMenu.image;
    monthlyImage.alt = CONFIG.monthlyMenu.imageAlt || "이번 달 추천 메뉴";
  }

  renderRestaurants();
  initRecommendationForm();
  initTest();
  initInfo();
}

function initRecommendationForm() {
  const link = $("#recommendFormLink");
  const url = CONFIG.recommendationFormUrl?.trim();

  if (!link) return;

  if (!url) {
    link.textContent = "☞ 맛집 제보 폼 준비중";
    link.removeAttribute("href");
    link.removeAttribute("target");
    link.setAttribute("aria-disabled", "true");
    link.style.opacity = ".55";
    link.style.pointerEvents = "none";
  } else {
    link.href = url;
  }
}

function renderRestaurants() {
  const grid = $("#restaurantGrid");
  const empty = $("#restaurantEmpty");
  if (!grid) return;

  const items = Array.isArray(CONFIG.restaurants) ? CONFIG.restaurants : [];
  grid.innerHTML = "";

  if (!items.length) {
    if (empty) empty.hidden = false;
    return;
  }

  if (empty) empty.hidden = true;

  items.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "restaurant-card";

    const rank = document.createElement("span");
    rank.className = "rank-label";
    rank.textContent = index === 0 ? "★ 주인장 강력추천 ★" : `추천맛집 NO.${String(index + 1).padStart(2, "0")}`;

    const title = document.createElement("h3");
    title.textContent = item.name || "맛집 이름";

    const location = document.createElement("p");
    location.className = "restaurant-location";
    location.textContent = item.location || "";

    const menu = document.createElement("p");
    menu.className = "restaurant-menu";
    menu.textContent = item.menu ? `추천메뉴 : ${item.menu}` : "";

    const comment = document.createElement("p");
    comment.className = "restaurant-comment";
    comment.textContent = item.comment || "";

    card.append(rank, title, location, menu, comment);

    if (item.url && item.url !== "#") {
      const a = document.createElement("a");
      a.className = "restaurant-link";
      a.href = item.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "가게 정보 보기 ☞";
      card.append(a);
    }

    grid.append(card);
  });
}

function initTest() {
  const section = $("#test");
  const nav = $("#testNavLink");

  text("testTitle", CONFIG.test?.title);
  text("testDescription", CONFIG.test?.description);

  if (CONFIG.test?.enabled) {
    $("#testButton").disabled = false;
    $("#testButton").textContent = "테스트 시작하기 ☞";
  } else {
    // 섹션은 보여두되 '준비중' 상태 유지
    if (section) section.dataset.state = "coming-soon";
    if (nav) nav.textContent = "TEST";
  }
}

function initInfo() {
  const content = $("#infoContent");
  const empty = $("#infoEmpty");
  const nav = $("#infoNavLink");
  const items = CONFIG.info?.items || [];

  if (!content || !empty) return;

  if (!CONFIG.info?.enabled) {
    content.hidden = true;
    empty.hidden = false;
    if (nav) nav.textContent = "INFO";
    return;
  }

  content.hidden = false;
  empty.hidden = true;
  content.innerHTML = "";

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "info-card";

    const h = document.createElement("h3");
    h.textContent = item.title || "INFO";

    const p = document.createElement("p");
    p.textContent = item.text || "";

    card.append(h, p);
    content.append(card);
  });
}

/* -----------------------------
   모바일 메뉴
------------------------------ */
function initNav() {
  const toggle = $("#navToggle");
  const nav = $("#siteNav");
  if (!toggle || !nav) return;

  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });

  $$("#siteNav a").forEach((a) => {
    a.addEventListener("click", () => {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });
}

/* -----------------------------
   Firebase 로딩
------------------------------ */
async function initFirebase() {
  if (!FIREBASE_READY) {
    setGuestbookUnavailable("Firebase 설정 전입니다. firebase.js에 프로젝트 값을 넣으면 방명록이 활성화됩니다.");
    return false;
  }

  try {
    const [
      appModule,
      authModule,
      firestoreModule
    ] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js")
    ]);

    const app = appModule.initializeApp(FIREBASE_CONFIG);
    const auth = authModule.getAuth(app);
    const db = firestoreModule.getFirestore(app);

    try {
      await authModule.setPersistence(auth, authModule.browserLocalPersistence);
    } catch (_) {}

    const credential = await authModule.signInAnonymously(auth);
    authUser = credential.user;

    firebase = {
      db,
      auth,
      ...firestoreModule
    };

    return true;
  } catch (error) {
    console.error(error);
    setGuestbookUnavailable("방명록 연결에 실패했습니다. Firebase 설정과 Security Rules를 확인해주세요.");
    return false;
  }
}

function setGuestbookUnavailable(message) {
  const list = $("#guestbookList");
  if (list) {
    list.innerHTML = `<div class="guestbook-loading">${escapeHtml(message)}</div>`;
  }
  const submit = $("#guestSubmit");
  if (submit) submit.disabled = true;
}

/* -----------------------------
   방명록 캐시
------------------------------ */
function loadGuestbookCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return false;

    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || !Array.isArray(parsed.rows)) return false;
    if (Date.now() - parsed.savedAt > GUESTBOOK_CACHE_TTL) {
      sessionStorage.removeItem(CACHE_KEY);
      return false;
    }

    guestbookRows = parsed.rows;
    lastCreatedAtMs = parsed.lastCreatedAtMs || null;
    renderGuestbookRows();
    return guestbookRows.length > 0;
  } catch {
    return false;
  }
}

function saveGuestbookCache() {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      rows: guestbookRows.slice(0, 18),
      lastCreatedAtMs
    }));
  } catch (_) {}
}

function clearGuestbookCache() {
  sessionStorage.removeItem(CACHE_KEY);
}

/* -----------------------------
   방명록 읽기
------------------------------ */
async function startGuestbook() {
  if (guestbookStarted) return;
  guestbookStarted = true;

  const cached = loadGuestbookCache();
  const ready = await initFirebase();

  if (!ready) return;

  if (!cached) {
    await loadGuestbookPage({ reset: true });
  } else {
    $("#guestFormStatus").textContent = "최근 방명록은 잠시 캐시해서 불필요한 재읽기를 줄입니다.";
  }
}

async function loadGuestbookPage({ reset = false } = {}) {
  if (!firebase || guestbookLoading || guestbookDone) return;
  guestbookLoading = true;

  const list = $("#guestbookList");

  try {
    const guestbookRef = firebase.collection(firebase.db, "guestbook");
    const constraints = [
      firebase.orderBy("createdAt", "desc"),
      firebase.limit(GUESTBOOK_PAGE_SIZE)
    ];

    if (!reset && lastCreatedAtMs) {
      constraints.splice(1, 0, firebase.startAfter(firebase.Timestamp.fromMillis(lastCreatedAtMs)));
    }

    const q = firebase.query(guestbookRef, ...constraints);
    const snap = await firebase.getDocs(q);

    const incoming = snap.docs.map((doc) => {
      const data = doc.data();
      const createdAtMs = data.createdAt?.toMillis?.() || Date.now();

      return {
        id: doc.id,
        name: String(data.name || "익명"),
        message: String(data.message || ""),
        likeCount: Number(data.likeCount || 0),
        createdAtMs
      };
    });

    if (reset) {
      guestbookRows = incoming;
      guestbookDone = incoming.length < GUESTBOOK_PAGE_SIZE;
    } else {
      const known = new Set(guestbookRows.map((row) => row.id));
      guestbookRows.push(...incoming.filter((row) => !known.has(row.id)));
      if (incoming.length < GUESTBOOK_PAGE_SIZE) guestbookDone = true;
    }

    if (incoming.length) {
      lastCreatedAtMs = incoming[incoming.length - 1].createdAtMs;
    }

    renderGuestbookRows();
    saveGuestbookCache();

    if (!incoming.length && list) {
      if (!guestbookRows.length) {
        list.innerHTML = `<div class="guestbook-loading">첫 방명록을 남겨주세요^^</div>`;
      }
      guestbookDone = true;
    }
  } catch (error) {
    console.error(error);
    if (list && !guestbookRows.length) {
      list.innerHTML = `<div class="guestbook-loading">방명록을 불러오지 못했습니다.</div>`;
    }
  } finally {
    guestbookLoading = false;
  }
}

function renderGuestbookRows() {
  const list = $("#guestbookList");
  if (!list) return;

  if (!guestbookRows.length) {
    list.innerHTML = `<div class="guestbook-loading">첫 방명록을 남겨주세요^^</div>`;
    return;
  }

  list.innerHTML = "";

  guestbookRows.forEach((row, index) => {
    const wrap = document.createElement("article");
    wrap.className = "guestbook-row";
    wrap.dataset.id = row.id;

    const num = document.createElement("div");
    num.className = "guestbook-num";
    num.textContent = String(index + 1).padStart(3, "0");

    const body = document.createElement("div");

    const author = document.createElement("div");
    author.className = "guestbook-author";

    const strong = document.createElement("strong");
    strong.textContent = row.name;

    const date = document.createElement("span");
    date.className = "guestbook-date";
    date.textContent = formatDate(row.createdAtMs);

    author.append(strong, date);

    const message = document.createElement("div");
    message.className = "guestbook-message";
    message.textContent = row.message;

    body.append(author, message);

    const likeWrap = document.createElement("div");
    const likeButton = document.createElement("button");
    likeButton.className = "like-button";
    likeButton.type = "button";

    const liked = hasLocallyLiked(row.id);
    likeButton.disabled = liked;
    likeButton.textContent = liked ? `♥ ${row.likeCount}` : `♡ ${row.likeCount}`;
    likeButton.setAttribute("aria-label", `${row.name}님의 방명록 추천 ${row.likeCount}개`);

    likeButton.addEventListener("click", () => likeGuestbook(row.id, likeButton));

    likeWrap.append(likeButton);
    wrap.append(num, body, likeWrap);
    list.append(wrap);
  });
}

/* -----------------------------
   방명록 작성
------------------------------ */
function initGuestbookForm() {
  const form = $("#guestbookForm");
  const textarea = $("#guestMessage");
  const count = $("#messageCount");

  if (textarea && count) {
    textarea.addEventListener("input", () => {
      count.textContent = textarea.value.length;
    });
  }

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!firebase || !authUser) {
      $("#guestFormStatus").textContent = "Firebase 연결 후 사용할 수 있습니다.";
      return;
    }

    const name = $("#guestName").value.trim();
    const message = $("#guestMessage").value.trim();
    const submit = $("#guestSubmit");

    if (!name || !message) return;
    if (name.length > 20 || message.length > 120) return;

    submit.disabled = true;
    $("#guestFormStatus").textContent = "등록하는 중...";

    const optimistic = {
      id: `temp-${Date.now()}`,
      name,
      message,
      likeCount: 0,
      createdAtMs: Date.now(),
      pending: true
    };

    guestbookRows.unshift(optimistic);
    renderGuestbookRows();

    try {
      const ref = await firebase.addDoc(
        firebase.collection(firebase.db, "guestbook"),
        {
          name,
          message,
          likeCount: 0,
          createdAt: firebase.serverTimestamp()
        }
      );

      const row = guestbookRows.find((item) => item.id === optimistic.id);
      if (row) row.id = ref.id;

      form.reset();
      if (count) count.textContent = "0";
      $("#guestFormStatus").textContent = "등록되었습니다. 잘 보고 갑니다^^";
      saveGuestbookCache();
      renderGuestbookRows();
    } catch (error) {
      console.error(error);
      guestbookRows = guestbookRows.filter((item) => item.id !== optimistic.id);
      renderGuestbookRows();
      $("#guestFormStatus").textContent = "등록에 실패했습니다. 잠시 후 다시 시도해주세요.";
    } finally {
      submit.disabled = false;
    }
  });
}

/* -----------------------------
   좋아요
   - 사용자가 눌렀을 때만 Firestore 사용
   - 1회 like = transaction read 2 + write 2 정도
------------------------------ */
async function likeGuestbook(entryId, button) {
  if (!firebase || !authUser || !entryId || entryId.startsWith("temp-")) return;
  if (hasLocallyLiked(entryId)) return;

  button.disabled = true;

  const row = guestbookRows.find((item) => item.id === entryId);
  if (!row) return;

  const before = row.likeCount;
  row.likeCount += 1;
  button.textContent = `♥ ${row.likeCount}`;

  const postRef = firebase.doc(firebase.db, "guestbook", entryId);
  const likeRef = firebase.doc(firebase.db, "guestbook", entryId, "likes", authUser.uid);

  try {
    await firebase.runTransaction(firebase.db, async (transaction) => {
      const [postSnap, likeSnap] = await Promise.all([
        transaction.get(postRef),
        transaction.get(likeRef)
      ]);

      if (!postSnap.exists()) throw new Error("post-not-found");
      if (likeSnap.exists()) throw new Error("already-liked");

      const currentCount = Number(postSnap.data().likeCount || 0);

      transaction.set(likeRef, {
        uid: authUser.uid,
        createdAt: firebase.serverTimestamp()
      });

      transaction.update(postRef, {
        likeCount: currentCount + 1
      });
    });

    markLocallyLiked(entryId);
    saveGuestbookCache();
  } catch (error) {
    console.error(error);
    row.likeCount = before;
    button.textContent = `♡ ${before}`;
    button.disabled = false;

    if (String(error?.message).includes("already-liked")) {
      markLocallyLiked(entryId);
      button.textContent = `♥ ${before}`;
      button.disabled = true;
    }
  }
}

function likedStorageKey(entryId) {
  return `cpCafeLiked:${entryId}`;
}

function hasLocallyLiked(entryId) {
  return localStorage.getItem(likedStorageKey(entryId)) === "1";
}

function markLocallyLiked(entryId) {
  localStorage.setItem(likedStorageKey(entryId), "1");
}

/* -----------------------------
   새 글 확인
------------------------------ */
function initRefresh() {
  const button = $("#guestbookRefresh");
  if (!button) return;

  button.addEventListener("click", async () => {
    if (!firebase) return;

    button.disabled = true;
    clearGuestbookCache();
    guestbookDone = false;
    lastCreatedAtMs = null;

    try {
      await loadGuestbookPage({ reset: true });
      button.textContent = "새 글 확인 완료^^";
      setTimeout(() => {
        button.textContent = "새 글 확인";
        button.disabled = false;
      }, 1200);
    } catch {
      button.disabled = false;
    }
  });
}

/* -----------------------------
   방명록 섹션에 도달했을 때만 로딩
------------------------------ */
function initGuestbookObservers() {
  const section = $("#guestbook");
  const sentinel = $("#guestbookSentinel");

  if ("IntersectionObserver" in window && section) {
    const sectionObserver = new IntersectionObserver((entries, observer) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        startGuestbook();
        observer.disconnect();
      }
    }, { rootMargin: "300px 0px" });

    sectionObserver.observe(section);
  } else {
    startGuestbook();
  }

  if ("IntersectionObserver" in window && sentinel) {
    const moreObserver = new IntersectionObserver((entries) => {
      if (
        entries.some((entry) => entry.isIntersecting) &&
        guestbookStarted &&
        firebase &&
        !guestbookLoading &&
        !guestbookDone &&
        guestbookRows.length
      ) {
        loadGuestbookPage();
      }
    }, { rootMargin: "200px 0px" });

    moreObserver.observe(sentinel);
  }
}

/* -----------------------------
   유틸
------------------------------ */
function formatDate(ms) {
  const date = new Date(ms);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

initContent();
initNav();
initGuestbookForm();
initRefresh();
initGuestbookObservers();
