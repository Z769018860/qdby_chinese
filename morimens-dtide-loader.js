(()=>{
  if(window.MorimensDtideDataLoader)return;

  const datasetCache=new Map();
  const jsonCache=new Map();
  const rankCache=new Map();
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
    // Revisioned URLs are immutable, so they may come from the HTTP cache; unversioned ones are revalidated (304) instead of re-downloaded.
    const response=await fetch(target,{cache:revision?'force-cache':(fresh?'no-cache':'force-cache')});
    if(!response.ok)throw new Error(`${url}: HTTP ${response.status}`);
    return response.text();
  }

  async function loadJson(url,{revision='',fresh=false}={}){
    const target=versioned(url,revision);
    if(jsonCache.has(target))return jsonCache.get(target);  // also de-duplicates concurrent loads of the same URL
    const task=(async()=>{
      const response=await fetch(target,{cache:revision?'force-cache':(fresh?'no-cache':'force-cache')});
      if(!response.ok)throw new Error(`${url}: HTTP ${response.status}`);
      return response.json();
    })().catch(error=>{jsonCache.delete(target);throw error});
    jsonCache.set(target,task);
    return task;
  }

  function sanitizeJsonStringControls(text){
    let out='',inString=false,escaped=false;
    for(let i=0;i<text.length;i++){
      const ch=text[i],code=text.charCodeAt(i);
      if(inString){
        if(escaped){out+=ch;escaped=false;continue}
        if(ch==='\\'){out+=ch;escaped=true;continue}
        if(ch==='"'){out+=ch;inString=false;continue}
        if(code<0x20){out+=' ';continue}
        out+=ch;
      }else{
        out+=ch;
        if(ch==='"')inString=true;
      }
    }
    return out;
  }

  function rankMapFromText(text){
    const map=new Map();
    const addRows=doc=>{
      for(const row of doc?.rows||[]){
        const uid=String(row?.uid??''),rank=Number(row?.rank);
        if(uid&&Number.isFinite(rank)&&rank>0)map.set(uid,rank);
      }
    };
    try{addRows(JSON.parse(text))}catch(_){
      try{addRows(JSON.parse(sanitizeJsonStringControls(text)))}catch(__){}
    }
    if(map.size)return map;
    const rankThenUid=/"rank"\s*:\s*(\d+)\s*,\s*"uid"\s*:\s*"?([0-9]+)"?/g;
    for(const m of text.matchAll(rankThenUid)){
      const rank=Number(m[1]),uid=String(m[2]||'');
      if(uid&&Number.isFinite(rank)&&rank>0)map.set(uid,rank);
    }
    return map;
  }

  async function loadRankMap(url,{revision='',fresh=true}={}){
    const target=versioned(url,revision);
    if(rankCache.has(target))return rankCache.get(target);
    const task=(async()=>{
      const text=await fetchText(url,{revision,fresh});
      const map=rankMapFromText(text);
      if(!map.size)throw new Error(`${url}: no usable rank rows`);
      return map;
    })().catch(error=>{rankCache.delete(target);throw error});
    rankCache.set(target,task);
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

  // ---------------------------------------------------------------------------
  // gzip-base64-chunked-v2: the same .b64 shard delivery, but the decompressed
  // payload is a table-driven layout (entity tables + string pool + positional
  // arrays).  It carries exactly the same facts; expandV2 rebuilds the plain
  // record objects the rest of the page already understands.
  // ---------------------------------------------------------------------------
  function expandV2(decoded){
    const pool=decoded.pool||[],f=decoded.f||{};
    const S=i=>(i===undefined||i===null||i<0)?null:pool[i];
    const chars=decoded.chars||[],wheels=decoded.wheels||[],covs=decoded.covs||[],
          creas=decoded.creas||[],tokens=decoded.tokens||[],stages=decoded.stages||[],
          waveKeys=decoded.waveKeys||[];
    const attrById=new Map((decoded.attrs||[]).map(a=>[a[0],a]));
    const tc=decoded.trinketConst||null,enl=decoded.enl||null,pad=decoded.urlPad||null;
    const sid=decoded.seasonId,src=decoded.src;
    const unpackTrinkets=pieces=>{
      if(!tc||!Array.isArray(pieces))return pieces;
      return pieces.map(p=>({
        id:p[0],name:S(p[1]),image:tc.image,rarity:S(tc.rarity),slot:p[2],level:p[3],
        enhanceLevel:tc.enhance,breakLevel:tc.break,
        attrs:(p[5]||[]).map(a=>{const at=attrById.get(a[0]);
          return {id:a[0],name:at?S(at[1]):null,value:a[1],percentage:at?!!at[2]:false,rollQuality:a[2]}}),
        suitId:p[4],bound:tc.bound===1
      }));
    };
    const records=(decoded.recs||[]).map(row=>{
      let slot=5;
      const uid=S(row[2]);
      let currentScore;
      if(f.cs)currentScore=row[3];else currentScore=row[slot++];
      let url;
      if(f.url&&pad)url=pad[0]+uid+pad[1];else url=S(row[slot++]);
      let transport;
      if(f.src)transport=src;else transport=S(row[slot++]);
      const waves=(row[4]||[]).map(w=>{
        const wk=waveKeys[w[0]]||[];
        return {
          wave:wk[0],madness:wk[1],
          teams:(w[1]||[]).map(t=>{
            const st=stages[t[0]]||[];
            const ti=t[4];let token=null;
            if(ti!==undefined&&ti!==null&&ti>=0){const tk=tokens[ti]||[];token={id:tk[0],name:S(tk[1])}}
            return {
              stageName:S(st[0]),score:t[1],clearType:S(t[2]),token:token,
              creations:(t[5]||[]).map(c=>{const cr=creas[c]||[];return {id:cr[0],name:S(cr[1])}}),
              battleUuid:S(t[3]),
              members:(t[6]||[]).map(m=>{
                const ch=chars[m[0]]||[];
                let ms=10,canonicalName;
                if(f.canon)canonicalName=S(ch[1]);else canonicalName=S(m[ms++]);
                let tier,label;
                if(f.enl&&enl){tier=S(enl[0]);label=S(enl[1])}
                else{const e=m[ms++]||[];tier=S(e[0]);label=S(e[1])}
                const member={
                  name:S(ch[1]),canonicalName:canonicalName,ingameId:S(ch[2]),realm:S(ch[3]),role:S(ch[4]),
                  level:m[1],potencyLevel:m[2],
                  wheels:(m[7]||[]).map(x=>{const wh=wheels[x[0]]||[];return {id:wh[0],name:S(wh[1]),level:x[1]}}),
                  covenants:(m[8]||[]).map(x=>{const cv=covs[x[0]]||[];return {id:cv[0],name:S(cv[1]),count:x[1]}}),
                  borrowed:m[5]===1,assistUid:S(m[6]),tid:ch[0],breakLevel:m[3],levelLimitIncreaseIdx:m[4]
                };
                if(m[9]!==undefined&&m[9]!==null)member.trinkets=unpackTrinkets(m[9]);
                member.enlightTier=tier;member.enlightTierLabel=label;
                return member;
              }),
              difficulty:S(st[1]),difficultyLabel:S(st[2])
            };
          }),
          stageGroupId:wk[2],stageTid:wk[3]
        };
      });
      return {rank:row[0],player:S(row[1]),uid:uid,score:row[3],currentScore:currentScore,
              url:url,seasonId:sid,waves:waves,sourceTransport:transport};
    });
    return {seasonId:sid,records:records};
  }

  function expandBattlesV2(decoded){
    const uuids=decoded.uuids||[],fields=decoded.fields||[],cols=decoded.bc||[],
          tids=decoded.tids||[],mf=decoded.mf||{},n=mf.n||4,flat=mf.c||[];
    const total=(flat[0]||[]).length,rows=new Array(total);
    for(let i=0;i<total;i++){
      const row=[tids[flat[0][i]]];
      for(let c=1;c<n;c++)row.push(flat[c]?flat[c][i]:null);
      rows[i]=row;
    }
    const groups=[];let pos=0;
    if(mf.per){for(let i=0;i<total;i+=mf.per)groups.push(rows.slice(i,i+mf.per))}
    else{const counts=mf.counts||[];for(let i=0;i<counts.length;i++){groups.push(rows.slice(pos,pos+counts[i]));pos+=counts[i]}}
    const battles={};
    for(let i=0;i<uuids.length;i++){
      const b={};
      for(let j=0;j<fields.length;j++)b[fields[j]]=cols[j]?cols[j][i]:null;
      const u=String(uuids[i]||'');
      const key=u.length===32?`${u.slice(0,8)}-${u.slice(8,12)}-${u.slice(12,16)}-${u.slice(16,20)}-${u.slice(20)}`:u;
      battles[key]={b:b,m:groups[i]||[]};
    }
    return {seasonId:decoded.seasonId,battles:battles};
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

      if(index.format==='gzip-base64-chunked-v2'){
        if(!Array.isArray(index.chunks)||!index.chunks.length)throw new Error(`${url}: gzip index has no chunks`);
        const expected=Number(index.compressedBytes||index.chunkBytes||0);
        let bytes=expected>0?new Uint8Array(expected):new Uint8Array(0);
        let offset=0;
        const ensureCapacity=needed=>{
          if(needed<=bytes.length)return;
          const size=Math.max(needed,bytes.length?bytes.length*2:1024*1024);
          const next=new Uint8Array(size);
          next.set(bytes);
          bytes=next;
        };
        for(const chunkPath of index.chunks){
          const text=await fetchText(chunkPath,{revision});
          const part=decodeBase64(text);
          ensureCapacity(offset+part.length);
          bytes.set(part,offset);
          offset+=part.length;
        }
        if(expected>0&&offset!==expected)throw new Error(`${url}: gzip byte count mismatch (expected ${expected}, got ${offset})`);
        const payload=bytes.subarray(0,offset);
        if(payload.length<3||payload[0]!==0x1f||payload[1]!==0x8b||payload[2]!==0x08)throw new Error(`${url}: invalid gzip header`);
        if(typeof DecompressionStream!=='function')throw new Error('This browser does not support DecompressionStream(gzip)');
        let decodedText;
        try{
          const stream=new Blob([payload]).stream().pipeThrough(new DecompressionStream('gzip'));
          decodedText=await new Response(stream).text();
        }catch(error){throw new Error(`${url}: gzip decompression failed: ${error?.message||error}`)}
        let decoded;
        try{decoded=JSON.parse(decodedText)}catch(error){throw new Error(`${url}: decompressed JSON is invalid: ${error.message}`)}
        const expanded=decoded&&decoded.kind==='battles'?expandBattlesV2(decoded):expandV2(decoded);
        return {...index,...expanded,_datasetRevision:revision};
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
    if(!url)rankCache.clear();
  }

  window.MorimensDtideDataLoader={loadDataset,loadJson,loadRankMap,fetchText,clear};
})();
