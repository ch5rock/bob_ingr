(() => {
  'use strict';
  const story = window.STORY_DATA;
  if (!story || !Array.isArray(story.members) || !story.members.length) return;
  const $ = id => document.getElementById(id);
  const members = story.members;
  const STORAGE_KEY = 'cp-cafe-lost-recipe-v3';
  const validIds = members.map(m => m.id);
  const PHASES = ['chat', 'riddle', 'transition', 'done'];
  let state, storageEnabled = true;
  let selectedMemberId = null;

  function fresh() {
    return {
      version: 3, started: false, nickname: '', memberOrder: validIds.slice(),
      memberIndex: 0, phase: 'chat', chatTurns: 0,
      tries: 0, messages: [], collected: [], receiptId: null,
      issuedAt: null, receiptOpened: false
    };
  }
  function validate(obj) {
    if (!obj || obj.version !== 3 || !Number.isInteger(obj.memberIndex) || obj.memberIndex < 0 || obj.memberIndex >= members.length || !PHASES.includes(obj.phase) || !Array.isArray(obj.messages)) return null;
    if (!Array.isArray(obj.memberOrder) || obj.memberOrder.length !== validIds.length || new Set(obj.memberOrder).size !== validIds.length || !obj.memberOrder.every(id => validIds.includes(id))) return null;
    if (typeof obj.nickname !== 'string' || obj.nickname.length > 12 || (obj.started && !obj.nickname.trim())) return null;
    const clean = fresh();
    clean.started = !!obj.started;
    clean.nickname = obj.nickname.trim();
    clean.memberOrder = obj.memberOrder.slice();
    clean.memberIndex = obj.memberIndex;
    clean.phase = obj.phase;
    clean.chatTurns = Math.min(30, Math.max(0, Number(obj.chatTurns) || 0));
    clean.tries = Math.min(30, Math.max(0, Number(obj.tries) || 0));
    clean.messages = obj.messages.filter(m => m && ['bot', 'player', 'system'].includes(m.role) && typeof m.text === 'string').slice(-120).map(m => ({role:m.role,text:m.text.slice(0,800),memberId:validIds.includes(m.memberId)?m.memberId:validIds[0]}));
    clean.collected = [...new Set((Array.isArray(obj.collected) ? obj.collected : []).filter(id => validIds.includes(id)))];
    clean.receiptId = typeof obj.receiptId === 'string' && /^DEMO-[A-Z0-9]{8}$/.test(obj.receiptId) ? obj.receiptId : null;
    clean.issuedAt = typeof obj.issuedAt === 'string' && obj.issuedAt.length < 40 ? obj.issuedAt : null;
    clean.receiptOpened = !!obj.receiptOpened;
    return clean;
  }
  function persist() {
    if (!storageEnabled) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (_) { storageEnabled = false; }
  }
  function current() { return members.find(m => m.id === state.memberOrder[state.memberIndex]) || members[0]; }
  function add(role, text, memberId = current().id) {
    const message = role === 'bot' ? String(text).replaceAll('{nickname}', state.nickname) : String(text);
    state.messages.push({role, text: message, memberId});
    if (state.messages.length > 120) state.messages = state.messages.slice(-120);
  }
  function initialize(memberId = null, nickname = '') {
    state = fresh();
    if (validIds.includes(memberId) && nickname.trim()) {
      state.started = true;
      state.nickname = nickname.trim().slice(0, 12);
      state.memberOrder = [memberId, ...validIds.filter(id => id !== memberId)];
      add('system', `${state.nickname}님에게 ${current().name}님이 메시지를 보냈습니다`);
      current().opening.forEach(line => add('bot', line));
    }
    persist();
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    state = saved ? validate(JSON.parse(saved)) : null;
  } catch (_) { storageEnabled = false; }
  if (!state) initialize();

  const cleanText = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\u200b-\u200d\ufeff\s\p{P}\p{S}]/gu, '');
  function matchesAnswer(text, answers) {
    const clean = cleanText(text);
    if (!clean) return false;
    // 부정 문맥은 정답으로 처리하지 않음. ("설탕은 아닌 것 같은데" 등)
    if (/(아니|아닌|아닐|아님|말고|없을|없어|아냐|not)/.test(text)) return false;
    return answers.some(answer => {
      const a = cleanText(answer);
      return a.length >= 2 && (clean === a || clean.includes(a));
    });
  }
  function detectIntent(text) {
    if (/(안\s*돼|못\s*해|싫|바빠|안할|안\s*할|아니|어려워)/.test(text)) return 'no';
    if (/(응|그래|좋아|당연|도와|찾아|해볼|할게|같이|물론|네|ㅇㅇ)/.test(text)) return 'yes';
    if (/(정답|혹시|맞혀|이거야|설탕|우유|딸기)/.test(text)) return 'guess';
    if (/(왜|무슨|어떤|뭐|어디|어떻게|힌트|궁금|알려|\?)/.test(text)) return 'question';
    if (/(고마워|사랑|최고|힘내|응원|귀엽|보고싶|반가워|안녕)/.test(text)) return 'warm';
    return 'default';
  }
  function isInfoRequest(text) { return /(카페|날짜|일정|위치|주소|특전|상품|굿즈|교환증|영수증|행사|메뉴)/.test(text); }
  function sendMessage(raw) {
    const message = String(raw || '').trim().slice(0,180);
    if (!state.started || !message || state.phase === 'transition' || state.phase === 'done') return;
    add('player', message);
    const member = current();
    if (state.phase === 'chat') {
      const intent = detectIntent(message);
      if (isInfoRequest(message) && !/(재료|찾|어디 있어)/.test(message)) {
        add('bot', '그건 재료를 찾으면 알려 줄 수 있어. 지금은 우리끼리 이걸 먼저 해결하자! ♡');
      } else {
        const pool = member.conversational[intent] || member.conversational.default;
        add('bot', pool[state.chatTurns % pool.length]);
      }
      state.chatTurns++;
      if (state.chatTurns >= 2) {
        state.phase = 'riddle';
        add('system', '작은 단서 하나를 발견했어요 ✦');
        member.clue.forEach(line => add('bot', line));
      }
    } else if (/^(힌트|도움|모르겠어|모르겠음|help|모르겠는데)[!?.\s]*$/i.test(message)) {
      add('bot', '쉿, 힌트 알려 줄게. ' + member.hint);
    } else if (matchesAnswer(message, member.answers)) {
      member.success.forEach(line => add('bot', line));
      if (!state.collected.includes(member.id)) state.collected.push(member.id);
      const clue = member.reveal;
      const actual = String(story.cafe[clue.key] || '').trim();
      add('system', `♡ 발견한 쪽지 · ${clue.label}`);
      add('bot', actual || clue.fallback);
      if (state.memberIndex === members.length - 1) {
        state.phase = 'done';
        story.completion.forEach(line => add('bot', line));
        ensureReceipt();
      } else {
        add('bot', '다른 친구도 재료를 찾고 있대. 이번엔 그 친구에게 답장을 보내 볼까?');
        state.phase = 'transition';
      }
    } else {
      const idx = Math.min(state.tries, member.fail.length - 1);
      add('bot', member.fail[idx]);
      state.tries++;
      if (state.tries >= 3 && state.tries % 2 === 1) add('bot', '작게 알려 줄까? 대화창에 “힌트”라고 입력해 봐.');
    }
    persist();
    render();
  }
  function advance() {
    if (state.phase !== 'transition') return;
    state.memberIndex++;
    state.phase = 'chat';
    state.chatTurns = 0;
    state.tries = 0;
    add('system', `${current().name}님이 대화에 참여했습니다`);
    current().opening.forEach(line => add('bot', line));
    persist();
    render();
  }
  function ensureReceipt() {
    if (state.receiptId) return;
    // 이 번호는 이용자 브라우저에서 만들어지는 시연용 ID이며 위조·중복사용 방지 기능이 없습니다.
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(8);
    if (globalThis.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random()*256);
    state.receiptId = 'DEMO-' + Array.from(bytes, n => chars[n % chars.length]).join('');
    state.issuedAt = new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  }
  function create(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function renderButtons() {
    const dest = $('story-control'); dest.replaceChildren();
    if (state.phase !== 'transition' && state.phase !== 'done') return;
    const wrap = create('div', 'story-inline');
    if (state.phase === 'transition') {
      const button = create('button', '', '답장 이어가기 →');
      button.type = 'button'; button.addEventListener('click', advance);
      wrap.append(button);
    } else {
      const button = create('button', 'ticket-trigger', '✉️ 도착한 봉투 열기');
      button.type = 'button'; button.addEventListener('click', showTicket);
      wrap.append(button);
      wrap.append(create('div', 'story-mini-note', '끝까지 함께해 줘서 고마워요 ♡'));
    }
    dest.append(wrap);
  }
  function render() {
    const starting = !state.started;
    $('chat-shell').classList.toggle('is-starting', starting);
    $('start-screen').setAttribute('aria-hidden', String(!starting));
    if (starting) {
      document.title = `${story.siteTitle} · 오늘의 대화 메뉴`;
      return;
    }
    const person = current();
    $('profile-emoji').textContent = person.avatar;
    $('profile-name').textContent = person.name;
    $('profile-status').textContent = person.subtitle;
    document.title = `${story.siteTitle} · ${person.name}`;
    const messages = $('messages'); messages.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (const line of state.messages) {
      const row = create('div', 'message ' + line.role);
      if (line.role === 'bot') row.append(create('div', 'message-avatar', members.find(m => m.id === line.memberId)?.avatar || person.avatar));
      row.append(create('div', 'bubble', line.text)); fragment.append(row);
    }
    messages.append(fragment); renderButtons();
    const disabled = ['transition','done'].includes(state.phase);
    $('reply-input').disabled = disabled;
    $('send-button').disabled = disabled;
    $('reply-input').placeholder = state.phase === 'riddle' ? '답을 자유롭게 입력해 주세요 (힌트 가능)' : disabled ? '채팅 속 버튼을 눌러 주세요' : '메시지를 입력해 주세요';
    $('footer-caption').textContent = state.phase === 'riddle' ? 'a tiny clue is waiting ♡' : 'type a message ✿';
    const scroll = $('conversation'); scroll.scrollTop = scroll.scrollHeight;
  }

  // 첫 입장: 카페 메뉴판 모양의 멤버 선택 화면. 실제 미션과 보상은 노출하지 않습니다.
  function renderMemberMenu() {
    const host = $('member-menu');
    host.replaceChildren();
    members.forEach((member, index) => {
      const item = create('button', 'member-menu-item');
      item.type = 'button';
      item.dataset.member = member.id;
      item.setAttribute('aria-pressed', String(selectedMemberId === member.id));
      if (selectedMemberId === member.id) item.classList.add('selected');
      item.append(create('span', 'menu-avatar', member.avatar));
      const details = create('span', 'menu-member-details');
      details.append(create('span', 'menu-member-code', `CHAT MENU ${String(index+1).padStart(2,'0')}`));
      details.append(create('strong', 'menu-member-name', member.name));
      details.append(create('span', 'menu-member-subtitle', member.menuSubtitle || '함께 이야기 나누기 ♡'));
      item.append(details);
      item.append(create('span', 'menu-member-check', selectedMemberId === member.id ? '✓' : '＋'));
      item.addEventListener('click', () => {
        selectedMemberId = member.id;
        renderMemberMenu();
        updateStartButton();
      });
      host.append(item);
    });
  }
  function updateStartButton() {
    $('start-button').disabled = !(selectedMemberId && $('nickname-input').value.trim());
  }
  $('nickname-input').addEventListener('input', updateStartButton);
  $('start-form').addEventListener('submit', event => {
    event.preventDefault();
    const nickname = $('nickname-input').value.trim();
    if (!selectedMemberId || !nickname) return;
    initialize(selectedMemberId, nickname);
    render();
    $('reply-input').focus();
  });
  renderMemberMenu();

  const ticketDialog = $('ticket-dialog');
  function populateTicket() {
    ensureReceipt();
    $('ticket-nickname').textContent = state.nickname;
    $('ticket-number').textContent = state.receiptId;
    $('ticket-date').textContent = state.issuedAt;
    $('ticket-ingredients').textContent = '설탕 · 우유 · 딸기';
    $('ticket-gift').textContent = story.receipt.gift;
    $('ticket-message').textContent = story.receipt.message;
    persist();
  }
  function showTicket() {
    if (state.phase !== 'done') return;
    populateTicket();
    state.receiptOpened = true; persist();
    ticketDialog.showModal();
  }
  function saveFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = create('a'); anchor.href = url; anchor.download = filename;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  // 임시 교환증 PNG는 완전히 브라우저에서 생성합니다. 실제 상품 교환권의 보안 기능은 없습니다.
  async function downloadTicket() {
    if (state.phase !== 'done') return;
    populateTicket();
    if (document.fonts?.ready) await document.fonts.ready;
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 1250;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const w = 900;
    const rounded = (x,y,width,height,r,fill,stroke) => {
      ctx.beginPath();ctx.roundRect(x,y,width,height,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=3;ctx.stroke();}
    };
    ctx.fillStyle = '#e9f5ff'; ctx.fillRect(0,0,900,1250);
    for(let y=0;y<1250;y+=180){for(let x=0;x<900;x+=180){if(((x+y)/180)%2===0){ctx.fillStyle='#fff5d8';ctx.fillRect(x,y,180,180);}}}
    rounded(75,55,750,1140,40,'#fffefa','#87bbe1');
    rounded(105,90,690,1070,23,'#fffefa','#b3d9ed');
    const write=(t,y,size,color='#2f6e9b',weight='700')=>{ctx.textAlign='center';ctx.fillStyle=color;ctx.font=`${weight} ${size}px "Noto Sans KR", "Malgun Gothic", sans-serif`;ctx.fillText(t,w/2,y)};
    write('♡ A LITTLE GIFT FOR YOU ♡',185,23,'#7baed2','800');
    write('✿  ✦  ✿',245,40,'#e4bb57');
    write('선물 교환증',332,59,'#367fb2','900');
    write('잃어버린 레시피를 완성해 주셔서 고마워요!',393,25,'#668ca8','500');
    rounded(300,440,300,137,16,'#e9f6ff','#83bde4');
    write('MISSION COMPLETE',495,27,'#428bc0','900');write('✓',550,45,'#4caa80','900');
    const rows=[['닉네임',state.nickname],['찾은 재료','설탕 · 우유 · 딸기'],['선물',story.receipt.gift],['발행 번호',state.receiptId],['발행일',state.issuedAt]];
    let y=615;for(const [label,value] of rows){ctx.strokeStyle='#c4dfed';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(160,y+26);ctx.lineTo(740,y+26);ctx.stroke();ctx.textAlign='left';ctx.fillStyle='#84a4bc';ctx.font='500 23px "Noto Sans KR", "Malgun Gothic", sans-serif';ctx.fillText(label,160,y);ctx.textAlign='right';ctx.fillStyle='#315e7b';ctx.font='bold 24px "Noto Sans KR", "Malgun Gothic", sans-serif';let shown=String(value);if(ctx.measureText(shown).width>380){ctx.font='bold 19px "Noto Sans KR", "Malgun Gothic", sans-serif';}if(ctx.measureText(shown).width>420){shown=shown.slice(0,18)+'…';}ctx.fillText(shown,740,y);y+=84;}
    write('✦  ✦  ✦',1030,28,'#edc267');
    write('시연용 · 실제 현장 교환권이 아닙니다',1090,22,'#996c3f','700');
    canvas.toBlob(blob => {if(blob)saveFile(blob,'선물교환증_시연용.png');},'image/png');
  }

  function toggleSettings(open) {
    $('settings-menu').hidden = !open;
    $('settings-button').setAttribute('aria-expanded',String(open));
  }
  $('settings-button').addEventListener('click',() => toggleSettings($('settings-menu').hidden));
  document.addEventListener('click',event => {if(!event.target.closest('.settings-menu')&&!event.target.closest('.menu-button'))toggleSettings(false);});
  $('chat-form').addEventListener('submit',event => {
    event.preventDefault(); const input=$('reply-input'); const text=input.value;input.value='';sendMessage(text);if(!input.disabled)input.focus();
  });
  $('ticket-close').addEventListener('click',() => ticketDialog.close());
  ticketDialog.addEventListener('click',event => {if(event.target===ticketDialog)ticketDialog.close();});
  $('ticket-download').addEventListener('click',downloadTicket);
  $('ticket-print').addEventListener('click',() => window.print());
  $('reset-game').addEventListener('click',() => {toggleSettings(false);if(!confirm('지금까지의 대화와 교환증을 지우고 닉네임·멤버 선택부터 다시 시작할까요?'))return;selectedMemberId=null;$('nickname-input').value='';renderMemberMenu();updateStartButton();initialize();render();});
  $('save-export').addEventListener('click',() => {toggleSettings(false);saveFile(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),'cp-cafe-story-save.json');});
  $('save-import').addEventListener('click',() => {toggleSettings(false);$('save-file').click();});
  $('save-file').addEventListener('change',async event => {
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    if(file.size>500000){alert('500KB 이하 저장 파일만 불러올 수 있습니다.');return;}
    try {const imported=validate(JSON.parse(await file.text()));if(!imported)throw Error('invalid');if(!confirm('현재 진행 기록을 불러온 파일로 바꿀까요?'))return;state=imported;persist();render();}
    catch(_){alert('저장 파일을 읽을 수 없습니다.');}
  });
  render();
})();
