(() => {
  'use strict';
  const data = window.CAFE_DATA;
  const KEY = 'cp-cafe-chat-save-v1';
  const $ = id => document.getElementById(id);
  const chapters = data.story.chapters;
  let available = true;
  let state;
  function emptyState() { return {version:1, chapter:0, phase:'info', turns:0, trust:0, messages:[], flags:{}, choices:[], seen:[], ending:null}; }
  function validSave(s) {
    if (!s || s.version!==1 || !Number.isInteger(s.chapter) || s.chapter<0 || s.chapter>chapters.length) return null;
    if (!['info','chat','choice','cleared','ended'].includes(s.phase) || !Array.isArray(s.messages)) return null;
    return {
      version:1,chapter:s.chapter,phase:s.phase,turns:Math.max(0,Math.min(100,Number(s.turns)||0)),
      trust:Math.max(0,Math.min(100,Number(s.trust)||0)),
      messages:s.messages.filter(m=>m && ['bot','player','system'].includes(m.role)&&typeof m.text==='string').slice(-200).map(m=>({role:m.role,text:m.text.slice(0,500)})),
      flags:s.flags && typeof s.flags==='object'&&!Array.isArray(s.flags) ? s.flags : {},
      choices:Array.isArray(s.choices)?s.choices.filter(x=>typeof x==='string').slice(0,20):[],
      seen:Array.isArray(s.seen)?s.seen.filter(x=>typeof x==='string').slice(0,30):[],
      ending: ['promise','today'].includes(s.ending)?s.ending:null
    };
  }
  try {const saved=localStorage.getItem(KEY);state=saved?validSave(JSON.parse(saved)):null;} catch (_) {available=false;}
  function add(role,text) { state.messages.push({role,text}); if(state.messages.length>200) state.messages=state.messages.slice(-200); }
  if (!state) {state=emptyState();data.character.intro.forEach(text=>add('bot',text));}
  function save() {if(!available)return;try{localStorage.setItem(KEY,JSON.stringify(state));}catch(_){available=false;}}
  function normal(s) {return s.normalize('NFKC').toLowerCase().replace(/[\u200b-\u200d\ufeff]/g,'').trim();}
  function infoKey(text) {const q=normal(text);return data.infoKeywords.find(p=>new RegExp(p.re,'i').test(q))?.id||null;}
  function answerInfo(id) {
    const label=data.infoLabels[id]||'카페 정보';
    const value=(data.information[id]||'').trim();
    return value?`💙 ${label} 안내해 드릴게요!\n\n${value}`:`💙 ${label}는 지금 안내를 준비 중이에요. 확정되는 대로 공지할게요!`;
  }
  function intent(text) {
    const q=normal(text);
    if (/(안\s*좋|싫|화\s*나|안\s*할래|귀찮)/.test(q)) return 'default';
    if (/(고마워|감사|좋아|함께|같이|약속|응원|사랑)/.test(q)) return 'kind';
    if (/(기쁘|신나|행복|즐거|최고|설레|반가워)/.test(q)) return 'happy';
    if (/(왜|어떻게|무슨|뭐|궁금|알려|\?|？)/.test(q)) return 'curious';
    if (/(안녕|하이|오랜만|ㅎㅇ|잘\s*지냈)/.test(q)) return 'greeting';
    return 'default';
  }
  function addInfo(id,ask) {if(ask)add('player',ask);add('bot',answerInfo(id));save();render();}
  function reply(text) {
    if(state.phase==='choice'||state.phase==='cleared'||state.phase==='ended') return;
    const msg=text.trim().slice(0,220);if(!msg)return;
    if(/^(스토리|이야기|챕터)\s*(시작|해줘|할래|보고\s*싶)/.test(normal(msg))) {add('player',msg);startStory();return;}
    const info=infoKey(msg);if(info){addInfo(info,msg);return;}
    add('player',msg);
    if(state.phase==='info'){
      add('bot','헤헤, 그렇구나! 💙 카페 정보도 물어봐 주세요. 조금 더 특별한 대화가 하고 싶다면 아래에서 ‘스토리 시작’을 눌러 주세요!');
    } else {
      const id=intent(msg), chapter=chapters[state.chapter-1];
      const pool=chapter.replies[id]||chapter.replies.default;
      const idx=(state.turns+state.seen.length)%pool.length;
      add('bot',pool[idx]);state.turns++;
      if(!state.seen.includes(id))state.seen.push(id);
    }
    save();render();
  }
  function startStory() {
    if(state.phase==='info'){
      state.chapter=1;state.phase='chat';state.turns=0;state.seen=[];
      add('system',`CHAPTER 01 · ${chapters[0].title}`);
      add('bot',data.story.intro);chapters[0].opening.forEach(text=>add('bot',text));
      save();render();
    } else if(state.phase==='chat') {add('bot','지금은 이야기를 나누는 중이에요! 조금 더 얘기하면 다음 장면을 열 수 있어요.');save();render();}
  }
  function eventReady(){return state.phase==='chat'&&state.turns>=3;}
  function openEvent() {
    if(!eventReady())return;
    state.phase='choice';const e=chapters[state.chapter-1].event;
    add('system',`STORY EVENT · ${e.title}`);e.lines.forEach(t=>add('bot',t));save();render();
  }
  function choose(id) {
    if(state.phase!=='choice')return;
    const e=chapters[state.chapter-1].event,c=e.choices.find(v=>v.id===id);if(!c)return;
    add('player',c.text);add('bot',c.reply);
    state.trust=Math.max(0,Math.min(100,state.trust+c.trust));
    state.flags[c.flag]=true;state.choices.push(id);state.phase='cleared';
    add('system','선택이 저장되었어요 ♡');save();render();
  }
  function next() {
    if(state.phase!=='cleared')return;
    if(state.chapter<chapters.length){
      state.chapter++;state.phase='chat';state.turns=0;state.seen=[];
      const ch=chapters[state.chapter-1];add('system',`CHAPTER ${String(state.chapter).padStart(2,'0')} · ${ch.title}`);ch.opening.forEach(t=>add('bot',t));
    } else {
      state.phase='ended';state.ending=state.flags.promise?'promise':'today';
      data.story.endings[state.ending].forEach((t,i)=>add(i===0?'system':'bot',t));
    }
    save();render();
  }
  function el(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}
  function makeButton(label,fn,primary=false){const b=el('button',primary?'primary':'',label);b.type='button';b.addEventListener('click',fn);return b;}
  function renderActions(){
    const root=$('story-actions');root.replaceChildren();
    if(!(eventReady()||['choice','cleared','ended'].includes(state.phase)))return;
    const box=el('section','action-box');
    function top(kicker,title,description){box.append(el('span','action-label',kicker),el('div','action-title',title),el('div','action-description',description));}
    if(eventReady()){
      top('NEW EVENT ✦','새로운 이야기가 열렸어요!','준비되면 다음 장면으로 넘어가요. 자유대화를 더 이어가도 괜찮아요.');
      box.append(makeButton('이야기 계속하기 →',openEvent,true));
    }else if(state.phase==='choice'){
      const e=chapters[state.chapter-1].event;top('MAKE A CHOICE',e.title,'어떤 답장을 보낼지 골라 주세요.');
      e.choices.forEach(c=>box.append(makeButton(c.text,()=>choose(c.id))));
    }else if(state.phase==='cleared'){
      top('CHAPTER CLEAR ♡','참 잘했어요!','방금 고른 선택은 다음 이야기에도 반영됩니다.');
      box.append(makeButton(state.chapter===chapters.length?'엔딩 보기 →':'다음 챕터 열기 →',next,true));
    }else{
      top('THE END ✦','오늘의 이야기 완료','채팅창 오른쪽 위 메뉴에서 처음부터 다시 즐길 수 있어요.');
    }
    root.append(box);
  }
  function render(){
    $('character-name').textContent=data.character.name;
    $('profile-avatar').textContent=data.character.avatar;
    $('character-subtitle').textContent=data.character.subtitle;
    $('chapter-label').textContent=state.phase==='info'?'INFO MODE':state.phase==='ended'?'THE END':`CHAPTER ${String(state.chapter).padStart(2,'0')}`;
    const root=$('messages');root.replaceChildren();const fragment=document.createDocumentFragment();
    for(const m of state.messages){
      const row=el('div',`message ${m.role}`);
      if(m.role==='bot') row.append(el('div','message-avatar',data.character.avatar));
      row.append(el('div','bubble',m.text));fragment.append(row);
    }
    root.append(fragment);renderActions();
    const locked=['choice','cleared','ended'].includes(state.phase);
    $('message-input').disabled=locked;$('send-button').disabled=locked;
    $('message-input').placeholder=locked?'먼저 스토리 선택지를 진행해 주세요':'궁금한 내용을 자유롭게 입력해 주세요 ♡';
    for(const b of document.querySelectorAll('[data-info]'))b.disabled=locked;
    const storyChip=document.querySelector('[data-start-story]');storyChip.hidden=state.phase!=='info';
    $('thread').scrollTop=$('thread').scrollHeight;
  }
  function toggleMenu(open){$('popup-menu').hidden=!open;$('menu-toggle').setAttribute('aria-expanded',open?'true':'false');}
  $('menu-toggle').addEventListener('click',()=>toggleMenu($('popup-menu').hidden));
  document.addEventListener('click',e=>{if(!e.target.closest('.popup-menu')&&!e.target.closest('.menu-toggle'))toggleMenu(false);});
  $('chat-form').addEventListener('submit',e=>{e.preventDefault();reply($('message-input').value);$('message-input').value='';$('message-input').focus();});
  for(const b of document.querySelectorAll('[data-info]'))b.addEventListener('click',()=>addInfo(b.dataset.info,data.infoLabels[b.dataset.info]+' 알려줘'));
  document.querySelector('[data-start-story]').addEventListener('click',startStory);
  $('save-reset').addEventListener('click',()=>{toggleMenu(false);if(!confirm('채팅 기록을 지우고 처음부터 시작할까요?'))return;state=emptyState();data.character.intro.forEach(t=>add('bot',t));save();render();});
  $('save-export').addEventListener('click',()=>{
    toggleMenu(false);const b=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download='cp-cafe-chat-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('save-import').addEventListener('click',()=>{$('save-file').click();toggleMenu(false);});
  $('save-file').addEventListener('change',async e=>{
    const f=e.target.files?.[0];e.target.value='';if(!f)return;
    if(f.size>1000000){alert('1MB 이하 JSON 파일만 불러올 수 있어요.');return;}
    try{const parsed=validSave(JSON.parse(await f.text()));if(!parsed)throw Error('invalid');if(!confirm('기존 채팅 기록을 불러온 기록으로 바꿀까요?'))return;state=parsed;save();render();}
    catch(_){alert('읽을 수 없는 저장 파일입니다.');}
  });
  save();render();
})();
