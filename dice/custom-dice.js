const FACE_COUNT = 6;
const faceImageMap = new Map();
const faceTextMap = new Map();
const DEFAULT_IMAGE_POOL = [
  '1.jpeg', '2.jpeg', '3.jpeg', '4.jpeg', '5.jpeg', '6.jpeg',
  '7.png', '8.png', '9.png', '10.png', '11.png', '12.jpeg',
];

const faceToCubeClass = {
  1: '.face-front',
  2: '.face-bottom',
  3: '.face-right',
  4: '.face-left',
  5: '.face-top',
  6: '.face-back',
};

const topFocusRotationByFace = {
  1: { x: -55, y: 35 },
  2: { x: 145, y: 45 },
  3: { x: -55, y: -50 },
  4: { x: -55, y: 50 },
  5: { x: -35, y: 45 },
  6: { x: 55, y: -35 },
};

const previewRotation = { x: -35, y: 45 };

const diceNet = document.getElementById('diceNet');
const cube = document.getElementById('cube');
const rollBtn = document.getElementById('rollBtn');
const stopRollBtn = document.getElementById('stopRollBtn');
const resetBtn = document.getElementById('resetBtn');
const updateDiceBtn = document.getElementById('updateDiceBtn');
const updateHint = document.getElementById('updateHint');
const rollResult = document.getElementById('rollResult');
const textOpacityInput = document.getElementById('textOpacityInput');
const faceTextGrid = document.getElementById('faceTextGrid');

const cropDialog = document.getElementById('cropDialog');
const cropCanvas = document.getElementById('cropCanvas');
const zoomInput = document.getElementById('zoomInput');
const offsetXInput = document.getElementById('offsetXInput');
const offsetYInput = document.getElementById('offsetYInput');
const applyCropBtn = document.getElementById('applyCropBtn');
const cancelCropBtn = document.getElementById('cancelCropBtn');

const cropCtx = cropCanvas.getContext('2d');

let currentFace = null;
let sourceImage = null;
let spinX = 0;
let spinY = 0;
let rollingTimer = null;
let revealTimer = null;
let netRollTimer = null;
let isRolling = false;
let hasPendingChanges = false;

function setPendingChanges(isPending) {
  hasPendingChanges = isPending;
  if (hasPendingChanges) {
    updateHint.textContent = '你有未应用的改动，点击“更新骰子”同步。';
  } else {
    updateHint.textContent = '当前已是最新骰子效果。';
  }
}

function createLabel(text) {
  const span = document.createElement('span');
  span.className = 'faceLabel';
  span.textContent = text;
  span.style.display = text ? 'block' : 'none';
  return span;
}

function ensureFaceLabel(el) {
  let label = el.querySelector('.faceLabel');
  if (!label) {
    label = createLabel('');
    el.appendChild(label);
  }
  return label;
}

function getFaceText(face) {
  return (faceTextMap.get(face) || '').trim();
}

function setFaceText(face, text) {
  faceTextMap.set(face, String(text || '').slice(0, 24));
}

function applyFaceVisual(face, imageUrl) {
  const text = getFaceText(face);
  const netFace = diceNet.querySelector(`[data-face="${face}"]`);
  const cubeFace = cube.querySelector(faceToCubeClass[face]);

  if (netFace) {
    netFace.style.backgroundImage = imageUrl;
    const label = ensureFaceLabel(netFace);
    label.textContent = text;
    label.style.display = text ? 'block' : 'none';
  }

  if (cubeFace) {
    cubeFace.style.backgroundImage = imageUrl;
    const label = ensureFaceLabel(cubeFace);
    label.textContent = text;
    label.style.display = text ? 'block' : 'none';
  }
}

function applyAllFaces() {
  for (let face = 1; face <= FACE_COUNT; face += 1) {
    const imagePath = faceImageMap.get(face);
    if (!imagePath) continue;
    const imageUrl = imagePath.startsWith('data:') ? `url(${imagePath})` : `url(${imagePath})`;
    applyFaceVisual(face, imageUrl);
  }
  updateLabelOpacity();
  setPendingChanges(false);
}

function createTextEditors() {
  for (let face = 1; face <= FACE_COUNT; face += 1) {
    setFaceText(face, '');
    const wrapper = document.createElement('label');
    wrapper.innerHTML = `面 ${face} 文案`;

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 24;
    input.placeholder = `面 ${face}`;
    input.dataset.face = String(face);

    input.addEventListener('input', () => {
      setFaceText(face, input.value);
      setPendingChanges(true);
    });

    wrapper.appendChild(input);
    faceTextGrid.appendChild(wrapper);
  }
}

function createNetFaces() {
  for (let face = 1; face <= FACE_COUNT; face += 1) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `netFace net-face-${face}`;
    btn.dataset.face = String(face);
    btn.textContent = `面 ${face}`;
    btn.setAttribute('aria-label', `编辑六面骰第 ${face} 面`);
    btn.addEventListener('click', () => onSelectFace(face));
    btn.appendChild(createLabel(''));
    diceNet.appendChild(btn);
  }

  cube.querySelectorAll('.cubeFace').forEach((face) => {
    face.appendChild(createLabel(''));
  });
}

function updateLabelOpacity() {
  const opacity = Number(textOpacityInput.value);
  const normalized = Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 0.9;
  diceNet.querySelectorAll('.netFace').forEach((el) => {
    el.style.setProperty('--label-opacity', String(normalized));
  });
  cube.querySelectorAll('.cubeFace').forEach((el) => {
    el.style.setProperty('--label-opacity', String(normalized));
  });
}

function onSelectFace(face) {
  currentFace = face;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';

  input.addEventListener('change', async () => {
    const [file] = input.files || [];
    if (!file) return;
    const img = await loadImage(file);
    sourceImage = img;
    zoomInput.value = '1';
    offsetXInput.value = '0';
    offsetYInput.value = '0';
    renderCropPreview();
    cropDialog.showModal();
  });

  input.click();
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function renderCropPreview() {
  if (!sourceImage) return;

  const canvasSize = cropCanvas.width;
  const zoom = Number(zoomInput.value);
  const offsetX = Number(offsetXInput.value);
  const offsetY = Number(offsetYInput.value);

  cropCtx.clearRect(0, 0, canvasSize, canvasSize);
  cropCtx.fillStyle = '#0c0f18';
  cropCtx.fillRect(0, 0, canvasSize, canvasSize);

  const imgRatio = sourceImage.width / sourceImage.height;
  let drawWidth = canvasSize;
  let drawHeight = canvasSize;

  if (imgRatio > 1) {
    drawHeight = canvasSize / imgRatio;
  } else {
    drawWidth = canvasSize * imgRatio;
  }

  drawWidth *= zoom;
  drawHeight *= zoom;

  const x = (canvasSize - drawWidth) / 2 + offsetX;
  const y = (canvasSize - drawHeight) / 2 + offsetY;

  cropCtx.drawImage(sourceImage, x, y, drawWidth, drawHeight);

  cropCtx.strokeStyle = 'rgba(255,255,255,.82)';
  cropCtx.lineWidth = 2;
  cropCtx.strokeRect(1, 1, canvasSize - 2, canvasSize - 2);
}

function applyCropToFace() {
  if (!currentFace || !sourceImage) return;
  const dataUrl = cropCanvas.toDataURL('image/png');
  faceImageMap.set(currentFace, dataUrl);
  setPendingChanges(true);
  cropDialog.close();
}

function pickRandomDefaults() {
  const pool = [...DEFAULT_IMAGE_POOL];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, FACE_COUNT);
}

function clearRollTimers() {
  if (rollingTimer) clearTimeout(rollingTimer);
  if (revealTimer) clearTimeout(revealTimer);
  if (netRollTimer) clearInterval(netRollTimer);
  rollingTimer = null;
  revealTimer = null;
  netRollTimer = null;
}

function setNetActiveFace(face) {
  diceNet.querySelectorAll('.netFace').forEach((el) => {
    el.classList.remove('rollingPick', 'finalPick');
  });
  const target = diceNet.querySelector(`[data-face="${face}"]`);
  if (target) target.classList.add('finalPick');
}

function runNetRollingPreview(finalFace) {
  let currentFace = randomInt(1, FACE_COUNT);
  const pickRandomFace = () => {
    currentFace = randomInt(1, FACE_COUNT);
    diceNet.querySelectorAll('.netFace').forEach((el) => {
      el.classList.remove('rollingPick', 'finalPick');
    });
    const current = diceNet.querySelector(`[data-face="${currentFace}"]`);
    if (current) current.classList.add('rollingPick');
  };

  pickRandomFace();
  netRollTimer = setInterval(pickRandomFace, 120);

  rollingTimer = setTimeout(() => {
    finishRoll(finalFace);
  }, randomInt(1200, 10000));
}

function resetFaces() {
  clearRollTimers();
  isRolling = false;
  cube.classList.remove('rolling');
  rollBtn.disabled = false;
  stopRollBtn.disabled = true;
  diceNet.querySelectorAll('.netFace').forEach((el) => el.classList.remove('rollingPick', 'finalPick'));

  const defaults = pickRandomDefaults();
  faceImageMap.clear();
  for (let face = 1; face <= FACE_COUNT; face += 1) {
    const defaultPath = defaults[face - 1];
    faceImageMap.set(face, defaultPath);
  }

  applyAllFaces();
  rollResult.textContent = '当前结果：未投掷';
  spinX = previewRotation.x;
  spinY = previewRotation.y;
  cube.style.transform = `rotateX(${spinX}deg) rotateY(${spinY}deg)`;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}


function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function rotateAroundX(vec, deg) {
  const r = degToRad(deg);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return {
    x: vec.x,
    y: vec.y * cos - vec.z * sin,
    z: vec.y * sin + vec.z * cos,
  };
}

function rotateAroundY(vec, deg) {
  const r = degToRad(deg);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return {
    x: vec.x * cos + vec.z * sin,
    y: vec.y,
    z: -vec.x * sin + vec.z * cos,
  };
}

function getTopFaceByRotation(rotX, rotY) {
  const normals = {
    1: { x: 0, y: 0, z: 1 },
    2: { x: 0, y: -1, z: 0 },
    3: { x: 1, y: 0, z: 0 },
    4: { x: -1, y: 0, z: 0 },
    5: { x: 0, y: 1, z: 0 },
    6: { x: 0, y: 0, z: -1 },
  };

  let topFace = 1;
  let minY = Infinity;

  for (let face = 1; face <= FACE_COUNT; face += 1) {
    let v = normals[face];
    v = rotateAroundY(v, rotY);
    v = rotateAroundX(v, rotX);
    if (v.y < minY) {
      minY = v.y;
      topFace = face;
    }
  }

  return topFace;
}

function finishRoll(forcedFace = null) {
  clearRollTimers();
  cube.classList.remove('rolling');
  cube.style.transform = `rotateX(${spinX}deg) rotateY(${spinY}deg)`;
  const topFace = forcedFace || getTopFaceByRotation(spinX, spinY);
  setNetActiveFace(topFace);
  rollResult.textContent = `当前结果：第 ${topFace} 面（以上方面为准）`;
  isRolling = false;
  rollBtn.disabled = false;
  stopRollBtn.disabled = true;
}

function rollDice() {
  if (isRolling) return;

  if (hasPendingChanges) {
    applyAllFaces();
  }

  isRolling = true;
  rollBtn.disabled = true;
  stopRollBtn.disabled = false;
  cube.classList.add('rolling');
  rollResult.textContent = '当前结果：骰子正在旋转...';

  const face = randomInt(1, 6);
  const focusRot = topFocusRotationByFace[face];
  const extraTurnsX = randomInt(4, 8) * 360;
  const extraTurnsY = randomInt(4, 8) * 360;

  spinX = extraTurnsX + focusRot.x;
  spinY = extraTurnsY + focusRot.y;

  const finalFace = getTopFaceByRotation(spinX, spinY);
  runNetRollingPreview(finalFace);
}

[zoomInput, offsetXInput, offsetYInput].forEach((control) => {
  control.addEventListener('input', renderCropPreview);
});

textOpacityInput.addEventListener('input', () => {
  updateLabelOpacity();
  setPendingChanges(true);
});

applyCropBtn.addEventListener('click', applyCropToFace);
cancelCropBtn.addEventListener('click', () => cropDialog.close());
rollBtn.addEventListener('click', rollDice);
resetBtn.addEventListener('click', resetFaces);
updateDiceBtn.addEventListener('click', applyAllFaces);
stopRollBtn.addEventListener('click', () => {
  if (!isRolling) return;
  finishRoll();
});

createTextEditors();
createNetFaces();
resetFaces();
