// Soundwave Video Visualizer - Client-Side Engine
console.log('[Soundwave] Inicializando Soundwave Generator...');

// 1. Diagnóstico de Seguridad y Aislamiento de Origen Cruzado (COOP / COEP)
function checkCrossOriginIsolation() {
  const isIsolated = window.crossOriginIsolated;
  const statusBadge = document.getElementById('isolation-status');
  const badgeSab = document.getElementById('badge-sab');
  const badgeCoop = document.getElementById('badge-coop');
  const badgeCoep = document.getElementById('badge-coep');

  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';

  if (badgeSab) {
    badgeSab.textContent = hasSharedArrayBuffer 
      ? 'SharedArrayBuffer: Habilitado (Activo)' 
      : 'SharedArrayBuffer: No disponible';
    if (hasSharedArrayBuffer) badgeSab.classList.add('active');
  }

  if (isIsolated) {
    statusBadge.className = 'status-badge isolated';
    statusBadge.innerHTML = '<span class="status-dot"></span><span class="status-label">Aislamiento Activo (COOP/COEP OK)</span>';
    if (badgeCoop) badgeCoop.classList.add('active');
    if (badgeCoep) badgeCoep.classList.add('active');
    console.info('[Security] ✅ Cross-Origin Isolation verificado con éxito: crossOriginIsolated === true');
  } else {
    statusBadge.className = 'status-badge not-isolated';
    statusBadge.innerHTML = '<span class="status-dot"></span><span class="status-label">Sin Aislamiento (Verificar Cabeceras)</span>';
    console.warn('[Security] ⚠️ crossOriginIsolated es false. Verifica que Vite esté sirviendo con COOP: same-origin y COEP: require-corp');
  }
}

// 2. Motor de Visualización de Audio (Web Audio API)
let audioContext = null;
let analyser = null;
let sourceNode = null;
let animationFrameId = null;

const audioElement = document.getElementById('audio-element');
const audioUpload = document.getElementById('audio-upload');
const btnPlayPause = document.getElementById('btn-play-pause');
const playIcon = document.getElementById('play-icon');
const fileInfo = document.getElementById('file-info');
const canvas = document.getElementById('visualizer-canvas');
const ctx = canvas.getContext('2d');
const canvasOverlay = document.getElementById('canvas-overlay');
const colorAccentInput = document.getElementById('color-accent');
const visualizerTypeSelect = document.getElementById('visualizer-type');
const btnRender = document.getElementById('btn-render');

function initAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    sourceNode = audioContext.createMediaElementSource(audioElement);
    sourceNode.connect(analyser);
    analyser.connect(audioContext.destination);
  }
}

audioUpload.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;

  fileInfo.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
  const fileUrl = URL.createObjectURL(file);
  audioElement.src = fileUrl;

  btnPlayPause.disabled = false;
  btnRender.disabled = false;
  canvasOverlay.classList.add('hidden');
  initAudioContext();
});

btnPlayPause.addEventListener('click', async () => {
  if (!audioElement.src) return;

  if (audioContext && audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  if (audioElement.paused) {
    audioElement.play();
    playIcon.textContent = '⏸ Pausar';
    startVisualizerLoop();
  } else {
    audioElement.pause();
    playIcon.textContent = '▶ Reproducir';
  }
});

audioElement.addEventListener('ended', () => {
  playIcon.textContent = '▶ Reproducir';
});

function startVisualizerLoop() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function draw() {
    animationFrameId = requestAnimationFrame(draw);

    const width = canvas.width;
    const height = canvas.height;
    const style = visualizerTypeSelect.value;
    const accentColor = colorAccentInput.value;

    // Fondo del canvas
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    if (style === 'bars') {
      analyser.getByteFrequencyData(dataArray);
      const barWidth = (width / bufferLength) * 2;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * (height / 2);

        // Barra superior e inferior simétrica
        const gradient = ctx.createLinearGradient(0, height / 2 - barHeight, 0, height / 2 + barHeight);
        gradient.addColorStop(0, accentColor);
        gradient.addColorStop(1, '#06b6d4');

        ctx.fillStyle = gradient;
        ctx.fillRect(x, height / 2 - barHeight, barWidth - 1, barHeight * 2);

        x += barWidth;
      }
    } else if (style === 'wave') {
      analyser.getByteTimeDomainData(dataArray);
      ctx.lineWidth = 4;
      ctx.strokeStyle = accentColor;
      ctx.beginPath();

      const sliceWidth = width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(width, height / 2);
      ctx.stroke();
    } else if (style === 'circular') {
      analyser.getByteFrequencyData(dataArray);
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = 120;

      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 3;
      ctx.beginPath();

      for (let i = 0; i < bufferLength; i++) {
        const rad = (Math.PI * 2 / bufferLength) * i;
        const barHeight = (dataArray[i] / 255) * 150;
        const x1 = centerX + Math.cos(rad) * radius;
        const y1 = centerY + Math.sin(rad) * radius;
        const x2 = centerX + Math.cos(rad) * (radius + barHeight);
        const y2 = centerY + Math.sin(rad) * (radius + barHeight);

        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();
    }
  }

  draw();
}

// 3. Ejecutar diagnóstico de inicio
document.addEventListener('DOMContentLoaded', () => {
  checkCrossOriginIsolation();
});
