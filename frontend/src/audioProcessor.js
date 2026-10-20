/**
 * Procesador de Audio de Alta Eficiencia y Bajo Consumo de Memoria
 * Soporta decodificación nativa, remuestreo, concatenación de Intro/Outro
 * y extracción de firma de onda para secuencias completas de audio.
 */

/**
 * Decodifica un archivo de audio en un AudioBuffer nativo
 * @param {File|Blob} file 
 * @param {AudioContext} audioCtx 
 * @returns {Promise<AudioBuffer>}
 */
export async function decodeAudioFile(file, audioCtx) {
  const arrayBuffer = await file.arrayBuffer();
  return await audioCtx.decodeAudioData(arrayBuffer);
}

/**
 * Remuestrea un AudioBuffer a una frecuencia de muestreo objetivo mediante OfflineAudioContext
 * @param {AudioBuffer} buffer 
 * @param {number} targetSampleRate 
 * @returns {Promise<AudioBuffer>}
 */
export async function resampleAudioBuffer(buffer, targetSampleRate) {
  if (buffer.sampleRate === targetSampleRate) {
    return buffer;
  }

  const numChannels = buffer.numberOfChannels;
  const targetLength = Math.round((buffer.length * targetSampleRate) / buffer.sampleRate);

  const offlineCtx = new OfflineAudioContext(numChannels, targetLength, targetSampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  return await offlineCtx.startRendering();
}

/**
 * Concatena secuencialmente múltiples AudioBuffers (Intro + Principal + Outro)
 * remuestreando automáticamente si sus frecuencias de muestreo difieren.
 * 
 * @param {Array<{ name: string, buffer: AudioBuffer }>} trackList 
 * @param {AudioContext} audioCtx 
 * @returns {Promise<{ combinedBuffer: AudioBuffer, segments: Array<{ name: string, duration: number, startSec: number, endSec: number }> }>}
 */
export async function concatenateAudioTracks(trackList, audioCtx) {
  // Filtrar pistas válidas
  const activeTracks = trackList.filter(t => t && t.buffer);
  if (activeTracks.length === 0) {
    throw new Error('No hay pistas de audio para concatenar');
  }

  if (activeTracks.length === 1) {
    const single = activeTracks[0];
    return {
      combinedBuffer: single.buffer,
      segments: [{
        name: single.name,
        duration: single.buffer.duration,
        startSec: 0,
        endSec: single.buffer.duration
      }]
    };
  }

  // Usar la frecuencia de muestreo de la pista principal o del contexto
  const targetSampleRate = activeTracks.find(t => t.isMain)?.buffer.sampleRate || audioCtx.sampleRate || 44100;
  const maxChannels = Math.max(...activeTracks.map(t => t.buffer.numberOfChannels));

  // 1. Remuestrear pistas si es necesario
  const resampledTracks = [];
  for (const track of activeTracks) {
    const resampled = await resampleAudioBuffer(track.buffer, targetSampleRate);
    resampledTracks.push({
      name: track.name,
      buffer: resampled
    });
  }

  // 2. Calcular longitud total en muestras y registrar segmentos
  let totalSamples = 0;
  const segments = [];
  let currentSec = 0;

  for (const track of resampledTracks) {
    const duration = track.buffer.duration;
    segments.push({
      name: track.name,
      duration,
      startSec: currentSec,
      endSec: currentSec + duration
    });
    currentSec += duration;
    totalSamples += track.buffer.length;
  }

  // 3. Crear buffer unificado
  const combinedBuffer = audioCtx.createBuffer(maxChannels, totalSamples, targetSampleRate);

  // 4. Copiar datos de canal secuencialmente
  for (let c = 0; c < maxChannels; c++) {
    const channelData = combinedBuffer.getChannelData(c);
    let offset = 0;

    for (const track of resampledTracks) {
      // Si la pista es mono y el destino es estéreo, duplicar canal 0
      const trackChannel = c < track.buffer.numberOfChannels 
        ? track.buffer.getChannelData(c) 
        : track.buffer.getChannelData(0);

      channelData.set(trackChannel, offset);
      offset += track.buffer.length;
    }
  }

  return { combinedBuffer, segments };
}

/**
 * Convierte un AudioBuffer en un Blob WAV estándar para alimentar el reproductor HTML5
 * @param {AudioBuffer} audioBuffer 
 * @returns {Blob}
 */
export function audioBufferToWavBlob(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // 16-bit PCM
  const bitDepth = 16;
  const length = audioBuffer.length;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // Escribir cabecera WAV
  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Intercalar y cuantizar canales a 16 bits PCM
  const channels = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(audioBuffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = channels[c][i];
      // Clamping entre -1 y 1
      sample = Math.max(-1, Math.min(1, sample));
      // Escalar a 16-bit con signo
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Extrae la "firma de onda" completa optimizada para cero allocations innecesarios.
 * Utiliza un ÚNICO Float32Array plano para todos los fotogramas.
 * 
 * @param {AudioBuffer} audioBuffer
 * @param {number} fps
 * @param {number} numBars
 * @returns {{ duration: number, totalFrames: number, sampleRate: number, fps: number, numBars: number, getFrame: (f: number) => Float32Array, flatBuffer: Float32Array }}
 */
export function extractWaveformSignature(audioBuffer, fps = 30, numBars = 64) {
  const sampleRate = audioBuffer.sampleRate;
  const duration = audioBuffer.duration;
  const totalFrames = Math.max(1, Math.floor(duration * fps));
  const samplesPerFrame = Math.floor(sampleRate / fps);
  const length = audioBuffer.length;

  const numChannels = audioBuffer.numberOfChannels;
  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = numChannels > 1 ? audioBuffer.getChannelData(1) : null;

  const flatBuffer = new Float32Array(totalFrames * numBars);
  const subChunkSize = Math.max(1, Math.floor(samplesPerFrame / numBars));

  for (let f = 0; f < totalFrames; f++) {
    const frameOffset = f * numBars;
    const frameStartSample = f * samplesPerFrame;

    for (let b = 0; b < numBars; b++) {
      const start = frameStartSample + b * subChunkSize;
      const end = Math.min(length, start + subChunkSize);

      let sumSquare = 0;
      let peak = 0;
      const count = end - start;

      if (count > 0) {
        for (let s = start; s < end; s++) {
          const val = Math.abs(ch1 ? (ch0[s] + ch1[s]) * 0.5 : ch0[s]);
          if (val > peak) peak = val;
          sumSquare += val * val;
        }

        const rms = Math.sqrt(sumSquare / count);
        const frequencyWeight = 1.0 + Math.sin((b / numBars) * Math.PI) * 0.5;
        const amplitude = (peak * 0.6 + rms * 0.4) * frequencyWeight;

        flatBuffer[frameOffset + b] = Math.min(1.0, amplitude);
      } else {
        flatBuffer[frameOffset + b] = 0;
      }
    }
  }

  const getFrame = (frameIndex) => {
    const safeIndex = Math.max(0, Math.min(totalFrames - 1, frameIndex));
    const start = safeIndex * numBars;
    return flatBuffer.subarray(start, start + numBars);
  };

  return {
    duration,
    totalFrames,
    sampleRate,
    fps,
    numBars,
    flatBuffer,
    getFrame
  };
}
