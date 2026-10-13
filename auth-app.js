import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc, getDocs, collection, setDoc, increment, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const $ = id => document.getElementById(id);
const gate = $('account-gate'), quizRoot = $('quiz-root'), toolbar = $('account-toolbar');
let auth, db, authenticatedUid=null, appLoaded=false, registering=false, statsOpen=false;
let currentStats=[];
const approvedDisplayNames = ['고세현','석주형','홍대진','안선웅','박준영','김지원'];

// 이름별 가입용 가상 이메일: 기존 관리자 생성 계정의 이메일과 겹치지 않도록 새 식별자를 사용합니다.
// 본인 확인 절차가 없으므로 가입 선점 위험이 있습니다. 서버 보안 규칙은 이 이메일 6개만 허용합니다.
function normalizeName(name){return String(name||'').normalize('NFC').trim().replace(/\s/g,'');}
function nameUid(name){const hex=[...new TextEncoder().encode(normalizeName(name))].map(b=>b.toString(16).padStart(2,'0')).join('');return 'student-'+hex;}
function nameEmail(name){return `${nameUid(name)}-first@example.com`;}
function showMessage(msg,okay=false){$('auth-message').textContent=msg;$('auth-message').classList.toggle('ok',okay);}
function switchRegister(yes){$('auth-signin').hidden=yes;$('auth-register').hidden=!yes;showMessage('');}
function friendly(error){
  const code=String(error?.code||'');
  if(/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login-credentials/.test(code))return '아이디 또는 비밀번호가 올바르지 않습니다.';
  if(/too-many-requests|resource-exhausted/.test(code))return '잠시 후 다시 시도해 주세요.';
  if(/email-already-in-use/.test(code))return '이미 가입된 이름입니다. 로그인하거나 관리자에게 문의해 주세요.';
  if(/operation-not-allowed|admin-restricted-operation/.test(code))return 'Firebase에서 신규 가입이 차단되어 있습니다. 관리자에게 가입 허용 설정을 요청해 주세요.';
  if(/weak-password/.test(code))return '비밀번호 보안 조건을 확인해 주세요.';
  if(/permission-denied/.test(code))return '승인되지 않은 사용자이거나 이용이 중지된 계정입니다.';
  return '요청을 처리하지 못했습니다. Firebase 설정 또는 네트워크를 확인해 주세요.';
}
function setBusy(form,busy){for(const b of form.querySelectorAll('button,input'))b.disabled=busy;}
function setAuthenticatedUI(profile){
  gate.hidden=true;toolbar.hidden=false;
  $('account-name').textContent=`${profile.name}님`;
  if(!statsOpen&&!reviewSession)quizRoot.hidden=false;
}
function showGate(){gate.hidden=false;quizRoot.hidden=true;toolbar.hidden=true;$('analytics-panel').hidden=true;$('review-panel').hidden=true;statsOpen=false;reviewSession=null;}

async function approveUser(user){
  const name=approvedDisplayNames.find(n=>nameEmail(n)===user.email);
  if(!name)throw new Error('NOT_APPROVED');
  const snap=await getDoc(doc(db,'profiles',nameUid(name)));
  const profile=snap.exists()?snap.data():null;
  if(!profile?.approved||!profile?.active)throw new Error('NOT_APPROVED');
  if(profile.name!==name)throw new Error('INVALID_PROFILE');
  return profile;
}

let saveTimer, saveChain=Promise.resolve(), pendingProgress=new Map();
let activeSaves=0;
const pendingStats=new Set();
const failedStats=new Set();
async function retryStats(){for(const job of [...failedStats]){await job();failedStats.delete(job);}}
function syncStatus(text){$('sync-status').textContent=text;}
function flushProgress(){
  clearTimeout(saveTimer);
  const items=[...pendingProgress];pendingProgress.clear();activeSaves++;
  saveChain=saveChain.catch(()=>{}).then(async()=>{
    for(let i=0;i<items.length;i++){
      const [key,payload]=items[i];
      try{
        await setDoc(doc(db,'users',auth.currentUser.uid,'progress',encodeURIComponent(key)),{payload,updatedAt:serverTimestamp()});
      }catch(e){for(const [k,v] of items.slice(i))if(!pendingProgress.has(k))pendingProgress.set(k,v);syncStatus('저장 실패 · 다시 시도');throw e;}
    }
    if(!pendingProgress.size&&activeSaves===1)syncStatus(failedStats.size?'오답 통계 저장 실패 · 새로고침 전 확인하세요':'저장됨');
  });
  saveChain=saveChain.finally(()=>{activeSaves--;});
  return saveChain;
}
async function prepareProgress(user){
  const snapshots=await getDocs(collection(db,'users',user.uid,'progress'));
  const prefix='midterm-2-2-2026:quiz:v1:'+user.uid+':';
  const memory=new Map(snapshots.docs.map(x=>[decodeURIComponent(x.id),x.data().payload]));
  window.__QUIZ_STORAGE={
    getItem(key){return memory.get(key.slice(prefix.length))??null;},
    setItem(key,value){
      const short=key.slice(prefix.length);memory.set(short,value);pendingProgress.set(short,value);
      syncStatus('저장 중…');clearTimeout(saveTimer);saveTimer=setTimeout(()=>flushProgress().catch(()=>{}),700);
    }
  };
  syncStatus('저장됨');
}
window.addEventListener('beforeunload',e=>{
  if(activeSaves||failedStats.size||pendingProgress.size||pendingStats.size||$('sync-status')?.textContent==='저장 중…'){
    e.preventDefault();e.returnValue='';
  }
});
window.addEventListener('online',()=>{if(pendingProgress.size)flushProgress().catch(()=>{});});
$('sync-status').onclick=async()=>{try{await retryStats();await flushProgress();}catch{syncStatus('저장 실패 · 다시 시도');}};

async function startQuiz(user){
  // 공개 index.html 에는 정답/문제/quiz JS가 없습니다. 보안 규칙 통과 후에만 내려받습니다.
  if(appLoaded)return;
  const bundle=await getDoc(doc(db,'protectedContent','quiz'));
  if(!bundle.exists())throw new Error('CONTENT_NOT_UPLOADED');
  const {dataJson,quizScript}=bundle.data();
  if(typeof dataJson!=='string'||typeof quizScript!=='string')throw new Error('INVALID_CONTENT');
  await prepareProgress(user);
  window.__QUIZ_USER_ID=user.uid;
  window.__QUIZ_TRACK_ATTEMPT=event=>{
    if(!auth.currentUser||auth.currentUser.uid!==user.uid)return;
    const id=encodeURIComponent(event.key);
    if(id.length>1400)return;
    // 빈칸 하나를 한 문항으로 기록. 오답과 정답보기 횟수는 별개입니다.
    const save=()=>setDoc(doc(db,'users',user.uid,'errorStats',id),{
      label:String(event.label).slice(0,200),
      group:String(event.group).slice(0,100),
      total:increment(1),wrong:increment(!event.correct&&!event.revealed?1:0),
      revealed:increment(event.revealed?1:0),
      updatedAt:serverTimestamp()
    },{merge:true});
    const task=save();
    pendingStats.add(task);
    task.catch(()=>{failedStats.add(save);syncStatus('오답 통계 저장 실패 · 네트워크를 확인하세요');}).finally(()=>pendingStats.delete(task));
  };
  const source=document.createElement('script');source.id='quiz-data';source.type='application/json';source.textContent=dataJson;
  document.body.appendChild(source);
  // Firestore에 저장된 기존 퀴즈 스크립트에서 '빈칸은 반드시 입력' 검사만 제거합니다.
  // 빈 입력은 평가 함수에서 오답으로 처리되고, 오답 통계/재출제 기능은 그대로 작동합니다.
  const blankAnswerGuards = [
    ["if(!reveal){const missing=s.drafts.findIndex(v=>!v.trim());if(missing!==-1){$('answer-'+missing).focus();toast('빈칸에 답을 입력해 주세요.');return;}}", '빈칸에 답을 입력해 주세요.'],
    ["if(!reveal){const blank=s.drafts.findIndex(x=>!x.trim());if(blank>=0){$('daja-answer-'+blank).focus();toast('모든 빈칸에 답을 입력해 주세요.');return;}}", '모든 빈칸에 답을 입력해 주세요.']
  ];
  let patchedQuizScript = quizScript;
  for (const [guard, message] of blankAnswerGuards) {
    if (patchedQuizScript.includes(guard)) {
      patchedQuizScript = patchedQuizScript.replace(guard, '');
    } else if (patchedQuizScript.includes(message)) {
      throw new Error('빈칸 채점 수정이 퀴즈 코드와 일치하지 않습니다. 관리자에게 문의해 주세요.');
    }
  }
  // 서버에 저장된 퀴즈 스크립트가 새로고침 아이콘을 글자로 덮어쓰지 않도록 합니다.
  // 버튼 내부의 SVG는 index.html에 유지하며 모드별 의미만 접근성 이름으로 갱신합니다.
  const resetLabelOverride = "refreshButton.textContent=isBangjae?'↻ 새로고침':'진행 초기화';";
  if (patchedQuizScript.includes(resetLabelOverride)) {
    patchedQuizScript = patchedQuizScript.replace(
      resetLabelOverride,
      "refreshButton.setAttribute('aria-label',isBangjae?'새로고침':'진행 초기화');"
    );
  } else if (patchedQuizScript.includes('refreshButton.textContent')) {
    throw new Error('새로고침 버튼 코드 버전이 일치하지 않습니다.');
  }
  const script=document.createElement('script');script.textContent=patchedQuizScript;document.body.appendChild(script);
  // Bridge shares the original quiz grading logic; the question bank remains in protectedContent.
  await new Promise((resolve,reject)=>{
    const bridge=document.createElement('script');bridge.src='./review-bridge.js';
    bridge.onload=resolve;bridge.onerror=()=>reject(new Error('REVIEW_BRIDGE_LOAD_FAILED'));
    document.body.appendChild(bridge);
  });
  if(!window.__QUIZ_REVIEW_API)throw new Error('REVIEW_BRIDGE_INIT_FAILED');
  appLoaded=true;
}

async function handleAuthenticated(user){
  try{
    const profile=await approveUser(user);
    showMessage('');
    await startQuiz(user);
    if(auth.currentUser?.uid!==user.uid)return;
    authenticatedUid=user.uid;
    setAuthenticatedUI(profile);
  }catch(error){
    console.error('로그인 후 확인 오류:',error);
    showGate();
    showMessage(error.message==='CONTENT_NOT_UPLOADED'?'문제 자료가 아직 등록되지 않았습니다. 관리자에게 문의해 주세요.':
      error.message==='NOT_APPROVED'?'이 계정은 등록 대기 중이거나 사용이 승인되지 않았습니다. 관리자에게 문의해 주세요.':
      '학습 자료를 열지 못했습니다. Firebase 설정과 보안 규칙을 확인해 주세요.');
    if(error.message==='NOT_APPROVED'||error.message==='INVALID_PROFILE')await signOut(auth);
  }
}

function metric(label,value){const item=document.createElement('div');item.className='analytics-metric';const count=document.createElement('b');count.textContent=String(value);const title=document.createElement('span');title.textContent=label;item.append(count,title);return item;}
function renderStats(){updateStatControls();}
async function showAnalytics(){
  if(!authenticatedUid)return;
  statsOpen=true;quizRoot.hidden=true;$('analytics-panel').hidden=false;
  const wrap=$('analytics-list');wrap.textContent='통계를 불러오는 중입니다…';
  $('analytics-message').textContent='';
  try{
    const snapshots=await getDocs(collection(db,'users',authenticatedUid,'errorStats'));
    currentStats=snapshots.docs.map(x=>({id:x.id,...x.data()}));
    const sel=$('analytics-filter');
    const last=sel.value;sel.replaceChildren();
    for(const v of ['all',...new Set(currentStats.map(x=>x.group))]){
      const o=document.createElement('option');o.value=v;o.textContent=v==='all'?'전체 과목·유형':v;sel.append(o);
    }
    if([...sel.options].some(o=>o.value===last))sel.value=last;
    renderStats();
  }catch(error){wrap.replaceChildren();$('analytics-message').textContent='오답 통계를 불러오지 못했습니다. 네트워크와 보안 규칙을 확인해 주세요.';console.error(error);}
}

// A separate review session: never touches the normal quiz queues or progress saves.
let reviewSession = null;
function statRows() {
  const filter = $('analytics-filter').value;
  const minThree = $('analytics-min-three').checked;
  const sorting = $('analytics-sort').value;
  const filtered = currentStats.filter(row => (filter === 'all' || row.group === filter) && (!minThree || row.total >= 3));
  filtered.sort((a,b) => {
    const primary = sorting === 'count' ? (b.wrong || 0) - (a.wrong || 0)
      : (b.wrong / Math.max(1,b.total)) - (a.wrong / Math.max(1,a.total));
    return primary || b.wrong - a.wrong || b.revealed - a.revealed || b.total - a.total || a.label.localeCompare(b.label,'ko');
  });
  return filtered;
}
function reviewCandidates() {
  const api = window.__QUIZ_REVIEW_API;
  if(!api)return [];
  return statRows().filter(x => x.wrong > 0 || x.revealed > 0)
    .map(stat => ({stat, item: api.resolve(stat)})).filter(x => x.item !== null);
}
function renderStatRows() {
  const area = $('analytics-list');area.replaceChildren();
  const rows = statRows();
  const items = reviewCandidates();
  $('analytics-review-count').textContent = `복습 가능 ${items.length}문항`;
  $('start-review').disabled = !items.length;
  if (!rows.length) {
    const empty = document.createElement('div');empty.className='analytics-empty';
    empty.textContent = currentStats.length ? '조건에 맞는 기록이 없습니다. 필터를 변경해 보세요.' : '아직 채점 기록이 없습니다. 퀴즈를 먼저 풀어 주세요.';
    area.append(empty);return;
  }
  for (const row of rows) {
    const card = document.createElement('div');card.className='analytics-item';
    const heading = document.createElement('div');heading.className='analytics-item-header';
    const name = document.createElement('span');name.textContent=row.label;
    const ratio = Math.round((row.wrong || 0) / Math.max(1,row.total) * 100);
    const count = document.createElement('span');count.className='counts';count.textContent=`오답률 ${ratio}%`;
    const detail = document.createElement('small');
    detail.textContent=`${row.group} · ${row.total}회 중 오답 ${row.wrong}회 · 정답 보기 ${row.revealed}회`;
    heading.append(name,count);card.append(heading,detail);area.append(card);
  }
}
function statOverview() {
  const box = $('analytics-overview');box.replaceChildren();
  const filter = $('analytics-filter').value;
  const rows = currentStats.filter(x => filter === 'all' || x.group === filter);
  box.append(metric('누적 채점 수',rows.reduce((s,x)=>s+(x.total||0),0)),
    metric('오답 수',rows.reduce((s,x)=>s+(x.wrong||0),0)),
    metric('정답 보기',rows.reduce((s,x)=>s+(x.revealed||0),0)));
}
function updateStatControls() {statOverview();renderStatRows();}
function startReview() {
  const candidates = reviewCandidates();
  if(!candidates.length) { $('analytics-message').textContent='복습할 오답 기록이 없습니다.';return; }
  reviewSession = {items: candidates, index:0, checked:false, revealed:false, result:null, correct:0, wrong:0, seen:0};
  statsOpen=false;
  $('analytics-panel').hidden=true;quizRoot.hidden=true;$('review-panel').hidden=false;
  renderReview();
  $('review-panel').scrollIntoView({block:'start',behavior:'instant'});
}
function addReviewText(parent, str, className) {
  const s=document.createElement('span');if(className)s.className=className;s.textContent=str;parent.append(s);
}
function renderReviewPassage(item) {
  const passage = $('review-passage');passage.replaceChildren();
  passage.hidden = !['name','daja'].includes(item.type);
  if(item.type==='name'){
    for(let i=0;i<item.parts.length;i++){
      passage.append(document.createTextNode(item.parts[i]));
      if(i<item.answers.length){
        const answer = item.answers[i];
        addReviewText(passage,i===item.target?'_ '.repeat([...answer].length).trim():answer,i===item.target?'review-hole':'review-other-answer');
      }
    }
  } else if(item.type==='daja') {
    passage.append(document.createTextNode(item.original.slice(0,item.start)));
    addReviewText(passage,'_ '.repeat([...item.answer.replace(/[\s,，、.。]/g,'')].length).trim(),'review-hole');
    passage.append(document.createTextNode(item.original.slice(item.end)));
  }
}
function renderReview() {
  const s=reviewSession;
  if(!s)return;
  const finished=s.index>=s.items.length;
  $('review-question').hidden=finished;
  $('review-finish').hidden=!finished;
  if(finished){
    $('review-summary').textContent=`${s.seen}문항 복습 · 정답 ${s.correct}문항 · 오답/정답보기 ${s.wrong}문항`;
    return;
  }
  const {stat,item}=s.items[s.index];
  $('review-position').textContent=`${s.index+1} / ${s.items.length} · 시작 당시 오답률 ${Math.round(stat.wrong/Math.max(1,stat.total)*100)}% (${stat.wrong}/${stat.total})`;
  $('review-progress').style.width=(s.index/s.items.length*100)+'%';
  $('review-category').textContent=item.group;
  $('review-title').replaceChildren();
  addReviewText($('review-title'),item.title);
  if(item.hanja)addReviewText($('review-title'),` (${item.hanja})`,'review-hanja');
  $('review-note').textContent=item.type==='herbs'?'약재를 쉼표 또는 공백으로 구분해 입력하세요. 순서는 무관합니다.':item.type==='daja'?'한자 또는 독음(한글)으로 입력하세요.':'한글 또는 한자로 입력하세요.';
  renderReviewPassage(item);
  const fieldWrap=$('review-input-wrap');fieldWrap.replaceChildren();
  const field=document.createElement(item.type==='herbs'?'textarea':'input');
  field.id='review-answer';field.spellcheck=false;field.autocomplete='off';
  field.setAttribute('aria-label','복습 정답 입력');
  if(item.type!=='herbs'){field.type='text';field.placeholder='정답을 입력하세요';field.className='review-input';}
  else{field.rows=3;field.placeholder='약재 구성 입력';}
  field.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.isComposing&&!e.shiftKey){e.preventDefault();reviewGrade(false);}
  });
  fieldWrap.append(field);
  $('review-feedback').replaceChildren();$('review-feedback').hidden=true;
  $('review-check').hidden=false;$('review-reveal').hidden=false;
  $('review-next').hidden=true;
  $('review-check').disabled=false;$('review-reveal').disabled=false;
  field.disabled=false;
  field.focus({preventScroll:true});
}
function reviewGrade(reveal) {
  const s=reviewSession;if(!s||s.checked||s.index>=s.items.length)return;
  const {item}=s.items[s.index];
  const input=$('review-answer');
  const result=window.__QUIZ_REVIEW_API.grade(item,input.value);
  const correct=!reveal&&result.ok;
  s.checked=true;s.revealed=!!reveal;s.result=result;
  s.seen++;if(correct)s.correct++;else s.wrong++;
  input.disabled=true;
  $('review-check').hidden=true;$('review-reveal').hidden=true;$('review-next').hidden=false;
  $('review-next').textContent=s.index===s.items.length-1?'복습 결과 보기 →':'다음 문제 →';
  const fb=$('review-feedback');fb.hidden=false;
  const h=document.createElement('h4');h.className=correct?'correct':'wrong';
  h.textContent=correct?'정답입니다.':reveal?'정답을 확인했습니다.':'오답입니다.';fb.append(h);
  const ans=document.createElement('p');ans.textContent=`정답: ${item.accepted||item.answer}`;fb.append(ans);
  if(item.reading?.length){const reading=document.createElement('p');reading.className='review-reading';reading.textContent='독음: '+item.reading.join(' / ');fb.append(reading);}
  if(result.missing?.length){const missing=document.createElement('p');missing.textContent='빠뜨린 약재: '+result.missing.join(' · ');fb.append(missing);}
  if(result.extra?.length){const extra=document.createElement('p');extra.textContent='추가 입력: '+result.extra.join(' · ');fb.append(extra);}
  // Do not alter the original quiz's per-mode session. Only append to Firestore stat.
  window.__QUIZ_TRACK_ATTEMPT({key:item.key,label:item.label,group:item.group,correct,revealed:!!reveal});
  $('review-next').focus();
}
function reviewNext() {
  if(!reviewSession?.checked)return;
  reviewSession.index++;reviewSession.checked=false;reviewSession.revealed=false;
  renderReview();
}
async function exitReview() {
  reviewSession=null;$('review-panel').hidden=true;
  // The client-side stat writes are in-flight; wait for them before refreshing the list.
  if(pendingStats.size)await Promise.allSettled([...pendingStats]);
  await showAnalytics();
}
$('start-review').onclick=startReview;
$('analytics-sort').onchange=updateStatControls;
$('analytics-min-three').onchange=updateStatControls;
$('analytics-filter').onchange=updateStatControls;
$('review-check').onclick=()=>reviewGrade(false);
$('review-reveal').onclick=()=>reviewGrade(true);
$('review-next').onclick=reviewNext;
$('review-exit').onclick=exitReview;
$('review-back').onclick=exitReview;
$('review-again').onclick=async()=>{await exitReview();startReview();};

$('open-register').onclick=()=>switchRegister(true);
$('open-login').onclick=()=>switchRegister(false);
$('close-analytics').onclick=()=>{statsOpen=false;$('analytics-panel').hidden=true;quizRoot.hidden=false;};
$('open-analytics').onclick=showAnalytics;
$('account-signout').onclick=async()=>{try{await flushProgress();await Promise.all([...pendingStats]);await retryStats();await signOut(auth);location.reload();}catch{syncStatus('저장 실패 · 연결 후 다시 로그아웃해 주세요');}};

if(firebaseConfig.apiKey.startsWith('YOUR_')||firebaseConfig.projectId==='YOUR_PROJECT_ID'){
  showMessage('Firebase 설정 전입니다. firebase-config.js에 프로젝트 설정값을 먼저 입력해 주세요.');
  for(const form of [$('login-form'),$('register-form')])form.querySelector('button[type=submit]').disabled=true;
}else{
  try{
    const app=initializeApp(firebaseConfig);
    auth=getAuth(app);db=getFirestore(app);
    await setPersistence(auth,browserSessionPersistence);
    $('login-form').onsubmit=async e=>{
      e.preventDefault();showMessage('');const form=e.currentTarget;
      const name=normalizeName($('login-name').value);const password=$('login-pass').value;
      if(!approvedDisplayNames.includes(name)){showMessage('승인된 아이디가 아닙니다.');return;}
      setBusy(form,true);
      try{await signInWithEmailAndPassword(auth,nameEmail(name),password);}
      catch(err){showMessage(friendly(err));}
      finally{setBusy(form,false);}
    };
    $('register-form').onsubmit=async e=>{
      e.preventDefault();showMessage('');const form=e.currentTarget;
      const name=normalizeName($('register-name').value);
      const password=$('register-pass').value,confirm=$('register-confirm').value;
      if(!approvedDisplayNames.includes(name)){showMessage('승인된 아이디가 아닙니다.');return;}
      if(password.length<6){showMessage('Firebase 기본 조건에 따라 비밀번호는 6자 이상이어야 합니다.');return;}
      if(password!==confirm){showMessage('비밀번호 확인란이 일치하지 않습니다.');return;}
      setBusy(form,true);registering=true;let created=false;
      try{
        // Firebase Auth는 동일한 이메일의 중복 회원가입을 막습니다.
        // 기존 사전 생성 계정에는 손대지 않고 -first 이메일로 최초 가입합니다.
        const credential=await createUserWithEmailAndPassword(auth,nameEmail(name),password);
        created=true;
        $('register-pass').value='';$('register-confirm').value='';
        registering=false;
        await handleAuthenticated(credential.user);
      }catch(err){
        console.error('회원가입 처리 실패:',err);
        registering=false;
        if(created){
          switchRegister(false);$('login-name').value=name;
          showMessage('계정은 생성되었지만 학습 자료를 불러오지 못했습니다. 로그인 후 관리자에게 문의해 주세요.',true);
        }else showMessage(friendly(err));
      }finally{setBusy(form,false);}
    };
    onAuthStateChanged(auth,async user=>{
      if(registering)return;
      if(!user){if(appLoaded){location.reload();return;}authenticatedUid=null;showGate();return;}
      if(appLoaded&&authenticatedUid&&authenticatedUid!==user.uid){location.reload();return;}
      await handleAuthenticated(user);
    });
  }catch(error){console.error(error);showMessage('Firebase 초기화에 실패했습니다. firebase-config.js 설정을 확인해 주세요.');}
}
