import json

data = json.load(open(r'D:\DangKhoa\project\mini\Mini-Project\interactivequiz\questions.json', encoding='utf-8'))
data_js = json.dumps(data, ensure_ascii=False)

template = r'''<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VAIO 2026 — Targeted Mock Quiz</title>
<style>
:root{
  --bg:#f4f6fb;--card:#ffffff;--text:#1f2937;--muted:#6b7280;
  --primary:#2563eb;--primary-dark:#1d4ed8;--accent:#10b981;
  --danger:#ef4444;--warn:#f59e0b;--border:#e5e7eb;
}
*{box-sizing:border-box}
body{margin:0;font-family:"Segoe UI",system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
.app{max-width:880px;margin:0 auto;padding:24px 16px 60px}
.card{background:var(--card);border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.06);padding:24px;margin-bottom:16px}
h1{margin:0 0 8px;font-size:28px}
h2{margin:0 0 12px;font-size:22px}
.sub{color:var(--muted);margin:0 0 20px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 20px;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;transition:.15s;user-select:none}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn-primary{background:var(--primary);color:#fff}
.btn-primary:hover:not(:disabled){background:var(--primary-dark)}
.btn-ghost{background:#eef2ff;color:var(--primary)}
.btn-ghost:hover{background:#dbeafe}
.btn-danger{background:var(--danger);color:#fff}
.btn-success{background:var(--accent);color:#fff}
.row{display:flex;gap:12px;flex-wrap:wrap}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
.mock-card{border:2px solid var(--border);border-radius:14px;padding:20px;cursor:pointer;transition:.15s;background:#fff}
.mock-card:hover{border-color:var(--primary);transform:translateY(-2px)}
.mock-card h3{margin:0 0 6px}
.tag{display:inline-block;padding:4px 10px;border-radius:999px;background:#eef2ff;color:var(--primary);font-size:12px;font-weight:600;margin-right:6px}
.progress-wrap{background:#e5e7eb;border-radius:999px;height:10px;overflow:hidden;margin:12px 0}
.progress-bar{height:100%;background:linear-gradient(90deg,var(--primary),var(--accent));transition:width .3s}
.meta{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;color:var(--muted);font-size:14px;margin-bottom:8px}
.qtext{font-size:18px;font-weight:600;line-height:1.5;margin:12px 0 16px;white-space:pre-wrap}
.option{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border:2px solid var(--border);border-radius:12px;margin-bottom:10px;cursor:pointer;transition:.15s;background:#fff}
.option:hover{border-color:#93c5fd}
.option input{margin-top:3px;transform:scale(1.2)}
.option .letter{font-weight:700;color:var(--primary);min-width:22px}
.option.correct{border-color:var(--accent);background:#ecfdf5}
.option.wrong{border-color:var(--danger);background:#fef2f2}
.option.missed{border-color:var(--warn);background:#fffbeb}
.feedback{margin-top:16px;padding:14px 16px;border-radius:12px;font-weight:600}
.feedback.ok{background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0}
.feedback.bad{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}
.expl{margin-top:10px;padding:12px 14px;background:#f9fafb;border-left:4px solid var(--primary);border-radius:8px;white-space:pre-wrap;line-height:1.5}
.summary{text-align:center}
.score-big{font-size:56px;font-weight:800;color:var(--primary);margin:8px 0}
.review-item{border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px}
.review-item .q{font-weight:600;margin-bottom:8px;white-space:pre-wrap}
.review-ans{font-size:14px;margin:4px 0}
.correct-chip{color:#065f46;font-weight:700}
.wrong-chip{color:#991b1b;font-weight:700}
.timer{font-variant-numeric:tabular-nums;font-weight:700;color:var(--primary)}
@media(max-width:600px){h1{font-size:22px}.qtext{font-size:16px}.score-big{font-size:44px}}
</style>
</head>
<body>
<div class="app" id="app"></div>
<script>
const DATA = __DATA_PLACEHOLDER__;

const TOTAL_MIN = 180;
let state = loadState() || {
  screen:'home',
  mock:null,
  index:0,
  selected:[],
  submitted:false,
  results:[],
  drafts:[],
  startTime:null,
  elapsed:0,
  timerEnabled:true
};
if(state.timerEnabled===undefined) state.timerEnabled=true;
if(!state.drafts) state.drafts=[];
let timerHandle=null;

function saveState(){ try{localStorage.setItem('quiz_state_v1', JSON.stringify(state));}catch(e){} }
function loadState(){ try{const s=localStorage.getItem('quiz_state_v1'); return s?JSON.parse(s):null;}catch(e){return null;} }
function clearState(){ localStorage.removeItem('quiz_state_v1'); }

function qs(mock){ return DATA[mock]; }
function currentQ(){ return qs(state.mock)[state.index]; }

function fmtTime(sec){
  if(sec<0) sec=0;
  const m=Math.floor(sec/60), s=sec%60;
  return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}

function startTimer(){
  if(!state.timerEnabled) return;
  if(timerHandle) clearInterval(timerHandle);
  if(!state.startTime) state.startTime=Date.now();
  timerHandle=setInterval(()=>{
    const elapsed=Math.floor((Date.now()-state.startTime)/1000);
    state.elapsed=elapsed;
    const rem=TOTAL_MIN*60-elapsed;
    const el=document.getElementById('timer');
    if(el) el.textContent=fmtTime(rem);
    if(rem<=0){ /* no auto submit */ }
    saveState();
  },1000);
}
function toggleTimer(){
  state.timerEnabled=!state.timerEnabled;
  if(!state.timerEnabled){ stopTimer(); state.elapsed=0; }
  else { if(!state.startTime) state.startTime=Date.now(); startTimer(); }
  saveState(); render();
}
function stopTimer(){ if(timerHandle){clearInterval(timerHandle);timerHandle=null;} }

function render(){ 
  const app=document.getElementById('app');
  if(state.screen==='home') app.innerHTML=homeHTML();
  else if(state.screen==='quiz') { app.innerHTML=quizHTML(); attachQuiz(); startTimer(); }
  else if(state.screen==='finish') { stopTimer(); app.innerHTML=finishHTML(); }
  else if(state.screen==='review') { app.innerHTML=reviewHTML(); }
}

function homeHTML(){
  const hasSaved = !!loadState() && loadState().screen==='quiz';
  return `
  <div class="card">
    <h1>VAIO 2026 — Targeted Mock Quiz</h1>
    <p class="sub">200 câu trắc nghiệm • Mock 1 + Mock 2 • 100 câu / 180 phút mỗi đề. Chọn đáp án, kiểm tra ngay sau mỗi câu, xem giải thích.</p>
    ${hasSaved?`<div style="margin-bottom:16px"><button class="btn btn-warn" style="background:var(--warn);color:#fff" onclick="resumeQuiz()">Tiếp tục bài đang làm</button> <button class="btn btn-ghost" onclick="discardSaved()">Xóa</button></div>`:''}
    <div class="grid">
      <div class="mock-card" onclick="startMock('mock1')">
        <span class="tag">Mock 1</span>
        <h3>Mock 1 — 100 câu</h3>
        <p class="sub" style="margin:4px 0 0">AI Ethics, Evaluation, CV, Data Processing, Statistics, NLP, NN, Classical ML...</p>
      </div>
      <div class="mock-card" onclick="startMock('mock2')">
        <span class="tag">Mock 2</span>
        <h3>Mock 2 — 100 câu</h3>
        <p class="sub" style="margin:4px 0 0">Evaluation, Linear Algebra, AI Ethics, Clustering, Data Processing, NN, Optimization...</p>
      </div>
    </div>
  </div>
  <div class="card">
    <h2>Hướng dẫn</h2>
    <ul style="line-height:1.8;color:var(--muted)">
      <li>Mỗi câu có 4 lựa chọn, có thể có <b>một hoặc nhiều đáp án đúng</b>.</li>
      <li>Chọn đáp án rồi bấm <b>Kiểm tra</b> để xem đúng/sai và giải thích.</li>
      <li>Sau đó bấm <b>Câu tiếp theo</b> để sang câu mới.</li>
      <li>Điểm chỉ tính khi tập lựa chọn khớp hoàn toàn với đáp án.</li>
    </ul>
  </div>`;
}

function resumeQuiz(){ render(); }
function discardSaved(){ clearState(); state={screen:'home',mock:null,index:0,selected:[],submitted:false,results:[],drafts:[],startTime:null,elapsed:0,timerEnabled:(state&&state.timerEnabled!==undefined)?state.timerEnabled:true}; render(); }

function startMock(mock){
  state={screen:'quiz',mock, index:0, selected:[], submitted:false, results:[], drafts:[], startTime:Date.now(), elapsed:0, timerEnabled:(state&&state.timerEnabled!==undefined)?state.timerEnabled:true};
  saveState(); render();
}

function quizHTML(){
  const q=currentQ();
  const total=qs(state.mock).length;
  const pct=Math.round((state.index/total)*100);
  const multi=q.answer.length>1;
  const isSubmitted=state.submitted;
  const correctSet=new Set(q.answer);
  let optionsHTML='';
  for(const letter of ['A','B','C','D']){
    const text=q.options[letter];
    const checked=state.selected.includes(letter);
    const cls=isSubmitted? (correctSet.has(letter)? (checked?'correct':'missed') : (checked?'wrong':'')) : '';
    const disabled=isSubmitted?'disabled':'';
    optionsHTML+=`
      <label class="option ${cls}">
        <input type="${multi?'checkbox':'radio'}" name="opt" value="${letter}" ${checked?'checked':''} ${disabled} onchange="onSelect('${letter}', this.checked, ${multi})">
        <span class="letter">${letter}.</span>
        <span>${escapeHtml(text)}</span>
      </label>`;
  }
  const rem=TOTAL_MIN*60-state.elapsed;
  let feedbackHTML='';
  if(isSubmitted){
    const ok=arraysEqual([...state.selected].sort(), [...q.answer].sort());
    feedbackHTML=`<div class="feedback ${ok?'ok':'bad'}">${ok?'✅ Đúng!': '❌ Sai. Đáp án đúng: '+q.answer.join(', ')}</div>
      <div class="expl"><b>Giải thích:</b> ${escapeHtml(q.explanation)}</div>`;
  }
  return `
  <div class="card">
    <div class="meta">
      <div><b>${state.mock==='mock1'?'Mock 1':'Mock 2'}</b> • Câu ${state.index+1}/${total}</div>
      <div>${state.timerEnabled?`⏱ <span class="timer" id="timer">${fmtTime(rem)}</span>`:'⏱ Đồng hồ tắt'} <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;margin-left:8px" onclick="toggleTimer()">${state.timerEnabled?'Tắt đồng hồ':'Bật đồng hồ'}</button></div>
    </div>
    <div class="progress-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>
    <div class="qtext">${escapeHtml(q.question)}</div>
    ${multi?'<div style="color:var(--muted);font-size:13px;margin-bottom:8px">Chọn một hoặc nhiều đáp án.</div>':''}
    <div id="opts">${optionsHTML}</div>
    <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn btn-ghost" onclick="prevQuestion()" ${state.index===0?'disabled':''}>← Câu trước</button>
      ${!isSubmitted?`<button class="btn btn-primary" onclick="submitAnswer()">Kiểm tra</button>`:`<button class="btn btn-primary" onclick="nextQuestion()">${state.index+1<total?'Câu tiếp theo →':'Xem kết quả'}</button>`}
      <button class="btn btn-ghost" onclick="goHome()">Trang chủ</button>
    </div>
    ${feedbackHTML}
  </div>`;
}

function attachQuiz(){ /* nothing extra */ }

function onSelect(letter, checked, multi){
  if(multi){
    if(checked){ if(!state.selected.includes(letter)) state.selected.push(letter); }
    else state.selected=state.selected.filter(x=>x!==letter);
  } else {
    state.selected=[letter];
  }
  saveState();
}

function saveDraft(){ state.drafts[state.index]=[...state.selected]; }

function restoreQuestion(){
  const r=state.results[state.index];
  if(r){ state.selected=[...r.selected]; state.submitted=true; }
  else { state.selected=state.drafts[state.index]?[...state.drafts[state.index]]:[]; state.submitted=false; }
}

function submitAnswer(){
  if(state.selected.length===0){ alert('Vui lòng chọn ít nhất một đáp án.'); return; }
  const q=currentQ();
  const ok=arraysEqual([...state.selected].sort(), [...q.answer].sort());
  state.results[state.index]={selected:[...state.selected], correct:ok};
  state.drafts[state.index]=[...state.selected];
  state.submitted=true;
  saveState(); render();
}

function prevQuestion(){
  if(state.index<=0) return;
  saveDraft();
  state.index--;
  restoreQuestion();
  saveState(); render();
}

function nextQuestion(){
  const total=qs(state.mock).length;
  saveDraft();
  if(state.index+1<total){
    state.index++;
    restoreQuestion();
    saveState(); render();
  } else {
    state.screen='finish'; saveState(); render();
  }
}

function goHome(){ stopTimer(); state.screen='home'; saveState(); render(); }

function finishHTML(){
  const total=qs(state.mock).length;
  const correct=state.results.filter(r=>r&&r.correct).length;
  const pct=Math.round(correct/total*100);
  const time=fmtTime(state.elapsed);
  return `
  <div class="card summary">
    <h1>Hoàn thành ${state.mock==='mock1'?'Mock 1':'Mock 2'}</h1>
    <div class="score-big">${correct}/${total}</div>
    <p style="font-size:20px;color:var(--muted)">${pct}% • Thời gian: ${time}</p>
    <div class="row" style="justify-content:center;margin-top:16px">
      <button class="btn btn-primary" onclick="state.screen='review';saveState();render()">Xem chi tiết</button>
      <button class="btn btn-success" onclick="retryMock()">Làm lại</button>
      <button class="btn btn-ghost" onclick="goHomeClean()">Trang chủ</button>
    </div>
  </div>`;
}

function retryMock(){
  const m=state.mock;
  state={screen:'quiz',mock:m,index:0,selected:[],submitted:false,results:[],drafts:[],startTime:Date.now(),elapsed:0,timerEnabled:(state&&state.timerEnabled!==undefined)?state.timerEnabled:true};
  saveState(); render();
}

function goHomeClean(){ clearState(); state={screen:'home',mock:null,index:0,selected:[],submitted:false,results:[],drafts:[],startTime:null,elapsed:0,timerEnabled:(state&&state.timerEnabled!==undefined)?state.timerEnabled:true}; render(); }

function reviewHTML(){
  const total=qs(state.mock).length;
  const items=qs(state.mock).map((q,i)=>{
    const r=state.results[i]||{selected:[],correct:false};
    const ok=r.correct;
    const userAns=r.selected.length?r.selected.join(', '):'(không chọn)';
    return `<div class="review-item">
      <div class="q">Câu ${q.num}. ${escapeHtml(q.question)}</div>
      <div class="review-ans">Bạn chọn: <span class="${ok?'correct-chip':'wrong-chip'}">${userAns}</span></div>
      <div class="review-ans">Đáp án đúng: <span class="correct-chip">${q.answer.join(', ')}</span></div>
      <div class="expl" style="margin-top:8px">${escapeHtml(q.explanation)}</div>
    </div>`;
  }).join('');
  return `
  <div class="card">
    <h2>Chi tiết ${state.mock==='mock1'?'Mock 1':'Mock 2'}</h2>
    <button class="btn btn-ghost" onclick="state.screen='finish';render()">Quay lại kết quả</button>
  </div>
  ${items}`;
}

function arraysEqual(a,b){ return a.length===b.length && a.every((v,i)=>v===b[i]); }
function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// init
render();
</script>
</body>
</html>
'''

html = template.replace('__DATA_PLACEHOLDER__', data_js)
out = r'D:\DangKhoa\project\mini\Mini-Project\interactivequiz\index.html'
open(out, 'w', encoding='utf-8').write(html)
print('written', out, len(html))
