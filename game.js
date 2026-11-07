(() => {
  'use strict';
  const story = window.STORY_DATA;
  if (!story || !Array.isArray(story.members) || !story.members.length) throw Error('story-data.js를 먼저 불러와 주세요.');
  const $ = id => document.getElementById(id);
  const members = story.members;
  const validIds = members.map(m => m.id);
  // Each new playthrough chooses two distinct ingredients out of each member's four.
  // The choices are stored with the save, so refreshing will not reroll missions.
  const requiredCount = member => Math.min(member.ingredients.length, Math.max(1,
    Number.isInteger(member.requiredIngredients) ? member.requiredIngredients : member.ingredients.length));
  const STORAGE_KEY = 'cp-cafe-lost-recipe-v4'; // Keeps older saves available for migration.
  const PHASES = ['talk','search','solve','found','member_done','finished'];
  let state;
  let storageEnabled = true;
  let selectedMemberId = null;

  function randomNumber(max) {
    if (globalThis.crypto?.getRandomValues) {
      const buf = new Uint32Array(1);
      // Rejection sampling avoids modulo bias even if ingredient pools grow.
      const limit = 0x100000000 - (0x100000000 % max);
      do { globalThis.crypto.getRandomValues(buf); } while (buf[0] >= limit);
      return buf[0] % max;
    }
    return Math.floor(Math.random() * max);
  }
  function randomIngredients(member, priorities=[]) {
    const count=requiredCount(member);
    const validIds=member.ingredients.map(i=>i.id);
    const chosen=[...new Set(priorities.filter(id=>validIds.includes(id)))].slice(0,count);
    const remaining=validIds.filter(id=>!chosen.includes(id));
    while(chosen.length<count) {
      const index=randomNumber(remaining.length);
      chosen.push(remaining.splice(index,1)[0]);
    }
    return chosen;
  }
  function allSelectedKeys(s) {
    return members.flatMap(m=>(s.selectedIngredients[m.id]||[]).map(id=>`${m.id}:${id}`));
  }
  function newState() {
    return {version:6,started:false,nickname:'',currentMemberId:null,completedMembers:[],
      selectedIngredients:Object.fromEntries(members.map(m=>[m.id,randomIngredients(m)])),
      collected:[],itemIndex:0,phase:'talk',talkTurns:0,wrongSearch:0,wrongAnswer:0,
      messages:[],receiptId:null,issuedAt:null};
  }
  function validate(raw) {
    if (!raw || ![4,5,6].includes(raw.version) || !PHASES.includes(raw.phase) || !Array.isArray(raw.messages) ||
      typeof raw.nickname !== 'string' || raw.nickname.length > 12 ||
      !Array.isArray(raw.collected) || !Array.isArray(raw.completedMembers)) return null;
    const result=newState();
    result.started=!!raw.started;
    result.nickname=raw.nickname.trim().slice(0,12);
    result.currentMemberId=validIds.includes(raw.currentMemberId)?raw.currentMemberId:null;
    if(result.started&&(!result.nickname||!result.currentMemberId))return null;
    for (const member of members) {
      const saved=raw.selectedIngredients?.[member.id];
      const validIdsForMember=member.ingredients.map(i=>i.id);
      if(raw.version===6&&Array.isArray(saved)&&saved.length===requiredCount(member)&&
        new Set(saved).size===saved.length&&saved.every(id=>validIdsForMember.includes(id))) {
        result.selectedIngredients[member.id]=[...saved];
      } else if(raw.version<=5&&result.started) {
        // Preserve already found ingredients and the active unsolved recipe during migration.
        const found=member.ingredients.filter(i=>raw.collected.includes(`${member.id}:${i.id}`)).map(i=>i.id);
        const active=member.id===result.currentMemberId ? member.ingredients[raw.itemIndex]?.id : null;
        const fixed=[...found];
        if(active&&!fixed.includes(active))fixed.push(active);
        result.selectedIngredients[member.id]=randomIngredients(member,fixed);
      }
    }
    const selectedKeys=allSelectedKeys(result);
    result.collected=[...new Set(raw.collected.filter(key=>selectedKeys.includes(key)))];
    result.completedMembers=members.filter(m=>result.selectedIngredients[m.id].every(id=>
      result.collected.includes(`${m.id}:${id}`))).map(m=>m.id);
    const member=members.find(m=>m.id===result.currentMemberId);
    if(raw.version<=5&&member){
      const oldId=member.ingredients[raw.itemIndex]?.id;
      const migratedIndex=result.selectedIngredients[member.id].indexOf(oldId);
      result.itemIndex=migratedIndex>=0?migratedIndex:0;
    }else{
      result.itemIndex=Math.max(0,Math.min(member?requiredCount(member)-1:0,Number.isInteger(raw.itemIndex)?raw.itemIndex:0));
    }
    result.phase=raw.phase;
    if(result.started&&result.completedMembers.includes(result.currentMemberId)){
      result.phase=result.completedMembers.length===members.length?'finished':'member_done';
      if(raw.version<=5&&result.phase!==raw.phase)
        result.messages.push({role:'system',text:'업데이트: 두 재료를 모두 찾았어요. 다른 멤버에게 이어서 연락해 보세요!',memberId:result.currentMemberId});
    }else if(result.phase==='finished'||result.phase==='member_done'){
      // Never leave a save in a completed phase unless all selected ingredients are collected.
      result.phase='talk';
    }
    result.talkTurns=Math.max(0,Math.min(20,Number(raw.talkTurns)||0));
    result.wrongSearch=Math.max(0,Math.min(30,Number(raw.wrongSearch)||0));
    result.wrongAnswer=Math.max(0,Math.min(30,Number(raw.wrongAnswer)||0));
    result.messages=[...result.messages,...raw.messages.filter(m=>m&&['bot','player','system'].includes(m.role)&&typeof m.text==='string')
      .slice(-280).map(m=>({role:m.role,text:m.text.slice(0,800),memberId:validIds.includes(m.memberId)?m.memberId:result.currentMemberId}))].slice(-280);
    if(result.phase==='finished'){
      result.receiptId=typeof raw.receiptId==='string'&&/^DEMO-[A-Z0-9]{8}$/.test(raw.receiptId)?raw.receiptId:null;
      result.issuedAt=typeof raw.issuedAt==='string'&&raw.issuedAt.length<40?raw.issuedAt:null;
    }
    return result;
  }
  function persist() {
    if (!storageEnabled) return;
    try {localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}
    catch (_) {storageEnabled=false;}
  }
  function currentMember() {return members.find(m=>m.id===state.currentMemberId)||members[0];}
  function currentItem() {
    const member=currentMember();
    const ingredientId=state.selectedIngredients[member.id][state.itemIndex];
    return member.ingredients.find(item=>item.id===ingredientId);
  }
  function say(role,raw,memberId=state.currentMemberId) {
    const text = role==='bot' ? String(raw).replaceAll('{nickname}',state.nickname) : String(raw);
    state.messages.push({role,text,memberId});
    if(state.messages.length>280)state.messages=state.messages.slice(-280);
  }
  function sayAll(role,lines) {for(const line of lines)say(role,line);}
  function begin(memberId,nickname) {
    state=newState();state.started=true;state.nickname=nickname.trim().slice(0,12);
    enterMember(memberId);persist();render();
  }
  function enterMember(memberId) {
    if(!validIds.includes(memberId)||state.completedMembers.includes(memberId))return;
    state.currentMemberId=memberId;state.itemIndex=0;state.phase='talk';state.talkTurns=0;state.wrongSearch=0;state.wrongAnswer=0;
    say('system',`${currentMember().name}님과 대화가 연결되었어요 ♡`);
    sayAll('bot',currentMember().opening);
    say('bot',currentItem().intro);
    persist();render();
  }
  function initialLoad() {
    try {const raw=localStorage.getItem(STORAGE_KEY);state=raw?validate(JSON.parse(raw)):null;}
    catch(_){storageEnabled=false;}
    if(!state)state=newState();
    persist(); // Immediately save randomized/migrated selections for stable refreshes.
  }
  initialLoad();

  const normal = text => String(text||'').normalize('NFKC').toLowerCase()
    .replace(/[\u200b-\u200d\ufeff\s\p{P}\p{S}]/gu,'');
  const negative = text => /(?:아니|아냐|아닌|아님|말고|그거 말고|아닐|not\b)/i.test(String(text));
  function matchesAnswer(text,answers) {
    const raw=String(text||'').trim();
    // '청경채 말고', '청경채는 아니야' 같은 부정은 정답 처리하지 않습니다.
    if (/(?:말고|아니라고|아닌데|아니래|아님|아냐|틀렸)/.test(raw)) return false;
    // '청경채 아니야?' / '청경채 아닐까?'는 긍정적인 추측 표현으로 허용합니다.
    if (/(?:아니야|아니다|아닐)/.test(raw) && !/(?:아닐까|아니야\s*[?？])/.test(raw)) return false;
    const t=normal(raw);
    if(!t)return false;
    const prefix='(?:정답은|정답|답은|답|이거|그거|재료는|재료|내생각엔|내생각에는|아마|혹시)?';
    const suffix='(?:인것같아|인거같아|인것같은데|인거같은데|일것같아|일거같아|같아|같은데|인듯|일듯|맞지|맞아|이야|야|일까|인가|아닐까|아니야|인데|이네)?';
    return answers.some(answer=> {
      const a=normal(answer);
      if(!a)return false;
      const escaped=a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      return new RegExp(`^${prefix}${escaped}${suffix}$`).test(t);
    });
  }
  function collectCurrentItem(wasEarly) {
    const m=currentMember(), item=currentItem(), key=`${m.id}:${item.id}`;
    if(state.collected.includes(key)) return;
    state.phase='found';
    state.collected.push(key);
    if(wasEarly) say('bot','벌써 알아챘어? 정답이야! 힌트 없이 찾아내다니 대단한데?');
    // Only the item-specific line is shown; scripted 'last ingredient' lines would
    // contradict a randomized order. A generic transition follows instead.
    if(item.success.length)say('bot',item.success[0]);
    const remain=requiredCount(m)-state.selectedIngredients[m.id].filter(id=>state.collected.includes(`${m.id}:${id}`)).length;
    say('bot',remain>0?'좋아, 다음 재료도 찾아보자!':'이제 이 요리에 필요한 두 재료를 모두 찾았어!');
    say('system','✦ 찾은 재료를 잘 챙겨 두었어요.');
  }
  function intentOf(text){
    if(/(?:힌트|모르겠|도움|help|단서)/i.test(text))return 'hint';
    if(/(?:안\s*돼|못\s*해|싫|바빠|안할|안\s*할|아니|어려워)/.test(text))return 'no';
    if(/(?:고마워|사랑|최고|힘내|응원|귀엽|보고싶|반가워|안녕)/.test(text))return 'warm';
    if(/(?:왜|무슨|어떤|뭐|어디|어떻게|궁금|알려|\?)/.test(text))return 'question';
    if(/(?:응|그래|좋아|당연|도와|찾아|해볼|할게|같이|물론|네|ㅇㅇ|오케이)/.test(text))return 'yes';
    if(/(?:정답|혹시|맞혀|이거)/.test(text))return 'guess';
    return 'default';
  }
  function replyFromVoice(text){
    const intent=intentOf(text);
    const voice=currentMember().voice;
    const pool=voice[intent==='hint'?'question':intent]||voice.default;
    return pool[(state.talkTurns+state.wrongAnswer)%pool.length];
  }
  function cafeQuestion(text){
    return /(카페|날짜|일정|장소|위치|주소|특전|선물|상품|굿즈|교환증|영수증|행사|예약|발권)/.test(text);
  }
  function respond(raw){
    const text=String(raw||'').trim().slice(0,180);
    if(!state.started||!text||['found','member_done','finished'].includes(state.phase))return;
    say('player',text);
    const m=currentMember(), item=currentItem(), intent=intentOf(text);
    if(matchesAnswer(text,item.answers)){
      // 대화 첫 턴이나 수색 중에도 정답을 입력하면 즉시 인정합니다.
      collectCurrentItem(state.phase!=='solve');
    }else if(state.phase==='talk'){
      if(cafeQuestion(text)) say('bot','그 이야기는 준비가 끝나면 알려줄게. 지금은 우리 레시피부터 완성해 보자!');
      else say('bot',replyFromVoice(text));
      state.talkTurns++;
      if(state.talkTurns >= (item.introTurns||2)){
        state.phase='search';
        say('bot',item.searchPrompt);
      }else if(state.talkTurns===1){
        say('bot','아까부터 마음에 걸리는 흔적이 있어. 네 생각도 조금 더 들려줄래?');
      }
    }else if(state.phase==='search'){
      const selected=item.searchOptions.find(opt=>normal(text).includes(normal(opt.label)));
      if(selected)searchAt(item.searchOptions.indexOf(selected),true);
      else if(intent==='hint'||intent==='question')say('bot','주변을 잘 살펴보자. 화면에 나온 장소 중 어디가 더 수상해 보여?');
      else say('bot',replyFromVoice(text)+' 장소를 골라 확인해 보자.');
    }else if(state.phase==='solve'){
      if(intent==='hint'||intent==='question'){
        say('bot',item.hint);
      }else{
        state.wrongAnswer++;
        if(state.wrongAnswer%2===0) say('bot','조금 더 생각해 보자. '+item.hint);
        else say('bot','음… 그 재료는 아닌 것 같아. '+item.clues[state.wrongAnswer%item.clues.length]);
      }
    }
    persist();render();
  }
  function searchAt(index,fromChat=false){
    if(state.phase!=='search')return;
    const item=currentItem(), option=item.searchOptions[index];
    if(!option)return;
    if(!fromChat)say('player',option.label);
    say('bot',option.reply);
    if(option.right){
      state.phase='solve';state.wrongAnswer=0;
      sayAll('bot',item.clues);
      say('bot','찾은 흔적과 맞는 재료가 뭘까? 직접 입력해 줘.');
    }else{
      state.wrongSearch++;
      if(state.wrongSearch>=2)say('bot','다른 장소도 살펴보자. 분명 가까이에 있어.');
    }
    persist();render();
  }
  function nextScene(){
    if(state.phase!=='found')return;
    const member=currentMember();
    if(state.itemIndex+1<requiredCount(member)){
      state.itemIndex++;state.talkTurns=0;state.wrongSearch=0;state.wrongAnswer=0;state.phase='talk';
      say('system','잠시 후 · 새로운 흔적');
      say('bot',currentItem().intro);
    }else completeMember();
    persist();render();
  }
  function completeMember(){
    const member=currentMember();
    if(!state.completedMembers.includes(member.id))state.completedMembers.push(member.id);
    sayAll('bot',member.memberComplete);
    const clue=member.cafeUnlock;
    say('system',`♡ 발견한 쪽지 · ${clue.label}`);
    say('bot',String(story.cafe[clue.key]||'').trim()||clue.fallback);
    if(state.completedMembers.length===members.length){
      state.phase='finished';
      story.completion.forEach(line=>say('bot',line));
      ensureReceipt();
    }else{
      state.phase='member_done';
      say('bot','아직 다른 주방에서도 연락이 왔대. 누구에게 먼저 답장할까?');
    }
  }
  function ensureReceipt(){
    if(state.receiptId)return;
    const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes=new Uint8Array(8);
    if(globalThis.crypto?.getRandomValues)crypto.getRandomValues(bytes);
    else for(let i=0;i<8;i++)bytes[i]=Math.floor(Math.random()*256);
    state.receiptId='DEMO-'+Array.from(bytes,x=>chars[x%chars.length]).join('');
    state.issuedAt=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  }
  function create(tag,className,text){
    const el=document.createElement(tag);
    if(className)el.className=className;
    if(text!==undefined)el.textContent=text;
    return el;
  }
  function renderControls(){
    const host=$('story-control');host.replaceChildren();
    if(state.phase==='talk'||state.phase==='solve')return;
    const wrap=create('div','story-inline');
    function control(text,handler,css=''){
      const b=create('button',css,text);b.type='button';b.addEventListener('click',handler);wrap.append(b);
    }
    if(state.phase==='search'){
      for(let i=0;i<currentItem().searchOptions.length;i++){
        const option=currentItem().searchOptions[i];
        control(`🔎  ${option.label} 살펴보기`,()=>searchAt(i));
      }
    }else if(state.phase==='found'){
      control('계속 이야기하기  →',nextScene);
    }else if(state.phase==='member_done'){
      for(const m of members.filter(m=>!state.completedMembers.includes(m.id))){
        control(`${m.avatar}  ${m.name}에게 메시지 보내기`,()=>enterMember(m.id));
      }
    }else if(state.phase==='finished'){
      control('✉️ 도착한 봉투 열기',openTicket,'ticket-trigger');
      wrap.append(create('div','story-mini-note','모든 재료를 찾은 사람에게만 열린 편지 ♡'));
    }
    if(wrap.childElementCount)host.append(wrap);
  }
  function render(){
    const isStarting=!state.started;
    $('chat-shell').classList.toggle('is-starting',isStarting);
    $('start-screen').setAttribute('aria-hidden',String(!isStarting));
    if(isStarting){document.title=`${story.siteTitle} · 오늘의 주문 메뉴`;return;}
    const member=currentMember();
    $('profile-emoji').textContent=member.avatar;
    $('profile-name').textContent=`${member.name} · ${member.menuTitle}`;
    $('profile-status').textContent=member.subtitle;
    document.title=`${story.siteTitle} · ${member.name}`;
    const host=$('messages');host.replaceChildren();
    const frag=document.createDocumentFragment();
    for(const line of state.messages){
      const row=create('div',`message ${line.role}`);
      if(line.role==='bot')row.append(create('div','message-avatar',members.find(m=>m.id===line.memberId)?.avatar||member.avatar));
      row.append(create('div','bubble',line.text));frag.append(row);
    }
    host.append(frag);renderControls();
    const disabled=['found','member_done','finished'].includes(state.phase);
    $('reply-input').disabled=disabled;$('send-button').disabled=disabled;
    $('reply-input').placeholder=state.phase==='solve'?'재료 이름을 입력하세요 · 힌트도 가능':
      state.phase==='search'?'직접 입력하거나 장소를 선택해 주세요':
      disabled?'채팅 속 버튼을 눌러 주세요':'하고 싶은 말을 자유롭게 입력하세요';
    $('footer-caption').textContent='a little recipe, a little story ♡';
    const scroll=$('conversation');scroll.scrollTop=scroll.scrollHeight;
  }
  function renderMemberMenu(){
    const host=$('member-menu');host.replaceChildren();
    members.forEach((m,index)=>{
      const btn=create('button','member-menu-item');btn.type='button';
      btn.dataset.member=m.id;btn.setAttribute('aria-pressed',String(m.id===selectedMemberId));
      if(selectedMemberId===m.id)btn.classList.add('selected');
      btn.append(create('span','menu-avatar',m.avatar));
      const details=create('span','menu-member-details');
      details.append(create('span','menu-member-code',`TODAY'S MENU ${String(index+1).padStart(2,'0')}`));
      details.append(create('strong','menu-member-name',m.menuTitle));
      details.append(create('span','menu-member-subtitle',`${m.name}와 대화하기 · ${m.menuSubtitle}`));
      btn.append(details,create('span','menu-member-check',selectedMemberId===m.id?'✓':'＋'));
      btn.addEventListener('click',()=>{selectedMemberId=m.id;renderMemberMenu();updateStartButton();});
      host.append(btn);
    });
  }
  function updateStartButton(){$('start-button').disabled=!(selectedMemberId&&$('nickname-input').value.trim());}
  $('nickname-input').addEventListener('input',updateStartButton);
  $('start-form').addEventListener('submit',e=>{e.preventDefault();const n=$('nickname-input').value.trim();if(!selectedMemberId||!n)return;begin(selectedMemberId,n);$('reply-input').focus();});
  renderMemberMenu();

  const dialog=$('ticket-dialog');
  function ingredientsSummary(){return `${state.collected.length}개 · 영곰훠궈 / 필곰김밥 / 도곰라멘`;}
  function populateTicket(){
    ensureReceipt();$('ticket-nickname').textContent=state.nickname;
    $('ticket-number').textContent=state.receiptId;
    $('ticket-date').textContent=state.issuedAt;
    $('ticket-ingredients').textContent=ingredientsSummary();
    $('ticket-gift').textContent=story.receipt.gift;
    $('ticket-message').textContent=story.receipt.message;persist();
  }
  function openTicket(){
    if(state.phase!=='finished'||state.collected.length!==allSelectedKeys(state).length||state.completedMembers.length!==members.length)return;
    populateTicket();dialog.showModal();
  }
  function saveFile(blob,filename){
    const url=URL.createObjectURL(blob),a=create('a');a.href=url;a.download=filename;
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  async function downloadTicket(){
    if(state.phase!=='finished')return;
    populateTicket();if(document.fonts?.ready)await document.fonts.ready;
    const canvas=document.createElement('canvas');canvas.width=900;canvas.height=1220;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.fillStyle='#e9f5ff';ctx.fillRect(0,0,900,1220);
    for(let y=0;y<1220;y+=180)for(let x=0;x<900;x+=180)if(((x+y)/180)%2===0){ctx.fillStyle='#fff5d8';ctx.fillRect(x,y,180,180);}
    function box(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=3;ctx.stroke();}
    box(75,55,750,1100,35,'#fffefa','#87bbe1');box(105,90,690,1030,21,'#fffefa','#b3d9ed');
    function line(text,y,size,color='#316f9a',weight='700'){
      ctx.textAlign='center';ctx.fillStyle=color;ctx.font=`${weight} ${size}px "Noto Sans KR","Malgun Gothic",sans-serif`;
      ctx.fillText(text,450,y,620);
    }
    line('♡ A LITTLE GIFT FOR YOU ♡',182,25,'#78acd2','800');line('✿  ✦  ✿',240,39,'#e4bb57');
    line('선물 교환증',320,60,'#367fb2','900');line('세 가지 요리의 재료를 모두 찾았어요!',393,26,'#668ca8','500');
    box(300,440,300,125,16,'#e9f6ff','#83bde4');line('MISSION COMPLETE',488,27);line('✓',542,42,'#4caa80');
    const rows=[['닉네임',state.nickname],['찾은 재료',`${state.collected.length}개 모두 완료`],['선물',story.receipt.gift],['시연 번호',state.receiptId],['발행일',state.issuedAt]];
    let y=625;for(const [key,val]of rows){ctx.beginPath();ctx.strokeStyle='#c4dfed';ctx.moveTo(160,y+25);ctx.lineTo(740,y+25);ctx.stroke();ctx.textAlign='left';ctx.fillStyle='#84a4bc';ctx.font='500 23px "Noto Sans KR","Malgun Gothic",sans-serif';ctx.fillText(key,160,y);
      ctx.textAlign='right';ctx.fillStyle='#315e7b';ctx.font='bold 23px "Noto Sans KR","Malgun Gothic",sans-serif';ctx.fillText(String(val),740,y,410);y+=84;}
    line('✦  ✦  ✦',1040,28,'#edc267');line('시연용 · 실제 상품 교환권이 아닙니다',1090,22,'#996c3f');
    canvas.toBlob(blob=>{if(blob)saveFile(blob,'선물교환증_시연용.png');},'image/png');
  }
  function toggleSettings(open){$('settings-menu').hidden=!open;$('settings-button').setAttribute('aria-expanded',String(open));}
  $('settings-button').addEventListener('click',()=>toggleSettings($('settings-menu').hidden));
  document.addEventListener('click',e=>{if(!e.target.closest('.settings-menu')&&!e.target.closest('.menu-button'))toggleSettings(false);});
  $('chat-form').addEventListener('submit',e=>{e.preventDefault();const field=$('reply-input'),t=field.value;field.value='';respond(t);if(!field.disabled)field.focus();});
  $('ticket-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  $('ticket-download').addEventListener('click',downloadTicket);
  $('ticket-print').addEventListener('click',()=>window.print());
  $('reset-game').addEventListener('click',()=>{toggleSettings(false);if(!confirm('대화 기록과 시연용 교환증을 지우고 처음부터 다시 시작할까요?'))return;selectedMemberId=null;$('nickname-input').value='';renderMemberMenu();updateStartButton();state=newState();persist();render();});
  $('save-export').addEventListener('click',()=>{toggleSettings(false);saveFile(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),'cp-cafe-story-save.json');});
  $('save-import').addEventListener('click',()=>{toggleSettings(false);$('save-file').click();});
  $('save-file').addEventListener('change',async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;
    if(f.size>800000){alert('800KB 이하의 저장 파일만 읽을 수 있습니다.');return;}
    try {const imported=validate(JSON.parse(await f.text()));if(!imported)throw Error('invalid');if(!confirm('지금 진행 기록을 저장 파일로 바꿀까요?'))return;state=imported;persist();render();}
    catch(_){alert('저장 파일을 읽을 수 없습니다.');}
  });
  render();
})();
