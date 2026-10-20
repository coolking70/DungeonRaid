import { cloneData } from '../src/core/clone';
import { classData, getClass } from '../src/core/data';
import { canChangeRace, getSkillPool, isPerkSlotUnlocked, isSkillUnlocked, replacementSkillsAllowed, validateConfiguration } from '../src/core/progression';
import { createRunState, type ClassConfiguration, type ProfileState } from '../src/core/state';
import type { StoragePort } from './storage';

// NameScreen::ProcessInput @0x57a10: +2c14 < 0x10, strncpy(...,0x10).
// Unicode code points replace the original ASCII keyboard's characters.
export const playerName = (value: string) => Array.from(value.replace(/[\u0000-\u001f\u007f]/g, '')).slice(0,16).join('');
/** ScoreScreen::Process @0x5dba8; positions in native screen widths. */
export class ScorePager {
  offset=0; velocity=0; dragging=false; target: number|null=null;
  private start=0; private last=0; private cursor=0;
  constructor(public page=0) {}
  down(x:number) { if(this.target!==null)return;this.dragging=true;this.start=this.last=this.cursor=x/320;this.velocity=0; }
  move(x:number) { if(this.dragging)this.cursor=x/320; }
  update(dt:number) {
    if(this.dragging) {
      this.offset=this.cursor-this.start;
      if((this.page===0&&this.offset>0)||(this.page===5&&this.offset<0)){this.offset=0;this.start=this.last=this.cursor;}
      if(dt>0)this.velocity+=((this.cursor-this.last)/dt-this.velocity)*.4;
      this.last=this.cursor;
    } else if(this.target!==null) {
      this.offset+=(this.target-this.offset)*.3;
      if(Math.abs(this.offset-this.target)<.00625){this.page=Math.max(0,Math.min(5,this.page-this.target));this.offset=0;this.target=null;}
    }
  }
  up(cancel=false) {
    if(!this.dragging)return;this.dragging=false;
    this.target=cancel?0:this.page>0&&(this.velocity>.1||this.offset>.5)?1:this.page<5&&(this.velocity<-.1||this.offset<-.5)?-1:0;
  }
  arrow(direction:number) { if(this.target===null&&!this.dragging&&this.page+direction>=0&&this.page+direction<=5)this.target=-direction; }
}
export const HELP_KEY='dungeonraid.help.v1';
export interface HelpRequest { id:number; y:number; offset?:number; once?:boolean }
/** Initialise only consumes a bit when shown; QueueHelp is FIFO. ResetHelp @0x47458. */
export class HelpQueue {
  bits=0x7fffff; enabled=true; queue:HelpRequest[]=[]; current?:HelpRequest;
  constructor(private storage:StoragePort) {
    try {const raw=JSON.parse(storage.getItem(HELP_KEY)??'null');if(raw&&Number.isInteger(raw.bits)&&raw.bits>=0&&raw.bits<=0x7fffff){this.bits=raw.bits;this.enabled=!!raw.enabled;}}catch{}
  }
  persist(){try{this.storage.setItem(HELP_KEY,JSON.stringify({bits:this.bits,enabled:this.enabled}));}catch{}}
  disable(){this.bits=0;this.enabled=false;this.clear();this.persist();}
  reset(){this.bits=0x7fffff;this.enabled=true;this.clear();this.persist();}
  clear(){this.queue=[];this.current=undefined;}
  request(id:number,y=240,once=true,offset=0){
    if(id<0||id>22||!Number.isInteger(id)||once&&(!this.enabled||!(this.bits&(1<<id))))return;
    if(this.current?.id===id||this.queue.some(q=>q.id===id))return;
    this.queue.push({id,y,once,offset});
  }
  next(){
    this.current=this.queue.shift();
    if(this.current?.once){this.bits&=~(1<<this.current.id);if(!this.bits)this.enabled=false;this.persist();}
    return this.current;
  }
}
export function helpRect(y:number,count:number,offset=0){const h=count*16+41.6;return{x:3,y:Math.max(2,Math.min(478-h,Math.trunc(y<240?y+20+offset:y-20-offset-h))),w:313.6,h};}

/** Native Game::IsRaceUnlocked @0x248a0 / IsPerkUnlocked @0x24dec. */
export function raceUnlocked(p:ProfileState,id:number){const c=classData.classes.find(c=>c.defaultRace.value===id);return !!c&&(c.class.value===0||p.classes[c.class.value]!.level>=5);}
export function perkUnlocked(p:ProfileState,id:number){const c=classData.classes.find(c=>c.defaultPerk.value===id);return id===0||!!c&&isPerkSlotUnlocked(p.classes[c.class.value]!.level,0);}
export class CharacterEditor {
  config:ClassConfiguration;
  constructor(readonly profile:ProfileState,public classId=0){this.config=this.configuration(classId);}
  private configuration(id:number):ClassConfiguration{const {classId,race,perks,flaws,replacementSkills}=this.profile.classes[id]!;return cloneData({classId,race,perks,flaws,replacementSkills});}
  get level(){return this.profile.classes[this.classId]!.level;}
  get unlocked(){return this.level>0;}
  select(id:number){this.classId=id;this.config=this.configuration(id);}
  get canRace(){return this.classId!==0&&this.unlocked&&canChangeRace(this.level);}
  setRace(id:number){if(!this.canRace||!raceUnlocked(this.profile,id))return false;this.config.race=id;return true;}
  slotUnlocked(slot:number){return this.classId!==0&&slot>0&&slot<4&&isPerkSlotUnlocked(this.level,slot);}
  setTrait(kind:'perks'|'flaws',slot:number,id:number){
    if(!this.slotUnlocked(slot)||id!==255&&(!perkUnlocked(this.profile,id)||this.config[kind].some((v,i)=>i!==slot&&v===id)))return false;
    this.config[kind][slot]=id;return true;
  }
  get state(){const s=createRunState();s.classLevels=this.profile.classes.map(c=>c.level);s.character=cloneData(this.config);return s;}
  get pool(){return getSkillPool(this.state);}
  get replacementCount(){return this.config.replacementSkills.filter((id,n)=>id!==255&&id!==getClass(this.classId).baseSkillVector[n]!.value).length;}
  setSkill(slot:number,id:number){
    const base=getClass(this.classId).baseSkillVector;
    if(this.classId===0||!this.unlocked||slot<=0||slot>=20||id!==255&&!isSkillUnlocked(this.state,id))return false;
    const old=this.config.replacementSkills[slot]!;const was=old!==255&&old!==base[slot]!.value, is=id!==255&&id!==base[slot]!.value;
    if(this.replacementCount-Number(was)+Number(is)>replacementSkillsAllowed(this.level))return false;
    this.config.replacementSkills[slot]=id;return true;
  }
  commit(){if(!this.unlocked)return false;this.config=validateConfiguration(this.config,this.level);Object.assign(this.profile.classes[this.classId]!,this.config);return true;}
}
