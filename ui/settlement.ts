import type { RunState } from '../src/core/state';
import { scoreBreakdown } from '../src/core/scoring';
import type { AudioPort } from './audio';
/** Native .2s icon cadence and p+=.5dt count are retained. Full native ordering is
 * unresolved (spec11); this port's ordered equipment→skills→traits→score is explicit. */
export class SettlementSequence {
  elapsed=0; counted=0; sounded=0; ready=false;
  readonly icons: { atlas:'ui'|'items'; id:string }[];
  constructor(readonly state:RunState,readonly audio:AudioPort){
    this.icons=[...state.equipment.map(e=>({atlas:'items' as const,id:String(e.icon)})),...state.skills.flatMap(sk=>sk?[{atlas:'ui' as const,id:`SkillType.${sk.id}`}]:[]),...state.character.perks.filter(n=>n!==255).map(n=>({atlas:'ui' as const,id:`PerkType.${n}`})),...state.character.flaws.filter(n=>n!==255).map(n=>({atlas:'ui' as const,id:`FlawType.${n}`}))];
  }
  get visible(){return Math.min(this.icons.length,Math.floor(this.elapsed/.2));}
  get fraction(){return Math.max(0,Math.min(1,(this.elapsed-this.icons.length*.2)/2));}
  update(dt:number){
    this.elapsed+=dt;
    while(this.sounded<this.visible){this.audio.play(2,-1);this.sounded++;}
    const next=Math.floor(scoreBreakdown(this.state).score*this.fraction);
    if(next!==this.counted && this.fraction<1)this.audio.play(2,-1);
    this.counted=next;
    if(this.fraction===1&&!this.ready){this.ready=true;this.audio.play(10,-1);}
  }
}
