(() => {
  'use strict';
  const story = window.STORY_DATA;
  const KEY = 'after-the-signal-save-v1';
  const $ = (id) => document.getElementById(id);
  const max = (v) => Math.max(0, Math.min(100, v));
  const chapterData = () => story.chapters[state.chapter - 1];
  const blankState = () => ({
    version: 1, chapter: 1, phase: 'chat', chapterTurn: 0,
    trust: story.initial.trust, affection: story.initial.affection,
    flags: {}, seenIntents: [], messages: [], choiceLog: [], ending: null
  });
  let state;
  let storageAvailable = true;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? validateSave(JSON.parse(raw)) : null;
  } catch (_) { storageAvailable = false; }
  if (!state) {
    state = blankState();
    beginChapter(1, true);
  }

  function validateSave(v) {
    if (!v || v.version !== 1 || !Number.isInteger(v.chapter) || v.chapter < 1 || v.chapter > 3) return null;
    if (!['chat', 'choice', 'cleared', 'ended'].includes(v.phase)) return null;
    if (!Array.isArray(v.messages) || !Array.isArray(v.choiceLog)) return null;
    return {
      version: 1, chapter: v.chapter, phase: v.phase,
      chapterTurn: Math.max(0, Math.min(10000, Number(v.chapterTurn) || 0)),
      trust: max(Number(v.trust) || 0), affection: max(Number(v.affection) || 0),
      flags: v.flags && typeof v.flags === 'object' && !Array.isArray(v.flags) ? v.flags : {},
      seenIntents: Array.isArray(v.seenIntents) ? v.seenIntents.filter(x => typeof x === 'string').slice(0, 50) : [],
      messages: v.messages.slice(-500).filter(m => m && ['character', 'player', 'system'].includes(m.role) && typeof m.text === 'string').map(m => ({role:m.role,text:m.text.slice(0,500)})),
      choiceLog: v.choiceLog.slice(0,10).filter(x => x && typeof x.result === 'string' && typeof x.chapter === 'number').map(x => ({chapter:x.chapter,result:x.result.slice(0,140)})),
      ending: ['warm','farewell'].includes(v.ending) ? v.ending : null
    };
  }
  function save() {
    if (!storageAvailable) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (_) { storageAvailable = false; }
  }
  function add(role, text) { state.messages.push({role, text}); }
  function beginChapter(n, init=false) {
    state.chapter = n;
    state.chapterTurn = 0;
    state.seenIntents = [];
    state.phase = 'chat';
    state.ending = null;
    const ch = story.chapters[n-1];
    add('system', `CHAPTER ${String(n).padStart(2,'0')} — ${ch.title}`);
    const opening = [...ch.opening];
    if (n===2) {
      if (state.flags.promise_to_wait) opening.unshift('기다려 줘서 고마워.');
      else if (state.flags.letter_avoided) opening.unshift('지난번엔 편지 얘기를 피했었지.');
    }
    if (n===3 && state.flags.believed_him) opening.unshift('네가 나를 믿는다고 했던 말, 기억하고 있어.');
    opening.forEach(s => add('character',s));
    if (!init) save();
  }
  const patterns = [
    {intent:'negative', re: /(안\s*보고\s*싶|안\s*그리워|안\s*믿|못\s*믿|거짓말|싫어|미워|꺼져|화나|화가\s*나|말도\s*안\s*돼)/},
    {intent:'secret', re: /(비밀|숨기|감추|편지|봉투|기록|진실|말\s*못\s*해|숨겼)/},
    {intent:'why', re: /(왜|이유|어째서|무슨\s*일|뭔\s*일|뭐\s*때문|연락한\s*이유)/},
    {intent:'sorry', re: /(미안|죄송|사과|잘못했)/},
    {intent:'miss', re: /(보고\s*싶|그리웠|그립|기다렸|생각났|보고싶)/},
    {intent:'trust', re: /(믿어|믿을게|믿는다|괜찮아|함께|같이\s*있|곁에|약속)/},
    {intent:'feeling', re: /(잘\s*지냈|기분|어떻게\s*지냈|외로|무서|슬퍼|행복|아프|힘들)/},
    {intent:'greeting', re: /(안녕|반가|오랜만|하이|ㅎㅇ|잘\s*자|좋은\s*아침)/},
    {intent:'question', re: /[?？]|(뭐야|뭐해|어떻게|언제|어디|누구|뭔데|할까)/}
  ];
  function detectIntent(text) {
    const normalized = text.normalize('NFKC').toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g,'').trim();
    for (const item of patterns) if (item.re.test(normalized)) return item.intent;
    return 'default';
  }
  function replyFor(intent) {
    const pool = (story.responses[state.chapter][intent] || story.responses[state.chapter].default);
    // 표현이 반복될 때의 어색함을 조금 줄이기 위한 고정형 로테이션
    const idx = (state.chapterTurn + state.seenIntents.length - 1) % pool.length;
    let result = pool[idx];
    if (state.chapter === 2 && intent === 'trust' && state.flags.promise_to_wait) result = '지난번에도 기다리겠다고 했지. 그 말 계속 기억하고 있어.';
    if (state.chapter === 3 && intent === 'negative' && state.flags.doubted_him) result = '지난번에도 믿기 어렵다고 했었지. 그 마음을 무시할 생각 없어.';
    return result;
  }
  function eventReady() {
    return state.phase === 'chat' && (state.chapterTurn >= 5 ||
      (state.chapterTurn >= 3 && state.seenIntents.some(i => ['why','secret','trust','miss','negative'].includes(i))));
  }
  function sendMessage(text) {
    if (state.phase !== 'chat') return;
    const input = text.trim().slice(0,180);
    if (!input) return;
    const intent = detectIntent(input);
    const firstIntent = !state.seenIntents.includes(intent);
    state.chapterTurn++;
    add('player', input);
    if (firstIntent) {
      state.seenIntents.push(intent);
      if (intent === 'trust' || intent === 'sorry') state.trust = max(state.trust + 1);
      if (intent === 'miss') state.affection = max(state.affection + 1);
      if (intent === 'negative') state.trust = max(state.trust - 1);
    }
    add('character',replyFor(intent));
    save(); render();
  }
  function startEvent() {
    if (!eventReady()) return;
    const e=chapterData().event;
    state.phase='choice';
    add('system', `STORY EVENT — ${e.title}`);
    e.lines.forEach(line=>add('character',line));
    save(); render();
  }
  function takeChoice(id) {
    if (state.phase !== 'choice') return;
    const choice = chapterData().event.choices.find(c=>c.id===id);
    if (!choice) return;
    add('player',choice.label);
    choice.reply.forEach(line=>add('character',line));
    state.trust=max(state.trust+choice.effect.trust);
    state.affection=max(state.affection+choice.effect.affection);
    state.flags[choice.flag]=true;
    state.choiceLog.push({chapter:state.chapter,result:choice.result});
    add('system',`선택 기록 · ${choice.result}`);
    state.phase='cleared';
    save(); render();
  }
  function nextChapter() {
    if (state.phase !== 'cleared') return;
    if (state.chapter<story.chapters.length) beginChapter(state.chapter+1);
    else {
      const warm = state.trust>=56 && state.flags.asked_to_stay &&
        (state.flags.believed_him || state.flags.promise_to_wait || state.flags.letter_seen);
      state.ending=warm?'warm':'farewell';
      state.phase='ended';
      const ending=story.ending[state.ending];
      add('system',ending.title);
      ending.lines.forEach(line=>add('character',line));
    }
    save(); render();
  }
  function node(tag,cls,text) {
    const el=document.createElement(tag);
    if (cls) el.className=cls;
    if (text!==undefined) el.textContent=text;
    return el;
  }
  function makeAction(kicker,title,desc) {
    const panel=node('div','action-panel');
    panel.append(node('div','action-kicker',kicker),node('div','action-title',title),node('div','action-desc',desc));
    return panel;
  }
  function actionButton(label,fn,primary=false) {
    const b=node('button',primary?'primary':'',label); b.type='button'; b.addEventListener('click',fn);return b;
  }
  function renderActions() {
    const holder=$('story-action');holder.replaceChildren();
    if (state.phase==='chat'&&eventReady()) {
      const e=chapterData().event;
      const panel=makeAction('EVENT READY','새로운 메시지가 도착했습니다',`${e.title} · 준비되면 핵심 사건을 진행할 수 있습니다. 지금은 자유대화를 계속해도 됩니다.`);
      panel.append(actionButton('스토리 이벤트 진행하기 →',startEvent,true));holder.append(panel);
    } else if (state.phase==='choice') {
      const e=chapterData().event;
      const panel=makeAction('YOUR CHOICE',e.title,'이 장면에서는 답장을 선택해 주세요. 선택한 결과는 다음 챕터에 반영됩니다.');
      e.choices.forEach(c=>panel.append(actionButton(c.label,()=>takeChoice(c.id))));holder.append(panel);
    } else if (state.phase==='cleared') {
      const last=state.choiceLog[state.choiceLog.length-1];
      const panel=makeAction('CHAPTER CLEARED','이야기가 이어집니다',`${last?.result||'이벤트 완료'} 신뢰도 ${state.trust} · 친밀도 ${state.affection}`);
      panel.append(actionButton(state.chapter<3?'다음 챕터로 →':'엔딩 확인하기 →',nextChapter,true));holder.append(panel);
    } else if (state.phase==='ended') {
      const ending=story.ending[state.ending];
      const panel=makeAction('THE END',ending.title,'다른 선택에 따라 결말이 달라집니다. 처음부터 다시 플레이할 수 있습니다.');
      panel.append(actionButton('처음부터 다시 플레이하기 ↻',reset,true));holder.append(panel);
    }
  }
  function renderMessages() {
    const list=$('message-list');
    list.replaceChildren();
    const fragment=document.createDocumentFragment();
    state.messages.forEach((m)=>{
      const row=node('div',`message ${m.role}`);
      row.append(node('div','bubble',m.text)); fragment.append(row);
    });
    list.append(fragment);
  }
  function renderSidebars() {
    $('chapter-subtitle').textContent=`CHAPTER ${String(state.chapter).padStart(2,'0')} · ${chapterData().title}`;
    $('detail-title').textContent=`챕터 ${String(state.chapter).padStart(2,'0')}`;
    $('detail-subtitle').textContent=chapterData().title;
    $('trust-number').textContent=state.trust;
    $('affection-number').textContent=state.affection;
    $('trust-meter').style.width=`${state.trust}%`;
    $('affection-meter').style.width=`${state.affection}%`;
    const nav=$('chapter-nav');nav.replaceChildren();
    for (const ch of story.chapters) {
      const current=ch.id===state.chapter;
      const locked=ch.id>state.chapter;
      const item=node('div',`chapter-link ${current?'active':''} ${locked?'locked':''}`);
      item.append(node('span','chapter-number',`0${ch.id}`));
      const group=node('span');group.append(node('span','chapter-name',locked?'???':ch.title),node('span','chapter-desc',locked?'잠김':current?'진행 중':'완료'));item.append(group);nav.append(item);
    }
    const mem=$('memory-list');mem.replaceChildren();
    if (!state.choiceLog.length) mem.append(node('li','', '아직 중요한 선택이 없습니다.'));
    else state.choiceLog.forEach(c=>mem.append(node('li','',`챕터 ${c.chapter}: ${c.result}`)));
    let progress=state.phase==='ended'?100:state.phase==='cleared'?100:state.phase==='choice'?75:Math.min(60,5+state.chapterTurn*10);
    $('phase-progress-fill').style.width=`${progress}%`;
    $('storage-status').textContent=storageAvailable?'현재 브라우저에 자동 저장됩니다. 브라우저 데이터를 지우면 기록이 사라질 수 있습니다.':'자동 저장을 사용할 수 없는 환경입니다. 필요한 경우 진행 데이터를 내보내 주세요.';
    const locked=state.phase!=='chat';
    $('message-input').disabled=locked;
    $('send-button').disabled=locked;
    $('message-input').placeholder=state.phase==='choice'?'먼저 선택지를 골라 주세요':state.phase==='cleared'?'다음 챕터로 이동해 주세요':state.phase==='ended'?'게임이 끝났습니다':'무슨 말이든 입력해 보세요...';
    $('composer-caption').textContent=locked?'현재는 스토리 진행 단계입니다.':'Enter로 전송 · 무료 / API 없음 · 자동 저장';
  }
  function render() {
    renderMessages();renderActions();renderSidebars();
    const scroll=$('chat-content');scroll.scrollTop=scroll.scrollHeight;
  }
  function reset() {
    if (!confirm('대화·선택 기록을 모두 지우고 처음부터 다시 시작할까요?')) return;
    state=blankState();beginChapter(1,true);save();render();
  }
  function exportSave() {
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob);const link=document.createElement('a');
    link.href=url;link.download='after-the-signal-save.json';document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function importSave(file) {
    if (!file || file.size>1_000_000) { alert('1MB 이하 JSON 저장 파일만 읽을 수 있습니다.');return; }
    try {
      const loaded=validateSave(JSON.parse(await file.text()));
      if (!loaded) throw new Error('invalid');
      if (!confirm('현재 진행 기록을 저장 파일로 교체할까요?')) return;
      state=loaded;save();render();closePanel();
    } catch (_) { alert('읽을 수 없는 저장 파일입니다.'); }
  }
  function openPanel(){ $('details').classList.add('open');$('overlay').classList.add('open');}
  function closePanel(){ $('details').classList.remove('open');$('overlay').classList.remove('open');}
  $('chat-form').addEventListener('submit',(e)=>{e.preventDefault();const inp=$('message-input');sendMessage(inp.value);inp.value='';inp.focus();});
  $('toggle-panel').addEventListener('click',openPanel);
  $('close-panel').addEventListener('click',closePanel);
  $('overlay').addEventListener('click',closePanel);
  $('reset-save').addEventListener('click',reset);
  $('export-save').addEventListener('click',exportSave);
  $('import-save').addEventListener('click',()=>$('import-file').click());
  $('import-file').addEventListener('change',e=>{const f=e.target.files?.[0];importSave(f);e.target.value='';});
  save();render();
})();
