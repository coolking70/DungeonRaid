// Achievement.java / mAchievements: indices 1…77; 0 is the sentinel.
/** Presentation-only FIFO. No timers or RNG in the rules; pauses with the app. */
export class AchievementNotices {
  private queue:number[]=[];
  private seen=new Set<number>();
  remaining=0;
  get current(){return this.queue[0];}
  get pending(){return [...this.queue];}
  add(ids:readonly number[]){for(const id of ids)if(!this.seen.has(id)&&Number.isInteger(id)&&id>0&&id<78){this.seen.add(id);this.queue.push(id);if(this.queue.length===1)this.remaining=3;}}
  update(dt:number){while(dt>0&&this.queue.length){const used=Math.min(dt,this.remaining);dt-=used;this.remaining-=used;if(this.remaining<=0){this.queue.shift();this.remaining=this.queue.length?3:0;}}}
  clear(){this.queue=[];this.seen.clear();this.remaining=0;}
}
