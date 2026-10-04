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
    const rr=full.resourceRecords||{};const skill=rr.Skill||{},aw=rr.AwakerConfig||{},state=rr.State||{},relic=rr.RelicConfig||{},monster=rr.MonsterConfig||{};
    const nameSkill=id=>{const x=skill[String(id)]||{};return pipeName(x.Name)||tailCn(x.CnID)||String(id)};
    const nameState=id=>{const x=state[String(id)]||{};return pipeName(x.Name)||tailCn(x.CnID)||`State ${id}`};
    const nameRelic=id=>{const x=relic[String(id)]||{};return pipeName(x.Name)||tailCn(x.CnID)||`Relic ${id}`};
    const nameAw=id=>{const x=aw[String(id)]||{};return isEn()?(x.NameEn||pipeName(x.Name)||String(id)):(pipeName(x.Name)||x.NameEn||String(id))};
    const nameMonster=id=>{const x=monster[String(id)]||{};const bestiary=pipeName(x.MonsterName)||pipeName(x.Name);return isEn()?(x.NameEn||bestiary||tailCn(x.CnID)||String(id)):(bestiary||tailCn(x.CnID)||x.NameEn||String(id))};
    const clean=f=>id=>String(f(id)).replace(/<[A-Za-z0-9_]+:([^<>]*)>/g,'$1').replace(/<\/?[A-Za-z][^<>]*>/g,'').trim();
    return {rr,skill,aw,state,relic,monster,nameSkill:clean(nameSkill),nameState:clean(nameState),nameRelic:clean(nameRelic),nameAw:clean(nameAw),nameMonster:clean(nameMonster)};
  }

  // ---- icons / entity resolution -------------------------------------------------
  const ART='assets/morimens';
  let awakenerSlugs=null;
  async function preloadAssets(){
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
  const relicIconSrc=(res,tid)=>{const r=res.relic[String(tid)]||{};const ic=r.SmallIcon||r.Icon;return ic?`${ART}/relics/${baseName(ic)}.webp`:''};
  const keeperSkillIconSrc=(res,id)=>{const m=String(res.skill[String(id)]?.Icon||'').match(/Key_(\d+)/);return m?`${ART}/posse/Icon/KeyToken_Skill_${m[1]}.webp`:''};


  const monsterPortrait=(res,tid)=>{const b=baseName(res.monster[String(tid)]?.MiniIcon);return b?`${ART}/monster-preview/${b}.webp`:''};

  // ---- description engine (tooltips / expandable details) ----------------------------
  const stripMarkup=t=>String(t||'').replace(/<[A-Za-z0-9_]+:([^<>]*)>/g,'$1').replace(/<\/?[A-Za-z][^<>]*>/g,'');
  function pickVariant(v,level){
    if(v==null)return '';if(typeof v==='string')return v;if(Array.isArray(v))return pickVariant(v[0],level);
    const keys=Object.keys(v).filter(k=>!isNaN(Number(k))).sort((a,b)=>a-b);if(!keys.length)return '';
    let k=keys[0];for(const n of keys)if(Number(n)<=(Number(level)||0))k=n;return v[k]??'';
  }
  const fmtArg=v=>typeof v==='number'?(Number.isInteger(v)?fmt(v):String(Math.round(v*100)/100)):String(v);
  function fillArgs(text,args){
    return stripMarkup(String(text||'').replace(/\[(?:[A-Za-z]+:)?(?:Desc|State)?Arg(\d+)\]/g,(m,n)=>{const v=args?.[Number(n)-1];return v==null?'X':fmtArg(v)})).replace(/\s+\n/g,'\n').trim();
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
    const sub=[typeLabel(r.Type),r.Cost!=null&&!(r.Type||[]).some(t=>/Ulti|Keeper|Intent/.test(t))?`${ui('算力','Cost')} ${r.Cost}`:''].filter(Boolean).join(' · ');
    return {title:res.nameSkill(id),sub,body:fillArgs(pipeName(tpl),args)||ui('（无描述）','(no description)')};
  }
  const skillTipAttr=(res,id,o)=>{const t=skillTip(res,id,o);return tipAttr(t.title,t.sub,t.body)};
  function stateTip(res,sid,o={}){
    const r=res.state[String(sid)]||{};
    let args=o.args&&o.args.length?o.args:null;
    if(!args&&Array.isArray(r.DescPara))args=r.DescPara.map(x=>{const m=String(x).match(/^StateOwner\.(\w+)$/);return m?(o.props?.[m[1]]??null):evalNum(x,o.props||{})});
    const sub=[o.layer>1?`${ui('层数','Layers')} ×${o.layer}`:'',r.ShowType==='Affix'?ui('词缀','Affix'):''].filter(Boolean).join(' · ');
    return {title:res.nameState(sid),sub,body:fillArgs(pipeName(r.Desc||r.WeaponDesc||''),args)||''};
  }
  const stateTipAttr=(res,sid,o)=>{const t=stateTip(res,sid,o);return tipAttr(t.title,t.sub,t.body)};
  const relicTipAttr=(res,tid)=>{const r=res.relic[String(tid)]||{};return tipAttr(res.nameRelic(tid),r.Quality||'',fillArgs(pipeName(pickVariant(r.BattleDesc||r.Desc,0)),r.StatePara||[]))};
  const DEBUFF_RE=/易伤|脆弱|中毒|石化|流血|封印|虚弱|诅咒|衰弱|灼烧|恐惧|减速|迟缓|沉默|腐蚀|破甲|畏惧|狂气封印|无用空状态/;
  const stateClass=(res,sid)=>res.state[String(sid)]?.ShowType==='Affix'?'affix':DEBUFF_RE.test(res.nameState(sid))?'debuff':'buff';
  const STAT_NAME={death_resist:'死亡抵抗',death_resist_times:'死亡抵抗次数',damage_plus:'伤害强效',strikecard_damage_plus:'打击伤害强效',crit:'暴击率',crit_damage:'暴击伤害',tentacle_dmg:'触腕伤害',vulnerable_per:'易伤增幅',frail_per:'脆弱增幅',i_damage_per:'伤害加成',i_basic_damage_per:'基础伤害加成',i_damage_per_strikecard:'打击伤害加成',keeper_energy_eff:'钥能效率',scarlet_blood_count:'胚胎融合度',relic_num_limit:'造物上限',ulti_strength_multiple:'爆发倍率',atk:'攻击',def:'防御',certain_crit:'必暴击',seal_ulti:'狂气封印',bout_ulti_times:'本回合爆发次数',awaked:'觉醒',rewind_bout:'回溯',crit_damage_from_ulti:'爆发暴击伤害',crit_per_from_strikecard:'打击暴击率',awaker_ulti_dmg_per:'爆发伤害加成',damage_per2monster_boss:'对首领增伤',damage_per2petrify_resist:'对石化抗性增伤',max_energy:'算力上限',bout_skill_times:'本回合钥令次数'};
  const statName=(res,k)=>STAT_NAME[k]||String(res.rr?.BattleApi?.[k]?.CnID||k).replace(/(唤醒体|角色|卡牌)属性$/,'').trim();
  const STAT_PCT=new Set(['crit','crit_damage','vulnerable_per','frail_per','i_damage_per','i_basic_damage_per','i_damage_per_strikecard','crit_damage_from_ulti','crit_per_from_strikecard','awaker_ulti_dmg_per','damage_per2monster_boss','damage_per2petrify_resist','ulti_strength_multiple','keeper_energy_eff']);
  const STAT_SHOW=['death_resist','damage_plus','crit','crit_damage','tentacle_dmg','vulnerable_per','frail_per','strikecard_damage_plus','keeper_energy_eff'];
  const fmtStat=(k,v)=>{const n=Math.round((Number(v)||0)*10)/10;return `${fmt(n)}${STAT_PCT.has(k)&&k!=='ulti_strength_multiple'?'%':''}`};
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
    const bd=full.battleDat||{},actors=new Map(),cards=new Map(),relics=new Map(),stateInst=new Map(),cardArgs=new Map();
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
        for(const c of md.cardDataList||[])addCard(c.uid,c.tid??c.configId,c.ownerUid,c);
        for(const r of md.relicDataList||[])if(r.uid!=null)relics.set(String(r.uid),{uid:r.uid,tid:r.tid});
      }
      for(const fr of md?.frameList||[]){
        const d=fr?.data||{},e=fr?.eventId;
        if(e===1025)for(const c of d.cards||[])addCard(c.uid,c.tid??c.configId,c.ownerUid,c);
        else if(e===1067)addCard(d.uid,d.tid??d.configId,d.ownerUid,d);
        else if(e===1035)addCard(d.cardUid,d.tid??d.configId,d.ownerUid,d);
        else if((e===1004||e===1006)&&d.stateUid!=null)stateInst.set(String(d.stateUid),d.stateId);
      }
    }
    return {actors,cards,relics,stateInst,cardArgs,keeperUid:[...actors.values()].find(a=>a.kind==='keeper')?.uid};
  }

  function buildTimeline(full){
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
    const getRound=n=>{if(!rounds.has(n))rounds.set(n,{round:n,events:[]});return rounds.get(n)};
    const push=(kind,label,html,data,raw,meta={})=>{if(!bout)return;getRound(bout).events.push({seq:++globalSeq,kind,label,html,time:raw.time??null,eventId:raw.eventId,data,camp,phase,...meta})};
    const pct=(a,b)=>b>0?Math.max(0,Math.min(100,a/b*100)):0;
    const hpMini=(cur,max,enemy)=>cur!=null&&max>0?`<span class="mr2hpmini${enemy?' enemy':''}" title="${esc(`${fmt(cur)} / ${fmt(max)}`)}"><i style="width:${pct(cur,max).toFixed(1)}%"></i></span><span class="mr2from">${pct(cur,max).toFixed(pct(cur,max)<10?1:0)}%</span>`:'';
    const resLabels={energy:ui('算力','Energy'),keeper_energy:ui('钥令能量','Keyflare'),ulti_energy:ui('狂气','Aliemus'),block:ui('护盾','Shield')};
    const stateBadge=(id,layerText,tip='')=>`<span class="mr2chip st ${stateClass(res,id)}"${tip||stateTipAttr(res,id)}>${ico(stateIconSrc(res,id),res.nameState(id),'st')}<span>${esc(res.nameState(id))}${layerText?` <em>${esc(layerText)}</em>`:''}</span></span>`;

    // Live battlefield: hp / shield / energy per unit and the states each unit currently carries.
    const board=new Map(),bstates=new Map();
    const PROP={hp:'hp',max_hp:'max',block:'block',energy:'energy',max_energy:'maxEnergy',ulti_energy:'ulti',ulti_energy_max:'ultiMax',keeper_energy:'kEnergy',max_keeper_energy:'kMax'};
    const unit=uid=>{const k=String(uid);if(!board.has(k))board.set(k,{});return board.get(k)};
    const applyRoleSnapshot=r=>{if(r?.uid==null)return;const u=unit(r.uid),p=r.properties;if(p&&typeof p==='object'&&!Array.isArray(p)){u.props=u.props||{};for(const k in p)if(typeof p[k]==='number')u.props[k]=p[k];for(const k in PROP)if(p[k]!=null)u[PROP[k]]=p[k]}if(r.skillArgs&&typeof r.skillArgs==='object')u.skillArgs=r.skillArgs};
    const stateMap=uid=>{const k=String(uid);if(!bstates.has(k))bstates.set(k,new Map());return bstates.get(k)};
    const snap=()=>{const units=[];for(const [uid,a] of actors){const u=board.get(uid)||{},pr=u.props||{};
      const stats=STAT_SHOW.filter(k=>pr[k]).map(k=>({k,v:pr[k]}));
      const intentTip=a.kind==='monster'&&u.intent?skillTipAttr(res,u.intent,{ctx:{BattleAtkForce:pr.atk}}):'';
      units.push({uid:a.uid,hp:u.hp,max:u.max,block:u.block,energy:u.energy,maxEnergy:u.maxEnergy,ulti:u.ulti,ultiMax:u.ultiMax,kEnergy:u.kEnergy,kMax:u.kMax,intent:u.intent,intentTip,stats,
        states:[...(bstates.get(uid)?.values()||[])].map(x=>({stateId:x.stateId,layer:x.layer,tip:stateTipAttr(res,x.stateId,{args:x.args,layer:x.layer,props:pr})}))})}return {units}};
    const intents=new Map();

    for(let si=0;si<(full.recordSegments||[]).length;si++){
      const seg=full.recordSegments[si]||[];for(let ri=0;ri<seg.length;ri++){
        const rec=seg[ri]||{};
        if(rec?.msgId===1001&&rec.msgData){for(const m of rec.msgData.monsterDataList||[])applyRoleSnapshot(m);for(const r of rec.msgData.roleDataList||[])applyRoleSnapshot(r)}
        const fl=rec?.msgData?.frameList;if(!Array.isArray(fl))continue;
        for(let fi=0;fi<fl.length;fi++){
          const fr=fl[fi]||{};frameCount++;const e=fr.eventId,d=fr.data||{};
          // ---- state tracking (runs for every frame, including pre-battle setup)
          if(e===1028&&d.value!=null&&d.uid!=null&&typeof d.value==='number'&&actors.has(String(d.uid))){const u=unit(d.uid);(u.props=u.props||{})[d.propertyType]=d.value;if(PROP[d.propertyType])u[PROP[d.propertyType]]=d.value}
          else if(e===1014&&d.beHitConfig?.targetRoleUid!=null){const h=d.beHitConfig,u=unit(h.targetRoleUid);if(h.curHp!=null)u.hp=h.curHp;if(h.curMaxHp!=null)u.max=h.curMaxHp}
          else if(e===1004&&d.stateUid!=null&&(d.stateType===1||actors.has(String(d.ownerUid??d.roleUid)))){stateMap(d.ownerUid??d.roleUid).set(String(d.stateUid),{stateId:d.stateId,layer:d.layer??1,args:d.descArgs?.curValues})}
          else if(e===1007&&d.stateUid!=null){const m=stateMap(d.ownerUid??d.roleUid),cur=m.get(String(d.stateUid));if(cur&&(d.newLayer??1)>0){cur.layer=d.newLayer;if(d.descArgs?.curValues?.length)cur.args=d.descArgs.curValues}else if(cur)m.delete(String(d.stateUid))}
          else if(e===1005&&d.stateUid!=null){stateMap(d.ownerUid).delete(String(d.stateUid))}
          else if(e===1001&&d.roleUid!=null){unit(d.roleUid).intent=d.intention||null}
          else if(e===1011&&d.roleUid!=null&&d.args&&typeof d.args==='object'){unit(d.roleUid).skillArgs=d.args}
          if(e===1019&&d?.boutNumber){
            const nb=Number(d.boutNumber)||bout;
            if(d?.config?.camp===1&&Number(d.newPhase)===1){if(rounds.has(bout))getRound(bout).snapEnd=snap();getRound(nb).snapStart=snap()}
            bout=nb;camp=d?.config?.camp||camp;phase=Number(d.newPhase)||0;
            if(camp===1&&phase===1)push('round',ui(`第 ${bout} 回合开始`,`Round ${bout} start`),'',d,fr);
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
            push(kind,`${plainName(ownerUid)} · ${name}`,'',d,fr,{skillTid:tid,actorUid:ownerUid,cardUid:d.uid,cost:d.cost,deck:d.deck,skillName:name,stypes:res.skill[String(tid)]?.Type||[],tip:skillTip(res,tid,{args:d.descArgs?.curValues,level:d.level})});continue;
          }
          if(e===1064){const name=res.nameSkill(d.skillId);push('keeper',`${ui('钥令','Keeper skill')} · ${name}`,'',d,fr,{skillTid:d.skillId,actorUid:d.roleUid,skillName:name,iconSrc:keeperSkillIconSrc(res,d.skillId),tip:skillTip(res,d.skillId,{args:argList(unit(d.roleUid).skillArgs),ctx:{}})});continue}
          if(e===1093){const name=res.nameSkill(d.skillTid);push('trigger',`${plainName(d.casterUid)} · ${name}`,`<span class="mr2lead">${ui('派生','Triggered')}</span>${chip(d.casterUid)}<b>${esc(name)}</b>${d.producerUid!=null&&d.producerUid!==d.casterUid?`<span class="mr2from">← ${chip(d.producerUid)}</span>`:''}`,d,fr,{skillTid:d.skillTid,actorUid:d.casterUid,producerUid:d.producerUid,skillName:name});continue}
          if(e===1014&&d.beHitConfig){
            const h=d.beHitConfig,delta=(Number(h.curHp)||0)-(Number(h.oldHp)||0),amt=Math.abs(delta||Number(h.changeVal)||0),typ=delta>0?'heal':'damage',sname=res.nameSkill(h.skillConfigId);
            const hpAfter=hpMini(h.curHp,h.curMaxHp,actorOf(h.targetRoleUid)?.camp===2);
            const html=`${chip(h.castRoleUid)}<span class="mr2arrow">→</span>${chip(h.targetRoleUid)}<span class="mr2amt ${typ}">${typ==='damage'?'−':'+'}${fmt(amt)}</span>${hpAfter}${h.isCrit?`<span class="mr2tag crit">${ui('暴击','CRIT')}</span>`:''}${h.blockedDamage?`<span class="mr2tag">${ui('护盾抵挡','Blocked')} ${fmt(h.blockedDamage)}</span>`:''}<span class="mr2from">${esc(sname)}</span>`;
            push(typ,`${plainName(h.castRoleUid)} → ${plainName(h.targetRoleUid)} · ${sname} · ${typ==='damage'?ui('伤害','DMG'):ui('治疗','Heal')} ${fmt(amt)}${h.isCrit?` · ${ui('暴击','CRIT')}`:''}`,html,d,fr,{skillTid:h.skillConfigId,actorUid:h.castRoleUid,targetUid:h.targetRoleUid,amount:amt,crit:!!h.isCrit,blocked:h.blockedDamage||0,damageType:h.damageType});continue;
          }
          if(e===1050){const nm=res.nameRelic(d.relicTid);push('relic',`${ui('造物触发','Relic')} · ${nm}`,`<span class="mr2chip relic"${relicTipAttr(res,d.relicTid)}>${ico(relicIconSrc(res,d.relicTid),'物','rl')}<span>${esc(nm)}</span></span>`,d,fr,{relicTid:d.relicTid});continue}
          if(e===1046){const targets=(d.targetUids||[]).map(t=>{if(t&&typeof t==='object'){if(t.uid!=null&&!cards.has(String(t.uid)))cards.set(String(t.uid),{uid:t.uid,tid:t.tid,ownerUid:undefined});return t.uid}return t});push('select',`${ui('目标选择','Target selection')} · ${res.nameSkill(d.skillConfigId)} → ${targets.map(plainName).join(', ')||'-'}`,`<span class="mr2lead">${ui('选择目标','Choose')}</span><b>${esc(res.nameSkill(d.skillConfigId))}</b><span class="mr2arrow">→</span>${targets.map(t=>chip(t)).join('')||'—'}`,d,fr,{skillTid:d.skillConfigId,targetUids:targets});continue}
          if(e===1049){const list=d.cardUidList||[];push('swallow',`${ui('吞噬卡牌','Swallow card')} · ${list.map(plainName).join(', ')}`,`<span class="mr2lead">${ui('吞噬','Swallow')}</span>${list.map(t=>chip(t)).join('')}`,d,fr,{cardUids:list});continue}
          if(e===1004||e===1007){
            const sid=d.stateId,owner=d.ownerUid??d.roleUid,hidden=res.state[String(sid)]?.ShowType==='Hide',who=chip(owner),tipS=stateTipAttr(res,sid,{args:d.descArgs?.curValues,layer:d.newLayer??d.layer,props:board.get(String(owner))?.props});
            if(e===1004){const layer=d.layer>1?`×${d.layer}`:'';push('state',`${ui('状态添加','State add')} · ${res.nameState(sid)} → ${plainName(owner)}`,`${stateBadge(sid,layer,tipS)}<span class="mr2arrow">→</span>${who}`,d,fr,{stateId:sid,actorUid:d.castRoleUid,targetUid:owner,hidden});}
            else push('state',`${ui('状态层数','State layer')} · ${res.nameState(sid)} ${d.oldLayer??'?'} → ${d.newLayer??'?'} · ${plainName(owner)}`,`${stateBadge(sid,`${d.oldLayer??'?'}→${d.newLayer??'?'}`,tipS)}<span class="mr2arrow">→</span>${who}`,d,fr,{stateId:sid,actorUid:d.castRoleUid,targetUid:owner,hidden});
            continue;
          }
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
    if(rounds.has(bout)&&!getRound(bout).snapEnd)getRound(bout).snapEnd=snap();
    return {rounds:[...rounds.values()].sort((a,b)=>a.round-b.round),actors,frameCount,eventCount:globalSeq,res,ent,chip,campOf};
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
    .mr2badge{display:inline-block;padding:2px 6px;border-radius:999px;background:rgba(98,183,255,.12);color:#acd5f6;font-size:9px}.mr2badge.ultimate{background:rgba(213,177,118,.18);color:#f1d69f}.mr2badge.keeper{background:rgba(175,130,220,.16);color:#d8b9f0}.mr2badge.mon{background:rgba(218,132,119,.14);color:#efada5}.mr2cost{font-size:10px;padding:1px 6px;border-radius:6px;background:rgba(98,183,255,.14);color:#9fd0ff;font-weight:800}
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
    const cost=e.cost!=null?`<span class="mr2cost" title="${esc(ui('算力消耗','Energy cost'))}">⚡${esc(e.cost)}</span>`:'';
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
  function renderRound(r,tl,open){
    const sides=[];let cur=null;
    for(const e of r.events){
      if(e.kind==='round')continue;
      const key=`${e.camp}|${e.phase}`;
      if(!cur||cur.key!==key){cur={key,camp:e.camp,phase:e.phase,events:[]};sides.push(cur)}
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
      return `<div class="mr2side c${s.camp}"><div class="mr2sidehead">${esc(title)} · ${blocks.length} ${ui('次行动','actions')}</div>${preHtml}${blocks.map(b=>`<div class="mr2act a-${actionInfo(b.head).cls}">${renderActionHead(b.head,tl)}<div class="mr2fx">${renderEffects(b.fx,tl)}</div>${rawDetails(b.head)}</div>`).join('')}</div>`;
    }).join('');
    const bStart=r.round===(tl.rounds[0]?.round)?renderBoard(r.snapStart,null,tl,ui('战斗开始 · 战场状态','Battle start · battlefield')):'',bEnd=renderBoard(r.snapEnd,r.snapStart,tl,ui('回合结束 · 战场状态（▲▼ 为本回合血量变化）','Round end · battlefield (▲▼ = HP change this round)'));
    return `<details class="mr2round"${open?' open':''}><summary><b>${ui(`第 ${r.round} 回合`,`Round ${r.round}`)}</b><small>${acts} ${ui('次我方行动','ally actions')} · ${ui('我方输出','Dealt')} ${fmt(dmg)} · ${ui('受到','Taken')} ${fmt(taken)}</small>${renderStrip(r,tl)}</summary><div class="mr2rbody">${bStart}${body}${bEnd}</div></details>`;
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
  const unitStats=(u,tl)=>(u.stats||[]).length?`<div class="mr2ustats">${u.stats.map(x=>`<span class="mr2uss" title="${esc(x.k)}">${esc(statName(tl.res,x.k))}<b>${esc(fmtStat(x.k,x.v))}</b></span>`).join('')}</div>`:'';
  function renderUnit(u,tl,prev){
    const a=tl.actors.get(String(u.uid));if(!a)return '';
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
    return `<div class="mr2unit${enemy?' enemy':''}${hasHp&&p<=0?' down':''}" title="${esc(`UID ${u.uid} · tid ${a.tid??'?'}`)}">${portrait}<div class="mr2ubody"><div class="mr2uname"><b>${esc(a.name)}</b>${shield}${dTag}${intent}</div>${hpBar}${extra}${unitStats(u,tl)}${unitStates(u,tl)}</div></div>`;
  }
  function renderBoard(sn,prev,tl,title){
    if(!sn)return '';
    const prevBy=new Map((prev?.units||[]).map(u=>[String(u.uid),u]));
    const ally=sn.units.filter(u=>{const a=tl.actors.get(String(u.uid));return a&&a.camp!==2}).sort((x,y)=>(tl.actors.get(String(x.uid)).kind==='keeper'?-1:0)-(tl.actors.get(String(y.uid)).kind==='keeper'?-1:0));
    const foe=sn.units.filter(u=>tl.actors.get(String(u.uid))?.camp===2);
    return `<div class="mr2boardwrap"><div class="mr2boardtitle">${esc(title)}</div><div class="mr2board"><div class="mr2bcol ally">${ally.map(u=>renderUnit(u,tl,prevBy.get(String(u.uid)))).join('')}</div><div class="mr2bcol enemy">${foe.map(u=>renderUnit(u,tl,prevBy.get(String(u.uid)))).join('')}</div></div></div>`;
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
  function renderFull(full){
    const host=document.getElementById('mrReplayResult');if(!host)return;const tl=buildTimeline(full),bd=full.battleDat||{},rounds=tl.rounds;
    Object.assign(RES_LABEL,{energy:ui('算力','Energy'),keeper_energy:ui('钥令能量','Keyflare'),ulti_energy:ui('狂气','Aliemus'),block:ui('护盾','Shield')});
    const eventHtml=rounds.map((r,ri)=>renderRound(r,tl,ri<2)).join('');
    setTimeout(()=>wireInteractions(host),0);
    host.innerHTML=`<div class="mr2status ok">${ui('已直接从公开 BattleReplay 对象获取并在浏览器内解码。无需登录、Cookie、游戏会话密钥，也没有访问 Eremora。','Fetched the public BattleReplay object directly and decoded it in-browser. No login, cookies, game session keys, or Eremora are used.')}</div><div class="mr2sum"><span><small>battleUuid</small><strong>${esc(full.replayUuid)}</strong></span><span><small>battleTid</small><strong>${esc(bd.battleTid??'—')}</strong></span><span><small>${ui('回合','Rounds')}</small><strong>${rounds.length}</strong></span><span><small>${ui('录像记录','Records')}</small><strong>${fmt(full.recordCount)}</strong></span><span><small>${ui('原始帧','Frames')}</small><strong>${fmt(tl.frameCount)}</strong></span></div><div class="mr2status">${ui('每个回合按「我方/敌方 × 开始结算/行动/结束结算」拆分：算力与资源回复、状态变化归入结算；出牌、爆发、钥令和敌方行动单独成条，其造成的伤害、状态、资源变化嵌套在对应行动下。所有 UID/TID 已对应为唤醒体头像、卡牌名、造物与状态图标，鼠标悬停可看原始 UID/TID，展开「原始事件」可查看完整数据。','Each round is split into ally/enemy × start / action / end. Resource recovery and state changes are grouped as settlement; cards, ultimates, keeper skills and enemy actions are separate entries with their damage, states and resource changes nested beneath. UIDs/TIDs are resolved to awakener portraits, card names, relic and state icons; hover for raw IDs, expand Raw event for the full payload.')}</div><div class="mr2toolbar"><label class="mr2tog"><input type="checkbox" id="mr2ShowDesc"> ${ui('展开所有效果说明','Expand all effect descriptions')}</label><span class="mr2from">${ui('鼠标悬停在卡牌、钥令、意图、状态、造物上可看详细效果；点击行动卡片标题可单独展开。','Hover cards, keyflare skills, intents, states and relics for details; click an action header to expand it.')}</span></div><div class="mr2legend">${[['#ff8a3d',ui('狂气爆发','Burst')],['#ffd24a',ui('灵知觉醒','Awakening')],['#b57cff',ui('钥令','Keyflare')],['#ff6b6b',ui('打击','Strike')],['#4fd18b',ui('防御','Defend')],['#4aa3ff',ui('技能牌','Skill')],['#8e86a8',ui('诅咒','Curse')],['#4fd0c8',ui('其他出牌','Other')],['#ff5c8a',ui('敌方行动','Enemy')]].map(([c,t])=>`<span><i style="--c:${c}"></i>${t}</span>`).join('')}</div>${eventHtml||`<div class="mr2status err">${ui('已解码回放，但没有解析到回合事件。','Replay decoded, but no round events were recognized.')}</div>`}`;
  }
  async function loadLegacy(uuid){try{const r=await fetch(`${LOCAL_BASE}/${uuid}.json`,{cache:'no-cache'});return r.ok?await r.json():null}catch{return null}}
  async function analyze(raw){
    const input=document.getElementById('mrReplayCode'),host=document.getElementById('mrReplayResult');if(raw!=null&&input)input.value=raw;const p=parseReplayCode(raw??input?.value);if(!host)return;if(!p){host.innerHTML=`<div class="mr2status err">${ui('请输入有效的 battleUuid 或 UUID#E#a 回放码。','Enter a valid battleUuid or UUID#E#a replay code.')}</div>`;return}
    host.innerHTML=`<div class="mr2status">${ui('正在从公开 BattleReplay 对象获取约 1MB 回放并解码 LZ4 + MessagePack…','Fetching the public BattleReplay object and decoding LZ4 + MessagePack…')}</div>`;
    try{const full=await fetchReplay(p.uuid);await preloadAssets();renderFull(full)}catch(err){console.error('Public replay fetch/decode failed',err);const legacy=await loadLegacy(p.uuid);if(legacy&&legacy.timeline){host.innerHTML=`<div class="mr2status err">${ui('公开回放对象获取失败（可能是浏览器 CORS 或对象已过期）。本站只有旧的聚合 timeline；请检查控制台错误。','Public replay fetch failed (browser CORS or expired object). Only the older aggregated local timeline is available; check console errors.')}</div>`}else host.innerHTML=`<div class="mr2status err"><strong>${ui('无法获取完整回放。','Could not fetch the full replay.')}</strong><br>${esc(err?.message||err)}<br>${ui('如果命令行 fetch_public_replay.py 能成功而浏览器失败，则原因基本是对象存储未允许本站域名的 CORS；这时需要在站点侧增加同源代理，而不是解 TLS。','If fetch_public_replay.py works but the browser fails, the likely cause is object-store CORS. The fix is a same-origin site proxy, not TLS decryption.')}</div>`}
  }
  function activateTab(){document.querySelectorAll('#morimensTabs .morimensTab').forEach(t=>{t.classList.remove('active');t.setAttribute('aria-selected','false')});document.querySelectorAll('[role="tabpanel"]').forEach(p=>{if(p.id!=='morimensReplayPanel'&&p.closest('main,body'))p.hidden=true});const t=document.getElementById('morimensReplayTab'),p=document.getElementById('morimensReplayPanel');if(t){t.classList.add('active');t.setAttribute('aria-selected','true')}if(p)p.hidden=false;history.replaceState(null,'','#replay')}
  function enhance(root=document){root.querySelectorAll?.('.dtideReplayCopy').forEach(copy=>{if(copy.dataset.reviewV2Bound)return;copy.dataset.reviewV2Bound='1';const b=document.createElement('button');b.type='button';b.className='dtideReplayReviewOpen';b.textContent=ui('完整复盘','Full replay');b.addEventListener('click',()=>{activateTab();analyze(copy.dataset.replayCode||'')});copy.insertAdjacentElement('afterend',b)})}
  function setup(){
    const tabs=document.getElementById('morimensTabs');if(!tabs)return false;styles();document.getElementById('morimensReplayTab')?.remove();document.getElementById('morimensReplayPanel')?.remove();
    const tab=document.createElement('button');tab.className='morimensTab';tab.id='morimensReplayTab';tab.setAttribute('role','tab');tab.setAttribute('aria-selected','false');tab.setAttribute('aria-controls','morimensReplayPanel');tab.textContent=ui('战斗回放复盘','Replay Review');const anchor=document.getElementById('morimensDtideTab');anchor?.insertAdjacentElement('afterend',tab)||tabs.appendChild(tab);
    const panel=document.createElement('div');panel.id='morimensReplayPanel';panel.setAttribute('role','tabpanel');panel.hidden=true;panel.innerHTML=`<section class="panel mr2"><div class="mr2intro"><h2>${ui('战斗回放复盘','Battle Replay Review')}</h2><p>${ui('输入 battleUuid 或游戏完整回放码。页面直接读取公开的 BattleReplay_<UUID>.json，在浏览器中解开 LZ4 + MessagePack，并按录像原始 frameList 顺序展示每回合的出牌、钥令、派生技能、伤害、状态和造物触发。','Enter a battleUuid or full replay code. The page directly reads the public BattleReplay_<UUID>.json, decodes LZ4 + MessagePack in-browser, and displays cards, keeper skills, derived skills, damage, states and relic triggers in original frameList order.')}</p><div class="mr2form"><input id="mrReplayCode" spellcheck="false" autocomplete="off" placeholder="bde26af0-1fdf-3645-8a01-705ce39b5ba9#E#a"><button id="mrReplayGo" type="button">${ui('获取并完整复盘','Fetch & Decode')}</button></div></div><div id="mrReplayResult"><div class="mr2status">${ui('等待输入回放 ID。','Waiting for a replay ID.')}</div></div></section>`;tabs.insertAdjacentElement('afterend',panel);
    tab.addEventListener('click',activateTab);panel.querySelector('#mrReplayGo').addEventListener('click',()=>analyze());panel.querySelector('#mrReplayCode').addEventListener('keydown',e=>{if(e.key==='Enter')analyze()});tabs.addEventListener('click',e=>{const t=e.target.closest('.morimensTab');if(t&&t!==tab){panel.hidden=true;tab.classList.remove('active');tab.setAttribute('aria-selected','false')}},true);
    enhance();new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1)enhance(n)}).observe(document.body,{subtree:true,childList:true});if(location.hash==='#replay')activateTab();return true;
  }
  if(!setup()){const mo=new MutationObserver(()=>{if(setup())mo.disconnect()});mo.observe(document.documentElement,{subtree:true,childList:true})}
  window.MorimensReplayReview={analyze,fetchReplay,buildTimeline,unpackLz4Msgpack};
})();
