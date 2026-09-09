/**
 * Motor de Renderizado de Ondas Sonoras y Composición Visual Multi-Capa
 * Soporta fondo personalizado (blur y dim), renderizado de onda sonora,
 * y múltiples capas independientes de imágenes (portadas, logos) y textos interactivos.
 */

/**
 * Renderiza un fotograma completo sobre el lienzo proporcionado
 * @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} ctx 
 * @param {number} width Ancho del lienzo
 * @param {number} height Alto del lienzo
 * @param {Float32Array} frameData Magnitudes del fotograma
 * @param {Object} options Opciones de fondo, capas y onda sonora
 */
export function renderFrame(ctx, width, height, frameData, options = {}) {
  const {
    style = 'bars',
    accentColor = '#6366f1',
    secondaryColor = '#06b6d4',
    bgColor = '#090d16',
    background = null,      // { image, blur, dim, color }
    layers = [],            // Array de capas (imágenes y textos)
    selectedLayerId = null, // ID de capa activa seleccionada para dibujar guía
    isExporting = false     // Si es exportación de video, no dibujar guías de edición
  } = options;

  const numBars = frameData ? frameData.length : 64;

  // =========================================================================
  // 1. RENDERIZADO DEL FONDO
  // =========================================================================
  if (background && background.image) {
    const img = background.image;
    const blur = background.blur || 0;
    const dim = background.dim !== undefined ? background.dim : 0.45;

    const scale = Math.max(width / img.width, height / img.height);
    const blurMargin = blur > 0 ? 1.08 : 1.0;
    const finalScale = scale * blurMargin;
    const w = img.width * finalScale;
    const h = img.height * finalScale;
    const x = (width - w) / 2;
    const y = (height - h) / 2;

    ctx.save();
    if (blur > 0) {
      ctx.filter = `blur(${blur}px)`;
    }
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();

    if (dim > 0) {
      ctx.fillStyle = `rgba(9, 13, 22, ${dim})`;
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    const bgGlow = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, Math.max(width, height) * 0.7);
    bgGlow.addColorStop(0, 'rgba(30, 41, 59, 0.45)');
    bgGlow.addColorStop(1, 'rgba(9, 13, 22, 0.95)');
    ctx.fillStyle = bgGlow;
    ctx.fillRect(0, 0, width, height);
  }

  // =========================================================================
  // 2. RENDERIZADO DE LA ONDA SONORA
  // =========================================================================
  const centerY = height * 0.62;
  const centerX = width / 2;

  if (frameData) {
    if (style === 'bars') {
      const totalBars = numBars;
      const barSpacing = Math.max(2, Math.floor(width / (totalBars * 2.5)));
      const totalContentWidth = totalBars * barSpacing;
      let startX = (width - totalContentWidth) / 2;
      const maxBarHeight = height * 0.30;

      for (let i = 0; i < totalBars; i++) {
        const magnitude = frameData[i] || 0;
        const barHeight = Math.max(4, magnitude * maxBarHeight);

        const grad = ctx.createLinearGradient(0, centerY - barHeight, 0, centerY + barHeight);
        grad.addColorStop(0, accentColor);
        grad.addColorStop(0.5, secondaryColor);
        grad.addColorStop(1, accentColor);

        ctx.fillStyle = grad;
        const barWidth = Math.max(2, barSpacing - 2);
        const x = startX + i * barSpacing;
        const y = centerY - barHeight;
        const h = barHeight * 2;

        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, h, Math.min(barWidth / 2, 4));
        ctx.fill();
      }
    } else if (style === 'wave') {
      const maxAmplitude = height * 0.26;
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
      ctx.shadowBlur = 0;
    } else if (style === 'circular') {
      const circularCenterY = height * 0.48;
      const baseRadius = Math.min(width, height) * 0.20;
      const maxExpansion = Math.min(width, height) * 0.16;

      ctx.lineWidth = Math.max(2, Math.floor(width / 400));
      ctx.strokeStyle = accentColor;

      for (let i = 0; i < numBars; i++) {
        const rad = (Math.PI * 2 / numBars) * i;
        const magnitude = frameData[i] || 0;
        const expansion = magnitude * maxExpansion;

        const x1 = centerX + Math.cos(rad) * baseRadius;
        const y1 = circularCenterY + Math.sin(rad) * baseRadius;
        const x2 = centerX + Math.cos(rad) * (baseRadius + expansion);
        const y2 = circularCenterY + Math.sin(rad) * (baseRadius + expansion);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
  }

  // =========================================================================
  // 3. RENDERIZADO DE CAPAS MULTI-CAPA (IMÁGENES Y TEXTOS)
  // =========================================================================
  if (Array.isArray(layers) && layers.length > 0) {
    for (const layer of layers) {
      if (!layer) continue;

      const isSelected = !isExporting && selectedLayerId === layer.id;

      if (layer.type === 'image' && layer.image) {
        // --- CAPA DE IMAGEN ---
        const relSize = layer.relSize || 0.25;
        const size = Math.min(width, height) * relSize;
        const x = width * (layer.relX ?? 0.5) - size / 2;
        const y = height * (layer.relY ?? 0.35) - size / 2;
        const shape = layer.shape || 'rounded';
        const opacity = layer.opacity !== undefined ? layer.opacity : 1.0;

        ctx.save();
        ctx.globalAlpha = opacity;

        if (layer.shadow !== false) {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
          ctx.shadowBlur = 20;
          ctx.shadowOffsetY = 8;
        }

        ctx.beginPath();
        if (shape === 'circle') {
          ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
        } else {
          const radius = size * 0.08;
          ctx.roundRect(x, y, size, size, radius);
        }
        ctx.save();
        ctx.clip();
        ctx.drawImage(layer.image, x, y, size, size);
        ctx.restore();

        ctx.lineWidth = Math.max(2, Math.floor(size * 0.015));
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.stroke();

        ctx.restore();

        // Caja de selección interactiva
        if (isSelected) {
          ctx.save();
          ctx.strokeStyle = '#6366f1';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([6, 6]);
          ctx.strokeRect(x - 4, y - 4, size + 8, size + 8);
          // Manijas en las esquinas
          drawHandle(ctx, x - 4, y - 4);
          drawHandle(ctx, x + size + 4, y - 4);
          drawHandle(ctx, x - 4, y + size + 4);
          drawHandle(ctx, x + size + 4, y + size + 4);
          ctx.restore();
        }

      } else if (layer.type === 'text' && layer.text) {
        // --- CAPA DE TEXTO ---
        const fontSizeRel = layer.fontSizeRel || 0.042;
        const fontSize = Math.max(12, Math.floor(height * fontSizeRel));
        const fontFamily = layer.fontFamily || '-apple-system, BlinkMacSystemFont, sans-serif';
        const fontWeight = layer.fontWeight || '700';
        const color = layer.color || '#ffffff';
        const opacity = layer.opacity !== undefined ? layer.opacity : 1.0;

        const posX = width * (layer.relX ?? 0.5);
        const posY = height * (layer.relY ?? 0.88);

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (layer.shadow !== false) {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
          ctx.shadowBlur = 10;
          ctx.shadowOffsetY = 3;
        }

        ctx.fillStyle = color;
        ctx.fillText(layer.text, posX, posY);
        ctx.restore();

        // Caja de selección interactiva para texto
        if (isSelected) {
          ctx.save();
          ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
          const metrics = ctx.measureText(layer.text);
          const textWidth = metrics.width;
          const textHeight = fontSize * 1.2;
          const boxX = posX - textWidth / 2 - 8;
          const boxY = posY - textHeight / 2 - 4;

          ctx.strokeStyle = '#6366f1';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.strokeRect(boxX, boxY, textWidth + 16, textHeight + 8);
          drawHandle(ctx, boxX, boxY);
          drawHandle(ctx, boxX + textWidth + 16, boxY);
          drawHandle(ctx, boxX, boxY + textHeight + 8);
          drawHandle(ctx, boxX + textWidth + 16, boxY + textHeight + 8);
          ctx.restore();
        }
      }
    }
  }
}

function drawHandle(ctx, x, y) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(x, y, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
