import { enumValue, TileType } from '../src/core/data';
import { emptyTile } from '../src/core/state';
import type { Assets } from './assets';
import type { I18n } from './i18n';
import { text, tileUV } from './board-view';
import { drawArrow } from './arrow';
import { helpCopy, type HelpCopyKey } from './progression-help';
import { wrap } from './widgets';

/** Scripted read-only illustrations for native helpText[0..22]. Not native screenshots.
 * Render through the live atlas APIs and tileUV, so art replacement follows the game.
 * All positions below are local to one 272×170 illustration; no screen/atlas pixel copies.
 * Values are illustrative snapshots, never random draws or mutations of the live run. */
const demoSkill=enumValue('SkillType','SKILL_BOOST_DMG');
const {TILE_COIN:coin,TILE_SWORD:sword,TILE_SKULL:skull,TILE_SHIELD:shield}=TileType;
const captions:readonly HelpCopyKey[]=['chain','bonus','gold','heal','swords','shields','xp','shop','damage','base','weapon','repair','upgrade','levelup','danger','enemy','attack','repair','health','ready','active','special','loot'];
export function tutorialExample(page:number) {
  const caption=captions[page];
  if(!caption)throw new RangeError('Unknown tutorial page');
  return {page,caption,skill:page===19||page===20?demoSkill:undefined,kind:page<=8?'tiles':page<=14?'resources':page<=18?'combat':page<=20?'skill':'special'};
}
export function drawTutorialExample(ctx:CanvasRenderingContext2D,a:Assets,i:I18n,page:number,x=24,y=86) {
  const example=tutorialExample(page);
  ctx.save();ctx.translate(x,y);
  a.ui.paint(ctx,'ui.panel',0,0,272,170);
  text(ctx,helpCopy(i,'example'),136,20,12,'#b5a58c');
  const label=(value:string,px:number,py:number,color='#f0dfbf')=>text(ctx,value,px,py,12,color);
  const tile=(type:number,px:number,py:number,size=44,enemy=0)=>{
    const t=emptyTile(0,0);t.type=type;t.enemyType=enemy;t.appearance=0;
    const uv=tileUV(t);a.tile(ctx,uv.x,uv.y,px,py,size);
  };
  const row=(types:number[],chain=false)=>{
    const size=44,gap=4,left=(272-types.length*(size+gap)+gap)/2;
    types.forEach((type,n)=>tile(type,left+n*(size+gap),49,size));
    if(chain)drawArrow(ctx,types.map((_,n)=>({x:left+n*(size+gap)+size/2,y:71})),false);
  };
  const bar=(kind:'xp'|'upgrade',amount:number)=>{
    a.ui.paint(ctx,'hud.resource.slot',55,91,162,16);
    a.ui.fill(ctx,`hud.${kind}`,55,91,162,16,amount/100);
    label(`${amount} / 100`,136,121);
  };
  const health=(current:number)=>{
    a.ui.fill(ctx,'hud.health',172,39,64,64,current/40,true);
    a.ui.paint(ctx,'hud.health.frame',172,39,64,64);
    label(`${current}/40`,204,118,current<15?'#ff8374':'#f0dfbf');
  };
  const armour=(current:number)=>{
    a.ui.paint(ctx,'hud.armour.icon',109,42,54,54);
    label(`${current}/4`,136,118,'#adb1ff');
  };
  const enemy=(px:number,attack:number,special=0)=>{
    tile(TileType.TILE_SKULL,px,40,64,special);
    label(String(attack),px+60,53,'#fff');label('1',px+60,76,'#adb1ff');label('8',px+60,98,'#ff756b');
  };
  switch(page) {
    case 0:row([coin,coin,coin],true);break;
    case 1:row([coin,coin,coin,coin,coin],true);label('3 + 1 + 1',136,120);break;
    case 2:row([coin,coin,coin],true);a.ui.paint(ctx,'hud.gold.column',215,95,16,30);break;
    case 3:case 14:tile(TileType.TILE_POTION,40,48,48);label('→',129,82);health(page===14?8:24);break;
    case 4:row([sword,sword,skull],true);break;
    case 5:row([shield,shield,shield],true);a.ui.paint(ctx,'hud.armour.icon',125,102,22,22);break;
    case 6:tile(TileType.TILE_SKULL,30,43);label('→',103,70);a.ui.paint(ctx,'hud.xp',142,54,95,14);break;
    case 7:for(let n=0;n<5;n++)a.ui.paint(ctx,'hud.gold.column',28+n*16,42,16,61);label('100',68,121);label('→',140,78);a.items.draw(ctx,'0',181,48,53,53,'');break;
    case 8:row([sword,sword,skull],true);label('3 + 2 × 2 = 7',136,121);break;
    case 9:case 10:tile(TileType.TILE_SWORD,106,38,50);label(page===9?'3':'+2',136,118,'#ffe3a0');break;
    case 11:case 17:armour(page===11?1:2);break;
    case 12:a.ui.paint(ctx,'hud.armour.icon',55,37,32,32);label('4/4',116,60,'#adb1ff');label('→',186,60);bar('upgrade',60);break;
    case 13:label('→ +1',136,61);bar('xp',100);break;
    case 15:enemy(101,3);break;
    case 16:enemy(39,3);enemy(165,2);label('+',136,78);label('3 + 2 = 5',136,121);break;
    case 18:label('5 - 2 = 3',86,63);label('→',130,99);health(37);break;
    case 19:case 20:a.ui.paint(ctx,`SkillType.${demoSkill}`,105,42,62,62);a.ui.paint(ctx,'ui.selection',105,42,62,62);label(i.t(`skill.${demoSkill}.name`),136,122,'#b9d58b');if(page===20)label('✓',185,80,'#b9d58b');break;
    case 21:enemy(101,3,1);break;
    case 22:tile(TileType.TILE_SKULL,25,48,50,1);label('→',105,81);tile(TileType.TILE_COIN,139,49,42);a.ui.paint(ctx,'hud.xp',195,65,50,12);break;
  }
  // Reserve two lines for both locales; illustration text never overlaps body copy.
  wrap(ctx,helpCopy(i,example.caption),248).forEach((v,n)=>label(v,136,146+n*14));
  ctx.restore();
}
