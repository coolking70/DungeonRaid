import { achievements } from './achievements';
import { createFront } from './front-screens';
import { SettlementSequence } from './settlement';
import { SpecialTileType } from '../src/core/data';
import { hitTile } from '../src/core/chain';
import { canCastSkill } from '../src/core/skills';
import { getScore, scoreBreakdown } from '../src/core/scoring';
import { GameSession, isStuck, legalChain } from './session';
import { browserStorage } from './storage';
import { Assets, splashUrl } from './assets';
import { I18n } from './i18n';
import { GameAudio } from './sfx';
import { Heartbeat } from './effects';
import { drawHud, drawStatusStrip } from './hud';
import { TileInspection } from './tile-inspection';
import { Tooltip, lines } from './widgets';
import { candidateContent, equipmentName, equipmentLines, specialEnemyContent, enemyStatusLines, statsRows, trophyProgress, characterContent } from './content';
import { ScreenStack, type Screen, type ScreenInput } from './screens';
import { CanvasViewport } from './viewport';
import { boardState, enemyView, drawBoard, drawTokens, text } from './board-view';
import { boardTop } from './timeline';

export interface AppServices {
  session: GameSession; assets: Assets; i18n: I18n; audio: GameAudio; stack: ScreenStack;
  startNewGame(): void;
}
export type ScreenFactories = Partial<Record<'main'|'settings'|'help'|'game-over', (services: AppServices) => Screen>>;
/** U03 registers replacement screens without modifying rule/session/asset APIs. */
export async function mountApp(factories: ScreenFactories = {}) {
  document.body.innerHTML = '<canvas id="game" aria-label="Dungeon Raid" tabindex="0"></canvas>';
  document.body.className = 'game-app';
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!, ctx = canvas.getContext('2d')!;
  const storage = browserStorage(), audio = new GameAudio(storage), i18n = new I18n(storage), assets = new Assets();
  const session = new GameSession(storage, audio), stack = new ScreenStack(), view = new CanvasViewport(canvas);
  const t = (key: string) => i18n.t(key);
  const screen = (id: keyof ScreenFactories, fallback: () => Screen) => factories[id]?.({session,assets,i18n,audio,stack,startNewGame:()=>newRun()}) ?? fallback();
  let muted = storage.getItem('dungeonraid.muted') === 'true';
  let volume = Number(storage.getItem('dungeonraid.volume') ?? 1);
  if (!Number.isFinite(volume)) volume = 1;
  audio.setMuted(muted); audio.setVolume(volume);
  const splash=document.createElement('img');splash.src=splashUrl;splash.alt='Dungeon Raid';
  splash.style.cssText='position:fixed;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:3;pointer-events:none';
  if(new URLSearchParams(location.search).get('art')!=='redrawn')document.body.append(splash);
  await assets.load(i18n);splash.remove();
  const preferences = { clock: storage.getItem('dungeonraid.clock') === 'true', dimming: storage.getItem('dungeonraid.dimming') !== 'false', smooth: storage.getItem('dungeonraid.smooth') !== 'false' };
  const setPreference = (key: keyof typeof preferences) => { preferences[key] = !preferences[key]; try { storage.setItem(`dungeonraid.${key}`,String(preferences[key])); } catch {} };
  const tooltip = new Tooltip();
  const tr = (english: string) => i18n.source(english);

  type Button = { id: string; label: string; x: number; y: number; w: number; h: number; run: () => void; enabled: boolean; selected: boolean };
  class Panel implements Screen {
    buttons: Button[] = []; pressed?: string;
    constructor(readonly id: string, readonly overlay = false) {}
    enter() {} exit() { this.pressed = undefined; } update(_dt: number) {}
    render(_ctx: CanvasRenderingContext2D) {}
    background(title: string, subtitle?: string) {
      ctx.fillStyle = this.overlay ? '#100e1cf2' : '#191421'; ctx.fillRect(0, 0, 320, 480);
      assets.ui.paint(ctx,'ui.panel',10,10,300,460);
      text(ctx, title, 160, 74, 25, '#ead8a2');
      if (subtitle) text(ctx, subtitle, 160, 103, 11, '#b6a7c3', 'center', 280);
      this.buttons = [];
    }
    button(id: string, label: string, x: number, y: number, w: number, h: number, run: () => void, enabled = true, selected = false) {
      this.buttons.push({ id, label, x, y, w, h, run, enabled, selected });
      ctx.save(); ctx.globalAlpha *= enabled ? 1 : .4;
      // Semantic atlas lookup, with labelled rectangle fallback while A02 is absent.
      assets.ui.paint(ctx, 'ui.button', x, y, w, h, !enabled ? 'disabled' : this.pressed === id ? 'pressed' : selected ? 'selected' : 'normal');
      if (selected) { ctx.strokeStyle = '#e8c866'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2); }
      text(ctx, label, x + w / 2, y + h / 2 + 4, 12, '#f4eacf', 'center', w - 12); ctx.restore();
    }
    input(e: ScreenInput) {
      const hit = this.buttons.find(b => b.enabled && e.x >= b.x && e.x < b.x + b.w && e.y >= b.y && e.y < b.y + b.h);
      if (e.type === 'down') this.pressed = hit?.id;
      if (e.type === 'cancel') this.pressed = undefined;
      if (e.type === 'up') {
        const pressed = this.pressed; this.pressed = undefined;
        if (hit?.id === pressed) { audio.play(0, -1); hit?.run(); }
      }
    }
  }
  const toggleMuted=()=>{muted=!muted;audio.setMuted(muted);try{storage.setItem('dungeonraid.muted',String(muted));}catch{}};
  const front=createFront({ctx,session,assets,i18n,audio,stack,storage,view,preferences,setPreference,getMuted:()=>muted,toggleMuted,game:()=>new Game()});
  session.onEvents=(events,cosmetics)=>front.observe(events,cosmetics);
  const newRun=()=>front.setup();
  class GameMenu extends Panel {
    constructor() { super('game-menu', true); }
    override render() {
      ctx.fillStyle='#0009';ctx.fillRect(0,0,320,480);assets.ui.paint(ctx,'ui.panel',96,102,128,242);this.buttons=[];
      this.button('resume', t('baked.1'),116,123,89,26,()=>stack.pop(.2));
      this.button('sound',t(muted?'baked.7':'baked.6'),116,157,89,26,()=>{muted=!muted;audio.setMuted(muted);try{storage.setItem('dungeonraid.muted',String(muted));}catch{};});
      this.button('help',tr('Help'),116,185,89,26,()=>stack.push(screen('help',()=>front.help()),.2));
      this.button('clock',t('baked.28'),116,213,89,26,()=>setPreference('clock'),true,preferences.clock);
      this.button('dimming',t('baked.29'),116,241,89,26,()=>setPreference('dimming'),true,preferences.dimming);
      this.button('smooth',t('baked.27'),116,269,89,26,()=>setPreference('smooth'),true,preferences.smooth);
      this.button('main',t('main'),116,303,89,26,()=>{session.save();stack.pop(0);stack.replace(screen('main',()=>front.main()),.2,.5);});
    }
  }
  class Stats extends Panel {
    constructor() { super('stats', true); }
    override update(dt:number) { tooltip.update(dt); }
    override exit() { super.exit();tooltip.hide();tooltip.alpha=0; }
    override render() {
      ctx.fillStyle='#000a';ctx.fillRect(0,0,320,480);assets.ui.paint(ctx,'ui.panel',5,45,310,420);this.buttons=[];
      text(ctx,t('stats'),160,30,24,'#ffde92');const s=session.state;
      statsRows(i18n,s).forEach((row,n)=>{
        if(n===17){
          const progress=trophyProgress(i18n,s);
          text(ctx,row.label,23,384,11,'#ffde92','left',160);
          text(ctx,row.value,302,384,11,'#e3dcd0','right',110);
          this.buttons.push({id:'trophy-progress',label:row.label,x:18,y:370,w:289,h:28,enabled:true,selected:false,run:()=>tooltip.show(progress.label,progress.lines,160,375)});
          return;
        }
        const y=69+n*18;
        text(ctx,row.label,140,y,11,'#e3dcd0','left',130);
        text(ctx,row.value,302,y,11,row.boosted?'#80e899':'#e3dcd0','right',40);
      });
      s.equipment.forEach((item,n)=>{
        const x=n%2===0?23:80,y=63+Math.floor(n/2)*57;
        assets.ui.paint(ctx,'ui.slot',x,y,53,53);assets.items.draw(ctx,String(item.icon),x+2,y+2,49,49,'');
        this.buttons.push({id:`equipment-${n}`,label:equipmentName(i18n,item),x,y,w:53,h:53,enabled:true,selected:false,run:()=>tooltip.show(equipmentName(i18n,item),equipmentLines(i18n,item),x+54,y+26)});
      });
      assets.ui.paint(ctx,`ClassType.${s.character.classId}`,82,179,49,49);
      this.buttons.push({id:'character-details',label:characterContent(i18n,s).title,x:80,y:177,w:53,h:53,enabled:true,selected:false,run:()=>{
        const c=characterContent(i18n,s);tooltip.show(c.title,c.lines,135,203);
      }});
      lines(ctx,`${i18n.t(`race.${s.character.race}.name`)} ${i18n.t(`class.${s.character.classId}.name`)}`,23,251,110,3,'#ffde92');
      lines(ctx,`${t('score')} ${getScore(s)}`,23,306,110,2);
      this.button('close',t('close'),60,410,200,36,()=>stack.pop());tooltip.draw(ctx,assets);
    }
    override input(e:ScreenInput) { if(e.type==='down') tooltip.hide();super.input(e); }
  }
  class Reward extends Panel {
    slide=0; closing=false; focused=-1; confirmDown=false;
    constructor(immediate=false) { super('reward', true); if(immediate)this.slide=.3; }
    override enter() { const m=session.state.menus[0];if(m)audio.play(m.kind==='shop'?11:m.kind==='upgrade'?13:12,-1); }
    override exit() { tooltip.hide();tooltip.alpha=0;super.exit(); }
    override update(dt:number) {
      tooltip.update(dt);
      this.slide=Math.max(0,Math.min(.3,this.slide+(this.closing?-dt:dt)));
      if(this.closing&&this.slide===0) stack.pop(0);
    }
    override render() {
      const m=session.state.menus[0];if(!m && !this.closing)return;
      // Preserve selected menu during closing; rules may already have progressed.
      const menu=this.closing?this.previous!:m!;this.previous=menu;
      const p=this.slide/.3, offset=(1-p)*297;
      ctx.save();ctx.fillStyle=`rgba(0,0,0,${p*180/255})`;ctx.fillRect(0,0,320,480);ctx.translate(offset,0);
      assets.ui.paint(ctx,'ui.panel',23,90,294,308);this.buttons=[];
      ctx.shadowColor='#de9e38';ctx.shadowBlur=4;text(ctx,t(menu.kind==='level'?'baked.13':menu.kind==='shop'?'baked.14':'baked.15'),38,114,24,'#ffe6a1','left',270);ctx.shadowBlur=0;
      menu.candidates.forEach((c,n)=>{
        const y=123+n*57,content=candidateContent(i18n,c,session.state),selected=menu.selected.includes(n);
        // Native CursorInButton has a left bound and vertical bounds, no right bound.
        this.buttons.push({id:`candidate-${n}`,label:content.title,x:41,y,w:279,h:53,enabled:true,selected,run:()=>{}});
        assets.ui.paint(ctx,'foldout.option.base',41,y,53,53,selected?'selected':'normal');
        if(content.item) assets.items.draw(ctx,content.icon,43,y+2,49,49,'');else assets.ui.paint(ctx,content.icon,43,y+2,49,49);
        if(selected)assets.ui.paint(ctx,'ui.check',77,y+36,16,16);
        text(ctx,content.title,102,y+13,12,selected?'#ffdd79':'#fff0cf','left',201);
        lines(ctx,(content.summary??content.lines).join(' · '),102,y+29,201,2);
      });
      this.button('confirm',t('confirm'),41,351,53,35,()=>{},menu.selected.length>=(menu.kind==='level'?2:1));
      text(ctx,`${menu.selected.length}/${menu.kind==='level'?2:1}`,115,374,12,'#e4d5ad','left');
      ctx.restore();if(p===1)tooltip.draw(ctx,assets);
    }
    previous?: NonNullable<typeof session.state.menus[0]>;
    override input(e:ScreenInput) {
      if(this.slide<.3||this.closing)return;
      const m=session.state.menus[0];if(!m)return;
      const hit=this.buttons.find(b=>b.enabled&&e.x>b.x&&e.x<b.x+b.w&&e.y>b.y&&e.y<b.y+b.h);
      if(e.type==='cancel'){this.confirmDown=false;tooltip.hide();return;}
      if(e.type==='down') {
        tooltip.hide();
        if(hit?.id==='confirm'){this.confirmDown=true;audio.play(0,-1);return;}
        if(hit?.id.startsWith('candidate-')) {
          const n=Number(hit.id.split('-')[1]), content=candidateContent(i18n,m.candidates[n]!,session.state);
          const canSelect=m.kind!=='level'||m.selected.length<2||m.selected.includes(n);
          if(canSelect){audio.play(m.kind==='shop'?1:m.kind==='upgrade'?8:9,-1);session.dispatch({type:'SelectMenuItem',menuId:m.id,index:n});}
          this.focused=n;tooltip.show(content.title,content.lines,97,123+n*57);
        }
      }
      if(e.type==='up'&&this.confirmDown){this.confirmDown=false;if(hit?.id==='confirm') {
        this.previous=structuredClone(m);
        if(session.dispatch({type:'ConfirmMenu',menuId:m.id})){audio.play(m.kind==='shop'?11:m.kind==='upgrade'?13:12,-1);this.closing=true;tooltip.hide();}
      }}
    }
  }
  class GameOver extends Panel {
    sequence=new SettlementSequence(session.state,audio);
    constructor() { super('game-over'); }
    override enter(){audio.play(session.state.outcome?.won?12:33,-1);}
    override update(dt:number){this.sequence.update(dt);}

    override render() {
      const b = scoreBreakdown(session.state), o = session.state.outcome!;
      this.background(o.won ? t('baked.30') : t('over'), `${t('turn')} ${o.turn}`);
      text(ctx, String(this.sequence.counted), 160, 194, 48, o.won ? '#40e200' : '#e86f55');
      text(ctx, t('score'), 160, 223, 14);
      if(b.pretzel){
        const rating=b.pretzel.bestChainRating;
        if(rating>0)text(ctx,t(rating===3?'baked.32':rating===2?'baked.31':'baked.33'),160,248,12,'#ffde92');
        lines(ctx,`${tr('Average Length')} ${b.pretzel.averageTimes10/10} · ${tr('Max Length')} ${b.pretzel.maxCrosses} · ${tr('Total Pretzels')} ${b.pretzel.scoringChains}`,32,272,256,3);
      }else lines(ctx,`${tr('Experience')} ${b.contributions.xp} · ${tr('Gold')} ${b.contributions.gold} · ${tr('Upgrades')} ${b.contributions.upgrade}`,32,264,256,2);
      this.sequence.icons.slice(0,this.sequence.visible).forEach((icon,n)=>{const y=n<5?110:338,x=n<5?45+n*47:24+(n-5)*27,size=n<5?42:24;if(icon.atlas==='items')assets.items.draw(ctx,icon.id,x,y,size,size,'');else assets.ui.paint(ctx,icon.id,x,y,size,size);});
      text(ctx, session.storageError ?? t('saved'), 160, 324, 12, '#b6a7c3', 'center', 280);
      this.button('scores',t('baked.5'),60,370,200,36,()=>stack.replace(front.scores(),.3,.3));
      this.button('main',t('main'),60,416,200,36,()=>stack.replace(screen('main',()=>front.main()),.3,.5));
    }
  }
  class Game extends Panel {
    skipped = false; swallowSkip = false; dragging = false; lastSlot = -1; stuck = false; heartbeat=new Heartbeat(); hold=0; held=false; skillHold=-1; inspection=new TileInspection();
    constructor() { super('game'); }
    override exit() { super.exit(); this.cancel(); }
    cancel() {
      if (this.dragging) session.dispatch({ type: 'CancelChain' });
      this.dragging = false; this.lastSlot = -1; this.inspection.reset();
    }
    override update(dt: number) {
      session.update(dt);tooltip.update(dt);
      const shown=session.timeline.display;this.heartbeat.update(dt,shown.health/Math.max(1,shown.base.maxHealth+shown.equipmentStats.maxHealth),audio);
      if((this.dragging&&this.inspection.canShow(session.state.chain.nodes))||this.skillHold>=0){this.hold+=dt;if(this.hold>=.45&&!this.held){this.held=true;this.showTooltip();}}

      if (session.busy) return;
      if (session.state.phase === 'ended') { stack.replace(screen('game-over',()=>new GameOver()), 0, .3); return; }
      if (!this.dragging && front.present()) return;
      if (session.state.phase === 'menu') { stack.push(new Reward(this.skipped), 0); this.skipped=false; return; }
      this.skipped=false; this.stuck = isStuck(session.state);
    }
    override render() {
      const shownBoard = boardState(session.timeline);
      const s = { ...session.timeline.display, chain: shownBoard.chain, preview: shownBoard.preview };
      ctx.fillStyle = '#191421'; ctx.fillRect(0, 0, 320, 480); this.buttons = [];
      assets.ui.paint(ctx,'hud.top',0,0,320,73);
      for(let slot=0;slot<4;slot++) {
        const sk=s.skills[slot], x=6+59*slot, ready=!!sk&&!session.busy&&canCastSkill(session.state,slot);
        this.buttons.push({id:`skill-${slot}`,label:sk?i18n.t(`skill.${sk.id}.name`):t('empty'),x,y:6,w:53,h:53,enabled:ready,selected:false,run:()=>session.dispatch({type:'CastSkill',slot,source:'manual'})});
        if(assets.original)assets.ui.paint(ctx,'ui.slot',x,6,53,53,!sk?'disabled':sk.active||ready?'ready':'charging');
        if(sk){assets.ui.paint(ctx,`SkillType.${sk.id}`,x+2,8,49,49,'disabled');assets.ui.fill(ctx,`SkillType.${sk.id}`,x+2,8,49,49,sk.charge/Math.max(1,sk.cooldown),true);}
        if(!assets.original)assets.ui.paint(ctx,'ui.slot',x,6,53,53,!sk?'disabled':sk.active||ready?'ready':'charging');
        if(sk?.active){ctx.strokeStyle='#9696ff';ctx.lineWidth=3;ctx.strokeRect(x+2,8,49,49);}
        if(sk)text(ctx,sk.active?(i18n.language==='zh'?'生效':'Active'):`${sk.charge}/${sk.cooldown}`,x+26,54,12,sk.active?'#c7c7ff':'#fff');
      }
      this.button('menu',t('baked.22'),242,5,72,26,()=>{this.cancel();tooltip.hide();stack.push(new GameMenu());});
      this.button('stats',t('baked.21'),242,33,72,26,()=>{this.cancel();tooltip.hide();stack.push(new Stats());});
      drawStatusStrip(ctx,[`${t('turn')} ${s.turn}`,`${t('level')} ${s.level}`,`${t('score')} ${getScore(s)}`],
        preferences.clock?new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',hour12:false}):undefined);
      drawBoard(ctx,s,session.timeline,assets);
      if(preferences.dimming&&session.timeline.current?.events.some(e=>e.type==='EnemyAttack'&&e.attack>0)){ctx.fillStyle='#0008';ctx.fillRect(1,boardTop(s),318,318);}
      drawHud(ctx,s,assets,i18n,this.heartbeat.pulse);
      const hint = session.error ?? session.storageError ?? (this.stuck ? t('noMove') : s.chain.nodes.length ? `×${s.preview.effectiveLength}  ${t('damage')} ${s.preview.damage}  +${s.preview.leech} / -${s.preview.spikes}` : '');
      if (hint) { ctx.fillStyle = '#100e1de8'; ctx.fillRect(4, 370, 312, 27); text(ctx, hint, 160, 387, 10, '#fff0ba', 'center', 304); }
      drawTokens(ctx, session.timeline, assets);
      for(const effect of session.timeline.visuals) effect.draw(ctx,assets,i18n);
      tooltip.draw(ctx,assets);
    }
    override input(e: ScreenInput) {
      if (this.swallowSkip) { if(e.type==='up'||e.type==='cancel')this.swallowSkip=false; return; }
      if (e.type==='down' && session.busy) { session.skip(); this.skipped=true; this.dragging=false; this.lastSlot=-1; this.skillHold=-1; this.pressed=undefined; this.swallowSkip=true; tooltip.hide(); return; }
      if(e.type==='cancel'){this.cancel();this.skillHold=-1;tooltip.hide();super.input(e);return;}
      if(e.type==='down'){tooltip.hide();this.inspection.reset();this.hold=0;this.held=false;this.skillHold=e.y>=6&&e.y<59&&e.x>=6&&e.x<242?Math.floor((e.x-6)/59):-1;if(this.skillHold>=0)return;}
      if(this.skillHold>=0){if(e.type==='up'){const slot=this.skillHold;if(!this.held&&e.x>=6+slot*59&&e.x<59+slot*59&&e.y>=6&&e.y<59){if(canCastSkill(session.state,slot)){audio.play(0,-1);session.dispatch({type:'CastSkill',slot,source:'manual'});}else this.showTooltip();}this.skillHold=-1;}return;}

      if(this.dragging&&(e.type==='move'||e.type==='up')){
        const at=hitTile({x:(e.x-1)/53,y:(e.y-boardTop(session.state))/53});
        this.inspection.move(e.x,e.y,at?at.y*6+at.x:null);
        if(!this.inspection.allowed){tooltip.hide();tooltip.alpha=0;}
      }
      if (!this.dragging) super.input(e);
      if (e.y < boardTop(session.state) || e.y >= boardTop(session.state) + 318) {
        if (e.type === 'up' && this.dragging) this.release(); return;
      }
      if (session.busy || session.state.phase !== 'input') return;
      const at = hitTile({ x: (e.x - 1) / 53, y: (e.y - boardTop(session.state)) / 53 });
      if (e.type === 'down' && at) {
        const slot = at.y * 6 + at.x;
        if (session.state.board[slot]!.specialType === SpecialTileType.SPECIAL_TILE_TROPHY) { session.dispatch({ type: 'ClaimTrophy', slot }); return; }
        this.dragging = true; this.lastSlot = slot; this.inspection.begin(e.x,e.y,slot); session.dispatch({ type: 'SelectTile', at });
      } else if (e.type === 'move' && this.dragging && at && at.y * 6 + at.x !== this.lastSlot) {
        tooltip.hide();tooltip.alpha=0;this.lastSlot = at.y * 6 + at.x; session.dispatch({ type: 'SelectTile', at });
      } else if (e.type === 'up') this.release();
    }
    showTooltip() {
      const sk=session.state.skills[this.skillHold];
      if(this.skillHold>=0&&sk){tooltip.show(i18n.t(`skill.${sk.id}.name`),[i18n.t(`skill.${sk.id}.desc`),...(sk.active?[i18n.language==='zh'?'技能效果生效中。':'Skill effect is active.']:[]),...(sk.cooldown>0?[i18n.t('ui.skill.charge',{current:sk.charge,maximum:sk.cooldown})]:[])],6+59*this.skillHold,62);return;}
      const tile=session.state.board[this.lastSlot];if(!tile)return;
      const enemy=tile.type===1&&tile.enemyType!==0?specialEnemyContent(i18n,session.state,tile.enemyType):undefined;
      const title=tile.type===1?(enemy?.title??t('resource.sound.14.name')):tr(['Potion','Skull','Gold','Shield','Sword'][tile.type]??'');
      const v=enemyView(session.state,this.lastSlot), zh=i18n.language==='zh';
      const body=tile.type===1?[...(enemy?.lines??[zh?'普通骷髅。非新生且未冻结时参与敌人攻击。':'An ordinary skull. Attacks unless newly spawned or frozen.']),
        ...enemyStatusLines(i18n,v)]:[t('hint')];
      tooltip.show(title,body,27.5+tile.x*53,boardTop(session.state)+(tile.y+1)*53);
    }
    release() {
      if (!this.dragging) return;
      if(this.inspection.canShow(session.state.chain.nodes))this.showTooltip();
      else {tooltip.hide();tooltip.alpha=0;}
      this.inspection.reset();
      this.dragging = false; this.lastSlot = -1;
      session.dispatch({ type: session.state.preview.valid ? 'CommitChain' : 'CancelChain' });
    }
  }
  stack.push(screen('main',()=>front.main()), .51);
  const resize = () => view.resize(window.innerWidth, window.innerHeight);
  resize(); window.addEventListener('resize', resize);
  let pointer: number | undefined;
  for (const [dom, type] of [['pointerdown', 'down'], ['pointermove', 'move'], ['pointerup', 'up'], ['pointercancel', 'cancel'], ['lostpointercapture', 'cancel']] as const) {
    canvas.addEventListener(dom, (e: PointerEvent) => {
      if (type === 'down') { if (pointer !== undefined) return; pointer = e.pointerId; canvas.setPointerCapture(e.pointerId); }
      if (pointer !== e.pointerId) return;
      const point = view.point(e.clientX, e.clientY); if(!tooltip.input({type,...point})) stack.input({ type, ...point });
      if (type === 'up' || type === 'cancel') pointer = undefined;
    });
  }
  let lastTime = performance.now(), manual = false;
  const render = () => { ctx.save(); view.begin(ctx); stack.render(ctx);
    const notice = session.notices.current;
    if (notice !== undefined) {
      // Board starts at y=80; this strip stays wholly in the top HUD and never intercepts input.
      ctx.fillStyle='#221b30f5'; ctx.fillRect(4,2,312,53);
      ctx.strokeStyle='#ddba6b'; ctx.strokeRect(4.5,2.5,311,52);
      text(ctx,t('ui.achievement.unlocked'),12,17,10,'#ddba6b','left');
      const a=achievements.find(a=>a.enumValue===notice)!;
      lines(ctx,`${i18n.t(`achievement.${notice}.name`)} · ${a.gamerscore}`,12,33,296,2,'#fff0cb');
    }
    ctx.restore(); front.syncDOM(); };
  function update(dt: number) { stack.update(dt); if(!stack.paused)session.notices.update(dt); }
  let lastRender=0;
  const frame = (now: number) => {
    if (!manual) update(Math.min(.05, Math.max(0, (now - lastTime) / 1000)));
    lastTime = now; if(preferences.smooth||now-lastRender>=1000/30){render();lastRender=now;} requestAnimationFrame(frame);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stack.input({ type: 'cancel', x: -1, y: -1 }); session.save(); }
    stack.paused = document.hidden; lastTime = performance.now();
  });
  window.addEventListener('pagehide', () => session.save());
  window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'f') { if (document.fullscreenElement) void document.exitFullscreen(); else void canvas.requestFullscreen(); }
    if (e.key === 'Escape' && !stack.transitioning) {
      if (stack.top?.id === 'game') { stack.input({ type: 'cancel', x: -1, y: -1 }); stack.push(new GameMenu()); }
      else if ('back' in (stack.top??{})) (stack.top as Screen & {back():void}).back();
      else if (['settings', 'game-menu', 'stats', 'confirm', 'help'].includes(stack.top?.id ?? '')) stack.pop();
    }
  });
  const gameText = () => JSON.stringify({
    ...front.snapshot(), coordinates: '320x480; origin top-left; x right, y down', screen: stack.top?.id, stack: stack.ids, viewport: view.value,
    transitioning: stack.transitioning, busy: session.busy, paused: stack.paused, phase: session.state.phase, displayPhase: session.timeline.display.phase,
    turn: session.state.turn, health: session.timeline.display.health, score: getScore(session.state), language: i18n.language, heartbeat: stack.top instanceof Game ? stack.top.heartbeat.pulse : 0, tokens: session.timeline.tokens.filter(t=>!t.flight.done).length, visuals: session.timeline.visuals.map(e=>e.kind), audioError: audio.error,
    board: boardState(session.timeline).board.map((tile,slot) => ({ type: tile.type, enemy: tile.enemyType, hp: tile.health, ...enemyView(boardState(session.timeline),slot), selected: tile.selected, arrow:tile.arrow, magicSword:tile.magicSword, mana:tile.mana, acid:tile.acid, explosive:tile.explosive, broken:tile.broken })),
    buttons: (stack.top as Panel)?.buttons?.map(({ id, label, x, y, w, h, enabled }) => ({ id, label, x, y, w, h, enabled })),
    achievementNotice: session.notices.current ?? null, achievementQueue: session.notices.pending, soundStyle: audio.player.style, originalSamples: audio.player.sampleCount,
    animationSpeed: session.timeline.speed, tooltip: { showing: tooltip.showing, title: tooltip.title, body: tooltip.body, page:tooltip.page, pages:tooltip.pages, controls:tooltip.controls }, stats:stack.top?.id==='stats'?statsRows(i18n,session.state):undefined, menu: session.state.menus[0], skills: session.state.skills, outcome: session.state.outcome,
    games: session.profile.classes.reduce((n, c) => n + c.games, 0), error: session.error, storageError: session.storageError,
    art: assets.sheet.label, artTheme: assets.original?'original':'redrawn', atlases: { ui: assets.ui.status, items: assets.items.status },
  });
  Object.assign(window, {
    render_game_to_text: gameText,
    advanceTime(ms: number) { manual = true; for (let left = Math.max(0, ms / 1000); left > 0; left -= 1 / 60) update(Math.min(left, 1 / 60)); render(); },
    // Read-only QA snapshots. Browser tests still use real pointer/button actions.
    __dr: { get audioCounts(){return {calls:audio.calls,played:audio.played,byId:{...audio.counts}};}, get audio() { return structuredClone(audio.log); }, get state() { return structuredClone(session.state); }, get profile() { return structuredClone(session.profile); }, get busy() { return session.busy; }, get events() { return structuredClone(session.events); }, get legalChain() { return legalChain(session.state); } },
  });
  document.documentElement.lang = i18n.language; render(); requestAnimationFrame(frame);
}
