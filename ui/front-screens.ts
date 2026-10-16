import { achievements, achievementText, leaderboardName } from './achievements';
import { classData, enumData, GameMode, getClass } from '../src/core/data';
import { replacementSkillsAllowed, isSkillUnlocked } from '../src/core/progression';
import type { CosmeticSample } from '../src/core/cosmetics';
import type { GameEvent } from '../src/core/engine';
import type { GameSession } from './session';
import type { Assets } from './assets';
import type { I18n } from './i18n';
import type { GameAudio } from './sfx';
import type { StoragePort } from './storage';
import type { CanvasViewport } from './viewport';
import { classReward, helpCopy, raceDetails, raceRequirement } from './progression-help';
import { drawTutorialExample, tutorialExample } from './tutorial-examples';
import { type Screen, type ScreenInput, ScreenStack } from './screens';
import { text } from './board-view';
import { lines, wrap } from './widgets';
import { CharacterEditor, HelpQueue, helpRect, playerName, ScorePager, raceUnlocked, perkUnlocked } from './front-model';

export interface FrontServices {
  ctx:CanvasRenderingContext2D; session:GameSession; assets:Assets; i18n:I18n; audio:GameAudio; stack:ScreenStack; storage:StoragePort; view:CanvasViewport;
  preferences:{clock:boolean;dimming:boolean;smooth:boolean}; setPreference(key:'clock'|'dimming'|'smooth'):void;
  getMuted():boolean; toggleMuted():void;
  game():Screen;
}
export function createFront(s:FrontServices) {
  const {ctx,session,assets,i18n,audio,stack,storage,view}=s;
  const t=(k:string)=>i18n.t(k), tr=(v:string)=>i18n.source(v);
  // U03 temporary UI copy. Catalogue/art are deliberately read-only for this card.
  const copy=(zh:string,en:string)=>i18n.language==='zh'?zh:en;
  const h=(key:Parameters<typeof helpCopy>[1],params:Record<string,string|number>={})=>helpCopy(i18n,key,params);
  const help=new HelpQueue(storage), unlocks:{classId:number;after:number}[]=[];
  let nameInput:HTMLInputElement|undefined, nameOwner:Screen|undefined;
  let seed=Date.now()%1_000_000_000;
  const hasRun=()=>!['idle','ended'].includes(session.state.phase);
  const main=()=>stack.replace(new Main(),.3,.5);
  const safeSave=()=>session.save();
  type Button={id:string;label:string;x:number;y:number;w:number;h:number;enabled:boolean;selected:boolean;run:()=>void};
  class Panel implements Screen {
    buttons:Button[]=[]; pressed?:string;
    constructor(readonly id:string,readonly overlay=false){}
    enter(){} exit(){this.pressed=undefined;} update(_dt:number){} render(){}
    back(){stack.pop(.2);}
    background(title:string,subtitle=''){
      assets.ui.paint(ctx,'main.background',0,0,320,480);
      ctx.fillStyle='#100d18b8';ctx.fillRect(0,0,320,480);
      assets.ui.paint(ctx,'ui.panel',7,9,306,462);
      text(ctx,title,160,43,24,'#ffe3a0','center',280);
      if(subtitle)text(ctx,subtitle,160,66,12,'#c4b6cb','center',278);
      this.buttons=[];
    }
    button(id:string,label:string,x:number,y:number,w:number,h:number,run:()=>void,enabled=true,selected=false){
      this.buttons.push({id,label,x,y,w,h,run,enabled,selected});
      ctx.save();if(!enabled)ctx.globalAlpha*=.5;
      assets.ui.paint(ctx,'ui.button',x,y,w,h,this.pressed===id?'pressed':selected?'selected':'normal');
      if(selected){ctx.strokeStyle='#ffd77b';ctx.lineWidth=1;ctx.strokeRect(x+2,y+2,w-4,h-4);}
      text(ctx,label,x+w/2,y+h/2+4,12,enabled?'#fff0c9':'#b9adc2','center',w-10);ctx.restore();
    }
    footer(label=t('baked.26'),run=()=>this.back()){this.button('back',label,80,430,160,30,run);}
    input(e:ScreenInput){
      const b=this.buttons.find(b=>b.enabled&&e.x>=b.x&&e.x<b.x+b.w&&e.y>=b.y&&e.y<b.y+b.h);
      if(e.type==='down'){this.pressed=b?.id;if(b)audio.play(0,-1);}
      if(e.type==='cancel')this.pressed=undefined;
      if(e.type==='up'){const p=this.pressed;this.pressed=undefined;if(b&&p===b.id)b.run();}
    }
  }
  class Confirm extends Panel {
    constructor(readonly title:()=>string,readonly body:()=>string,readonly yes:()=>void,readonly destructive=false){super(destructive?'clear-confirm':'confirm',true);}
    override render(){
      ctx.fillStyle='#08060bbd';ctx.fillRect(0,0,320,480);this.buttons=[];
      if(!this.destructive){assets.ui.paint(ctx,'ui.panel',37,82,246,156);text(ctx,this.title(),160,115,16,'#ffe3a0','center',222);lines(ctx,this.body(),53,143,214,3);this.button('yes',t('baked.38'),212.94,196.04,49,22,()=>{stack.pop(0);this.yes();});this.button('no',t('baked.37'),59.04,198.04,40,18,()=>this.back());return;}
      assets.ui.paint(ctx,'ui.panel',10,126,300,232);
      text(ctx,this.title(),160,160,18,this.destructive?'#ffad8f':'#ffe3a0','center',268);
      lines(ctx,this.body(),30,191,260,7);
      this.button('yes',t('baked.38'),166,304,122,34,()=>{stack.pop(0);this.yes();});
      this.button('no',t('baked.37'),32,304,122,34,()=>this.back());
    }
    // MainMenu::Process: confirmation accepts on DOWN, unlike main buttons.
    override input(e:ScreenInput){if(e.type!=='down')return;const b=this.buttons.find(b=>e.x>=b.x&&e.x<b.x+b.w&&e.y>=b.y&&e.y<b.y+b.h);if(b){audio.play(0,-1);b.run();}}
  }
  function setup(challenge=false,tutorial=false){
    const go=()=>stack.replace(new Name(challenge?GameMode.MODE_SPRINT:GameMode.MODE_CLASSIC,tutorial),.3,.3);
    if(hasRun())stack.push(new Confirm(()=>t('abandon'),()=>t('baked.36'),go),.3);else go();
  }
  class Main extends Panel {
    constructor(){super('main');}
    override back(){}
    override render(){
      assets.ui.paint(ctx,'main.background',0,0,320,480);this.buttons=[];
      ctx.fillStyle='#160f2199';ctx.fillRect(0,0,320,76);
      text(ctx,t('baked.0'),160,43,29,'#ffe5a6','center',300);
      text(ctx,copy('地牢冒险','A dungeon, one chain at a time'),160,65,12,'#d6c4a0');
      // MainMenu ctor @0x53384; native hit rectangles overlap at their edges.
      this.button('continue',t('baked.1'),1,93.5,131,39,()=>{session.resume();stack.replace(s.game(),.3,0);},hasRun());
      this.button('new',t('baked.2'),1,148.5,144,39,()=>setup());
      this.button('challenge',t('baked.3'),1,178.5,142,39,()=>setup(true));
      this.button('tutorial',t('baked.4'),1,208,128,40,()=>stack.push(new HelpBook(true),.3));
      this.button('scores',t('baked.5'),1,256,97,41,()=>stack.replace(new Scores(),.3,.3),session.profile.highScores.some(p=>p.length>0));
      this.button('achievements',copy('成就','Achievements'),1,310,144,34,()=>stack.push(new Achievements(),.3));
      this.button('profile',copy('统计','Statistics'),1,353,144,34,()=>stack.push(new ProfileStats(),.3));
      this.button('settings',t('settings'),1,397,144,34,()=>stack.push(new Settings(),.2));
      this.button('sound',t(s.getMuted()?'baked.7':'baked.6'),s.getMuted()?170:178,440,s.getMuted()?147:139,40,()=>s.toggleMuted());
      if(session.error||session.storageError)lines(ctx,session.error??session.storageError!,154,362,153,5,'#ffb5af');
    }
  }
  class Name extends Panel {
    difficulty=1; editor=new CharacterEditor(session.profile); value=session.profile.playerName; failure='';
    constructor(public mode:number,readonly tutorial=false){super('name');if(tutorial)this.difficulty=0;}
    override enter(){
      nameInput=document.createElement('input');nameOwner=this;
      nameInput.id='player-name';nameInput.autocomplete='off';nameInput.maxLength=32;nameInput.value=this.value;
      nameInput.style.cssText='position:fixed;z-index:2;background:#211925;color:#ffe3a0;border:1px solid #b18d4f;border-radius:2px;text-align:center;outline-color:#ffe3a0';
      nameInput.addEventListener('input',()=>{this.value=playerName(nameInput!.value);nameInput!.value=this.value;});
      nameInput.addEventListener('keydown',e=>e.stopPropagation());document.body.append(nameInput);
    }
    override exit(){super.exit();nameInput?.remove();nameInput=undefined;nameOwner=undefined;}
    override back(){main();}
    start(){
      if(!this.editor.commit())return;
      Object.assign(session.profile.classes[this.editor.classId]!,this.editor.config);
      session.profile.playerName=playerName(this.value.trim());
      try{
        session.start({seed:seed++,classId:this.editor.classId,character:this.editor.config,difficulty:this.difficulty,mode:this.mode});
        if(this.tutorial)help.reset();else help.disable();
        stack.replace(new Intro(),.3,1);
      }catch(e){this.failure=String(e);}
    }
    override render(){
      this.background(t('baked.2'),copy('准备踏入地牢','Prepare to enter the dungeon'));
      text(ctx,copy('名字 · 最多16字','Name · up to 16 characters'),160,93,12,'#cfc0a6');
      this.button('mode',`${copy('模式','Mode')}: ${t(`mode.${this.mode}.name`)}`,26,151,268,38,()=>stack.push(new Modes(this),.3));
      text(ctx,copy('难度','Difficulty'),160,213,12,'#e9d19a');
      for(let n=0;n<4;n++)this.button(`difficulty-${n}`,t(`difficulty.${n}.name`),22+n*70,226,66,32,()=>this.difficulty=n,true,this.difficulty===n);
      if(this.difficulty===0)text(ctx,copy('简单模式不计大多数成就','Most achievements are disabled on Easy'),160,278,10,'#d6ad87','center',278);
      const id=this.editor.classId;assets.ui.paint(ctx,`ClassType.${id}`,28,297,52,52);
      this.button('class',`${tr('Class')}: ${t(`class.${id}.name`)}`,87,303,205,38,()=>stack.push(new Classes(this.editor),.2));
      text(ctx,`${tr('Race')}: ${t(`race.${this.editor.config.race}.name`)}`,160,369,12,'#cfc0b2');
      this.button('start',tr('Begin'),166,394,126,32,()=>this.start());
      this.button('back',t('baked.26'),28,394,126,32,()=>this.back());
      if(this.failure)text(ctx,this.failure,160,450,10,'#ffa78b','center',285);
    }
  }
  class Modes extends Panel {
    constructor(readonly owner:Name){super('mode');}
    override render(){
      this.background(copy('选择模式','Choose a mode'));
      [3,0,1].forEach((m,n)=>{
        const y=86+n*105;
        this.button(`mode-${m}`,t(`mode.${m}.name`),28,y,264,38,()=>this.owner.mode=m,true,this.owner.mode===m);
        lines(ctx,m===3?copy('积累资源，升级装备，挑战更深的地牢。','Collect resources, improve your equipment and survive.'):m===0?copy('在100回合内逃离地牢。','Escape the dungeon in 100 turns.'):copy('交叉连线，创造更多椒盐卷饼。','Cross your paths to create more pretzels.'),36,y+56,248,3);
      });this.button('back',t('confirm'),228,451,89,26,()=>this.back());
    }
  }
  class Classes extends Panel {
    tab=0; trait:'perks'|'flaws'='perks'; slot=1; skillSlot=1; poolPage=0; selectedSkill:number|undefined; inspectedRace:number|undefined; description='';
    readonly initialClass:number;
    constructor(readonly editor:CharacterEditor){super('class');this.initialClass=editor.classId;}
    override back(){if(this.editor.commit()){Object.assign(session.profile.classes[this.editor.classId]!,this.editor.config);safeSave();stack.pop(.2);}else{this.editor.select(this.initialClass);stack.pop(.2);}}
    icon(id:string,label:string,x:number,y:number,w:number,run:()=>void,locked=false,selected=false){
      this.button(id,'',x,y,w,44,run,true,selected);
      assets.ui.paint(ctx,id.includes(':')?id.split(':')[0]!:id,x+(w-34)/2,y+3,34,34,locked?'disabled':'normal');
      if(locked)assets.ui.paint(ctx,'ui.lock',x+w-17,y+27,15,15);
      text(ctx,label,x+w/2,y+55,10,locked?'#988e9f':'#ead8b3','center',w+5);
    }
    override render(){
      const e=this.editor,p=session.profile.classes[e.classId]!;
      this.background(t(`class.${e.classId}.name`),`${h('classLevel',{level:p.level})} · ${t('profile')} ${p.games} · ${copy('最佳','Best')} ${Math.max(...p.bestScores)}`);
      [tr('Class'),tr('Race'),tr('Perks & Flaws'),tr('Skills')].forEach((label,n)=>this.button(`tab-${n}`,label,15+n*73,80,71,30,()=>{this.tab=n;this.description='';this.inspectedRace=undefined;this.poolPage=0;},true,this.tab===n));
      if(this.tab===0){
        for(let n=0;n<10;n++)this.icon(`ClassType.${n}`,t(`class.${n}.name`),19+n%5*59,128+Math.floor(n/5)*77,47,()=>{e.select(n);this.description='';},session.profile.classes[n]!.level===0,e.classId===n);
        text(ctx,e.unlocked?copy('可用','Available'):copy('尚未解锁','Locked'),160,284,14,e.unlocked?'#b9d58b':'#e5ad81');
        lines(ctx,h('classHint'),25,309,270,5);
        this.button('unlock-help',h('unlockTitle'),22,388,132,30,()=>stack.push(new Details(()=>h('unlockBody')),.2));
        this.button('class-rewards',h('rewardsTitle'),166,388,132,30,()=>stack.push(new ClassRewards(e.classId),.2));
      }else if(this.tab===1){
        const race=this.inspectedRace??e.config.race;
        for(let n=0;n<10;n++)this.icon(`RaceType.${n}`,t(`race.${n}.name`),19+n%5*59,128+Math.floor(n/5)*77,47,()=>{e.setRace(n);this.inspectedRace=n;},!raceUnlocked(session.profile,n),e.config.race===n);
        lines(ctx,h(e.classId===0?'raceFixed':e.canRace?'raceChoose':'raceGate'),25,284,270,3,'#e5ba85');
        lines(ctx,raceRequirement(i18n,session.profile,race),25,332,270,3);
        this.button('race-details',h('raceDetails'),22,388,132,30,()=>stack.push(new Details(()=>raceDetails(i18n,session.profile,race)),.2));
        this.button('unlock-help',h('unlockTitle'),166,388,132,30,()=>stack.push(new Details(()=>h('unlockBody')),.2));
      }else if(this.tab===2){
        this.button('perks',copy('优点','Perks'),28,122,128,28,()=>this.trait='perks',true,this.trait==='perks');
        this.button('flaws',copy('缺点','Flaws'),164,122,128,28,()=>this.trait='flaws',true,this.trait==='flaws');
        for(let n=0;n<4;n++){
          const id=e.config[this.trait][n]!,unlocked=e.slotUnlocked(n),x=28+n*70;
          this.button(`slot-${n}`,'',x,165,54,42,()=>this.slot=n,true,this.slot===n);
          if(id!==255)assets.ui.paint(ctx,`${this.trait==='perks'?'PerkType':'FlawType'}.${id}`,x+8,169,34,34);
          if(!unlocked)assets.ui.paint(ctx,'ui.lock',x+36,191,14,14);
          text(ctx,n===0?copy('固定','Fixed'):`Lv ${[1,3,7,9][n]}`,x+27,222,10,'#d0bfa6');
        }
        for(let n=0;n<10;n++){
          const group=this.trait==='perks'?'perk':'flaw';
          this.icon(`${this.trait==='perks'?'PerkType':'FlawType'}.${n}`,t(`${group}.${n}.name`),19+n%5*59,241+Math.floor(n/5)*65,47,()=>{e.setTrait(this.trait,this.slot,n);this.description=t(`${group}.${n}.desc`);},!perkUnlocked(session.profile,n));
        }
        this.button('clear-slot',copy('清空槽位','Clear slot'),22,376,94,27,()=>e.setTrait(this.trait,this.slot,255),e.slotUnlocked(this.slot));
        text(ctx,copy('优点需搭配同槽缺点','Each perk needs a paired flaw'),210,394,10,'#d1bda2','center',170);
        if(this.description)this.button('details',copy('说明','Details'),244,405,52,22,()=>stack.push(new Details(()=>this.description),.2));
      }else{
        const pool=e.classId===0?e.pool:getClass(e.classId).baseSkillVector.map((k,n)=>e.config.replacementSkills[n]===255?k.value:e.config.replacementSkills[n]!);
        text(ctx,`${copy('已替换','Replaced')} ${e.replacementCount}/${replacementSkillsAllowed(e.level)}`,160,130,12,'#dec590');
        pool.slice(this.poolPage*20,this.poolPage*20+20).forEach((id,n)=>{
          const slot=this.poolPage*20+n,x=22+n%5*59,y=143+Math.floor(n/5)*46;
          this.button(`skill-slot-${slot}`,'',x,y,44,42,()=>{this.skillSlot=slot;this.description=t(`skill.${id}.desc`);},true,this.skillSlot===slot);
          assets.ui.paint(ctx,`SkillType.${id}`,x+5,y+3,34,34);
          if(e.classId===0||slot===0||!replacementSkillsAllowed(e.level))assets.ui.paint(ctx,'ui.lock',x+29,y+27,13,13);
        });
        if(e.classId===0)this.button('pool-page',`${this.poolPage+1}/${Math.ceil(pool.length/20)} >`,204,336,87,26,()=>this.poolPage=(this.poolPage+1)%Math.ceil(pool.length/20));
        this.button('replace-skill',copy('替换技能','Replace skill'),27,336,165,28,()=>stack.push(new SkillPicker(e,this.skillSlot),.2),e.classId!==0&&e.unlocked&&this.skillSlot>0&&replacementSkillsAllowed(e.level)>0);
        lines(ctx,this.description||copy('职业首个技能固定。其余替换数量随等级增加。','The first class skill is fixed. Replacement capacity grows with class level.'),25,384,270,3);
      }
      this.footer(e.unlocked?t('confirm'):t('baked.26'));
    }
  }
  class Details extends Panel {
    page=0;
    constructor(readonly body:()=>string){super('details',true);}
    override render(){
      const content=wrap(ctx,this.body(),268),count=Math.max(1,Math.ceil(content.length/19));
      this.page=Math.min(this.page,count-1);this.background(copy('说明','Details'),`${this.page+1} / ${count}`);
      content.slice(this.page*19,(this.page+1)*19).forEach((v,n)=>text(ctx,v,26,100+n*14,12,'#d2c9b5','left'));
      if(count>1){this.button('prev','<',22,388,54,30,()=>this.page--,this.page>0);this.button('next','>',244,388,54,30,()=>this.page++,this.page<count-1);}
      this.footer();
    }
  }
  class ClassRewards extends Panel {
    selected=1;
    constructor(readonly classId:number){super('class-rewards',true);}
    override render(){
      const level=session.profile.classes[this.classId]!.level;
      this.background(h('rewardsTitle'),`${t(`class.${this.classId}.name`)} · ${h('classLevel',{level})}`);
      for(let n=1;n<=(this.classId===0?1:10);n++)this.button(`reward-level-${n}`,String(n),22+(n-1)%5*56,92+Math.floor((n-1)/5)*42,52,34,()=>this.selected=n,true,this.selected===n);
      const earned=level>=this.selected;
      text(ctx,`${h('classLevel',{level:this.selected})} · ${h(earned?'earned':'future')}`,160,206,12,earned?'#b9d58b':'#e5ba85');
      lines(ctx,classReward(i18n,this.classId,this.selected),26,238,268,8);
      lines(ctx,h(this.classId===0?'adventurerNote':this.selected===10?'skillNote':'levelNote'),26,355,268,5);
      this.footer();
    }
  }
  class SkillPicker extends Panel {
    page=0; chosen=-1; message='';
    constructor(readonly editor:CharacterEditor,readonly slot:number){super('skill-picker');}
    override render(){
      this.background(copy('选择替换技能','Choose replacement skill'));
      classData.skills.slice(this.page*20,this.page*20+20).forEach((sk,n)=>{
        const id=sk.nativeId,x=23+n%5*59,y=85+Math.floor(n/5)*65,unlocked=isSkillUnlocked(this.editor.state,id);
        this.button(`pick-${id}`,'',x,y,44,44,()=>this.chosen=id,unlocked,this.chosen===id);
        assets.ui.paint(ctx,`SkillType.${id}`,x+5,y+4,34,34,unlocked?'normal':'disabled');
        if(!unlocked)assets.ui.paint(ctx,'ui.lock',x+30,y+29,14,14);
        text(ctx,t(`skill.${id}.name`),x+22,y+55,9,'#d9c6a8','center',56);
      });
      this.button('prev','<',23,348,42,28,()=>this.page--,this.page>0);
      this.button('next','>',255,348,42,28,()=>this.page++,this.page<2);
      this.button('restore',copy('还原','Restore'),75,348,80,28,()=>{this.editor.setSkill(this.slot,255);this.back();});
      this.button('apply',t('confirm'),165,348,80,28,()=>{if(this.editor.setSkill(this.slot,this.chosen))this.back();else this.message=copy('已达替换数量上限','Replacement limit reached');},this.chosen>=0);
      if(this.chosen>=0)this.button('skill-details',t(`skill.${this.chosen}.name`),26,382,268,24,()=>stack.push(new Details(()=>`${t(`skill.${this.chosen}.name`)}\n${t(`skill.${this.chosen}.desc`)}`),.2));
      if(this.message)text(ctx,this.message,160,421,12,'#f0bc8c','center',280);this.footer();
    }
  }
  class Intro extends Panel {
    story=Math.floor(audio.random.unit()*61);
    constructor(){super('intro');}
    override back(){this.begin();}
    begin(){audio.play(18,-1);stack.replace(s.game(),1,0);}
    override input(e:ScreenInput){if(e.type==='down'&&e.x>80&&e.x<240&&e.y>425.6)this.begin();}
    override render(){
      this.background(t('baked.0'));lines(ctx,t(`ui.intro.${this.story}`),24,89,272,23);
      this.button('begin',tr('Begin'),80,426,160,40,()=>this.begin());
    }
  }
  class HelpBook extends Panel {
    page=0;
    constructor(readonly tutorial=false){super(tutorial?'tutorial':'help-book',true);}
    override render(){
      this.background(t('baked.4'),`${this.page+1} / 23`);
      drawTutorialExample(ctx,assets,i18n,this.page);
      const content=wrap(ctx,this.page===0?h('tutorialStart'):t(`ui.help.${this.page}`),268);
      content.forEach((v,n)=>text(ctx,v,26,278+n*14,12,'#f0dfbf','left'));
      this.button('prev','<',22,388,54,30,()=>this.page--,this.page>0);
      this.button('next','>',244,388,54,30,()=>this.page++,this.page<22);
      if(this.tutorial)this.button('practice',copy('开始练习','Practice'),87,388,146,30,()=>{stack.pop(0);setup(false,true);});
      this.footer();
    }
  }
  class HelpBubble extends Panel {
    constructor(){super('help',true);}
    override exit(){super.exit();help.current=undefined;}
    override back(){help.clear();stack.pop(.2);}
    override render(){
      this.buttons=[];const q=help.current;if(!q)return;
      const content=wrap(ctx,t(`ui.help.${q.id}`),274),r=helpRect(q.y,content.length,q.offset);
      assets.ui.paint(ctx,'ui.panel',r.x,r.y,r.w,r.h);
      content.forEach((v,n)=>text(ctx,v,r.x+19.2,r.y+32+n*16,12,'#fff0cb','left'));
      this.buttons.push({id:'dismiss-help',label:t('close'),...r,enabled:true,selected:false,run:()=>stack.pop(.2)});
    }
    override input(e:ScreenInput){if(e.type==='down'){const b=this.buttons[0];if(b&&e.x>b.x&&e.x<b.x+b.w&&e.y>b.y&&e.y<b.y+b.h)b.run();}}
  }
  class Scores extends Panel {
    pager:ScorePager;
    constructor(page=session.profile.lastScoreIndices.findIndex(x=>x!==null)){super('scores');this.pager=new ScorePager(Math.max(0,page));}
    override back(){main();}
    override update(dt:number){this.pager.update(dt);}
    page(index:number){
      if(index<0||index>5)return;
      const title=leaderboardName(index,i18n);
      text(ctx,title,160,82,16,'#ffe3a0','center',246);
      const records=session.profile.highScores[index]!;
      for(let n=0;n<10;n++){
        const y=96+n*30,r=records[n],fresh=session.profile.lastScoreIndices[index]===n;
        ctx.fillStyle=fresh?'#66512e':n%2?'#2a2136':'#211b2d';ctx.fillRect(17,y,286,29);
        if(fresh){ctx.strokeStyle='#ffe09a';ctx.strokeRect(17.5,y+.5,285,28);}
        text(ctx,String(n+1),29,y+13,10,'#bfa77d');
        if(!r){text(ctx,'—',160,y+19,12,'#786b82');continue;}
        text(ctx,r.name||copy('无名冒险者','Adventurer'),44,y+12,11,'#eee0bd','left',125);
        text(ctx,String(r.score),208,y+12,12,fresh?'#ffe091':'#e6d4b3','right',67);
        text(ctx,`${t('turn')} ${r.turn}`,44,y+25,9,'#c2b3cb','left');
        if(index===5){
          text(ctx,`Avg ${r.xp/10}`,115,y+25,12,'#ceb8a4','left',61);
          text(ctx,`Max ${r.gold}`,178,y+25,12,'#ceb8a4','left',60);
          text(ctx,`Total ${r.upgrade}`,239,y+25,12,'#ceb8a4','left',62);
        }
        r.skills.forEach((id,k)=>{if(id!==null)assets.ui.paint(ctx,`SkillType.${id}`,224+k*18,y+2,16,16);});
      }
    }
    override render(){
      this.background(t('baked.5'));
      ctx.save();ctx.beginPath();ctx.rect(0,68,320,330);ctx.clip();
      for(const n of [this.pager.page-1,this.pager.page,this.pager.page+1]){ctx.save();ctx.translate((n-this.pager.page+this.pager.offset)*320,0);this.page(n);ctx.restore();}ctx.restore();
      this.button('prev','<',20,401,48,27,()=>this.pager.arrow(-1),this.pager.page>0);
      this.button('next','>',252,401,48,27,()=>this.pager.arrow(1),this.pager.page<5);
      text(ctx,`${this.pager.page+1} / 6`,160,420,12,'#dbc69b');this.button('back',t('main'),228,451,89,26,()=>this.back());
    }
    override input(e:ScreenInput){
      if(this.pager.target!==null)return;
      if(e.type==='down'&&e.y>=96&&e.y<396){this.pager.down(e.x);return;}
      if(this.pager.dragging){if(e.type==='move')this.pager.move(e.x);if(e.type==='up'||e.type==='cancel')this.pager.up(e.type==='cancel');return;}
      super.input(e);
    }
  }
  class Achievements extends Panel {
    page=0;
    constructor(){super('achievements');}
    override render(){
      const done=Object.values(session.profile.achievements).filter(v=>v===100).length;
      this.background(copy('成就','Achievements'),`${done} / 77`);
      const rows=achievements.slice(this.page*3,this.page*3+3);
      rows.forEach((a,n)=>{
        const value=session.profile.achievements[a.enumValue]??0,y=79+n*103;
        const row=achievementText(a,value,i18n);
        ctx.fillStyle=value===100?'#3b4030':'#241d30';ctx.fillRect(19,y,282,99);
        lines(ctx,row.title,27,y+16,266,2,'#ead8ac');
        const titleHeight=wrap(ctx,row.title,266).length*14;
        lines(ctx,row.description,27,y+19+titleHeight,266,3);
        ctx.fillStyle='#120d1e';ctx.fillRect(28,y+89,110,4);ctx.fillStyle='#bfa05c';ctx.fillRect(28,y+89,value*1.1,4);
        text(ctx,`${row.points} ${copy('分','pts')} · ${Math.floor(value)}%`,291,y+94,11,'#c3b3cc','right',147);
      });
      this.button('prev','<',22,399,48,27,()=>this.page--,this.page>0);this.button('next','>',250,399,48,27,()=>this.page++,this.page<25);
      text(ctx,`${this.page+1} / 26`,160,418,12,'#ddc99b');this.footer();
    }
  }
  class ProfileStats extends Panel {
    constructor(){super('profile-stats');}
    override render(){
      this.background(copy('统计','Statistics'),`${t('profile')} ${session.profile.classes.reduce((a,c)=>a+c.games,0)}`);
      session.profile.classes.forEach((c,n)=>{
        const y=82+n*31;assets.ui.paint(ctx,`ClassType.${n}`,24,y,25,25,c.level?'normal':'disabled');
        text(ctx,t(`class.${n}.name`),57,y+12,12,'#e6d2a5','left',101);
        text(ctx,`Lv ${c.level} · ${c.games} / ${c.kills} / ${Math.max(...c.bestScores)}`,294,y+17,10,'#c7b4ca','right',137);
      });text(ctx,copy('等级 · 局数 / 击杀 / 最佳分','Level · Games / Kills / Best score'),160,402,10,'#af9eae');
      // CheckEndGame @0x2f960: games/kills unconditional, bestScores only difficulties 1/2/3.
      text(ctx,t('ui.stats.easyNote'),160,420,10,'#d6ad87','center',282);this.footer();
    }
  }
  class Settings extends Panel {
    message='';
    constructor(){super('settings',true);}
    override render(){
      this.background(t('settings'));
      this.button('language',`${t('language')}: ${i18n.language==='zh'?'中文':'English'}`,28,80,264,32,()=>{i18n.setLanguage(i18n.language==='zh'?'en':'zh');document.documentElement.lang=i18n.language;});
      this.button('mute',t(s.getMuted()?'baked.7':'baked.6'),28,120,264,32,()=>s.toggleMuted());
      this.button('volume-down','−',28,160,46,30,()=>volume(-.1));this.button('volume-up','+',246,160,46,30,()=>volume(.1));
      text(ctx,`${t('volume')} ${Math.round(audio.volume*100)}%`,160,180,12,'#e6d2a5');
      (['clock','dimming','smooth'] as const).forEach((key,n)=>this.button(key,`${t('baked.'+{clock:28,dimming:29,smooth:27}[key])} ${s.preferences[key]?'✓':'—'}`,28,202+n*37,264,30,()=>s.setPreference(key),true,s.preferences[key]));
      this.button('animation-speed',copy('动画速度：','Animation speed: ')+ (session.timeline.speed==='fast'?copy('快速','Fast'):copy('原版','Original')),28,310,264,30,()=>session.setAnimationSpeed(session.timeline.speed==='fast'?'original':'fast'));
      this.button('reset-help',copy('重置帮助提示','Reset help tips'),28,346,126,32,()=>{help.reset();this.message=copy('帮助提示已重置','Help tips reset');});
      this.button('clear-profile',copy('清除档案','Clear profile'),166,346,126,32,()=>stack.push(new Confirm(()=>copy('清除档案？','Clear profile?'),()=>copy('删除当前对局、职业进度、成就和高分榜。','Delete the active run, class progress, achievements and scores.'),()=>stack.push(new Confirm(()=>copy('确认永久删除？','Permanently delete?'),()=>copy('此操作无法撤销。语言和声音等偏好将保留。','This cannot be undone. Language and sound preferences are kept.'),()=>{
        if(session.clearProfile()){help.reset();unlocks.length=0;stack.pop(0);main();}else this.message=session.storageError??t('error');
      },true),.3),true),.3));
      this.button('sound-style',t(`ui.audio.${audio.player.style}`),28,383,264,30,()=>audio.setStyle(audio.player.style==='original'?'synth':'original'));
      if(this.message)text(ctx,this.message,160,425,10,'#ffca97','center',280);this.footer();
    }
  }
  function volume(delta:number){audio.setVolume(Math.round(Math.max(0,Math.min(1,audio.volume+delta))*10)/10);try{storage.setItem('dungeonraid.volume',String(audio.volume));}catch{}}
  class Unlock extends Panel {
    constructor(readonly notice:{classId:number;after:number}){super('unlock',true);}
    override enter(){audio.play(12,-1);}
    override render(){
      const n=this.notice;this.background(copy('职业成长','Class progress'));
      assets.ui.paint(ctx,`ClassType.${n.classId}`,128,103,64,64);
      text(ctx,t(`class.${n.classId}.name`),160,205,23,'#ffe2a0');text(ctx,`${t('level')} ${n.after}`,160,235,16,'#e6cf9d');
      lines(ctx,n.after===1?tr(getClass(n.classId).unlockText.text):copy('新的配置选项已开放。下一局可在职业页面查看。','New configuration options are available for your next game.'),30,276,260,8);this.footer(t('confirm'));
    }
  }
  function observe(events:readonly GameEvent[],cosmetics:readonly CosmeticSample[]=[]){
    if(cosmetics.some(c=>c.kind==='label'&&c.labelType===0))help.request(1,210);
    for(const e of events){
      if(e.type==='NewGameStarted'){help.clear();unlocks.length=0;}
      if(e.type==='ClassLevelChanged')unlocks.push({classId:e.classId,after:e.after});
      if(e.type==='EffectQueued'&&e.effect.kind==='resource'){
        const ids:Record<number,number>={0:3,2:2,3:5,1:6};const id=ids[e.effect.tileType];
        const y=e.effect.targetSlot===null?210:79+(session.state.challenge?5:0)+(Math.floor(e.effect.targetSlot/6)+.5)*53;
        if(id!==undefined)help.request(id,y,true,26.5);
        if(e.effect.tileType===2)help.request(7,415);if(e.effect.tileType===3){help.request(11,405);help.request(12,445);}if(e.effect.tileType===1)help.request(13,463);
      }
      if(e.type==='EnemyAttack'&&e.attack>0){help.request(16,200);if(e.blocked>0)help.request(17,425);if(e.damage>0)help.request(18,443);}
      if(e.type==='EnemyDamaged'&&e.killed&&session.state.board[e.slot]?.enemyType)help.request(22,240);
      if(e.type==='ChainPreview'&&e.preview.effectiveLength>=3){
        const tiles=session.state.chain.nodes.map(n=>session.state.board[n]!);
        if(tiles.some(t=>t.type===4)&&!tiles.some(t=>t.type===1))help.request(4,210,true,26.5);
        if(tiles.some(t=>t.type===1)){help.request(8,210);help.request(9,437);help.request(10,437);}
      }
    }
  }
  return {
    main:()=>new Main(),settings:()=>new Settings(),help:()=>new HelpBook(),scores:(page?:number)=>new Scores(page),setup,observe,
    present(){
      if(stack.transitioning)return false;
      const notice=unlocks.shift();if(notice){stack.push(new Unlock(notice),.2);return true;}
      if(session.state.phase==='input'){
        help.request(0,240);
        if(session.state.health/(session.state.base.maxHealth+session.state.equipmentStats.maxHealth)<=.35)help.request(14,443);
        if(session.state.board.some(t=>t.type===1)){help.request(15,240);if(session.state.board.some(t=>t.type===1&&t.enemyType!==0))help.request(21,240);}
        session.state.skills.forEach(sk=>{if(sk?.active)help.request(20,33);else if(sk&&(sk.charge===sk.cooldown||sk.charge===0))help.request(19,33);});
      }
      if(help.next()){stack.push(new HelpBubble(),.2);return true;}return false;
    },
    syncDOM(){if(nameInput){nameInput.hidden=stack.top!==nameOwner||stack.transitioning;nameInput.setAttribute('aria-label',copy('玩家名字，最多16字','Player name, maximum 16 characters'));const v=view.value;Object.assign(nameInput.style,{left:`${v.x+28*v.width/320}px`,top:`${v.y+106*v.height/480}px`,width:`${264*v.width/320}px`,height:`${32*v.height/480}px`,fontSize:`${Math.max(16,14*v.width/320)}px`});}},
    snapshot(){const top=stack.top;return{tutorialPage:top instanceof HelpBook?top.page:undefined,tutorialExample:top instanceof HelpBook?tutorialExample(top.page):undefined,rewardPreview:top instanceof ClassRewards?{classId:top.classId,level:top.selected,description:classReward(i18n,top.classId,top.selected)}:undefined,detailsPage:top instanceof Details?top.page:undefined,detailsText:top instanceof Details?top.body():undefined,inspectedRace:top instanceof Classes?top.inspectedRace??top.editor.config.race:undefined,achievementPage:top instanceof Achievements?top.page:undefined,achievements:top instanceof Achievements?achievements.slice(top.page*3,top.page*3+3).map(a=>achievementText(a,session.profile.achievements[a.enumValue]??0,i18n)):undefined,helpBits:help.bits,helpQueue:help.queue.map(q=>q.id),helpId:help.current?.id,scorePage:top instanceof Scores?top.pager.page:undefined,scoreOffset:top instanceof Scores?top.pager.offset:undefined,classTab:top instanceof Classes?top.tab:undefined,configuration:top instanceof Classes?top.editor.config:undefined,settings:{...s.preferences,muted:s.getMuted(),volume:audio.volume}};},
  };
}
