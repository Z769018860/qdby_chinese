// 个人工具箱弹窗：汉化站与视频站共用，包含猫狗决策币与其他工具入口
const TOOLBOX_HTML = String.raw`<dialog id="toolboxDialog" class="toolboxDialog" aria-labelledby="toolboxTitle">
    <button class="viewerClose" id="toolboxClose" type="button" aria-label="关闭">×</button>
      <div class="toolboxCard">
        <h2 id="toolboxTitle">个人工具箱</h2>
        <p class="panelLead">收录猫狗主题整活页面与实用工具。</p>

        <div class="toolboxLayout">
        <section class="coinLab" aria-labelledby="coinLabTitle">
          <div class="coinLabHead">
            <h3 id="coinLabTitle">猫狗决策币（主页内嵌版）</h3>
            <p>保留原玩法，视觉统一到本站卡片风格。</p>
          </div>
          <div class="coinLabBody">
            <div class="coinLabStageWrap">
              <div class="coinLabStage" id="coinStage" role="img" aria-label="猫狗决策币">
                <div class="coinFace front"></div>
                <div class="coinFace back"></div>
              </div>
            </div>
          </div>
          <div class="coinLabActions">
            <label class="coinUpload" for="coinUploadFront">上传正面图</label>
            <input id="coinUploadFront" type="file" accept="image/*" />
            <label class="coinUpload" for="coinUploadBack">上传反面图</label>
            <input id="coinUploadBack" type="file" accept="image/*" />
            <button type="button" class="btn" id="coinStartBtn">开始旋转</button>
            <button type="button" class="btn ghostBtn" id="coinStopBtn">停止并判定</button>
          </div>
          <p class="coinResult" id="coinResult">当前结果：待开始</p>
        </section>

        <aside class="toolboxLinks" aria-label="工具页面链接">
          <h3 class="toolboxLinksTitle">其他工具页面</h3>
          <div class="toolboxGrid">
          <a class="toolboxBtn" href="poem-for-the-caged.html" target="_blank" rel="noopener">
            <span class="toolboxEmoji" aria-hidden="true">🕊️</span>
            <span>
              <strong>囚笼之诗攻略</strong>
              <small>109 项 CG 收集 · 全成就与结局 · 剧透</small>
            </span>
          </a>
          <a class="toolboxBtn" href="catdog-main/index.html" target="_blank" rel="noopener">
            <span class="toolboxEmoji" aria-hidden="true">🪙</span>
            <span>
              <strong>猫狗决策币（原页面）</strong>
              <small>打开原版静态页面</small>
            </span>
          </a>
          <a class="toolboxBtn" href="catdogcase-main/index.html" target="_blank" rel="noopener">
            <span class="toolboxEmoji" aria-hidden="true">🕵️</span>
            <span>
              <strong>（纯整活）猫狗疑案</strong>
              <small>网页文字小游戏个人向纯整活玩</small>
            </span>
          </a>
          <a class="toolboxBtn" href="save-repair.html" target="_blank" rel="noopener">
            <span class="toolboxEmoji" aria-hidden="true">🛠️</span>
            <span>
              <strong>存档修复工具</strong>
              <small>《恶魔之心》第四作个人魔改工具</small>
            </span>
          </a>
          <a class="toolboxBtn" href="self-translate-tool.html" target="_blank" rel="noopener">
            <span class="toolboxEmoji" aria-hidden="true">🧾</span>
            <span>
              <strong>自用提取脚本</strong>
              <small>提取/替换 JSON 或 ZIP 并导出完整结果</small>
            </span>
          </a>
          <a class="toolboxBtn" href="dice/" target="_blank" rel="noopener">
            <span class="toolboxEmoji" aria-hidden="true">🎲</span>
            <span>
              <strong>自定义六面骰</strong>
              <small>六面展开图上传裁剪 + 立体骰子同步投掷</small>
            </span>
          </a>
          <a class="toolboxBtn" href="jx3-jjc-draw.html" target="_blank" rel="noopener">
            <span class="toolboxEmoji" aria-hidden="true">⚔️</span>
            <span>
              <strong>剑三 JJC 配置抽签</strong>
              <small>自选心法范围，随机抽取 2 输出 + 1 治疗</small>
            </span>
          </a>
          <a class="toolboxBtn" href="morimens-tools.html" target="_blank" rel="noopener">
            <span class="toolboxEmoji" aria-hidden="true">🌒</span>
            <span>
              <strong>忘忘看报</strong>
              <small>《忘却前夜》融灾榜单数据查看 · demo</small>
            </span>
          </a>
          <a class="toolboxBtn" href="https://www.kdocs.cn/l/cfgAat4ZYo9x" target="_blank" rel="noopener noreferrer">
            <span class="toolboxEmoji" aria-hidden="true">📋</span>
            <span>
              <strong>剑网3莫问平沙招式表</strong>
              <small>共享表格同步 · 打开金山文档最新内容</small>
            </span>
          </a>
          </div>
        </aside>
        </div>
      </div>
  </dialog>`;

function ensureToolbox(){
  if(document.getElementById('toolboxDialog')) return document.getElementById('toolboxDialog');
  const holder = document.createElement('div');
  holder.innerHTML = TOOLBOX_HTML;
  const dialog = holder.firstElementChild;
  document.body.appendChild(dialog);
  return dialog;
}

function initCoinLab(){
  const stage = document.getElementById("coinStage");
  const frontInput = document.getElementById("coinUploadFront");
  const backInput = document.getElementById("coinUploadBack");
  const startBtn = document.getElementById("coinStartBtn");
  const stopBtn = document.getElementById("coinStopBtn");
  const result = document.getElementById("coinResult");
  if(!stage || !frontInput || !backInput || !startBtn || !stopBtn || !result) return;

  let spinning = false, angle = 0, timer = null;
  const frontFace = stage.querySelector('.front');
  const backFace = stage.querySelector('.back');
  const setResult = (text)=>{ result.textContent = `当前结果：${text}`; };

  startBtn.addEventListener('click', ()=>{
    if(spinning) return;
    spinning = true;
    setResult('旋转中…');
    timer = window.setInterval(()=>{
      angle += 18;
      stage.style.transform = `rotateY(${angle}deg)`;
    }, 16);
  });

  stopBtn.addEventListener('click', ()=>{
    if(!spinning){ setResult('请先开始旋转'); return; }
    spinning = false;
    if(timer){ window.clearInterval(timer); timer = null; }
    const normalized = ((angle % 360) + 360) % 360;
    const isFront = normalized < 90 || normalized > 270;
    const finalAngle = isFront ? 0 : 180;
    angle = angle + (finalAngle - normalized);
    stage.style.transform = `rotateY(${angle}deg)`;
    setResult(isFront ? '\u{1F436} 正面（狗）' : '\u{1F431} 反面（猫）');
  });

  const bindUploader = (input, face)=>{
    input.addEventListener('change', (event)=>{
      const file = event.target.files && event.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = (e)=>{ face.style.backgroundImage = `url('${e.target?.result || ''}')`; };
      reader.readAsDataURL(file);
    });
  };
  bindUploader(frontInput, frontFace);
  bindUploader(backInput, backFace);
}

export function mountToolbox(){
  const dialog = ensureToolbox();
  const openBtn = document.getElementById('toolboxOpen');
  const closeBtn = document.getElementById('toolboxClose');
  initCoinLab();

  const close = ()=>{ if(dialog.open) dialog.close(); };
  openBtn && openBtn.addEventListener('click', ()=>{ if(!dialog.open) dialog.showModal(); });
  closeBtn && closeBtn.addEventListener('click', close);
  dialog.addEventListener('click', (e)=>{
    const rect = dialog.getBoundingClientRect();
    const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if(!inside) close();
  });
  dialog.addEventListener('close', ()=>{ if(location.hash === '#toolboxTitle') history.replaceState(null, '', location.pathname + location.search); });
  // 工具箱页的“返回个人工具箱”链接带 #toolboxTitle，进来直接弹
  if(location.hash === '#toolboxTitle') dialog.showModal();
  window.addEventListener('hashchange', ()=>{ if(location.hash === '#toolboxTitle') dialog.showModal(); });
}
