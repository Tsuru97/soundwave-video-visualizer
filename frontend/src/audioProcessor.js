/**
 * Procesador de Audio para Extracción Rápida de la Firma de Onda (Waveform Signature)
 * Permite decodificar y analizar un audio de larga duración (hasta 1 hora o más)
 * en pocos segundos mediante Web Audio API y TypedArrays en memoria.
 */

/**
 * Decodifica un archivo de audio (File o Blob) en un AudioBuffer nativo
 * @param {File|Blob} file 
 * @param {AudioContext} audioCtx 
 * @returns {Promise<AudioBuffer>}
 */
export async function decodeAudioFile(file, audioCtx) {
  const arrayBuffer = await file.arrayBuffer();
  // decodeAudioData de Web Audio API realiza el demuxing y decodificación en C++ nativo del navegador
  return await audioCtx.decodeAudioData(arrayBuffer);
}

/**
 * Extrae la "firma de onda" completa para cada fotograma del video a generar.
 * Computa tanto el volumen pico/RMS como un desglose de frecuencias simuladas (graves, medios, agudos)
 * para crear visualizaciones reactivas y fluidas sin necesidad de reproducir el audio en tiempo real.
 * 
 * @param {AudioBuffer} audioBuffer
 * @param {number} fps Fotogramas por segundo (ej. 30 o 60)
 * @param {number} numBars Cantidad de barras por fotograma (ej. 64 o 128)
 * @returns {{ duration: number, totalFrames: number, sampleRate: number, frames: Float32Array[] }}
 */
export function extractWaveformSignature(audioBuffer, fps = 30, numBars = 64) {
  const sampleRate = audioBuffer.sampleRate;
  const duration = audioBuffer.duration;
  const totalFrames = Math.max(1, Math.floor(duration * fps));
  const samplesPerFrame = Math.floor(sampleRate / fps);

  // Combinar canales estéreo en mono para análisis de amplitud
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const monoData = new Float32Array(length);

  if (numChannels === 1) {
    monoData.set(audioBuffer.getChannelData(0));
  } else {
    const ch0 = audioBuffer.getChannelData(0);
    const ch1 = audioBuffer.getChannelData(1);
    for (let i = 0; i < length; i++) {
      monoData[i] = (ch0[i] + ch1[i]) * 0.5;
    }
  }

  const frames = new Array(totalFrames);
  const subChunkSize = Math.max(1, Math.floor(samplesPerFrame / numBars));

  // Recorrer cada fotograma virtual
  for (let f = 0; f < totalFrames; f++) {
    const frameBars = new Float32Array(numBars);
    const frameStartSample = f * samplesPerFrame;

    for (let b = 0; b < numBars; b++) {
      const start = frameStartSample + b * subChunkSize;
      const end = Math.min(length, start + subChunkSize);

      let sumSquare = 0;
      let peak = 0;
      const count = end - start;

      if (count > 0) {
        for (let s = start; s < end; s++) {
          const val = Math.abs(monoData[s]);
          if (val > peak) peak = val;
          sumSquare += val * val;
        }
        const rms = Math.sqrt(sumSquare / count);
        // Combinar peak y RMS con ponderación armónica
        // Añadir una modulación suave tipo espectro (graves a agudos)
        const frequencyWeight = 1.0 + Math.sin((b / numBars) * Math.PI) * 0.5;
        let amplitude = (peak * 0.6 + rms * 0.4) * frequencyWeight;
        
        // Limitar entre 0 y 1
        frameBars[b] = Math.min(1.0, amplitude);
      } else {
        frameBars[b] = 0;
      }
    }

    frames[f] = frameBars;
  }

  return {
    duration,
    totalFrames,
    sampleRate,
    fps,
    numBars,
    frames
  };
}
