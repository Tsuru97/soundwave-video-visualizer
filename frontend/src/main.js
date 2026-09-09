// Soundwave Video Visualizer - Client-Side Engine & Visual Designer
import { decodeAudioFile, extractWaveformSignature } from './audioProcessor.js';
import { renderFrame } from './videoRenderer.js';
import { generateVideo, isWebCodecsSupported, isFileSystemAccessSupported } from './exportEngine.js';

console.log('[Soundwave] Inicializando Soundwave Engine con Diseñador Visual...');

// Estado global de la aplicación
const state = {
  audioFile: null,
  audioBuffer: null,
  waveformSignature: null,
  isRendering: false,
  abortController: null,
  audioContext: null,
  animationFrameId: null,

  // Estado del Diseñador Visual
  designer: {
    background: {
      image: null,
      blur: 10,
      dim: 0.45
    },
    overlay: {
      image: null,
      relX: 0.5,
      relY: 0.35,
      relSize: 0.28,
      shape: 'rounded', // 'rounded' | 'circle'
      opacity: 1.0,
      shadow: true
    },
    isDraggingOverlay: false,
    dragOffset: { x: 0, y: 0 }
  }
};

// Elementos del DOM
const elements = {
  // Diagnóstico
  isolationStatus: document.getElementById('isolation-status'),
  badgeCoop: document.getElementById('badge-coop'),
  badgeCoep: document.getElementById('badge-coep'),
  badgeSab: document.getElementById('badge-sab'),
  badgeWebcodecs: document.getElementById('badge-webcodecs'),

  // Visualizador y controles
  canvas: document.getElementById('visualizer-canvas'),
  canvasContainer: document.getElementById('canvas-container'),
  canvasOverlay: document.getElementById('canvas-overlay'),
  canvasDragHint: document.getElementById('canvas-drag-hint'),
  audioElement: document.getElementById('audio-element'),
  audioUpload: document.getElementById('audio-upload'),
  btnPlayPause: document.getElementById('btn-play-pause'),
  playIcon: document.getElementById('play-icon'),
  fileInfo: document.getElementById('file-info'),
  signatureStatusBar: document.getElementById('signature-status-bar'),
  signatureStatusText: document.getElementById('signature-status-text'),

  // Pestañas
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabContents: document.querySelectorAll('.tab-content'),

  // Diseñador: Fondo
  bgUpload: document.getElementById('bg-upload'),
  btnRemoveBg: document.getElementById('btn-remove-bg'),
  bgBlur: document.getElementById('bg-blur'),
  valBgBlur: document.getElementById('val-bg-blur'),
  bgDim: document.getElementById('bg-dim'),
  valBgDim: document.getElementById('val-bg-dim'),

  // Diseñador: Portada / Logo
  overlayUpload: document.getElementById('overlay-upload'),
  btnRemoveOverlay: document.getElementById('btn-remove-overlay'),
  overlayShape: document.getElementById('overlay-shape'),
  overlaySize: document.getElementById('overlay-size'),
  valOverlaySize: document.getElementById('val-overlay-size'),
  overlayOpacity: document.getElementById('overlay-opacity'),
  valOverlayOpacity: document.getElementById('val-overlay-opacity'),

  // Onda Sonora y Textos
  visualizerTypeSelect: document.getElementById('visualizer-type'),
  colorAccentInput: document.getElementById('color-accent'),
  colorSecondaryInput: document.getElementById('color-secondary'),
  videoTitleInput: document.getElementById('video-title'),
  videoSubtitleInput: document.getElementById('video-subtitle'),

  // Exportación
  exportEngineSelect: document.getElementById('export-engine-select'),
  resolutionSelect: document.getElementById('resolution-select'),
  fpsSelect: document.getElementById('fps-select'),
  formatSelect: document.getElementById('format-select'),
  checkDirectDisk: document.getElementById('check-direct-disk'),
  groupDirectDisk: document.getElementById('group-direct-disk'),
  btnRender: document.getElementById('btn-render'),
  exportHelpText: document.getElementById('export-help-text'),

  // Modal de progreso
  progressModal: document.getElementById('progress-modal'),
  modalTitle: document.getElementById('modal-title'),
  modalEngineBadge: document.getElementById('modal-engine-badge'),
  progressFill: document.getElementById('progress-fill'),
  progressPercent: document.getElementById('progress-percent'),
  progressFramesLabel: document.getElementById('progress-frames-label'),
  statFps: document.getElementById('stat-fps'),
  statRam: document.getElementById('stat-ram'),
  statElapsed: document.getElementById('stat-elapsed'),
  statEta: document.getElementById('stat-eta'),
  resultArea: document.getElementById('result-area'),
  resultMessage: document.getElementById('result-message'),
  videoPreviewPlayer: document.getElementById('video-preview-player'),
  btnCancelRender: document.getElementById('btn-cancel-render'),
  btnDownloadVideo: document.getElementById('btn-download-video'),
  btnCloseModal: document.getElementById('btn-close-modal')
};

const ctx = elements.canvas.getContext('2d');

// =========================================================================
// 1. GESTIÓN DE PESTAÑAS DEL PANEL LATERAL
// =========================================================================
elements.tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    elements.tabBtns.forEach(b => b.classList.remove('active'));
    elements.tabContents.forEach(c => c.classList.remove('active'));

    btn.classList.add('active');
    const targetTabId = btn.getAttribute('data-tab');
    document.getElementById(targetTabId)?.classList.add('active');
  });
});

// =========================================================================
// 2. DIAGNÓSTICO DE CAPACIDADES
// =========================================================================
function checkCapabilities() {
  const isIsolated = window.crossOriginIsolated;
  const hasSab = typeof SharedArrayBuffer !== 'undefined';
  const hasWebCodecs = isWebCodecsSupported();
  const hasFSA = isFileSystemAccessSupported();

  if (elements.badgeSab) {
    elements.badgeSab.textContent = hasSab ? 'SharedArrayBuffer: Activo' : 'SharedArrayBuffer: Inactivo';
    if (hasSab) elements.badgeSab.classList.add('active');
  }

  if (elements.badgeWebcodecs) {
    elements.badgeWebcodecs.textContent = hasWebCodecs ? 'WebCodecs: Habilitado (Acelerado)' : 'WebCodecs: No soportado';
    if (hasWebCodecs) elements.badgeWebcodecs.classList.add('active');
  }

  if (isIsolated) {
    elements.isolationStatus.className = 'status-badge isolated';
    elements.isolationStatus.innerHTML = '<span class="status-dot"></span><span class="status-label">Aislamiento Activo (COOP/COEP OK)</span>';
    if (elements.badgeCoop) elements.badgeCoop.classList.add('active');
    if (elements.badgeCoep) elements.badgeCoep.classList.add('active');
  } else {
    elements.isolationStatus.className = 'status-badge not-isolated';
    elements.isolationStatus.innerHTML = '<span class="status-dot"></span><span class="status-label">Sin Aislamiento (Verificar Cabeceras)</span>';
  }

  if (!hasWebCodecs) {
    elements.exportEngineSelect.value = 'mediarecorder';
    elements.exportEngineSelect.querySelector('option[value="webcodecs"]').disabled = true;
    elements.groupDirectDisk.classList.add('hidden');
    elements.exportHelpText.textContent = 'WebCodecs no soportado. Se usará MediaRecorder con control de trozos.';
  } else if (!hasFSA) {
    elements.groupDirectDisk.classList.add('hidden');
  }
}

// =========================================================================
// 3. AUDIOCONTEXT
// =========================================================================
function getOrCreateAudioContext() {
  if (!state.audioContext || state.audioContext.state === 'closed') {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioCtx();
  }
  return state.audioContext;
}

// =========================================================================
// 4. FUNCIONES DE DIBUJO Y DISEÑADOR
// =========================================================================
function getRenderOptions(isSelected = false) {
  return {
    style: elements.visualizerTypeSelect.value,
    accentColor: elements.colorAccentInput.value,
    secondaryColor: elements.colorSecondaryInput.value,
    title: elements.videoTitleInput.value || '',
    subtitle: elements.videoSubtitleInput.value || (state.audioFile?.name || ''),
    background: {
      image: state.designer.background.image,
      blur: state.designer.background.blur,
      dim: state.designer.background.dim
    },
    overlay: state.designer.overlay.image ? {
      image: state.designer.overlay.image,
      relX: state.designer.overlay.relX,
      relY: state.designer.overlay.relY,
      relSize: state.designer.overlay.relSize,
      shape: state.designer.overlay.shape,
      opacity: state.designer.overlay.opacity,
      shadow: state.designer.overlay.shadow
    } : null,
    isSelectedOverlay: isSelected
  };
}

function drawCurrentFrame(frameData, isSelected = false) {
  renderFrame(ctx, elements.canvas.width, elements.canvas.height, frameData, getRenderOptions(isSelected));
}

function redrawPreview() {
  if (state.waveformSignature) {
    const currentTime = elements.audioElement?.currentTime || 0;
    const fps = state.waveformSignature.fps || 30;
    const frameIndex = Math.floor(currentTime * fps);
    const frame = state.waveformSignature.getFrame(frameIndex);
    drawCurrentFrame(frame, !!state.designer.overlay.image);
  } else {
    // Dibujar lienzo en reposo
    drawCurrentFrame(null, !!state.designer.overlay.image);
  }
}

// =========================================================================
// 5. CARGA DE ARCHIVO DE AUDIO
// =========================================================================
elements.audioUpload.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  state.audioFile = file;
  elements.fileInfo.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
  elements.audioElement.src = URL.createObjectURL(file);

  if (!elements.videoTitleInput.value) {
    elements.videoTitleInput.value = file.name.replace(/\.[^/.]+$/, "");
  }

  elements.signatureStatusBar.classList.remove('hidden', 'ready');
  elements.signatureStatusText.textContent = 'Extrayendo firma de onda con Web Audio API (optimizado bajo consumo de RAM)...';

  try {
    const audioCtx = getOrCreateAudioContext();
    const t0 = performance.now();

    state.audioBuffer = await decodeAudioFile(file, audioCtx);

    const fps = parseInt(elements.fpsSelect.value, 10) || 30;
    state.waveformSignature = extractWaveformSignature(state.audioBuffer, fps, 64);

    const elapsedSec = ((performance.now() - t0) / 1000).toFixed(2);
    const durationFormatted = formatSeconds(state.audioBuffer.duration);

    elements.signatureStatusBar.classList.add('ready');
    elements.signatureStatusText.innerHTML = `✅ <strong>Firma extraída en ${elapsedSec}s</strong> (${state.waveformSignature.totalFrames} fotogramas para ${durationFormatted} de audio - Buffer: ${(state.waveformSignature.flatBuffer.byteLength / (1024 * 1024)).toFixed(1)} MB).`;

    elements.btnPlayPause.disabled = false;
    elements.btnRender.disabled = false;
    elements.canvasOverlay.classList.add('hidden');

    redrawPreview();

  } catch (err) {
    console.error('[AudioProcessor] Error:', err);
    elements.signatureStatusBar.classList.remove('ready');
    elements.signatureStatusText.textContent = `❌ Error al decodificar audio: ${err.message}`;
  }
});

// =========================================================================
// 6. GESTIÓN DEL FONDO (DISEÑADOR)
// =========================================================================
elements.bgUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      state.designer.background.image = img;
      elements.btnRemoveBg.classList.remove('hidden');
      redrawPreview();
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

elements.btnRemoveBg.addEventListener('click', () => {
  state.designer.background.image = null;
  elements.bgUpload.value = '';
  elements.btnRemoveBg.classList.add('hidden');
  redrawPreview();
});

elements.bgBlur.addEventListener('input', (e) => {
  state.designer.background.blur = parseInt(e.target.value, 10);
  elements.valBgBlur.textContent = `${e.target.value}px`;
  redrawPreview();
});

elements.bgDim.addEventListener('input', (e) => {
  state.designer.background.dim = parseInt(e.target.value, 10) / 100;
  elements.valBgDim.textContent = `${e.target.value}%`;
  redrawPreview();
});

// =========================================================================
// 7. GESTIÓN DE PORTADA / LOGO (DISEÑADOR)
// =========================================================================
elements.overlayUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      state.designer.overlay.image = img;
      elements.btnRemoveOverlay.classList.remove('hidden');
      elements.canvasDragHint.classList.remove('hidden');
      setTimeout(() => elements.canvasDragHint.classList.add('hidden'), 4000);
      redrawPreview();
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

elements.btnRemoveOverlay.addEventListener('click', () => {
  state.designer.overlay.image = null;
  elements.overlayUpload.value = '';
  elements.btnRemoveOverlay.classList.add('hidden');
  elements.canvasDragHint.classList.add('hidden');
  redrawPreview();
});

elements.overlayShape.addEventListener('change', (e) => {
  state.designer.overlay.shape = e.target.value;
  redrawPreview();
});

elements.overlaySize.addEventListener('input', (e) => {
  state.designer.overlay.relSize = parseInt(e.target.value, 10) / 100;
  elements.valOverlaySize.textContent = `${e.target.value}%`;
  redrawPreview();
});

elements.overlayOpacity.addEventListener('input', (e) => {
  state.designer.overlay.opacity = parseInt(e.target.value, 10) / 100;
  elements.valOverlayOpacity.textContent = `${e.target.value}%`;
  redrawPreview();
});

// Reactividad de colores y textos
[elements.visualizerTypeSelect, elements.colorAccentInput, elements.colorSecondaryInput, elements.videoTitleInput, elements.videoSubtitleInput].forEach(input => {
  input.addEventListener('input', () => {
    redrawPreview();
  });
});

// =========================================================================
// 8. INTERACCIÓN DIRECTA EN CANVAS (DRAG & DROP DE PORTADA)
// =========================================================================
function getCanvasCoordinates(e) {
  const rect = elements.canvas.getBoundingClientRect();
  const scaleX = elements.canvas.width / rect.width;
  const scaleY = elements.canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

function isPointOverOverlay(coords) {
  if (!state.designer.overlay.image) return false;
  const w = elements.canvas.width;
  const h = elements.canvas.height;
  const size = Math.min(w, h) * state.designer.overlay.relSize;
  const ox = w * state.designer.overlay.relX - size / 2;
  const oy = h * state.designer.overlay.relY - size / 2;
  return (
    coords.x >= ox &&
    coords.x <= ox + size &&
    coords.y >= oy &&
    coords.y <= oy + size
  );
}

elements.canvas.addEventListener('mousedown', (e) => {
  if (!state.designer.overlay.image) return;
  const coords = getCanvasCoordinates(e);

  if (isPointOverOverlay(coords)) {
    state.designer.isDraggingOverlay = true;
    const w = elements.canvas.width;
    const h = elements.canvas.height;
    state.designer.dragOffset = {
      x: coords.x - (w * state.designer.overlay.relX),
      y: coords.y - (h * state.designer.overlay.relY)
    };
    elements.canvas.classList.add('grabbing');
    elements.canvas.classList.remove('grab');
    redrawPreview();
  }
});

window.addEventListener('mousemove', (e) => {
  const coords = getCanvasCoordinates(e);

  if (state.designer.isDraggingOverlay) {
    const w = elements.canvas.width;
    const h = elements.canvas.height;
    const newX = (coords.x - state.designer.dragOffset.x) / w;
    const newY = (coords.y - state.designer.dragOffset.y) / h;

    // Limitar dentro del lienzo con márgenes de seguridad
    state.designer.overlay.relX = Math.max(0.05, Math.min(0.95, newX));
    state.designer.overlay.relY = Math.max(0.05, Math.min(0.95, newY));

    redrawPreview();
  } else if (state.designer.overlay.image) {
    if (isPointOverOverlay(coords)) {
      elements.canvas.classList.add('grab');
    } else {
      elements.canvas.classList.remove('grab');
    }
  }
});

window.addEventListener('mouseup', () => {
  if (state.designer.isDraggingOverlay) {
    state.designer.isDraggingOverlay = false;
    elements.canvas.classList.remove('grabbing');
    redrawPreview();
  }
});

// =========================================================================
// 9. PREVISUALIZACIÓN DE AUDIO
// =========================================================================
elements.btnPlayPause.addEventListener('click', async () => {
  const audio = elements.audioElement;
  if (!audio.src) return;

  const audioCtx = getOrCreateAudioContext();
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  if (audio.paused) {
    audio.play();
    elements.playIcon.textContent = '⏸ Pausar Vista Previa';
    startRealtimePreviewLoop();
  } else {
    audio.pause();
    elements.playIcon.textContent = '▶ Reproducir Vista Previa';
  }
});

elements.audioElement.addEventListener('ended', () => {
  elements.playIcon.textContent = '▶ Reproducir Vista Previa';
});

function startRealtimePreviewLoop() {
  if (state.animationFrameId) cancelAnimationFrame(state.animationFrameId);

  function loop() {
    if (!elements.audioElement.paused && state.waveformSignature) {
      const currentTime = elements.audioElement.currentTime;
      const fps = state.waveformSignature.fps;
      const frameIndex = Math.min(
        state.waveformSignature.totalFrames - 1,
        Math.floor(currentTime * fps)
      );

      const frameData = state.waveformSignature.getFrame(frameIndex);
      drawCurrentFrame(frameData, !!state.designer.overlay.image && !elements.audioElement.paused ? false : true);

      state.animationFrameId = requestAnimationFrame(loop);
    }
  }

  loop();
}

// =========================================================================
// 10. MOTOR DE GENERACIÓN DE VIDEO
// =========================================================================
elements.btnRender.addEventListener('click', async () => {
  if (!state.audioBuffer || !state.waveformSignature) {
    alert('Primero debes cargar un archivo de audio.');
    return;
  }

  if (!elements.audioElement.paused) {
    elements.audioElement.pause();
    elements.playIcon.textContent = '▶ Reproducir Vista Previa';
  }

  const [width, height] = elements.resolutionSelect.value.split('x').map(Number);
  const fps = parseInt(elements.fpsSelect.value, 10) || 30;
  const mode = elements.exportEngineSelect.value;
  const format = elements.formatSelect.value;
  const useDirectDisk = elements.checkDirectDisk && elements.checkDirectDisk.checked && isFileSystemAccessSupported();

  let exportSignature = state.waveformSignature;
  if (exportSignature.fps !== fps) {
    exportSignature = extractWaveformSignature(state.audioBuffer, fps, 64);
  }

  let fileWritableStream = null;
  if (useDirectDisk && mode === 'webcodecs') {
    try {
      const suggestedName = `soundwave-${(state.audioFile?.name || 'video').replace(/\.[^/.]+$/, "")}-${Date.now()}.${format}`;
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{
          description: format === 'mp4' ? 'Video MP4 (*.mp4)' : 'Video WebM (*.webm)',
          accept: { [format === 'mp4' ? 'video/mp4' : 'video/webm']: [`.${format}`] }
        }]
      });
      fileWritableStream = await handle.createWritable();
    } catch (pickerErr) {
      if (pickerErr.name === 'AbortError') {
        console.info('[ExportEngine] Selección cancelada por el usuario.');
        return;
      }
      console.warn('[ExportEngine] Usando memoria:', pickerErr);
    }
  }

  // Abrir Modal de Progreso
  elements.progressModal.classList.remove('hidden');
  elements.modalTitle.textContent = fileWritableStream 
    ? 'Generando Video (Streaming Directo a Disco)...' 
    : 'Generando Video (Contrapresión Regulada)...';
  elements.modalEngineBadge.textContent = mode === 'webcodecs' 
    ? (fileWritableStream ? 'WebCodecs (0% RAM - Disco)' : 'WebCodecs Acelerado') 
    : 'MediaRecorder';

  elements.progressFill.style.width = '0%';
  elements.progressPercent.textContent = '0%';
  elements.progressFramesLabel.textContent = `0 / ${exportSignature.totalFrames} fotogramas`;
  elements.statFps.textContent = '0 fps';
  elements.statRam.textContent = 'Iniciando...';
  elements.statElapsed.textContent = '00:00';
  elements.statEta.textContent = 'Calculando...';

  elements.resultArea.classList.add('hidden');
  elements.btnCancelRender.classList.remove('hidden');
  elements.btnDownloadVideo.classList.add('hidden');
  elements.btnCloseModal.classList.add('hidden');

  state.isRendering = true;
  state.abortController = new AbortController();

  try {
    const result = await generateVideo({
      mode,
      audioBuffer: state.audioBuffer,
      waveformSignature: exportSignature,
      format,
      width,
      height,
      fps,
      bitrate: 5_000_000,
      styleOptions: getRenderOptions(false), // Sin guías de selección en el video exportado
      fileWritableStream,
      signal: state.abortController.signal,
      onProgress: (stats) => {
        if (stats.percent !== undefined) {
          elements.progressFill.style.width = `${stats.percent}%`;
          elements.progressPercent.textContent = `${stats.percent}%`;
        }
        if (stats.currentFrame !== undefined) {
          elements.progressFramesLabel.textContent = `${stats.currentFrame} / ${stats.totalFrames} fotogramas`;
        }
        if (stats.fpsRate !== undefined) {
          const speedMultiplier = (stats.fpsRate / fps).toFixed(1);
          elements.statFps.textContent = `${stats.fpsRate} fps (${speedMultiplier}x)`;
        }
        if (stats.usedRamMB !== null && stats.usedRamMB !== undefined) {
          elements.statRam.textContent = `${stats.usedRamMB} MB`;
        }
        if (stats.elapsedSec !== undefined) {
          elements.statElapsed.textContent = formatSeconds(stats.elapsedSec);
        }
        if (stats.etaSec !== undefined) {
          elements.statEta.textContent = stats.etaSec > 0 ? formatSeconds(stats.etaSec) : 'Finalizando...';
        }
      }
    });

    if (fileWritableStream) {
      await fileWritableStream.close();
    }

    elements.modalTitle.textContent = '¡Video Generado Exitosamente!';
    elements.progressFill.style.width = '100%';
    elements.progressPercent.textContent = '100%';
    elements.statEta.textContent = '00:00';

    if (result.directToDisk) {
      elements.resultMessage.textContent = '🎉 ¡El video se ha guardado directamente en tu disco sin agotar la memoria RAM!';
      elements.resultArea.classList.remove('hidden');
      elements.videoPreviewPlayer.classList.add('hidden');
    } else if (result.blob) {
      elements.resultMessage.textContent = '🎉 ¡Video generado con éxito!';
      const videoUrl = URL.createObjectURL(result.blob);
      elements.videoPreviewPlayer.src = videoUrl;
      elements.videoPreviewPlayer.classList.remove('hidden');
      elements.resultArea.classList.remove('hidden');

      elements.btnDownloadVideo.href = videoUrl;
      elements.btnDownloadVideo.download = result.filename;
      elements.btnDownloadVideo.classList.remove('hidden');

      const downloadLink = document.createElement('a');
      downloadLink.href = videoUrl;
      downloadLink.download = result.filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }

    elements.btnCancelRender.classList.add('hidden');
    elements.btnCloseModal.classList.remove('hidden');

  } catch (err) {
    if (fileWritableStream) {
      try { await fileWritableStream.abort(); } catch (_) {}
    }

    if (err.message?.includes('Cancelado')) {
      elements.modalTitle.textContent = 'Generación Cancelada';
      elements.statEta.textContent = 'Cancelado';
    } else {
      console.error('[ExportEngine] Error fatal:', err);
      elements.modalTitle.textContent = 'Error en Generación de Video';
      alert(`Ocurrió un problema: ${err.message}`);
    }
    elements.btnCancelRender.classList.add('hidden');
    elements.btnCloseModal.classList.remove('hidden');
  } finally {
    state.isRendering = false;
    state.abortController = null;
  }
});

elements.btnCancelRender.addEventListener('click', () => {
  if (state.abortController) state.abortController.abort();
});

elements.btnCloseModal.addEventListener('click', () => {
  elements.progressModal.classList.add('hidden');
  if (elements.videoPreviewPlayer.src) elements.videoPreviewPlayer.pause();
});

function formatSeconds(sec) {
  const totalSeconds = Math.max(0, Math.floor(sec));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

document.addEventListener('DOMContentLoaded', () => {
  checkCapabilities();
});
