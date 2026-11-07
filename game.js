(() => {
  'use strict';
  const data = window.CAFE_DATA;
  const members = data.members;
  const KEY = 'cp-cafe-mission-chat-v1';
  const $ = id => document.getElementById(id);
  let state;
  let storageAvailable = true;

  function fresh() {
    return {version:1,memberIndex:0,phase:'talk',turns:0,attempts:0,messages:[],unlocked:[],items:[],cleared:[],history:[]};
  }
  function safeSave(input) {
    if (!input || input.version !== 1 || !Number.isInteger(input.memberIndex) || input.memberIndex<0 || input.memberIndex>=members.length) return null;
    if (!['talk','mission','cleared','complete'].includes(input.phase) || !Array.isArray(input.messages)) return null;
    const validInfo = Object.keys(data.information);
    const validItems = members.map(m => m.mission.item.id);
    const validMembers = members.map(m => m.id);
    const uniq = (input,allowed) => [...new Set(Array.isArray(input)?input.filter(s=>allowed.includes(s)):[])];
    return {
      version:1,memberIndex:input.memberIndex,phase:input.phase,
      turns:Math.min(100,Math.max(0,Number(input.turns)||0)),
      attempts:Math.min(100,Math.max(0,Number(input.attempts)||0)),
      messages:input.messages.filter(m=>m&&['bot','player','system'].includes(m.role)&&typeof m.text==='string').slice(-150).map(m=>({role:m.role,text:m.text.slice(0,1000),memberId:validMembers.includes(m.memberId)?m.memberId:null})),
      unlocked:uniq(input.unlocked,validInfo),items:uniq(input.items,validItems),cleared:uniq(input.cleared,validMembers),
      history:Array.isArray(input.history)?input.history.filter(s=>typeof s==='string').slice(-40):[]
    };
  }
  try {const raw=localStorage.getItem(KEY);state=raw?safeSave(JSON.parse(raw)):null;} catch (_) {storageAvailable=false;}
  function save(){if(!storageAvailable)return;try{localStorage.setItem(KEY,JSON.stringify(state));}catch(_){storageAvailable=false;}}
  function active(){return members[state.memberIndex];}
  function add(role,text,memberId=active().id){state.messages.push({role,text,memberId});if(state.messages.length>150)state.messages=state.messages.slice(-150);}
  function init(){state=fresh();add('system','WELCOME · '+data.title);add('bot',data.intro);active().opening.forEach(t=>add('bot',t));save();}
  if(!state)init();
  const normalize = value => String(value||'').normalize('NFKC').toLowerCase().replace(/[\u200b-\u200d\ufeff\s\p{P}]/gu,'');
  function hasMissionAnswer(text,answers){const q=normalize(text);return q.length>0&&answers.some(a=>q===normalize(a)||((normalize(a).length>=2)&&q.includes(normalize(a))));}
  function intent(text){
    const s=String(text||'');
    if(/(고마워|감사|좋아|사랑|응원|최고|함께|같이)/.test(s))return 'kind';
    if(/(신나|행복|즐거|기대|설레|기쁘)/.test(s))return 'happy';
    if(/(왜|어떻게|뭐|무엇|어디|궁금|알려|\?)/.test(s))return 'curious';
    if(/(안녕|하이|반가워|ㅎㅇ|오랜만)/.test(s))return 'greeting';
    return 'default';
  }
  function showInfo(unlockedOnly=true){
    const keys=Object.keys(data.information);const allowed=unlockedOnly?keys.filter(k=>state.unlocked.includes(k)):keys;
    if(!allowed.length){add('bot','카페 정보는 멤버별 미션을 완료하면 하나씩 열려요! 💙');return;}
    add('bot',`📮 지금까지 해금한 카페 정보 (${allowed.length}/${keys.length})`);
    for(const k of allowed){
      const value=String(data.information[k]||'').trim();
      add('bot',`${data.infoLabels[k]}\n${value||'아직 운영자가 확정 정보를 입력하지 않았어요.'}`);
    }
    const locked=keys.length-allowed.length;
    if(locked)add('bot',`🔒 아직 ${locked}개 정보가 잠겨 있어요. 멤버 미션을 진행해 주세요!`);
  }
  function showItems(){
    if(!state.items.length){add('bot','🎁 아직 획득한 아이템이 없어요. 멤버 미션을 풀어 볼까요?');return;}
    const all=members.map(m=>m.mission.item).filter(item=>state.items.includes(item.id));
    add('system','MY COLLECTION · '+all.length+'/'+members.length);
    all.forEach(item=>add('bot',`${item.icon} ${item.name}\n${item.description}`));
    add('bot','※ 이 시제품의 아이템은 브라우저에 저장되는 디지털 보상입니다. 실제 상품 수령권이나 교환권이 아니에요.');
  }
  function hint(){
    if(state.phase==='complete'){add('bot','모든 미션을 완료했어요! 🎉');return;}
    if(state.phase==='talk'){add('bot','먼저 나와 대화해 보고, 미션이 열리면 힌트를 확인해 줘! 💙');return;}
    if(state.phase==='cleared'){add('bot','이번 미션은 이미 해결했어! 💛');return;}
    add('bot',`💡 ${active().mission.hint}`);
  }
  function reply(text){
    const msg=String(text).trim().slice(0,220);if(!msg)return;
    if(state.phase==='cleared'){add('bot','먼저 아래의 “다음 멤버 만나기” 버튼을 눌러 주세요!');save();render();return;}
    add('player',msg);
    if(state.phase==='complete'){
      add('bot','이미 모든 미션을 클리어했어요! 아래에서 카페 정보와 획득품을 다시 확인할 수 있어요.');
    }else if(state.phase==='mission'){
      const mission=active().mission;
      if(hasMissionAnswer(msg,mission.answers)){
        add('bot',mission.success);
        state.cleared.push(active().id);
        for(const k of mission.infoKeys)if(!state.unlocked.includes(k))state.unlocked.push(k);
        if(!state.items.includes(mission.item.id))state.items.push(mission.item.id);
        state.phase='cleared';
        add('system','MISSION CLEAR · '+active().name);
        mission.infoKeys.forEach(k=>{
          const value=String(data.information[k]||'').trim();
          add('bot',`🔓 ${data.infoLabels[k]} 해금!\n${value||'운영자가 아직 행사 정보를 입력하지 않았어요.'}`);
        });
        add('bot',`🎁 ${mission.item.name} 획득!\n${mission.item.description}\n※ 시연용 디지털 아이템 · 실제 교환권 아님`);
      } else {
        state.attempts++;
        add('bot',state.attempts>=2?'조금만 더! 아래 ‘미션 힌트’를 눌러봐도 좋아. 💛':'아쉽지만 그건 아니야. 다시 자유롭게 답해 봐!');
      }
    } else {
      const member=active();
      const kind=intent(msg),pool=member.replies[kind]||member.replies.default;
      const idx=(state.turns+state.memberIndex)%pool.length;
      add('bot',pool[idx]);state.turns++;
      state.history.push(kind);if(state.history.length>40)state.history.shift();
      if(state.turns===2)add('system',`✨ ${member.name}의 미션에 도전할 수 있어요!`);
    }
    save();render();
  }
  function startMission(){
    if(state.phase!=='talk'||state.turns<2)return;
    state.phase='mission';state.attempts=0;
    add('system',active().mission.title);
    add('bot',active().mission.prompt);
    save();render();
  }
  function next(){
    if(state.phase!=='cleared')return;
    if(state.memberIndex===members.length-1){
      state.phase='complete';
      data.ending.forEach((t,i)=>add(i===0?'system':'bot',t));
      add('bot','🎁 내 획득품에서 모은 아이템을 확인해 봐!');
    }else{
      state.memberIndex++;state.phase='talk';state.turns=0;state.attempts=0;
      add('system',`CHAPTER ${String(state.memberIndex+1).padStart(2,'0')} · ${active().name}`);
      active().opening.forEach(t=>add('bot',t));
    }
    save();render();
  }
  function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
  function button(label,onClick,primary=false){const e=el('button',primary?'primary':'',label);e.type='button';e.addEventListener('click',onClick);return e;}
  function renderActions(){
    const dest=$('story-actions');dest.replaceChildren();
    if(state.phase==='talk'&&state.turns<2)return;
    const box=el('section','action-box');
    function top(flag,title,description){box.append(el('span','action-label',flag),el('div','action-title',title),el('div','action-description',description));}
    if(state.phase==='talk'){
      top('MISSION OPEN ✨',active().mission.title,'자유대화를 더 이어가도 좋고, 지금 미션을 시작할 수도 있어요.');
      box.append(button('미션 시작하기 →',startMission,true));
    }else if(state.phase==='mission'){
      top('TYPE YOUR ANSWER ✏️',active().mission.title,'아래 채팅 입력창에 정답을 자유롭게 적어 보내세요.');
      box.append(button('💡 힌트 보기',()=>{hint();save();render();}));
    }else if(state.phase==='cleared'){
      top('MISSION CLEAR! 🎉','멤버의 선물을 받았어요','카페 정보와 디지털 아이템이 해금됐어요.');
      box.append(button(state.memberIndex===members.length-1?'결말 메시지 보기 →':'다음 멤버 만나기 →',next,true));
    }else{
      top('ALL CLEAR 💙💛🤍','세 개의 미션 성공!','카페 정보와 아이템을 모두 해금했어요.');
      box.append(button('🎁 내 획득품 확인',()=>{showItems();save();render();}));
    }
    dest.append(box);
  }
  function render(){
    const member=active();
    $('character-name').textContent=member.name;
    $('character-subtitle').textContent=member.subtitle;
    $('profile-avatar').textContent=member.avatar;
    $('chat-title').textContent='♡  '+data.title;
    $('chapter-label').textContent=state.phase==='complete'?'ALL CLEAR':`MISSION ${String(state.memberIndex+1).padStart(2,'0')} / ${String(members.length).padStart(2,'0')}`;
    const progress=$('member-progress');progress.replaceChildren();
    members.forEach((m,i)=>{const done=state.cleared.includes(m.id);progress.append(el('div',`member-dot ${done?'done':i===state.memberIndex?'active':''}`,`${done?'✓':m.avatar} ${m.name}`));});
    const dest=$('messages');dest.replaceChildren();const f=document.createDocumentFragment();
    for(const m of state.messages){
      const row=el('div','message '+m.role);
      if(m.role==='bot')row.append(el('div','message-avatar',members.find(x=>x.id===m.memberId)?.avatar||member.avatar));
      row.append(el('div','bubble',m.text));f.append(row);
    }
    dest.append(f);renderActions();
    const disabled=state.phase==='cleared'||state.phase==='complete';
    $('message-input').disabled=disabled;$('send-button').disabled=disabled;
    $('message-input').placeholder=state.phase==='mission'?'미션 정답을 자유롭게 입력해 주세요 ♡':disabled?'다음 장면으로 이동해 주세요':'멤버에게 자유롭게 답장해 주세요 ♡';
    $('quick-hint').disabled=state.phase==='complete';
    $('quick-hello').disabled=disabled||state.phase==='mission';
    $('thread').scrollTop=$('thread').scrollHeight;
  }
  function answerQuick(fn){fn();save();render();}
  function toggleMenu(open){$('popup-menu').hidden=!open;$('menu-toggle').setAttribute('aria-expanded',open?'true':'false');}
  $('menu-toggle').addEventListener('click',()=>toggleMenu($('popup-menu').hidden));
  document.addEventListener('click',e=>{if(!e.target.closest('.popup-menu')&&!e.target.closest('.menu-toggle'))toggleMenu(false);});
  $('chat-form').addEventListener('submit',e=>{e.preventDefault();reply($('message-input').value);$('message-input').value='';$('message-input').focus();});
  $('quick-hello').addEventListener('click',()=>reply('안녕! 반가워.'));
  $('quick-hint').addEventListener('click',()=>answerQuick(hint));
  $('quick-info').addEventListener('click',()=>answerQuick(()=>showInfo(true)));
  $('quick-items').addEventListener('click',()=>answerQuick(showItems));
  $('save-reset').addEventListener('click',()=>{toggleMenu(false);if(!confirm('대화와 해금한 아이템을 모두 지우고 처음부터 시작할까요?'))return;init();render();});
  $('save-export').addEventListener('click',()=>{toggleMenu(false);const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='cp-cafe-mission-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  $('save-import').addEventListener('click',()=>{$('save-file').click();toggleMenu(false);});
  $('save-file').addEventListener('change',async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    if(file.size>1000000){alert('1MB 이하 JSON 파일만 불러올 수 있습니다.');return;}
    try{const parsed=safeSave(JSON.parse(await file.text()));if(!parsed)throw Error('invalid');if(!confirm('현재 진행 기록을 불러온 저장 파일로 바꾸시겠어요?'))return;state=parsed;save();render();}
    catch(_){alert('읽을 수 없는 저장 파일입니다.');}
  });
  save();render();
})();
