const OLD_PREFIX = 'J31mEo';
const NEW_PREFIX = 'J31mEo2:';

let previousUrls = [];
let lastBaseName = 'save';

function byId(id) {
  return document.getElementById(id);
}

function normalizeName(name) {
  return String(name).normalize('NFC');
}

function oldDecrypt(saveText) {
  if (!saveText.startsWith(OLD_PREFIX)) {
    throw new Error('不是旧格式存档，旧格式前缀应为 J31mEo');
  }

  const payload = saveText.slice(OLD_PREFIX.length);
  const decoded = decodeURIComponent(payload);
  let output = '';

  for (const ch of decoded) {
    output += String.fromCharCode(Math.floor(ch.charCodeAt(0) / 2));
  }

  return output;
}

function oldEncrypt(jsonText) {
  let doubled = '';
  for (const ch of jsonText) {
    doubled += String.fromCharCode(ch.charCodeAt(0) * 2);
  }
  return OLD_PREFIX + encodeURIComponent(doubled);
}

function newDecrypt(saveText) {
  if (!saveText.startsWith(NEW_PREFIX)) {
    throw new Error('不是新格式存档，新格式前缀应为 J31mEo2:');
  }

  const payload = saveText.slice(NEW_PREFIX.length);
  const bytes = Uint8Array.from(atob(payload), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function newEncrypt(jsonText) {
  const bytes = new TextEncoder().encode(jsonText);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return NEW_PREFIX + btoa(binary);
}

function encryptByFormat(jsonText, format) {
  return format === 'old' ? oldEncrypt(jsonText) : newEncrypt(jsonText);
}

function autoDecrypt(saveText) {
  if (saveText.startsWith(NEW_PREFIX)) return newDecrypt(saveText);
  if (saveText.startsWith(OLD_PREFIX)) return oldDecrypt(saveText);
  throw new Error('无法识别存档格式：既不是旧格式 J31mEo，也不是新格式 J31mEo2:');
}

function getCharname(data) {
  if (data && typeof data === 'object') {
    if (data.vars && typeof data.vars === 'object' && 'charname' in data.vars) {
      return data.vars.charname;
    }
    if ('charname' in data) {
      return data.charname;
    }
  }
  return null;
}

function setCharname(data, newName, shouldNormalize) {
  if (!data || typeof data !== 'object') {
    throw new Error('存档 JSON 顶层不是对象，无法设置 charname');
  }

  const fixedName = shouldNormalize ? normalizeName(newName) : String(newName);

  if (data.vars && typeof data.vars === 'object') {
    data.vars.charname = fixedName;
  } else {
    data.vars = { charname: fixedName };
  }

  if ('charname' in data) {
    data.charname = fixedName;
  }

  return data;
}

function createDownloadUrl(content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  return URL.createObjectURL(blob);
}

function clearOldUrls() {
  previousUrls.forEach((url) => URL.revokeObjectURL(url));
  previousUrls = [];
}

function registerUrl(url) {
  previousUrls.push(url);
  return url;
}

function setStatus(message, isError = false) {
  const statusEl = byId('toolStatus');
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function setSummary(message) {
  const summaryEl = byId('nameSummary');
  if (!summaryEl) return;
  summaryEl.textContent = message;
}

function setResultVisible(visible) {
  const resultEl = byId('toolResult');
  if (!resultEl) return;
  resultEl.hidden = !visible;
}

function setAnchorDownload(id, href, filename) {
  const link = byId(id);
  if (!link) return;
  link.href = href;
  link.download = filename;
}

function clearAnchorDownload(id) {
  const link = byId(id);
  if (!link) return;
  link.removeAttribute('href');
  link.removeAttribute('download');
}

function compactJsonOrThrow(text, sourceLabel) {
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed);
  } catch (error) {
    throw new Error(`${sourceLabel} 解析失败：${error.message || error}`);
  }
}

async function runRepair() {
  try {
    clearOldUrls();
    setResultVisible(false);

    const fileInput = byId('saveFile');
    const nameInput = byId('charName');
    const normalizeCheckbox = byId('normalizeName');
    const formatSelect = byId('outputFormat');

    if (!fileInput || !nameInput) {
      throw new Error('页面控件加载失败，请刷新页面后重试。');
    }

    const inputFile = fileInput.files?.[0];
    const newName = nameInput.value.trim();

    if (!inputFile) {
      throw new Error('请先上传存档文件。');
    }
    if (!newName) {
      throw new Error('请输入新的主角名。');
    }

    const saveText = (await inputFile.text()).trim();
    const jsonText = autoDecrypt(saveText);
    const data = JSON.parse(jsonText);

    const oldName = getCharname(data);
    const shouldNormalize = normalizeCheckbox ? normalizeCheckbox.checked : true;
    setCharname(data, newName, shouldNormalize);
    const fixedName = getCharname(data);

    const fixedJsonPretty = JSON.stringify(data, null, 2);
    const fixedJsonCompact = JSON.stringify(data);

    const outputFormat = formatSelect?.value === 'old' ? 'old' : 'new';
    const fixedSave = encryptByFormat(fixedJsonCompact, outputFormat);

    lastBaseName = (inputFile.name || 'save').replace(/\.[^.]+$/, '');
    const repairedSaveName = `${lastBaseName}_repaired_${outputFormat}.sav`;
    const jsonName = `${lastBaseName}_decrypted.json`;

    const saveUrl = registerUrl(createDownloadUrl(fixedSave, 'text/plain;charset=utf-8'));
    const jsonUrl = registerUrl(createDownloadUrl(fixedJsonPretty, 'application/json;charset=utf-8'));

    setAnchorDownload('downloadSave', saveUrl, repairedSaveName);
    setAnchorDownload('downloadJson', jsonUrl, jsonName);

    setSummary(`主角名：${oldName ?? '（未找到）'} → ${fixedName ?? '（未找到）'}；输出格式：${outputFormat === 'old' ? '旧版加密 J31mEo' : '新版加密 J31mEo2:'}`);

    const jsonEditor = byId('jsonEditor');
    if (jsonEditor) {
      jsonEditor.value = fixedJsonPretty;
    }
    clearAnchorDownload('downloadEditedSave');
    setResultVisible(true);

    if (outputFormat === 'old') {
      setStatus('修复成功：已生成旧版加密存档。注意：旧版不兼容中文名，可能显示乱码。');
    } else {
      setStatus('修复成功：已生成新版加密存档（仅适用于【我本人发布的】汉化版）。');
    }
  } catch (error) {
    setResultVisible(false);
    setStatus(`处理失败：${error.message || error}`, true);
  }
}

function runEncryptEditedJson() {
  try {
    const editor = byId('jsonEditor');
    const formatSelect = byId('jsonEncryptFormat');

    const edited = editor?.value?.trim() ?? '';
    if (!edited) {
      throw new Error('请先生成 JSON，或输入要加密的 JSON 内容。');
    }

    const compactJson = compactJsonOrThrow(edited, '编辑区 JSON');
    const format = formatSelect?.value === 'old' ? 'old' : 'new';
    const saveText = encryptByFormat(compactJson, format);

    const editedSaveName = `${lastBaseName}_edited_${format}.sav`;
    const editedUrl = registerUrl(createDownloadUrl(saveText, 'text/plain;charset=utf-8'));
    setAnchorDownload('downloadEditedSave', editedUrl, editedSaveName);

    setStatus(`已将编辑后的 JSON 加密为 ${format === 'old' ? '旧版' : '新版'} .sav，请点击下载。`);
  } catch (error) {
    setStatus(`JSON 再加密失败：${error.message || error}`, true);
  }
}

async function runEncryptJsonUpload() {
  try {
    const fileInput = byId('jsonUploadFile');
    const formatSelect = byId('jsonUploadFormat');

    if (!fileInput) {
      throw new Error('JSON 上传入口初始化失败，请刷新页面后重试。');
    }

    const inputFile = fileInput.files?.[0];
    if (!inputFile) {
      throw new Error('请先上传 JSON 文件。');
    }

    const rawText = await inputFile.text();
    const compactJson = compactJsonOrThrow(rawText, '上传 JSON 文件');

    const format = formatSelect?.value === 'old' ? 'old' : 'new';
    const saveText = encryptByFormat(compactJson, format);

    const baseName = (inputFile.name || 'save').replace(/\.[^.]+$/, '');
    const saveName = `${baseName}_encrypted_${format}.sav`;
    const saveUrl = registerUrl(createDownloadUrl(saveText, 'text/plain;charset=utf-8'));
    setAnchorDownload('downloadJsonUploadedSave', saveUrl, saveName);

    setStatus(`JSON 上传加密成功：已生成${format === 'old' ? '旧版' : '新版'} .sav，请点击下载。`);
  } catch (error) {
    setStatus(`JSON 上传加密失败：${error.message || error}`, true);
  }
}

function bindEvents() {
  byId('runRepair')?.addEventListener('click', runRepair);
  byId('encryptEditedJson')?.addEventListener('click', runEncryptEditedJson);
  byId('runEncryptJsonUpload')?.addEventListener('click', runEncryptJsonUpload);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindEvents, { once: true });
} else {
  bindEvents();
}
