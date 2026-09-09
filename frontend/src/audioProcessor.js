/**
 * Procesador de Audio de Alta Eficiencia y Bajo Consumo de Memoria
 * Extrae la firma de onda para audios de hasta 1 hora sin duplicar buffers en memoria.
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
 * Extrae la "firma de onda" completa optimizada para cero allocations innecesarios.
 * Utiliza un ÚNICO Float32Array plano para todos los fotogramas, evitando miles de objetos
 * en el recolector de basura (GC) y reduciendo el consumo de RAM a ~14 MB para 30 minutos.
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

  // UN SOLO BUFFER PLANO en memoria para todos los fotogramas
  // Tamaño para 30 minutos a 30 fps (54,000 frames x 64 bars) = ~13.8 MB
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
          // Lectura directa sin duplicar array estéreo a mono
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

  // Helper de acceso sin crear copias (zero-copy view con subarray)
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
