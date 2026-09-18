(()=>{
  const $=id=>document.getElementById(id);
  const nativeAtob=window.atob.bind(window);window.atob=value=>{const clean=String(value).replace(/[^A-Za-z0-9+/_-]/g,'').replace(/-/g,'+').replace(/_/g,'/');return nativeAtob(clean+'='.repeat((4-clean.length%4)%4))};
  const esc=s=>String(decodeMojibake(s)??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const decodeMojibake=value=>{const text=String(value??'');if(!/[ÃÂæåçèéêëìíîïðñòóôõö÷øùúûüýþã]/.test(text)||typeof TextDecoder==='undefined')return text;try{const bytes=Uint8Array.from([...text].map(c=>c.charCodeAt(0)&255));const fixed=new TextDecoder('utf-8',{fatal:true}).decode(bytes);return /�/.test(fixed)?text:fixed}catch{return text}};
  const pct=v=>Number.isFinite(Number(v))?`${Number(v).toFixed(1)}%`:'—';
  const zh=()=>localStorage.getItem('morimens.language')!=='en';
  const rankCaps=[50,200,500,1000];
  const difficultyOrder=['normal','hard','nightmare','madness'];
  const difficultyZh={all:'全部难度',normal:'普通',hard:'困难',nightmare:'噩梦',madness:'癫狂',unknown:'未识别'};
  const enlightOrder=['e0_2','e3_plus3','plus4_11','plus12'];
  const enlightZh={e0_2:'0～2启',e3_plus3:'3启～+3',plus4_11:'+4～+11',plus12:'+12',unknown:'未知'};
  const enlightColors={e0_2:'#8c97a8',e3_plus3:'#d9a441',plus4_11:'#62b7ff',plus12:'#d978d0',unknown:'#6b7280'};
  const wheelStackOrder=['stack0_2','stack3_11','stack12'];
  const wheelStackZh={stack0_2:'0～2叠',stack3_11:'3叠～+11',stack12:'+12'};
  const wheelStackColors={stack0_2:'#8c97a8',stack3_11:'#62b7ff',stack12:'#d978d0'};
  const realmOrder=['Chaos','Aequor','Caro','Ultra'];
  const realmZh={Chaos:'混沌',Aequor:'深海',Caro:'血肉',Ultra:'超维'};
  const realmIcons={Chaos:'Icon_Career2_Hundun.webp',Aequor:'Icon_Career2_Shenhai.webp',Caro:'Icon_Career2_Xuerou.webp',Ultra:'Icon_Career2_Chaowei.webp'};
  const roleOrder=['Warden','Chorus','Assault'];
  const roleZh={Warden:'防御型',Chorus:'辅助型',Assault:'伤害型'};
  const realmIconSrc=name=>'assets/morimens/realms-svg/'+(realmIcons[name]||'Icon_Career2_Hundun.webp').replace(/\.webp$/i,'.svg');
  function localAsset(src,kind){const raw=String(src||'');if(!raw)return '';const file=raw.split(/[\\/]/).pop().split('?')[0];if(kind==='wheel'&&/^Weapon_(Full|Mini)_/.test(file))return 'assets/morimens/wheels/'+(file.startsWith('Weapon_Mini_')?'Mini/':'')+file;if(kind==='creation'&&/^Icon_Creation_/.test(file))return 'assets/morimens/relics/'+file;if(kind==='covenant'&&/^Icon_Trinket_/.test(file))return 'assets/morimens/covenants/Icon/'+file;if(kind==='portrait'&&raw.startsWith('assets/'))return raw;return raw;}
  let manifest=null,season=null,stats=null,awakenerMap=new Map(),rankByUid=new Map(),filtersReady=false,searchPerformed=false;
  let flatTeamsCache=null,analysisCache=null,seasonAssistHeatMax=0,seasonLoadToken=0,renderFrame=0;

  function scoreRange(){
    const raw=String($('dtideTotalScore')?.value||'all');
    if(raw==='all'||raw==='0')return null;
    const parts=raw.split(':');
    if(parts.length===2){const lo=parts[0]===''?-Infinity:Number(parts[0]),hi=parts[1]===''?Infinity:Number(parts[1]);if(!Number.isNaN(lo)&&!Number.isNaN(hi))return [lo,hi]}
    const exact=Number(raw);return Number.isFinite(exact)&&exact>=0?[exact,exact]:null;
  }
  function scoreMatches(record){
    const range=scoreRange();if(!range)return true;
    const score=Number(record?.score);return Number.isFinite(score)&&score>=range[0]&&score<=range[1];
  }
  function rankOf(record){
    const mapped=rankByUid.get(String(record?.uid??''));
    if(Number.isFinite(mapped)&&mapped>0)return mapped;
    const raw=Number(record?.rank);return Number.isFinite(raw)&&raw>0?raw:null;
  }
  function rankMatches(record,cap){
    if(!cap)return true;
    const rank=rankOf(record);if(rank!=null)return rank<=cap;
    const current=Number(season?.seasonId)===Number(manifest?.currentSeason);
    return !current&&rankByUid.size===0;
  }
  function selectedRankCap(){const raw=String($('dtideRankScope')?.value||'all');return raw==='all'||raw==='0'?0:(Number(raw)||0)}
  function rankScopeLabel(cap){return cap?`Top ${cap}`:'全部范围'}

  function injectStyle(){
    if($('morimensDtideStyle'))return;
    const s=document.createElement('style');s.id='morimensDtideStyle';s.textContent=`
      .morimensTabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 18px;padding:6px;border:1px solid rgba(148,163,184,.16);border-radius:15px;background:rgba(15,23,42,.65);position:sticky;top:8px;z-index:40;backdrop-filter:blur(12px)}
      .morimensTab{border:1px solid transparent;border-radius:10px;padding:10px 15px;background:transparent;color:#9eabba;cursor:pointer;font:700 13px/1.2 inherit}.morimensTab[aria-selected="true"]{color:#f1ddb5;border-color:rgba(213,177,118,.36);background:rgba(213,177,118,.12)}
      .dtideHero{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}.dtideControls{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:16px}.dtideFilters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.dtideField{display:flex;flex-direction:column;gap:6px}.dtideField.span2{grid-column:span 2}.dtideField label{font-size:11px;color:#98a4b6}.dtideField input,.dtideField select{min-height:40px;border:1px solid #334155;border-radius:10px;background:#111827;color:#edf2f7;padding:8px 10px}.dtideField select[multiple]{min-height:132px}.dtideField small{font-size:10px;color:#718096;line-height:1.45}
      .dtideCharacterPicker{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:7px;max-height:286px;overflow:auto;padding:8px;border:1px solid #334155;border-radius:11px;background:#0b1220}.dtideCharacterChoice{position:relative;display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0;padding:7px 5px;border:1px solid rgba(148,163,184,.18);border-radius:9px;background:#111827;color:#cfd7e3;cursor:pointer;font:inherit}.dtideCharacterChoice:hover{border-color:rgba(217,179,108,.55)}.dtideCharacterChoice img{width:44px;height:44px;border-radius:9px;object-fit:cover;background:#08101d}.dtideCharacterChoiceName{width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;text-align:center}.dtideCharacterChoice.isSelected{border-color:#d9b36c;background:rgba(213,177,118,.18);color:#f7e3bd;box-shadow:0 0 0 1px rgba(213,177,118,.16) inset}.dtideCharacterChoice.isSelected:after{content:'✓';position:absolute;right:5px;top:5px;display:grid;place-items:center;width:17px;height:17px;border-radius:50%;background:#d9b36c;color:#172033;font-size:11px;font-weight:900}.dtideCharacterChoice:focus-visible{outline:2px solid #d9b36c;outline-offset:2px}
      .dtideStatGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:14px}.dtideStat{padding:13px;border-radius:12px;background:rgba(255,255,255,.035);border:1px solid rgba(148,163,184,.12)}.dtideStat small{display:block;color:#8290a2;font-size:10px}.dtideStat strong{display:block;margin-top:4px;font-size:20px;color:#f1dfbc}
      .dtideSection{margin-top:18px}.dtideSection h3{font-size:15px;margin:0 0 10px;color:#ead9b9}.dtideSubhead{display:flex;justify-content:space-between;align-items:end;gap:10px;flex-wrap:wrap;margin:0 0 10px}.dtideLeaderboardTabs{display:flex;gap:7px;flex-wrap:wrap;margin:0 0 10px}.dtideLeaderboardTab{border:1px solid rgba(148,163,184,.22);border-radius:9px;background:#111827;color:#aeb8c7;padding:7px 14px;font:inherit;font-size:12px;font-weight:800;cursor:pointer}.dtideLeaderboardTab[aria-selected="true"]{border-color:#b99a61;background:rgba(185,154,97,.16);color:#f1d69f}.dtideScroll{overflow:auto;border:1px solid rgba(148,163,184,.13);border-radius:12px}.dtideTable{width:100%;border-collapse:collapse;min-width:720px}.dtideTable th,.dtideTable td{padding:9px 10px;border-bottom:1px solid rgba(148,163,184,.1);text-align:left;font-size:11px}.dtideTable th{position:sticky;top:0;background:#111827;color:#aeb8c7;z-index:1}.dtideTable td{color:#d4dbe5}.dtideHeat{background:var(--dtide-heat,transparent);transition:background-color .18s ease}.dtideGearIcon{width:30px;height:30px;border-radius:7px;object-fit:cover;background:#0b1220;flex:none}.dtideSortHead,.dtideMatrixCharacter{border:0;background:transparent;color:inherit;font:inherit;font-weight:700;padding:0;cursor:pointer}.dtideSortHead:hover,.dtideMatrixCharacter:hover{color:#f1d69f}.dtideMatrixCharacter{width:100%;text-align:left}.dtideTable tr:last-child td{border-bottom:0}.dtideRate{font-variant-numeric:tabular-nums;color:#f1d69f;font-weight:800}.dtideChar{display:flex;align-items:center;gap:8px;min-width:130px}.dtideChar img{width:30px;height:30px;border-radius:8px;object-fit:cover;background:#0b1220}.dtideEnlightBar{display:flex;width:72px;height:6px;margin-left:2px;border-radius:99px;overflow:hidden;background:#263244;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);flex:none}.dtideEnlightBar span{height:100%;min-width:1px}
      .dtideRankedItem{display:flex;align-items:center;gap:8px}.dtideRankedItem>.dtideMatrixCharacter{width:auto;min-width:0;flex:1 1 auto}.dtideRankedItem>.dtideEnlightBar{margin-left:auto}.dtideEntityHead{display:flex;align-items:center;justify-content:space-between;gap:12px}.dtideEnlightLegend{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;font-size:9px;font-weight:600;color:#9da8b8}.dtideEnlightLegend span{display:inline-flex;align-items:center;gap:3px;white-space:nowrap}.dtideEnlightLegend i{width:9px;height:5px;border-radius:2px}.dtideRankMark{width:38px;flex:0 0 38px;text-align:center;font-variant-numeric:tabular-nums}.dtideRankMark>b{display:block;color:#dbe3ee;font-size:12px}.dtideRankMark>small{display:block;margin-top:2px;font-size:9px;font-weight:800;white-space:nowrap}.dtideRankUp{color:#36d17c}.dtideRankDown{color:#f15b69}.dtideRankSame{color:#7f8a9c}.dtideRankNew{color:#55b6ff}
      .dtideTable .dtideLegacyDetailRow>td{padding:0;border-bottom:1px solid rgba(148,163,184,.16)}.dtideLegacyDetail{position:relative;isolation:isolate;overflow:hidden;background:#101b2e;border-top:1px solid rgba(145,185,221,.18);color:#eaf2ff}.dtideLegacyDetail::before{content:'';position:absolute;inset:0;background-image:var(--legacy-cg);background-repeat:no-repeat;background-position:82% 24%;background-size:auto 155%;opacity:.32;pointer-events:none}.dtideLegacyDetail::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(10,19,35,.56),rgba(10,19,35,.25) 58%,rgba(10,19,35,.5));pointer-events:none}.dtideLegacyDetail>strong{position:relative;z-index:1;display:block;padding:13px 16px 0;font:700 13px/1.5 system-ui,sans-serif;letter-spacing:.02em;color:#f5f8ff}.dtideLegacyDetail svg{position:relative;z-index:1;display:block;width:100%;height:270px;font-family:system-ui,sans-serif;font-variant-numeric:tabular-nums;overflow:visible}
      .dtideUsageCards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.dtideUsage{padding:10px;border:1px solid rgba(148,163,184,.12);border-radius:11px;background:rgba(255,255,255,.028);display:flex;justify-content:space-between;gap:10px;align-items:center}.dtideUsage b{font-size:12px}.dtideUsage small{display:block;color:#77869a;margin-top:3px}.dtideUsage strong{font-size:15px;color:#e9d0a0;white-space:nowrap}.dtideEnlightItem{border-color:var(--dtide-enlight-color)!important;background:linear-gradient(135deg,var(--dtide-enlight-fill),rgba(10,17,28,.72))!important;box-shadow:inset 4px 0 0 var(--dtide-enlight-color)}.dtideEnlightItem b,.dtideEnlightItem strong{color:#f4f7fb!important}.dtideRatioBar{display:flex;width:86px;height:7px;margin-left:auto;border-radius:99px;overflow:hidden;background:#263244;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);flex:none}.dtideRatioBar span{height:100%;min-width:1px}.dtideFilterPreset{display:flex;gap:6px;flex-wrap:wrap}.dtideFilterChip{display:inline-flex;align-items:center;gap:5px;min-height:36px;padding:6px 10px;border:1px solid #334155;border-radius:10px;background:#111827;color:#cfd7e3;cursor:pointer;font:inherit;font-size:11px}.dtideFilterChip img{width:22px;height:22px;object-fit:contain}.dtideFilterChip.isActive{border-color:#d9b36c;background:rgba(213,177,118,.18);color:#f4ddb3;box-shadow:0 0 0 1px rgba(213,177,118,.15) inset}.dtideMemberAvatar{width:30px;height:30px;border-radius:8px;object-fit:cover;float:left;margin:0 7px 3px 0;background:#0b1220}
      .dtideResults{display:grid;gap:9px}.dtideResult{padding:12px;border:1px solid rgba(148,163,184,.14);border-radius:13px;background:rgba(255,255,255,.025)}.dtideResultHead{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}.dtideResultHead b{font-size:13px}.dtideResultHead a{font-size:11px;color:#d5b176}.dtideMembers{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:9px}.dtideMember{padding:8px;border-radius:9px;background:#111827;min-width:0}.dtideMember b{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}.dtideMember small{display:block;color:#7f8da1;margin-top:3px;font-size:9px;line-height:1.45}.dtideBorrow{color:#d7a85b!important}.dtideGear{color:#b8c4d6!important}.dtideNotice{padding:11px 12px;border-radius:11px;border:1px solid rgba(215,168,91,.25);background:rgba(215,168,91,.07);color:#b9c3d0;font-size:11px;line-height:1.65}.dtideEmpty{padding:22px;text-align:center;color:#7f8da1;font-size:12px}.dtideActions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.dtidePager{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:10px;color:#8290a2;font-size:11px}.dtideGearSummary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px}.dtideGearSummary>div{padding:10px;border:1px solid rgba(148,163,184,.12);border-radius:10px;background:rgba(255,255,255,.02)}.dtideGearSummary small{display:block;color:#77869a;font-size:9px}.dtideGearSummary b{font-size:13px;color:#e8d4ae}.dtideCharacterInsight{display:grid;grid-template-columns:minmax(260px,360px) minmax(0,1fr);gap:16px;margin-top:14px;padding-top:14px;border-top:1px solid rgba(148,163,184,.14)}.dtideCharacterPortrait{grid-row:1 / span 2;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:8px;padding:12px;border:1px solid rgba(148,163,184,.14);border-radius:12px;background:rgba(255,255,255,.025);min-width:0}.dtideCharacterPortraitImage{width:100%;height:470px;display:flex;align-items:center;justify-content:center;border-radius:10px;overflow:hidden;background:linear-gradient(180deg,rgba(13,20,31,.96),rgba(7,11,18,.98));color:#718096;font-size:11px}.dtideCharacterPortraitImage img{width:100%;height:100%;object-fit:contain;object-position:center center;transform:scale(1.04)}.dtideCharacterPortrait>b{font-size:14px;color:#ead7b3;text-align:center}.dtideCharacterPortrait>small{font-size:9px;color:#758398}.dtideCharacterInsightRight{display:grid;grid-template-rows:auto auto;gap:10px;min-width:0}.dtideInsightPanel{padding:11px;border:1px solid rgba(148,163,184,.12);border-radius:11px;background:rgba(255,255,255,.022);min-width:0}.dtideInsightPanel h4{display:flex;align-items:baseline;gap:7px;margin:0 0 9px;font-size:12px;color:#ead7b3}.dtideInsightPanel h4 small{font-size:9px;font-weight:500;color:#77869a}.dtideInsightEnlight{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.dtideInsightEnlightRow{padding:8px;border-radius:9px;background:#111827;min-width:0}.dtideInsightEnlightRow span,.dtideInsightEnlightRow small,.dtideInsightEnlightRow b{display:block}.dtideInsightEnlightRow span{font-size:10px;color:#cfd7e3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dtideInsightEnlightRow small{margin-top:2px;font-size:9px;color:#718096}.dtideInsightEnlightRow b{margin-top:4px;font-size:13px;color:#e9d0a0}.dtideSquadList{display:grid;gap:7px}.dtideSquadRow{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px;border-radius:10px;background:#111827}.dtideSquadRank{font-size:11px;font-weight:800;color:#d5b176;text-align:center}.dtideSquadMembers{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;min-width:0}.dtideSquadMember{display:flex;align-items:center;gap:5px;min-width:0}.dtideSquadMember img{width:28px;height:28px;border-radius:7px;object-fit:cover;background:#0b1220;flex:none}.dtideSquadMember span{font-size:9px;color:#cfd7e3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dtideSquadRate{text-align:right;white-space:nowrap}.dtideSquadRate b,.dtideSquadRate small{display:block}.dtideSquadRate b{font-size:12px;color:#e9d0a0}.dtideSquadRate small{margin-top:2px;font-size:9px;color:#718096}.dtideCompareGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.dtideCoverageWarn{margin-top:10px}.morimensAnnouncement{margin:0 0 12px;padding:12px 15px;border:1px solid rgba(224,189,130,.28);border-left:3px solid #d8b573;border-radius:12px;background:linear-gradient(90deg,rgba(85,62,33,.22),rgba(9,15,24,.55));color:#cfd7e3;font-size:12px;line-height:1.7;box-shadow:0 8px 24px rgba(0,0,0,.18)}.morimensAnnouncement strong{color:#f0d9ad}.announcementTag{display:inline-block;color:#fff3c4;background:#8f3441;border:1px solid #d8b573;border-radius:4px;padding:0 5px;font-weight:900;letter-spacing:.04em}.morimensDemoBadge{position:fixed;right:16px;top:12px;z-index:120;padding:4px 8px;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(7,11,18,.72);backdrop-filter:blur(10px);color:#d9dee8;font-size:9px;letter-spacing:.18em;text-transform:uppercase;box-shadow:0 6px 22px rgba(0,0,0,.24)}
      .dtideInsightEnlightRow{border:1px solid color-mix(in srgb,var(--dtide-enlight-color,#5f6b7a) 68%,transparent);background:color-mix(in srgb,var(--dtide-enlight-color,#5f6b7a) 32%,#111827);box-shadow:inset 3px 0 0 var(--dtide-enlight-color,#5f6b7a)}.dtideInsightEnlightRow span{color:#f4f7fb}.dtideInsightEnlightRow small{color:rgba(244,247,251,.68)}.dtideInsightEnlightRow b{color:#fff3d6}.dtideWikiLink{color:inherit;text-decoration:none}.dtideWikiLink:hover span,.dtideWikiLink:focus-visible span{color:#f1d69f;text-decoration:underline}.dtideCharacterPortraitImage.dtideWikiLink{cursor:pointer;outline:none}.dtideCharacterPortraitImage.dtideWikiLink:hover,.dtideCharacterPortraitImage.dtideWikiLink:focus-visible{box-shadow:0 0 0 2px rgba(217,179,108,.7),0 10px 28px rgba(0,0,0,.32)}
      @media(max-width:900px){.dtideControls,.dtideFilters{grid-template-columns:repeat(2,minmax(0,1fr))}.dtideUsageCards{grid-template-columns:repeat(2,minmax(0,1fr))}.dtideMembers{grid-template-columns:repeat(2,minmax(0,1fr))}.dtideInsightEnlight{grid-template-columns:repeat(2,minmax(0,1fr))}.dtideSquadMembers{grid-template-columns:repeat(2,minmax(0,1fr))}.dtideCompareGrid{grid-template-columns:1fr}}
      @media(max-width:580px){.morimensTabs{position:static}.dtideControls,.dtideFilters,.dtideStatGrid,.dtideUsageCards,.dtideGearSummary,.dtideCharacterInsight{grid-template-columns:1fr}.dtideField.span2{grid-column:auto}.dtideMembers{grid-template-columns:1fr}.dtideCharacterPortrait{grid-row:auto}.dtideCharacterPortraitImage{height:360px}.dtideSquadRow{grid-template-columns:22px minmax(0,1fr)}.dtideSquadRate{grid-column:2;text-align:left;display:flex;gap:6px;align-items:baseline}.dtideSquadMembers{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;document.head.appendChild(s);
  }

  function setupTabs(){
    const main=document.querySelector('main.wrap'),hero=main?.querySelector('.hero'),grid=main?.querySelector('.grid2');if(!main||!hero||!grid||$('morimensTabs'))return;
    const standalone=document.body.dataset.morimensStandalone||'';
    const source=Array.from(main.children).find(x=>x!==hero&&x!==grid&&x.matches?.('section.panel'))||null;
    if(!document.querySelector('.morimensDemoBadge')){const badge=document.createElement('div');badge.className='morimensDemoBadge';badge.textContent='demo';document.body.appendChild(badge)}
    const announcement=document.createElement('div');announcement.className='morimensAnnouncement';announcement.innerHTML='<strong>公告：</strong>目前只有 <b class="announcementTag">融灾榜单</b> 和 <b class="announcementTag">今日签</b> 在维护，其他标签为预留。<br><span>数据来源：<a href="https://eremora.com/" target="_blank" rel="noopener noreferrer">Eremora 网站</a> · <a href="https://docs.qq.com/sheet/DR21KdVB0dUdHWHVK?tab=53z4aa&nlc=1&u=3383c16f84054f918128ef741477e0e5" target="_blank" rel="noopener noreferrer">旧融灾高难出场率在线文档</a></span><br><span>我不是数据的制造者，我只是节奏的搬运工。</span><br><span>没有一无是处的唤醒体，只有恨铁不成钢的守密人。</span>';
    const tabs=document.createElement('nav');tabs.id='morimensTabs';tabs.className='morimensTabs';tabs.setAttribute('role','tablist');tabs.innerHTML='<button class="morimensTab" id="morimensDtideTab" role="tab" aria-selected="true" aria-controls="morimensDtidePanel">融灾榜单</button><button class="morimensTab" id="morimensCalcTab" role="tab" aria-selected="false" aria-controls="morimensCalcPanel">伤害计算器</button><button class="morimensTab" id="morimensFortuneTab" role="tab" aria-selected="false" aria-controls="morimensFortunePanel">每日签</button><button class="morimensTab" id="morimensChangelogTab" role="tab" aria-selected="false" aria-controls="morimensChangelogPanel">更新日志</button><button class="morimensTab" id="morimensAboutTab" role="tab" aria-selected="false" aria-controls="morimensAboutPanel">关于</button>';
    const calc=document.createElement('div');calc.id='morimensCalcPanel';calc.setAttribute('role','tabpanel');calc.appendChild(grid.querySelector('[aria-labelledby="calcTitle"]'));
    const fortune=document.createElement('div');fortune.id='morimensFortunePanel';fortune.setAttribute('role','tabpanel');fortune.hidden=true;fortune.appendChild(grid.querySelector('.fortuneCard'));
    if(standalone==='calc'||standalone==='fortune'){hero.remove();main.querySelector('.topbar')?.remove();grid.remove();if(standalone==='calc'){main.appendChild(calc)}else{main.appendChild(fortune);fortune.hidden=false}return;}
    if(source)calc.appendChild(source);
    const dtide=document.createElement('div');dtide.id='morimensDtidePanel';dtide.setAttribute('role','tabpanel');dtide.innerHTML=panelHtml();
    const changelog=document.createElement('div');changelog.id='morimensChangelogPanel';changelog.setAttribute('role','tabpanel');changelog.hidden=true;changelog.innerHTML=changelogHtml();
    const about=document.createElement('div');about.id='morimensAboutPanel';about.setAttribute('role','tabpanel');about.hidden=true;about.innerHTML=aboutHtml();
    hero.after(announcement,tabs,dtide,calc,fortune,changelog,about);$('morimensBootShell')?.remove();document.body.classList.remove('morimensBooting');dtide.querySelector('.dtideLeaderboardTabs')?.addEventListener('click',e=>{const tab=e.target.closest('[data-dtide-entity]');if(!tab)return;const field=$('dtideEntityType'),entity=tab.dataset.dtideEntity;if(!field||field.value===entity)return;dtide.querySelectorAll('[data-dtide-entity]').forEach(x=>x.setAttribute('aria-selected',String(x===tab)));field.value=entity;window.__dtideMatrixSort='total';window.__dtideMatrixAsc=false;const title=$('dtideMatrixTitle'),host=$('dtideMatrix'),label=entity==='wheel'?'命轮':entity==='creation'?'造物':'角色';if(title)title.textContent=label+'逐波出场率';if(host)host.setAttribute('aria-busy','true');requestAnimationFrame(()=>field.dispatchEvent(new Event('change',{bubbles:true})))});
    const activate=name=>{const isD=name==='dtide',isC=name==='calc',isF=name==='fortune',isL=name==='changelog',isA=name==='about';for(const [id,on] of [['morimensDtideTab',isD],['morimensCalcTab',isC],['morimensFortuneTab',isF],['morimensChangelogTab',isL],['morimensAboutTab',isA]])$(id).setAttribute('aria-selected',String(on));dtide.hidden=!isD;calc.hidden=!isC;fortune.hidden=!isF;changelog.hidden=!isL;about.hidden=!isA;history.replaceState(null,'',`#${name}`);if(isD)loadOnce()};
    $('morimensDtideTab').addEventListener('click',()=>activate('dtide'));$('morimensCalcTab').addEventListener('click',()=>activate('calc'));$('morimensFortuneTab').addEventListener('click',()=>activate('fortune'));$('morimensChangelogTab').addEventListener('click',()=>activate('changelog'));$('morimensAboutTab').addEventListener('click',()=>activate('about'));activate(['#calc','#fortune','#changelog','#about'].includes(location.hash)?location.hash.slice(1):'dtide');
  }

  function changelogHtml(){return `
    <section class="panel" aria-labelledby="morimensChangelogTitle">
      <div class="panelHead"><div><p class="eyebrow">CHANGELOG</p><h2 id="morimensChangelogTitle">更新日志</h2><p class="panelLead">记录忘忘看报的重要功能与重大更新。</p></div><span class="statusPill">持续更新</span></div>
      <div class="sourceList">
        <div class="sourceItem"><strong>2026-09-18 · 搜索与国际化</strong><br>搜索配队的角色选择改为支持桌面端和移动端的头像多选；新增波次筛选；实装整页中英文切换；新增更新日志标签。</div>
        <div class="sourceItem"><strong>2026-09-18 · 榜单体验</strong><br>恢复旧版稳定页面；增加界域与唤醒体类型筛选、命轮叠位比例条、角色详细启灵颜色、固定范围助战率热力图，并优化多次切换后的缓存与渲染。</div>
        <div class="sourceItem"><strong>2026-09-17 · 数据与详情</strong><br>接入多期融灾数据，提供角色、命轮、造物逐波出场率；角色可展开查看启灵、常用队伍、命轮与密契；角色立绘、命轮和造物可跳转中文维基。</div>
        <div class="sourceItem"><strong>当前已有功能</strong><br>融灾榜单范围、难度与精确分数筛选；角色界域和类型筛选；角色、命轮、造物榜单；逐波出场率与助战率热力图；启灵及命轮叠位比例；配队搜索与包含/排除角色、波次、等级、启灵、助战、命轮、密契、评分和排名筛选；伤害计算器与每日签。</div>
      </div>
    </section>
  `}

  function aboutHtml(){return `
    <section class="panel" aria-labelledby="morimensAboutTitle">
      <div class="panelHead"><div><p class="eyebrow">ABOUT · CREDITS</p><h2 id="morimensAboutTitle">关于忘忘看报</h2><p class="panelLead">本工具箱为《忘却前夜》玩家制作的粉丝向项目，免费使用，不进行任何商业化运营。</p></div><span class="statusPill">非官方 · 非商业</span></div>
      <div class="sourceList">
        <div class="sourceItem"><strong>数据与资料来源</strong><br>感谢 <a href="https://eremora.com/leaderboard/abyss" target="_blank" rel="noopener noreferrer">Eremora</a> 提供融灾榜单与挑战记录；感谢 <a href="https://github.com/dansa/SKeyDB" target="_blank" rel="noopener noreferrer">dansa/SKeyDB</a> 提供角色、技能、命轮及密契等结构化数据；感谢 <a href="https://morimens.huijiwiki.com/" target="_blank" rel="noopener noreferrer">忘却前夜中文维基</a> 提供中文名称、资料与文本参考。</div>
        <div class="sourceItem"><strong>特别说明</strong><br>本页面不是官方产品，与游戏官方及上述数据网站不存在隶属或商业合作关系。《忘却前夜》相关角色、图片、文本及其他素材版权归各自权利方所有；本站仅用于玩家交流与资料查询。</div>
        <div class="sourceItem"><strong>GitHub · 半成品 MMA 工具</strong><br>如果有大佬愿意继续做，可以提供一点微不足道的帮助：<a href="https://github.com/Z769018860/MMA-5771" target="_blank" rel="noopener noreferrer">MMA-5771</a></div><div class="sourceItem"><strong>制作者</strong><br>B站：<a href="https://space.bilibili.com/95687310?spm_id_from=333.1007.0.0" target="_blank" rel="noopener noreferrer">@青灯不弈</a></div>
      </div>
    </section>
  `}

  function panelHtml(){return `
    <section class="panel" aria-labelledby="dtideTitle">
      <div class="dtideHero"><div><p class="eyebrow">EREMORA · D-ZONE ANALYTICS</p><h2 id="dtideTitle">融灾榜单</h2><p class="panelLead">更新时间节点：9月17日 23:00</p></div><span class="statusPill" id="dtideStatus">等待数据</span></div>
      <div class="dtideControls">
        <div class="dtideField"><label>期次</label><select id="dtideSeason"></select></div>
        <div class="dtideField"><label>榜单范围</label><select id="dtideRankScope"><option value="all" selected>全部范围（含未知排名）</option>${rankCaps.map(x=>`<option value="${x}">Top ${x}</option>`).join('')}</select></div>
        <div class="dtideField"><label>难度</label><select id="dtideDifficulty"><option value="all">全部难度</option>${difficultyOrder.map(x=>`<option value="${x}">${difficultyZh[x]}</option>`).join('')}</select></div>
        <div class="dtideField"><label>融灾总得分</label><select id="dtideTotalScore"><option value="all">全部分数</option><option value="520:525">520–525 分</option><option value="510:519">510–519 分</option><option value="500:509">500–509 分</option><option value="490:499">490–499 分</option><option value="480:489">480–489 分</option><option value="470:479">470–479 分</option><option value="460:469">460–469 分</option><option value="450:459">450–459 分</option><option value="440:449">440–449 分</option><option value="430:439">430–439 分</option><option value="420:429">420–429 分</option><option value="410:419">410–419 分</option><option value="400:409">400–409 分</option><option value="390:399">390–399 分</option><option value="380:389">380–389 分</option><option value="370:379">370–379 分</option><option value="360:369">360–369 分</option><option value="350:359">350–359 分</option></select></div><input id="dtideWave" type="hidden" value="all"><input id="dtideEntityType" type="hidden" value="character">
        <div class="dtideField span2"><label>界域</label><div class="dtideFilterPreset" id="dtideRealmFilters">${realmOrder.map(x=>`<button type="button" class="dtideFilterChip" data-realm="${x}"><img src="${realmIconSrc(x)}" alt="">${realmZh[x]}</button>`).join('')}</div></div>
        <div class="dtideField span2"><label>唤醒体类型</label><div class="dtideFilterPreset" id="dtideRoleFilters">${roleOrder.map(x=>`<button type="button" class="dtideFilterChip" data-role="${x}">${roleZh[x]}</button>`).join('')}</div></div><input id="dtideWave" type="hidden" value="all"><input id="dtideEntityType" type="hidden" value="character">
        <input id="dtideClearType" type="hidden" value="all">
        <input id="dtideRateMode" type="hidden" value="team">
      </div>
      <div class="dtideStatGrid" id="dtideSummary"></div>
      <div id="dtideCoverageWarn" class="dtideCoverageWarn"></div>
      <div class="dtideSection"><div class="dtideEntityHead"><h3 id="dtideMatrixTitle">角色逐波出场率</h3><div class="dtideEnlightLegend" id="dtideRatioLegend" aria-label="启灵颜色图例">${enlightOrder.map(key=>`<span><i style="background:${enlightColors[key]}"></i>${enlightZh[key]}</span>`).join('')}</div></div><div class="dtideLeaderboardTabs" role="tablist" aria-label="出场率榜单类型"><button type="button" class="dtideLeaderboardTab" data-dtide-entity="character" role="tab" aria-selected="true">角色榜单</button><button type="button" class="dtideLeaderboardTab" data-dtide-entity="wheel" role="tab" aria-selected="false">命轮榜单</button><button type="button" class="dtideLeaderboardTab" data-dtide-entity="creation" role="tab" aria-selected="false">造物榜单</button><label class="dtideCreationFilter"><input type="checkbox" id="dtideCreationFilter"> 筛选造物</label></div><div class="dtideScroll" id="dtideMatrix"></div></div>
    </section>
    <section class="panel">
      <div class="panelHead"><div><h2>搜索配队</h2><p class="panelLead">筛选条件作用于公开的融灾队伍记录；选择角色后可进一步查看其常用队友、命轮与密契。</p></div><span class="statusPill" id="dtideFilterCoverage">字段覆盖检查中</span></div>
      <div class="dtideFilters" style="margin-top:15px">
        <div class="dtideField span2"><label>包含角色（可多选）</label><div class="dtideCharacterPicker" id="dtideCharacters" role="group" aria-label="包含角色"></div><small>直接点击头像即可勾选多个角色；再次点击可取消。</small></div>
        <div class="dtideField"><label>角色匹配方式</label><select id="dtideCharacterMode"><option value="all">包含全部所选角色</option><option value="any">包含任一所选角色</option></select></div>
        <div class="dtideField"><label>排除角色（可多选）</label><div class="dtideCharacterPicker" id="dtideExcludeCharacters" role="group" aria-label="排除角色"></div></div>
        <div class="dtideField"><label>波次</label><select id="dtideSearchWave"><option value="all">全部波次</option></select></div>
        <div class="dtideField"><label>最低角色等级</label><input id="dtideLevelMin" type="number" min="1" placeholder="不限"></div>
        <div class="dtideField"><label>最高角色等级</label><input id="dtideLevelMax" type="number" min="1" placeholder="不限"></div>
        <div class="dtideField"><label>启灵分组</label><select id="dtideProgression"><option value="">不限</option>${enlightOrder.map(x=>`<option value="${x}">${enlightZh[x]}</option>`).join('')}</select></div>
        <div class="dtideField"><label>借用助战</label><select id="dtideBorrowed"><option value="">不限</option><option value="yes">队伍包含助战</option><option value="no">队伍不含助战</option></select></div>
        <div class="dtideField"><label>命轮</label><select id="dtideWheel"><option value="">不限</option></select></div>
        <div class="dtideField"><label>密契套装</label><select id="dtideCovenant"><option value="">不限</option></select></div>
        <div class="dtideField"><label>最低密契评分</label><input id="dtideCovenantScoreMin" type="number" min="0" placeholder="不限"></div>
        <div class="dtideField"><label>最高密契评分</label><input id="dtideCovenantScoreMax" type="number" min="0" placeholder="不限"></div>
        <div class="dtideField"><label>最低榜单分</label><input id="dtideScoreMin" type="number" min="0" placeholder="不限"></div>
        <div class="dtideField"><label>最高榜单排名</label><input id="dtideRankMax" type="number" min="1" max="1000" placeholder="例如 200"></div>
      </div>
      <div class="dtideActions"><button class="primaryBtn" id="dtideSearch" type="button">搜索配队</button><button class="ghostBtn" id="dtideReset" type="button">清空筛选</button></div>
      <div class="dtideSection"><div class="dtideResults" id="dtideResults"></div><div class="dtidePager" id="dtidePager"></div></div>
    </section>
  `}

  async function waitMorimensData(){if(window.MorimensData?.db?.records&&window.MorimensData?.identityDb?.bySkeydbId)return;await new Promise(resolve=>{const t=setTimeout(resolve,5000);window.addEventListener('morimens-data-ready',()=>{clearTimeout(t);resolve()},{once:true})})}
  function displayCharacterName(...values){return values.find(value=>{const name=String(value||'').trim();return name&&!/^(awakener(?:-\d+)?|unknown|角色|唤醒体)$/i.test(name)})||'未知'}
  function characterInfo(key,fallback={}){
    const data=window.MorimensData,liveRecords=data?.db?.records||[];
    const rec=liveRecords.find(x=>x.id===key||x.ingameId===key||x.ingameId===fallback.ingameId)||awakenerMap.get(key)||Array.from(awakenerMap.values()).find(x=>x.ingameId===key)||null;
    const id=rec?.id||fallback.skeydbId||(/^awakener-\d+$/i.test(String(key||''))?key:null),identity=data?.identityDb?.bySkeydbId?.[id]||data?.zhDb?.bySkeydbId?.[id],loc=rec&&data?.localizedProfile?.(rec);
    const portrait=rec&&data?.assetFor?.(rec,'portrait'),card=rec&&data?.assetFor?.(rec,'card');
    return {name:displayCharacterName(identity?.name,loc?.name,fallback.canonicalName,fallback.name,rec?.name),image:portrait||localAsset(rec?.assets?.portrait||fallback.image||'','portrait'),art:card||portrait||localAsset(rec?.assets?.card||rec?.assets?.portrait||fallback.image||'','portrait'),id:id||key,ingameId:rec?.ingameId||fallback.ingameId};
  }
  function wheelName(item){return window.MorimensData?.localizedEntity?.('wheel',item)?.name||item?.name||item?.id||'未知命轮'}
  const memberKey=m=>m.skeydbId||m.ingameId||m.id||m.name;
  function difficultyOf(team,wave){const raw=String(team?.difficulty||team?.stageName||wave?.difficulty||wave?.stageName||'').toLowerCase();for(const d of difficultyOrder)if(new RegExp(`(?:^|[^a-z])${d}(?:$|[^a-z])`,'i').test(raw))return d;return 'unknown'}
  function enlightClass(m){const ms=String(m?.enlightenMilestone||m?.enlightTier||m?.progression||'').toUpperCase();if(['E0','E1','E2'].includes(ms))return 'e0_2';if(ms==='E3')return 'e3_plus3';if(ms==='OE'||ms==='OVERLIMIT')return 'plus4_11';if(ms==='AA'||ms==='LAW12')return 'plus12';return 'unknown'}
  function wheelStackClass(w){const level=Number(w?.level);if(!Number.isFinite(level)||level<=2)return 'stack0_2';if(level>=15)return 'stack12';return 'stack3_11'}
  function maxRankAvailable(){const rs=rankByUid.size?[...rankByUid.values()]:(season?.records||[]).map(rankOf).filter(Number.isFinite);return rs.length?Math.max(...rs):(season?.recordCount||season?.records?.length||0)}
  function getSelectedValues(id){return Array.from($(id)?.querySelectorAll('.dtideCharacterChoice.isSelected')||[]).map(x=>x.dataset.characterKey).filter(Boolean)}
  function flattenTeams(){
    if(flatTeamsCache)return flatTeamsCache;
    const unique=new Map();
    const richness=t=>(t.token?8:0)+(t.creations?.length||0)*3+(t.members||[]).reduce((sum,m)=>sum+(m.wheels?.length||m.weapons?.length||0)*4+(m.covenants?.length||m.suits?.length||(m.covenant?1:0))*4+(m.covenantScore!=null?2:0)+(m.level!=null?1:0)+(m.enlightenment?.length||0),0);
    for(const record of season?.records||[]){const mappedRank=rankOf(record),normalized=mappedRank!=null&&record.rank!==mappedRank?{...record,rank:mappedRank}:record;for(const wave of normalized.waves||[])for(const team of wave.teams||[]){
      const difficulty=difficultyOf(team,wave),members=(team.members||[]).map(m=>String(m.ingameId||m.skeydbId||m.id||m.canonicalName||m.name||'')).filter(Boolean).sort().join(',');
      const key=[normalized.uid||normalized.rank||'',wave.wave||'',team.clearType||'',difficulty,members].join('|'),row={record:normalized,wave,team,difficulty},old=unique.get(key);
      if(!old||richness(team)>richness(old.team))unique.set(key,row);
    }}
    flatTeamsCache=[...unique.values()];
    return flatTeamsCache;
  }
  function activeAwakenerMembers(team){
    const realms=[...document.querySelectorAll('#dtideRealmFilters .dtideFilterChip.isActive')].map(b=>String(b.dataset.realm));
    const roles=[...document.querySelectorAll('#dtideRoleFilters .dtideFilterChip.isActive')].map(b=>String(b.dataset.role));
    const members=team?.members||[];
    return members.filter(m=>(!realms.length||realms.includes(String(m.realm)))&&(!roles.length||roles.includes(String(m.role))));
  }
  function scopedRows({wave='all',ct=$('dtideClearType')?.value||'all',difficulty=$('dtideDifficulty')?.value||'all',rankCap=selectedRankCap()}={}){return flattenTeams().map(x=>{
    const filteredMembers=activeAwakenerMembers(x.team);return filteredMembers.length===x.team.members?.length?x:{...x,team:{...x.team,members:filteredMembers}};
  }).filter(x=>{
    if(!rankMatches(x.record,rankCap))return false;
    if(wave!=='all'&&Number(wave)!==Number(x.wave.wave))return false;
    if(ct!=='all'&&ct!==x.team.clearType)return false;
    if(difficulty!=='all'&&difficulty!==x.difficulty)return false;
    if(!(x.team.members||[]).length)return false;
    if(!scoreMatches(x.record))return false;
    return true;
  })}
  function analysisKey(){
    const realms=[...document.querySelectorAll('#dtideRealmFilters .dtideFilterChip.isActive')].map(x=>x.dataset.realm).sort(),roles=[...document.querySelectorAll('#dtideRoleFilters .dtideFilterChip.isActive')].map(x=>x.dataset.role).sort();
    return [season?.seasonId,$('dtideRankScope')?.value,$('dtideDifficulty')?.value,$('dtideTotalScore')?.value,$('dtideClearType')?.value,realms.join(','),roles.join(',')].join('|');
  }
  function countRate(map,key,meta={}){if(key==null||key==='')return;const k=String(key),x=map.get(k)||{key:k,count:0,...meta};x.count++;map.set(k,x)}
  function computeGroup(rows){
    const chars=new Map(),wheels=new Map(),covs=new Map(),byChar=new Map(),enlight=new Map();let memberSlots=0,wheelSlots=0,covenantSlots=0;
    for(const {team} of rows){const seenC=new Set(),seenW=new Set(),seenS=new Set();for(const m of team.members||[]){memberSlots++;const ck=String(memberKey(m)),ec=enlightClass(m);countRate(enlight,ec,{name:enlightZh[ec]});if(!seenC.has(ck)){seenC.add(ck);countRate(chars,ck,{id:m.skeydbId||null,ingameId:m.ingameId||null,name:characterInfo(ck,m).name,image:m.image||null,borrowedCount:0});const cv=chars.get(ck);if(!cv.image&&m.image)cv.image=m.image;if(m.borrowed)cv.borrowedCount=(cv.borrowedCount||0)+1}let bc=byChar.get(ck);if(!bc){bc={key:ck,id:m.skeydbId||null,ingameId:m.ingameId||null,name:characterInfo(ck,m).name,image:m.image||null,appearances:0,levels:[],enlight:new Map(),wheels:new Map(),covs:new Map()};byChar.set(ck,bc)}else if(!bc.image&&m.image)bc.image=m.image;bc.appearances++;if(m.level!=null)bc.levels.push(Number(m.level));countRate(bc.enlight,ec,{name:enlightZh[ec]});for(const w of m.wheels||[]){wheelSlots++;const wk=w.id??w.name;if(wk==null)continue;const wheelKey=String(wk);if(!seenW.has(wheelKey)){seenW.add(wheelKey);countRate(wheels,wheelKey,{id:w.id??null,name:wheelName(w),image:w.image||null,stacks:new Map()});const wheel=wheels.get(wheelKey),stackKey=wheelStackClass(w);if(!wheel.image&&w.image)wheel.image=w.image;countRate(wheel.stacks,stackKey,{name:wheelStackZh[stackKey]})}countRate(bc.wheels,wk,{id:w.id??null,name:wheelName(w),image:w.image||null})}for(const c of m.covenants||((m.covenant)?[m.covenant]:[])){covenantSlots++;const sk=c.id??c.name;if(sk==null)continue;if(!seenS.has(String(sk))){seenS.add(String(sk));countRate(covs,sk,{id:c.id??null,name:c.name||sk,image:c.image||null})}countRate(bc.covs,sk,{id:c.id??null,name:c.name||sk,image:c.image||null})}}}
    const teamCount=rows.length,finish=map=>[...map.values()].map(x=>({...x,teamRatePct:teamCount?x.count/teamCount*100:0,assistRatePct:x.count?(Number(x.borrowedCount||0)/x.count*100):0})).sort((a,b)=>b.count-a.count);
    const teammateCounts=new Map();for(const {team} of rows){const keys=[...new Set((team.members||[]).map(memberKey))];for(const a of keys)for(const b of keys)if(a&&b&&a!==b){const m=teammateCounts.get(a)||new Map();m.set(b,(m.get(b)||0)+1);teammateCounts.set(a,m)}}
    const byCharacter=byChar;
    const bc=[...byCharacter.values()].map(x=>({...x,level:{min:x.levels.length?Math.min(...x.levels):null,max:x.levels.length?Math.max(...x.levels):null,avg:x.levels.length?x.levels.reduce((a,b)=>a+b,0)/x.levels.length:null},teammates:[...(teammateCounts.get(x.key)||new Map())].map(([key,count])=>({key,count,ratePct:x.appearances?count/x.appearances*100:0,name:characterInfo(key).name})).sort((a,b)=>b.count-a.count),enlight:[...x.enlight.values()].map(v=>({...v,ratePct:x.appearances?v.count/x.appearances*100:0})).sort((a,b)=>b.count-a.count),wheels:[...x.wheels.values()].map(v=>({...v,ratePct:x.appearances?v.count/x.appearances*100:0})).sort((a,b)=>b.count-a.count),covenants:[...x.covs.values()].map(v=>({...v,ratePct:x.appearances?v.count/x.appearances*100:0})).sort((a,b)=>b.count-a.count)})).sort((a,b)=>b.appearances-a.appearances);
    const wheelRows=finish(wheels).map(w=>({...w,stacks:[...(w.stacks||new Map()).values()].map(x=>({...x,ratePct:w.count?x.count/w.count*100:0}))}));
    return {teamCount,memberSlots,wheelSlots,covenantSlots,characters:finish(chars),wheels:wheelRows,covenants:finish(covs),enlight:finish(enlight),byCharacter:bc};
  }
  function currentAnalysis(){
    const key=analysisKey();if(analysisCache?.key===key)return analysisCache;
    const rows=scopedRows(),waves=[...new Set(rows.map(x=>Number(x.wave.wave)).filter(Number.isFinite))].sort((a,b)=>a-b),groups=new Map(waves.map(w=>[w,computeGroup(rows.filter(x=>Number(x.wave.wave)===w))])),group=computeGroup(rows);
    analysisCache={key,rows,waves,groups,group};return analysisCache;
  }
  function currentGroup(overrides={}){return Object.keys(overrides).length?computeGroup(scopedRows(overrides)):currentAnalysis().group}
  function fullSeasonAssistHeatMax(){
    const counts=new Map();
    for(const {team} of flattenTeams())for(const m of team.members||[]){const key=String(memberKey(m));if(!key)continue;const x=counts.get(key)||{count:0,borrowed:0};x.count++;if(m.borrowed)x.borrowed++;counts.set(key,x)}
    return Math.max(0,...[...counts.values()].map(x=>x.count?x.borrowed/x.count*100:0));
  }

  function renderCoverage(){
    const cap=selectedRankCap(),max=maxRankAvailable(),box=$('dtideCoverageWarn');
    if(!cap)box.innerHTML='<div class="dtideNotice">当前为 <b>全部范围</b>，统计所有已下载用户，并包含暂时无法匹配榜单名次的用户。</div>';
    else{const complete=max>=cap;box.innerHTML=complete?'':`<div class="dtideNotice">当前快照实际抓取到的最高榜单名次为 <b>#${esc(max||'—')}</b>。Top ${cap} 统计目前属于不完整样本。</div>`}
    for(const opt of $('dtideRankScope').options){if(opt.value==='all'||opt.value==='0'){opt.textContent='全部范围（含未知排名）';continue}const n=Number(opt.value),ok=max>=n;opt.textContent=`Top ${n}${ok?'':' · 当前样本不足'}`}
  }
  function renderSummary(){const g=currentGroup(),coverage=manifest.fieldCoverage||{},cap=selectedRankCap(),max=maxRankAvailable();$('dtideSummary').innerHTML=[['榜单样本',`${season.recordCount} 条 / 最深 #${max||'—'}`],['当前范围',rankScopeLabel(cap)],['统计队伍',g.teamCount],['角色槽位',g.memberSlots]].map(([a,b])=>`<div class="dtideStat"><small>${a}</small><strong>${esc(b)}</strong></div>`).join('');$('dtideStatus').textContent=`第 ${season.seasonId} 期 · ${difficultyZh[$('dtideDifficulty').value]||'全部难度'} · ${rankScopeLabel(cap)}`;$('dtideFilterCoverage').textContent=`等级 ✓ · 启灵 ${coverage.enlightenLevel?'✓':'—'} · 命轮 ${coverage.wheels?'✓':'—'} · 密契 ${coverage.covenants?'✓':'—'}`;renderCoverage()}

const dtideHeatStyle=(rate,max=0)=>{const safeMax=Math.max(Number(max)||0,Number.EPSILON),t=Math.max(0,Math.min(1,Number(rate||0)/safeMax)),h=Math.round(215-215*t),a=(.52*t).toFixed(2);return `--dtide-heat:hsla(${h},78%,46%,${a})`};
function sortUsageRows(a,b,groups,waves){const spec=$('dtideSort')?.value||'total-desc';const m=spec.match(/^wave(\d+)-(asc|desc)$/);let av=a.total||a.count||0,bv=b.total||b.count||0;if(m){const w=Number(m[1]),g=groups?.get(w),find=x=>g?.characters?.find(y=>y.key===x.key)?.count||0;av=find(a);bv=find(b)}const d=bv-av;return spec.endsWith('-asc')?-d:d||String(a.name||a.key).localeCompare(String(b.name||b.key),'zh-CN')}
  function renderLegacyMatrix(){
    const host=$('dtideMatrix'),legacy=season?.legacyRates;if(!host||!legacy)return false;
    const rows=legacy.flatMap((period,index)=>Object.entries(period.rates||{}).map(([name,rate])=>({name,rate:Number(rate)||0,wave:index+1,label:period.label}))),max=Math.max(...rows.map(x=>x.rate),0),names=[...new Set(rows.map(x=>x.name))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
    const periodDisplay=[['4.13-4.26','混沌'],['4.27-5.10','超维'],['5.11-5.24','深海'],['5.25-6.7','血肉'],['6.7-6.21','超维'],['6.22-7.5','深海'],['7.6-7.19','血肉'],['7.20-8.2','混沌'],['7.3-8.16','深海']];
    const periods=legacy.map((x,i)=>({wave:i+1,label:x.label,date:periodDisplay[i]?.[0]||x.label,realm:periodDisplay[i]?.[1]||''}));
    const cell=(name,w)=>rows.find(x=>x.name===name&&x.wave===w)?.rate||0;
    const sortKey=window.__legacyMatrixSort||'avg',ascending=Boolean(window.__legacyMatrixAscending),value=(name,key)=>key==='avg'?periods.reduce((sum,p)=>sum+cell(name,p.wave),0)/(periods.length||1):cell(name,Number(key));
    names.sort((a,b)=>{const d=value(a,sortKey)-value(b,sortKey);return (ascending?d:-d)||a.localeCompare(b,'zh-CN')});
    const realmColor={混沌:'#e7b65c',超维:'#b98cff',深海:'#5cb8ff',血肉:'#ff7180'},rate=v=>Number.isFinite(Number(v))?`${(Number(v)*100).toFixed(2)}%`:'—',arrow=key=>sortKey===key?(ascending?' ↑':' ↓'):' ↕',head=(label,key)=>`<button type="button" class="dtideSortHead" data-legacy-sort="${key}" title="点击切换升降序">${label}${arrow(key)}</button>`;
    const ranks=new Map(periods.map((p,i)=>{const order=Object.entries(legacy[i]?.rates||{}).sort((a,b)=>Number(b[1])-Number(a[1]));return [p.wave,new Map(order.map((x,index)=>[x[0],index+1]))]}));
    const drawChart=(detail,name,table)=>{
      const svg=detail.querySelector('svg'),bounds=svg.getBoundingClientRect(),headers=[...table.querySelectorAll('thead th')].slice(1,periods.length+1);
      if(!bounds.width||headers.length!==periods.length)return;
      const width=bounds.width,height=270,top=28,bottom=222;
      const xs=headers.map(th=>{const rect=th.getBoundingClientRect();return rect.left+rect.width/2-bounds.left});
      const y=rank=>top+(rank-1)*(bottom-top)/59;
      const values=periods.map(period=>ranks.get(period.wave)?.get(name)??60);
      const axis=Math.max(25,xs[0]-headers[0].getBoundingClientRect().width/2+20);
      const grid=[1,10,20,30,40,50,60];
      svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
      svg.innerHTML=`${grid.map(rank=>`<line x1="${axis}" y1="${y(rank)}" x2="${xs.at(-1)}" y2="${y(rank)}" stroke="rgba(166,193,224,.19)" stroke-dasharray="4 5"/><text x="${axis-8}" y="${y(rank)+4}" fill="#b6c9df" font-size="11" text-anchor="end">${rank}</text>`).join('')}
        ${xs.map(x=>`<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" stroke="rgba(166,193,224,.11)"/>`).join('')}
        <line x1="${axis}" y1="${top}" x2="${axis}" y2="${bottom}" stroke="#91aac8" stroke-width="1.5"/>
        <text x="${axis}" y="${top-10}" fill="#d2e4f8" font-size="12" font-weight="700" text-anchor="middle">排名</text>
        <polyline fill="none" stroke="#91d2fa" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${values.map((rank,i)=>`${xs[i]},${y(rank)}`).join(' ')}"/>
        ${values.map((rank,i)=>`<circle cx="${xs[i]}" cy="${y(rank)}" r="5" fill="${realmColor[periods[i].realm]||'#8fd3ff'}" stroke="#e8f5ff" stroke-width="1.5"><title>${esc(periods[i].date)}【${esc(periods[i].realm)}】：第 ${rank} 名 · ${rate(cell(name,periods[i].wave))}</title></circle><text x="${xs[i]}" y="${Math.max(17,y(rank)-11)}" fill="#f2f7ff" font-size="12" font-weight="700" text-anchor="middle">${rank}</text><text x="${xs[i]}" y="${height-16}" fill="${realmColor[periods[i].realm]||'#c8d8ec'}" font-size="11" font-weight="600" text-anchor="middle">${esc(periods[i].date)}</text>`).join('')}`;
    };
    host.innerHTML=`<table class="dtideTable"><thead><tr><th>角色</th>${periods.map(x=>`<th>${head(`<strong>${esc(x.date)}</strong><br><small style="color:${realmColor[x.realm]||'#fff'};font-weight:800">【${esc(x.realm)}】</small>`,x.wave)}</th>`).join('')}<th>${head('平均出场率','avg')}</th></tr></thead><tbody>${names.map(name=>{const info=characterInfo(name,{name,skeydbId:season.characterMap?.[name]?.skeydbId,image:season.characterMap?.[name]?.image});const vals=periods.map(x=>cell(name,x.wave)),avg=vals.reduce((a,b)=>a+b,0)/(vals.length||1);return `<tr data-legacy-character="${esc(name)}"><td><div class="dtideRankedItem"><span class="dtideChar">${info.image?`<img src="${esc(info.image)}" alt="" loading="lazy">`:''}<span>${esc(info.name||name)}</span></span></div></td>${vals.map(v=>`<td class="dtideRate dtideHeat" style="${dtideHeatStyle(v,max)};color:#fff;font-weight:800">${rate(v)}</td>`).join('')}<td class="dtideRate" style="color:#fff;font-weight:800">${rate(avg)}</td></tr>`}).join('')}</tbody></table>`;
    host.onclick=e=>{
      const button=e.target.closest('[data-legacy-sort]');
      if(button){const key=button.dataset.legacySort;if(window.__legacyMatrixSort===key)window.__legacyMatrixAscending=!window.__legacyMatrixAscending;else{window.__legacyMatrixSort=key;window.__legacyMatrixAscending=false}return renderLegacyMatrix()}
      const row=e.target.closest('[data-legacy-character]');if(!row)return;
      const old=row.nextElementSibling;if(old?.classList.contains('dtideLegacyDetailRow'))return old.remove();
      const name=row.dataset.legacyCharacter,detail=document.createElement('tr');
      detail.className='dtideLegacyDetailRow';
      detail.innerHTML=`<td colspan="${periods.length+2}"><div class="dtideLegacyDetail"><strong>${esc(name)} · 各期出场率排名变化</strong><svg role="img" aria-label="${esc(name)}各期排名折线图"></svg></div></td>`;
      row.after(detail);
      const portrait=season.characterMap?.[name]?.image||'';
      if(/^assets\/morimens\/portraits\/[a-z0-9-]+\.webp$/.test(portrait))detail.querySelector('.dtideLegacyDetail').style.setProperty('--legacy-cg',`url("${portrait.replace('/portraits/','/cards/')}")`);
      drawChart(detail,name,row.closest('table'));
    };
    if(host.__legacyResizeHandler)window.removeEventListener('resize',host.__legacyResizeHandler);
    host.__legacyResizeHandler=()=>{const table=host.querySelector('table');if(!table)return;for(const detail of table.querySelectorAll('.dtideLegacyDetailRow'))drawChart(detail,detail.previousElementSibling?.dataset.legacyCharacter,table)};
    window.addEventListener('resize',host.__legacyResizeHandler);
    if($('dtideMatrixTitle'))$('dtideMatrixTitle').textContent='角色逐期高难出场率';
    if($('dtideStatus'))$('dtideStatus').textContent='旧版融灾高难出场率（来源：@却尘）';
    if($('dtideSummary'))$('dtideSummary').innerHTML=[['数据来源','却尘'],['统计角色',names.length],['统计期次',periods.length],['指标','高难出场率']].map(([a,b])=>`<div class="dtideStat"><small>${a}</small><strong>${esc(b)}</strong></div>`).join('');
    if($('dtideCoverageWarn'))$('dtideCoverageWarn').innerHTML=`<div class="dtideNotice">旧版融灾高难出场率数据来源：<a href="${esc(season.sourceUrl)}" target="_blank" rel="noopener noreferrer">在线文档</a>。</div>`;
    return true;
  }
  function renderMatrix(){
    if(season?.legacy&&renderLegacyMatrix())return;
    const cap=selectedRankCap(),difficulty=$('dtideDifficulty')?.value||'all',ct=$('dtideClearType')?.value||'all',mode=$('dtideRateMode')?.value||'team',entity=$('dtideEntityType')?.value||'character';
    const analysis=currentAnalysis(),all=analysis.rows,waves=analysis.waves,groups=analysis.groups,host=$('dtideMatrix');if(!host)return;
    const legend=$('dtideRatioLegend');
    if(legend){if(entity==='creation'){legend.innerHTML='';legend.removeAttribute('aria-label')}else{const order=entity==='wheel'?wheelStackOrder:enlightOrder,labels=entity==='wheel'?wheelStackZh:enlightZh,colors=entity==='wheel'?wheelStackColors:enlightColors;legend.innerHTML=order.map(key=>`<span><i style="background:${colors[key]}"></i>${labels[key]}</span>`).join('');legend.setAttribute('aria-label',entity==='wheel'?'命轮叠位颜色图例':'启灵颜色图例')}}
    if(entity==='wheel'){
      const union=new Map();for(const [,g] of groups)for(const wheel of g.wheels||[]){const old=union.get(wheel.key);union.set(wheel.key,old?{...old,...wheel,image:wheel.image||old.image}:{...wheel})}
      const rows=[...union.values()].map(wheel=>{const stackCounts=new Map();for(const [,g] of groups){const hit=(g.wheels||[]).find(x=>x.key===wheel.key);for(const stack of hit?.stacks||[])stackCounts.set(stack.key,(stackCounts.get(stack.key)||0)+Number(stack.count||0))}return {...wheel,total:waves.reduce((sum,w)=>sum+((groups.get(w)?.wheels||[]).find(x=>x.key===wheel.key)?.count||0),0),stacks:wheelStackOrder.map(key=>({key,name:wheelStackZh[key],count:stackCounts.get(key)||0}))}});
      const sortKey=window.__dtideMatrixSort||'total',asc=window.__dtideMatrixAsc||false;rows.sort((a,b)=>{const av=sortKey==='total'?a.total:((groups.get(Number(sortKey))?.wheels||[]).find(x=>x.key===a.key)?.count||0),bv=sortKey==='total'?b.total:((groups.get(Number(sortKey))?.wheels||[]).find(x=>x.key===b.key)?.count||0),d=bv-av;return (asc?-d:d)||String(a.name||a.key).localeCompare(String(b.name||b.key),'zh-CN')});
      const waveHeatMax=new Map(waves.map(w=>[w,Math.max(0,...(groups.get(w)?.wheels||[]).map(x=>Number(x.teamRatePct)||0))]));
      const arrow=k=>k===sortKey?(asc?' ↑':' ↓'):' ↕',ratioBar=wheel=>{const total=wheel.stacks.reduce((sum,x)=>sum+x.count,0)||1;return `<div class="dtideRatioBar" title="${wheel.stacks.map(x=>`${wheelStackZh[x.key]} ${pct(x.count/total*100)}`).join(' · ')}">${wheel.stacks.filter(x=>x.count>0).map(x=>`<span style="width:${x.count/total*100}%;background:${wheelStackColors[x.key]}"></span>`).join('')}</div>`};if(!rows.length){host.innerHTML='<div class="dtideEmpty">当前口径暂无命轮记录。</div>';return}
      host.innerHTML=`<table class="dtideTable"><thead><tr><th>命轮</th><th>叠位比例</th>${waves.map(w=>`<th><button type="button" class="dtideSortHead" data-sort-key="${w}" title="点击切换升降序">Wave ${w}${arrow(String(w))}</button></th>`).join('')}<th><button type="button" class="dtideSortHead" data-sort-key="total" title="点击切换升降序">总出现${arrow('total')}</button></th></tr></thead><tbody>${rows.map(wheel=>`<tr><td><div class="dtideChar">${wheel.image?`<img class="dtideGearIcon" src="${esc(localAsset(wheel.image,'wheel'))}" alt="" loading="lazy" onerror="this.hidden=true">`:''}<span>${esc(wheel.name||wheel.key)}</span></div></td><td>${ratioBar(wheel)}</td>${waves.map(w=>{const hit=(groups.get(w)?.wheels||[]).find(x=>x.key===wheel.key),rate=hit?.teamRatePct||0;return `<td class="dtideRate dtideHeat" style="${dtideHeatStyle(rate,waveHeatMax.get(w))}">${pct(rate)}</td>`}).join('')}<td>${wheel.total}</td></tr>`).join('')}</tbody></table>`;
      host.onclick=e=>{const btn=e.target.closest('[data-sort-key]');if(!btn)return;const key=String(btn.dataset.sortKey);if(window.__dtideMatrixSort===key)window.__dtideMatrixAsc=!window.__dtideMatrixAsc;else{window.__dtideMatrixSort=key;window.__dtideMatrixAsc=false}renderMatrix()};return;
    }
    if(entity==='creation'){
      const filterCreations=$('dtideCreationFilter')?.checked,creationGroup=rows=>{const map=new Map();for(const {team} of rows){const seen=new Set();for(const item of team.creations||[]){const key=String(item.id??item.name??''),name=String(item.name||'').replace(/^"|"$/g,'').trim();if(!key||seen.has(key)||(filterCreations&&(/^Dimensional Image(?::|$)/i.test(name)||/^维度影像(?:：|$)/.test(name)||/^(?:Rusted Key|锈蚀钥匙)$/i.test(name))))continue;seen.add(key);const old=map.get(key)||{key,name:item.name||key,image:item.image||'',count:0};old.count++;if(!old.image&&item.image)old.image=item.image;map.set(key,old)}}const denom=rows.length||1;return [...map.values()].map(x=>({...x,teamRatePct:x.count/denom*100})).filter(x=>!filterCreations||x.teamRatePct<100)},waveGroups=new Map(waves.map(w=>[w,creationGroup(all.filter(x=>Number(x.wave.wave)===w))])),union=new Map();
      for(const [,items]of waveGroups)for(const item of items){const old=union.get(item.key);union.set(item.key,old?{...old,...item,image:item.image||old.image}:{...item})}
      const rows=[...union.values()].map(item=>({...item,total:waves.reduce((sum,w)=>sum+(waveGroups.get(w)?.find(x=>x.key===item.key)?.count||0),0)})),sortKey=window.__dtideMatrixSort||'total',asc=window.__dtideMatrixAsc||false;
      rows.sort((a,b)=>{const av=sortKey==='total'?a.total:(waveGroups.get(Number(sortKey))?.find(x=>x.key===a.key)?.count||0),bv=sortKey==='total'?b.total:(waveGroups.get(Number(sortKey))?.find(x=>x.key===b.key)?.count||0),d=bv-av;return (asc?-d:d)||String(a.name||a.key).localeCompare(String(b.name||b.key),'zh-CN')});
      const waveHeatMax=new Map(waves.map(w=>[w,Math.max(0,...(waveGroups.get(w)||[]).map(x=>Number(x.teamRatePct)||0))])),arrow=k=>k===sortKey?(asc?' ↑':' ↓'):' ↕';
      if(!rows.length){host.innerHTML='<div class="dtideEmpty">当前口径暂无造物记录。</div>';return}
      host.innerHTML=`<table class="dtideTable"><thead><tr><th>造物</th>${waves.map(w=>`<th><button type="button" class="dtideSortHead" data-sort-key="${w}" title="点击切换升降序">Wave ${w}${arrow(String(w))}</button></th>`).join('')}<th><button type="button" class="dtideSortHead" data-sort-key="total" title="点击切换升降序">总出现${arrow('total')}</button></th></tr></thead><tbody>${rows.map(item=>`<tr><td><div class="dtideChar">${item.image&&localAsset(item.image,'creation')?`<img class="dtideGearIcon" src="${esc(localAsset(item.image,'creation'))}" alt="" loading="lazy" onerror="this.hidden=true">`:''}<span>${esc(item.name)}</span></div></td>${waves.map(w=>{const hit=waveGroups.get(w)?.find(x=>x.key===item.key),rate=hit?.teamRatePct||0;return `<td class="dtideRate dtideHeat" style="${dtideHeatStyle(rate,waveHeatMax.get(w))}">${pct(rate)}</td>`}).join('')}<td>${item.total}</td></tr>`).join('')}</tbody></table>`;
      host.onclick=e=>{const btn=e.target.closest('[data-sort-key]');if(!btn)return;const key=String(btn.dataset.sortKey);if(window.__dtideMatrixSort===key)window.__dtideMatrixAsc=!window.__dtideMatrixAsc;else{window.__dtideMatrixSort=key;window.__dtideMatrixAsc=false}renderMatrix()};
      return;
    }
    const union=new Map();
    for(const [,g] of groups)for(const c of g.characters)union.set(c.key,c);
    const sortKey=window.__dtideMatrixSort||'total',asc=window.__dtideMatrixAsc||false;
    const totals=new Map(analysis.group.characters.map(x=>[x.key,x]));const rows=[...union.values()].map(c=>{const t=totals.get(c.key);return {...c,borrowedCount:t?.borrowedCount||0,assistRatePct:t?.assistRatePct||0,total:waves.reduce((s,w)=>s+(groups.get(w)?.characters.find(x=>x.key===c.key)?.count||0),0)}});const assistHeatMax=seasonAssistHeatMax;
    rows.sort((a,b)=>{const av=sortKey==='total'?a.total:sortKey==='assist'?(a.assistRatePct||0):(groups.get(Number(sortKey))?.characters.find(x=>x.key===a.key)?.count||0),bv=sortKey==='total'?b.total:sortKey==='assist'?(b.assistRatePct||0):(groups.get(Number(sortKey))?.characters.find(x=>x.key===b.key)?.count||0),d=bv-av;return (asc?-d:d)||String(a.name||a.key).localeCompare(String(b.name||b.key),'zh-CN')});
    const arrow=k=>k===sortKey?(asc?' ↑':' ↓'):' ↕';if(!rows.length){host.innerHTML='<div class="dtideEmpty">当前口径暂无记录。</div>';return}
    const enlightBar=c=>{let items=enlightOrder.map(key=>(Array.isArray(c.enlight)?c.enlight:[]).find(x=>(x.key||x.id)===key)).filter(x=>x&&Number(x.count)>0);if(!items.length)items=[{key:"unknown",name:"启灵数据缺失",count:c.count||1}];const total=items.reduce((s,x)=>s+Number(x.count||0),0)||1;return `<div class="dtideEnlightBar" title="${items.map(x=>`${enlightZh[x.key]||x.name||'未知'} ${pct(Number(x.count||0)/total*100)}`).join(' · ')}">${items.map(x=>{const key=x.key||x.id||'unknown';return `<span style="width:${Number(x.count||0)/total*100}%;background:${enlightColors[key]||enlightColors.unknown}"></span>`}).join('')}</div>`};
    const characterEnlight=new Map();
    for(const [,g] of groups){for(const c of g.byCharacter||[]){const item=characterEnlight.get(c.key)||{count:0,enlight:new Map()};item.count+=c.appearances||0;for(const e of c.enlight||[]){const old=item.enlight.get(e.key)||{...e,count:0};old.count+=e.count||0;item.enlight.set(e.key,old)}characterEnlight.set(c.key,item)}}
    host.innerHTML=`<table class="dtideTable"><thead><tr><th>角色</th>${waves.map(w=>`<th><button type="button" class="dtideSortHead" data-sort-key="${w}" title="点击切换升降序">Wave ${w}${arrow(String(w))}</button></th>`).join('')}<th><button type="button" class="dtideSortHead" data-sort-key="assist" title="点击切换升降序">助战使用率${arrow('assist')}</button></th><th><button type="button" class="dtideSortHead" data-sort-key="total" title="点击切换升降序">总出现${arrow('total')}</button></th></tr></thead><tbody>${rows.map(c=>{const ce=characterEnlight.get(c.key),info=characterInfo(c.id||c.ingameId||c.key,c);return `<tr><td><div class="dtideChar">${info.image?`<img src="${esc(info.image)}" alt="" onerror="this.hidden=true">`:''}<span>${esc(info.name||c.name)}</span>${enlightBar({...c,count:ce?.count||c.total,enlight:ce?[...ce.enlight.values()]:[]})}</div></td>${waves.map(w=>{const g=groups.get(w),hit=g?.characters.find(x=>x.key===c.key),rate=mode==='slot'?(hit?.slotRatePct||0):(hit?.teamRatePct||0);return `<td class="dtideRate">${pct(rate)}</td>`}).join('')}<td class="dtideRate dtideHeat" style="${dtideHeatStyle(c.assistRatePct||0,assistHeatMax)}">${pct(c.assistRatePct||0)}</td><td>${c.total}</td></tr>`}).join('')}</tbody></table>`;
    host.onclick=e=>{const btn=e.target.closest('[data-sort-key]');if(!btn)return;const key=String(btn.dataset.sortKey);if(window.__dtideMatrixSort===key)window.__dtideMatrixAsc=!window.__dtideMatrixAsc;else{window.__dtideMatrixSort=key;window.__dtideMatrixAsc=false}renderMatrix()};
  }
  function renderUsage(){const host=$('dtideUsage');if(!host)return;const g=currentGroup(),mode=$('dtideRateMode')?.value||'team';host.innerHTML=g.characters.slice(0,18).map((c,i)=>{const info=characterInfo(c.id||c.ingameId||c.key),rate=mode==='slot'?(g.memberSlots?c.count/g.memberSlots*100:0):c.teamRatePct;return `<button class="dtideUsage" type="button" data-character-index="${i}" title="点击展开该角色的 Top5 队友、命轮和密契出场率"><div class="dtideChar">${info.image?`<img src="${esc(info.image)}" alt="">`:''}<span><b>${esc(info.name||c.name)}</b><small>${c.count} 次 · 展开 Top5 队友 / 命轮 / 密契</small></span></div><strong>${pct(rate)}</strong></button>`}).join('')||'<div class="dtideEmpty">无角色统计。</div>'}
  function compareTable(columns,groups){
    const union=new Map();for(const g of groups)for(const c of g.characters)union.set(c.key,c);const rows=[...union.values()].map(c=>({...c,total:groups.reduce((s,g)=>s+(g.characters.find(x=>x.key===c.key)?.count||0),0)})).sort((a,b)=>b.total-a.total).slice(0,40);if(!rows.length)return '<div class="dtideEmpty">暂无记录。</div>';return `<table class="dtideTable"><thead><tr><th>角色</th>${columns.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(c=>{const info=characterInfo(c.id||c.ingameId||c.key);return `<tr><td>${esc(info.name||c.name)}</td>${groups.map(g=>{const hit=g.characters.find(x=>x.key===c.key);return `<td class="dtideRate">${pct(hit?.teamRatePct||0)}</td>`}).join('')}</tr>`}).join('')}</tbody></table>`}
  function renderComparisons(){return}
  function renderEquipment(){
    const g=currentGroup(),coverage=manifest.fieldCoverage||{},key=$('dtideEquipCharacter').value;if(!coverage.wheels&&!coverage.covenants){$('dtideEquipment').innerHTML='<div class="dtideNotice">当前快照尚未由结构化 __data.json 重建；下一次同步后会自动启用命轮、密契与启灵统计。</div>';return}
    const section=(title,arr,rateKey='teamRatePct',denom='支队伍',isEnlight=false)=>{const items=isEnlight?[...(arr||[])].sort((a,b)=>enlightOrder.indexOf(b.key)-enlightOrder.indexOf(a.key)):(arr||[]);return `<h4 style="margin:10px 0 7px;font-size:12px">${title}</h4><div class="dtideUsageCards">${items.slice(0,24).map(x=>{const group=x.key||x.id||'unknown',color=enlightColors[group]||enlightColors.unknown;return `<div class="dtideUsage${isEnlight?' dtideEnlightItem':''}"${isEnlight?` style="--dtide-enlight-color:${color};--dtide-enlight-fill:${color}38"`:''}><div><b>${esc(isEnlight?(enlightZh[group]||x.name||group):(x.name||x.key))}</b><small>${x.count} ${denom}</small></div><strong>${pct(x[rateKey])}</strong></div>`}).join('')||'<div class="dtideEmpty">暂无</div>'}</div>`};
    if(!key){$('dtideEquipment').innerHTML=section('启灵分组 · 角色槽位分布',g.enlight,'teamRatePct','次',true)+section('命轮 · 队伍采用率',g.wheels)+section('密契套装 · 队伍采用率',g.covenants);return}
    const c=g.byCharacter.find(x=>x.key===key);if(!c){$('dtideEquipment').innerHTML='<div class="dtideEmpty">当前筛选下该角色没有记录。</div>';return}const info=characterInfo(c.id||c.ingameId||c.key),enlight=(c.enlight||[]).map(x=>`${enlightZh[x.key]||x.name} ${x.count}`).join(' · ')||'—';$('dtideEquipment').innerHTML=`<div class="dtideGearSummary"><div><small>角色</small><b>${esc(info.name||c.name)}</b></div><div><small>出现次数 / 等级</small><b>${c.appearances} · Lv.${c.level.min??'—'}–${c.level.max??'—'}</b></div><div><small>启灵分组</small><b>${esc(enlight)}</b></div></div>`+section('最高出场率队友 Top 5',c.teammates,'ratePct','次同队')+section('该角色启灵分组',c.enlight,'ratePct','次',true)+section('该角色命轮采用率',c.wheels,'ratePct','次装备')+section('该角色密契套装采用率',c.covenants,'ratePct','次采用');
  }
  function populateFilters(){
    const chars=new Map();for(const {team} of flattenTeams())for(const m of team.members||[]){const k=String(memberKey(m));if(k)chars.set(k,{...characterInfo(m.skeydbId||m.ingameId||k),fallback:m.canonicalName||m.name||k})}
    const choices=[...chars.entries()].sort((a,b)=>(a[1].name||a[1].fallback).localeCompare(b[1].name||b[1].fallback,'zh-CN')).map(([k,v])=>`<button type="button" class="dtideCharacterChoice" data-character-key="${esc(k)}" aria-pressed="false" title="${esc(v.name||v.fallback)}">${v.image?`<img src="${esc(v.image)}" alt="" loading="lazy" onerror="this.hidden=true">`:''}<span class="dtideCharacterChoiceName">${esc(v.name||v.fallback)}</span></button>`).join('');$('dtideCharacters').innerHTML=choices;$('dtideExcludeCharacters').innerHTML=choices;
    const scoreValues=[...new Set(flattenTeams().map(({record})=>Number(record?.score)).filter(Number.isFinite))].sort((a,b)=>b-a);const scoreRanges=[['500:525','500–525 分'],['450:495','450–495 分'],['400:445','400–445 分'],[':399','400（不含）以下']];$('dtideTotalScore').innerHTML='<option value="all">全部分数</option>'+scoreRanges.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')+scoreValues.map(score=>`<option value="${score}">${score} 分</option>`).join('');const coverage=manifest.fieldCoverage||{};$('dtideProgression').disabled=!coverage.enlightenLevel;$('dtideWheel').disabled=!coverage.wheels;$('dtideCovenant').disabled=!coverage.covenants;
    const wheelNames=new Map(),covNames=new Map();for(const {team} of flattenTeams())for(const m of team.members||[]){for(const item of m.wheels||[])wheelNames.set(String(item.id??item.name),wheelName(item));for(const item of m.covenants||((m.covenant)?[m.covenant]:[]))covNames.set(String(item.id??item.name),item.name||item.id)}
    $('dtideWheel').innerHTML='<option value="">不限</option>'+[...wheelNames].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'zh-CN')).map(([k,v])=>`<option value="${esc(k)}">${esc(v)}</option>`).join('');$('dtideCovenant').innerHTML='<option value="">不限</option>'+[...covNames].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'zh-CN')).map(([k,v])=>`<option value="${esc(k)}">${esc(v)}</option>`).join('');filtersReady=true;
  }

  function matchesFilters(row){
    const rankCap=selectedRankCap();if(!rankMatches(row.record,rankCap))return false;
    const difficulty=$('dtideDifficulty').value;if(difficulty!=='all'&&row.difficulty!==difficulty)return false;
    const wave=$('dtideSearchWave')?.value||'all';if(wave!=='all'&&Number(row.wave.wave)!==Number(wave))return false;
    if(!scoreMatches(row.record))return false;
    const ct=$('dtideClearType').value;if(ct!=='all'&&ct!==row.team.clearType)return false;
    const include=getSelectedValues('dtideCharacters'),exclude=getSelectedValues('dtideExcludeCharacters'),keys=row.team.members.map(m=>String(memberKey(m))),mode=$('dtideCharacterMode').value;if(include.length&&!(mode==='all'?include.every(x=>keys.includes(x)):include.some(x=>keys.includes(x))))return false;if(exclude.some(x=>keys.includes(x)))return false;
    const realmRoleTargets=activeAwakenerMembers(row.team),targets=include.length?realmRoleTargets.filter(m=>include.includes(String(memberKey(m)))):realmRoleTargets;if(!targets.length)return false;
    const minLv=Number($('dtideLevelMin').value||0),maxLv=Number($('dtideLevelMax').value||0);if(minLv&&targets.some(m=>m.level==null||Number(m.level)<minLv))return false;if(maxLv&&targets.some(m=>m.level==null||Number(m.level)>maxLv))return false;
    const prog=$('dtideProgression').value;if(prog&&!targets.some(m=>enlightClass(m)===prog))return false;
    const borrowed=$('dtideBorrowed').value,hasBorrow=row.team.members.some(m=>m.borrowed);if(borrowed==='yes'&&!hasBorrow)return false;if(borrowed==='no'&&hasBorrow)return false;
    const wheel=$('dtideWheel').value,cov=$('dtideCovenant').value;if(wheel&&!targets.some(m=>(m.wheels||[]).some(x=>String(x.id??x.name)===wheel)))return false;if(cov&&!targets.some(m=>(m.covenants||((m.covenant)?[m.covenant]:[])).some(x=>String(x.id??x.name)===cov)))return false;
    const csmin=$('dtideCovenantScoreMin').value===''?null:Number($('dtideCovenantScoreMin').value),csmax=$('dtideCovenantScoreMax').value===''?null:Number($('dtideCovenantScoreMax').value);if(csmin!=null&&targets.some(m=>m.covenantScore==null||Number(m.covenantScore)<csmin))return false;if(csmax!=null&&targets.some(m=>m.covenantScore==null||Number(m.covenantScore)>csmax))return false;
    const smin=Number($('dtideScoreMin').value||0),rmax=Number($('dtideRankMax').value||0);if(smin&&(row.record.score||0)<smin)return false;if(rmax&&(!row.record.rank||row.record.rank>rmax))return false;return true;
  }
  function renderResults(){
    if(!$('dtideResults')||!$('dtidePager'))return;
    searchPerformed=true;
    const all=flattenTeams().filter(matchesFilters),limit=200,rows=all.slice(0,limit);$('dtideResults').innerHTML=rows.map(({record,wave,team,difficulty})=>`<article class="dtideResult"><div class="dtideResultHead"><b>#${esc(record.rank??'—')} ${esc(record.player)} · Wave ${wave.wave} · ${esc(difficultyZh[difficulty]||difficultyZh.unknown)} · ${team.clearType==='extra'?'Extra Clear':'Clear'} · ${esc(record.score??'—')} 分</b><a href="${esc(record.url)}" target="_blank" rel="noopener noreferrer">查看 Eremora 原记录</a></div><div class="dtideMembers">${team.members.map(m=>{const info=characterInfo(m.skeydbId||m.ingameId||memberKey(m),m),wn=(m.wheels||[]).map(wheelName).filter(Boolean).join(' / '),cn=(m.covenants||((m.covenant)?[m.covenant]:[])).map(x=>x.name).filter(Boolean).join(' / '),ec=enlightClass(m);return `<div class="dtideMember">${info.image?`<img class="dtideMemberAvatar" src="${esc(info.image)}" alt="" loading="lazy">`:''}<b>${esc(info.name||m.canonicalName||m.name)}</b><small>Lv.${esc(m.level??'—')} · ${esc(enlightZh[ec])}${m.covenantScore!=null?` · 密契评分 ${esc(m.covenantScore)}`:''}</small>${wn?`<small class="dtideGear">命轮：${esc(wn)}</small>`:''}${cn?`<small class="dtideGear">密契：${esc(cn)}</small>`:''}${m.borrowed?'<small class="dtideBorrow">借用助战</small>':''}</div>`}).join('')}</div></article>`).join('')||'<div class="dtideEmpty">没有符合这些条件的配队。</div>';$('dtidePager').textContent=`匹配 ${all.length} 支队伍${all.length>limit?` · 当前显示前 ${limit} 支`:''}`;
  }
  function renderSearchPrompt(){if(!$('dtideResults')||!$('dtidePager'))return;$('dtideResults').innerHTML='<div class="dtideEmpty">设置筛选条件后点击“搜索配队”查看结果。</div>';$('dtidePager').textContent=''}
  function resetFilters(){for(const id of ['dtideLevelMin','dtideLevelMax','dtideCovenantScoreMin','dtideCovenantScoreMax','dtideScoreMin','dtideRankMax'])$(id).value='';for(const id of ['dtideProgression','dtideBorrowed','dtideWheel','dtideCovenant'])$(id).value='';document.querySelectorAll('.dtideCharacterChoice.isSelected').forEach(x=>{x.classList.remove('isSelected');x.setAttribute('aria-pressed','false')});document.querySelectorAll('.dtideFilterChip.isActive').forEach(x=>x.classList.remove('isActive'));$('dtideCharacterMode').value='all';$('dtideSearchWave').value='all';analysisCache=null;searchPerformed=false;renderSearchPrompt();scheduleRender()}
  function enlightenmentDetailBlock(arr){const items=[...(arr||[])].sort((a,b)=>enlightOrder.indexOf(a.key)-enlightOrder.indexOf(b.key));return '<h4>详细启灵比例</h4><div class="dtideUsageCards">'+(items.map(x=>{const key=x.key||'unknown',color=enlightColors[key]||enlightColors.unknown;return `<div class="dtideUsage dtideEnlightItem" style="--dtide-enlight-color:${color};--dtide-enlight-fill:${color}55"><div><b>${esc(enlightZh[key]||x.name||'未知')}</b><small>${x.count} 次</small></div><strong>${pct(x.ratePct)}</strong></div>`}).join('')||'<div class="dtideEmpty">暂无启灵数据</div>')+'</div>'}
  function renderAll(){if(window.MorimensDtideRenderer==='legacy')return;renderSummary();renderMatrix();renderUsage();renderComparisons();if(filtersReady&&searchPerformed)renderResults();else if(filtersReady)renderSearchPrompt();$('dtideMatrix')?.removeAttribute('aria-busy')}
  function scheduleRender(){if(window.MorimensDtideRenderer==='legacy')return;cancelAnimationFrame(renderFrame);renderFrame=requestAnimationFrame(()=>{renderFrame=0;if(season&&filtersReady)renderAll()})}
  function relocalizeControls(){
    for(const option of $('dtideEquipCharacter')?.options||[]){if(!option.value)continue;option.textContent=characterInfo(option.value).name}
    for(const choice of document.querySelectorAll('.dtideCharacterChoice')){const info=characterInfo(choice.dataset.characterKey),label=choice.querySelector('.dtideCharacterChoiceName');if(label)label.textContent=info.name;choice.title=info.name}
    const wheels=new Map();for(const {team} of flattenTeams())for(const member of team.members||[])for(const item of member.wheels||[])wheels.set(String(item.id??item.name),item);
    for(const option of $('dtideWheel')?.options||[]){if(!option.value)continue;const item=wheels.get(option.value);if(item)option.textContent=wheelName(item)}
    if(season)renderAll();
  }

  async function loadSeason(id){
    const loadToken=++seasonLoadToken;
    cancelAnimationFrame(renderFrame);renderFrame=0;
    searchPerformed=false;
    filtersReady=false;
    $('dtideStatus').textContent='正在载入期次…';
    const matrix=$('dtideMatrix');if(matrix){matrix.setAttribute('aria-busy','true');matrix.innerHTML='<div class="dtideEmpty">正在载入并整理角色榜单…</div>'}
    const entry=manifest.availableSeasons.find(x=>String(x.seasonId)===String(id));
    if(!entry)throw new Error(`Season ${id} snapshot unavailable`);
    const current=Number(id)===Number(manifest.currentSeason)&&manifest.usageIndex?.path
      ?{path:manifest.usageIndex.path,statsPath:manifest.usageIndex.statsPath}
      :entry;
    const loader=window.MorimensDtideDataLoader;
    if(!loader?.loadDataset)throw new Error('D-Zone shared data loader unavailable');
    const revision=current.revision||manifest.usageIndex?.revision||manifest.usageIndex?.syncedAt||manifest.analytics?.generatedAt||manifest.source?.syncedAt||'1';
    const rankPath=entry.legacy||entry.coverageMode==='legacy-spreadsheet'?null:(Number(id)===Number(manifest.currentSeason)?(manifest.rankIndex?.path||`data/morimens/eremora/rank-index/${id}.json`):`data/morimens/eremora/rank-index/${id}.json`);
    const [loadedSeason,loadedStats,loadedRanks]=await Promise.all([
      loader.loadDataset(current.path),
      loader.loadJson(current.statsPath,{revision,fresh:true}),
      rankPath&&loader.loadRankMap?loader.loadRankMap(rankPath,{revision,fresh:true}).catch(error=>{console.warn('rank index unavailable',id,error);return new Map()}):Promise.resolve(new Map())
    ]);
    if(loadToken!==seasonLoadToken)return;
    season=loadedSeason;
    stats=loadedStats;
    rankByUid=loadedRanks;
    flatTeamsCache=null;
    analysisCache=null;
    seasonAssistHeatMax=fullSeasonAssistHeatMax();
    const waves=[...new Set(flattenTeams().map(x=>Number(x.wave.wave)))].sort((a,b)=>a-b);
    $('dtideSearchWave').innerHTML='<option value="all">全部波次</option>'+waves.map(w=>`<option value="${w}">Wave ${w}</option>`).join('');
    populateFilters();
    renderAll();
    if(matrix)matrix.removeAttribute('aria-busy');
  }
  async function loadOnce(){
    if(manifest)return;try{await waitMorimensData();for(const r of window.MorimensData?.db?.records||[]){awakenerMap.set(r.id,r);if(r.ingameId)awakenerMap.set(r.ingameId,r)}const r=await fetch('data/morimens/eremora/manifest.json',{cache:'no-store'});if(!r.ok)throw new Error(`manifest HTTP ${r.status}`);manifest=await r.json();const sel=$('dtideSeason');if(!sel)throw new Error('期次选择器尚未挂载');sel.innerHTML=(manifest.availableSeasons||[]).map(s=>`<option value="${s.seasonId}">${(s.legacy||s.coverageMode==='legacy-spreadsheet'||String(s.seasonId)==='legacy-high-difficulty')?'旧版融灾高难出场率（来源：@却尘）':`第 ${s.seasonId} 期 · ${s.recordCount??0} 条${s.complete?' · 完整':' · 部分'}`}</option>`).join('');if(!sel.options.length)throw new Error('暂无融灾快照');sel.value=String(manifest.currentSeason&&manifest.availableSeasons.some(x=>x.seasonId===manifest.currentSeason)?manifest.currentSeason:manifest.availableSeasons[0].seasonId);await loadSeason(sel.value);const pending=manifest.pendingBackfillSeasonIds||[];const note=$('dtideCoverageNote');if(note)note.innerHTML=`<strong>字段真实性：</strong>${esc((manifest.notes||[]).join(' '))}${pending.length?` 当前 ${pending.length} 个历史期次仍为增量快照：${pending.slice(0,12).join('、')}${pending.length>12?'…':''}`:''}`;sel.addEventListener('change',()=>{const requested=sel.value;loadSeason(requested).catch(error=>{if(sel.value===requested)showError(error)})});for(const id of ['dtideRankScope','dtideDifficulty','dtideTotalScore','dtideWave','dtideClearType','dtideRateMode','dtideSort','dtideEntityType','dtideCreationFilter'])$(id)?.addEventListener('change',scheduleRender);$('dtideEquipCharacter')?.addEventListener('change',renderEquipment);$('dtideSearch')?.addEventListener('click',renderResults);$('dtideReset')?.addEventListener('click',resetFilters);$('dtideUsage')?.addEventListener('click',e=>{const card=e.target.closest('[data-character-index]');if(!card)return;const c=currentGroup().characters[Number(card.dataset.characterIndex)];if(!c)return;document.querySelectorAll('.dtideInlineDetail').forEach(x=>x.remove());const block=(title,arr)=>'<h4>'+title+'</h4><div class="dtideUsageCards">'+((arr||[]).slice(0,5).map(x=>'<div class="dtideUsage"><div><b>'+esc(x.name||x.key)+'</b><small>'+x.count+' 次</small></div><strong>'+pct(x.ratePct||x.teamRatePct)+'</strong></div>').join('')||'<div class="dtideEmpty">暂无数据</div>')+'</div>';const detail=document.createElement('div');detail.className='dtideInlineDetail';detail.innerHTML=block('Top5 队友出场率',c.teammates)+enlightenmentDetailBlock(c.enlight)+block('命轮出场率',c.wheels)+block('密契出场率',c.covenants);card.insertAdjacentElement('afterend',detail);card.setAttribute('aria-expanded','true')})}catch(e){showError(e)}
  }
  function showError(e){console.warn('D-Zone analytics failed',e);if($('dtideStatus'))$('dtideStatus').textContent='融灾数据加载失败';if($('dtideResults'))$('dtideResults').innerHTML=`<div class="dtideNotice">${esc(e?.message||e)}</div>`}
  function boot(){injectStyle();setupTabs();document.addEventListener('click',e=>{const choice=e.target.closest('.dtideCharacterChoice');if(choice){const selected=choice.classList.toggle('isSelected');choice.setAttribute('aria-pressed',String(selected));return}const chip=e.target.closest('.dtideFilterChip');if(!chip)return;chip.classList.toggle('isActive');analysisCache=null;if(filtersReady)scheduleRender()});window.addEventListener('morimens-language-change',()=>{if($('morimensBuilderTab')){$('morimensBuilderTab').textContent=zh()?'伤害计算 / 每日签':'Damage / Fortune';$('morimensDtideTab').textContent=zh()?'融灾榜单':'D-Zone Leaderboard'}relocalizeControls()})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
