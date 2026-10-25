#!/usr/bin/env python3
"""Rebuild data/morimens/replay/team-tempo.json —— 守密人「节奏」维度的参照数据库。

来源：data/morimens/dzone/season*/battle-summary.jsonl.gz（官方 Rank.QueryRank 的 recordStageData，
一场战斗一行，无需下载回放）。每行给出 stageId / 阵容（4 名唤醒体 tid）/ 回合数 / 用牌数。

数据库回答一个问题：**这场战斗的推进节奏，和「同一支队伍」以往的表现比是快是慢？**

为什么必须按队伍比：回合数本身主要由队伍强度、命轮密契面板决定；把「回合数短」直接当加分，
等于把卡组强度算成守密人的决策质量。但同一支队伍（同 4 名唤醒体）的往期分布已经把强度、
面板、招式都固定住了，此时「比自己的常态快 / 慢」才接近纯粹的决策差异。

两个指标（都能在回放侧用同一口径复算）：

  speed = stageRoundCount / 同关卡所有队伍的回合数中位数     → 越小越快
  dens  = (totalUseCard / stageRoundCount) / 同关卡中位数    → 越大说明每回合越「有事做」

每支队伍存这两个比值的 p10 / p50 / p90。评分时用 p50 作中心（并按样本量向 1.0 收缩），
没有该队伍数据时退回「同关卡全体」（即与世界线比）。

输出格式（小写键、整数字、千分位，尽量压体积）：

  {"v":1,"built":"YYYY-MM-DD","n":45690,
   "stages":{"153657":[n, roundsMed*10, cprMed*1000], ...},
   "teams":{"tid,tid,tid,tid":[n, r10,r50,r90, c10,c50,c90], ...}}   # 比值 ×1000

回合中位存 ×10 而不是取整：短关卡只有 10 个回合，±0.5 回合就是 5%，取整会让速度项凭空偏 6 分。
前端读的时候 stages[1]/10、stages[2]/1000、teams[2]/1000、teams[5]/1000。

重新生成：python3 scripts/build-team-tempo.py
"""
import gzip
import glob
import json
import os
import statistics
import collections

ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(ROOT, 'data/morimens/replay/team-tempo.json')
MIN_TEAM_N = 3          # 少于 3 场的队伍不足以刻画「往期」，退回同关卡参照
MIN_STAGE_N = 8         # 少于 8 场的关卡不进入数据库（中位数不可信）
Q = (0.10, 0.50, 0.90)


def quant(sorted_v, p):
    if not sorted_v:
        return 0
    i = int(round(p * (len(sorted_v) - 1)))
    return sorted_v[max(0, min(len(sorted_v) - 1, i))]


def main():
    raw = []                     # (stageKey, lineup, rounds, cardsPerRound)
    files = sorted(glob.glob(os.path.join(ROOT, 'data/morimens/dzone/season*/battle-summary.jsonl.gz')))
    for path in files:
        with gzip.open(path, 'rt', encoding='utf-8') as f:
            for line in f:
                try:
                    r = json.loads(line)
                except Exception:
                    continue
                aw = r.get('awakers') or []
                if not aw:
                    continue                                   # 没有队伍明细的行（早期采集）无法归属
                sid = str(r.get('stageId') or '')
                if sid in ('', '0', 'None'):
                    continue
                rounds = int(r.get('stageRoundCount') or 0)
                if rounds <= 0:
                    continue
                cards = int(r.get('totalUseCard') or 0)
                if cards <= 0:
                    continue
                lineup = ','.join(sorted(str(x.get('tid')) for x in aw if x.get('tid') is not None))
                if len(lineup.split(',')) < 3:
                    continue                                   # 影像 / 单人关不构成「队伍」
                raw.append((sid, lineup, rounds, cards / rounds))

    if not raw:
        raise SystemExit('no usable battle rows')

    # 样本太少的关卡不配当中位数基准：少于 MIN_STAGE_N 场的关卡整个丢弃（连它的队伍数据一起），
    # 否则「中位数」就是某一两场的原值，归一化会把噪声当成节奏差异。
    _cnt = collections.Counter(x[0] for x in raw)
    raw = [x for x in raw if _cnt[x[0]] >= MIN_STAGE_N]
    if not raw:
        raise SystemExit('no stage with enough samples')

    # ---- 同关卡中位数（标准化基准）----
    by_stage = collections.defaultdict(list)
    for sid, _lu, rounds, cpr in raw:
        by_stage[sid].append((rounds, cpr))
    stage_med = {}
    for sid, v in by_stage.items():
        stage_med[sid] = (
            statistics.median([x[0] for x in v]),
            statistics.median([x[1] for x in v]),
            len(v),
        )

    # ---- 队伍往期：相对同关卡中位的比值 ----
    team_rel = collections.defaultdict(lambda: ([], []))
    for sid, lu, rounds, cpr in raw:
        mr, mc, _ = stage_med[sid]
        team_rel[lu][0].append(rounds / mr if mr else 1.0)
        team_rel[lu][1].append(cpr / mc if mc else 1.0)

    stages = {}
    for sid, (mr, mc, n) in sorted(stage_med.items()):
        stages[sid] = [n, int(round(mr * 10)), int(round(mc * 1000))]

    teams = {}
    for lu, (rs, cs) in team_rel.items():
        if len(rs) < MIN_TEAM_N:
            continue
        rs.sort()
        cs.sort()
        teams[lu] = [len(rs)] + [int(round(quant(rs, p) * 1000)) for p in Q] + \
                                [int(round(quant(cs, p) * 1000)) for p in Q]

    g_rounds = statistics.median([x[2] for x in raw])
    g_cpr = statistics.median([x[3] for x in raw])
    out = {
        'v': 1,
        'built': __import__('datetime').date.today().isoformat(),
        'n': len(raw),
        'stages': stages,
        'teams': teams,
        'g': [len(raw), int(round(g_rounds * 10)), int(round(g_cpr * 1000))],
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    size = os.path.getsize(OUT)
    print(f'{OUT}\n  battles {len(raw)} · stages {len(stages)} · teams(>={MIN_TEAM_N}) {len(teams)} · {size/1024:.0f} KB')
    print(f'  stage samples: min {min(v[0] for v in stages.values())} / median {statistics.median([v[0] for v in stages.values()])} / max {max(v[0] for v in stages.values())}')


if __name__ == '__main__':
    main()
