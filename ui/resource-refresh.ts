/** Refresh this application's downloaded resources. Never touches localStorage or IndexedDB. */
export interface RefreshOptions {
  href:string;
  resources:string[];
  fetcher:typeof fetch;
  caches?:CacheStorage;
  stamp:number;
  progress?:(done:number,total:number)=>void;
}
export function appResource(url:string,base:URL):boolean {
  try {const u=new URL(url,base);return u.origin===base.origin&&u.pathname.startsWith(base.pathname)&&/^https?:$/.test(u.protocol);}
  catch{return false;}
}
export async function refreshResources(options:RefreshOptions) {
  const page=new URL(options.href),base=new URL('.',page);
  page.searchParams.set('_refresh',String(options.stamp));
  const urls=[...new Set(options.resources.filter(u=>appResource(u,base)).map(u=>{const url=new URL(u,base);url.hash='';return url.href;}))]
    .filter(u=>new URL(u).pathname!==page.pathname);
  let done=0;const total=urls.length+1;
  options.progress?.(done,total);
  const reload=async(url:string,oldAsset=false)=>{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try {
      const response=await options.fetcher(url,{cache:'reload',credentials:'same-origin',signal:controller.signal});
      // A new deployment may remove an old hashed asset; the fresh HTML will request its replacement.
      if(!response.ok&&!(oldAsset&&[404,410].includes(response.status)))throw new Error(`Resource refresh failed: ${response.status}`);
      await response.arrayBuffer(); // Consume the body so the HTTP cache can store the complete fresh response.
      options.progress?.(++done,total);
    }finally{clearTimeout(timeout);}
  };
  // First verify connectivity; a failed refresh must leave the current page usable.
  await reload(page.href);
  let cacheEntries=0;
  if(options.caches) {
    for(const name of await options.caches.keys()) {
      const cache=await options.caches.open(name);
      for(const request of await cache.keys())if(appResource(request.url,base)&&await cache.delete(request))cacheEntries++;
    }
  }
  let next=0,failed:unknown;
  await Promise.all(Array.from({length:Math.min(4,urls.length)},async()=>{
    while(!failed&&next<urls.length){const url=urls[next++]!;try{await reload(url,true);}catch(error){failed=error;}}
  }));
  if(failed)throw failed;
  return {url:page.href,resources:total,cacheEntries};
}
export function browserRefreshResources(progress:RefreshOptions['progress']) {
  let cacheStorage:CacheStorage|undefined;
  try {cacheStorage=window.caches;}catch{/* Some private browsing configurations disable CacheStorage. */}
  const resources=performance.getEntriesByType('resource').map(e=>e.name);
  for(const e of document.querySelectorAll<HTMLScriptElement>('script[src]'))resources.push(e.src);
  for(const e of document.querySelectorAll<HTMLLinkElement>('link[href]'))resources.push(e.href);
  return refreshResources({href:location.href,resources,fetcher:window.fetch.bind(window),caches:cacheStorage,stamp:Date.now(),progress});
}
