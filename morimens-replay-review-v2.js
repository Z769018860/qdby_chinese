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
  let gearCatalog=null;
  async function preloadAssets(){
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
  const relicIconSrc=(res,tid)=>{const r=res.relic[String(tid)]||{};const ic=r.SmallIcon||r.Icon;return ic?`${ART}/relics/${baseName(ic)}.webp`:''};
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
  const STAT_NAME={o_block_per:'护盾强效',block_per_defendcard:'防御牌护盾加成',black_upgrade_plus:'黑印强化',o_heal_per:'治疗强效',block_heal_per:'护盾和治疗强效',crit_damage_from_strikecard:'打击暴击伤害',crit_damage_from_ulti:'爆发暴击伤害',o_damage_per:'基础伤害',o_damage_per_card:'卡牌基础伤害',o_damage_per_strikecard:'打击基础伤害',o_damage_per_attachpost:'追击基础伤害',o_damage_per_ulti:'爆发基础伤害',i_state_layer_per_power:'力量获取效果',ulti_energy_per:'狂气获取效果',awaker_ulti_heal_per:'爆发治疗',awaker_ulti_block_per:'爆发护盾',i_state_layer_per_posion:'中毒施加',i_state_layer_per_counterattack:'反击施加',death_resist:'死亡抵抗',death_resist_times:'死亡抵抗次数',damage_plus:'伤害强效',strikecard_damage_plus:'打击伤害强效',crit:'暴击率',crit_damage:'暴击伤害',tentacle_dmg:'触腕伤害',vulnerable_per:'易伤增幅',frail_per:'脆弱增幅',i_damage_per:'伤害加成',i_basic_damage_per:'基础伤害加成',i_damage_per_strikecard:'打击伤害加成',keeper_energy_eff:'钥能效率',scarlet_blood_count:'胚胎融合度',relic_num_limit:'造物上限',ulti_strength_multiple:'爆发倍率',atk:'攻击',def:'防御',certain_crit:'必暴击',seal_ulti:'狂气封印',bout_ulti_times:'本回合爆发次数',awaked:'觉醒',rewind_bout:'回溯',crit_damage_from_ulti:'爆发暴击伤害',crit_per_from_strikecard:'打击暴击率',awaker_ulti_dmg_per:'爆发伤害加成',damage_per2monster_boss:'对首领增伤',damage_per2petrify_resist:'对石化抗性增伤',max_energy:'算力上限',bout_skill_times:'本回合钥令次数'};
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
    const HEAD_KINDS=['card','ultimate','keeper','skill','enemyact'];
    const push=(kind,label,html,data,raw,meta={})=>{
      if(!bout)return;
      if(kind==='snap'){getRound(bout).events.push({kind,camp,phase,snap:meta.snap});return}
      const isHead=HEAD_KINDS.includes(kind)||(kind==='trigger'&&camp===2&&actors.get(String(meta.actorUid))?.camp===2);
      getRound(bout).events.push({seq:++globalSeq,kind,label,html,time:raw.time??null,eventId:raw.eventId,data,camp,phase,...(isHead?{snapBefore:snap()}:{}),...meta});
    };
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
      const stats=boardStats(a,pr);
      const intentTip=a.kind==='monster'&&u.intent?skillTipAttr(res,u.intent,{ctx:{BattleAtkForce:pr.atk}}):'';
      units.push({uid:a.uid,hp:u.hp,max:u.max,block:u.block,energy:u.energy,maxEnergy:u.maxEnergy,ulti:u.ulti,ultiMax:u.ultiMax,kEnergy:u.kEnergy,kMax:u.kMax,intent:u.intent,intentTip,stats,
        states:[...(bstates.get(uid)?.values()||[])].map(x=>({stateId:x.stateId,layer:x.layer,tip:stateTipAttr(res,x.stateId,{args:x.args,layer:x.layer,props:pr})}))})}return {units}};
    const intents=new Map();let lastStats=null;const keeperPicks=[];
    // Relic buff accounting. Power / basic-damage relics are matched to the state & property
    // changes that follow their trigger frame, then every later hit is split by the share of
    // that bonus in the caster's total (an estimate: the replay carries no damage formula).
    const relicKind=tid=>{const rec=res.relic[String(tid)]||{};const t=pipeName(pickVariant(rec.BattleDesc||rec.Desc,0));return /力量/.test(t)?'power':/基础伤害/.test(t)?'basic':null};
    const relicBuffs=new Map(),activeBuff=new Map();let relWin=null;const hitLog=[];
    const HIT_PROPS=['atk','atk_per','basic_damage_per','i_basic_damage_per','o_damage_per','o_damage_per_card','o_damage_per_strikecard','o_damage_per_attachpost','o_damage_per_ulti','i_damage_per','i_damage_per_strikecard','damage_per2monster_boss','crit_damage','crit_damage_from_strikecard','crit_damage_from_ulti','damage_plus','strikecard_damage_plus','ulti_strength_multiple'];
    // ---- equipment: wheels (命轮, 'Weapon' state source) and covenant sets (密契, '状态@饰品X' states)
    const PROP_KIND={awaker_ulti_dmg_per:['final','ult'],o_damage_per:['out','all'],o_damage_per_card:['out','card'],o_damage_per_strikecard:['out','strike'],o_damage_per_attachpost:['out','attach'],o_damage_per_ulti:['out','ult'],basic_damage_per:['out','all'],i_basic_damage_per:['in','all'],
      i_damage_per:['final','all'],i_damage_per_strikecard:['final','strike'],damage_per2monster_boss:['final','all'],crit_damage:['crit','all'],crit_damage_from_strikecard:['crit','strike'],crit_damage_from_ulti:['crit','ult'],damage_plus:['power','all'],strikecard_damage_plus:['power','strike']};
    const gearCat=gearCatalog||{wheels:{},covenants:{}},covByZh=new Map(Object.values(gearCat.covenants||{}).map(c=>[c.zh,c]));
    const gears=new Map(),gearsOfState=new Map();
    for(const g of ent.gearStates){
      const mainRec=res.state[String(g.stateId)]||{},cn=String(mainRec.CnID||'');
      const covName=g.kind==='covenant'?([...covByZh.keys()].filter(z=>z&&String(g.stem).startsWith(z)).sort((a,b)=>b.length-a.length)[0]||g.stem):'',stem=g.kind==='wheel'?(cn.replace(/^状态@(武器)?/,'')||String(g.tid)):covName,key=`${g.kind}|${stem}|${g.tid??''}`;
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
    const COND_LABEL={BSTAfterUseCard:'打出卡牌后',BSTAfterUseKeeperSkill:'释放钥令后',BSTAfterUltiSkill:'释放狂气爆发后',BSTAfterBoutBegin:'回合开始时',BSTAfterBoutEnd:'回合结束时',BSTBeforeBoutBegin:'回合开始前',BSTBeforeBoutEnd:'回合结束前',BSTAfterLaunchSwallow:'吞噬后',BSTRoleAfterDeathResist:'触发死亡抵抗后',BSTAfterSilverKeyAwake:'银钥觉醒后',BSTAfterDrawCards:'抽牌后',BSTBattleBegin:'战斗开始时',StageState:'战斗开始时'};
    const TYPE_QUAL={Card_Strike:'打击',Card_Defend:'防御'};
    for(const e of gears.values()){
      e.channels=[];const rec=res.state[String(e.mainStates[0]?.stateId)]||{},desc=e.desc||'';
      const anyOwner=/任意唤醒体|所有唤醒体/.test(desc),strikeOnly=/打出[^。，]{0,12}「打击」/.test(desc),capM=desc.match(/每回合(?:最多)?(?:触发|生效)?\s*(\d+)\s*次/);
      for(let n=1;n<=4;n++){
        const cond=asList(rec['TriggerCond'+n])[0],cmdId=rec['TriggerCmd'+n];if(!cond)continue;
        const [base,qual]=String(cond).split('.');
        if(e.channels.some(c=>c.base===base&&c.cmd===cmdId))continue;
        e.channels.push({n,base,qual:qual||(strikeOnly&&base==='BSTAfterUseCard'?'Card_Strike':''),cmd:cmdId,label:(COND_LABEL[base]||base)+(TYPE_QUAL[qual]?`（${TYPE_QUAL[qual]}）`:strikeOnly&&base==='BSTAfterUseCard'?'（打击）':''),once:base==='StageState'||base==='BSTBattleBegin',ownerOnly:!anyOwner,cap:capM?Number(capM[1]):0,count:0,rounds:new Set(),perRound:new Map(),para:rec['TriggerPara'+n]});
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
      for(const sid of extra){if(['2900','3130','3902'].includes(sid)||!res.state[sid]||e.related.has(sid))continue;e.related.add(sid);if(!gearsOfState.has(sid))gearsOfState.set(sid,[]);gearsOfState.get(sid).push(e)}
    }
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
        if(!ok)continue;
        if(ch.confirm.size)pendingConf.push({e,ch,time,done:false,win:ch.base==='BSTAfterUltiSkill'?15:6});else if(!channelHit(e,ch))continue;
        const desc=e.desc||'',kinds=new Set();
        if(ch.base==='CARD'&&/暴击伤害/.test(desc))kinds.add('crit');
        let predict=null;if(kinds.has('power')&&ch.para!=null){const own=board.get(String(e.owners[0]))?.props||{},af=Math.ceil((own.atk||0)*(1+(own.atk_per||0)/100)),params=e.mainStates[0]?.params||[];
          const ex=String(ch.para).replace(/StateOwner\.AtkForce/g,String(af)).replace(/StateArg(\d+)/g,(m,n)=>params[Number(n)-1]??'#').replace(/math\./g,'Math.');
          if(/^[0-9+\-*/().\s]*(Math\.(ceil|floor)[0-9+\-*/().\s]*)*$/.test(ex)){try{const v=Function(`"use strict";return (${ex})`)();if(Number.isFinite(v))predict=v}catch{}}}
        for(const k of kinds)openGearWindow(e,time,k,k==='power'?predict:null);
      }
    };

    const buffOf=tid=>{const k=String(tid);if(!relicBuffs.has(k))relicBuffs.set(k,{tid:k,kind:relicKind(tid),gain:0,extra:0,instances:[]});return relicBuffs.get(k)};
    // one relic trigger -> one instance (gain counted once per trigger, per-awakener amounts used for the damage split)
    const newInstance=(win,rel,gain,temp)=>{const rec=buffOf(rel.tid),inst={round:bout,time:win.time,gain,awakeners:new Set(),extra:0,hits:0,temp,kind:rel.kind};rec.instances.push(inst);rec.gain+=gain;return {rec,inst}};
    const grant=(ctx,uid,amt,rel,temp)=>{const k=String(uid);ctx.inst.awakeners.add(k);if(!activeBuff.has(k))activeBuff.set(k,[]);activeBuff.get(k).push({inst:ctx.inst,kind:rel.kind,amt,temp,rel:ctx.rec})};
    const expireTemp=()=>{for(const [k,v] of activeBuff)activeBuff.set(k,v.filter(x=>!x.temp))};


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
    const gearRecs=new Map();
    for(const e of gears.values()){
      const rec={tid:'gear:'+e.key,kind:'gear',gain:0,extra:0,instances:[]};relicBuffs.set(rec.tid,rec);gearRecs.set(e.key,rec);
      for(const st of e.statics){
        const pk=PROP_KIND[st.prop];if(!pk||!actors.get(st.owner)||actors.get(st.owner).kind!=='awakener')continue;
        const inst={round:0,time:0,gain:st.val,awakeners:new Set([st.owner]),extra:0,hits:0,temp:false,prop:st.prop};rec.instances.push(inst);rec.gain+=st.val;
        if(!activeBuff.has(st.owner))activeBuff.set(st.owner,[]);activeBuff.get(st.owner).push({inst,kind:pk[0],scope:pk[1],amt:st.val,temp:false,rel:rec});
      }
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
          if(bout>0&&(e===1004||e===1006||e===1007)&&d.stateId!=null){
            const gl=gearsOfState.get(String(d.stateId));
            if(gl&&(e!==1007||(d.newLayer??0)>(d.oldLayer??0)))for(const ge of gl){ge.triggers.times.add(Math.round((fr.time||0)*100)/100);ge.triggers.rounds.add(bout);ge.stateCounts.set(String(d.stateId),(ge.stateCounts.get(String(d.stateId))||0)+1)}
          }
          // ---- relic trigger windows: effects landing in the same frame group belong to that relic
          if(e===1050){const rel={tid:String(d.relicTid),kind:relicKind(d.relicTid)};if(relWin&&relWin.time===fr.time)relWin.queue.push(rel);else relWin={time:fr.time,queue:[rel],pi:0,bi:0,pend:new Map(),basicCtx:null}}
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
          // ---- state tracking (runs for every frame, including pre-battle setup)
          if(e===1028&&d.value!=null&&d.uid!=null&&typeof d.value==='number'&&actors.has(String(d.uid))){const u=unit(d.uid);(u.props=u.props||{})[d.propertyType]=d.value;if(PROP[d.propertyType])u[PROP[d.propertyType]]=d.value}
          else if(e===1014&&d.beHitConfig?.targetRoleUid!=null){const h=d.beHitConfig,u=unit(h.targetRoleUid);if(h.curHp!=null)u.hp=h.curHp;if(h.curMaxHp!=null)u.max=h.curMaxHp}
          else if(e===1004&&d.stateUid!=null&&(d.stateType===1||actors.has(String(d.ownerUid??d.roleUid)))){stateMap(d.ownerUid??d.roleUid).set(String(d.stateUid),{stateId:d.stateId,layer:d.layer??1,args:d.descArgs?.curValues})}
          else if(e===1007&&d.stateUid!=null){const m=stateMap(d.ownerUid??d.roleUid),cur=m.get(String(d.stateUid));if(cur&&(d.newLayer??1)>0){cur.layer=d.newLayer;if(d.descArgs?.curValues?.length)cur.args=d.descArgs.curValues}else if(cur){if(cur.stateId===3130)expireTemp();m.delete(String(d.stateUid))}}
          else if(e===1005&&d.stateUid!=null){const cur=stateMap(d.ownerUid).get(String(d.stateUid));if(cur?.stateId===3130)expireTemp();stateMap(d.ownerUid).delete(String(d.stateUid))}
          else if(e===1001&&d.roleUid!=null){unit(d.roleUid).intent=d.intention||null}
          if(e===1028&&d.propertyType==='crit_damage'&&Number(d.changedValue)<0&&d.uid!=null){const k=String(d.uid);if(activeBuff.has(k))activeBuff.set(k,activeBuff.get(k).filter(x=>!(x.kind==='crit'&&x.temp)))}
          else if(e===1077&&d.statsData){lastStats=d.statsData}
          else if(e===1011&&d.roleUid!=null&&d.args&&typeof d.args==='object'){unit(d.roleUid).skillArgs=d.args}
          if(e===1019&&d?.boutNumber){
            push('snap','','',d,fr,{snap:snap()});
            const nb=Number(d.boutNumber)||bout;
            if(d?.config?.camp===1&&Number(d.newPhase)===1){if(rounds.has(bout))getRound(bout).snapEnd=snap();getRound(nb).snapStart=snap()}
            bout=nb;camp=d?.config?.camp||camp;phase=Number(d.newPhase)||0;
            if(camp===1&&phase===1)push('round',ui(`第 ${bout} 回合开始`,`Round ${bout} start`),'',d,fr);
            if(camp===1&&phase===1)gearTrigger('boutBegin',{},fr.time);else if(camp===1&&phase===3)gearTrigger('boutEnd',{},fr.time);
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
            push(kind,`${plainName(ownerUid)} · ${name}`,'',d,fr,{skillTid:tid,actorUid:ownerUid,cardUid:d.uid,cost:d.cost,deck:d.deck,skillName:name,stypes:asList(res.skill[String(tid)]?.Type),tip:skillTip(res,tid,{args:d.descArgs?.curValues,level:d.level})});
            if(kind==='card')gearTrigger('card',{owner:ownerUid,tid,types:asList(res.skill[String(tid)]?.Type)},fr.time);else if(kind==='ultimate')gearTrigger('ulti',{owner:ownerUid},fr.time);
            continue;
          }
          if(e===1064){const name=res.nameSkill(d.skillId);push('keeper',`${ui('钥令','Keeper skill')} · ${name}`,'',d,fr,{skillTid:d.skillId,actorUid:d.roleUid,skillName:name,iconSrc:keeperSkillIconSrc(res,d.skillId),tip:skillTip(res,d.skillId,{args:argList(unit(d.roleUid).skillArgs),ctx:{}})});gearTrigger('keeper',{},fr.time);continue}
          if(e===1093){const name=res.nameSkill(d.skillTid);push('trigger',`${plainName(d.casterUid)} · ${name}`,`<span class="mr2lead">${ui('派生','Triggered')}</span>${chip(d.casterUid)}<b>${esc(name)}</b>${d.producerUid!=null&&d.producerUid!==d.casterUid?`<span class="mr2from">← ${chip(d.producerUid)}</span>`:''}`,d,fr,{skillTid:d.skillTid,actorUid:d.casterUid,producerUid:d.producerUid,skillName:name});continue}
          if(e===1014&&d.beHitConfig){
            const h=d.beHitConfig,delta=(Number(h.curHp)||0)-(Number(h.oldHp)||0),amt=Math.abs(delta||Number(h.changeVal)||0),typ=delta>0?'heal':'damage',sname=res.nameSkill(h.skillConfigId);
            if(typ==='damage'&&actorOf(h.castRoleUid)?.kind==='awakener'&&actorOf(h.targetRoleUid)?.kind==='monster'){
              const pr=board.get(String(h.castRoleUid))?.props||{},tp=board.get(String(h.targetRoleUid))?.props||{};
              const vOn=[...(bstates.get(String(h.targetRoleUid))?.values()||[])].some(x=>x.stateId===2934&&x.layer>0);
              const pk={};for(const k of HIT_PROPS)if(pr[k])pk[k]=pr[k];
              hitLog.push({uid:String(h.castRoleUid),cmd:String(h.fromCmdServerUid??h.cmdServerUid??''),target:String(h.targetRoleUid),skill:h.skillConfigId,dmg:Number(h.originVal)||amt,crit:!!h.isCrit,round:bout,P:pk,
                vOn,vPct:tp.vulnerable_per||50,buffs:(activeBuff.get(String(h.castRoleUid))||[]).map(b=>({...b}))});
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
    return {rounds:[...rounds.values()].sort((a,b)=>a.round-b.round),actors,frameCount,eventCount:globalSeq,res,ent,chip,campOf,lastStats,keeperPicks,relicBuffs,hitLog,gears,gearRecs};
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
  // the full board of each action is only built when its <details> is opened (long battles have hundreds of them)
  let snapStore=[];
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
    return `<details class="mr2round mr2opening" open><summary><b>${ui('战斗开局','Battle opening')}</b><small>${ui(`造物 ${relics.length} 个 · 牌库 ${cards.length} 张`,`${relics.length} relics · ${cards.length} cards`)}</small></summary><div class="mr2rbody">${relics.length?`<div class="mr2osec"><div class="mr2boardtitle">${ui('拥有的造物','Relics')}</div><div class="mr2relics">${relicHtml}</div></div>`:''}${cards.length?`<div class="mr2osec"><div class="mr2boardtitle">${ui('牌库状态（开局）','Starting deck')}</div><div class="mr2decks">${groups}</div></div>`:''}</div></details>`;
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
    const types=h=>asList(res.skill[String(h.skill)]?.Type);
    const scopeOf=h=>{const T=types(h);return {card:T.some(t=>String(t).startsWith('Card_')),strike:T.includes('Card_Strike'),attach:T.includes('Card_AttachPost'),ult:T.includes('Ulti_Skill')}};
    // damage-relevant stats of one hit. mode 'basic' = old model (basic pools only), 'full' = calculator-style scoped pools
    const ctxOf=(h,mode='full')=>{
      const P=h.P,sc=scopeOf(h),g=k=>P[k]||0,full=mode==='full';
      const out=g('basic_damage_per')+(full?g('o_damage_per')+(sc.card?g('o_damage_per_card'):0)+(sc.strike?g('o_damage_per_strikecard'):0)+(sc.attach?g('o_damage_per_attachpost'):0)+(sc.ult?g('o_damage_per_ulti'):0):0);
      const inn=g('i_basic_damage_per');
      const fin=full?g('i_damage_per')+(sc.strike?g('i_damage_per_strikecard'):0)+g('damage_per2monster_boss'):0;
      const cd=g('crit_damage')+(sc.ult?g('crit_damage_from_ulti'):0);
      const S=g('damage_plus')+(sc.strike?g('strikecard_damage_plus'):0);
      const atkForce=Math.ceil(g('atk')*(1+g('atk_per')/100));
      return {sc,out,inn,fin,cd,S,atkForce,T:atkForce*(1+out/100)*(1+inn/100)};
    };
    const Vof=(h,useV=true)=>useV&&h.vOn?1+h.vPct/100:1;
    const dnOf=(h,c,useV=true)=>h.dmg/(h.crit?1+c.cd/100:1)/(1+c.fin/100)/Vof(h,useV);
    const byActor=new Map();for(const h of log){if(scopeOf(h).ult)continue;if(!byActor.has(h.uid))byActor.set(h.uid,[]);byActor.get(h.uid).push(h)}
    const fits=new Map(),report=[];
    const fitActor=(hits,mode,useV)=>{
      const uniq=new Map();for(const h of hits){const c=ctxOf(h,mode),key=`${h.skill}|${Math.round(dnOf(h,c,true))}|${c.S}|${c.T.toFixed(1)}`;if(!uniq.has(key))uniq.set(key,{h,c})}
      const pts=[...uniq.values()],skills=[...new Set(pts.map(p=>p.h.skill))],sIdx=new Map(skills.map((s,i)=>[s,i])),distinctS=new Set(pts.map(p=>p.c.S)).size;
      const rows=pts.map(p=>{const r=new Array(skills.length+1).fill(0);r[sIdx.get(p.h.skill)]=p.c.T;r[skills.length]=p.c.S;return r}),y=pts.map(p=>dnOf(p.h,p.c,useV)),w=y.map(v=>1/Math.max(1,v));
      const x=distinctS>=2&&pts.length>skills.length?solveLeastSquares(rows,y,w):null;
      let errs=null;if(x)errs=rows.map((r,i)=>Math.abs(r.reduce((t,v,k)=>t+v*x[k],0)-y[i])/y[i]);
      // calculator default (strength x1): refit only per-skill coefficients
      let calcErr=null;{const r1=pts.map(p=>{const r=new Array(skills.length).fill(0);r[sIdx.get(p.h.skill)]=p.c.T;return r}),y1=pts.map((p,i)=>y[i]-p.c.S),xx=solveLeastSquares(r1,y1,w);if(xx)calcErr=r1.map((r,i)=>Math.abs(r.reduce((t,v,k)=>t+v*xx[k],0)+pts[i].c.S-y[i])/y[i]).reduce((a,b)=>a+b,0)/pts.length}
      return {pts,skills,distinctS,x,m:x?Math.max(0,Math.min(10,x[skills.length])):null,mean:errs?errs.reduce((a,b)=>a+b,0)/errs.length:null,max:errs?Math.max(...errs):null,calcErr};
    };
    for(const [uid,hits] of byActor){
      const f=fitActor(hits,'full',true),fNoV=fitActor(hits,'full',false),fOld=fitActor(hits,'basic',true);
      const pairs=new Map();for(const h of hits){const k=`${h.cmd}|${h.skill}|${h.target}|${JSON.stringify(h.P)}|${h.vOn}`;const o=pairs.get(k)||{};o[h.crit?'c':'n']=h.dmg;o.cd=ctxOf(h).cd;pairs.set(k,o)}
      const crit=[...pairs.values()].filter(o=>o.c&&o.n).map(o=>({got:o.c/o.n,want:1+o.cd/100}));
      const a=tl.actors.get(uid),confident=f.distinctS>=3&&f.pts.length>=f.skills.length+3&&f.x!=null&&f.mean<.25;
      if(f.m!=null)fits.set(uid,{m:f.m,confident});
      report.push({uid,name:a?.name||uid,confident,hits:hits.length,contexts:f.pts.length,distinctS:f.distinctS,m:f.m,mOld:fOld.m,meanErr:f.mean,maxErr:f.max,meanErrNoVuln:fNoV.mean,meanErrOld:fOld.mean,calcErr:f.calcErr,crit});
    }
    // attribute every buff (relics + wheels + covenants) with the fitted multipliers
    for(const rec of tl.relicBuffs.values()){rec.extra=0;for(const i of rec.instances){i.extra=0;i.hits=0}}
    const fallbackM=(()=>{const ms=[...fits.values()].filter(f=>f.confident).map(f=>f.m).sort((a,b)=>a-b);return ms.length?ms[Math.floor(ms.length/2)]:1})();
    const inScope=(sc,scope)=>!scope||scope==='all'||!!sc[scope];
    for(const h of log){
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
        const x=h.dmg*Math.max(0,Math.min(1,frac));b.inst.extra+=x;b.inst.hits++;b.rel.extra+=x;
      }
    }
    tl.calib={report,fallbackM,fits};
    return tl.calib;
  }
  // ---- statistics ---------------------------------------------------------------------
  function computeStats(full,tl){
    calibrateHits(tl);
    const res=tl.res,bd=full.battleDat||{},actors=tl.actors;
    const events=[];for(const r of tl.rounds)for(const e of r.events)if(e.kind!=='snap')events.push({...e,round:r.round});
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
        if(e.kind==='card'){r.plays++;totalPlays++;r.energy+=Number(e.cost)||0;totalEnergy+=Number(e.cost)||0;r.types.set(info.label,(r.types.get(info.label)||0)+1)}
        if(info.cls==='awake'){awakenOrder.push({round:e.round,time:e.time,a,name:e.skillName});if(!r.awake)r.awake={round:e.round,order:awakenOrder.length}}
        if(e.kind==='ultimate'||info.cls==='ulti'){r.ulti++;ultiOrder.push({round:e.round,time:e.time,a,name:e.skillName})}
      }
      if(e.kind==='keeper')keeperUses.push(e);
      if(e.kind==='move'){if(e.mv==='draw')draws+=e.count||1;if(e.mv==='discard')discards+=e.count||1;if(e.mv==='exhaust')exhausts+=e.count||1}
    }
    // damage / block / heal by source: the game's own stat packs when present, else rebuilt from hit events
    const addSrc=(r,typ,id,stat,v)=>{const key=`${typ}|${id}`;const o=r.src.get(key)||{typ,id,dmg:0,block:0,heal:0};if(stat==='AwakerDoDamage'){o.dmg+=v;r.dmg+=v}else if(stat==='AwakerDoBlock'){o.block+=v;r.block+=v}else if(stat==='AwakerDoHeal'){o.heal+=v;r.heal+=v}r.src.set(key,o)};
    const stateTotals=new Map();let havePacks=false;
    const packs=tl.lastStats?.battleStatPackMgr?.battleStatPackData||[];
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
    const startTids=(bd.relics||[]).map(r=>String(r.tid)),all=[...new Set([...startTids,...trig.keys()])];
    const relicRows=all.map(tid=>{
      const rec=res.relic[tid]||{},sids=[];for(const [k,v] of Object.entries(rec))if(/^State\d+$/.test(k)&&Array.isArray(v))sids.push(...v.map(String));
      const out={dmg:0,block:0,heal:0};for(const sid of sids){const t=stateTotals.get(sid);if(t){out.dmg+=t.dmg;out.block+=t.block;out.heal+=t.heal}}
      const t=trig.get(tid);return {tid,buff:tl.relicBuffs?.get(tid)||null,start:startTids.includes(tid),n:t?.n||0,rounds:[...(t?.rounds||[])].sort((a,b)=>a-b),...out,mapped:sids.length>0};
    }).sort((a,b)=>b.dmg-a.dmg||b.n-a.n);
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
      const rec=tl.gearRecs?.get(e.key);
      const SUPPORTED=new Set(['BSTAfterUseCard','BSTAfterUseKeeperSkill','BSTAfterUltiSkill','BSTAfterBoutBegin','BSTAfterBoutEnd','BSTAfterLaunchSwallow','CARD']);
      const chs=(e.channels||[]).filter(c=>SUPPORTED.has(c.base)),sup=chs.length>0;
      const roundSet=new Set();for(const c of chs)for(const r of c.rounds)roundSet.add(r);
      const n=sup?chs.reduce((a,c)=>a+c.count,0):e.triggers.times.size,rounds=sup?[...roundSet].sort((a,b)=>a-b):[...e.triggers.rounds].sort((a,b)=>a-b);
      const lines=[];for(const c of (e.channels||[])){if(c.cmd==null||!c.count)continue;for(const l of gearEffectLines(tl.res,e,c))lines.push(l)}
      return {...e,n,rounds,out,extra:rec?.extra||0,buffs:rec?.instances||[],byChannels:sup,channelRows:(e.channels||[]).filter(c=>!c.once||c.count),effectLines:[...new Set(lines)]};
    }).sort((a,b)=>(a.kind===b.kind?0:a.kind==='wheel'?-1:1)||(b.extra+b.out.dmg)-(a.extra+a.out.dmg));
    const gearExtra=gearRows.reduce((n,g)=>n+g.extra+g.out.dmg,0);
    const stateRows=[...stateTotals.entries()].map(([id,t])=>({id,...t})).filter(x=>x.dmg>0).sort((a,b)=>b.dmg-a.dmg);
    return {per:[...per.values()],totalDmg,totalPlays,totalEnergy,draws,discards,exhausts,awakenOrder,ultiOrder,keeperUses:keeperUses.length,keeperRows,relicRows,relicDmg,gearRows,gearExtra,buffExtra,powerGain,basicGain,stateRows,havePacks,rounds:tl.rounds.length,picks:tl.keeperPicks||[]};
  }
  const pctOf=(a,b)=>b>0?Math.round(a/b*1000)/10:0;
  const bar=(frac,cls='')=>`<span class="mr2sbar ${cls}"><i style="width:${Math.max(0,Math.min(100,frac*100)).toFixed(1)}%"></i></span>`;
  function renderCalib(tl){
    const c=tl.calib;if(!c||!c.report.length)return '';
    const pc=v=>v==null?'—':`${(v*100).toFixed(1)}%`;
    const rows=c.report.map(r=>{
      const critOk=r.crit.filter(x=>Math.abs(x.got/x.want-1)<.01).length;
      return `<div class="mr2crow"><b>${esc(r.name)}${r.confident?'':`<small class="lowc">${ui('样本不足','low sample')}</small>`}</b><span>${r.hits}<small>${ui('次命中','hits')} · ${r.contexts} ${ui('种条件','ctx')}</small></span><span>${r.m==null?'—':`×${r.m.toFixed(2)}`}<small>${ui('拟合力量倍率','fitted STR mult')}${r.mOld!=null?` · ${ui(`未计分类池 ×${r.mOld.toFixed(2)}`,`no scoped pools ×${r.mOld.toFixed(2)}`)}`:''}</small></span><span class="${r.calcErr!=null&&r.meanErr!=null&&r.calcErr>r.meanErr*1.5?'bad':''}">${pc(r.calcErr)}<small>${ui('计算器默认 ×1 误差','calc ×1 error')}</small></span><span class="${r.meanErr!=null&&r.meanErr<.1?'good':''}">${pc(r.meanErr)}<small>${ui('拟合后误差','fitted error')}</small></span><span>${r.crit.length?`${critOk}/${r.crit.length}`:'—'}<small>${ui('暴击倍率精确吻合组数','exact crit pairs')}</small></span></div>`;
    }).join('');
    const fitted=c.report.filter(r=>r.m!=null&&r.confident),ms=fitted.map(r=>r.m).sort((a,b)=>a-b),med=ms.length?ms[Math.floor(ms.length/2)]:null,mo=fitted.filter(r=>r.mOld!=null).map(r=>r.mOld).sort((a,b)=>a-b),oldMed=mo.length?mo[Math.floor(mo.length/2)]:null;
    const critAll=c.report.flatMap(r=>r.crit),critExact=critAll.filter(x=>Math.abs(x.got/x.want-1)<.01).length;
    const vBetter=fitted.filter(r=>r.meanErr!=null&&r.meanErrNoVuln!=null&&r.meanErr<r.meanErrNoVuln).length;
    const lines=[
      !critAll.length?null:(critExact/critAll.length>=.85?`✓ ${ui(`暴击：伤害 = 非暴击 × (1 + 暴击伤害%)，在 ${critAll.length} 组同条件命中中有 ${critExact} 组精确成立（偏差 <1%）${critAll.length>critExact?'；其余个别组可能是该次命中被护盾抵挡/溢出等拆分了伤害':''}`,`Crit: ×(1 + crit damage%) holds exactly in ${critExact}/${critAll.length} same-context pairs`)}`:`✗ ${ui(`暴击倍率只有 ${critExact}/${critAll.length} 组与 1 + 暴击伤害% 吻合`,`Crit multiplier matches 1 + crit damage% in only ${critExact}/${critAll.length} pairs`)}`),
      med==null?(c.report.some(r=>r.m!=null)?`△ ${ui('可拟合的角色样本太少（需要至少 3 种力量取值且条件数多于技能数），暂不下结论','Too few contexts to conclude')}`:null):`${Math.abs(med-1)>.3?'✗':'✓'} ${ui(`力量倍率：计入分类基伤池（卡牌 / 打击 / 追击 / 爆发）和终伤池（局内伤害、对首领增伤）后，${oldMed&&Math.abs(oldMed-med)>.1*med?`拟合力量倍率由约 ×${oldMed.toFixed(2)} 降到 ×${med.toFixed(2)}`:`拟合力量倍率约 ×${med.toFixed(2)}`}（计算器默认 ×1）。${Math.abs(med-1)>.3?'剩余差距可能来自触腕/其他加算项或未识别的乘区。':'与计算器默认基本一致。'}`,`Strength multiplier: with scoped base pools and final pools the fit drops from ×${(oldMed||med).toFixed(2)} to ×${med.toFixed(2)} (calculator: ×1).`)}`,
      fitted.length?(vBetter>=Math.ceil(fitted.length/2)?`✓ ${ui('易伤：对带易伤的目标按 ×(1 + 易伤增幅) 计入后拟合更准','Vulnerability ×(1 + amp) improves the fit')}`:`? ${ui('易伤乘区本场无法确认（样本不足或已被其他乘区吸收）','Vulnerability could not be confirmed on this sample')}`):null,
      fitted.length?`${fitted.every(r=>r.meanErr<.1)?'✓':'△'} ${ui('公式顺序（攻击力×系数×基伤池 → +力量 → ×易伤 → ×暴击）拟合后平均误差','Formula order fits with mean error ')}${pc(fitted.reduce((a,r)=>a+r.meanErr,0)/fitted.length)}${fitted.some(r=>r.maxErr>.2)?ui('，个别条件偏差超过 20%，说明还有未建模的乘区（如终伤池、伤害强效、状态加成）','; some contexts deviate >20%: unmodelled multipliers'):''}`:null
    ].filter(Boolean);
    return `<div class="mr2ssec"><h5>${ui('伤害公式校验（用本场每次命中拟合）','Damage formula check (fitted on this replay)')}</h5>
      <div class="mr2crow head"><b>${ui('角色','Awakener')}</b><span>${ui('样本','Sample')}</span><span>${ui('力量倍率','STR mult')}</span><span>${ui('按计算器 ×1','Calc ×1')}</span><span>${ui('拟合后','Fitted')}</span><span>${ui('暴击','Crit')}</span></div>${rows}
      <div class="mr2calib">${lines.map(l=>`<div>${esc(l)}</div>`).join('')}<small>${ui('说明：狂气爆发的伤害使用独立的力量/暴击修正，这里不参与拟合；上面的造物额外伤害已改用拟合出的力量倍率重新折算。样本越多、力量取值越分散，拟合越可信；狂气爆发的力量倍率按角色的 ulti_strength_multiple 估算，未经本场数据验证。','Ultimates use separate strength/crit modifiers and are excluded from the fit. The relic damage above uses the fitted multipliers.')}</small></div></div>`;
  }
  // human-readable effect of a trigger command (looked up in the replay's Cmd table)
  function gearEffectLines(res,e,ch){
    const cmd=res.rr?.Cmd?.[String(ch.cmd)];if(!cmd)return [];
    const params=e.mainStates[0]?.params||[],out=[];
    const evalPara=expr=>expr==null?null:evalNum(String(expr).replace(/StateArg(\d+)/g,(m,n)=>params[Number(n)-1]??'#'),{});
    for(const dl of cmd.data_list||[]){
      if(dl.Type==='BEGainUltiEnergy'){const v=evalPara(ch.para);out.push(v!=null?`${ui('狂气','Aliemus')} +${fmt(v)}${ch.count?` × ${ch.count} = +${fmt(v*ch.count)}`:''}`:ui('获得狂气','Gain Aliemus'))}
      else if(dl.Type==='BECreateCard')out.push(ui('生成卡牌','Create card'));
    }
    return out;
  }
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
      const counters=[...g.stateCounts.entries()].sort((a,b)=>b[1]-a[1]).map(([sid,n])=>`<div class="mr2srow inst"><span class="mr2sname">${esc(res.nameState(sid))}<small>${ui('状态','State')} #${esc(sid)}</small></span><span></span><b>${n}</b><small>${ui('次层数增加','increments')}</small></div>`).join('');
      const eff=isW?(g.desc?`<div class="mr2gdesc">${esc(g.desc)}</div>`:''):g.effectsEn.map(e=>`<div class="mr2gdesc"><b>${esc(e.pieces)} ${ui('件','pc')}</b> ${esc(e.desc)}</div>`).join('');
      const hasBuff=g.extra>0;
      return `<div class="mr2gcard ${isW?'wheel':'cov'}"${g.desc||g.effectsEn.length?tipAttr(`${g.name}${g.en?` · ${g.en}`:''}`,kindTag,isW?g.desc:g.effectsEn.map(e=>`${e.pieces}${ui('件','pc')}：${e.desc}`).join('\n')):''}>
        <div class="mr2ghead">${ico(g.icon,g.name,`gi ${isW?'':'cov'}`)}<div class="mr2gtitle"><b>${esc(g.name)}</b><small>${g.en?esc(g.en):''}${g.rarity?` · ${esc(g.rarity)}`:''}</small></div><span class="mr2tag ${isW?'wheelTag':'covTag'}">${kindTag}</span><span class="mr2gowners">${ownerChips(g)}</span></div>
        <div class="mr2gmetrics"><span><small>${ui('触发次数','Triggers')}</small><b>${g.n}</b><em>${g.rounds.length?ui(`第 ${g.rounds.join('/')} 回合`,`R${g.rounds.join('/')}`):ui('仅开局生效','Static')}${g.byChannels?'':ui(' · 按相关状态计','')}</em></span>
          ${g.extra||g.out.dmg?`<span class="hot"><small>${ui('估算额外伤害','Est. extra DMG')}</small><b>${fmt(Math.round(g.extra+g.out.dmg))}</b><em>${total?pctOf(g.extra+g.out.dmg,total):0}%</em></span>`:''}
          ${g.out.block||g.out.heal?`<span><small>${ui('护盾 / 治疗','Shield / Heal')}</small><b>${fmt(g.out.block)}</b><em>${fmt(g.out.heal)}</em></span>`:''}</div>
        ${g.byChannels&&g.channelRows.length?`<div class="mr2flow">${[...new Map(g.channelRows.filter(c=>c.count).map(c=>[c.label,c])).values()].map(c=>`<span class="mr2tag trig" title="${esc(c.cap?ui(`每回合最多 ${c.cap} 次`,`max ${c.cap}/round`):'')}">${esc(c.label)} ×${c.count}${c.cap?` <small>${ui(`限 ${c.cap}/回合`,`cap ${c.cap}/r`)}</small>`:''}</span>`).join('')}</div>`:''}
        ${g.effectLines.length||dynLines(g).length?`<div class="mr2geff">${[...g.effectLines,...dynLines(g)].map(l=>`<span>${esc(l)}</span>`).join('')}</div>`:''}
        ${g.statics.length?`<div class="mr2flow">${staticChips(g)}</div>`:''}
        ${outChips(g)?`<div class="mr2sout">${outChips(g)}</div>`:''}
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
          ${isK?'':`<span><small>${ui('出牌数（牌权）','Cards (share)')}</small><b>${r.plays}</b><em>${pctOf(r.plays,st.totalPlays)}%</em></span><span><small>${ui('消耗算力','Energy spent')}</small><b>${fmt(r.energy)}</b><em>${pctOf(r.energy,st.totalEnergy)}%</em></span><span><small>${ui('狂气爆发','Bursts')}</small><b>${r.ulti}</b></span>`}
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
      const buffEm=b?`<em class="p">${b.kind==='power'?ui(`力量类 · 共产生 ${fmt(b.gain)} 点力量（每次作用于全队）`,`Power · +${fmt(b.gain)} power (team-wide)`):ui(`基伤类 · 每名唤醒体 +${fmt(Math.round(b.gain*10)/10)}% 基础伤害`,`Basic dmg · +${fmt(Math.round(b.gain*10)/10)}% each`)}</em><em class="d">${ui('估算额外伤害','Est. extra DMG')} ${fmt(Math.round(b.extra))}${st.totalDmg?` (${pctOf(b.extra,st.totalDmg)}%)`:''}</em>`:'';
      const inst=b?`<details class="mr2minor relicinst"><summary>${ui(`每次触发明细 ${b.instances.length}`,`Per trigger ${b.instances.length}`)}</summary><div class="mr2srcs">${b.instances.map(i=>`<div class="mr2srow inst"><span class="mr2sname">${ui(`第 ${i.round||'开局'} 回合`,i.round?`R${i.round}`:'Opening')}${i.temp?`<small>${ui('临时力量（本回合）','Temporary')}</small>`:''}</span><span>${b.kind==='power'?`+${fmt(i.gain)} ${ui('力量','power')}`:`+${fmt(Math.round(i.gain*10)/10)}%`}${i.awakeners.size>1?` <small>${ui(`作用 ${i.awakeners.size} 名唤醒体`,`${i.awakeners.size} awakeners`)}</small>`:''}</span><b>${fmt(Math.round(i.extra))}</b><small>${ui(`${i.hits} 次命中`,`${i.hits} hits`)}</small></div>`).join('')}</div></details>`:'';
      return `<div class="mr2relicwrap"><div class="mr2srow relicrow"${relicTipAttr(res,r.tid)}>${ico(relicIconSrc(res,r.tid),res.nameRelic(r.tid),'rl big')}<span class="mr2sname">${esc(res.nameRelic(r.tid))}<small>${r.start?ui('开局携带','Starting'):ui('战斗中获得','Gained in battle')}</small></span>${bar(r.n/maxR,'relic')}<b>${r.n?ui(`${r.n} 次`,`${r.n}×`):b?ui('开局生效','At start'):ui('未触发','—')}</b><span class="mr2sout">${r.dmg?`<em class="d">${ui('额外伤害','DMG')} ${fmt(r.dmg)}${st.totalDmg?` (${pctOf(r.dmg,st.totalDmg)}%)`:''}</em>`:''}${r.block?`<em class="b">${ui('护盾','Shield')} ${fmt(r.block)}</em>`:''}${r.heal?`<em class="h">${ui('治疗','Heal')} ${fmt(r.heal)}</em>`:''}${buffEm}${!r.dmg&&!r.block&&!r.heal&&!b?`<em class="n">${r.mapped?ui('无直接产出（增益类）','No direct output'):ui('产出未知','Output unknown')}</em>`:''}</span></div>${inst}</div>`;
    }).join('');
    const buffSummary=st.powerGain||st.basicGain?`<div class="mr2buffsum"><b>${ui('增益类造物合计','Buff relics total')}</b><span>${st.powerGain?ui(`产生力量 +${fmt(st.powerGain)}`,`power +${fmt(st.powerGain)}`):''}</span><span>${st.basicGain?ui(`基础伤害累计 +${fmt(Math.round(st.basicGain*10)/10)}%（每名唤醒体）`,`basic dmg +${fmt(Math.round(st.basicGain*10)/10)}% each`):''}</span><span class="d">${ui('估算额外伤害','Est. extra DMG')} ${fmt(Math.round(st.buffExtra))}${st.totalDmg?` (${pctOf(st.buffExtra,st.totalDmg)}%)`:''}</span><small>${ui('估算方法：先用本场每次命中拟合出各角色的力量倍率，再按该造物提供的力量（力量×倍率占该次命中非暴击伤害的比例）或基础伤害（基伤部分占 1+基伤 的比例）折算，详见下方“伤害公式校验”。','Estimate: each hit is split by the relic\'s share of power (of attack force + power) or basic damage (of 1 + basic damage). Indicative only.')}</small></div>`:'';
    const stateHtml=st.stateRows.length?`<div class="mr2ssec"><h5>${ui('状态伤害来源（出血、旧日余烬等）','Damage from states (bleed, ...)')}</h5>${st.stateRows.map(x=>`<div class="mr2srow"${stateTipAttr(res,x.id,{})}><span class="mr2sname">${esc(res.nameState(x.id))}</span>${bar(x.dmg/st.stateRows[0].dmg,'dmg')}<b>${fmt(x.dmg)}</b><small>${pctOf(x.dmg,st.totalDmg)}%</small></div>`).join('')}</div>`:'';
    const sum=[[ui('总伤害','Total damage'),fmt(st.totalDmg)],[ui('回合数','Rounds'),st.rounds],[ui('出牌数','Cards played'),st.totalPlays],[ui('消耗算力','Energy spent'),fmt(st.totalEnergy)],[ui('抽牌','Draws'),st.draws],[ui('弃牌','Discards'),st.discards],[ui('消耗牌','Exhausted'),st.exhausts],[ui('钥令使用','Keyflare casts'),st.keeperUses],[ui('造物额外伤害','Relic damage'),fmt(st.relicDmg)],[ui('增益造物估算伤害','Buff relic est. dmg'),fmt(Math.round(st.buffExtra))],[ui('命轮/密契估算伤害','Gear est. dmg'),fmt(Math.round(st.gearExtra))]].map(([k,v])=>`<span><small>${esc(k)}</small><strong>${esc(v)}</strong></span>`).join('');
    return `<details class="mr2round mr2stats" open><summary><b>${ui('数据统计','Statistics')}</b><small>${ui('出牌 / 算力 / 觉醒 / 钥令 / 造物','cards / energy / awakening / keyflare / relics')}</small></summary><div class="mr2rbody">
      <div class="mr2ssum">${sum}</div>
      <div class="mr2ssec"><h5>${ui('角色数据','Per character')}</h5><div class="mr2scards">${people}</div></div>
      <div class="mr2ssec"><h5>${ui('觉醒与爆发顺序','Awakening & burst order')}</h5>${orderRow(st.awakenOrder,ui('灵知觉醒顺序','Awakening order'))||`<div class="mr2empty">${ui('本场没有灵知觉醒','No awakening this battle')}</div>`}${orderRow(st.ultiOrder,ui('狂气爆发顺序','Burst order'))}</div>
      <div class="mr2ssec"><h5>${ui('钥令使用与选择偏好','Keyflare skills & picks')}</h5>${keeperHtml}</div>
      <div class="mr2ssec"><h5>${ui('造物触发与产出','Relics')}${st.relicDmg?` <em class="mr2hot">${ui('造物额外伤害合计','Relic damage')} ${fmt(st.relicDmg)}</em>`:''}</h5>${relicHtml||`<div class="mr2empty">—</div>`}${buffSummary}</div>
      ${renderGear(st,tl)}
      ${stateHtml}
      ${renderCalib(tl)}
      ${st.havePacks?'':`<div class="mr2status">${ui('此回放缺少游戏内统计包，伤害按逐次命中事件重建，造物额外伤害无法归因。','This replay has no in-game stat packs; damage is rebuilt from hit events and relic damage cannot be attributed.')}</div>`}
    </div></details>`;
  }
  function renderFull(full){
    const host=document.getElementById('mrReplayResult');if(!host)return;snapStore=[];const tl=buildTimeline(full),bd=full.battleDat||{},rounds=tl.rounds;
    Object.assign(RES_LABEL,{energy:ui('算力','Energy'),keeper_energy:ui('钥令能量','Keyflare'),ulti_energy:ui('狂气','Aliemus'),block:ui('护盾','Shield')});
    const openingHtml=renderOpening(full,tl)+renderStats(full,tl);
    const eventHtml=openingHtml+rounds.map((r,ri)=>renderRound(r,tl,ri<2)).join('');
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
  window.MorimensReplayReview={analyze,fetchReplay,buildTimeline,unpackLz4Msgpack,calibrateHits,computeStats};
})();
