(function initNeuroMemoView(){
 const data=window.NEURO_MEMO_TABLES||[];
 const bank=JSON.parse(document.getElementById('dataBank').textContent);
 const byId=new Map(bank.map(q=>[q.id,q]));
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const norm=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');
 const nav=document.querySelector('.topnav');
 const tab=document.createElement('button');tab.dataset.tab='memo';tab.textContent='암기표';tab.type='button';nav.append(tab);
 const view=document.createElement('div');view.id='memoView';view.className='hide';
 view.innerHTML='<div class="main-head"><div><h1>신경정신과 암기표</h1><p>한의신경정신과학 정리본 · 20·21·22학번 족보 대조</p></div></div><div class="panel memo-toolbar"><div class="memo-heading"><strong>주제별 암기표</strong><span id="memoCount"></span></div><div class="memo-search"><input id="memoSearch" type="search" placeholder="학자·원문·개념 검색" aria-label="암기표 검색"><select id="memoYear" aria-label="기출 학번"><option value="all">전체 학번</option><option value="20">20학번</option><option value="21">21학번</option><option value="22">22학번</option></select><button type="button" class="btn" id="memoOnly" aria-pressed="false">기출 연계만</button></div><div id="memoCategories" class="memo-categories" role="group" aria-label="분야 선택"><button type="button" data-memo-cat="전체" class="selected">전체</button><button type="button" data-memo-cat="한의학">한의학</button><button type="button" data-memo-cat="심리학">심리학</button><button type="button" data-memo-cat="발달">발달</button><button type="button" data-memo-cat="신경생리">신경생리</button></div><p class="memo-help"><strong class="memo-mark">족보</strong>는 해당 행에 연결되는 실제 기출문제입니다. 학번·문항 버튼을 누르면 퀴즈로 이동합니다. <strong>복기 불완전</strong> 문항은 답을 확정하지 않았습니다.</p></div><div id="memoCards" class="memo-cards"></div>';
 document.querySelector('main.main').append(view);
 let category='전체',examOnly=false;
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
   if(term&&!norm(item.title+' '+item.cat+' '+(item.note||'')+' '+item.rows.map(r=>r.c.join(' ')).join(' ')).includes(term))return false;
   return true;
  });
  document.getElementById('memoCount').textContent=filtered.length+' / '+data.length+'개 표';
  document.getElementById('memoOnly').setAttribute('aria-pressed',String(examOnly));
  document.getElementById('memoOnly').classList.toggle('selected',examOnly);
  const target=document.getElementById('memoCards');
  if(!filtered.length){target.innerHTML='<div class="emptycard"><b>해당 암기표가 없습니다.</b><p>검색·분류 조건을 조정해 주세요.</p></div>';return;}
  target.innerHTML=filtered.map(item=>{
    const refs=refsOf(item);
    const rows=item.rows.map(row=>{
      const direct=(row.q||[]).map(id=>byId.get(id)).filter(Boolean);
      const rowClass=direct.length?' class="memo-highlight"':'';
      const cells=row.c.map((val,i)=>'<td>'+(i===0?'<b>'+escape(val)+'</b>':escape(val))+(i===0&&direct.length?'<span class="memo-mark">족보</span>':'')+'</td>').join('');
      const rowDetail=direct.length?'<tr class="memo-refs-row"><td colspan="'+item.heads.length+'">'+direct.map(refMarkup).join('')+'</td></tr>':'';
      return '<tr'+rowClass+'>'+cells+'</tr>'+rowDetail;
    }).join('');
    const associated=(item.refs||[]).map(id=>byId.get(id)).filter(Boolean).map(refMarkup).join('');
    return '<section class="panel memo-card"><header class="memo-card-head"><h2><span class="memo-index">'+String(data.indexOf(item)+1).padStart(2,'0')+'</span> '+escape(item.title)+'</h2><div class="memo-labels"><span>'+escape(item.cat)+'</span><span class="'+(refs.length?'exam':'extra')+'">'+(refs.length?'족보 '+refs.length+'문항':'추가 암기')+'</span></div></header><div class="memo-scroll"><table class="memo-table"><thead><tr>'+item.heads.map(h=>'<th>'+escape(h)+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div>'+(item.note?'<p class="memo-note">'+escape(item.note)+'</p>':'')+(associated?'<p class="memo-assoc"><b>표 전체 관련 기출</b> '+associated+'</p>':'')+'</section>';
  }).join('');
 }
 document.getElementById('memoSearch').addEventListener('input',render);
 document.getElementById('memoYear').addEventListener('change',render);
 document.getElementById('memoOnly').addEventListener('click',()=>{examOnly=!examOnly;render();});
 document.getElementById('memoCategories').addEventListener('click',e=>{
  const button=e.target.closest('[data-memo-cat]');if(!button)return;
  category=button.dataset.memoCat;
  document.querySelectorAll('[data-memo-cat]').forEach(b=>b.classList.toggle('selected',b===button));
  render();
 });
 document.getElementById('memoCards').addEventListener('click',e=>{
  const button=e.target.closest('[data-memo-q]');
  if(button)window.openNeuroMemoQuestion?.(button.dataset.memoQ);
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
 document.head.append(style);
 window.renderNeuroMemo=render;
})();
