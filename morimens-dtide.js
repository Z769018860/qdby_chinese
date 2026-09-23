(()=>{
  const $=id=>document.getElementById(id);
  const nativeAtob=window.atob.bind(window);window.atob=value=>{const clean=String(value).replace(/[^A-Za-z0-9+/_-]/g,'').replace(/-/g,'+').replace(/_/g,'/');return nativeAtob(clean+'='.repeat((4-clean.length%4)%4))};
  const esc=s=>String(decodeMojibake(s)??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const decodeMojibake=value=>{const text=String(value??'');if(!/[ÃÂæåçèéêëìíîïðñòóôõö÷øùúûüýþã]/.test(text)||typeof TextDecoder==='undefined')return text;try{const bytes=Uint8Array.from([...text].map(c=>c.charCodeAt(0)&255));const fixed=new TextDecoder('utf-8',{fatal:true}).decode(bytes);return /�/.test(fixed)?text:fixed}catch{return text}};
  const pct=v=>Number.isFinite(Number(v))?`${Number(v).toFixed(1)}%`:'—';
  const zh=()=>localStorage.getItem('morimens.language')!=='en';
  const ui=(cn,en)=>zh()?cn:en;
  const rankCaps=[50,200,500,1000];
  const difficultyOrder=['normal','hard','nightmare','madness'];
  const difficultyZh={all:'全部难度',normal:'普通',hard:'困难',nightmare:'噩梦',madness:'癫狂',unknown:'未识别'};
  const difficultyEn={all:'All Difficulties',normal:'Normal',hard:'Hard',nightmare:'Nightmare',madness:'Madness',unknown:'Unknown'};
  const enlightOrder=['e0_2','e3_plus3','plus4_11','plus12'];
  const enlightZh={e0_2:'0～2启',e3_plus3:'3启～+3',plus4_11:'+4～+11',plus12:'+12',unknown:'未知'};
  const enlightEn={e0_2:'E0–E2',e3_plus3:'E3–+3',plus4_11:'+4–+11',plus12:'+12',unknown:'Unknown'};
  const enlightColors={e0_2:'#8c97a8',e3_plus3:'#d9a441',plus4_11:'#62b7ff',plus12:'#d978d0',unknown:'#6b7280'};
  const wheelStackOrder=['stack0_2','stack3_11','stack12'];
  const wheelStackZh={stack0_2:'0～2叠',stack3_11:'3叠～+11',stack12:'+12'};
  const wheelStackEn={stack0_2:'0–2 stacks',stack3_11:'3–+11',stack12:'+12'};
  const wheelStackColors={stack0_2:'#8c97a8',stack3_11:'#62b7ff',stack12:'#d978d0'};
  const realmOrder=['Chaos','Aequor','Caro','Ultra'];
  const realmZh={Chaos:'混沌',Aequor:'深海',Caro:'血肉',Ultra:'超维'};
  const realmIcons={Chaos:'Icon_Career2_Hundun.webp',Aequor:'Icon_Career2_Shenhai.webp',Caro:'Icon_Career2_Xuerou.webp',Ultra:'Icon_Career2_Chaowei.webp'};
  const roleOrder=['Warden','Chorus','Assault'];
  const roleZh={Warden:'防御型',Chorus:'辅助型',Assault:'伤害型'};
  const realmIconSrc=name=>'assets/morimens/realms-svg/'+(realmIcons[name]||'Icon_Career2_Hundun.webp').replace(/\.webp$/i,'.svg');
  function localAsset(src,kind){const raw=String(src||'');if(!raw)return '';const file=raw.split(/[\\/]/).pop().split('?')[0];if(kind==='wheel'&&/^Weapon_(Full|Mini)_/.test(file))return 'assets/morimens/wheels/'+(file.startsWith('Weapon_Mini_')?'Mini/':'')+file;if(kind==='creation'&&/^Icon_Creation_/.test(file))return 'assets/morimens/relics/'+file;if(kind==='covenant'&&/^Icon_Trinket_/.test(file))return 'assets/morimens/covenants/Icon/'+file;if(kind==='portrait'&&raw.startsWith('assets/'))return raw;return raw;}
  let manifest=null,season=null,stats=null,legacyStructured=null,awakenerMap=new Map(),rankByUid=new Map(),rankOverrideByUid=new Map(),rankOverrideScope=0,filtersReady=false,searchPerformed=false;
  let flatTeamsCache=null,analysisCache=null,seasonAssistHeatMax=0,seasonLoadToken=0,renderFrame=0;
  const currentSeasonRosterSupplementIds=['awakener-0061'];
  function currentSeasonRosterSupplements(){
    if(!manifest||!season||Number(season.seasonId)!==Number(manifest.currentSeason))return [];
    const records=window.MorimensData?.db?.records||[];
    return currentSeasonRosterSupplementIds.map(id=>records.find(x=>x.id===id)).filter(Boolean);
  }

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
    const current=Number(season?.seasonId)===Number(manifest?.currentSeason);
    if(current&&rankOverrideScope&&cap<=rankOverrideScope){
      const override=rankOverrideByUid.get(String(record?.uid??''));
      return Number.isFinite(override)&&override>0&&override<=cap;
    }
    const rank=rankOf(record);if(rank!=null)return rank<=cap;
    return !current&&rankByUid.size===0;
  }
  function selectedRankCap(){const raw=String($('dtideRankScope')?.value||'all');return raw==='all'||raw==='0'?0:(Number(raw)||0)}
  function rankScopeLabel(cap){return cap?`Top ${cap}`:(zh()?'全部范围':'All Ranks')}

  function injectStyle(){
    if($('morimensDtideStyle'))return;
    const s=document.createElement('style');s.id='morimensDtideStyle';s.textContent=`
      .morimensTabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 18px;padding:6px;border:1px solid rgba(148,163,184,.16);border-radius:15px;background:rgba(15,23,42,.65);position:sticky;top:8px;z-index:40;backdrop-filter:blur(12px)}
      .morimensTab{border:1px solid transparent;border-radius:10px;padding:10px 15px;background:transparent;color:#9eabba;cursor:pointer;font:700 13px/1.2 inherit}.morimensTab[aria-selected="true"]{color:#f1ddb5;border-color:rgba(213,177,118,.36);background:rgba(213,177,118,.12)}
      .dtideHero{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}.dtideControls{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:16px}.dtideFilters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.dtideField{display:flex;flex-direction:column;gap:6px}.dtideField.span2{grid-column:span 2}.dtideField label{font-size:11px;color:#98a4b6}.dtideField input,.dtideField select{min-height:40px;border:1px solid #334155;border-radius:10px;background:#111827;color:#edf2f7;padding:8px 10px}.dtideField select[multiple]{min-height:132px}.dtideField small{font-size:10px;color:#718096;line-height:1.45}
      .dtideCharacterPicker{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:7px;max-height:286px;overflow:auto;padding:8px;border:1px solid #334155;border-radius:11px;background:#0b1220}.dtideCharacterChoice{position:relative;display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0;padding:7px 5px;border:1px solid rgba(148,163,184,.18);border-radius:9px;background:#111827;color:#cfd7e3;cursor:pointer;font:inherit}.dtideCharacterChoice:hover{border-color:rgba(217,179,108,.55)}.dtideCharacterChoice img{width:44px;height:44px;border-radius:9px;object-fit:cover;background:#08101d}.dtideCharacterChoiceName{width:100%;white-space:normal;overflow:visible;word-break:break-all;text-align:center;line-height:1.2;font-size:10px;text-align:center}.dtideCharacterChoice.isSelected{border-color:#d9b36c;background:rgba(213,177,118,.18);color:#f7e3bd;box-shadow:0 0 0 1px rgba(213,177,118,.16) inset}.dtideCharacterChoice.isSelected:after{content:'✓';position:absolute;right:5px;top:5px;display:grid;place-items:center;width:17px;height:17px;border-radius:50%;background:#d9b36c;color:#172033;font-size:11px;font-weight:900}.dtideCharacterChoice:focus-visible{outline:2px solid #d9b36c;outline-offset:2px}
      .dtideStatGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:14px}.dtideStat{padding:13px;border-radius:12px;background:rgba(255,255,255,.035);border:1px solid rgba(148,163,184,.12)}.dtideStat small{display:block;color:#8290a2;font-size:10px}.dtideStat strong{display:block;margin-top:4px;font-size:20px;color:#f1dfbc}
      .dtideSection{margin-top:18px}.dtideSection h3{font-size:15px;margin:0 0 10px;color:#ead9b9}.dtideSubhead{display:flex;justify-content:space-between;align-items:end;gap:10px;flex-wrap:wrap;margin:0 0 10px}.dtideLeaderboardTabs{display:flex;gap:7px;flex-wrap:wrap;margin:0 0 10px}.dtideLeaderboardTab{border:1px solid rgba(148,163,184,.22);border-radius:9px;background:#111827;color:#aeb8c7;padding:7px 14px;font:inherit;font-size:12px;font-weight:800;cursor:pointer}.dtideLeaderboardTab[aria-selected="true"]{border-color:#b99a61;background:rgba(185,154,97,.16);color:#f1d69f}.dtideScroll{overflow:auto;border:1px solid rgba(148,163,184,.13);border-radius:12px}.dtideTable{width:100%;border-collapse:collapse;min-width:720px}.dtideTable th,.dtideTable td{padding:9px 10px;border-bottom:1px solid rgba(148,163,184,.1);text-align:left;font-size:11px}.dtideTable th{position:sticky;top:0;background:#111827;color:#aeb8c7;z-index:1}.dtideTable td{color:#d4dbe5}.dtideHeat{background:var(--dtide-heat,transparent);transition:background-color .18s ease}.dtideGearIcon{width:30px;height:30px;border-radius:7px;object-fit:cover;background:#0b1220;flex:none}.dtideSortHead,.dtideMatrixCharacter{border:0;background:transparent;color:inherit;font:inherit;font-weight:700;padding:0;cursor:pointer}.dtideSortHead:hover,.dtideMatrixCharacter:hover{color:#f1d69f}.dtideMatrixCharacter{width:100%;text-align:left}.dtideTable tr:last-child td{border-bottom:0}.dtideRate{font-variant-numeric:tabular-nums;color:#f1d69f;font-weight:800}.dtideChar{display:flex;align-items:center;gap:8px;min-width:130px}.dtideChar img{width:30px;height:30px;border-radius:8px;object-fit:cover;background:#0b1220}.dtideEnlightBar{display:flex;width:72px;height:6px;margin-left:2px;border-radius:99px;overflow:hidden;background:#263244;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);flex:none}.dtideEnlightBar span{height:100%;min-width:1px}
      .dtideRankedItem{display:flex;align-items:center;gap:8px}.dtideRankedItem>.dtideMatrixCharacter{width:auto;min-width:0;flex:1 1 auto}.dtideRankedItem>.dtideEnlightBar{margin-left:auto}.dtideEntityHead{display:flex;align-items:center;justify-content:space-between;gap:12px}.dtideEnlightLegend{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;font-size:9px;font-weight:600;color:#9da8b8}.dtideEnlightLegend span{display:inline-flex;align-items:center;gap:3px;white-space:nowrap}.dtideEnlightLegend i{width:9px;height:5px;border-radius:2px}.dtideRankMark{width:38px;flex:0 0 38px;text-align:center;font-variant-numeric:tabular-nums}.dtideRankMark>b{display:block;color:#dbe3ee;font-size:12px}.dtideRankMark>small{display:block;margin-top:2px;font-size:9px;font-weight:800;white-space:nowrap}.dtideRankUp{color:#36d17c}.dtideRankDown{color:#f15b69}.dtideRankSame{color:#7f8a9c}.dtideRankNew{color:#55b6ff}
      .dtideTable .dtideLegacyDetailRow>td{padding:0;border-bottom:1px solid rgba(148,163,184,.16)}.dtideLegacyDetail{position:relative;isolation:isolate;overflow:hidden;background:#101b2e;border-top:1px solid rgba(145,185,221,.18);color:#eaf2ff}.dtideLegacyDetail::before{content:'';position:absolute;inset:0;background-image:var(--legacy-cg);background-repeat:no-repeat;background-position:82% 24%;background-size:auto 155%;opacity:.32;pointer-events:none}.dtideLegacyDetail::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(10,19,35,.56),rgba(10,19,35,.25) 58%,rgba(10,19,35,.5));pointer-events:none}.dtideLegacyDetail>strong{position:relative;z-index:1;display:block;padding:13px 16px 0;font:700 13px/1.5 system-ui,sans-serif;letter-spacing:.02em;color:#f5f8ff}.dtideLegacyDetail svg{position:relative;z-index:1;display:block;width:100%;height:270px;font-family:system-ui,sans-serif;font-variant-numeric:tabular-nums;overflow:visible}.dtideAssistRealm{font-weight:800}.dtideAssistRows>div:last-child{border-bottom:0!important}.dtideSeasonDate{margin:0 0 9px;padding:8px 11px;border-left:3px solid #d9b36c;border-radius:7px;background:rgba(217,179,108,.08);color:#f1d69f;font-size:12px;font-weight:800;letter-spacing:.03em}.dtideSeasonDate[hidden]{display:none}.dtideLegacyRank{width:48px;text-align:center!important;color:#e9d0a0!important;font-weight:900;font-variant-numeric:tabular-nums}
      .dtideTableDownload{margin:0 auto 10px 0;padding:7px 12px;border:1px solid #b99a61;border-radius:9px;background:rgba(185,154,97,.16);color:#f1d69f;font:700 12px/1.4 system-ui,sans-serif;cursor:pointer}.dtideTableDownload:hover{background:rgba(185,154,97,.28)}.dtideTableDownload:disabled{opacity:.6;cursor:wait}.dtideTableDownload[hidden]{display:none}
      .dtideUsageCards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.dtideGearUsageName{display:flex;align-items:center;gap:8px;min-width:0}.dtideGearUsageName>img{width:34px;height:34px;flex:0 0 34px;object-fit:contain;border-radius:7px;background:rgba(7,12,20,.45);border:1px solid rgba(224,189,130,.18);padding:2px}.dtideGearUsageName>span{min-width:0}.dtideUsage{padding:10px;border:1px solid rgba(148,163,184,.12);border-radius:11px;background:rgba(255,255,255,.028);display:flex;justify-content:space-between;gap:10px;align-items:center}.dtideUsage b{font-size:12px}.dtideUsage small{display:block;color:#77869a;margin-top:3px}.dtideUsage strong{font-size:15px;color:#e9d0a0;white-space:nowrap}.dtideEnlightItem{border-color:var(--dtide-enlight-color)!important;background:linear-gradient(135deg,var(--dtide-enlight-fill),rgba(10,17,28,.72))!important;box-shadow:inset 4px 0 0 var(--dtide-enlight-color)}.dtideEnlightItem b,.dtideEnlightItem strong{color:#f4f7fb!important}.dtideRatioBar{display:flex;width:86px;height:7px;margin-left:auto;border-radius:99px;overflow:hidden;background:#263244;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);flex:none}.dtideRatioBar span{height:100%;min-width:1px}.dtideFilterPreset{display:flex;gap:6px;flex-wrap:wrap}.dtideFilterChip{display:inline-flex;align-items:center;gap:5px;min-height:36px;padding:6px 10px;border:1px solid #334155;border-radius:10px;background:#111827;color:#cfd7e3;cursor:pointer;font:inherit;font-size:11px}.dtideFilterChip img{width:22px;height:22px;object-fit:contain}.dtideFilterChip.isActive{border-color:#d9b36c;background:rgba(213,177,118,.18);color:#f4ddb3;box-shadow:0 0 0 1px rgba(213,177,118,.15) inset}.dtideMemberAvatar{width:30px;height:30px;border-radius:8px;object-fit:cover;float:left;margin:0 7px 3px 0;background:#0b1220}
      .dtideResults{display:grid;gap:9px}.dtideResult{padding:12px;border:1px solid rgba(148,163,184,.14);border-radius:13px;background:rgba(255,255,255,.025)}.dtideResultHead{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}.dtideResultHead b{font-size:13px}.dtideResultLinks{display:flex;flex-direction:column;align-items:flex-end;gap:5px;min-width:118px}.dtideResultLinks a{font-size:11px;color:#d5b176}.dtideReplayCopy{appearance:none;border:1px solid rgba(213,177,118,.34);border-radius:7px;background:rgba(213,177,118,.09);color:#e5c894;padding:5px 8px;font:700 10px/1.2 inherit;cursor:pointer}.dtideReplayCopy:hover{background:rgba(213,177,118,.18);border-color:rgba(213,177,118,.62)}.dtideReplayCopy.isCopied{color:#9fe0ba;border-color:rgba(90,190,130,.45);background:rgba(70,150,105,.12)}.dtideMembers{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:9px}.dtideMember{padding:8px;border-radius:9px;background:#111827;min-width:0}.dtideMember b{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}.dtideMember small{display:block;color:#7f8da1;margin-top:3px;font-size:9px;line-height:1.45}.dtideBorrow{color:#d7a85b!important}.dtideGear{color:#b8c4d6!important}.dtideNotice{padding:11px 12px;border-radius:11px;border:1px solid rgba(215,168,91,.25);background:rgba(215,168,91,.07);color:#b9c3d0;font-size:11px;line-height:1.65}.dtideEmpty{padding:22px;text-align:center;color:#7f8da1;font-size:12px}.dtideActions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.dtidePager{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:10px;color:#8290a2;font-size:11px}.dtideGearSummary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px}.dtideGearSummary>div{padding:10px;border:1px solid rgba(148,163,184,.12);border-radius:10px;background:rgba(255,255,255,.02)}.dtideGearSummary small{display:block;color:#77869a;font-size:9px}.dtideGearSummary b{font-size:13px;color:#e8d4ae}.dtideCharacterInsight{display:grid;grid-template-columns:minmax(260px,360px) minmax(0,1fr);gap:16px;margin-top:14px;padding-top:14px;border-top:1px solid rgba(148,163,184,.14)}.dtideCharacterPortrait{grid-row:1 / span 2;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:8px;padding:12px;border:1px solid rgba(148,163,184,.14);border-radius:12px;background:rgba(255,255,255,.025);min-width:0}.dtideCharacterPortraitImage{width:100%;height:470px;display:flex;align-items:center;justify-content:center;border-radius:10px;overflow:hidden;background:linear-gradient(180deg,rgba(13,20,31,.96),rgba(7,11,18,.98));color:#718096;font-size:11px}.dtideCharacterPortraitImage img{width:100%;height:100%;object-fit:contain;object-position:center center;transform:scale(1.04)}.dtideCharacterPortrait>b{font-size:14px;color:#ead7b3;text-align:center}.dtideCharacterPortrait>small{font-size:9px;color:#758398}.dtideCharacterInsightRight{display:grid;grid-template-rows:auto auto;gap:10px;min-width:0}.dtideInsightPanel{padding:11px;border:1px solid rgba(148,163,184,.12);border-radius:11px;background:rgba(255,255,255,.022);min-width:0}.dtideInsightPanel h4{display:flex;align-items:baseline;gap:7px;margin:0 0 9px;font-size:12px;color:#ead7b3}.dtideInsightPanel h4 small{font-size:9px;font-weight:500;color:#77869a}.dtideInsightEnlight{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.dtideInsightEnlightRow{padding:8px;border-radius:9px;background:#111827;min-width:0}.dtideInsightEnlightRow span,.dtideInsightEnlightRow small,.dtideInsightEnlightRow b{display:block}.dtideInsightEnlightRow span{font-size:10px;color:#cfd7e3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dtideInsightEnlightRow small{margin-top:2px;font-size:9px;color:#718096}.dtideInsightEnlightRow b{margin-top:4px;font-size:13px;color:#e9d0a0}.dtideSquadList{display:grid;gap:7px}.dtideSquadRow{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px;border-radius:10px;background:#111827}.dtideSquadRank{font-size:11px;font-weight:800;color:#d5b176;text-align:center}.dtideSquadMembers{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;min-width:0}.dtideSquadMember{display:flex;align-items:center;gap:5px;min-width:0}.dtideSquadMember img{width:28px;height:28px;border-radius:7px;object-fit:cover;background:#0b1220;flex:none}.dtideSquadMember span{font-size:9px;color:#cfd7e3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dtideSquadRate{text-align:right;white-space:nowrap}.dtideSquadRate b,.dtideSquadRate small{display:block}.dtideSquadRate b{font-size:12px;color:#e9d0a0}.dtideSquadRate small{margin-top:2px;font-size:9px;color:#718096}.dtideCompareGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.dtideCoverageWarn{margin-top:10px}.morimensAnnouncement{margin:0 0 12px;padding:12px 15px;border:1px solid rgba(224,189,130,.28);border-left:3px solid #d8b573;border-radius:12px;background:linear-gradient(90deg,rgba(85,62,33,.22),rgba(9,15,24,.55));color:#cfd7e3;font-size:12px;line-height:1.7;box-shadow:0 8px 24px rgba(0,0,0,.18)}.morimensAnnouncement strong{color:#f0d9ad}.announcementTag{display:inline-block;color:#fff3c4;background:#8f3441;border:1px solid #d8b573;border-radius:4px;padding:0 5px;font-weight:900;letter-spacing:.04em}.announcementDetailHint{display:inline-block;margin:5px 0 2px;padding:3px 9px;border:1px solid rgba(246,205,126,.72);border-radius:6px;background:linear-gradient(90deg,rgba(157,89,43,.82),rgba(117,49,62,.78));color:#fff3c4;font-weight:900;letter-spacing:.04em;box-shadow:0 0 16px rgba(216,181,115,.16)}.morimensDemoBadge{position:fixed;right:16px;top:12px;z-index:120;padding:4px 8px;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(7,11,18,.72);backdrop-filter:blur(10px);color:#d9dee8;font-size:9px;letter-spacing:.18em;text-transform:uppercase;box-shadow:0 6px 22px rgba(0,0,0,.24)}
      .dtideInsightEnlightRow{border:1px solid color-mix(in srgb,var(--dtide-enlight-color,#5f6b7a) 68%,transparent);background:color-mix(in srgb,var(--dtide-enlight-color,#5f6b7a) 32%,#111827);box-shadow:inset 3px 0 0 var(--dtide-enlight-color,#5f6b7a)}.dtideInsightEnlightRow span{color:#f4f7fb}.dtideInsightEnlightRow small{color:rgba(244,247,251,.68)}.dtideInsightEnlightRow b{color:#fff3d6}.dtideWikiLink{color:inherit;text-decoration:none}.dtideWikiLink:hover span,.dtideWikiLink:focus-visible span{color:#f1d69f;text-decoration:underline}.dtideCharacterPortraitImage.dtideWikiLink{cursor:pointer;outline:none}.dtideCharacterPortraitImage.dtideWikiLink:hover,.dtideCharacterPortraitImage.dtideWikiLink:focus-visible{box-shadow:0 0 0 2px rgba(217,179,108,.7),0 10px 28px rgba(0,0,0,.32)}
      .morimensCommentHero{position:relative;overflow:hidden;min-height:150px;padding:22px;border:1px solid rgba(224,189,130,.2);border-radius:18px;background:radial-gradient(circle at 88% 12%,rgba(224,189,130,.12),transparent 34%),linear-gradient(145deg,rgba(24,32,46,.68),rgba(8,13,21,.56));box-shadow:inset 0 1px 0 rgba(255,255,255,.035)}
      .morimensCommentHero:after{content:"";position:absolute;right:-56px;top:-76px;width:210px;height:210px;border:1px solid rgba(224,189,130,.14);border-radius:50%;box-shadow:0 0 70px rgba(224,189,130,.08);pointer-events:none}
      .morimensCommentHero .eyebrow{margin-bottom:7px}.morimensCommentHero h2{font-size:24px}.morimensCommentLead{max-width:760px;margin:9px 0 0;color:#aeb8c7;font-size:13px;line-height:1.75}.morimensCommentHint{display:flex;gap:7px;flex-wrap:wrap;margin-top:13px}.morimensCommentHint span{padding:5px 9px;border-radius:999px;border:1px solid rgba(213,177,118,.22);background:rgba(213,177,118,.07);color:#d9c7a7;font-size:10px}
      .morimensWalineWrap{margin-top:16px;padding:18px;border:1px solid rgba(148,163,184,.14);border-radius:16px;background:rgba(6,11,18,.5);box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}
      #morimensWaline{--waline-theme-color:#d5b176;--waline-active-color:#efd39e;--waline-color:#c8d0dc;--waline-bg-color:transparent;--waline-bg-color-light:rgba(17,24,39,.78);--waline-bg-color-hover:rgba(31,41,55,.8);--waline-border-color:rgba(148,163,184,.22);--waline-disable-bg-color:rgba(15,23,42,.75);--waline-disable-color:#738096;--waline-info-bg-color:rgba(15,23,42,.62);--waline-info-color:#8794a7;--waline-border:1px solid var(--waline-border-color);--waline-box-shadow:none}
      #morimensWaline .wl-panel{border-radius:14px;background:rgba(10,16,25,.54);backdrop-filter:blur(8px)}#morimensWaline .wl-header{border-bottom-color:rgba(148,163,184,.16)}#morimensWaline .wl-editor{color:#edf2f7}#morimensWaline .wl-card{border-bottom-color:rgba(148,163,184,.13)}#morimensWaline .wl-card .wl-content{color:#d5dce6}#morimensWaline .wl-nick{color:#e2c99e}#morimensWaline .wl-btn{border-radius:9px}#morimensWaline .wl-btn.primary{background:linear-gradient(135deg,#8d6a43,#c29b60);border-color:#c29b60;color:#11151d;font-weight:900}#morimensWaline .wl-login-info,#morimensWaline .wl-meta-head{color:#8390a2}
      #morimensWaline .wl-emoji-popup{max-width:min(620px,calc(100vw - 56px))}
      #morimensWaline .wl-emoji-popup .wl-tab-wrapper{max-height:280px;padding:10px}
      #morimensWaline .wl-emoji-popup .wl-tab-wrapper>button{width:56px;height:56px;margin:3px;line-height:56px;border-radius:8px}
      #morimensWaline .wl-emoji-popup .wl-emoji{width:48px!important;height:48px!important;max-width:48px!important;max-height:48px!important;object-fit:contain}
      #morimensWaline .wl-emoji-popup .wl-emoji-preview{width:96px!important;height:96px!important;max-width:96px!important;max-height:96px!important;object-fit:contain}
      #morimensWaline .wl-preview .wl-emoji{width:auto!important;height:2.2em!important;max-width:4.4em!important;max-height:2.2em!important;vertical-align:-.52em;object-fit:contain}
      #morimensWaline .wl-card .wl-content .wl-emoji{width:auto!important;height:64px!important;max-width:128px!important;max-height:64px!important;margin:4px 6px!important;vertical-align:middle!important;object-fit:contain}
      .morimensWalineStatus{margin:12px 0 0;color:#8794a7;font-size:11px;line-height:1.6}.morimensWalineStatus.error{color:#e69a9f}.morimensWalineStatus.loading{color:#d8c199}
      @media(max-width:900px){.dtideControls,.dtideFilters{grid-template-columns:repeat(2,minmax(0,1fr))}.dtideUsageCards{grid-template-columns:repeat(2,minmax(0,1fr))}.dtideMembers{grid-template-columns:repeat(2,minmax(0,1fr))}.dtideInsightEnlight{grid-template-columns:repeat(2,minmax(0,1fr))}.dtideSquadMembers{grid-template-columns:repeat(2,minmax(0,1fr))}.dtideCompareGrid{grid-template-columns:1fr}}
      @media(max-width:580px){.morimensTabs{position:static}.dtideControls,.dtideFilters,.dtideStatGrid,.dtideUsageCards,.dtideGearSummary,.dtideCharacterInsight{grid-template-columns:1fr}.dtideField.span2{grid-column:auto}.dtideMembers{grid-template-columns:1fr}.dtideCharacterPortrait{grid-row:auto}.dtideCharacterPortraitImage{height:360px}.dtideSquadRow{grid-template-columns:22px minmax(0,1fr)}.dtideSquadRate{grid-column:2;text-align:left;display:flex;gap:6px;align-items:baseline}.dtideSquadMembers{grid-template-columns:repeat(2,minmax(0,1fr))}#morimensWaline .wl-emoji-popup .wl-tab-wrapper>button{width:50px;height:50px;line-height:50px}#morimensWaline .wl-emoji-popup .wl-emoji{width:44px!important;height:44px!important;max-width:44px!important;max-height:44px!important}#morimensWaline .wl-emoji-popup .wl-emoji-preview{width:84px!important;height:84px!important;max-width:84px!important;max-height:84px!important}#morimensWaline .wl-card .wl-content .wl-emoji{height:56px!important;max-width:112px!important;max-height:56px!important}}
    `;document.head.appendChild(s);
  }

  function setupTabs(){
    const main=document.querySelector('main.wrap'),hero=main?.querySelector('.hero'),grid=main?.querySelector('.grid2');if(!main||!hero||!grid||$('morimensTabs'))return;
    const standalone=document.body.dataset.morimensStandalone||'';
    const source=Array.from(main.children).find(x=>x!==hero&&x!==grid&&x.matches?.('section.panel'))||null;
    if(!document.querySelector('.morimensDemoBadge')){const badge=document.createElement('div');badge.className='morimensDemoBadge';badge.textContent='demo';document.body.appendChild(badge)}
    const announcement=document.createElement('div');announcement.className='morimensAnnouncement';announcement.innerHTML='<strong>公告：</strong>目前伤害计算器已进入测试，欢迎反馈，sp小骑士已更新<br><span class="announcementDetailHint">角色名和命轮名点开有详情</span><br><span>数据来源：<a href="https://eremora.com/" target="_blank" rel="noopener noreferrer">Eremora 网站</a> · <a href="https://docs.qq.com/sheet/DR2NCWEt4b3dpU01M" target="_blank" rel="noopener noreferrer">旧版融灾425出场率在线文档</a></span><br><span><a href="https://www.bilibili.com/video/BV1MzeU66EPG/?spm_id_from=333.1387.homepage.video_card.click&vd_source=efc2a0b4226400a6761c7c467369fa05" target="_blank" rel="noopener noreferrer">视频发布：查看本次更新介绍</a></span><br><span>我不是数据的制造者，我只是节奏的搬运工。</span><br><span>没有一无是处的唤醒体，只有恨铁不成钢的守密人。</span>';
    const tabs=document.createElement('nav');tabs.id='morimensTabs';tabs.className='morimensTabs';tabs.setAttribute('role','tablist');tabs.innerHTML='<button class="morimensTab" id="morimensDtideTab" role="tab" aria-selected="true" aria-controls="morimensDtidePanel">融灾榜单</button><button class="morimensTab" id="morimensCalcTab" role="tab" aria-selected="false" aria-controls="morimensCalcPanel">伤害计算器</button><button class="morimensTab" id="morimensFortuneTab" role="tab" aria-selected="false" aria-controls="morimensFortunePanel">每日签</button><button class="morimensTab" id="morimensLoveTab" role="tab" aria-selected="false" aria-controls="morimensLovePanel">爱的节奏榜</button><button class="morimensTab" id="morimensChangelogTab" role="tab" aria-selected="false" aria-controls="morimensChangelogPanel">更新日志</button><button class="morimensTab" id="morimensCommentsTab" role="tab" aria-selected="false" aria-controls="morimensCommentsPanel">留言板</button><button class="morimensTab" id="morimensAboutTab" role="tab" aria-selected="false" aria-controls="morimensAboutPanel">关于</button>';
    const calc=document.createElement('div');calc.id='morimensCalcPanel';calc.setAttribute('role','tabpanel');calc.appendChild(grid.querySelector('[aria-labelledby="calcTitle"]'));
    const fortune=document.createElement('div');fortune.id='morimensFortunePanel';fortune.setAttribute('role','tabpanel');fortune.hidden=true;fortune.appendChild(grid.querySelector('.fortuneCard'));
    if(standalone==='calc'||standalone==='fortune'){hero.remove();main.querySelector('.topbar')?.remove();grid.remove();if(standalone==='calc'){main.appendChild(calc)}else{main.appendChild(fortune);fortune.hidden=false}return;}
    if(source)calc.appendChild(source);
    const dtide=document.createElement('div');dtide.id='morimensDtidePanel';dtide.setAttribute('role','tabpanel');dtide.innerHTML=panelHtml();
    const love=document.createElement('div');love.id='morimensLovePanel';love.setAttribute('role','tabpanel');love.hidden=true;love.innerHTML=loveRankingHtml();
    const changelog=document.createElement('div');changelog.id='morimensChangelogPanel';changelog.setAttribute('role','tabpanel');changelog.hidden=true;changelog.innerHTML=changelogHtml();
    const comments=document.createElement('div');comments.id='morimensCommentsPanel';comments.setAttribute('role','tabpanel');comments.hidden=true;comments.innerHTML=commentsHtml();
    const about=document.createElement('div');about.id='morimensAboutPanel';about.setAttribute('role','tabpanel');about.hidden=true;about.innerHTML=aboutHtml();
    hero.after(announcement,tabs,dtide,calc,fortune,love,changelog,comments,about);$('morimensBootShell')?.remove();document.body.classList.remove('morimensBooting');dtide.querySelector('.dtideLeaderboardTabs')?.addEventListener('click',e=>{const tab=e.target.closest('[data-dtide-entity]');if(!tab)return;const field=$('dtideEntityType'),entity=tab.dataset.dtideEntity;if(!field||field.value===entity)return;dtide.querySelectorAll('[data-dtide-entity]').forEach(x=>x.setAttribute('aria-selected',String(x===tab)));field.value=entity;field.dispatchEvent(new Event('change',{bubbles:true}));window.__dtideMatrixSort='total';window.__dtideMatrixAsc=false;const title=$('dtideMatrixTitle'),host=$('dtideMatrix'),label=entity==='wheel'?ui('命轮','Wheel'):entity==='creation'?ui('造物','Creation'):ui('角色','Awakener');if(title)title.textContent=zh()?label+'逐波出场率':label+' Appearance Rate by Wave';if(host)host.setAttribute('aria-busy','true');requestAnimationFrame(()=>{renderAll();if(host)host.removeAttribute('aria-busy')})});
    const activate=name=>{const isD=name==='dtide',isC=name==='calc',isF=name==='fortune',isR=name==='love',isL=name==='changelog',isM=name==='comments',isA=name==='about';for(const [id,on] of [['morimensDtideTab',isD],['morimensCalcTab',isC],['morimensFortuneTab',isF],['morimensLoveTab',isR],['morimensChangelogTab',isL],['morimensCommentsTab',isM],['morimensAboutTab',isA]])$(id).setAttribute('aria-selected',String(on));dtide.hidden=!isD;calc.hidden=!isC;fortune.hidden=!isF;love.hidden=!isR;changelog.hidden=!isL;comments.hidden=!isM;about.hidden=!isA;history.replaceState(null,'',`#${name}`);if(isD)loadOnce();if(isR){window.MorimensLoveRanking?.open?.();window.dispatchEvent(new CustomEvent('morimens-love-ranking-open'))}if(isM)initComments()};
    $('morimensDtideTab').addEventListener('click',()=>activate('dtide'));$('morimensCalcTab').addEventListener('click',()=>activate('calc'));$('morimensFortuneTab').addEventListener('click',()=>activate('fortune'));$('morimensLoveTab').addEventListener('click',()=>activate('love'));$('morimensChangelogTab').addEventListener('click',()=>activate('changelog'));$('morimensCommentsTab').addEventListener('click',()=>activate('comments'));$('morimensAboutTab').addEventListener('click',()=>activate('about'));activate(['#calc','#fortune','#love','#changelog','#comments','#about'].includes(location.hash)?location.hash.slice(1):'dtide');
  }

  function loveRankingHtml(){return `
    <section class="panel" aria-labelledby="morimensLoveRankingTitle">
      <div class="loveRankHero">
        <div>
          <p class="eyebrow">LOVE RHYTHM RANKING</p>
          <h2 id="morimensLoveRankingTitle">爱的节奏榜</h2>
          <p class="loveRankLead">给喜欢的唤醒体点赞，也可以点踩。榜单按 <b>赞 − 踩</b> 的净分实时排序，颜色深浅表示当前净分热度。</p>
        </div>
        <div class="loveRankLegend" aria-label="热力图图例"><span><i class="hot"></i>正向热度</span><span><i class="cold"></i>负向热度</span></div>
      </div>
      <div id="morimensLoveRankingStatus" class="loveRankStatus">等待载入角色数据……</div>
      <div id="morimensLoveRankingList" class="loveRankList" aria-live="polite"></div>
    </section>
  `}

  let commentsLoading=false,commentsLoaded=false;
  function commentsHtml(){return `
    <section class="panel" aria-labelledby="morimensCommentsTitle">
      <div class="morimensCommentHero">
        <p class="eyebrow">KEEPER'S MESSAGE BOARD</p>
        <h2 id="morimensCommentsTitle">守密人留言板</h2>
        <p class="morimensCommentLead">欢迎在这里交流《忘却前夜》、融灾榜单、角色配置与网页建议。留言由 Waline 提供在线存储，可跨设备查看。</p>
        <div class="morimensCommentHint"><span>匿名可用</span><span>昵称 / 邮箱非必填</span><span>最多 300 字</span><span>最新留言优先</span></div>
      </div>
      <div class="morimensWalineWrap">
        <div id="morimensWaline"></div>
        <p id="morimensWalineStatus" class="morimensWalineStatus loading">正在连接留言板……</p>
      </div>
    </section>
  `}
  async function resolveGuestbookPath(){
    const server='https://textbox.qingdengbuyi.top';
    try{
      const response=await fetch(server+'/api/comment?type=recent&count=50',{cache:'no-store'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const payload=await response.json();
      if(payload&&payload.errno)throw new Error(payload.errmsg||('Waline errno '+payload.errno));
      const rows=Array.isArray(payload?.data)?payload.data:Array.isArray(payload?.data?.data)?payload.data.data:[];
      const counts=new Map();
      for(const row of rows){
        const path=String(row?.url||row?.path||'').trim();
        if(!path||path.startsWith('/__qdby_site_views__/'))continue;
        counts.set(path,(counts.get(path)||0)+1);
      }
      for(const path of ['/','/index.html','/guestbook','/comments','/message'])if(counts.has(path))return path;
      return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||'/';
    }catch(error){
      console.warn('Waline guestbook path discovery failed, fallback to /',error);
      return '/';
    }
  }
  async function initComments(){
    if(commentsLoaded||commentsLoading)return;
    commentsLoading=true;
    const status=$('morimensWalineStatus');
    try{
      if(!document.querySelector('link[data-morimens-waline]')){
        const link=document.createElement('link');link.rel='stylesheet';link.href='https://unpkg.com/@waline/client@v3/dist/waline.css';link.dataset.morimensWaline='true';document.head.appendChild(link);
      }
      const [{init},{MORIMENS_EMOJI_PRESET},guestbookPath]=await Promise.all([import('https://unpkg.com/@waline/client@v3/dist/waline.js'),import('./waline-morimens-emoji.js?v=20260920.2'),resolveGuestbookPath()]);
      init({el:'#morimensWaline',serverURL:'https://textbox.qingdengbuyi.top',path:guestbookPath,lang:'zh-CN',emoji:[MORIMENS_EMOJI_PRESET],meta:['nick','mail','link'],requiredMeta:[],login:'disable',wordLimit:300,pageSize:10,commentSorting:'latest'});
      commentsLoaded=true;
      if(status)status.remove();
    }catch(error){
      console.error('Waline load failed',error);
      if(status){status.innerHTML=zh()?'留言板连接失败。<a href="https://textbox.qingdengbuyi.top/" target="_blank" rel="noopener noreferrer">打开原留言板</a>':'Guestbook connection failed. <a href="https://textbox.qingdengbuyi.top/" target="_blank" rel="noopener noreferrer">Open the original guestbook</a>';status.classList.remove('loading');status.classList.add('error')}
    }finally{commentsLoading=false}
  }

  function changelogHtml(){return `
    <section class="panel" aria-labelledby="morimensChangelogTitle">
      <div class="panelHead"><div><p class="eyebrow">CHANGELOG</p><h2 id="morimensChangelogTitle">更新日志</h2><p class="panelLead">记录忘忘看报的重要功能与重大更新。</p></div><span class="statusPill">持续更新</span></div>
      <div class="sourceList">
        <div class="sourceItem"><strong>2026-09-21 · 伤害计算器审查与精简</strong><br>继续同步 SKeyDB 角色、衍生卡、启灵、灵知觉醒、跨战斗成长、界域与状态伤害逻辑；修复衍生卡力量倍率与超限解析，统一灵知觉醒开关，密契默认按完整 6 件套计算；移除我方献祭层数、延迟献祭及仅用于记录但不参与当前伤害公式的冗余状态输入。</div>
        <div class="sourceItem"><strong>2026-09-21 · 融灾榜单数据与筛选修复</strong><br>统一搜索配队与榜单统计的数据口径：当前期按 UID 合并基础缓存与 Top500 增量，并同步最新排名；角色身份统一映射到 SKeyDB canonical ID，修复同一角色因游戏 ID、英文名或中文名不同而被拆分统计的问题，同时统一队伍去重、Top5 队友、助战率、界域与类型筛选。</div>
        <div class="sourceItem"><strong>2026-09-21 · 爱的节奏榜</strong><br>新增弥萨格校猫；增加“无恶意，纯节奏”免责声明；新增总分、爱数量、拉黑数量与总热度（爱 + 拉黑）四种排序方式，并保留 Waline 跨设备在线计数。</div>
        <div class="sourceItem"><strong>2026-09-20 · 留言板头像与表情</strong><br>匿名头像池扩展为全部已上传角色头像，并改为按昵称固定映射；主页与忘忘看报留言板接入《忘却前夜》自定义表情包。</div>
        <div class="sourceItem"><strong>2026-09-20 · 爱的节奏榜</strong><br>新增全角色赞踩榜：按“赞 − 踩”净分实时排序，使用热力图显示正负热度，投票数据通过 Waline 在线计数跨设备同步。</div>
        <div class="sourceItem"><strong>2026-09-20 · 留言板</strong><br>新增“留言板”标签，接入 Waline 在线留言服务，并按忘忘看报的深色玻璃质感与金色强调色进行样式适配。</div>
        <div class="sourceItem"><strong>2026-09-20 · 旧版融灾425榜单</strong><br>旧版融灾高难出场率统一更名为“旧版融灾425出场率”；旧版数据没有造物榜单，点击“造物榜单”时改为显示空状态，不再错误复用角色榜单。</div>
        <div class="sourceItem"><strong>2026-09-18 · 搜索与国际化</strong><br>搜索配队的角色选择改为支持桌面端和移动端的头像多选；新增波次筛选；实装整页中英文切换；新增更新日志标签。</div>
        <div class="sourceItem"><strong>2026-09-18 · 榜单体验</strong><br>恢复旧版稳定页面；增加界域与唤醒体类型筛选、命轮叠位比例条、角色详细启灵颜色、固定范围助战率热力图，并优化多次切换后的缓存与渲染。</div>
        <div class="sourceItem"><strong>2026-09-19 · 榜单图片下载</strong><br>为角色、命轮、造物及旧版融灾榜单增加“下载图片”功能；图片按照当前筛选与排序后的实时表格生成，并在右下角加入网站地址与 copyright@青灯不弈 水印。</div>
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
      <div class="dtideHero"><div><p class="eyebrow">EREMORA · D-ZONE ANALYTICS</p><h2 id="dtideTitle">融灾榜单</h2><p class="panelLead">更新时间节点：9月22日 01:00</p></div><span class="statusPill" id="dtideStatus">等待数据</span></div>
      <div class="dtideControls">
        <div class="dtideField"><label>期次</label><select id="dtideSeason"></select></div>
        <div class="dtideField"><label>榜单范围</label><select id="dtideRankScope"><option value="all" selected>全部范围（含未知排名）</option>${rankCaps.map(x=>`<option value="${x}">Top ${x}</option>`).join('')}</select></div>
        <div class="dtideField"><label>难度</label><select id="dtideDifficulty"><option value="all">全部难度</option>${difficultyOrder.map(x=>`<option value="${x}">${difficultyZh[x]}</option>`).join('')}</select></div>
        <div class="dtideField"><label>融灾总得分</label><select id="dtideTotalScore"><option value="all">全部分数</option><option value="520:525">520–525 分</option><option value="510:519">510–519 分</option><option value="500:509">500–509 分</option><option value="490:499">490–499 分</option><option value="480:489">480–489 分</option><option value="470:479">470–479 分</option><option value="460:469">460–469 分</option><option value="450:459">450–459 分</option><option value="440:449">440–449 分</option><option value="430:439">430–439 分</option><option value="420:429">420–429 分</option><option value="410:419">410–419 分</option><option value="400:409">400–409 分</option><option value="390:399">390–399 分</option><option value="380:389">380–389 分</option><option value="370:379">370–379 分</option><option value="360:369">360–369 分</option><option value="350:359">350–359 分</option></select></div><input id="dtideWave" type="hidden" value="all"><input id="dtideEntityType" type="hidden" value="character">
        <div class="dtideField span2"><label>界域</label><div class="dtideFilterPreset" id="dtideRealmFilters">${realmOrder.map(x=>`<button type="button" class="dtideFilterChip" data-realm="${x}"><img src="${realmIconSrc(x)}" alt="">${realmZh[x]}</button>`).join('')}</div></div>
        <div class="dtideField span2"><label>唤醒体类型</label><div class="dtideFilterPreset" id="dtideRoleFilters">${roleOrder.map(x=>`<button type="button" class="dtideFilterChip" data-role="${x}">${roleZh[x]}</button>`).join('')}</div></div>
        <input id="dtideClearType" type="hidden" value="all">
        <input id="dtideRateMode" type="hidden" value="team">
      </div>
      <div class="dtideStatGrid" id="dtideSummary"></div>
      <div id="dtideCoverageWarn" class="dtideCoverageWarn"></div>
      <div class="dtideSection"><div class="dtideSeasonDate" id="dtideSeasonDate" hidden></div><div class="dtideEntityHead"><h3 id="dtideMatrixTitle">角色逐波出场率</h3><div class="dtideEnlightLegend" id="dtideRatioLegend" aria-label="启灵颜色图例">${enlightOrder.map(key=>`<span><i style="background:${enlightColors[key]}"></i>${enlightZh[key]}</span>`).join('')}</div></div><div class="dtideLeaderboardTabs" role="tablist" aria-label="出场率榜单类型"><button type="button" class="dtideLeaderboardTab" data-dtide-entity="character" role="tab" aria-selected="true">角色榜单</button><button type="button" class="dtideLeaderboardTab" data-dtide-entity="wheel" role="tab" aria-selected="false">命轮榜单</button><button type="button" class="dtideLeaderboardTab" data-dtide-entity="creation" role="tab" aria-selected="false">造物榜单</button><label class="dtideCreationFilter"><input type="checkbox" id="dtideCreationFilter"> 筛选造物</label></div><button type="button" class="dtideTableDownload" id="dtideTableDownload">下载图片</button><div class="dtideScroll" id="dtideMatrix"></div></div>
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
  function displayCharacterName(...values){return values.find(value=>{const name=String(value||'').trim();return name&&!/^(awakener(?:-\d+)?|unknown|角色|唤醒体)$/i.test(name)})||(zh()?'未知':'Unknown')}
  function characterInfo(key,fallback={}){
    const data=window.MorimensData,liveRecords=data?.db?.records||[];
    const rec=liveRecords.find(x=>x.id===key||x.ingameId===key||x.id===fallback.skeydbId||x.ingameId===fallback.ingameId)||awakenerMap.get(key)||awakenerMap.get(fallback.skeydbId)||Array.from(awakenerMap.values()).find(x=>x.ingameId===key||x.id===fallback.skeydbId)||null;
    const id=rec?.id||fallback.skeydbId||(/^awakener-\d+$/i.test(String(key||''))?key:null),identity=data?.identityDb?.bySkeydbId?.[id]||data?.zhDb?.bySkeydbId?.[id],loc=rec&&data?.localizedProfile?.(rec);
    const portrait=rec&&data?.assetFor?.(rec,'portrait'),card=rec&&data?.assetFor?.(rec,'card');
    const displayName=zh()
      ?displayCharacterName(identity?.name,loc?.name,fallback.canonicalName,fallback.name,rec?.name)
      :displayCharacterName(rec?.name,loc?.name,fallback.canonicalName,fallback.name,identity?.englishName);
    return {name:displayName,image:portrait||localAsset(rec?.assets?.portrait||fallback.image||'','portrait'),art:card||portrait||localAsset(rec?.assets?.card||rec?.assets?.portrait||fallback.image||'','portrait'),id:id||key,ingameId:rec?.ingameId||fallback.ingameId};
  }
  function wheelName(item){return window.MorimensData?.localizedEntity?.('wheel',item)?.name||item?.name||item?.id||(zh()?'未知命轮':'Unknown Wheel')}
  const covenantZh={'Deus Ex Machina':'机械降神','Re-evolution':'再衍化','Scarlet Embrace':'猩红之拥','Crimson Pulse':'猩红之悸','Twisted Twins: Black':'扭曲双子·黑','Burial Ground\'s Sighs':'埋骨地絮语','Cursed Rabbit':'诅咒兔','Organic Form':'有机形态','Photosynthesis Ritual':'光合祭礼','Paradox':'二律背反','Returnal Line':'海归线','April Tribute':'四月礼赞','Life Drain':'生机榨取','Dream of Medicine':'入药之梦','Sweet Slug':'甜蜜蛞蝓','Ring of Chamber 36':'36室之环','Twisted Twins: White':'扭曲双子·白','Feast from Afar':'远方的欢宴','Steppenwolf':'荒原狼','Unstained Chronicle':'无垢启示录','Cocoon of the Maiden':'少女之蛹'};
  function covenantEnglishName(item){return String(item?.name||item?.canonicalName||item?.label||item?.id||item||'未识别').replace(/^"|"$/g,'').trim()}
  function covenantName(item){const en=covenantEnglishName(item);if(!zh())return en;return covenantZh[en]||window.MorimensData?.localizedEntity?.('covenant',item)?.name||en}
  const memberKey=m=>m.skeydbId||m.ingameId||m.id||m.name;
  function filterMemberKey(m){
    const raw=String(m?.skeydbId||m?.ingameId||m?.id||m?.canonicalName||m?.name||'').trim();
    const records=window.MorimensData?.db?.records||[];
    const normalizeName=value=>String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
    let rec=records.find(x=>
      (m?.skeydbId&&(x.id===m.skeydbId||x.ingameId===m.skeydbId))||
      (m?.ingameId&&(x.ingameId===m.ingameId||x.id===m.ingameId))||
      (m?.id&&(x.id===m.id||x.ingameId===m.id))
    );
    const canonical=normalizeName(m?.canonicalName||m?.name);
    if(!rec&&canonical&&!/^(awakener(?:-\d+)?|unknown|角色|唤醒体)$/i.test(canonical)){
      rec=records.find(x=>{
        const identity=window.MorimensData?.identityDb?.bySkeydbId?.[x.id];
        const localized=window.MorimensData?.localizedProfile?.(x);
        return [x.name,identity?.name,localized?.name].some(name=>normalizeName(name)===canonical);
      });
    }
    if(rec?.id)return String(rec.id);
    if(canonical&&!/^(awakener(?:-\d+)?|unknown|角色|唤醒体)$/i.test(canonical))return `name:${canonical}`;
    return raw?`raw:${raw.toLowerCase()}`:'';
  }
  function teamReplaySignature(wave,team){
    const members=(team?.members||[]).map(filterMemberKey).filter(Boolean).sort().join(',');
    return [String(wave?.wave??''),String(team?.stageName||''),String(team?.clearType||''),members].join('|');
  }
  function inheritReplayMetadata(baseRecord,nextRecord){
    if(!baseRecord||!nextRecord)return nextRecord;
    const replayBySignature=new Map();
    for(const wave of baseRecord.waves||[])for(const team of wave.teams||[]){
      const replay=String(team?.battleUuid||team?.battle_uuid||'').trim();
      if(replay)replayBySignature.set(teamReplaySignature(wave,team),team);
    }
    if(!replayBySignature.size)return nextRecord;
    let changed=false;
    const waves=(nextRecord.waves||[]).map(wave=>({...wave,teams:(wave.teams||[]).map(team=>{
      if(team?.battleUuid||team?.battle_uuid)return team;
      const previous=replayBySignature.get(teamReplaySignature(wave,team));
      const replay=String(previous?.battleUuid||previous?.battle_uuid||'').trim();
      if(!replay)return team;
      changed=true;
      return {...team,battleUuid:replay,wid:team.wid||previous?.wid||null};
    })}));
    return changed?{...nextRecord,waves}:nextRecord;
  }
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
      const difficulty=difficultyOf(team,wave),members=(team.members||[]).map(filterMemberKey).filter(Boolean).sort().join(',');
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
    const same=(value,choices)=>{if(!choices.length)return true;const raw=String(value||'').toLowerCase();return choices.some(choice=>{const target=String(choice).toLowerCase();return raw===target||raw===({chaos:'chaos',aequor:'aequor',caro:'caro',ultra:'ultra',warden:'warden',chorus:'chorus',assault:'assault'}[target]||target)})};
    return members.filter(m=>same(m.realm,realms)&&same(m.role||m.type,roles));
  }
  function awakeningMatchesFilters(member){return activeAwakenerMembers({members:[member]}).length>0}
  function legacyAwakenerMeta(name){const mapped=season?.characterMap?.[name]||{},rec=Array.from(awakenerMap.values()).find(x=>x.id===mapped.skeydbId||x.ingameId===mapped.ingameId||x.name===name||x.canonicalName===name);return {...mapped,...rec,...characterInfo(name,{name,skeydbId:mapped.skeydbId,ingameId:mapped.ingameId,image:mapped.image})}}
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
    for(const {team} of rows){const seenC=new Set(),seenW=new Set(),seenS=new Set();for(const m of team.members||[]){memberSlots++;const ck=filterMemberKey(m),ec=enlightClass(m);if(!ck)continue;countRate(enlight,ec,{name:enlightZh[ec]});const firstAppearance=!seenC.has(ck);if(firstAppearance){seenC.add(ck);countRate(chars,ck,{id:m.skeydbId||null,ingameId:m.ingameId||null,name:characterInfo(m.skeydbId||m.ingameId||m.id||m.canonicalName||m.name,m).name,image:m.image||null,borrowedCount:0});const cv=chars.get(ck);if(!cv.image&&m.image)cv.image=m.image;if(m.borrowed)cv.borrowedCount=(cv.borrowedCount||0)+1}let bc=byChar.get(ck);if(!bc){bc={key:ck,id:m.skeydbId||null,ingameId:m.ingameId||null,name:characterInfo(m.skeydbId||m.ingameId||m.id||m.canonicalName||m.name,m).name,image:m.image||null,appearances:0,levels:[],enlight:new Map(),wheels:new Map(),covs:new Map()};byChar.set(ck,bc)}else{if(!bc.id&&m.skeydbId)bc.id=m.skeydbId;if(!bc.ingameId&&m.ingameId)bc.ingameId=m.ingameId;if(!bc.image&&m.image)bc.image=m.image}if(firstAppearance){bc.appearances++;if(m.level!=null)bc.levels.push(Number(m.level));countRate(bc.enlight,ec,{name:enlightZh[ec]})}for(const w of m.wheels||[]){wheelSlots++;const wk=w.id??w.name;if(wk==null)continue;const wheelKey=String(wk);if(!seenW.has(wheelKey)){seenW.add(wheelKey);countRate(wheels,wheelKey,{id:w.id??null,name:wheelName(w),image:w.image||null,stacks:new Map()});const wheel=wheels.get(wheelKey),stackKey=wheelStackClass(w);if(!wheel.image&&w.image)wheel.image=w.image;countRate(wheel.stacks,stackKey,{name:wheelStackZh[stackKey]})}countRate(bc.wheels,wk,{id:w.id??null,name:wheelName(w),image:w.image||null})}for(const c of m.covenants||((m.covenant)?[m.covenant]:[])){covenantSlots++;const sk=c.id??c.name;if(sk==null)continue;if(!seenS.has(String(sk))){seenS.add(String(sk));countRate(covs,sk,{id:c.id??null,name:covenantName(c),image:c.image||null})}countRate(bc.covs,sk,{id:c.id??null,name:covenantName(c),image:c.image||null})}}}
    const teamCount=rows.length,finish=map=>[...map.values()].map(x=>({...x,teamRatePct:teamCount?x.count/teamCount*100:0,assistRatePct:x.count?(Number(x.borrowedCount||0)/x.count*100):0})).sort((a,b)=>b.count-a.count);
    const teammateCounts=new Map();for(const {team} of rows){const keys=[...new Set((team.members||[]).map(filterMemberKey).filter(Boolean))];for(const a of keys)for(const b of keys)if(a!==b){const m=teammateCounts.get(a)||new Map();m.set(b,(m.get(b)||0)+1);teammateCounts.set(a,m)}}
    const byCharacter=byChar;
    const bc=[...byCharacter.values()].map(x=>({...x,level:{min:x.levels.length?Math.min(...x.levels):null,max:x.levels.length?Math.max(...x.levels):null,avg:x.levels.length?x.levels.reduce((a,b)=>a+b,0)/x.levels.length:null},teammates:[...(teammateCounts.get(x.key)||new Map())].map(([key,count])=>({key,count,ratePct:x.appearances?count/x.appearances*100:0,name:characterInfo(String(key).replace(/^(?:name|raw):/,''),{name:String(key).replace(/^(?:name|raw):/,'')}).name})).sort((a,b)=>b.count-a.count),enlight:[...x.enlight.values()].map(v=>({...v,ratePct:x.appearances?v.count/x.appearances*100:0})).sort((a,b)=>b.count-a.count),wheels:[...x.wheels.values()].map(v=>({...v,ratePct:x.appearances?v.count/x.appearances*100:0})).sort((a,b)=>b.count-a.count),covenants:[...x.covs.values()].map(v=>({...v,ratePct:x.appearances?v.count/x.appearances*100:0})).sort((a,b)=>b.count-a.count)})).sort((a,b)=>b.appearances-a.appearances);
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
    for(const {team} of flattenTeams())for(const m of team.members||[]){const key=filterMemberKey(m);if(!key)continue;const x=counts.get(key)||{count:0,borrowed:0};x.count++;if(m.borrowed)x.borrowed++;counts.set(key,x)}
    return Math.max(0,...[...counts.values()].map(x=>x.count?x.borrowed/x.count*100:0));
  }

  function renderCoverage(){
    const cap=selectedRankCap(),max=maxRankAvailable(),box=$('dtideCoverageWarn');if(!box)return;
    if(!cap)box.innerHTML=zh()?'<div class="dtideNotice">当前为 <b>全部范围</b>，统计所有已下载用户，并包含暂时无法匹配榜单名次的用户。</div>':'<div class="dtideNotice">Current scope is <b>All Ranks</b>. All downloaded users are included, including users whose leaderboard rank cannot currently be matched.</div>';
    else{
      const complete=max>=cap;
      box.innerHTML=complete?'':(zh()
        ?`<div class="dtideNotice">当前快照实际抓取到的最高榜单名次为 <b>#${esc(max||'—')}</b>。Top ${cap} 统计目前属于不完整样本。</div>`
        :`<div class="dtideNotice">The current snapshot reaches rank <b>#${esc(max||'—')}</b>. Top ${cap} statistics are currently based on an incomplete sample.</div>`);
    }
    for(const opt of $('dtideRankScope')?.options||[]){
      if(opt.value==='all'||opt.value==='0'){opt.textContent=ui('全部范围（含未知排名）','All Ranks (including unknown ranks)');continue}
      const n=Number(opt.value),ok=max>=n;
      opt.textContent=`Top ${n}${ok?'':ui(' · 当前样本不足',' · incomplete sample')}`;
    }
  }
  function identityNormalizationSummary(){
    const aliases=new Map();
    for(const {team} of flattenTeams())for(const m of team.members||[]){
      const canonical=filterMemberKey(m),raw=String(memberKey(m)||'');if(!canonical||!raw)continue;
      const set=aliases.get(canonical)||new Set();set.add(raw);aliases.set(canonical,set);
    }
    const merged=[...aliases.values()].filter(set=>set.size>1).length;
    return {characters:aliases.size,mergedAliases:merged};
  }
  function renderSummary(){
    const g=currentGroup(),coverage=manifest.fieldCoverage||{},cap=selectedRankCap(),max=maxRankAvailable();
    const difficulty=$('dtideDifficulty').value,diff=zh()?(difficultyZh[difficulty]||difficultyZh.all):(difficultyEn[difficulty]||difficultyEn.all);
    $('dtideSummary').innerHTML=[
      [ui('榜单样本','Leaderboard Sample'),zh()?`${season.recordCount} 条 / 最深 #${max||'—'}`:`${season.recordCount} records / deepest #${max||'—'}`],
      [ui('当前范围','Current Scope'),rankScopeLabel(cap)],
      [ui('统计队伍','Teams Counted'),g.teamCount],
      [ui('角色槽位','Character Slots'),g.memberSlots]
    ].map(([a,b])=>`<div class="dtideStat"><small>${a}</small><strong>${esc(b)}</strong></div>`).join('');
    $('dtideStatus').textContent=zh()?`第 ${season.seasonId} 期 · ${diff} · ${rankScopeLabel(cap)}`:`Season ${season.seasonId} · ${diff} · ${rankScopeLabel(cap)}`;
    $('dtideFilterCoverage').textContent=zh()
      ?`等级 ✓ · 启灵 ${coverage.enlightenLevel?'✓':'—'} · 命轮 ${coverage.wheels?'✓':'—'} · 密契 ${coverage.covenants?'✓':'—'}`
      :`Level ✓ · Enlighten ${coverage.enlightenLevel?'✓':'—'} · Wheels ${coverage.wheels?'✓':'—'} · Covenants ${coverage.covenants?'✓':'—'}`;
    renderCoverage();
  }

const dtideHeatStyle=(rate,max=0)=>{const safeMax=Math.max(Number(max)||0,Number.EPSILON),t=Math.max(0,Math.min(1,Number(rate||0)/safeMax)),h=Math.round(215-215*t),a=(.52*t).toFixed(2);return `--dtide-heat:hsla(${h},78%,46%,${a})`};
function sortUsageRows(a,b,groups,waves){const spec=$('dtideSort')?.value||'total-desc';const m=spec.match(/^wave(\d+)-(asc|desc)$/);let av=a.total||a.count||0,bv=b.total||b.count||0;if(m){const w=Number(m[1]),g=groups?.get(w),find=x=>g?.characters?.find(y=>y.key===x.key)?.count||0;av=find(a);bv=find(b)}const d=bv-av;return spec.endsWith('-asc')?-d:d||String(a.name||a.key).localeCompare(String(b.name||b.key),'zh-CN')}
  async function downloadRenderedTable(button){
    const table=$('dtideMatrix')?.querySelector('table.dtideTable');if(!table)throw new Error(ui('当前筛选条件下没有可下载的表格','No downloadable table under the current filters'));
    const headers=[...table.querySelectorAll('thead tr:first-child th')].map(th=>({lines:th.innerText.trim().replace(/[↕↑↓]\s*$/,'').split(/\n+/).map(x=>x.trim()).filter(Boolean),color:getComputedStyle(th.querySelector('small')||th).color}));
    const body=[...table.tBodies[0]?.rows||[]].filter(tr=>!tr.classList.contains('dtideLegacyDetailRow')).map(tr=>[...tr.cells].map(td=>{
      const image=td.querySelector('img:not([hidden])'),bar=td.querySelector('.dtideRatioBar,.dtideEnlightBar');
      return {text:(td.querySelector('.dtideChar > span')?.innerText||td.innerText||'').trim(),image:image?.getAttribute('src')||'',color:getComputedStyle(td).color,background:getComputedStyle(td).backgroundColor,bar:bar?[...bar.children].map(part=>({color:getComputedStyle(part).backgroundColor,width:parseFloat(getComputedStyle(part).width)||0})):null};
    }));
    if(!headers.length||!body.length)throw new Error(ui('当前筛选条件下没有可下载的表格','No downloadable table under the current filters'));
    const title=season?.legacy?ui('旧版融灾425出场率（来源：@却尘）','Legacy D-Zone 425 Appearance Rate (source: @却尘)'):(zh()?`第 ${season?.seasonId||''} 期 · ${$('dtideMatrixTitle')?.textContent||'融灾榜单'}`:`Season ${season?.seasonId||''} · ${$('dtideMatrixTitle')?.textContent||'D-Zone Ranking'}`);
    const selectedLabel=id=>$(id)?.selectedOptions?.[0]?.textContent?.trim()||'';
    const status=season?.legacy?(zh()?`排序：${headers.find((_,i)=>table.querySelectorAll('thead th')[i]?.querySelector('[data-legacy-sort]')?.textContent?.includes('↓'))?.lines.join(' ')||'当前排序'}`:`Sort: ${headers.find((_,i)=>table.querySelectorAll('thead th')[i]?.querySelector('[data-legacy-sort]')?.textContent?.includes('↓'))?.lines.join(' ')||'current order'}`):[selectedLabel('dtideDifficulty'),selectedLabel('dtideRankScope'),selectedLabel('dtideTotalScore'),$('dtideRateMode')?.value==='slot'?ui('角色槽位率','Character Slot Rate'):ui('队伍出场率','Team Appearance Rate')].filter(Boolean).join(' · ');
    button.disabled=true;button.textContent=ui('正在生成图片…','Generating image…');
    try{
      const pad=36,nameWidth=240,colWidths=headers.map((h,i)=>i===0?nameWidth:Math.max(114,Math.min(205,Math.max(...h.lines.map(s=>s.length),0)*13+28))),width=pad*2+colWidths.reduce((a,b)=>a+b,0),rowHeight=46,headerY=142,headerHeight=78,footerHeight=108;
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=headerY+headerHeight+body.length*rowHeight+footerHeight;
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error(ui('浏览器不支持图片导出','This browser does not support image export'));
      ctx.fillStyle='#0e1624';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.textBaseline='middle';ctx.textAlign='left';ctx.fillStyle='#f1d69f';ctx.font='bold 27px system-ui,sans-serif';ctx.fillText(title,pad,45,width-pad*2);
      ctx.fillStyle='#b8c5d6';ctx.font='16px system-ui,sans-serif';ctx.fillText(status,pad,86,width-pad*2);
      ctx.fillText(zh()?`当前表格 · ${body.length} 条`:`Current table · ${body.length} rows`,pad,116);
      const xPositions=colWidths.map((_,i)=>pad+colWidths.slice(0,i).reduce((a,b)=>a+b,0));
      ctx.fillStyle='#192638';ctx.fillRect(pad,headerY,width-pad*2,headerHeight);
      headers.forEach((h,i)=>{ctx.textAlign=i?'center':'left';ctx.font='bold 16px system-ui,sans-serif';h.lines.forEach((line,j)=>{ctx.fillStyle=j&&h.lines.length>1?h.color:'#f0f4fa';ctx.fillText(line,xPositions[i]+(i?colWidths[i]/2:12),headerY+headerHeight/2+(j-(h.lines.length-1)/2)*23,colWidths[i]-18)})});
      const sources=[...new Set(body.flat().map(c=>c.image).filter(Boolean))];
      const images=new Map(await Promise.all(sources.map(async src=>{try{const url=new URL(src,document.baseURI);if(url.origin!==location.origin)return [src,null];const img=new Image();img.src=url.href;await img.decode();return [src,img]}catch{return [src,null]}})));
      body.forEach((cells,r)=>{const y=headerY+headerHeight+r*rowHeight;ctx.fillStyle=r%2?'#152031':'#111b2a';ctx.fillRect(pad,y,width-pad*2,rowHeight);
        cells.forEach((c,i)=>{const x=xPositions[i],w=colWidths[i];if(c.background&&c.background!=='rgba(0, 0, 0, 0)'&&c.background!=='transparent'){ctx.fillStyle=c.background;ctx.fillRect(x,y,w,rowHeight)}
          const img=images.get(c.image);if(img){ctx.save();ctx.beginPath();ctx.roundRect(x+8,y+7,32,32,6);ctx.clip();ctx.drawImage(img,x+8,y+7,32,32);ctx.restore()}
          if(c.bar?.length){const sum=c.bar.reduce((a,b)=>a+b.width,0)||1,bw=Math.min(74,w-24);let bx=x+(w-bw)/2;c.bar.forEach(part=>{ctx.fillStyle=part.color;ctx.fillRect(bx,y+rowHeight/2-4,bw*part.width/sum,8);bx+=bw*part.width/sum})}
          ctx.textAlign=i?'center':'left';ctx.font='bold 15px system-ui,sans-serif';ctx.fillStyle=c.color&&c.color!=='rgba(0, 0, 0, 0)'?c.color:'#edf2f7';ctx.fillText(c.text,x+(i?w/2:(img?47:12)),y+rowHeight/2,w-(img?55:18));
        });ctx.fillStyle='rgba(148,163,184,.13)';ctx.fillRect(pad,y+rowHeight-1,width-pad*2,1);
      });
      ctx.textAlign='right';ctx.fillStyle='#b8c5d6';ctx.font='15px system-ui,sans-serif';ctx.fillText('https://qingdengbuyi.top/morimens-tools.html#dtide',width-pad,canvas.height-58);
      ctx.fillStyle='#f1d69f';ctx.font='bold 16px system-ui,sans-serif';ctx.fillText('copyright@青灯不弈',width-pad,canvas.height-27);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error(ui('图片生成失败','Image generation failed'));
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=zh()?`融灾榜单-${season?.legacy?'旧版':season?.seasonId||'当前'}-${$('dtideEntityType')?.value||'角色'}.png`:`dzone-ranking-${season?.legacy?'legacy':season?.seasonId||'current'}-${$('dtideEntityType')?.value||'character'}.png`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    }finally{button.disabled=false;button.textContent=ui('下载图片','Download Image')}
  }
  function legacyDetailExtras(name,periods){
    const data=legacyStructured?.characters?.[name]||{},assist=data.assistRates||{},teamTotal=Number(data.teamTotal||0),realmColor={混沌:'#e7b65c',超维:'#b98cff',深海:'#5cb8ff',血肉:'#ff7180'},teamMap=new Map();for(const team of data.topTeams||[]){if(!Array.isArray(team.characters)||team.characters.length!==4)continue;const characters=[...team.characters].sort((a,b)=>String(a).localeCompare(String(b),'zh-CN')),key=characters.join('|'),row=teamMap.get(key)||{characters,count:0,periods:new Set()};row.count+=Number(team.count||0);if(team.period)row.periods.add(String(team.period));teamMap.set(key,row)}const teams=[...teamMap.values()].sort((a,b)=>b.count-a.count||a.characters.join('/').localeCompare(b.characters.join('/'),'zh-CN')).slice(0,10);
    const squads=teams.map((team,index)=>{
      const members=(team.characters||[]).map(role=>{
        const meta=characterInfo(role,{name:role,skeydbId:season.characterMap?.[role]?.skeydbId,ingameId:season.characterMap?.[role]?.ingameId,image:season.characterMap?.[role]?.image});
        return {role,name:meta.name||role,image:meta.image||''};
      });
      const targetIndex=members.findIndex(member=>member.role===name);
      if(targetIndex>0)members.unshift(...members.splice(targetIndex,1));
      const denominator=teamTotal,rate=denominator?Number(team.count||0)/denominator*100:null;
      return '<div class="dtideSquadRow"><span class="dtideSquadRank">'+(index+1)+'</span><div class="dtideSquadMembers">'+members.map(member=>'<div class="dtideSquadMember">'+(member.image?'<img src="'+esc(member.image)+'" alt="" loading="lazy">':'')+'<span title="'+esc(member.name)+'">'+esc(member.name)+'</span></div>').join('')+'</div><div class="dtideSquadRate" title="'+esc(Number(team.count||0)+' / '+(denominator||0)+(zh()?' 支含该角色队伍':' teams containing this Awakener'))+'"><b>'+(rate!=null?rate.toFixed(1)+'%':'—')+'</b><small>'+Number(team.count||0)+' '+ui('次','times')+'</small></div></div>';
    }).join('')||'<div class="dtideEmpty">暂无配队数据</div>';
    const assistPeriods=periods.filter(p=>Number(p.teamCount||0)>0),assistHtml=assistPeriods.map(p=>'<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 8px;border-bottom:1px solid rgba(166,193,224,.1)"><span>'+esc(p.date)+' <b class="dtideAssistRealm" style="color:'+(realmColor[p.realm]||'#dbe8f7')+'">【'+esc(p.realm)+'】</b></span><strong>'+((Number(assist[p.label]||0)*100).toFixed(2))+'%</strong></div>').join('');
    return '<div class="dtideLegacyExtra" style="position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1.5fr) minmax(260px,1fr);gap:12px;margin:12px 12px 16px;text-align:left"><section class="dtideInsightPanel" style="min-width:0;background:rgba(12,20,33,.94)"><h4>常用配队 Top 10 <small>完整四人队</small></h4><div class="dtideSquadList">'+squads+'</div></section><section class="dtideInsightPanel" style="min-width:0;background:rgba(12,20,33,.94)"><h4>每期助战使用率</h4><div class="dtideAssistRows">'+assistHtml+'</div></section></div>';
  }
  function legacyWheelCell(name,wheel){
    const source=String(wheel?.image||''),image=localAsset(source,'wheel');
    return '<span class="dtideChar">'+(image?'<img class="dtideGearIcon" src="'+esc(image)+'" data-fallback="'+esc(source)+'" referrerpolicy="no-referrer" loading="lazy" onerror="if(this.dataset.fallback&&this.src!==this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback=\'\'}else{this.hidden=true}" alt="">':'')+'<span>'+esc(name)+'</span></span>';
  }
  function renderLegacyWheelMatrix(){
    const host=$('dtideMatrix'),legacy=season?.legacyRates;if(!host||!legacy)return false;
    const periods=(legacyStructured?.periods||[]).filter(p=>Number(p.teamCount)>0).map((p,i)=>({wave:i+1,label:p.key,key:p.key,date:p.label,realm:p.realm,teamCount:Number(p.teamCount)||0,wheelRates:p.wheelRates||{}}));
    const wheels=legacyStructured?.wheels||{};
    const periodRate=(name,period)=>Number(period?.wheelRates?.[name]??wheels[name]?.rates?.[period?.key]??0)||0;
    const weightedAverage=name=>{let weighted=0,people=0;for(const period of periods){const population=period.teamCount/10;if(population<=0)continue;weighted+=periodRate(name,period)*population;people+=population}return people?weighted/people:0};
    const names=Object.keys(wheels).filter(name=>{const clean=String(name).trim();return clean&&!/^(?:[（(]?\s*(?:空|empty|null|undefined)\s*[）)]?)$/i.test(clean)&&Boolean(wheels[name]?.image)&&periods.some(period=>periodRate(name,period)>0)});
    const sortKey=window.__legacyMatrixSort||'avg',ascending=Boolean(window.__legacyMatrixAscending),value=(name,key)=>key==='avg'?weightedAverage(name):periodRate(name,periods[Number(key)-1]);
    names.sort((a,b)=>{const d=value(a,sortKey)-value(b,sortKey);return (ascending?d:-d)||a.localeCompare(b,'zh-CN')});
    const realmColor={混沌:'#e7b65c',超维:'#b98cff',深海:'#5cb8ff',血肉:'#ff7180'},rate=v=>Number.isFinite(Number(v))?((Number(v)*100).toFixed(2)+'%'):'—',arrow=key=>sortKey===key?(ascending?' ↑':' ↓'):' ↕',head=(label,key)=>'<button type="button" class="dtideSortHead" data-legacy-sort="'+key+'">'+label+arrow(key)+'</button>';
    const max=Math.max(...names.flatMap(n=>periods.map(p=>periodRate(n,p))),0);
    host.innerHTML='<table class="dtideTable"><thead><tr><th class="dtideLegacyRank">'+ui('排名','Rank')+'</th><th>'+ui('命轮','Wheel')+'</th>'+periods.map(x=>'<th>'+head('<strong>'+esc(x.date)+'</strong><br><small style="color:'+(realmColor[x.realm]||'#fff')+';font-weight:800">【'+esc(x.realm)+'】</small>',x.wave)+'</th>').join('')+'<th>'+head(ui('平均出场率','Average Appearance Rate'),'avg')+'</th></tr></thead><tbody>'+names.map((name,index)=>{const vals=periods.map(p=>periodRate(name,p)),avg=weightedAverage(name);return '<tr><td class="dtideLegacyRank">'+(index+1)+'</td><td><div class="dtideRankedItem">'+legacyWheelCell(name,wheels[name])+'</div></td>'+vals.map(v=>'<td class="dtideRate dtideHeat" style="'+dtideHeatStyle(v,max)+';color:#fff;font-weight:800">'+rate(v)+'</td>').join('')+'<td class="dtideRate" style="color:#fff;font-weight:800">'+rate(avg)+'</td></tr>'}).join('')+'</tbody></table>';
    host.onclick=e=>{const button=e.target.closest('[data-legacy-sort]');if(!button)return;const key=button.dataset.legacySort;if(window.__legacyMatrixSort===key)window.__legacyMatrixAscending=!window.__legacyMatrixAscending;else{window.__legacyMatrixSort=key;window.__legacyMatrixAscending=false}renderLegacyMatrix()};
    if($('dtideMatrixTitle'))$('dtideMatrixTitle').textContent=ui('命轮逐期高难出场率','Wheel High-Difficulty Appearance Rate by Period');
    if($('dtideStatus'))$('dtideStatus').textContent=ui('旧版融灾425出场率（来源：@却尘）','Legacy D-Zone 425 Appearance Rate (source: @却尘)');
    if($('dtideSummary'))$('dtideSummary').innerHTML=[[ui('数据来源','Source'),'却尘'],[ui('统计命轮','Wheels Counted'),names.length],[ui('统计期次','Periods Counted'),periods.length],[ui('指标','Metric'),ui('高难出场率','High-Difficulty Appearance Rate')]].map(([a,b])=>'<div class="dtideStat"><small>'+a+'</small><strong>'+esc(b)+'</strong></div>').join('');
    if($('dtideCoverageWarn'))$('dtideCoverageWarn').innerHTML=ui('<div class="dtideNotice">命轮出场率按“该期命轮总使用次数 ÷ 统计总人数”计算；统计总人数 = 队伍总数 ÷ 10。平均出场率按各期统计人数加权，首期无命轮数据，不参与统计。</div>','<div class="dtideNotice">Wheel appearance rate = total Wheel uses in the period ÷ counted players; counted players = total teams ÷ 10. Average appearance rate is weighted by the counted population of each period. The first period has no Wheel data and is excluded.</div>');
    return true;
  }
  function renderLegacyMatrix(){
    const host=$('dtideMatrix'),legacy=season?.legacyRates,entity=$('dtideEntityType')?.value||'character';if(!host||!legacy)return false;
    if(entity==='wheel')return renderLegacyWheelMatrix();
    if(entity==='creation'){
      host.innerHTML='<div class="dtideEmpty">'+ui('旧版融灾425出场率暂无造物榜单数据。','No Creation ranking data is available for the legacy D-Zone 425 dataset.')+'</div>';
      host.onclick=null;
      if(host.__legacyResizeHandler){window.removeEventListener('resize',host.__legacyResizeHandler);host.__legacyResizeHandler=null}
      if($('dtideStatus'))$('dtideStatus').textContent=ui('旧版融灾425出场率（来源：@却尘）','Legacy D-Zone 425 Appearance Rate (source: @却尘)');
      if($('dtideCoverageWarn'))$('dtideCoverageWarn').innerHTML='<div class="dtideNotice">'+ui('旧版融灾425出场率没有可用的造物榜单数据，因此该榜单保持为空。','The legacy D-Zone 425 dataset has no usable Creation ranking data, so this ranking remains empty.')+'</div>';
      return true;
    }
    const allLegacyNames=[...new Set(legacy.flatMap(period=>Object.keys(period.rates||{})))],names=allLegacyNames.filter(name=>awakeningMatchesFilters(legacyAwakenerMeta(name))).sort((a,b)=>a.localeCompare(b,'zh-CN'));
    const rows=legacy.flatMap((period,index)=>Object.entries(period.rates||{}).map(([name,rate])=>({name,rate:Number(rate)||0,wave:index+1,label:period.label}))),max=Math.max(...rows.map(x=>x.rate),0);
    const periodDisplay=[['4.13-4.26','混沌'],['4.27-5.10','超维'],['5.11-5.24','深海'],['5.25-6.7','血肉'],['6.7-6.21','超维'],['6.22-7.5','深海'],['7.6-7.19','血肉'],['7.20-8.2','混沌'],['8.3-8.16','深海']];
    const periods=legacy.map((x,i)=>({wave:i+1,label:legacyStructured?.periods?.[i]?.key||x.label,date:legacyStructured?.periods?.[i]?.label||periodDisplay[i]?.[0]||x.label,realm:legacyStructured?.periods?.[i]?.realm||periodDisplay[i]?.[1]||'',teamCount:Number(legacyStructured?.periods?.[i]?.teamCount||0)}));
    const cell=(name,w)=>rows.find(x=>x.name===name&&x.wave===w)?.rate||0;
    const sortKey=window.__legacyMatrixSort||'avg',ascending=Boolean(window.__legacyMatrixAscending),value=(name,key)=>key==='avg'?periods.reduce((sum,p)=>sum+cell(name,p.wave),0)/(periods.length||1):cell(name,Number(key));
    names.sort((a,b)=>{const d=value(a,sortKey)-value(b,sortKey);return (ascending?d:-d)||a.localeCompare(b,'zh-CN')});
    const realmColor={混沌:'#e7b65c',超维:'#b98cff',深海:'#5cb8ff',血肉:'#ff7180'},rate=v=>Number.isFinite(Number(v))?`${(Number(v)*100).toFixed(2)}%`:'—',arrow=key=>sortKey===key?(ascending?' ↑':' ↓'):' ↕',head=(label,key)=>`<button type="button" class="dtideSortHead" data-legacy-sort="${key}" title="${ui('点击切换升降序','Toggle ascending / descending')}">${label}${arrow(key)}</button>`;
    const ranks=new Map(periods.map((p,i)=>{const order=Object.entries(legacy[i]?.rates||{}).sort((a,b)=>Number(b[1])-Number(a[1]));return [p.wave,new Map(order.map((x,index)=>[x[0],index+1]))]}));
    const drawChart=(detail,name,table)=>{
      const svg=detail.querySelector('svg'),bounds=svg.getBoundingClientRect(),headers=[...table.querySelectorAll('thead th')].slice(2,periods.length+2);
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
        <text x="${axis}" y="${top-10}" fill="#d2e4f8" font-size="12" font-weight="700" text-anchor="middle">${ui('排名','Rank')}</text>
        <polyline fill="none" stroke="#91d2fa" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${values.map((rank,i)=>`${xs[i]},${y(rank)}`).join(' ')}"/>
        ${values.map((rank,i)=>`<circle cx="${xs[i]}" cy="${y(rank)}" r="5" fill="${realmColor[periods[i].realm]||'#8fd3ff'}" stroke="#e8f5ff" stroke-width="1.5"><title>${esc(periods[i].date)}【${esc(periods[i].realm)}】：${zh()?`第 ${rank} 名`:`Rank ${rank}`} · ${rate(cell(name,periods[i].wave))}</title></circle><text x="${xs[i]}" y="${Math.max(17,y(rank)-11)}" fill="#f2f7ff" font-size="12" font-weight="700" text-anchor="middle">${rank}</text><text x="${xs[i]}" y="${height-16}" fill="${realmColor[periods[i].realm]||'#c8d8ec'}" font-size="11" font-weight="600" text-anchor="middle">${esc(periods[i].date)}</text>`).join('')}`;
    };
    host.innerHTML=`<table class="dtideTable"><thead><tr><th class="dtideLegacyRank">${ui('排名','Rank')}</th><th>${ui('角色','Awakener')}</th>${periods.map(x=>`<th>${head(`<strong>${esc(x.date)}</strong><br><small style="color:${realmColor[x.realm]||'#fff'};font-weight:800">【${esc(x.realm)}】</small>`,x.wave)}</th>`).join('')}<th>${head(ui('平均出场率','Average Appearance Rate'),'avg')}</th></tr></thead><tbody>${names.map((name,index)=>{const info=characterInfo(name,{name,skeydbId:season.characterMap?.[name]?.skeydbId,image:season.characterMap?.[name]?.image});const vals=periods.map(x=>cell(name,x.wave)),avg=vals.reduce((a,b)=>a+b,0)/(vals.length||1);return `<tr data-legacy-character="${esc(name)}"><td class="dtideLegacyRank">${index+1}</td><td><div class="dtideRankedItem"><span class="dtideChar">${info.image?`<img src="${esc(info.image)}" alt="" loading="lazy">`:''}<span>${esc(info.name||name)}</span></span></div></td>${vals.map(v=>`<td class="dtideRate dtideHeat" style="${dtideHeatStyle(v,max)};color:#fff;font-weight:800">${rate(v)}</td>`).join('')}<td class="dtideRate" style="color:#fff;font-weight:800">${rate(avg)}</td></tr>`}).join('')}</tbody></table>`;
    host.onclick=e=>{
      const button=e.target.closest('[data-legacy-sort]');
      if(button){const key=button.dataset.legacySort;if(window.__legacyMatrixSort===key)window.__legacyMatrixAscending=!window.__legacyMatrixAscending;else{window.__legacyMatrixSort=key;window.__legacyMatrixAscending=false}return renderLegacyMatrix()}
      const row=e.target.closest('[data-legacy-character]');if(!row)return;
      const old=row.nextElementSibling;if(old?.classList.contains('dtideLegacyDetailRow'))return old.remove();
      const name=row.dataset.legacyCharacter,detail=document.createElement('tr');
      detail.className='dtideLegacyDetailRow';
      detail.innerHTML=`<td colspan="${periods.length+3}"><div class="dtideLegacyDetail"><strong>${esc(name)} · ${ui('各期出场率排名变化','Appearance-rank changes by period')}</strong><svg role="img" aria-label="${esc(name)} ${ui('各期排名折线图','rank trend by period')}"></svg>`+legacyDetailExtras(name,periods)+`</div></td>`;
      row.after(detail);
      const mapped=season.characterMap?.[name]||{},character=characterInfo(name,{name,skeydbId:mapped.skeydbId,ingameId:mapped.ingameId,image:mapped.image}),cg=String(character.art||character.image||'').trim();
      if(cg){const card=cg.replace('/portraits/','/cards/');detail.querySelector('.dtideLegacyDetail').style.setProperty('--legacy-cg',`url("${card.replace(/"/g,'\\\"')}")`)}
      drawChart(detail,name,row.closest('table'));
    };
    if(host.__legacyResizeHandler)window.removeEventListener('resize',host.__legacyResizeHandler);
    host.__legacyResizeHandler=()=>{const table=host.querySelector('table');if(!table)return;for(const detail of table.querySelectorAll('.dtideLegacyDetailRow'))drawChart(detail,detail.previousElementSibling?.dataset.legacyCharacter,table)};
    window.addEventListener('resize',host.__legacyResizeHandler);
    if($('dtideMatrixTitle'))$('dtideMatrixTitle').textContent=ui('角色逐期高难出场率','Awakener High-Difficulty Appearance Rate by Period');
    if($('dtideStatus'))$('dtideStatus').textContent=ui('旧版融灾425出场率（来源：@却尘）','Legacy D-Zone 425 Appearance Rate (source: @却尘)');
    if($('dtideSummary'))$('dtideSummary').innerHTML=[[ui('数据来源','Source'),'却尘'],[ui('统计角色','Awakeners Counted'),names.length],[ui('统计期次','Periods Counted'),periods.length],[ui('指标','Metric'),ui('高难出场率','High-Difficulty Appearance Rate')]].map(([a,b])=>`<div class="dtideStat"><small>${a}</small><strong>${esc(b)}</strong></div>`).join('');
    if($('dtideCoverageWarn'))$('dtideCoverageWarn').innerHTML=zh()?`<div class="dtideNotice">旧版融灾425出场率数据来源：<a href="${esc(season.sourceUrl)}" target="_blank" rel="noopener noreferrer">在线文档</a>。<br><small>出场率计算：使用次数 ÷ 统计人数；命轮按每人 10 队折算，使用次数 ÷（总队伍数 ÷ 10）计算。</small></div>`:`<div class="dtideNotice">Legacy D-Zone 425 data source: <a href="${esc(season.sourceUrl)}" target="_blank" rel="noopener noreferrer">online document</a>.<br><small>Appearance rate = uses ÷ counted players. Wheel rate uses 10 teams per player: uses ÷ (total teams ÷ 10).</small></div>`;
    return true;
  }
  function renderMatrix(){
    if((season?.legacy||season?.legacyRates||legacyStructured)&&renderLegacyMatrix())return;
    const cap=selectedRankCap(),difficulty=$('dtideDifficulty')?.value||'all',ct=$('dtideClearType')?.value||'all',mode=$('dtideRateMode')?.value||'team',entity=$('dtideEntityType')?.value||'character';
    const analysis=currentAnalysis(),all=analysis.rows,waves=analysis.waves,groups=analysis.groups,host=$('dtideMatrix');if(!host)return;
    const legend=$('dtideRatioLegend');
    if(legend){if(entity==='creation'){legend.innerHTML='';legend.removeAttribute('aria-label')}else{const order=entity==='wheel'?wheelStackOrder:enlightOrder,labels=entity==='wheel'?(zh()?wheelStackZh:wheelStackEn):(zh()?enlightZh:enlightEn),colors=entity==='wheel'?wheelStackColors:enlightColors;legend.innerHTML=order.map(key=>`<span><i style="background:${colors[key]}"></i>${labels[key]}</span>`).join('');legend.setAttribute('aria-label',entity==='wheel'?ui('命轮叠位颜色图例','Wheel Stack Color Legend'):ui('启灵颜色图例','Enlighten Color Legend'))}}
    if(entity==='wheel'){
      const union=new Map();for(const [,g] of groups)for(const wheel of g.wheels||[]){const old=union.get(wheel.key);union.set(wheel.key,old?{...old,...wheel,image:wheel.image||old.image}:{...wheel})}
      const rows=[...union.values()].map(wheel=>{const stackCounts=new Map();for(const [,g] of groups){const hit=(g.wheels||[]).find(x=>x.key===wheel.key);for(const stack of hit?.stacks||[])stackCounts.set(stack.key,(stackCounts.get(stack.key)||0)+Number(stack.count||0))}return {...wheel,total:waves.reduce((sum,w)=>sum+((groups.get(w)?.wheels||[]).find(x=>x.key===wheel.key)?.count||0),0),stacks:wheelStackOrder.map(key=>({key,name:(zh()?wheelStackZh:wheelStackEn)[key],count:stackCounts.get(key)||0}))}});
      const sortKey=window.__dtideMatrixSort||'total',asc=window.__dtideMatrixAsc||false;rows.sort((a,b)=>{const av=sortKey==='total'?a.total:((groups.get(Number(sortKey))?.wheels||[]).find(x=>x.key===a.key)?.count||0),bv=sortKey==='total'?b.total:((groups.get(Number(sortKey))?.wheels||[]).find(x=>x.key===b.key)?.count||0),d=bv-av;return (asc?-d:d)||String(a.name||a.key).localeCompare(String(b.name||b.key),'zh-CN')});
      const waveHeatMax=new Map(waves.map(w=>[w,Math.max(0,...(groups.get(w)?.wheels||[]).map(x=>Number(x.teamRatePct)||0))]));
      const arrow=k=>k===sortKey?(asc?' ↑':' ↓'):' ↕',ratioBar=wheel=>{const total=wheel.stacks.reduce((sum,x)=>sum+x.count,0)||1;return `<div class="dtideRatioBar" title="${wheel.stacks.map(x=>`${(zh()?wheelStackZh:wheelStackEn)[x.key]} ${pct(x.count/total*100)}`).join(' · ')}">${wheel.stacks.filter(x=>x.count>0).map(x=>`<span style="width:${x.count/total*100}%;background:${wheelStackColors[x.key]}"></span>`).join('')}</div>`};if(!rows.length){host.innerHTML=`<div class="dtideEmpty">${ui('当前口径暂无命轮记录。','No Wheel records for the current scope.')}</div>`;return}
      host.innerHTML=`<table class="dtideTable"><thead><tr><th>${ui('命轮','Wheel')}</th><th>${ui('叠位比例','Stack Distribution')}</th>${waves.map(w=>`<th><button type="button" class="dtideSortHead" data-sort-key="${w}" title="${ui('点击切换升降序','Toggle ascending / descending')}">Wave ${w}${arrow(String(w))}</button></th>`).join('')}<th><button type="button" class="dtideSortHead" data-sort-key="total" title="${ui('点击切换升降序','Toggle ascending / descending')}">${ui('总出现','Total Appearances')}${arrow('total')}</button></th></tr></thead><tbody>${rows.map(wheel=>`<tr><td><div class="dtideChar">${wheel.image?`<img class="dtideGearIcon" src="${esc(localAsset(wheel.image,'wheel'))}" alt="" loading="lazy" onerror="this.hidden=true">`:''}<span>${esc(wheel.name||wheel.key)}</span></div></td><td>${ratioBar(wheel)}</td>${waves.map(w=>{const hit=(groups.get(w)?.wheels||[]).find(x=>x.key===wheel.key),rate=hit?.teamRatePct||0;return `<td class="dtideRate dtideHeat" style="${dtideHeatStyle(rate,waveHeatMax.get(w))}">${pct(rate)}</td>`}).join('')}<td>${wheel.total}</td></tr>`).join('')}</tbody></table>`;
      host.onclick=e=>{const btn=e.target.closest('[data-sort-key]');if(!btn)return;const key=String(btn.dataset.sortKey);if(window.__dtideMatrixSort===key)window.__dtideMatrixAsc=!window.__dtideMatrixAsc;else{window.__dtideMatrixSort=key;window.__dtideMatrixAsc=false}renderMatrix()};return;
    }
    if(entity==='creation'){
      const filterCreations=$('dtideCreationFilter')?.checked,creationGroup=rows=>{const map=new Map();for(const {team} of rows){const seen=new Set();for(const item of team.creations||[]){const key=String(item.id??item.name??''),name=String(item.name||'').replace(/^"|"$/g,'').trim();if(!key||seen.has(key)||(filterCreations&&(/^Dimensional Image(?::|$)/i.test(name)||/^维度影像(?:：|$)/.test(name)||/^(?:Rusted Key|锈蚀钥匙)$/i.test(name))))continue;seen.add(key);const old=map.get(key)||{key,name:item.name||key,image:item.image||'',count:0};old.count++;if(!old.image&&item.image)old.image=item.image;map.set(key,old)}}const denom=rows.length||1;return [...map.values()].map(x=>({...x,teamRatePct:x.count/denom*100})).filter(x=>!filterCreations||x.teamRatePct<100)},waveGroups=new Map(waves.map(w=>[w,creationGroup(all.filter(x=>Number(x.wave.wave)===w))])),union=new Map();
      for(const [,items]of waveGroups)for(const item of items){const old=union.get(item.key);union.set(item.key,old?{...old,...item,image:item.image||old.image}:{...item})}
      const rows=[...union.values()].map(item=>({...item,total:waves.reduce((sum,w)=>sum+(waveGroups.get(w)?.find(x=>x.key===item.key)?.count||0),0)})),sortKey=window.__dtideMatrixSort||'total',asc=window.__dtideMatrixAsc||false;
      rows.sort((a,b)=>{const av=sortKey==='total'?a.total:(waveGroups.get(Number(sortKey))?.find(x=>x.key===a.key)?.count||0),bv=sortKey==='total'?b.total:(waveGroups.get(Number(sortKey))?.find(x=>x.key===b.key)?.count||0),d=bv-av;return (asc?-d:d)||String(a.name||a.key).localeCompare(String(b.name||b.key),'zh-CN')});
      const waveHeatMax=new Map(waves.map(w=>[w,Math.max(0,...(waveGroups.get(w)||[]).map(x=>Number(x.teamRatePct)||0))])),arrow=k=>k===sortKey?(asc?' ↑':' ↓'):' ↕';
      if(!rows.length){host.innerHTML=`<div class="dtideEmpty">${ui('当前口径暂无造物记录。','No Creation records for the current scope.')}</div>`;return}
      host.innerHTML=`<table class="dtideTable"><thead><tr><th>${ui('造物','Creation')}</th>${waves.map(w=>`<th><button type="button" class="dtideSortHead" data-sort-key="${w}" title="${ui('点击切换升降序','Toggle ascending / descending')}">Wave ${w}${arrow(String(w))}</button></th>`).join('')}<th><button type="button" class="dtideSortHead" data-sort-key="total" title="${ui('点击切换升降序','Toggle ascending / descending')}">${ui('总出现','Total Appearances')}${arrow('total')}</button></th></tr></thead><tbody>${rows.map(item=>`<tr><td><div class="dtideChar">${item.image&&localAsset(item.image,'creation')?`<img class="dtideGearIcon" src="${esc(localAsset(item.image,'creation'))}" alt="" loading="lazy" onerror="this.hidden=true">`:''}<span>${esc(item.name)}</span></div></td>${waves.map(w=>{const hit=waveGroups.get(w)?.find(x=>x.key===item.key),rate=hit?.teamRatePct||0;return `<td class="dtideRate dtideHeat" style="${dtideHeatStyle(rate,waveHeatMax.get(w))}">${pct(rate)}</td>`}).join('')}<td>${item.total}</td></tr>`).join('')}</tbody></table>`;
      host.onclick=e=>{const btn=e.target.closest('[data-sort-key]');if(!btn)return;const key=String(btn.dataset.sortKey);if(window.__dtideMatrixSort===key)window.__dtideMatrixAsc=!window.__dtideMatrixAsc;else{window.__dtideMatrixSort=key;window.__dtideMatrixAsc=false}renderMatrix()};
      return;
    }
    const union=new Map();
    for(const [,g] of groups)for(const c of g.characters)union.set(c.key,c);
    for(const rec of currentSeasonRosterSupplements()){
      if(!awakeningMatchesFilters(rec))continue;
      const key=String(rec.id);
      if(union.has(key))continue;
      const info=characterInfo(rec.id,rec);
      union.set(key,{key,id:rec.id,ingameId:rec.ingameId,name:info.name||rec.name,image:info.image||'',count:0,borrowedCount:0,teamRatePct:0,assistRatePct:0,enlight:[]});
    }
    const sortKey=window.__dtideMatrixSort||'total',asc=window.__dtideMatrixAsc||false;
    const totals=new Map(analysis.group.characters.map(x=>[x.key,x]));const rows=[...union.values()].map(c=>{const t=totals.get(c.key);return {...c,borrowedCount:t?.borrowedCount||0,assistRatePct:t?.assistRatePct||0,total:waves.reduce((s,w)=>s+(groups.get(w)?.characters.find(x=>x.key===c.key)?.count||0),0)}});const assistHeatMax=seasonAssistHeatMax;
    rows.sort((a,b)=>{const av=sortKey==='total'?a.total:sortKey==='assist'?(a.assistRatePct||0):(groups.get(Number(sortKey))?.characters.find(x=>x.key===a.key)?.count||0),bv=sortKey==='total'?b.total:sortKey==='assist'?(b.assistRatePct||0):(groups.get(Number(sortKey))?.characters.find(x=>x.key===b.key)?.count||0),d=bv-av;return (asc?-d:d)||String(a.name||a.key).localeCompare(String(b.name||b.key),'zh-CN')});
    const arrow=k=>k===sortKey?(asc?' ↑':' ↓'):' ↕';if(!rows.length){host.innerHTML=`<div class="dtideEmpty">${ui('当前口径暂无记录。','No records for the current scope.')}</div>`;return}
    const enlightBar=c=>{if(Number(c.count||0)<=0)return `<div class="dtideEnlightBar" title="${ui('暂无出场记录','No appearance record')}"></div>`;let items=enlightOrder.map(key=>(Array.isArray(c.enlight)?c.enlight:[]).find(x=>(x.key||x.id)===key)).filter(x=>x&&Number(x.count)>0);if(!items.length)items=[{key:"unknown",name:ui('启灵数据缺失','Enlighten data unavailable'),count:c.count||1}];const total=items.reduce((s,x)=>s+Number(x.count||0),0)||1;return `<div class="dtideEnlightBar" title="${items.map(x=>`${(zh()?enlightZh:enlightEn)[x.key]||x.name||ui('未知','Unknown')} ${pct(Number(x.count||0)/total*100)}`).join(' · ')}">${items.map(x=>{const key=x.key||x.id||'unknown';return `<span style="width:${Number(x.count||0)/total*100}%;background:${enlightColors[key]||enlightColors.unknown}"></span>`}).join('')}</div>`};
    const characterEnlight=new Map();
    for(const [,g] of groups){for(const c of g.byCharacter||[]){const item=characterEnlight.get(c.key)||{count:0,enlight:new Map()};item.count+=c.appearances||0;for(const e of c.enlight||[]){const old=item.enlight.get(e.key)||{...e,count:0};old.count+=e.count||0;item.enlight.set(e.key,old)}characterEnlight.set(c.key,item)}}
    host.innerHTML=`<table class="dtideTable"><thead><tr><th>${ui('角色','Awakener')}</th>${waves.map(w=>`<th><button type="button" class="dtideSortHead" data-sort-key="${w}" title="${ui('点击切换升降序','Toggle ascending / descending')}">Wave ${w}${arrow(String(w))}</button></th>`).join('')}<th><button type="button" class="dtideSortHead" data-sort-key="assist" title="${ui('点击切换升降序','Toggle ascending / descending')}">${ui('助战使用率','Assist Usage Rate')}${arrow('assist')}</button></th><th><button type="button" class="dtideSortHead" data-sort-key="total" title="${ui('点击切换升降序','Toggle ascending / descending')}">${ui('总出现','Total Appearances')}${arrow('total')}</button></th></tr></thead><tbody>${rows.map(c=>{const ce=characterEnlight.get(c.key),info=characterInfo(c.id||c.ingameId||c.key,c);return `<tr><td><div class="dtideChar">${info.image?`<img src="${esc(info.image)}" alt="" onerror="this.hidden=true">`:''}<span>${esc(info.name||c.name)}</span>${enlightBar({...c,count:ce?.count||c.total,enlight:ce?[...ce.enlight.values()]:[]})}</div></td>${waves.map(w=>{const g=groups.get(w),hit=g?.characters.find(x=>x.key===c.key),rate=mode==='slot'?(hit?.slotRatePct||0):(hit?.teamRatePct||0);return `<td class="dtideRate">${pct(rate)}</td>`}).join('')}<td class="dtideRate dtideHeat" style="${dtideHeatStyle(c.assistRatePct||0,assistHeatMax)}">${pct(c.assistRatePct||0)}</td><td>${c.total}</td></tr>`}).join('')}</tbody></table>`;
    host.onclick=e=>{const btn=e.target.closest('[data-sort-key]');if(!btn)return;const key=String(btn.dataset.sortKey);if(window.__dtideMatrixSort===key)window.__dtideMatrixAsc=!window.__dtideMatrixAsc;else{window.__dtideMatrixSort=key;window.__dtideMatrixAsc=false}renderMatrix()};
  }
  function renderUsage(){
    const host=$('dtideUsage');if(!host)return;
    const g=currentGroup(),mode=$('dtideRateMode')?.value||'team';
    host.innerHTML=g.characters.slice(0,18).map((c,i)=>{
      const info=characterInfo(c.id||c.ingameId||c.key),rate=mode==='slot'?(g.memberSlots?c.count/g.memberSlots*100:0):c.teamRatePct;
      return `<button class="dtideUsage" type="button" data-character-index="${i}" title="${ui('点击展开该角色的 Top5 队友、命轮和密契出场率','Open this Awakener’s Top 5 teammates, Wheels, and Covenants')}"><div class="dtideChar">${info.image?`<img src="${esc(info.image)}" alt="">`:''}<span><b>${esc(info.name||c.name)}</b><small>${zh()?`${c.count} 次 · 展开 Top5 队友 / 命轮 / 密契`:`${c.count} appearances · open Top 5 teammates / Wheels / Covenants`}</small></span></div><strong>${pct(rate)}</strong></button>`;
    }).join('')||`<div class="dtideEmpty">${ui('无角色统计。','No character statistics.')}</div>`;
  }
  function compareTable(columns,groups){
    const union=new Map();for(const g of groups)for(const c of g.characters)union.set(c.key,c);const rows=[...union.values()].map(c=>({...c,total:groups.reduce((s,g)=>s+(g.characters.find(x=>x.key===c.key)?.count||0),0)})).sort((a,b)=>b.total-a.total).slice(0,40);if(!rows.length)return `<div class="dtideEmpty">${ui('暂无记录。','No records.')}</div>`;return `<table class="dtideTable"><thead><tr><th>${ui('角色','Awakener')}</th>${columns.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(c=>{const info=characterInfo(c.id||c.ingameId||c.key);return `<tr><td>${esc(info.name||c.name)}</td>${groups.map(g=>{const hit=g.characters.find(x=>x.key===c.key);return `<td class="dtideRate">${pct(hit?.teamRatePct||0)}</td>`}).join('')}</tr>`}).join('')}</tbody></table>`}
  function renderComparisons(){return}
  function renderEquipment(){
    const g=currentGroup(),coverage=manifest.fieldCoverage||{},key=$('dtideEquipCharacter').value;
    if(!coverage.wheels&&!coverage.covenants){$('dtideEquipment').innerHTML=`<div class="dtideNotice">${ui('当前快照尚未由结构化 __data.json 重建；下一次同步后会自动启用命轮、密契与启灵统计。','This snapshot has not yet been rebuilt from structured __data.json. Wheel, Covenant, and Enlighten statistics will become available after the next synchronization.')}</div>`;return}
    const enlightLabels=zh()?enlightZh:enlightEn;
    const section=(title,arr,rateKey='teamRatePct',denom=ui('支队伍','teams'),isEnlight=false)=>{
      const items=isEnlight?[...(arr||[])].sort((a,b)=>enlightOrder.indexOf(b.key)-enlightOrder.indexOf(a.key)):(arr||[]);
      return `<h4 style="margin:10px 0 7px;font-size:12px">${title}</h4><div class="dtideUsageCards">${items.slice(0,24).map(x=>{const group=x.key||x.id||'unknown',color=enlightColors[group]||enlightColors.unknown;return `<div class="dtideUsage${isEnlight?' dtideEnlightItem':''}"${isEnlight?` style="--dtide-enlight-color:${color};--dtide-enlight-fill:${color}38"`:''}><div><b>${esc(isEnlight?(enlightLabels[group]||x.name||group):(x.name||x.key))}</b><small>${x.count} ${denom}</small></div><strong>${pct(x[rateKey])}</strong></div>`}).join('')||`<div class="dtideEmpty">${ui('暂无','None')}</div>`}</div>`;
    };
    if(!key){
      $('dtideEquipment').innerHTML=
        section(ui('启灵分组 · 角色槽位分布','Enlighten Group · Character Slot Distribution'),g.enlight,'teamRatePct',ui('次','times'),true)+
        section(ui('命轮 · 队伍采用率','Wheel · Team Adoption Rate'),g.wheels)+
        section(ui('密契套装 · 队伍采用率','Covenant Set · Team Adoption Rate'),g.covenants);
      return;
    }
    const row=g.byCharacter.find(x=>x.key===key);if(!row){$('dtideEquipment').innerHTML=`<div class="dtideEmpty">${ui('当前筛选下该角色没有记录。','No records for this Awakener under the current filters.')}</div>`;return}
    const info=characterInfo(row.id||row.ingameId||row.key),enlight=(row.enlight||[]).map(x=>`${enlightLabels[x.key]||x.name} ${x.count}`).join(' · ')||'—';
    $('dtideEquipment').innerHTML=`<div class="dtideGearSummary"><div><small>${ui('角色','Awakener')}</small><b>${esc(info.name||row.name)}</b></div><div><small>${ui('出现次数 / 等级','Appearances / Level')}</small><b>${row.appearances} · Lv.${row.level.min??'—'}–${row.level.max??'—'}</b></div><div><small>${ui('启灵分组','Enlighten Group')}</small><b>${esc(enlight)}</b></div></div>`
      +section(ui('最高出场率队友 Top 5','Top 5 Teammates by Appearance Rate'),row.teammates,'ratePct',ui('次同队','co-uses'))
      +section(ui('该角色启灵分组','Character Enlighten Groups'),row.enlight,'ratePct',ui('次','times'),true)
      +section(ui('该角色命轮采用率','Character Wheel Adoption Rate'),row.wheels,'ratePct',ui('次装备','equips'))
      +section(ui('该角色密契套装采用率','Character Covenant Adoption Rate'),row.covenants,'ratePct',ui('次采用','uses'));
  }
  function populateFilters(){
    const chars=new Map();for(const {team} of flattenTeams())for(const m of team.members||[]){
      const k=filterMemberKey(m);if(!k)continue;
      const sourceKey=String(memberKey(m)||''),info=characterInfo(m.skeydbId||m.ingameId||sourceKey,m),old=chars.get(k);
      if(!old)chars.set(k,{...info,fallback:m.canonicalName||m.name||sourceKey,sourceKey});else if(!old.image&&info.image)old.image=info.image;
    }
    for(const rec of currentSeasonRosterSupplements()){const k=filterMemberKey({skeydbId:rec.id,ingameId:rec.ingameId,name:rec.name});if(!k||chars.has(k))continue;const info=characterInfo(rec.id,rec);chars.set(k,{...info,fallback:rec.name||rec.id,sourceKey:rec.id})}
    const choices=[...chars.entries()].sort((a,b)=>(a[1].name||a[1].fallback).localeCompare(b[1].name||b[1].fallback,zh()?'zh-CN':'en')).map(([k,v])=>`<button type="button" class="dtideCharacterChoice" data-character-key="${esc(k)}" data-character-source="${esc(v.sourceKey||'')}" aria-pressed="false" title="${esc(v.name||v.fallback)}">${v.image?`<img src="${esc(v.image)}" alt="" loading="lazy" onerror="this.hidden=true">`:''}<span class="dtideCharacterChoiceName">${esc(v.name||v.fallback)}</span></button>`).join('');
    $('dtideCharacters').innerHTML=choices;$('dtideExcludeCharacters').innerHTML=choices;
    const scoreValues=[...new Set(flattenTeams().map(({record})=>Number(record?.score)).filter(Number.isFinite))].sort((a,b)=>b-a);
    const scoreRanges=zh()?[['500:525','500–525 分'],['450:495','450–495 分'],['400:445','400–445 分'],[':399','400（不含）以下']]:[['500:525','500–525 pts'],['450:495','450–495 pts'],['400:445','400–445 pts'],[':399','Below 400']];
    $('dtideTotalScore').innerHTML=`<option value="all">${ui('全部分数','All Scores')}</option>`+scoreRanges.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')+scoreValues.map(score=>`<option value="${score}">${score} ${ui('分','pts')}</option>`).join('');
    const coverage=manifest.fieldCoverage||{};$('dtideProgression').disabled=!coverage.enlightenLevel;$('dtideWheel').disabled=!coverage.wheels;$('dtideCovenant').disabled=!coverage.covenants;
    const wheelNames=new Map(),covNames=new Map();for(const {team} of flattenTeams())for(const m of team.members||[]){for(const item of m.wheels||[])wheelNames.set(String(item.id??item.name),wheelName(item));for(const item of m.covenants||((m.covenant)?[m.covenant]:[]))covNames.set(String(item.id??item.name),covenantName(item))}
    $('dtideWheel').innerHTML=`<option value="">${ui('不限','Any')}</option>`+[...wheelNames].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),zh()?'zh-CN':'en')).map(([k,v])=>`<option value="${esc(k)}">${esc(v)}</option>`).join('');
    $('dtideCovenant').innerHTML=`<option value="">${ui('不限','Any')}</option>`+[...covNames].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),zh()?'zh-CN':'en')).map(([k,v])=>`<option value="${esc(k)}">${esc(v)}</option>`).join('');
    filtersReady=true;
  }

  function matchesFilters(row){
    const rankCap=selectedRankCap();if(!rankMatches(row.record,rankCap))return false;
    const difficulty=$('dtideDifficulty').value;if(difficulty!=='all'&&row.difficulty!==difficulty)return false;
    const wave=$('dtideSearchWave')?.value||'all';if(wave!=='all'&&Number(row.wave.wave)!==Number(wave))return false;
    if(!scoreMatches(row.record))return false;
    const ct=$('dtideClearType').value;if(ct!=='all'&&ct!==row.team.clearType)return false;
    const include=getSelectedValues('dtideCharacters'),exclude=getSelectedValues('dtideExcludeCharacters'),keys=row.team.members.map(filterMemberKey),mode=$('dtideCharacterMode').value;if(include.length&&!(mode==='all'?include.every(x=>keys.includes(x)):include.some(x=>keys.includes(x))))return false;if(exclude.some(x=>keys.includes(x)))return false;
    const realmRoleTargets=activeAwakenerMembers(row.team),targets=include.length?realmRoleTargets.filter(m=>include.includes(filterMemberKey(m))):realmRoleTargets;if(!targets.length)return false;
    const minLv=Number($('dtideLevelMin').value||0),maxLv=Number($('dtideLevelMax').value||0);if(minLv&&targets.some(m=>m.level==null||Number(m.level)<minLv))return false;if(maxLv&&targets.some(m=>m.level==null||Number(m.level)>maxLv))return false;
    const prog=$('dtideProgression').value;if(prog&&!targets.some(m=>enlightClass(m)===prog))return false;
    const borrowed=$('dtideBorrowed').value,hasBorrow=row.team.members.some(m=>m.borrowed);if(borrowed==='yes'&&!hasBorrow)return false;if(borrowed==='no'&&hasBorrow)return false;
    const wheel=$('dtideWheel').value,cov=$('dtideCovenant').value;if(wheel&&!targets.some(m=>(m.wheels||[]).some(x=>String(x.id??x.name)===wheel)))return false;if(cov&&!targets.some(m=>(m.covenants||((m.covenant)?[m.covenant]:[])).some(x=>String(x.id??x.name)===cov)))return false;
    const csmin=$('dtideCovenantScoreMin').value===''?null:Number($('dtideCovenantScoreMin').value),csmax=$('dtideCovenantScoreMax').value===''?null:Number($('dtideCovenantScoreMax').value);if(csmin!=null&&targets.some(m=>m.covenantScore==null||Number(m.covenantScore)<csmin))return false;if(csmax!=null&&targets.some(m=>m.covenantScore==null||Number(m.covenantScore)>csmax))return false;
    const smin=Number($('dtideScoreMin').value||0),rmax=Number($('dtideRankMax').value||0);if(smin&&(row.record.score||0)<smin)return false;if(rmax&&!rankMatches(row.record,rmax))return false;return true;
  }
  function replayCodeOf(team){return String(team?.battleUuid||team?.battle_uuid||'').trim()}
  async function copyReplayCode(button){
    const code=String(button?.dataset?.replayCode||'').trim();if(!code)return;
    try{
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(code);
      else throw new Error('Clipboard API unavailable');
    }catch{
      const area=document.createElement('textarea');area.value=code;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();
    }
    const before=button.textContent;button.textContent=ui('已复制录像回放','Replay Copied');button.classList.add('isCopied');
    setTimeout(()=>{if(button.isConnected){button.textContent=before;button.classList.remove('isCopied')}},1600);
  }
  function renderResults(){
    if(!$('dtideResults')||!$('dtidePager'))return;
    searchPerformed=true;
    const all=flattenTeams().filter(matchesFilters),limit=200,rows=all.slice(0,limit),enlightLabels=zh()?enlightZh:enlightEn;
    $('dtideResults').innerHTML=rows.map(({record,wave,team,difficulty})=>{
      const replay=replayCodeOf(team),diff=zh()?(difficultyZh[difficulty]||difficultyZh.unknown):(difficultyEn[difficulty]||difficultyEn.unknown);
      return `<article class="dtideResult"><div class="dtideResultHead"><b>#${esc(record.rank??'—')} ${esc(record.player)} · Wave ${wave.wave} · ${esc(diff)} · ${team.clearType==='extra'?'Extra Clear':'Clear'} · ${esc(record.score??'—')} ${ui('分','pts')}</b><div class="dtideResultLinks"><a href="${esc(record.url)}" target="_blank" rel="noopener noreferrer">${ui('查看 Eremora 原记录','View original Eremora record')}</a>${replay?`<button type="button" class="dtideReplayCopy" data-replay-code="${esc(replay)}" title="${ui('复制 battleUuid，用于游戏内录像回放','Copy battleUuid for in-game replay')}">${ui('复制录像回放','Copy Replay')}</button>`:''}</div></div><div class="dtideMembers">${team.members.map(m=>{
        const info=characterInfo(m.skeydbId||m.ingameId||memberKey(m),m),wn=(m.wheels||[]).map(wheelName).filter(Boolean).join(' / '),cn=(m.covenants||((m.covenant)?[m.covenant]:[])).map(covenantName).filter(Boolean).join(' / '),ec=enlightClass(m);
        return `<div class="dtideMember">${info.image?`<img class="dtideMemberAvatar" src="${esc(info.image)}" alt="" loading="lazy">`:''}<b>${esc(info.name||m.canonicalName||m.name)}</b><small>Lv.${esc(m.level??'—')} · ${esc(enlightLabels[ec]||ec)}${m.covenantScore!=null?` · ${ui('密契评分','Covenant Rating')} ${esc(m.covenantScore)}`:''}</small>${wn?`<small class="dtideGear">${ui('命轮：','Wheels: ')}${esc(wn)}</small>`:''}${cn?`<small class="dtideGear">${ui('密契：','Covenants: ')}${esc(cn)}</small>`:''}${m.borrowed?`<small class="dtideBorrow">${ui('借用助战','Borrowed Assist')}</small>`:''}</div>`;
      }).join('')}</div></article>`;
    }).join('')||`<div class="dtideEmpty">${ui('没有符合这些条件的配队。','No teams match these filters.')}</div>`;
    $('dtidePager').textContent=zh()
      ?`匹配 ${all.length} 支队伍${all.length>limit?` · 当前显示前 ${limit} 支`:''}`
      :`${all.length} teams matched${all.length>limit?` · Showing first ${limit}`:''}`;
  }
  function renderSearchPrompt(){if(!$('dtideResults')||!$('dtidePager'))return;$('dtideResults').innerHTML='<div class="dtideEmpty">'+ui('设置筛选条件后点击“搜索配队”查看结果。','Set filters, then click “Search Teams” to view results.')+'</div>';$('dtidePager').textContent=''}
  function resetFilters(){for(const id of ['dtideLevelMin','dtideLevelMax','dtideCovenantScoreMin','dtideCovenantScoreMax','dtideScoreMin','dtideRankMax'])$(id).value='';for(const id of ['dtideProgression','dtideBorrowed','dtideWheel','dtideCovenant'])$(id).value='';document.querySelectorAll('.dtideCharacterChoice.isSelected').forEach(x=>{x.classList.remove('isSelected');x.setAttribute('aria-pressed','false')});document.querySelectorAll('.dtideFilterChip.isActive').forEach(x=>x.classList.remove('isActive'));$('dtideCharacterMode').value='all';$('dtideSearchWave').value='all';analysisCache=null;searchPerformed=false;renderSearchPrompt();scheduleRender()}
  function enlightenmentDetailBlock(arr){const items=[...(arr||[])].sort((a,b)=>enlightOrder.indexOf(a.key)-enlightOrder.indexOf(b.key));return '<h4>详细启灵比例</h4><div class="dtideUsageCards">'+(items.map(x=>{const key=x.key||'unknown',color=enlightColors[key]||enlightColors.unknown;return `<div class="dtideUsage dtideEnlightItem" style="--dtide-enlight-color:${color};--dtide-enlight-fill:${color}55"><div><b>${esc(enlightZh[key]||x.name||'未知')}</b><small>${x.count} 次</small></div><strong>${pct(x.ratePct)}</strong></div>`}).join('')||'<div class="dtideEmpty">暂无启灵数据</div>')+'</div>'}
  function renderSeasonDate(){const el=$('dtideSeasonDate');if(!el)return;const id=String(season?.seasonId??$('dtideSeason')?.value??''),date=id==='68'?'8.31–9.13':id==='69'?'9.14–9.27':'';el.hidden=!date;el.textContent=date?(zh()?`第 ${id} 期融灾 · ${date}`:`Season ${id} D-Zone · ${date}`):''}
  function renderAll(){renderSeasonDate();if(window.MorimensDtideRenderer==='legacy')return;renderSummary();renderMatrix();renderUsage();renderComparisons();if(filtersReady&&searchPerformed)renderResults();else if(filtersReady)renderSearchPrompt();$('dtideMatrix')?.removeAttribute('aria-busy')}
  function scheduleRender(){if(window.MorimensDtideRenderer==='legacy')return;cancelAnimationFrame(renderFrame);renderFrame=requestAnimationFrame(()=>{renderFrame=0;if(season&&filtersReady)renderAll()})}
  function relocalizeControls(){
    for(const option of $('dtideEquipCharacter')?.options||[]){if(!option.value)continue;option.textContent=characterInfo(option.value).name}
    for(const choice of document.querySelectorAll('.dtideCharacterChoice')){const info=characterInfo(choice.dataset.characterSource||choice.dataset.characterKey),label=choice.querySelector('.dtideCharacterChoiceName');if(label&&info.name&&info.name!=='未知')label.textContent=info.name;if(info.name&&info.name!=='未知')choice.title=info.name}
    const wheels=new Map(),covenants=new Map();for(const {team} of flattenTeams())for(const member of team.members||[]){for(const item of member.wheels||[])wheels.set(String(item.id??item.name),item);for(const item of member.covenants||((member.covenant)?[member.covenant]:[]))covenants.set(String(item.id??item.name),item)}
    for(const option of $('dtideWheel')?.options||[]){if(!option.value)continue;const item=wheels.get(option.value);if(item)option.textContent=wheelName(item)}
    for(const option of $('dtideCovenant')?.options||[]){if(!option.value)continue;const item=covenants.get(option.value);if(item)option.textContent=covenantName(item)}
    analysisCache=null;if(season)renderAll();
  }

  async function loadSeason(id){
    const loadToken=++seasonLoadToken;
    cancelAnimationFrame(renderFrame);renderFrame=0;
    searchPerformed=false;
    filtersReady=false;
    $('dtideStatus').textContent=ui('正在载入期次…','Loading season…');
    const matrix=$('dtideMatrix');if(matrix){matrix.setAttribute('aria-busy','true');matrix.innerHTML='<div class="dtideEmpty">'+ui('正在载入并整理角色榜单…','Loading and organizing the character ranking…')+'</div>'}
    const entry=manifest.availableSeasons.find(x=>String(x.seasonId)===String(id));
    if(!entry)throw new Error(`Season ${id} snapshot unavailable`);
    const current=Number(id)===Number(manifest.currentSeason)&&manifest.usageIndex?.path
      ?{path:manifest.usageIndex.path,statsPath:manifest.usageIndex.statsPath}
      :entry;
    const loader=window.MorimensDtideDataLoader;
    if(!loader?.loadDataset)throw new Error('D-Zone shared data loader unavailable');
    const revision=current.revision||manifest.usageIndex?.revision||manifest.usageIndex?.syncedAt||manifest.analytics?.generatedAt||manifest.source?.syncedAt||'1';
    const overlay=Number(id)===Number(manifest.currentSeason)&&manifest.currentOverlay?.path?manifest.currentOverlay:null;
    const overlayRevision=overlay?.revision||overlay?.updatedAt||revision;
    const rankPath=entry.legacy||entry.coverageMode==='legacy-spreadsheet'?null:(Number(id)===Number(manifest.currentSeason)?(manifest.rankIndex?.path||`data/morimens/eremora/rank-index/${id}.json`):`data/morimens/eremora/rank-index/${id}.json`);
    const [loadedSeason,loadedStats,loadedRanks,loadedLegacyStructured,loadedOverlay,loadedOverlayRanks]=await Promise.all([
      loader.loadDataset(current.path),
      loader.loadJson(current.statsPath,{revision,fresh:true}),
      rankPath&&loader.loadRankMap?loader.loadRankMap(rankPath,{revision,fresh:true}).catch(error=>{console.warn('rank index unavailable',id,error);return new Map()}):Promise.resolve(new Map()),
      entry.legacy||entry.coverageMode==='legacy-spreadsheet'?loader.loadJson('data/morimens/eremora/legacy-structured.json',{revision:'legacy-structured-v7',fresh:true}).catch(error=>{console.warn('legacy structured data unavailable',error);return null}):Promise.resolve(null),
      overlay?.path?loader.loadDataset(overlay.path).catch(error=>{console.warn('current season Top500 delta unavailable',error);return null}):Promise.resolve(null),
      overlay?.rankPath&&loader.loadRankMap?loader.loadRankMap(overlay.rankPath,{revision:overlayRevision,fresh:true}).catch(error=>{console.warn('current season Top500 rank override unavailable',error);return new Map()}):Promise.resolve(new Map())
    ]);
    if(loadToken!==seasonLoadToken)return;
    rankOverrideByUid=new Map(loadedOverlayRanks||[]);
    rankOverrideScope=Number(overlay?.scope)||0;
    const mergedRanks=new Map(loadedRanks||[]);
    for(const [uid,rank] of rankOverrideByUid)mergedRanks.set(String(uid),rank);
    rankByUid=mergedRanks;
    if(loadedOverlay?.records?.length){
      const mergedRecords=new Map();let anonymousRecord=0;
      for(const record of loadedSeason?.records||[]){const uid=String(record?.uid??'');mergedRecords.set(uid||`__base_${anonymousRecord++}`,record)}
      for(const record of loadedOverlay.records){const uid=String(record?.uid??'');if(uid)mergedRecords.set(uid,inheritReplayMetadata(mergedRecords.get(uid),record))}
      const effectiveRank=record=>{const mapped=rankByUid.get(String(record?.uid??'')),raw=Number(record?.rank);return Number.isFinite(mapped)?mapped:(Number.isFinite(raw)?raw:999999)};
      const records=[...mergedRecords.values()].sort((a,b)=>effectiveRank(a)-effectiveRank(b));
      season={...loadedSeason,records,recordCount:records.length,deltaRecordCount:loadedOverlay.records.length,dataUpdatedAt:overlay?.updatedAt||loadedOverlay.updatedAt||null};
    }else season=loadedSeason;
    const seasonOption=[...($('dtideSeason')?.options||[])].find(option=>String(option.value)===String(id));
    if(seasonOption&&Number.isFinite(Number(season?.recordCount))&&!(entry.legacy||entry.coverageMode==='legacy-spreadsheet'||String(entry.seasonId)==='legacy-high-difficulty')){
      const loadedRecordCount=Number(season.recordCount);
      entry.recordCount=loadedRecordCount;
      seasonOption.textContent=zh()?`第 ${entry.seasonId} 期 · ${loadedRecordCount} 条${entry.complete?' · 完整':' · 部分'}`:`Season ${entry.seasonId} · ${loadedRecordCount} records${entry.complete?' · Complete':' · Partial'}`;
    }
    stats=loadedStats;
    legacyStructured=loadedLegacyStructured;
    flatTeamsCache=null;
    analysisCache=null;
    seasonAssistHeatMax=fullSeasonAssistHeatMax();
    const waves=[...new Set(flattenTeams().map(x=>Number(x.wave.wave)))].sort((a,b)=>a-b);
    $('dtideSearchWave').innerHTML='<option value="all">'+ui('全部波次','All Waves')+'</option>'+waves.map(w=>`<option value="${w}">Wave ${w}</option>`).join('');
    populateFilters();
    const identitySummary=identityNormalizationSummary();
    if(identitySummary.mergedAliases>0)console.info('D-Zone character identity aliases merged',identitySummary);
    renderAll();
    if(matrix)matrix.removeAttribute('aria-busy');
  }
  async function loadOnce(){
    if(manifest)return;
    try{
      await waitMorimensData();
      for(const r of window.MorimensData?.db?.records||[]){awakenerMap.set(r.id,r);if(r.ingameId)awakenerMap.set(r.ingameId,r)}
      const response=await fetch('data/morimens/eremora/manifest.json',{cache:'no-store'});
      if(!response.ok)throw new Error(`manifest HTTP ${response.status}`);
      manifest=await response.json();
      const sel=$('dtideSeason');
      if(!sel)throw new Error(ui('期次选择器尚未挂载','Season selector is not mounted'));
      sel.innerHTML=(manifest.availableSeasons||[]).map(s=>{
        const legacy=s.legacy||s.coverageMode==='legacy-spreadsheet'||String(s.seasonId)==='legacy-high-difficulty';
        const label=legacy
          ?ui('旧版融灾425出场率（来源：@却尘）','Legacy D-Zone 425 Appearance Rate (source: @却尘)')
          :(zh()?`第 ${s.seasonId} 期 · ${s.recordCount??0} 条${s.complete?' · 完整':' · 部分'}`:`Season ${s.seasonId} · ${s.recordCount??0} records${s.complete?' · Complete':' · Partial'}`);
        return `<option value="${s.seasonId}">${label}</option>`;
      }).join('');
      if(!sel.options.length)throw new Error(ui('暂无融灾快照','No D-Zone snapshot is available'));
      sel.value=String(manifest.currentSeason&&manifest.availableSeasons.some(x=>x.seasonId===manifest.currentSeason)?manifest.currentSeason:manifest.availableSeasons[0].seasonId);
      await loadSeason(sel.value);
      const pending=manifest.pendingBackfillSeasonIds||[],note=$('dtideCoverageNote');
      if(note){
        const rawNotes=(manifest.notes||[]).join(' ');
        const translatedNotes=zh()?rawNotes:(/[㐀-鿿]/.test(rawNotes)?'Statistics use the synchronized snapshot and only fields present in its structured data.':rawNotes);
        const pendingText=pending.length
          ?(zh()?` 当前 ${pending.length} 个历史期次仍为增量快照：${pending.slice(0,12).join('、')}${pending.length>12?'…':''}`:` ${pending.length} historical season(s) are still incremental snapshots: ${pending.slice(0,12).join(', ')}${pending.length>12?'…':''}`)
          :'';
        note.innerHTML=`<strong>${ui('字段真实性：','Field integrity: ')}</strong>${esc(translatedNotes)}${pendingText}`;
      }
      sel.addEventListener('change',()=>{const requested=sel.value;loadSeason(requested).catch(error=>{if(sel.value===requested)showError(error)})});
      for(const id of ['dtideRankScope','dtideDifficulty','dtideTotalScore','dtideWave','dtideClearType','dtideRateMode','dtideSort','dtideEntityType','dtideCreationFilter'])$(id)?.addEventListener('change',scheduleRender);
      $('dtideEquipCharacter')?.addEventListener('change',renderEquipment);
      $('dtideSearch')?.addEventListener('click',renderResults);
      $('dtideReset')?.addEventListener('click',resetFilters);
      $('dtideUsage')?.addEventListener('click',e=>{
        const card=e.target.closest('[data-character-index]');if(!card)return;
        const row=currentGroup().characters[Number(card.dataset.characterIndex)];if(!row)return;
        document.querySelectorAll('.dtideInlineDetail').forEach(x=>x.remove());
        const block=(title,arr)=>'<h4>'+title+'</h4><div class="dtideUsageCards">'+((arr||[]).slice(0,5).map(x=>'<div class="dtideUsage"><div><b>'+esc(x.name||x.key)+'</b><small>'+x.count+' '+ui('次','times')+'</small></div><strong>'+pct(x.ratePct||x.teamRatePct)+'</strong></div>').join('')||'<div class="dtideEmpty">'+ui('暂无数据','No data')+'</div>')+'</div>';
        const detail=document.createElement('div');detail.className='dtideInlineDetail';
        detail.innerHTML=block(ui('Top5 队友出场率','Top 5 Teammate Appearance Rate'),row.teammates)+enlightenmentDetailBlock(row.enlight)+block(ui('命轮出场率','Wheel Appearance Rate'),row.wheels)+block(ui('密契出场率','Covenant Appearance Rate'),row.covenants);
        card.insertAdjacentElement('afterend',detail);card.setAttribute('aria-expanded','true');
      });
    }catch(e){showError(e)}
  }
  function showError(e){console.warn('D-Zone analytics failed',e);if($('dtideStatus'))$('dtideStatus').textContent=ui('融灾数据加载失败','Failed to load D-Zone data');if($('dtideResults'))$('dtideResults').innerHTML=`<div class="dtideNotice">${esc(e?.message||e)}</div>`}
  function boot(){
    injectStyle();setupTabs();
    document.addEventListener('click',e=>{
      const download=e.target.closest('#dtideTableDownload');
      if(download){
        downloadRenderedTable(download).catch(error=>{
          console.error('D-Zone table image export failed',error);
          alert((zh()?'图片生成失败：':'Image generation failed: ')+error.message);
        });
        return;
      }
      const replay=e.target.closest('.dtideReplayCopy');if(replay){copyReplayCode(replay);return}
      const choice=e.target.closest('.dtideCharacterChoice');if(choice){const selected=choice.classList.toggle('isSelected');choice.setAttribute('aria-pressed',String(selected));return}
      const chip=e.target.closest('.dtideFilterChip');if(!chip)return;
      chip.classList.toggle('isActive');analysisCache=null;if(filtersReady)scheduleRender();
    });
    window.addEventListener('morimens-language-change',()=>{
      if($('morimensBuilderTab')){
        $('morimensBuilderTab').textContent=zh()?'伤害计算 / 每日签':'Damage / Fortune';
        $('morimensDtideTab').textContent=zh()?'融灾榜单':'D-Zone Leaderboard';
        if($('morimensLoveTab'))$('morimensLoveTab').textContent=zh()?'爱的节奏榜':'Love Rhythm';
        if($('morimensCommentsTab'))$('morimensCommentsTab').textContent=zh()?'留言板':'Guestbook';
      }
      relocalizeControls();
      if(manifest){manifest=null;loadOnce()}
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
