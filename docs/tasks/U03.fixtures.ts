// Explicit visual/editor/pager fixtures; never imported by the public application.
import { createProfileState } from '../../src/core/state';
import { serializeProfile } from '../../src/core/save';
export function frontFixture(){
  const p=createProfileState();p.playerName='Fixture';
  // Ranger 7 permits race, trait slots 1/2 and 6 replacements; other classes stay locked.
  p.classes[1]!.level=7;p.classes[1]!.games=24;p.classes[1]!.kills=520;p.classes[1]!.bestScores=[1234,2456,789];
  p.achievements={1:100,10:100,29:42,67:100};
  p.highScores=Array.from({length:6},(_,category)=>Array.from({length:10},(_,n)=>({name:`Hero ${n+1}`,turn:150-n*9,xp:category===5?75+n:1500-n*100,gold:category===5?15-n:500-n*10,upgrade:category===5?12+n:300-n*10,score:9999-n*431,skills:[0,2,3,31]})));
  p.lastScoreIndices=[null,null,null,null,null,2];
  return JSON.stringify({version:2,profile:serializeProfile(p),run:null});
}

import { step } from '../../src/core/engine';
import { createRunState, emptyTile } from '../../src/core/state';
import { serializeRun } from '../../src/core/save';
import { GameMode, SpecialTileType, TileType } from '../../src/core/data';
export function trophyFixture(){
  const state=step(createRunState(),{type:'NewGame',seed:42,classId:0,difficulty:1,mode:GameMode.MODE_CLASSIC}).state;
  state.board[0]={...emptyTile(0,0),type:TileType.TILE_SPECIAL,specialType:SpecialTileType.SPECIAL_TILE_TROPHY};
  return JSON.stringify({version:2,profile:serializeProfile(createProfileState()),run:serializeRun(state).json});
}
