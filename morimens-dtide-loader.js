(()=>{
  if(window.MorimensDtideDataLoader)return;

  const datasetCache=new Map();
  const jsonCache=new Map();
  const nativeAtob=window.atob.bind(window);
  const absolute=url=>new URL(url,document.baseURI).href;

  function hashText(text){
    let h=2166136261;
    for(let i=0;i<text.length;i++){
      h^=text.charCodeAt(i);
      h=Math.imul(h,16777619);
    }
    return (h>>>0).toString(36);
  }

  function versioned(url,revision=''){
    const u=new URL(url,document.baseURI);
    if(revision)u.searchParams.set('v',String(revision));
    return u.href;
  }

  async function fetchText(url,{revision='',fresh=false}={}){
    const target=versioned(url,revision);
    const response=await fetch(target,{cache:fresh?'no-store':'force-cache'});
    if(!response.ok)throw new Error(`${url}: HTTP ${response.status}`);
    return response.text();
  }

  async function loadJson(url,{revision='',fresh=false}={}){
    const target=versioned(url,revision);
    if(fresh){
      const response=await fetch(target,{cache:'no-store'});
      if(!response.ok)throw new Error(`${url}: HTTP ${response.status}`);
      return response.json();
    }
    if(jsonCache.has(target))return jsonCache.get(target);
    const task=(async()=>{
      const response=await fetch(target,{cache:'force-cache'});
      if(!response.ok)throw new Error(`${url}: HTTP ${response.status}`);
      return response.json();
    })().catch(error=>{jsonCache.delete(target);throw error});
    jsonCache.set(target,task);
    return task;
  }

  function decodeBase64(text){
    const encoded=String(text||'')
      .replace(/[^A-Za-z0-9+/=_-]/g,'')
      .replace(/-/g,'+')
      .replace(/_/g,'/');
    const padded=encoded+'='.repeat((4-encoded.length%4)%4);
    const binary=nativeAtob(padded);
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return bytes;
  }

  async function loadDataset(url){
    const key=absolute(url);
    if(datasetCache.has(key))return datasetCache.get(key);

    const task=(async()=>{
      // Always revalidate the tiny index.  Its exact contents become the cache
      // key for large chunks, so a re-split dataset can never reuse old chunks.
      const indexResponse=await fetch(key,{cache:'no-store'});
      if(!indexResponse.ok)throw new Error(`${url}: HTTP ${indexResponse.status}`);
      const indexText=await indexResponse.text();
      let index;
      try{index=JSON.parse(indexText)}catch(error){throw new Error(`${url}: invalid index JSON: ${error.message}`)}
      const revision=`${index.revision||index.syncedAt||'index'}-${hashText(indexText)}`;

      if(index.format==='gzip-base64-chunked-v1'){
        if(!Array.isArray(index.chunks)||!index.chunks.length)throw new Error(`${url}: gzip index has no chunks`);
        const expected=Number(index.compressedBytes||index.chunkBytes||0);
        let bytes=expected>0?new Uint8Array(expected):new Uint8Array(0);
        let offset=0;
        const ensureCapacity=needed=>{
          if(needed<=bytes.length)return;
          let size=Math.max(needed,bytes.length?bytes.length*2:1024*1024);
          const next=new Uint8Array(size);
          next.set(bytes);
          bytes=next;
        };

        // Decode sequentially: this avoids holding every base64 text, binary
        // string, per-chunk Uint8Array and the concatenated copy at once.
        for(const chunkPath of index.chunks){
          const text=await fetchText(chunkPath,{revision});
          const part=decodeBase64(text);
          ensureCapacity(offset+part.length);
          bytes.set(part,offset);
          offset+=part.length;
        }

        if(expected>0&&offset!==expected){
          throw new Error(`${url}: gzip byte count mismatch (expected ${expected}, got ${offset})`);
        }
        const payload=bytes.subarray(0,offset);
        if(payload.length<3||payload[0]!==0x1f||payload[1]!==0x8b||payload[2]!==0x08){
          throw new Error(`${url}: invalid gzip header`);
        }
        if(typeof DecompressionStream!=='function'){
          throw new Error('This browser does not support DecompressionStream(gzip)');
        }

        let decodedText;
        try{
          const stream=new Blob([payload]).stream().pipeThrough(new DecompressionStream('gzip'));
          decodedText=await new Response(stream).text();
        }catch(error){
          throw new Error(`${url}: gzip decompression failed: ${error?.message||error}`);
        }

        let decoded;
        try{decoded=JSON.parse(decodedText)}catch(error){throw new Error(`${url}: decompressed JSON is invalid: ${error.message}`)}
        return {...index,...decoded,records:Array.isArray(decoded?.records)?decoded.records:[],_datasetRevision:revision};
      }

      if(Array.isArray(index.chunks)){
        const chunks=await Promise.all(index.chunks.map(path=>loadJson(path,{revision})));
        return {...index,records:chunks.flatMap(x=>x?.records||[]),_datasetRevision:revision};
      }

      return {...index,_datasetRevision:revision};
    })().catch(error=>{
      datasetCache.delete(key);
      throw error;
    });

    datasetCache.set(key,task);
    return task;
  }

  function clear(url){
    if(url)datasetCache.delete(absolute(url));
    else datasetCache.clear();
  }

  window.MorimensDtideDataLoader={loadDataset,loadJson,fetchText,clear};
})();
