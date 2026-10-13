(function initNeuroMemoView(){
 const data=window.NEURO_MEMO_TABLES||[];
 const bank=JSON.parse(document.getElementById('dataBank').textContent);
 const byId=new Map(bank.map(q=>[q.id,q]));
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const norm=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');
 // 암기표 분류는 상위 사이트의 신경정신과 하위 탭에서 제어합니다.
 const view=document.createElement('div');view.id='memoView';view.className='hide';
 view.innerHTML='<div class="main-head"><div><h1>신경정신과 암기표</h1><p>한의신경정신과학 정리본 · 20·21·22학번 족보 대조</p></div></div><div class="panel memo-toolbar"><div class="memo-heading"><strong>주제별 암기표</strong><span id="memoCount"></span></div><div class="memo-practice-switch" role="group" aria-label="암기표 공부 방식"><button type="button" id="memoStudy" class="selected" aria-pressed="true">표 보기</button><button type="button" id="memoPractice" aria-pressed="false">빈칸 연습</button><button type="button" id="memoRestart" hidden>다시 풀기</button><span id="memoPracticeStats"></span></div><div class="memo-search"><input id="memoSearch" type="search" placeholder="학자·원문·개념 검색" aria-label="암기표 검색"><select id="memoYear" aria-label="기출 학번"><option value="all">전체 학번</option><option value="20">20학번</option><option value="21">21학번</option><option value="22">22학번</option></select><button type="button" class="btn" id="memoOnly" aria-pressed="false" title="기출문제와 연결된 20개 표만 보기 (추가 암기표 5개 숨김)">기출 연계표만</button></div><div id="memoCategories" class="memo-categories" role="group" aria-label="분야 선택"><button type="button" data-memo-cat="전체" class="selected">전체</button><button type="button" data-memo-cat="한의학">한의학</button><button type="button" data-memo-cat="심리학">심리학</button><button type="button" data-memo-cat="발달">발달</button><button type="button" data-memo-cat="신경생리">신경생리</button></div><p class="memo-help"><strong class="memo-mark">족보</strong>는 해당 행에 연결되는 실제 기출문제입니다. 학번·문항 버튼을 누르면 퀴즈로 이동합니다. <strong>복기 불완전</strong> 문항은 답을 확정하지 않았습니다.</p></div><div id="memoCards" class="memo-cards"></div>';
 document.querySelector('main.main').append(view);
 let category='전체',examOnly=false,practice=false;
 const attempts=new Map(), drafts=new Map();
 const normAnswer=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/[\s·.,;:!?'“”()\[\]{}\-_→+]/g,'');
 function getExpected(key){
  const [kind,n,r]=key.split('_');const item=data[Number(n)];if(!item)return null;
  if(kind==='orig'){
   const q=item.originalDrills?.[Number(r)];
   return q?{answer:q.answer,aliases:q.aliases||[]}:null;
  }
  if(kind==='row'){
   const row=item.rows[Number(r)], col=item.blankCol??0;
   if(!row||row.c[col]===undefined)return null;
   return {answer:row.c[col],aliases:row.aliases||[]};
  }
  return null;
 }
 function feedbackMarkup(key){
   const result=attempts.get(key);
   if(!result)return '';
   return result.correct?'<span class="memo-ok">정답</span>':'<span class="memo-wrong">오답 · 정답: '+escape(getExpected(key)?.answer||'')+'</span>';
 }
 function blankInput(key){
   return '<span class="memo-fill"><input type="text" class="memo-blank" data-memo-key="'+escape(key)+'" autocomplete="off" spellcheck="false" placeholder="답 입력 후 Enter" value="'+escape(drafts.get(key)||'')+'" aria-label="빈칸 답 입력"><button type="button" class="memo-grade" data-memo-check="'+escape(key)+'">채점</button><span class="memo-feedback" data-memo-feedback="'+escape(key)+'" aria-live="polite">'+feedbackMarkup(key)+'</span></span>';
 }
 function updatePracticeStats(){
   const status=document.getElementById('memoPracticeStats');
   if(!practice){status.textContent='';return;}
   const count=document.querySelectorAll('#memoCards .memo-blank').length;
   let scored=0,correct=0;
   document.querySelectorAll('#memoCards .memo-blank').forEach(el=>{const r=attempts.get(el.dataset.memoKey);if(r){scored++;if(r.correct)correct++;}});
   status.textContent='채점 '+scored+' / '+count+' · 정답 '+correct;
 }
 function gradeInput(key){
   const input=Array.from(document.querySelectorAll('#memoCards .memo-blank')).find(el=>el.dataset.memoKey===key);
   const expected=getExpected(key);
   if(!input||!expected)return;
   drafts.set(key,input.value);
   const possible=[expected.answer,...expected.aliases];
   const value=normAnswer(input.value);
   const correct=value.length>0&&possible.some(x=>normAnswer(x)===value);
   attempts.set(key,{correct});
   const feedback=document.querySelector('[data-memo-feedback="'+key+'"]');
   if(feedback)feedback.innerHTML=feedbackMarkup(key);
   input.classList.toggle('memo-correct',correct);
   input.classList.toggle('memo-incorrect',!correct);
   updatePracticeStats();
 }
 function renderOriginal(item,index){
   if(!item.original)return '';
   const heading='<div class="memo-original-head"><b>'+escape(item.originalLabel||'원문 암기')+'</b><span>원문 빈칸 기출</span></div>';
   if(!practice) return '<div class="memo-original">'+heading+'<p class="memo-original-quote">'+escape(item.original)+'</p><p class="memo-original-help">20학번: 心風 · 21학번: 痰 부분이 빈칸으로 출제되었습니다.</p></div>';
   return '<div class="memo-original">'+heading+(item.originalDrills||[]).map((drill,i)=>'<div class="memo-original-drill"><small>'+escape(drill.label)+'</small><p>'+escape(drill.display)+'</p>'+blankInput('orig_'+index+'_'+i)+'</div>').join('')+'</div>';
 }

 const refsOf=item=>{
  const ids=[...(item.refs||[]),...item.rows.flatMap(r=>r.q||[])];
  const seen=new Set();return ids.map(id=>byId.get(id)).filter(q=>q&&!seen.has(q.id)&&seen.add(q.id));
 };
 const refMarkup=q=>'<button class="memo-ref" data-memo-q="'+escape(q.id)+'" type="button" title="기출문제 풀기">'+escape(q.label)+(q.uncertain?' · 복기 불완전':'')+'</button>';
 function render(){
  const term=norm(document.getElementById('memoSearch').value);
  const year=document.getElementById('memoYear').value;
  const filtered=data.filter(item=>{
   const refs=refsOf(item);
   if(category!=='전체'&&item.cat!==category)return false;
   if(examOnly&&!refs.length)return false;
   if(year!=='all'&&!refs.some(q=>q.year===year))return false;
   if(term&&!norm(item.title+' '+item.cat+' '+(item.note||'')+' '+(item.original||'')+' '+item.rows.map(r=>r.c.join(' ')).join(' ')).includes(term))return false;
   return true;
  });
  const related=data.filter(item=>refsOf(item).length).length;
  document.getElementById('memoCount').textContent=filtered.length+'개 표 표시'+(examOnly?' · 기출 연계표 '+related+'개만':' · 전체 '+data.length+'개 중 기출 연계 '+related+'개');
  document.getElementById('memoStudy').classList.toggle('selected',!practice);
  document.getElementById('memoPractice').classList.toggle('selected',practice);
  document.getElementById('memoStudy').setAttribute('aria-pressed',String(!practice));
  document.getElementById('memoPractice').setAttribute('aria-pressed',String(practice));
  document.getElementById('memoRestart').hidden=!practice;
  document.getElementById('memoOnly').setAttribute('aria-pressed',String(examOnly));
  document.getElementById('memoOnly').classList.toggle('selected',examOnly);
  const target=document.getElementById('memoCards');
  if(!filtered.length){target.innerHTML='<div class="emptycard"><b>해당 암기표가 없습니다.</b><p>검색·분류 조건을 조정해 주세요.</p></div>';return;}
  target.innerHTML=filtered.map(item=>{
    const index=data.indexOf(item);
    const refs=refsOf(item);
    const rows=item.rows.map((row,rowIndex)=>{
      const direct=(row.q||[]).map(id=>byId.get(id)).filter(Boolean);
      const rowClass=direct.length?' class="memo-highlight"':'';
      const cells=row.c.map((val,i)=>{
        const hasBlank=practice&&i===(item.blankCol??0)&&String(val).trim()!=='—';
        // 원문 두 빈칸의 정답이 연습모드 표 셀에 노출되지 않도록 합니다.
        const protectedOriginal=practice&&!!item.original&&rowIndex===0&&i===2;
        const inner=hasBlank?blankInput('row_'+index+'_'+rowIndex):protectedOriginal?'원문 빈칸은 아래에서 연습':(i===0?'<b>'+escape(val)+'</b>':escape(val));
        return '<td>'+inner+(i===0&&direct.length?'<span class="memo-mark">족보</span>':'')+'</td>';
      }).join('');
      const rowDetail=direct.length?'<tr class="memo-refs-row"><td colspan="'+item.heads.length+'">'+direct.map(refMarkup).join('')+'</td></tr>':'';
      return '<tr'+rowClass+'>'+cells+'</tr>'+rowDetail;
    }).join('');
    const associated=(item.refs||[]).map(id=>byId.get(id)).filter(Boolean).map(refMarkup).join('');
    return '<section class="panel memo-card"><header class="memo-card-head"><h2><span class="memo-index">'+String(data.indexOf(item)+1).padStart(2,'0')+'</span> '+escape(item.title)+'</h2><div class="memo-labels"><span>'+escape(item.cat)+'</span><span class="'+(refs.length?'exam':'extra')+'">'+(refs.length?'족보 '+refs.length+'문항':'추가 암기')+'</span></div></header><div class="memo-scroll"><table class="memo-table"><thead><tr>'+item.heads.map(h=>'<th>'+escape(h)+'</th>').join('')+'</tr></thead><tbody>'+rows +'</tbody></table></div>'+renderOriginal(item,index)+(!practice&&item.note?'<p class="memo-note">'+escape(item.note)+'</p>':'')+(associated?'<p class="memo-assoc"><b>표 전체 관련 기출</b> '+associated+'</p>':'')+'</section>';
  }).join('');
  updatePracticeStats();
 }
 document.getElementById('memoSearch').addEventListener('input',render);
 document.getElementById('memoYear').addEventListener('change',render);
 document.getElementById('memoOnly').addEventListener('click',()=>{examOnly=!examOnly;render();});
 document.getElementById('memoStudy').addEventListener('click',()=>{practice=false;render();});
 document.getElementById('memoPractice').addEventListener('click',()=>{practice=true;render();});
 document.getElementById('memoRestart').addEventListener('click',()=>{attempts.clear();drafts.clear();render();document.querySelector('#memoCards .memo-blank')?.focus();});
 document.getElementById('memoCategories').addEventListener('click',e=>{
  const button=e.target.closest('[data-memo-cat]');if(!button)return;
  category=button.dataset.memoCat;
  document.querySelectorAll('[data-memo-cat]').forEach(b=>b.classList.toggle('selected',b===button));
  render();
 });
 document.getElementById('memoCards').addEventListener('click',e=>{
  const check=e.target.closest('[data-memo-check]');if(check){gradeInput(check.dataset.memoCheck);return;}
  const button=e.target.closest('[data-memo-q]');
  if(button)window.openNeuroMemoQuestion?.(button.dataset.memoQ);
 });
 document.getElementById('memoCards').addEventListener('input',e=>{
   if(e.target.matches('.memo-blank'))drafts.set(e.target.dataset.memoKey,e.target.value);
 });
 document.getElementById('memoCards').addEventListener('keydown',e=>{
   if(e.key==='Enter'&&!e.isComposing&&e.target.matches('.memo-blank')){
      e.preventDefault();gradeInput(e.target.dataset.memoKey);
   }
 });
 const style=document.createElement('style');
 style.textContent=`
.memo-toolbar{padding:15px 18px;margin-bottom:15px}
.memo-heading{display:flex;justify-content:space-between;align-items:center;gap:9px;margin-bottom:12px}
.memo-heading strong{font-size:17px;color:#153858}.memo-heading span{font-size:12px;color:#708397}
.memo-search{display:grid;grid-template-columns:minmax(0,1fr) 138px 112px;gap:8px}
.memo-search input,.memo-search select{width:100%;min-width:0;border:1px solid #d2dfeb;border-radius:9px;padding:10px 11px;min-height:42px;color:#25394d;background:white}
.memo-search .btn{min-height:42px;padding:8px 9px}
.memo-search .btn.selected{background:#e7f3ec;border-color:#a1cbb2;color:#246749}
.memo-categories{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.memo-categories button{border:1px solid #dbe7ef;border-radius:8px;padding:7px 13px;background:#fff;color:#5f7489;font-size:12px;font-weight:750}
.memo-categories button.selected{background:#2365a3;border-color:#2365a3;color:#fff}
.memo-help{font-size:11px;color:#617c92;margin:12px 0 0;line-height:1.9}
.memo-mark{display:inline-block;vertical-align:middle;font-size:10px;font-weight:850;background:#e5f4eb;color:#286b4d;border:1px solid #cde8d8;border-radius:5px;padding:1px 6px;margin-left:6px;white-space:nowrap}
.memo-cards{display:grid;gap:13px}
.memo-card{overflow:hidden;box-shadow:none}
.memo-card-head{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:9px;padding:13px 16px;border-bottom:1px solid #e3ebf2}
.memo-card-head h2{margin:0;font-size:16px;color:#22486a;letter-spacing:-.25px}
.memo-index{font-size:12px;color:#899daf;margin-right:5px}
.memo-labels{display:flex;gap:6px;align-items:center}.memo-labels span{border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;background:#edf2f7;color:#687e92}
.memo-labels span.exam{background:#e7f5ec;color:#26754c}.memo-labels span.extra{background:#f4f3ee;color:#8a8273}
.memo-scroll{overflow-x:auto;width:100%}.memo-table{width:100%;min-width:490px;border-collapse:collapse;line-height:1.7;font-size:13px}
.memo-table th{text-align:left;padding:9px 12px;background:#f3f7fa;color:#526c84;font-size:11px;border-bottom:1px solid #dce6ee}
.memo-table td{padding:9px 12px;border-bottom:1px solid #edf1f4;vertical-align:top;overflow-wrap:anywhere}.memo-table tr:last-child td{border-bottom:0}
.memo-table b{color:#2e506c}
.memo-table .memo-highlight{background:#fcfffd}
.memo-refs-row td{padding:3px 12px 9px;background:#fcfffd}
.memo-ref{display:inline-block;margin:2px 5px 2px 0;border:1px solid #cce4d7;background:#f2fbf5;color:#216c4b;padding:4px 8px;font-size:11px;font-weight:700;border-radius:6px;min-height:29px;vertical-align:middle}
.memo-ref:hover{background:#e0f3e7}
.memo-note{padding:11px 16px;margin:0;background:#f8fafc;color:#516e87;font-size:12px;line-height:1.8}
.memo-assoc{padding:10px 16px;margin:0;border-top:1px solid #e6ecf1;font-size:11px;color:#668094}
@media(max-width:600px){.memo-toolbar{padding:13px 11px}.memo-search{grid-template-columns:1fr 1fr}.memo-search input{grid-column:span 2}.memo-card-head{padding:12px 11px}.memo-card-head h2{font-size:15px}.memo-labels{flex-wrap:wrap}.memo-table{font-size:12px;min-width:480px}.memo-table th,.memo-table td{padding:8px 10px}.memo-note{padding:10px 11px}.memo-categories button{flex:1}}
@media print{.memo-toolbar,.memo-refs-row{display:none!important}.memo-card{break-inside:avoid;margin-bottom:12px}}
 `;
 style.textContent+=`
.memo-practice-switch{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin:0 0 11px}
.memo-practice-switch>button{border:1px solid #d7e0e9;border-radius:9px;background:#fff;color:#576c84;padding:8px 14px;min-height:38px;font-size:12px;font-weight:750}
.memo-practice-switch>button.selected{color:#2365a3;background:#eaf3fc;border-color:#acc8df}
.memo-practice-switch>button#memoRestart{margin-left:10px}
.memo-practice-switch>button[hidden]{display:none}
.memo-practice-switch>span{margin-left:auto;color:#6c8397;font-size:11px;white-space:nowrap}
.memo-fill{display:flex;gap:5px;align-items:center;flex-wrap:wrap;min-width:120px}
.memo-blank{display:block;width:min(100%,220px);min-width:115px;flex:1 1 115px;border:1px solid #b6cadb;border-radius:7px;min-height:35px;padding:6px 9px;font-size:12px;background:#fff;color:#25394d}
.memo-grade{border:1px solid #d6e2eb;border-radius:7px;background:#f6fafc;color:#355e7d;padding:5px 8px;min-height:34px;font-size:11px;font-weight:750}
.memo-blank.memo-correct{border-color:#2e9469;background:#f5fff8}
.memo-blank.memo-incorrect{border-color:#ba5b5b;background:#fffafa}
.memo-feedback{flex-basis:100%;font-size:11px;line-height:1.5}
.memo-ok{color:#1e8156;font-weight:750}.memo-wrong{color:#a64b48;font-weight:700}
.memo-original{padding:13px 16px 15px;background:#f5f8fc;border-top:1px solid #e0e9f2}
.memo-original-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap;color:#24476c;font-size:13px}
.memo-original-head span{color:#27724f;border:1px solid #cee8d9;background:#e9f7ee;padding:1px 7px;border-radius:6px;font-size:10px;font-weight:750}
.memo-original-quote{font-family:serif;font-size:16px;line-height:2;overflow-wrap:anywhere;margin:10px 0 4px;letter-spacing:.015em;color:#26374c}
.memo-original-help{font-size:11px;color:#6e8093;margin:6px 0 0}
.memo-original-drill{padding:11px 0;border-bottom:1px solid #e4ebf1}
.memo-original-drill:last-child{border:0;padding-bottom:0}
.memo-original-drill small{font-size:11px;font-weight:800;color:#286d50}
.memo-original-drill p{font-family:serif;font-size:15px;line-height:1.9;color:#344a60;margin:7px 0}
.memo-original-drill .memo-fill{max-width:430px}
@media(max-width:600px){.memo-practice-switch>button{flex:1}.memo-practice-switch>button#memoRestart{margin-left:0}.memo-practice-switch>span{flex-basis:100%;text-align:right}.memo-original{padding:11px 12px}.memo-original-quote{font-size:15px}}
`;
 document.head.append(style);
 window.renderNeuroMemo=render;
})();
