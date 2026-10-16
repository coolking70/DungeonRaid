import { describe, expect, test, vi } from 'vitest';
import data from '../data/achievements.json';
// @ts-ignore Build-only extractor shares its verified output with tests.
import { extractAchievements } from '../tools/extract-achievements.mjs';
import { achievements, achievementText, AchievementNotices, leaderboardName } from '../ui/achievements';
import { I18n } from '../ui/i18n';
import en from '../data/i18n/en.json';
import zh from '../data/i18n/zh.json';
import catalog from '../data/i18n/catalog.json';
import { ScreenStack, type Screen } from '../ui/screens';
import { GameSession, SESSION_KEY } from '../ui/session';
import { serializeProfile, serializeRun } from '../src/core/save';
import { createProfileState } from '../src/core/state';
import { applyRunResult } from '../src/core/profile';
import { fixture, tile } from './turn-helpers';
import { Atlas } from '../ui/assets';
const memory=()=>{const m=new Map<string,string>();return{getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v);}};};
const i=new I18n(memory());i.install('en',en);i.install('zh',zh);i.installCatalog(catalog);
const screen=():Screen=>({id:'test',enter(){},exit(){},update(){},render(){},input:vi.fn()});
const tap=(s:ScreenStack)=>{s.input({type:'down',x:2,y:2});s.input({type:'up',x:2,y:2});};

test('U06 extraction preserves XML/Java mapping, swapped positions 40/41, sentinel and unresolved 45',()=>{
  expect(extractAchievements()).toEqual(data);
  expect(achievements).toHaveLength(77);expect(data.sentinel).toEqual({enumValue:0,enumName:'ACH_NONE',openFeintId:''});
  expect(data.achievements[39]).toMatchObject({id:'869222',title:'Nemesis',source:{javaIndex:40}});
  expect(data.achievements[40]).toMatchObject({id:'869212',title:'Getting Crowded',source:{javaIndex:41}});
  expect(data.achievements[44]).toMatchObject({id:'869262',enumName:'ACH_I_SEE',title:'I See What You Did There',is_secret:false});
  expect(achievements.every(a=>a.is_secret===false)).toBe(true);
  expect(data.leaderboards.map(b=>b.category)).toEqual([1,null,2,null,3,null,4,5]);
  expect(leaderboardName(1,i)).toBe('普通分数');
});
test('U06 all titles/descriptions translate; synthetic secret hides only until unlocked',()=>{
  for(const a of achievements){const row=achievementText(a,20,i);expect(row.title).not.toContain('achievement.');expect(row.description).not.toContain('achievement.');expect(row.points).toBe(a.gamerscore);}
  const secret={...achievements[0]!,is_secret:true};
  expect(achievementText(secret,99,i).description).toBe('???');
  expect(achievementText(secret,100,i).description).toBe('解锁游侠职业');
});
describe('U06 fade tap buffering',()=>{
  test('first complete tap replays exactly once; doubles and boundary repeats coalesce',()=>{
    const s=new ScreenStack(),a=screen();s.push(a,.5);tap(s);tap(s);expect(a.input).not.toHaveBeenCalled();s.update(.5);
    expect(a.input).toHaveBeenCalledTimes(2);tap(s);expect(a.input).toHaveBeenCalledTimes(2);s.update(.3);tap(s);expect(a.input).toHaveBeenCalledTimes(4);
  });
  test('tap spanning fade waits for release; cancellation/drag/outgoing/paused input never replays',()=>{
    const s=new ScreenStack(),a=screen();s.push(a,.5);s.input({type:'down',x:2,y:2});s.update(.5);expect(a.input).not.toHaveBeenCalled();s.input({type:'up',x:2,y:2});expect(a.input).toHaveBeenCalledTimes(2);
    for(const kind of ['cancel','move'] as const){const st=new ScreenStack(),b=screen();st.push(b,.5);st.input({type:'down',x:2,y:2});st.input({type:kind,x:30,y:30});st.input({type:'up',x:2,y:2});st.update(.5);expect(vi.mocked(b.input).mock.calls.filter(([e])=>e.type!=='cancel')).toEqual([]);}
    const st=new ScreenStack(),b=screen();st.push(b,0);st.replace(screen(),.3,.5);tap(st);st.update(.3);st.update(.5);expect(b.input).not.toHaveBeenCalled();
    const paused=new ScreenStack(),c=screen();paused.push(c,.2);paused.paused=true;tap(paused);paused.paused=false;paused.update(.2);expect(c.input).not.toHaveBeenCalled();
  });
  test('down-navigation does not send replayed release to another screen',()=>{
    const s=new ScreenStack(),a=screen(),b=screen();a.input=vi.fn(e=>{if(e.type==='down')s.push(b,0);});s.push(a,.3);tap(s);s.update(.3);expect(a.input).toHaveBeenCalledOnce();expect(b.input).not.toHaveBeenCalled();
  });
});
test('U06 notice queue expires, deduplicates, and resets for a cleared profile',()=>{
  const q=new AchievementNotices();q.add([29,30,29]);expect(q.pending).toEqual([29,30]);q.update(2.9);expect(q.current).toBe(29);q.update(.2);expect(q.current).toBe(30);q.update(3);expect(q.current).toBeUndefined();q.add([29]);expect(q.pending).toEqual([]);q.clear();q.add([29]);expect(q.current).toBe(29);
});
test('U06 a real board-clear unlock is delivered to notices and is not replayed by saves/reload',()=>{
  const storage=memory(),s=fixture();s.options.scrollFilter='supplied-native-fixture';
  storage.setItem(SESSION_KEY,JSON.stringify({version:2,profile:serializeProfile(createProfileState()),run:serializeRun(s).json}));
  const session=new GameSession(storage);session.resume();
  for(let y=0;y<6;y++)for(let n=0;n<6;n++)expect(session.dispatch({type:'SelectTile',at:{x:y%2?5-n:n,y}})).toBe(true);
  expect(session.dispatch({type:'CommitChain'})).toBe(true);session.skip();
  expect(session.profile.achievements[69]).toBe(100);expect(session.notices.pending).toContain(69);
  const queue=session.notices.pending;session.save();session.save();expect(session.notices.pending).toEqual(queue);expect(new GameSession(storage).notices.pending).toEqual([]);
});
test('U06 CheckEndGame @0x2f960: Easy adds games/kills/local score but preserves class bests',()=>{
  const s=fixture();s.difficulty=0;s.phase='ended';s.outcome={won:false,cause:'enemy-attack',turn:4};s.turn=4;s.kills.total=7;
  const p=applyRunResult(createProfileState(),s);expect(p.classes[0]).toMatchObject({games:1,kills:7,bestScores:[0,0,0]});expect(p.highScores[0]).toHaveLength(1);
});
test('U06 unsupported WebP retries the source PNG exactly once',async()=>{
  const requested:string[]=[];
  class FakeImage { onload?:()=>void;onerror?:()=>void; private value=''; get src(){return this.value;}set src(url:string){this.value=url;requested.push(url);queueMicrotask(()=>url.endsWith('.webp')?this.onerror?.():this.onload?.());} }
  vi.stubGlobal('Image',FakeImage);vi.stubGlobal('location',{href:'http://localhost/'});
  try{const a=new Atlas('test');await a.load('/items.webp','/items.png');expect(a.status).toBe('loaded');expect(requested).toEqual(['/items.webp','/items.png']);}finally{vi.unstubAllGlobals();}
});
test('U06 a trophy milestone queues class and race notices once despite both profile and rule events',()=>{
  const storage=memory(),s=fixture(),p=createProfileState();s.options.scrollFilter='supplied-native-fixture';
  for(const c of p.classes)c.level=1;p.classes[1]!.level=4;
  s.classLevels=p.classes.map(c=>c.level);s.character.classId=1;
  tile(s,0,6,{specialType:1});
  storage.setItem(SESSION_KEY,JSON.stringify({version:2,profile:serializeProfile(p),run:serializeRun(s).json}));
  const session=new GameSession(storage);expect(session.dispatch({type:'ClaimTrophy',slot:0})).toBe(true);
  expect(session.profile.classes[1]!.level).toBe(5);expect(session.notices.pending).toEqual([1,10]);
  session.save();session.skip();expect(session.notices.pending).toEqual([1,10]);
  session.notices.update(3);expect(session.notices.current).toBe(10);
});
test('U06 serializer-triggered Armed and Dangerous also notifies only once',()=>{
  const storage=memory(),s=fixture();s.options.scrollFilter='supplied-native-fixture';
  for(let n=0;n<8;n++)s.equipment[0]!.stats[n]=1;
  storage.setItem(SESSION_KEY,JSON.stringify({version:2,profile:serializeProfile(createProfileState()),run:serializeRun(s).json}));
  const session=new GameSession(storage);session.save();expect(session.notices.pending).toEqual([72]);session.save();expect(session.notices.pending).toEqual([72]);
});
