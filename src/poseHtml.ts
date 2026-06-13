/**
 * Full-screen WebView HTML — 6-screen fitness app with dark/neon design.
 * Screens: Home · Select · Instructions · Workout · Result · Progress
 * Script body injected from fitnessScriptBody.ts (avoids </script> in TS literal).
 */
import { FITNESS_SCRIPT_BODY } from './fitnessScriptBody';

const HTML_SHELL = (assets: Record<string, string>) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover"/>
<style>
/* ── DESIGN TOKENS ─────────────────────────────────────────────── */
:root{
  --t:env(safe-area-inset-top,0px);--b:env(safe-area-inset-bottom,0px);
  --l:env(safe-area-inset-left,0px);--r:env(safe-area-inset-right,0px);
  --pad:clamp(10px,min(4vw,20px),20px);
  --home-bottom-pad:calc(var(--b) + max(104px,18vmin));
  --bg:#000000;--bg2:#0a0a0a;--card:#121212;
  --bdr:#1f1f1f;--bdr2:#2b2b2b;
  --accent:#39ff14;--gold:#ccff00;--red:#ff3131;
  --orange:#ff8800;--cyan:#8cfffb;--purple:#cc88ff;
  --white:#f8fafc;--gray:#9ca3af;--dgray:#64748b;
  --fxl:clamp(1.35rem,min(5vw,1.75rem),1.75rem);
  --flg:clamp(1.05rem,min(4vw,1.25rem),1.35rem);
  --fmd:clamp(0.85rem,min(3.4vw,1rem),1.05rem);
  --fsm:clamp(0.74rem,min(2.9vw,0.88rem),0.92rem);
  --fxs:clamp(0.62rem,min(2.4vw,0.76rem),0.78rem);
}
/* ── RESET ──────────────────────────────────────────────────────── */
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none}
html{height:100%;height:100dvh;height:-webkit-fill-available}
html,body{margin:0;background:var(--bg);color:var(--white);
  font-family:system-ui,-apple-system,'Segoe UI',sans-serif;overflow:hidden}
body{
  min-height:100%;
  min-height:100dvh;
  min-height:-webkit-fill-available}
button{cursor:pointer;border:none;background:none;font-family:inherit;pointer-events:auto;touch-action:manipulation}
/* ── SCREEN SYSTEM ──────────────────────────────────────────────── */
.screen{display:none;flex-direction:column;position:fixed;inset:0;overflow:hidden;
  min-height:0;min-width:0;
  padding:calc(var(--t)+var(--pad)) calc(var(--pad)+var(--r))
          calc(var(--b)+var(--pad)) calc(var(--pad)+var(--l));
  background:var(--bg)}
.screen.active{display:flex}
#screen-workout{padding:0;background:#000}
/* ── COMMON UTILITIES ───────────────────────────────────────────── */
.scroll-area{flex:1;min-height:0;min-width:0;overflow-y:auto;-webkit-overflow-scrolling:touch;
  overflow-x:hidden;padding-right:2px;overscroll-behavior-y:contain;touch-action:pan-y}
/* Main scroll column inside fixed screens (header/footer stay put) */
.screen-body-scroll{flex:1;min-height:0;min-width:0;width:100%;max-width:100%;
  overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;
  overscroll-behavior-y:contain;touch-action:pan-y;padding-right:2px;
  padding-bottom:max(8px,var(--pad))}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;
  font-weight:700;border-radius:14px;font-size:var(--fmd);
  transition:opacity .15s;border:none;cursor:pointer;font-family:inherit;pointer-events:auto;touch-action:manipulation}
.btn:active{opacity:.72}
.btn-primary{background:var(--accent);color:#031a0c;min-height:52px;width:100%}
.btn-gold{background:var(--gold);color:#1a1200;min-height:52px;width:100%}
.btn-ghost{background:rgba(255,255,255,.06);color:var(--white);
  border:1px solid var(--bdr2);min-height:48px;width:100%}
.btn-danger{background:rgba(255,51,68,.12);color:var(--red);
  border:1px solid rgba(255,51,68,.35);min-height:44px;width:100%}
.back-btn{color:var(--gray);font-size:var(--fmd);padding:8px 0;
  display:flex;align-items:center;gap:5px;font-weight:600;flex-shrink:0;background:none;border:none;pointer-events:auto;touch-action:manipulation}
.page-title{font-size:var(--flg);font-weight:900;color:var(--gold);margin:0;flex:1}
.card{background:var(--card);border:1px solid var(--bdr);border-radius:16px}
.badge{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;
  border-radius:20px;font-size:var(--fxs);font-weight:700}
.badge-front{background:rgba(0,255,136,.1);color:var(--accent);border:1px solid rgba(0,255,136,.3)}
.badge-side{background:rgba(0,204,255,.1);color:var(--cyan);border:1px solid rgba(0,204,255,.3)}
.divider{height:1px;background:var(--bdr);margin:10px 0;flex-shrink:0}

/* ══ HOME SCREEN ════════════════════════════════════════════════ */
#screen-home{gap:0;padding:0;position:relative;z-index:2;pointer-events:auto}
#home-scroll{flex:1;min-height:0;min-width:0;overflow-y:auto;-webkit-overflow-scrolling:touch;
  padding:calc(var(--t)+var(--pad)) var(--pad) var(--home-bottom-pad) var(--pad);
  pointer-events:auto;touch-action:pan-y;overscroll-behavior-y:contain}
.home-top{display:flex;justify-content:space-between;align-items:center;
  flex-shrink:0;margin-bottom:14px;gap:10px}
#btn-hamburger{width:44px;height:44px;border-radius:12px;display:flex;flex-direction:column;
  justify-content:center;align-items:center;gap:5px;background:rgba(255,255,255,.06);
  border:1px solid var(--bdr2);flex-shrink:0;pointer-events:auto;touch-action:manipulation}
#btn-hamburger span{display:block;width:18px;height:2px;background:var(--white);border-radius:1px}
.app-logo{font-size:clamp(1rem,min(4.2vw,1.35rem),1.35rem);font-weight:900;letter-spacing:.06em;
  color:var(--white);text-align:center;flex:1}
.app-logo span{color:var(--accent)}
.home-avatar{width:40px;height:40px;border-radius:50%;
  background:linear-gradient(135deg,#1a2e20,#0a180c);
  border:2px solid var(--accent);display:flex;align-items:center;justify-content:center;
  font-size:1rem;flex-shrink:0;pointer-events:auto}
#home-drawer{position:fixed;top:0;left:0;bottom:0;width:min(86vw,280px);background:#0d0d10;
  z-index:100;transform:translateX(-100%);transition:transform .25s ease;border-right:1px solid var(--bdr);
  padding:calc(var(--t)+12px) 16px 20px;pointer-events:auto}
#home-drawer.open{transform:translateX(0)}
#home-drawer-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99;
  opacity:0;visibility:hidden;transition:opacity .2s;pointer-events:none}
#home-drawer-overlay.show{opacity:1;visibility:visible;pointer-events:auto}
.drawer-link{display:block;width:100%;text-align:left;padding:14px 12px;border-radius:12px;
  color:var(--white);font-weight:600;font-size:var(--fmd);margin-bottom:6px;
  background:rgba(255,255,255,.04);border:1px solid var(--bdr);pointer-events:auto;touch-action:manipulation}
.hero-visual{position:relative;border-radius:22px;overflow:hidden;margin-bottom:14px;
  width:100%;aspect-ratio:16/9;max-height:min(40vh,300px);
  background:#1a1a1a;border:1px solid rgba(57,255,20,.2);
  flex-shrink:0;pointer-events:none}
.hero-visual img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
  opacity:.85;display:block}
.hero-visual img{z-index:0}
.hero-badges{position:absolute;top:12px;left:12px;right:12px;z-index:1;
  display:flex;justify-content:space-between;pointer-events:none}
.hero-badge-l{font-size:10px;font-weight:800;letter-spacing:.12em;color:var(--accent);
  background:rgba(0,0,0,.55);padding:6px 10px;border-radius:8px}
.hero-badge-r{font-size:11px;font-weight:700;color:var(--white);background:rgba(0,0,0,.55);
  padding:6px 10px;border-radius:8px}
.hero-center{position:absolute;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;pointer-events:none}
.hero-icon{font-size:clamp(2rem,min(8vw,2.75rem),2.75rem);filter:drop-shadow(0 0 12px rgba(57,255,20,.6))}
.hero-bottom{position:absolute;bottom:0;left:0;right:0;z-index:1;padding:12px 14px;
  background:linear-gradient(transparent,rgba(0,0,0,.85));pointer-events:none}
.hero-bottom-t{font-size:10px;font-weight:700;color:var(--gray);letter-spacing:.08em;text-transform:uppercase}
.hero-bottom-b{font-size:clamp(.95rem,min(3.8vw,1.12rem),1.12rem);font-weight:900;color:var(--white);margin-top:4px}
.hero-dots{display:flex;gap:6px;justify-content:flex-end;margin-top:8px}
.hero-dots span{width:6px;height:6px;border-radius:50%;background:#333}
.hero-dots span.on{background:var(--accent)}
.home-ctas{display:flex;flex-direction:column;gap:10px;flex-shrink:0;margin-bottom:14px;pointer-events:auto}
.last-big{background:var(--card);border:1px solid var(--bdr);border-radius:16px;padding:16px;
  margin-bottom:12px;flex-shrink:0;pointer-events:none}
.last-big .lb-icon{font-size:1.25rem;margin-bottom:8px}
.last-big .lb-label{font-size:var(--fxs);color:var(--gold);font-weight:800;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px}
.last-big .lb-main{font-size:clamp(1.35rem,min(5vw,1.65rem),1.65rem);font-weight:900;color:var(--white)}
.last-big .lb-sub{font-size:var(--fsm);color:var(--gray);margin-top:6px}
.home-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;
  flex-shrink:0;margin-bottom:14px}
.stat-ico{font-size:1.1rem;margin-bottom:6px}
.rec-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-shrink:0}
.rec-title{font-size:var(--fxs);font-weight:800;letter-spacing:.1em;color:var(--white)}
.rec-all{color:var(--accent);font-size:var(--fxs);font-weight:700;background:none;border:none;padding:8px;pointer-events:auto;touch-action:manipulation}
.rec-scroll{display:flex;gap:12px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:8px;margin:0 -4px 14px;scroll-snap-type:x mandatory;pointer-events:auto;touch-action:pan-x}
.rec-card{flex:0 0 min(72vw,260px);scroll-snap-align:start;background:var(--card);border:1px solid var(--bdr);
  border-radius:16px;overflow:hidden;text-align:left;pointer-events:auto;touch-action:manipulation;
  font:inherit;color:inherit;padding:0}
.rec-card img{width:100%;height:120px;object-fit:cover;display:block}
.rec-card-body{padding:12px}
.rec-tags{display:flex;gap:6px;margin-bottom:8px}
.rec-tags span{font-size:10px;font-weight:700;padding:4px 8px;border-radius:6px;background:rgba(57,255,20,.12);color:var(--accent)}
.rec-tags span.g2{background:rgba(255,255,255,.08);color:var(--gray)}
.rec-name{font-weight:800;font-size:var(--fmd);color:var(--white);margin-bottom:4px}
.rec-sub{font-size:var(--fxs);color:var(--gray);line-height:1.4}
.bottom-nav{position:fixed;left:0;right:0;bottom:0;z-index:50;display:flex;justify-content:space-around;
  align-items:center;padding:8px 4px calc(var(--b)+8px);background:rgba(10,10,12,.96);
  border-top:1px solid var(--bdr);pointer-events:auto;touch-action:manipulation}
.bn-tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px;
  background:none;border:none;color:var(--dgray);font-size:10px;font-weight:700;pointer-events:auto;touch-action:manipulation;max-width:25%}
.bn-tab.on{color:var(--accent)}
.bn-tab svg,.bn-ic{width:22px;height:22px;display:block;opacity:.85}
.bn-tab.on .bn-ic{opacity:1}
.stat-card{background:var(--card);border:1px solid var(--bdr);border-radius:14px;padding:14px}
.stat-label{font-size:var(--fxs);color:var(--gray);margin-bottom:4px}
.stat-value{font-size:clamp(1.25rem,min(5.5vw,1.65rem),1.65rem);font-weight:900}
.stat-sub{font-size:var(--fxs);color:var(--dgray);margin-top:2px}
.home-last-label{font-size:var(--fxs);color:var(--dgray);text-transform:uppercase;
  letter-spacing:.06em;margin-bottom:8px;flex-shrink:0}
.last-row{background:var(--card);border:1px solid var(--bdr);border-radius:12px;
  padding:12px 14px;display:flex;align-items:center;justify-content:space-between}
.last-name{font-weight:700;font-size:var(--fsm)}
.last-meta{font-size:var(--fxs);color:var(--gray);margin-top:2px}
.last-time{font-size:var(--fxs);color:var(--dgray)}
.home-empty{text-align:center;color:var(--dgray);font-size:var(--fsm);
  padding:18px 0;line-height:1.5}

/* ══ SELECT SCREEN ═══════════════════════════════════════════════ */
.sel-header{display:flex;align-items:center;gap:8px;flex-shrink:0;margin-bottom:14px}
.ex-card{display:flex;align-items:center;gap:14px;padding:14px 16px;
  border-radius:18px;background:var(--card);border:1px solid var(--bdr);
  cursor:pointer;margin-bottom:12px;transition:border-color .15s,background .15s}
.ex-card.sel{border-color:var(--gold);background:rgba(255,215,0,.05)}
.ex-card:active{opacity:.8}
.ex-photo{width:clamp(72px,26vw,96px);height:clamp(72px,26vw,96px);border-radius:20px;
  object-fit:cover;flex-shrink:0;background:#131313;border:1px solid rgba(255,255,255,.05)}
.ex-info{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between;gap:8px}
.ex-name{font-weight:700;font-size:var(--fmd);color:var(--white)}
.ex-cam{font-size:var(--fxs);color:var(--gray);margin-top:0;display:flex;align-items:center;gap:5px}
.camera-pill{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;
  background:rgba(255,255,255,.04);color:var(--white);font-size:var(--fxs);font-weight:700}
.ex-arrow{color:var(--dgray);font-size:1.2rem;font-weight:700}
.sel.ex-arrow{color:var(--gold)}
.sel-footer{flex-shrink:0;margin-top:auto;padding-top:10px;display:flex;flex-direction:column;gap:8px}
.sel-card-list{padding-bottom:6px}

/* ══ INSTRUCTIONS SCREEN ═════════════════════════════════════════ */
.inst-hdr{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-shrink:0}
.inst-hero{background:var(--card);border:1px solid var(--bdr);border-radius:20px;
  padding:16px;margin-bottom:12px;flex-shrink:0}
.inst-photo{width:100%;max-width:100%;height:auto;border-radius:20px;object-fit:cover;
  margin-bottom:14px;max-height:min(38vh,240px)}
.inst-hero-row{display:flex;align-items:center;gap:14px;margin-bottom:10px}
.inst-icon{width:58px;height:58px;border-radius:15px;display:flex;align-items:center;
  justify-content:center;font-size:2rem;flex-shrink:0}
.inst-name{font-size:var(--flg);font-weight:900;color:var(--white);margin-bottom:5px}
.cam-alert{display:flex;align-items:center;gap:8px;background:rgba(0,204,255,.08);
  border:1px solid rgba(0,204,255,.22);border-radius:10px;padding:10px 12px;
  font-size:var(--fsm);color:var(--cyan);font-weight:600;margin-top:2px}
.method-tabs{display:flex;gap:8px;margin-bottom:10px;flex-shrink:0}
.method-tab{flex:1;padding:10px 6px;border-radius:10px;border:1px solid var(--bdr);
  background:var(--card);color:var(--gray);font-size:var(--fxs);font-weight:700;
  cursor:pointer;text-align:center;line-height:1.4;pointer-events:auto;touch-action:manipulation}
.method-tab.active{border-color:var(--gold);background:rgba(255,215,0,.07);color:var(--gold)}
.step-list{padding-bottom:8px}
.step-row{display:flex;gap:10px;margin-bottom:12px;align-items:flex-start}
.step-num{width:26px;height:26px;border-radius:50%;flex-shrink:0;
  background:rgba(0,255,136,.12);border:1px solid rgba(0,255,136,.3);
  color:var(--accent);font-size:var(--fxs);font-weight:800;
  display:flex;align-items:center;justify-content:center}
.step-txt{font-size:var(--fsm);color:var(--gray);line-height:1.55;padding-top:4px}
.score-pill{background:rgba(255,215,0,.07);border:1px solid rgba(255,215,0,.2);
  border-radius:10px;padding:10px 12px;font-size:var(--fxs);color:var(--gold);
  margin-top:4px;line-height:1.5}
.inst-footer{flex-shrink:0;margin-top:10px;display:flex;flex-direction:column;gap:8px}

/* ══ WORKOUT SCREEN ══════════════════════════════════════════════ */
#wrap{position:absolute;inset:0;pointer-events:none}
#cam{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;
  opacity:0;pointer-events:none;background:#000}
#cv{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;pointer-events:none}
.hud-top{position:absolute;top:0;left:0;right:0;z-index:5;
  padding:calc(var(--t)+10px) 14px 12px;
  background:linear-gradient(to bottom,rgba(9,9,13,.92),transparent);
  display:flex;align-items:center;gap:10px}
.hud-top>*{pointer-events:auto}
#hud-mode{font-weight:900;color:var(--gold);font-size:clamp(.85rem,3.2vw,1.05rem);
  flex:0 1 auto;min-width:0}
#hud-dot{width:12px;height:12px;border-radius:50%;background:var(--white);
  flex-shrink:0;margin-left:10px;transition:background .3s}
#hud-status{font-size:clamp(.7rem,2.5vw,.85rem);font-weight:700;color:var(--gray);text-transform:uppercase;letter-spacing:.08em;flex-shrink:0}
#hud-stats{text-align:right;line-height:1.25;flex-shrink:0}
#hud-reps{font-weight:800;font-size:clamp(.8rem,3vw,1rem);color:var(--white)}
#hud-score{font-size:clamp(.65rem,2.5vw,.82rem);color:var(--gray)}
#btn-menu,#btn-pause,#btn-stop{margin-left:6px;padding:8px 12px;border-radius:10px;
  border:1px solid var(--bdr2);background:rgba(30,41,59,.9);
  color:var(--gray);font-size:clamp(.65rem,2.4vw,.75rem);font-weight:700}
#btn-pause{width:82px}
#btn-stop{width:82px;color:var(--red);border-color:rgba(255,51,68,.35);background:rgba(255,51,68,.12)}
.hud-bottom{position:absolute;bottom:0;left:0;right:0;z-index:5;
  padding:12px 14px calc(var(--b)+12px);
  background:linear-gradient(to top,rgba(9,9,13,.9),transparent);
  text-align:center;pointer-events:none}
#hud-feedback{font-weight:700;font-size:clamp(.8rem,3.2vw,1rem)}
.inst-visual{background:rgba(255,255,255,.04);border:1px solid rgba(148,211,255,.12);border-radius:16px;padding:14px;margin-bottom:12px}
.inst-visual-title{font-size:var(--fmd);font-weight:800;color:var(--white);margin-bottom:6px}
.inst-visual-body{font-size:var(--fsm);color:var(--gray);line-height:1.6}
.inst-visual-flag{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:rgba(0,255,136,.08);color:var(--accent);font-size:var(--fxs);font-weight:700;margin-top:8px}

/* calibration */
#cal-layer{position:absolute;inset:0;z-index:15;display:none;flex-direction:column;
  align-items:center;justify-content:center;background:rgba(0,0,0,.48);padding:var(--pad)}
#cal-title{color:var(--gold);font-weight:800;font-size:clamp(.9rem,3.5vw,1.1rem);
  margin-bottom:10px;text-align:center}
#cal-msg{color:var(--white);font-weight:700;text-align:center;max-width:90vw}
/* menu panel */
#panel-menu{position:absolute;top:0;right:0;bottom:0;width:min(92vw,300px);
  background:rgba(12,12,18,.97);z-index:20;transform:translateX(100%);
  transition:transform .25s ease;border-left:1px solid var(--bdr);
  display:flex;flex-direction:column;padding-top:var(--t)}
#panel-menu.open{transform:translateX(0)}
#menu-scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 14px 6px}
.msec{color:var(--gold);font-weight:700;font-size:.76rem;
  margin:12px 0 6px;border-bottom:1px solid var(--bdr);padding-bottom:3px;
  text-transform:uppercase;letter-spacing:.06em}
#menu-exercises{display:flex;flex-direction:column;gap:6px}
.mex{text-align:left;padding:11px 12px;border-radius:10px;border:1px solid var(--bdr);
  background:#25252f;color:var(--gray);font-size:.85rem;cursor:pointer;width:100%;font-family:inherit}
.mex.active{border-color:var(--accent);background:#1a2e20;color:#86efac}
#menu-history{font-size:.8rem;color:var(--gray)}
.mhist{padding:5px 0;border-bottom:1px solid var(--bdr);font-size:.78rem}
.mguide-h{font-size:.72rem;color:var(--gold);font-weight:700;margin:6px 0 2px}
.mguide-r{font-size:.71rem;color:var(--dgray);line-height:1.55}
.menu-pin{padding:10px 14px calc(var(--b)+10px);border-top:1px solid var(--bdr);
  background:#0d0d16;flex-shrink:0;display:flex;flex-direction:column;gap:6px}
.menu-pin button{width:100%;padding:11px;border-radius:10px;border:1px solid var(--bdr2);
  background:#1e293b;color:var(--white);font-size:.78rem;font-weight:700;font-family:inherit;pointer-events:auto;touch-action:manipulation}
.menu-pin button.rec-on{border-color:var(--red);color:#fca5a5}
.menu-pin button.end-btn{background:rgba(255,51,68,.12);border-color:var(--red);color:var(--red)}
#rec-dot{display:none;position:absolute;bottom:calc(var(--b)+58px);right:14px;
  width:10px;height:10px;background:var(--red);border-radius:50%;z-index:8}

/* ══ RESULT SCREEN ═══════════════════════════════════════════════ */
.result-top{text-align:center;flex-shrink:0;margin-bottom:14px}
.result-exlabel{font-size:var(--fxs);color:var(--gray);text-transform:uppercase;
  letter-spacing:.1em;margin-bottom:4px}
.result-title{font-size:var(--flg);font-weight:900;color:var(--gold)}
.result-bigrow{display:grid;grid-template-columns:1fr 1fr;gap:12px;
  flex-shrink:0;margin-bottom:14px}
@media (max-width:380px){
  .result-bigrow{grid-template-columns:1fr}
}
.bigstat{background:var(--card);border:1px solid var(--bdr);border-radius:16px;
  padding:18px 10px;text-align:center}
.bigstat-label{font-size:var(--fxs);color:var(--gray);text-transform:uppercase;
  letter-spacing:.06em;margin-bottom:6px}
.bigstat-val{font-size:clamp(2rem,min(9vw,2.75rem),2.75rem);font-weight:900;line-height:1}
.bigstat-unit{font-size:var(--fxs);color:var(--dgray);margin-top:4px}
.result-chart-box{background:var(--card);border:1px solid var(--bdr);border-radius:14px;
  padding:14px;margin-bottom:14px;flex-shrink:0}
.chart-label{font-size:var(--fxs);color:var(--gray);font-weight:600;
  text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
#result-canvas{width:100%;height:120px;display:block;border-radius:8px}
.result-actions{display:flex;flex-direction:column;gap:9px;flex-shrink:0;padding-top:8px;padding-bottom:4px}

/* ══ PROGRESS SCREEN ═════════════════════════════════════════════ */
.prog-hdr{display:flex;align-items:center;gap:8px;flex-shrink:0;margin-bottom:12px}
.prog-chart-box{background:var(--card);border:1px solid var(--bdr);border-radius:14px;
  padding:14px;margin-bottom:12px;flex-shrink:0}
#prog-canvas{width:100%;height:160px;display:block;border-radius:8px}
.prog-legend{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:10px}
.leg-item{display:flex;align-items:center;gap:5px;font-size:var(--fxs);color:var(--gray)}
.leg-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.hist-row{background:var(--card);border:1px solid var(--bdr);border-radius:12px;
  padding:12px 14px;display:flex;align-items:center;justify-content:space-between;
  margin-bottom:8px}
.hist-left .hist-ex{font-weight:700;font-size:var(--fsm)}
.hist-left .hist-ts{font-size:var(--fxs);color:var(--dgray);margin-top:2px}
.hist-right{text-align:right}
.hist-reps{font-weight:800;color:var(--white);font-size:var(--fsm)}
.hist-sc{font-size:var(--fxs);color:var(--accent);font-weight:700}
.prog-empty{text-align:center;color:var(--dgray);font-size:var(--fsm);
  padding:28px 0;line-height:1.5}
#prog-history{padding-bottom:max(12px,var(--b))}
#screen-progress .screen-body-scroll{padding-bottom:4px}
@media (max-width:480px){
  .home-stats{grid-template-columns:1fr}
  .rec-scroll{gap:10px}
  .ex-card{gap:12px;padding:12px 14px}
  .hud-top{padding:calc(var(--t)+8px) 12px 10px}
  #hud-mode{font-size:clamp(.75rem,2.8vw,.9rem)}
  #hud-reps{font-size:clamp(.7rem,2.6vw,.9rem)}
  #hud-score{font-size:clamp(.55rem,2.2vw,.7rem)}
  .hud-bottom{padding:10px 12px calc(var(--b)+10px)}
  #hud-feedback{font-size:clamp(.7rem,2.8vw,.9rem)}
}
@media (min-width:400px){
  --pad:clamp(15px,min(5vw,25px),25px);
  .hero-visual{max-height:min(45vh,350px)}
}
@media (max-width:360px){
  .ex-card{gap:10px;padding:12px 14px}
  .bn-tab{font-size:9px;padding:6px 2px}
}

/* ── STATUS ─────────────────────────────────────────────────────── */
#status{position:fixed;left:8px;right:8px;bottom:calc(var(--b) + max(80px,15vmin));
  z-index:24;font-size:.73rem;color:var(--gray);text-align:center;pointer-events:none}
#status.err{color:#fca5a5}
</style>
</head>
<body>
<p id="status"></p>

<!-- ══════════════ HOME ══════════════════════════════════════════ -->
<div id="home-drawer-overlay" aria-hidden="true"></div>
<aside id="home-drawer" aria-hidden="true">
  <div style="font-weight:900;color:var(--accent);margin-bottom:16px;font-size:1.1rem">Menu</div>
  <button type="button" class="drawer-link" id="drawer-progress">View Progress</button>
  <button type="button" class="drawer-link" id="drawer-start">Start Workout</button>
</aside>
<div id="screen-home" class="screen active">
  <div id="home-scroll">
    <div class="home-top">
      <button type="button" id="btn-hamburger" aria-label="Menu"><span></span><span></span><span></span></button>
      <div class="app-logo">FIT<span>POSE</span> AI</div>
      <div class="home-avatar" aria-hidden="true">🏋</div>
    </div>
    <div class="hero-visual">
      <img id="hero-img" src="" alt="" />
      <div class="hero-badges">
        <span class="hero-badge-l">SENSORS ACTIVE</span>
        <span class="hero-badge-r" id="hero-accuracy">ACCURACY 98%</span>
      </div>
      <div class="hero-center"><span class="hero-icon">🧍</span></div>
      <div class="hero-bottom">
        <div class="hero-bottom-t">Current focus</div>
        <div class="hero-bottom-b">POSTURE ALIGNMENT</div>
        <div class="hero-dots"><span class="on"></span><span></span><span></span></div>
      </div>
    </div>
    <div class="home-ctas">
      <button type="button" class="btn btn-primary" id="btn-home-start">▶&nbsp;&nbsp;START WORKOUT</button>
      <button type="button" class="btn btn-ghost" id="btn-home-progress">📊&nbsp;&nbsp;VIEW PROGRESS</button>
    </div>
    <div id="home-last-block"></div>
    <div class="home-stats">
      <div class="stat-card">
        <div class="stat-ico">❤️</div>
        <div class="stat-label">AVG BPM</div>
        <div class="stat-value" id="home-bpm" style="color:var(--red)">—</div>
        <div class="stat-sub">session est.</div>
      </div>
      <div class="stat-card">
        <div class="stat-ico">🔥</div>
        <div class="stat-label">CALORIES</div>
        <div class="stat-value" id="home-cal" style="color:var(--accent)">—</div>
        <div class="stat-sub">total est.</div>
      </div>
    </div>
    <div class="rec-row">
      <span class="rec-title">RECOMMENDED FOR YOU</span>
      <button type="button" class="rec-all" id="btn-rec-all">VIEW ALL</button>
    </div>
    <div class="rec-scroll" id="rec-scroll"></div>
  </div>
  <nav class="bottom-nav" id="bottom-nav">
    <button type="button" class="bn-tab on" id="bn-dash" data-tab="dash">
      <span class="bn-ic" style="font-size:18px">▦</span>DASHBOARD
    </button>
    <button type="button" class="bn-tab" id="bn-work" data-tab="work">
      <span class="bn-ic" style="font-size:18px">🏋</span>WORKOUTS
    </button>
    <button type="button" class="bn-tab" id="bn-analytics" data-tab="analytics">
      <span class="bn-ic" style="font-size:18px">📊</span>ANALYTICS
    </button>
    <button type="button" class="bn-tab" id="bn-profile" data-tab="profile">
      <span class="bn-ic" style="font-size:18px">👤</span>PROFILE
    </button>
  </nav>
</div>

<!-- ══════════════ SELECT ════════════════════════════════════════ -->
<div id="screen-select" class="screen">
  <div class="sel-header">
    <button class="back-btn" id="sel-back">‹ Home</button>
    <div class="page-title">Choose Exercise</div>
  </div>
  <div class="screen-body-scroll">
    <div class="sel-card-list" id="card-list"></div>
  </div>
  <div class="sel-footer">
    <button class="btn btn-primary" id="btn-sel-next">Next: Instructions &nbsp;→</button>
  </div>
</div>

<!-- ══════════════ INSTRUCTIONS ══════════════════════════════════ -->
<div id="screen-instructions" class="screen">
  <div class="inst-hdr">
    <button class="back-btn" id="inst-back">‹ Back</button>
    <div class="page-title" id="inst-ex-title">Squat</div>
  </div>
  <div class="screen-body-scroll">
    <div class="inst-hero">
      <img id="inst-photo" class="inst-photo" src="" alt="Exercise illustration" />
      <div class="inst-hero-row">
        <div class="inst-icon" id="inst-icon"></div>
        <div style="flex:1;min-width:0">
          <div class="inst-name" id="inst-ex-name"></div>
          <span class="badge" id="inst-cam-badge"></span>
        </div>
      </div>
      <div class="cam-alert" id="inst-cam-alert"></div>
      <div class="inst-visual">
        <div class="inst-visual-title">Quick coaching guide</div>
        <div class="inst-visual-body">Keep your entire body visible in the frame, follow the camera direction hint, and move with controlled form. The app will track your posture, reps, and give live feedback.</div>
        <div class="inst-visual-flag">Good posture = better score</div>
      </div>
    </div>
    <div class="method-tabs" id="inst-method-tabs" style="display:none">
      <button class="method-tab active" id="tab-m1" onclick="switchMethod(1)">Method 1<br><small style="font-weight:400">Classic</small></button>
      <button class="method-tab" id="tab-m2" onclick="switchMethod(2)">Method 2<br><small style="font-weight:400">Bicycle</small></button>
    </div>
    <div class="step-list" id="inst-steps"></div>
    <div class="score-pill" id="inst-score"></div>
  </div>
  <div class="inst-footer">
    <button class="btn btn-gold" id="btn-start-cam">🎯&nbsp;&nbsp;Start &amp; Calibrate</button>
  </div>
</div>

<!-- ══════════════ WORKOUT ════════════════════════════════════════ -->
<div id="screen-workout" class="screen">
  <div id="wrap">
    <video id="cam" playsinline muted autoplay></video>
    <canvas id="cv"></canvas>
  </div>
  <div id="rec-dot"></div>
  <div class="hud-top">
    <span id="hud-mode">SQUAT</span>
    <span id="hud-status">Live</span>
    <span id="hud-dot"></span>
    <div class="hud-stats">
      <div id="hud-reps">REPS 0</div>
      <div id="hud-score">SCORE 0</div>
    </div>
    <button id="btn-pause">Pause</button>
    <button id="btn-stop">Stop</button>
    <button id="btn-menu">MENU</button>
  </div>
  <div class="hud-bottom"><span id="hud-feedback"></span></div>
  <div id="cal-layer">
    <div id="cal-title">GET READY</div>
    <div id="cal-msg">Step into frame</div>
  </div>
  <aside id="panel-menu">
    <div id="menu-scroll">
      <div class="msec">Exercises</div>
      <div id="menu-exercises"></div>
      <div class="msec">History</div>
      <div id="menu-history"></div>
      <div class="msec">User Guide</div>
      <div id="menu-guide"></div>
    </div>
    <div class="menu-pin">
      <button id="btn-data">⏺ Record Data (CSV)</button>
      <button id="btn-end-session" class="end-btn">⏹ End Session</button>
      <button id="btn-back-menu">‹ Exercise Select</button>
      <button id="btn-close-menu">✕ Close Menu</button>
    </div>
  </aside>
</div>

<!-- ══════════════ RESULT ════════════════════════════════════════ -->
<div id="screen-result" class="screen">
  <div class="screen-body-scroll">
    <div class="result-top">
      <div class="result-exlabel" id="result-ex-label">SQUAT</div>
      <div class="result-title">Session Complete 🎉</div>
    </div>
    <div class="result-bigrow">
      <div class="bigstat">
        <div class="bigstat-label">Reps</div>
        <div class="bigstat-val" id="result-reps" style="color:var(--accent)">0</div>
        <div class="bigstat-unit">completed</div>
      </div>
      <div class="bigstat">
        <div class="bigstat-label">Score</div>
        <div class="bigstat-val" id="result-score" style="color:var(--gold)">0</div>
        <div class="bigstat-unit">points</div>
      </div>
    </div>
    <div class="result-chart-box">
      <div class="chart-label">This Session</div>
      <canvas id="result-canvas" width="360" height="120"></canvas>
    </div>
    <div class="result-actions">
      <button class="btn btn-primary" id="btn-result-again">↺&nbsp;&nbsp;Another Exercise</button>
      <button class="btn btn-ghost" id="btn-result-progress">📊&nbsp;&nbsp;View Progress</button>
      <button class="btn btn-ghost" id="btn-result-home">⌂&nbsp;&nbsp;Home</button>
    </div>
  </div>
</div>

<!-- ══════════════ PROGRESS ══════════════════════════════════════ -->
<div id="screen-progress" class="screen">
  <div class="prog-hdr">
    <button class="back-btn" id="prog-back">‹ Home</button>
    <div class="page-title">Progress</div>
  </div>
  <div class="screen-body-scroll">
    <div class="prog-chart-box">
      <div class="chart-label">Score Over Time</div>
      <canvas id="prog-canvas" width="360" height="160"></canvas>
      <div class="prog-legend" id="prog-legend"></div>
    </div>
    <div class="chart-label" style="flex-shrink:0;margin-bottom:8px">Recent Sessions</div>
    <div id="prog-history"></div>
  </div>
</div>`

const HTML_CLOSE = '<' + '/script></body></html>';
const SCRIPT_OPEN = '<script type="module">\n';

export const getPoseHtml = (assets: Record<string,string>) =>
  HTML_SHELL(assets) +
  SCRIPT_OPEN +
  'const IMAGE_ASSETS =' + JSON.stringify(assets) + ';\n' +
  FITNESS_SCRIPT_BODY +
  HTML_CLOSE;
