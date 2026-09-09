// Soundwave Video Visualizer - Client-Side Engine Orchestrator
import { decodeAudioFile, extractWaveformSignature } from './audioProcessor.js';
import { renderFrame } from './videoRenderer.js';
import { generateVideo, isWebCodecsSupported } from './exportEngine.js';

console.log('[Soundwave] Inicializando Soundwave Engine...');

// Estado global de la aplicación
const state = {
  audioFile: null,
  audioBuffer: null,
  waveformSignature: null,
  isRendering: false,
  abortController: null,
  audioContext: null,
  analyser: null,
  sourceNode: null,
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
  statElapsed: document.getElementById('stat-elapsed'),
  statEta: document.getElementById('stat-eta'),
  statChunks: document.getElementById('stat-chunks'),
  resultArea: document.getElementById('result-area'),
  videoPreviewPlayer: document.getElementById('video-preview-player'),
  btnCancelRender: document.getElementById('btn-cancel-render'),
  btnDownloadVideo: document.getElementById('btn-download-video'),
  btnCloseModal: document.getElementById('btn-close-modal')
};

const ctx = elements.canvas.getContext('2d');

// 1. Diagnóstico de Seguridad y Capacidades del Navegador
function checkCapabilities() {
  const isIsolated = window.crossOriginIsolated;
  const hasSab = typeof SharedArrayBuffer !== 'undefined';
  const hasWebCodecs = isWebCodecsSupported();

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
    console.info('[Security] ✅ Cross-Origin Isolation verificado.');
  } else {
    elements.isolationStatus.className = 'status-badge not-isolated';
    elements.isolationStatus.innerHTML = '<span class="status-dot"></span><span class="status-label">Sin Aislamiento (Verificar Cabeceras)</span>';
  }

  // Ajustar ayuda del motor según capacidades
  if (!hasWebCodecs) {
    elements.exportEngineSelect.value = 'mediarecorder';
    elements.exportEngineSelect.querySelector('option[value="webcodecs"]').disabled = true;
    elements.exportHelpText.textContent = 'WebCodecs no está disponible en este navegador. Se usará MediaRecorder.';
  }
}

// 2. Inicialización de AudioContext nativo
function getOrCreateAudioContext() {
  if (!state.audioContext || state.audioContext.state === 'closed') {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioCtx();
  }
  return state.audioContext;
}

// 3. Carga y Procesamiento de Audio (Firma de Onda)
elements.audioUpload.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  state.audioFile = file;
  elements.fileInfo.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
  elements.audioElement.src = URL.createObjectURL(file);

  // Mostrar indicador de extracción
  elements.signatureStatusBar.classList.remove('hidden', 'ready');
  elements.signatureStatusText.textContent = 'Extrayendo firma de onda con Web Audio API (análisis de energía)...';

  try {
    const audioCtx = getOrCreateAudioContext();
    const t0 = performance.now();

    // Decodificación nativa
    state.audioBuffer = await decodeAudioFile(file, audioCtx);

    // Extracción de firma de onda a los FPS seleccionados
    const fps = parseInt(elements.fpsSelect.value, 10) || 30;
    state.waveformSignature = extractWaveformSignature(state.audioBuffer, fps, 64);

    const elapsedSec = ((performance.now() - t0) / 1000).toFixed(2);
    const durationFormatted = formatSeconds(state.audioBuffer.duration);

    elements.signatureStatusBar.classList.add('ready');
    elements.signatureStatusText.innerHTML = `✅ <strong>Firma de onda extraída en ${elapsedSec}s</strong> (${state.waveformSignature.totalFrames} fotogramas generados para ${durationFormatted} de audio).`;

    // Habilitar botones de acción
    elements.btnPlayPause.disabled = false;
    elements.btnRender.disabled = false;
    elements.canvasOverlay.classList.add('hidden');

    // Dibujar fotograma de muestra en el canvas
    const sampleFrame = state.waveformSignature.frames[Math.floor(state.waveformSignature.totalFrames * 0.15)] || state.waveformSignature.frames[0];
    drawCurrentFrame(sampleFrame);

  } catch (err) {
    console.error('[AudioProcessor] Error procesando archivo:', err);
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

// Actualizar vista previa cuando cambien los estilos
[elements.visualizerTypeSelect, elements.colorAccentInput, elements.colorSecondaryInput, elements.videoTitleInput].forEach(input => {
  input.addEventListener('input', () => {
    if (state.waveformSignature && (!state.audioElement || state.audioElement.paused)) {
      const currentFrameIndex = Math.floor((elements.audioElement.currentTime || 0) * (state.waveformSignature.fps || 30));
      const frame = state.waveformSignature.frames[currentFrameIndex] || state.waveformSignature.frames[0];
      drawCurrentFrame(frame);
    }
  });
});

// 4. Previsualización en Tiempo Real
elements.btnPlayPause.addEventListener('click', async () => {
  const audio = elements.audioElement;
  if (!audio.src) return;

  const audioCtx = getOrCreateAudioContext();
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

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

      const frameData = state.waveformSignature.frames[frameIndex];
      drawCurrentFrame(frameData);

      state.animationFrameId = requestAnimationFrame(loop);
    }
  }

  loop();
}

// 5. Motor de Generación de Video (Botón "Generar Video")
elements.btnRender.addEventListener('click', async () => {
  if (!state.audioBuffer || !state.waveformSignature) {
    alert('Primero debes cargar un archivo de audio válido.');
    return;
  }

  // Pausar reproducción en curso
  if (!elements.audioElement.paused) {
    elements.audioElement.pause();
    elements.playIcon.textContent = '▶ Reproducir Vista Previa';
  }

  const [width, height] = elements.resolutionSelect.value.split('x').map(Number);
  const fps = parseInt(elements.fpsSelect.value, 10) || 30;
  const mode = elements.exportEngineSelect.value;
  const format = elements.formatSelect.value;

  // Re-extraer firma si los FPS de exportación difieren
  let exportSignature = state.waveformSignature;
  if (exportSignature.fps !== fps) {
    exportSignature = extractWaveformSignature(state.audioBuffer, fps, 64);
  }

  // Preparar Modal de Progreso
  elements.progressModal.classList.remove('hidden');
  elements.modalTitle.textContent = 'Generando Video Client-Side...';
  elements.modalEngineBadge.textContent = mode === 'webcodecs' ? 'WebCodecs Acelerado' : 'MediaRecorder';
  elements.progressFill.style.width = '0%';
  elements.progressPercent.textContent = '0%';
  elements.progressFramesLabel.textContent = `0 / ${exportSignature.totalFrames} fotogramas`;
  elements.statFps.textContent = '0 fps';
  elements.statElapsed.textContent = '00:00';
  elements.statEta.textContent = 'Calculando...';
  elements.statChunks.textContent = '0 trozos';

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
      bitrate: 6_000_000, // 6 Mbps
      styleOptions: {
        style: elements.visualizerTypeSelect.value,
        accentColor: elements.colorAccentInput.value,
        secondaryColor: elements.colorSecondaryInput.value,
        title: elements.videoTitleInput.value || '',
        subtitle: `${state.audioFile?.name || ''}`
      },
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
        if (stats.elapsedSec !== undefined) {
          elements.statElapsed.textContent = formatSeconds(stats.elapsedSec);
        }
        if (stats.etaSec !== undefined) {
          elements.statEta.textContent = stats.etaSec > 0 ? formatSeconds(stats.etaSec) : 'Finalizando...';
        }
        if (stats.chunksCount !== undefined) {
          elements.statChunks.textContent = `${stats.chunksCount} trozos`;
        }
      }
    });

    // Finalización exitosa
    elements.modalTitle.textContent = '¡Video Generado Exitosamente!';
    elements.progressFill.style.width = '100%';
    elements.progressPercent.textContent = '100%';
    elements.statEta.textContent = '00:00';

    const videoUrl = URL.createObjectURL(result.blob);
    elements.videoPreviewPlayer.src = videoUrl;
    elements.resultArea.classList.remove('hidden');

    elements.btnDownloadVideo.href = videoUrl;
    elements.btnDownloadVideo.download = result.filename;
    elements.btnDownloadVideo.classList.remove('hidden');

    elements.btnCancelRender.classList.add('hidden');
    elements.btnCloseModal.classList.remove('hidden');

    // Descarga automática inmediata
    const downloadLink = document.createElement('a');
    downloadLink.href = videoUrl;
    downloadLink.download = result.filename;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

  } catch (err) {
    if (err.message?.includes('cancelada')) {
      elements.modalTitle.textContent = 'Generación Cancelada';
      elements.statEta.textContent = 'Cancelado';
    } else {
      console.error('[ExportEngine] Error fatal en generación:', err);
      elements.modalTitle.textContent = 'Error en Generación de Video';
      alert(`Ocurrió un problema generando el video: ${err.message}`);
    }
    elements.btnCancelRender.classList.add('hidden');
    elements.btnCloseModal.classList.remove('hidden');
  } finally {
    state.isRendering = false;
    state.abortController = null;
  }
});

// Cancelar generación
elements.btnCancelRender.addEventListener('click', () => {
  if (state.abortController) {
    state.abortController.abort();
  }
});

// Cerrar modal
elements.btnCloseModal.addEventListener('click', () => {
  elements.progressModal.classList.add('hidden');
  if (elements.videoPreviewPlayer.src) {
    elements.videoPreviewPlayer.pause();
  }
});

// Utilidad para formatear segundos en MM:SS
function formatSeconds(sec) {
  const totalSeconds = Math.max(0, Math.floor(sec));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Inicializar diagnóstico al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  checkCapabilities();
});
