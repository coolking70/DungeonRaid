// Explicit visual QA fixtures, never imported into the public application.
// Full browser acceptance is a separate natural138-turn game. These cover rare terminal branches.
import { step } from '../../src/core/engine';
import { createProfileState, createRunState } from '../../src/core/state';
import { serializeRun, serializeProfile } from '../../src/core/save';
import { Difficulty, GameMode } from '../../src/core/data';
export function endingFixture(kind: 'sprint'|'pretzel') {
  const s=step(createRunState(),{type:'NewGame',seed:12345,classId:0,difficulty:Difficulty.DIFF_NORMAL,mode:kind==='sprint'?GameMode.MODE_SPRINT:GameMode.MODE_PRETZEL}).state;
  s.phase='end-turn';s.inputReady=false;s.turn=kind==='sprint'?99:100;
  if(kind==='pretzel'){s.health=0;s.lastDamage='enemy-attack';s.pretzel.score=321;s.pretzel.maxCrosses=15;s.pretzel.averageTimes10=75;s.pretzel.scoringChains=12;}
  return JSON.stringify({version:2,profile:serializeProfile(createProfileState()),run:serializeRun(s).json});
}
