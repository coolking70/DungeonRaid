// Extend the L01 catalogue without rewriting the U01 inventory. Exact English deduplication.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
export const portCopy = {
  'ui.achievement.unlocked':['Achievement unlocked','成就解锁'],
  'ui.achievement.points':['Achievement points','成就分值'],
  'ui.audio.original':['Sound effects: Original','音效：原版'],
  'ui.audio.synth':['Sound effects: Synthesized','音效：合成'],
  'ui.stats.easyNote':['Easy does not count toward class best scores.','简单难度不计入职业最佳分。'],
};
export function achievementSources(data=read('data/achievements.json')) {
  return [
    ...data.achievements.flatMap((a,n)=>['title','description'].map(f=>({id:`achievement.${a.enumValue}.${f==='title'?'name':'desc'}`,ref:`data/achievements.json#/achievements/${n}/${f}`,source:a.source,lengthLimit:{basis:'U06 adaptive achievement rows; measured at render time'}}))),
    ...data.leaderboards.map((b,n)=>({id:`leaderboard.${b.id}.name`,ref:`data/achievements.json#/leaderboards/${n}/name`,source:b.source,lengthLimit:{basis:'U06 score page heading'}})),
    ...Object.keys(portCopy).map(id=>({id,ref:`tools/i18n/achievements-copy.json#/${id}`,source:{port:'U06 UI copy; Easy: Game::CheckEndGame @0x2f960, difficulty 1/2/3 only'},lengthLimit:{basis:'U06 UI label'}})),
  ];
}
export function mergeAchievements(){
  const en=read('data/i18n/en.json'),zh=read('data/i18n/zh.json'),catalog=read('data/i18n/catalog.json'),data=read('data/achievements.json'),translations=read('tools/i18n/achievements-zh.json');
  const get=(kind,n)=>zh.messages[catalog.aliases[`${kind}.${n}.name`]];
  for(let id=1;id<=27;id++){
    const name=get(id<=9?'class':id<=18?'race':'class',(id-1)%9+1);
    translations[id]=id<=9?[name,`解锁${name}职业`]:id<=18?[name,`解锁${name}种族`]:[`${name}大师`,`将${name}职业升至满级`];
  }
  const boardZh=['普通分数','普通回合数','困难分数','困难回合数','更难分数','更难回合数','地牢冲刺','椒盐卷饼英雄'];
  const copy=Object.fromEntries(Object.entries(portCopy).map(([k,v])=>[k,v[0]]));
  writeFileSync(resolve(root,'tools/i18n/achievements-copy.json'),JSON.stringify(copy,null,2)+'\n');
  en._source=zh._source='L01 + U06: data/ui-strings.json and referenced text objects; data/achievements.json from offline XML/Java; per-key provenance in sources and catalog.json.';
  const sources=achievementSources(data);
  // Remove this extension's old provenance before an idempotent merge.
  const sourceIds=new Set(sources.map(s=>s.id));
  for(const [key,entry] of Object.entries(catalog.entries)){
    entry.sources=entry.sources.filter(s=>!sourceIds.has(s.id));
    if(!entry.sources.length){delete catalog.entries[key];delete en.messages[key];delete zh.messages[key];delete en.sources[key];delete zh.sources[key];}
  }
  const byEnglish=new Map(Object.entries(en.messages).map(([k,v])=>[v,k]));
  for(const s of sources){
    const [file,pointer]=s.ref.split('#');let original=file==='tools/i18n/achievements-copy.json'?copy:data;
    for(const part of pointer.slice(1).split('/'))original=original[part];
    const key=byEnglish.get(original)??s.id;byEnglish.set(original,key);
    let translation;
    if(s.id.startsWith('achievement.')){const [,id,field]=s.id.split('.');translation=translations[id][field==='name'?0:1];}
    else if(s.id.startsWith('leaderboard.'))translation=boardZh[data.leaderboards.findIndex(b=>s.id===`leaderboard.${b.id}.name`)];
    else translation=portCopy[s.id][1];
    if(!catalog.entries[key]){en.messages[key]=original;zh.messages[key]=translation;catalog.entries[key]={original,sources:[],placeholders:[],originalFormat:null,argumentOrder:[]};}
    catalog.entries[key].sources.push({...s,evidence:{source:s.source}});
    catalog.aliases[s.id]=key;catalog.sourceToKey[s.id]=key;
  }
  for(const [key,entry] of Object.entries(catalog.entries))en.sources[key]=zh.sources[key]=entry.sources.map(s=>s.ref);
  for(const [file,obj] of [['en',en],['zh',zh],['catalog',catalog]])writeFileSync(resolve(root,`data/i18n/${file}.json`),JSON.stringify(obj,null,2)+'\n');
  console.log(`Merged U06: ${Object.keys(en.messages).length} messages; ${Object.keys(catalog.sourceToKey).length} sources`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))mergeAchievements();
