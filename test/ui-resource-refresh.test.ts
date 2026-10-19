import {expect,test,vi} from 'vitest';
import {appResource,refreshResources} from '../ui/resource-refresh';
const href='https://example.test/DungeonRaid/?art=original#game';
const defaults=()=>({href,resources:[],stamp:123,fetcher:vi.fn(async()=>new Response('fresh',{status:200})) as unknown as typeof fetch});
test('refresh bypasses HTTP cache, consumes response bodies, deduplicates and keeps URL preferences',async()=>{
 const calls:{url:string;options?:RequestInit}[]=[],bodies=vi.fn(async()=>new ArrayBuffer(0)),progress:number[]=[];
 const fetcher=vi.fn(async(url:RequestInfo|URL,options?:RequestInit)=>{calls.push({url:String(url),options});return {ok:true,status:200,arrayBuffer:bodies} as unknown as Response;}) as typeof fetch;
 const result=await refreshResources({...defaults(),fetcher,resources:['assets/a.js','assets/a.js','#ignored-page','https://cdn.test/font.png','data:image/png,test','https://example.test/Other/assets/a.js'],progress:done=>progress.push(done)});
 expect(calls.map(c=>c.url)).toEqual(['https://example.test/DungeonRaid/?art=original&_refresh=123#game','https://example.test/DungeonRaid/assets/a.js']);
 expect(calls.every(c=>c.options?.cache==='reload')).toBe(true);expect(bodies).toHaveBeenCalledTimes(2);expect(progress).toEqual([0,1,2]);
 expect(result.url).toContain('art=original');expect(result.url).toContain('#game');
});
test('clears only this app entries, never deletes a shared cache or another Pages project',async()=>{
 const remove=vi.fn(async(_request:Request)=>true),cache={keys:async()=>[new Request('https://example.test/DungeonRaid/assets/old.js'),new Request('https://example.test/Other/save.json')],delete:remove};
 const caches={keys:async()=>['shared'],open:async()=>cache,delete:vi.fn()} as unknown as CacheStorage;
 const result=await refreshResources({...defaults(),caches});expect(result.cacheEntries).toBe(1);
 expect(remove.mock.calls[0]![0].url).toBe('https://example.test/DungeonRaid/assets/old.js');expect(caches.delete).not.toHaveBeenCalled();
});
test('offline or server failure reports failure before navigation and does not clear CacheStorage',async()=>{
 const caches={keys:vi.fn()} as unknown as CacheStorage;
 await expect(refreshResources({...defaults(),caches,fetcher:vi.fn(async()=>new Response('offline',{status:503})) as typeof fetch})).rejects.toThrow('503');
 expect(caches.keys).not.toHaveBeenCalled();
});
test('missing obsolete hashed files do not prevent refreshing to a new deployment',async()=>{
 const fetcher=vi.fn(async(url:RequestInfo|URL)=>new Response('',{status:String(url).endsWith('old.js')?404:200})) as typeof fetch;
 expect((await refreshResources({...defaults(),resources:['assets/old.js'],fetcher})).resources).toBe(2);
});
test('asset fetch failure waits for the worker pool and permits retry without any storage API',async()=>{
 const fetcher=vi.fn(async(url:RequestInfo|URL)=>{if(String(url).endsWith('bad.png'))throw Error('network');return new Response('ok');}) as typeof fetch;
 await expect(refreshResources({...defaults(),fetcher,resources:['assets/bad.png']})).rejects.toThrow('network');
 expect((await refreshResources({...defaults(),resources:['assets/bad.png']})).resources).toBe(2);
});
test('resource scope respects directory boundaries, origin, normalized traversal, and schemes',()=>{
 const base=new URL('https://example.test/DungeonRaid/');
 expect(appResource('assets/tile.png',base)).toBe(true);
 for(const url of ['https://example.test/DungeonRaid-other/a','../Other/a','https://other.test/DungeonRaid/a','data:text/plain,hi','blob:https://example.test/x'])expect(appResource(url,base),url).toBe(false);
});
