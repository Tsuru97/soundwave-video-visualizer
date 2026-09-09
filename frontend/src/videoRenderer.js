/**
 * Motor de Renderizado de Ondas Sonoras en Canvas
 * Dibuja fotogramas de alta resolución para previsualización y exportación de video.
 */

/**
 * Renderiza un fotograma completo sobre el contexto 2D proporcionado
 * @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} ctx 
 * @param {number} width Ancho del lienzo
 * @param {number} height Alto del lienzo
 * @param {Float32Array} frameData Array de magnitudes del fotograma (longitud numBars)
 * @param {Object} options Opciones de estilo
 */
export function renderFrame(ctx, width, height, frameData, options = {}) {
  const {
    style = 'bars',
    accentColor = '#6366f1',
    secondaryColor = '#06b6d4',
    bgColor = '#090d16',
    title = '',
    subtitle = ''
  } = options;

  const numBars = frameData ? frameData.length : 64;

  // 1. Limpiar y dibujar fondo
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // Fondo con suave gradiente radial central para estética cinematográfica
  const bgGlow = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, Math.max(width, height) * 0.7);
  bgGlow.addColorStop(0, 'rgba(30, 41, 59, 0.4)');
  bgGlow.addColorStop(1, 'rgba(9, 13, 22, 0.9)');
  ctx.fillStyle = bgGlow;
  ctx.fillRect(0, 0, width, height);

  if (!frameData) return;

  const centerY = height / 2;
  const centerX = width / 2;

  // 2. Dibujar según el estilo seleccionado
  if (style === 'bars') {
    const totalBars = numBars;
    const barSpacing = Math.max(2, Math.floor(width / (totalBars * 2.5)));
    const totalContentWidth = totalBars * barSpacing;
    let startX = (width - totalContentWidth) / 2;

    const maxBarHeight = height * 0.42;

    for (let i = 0; i < totalBars; i++) {
      const magnitude = frameData[i] || 0;
      const barHeight = Math.max(4, magnitude * maxBarHeight);

      const grad = ctx.createLinearGradient(0, centerY - barHeight, 0, centerY + barHeight);
      grad.addColorStop(0, accentColor);
      grad.addColorStop(0.5, secondaryColor);
      grad.addColorStop(1, accentColor);

      ctx.fillStyle = grad;
      const barWidth = Math.max(2, barSpacing - 2);

      // Dibujar barra simétrica con bordes redondeados
      const x = startX + i * barSpacing;
      const y = centerY - barHeight;
      const h = barHeight * 2;

      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, h, Math.min(barWidth / 2, 4));
      ctx.fill();
    }
  } else if (style === 'wave') {
    const maxAmplitude = height * 0.35;
    ctx.beginPath();
    ctx.lineWidth = Math.max(3, Math.floor(width / 320));
    ctx.strokeStyle = accentColor;
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 12;

    const sliceWidth = width / (numBars - 1);
    let x = 0;

    for (let i = 0; i < numBars; i++) {
      const mag = (frameData[i] || 0) * (i % 2 === 0 ? 1 : -1);
      const y = centerY + mag * maxAmplitude;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    ctx.stroke();
    ctx.shadowBlur = 0; // Reset sombra
  } else if (style === 'circular') {
    const baseRadius = Math.min(width, height) * 0.22;
    const maxExpansion = Math.min(width, height) * 0.18;

    // Círculo central iluminado
    ctx.beginPath();
    ctx.arc(centerX, centerY, baseRadius * 0.9, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.3)';
    ctx.stroke();

    ctx.lineWidth = Math.max(2, Math.floor(width / 400));
    ctx.strokeStyle = accentColor;

    for (let i = 0; i < numBars; i++) {
      const rad = (Math.PI * 2 / numBars) * i;
      const magnitude = frameData[i] || 0;
      const expansion = magnitude * maxExpansion;

      const x1 = centerX + Math.cos(rad) * baseRadius;
      const y1 = centerY + Math.sin(rad) * baseRadius;
      const x2 = centerX + Math.cos(rad) * (baseRadius + expansion);
      const y2 = centerY + Math.sin(rad) * (baseRadius + expansion);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  // 3. Título opcional y marca de agua
  if (title) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${Math.max(16, Math.floor(height * 0.04))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(title, centerX, height * 0.12);
  }

  if (subtitle) {
    ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
    ctx.font = `400 ${Math.max(12, Math.floor(height * 0.025))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(subtitle, centerX, height * 0.16);
  }
}
