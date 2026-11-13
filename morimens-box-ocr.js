/* 忘忘看报 · 截图识别（角色等级 / 启灵 / 命轮叠位）
   纯前端：先用金色星条定位卡片网格，再用头像/命轮卡面做模板匹配认人，
   数字交给本地 tesseract（仓库内自带，不联网）。
   识别结果一律返回候选列表，由 UI 让人确认。 */
(()=>{
  const WORK_W=1200;                     // 工作宽度，够认数字又不至于太慢
  const OCR_BASE='ocr/';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const MAX_LV_GUESS=90;

  /* ---------- 基础图像工具 ---------- */
  function makeCanvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
  function ctxOf(c){return c.getContext('2d',{willReadFrequently:true})}
  function loadImage(src){
    return new Promise((res,rej)=>{const im=new Image();im.crossOrigin='anonymous';im.onload=()=>res(im);im.onerror=()=>rej(new Error('图片无法读取：'+src));im.src=src});
  }
  function blobToImage(file){
    return new Promise((res,rej)=>{
      const url=URL.createObjectURL(file);const im=new Image();
      im.onload=()=>{URL.revokeObjectURL(url);res(im)};
      im.onerror=()=>{URL.revokeObjectURL(url);rej(new Error('这张图打不开'))};
      im.src=url;
    });
  }
  // 归一化灰度块（去均值、单位长度），用于模板相似度
  function normPatch(ctx,x,y,w,h,n){
    const d=ctx.getImageData(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h))).data;
    const out=new Float32Array(n*n);
    const sw=Math.max(1,Math.round(w)),sh=Math.max(1,Math.round(h));
    const acc=new Float32Array(n*n),cnt=new Float32Array(n*n);
    for(let j=0;j<sh;j++){
      const gy=Math.min(n-1,Math.floor(j*n/sh));
      for(let i=0;i<sw;i++){
        const gx=Math.min(n-1,Math.floor(i*n/sw));
        const p=(j*sw+i)*4;
        const l=(d[p]*0.299+d[p+1]*0.587+d[p+2]*0.114);
        acc[gy*n+gx]+=l;cnt[gy*n+gx]++;
      }
    }
    let mean=0;for(let i=0;i<out.length;i++){out[i]=acc[i]/(cnt[i]||1);mean+=out[i]}
    mean/=out.length;
    let norm=0;for(let i=0;i<out.length;i++){out[i]-=mean;norm+=out[i]*out[i]}
    norm=Math.sqrt(norm)||1;
    for(let i=0;i<out.length;i++)out[i]/=norm;
    return out;
  }
  function dot(a,b){let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s}
  // 彩色版归一化描述子：三个通道各自去均值后整体归一化，点积≈平均相关
  function normPatchRGB(ctx,x,y,w,h,n){
    const sw=Math.max(1,Math.round(w)),sh=Math.max(1,Math.round(h));
    const d=ctx.getImageData(Math.round(x),Math.round(y),sw,sh).data;
    const size=n*n,acc=new Float32Array(size*3),cnt=new Float32Array(size);
    for(let j=0;j<sh;j++){
      const gy=Math.min(n-1,Math.floor(j*n/sh));
      for(let i=0;i<sw;i++){
        const gx=Math.min(n-1,Math.floor(i*n/sw)),p=(j*sw+i)*4,g=gy*n+gx;
        acc[g]+=d[p];acc[size+g]+=d[p+1];acc[size*2+g]+=d[p+2];cnt[g]++;
      }
    }
    const out=new Float32Array(size*3);
    for(let c=0;c<3;c++){
      let mean=0;
      for(let i=0;i<size;i++){out[c*size+i]=acc[c*size+i]/(cnt[i]||1);mean+=out[c*size+i]}
      mean/=size;
      for(let i=0;i<size;i++)out[c*size+i]-=mean;
    }
    let norm=0;for(let i=0;i<out.length;i++)norm+=out[i]*out[i];
    norm=Math.sqrt(norm)||1;
    for(let i=0;i<out.length;i++)out[i]/=norm;
    return out;
  }

  /* ---------- 像素与网格 ----------
     游戏 UI 是等距网格，卡与卡之间会露出页面底色。
     所以先找“间隙”（列/行方向的一条低方差或高亮底色），
     再把间隙中心当成等差数列拟合，最后反推卡宽、列数和首卡位置。
     角色页的等级条是一条横贯整排卡片的深色带，用它定位每行卡片的底边。 */
  function pixelData(canvas){
    const W=canvas.width,H=canvas.height;
    const d=ctxOf(canvas).getImageData(0,0,W,H).data;
    const L=new Uint8Array(W*H);
    for(let i=0,p=0;i<W*H;i++,p+=4)L[i]=(d[p]*0.299+d[p+1]*0.587+d[p+2]*0.114)|0;
    return {d,L,W,H};
  }
  // 连续满足 test 的区间
  function runsOf(len,test,maxW){
    const out=[];let st=-1;
    for(let i=0;i<len;i++){
      const on=test(i);
      if(on&&st<0)st=i;
      else if(!on&&st>=0){const w=i-st;if(w<=maxW)out.push({a:st,b:i-1,c:(st+i-1)/2,w:w});st=-1}
    }
    if(st>=0){const w=len-st;if(w<=maxW)out.push({a:st,b:len-1,c:(st+len-1)/2,w:w})}
    return out;
  }
  // 合并挨得很近的区间（1~3 像素的分隔缝不该把一条间隙切成两条）
  function mergeRuns(list,gap){
    const out=[];
    for(const r of list){
      const last=out[out.length-1];
      if(last&&r.a-last.b-1<=gap){last.b=r.b;last.c=(last.a+r.b)/2;last.w=r.b-last.a+1}
      else out.push({a:r.a,b:r.b,c:r.c,w:r.w});
    }
    return out;
  }
  // 逐列（axis='x'）或逐行（axis='y'）的亮度均值 / 标准差
  function axisStats(pix,x0,x1,y0,y1,axis){
    const L=pix.L,W=pix.W,out=[];
    if(axis==='x'){
      for(let x=x0;x<x1;x++){
        let s=0,q=0,n=0;
        for(let y=y0;y<y1;y++){const v=L[y*W+x];s+=v;q+=v*v;n++}
        const mu=s/n;out.push({i:x,mu:mu,std:Math.sqrt(Math.max(0,q/n-mu*mu))});
      }
    }else{
      for(let y=y0;y<y1;y++){
        let s=0,q=0,n=0;const base=y*W;
        for(let x=x0;x<x1;x++){const v=L[base+x];s+=v;q+=v*v;n++}
        const mu=s/n;out.push({i:y,mu:mu,std:Math.sqrt(Math.max(0,q/n-mu*mu))});
      }
    }
    return out;
  }
  function medianOf(arr){
    if(!arr||!arr.length)return 0;
    const a=arr.slice().sort(function(x,y){return x-y});
    return a[Math.floor(a.length/2)];
  }
  // 在一片位置里找最像“等距网格”的那一串，返回 {pitch, members}
  function findAP(cs,minP,maxP,tol){
    const arr=cs.slice().sort(function(x,y){return x-y});
    if(arr.length<2)return {pitch:0,members:arr};
    const cands=[];
    for(let i=0;i<arr.length;i++){
      for(let j=i+1;j<arr.length;j++){
        const d=arr[j]-arr[i];
        for(let k=1;k<=4;k++){
          const p=d/k;
          if(p>=minP&&p<=maxP)cands.push(p);
        }
      }
    }
    let best={pitch:0,members:arr,n:0};
    for(const p of cands){
      for(const anchor of arr){
        const seq=[anchor];let nxt=anchor+p;
        for(const c of arr){
          if(c<=anchor)continue;
          if(Math.abs(c-nxt)<=Math.max(2,p*tol)){seq.push(c);nxt=c+p}
        }
        if(seq.length>best.n)best={pitch:p,members:seq,n:seq.length};
      }
    }
    if(!best.n)return {pitch:0,members:arr};
    const ds=[];
    for(let i=1;i<best.members.length;i++)ds.push(best.members[i]-best.members[i-1]);
    return {pitch:medianOf(ds)||best.pitch,members:best.members};
  }

  /* ---------- 模板：角色头像 / 命轮卡面 ---------- */
  let charTpl=null,wheelTpl=null,wheelTplErr='';
  async function buildCharTemplates(onProgress){
    if(charTpl)return charTpl;
    const md=window.MorimensData;
    const recs=(md?.db?.records||[]).filter(r=>r.assets?.portrait);
    const list=[];let done=0;
    for(const rec of recs){
      try{
        const im=await loadImage(md.assetFor(rec,'portrait'));
        const c=makeCanvas(48,48);const cc=ctxOf(c);cc.drawImage(im,0,0,48,48);
        list.push({id:rec.id,name:md.localizedProfile(rec).name,d:normPatch(cc,0,0,48,48,12),d3:normPatchRGB(cc,0,0,48,48,10)});
      }catch(e){}
      done++;
      if(onProgress&&done%10===0)onProgress(`载入头像 ${done}/${recs.length}`);
    }
    charTpl=list;return list;
  }
  // 卡面四边形（卡槽内归一化坐标）：左上 右上 右下 左下。游戏里卡是斜着摆的，
  // 直接拿直立模板比会认错人，所以先按这个四边形把插画透视校正成直立矩形。
  const WHEEL_QUAD=[[0.193,0.098],[0.669,0.094],[0.614,0.674],[0.145,0.658]];
  const ART_W=80,ART_H=115,ART_ASPECT=ART_W/ART_H,TAG_N=12;
  async function buildWheelTemplates(onProgress){
    if(wheelTpl)return wheelTpl;
    const md=window.MorimensData;
    let map=null;
    try{const rs=await fetch('data/morimens/skeydb/art-map.json',{cache:'force-cache'});if(!rs.ok)throw new Error('HTTP '+rs.status);map=await rs.json()}catch(e){wheelTplErr='art-map: '+e.message}
    const rows=[];
    for(const id in (map?.wheelIcon||{}))rows.push({id,file:map.wheelIcon[id]});
    const list=[];let done=0;
    for(const row of rows){
      try{
        const im=await loadImage(`assets/morimens/wheel-thumbs/${row.file}.webp`);
        const zh=md?.wheelZhDb?.bySkeydbId?.[row.id],name=zh?.name||row.id;
        const iw=im.naturalWidth||im.width,ih=im.naturalHeight||im.height,S=48,side=Math.min(iw,ih);
        // 竖长条的官方图 → 方形卡面，几种可能的取景都存一份，谁最像算谁
        const crops=[
          {tag:'squash',r:[0,0,iw,ih]},
          {tag:'center',r:[(iw-side)/2,(ih-side)/2,side,side]}
        ];
        let tw=iw,th=Math.round(iw/ART_ASPECT);
        if(th>ih){th=ih;tw=Math.round(ih*ART_ASPECT)}
        for(const off of [-0.18,0,0.18]){
          const y=clamp(Math.round((ih-th)/2+off*ih*0.5),0,ih-th);
          crops.push({tag:'cover'+off,r:[Math.round((iw-tw)/2),y,tw,th]});
        }
        for(const cp of crops){
          const c=makeCanvas(S,S),cc=ctxOf(c);
          cc.drawImage(im,cp.r[0],cp.r[1],cp.r[2],cp.r[3],0,0,S,S);
          list.push({id:row.id,name:name,tag:cp.tag,d3:normPatchRGB(cc,0,0,S,S,TAG_N)});
        }
      }catch(e){if(!wheelTplErr)wheelTplErr='tpl '+row.id+': '+e.message}
      done++;
      if(onProgress&&done%20===0)onProgress(`载入命轮卡面 ${done}/${rows.length}`);
    }
    wheelTpl=list;return list;
  }

  /* ---------- 模板匹配 ---------- */
  function matchSquare(ctx,box,tpls,opts={}){
    // color=true 时用 RGB 描述子（去均值后整体归一化，点积≈平均相关）。
    // 角色卡换角色只靠灰度容易混（发型轮廓相近的人很多），颜色（发色/服色）区分度高得多。
    const color=!!opts.color;
    const n=color?10:12,aspect=opts.aspect||1,scales=opts.scales||[0.42,0.5,0.58,0.66,0.74,0.82,0.9];
    const best=new Map(tpls.map(t=>[t.id,-1]));
    // 按最长边能塞进框来定基准宽度，避免 aspect 较大时 h 直接顶出框导致一个位置都不试
    const baseW=Math.min(box.w,box.h/aspect);
    for(const s of scales){
      const w=baseW*s,h=aspect*w;
      if(w<10||h<10)continue;
      const step=Math.max(3,Math.round(w/7));
      const maxX=box.x+box.w-w,maxY=box.y+box.h-h;
      for(let y=box.y;y<=maxY;y+=step){
        for(let x=box.x;x<=maxX;x+=step){
          const d=color?normPatchRGB(ctx,x,y,w,h,n):normPatch(ctx,x,y,w,h,n);
          for(const t of tpls){
            const v=dot(d,color?t.d3:t.d);
            if(v>best.get(t.id))best.set(t.id,v);
          }
        }
      }
    }
    return [...best.entries()].map(([id,score])=>({id,score})).sort((a,b)=>b.score-a.score);
  }

  /* 卡片插画是斜着摆的，直接用直立模板比对会认错人。
     这里把目标区域按若干角度/缩放/微位移重采样成直立小图，再和模板比。
     canvas 是缩略图（比原图小，匹配更快）。 */
  function patchDesc(canvas,box,n,rot,scale,color){
    const w=Math.max(6,Math.round(box.w*scale)),h=Math.max(6,Math.round(box.h*scale));
    const c=makeCanvas(w,h),cc=ctxOf(c);
    const cx=box.x+box.w/2,cy=box.y+box.h/2;
    cc.save();
    cc.translate(w/2,h/2);cc.rotate(rot);cc.translate(-cx,-cy);
    cc.drawImage(canvas,0,0);
    cc.restore();
    return color?normPatchRGB(cc,0,0,w,h,n):normPatch(cc,0,0,w,h,n);
  }
  function matchArt(canvas,box,tpls,opts){
    const o=opts||{},color=!!o.color,n=color?10:(o.n||12);
    const rots=o.rots||[0],scales=o.scales||[1],jitter=o.jitter||0;
    const best=new Map(tpls.map(t=>[t.id,-1]));
    const vecOf=t=>color?t.d3:t.d;
    const offs=[0];
    if(jitter>0){offs.length=0;for(let d=-jitter;d<=jitter;d+=jitter)offs.push(d)}
    for(const rot of rots){
      for(const sc of scales){
        for(const dx of offs){
          for(const dy of offs){
            const b={x:box.x+dx,y:box.y+dy,w:box.w,h:box.h};
            const d=patchDesc(canvas,b,n,rot,sc,color);
            for(const t of tpls){
              const tv=vecOf(t);
              if(!tv)continue;
              const v=dot(d,tv);
              if(v>best.get(t.id))best.set(t.id,v);
            }
          }
        }
      }
    }
    return [...best.entries()].map(([id,score])=>({id,score})).sort((a,b)=>b.score-a.score);
  }

  /* ---------- OCR（本地 tesseract） ---------- */
  let workerPromise=null,progressCb=null;
  function loadScript(src){
    return new Promise((res,rej)=>{
      if(document.querySelector(`script[src="${src}"]`))return res();
      const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('OCR 引擎加载失败：'+src));document.head.appendChild(s);
    });
  }
  async function getWorker(){
    if(workerPromise)return workerPromise;
    workerPromise=(async()=>{
      await loadScript(OCR_BASE+'tesseract.min.js');
      if(!window.Tesseract)throw new Error('OCR 引擎不可用');
      const base=new URL(OCR_BASE,location.href).href;
      const w=await window.Tesseract.createWorker('eng',1,{
        workerPath:base+'worker.min.js',
        corePath:base,
        langPath:base.replace(/\/$/,''),
        gzip:true,
        logger:m=>{if(progressCb&&m.status==='recognizing text')progressCb(Math.round(m.progress*100))}
      });
      await w.setParameters({tessedit_char_whitelist:'0123456789Lv. ',tessedit_pageseg_mode:'7'});
      return w;
    })();
    return workerPromise;
  }
  // 把一小块区域放大 + 二值化，再交给 tesseract
  async function readDigits(ctx,box,opts){
    const o=opts||{};
    const whitelist=o.whitelist||'0123456789',scale=o.scale||4,thr=o.thr||0,psm=o.psm||'7';
    const w=Math.max(8,Math.round(box.w)),h=Math.max(8,Math.round(box.h));
    const src=ctx.getImageData(Math.round(box.x),Math.round(box.y),w,h).data;
    const cw=w*scale,ch=h*scale;
    const buf=new Uint8Array(cw*ch);
    let sum=0;for(let i=0,p=0;i<w*h;i++,p+=4)sum+=src[p]*0.299+src[p+1]*0.587+src[p+2]*0.114;
    const mean=sum/(w*h);
    const t=thr||Math.max(90,Math.min(210,mean*1.12));
    for(let y=0;y<ch;y++){
      const sy=Math.min(h-1,Math.floor(y/scale));
      for(let x=0;x<cw;x++){
        const sx=Math.min(w-1,Math.floor(x/scale));
        const p=(sy*w+sx)*4;
        const l=src[p]*0.299+src[p+1]*0.587+src[p+2]*0.114;
        buf[y*cw+x]=l>t?1:0;
      }
    }
    // 整行几乎全是墨 → 卡片高光/分隔条，不是字，抹掉；
    // 另外统计每行最长的连续墨段，太长的就是横线（等级条上下沿），一并抹掉。
    for(let y=0;y<ch;y++){
      let n=0,run=0,runMax=0;
      for(let x=0;x<cw;x++){
        if(buf[y*cw+x]){n++;run++;if(run>runMax)runMax=run}
        else run=0;
      }
      if(n>cw*0.80||runMax>cw*0.55)for(let x=0;x<cw;x++)buf[y*cw+x]=0;
    }
    // 按行墨迹找出真正的一行字，去掉上下多余的黑边
    let y0=-1,y1=-1;
    for(let y=0;y<ch;y++){
      let n=0;for(let x=0;x<cw;x++)n+=buf[y*cw+x];
      const f=n/cw;
      if(f>0.02&&f<0.72){if(y0<0)y0=y;y1=y}
    }
    if(y0<0){y0=0;y1=ch-1}
    const hh=Math.max(1,y1-y0+1);
    // 组装成“黑字白底 + 四周留白”：tesseract 对单个又细又高的字符要留边
    // 被裁掉半截的字会变得又扁又矮，tesseract 对扁字识别率很差。
    // targetH 把字拉伸到统一高度，等于做一次垂直归一化。
    const dstH=o.targetH?Math.max(Math.round(o.targetH),hh):hh;
    const padX=Math.max(10,Math.round(cw*0.06)),padY=Math.max(12,Math.round(dstH*0.3));
    const W2=cw+padX*2,H2=dstH+padY*2;
    const canvas=makeCanvas(W2,H2),cx=ctxOf(canvas);
    const img=cx.createImageData(W2,H2);
    for(let i=0;i<W2*H2;i++){const q=i*4;img.data[q]=img.data[q+1]=img.data[q+2]=255;img.data[q+3]=255}
    for(let y=0;y<dstH;y++){
      const sy=y0+Math.min(hh-1,Math.floor(y*hh/dstH));
      for(let x=0;x<cw;x++){
        if(!buf[sy*cw+x])continue;
        const q=((y+padY)*W2+(x+padX))*4;
        img.data[q]=img.data[q+1]=img.data[q+2]=0;
      }
    }
    cx.putImageData(img,0,0);
    const worker=await getWorker();
    await worker.setParameters({tessedit_char_whitelist:whitelist,tessedit_pageseg_mode:psm});
    const r=await worker.recognize(canvas);
    const text=(r.data.text||'').replace(/[^0-9Lv.+]/g,'');
    return {text:text,conf:r.data.confidence||0,png:canvas.toDataURL('image/png')};
  }

  // 调试开关：页面设 window.__boxOcrTrace=true 时，识别结果里会附带每格的取样框与原始文本
  const TRACE=function(){return typeof window!=='undefined'&&!!window.__boxOcrTrace};
  /* ---------- 角色页：列（背景间隙）+ 行（等级条） ---------- */
  function detectColumns(pix){
    const L=pix.L,W=pix.W,H=pix.H;
    const xEnd=Math.max(8,Math.round(W*0.62));
    // 面板底色偏亮：整列都亮 → 卡与卡之间的缝
    const bright=new Float32Array(W);
    let rows=0;
    for(let y=0;y<H;y+=2){const base=y*W;rows++;for(let x=0;x<xEnd;x++)if(L[base+x]>190)bright[x]++}
    for(let x=0;x<xEnd;x++)bright[x]/=rows;
    const maxGapW=Math.max(10,Math.round(W*0.008));
    const allRuns=mergeRuns(runsOf(xEnd,function(x){return bright[x]>0.5},W),3);
    let runs=allRuns.filter(function(r){return r.w>=3&&r.w<=maxGapW});
    if(runs.length<2){
      const st=axisStats(pix,0,xEnd,Math.round(H*0.05),Math.round(H*0.95),'x');
      const med=medianOf(st.map(function(o){return o.std}));
      runs=mergeRuns(runsOf(xEnd,function(x){return st[x].std<Math.max(8,med*0.25)},W),3)
        .filter(function(r){return r.w>=3&&r.w<=maxGapW});
    }
    const ap=findAP(runs.map(function(r){return r.a}),W*0.035,W*0.2,0.06);
    const gapW=medianOf(runs.map(function(r){return r.w}))||Math.round(W*0.003);
    let cardW=0,pitch=ap.pitch,x0=0,nCols=0,blockR=0,fallback=false;
    const cs=ap.members;
    if(cs.length>=2&&pitch>W*0.03&&pitch<W*0.2){
      cardW=Math.max(Math.round(W*0.03),pitch-gapW);
      x0=Math.max(0,cs[0]-cardW);
      // 面板右边界 = 卡片块右侧第一条“宽”的底色列
      for(const r of allRuns){
        if(r.w>maxGapW&&r.a>x0+cardW*1.2){blockR=r.a;break}
      }
      if(!blockR)blockR=cs[cs.length-1]+pitch-gapW/2;
      nCols=Math.max(1,Math.min(8,Math.round((blockR-x0+gapW)/pitch)));
    }
    if(!cardW){
      // 兜底：游戏 UI 以屏高为基准缩放（2556x1179 实测 卡宽183 / 间距189 / 首卡264）
      fallback=true;
      cardW=Math.round(H*0.155);pitch=Math.round(H*0.16);x0=Math.round(H*0.224);nCols=4;
      blockR=Math.round(x0+cardW*4);
    }
    return {x0:x0,pitch:pitch,cardW:cardW,nCols:nCols,blockR:blockR,fallback:fallback,gutters:cs.length};
  }
  // 等级条：横贯整排卡片的深色带
  function detectBands(pix,blockL,blockR,cardW){
    const L=pix.L,W=pix.W,H=pix.H;
    const bw=Math.max(1,blockR-blockL);
    const frac=new Float32Array(H);
    for(let y=0;y<H;y++){
      let c=0;const base=y*W;
      for(let x=blockL;x<blockR;x++)if(L[base+x]<110)c++;
      frac[y]=c/bw;
    }
    const minH=Math.max(8,Math.round(H*0.012));
    let cand=runsOf(H,function(y){return frac[y]>0.55},Math.round(H*0.06)).filter(function(r){return r.w>=minH});
    if(!cand.length)return [];
    // 等级条上面紧贴着一条亮金/白色的分隔条，立绘里的暗块没有
    const brightAbove=function(r){
      const y1=Math.max(0,r.a-1),y0=Math.max(0,r.a-7);
      let sum=0,n=0;
      for(let y=y0;y<=y1;y++){const base=y*W;for(let x=blockL;x<blockR;x++){sum+=L[base+x];n++}}
      return n?sum/n:0;
    };
    const marked=cand.filter(function(r){return brightAbove(r)>150});
    if(marked.length>=1)cand=marked;
    // 真等级条等距排列：立绘里的暗块会被筛掉
    const ap=findAP(cand.map(function(r){return r.c}),cardW*0.9,cardW*3,0.05);
    const out=[];
    for(const c of ap.members){
      let hit=null;
      for(const r of cand)if(!hit||Math.abs(r.c-c)<Math.abs(hit.c-c))hit=r;
      if(hit&&!out.some(function(o){return o.a===hit.a}))out.push({a:hit.a,b:hit.b,h:hit.w});
    }
    return out.sort(function(x,y){return x.a-y.a});
  }
  function detectCharGrid(pix){
    const cols=detectColumns(pix);
    const blockR=Math.min(pix.W,Math.round(cols.blockR));
    const bands=detectBands(pix,Math.round(cols.x0),blockR,cols.cardW);
    if(!bands.length)throw new Error('没找到角色卡片，请截完整的角色列表（要带上卡片下方的等级条）');
    return {x0:cols.x0,pitch:cols.pitch,cardW:cols.cardW,nCols:cols.nCols,fallback:cols.fallback,bands:bands,blockR:blockR};
  }

  // 等级条上沿那条细亮线在整排卡上都有，用它把每行卡片的位置再精修一次，
  // 免得行带拟合差几像素就把 Lv 数字切掉一半。
  function refineBand(pix,left,cardW,yPred){
    const x0=Math.max(0,Math.round(left+cardW*0.04)),x1=Math.min(pix.W,Math.round(left+cardW*0.96));
    const y0=Math.max(4,Math.round(yPred-18)),y1=Math.min(pix.H-5,Math.round(yPred+10));
    const mu={};
    for(let y=y0-4;y<=y1+4;y++){
      let s=0;const off=y*pix.W;
      for(let x=x0;x<x1;x++)s+=pix.L[off+x];
      mu[y]=s/Math.max(1,x1-x0);
    }
    let bestY=yPred,best=-1e9;
    for(let y=y0;y<=y1;y++){
      const ridge=mu[y]-(mu[y-4]+mu[y+4])/2;
      if(ridge>best){best=ridge;bestY=y}
    }
    return best>=25?bestY+1:yPred;
  }
  // 星标行（一排菱形 + 末尾「+N」数字）紧贴在等级条正上方。
  // 规则（来自游戏界面）：亮的菱形个数就是启灵数（0~3），末尾若还有数字，
  // 那是「超限 +N」的加值，两者相加才是完整启灵值（三启+12 → en=15）。
  // 排版特点：菱形等间距（约 0.2 卡宽）、宽约 0.075 卡宽，整组在卡内居中
  // （有数字时整体左移），所以不能按绝对位置判断，只能按「段」来分：
  // 前 3 段是菱形，第 4 段起是数字。
  function starRowBand(bandA,cardW){
    const mid=bandA-cardW*0.16,half=cardW*0.115;
    return {top:Math.round(mid-half),bot:Math.round(mid+half)};
  }
  function readStarRow(pix,left,cardW,bandA){
    const W=pix.W;
    const sb=starRowBand(bandA,cardW);
    const yTop=Math.max(0,sb.top),yBot=Math.min(pix.H-1,sb.bot);
    if(yBot<=yTop+4)return {lit:0,num:null,segs:[],band:sb};
    const xa=Math.max(0,Math.round(left+cardW*0.02)),xb=Math.min(W-1,Math.round(left+cardW*0.995));
    if(xb<=xa+6)return {lit:0,num:null,segs:[],band:sb};
    const h=yBot-yTop+1;
    const col=new Array(xb-xa+1);
    for(let x=xa;x<=xb;x++){
      let n=0;
      for(let y=yTop;y<=yBot;y++)if(pix.L[y*W+x]>190)n++;
      col[x-xa]=n;
    }
    // 菱形在带里占一半左右的高度，单列亮像素 >= 3 就算“这一列有亮”
    const minW=Math.max(4,Math.round(cardW*0.030)),maxW=Math.round(cardW*0.16);
    const segs=mergeRuns(runsOf(col.length,function(i){return col[i]>=3},Math.round(cardW*0.3)),1)
      .map(function(r){return {a:r.a+xa,b:r.b+xa,w:r.w}})
      .filter(function(r){return r.w>=minW&&r.w<=maxW});
    if(!segs.length)return {lit:0,num:null,segs:[],band:sb};
    // 前 3 段是菱形；第 4 段起是数字，中间可能被字间空隙切开，按小间隔合并
    const dio=segs.slice(0,3),rest=segs.slice(3);
    let num=null;
    if(rest.length){
      let a=rest[0].a,b=rest[0].b;
      for(let i=1;i<rest.length;i++){
        if(rest[i].a-b<=Math.round(cardW*0.06))b=rest[i].b;else break;
      }
      num={x:a-3,y:yTop-2,w:Math.min(xb,b+3)-a+6,h:h+4};
    }
    return {lit:dio.length,num:num,segs:segs,band:sb};
  }
  // 等级条里的「Lv.60」文字是居中的。列起点有时会差几个像素，
  // 干脆按“这一条里有亮像素的列”把文字框出来，比按比例估更稳。
  function locateLevelText(pix,left,cardW,bandA,bandB){
    // 等级条是横贯整排的深色带，文字落在带内。有的截图下面一行会被
    // 卡片金色底条压住，文字只剩上半截，所以不能直接拿 band.b 当底边：
    // 先按亮度剖面找“字所在的那几行”（字行偏暗、底条那一行整行发亮），再横向框。
    const W=pix.W,H=pix.H;
    const a=Math.round(bandA);
    const top=Math.max(0,a+1),bot=Math.min(H-1,Math.round(a+cardW*0.24));
    const xa=Math.max(0,Math.round(left+cardW*0.12)),xb=Math.min(W-1,Math.round(left+cardW*0.95));
    const wid=Math.max(1,xb-xa+1);
    // 字是接近纯白（>210），等级条底色只有 70~90，用高阈值就能把字和
    // 下面那条金色/渐变底条分开。逐行统计后把连成一片的行聚成段、取最长的一段，
    // 避免下方零星亮点把文字高度撑大（撑大后二值图里字只占上半截，OCR 会读错）。
    const trows=[];
    for(let y=top;y<=bot;y++){
      const off=y*W;let n=0;
      for(let x=xa;x<=xb;x++)if(pix.L[off+x]>210)n++;
      if(n>=3&&n<=wid*0.55)trows.push(y);
    }
    const segsY=[];
    if(trows.length){
      let sa=trows[0],sb=trows[0];
      for(let i=1;i<trows.length;i++){
        if(trows[i]-sb<=2)sb=trows[i];
        else{segsY.push([sa,sb]);sa=trows[i];sb=trows[i]}
      }
      segsY.push([sa,sb]);
    }
    let y0=-1,y1=-1;
    if(segsY.length){
      let best=segsY[0],bl=best[1]-best[0];
      for(const sg of segsY){const l=sg[1]-sg[0];if(l>=bl){bl=l;best=sg}}
      y0=best[0];y1=best[1];
    }
    if(y0<0||y1-y0<3){y0=top;y1=Math.min(bot,Math.max(Math.round(bandB||0),a+Math.round(cardW*0.13)))}
    let minX=-1,maxX=-1;
    for(let x=xa;x<=xb;x++){
      let n=0;
      for(let y=y0;y<=y1;y++)if(pix.L[y*W+x]>210)n++;
      if(n>=Math.max(2,(y1-y0+1)*0.15)){if(minX<0)minX=x;maxX=x}
    }
    if(minX<0||maxX-minX<cardW*0.08)return null;
    return {x:minX-3,w:Math.min(W-1,maxX+3)-(minX-3),y:y0,h:Math.max(8,y1-y0+1)};
  }
  // 「Lv.62」这种文字直接整串丢给 OCR 时，小数点会把行高估计带偏，
  // 数字经常被读丢（62 读成 02）。这里先按列把字切成字块，用小数点做分隔符，
  // 只把后面的数字段送进 OCR——数字段的宽高比稳定，识别率明显更好。
  function digitBoxOf(pix,box){
    const W=pix.W,H=pix.H;
    const x0=Math.max(0,Math.round(box.x)),x1=Math.min(W-1,Math.round(box.x+box.w)-1);
    const y0=Math.max(0,Math.round(box.y)),y1=Math.min(H-1,Math.round(box.y+box.h)-1);
    if(x1<=x0||y1<=y0)return box;
    const th=Math.max(1,y1-y0+1);
    const raw=[];let sa=-1;
    for(let x=x0;x<=x1;x++){
      let hit=false;
      for(let y=y0;y<=y1;y++)if(pix.L[y*W+x]>210){hit=true;break}
      if(hit){if(sa<0)sa=x;if(raw.length&&raw[raw.length-1].b===x-1)raw[raw.length-1].b=x;else raw.push({a:x,b:x})}
      else if(sa>=0)sa=-1;
    }
    if(raw.length<2)return box;
    const info=raw.map(function(r){
      let t=y1,b=y0;
      for(let x=r.a;x<=r.b;x++)for(let y=y0;y<=y1;y++)if(pix.L[y*W+x]>210){if(y<t)t=y;if(y>b)b=y}
      return {a:r.a,b:r.b,top:t,bot:b,h:b-t+1};
    });
    // 小数点：很矮（< 字高 22%）且贴着底线。可能有多个（L 的衬线也像），从右往左找最后一个
    const dotMax=Math.max(4,th*0.22),botMin=y1-th*0.35;
    let dot=-1;
    for(let i=info.length-1;i>=0;i--){
      const g=info[i];
      if(g.h<=dotMax&&g.bot>=botMin){dot=i;break}
    }
    const tall=info.filter(function(g){return g.h>=th*0.55});
    let digits;
    if(dot>=0)digits=info.slice(dot+1).filter(function(g){return g.h>=th*0.55});
    else digits=tall.slice(-2);
    if(!digits.length)digits=tall.slice(-2);
    if(!digits.length)return box;
    digits=digits.slice(-2);
    const a=digits[0].a,b=digits[digits.length-1].b;
    let t=y1,bt=y0;
    for(const g of digits){if(g.top<t)t=g.top;if(g.bot>bt)bt=g.bot}
    const pad=Math.max(1,Math.round(th*0.08));
    // n = 数字由几个字形组成；OCR 读出来的位数和它对不上就说明读错了
    return {x:a-pad,y:t-pad,w:(b-a+1)+pad*2,h:(bt-t+1)+pad*2,n:digits.length};
  }
  async function analyzeChar(img,onProgress){
    const full=makeCanvas(img.naturalWidth,img.naturalHeight);
    const fctx=ctxOf(full);fctx.drawImage(img,0,0,full.width,full.height);
    const pix=pixelData(full);
    onProgress&&onProgress('定位卡片…');
    const grid=detectCharGrid(pix);
    const x0=grid.x0,pitch=grid.pitch,cardW=grid.cardW,nCols=grid.nCols,bands=grid.bands;
    // 模板匹配在缩略图上跑；数字识别用原图（缩太小会糊）
    const tscale=Math.min(1,WORK_W/full.width);
    const thumb=makeCanvas(Math.round(full.width*tscale),Math.round(full.height*tscale));
    const tctx=ctxOf(thumb);tctx.drawImage(full,0,0,thumb.width,thumb.height);
    const tpls=await buildCharTemplates(onProgress);
    const out=[];const dbg=[];const taken=new Set();
    for(let bi=0;bi<bands.length;bi++){
      const band=bands[bi];
      for(let j=0;j<nCols;j++){
        const left=Math.round(x0+j*pitch);
        if(left+cardW*0.6>full.width)break;
        const bandA=band.a;
        // 立绘区：卡顶到等级条之间（比例按 2556x1179 实测反推）
        const artY=bandA-cardW*1.40;
        const box={x:left,y:artY,w:cardW,h:cardW*1.15};
        if(box.y<-cardW*0.2||box.y+box.h>full.height)continue;
        const tbox={x:box.x*tscale,y:box.y*tscale,w:box.w*tscale,h:box.h*tscale};
        const match=matchSquare(tctx,tbox,tpls,{color:true,scales:[0.5,0.6,0.7,0.8,0.9,1.0]});
        const top=match[0],second=match[1];
        const rec={cell:{r:bi,j:j},left:left,bandA:bandA,tops:match.slice(0,3).map(function(x){return {id:x.id,s:Number(x.score.toFixed(3))}})};
        dbg.push(rec);
        if(!top||top.score<0.42){rec.skip='match';continue}
        // 一张图里同一个角色只会出现一次。若最佳匹配已被别的卡占掉，说明至少有一边认错了，
        // 改用还没被占用的次优候选——比把两个不同的角色并成一条要合理得多。
        let pick=top;
        if(taken.has(pick.id)){
          const alt=match.find(function(o){return !taken.has(o.id)&&o.score>=0.40});
          if(alt)pick=alt;
        }
        taken.add(pick.id);
        // 等级：等级条里 “Lv.xx” 的数字（文字居中，数字在 0.50~0.80 卡宽）
        let lv=null,en=null;
        // 等级：等级条里的数字。等级条上下沿各有一条亮线，框位差几像素就会把数字切一半，
        // 所以按几个固定偏移各试一次，取第一个像样（1~99）的结果。
        // 「Lv.xx」是居中的，用它的实际位置反过来校正这一格的列起点（列检测偶尔会偏几像素）
        const loc=locateLevelText(pix,left,cardW,bandA,band.b);
        const leftAdj=left;
        const lvH=Math.max(10,Math.round(band.b>bandA?band.b-bandA:cardW*0.14));
        const lvRaw=[loc,{x:leftAdj+cardW*0.50,y:bandA+1,w:cardW*0.30,h:lvH}].filter(Boolean);
        const lvBoxes=lvRaw.map(function(b){return digitBoxOf(pix,b)});
        if(TRACE())rec.lvDigits=lvBoxes.map(function(b){return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.w),h:Math.round(b.h)}});
        const lvRaws=[];
        // 这套字体是像素化的衬线字：psm 7（单行）会把「60」读成「6」、
        // 「68」读成「638」；psm 8（单词）放大到 48px 高实测 24 格全对。
        // 再配一组 psm 13 做交叉验证。字形数和读数位数对不上的一律不采信——
        // 截图底部被裁掉时会读出一个残缺的字（「60」读成「4」），
        // 与其写进 BOX 一个错数字，不如留空让用户补。
        const LSPECS=[{scale:8,targetH:48,psm:'8'},{scale:12,targetH:60,psm:'13'}];
        for(const bx of lvBoxes){
          if(lv!=null)break;
          const votes=[];
          for(const sp of LSPECS){
            try{
              const r=await readDigits(fctx,bx,{whitelist:'0123456789',thr:205,scale:sp.scale,targetH:sp.targetH,psm:sp.psm});
              lvRaws.push(r.text);
              if(TRACE()&&!rec.lvPng)rec.lvPng=r.png;
              const m=String(r.text||'').match(/\d{1,3}/);
              if(!m)continue;
              const v=Number(m[0]);
              if(v<1||v>MAX_LV_GUESS)continue;
              votes.push({v:v,fit:bx.n?String(v).length===bx.n:null});
            }catch(e){lvRaws.push('ERR:'+e.message)}
          }
          const fit=votes.filter(function(x){return x.fit===true})[0];
          if(fit){lv=fit.v;break}
          // 位置框没有字形数时，只有两次识别一致才认
          if(bx.n==null&&votes.length>=2&&votes[0].v===votes[1].v){lv=votes[0].v;break}
        }
        rec.lvRaws=lvRaws;
        // 启灵：星标行最右侧那颗深色菱形里的数字（0-3 是「N 启」，4 是超限，5-15 是超限 +N）
        // 深色菱形直径只有十几像素，框差 1~2px 数字就糊了，所以几组阈值/偏移都试一遍。
        let enLow=false;
        rec.lvBox=loc;rec.lv=lv;
        try{
          const star=readStarRow(pix,leftAdj,cardW,bandA);
          rec.star=star;rec.lit=star.lit;
          // 亮菱形数直接就是启灵数；数字只有「超限 +N」时才有
          const base=Math.min(3,star.lit);
          const variants=star.num?[
            {x:star.num.x,y:star.num.y,w:star.num.w,h:star.num.h,thr:175},
            {x:star.num.x-2,y:star.num.y-2,w:star.num.w+4,h:star.num.h+4,thr:150},
            {x:star.num.x,y:star.num.y,w:star.num.w,h:star.num.h,thr:195}
          ]:[];
          const votes=[];const raws=[];const pngs=[];
          for(const v of variants){
            const num=await readDigits(fctx,{x:v.x,y:v.y,w:v.w,h:v.h},{whitelist:'0123456789',scale:6,thr:v.thr});
            raws.push(String(num.text||''));
            if(TRACE()&&pngs.length<3)pngs.push({box:{x:Math.round(v.x),y:Math.round(v.y),w:Math.round(v.w),h:Math.round(v.h)},thr:v.thr,png:num.png});
            const m=String(num.text||'').match(/\d{1,2}/);
            if(!m)continue;
            const val=Number(m[0]);
            // 界面上不会出现「+0」：数字段存在时读出 0 一定是把菱形边角当成了字
            if(val>=1&&val<=15)votes.push(val);
          }
          rec.enRaws=raws;rec.votes=votes.slice();rec.enPngs=pngs;
          if(votes.length){
            // 多数票一致才算确定；只有一组读出来就采用但让用户核对
            let best=votes[0],bestN=0;
            for(const v of votes){const n=votes.filter(x=>x===v).length;if(n>bestN){best=v;bestN=n}}
            en=base+best;
            enLow=bestN<2;
          }else{
            // 没有数字：纯启灵（0~3），亮几颗就是几启，这条是确定的
            en=base;enLow=star.num?true:false;
          }
          en=Math.min(en,15);
        }catch(e){en=null;enLow=true;rec.err=String(e&&e.message||e)}
        rec.en=en;
        out.push({id:pick.id,score:pick.score,margin:pick.score-(second?second.score:0),options:match.slice(0,5),lv:lv,en:en,enLow:enLow,box:box});
      }
    }
    return {rows:out,note:'识别到 '+out.length+' 张卡片',grid:grid,dbg:TRACE()?dbg:undefined};
  }

  /* ---------- 命轮页 ---------- */
  function spreadRuns(list,offset){
    return list.map(function(r){
      return {a:r.a+offset,b:r.b+offset,c:r.c+offset,w:r.w};
    });
  }
  function detectWheelGrid(pix){
    const W=pix.W,H=pix.H;
    /* 列：卡与卡之间露出页面底色（一条低方差竖缝） */
    const xq0=Math.round(W*0.08),xq1=Math.round(W*0.72);
    const cs=axisStats(pix,xq0,xq1,Math.round(H*0.10),Math.round(H*0.90),'x');
    const medC=medianOf(cs.map(function(o){return o.std}));
    const stdAt=function(x){const i=Math.round(x)-xq0;return (i>=0&&i<cs.length)?cs[i].std:0};
    const maxGapW=Math.max(12,Math.round(W*0.013));
    let runs=mergeRuns(runsOf(cs.length,function(x){return cs[x].std<Math.max(6,medC*0.22)},W),3)
      .map(function(r){return {a:r.a+xq0,b:r.b+xq0,c:r.c+xq0,w:r.w}})
      .filter(function(r){return r.w>=3&&r.w<=maxGapW});
    let ap=findAP(runs.map(function(r){return r.a}),W*0.035,W*0.2,0.06);
    let cols=ap.members;
    // 真间隙两侧都得是卡面（有内容），列表左边的空白会被筛掉
    if(cols.length>=2){
      const keep=cols.filter(function(c){return stdAt(c-ap.pitch*0.45)>medC*0.5&&stdAt(c+ap.pitch*0.45)>medC*0.5});
      if(keep.length>=2)cols=keep;
    }
    let pitchX=0,cardW=0,x0=0,nCols=0,fallback=false;
    if(cols.length>=2){
      const ds=[];for(let i=1;i<cols.length;i++)ds.push(cols[i]-cols[i-1]);
      pitchX=medianOf(ds);
    }
    if(cols.length>=2&&pitchX>W*0.02&&pitchX<W*0.2){
      const gapW=medianOf(runs.map(function(r){return r.w}))||Math.round(W*0.004);
      cardW=Math.max(Math.round(W*0.02),pitchX-gapW);
      x0=Math.max(0,cols[0]-cardW);
      // 每条间隙的左缘就是某张卡的右边缘，所以间隙数 = 列数
      nCols=cols.length;
    }
    if(!cardW){
      // 兜底比例（2556x1179 实测：卡宽 151、间距 179、首列 395）
      fallback=true;
      cardW=Math.round(H*0.128);pitchX=Math.round(H*0.152);x0=Math.round(H*0.335);nCols=8;
    }
    /* 行：每张卡底部星标行的上沿是一条横贯整个网格的亮线，用它当锚点最稳 */
    const blockL=Math.max(0,Math.round(x0)),blockR=Math.min(W,Math.round(x0+pitchX*(nCols-1)+cardW));
    const rs=axisStats(pix,blockL,blockR,0,H,'y');
    const medR=medianOf(rs.map(function(o){return o.mu}));
    let rowRuns=mergeRuns(runsOf(rs.length,function(y){return rs[y].mu<medR*0.72},Math.round(H*0.05)),3)
      .filter(function(r){return r.w>=3});
    // 这行“是不是一条横贯整个网格的亮线”：亮像素占该行宽度的比例
    const lineThr=clamp(medR*1.9,110,215),bw=Math.max(1,blockR-blockL);
    const lineRuns=mergeRuns(runsOf(H,function(y){
      let n=0;const off=y*W;
      for(let x=blockL;x<blockR;x++)if(pix.L[off+x]>lineThr)n++;
      return n>bw*0.72;
    },6),2).filter(function(r){return r.w>=1&&r.w<=Math.round(H*0.02)});
    const ap1=findAP(lineRuns.map(function(r){return r.c}),H*0.10,H*0.35,0.05);
    let rows=ap1.members;
    let pitchY=0,cardH=0,y0=0;
    if(rows.length>=2){
      const ds=[];for(let i=1;i<rows.length;i++)ds.push(rows[i]-rows[i-1]);
      pitchY=medianOf(ds);
      // 卡槽 = 分隔线往上一个卡高，往下到星标行底
      cardH=Math.round(pitchY*0.885);
      y0=Math.max(0,Math.round(rows[0]-cardH*0.83));
    }
    if(!pitchY){
      const ap2=findAP(rowRuns.map(function(r){return r.c}),H*0.03,H*0.4,0.05);
      const r2=ap2.members;
      if(r2.length>=2){
        const ds=[];for(let i=1;i<r2.length;i++)ds.push(r2[i]-r2[i-1]);
        const gh=medianOf(rowRuns.map(function(r){return r.w}))||Math.round(H*0.004);
        pitchY=medianOf(ds);
        cardH=Math.max(Math.round(H*0.03),pitchY-gh);
        y0=Math.max(0,Math.round(r2[0]-gh/2-cardH));
        rows=r2;
      }
    }
    if(!cardH){
      fallback=true;
      cardH=Math.round(H*0.132);pitchY=Math.round(H*0.178);y0=Math.round(H*0.116);
    }
    return {x0:x0,y0:y0,pitchX:pitchX,pitchY:pitchY,cardW:cardW,cardH:cardH,nCols:nCols,fallback:fallback,
      rowGaps:rows,colGaps:cols};
  }
  // 把卡面四边形从缩略图里采样成 ART_W×ART_H 的直立小图
  function warpWheelArt(canvas,left,top,cardW,cardH,tscale){
    const p=WHEEL_QUAD.map(function(q){return [(left+cardW*q[0])*tscale,(top+cardH*q[1])*tscale]});
    const TL=p[0],TR=p[1],BL=p[3];
    const su=[TR[0]-TL[0],TR[1]-TL[1]],sv=[BL[0]-TL[0],BL[1]-TL[1]];
    const det=su[0]*sv[1]-su[1]*sv[0];
    if(!det||!isFinite(det))return null;
    // 求 A：A·su=(ART_W,0)、A·sv=(0,ART_H)，即 A=N·inv(M)
    const i00=sv[1]/det,i01=-sv[0]/det,i10=-su[1]/det,i11=su[0]/det;
    const A00=ART_W*i00,A01=ART_W*i01,A10=ART_H*i10,A11=ART_H*i11;
    const c=makeCanvas(ART_W,ART_H),cc=ctxOf(c);
    cc.setTransform(A00,A10,A01,A11,-(A00*TL[0]+A01*TL[1]),-(A10*TL[0]+A11*TL[1]));
    try{cc.drawImage(canvas,0,0)}catch(e){return null}
    return c;
  }
  function matchWheel(patchCanvas,tpls){
    const d=normPatchRGB(ctxOf(patchCanvas),0,0,ART_W,ART_H,TAG_N);
    const best=new Map(),tagOf=new Map();
    for(const t of tpls){
      const v=dot(d,t.d3);
      if(!(best.get(t.id)>=v)){best.set(t.id,v);tagOf.set(t.id,t.tag)}
    }
    return [...best.entries()].map(function(e){return {id:e[0],score:e[1],tag:tagOf.get(e[0])}}).sort(function(a,b){return b.score-a.score});
  }
  async function analyzeWheel(img,onProgress){
    const full=makeCanvas(img.naturalWidth,img.naturalHeight);
    const fctx=ctxOf(full);fctx.drawImage(img,0,0,full.width,full.height);
    const pix=pixelData(full);
    onProgress&&onProgress('定位命轮卡…');
    const grid=detectWheelGrid(pix);
    const tscale=Math.min(1,WORK_W/full.width);
    const thumb=makeCanvas(Math.round(full.width*tscale),Math.round(full.height*tscale));
    ctxOf(thumb).drawImage(full,0,0,thumb.width,thumb.height);
    const tpls=await buildWheelTemplates(onProgress);
    const nRows=grid.rowGaps&&grid.rowGaps.length?grid.rowGaps.length:Math.max(1,Math.floor((full.height-grid.y0)/grid.pitchY));
    const out=[];const dbgSkip=[];const used=new Set();
    for(let r=0;r<nRows;r++){
      const top=Math.round(grid.y0+r*grid.pitchY);
      if(top+grid.cardH>full.height+2)break;
      onProgress&&onProgress(`识别命轮 ${r+1}/${nRows} 排`);
      for(let j=0;j<grid.nCols;j++){
        const left=Math.round(grid.x0+j*grid.pitchX);
        if(left+grid.cardW*0.6>full.width)break;
        // 网格是按整图统计出来的，个别卡位会差几像素；按比例硬切会把边框切进来，
        // 匹配分数就会挤成一片。这里先在一小片范围里试几组偏移，取分数最高的那个
        // 位置再裁——「先识别再定裁剪位置」比按坐标硬切稳。
        let patch=null,match=null,offx=0,offy=0;
        const probeAt=function(dx,dy){
          const pa=warpWheelArt(thumb,left+dx,top+dy,grid.cardW,grid.cardH,tscale);
          if(!pa)return null;
          const mm=matchWheel(pa,tpls);
          return mm.length?{pa:pa,mm:mm}:null;
        };
        for(const dy of [-12,-6,0,6,12]){
          for(const dx of [-12,-6,0,6,12]){
            const t=probeAt(dx,dy);
            if(t&&(!match||t.mm[0].score>match[0].score)){patch=t.pa;match=t.mm;offx=dx;offy=dy}
          }
        }
        if(match){
          for(const dy of [offy-3,offy,offy+3]){
            for(const dx of [offx-3,offx,offx+3]){
              const t=probeAt(dx,dy);
              if(t&&t.mm[0].score>match[0].score){patch=t.pa;match=t.mm;offx=dx;offy=dy}
            }
          }
        }
        if(!patch){if(TRACE())dbgSkip.push({cell:{r:r,j:j},score:-1,reason:'nopatch'});continue}
        const top1=match[0],second=match[1];
        if(!top1||top1.score<0.30){
          if(TRACE())dbgSkip.push({cell:{r:r,j:j},score:top1?top1.score:0,options:match.slice(0,3)});
          continue;
        }
        // 一张图里同一张命轮只可能出现一次。若这一格的最佳匹配已经被别的格子占了，
        // 说明至少有一格认错了，改用还没被占用的次优候选——比把两格并成一条更合理。
        let pick=top1;
        if(used.has(pick.id)){
          const alt=match.find(function(o){return !used.has(o.id)&&o.score>=0.22});
          if(alt)pick=alt;
        }
        used.add(pick.id);
        // 叠位：星标行最右那颗菱形里的数字，没有数字就是 0
        let stack=0;
        try{
          const rr=await readDigits(fctx,{x:left+grid.cardW*0.62,y:top+grid.cardH*0.78,w:grid.cardW*0.36,h:grid.cardH*0.22},{whitelist:'0123456789',scale:6,thr:150});
          const m=rr.text.match(/\d{1,2}/);
          if(m)stack=clamp(Number(m[0]),0,12);
        }catch(e){}
        out.push({id:pick.id,score:pick.score,margin:pick.score-(second?second.score:0),options:match.slice(0,5),stack:stack,
          unsure:pick.score<0.5||(pick.score-(second?second.score:0))<0.05,
          cell:{r:r,j:j},png:patch.toDataURL('image/jpeg',0.6)});
      }
    }
    return {rows:out,note:'识别到 '+out.length+' 张命轮',grid:grid,dbgSkip:TRACE()?dbgSkip:undefined};
  }

  /* ---------- 对外接口 ---------- */
  // 判定这张图是「角色列表」还是「命轮列表」：命轮页有 7 列窄卡 + 多条横贯亮线，角色页只有 4 列
  async function guessMode(img){
    try{
      const full=makeCanvas(img.naturalWidth,img.naturalHeight);
      ctxOf(full).drawImage(img,0,0,full.width,full.height);
      const g=detectWheelGrid(pixelData(full));
      if(g&&g.nCols>=5&&(g.rowGaps||[]).length>=2)return 'wheel';
    }catch(e){}
    return 'char';
  }
  async function analyzeFiles(files,{mode='auto',onProgress=()=>{}}={}){
    const results={rows:[],note:''};
    const all=[];
    for(let i=0;i<files.length;i++){
      onProgress(`(${i+1}/${files.length}) 读取图片…`);
      const img=await blobToImage(files[i]);
      let kind=mode;
      if(mode==='auto'){kind=await guessMode(img);onProgress(`(${i+1}/${files.length}) 判定为${kind==='wheel'?'命轮页':'角色页'}`)}
      const fn=kind==='wheel'?analyzeWheel:analyzeChar;
      try{
        const r=await fn(img,msg=>onProgress(`(${i+1}/${files.length}) ${msg}`));
        for(const row of r.rows){row.file=i;row.kind=kind;all.push(row)}
        if(r.dbg)results.dbg=(results.dbg||[]).concat(r.dbg);
        if(r.dbgSkip)results.dbgSkip=(results.dbgSkip||[]).concat(r.dbgSkip);
        if(r.grid&&!results.grid)results.grid=r.grid;
      }catch(e){
        console.warn('analyze failed',e);
        results.note=(results.note?results.note+'；':'')+`第 ${i+1} 张：${e.message}`;
      }
    }
    // 同一角色多张图出现时保留置信度最高的
    const merged=new Map();
    for(const row of all){
      const key=row.kind+':'+row.id;
      const old=merged.get(key);
      if(!old||row.score>old.score)merged.set(key,row);
    }
    results.rows=[...merged.values()].sort((a,b)=>b.score-a.score);
    results.note=results.note||`共 ${results.rows.length} 条（同角色只保留最高置信度）`;
    return results;
  }

  window.MorimensBoxOCR={
    analyzeFiles,
    // 调试：按同一套网格裁出“等级条 / 启灵数字”小图并做 OCR，供核对框位与识别质量
    async probe(file,limit){
      const n=limit||4;
      const img=await blobToImage(file);
      const full=makeCanvas(img.naturalWidth,img.naturalHeight);
      const fctx=ctxOf(full);fctx.drawImage(img,0,0,full.width,full.height);
      const pix=pixelData(full);
      const g=detectCharGrid(pix);
      const out=[];
      for(const band of g.bands){
        for(let j=0;j<g.nCols&&out.length<n;j++){
          const left=Math.round(g.x0+j*g.pitch),cardW=g.cardW;
          const bandA=band.a;
          const lvBox=locateLevelText(pix,left,cardW,bandA,band.b)||{x:left+cardW*0.50,y:bandA+1,w:cardW*0.30,h:Math.max(10,cardW*0.14)};
          const star=readStarRow(pix,left,cardW,bandA);
          const enBox=star.num||{x:left+cardW*0.70,y:star.band.top,w:cardW*0.22,h:star.band.bot-star.band.top};
          const crop=function(b,s){
            const c=makeCanvas(Math.round(b.w*s),Math.round(b.h*s));
            ctxOf(c).drawImage(full,b.x,b.y,b.w,b.h,0,0,c.width,c.height);
            return c.toDataURL('image/png');
          };
          let lvText='',enText='';
          let lvPng2='',alt6='',alt13='';
          try{const rr=await readDigits(fctx,lvBox,{whitelist:'0123456789',scale:5,thr:175});lvText=rr.text;lvPng2=rr.png}catch(e){lvText='ERR '+e.message}
          try{alt6=(await readDigits(fctx,lvBox,{whitelist:'0123456789',scale:5,thr:200,psm:'6'})).text}catch(e){}
          try{alt13=(await readDigits(fctx,lvBox,{whitelist:'0123456789',scale:5,thr:175,invert:true})).text}catch(e){}
          try{enText=(await readDigits(fctx,enBox,{whitelist:'0123456789',scale:6,thr:165})).text}catch(e){enText='ERR '+e.message}
          out.push({i:out.length,left:left,band:bandA,lvText:lvText,enText:enText,alt6:alt6,alt13:alt13,
            lvPng:crop(lvBox,4),enPng:crop(enBox,6),bin:lvPng2});
        }
      }
      return out;
    },
    // 调试：命轮页网格 + 每格匹配候选，用于核对框位与模板
    async probeWheel(file,limit){
      const img=await blobToImage(file);
      const full=makeCanvas(img.naturalWidth,img.naturalHeight);
      const fctx=ctxOf(full);fctx.drawImage(img,0,0,full.width,full.height);
      const pix=pixelData(full);
      const grid=detectWheelGrid(pix);
      const tscale=Math.min(1,WORK_W/full.width);
      const thumb=makeCanvas(Math.round(full.width*tscale),Math.round(full.height*tscale));
      ctxOf(thumb).drawImage(full,0,0,thumb.width,thumb.height);
      const tpls=await buildWheelTemplates();
      const nRows=grid.rowGaps&&grid.rowGaps.length?grid.rowGaps.length:Math.max(1,Math.floor((full.height-grid.y0)/grid.pitchY));
      const cells=[];
      for(let r=0;r<nRows;r++){
        const top=Math.round(grid.y0+r*grid.pitchY);
        if(top+grid.cardH>full.height+2)break;
        for(let j=0;j<grid.nCols;j++){
          const left=Math.round(grid.x0+j*grid.pitchX);
          if(left+grid.cardW*0.6>full.width)break;
          if(limit&&cells.length>=limit)break;
          const patch=warpWheelArt(thumb,left,top,grid.cardW,grid.cardH,tscale);
          if(!patch)continue;
          const match=matchWheel(patch,tpls);
          let st='';
          try{st=(await readDigits(fctx,{x:left+grid.cardW*0.62,y:top+grid.cardH*0.78,w:grid.cardW*0.36,h:grid.cardH*0.22},{whitelist:'0123456789',scale:6,thr:150})).text}catch(e){st='ERR'}
          cells.push({r:r,j:j,st:st,top5:match.slice(0,5),id:match[0]?match[0].id:'',score:match[0]?match[0].score:0,
            png:patch.toDataURL('image/jpeg',0.8)});
        }
      }
      return {tpls:tpls.length,err:wheelTplErr,grid:grid,W:full.width,H:full.height,cells:cells};
    },
    // 调试用：把检测框画回图片（1:1 原分辨率裁剪），方便人工核对
    async debug(file,mode){
      const kind=mode||'char';
      const img=await blobToImage(file);
      const full=makeCanvas(img.naturalWidth,img.naturalHeight);
      const ctx=ctxOf(full);ctx.drawImage(img,0,0,full.width,full.height);
      const pix=pixelData(full);
      const rect=function(b,color,w){ctx.strokeStyle=color;ctx.lineWidth=w||2;ctx.strokeRect(b.x,b.y,b.w,b.h)};
      const info=[];
      let grid=null;
      if(kind==='wheel'){
        grid=detectWheelGrid(pix);
        const nRows=Math.max(1,Math.round((full.height-grid.y0)/grid.pitchY));
        for(let r=0;r<nRows;r++){
          const top=Math.round(grid.y0+r*grid.pitchY);
          if(top+grid.cardH*0.7>full.height)break;
          for(let j=0;j<grid.nCols;j++){
            const left=Math.round(grid.x0+j*grid.pitchX);
            if(left+grid.cardW*0.6>full.width)break;
            rect({x:left,y:top,w:grid.cardW,h:grid.cardH},'#ff3860',2);
            rect({x:left+grid.cardW*0.58,y:top+grid.cardH*0.76,w:grid.cardW*0.42,h:grid.cardH*0.24},'#00d68f',2);
            info.push({x:left,y:top});
          }
        }
      }else{
        grid=detectCharGrid(pix);
        for(const band of grid.bands){
          for(let j=0;j<grid.nCols;j++){
            const left=Math.round(grid.x0+j*grid.pitch);
            if(left+grid.cardW*0.6>full.width)break;
            const art={x:left,y:band.a-grid.cardW*1.40,w:grid.cardW,h:grid.cardW*1.15};
            const lv={x:left+grid.cardW*0.04,y:band.a+grid.cardW*0.005,w:grid.cardW*0.92,h:grid.cardW*0.18};
            const en={x:left+grid.cardW*0.60,y:band.a-grid.cardW*0.26,w:grid.cardW*0.38,h:grid.cardW*0.20};
            rect(art,'#ff3860',2);rect(lv,'#00d68f',2);rect(en,'#3b82f6',2);
            info.push({x:left,y:band.a,band:band.a});
          }
        }
      }
      // 只回传左侧面板那块，省得图太大
      const cropW=Math.min(full.width,Math.round(full.width*0.72));
      const crop=makeCanvas(cropW,full.height);
      ctxOf(crop).drawImage(full,0,0);
      return {dataUrl:crop.toDataURL('image/jpeg',0.8),info:info,W:full.width,H:full.height,
        grid:JSON.parse(JSON.stringify(grid,function(k,v){return typeof v==='object'&&v&&v.length>40?['…'+(v.length)]:v}))};
    }
  };
})();
