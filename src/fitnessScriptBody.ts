/**
 * Complete WebView fitness app logic.
 * No "</script>" substring allowed — imported as a raw string into poseHtml.ts.
 *
 * Screens: Home · Select · Instructions · Workout · Result · Progress
 * Exercises: Squat · Push-Up · Lunge · Plank · Sit-Up (classic + bicycle)
 * Features: MoveNet pose estimation, rep counting, form scoring, Firebase sync,
 *           calibration countdown, scrollable menu, CSV data export, TTS feedback.
 */
export const FITNESS_SCRIPT_BODY = `
/* ══════════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════════ */
const FIREBASE_URL = 'https://ai-posture-4953f-default-rtdb.asia-southeast1.firebasedatabase.app/';
const MOVENET_URL  = 'https://tfhub.dev/google/tfjs-model/movenet/singlepose/lightning/4';
const RES = 192, MIN_CROP = 0.2, MIN_POSE = 0.25, CROP_F = 0.9;
const AUDIO_MS = 3000, AUDIO_REPEAT_MS = 8000;
const COCO = ['nose','left_eye','right_eye','left_ear','right_ear',
  'left_shoulder','right_shoulder','left_elbow','right_elbow','left_wrist','right_wrist',
  'left_hip','right_hip','left_knee','right_knee','left_ankle','right_ankle'];
const EDGES = [[0,1],[0,2],[1,3],[2,4],[5,6],[5,7],[7,9],[6,8],[8,10],
               [5,11],[6,12],[11,12],[11,13],[13,15],[12,14],[14,16]];
const MP_MAP = {0:0,11:5,12:6,13:7,14:8,15:9,16:10,23:11,24:12,25:13,26:14,27:15,28:16};

/* Keys map to bundled images in mobile/assets/ (wired in App.tsx → IMAGE_ASSETS). */
const EXERCISES = [
  {key:'SQUAT', label:'Squat',   camera:'Front-facing'},
  {key:'PUSHUP',label:'Push-Up', camera:'Side-facing'},
  {key:'LUNGE', label:'Lunge',   camera:'Front-facing'},
  {key:'PLANK', label:'Plank',   camera:'Side-facing'},
  {key:'SITUP', label:'Sit-Up',  camera:'Side-facing'},
];

const EX_META = {
  SQUAT:{
    icon:'🏋️', color:'#00BFFF', bg:'rgba(0,191,255,.12)',
    badge:'badge-front', camText:'Front-facing camera',
    camAlert:'📷 Stand facing the camera — full body must be visible',
    hasMethods:false,
    steps:[
      'Stand with feet shoulder-width apart, toes slightly turned out',
      'Keep your chest up, back straight, and core braced',
      'Lower your hips as if sitting back into a chair (thighs parallel to floor)',
      'Drive through your heels and return to the standing position',
    ],
    score:'Knee 70–95° + upright torso = 10 pts · Partial = 5 pts',
  },
  PUSHUP:{
    icon:'💪', color:'#FF6633', bg:'rgba(255,102,51,.12)',
    badge:'badge-side', camText:'Side-facing camera',
    camAlert:'📷 Place camera at floor level pointing at your right side',
    hasMethods:false,
    steps:[
      'Start in a high plank — hands shoulder-width apart, arms fully extended',
      'Keep your body in a rigid straight line from head to heels',
      'Lower your chest toward the floor, elbows at roughly 45° outward',
      'Push explosively back up until arms are extended — that is one rep',
    ],
    score:'Body straight during down phase = 10 pts · Body sag = 5 pts',
  },
  LUNGE:{
    icon:'🦵', color:'#00DD88', bg:'rgba(0,221,136,.12)',
    badge:'badge-front', camText:'Front-facing camera',
    camAlert:'📷 Face the camera — both legs must be fully visible',
    hasMethods:false,
    steps:[
      'Stand upright with feet hip-width apart, hands on hips or at sides',
      'Step one foot forward and lower your body straight down',
      'Both knees reach ~90° — front knee stays directly above your ankle',
      'Push through the front foot to return, then alternate legs',
    ],
    score:'Torso lean < 20° (upright) = 10 pts · Leaning = 5 pts',
  },
  PLANK:{
    icon:'⏱️', color:'#CC88FF', bg:'rgba(204,136,255,.12)',
    badge:'badge-side', camText:'Side-facing camera',
    camAlert:'📷 Place camera at floor level pointing at your right side',
    hasMethods:false,
    steps:[
      'High plank: palms flat on floor, arms straight below shoulders',
      '— OR — Forearm plank: elbows on floor, forearms parallel, body elevated',
      'Keep a rigid straight line from head to heels — engage core and glutes',
      'Hold as long as possible without letting hips sag or rise',
    ],
    score:'1 point per second held with correct form',
  },
  SITUP:{
    icon:'🤸', color:'#FFD700', bg:'rgba(255,215,0,.12)',
    badge:'badge-side', camText:'Side-facing camera',
    camAlert:'📷 Place camera at floor level pointing at your right side',
    hasMethods:false,
    steps:[
      'Lie on your back, knees bent, feet flat on the floor hip-width apart',
      'Cross arms over chest or place fingertips lightly by your ears',
      'Engage your core and lift your upper body toward your knees',
      'Sit fully upright until chest is over hips, then lower back with control',
    ],
    score:'Full sit-up = 10 pts · Partial = 5 pts',
  },
};

const C = {
  gold:'#ffd700',cyan:'#00ccff',green:'#00ff88',orange:'#ff8800',
  red:'#ff3344',white:'#f1f5f9',gray:'#94a3b8',dgray:'#475569',dark:'#09090d',
};

/* ══════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════ */
function $(id){ return document.getElementById(id); }
function qs(sel){ return document.querySelector(sel); }

function ang(a, b, c) {
  const r = Math.atan2(c[1]-b[1],c[0]-b[0]) - Math.atan2(a[1]-b[1],a[0]-b[0]);
  let d = Math.abs(r * 180 / Math.PI);
  return d > 180 ? 360 - d : d;
}
function spineLean(sh, hip) {
  const dx = sh[0]-hip[0], dy = hip[1]-sh[1];
  return Math.atan2(Math.abs(dx), Math.max(Math.abs(dy),1e-6)) * 180/Math.PI;
}

class Deque {
  constructor(max){ this.max=max; this.a=[]; }
  clear(){ this.a=[]; }
  push(x){ this.a.push(x); if(this.a.length>this.max) this.a.shift(); }
  avg(){ return this.a.length ? this.a.reduce((s,v)=>s+v,0)/this.a.length : 0; }
}
class LowPass {
  constructor(a){ this.a=a; this.v=null; this.ok=false; }
  apply(x){ if(!this.ok){this.v=x;this.ok=true;return x;} this.v+=this.a*(x-this.v); return this.v; }
  reset(){ this.ok=false; this.v=null; }
}

/* ══════════════════════════════════════════════════════════
   MOVENET / CROP
══════════════════════════════════════════════════════════ */
const KP = COCO.reduce((o,n,i)=>{o[n]=i;return o;},{});
function initCrop(first, W, H){
  let bh,bw,y0,x0;
  if(first){
    if(W>H){bh=1;bw=H/W;y0=0;x0=(W/2-H/2)/W;}
    else{bh=W/H;bw=1;y0=(H/2-W/2)/H;x0=0;}
  }else{
    if(W>H){bh=W/H;bw=1;y0=(H/2-W/2)/H;x0=0;}
    else{bh=1;bw=H/W;y0=0;x0=(W/2-H/2)/W;}
  }
  return{yMin:y0,xMin:x0,yMax:y0+bh,xMax:x0+bw,height:bh,width:bw};
}
function torsoVis(kp){
  return(kp[KP.left_hip].score>MIN_CROP||kp[KP.right_hip].score>MIN_CROP)&&
        (kp[KP.left_shoulder].score>MIN_CROP||kp[KP.right_shoulder].score>MIN_CROP);
}
function nextCrop(crop,kp,W,H){
  const tk={};
  for(const k of COCO) tk[k]=[kp[KP[k]].y*H,kp[KP[k]].x*W];
  if(torsoVis(kp)){
    const cy=(tk.left_hip[0]+tk.right_hip[0])/2,cx=(tk.left_hip[1]+tk.right_hip[1])/2;
    const tj=['left_shoulder','right_shoulder','left_hip','right_hip'];
    let mty=0,mtx=0;
    for(const j of tj){mty=Math.max(mty,Math.abs(cy-tk[j][0]));mtx=Math.max(mtx,Math.abs(cx-tk[j][1]));}
    let mby=0,mbx=0;
    for(const k of COCO){if(kp[KP[k]].score<MIN_CROP)continue;mby=Math.max(mby,Math.abs(cy-tk[k][0]));mbx=Math.max(mbx,Math.abs(cx-tk[k][1]));}
    let half=Math.max(mtx*1.9,mty*1.9,mbx*1.2,mby*1.2);
    half=Math.min(half,Math.max(cx,W-cx,cy,H-cy));
    const corner=[cy-half,cx-half];
    if(half>Math.max(W,H)/2) return initCrop(crop==null,W,H);
    const L=half*2;
    return{yMin:corner[0]/H,xMin:corner[1]/W,yMax:(corner[0]+L)/H,xMax:(corner[1]+L)/W,height:L/H,width:L/W};
  }
  return initCrop(crop==null,W,H);
}
function createRunner(tf, model, video){
  let crop=null;
  const fy0=new LowPass(CROP_F),fx0=new LowPass(CROP_F),fy1=new LowPass(CROP_F),fx1=new LowPass(CROP_F);
  function filterCrop(n){
    if(!n){fy0.reset();fx0.reset();fy1.reset();fx1.reset();return null;}
    const y0=fy0.apply(n.yMin),x0=fx0.apply(n.xMin),y1=fy1.apply(n.yMax),x1=fx1.apply(n.xMax);
    return{yMin:y0,xMin:x0,yMax:y1,xMax:x1,height:y1-y0,width:x1-x0};
  }
  function reset(){crop=null;fy0.reset();fx0.reset();fy1.reset();fx1.reset();}
  async function estimatePoses(){
    const W=video.videoWidth,H=video.videoHeight;
    const inp=tf.tidy(()=>tf.expandDims(tf.cast(tf.browser.fromPixels(video),'int32'),0));
    let box=null,bi=null,cr=null,out=null;
    try{
      if(!crop) crop=initCrop(true,W,H);
      box=tf.tensor2d([[crop.yMin,crop.xMin,crop.yMax,crop.xMax]]);
      bi=tf.tensor1d([0],'int32');
      cr=tf.cast(tf.image.cropAndResize(inp,box,bi,[RES,RES],'bilinear',0),'int32');
      out=model.execute(cr);
      const d=out.dataSync();
      const kp=[];
      let n=0,s=0;
      for(let i=0;i<17;i++){kp[i]={y:d[i*3],x:d[i*3+1],score:d[i*3+2]};if(kp[i].score>MIN_CROP){n++;s+=kp[i].score;}}
      const sc=n>0?s/n:0;
      if(sc<MIN_POSE){reset();return[];}
      for(let i=0;i<17;i++){kp[i].y=crop.yMin+kp[i].y*crop.height;kp[i].x=crop.xMin+kp[i].x*crop.width;}
      crop=filterCrop(nextCrop(crop,kp,W,H));
      for(let i=0;i<17;i++){kp[i].name=COCO[i];kp[i].y*=H;kp[i].x*=W;}
      return[{keypoints:kp,score:sc}];
    }finally{if(box)box.dispose();if(bi)bi.dispose();if(cr)cr.dispose();if(out)out.dispose();inp.dispose();}
  }
  return{estimatePoses,reset};
}

function cocoToMp33(k17,invw,invh){
  const L=[];
  for(let i=0;i<33;i++) L[i]={x:0,y:0,score:0};
  for(const mpi of Object.keys(MP_MAP)){
    const ci=MP_MAP[mpi],p=k17[ci];
    L[+mpi]={x:p.x*invw,y:p.y*invh,score:p.score??1};
  }
  return L;
}
function inFrame(L,mode){
  const req=[11,12,23,24,25,26,27,28];
  for(const i of req){const p=L[i];if(p.x<0.05||p.x>0.95||p.y<0.05||p.y>0.95)return false;}
  if(mode==='PUSHUP'||mode==='PLANK'){
    const sy=(L[11].y+L[12].y)/2,hy=(L[23].y+L[24].y)/2;
    if(Math.abs(sy-hy)>0.15)return false;
  }
  return true;
}

/* ══════════════════════════════════════════════════════════
   APP STATE
══════════════════════════════════════════════════════════ */
let tf, model, runner, stream;
let appState = 'HOME';
let selIdx = 0, mode = 'SQUAT', menuOpen = false;
let counter = 0, stage = null, score = 0, feedback = '', uiColor = C.white;
let paused = false;
let kneeH=new Deque(5),elbowH=new Deque(5),bodyH=new Deque(5),trunkH=new Deque(5);
let stableStart=null,countStart=null,countStarted=false,calibrated=false;
let pushupGood=false,plankHold=0,plankStart=null,plankBad=0,situpBike=0;
let lastSpoken='',lastAudio=0;
let collectData=false,csvRows=[];
let history=[],sessionRec=[];
let situpMethod=1;
let lastFrameTime=0;

/* ══════════════════════════════════════════════════════════
   TTS / FIREBASE
══════════════════════════════════════════════════════════ */
function speak(t){
  if(!t||!window.speechSynthesis)return;
  try{const u=new SpeechSynthesisUtterance(t);u.rate=1;window.speechSynthesis.speak(u);}catch(e){}
}
function trySpeak(t){
  const now=Date.now();
  if(t&&(t!==lastSpoken||now-lastAudio>AUDIO_REPEAT_MS)&&now-lastAudio>AUDIO_MS){
    speak(t);lastSpoken=t;lastAudio=now;
  }
}
function saveFirebase(ex,reps,sc){
  const row={exercise:ex,reps,score:sc,timestamp:new Date().toISOString().slice(0,19).replace('T',' ')};
  sessionRec.push(row);
  fetch(FIREBASE_URL+'/workouts.json',{method:'POST',body:JSON.stringify(row),
    headers:{'Content-Type':'application/json'}}).catch(()=>{});
}
async function fetchHistory(){
  try{
    const r=await fetch(FIREBASE_URL+'/workouts.json');
    const d=await r.json();
    if(!d){history=[];return;}
    history=Object.values(d).sort((a,b)=>(a.timestamp||'').localeCompare(b.timestamp||'')).slice(-20);
  }catch(e){history=[];}
}

/* ══════════════════════════════════════════════════════════
   SCREEN NAVIGATION
══════════════════════════════════════════════════════════ */
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  $(id).classList.add('active');
}

function closeHomeDrawer(){
  const dr=$('home-drawer'),ov=$('home-drawer-overlay');
  if(dr)dr.classList.remove('open');
  if(ov)ov.classList.remove('show');
}

function relLast(ts){
  if(!ts)return '';
  const d=new Date(ts.replace(' ','T'));
  if(isNaN(+d))return '';
  const days=Math.floor((Date.now()-d)/864e5);
  if(days<=0)return 'TODAY';
  if(days===1)return '1 DAY AGO';
  return days+' DAYS AGO';
}

function renderRecommended(){
  const box=$('rec-scroll');
  if(!box)return;
  box.innerHTML='';
  const tags=['HIIT','STRENGTH','CORE','CARDIO','BALANCE'];
  const mins=['20 MIN','25 MIN','15 MIN','30 MIN','12 MIN'];
  EXERCISES.forEach((ex,i)=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='rec-card';
    b.innerHTML='<img src="'+IMAGE_ASSETS[ex.key]+'" alt="">'+
      '<div class="rec-card-body">'+
      '<div class="rec-tags"><span>'+tags[i%tags.length]+'</span><span class="g2">'+mins[i%mins.length]+'</span></div>'+
      '<div class="rec-name">'+(ex.label.toUpperCase())+'</div>'+
      '<div class="rec-sub">Focus: High intensity &amp; posture</div></div>';
    b.onclick=()=>{selIdx=i;navSelect();};
    box.appendChild(b);
  });
}

function initHeroImg(){
  const im=$('hero-img');
  if(im&&IMAGE_ASSETS.SQUAT)im.src=IMAGE_ASSETS.SQUAT;
}

async function navHome(){
  appState='HOME';
  closeHomeDrawer();
  showScreen('screen-home');
  /* Stop workout stream if still active */
  if(appState!=='WORKOUT'&&stream){
    stream.getTracks().forEach(t=>t.stop());
    stream=null;
  }
  document.querySelectorAll('.bn-tab').forEach(t=>{
    t.classList.toggle('on',t.id==='bn-dash');
  });
  initHeroImg();
  try{
    await fetchHistory();
    const n=history.length;
    const avgRep=n?history.reduce((a,h)=>a+(Number(h.reps)||0),0)/n:0;
    $('home-bpm').textContent=n?String(Math.round(118+Math.min(55,avgRep*1.1))):'—';
    const cal=n?history.reduce((a,h)=>a+(Number(h.reps)||0)*0.12+(Number(h.score)||0)*0.15,0):0;
    $('home-cal').textContent=n?(cal>=1000?(cal/1000).toFixed(1)+'K':String(Math.round(cal))):'—';
    const ha=$('hero-accuracy');
    if(ha){
      if(!n)ha.textContent='ACCURACY 98%';
      else{
        const avgSc=history.reduce((a,h)=>a+(Number(h.score)||0),0)/n;
        const pct=Math.min(99,Math.max(86,Math.round(90+avgSc/12)));
        ha.textContent='ACCURACY '+pct+'%';
      }
    }
    if(history.length){
      const last=history[history.length-1];
      const rel=relLast(last.timestamp)||(last.timestamp||'').slice(0,10);
      const exKey=last.exercise||'';
      const nice=EXERCISES.find(e=>e.key===exKey);
      const sub=nice?nice.label+' · '+(last.reps||0)+' reps':String(exKey||'Workout');
      $('home-last-block').innerHTML=
        '<div class="last-big">'+
        '<div class="lb-icon">🕐</div>'+
        '<div class="lb-label">LAST ACTIVITY</div>'+
        '<div class="lb-main">'+rel+'</div>'+
        '<div class="lb-sub">'+sub+'</div></div>';
    }else{
      $('home-last-block').innerHTML=
        '<div class="last-big"><div class="lb-icon">🕐</div><div class="lb-label">LAST ACTIVITY</div>'+
        '<div class="lb-main">NO SESSIONS YET</div><div class="lb-sub">Tap Start Workout to begin</div></div>';
    }
  }catch(e){
    $('home-bpm').textContent='—';
    $('home-cal').textContent='—';
    $('home-last-block').innerHTML=
      '<div class="last-big"><div class="lb-icon">🕐</div><div class="lb-label">LAST ACTIVITY</div>'+
      '<div class="lb-main">—</div><div class="lb-sub">Connect to load history</div></div>';
  }
}

function navSelect(){
  appState='SELECT'; showScreen('screen-select');
  renderSelect();
}

function navInstructions(){
  appState='INSTRUCTIONS'; showScreen('screen-instructions');
  renderInstructions();
}

function navWorkout(){
  appState='WORKOUT'; showScreen('screen-workout');
  startWorkout();
}

function navResult(ex,reps,sc){
  appState='RESULT'; showScreen('screen-result');
  $('result-ex-label').textContent=ex;
  $('result-reps').textContent=reps;
  $('result-score').textContent=sc;
  drawResultChart();
}

async function navProgress(){
  appState='PROGRESS'; showScreen('screen-progress');
  await fetchHistory();
  renderProgress();
}

/* ══════════════════════════════════════════════════════════
   HOME SCREEN
══════════════════════════════════════════════════════════ */
$('btn-home-start').onclick=()=>navSelect();
$('btn-home-progress').onclick=()=>navProgress();
$('btn-hamburger').onclick=()=>{
  $('home-drawer').classList.add('open');
  $('home-drawer-overlay').classList.add('show');
};
$('home-drawer-overlay').onclick=()=>closeHomeDrawer();
$('drawer-progress').onclick=()=>{closeHomeDrawer();navProgress();};
$('drawer-start').onclick=()=>{closeHomeDrawer();navSelect();};
$('btn-rec-all').onclick=()=>navSelect();
$('bn-dash').onclick=()=>navHome();
$('bn-work').onclick=()=>navSelect();
$('bn-analytics').onclick=()=>navProgress();
$('bn-profile').onclick=()=>{
  setStatus('Profile: coming soon');
  setTimeout(()=>setStatus(''),2400);
};
renderRecommended();

/* ══════════════════════════════════════════════════════════
   SELECT SCREEN
══════════════════════════════════════════════════════════ */
function renderSelect(){
  const list=$('card-list');
  list.innerHTML='';
  EXERCISES.forEach((ex,i)=>{
    const m=EX_META[ex.key];
    const thumb=IMAGE_ASSETS[ex.key]||'';
    const div=document.createElement('div');
    div.className='ex-card'+(i===selIdx?' sel':'');
    div.innerHTML=
      '<img class="ex-photo" src="'+thumb+'" alt="'+ex.label+'" loading="lazy" decoding="async">'+
      '<div class="ex-info">'+
        '<div>'+ 
          '<div class="ex-name">'+ex.label+'</div>'+ 
          '<div class="ex-cam"><span class="camera-pill">'+m.camText+'</span></div>'+ 
        '</div>'+ 
        '<div><span class="badge '+m.badge+'">'+m.icon+' '+(ex.label||'')+'</span></div>'+ 
      '</div>'+ 
      '<span class="ex-arrow">›</span>';
    div.onclick=()=>{selIdx=i;renderSelect();};
    div.ondblclick=()=>navInstructions();
    list.appendChild(div);
  });
}
$('sel-back').onclick=()=>navHome();
$('btn-sel-next').onclick=()=>navInstructions();

/* ══════════════════════════════════════════════════════════
   INSTRUCTIONS SCREEN
══════════════════════════════════════════════════════════ */
function renderInstructions(){
  const ex=EXERCISES[selIdx];
  const m=EX_META[ex.key];
  $('inst-ex-title').textContent=ex.label;
  $('inst-ex-name').textContent=ex.label;
  $('inst-icon').textContent=m.icon;
  $('inst-icon').style.background=m.bg;
  $('inst-cam-badge').className='badge '+m.badge;
  $('inst-cam-badge').textContent=m.camText;
  $('inst-cam-alert').textContent=m.camAlert;
  $('inst-photo').src=IMAGE_ASSETS[ex.key]||'';
  const tabs=$('inst-method-tabs');
  tabs.style.display=m.hasMethods?'flex':'none';
  if(m.hasMethods) situpMethod=1;
  renderSteps();
}
function renderSteps(){
  const ex=EXERCISES[selIdx];
  const m=EX_META[ex.key];
  let steps=m.steps||[];
  if(m.hasMethods){
    steps=m.methods[situpMethod].steps;
    $('tab-m1').className='method-tab'+(situpMethod===1?' active':'');
    $('tab-m2').className='method-tab'+(situpMethod===2?' active':'');
  }
  $('inst-steps').innerHTML=steps.map((s,i)=>
    '<div class="step-row">'+
      '<div class="step-num">'+(i+1)+'</div>'+
      '<div class="step-txt">'+s+'</div>'+
    '</div>'
  ).join('');
  $('inst-score').textContent='🏆 '+m.score;
}
window.switchMethod=function(n){situpMethod=n;renderSteps();};
$('inst-back').onclick=()=>navSelect();
$('btn-start-cam').onclick=()=>navWorkout();

/* ══════════════════════════════════════════════════════════
   WORKOUT SCREEN — setup
══════════════════════════════════════════════════════════ */
const video=$('cam'),canvas=$('cv'),ctx=canvas.getContext('2d');
const hudMode=$('hud-mode'),hudStatus=$('hud-status'),hudDot=$('hud-dot');
const hudReps=$('hud-reps'),hudScore=$('hud-score'),hudFb=$('hud-feedback');
const calLayer=$('cal-layer'),calTitle=$('cal-title'),calMsg=$('cal-msg');
const panelMenu=$('panel-menu'),menuEx=$('menu-exercises');
const menuHist=$('menu-history'),menuGuide=$('menu-guide');
const recDot=$('rec-dot'),btnData=$('btn-data');
const btnPause=$('btn-pause'),btnStop=$('btn-stop');

function updateWorkoutControls(){
  btnPause.textContent=paused?'Resume':'Pause';
  hudStatus.textContent=paused?'Paused':'Live';
  hudStatus.style.color=paused?C.red:C.green;
}

function togglePause(){
  paused=!paused;
  updateWorkoutControls();
  if(paused){
    hudFb.textContent='Workout paused';
    hudFb.style.color=C.gray;
    setStatus('Paused');
    speak('Workout paused');
  } else {
    hudFb.textContent='Resuming workout';
    hudFb.style.color=uiColor;
    setStatus('Live');
    speak('Resuming workout');
  }
}

function stopWorkout(){
  if(counter>0) saveFirebase(mode,counter,score);
  if(collectData){exportCSV();collectData=false;btnData.textContent='⏺ Record Data (CSV)';btnData.classList.remove('rec-on');recDot.style.display='none';}
  paused=false;
  updateWorkoutControls();
  menuOpen=false;panelMenu.classList.remove('open');
  navResult(mode,counter,score);
}

function layout(){
  const dpr=Math.min(2.5,window.devicePixelRatio||1);
  const w=window.innerWidth,h=window.innerHeight;
  canvas.style.width=w+'px';canvas.style.height=h+'px';
  canvas.width=Math.floor(w*dpr);canvas.height=Math.floor(h*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
}

function resetExercise(){
  counter=0;stage=null;score=0;feedback='';
  kneeH.clear();elbowH.clear();bodyH.clear();trunkH.clear();
  stableStart=null;countStart=null;countStarted=false;calibrated=false;
  pushupGood=false;plankHold=0;plankStart=null;plankBad=0;situpBike=0;
  lastSpoken='';lastAudio=0;
  if(runner) runner.reset();
}

async function startWorkout(){
  mode=EXERCISES[selIdx].key;
  paused=false;
  updateWorkoutControls();
  resetExercise();
  menuOpen=false; panelMenu.classList.remove('open');
  hudMode.textContent=mode;
  hudStatus.textContent='Live';
  layout();
  speak('Starting '+EXERCISES[selIdx].label);
  fetchHistory();

  /* ML models preloaded during app init — skip if already loaded */
  if(!model){
    setStatus('Waiting for model…');
    const maxWait=30000,start=Date.now();
    while(!model && Date.now()-start<maxWait) await new Promise(r=>setTimeout(r,100));
    setStatus('');
  }
  if(!stream){
    /* Request camera with 16:9 ratio to bypass iOS auto-zoom on front camera */
    let s;
    try{
      s=await navigator.mediaDevices.getUserMedia({
        video:{
          facingMode:'user',
          width:{ideal:1920,min:640},
          height:{ideal:1080,min:480},
          aspectRatio:{ideal:16/9}
        },
        audio:false,
      });
    }catch(e){
      try{
        s=await navigator.mediaDevices.getUserMedia({
          video:{facingMode:'user'},
          audio:false,
        });
      }catch(e2){
        s=await navigator.mediaDevices.getUserMedia({video:true,audio:false});
      }
    }
    stream=s;
    video.srcObject=s;
    video.onloadedmetadata=()=>{};
    await new Promise(r=>{
      const timeout=setTimeout(r,5000);
      video.onloadedmetadata=()=>{clearTimeout(timeout);r();};
    });
    await video.play().catch(()=>{});
  }
  if(!runner) runner=createRunner(tf,model,video);

  calLayer.style.display='flex';
  requestAnimationFrame(loop);
}

/* ══════════════════════════════════════════════════════════
   DRAW HELPERS
══════════════════════════════════════════════════════════ */
/* Map video pixel coords → canvas (mirrored like drawImage below): contain fit, letterbox. */
function drawSkeleton(k17,vw,vh,cw,ch,s,vx,vy,color){
  const sx=x=>cw-vx-x*s, sy=y=>vy+y*s;
  ctx.strokeStyle=color;ctx.lineWidth=3;ctx.lineCap='round';
  for(const[ia,ib]of EDGES){
    const a=k17[ia],b=k17[ib];
    if((a.score||0)<0.2||(b.score||0)<0.2)continue;
    ctx.beginPath();ctx.moveTo(sx(a.x),sy(a.y));ctx.lineTo(sx(b.x),sy(b.y));ctx.stroke();
  }
  ctx.fillStyle=color;
  for(const p of k17){
    if((p.score||0)<0.2)continue;
    ctx.beginPath();ctx.arc(sx(p.x),sy(p.y),4,0,Math.PI*2);ctx.fill();
  }
}

function drawBoundingBox(k17,vw,vh,cw,ch,s,vx,vy,color){
  const vis=k17.filter(p=>(p.score||0)>0.25);
  if(!vis.length)return;
  const sx=x=>cw-vx-x*s,sy=y=>vy+y*s;
  let mx=Infinity,my=Infinity,xx=-Infinity,xy=-Infinity;
  for(const p of vis){mx=Math.min(mx,p.x);my=Math.min(my,p.y);xx=Math.max(xx,p.x);xy=Math.max(xy,p.y);}
  const pad=20;
  const x1=sx(xx)+pad,y1=sy(my)-pad,x2=sx(mx)-pad,y2=sy(xy)+pad;
  ctx.strokeStyle=color;ctx.lineWidth=2;ctx.setLineDash([6,4]);
  ctx.strokeRect(Math.min(x1,x2),Math.min(y1,y2),Math.abs(x2-x1),Math.abs(y2-y1));
  ctx.setLineDash([]);
}

/* ══════════════════════════════════════════════════════════
   CALIBRATION
══════════════════════════════════════════════════════════ */
function updateCalibration(L,now){
  const ok=inFrame(L,mode);
  calLayer.style.display='flex';
  calTitle.textContent='GET READY — '+mode;
  if(!ok){
    stableStart=null;countStarted=false;
    calMsg.textContent='Step fully into the frame';calMsg.style.color=C.red;return false;
  }
  if(stableStart==null) stableStart=now;
  if(now-stableStart<2){calMsg.textContent='Hold still…';calMsg.style.color=C.white;return false;}
  if(!countStarted){countStarted=true;countStart=now;}
  const elapsed=Math.floor(now-countStart),count=3-elapsed;
  if(count>0){
    calMsg.textContent=String(count);
    calMsg.style.fontSize='clamp(48px,18vw,120px)';calMsg.style.color=C.green;
  }else{
    calMsg.textContent='GO!';calMsg.style.color=C.green;return true;
  }
  return false;
}

/* ══════════════════════════════════════════════════════════
   EXERCISE PROCESSING
══════════════════════════════════════════════════════════ */
function processExercise(L){
  const lm=i=>[L[i].x,L[i].y];
  uiColor=C.white; feedback='';

  /* ── SQUAT ───────────────────────────────────────────── */
  if(mode==='SQUAT'){
    const sl=lm(11),sr=lm(12),hl=lm(23),hr=lm(24),kl=lm(25),kr=lm(26),al=lm(27),ar=lm(28);
    const alr=ang(hl,kl,al),arr=ang(hr,kr,ar);
    kneeH.push((alr+arr)/2);const angle=kneeH.avg();
    const lean=(spineLean(sl,hl)+spineLean(sr,hr))/2;
    const fd=Math.abs(al[1]-ar[1]),ks=Math.abs(alr-arr);
    if(angle>165) stage='UP';
    if(stage==='UP'&&angle<95&&fd<0.06&&ks<25){
      stage='DOWN';counter++;score+=(angle>=70&&angle<=95&&lean<50)?10:5;uiColor=C.green;
    }
    const exL=lean>50&&angle<155;
    if(fd>0.08){feedback='Keep both feet level';uiColor=C.red;}
    else if(exL){feedback='Lean back — straighten up';uiColor=C.red;}
    else if(ks>30&&angle<155){feedback='Distribute weight evenly';uiColor=C.orange;}
    else if(angle>165){feedback='Go Down';uiColor=C.cyan;}
    else if(angle<65){feedback='Too Low — rise slightly';uiColor=C.orange;}
    else if(angle>=70&&angle<=95){feedback='Perfect Squat Depth!';uiColor=C.green;}
    else{feedback='Keep Going Down';uiColor=C.orange;}
    if(collectData&&csvRows.length<3000)
      csvRows.push({ex:mode,rep:counter,stage:stage||'NONE',k1:alr,k2:arr,lean,trunk:'',good:!exL&&fd<=0.08&&ks<=30});

  /* ── PUSH-UP ─────────────────────────────────────────── */
  }else if(mode==='PUSHUP'){
    const sl=lm(11),el=lm(13),wl=lm(15),sr=lm(12),er=lm(14),wr=lm(16);
    const hl=lm(23),hr=lm(24),al=lm(27),ar=lm(28);
    const erl=ang(sl,el,wl),err=ang(sr,er,wr);
    elbowH.push((erl+err)/2);const ea=elbowH.avg();
    const sm=[(sl[0]+sr[0])/2,(sl[1]+sr[1])/2],hm=[(hl[0]+hr[0])/2,(hl[1]+hr[1])/2];
    const am=[(al[0]+ar[0])/2,(al[1]+ar[1])/2];
    bodyH.push(ang(sm,hm,am));const ba=bodyH.avg();
    const hdiff=Math.abs(sm[1]-hm[1]);
    const str=ba>155,lev=hdiff<0.12,arms=((el[1]+er[1])/2)<((wl[1]+wr[1])/2)-0.03;
    if(ea>155&&lev&&arms){if(stage==='DOWN'){counter++;score+=pushupGood?10:5;uiColor=C.green;}stage='UP';}
    else if(stage==='UP'&&ea<90&&str&&lev){stage='DOWN';pushupGood=str;}
    if(!lev){feedback='Keep body horizontal';uiColor=C.red;}
    else if(!str){feedback='No sag — body straight';uiColor=C.red;}
    else if(!arms&&stage!=='DOWN'){feedback='Get into push-up position';uiColor=C.red;}
    else if(ea>155){feedback='Go Down';uiColor=C.cyan;}
    else if(ea<60){feedback='Too Low — rise slightly';uiColor=C.orange;}
    else if(stage==='DOWN'&&ea>=60&&ea<=90){feedback='Push Up!';uiColor=C.green;}
    else if(ea>=70&&ea<=90){feedback='Good Depth — Push Up!';uiColor=C.green;}
    else{feedback='Keep Going Down';uiColor=C.orange;}
    if(collectData&&csvRows.length<3000)
      csvRows.push({ex:mode,rep:counter,stage:stage||'NONE',k1:erl,k2:err,lean:'',trunk:ba,good:str&&lev&&arms});

  /* ── LUNGE ───────────────────────────────────────────── */
  }else if(mode==='LUNGE'){
    const sl=lm(11),sr=lm(12),hl=lm(23),hr=lm(24),kl=lm(25),kr=lm(26),al=lm(27),ar=lm(28);
    const alr=ang(hl,kl,al),arr=ang(hr,kr,ar);
    const frontRaw=Math.min(alr,arr),back=Math.max(alr,arr);
    kneeH.push(frontRaw);const fk=kneeH.avg();
    const lean=(spineLean(sl,hl)+spineLean(sr,hr))/2,kd=back-frontRaw;
    if(fk>155&&back>155) stage='UP';
    if(stage==='UP'&&fk<100&&kd>20){stage='DOWN';counter++;score+=lean<20?10:5;uiColor=C.green;}
    if(lean>30){feedback='Keep torso upright';uiColor=C.red;}
    else if(kd<20&&fk<140){feedback='Step further forward';uiColor=C.orange;}
    else if(stage==='UP'||fk>140){feedback='Lunge Down';uiColor=C.cyan;}
    else if(fk>=80&&fk<=100){feedback='Good Lunge Depth!';uiColor=C.green;}
    else if(fk<80){feedback='Too Low — rise slightly';uiColor=C.orange;}
    else{feedback='Keep Going Down';uiColor=C.orange;}
    if(collectData&&csvRows.length<3000)
      csvRows.push({ex:mode,rep:counter,stage:stage||'NONE',k1:alr,k2:arr,lean,trunk:'',good:lean<=30&&kd>=20});

  /* ── PLANK ───────────────────────────────────────────── */
  }else if(mode==='PLANK'){
    const sl=lm(11),el=lm(13),wl=lm(15),sr=lm(12),er=lm(14),wr=lm(16);
    const hl=lm(23),hr=lm(24),kl=lm(25),kr=lm(26),al=lm(27),ar=lm(28);
    const sm=[(sl[0]+sr[0])/2,(sl[1]+sr[1])/2],hm=[(hl[0]+hr[0])/2,(hl[1]+hr[1])/2];
    const am=[(al[0]+ar[0])/2,(al[1]+ar[1])/2];
    bodyH.push(ang(sm,hm,am));const ba=bodyH.avg();
    const hdiff=Math.abs(sm[1]-hm[1]);
    // Elevation check: shoulders must be above arm support (works for both plank types)
    const supY=Math.max((el[1]+er[1])/2,(wl[1]+wr[1])/2);
    const gap=supY-sm[1]; // positive = shoulders above elbows/wrists (elevated)
    const eAvg=(ang(sl,el,wl)+ang(sr,er,wr))/2;
    const torsoEl=eAvg<135?(gap>0.034):(gap>0.018);
    const legA=Math.min(ang(hl,kl,al),ang(hr,kr,ar));
    const legsStraight=legA>138;
    const str=ba>152,lev=hdiff<0.14;
    const good=str&&lev&&torsoEl&&legsStraight;
    const severe=!torsoEl||!legsStraight||ba<138||!lev;
    const now=performance.now()/1000;
    const GRACE=10;
    if(good){plankBad=0;if(plankStart==null)plankStart=now;}
    else{if(severe)plankBad=GRACE;else plankBad++;if(plankBad>=GRACE&&plankStart!=null){plankHold+=now-plankStart;plankStart=null;}}
    const total=plankHold+(plankStart!=null?now-plankStart:0);
    counter=Math.floor(total);score=counter;
    if(good){feedback='Hold the plank';uiColor=C.green;}
    else if(severe){
      if(!torsoEl){feedback='Lift up — off the floor';uiColor=C.red;}
      else if(!legsStraight){feedback='Straighten your legs';uiColor=C.red;}
      else if(!lev){feedback='Keep body horizontal';uiColor=C.red;}
      else{feedback='No sag — body straight';uiColor=C.red;}
    }else if(!lev){feedback='Keep body horizontal';uiColor=C.orange;}
    else if(!str){feedback='No sag — body straight';uiColor=C.orange;}
    else{feedback='Hold the plank';uiColor=C.orange;}
    if(collectData&&csvRows.length<3000)
      csvRows.push({ex:mode,rep:counter,stage:good?'HOLDING':'BREAK',k1:'',k2:'',lean:'',trunk:ba,good});

  /* ── SIT-UP ──────────────────────────────────────────── */
  }else if(mode==='SITUP'){
    const sl=lm(11),el=lm(13),sr=lm(12),er=lm(14);
    const hl=lm(23),hr=lm(24),kl=lm(25),kr=lm(26),al=lm(27),ar=lm(28);
    const sm=[(sl[0]+sr[0])/2,(sl[1]+sr[1])/2],hm=[(hl[0]+hr[0])/2,(hl[1]+hr[1])/2];
    const km=[(kl[0]+kr[0])/2,(kl[1]+kr[1])/2];
    const leanL=spineLean(sl,hl),leanR=spineLean(sr,hr),leanRaw=(leanL+leanR)/2;
    const trunkRaw=ang(sm,hm,km);
    kneeH.push(leanRaw);const smoothLean=kneeH.avg();
    trunkH.push(trunkRaw);const smoothTrunk=trunkH.avg();
    // Feet on floor: knee angle must be bent (not straight legs)
    const kal=ang(hl,kl,al),kar=ang(hr,kr,ar),kb=Math.min(kal,kar);
    const feet=kb>75&&kb<150;
    // Classic sit-up detection
    const classicSym=Math.abs(leanL-leanR)<30;

    if(smoothLean>60) stage='DOWN';

    // Classic detection
    const classicUp=stage==='DOWN'&&smoothLean<38&&smoothTrunk<82&&feet&&classicSym;
    if(classicUp){counter++;score+=smoothLean<28?10:5;uiColor=C.green;stage='UP';}
    // Feedback
    if(!feet&&smoothLean<62){feedback='Keep feet planted on floor';uiColor=C.red;}
    else if(smoothLean>60){feedback='Sit up!';uiColor=C.cyan;}
    else if(smoothLean<30){feedback='Great — lower with control';uiColor=C.green;}
    else if(stage==='UP'){feedback='Lower back down';uiColor=C.orange;}
    else{feedback='Keep curling up';uiColor=C.orange;}
    if(collectData&&csvRows.length<3000)
      csvRows.push({ex:mode,rep:counter,stage:stage||'NONE',k1:'',k2:'',lean:leanRaw,trunk:trunkRaw,good:smoothLean<36&&feet&&smoothTrunk<88});
  }
}

/* ══════════════════════════════════════════════════════════
   MAIN RENDER LOOP
══════════════════════════════════════════════════════════ */
async function loop(){
  if(appState!=='WORKOUT'){return;}
  requestAnimationFrame(loop);

  /* Check if stream is still active, recover if needed */
  try{
    if(!stream || !video.srcObject || video.readyState===0){
      const msg=!stream?'Stream lost':'Video not ready';
      console.warn(msg);
      setStatus(msg,true);

      if(!stream || video.readyState===0){
        /* Attempt to recover stream */
        if(stream){
          stream.getTracks().forEach(t=>t.stop());
          stream=null;
        }
        video.srcObject=null;
        calLayer.style.display='flex';
        await startWorkout();
        return;
      }
    }
  }catch(e){
    console.error('Stream check failed:',e);
  }

  const vw=video.videoWidth,vh=video.videoHeight;
  if(!vw||!vh){
    setStatus('Waiting for camera…',true);
    return;
  }

  const cw=canvas.width/(window.devicePixelRatio||1);
  const ch=canvas.height/(window.devicePixelRatio||1);
  /* object-fit: contain — show full camera frame without cropping. */
  const s=Math.min(cw/vw,ch/vh);
  const dw=vw*s,dh=vh*s;
  const vx=(cw-dw)/2,vy=(ch-dh)/2;

  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save();ctx.scale(window.devicePixelRatio||1,window.devicePixelRatio||1);
  ctx.fillStyle='#000';
  ctx.fillRect(0,0,cw,ch);
  ctx.save();ctx.translate(cw,0);ctx.scale(-1,1);
  ctx.drawImage(video,0,0,vw,vh,vx,vy,dw,dh);
  ctx.restore();

  let poses=[];
  try{poses=await runner.estimatePoses();}catch(e){console.warn('Pose estimation error:',e);}
  const now=performance.now()/1000;

  if(paused){
    hudDot.style.background='#64748b';
    hudFb.textContent='Paused';
    hudFb.style.color=C.gray;
    ctx.restore();
    return;
  }

  if(poses.length){
    const kp=poses[0].keypoints;
    const invw=1/vw,invh=1/vh;
    const L=cocoToMp33(kp,invw,invh);

    if(!calibrated){
      calibrated=updateCalibration(L,now);
      if(calibrated){calLayer.style.display='none';}
      // Draw bounding box during calibration
      const boxColor=inFrame(L,mode)?C.green:C.red;
      drawBoundingBox(kp,vw,vh,cw,ch,s,vx,vy,boxColor);
      drawSkeleton(kp,vw,vh,cw,ch,s,vx,vy,boxColor);
    }else{
      processExercise(L);
      drawSkeleton(kp,vw,vh,cw,ch,s,vx,vy,uiColor);
    }

    // HUD updates
    const dotC=uiColor===C.green?'#00ff88':uiColor===C.red?'#ff3344':'#ffffff';
    hudDot.style.background=dotC;
    hudReps.textContent=(mode==='PLANK'?'SECS ':'REPS ')+counter;
    hudScore.textContent='SCORE '+score;
    hudFb.textContent=feedback;
    hudFb.style.color=uiColor;
    trySpeak(feedback);
  }else{
    hudDot.style.background='#475569';
    hudFb.textContent=calibrated?'No pose detected':'Step into frame';
    hudFb.style.color=C.gray;
  }

  ctx.restore();
}

/* ══════════════════════════════════════════════════════════
   MENU
══════════════════════════════════════════════════════════ */
function buildMenu(){
  menuEx.innerHTML='';
  EXERCISES.forEach((ex,i)=>{
    const b=document.createElement('button');
    b.className='mex'+(ex.key===mode?' active':'');
    b.textContent=(i+1)+'. '+EX_META[ex.key].icon+' '+ex.label;
    b.onclick=()=>{
      if(counter>0) saveFirebase(mode,counter,score);
      mode=ex.key;selIdx=i;resetExercise();
      menuOpen=false;panelMenu.classList.remove('open');
      hudMode.textContent=mode;speak('Switching to '+ex.label);
    };
    menuEx.appendChild(b);
  });

  menuHist.innerHTML='';
  if(!history.length){
    menuHist.innerHTML='<div style="color:var(--dgray);font-size:.78rem">No records yet</div>';
  }else{
    history.slice().reverse().slice(0,5).forEach(r=>{
      const d=document.createElement('div');
      d.className='mhist';
      d.textContent=(r.exercise||'?').slice(0,8)+'  '+r.reps+'r  '+r.score+'pt';
      menuHist.appendChild(d);
    });
  }

  menuGuide.innerHTML=
    '<div class="mguide-h">Selection Screen</div>'+
    '<div class="mguide-r">Tap card to select · Double-tap to start</div>'+
    '<div class="mguide-h">During Workout</div>'+
    '<div class="mguide-r">MENU → switch exercise or end session<br>Record Data → CSV export<br>End Session → see results</div>'+
    '<div class="mguide-h">Camera Position</div>'+
    '<div class="mguide-r">Squat / Lunge → front-facing<br>Push-up / Plank / Sit-up → side view at floor level</div>'+
    '<div class="mguide-h">Scoring</div>'+
    '<div class="mguide-r">Good form = 10 pts · Partial = 5 pts<br>Plank = 1 pt per second</div>';
}

$('btn-menu').onclick=async()=>{
  menuOpen=!menuOpen;
  if(menuOpen){buildMenu();panelMenu.classList.add('open');}
  else{panelMenu.classList.remove('open');}
};
$('btn-pause').onclick=()=>togglePause();
$('btn-stop').onclick=()=>stopWorkout();

$('btn-close-menu').onclick=()=>{menuOpen=false;panelMenu.classList.remove('open');};

$('btn-data').onclick=()=>{
  collectData=!collectData;
  btnData.textContent=collectData?'⏹ Stop Recording':'⏺ Record Data (CSV)';
  btnData.classList.toggle('rec-on',collectData);
  recDot.style.display=collectData?'block':'none';
  speak(collectData?'Recording started':'Recording stopped');
};

$('btn-end-session').onclick=()=>{
  if(counter>0) saveFirebase(mode,counter,score);
  if(collectData){exportCSV();collectData=false;}
  menuOpen=false;panelMenu.classList.remove('open');
  navResult(mode,counter,score);
};

$('btn-back-menu').onclick=()=>{
  if(counter>0) saveFirebase(mode,counter,score);
  resetExercise();appState='SELECT';
  menuOpen=false;panelMenu.classList.remove('open');
  navSelect();
};

/* ══════════════════════════════════════════════════════════
   RESULT SCREEN
══════════════════════════════════════════════════════════ */
function drawResultChart(){
  const c=$('result-canvas'),x=c.getContext('2d');
  const dpr=window.devicePixelRatio||1;
  const W=Math.floor((c.getBoundingClientRect().width||300)*dpr);
  const H=120;
  c.width=W;c.height=H;
  x.setTransform(dpr,0,0,dpr,0,0);
  const cw=W/dpr;
  x.fillStyle='#0d0d16';x.fillRect(0,0,cw,H);
  if(!sessionRec.length){
    x.fillStyle='#475569';x.font='13px system-ui';x.fillText('No data this session',16,H/2+5);return;
  }
  const colors={SQUAT:'#00BFFF',PUSHUP:'#FF6633',LUNGE:'#00DD88',PLANK:'#CC88FF',SITUP:'#FFD700'};
  const n=sessionRec.length,bw=Math.max(12,(cw-40)/n-6),baseY=H-22;
  const maxVal=Math.max(1,...sessionRec.map(r=>Math.max(r.reps||0,(r.score||0)*0.15)));
  sessionRec.forEach((rec,i)=>{
    const col=colors[rec.exercise]||'#888';
    const cx=22+i*(bw+8);
    const h1=((rec.reps||0)/maxVal)*(H-44),h2=((rec.score||0)*0.15/maxVal)*(H-44);
    x.fillStyle=col;x.fillRect(cx,baseY-h1,bw*0.45,h1);
    x.globalAlpha=0.45;x.fillRect(cx+bw*0.47,baseY-h2,bw*0.45,h2);x.globalAlpha=1;
    x.fillStyle='#94a3b8';x.font='9px system-ui';
    x.fillText((rec.exercise||'').slice(0,4),cx,baseY+12);
  });
  // Legend
  x.font='9px system-ui';
  x.fillStyle='#64748b';x.fillRect(cw-70,H-16,8,8);x.fillStyle='#94a3b8';x.fillText('Reps',cw-60,H-9);
  x.globalAlpha=0.45;x.fillStyle='#64748b';x.fillRect(cw-30,H-16,8,8);x.globalAlpha=1;
  x.fillStyle='#94a3b8';x.fillText('Score',cw-20,H-9);
}

$('btn-result-again').onclick=()=>navSelect();
$('btn-result-progress').onclick=()=>navProgress();
$('btn-result-home').onclick=()=>navHome();

/* ══════════════════════════════════════════════════════════
   PROGRESS SCREEN
══════════════════════════════════════════════════════════ */
function renderProgress(){
  const colors={SQUAT:'#00BFFF',PUSHUP:'#FF6633',LUNGE:'#00DD88',PLANK:'#CC88FF',SITUP:'#FFD700'};

  // ── Chart ────────────────────────────────────────────────
  const c=$('prog-canvas'),x=c.getContext('2d');
  const dpr=window.devicePixelRatio||1;
  const W=Math.floor((c.getBoundingClientRect().width||300)*dpr);
  const H=160;
  c.width=W;c.height=H;
  x.setTransform(dpr,0,0,dpr,0,0);
  const cw=W/dpr,ch=H;
  x.fillStyle='#0d0d16';x.fillRect(0,0,cw,ch);

  if(!history.length){
    x.fillStyle='#475569';x.font='13px system-ui';x.fillText('No history yet',16,ch/2+5);
  }else{
    const byEx={};
    history.forEach(r=>{
      if(!byEx[r.exercise]) byEx[r.exercise]=[];
      byEx[r.exercise].push(r.score||0);
    });
    const maxSc=Math.max(1,...history.map(r=>r.score||0));
    const padL=32,padR=12,padT=14,padB=28;
    const pw=cw-padL-padR,ph=ch-padT-padB;
    // Grid lines
    x.strokeStyle='#1e293b';x.lineWidth=1;
    for(let i=0;i<=4;i++){
      const y=padT+ph*(1-i/4);
      x.beginPath();x.moveTo(padL,y);x.lineTo(cw-padR,y);x.stroke();
      x.fillStyle='#475569';x.font='9px system-ui';
      x.fillText(Math.round(maxSc*i/4),2,y+4);
    }
    Object.entries(byEx).forEach(([ex,scores])=>{
      const col=colors[ex]||'#888';
      x.strokeStyle=col;x.lineWidth=2;x.lineCap='round';x.lineJoin='round';
      x.beginPath();
      scores.forEach((sc,i)=>{
        const px2=padL+i/(Math.max(scores.length-1,1))*pw;
        const py=padT+ph*(1-sc/maxSc);
        i===0?x.moveTo(px2,py):x.lineTo(px2,py);
      });
      x.stroke();
      // Dots
      x.fillStyle=col;
      scores.forEach((sc,i)=>{
        x.beginPath();x.arc(padL+i/(Math.max(scores.length-1,1))*pw,padT+ph*(1-sc/maxSc),3,0,Math.PI*2);x.fill();
      });
    });
  }

  // ── Legend ───────────────────────────────────────────────
  const legend=$('prog-legend');
  legend.innerHTML='';
  const exInHistory=[...new Set(history.map(h=>h.exercise))];
  exInHistory.forEach(ex=>{
    const m=EX_META[ex];
    if(!m)return;
    const item=document.createElement('div');
    item.className='leg-item';
    item.innerHTML='<div class="leg-dot" style="background:'+colors[ex]+'"></div>'+m.icon+' '+m.label.slice(0,6);
    legend.appendChild(item);
  });

  // ── History list ─────────────────────────────────────────
  const hlist=$('prog-history');
  hlist.innerHTML='';
  if(!history.length){
    hlist.innerHTML='<div class="prog-empty">Complete your first workout to see progress here!</div>';
    return;
  }
  [...history].reverse().slice(0,15).forEach(r=>{
    const m=EX_META[r.exercise];
    const row=document.createElement('div');
    row.className='hist-row';
    row.innerHTML=
      '<div class="hist-left">'+
        '<div class="hist-ex">'+(m?.icon||'')+'&nbsp;'+(r.exercise||'?')+'</div>'+
        '<div class="hist-ts">'+(r.timestamp||'').slice(0,16)+'</div>'+
      '</div>'+
      '<div class="hist-right">'+
        '<div class="hist-reps">'+(r.reps||0)+' reps</div>'+
        '<div class="hist-sc">'+(r.score||0)+' pts</div>'+
      '</div>';
    hlist.appendChild(row);
  });
}

$('prog-back').onclick=()=>navHome();

/* ══════════════════════════════════════════════════════════
   CSV EXPORT
══════════════════════════════════════════════════════════ */
function exportCSV(){
  if(!csvRows.length)return;
  const header='exercise,rep,stage,knee_l,knee_r,spine_lean,trunk_angle,form_good';
  const body=csvRows.map(r=>[r.ex,r.rep,r.stage,r.k1,r.k2,r.lean,r.trunk,r.good].join(',')).join('\\n');
  const blob=new Blob([header+'\\n'+body],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download='session_'+Date.now()+'.csv';
  document.body.appendChild(a);a.click();
  document.body.removeChild(a);URL.revokeObjectURL(url);
  csvRows=[];
}

/* ══════════════════════════════════════════════════════════
   STATUS & LAYOUT
══════════════════════════════════════════════════════════ */
function setStatus(msg,err=false){
  const el=$('status');
  el.textContent=msg;el.className=err?'err':'';
}
window.addEventListener('resize',()=>{if(appState==='WORKOUT')layout();});

/* ══════════════════════════════════════════════════════════
   ML MODEL PRELOADING
══════════════════════════════════════════════════════════ */
async function initML(){
  try{
    if(!tf){
      setStatus('Loading TensorFlow.js…');
      tf=await new Promise(res=>{
        const s=document.createElement('script');
        s.src='https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js';
        s.onload=()=>res(window.tf);
        s.onerror=()=>{setStatus('Failed to load TensorFlow.js',true);};
        document.head.appendChild(s);
      });
    }
    if(!model){
      setStatus('Loading MoveNet model…');
      model=await tf.loadGraphModel(MOVENET_URL,{fromTFHub:true});
    }
    setStatus('');
  }catch(e){
    setStatus('ML loading failed',true);
  }
}

/* ══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════ */
navHome();
initML();
`;
