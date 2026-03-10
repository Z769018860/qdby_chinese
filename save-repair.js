const OLD_PREFIX = 'J31mEo';
const NEW_PREFIX = 'J31mEo2:';

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

const dom = {
  file: document.querySelector('#saveFile'),
  name: document.querySelector('#charName'),
  format: document.querySelector('#outputFormat'),
  normalize: document.querySelector('#normalizeName'),
  run: document.querySelector('#runRepair'),
  status: document.querySelector('#toolStatus'),
  result: document.querySelector('#toolResult'),
  summary: document.querySelector('#nameSummary'),
  saveLink: document.querySelector('#downloadSave'),
  jsonLink: document.querySelector('#downloadJson'),
  jsonPreview: document.querySelector('#jsonPreview'),
};

let previousUrls = [];

function clearOldUrls() {
  previousUrls.forEach((url) => URL.revokeObjectURL(url));
  previousUrls = [];
}

function setStatus(message, isError = false) {
  dom.status.textContent = message;
  dom.status.classList.toggle('error', isError);
}

async function runRepair() {
  try {
    clearOldUrls();
    dom.result.hidden = true;

    const inputFile = dom.file.files?.[0];
    const newName = dom.name.value.trim();

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
    setCharname(data, newName, dom.normalize.checked);
    const fixedName = getCharname(data);

    const fixedJsonPretty = JSON.stringify(data, null, 2);
    const fixedJsonCompact = JSON.stringify(data);

    const outputFormat = dom.format.value;
    const fixedSave = outputFormat === 'old' ? oldEncrypt(fixedJsonCompact) : newEncrypt(fixedJsonCompact);

    const baseName = (inputFile.name || 'save').replace(/\.[^.]+$/, '');
    const repairedSaveName = `${baseName}_repaired_${outputFormat}.sav`;
    const jsonName = `${baseName}_decrypted.json`;

    const saveUrl = createDownloadUrl(fixedSave, 'text/plain;charset=utf-8');
    const jsonUrl = createDownloadUrl(fixedJsonPretty, 'application/json;charset=utf-8');

    previousUrls.push(saveUrl, jsonUrl);

    dom.saveLink.href = saveUrl;
    dom.saveLink.download = repairedSaveName;
    dom.jsonLink.href = jsonUrl;
    dom.jsonLink.download = jsonName;
    dom.summary.textContent = `主角名：${oldName ?? '（未找到）'} → ${fixedName ?? '（未找到）'}；输出格式：${outputFormat === 'old' ? '旧版加密 J31mEo' : '新版加密 J31mEo2:'}`;
    dom.jsonPreview.textContent = fixedJsonPretty;
    dom.result.hidden = false;

    if (outputFormat === 'old') {
      setStatus('修复成功：已生成旧版加密存档。注意：旧版不兼容中文名，可能显示乱码。');
    } else {
      setStatus('修复成功：已生成新版加密存档（仅适用于【我本人发布的】汉化版）。');
    }
  } catch (error) {
    dom.result.hidden = true;
    setStatus(`处理失败：${error.message || error}`, true);
  }
}

dom.run.addEventListener('click', runRepair);
