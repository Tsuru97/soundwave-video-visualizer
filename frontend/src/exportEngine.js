/**
 * Motor de Exportación de Video Client-Side para Soundwave Generator
 * Soporta dos estrategias:
 * 1. WebCodecs (Acelerado Ultra-Rápido sin tiempo real, H.264/MP4 y VP9/WebM)
 * 2. MediaRecorder (Grabación en Caliente con canvas.captureStream y chunks)
 */

import * as Mp4Muxer from 'mp4-muxer';
import * as WebmMuxer from 'webm-muxer';
import { renderFrame } from './videoRenderer.js';

/**
 * Verifica si el navegador soporta WebCodecs VideoEncoder
 */
export function isWebCodecsSupported() {
  return typeof window !== 'undefined' && typeof window.VideoEncoder === 'function';
}

/**
 * Orquestador principal de exportación
 * @param {Object} config
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export async function generateVideo(config) {
  const {
    mode = 'webcodecs', // 'webcodecs' | 'mediarecorder'
    audioBuffer,
    waveformSignature,
    format = 'mp4',     // 'mp4' | 'webm'
    width = 1280,
    height = 720,
    fps = 30,
    bitrate = 5000000,  // 5 Mbps
    styleOptions = {},
    signal,             // AbortSignal
    onProgress          // Callback ({ percent, currentFrame, totalFrames, fpsRate, elapsedSec, etaSec, chunksCount })
  } = config;

  if (mode === 'webcodecs' && isWebCodecsSupported()) {
    try {
      return await exportWithWebCodecs({
        audioBuffer,
        waveformSignature,
        format,
        width,
        height,
        fps,
        bitrate,
        styleOptions,
        signal,
        onProgress
      });
    } catch (err) {
      console.warn('[ExportEngine] WebCodecs falló o fue interrumpido, evaluando fallback:', err);
      if (signal?.aborted) throw err;
      console.info('[ExportEngine] Ejecutando fallback a MediaRecorder...');
      return await exportWithMediaRecorder({
        audioBuffer,
        waveformSignature,
        width,
        height,
        fps,
        bitrate,
        styleOptions,
        signal,
        onProgress
      });
    }
  } else {
    return await exportWithMediaRecorder({
      audioBuffer,
      waveformSignature,
      width,
      height,
      fps,
      bitrate,
      styleOptions,
      signal,
      onProgress
    });
  }
}

/**
 * Estrategia 1: Exportación Acelerada con WebCodecs y Muxer
 */
async function exportWithWebCodecs(params) {
  const {
    audioBuffer,
    waveformSignature,
    format = 'mp4',
    width,
    height,
    fps,
    bitrate,
    styleOptions,
    signal,
    onProgress
  } = params;

  const totalFrames = waveformSignature.totalFrames;
  const startTime = performance.now();

  // Canvas dedicado para renderizado fuera de pantalla
  const renderCanvas = document.createElement('canvas');
  renderCanvas.width = width;
  renderCanvas.height = height;
  const ctx = renderCanvas.getContext('2d', { alpha: false });

  // 1. Configurar Muxer
  let muxer;
  let videoCodecString;
  let audioCodecString;

  const hasAudio = !!audioBuffer;
  const sampleRate = audioBuffer ? audioBuffer.sampleRate : 44100;
  const numberOfChannels = audioBuffer ? audioBuffer.numberOfChannels : 2;

  if (format === 'mp4') {
    videoCodecString = 'avc1.42001f'; // H.264
    audioCodecString = 'mp4a.40.2';   // AAC-LC
    muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width,
        height
      },
      audio: hasAudio ? {
        codec: 'aac',
        numberOfChannels,
        sampleRate
      } : undefined,
      fastStart: 'in-memory'
    });
  } else {
    videoCodecString = 'vp09.00.10.08'; // VP9
    audioCodecString = 'opus';          // Opus
    muxer = new WebmMuxer.Muxer({
      target: new WebmMuxer.ArrayBufferTarget(),
      video: {
        codec: 'V_VP9',
        width,
        height
      },
      audio: hasAudio ? {
        codec: 'A_OPUS',
        numberOfChannels,
        sampleRate
      } : undefined
    });
  }

  // 2. Configurar VideoEncoder
  let encodedChunksCount = 0;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      encodedChunksCount++;
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e) => {
      console.error('[WebCodecs] Error en VideoEncoder:', e);
    }
  });

  videoEncoder.configure({
    codec: videoCodecString,
    width,
    height,
    bitrate,
    framerate: fps
  });

  // 3. Configurar AudioEncoder si hay audio
  let audioEncoder = null;
  let canEncodeAudio = false;

  if (hasAudio && typeof window.AudioEncoder === 'function') {
    try {
      const audioSupport = await AudioEncoder.isConfigSupported({
        codec: audioCodecString,
        sampleRate,
        numberOfChannels
      });

      if (audioSupport.supported) {
        audioEncoder = new AudioEncoder({
          output: (chunk, meta) => {
            muxer.addAudioChunk(chunk, meta);
          },
          error: (e) => console.error('[WebCodecs] Error en AudioEncoder:', e)
        });

        audioEncoder.configure({
          codec: audioCodecString,
          sampleRate,
          numberOfChannels,
          bitrate: 128000
        });
        canEncodeAudio = true;
      }
    } catch (e) {
      console.warn('[WebCodecs] AudioEncoder no soportó el códec, continuando solo con video:', e);
    }
  }

  // 4. Codificar Audio en trozos (chunks de audio)
  if (canEncodeAudio && audioEncoder) {
    const channelData = [];
    for (let c = 0; c < numberOfChannels; c++) {
      channelData.push(audioBuffer.getChannelData(c));
    }

    const audioChunkSize = 2048;
    const totalAudioLength = audioBuffer.length;
    let audioOffset = 0;

    while (audioOffset < totalAudioLength) {
      if (signal?.aborted) throw new Error('Generación cancelada por el usuario');

      const framesToProcess = Math.min(audioChunkSize, totalAudioLength - audioOffset);
      const audioTimestampMicros = Math.floor((audioOffset / sampleRate) * 1_000_000);

      // Copiar datos planares
      const planarBuffer = new Float32Array(framesToProcess * numberOfChannels);
      for (let c = 0; c < numberOfChannels; c++) {
        planarBuffer.set(channelData[c].subarray(audioOffset, audioOffset + framesToProcess), c * framesToProcess);
      }

      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate,
        numberOfChannels,
        numberOfFrames: framesToProcess,
        timestamp: audioTimestampMicros,
        data: planarBuffer
      });

      audioEncoder.encode(audioData);
      audioData.close();
      audioOffset += framesToProcess;
    }

    await audioEncoder.flush();
    audioEncoder.close();
  }

  // 5. Bucle de Renderizado Acelerado de Video por Fotogramas
  for (let f = 0; f < totalFrames; f++) {
    if (signal?.aborted) {
      videoEncoder.close();
      throw new Error('Generación cancelada por el usuario');
    }

    // Dibujar fotograma actual
    renderFrame(ctx, width, height, waveformSignature.frames[f], styleOptions);

    const frameTimestampMicros = Math.floor((f * 1_000_000) / fps);
    const frameDurationMicros = Math.floor(1_000_000 / fps);

    const videoFrame = new VideoFrame(renderCanvas, {
      timestamp: frameTimestampMicros,
      duration: frameDurationMicros
    });

    const isKeyFrame = f % (fps * 2) === 0;
    videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
    videoFrame.close();

    // Actualización periódica de progreso y liberación del event loop (cada 10 frames)
    if (f % 10 === 0 || f === totalFrames - 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));

      const now = performance.now();
      const elapsedSec = (now - startTime) / 1000;
      const progressRatio = (f + 1) / totalFrames;
      const currentFpsRate = (f + 1) / elapsedSec;
      const etaSec = currentFpsRate > 0 ? (totalFrames - (f + 1)) / currentFpsRate : 0;

      if (onProgress) {
        onProgress({
          percent: Math.round(progressRatio * 100),
          currentFrame: f + 1,
          totalFrames,
          fpsRate: Math.round(currentFpsRate),
          elapsedSec: Math.round(elapsedSec),
          etaSec: Math.round(etaSec),
          chunksCount: encodedChunksCount
        });
      }
    }
  }

  // Finalizar codificación de video
  await videoEncoder.flush();
  videoEncoder.close();

  // Finalizar contenedor Muxer
  muxer.finalize();
  const buffer = muxer.target.buffer;
  const mimeType = format === 'mp4' ? 'video/mp4' : 'video/webm';
  const blob = new Blob([buffer], { type: mimeType });
  const filename = `soundwave-video-${Date.now()}.${format}`;

  return { blob, filename };
}

/**
 * Estrategia 2: Grabación en Caliente con MediaRecorder y canvas.captureStream
 */
async function exportWithMediaRecorder(params) {
  const {
    audioBuffer,
    waveformSignature,
    width,
    height,
    fps,
    bitrate,
    styleOptions,
    signal,
    onProgress
  } = params;

  const totalFrames = waveformSignature.totalFrames;
  const startTime = performance.now();

  const renderCanvas = document.createElement('canvas');
  renderCanvas.width = width;
  renderCanvas.height = height;
  const ctx = renderCanvas.getContext('2d', { alpha: false });

  // 1. Capturar Stream del Canvas
  const canvasStream = renderCanvas.captureStream(fps);

  // 2. Conectar AudioStream si existe audio disponible
  let audioContext = null;
  let sourceNode = null;
  let mediaStreamDest = null;
  const tracks = [...canvasStream.getVideoTracks()];

  if (audioBuffer) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioCtx();
    mediaStreamDest = audioContext.createMediaStreamDestination();
    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(mediaStreamDest);
    tracks.push(...mediaStreamDest.stream.getAudioTracks());
  }

  const combinedStream = new MediaStream(tracks);

  // Seleccionar códec compatible
  let mimeType = 'video/webm;codecs=vp9,opus';
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm;codecs=vp8,opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm';
    }
  }

  const recordedChunks = [];
  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: bitrate
  });

  // Liberación y recolección de trozos (chunks)
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordedChunks.push(event.data);
      if (onProgress) {
        onProgress({
          chunksCount: recordedChunks.length
        });
      }
    }
  };

  return new Promise(async (resolve, reject) => {
    recorder.onstop = () => {
      combinedStream.getTracks().forEach((t) => t.stop());
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
      }

      const blob = new Blob(recordedChunks, { type: mimeType });
      const filename = `soundwave-video-${Date.now()}.webm`;
      resolve({ blob, filename });
    };

    recorder.onerror = (e) => {
      reject(e.error || new Error('Error en MediaRecorder'));
    };

    // Iniciar con chunks periódicos cada 1000ms
    recorder.start(1000);
    if (sourceNode) {
      sourceNode.start(0);
    }

    const frameIntervalMs = 1000 / fps;

    for (let f = 0; f < totalFrames; f++) {
      if (signal?.aborted) {
        recorder.stop();
        if (sourceNode) sourceNode.stop();
        reject(new Error('Generación cancelada por el usuario'));
        return;
      }

      renderFrame(ctx, width, height, waveformSignature.frames[f], styleOptions);

      const now = performance.now();
      const elapsedSec = (now - startTime) / 1000;
      const progressRatio = (f + 1) / totalFrames;
      const currentFps = (f + 1) / elapsedSec;
      const etaSec = currentFps > 0 ? (totalFrames - (f + 1)) / currentFps : 0;

      if (onProgress && (f % 10 === 0 || f === totalFrames - 1)) {
        onProgress({
          percent: Math.round(progressRatio * 100),
          currentFrame: f + 1,
          totalFrames,
          fpsRate: Math.round(currentFps),
          elapsedSec: Math.round(elapsedSec),
          etaSec: Math.round(etaSec),
          chunksCount: recordedChunks.length
        });
      }

      await new Promise((r) => setTimeout(r, frameIntervalMs));
    }

    if (sourceNode) {
      sourceNode.stop();
    }
    recorder.stop();
  });
}
