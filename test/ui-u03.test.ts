import { describe, expect, it } from 'vitest';
import { CharacterEditor, HelpQueue, helpRect, playerName, ScorePager, raceUnlocked, perkUnlocked } from '../ui/front-model';
import { createProfileState } from '../src/core/state';
import { GameSession, SESSION_KEY } from '../ui/session';
import { GameMode } from '../src/core/data';
const memory=()=>{const values=new Map<string,string>();return{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};};
describe('U03 ScoreScreen native frame equations',()=>{
  it('filters velocity .4 and snaps .3 per frame independently of dt',()=>{
    const p=new ScorePager(2);p.down(160);p.move(128);p.update(.1);expect(p.offset).toBeCloseTo(-.1);expect(p.velocity).toBeCloseTo(-.4);
    p.up();expect(p.target).toBe(-1);p.update(.001);expect(p.offset).toBeCloseTo(-.37);p.update(.1);expect(p.offset).toBeCloseTo(-.559);
    for(let n=0;n<25;n++)p.update(1/60);expect(p.page).toBe(3);expect(p.offset).toBe(0);expect(p.target).toBeNull();
  });
  it('clamps boundary drags, cancels safely, and never wraps arrows',()=>{
    const p=new ScorePager(0);p.down(10);p.move(100);p.update(.02);expect(p.offset).toBe(0);p.up();expect(p.target).toBe(0);
    p.update(.01);p.arrow(-1);expect(p.target).toBeNull();p.page=5;p.down(200);p.move(20);p.update(.02);expect(p.offset).toBe(0);p.up(true);p.update(.01);p.arrow(1);expect(p.target).toBeNull();
  });
  it('uses offset threshold for slow drags and returns short slow drags',()=>{
    const p=new ScorePager(2);p.down(0);p.move(170);p.update(10);p.up();expect(p.target).toBe(1);
    const q=new ScorePager(2);q.down(0);q.move(15);q.update(10);q.up();expect(q.target).toBe(0);
  });
});
describe('U03 help and names',()=>{
  it('limits names to 16 characters without splitting Unicode and removes controls',()=>{expect(playerName('a\n'+'界'.repeat(18))).toBe('a'+'界'.repeat(15));expect([...playerName('😀'.repeat(17))]).toHaveLength(16);});
  it('consumes on display only, deduplicates, persists, resets all 23 bits',()=>{
    const st=memory(),h=new HelpQueue(st);h.request(2);h.request(2);h.request(3);expect(h.queue).toHaveLength(2);expect(h.bits).toBe(0x7fffff);
    expect(h.next()?.id).toBe(2);expect(h.bits&4).toBe(0);expect(h.next()?.id).toBe(3);expect(new HelpQueue(st).bits).toBe(h.bits);h.clear();h.request(2);expect(h.queue).toHaveLength(0);h.reset();expect(h.bits).toBe(0x7fffff);
  });
  it('disables automatic help on exhaustion; manual help still works',()=>{
    const h=new HelpQueue(memory());h.bits=1;h.request(0);h.next();expect(h.enabled).toBe(false);h.clear();h.request(1);expect(h.next()).toBeUndefined();h.request(1,100,false);expect(h.next()?.id).toBe(1);
  });
  it('uses 16px lines, 41.6 padding and native below/above anchors',()=>{expect(helpRect(100,4)).toEqual({x:3,y:120,w:313.6,h:105.6});expect(helpRect(400,4).y).toBe(274);});
});
describe('U03 character editor gates',()=>{
  it('initial profile only permits Adventurer, preserving fixed race and trait slots',()=>{
    const e=new CharacterEditor(createProfileState());expect(e.unlocked).toBe(true);expect(e.setRace(1)).toBe(false);expect(e.setTrait('perks',0,1)).toBe(false);expect(e.setSkill(1,0)).toBe(false);e.select(1);expect(e.commit()).toBe(false);
  });
  it('enforces global unlocks, level milestones, paired flaws and duplicates',()=>{
    const p=createProfileState();p.classes[1]!.level=7;p.classes[2]!.level=1;const e=new CharacterEditor(p,1);
    expect(raceUnlocked(p,1)).toBe(true);expect(e.setRace(0)).toBe(true);expect(e.setRace(2)).toBe(false);expect(e.setTrait('perks',3,0)).toBe(false);
    expect(perkUnlocked(p,0)).toBe(true);expect(e.setTrait('perks',1,0)).toBe(true);expect(e.setTrait('perks',2,0)).toBe(false);e.commit();expect(e.config.perks[1]).toBe(255);
    expect(e.setTrait('flaws',1,0)).toBe(true);expect(e.setTrait('perks',1,0)).toBe(true);e.commit();expect(p.classes[1]!.perks[1]).toBe(0);
  });
  it('keeps the class skill fixed and caps replacements, permitting restoration',()=>{
    const p=createProfileState();p.classes[1]!.level=2;const e=new CharacterEditor(p,1);
    expect(e.setSkill(0,0)).toBe(false);expect(e.setSkill(1,0)).toBe(true);expect(e.setSkill(2,1)).toBe(true);expect(e.setSkill(3,6)).toBe(false);expect(e.setSkill(1,255)).toBe(true);expect(e.setSkill(3,6)).toBe(true);expect(e.setSkill(4,33)).toBe(false);expect(e.pool).toContain(6);
  });
});
describe('U03 clear profile transaction',()=>{
  it('deletes progress and legacy keys; save/pagehide cannot restore an active run',()=>{
    const st=memory(),s=new GameSession(st);s.start({seed:42,classId:0,difficulty:2,mode:GameMode.MODE_SPRINT});
    st.setItem('dungeonraid.run.v1','old');st.setItem('dungeonraid.language','en');s.profile.playerName='old';
    expect(s.clearProfile()).toBe(true);expect(s.state.phase).toBe('idle');expect(s.profile).toEqual(createProfileState());s.save();
    expect(new GameSession(st).state.phase).toBe('idle');expect(st.getItem('dungeonraid.run.v1')).toBeNull();expect(st.getItem('dungeonraid.language')).toBe('en');expect(JSON.parse(st.getItem(SESSION_KEY)!).run).toBeNull();
  });
  it('keeps the current profile and run when storage rejects the atomic write',()=>{
    const st=memory(),s=new GameSession(st);s.profile.playerName='kept';st.setItem=()=>{throw Error('quota');};expect(s.clearProfile()).toBe(false);expect(s.profile.playerName).toBe('kept');expect(s.storageError).toContain('quota');
  });
});

it('ordinary new-game help disable persists; a tutorial reset re-enables all tips',()=>{
  const st=memory(),h=new HelpQueue(st);h.request(0);h.next();h.disable();expect(h.bits).toBe(0);expect(new HelpQueue(st).enabled).toBe(false);h.reset();h.request(0);expect(h.next()?.id).toBe(0);
});
it('custom configuration and player name survive NewGame and session reload',()=>{
  const st=memory(),session=new GameSession(st);session.profile.classes[1]!.level=7;
  const e=new CharacterEditor(session.profile,1);e.setRace(0);e.setTrait('perks',1,0);e.setTrait('flaws',1,0);e.setSkill(1,0);e.commit();session.profile.playerName='U03';
  session.start({seed:42,classId:1,character:e.config,difficulty:2,mode:GameMode.MODE_SPRINT});const restored=new GameSession(st);
  expect(restored.state.character).toEqual(e.config);expect(restored.profile.playerName).toBe('U03');expect(restored.state.rng).toEqual(session.state.rng);expect(restored.state.mode).toBe(GameMode.MODE_SPRINT);expect(restored.state.difficulty).toBe(2);
});
