#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把《角色培养计算器》独立页转成忘忘看报的深色版，输出 morimens-growcalc.html。

用法：
    python scripts/build-growcalc-page.py <源文件.html> [输出路径]

源文件是浅色主题的独立页（金券经济分析目录里那份）。这里只做两件事：
  1) 立绘目录 `_portraits/` 换成站内路径 `assets/morimens/growcalc/portraits/`；
  2) 把配色改成忘忘看报的深色（--bg:#0a0e15 / 卡片 #131b27 / 强调 #e0bd82，标题用楷体）。
所有替换都带 count 断言：源文件一旦改版，这里会直接报错而不是悄悄输出半成品。
"""
import io
import re
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else None
OUT = sys.argv[2] if len(sys.argv) > 2 else 'morimens-growcalc.html'
if not SRC:
    sys.exit('usage: build-growcalc-page.py <source.html> [out.html]')

s = io.open(SRC, encoding='utf-8', newline='').read()
orig_len = len(s)


def rep(old, new, cnt=1, tag=''):
    global s
    n = s.count(old)
    if n != cnt:
        raise SystemExit(f'[fail] {tag or old[:60]!r} 期望 {cnt} 次，实际 {n} 次')
    s = s.replace(old, new)


# ---------- 1. 立绘路径 ----------
rep('_portraits/', 'assets/morimens/growcalc/portraits/', 1, '立绘路径')

# ---------- 2. 调色板 ----------
rep("""  --bg:#f6f7fb; --card:#fff; --line:#e6e8ee; --line2:#eef0f5;
  --tx:#111827; --dim:#6b7280; --dim2:#9ca3af; --acc:#111827;
  --red:#c2444c; --gold:#a9761a; --green:#2f7a52; --blue:#2c6da8;""",
    """  --bg:#0c1017; --card:#131b27; --line:rgba(148,163,184,.22); --line2:rgba(148,163,184,.12);
  --tx:#edf2f7; --dim:#aeb8c7; --dim2:#77869a; --acc:#e0bd82;
  --red:#e0798a; --gold:#e0bd82; --green:#5bb98c; --blue:#6ea8ff;""", 1, '调色板')

# ---------- 3. 字体：正文与忘忘看报一致，标题用楷体 ----------
rep('font:14px/1.65 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif',
    'font:14px/1.65 ui-sans-serif,system-ui,-apple-system,"Microsoft YaHei","PingFang SC",sans-serif',
    1, '正文字体')
rep('h1{font-size:19px;font-weight:650;letter-spacing:.2px}',
    'h1{font-family:"STKaiti","KaiTi","Noto Serif SC","Source Han Serif SC",serif;font-size:21px;font-weight:900;letter-spacing:.05em}',
    1, 'h1 字体')
rep('h2{font-size:15px;font-weight:650;margin-bottom:2px}',
    'h2{font-family:"STKaiti","KaiTi","Noto Serif SC","Source Han Serif SC",serif;font-size:17px;font-weight:800;letter-spacing:.04em;margin-bottom:2px}',
    1, 'h2 字体')

# ---------- 4. 控件与底色 ----------
rep('background:#fff;color:var(--tx);color-scheme:light;min-width:210px}',
    'background:#111a26;color:var(--tx);color-scheme:dark;min-width:210px}', 1, '角色下拉')
rep('html{color-scheme:light}', 'html{color-scheme:dark}', 1, 'color-scheme')
rep('select,input[type=text]{color:var(--tx);background:#fff;color-scheme:light}',
    'select,input[type=text]{color:var(--tx);background:#111a26;color-scheme:dark}', 1, '输入框')
rep('select option{background:#fff;color:#111827}', 'select option{background:#111a26;color:#edf2f7}', 1, '下拉选项')
rep('select:hover{border-color:#c9cede}', 'select:hover{border-color:#4a5a70}', 1, '下拉 hover')
rep('select:focus{outline:2px solid #cfd6e4;outline-offset:1px}',
    'select:focus{outline:2px solid rgba(224,189,130,.45);outline-offset:1px}', 1, '下拉 focus')
rep('.pill{font-size:11.5px;padding:2px 8px;border-radius:20px;background:#f1f3f8;color:var(--dim);white-space:nowrap}',
    '.pill{font-size:11.5px;padding:2px 8px;border-radius:20px;background:rgba(255,255,255,.06);color:var(--dim);white-space:nowrap}',
    1, 'pill 底')
rep('.pill.s1{background:#fbeeee;color:#a8443f}', '.pill.s1{background:rgba(199,94,104,.18);color:#efa6ad}', 1, 'pill s1')
rep('.pill.s2{background:#f3eefb;color:#6d4fa3}', '.pill.s2{background:rgba(154,126,225,.18);color:#c3b0f2}', 1, 'pill s2')
rep('.pill.s3{background:#eaf2fb;color:#2f6ea6}', '.pill.s3{background:rgba(82,157,219,.18);color:#9dc7ef}', 1, 'pill s3')
rep('.pill.s4{background:#ebf5f0;color:#2f7a52}', '.pill.s4{background:rgba(111,179,174,.16);color:#8fd8cf}', 1, 'pill s4')
rep('.pill.ur{background:#fdf3e3;color:#9a6b12}', '.pill.ur{background:rgba(224,189,130,.18);color:#ecd3a4}', 1, 'pill ur')
rep('padding:14px 15px;background:#fcfcfe}', 'padding:14px 15px;background:rgba(255,255,255,.03)}', 1, 'panel 底')
rep('.kpi{background:#fafbfd;border:1px solid var(--line2);border-radius:10px;padding:11px 12px}',
    '.kpi{background:rgba(255,255,255,.04);border:1px solid var(--line2);border-radius:10px;padding:11px 12px}', 1, 'kpi 底')
rep('.at{background:#fafbfd;border:1px solid var(--line2);border-radius:9px;padding:10px 11px}',
    '.at{background:rgba(255,255,255,.04);border:1px solid var(--line2);border-radius:9px;padding:10px 11px}', 1, 'attr 底')
rep('.prt{border:1px solid var(--line);border-radius:10px;padding:11px 12px;background:#fcfcfe}',
    '.prt{border:1px solid var(--line);border-radius:10px;padding:11px 12px;background:rgba(255,255,255,.03)}', 1, '部位卡底')
rep('.tin{font:inherit;font-size:13.5px;padding:6px 9px;border:1px solid var(--line);border-radius:8px;width:100%;background:#fff;color:var(--tx);color-scheme:light}',
    '.tin{font:inherit;font-size:13.5px;padding:6px 9px;border:1px solid var(--line);border-radius:8px;width:100%;background:#111a26;color:var(--tx);color-scheme:dark}',
    1, '.tin')
rep('.chip{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;padding:6px 11px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--tx);cursor:pointer;user-select:none}',
    '.chip{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;padding:6px 11px;border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.04);color:var(--tx);cursor:pointer;user-select:none}',
    1, 'chip')
rep('.chip input{margin:0;width:13px;height:13px;accent-color:#111827;cursor:pointer}',
    '.chip input{margin:0;width:13px;height:13px;accent-color:#e0bd82;cursor:pointer}', 1, 'chip checkbox')
rep('.chip.on{background:#111827;border-color:#111827;color:#fff}',
    '.chip.on{background:rgba(224,189,130,.16);border-color:rgba(224,189,130,.55);color:#f1ddb5}', 1, 'chip 选中')

# ---------- 5. 滑杆 ----------
rep('.fld input[type=range]::-webkit-slider-runnable-track{height:4px;background:#e3e6ee;border-radius:4px}',
    '.fld input[type=range]::-webkit-slider-runnable-track{height:4px;background:#2a3444;border-radius:4px}', 1, '滑杆轨道')
rep("""  background:#fff;border:2px solid var(--tx);margin-top:-5.5px;box-shadow:0 1px 3px rgba(0,0,0,.15)}""",
    """  background:#e0bd82;border:2px solid #0a0e15;margin-top:-5.5px;box-shadow:0 1px 3px rgba(0,0,0,.45)}""",
    1, '滑杆滑块')
rep('background:linear-gradient(90deg,#e2c9c9,#e6e8ee 50%,#c6ddcd)',
    'background:linear-gradient(90deg,#4a2f33,#243040 50%,#2b4a3c)', 1, '运气偏差轨道')
rep("""  background:#fff;border:2px solid var(--tx);margin-top:-5px;box-shadow:0 1px 3px rgba(0,0,0,.18)}""",
    """  background:#e0bd82;border:2px solid #0a0e15;margin-top:-5px;box-shadow:0 1px 3px rgba(0,0,0,.45)}""",
    1, '运气偏差滑块')
rep('.luckbar{background:#eef0f5;height:9px;border-radius:5px;position:relative;min-width:70px}',
    '.luckbar{background:#22303f;height:9px;border-radius:5px;position:relative;min-width:70px}', 1, '分布条底')

# ---------- 6. 脚本里写死的行内色 ----------
rep("""(on ? ' style="background:#f7f9fc"' : '')""", """(on ? ' style="background:rgba(224,189,130,.07)"' : '')""",
    2, '策略表高亮行')
rep("""(on ? ' style="background:#f7fafd"' : '')""", """(on ? ' style="background:rgba(110,168,255,.06)"' : '')""",
    1, '档位表在口径内')
rep("""(hi ? ' style="background:#eef4fb"' : '')""", """(hi ? ' style="background:rgba(110,168,255,.10)"' : '')""",
    1, '敏感性表当前行')
rep("(on ? '#2c6da8' : '#c3cad8')", "(on ? '#6ea8ff' : '#3b4a5f')", 1, '分布条颜色')
rep('color:#c0392b', 'color:#e0798a', 3, '校准提示红字')

# ---------- 7. 嵌进 iframe 时收起重复的大标题（新窗口打开时仍保留） ----------
rep('</head>', '''<script>if(window.self!==window.top)document.documentElement.classList.add('gcEmbed');</script>
<style>
  /* 嵌在忘忘看报标签页里时，外面已经有标题了，这里只留子页签，省掉一段重复标题 */
  html.gcEmbed .hd h1,html.gcEmbed .hd .sub{display:none}
  html.gcEmbed .hd{padding-top:12px}
  html.gcEmbed header{margin-bottom:12px}
  /* 深色彩色滚动条，别在暗色面板里露出一条白边 */
  html.gcEmbed ::-webkit-scrollbar{width:10px;height:10px}
  html.gcEmbed ::-webkit-scrollbar-track{background:transparent}
  html.gcEmbed ::-webkit-scrollbar-thumb{background:#2c3a4d;border-radius:9px;border:2px solid #0c1017}
  html.gcEmbed ::-webkit-scrollbar-thumb:hover{background:#3a4b61}
  html.gcEmbed{scrollbar-color:#2c3a4d transparent}
</style>
</head>''', 1, '嵌入态样式')

io.open(OUT, 'w', encoding='utf-8', newline='').write(s)
print(f'{OUT}: {orig_len} -> {len(s)} 字符')
