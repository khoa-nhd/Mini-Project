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
.mock-card{border:2px solid var(--border);border-radius:14px;padding:20px;transition:.15s;background:#fff}
.mock-card h3{margin:0 0 6px}
.tag{display:inline-block;padding:4px 10px;border-radius:999px;background:#eef2ff;color:var(--primary);font-size:12px;font-weight:600}
.badge{display:inline-block;padding:3px 9px;border-radius:999px;font-size:12px;font-weight:600}
.badge-warn{background:#fef3c7;color:#b45309}
.badge-success{background:#d1fae5;color:#065f46}
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
const STORE_KEY = 'quiz_store_v2';

function shuffleArray(arr){
  const a = [...arr];
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateOptionOrders(mock){
  const total = qs(mock).length;
  const orders = [];
  for(let i = 0; i < total; i++){
    orders.push(shuffleArray(['A','B','C','D']));
  }
  return orders;
}

function qs(mock){ return DATA[mock]; }

function defaultMockState(mockKey){
  return {
    index: 0,
    selected: [],
    submitted: false,
    results: [],
    drafts: [],
    optionOrders: generateOptionOrders(mockKey),
    startTime: null,
    elapsed: 0,
    timerEnabled: true,
    completed: false
  };
}

function initDefaultStore(){
  return {
    currentScreen: 'home',
    activeMock: null,
    mocks: {
      mock1: defaultMockState('mock1'),
      mock2: defaultMockState('mock2')
    }
  };
}

function loadStore(){
  try{
    const s = localStorage.getItem(STORE_KEY);
    if(s){
      const parsed = JSON.parse(s);
      if(!parsed.mocks) parsed.mocks = {};
      if(!parsed.mocks.mock1) parsed.mocks.mock1 = defaultMockState('mock1');
      if(!parsed.mocks.mock2) parsed.mocks.mock2 = defaultMockState('mock2');
      return parsed;
    }
    // Migration from old quiz_state_v1 if present
    const old = localStorage.getItem('quiz_state_v1');
    if(old){
      const parsedOld = JSON.parse(old);
      const def = initDefaultStore();
      if(parsedOld && parsedOld.mock && def.mocks[parsedOld.mock]){
        def.mocks[parsedOld.mock] = {
          index: parsedOld.index || 0,
          selected: parsedOld.selected || [],
          submitted: parsedOld.submitted || false,
          results: parsedOld.results || [],
          drafts: parsedOld.drafts || [],
          optionOrders: parsedOld.optionOrders || generateOptionOrders(parsedOld.mock),
          startTime: parsedOld.startTime || null,
          elapsed: parsedOld.elapsed || 0,
          timerEnabled: parsedOld.timerEnabled !== undefined ? parsedOld.timerEnabled : true,
          completed: parsedOld.screen === 'finish' || parsedOld.screen === 'review'
        };
        def.activeMock = parsedOld.mock;
      }
      return def;
    }
  }catch(e){}
  return initDefaultStore();
}

let store = loadStore();
let timerHandle = null;

function saveStore(){
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(store)); }catch(e){}
}

function curMockState(){
  if(!store.activeMock) return null;
  if(!store.mocks[store.activeMock]){
    store.mocks[store.activeMock] = defaultMockState(store.activeMock);
  }
  return store.mocks[store.activeMock];
}

function getQuestionView(mockKey, index){
  const q = qs(mockKey)[index];
  const mState = store.mocks[mockKey];
  if(!mState.optionOrders) mState.optionOrders = [];
  if(!mState.optionOrders[index]){
    mState.optionOrders[index] = shuffleArray(['A','B','C','D']);
  }
  const order = mState.optionOrders[index];
  const labels = ['A','B','C','D'];
  const options = {};
  const answer = [];
  
  labels.forEach((label, idx) => {
    const origKey = order[idx];
    options[label] = q.options[origKey];
    if (q.answer.includes(origKey)) {
      answer.push(label);
    }
  });
  
  return {
    num: q.num,
    question: q.question,
    options: options,
    answer: answer,
    explanation: q.explanation
  };
}

function currentQ(){
  const mState = curMockState();
  return getQuestionView(store.activeMock, mState.index);
}

function fmtTime(sec){
  if(sec<0) sec=0;
  const m=Math.floor(sec/60), s=sec%60;
  return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}

function startTimer(){
  const mState = curMockState();
  if(!mState || !mState.timerEnabled) return;
  if(timerHandle) clearInterval(timerHandle);
  if(!mState.startTime) mState.startTime = Date.now();
  timerHandle = setInterval(()=>{
    const elapsed = Math.floor((Date.now() - mState.startTime)/1000);
    mState.elapsed = elapsed;
    const rem = TOTAL_MIN*60 - elapsed;
    const el = document.getElementById('timer');
    if(el) el.textContent = fmtTime(rem);
    saveStore();
  }, 1000);
}

function toggleTimer(){
  const mState = curMockState();
  if(!mState) return;
  mState.timerEnabled = !mState.timerEnabled;
  if(!mState.timerEnabled){ stopTimer(); mState.elapsed = 0; }
  else { if(!mState.startTime) mState.startTime = Date.now(); startTimer(); }
  saveStore(); render();
}

function stopTimer(){
  if(timerHandle){ clearInterval(timerHandle); timerHandle = null; }
}

function render(){ 
  const app = document.getElementById('app');
  if(store.currentScreen === 'home') { stopTimer(); app.innerHTML = homeHTML(); }
  else if(store.currentScreen === 'quiz') { app.innerHTML = quizHTML(); attachQuiz(); startTimer(); }
  else if(store.currentScreen === 'finish') { stopTimer(); app.innerHTML = finishHTML(); }
  else if(store.currentScreen === 'review') { stopTimer(); app.innerHTML = reviewHTML(); }
}

function getMockStats(mKey){
  const mState = store.mocks[mKey];
  const total = qs(mKey).length;
  if(!mState) return { answered: 0, total, correct: 0, hasProgress: false, isCompleted: false, index: 0 };
  const answered = (mState.results || []).filter(r => r && r.selected && r.selected.length > 0).length;
  const correct = (mState.results || []).filter(r => r && r.correct).length;
  const hasProgress = answered > 0 || (mState.drafts || []).some(d => d && d.length > 0) || mState.elapsed > 0;
  return {
    answered,
    total,
    correct,
    hasProgress,
    isCompleted: !!mState.completed,
    index: mState.index || 0
  };
}

function homeHTML(){
  const s1 = getMockStats('mock1');
  const s2 = getMockStats('mock2');

  function renderCard(key, title, topics, s){
    let badge = '';
    let progressText = 'Chưa làm bài';
    if(s.isCompleted){
      badge = '<span class="badge badge-success">Đã hoàn thành</span>';
      progressText = `Kết quả: <b>${s.correct}/${s.total}</b> câu đúng (${Math.round(s.correct/s.total*100)}%)`;
    } else if(s.hasProgress){
      badge = '<span class="badge badge-warn">Đang làm dở</span>';
      progressText = `Tiến độ: Đang ở <b>Câu ${s.index + 1}/${s.total}</b> • Đã trả lời: <b>${s.answered}/${s.total}</b> câu`;
    }

    return `
    <div class="mock-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span class="tag">${key === 'mock1' ? 'Mock 1' : 'Mock 2'}</span>
        ${badge}
      </div>
      <h3>${title}</h3>
      <p class="sub" style="margin:4px 0 10px;font-size:13px">${topics}</p>
      <div style="font-size:13px;color:var(--text);margin-bottom:14px;background:#f9fafb;padding:8px 12px;border-radius:8px">
        ${progressText}
      </div>
      <div class="row" style="gap:8px">
        <button class="btn btn-primary" style="flex:1" onclick="openMock('${key}')">
          ${s.hasProgress ? (s.isCompleted ? 'Xem kết quả' : 'Tiếp tục làm') : 'Bắt đầu làm'}
        </button>
        ${s.hasProgress ? `
          <button class="btn btn-ghost" style="color:var(--danger);background:#fee2e2" title="Xóa tất cả đáp án đã lưu của ${key === 'mock1' ? 'Mock 1' : 'Mock 2'}" onclick="resetMock('${key}')">
            🗑️ Xóa đáp án
          </button>
        ` : ''}
      </div>
    </div>`;
  }

  return `
  <div class="card">
    <h1>VAIO 2026 — Targeted Mock Quiz</h1>
    <p class="sub">200 câu trắc nghiệm • Mock 1 + Mock 2 • 100 câu / 180 phút mỗi đề. Đáp án được xáo trộn ngẫu nhiên và tự động lưu riêng biệt từng đề.</p>
    <div class="grid">
      ${renderCard('mock1', 'Mock 1 — 100 câu', 'AI Ethics, Evaluation, CV, Data Processing, Statistics, NLP, NN, Classical ML...', s1)}
      ${renderCard('mock2', 'Mock 2 — 100 câu', 'Evaluation, Linear Algebra, AI Ethics, Clustering, Data Processing, NN, Optimization...', s2)}
    </div>
  </div>
  <div class="card">
    <h2>Hướng dẫn & Tính năng</h2>
    <ul style="line-height:1.8;color:var(--muted)">
      <li>Mỗi câu có 4 lựa chọn (được xáo trộn ngẫu nhiên A, B, C, D), có thể có <b>một hoặc nhiều đáp án đúng</b>.</li>
      <li>Chọn đáp án rồi bấm <b>Kiểm tra</b> để xem đúng/sai và giải thích chi tiết.</li>
      <li><b>Không lo mất bài:</b> Bấm <b>Trang chủ</b> bất cứ lúc nào, toàn bộ đáp án của đề đang làm sẽ được giữ nguyên 100%.</li>
      <li><b>Tách biệt 2 đề:</b> Mock 1 và Mock 2 lưu độc lập, làm đề này không ảnh hưởng đề kia.</li>
      <li><b>Xóa đáp án từng đề:</b> Có thể bấm <b>🗑️ Xóa đáp án</b> ở từng đề (trên Trang chủ hoặc trong bài thi) để làm lại từ đầu chỉ riêng đề đó.</li>
    </ul>
  </div>`;
}

function openMock(mockKey){
  store.activeMock = mockKey;
  const mState = curMockState();
  if(!mState.startTime){
    mState.startTime = Date.now();
  }
  if(mState.completed){
    store.currentScreen = 'finish';
  } else {
    store.currentScreen = 'quiz';
    restoreQuestion();
  }
  saveStore();
  render();
}

function resetMock(mockKey, askConfirm = true){
  const name = mockKey === 'mock1' ? 'Mock 1' : 'Mock 2';
  if(askConfirm){
    const confirmed = confirm(`Bạn có chắc muốn xóa TẤT CẢ đáp án đã lưu của ${name} không?\n(Chỉ xóa dữ liệu của ${name}, không ảnh hưởng bài khác)`);
    if(!confirmed) return;
  }
  store.mocks[mockKey] = defaultMockState(mockKey);
  if(store.activeMock === mockKey){
    stopTimer();
    if(store.currentScreen !== 'home'){
      store.mocks[mockKey].startTime = Date.now();
      store.currentScreen = 'quiz';
      restoreQuestion();
    }
  }
  saveStore();
  render();
}

function quizHTML(){
  const mState = curMockState();
  const q = currentQ();
  const total = qs(store.activeMock).length;
  const pct = Math.round((mState.index / total) * 100);
  const multi = q.answer.length > 1;
  const isSubmitted = mState.submitted;
  const correctSet = new Set(q.answer);
  let optionsHTML = '';
  for(const letter of ['A','B','C','D']){
    const text = q.options[letter];
    const checked = mState.selected.includes(letter);
    const cls = isSubmitted ? (correctSet.has(letter) ? (checked ? 'correct' : 'missed') : (checked ? 'wrong' : '')) : '';
    const disabled = isSubmitted ? 'disabled' : '';
    optionsHTML += `
      <label class="option ${cls}">
        <input type="${multi?'checkbox':'radio'}" name="opt" value="${letter}" ${checked?'checked':''} ${disabled} onchange="onSelect('${letter}', this.checked, ${multi})">
        <span class="letter">${letter}.</span>
        <span>${escapeHtml(text)}</span>
      </label>`;
  }
  const rem = TOTAL_MIN * 60 - mState.elapsed;
  let feedbackHTML = '';
  if(isSubmitted){
    const ok = arraysEqual([...mState.selected].sort(), [...q.answer].sort());
    feedbackHTML = `<div class="feedback ${ok?'ok':'bad'}">${ok?'✅ Đúng!': '❌ Sai. Đáp án đúng: '+q.answer.join(', ')}</div>
      <div class="expl"><b>Giải thích:</b> ${escapeHtml(q.explanation)}</div>`;
  }
  return `
  <div class="card">
    <div class="meta">
      <div><b>${store.activeMock==='mock1'?'Mock 1':'Mock 2'}</b> • Câu ${mState.index+1}/${total}</div>
      <div>${mState.timerEnabled?`⏱ <span class="timer" id="timer">${fmtTime(rem)}</span>`:'⏱ Đồng hồ tắt'} <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;margin-left:8px" onclick="toggleTimer()">${mState.timerEnabled?'Tắt đồng hồ':'Bật đồng hồ'}</button></div>
    </div>
    <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <button class="btn btn-ghost" onclick="goHome()">🏠 Trang chủ</button>
      <button class="btn btn-ghost" style="color:var(--danger);background:#fee2e2;font-size:13px;padding:8px 12px" onclick="resetMock('${store.activeMock}')">🗑️ Xóa đáp án & làm lại đề này</button>
    </div>
    <div class="progress-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>
    <div class="qtext">${escapeHtml(q.question)}</div>
    ${multi?'<div style="color:var(--muted);font-size:13px;margin-bottom:8px">Chọn một hoặc nhiều đáp án.</div>':''}
    <div id="opts">${optionsHTML}</div>
    <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn btn-ghost" onclick="prevQuestion()" ${mState.index===0?'disabled':''}>← Câu trước</button>
      ${!isSubmitted?`<button class="btn btn-primary" onclick="submitAnswer()">Kiểm tra</button>`:`<button class="btn btn-primary" onclick="nextQuestion()">${mState.index+1<total?'Câu tiếp theo →':'Xem kết quả'}</button>`}
    </div>
    ${feedbackHTML}
  </div>`;
}

function attachQuiz(){ /* nothing extra */ }

function onSelect(letter, checked, multi){
  const mState = curMockState();
  if(multi){
    if(checked){
      if(!mState.selected.includes(letter)) mState.selected.push(letter);
    } else {
      mState.selected = mState.selected.filter(x => x !== letter);
    }
  } else {
    mState.selected = [letter];
  }
  saveStore();
}

function saveDraft(){
  const mState = curMockState();
  mState.drafts[mState.index] = [...mState.selected];
}

function restoreQuestion(){
  const mState = curMockState();
  const r = mState.results[mState.index];
  if(r){
    mState.selected = [...r.selected];
    mState.submitted = true;
  } else {
    mState.selected = mState.drafts[mState.index] ? [...mState.drafts[mState.index]] : [];
    mState.submitted = false;
  }
}

function submitAnswer(){
  const mState = curMockState();
  if(mState.selected.length === 0){ alert('Vui lòng chọn ít nhất một đáp án.'); return; }
  const q = currentQ();
  const ok = arraysEqual([...mState.selected].sort(), [...q.answer].sort());
  mState.results[mState.index] = { selected: [...mState.selected], correct: ok };
  mState.drafts[mState.index] = [...mState.selected];
  mState.submitted = true;
  saveStore(); render();
}

function prevQuestion(){
  const mState = curMockState();
  if(mState.index <= 0) return;
  saveDraft();
  mState.index--;
  restoreQuestion();
  saveStore(); render();
}

function nextQuestion(){
  const mState = curMockState();
  const total = qs(store.activeMock).length;
  saveDraft();
  if(mState.index + 1 < total){
    mState.index++;
    restoreQuestion();
    saveStore(); render();
  } else {
    mState.completed = true;
    store.currentScreen = 'finish';
    saveStore(); render();
  }
}

function goHome(){
  stopTimer();
  store.currentScreen = 'home';
  saveStore();
  render();
}

function finishHTML(){
  const mKey = store.activeMock;
  const mState = curMockState();
  const total = qs(mKey).length;
  const correct = mState.results.filter(r => r && r.correct).length;
  const pct = Math.round(correct / total * 100);
  const time = fmtTime(mState.elapsed);
  return `
  <div class="card summary">
    <h1>Hoàn thành ${mKey === 'mock1' ? 'Mock 1' : 'Mock 2'}</h1>
    <div class="score-big">${correct}/${total}</div>
    <p style="font-size:20px;color:var(--muted)">${pct}% • Thời gian: ${time}</p>
    <div class="row" style="justify-content:center;margin-top:16px">
      <button class="btn btn-primary" onclick="store.currentScreen='review';saveStore();render()">Xem chi tiết</button>
      <button class="btn btn-ghost" onclick="exportResults()">📥 Lưu đáp án file</button>
      <button class="btn btn-success" onclick="resetMock('${mKey}', false)">Làm lại</button>
      <button class="btn btn-ghost" onclick="goHome()">🏠 Trang chủ</button>
    </div>
  </div>`;
}

function exportResults(){
  const mKey = store.activeMock;
  const mState = curMockState();
  const total = qs(mKey).length;
  const correctCount = mState.results.filter(r => r && r.correct).length;
  const items = qs(mKey).map((origQ, i) => {
    const q = getQuestionView(mKey, i);
    const r = mState.results[i] || { selected: [], correct: false };
    const userAns = r.selected.length ? [...r.selected] : ['—'];
    return {
      no: i + 1,
      question: q.question,
      options: q.options,
      user: userAns,
      correct: q.answer,
      right: !!r.correct,
      explanation: q.explanation,
      isMulti: q.answer.length > 1
    };
  });
  const payload = {
    mock: mKey,
    total,
    correct: correctCount,
    pct: total > 0 ? Math.round(correctCount / total * 100) : 0,
    time: fmtTime(mState.elapsed),
    items
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${mKey}_answers.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function reviewHTML(){
  const mKey = store.activeMock;
  const mState = curMockState();
  const total = qs(mKey).length;
  const items = qs(mKey).map((origQ, i) => {
    const q = getQuestionView(mKey, i);
    const r = mState.results[i] || { selected: [], correct: false };
    const ok = r.correct;
    const userAns = r.selected.length ? r.selected.join(', ') : '(không chọn)';
    return `<div class="review-item">
      <div class="q">Câu ${q.num}. ${escapeHtml(q.question)}</div>
      <div class="review-ans">Bạn chọn: <span class="${ok ? 'correct-chip' : 'wrong-chip'}">${userAns}</span></div>
      <div class="review-ans">Đáp án đúng: <span class="correct-chip">${q.answer.join(', ')}</span></div>
      <div class="expl" style="margin-top:8px">${escapeHtml(q.explanation)}</div>
    </div>`;
  }).join('');
  return `
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <h2>Chi tiết ${mKey === 'mock1' ? 'Mock 1' : 'Mock 2'}</h2>
      <div class="row">
        <button class="btn btn-ghost" onclick="store.currentScreen='finish';render()">Quay lại kết quả</button>
        <button class="btn btn-ghost" onclick="goHome()">🏠 Trang chủ</button>
      </div>
    </div>
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
