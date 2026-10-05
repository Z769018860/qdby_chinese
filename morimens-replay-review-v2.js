// Morimens full replay review v2
// Fetches the public BattleReplay object by battleUuid and decodes it entirely in-browser.
// Format verified from game traffic: JSON-ish compStr -> LZ4 frame -> MessagePack;
// each recordZip -> LZ4 frame -> MessagePack. No login/session/TLS keys are required.
(()=>{
  'use strict';
  const PUBLIC_BASE='https://z1g-warreport.qookkagames.com/publish/BattleReplay_';
  const LOCAL_BASE='data/morimens/replay';
  const MAX_BYTES=20_000_000;
  const isEn=()=>localStorage.getItem('morimens.language')==='en';
  const ui=(zh,en)=>isEn()?en:zh;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>(Number(n)||0).toLocaleString(isEn()?'en-US':'zh-CN');
  const uuidRe=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const decoder=new TextDecoder('utf-8');
  const strictDecoder=new TextDecoder('utf-8',{fatal:true});
  const cache=new Map();

  function parseReplayCode(raw){
    const text=String(raw||'').trim();
    const m=text.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:#([^#\s]+)#([^#\s]+))?/i);
    if(!m)return null;
    return {raw:text,uuid:m[1].toLowerCase(),tag1:m[2]||'',tag2:m[3]||''};
  }
  function latin1(bytes){
    let out=''; const CHUNK=0x8000;
    for(let i=0;i<bytes.length;i+=CHUNK) out+=String.fromCharCode(...bytes.subarray(i,Math.min(bytes.length,i+CHUNK)));
    return out;
  }
  function stringToBytes8(s){
    const out=new Uint8Array(s.length); for(let i=0;i<s.length;i++) out[i]=s.charCodeAt(i)&255; return out;
  }
  function readU32LE(a,p){return (a[p]|(a[p+1]<<8)|(a[p+2]<<16)|(a[p+3]<<24))>>>0}
  function readU64LE(a,p){
    const lo=BigInt(readU32LE(a,p)),hi=BigInt(readU32LE(a,p+4));return Number((hi<<32n)|lo);
  }

  function lz4Frame(input){
    const src=input instanceof Uint8Array?input:new Uint8Array(input); let p=0;
    if(src.length<7||src[0]!==0x04||src[1]!==0x22||src[2]!==0x4d||src[3]!==0x18)throw new Error('Expected LZ4 frame');
    p=4; const flg=src[p++]; p++; // BD
    const blockChecksum=!!(flg&0x10),contentSizeFlag=!!(flg&0x08),contentChecksum=!!(flg&0x04),dictFlag=!!(flg&0x01);
    let contentSize=0;if(contentSizeFlag){contentSize=readU64LE(src,p);p+=8}if(dictFlag)p+=4;p+=1;
    let cap=Math.max(contentSize||0,src.length*4,65536),out=new Uint8Array(cap),op=0;
    const ensure=n=>{if(n<=out.length)return;let c=out.length;while(c<n)c=Math.max(c*2,n);const z=new Uint8Array(c);z.set(out);out=z};
    const decompressBlock=(end)=>{
      while(p<end){
        const token=src[p++];let lit=token>>>4;if(lit===15){let x;do{x=src[p++];lit+=x}while(x===255&&p<end)}
        ensure(op+lit+16);out.set(src.subarray(p,p+lit),op);p+=lit;op+=lit;if(p>=end)break;
        if(p+2>end)throw new Error('LZ4 truncated offset');const off=src[p]|(src[p+1]<<8);p+=2;if(!off||off>op)throw new Error('LZ4 invalid offset');
        let ml=token&15;if(ml===15){let x;do{x=src[p++];ml+=x}while(x===255&&p<end)}ml+=4;ensure(op+ml+16);
        let from=op-off;for(let i=0;i<ml;i++)out[op++]=out[from+i];
      }
    };
    while(p+4<=src.length){
      const raw=readU32LE(src,p);p+=4;if(raw===0)break;const plain=!!(raw&0x80000000),size=raw&0x7fffffff,end=p+size;if(end>src.length)throw new Error('LZ4 truncated block');
      if(plain){ensure(op+size);out.set(src.subarray(p,end),op);op+=size;p=end}else decompressBlock(end);
      if(blockChecksum)p+=4;
    }
    if(contentChecksum&&p+4<=src.length)p+=4;
    return out.slice(0,op);
  }

  class Msgpack {
    constructor(bytes){this.a=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);this.p=0;this.v=new DataView(this.a.buffer,this.a.byteOffset,this.a.byteLength)}
    need(n){if(this.p+n>this.a.length)throw new Error('MessagePack truncated')}
    u8(){this.need(1);return this.a[this.p++]}
    u16(){this.need(2);const x=this.v.getUint16(this.p,false);this.p+=2;return x}
    u32(){this.need(4);const x=this.v.getUint32(this.p,false);this.p+=4;return x}
    i8(){this.need(1);const x=this.v.getInt8(this.p);this.p++;return x}
    i16(){this.need(2);const x=this.v.getInt16(this.p,false);this.p+=2;return x}
    i32(){this.need(4);const x=this.v.getInt32(this.p,false);this.p+=4;return x}
    u64(){this.need(8);const x=this.v.getBigUint64(this.p,false);this.p+=8;return Number(x)}
    i64(){this.need(8);const x=this.v.getBigInt64(this.p,false);this.p+=8;return Number(x)}
    bytes(n){this.need(n);const x=this.a.slice(this.p,this.p+n);this.p+=n;return x}
    // recordZips are LZ4 frames stored with MessagePack str headers; keep non-UTF-8 payloads as raw bytes
    str(n){const b=this.bytes(n);if(b.length>3&&b[0]===0x04&&b[1]===0x22&&b[2]===0x4d&&b[3]===0x18)return b;try{return strictDecoder.decode(b)}catch{return b}}
    arr(n){const a=new Array(n);for(let i=0;i<n;i++)a[i]=this.read();return a}
    map(n){const o={};for(let i=0;i<n;i++){let k=this.read();if(k instanceof Uint8Array){try{k=decoder.decode(k)}catch{k=String(k)}}o[String(k)]=this.read()}return o}
    ext(n){const type=this.i8();return {$extType:type,$data:this.bytes(n)}}
    read(){
      const b=this.u8();if(b<=0x7f)return b;if(b>=0xe0)return b-256;
      if((b&0xf0)===0x80)return this.map(b&15);if((b&0xf0)===0x90)return this.arr(b&15);if((b&0xe0)===0xa0)return this.str(b&31);
      switch(b){
        case 0xc0:return null;case 0xc2:return false;case 0xc3:return true;
        case 0xc4:return this.bytes(this.u8());case 0xc5:return this.bytes(this.u16());case 0xc6:return this.bytes(this.u32());
        case 0xc7:return this.ext(this.u8());case 0xc8:return this.ext(this.u16());case 0xc9:return this.ext(this.u32());
        case 0xca:{this.need(4);const x=this.v.getFloat32(this.p,false);this.p+=4;return x}case 0xcb:{this.need(8);const x=this.v.getFloat64(this.p,false);this.p+=8;return x}
        case 0xcc:return this.u8();case 0xcd:return this.u16();case 0xce:return this.u32();case 0xcf:return this.u64();
        case 0xd0:return this.i8();case 0xd1:return this.i16();case 0xd2:return this.i32();case 0xd3:return this.i64();
        case 0xd4:return this.ext(1);case 0xd5:return this.ext(2);case 0xd6:return this.ext(4);case 0xd7:return this.ext(8);case 0xd8:return this.ext(16);
        case 0xd9:return this.str(this.u8());case 0xda:return this.str(this.u16());case 0xdb:return this.str(this.u32());
        case 0xdc:return this.arr(this.u16());case 0xdd:return this.arr(this.u32());case 0xde:return this.map(this.u16());case 0xdf:return this.map(this.u32());
        default:throw new Error('Unsupported MessagePack byte 0x'+b.toString(16));
      }
    }
  }
  const unpack=b=>new Msgpack(b).read();
  const unpackLz4Msgpack=b=>unpack(lz4Frame(b));

  async function fetchReplay(uuid){
    if(!uuidRe.test(uuid))throw new Error('Invalid battleUuid');if(cache.has(uuid))return cache.get(uuid);
    const task=(async()=>{
      const url=`${PUBLIC_BASE}${uuid}.json`;const r=await fetch(url,{method:'GET',mode:'cors',credentials:'omit',cache:'no-store'});
      if(!r.ok)throw new Error(`BattleReplay HTTP ${r.status}`);const body=new Uint8Array(await r.arrayBuffer());if(body.length>MAX_BYTES)throw new Error('Replay object exceeds 20 MB');
      const env=JSON.parse(latin1(body));if(typeof env.compStr!=='string')throw new Error('Replay compStr missing');
      const root=unpackLz4Msgpack(stringToBytes8(env.compStr));if(!root||!Array.isArray(root.recordZips))throw new Error('Unexpected replay structure');
      const segments=root.recordZips.map(blob=>unpackLz4Msgpack(blob));
      return {replayUuid:uuid,sourceUrl:url,access:'anonymous HTTPS GET',format:'compStr -> LZ4 -> MessagePack; recordZips -> LZ4 -> MessagePack',battleDat:root.battleDat||{},resourceRecords:root.resourceRecords||{},recordSegments:segments,recordCount:segments.reduce((n,s)=>n+(Array.isArray(s)?s.length:0),0)};
    })();cache.set(uuid,task);try{const x=await task;cache.set(uuid,x);return x}catch(e){cache.delete(uuid);throw e}
  }

  function pipeName(x){const s=String(x||'');const i=s.indexOf('|');return i>=0?s.slice(i+1):s}
  function tailCn(x){const s=String(x||'');const i=s.lastIndexOf('@');return i>=0?s.slice(i+1):s}
  function resources(full){
    const rr=full.resourceRecords||{};
    // most replays ship no RelicConfig: fill the gaps from the union of relic / state / command records seen in other replays
    if(relicFallback&&!rr.__relicFilled){Object.defineProperty(rr,'__relicFilled',{value:1,enumerable:false});for(const [tbl,src] of [['RelicConfig',relicFallback.relic],['State',relicFallback.state],['Cmd',relicFallback.cmd]]){if(!src)continue;const t=rr[tbl]=rr[tbl]||{};for(const [k,v] of Object.entries(src))if(!t[k])t[k]=v}}
    // relics whose RelicConfig no replay ships: rebuild a minimal record from the relic's own state ("状态@星辰篇<名称>") found in the State table
    if(!rr.__relicSynth&&rr.State){Object.defineProperty(rr,'__relicSynth',{value:1,enumerable:false});
      const idx=new Map();for(const [sid,r0] of Object.entries(rr.State)){const m=String(r0.CnID||'').match(/^状态@(?:[^@]{0,6}篇)?(.+?)(?:Pro)?$/);if(m){if(!idx.has(m[1]))idx.set(m[1],[]);idx.get(m[1]).push(sid)}
        const nk=pipeName(String(r0.Name||'')).replace(/<[^>]+>/g,'').trim();if(nk&&/^维度影像/.test(nk)&&/^状态@星辰篇/.test(String(r0.CnID||''))&&!/效果|计数|标记/.test(String(r0.CnID||''))){if(!idx.has(nk))idx.set(nk,[]);if(!idx.get(nk).includes(sid))idx.get(nk).push(sid)}}
      const rcT=rr.RelicConfig=rr.RelicConfig||{};
      for(const r1 of full.battleDat?.relics||[]){const tid=String(r1.tid);if(rcT[tid])continue;const cat=relicCatalog[tid],zh=String(cat?.zh||'');if(!zh)continue;const plus=/\+$/.test(zh),base=zh.replace(/\+$/,''),sids=idx.get(base);if(!sids||!sids.length)continue;
        const desc=pipeName(rr.State[sids[0]].Desc||'').replace(/(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)/g,(m,x,y)=>plus?y:x);
        rcT[tid]={ID:Number(tid),Name:'x|'+zh,Desc:'x|'+desc,BattleDesc:'x|'+desc,State1:sids.map(Number),StatePara:[],synthesized:true}}}
    const skill=rr.Skill||{},aw=rr.AwakerConfig||{},state=rr.State||{},relic=rr.RelicConfig||{},monster=rr.MonsterConfig||{};
    const nameSkill=id=>{const x=skill[String(id)]||{};return pipeName(x.Name)||tailCn(x.CnID)||String(id)};
    const nameState=id=>{const x=state[String(id)]||{};return pipeName(x.Name)||tailCn(x.CnID)||`State ${id}`};
    const nameRelic=id=>{const x=relic[String(id)]||{};return pipeName(x.Name)||tailCn(x.CnID)||(()=>{const c=relicCatalog[String(id)];return c?(isEn()?c.en||c.zh:c.zh||c.en):''})()||`Relic ${id}`};
    const nameAw=id=>{const x=aw[String(id)]||{};return isEn()?(x.NameEn||pipeName(x.Name)||String(id)):(pipeName(x.Name)||x.NameEn||String(id))};
    const nameMonster=id=>{const x=monster[String(id)]||{};const bestiary=pipeName(x.MonsterName)||pipeName(x.Name);return isEn()?(x.NameEn||bestiary||tailCn(x.CnID)||String(id)):(bestiary||tailCn(x.CnID)||x.NameEn||String(id))};
    const clean=f=>id=>String(f(id)).replace(/^日服[^命密造]{0,8}(?:插画)?(?:命轮|密契|造物)/,'').replace(/<[A-Za-z0-9_]+:([^<>]*)>/g,'$1').replace(/<\/?[A-Za-z][^<>]*>/g,'').trim();
    return {rr,skill,aw,state,relic,monster,nameSkill:clean(nameSkill),nameState:clean(nameState),nameRelic:clean(nameRelic),nameAw:clean(nameAw),nameMonster:clean(nameMonster)};
  }

  // ---- icons / entity resolution -------------------------------------------------
  const ART='assets/morimens';
  let awakenerSlugs=null;
  let gearCatalog=null,relicCatalog={},relicFallback=null,stageRef=null;
  async function preloadAssets(){
    if(!relicCatalog.loaded){try{const r=await fetch('data/morimens/replay-relics.json',{cache:'force-cache'});relicCatalog={loaded:1,...(r.ok?(await r.json()).relics:{})}}catch{relicCatalog={loaded:1}}}
    if(!stageRef){try{const r=await fetch('data/morimens/replay/stage-rounds.json',{cache:'force-cache'});stageRef=r.ok?await r.json():{}}catch{stageRef={}}}
    if(!relicFallback){try{const r=await fetch('data/morimens/replay-relic-config.json',{cache:'force-cache'});relicFallback=r.ok?await r.json():{}}catch{relicFallback={}}}
    if(!gearCatalog){try{const r=await fetch('data/morimens/replay-gear.json',{cache:'force-cache'});gearCatalog=r.ok?await r.json():{wheels:{},covenants:{}}}catch{gearCatalog={wheels:{},covenants:{}}}}
    if(awakenerSlugs)return;
    try{const r=await fetch('data/morimens/skeydb/awakeners.json',{cache:'force-cache'});const j=await r.json();awakenerSlugs=new Map((j.records||[]).map(x=>[String(x.ingameId).toUpperCase(),x.assetSlug]))}
    catch{awakenerSlugs=new Map()}
  }
  const baseName=p=>String(p||'').split('/').pop().replace(/\.[a-z0-9]+$/i,'');
  const safeGlyph=s=>(Array.from(String(s||'?'))[0]||'?').replace(/["'\\<>&]/g,'?');
  function ico(src,fallback,cls='',title=''){
    return `<span class="mr2ico ${cls}" style="--f:'${safeGlyph(fallback)}'"${title?` title="${esc(title)}"`:''}>${src?`<img src="${esc(src)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`:''}</span>`;
  }
  function awakenerPortrait(res,tid){
    const code=String(res.aw[String(tid)]?.Item_LittleIcon||'').match(/Awaker_([A-Za-z0-9]+)_/);
    const slug=code&&awakenerSlugs?.get(code[1].toUpperCase());
    return slug?`${ART}/portraits/${slug}.webp`:'';
  }
  const stateIconSrc=(res,id)=>{const ic=res.state[String(id)]?.Icon;return ic?`${ART}/skeydb-icons/${baseName(ic)}.webp`:''};
  const relicIconSrc=(res,tid)=>{const r=res.relic[String(tid)]||{};const ic=r.SmallIcon||r.Icon;if(ic)return `${ART}/relics/${baseName(ic)}.webp`;const c=relicCatalog[String(tid)];return c?.icon?`${ART}/relics/${c.icon}.webp`:''};
  const keeperSkillIconSrc=(res,id)=>{const m=String(res.skill[String(id)]?.Icon||'').match(/Key_(\d+)/);return m?`${ART}/posse/Icon/KeyToken_Skill_${m[1]}.webp`:''};


  const monsterPortrait=(res,tid)=>{const b=baseName(res.monster[String(tid)]?.MiniIcon);return b?`${ART}/monster-preview/${b}.webp`:''};

  // ---- description engine (tooltips / expandable details) ----------------------------
  const asList=v=>Array.isArray(v)?v:(v==null||v===''?[]:typeof v==='object'?Object.values(v):[v]);
  const stripMarkup=t=>String(t||'').replace(/<[A-Za-z0-9_]+:([^<>]*)>/g,'$1').replace(/<\/?[A-Za-z][^<>]*>/g,'');
  function pickVariant(v,level){
    if(v==null)return '';if(typeof v==='string')return v;if(Array.isArray(v))return pickVariant(v[0],level);
    const keys=Object.keys(v).filter(k=>!isNaN(Number(k))).sort((a,b)=>a-b);if(!keys.length)return '';
    let k=keys[0];for(const n of keys)if(Number(n)<=(Number(level)||0))k=n;return v[k]??'';
  }
  const fmtArg=v=>typeof v==='number'?(Number.isInteger(v)?fmt(v):String(Math.round(v*100)/100)):String(v);
  function fillArgs(text,args,extra){
    return stripMarkup(String(text||'').replace(/\[Layer\]/g,extra?.layer!=null?fmtArg(extra.layer):'X').replace(/\[(?:[A-Za-z]+:)?(?:Desc|State)?Arg(\d+)\]/g,(m,n)=>{const v=args?.[Number(n)-1];return v==null?'X':fmtArg(v)})).replace(/\s+\n/g,'\n').trim();
  }
  function splitTop(str){const out=[];let depth=0,cur='';for(const ch of String(str||'')){if(ch==='(')depth++;if(ch===')')depth--;if(ch===','&&!depth){out.push(cur);cur=''}else cur+=ch}if(cur.trim()!=='')out.push(cur);return out}
  function evalNum(expr,ctx){
    let t=String(expr||'').trim();if(!t)return null;
    t=t.replace(/[A-Za-z_][A-Za-z0-9_.]*/g,w=>ctx&&ctx[w]!=null?String(ctx[w]):'#');
    if(!/^[0-9+\-*/(). ]+$/.test(t))return null;
    try{const v=Function(`"use strict";return (${t})`)();return Number.isFinite(v)?Math.round(v*100)/100:null}catch{return null}
  }
  const argList=o=>o&&typeof o==='object'?Array.from({length:Math.max(0,(Number(o.n)||1)-1)},(_,i)=>o[i+1]):null;
  const paramsToArgs=(para,ctx)=>{const p=typeof para==='string'?para:pickVariant(para,0);return splitTop(p).map(x=>evalNum(x,ctx))};
  const TYPE_LABEL={Card_Strike:'打击',Card_Defend:'防御',Card_Skill:'技能牌',Card_Extend:'技能牌',Card_Awake:'灵知觉醒',Card_Curse:'诅咒',Card_Potion:'道具牌',Card_AttachPost:'附带',Ulti_Skill:'狂气爆发',Keeper_Skill:'钥令',Intent_Attack:'敌方·攻击',Intent_HeavyAttack:'敌方·重击',Intent_StrongDebuff:'敌方·强力减益',Intent_Debuff:'敌方·减益',Intent_Buff:'敌方·增益',Intent_Defend:'敌方·防御'};
  const typeLabel=types=>(types||[]).map(t=>TYPE_LABEL[t]||String(t).replace(/^(Card|Intent)_/,'')).filter((x,i,a)=>a.indexOf(x)===i).join(' / ');
  const tipAttr=(title,sub,body)=>` data-tipt="${esc(title)}" data-tips="${esc(sub||'')}" data-tip="${esc(body||'')}"`;
  function skillTip(res,id,o={}){
    const r=res.skill[String(id)];if(!r)return {title:`#${id}`,sub:'',body:''};
    const tpl=pickVariant(r.BattleDesc,o.level)||pickVariant(r.Desc,o.level);
    const args=o.args&&o.args.length?o.args:paramsToArgs(r.Para,o.ctx||{});
    const sub=[typeLabel(asList(r.Type)),r.Cost!=null&&!asList(r.Type).some(t=>/Ulti|Keeper|Intent/.test(t))?`${ui('算力','Cost')} ${r.Cost}`:''].filter(Boolean).join(' · ');
    return {title:res.nameSkill(id),sub,body:fillArgs(pipeName(tpl),args)||ui('（无描述）','(no description)')};
  }
  const skillTipAttr=(res,id,o)=>{const t=skillTip(res,id,o);return tipAttr(t.title,t.sub,t.body)};
  function stateTip(res,sid,o={}){
    const r=res.state[String(sid)]||{};
    let args=o.args&&o.args.length?o.args:null;
    if(!args&&Array.isArray(r.DescPara))args=r.DescPara.map(x=>{const m=String(x).match(/^StateOwner\.(\w+)$/);return m?(o.props?.[m[1]]??null):evalNum(x,o.props||{})});
    const sub=[o.layer>1?`${ui('层数','Layers')} ×${o.layer}`:'',r.ShowType==='Affix'?ui('词缀','Affix'):''].filter(Boolean).join(' · ');
    return {title:res.nameState(sid),sub,body:fillArgs(pipeName(r.Desc||r.WeaponDesc||''),args,{layer:o.layer})||''};
  }
  const stateTipAttr=(res,sid,o)=>{const t=stateTip(res,sid,o);return tipAttr(t.title,t.sub,t.body)};
  const relicTipAttr=(res,tid,args)=>{const r=res.relic[String(tid)]||{};return tipAttr(res.nameRelic(tid),r.Quality||'',fillArgs(pipeName(pickVariant(r.BattleDesc||r.Desc,0)),args&&args.length?args:r.StatePara||[]))};
  const DEBUFF_RE=/易伤|脆弱|中毒|石化|流血|封印|虚弱|诅咒|衰弱|灼烧|恐惧|减速|迟缓|沉默|腐蚀|破甲|畏惧|狂气封印|无用空状态/;
  const stateClass=(res,sid)=>res.state[String(sid)]?.ShowType==='Affix'?'affix':DEBUFF_RE.test(res.nameState(sid))?'debuff':'buff';
  const STAT_NAME={ulti_energy_max:'狂气上限',o_block_per:'护盾强效',block_per_defendcard:'防御牌护盾加成',black_upgrade_plus:'黑印强化',o_heal_per:'治疗强效',block_heal_per:'护盾和治疗强效',crit_damage_from_strikecard:'打击暴击伤害',crit_damage_from_ulti:'爆发暴击伤害',o_damage_per:'基础伤害',o_damage_per_card:'卡牌基础伤害',o_damage_per_strikecard:'打击基础伤害',o_damage_per_attachpost:'追击基础伤害',o_damage_per_ulti:'爆发基础伤害',i_state_layer_per_power:'力量获取效果',ulti_energy_per:'狂气获取效果',awaker_ulti_heal_per:'爆发治疗',awaker_ulti_block_per:'爆发护盾',i_state_layer_per_posion:'中毒施加',i_state_layer_per_counterattack:'反击施加',death_resist:'死亡抵抗',death_resist_times:'死亡抵抗次数',damage_plus:'伤害强效',strikecard_damage_plus:'打击伤害强效',crit:'暴击率',crit_damage:'暴击伤害',tentacle_dmg:'触腕伤害',vulnerable_per:'易伤增幅',frail_per:'脆弱增幅',i_damage_per:'伤害加成',i_basic_damage_per:'基础伤害加成',i_damage_per_strikecard:'打击伤害加成',keeper_energy_eff:'钥能效率',scarlet_blood_count:'胚胎融合度',relic_num_limit:'造物上限',ulti_strength_multiple:'爆发倍率',atk:'攻击',def:'防御',certain_crit:'必暴击',seal_ulti:'狂气封印',bout_ulti_times:'本回合爆发次数',awaked:'觉醒',rewind_bout:'回溯',crit_damage_from_ulti:'爆发暴击伤害',crit_per_from_strikecard:'打击暴击率',awaker_ulti_dmg_per:'爆发伤害加成',damage_per2monster_boss:'对首领增伤',damage_per2petrify_resist:'对石化抗性增伤',max_energy:'算力上限',bout_skill_times:'本回合钥令次数'};
  const SCOPE_NAME={card:'卡牌',strikecard:'打击',ulti:'爆发',attachpost:'追击',defendcard:'防御牌',skill:'技能牌'};
  // generic fallback for property keys shaped like [o_]block|heal|damage_per[_scope]
  const composedStatName=k=>{const m=String(k).match(/^(o_)?(block|heal|damage)_per(?:_([a-z]+))?$/);if(!m)return '';return `${SCOPE_NAME[m[3]]||''}${{block:'护盾',heal:'治疗',damage:'伤害'}[m[2]]}加成`};
  const statName=(res,k)=>STAT_NAME[k]||composedStatName(k)||String(res.rr?.BattleApi?.[k]?.CnID||k).replace(/(唤醒体|角色|卡牌)属性$/,'').trim();
  const STAT_PCT=new Set(['o_block_per','block_per_defendcard','o_heal_per','block_heal_per','o_damage_per_card','o_damage_per_strikecard','o_damage_per_attachpost','o_damage_per_ulti','i_state_layer_per_power','ulti_energy_per','awaker_ulti_heal_per','awaker_ulti_block_per','i_state_layer_per_posion','i_state_layer_per_counterattack','awaker_ulti_dmg_per','o_damage_per','basic_damage_per','crit_damage_from_strikecard','keeper_energy_eff_2','i_basic_damage_per','occupation_master_pct','crit','crit_damage','vulnerable_per','frail_per','i_damage_per','i_basic_damage_per','i_damage_per_strikecard','crit_damage_from_ulti','crit_per_from_strikecard','awaker_ulti_dmg_per','damage_per2monster_boss','damage_per2petrify_resist','ulti_strength_multiple','keeper_energy_eff']);
  // stats shown on each unit of the battlefield board (death resist / blackcoin deliberately left out)
  function boardStats(a,pr){
    const out=[],add=(k,label,v,pct=true)=>{if(v)out.push({k,label,v,pct})};
    if(a.kind==='awakener'){
      add('atk','攻击',pr.atk,false);
      add('crit','暴击率',pr.crit);
      add('crit_damage','暴击伤害',pr.crit_damage);
      add('basic','基础伤害',(pr.basic_damage_per||0)+(pr.i_basic_damage_per||0));
      add('o_damage_per','外部伤害加成',pr.o_damage_per);
      add('idmg','局内增伤',pr.i_damage_per);
      add('keeper_energy_eff','银钥充能',pr.keeper_energy_eff);
      add('strike_crit','打击暴击',pr.crit_per_from_strikecard);
      add('strike_cd','打击暴伤',pr.crit_damage_from_strikecard);
    }else if(a.kind==='keeper'){
      add('occupation_master_final','界域精通',pr.occupation_master_final,false);
      add('keeper_energy_eff_2','银钥充能',pr.keeper_energy_eff_2);
      add('basic','基础伤害',pr.basic_damage_per);
      add('outside_crit','暴击率',pr.outside_crit);
      add('outside_crit_damage','暴击伤害',pr.outside_crit_damage);
    }else if(a.kind==='monster'){
      add('damage_plus','伤害强效',pr.damage_plus,false);
      add('vulnerable_per','易伤增幅',pr.vulnerable_per);
      add('frail_per','脆弱增幅',pr.frail_per);
      add('def','防御',pr.def,false);
      add('atk','攻击',pr.atk,false);
    }
    return out;
  }
  const fmtStat=(k,v)=>{const n=Math.round((Number(v)||0)*10)/10;return `${fmt(n)}${(STAT_PCT.has(k)||/_per(_|$)/.test(k))&&k!=='ulti_strength_multiple'?'%':''}`};
  // card movement between piles
  function moveKind(oldDeck,newDeck,reason){
    if(oldDeck==='DrawDeck'&&newDeck==='HandDeck')return 'draw';
    if(oldDeck==='HandDeck'&&newDeck==='GraveyardDeck')return 'discard';
    if((oldDeck==='HandDeck'||oldDeck==='UsingDeck')&&newDeck==='ConsumedDeck')return 'exhaust';
    if(oldDeck==='GraveyardDeck'&&newDeck==='DrawDeck')return 'shuffle';
    if(oldDeck==='GraveyardDeck'&&newDeck==='HandDeck')return 'retrieve';
    if((oldDeck==='NoneDeck'||oldDeck==='TempDeck1')&&newDeck==='HandDeck')return 'create';
    return null;
  }
  const MOVE_LABEL={draw:'抽牌',discard:'弃牌',exhaust:'消耗',shuffle:'洗牌',retrieve:'取回',create:'获得'};
  function buildEntities(full,res){
    const bd=full.battleDat||{},actors=new Map(),cards=new Map(),relics=new Map(),stateInst=new Map(),cardArgs=new Map(),gearStates=[];let initialCards=null;
    const addActor=(uid,o)=>{if(uid!=null&&!actors.has(String(uid)))actors.set(String(uid),{uid,...o})};
    for(const r of bd.roleData||[])addActor(r.uid,{tid:r.tid,kind:'awakener',name:res.nameAw(r.tid),camp:1,icon:awakenerPortrait(res,r.tid)});
    const addCard=(uid,tid,ownerUid,c)=>{if(uid==null||tid==null)return;const o=cards.get(String(uid));cards.set(String(uid),{uid,tid,ownerUid:ownerUid??o?.ownerUid,level:c?.level??o?.level});const a=c?.descArgs?.curValues;if(Array.isArray(a)&&a.length)cardArgs.set(String(uid),a)};
    for(const seg of full.recordSegments||[])for(const rec of seg||[]){
      const md=rec?.msgData;
      if(rec?.msgId===1001&&md){
        for(const m of md.monsterDataList||[])addActor(m.uid,{tid:m.tid,kind:'monster',name:res.nameMonster(m.tid),camp:2,icon:monsterPortrait(res,m.tid)});
        for(const r of md.roleDataList||[]){
          if(r.roleType===3)addActor(r.uid,{tid:r.tid,kind:'keeper',name:r.playerName||ui('守密人','Keeper'),camp:1,icon:''});
          else if(r.camp===2)addActor(r.uid,{tid:r.tid,kind:'monster',name:res.nameMonster(r.tid),camp:2,icon:monsterPortrait(res,r.tid)});
          else addActor(r.uid,{tid:r.tid,kind:'awakener',name:res.nameAw(r.tid),camp:r.camp||1,icon:awakenerPortrait(res,r.tid)});
        }
        if(!initialCards&&Array.isArray(md.cardDataList))initialCards=md.cardDataList.map(c=>({...c}));
        for(const c of md.cardDataList||[])addCard(c.uid,c.tid??c.configId,c.ownerUid,c);
        for(const r of md.relicDataList||[])if(r.uid!=null)relics.set(String(r.uid),{uid:r.uid,tid:r.tid});
      }
      for(const fr of md?.frameList||[]){
        const d=fr?.data||{},e=fr?.eventId;
        if(e===1046&&d.targetRelicList&&typeof d.targetRelicList==='object')for(const r of Object.values(d.targetRelicList))if(r?.uid!=null)relics.set(String(r.uid),{uid:r.uid,tid:r.tid});
        if(e===1084&&d.relic?.uid!=null)relics.set(String(d.relic.uid),{uid:d.relic.uid,tid:d.relic.tid});
        if(e===1025)for(const c of d.cards||[])addCard(c.uid,c.tid??c.configId,c.ownerUid,c);
        else if(e===1067)addCard(d.uid,d.tid??d.configId,d.ownerUid,d);
        else if(e===1035)addCard(d.cardUid,d.tid??d.configId,d.ownerUid,d);
        else if((e===1004||e===1006)&&d.stateUid!=null){
          stateInst.set(String(d.stateUid),d.stateId);
          const w=(d.source||[]).find(x=>x.sourceType==='Weapon'),cn=String(res.state[String(d.stateId)]?.CnID||'');
          if(w&&!gearStates.some(g=>g.kind==='wheel'&&g.stateId===d.stateId&&String(g.ownerUid)===String(d.ownerUid)))gearStates.push({kind:'wheel',stateId:d.stateId,ownerUid:d.ownerUid,tid:w.tid,params:d.stateParams||[],args:d.descArgs?.curValues,layer:d.layer||1});
          else if(/^状态@饰品/.test(cn)&&!gearStates.some(g=>g.kind==='covenant'&&g.stateId===d.stateId&&String(g.ownerUid)===String(d.ownerUid)))gearStates.push({kind:'covenant',stateId:d.stateId,ownerUid:d.ownerUid,tid:null,params:d.stateParams||[],args:d.descArgs?.curValues,layer:d.layer||1,stem:cn.replace(/^状态@饰品/,'')});
        }
      }
    }
    return {actors,cards,relics,stateInst,cardArgs,gearStates,initialCards:initialCards||[],keeperUid:[...actors.values()].find(a=>a.kind==='keeper')?.uid};
  }

  // ---- skill formula factor: evaluate the first damage entry of a skill's Para with force / coefficient set to 1, so only the
  // character-specific multiplier (Sin marks, Residue layers, death resist ...) is left, e.g. (1+PlayerRole.GetStateLayer(117377)/100)
  const paraCache=new Map();
  function paraFactorFn(res,tid){
    const k=String(tid);if(paraCache.has(k))return paraCache.get(k);
    let fn=null;
    try{
      const pa=res.skill[k]?.Para;let t=pa&&typeof pa==='object'?pa[Object.keys(pa).sort((a,b)=>Number(b)-Number(a))[0]]:pa;
      if(typeof t==='string'){
        const parts=[];let d=0,cur='';for(const ch of t){if(ch==='(')d++;if(ch===')')d--;if(ch===','&&d===0){parts.push(cur);cur=''}else cur+=ch}parts.push(cur);
        const e=parts.find(x=>/Battle(Atk|Def|Physique)Force/.test(x));
        if(e&&/GetStateLayer|CmdCaster\.|PlayerRole\.|HandDeck/.test(e))fn=compileFormula(e);
      }
    }catch{fn=null}
    paraCache.set(k,fn);return fn;
  }
  function compileFormula(e){
    if(!e||/\bnot\b|GetStateParam|Monster|Enemy|CurCard/.test(e)||/GetCard|Deck/.test(e.replace(/HandDeck\.(GetCardCountByID\(\d+\)|CardCount)/g,'')))return null;
    let js=e.replace(/(PlayerRole|CmdCaster|OwnerCard)\.GetStateLayer\((\d+)\)/g,'L("$1",$2)').replace(/(PlayerRole|CmdCaster)\.(\w+)/g,'V("$1","$2")').replace(/math\.(floor|ceil|min|max)/g,'Math.$1').replace(/Battle(Atk|Def|Physique)Force/g,'1').replace(/GrowArgValue\d|GrowValue\d/g,'1').replace(/\band\b/g,'&&').replace(/\bor\b/g,'||').replace(/~=/g,'!=');
    const rest=js.replace(/[LH]\("\w+",\d+\)|V\("\w+","\w+"\)|Math\.(floor|ceil|min|max)/g,'');
    if(!/^[0-9+\-*/().,\s<>=!&|]*$/.test(rest))return null;
    try{return new Function('L','V','H',`return (${js})`)}catch{return null}
  }
  const plusCache=new Map();
  function paraPlusFn(res,tid){const k=String(tid);if(!plusCache.has(k)){const pp=res.skill[k]?.ParaPlus;plusCache.set(k,typeof pp==='string'?compileFormula(pp):null)}return plusCache.get(k)}
  // skills that copy a hand card and cut its cost ("将其 [Arg7] 张…复制置入手中，使其算力消耗 -[Arg6]"): which displayed numbers are the copies / the cost cut
  const copyMemo=new Map();
  function copyCutInfo(res,tid){
    const k=String(tid);if(copyMemo.has(k))return copyMemo.get(k);
    let d=res.skill[k]?.Desc;if(d&&typeof d==='object')d=d[Object.keys(d).sort((a,b)=>Number(b)-Number(a))[0]];d=pipeName(String(d||''));
    const order=[];for(const m of d.matchAll(/Arg(\d+)/g))if(!order.includes(m[1]))order.push(m[1]);
    const mk=d.match(/算力消耗\s*-\s*\[Arg(\d+)\]/),mc=d.match(/将其\s*\[Arg(\d+)\]\s*张/);
    const info=mk?{cutPos:order.indexOf(mk[1]),copyPos:mc?order.indexOf(mc[1]):-1}:null;copyMemo.set(k,info);return info;
  }
  // the decoded replay is immutable, and several overlay modules ask for the timeline on every DOM mutation: build it once per replay and language
  const tlCache=new WeakMap();
  function buildTimeline(full){const k=isEn()?'en':'zh',c=tlCache.get(full);if(c&&c.k===k)return c.tl;const tl=buildTimelineRaw(full);tlCache.set(full,{k,tl});return tl}
  function buildTimelineRaw(full){
    const res=resources(full),bd=full.battleDat||{},ent=buildEntities(full,res),{actors,cards,relics,stateInst}=ent;
    const actorOf=uid=>actors.get(String(uid));
    const tipIds=(uid,extra)=>`UID ${uid}${extra?` · ${extra}`:''}`;
    // Resolve any uid (actor / card / relic / state instance) to a readable chip.
    function chip(uid,opts={}){
      if(uid==null)return `<span class="mr2chip unk">—</span>`;
      const a=actorOf(uid);
      if(a){
        const cls=a.kind==='monster'?'mon':a.kind==='keeper'?'keeper':`aw c${a.camp||1}`;
        const fb=a.kind==='keeper'?'守':a.kind==='monster'?'怪':a.name;
        const mr=a.kind==='monster'?res.monster[String(a.tid)]:null,tipA=mr?tipAttr(a.name,[mr.MonsterClass,mr.BattleTag].filter(Boolean).join(' · '),pipeName(mr.Desc)):'';
        return `<span class="mr2chip ${cls}" title="${tipA?'':esc(tipIds(uid,`tid ${a.tid??'?'}`))}"${tipA}>${ico(a.icon,fb,'av')}<span>${esc(a.name)}</span></span>`;
      }
      const c=cards.get(String(uid));
      if(c){
        const o=actorOf(c.ownerUid);
        return `<span class="mr2chip card"${skillTipAttr(res,c.tid,{args:ent.cardArgs.get(String(uid)),level:c.level})}>${o?ico(o.icon,o.name,'av sm'):''}<span>「${esc(res.nameSkill(c.tid))}」</span></span>`;
      }
      const r=relics.get(String(uid));
      if(r)return `<span class="mr2chip relic"${relicTipAttr(res,r.tid)}>${ico(relicIconSrc(res,r.tid),'物','rl')}<span>${esc(res.nameRelic(r.tid))}</span></span>`;
      const sid=stateInst.get(String(uid));
      if(sid!=null)return `<span class="mr2chip st"${stateTipAttr(res,sid)}>${ico(stateIconSrc(res,sid),res.nameState(sid),'st')}<span>${esc(res.nameState(sid))}</span></span>`;
      if(String(uid)===String(bd.battleUid)||String(uid)===String(ent.keeperUid))return `<span class="mr2chip keeper" title="${esc(tipIds(uid))}">${ico('','守','av')}<span>${esc(ui('守密人','Keeper'))}</span></span>`;
      return `<span class="mr2chip unk" title="${esc(tipIds(uid))}">${esc(ui('未知对象','Unknown'))} #${esc(uid)}</span>`;
    }
    const plainName=uid=>{const a=actorOf(uid);if(a)return a.name;const c=cards.get(String(uid));if(c)return `「${res.nameSkill(c.tid)}」`;const r=relics.get(String(uid));if(r)return res.nameRelic(r.tid);return `UID ${uid}`};
    const campOf=uid=>actorOf(uid)?.camp||(cards.get(String(uid))&&actorOf(cards.get(String(uid)).ownerUid)?.camp)||0;

    const rounds=new Map();let bout=0,globalSeq=0,frameCount=0,camp=1,phase=0;
    const getRound=n=>{if(!rounds.has(n))rounds.set(n,{round:n,dim:!Number.isInteger(n),events:[]});return rounds.get(n)};
    // relic state evidence: a relic's own states being added / stacked after the opening prove it fired even when no relic-trigger event exists
    const relicOfState=new Map(),relicStateAdds=new Map();
    for(const tid of new Set([...(bd.relics||[]).map(r=>String(r.tid)),...[...res.relic?Object.keys(res.relic):[]]]))for(const [k,v] of Object.entries(res.relic[tid]||{}))if(/^State\d+$/.test(k)&&Array.isArray(v))for(const sid of v){const a=relicOfState.get(String(sid))||[];a.push(tid);relicOfState.set(String(sid),a)}
    const layerSeries=new Map(),dynIds=new Set();
    const layerPeak=new Map();   // owner|stateId -> highest layer seen (to evaluate effects that scale with a state's layer)
    let dimOn=false;const rk=()=>dimOn?bout+.5:bout;   // the Ultra-Space (超维) bout reuses the bout number: it is stored as its own round, bout + .5
    const HEAD_KINDS=['card','ultimate','keeper','skill','enemyact'];
    const push=(kind,label,html,data,raw,meta={})=>{
      if(!bout)return;
      if(kind==='snap'){getRound(rk()).events.push({kind,camp,phase,snap:meta.snap});return}
      const isHead=HEAD_KINDS.includes(kind)||(kind==='trigger'&&camp===2&&actors.get(String(meta.actorUid))?.camp===2);
      getRound(rk()).events.push({seq:++globalSeq,kind,label,html,time:raw.time??null,eventId:raw.eventId,data,camp,phase,...(isHead?{snapBefore:snap()}:{}),...meta});
    };
    const pct=(a,b)=>b>0?Math.max(0,Math.min(100,a/b*100)):0;
    const hpMini=(cur,max,enemy)=>cur!=null&&max>0?`<span class="mr2hpmini${enemy?' enemy':''}" title="${esc(`${fmt(cur)} / ${fmt(max)}`)}"><i style="width:${pct(cur,max).toFixed(1)}%"></i></span><span class="mr2from">${pct(cur,max).toFixed(pct(cur,max)<10?1:0)}%</span>`:'';
    const resLabels={energy:ui('算力','Energy'),keeper_energy:ui('钥令能量','Keyflare'),ulti_energy:ui('狂气','Aliemus'),block:ui('护盾','Shield')};
    const stateBadge=(id,layerText,tip='')=>`<span class="mr2chip st ${stateClass(res,id)}"${tip||stateTipAttr(res,id)}>${ico(stateIconSrc(res,id),res.nameState(id),'st')}<span>${esc(res.nameState(id))}${layerText?` <em>${esc(layerText)}</em>`:''}</span></span>`;

    // Live battlefield: hp / shield / energy per unit and the states each unit currently carries.
    const board=new Map(),bstates=new Map();
    const cardMul=new Map(),FIA_LVL={98466:1,98470:2,98468:3},fiaCard=new Map(),fiaByState=new Map(),fiaUse=new Map();let curFia=null;const cardSt=new Map(),cardStOf=new Map(),handUids=new Set();for(const c of ent.initialCards||[])if(c.deck==='HandDeck')handUids.add(String(c.uid));
    // character-specific formula parts, evaluated against the live state: pf = multiplier inside the damage term of Para,
    // pp = ParaPlus (extra flat damage, e.g. team shield x stacks). Evaluated when the card is played, because that is when the game computes them.
    const evalPara=(tid,caster,cuid)=>{
      const layer=(who,id)=>{let n=0;if(who==='OwnerCard'){for(const v of (cardSt.get(String(cuid))?.values()||[]))if(v.stateId===id)n+=v.layer||0}else if(who==='CmdCaster'){for(const v of (bstates.get(String(caster))?.values()||[]))if(v.stateId===id)n+=v.layer||0}else{for(const [uid,m] of bstates)if(!actors.get(uid)||actors.get(uid).kind==='keeper')for(const v of m.values())if(v.stateId===id)n+=v.layer||0}return n};
      const hand=(k,n)=>{if(k==='size')return handUids.size;let c=0;for(const u of handUids)if(Number(cards.get(u)?.tid)===Number(n))c++;return c};
      const val=(who,key)=>{const u=board.get(String(who==='CmdCaster'?caster:ent.keeperUid))||{};const v=u.props?.[key];if(v!=null)return v;return key==='block'?(u.block||0):key==='hp'?(u.hp||0):key==='max_hp'?(u.max||0):0};
      let pf=1,pp=0;
      try{const f1=paraFactorFn(res,tid);if(f1){const r=Number(f1(layer,val,hand));if(Number.isFinite(r)&&r>0)pf=r}}catch{}
      try{const f2=paraPlusFn(res,tid);if(f2){const r=Number(f2(layer,val,hand));if(Number.isFinite(r))pp=r}}catch{}
      return {pf,pp}};
    const fiaBonus=()=>{let B=0;for(const [uid,m] of bstates)if(!actors.get(uid)||actors.get(uid).kind==='keeper')for(const v of m.values())if(v.stateId===98469||v.stateId===133285)B+=v.layer||0;return B};
    const fiaPct=(role,lvl)=>lvl*(30+fiaBonus());
    const PROP={hp:'hp',max_hp:'max',block:'block',energy:'energy',max_energy:'maxEnergy',ulti_energy:'ulti',ulti_energy_max:'ultiMax',keeper_energy:'kEnergy',max_keeper_energy:'kMax'};
    const unit=uid=>{const k=String(uid);if(!board.has(k))board.set(k,{});return board.get(k)};
    const openProps=new Map();
    const applyRoleSnapshot=r=>{if(r?.uid==null)return;const u=unit(r.uid),p=r.properties;if(p&&typeof p==='object'&&!Array.isArray(p)&&!openProps.has(String(r.uid)))openProps.set(String(r.uid),{...p});if(p&&typeof p==='object'&&!Array.isArray(p)){u.props=u.props||{};for(const k in p)if(typeof p[k]==='number')u.props[k]=p[k];for(const k in PROP)if(p[k]!=null)u[PROP[k]]=p[k]}if(r.skillArgs&&typeof r.skillArgs==='object')u.skillArgs=r.skillArgs};
    const stateMap=uid=>{const k=String(uid);if(!bstates.has(k))bstates.set(k,new Map());return bstates.get(k)};
    const snap=()=>{const units=[];for(const [uid,a] of actors){const u=board.get(uid)||{},pr=u.props||{};
      const stats=boardStats(a,pr);
      const intentTip=a.kind==='monster'&&u.intent?skillTipAttr(res,u.intent,{ctx:{BattleAtkForce:pr.atk}}):'';
      units.push({uid:a.uid,hp:u.hp,max:u.max,block:u.block,energy:u.energy,maxEnergy:u.maxEnergy,ulti:u.ulti,ultiMax:u.ultiMax,kEnergy:u.kEnergy,kMax:u.kMax,intent:u.intent,intentTip,stats,
        states:[...(bstates.get(uid)?.values()||[])].map(x=>({stateId:x.stateId,layer:x.layer,tip:stateTipAttr(res,x.stateId,{args:x.args,layer:x.layer,props:pr})}))})}return {units}};
    const intents=new Map();let lastStats=null,lastDim=0,finishStats=null,deathResistN=0,healNom=0,healAct=0;const killed=new Set();const keeperPicks=[];
    // Relic buff accounting. Power / basic-damage relics are matched to the state & property
    // changes that follow their trigger frame, then every later hit is split by the share of
    // that bonus in the caster's total (an estimate: the replay carries no damage formula).
    const relicKind=tid=>{const rec=res.relic[String(tid)]||{};const t=pipeName(pickVariant(rec.BattleDesc||rec.Desc,0));return /力量/.test(t)?'power':/基础伤害/.test(t)?'basic':null};
    const relicDebuff=new Map(),relicCond=new Map();
    // "打出卡牌后，若手牌数小于等于 N，抽 M 张牌，每回合最多触发 K 次": each qualifying card play is one trigger (estimated from the hand size)
    const condRelics=(bd.relics||[]).map(r=>{const rec=res.relic[String(r.tid)]||{},t=pipeName(pickVariant(rec.BattleDesc||rec.Desc,0))||'',pa=rec.StatePara||[],tok=x=>{const m=String(x).match(/\[Arg(\d)\]/);return m?Number(pa[m[1]-1]):Number(x)},T='(\\[Arg\\d\\]|\\d+)',
      m=t.match(new RegExp('(?:打出卡牌后[，,]?\\s*若|当)手牌数(?:小于等于|不超过|小于)\\s*'+T+'\\s*(?:时)?[，,]?[^。]*?抽\\s*'+T+'\\s*张牌[^。]*?每回合最多触发\\s*'+T));return m?{tid:String(r.tid),hand:tok(m[1]),draw:tok(m[2]),cap:tok(m[3]),per:new Map()}:null}).filter(x=>x&&Number.isFinite(x.hand));
    const relicTxt=tid=>{const rec=res.relic[String(tid)]||{};return (pipeName(pickVariant(rec.BattleDesc||rec.Desc,0))||'').replace(/<[A-Za-z0-9_]+:([^<>]*)>/g,'$1').replace(/<\/?[A-Za-z][^<>]*>/g,'')};
    const RELIC_GEN={crit:['critrate',/暴击率/],crit_damage:['crit',/暴击伤害/],i_damage_per:['final',/最终伤害/],o_damage_per:['out',/(?<!基础)伤害(?:提高|增加|提升)/]};
    const relicBuffs=new Map(),activeBuff=new Map();let relWin=null;const hitLog=[];let result=null;const playLog=[],roundEnd=new Map(),stSrc=new Map(),supStore=new Map(),passiveSupport={ali:0,key:0};const relicPass=new Map(),openRelic=new Map(),keyTextCache=new Map(),gearTimes=new Map(),tempPow=new Set(),critReverts=new Map(),vulnSrc=new Map();const counterLog=new Map(),counterGain=new Map(),execStates=new Map(),execInst=new Map(),execSrc={cur:null},execIs=new Map();
    // 'execute' states (e.g. Arachne's Fate Verdict): layers pile up on an enemy and kill it when they reach its HP
    const isExec=sid=>{const k=String(sid);if(!execIs.has(k)){const r=res.state[k]||{};execIs.set(k,/直接击杀|直接斩杀/.test(pipeName(String(r.Desc||''))))}return execIs.get(k)};
    const HIT_PROPS=['atk','atk_per','tentacle_dmg','def','def_per','physique','physique_per','basic_damage_per','i_basic_damage_per','o_damage_per','o_damage_per_card','o_damage_per_strikecard','o_damage_per_attachpost','o_damage_per_ulti','i_damage_per','i_damage_per_strikecard','damage_per2monster_boss','crit_damage','crit_damage_from_strikecard','crit_damage_from_ulti','damage_plus','strikecard_damage_plus','ulti_strength_multiple'];
    // ---- equipment: wheels (命轮, 'Weapon' state source) and covenant sets (密契, '状态@饰品X' states)
    const PROP_KIND={awaker_ulti_dmg_per:['final','ult'],o_damage_per:['out','all'],o_damage_per_card:['out','card'],o_damage_per_strikecard:['out','strike'],o_damage_per_attachpost:['out','attach'],o_damage_per_ulti:['out','ult'],basic_damage_per:['out','all'],i_basic_damage_per:['in','all'],
      i_damage_per:['final','all'],i_damage_per_strikecard:['final','strike'],damage_per2monster_boss:['final','all'],crit_damage:['crit','all'],crit_damage_from_strikecard:['crit','strike'],crit_damage_from_ulti:['crit','ult'],damage_plus:['power','all'],strikecard_damage_plus:['power','strike']};
    const gearCat=gearCatalog||{wheels:{},covenants:{}},covByZh=new Map(Object.values(gearCat.covenants||{}).map(c=>[c.zh,c]));
    const gears=new Map(),gearsOfState=new Map();
    // covenants split their effect over helper states named "<covenant>效果 / 计数 / 标记 …": fold them into the shortest covenant stem they start with
    const covStems=[...new Set(ent.gearStates.filter(g=>g.kind==='covenant'&&ent.actors.get(String(g.ownerUid))?.kind!=='keeper').map(g=>g.stem))].filter(x=>x&&x.length>=2);
    const baseStem=st=>covStems.filter(x=>x!==st&&st.startsWith(x)).sort((x,y)=>x.length-y.length)[0]||st;
    for(const g of ent.gearStates){
      if(g.kind==='covenant'&&ent.actors.get(String(g.ownerUid))?.kind==='keeper')continue; // keeper-side helper states (e.g. 有机形态预缴) are bookkeeping, not an equipped covenant
      const mainRec=res.state[String(g.stateId)]||{},cn=String(mainRec.CnID||'');
      const covName=g.kind==='covenant'?([...covByZh.keys()].filter(z=>z&&String(g.stem).startsWith(z)).sort((a,b)=>b.length-a.length)[0]||baseStem(g.stem)):'',stem=g.kind==='wheel'?(cn.replace(/^状态@(武器)?/,'')||String(g.tid)):covName,key=`${g.kind}|${stem}|${g.tid??''}`;
      let e=gears.get(key);
      if(!e){
        const c=g.kind==='wheel'?(gearCat.wheels?.[String(g.tid)]||{}):(covByZh.get(stem)||{});
        e={key,kind:g.kind,stem,name:c.zh||stem,en:c.en||'',rarity:c.rarity||'',tid:g.tid,
          icon:c.icon?(g.kind==='wheel'?`${ART}/wheels/${c.icon}.webp`:`${ART}/covenants/Icon/${c.icon.replace(/_Box$/,'')}.webp`):'',
          effectsEn:c.effects||[],owners:[],mainStates:[],related:new Set(),triggers:{times:new Set(),rounds:new Set()},stateCounts:new Map(),statics:[],desc:''};
        gears.set(key,e);
        if(stem&&String(stem).length>=2)for(const [sid,rec] of Object.entries(res.state))if(String(rec.CnID||'').includes(stem))e.related.add(sid);
      }
      e.related.add(String(g.stateId));e.mainStates.push(g);
      if(!e.owners.includes(String(g.ownerUid)))e.owners.push(String(g.ownerUid));
      if(!e.desc){const d0=pipeName(mainRec.Desc||'');if(d0)e.desc=fillArgs(d0,g.params&&g.params.length?g.params:g.args)}
    }
    for(const e of gears.values())for(const sid of e.related){if(!gearsOfState.has(sid))gearsOfState.set(sid,[]);gearsOfState.get(sid).push(e)}
    // Trigger channels: every TriggerCondN/TriggerCmdN pair on the equipped state is one way the item fires.
    const COND_LABEL={BSTAfterUseCard:'打出卡牌后',BSTAfterUseKeeperSkill:'释放钥令后',BSTAfterUltiSkill:'释放狂气爆发后',BSTAfterBoutBegin:'回合开始时',BSTAfterBoutEnd:'回合结束时',BSTBeforeBoutBegin:'回合开始前',BSTBeforeBoutEnd:'回合结束前',BSTAfterLaunchSwallow:'吞噬后',BSTAfterDimensionBoutBegin:'进入超维回合后',NAMED:'释放指定技能后',BSTRoleAfterDeathResist:'触发死亡抵抗后',BSTAfterSilverKeyAwake:'银钥觉醒后',BSTAfterDrawCards:'抽牌后',BSTBattleBegin:'战斗开始时',StageState:'战斗开始时'};
    const TYPE_QUAL={Card_Strike:'打击',Card_Defend:'防御'};
    for(const e of gears.values()){
      e.channels=[];const desc=e.desc||'';
      const anyOwner=/任意唤醒体|所有唤醒体/.test(desc),strikeOnly=/打出[^。，]{0,12}「打击」/.test(desc),capAll=desc.match(/每回合(?:最多)?(?:触发|生效)?\s*(\d+)\s*次/);
      // "每回合最多生效 N 次" belongs to one sentence of the text: give the cap only to the channel whose condition that sentence talks about
      const CAP_KW={BSTAfterDoBlock:/护盾/,BSTAfterTentacleAttack:/触腕/,BSTAfterUseCard:/打出|卡牌/,BSTAfterUltiSkill:/狂气爆发|释放/,BSTAfterUseKeeperSkill:/钥令/,BSTAfterBoutBegin:/回合开始/,BSTAfterBoutEnd:/回合结束/,BSTAfterDoActiveDamage:/伤害|攻击/,BSTAfterBeActiveDamage:/承受|受到/};
      const nCond=[...new Set(e.mainStates.map(m=>String(m.stateId)))].reduce((t,sid)=>t+[1,2,3,4].filter(i=>asList(res.state[sid]?.['TriggerCond'+i])[0]&&asList(res.state[sid]['TriggerCond'+i])[0]!=='StageState').length,0),sents=desc.split(/[。；;]/);
      const capOf=base=>{const kw=CAP_KW[base],hit=kw?sents.find(x=>kw.test(x)&&/每回合(?:最多)?(?:触发|生效)?\s*\d+\s*次/.test(x)):null;if(hit)return Number(hit.match(/每回合(?:最多)?(?:触发|生效)?\s*(\d+)\s*次/)[1]);return nCond<=1&&capAll?Number(capAll[1]):0},capM=null;
      for(const sid of new Set(e.mainStates.map(m=>String(m.stateId))))for(let n=1;n<=4;n++){
        const rec=res.state[sid]||{};
        const cond=asList(rec['TriggerCond'+n])[0],cmdId=rec['TriggerCmd'+n];
        if(!cond){ // the condition is missing from the record: recover it from the effect text ("释放「湮灭」后 ...")
          if(cmdId!=null&&!e.channels.some(c=>c.cmd===cmdId)){const names=[...desc.matchAll(/(?:释放|打出|使用)「([^」]+)」(?:后|时)/g)].map(m=>m[1]),used=e.channels.filter(c=>c.base==='NAMED').map(c=>c.named),nm=names.find(x=>!used.includes(x));
            if(nm)e.channels.push({n,base:'NAMED',named:nm,qual:'',cmd:cmdId,label:`释放「${nm}」后`,once:false,ownerOnly:true,cap:capOf('NAMED'),count:0,rounds:new Set(),perRound:new Map(),para:rec['TriggerPara'+n],target:rec['TriggerTarget'+n]})}
          continue}
        const [base,qual]=String(cond).split('.');
        if(e.channels.some(c=>c.base===base&&c.cmd===cmdId))continue;
        e.channels.push({n,base,qual:qual||(strikeOnly&&base==='BSTAfterUseCard'?'Card_Strike':''),cmd:cmdId,label:(COND_LABEL[base]||base)+(TYPE_QUAL[qual]?`（${TYPE_QUAL[qual]}）`:strikeOnly&&base==='BSTAfterUseCard'?'（打击）':''),once:base==='StageState'||base==='BSTBattleBegin',ownerOnly:!anyOwner,cap:capOf(base),count:0,rounds:new Set(),perRound:new Map(),para:rec['TriggerPara'+n],target:rec['TriggerTarget'+n]});
      }
      // wheels that shuffle a card of their own name into the deck ("将 1 张「X」洗入…") fire when that card is played
      const cm=desc.match(/将[^「]{0,12}「([^」]+)」[^。]{0,6}(?:洗入|加入)/);
      if(cm){const tids=Object.entries(res.skill).filter(([id,r])=>pipeName(r.Name||'')===cm[1]&&asList(r.Type).includes('Card_Potion')).map(([id])=>id);if(tids.length){e.cardTids=new Set(tids);e.channels.push({n:99,base:'CARD',qual:'',cmd:null,label:`打出「${cm[1]}」`,once:false,ownerOnly:false,cap:0,count:0,rounds:new Set(),perRound:new Map(),card:cm[1],para:null})}}
    }
    for(const e of gears.values())for(const ch of e.channels){
      ch.confirm=new Set();const cmd=res.rr?.Cmd?.[String(ch.cmd)],adds=(cmd?.data_list||[]).filter(dl=>dl.Type==='BEAddState');
      // a conditional add (chance / per-turn cap) is the real proof of a trigger; unconditional counters would also tick when the effect is capped
      const pool=adds.some(dl=>dl.Cond)?adds.filter(dl=>dl.Cond):adds;
      ch.powerKind=adds.some(dl=>/^(3130|2900)\b/.test(String(dl.Para)));
      for(const dl of pool){let tok=String(dl.Para).split(',')[0].trim();if(/^Arg\d*$/.test(tok))tok=String(ch.para??'').split(',')[0].trim();if(/^\d+$/.test(tok)&&res.state[tok]&&!['2900','3130','3902'].includes(tok))ch.confirm.add(tok)}
    }
    // states a trigger command creates (or names in its TriggerPara) belong to the item even if their names do not repeat its stem
    for(const e of gears.values()){
      const extra=new Set();
      for(const ch of e.channels){
        for(const dl of res.rr?.Cmd?.[String(ch.cmd)]?.data_list||[]){if(dl.Type!=='BEAddState')continue;const tok=String(dl.Para).split(',')[0].trim();if(/^\d+$/.test(tok))extra.add(tok)}
        for(const m of String(ch.para??'').matchAll(/(?:^|,)\s*(\d{3,})\s*(?=,|$)/g))extra.add(m[1]);
      }
      e.fx=new Set([...extra].filter(x=>!['2900','3130','3902'].includes(x)));for(const ch of e.channels)for(const x of ch.confirm||[])e.fx.add(x);   // states the item's own trigger commands add: the only state changes that prove it fired
      for(const sid of extra){if(['2900','3130','3902'].includes(sid)||!res.state[sid]||e.related.has(sid))continue;e.related.add(sid);if(!gearsOfState.has(sid))gearsOfState.set(sid,[]);gearsOfState.get(sid).push(e)}
    }
    // effect evidence: a trigger command that gives a fixed amount (aliemus / keyflare energy / energy / shield / heal) leaves property changes whose nominal
    // cast value equals that amount. Matching them (when exactly one item can explain the change) credits the value to the item and counts the trigger.
    const EV_PROP={BEGainUltiEnergy:'ulti_energy',BEChangeKeeperEnergy:'keeper_energy',BEGainKeeperEnergy:'keeper_energy',BEChangeEnergy:'energy',BEGainBlock:'block',BEHeal:'hp'};
    for(const e0 of gears.values())for(const ch0 of e0.channels)for(const m0 of String(ch0.para??'').matchAll(/GetStateLayer\((\d+)\)/g))dynIds.add(m0[1]);
    const evList=[],evProps=new Map();   // evProps: gear key -> properties its trigger commands set by a fixed amount
    for(const e of gears.values())for(const ch of e.channels){
      if(ch.cmd==null)continue;const params=e.mainStates[0]?.params||[],paras=String(ch.para??'').split(',').map(x=>x.trim());
      for(const dl of res.rr?.Cmd?.[String(ch.cmd)]?.data_list||[]){const prop=EV_PROP[dl.Type];if(!prop)continue;
        if(!evProps.has('gear:'+e.key))evProps.set('gear:'+e.key,new Set());evProps.get('gear:'+e.key).add(prop);   // the item sets this property: it only receives it through an exact amount match
        let t=String(dl.Para??'').replace(/\bArg(\d+)\b/g,(m,n)=>paras[Number(n)-1]??'#').replace(/StateArg(\d+)/g,(m,n)=>params[Number(n)-1]??'#');
        if(/#|[A-Za-z_]/.test(t.replace(/Math\.\w+/g,'')))continue;const amt=evalNum(t,{});if(!(Number.isFinite(amt)&&amt!==0))continue;
        evList.push({e,ch,prop,amt:Math.abs(amt),tgt:dl.Target==='UpperTarget'||dl.Target==null?ch.target:dl.Target});ch.evTimes=ch.evTimes||new Set();ch.evRounds=ch.evRounds||new Set();ch.evPer=ch.evPer||new Map();if(!evProps.has('gear:'+e.key))evProps.set('gear:'+e.key,new Set());evProps.get('gear:'+e.key).add(prop)}
    }
    for(const e of gears.values())for(const sid of e.fx||[]){const rec=res.state[sid]||{};for(let n=1;n<=4;n++){const cid=rec['TriggerCmd'+n];if(cid==null)continue;
      for(const dl of res.rr?.Cmd?.[String(cid)]?.data_list||[]){const prop=EV_PROP[dl.Type];if(!prop)continue;if(!evProps.has('gear:'+e.key))evProps.set('gear:'+e.key,new Set());evProps.get('gear:'+e.key).add(prop)}}}
    let pendingConf=[];const tsPower=new Map(),tsPlus=new Map();
    const attributePower=(e,time)=>{const p=tsPower.get(time);if(!p)return;const rel={tid:'gear:'+e.key,kind:'power'},ctx=newInstance({time},rel,p.delta,p.stateId===3130);const pl=tsPlus.get(time);if(pl)for(const [uid,amt] of pl)grant(ctx,uid,amt,rel,p.stateId===3130);tsPower.delete(time)};
    const channelHit=(e,ch)=>{const r=bout;const pr=ch.perRound.get(r)||0;if(ch.cap&&pr>=ch.cap)return false;ch.perRound.set(r,pr+1);ch.count++;ch.rounds.add(r);return true};
    // gear-side effect windows: what lands in the same frame group after a trigger belongs to that item
    const openGearWindow=(e,time,kind,predict)=>{const rel={tid:'gear:'+e.key,kind,predict};if(relWin&&relWin.time===time){relWin.queue.push(rel);relWin.gear=true;relWin.until=Math.max(relWin.until||0,time+6)}else relWin={time,queue:[rel],pi:0,bi:0,pend:new Map(),basicCtx:null,ci:0,gear:true,until:time+6}};
    const gearTrigger=(type,info,time)=>{
      for(const e of gears.values())for(const ch of e.channels){
        let ok=false;
        if(type==='card'){
          if(ch.base==='BSTAfterUseCard'&&(!ch.qual||info.types.includes(ch.qual))&&(!ch.ownerOnly||e.owners.includes(String(info.owner))))ok=true;
          if(ch.base==='CARD'&&e.cardTids?.has(String(info.tid)))ok=true;
        }else if(type==='ulti'){ok=ch.base==='BSTAfterUltiSkill'&&(!ch.ownerOnly||e.owners.includes(String(info.owner)))}
        else if(type==='keeper')ok=ch.base==='BSTAfterUseKeeperSkill';
        else if(type==='boutBegin')ok=ch.base==='BSTAfterBoutBegin';
        else if(type==='boutEnd')ok=ch.base==='BSTAfterBoutEnd';
        else if(type==='swallow')ok=ch.base==='BSTAfterLaunchSwallow';
        else if(type==='dimension')ok=ch.base==='BSTAfterDimensionBoutBegin';
        else if(type==='deathResist')ok=ch.base==='BSTRoleAfterDeathResist';
        if((type==='card'||type==='ulti')&&ch.base==='NAMED'&&info.tid!=null&&res.nameSkill(info.tid)===ch.named&&e.owners.includes(String(info.owner)))ok=true;
        if(!ok)continue;
        if(['NAMED','BSTAfterDimensionBoutBegin','BSTRoleAfterDeathResist'].includes(ch.base)&&ch.cmd!=null){if(!gearTimes.has(time))gearTimes.set(time,new Set());gearTimes.get(time).add('gear:'+e.key)}if(['NAMED','BSTAfterDimensionBoutBegin','BSTAfterBoutBegin','BSTAfterBoutEnd','BSTAfterUseKeeperSkill','BSTAfterUltiSkill','BSTAfterUseCard','BSTAfterLaunchSwallow'].includes(ch.base)&&ch.cmd!=null&&(res.rr?.Cmd?.[String(ch.cmd)]?.data_list||[]).some(dl=>/^BE(DrawCard|ChangeEnergy|ChangeKeeperEnergy|GainKeeperEnergy|GainUltiEnergy|GainBlock|Heal|CreateCard|CopyCard|ScarletBloodChange)/.test(dl.Type)))gearWins.push({owners:e.owners,tgt:(()=>{const dl=(res.rr?.Cmd?.[String(ch.cmd)]?.data_list||[]).find(x=>x.Type==='BEGainUltiEnergy');return !dl||dl.Target==='UpperTarget'||dl.Target==null?ch.target:dl.Target})(),t0:time,t1:time+(ch.base==='BSTAfterUseKeeperSkill'||ch.base==='BSTAfterUltiSkill'?4:ch.base==='BSTAfterLaunchSwallow'?2:.6),keys:['gear:'+e.key],ch,src:['NAMED','BSTAfterDimensionBoutBegin','BSTAfterBoutBegin','BSTAfterBoutEnd'].includes(ch.base),ali:(()=>{if(!(res.rr?.Cmd?.[String(ch.cmd)]?.data_list||[]).some(dl=>dl.Type==='BEGainUltiEnergy'))return null;const v=Number(String(ch.para??'').split(',')[0].trim().replace(/StateArg(\d+)/,(m,n)=>e.mainStates[0]?.params?.[n-1]));return Number.isFinite(v)?v:null})()})   // the command's effects land in this frame group
        if(ch.confirm.size)pendingConf.push({e,ch,time,done:false,win:ch.base==='BSTAfterUltiSkill'?15:6});else if(!channelHit(e,ch))continue;
        const desc=e.desc||'',kinds=new Set();
        if(ch.base==='CARD'&&/暴击伤害/.test(desc))kinds.add('crit');
        let predict=null;if(kinds.has('power')&&ch.para!=null){const own=board.get(String(e.owners[0]))?.props||{},af=Math.ceil((own.atk||0)*(1+(own.atk_per||0)/100)),params=e.mainStates[0]?.params||[];
          const ex=String(ch.para).replace(/StateOwner\.AtkForce/g,String(af)).replace(/StateArg(\d+)/g,(m,n)=>params[Number(n)-1]??'#').replace(/math\./g,'Math.');
          if(/^[0-9+\-*/().\s]*(Math\.(ceil|floor)[0-9+\-*/().\s]*)*$/.test(ex)){try{const v=Function(`"use strict";return (${ex})`)();if(Number.isFinite(v))predict=v}catch{}}}
        for(const k of kinds)openGearWindow(e,time,k,k==='power'?predict:null);
      }
    };

    const genKind=tid=>{const t=relicTxt(tid);return /暴击率/.test(t)?'critrate':/暴击伤害/.test(t)?'crit':/最终伤害/.test(t)?'final':RELIC_GEN.o_damage_per[1].test(t)?'out':null};
    const buffOf=tid=>{const k=String(tid);if(!relicBuffs.has(k))relicBuffs.set(k,{tid:k,kind:relicKind(tid)||(String(tid).startsWith('gear:')?null:genKind(tid)),gain:0,extra:0,instances:[]});return relicBuffs.get(k)};
    // one relic trigger -> one instance (gain counted once per trigger, per-awakener amounts used for the damage split)
    const newInstance=(win,rel,gain,temp)=>{const rec=buffOf(rel.tid),inst={round:bout,time:win.time,gain,awakeners:new Set(),extra:0,hits:0,temp,kind:rel.kind};rec.instances.push(inst);rec.gain+=gain;return {rec,inst}};
    const grant=(ctx,uid,amt,rel,temp)=>{const k=String(uid);ctx.inst.awakeners.add(k);if(!activeBuff.has(k))activeBuff.set(k,[]);activeBuff.get(k).push({inst:ctx.inst,kind:rel.kind,amt,temp,rel:ctx.rec})};
    const expireTemp=()=>{for(const [k,v] of activeBuff)activeBuff.set(k,v.filter(x=>!x.temp))};
    // passive relics that amplify every shield / heal ("…基础效果提高 N%"): each shield or heal an awakener produces counts as one effect
    const passiveHB=[];for(const r of bd.relics||[]){const rec=res.relic[String(r.tid)],txt=pipeName(pickVariant(rec?.BattleDesc||rec?.Desc,0)),m=txt.match(/造成(?:生命回复和护盾|护盾和生命回复|护盾|生命回复|治疗)的基础效果提高\s*\[Arg(\d)\]%/);
      if(m){const pct=Number((rec.StatePara||[])[Number(m[1])-1]);if(pct>0)passiveHB.push({tid:String(r.tid),pct,shield:/护盾/.test(m[0]),heal:/生命回复|治疗/.test(m[0])})}}
    const passiveHit=(kind,amt,caster)=>{if(!passiveHB.length||!(amt>0)||actors.get(String(caster))?.kind!=='awakener')return;for(const p of passiveHB){if(!p[kind])continue;const o=relicPass.get(p.tid)||{n:0,block:0,heal:0};o.n++;o[kind==='shield'?'block':'heal']+=amt*p.pct/(100+p.pct);relicPass.set(p.tid,o)}};
    const keyText=k=>{if(k.startsWith('gear:')){const g=gears.get(k.slice(5));return g?[g.desc,...g.mainStates.map(m=>pipeName(res.state[String(m.stateId)]?.WeaponDesc||'')),...(g.effectsEn||[]).map(x=>x.desc)].join(' '):''}
      if(k.startsWith('rel:')){const r=res.relic[k.slice(4)]||{};return pipeName(pickVariant(r.BattleDesc||r.Desc,0))||''}return ''};
    const keyHas=(k,re)=>{if(!keyTextCache.has(k))keyTextCache.set(k,keyText(k));return re.test(keyTextCache.get(k))};
    const supOf=k=>{if(!supStore.has(k))supStore.set(k,{aliSelf:0,aliOthers:0,key:0,energy:0,dr:0,rm:0,powerGain:0,critGain:0,critRateGain:0,basicGain:0,dbPts:0,dbN:0,dbTypes:new Map(),vulnExtra:0,embryo:0,embCards:0,seal:0,cut:0,draws:0,cycles:0,dbCls:{vuln:0,weak:0,frail:0,ctrl:0,dot:0,other:0},inspire:0,copies:0,costCut:0,ultCasts:0,prevented:0,prevTypes:new Map(),tenGain:0,blk:0,heal:0});return supStore.get(k)};
    // who gets credit for an effect at this timestamp: a relic firing in this frame group, else a wheel / covenant state firing now, else the awakener whose action is being resolved
    const gearWins=[];   // short windows after commands that fire without a state change (超维 bout, named skill, death resist)
    const srcKeys=time=>{if(relWin&&!relWin.gear&&relWin.queue?.length)return relWin.queue.map(r=>'rel:'+r.tid);const g=gearTimes.get(time);if(g&&g.size)return [...g];{const w=gearWins.findLast?gearWins.findLast(x=>x.src&&time>=x.t0&&time<=x.t1):null;if(w)return w.keys}const a=execSrc.cur?.actor,ak=a!=null?actors.get(String(a))?.kind:null;return ak==='awakener'?['act:'+a]:ak==='keeper'?['kp']:[]};
    // enemy debuffs: classify by state text
    const DB_RE=[['vuln',/易伤/,3],['weak',/虚弱/,2],['frail',/脆弱/,2],['ctrl',/眩晕|冻结|冰冻|沉默|封印|定身|石化|麻痹|缴械|恐惧|魅惑|混乱|昏迷|禁锢|睡眠|束缚/,3],['dot',/中毒|出血|灼烧|侵蚀|腐蚀|燃烧|献祭/,0.6]];
    const dbClass=sid=>{const r=res.state[String(sid)]||{};if(String(r.IsBuff).toUpperCase()!=='FALSE'||r.ShowType==='Hide')return null;const nm=res.nameState(sid);for(const [k,re,w] of DB_RE)if(re.test(nm))return {k,w,nm};return {k:'other',w:0.5,nm}};


    // static effects of an equipped wheel/covenant state -> permanent buffs on its owner (used by the damage model)
    for(const e of gears.values()){
      for(const g of e.mainStates){
        const rec=res.state[String(g.stateId)]||{},ex=rec.ExistProperty||{};
        for(const [prop,expr] of Object.entries(ex)){
          let val=null;const m=String(expr).match(/^StateArg(\d+)$/);
          if(m)val=Number(g.params?.[Number(m[1])-1]);else if(expr==='ChangedLayer')val=Number(g.layer);else if(Number.isFinite(Number(expr)))val=Number(expr);
          if(!Number.isFinite(val)||!val)continue;
          e.statics.push({owner:String(g.ownerUid),prop,val});
        }
      }
    }
    // permanent shield / heal strength statics (诅咒兔, 远方的欢宴 ...): every matching shield or heal the owner produces counts as one effect
    const HB_PROP={o_block_per:['block','any'],o_heal_per:['heal','any'],block_per_defendcard:['block','defend'],block_per_card:['block','card'],o_heal_per_card:['heal','card'],block_per_ulti:['block','ulti'],heal_per_ulti:['heal','ulti']};
    const hbStatics=[];for(const e of gears.values())for(const st of e.statics){const h=HB_PROP[st.prop];if(h)hbStatics.push({key:'gear:'+e.key,owner:st.owner,kind:h[0],ctx:h[1],val:st.val})}
    const staticHit=(kind,amt,caster)=>{if(!hbStatics.length||!(amt>0))return;const pl=execSrc.cur?.play,cardTypes=pl?asList(res.skill[String(pl.tid)]?.Type):[];
      for(const h of hbStatics){if(h.kind!==kind||h.owner!==String(caster))continue;
        if(h.ctx==='defend'&&!(pl?.kind==='card'&&cardTypes.includes('Card_Defend')))continue;if(h.ctx==='card'&&pl?.kind!=='card')continue;if(h.ctx==='ulti'&&pl?.kind!=='ultimate')continue;
        const sp=supOf(h.key);sp.hbN=(sp.hbN||0)+1;sp[kind==='block'?'blk':'heal']+=amt*h.val/(100+h.val)}};
    const gearRecs=new Map();
    for(const e of gears.values()){
      const rec={tid:'gear:'+e.key,kind:'gear',gain:0,extra:0,instances:[]};relicBuffs.set(rec.tid,rec);gearRecs.set(e.key,rec);
      for(const st of e.statics){
        const pk=PROP_KIND[st.prop];if(!pk||!actors.get(st.owner)||actors.get(st.owner).kind!=='awakener')continue;
        const inst={round:0,time:0,gain:st.val,awakeners:new Set([st.owner]),extra:0,hits:0,temp:false,prop:st.prop};rec.instances.push(inst);rec.gain+=st.val;
        if(!activeBuff.has(st.owner))activeBuff.set(st.owner,[]);activeBuff.get(st.owner).push({inst,kind:pk[0],scope:pk[1],amt:st.val,temp:false,rel:rec});
      }
    }
    // pre-pass: timestamps at which a wheel / covenant state fires, temporary power adds, and crit-damage reverts (to tell temporary buffs from permanent ones)
    {const gains=new Map();
      for(const seg of full.recordSegments||[])for(const rec of seg||[]){const fl=rec?.msgData?.frameList;if(!Array.isArray(fl))continue;for(const fr of fl){const e=fr.eventId,d=fr.data||{},t=fr.time;
        if((e===1004||e===1006||e===1007)&&d.stateId!=null){const pos=e===1007?(d.newLayer||0)>(d.oldLayer||0):true;
          if(pos){const gl=(gearsOfState.get(String(d.stateId))||[]).filter(g=>g.fx?.has(String(d.stateId)));if(gl)for(const g of gl){if(!gearTimes.has(t))gearTimes.set(t,new Set());gearTimes.get(t).add('gear:'+g.key)}
            if(d.stateId===3130)tempPow.add(`${t}|${d.ownerUid??d.roleUid}`)}}
        if(e===1028&&d.propertyType==='death_resist_times'&&d.extraData&&Number(d.changedValue)>0)for(const g of gears.values())if(g.channels.some(c=>c.base==='BSTRoleAfterDeathResist')){if(!gearTimes.has(t))gearTimes.set(t,new Set());gearTimes.get(t).add('gear:'+g.key)}
        if(e===1028&&d.propertyType==='crit_damage'&&d.uid!=null){const cv=Number(d.changedValue)||0;const k=String(d.uid);if(cv>0){if(!gains.has(k))gains.set(k,[]);gains.get(k).push({t,cv,bout:0})}else if(cv<0){const l=gains.get(k)||[];for(let i=l.length-1;i>=0;i--)if(!l[i].rev&&Math.abs(l[i].cv+cv)<1e-6){l[i].rev=true;critReverts.set(`${l[i].t}|${k}`,true);break}}}}}
    }
    for(let si=0;si<(full.recordSegments||[]).length;si++){
      const seg=full.recordSegments[si]||[];for(let ri=0;ri<seg.length;ri++){
        const rec=seg[ri]||{};
        if(rec?.msgId===1001&&rec.msgData){for(const m of rec.msgData.monsterDataList||[])applyRoleSnapshot(m);for(const r of rec.msgData.roleDataList||[])applyRoleSnapshot(r)}
        const fl=rec?.msgData?.frameList;if(!Array.isArray(fl))continue;
        for(let fi=0;fi<fl.length;fi++){
          const fr=fl[fi]||{};frameCount++;const e=fr.eventId,d=fr.data||{};
          // ---- what lands at each timestamp (power gains / per-awakener damage_plus) so a confirmed trigger can claim it
          if((e===1004||e===1007)&&(d.stateId===3130||d.stateId===2900)){const dl=e===1004?(d.layer||0):((d.newLayer||0)-(d.oldLayer||0));if(dl>0&&(d.stateId===3130||!tsPower.has(fr.time))){tsPower.set(fr.time,{delta:dl,stateId:d.stateId});if(tsPower.size>40)tsPower.delete(tsPower.keys().next().value)}}
          if(e===1028&&d.propertyType==='damage_plus'&&Number(d.changedValue)>0&&actors.get(String(d.uid))?.kind==='awakener'){if(!tsPlus.has(fr.time))tsPlus.set(fr.time,new Map());tsPlus.get(fr.time).set(String(d.uid),Number(d.changedValue));if(tsPlus.size>40)tsPlus.delete(tsPlus.keys().next().value)}
          // ---- confirm conditional triggers: the command's state really appeared right after the trigger
          if(pendingConf.length){
            if((e===1004||e===1006||e===1007)&&d.stateId!=null&&(e!==1007||(d.newLayer??0)>(d.oldLayer??0))){const pc=pendingConf.find(x=>!x.done&&x.ch.confirm.has(String(x.ch.confirm.has(String(d.stateId))?d.stateId:''))&&fr.time-x.time<=x.win&&fr.time>=x.time-1e-6&&x.ch.lastT!==fr.time);if(pc){pc.done=true;pc.ch.lastT=fr.time;if(channelHit(pc.e,pc.ch)&&pc.ch.powerKind)attributePower(pc.e,fr.time)}}
            pendingConf=pendingConf.filter(pc=>!pc.done&&(fr.time||0)-pc.time<=pc.win);
          }
          // ---- dynamic equipment buffs: related states that declare ExistProperty (value = layer x coefficient)
          if((e===1004||e===1006||e===1007||e===1005)&&d.stateId!=null||(e===1005&&d.stateUid!=null)){
            const sidN=e===1005?stateMap(d.ownerUid).get(String(d.stateUid))?.stateId:d.stateId,gl2=sidN!=null?gearsOfState.get(String(sidN)):null;
            if(gl2){
              const rec2=res.state[String(sidN)]||{},ex2=rec2.ExistProperty||{},ow=String(d.ownerUid??d.roleUid);
              const prevL=e===1005?(stateMap(d.ownerUid).get(String(d.stateUid))?.layer||0):0;
              const delta=e===1004||e===1006?(d.layer||1):e===1007?((d.newLayer||0)-(d.oldLayer||0)):-prevL;
              if(delta&&actors.get(ow)?.kind==='awakener')for(const ge of gl2){
                if(ge.mainStates.some(m=>String(m.stateId)===String(sidN)))continue;
                const rec=gearRecs.get(ge.key);if(!rec)continue;
                for(const [prop,expr] of Object.entries(ex2)){
                  const pk=PROP_KIND[prop];const cm=String(expr).match(/^ChangedLayer(?:\*([0-9.]+))?$/);if(!pk||!cm)continue;
                  const amt=delta*(cm[1]?Number(cm[1]):1),temp=asList(rec2.ClearCond).some(c=>/BoutEnd/.test(c));
                  if(amt>0&&bout>0){const inst={round:bout,time:fr.time,gain:amt,awakeners:new Set([ow]),extra:0,hits:0,temp,kind:pk[0],prop};rec.instances.push(inst);rec.gain+=amt;
                    if(!activeBuff.has(ow))activeBuff.set(ow,[]);activeBuff.get(ow).push({inst,kind:pk[0],scope:pk[1],amt,temp,rel:rec,prop,state:String(sidN)})}
                  else if(amt<0){let rest=-amt;const list=activeBuff.get(ow)||[];for(let i=list.length-1;i>=0&&rest>1e-9;i--){const b=list[i];if(b.state!==String(sidN)||b.prop!==prop)continue;const take=Math.min(b.amt,rest);b.amt-=take;rest-=take;if(b.amt<=1e-9)list.splice(i,1)}}
                }
              }
            }
          }
          // ---- equipment triggers: a positive layer event on any state belonging to a wheel / covenant
          if((e===1004||e===1006||e===1007)&&d.stateId!=null&&(gearsOfState.get(String(d.stateId))||[]).length){
            const gl3=gearsOfState.get(String(d.stateId)),delta3=e===1007?((d.newLayer||0)-(d.oldLayer||0)):(d.layer||1),cur3=e===1007?d.newLayer:(d.layer||1);
            for(const ge of gl3){const m=ge.stateGain||(ge.stateGain=new Map()),o=m.get(String(d.stateId))||{n:0,gain:0,init:null,last:0,rounds:new Set()};
              if(!bout&&e!==1007){o.init=cur3}else if(delta3>0){o.n++;o.gain+=delta3;o.rounds.add(bout)}
              o.last=cur3;m.set(String(d.stateId),o)}
          }
          if(bout>0&&(e===1004||e===1006||e===1007)&&d.stateId!=null){
            const gl=gearsOfState.get(String(d.stateId));
            if(gl&&(e!==1007||(d.newLayer??0)>(d.oldLayer??0)))for(const ge of gl){ge.triggers.times.add(Math.round((fr.time||0)*100)/100);ge.triggers.rounds.add(bout);ge.stateCounts.set(String(d.stateId),(ge.stateCounts.get(String(d.stateId))||0)+1)}
          }
          // ---- relic trigger windows: effects landing in the same frame group belong to that relic
          if(e===1050){if(!bout)openRelic.set(String(d.relicTid),(openRelic.get(String(d.relicTid))||0)+1);const rel={tid:String(d.relicTid),kind:relicKind(d.relicTid)};if(relWin&&relWin.time===fr.time)relWin.queue.push(rel);else relWin={time:fr.time,queue:[rel],pi:0,bi:0,pend:new Map(),basicCtx:null}}
          else if(relWin&&((relWin.gear?(fr.time||0)>relWin.until:fr.time!==relWin.time)||e===1067||e===1064||e===1019||(!relWin.gear&&(e===1013||e===1093||e===1014))))relWin=null;
          if(relWin){
            const powers=relWin.queue.filter(r=>r.kind==='power'),basics=relWin.queue.filter(r=>r.kind==='basic');
            if(powers.length){
              if(e===1028&&d.propertyType==='damage_plus'&&Number(d.changedValue)>0&&actors.get(String(d.uid))?.kind==='awakener')relWin.pend.set(String(d.uid),Number(d.changedValue));
              else if((e===1004||e===1007)&&(d.stateId===2900||d.stateId===3130)){
                const delta=e===1004?(d.layer||0):((d.newLayer||0)-(d.oldLayer||0));
                if(delta>0&&relWin.pi<powers.length){const rel=powers[relWin.pi++],ctx=newInstance(relWin,rel,delta,d.stateId===3130);for(const [uid,amt] of relWin.pend)grant(ctx,uid,amt,rel,d.stateId===3130);relWin.pend.clear()}
              }
            }
            const crits=relWin.queue.filter(r=>r.kind==='crit');
            if(crits.length&&e===1028&&d.propertyType==='crit_damage'&&Number(d.changedValue)>0&&actors.get(String(d.uid))?.kind==='awakener'){
              if(!relWin.critCtx||relWin.critCtx.inst.awakeners.has(String(d.uid))){const rel=crits[Math.min(relWin.ci||0,crits.length-1)];relWin.ci=(relWin.ci||0)+1;relWin.critCtx=newInstance(relWin,rel,Number(d.changedValue),true);relWin.critCtx.rel=rel}
              grant(relWin.critCtx,d.uid,Number(d.changedValue),relWin.critCtx.rel,true);
            }
            if(basics.length&&e===1028&&(d.propertyType==='i_basic_damage_per'||d.propertyType==='basic_damage_per')&&Number(d.changedValue)>0&&actors.get(String(d.uid))?.kind==='awakener'){
              const uid=String(d.uid);
              if(!relWin.basicCtx||relWin.basicCtx.inst.awakeners.has(uid)){if(relWin.basicCtx)relWin.bi++;const rel=basics[Math.min(relWin.bi,basics.length-1)];relWin.basicCtx=newInstance(relWin,rel,Number(d.changedValue),false);relWin.basicCtx.rel=rel}
              grant(relWin.basicCtx,uid,Number(d.changedValue),relWin.basicCtx.rel,false);
            }
          }
          if(relWin&&!relWin.gear&&e===1028&&d.propertyType==='damage_plus'&&Number(d.changedValue)<0&&actors.get(String(d.uid))?.kind==='monster'){
            for(const q of relWin.queue){if(!/(?:失去|降低|减少)[^。]{0,16}力量/.test(relicTxt(q.tid)))continue;const o=relicDebuff.get(q.tid)||{times:new Set(),total:0,targets:new Set()};o.times.add(Math.round((fr.time||0)*10));o.total+=-Number(d.changedValue);o.targets.add(String(d.uid));relicDebuff.set(q.tid,o);break}
          }
          if(relWin){
            // generic permanent / stacking buffs a relic lands in its window (crit rate, crit damage, final / outgoing damage): the property that changes names the kind
            if(e===1028&&Number(d.changedValue)>0&&actors.get(String(d.uid))?.kind==='awakener'&&RELIC_GEN[d.propertyType]){
              const [kd,re]=RELIC_GEN[d.propertyType],uid=String(d.uid);
              const cands=relWin.queue.filter(q=>re.test(relicTxt(q.tid))),exact=cands.filter(q=>(res.relic[String(q.tid)]?.StatePara||[]).some(v=>Math.abs(Number(v)-Number(d.changedValue))<1e-6)||new RegExp('(?:^|[^\\d.])'+Number(d.changedValue)+'(?:[^\\d]|$)').test(relicTxt(q.tid)));
              for(const q of (exact.length?exact:cands)){const gk=q.tid+'|'+d.propertyType;relWin.gctx=relWin.gctx||new Map();
                let ctx=relWin.gctx.get(gk);if(!ctx||ctx.inst.awakeners.has(uid)){ctx=newInstance(relWin,{tid:q.tid,kind:kd},Number(d.changedValue),false);relWin.gctx.set(gk,ctx)}
                grant(ctx,uid,Number(d.changedValue),{tid:q.tid,kind:kd},false);break}
            }
          }
          // ---- state tracking (runs for every frame, including pre-battle setup)
          if(e===1028&&d.propertyType==='card_strength_multiple'&&d.uid!=null&&typeof d.value==='number')cardMul.set(String(d.uid),d.value);
          if(e===1028&&d.value!=null&&d.uid!=null&&typeof d.value==='number'&&actors.has(String(d.uid))){const u=unit(d.uid);(u.props=u.props||{})[d.propertyType]=d.value;if(PROP[d.propertyType])u[PROP[d.propertyType]]=d.value}
          else if(e===1014&&d.beHitConfig?.targetRoleUid!=null){const h=d.beHitConfig,u=unit(h.targetRoleUid);if(h.curHp!=null)u.hp=h.curHp;if(h.curMaxHp!=null)u.max=h.curMaxHp}
          if((e===1004||e===1006||e===1007||e===1005)&&d.stateUid!=null){
            const su0=String(d.stateUid);
            if((e===1004||e===1006||(e===1007&&d.updateCaster))&&d.castRoleUid!=null){const ck=actors.get(String(d.castRoleUid))?.kind==='awakener'?['act:'+d.castRoleUid]:srcKeys(fr.time);if(ck.length)stSrc.set(su0,ck)}
            if((e===1004||e===1006||e===1007)&&d.stateId!=null&&bout>0&&actors.get(String(d.ownerUid??d.roleUid))?.camp===2){
              const pos=e===1007?(d.newLayer||0)>(d.oldLayer||0):true,cl=pos?dbClass(d.stateId):null;
              if(cl){const cast=actors.get(String(d.castRoleUid))?.kind==='awakener'?['act:'+d.castRoleUid]:srcKeys(fr.time);
                for(const k of cast){const sp=supOf(k),w=cl.w/cast.length;sp.dbPts+=w;sp.dbN+=1/cast.length;sp.dbCls[cl.k]=(sp.dbCls[cl.k]||0)+1/cast.length;const o=sp.dbTypes.get(cl.nm)||{k:cl.k,n:0};o.n+=1/cast.length;sp.dbTypes.set(cl.nm,o)}
                if(cl.k==='vuln'&&cast.length)vulnSrc.set(String(d.ownerUid??d.roleUid),cast[0])}
            }
            if((e===1004||e===1006||e===1007)&&(d.stateId===3905||d.stateId===3023)){
              const dl=e===1007?(d.newLayer||0)-(d.oldLayer||0):(d.layer||1),ou=String(actors.get(String(d.castRoleUid))?.kind==='awakener'?d.castRoleUid:'team'),g=counterGain.get(ou)||{init:0,gain:0,bySrc:new Map()};
              if(!bout)g.init+=Math.max(0,dl);else if(dl>0){const src=execSrc.cur||{name:ui('回合开始 / 被动','Passive')},o=g.bySrc.get(src.name)||{name:src.name,n:0,gain:0};o.n++;o.gain+=dl;g.bySrc.set(src.name,o);g.gain+=dl}
              counterGain.set(ou,g)}
            if(e!==1005&&d.stateId!=null&&isExec(d.stateId))execInst.set(su0,{sid:d.stateId,owner:String(d.ownerUid),caster:d.castRoleUid});
            const ei=execInst.get(su0);
            if(ei){
              const rec=execStates.get(String(ei.sid))||{sid:ei.sid,events:[],total:0,bySrc:new Map(),byRound:new Map(),kills:[],caster:ei.caster};execStates.set(String(ei.sid),rec);
              const tu=unit(ei.owner);
              if(e===1005){rec.kills.push({round:bout,time:fr.time,layer:ei.layer||0,hp:ei.lastHp??null,max:tu.max??null,owner:ei.owner});execInst.delete(su0)}
              else{
                const nl=e===1007?(d.newLayer||0):(d.layer||1),delta=e===1007?nl-(d.oldLayer||0):nl;ei.layer=nl;ei.lastHp=tu.hp??ei.lastHp;
                if(delta>0&&bout>0){const src=execSrc.cur||{name:ui('回合开始 / 被动','Passive')};const cp=unit(src.actor||'').props||{},play=curFia&&String(curFia.uid)===String(src.actor)?curFia:null;
                  rec.events.push({round:bout,time:fr.time,delta,layer:nl,hp:tu.hp??null,src:src.name,actor:src.actor,tid:play?.tid,arg:play?.args?.[0]??null,pf:play?.ev?.pf??1,atk:Math.ceil((cp.atk||0)*(1+(cp.atk_per||0)/100))});rec.total+=delta;
                  const o=rec.bySrc.get(src.name)||{name:src.name,actor:src.actor,n:0,gain:0};o.n++;o.gain+=delta;rec.bySrc.set(src.name,o);rec.byRound.set(bout,(rec.byRound.get(bout)||0)+delta)}
              }
            }
          }
          if((e===1004||e===1006||e===1007||e===1005)&&d.stateUid!=null){
            const su=String(d.stateUid);
            if(e===1005){const cu=cardStOf.get(su);if(cu){cardSt.get(cu)?.delete(su);cardStOf.delete(su)}}
            else if(e===1007){const cu=cardStOf.get(su);if(cu){const o=cardSt.get(cu)?.get(su);if(o)o.layer=d.newLayer??o.layer}}
            else if(d.stateId!=null&&d.ownerUid!=null&&!actors.has(String(d.ownerUid))&&(d.stateType===3||cards.has(String(d.ownerUid)))){const cu=String(d.ownerUid);if(!cardSt.has(cu))cardSt.set(cu,new Map());cardSt.get(cu).set(su,{stateId:d.stateId,layer:d.layer??1});cardStOf.set(su,cu)}
          }
          if((e===1004||e===1006)&&FIA_LVL[d.stateId]&&d.stateUid!=null){fiaByState.set(String(d.stateUid),String(d.ownerUid));fiaCard.set(String(d.ownerUid),FIA_LVL[d.stateId])}
          else if(e===1005&&d.stateUid!=null&&fiaByState.has(String(d.stateUid))){const cu=fiaByState.get(String(d.stateUid));fiaByState.delete(String(d.stateUid));if(fiaCard.get(cu)&&![...fiaByState.values()].includes(cu))fiaCard.delete(cu)}
          else if(e===1004&&d.stateUid!=null&&(d.stateType===1||actors.has(String(d.ownerUid??d.roleUid)))){stateMap(d.ownerUid??d.roleUid).set(String(d.stateUid),{stateId:d.stateId,layer:d.layer??1,args:d.descArgs?.curValues})}
          else if(e===1007&&d.stateUid!=null){const m=stateMap(d.ownerUid??d.roleUid),cur=m.get(String(d.stateUid));if(cur&&(d.newLayer??1)>0){cur.layer=d.newLayer;if(d.descArgs?.curValues?.length)cur.args=d.descArgs.curValues}else if(cur){if(cur.stateId===3130)expireTemp();m.delete(String(d.stateUid))}}
          else if(e===1005&&d.stateUid!=null){const cur=stateMap(d.ownerUid).get(String(d.stateUid));if(cur?.stateId===3130)expireTemp();stateMap(d.ownerUid).delete(String(d.stateUid))}
          else if(e===1001&&d.roleUid!=null){unit(d.roleUid).intent=d.intention||null}
          if(e===1028&&d.propertyType==='death_resist_times'&&d.extraData&&Number(d.changedValue)>0){deathResistN++;gearTrigger('deathResist',{},fr.time)}
          if(e===1028&&d.propertyType==='hp'&&typeof d.value==='number'&&d.value<=0&&actors.get(String(d.uid))?.kind==='monster')killed.add(String(d.uid));
          if((e===1004||e===1006||(e===1007&&(d.newLayer||0)>(d.oldLayer||0)))&&d.stateId!=null&&relicOfState.has(String(d.stateId))&&bout>0&&!/计数|标记|标识|限额|监听|统计/.test(String(res.state[String(d.stateId)]?.CnID||''))){for(const tid of relicOfState.get(String(d.stateId))){const o=relicStateAdds.get(tid)||{times:new Set(),rounds:new Set()};o.times.add(Math.round((fr.time||0)*10));o.rounds.add(bout);relicStateAdds.set(tid,o)}}
          if((e===1004||e===1006)&&d.stateId===2934&&execSrc.cur?.play&&actors.get(String(d.ownerUid??d.roleUid))?.camp===2)execSrc.cur.play.vuln=true;
          if((e===1004||e===1006||e===1007)&&d.stateId!=null){const ly=e===1007?Number(d.newLayer):Number(d.layer||1),k=String(d.ownerUid??d.roleUid)+'|'+d.stateId;if(ly>(layerPeak.get(k)||0))layerPeak.set(k,ly)}
          if(e===1028&&d.uid!=null&&Number(d.changedValue)<0&&bout>0&&(d.propertyType==='card_cost'||d.propertyType==='awaker_cmdcard_notextend_cost_fix')){
            const ks=srcKeys(fr.time);for(const k of ks)supOf(k).cut+=-Number(d.changedValue)/ks.length}
          if(e===1028&&d.uid!=null&&Number(d.changedValue)>0&&bout>0){
            if(d.propertyType==='block'&&actors.get(String(d.uid))?.camp===1){passiveHit('shield',Number(d.changedValue),d.extraData?.castRoleUid);staticHit('block',Number(d.changedValue),d.extraData?.castRoleUid)}else if(d.propertyType==='hp'&&d.reason!==4&&actors.get(String(d.uid))?.camp===1){passiveHit('heal',Number(d.changedValue),d.extraData?.castRoleUid);staticHit('heal',Number(d.changedValue),d.extraData?.castRoleUid)}
            const pt=d.propertyType,cv=Number(d.changedValue),wm=pt==='ulti_energy'&&d.extraData?.cmdServerUid!=null?gearWins.find(w=>w.ali!=null&&fr.time>=w.t0&&fr.time<=w.t1&&Math.abs(w.ali-Number(d.extraData?.castValue))<.01&&(w.tgt!=='StateOwner'||w.owners.includes(String(d.uid)))):null,evm=(()=>{if(!evList.length||(relWin&&!relWin.gear&&relWin.queue?.length))return null;const cv0=Math.abs(Number(d.extraData?.castValue));if(!(cv0>0)||d.extraData?.cmdServerUid==null)return null;/* natural regeneration carries no command id */const SB=['BSTAfterUseCard','BSTAfterUseKeeperSkill','BSTAfterUltiSkill','BSTAfterBoutBegin','BSTAfterBoutEnd','BSTAfterLaunchSwallow','BSTRoleAfterDeathResist','BSTAfterDimensionBoutBegin','NAMED'],gk=(x)=>'gear:'+x.e.key,live=x=>gearWins.some(w=>w.ch===x.ch&&fr.time>=w.t0&&fr.time<=w.t1)||(!!x.e.fx&&gearTimes.get(fr.time)?.has(gk(x)));const hit=evList.filter(x=>x.prop===pt&&Math.abs(x.amt-cv0)<.01&&(pt!=='hp'||actors.get(String(d.uid))?.camp===1)&&(!SB.includes(x.ch.base)||live(x))&&(x.tgt!=='StateOwner'||x.e.owners.includes(String(d.uid))));return hit.length&&new Set(hit.map(x=>x.e)).size===1?hit:null})(),keys0=wm?wm.keys:evm?['gear:'+evm[0].e.key]:srcKeys(fr.time),keys1=(wm||evm)?keys0:keys0.filter(k=>!(k.startsWith('gear:')&&Object.values(EV_PROP).includes(pt))),   // resource changes reach a wheel / covenant only through an exact amount match
          keys=keys1.length?keys1:(()=>{const a=execSrc.cur?.actor,ak=a!=null?actors.get(String(a))?.kind:null;return ak==='awakener'?['act:'+a]:ak==='keeper'?['kp']:[]})(),rcv=actors.get(String(d.uid));
            if(pt==='max_hp'&&rcv?.camp===1){const cu=String(d.extraData?.castRoleUid);if(actors.get(cu)?.kind==='awakener')supOf('act:'+cu).maxHp=(supOf('act:'+cu).maxHp||0)+cv}   // the team HP pool belongs to the keeper: credit the awakener whose state raised it (饱餐)
            if(evm)for(const x of evm){{const tk=Math.round(fr.time*10);x.ch.evTimes.add(tk);x.ch.evRounds.add(bout);if(!x.ch.evPer.has(bout))x.ch.evPer.set(bout,new Set());x.ch.evPer.get(bout).add(tk)}}
            const part=keys.length?1/keys.length:1;
            if(execSrc.cur?.play){const pl=execSrc.cur.play;if(pt==='block'&&actors.get(String(d.uid))?.camp===1)pl.block+=cv;else if(pt==='energy')pl.eng+=cv;else if(pt==='ulti_energy')pl.ali+=cv}
            for(const k of keys){const sp=supOf(k);
              if(pt==='ulti_energy'&&rcv?.kind==='awakener'){if(k==='act:'+d.uid)sp.aliSelf+=cv*part;else sp.aliOthers+=cv*part}
              else if(pt==='keeper_energy')sp.key+=cv*part;
              else if(pt==='energy')sp.energy+=cv*part;
              else if(pt==='death_resist')sp.dr+=cv*part;
              else if(pt==='occupation_master'||pt==='occupation_master_final')sp.rm+=cv*part
              else if(pt==='scarlet_blood_count')sp.embryo+=cv*part
              else if(/black|money|coin/i.test(String(pt))&&!/per|upgrade/i.test(String(pt)))sp.seal+=cv*part
              else if(pt==='tentacle_dmg')sp.tenGain+=cv*part
              else if(pt==='block'&&rcv?.camp===1&&k!=='kp'&&!k.startsWith('act:')&&keyHas(k,/护盾|shield|block/i))sp.blk+=cv*part
              else if(pt==='hp'&&d.reason!==4&&rcv?.camp===1&&k!=='kp'&&!k.startsWith('act:')&&keyHas(k,/治疗|恢复|heal|restore/i))sp.heal+=cv*part}
            if(!keys.length){if(pt==='ulti_energy')passiveSupport.ali+=cv;else if(pt==='keeper_energy')passiveSupport.key+=cv}
            // actor-sourced buffs: power / crit damage / crit rate / base damage -> estimated extra damage through the same hit model as relics
            if(rcv?.kind==='awakener'&&keys.length&&!relWin){
              const kind=pt==='damage_plus'?'power':pt==='crit_damage'?'crit':pt==='crit'?'critrate':(pt==='basic_damage_per'||pt==='i_basic_damage_per')?'basic':null;
              if(kind)for(const k of keys.filter(x=>x.startsWith('act:'))){const tid=k,rel={tid,kind},temp=kind==='power'?tempPow.has(`${fr.time}|${d.uid}`):kind==='crit'?critReverts.has(`${fr.time}|${d.uid}`):false;
                const ctx=newInstance({time:fr.time},rel,cv,temp);grant(ctx,d.uid,cv,rel,temp);supOf(k)[kind==='power'?'powerGain':kind==='crit'?'critGain':kind==='critrate'?'critRateGain':'basicGain']+=cv}
            }
          }
          if(e===1028&&d.propertyType==='crit_damage'&&Number(d.changedValue)<0&&d.uid!=null){const k=String(d.uid);if(activeBuff.has(k))activeBuff.set(k,activeBuff.get(k).filter(x=>!(x.kind==='crit'&&x.temp)))}
          else if(e===1077&&d.statsData){lastStats=d.statsData}
          else if(e===1011&&d.roleUid!=null&&d.args&&typeof d.args==='object'){unit(d.roleUid).skillArgs=d.args}
          if(e===1020&&d?.battleFinishData){result={winCamp:d.battleFinishData.winCamp,finishType:d.battleFinishData.finishType};finishStats=d.battleFinishData.statistics||null}
          if(e===1019&&d?.boutNumber){
            push('snap','','',d,fr,{snap:snap()});
            const nb=Number(d.boutNumber)||bout;
            if(d?.config?.camp===1&&Number(d.newPhase)===1){if(rounds.has(rk()))getRound(rk()).snapEnd=snap();dimOn=nb===lastDim;getRound(dimOn?nb+.5:nb).snapStart=snap()}
            if(d?.config?.camp===2&&camp===1&&bout>0&&!roundEnd.has(bout))roundEnd.set(bout,{hpf:(()=>{let m=1;for(const a of actors.values()){if(a.kind!=='awakener')continue;const p=board.get(String(a.uid))?.props||{};if(p.max_hp>0&&p.hp!=null)m=Math.min(m,Math.max(0,p.hp)/p.max_hp)}return m})(),energy:unit(ent.keeperUid).energy??0,hand:[...handUids].map(u=>({uid:u,tid:cards.get(u)?.tid,cost:cards.get(u)?.cost}))});
            bout=nb;camp=d?.config?.camp||camp;phase=Number(d.newPhase)||0;execSrc.cur=camp===2?{name:ui('敌方回合','Enemy turn')}:null;
            if(camp===1&&phase===1)push('round',dimOn?ui(`第 ${bout} 回合后 · 超维回合开始`,`Ultra-Space bout after round ${bout}`):ui(`第 ${bout} 回合开始`,`Round ${bout} start`),'',d,fr);
            /* a second player phase 1 inside the same bout number is the Ultra-Space (超维) bout */if(camp===1&&phase===1&&dynIds.size)for(const id of dynIds)for(const [uid,m] of bstates){let ly=0;for(const v of m.values())if(String(v.stateId)===id)ly+=v.layer||0;if(ly>0){const k=uid+'|'+id;if(!layerSeries.has(k))layerSeries.set(k,[]);layerSeries.get(k).push(ly)}}
            if(camp===1&&phase===1){if(dimOn)gearTrigger('dimension',{},fr.time);else{lastDim=bout;gearTrigger('boutBegin',{},fr.time)}}else if(camp===1&&phase===3)gearTrigger('boutEnd',{},fr.time);
            continue;
          }
          if(!bout)continue;
          // enemy acting: monster fsm switches into the action state with the skill it performs
          if(e===1013&&camp===2&&phase===2&&d.newState===2&&d.config?.skillConfigId!=null&&actors.get(String(d.uid))?.kind==='monster'){
            const name=res.nameSkill(d.config.skillConfigId),tgt=d.config.targetRoleUid;
            push('enemyact',`${plainName(d.uid)} · ${name}`,'',d,fr,{skillTid:d.config.skillConfigId,actorUid:d.uid,targetUid:tgt,skillName:name,tip:skillTip(res,d.config.skillConfigId,{ctx:{BattleAtkForce:unit(d.uid).props?.atk}})});continue;
          }
          if(e===1067){
            const tid=d.configId??d.tid,ownerUid=d.ownerUid??d.roleUid,kind=d.deck==='UsingDeck'?'card':(d.roleUid?'ultimate':'skill'),name=res.nameSkill(tid);
            const fiaLvl=fiaCard.get(String(d.uid))||0,fiaP=fiaLvl?fiaPct(ownerUid,fiaLvl):0;curFia={ev:evalPara(tid,ownerUid,d.uid),uid:String(ownerUid),lvl:fiaLvl,pct:fiaP,args:d.descArgs?.curValues||null,tid,cmul:cardMul.get(String(d.uid))||0,cuid:String(d.uid)};if(fiaLvl){const u=fiaUse.get(String(ownerUid))||{plays:0,byLvl:{1:0,2:0,3:0}};u.plays++;u.byLvl[fiaLvl]++;fiaUse.set(String(ownerUid),u)}
            execSrc.cur={name:`${plainName(ownerUid)} · ${name}`,actor:ownerUid};
            {const play={round:bout,time:fr.time,tid,owner:String(ownerUid),cost:d.cost,kind,cardUid:d.uid,dmg:0,block:0,heal:0,eng:0,ali:0,draw:0};playLog.push(play);execSrc.cur.play=play}
            if(actors.get(String(ownerUid))?.kind==='awakener'){const ci=copyCutInfo(res,tid),vals=d.descArgs?.curValues;
              if(kind==='ultimate')supOf('act:'+ownerUid).ultCasts+=1;
              if(ci&&ci.cutPos>=0&&Array.isArray(vals)){const cut=Number(vals[ci.cutPos])||0,cp=ci.copyPos>=0?Number(vals[ci.copyPos])||1:1;if(cut>0){const sp=supOf('act:'+ownerUid);sp.copies+=cp;sp.costCut+=cut*cp}}}
            push(kind,`${plainName(ownerUid)} · ${name}`,'',d,fr,{skillTid:tid,actorUid:ownerUid,cardUid:d.uid,cost:d.cost,deck:d.deck,skillName:name,fiaLvl,fiaPct:fiaP,stypes:asList(res.skill[String(tid)]?.Type),tip:skillTip(res,tid,{args:d.descArgs?.curValues,level:d.level})});
            if(kind==='card')for(const cr of condRelics){if(handUids.size<=cr.hand&&(cr.per.get(bout)||0)<(cr.cap||99)){cr.per.set(bout,(cr.per.get(bout)||0)+1);const o=relicCond.get(cr.tid)||{n:0,draws:0,rounds:new Set()};o.n++;o.draws+=cr.draw;o.rounds.add(bout);relicCond.set(cr.tid,o)}}
            if(kind==='card')gearTrigger('card',{owner:ownerUid,tid,types:asList(res.skill[String(tid)]?.Type)},fr.time);else if(kind==='ultimate')gearTrigger('ulti',{owner:ownerUid,tid},fr.time);
            continue;
          }
          if(e===1064){const name=res.nameSkill(d.skillId);execSrc.cur={name:`${ui('钥令','Keeper skill')} · ${name}`,actor:d.roleUid};{const play={round:bout,time:fr.time,tid:d.skillId,owner:String(d.roleUid),kind:'keeper',dmg:0,block:0,heal:0,eng:0,ali:0,draw:0};playLog.push(play);execSrc.cur.play=play}push('keeper',`${ui('钥令','Keeper skill')} · ${name}`,'',d,fr,{skillTid:d.skillId,actorUid:d.roleUid,skillName:name,iconSrc:keeperSkillIconSrc(res,d.skillId),tip:skillTip(res,d.skillId,{args:argList(unit(d.roleUid).skillArgs),ctx:{}})});gearTrigger('keeper',{},fr.time);continue}
          if(e===1093){if(actors.get(String(d.casterUid))?.kind==='awakener')execSrc.cur={name:res.nameSkill(d.skillTid),actor:d.casterUid};const name=res.nameSkill(d.skillTid);push('trigger',`${plainName(d.casterUid)} · ${name}`,`<span class="mr2lead">${ui('派生','Triggered')}</span>${chip(d.casterUid)}<b>${esc(name)}</b>${d.producerUid!=null&&d.producerUid!==d.casterUid?`<span class="mr2from">← ${chip(d.producerUid)}</span>`:''}`,d,fr,{skillTid:d.skillTid,actorUid:d.casterUid,producerUid:d.producerUid,skillName:name});continue}
          if(e===1014&&d.beHitConfig){
            {const bh=d.beHitConfig,tt=actorOf(bh.targetRoleUid),cc=actorOf(bh.castRoleUid);
              const o=counterLog.get('team')||{taken:0,layerSum:0,perm:0,temp:0,extraTrig:0,maxLayer:0,rounds:new Map(),actualHits:0,actualDmg:0};
              if(tt?.kind==='keeper'&&cc?.kind==='monster'&&bout>0){
                const lay=id=>{let n=0;for(const v of (bstates.get(String(bh.targetRoleUid))?.values()||[]))if(v.stateId===id)n+=v.layer||0;return n};
                const L=lay(3905)+lay(3023);
                o.taken++;o.layerSum+=L;{const lost=Math.abs((Number(bh.curHp)||0)-(Number(bh.oldHp)||0))||Math.abs(Number(bh.changeVal)||0);if(lost>0){o.takenHp=(o.takenHp||0)+1;o.layerSumHp=(o.layerSumHp||0)+L}if(Number(bh.damageType)===1||Number(bh.damageType)===undefined){o.layerSumT1=(o.layerSumT1||0)+L}}o.perm+=lay(3905);o.temp+=lay(3023);o.extraTrig+=lay(3129);o.maxLayer=Math.max(o.maxLayer,L);
                const r=o.rounds.get(bout)||{n:0,pred:0,act:0};r.n++;r.pred+=L;o.rounds.set(bout,r);counterLog.set('team',o)}
              else if(tt?.kind==='monster'&&cc?.kind==='keeper'&&Number(bh.damageType)===3&&bout>0){
                const a=Math.abs((Number(bh.curHp)||0)-(Number(bh.oldHp)||0))||Math.abs(Number(bh.changeVal)||0);
                o.actualHits++;o.actualDmg+=a;const r=o.rounds.get(bout)||{n:0,pred:0,act:0};r.act+=a;o.rounds.set(bout,r);counterLog.set('team',o)}}
            // damage the enemy would have dealt without our debuffs (weak / confusion-type %, flat strength reductions), credited to whoever applied them
            {const bh=d.beHitConfig,cc=actorOf(bh.castRoleUid),tt=actorOf(bh.targetRoleUid);
              if(cc?.kind==='monster'&&(tt?.kind==='keeper'||tt?.kind==='awakener')&&Number(bh.damageType)===1&&bout>0){
                const D=Number(bh.originVal)||0,pr=board.get(String(bh.castRoleUid))?.props||{};
                const pct=Math.min(0.9,Math.max(0,1-(1-(pr.weak_per||0)/100)*(1+Math.min(0,pr.i_damage_per3||0)/100))),flat=Math.max(0,-(pr.damage_plus||0));
                if(D>0&&(pct>0||flat>0)){
                  let prevented=Math.min(5*D,D*pct/(1-pct)+flat);
                  const pctSrc=[],flatSrc=[];
                  for(const [su,v] of bstates.get(String(bh.castRoleUid))||[]){const r=res.state[String(v.stateId)]||{},ex=r.ExistProperty||{},ds=pipeName(String(r.Desc||'')),keys=stSrc.get(String(su));if(!keys||!keys.length)continue;
                    const isPct='weak_per' in ex||'i_damage_per3' in ex||/造成[^。]{0,8}伤害降低[^。]{0,12}[%％]|伤害降低\s*\[DescArg\d\]\s*[%％]/.test(ds),isFlat=(typeof ex.damage_plus==='string'&&/\(-1\)|^-/.test(ex.damage_plus))||/主动伤害降低\s*\[Layer\]/.test(ds);
                    if(isPct)pctSrc.push({keys,w:1,nm:res.nameState(v.stateId)});if(isFlat)flatSrc.push({keys,w:Math.max(1,v.layer||1),nm:res.nameState(v.stateId)})}
                  const parts=[[prevented-flat>0?prevented-Math.min(prevented,flat):0,pctSrc],[Math.min(prevented,flat),flatSrc]];
                  for(const [amt,list] of parts){if(!(amt>0)||!list.length)continue;const tw=list.reduce((n,x)=>n+x.w,0);for(const x of list){const sh=amt*x.w/tw/x.keys.length;for(const k of x.keys){const sp=supOf(k);sp.prevented+=sh;sp.prevTypes.set(x.nm,(sp.prevTypes.get(x.nm)||0)+sh)}}}
                }
              }}
            const h=d.beHitConfig,delta=(Number(h.curHp)||0)-(Number(h.oldHp)||0),amt=Math.abs(delta||Number(h.changeVal)||0),typ=delta>0?'heal':'damage',sname=res.nameSkill(h.skillConfigId);
            if(typ==='heal'&&bout>0&&actorOf(h.targetRoleUid)?.camp===1){const nom=Number(h.originVal)||0;if(nom>0){healNom+=nom;healAct+=Math.min(nom,amt)}}
            if(execSrc.cur?.play&&bout>0){const pl=execSrc.cur.play;if(typ==='damage'&&actorOf(h.targetRoleUid)?.kind==='monster'&&actorOf(h.castRoleUid)?.kind==='awakener')pl.dmg+=amt;else if(typ==='heal'&&actorOf(h.targetRoleUid)?.camp===1)pl.heal+=amt}
            if(typ==='damage'&&actorOf(h.castRoleUid)?.kind==='awakener'&&actorOf(h.targetRoleUid)?.kind==='monster'){
              const pr=board.get(String(h.castRoleUid))?.props||{},tp=board.get(String(h.targetRoleUid))?.props||{};
              const vOn=[...(bstates.get(String(h.targetRoleUid))?.values()||[])].some(x=>x.stateId===2934&&x.layer>0);
              const pk={};for(const k of HIT_PROPS)if(pr[k])pk[k]=pr[k];
              hitLog.push({t:fr.time,uid:String(h.castRoleUid),cmd:String(h.fromCmdServerUid??h.cmdServerUid??''),target:String(h.targetRoleUid),skill:h.skillConfigId,dmg:Number(h.originVal)||amt,crit:!!h.isCrit,round:bout,P:pk,arg:curFia&&curFia.uid===String(h.castRoleUid)?curFia.args:null,ptid:curFia?.tid,cmul:curFia&&curFia.uid===String(h.castRoleUid)?curFia.cmul:0,fia:curFia&&curFia.uid===String(h.castRoleUid)?curFia.pct:0,fiaLvl:curFia&&curFia.uid===String(h.castRoleUid)?curFia.lvl:0,
                amp:(()=>{const out=[];for(const [su,v] of bstates.get(String(h.targetRoleUid))||[]){const ex=res.state[String(v.stateId)]?.ExistProperty;if(!ex)continue;for(const [pr,expr] of Object.entries(ex)){if(!/^be_damage_per/.test(pr))continue;const m=String(expr).match(/^ChangedLayer\s*\*\s*(-?\d+(?:\.\d+)?)$/),pv=m?(v.layer||1)*Number(m[1]):Number.isFinite(Number(expr))?Number(expr):null;if(pv>0)out.push({p:pv,keys:stSrc.get(String(su))||[],nm:res.nameState(v.stateId)})}}return out})(),
                stl:(()=>{const o={};for(const v of (bstates.get(String(h.castRoleUid))?.values()||[]))if(v.layer>0)o[v.stateId]=(o[v.stateId]||0)+v.layer;return o})(),vOn,vsrc:vOn?vulnSrc.get(String(h.targetRoleUid))||null:null,blind:[...(bstates.get(String(h.castRoleUid))?.values()||[])].some(x=>x.stateId===44763&&x.layer>0),...(curFia&&curFia.uid===String(h.castRoleUid)&&String(curFia.tid)===String(h.skillConfigId)&&curFia.ev?curFia.ev:evalPara(h.skillConfigId,h.castRoleUid,curFia&&curFia.uid===String(h.castRoleUid)?curFia.cuid:'')),kst:(()=>{const o={};for(const [uid,m] of bstates)if(!actors.get(uid)||actors.get(uid).kind==='keeper')for(const v of m.values())if([98181,98469,133285].includes(v.stateId))o[v.stateId]=(o[v.stateId]||0)+(v.layer||0);return o})(),vPct:tp.vulnerable_per||50,buffs:(activeBuff.get(String(h.castRoleUid))||[]).map(b=>({...b}))});
            }
            const hpAfter=hpMini(h.curHp,h.curMaxHp,actorOf(h.targetRoleUid)?.camp===2);
            const html=`${chip(h.castRoleUid)}<span class="mr2arrow">→</span>${chip(h.targetRoleUid)}<span class="mr2amt ${typ}">${typ==='damage'?'−':'+'}${fmt(amt)}</span>${hpAfter}${h.isCrit?`<span class="mr2tag crit">${ui('暴击','CRIT')}</span>`:''}${h.blockedDamage?`<span class="mr2tag">${ui('护盾抵挡','Blocked')} ${fmt(h.blockedDamage)}</span>`:''}<span class="mr2from">${esc(sname)}</span>`;
            push(typ,`${plainName(h.castRoleUid)} → ${plainName(h.targetRoleUid)} · ${sname} · ${typ==='damage'?ui('伤害','DMG'):ui('治疗','Heal')} ${fmt(amt)}${h.isCrit?` · ${ui('暴击','CRIT')}`:''}`,html,d,fr,{skillTid:h.skillConfigId,actorUid:h.castRoleUid,targetUid:h.targetRoleUid,amount:amt,crit:!!h.isCrit,blocked:h.blockedDamage||0,damageType:h.damageType});continue;
          }
          if(e===1084&&d.relic?.tid!=null){const nm=res.nameRelic(d.relic.tid);push('relic',`${ui('获得造物','Relic gained')} · ${nm}`,`<span class="mr2lead">${ui('获得造物','Gained')}</span><span class="mr2chip relic"${relicTipAttr(res,d.relic.tid)}>${ico(relicIconSrc(res,d.relic.tid),'物','rl')}<span>${esc(nm)}</span></span>`,d,fr,{relicTid:d.relic.tid,gained:true});continue}
          if(e===1050){const nm=res.nameRelic(d.relicTid);push('relic',`${ui('造物触发','Relic')} · ${nm}`,`<span class="mr2chip relic"${relicTipAttr(res,d.relicTid)}>${ico(relicIconSrc(res,d.relicTid),'物','rl')}<span>${esc(nm)}</span></span>`,d,fr,{relicTid:d.relicTid});continue}
          if(e===1046&&Array.isArray(d.targetUids)&&d.targetUids.length>1&&d.targetUids.every(t=>typeof t==='number'&&asList(res.skill[String(t)]?.Type).includes('Keeper_Skill')))keeperPicks.push({round:bout,time:fr.time,options:d.targetUids.slice(),chosen:null,via:d.skillConfigId});
          if(e===1064){const pk=[...keeperPicks].reverse().find(x=>x.chosen==null&&x.options.includes(d.skillId));if(pk)pk.chosen=d.skillId}
          if(e===1046){const targets=(d.targetUids||[]).map(t=>{if(t&&typeof t==='object'){if(t.uid!=null&&!cards.has(String(t.uid)))cards.set(String(t.uid),{uid:t.uid,tid:t.tid,ownerUid:undefined});return t.uid}return t});push('select',`${d.targetRelicList?ui('选择造物','Relic choice'):ui('目标选择','Target selection')} · ${res.nameSkill(d.skillConfigId)} → ${targets.map(plainName).join(', ')||'-'}`,`<span class="mr2lead">${d.targetRelicList?ui('选择造物','Pick relic'):ui('选择目标','Choose')}</span><b>${esc(res.nameSkill(d.skillConfigId))}</b><span class="mr2arrow">→</span>${targets.map(t=>chip(t)).join('')||'—'}`,d,fr,{skillTid:d.skillConfigId,targetUids:targets});continue}
          if(e===1049){gearTrigger('swallow',{},fr.time);const list=d.cardUidList||[];push('swallow',`${ui('吞噬卡牌','Swallow card')} · ${list.map(plainName).join(', ')}`,`<span class="mr2lead">${ui('吞噬','Swallow')}</span>${list.map(t=>chip(t)).join('')}`,d,fr,{cardUids:list});continue}
          if(e===1004||e===1007){
            const sid=d.stateId,owner=d.ownerUid??d.roleUid,hidden=res.state[String(sid)]?.ShowType==='Hide',who=chip(owner),tipS=stateTipAttr(res,sid,{args:d.descArgs?.curValues,layer:d.newLayer??d.layer,props:board.get(String(owner))?.props});
            if(e===1004){const layer=d.layer>1?`×${d.layer}`:'';push('state',`${ui('状态添加','State add')} · ${res.nameState(sid)} → ${plainName(owner)}`,`${stateBadge(sid,layer,tipS)}<span class="mr2arrow">→</span>${who}`,d,fr,{stateId:sid,actorUid:d.castRoleUid,targetUid:owner,hidden});}
            else push('state',`${ui('状态层数','State layer')} · ${res.nameState(sid)} ${d.oldLayer??'?'} → ${d.newLayer??'?'} · ${plainName(owner)}`,`${stateBadge(sid,`${d.oldLayer??'?'}→${d.newLayer??'?'}`,tipS)}<span class="mr2arrow">→</span>${who}`,d,fr,{stateId:sid,actorUid:d.castRoleUid,targetUid:owner,hidden});
            continue;
          }
          if(e===1025&&Array.isArray(d.cards)&&bout>0){const ks=srcKeys(fr.time).filter(x=>x.startsWith('act:'));if(ks.length)for(const c of d.cards){const nm=res.nameSkill(c.tid??c.configId);if(nm==='灵感'||nm==='Inspiration')supOf(ks[0]).inspire+=1;else if(/胚胎|圣洁之子/.test(nm))supOf(ks[0]).embCards+=1}}
          if(e===1027&&Array.isArray(d.cardUidList)&&bout>0){const ks=srcKeys(fr.time),n=d.cardUidList.length,od=d.oldDeck,nd=d.newDeck,why=Number(d.changeReason);
            const kind=od==='DrawDeck'&&nd==='HandDeck'?'draw':(od==='GraveyardDeck'&&(nd==='HandDeck'||nd==='DrawDeck'))?'cycle':(od==='HandDeck'&&nd==='GraveyardDeck'&&why!==1)?'cycle':null;
            if(kind==='draw'&&execSrc.cur?.play)execSrc.cur.play.draw+=n;
            if(kind&&ks.length)for(const k of ks){const sp=supOf(k);if(kind==='draw')sp.draws+=n/ks.length;else sp.cycles+=n/ks.length}}
          if(e===1027&&Array.isArray(d.cardUidList)){for(const u of d.cardUidList){const k=String(u);if(d.oldDeck==='HandDeck')handUids.delete(k);if(d.newDeck==='HandDeck')handUids.add(k)}}
          if((e===1025&&d.deck==='HandDeck'&&d.cards?.length))for(const c of d.cards)handUids.add(String(c.uid));
          if(e===1035&&d.deck==='HandDeck'&&d.cardUid!=null)handUids.add(String(d.cardUid));
          if(e===1027&&Array.isArray(d.cardUidList)&&d.cardUidList.length){
            const mk=moveKind(d.oldDeck,d.newDeck,d.changeReason);
            if(mk){const list=d.cardUidList;push('move',`${MOVE_LABEL[mk]} · ${list.map(plainName).join(', ')}`,`<span class="mr2lead mv ${mk}">${ui(MOVE_LABEL[mk],mk)}</span>${list.slice(0,10).map(t=>chip(t)).join('')}${list.length>10?`<span class="mr2from">+${list.length-10}</span>`:''}`,d,fr,{mv:mk,count:list.length,cardUids:list})}
            continue;
          }
          if((e===1025&&d.cards?.length&&(d.deck==='HandDeck'||d.deck==='GraveyardDeck'||d.deck==='DrawDeck'))||(e===1035&&d.isPlayEffect&&(d.deck==='DrawDeck'||d.deck==='GraveyardDeck'||d.deck==='HandDeck'))){
            const list=e===1025?d.cards.map(c=>c.uid):[d.cardUid],mk=d.deck==='HandDeck'?'create':d.deck==='GraveyardDeck'?'tograve':'todraw',lab={create:'获得',tograve:'加入弃牌堆',todraw:'加入抽牌堆'}[mk];
            push('move',`${lab} · ${list.map(plainName).join(', ')}`,`<span class="mr2lead mv ${mk}">${ui(lab,mk)}</span>${list.slice(0,10).map(t=>chip(t)).join('')}`,d,fr,{mv:mk,count:list.length,cardUids:list});
            continue;
          }
          if(e===1028&&actors.has(String(d.uid))&&!resLabels[d.propertyType]&&d.propertyType!=='hp'&&d.propertyType!=='max_hp'&&Number(d.changedValue)){
            const v=Number(d.changedValue),nm=statName(res,d.propertyType),total=fmtStat(d.propertyType,d.value);
            push('stat',`${plainName(d.uid)} · ${nm} ${v>0?'+':''}${fmt(v)}`,`<span class="mr2stat ${v<0?'neg':'pos'}" title="${esc(`${d.propertyType}`)}">${esc(nm)} ${v>0?'+':''}${fmtStat(d.propertyType,v)}<small>→ ${esc(total)}</small></span>${chip(d.uid)}`,d,fr,{actorUid:d.uid,statKey:d.propertyType,changedValue:v});
            continue;
          }
          if(e===1028&&resLabels[d.propertyType]){
            const v=Number(d.changedValue)||0;
            push('property',`${plainName(d.uid)} · ${resLabels[d.propertyType]} ${v>=0?'+':''}${fmt(v)}`,`<span class="mr2res ${esc(d.propertyType)} ${v<0?'neg':'pos'}"><i></i>${esc(resLabels[d.propertyType])} ${v>=0?'+':''}${fmt(v)}</span>${chip(d.uid)}`,d,fr,{actorUid:d.uid,property:d.propertyType,changedValue:v,resHtml:`<span class="mr2res ${esc(d.propertyType)} ${v<0?'neg':'pos'}"><i></i>${esc(resLabels[d.propertyType])} ${v>=0?'+':''}${fmt(v)}</span>`});continue
          }
        }
      }
    }
    if(rounds.has(rk())&&!getRound(rk()).snapEnd)getRound(rk()).snapEnd=snap();
    // effects whose amount scales with a state's layer (e.g. 银钥充能 = layer x StateArg2%), evaluated at the highest layer reached
    const gearDyn=new Map();
    for(const e of gears.values())for(const ch of e.channels){
      if(ch.cmd==null||!/GetStateLayer/.test(String(ch.para??'')))continue;
      const params=e.mainStates[0]?.params||[],owners=e.owners;let peak=0,usedLayer=null;
      const t=String(ch.para).replace(/StateOwner\.GetStateLayer\((\d+)\)/g,(m,id)=>{let pk=0;for(const o of owners)pk=Math.max(pk,layerPeak.get(o+'|'+id)||0);peak=Math.max(peak,pk);usedLayer=id;return pk}).replace(/StateArg(\d+)/g,(m,n)=>params[Number(n)-1]??'#');
      if(/#|[A-Za-z_]/.test(t.replace(/Math\.\w+/g,'')))continue;const v=evalNum(t,{});if(!Number.isFinite(v))continue;
      const types=(res.rr?.Cmd?.[String(ch.cmd)]?.data_list||[]).map(dl=>dl.Type);
      const ser=[];for(const o of owners)ser.push(...(layerSeries.get(o+'|'+usedLayer)||[]));const avgL=ser.length?ser.reduce((a,b)=>a+b,0)/ser.length:null;
      const avgT=avgL==null?null:evalNum(String(ch.para).replace(/StateOwner\.GetStateLayer\((\d+)\)/g,avgL).replace(/StateArg(\d+)/g,(m,n)=>params[Number(n)-1]??'#'),{});
      if(!gearDyn.has(e.key))gearDyn.set(e.key,[]);gearDyn.get(e.key).push({types,value:v,peak,avg:avgT,avgLayer:avgL,state:usedLayer?res.nameState(usedLayer):'',base:ch.base})}
    return {keeperFacts:()=>({healNom,healAct,deathResist:deathResistN}),relicDebuff,relicCond,battleCounts:()=>({cards:playLog.filter(p=>p.kind==='card').length,deathResist:deathResistN,kills:killed.size,finish:finishStats}),relicStateAdds,gearDyn,relicPass,openRelic,playLog,roundEnd,get result(){return result},supStore,passiveSupport,counterLog,counterGain,execStates,openProps,rounds:[...rounds.values()].sort((a,b)=>a.round-b.round),actors,frameCount,eventCount:globalSeq,res,ent,chip,campOf,lastStats,keeperPicks,relicBuffs,hitLog,gears,gearRecs};
  }

  function styles(){if(document.getElementById('morimensReplayReviewV2Style'))return;const s=document.createElement('style');s.id='morimensReplayReviewV2Style';s.textContent=`
    .mr2{display:grid;gap:14px}.mr2intro{padding:17px;border:1px solid rgba(213,177,118,.22);border-radius:15px;background:linear-gradient(135deg,rgba(213,177,118,.07),rgba(98,183,255,.04))}.mr2intro h2{margin:0;color:#f1d69f;font-size:20px}.mr2intro p{margin:8px 0 0;color:#aeb8c7;font-size:12px;line-height:1.75}.mr2form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:14px}.mr2form input{min-height:43px;border:1px solid #334155;border-radius:10px;background:#0d1724;color:#edf2f7;padding:8px 11px;font:inherit}.mr2form button{border:1px solid rgba(213,177,118,.35);border-radius:10px;background:rgba(213,177,118,.12);color:#f1d69f;padding:8px 13px;font-weight:800;cursor:pointer}.mr2status{padding:10px 12px;border-radius:10px;background:rgba(148,163,184,.07);border:1px solid rgba(148,163,184,.15);font-size:11px;color:#9ba8ba;line-height:1.65}.mr2status.ok{color:#9fd5b8;border-color:rgba(86,190,138,.25)}.mr2status.err{color:#e0aaa4;border-color:rgba(218,132,119,.28)}.mr2sum{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.mr2sum span{padding:9px 10px;border-radius:10px;background:rgba(255,255,255,.035);border:1px solid rgba(148,163,184,.1)}.mr2sum small{display:block;color:#758398;font-size:9px}.mr2sum strong{display:block;color:#e6edf6;margin-top:3px;font-size:12px;word-break:break-word}
    .mr2round{border:1px solid rgba(148,163,184,.14);border-radius:12px;background:rgba(4,9,16,.32);overflow:hidden}.mr2round>summary{cursor:pointer;list-style:none;padding:10px 12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.mr2round>summary::-webkit-details-marker{display:none}.mr2round>summary b{color:#f1d69f;font-size:14px}.mr2round>summary small{color:#8492a5}.mr2rbody{padding:0 10px 12px;display:grid;gap:10px}
    .mr2side{border:1px solid rgba(148,163,184,.1);border-radius:10px;overflow:hidden}.mr2side.c1{border-left:3px solid rgba(98,183,255,.55)}.mr2side.c2{border-left:3px solid rgba(218,132,119,.6)}.mr2sidehead{padding:6px 10px;font-size:11px;font-weight:800;color:#cdd8e6;background:rgba(255,255,255,.03)}
    .mr2settle{padding:7px 10px;border-top:1px solid rgba(148,163,184,.08);display:grid;gap:5px}.mr2settle h5{margin:0;font-size:10px;color:#7f8ea2;font-weight:700}.mr2flow{display:flex;flex-wrap:wrap;gap:5px 7px;align-items:center}
    .mr2act{padding:8px 10px;border-top:1px solid rgba(148,163,184,.08);display:grid;gap:6px}.mr2acthead{display:flex;flex-wrap:wrap;gap:7px;align-items:center;font-size:12px;color:#e6edf6}.mr2acthead b{font-size:13px}.mr2time{margin-left:auto;color:#6f7f93;font-size:10px;font-variant-numeric:tabular-nums}.mr2act.card{background:rgba(98,183,255,.03)}.mr2act.ultimate{background:rgba(213,177,118,.06)}.mr2act.keeper{background:rgba(175,130,220,.05)}.mr2act.mon{background:rgba(218,132,119,.04)}
    .mr2fx{display:grid;gap:5px;padding-left:12px;border-left:2px solid rgba(148,163,184,.12)}.mr2row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:11px;color:#c3cedd}.mr2lead{font-size:10px;color:#7f8ea2;padding:1px 6px;border-radius:999px;background:rgba(148,163,184,.1)}.mr2arrow{color:#6f7f93}.mr2from{color:#7f8ea2;font-size:10px}
    .mr2amt{font-weight:800;font-variant-numeric:tabular-nums}.mr2amt.damage{color:#ff9e93}.mr2amt.heal{color:#8fe0b2}.mr2tag{font-size:9px;padding:1px 5px;border-radius:999px;background:rgba(148,163,184,.14);color:#aebbd0}.mr2tag.crit{background:rgba(255,196,87,.18);color:#ffd27a}
    .mr2chip{display:inline-flex;align-items:center;gap:4px;padding:1px 7px 1px 2px;border-radius:999px;background:rgba(255,255,255,.05);border:1px solid rgba(148,163,184,.14);font-size:11px;color:#dbe4f0;line-height:1.5;max-width:100%}.mr2chip em{font-style:normal;color:#ffd27a;margin-left:2px}.mr2chip.aw.c1{border-color:rgba(98,183,255,.3)}.mr2chip.mon{border-color:rgba(218,132,119,.38);background:rgba(218,132,119,.07)}.mr2chip.keeper{border-color:rgba(213,177,118,.38);background:rgba(213,177,118,.07)}.mr2chip.card{border-color:rgba(98,183,255,.2)}.mr2chip.st{border-color:rgba(175,130,220,.28)}.mr2chip.relic{border-color:rgba(103,190,146,.3)}.mr2chip.unk{padding-left:7px;color:#8a97ab;border-style:dashed}
    .mr2ico{position:relative;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;flex:0 0 22px;border-radius:50%;overflow:hidden;background:#1a2433;color:#aebbd0;font-size:11px;font-weight:800}.mr2ico::before{content:var(--f);position:absolute}.mr2ico img{position:relative;width:100%;height:100%;object-fit:cover}.mr2ico.sm{width:16px;height:16px;flex-basis:16px;font-size:9px}.mr2chip.mon .mr2ico::before{color:#ff9e93}.mr2chip.keeper .mr2ico{background:#3a2f1a;color:#f1d69f}.mr2ico.rl,.mr2ico.st{border-radius:5px;width:20px;height:20px;flex-basis:20px}.mr2ico.rl img,.mr2ico.st img{object-fit:contain}
    .mr2ico.big{width:30px;height:30px;flex-basis:30px;font-size:13px}.mr2ico.kk{border-radius:6px;width:28px;height:28px;flex-basis:28px}.mr2ico.kk img{object-fit:contain}
    .mr2res{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:1px 7px;border-radius:999px;background:rgba(255,255,255,.04);border:1px solid rgba(148,163,184,.14)}.mr2res i{width:8px;height:8px;border-radius:50%;background:#6ab7ff}.mr2res.keeper_energy i{background:#e7cb96}.mr2res.ulti_energy i{background:#d07cff}.mr2res.block i{background:#7fe0c0}.mr2res.pos{color:#9fe3bb}.mr2res.neg{color:#ff9e93}
    .mr2badge{display:inline-block;padding:2px 6px;border-radius:999px;background:rgba(98,183,255,.12);color:#acd5f6;font-size:9px}.mr2badge.ultimate{background:rgba(213,177,118,.18);color:#f1d69f}.mr2badge.keeper{background:rgba(175,130,220,.16);color:#d8b9f0}.mr2badge.mon{background:rgba(218,132,119,.14);color:#efada5}.mr2dotchip{display:inline-flex;gap:4px;align-items:baseline;font-size:11px;color:#e6b3ff;background:rgba(190,110,230,.12);border:1px solid rgba(190,110,230,.35);border-radius:6px;padding:1px 6px}.mr2statchip{display:inline-flex;gap:4px;align-items:baseline;font-size:11px;padding:1px 7px;border-radius:6px;background:rgba(255,255,255,.06);color:#dfe8f4}.mr2statchip small{color:#8fa0b5;font-size:10px}.mr2statchip.up{background:rgba(110,200,140,.12);color:#b6ecc6}.mr2ostate{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:4px}.mr2cost{font-size:10px;padding:1px 6px;border-radius:6px;background:rgba(98,183,255,.14);color:#9fd0ff;font-weight:800}
    .mr2hid>summary{cursor:pointer;color:#6f7f93;font-size:10px}.mr2raw{margin-top:2px}.mr2raw summary{cursor:pointer;color:#6f7f93;font-size:9px}.mr2raw pre{max-height:260px;overflow:auto;white-space:pre-wrap;word-break:break-all;background:#08111c;padding:7px;border-radius:7px;color:#8fa0b5;font-size:9px}.mr2empty{padding:8px 10px;color:#6f7f93;font-size:11px}
    .dtideReplayReviewOpen{white-space:nowrap;border:1px solid rgba(98,183,255,.35);border-radius:7px;background:rgba(98,183,255,.09);color:#9fd0ff;padding:5px 8px;font:700 10px/1.2 inherit;cursor:pointer}@media(max-width:760px){.mr2form{grid-template-columns:1fr}.mr2sum{grid-template-columns:repeat(2,minmax(0,1fr))}.mr2time{margin-left:0}}

    .mr2act{--ac:#8aa0bd;--acr:138,160,189;padding:12px 14px 10px;border-top:1px solid rgba(148,163,184,.1);border-left:6px solid var(--ac);background:linear-gradient(90deg,rgba(var(--acr),.17),rgba(var(--acr),.03) 60%,transparent);gap:8px}
    .mr2act.a-ulti{--ac:#ff8a3d;--acr:255,138,61}.mr2act.a-awake{--ac:#ffd24a;--acr:255,210,74}.mr2act.a-keeper{--ac:#b57cff;--acr:181,124,255}.mr2act.a-strike{--ac:#ff6b6b;--acr:255,107,107}.mr2act.a-defend{--ac:#4fd18b;--acr:79,209,139}.mr2act.a-skill{--ac:#4aa3ff;--acr:74,163,255}.mr2act.a-curse{--ac:#8e86a8;--acr:142,134,168}.mr2act.a-other{--ac:#4fd0c8;--acr:79,208,200}.mr2act.a-enemy{--ac:#ff5c8a;--acr:255,92,138}
    .mr2acthead{gap:12px;align-items:center;flex-wrap:nowrap}.mr2acttitle{min-width:0;display:grid;gap:2px}.mr2actline{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.mr2actname{font-size:18px;line-height:1.25;color:#f4f7fb;letter-spacing:.2px}.mr2who{font-size:12px;color:#aebbd0}
    .mr2atype{display:inline-block;padding:2px 9px;border-radius:6px;background:var(--ac);color:#10151d;font-size:11px;font-weight:900;letter-spacing:.4px}
    .mr2cost{margin-left:auto;font-size:14px;padding:3px 10px;border-radius:8px;background:rgba(var(--acr),.18);color:var(--ac);border:1px solid rgba(var(--acr),.45);font-weight:900}.mr2acthead .mr2time{margin-left:auto;white-space:nowrap}.mr2cost+.mr2time{margin-left:12px}
    .mr2ico.lg{width:48px;height:48px;flex:0 0 48px;font-size:18px;border:2px solid var(--ac);box-shadow:0 0 0 3px rgba(var(--acr),.15)}.mr2ico.kk.lg{border-radius:10px;width:48px;height:48px}.mr2ico.xs{width:20px;height:20px;flex-basis:20px;font-size:10px}.mr2ico.kk.xs{border-radius:5px}
    .mr2fx{padding-left:60px;border-left:0;gap:4px;font-size:10px;opacity:.95}.mr2fx .mr2chip{font-size:10px;padding:0 6px 0 1px;background:rgba(255,255,255,.035);border-color:rgba(148,163,184,.1);color:#aab6c7}.mr2fx .mr2ico{width:16px;height:16px;flex-basis:16px;font-size:9px}.mr2fx .mr2ico.sm{width:13px;height:13px;flex-basis:13px}.mr2fx .mr2res{font-size:10px;padding:0 6px}.mr2fx .mr2lead{font-size:9px}
    .mr2row.hit{padding:4px 9px;border-radius:8px;background:rgba(255,120,100,.08);border:1px solid rgba(255,120,100,.18);width:fit-content;max-width:100%}.mr2row.hit .mr2chip{font-size:11px;color:#dbe4f0}.mr2row.hit .mr2ico{width:20px;height:20px;flex-basis:20px}.mr2row.hit .mr2amt{font-size:16px}
    .mr2minor{margin-top:1px}.mr2minor>summary{cursor:pointer;list-style:none;color:#6f7f93;font-size:10px;padding:1px 0}.mr2minor>summary::-webkit-details-marker{display:none}.mr2minor>summary::before{content:'▸ '}.mr2minor[open]>summary::before{content:'▾ '}.mr2minor[open]{padding:4px 0 2px}
    .mr2side.quiet{border-left-width:2px;background:rgba(255,255,255,.015)}.mr2side.quiet .mr2settle{border-top:0;padding:6px 10px;gap:3px}.mr2settlehead{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center}.mr2sttl{font-size:10px;font-weight:800;color:#8392a6;letter-spacing:.3px}.mr2side.quiet .mr2chip{font-size:10px;padding:0 6px 0 1px}.mr2side.quiet .mr2ico{width:16px;height:16px;flex-basis:16px;font-size:9px}
    .mr2sidehead{padding:8px 12px;font-size:12px;letter-spacing:.3px}.mr2side.c1>.mr2sidehead{background:rgba(74,163,255,.1);color:#9fd0ff}.mr2side.c2>.mr2sidehead{background:rgba(255,92,138,.1);color:#ffadc1}
    .mr2strip{display:inline-flex;gap:3px;flex-wrap:wrap;align-items:center;margin-left:auto}.mr2mark{--ac:#8aa0bd;display:inline-flex;border-radius:50%;padding:1px;background:var(--ac)}.mr2mark .mr2ico{border:0}.mr2mark.a-ulti{--ac:#ff8a3d}.mr2mark.a-awake{--ac:#ffd24a}.mr2mark.a-keeper{--ac:#b57cff}.mr2mark.a-strike{--ac:#ff6b6b}.mr2mark.a-defend{--ac:#4fd18b}.mr2mark.a-skill{--ac:#4aa3ff}.mr2mark.a-curse{--ac:#8e86a8}.mr2mark.a-other{--ac:#4fd0c8}.mr2mark:has(.kk){border-radius:6px}
    .mr2legend{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:10px;color:#9aa8bb;align-items:center}.mr2legend span{display:inline-flex;gap:5px;align-items:center}.mr2legend i{width:11px;height:11px;border-radius:3px;background:var(--c)}
    @media(max-width:760px){.mr2acthead{flex-wrap:wrap}.mr2fx{padding-left:0}.mr2actname{font-size:16px}}

    .mr2hpmini{display:inline-block;width:64px;height:6px;border-radius:3px;background:rgba(255,255,255,.1);overflow:hidden;vertical-align:middle}.mr2hpmini i{display:block;height:100%;background:linear-gradient(90deg,#3fbf7f,#7be0a6)}.mr2hpmini.enemy i{background:linear-gradient(90deg,#d8485f,#ff8a8a)}
    .mr2boardwrap{border:1px solid rgba(148,163,184,.14);border-radius:12px;background:rgba(6,12,20,.55);padding:8px 10px}.mr2boardtitle{font-size:10px;color:#7f8ea2;font-weight:800;letter-spacing:.3px;margin-bottom:6px}
    .mr2board{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}.mr2bcol{display:grid;gap:8px;align-content:start}.mr2bcol.ally{text-align:left}.mr2bcol.enemy{text-align:right}
    .mr2unit{display:flex;gap:10px;align-items:flex-start;padding:7px;border-radius:10px;background:rgba(74,163,255,.05);border:1px solid rgba(74,163,255,.14)}.mr2unit.enemy{flex-direction:row-reverse;background:rgba(255,92,138,.06);border-color:rgba(255,92,138,.22)}.mr2unit.down{opacity:.55;filter:grayscale(.6)}
    .mr2ico.lgx{width:40px;height:40px;flex:0 0 40px;font-size:15px;border:2px solid rgba(74,163,255,.55)}.mr2unit.enemy .mr2ico.lgx{border-color:rgba(255,92,138,.65);width:48px;height:48px;flex-basis:48px}.mr2ico.lgx.keeper{border-color:rgba(213,177,118,.7);background:#3a2f1a;color:#f1d69f}.mr2ico.lgx.mon::before{color:#ff9e93}
    .mr2ubody{min-width:0;flex:1;display:grid;gap:4px}.mr2uname{display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:12px;color:#e6edf6}.mr2unit.enemy .mr2uname{justify-content:flex-end}.mr2uname b{font-size:13px}
    .mr2hp{position:relative;height:16px;border-radius:5px;background:rgba(255,255,255,.08);overflow:hidden}.mr2hp i{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,#2fa56b,#6fdc9f)}.mr2hp.enemy i{inset:0 0 0 auto;background:linear-gradient(270deg,#c93a55,#ff7f8f)}.mr2hp span{position:relative;display:block;padding:0 7px;font-size:10px;line-height:16px;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.8);font-variant-numeric:tabular-nums;white-space:nowrap}.mr2hp span b{margin-left:6px;color:#ffe9a8}.mr2hp.enemy span{text-align:right}
    .mr2mini{position:relative;height:11px;border-radius:4px;background:rgba(255,255,255,.07);overflow:hidden}.mr2mini i{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,#8a45d6,#d07cff)}.mr2mini.key i{background:linear-gradient(90deg,#b8923f,#f1d69f)}.mr2mini span{position:relative;display:block;padding:0 6px;font-size:9px;line-height:11px;color:#eef;text-shadow:0 1px 2px rgba(0,0,0,.8)}.mr2unit.enemy .mr2mini i{inset:0 0 0 auto}.mr2unit.enemy .mr2mini span{text-align:right}
    .mr2pips{display:inline-flex;gap:3px;align-items:center}.mr2pips i{width:11px;height:11px;border-radius:50%;background:rgba(255,255,255,.1);border:1px solid rgba(98,183,255,.4)}.mr2pips i.on{background:#6ab7ff;box-shadow:0 0 6px rgba(106,183,255,.7)}.mr2pips small{font-size:9px;color:#9fd0ff;margin-left:4px}
    .mr2shield{font-size:10px;padding:0 6px;border-radius:999px;background:rgba(127,224,192,.14);color:#8fe8cb;border:1px solid rgba(127,224,192,.3)}.mr2delta{font-size:10px;font-weight:800;font-variant-numeric:tabular-nums}.mr2delta.neg{color:#ff9e93}.mr2delta.pos{color:#8fe0b2}.mr2intent{font-size:10px;padding:0 6px;border-radius:5px;background:rgba(255,196,87,.14);color:#ffd27a;border:1px solid rgba(255,196,87,.3)}
    .mr2ustates{display:flex;flex-wrap:wrap;gap:3px}.mr2unit.enemy .mr2ustates{justify-content:flex-end}.mr2ust{display:inline-flex;align-items:center;gap:3px;padding:0 5px 0 1px;border-radius:999px;background:rgba(255,255,255,.04);border:1px solid rgba(148,163,184,.14);font-size:9px;color:#b8c4d6}.mr2ust em{font-style:normal;color:#ffd27a;margin-left:2px}.mr2ust .mr2ico{width:14px;height:14px;flex-basis:14px;font-size:8px;border-radius:4px}.mr2ust.more{padding:0 6px;color:#8392a6}
    @media(max-width:760px){.mr2board{grid-template-columns:1fr}.mr2bcol.enemy{text-align:left}}

    #mr2tip{position:fixed;display:none;z-index:99999;max-width:380px;min-width:160px;padding:10px 12px;border-radius:10px;background:rgba(10,16,26,.97);border:1px solid rgba(213,177,118,.4);box-shadow:0 10px 30px rgba(0,0,0,.55);color:#dbe4f0;font-size:12px;line-height:1.6;pointer-events:none}#mr2tip b{display:block;color:#f1d69f;font-size:13px}#mr2tip small{display:block;color:#8fa0b5;font-size:10px;margin-top:1px}#mr2tip p{margin:6px 0 0;white-space:pre-line;word-break:break-word}
    .mr2toolbar{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font-size:11px;color:#9aa8bb}.mr2tog{display:inline-flex;gap:6px;align-items:center;cursor:pointer;padding:3px 9px;border-radius:7px;border:1px solid rgba(213,177,118,.3);background:rgba(213,177,118,.08);color:#f1d69f;font-weight:700}
    [data-tipt]{cursor:help}.mr2acthead[data-toggle]{cursor:pointer}
    .mr2desc{display:none;margin:2px 0 0 60px;padding:7px 10px;border-radius:8px;background:rgba(255,255,255,.04);border-left:3px solid var(--ac,#8aa0bd);color:#c3cedd;font-size:12px;line-height:1.7;white-space:pre-line}.mr2desc small{display:block;color:var(--ac,#8aa0bd);font-size:10px;font-weight:800;margin-bottom:2px}.mr2showdesc .mr2desc,.mr2act.descopen .mr2desc{display:block}
    .mr2lead.mv{font-weight:800}.mr2lead.mv.draw{background:rgba(79,208,200,.2);color:#6fe3da}.mr2lead.mv.discard{background:rgba(255,160,90,.2);color:#ffb783}.mr2lead.mv.exhaust{background:rgba(181,124,255,.2);color:#cfa4ff}.mr2lead.mv.shuffle{background:rgba(120,160,255,.2);color:#a9c1ff}.mr2lead.mv.retrieve,.mr2lead.mv.create,.mr2lead.mv.tograve,.mr2lead.mv.todraw{background:rgba(255,210,74,.18);color:#ffd86b}.mr2row.mv{padding:3px 8px;border-radius:8px;background:rgba(255,255,255,.035)}
    .mr2fx .mr2row.mv .mr2lead{font-size:10px}
    .mr2stat{display:inline-flex;gap:4px;align-items:center;font-size:10px;font-weight:700;padding:0 7px;border-radius:999px;border:1px solid rgba(98,183,255,.28);background:rgba(98,183,255,.08);color:#9fd0ff}.mr2stat.neg{border-color:rgba(255,158,147,.3);background:rgba(255,158,147,.08);color:#ffb2a8}.mr2stat small{font-weight:500;color:#8fa0b5}
    .mr2ustats{display:flex;flex-wrap:wrap;gap:3px}.mr2unit.enemy .mr2ustats{justify-content:flex-end}.mr2uss{font-size:9px;padding:0 6px;border-radius:5px;background:rgba(98,183,255,.08);color:#9aaabd;border:1px solid rgba(98,183,255,.16)}.mr2uss b{margin-left:4px;color:#e6edf6;font-weight:700}
    .mr2ust.buff,.mr2chip.st.buff{border-color:rgba(79,209,139,.35);background:rgba(79,209,139,.07)}.mr2ust.debuff,.mr2chip.st.debuff{border-color:rgba(255,107,107,.4);background:rgba(255,107,107,.08)}.mr2ust.affix,.mr2chip.st.affix{border-color:rgba(255,210,74,.45);background:rgba(255,210,74,.08)}.mr2ust.debuff span,.mr2chip.st.debuff span{color:#ffb8b0}.mr2ust.buff span,.mr2chip.st.buff span{color:#b9efcf}.mr2ust.affix span{color:#ffe08a}
    .mr2intent{cursor:help}
    @media(max-width:760px){.mr2desc{margin-left:0}}

    .mr2awrow{display:flex;flex-wrap:wrap;gap:8px}.mr2unit.tile{flex:1 1 112px;max-width:150px;flex-direction:column;align-items:center;text-align:center;gap:5px;padding:9px 6px 7px}.mr2unit.tile .mr2uname{justify-content:center}.mr2unit.tile .mr2ustates{justify-content:center}
    .mr2ring{position:relative;display:inline-block;width:62px;height:62px;flex:0 0 62px}.mr2ring svg{position:absolute;inset:0;width:100%;height:100%}.mr2ring .mr2ico.ringav{position:absolute;inset:7px;width:auto;height:auto;border:0;flex:none}.mr2ring.full svg{filter:drop-shadow(0 0 3px rgba(255,207,74,.55))}.mr2ring.over svg{filter:drop-shadow(0 0 4px rgba(255,69,69,.65))}
    .mr2ringnum{position:absolute;right:-4px;bottom:-3px;min-width:22px;padding:0 4px;border-radius:999px;background:rgba(10,16,26,.92);border:1px solid rgba(255,207,74,.55);color:#ffe08a;font:700 10px/16px inherit;font-style:normal;text-align:center;font-variant-numeric:tabular-nums}.mr2ring.over .mr2ringnum{border-color:rgba(255,69,69,.7);color:#ff9a9a}

    .mr2opening>summary b{color:#f1d69f}.mr2osec{display:grid;gap:6px}.mr2relics{display:flex;flex-wrap:wrap;gap:8px}.mr2relic{display:inline-flex;align-items:center;gap:8px;padding:5px 12px 5px 6px;border-radius:10px;background:rgba(103,190,146,.07);border:1px solid rgba(103,190,146,.28);color:#d6f0e2;font-size:12px}.mr2relic b{font-size:12px}.mr2relic.q-forged,.mr2relic.q-gold{border-color:rgba(255,210,74,.4);background:rgba(255,210,74,.07)}
    .mr2ico.rl.big{width:34px;height:34px;flex-basis:34px;border-radius:7px}
    .mr2decks{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}.mr2dgroup{border:1px solid rgba(148,163,184,.14);border-radius:10px;padding:8px;background:rgba(255,255,255,.02);display:grid;gap:6px;align-content:start}.mr2dhead{display:flex;gap:8px;align-items:center;font-size:12px;color:#e6edf6}.mr2dhead .mr2from:last-child{margin-left:auto}
    .mr2dcards{display:grid;gap:4px}.mr2dcard{--ac:#8aa0bd;--acr:138,160,189;display:flex;align-items:center;gap:8px;padding:4px 8px 4px 4px;border-radius:7px;border-left:4px solid var(--ac);background:linear-gradient(90deg,rgba(var(--acr),.14),rgba(var(--acr),.03));cursor:help}
    .mr2dcard.a-ulti{--ac:#ff8a3d;--acr:255,138,61}.mr2dcard.a-awake{--ac:#ffd24a;--acr:255,210,74}.mr2dcard.a-keeper{--ac:#b57cff;--acr:181,124,255}.mr2dcard.a-strike{--ac:#ff6b6b;--acr:255,107,107}.mr2dcard.a-defend{--ac:#4fd18b;--acr:79,209,139}.mr2dcard.a-skill{--ac:#4aa3ff;--acr:74,163,255}.mr2dcard.a-curse{--ac:#8e86a8;--acr:142,134,168}.mr2dcard.a-other{--ac:#4fd0c8;--acr:79,208,200}
    .mr2dcost{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;border-radius:6px;background:rgba(var(--acr),.22);color:var(--ac);font-weight:900;font-size:13px;border:1px solid rgba(var(--acr),.5)}.mr2dname{display:grid;line-height:1.3;min-width:0}.mr2dname b{font-size:12px;color:#eef3fa}.mr2dname small{font-size:9px;color:#8fa0b5}.mr2dn{margin-left:auto;font-style:normal;font-weight:800;color:var(--ac);font-size:12px}

    .mr2unit.tile .mr2ustats{flex-direction:column;align-items:stretch;gap:2px;width:100%;margin-top:1px}.mr2unit.tile .mr2uss{display:flex;justify-content:space-between;gap:6px;padding:0 6px;font-size:10px}

    .mr2snap{margin-top:2px}.mr2snap>summary{cursor:pointer;list-style:none;display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;font-size:10px;color:#7f8ea2;padding:3px 0}.mr2snap>summary::-webkit-details-marker{display:none}.mr2snap>summary::before{content:'▸';color:#6f7f93}.mr2snap[open]>summary::before{content:'▾'}.mr2snap[open]{padding-bottom:4px}.mr2snap .mr2boardwrap{margin-top:4px}
    .mr2snapchip{display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap;padding:1px 8px;border-radius:8px;background:rgba(74,163,255,.07);border:1px solid rgba(74,163,255,.18);color:#c3cedd}.mr2snapchip.enemy{background:rgba(255,92,138,.07);border-color:rgba(255,92,138,.22)}.mr2snapchip b{font-size:11px;color:#e6edf6}

    .mr2stats>summary b{color:#f1d69f}.mr2ssum{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}.mr2ssum span{padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.035);border:1px solid rgba(148,163,184,.1)}.mr2ssum small{display:block;color:#758398;font-size:9px}.mr2ssum strong{display:block;color:#e6edf6;font-size:15px;margin-top:2px}
    .mr2ssec{display:grid;gap:6px}.mr2ssec h5{margin:6px 0 0;font-size:12px;color:#cdd8e6;font-weight:800;letter-spacing:.3px}.mr2hot{font-style:normal;color:#ff9e93;font-size:11px;margin-left:8px}
    .mr2scards{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:10px}.mr2scard{border:1px solid rgba(148,163,184,.14);border-radius:10px;padding:10px;background:rgba(255,255,255,.02);display:grid;gap:7px;align-content:start}.mr2shead{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px;color:#e6edf6}
    .mr2smetrics{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:6px}.mr2smetrics span{display:grid;gap:1px;padding:5px 8px;border-radius:8px;background:rgba(255,255,255,.04)}.mr2smetrics small{font-size:9px;color:#758398}.mr2smetrics b{font-size:15px;color:#f4f7fb;font-variant-numeric:tabular-nums}.mr2smetrics em{font-style:normal;font-size:10px;color:#8fa0b5}
    .mr2sbar{display:block;height:6px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden;min-width:60px}.mr2sbar i{display:block;height:100%;background:linear-gradient(90deg,#4aa3ff,#8fd0ff)}.mr2sbar.dmg i{background:linear-gradient(90deg,#d8485f,#ff9a8a)}.mr2sbar.blk i{background:linear-gradient(90deg,#2fb08a,#7fe0c0)}.mr2sbar.heal i{background:linear-gradient(90deg,#3fbf7f,#9be8b8)}.mr2sbar.key i{background:linear-gradient(90deg,#8a45d6,#d07cff)}.mr2sbar.relic i{background:linear-gradient(90deg,#b8923f,#ffd986)}
    .mr2srcs,.mr2ssec{display:grid;gap:5px}.mr2srow{display:grid;grid-template-columns:minmax(120px,210px) minmax(60px,1fr) auto auto;gap:10px;align-items:center;font-size:11px;color:#c3cedd;padding:3px 6px;border-radius:7px}.mr2srow:hover{background:rgba(255,255,255,.03)}.mr2srow.keeperrow,.mr2srow.relicrow{grid-template-columns:34px minmax(110px,210px) minmax(60px,1fr) auto minmax(0,1.4fr)}.mr2sname{display:grid;line-height:1.3;color:#e6edf6;font-weight:600}.mr2sname small{font-size:9px;color:#7f8ea2;font-weight:400}.mr2srow b{font-variant-numeric:tabular-nums;color:#f4f7fb}.mr2srow small{color:#7f8ea2;font-size:10px}
    .mr2srow.keeperrow>small{grid-column:5}.mr2sout{display:flex;flex-wrap:wrap;gap:6px}.mr2sout em{font-style:normal;font-size:10px;padding:1px 7px;border-radius:999px;border:1px solid rgba(148,163,184,.2);color:#9aa8bb}.mr2sout em.d{color:#ffb2a8;border-color:rgba(255,120,100,.4);background:rgba(255,120,100,.1);font-weight:800}.mr2sout em.b{color:#8fe8cb;border-color:rgba(127,224,192,.3)}.mr2sout em.h{color:#9be8b8;border-color:rgba(100,220,150,.3)}.mr2sout em.n{color:#6f7f93}
    .mr2ico.kk.sm3{width:30px;height:30px;flex-basis:30px;border-radius:6px}.mr2tag.awake{background:rgba(255,210,74,.2);color:#ffd86b}.mr2tag.dim{opacity:.6}
    .mr2sorder h5{margin:4px 0;font-size:10px;color:#7f8ea2}.mr2step{display:inline-flex;align-items:center;gap:7px;padding:4px 10px 4px 5px;border-radius:999px;background:rgba(255,255,255,.04);border:1px solid rgba(148,163,184,.15);font-size:11px;color:#dbe4f0}.mr2step i{display:inline-flex;width:18px;height:18px;border-radius:50%;background:#2a3a52;color:#ffd86b;font-style:normal;font-weight:900;font-size:10px;align-items:center;justify-content:center}.mr2step span{display:grid;line-height:1.25}.mr2step small{font-size:9px;color:#8fa0b5}
    .mr2scard{min-width:0}.mr2smetrics{grid-template-columns:repeat(auto-fill,minmax(78px,1fr))}.mr2srcs .mr2srow{grid-template-columns:minmax(90px,1fr) 64px auto auto;gap:8px}.mr2srow small{white-space:nowrap}.mr2srcs .mr2sname{min-width:0}
    @media(max-width:760px){.mr2srow,.mr2srow.keeperrow,.mr2srow.relicrow{grid-template-columns:1fr;gap:3px}.mr2srow.keeperrow>small{grid-column:1}}

    .mr2relicwrap{display:grid;gap:2px}.mr2sout em.p{color:#ffd86b;border-color:rgba(255,210,74,.4);background:rgba(255,210,74,.08)}.mr2relicinst{margin:0 0 4px 46px}.mr2srow.inst{grid-template-columns:minmax(110px,170px) minmax(110px,1fr) auto auto}
    .mr2buffsum{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:8px 12px;border-radius:10px;background:rgba(255,210,74,.06);border:1px solid rgba(255,210,74,.28);font-size:12px;color:#e6edf6}.mr2buffsum b{color:#ffd86b}.mr2buffsum .d{color:#ffb2a8;font-weight:800}.mr2buffsum small{flex-basis:100%;color:#8fa0b5;font-size:10px;line-height:1.6}

    .mr2crow{display:grid;grid-template-columns:minmax(80px,1.1fr) repeat(5,minmax(80px,1fr));gap:8px;align-items:center;font-size:12px;color:#e6edf6;padding:5px 8px;border-radius:8px;background:rgba(255,255,255,.03)}.mr2crow span{display:grid;line-height:1.3;font-weight:700;font-variant-numeric:tabular-nums}.mr2crow small{font-size:9px;color:#7f8ea2;font-weight:400}.mr2crow.head{background:none;color:#7f8ea2;font-size:10px}.mr2crow .good{color:#8fe0b2}.mr2crow .bad{color:#ff9e93}
    .mr2calib{display:grid;gap:4px;padding:8px 12px;border-radius:10px;background:rgba(98,183,255,.06);border:1px solid rgba(98,183,255,.2);font-size:12px;line-height:1.7;color:#d6e4f4}.mr2calib small{color:#8fa0b5;font-size:10px;line-height:1.6}
    @media(max-width:760px){.mr2crow{grid-template-columns:repeat(3,1fr)}}
    .mr2crow b small.lowc{display:block;color:#ffb26b;font-size:9px;font-weight:400}

    .mr2gsub{font-size:11px;color:#8fa0b5;font-weight:700;margin-top:4px}.mr2gcards{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:10px}.mr2gcard{border:1px solid rgba(148,163,184,.14);border-radius:10px;padding:10px;background:rgba(255,255,255,.02);display:grid;gap:7px;align-content:start;cursor:help}.mr2gcard.wheel{border-color:rgba(255,196,87,.22)}.mr2gcard.cov{border-color:rgba(175,130,220,.28)}
    .mr2ghead{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.mr2gtitle{display:grid;line-height:1.3;min-width:0}.mr2gtitle b{font-size:13px;color:#f4f7fb}.mr2gtitle small{font-size:10px;color:#8fa0b5}.mr2gowners{display:flex;flex-wrap:wrap;gap:4px;margin-left:auto}.mr2tag.wheelTag{background:rgba(255,196,87,.18);color:#ffd27a}.mr2tag.covTag{background:rgba(175,130,220,.2);color:#d8b9f0}
    .mr2ico.gi{width:44px;height:44px;flex:0 0 44px;border-radius:9px}.mr2ico.gi img{object-fit:contain}.mr2ico.gi.cov{border-radius:50%}
    .mr2gmetrics{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:6px}.mr2gmetrics span{display:grid;gap:1px;padding:5px 8px;border-radius:8px;background:rgba(255,255,255,.04)}.mr2gmetrics small{font-size:9px;color:#758398}.mr2gmetrics b{font-size:15px;color:#f4f7fb;font-variant-numeric:tabular-nums}.mr2gmetrics em{font-style:normal;font-size:10px;color:#8fa0b5}.mr2gmetrics .hot b{color:#ffb2a8}
    .mr2gdesc{font-size:11px;line-height:1.7;color:#c3cedd;white-space:pre-line;padding:2px 0}.mr2gdesc b{color:#ffd86b;margin-right:4px}
    .mr2tag.trig{background:rgba(98,183,255,.14);color:#9fd0ff;padding:2px 8px}.mr2tag.trig small{color:#7f8ea2;margin-left:3px}.mr2geff{display:flex;flex-wrap:wrap;gap:5px}.mr2geff span{font-size:10px;padding:1px 8px;border-radius:999px;background:rgba(255,196,87,.1);border:1px solid rgba(255,196,87,.25);color:#ffd27a}
  
    .mr2introtop{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.mr2io{display:flex;gap:6px;margin-left:auto}.mr2io button{padding:6px 12px;border-radius:9px;border:1px solid rgba(213,177,118,.4);background:rgba(213,177,118,.1);color:#f1d69f;font-size:12px;font-weight:700;cursor:pointer}.mr2io button:hover:not(:disabled){background:rgba(213,177,118,.2)}.mr2io button:disabled{opacity:.4;cursor:not-allowed}
    .mr2binfo{border:1px solid rgba(148,163,184,.2);border-radius:14px;padding:12px 14px;background:linear-gradient(135deg,rgba(255,255,255,.04),rgba(255,255,255,.015));display:grid;gap:10px}.mr2binfo.win{border-color:rgba(255,210,74,.4);background:linear-gradient(135deg,rgba(255,210,74,.1),rgba(213,177,118,.03))}.mr2binfo.lose{border-color:rgba(255,107,107,.4);background:linear-gradient(135deg,rgba(255,107,107,.1),rgba(255,255,255,.02))}
    .mr2bhead{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.mr2verdict{font-size:20px;font-weight:900;letter-spacing:2px;color:#ffd24a;text-shadow:0 0 14px rgba(255,210,74,.35)}.mr2binfo.lose .mr2verdict{color:#ff8a80;text-shadow:0 0 14px rgba(255,107,107,.3)}.mr2binfo:not(.win):not(.lose) .mr2verdict{color:#aab6c7;text-shadow:none}.mr2btitle{display:grid;gap:2px;min-width:0}.mr2btitle b{font-size:15px;color:#f4f7fb}.mr2btitle small{font-size:11px;color:#9fb0c6}.mr2bnote{margin-left:auto;font-size:10px;color:#8ea0b6;max-width:340px;text-align:right}
    .mr2bteam{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;margin:8px 0}.mr2bm{display:flex;gap:8px;align-items:flex-start;padding:7px 9px;border-radius:9px;background:rgba(255,255,255,.04);border:1px solid rgba(148,163,184,.14)}.mr2bm>div{display:grid;gap:2px;min-width:0}.mr2bm b{font-size:12px;color:#e8edf5}.mr2bm small{font-size:10px;color:#8ea0b6;line-height:1.45}.mr2bm small.g{color:#a9b9cf}.mr2bm small small{color:#e9c97a}
    .mr2uid{font-size:12px;font-weight:600;color:#9db1c8;letter-spacing:0}
    .mr2bmeta{display:flex;flex-wrap:wrap;gap:6px}.mr2bmeta span{display:grid;padding:5px 10px;border-radius:8px;background:rgba(255,255,255,.04);min-width:64px}.mr2bmeta small{font-size:9px;color:#7f8ea2}.mr2bmeta b{font-size:13px;color:#e6edf6}.mr2bmeta .id{flex:1 1 260px}.mr2bmeta .id b{font-size:10px;font-weight:600;color:#8ea0b6;word-break:break-all}
    .mr2mvps{border:1px solid rgba(213,177,118,.25);border-radius:14px;padding:12px 14px;background:linear-gradient(160deg,rgba(213,177,118,.07),rgba(98,183,255,.03));display:grid;gap:10px}.mr2mvptitle{font-size:14px;font-weight:900;color:#f1d69f;letter-spacing:1px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.mr2mvptitle small{font-size:10px;font-weight:400;color:#8ea0b6;letter-spacing:0}
    .mr2mvpgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}.mr2mvp{--ac:#d5b176;border:1px solid rgba(255,255,255,.1);border-top:3px solid var(--ac);border-radius:11px;padding:10px 12px;background:rgba(0,0,0,.18);display:grid;gap:8px;align-content:start}.mr2mvp.aw{--ac:#ffd24a}.mr2mvp.wh{--ac:#62b7ff}.mr2mvp.rel{--ac:#67be92}.mr2mvp.cov{--ac:#b57cff}.mr2mvp.kp{--ac:#ff8aa8}
    .mr2mvptag{font-size:10px;font-weight:900;letter-spacing:1px;color:var(--ac);text-transform:uppercase}.mr2mvpmain{display:flex;align-items:center;gap:10px;min-width:0}.mr2mvpmain>div{display:grid;gap:1px;min-width:0}.mr2mvpmain b{font-size:15px;color:#f4f7fb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mr2mvpmain span{font-size:12px;color:#dbe4f0;font-variant-numeric:tabular-nums}.mr2mvpmain span em{font-style:normal;color:var(--ac);font-weight:800}.mr2mvpmain small{font-size:10px;color:#8ea0b6}
    .mr2mvpsub{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:10px;color:#9fb0c6}.mr2mvpsub span{display:inline-flex;align-items:center;gap:4px}.mr2mvpsub .mr2ico{width:22px;height:22px;flex:0 0 22px;font-size:10px;border-radius:6px}.mr2mvpsub .mr2ico.av{border-radius:50%}.mr2ico.mvp{width:54px;height:54px;flex:0 0 54px;font-size:20px;border:2px solid var(--ac,#d5b176)}.mr2ico.rl.mvp,.mr2ico.gi.mvp{border-radius:12px}
    .mr2detail{border:1px solid rgba(148,163,184,.16);border-radius:12px;background:rgba(255,255,255,.015)}.mr2detail>summary{cursor:pointer;padding:10px 14px;display:flex;align-items:baseline;gap:10px;list-style:none}.mr2detail>summary::-webkit-details-marker{display:none}.mr2detail>summary b{color:#f1d69f;font-size:14px}.mr2detail>summary small{color:#8ea0b6;font-size:10px}.mr2detail>summary::before{content:'▸';color:#d5b176}.mr2detail[open]>summary::before{content:'▾'}.mr2detail>*:not(summary){margin:0 12px 12px}.mr2detail{display:block}.mr2detail[open]{display:grid;gap:10px}
    /* compact opening / statistics */
    .mr2opening .mr2rbody,.mr2stats .mr2rbody{gap:8px;padding:8px 10px}.mr2opening .mr2relics{gap:4px}.mr2opening .mr2relic{padding:2px 8px 2px 3px;font-size:11px;gap:5px;border-radius:8px}.mr2opening .mr2relic .mr2ico{width:22px;height:22px;flex-basis:22px}.mr2opening .mr2relic b{font-size:11px;font-weight:600}
    .mr2opening .mr2decks{grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:6px}.mr2opening .mr2dgroup{padding:6px;gap:4px}.mr2opening .mr2dcards{gap:2px;grid-template-columns:repeat(2,minmax(0,1fr))}.mr2oother>summary{font-size:10px;color:#8ea0b6;cursor:pointer;margin-top:4px}.mr2oother .mr2ostate{margin-top:3px}.mr2opening .mr2dcard{padding:2px 6px 2px 3px;gap:6px}.mr2opening .mr2dname b{font-size:11px}.mr2opening .mr2dname small{font-size:8px}.mr2opening .mr2dcost{min-width:20px;height:20px;font-size:11px}.mr2opening .mr2boardtitle{font-size:11px}
    .mr2stats .mr2ssec{gap:6px;margin:0}.mr2stats .mr2ssec h5{margin:0 0 4px;font-size:12px;color:#d9c391;padding-bottom:3px;border-bottom:1px solid rgba(213,177,118,.15)}.mr2stats .mr2ssum{grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:5px}.mr2stats .mr2ssum span{padding:5px 8px;border-radius:8px}.mr2stats .mr2ssum strong,.mr2stats .mr2ssum b{font-size:14px}.mr2stats .mr2scards{grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:6px}.mr2stats .mr2scard{padding:8px;gap:5px}.mr2stats .mr2srow{padding:2px 0}
    .mr2fold{border:1px solid rgba(148,163,184,.14);border-radius:10px;background:rgba(255,255,255,.015)}.mr2fold>summary{cursor:pointer;padding:6px 10px;font-size:12px;font-weight:700;color:#d9c391;list-style:none}.mr2fold>summary::-webkit-details-marker{display:none}.mr2fold>summary::before{content:'▸ ';color:#d5b176}.mr2fold[open]>summary::before{content:'▾ '}.mr2fold>*:not(summary){margin:0 10px 10px}

    .mr2tabs{display:flex;flex-wrap:wrap;gap:4px;border-bottom:1px solid rgba(148,163,184,.16);padding-bottom:6px}.mr2tabbtn{padding:5px 12px;border-radius:8px;border:1px solid transparent;background:transparent;color:#9fb0c6;font-size:12px;font-weight:700;cursor:pointer}.mr2tabbtn:hover{background:rgba(255,255,255,.05)}.mr2tabbtn.on{background:rgba(213,177,118,.14);border-color:rgba(213,177,118,.4);color:#f1d69f}.mr2tabpane{display:grid;gap:10px;padding-top:6px}.mr2tabpane[hidden]{display:none}
    .mr2kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px}.mr2kpi{padding:7px 10px;border-radius:9px;background:rgba(255,255,255,.04);border:1px solid rgba(148,163,184,.1);display:grid;gap:1px}.mr2kpi small{font-size:9px;color:#7f8ea2}.mr2kpi b{font-size:16px;color:#f1f5fb;font-variant-numeric:tabular-nums}.mr2kpi em{font-style:normal;font-size:10px;color:#8ea0b6}
    .mr2cols2{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px}.mr2panel{border:1px solid rgba(148,163,184,.12);border-radius:10px;padding:9px 11px;background:rgba(255,255,255,.02);display:grid;gap:8px;align-content:start}.mr2panel h5{margin:0;font-size:12px;color:#d9c391}
    .mr2stack{display:flex;height:14px;border-radius:7px;overflow:hidden;background:rgba(255,255,255,.05)}.mr2stack i{display:block;min-width:2px}.mr2legend2{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:11px;color:#c9d4e3}.mr2legend2 span{display:inline-flex;align-items:center;gap:5px}.mr2legend2>span>i{width:9px;height:9px;border-radius:3px;display:inline-block}.mr2legend2 em{font-style:normal;color:#8ea0b6}.mr2legend2 b{font-variant-numeric:tabular-nums}
    .mr2rchart{display:flex;align-items:flex-end;gap:4px;height:90px;padding:4px 2px 0}.mr2rcol{flex:1;min-width:10px;max-width:38px;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:2px}.mr2rcol i{display:block;width:100%;border-radius:4px 4px 0 0;background:linear-gradient(180deg,#ffb36b,#ff8a3d)}.mr2rcol small{font-size:9px;color:#7f8ea2}
    .mr2thead,.mr2trow{display:grid;grid-template-columns:minmax(150px,1.6fr) 54px 58px 54px minmax(160px,2.2fr) 70px 70px;gap:8px;align-items:center}.mr2thead{font-size:10px;color:#7f8ea2;padding:0 10px}.mr2trowd{border:1px solid rgba(148,163,184,.1);border-radius:9px;background:rgba(255,255,255,.02)}.mr2trowd[open]{background:rgba(255,255,255,.04)}.mr2trow{padding:6px 10px;cursor:pointer;list-style:none;font-size:12px;color:#e6edf6}.mr2trow::-webkit-details-marker{display:none}.mr2tn{display:flex;align-items:center;gap:7px;min-width:0;flex-wrap:wrap}.mr2tn b{font-size:12px}.mr2tc{text-align:right;font-variant-numeric:tabular-nums;color:#c9d4e3}
    .mr2tbar{position:relative;display:flex;align-items:center;gap:6px;height:22px;border-radius:6px;background:rgba(255,255,255,.05);overflow:hidden;padding:0 8px}.mr2tbar i{position:absolute;left:0;top:0;bottom:0;opacity:.55}.mr2tbar b,.mr2tbar em{position:relative;font-size:11px;font-style:normal;font-variant-numeric:tabular-nums}.mr2tbar em{margin-left:auto;color:#dbe4f0}.mr2tdetail{padding:4px 10px 10px;display:grid;gap:6px}
    .mr2tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px}.mr2tile{display:flex;gap:8px;align-items:flex-start;padding:7px 9px;border-radius:9px;background:rgba(103,190,146,.06);border:1px solid rgba(103,190,146,.22)}.mr2tile.idle{opacity:.5;border-color:rgba(148,163,184,.14);background:rgba(255,255,255,.02)}.mr2tile>div{display:grid;gap:1px;min-width:0}.mr2tile b{font-size:12px;color:#e8f6ee}.mr2tile small{font-size:10px;color:#8ea0b6}.mr2tile em{font-style:normal;font-size:11px;color:#ffb36b;font-weight:700}.mr2tile small.p{color:#9fd0ff}.mr2tile small.b{color:#8fbfff}.mr2tile small.h{color:#8fe0b2}
    @media(max-width:700px){.mr2thead{display:none}.mr2trow{grid-template-columns:1fr 1fr 1fr;row-gap:6px}.mr2trow .mr2tn{grid-column:1/-1}.mr2trow .mr2tbar{grid-column:1/-1}}

    .mr2grade{display:inline-block;min-width:18px;text-align:center;padding:0 5px;border-radius:5px;font-size:10px;font-weight:900;font-style:normal;color:#10151d;vertical-align:middle}.mr2grade.gS{background:#ffd24a}.mr2grade.gA{background:#7ee0a8}.mr2grade.gB{background:#8cc8ff}.mr2grade.gC{background:#c3a6ff}.mr2grade.gD{background:#9aa7b8}
    .mr2mvpmain span em{font-size:18px}.mr2mvpkv{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:10px;color:#9fb0c6}.mr2mvpkv b{color:#e6edf6;font-variant-numeric:tabular-nums}
    .mr2rating{border-top:1px dashed rgba(213,177,118,.25);padding-top:8px;display:grid;gap:5px}.mr2rating h5{margin:0;font-size:12px;color:#d9c391}.mr2rrow{display:grid;grid-template-columns:minmax(150px,1.2fr) minmax(110px,.9fr) minmax(420px,3.4fr);gap:8px;align-items:center;padding:4px 6px;border-radius:8px}.mr2rrow.top{background:rgba(255,210,74,.07)}.mr2rn{display:flex;align-items:center;gap:7px;font-size:12px;color:#e6edf6}.mr2rscore{position:relative;display:flex;align-items:center;height:20px;border-radius:6px;background:rgba(255,255,255,.05);overflow:hidden;padding:0 8px}.mr2rscore i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,rgba(255,138,61,.65),rgba(255,210,74,.65))}.mr2rscore b{position:relative;font-size:12px;color:#fff;font-variant-numeric:tabular-nums}
    .mr2facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:4px 12px;font-size:10.5px;color:#aab6c6}.mr2facts span{display:flex;justify-content:space-between;gap:8px;padding:2px 0;border-bottom:1px dashed rgba(148,163,184,.12)}.mr2facts b{color:#e6edf6}
    .mr2radar{display:flex;flex-direction:column;align-items:center;padding:6px 0 10px;border-bottom:1px dashed rgba(148,163,184,.14);margin-bottom:6px}.mr2radarnote{margin-top:4px;font-size:10px;color:#8ea0b6}.mr2radarnote b{color:#f1d69f;font-size:13px}
    .mr2rdims.kp6{grid-template-columns:repeat(6,1fr)}.mr2conf{margin-left:6px;font-size:9px;color:#8ea0b6;font-weight:400}
    .mr2rdims{display:grid;grid-template-columns:repeat(11,1fr);gap:3px}.mr2rdets{display:grid;gap:4px}.mr2rdet{display:grid;grid-template-columns:140px 1fr;gap:8px;font-size:11px;color:#b6c2d2}.mr2rdet b{display:flex;align-items:center;gap:5px;color:#e6edf6}.mr2rdims span{display:grid;text-align:center;padding:2px 0;border-radius:6px;background:rgba(255,255,255,.04)}.mr2rdims span.na{opacity:.4}.mr2rdims small{font-size:9px;color:#7f8ea2}.mr2rdims b{font-size:12px;color:#e6edf6;font-variant-numeric:tabular-nums}
    .mr2rmodel{font-size:11px;color:#b6c2d2;line-height:1.6;display:grid;gap:4px}.mr2rmodel p{margin:0}.mr2rmodel ul{margin:0;padding-left:18px}
    @media(max-width:700px){.mr2rrow{grid-template-columns:1fr}.mr2rdims{grid-template-columns:repeat(5,1fr)}.mr2rdet{grid-template-columns:1fr}}

    .mr2rrowd{border-radius:8px}.mr2rrowd.top>summary{background:rgba(255,210,74,.07)}.mr2rrowd>summary{list-style:none;cursor:pointer}.mr2rrowd>summary::-webkit-details-marker{display:none}.mr2rrowd[open]{background:rgba(255,255,255,.025)}.mr2rrow{grid-template-columns:minmax(150px,1.3fr) minmax(130px,1.1fr) minmax(180px,1.4fr)}.mr2rdims{grid-template-columns:repeat(3,1fr)!important}
    .mr2rdetail{padding:6px 8px 10px;display:grid;gap:8px}.mr2mgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px}.mr2mcol{border:1px solid rgba(148,163,184,.12);border-radius:9px;padding:7px 9px;display:grid;gap:3px;align-content:start;background:rgba(0,0,0,.12)}.mr2mcol h6{margin:0 0 3px;font-size:12px;color:#d9c391;display:flex;justify-content:space-between}.mr2mcol h6 em{font-style:normal;color:#ffd24a;font-weight:900}
    .mr2mrow{display:grid;grid-template-columns:minmax(80px,1fr) auto 54px 26px;gap:6px;align-items:center;font-size:11px;color:#c9d4e3}.mr2mrow small{display:block;color:#7f8ea2;font-size:9px}.mr2mrow b{color:#e6edf6;font-variant-numeric:tabular-nums}.mr2msc{display:block;height:5px;border-radius:3px;background:rgba(255,255,255,.07);overflow:hidden}.mr2msc u{display:block;height:100%;background:linear-gradient(90deg,#ff8a3d,#ffd24a)}.mr2mrow em{font-style:normal;font-size:10px;color:#8ea0b6;text-align:right}.mr2effline{font-size:10px;color:#8ea0b6}
    #morimensReplayTab{position:relative;overflow:visible}.mr2tabdemo{position:absolute;top:-7px;right:-6px;padding:0 5px;border-radius:7px;background:linear-gradient(135deg,#ff8a3d,#ff5c8a);color:#fff;font-size:9px;font-weight:900;line-height:14px;letter-spacing:.3px;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,.4)}
    @media(max-width:700px){.mr2bnote{margin-left:0;text-align:left}.mr2io{width:100%}.mr2io button{flex:1}}
`;document.head.appendChild(s)}

  // ---- rendering -------------------------------------------------------------------
  const rawDetails=e=>`<details class="mr2raw"><summary>${ui('原始事件','Raw event')} · eventId ${esc(e.eventId)}${e.skillTid!=null?` · tid ${esc(e.skillTid)}`:''}${e.cardUid!=null?` · cardUid ${esc(e.cardUid)}`:''}</summary><pre>${esc(JSON.stringify(e.data,null,2))}</pre></details>`;
  const timeText=e=>e.time!=null?`<span class="mr2time">${Number(e.time).toFixed(2)}s · #${e.seq}</span>`:`<span class="mr2time">#${e.seq}</span>`;
  const fxRow=e=>`<div class="mr2row">${e.html}</div>`;

  // Action classes drive colour + size: big coloured cards for what the player *did*, small quiet chips for side effects.
  const RES_LABEL={};
  // one actor chip followed by all of that actor's resource changes
  function propGroups(list,tl){
    const by=new Map();for(const e of list){const o=by.get(String(e.actorUid))||{uid:e.actorUid,items:[]};o.items.push(e);by.set(String(e.actorUid),o)}
    return [...by.values()].map(o=>`<span class="mr2row">${tl.chip(o.uid)}${o.items.map(e=>e.resHtml).join('')}</span>`).join('');
  }
  function actionInfo(e){
    if(e.kind==='keeper')return {cls:'keeper',label:ui('钥令','Keyflare')};
    if(e.kind==='trigger'||e.kind==='enemyact')return {cls:'enemy',label:ui('敌方行动','Enemy')};
    const t=e.stypes||[];
    if(e.kind==='ultimate'||t.includes('Ulti_Skill'))return {cls:'ulti',label:ui('狂气爆发','Aliemus Burst')};
    if(t.includes('Card_Awake'))return {cls:'awake',label:ui('灵知觉醒','Awakening')};
    if(t.includes('Card_Curse'))return {cls:'curse',label:ui('诅咒/污染','Curse')};
    if(t.includes('Card_Strike'))return {cls:'strike',label:ui('打击','Strike')};
    if(t.includes('Card_Defend'))return {cls:'defend',label:ui('防御','Defend')};
    if(t.includes('Card_Skill')||t.includes('Card_Extend'))return {cls:'skill',label:ui('技能牌','Skill')};
    return {cls:'other',label:ui('出牌','Card')};
  }
  function actionActor(e,tl){
    const a=tl.actors.get(String(e.actorUid)),card=tl.ent.cards.get(String(e.cardUid));
    return a||tl.actors.get(String(card?.ownerUid));
  }
  function renderActionHead(e,tl){
    const info=actionInfo(e),owner=actionActor(e,tl);
    const portrait=e.kind==='keeper'?ico(e.iconSrc,'钥','kk lg'):owner?ico(owner.icon,owner.kind==='monster'?'怪':owner.name,'av lg'):'';
    const who=e.kind==='keeper'?'':owner?`<span class="mr2who">${esc(owner.name)}</span>`:'';
    const cost=(e.fiaLvl?`<span class="mr2cost" style="margin-left:auto;color:#ffb36b;border-color:rgba(255,150,70,.55);background:rgba(255,120,40,.16)" title="${esc(ui('卡牌当前活焰层数：每层 +30% 伤害/护盾/狂气/力量（受灵塑活焰数值加成提升）','Card Fiamma stacks: +30% damage/shield/Aliemus/STR per stack (raised by Fiamma bonus)'))}">🔥${ui('活焰','Fiamma')}${e.fiaLvl} +${fmt(e.fiaPct)}%</span>`:'')+(e.cost!=null?`<span class="mr2cost"${e.fiaLvl?' style="margin-left:6px"':''} title="${esc(ui('算力消耗','Energy cost'))}">⚡${esc(e.cost)}</span>`:'');
    const tgt=e.kind==='enemyact'&&e.targetUid!=null?`<div class="mr2actline"><span class="mr2from">${ui('目标','Target')}</span>${tl.chip(e.targetUid)}</div>`:'';
    const t=e.tip,tipA=t?tipAttr(t.title,t.sub,t.body):'';
    return `<div class="mr2acthead"${tipA} data-toggle="1">${portrait}<div class="mr2acttitle"><div class="mr2actline"><span class="mr2atype">${esc(info.label)}</span>${who}</div><b class="mr2actname">${esc(e.skillName)}</b>${tgt}</div>${cost}${timeText(e)}</div>${t&&t.body?`<div class="mr2desc"><small>${esc(t.sub||'')}</small>${esc(t.body)}</div>`:''}`;
  }
  // overview strip shown on the round header: one coloured mark per action, in order
  function renderStrip(r,tl){
    const marks=r.events.filter(e=>e.camp===1&&e.phase===2&&['card','ultimate','keeper','skill'].includes(e.kind)).map(e=>{
      const info=actionInfo(e),o=actionActor(e,tl);
      return `<span class="mr2mark a-${info.cls}" title="${esc(info.label+' · '+e.skillName)}">${e.kind==='keeper'?ico(e.iconSrc,'钥','kk xs'):ico(o?.icon,o?.name||'?','av xs')}</span>`;
    }).join('');
    return marks?`<span class="mr2strip">${marks}</span>`:'';
  }
  const MOVE_ORDER=['draw','discard','exhaust','shuffle','retrieve','create','tograve','todraw'];
  // merge same-kind card moves so a turn's draw / discard reads as one line
  function moveRows(list){
    const by=new Map();for(const e of list){const o=by.get(e.mv)||{mv:e.mv,uids:[],html:[],n:0};o.n+=e.count||1;o.html.push(e.html);by.set(e.mv,o)}
    return MOVE_ORDER.filter(k=>by.has(k)).map(k=>{const o=by.get(k);return `<div class="mr2row mv">${o.html.join('')}${o.n>1?`<span class="mr2tag">${ui(`共 ${o.n} 张`,`${o.n} cards`)}</span>`:''}</div>`}).join('');
  }
  function renderEffects(fx,tl){
    const rows=[],moves=[],stats=[],chips=[],hidden=[],props=[];
    for(const e of fx){
      if(['damage','heal'].includes(e.kind))rows.push(e);
      else if(e.kind==='move')moves.push(e);
      else if(e.kind==='stat')stats.push(e);
      else if(e.kind==='state'&&e.hidden)hidden.push(e);
      else if(e.kind==='property')props.push(e);
      else chips.push(e);
    }
    const merged=[];for(const e of rows){const last=merged[merged.length-1];if(last&&last.e.html===e.html)last.n++;else merged.push({e,n:1})}
    const hit=merged.map(({e,n})=>`<div class="mr2row hit">${e.html}${n>1?`<span class="mr2tag">×${n}</span>`:''}</div>`).join('');
    const flow=list=>list.length?`<div class="mr2flow">${list.map(e=>e.html).join('')}</div>`:'';
    const small=[...chips.filter(e=>['trigger','select','swallow','relic'].includes(e.kind)).map(e=>`<div class="mr2row">${e.html}</div>`)].join('');
    const stateChips=chips.filter(e=>!['trigger','select','swallow','relic'].includes(e.kind));
    const minor=props.length+stateChips.length+hidden.length+stats.length;
    const label=[props.length?ui(`资源变化 ${props.length}`,`Resources ${props.length}`):'',stats.length?ui(`属性变化 ${stats.length}`,`Stats ${stats.length}`):'',stateChips.length?ui(`状态变化 ${stateChips.length}`,`States ${stateChips.length}`):'',hidden.length?ui(`内部状态 ${hidden.length}`,`Hidden ${hidden.length}`):''].filter(Boolean).join(' · ');
    return `${hit}${moveRows(moves)}${small}${minor?`<details class="mr2minor"><summary>${label}</summary>${props.length?`<div class="mr2flow">${propGroups(props,tl)}</div>`:''}${flow(stats)}${flow(stateChips)}${flow(hidden)}</details>`:''}`;
  }
  function renderSettle(events,title,tl){
    if(!events.length)return '';
    const agg=new Map(),states=[],others=[],moves=[],stats=[];
    for(const e of events){
      if(e.kind==='property'){const k=`${e.actorUid}|${e.property}`;const o=agg.get(k)||{e,sum:0};o.sum+=e.changedValue;agg.set(k,o)}
      else if(e.kind==='state')states.push(e);
      else if(e.kind==='move')moves.push(e);
      else if(e.kind==='stat')stats.push(e);
      else others.push(e);
    }
    const resBy=new Map();for(const {e,sum} of agg.values()){if(!sum)continue;const o=resBy.get(String(e.actorUid))||{uid:e.actorUid,items:[]};o.items.push(`<span class="mr2res ${esc(e.property)} ${sum<0?'neg':'pos'}"><i></i>${esc(RES_LABEL[e.property]||e.property)} ${sum>0?'+':''}${fmt(sum)}</span>`);resBy.set(String(e.actorUid),o)}
    const resHtml=resBy.size?`<span class="mr2flow">${[...resBy.values()].map(o=>`<span class="mr2row">${tl.chip(o.uid)}${o.items.join('')}</span>`).join('')}</span>`:'';
    const hiddenN=states.filter(e=>e.hidden).length,shown=states.filter(e=>!e.hidden);
    const detail=`${stats.length?`<div class="mr2flow">${stats.map(e=>e.html).join('')}</div>`:''}${shown.length?`<div class="mr2flow">${shown.map(e=>e.html).join('')}</div>`:''}${hiddenN?`<div class="mr2flow">${states.filter(e=>e.hidden).map(e=>e.html).join('')}</div>`:''}${others.map(e=>`<div class="mr2row">${e.html}</div>`).join('')}`;
    const count=states.length+others.length+stats.length;
    return `<div class="mr2settle"><div class="mr2settlehead"><span class="mr2sttl">${esc(title)}</span>${resHtml}</div>${moves.length?moveRows(moves):''}${count?`<details class="mr2minor"><summary>${ui(`状态/属性变化 ${count}${hiddenN?`（含内部 ${hiddenN}）`:''}`,`State & stat changes ${count}`)}</summary>${detail}</details>`:''}</div>`;
  }
  // the full board of each action is only built when its <details> is opened (long battles have hundreds of them)
  let lastFull=null,snapStore=[];
  // battlefield right after one action: collapsed summary line (keeper / enemy hp + enemy debuffs), full board on expand
  function renderActionSnap(before,after,tl){
    if(!after)return '';
    const prevBy=new Map((before?.units||[]).map(u=>[String(u.uid),u]));
    const chips=after.units.filter(u=>{const a=tl.actors.get(String(u.uid));return a&&(a.kind==='keeper'||a.kind==='monster')&&u.hp!=null&&u.max>0}).map(u=>{
      const a=tl.actors.get(String(u.uid)),pr=prevBy.get(String(u.uid)),p=Math.max(0,Math.min(100,u.hp/u.max*100)),delta=pr&&pr.hp!=null?u.hp-pr.hp:0;
      const debuffs=a.kind==='monster'?(u.states||[]).filter(x=>tl.res.state[String(x.stateId)]?.ShowType!=='Hide').sort((x,y)=>(stateClass(tl.res,x.stateId)==='debuff'?0:1)-(stateClass(tl.res,y.stateId)==='debuff'?0:1)).slice(0,8):[];
      return `<span class="mr2snapchip${a.kind==='monster'?' enemy':''}"><b>${esc(a.name)}</b>${hpMiniBar(p,a.kind==='monster')}<span class="mr2from">${p.toFixed(p<10?2:p<100?1:0)}%</span>${delta?`<span class="mr2delta ${delta<0?'neg':'pos'}">${delta<0?'▼':'▲'}${kfmt(Math.abs(delta))}</span>`:''}${debuffs.map(x=>`<span class="mr2ust ${stateClass(tl.res,x.stateId)}"${x.tip||''}>${ico(stateIconSrc(tl.res,x.stateId),tl.res.nameState(x.stateId),'st sm2')}<span>${esc(tl.res.nameState(x.stateId))}${x.layer>1?`<em>×${x.layer>=10000?kfmt(x.layer):x.layer}</em>`:''}</span></span>`).join('')}</span>`;
    }).join('');
    const idx=snapStore.push({before,after,tl})-1;
    return `<details class="mr2snap" data-snap="${idx}"><summary>${ui('行动后战场','After this action')}${chips}</summary><div class="mr2snapbody"></div></details>`;
  }
  const hpMiniBar=(p,enemy)=>`<span class="mr2hpmini${enemy?' enemy':''}"><i style="width:${p.toFixed(1)}%"></i></span>`;
  function renderRound(r,tl,open){
    const sides=[];let cur=null;
    for(const e of r.events){
      if(e.kind==='round')continue;
      const key=`${e.camp}|${e.phase}`;
      if(!cur||cur.key!==key){cur={key,camp:e.camp,phase:e.phase,events:[],endSnap:null};sides.push(cur)}
      if(e.kind==='snap'){cur.endSnap=e.snap;continue}
      cur.events.push(e);
    }
    const dmg=r.events.filter(e=>e.kind==='damage'&&tl.campOf(e.actorUid)===1).reduce((n,e)=>n+e.amount,0);
    const taken=r.events.filter(e=>e.kind==='damage'&&tl.campOf(e.actorUid)===2).reduce((n,e)=>n+e.amount,0);
    const acts=r.events.filter(e=>e.camp===1&&['card','ultimate','keeper','skill'].includes(e.kind)).length;
    const phaseName=p=>p===1?ui('回合开始结算','Start-of-turn'):p===3?ui('回合结束结算','End-of-turn'):ui('行动阶段','Action phase');
    const body=sides.map(s=>{
      const side=s.camp===2?ui('敌方','Enemy'):ui('我方','Ally'),title=`${side} · ${phaseName(s.phase)}`;
      if(s.phase!==2)return `<div class="mr2side quiet c${s.camp}">${renderSettle(s.events,title,tl)||`<div class="mr2settle"><span class="mr2sttl">${esc(title)}</span></div>`}</div>`;
      const blocks=[],pre=[];let blk=null;
      for(const e of s.events){
        const starts=['card','ultimate','keeper','skill'].includes(e.kind)||e.kind==='enemyact'||(s.camp===2&&e.kind==='trigger'&&tl.campOf(e.actorUid)===2);
        if(starts){blk={head:e,fx:[]};blocks.push(blk)}
        else if(blk)blk.fx.push(e);else pre.push(e);
      }
      const preHtml=pre.length?renderSettle(pre,ui('行动前的状态/资源变化','Before first action'),tl):'';
      return `<div class="mr2side c${s.camp}"><div class="mr2sidehead">${esc(title)} · ${blocks.length} ${ui('次行动','actions')}</div>${preHtml}${blocks.map((b,bi)=>{const after=blocks[bi+1]?.head.snapBefore||s.endSnap||r.snapEnd;return `<div class="mr2act a-${actionInfo(b.head).cls}">${renderActionHead(b.head,tl)}<div class="mr2fx">${renderEffects(b.fx,tl)}</div>${renderActionSnap(b.head.snapBefore,after,tl)}${rawDetails(b.head)}</div>`}).join('')}</div>`;
    }).join('');
    const bStart=r.round===(tl.rounds[0]?.round)?renderBoard(r.snapStart,null,tl,ui('战斗开始 · 战场状态','Battle start · battlefield')):'',bEnd=renderBoard(r.snapEnd,r.snapStart,tl,ui('回合结束 · 战场状态（▲▼ 为本回合血量变化）','Round end · battlefield (▲▼ = HP change this round)'));
    return `<details class="mr2round"${open?' open':''}><summary><b>${r.dim?ui(`超维回合（第 ${Math.floor(r.round)} 回合之后）`,`Ultra-Space bout (after round ${Math.floor(r.round)})`):ui(`第 ${r.round} 回合`,`Round ${r.round}`)}</b><small>${acts} ${ui('次我方行动','ally actions')} · ${ui('我方输出','Dealt')} ${fmt(dmg)} · ${ui('受到','Taken')} ${fmt(taken)}</small>${renderStrip(r,tl)}</summary><div class="mr2rbody">${bStart}${body}${bEnd}</div></details>`;
  }

  // ---- battlefield board: allies left-aligned, enemies right-aligned -----------------
  const kfmt=n=>{n=Number(n)||0;return Math.abs(n)>=1e6?`${(n/1e6).toFixed(n>=1e7?1:2).replace(/\.0+$/,'')}M`:Math.abs(n)>=1e4?`${(n/1e3).toFixed(1).replace(/\.0$/,'')}K`:fmt(n)};
  function unitStates(u,tl){
    const vis=(u.states||[]).filter(x=>tl.res.state[String(x.stateId)]?.ShowType!=='Hide');
    if(!vis.length)return '';
    const rank={affix:0,debuff:1,buff:2};
    vis.sort((a,b)=>rank[stateClass(tl.res,a.stateId)]-rank[stateClass(tl.res,b.stateId)]||b.layer-a.layer);
    const shown=vis.slice(0,16);
    return `<div class="mr2ustates">${shown.map(x=>`<span class="mr2ust ${stateClass(tl.res,x.stateId)}"${x.tip||stateTipAttr(tl.res,x.stateId,{layer:x.layer})}>${ico(stateIconSrc(tl.res,x.stateId),tl.res.nameState(x.stateId),'st sm2')}<span>${esc(tl.res.nameState(x.stateId))}${x.layer>1?`<em>×${x.layer}</em>`:''}</span></span>`).join('')}${vis.length>shown.length?`<span class="mr2ust more">+${vis.length-shown.length}</span>`:''}</div>`;
  }
  const unitStats=(u,tl)=>(u.stats||[]).length?`<div class="mr2ustats">${u.stats.map(x=>`<span class="mr2uss" title="${esc(x.k)}">${esc(x.label)}<b>${esc(`${fmt(Math.round(x.v*10)/10)}${x.pct?'%':''}`)}</b></span>`).join('')}</div>`:'';
  // Aliemus ring around the portrait: gold up to 100%, the overlapping 100-200% lap in red (as in game)
  function renderAwakener(u,a,tl,opts){
    const max=u.ultiMax>0?u.ultiMax:100,val=Number(u.ulti)||0,ratio=Math.max(0,Math.min(2,val/max)),R=19,C=2*Math.PI*R;
    const gold=Math.min(ratio,1)*C,red=Math.max(0,ratio-1)*C;
    const arc=(len,color,w)=>len>0?`<circle cx="22" cy="22" r="${R}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="butt" stroke-dasharray="${len.toFixed(2)} ${(C+5).toFixed(2)}" transform="rotate(-90 22 22)"/>`:'';
    const ring=`<span class="mr2ring${ratio>=1?' full':''}${ratio>1?' over':''}" title="${esc(`${ui('狂气','Aliemus')} ${fmt(val)} / ${fmt(max)} (${Math.round(val/max*100)}%)`)}"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="${R}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="3.2"/>${arc(gold,'#ffcf4a',3.6)}${arc(red,'#ff4545',3.6)}</svg>${ico(a.icon,a.name,'av ringav')}<em class="mr2ringnum">${fmt(val)}</em></span>`;
    const shield=u.block>0?`<span class="mr2shield" title="${esc(ui('护盾','Shield'))}">🛡 ${fmt(u.block)}</span>`:'';
    return `<div class="mr2unit tile" title="${esc(`UID ${u.uid} · tid ${a.tid??'?'}`)}">${ring}<div class="mr2uname"><b>${esc(a.name)}</b>${shield}</div>${opts?.compact?'':unitStats(u,tl)}${unitStates(u,tl)}</div>`;
  }
  function renderUnit(u,tl,prev,opts){
    const a=tl.actors.get(String(u.uid));if(!a)return '';
    if(a.kind==='awakener')return renderAwakener(u,a,tl,opts);
    const enemy=a.camp===2,hasHp=u.hp!=null&&u.max>0,p=hasHp?Math.max(0,Math.min(100,u.hp/u.max*100)):0;
    const was=prev&&prev.hp!=null?prev.hp:null,delta=was!=null&&hasHp?u.hp-was:0;
    const portrait=a.kind==='keeper'?ico('','守','av lgx keeper'):ico(a.icon,a.kind==='monster'?'怪':a.name,`av lgx${a.kind==='monster'?' mon':''}`);
    const hpBar=hasHp?`<div class="mr2hp${enemy?' enemy':''}${p<=0?' dead':''}"><i style="width:${p.toFixed(2)}%"></i><span>${fmt(u.hp)} / ${fmt(u.max)} <b>${p.toFixed(p<10?2:p<100?1:0)}%</b></span></div>`:'';
    const dTag=delta?`<span class="mr2delta ${delta<0?'neg':'pos'}">${delta<0?'▼':'▲'}${kfmt(Math.abs(delta))}</span>`:'';
    const shield=u.block>0?`<span class="mr2shield" title="${esc(ui('护盾','Shield'))}">🛡 ${fmt(u.block)}</span>`:'';
    let extra='';
    if(a.kind==='awakener'&&u.ulti!=null&&u.ultiMax>0)extra=`<div class="mr2mini ulti" title="${esc(ui('狂气','Aliemus'))} ${fmt(u.ulti)} / ${fmt(u.ultiMax)}"><i style="width:${Math.min(100,u.ulti/u.ultiMax*100).toFixed(1)}%"></i><span>${ui('狂气','Aliemus')} ${fmt(u.ulti)}</span></div>`;
    if(a.kind==='keeper'){
      const pips=u.maxEnergy>0?`<span class="mr2pips" title="${esc(ui('算力','Energy'))}">${Array.from({length:u.maxEnergy},(_,i)=>`<i class="${i<(u.energy||0)?'on':''}"></i>`).join('')}<small>${fmt(u.energy||0)}/${u.maxEnergy}</small></span>`:'';
      const kk=u.kMax>0?`<div class="mr2mini key" title="${esc(ui('钥令能量','Keyflare'))} ${fmt(u.kEnergy||0)} / ${fmt(u.kMax)}"><i style="width:${Math.min(100,(u.kEnergy||0)/u.kMax*100).toFixed(1)}%"></i><span>${ui('钥令能量','Keyflare')} ${fmt(u.kEnergy||0)}</span></div>`:'';
      extra=`${pips}${kk}`;
    }
    const intent=enemy&&u.intent?`<span class="mr2intent"${u.intentTip||''}>${ui('下一步','Next')}：${esc(tl.res.nameSkill(u.intent))}</span>`:'';
    return `<div class="mr2unit${enemy?' enemy':''}${hasHp&&p<=0?' down':''}" title="${esc(`UID ${u.uid} · tid ${a.tid??'?'}`)}">${portrait}<div class="mr2ubody"><div class="mr2uname"><b>${esc(a.name)}</b>${shield}${dTag}${intent}</div>${hpBar}${extra}${opts?.compact&&a.kind!=='monster'?'':unitStats(u,tl)}${unitStates(u,tl)}</div></div>`;
  }
  function renderBoard(sn,prev,tl,title,opts){
    if(!sn)return '';
    const prevBy=new Map((prev?.units||[]).map(u=>[String(u.uid),u]));
    const ally=sn.units.filter(u=>{const a=tl.actors.get(String(u.uid));return a&&a.camp!==2}).sort((x,y)=>(tl.actors.get(String(x.uid)).kind==='keeper'?-1:0)-(tl.actors.get(String(y.uid)).kind==='keeper'?-1:0));
    const foe=sn.units.filter(u=>tl.actors.get(String(u.uid))?.camp===2);
    return `<div class="mr2boardwrap"><div class="mr2boardtitle">${esc(title)}</div><div class="mr2board"><div class="mr2bcol ally">${ally.filter(u=>tl.actors.get(String(u.uid)).kind!=='awakener').map(u=>renderUnit(u,tl,prevBy.get(String(u.uid)),opts)).join('')}<div class="mr2awrow">${ally.filter(u=>tl.actors.get(String(u.uid)).kind==='awakener').map(u=>renderUnit(u,tl,prevBy.get(String(u.uid)),opts)).join('')}</div></div><div class="mr2bcol enemy">${foe.map(u=>renderUnit(u,tl,prevBy.get(String(u.uid)),opts)).join('')}</div></div></div>`;
  }

  // ---- interactions: floating tooltip + expandable descriptions ----------------------
  function wireInteractions(host){
    let tip=document.getElementById('mr2tip');
    if(!tip){tip=document.createElement('div');tip.id='mr2tip';document.body.appendChild(tip)}
    const hide=()=>{tip.style.display='none'};
    const place=(x,y)=>{const w=tip.offsetWidth,h=tip.offsetHeight,vw=innerWidth,vh=innerHeight;let l=x+16,t=y+16;if(l+w>vw-8)l=Math.max(8,x-w-16);if(t+h>vh-8)t=Math.max(8,y-h-16);tip.style.left=`${l}px`;tip.style.top=`${t}px`};
    const show=(el,x,y)=>{const t=el.getAttribute('data-tipt'),sub=el.getAttribute('data-tips'),b=el.getAttribute('data-tip');tip.innerHTML=`<b>${esc(t)}</b>${sub?`<small>${esc(sub)}</small>`:''}${b?`<p>${esc(b)}</p>`:''}`;tip.style.display='block';place(x,y)};
    if(!host.__mr2wired){
      host.__mr2wired=true;
      host.addEventListener('click',e=>{const bt=e.target.closest?.('.mr2tabbtn');if(!bt)return;const dash=bt.closest('.mr2dash');if(!dash)return;dash.querySelectorAll('.mr2tabbtn').forEach(x=>x.classList.toggle('on',x===bt));dash.querySelectorAll('.mr2tabpane').forEach(pn=>{pn.hidden=pn.dataset.pane!==bt.dataset.tab})});
      host.addEventListener('toggle',e=>{const d=e.target;if(d?.matches?.('details.mr2snap')&&d.open&&!d.dataset.built){const x=snapStore[Number(d.dataset.snap)];if(x){d.querySelector('.mr2snapbody').innerHTML=renderBoard(x.after,x.before,x.tl,'',{compact:true});d.dataset.built='1'}}},true);
      host.addEventListener('mouseover',e=>{const el=e.target.closest?.('[data-tipt]');if(el)show(el,e.clientX,e.clientY);else hide()});
      host.addEventListener('mousemove',e=>{if(tip.style.display==='block')place(e.clientX,e.clientY)});
      host.addEventListener('mouseleave',hide);
      host.addEventListener('click',e=>{
        const head=e.target.closest?.('.mr2acthead[data-toggle]');if(head&&!e.target.closest('a,button'))head.closest('.mr2act')?.classList.toggle('descopen');
        if(e.target.id==='mr2ShowDesc')host.classList.toggle('mr2showdesc',e.target.checked);
        const el=e.target.closest?.('[data-tipt]');if(el&&matchMedia('(hover:none)').matches)show(el,e.clientX,e.clientY)
      });
    }
    const box=host.querySelector('#mr2ShowDesc');if(box)box.checked=host.classList.contains('mr2showdesc');
  }
  // ---- opening formation: panel attrs (Potency/Break already folded in), then starting states grouped by where they come from
  function openingStates(full,tl){
    const bd=full.battleDat||{},res=tl.res,list=bd.stateList||[],roles=bd.roleData||[];
    if(!roles.length&&!list.length)return '';
    const chipSt=(id,layer)=>`<span class="mr2chip st ${stateClass(res,id)}"${stateTipAttr(res,id)}>${ico(stateIconSrc(res,id),res.nameState(id),'st')}<span>${esc(res.nameState(id))}${layer>1?` <em>×${esc(layer)}</em>`:''}</span></span>`;
    const cnOf=id=>String(res.state[String(id)]?.CnID||'');
    const hidden=id=>res.state[String(id)]?.ShowType==='Hide';
    const catOf=st=>{const src=(st.source||[])[0]||{},cn=cnOf(st.stateId),t=src.sourceType||'';
      if(/启灵|三启|二启|一启/.test(cn))return 'enl';
      if(t==='AwakerTalents'||/天赋/.test(cn))return 'tal';
      if(t==='Weapon'||/武器|专武/.test(cn))return 'wheel';
      if(/饰品/.test(cn))return 'cov';
      if(t==='Relic')return 'relic';
      if(t==='School')return 'school';
      if(t==='StageInitState')return 'stage';
      return 'other'};
    const CAT={enl:ui('启灵','Enlighten'),tal:ui('天赋','Talent'),wheel:ui('命轮','Wheel'),cov:ui('密契 / 饰品','Covenant'),relic:ui('造物','Relic'),school:ui('职业','School'),stage:ui('关卡','Stage'),other:ui('其他数值 / 机制','Other')};
    const order=['enl','tal','wheel','cov','relic','school','stage','other'];
    const group=(sts,collapseRest=true)=>{const g=new Map();for(const st of sts){if(st.ownerData?.targetType==='Card')continue;const c=catOf(st);if(!g.has(c))g.set(c,[]);g.get(c).push(st)}
      const line=c=>{const vis=g.get(c).filter(x=>!/空状态/.test(cnOf(x.stateId)));if(!vis.length)return '';
        return `<div class="mr2ostate"><span class="mr2from">${esc(CAT[c])}</span>${vis.map(x=>{const w=c==='wheel'&&gearCatalog?.wheels?.[String(x.source?.[0]?.tid)];return w?`<span class="mr2chip st" title="${esc((()=>{try{return fillArgs(pipeName(res.state[String(x.stateId)]?.WeaponDesc||res.state[String(x.stateId)]?.Desc||''),x.stateParams||[])||cnOf(x.stateId)}catch{return cnOf(x.stateId)}})())}">${w.icon?ico(`${ART}/wheels/${w.icon}.webp`,w.zh,'st'):''}<span>${esc(w.zh||w.en)}</span></span>`:chipSt(x.stateId,x.layer)}).join('')}</div>`};
      const rest=order.filter(c=>!['enl','tal','wheel','cov'].includes(c)&&g.has(c)),restN=rest.reduce((n,c)=>n+g.get(c).length,0);
      if(!collapseRest)return order.filter(c=>g.has(c)).map(line).join('');
      // enlightenment / talent / wheel / covenant are shown as the team detail above, not as raw state chips
      return restN?`<details class="mr2minor mr2oother"><summary>${ui(`其他数值 / 机制 / 造物 / 关卡状态 ${restN}`,`Other states ${restN}`)}</summary>${rest.map(line).join('')}</details>`:''};
    const KEYS=['atk','hp','def','crit','crit_damage','keeper_energy_eff','ulti_energy_max','death_resist'];
    const teamHit=window.MorimensDtideTeamLookup?.(full.replayUuid||bd.battleUuid),tMembers=teamHit?.team?.members||[];
    const stackLabel=n=>{n=Number(n);return !Number.isFinite(n)?'—':n<=3?ui(`${n}叠`,`S${n}`):`+${n-3}`};
    const memberOf=ri=>{const nm=String(res.aw[String(ri.tid)]?.NameEn||'').toLowerCase();return tMembers.find(m=>[m.name,m.canonicalName].some(x=>String(x||'').toLowerCase()===nm))||null};
    const gearBlock=(ri,sts)=>{
      const m=memberOf(ri),rows=[],nmz=teamHit?.names;
      for(const x of sts.filter(y=>catOf(y)==='wheel')){
        const tid=x.source?.[0]?.tid,c=gearCatalog?.wheels?.[String(tid)];if(!c)continue;
        const stk=full.__ws?.get(String(ri.uid)+'|'+tid),tw=(m?.wheels||[]).find(w=>String(w.name).toLowerCase()===String(c.en||'').toLowerCase());
        rows.push(`<span class="mr2chip st" title="${esc(fillArgs(pipeName(res.state[String(x.stateId)]?.WeaponDesc||res.state[String(x.stateId)]?.Desc||''),x.stateParams||[]))}">${c.icon?ico(`${ART}/wheels/${c.icon}.webp`,c.zh,'st'):''}<span>${esc(c.zh||c.en)}</span><em>${tw?.level!=null?esc(wheelStackText(tw.level)):''}</em></span>`)}
      if(m){for(const c of m.covenants||(m.covenant?[m.covenant]:[]))rows.push(`<span class="mr2chip st" title="${esc((c.effects||[]).map(e=>`${e.pieces}${ui('件','pc')}：${String(e.desc||'').replace(/<[^>]+>/g,'')}`).join('\n'))}"><span>${esc(nmz.covenant(c))}</span><em>${esc(c.count??'')}${ui('件','pc')}${m.covenantScore!=null?` · ${ui('评分','score')} ${esc(m.covenantScore)}`:''}</em></span>`)}
      else{const cats=Object.values(gearCatalog?.covenants||{}),stems=[...new Set(sts.filter(y=>catOf(y)==='cov').map(y=>cnOf(y.stateId).replace(/^状态@饰品/,'')))],seen=new Set();
        for(const st of stems){const c=cats.filter(z=>z.zh&&st.startsWith(z.zh)).sort((a,b)=>b.zh.length-a.zh.length)[0];if(c&&!seen.has(c.zh)){seen.add(c.zh);rows.push(`<span class="mr2chip st"><span>${esc(c.zh)}</span></span>`)}}}
      return rows.length?`<div class="mr2ostate"><span class="mr2from">${ui('命轮 / 密契','Wheels / Covenants')}</span>${rows.join('')}</div>`:''};
    const blocks=roles.map(ri=>{
      const a=tl.actors.get(String(ri.uid));if(!a)return '';
      const at=ri.attrs||{},op=tl.openProps?.get(String(ri.uid))||{};
      const base=KEYS.filter(k=>at[k]).map(k=>`<span class="mr2statchip"><small>${esc(statName(res,k))}</small><b>${esc(fmtStat(k,at[k]))}</b></span>`).join('');
      const diffs=Object.keys(op).filter(k=>typeof op[k]==='number'&&Math.abs(op[k]-(at[k]||0))>1.5&&!/^(hp|max_hp|energy|max_energy|ulti_energy|ulti_energy_max|keeper_energy|max_keeper_energy|block)$/.test(k)).sort().slice(0,16)
        .map(k=>`<span class="mr2statchip up"><small>${esc(statName(res,k))}</small><b>${at[k]?`${esc(fmtStat(k,at[k]))} → `:'+'}${esc(fmtStat(k,op[k]))}</b></span>`).join('');
      const sts=list.filter(x=>x.ownerData?.targetType==='Awaker'&&String(x.ownerData.uid)===String(ri.uid));
      const pot=Number(ri.potencyLevel),enlTxt=Number.isFinite(pot)?(pot<=3?ui(`${pot}启`,`E${pot}`):`+${pot-3}`):'—';
      const SLOT={Slot_Super:ui('狂气爆发','Ultimate'),Slot_Strike:ui('打击','Strike'),Slot_Defend:ui('防御','Defend'),Slot_Awake:ui('觉醒','Awake'),Slot_Skill1:ui('技能一','Skill 1'),Slot_Skill2:ui('技能二','Skill 2')};
      const skillRow=(()=>{const extraN=(ri.slots||[]).filter(sl=>sl&&sl.tid&&/^Slot_Extend/.test(String((res.skill[String(sl.tid)]||{}).Slot||''))).length;const chips=(ri.slots||[]).filter(sl=>sl&&sl.tid).map(sl=>{const sk=res.skill[String(sl.tid)]||{},slot=String(sk.Slot||sk.SkillSlot||'');const lab=SLOT[slot]||'';if(!lab)return '';return `<span class="mr2statchip" title="${esc(res.nameSkill(sl.tid))}"><small>${esc(lab)}${SLOT[slot]&&!/Super|Strike|Defend/.test(slot)?` · ${esc(res.nameSkill(sl.tid))}`:''}</small><b>Lv${esc(sl.level)}</b></span>`}).join('');
        const ext=extraN?`<span class="mr2statchip" title="${esc((ri.slots||[]).filter(sl=>sl&&sl.tid&&/^Slot_Extend/.test(String((res.skill[String(sl.tid)]||{}).Slot||''))).map(sl=>res.nameSkill(sl.tid)+' Lv'+sl.level).join(' / '))}"><small>${ui('扩展技能','Extra')} ×${extraN}</small><b>Lv${esc((ri.slots||[]).filter(sl=>sl&&sl.tid&&/^Slot_Extend/.test(String((res.skill[String(sl.tid)]||{}).Slot||''))).map(sl=>sl.level).join('/'))}</b></span>`:'';const bs=Number(ri.breakSkillLevel)>0?`<span class="mr2statchip"><small>${ui('灵塑','Soulforge')}</small><b>Lv${esc(ri.breakSkillLevel)}</b></span>`:'';return chips||bs||ext?`<div class="mr2flow">${chips}${ext}${bs}</div>`:''})();
      const enl=Math.max(0,...sts.map(x=>{const m=cnOf(x.stateId).match(/启灵(\d)(?!\d)(?!标识|计数)/);return m?Number(m[1]):/三启/.test(cnOf(x.stateId))?3:0}));
      return `<div class="mr2dgroup"><div class="mr2dhead">${ico(a.icon,a.name,'av')}<b>${esc(a.name)}</b><span class="mr2from">Lv${esc(ri.level)} · ${esc(enlTxt)} · ${ui('突破','Break')} ${esc(ri.breakLevel)}${full.__sf?.get(String(ri.uid))?` · ${ui('灵塑','Soulforge')} ${full.__sf.get(String(ri.uid))}`:''}</span></div>
        ${skillRow}
        <div class="mr2flow">${base}</div>${diffs?`<div class="mr2flow"><small class="mr2from">${ui('开局战斗面板 = 编队面板 + 命轮 / 密契 / 造物 / 局内状态','Opening battle panel = formation + gear / relics / states')}</small>${diffs}</div>`:''}
        ${gearBlock(ri,sts)}${group(sts)}</div>`}).join('');
    const team=list.filter(x=>x.ownerData?.targetType==='PlayerRole');
    const teamHtml=team.length?`<details class="mr2minor"><summary>${ui(`队伍级开局状态 ${team.length}`,`Team-level opening states ${team.length}`)}</summary>${group(team,false)}</details>`:'';
    return `<div class="mr2osec"><div class="mr2boardtitle">${ui('唤醒体编队与开局状态','Formation & opening states')}</div><div class="mr2decks">${blocks}</div>${teamHtml}</div>`;
  }
  // ---- battle opening: relics + starting deck ---------------------------------------
  function renderOpening(full,tl){
    const bd=full.battleDat||{},res=tl.res,cards=tl.ent.initialCards||[],relics=bd.relics||[];
    if(!cards.length&&!relics.length)return '';
    const relicHtml=relics.map(r=>{const rec=res.relic[String(r.tid)]||{};return `<span class="mr2relic q-${esc(String(rec.Quality||'').toLowerCase())}"${relicTipAttr(res,r.tid,r.descArgs)}>${ico(relicIconSrc(res,r.tid),res.nameRelic(r.tid),'rl big')}<b>${esc(res.nameRelic(r.tid))}</b></span>`}).join('');
    const byOwner=new Map();for(const c of cards){const k=String(c.ownerUid);if(!byOwner.has(k))byOwner.set(k,[]);byOwner.get(k).push(c)}
    const roleInfo=new Map((bd.roleData||[]).map(r=>[String(r.uid),r]));
    const owners=[...byOwner.keys()].sort((a,b)=>(tl.actors.get(a)?.kind==='keeper'?-1:0)-(tl.actors.get(b)?.kind==='keeper'?-1:0));
    const groups=owners.map(k=>{
      const a=tl.actors.get(k),list=byOwner.get(k),ri=roleInfo.get(k);
      const merged=new Map();for(const c of list){const key=`${c.tid}|${c.level}|${c.deck==='NoneDeck'?'x':''}`;const o=merged.get(key)||{c,n:0};o.n++;merged.set(key,o)}
      const cardsHtml=[...merged.values()].map(({c,n})=>{
        const tid=c.tid??c.configId,r=res.skill[String(tid)]||{},info=actionInfo({kind:'card',stypes:asList(r.Type)}),cost=c.cost??r.Cost;
        const args=c.descArgs?.curValues;
        return `<span class="mr2dcard a-${info.cls}"${skillTipAttr(res,tid,{args,level:c.level})}><span class="mr2dcost">${esc(cost==null?'-':cost)}</span><span class="mr2dname"><b>${esc(res.nameSkill(tid))}</b><small>${esc(info.label)}${c.level>1?` · Lv${esc(c.level)}`:''}${c.deck==='NoneDeck'?` · ${ui('场外','Off-deck')}`:''}</small></span>${n>1?`<em class="mr2dn">×${n}</em>`:''}</span>`;
      }).join('');
      const head=a?`${ico(a.icon,a.kind==='keeper'?'守':a.name,`av ${a.kind==='keeper'?'keeper':''}`)}<b>${esc(a.name)}</b>${ri?`<span class="mr2from">Lv${esc(ri.level)} · ${ui('潜能','Potency')} ${esc(ri.potencyLevel)} · ${ui('突破','Break')} ${esc(ri.breakLevel)}</span>`:`<span class="mr2from">${ui('守密人','Keeper')}</span>`}`:`<b>#${esc(k)}</b>`;
      return `<div class="mr2dgroup"><div class="mr2dhead">${head}<span class="mr2from">${list.length} ${ui('张','cards')}</span></div><div class="mr2dcards">${cardsHtml}</div></div>`;
    }).join('');
    const stateSec=openingStates(full,tl);
    return `<details class="mr2round mr2opening"><summary><b>${ui('战斗开局','Battle opening')}</b><small>${ui(`造物 ${relics.length} 个 · 牌库 ${cards.length} 张`,`${relics.length} relics · ${cards.length} cards`)}</small></summary><div class="mr2rbody">${relics.length?`<div class="mr2osec"><div class="mr2boardtitle">${ui('拥有的造物','Relics')}</div><div class="mr2relics">${relicHtml}</div></div>`:''}${cards.length?`<div class="mr2osec"><div class="mr2boardtitle">${ui('牌库状态（开局）','Starting deck')}</div><div class="mr2decks">${groups}</div></div>`:''}${stateSec}</div></details>`;
  }
  // ---- damage-formula calibration ------------------------------------------------------
  // Calculator order: ATK x coefficient x base-damage pools -> + STR x strength multiplier -> x vulnerability -> x crit.
  // Per awakener we fit  D/(crit*vuln) = a_skill * (ATK_force * basePool) + m * STR  on this replay's own hits,
  // where m is the real strength multiplier (the calculator assumes 1 for active damage).
  function solveLeastSquares(rows,y,w){
    const n=rows[0].length,A=Array.from({length:n},()=>new Array(n+1).fill(0));
    rows.forEach((r,i)=>{const ww=w[i]*w[i];for(let a=0;a<n;a++){for(let b=0;b<n;b++)A[a][b]+=r[a]*r[b]*ww;A[a][n]+=r[a]*y[i]*ww}});
    for(let a=0;a<n;a++)A[a][a]+=1e-9;
    for(let c=0;c<n;c++){let piv=c;for(let r=c+1;r<n;r++)if(Math.abs(A[r][c])>Math.abs(A[piv][c]))piv=r;[A[c],A[piv]]=[A[piv],A[c]];if(Math.abs(A[c][c])<1e-12)return null;
      for(let r=c+1;r<n;r++){const f=A[r][c]/A[c][c];for(let k=c;k<=n;k++)A[r][k]-=f*A[c][k]}}
    const x=new Array(n).fill(0);for(let r=n-1;r>=0;r--){let sum=A[r][n];for(let k=r+1;k<n;k++)sum-=A[r][k]*x[k];x[r]=sum/A[r][r]}return x;
  }
  function calibrateHits(tl){
    if(tl.calib)return tl.calib;
    const res=tl.res,log=tl.hitLog||[];
    // skill text -> where each number sits in the card's displayed values (display order = order of first appearance in the text),
    // which one is the damage, and the per-skill strength / tentacle share ("享受 [Arg2]% 力量加成")
    const descMemo=new Map(),descInfo=tid=>{const k=String(tid);if(descMemo.has(k))return descMemo.get(k);
      let d=res.skill[k]?.Desc;if(d&&typeof d==='object'){const keys=Object.keys(d).sort((a,b)=>Number(b)-Number(a));d=d[keys[0]]}
      d=pipeName(String(d||''));const order=[];for(const m of d.matchAll(/Arg(\d+)/g)){if(!order.includes(m[1]))order.push(m[1])}
      const pos=n=>{const i=order.indexOf(String(n));return i<0?-1:i};
      const dm=d.match(/Damage:\[?Damage:Arg(\d+)/),xm=d.match(/力量[^。]{0,12}发挥\s*\[Arg(\d+)\]\s*倍/),sm=d.match(/享受\s*(?:\[Arg(\d+)\]|(\d+(?:\.\d+)?))\s*[%％]\s*力量加成/),tm=d.match(/享受\s*(?:\[Arg(\d+)\]|(\d+(?:\.\d+)?))\s*[%％]\s*触腕伤害加成/);
      const info={dmgPos:dm?pos(dm[1]):-1,strPos:sm&&sm[1]?pos(sm[1]):-1,timesPos:xm?pos(xm[1]):-1,strFix:sm&&sm[2]?Number(sm[2]):null,tenPos:tm&&tm[1]?pos(tm[1]):-1,tenFix:tm&&tm[2]?Number(tm[2]):null};
      descMemo.set(k,info);return info};
    const strMul=h=>{const i=descInfo(h.skill);if(i.timesPos>=0){const v=h.arg?.[i.timesPos];if(v>=1&&v<=50)return v}if(i.strPos>=0){const v=h.arg?.[i.strPos];if(v>=10&&v<=2000&&v%5===0)return v/100;return 1}if(i.strFix!=null)return i.strFix/100;return 1};
    const tenMul=h=>{const i=descInfo(h.skill);if(i.tenPos>=0&&h.arg?.[i.tenPos]>0)return h.arg[i.tenPos]/100;if(i.tenFix!=null)return i.tenFix/100;return 0};
    // which stat a skill scales with: the first Battle*Force token in its parameter formula (default ATK)
    const fkMemo=new Map(),forceKind=tid=>{const k=String(tid);if(!fkMemo.has(k)){const pa=res.skill[k]?.Para,t=typeof pa==='string'?pa:JSON.stringify(pa?.['0']??pa?.['1']??pa??''),m=t.match(/Battle(Atk|Def|Physique)Force/);fkMemo.set(k,m?(m[1]==='Def'?'def':m[1]==='Physique'?'phys':'atk'):'atk')}return fkMemo.get(k)};
    const types=h=>asList(res.skill[String(h.skill)]?.Type);
    const scopeOf=h=>{const T=types(h);return {card:T.some(t=>String(t).startsWith('Card_')),strike:T.includes('Card_Strike'),attach:T.includes('Card_AttachPost'),ult:T.includes('Ulti_Skill')}};
    // damage-relevant stats of one hit. mode 'basic' = old model (basic pools only), 'full' = calculator-style scoped pools
    const ctxOf=(h,mode='full')=>{
      const P=h.P,sc=scopeOf(h),g=k=>P[k]||0,full=mode==='full';
      const out=g('basic_damage_per')+(full?g('o_damage_per')+(sc.card?g('o_damage_per_card'):0)+(sc.strike?g('o_damage_per_strikecard'):0)+(sc.attach?g('o_damage_per_attachpost'):0)+(sc.ult?g('o_damage_per_ulti'):0):0);
      const inn=g('i_basic_damage_per');
      const fin=full?(h.fia||0)+g('i_damage_per')+(sc.strike?g('i_damage_per_strikecard'):0)+g('damage_per2monster_boss'):0;
      const cd=g('crit_damage')+(sc.ult?g('crit_damage_from_ulti'):0);
      const S=(g('damage_plus')+(sc.strike?g('strikecard_damage_plus'):0))*(h.cmul>0?h.cmul/100:1);
      const fk=forceKind(h.skill),atkForce=Math.ceil(fk==='def'?g('def')*(1+g('def_per')/100):fk==='phys'?g('physique')*(1+g('physique_per')/100):g('atk')*(1+g('atk_per')/100));
      return {sc,out,inn,fin,cd,S,atkForce,T:atkForce*(1+out/100)*(1+inn/100)*(h.pf||1)};
    };
    const Vof=(h,useV=true)=>(useV&&h.vOn?1+h.vPct/100:1)*(1+(h.amp||[]).reduce((n,x)=>n+x.p,0)/100);   // vulnerability and enemy-state damage-taken amplifiers (共感 ...)
    const dnOf=(h,c,useV=true)=>h.dmg/(h.crit?1+c.cd/100:1)/(1+c.fin/100)/Vof(h,useV);
    const byActor=new Map();const blindBy=new Map();for(const h of log){if(scopeOf(h).ult)continue;if(h.blind){blindBy.set(h.uid,(blindBy.get(h.uid)||0)+1);continue}if(!byActor.has(h.uid))byActor.set(h.uid,[]);byActor.get(h.uid).push(h)}
    const fits=new Map(),report=[];
    const fitActor=(hits,mode,useV)=>{
      const uniq=new Map();for(const h of hits){const c=ctxOf(h,mode),key=`${h.skill}|${Math.round(dnOf(h,c,true))}|${c.S}|${c.T.toFixed(1)}`;if(!uniq.has(key))uniq.set(key,{h,c})}
      let pts=[...uniq.values()],trimmed=0;
      for(let pass=0;pass<2&&pts.length>=6;pass++){const sk=[...new Set(pts.map(p=>p.h.skill))],si=new Map(sk.map((s,i)=>[s,i]));
        const rw=pts.map(p=>{const r=new Array(sk.length+1).fill(0);r[si.get(p.h.skill)]=p.c.T;r[sk.length]=p.c.S;return r}),yy=pts.map(p=>dnOf(p.h,p.c,useV)),ww=yy.map(v=>1/Math.max(1,v));
        const xx=new Set(pts.map(p=>p.c.S)).size>=2&&pts.length>sk.length+4?solveLeastSquares(rw,yy,ww):null;if(!xx)break;
        const keep=pts.filter((p,i)=>Math.abs(rw[i].reduce((t,v,k)=>t+v*xx[k],0)-yy[i])/yy[i]<=0.3);
        if(keep.length===pts.length||keep.length<sk.length+4)break;trimmed+=pts.length-keep.length;pts=keep}
      const skills=[...new Set(pts.map(p=>p.h.skill))],sIdx=new Map(skills.map((s,i)=>[s,i])),distinctS=new Set(pts.map(p=>p.c.S)).size;
      const rows=pts.map(p=>{const r=new Array(skills.length+1).fill(0);r[sIdx.get(p.h.skill)]=p.c.T;r[skills.length]=p.c.S;return r}),y=pts.map(p=>dnOf(p.h,p.c,useV)),w=y.map(v=>1/Math.max(1,v));
      const x=distinctS>=2&&pts.length>skills.length?solveLeastSquares(rows,y,w):null;
      let errs=null;if(x)errs=rows.map((r,i)=>Math.abs(r.reduce((t,v,k)=>t+v*x[k],0)-y[i])/y[i]);
      // calculator default (strength x1): refit only per-skill coefficients
      let calcErr=null;{const r1=pts.map(p=>{const r=new Array(skills.length).fill(0);r[sIdx.get(p.h.skill)]=p.c.T;return r}),y1=pts.map((p,i)=>y[i]-p.c.S),xx=solveLeastSquares(r1,y1,w);if(xx)calcErr=r1.map((r,i)=>Math.abs(r.reduce((t,v,k)=>t+v*xx[k],0)+pts[i].c.S-y[i])/y[i]).reduce((a,b)=>a+b,0)/pts.length}
      return {pts,trimmed,skills,distinctS,x,m:x?Math.max(0,Math.min(10,x[skills.length])):null,mean:errs?errs.reduce((a,b)=>a+b,0)/errs.length:null,max:errs?Math.max(...errs):null,calcErr};
    };
    for(const [uid,hits] of byActor){
      const f=fitActor(hits,'full',true),fNoV=fitActor(hits,'full',false),fOld=fitActor(hits,'basic',true);
      const pairs=new Map();for(const h of hits){const k=`${h.cmd}|${h.skill}|${h.target}|${JSON.stringify(h.P)}|${h.vOn}`;const o=pairs.get(k)||{};o[h.crit?'c':'n']=h.dmg;o.cd=ctxOf(h).cd;pairs.set(k,o)}
      const crit=[...pairs.values()].filter(o=>o.c&&o.n).map(o=>({got:o.c/o.n,want:1+o.cd/100}));
      const a=tl.actors.get(uid),confident=f.distinctS>=3&&f.pts.length>=f.skills.length+3&&f.x!=null&&f.mean<.25;
      if(f.m!=null)fits.set(uid,{m:f.m,confident});
      report.push({uid,name:a?.name||uid,trimmed:f.trimmed,blindN:blindBy.get(uid)||0,confident,hits:hits.length,contexts:f.pts.length,distinctS:f.distinctS,m:f.m,mOld:fOld.m,meanErr:f.mean,maxErr:f.max,meanErrNoVuln:fNoV.mean,meanErrOld:fOld.mean,calcErr:f.calcErr,crit});
    }
    // card-face check: the card's own description value (descArgs[0]) is its damage before crit / vulnerability, so it can be fitted without those factors
    const argFit=hits=>{
      // the card shows its numbers in display order, so find per skill which entry is the damage: the one equal to hit damage / (crit x vulnerability x final pool)
      const cand=hits.filter(h=>!h.blind&&h.arg&&String(h.ptid)===String(h.skill)),votes=new Map();
      for(const h of cand){const c=ctxOf(h),dn=dnOf(h,c,true),v=votes.get(h.skill)||{n:0,k:new Map()};v.n++;h.arg.forEach((a,k)=>{if(a>0&&Math.abs(a-dn*(1+c.fin/100)*1)<=Math.max(2,a*0.02)||a>0&&Math.abs(a-dn)<=Math.max(2,a*0.02))v.k.set(k,(v.k.get(k)||0)+1)});votes.set(h.skill,v)}
      const idxOf=new Map();
      for(const [sk,v] of votes){let best=-1,bn=0;for(const [k,n] of v.k)if(n>bn){best=k;bn=n}if(best>=0&&bn>=Math.max(2,v.n*0.5))idxOf.set(sk,best)}
      for(const h of cand){if(!idxOf.has(h.skill)){const di=descInfo(h.skill).dmgPos;if(di>=0&&h.arg?.[di]>0){const c=ctxOf(h),dn=dnOf(h,c,true)*(1+c.fin/100);if(Math.abs(h.arg[di]/dn-1)<.5)idxOf.set(h.skill,di)}}}
      const av=h=>{const k=idxOf.get(h.skill);if(k!=null)return h.arg?.[k]||0;const a=h.arg?.[0]||0,c=ctxOf(h),dn=dnOf(h,c,true);return a>0&&Math.abs(a/(dn*(1+c.fin/100))-1)<.5?a:0};
      const hs=cand.filter(h=>av(h)>0);if(hs.length<4)return null;
      const plain=hs.filter(h=>!h.crit&&!h.vOn);const match=plain.length?plain.filter(h=>Math.abs(h.dmg-av(h))<=Math.max(2,av(h)*0.01)).length/plain.length:null;
      // strength share per skill ("享受 N% 力量加成"): keep the reading (described share vs plain x1) that fits that skill better
      const build=(useShare,usePlus)=>{const u=new Map();for(const h of hs){const c0=ctxOf(h),sm=useShare?strMul(h):1,c={...c0,S:c0.S*sm+(useShare?(h.P.tentacle_dmg||0)*tenMul(h):0)+(usePlus?(h.pp||0):0)},y=av(h)/(1+c.fin/100),key=`${h.skill}|${Math.round(y)}|${c.S.toFixed(1)}|${c.T.toFixed(1)}`;if(!u.has(key))u.set(key,{h,c,y})}return [...u.values()]};
      const skillErr=ps=>{const g=new Map();for(const p of ps){const o=g.get(p.h.skill)||[];o.push(p);g.set(p.h.skill,o)}const out=new Map();for(const [k,l] of g){let num=0,den=0;for(const p of l){const w=1/(p.y*p.y);num+=w*p.c.T*(p.y-p.c.S);den+=w*p.c.T*p.c.T}const A=den>0?num/den:0;out.set(k,l.reduce((t,p)=>t+Math.abs(A*p.c.T+p.c.S-p.y)/p.y,0)/l.length)}return out};
      // keep, per skill, the reading (plain / described strength share / ParaPlus extra) that fits that skill best
      const vars=[build(false,false),build(true,false),build(false,true),build(true,true)],errs=vars.map(skillErr);
      const bestVar=new Map();for(const k of errs[0].keys()){let bi=0;for(let i=1;i<vars.length;i++)if((errs[i].get(k)??9)<(errs[bi].get(k)??9)-0.005)bi=i;bestVar.set(k,bi)}
      const uniq=new Map(vars.flatMap((ps,i)=>ps.filter(p=>bestVar.get(p.h.skill)===i)).map((p,i)=>[i,p]));
      let pts=[...uniq.values()],trimmed=0;
      const solve=ps=>{const sk=[...new Set(ps.map(p=>p.h.skill))],si=new Map(sk.map((v,i)=>[v,i])),rw=ps.map(p=>{const r=new Array(sk.length+1).fill(0);r[si.get(p.h.skill)]=p.c.T;r[sk.length]=p.c.S;return r}),yy=ps.map(p=>p.y),ww=yy.map(v=>1/Math.max(1,v));
        const x=new Set(ps.map(p=>p.c.S)).size>=2&&ps.length>sk.length+2?solveLeastSquares(rw,yy,ww):null;
        const errs=x?rw.map((r,i)=>Math.abs(r.reduce((t,v,k)=>t+v*x[k],0)-yy[i])/yy[i]):null;
        // calculator default: strength x1, only the per-skill coefficient is fitted
        const r1=ps.map(p=>{const r=new Array(sk.length).fill(0);r[si.get(p.h.skill)]=p.c.T;return r}),y1=ps.map(p=>p.y-p.c.S),x1=solveLeastSquares(r1,y1,ww);
        const e1=x1?r1.map((r,i)=>Math.abs(r.reduce((t,v,k)=>t+v*x1[k],0)+ps[i].c.S-yy[i])/yy[i]):null;
        return {sk,x,errs,e1}};
      let r=solve(pts);
      for(let pass=0;pass<2&&r.errs;pass++){const keep=pts.filter((p,i)=>r.errs[i]<=0.3);if(keep.length===pts.length||keep.length<r.sk.length+3)break;trimmed+=pts.length-keep.length;pts=keep;r=solve(pts);if(!r.errs)break}
      const mean=a=>a&&a.length?a.reduce((t,v)=>t+v,0)/a.length:null;
      const perSkill=(()=>{const g=new Map();pts.forEach((p,i)=>{if(!r.e1)return;const o=g.get(p.h.skill)||{tid:p.h.skill,name:res.nameSkill(p.h.skill),n:0,err:0,idx:idxOf.get(p.h.skill)??0};o.n++;o.err+=r.e1[i];g.set(p.h.skill,o)});return [...g.values()].map(o=>({...o,err:o.err/o.n}))})();
      return {perSkill,hits:hs.length,ctx:pts.length,trimmed,match,m:r.x?Math.max(0,Math.min(10,r.x[r.sk.length])):null,mean:mean(r.errs),calcErr:mean(r.e1)};
    };
    for(const rep of report){rep.arg=argFit(log.filter(h=>h.uid===rep.uid&&!scopeOf(h).ult))}
    // attribute every buff (relics + wheels + covenants) with the fitted multipliers
    for(const rec of tl.relicBuffs.values()){rec.extra=0;for(const i of rec.instances){i.extra=0;i.hits=0}}
    const fallbackM=(()=>{const ms=[...fits.values()].filter(f=>f.confident).map(f=>f.m).sort((a,b)=>a-b);return ms.length?ms[Math.floor(ms.length/2)]:1})();
    const inScope=(sc,scope)=>!scope||scope==='all'||!!sc[scope];
    for(const sp of tl.supStore?.values()||[])sp.vulnExtra=0;
    for(const h of log){
      if(h.amp?.length){const tot=h.amp.reduce((n,x)=>n+x.p,0),ex=h.dmg*tot/(100+tot);for(const x of h.amp){const sh=ex*x.p/tot,keys=x.keys.length?x.keys:[];for(const k of keys){const sp=tl.supStore?.get(k)||null;if(sp){sp.vulnExtra+=sh/keys.length;sp.ampTypes=sp.ampTypes||new Map();sp.ampTypes.set(x.nm,(sp.ampTypes.get(x.nm)||0)+sh/keys.length)}}}}
      if(h.vOn&&h.vsrc){const sp=tl.supStore?.get(h.vsrc);if(sp)sp.vulnExtra+=h.dmg*((h.vPct||50)/100)/(1+(h.vPct||50)/100)}
      if(!h.buffs.length)continue;
      const c=ctxOf(h),sc=c.sc,fit=fits.get(h.uid),m=sc.ult&&h.P.ulti_strength_multiple?h.P.ulti_strength_multiple/100:(fit?fit.m:fallbackM);
      const dn=dnOf(h,c),strPart=Math.min(dn,m*c.S),basePart=Math.max(0,dn-strPart),baseShare=dn>0?basePart/dn:0;
      for(const b of h.buffs){
        if(!inScope(sc,b.scope))continue;
        let frac=0;
        if(b.kind==='power')frac=m*b.amt/dn;
        else if(b.kind==='basic'||b.kind==='in')frac=baseShare*(b.amt/100)/(1+c.inn/100);
        else if(b.kind==='out')frac=baseShare*(b.amt/100)/(1+c.out/100);
        else if(b.kind==='final')frac=(b.amt/100)/(1+c.fin/100);
        else if(b.kind==='crit')frac=h.crit?(b.amt/100)/(1+c.cd/100):0;
        else if(b.kind==='critrate')frac=(b.amt/100)*(c.cd/100)/(h.crit?1+c.cd/100:1);
        const x=h.dmg*Math.max(0,Math.min(1,frac));b.inst.extra+=x;b.inst.hits++;b.rel.extra+=x;
      }
    }
    tl.calib={report,fallbackM,fits};
    return tl.calib;
  }
  // ---- statistics ---------------------------------------------------------------------
  function computeStats(full,tl){return tl._stats||(tl._stats=computeStatsRaw(full,tl))}
  function computeStatsRaw(full,tl){
    calibrateHits(tl);
    const res=tl.res,bd=full.battleDat||{},actors=tl.actors;
    const events=[];for(const r of tl.rounds)for(const e of r.events)if(e.kind!=='snap')events.push({...e,round:Math.floor(r.round),dim:!!r.dim});
    const actorByTid=new Map();for(const a of actors.values())if(a.kind==='awakener')actorByTid.set(String(a.tid),a);
    const keeper=[...actors.values()].find(a=>a.kind==='keeper');
    const per=new Map();
    const row=a=>{const k=String(a.uid);if(!per.has(k))per.set(k,{a,plays:0,energy:0,ulti:0,types:new Map(),awake:null,dmg:0,block:0,heal:0,src:new Map(),draws:0});return per.get(k)};
    for(const a of actors.values())if(a.camp!==2)row(a);
    // plays / energy / awakening / burst order
    const awakenOrder=[],ultiOrder=[],keeperUses=[];let totalPlays=0,totalEnergy=0,draws=0,discards=0,exhausts=0;
    for(const e of events){
      if(e.camp!==1)continue;
      if(e.kind==='card'||e.kind==='ultimate'||e.kind==='skill'){
        const a=actors.get(String(e.actorUid)),r=a&&row(a);if(!r)continue;
        const info=actionInfo(e);
        if(e.kind==='card'){if(e.fiaLvl){r.fia=r.fia||[0,0,0,0];r.fia[e.fiaLvl]++}r.plays++;totalPlays++;r.energy+=Number(e.cost)||0;totalEnergy+=Number(e.cost)||0;r.types.set(info.label,(r.types.get(info.label)||0)+1)}
        if(info.cls==='awake'){awakenOrder.push({round:e.round,time:e.time,a,name:e.skillName});if(!r.awake)r.awake={round:e.round,order:awakenOrder.length}}
        if(e.kind==='ultimate'||info.cls==='ulti'){r.ulti++;ultiOrder.push({round:e.round,time:e.time,a,name:e.skillName})}
      }
      if(e.kind==='keeper')keeperUses.push(e);
      if(e.kind==='move'){if(e.mv==='draw')draws+=e.count||1;if(e.mv==='discard')discards+=e.count||1;if(e.mv==='exhaust')exhausts+=e.count||1}
    }
    // damage / block / heal by source: the game's own stat packs when present, else rebuilt from hit events
    const addSrc=(r,typ,id,stat,v)=>{const key=`${typ}|${id}`;const o=r.src.get(key)||{typ,id,dmg:0,block:0,heal:0};if(stat==='AwakerDoDamage'){o.dmg+=v;r.dmg+=v}else if(stat==='AwakerDoBlock'){o.block+=v;r.block+=v}else if(stat==='AwakerDoHeal'){o.heal+=v;r.heal+=v}r.src.set(key,o)};
    const stateTotals=new Map();let havePacks=false;
    const packs0=tl.lastStats?.battleStatPackMgr?.battleStatPackData,packs=Array.isArray(packs0)?packs0:(packs0&&typeof packs0==='object'?Object.values(packs0):[]);
    for(const pack of packs)for(const [k,v] of Object.entries(pack.battleValue||{})){
      const a=k==='1'?keeper:actorByTid.get(k);if(!a)continue;const r=row(a);
      for(const [typ,m] of Object.entries(v||{}))for(const [id,x] of Object.entries(m||{}))for(const [stat,val] of Object.entries(x||{})){
        if(typeof val!=='number')continue;havePacks=true;addSrc(r,typ,id,stat,val);
        if(typ==='state'){const t=stateTotals.get(id)||{dmg:0,block:0,heal:0};if(stat==='AwakerDoDamage')t.dmg+=val;else if(stat==='AwakerDoBlock')t.block+=val;else if(stat==='AwakerDoHeal')t.heal+=val;stateTotals.set(id,t)}
      }
    }
    if(!havePacks)for(const e of events){if(e.kind!=='damage'&&e.kind!=='heal')continue;const a=actors.get(String(e.actorUid));if(!a||a.camp===2)continue;addSrc(row(a),'skill',e.skillTid,e.kind==='damage'?'AwakerDoDamage':'AwakerDoHeal',e.amount)}
    const totalDmg=[...per.values()].reduce((n,r)=>n+r.dmg,0);
    // relics: trigger counts + output attributed through the states each relic carries
    const trig=new Map();for(const e of events)if(e.kind==='relic'&&!e.gained){const o=trig.get(String(e.relicTid))||{n:0,rounds:new Set()};o.n++;o.rounds.add(e.round);trig.set(String(e.relicTid),o)}
    for(const [tid,c] of tl.openRelic||[]){const o=trig.get(tid)||{n:0,rounds:new Set()};o.n+=c;trig.set(tid,o)}
    for(const [tid,o] of tl.relicStateAdds||[]){const t=trig.get(tid)||{n:0,rounds:new Set()};if(t.n<o.times.size){t.n=o.times.size;for(const r of o.rounds)t.rounds.add(r)}trig.set(tid,t)}
    for(const [tid,pp] of tl.relicPass||[]){const o=trig.get(tid)||{n:0,rounds:new Set()};o.n=Math.max(o.n,pp.n);trig.set(tid,o)}
    const startTids=(bd.relics||[]).map(r=>String(r.tid)),all=[...new Set([...startTids,...trig.keys()])];
    const relicRows=all.map(tid=>{
      const rec=res.relic[tid]||{},sids=[];for(const [k,v] of Object.entries(rec))if(/^State\d+$/.test(k)&&Array.isArray(v))sids.push(...v.map(String));
      const out={dmg:0,block:0,heal:0};for(const sid of sids){const t=stateTotals.get(sid);if(t){out.dmg+=t.dmg;out.block+=t.block;out.heal+=t.heal}}
      {const sp=tl.supStore?.get('rel:'+tid);if(sp){out.block+=sp.blk||0;out.heal+=sp.heal||0}const pp=tl.relicPass?.get(tid);if(pp){out.block+=pp.block;out.heal+=pp.heal}}
      const eff=[];{const rec2=res.relic[tid]||{},raw=pipeName(pickVariant(rec2.BattleDesc||rec2.Desc,0))||'',txt=raw.replace(/\[Arg(\d)\]/g,(m,n)=>(rec2.StatePara||[])[Number(n)-1]??m);
        if(rec2.StatePara&&!trig.get(tid)?.n&&!(tl.relicBuffs?.get(tid)?.gain>0)&&txt&&!/(每当|每次|每回合|回合开始|回合结束|打出|释放|使用|死亡|受到|击杀|抽|获得)/.test(txt))eff.push({kind:'static',text:txt});
        for(const m of txt.matchAll(/对所有敌人施加\s*(\d+)\s*层\s*(?:<[^:>]*:([^>]*)>|([^，。、\s]{1,4}))/g))eff.push({kind:'open',text:ui(`开局对全体敌人施加 ${m[1]} 层${m[2]||m[3]}`,`Opening: ${m[1]} ${m[2]||m[3]} on all enemies`)})}
      const t=trig.get(tid);return {tid,eff,buff:tl.relicBuffs?.get(tid)||null,start:startTids.includes(tid),n:t?.n||0,rounds:[...(t?.rounds||[])].sort((a,b)=>a-b),...out,mapped:sids.length>0};
    }).sort((a,b)=>b.dmg-a.dmg||b.n-a.n);
    // text-driven passives with no trigger event of their own: "回合开始时抽 N 张牌" (nominal draws per round) and "每回合前 K 次造成的伤害提高 N%" (valued on the hit log)
    {const bouts=tl.rounds.filter(r=>!r.dim).length,hitsBy=new Map();for(const h of tl.hitLog||[]){if(h.blind)continue;const k=h.round;if(!hitsBy.has(k))hitsBy.set(k,[]);hitsBy.get(k).push(h)}
      for(const r of relicRows){const rec=res.relic[r.tid]||{},raw=pipeName(pickVariant(rec.BattleDesc||rec.Desc,0))||'',para=rec.StatePara||[],argv=n=>Number(para[Number(n)-1]);
        const dm=raw.match(/回合开始时(?:，)?抽\s*\[Arg(\d)\]\s*张牌/);
        if(dm&&!r.n&&Number.isFinite(argv(dm[1]))){r.n=bouts;r.rounds=Array.from({length:bouts},(_,i)=>i+1);r.eff.push({kind:'nominal',text:ui(`每回合开始抽 ${argv(dm[1])} 张 × ${bouts} 回合 = ${argv(dm[1])*bouts} 张（按回合数估算）`,`Draw ${argv(dm[1])}/round × ${bouts} = ${argv(dm[1])*bouts} (estimated)`)})}
        const am=raw.match(/回合开始时[^，。]{0,10}获得\s*(?:\[Arg(\d)\]|(\d+))\s*点?狂气/),av=am?(am[1]?argv(am[1]):Number(am[2])):NaN;
        if(am&&Number.isFinite(av)&&!r.eff.some(x=>x.kind==='nominal')){r.n=r.n||bouts;r.eff.push({kind:'nominal',text:ui(`每回合开始狂气 +${av} × ${bouts} 回合 = ${av*bouts}（按回合数估算）`,`Aliemus +${av}/round × ${bouts} = ${av*bouts} (estimated)`)})}
        const fm=raw.match(/每回合前\s*(\d+|[一二三四五六七八九十]+)\s*次[^。]{0,20}伤害提高\s*\[Arg(\d)\]\s*%/);
        if(fm&&Number.isFinite(argv(fm[2]))){const K=/^\d+$/.test(fm[1])?Number(fm[1]):'一二三四五六七八九十'.indexOf(fm[1])+1,N=argv(fm[2]);let extra=0,hits=0;
          for(const list of hitsBy.values())for(const h of list.slice(0,K)){extra+=h.dmg*N/(100+N);hits++}
          if(hits){r.buff={tid:r.tid,kind:'out',gain:N,extra,instances:[{round:0,time:0,gain:N,awakeners:new Set(),extra,hits,temp:false,kind:'out'}]};r.n=r.n||bouts}}}}
    for(const r of relicRows){
      const db=tl.relicDebuff?.get(r.tid);if(db){const n=db.times.size;r.n=Math.max(r.n,n);r.eff.push({kind:'debuff',text:ui(`降低敌方力量 共 ${fmt(Math.round(db.total))} 点（${n} 次触发，${db.targets.size} 个目标）`,`Enemy strength −${fmt(Math.round(db.total))} total (${n} triggers, ${db.targets.size} targets)`)})}
      const cd=tl.relicCond?.get(r.tid);if(cd){r.n=Math.max(r.n,cd.n);for(const x of cd.rounds)if(!r.rounds.includes(x))r.rounds.push(x);r.eff.push({kind:'draw',text:ui(`满足手牌条件触发 ${cd.n} 次，抽牌 ${cd.draws} 张（按手牌数估算）`,`${cd.n} qualifying plays, ${cd.draws} cards drawn (estimated from hand size)`)})}}
    const relicDmg=relicRows.reduce((n,r)=>n+r.dmg,0);
    const buffRows=relicRows.filter(r=>r.buff&&r.buff.gain>0);
    const buffExtra=buffRows.reduce((n,r)=>n+r.buff.extra,0),powerGain=buffRows.filter(r=>r.buff.kind==='power').reduce((n,r)=>n+r.buff.gain,0),basicGain=buffRows.filter(r=>r.buff.kind==='basic').reduce((n,r)=>n+r.buff.gain,0);
    // keyflare usage + offered/chosen preference
    const kmap=new Map();
    for(const e of keeperUses){const o=kmap.get(String(e.skillTid))||{tid:e.skillTid,n:0,rounds:new Set(),icon:e.iconSrc,offered:0,chosen:0};o.n++;o.rounds.add(e.round);kmap.set(String(e.skillTid),o)}
    for(const pk of tl.keeperPicks||[])for(const t of pk.options){const o=kmap.get(String(t))||{tid:t,n:0,rounds:new Set(),icon:keeperSkillIconSrc(res,t),offered:0,chosen:0};o.offered++;if(pk.chosen===t)o.chosen++;kmap.set(String(t),o)}
    const keeperRows=[...kmap.values()].sort((a,b)=>b.n-a.n||b.offered-a.offered);
    // damage-over-time / state sources shared by the whole team
    const gearRows=[...(tl.gears?.values()||[])].map(e=>{
      const out={dmg:0,block:0,heal:0};for(const sid of e.related){const t=stateTotals.get(sid);if(t){out.dmg+=t.dmg;out.block+=t.block;out.heal+=t.heal}}
      const rec=tl.gearRecs?.get(e.key);{const sp=tl.supStore?.get('gear:'+e.key);if(sp){out.block+=sp.blk||0;out.heal+=sp.heal||0}}
      const SUPPORTED=new Set(['BSTAfterUseCard','BSTAfterUseKeeperSkill','BSTAfterUltiSkill','BSTAfterBoutBegin','BSTAfterBoutEnd','BSTAfterLaunchSwallow','BSTRoleAfterDeathResist','BSTAfterDimensionBoutBegin','NAMED','CARD']);
      for(const c of e.channels||[])if(!SUPPORTED.has(c.base)&&!c.once&&c.evTimes?.size){let n=0;for(const set of c.evPer.values())n+=c.cap?Math.min(set.size,c.cap):set.size;c.count=n;c.rounds=c.evRounds}   // triggers proven by their own effect
      const chs=(e.channels||[]).filter(c=>SUPPORTED.has(c.base)||(!c.once&&c.evTimes?.size)),sup=chs.length>0;
      const roundSet=new Set();for(const c of chs)for(const r of c.rounds)roundSet.add(r);
      const hbN=tl.supStore?.get('gear:'+e.key)?.hbN||0,base=sup?chs.reduce((a,c)=>a+c.count,0):e.triggers.times.size,n=Math.max(hbN,base,base===0&&(e.channels||[]).some(c=>c.once)?1:0),rounds=sup?[...roundSet].sort((a,b)=>a-b):[...e.triggers.rounds].sort((a,b)=>a-b);
      const lines=[];for(const c of (e.channels||[])){const cnt=c.once?1:c.count;if(c.cmd==null||!cnt)continue;for(const l of gearEffectLines(tl.res,e,c,cnt))lines.push(l)}
      {const dyn=tl.gearDyn?.get(e.key);if(dyn?.length){for(let i=lines.length-1;i>=0;i--)if(/随层数|scales with state/.test(lines[i]))lines.splice(i,1);
        for(const d of dyn){const t=d.types.map(x=>CMD_LABEL[x]).find(Boolean);
          // the command record can be absent from every replay: name the quantity from the item's own effect text ("银钥充能提高 …")
          const KW='(银钥充能|银钥能量|狂气|算力|基础伤害|暴击伤害|暴击率)',m=!t?(String(d.state||'').match(new RegExp(KW))?.slice(0,2).concat(String(e.desc||'').includes(String(d.state||'').match(new RegExp(KW))?.[1]+'提高')?['提高']:[''])||String(e.desc||'').match(new RegExp(KW+'[^，。]{0,4}(提高|增加|获得)'))):null,pct=m&&m[2]==='提高'?'%':'';
          lines.push(ui(`${t?t[0]:m?m[1]:'数值'} ${d.value>=0?'+':''}${fmt(Math.round(d.value*100)/100)}${pct}（「${d.state}」峰值 ${d.peak} 层${d.avg!=null?`；回合开始平均 ${fmt(Math.round(d.avgLayer))} 层 ≈ +${fmt(Math.round(d.avg*10)/10)}${pct}`:''}）`,`${t?t[1]:m?m[1]:'Value'} ${d.value>=0?'+':''}${fmt(Math.round(d.value*100)/100)}${pct} (${d.state} peak ${d.peak}${d.avg!=null?`; avg ${fmt(Math.round(d.avgLayer))} layers ≈ +${fmt(Math.round(d.avg*10)/10)}${pct}`:''})`))}}}
      return {...e,n,rounds,out,extra:rec?.extra||0,buffs:rec?.instances||[],byChannels:sup,channelRows:(e.channels||[]).filter(c=>!c.once||c.count),effectLines:[...new Set(lines)]};
    }).sort((a,b)=>(a.kind===b.kind?0:a.kind==='wheel'?-1:1)||(b.extra+b.out.dmg)-(a.extra+a.out.dmg));
    const gearExtra=gearRows.reduce((n,g)=>n+g.extra+g.out.dmg,0);
    const stateRows=[...stateTotals.entries()].map(([id,t])=>({id,...t})).filter(x=>x.dmg>0).sort((a,b)=>b.dmg-a.dmg);
    // damage-over-time attribution (description-based): a bleed / poison / counter ... state's damage is credited to every equipped relic / wheel / covenant
    // whose text names that state and that does not already own it as a related state. Several candidates split the damage equally.
    const DOT_EN={'出血':'Bleed','中毒':'Poison','反击':'Counter','献祭':'Sacrifice','灼烧':'Burn','旧日余烬':'Ember'};
    const relicText=tid=>{const r=res.relic[String(tid)]||{};return pipeName(pickVariant(r.BattleDesc||r.Desc,0))||''};
    const dotCands=[...relicRows.map(r=>({o:r,text:relicText(r.tid),own:new Set((()=>{const rec=res.relic[r.tid]||{},a=[];for(const [k,v] of Object.entries(rec))if(/^State\d+$/.test(k)&&Array.isArray(v))a.push(...v.map(String));return a})())})),
      ...gearRows.map(g=>({o:g,text:(g.desc||'')+' '+(g.effectsEn||[]).map(x=>x.desc).join(' '),own:new Set([...g.related].map(String))}))];
    let dotAttr=0;
    for(const sr of stateRows){
      if(!(sr.dmg>0))continue;const nm=res.nameState(sr.id),en=DOT_EN[nm];
      const cs=dotCands.filter(c=>!c.own.has(String(sr.id))&&(c.text.includes(nm)||(en&&new RegExp('\\b'+en,'i').test(c.text))));
      if(!cs.length)continue;
      const share=sr.dmg/cs.length;
      for(const c of cs){c.o.dot=(c.o.dot||0)+share;(c.o.dotStates=c.o.dotStates||[]).push({id:sr.id,name:nm,dmg:share,shared:cs.length});dotAttr+=share}
    }
    const execCheck=evs=>{const withArg=evs.filter(e=>e.arg>0),mult=new Map();for(const e of withArg){const r=e.delta/e.arg,k=Math.round(r);if(k>=1&&Math.abs(r-k)<=0.005*k)mult.set(k,(mult.get(k)||0)+1)}const match=[...mult.values()].reduce((a,b)=>a+b,0);
      const by=new Map();for(const e of evs){if(!(e.atk>0&&e.tid))continue;const o=by.get(e.tid)||[];o.push(e.delta/(e.atk*(e.pf||1)));by.set(e.tid,o)}
      let n=0,err=0;for(const l of by.values()){const sorted=[...l].sort((a,b)=>a-b),med=sorted[Math.floor(sorted.length/2)];for(const v of l){n++;err+=Math.abs(v/med-1)}}
      return {withArg:withArg.length,match,mult:[...mult.entries()].sort((a,b)=>a[0]-b[0]),predN:n,predErr:n?err/n:null}};
    const ct=tl.counterLog?.get('team');
    const ctrRows=ct?{layerSumHp:ct.layerSumHp||0,layerSumT1:ct.layerSumT1||0,takenHp:ct.takenHp||0,taken:ct.taken,layerSum:ct.layerSum,avg:ct.taken?ct.layerSum/ct.taken:0,maxLayer:ct.maxLayer,extraTrig:ct.extraTrig,actualHits:ct.actualHits,actualDmg:ct.actualDmg,rounds:[...ct.rounds.entries()].sort((x,y)=>x[0]-y[0]),
      owners:[...new Set([...(tl.counterGain?.keys()||[]),...[...per.values()].filter(r=>r.src.get('state|3255')?.dmg>0).map(r=>String(r.a.uid))])].map(uid=>{const g=tl.counterGain?.get(uid)||{gain:0,init:0,bySrc:new Map()},a=actors.get(uid),r=per.get(uid);return {uid,name:a?.name||ui('队伍 / 无来源','Team'),a,gain:g.gain,init:g.init,bySrc:[...g.bySrc.values()].sort((x,y)=>y.gain-x.gain),dmg:r?.src.get('state|3255')?.dmg||0,extra:r?.src.get('state|3129')?.dmg||0}}).filter(x=>x.gain>0||x.dmg>0).sort((x,y)=>y.dmg-x.dmg||y.gain-x.gain),
      packDmg:[...per.values()].reduce((n,r)=>n+(r.src.get('state|3255')?.dmg||0),0)}:null;
    const execRows=[...(tl.execStates?.values()||[])].filter(r=>r.total>0||r.kills.length).map(r=>({sid:r.sid,total:r.total,caster:actors.get(String(r.caster)),bySrc:[...r.bySrc.values()].sort((a,b)=>b.gain-a.gain),byRound:[...r.byRound.entries()].sort((a,b)=>a[0]-b[0]),kills:r.kills,events:r.events,dmg:stateTotals.get(String(r.sid))?.dmg||0,check:execCheck(r.events)}));
    const roundDmgMap=new Map();for(const e of events){if(e.kind==='damage'&&actors.get(String(e.actorUid))?.camp===1)roundDmgMap.set(e.round,(roundDmgMap.get(e.round)||0)+(e.amount||0))}
    const roundDmg=[...roundDmgMap.entries()].sort((a,b)=>a[0]-b[0]);
    const typeDmg={skill:0,ulti:0,state:0,other:0};for(const r of per.values())for(const o of r.src.values()){if(!o.dmg)continue;if(o.typ==='skill')typeDmg.skill+=o.dmg;else if(o.typ==='utilSkill')typeDmg.ulti+=o.dmg;else if(o.typ==='state')typeDmg.state+=o.dmg;else typeDmg.other+=o.dmg}
    const mvp=(()=>{
      // ---- three categories: output / defence / support; every raw metric is listed in the expanded details -----------------
      const CAT_W={out:1,def:1,sup:1};
      const SUBW={def:{sh:40,mit:30,ctl:20,dr:10},sup:{key:1.5,ali:1.5,seal:.5,eng:1.5,vuln:1.5,buf:1.5,cut:1,draw:1,cyc:.5,realm:.5,emb:.5}};
      const roles=bd.roleData||[],attrOf=uid=>roles.find(x=>String(x.uid)===String(uid))?.attrs||{};
      const blank=()=>({aliSelf:0,aliOthers:0,key:0,energy:0,dr:0,rm:0,powerGain:0,critGain:0,critRateGain:0,basicGain:0,dbPts:0,dbN:0,dbTypes:new Map(),dbCls:{vuln:0,weak:0,frail:0,ctrl:0,dot:0,other:0},vulnExtra:0,embryo:0,embCards:0,seal:0,cut:0,draws:0,cycles:0,inspire:0,copies:0,costCut:0,ultCasts:0,prevented:0,prevTypes:new Map(),tenGain:0});
      const supOf=k=>tl.supStore?.get(k)||blank();
      const gradeOf=sc=>sc>=80?'S':sc>=65?'A':sc>=50?'B':sc>=35?'C':'D';
      const shareScore=(v,t,N)=>t>0?Math.min(100,100*(v/t)/(2/Math.max(1,N))):null;   // 2x the fair share of the class total = 100
      const dotRe=/中毒|出血|灼烧|侵蚀|腐蚀|燃烧|献祭|余烬/;
      const execIds=new Set((tl.execStates?[...tl.execStates.keys()]:[]).map(String));
      const stName=id=>res.nameState(id);
      // classify one stat-pack source entry into an output sub-metric
      const outKind=o=>{if(o.typ==='skill'||o.typ==='utilSkill')return 'dir';const id=String(o.id),nm=stName(id);if(id==='3255')return 'ctr';if(execIds.has(id))return 'exe';if(/触腕|怒涛/.test(nm))return 'ten';if(dotRe.test(nm))return 'dot';return 'oth'};
      const tenIds=[...stateTotals.keys()].filter(id=>/触腕|怒涛/.test(stName(id))),TD=tenIds.reduce((n,id)=>n+(stateTotals.get(id)?.dmg||0),0);
      const deathSaves=Number(bd.statistics?.DeathResistCount)||0;
      const vE=[...(tl.supStore?.values()||[])].reduce((n,v)=>n+v.vulnExtra,0);
      const sub=(sp,extra={})=>({
        key:sp.key,ali:sp.aliOthers+0.5*sp.aliSelf,seal:sp.seal,eng:sp.energy+sp.inspire+sp.costCut,vuln:vE>0?sp.vulnExtra:(sp.dbCls.vuln||0),buf:(extra.buf||0),cut:sp.cut+sp.costCut,draw:sp.draws,cyc:sp.cycles,realm:(extra.rm||0)+sp.rm,emb:sp.embryo+sp.embCards});
      // raw metrics of one entity -> {out:{...},def:{...},sup:{...}}
      const rawOf=(o)=>o; // placeholder to keep structure readable
      const rate=(items,{withEff=false}={})=>{
        const N=Math.max(1,items.filter(x=>x.outT>0||x.sh>0||x.mit>0||x.ctl>0||Object.values(x.sup).some(v=>v>0)).length);
        const T={out:0,sh:0,mit:0,ctl:0,dr:0,plays:0,energy:0};const TS={};
        for(const x of items){T.out+=x.outT;T.sh+=x.sh;T.mit+=x.mit;T.ctl+=x.ctl;T.dr+=x.dr;T.plays+=x.plays||0;T.energy+=x.energy||0;for(const k of Object.keys(SUBW.sup))TS[k]=(TS[k]||0)+(x.sup[k]||0)}
        for(const x of items){
          const so=shareScore(x.outT,T.out,N);
          const defS={sh:shareScore(x.sh,T.sh,N),mit:shareScore(x.mit,T.mit,N),ctl:shareScore(x.ctl,T.ctl,N),dr:shareScore(x.dr,T.dr,N)};
          const supS={};for(const k of Object.keys(SUBW.sup))supS[k]=shareScore(x.sup[k]||0,TS[k],N);
          const wmean=(sc,W)=>{let ws=0,s2=0;for(const k of Object.keys(W)){if(sc[k]==null)continue;ws+=W[k];s2+=W[k]*sc[k]}return ws?s2/ws:null};
          const cats={out:so,def:wmean(defS,SUBW.def),sup:wmean(supS,SUBW.sup)};
          let ws=0,sc=0;for(const k of Object.keys(CAT_W)){if(cats[k]==null)continue;ws+=CAT_W[k];sc+=CAT_W[k]*cats[k]}
          let base=ws?sc/ws:0,cs=0,pw=0,mod=1;
          if(withEff){const sh=(v,t)=>t>0?v/t:0;let w2=0;cs=0;const parts=[['out',sh(x.outT,T.out)],['def',sh(x.sh,T.sh)*0.5+sh(x.mit,T.mit)*0.3+sh(x.ctl,T.ctl)*0.2],['sup',Object.keys(SUBW.sup).reduce((a,k)=>a+(TS[k]>0?SUBW.sup[k]*(x.sup[k]||0)/TS[k]:0),0)/Math.max(1e-9,Object.keys(SUBW.sup).reduce((a,k)=>a+(TS[k]>0?SUBW.sup[k]:0),0))]];
            for(const [k,v] of parts){if(cats[k]==null)continue;cs+=CAT_W[k]*v;w2+=CAT_W[k]}cs=w2?cs/w2:0;
            pw=Math.max(0.05,T.plays>0?((x.plays/T.plays)+(T.energy>0?x.energy/T.energy:x.plays/T.plays))/2:0.25);
            mod=0.9+0.2*Math.min(1,Math.max(0,cs/pw)/2)}
          x.cats=cats;x.defS=defS;x.supS=supS;x.eff=withEff?{cs,pw,ratio:pw>0?cs/pw:0,mod}:null;x.base=base;x.score=Math.min(100,base*mod);x.grade=gradeOf(x.score)}
        return {T,TS,N};
      };
      // ---- awakeners
      const cand=[...per.values()].filter(r=>r.a.kind==='awakener');
      const drTotal=cand.reduce((n,r)=>n+(attrOf(r.a.uid).death_resist||0)+supOf('act:'+r.a.uid).dr,0);
      const awRaw=cand.map(r=>{const sp=supOf('act:'+r.a.uid),at=attrOf(r.a.uid),bf=tl.relicBuffs?.get('act:'+r.a.uid);
        const out={dir:0,dot:0,ctr:0,exe:0,ten:0,oth:0};for(const o of r.src.values())if(o.dmg>0)out[outKind(o)]+=o.dmg;
        const tg=cand.reduce((n,c)=>n+supOf('act:'+c.a.uid).tenGain,0);out.ten+=tg>0?TD*sp.tenGain/tg:0;   // tentacle damage is dealt by the team: credit by tentacle bonus raised
        const drv=(at.death_resist||0)+sp.dr,drShare=drTotal>0?drv/drTotal:0;
        const rep=r.dmg;
        return {r,out,outT:Object.values(out).reduce((a,b)=>a+b,0),sh:r.block+1.2*r.heal+0.5*(sp.maxHp||0),maxHp:sp.maxHp||0,ampTypes:[...(sp.ampTypes||new Map()).entries()].map(([n,v])=>({n,v})),block:r.block,heal:r.heal,mit:sp.prevented,prevTypes:[...sp.prevTypes.entries()].map(([n,v])=>({n,v})),ctl:(sp.dbCls.ctrl||0)*3+(sp.dbCls.weak||0)*2+(sp.dbCls.frail||0)*2,dbCls:sp.dbCls,dbTypes:[...sp.dbTypes.entries()].map(([n,o])=>({n,k:o.k,c:o.n})),
          dr:drv+deathSaves*drShare*100,drBase:drv,saves:deathSaves*drShare,
          sup:sub(sp,{buf:(bf?.extra||0),rm:at.occupation_master||0}),bufPower:bf?.instances?.filter(i=>i.kind==='power').reduce((n,i)=>n+i.extra,0)||0,bufCrit:bf?.instances?.filter(i=>i.kind==='crit'||i.kind==='critrate').reduce((n,i)=>n+i.extra,0)||0,vulnExtra:sp.vulnExtra,
          powerGain:sp.powerGain,critGain:sp.critGain,critRateGain:sp.critRateGain,inspire:sp.inspire,costCut:sp.costCut,copies:sp.copies,ultCasts:sp.ultCasts,tenGain:sp.tenGain,embCards:sp.embCards,plays:r.plays,energy:r.energy,aliOthers:sp.aliOthers,aliSelf:sp.aliSelf,engBase:sp.energy,cutBase:sp.cut}});
      const awMeta=rate(awRaw,{withEff:true});
      const awRows=awRaw.filter(o=>o.outT>0||o.sh>0||o.plays>0||Object.values(o.sup).some(v=>v>0)).sort((a,b)=>b.score-a.score).map(o=>({r:o.r,score:o.score,grade:o.grade,cats:o.cats,x:o,share:totalDmg?o.r.dmg/totalDmg:0}));
      // ---- wheels / covenants / relics (same categories, rated inside their own class)
      const itemRaw=(sp,direct,buf,block,heal)=>{const out={dir:0,dot:0,ctr:0,exe:0,ten:0,oth:direct.oth||0};out.dir=direct.dir||0;out.dot=direct.dot||0;
        return {out,outT:out.dir+out.dot+out.oth,sh:block+1.2*heal,block,heal,mit:sp.prevented,prevTypes:[...sp.prevTypes.entries()].map(([n,v])=>({n,v})),ctl:(sp.dbCls.ctrl||0)*3+(sp.dbCls.weak||0)*2+(sp.dbCls.frail||0)*2,dbCls:sp.dbCls,dbTypes:[...sp.dbTypes.entries()].map(([n,o])=>({n,k:o.k,c:o.n})),dr:sp.dr,sup:sub(sp,{buf}),inspire:sp.inspire,costCut:sp.costCut,vulnExtra:sp.vulnExtra,aliOthers:sp.aliOthers,aliSelf:sp.aliSelf,engBase:sp.energy,cutBase:sp.cut}};
      const gearItems=kind=>gearRows.filter(g=>g.kind===kind).map(g=>({g,val:g.extra+g.out.dmg+(g.dot||0),...itemRaw(supOf('gear:'+g.key),{dir:g.out.dmg,dot:g.dot||0},g.extra||0,g.out.block,g.out.heal)}));
      const wheelItems=gearItems('wheel'),covItems=gearItems('covenant');
      const relicItems=relicRows.map(r=>({r,val:r.dmg+(r.buff?.extra||0)+(r.dot||0),...itemRaw(supOf('rel:'+r.tid),{dir:r.dmg,dot:r.dot||0},r.buff?.extra||0,r.block,r.heal)}));
      rate(wheelItems);rate(covItems);rate(relicItems);
      const best=(l,n)=>[...l].sort((a,b)=>b.score-a.score||(b.val||0)-(a.val||0)||((b.g||b.r).n-(a.g||a.r).n)).slice(0,n);
      // ---- keeper (the player): keyflare choices, battle efficiency, and whether card plays were the best available
      const keeper=(()=>{
        const pl=tl.playLog||[],kinds=new Map();
        const cardPlays=pl.filter(p=>p.kind==='card'&&actors.get(String(p.owner))?.kind==='awakener');
        const typeOf=tid=>asList(res.skill[String(tid)]?.Type)[0]||'';
        const byTid=new Map(),byType=new Map();
        for(const p of cardPlays){const k=String(p.tid),v=byTid.get(k)||{n:0,dmg:0,def:0};v.n++;v.dmg+=p.dmg;v.def+=p.block+1.2*p.heal;byTid.set(k,v);
          const t=typeOf(p.tid),w=byType.get(t)||{n:0,dmg:0,def:0};w.n++;w.dmg+=p.dmg;w.def+=p.block+1.2*p.heal;byType.set(t,w)}
        const avg=(tid)=>{const v=byTid.get(String(tid));if(v&&v.n)return {d:v.dmg/v.n,f:v.def/v.n,known:true};const w=byType.get(typeOf(tid));return w&&w.n?{d:w.dmg/w.n,f:w.def/w.n,known:false}:{d:0,f:0,known:false}};
        const costOf=(tid,c)=>{const v=c!=null?Number(c):Number(res.skill[String(tid)]?.Cost);return Number.isFinite(v)&&v>0?Math.round(v):0};
        // knapsack per round: with the same hand and energy budget, what was the best achievable damage / defence versus what was played
        const rounds=new Map();for(const p of cardPlays){const r=rounds.get(p.round)||{played:[],spent:0};r.played.push(p);r.spent+=costOf(p.tid,p.cost);rounds.set(p.round,r)}
        const knap=(items,B,key)=>{const dp=new Array(B+1).fill(0);for(const it of items){const c=it.c;if(c>B)continue;for(let b=B;b>=c;b--)dp[b]=Math.max(dp[b],dp[b-c]+it[key])}return dp[B]};
        let sumAD=0,sumOD=0,sumAF=0,sumOF=0;const rrows=[];
        for(const [rd,r] of [...rounds.entries()].sort((a,b)=>a[0]-b[0])){
          const end=tl.roundEnd?.get(rd);if(!end)continue;
          const B=Math.min(30,r.spent+Math.max(0,Math.round(end.energy||0)));
          const items=[...r.played.map(p=>({tid:p.tid,c:costOf(p.tid,p.cost),played:true})),...(end.hand||[]).filter(h=>actors.get(String(tl.ent.cards.get(String(h.uid))?.ownerUid))?.kind==='awakener'&&!r.played.some(p=>String(p.cardUid)===String(h.uid))).map(h=>({tid:h.tid,c:costOf(h.tid,h.cost),played:false}))].map(it=>{const a=avg(it.tid);return {...it,d:a.d,f:a.f}});
          const aD=items.filter(i=>i.played).reduce((n,i)=>n+i.d,0),aF=items.filter(i=>i.played).reduce((n,i)=>n+i.f,0),oD=Math.max(aD,knap(items,B,'d')),oF=Math.max(aF,knap(items,B,'f'));
          sumAD+=aD;sumOD+=oD;sumAF+=aF;sumOF+=oF;rrows.push({round:rd,budget:B,hand:items.length,played:r.played.length,aD,oD,aF,oF});
        }
        const rD=sumOD>0?sumAD/sumOD:null,rF=sumOF>0?sumAF/sumOF:null,rs=[rD,rF].filter(v=>v!=null);
        const playScore=rs.length?100*rs.reduce((a,b)=>a+b,0)/rs.length:null;
        // keyflare choice quality: realised value of the chosen skill versus the best known alternative
        const kp=pl.filter(p=>p.kind==='keeper'),cnt=Math.max(1,cardPlays.length);
        const D0=cardPlays.reduce((n,p)=>n+p.dmg,0)/cnt||1,F0=cardPlays.reduce((n,p)=>n+p.block+1.2*p.heal,0)/cnt||1,U0=cardPlays.reduce((n,p)=>n+p.eng+p.ali*0.05+p.draw,0)/cnt||1;
        const kv=new Map();for(const p of kp){const k=String(p.tid),v=kv.get(k)||{n:0,val:0,dmg:0,def:0,util:0};v.n++;v.dmg+=p.dmg;v.def+=p.block+1.2*p.heal;v.util+=p.eng+p.ali*0.05+p.draw;v.val+=p.dmg/D0+(p.block+1.2*p.heal)/F0+(p.eng+p.ali*0.05+p.draw)/U0;kv.set(k,v)}
        const val=tid=>{const v=kv.get(String(tid));return v&&v.n?v.val/v.n:null};
        const picks=(tl.keeperPicks||[]).filter(pk=>pk.options.length>=2&&pk.chosen!=null).map(pk=>{const cv=val(pk.chosen),known=pk.options.map(o=>({tid:o,v:val(o)})).filter(x=>x.v!=null),best=known.reduce((m,x)=>Math.max(m,x.v),0);return {round:pk.round,chosen:pk.chosen,options:pk.options,cv,best,bestTid:known.find(x=>x.v===best)?.tid,ratio:cv!=null&&best>0?Math.min(1,cv/best):null}});
        const pr=picks.filter(x=>x.ratio!=null),pickScore=pr.length?100*pr.reduce((n,x)=>n+x.ratio,0)/pr.length:null;
        // battle efficiency: energy not wasted, hand not discarded, no overflow
        const waste=[...(tl.roundEnd?.values()||[])].reduce((n,e)=>n+Math.max(0,e.energy||0),0),spent=cardPlays.reduce((n,p)=>n+costOf(p.tid,p.cost),0);
        const st0=bd.statistics||{},disc=Number(st0.EndBoutDiscardCount)||0,used=Number(st0.UsedCardCount)||cardPlays.length,over=Number(st0.OverFlowEnergy)||0,cons=Number(st0.ConsumeEnergy)||spent;
        const e1=spent+waste>0?spent/(spent+waste):null,e2=used+disc>0?used/(used+disc):null,e3=cons+over>0?cons/(cons+over):null,es=[e1,e2,e3].filter(v=>v!=null),effScore=es.length?100*es.reduce((a,b)=>a+b,0)/es.length:null;
        const parts=[['pick',pickScore],['eff',effScore],['play',playScore]],ok=parts.filter(x=>x[1]!=null),score=ok.length?ok.reduce((n,x)=>n+x[1],0)/ok.length:null;
        return {score,grade:score==null?'—':gradeOf(score),pickScore,effScore,playScore,picks,rrows,rD,rF,eff:{e1,e2,e3,waste,spent,disc,used,over,cons},kv:[...kv.entries()].map(([tid,v])=>({tid,n:v.n,val:v.val/v.n,dmg:v.dmg/v.n,def:v.def/v.n,util:v.util/v.n})),kpSup:supOf('kp')};
      })();
      // ---- merged scoring model (morimens-replay-scoring.js): semantic gear value, role-adaptive awakeners, keeper decision quality
      const SC=window.MorimensReplayScoring;
      if(SC){try{
        for(const list of [wheelItems,covItems])for(const row of SC.scoreGear(list,tl,totalDmg||1)){const it=list.find(x=>x.g===row.g);if(it){it.score=row.enhancedScore;it.grade=row.enhancedGrade;it._sm=row._sm;it.cats=row.enhancedCats}}
        for(const o of SC.scoreAwakeners({awakeners:awRows})){o.ref.score=o.score;o.ref.grade=o.grade;o.ref.cats=o.cats;o.ref.enh={role:o.role,roleLabel:o.roleLabel,features:o.features,eff:o.eff}}
        awRows.sort((a,b)=>b.score-a.score);
        const sid=String(bd.stageId??''),st0=res.rr?.Stage?.[sid]||{},refKey=sid,refList=stageRef?.[refKey]||stageRef?.['n:'+pipeName(st0.Name||'')]||null;
        const v2=SC.scoreKeeperV2({keeper,awakeners:awRows},tl,refList);
        if(v2&&v2.score!=null){keeper.v2=v2;keeper.score=v2.score;keeper.grade=v2.grade;keeper.enh=true}
      }catch(e){console.warn('Replay scoring model failed; keeping the base ratings',e)}}
      return {keeper,awakeners:awRows,model:{CAT_W,SUBW,N:awMeta.N,totals:awMeta.T,sub:awMeta.TS,deathSaves,TD},wheels:best(wheelItems,6),covenants:best(covItems,6),relics:best(relicItems,8)};
    })();
    return {roundDmg,typeDmg,mvp,ctrRows,execRows,dotAttr,per:[...per.values()],totalDmg,totalPlays,totalEnergy,draws,discards,exhausts,awakenOrder,ultiOrder,keeperUses:keeperUses.length,keeperRows,relicRows,relicDmg,gearRows,gearExtra,buffExtra,powerGain,basicGain,stateRows,havePacks,rounds:tl.rounds.length,picks:tl.keeperPicks||[]};
  }
  const fold=(title,html,open=false)=>html?`<details class="mr2fold"${open?' open':''}><summary>${title}</summary>${html}</details>`:'';
  const pctOf=(a,b)=>b>0?Math.round(a/b*1000)/10:0;
  const dotChip=(o,total)=>o.dot>0?`<span class="mr2dotchip" title="${esc(ui('按效果文本匹配的持续伤害（出血/中毒/反击等）：回放不记录该状态由谁施加，多个来源时平均分摊，仅供参考','DoT matched from effect text; the replay does not record who applied the state, shared equally between candidates - indicative only'))}"><small>${ui('持续伤害（文本推测）','DoT (text-matched)')}</small> <b>${fmt(Math.round(o.dot))}</b>${total?` <em>${pctOf(o.dot,total)}%</em>`:''} <small>${esc(o.dotStates.map(x=>x.name+(x.shared>1?`÷${x.shared}`:'')).join(' / '))}</small></span>`:'';
  const bar=(frac,cls='')=>`<span class="mr2sbar ${cls}"><i style="width:${Math.max(0,Math.min(100,frac*100)).toFixed(1)}%"></i></span>`;
  function renderCalib(tl){
    const c=tl.calib;if(!c||!c.report.length)return '';
    const pc=v=>v==null?'—':`${(v*100).toFixed(1)}%`;
    const rows=c.report.map(r=>{
      const critOk=r.crit.filter(x=>Math.abs(x.got/x.want-1)<.01).length;
      return `<div class="mr2crow"><b>${esc(r.name)}${r.confident?'':`<small class="lowc">${ui('样本不足','low sample')}</small>`}</b><span>${r.hits}<small>${ui('次命中','hits')} · ${r.contexts} ${ui('种条件','ctx')}${r.blindN||r.trimmed?` · ${ui(`已排除 ${r.blindN?`致盲 ${r.blindN} 次`:''}${r.blindN&&r.trimmed?'、':''}${r.trimmed?`离群 ${r.trimmed} 个`:''}`,`excluded ${r.blindN||0} blind / ${r.trimmed||0} outliers`)}`:''}</small></span><span>${r.m==null?'—':`×${r.m.toFixed(2)}`}<small>${ui('拟合力量倍率','fitted STR mult')}${r.mOld!=null?` · ${ui(`未计分类池 ×${r.mOld.toFixed(2)}`,`no scoped pools ×${r.mOld.toFixed(2)}`)}`:''}</small></span><span class="${r.calcErr!=null&&r.meanErr!=null&&r.calcErr>r.meanErr*1.5?'bad':''}">${pc(r.calcErr)}<small>${ui('计算器默认 ×1 误差','calc ×1 error')}</small></span><span class="${r.meanErr!=null&&r.meanErr<.1?'good':''}">${pc(r.meanErr)}<small>${ui('拟合后误差','fitted error')}</small></span><span>${r.crit.length?`${critOk}/${r.crit.length}`:'—'}<small>${ui('暴击倍率精确吻合组数','exact crit pairs')}</small></span></div>`+(r.arg&&(r.arg.match==null||r.arg.match>=.5)?`<div class="mr2crow arg"><b><small>${ui('卡面伤害核对','Card-face check')}</small></b><span>${r.arg.hits}<small>${ui('次出牌命中','card hits')} · ${r.arg.ctx} ${ui('种条件','ctx')}${r.arg.trimmed?` · ${ui(`离群 ${r.arg.trimmed} 个`,`${r.arg.trimmed} outliers`)}`:''}</small></span><span>${r.arg.m==null?'—':`×${r.arg.m.toFixed(2)}`}<small>${ui('拟合力量倍率','fitted STR mult')}</small></span><span class="${r.arg.calcErr!=null&&r.arg.calcErr<.1?'good':r.arg.calcErr>.2?'bad':''}">${pc(r.arg.calcErr)}<small>${ui('计算器默认 ×1 误差','calc ×1 error')}</small></span><span class="${r.arg.mean!=null&&r.arg.mean<.1?'good':''}">${pc(r.arg.mean)}<small>${ui('拟合后误差','fitted error')}</small></span><span>${r.arg.match==null?'—':pc(r.arg.match)}<small>${ui('卡面值 = 实际伤害 占比','face = dmg share')}</small></span></div>`:'');
    }).join('');
    const fitted=c.report.filter(r=>r.m!=null&&r.confident),ms=fitted.map(r=>r.m).sort((a,b)=>a-b),med=ms.length?ms[Math.floor(ms.length/2)]:null,mo=fitted.filter(r=>r.mOld!=null).map(r=>r.mOld).sort((a,b)=>a-b),oldMed=mo.length?mo[Math.floor(mo.length/2)]:null;
    const critAll=c.report.flatMap(r=>r.crit),critExact=critAll.filter(x=>Math.abs(x.got/x.want-1)<.01).length;
    const vBetter=fitted.filter(r=>r.meanErr!=null&&r.meanErrNoVuln!=null&&r.meanErr<r.meanErrNoVuln).length;
    const lines=[
      !critAll.length?null:(critExact/critAll.length>=.85?`✓ ${ui(`暴击：伤害 = 非暴击 × (1 + 暴击伤害%)，在 ${critAll.length} 组同条件命中中有 ${critExact} 组精确成立（偏差 <1%）${critAll.length>critExact?'；其余个别组可能是该次命中被护盾抵挡/溢出等拆分了伤害':''}`,`Crit: ×(1 + crit damage%) holds exactly in ${critExact}/${critAll.length} same-context pairs`)}`:`✗ ${ui(`暴击倍率只有 ${critExact}/${critAll.length} 组与 1 + 暴击伤害% 吻合`,`Crit multiplier matches 1 + crit damage% in only ${critExact}/${critAll.length} pairs`)}`),
      med==null?(c.report.some(r=>r.m!=null)?`△ ${ui('可拟合的角色样本太少（需要至少 3 种力量取值且条件数多于技能数），暂不下结论','Too few contexts to conclude')}`:null):`${Math.abs(med-1)>.3?'✗':'✓'} ${ui(`力量倍率：计入分类基伤池（卡牌 / 打击 / 追击 / 爆发）和终伤池（局内伤害、对首领增伤）后，${oldMed&&Math.abs(oldMed-med)>.1*med?`拟合力量倍率由约 ×${oldMed.toFixed(2)} 降到 ×${med.toFixed(2)}`:`拟合力量倍率约 ×${med.toFixed(2)}`}（计算器默认 ×1）。${Math.abs(med-1)>.3?'剩余差距可能来自触腕/其他加算项或未识别的乘区。':'与计算器默认基本一致。'}`,`Strength multiplier: with scoped base pools and final pools the fit drops from ×${(oldMed||med).toFixed(2)} to ×${med.toFixed(2)} (calculator: ×1).`)}`,
      fitted.length?(vBetter>=Math.ceil(fitted.length/2)?`✓ ${ui('易伤：对带易伤的目标按 ×(1 + 易伤增幅) 计入后拟合更准','Vulnerability ×(1 + amp) improves the fit')}`:`? ${ui('易伤乘区本场无法确认（样本不足或已被其他乘区吸收）','Vulnerability could not be confirmed on this sample')}`):null,
      fitted.length?`${fitted.every(r=>r.meanErr<.1)?'✓':'△'} ${ui('公式顺序（攻击力×系数×基伤池 → +力量 → ×易伤 → ×暴击）拟合后平均误差','Formula order fits with mean error ')}${pc(fitted.reduce((a,r)=>a+r.meanErr,0)/fitted.length)}${fitted.some(r=>r.maxErr>.2)?ui('，个别条件偏差超过 20%，说明还有未建模的乘区（如终伤池、伤害强效、状态加成）','; some contexts deviate >20%: unmodelled multipliers'):''}`:null,
      ...(()=>{const ar=c.report.filter(r=>r.arg&&r.arg.m!=null&&r.arg.match!=null&&r.arg.match>=.5);if(!ar.length)return [];const ms2=ar.map(r=>r.arg.m).sort((a,b)=>a-b),md=ms2[Math.floor(ms2.length/2)];return [`${Math.abs(md-1)>.3?'✗':'✓'} ${ui(`卡面伤害核对（不含暴击/易伤，更直接）：${ar.length} 名角色的出牌卡面值与实际伤害一致，拟合力量倍率中位数 ×${md.toFixed(2)}，计算器默认 ×1 的平均误差 ${pc(ar.reduce((a,r)=>a+r.arg.calcErr,0)/ar.length)}`,`Card-face check: median fitted STR mult ×${md.toFixed(2)}`)}`]})()
    ].filter(Boolean);
    return `<div class="mr2ssec"><h5>${ui('伤害公式校验（用本场每次命中拟合）','Damage formula check (fitted on this replay)')}</h5>
      <div class="mr2crow head"><b>${ui('角色','Awakener')}</b><span>${ui('样本','Sample')}</span><span>${ui('力量倍率','STR mult')}</span><span>${ui('按计算器 ×1','Calc ×1')}</span><span>${ui('拟合后','Fitted')}</span><span>${ui('暴击','Crit')}</span></div>${rows}
      <div class="mr2calib">${lines.map(l=>`<div>${esc(l)}</div>`).join('')}<small>${ui('说明：狂气爆发的伤害使用独立的力量/暴击修正，这里不参与拟合；上面的造物额外伤害已改用拟合出的力量倍率重新折算。样本越多、力量取值越分散，拟合越可信；狂气爆发的力量倍率按角色的 ulti_strength_multiple 估算，未经本场数据验证。','Ultimates use separate strength/crit modifiers and are excluded from the fit. The relic damage above uses the fitted multipliers.')}</small></div></div>`;
  }
  // human-readable effect of a trigger command (looked up in the replay's Cmd table)
  // what a wheel / covenant trigger command does, read from the command's own data list (amount from the trigger parameter when it can be evaluated)
  const CMD_LABEL={BEGainUltiEnergy:['狂气','Aliemus'],BEChangeKeeperEnergy:['银钥能量','Keyflare'],BEGainKeeperEnergy:['银钥能量','Keyflare'],BEChangeEnergy:['算力','Energy'],BEHeal:['治疗','Heal'],BEGainBlock:['护盾','Shield'],BEDrawCard:['抽牌','Draw'],BEScarletBloodChange:['胚胎融合','Embryo fusion'],BEChangeTentacleCount:['触手数量','Tentacles'],BEChangeMaxTentacleCount:['触手上限','Tentacle cap']};
  const BUFF_NAME={basic:['基础伤害','Base damage'],critrate:['暴击率','Crit rate'],crit:['暴击伤害','Crit damage'],final:['最终伤害','Final damage'],out:['伤害加成','Damage bonus']};
  function gearEffectLines(res,e,ch,cnt){
    const cmd=res.rr?.Cmd?.[String(ch.cmd)];if(!cmd)return [];
    const params=e.mainStates[0]?.params||[],out=[];
    const paras=String(ch.para??'').split(',').map(x=>x.trim());
    const evalExpr=expr=>{if(expr==null)return null;let t=String(expr).replace(/\bArg(\d+)\b/g,(m,n)=>paras[Number(n)-1]??'#');t=t.replace(/StateArg(\d+)/g,(m,n)=>params[Number(n)-1]??'#');return /#|[A-Za-z_]/.test(t.replace(/Math\.\w+/g,''))?null:evalNum(t,{})};
    for(const dl of cmd.data_list||[]){
      const lab=CMD_LABEL[dl.Type];
      if(lab){const v=evalExpr(dl.Para);const sign=dl.Type==='BEChangeKeeperEnergy'||dl.Type==='BEChangeEnergy'?'':'+';out.push(v!=null?`${ui(lab[0],lab[1])} ${v>=0?sign:''}${fmt(v)}${cnt>1?` × ${cnt} = ${fmt(v*cnt)}`:''}`:ui(`${lab[0]}（随层数 / 状态变化）`,`${lab[1]} (scales with state)`))}
      else if(dl.Type==='BECreateCard'||dl.Type==='BECreateCardWithOwner')out.push(ui('生成卡牌','Create card'));
      else if(dl.Type==='BECopyCard')out.push(ui('复制卡牌','Copy card'));
      else if(dl.Type==='BEAddState'){const sid=String(dl.Para).split(',')[0].trim();if(/^\d+$/.test(sid)&&res.state[sid]&&!['2900','3130','3902'].includes(sid)&&res.state[sid].ShowType!=='Hide')out.push(ui(`施加「${res.nameState(sid)}」`,`Apply ${res.nameState(sid)}`))}
      else if(/^BEChangeAttr\./.test(dl.Type)){const pr=dl.Type.split('.')[1];const v=evalExpr(dl.Para);out.push(`${statName(res,pr)}${v!=null?` ${v>=0?'+':''}${fmt(v)}${cnt>1?` × ${cnt}`:''}`:''}`)}
    }
    return out;
  }
  // support output a gear / relic produced (aliemus, keyflare energy, energy, draws, cost cuts, death resist ...) from the per-source ledger
  function supChips(tl,key){
    const sp=tl.supStore?.get(key);if(!sp)return '';const r=x=>Math.round(x*10)/10,o=[];
    const add=(v,l,c)=>{if(v>=0.5)o.push(`<em class="${c||'n'}">${l} +${fmt(r(v))}</em>`)};
    add(sp.aliSelf+sp.aliOthers,ui('狂气','Aliemus'));add(sp.key,ui('银钥能量','Keyflare'));add(sp.energy,ui('行动力','Energy'));add(sp.dr,ui('死亡抵抗','Death resist'));
    add(sp.powerGain,ui('力量','Power'));add(sp.draws,ui('抽牌','Draws'));add(sp.cut,ui('费用减免','Cost cut'));add(sp.seal,ui('黑印','Seals'));add(sp.embryo,ui('胚胎','Embryo'));add(sp.rm,ui('职业资源','Resource'));
    if(sp.dbN>0)o.push(`<em class="n">${ui('减益','Debuffs')} ${fmt(r(sp.dbN))}</em>`);
    return o.join('')}
  function renderGear(st,tl){
    if(!st.gearRows.length)return '';
    const res=tl.res,total=st.totalDmg;
    const ownerChips=g=>g.owners.map(u=>tl.chip(u)).join('');
    const staticChips=g=>g.statics.map(x=>`<span class="mr2stat pos" title="${esc(x.prop)}">${esc(statName(res,x.prop))} +${esc(fmtStat(x.prop,x.val))}</span>`).join('');
    const outChips=g=>`${g.out.dmg?`<em class="d">${ui('伤害','DMG')} ${fmt(g.out.dmg)}</em>`:''}${g.out.block?`<em class="b">${ui('护盾','Shield')} ${fmt(g.out.block)}</em>`:''}${g.out.heal?`<em class="h">${ui('治疗','Heal')} ${fmt(g.out.heal)}</em>`:''}`;
    const dynLines=g=>{
      const by=new Map(),seen=new Set();for(const i of g.buffs||[]){if(!(i.round>0)&&!i.temp)continue;const k=`${i.kind}|${i.prop||''}`,tk=`${k}|${i.time}`;const o=by.get(k)||{kind:i.kind,prop:i.prop,sum:0,n:0,extra:0,temp:i.temp};o.extra+=i.extra;if(!seen.has(tk)){seen.add(tk);o.sum+=i.gain;o.n++}by.set(k,o)}
      const nm={power:ui('临时力量','Temp power'),crit:ui('暴击伤害','Crit damage'),final:ui('最终伤害','Final dmg'),out:ui('基础伤害','Base dmg'),in:ui('基础伤害','Base dmg')};
      return [...by.values()].map(o=>`${o.prop?statName(res,o.prop):(nm[o.kind]||o.kind)} ${o.kind==='power'?'+':'+'}${fmt(Math.round(o.sum*10)/10)}${o.kind==='power'?'':'%'}${ui(`（累计 ${o.n} 次${o.temp?'，临时':''}）`,` (${o.n}× total)`)}`);
    };
    const card=g=>{
      const isW=g.kind==='wheel',kindTag=isW?ui('命轮','Wheel'):ui('密契','Covenant');
      const counters=[...(g.stateGain?.entries()||[])].sort((a,b)=>b[1].n-a[1].n).map(([sid,o])=>`<div class="mr2srow inst"><span class="mr2sname">${esc(res.nameState(sid))}<small>${ui('内部计数状态','Internal counter')} #${esc(sid)}</small></span><span>${o.init!=null?ui(`开局 ${fmt(o.init)}`,`start ${fmt(o.init)}`):''}${o.n?` → ${ui(`当前 ${fmt(o.last)}`,`now ${fmt(o.last)}`)}`:''}</span><b>${o.n?`+${fmt(o.gain)}`:'—'}</b><small>${o.n?ui(`${o.n} 次增加（第 ${[...o.rounds].join('/')} 回合）`,`${o.n} increments`):ui('本场未增加','no change')}</small></div>`).join('');
      const eff=isW?(g.desc?`<div class="mr2gdesc">${esc(g.desc)}</div>`:''):g.effectsEn.map(e=>`<div class="mr2gdesc"><b>${esc(e.pieces)} ${ui('件','pc')}</b> ${esc(e.desc)}</div>`).join('');
      const hasBuff=g.extra>0;
      return `<div class="mr2gcard ${isW?'wheel':'cov'}"${g.desc||g.effectsEn.length?tipAttr(`${g.name}${g.en?` · ${g.en}`:''}`,kindTag,isW?g.desc:g.effectsEn.map(e=>`${e.pieces}${ui('件','pc')}：${e.desc}`).join('\n')):''}>
        <div class="mr2ghead">${ico(g.icon,g.name,`gi ${isW?'':'cov'}`)}<div class="mr2gtitle"><b>${esc(g.name)}</b><small>${g.en?esc(g.en):''}${g.rarity?` · ${esc(g.rarity)}`:''}</small></div><span class="mr2tag ${isW?'wheelTag':'covTag'}">${kindTag}</span><span class="mr2gowners">${ownerChips(g)}</span></div>
        <div class="mr2gmetrics"><span><small>${ui('触发次数','Triggers')}</small><b>${g.n}</b><em>${g.rounds.length?ui(`第 ${g.rounds.join('/')} 回合`,`R${g.rounds.join('/')}`):ui('仅开局生效','Static')}${g.byChannels?'':ui(' · 按相关状态计','')}</em></span>
          ${g.extra||g.out.dmg?`<span class="hot"><small>${ui('估算额外伤害','Est. extra DMG')}</small><b>${fmt(Math.round(g.extra+g.out.dmg))}</b><em>${total?pctOf(g.extra+g.out.dmg,total):0}%</em></span>`:''}
          ${g.dot>0?`<span class="hot">${dotChip(g,total)}</span>`:''}
          ${g.out.block||g.out.heal?`<span><small>${ui('护盾 / 治疗','Shield / Heal')}</small><b>${fmt(g.out.block)}</b><em>${fmt(g.out.heal)}</em></span>`:''}</div>
        ${g.byChannels&&g.channelRows.length?`<div class="mr2flow">${[...new Map(g.channelRows.filter(c=>c.count).map(c=>[c.label,c])).values()].map(c=>`<span class="mr2tag trig" title="${esc(c.cap?ui(`每回合最多 ${c.cap} 次`,`max ${c.cap}/round`):'')}">${esc(c.label)} ×${c.count}${c.cap?` <small>${ui(`限 ${c.cap}/回合`,`cap ${c.cap}/r`)}</small>`:''}</span>`).join('')}</div>`:''}
        ${g.effectLines.length||dynLines(g).length?`<div class="mr2geff">${[...g.effectLines,...dynLines(g)].map(l=>`<span>${esc(l)}</span>`).join('')}</div>`:''}
        ${g.statics.length?`<div class="mr2flow">${staticChips(g)}</div>`:''}
        ${outChips(g)||supChips(tl,'gear:'+g.key)?`<div class="mr2sout">${outChips(g)}${supChips(tl,'gear:'+g.key)}</div>`:''}
        <details class="mr2minor"><summary>${ui('效果说明与触发明细','Effect text & trigger breakdown')}</summary>${eff||`<div class="mr2empty">${ui('（回放中没有该装备的效果文本）','(no effect text in the replay)')}</div>`}${!isW&&g.effectsEn.length?`<small class="mr2from">${ui('密契效果文本来自站内数据（英文）；回放只记录套装效果状态是否生效，不记录具体件数。','Covenant text comes from site data; the replay only records whether the set-effect state is active.')}</small>`:''}${counters?`<div class="mr2srcs">${counters}</div>`:''}</details>
      </div>`;
    };
    const wheels=st.gearRows.filter(g=>g.kind==='wheel'),covs=st.gearRows.filter(g=>g.kind==='covenant');
    return `<div class="mr2ssec"><h5>${ui('命轮与密契','Wheels & covenants')}${st.gearExtra?` <em class="mr2hot">${ui('估算额外伤害合计','Est. extra DMG')} ${fmt(Math.round(st.gearExtra))}${st.totalDmg?` (${pctOf(st.gearExtra,st.totalDmg)}%)`:''} <small>${ui('各项独立估算、彼此重叠，不可当作可相加的份额','independent, overlapping estimates')}</small></em>`:''}</h5>
      ${wheels.length?`<div class="mr2gsub">${ui('命轮','Wheels')} ${wheels.length}</div><div class="mr2gcards">${wheels.map(card).join('')}</div>`:''}
      ${covs.length?`<div class="mr2gsub">${ui('密契套装','Covenant sets')} ${covs.length}</div><div class="mr2gcards">${covs.map(card).join('')}</div>`:''}
      <small class="mr2from">${ui('触发次数 = 按装备状态里记录的触发条件（打出卡牌 / 释放钥令 / 回合开始或结束 / 爆发后等）在回放里发生的次数，并遵守“每回合最多 N 次”；无法识别触发条件的装备才退回按相关状态层数增加计；额外伤害 = 其静态加成（基伤 / 暴击伤害 / 力量等）按上方拟合的伤害公式折算，加上统计包记录在其状态上的伤害，属估算。动态触发的临时增益（如“打出卡牌后获得临时力量”）只统计触发次数，未折算伤害。','Triggers = distinct moments a related state gains layers. Extra damage = static bonuses valued through the fitted formula plus stat-pack damage on its states (estimate). Dynamic temporary buffs only count triggers.')}</small></div>`;
  }
  function renderStats(full,tl){
    const st=computeStats(full,tl),res=tl.res;if(!st.per.length&&!st.relicRows.length)return '';
    const srcName=o=>o.typ==='state'?res.nameState(o.id):res.nameSkill(o.id);
    const maxDmg=Math.max(1,...st.per.map(r=>r.dmg));
    const people=st.per.sort((x,y)=>(x.a.kind==='keeper'?-1:0)-(y.a.kind==='keeper'?-1:0)).map(r=>{
      const a=r.a,isK=a.kind==='keeper';
      const srcs=[...r.src.values()].sort((x,y)=>(y.dmg+y.block+y.heal)-(x.dmg+x.block+x.heal));
      const top=Math.max(1,...srcs.map(o=>o.dmg||o.block||o.heal));
      const types=[...r.types.entries()].map(([k,v])=>`<span class="mr2tag">${esc(k)} ×${v}</span>`).join('');
      return `<div class="mr2scard">
        <div class="mr2shead">${ico(a.icon,isK?'守':a.name,`av ${isK?'keeper':''}`)}<b>${esc(a.name)}</b>${r.awake?`<span class="mr2tag awake" title="${esc(ui('灵知觉醒顺位','Awakening order'))}">${ui(`第 ${r.awake.order} 个觉醒 · 第 ${r.awake.round} 回合`,`Awakened #${r.awake.order} · R${r.awake.round}`)}</span>`:(!isK?`<span class="mr2tag dim">${ui('未觉醒','Never awakened')}</span>`:'')}</div>
        <div class="mr2smetrics">
          ${isK?'':`<span><small>${ui('出牌数（牌权）','Cards (share)')}</small><b>${r.plays}</b><em>${pctOf(r.plays,st.totalPlays)}%</em></span><span><small>${ui('消耗算力','Energy spent')}</small><b>${fmt(r.energy)}</b><em>${pctOf(r.energy,st.totalEnergy)}%</em></span>${r.fia?`<span title="${esc(ui('出牌时卡牌的活焰层数分布','Fiamma stacks on played cards'))}"><small>🔥${ui('活焰出牌','Fiamma plays')}</small><b>${r.fia[1]+r.fia[2]+r.fia[3]}</b><em>1/2/3层 ${r.fia[1]}/${r.fia[2]}/${r.fia[3]}</em></span>`:''}<span><small>${ui('狂气爆发','Bursts')}</small><b>${r.ulti}</b></span>`}
          <span><small>${ui('总伤害','Damage')}</small><b>${fmt(r.dmg)}</b><em>${pctOf(r.dmg,st.totalDmg)}%</em></span>
          ${r.block?`<span><small>${ui('护盾','Shield')}</small><b>${fmt(r.block)}</b></span>`:''}${r.heal?`<span><small>${ui('治疗','Heal')}</small><b>${fmt(r.heal)}</b></span>`:''}
        </div>
        ${bar(r.dmg/maxDmg,'dmg')}
        ${types?`<div class="mr2flow">${types}</div>`:''}
        ${srcs.length?`<details class="mr2minor"><summary>${ui('伤害/护盾来源明细','Output by source')} ${srcs.length}</summary><div class="mr2srcs">${srcs.map(o=>{const v=o.dmg||o.block||o.heal,lab=o.dmg?ui('伤害','DMG'):o.block?ui('护盾','Shield'):ui('治疗','Heal'),sk=o.typ==='state'?'':asList(res.skill[String(o.id)]?.Type);return `<div class="mr2srow"><span class="mr2sname">${esc(srcName(o))}${o.typ==='utilSkill'?`<small>${ui('爆发','Burst')}</small>`:o.typ==='state'?`<small>${ui('状态','State')}</small>`:''}</span>${bar(v/top,o.dmg?'dmg':o.block?'blk':'heal')}<b>${fmt(v)}</b><small>${lab}${o.dmg&&r.dmg?` ${pctOf(o.dmg,r.dmg)}%`:''}</small></div>`}).join('')}</div></details>`:''}
      </div>`;
    }).join('');
    const orderRow=(list,label)=>list.length?`<div class="mr2sorder"><h5>${label}</h5><div class="mr2flow">${list.map((o,i)=>`<span class="mr2step"><i>${i+1}</i>${ico(o.a.icon,o.a.name,'av sm2')}<span><b>${esc(o.a.name)}</b><small>${ui(`第 ${o.round} 回合`,`R${o.round}`)} · ${esc(o.name)}</small></span></span>`).join('')}</div></div>`:'';
    const maxK=Math.max(1,...st.keeperRows.map(k=>k.n));
    const keeperHtml=st.keeperRows.length?st.keeperRows.map(k=>`<div class="mr2srow keeperrow"${skillTipAttr(res,k.tid,{})}>${ico(k.icon,'钥','kk sm3')}<span class="mr2sname">${esc(res.nameSkill(k.tid))}</span>${bar(k.n/maxK,'key')}<b>${ui(`${k.n} 次`,`${k.n}×`)}</b><small>${k.rounds.size?ui(`第 ${[...k.rounds].sort((x,y)=>x-y).join('/')} 回合`,`R${[...k.rounds].sort((x,y)=>x-y).join('/')}`):''}${k.offered?` · ${ui(`银钥微光出现 ${k.offered} 次，选中 ${k.chosen} 次（${pctOf(k.chosen,k.offered)}%）`,`offered ${k.offered}, picked ${k.chosen} (${pctOf(k.chosen,k.offered)}%)`)}`:''}</small></div>`).join(''):`<div class="mr2empty">—</div>`;
    const maxR=Math.max(1,...st.relicRows.map(r=>r.n));
    const relicHtml=st.relicRows.map(r=>{
      const b=r.buff&&r.buff.gain>0?r.buff:null,unitW=b?.kind==='power'?ui('力量','Power'):ui('基础伤害%','Basic dmg %');
      const buffEm=b?`<em class="p">${b.kind==='power'?ui(`力量类 · 共产生 ${fmt(b.gain)} 点力量（每次作用于全队）`,`Power · +${fmt(b.gain)} power (team-wide)`):ui(`${(BUFF_NAME[b.kind]||BUFF_NAME.basic)[0]}类 · 每名唤醒体 +${fmt(Math.round(b.gain*10)/10)}% ${(BUFF_NAME[b.kind]||BUFF_NAME.basic)[0]}`,`${(BUFF_NAME[b.kind]||BUFF_NAME.basic)[1]} · +${fmt(Math.round(b.gain*10)/10)}% each`)}</em><em class="d">${ui('估算额外伤害','Est. extra DMG')} ${fmt(Math.round(b.extra))}${st.totalDmg?` (${pctOf(b.extra,st.totalDmg)}%)`:''}</em>`:'';
      const inst=b?`<details class="mr2minor relicinst"><summary>${ui(`每次触发明细 ${b.instances.length}`,`Per trigger ${b.instances.length}`)}</summary><div class="mr2srcs">${b.instances.map(i=>`<div class="mr2srow inst"><span class="mr2sname">${ui(`第 ${i.round||'开局'} 回合`,i.round?`R${i.round}`:'Opening')}${i.temp?`<small>${ui('临时力量（本回合）','Temporary')}</small>`:''}</span><span>${b.kind==='power'?`+${fmt(i.gain)} ${ui('力量','power')}`:`+${fmt(Math.round(i.gain*10)/10)}%`}${i.awakeners.size>1?` <small>${ui(`作用 ${i.awakeners.size} 名唤醒体`,`${i.awakeners.size} awakeners`)}</small>`:''}</span><b>${fmt(Math.round(i.extra))}</b><small>${ui(`${i.hits} 次命中`,`${i.hits} hits`)}</small></div>`).join('')}</div></details>`:'';
      return `<div class="mr2relicwrap"><div class="mr2srow relicrow"${relicTipAttr(res,r.tid)}>${ico(relicIconSrc(res,r.tid),res.nameRelic(r.tid),'rl big')}<span class="mr2sname">${esc(res.nameRelic(r.tid))}<small>${r.start?ui('开局携带','Starting'):ui('战斗中获得','Gained in battle')}</small></span>${bar(r.n/maxR,'relic')}<b>${r.n?ui(`${r.n} 次`,`${r.n}×`):b||(r.eff||[]).length?ui('开局生效','At start'):ui('未触发','—')}</b><span class="mr2sout">${dotChip(r,st.totalDmg)}${r.dmg?`<em class="d">${ui('额外伤害','DMG')} ${fmt(r.dmg)}${st.totalDmg?` (${pctOf(r.dmg,st.totalDmg)}%)`:''}</em>`:''}${r.block?`<em class="b">${ui('护盾','Shield')} ${fmt(r.block)}</em>`:''}${r.heal?`<em class="h">${ui('治疗','Heal')} ${fmt(r.heal)}</em>`:''}${buffEm}${(r.eff||[]).map(x=>`<em class="n">${esc(x.text)}</em>`).join('')}${supChips(tl,'rel:'+r.tid)}${!r.dmg&&!r.block&&!r.heal&&!b&&!(r.eff||[]).length&&!supChips(tl,'rel:'+r.tid)?`<em class="n">${r.mapped?ui('无直接产出（增益类）','No direct output'):ui('产出未知','Output unknown')}</em>`:''}</span></div>${inst}</div>`;
    }).join('');
    const buffSummary=st.powerGain||st.basicGain?`<div class="mr2buffsum"><b>${ui('增益类造物合计','Buff relics total')}</b><span>${st.powerGain?ui(`产生力量 +${fmt(st.powerGain)}`,`power +${fmt(st.powerGain)}`):''}</span><span>${st.basicGain?ui(`基础伤害累计 +${fmt(Math.round(st.basicGain*10)/10)}%（每名唤醒体）`,`basic dmg +${fmt(Math.round(st.basicGain*10)/10)}% each`):''}</span><span class="d">${ui('估算额外伤害','Est. extra DMG')} ${fmt(Math.round(st.buffExtra))}${st.totalDmg?` (${pctOf(st.buffExtra,st.totalDmg)}%)`:''}</span><small>${ui('估算方法：先用本场每次命中拟合出各角色的力量倍率，再按该造物提供的力量（力量×倍率占该次命中非暴击伤害的比例）或基础伤害（基伤部分占 1+基伤 的比例）折算，详见下方“伤害公式校验”。','Estimate: each hit is split by the relic\'s share of power (of attack force + power) or basic damage (of 1 + basic damage). Indicative only.')}</small></div>`:'';
    const execHtml=st.execRows.map(x=>{
      const mx=Math.max(1,...x.bySrc.map(b=>b.gain)),mr=Math.max(1,...x.byRound.map(r=>r[1])),last=x.events[x.events.length-1];
      return `<div class="mr2ssec"><h5>${ui('斩杀层数统计','Execute-stack statistics')} · ${esc(res.nameState(x.sid))}${x.caster?` <small>${esc(x.caster.name)}</small>`:''}</h5>
        <div class="mr2ssum"><span><small>${ui('累计增加层数','Layers gained')}</small><b>${fmt(x.total)}</b></span><span><small>${ui('斩杀伤害（统计包）','Execute damage')}</small><b>${fmt(x.dmg)}</b><small>${pctOf(x.dmg,st.totalDmg)}% ${ui('占队伍总伤害','of team')}</small></span><span><small>${ui('斩杀次数','Executions')}</small><b>${x.kills.length}</b></span>${last?`<span><small>${ui('最后一次层数 / 目标生命','Last stacks / target HP')}</small><b>${fmt(last.layer)}</b><small>${ui('目标生命','HP')} ${last.hp!=null?fmt(last.hp):'—'}</small></span>`:''}</div>
        <div class="mr2srcs">${x.bySrc.map(b=>`<div class="mr2srow"><span class="mr2sname">${esc(b.name)}<small>${b.n} ${ui('次','×')}</small></span>${bar(b.gain/mx,'dmg')}<b>${fmt(b.gain)}</b><small>${pctOf(b.gain,x.total)}%</small></div>`).join('')}</div>
        <details class="mr2minor"><summary>${ui('每回合增加层数','Layers per round')}</summary><div class="mr2srcs">${x.byRound.map(([r,g])=>`<div class="mr2srow"><span class="mr2sname">${ui(`第 ${r} 回合`,`R${r}`)}</span>${bar(g/mr,'relic')}<b>${fmt(g)}</b></div>`).join('')}</div></details>
        ${x.kills.length?`<small class="mr2from">${x.kills.map(k=>ui(`第 ${k.round} 回合斩杀：击杀时层数 ${fmt(k.layer)}${k.hp!=null?`（最后一次加层时目标生命 ${fmt(k.hp)}）`:''}`,`R${k.round}: stacks ${fmt(k.layer)}`)).join('；')}</small>`:''}
        ${x.check.withArg?`<small class="mr2from">${ui(`校验：每次加层数 = 出牌卡面「命运裁断」数值的整数倍，${x.check.match}/${x.check.withArg} 次完全吻合（${x.check.mult.map(([k,n])=>`×${k}：${n} 次`).join('，')}${x.check.mult.some(([k])=>k>1)?'；×2 等倍数来自指令里「目标带标记 / 自身有对应状态时加倍」的条件':''}）；按「攻击力 × 技能公式倍率（含基伤池、层数加成）」预测每个技能的加层数，平均偏差 ${x.check.predErr==null?'—':(x.check.predErr*100).toFixed(1)+'%'}`,`Check: gain = card value in ${x.check.match}/${x.check.withArg} plays; formula prediction error ${x.check.predErr==null?'-':(x.check.predErr*100).toFixed(1)+'%'}`)}</small>`:''}
        <small class="mr2from">${ui('规则：状态层数 ≥ 目标生命时移除并直接击杀目标；层数按增加时正在结算的出牌 / 钥令 / 回合效果归因，伤害数值取统计包记录在该状态上的量。','Stacks >= target HP kill it outright; gains are attributed to the action being resolved, damage comes from the stat pack.')}</small></div>`}).join('');
    const ctrHtml=(()=>{const c=st.ctrRows;if(!c||!(c.actualDmg>0||c.packDmg>0))return '';
      const mx=Math.max(1,...c.owners.map(o=>o.dmg||o.gain)),mr=Math.max(1,...c.rounds.map(r=>Math.max(r[1].act,r[1].pred)));
      const ratio=c.packDmg>0?c.layerSumT1/c.packDmg:null;
      return `<div class="mr2ssec"><h5>${ui('反击统计','Counter-attack statistics')}</h5>
        <div class="mr2ssum"><span><small>${ui('反击伤害（统计包）','Counter damage (stat pack)')}</small><b>${fmt(c.packDmg)}</b><small>${pctOf(c.packDmg,st.totalDmg)}% ${ui('占队伍总伤害','of team')}</small></span><span><small>${ui('其中逐次可见的反击事件','Visible counter events')}</small><b>${fmt(c.actualDmg)}</b><small>${c.actualHits} ${ui('次触发','triggers')}</small></span><span><small>${ui('我方承受主动伤害','Active hits taken')}</small><b>${c.taken}</b><small>${ui('次','')}</small></span><span><small>${ui('触发时平均 / 最高反击层数','Avg / max stacks at hit')}</small><b>${fmt(Math.round(c.avg))}</b><small>${ui('最高','max')} ${fmt(c.maxLayer)}</small></span></div>
        <div class="mr2srcs">${c.owners.map(o=>`<div class="mr2srow">${o.a?ico(o.a.icon,o.a.name,'av sm'):''}<span class="mr2sname">${esc(o.name)}<small>${ui('加层','stacks +')} ${fmt(o.gain)}${o.init?` · ${ui('开局','start')} ${fmt(o.init)}`:''}${o.bySrc.length?` · ${esc(o.bySrc.slice(0,2).map(b=>`${b.name} ${fmt(b.gain)}`).join('；'))}`:''}</small></span>${bar((o.dmg||o.gain)/mx,'dmg')}<b>${fmt(o.dmg)}</b><small>${pctOf(o.dmg,st.totalDmg)}%</small></div>`).join('')}</div>
        <details class="mr2minor"><summary>${ui('每回合：承受主动伤害次数 / 实际反击伤害','Per round')}</summary><div class="mr2srcs">${c.rounds.map(([r,x])=>`<div class="mr2srow"><span class="mr2sname">${ui(`第 ${r} 回合`,`R${r}`)}<small>${x.n} ${ui('次受击','hits')}</small></span>${bar(x.act/mr,'dmg')}<b>${fmt(x.act)}</b></div>`).join('')}</div></details>
        <small class="mr2from">${ui(`规则：每次承受敌方主动伤害时，按当前「反击」+「临时反击」层数对来源造成等量纯粹伤害；逆鳞之护等会额外触发。核对：我方受敌方主动伤害 ${c.taken} 次，各次触发时层数相加 = ${fmt(c.layerSumT1)}，统计包记录的反击伤害 ${fmt(c.packDmg)}${ratio!=null?`，吻合度 ${(ratio*100).toFixed(1)}%${Math.abs(ratio-1)<.001?'（完全吻合）':c.extraTrig>0?'（有逆鳞之护等额外触发 / 触腕反击，未折算）':''}`:''}。统计包按施加层数的唤醒体归属反击伤害。`,'Each active hit taken deals the current counter stacks back as pure damage.')}</small></div>`})();
    const stateHtml=st.stateRows.length?`<div class="mr2ssec"><h5>${ui('状态伤害来源（出血、旧日余烬等）','Damage from states (bleed, ...)')}</h5>${st.stateRows.map(x=>`<div class="mr2srow"${stateTipAttr(res,x.id,{})}><span class="mr2sname">${esc(res.nameState(x.id))}</span>${bar(x.dmg/st.stateRows[0].dmg,'dmg')}<b>${fmt(x.dmg)}</b><small>${pctOf(x.dmg,st.totalDmg)}%</small></div>`).join('')}</div>`:'';
    const sum=[[ui('总伤害','Total damage'),fmt(st.totalDmg)],[ui('回合数','Rounds'),st.rounds],[ui('出牌数','Cards played'),st.totalPlays],[ui('消耗算力','Energy spent'),fmt(st.totalEnergy)],[ui('抽牌','Draws'),st.draws],[ui('弃牌','Discards'),st.discards],[ui('消耗牌','Exhausted'),st.exhausts],[ui('钥令使用','Keyflare casts'),st.keeperUses],[ui('造物额外伤害','Relic damage'),fmt(st.relicDmg)],[ui('增益造物估算伤害','Buff relic est. dmg'),fmt(Math.round(st.buffExtra))],[ui('命轮/密契估算伤害','Gear est. dmg'),fmt(Math.round(st.gearExtra))],...(st.dotAttr>0?[[ui('持续伤害（已归因到造物/命轮/密契）','DoT attributed to items'),fmt(Math.round(st.dotAttr))]]:[])].map(([k,v])=>`<span><small>${esc(k)}</small><strong>${esc(v)}</strong></span>`).join('');
    // ---- dashboard layout: overview / characters / rhythm / relics / gear / special mechanics / checks
    const PAL=['#ff8a3d','#4aa3ff','#4fd18b','#b57cff','#ffd24a','#ff5c8a','#4fd0c8','#9aa7b8'];
    const awRows=st.per.filter(r=>r.a.kind!=='keeper'&&r.dmg>0).sort((x,y)=>y.dmg-x.dmg);
    const colorOf=new Map(awRows.map((r,i)=>[String(r.a.uid),PAL[i%PAL.length]]));
    const stack=(items,total)=>`<div class="mr2stack">${items.filter(x=>x.v>0).map(x=>`<i style="flex:${Math.max(0.5,x.v/Math.max(1,total)*100)};background:${x.c}" title="${esc(`${x.l} ${fmt(x.v)} (${pctOf(x.v,total)}%)`)}"></i>`).join('')}</div><div class="mr2legend2">${items.filter(x=>x.v>0).map(x=>`<span><i style="background:${x.c}"></i>${x.ic||''}${esc(x.l)} <b>${fmt(x.v)}</b> <em>${pctOf(x.v,total)}%</em></span>`).join('')}</div>`;
    const byAw=stack(awRows.map(r=>({l:r.a.name,v:r.dmg,c:colorOf.get(String(r.a.uid)),ic:ico(r.a.icon,r.a.name,'av xs')})),st.totalDmg);
    const td=st.typeDmg,tdTot=td.skill+td.ulti+td.state+td.other;
    const byType=stack([{l:ui('出牌 / 技能','Cards & skills'),v:td.skill,c:'#4aa3ff'},{l:ui('狂气爆发','Bursts'),v:td.ulti,c:'#ff8a3d'},{l:ui('状态伤害（中毒 / 反击 / 斩杀…）','State damage'),v:td.state,c:'#b57cff'},{l:ui('其他','Other'),v:td.other,c:'#9aa7b8'}],tdTot||1);
    const mxr=Math.max(1,...st.roundDmg.map(r=>r[1]));
    const rounds=st.roundDmg.length?`<div class="mr2rchart">${st.roundDmg.map(([r,v])=>`<div class="mr2rcol" title="${esc(ui(`第 ${r} 回合 ${fmt(v)}`,`R${r} ${fmt(v)}`))}"><i style="height:${Math.max(2,v/mxr*100)}%"></i><small>${r}</small></div>`).join('')}</div><small class="mr2from">${ui('每回合我方行动造成的伤害（逐次事件，不含持续伤害）','Damage dealt by actions each round (events, excluding DoT)')}</small>`:'';
    const kpi=(l,v,sub='')=>`<div class="mr2kpi"><small>${l}</small><b>${v}</b>${sub?`<em>${sub}</em>`:''}</div>`;
    const kpis=[kpi(ui('总伤害','Damage'),fmt(st.totalDmg)),kpi(ui('回合数','Rounds'),st.rounds),kpi(ui('出牌','Cards'),st.totalPlays,`${ui('算力','energy')} ${fmt(st.totalEnergy)}`),kpi(ui('钥令','Keyflare'),st.keeperUses),kpi(ui('抽 / 弃 / 消耗','Draw / discard / exhaust'),`${st.draws} / ${st.discards} / ${st.exhausts}`),kpi(ui('造物额外伤害','Relic dmg'),fmt(Math.round(st.relicDmg+st.buffExtra))),kpi(ui('命轮 / 密契估算','Gear est.'),fmt(Math.round(st.gearExtra))),...(st.dotAttr>0?[kpi(ui('持续伤害归因','DoT attributed'),fmt(Math.round(st.dotAttr)))]:[])].join('');
    const overview=`<div class="mr2kpis">${kpis}</div><div class="mr2cols2"><div class="mr2panel"><h5>${ui('伤害构成 · 按唤醒体','Damage by awakener')}</h5>${byAw}</div><div class="mr2panel"><h5>${ui('伤害构成 · 按类型','Damage by type')}</h5>${byType}</div></div><div class="mr2panel"><h5>${ui('每回合伤害','Damage per round')}</h5>${rounds||`<div class="mr2empty">—</div>`}</div>`;
    const roleRows=st.per.map(r=>{
      const a=r.a,isK=a.kind==='keeper',srcs=[...r.src.values()].sort((x,y)=>(y.dmg+y.block+y.heal)-(x.dmg+x.block+x.heal)),top=Math.max(1,...srcs.map(o=>o.dmg||o.block||o.heal));
      const col=colorOf.get(String(a.uid))||'#9aa7b8';
      const detail=srcs.length?`<div class="mr2tdetail">${r.fia?`<span class="mr2tag" title="${esc(ui('出牌时卡牌的活焰层数分布','Fiamma stacks on played cards'))}">🔥 ${ui('活焰出牌','Fiamma')} ${r.fia[1]+r.fia[2]+r.fia[3]}（1/2/3 层 ${r.fia[1]}/${r.fia[2]}/${r.fia[3]}）</span>`:''}${[...r.types.entries()].map(([k,v])=>`<span class="mr2tag">${esc(k)} ×${v}</span>`).join('')}<div class="mr2srcs">${srcs.map(o=>{const v=o.dmg||o.block||o.heal,lab=o.dmg?ui('伤害','DMG'):o.block?ui('护盾','Shield'):ui('治疗','Heal');return `<div class="mr2srow"><span class="mr2sname">${esc(srcName(o))}${o.typ==='utilSkill'?`<small>${ui('爆发','Burst')}</small>`:o.typ==='state'?`<small>${ui('状态','State')}</small>`:''}</span>${bar(v/top,o.dmg?'dmg':o.block?'blk':'heal')}<b>${fmt(v)}</b><small>${lab}${o.dmg&&r.dmg?` ${pctOf(o.dmg,r.dmg)}%`:''}</small></div>`}).join('')}</div></div>`:'';
      return `<details class="mr2trowd"><summary class="mr2trow"><span class="mr2tn">${ico(a.icon,isK?'守':a.name,`av ${isK?'keeper':''}`)}<b>${esc(a.name)}</b>${r.awake?`<span class="mr2tag awake">${ui(`#${r.awake.order} 觉醒 R${r.awake.round}`,`Awake #${r.awake.order} R${r.awake.round}`)}</span>`:(!isK?`<span class="mr2tag dim">${ui('未觉醒','no awakening')}</span>`:'')}</span><span class="mr2tc">${isK?'—':r.plays}</span><span class="mr2tc">${isK?'—':fmt(r.energy)}</span><span class="mr2tc">${isK?'—':r.ulti}</span><span class="mr2tbar"><i style="width:${Math.max(0,r.dmg/maxDmg*100).toFixed(1)}%;background:${col}"></i><b>${fmt(r.dmg)}</b><em>${pctOf(r.dmg,st.totalDmg)}%</em></span><span class="mr2tc">${r.block?fmt(r.block):'—'}</span><span class="mr2tc">${r.heal?fmt(r.heal):'—'}</span></summary>${detail}</details>`}).join('');
    const roles=`<div class="mr2thead"><span>${ui('角色','Character')}</span><span>${ui('出牌','Cards')}</span><span>${ui('算力','Energy')}</span><span>${ui('爆发','Burst')}</span><span>${ui('伤害','Damage')}</span><span>${ui('护盾','Shield')}</span><span>${ui('治疗','Heal')}</span></div>${roleRows}<small class="mr2from">${ui('点击一行展开该角色的伤害 / 护盾来源。出牌数占比（牌权）：','Click a row for its output sources. Card share: ')}${st.per.filter(r=>r.a.kind!=='keeper'&&r.plays).map(r=>`${esc(r.a.name)} ${pctOf(r.plays,st.totalPlays)}%`).join(' · ')}</small>`;
    const rhythm=`<div class="mr2cols2"><div class="mr2panel"><h5>${ui('觉醒与爆发顺序','Awakening & burst order')}</h5>${orderRow(st.awakenOrder,ui('灵知觉醒顺序','Awakening order'))||`<div class="mr2empty">${ui('本场没有灵知觉醒','No awakening this battle')}</div>`}${orderRow(st.ultiOrder,ui('狂气爆发顺序','Burst order'))}</div><div class="mr2panel"><h5>${ui('钥令使用与选择偏好','Keyflare skills & picks')}</h5>${keeperHtml}</div></div>`;
    const relicTiles=st.relicRows.map(r=>{const b=r.buff&&r.buff.gain>0?r.buff:null,val=r.dmg+(b?.extra||0)+(r.dot||0);
      return `<div class="mr2tile ${r.n||b||(r.eff||[]).length?'':'idle'}"${relicTipAttr(res,r.tid)}>${ico(relicIconSrc(res,r.tid),res.nameRelic(r.tid),'rl big')}<div><b>${esc(res.nameRelic(r.tid))}</b><small>${r.start?ui('开局携带','Start'):ui('战斗中获得','Gained')} · ${r.n?ui(`${r.n} 次`,`${r.n}×`):b||(r.eff||[]).length?ui('开局生效','at start'):ui('未触发','idle')}${r.rounds.length&&r.n<=12?` · R${r.rounds.join('/')}`:''}</small>${val>0?`<em>${ui('估算贡献','Est.')} ${fmt(Math.round(val))} (${pctOf(val,st.totalDmg)}%)</em>`:''}${b?`<small class="p">${b.kind==='power'?ui(`+${fmt(b.gain)} 力量`,`+${fmt(b.gain)} power`):ui(`${(BUFF_NAME[b.kind]||BUFF_NAME.basic)[0]} +${fmt(Math.round(b.gain*10)/10)}%`,`${(BUFF_NAME[b.kind]||BUFF_NAME.basic)[1]} +${fmt(Math.round(b.gain*10)/10)}%`)}</small>`:''}${r.block?`<small class="b">${ui('护盾','Shield')} ${fmt(Math.round(r.block))}</small>`:''}${r.heal?`<small class="h">${ui('治疗','Heal')} ${fmt(Math.round(r.heal))}</small>`:''}${(r.eff||[]).map(x=>`<small class="p">${esc(x.text)}</small>`).join('')}${supChips(tl,'rel:'+r.tid)}</div></div>`}).join('');
    const relics=`<div class="mr2tiles">${relicTiles}</div>${buffSummary}${fold(ui('每个造物的详细触发与每次增益','Per-relic details'),`<div class="mr2ssec">${relicHtml}</div>`)}`;
    const special=[execHtml,ctrHtml,stateHtml].filter(Boolean).join('')||`<div class="mr2empty">${ui('本场没有斩杀 / 反击 / 持续伤害类统计','No execute / counter / DoT statistics')}</div>`;
    const tabs=[['ov',ui('概览','Overview'),overview],['role',ui('角色','Characters'),roles],['rh',ui('钥令与节奏','Rhythm'),rhythm],['rel',`${ui('造物','Relics')} ${st.relicRows.length}`,relics],['gear',`${ui('命轮 / 密契','Gear')} ${st.gearRows.length}`,renderGear(st,tl)||`<div class="mr2empty">—</div>`],['sp',ui('特殊机制 / 状态伤害','Mechanics'),special],['chk',ui('公式校验','Checks'),renderCalib(tl)||`<div class="mr2empty">—</div>`]];
    return `<details class="mr2round mr2stats"><summary><b>${ui('数据统计','Statistics')}</b><small>${ui('概览 / 角色 / 节奏 / 造物 / 命轮密契 / 特殊机制 / 校验','overview / characters / rhythm / relics / gear / mechanics / checks')}</small></summary><div class="mr2rbody mr2dash"><div class="mr2tabs">${tabs.map(([k,l],i)=>`<button type="button" class="mr2tabbtn${i?'':' on'}" data-tab="${k}">${l}</button>`).join('')}</div>${tabs.map(([k,,h],i)=>`<div class="mr2tabpane" data-pane="${k}"${i?' hidden':''}>${h}</div>`).join('')}${st.havePacks?'':`<div class="mr2status">${ui('此回放缺少游戏内统计包，伤害按逐次命中事件重建，造物额外伤害无法归因。','This replay has no in-game stat packs; damage is rebuilt from hit events and relic damage cannot be attributed.')}</div>`}</div></details>`;
  }
  // ---- battle info header + victory-style MVP summary --------------------------------------
  // compact team card row (same information as a search-result / top-5 team): avatar, level, enlightenment, wheels with stack, covenants
  function renderTeamBrief(full,tl){
    const bd=full.battleDat||{},res=tl.res,roles=bd.roleData||[],list=bd.stateList||[];if(!roles.length)return '';
    const hit=window.MorimensDtideTeamLookup?.(full.replayUuid||bd.battleUuid),tm=hit?.team?.members||[];
    const cats=Object.values(gearCatalog?.covenants||{}),cnOf=id=>String(res.state[String(id)]?.CnID||'');
    const enl=p=>{p=Number(p);return !Number.isFinite(p)?'':p<=3?ui(`${p}启`,`E${p}`):`+${p-3}`};
    const stk=n=>n<=3?ui(`${n}叠`,`S${n}`):`+${n-3}`;
    const cards=roles.map(ri=>{
      const a=tl.actors.get(String(ri.uid));if(!a)return '';
      const nm=String(res.aw[String(ri.tid)]?.NameEn||'').toLowerCase(),m=tm.find(x=>[x.name,x.canonicalName].some(y=>String(y||'').toLowerCase()===nm)),mine=list.filter(x=>String(x.ownerData?.uid)===String(ri.uid));
      const wheels=mine.filter(x=>(x.source||[]).some(q=>q.sourceType==='Weapon')).map(x=>{const q=x.source.find(z=>z.sourceType==='Weapon'),c=gearCatalog?.wheels?.[String(q.tid)];if(!c)return '';const tw=(m?.wheels||[]).find(w=>String(w.name).toLowerCase()===String(c.en||'').toLowerCase());return `${esc(c.zh||c.en)}${tw?.level!=null?` <small>${esc(wheelStackText(tw.level))}</small>`:''}`}).filter(Boolean);
      const stems=[...new Set(mine.filter(x=>/^状态@饰品/.test(cnOf(x.stateId))).map(x=>cnOf(x.stateId).replace(/^状态@饰品/,'')))],seen=new Set(),covs=[];
      for(const st of stems){const c=cats.filter(z=>z.zh&&st.startsWith(z.zh)).sort((x,y)=>y.zh.length-x.zh.length)[0];if(c&&!seen.has(c.zh)){seen.add(c.zh);const tc=(m?.covenants||[]).find(k=>String(k.name).toLowerCase()===String(c.en||'').toLowerCase());covs.push(`${esc(c.zh)}${tc?.count?` <small>${esc(tc.count)}${ui('件','pc')}</small>`:''}`)}}
      const sf=full.__sf?.get(String(ri.uid));
      return `<div class="mr2bm">${ico(a.icon,a.name,'av')}<div><b>${esc(a.name)}</b><small>Lv${esc(ri.level)} · ${esc(enl(ri.potencyLevel))}${sf?` · ${ui('灵塑','Soulforge')} ${sf}`:''}${m?.covenantScore!=null?` · ${ui('密契评分','Cov.')} ${esc(m.covenantScore)}`:''}</small>${wheels.length?`<small class="g">${ui('命轮','Wheel')}：${wheels.join(' / ')}</small>`:''}${covs.length?`<small class="g">${ui('密契','Covenant')}：${covs.join(' / ')}</small>`:''}</div></div>`}).join('');
    return cards?`<div class="mr2bteam">${cards}</div>`:'';
  }
  // wheel level 0-15 is the stack ladder: 0..3 = N叠, then +1 … +12
  const wheelStackText=n=>{n=Number(n);return !Number.isFinite(n)?'':n<=3?ui(`${n}叠`,`S${n}`):`+${n-3}`};
  const keeperName=()=>String(lastFull?.battleDat?.playerName||'').trim();
  function renderBattleInfo(full,tl){
    const bd=full.battleDat||{},res=tl.res,stage=res.rr?.Stage?.[String(bd.stageId)]||{};
    const stageName=(pipeName(stage.Name)||tailCn(stage.CnID)||`Stage ${bd.stageId??''}`).replace(/<[^>]+>/g,'').replace(/\s*[·•]?\s*@\d+\s*$/,'').trim();   // a trailing "@4" is a template slot, not part of the name
    const puid=bd.playerUid!=null?String(bd.playerUid):'',pname=String(bd.playerName||'').trim();
    const season=(String(stage.CnID||'').match(/(\d+)期/)||[])[1];
    const ts=(bd.cards||[]).map(c=>Number(c.ts)).find(t=>t>1e9)||(bd.backupAwakeCards||[]).map(c=>Number(c.ts)).find(t=>t>1e9);
    const when=ts?new Date(ts*1000):null,pad=n=>String(n).padStart(2,'0');
    const dateText=when?`${when.getFullYear()}-${pad(when.getMonth()+1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}`:'—';
    const ageDays=when?Math.floor((Date.now()-when.getTime())/86400000):null;
    const keepNote=ageDays==null?'':ageDays>=30?ui('回放已超过 30 天，原对象可能已过期，可用「导出 / 导入数据」保存的结构化数据复盘','Older than 30 days: the public object may have expired; use exported data'):ui(`回放保存 30 天，约 ${30-ageDays} 天后过期`,`Replays are kept for 30 days (~${30-ageDays} left)`);
    const bosses=[...new Set([...tl.actors.values()].filter(a=>a.camp===2&&a.kind==='monster').map(a=>a.name))].slice(0,3);
    const win=tl.result?.winCamp===1,lost=tl.result&&tl.result.winCamp!=null&&tl.result.winCamp!==1;
    const verdict=win?ui('胜利','VICTORY'):lost?ui('战败','DEFEAT'):ui('结果未知','RESULT UNKNOWN');
    // the structured statistics block is missing from some replays: fall back to the finish packet, then to what the timeline counted
    const fin=tl.battleCounts?.()||{},pick=(...vals)=>{for(const v of vals)if(Number.isFinite(Number(v))&&v!=null&&Number(v)>0)return Number(v);return 0};
    const bs=bd.statistics||{},fs0=fin.finish?.BattleStats||fin.finish?.GlobalStats||fin.finish||{};
    const cnt={cards:pick(bs.UsedCardCount,fs0.UsedCardCount,fin.cards),deathResist:pick(bs.DeathResistCount,fs0.DeathResistCount,fin.deathResist),kills:pick(bs.KillCount,fs0.KillCount,fin.kills)};
    const k0=bd.keeperSkill!=null?res.nameSkill(bd.keeperSkill):'',k=/^\d+$/.test(String(k0))?'':k0;
    return `<div class="mr2binfo ${win?'win':lost?'lose':''}"><div class="mr2bhead"><span class="mr2verdict">${esc(verdict)}</span><div class="mr2btitle"><b>${esc(stageName)}${puid?` <span class="mr2uid">· UID ${esc(puid)}</span>`:''}</b><small>${pname?`${esc(pname)} · `:''}${season?`${ui('融灾','Dzone')} ${esc(season)} ${ui('期','')} · `:''}${esc(dateText)} ${when?ui('战斗','battle'):''}${bosses.length?` · ${esc(bosses.join(' / '))}`:''}</small></div><span class="mr2bnote">${esc(keepNote)}</span></div>
      ${renderTeamBrief(full,tl)}
      <div class="mr2bmeta"><span><small>${ui('回合数','Rounds')}</small><b>${tl.rounds.filter(r=>!r.dim).length}</b></span><span><small>${ui('出牌','Cards')}</small><b>${fmt(cnt.cards)}</b></span><span><small>${ui('死亡抵抗','Death resist')}</small><b>${fmt(cnt.deathResist)}</b></span><span><small>${ui('击杀','Kills')}</small><b>${fmt(cnt.kills)}</b></span>${k?`<span><small>${ui('钥令','Keyflare')}</small><b>${esc(k)}</b></span>`:''}<span class="id"><small>battleUuid</small><b>${esc(full.replayUuid||bd.battleUuid||'')}</b></span></div></div>`;
  }
  // hexagonal radar of the keeper's six dimensions (missing dimensions sit at the centre and are marked)
  function keeperRadar(v2){
    const D=[['R',ui('资源','Resources')],['P',ui('出牌','Plays')],['T',ui('节奏','Tempo')],['K',ui('钥令','Keyflare')],['S',ui('风险','Risk')],['C',ui('协同','Team')]],cx=130,cy=108,R0=78;
    const pt=(i,r)=>{const a=-Math.PI/2+i*Math.PI/3;return [cx+Math.cos(a)*r,cy+Math.sin(a)*r]},poly=(f)=>D.map((_,i)=>pt(i,R0*f).map(n=>n.toFixed(1)).join(',')).join(' ');
    const val=D.map(([k])=>v2.dims[k]==null?0:Math.max(0,Math.min(100,v2.dims[k]))/100),vp=val.map((f,i)=>pt(i,R0*f).map(n=>n.toFixed(1)).join(',')).join(' ');
    const axes=D.map((_,i)=>{const [x,y]=pt(i,R0);return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#3a4658" stroke-width="1"/>`}).join('');
    const labs=D.map(([k,l],i)=>{const [x,y]=pt(i,R0+22),v=v2.dims[k],anchor=Math.abs(x-cx)<6?'middle':x>cx?'start':'end';return `<text x="${x.toFixed(1)}" y="${(y-2).toFixed(1)}" text-anchor="${anchor}" font-size="11" fill="#aab6c6">${esc(l)}</text><text x="${x.toFixed(1)}" y="${(y+12).toFixed(1)}" text-anchor="${anchor}" font-size="12" font-weight="800" fill="${v==null?'#657286':'#f1d69f'}">${v==null?'—':Math.round(v)}</text>`}).join('');
    const dots=val.map((f,i)=>{const [x,y]=pt(i,R0*f);return v2.dims[D[i][0]]==null?'':`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="#f1d69f"/>`}).join('');
    return `<div class="mr2radar"><svg viewBox="0 0 260 236" width="100%" style="max-width:300px;overflow:visible" role="img" aria-label="${esc(ui('守密人六维图','Keeper radar'))}">${[.25,.5,.75,1].map(f=>`<polygon points="${poly(f)}" fill="none" stroke="#3a4658" stroke-width="1"${f===1?'':' stroke-dasharray="2 3"'}/>`).join('')}${axes}<polygon points="${vp}" fill="rgba(213,177,118,.24)" stroke="#d5b176" stroke-width="2" stroke-linejoin="round"/>${dots}${labs}</svg><div class="mr2radarnote"><b>${v2.score==null?'—':v2.score.toFixed(1)}</b> · ${ui('潜力实现','Potential')} ${v2.potential==null?'—':Math.round(v2.potential)}% · ${ui('关键窗口','Windows')} ${v2.windows==null?'—':Math.round(v2.windows)}% · ${ui('可信度','Confidence')} ${Math.round(v2.confidence*100)}%${v2.confidence<.6?` · ${ui('仅供参考','indicative only')}`:''}</div></div>`}
  const KEEPER_DIMS=()=>[['R',ui('资源','Res.')],['P',ui('出牌','Plays')],['T',ui('节奏','Tempo')],['K',ui('钥令','Key')],['S',ui('风险','Risk')],['C',ui('协同','Team')]];
  const DIMS_UI=()=>[['out',ui('输出','Output')],['def',ui('防御','Defense')],['sup',ui('辅助','Support')]];
  function renderMvp(full,tl,st){
    const res=tl.res,m=st.mvp,total=st.totalDmg;if(!m)return '';
    const tile=(label,cls,head,subs)=>head?`<div class="mr2mvp ${cls}"><div class="mr2mvptag">${label}</div>${head}${subs?`<div class="mr2mvpsub">${subs}</div>`:''}</div>`:'';
    const a=m.awakeners[0],w=m.wheels[0],c=m.covenants[0],r=m.relics[0];
    const DIM=DIMS_UI();
    const topDimsOf=o=>DIM.filter(([k])=>o.cats[k]!=null).map(([k,l])=>`${l} ${Math.round(o.cats[k])}`).join(' · ');
    const topDims=topDimsOf;
    const awHead=a?`<div class="mr2mvpmain">${ico(a.r.a.icon,a.r.a.name,'av mvp')}<div><b>${esc(a.r.a.name)} <span class="mr2grade g${a.grade}">${a.grade}</span></b><span>${ui('综合评分','Score')} <em>${a.score.toFixed(1)}</em> / 100</span><small>${esc(topDims(a))}</small></div></div><div class="mr2mvpkv"><span>${ui('伤害','DMG')} <b>${fmt(a.r.dmg)}</b> ${total?pctOf(a.r.dmg,total):0}%</span><span>${ui('护盾 / 治疗','Shield / Heal')} <b>${fmt(a.r.block)}</b> / <b>${fmt(a.r.heal)}</b></span><span>${ui('出牌','Cards')} <b>${a.r.plays}</b></span></div>`:'';
    const awSubs=m.awakeners.slice(1,3).map(x=>`<span>${ico(x.r.a.icon,x.r.a.name,'av xs')}${esc(x.r.a.name)} <b>${x.score.toFixed(1)}</b> <i class="mr2grade g${x.grade}">${x.grade}</i></span>`).join('');
    const itemLine=(x,tail)=>`<span>${ui('综合评分','Score')} <em>${x.score.toFixed(1)}</em> <i class="mr2grade g${x.grade}">${x.grade}</i></span><small>${esc(topDimsOf(x))}${tail?` · ${esc(tail)}`:''}</small>`;
    const gearHead=(x,kindLabel)=>x?`<div class="mr2mvpmain">${ico(x.g.icon,x.g.name,`gi ${x.g.kind==='wheel'?'':'cov'} mvp`)}<div><b>${esc(x.g.name)}</b>${itemLine(x,`${kindLabel} · ${ui('触发','triggers')} ${x.g.n}${x.val>0?` · ${ui('估算贡献','est.')} ${fmt(Math.round(x.val))}`:''}`)}</div></div>`:'';
    const gearSubs=l=>l.slice(1,3).map(x=>`<span>${ico(x.g.icon,x.g.name,'gi xs')}${esc(x.g.name)} <b>${x.score.toFixed(1)}</b> <i class="mr2grade g${x.grade}">${x.grade}</i></span>`).join('');
    const relHead=r?`<div class="mr2mvpmain">${ico(relicIconSrc(res,r.r.tid),res.nameRelic(r.r.tid),'rl mvp')}<div><b>${esc(res.nameRelic(r.r.tid))}</b>${itemLine(r,`${r.r.start?ui('开局携带','Starting'):ui('战斗中获得','Gained')} · ${ui('触发','triggers')} ${r.r.n}${r.val>0?` · ${ui('估算贡献','est.')} ${fmt(Math.round(r.val))}`:''}${r.r.buff&&r.r.buff.gain>0?` · ${r.r.buff.kind==='power'?ui(`产生 ${fmt(r.r.buff.gain)} 力量`,`+${fmt(r.r.buff.gain)} power`):ui('基伤加成','base dmg')}`:''}`)}</div></div>`:'';
    const relSubs=m.relics.slice(1,3).map(x=>`<span>${ico(relicIconSrc(res,x.r.tid),res.nameRelic(x.r.tid),'rl xs')}${esc(res.nameRelic(x.r.tid))} <b>${x.score.toFixed(1)}</b> <i class="mr2grade g${x.grade}">${x.grade}</i></span>`).join('');
    /* structured data for the MVP image export */
    try{const kp0=m.keeper,v=kp0?.v2;window.__mr2MvpExport={
      keeper:kp0&&kp0.score!=null?{name:keeperName()||ui('守密人','Keeper'),score:kp0.score,grade:kp0.grade,dims:v?KEEPER_DIMS().map(([k0,l])=>[l,v.dims[k0]]):[],potential:v?.potential,windows:v?.windows,conf:v?.confidence,facts:v?.facts||null}:null,
      aw:m.awakeners.map(o=>({name:o.r.a.name,icon:o.r.a.icon,score:o.score,grade:o.grade,dims:DIM.filter(([k])=>o.cats[k]!=null).map(([k,l])=>[l,o.cats[k]]),dmg:o.r.dmg,pct:total?pctOf(o.r.dmg,total):0,block:o.r.block,heal:o.r.heal,plays:o.r.plays})),
      wheels:m.wheels.slice(0,3).map(o=>({name:o.g.name,icon:o.g.icon,score:o.score,grade:o.grade,n:o.g.n,val:o.val,dims:DIM.filter(([k])=>o.cats[k]!=null).map(([k,l])=>[l,o.cats[k]])})),
      covs:m.covenants.filter(o=>o.val>0||o.g.n>0).slice(0,3).map(o=>({name:o.g.name,icon:o.g.icon,score:o.score,grade:o.grade,n:o.g.n,val:o.val,dims:DIM.filter(([k])=>o.cats[k]!=null).map(([k,l])=>[l,o.cats[k]])})),
      relics:m.relics.slice(0,3).map(o=>({name:res.nameRelic(o.r.tid),icon:relicIconSrc(res,o.r.tid),score:o.score,grade:o.grade,n:o.r.n,val:o.val,start:!!o.r.start,dims:DIM.filter(([k])=>o.cats[k]!=null).map(([k,l])=>[l,o.cats[k]])})),
      total}}catch(e){window.__mr2MvpExport=null}
    return `<div class="mr2mvps"><div class="mr2mvptitle">${ui('结算 · MVP','Result · MVP')}<small>${ui('唤醒体 / 命轮 / 造物 / 密契按综合评分选出：输出、防御、辅助三大类（再乘出牌效率修正），点击评分行展开全部评估项','All MVPs are picked by a composite rating; see the model below')}</small></div><div class="mr2mvpgrid">${tile(ui('MVP 唤醒体','MVP Awakener'),'aw',awHead,awSubs)}${tile(ui('MVP 命轮','MVP Wheel'),'wh',gearHead(w,ui('命轮','Wheel')),gearSubs(m.wheels))}${tile(ui('MVP 造物','MVP Relic'),'rel',relHead,relSubs)}${m.keeper&&m.keeper.score!=null?tile(ui('守密人评分','Keeper'),'kp',`<div class="mr2mvpmain">${ico('','守','av mvp')}<div><b>${esc(keeperName()||ui('守密人','Keeper'))} <span class="mr2grade g${m.keeper.grade}">${m.keeper.grade}</span></b><span>${ui('综合评分','Score')} <em>${m.keeper.score.toFixed(1)}</em> / 100</span><small>${m.keeper.v2?KEEPER_DIMS().map(([k0,l])=>`${l} ${m.keeper.v2.dims[k0]==null?'—':Math.round(m.keeper.v2.dims[k0])}`).join(' · '):''}</small>${m.keeper.v2?`<small>${ui('潜力实现','Potential')} ${m.keeper.v2.potential==null?'—':Math.round(m.keeper.v2.potential)}% · ${ui('关键窗口','Windows')} ${m.keeper.v2.windows==null?'—':Math.round(m.keeper.v2.windows)}% · ${ui('可信度','Confidence')} ${Math.round(m.keeper.v2.confidence*100)}%${m.keeper.v2.confidence<.6?` · ${ui('仅供参考','indicative only')}`:''}</small>`:''}</div></div>`,''):''}${c&&(c.val>0||c.g.n>0)?tile(ui('MVP 密契','MVP Covenant'),'cov',gearHead(c,ui('密契','Covenant')),gearSubs(m.covenants)):''}</div>${ratingPanel(m,total,DIM,res)}</div>`;
  }
  // one expandable table of every metric behind a rating
  function ratingDetail(x,res){
    const f=v=>fmt(Math.round(v)),row=(label,val,score,note='')=>`<div class="mr2mrow"><span>${label}${note?` <small>${esc(note)}</small>`:''}</span><b>${val}</b><i class="mr2msc"><u style="width:${score==null?0:Math.max(0,Math.min(100,score)).toFixed(0)}%"></u></i><em>${score==null?'—':Math.round(score)}</em></div>`;
    const o=x.out,so=x.cats.out;
    const typeNote=l=>l.sort((p,q)=>(q.v??q.c)-(p.v??p.c)).slice(0,4).map(t=>`${t.n} ${f(t.v??t.c)}`).join('、');
    const dbBy=k=>x.dbTypes.filter(t=>t.k===k);
    const outRows=[[ui('直接伤害（出牌 / 技能 / 爆发）','Direct'),o.dir],[ui('持续伤害（出血 / 中毒 / 献祭 / 侵蚀…）','DoT'),o.dot],[ui('反击','Counter'),o.ctr],[ui('斩杀（命运裁断等）','Execute'),o.exe],[ui('触腕 / 怒涛（折算）','Tentacle'),o.ten],[ui('其他状态伤害','Other states'),o.oth]].filter(r=>r[1]>0).map(r=>row(r[0],f(r[1]),null)).join('')||`<div class="mr2empty">—</div>`;
    const ctlNote=[...dbBy('ctrl'),...dbBy('weak'),...dbBy('frail')].map(t=>({n:t.n,c:t.c}));
    const defRows=[row(ui('护盾','Shield'),f(x.block||0),x.defS.sh,ui('护盾 + 1.2×治疗 合并计分','shield + 1.2×heal')),row(ui('治疗','Heal'),f(x.heal||0),null),...(x.maxHp>0?[row(ui('生命上限提升（饱餐等，按 0.5 折算入护盾项）','Max HP gained'),f(x.maxHp),null)]:[]),
      row(ui('减伤（降低敌方伤害：虚弱 / 降力 / 痴醉 / 恐惧…）','Mitigation'),f(x.mit),x.defS.mit,typeNote(x.prevTypes)),
      row(ui('控制与弱化（眩晕 / 石化 / 冻结 / 虚弱 / 脆弱 上层次数）','Control'),f((x.dbCls.ctrl||0)+(x.dbCls.weak||0)+(x.dbCls.frail||0)),x.defS.ctl,typeNote(ctlNote)),
      row(ui('死亡抵抗（面板 / 额外提供 + 救场归属）','Death resist'),f(x.dr),x.defS.dr,x.saves>0?ui(`救场 ${x.saves.toFixed(1)} 次归属`,`${x.saves.toFixed(1)} saves credited`):'')].join('');
    const S=x.sup,ss=x.supS;
    const supRows=[
      ['key',ui('银钥能量','Keyflare energy'),f(S.key),''],
      ['ali',ui('充狂（给队友 + 0.5×给自己）','Aliemus'),f(S.ali),ui(`队友 ${f(x.aliOthers||0)} / 自己 ${f(x.aliSelf||0)}`,'')],
      ['seal',ui('黑印','Black seals'),f(S.seal),''],
      ['eng',ui('算力（产生 + 制造灵感 + 复制减费）','Energy'),f(S.eng),ui(`产生 ${f(x.engBase||0)} · 灵感 ${x.inspire||0} · 复制减费 ${f(x.costCut||0)}`,'')],
      ['vuln',ui('易伤（带来的增伤 / 上层次数）','Vulnerability'),f(S.vuln),typeNote(dbBy('vuln'))],
      ['buf',ui('其他伤害加成（力量 / 暴击 / 基伤的间接伤害）','Damage buffs'),f(S.buf),ui(`力量 ${f(x.bufPower||0)} · 暴击 ${f(x.bufCrit||0)}`,'')],
      ['cut',ui('减费（点数）','Cost cuts'),f(S.cut),ui(`复制 ${f(x.copies||0)} 张`,'')],
      ['draw',ui('抽牌','Draws'),f(S.draw),''],['cyc',ui('过牌（取回 / 置顶 / 效果弃牌）','Cycling'),f(S.cyc),''],
      ['realm',ui('界域精通','Realm mastery'),f(S.realm),''],['emb',ui('胚胎融合 / 制造胚胎','Embryo fusion'),f(S.emb),'']
    ].filter(r=>(S[r[0]]||0)>0).map(r=>row(r[1],r[2],ss[r[0]],r[3])).join('')||`<div class="mr2empty">—</div>`;
    const eff=x.eff?`<div class="mr2effline">${ui('出牌效率','Card efficiency')}：${ui(`贡献份额 ${(x.eff.cs*100).toFixed(1)}% ÷ 牌权份额 ${(x.eff.pw*100).toFixed(1)}% = ${x.eff.ratio.toFixed(2)}，综合评分 ×${x.eff.mod.toFixed(2)}`,`ratio ${x.eff.ratio.toFixed(2)}, score ×${x.eff.mod.toFixed(2)}`)}</div>`:'';
    return `<div class="mr2mgrid"><div class="mr2mcol"><h6>${ui('输出','Output')} <em>${so==null?'—':Math.round(so)}</em></h6>${outRows}</div><div class="mr2mcol"><h6>${ui('防御','Defense')} <em>${x.cats.def==null?'—':Math.round(x.cats.def)}</em></h6>${defRows}</div><div class="mr2mcol"><h6>${ui('辅助','Support')} <em>${x.cats.sup==null?'—':Math.round(x.cats.sup)}</em></h6>${supRows}</div></div>${eff}`;
  }
  function keeperDetail(k,res){
    const f=v=>fmt(Math.round(v)),pct=v=>v==null?'—':`${(v*100).toFixed(0)}%`,sc=v=>v==null?'—':Math.round(v);
    const row=(label,val,score,note='')=>`<div class="mr2mrow"><span>${label}${note?` <small>${esc(note)}</small>`:''}</span><b>${val}</b><i class="mr2msc"><u style="width:${score==null?0:Math.max(0,Math.min(100,score)).toFixed(0)}%"></u></i><em>${score==null?'—':Math.round(score)}</em></div>`;
    const name=t=>res.nameSkill(t);
    const picks=k.picks.length?k.picks.map(p=>`<div class="mr2mrow"><span>${ui(`第 ${p.round} 回合`,`R${p.round}`)} <small>${ui('选择','picked')} ${esc(name(p.chosen))}${p.ratio!=null&&p.bestTid!=null&&String(p.bestTid)!==String(p.chosen)?` · ${ui('已知最优','best known')} ${esc(name(p.bestTid))}`:''}</small></span><b>${p.cv==null?'—':p.cv.toFixed(2)}</b><i class="mr2msc"><u style="width:${p.ratio==null?0:(p.ratio*100).toFixed(0)}%"></u></i><em>${p.ratio==null?'—':Math.round(p.ratio*100)}</em></div>`).join(''):`<div class="mr2empty">${ui('本场没有可比较的钥令选择','No comparable keyflare picks')}</div>`;
    const kv=k.kv.sort((a,b)=>b.val-a.val).map(v=>`<div class="mr2mrow"><span>${esc(name(v.tid))} <small>${v.n}× · ${ui(`伤害 ${f(v.dmg)} · 防御 ${f(v.def)} · 辅助 ${f(v.util)}`,`dmg ${f(v.dmg)} / def ${f(v.def)} / util ${f(v.util)}`)}</small></span><b>${v.val.toFixed(2)}</b><i class="mr2msc"><u style="width:${Math.min(100,v.val*50)}%"></u></i><em></em></div>`).join('');
    const rr=k.rrows.map(r=>`<div class="mr2mrow"><span>${ui(`第 ${r.round} 回合`,`R${r.round}`)} <small>${ui(`手${r.hand}·出${r.played}·能${r.budget}`,`${r.hand}/${r.played}/${r.budget}`)}</small></span><b>${ui(`伤${pct(r.oD>0?r.aD/r.oD:null)} 防${pct(r.oF>0?r.aF/r.oF:null)}`,`d${pct(r.oD>0?r.aD/r.oD:null)} f${pct(r.oF>0?r.aF/r.oF:null)}`)}</b><i class="mr2msc"><u style="width:${(()=>{const a=[r.oD>0?r.aD/r.oD:null,r.oF>0?r.aF/r.oF:null].filter(v=>v!=null);return a.length?(100*a.reduce((x,y)=>x+y,0)/a.length).toFixed(0):0})()}%"></u></i><em></em></div>`).join('')||`<div class="mr2empty">—</div>`;
    const v2=k.v2,fx=v2?.facts||{},pc=v=>v==null?'—':`${Math.round(v*10)/10}%`;
    const LAB={R:ui('资源管理','Resources'),P:ui('出牌决策','Card plays'),T:ui('节奏效率','Tempo'),K:ui('钥令 / 守密人技能','Keyflare'),S:ui('风险控制','Risk'),C:ui('团队协同','Teamwork')};
    const v2html=v2?`<div class="mr2mcol v2"><h6>${ui('守密人评分模型（6 维 + 置信度）','Keeper model (6 dimensions + confidence)')} <em>${sc(v2.score)}</em></h6>
      <small class="mr2from">${ui('只评价玩家能控制的决策，使用比率型指标，不把队伍强度、命轮密契强度和发牌运气算到守密人头上。总分 = 0.22 资源 + 0.22 出牌 + 0.18 节奏 + 0.14 钥令 + 0.14 风险 + 0.10 协同（缺项时按其余维度重新归一）。','Ratio-type decision metrics; weights 22/22/18/14/14/10, renormalised over measurable dimensions.')}</small>
      ${Object.keys(v2.weights).map(key=>row(`${LAB[key]} <small>${ui('权重','w')} ${Math.round(v2.weights[key]*100)}%</small>`,v2.dims[key]==null?'—':Math.round(v2.dims[key]),v2.dims[key],ui(`可信度 ${Math.round((v2.conf[key]||0)*100)}%`,`conf ${Math.round((v2.conf[key]||0)*100)}%`))).join('')}
      ${row(ui('潜力实现率（实际出牌价值 ÷ 同手牌同算力下的估计最优）','Potential realised'),v2.potential==null?'—':Math.round(v2.potential)+'%',v2.potential)}
      ${row(ui('关键窗口利用（易伤 / 增益窗口内的输出占比）','Window use'),v2.windows==null?'—':Math.round(v2.windows)+'%',v2.windows)}
      ${row(ui('数据置信度','Data confidence'),Math.round(v2.confidence*100)+'%',v2.confidence*100,v2.confidence<.6?ui('评分仅供参考','indicative only'):'')}
      <h6 style="margin-top:8px">${ui('事实数据（可追溯）','Facts')}</h6>
      <div class="mr2facts">
        <span>${ui('算力消耗 / 回合末剩余 / 溢出','Energy spent / left / overflow')} <b>${f(fx.energySpent||0)} / ${f(fx.energyLeft||0)} / ${f(fx.energyOverflow||0)}</b></span>
        <span>${ui('回合末弃牌 / 零产出出牌','Discards / zero-value plays')} <b>${f(fx.discards||0)} / ${f(fx.zeroValuePlays||0)}</b></span>
        <span>${ui('平均决策机会损失','Mean regret')} <b>${pc(fx.regretPct)}</b></span>
        <span>${ui('出牌顺序损失（易伤晚于伤害）','Ordering loss')} <b>${pc(fx.orderLossPct)}</b></span>
        <span>${ui('回合数 / 同关卡样本','Rounds / stage samples')} <b>${fx.rounds} / ${fx.stageSamples||0}</b></span>
        <span>${ui('节奏百分位（越小越快）','Tempo percentile')} <b>${fx.topPct==null?'—':'Top '+pc(fx.topPct)}</b></span>
        <span>${ui('每回合出牌','Plays per round')} <b>${fx.playsPerRound}</b></span>
        <span>${ui('钥令使用 / 每次价值','Keyflare uses / value each')} <b>${fx.keeperUses} / ${fx.keeperValuePerUse==null?'—':fx.keeperValuePerUse}</b></span>
        <span>${ui('死亡抵抗 / 濒危回合','Death resist / critical rounds')} <b>${fx.deathResist} / ${fx.lethalRounds}</b></span>
        <span>${ui('治疗溢出','Overheal')} <b>${pc(fx.overhealPct)}</b></span>
        <span>${ui('易伤窗口覆盖','Vulnerability coverage')} <b>${pc(fx.vulnCoveragePct)}</b></span>
        <span>${ui('队友增益借力','Buff leverage')} <b>${pc(fx.buffLeveragePct)}</b></span>
      </div><small class="mr2from">${ui('护盾溢出目前无法从回放可靠还原，未计入。','Shield overflow cannot be reconstructed reliably and is not included.')}</small></div>`:'';
    const E=k.eff;
    return `<div class="mr2mgrid">${v2html}
      <div class="mr2mcol"><h6>${ui('钥令选择','Keyflare choice')} <em>${sc(k.pickScore)}</em></h6><small class="mr2from">${ui('已选技能的实际价值（伤害 / 防御 / 辅助按全队单张出牌均值归一后相加）÷ 同次可选技能中已知价值最高者','Realised value of the chosen skill vs best known alternative')}</small>${picks}</div>
      <div class="mr2mcol"><h6>${ui('战斗效率','Battle efficiency')} <em>${sc(k.effScore)}</em></h6>
        ${row(ui('算力利用率','Energy used'),pct(E.e1),E.e1==null?null:E.e1*100,ui(`消耗 ${f(E.spent)} / 回合末剩余 ${f(E.waste)}`,''))}
        ${row(ui('手牌利用率（未被回合末弃掉）','Hand used'),pct(E.e2),E.e2==null?null:E.e2*100,ui(`打出 ${f(E.used)} / 回合末弃牌 ${f(E.disc)}`,''))}
        ${row(ui('算力未溢出','No overflow'),pct(E.e3),E.e3==null?null:E.e3*100,ui(`溢出 ${f(E.over)}`,''))}</div>
      <div class="mr2mcol"><h6>${ui('出牌是否最优','Play optimality')} <em>${sc(k.playScore)}</em></h6><small class="mr2from">${ui(`同一手牌、同一算力下，用每张牌的平均实际产出估算最优组合（背包）。伤害达成 ${pct(k.rD)}，防御达成 ${pct(k.rF)}`,`Best achievable damage / defence with the same hand and energy`)}</small>${rr}</div>
      <div class="mr2mcol"><h6>${ui('各钥令实际价值','Keyflare values')}</h6>${kv||`<div class="mr2empty">—</div>`}</div></div>`;
  }
  function ratingPanel(m,total,DIM,res){
    if(!m.awakeners.length)return '';
    const W=m.model.CAT_W,T=m.model.totals,SW=m.model.SUBW;
    const cells=o=>DIM.map(([k,l])=>`<span class="${o.cats[k]==null?'na':''}"><small>${esc(l)}</small><b>${o.cats[k]==null?'—':Math.round(o.cats[k])}</b></span>`).join('');
    const enhLine=o=>{const chips=[];if(o.enh?.roleLabel)chips.push(`<i class="strong">${esc(o.enh.roleLabel)}</i>`);for(const f of o.enh?.features||[])chips.push(`<i${f.strong?' class="strong"':''}>${esc(f.label)}</i>`);for(const f of o._sm?.f||[])chips.push(`<i${f.strong?' class="strong"':''}>${esc(f.label)}</i>`);return chips.length?`<div class="mr2enhscore">${ui('定位 / 机制价值','Role / mechanism value')}<div class="mr2enhchips">${chips.join('')}</div></div>`:''};
    const row=(icon,name,o,top)=>`<details class="mr2rrowd${top?' top':''}"><summary class="mr2rrow"><span class="mr2rn">${icon}<b>${esc(name)}</b><i class="mr2grade g${o.grade}">${o.grade}</i></span><span class="mr2rscore"><i style="width:${o.score.toFixed(1)}%"></i><b>${o.score.toFixed(1)}</b></span><span class="mr2rdims">${cells(o)}</span></summary><div class="mr2rdetail">${enhLine(o)}${ratingDetail(o.x||o,res)}</div></details>`;
    const awRows=m.awakeners.map((o,i)=>row(ico(o.r.a.icon,o.r.a.name,'av'),o.r.a.name,o,!i)).join('');
    const kp=m.keeper,kpRow=kp&&kp.score!=null?`<details class="mr2rrowd"><summary class="mr2rrow"><span class="mr2rn">${ico('','守','av keeper')}<b>${esc(keeperName()||ui('守密人（决策）','Keeper (decisions)'))}</b><i class="mr2grade g${kp.grade}">${kp.grade}</i>${kp.v2?`<small class="mr2conf">${ui('可信度','Confidence')} ${Math.round(kp.v2.confidence*100)}%</small>`:''}</span><span class="mr2rscore"><i style="width:${kp.score.toFixed(1)}%"></i><b>${kp.score.toFixed(1)}</b></span><span class="mr2rdims kp6">${KEEPER_DIMS().map(([key,l])=>`<span class="${kp.v2?.dims?.[key]==null?'na':''}"><small>${l}</small><b>${kp.v2?.dims?.[key]==null?'—':Math.round(kp.v2.dims[key])}</b></span>`).join('')}</span></summary><div class="mr2rdetail">${keeperDetail(kp,res)}</div></details>`:'';
    const itemList=(list,iconOf,nameOf)=>list.length?list.map((o,i)=>row(iconOf(o),nameOf(o),o,!i)).join(''):`<div class="mr2empty">—</div>`;
    const items=`<details class="mr2minor"><summary>${ui('命轮 / 造物 / 密契评分','Wheel / relic / covenant ratings')}</summary>
      <div class="mr2rating"><h5>${ui('命轮','Wheels')}</h5>${itemList(m.wheels,o=>ico(o.g.icon,o.g.name,'gi'),o=>o.g.name)}</div>
      <div class="mr2rating"><h5>${ui('造物','Relics')}</h5>${itemList(m.relics,o=>ico(relicIconSrc(res,o.r.tid),res.nameRelic(o.r.tid),'rl'),o=>res.nameRelic(o.r.tid))}</div>
      <div class="mr2rating"><h5>${ui('密契','Covenants')}</h5>${itemList(m.covenants,o=>ico(o.g.icon,o.g.name,'gi cov'),o=>o.g.name)}</div>
      <small class="mr2from">${ui('命轮 / 造物 / 密契按同样的三大类、在各自类别内互相比较；它们的算力、充狂、银钥、减益等来自「触发的同一帧内发生的效果」，无法精确归属的不计入，评分偏保守。','Items use the same three categories within their own class; effects are credited only when they land in the frame the item fires.')}</small></details>`;
    const subW=(o)=>Object.entries(o).map(([k,v])=>`${k}×${v}`).join(' ');
    const model=ui(`<p><b>三大类均分</b>：输出、防御、辅助各占 1/3（本场没人产出的大类自动剔除并重新分配）。每个小项的得分 = 占同类总量的份额，达到公平份额（1/${m.model.N}）的 2 倍记 100 分；大类得分是其小项得分的加权平均，<b>综合评分 = 大类加权平均 × 出牌效率修正（×0.90~1.10）</b>。点击每一行可展开全部小项。</p>
      <ul><li><b>输出</b>：造成的全部伤害，细分直接伤害（出牌 / 技能 / 爆发）、持续伤害（出血 / 中毒 / 献祭 / 侵蚀…）、反击、斩杀、触腕 / 怒涛（按各唤醒体提高的触腕伤害加成占比折算）、其他状态伤害；以统计包为准。</li>
      <li><b>防御</b>（小项权重 护盾+治疗 ${SW.def.sh} · 减伤 ${SW.def.mit} · 控制与弱化 ${SW.def.ctl} · 死亡抵抗 ${SW.def.dr}）：护盾 + 1.2×治疗；<u>减伤</u> = 降低敌方多少伤害（按敌方每次主动攻击的实际伤害反推：虚弱 / 痴醉 / 恐惧固着等百分比减伤 = 伤害×p/(1−p)，降力等固定减伤 = 降低的点数，按状态施加者分摊）；控制与弱化 = 眩晕 / 石化 / 冻结等控制（每次 3 点）与虚弱 / 脆弱上层（每次 2 点）；死亡抵抗 = 面板值 + 战斗中额外提供，并按占比分配「实际救场」次数（每次 100 点）。</li>
      <li><b>辅助</b>（小项权重 ${subW(SW.sup)}）：银钥能量、充狂（给队友 + 0.5×给自己）、黑印、算力（产生 + 制造灵感 + 复制减费）、易伤（带来的增伤，没有则按上层次数）、其他伤害加成（力量 / 暴击伤害 / 暴击率 / 基础伤害的间接额外伤害，用拟合的力量倍率和逐次命中估算）、减费（卡牌算力消耗降低点数）、抽牌、过牌（取回 / 置顶 / 效果弃牌）、界域精通、胚胎融合。</li></ul>
      <p><b>守密人（决策）</b>：钥令选择、战斗效率、出牌是否最优三项均分。钥令选择 = 所选钥令的实际价值 ÷ 同次可选技能里已知价值最高者；战斗效率 = 算力利用率、手牌利用率（回合末未被弃掉）、算力未溢出的平均；出牌最优 = 每回合在同一手牌、同一算力预算下，所打出的牌相对于背包最优组合所能达到的伤害 / 防御比例（每张牌的产出取本场实际平均值估算）。</p><p>归属规则：同一帧触发的造物 > 同一帧触发的命轮 / 密契 > 正在结算的行动（含派生技能的施放者）> 无来源（回合开始等被动，不计）。回放没有记录战斗内黑印的变化，黑印一项保留但通常为 0；减伤只统计敌方的主动攻击。等级：≥80 S，≥65 A，≥50 B，≥35 C，其余 D。</p>
      <p><b>增强模型（已合并）</b>：唤醒体按主定位自适应（主职权重最高，并用贡献 / 牌权修正效率）；命轮 / 密契综合实战贡献与静态机制价值（手牌上限、算力上限、抽牌、减费、易伤、死亡抵抗、取回循环等按语义计分）；守密人按出牌决策、资源管理、钥令选择分层计分，未知信息按置信度收缩。</p>
      <p>全队合计：输出 ${fmt(T.out)}，护盾+治疗 ${fmt(Math.round(T.sh))}，减伤 ${fmt(Math.round(T.mit))}，控制弱化 ${fmt(Math.round(T.ctl))}；实际救场 ${m.model.deathSaves} 次。</p>`,`<p>Three categories (output / defense / support), each a weighted mean of share-based sub-scores; the composite is multiplied by a 0.9-1.1 card-efficiency factor. Click a row for every sub-metric.</p>`);
    return `<div class="mr2rating"><h5>${ui('唤醒体综合评分','Awakener ratings')} <small class="mr2from">${ui('点击一行展开全部评估项','click a row for every metric')}</small></h5>${awRows}${kpRow}${kp?.v2?keeperRadar(kp.v2):''}${items}<details class="mr2minor"><summary>${ui('评分模型','Rating model')}</summary><div class="mr2rmodel">${model}</div></details></div>`;
  }
  function renderFull(full){
    const host=document.getElementById('mrReplayResult');if(!host)return;snapStore=[];lastFull=full;const tl=buildTimeline(full),bd=full.battleDat||{},rounds=tl.rounds;
    Object.assign(RES_LABEL,{energy:ui('算力','Energy'),keeper_energy:ui('钥令能量','Keyflare'),ulti_energy:ui('狂气','Aliemus'),block:ui('护盾','Shield')});
    const st=computeStats(full,tl);
    const openingHtml=renderOpening(full,tl)+renderStats(full,tl);
    const eventHtml=openingHtml+rounds.map((r,ri)=>renderRound(r,tl,ri<2)).join('');
    setTimeout(()=>wireInteractions(host),0);
    const exp=document.getElementById('mrReplayExport');if(exp)exp.disabled=false;
    host.innerHTML=`${renderBattleInfo(full,tl)}${renderMvp(full,tl,st)}<details class="mr2detail"><summary><b>${ui('详细数据','Details')}</b><small>${ui('开局 / 数据统计 / 逐回合事件，点击展开','opening / statistics / per-round events')}</small></summary><div class="mr2sum"><span><small>battleTid</small><strong>${esc(bd.battleTid??'—')}</strong></span><span><small>${ui('回合','Rounds')}</small><strong>${rounds.length}</strong></span><span><small>${ui('录像记录','Records')}</small><strong>${fmt(full.recordCount)}</strong></span><span><small>${ui('原始帧','Frames')}</small><strong>${fmt(tl.frameCount)}</strong></span></div><div class="mr2status">${ui('每个回合按「我方/敌方 × 开始结算/行动/结束结算」拆分：算力与资源回复、状态变化归入结算；出牌、爆发、钥令和敌方行动单独成条，其造成的伤害、状态、资源变化嵌套在对应行动下。所有 UID/TID 已对应为唤醒体头像、卡牌名、造物与状态图标，鼠标悬停可看原始 UID/TID，展开「原始事件」可查看完整数据。','Each round is split into ally/enemy × start / action / end. Resource recovery and state changes are grouped as settlement; cards, ultimates, keeper skills and enemy actions are separate entries with their damage, states and resource changes nested beneath. UIDs/TIDs are resolved to awakener portraits, card names, relic and state icons; hover for raw IDs, expand Raw event for the full payload.')}</div><div class="mr2toolbar"><label class="mr2tog"><input type="checkbox" id="mr2ShowDesc"> ${ui('展开所有效果说明','Expand all effect descriptions')}</label><span class="mr2from">${ui('鼠标悬停在卡牌、钥令、意图、状态、造物上可看详细效果；点击行动卡片标题可单独展开。','Hover cards, keyflare skills, intents, states and relics for details; click an action header to expand it.')}</span></div><div class="mr2legend">${[['#ff8a3d',ui('狂气爆发','Burst')],['#ffd24a',ui('灵知觉醒','Awakening')],['#b57cff',ui('钥令','Keyflare')],['#ff6b6b',ui('打击','Strike')],['#4fd18b',ui('防御','Defend')],['#4aa3ff',ui('技能牌','Skill')],['#8e86a8',ui('诅咒','Curse')],['#4fd0c8',ui('其他出牌','Other')],['#ff5c8a',ui('敌方行动','Enemy')]].map(([c,t])=>`<span><i style="--c:${c}"></i>${t}</span>`).join('')}</div>${eventHtml||`<div class="mr2status err">${ui('已解码回放，但没有解析到回合事件。','Replay decoded, but no round events were recognized.')}</div>`}</details>`;
  }
  async function loadLegacy(uuid){try{const r=await fetch(`${LOCAL_BASE}/${uuid}.json`,{cache:'no-cache'});return r.ok?await r.json():null}catch{return null}}
  // 灵塑 level: the talent state in the replay carries the soulforge arguments resolved at the real level; invert them against the talent table
  let skAwakeners=null;
  async function loadSoulforge(full){
    const out=new Map();Object.defineProperty(full,'__sf',{value:out,enumerable:false,configurable:true});
    try{
      if(!skAwakeners){const r=await fetch('data/morimens/skeydb/awakeners.json',{cache:'force-cache'});skAwakeners=r.ok?(await r.json()).records||[]:[]}
      const res=resources(full),list=full.battleDat?.stateList||[];
      await Promise.all((full.battleDat?.roleData||[]).map(async ri=>{
        const nm=String(res.aw[String(ri.tid)]?.NameEn||'').toLowerCase(),rec=skAwakeners.find(x=>String(x.name).toLowerCase()===nm);if(!rec)return;
        const st=list.find(x=>String(x.ownerData?.uid)===String(ri.uid)&&(x.source||[]).some(q=>q.sourceType==='AwakerTalents')&&/通用天赋/.test(res.state[String(x.stateId)]?.CnID||'')),P=(st?.stateParams||[]).map(Number);if(P.length<2)return;
        const r=await fetch(`data/morimens/skeydb/public-v3/records/talents/talent.${rec.slug}.soulforge-aptitude.json`,{cache:'force-cache'});if(!r.ok)return;const t=await r.json(),a1=t.descriptionArgs?.Arg1,a2=t.descriptionArgs?.Arg2;if(!a1||!a2)return;
        const val=(a,L)=>a.kind==='linear'?Number(a.base)+Number(a.gainPerLevel)*(L-1):a.kind==='scaling'?Number(a.values?.[L-1]):NaN;
        for(let L=1;L<=(t.maxLevel||0);L++)if(Math.abs(val(a1,L)-P[0])<1e-6&&Math.abs(val(a2,L)-P[1])<1e-6){out.set(String(ri.uid),L);break}
      }));
      // wheel stack (叠位): the wheel state carries its arguments resolved at the real stack; find which stack of the wheel table they belong to
      const ws=new Map();Object.defineProperty(full,'__ws',{value:ws,enumerable:false,configurable:true});
      const wcat=(await (await fetch('data/morimens/skeydb/public-v3/catalogs/wheels.json',{cache:'force-cache'})).json()).records||[];
      await Promise.all(list.filter(x=>(x.source||[]).some(q=>q.sourceType==='Weapon')).map(async x=>{
        const q=x.source.find(z=>z.sourceType==='Weapon'),en=String(gearCatalog?.wheels?.[String(q.tid)]?.en||'').toLowerCase(),P=(x.stateParams||[]).map(Number);if(!en||!P.length)return;
        const rec=wcat.find(w=>String(w.name).toLowerCase()===en);if(!rec)return;
        const r=await fetch(`data/morimens/skeydb/public-v3/records/wheels/${rec.id}.json`,{cache:'force-cache'});if(!r.ok)return;const t=await r.json(),A=t.descriptionArgs||{};
        const vals=P.map((_,i)=>A['StateArg'+(i+1)]?.values);const max=Math.max(0,...vals.map(v=>v?.length||0));
        for(let k=0;k<max;k++)if(vals.every((v,i)=>!v||Math.abs(Number(v[k])-P[i])<1e-6)&&vals.some(Boolean)){ws.set(String(x.ownerData?.uid)+'|'+q.tid,{n:k+1,max});break}
      }));
    }catch(e){console.warn('Soulforge / wheel stack lookup failed',e)}
  }
  async function analyze(raw){
    const input=document.getElementById('mrReplayCode'),host=document.getElementById('mrReplayResult');if(raw!=null&&input)input.value=raw;const p=parseReplayCode(raw??input?.value);if(!host)return;if(!p){host.innerHTML=`<div class="mr2status err">${ui('请输入有效的 battleUuid 或 UUID#E#a 回放码。','Enter a valid battleUuid or UUID#E#a replay code.')}</div>`;return}
    host.innerHTML=`<div class="mr2status">${ui('正在从公开 BattleReplay 对象获取约 1MB 回放并解码 LZ4 + MessagePack…','Fetching the public BattleReplay object and decoding LZ4 + MessagePack…')}</div>`;
    try{const full=await fetchReplay(p.uuid);await preloadAssets();if(!full.__sf)await loadSoulforge(full);renderFull(full)}catch(err){console.error('Public replay fetch/decode failed',err);const legacy=await loadLegacy(p.uuid);if(legacy&&legacy.timeline){host.innerHTML=`<div class="mr2status err">${ui('公开回放对象获取失败（可能是浏览器 CORS 或对象已过期）。本站只有旧的聚合 timeline；请检查控制台错误。','Public replay fetch failed (browser CORS or expired object). Only the older aggregated local timeline is available; check console errors.')}</div>`}else host.innerHTML=`<div class="mr2status err"><strong>${ui('无法获取完整回放。','Could not fetch the full replay.')}</strong><br>${esc(err?.message||err)}<br>${ui('如果命令行 fetch_public_replay.py 能成功而浏览器失败，则原因基本是对象存储未允许本站域名的 CORS；这时需要在站点侧增加同源代理，而不是解 TLS。','If fetch_public_replay.py works but the browser fails, the likely cause is object-store CORS. The fix is a same-origin site proxy, not TLS decryption.')}</div>`}
  }
  // ---- export / import of the decoded structure ---------------------------------------------
  async function exportData(){
    if(!lastFull)return;
    const base=`morimens-replay-${lastFull.replayUuid||lastFull.battleDat?.battleUuid||'battle'}`;
    const text=JSON.stringify(lastFull);let blob,name;
    try{
      if(typeof CompressionStream==='undefined')throw new Error('no CompressionStream');
      blob=await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob();name=`${base}.json.gz`;
    }catch{blob=new Blob([text],{type:'application/json'});name=`${base}.json`}
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);
  }
  async function readImportFile(file){
    let buf=new Uint8Array(await file.arrayBuffer());
    if(buf[0]===0x1f&&buf[1]===0x8b){if(typeof DecompressionStream==='undefined')throw new Error('Browser cannot gunzip');buf=new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())}
    const j=JSON.parse(new TextDecoder('utf-8').decode(buf));
    const full=j&&j.battleDat&&j.recordSegments?j:(j&&j.full&&j.full.battleDat?j.full:null);
    if(!full)throw new Error(ui('文件不是回放结构化数据：需要包含 battleDat、resourceRecords、recordSegments（本页「导出数据」或 fetch_public_replay.py 的输出）。','Not a structured replay: battleDat, resourceRecords and recordSegments are required.'));
    if(!full.replayUuid)full.replayUuid=full.battleDat.battleUuid||'imported';
    if(!full.resourceRecords)full.resourceRecords={};
    if(full.recordCount==null)full.recordCount=full.recordSegments.reduce((n,x)=>n+(Array.isArray(x)?x.length:0),0);
    return full;
  }
  async function importData(file){
    const host=document.getElementById('mrReplayResult');if(!host||!file)return;
    host.innerHTML=`<div class="mr2status">${ui('正在读取并分析导入的数据…','Reading and analyzing imported data…')}</div>`;
    try{const full=await readImportFile(file);await preloadAssets();await loadSoulforge(full);const input=document.getElementById('mrReplayCode');if(input)input.value=full.replayUuid||'';renderFull(full)}
    catch(err){console.error('Replay import failed',err);host.innerHTML=`<div class="mr2status err"><strong>${ui('导入失败。','Import failed.')}</strong><br>${esc(err?.message||err)}</div>`}
  }
  function wireIo(panel){
    const exp=panel.querySelector('#mrReplayExport'),imp=panel.querySelector('#mrReplayImport'),file=panel.querySelector('#mrReplayFile');
    exp?.addEventListener('click',exportData);imp?.addEventListener('click',()=>file?.click());
    file?.addEventListener('change',()=>{const f=file.files?.[0];file.value='';if(f)importData(f)});
  }
  function activateTab(){document.querySelectorAll('#morimensTabs .morimensTab').forEach(t=>{t.classList.remove('active');t.setAttribute('aria-selected','false')});document.querySelectorAll('[role="tabpanel"]').forEach(p=>{if(p.id!=='morimensReplayPanel'&&p.closest('main,body'))p.hidden=true});const t=document.getElementById('morimensReplayTab'),p=document.getElementById('morimensReplayPanel');if(t){t.classList.add('active');t.setAttribute('aria-selected','true')}if(p)p.hidden=false;history.replaceState(null,'','#replay')}
  function enhance(root=document){root.querySelectorAll?.('.dtideReplayCopy,[data-replay-code]').forEach(copy=>{if(copy.classList.contains('dtideReplayReviewOpen')||copy.dataset.reviewV2Bound||!String(copy.dataset.replayCode||'').trim())return;copy.dataset.reviewV2Bound='1';const b=document.createElement('button');b.type='button';b.className='dtideReplayReviewOpen';b.title=ui('在「战斗回放复盘」中打开这条回放（demo）','Open this replay in Replay Review (demo)');b.textContent=ui('跳转回放复盘','Open review');b.addEventListener('click',e=>{e.stopPropagation();activateTab();analyze(copy.dataset.replayCode||'')});copy.insertAdjacentElement('afterend',b)})}
  function setup(){
    const tabs=document.getElementById('morimensTabs');if(!tabs)return false;styles();document.getElementById('morimensReplayTab')?.remove();document.getElementById('morimensReplayPanel')?.remove();
    const tab=document.createElement('button');tab.className='morimensTab';tab.id='morimensReplayTab';tab.setAttribute('role','tab');tab.setAttribute('aria-selected','false');tab.setAttribute('aria-controls','morimensReplayPanel');tab.innerHTML=`${esc(ui('战斗回放复盘','Replay Review'))}<span class="mr2tabdemo">demo</span>`;const anchor=document.getElementById('morimensZonesTab')||document.getElementById('morimensDtideTab');anchor?.insertAdjacentElement('afterend',tab)||tabs.appendChild(tab);
    const panel=document.createElement('div');panel.id='morimensReplayPanel';panel.setAttribute('role','tabpanel');panel.hidden=true;panel.innerHTML=`<section class="panel mr2"><div class="mr2intro"><div class="mr2introtop"><h2>${ui('战斗回放复盘','Battle Replay Review')}</h2><div class="mr2io"><button id="mrReplayExport" type="button" disabled title="${esc(ui('把当前回放导出为 gzip 压缩的结构化 JSON（.json.gz，可在本页重新导入；解压后与 fetch_public_replay.py 的输出格式一致）','Export the current replay as gzip-compressed structured JSON'))}">${ui('导出数据','Export')}</button><button id="mrReplayImport" type="button" title="${esc(ui('导入结构化 JSON（本页导出的文件，或 fetch_public_replay.py 的输出）并分析','Import structured JSON and analyze'))}">${ui('导入数据分析','Import & analyze')}</button><input id="mrReplayFile" type="file" accept=".json,.gz,application/json" hidden></div></div><p>${ui('输入回放可以获取详细数据，但回放只保存 30 天，过期回放无法获取。可输入 battleUuid 或游戏完整回放码；也可以用右上角「导入数据分析」载入之前导出的结构化 JSON。','Enter a replay to get detailed data. Replays are kept for only 30 days; expired ones cannot be fetched. You can also import a previously exported structured JSON with the button at the top right.')}</p><div class="mr2form"><input id="mrReplayCode" spellcheck="false" autocomplete="off" placeholder="bde26af0-1fdf-3645-8a01-705ce39b5ba9#E#a"><button id="mrReplayGo" type="button">${ui('获取并完整复盘','Fetch & Decode')}</button></div></div><div id="mrReplayResult"><div class="mr2status">${ui('等待输入回放 ID。','Waiting for a replay ID.')}</div></div></section>`;tabs.insertAdjacentElement('afterend',panel);
    tab.addEventListener('click',activateTab);wireIo(panel);panel.querySelector('#mrReplayGo').addEventListener('click',()=>analyze());panel.querySelector('#mrReplayCode').addEventListener('keydown',e=>{if(e.key==='Enter')analyze()});tabs.addEventListener('click',e=>{const t=e.target.closest('.morimensTab');if(t&&t!==tab){panel.hidden=true;tab.classList.remove('active');tab.setAttribute('aria-selected','false')}},true);
    enhance();new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1)enhance(n)}).observe(document.body,{subtree:true,childList:true});if(location.hash==='#replay')activateTab();return true;
  }
  if(!setup()){const mo=new MutationObserver(()=>{if(setup())mo.disconnect()});mo.observe(document.documentElement,{subtree:true,childList:true})}
  window.MorimensReplayReview={importData,exportData,renderFull,analyze,fetchReplay,buildTimeline,unpackLz4Msgpack,calibrateHits,computeStats,preloadAssets};
})();
