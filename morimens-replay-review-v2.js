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
    const nameMonster=id=>{const x=monster[String(id)]||{};return isEn()?(x.NameEn||pipeName(x.Name)||tailCn(x.CnID)||String(id)):(pipeName(x.Name)||tailCn(x.CnID)||x.NameEn||String(id))};
    return {rr,skill,aw,state,relic,monster,nameSkill,nameState,nameRelic,nameAw,nameMonster};
  }

  function buildTimeline(full){
    const res=resources(full),bd=full.battleDat||{},actors=new Map();
    for(const r of bd.roleData||[])actors.set(String(r.uid),{uid:r.uid,tid:r.tid,name:res.nameAw(r.tid),camp:1});
    for(const seg of full.recordSegments||[])for(const rec of seg||[]){const md=rec?.msgData;if(rec?.msgId===1001&&md){for(const m of md.monsterDataList||[])actors.set(String(m.uid),{uid:m.uid,tid:m.tid,name:res.nameMonster(m.tid),camp:2});for(const r of md.roleDataList||[])if(!actors.has(String(r.uid))){let name;if(r.roleType===3)name=r.playerName||ui('守密人','Keeper');else if(r.camp===2)name=res.nameMonster(r.tid);else name=res.nameAw(r.tid);actors.set(String(r.uid),{uid:r.uid,tid:r.tid,name,camp:r.camp});}}}
    const actorName=uid=>actors.get(String(uid))?.name||(String(uid)==String(bd.battleUid)?ui('守密人','Keeper'):`UID ${uid}`);
    const rounds=new Map();let bout=0,globalSeq=0,frameCount=0;
    const getRound=n=>{if(!rounds.has(n))rounds.set(n,{round:n,events:[]});return rounds.get(n)};
    const push=(kind,label,data,raw,meta={})=>{if(!bout)return;getRound(bout).events.push({seq:++globalSeq,kind,label,time:raw.time??null,eventId:raw.eventId,data,...meta})};
    for(let si=0;si<(full.recordSegments||[]).length;si++){
      const seg=full.recordSegments[si]||[];for(let ri=0;ri<seg.length;ri++){
        const rec=seg[ri]||{},fl=rec?.msgData?.frameList;if(!Array.isArray(fl))continue;
        for(let fi=0;fi<fl.length;fi++){
          const fr=fl[fi]||{};frameCount++;const e=fr.eventId,d=fr.data||{};
          if(e===1019&&d?.boutNumber){bout=Number(d.boutNumber)||bout;if(d?.config?.camp===1&&d.newPhase===1)push('round',ui(`第 ${bout} 回合开始`,`Round ${bout} start`),d,fr,{phase:d.newPhase});continue}
          if(!bout)continue;
          if(e===1067){
            const tid=d.configId??d.tid,who=actorName(d.ownerUid??d.roleUid),name=res.nameSkill(tid),kind=d.deck==='UsingDeck'?'card':(d.roleUid?'ultimate':'skill');
            push(kind,`${who} · ${name}`,d,fr,{skillTid:tid,actorUid:d.ownerUid??d.roleUid,cardUid:d.uid,cost:d.cost,deck:d.deck});continue;
          }
          if(e===1064){const name=res.nameSkill(d.skillId);push('keeper',`${ui('钥令','Keeper skill')} · ${name}`,d,fr,{skillTid:d.skillId,actorUid:d.roleUid});continue}
          if(e===1093){const name=res.nameSkill(d.skillTid);push('trigger',`${actorName(d.casterUid)} · ${name}`,d,fr,{skillTid:d.skillTid,actorUid:d.casterUid,producerUid:d.producerUid});continue}
          if(e===1014&&d.beHitConfig){const h=d.beHitConfig,delta=(Number(h.curHp)||0)-(Number(h.oldHp)||0),amt=Math.abs(delta||Number(h.changeVal)||0),typ=delta>0?'heal':'damage';push(typ,`${actorName(h.castRoleUid)} → ${actorName(h.targetRoleUid)} · ${res.nameSkill(h.skillConfigId)} · ${typ==='damage'?ui('伤害','DMG'):ui('治疗','Heal')} ${fmt(amt)}${h.isCrit?` · ${ui('暴击','CRIT')}`:''}`,d,fr,{skillTid:h.skillConfigId,actorUid:h.castRoleUid,targetUid:h.targetRoleUid,amount:amt,crit:!!h.isCrit,blocked:h.blockedDamage||0,damageType:h.damageType});continue}
          if(e===1050){push('relic',`${ui('造物触发','Relic')} · ${res.nameRelic(d.relicTid)}`,d,fr,{relicTid:d.relicTid});continue}
          if(e===1046){push('select',`${ui('目标选择','Target selection')} · ${res.nameSkill(d.skillConfigId)} → ${(d.targetUids||[]).map(actorName).join(', ')||'-'}`,d,fr,{skillTid:d.skillConfigId,targetUids:d.targetUids||[]});continue}
          if(e===1049){push('swallow',`${ui('吞噬卡牌','Swallow card')} · ${(d.cardUidList||[]).join(', ')}`,d,fr,{cardUids:d.cardUidList||[]});continue}
          if(e===1004){push('state',`${ui('状态添加','State add')} · ${res.nameState(d.stateId)} → ${actorName(d.ownerUid??d.roleUid)}`,d,fr,{stateId:d.stateId,actorUid:d.castRoleUid,targetUid:d.ownerUid??d.roleUid,layer:d.layer});continue}
          if(e===1007){push('state',`${ui('状态层数','State layer')} · ${res.nameState(d.stateId)} ${d.oldLayer??'?'} → ${d.newLayer??'?'} · ${actorName(d.ownerUid??d.roleUid)}`,d,fr,{stateId:d.stateId,actorUid:d.castRoleUid,targetUid:d.ownerUid??d.roleUid});continue}
          if(e===1028&&['energy','keeper_energy','ulti_energy','block'].includes(d.propertyType)){
            const labels={energy:ui('算力','Energy'),keeper_energy:ui('钥令能量','Keeper energy'),ulti_energy:ui('狂气','Ultimate energy'),block:ui('护盾','Block')};push('property',`${actorName(d.uid)} · ${labels[d.propertyType]} ${Number(d.changedValue)>=0?'+':''}${fmt(d.changedValue)}`,d,fr,{actorUid:d.uid,property:d.propertyType,changedValue:d.changedValue});continue
          }
        }
      }
    }
    return {rounds:[...rounds.values()].sort((a,b)=>a.round-b.round),actors,frameCount,eventCount:globalSeq,res};
  }

  function styles(){if(document.getElementById('morimensReplayReviewV2Style'))return;const s=document.createElement('style');s.id='morimensReplayReviewV2Style';s.textContent=`
    .mr2{display:grid;gap:14px}.mr2intro{padding:17px;border:1px solid rgba(213,177,118,.22);border-radius:15px;background:linear-gradient(135deg,rgba(213,177,118,.07),rgba(98,183,255,.04))}.mr2intro h2{margin:0;color:#f1d69f;font-size:20px}.mr2intro p{margin:8px 0 0;color:#aeb8c7;font-size:12px;line-height:1.75}.mr2form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:14px}.mr2form input{min-height:43px;border:1px solid #334155;border-radius:10px;background:#0d1724;color:#edf2f7;padding:8px 11px;font:inherit}.mr2form button{border:1px solid rgba(213,177,118,.35);border-radius:10px;background:rgba(213,177,118,.12);color:#f1d69f;padding:8px 13px;font-weight:800;cursor:pointer}.mr2status{padding:10px 12px;border-radius:10px;background:rgba(148,163,184,.07);border:1px solid rgba(148,163,184,.15);font-size:11px;color:#9ba8ba;line-height:1.65}.mr2status.ok{color:#9fd5b8;border-color:rgba(86,190,138,.25)}.mr2status.err{color:#e0aaa4;border-color:rgba(218,132,119,.28)}.mr2sum{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.mr2sum span{padding:9px 10px;border-radius:10px;background:rgba(255,255,255,.035);border:1px solid rgba(148,163,184,.1)}.mr2sum small{display:block;color:#758398;font-size:9px}.mr2sum strong{display:block;color:#e6edf6;margin-top:3px;font-size:12px;word-break:break-word}.mr2round{border:1px solid rgba(148,163,184,.14);border-radius:12px;background:rgba(4,9,16,.32);overflow:hidden}.mr2round>summary{cursor:pointer;list-style:none;padding:10px 12px;display:flex;gap:10px;align-items:center}.mr2round>summary::-webkit-details-marker{display:none}.mr2round>summary b{color:#f1d69f}.mr2round>summary small{color:#8492a5}.mr2events{padding:0 10px 10px}.mr2ev{display:grid;grid-template-columns:52px 105px 1fr;gap:8px;padding:7px 6px;border-top:1px solid rgba(148,163,184,.08);font-size:11px;align-items:start}.mr2seq{color:#6f7f93;font-variant-numeric:tabular-nums}.mr2badge{display:inline-block;padding:2px 6px;border-radius:999px;background:rgba(98,183,255,.12);color:#acd5f6;font-size:9px}.mr2badge.damage{background:rgba(218,132,119,.13);color:#efada5}.mr2badge.state{background:rgba(175,130,220,.13);color:#d0b0eb}.mr2badge.keeper{background:rgba(213,177,118,.15);color:#e7cb96}.mr2badge.relic{background:rgba(103,190,146,.13);color:#a9d8bd}.mr2label{color:#d8e1ed;line-height:1.5}.mr2label small{display:block;color:#758398}.mr2raw{margin-top:3px}.mr2raw summary{cursor:pointer;color:#6f7f93;font-size:9px}.mr2raw pre{max-height:260px;overflow:auto;white-space:pre-wrap;word-break:break-all;background:#08111c;padding:7px;border-radius:7px;color:#8fa0b5;font-size:9px}.dtideReplayReviewOpen{white-space:nowrap;border:1px solid rgba(98,183,255,.35);border-radius:7px;background:rgba(98,183,255,.09);color:#9fd0ff;padding:5px 8px;font:700 10px/1.2 inherit;cursor:pointer}@media(max-width:760px){.mr2form{grid-template-columns:1fr}.mr2sum{grid-template-columns:repeat(2,minmax(0,1fr))}.mr2ev{grid-template-columns:42px 86px 1fr}}
  `;document.head.appendChild(s)}
  function badge(kind){const names={round:ui('回合','Round'),card:ui('出牌','Card'),ultimate:ui('爆发/觉醒','Ultimate'),skill:ui('技能','Skill'),keeper:ui('钥令','Keeper'),trigger:ui('派生触发','Trigger'),damage:ui('伤害','Damage'),heal:ui('治疗','Heal'),relic:ui('造物','Relic'),select:ui('选目标','Target'),swallow:ui('吞噬','Swallow'),state:ui('状态','State'),property:ui('资源','Resource')};return `<span class="mr2badge ${esc(kind)}">${esc(names[kind]||kind)}</span>`}
  function renderFull(full){
    const host=document.getElementById('mrReplayResult');if(!host)return;const tl=buildTimeline(full),bd=full.battleDat||{},rounds=tl.rounds;
    const eventHtml=rounds.map((r,ri)=>`<details class="mr2round"${ri<2?' open':''}><summary><b>${ui(`第 ${r.round} 回合`,`Round ${r.round}`)}</b><small>${r.events.length} ${ui('条关键事件','key events')}</small></summary><div class="mr2events">${r.events.map(e=>`<div class="mr2ev"><div class="mr2seq">#${e.seq}${e.time!=null?`<br>${Number(e.time).toFixed(2)}s`:''}</div><div>${badge(e.kind)}</div><div class="mr2label">${esc(e.label)}<small>eventId=${esc(e.eventId)}${e.skillTid!=null?` · tid=${esc(e.skillTid)}`:''}${e.cardUid!=null?` · cardUid=${esc(e.cardUid)}`:''}</small><details class="mr2raw"><summary>${ui('原始事件','Raw event')}</summary><pre>${esc(JSON.stringify(e.data,null,2))}</pre></details></div></div>`).join('')}</div></details>`).join('');
    host.innerHTML=`<div class="mr2status ok">${ui('已直接从公开 BattleReplay 对象获取并在浏览器内解码。无需登录、Cookie、游戏会话密钥，也没有访问 Eremora。','Fetched the public BattleReplay object directly and decoded it in-browser. No login, cookies, game session keys, or Eremora are used.')}</div><div class="mr2sum"><span><small>battleUuid</small><strong>${esc(full.replayUuid)}</strong></span><span><small>battleTid</small><strong>${esc(bd.battleTid??'—')}</strong></span><span><small>${ui('回合','Rounds')}</small><strong>${rounds.length}</strong></span><span><small>${ui('录像记录','Records')}</small><strong>${fmt(full.recordCount)}</strong></span><span><small>${ui('原始帧','Frames')}</small><strong>${fmt(tl.frameCount)}</strong></span></div><div class="mr2status">${ui('下面的顺序来自 Replay recordZips 中 frameList 的原始排列；同一时间戳的事件仍按录像帧中的实际先后顺序显示。出牌、钥令、派生技能、伤害、状态和造物触发均保留原始 eventId，可展开查看原始事件。','The order below follows the original frameList order from Replay recordZips. Events sharing the same timestamp still preserve their replay-frame order. Cards, keeper skills, derived skills, damage, states and relic triggers retain their raw eventId and raw payload.')}</div>${eventHtml||`<div class="mr2status err">${ui('已解码回放，但没有解析到回合事件。','Replay decoded, but no round events were parsed.')}</div>`}`;
  }
  async function loadLegacy(uuid){try{const r=await fetch(`${LOCAL_BASE}/${uuid}.json`,{cache:'no-cache'});return r.ok?await r.json():null}catch{return null}}
  async function analyze(raw){
    const input=document.getElementById('mrReplayCode'),host=document.getElementById('mrReplayResult');if(raw!=null&&input)input.value=raw;const p=parseReplayCode(raw??input?.value);if(!host)return;if(!p){host.innerHTML=`<div class="mr2status err">${ui('请输入有效的 battleUuid 或 UUID#E#a 回放码。','Enter a valid battleUuid or UUID#E#a replay code.')}</div>`;return}
    host.innerHTML=`<div class="mr2status">${ui('正在从公开 BattleReplay 对象获取约 1MB 回放并解码 LZ4 + MessagePack…','Fetching the public BattleReplay object and decoding LZ4 + MessagePack…')}</div>`;
    try{const full=await fetchReplay(p.uuid);renderFull(full)}catch(err){console.error('Public replay fetch/decode failed',err);const legacy=await loadLegacy(p.uuid);if(legacy&&legacy.timeline){host.innerHTML=`<div class="mr2status err">${ui('公开回放对象获取失败（可能是浏览器 CORS 或对象已过期）。本站只有旧的聚合 timeline；请检查控制台错误。','Public replay fetch failed (browser CORS or expired object). Only the older aggregated local timeline is available; check console errors.')}</div>`}else host.innerHTML=`<div class="mr2status err"><strong>${ui('无法获取完整回放。','Could not fetch the full replay.')}</strong><br>${esc(err?.message||err)}<br>${ui('如果命令行 fetch_public_replay.py 能成功而浏览器失败，则原因基本是对象存储未允许本站域名的 CORS；这时需要在站点侧增加同源代理，而不是解 TLS。','If fetch_public_replay.py works but the browser fails, the likely cause is object-store CORS. The fix is a same-origin site proxy, not TLS decryption.')}</div>`}
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
