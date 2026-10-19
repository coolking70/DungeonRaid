import {expect,test} from 'vitest';
import {fixture} from './turn-helpers';
import {I18n} from '../ui/i18n';
import {statsRows,trophyProgress,profileTrophyProgress} from '../ui/content';
import {Difficulty,GameMode} from '../src/core/data';
import {createProfileState} from '../src/core/state';
import {GameSession} from '../ui/session';
import {trophyFixture} from '../docs/tasks/U13.fixtures';
const i=new I18n({getItem:()=>null,setItem:()=>{}});
test.each(['zh','en'] as const)('trophy row represents fresh, blocked and probabilistic progress in %s',language=>{
 i.setLanguage(language);const s=fixture(),row=()=>trophyProgress(i,s);
 expect(statsRows(i,s).at(-1)).toEqual(row());
 for(const n of [-1,0,1,2,30]){s.trophies.remaining=n;expect(row().value).toBe(String(Math.max(1,n)));}
 s.challenge=true;s.mode=GameMode.MODE_SPRINT;s.trophies.remaining=12;expect(row().value).toBe('≥12');
 expect(row().lines.join('')).toContain('50/101');
 s.trophies.remaining=0;expect(row().value).toBe('1');
 s.difficulty=Difficulty.DIFF_EASY;expect(row().value).toBe(i.t('trophy.easy'));
 s.difficulty=Difficulty.DIFF_NORMAL;s.trophies.awarded=3;expect(row().value).toBe(i.t('trophy.limit'));
 s.trophies.awarded=0;s.classLevels.fill(10);expect(row().value).toBe(i.t('trophy.complete'));
 s.classLevels[1]=9;expect(row().value).toBe(i.t('trophy.complete')); // Another unlocked class below 10 is not sufficient.
 s.character.classId=1;expect(row().value).toBe('1');
 s.classLevels[1]=10;s.classLevels[2]=0;expect(row().value).toBe('1');
 const before=structuredClone(s);statsRows(i,s);expect(s).toEqual(before);
});
test('display follows actual kill, save/continue, generation and unclaimed trophy across runs',()=>{
 const data=new Map([['dungeonraid.session.v2',trophyFixture('normal')]]),storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
 const session=new GameSession(storage);session.resume();session.skip();
 const row=()=>trophyProgress(i,session.state).value;expect(row()).toBe('2');
 for(const slot of [12,13,14])expect(session.dispatch({type:'SelectTile',at:{x:slot%6,y:Math.floor(slot/6)}})).toBe(true);
 expect(session.dispatch({type:'CommitChain'})).toBe(true);session.skip();expect(row()).toBe('1');session.save();
 const restored=new GameSession(storage);restored.resume();restored.skip();expect(trophyProgress(i,restored.state).value).toBe('1');
 // Repeat the deterministic board with the remaining counter at one.
 data.set('dungeonraid.session.v2',trophyFixture('normal'));
 const final=new GameSession(storage);final.resume();final.skip();final.state.trophies.remaining=1;
 for(const slot of [12,13,14])final.dispatch({type:'SelectTile',at:{x:slot%6,y:Math.floor(slot/6)}});
 final.dispatch({type:'CommitChain'});final.skip();
 expect(final.events.some(e=>e.type==='TrophyGenerated')).toBe(true);
 const n=final.state.trophies.remaining;expect(n).toBeGreaterThanOrEqual(20);expect(n).toBeLessThanOrEqual(30);
 expect(trophyProgress(i,final.state).value).toBe(String(n));final.save();
 const next=new GameSession(storage);next.start({seed:99,classId:0,difficulty:1,mode:3});expect(trophyProgress(i,next.state).value).toBe(String(n));
});

test('homepage uses active run restrictions or next-run profile progress as appropriate',()=>{
 const p=createProfileState(),s=fixture();p.trophyRemaining=24;s.trophies.remaining=2;
 expect(profileTrophyProgress(i,p,s).value).toBe('2');
 s.phase='ended';s.trophies.awarded=3;expect(profileTrophyProgress(i,p,s).value).toBe('24');
 s.phase='idle';expect(profileTrophyProgress(i,p,s).value).toBe('24');
 p.classes.forEach(c=>c.level=10);expect(profileTrophyProgress(i,p,s).value).toBe(i.t('trophy.complete'));
 p.classes[1]!.level=9;expect(profileTrophyProgress(i,p,s).value).toBe('24');
});
