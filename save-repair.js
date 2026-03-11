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

function parseJsonText(rawText, sourceName = 'JSON') {
  const text = String(rawText || '').replace(/^\uFEFF/, '');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${sourceName}解析失败：${error.message || error}`);
  }
}

function clearOldUrls(urls) {
  urls.forEach((url) => URL.revokeObjectURL(url));
  urls.length = 0;
}

function isValidOutputFormat(format) {
  return format === 'old' || format === 'new';
}

function encryptByFormat(jsonText, outputFormat) {
  if (!isValidOutputFormat(outputFormat)) {
    throw new Error('输出格式无效，请选择“旧版加密”或“新版加密”。');
  }
  return outputFormat === 'old' ? oldEncrypt(jsonText) : newEncrypt(jsonText);
}

const dom = {
  repair: {
    file: document.querySelector('#saveFile'),
    name: document.querySelector('#charName'),
    format: document.querySelector('#repairOutputFormat'),
    normalize: document.querySelector('#normalizeName'),
    run: document.querySelector('#runRepair'),
    status: document.querySelector('#repairStatus'),
    result: document.querySelector('#repairResult'),
    summary: document.querySelector('#repairSummary'),
    saveLink: document.querySelector('#downloadRepairSave'),
    jsonLink: document.querySelector('#downloadRepairJson'),
    preview: document.querySelector('#repairJsonPreview'),
  },
  jsonEncrypt: {
    file: document.querySelector('#jsonFile'),
    format: document.querySelector('#jsonOutputFormat'),
    run: document.querySelector('#runJsonEncrypt'),
    status: document.querySelector('#jsonStatus'),
    result: document.querySelector('#jsonResult'),
    summary: document.querySelector('#jsonSummary'),
    saveLink: document.querySelector('#downloadJsonSave'),
    jsonLink: document.querySelector('#downloadJsonSource'),
    preview: document.querySelector('#jsonPreview'),
  },
};

const repairUrls = [];
const jsonUrls = [];

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle('error', isError);
}

async function runRepairModule() {
  try {
    clearOldUrls(repairUrls);
    dom.repair.result.hidden = true;

    const inputFile = dom.repair.file.files?.[0];
    const newName = dom.repair.name.value.trim();
    const outputFormat = dom.repair.format.value;

    if (!inputFile) {
      throw new Error('请先上传存档文件。');
    }
    if (!newName) {
      throw new Error('请输入新的主角名。');
    }
    const saveText = (await inputFile.text()).trim();
    const jsonText = autoDecrypt(saveText);
    const data = parseJsonText(jsonText, '解密后的 JSON');

    const oldName = getCharname(data);
    setCharname(data, newName, dom.repair.normalize.checked);
    const fixedName = getCharname(data);

    const fixedJsonPretty = JSON.stringify(data, null, 2);
    const fixedJsonCompact = JSON.stringify(data);
    const fixedSave = encryptByFormat(fixedJsonCompact, outputFormat);

  previousUrls.push(saveUrl, jsonUrl);

    const saveUrl = createDownloadUrl(fixedSave, 'text/plain;charset=utf-8');
    const jsonUrl = createDownloadUrl(fixedJsonPretty, 'application/json;charset=utf-8');
    repairUrls.push(saveUrl, jsonUrl);

    dom.repair.saveLink.href = saveUrl;
    dom.repair.saveLink.download = repairedSaveName;
    dom.repair.jsonLink.href = jsonUrl;
    dom.repair.jsonLink.download = jsonName;
    dom.repair.summary.textContent = `主角名：${oldName ?? '（未找到）'} → ${fixedName ?? '（未找到）'}；输出格式：${outputFormat === 'old' ? '旧版加密 J31mEo' : '新版加密 J31mEo2:'}`;
    dom.repair.preview.textContent = fixedJsonPretty;
    dom.repair.result.hidden = false;

    if (outputFormat === 'old') {
      setStatus(dom.repair.status, '修复成功：已生成旧版加密存档。注意：旧版不兼容中文名，可能显示乱码。');
    } else {
      setStatus(dom.repair.status, '修复成功：已生成新版加密存档（仅适用于【我本人发布的】汉化版）。');
    }

    dom.repair.saveLink.click();
  } catch (error) {
    dom.repair.result.hidden = true;
    setStatus(dom.repair.status, `处理失败：${error.message || error}`, true);
  }
}

async function runJsonEncryptModule() {
  try {
    clearOldUrls(jsonUrls);
    dom.jsonEncrypt.result.hidden = true;

    const inputFile = dom.jsonEncrypt.file.files?.[0];
    const outputFormat = dom.jsonEncrypt.format.value;
    if (!inputFile) {
      throw new Error('请先上传 JSON 文件。');
    }
    const rawText = await inputFile.text();
    const data = parseJsonText(rawText, 'JSON 文件');
    const compactJson = JSON.stringify(data);
    const prettyJson = JSON.stringify(data, null, 2);
    const encryptedSave = encryptByFormat(compactJson, outputFormat);

    const baseName = (inputFile.name || 'data').replace(/\.[^.]+$/, '');
    const saveName = `${baseName}_encrypted_${outputFormat}.sav`;

    const saveUrl = createDownloadUrl(encryptedSave, 'text/plain;charset=utf-8');
    const jsonUrl = createDownloadUrl(prettyJson, 'application/json;charset=utf-8');
    jsonUrls.push(saveUrl, jsonUrl);

    dom.jsonEncrypt.saveLink.href = saveUrl;
    dom.jsonEncrypt.saveLink.download = saveName;
    dom.jsonEncrypt.jsonLink.href = jsonUrl;
    dom.jsonEncrypt.jsonLink.download = `${baseName}_validated.json`;
    dom.jsonEncrypt.summary.textContent = `JSON 加密成功，输出格式：${outputFormat === 'old' ? '旧版' : '新版'}`;
    dom.jsonEncrypt.preview.textContent = prettyJson;
    dom.jsonEncrypt.result.hidden = false;

    if (outputFormat === 'old') {
      setStatus(dom.jsonEncrypt.status, 'JSON 加密成功：已生成旧版加密存档。注意：旧版不兼容中文内容，可能显示乱码。');
    } else {
      setStatus(dom.jsonEncrypt.status, 'JSON 加密成功：已生成新版加密存档。');
    }

    dom.jsonEncrypt.saveLink.click();
  } catch (error) {
    dom.jsonEncrypt.result.hidden = true;
    setStatus(dom.jsonEncrypt.status, `处理失败：${error.message || error}`, true);
  }
}

if (dom.repair.run) dom.repair.run.addEventListener('click', runRepairModule);
if (dom.jsonEncrypt.run) dom.jsonEncrypt.run.addEventListener('click', runJsonEncryptModule);
