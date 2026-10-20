/* 방제학 한자 쓰기 모드 — 인증 후 제공되는 기존 처방 데이터만 참조합니다. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const setHidden = (node, hidden) => { if (node && node.hidden !== hidden) node.hidden = hidden; };
  const characters = {
    // 실습시험처방 Clean 2(2).pdf 26~60번 원문 기준 누락 약재 보완
    '갱미':'粳米',
    '귤피':'橘皮',
    '귤홍':'橘紅',
    '나복자':'萊菔子',
    '남성':'南星',
    '방기':'防己',
    '백개자':'白芥子',
    '봉출':'蓬朮',
    '산사육':'山査肉',
    '위령선':'威靈仙',
    '인진':'茵蔯',
    '지골피':'地骨皮',
    '진교':'秦艽',
    '총백':'葱白',
    '축사':'縮砂',
    '감초':'甘草','자감초':'炙甘草','구감초':'灸甘草','생감초':'生甘草','초감초':'炙甘草',
    '생강':'生薑','건강':'乾薑','포강':'炮薑','대조':'大棗','인삼':'人蔘','당삼':'黨蔘',
    '황기':'黃芪','백출':'白朮','창출':'蒼朮','복령':'茯苓','백복령':'白茯苓','적복령':'赤茯苓','복신':'茯神',
    '백작약':'白芍藥','적작약':'赤芍藥','작약':'芍藥','당귀':'當歸','천궁':'川芎',
    '숙지황':'熟地黃','생지황':'生地黃','건지황':'乾地黃','지황':'地黃','하수오':'何首烏',
    '산수유':'山茱萸','산약':'山藥','택사':'澤瀉','목단피':'牡丹皮','목단':'牡丹','목피':'牡皮',
    '황금':'黃芩','황련':'黃連','황백':'黃柏','치자':'梔子','산치자':'山梔子','지모':'知母','석고':'石膏',
    '마황':'麻黃','계지':'桂枝','육계':'肉桂','계피':'桂皮','마계':'麻桂','세신':'細辛',
    '방풍':'防風','형개':'荊芥','강활':'羌活','독활':'獨活','백지':'白芷','고본':'藁本',
    '신이':'辛夷','창이자':'蒼耳子','박하':'薄荷','우방자':'牛蒡子','갈근':'葛根',
    '시호':'柴胡','승마':'升麻','상엽':'桑葉','국화':'菊花','만형자':'蔓荊子',
    '반하':'半夏','법반하':'法半夏','제반하':'製半夏','강반하':'薑半夏','청반하':'淸半夏',
    '진피':'陳皮','청피':'靑皮','지실':'枳實','지각':'枳殼','후박':'厚朴','목향':'木香',
    '향부자':'香附子','향부':'香附','오약':'烏藥','천련자':'川楝子','현호색':'玄胡索','연호색':'延胡索',
    '사인':'砂仁','백두구':'白豆蔲','초두구':'草豆蔲','초과':'草果','익지인':'益智仁',
    '곽향':'藿香','광곽향':'廣藿香','패란':'佩蘭','후향':'厚香','자소엽':'紫蘇葉','소엽':'蘇葉',
    '소자':'蘇子','자소자':'紫蘇子','행인':'杏仁','길경':'桔梗','전호':'前胡','패모':'貝母',
    '절패모':'浙貝母','천패모':'川貝母','과루인':'瓜蔞仁','과루':'瓜蔞','과루실':'瓜蔞實','과루피':'瓜蔞皮',
    '맥문동':'麥門冬','천문동':'天門冬','오미자':'五味子','오매':'烏梅','백합':'百合',
    '사삼':'沙蔘','북사삼':'北沙蔘','남사삼':'南沙蔘','옥죽':'玉竹','석곡':'石斛',
    '황정':'黃精','구기자':'枸杞子','여정자':'女貞子','한련초':'旱蓮草',
    '용안육':'龍眼肉','산조인':'酸棗仁','백자인':'柏子仁','원지':'遠志','석창포':'石菖蒲',
    '창포':'菖蒲','합환피':'合歡皮','야교등':'夜交藤','복분자':'覆盆子',
    '연자육':'蓮子肉','연자':'蓮子','검실':'芡實','오수유':'吳茱萸','소회향':'小茴香','회향':'茴香',
    '부자':'附子','포부자':'炮附子','제부자':'製附子','흑순편':'黑順片','오두':'烏頭',
    '황정':'黃精','녹용':'鹿茸','음양곽':'淫羊藿','토사자':'菟絲子','보골지':'補骨脂',
    '두충':'杜沖','속단':'續斷','우슬':'牛膝','회우슬':'懷牛膝','천우슬':'川牛膝',
    '육종용':'肉蓯蓉','파극천':'巴戟天','구척':'狗脊','상기생':'桑寄生',
    '차전자':'車前子','차전초':'車前草','목통':'木通','통초':'通草','저령':'猪苓',
    '활석':'滑石','의이인':'薏苡仁','적소두':'赤小豆','동과피':'冬瓜皮',
    '정력자':'葶藶子','상백피':'桑白皮','정력':'葶藶','상지':'桑枝',
    '대황':'大黃','망초':'芒硝','후박':'厚朴','노회':'蘆薈','화마인':'火麻仁','마자인':'麻子仁',
    '견우자':'牽牛子','빈랑':'檳榔','대복피':'大腹皮','사군자':'使君子',
    '단삼':'丹蔘','도인':'桃仁','홍화':'紅花','익모초':'益母草','계혈등':'鷄血藤',
    '유향':'乳香','몰약':'沒藥','오령지':'五靈脂','포황':'蒲黃','삼칠':'三七','울금':'鬱金',
    '강황':'薑黃','아출':'莪朮','삼릉':'三稜','적석지':'赤石脂',
    '천마':'天麻','조구등':'釣鉤藤','구등':'鉤藤','백강잠':'白殭蠶','전갈':'全蝎',
    '지룡':'地龍','모려':'牡蠣','용골':'龍骨','진주모':'珍珠母',
    '하고초':'夏枯草','결명자':'決明子','밀몽화':'密蒙花','청상자':'靑葙子',
    '대계':'大薊','소계':'小薊','지유':'地楡','측백엽':'側柏葉','괴화':'槐花','백모근':'白茅根',
    '아교':'阿膠','애엽':'艾葉','포강탄':'炮薑炭','백급':'白及','선학초':'仙鶴草',
    '두시':'豆豉','담두시':'淡豆豉','향시':'香豉','죽여':'竹茹','죽엽':'竹葉','담죽엽':'淡竹葉',
    '죽력':'竹瀝','등심초':'燈心草','연교':'連翹','금은화':'金銀花','포공영':'蒲公英',
    '자화지정':'紫花地丁','패장초':'敗醬草','어성초':'魚腥草','토복령':'土茯苓',
    '판람근':'板藍根','대청엽':'大靑葉','현삼':'玄蔘','적설초':'積雪草',
    '택란':'澤蘭','구맥':'瞿麥','편축':'萹蓄','구자':'韭子','홍삼':'紅蔘',
    '백편두':'白扁豆','편두':'扁豆','내복자':'萊菔子','맥아':'麥芽','신곡':'神麴','산사':'山楂',
    '계내금':'鷄內金','사향':'麝香','우황':'牛黃','빙편':'冰片','주사':'朱砂',
    '자완':'紫菀','관동화':'款冬花','백부':'百部','백과':'白果','은행':'銀杏',
    '비파엽':'枇杷葉','선복화':'旋覆花','대자석':'代赭石','해표초':'海螵蛸',
    '감수':'甘遂','대극':'大戟','원화':'芫花','양강':'良薑','고량강':'高良薑',
    '초오':'草烏','초오두':'草烏頭','백선피':'白鮮皮','고삼':'苦蔘','사상자':'蛇床子',
    '천화분':'天花粉','생맥아':'生麥芽','초맥아':'炒麥芽','신곡':'神麴','황기밀자':'蜜炙黃芪'
  };
  let handwrite = false, loadedUid = '', revealed = false, currentKey = '', syncing = false;
  const storageKey = () => 'midterm-2-2:bangjae-handwrite:' + (window.__QUIZ_USER_ID || 'session');
  const bangjaeActive = () => {
    try { return document.body.dataset.subject === 'bangjae' &&
      typeof active !== 'undefined' && (active === 'bangjae-herbs' || active === 'bangjae-herbs-ordered'); }
    catch { return false; }
  };
  const getQuestion = () => {
    try { return bangjaeActive() && typeof question === 'function' ? question() : null; }
    catch { return null; }
  };
  const naturalHanja = text => /[\u3400-\u9fff\uf900-\ufaff]/.test(text);
  function findHanja(label, q, index) {
    const raw = String(label || '').normalize('NFC').trim();
    // 신곡과 나복자는 원문 이체자 대신 공정서 한자 표기로 통일합니다.
    if (raw === '빈랑' && Number(q.num) === 40) return '檳瑯';
    const candidates = [q.herbsHanja,q.herbHanja,q.hanjaHerbs,q.ingredientsHanja];
    for (const data of candidates) {
      if (Array.isArray(data) && typeof data[index] === 'string' && naturalHanja(data[index])) return data[index];
      if (data && typeof data === 'object' && typeof data[raw] === 'string' && naturalHanja(data[raw])) return data[raw];
    }
    const inline = raw.match(/[（(]([\u3400-\u9fff\uf900-\ufaff]+)[）)]/);
    if (inline) return inline[1];
    if (naturalHanja(raw)) return raw;
    const tight = raw.replace(/\s+/g,'');
    if (characters[tight]) return characters[tight];
    const withoutNote = tight.replace(/[（(][^()（）]*[)）]/g,'');
    if (characters[withoutNote]) return characters[withoutNote];
    // 약재명 앞뒤의 포제어는 사전에 근거 있는 조합만 허용합니다.
    const addOn = { '밀자':'蜜炙','자':'炙','초':'炒','주':'酒','생':'生','제':'製' };
    for (const [tag, hanzi] of Object.entries(addOn)) {
      if (withoutNote.startsWith(tag) && characters[withoutNote.slice(tag.length)])
        return hanzi + characters[withoutNote.slice(tag.length)];
    }
    return null;
  }
  function clearAnswer() {
    revealed = false;
    const target = $('bangjae-write-key');
    if (target) target.replaceChildren();
  }
  function loadPreference() {
    const uid = window.__QUIZ_USER_ID || '';
    if (!uid || uid === loadedUid) return;
    loadedUid = uid;
    try { handwrite = localStorage.getItem(storageKey()) === 'paper'; }
    catch { handwrite = false; }
    clearAnswer();
  }
  function setMode(value) {
    if (!bangjaeActive() || handwrite === value) return;
    if (value) {
      try { if (typeof loadSession === 'function' && loadSession(active).done) $('next')?.click(); } catch {}
    }
    handwrite = value;
    try { localStorage.setItem(storageKey(),value ? 'paper' : 'type'); } catch {}
    clearAnswer();
    sync();
  }
  function buildKey(q) {
    const box = $('bangjae-write-key');
    if (!box) return;
    box.replaceChildren();
    const h = document.createElement('h4');
    h.textContent = '처방 구성 정답 · 한자와 독음';
    box.append(h);
    let unmatched = 0;
    (Array.isArray(q.herbs) ? q.herbs : []).forEach((raw,index) => {
      const label = String(raw);
      const hanja = findHanja(label,q,index);
      if (!hanja) unmatched++;
      const item = document.createElement('div');
      item.className = 'daja-paper-item';
      const num = document.createElement('span');
      num.className = 'number'; num.textContent = String(index+1);
      const hz = document.createElement('span');
      hz.className = 'hanzi'; hz.lang = 'zh-Hant';
      hz.textContent = hanja || '한자 미확인';
      const reading = document.createElement('span');
      reading.className = 'reading'; reading.textContent = label;
      item.append(num,hz,reading); box.append(item);
    });
    if (unmatched) {
      const note = document.createElement('p');
      note.className = 'bangjae-unmapped';
      note.textContent = '일부 약재의 한자 표기를 확인할 수 없어 해당 항목은 독음만 표시했습니다. 미확인 한자를 임의로 만들어 표시하지 않습니다.';
      box.append(note);
    }
  }
  function sync() {
    if (syncing) return;
    syncing = true;
    try {
      loadPreference();
      const enabled = bangjaeActive();
      const modes = $('bangjae-write-modes');
      setHidden(modes,!enabled);
      if (!enabled) {
        setHidden($('bangjae-write-panel'),true);
        setHidden($('answers'),false);
        setHidden($('input-help'),false);
        setHidden($('check')?.parentElement,false);
        return;
      }
      const paper = handwrite;
      $('bangjae-write-type')?.setAttribute('aria-pressed',String(!paper));
      $('bangjae-write-paper')?.setAttribute('aria-pressed',String(paper));
      const q = getQuestion();
      const key = q ? String(active) + ':' + String(q.id) : '';
      if (key !== currentKey) { currentKey = key; clearAnswer(); }
      // 목록·완료 화면에는 원래 퀴즈 패널을 그대로 숨깁니다.
      const showPaper = paper && !!q && !$('quiz').hidden && $('full-list').hidden;
      setHidden($('bangjae-write-panel'),!showPaper);
      setHidden($('answers'),showPaper);
      setHidden($('input-help'),showPaper);
      setHidden($('check')?.parentElement,showPaper);
      if (!showPaper) return;
      setHidden($('bangjae-write-key'),!revealed);
      setHidden($('bangjae-write-reveal'),revealed);
      setHidden($('bangjae-write-correct'),!revealed);
      setHidden($('bangjae-write-wrong'),!revealed);
      if (revealed && !$('bangjae-write-key').children.length) buildKey(q);
    } finally { syncing = false; }
  }
  function reveal() {
    const q = getQuestion();
    if (!handwrite || !q || revealed) return;
    revealed = true;
    buildKey(q);
    sync();
    $('bangjae-write-key')?.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  function gradeSelf(isCorrect) {
    const q = getQuestion();
    if (!handwrite || !revealed || !q) return;
    const value = isCorrect ? q.herbs.join(', ') : '__자가채점_오답__';
    const input = $('answer-0') || $('answers')?.querySelector('textarea,input');
    const check = $('check');
    if (!input || !check) {
      alert('기존 방제학 채점 입력창을 찾지 못했습니다. 타자로 풀기에서 다시 시도해 주세요.');
      return;
    }
    // 정답 처리는 기존 공식 채점기로 검증한 후 진행하며, Firebase 기록도 동일 경로로 저장합니다.
    try {
      if (typeof gradeHerbs !== 'function' || gradeHerbs([value],q).ok !== isCorrect) {
        alert('자가채점 입력값을 검증하지 못했습니다. 채점 기록을 변경하지 않았습니다.');
        return;
      }
    } catch { alert('채점 검증 중 오류가 발생했습니다.'); return; }
    const originalId = q.id;
    input.value = value;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    check.click();
    // 실제 채점 완료를 확인하기 전에는 다음 문제로 이동하지 않습니다.
    try {
      if (typeof loadSession === 'function' && !loadSession(active).done) {
        alert('기존 채점이 완료되지 않았습니다. 타자로 풀기에서 현재 문제를 확인해 주세요.');
        return;
      }
    } catch {}
    // 실제 채점 버튼을 사용해 정답/오답과 다음 문제의 저장 규칙을 그대로 따릅니다.
    requestAnimationFrame(() => {
      if (getQuestion()?.id === originalId) $('next')?.click();
      clearAnswer();
      sync();
      requestAnimationFrame(() => {
        if (!$('quiz')?.hidden) $('question-title')?.scrollIntoView({block:'start',behavior:'smooth'});
      });
    });
  }
  const schedule = () => requestAnimationFrame(sync);
  $('bangjae-write-type')?.addEventListener('click',()=>setMode(false));
  $('bangjae-write-paper')?.addEventListener('click',()=>setMode(true));
  $('bangjae-write-reveal')?.addEventListener('click',reveal);
  $('bangjae-write-correct')?.addEventListener('click',()=>gradeSelf(true));
  $('bangjae-write-wrong')?.addEventListener('click',()=>gradeSelf(false));
  document.addEventListener('click',event=>{
    if(event.target.closest('.subject-tabs,.subtabs,#bangjae-order-modes,#view-switch,#shuffle,#reset,#next,#prev,#again,#bangjae-number-track,#bangjae-ordered-restart'))schedule();
  },true);
  if ($('question-title')) new MutationObserver(schedule).observe($('question-title'),{childList:true,subtree:true,characterData:true});
  if ($('quiz')) new MutationObserver(schedule).observe($('quiz'),{attributes:true,attributeFilter:['hidden']});
  if ($('full-list')) new MutationObserver(schedule).observe($('full-list'),{attributes:true,attributeFilter:['hidden']});
  if ($('quiz-root')) new MutationObserver(schedule).observe($('quiz-root'),{attributes:true,attributeFilter:['hidden']});
  sync();
})();