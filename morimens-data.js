(()=>{
  const BASE='data/morimens/skeydb/public-v3';
  const cache=new Map();
  let manifestPromise=null;

  async function json(path){
    const key=path.replace(/^\/+/, '');
    if(cache.has(key))return cache.get(key);
    const p=fetch(`${BASE}/${key}`,{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error(`${key}: HTTP ${r.status}`);return r.json()});
    cache.set(key,p);
    try{return await p}catch(e){cache.delete(key);throw e}
  }
  function manifest(){return manifestPromise||(manifestPromise=json('manifest.json'))}
  async function scopeConfig(scope){const m=await manifest();const cfg=m?.scopes?.[scope];if(!cfg)throw new Error(`Unknown SKeyDB scope: ${scope}`);return cfg}
  async function catalog(scope){const cfg=await scopeConfig(scope);return json(cfg.catalog)}
  async function record(scope,id){const cfg=await scopeConfig(scope);return json(cfg.recordPattern.replace('{id}',encodeURIComponent(id)))}
  async function index(name){const m=await manifest();const p=m?.indexes?.[name];if(!p)throw new Error(`Unknown SKeyDB index: ${name}`);return json(p)}
  async function gameplayMath(){const m=await manifest();return json(m?.metadata?.gameplayMath||'metadata/gameplay-math.json')}
  async function recordsForAwakener(scope,awakenerId){
    const c=await catalog(scope);const rows=c?.records||[];return rows.filter(x=>[x.ownerAwakenerId,x.awakenerId,x.ownerId,x.characterId,x.character_id,x.character].some(v=>String(v||'')===String(awakenerId)))
  }
  async function fullRecordsForAwakener(scope,awakenerId){const rows=await recordsForAwakener(scope,awakenerId);return Promise.all(rows.map(x=>record(scope,x.id)))}
  async function preloadCore(){return Promise.all([manifest(),catalog('awakeners'),catalog('skills'),catalog('wheels'),catalog('covenants'),gameplayMath()])}

  window.MorimensRepository={
    base:BASE,
    manifest,
    catalog,
    record,
    index,
    gameplayMath,
    recordsForAwakener,
    fullRecordsForAwakener,
    preloadCore,
    clearCache(){cache.clear();manifestPromise=null}
  };
})();
