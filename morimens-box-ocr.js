/* 忘忘看报 · 截图识别（角色等级 / 启灵 / 命轮叠位）
   纯前端：先用金色星条定位卡片网格，再用头像/命轮卡面做模板匹配认人，
   等级 / 启灵 / 叠位这些数字用自带的字形模板分类器认（不联网、不下载任何引擎）。
   识别结果一律返回候选列表，由 UI 让人确认。 */
(()=>{
  const WORK_W=1200;                     // 工作宽度，够认数字又不至于太慢
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const MAX_LV_GUESS=90;
  // 字形匹配分（0~1，乘以 100 记为 conf）。实测：样本内正确匹配 p1=0.752；
  // 把某一类抽掉再拿同类样本去认，最高只到 0.599 —— 所以 0.68 能干净地分开
  // 「认得对」和「这一类模板根本没有」，认不准就留空，绝不写一个猜出来的数字。
  // 截图底部那一排会被裁掉，字形只有 21px 高（正常 27px），匹配分会掉到 0.6 上下 ——
  // 所以门槛按最差情况定；真错读基本都在 0.55 以下，且字段数对不上会被另外两道检查拦掉。
  const LV_MIN_CONF=60;
  // 启灵 / 叠位那个数字只有十几像素高，正确读法的分实测 85~97%，错读全在 69% 以下，
  // 所以门槛反而要更高：空槽位最容易被认成「1」。
  const EN_MIN_CONF=80;

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

  /* ---------- 数字识别：自带字形模板分类器 ---------- */
  // 这套界面用的是同一款像素衬线数字。通用 OCR（tesseract）在这种字体上会把 8 认成 3、
  // 数字第一位被菱形/描边吃掉，怎么调阈值都压不下去。改成「切字 → 归一化 → 和仓库自带的
  // 字形模板做归一化互相关」：同一款字体下模板法比通用模型准得多，也不用再带 11MB 的
  // wasm + traineddata，手机上还快一个数量级。
  const GW=14,GH=18;               // 归一化位图尺寸（宽 × 高）
  // 每个模板是 GW*GH 个 2bit 像素（0=背景 … 3=墨），base64 存。
  // 由 scripts/gen-glyph-proto.mjs 从 60 格人工标注的真实截图生成（每类最多 3 份，跨图取样）。
  // 缺 "3"：现有样本里没有出现过 3，等补到样本再加（缺类时靠分数门槛拒识，不会写成错数字）。
  const DIGIT_PROTO_B64={"0":["APkWAKSqAZBbaQC9kBvkBvlRb4Bv+QL4li+Ab/kC+JYvgG/5AviWL4Bv9Qb4Rm6Qb9AGuQG5kRtAqmoApL4B","kPoGQKqqAeVGbpAv4Bv6ArnhG5AfvgH59guQb78A+fYLkG+/APnmG5BvvgH5oS+QG/lCvkFu5QaQqysA+W8B","kPoGQKqqAeVGbpAv4Bv6ArnhG5AfvgH59guQb78A+fYLkG+/APnmG5BvugH5kS+QG/lCvkFu5AaQqi8A+b4B"],"1":["AKUCAKQvAFD6AgCULwAA+AIAgC8AAPgCAIAvAAD4AgCALwAA+AIAgC8AAPgCAIAvAAD4AgCALwBA+RYAqa8G","AKUCAKUvAJD+AgCULwAA+QIAkC8AAPkCAJAvAAD5AgCQLwAA+QIAkC8AAPkCAJAvAAD5AgCQbwBA/hYA+b8B","AKUCAKUvAJD+AgCULwAA+QIAkC8AAPkCAJAvAAD5AgCQLwAA+QIAkC8AAPkCAJAvAAD5AgCQbwBA/hoA+b8B"],"2":["AJUWAKSqBkCqvgEUkBsAALkBAJAbAAC5AQCQGwAAaQAApAEAkBoAAGoAAKQBAFAGAEBaUADkqhqQ/79B/v8b","AOkbAJSqBkBFuQEUkBsAALkBAJAbAAC5AQCQCwAAaQAApAEAkAYAQBoAAGQAAJABAEBaVQD5qhqQ/78B+f4b","AOlbAJTqBkBFuQEUkBsAALkBAJAbAAC5AQCQCwAAaQAApAEAkAYAQBoAAGQAAJABAEBaVQD5qhrQ/79B/vob"],"4":["AABUAACQAQBAGgAAaQAAkAYAQFoAAKkaAGS5AZCWGwAZuQFlkRugqv4WquqvUar+FgCQGwAAuQEA5G8AkP4G","AABlAACQBgBAGgAAZAAAlAUAgGoBAKkaAJT5AlCVL0AZ+AJkgG+QFvlaaZW/VgH5GgCAbwAA+AIAlG8BkPpq","AABlAACQBgBAGgAAZAAAlAUAgGoBAKkaAJT5AlCVL0AZ+AKkgW+QG/laqZW/VgX5GgCAbwAA+AIAlG8BkPpq"],"5":["kP+/APn/BpCqWgBaAACkBQBArloA5P8aAKr+BkCVvgEAkBsAALgBAEAaAACkAQCQCgBAagBAqQFUqgWQqgUA","kP+/Af3/BqSqWkBaVQCkFQCQrxYA+b8aQKr+BlCVvwEA5G8AAPkGAJBvAAC5AQDQGwBQbgBUqgGlqgWQvgUA","kP+/APn/BqCqWkBaVQCkFQCQrxYA+b8aQKr+BlCVvwEA5G8AAPkGAJBvAAC5AQCQCwBQagBUqgGUqgWQvgUA"],"6":["AJRvAFCqBUCqBQC5BQDkBgCQbwAAuqUF4KuqAb+Zb/Ab5Bu/QL7xC5AfvwD58QuQG74BuZFb5AfkqmoA+W4B","AJC+AUCqBgCpFQDkBgCQGwBAvhUA5KoakK/qBvlWvpFvkG/5AvmWL4Bv+QL4li+Ab/UG+UWupRuQqmoApKoB","AECpAQClGgCpVgCUGwCQbgAAuQUA5FsWkK+qBvmWvpFvlG/5AvmWL4Bv+QL4lm+Ab/kG+UZukRuQqm4ApL8G"],"7":["+f//lv//b/n//5GqqhtVAKkAAJAGAABpAACkAQBAGgAAaAAAkAYAACoAAKQBAEAKAABpAACQBgBAGgAApAEA","+f//lv//b6mqvlFVlRsAAKkAAJAGAAAZAACkAQBABgAAaAAAkAYAABkAAKQAAEAGAABpAACgBgBAGgAApAEA","+f//lv//b6mq/lFVlRsAAKkAAJAGAAAZAACkAQBABgAAaQAAkAYAABkAAKQAAEAGAABpAACgBgBAGgAApAEA"],"8":["QOpbAKmqBpAauUFugB/kBvhGboEb5GupAfmrBkD+bwCl+hqkWr5RbpBv+QL4li+Ab/kG+EaukRuQq6oB6asG","QKoWAKmVBqQGuUEugBvkAqRBbpAb5FtpALqqAlD+GwCp+gakVr5RL5BfuQH4lhtAbrkB5FZvgBqkWmkAqaoB","QLoaAKmqBqRWaUAukBv5AriRb5Ab5FppQPqqBpD+GwCp/gakVr6Rb5BvuQH5lhuAb7kB+JZvkBqkqmoAqb4B"],"9":["QOkWAKmqBqRGaUAukBv5AuSWL0Bu+QLkli9AbuQG5Ea+QW6QarkBUJUbAEBpAAClAQCkBgCQGgBQagBAagEA","QKoWAKWqAaRGaUAakBu5AbiRG4AfuQH4lm+Ab+QW+Ea6lm9AavkBUJUbAEBuAACpAQCUBgBQGgBQWgBAagEA"]};
  function b64Bytes(str){
    const bin=atob(str),out=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
    return out;
  }
  function decodeProto(str){
    const B=b64Bytes(str),out=new Float32Array(GW*GH);
    for(let i=0;i<out.length;i++)out[i]=((B[i>>2]>>((i&3)*2))&3)/3;
    let fill=0;for(let i=0;i<out.length;i++)fill+=out[i];
    return {bm:zeroMean(out),fill:fill/out.length};
  }
  function zeroMean(v){
    let mu=0;for(let i=0;i<v.length;i++)mu+=v[i];
    mu/=v.length;
    const o=new Float32Array(v.length);let s=0;
    for(let i=0;i<v.length;i++){const d=v[i]-mu;o[i]=d;s+=d*d}
    const n=Math.sqrt(s)||1;
    for(let i=0;i<v.length;i++)o[i]/=n;
    return o;
  }
  // 3x3 高斯模糊：让匹配对 ±1px 的定位误差、以及不同截图分辨率的抗锯齿差异不敏感
  function blur3(v,w,h){
    const o=new Float32Array(v.length);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let s=0,n=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const yy=y+dy,xx=x+dx;
        if(yy<0||yy>=h||xx<0||xx>=w)continue;
        const k=(dy?1:2)*(dx?1:2);
        s+=v[yy*w+xx]*k;n+=k;
      }
      o[y*w+x]=s/n;
    }
    return o;
  }
  const DIGIT_PROTO=(function(){
    const t={};
    for(const k of Object.keys(DIGIT_PROTO_B64))t[k]=DIGIT_PROTO_B64[k].map(decodeProto);
    return t;
  })();
  function otsuThr(hist,n){
    let sum=0;for(let i=0;i<256;i++)sum+=i*hist[i];
    let sumB=0,wB=0,best=128,bestV=-1;
    for(let t=0;t<256;t++){
      wB+=hist[t];if(!wB)continue;
      const wF=n-wB;if(!wF)break;
      sumB+=t*hist[t];
      const mB=sumB/wB,mF=(sum-sumB)/wF;
      const v=wB*wF*(mB-mF)*(mB-mF);
      if(v>bestV){bestV=v;best=t}
    }
    return best;
  }
  // 把一个框里的亮字切成单个字形（连通域 → 按列归并 → 过宽的再对半劈）
  function segmentGlyphs(ctx,box,opts){
    const o=opts||{};
    const x0=Math.max(0,Math.round(box.x)),y0=Math.max(0,Math.round(box.y));
    const w=Math.max(1,Math.round(box.w)),h=Math.max(1,Math.round(box.h));
    let data=null;
    try{data=ctx.getImageData(x0,y0,w,h).data}catch(e){return {glyphs:[],w:w,h:h,err:'getImageData'}}
    const L=new Float32Array(w*h),hist=new Uint32Array(256);
    for(let i=0,p=0;i<w*h;i++,p+=4){
      const l=data[p]*0.299+data[p+1]*0.587+data[p+2]*0.114;
      L[i]=l;hist[Math.min(255,Math.max(0,Math.round(l)))]++;
    }
    let t=o.thr||0;
    if(!t)t=clamp(otsuThr(hist,w*h),110,232);
    const mask=new Uint8Array(w*h);
    for(let i=0;i<w*h;i++)mask[i]=L[i]>t?1:0;
    // 横贯整块的亮线（等级条上下沿、卡片描边）不是字，先抹掉
    for(let y=0;y<h;y++){
      let n=0;for(let x=0;x<w;x++)n+=mask[y*w+x];
      if(n>w*0.85)for(let x=0;x<w;x++)mask[y*w+x]=0;
    }
    for(let x=0;x<w;x++){
      let n=0;for(let y=0;y<h;y++)n+=mask[y*w+x];
      if(n>h*0.85)for(let y=0;y<h;y++)mask[y*w+x]=0;
    }
    /* 连通域（8 邻域，显式栈，不递归） */
    const lab=new Int32Array(w*h).fill(-1),stack=new Int32Array(w*h),comps=[];
    for(let i=0;i<w*h;i++){
      if(!mask[i]||lab[i]>=0)continue;
      const id=comps.length;let sp=0;
      stack[sp++]=i;lab[i]=id;
      let minX=w,maxX=-1,minY=h,maxY=-1,area=0;
      while(sp){
        const p=stack[--sp],py=(p/w)|0,px=p-py*w;
        area++;
        if(px<minX)minX=px;if(px>maxX)maxX=px;if(py<minY)minY=py;if(py>maxY)maxY=py;
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          const yy=py+dy,xx=px+dx;
          if(yy<0||yy>=h||xx<0||xx>=w)continue;
          const q=yy*w+xx;
          if(mask[q]&&lab[q]<0){lab[q]=id;stack[sp++]=q}
        }
      }
      comps.push({minX:minX,maxX:maxX,minY:minY,maxY:maxY,area:area});
    }
    if(!comps.length)return {glyphs:[],w:w,h:h,mask:mask,thr:t};
    let maxH=0,maxA=0;
    for(const c of comps){
      const ch=c.maxY-c.minY+1;
      if(ch>maxH)maxH=ch;
      if(c.area>maxA)maxA=c.area;
    }
    const keep=comps.filter(function(c){
      const cw=c.maxX-c.minX+1,ch=c.maxY-c.minY+1;
      if(c.area<Math.max(2,maxA*0.06))return false;          // 噪点
      if(ch<maxH*0.50)return false;                          // 小数点 / 半截残字
      if(cw>w*0.85&&ch>h*0.85)return false;                  // 整块描边
      return true;
    });
    if(!keep.length)return {glyphs:[],w:w,h:h,mask:mask,thr:t};
    keep.sort(function(a,b){return a.minX-b.minX});
    const groups=[];
    for(const c of keep){
      const g=groups[groups.length-1];
      // 同一列里有上下分离的墨块（数字断裂、发光边）并成一个字形
      if(g&&c.minX<=g.maxX+1){
        if(c.maxX>g.maxX)g.maxX=c.maxX;
        if(c.minY<g.minY)g.minY=c.minY;
        if(c.maxY>g.maxY)g.maxY=c.maxY;
      }else groups.push({minX:c.minX,maxX:c.maxX,minY:c.minY,maxY:c.maxY});
    }
    /* 两个数字粘在一起时按中间最窄的列劈开 */
    const splitWide=function(g){
      const gw=g.maxX-g.minX+1,gh=g.maxY-g.minY+1;
      if(gw/gh<0.95)return [g];
      const lo=g.minX+Math.round(gw*0.32),hi=g.minX+Math.round(gw*0.68);
      let cut=-1,cutN=1e9;
      for(let x=lo;x<=hi;x++){
        let n=0;
        for(let y=g.minY;y<=g.maxY;y++)n+=mask[y*w+x];
        if(n<cutN){cutN=n;cut=x}
      }
      if(cut<0||cut<=g.minX||cut>=g.maxX)return [g];
      const a={minX:g.minX,maxX:cut-1,minY:g.minY,maxY:g.maxY};
      const b={minX:cut,maxX:g.maxX,minY:g.minY,maxY:g.maxY};
      // 劈完两半都得有足够高度，否则是噪声，维持原样
      const cnt=function(q){
        let n=0;
        for(let y=q.minY;y<=q.maxY;y++)for(let x=q.minX;x<=q.maxX;x++)n+=mask[y*w+x];
        return n;
      };
      if(cnt(a)<maxA*0.06||cnt(b)<maxA*0.06)return [g];
      return [a,b];
    };
    const glyphs=[];
    for(const g of groups)for(const q of splitWide(g))glyphs.push(q);
    return {glyphs:glyphs,w:w,h:h,mask:mask,thr:t};
  }
  // 把任意大小的字形缩放到 GW×GH，横向居中、按高度等比（不拉宽，否则「1」会变成一根粗条）
  function normGlyph(mask,w,h,g){
    const bw=g.maxX-g.minX+1,bh=g.maxY-g.minY+1;
    let sc=GH/bh;
    if(bw*sc>GW)sc=GW/bw;
    const nw=Math.max(1,Math.min(GW,Math.round(bw*sc))),nh=Math.max(1,Math.min(GH,Math.round(bh*sc)));
    const ox=Math.floor((GW-nw)/2),oy=Math.floor((GH-nh)/2);
    const out=new Float32Array(GW*GH);
    for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){
      let acc=0,n=0;
      for(let sy=0;sy<2;sy++)for(let sx=0;sx<2;sx++){
        const fx=g.minX+(x+(sx+0.5)/2)/sc,fy=g.minY+(y+(sy+0.5)/2)/sc;
        const px=Math.floor(fx),py=Math.floor(fy);
        if(px<0||py<0||px>=w||py>=h)continue;
        acc+=mask[py*w+px];n++;
      }
      out[(oy+y)*GW+ox+x]=n?acc/n:0;
    }
    return blur3(out,GW,GH);
  }
  function classifyGlyph(bm){
    const v=zeroMean(bm);
    let fill=0;for(let i=0;i<bm.length;i++)fill+=bm[i];
    fill/=bm.length;
    // 先按字类取最高分，再拿「次优字类」算领先幅度（同类不同模板之间的差没有意义）
    let best={digit:'',score:-9};
    const per={};
    for(const d of Object.keys(DIGIT_PROTO)){
      let top=-9;
      for(const p of DIGIT_PROTO[d]){
        let sc=0;
        for(let i=0;i<v.length;i++)sc+=v[i]*p.bm[i];
        sc-=Math.abs(fill-p.fill)*0.6;   // 墨量差太多基本就是认错了，扣分
        if(sc>top)top=sc;
      }
      per[d]=top;
      if(top>best.score)best={digit:d,score:top};
    }
    let second=-9;
    for(const d of Object.keys(per))if(d!==best.digit&&per[d]>second)second=per[d];
    const score=clamp(best.score,0,1);
    return {digit:best.digit,score:score,margin:best.score-second,fill:fill};
  }
  // 与旧 tesseract 版同签名：返回 {text,conf,count,detail,png}
  async function readDigits(ctx,box,opts){
    const o=opts||{};
    const seg=segmentGlyphs(ctx,box,o);
    let text='',conf=0,detail=[];
    for(const g of seg.glyphs){
      const c=classifyGlyph(normGlyph(seg.mask,seg.w,seg.h,g));
      detail.push({d:c.digit,s:Number(c.score.toFixed(3)),x:g.minX,y:g.minY,w:g.maxX-g.minX+1,h:g.maxY-g.minY+1});
      text+=c.digit;
      conf+=c.score;
    }
    if(detail.length)conf/=detail.length;
    let png=null;
    if(TRACE()&&seg.mask){
      // 调试图：把二值结果放大 6 倍画出来，方便核对框位
      const sc=6,cv=makeCanvas(seg.w*sc,seg.h*sc),cx=ctxOf(cv);
      const im=cx.createImageData(cv.width,cv.height);
      for(let y=0;y<cv.height;y++)for(let x=0;x<cv.width;x++){
        const on=seg.mask[((y/sc)|0)*seg.w+((x/sc)|0)];
        const q=(y*cv.width+x)*4;
        im.data[q]=im.data[q+1]=im.data[q+2]=on?40:245;im.data[q+3]=255;
      }
      cx.putImageData(im,0,0);
      png=cv.toDataURL('image/png');
    }
    return {text:text,conf:Math.round(conf*100),count:detail.length,detail:detail,png:png,
      w:seg.w,h:seg.h,thr:seg.thr,box:{x:Math.round(box.x),y:Math.round(box.y),w:Math.round(box.w),h:Math.round(box.h)}};
  }
  // 调试用：把某个框的切字结果与归一化位图导出来（生成模板时用）
  function glyphDump(ctx,box,opts){
    const seg=segmentGlyphs(ctx,box,opts||{});
    const out={w:seg.w,h:seg.h,thr:seg.thr,glyphs:[]};
    for(const g of seg.glyphs){
      const bm=normGlyph(seg.mask,seg.w,seg.h,g);
      const c=classifyGlyph(bm);
      let bin='',q='';
      for(let i=0;i<bm.length;i++){
        bin+=bm[i]>0.5?'1':'0';
        // 4 级量化（和模板存储一致），建模板用这个，别用二值
        q+=String(Math.max(0,Math.min(3,Math.round(bm[i]*3))));
      }
      out.glyphs.push({x:g.minX,y:g.minY,w:g.maxX-g.minX+1,h:g.maxY-g.minY+1,bm:bin,q:q,guess:c.digit,score:Number(c.score.toFixed(3))});
    }
    return out;
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
  // 裁切过的截图（手机直接框选卡片区域）整图统计会失效：卡片几乎占满宽度，
  // 列距能到图宽的 25%，而面板占位的整屏截图只有 7%。所以改用「等级条那条暗带」
  // 当锚点——它横贯整排卡片、上下沿都有亮线，在它的垂直窗口里找卡与卡之间的亮缝最稳。
  function detectColumnsFromBand(pix,band){
    const W=pix.W,H=pix.H;
    const h=Math.max(6,Math.round(band.h||H*0.02));
    const y0=Math.max(0,Math.round(band.a-h*3));
    const y1=Math.min(H-1,Math.round(band.b+h*0.4));
    const rows=Math.max(1,y1-y0+1);
    const xEnd=Math.round(W*0.995);
    const frac=new Float32Array(xEnd);
    for(let x=0;x<xEnd;x++){
      let n=0;
      for(let y=y0;y<=y1;y++)if(pix.L[y*W+x]>185)n++;
      frac[x]=n/rows;
    }
    const maxGapW=Math.max(8,Math.round(W*0.025));
    const gs=mergeRuns(runsOf(xEnd,function(x){return frac[x]>0.85},maxGapW),1)
      .filter(function(r){return r.w>=2});
    if(gs.length<1)return null;
    const cs=gs.map(function(r){return r.c});
    if(cs.length<2)return null;
    const cands=[];
    for(let i=1;i<cs.length;i++){
      const d=cs[i]-cs[i-1];
      if(d>=W*0.06&&d<=W*0.5)cands.push(d);
    }
    if(!cands.length)return null;
    const uniq=[];
    for(const d of cands)if(!uniq.some(function(u){return Math.abs(u-d)<=2}))uniq.push(d);
    let best=null;
    for(const p0 of uniq){
      for(let i=0;i<cs.length;i++){
        const chain=[cs[i]];let expect=cs[i]+p0;
        for(let j=i+1;j<cs.length;j++){
          if(Math.abs(cs[j]-expect)<=p0*0.12){chain.push(cs[j]);expect=cs[j]+p0}
        }
        if(chain.length>=2&&(!best||chain.length>best.chain.length||
          (chain.length===best.chain.length&&p0<best.pitch))){
          const pp=(chain[chain.length-1]-chain[0])/(chain.length-1);
          best={chain:chain,pitch:pp,start:chain[0]};
        }
      }
    }
    if(!best)return null;
    const pitch=best.pitch;
    const widths=[];
    for(const c of best.chain){
      const hit=gs.reduce(function(a,b){return Math.abs(b.c-c)<Math.abs(a.c-c)?b:a},gs[0]);
      if(hit)widths.push(hit.w);
    }
    const gapW=medianOf(widths)||Math.round(pitch*0.03);
    const cardW=Math.max(12,Math.round(pitch-gapW));
    // 列起点：先把坐标退到"第一个缝的左边那张卡"，再用等级条验证这个位置真有卡。
    // 全屏截图左边是空白面板（缝检测会把它当成一整列），所以空列要往右挪；
    // 裁切图左边可能漏检一条缝，就往左补一列（只有验证到暗条才算数）。
    const yTop=Math.max(0,Math.round(band.a)),yBot=Math.min(H-1,Math.round(band.b));
    // 卡中间正好压着白色的「Lv.xx」文字，单点判断会被字挡掉，所以按 0.15/0.5/0.85 三处取样
    const barAt=function(xx){
      const rows=Math.max(1,yBot-yTop+1);
      for(const f of [0.15,0.5,0.85]){
        const mid=Math.round(xx+cardW*f);
        if(mid<0||mid>=W)continue;
        let dark=0;
        for(let y=yTop;y<=yBot;y++)if(pix.L[y*W+mid]<160)dark++;
        if(dark/rows>0.4)return true;
      }
      return false;
    };
    let x0=Math.round(best.start-cardW),guard=0;
    while(x0-pitch>=0&&barAt(x0-pitch)&&guard++<8)x0=Math.round(x0-pitch);
    guard=0;
    while(x0+pitch<W&&!barAt(x0)&&guard++<8)x0=Math.round(x0+pitch);
    const nMax=Math.max(1,Math.floor((W-x0+gapW)/pitch));
    let nCols=0;
    for(let i=0;i<Math.min(8,nMax);i++){
      if(barAt(x0+i*pitch))nCols=i+1;else if(i>=1)break;
    }
    if(nCols<1)return null;
    return {x0:x0,pitch:pitch,cardW:cardW,nCols:nCols,blockR:Math.round(x0+nCols*pitch-gapW),fallback:false,gutters:gs.length,fromBand:true};
  }
  function detectCharGrid(pix){
    // 1) 先按整图统计（全屏截图最稳）；2) 再用等级条窗口复核，尺寸对不上就换它的结果
    let cols=null;
    try{cols=detectColumns(pix)}catch(e){}
    let bands=[];
    if(cols)bands=detectBands(pix,Math.max(0,Math.round(cols.x0)),Math.min(pix.W,Math.round(cols.blockR)),cols.cardW);
    if(!bands.length)bands=detectBands(pix,0,pix.W,Math.round(pix.W/4));
    if(!bands.length)throw new Error('没找到角色卡片，请截完整的角色列表（要带上卡片下方的等级条）');
    const fromBand=detectColumnsFromBand(pix,bands[0]);
    if(fromBand&&(!cols||cols.fallback||fromBand.nCols!==cols.nCols||Math.abs(fromBand.cardW-cols.cardW)>cols.cardW*0.05)){
      cols=fromBand;
      bands=detectBands(pix,Math.max(0,Math.round(cols.x0)),Math.min(pix.W,Math.round(cols.blockR)),cols.cardW);
      if(!bands.length)bands=detectBands(pix,0,pix.W,Math.round(pix.W/4));
    }
    const blockR=Math.min(pix.W,Math.round(cols.blockR));
    return {x0:cols.x0,pitch:cols.pitch,cardW:cols.cardW,nCols:cols.nCols,fallback:cols.fallback,fromBand:!!cols.fromBand,gutters:cols.gutters,bands:bands,blockR:blockR};
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
    // 星标行版式（实测）：左边 3 颗菱形等间距排列（间距≈0.19 卡宽），第 4 个槽位里画的是
    // 「+N」数字。亮菱形个数＝启灵数（0~3），数字是超限加值，两者相加才是完整启灵（最高 15=3启+12）。
    // 难点：数字和最后一颗菱形挨得很近，按"段"硬切会把菱形并进数字框里，所以改用
    // 「等间距链」找菱形，再把最后一个菱形右边到卡宽 0.9 之间的亮像素当数字框。
    const W=pix.W;
    const sb=starRowBand(bandA,cardW);
    const yTop=Math.max(0,sb.top),yBot=Math.min(pix.H-1,sb.bot);
    if(yBot<=yTop+4)return {lit:0,num:null,segs:[],band:sb};
    const xa=Math.max(0,Math.round(left+cardW*0.02)),xb=Math.min(W-1,Math.round(left+cardW*0.94));
    if(xb<=xa+6)return {lit:0,num:null,segs:[],band:sb};
    const h=yBot-yTop+1;
    const col=new Array(xb-xa+1);
    for(let x=xa;x<=xb;x++){
      let n=0;
      for(let y=yTop;y<=yBot;y++)if(pix.L[y*W+x]>190)n++;
      col[x-xa]=n;
    }
    const blobGap=Math.max(1,Math.round(cardW*0.02));
    const minW=Math.max(4,Math.round(cardW*0.035)),maxW=Math.round(cardW*0.17);
    // runsOf 的第三个参数是"最大允许宽度"，给小了会把整颗菱形直接丢掉
    const blobs=mergeRuns(runsOf(col.length,function(i){return col[i]>=3},Math.round(cardW*0.9)),blobGap)
      .map(function(r){return {a:r.a+xa,b:r.b+xa,c:(r.a+r.b)/2+xa,w:r.w}})
      .filter(function(r){return r.w>=minW&&r.w<=maxW});
    if(!blobs.length)return {lit:0,num:null,segs:[],band:sb};
    // 在候选里找"最长的等间距链"——菱形是等距的，数字不参与
    let chain=[];
    for(let i=0;i<blobs.length;i++){
      const c=[blobs[i]];
      for(let j=i+1;j<blobs.length;j++){
        const pitch=c[c.length-1]?blobs[j].c-c[c.length-1].c:0;
        if(!pitch)continue;
      }
      // 以每两个候选的间距为基准向外串
      for(let j=i+1;j<blobs.length;j++){
        const p=blobs[j].c-blobs[i].c;
        if(p<cardW*0.15||p>cardW*0.26)continue;
        const cur=[blobs[i],blobs[j]];let expect=blobs[j].c+p;
        for(let k=j+1;k<blobs.length;k++){
          if(Math.abs(blobs[k].c-expect)<=p*0.22){cur.push(blobs[k]);expect=blobs[k].c+p}
        }
        if(cur.length>chain.length)chain=cur;
      }
    }
    // 菱形一定在最左边：先拿最左那个亮块当第 1 颗，再用相邻间距定 pitch，
    // 只把「第 1 颗 + 2.5 个间距」以内的块算作菱形——这样数字再亮也不会被当成第 4 颗。
    let d0=blobs[0].c,pitch=0;
    const diffs=[];
    for(let i=1;i<blobs.length;i++){
      const d=blobs[i].c-blobs[i-1].c;
      if(d>=cardW*0.15&&d<=cardW*0.26)diffs.push(d);
    }
    if(diffs.length)pitch=medianOf(diffs);
    if(!pitch){
      // 间距估不出来（只认出 1 颗）：按版式经验值兜底
      pitch=cardW*0.19;
    }
    const dios=blobs.filter(function(b){return b.c<=d0+2.5*pitch});
    const lit=Math.min(3,dios.length);
    // 数字画在第 4 个槽位里，右对齐；框取槽位中心一带，别把菱形发光边圈进来
    const slotC=d0+3*pitch;
    const yTop2=yTop,yBot2=yBot;
    const midY=(yTop2+yBot2)/2;
    const bw=cardW*0.30,bh=cardW*0.17;
    let num=null;
    if(slotC-bw/2>xa&&slotC+bw/2<W-1){
      num={x:Math.round(slotC-bw/2),y:Math.round(midY-bh/2),w:Math.round(bw),h:Math.round(bh)};
    }
    return {lit:lit,num:num,segs:blobs,band:sb,chain:dios.length,pitch:pitch};
  }
  // 「Lv.xx」是等级条里最亮的像素，但条底本身亮度差很大：深色条只有 70~90，
  // 有些卡是亮金渐变，底子就有 200+。原来写死 210 在亮条上会把整条都当字
  // （u1 最后一列「Lv.80」就是这么丢的）。改成按框内亮度分位数取阈值。
  function brightThr(pix,x0,x1,y0,y1){
    const W=pix.W,h=new Uint32Array(256);
    let n=0;
    for(let y=y0;y<=y1;y++){
      const off=y*W;
      for(let x=x0;x<=x1;x++){h[Math.min(255,Math.max(0,Math.round(pix.L[off+x])))]++;n++}
    }
    if(!n)return 210;
    const pick=function(q){
      let acc=0;const goal=n*q;
      for(let v=0;v<256;v++){acc+=h[v];if(acc>=goal)return v}
      return 255;
    };
    const p50=pick(0.5),p99=pick(0.99);
    return clamp(p50+(p99-p50)*0.45,150,240);
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
    const thr=brightThr(pix,xa,xb,top,bot);
    const trows=[];
    for(let y=top;y<=bot;y++){
      const off=y*W;let n=0;
      for(let x=xa;x<=xb;x++)if(pix.L[off+x]>thr)n++;
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
      for(let y=y0;y<=y1;y++)if(pix.L[y*W+x]>thr)n++;
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
    const thr=brightThr(pix,x0,x1,y0,y1);
    const raw=[];let sa=-1;
    for(let x=x0;x<=x1;x++){
      let hit=false;
      for(let y=y0;y<=y1;y++)if(pix.L[y*W+x]>thr){hit=true;break}
      if(hit){if(sa<0)sa=x;if(raw.length&&raw[raw.length-1].b===x-1)raw[raw.length-1].b=x;else raw.push({a:x,b:x})}
      else if(sa>=0)sa=-1;
    }
    if(raw.length<2)return box;
    const info=raw.map(function(r){
      let t=y1,b=y0;
      for(let x=r.a;x<=r.b;x++)for(let y=y0;y<=y1;y++)if(pix.L[y*W+x]>thr){if(y<t)t=y;if(y>b)b=y}
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
        // 只认 digitBoxOf 切出来的「纯数字段」：整串「Lv.xx」一起送进来时，
        // L / v 两个字母会稳定地被认成 1，实测比留空更糟。
        // 列起点偶尔会偏几像素（把数字切一半），所以第一轮没读出来时再整体错位重试。
        const baseBoxes=lvRaw.map(function(b){return digitBoxOf(pix,b)});
        const lvRaws=[];
        let lvBest=null;
        const tryBox=async function(bx,tag){
          const r=await readDigits(fctx,bx,{});
          const ds=r.detail||[];
          if(!ds.length){if(tag)lvRaws.push(tag+'-');return}
          const txt=ds.map(function(g){return g.d}).join('');
          const conf=Math.min.apply(null,ds.map(function(g){return g.s}))*100;
          if(tag)lvRaws.push(tag+txt+'/'+Math.round(conf)+'%');
          if(TRACE()){
            (rec.lvTry||(rec.lvTry=[])).push({tag:tag||'shift',
              box:[Math.round(bx.x),Math.round(bx.y),Math.round(bx.w),Math.round(bx.h)],
              g:ds.map(function(q){return q.d+'@'+Math.round(q.s*100)+':'+q.x+','+q.y+' '+q.w+'x'+q.h})});
          }
          // 等级只有 1~2 位；切出 3 个以上字形说明框偏了（把旁边的东西圈进来了）
          if(ds.length>2)return;
          if(ds.length===1&&bx.n===2)return;   // 明明两位却只切出一位
          const v=Number(txt);
          if(!(v>=1&&v<=MAX_LV_GUESS))return;
          if(conf<LV_MIN_CONF)return;
          const rank=(ds.length===2?1000:0)+conf;
          if(!lvBest||rank>lvBest.rank)lvBest={v:v,conf:conf,rank:rank};
        };
        for(let i=0;i<baseBoxes.length;i++)await tryBox(baseBoxes[i],i===0?'':'b'+i);
        // 第二轮：纵向错位 ±3 像素再试（只挪纵向 —— 横向挪会把相邻字形圈进来，
        // 实测会把「70」读成「71」，比留空更糟）
        if(!lvBest){
          for(const dy of [-3,3]){
            for(let i=0;i<baseBoxes.length&&!lvBest;i++){
              const bx=baseBoxes[i];
              await tryBox({x:bx.x,y:bx.y+dy,w:bx.w,h:bx.h,n:bx.n},'');
            }
            if(lvBest&&TRACE())lvRaws.push('shiftY'+dy);
          }
        }
        if(lvBest)lv=lvBest.v;
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
          // 数字在第 4 个槽位里，框差一两像素就会切歪，所以阈值和框位各给一组
          const variants=star.num?[
            {x:star.num.x,y:star.num.y,w:star.num.w,h:star.num.h,thr:175},
            {x:star.num.x-2,y:star.num.y-2,w:star.num.w+4,h:star.num.h+4,thr:150},
            {x:star.num.x,y:star.num.y,w:star.num.w,h:star.num.h,thr:195},
            {x:star.num.x-1,y:star.num.y-1,w:star.num.w+2,h:star.num.h+2,thr:0}
          ]:[];
          const votes=[];const raws=[];const pngs=[];
          for(const v of variants){
            const num=await readDigits(fctx,{x:v.x,y:v.y,w:v.w,h:v.h},{thr:v.thr});
            raws.push(String(num.text||'')+'/'+num.conf+'%');
            if(TRACE()&&pngs.length<3)pngs.push({box:{x:Math.round(v.x),y:Math.round(v.y),w:Math.round(v.w),h:Math.round(v.h)},thr:v.thr,png:num.png});
            // 只有「切出 1~2 个字形 + 高分」才算数：空槽位里的菱形边角、零星亮点
            // 会在这两步被挡掉（之前「本来没有数字却读出 +1」就是这么来的）。
            // +10/+11/+12 是两位，别只放一位进来。
            if(num.count<1||num.count>2||num.conf<EN_MIN_CONF)continue;
            const val=Number(num.text);
            // 界面上不会出现「+0」
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
          // 叠位框里会连带圈进菱形描边。描边一定贴着框边，所以除了「1~2 个字形 + 高分」，
          // 还要求字形不贴框边；认不出就当 0（本体），用户可以在界面里改。
          const stBox={x:left+grid.cardW*0.62,y:top+grid.cardH*0.78,w:grid.cardW*0.36,h:grid.cardH*0.22};
          const rr=await readDigits(fctx,stBox,{thr:150});
          const g0=rr.detail&&rr.detail[0];
          const inset=g0&&g0.x>1&&(g0.x+g0.w)<stBox.w-1&&g0.y>1&&(g0.y+g0.h)<stBox.h-1;
          if(rr.count>=1&&rr.count<=2&&rr.conf>=EN_MIN_CONF&&inset)stack=clamp(Number(rr.text),0,12);
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
    // 工具用：把每格的等级数字框 / 启灵数字框裁出来，附带切字后的归一化位图。
    // 生成字形模板（tools/gen-glyph-proto）和做回归对比都靠它，普通界面不调。
    async collect(file,mode){
      const kind=mode||'char';
      const img=await blobToImage(file);
      const full=makeCanvas(img.naturalWidth,img.naturalHeight);
      const fctx=ctxOf(full);fctx.drawImage(img,0,0,full.width,full.height);
      const pix=pixelData(full);
      const crop=function(b,sc){
        const c=makeCanvas(Math.max(1,Math.round(b.w*sc)),Math.max(1,Math.round(b.h*sc)));
        ctxOf(c).drawImage(full,b.x,b.y,b.w,b.h,0,0,c.width,c.height);
        return c.toDataURL('image/png');
      };
      const out=[];const taken=new Set();
      if(kind==='wheel'){
        const grid=detectWheelGrid(pix);
        const tscale=Math.min(1,WORK_W/full.width);
        const thumb=makeCanvas(Math.round(full.width*tscale),Math.round(full.height*tscale));
        ctxOf(thumb).drawImage(full,0,0,thumb.width,thumb.height);
        const tpls=await buildWheelTemplates();
        const nRows=grid.rowGaps&&grid.rowGaps.length?grid.rowGaps.length:Math.max(1,Math.floor((full.height-grid.y0)/grid.pitchY));
        for(let r=0;r<nRows;r++){
          const top=Math.round(grid.y0+r*grid.pitchY);
          if(top+grid.cardH>full.height+2)break;
          for(let j=0;j<grid.nCols;j++){
            const left=Math.round(grid.x0+j*grid.pitchX);
            if(left+grid.cardW*0.6>full.width)break;
            const patch=warpWheelArt(thumb,left,top,grid.cardW,grid.cardH,tscale);
            if(!patch)continue;
            const mm=matchWheel(patch,tpls);
            const stBox={x:left+grid.cardW*0.62,y:top+grid.cardH*0.78,w:grid.cardW*0.36,h:grid.cardH*0.22};
            out.push({cell:{r:r,j:j},id:mm[0]?mm[0].id:'',score:mm[0]?Number(mm[0].score.toFixed(3)):0,
              stBox:stBox,stPng:crop(stBox,6),stGlyphs:glyphDump(fctx,stBox,{thr:150})});
          }
        }
        return {kind:kind,grid:grid,W:full.width,H:full.height,cells:out};
      }
      const grid=detectCharGrid(pix);
      const tscale=Math.min(1,WORK_W/full.width);
      const thumb=makeCanvas(Math.round(full.width*tscale),Math.round(full.height*tscale));
      ctxOf(thumb).drawImage(full,0,0,thumb.width,thumb.height);
      const tpls=await buildCharTemplates();
      for(let bi=0;bi<grid.bands.length;bi++){
        const band=grid.bands[bi];
        for(let j=0;j<grid.nCols;j++){
          const left=Math.round(grid.x0+j*grid.pitch),cardW=grid.cardW,bandA=band.a;
          const box={x:left,y:bandA-cardW*1.40,w:cardW,h:cardW*1.15};
          if(box.y<-cardW*0.2||box.y+box.h>full.height)continue;
          const tbox={x:box.x*tscale,y:box.y*tscale,w:box.w*tscale,h:box.h*tscale};
          const match=matchSquare(thumb?ctxOf(thumb):fctx,tbox,tpls,{color:true,scales:[0.5,0.6,0.7,0.8,0.9,1.0]});
          let pick=match[0]||null;
          if(pick&&taken.has(pick.id)){const alt=match.find(function(o){return !taken.has(o.id)&&o.score>=0.40});if(alt)pick=alt}
          if(!pick||pick.score<0.42)continue;
          taken.add(pick.id);
          const loc=locateLevelText(pix,left,cardW,bandA,band.b);
          const lvH=Math.max(10,Math.round(band.b>bandA?band.b-bandA:cardW*0.14));
          const lvRaw=[loc,{x:left+cardW*0.50,y:bandA+1,w:cardW*0.30,h:lvH}].filter(Boolean);
          // 候选框：digitBoxOf 切出的数字段 ×2，再加整串「Lv.xx」两个原框。
        // 底部被裁掉的行 digitBoxOf 会切歪（小数点糊了、把 L、v 也当数字），
        // 这时整串一起认、取末两位反而更稳。
        const lvBoxes=lvRaw.map(function(b){return digitBoxOf(pix,b)}).concat(lvRaw);
          const star=readStarRow(pix,left,cardW,bandA);
          out.push({cell:{r:bi,j:j},id:pick.id,name:pick.name,score:Number(pick.score.toFixed(3)),
            left:left,bandA:bandA,cardW:cardW,
            lvBoxes:lvBoxes.map(function(b){return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.w),h:Math.round(b.h),n:b.n}}),
            lvPng:lvRaw[0]?crop(lvRaw[0],5):null,
            lvG:pix?glyphDump(fctx,lvBoxes[0],{}):null,
            lit:star.lit,enBox:star.num?{x:Math.round(star.num.x),y:Math.round(star.num.y),w:Math.round(star.num.w),h:Math.round(star.num.h)}:null,
            enPng:star.num?crop(star.num,8):null,enG:star.num?glyphDump(fctx,star.num,{thr:175}):null});
        }
      }
      return {kind:kind,grid:grid,W:full.width,H:full.height,cells:out};
    },
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
          try{const rr=await readDigits(fctx,lvBox,{thr:175});lvText=rr.text;lvPng2=rr.png}catch(e){lvText='ERR '+e.message}
          try{alt6=(await readDigits(fctx,lvBox,{thr:200})).text}catch(e){}
          try{alt13=(await readDigits(fctx,lvBox,{thr:150})).text}catch(e){}
          try{enText=(await readDigits(fctx,enBox,{thr:165})).text}catch(e){enText='ERR '+e.message}
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
          try{st=(await readDigits(fctx,{x:left+grid.cardW*0.62,y:top+grid.cardH*0.78,w:grid.cardW*0.36,h:grid.cardH*0.22},{thr:150})).text}catch(e){st='ERR'}
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
