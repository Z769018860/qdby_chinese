from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from lunar_python import Solar

TZ = ZoneInfo("Asia/Shanghai")
OUT = Path("data/morimens/almanac/today.json")


def main() -> None:
    now = datetime.now(TZ)
    solar = Solar.fromYmd(now.year, now.month, now.day)
    lunar = solar.getLunar()
    payload = {
        "date": now.strftime("%Y-%m-%d"),
        "timezone": "Asia/Shanghai",
        "lunarDate": f"农历{lunar.getMonthInChinese()}月{lunar.getDayInChinese()}",
        "ganZhi": f"{lunar.getYearInGanZhi()}年 {lunar.getMonthInGanZhi()}月 {lunar.getDayInGanZhi()}日",
        "yi": list(lunar.getDayYi()),
        "ji": list(lunar.getDayJi()),
        "source": {
            "name": "lunar-python",
            "generatedAt": now.isoformat(),
            "note": "传统黄历仅作娱乐展示；页面会将宜忌适度转换为游戏内建议。"
        }
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT} for {payload['date']}: {len(payload['yi'])} 宜 / {len(payload['ji'])} 忌")


if __name__ == "__main__":
    main()
