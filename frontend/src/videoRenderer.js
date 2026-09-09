/**
 * Motor de Renderizado de Ondas Sonoras y Composición Visual
 * Soporta fondo personalizado (con blur y dim), capas de imágenes superpuestas
 * (portadas/logos arrastrables) y formas geométricas cinematográficas.
 */

/**
 * Renderiza un fotograma completo sobre el lienzo proporcionado
 * @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} ctx 
 * @param {number} width Ancho del lienzo
 * @param {number} height Alto del lienzo
 * @param {Float32Array} frameData Magnitudes del fotograma
 * @param {Object} options Opciones de estilo, fondo y capas
 */
export function renderFrame(ctx, width, height, frameData, options = {}) {
  const {
    style = 'bars',
    accentColor = '#6366f1',
    secondaryColor = '#06b6d4',
    bgColor = '#090d16',
    title = '',
    subtitle = '',
    background = null, // { image, blur, dim, color }
    overlay = null,    // { image, relX, relY, relSize, shape, opacity, shadow }
    isSelectedOverlay = false // Dibuja guía visual interactiva en preview
  } = options;

  const numBars = frameData ? frameData.length : 64;

  // =========================================================================
  // 1. RENDERIZADO DEL FONDO
  // =========================================================================
  if (background && background.image) {
    const img = background.image;
    const blur = background.blur || 0;
    const dim = background.dim !== undefined ? background.dim : 0.45;

    // Calcular escala tipo 'cover' para llenar el lienzo manteniendo proporciones
    const scale = Math.max(width / img.width, height / img.height);
    // Escalar un 8% adicional cuando hay blur para evitar bordes transparentes
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

    // Capa de oscurecimiento (dim) para contraste de la onda y texto
    if (dim > 0) {
      ctx.fillStyle = `rgba(9, 13, 22, ${dim})`;
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    // Fondo base por defecto con degradado radial
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
  const centerY = height * 0.65; // Ligeramente desplazada hacia abajo para dejar espacio a la portada/logo
  const centerX = width / 2;

  if (frameData) {
    if (style === 'bars') {
      const totalBars = numBars;
      const barSpacing = Math.max(2, Math.floor(width / (totalBars * 2.5)));
      const totalContentWidth = totalBars * barSpacing;
      let startX = (width - totalContentWidth) / 2;
      const maxBarHeight = height * 0.32;

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
      const maxAmplitude = height * 0.28;
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
      const circularCenterY = height * 0.5;
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
  // 3. RENDERIZADO DE CAPAS SUPERPUESTAS (PORTADA / LOGO)
  // =========================================================================
  if (overlay && overlay.image) {
    const img = overlay.image;
    const relSize = overlay.relSize || 0.28;
    const size = Math.min(width, height) * relSize;
    const x = width * (overlay.relX ?? 0.5) - size / 2;
    const y = height * (overlay.relY ?? 0.35) - size / 2;
    const shape = overlay.shape || 'rounded';
    const opacity = overlay.opacity !== undefined ? overlay.opacity : 1.0;

    ctx.save();
    ctx.globalAlpha = opacity;

    // Sombra proyectada
    if (overlay.shadow !== false) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 10;
    }

    // Dibujar máscara de recorte según la forma
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    } else {
      const radius = size * 0.08;
      ctx.roundRect(x, y, size, size, radius);
    }
    ctx.save();
    ctx.clip();

    // Dibujar imagen ajustada
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();

    // Borde fino brillante
    ctx.lineWidth = Math.max(2, Math.floor(size * 0.015));
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.stroke();

    ctx.restore();

    // Si está seleccionado en el diseñador (solo en previsualización interactiva)
    if (isSelectedOverlay) {
      ctx.save();
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(x - 4, y - 4, size + 8, size + 8);
      ctx.restore();
    }
  }

  // =========================================================================
  // 4. TÍTULO Y SUBTÍTULO
  // =========================================================================
  if (title) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.max(16, Math.floor(height * 0.042))}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 8;
    ctx.fillText(title, centerX, height * 0.90);
    ctx.shadowBlur = 0;
  }

  if (subtitle) {
    ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
    ctx.font = `500 ${Math.max(12, Math.floor(height * 0.026))}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 6;
    ctx.fillText(subtitle, centerX, height * 0.94);
    ctx.shadowBlur = 0;
  }
}
