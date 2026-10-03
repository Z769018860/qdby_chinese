(() => {
  "use strict";

  const DATA_URL = "data/morimens/huiji/summon-rerun/index.json?v=20261003.1";
  const DAY = 86400000;
  const $ = (id) => document.getElementById(id);
  const state = { data: null, appearances: [], cardKind: "character" };

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

  function parseDate(value) {
    return value ? new Date(value) : null;
  }

  function formatDate(value, includeTime = false) {
    const d = value instanceof Date ? value : parseDate(value);
    if (!d || Number.isNaN(d.getTime())) return "—";
    const options = includeTime
      ? { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }
      : { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" };
    return new Intl.DateTimeFormat("zh-CN", options).format(d).replaceAll("/", "-");
  }

  function formatRange(start, end) {
    return `${formatDate(start)} ～ ${formatDate(end)}`;
  }

  function diffDays(from, to) {
    if (!from || !to) return null;
    return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY));
  }

  function isRerun(tag) {
    return String(tag || "").includes("复刻");
  }

  function expandAppearances(data) {
    const rows = [];
    for (const record of data.history || []) {
      const baseStart = parseDate(record.start);
      const baseEnd = parseDate(record.end);

      if (record.dailyRotation?.slots?.length) {
        const slots = record.dailyRotation.slots;
        const repeats = Number(record.dailyRotation.repeats || 1);
        for (let round = 0; round < repeats; round += 1) {
          slots.forEach((slot, slotIndex) => {
            const offset = round * slots.length + slotIndex;
            const start = new Date(baseStart.getTime() + offset * DAY);
            const end = new Date(start.getTime() + DAY);
            const count = Math.max(slot.characters?.length || 0, slot.wheels?.length || 0);
            for (let i = 0; i < count; i += 1) {
              rows.push({
                campaignId: record.id,
                sourceYear: record.sourceYear,
                tag: record.tag,
                start,
                end,
                character: slot.characters?.[i] || null,
                wheel: slot.wheels?.[i] || null,
                sourceRecord: record,
                dailyRotation: true
              });
            }
          });
        }
        continue;
      }

      const count = Math.max(record.characters?.length || 0, record.wheels?.length || 0);
      for (let i = 0; i < count; i += 1) {
        rows.push({
          campaignId: record.id,
          sourceYear: record.sourceYear,
          tag: record.tag,
          start: baseStart,
          end: baseEnd,
          character: record.characters?.[i] || null,
          wheel: record.wheels?.[i] || null,
          sourceRecord: record,
          dailyRotation: false
        });
      }
    }
    return rows;
  }

  function distinctCampaignCount(rows, predicate) {
    return new Set(rows.filter(predicate).map((row) => row.campaignId)).size;
  }

  function computeWindow(rows, asOf) {
    const active = rows
      .filter((row) => row.start <= asOf && (!row.end || asOf < row.end))
      .sort((a, b) => b.start - a.start);
    const future = rows
      .filter((row) => row.start > asOf)
      .sort((a, b) => a.start - b.start);
    const past = rows
      .filter((row) => row.end && row.end <= asOf)
      .sort((a, b) => b.end - a.end);

    const current = active[0] || null;
    const last = current || past[0] || null;
    const next = future[0] || null;
    const gapDays = current ? 0 : (last?.end ? diffDays(last.end, asOf) : null);

    return { active: current, last, next, gapDays };
  }

  function buildUnitRows(kind) {
    const data = state.data;
    const asOf = parseDate(data.asOf);
    const key = kind === "wheel" ? "wheel" : "character";
    const names = [...new Set(state.appearances.map((row) => row[key]).filter(Boolean))];

    return names.map((name) => {
      const rows = state.appearances.filter((row) => row[key] === name);
      const window = computeWindow(rows, asOf);
      const rerunCount = distinctCampaignCount(rows, (row) => isRerun(row.tag) && row.start <= asOf);
      const first = [...rows].sort((a, b) => a.start - b.start)[0] || null;
      return { name, rows, first, rerunCount, ...window };
    }).filter((row) => row.gapDays !== null)
      .sort((a, b) => {
        if (b.gapDays !== a.gapDays) return b.gapDays - a.gapDays;
        return a.name.localeCompare(b.name, "zh-CN");
      });
  }

  function buildActivityRows() {
    const asOf = parseDate(state.data.asOf);
    return (state.data.launchPairs || []).map((pair) => {
      const rows = state.appearances.filter((row) => row.character === pair.character && row.wheel === pair.wheel);
      const window = computeWindow(rows, asOf);
      const rerunCount = distinctCampaignCount(rows, (row) => isRerun(row.tag) && row.start <= asOf);
      return { ...pair, rows, rerunCount, ...window };
    }).filter((row) => row.gapDays !== null)
      .sort((a, b) => {
        if (b.gapDays !== a.gapDays) return b.gapDays - a.gapDays;
        return (a.characterBanner || a.character).localeCompare(b.characterBanner || b.character, "zh-CN");
      });
  }

  function statusBadge(row) {
    if (row.active) {
      const label = isRerun(row.active.tag) ? "复刻进行中" : "首发进行中";
      return `<span class="badge good">${label}</span>`;
    }
    if (row.next) {
      return `<span class="badge soon">已公布 ${formatDate(row.next.start)}</span>`;
    }
    if (row.rerunCount === 0) {
      return `<span class="badge warn">尚未复刻</span>`;
    }
    return `<span class="badge quiet">等待复刻</span>`;
  }

  function lastAppearanceText(row) {
    if (row.active) {
      return `${isRerun(row.active.tag) ? "当前复刻" : "当前首发"} · ${formatRange(row.active.start, row.active.end)}`;
    }
    if (!row.last) return "—";
    return `${isRerun(row.last.tag) ? "上次复刻" : "首发"}结束 · ${formatDate(row.last.end)}`;
  }

  function renderSummary() {
    const data = state.data;
    const asOf = parseDate(data.asOf);
    const all = data.history || [];
    const active = all.filter((r) => parseDate(r.start) <= asOf && asOf < parseDate(r.end));
    const future = all.filter((r) => parseDate(r.start) > asOf).sort((a, b) => parseDate(a.start) - parseDate(b.start));
    const reruns = all.filter((r) => isRerun(r.tag));

    $("sourceTime").textContent = formatDate(data.source.retrievedAt, true);
    $("asOfTime").textContent = formatDate(data.asOf, true);
    $("historyCount").textContent = all.length;
    $("rerunCount").textContent = reruns.length;
    $("pairCount").textContent = (data.launchPairs || []).length;

    const currentText = active.length
      ? active.map((r) => `${r.characters.join(" / ")} · ${r.tag}`).join("；")
      : "当前无活动唤醒记录";
    $("currentPool").textContent = currentText;

    if (future[0]) {
      $("nextPool").innerHTML = `<strong>${formatDate(future[0].start)}</strong> · ${escapeHtml(future[0].characters.join(" / "))} <span>${escapeHtml(future[0].tag)}</span>`;
    } else {
      $("nextPool").textContent = "暂无已公布未来卡池";
    }
  }

  function renderCardRanking() {
    const kind = state.cardKind;
    const search = ($("cardSearch").value || "").trim().toLowerCase();
    const showScheduled = $("showScheduled").checked;
    let rows = buildUnitRows(kind);
    if (search) rows = rows.filter((row) => row.name.toLowerCase().includes(search));
    if (!showScheduled) rows = rows.filter((row) => !row.next);

    const label = kind === "wheel" ? "命轮" : "唤醒体";
    $("cardRankingCaption").textContent = `${label} · ${rows.length} 项 · 按空窗天数降序`;

    if (!rows.length) {
      $("cardRankingBody").innerHTML = `<tr><td colspan="7" class="empty">没有符合筛选条件的记录。</td></tr>`;
      return;
    }

    $("cardRankingBody").innerHTML = rows.map((row, index) => `
      <tr class="${row.next ? "has-next" : ""}">
        <td class="rank">${index + 1}</td>
        <td><strong>${escapeHtml(row.name)}</strong>${row.first ? `<small>首次：${formatDate(row.first.start)}</small>` : ""}</td>
        <td>${escapeHtml(lastAppearanceText(row))}</td>
        <td class="gap"><strong>${row.gapDays}</strong><span>天</span></td>
        <td>${row.rerunCount}</td>
        <td>${statusBadge(row)}</td>
        <td>${row.next ? formatRange(row.next.start, row.next.end) : "—"}</td>
      </tr>
    `).join("");
  }

  function renderActivityRanking() {
    const search = ($("activitySearch").value || "").trim().toLowerCase();
    const showScheduled = $("showActivityScheduled").checked;
    let rows = buildActivityRows();
    if (search) {
      rows = rows.filter((row) => [row.characterBanner, row.wheelBanner, row.character, row.wheel]
        .filter(Boolean).join(" ").toLowerCase().includes(search));
    }
    if (!showScheduled) rows = rows.filter((row) => !row.next);

    $("activityRankingCaption").textContent = `首发活动唤醒组合 · ${rows.length} 项 · 按空窗天数降序`;
    if (!rows.length) {
      $("activityRankingBody").innerHTML = `<tr><td colspan="7" class="empty">没有符合筛选条件的记录。</td></tr>`;
      return;
    }

    $("activityRankingBody").innerHTML = rows.map((row, index) => {
      const name = [row.characterBanner, row.wheelBanner].filter(Boolean).join(" / ") || `${row.character} / ${row.wheel}`;
      return `
        <tr class="${row.next ? "has-next" : ""}">
          <td class="rank">${index + 1}</td>
          <td><strong>${escapeHtml(name)}</strong><small>${escapeHtml(row.character)} + ${escapeHtml(row.wheel)}</small></td>
          <td>${escapeHtml(lastAppearanceText(row))}</td>
          <td class="gap"><strong>${row.gapDays}</strong><span>天</span></td>
          <td>${row.rerunCount}</td>
          <td>${statusBadge(row)}</td>
          <td>${row.next ? formatRange(row.next.start, row.next.end) : "—"}</td>
        </tr>`;
    }).join("");
  }

  function recordStatus(record, asOf) {
    const start = parseDate(record.start);
    const end = parseDate(record.end);
    if (start > asOf) return `<span class="badge soon">已公布</span>`;
    if (start <= asOf && asOf < end) return `<span class="badge good">进行中</span>`;
    return `<span class="badge quiet">已结束</span>`;
  }

  function renderHistory() {
    const data = state.data;
    const asOf = parseDate(data.asOf);
    const year = $("historyYear").value;
    const tag = $("historyTag").value;

    let rows = [...(data.history || [])].sort((a, b) => parseDate(b.start) - parseDate(a.start));
    if (year !== "all") rows = rows.filter((row) => String(row.sourceYear) === year);
    if (tag !== "all") rows = rows.filter((row) => row.tag === tag);

    $("historyCaption").textContent = `Wiki 活动唤醒历史 · ${rows.length} 条`;
    $("historyBody").innerHTML = rows.map((row) => {
      const note = row.normalizationNote ? `<div class="source-note">⚠ ${escapeHtml(row.normalizationNote)}</div>` : "";
      return `
        <tr>
          <td>${recordStatus(row, asOf)}</td>
          <td><strong>${formatRange(row.start, row.end)}</strong><small>源字段：${escapeHtml(String(row.sourceTime || "").replaceAll("<br>", " "))}</small>${note}</td>
          <td><span class="badge ${isRerun(row.tag) ? "rerun" : "new"}">${escapeHtml(row.tag)}</span></td>
          <td>${row.characters.map(escapeHtml).join("、")}</td>
          <td>${row.wheels.map(escapeHtml).join("、")}</td>
        </tr>`;
    }).join("") || `<tr><td colspan="5" class="empty">没有符合筛选条件的历史记录。</td></tr>`;
  }

  function setupControls() {
    document.querySelectorAll("[data-card-kind]").forEach((button) => {
      button.addEventListener("click", () => {
        state.cardKind = button.dataset.cardKind;
        document.querySelectorAll("[data-card-kind]").forEach((btn) => btn.setAttribute("aria-pressed", String(btn === button)));
        renderCardRanking();
      });
    });
    ["cardSearch", "showScheduled"].forEach((id) => $(id).addEventListener(id === "cardSearch" ? "input" : "change", renderCardRanking));
    ["activitySearch", "showActivityScheduled"].forEach((id) => $(id).addEventListener(id === "activitySearch" ? "input" : "change", renderActivityRanking));
    ["historyYear", "historyTag"].forEach((id) => $(id).addEventListener("change", renderHistory));
  }

  async function init() {
    try {
      const response = await fetch(DATA_URL, { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.data = await response.json();
      const historyFiles = state.data.historyFiles || [];
      const historyParts = await Promise.all(historyFiles.map(async (file) => {
        const partResponse = await fetch(`data/morimens/huiji/summon-rerun/${file}?v=20261003.1`, { cache: "no-cache" });
        if (!partResponse.ok) throw new Error(`${file}: HTTP ${partResponse.status}`);
        return partResponse.json();
      }));
      state.data.history = historyParts.flat();
      state.appearances = expandAppearances(state.data);
      renderSummary();
      renderCardRanking();
      renderActivityRanking();
      renderHistory();
      setupControls();
      document.body.classList.remove("loading");
    } catch (error) {
      console.error("Failed to load rerun data", error);
      $("loadError").hidden = false;
      $("loadError").textContent = `复刻数据载入失败：${error.message}`;
      document.body.classList.remove("loading");
    }
  }

  init();
})();
