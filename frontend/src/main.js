// Soundwave Video Visualizer - Client-Side Engine & Multi-Layer / Multi-Track Studio
import { decodeAudioFile, extractWaveformSignature, concatenateAudioTracks, audioBufferToWavBlob } from './audioProcessor.js';
import { renderFrame } from './videoRenderer.js';
import { generateVideo, isWebCodecsSupported, isFileSystemAccessSupported } from './exportEngine.js';

console.log('[Soundwave] Inicializando Estudio Multi-Pista y Multi-Capa...');

// Estado global de la aplicación
const state = {
  // Pistas de Audio Secuenciales
  tracks: {
    intro: null, // { file, buffer, name }
    main: null,  // { file, buffer, name, isMain: true }
    outro: null  // { file, buffer, name }
  },
  audioBuffer: null,        // AudioBuffer unificado (Intro + Principal + Outro)
  waveformSignature: null,  // Firma de onda continua unificada
  audioBlobUrl: null,       // URL del Blob WAV para previsualización
  isRendering: false,
  abortController: null,
  audioContext: null,
  animationFrameId: null,

  // Estado del Diseñador Visual Multi-Capa
  designer: {
    background: {
      image: null,
      blur: 10,
      dim: 0.45
    },
    layers: [],              // Array de capas (imágenes y textos)
    selectedLayerId: null,   // ID de la capa activa
    isDraggingLayer: false,  // Indicador de arrastre en curso
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

  // Widget de Línea de Tiempo
  timelineSummaryCard: document.getElementById('timeline-summary-card'),
  timelineTotalBadge: document.getElementById('timeline-total-badge'),
  timelineSegments: document.getElementById('timeline-segments'),

  // Pistas Adicionales (Intro y Outro)
  introUpload: document.getElementById('intro-upload'),
  introFileInfo: document.getElementById('intro-file-info'),
  btnRemoveIntro: document.getElementById('btn-remove-intro'),
  outroUpload: document.getElementById('outro-upload'),
  outroFileInfo: document.getElementById('outro-file-info'),
  btnRemoveOutro: document.getElementById('btn-remove-outro'),

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

  // Diseñador: Gestión de Capas
  layersCountBadge: document.getElementById('layers-count-badge'),
  layerImgUpload: document.getElementById('layer-img-upload'),
  btnAddText: document.getElementById('btn-add-text'),
  layersList: document.getElementById('layers-list'),
  emptyLayersMsg: document.getElementById('empty-layers-msg'),

  // Inspector de Capa
  layerInspector: document.getElementById('layer-inspector'),
  inspectorTitle: document.getElementById('inspector-title'),
  btnDeleteSelectedLayer: document.getElementById('btn-delete-selected-layer'),
  inspectorImageFields: document.getElementById('inspector-image-fields'),
  inspectorTextFields: document.getElementById('inspector-text-fields'),

  // Propiedades de Imagen
  layerImgShape: document.getElementById('layer-img-shape'),
  layerImgSize: document.getElementById('layer-img-size'),
  valLayerImgSize: document.getElementById('val-layer-img-size'),
  layerImgOpacity: document.getElementById('layer-img-opacity'),
  valLayerImgOpacity: document.getElementById('val-layer-img-opacity'),

  // Propiedades de Texto
  layerTextContent: document.getElementById('layer-text-content'),
  layerTextColor: document.getElementById('layer-text-color'),
  layerTextFont: document.getElementById('layer-text-font'),
  layerTextSize: document.getElementById('layer-text-size'),
  valLayerTextSize: document.getElementById('val-layer-text-size'),
  layerTextOpacity: document.getElementById('layer-text-opacity'),
  valLayerTextOpacity: document.getElementById('val-layer-text-opacity'),

  // Onda Sonora
  visualizerTypeSelect: document.getElementById('visualizer-type'),
  colorAccentInput: document.getElementById('color-accent'),
  colorSecondaryInput: document.getElementById('color-secondary'),

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
// 1. PESTAÑAS DEL PANEL LATERAL
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
// 4. FUNCIONES DE RENDERIZADO
// =========================================================================
function getRenderOptions(isExporting = false) {
  return {
    style: elements.visualizerTypeSelect.value,
    accentColor: elements.colorAccentInput.value,
    secondaryColor: elements.colorSecondaryInput.value,
    background: {
      image: state.designer.background.image,
      blur: state.designer.background.blur,
      dim: state.designer.background.dim
    },
    layers: state.designer.layers,
    selectedLayerId: state.designer.selectedLayerId,
    isExporting
  };
}

function drawCurrentFrame(frameData, isExporting = false) {
  renderFrame(ctx, elements.canvas.width, elements.canvas.height, frameData, getRenderOptions(isExporting));
}

function redrawPreview() {
  if (state.waveformSignature) {
    const currentTime = elements.audioElement?.currentTime || 0;
    const fps = state.waveformSignature.fps || 30;
    const frameIndex = Math.floor(currentTime * fps);
    const frame = state.waveformSignature.getFrame(frameIndex);
    drawCurrentFrame(frame, false);
  } else {
    drawCurrentFrame(null, false);
  }
}

// =========================================================================
// 5. MOTOR DE CONCATENACIÓN DE AUDIOS (INTRO + PRINCIPAL + OUTRO)
// =========================================================================
async function rebuildCombinedAudioSequence() {
  const audioCtx = getOrCreateAudioContext();
  const trackList = [];

  if (state.tracks.intro && state.tracks.intro.buffer) {
    trackList.push({ name: 'Intro', buffer: state.tracks.intro.buffer, type: 'intro' });
  }
  if (state.tracks.main && state.tracks.main.buffer) {
    trackList.push({ name: 'Principal', buffer: state.tracks.main.buffer, isMain: true, type: 'main' });
  }
  if (state.tracks.outro && state.tracks.outro.buffer) {
    trackList.push({ name: 'Outro', buffer: state.tracks.outro.buffer, type: 'outro' });
  }

  if (trackList.length === 0) {
    state.audioBuffer = null;
    state.waveformSignature = null;
    elements.timelineSummaryCard.classList.add('hidden');
    elements.btnPlayPause.disabled = true;
    elements.btnRender.disabled = true;
    elements.canvasOverlay.classList.remove('hidden');
    redrawPreview();
    return;
  }

  elements.signatureStatusBar.classList.remove('hidden', 'ready');
  elements.signatureStatusText.textContent = 'Ensamblando y remuestreando secuencia de audio (Intro + Principal + Outro)...';

  try {
    const t0 = performance.now();
    const { combinedBuffer, segments } = await concatenateAudioTracks(trackList, audioCtx);
    state.audioBuffer = combinedBuffer;

    const fps = parseInt(elements.fpsSelect.value, 10) || 30;
    state.waveformSignature = extractWaveformSignature(combinedBuffer, fps, 64);

    // Convertir a WAV Blob para alimentar el reproductor HTML5 con la secuencia completa
    if (state.audioBlobUrl) {
      URL.revokeObjectURL(state.audioBlobUrl);
    }
    const wavBlob = audioBufferToWavBlob(combinedBuffer);
    state.audioBlobUrl = URL.createObjectURL(wavBlob);
    elements.audioElement.src = state.audioBlobUrl;

    const elapsedSec = ((performance.now() - t0) / 1000).toFixed(2);
    const totalDurationStr = formatSeconds(combinedBuffer.duration);

    // Actualizar Widget de Línea de Tiempo
    elements.timelineSummaryCard.classList.remove('hidden');
    elements.timelineTotalBadge.textContent = `Total: ${totalDurationStr}`;
    elements.timelineSegments.innerHTML = '';

    segments.forEach((seg, idx) => {
      const chip = document.createElement('span');
      chip.className = `timeline-chip ${trackList[idx].type || 'main'}`;
      chip.innerHTML = `<strong>${seg.name}</strong> (${formatSeconds(seg.duration)})`;
      elements.timelineSegments.appendChild(chip);

      if (idx < segments.length - 1) {
        const arrow = document.createElement('span');
        arrow.className = 'timeline-arrow';
        arrow.textContent = '➔';
        elements.timelineSegments.appendChild(arrow);
      }
    });

    elements.signatureStatusBar.classList.add('ready');
    elements.signatureStatusText.innerHTML = `✅ <strong>Secuencia ensamblada en ${elapsedSec}s</strong> (${state.waveformSignature.totalFrames} fotogramas para ${totalDurationStr} de duración total).`;

    elements.btnPlayPause.disabled = false;
    elements.btnRender.disabled = false;
    elements.canvasOverlay.classList.add('hidden');

    redrawPreview();

  } catch (err) {
    console.error('[AudioProcessor] Error al ensamblar secuencia:', err);
    elements.signatureStatusBar.classList.remove('ready');
    elements.signatureStatusText.textContent = `❌ Error al concatenar pistas de audio: ${err.message}`;
  }
}

// 5.1 Carga de Pista Principal
elements.audioUpload.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const audioCtx = getOrCreateAudioContext();
  elements.fileInfo.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;

  try {
    const buffer = await decodeAudioFile(file, audioCtx);
    state.tracks.main = {
      file,
      buffer,
      name: file.name.replace(/\.[^/.]+$/, "").substring(0, 16),
      isMain: true
    };

    // Crear capa de texto automática si no hay ninguna
    const textLayers = state.designer.layers.filter(l => l.type === 'text');
    if (textLayers.length === 0) {
      state.designer.layers.push({
        id: `layer_txt_title`,
        type: 'text',
        name: 'Título Principal',
        text: file.name.replace(/\.[^/.]+$/, ""),
        relX: 0.5,
        relY: 0.88,
        fontSizeRel: 0.044,
        color: '#ffffff',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        fontWeight: '700',
        opacity: 1.0,
        shadow: true
      });
      updateLayersUI();
    }

    await rebuildCombinedAudioSequence();

  } catch (err) {
    alert(`Error al decodificar la pista principal: ${err.message}`);
  }
});

// 5.2 Carga de Audio de Entrada (Intro)
elements.introUpload.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const audioCtx = getOrCreateAudioContext();
  elements.introFileInfo.textContent = `Cargando ${file.name}...`;

  try {
    const buffer = await decodeAudioFile(file, audioCtx);
    state.tracks.intro = {
      file,
      buffer,
      name: 'Intro'
    };

    elements.introFileInfo.innerHTML = `🟢 <strong>${file.name}</strong> (${formatSeconds(buffer.duration)})`;
    elements.btnRemoveIntro.classList.remove('hidden');
    await rebuildCombinedAudioSequence();

  } catch (err) {
    alert(`Error al procesar el audio de Intro: ${err.message}`);
    elements.introFileInfo.textContent = 'Error al cargar';
  }
});

elements.btnRemoveIntro.addEventListener('click', async () => {
  state.tracks.intro = null;
  elements.introUpload.value = '';
  elements.introFileInfo.textContent = 'Sin audio de intro seleccionado';
  elements.btnRemoveIntro.classList.add('hidden');
  await rebuildCombinedAudioSequence();
});

// 5.3 Carga de Audio de Salida (Outro)
elements.outroUpload.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const audioCtx = getOrCreateAudioContext();
  elements.outroFileInfo.textContent = `Cargando ${file.name}...`;

  try {
    const buffer = await decodeAudioFile(file, audioCtx);
    state.tracks.outro = {
      file,
      buffer,
      name: 'Outro'
    };

    elements.outroFileInfo.innerHTML = `🟣 <strong>${file.name}</strong> (${formatSeconds(buffer.duration)})`;
    elements.btnRemoveOutro.classList.remove('hidden');
    await rebuildCombinedAudioSequence();

  } catch (err) {
    alert(`Error al procesar el audio de Outro: ${err.message}`);
    elements.outroFileInfo.textContent = 'Error al cargar';
  }
});

elements.btnRemoveOutro.addEventListener('click', async () => {
  state.tracks.outro = null;
  elements.outroUpload.value = '';
  elements.outroFileInfo.textContent = 'Sin audio de outro seleccionado';
  elements.btnRemoveOutro.classList.add('hidden');
  await rebuildCombinedAudioSequence();
});

// =========================================================================
// 6. GESTIÓN DEL SISTEMA MULTI-CAPA (IMÁGENES Y TEXTOS)
// =========================================================================
function getSelectedLayer() {
  return state.designer.layers.find(l => l.id === state.designer.selectedLayerId) || null;
}

function selectLayer(layerId) {
  state.designer.selectedLayerId = layerId;
  updateLayersUI();
  redrawPreview();
}

function updateLayersUI() {
  const layers = state.designer.layers;
  const count = layers.length;

  elements.layersCountBadge.textContent = `${count} ${count === 1 ? 'capa' : 'capas'}`;

  if (count === 0) {
    elements.emptyLayersMsg.classList.remove('hidden');
    elements.layerInspector.classList.add('hidden');
    elements.canvasDragHint.classList.add('hidden');
    return;
  }

  elements.emptyLayersMsg.classList.add('hidden');

  elements.layersList.innerHTML = '';
  layers.forEach((layer) => {
    const item = document.createElement('div');
    item.className = `layer-item ${layer.id === state.designer.selectedLayerId ? 'active' : ''}`;

    const icon = layer.type === 'image' ? '🖼️' : '🔤';
    const label = layer.type === 'text' ? `"${layer.text}"` : (layer.name || 'Imagen');

    item.innerHTML = `
      <div class="layer-item-info">
        <span class="layer-type-icon">${icon}</span>
        <span class="layer-name" title="${label}">${label}</span>
      </div>
      <button class="btn-delete-layer" title="Eliminar capa" data-id="${layer.id}">✕</button>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-delete-layer')) return;
      selectLayer(layer.id);
    });

    item.querySelector('.btn-delete-layer').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteLayer(layer.id);
    });

    elements.layersList.appendChild(item);
  });

  const activeLayer = getSelectedLayer();
  if (activeLayer) {
    elements.layerInspector.classList.remove('hidden');

    if (activeLayer.type === 'image') {
      elements.inspectorTitle.textContent = `🖼️ Imagen: ${activeLayer.name}`;
      elements.inspectorImageFields.classList.remove('hidden');
      elements.inspectorTextFields.classList.add('hidden');

      elements.layerImgShape.value = activeLayer.shape || 'rounded';
      elements.layerImgSize.value = Math.round((activeLayer.relSize || 0.28) * 100);
      elements.valLayerImgSize.textContent = `${elements.layerImgSize.value}%`;
      elements.layerImgOpacity.value = Math.round((activeLayer.opacity !== undefined ? activeLayer.opacity : 1.0) * 100);
      elements.valLayerImgOpacity.textContent = `${elements.layerImgOpacity.value}%`;

    } else if (activeLayer.type === 'text') {
      elements.inspectorTitle.textContent = '🔤 Capa de Texto';
      elements.inspectorImageFields.classList.add('hidden');
      elements.inspectorTextFields.classList.remove('hidden');

      elements.layerTextContent.value = activeLayer.text || '';
      elements.layerTextColor.value = activeLayer.color || '#ffffff';
      elements.layerTextFont.value = activeLayer.fontFamily || "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      elements.layerTextSize.value = Math.round((activeLayer.fontSizeRel || 0.042) * 1000);
      elements.valLayerTextSize.textContent = `${(elements.layerTextSize.value / 10).toFixed(1)}%`;
      elements.layerTextOpacity.value = Math.round((activeLayer.opacity !== undefined ? activeLayer.opacity : 1.0) * 100);
      elements.valLayerTextOpacity.textContent = `${elements.layerTextOpacity.value}%`;
    }
  } else {
    elements.layerInspector.classList.add('hidden');
  }
}

function deleteLayer(layerId) {
  state.designer.layers = state.designer.layers.filter(l => l.id !== layerId);
  if (state.designer.selectedLayerId === layerId) {
    state.designer.selectedLayerId = state.designer.layers.length > 0 ? state.designer.layers[state.designer.layers.length - 1].id : null;
  }
  updateLayersUI();
  redrawPreview();
}

elements.btnDeleteSelectedLayer.addEventListener('click', () => {
  if (state.designer.selectedLayerId) {
    deleteLayer(state.designer.selectedLayerId);
  }
});

// AÑADIR CAPA DE IMAGEN
elements.layerImgUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const isFirst = state.designer.layers.filter(l => l.type === 'image').length === 0;
      const newLayer = {
        id: `layer_img_${Date.now()}`,
        type: 'image',
        name: file.name.replace(/\.[^/.]+$/, "").substring(0, 18),
        image: img,
        relX: isFirst ? 0.5 : 0.2 + (Math.random() * 0.6),
        relY: isFirst ? 0.35 : 0.2 + (Math.random() * 0.3),
        relSize: 0.28,
        shape: 'rounded',
        opacity: 1.0,
        shadow: true
      };
      state.designer.layers.push(newLayer);
      selectLayer(newLayer.id);

      elements.canvasDragHint.classList.remove('hidden');
      setTimeout(() => elements.canvasDragHint.classList.add('hidden'), 4000);
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
  elements.layerImgUpload.value = '';
});

// AÑADIR CAPA DE TEXTO
elements.btnAddText.addEventListener('click', () => {
  const textCount = state.designer.layers.filter(l => l.type === 'text').length;
  const defaultText = textCount === 0 && state.tracks.main 
    ? state.tracks.main.file.name.replace(/\.[^/.]+$/, "") 
    : (textCount === 0 ? 'Mi Canción Oficial' : `@artista_${textCount}`);

  const newLayer = {
    id: `layer_txt_${Date.now()}`,
    type: 'text',
    name: `Texto ${textCount + 1}`,
    text: defaultText,
    relX: 0.5,
    relY: textCount === 0 ? 0.88 : 0.94,
    fontSizeRel: textCount === 0 ? 0.044 : 0.028,
    color: textCount === 0 ? '#ffffff' : '#06b6d4',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontWeight: textCount === 0 ? '700' : '500',
    opacity: 1.0,
    shadow: true
  };

  state.designer.layers.push(newLayer);
  selectLayer(newLayer.id);

  elements.canvasDragHint.classList.remove('hidden');
  setTimeout(() => elements.canvasDragHint.classList.add('hidden'), 4000);
});

// Modificaciones de Capa de Imagen
elements.layerImgShape.addEventListener('change', (e) => {
  const layer = getSelectedLayer();
  if (layer && layer.type === 'image') {
    layer.shape = e.target.value;
    redrawPreview();
  }
});

elements.layerImgSize.addEventListener('input', (e) => {
  const layer = getSelectedLayer();
  if (layer && layer.type === 'image') {
    layer.relSize = parseInt(e.target.value, 10) / 100;
    elements.valLayerImgSize.textContent = `${e.target.value}%`;
    redrawPreview();
  }
});

elements.layerImgOpacity.addEventListener('input', (e) => {
  const layer = getSelectedLayer();
  if (layer && layer.type === 'image') {
    layer.opacity = parseInt(e.target.value, 10) / 100;
    elements.valLayerImgOpacity.textContent = `${e.target.value}%`;
    redrawPreview();
  }
});

// Modificaciones de Capa de Texto
elements.layerTextContent.addEventListener('input', (e) => {
  const layer = getSelectedLayer();
  if (layer && layer.type === 'text') {
    layer.text = e.target.value;
    updateLayersUI();
    redrawPreview();
  }
});

elements.layerTextColor.addEventListener('input', (e) => {
  const layer = getSelectedLayer();
  if (layer && layer.type === 'text') {
    layer.color = e.target.value;
    redrawPreview();
  }
});

elements.layerTextFont.addEventListener('change', (e) => {
  const layer = getSelectedLayer();
  if (layer && layer.type === 'text') {
    layer.fontFamily = e.target.value;
    redrawPreview();
  }
});

elements.layerTextSize.addEventListener('input', (e) => {
  const layer = getSelectedLayer();
  if (layer && layer.type === 'text') {
    layer.fontSizeRel = parseInt(e.target.value, 10) / 1000;
    elements.valLayerTextSize.textContent = `${(parseInt(e.target.value, 10) / 10).toFixed(1)}%`;
    redrawPreview();
  }
});

elements.layerTextOpacity.addEventListener('input', (e) => {
  const layer = getSelectedLayer();
  if (layer && layer.type === 'text') {
    layer.opacity = parseInt(e.target.value, 10) / 100;
    elements.valLayerTextOpacity.textContent = `${e.target.value}%`;
    redrawPreview();
  }
});

// =========================================================================
// 7. GESTIÓN DEL FONDO
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

// Estilos de onda sonora
[elements.visualizerTypeSelect, elements.colorAccentInput, elements.colorSecondaryInput].forEach(input => {
  input.addEventListener('input', () => {
    redrawPreview();
  });
});

// =========================================================================
// 8. INTERACCIÓN DIRECTA EN CANVAS (DRAG & DROP)
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

function hitTestLayer(coords, layer) {
  const w = elements.canvas.width;
  const h = elements.canvas.height;

  if (layer.type === 'image') {
    const size = Math.min(w, h) * (layer.relSize || 0.28);
    const ox = w * (layer.relX ?? 0.5) - size / 2;
    const oy = h * (layer.relY ?? 0.35) - size / 2;
    return coords.x >= ox && coords.x <= ox + size && coords.y >= oy && coords.y <= oy + size;
  } else if (layer.type === 'text') {
    const fontSize = Math.max(12, Math.floor(h * (layer.fontSizeRel || 0.042)));
    ctx.font = `${layer.fontWeight || '700'} ${fontSize}px ${layer.fontFamily || 'sans-serif'}`;
    const metrics = ctx.measureText(layer.text);
    const textW = metrics.width;
    const textH = fontSize * 1.3;
    const posX = w * (layer.relX ?? 0.5);
    const posY = h * (layer.relY ?? 0.88);
    const boxX = posX - textW / 2 - 12;
    const boxY = posY - textH / 2 - 8;
    return coords.x >= boxX && coords.x <= boxX + textW + 24 && coords.y >= boxY && coords.y <= boxY + textH + 16;
  }
  return false;
}

function findLayerAtCoordinates(coords) {
  for (let i = state.designer.layers.length - 1; i >= 0; i--) {
    if (hitTestLayer(coords, state.designer.layers[i])) {
      return state.designer.layers[i];
    }
  }
  return null;
}

elements.canvas.addEventListener('mousedown', (e) => {
  const coords = getCanvasCoordinates(e);
  const clickedLayer = findLayerAtCoordinates(coords);

  if (clickedLayer) {
    selectLayer(clickedLayer.id);
    state.designer.isDraggingLayer = true;

    const w = elements.canvas.width;
    const h = elements.canvas.height;
    state.designer.dragOffset = {
      x: coords.x - (w * (clickedLayer.relX ?? 0.5)),
      y: coords.y - (h * (clickedLayer.relY ?? 0.5))
    };

    elements.canvas.classList.add('grabbing');
    elements.canvas.classList.remove('grab');
  } else {
    if (state.designer.selectedLayerId) {
      state.designer.selectedLayerId = null;
      updateLayersUI();
      redrawPreview();
    }
  }
});

window.addEventListener('mousemove', (e) => {
  const coords = getCanvasCoordinates(e);

  if (state.designer.isDraggingLayer) {
    const activeLayer = getSelectedLayer();
    if (!activeLayer) return;

    const w = elements.canvas.width;
    const h = elements.canvas.height;
    const newX = (coords.x - state.designer.dragOffset.x) / w;
    const newY = (coords.y - state.designer.dragOffset.y) / h;

    activeLayer.relX = Math.max(0.04, Math.min(0.96, newX));
    activeLayer.relY = Math.max(0.04, Math.min(0.96, newY));

    redrawPreview();
  } else {
    const hoveredLayer = findLayerAtCoordinates(coords);
    if (hoveredLayer) {
      elements.canvas.classList.add('grab');
    } else {
      elements.canvas.classList.remove('grab');
    }
  }
});

window.addEventListener('mouseup', () => {
  if (state.designer.isDraggingLayer) {
    state.designer.isDraggingLayer = false;
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
    elements.playIcon.textContent = '⏸ Pausar Secuencia';
    startRealtimePreviewLoop();
  } else {
    audio.pause();
    elements.playIcon.textContent = '▶ Reproducir Secuencia Completa';
  }
});

elements.audioElement.addEventListener('ended', () => {
  elements.playIcon.textContent = '▶ Reproducir Secuencia Completa';
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
      drawCurrentFrame(frameData, false);

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
    alert('Primero debes cargar la pista de audio principal.');
    return;
  }

  if (!elements.audioElement.paused) {
    elements.audioElement.pause();
    elements.playIcon.textContent = '▶ Reproducir Secuencia Completa';
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
      const suggestedName = `soundwave-video-${Date.now()}.${format}`;
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
        console.info('[ExportEngine] Guardado cancelado.');
        return;
      }
      console.warn('[ExportEngine] Usando buffer:', pickerErr);
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
      styleOptions: getRenderOptions(true), // isExporting: true
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
      elements.resultMessage.textContent = '🎉 ¡El video con Intro/Canción/Outro se ha guardado en tu disco sin agotar la memoria RAM!';
      elements.resultArea.classList.remove('hidden');
      elements.videoPreviewPlayer.classList.add('hidden');
    } else if (result.blob) {
      elements.resultMessage.textContent = '🎉 ¡Video con secuencia de audio completa generado con éxito!';
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
  updateLayersUI();
});
