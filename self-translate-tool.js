function setStatus(message, isError = false) {
  dom.status.textContent = message;
  dom.status.classList.toggle('error', isError);
}

function normalizePath(path) {
  return path.replace(/\[(\d+)\]/g, '/$1').replace(/\./g, '/').replace(/^\//, '');
}

function collectStrings(value, currentPath, output) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      output.push({ path: normalizePath(currentPath), text: value });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectStrings(item, `${currentPath}[${index}]`, output);
    });
    return;
  }

  if (value && typeof value === 'object') {
    Object.keys(value).forEach((key) => {
      const next = currentPath ? `${currentPath}.${key}` : key;
      collectStrings(value[key], next, output);
    });
  }
}

function setValueByPath(target, path, newValue) {
  const tokens = path.split('/').filter(Boolean);
  if (tokens.length === 0) return false;

  let cur = target;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = /^\d+$/.test(tokens[i]) ? Number(tokens[i]) : tokens[i];
    if (cur == null || !(token in cur)) return false;
    cur = cur[token];
  }

  const last = /^\d+$/.test(tokens[tokens.length - 1]) ? Number(tokens[tokens.length - 1]) : tokens[tokens.length - 1];
  if (cur == null || !(last in cur) || typeof cur[last] !== 'string') return false;
  cur[last] = newValue;
  return true;
}

async function readInputFiles(fileList) {
  if (!fileList || fileList.length === 0) {
    throw new Error('请先上传文件。');
  }

  const files = Array.from(fileList);
  const zipFile = files.find((f) => f.name.toLowerCase().endsWith('.zip'));

  if (zipFile) {
    if (!window.JSZip) throw new Error('JSZip 未加载成功，无法读取 ZIP。');

    const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
    const result = [];
    const entries = Object.values(zip.files).filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith('.json'));
    for (const entry of entries) {
      const text = await entry.async('string');
      result.push({ fileName: entry.name, content: text });
    }

    if (result.length === 0) throw new Error('ZIP 内未找到 .json 文件。');

    return { rootName: zipFile.name.replace(/\.zip$/i, ''), files: result };
  }

  const jsonFiles = files.filter((f) => f.name.toLowerCase().endsWith('.json'));
  if (jsonFiles.length === 0) throw new Error('请上传 .zip 或至少一个 .json 文件。');

  const result = [];
  for (const file of jsonFiles) {
    result.push({ fileName: file.name, content: await file.text() });
  }
  return { rootName: 'json_bundle', files: result };
}

function buildRowsFromJsonFiles(filePack) {
  const rows = [];
  for (const item of filePack.files) {
    let parsed;
    try {
      parsed = JSON.parse(item.content);
    } catch (_err) {
      continue;
    }

    const pieces = [];
    collectStrings(parsed, '', pieces);
    pieces.forEach((piece) => {
      rows.push({
        fileName: item.fileName,
        jsonPath: piece.path,
        extractedContent: piece.text,
        translatedContent: piece.text,
      });
    });
  }
  return rows;
}

function renderTable(rows) {
  dom.tbody.innerHTML = rows.map((row, idx) => `
    <tr data-row="${idx}">
      <td>${escapeHtml(row.fileName)}</td>
      <td>${escapeHtml(row.jsonPath)}</td>
      <td>${escapeHtml(row.extractedContent)}</td>
      <td><textarea class="translateCell" data-edit="${idx}">${escapeHtml(row.translatedContent)}</textarea></td>
    </tr>
  `).join('');
  dom.tableWrap.hidden = rows.length === 0;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function currentTableRows() {
  const copy = state.rows.map((row) => ({ ...row }));
  dom.tbody.querySelectorAll('textarea[data-edit]').forEach((ta) => {
    const idx = Number(ta.getAttribute('data-edit'));
    if (Number.isInteger(idx) && copy[idx]) copy[idx].translatedContent = ta.value;
  });
  return copy;
}

function triggerDownload(url, fileName) {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
}

function clearLastUrls() {
  state.urls.forEach((url) => URL.revokeObjectURL(url));
  state.urls = [];
}

function makeJsonTablePayload(rows) {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    rows,
  };
}

function rowsToXlsxBlob(rows) {
  if (!window.XLSX) throw new Error('XLSX 未加载成功，无法导出/读取 Excel。');

  const normalizedRows = rows.map((row) => ({
    'File Name': row.fileName,
    'JSON Path': row.jsonPath,
    'Extracted Content': row.extractedContent,
    'Translated Content': row.translatedContent,
  }));

  const ws = XLSX.utils.json_to_sheet(normalizedRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'table');
  const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

async function parseTableFile(file) {
  const lower = file.name.toLowerCase();

  if (lower.endsWith('.json')) {
    const json = JSON.parse(await file.text());
    const rows = Array.isArray(json) ? json : json.rows;
    if (!Array.isArray(rows)) throw new Error('JSON 表格结构无效，缺少 rows。');
    return rows;
  }

  if (lower.endsWith('.xlsx')) {
    if (!window.XLSX) throw new Error('XLSX 未加载成功，无法读取 Excel。');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const firstSheet = wb.SheetNames[0];
    if (!firstSheet) throw new Error('XLSX 中未找到工作表。');

    const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], { defval: '' });
    return rawRows.map((row) => ({
      fileName: row['File Name'] || row.fileName || '',
      jsonPath: row['JSON Path'] || row.jsonPath || '',
      extractedContent: row['Extracted Content'] || row.extractedContent || '',
      translatedContent: row['Translated Content'] || row.translatedContent || row['Extracted Content'] || '',
    }));
  }

  throw new Error('表格文件仅支持 .json 或 .xlsx');
}

async function handleExtract() {
  try {
    setStatus('正在提取，请稍候…');
    state.rows = [];
    dom.downloadWrap.hidden = true;

    const pack = await readInputFiles(dom.extractInput.files);
    const rows = buildRowsFromJsonFiles(pack);
    if (rows.length === 0) throw new Error('未提取到可用文本（请检查 JSON 内容是否为字符串字段）。');

    state.rows = rows;
    state.lastRootName = pack.rootName;
    renderTable(rows);
    setStatus(`提取完成：共 ${rows.length} 条文本。可在表格中编辑后下载 JSON / XLSX。`);
  } catch (error) {
    renderTable([]);
    setStatus(`提取失败：${error.message || error}`, true);
  }
}

function handleDownloadTableJson() {
  try {
    const rows = currentTableRows();
    if (rows.length === 0) throw new Error('当前没有可下载的表格数据，请先执行提取。');

    const payload = makeJsonTablePayload(rows);
    clearLastUrls();
    const fileName = `${state.lastRootName || 'extracted'}_table.json`;
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }));
    state.urls.push(url);
    triggerDownload(url, fileName);
    setStatus('表格 JSON 已下载。');
  } catch (error) {
    setStatus(`下载失败：${error.message || error}`, true);
  }
}

function handleDownloadTableXlsx() {
  try {
    const rows = currentTableRows();
    if (rows.length === 0) throw new Error('当前没有可下载的表格数据，请先执行提取。');

    clearLastUrls();
    const fileName = `${state.lastRootName || 'extracted'}_table.xlsx`;
    const url = URL.createObjectURL(rowsToXlsxBlob(rows));
    state.urls.push(url);
    triggerDownload(url, fileName);
    setStatus('表格 XLSX 已下载。');
  } catch (error) {
    setStatus(`下载失败：${error.message || error}`, true);
  }
}

async function handleReplace() {
  try {
    setStatus('正在替换并打包，请稍候…');
    dom.downloadWrap.hidden = true;

    const sourcePack = await readInputFiles(dom.sourceInput.files);
    const tableFile = dom.tableInput.files?.[0];
    if (!tableFile) throw new Error('请上传表格文件（.json 或 .xlsx）。');

    const rows = await parseTableFile(tableFile);
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('表格内容为空或格式无效。');

    const replaceMap = new Map();
    rows.forEach((row) => {
      if (!row || !row.fileName || !row.jsonPath) return;
      const key = `${row.fileName}::${row.jsonPath}`;
      replaceMap.set(key, row.translatedContent ?? row.extractedContent ?? '');
    });

    const outZip = new JSZip();
    let replacedCount = 0;

    for (const item of sourcePack.files) {
      let parsed;
      try {
        parsed = JSON.parse(item.content);
      } catch (_err) {
        outZip.file(item.fileName, item.content);
        continue;
      }

      const strings = [];
      collectStrings(parsed, '', strings);
      strings.forEach((piece) => {
        const key = `${item.fileName}::${piece.path}`;
        if (!replaceMap.has(key)) return;

        const next = replaceMap.get(key);
        if (typeof next === 'string' && next !== piece.text && setValueByPath(parsed, piece.path, next)) {
          replacedCount += 1;
        }
      });

      outZip.file(item.fileName, JSON.stringify(parsed, null, 2));
    }

    const zipBlob = await outZip.generateAsync({ type: 'blob' });
    clearLastUrls();
    const zipUrl = URL.createObjectURL(zipBlob);
    state.urls.push(zipUrl);

    dom.downloadZip.href = zipUrl;
    dom.downloadZip.download = `${sourcePack.rootName || 'translated'}_replaced.zip`;
    dom.downloadWrap.hidden = false;
    setStatus(`替换完成：共替换 ${replacedCount} 处文本，已生成完整 ZIP。`);
  } catch (error) {
    setStatus(`替换失败：${error.message || error}`, true);
  }
}

const dom = {
  extractInput: document.querySelector('#extractInput'),
  extractBtn: document.querySelector('#extractBtn'),
  downloadTableJsonBtn: document.querySelector('#downloadTableJsonBtn'),
  downloadTableXlsxBtn: document.querySelector('#downloadTableXlsxBtn'),
  sourceInput: document.querySelector('#sourceInput'),
  tableInput: document.querySelector('#tableInput'),
  replaceBtn: document.querySelector('#replaceBtn'),
  status: document.querySelector('#translateStatus'),
  tableWrap: document.querySelector('#tableWrap'),
  tbody: document.querySelector('#extractTbody'),
  downloadWrap: document.querySelector('#downloadWrap'),
  downloadZip: document.querySelector('#downloadZip'),
};

const state = {
  rows: [],
  urls: [],
  lastRootName: 'extracted',
};

dom.extractBtn.addEventListener('click', handleExtract);
dom.downloadTableJsonBtn.addEventListener('click', handleDownloadTableJson);
dom.downloadTableXlsxBtn.addEventListener('click', handleDownloadTableXlsx);
dom.replaceBtn.addEventListener('click', handleReplace);
