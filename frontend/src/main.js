// Soundwave Video Visualizer - Client-Side Engine Orchestrator
import { decodeAudioFile, extractWaveformSignature } from './audioProcessor.js';
import { renderFrame } from './videoRenderer.js';
import { generateVideo, isWebCodecsSupported, isFileSystemAccessSupported } from './exportEngine.js';

console.log('[Soundwave] Inicializando Soundwave Engine con Contrapresión...');

// Estado global de la aplicación
const state = {
  audioFile: null,
  audioBuffer: null,
  waveformSignature: null,
  isRendering: false,
  abortController: null,
  audioContext: null,
  animationFrameId: null
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
  canvasOverlay: document.getElementById('canvas-overlay'),
  audioElement: document.getElementById('audio-element'),
  audioUpload: document.getElementById('audio-upload'),
  btnPlayPause: document.getElementById('btn-play-pause'),
  playIcon: document.getElementById('play-icon'),
  fileInfo: document.getElementById('file-info'),
  signatureStatusBar: document.getElementById('signature-status-bar'),
  signatureStatusText: document.getElementById('signature-status-text'),

  // Configuración de exportación
  exportEngineSelect: document.getElementById('export-engine-select'),
  visualizerTypeSelect: document.getElementById('visualizer-type'),
  colorAccentInput: document.getElementById('color-accent'),
  colorSecondaryInput: document.getElementById('color-secondary'),
  resolutionSelect: document.getElementById('resolution-select'),
  fpsSelect: document.getElementById('fps-select'),
  formatSelect: document.getElementById('format-select'),
  checkDirectDisk: document.getElementById('check-direct-disk'),
  groupDirectDisk: document.getElementById('group-direct-disk'),
  videoTitleInput: document.getElementById('video-title'),
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

// 1. Diagnóstico de Capacidades y Soporte de File System API
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

// 2. AudioContext único
function getOrCreateAudioContext() {
  if (!state.audioContext || state.audioContext.state === 'closed') {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioCtx();
  }
  return state.audioContext;
}

// 3. Carga y Procesamiento de Audio
elements.audioUpload.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  state.audioFile = file;
  elements.fileInfo.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
  elements.audioElement.src = URL.createObjectURL(file);

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
    elements.signatureStatusText.innerHTML = `✅ <strong>Firma de onda extraída en ${elapsedSec}s</strong> (${state.waveformSignature.totalFrames} fotogramas para ${durationFormatted} de audio - Buffer plano: ${(state.waveformSignature.flatBuffer.byteLength / (1024 * 1024)).toFixed(1)} MB).`;

    elements.btnPlayPause.disabled = false;
    elements.btnRender.disabled = false;
    elements.canvasOverlay.classList.add('hidden');

    // Dibujar fotograma de muestra
    const sampleFrame = state.waveformSignature.getFrame(Math.floor(state.waveformSignature.totalFrames * 0.15));
    drawCurrentFrame(sampleFrame);

  } catch (err) {
    console.error('[AudioProcessor] Error:', err);
    elements.signatureStatusBar.classList.remove('ready');
    elements.signatureStatusText.textContent = `❌ Error al decodificar audio: ${err.message}`;
  }
});

function drawCurrentFrame(frameData) {
  renderFrame(ctx, elements.canvas.width, elements.canvas.height, frameData, {
    style: elements.visualizerTypeSelect.value,
    accentColor: elements.colorAccentInput.value,
    secondaryColor: elements.colorSecondaryInput.value,
    title: elements.videoTitleInput.value || ''
  });
}

// Actualizar vista previa al cambiar estilos
[elements.visualizerTypeSelect, elements.colorAccentInput, elements.colorSecondaryInput, elements.videoTitleInput].forEach(input => {
  input.addEventListener('input', () => {
    if (state.waveformSignature && (!elements.audioElement || elements.audioElement.paused)) {
      const currentFrameIndex = Math.floor((elements.audioElement.currentTime || 0) * (state.waveformSignature.fps || 30));
      const frame = state.waveformSignature.getFrame(currentFrameIndex);
      drawCurrentFrame(frame);
    }
  });
});

// 4. Previsualización de Audio
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
      drawCurrentFrame(frameData);

      state.animationFrameId = requestAnimationFrame(loop);
    }
  }

  loop();
}

// 5. Motor de Generación de Video con Contrapresión
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

  // Re-extraer firma si los FPS de exportación cambiaron
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
        console.info('[ExportEngine] Guardado en disco cancelado por el usuario.');
        return; // El usuario canceló la selección de archivo
      }
      console.warn('[ExportEngine] Fallo al crear stream en disco, usando memoria:', pickerErr);
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
      styleOptions: {
        style: elements.visualizerTypeSelect.value,
        accentColor: elements.colorAccentInput.value,
        secondaryColor: elements.colorSecondaryInput.value,
        title: elements.videoTitleInput.value || '',
        subtitle: state.audioFile?.name || ''
      },
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

    // Cerrar stream a disco si fue usado
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

      // Disparar descarga automática
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
