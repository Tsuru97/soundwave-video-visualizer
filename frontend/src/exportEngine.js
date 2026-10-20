/**
 * Motor de Exportación de Video Client-Side con Contrapresión Estricta (Backpressure)
 * y Soporte de Streaming a Disco (0% Memoria RAM en Archivo de Salida).
 */

import * as Mp4Muxer from 'mp4-muxer';
import * as WebmMuxer from 'webm-muxer';
import { renderFrame } from './videoRenderer.js';

export function isWebCodecsSupported() {
  return typeof window !== 'undefined' && typeof window.VideoEncoder === 'function';
}

export function isFileSystemAccessSupported() {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
}

/**
 * Orquestador principal de exportación
 */
export async function generateVideo(config) {
  const {
    mode = 'webcodecs',
    audioBuffer,
    waveformSignature,
    format = 'mp4',
    width = 1280,
    height = 720,
    fps = 30,
    bitrate = 5000000,
    styleOptions = {},
    fileWritableStream = null, // WritableStream para streaming directo a disco (opcional)
    signal,
    onProgress
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
        fileWritableStream,
        signal,
        onProgress
      });
    } catch (err) {
      console.warn('[ExportEngine] Fallo en WebCodecs:', err);
      if (signal?.aborted) throw err;
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
 * Estrategia Acelerada con WebCodecs y Contrapresión Estricta (Backpressure)
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
    fileWritableStream,
    signal,
    onProgress
  } = params;

  const totalFrames = waveformSignature.totalFrames;
  const startTime = performance.now();

  const renderCanvas = document.createElement('canvas');
  renderCanvas.width = width;
  renderCanvas.height = height;
  const ctx = renderCanvas.getContext('2d', { alpha: false });

  // 1. Configurar Muxer Target (Directo a Disco o Memoria)
  const isDirectToDisk = !!fileWritableStream;
  let target;
  if (isDirectToDisk) {
    target = format === 'mp4' 
      ? new Mp4Muxer.FileSystemWritableFileStreamTarget(fileWritableStream)
      : new WebmMuxer.FileSystemWritableFileStreamTarget(fileWritableStream);
  } else {
    target = format === 'mp4' 
      ? new Mp4Muxer.ArrayBufferTarget()
      : new WebmMuxer.ArrayBufferTarget();
  }

  const hasAudio = !!audioBuffer;
  const sampleRate = audioBuffer ? audioBuffer.sampleRate : 44100;
  const numberOfChannels = audioBuffer ? audioBuffer.numberOfChannels : 2;

  let muxer;
  let videoCodecString;
  let audioCodecString;

  if (format === 'mp4') {
    videoCodecString = 'avc1.42001f';
    audioCodecString = 'mp4a.40.2';
    muxer = new Mp4Muxer.Muxer({
      target,
      video: { codec: 'avc', width, height },
      audio: hasAudio ? { codec: 'aac', numberOfChannels, sampleRate } : undefined,
      fastStart: isDirectToDisk ? false : 'in-memory'
    });
  } else {
    videoCodecString = 'vp09.00.10.08';
    audioCodecString = 'opus';
    muxer = new WebmMuxer.Muxer({
      target,
      video: { codec: 'V_VP9', width, height },
      audio: hasAudio ? { codec: 'A_OPUS', numberOfChannels, sampleRate } : undefined
    });
  }

  // 2. Configurar VideoEncoder
  let encodedChunksCount = 0;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      encodedChunksCount++;
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e) => console.error('[WebCodecs] Error en VideoEncoder:', e)
  });

  videoEncoder.configure({
    codec: videoCodecString,
    width,
    height,
    bitrate,
    framerate: fps
  });

  // 3. Codificación de Audio con Contrapresión
  let audioEncoder = null;
  if (hasAudio && typeof window.AudioEncoder === 'function') {
    try {
      const audioSupport = await AudioEncoder.isConfigSupported({
        codec: audioCodecString,
        sampleRate,
        numberOfChannels
      });

      if (audioSupport.supported) {
        audioEncoder = new AudioEncoder({
          output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
          error: (e) => console.error('[WebCodecs] Error en AudioEncoder:', e)
        });

        audioEncoder.configure({
          codec: audioCodecString,
          sampleRate,
          numberOfChannels,
          bitrate: 128000
        });

        const channelData = [];
        for (let c = 0; c < numberOfChannels; c++) {
          channelData.push(audioBuffer.getChannelData(c));
        }

        const audioChunkSize = 2048;
        const totalAudioLength = audioBuffer.length;
        let audioOffset = 0;

        while (audioOffset < totalAudioLength) {
          if (signal?.aborted) throw new Error('Cancelado por el usuario');

          // CONTRAPRESIÓN DE AUDIO: No acumular más de 8 chunks en espera
          while (audioEncoder.encodeQueueSize >= 8) {
            await new Promise((resolve) => {
              audioEncoder.ondequeue = () => resolve();
              setTimeout(resolve, 8);
            });
          }

          const framesToProcess = Math.min(audioChunkSize, totalAudioLength - audioOffset);
          const audioTimestampMicros = Math.floor((audioOffset / sampleRate) * 1_000_000);

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
    } catch (e) {
      console.warn('[WebCodecs] Fallback sin pista de audio:', e);
    }
  }

  // 4. Bucle de Renderizado de Video con Contrapresión Estricta
  // REGLA CRÍTICA: Mantener encodeQueueSize <= 4 en todo momento
  // Esto garantiza que Chromium NUNCA almacene más de 4 fotogramas crudos (~14 MB) en RAM
  const frameIntervalMicros = Math.floor(1_000_000 / fps);

  for (let f = 0; f < totalFrames; f++) {
    if (signal?.aborted) {
      videoEncoder.close();
      throw new Error('Cancelado por el usuario');
    }

    // CONTRAPRESIÓN CRÍTICA: Esperar a que la GPU consuma fotogramas pendientes
    while (videoEncoder.encodeQueueSize >= 4) {
      await new Promise((resolve) => {
        const onDrain = () => resolve();
        videoEncoder.ondequeue = onDrain;
        setTimeout(onDrain, 6); // Salvaguarda con timeout
      });
    }

    // Obtener fotograma del buffer plano optimizado
    const frameBars = waveformSignature.getFrame ? waveformSignature.getFrame(f) : waveformSignature.frames[f];
    renderFrame(ctx, width, height, frameBars, styleOptions);

    const frameTimestampMicros = Math.floor(f * frameIntervalMicros);

    const videoFrame = new VideoFrame(renderCanvas, {
      timestamp: frameTimestampMicros,
      duration: frameIntervalMicros
    });

    const isKeyFrame = f % (fps * 2) === 0;
    videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
    videoFrame.close(); // Liberar inmediatamente la referencia del frame

    // Notificación de progreso cada 15 fotogramas
    if (f % 15 === 0 || f === totalFrames - 1) {
      await new Promise((resolve) => setTimeout(resolve, 0)); // Ceder el event loop para Garbage Collector

      const now = performance.now();
      const elapsedSec = (now - startTime) / 1000;
      const progressRatio = (f + 1) / totalFrames;
      const currentFpsRate = (f + 1) / elapsedSec;
      const etaSec = currentFpsRate > 0 ? (totalFrames - (f + 1)) / currentFpsRate : 0;

      // Medir memoria RAM en vivo si el navegador lo soporta
      let usedRamMB = null;
      if (typeof window !== 'undefined' && window.performance && window.performance.memory) {
        usedRamMB = Math.round(window.performance.memory.usedJSHeapSize / (1024 * 1024));
      }

      if (onProgress) {
        onProgress({
          percent: Math.round(progressRatio * 100),
          currentFrame: f + 1,
          totalFrames,
          fpsRate: Math.round(currentFpsRate),
          elapsedSec: Math.round(elapsedSec),
          etaSec: Math.round(etaSec),
          chunksCount: encodedChunksCount,
          usedRamMB
        });
      }
    }
  }

  // Esperar a que la GPU termine de codificar todos los fotogramas restantes
  await videoEncoder.flush();
  videoEncoder.close();

  // Finalizar el contenedor
  muxer.finalize();

  let blob = null;
  const filename = `soundwave-video-${Date.now()}.${format}`;

  if (!isDirectToDisk) {
    const buffer = muxer.target.buffer;
    const mimeType = format === 'mp4' ? 'video/mp4' : 'video/webm';
    blob = new Blob([buffer], { type: mimeType });
  }

  return { blob, filename, directToDisk: isDirectToDisk };
}

/**
 * Estrategia MediaRecorder con Liberación Periódica de Chunks
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

  const canvasStream = renderCanvas.captureStream(fps);
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

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordedChunks.push(event.data);
      if (onProgress) {
        onProgress({ chunksCount: recordedChunks.length });
      }
    }
  };

  return new Promise(async (resolve, reject) => {
    recorder.onstop = () => {
      combinedStream.getTracks().forEach((t) => t.stop());
      if (audioContext && audioContext.state !== 'closed') audioContext.close();

      const blob = new Blob(recordedChunks, { type: mimeType });
      const filename = `soundwave-video-${Date.now()}.webm`;
      resolve({ blob, filename, directToDisk: false });
    };

    recorder.onerror = (e) => reject(e.error || new Error('Error en MediaRecorder'));

    recorder.start(1000);
    if (sourceNode) sourceNode.start(0);

    const frameIntervalMs = 1000 / fps;

    for (let f = 0; f < totalFrames; f++) {
      if (signal?.aborted) {
        recorder.stop();
        if (sourceNode) sourceNode.stop();
        reject(new Error('Cancelado por el usuario'));
        return;
      }

      const frameBars = waveformSignature.getFrame ? waveformSignature.getFrame(f) : waveformSignature.frames[f];
      renderFrame(ctx, width, height, frameBars, styleOptions);

      const now = performance.now();
      const elapsedSec = (now - startTime) / 1000;
      const progressRatio = (f + 1) / totalFrames;
      const currentFps = (f + 1) / elapsedSec;
      const etaSec = currentFps > 0 ? (totalFrames - (f + 1)) / currentFps : 0;

      let usedRamMB = null;
      if (typeof window !== 'undefined' && window.performance && window.performance.memory) {
        usedRamMB = Math.round(window.performance.memory.usedJSHeapSize / (1024 * 1024));
      }

      if (onProgress && (f % 15 === 0 || f === totalFrames - 1)) {
        onProgress({
          percent: Math.round(progressRatio * 100),
          currentFrame: f + 1,
          totalFrames,
          fpsRate: Math.round(currentFps),
          elapsedSec: Math.round(elapsedSec),
          etaSec: Math.round(etaSec),
          chunksCount: recordedChunks.length,
          usedRamMB
        });
      }

      await new Promise((r) => setTimeout(r, frameIntervalMs));
    }

    if (sourceNode) sourceNode.stop();
    recorder.stop();
  });
}
