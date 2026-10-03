/**
 * Brand heatmap: Clicks red density bands + primary job dots.
 */

const INTENSITY_VS = `
  attribute vec2 a_position;
  attribute float a_weight;
  uniform vec2 u_resolution;
  uniform float u_radius;
  varying float v_weight;
  void main() {
    vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    v_weight = max(a_weight, 1.0);
    gl_PointSize = u_radius;
  }
`;

const INTENSITY_FS = `
  precision mediump float;
  varying float v_weight;
  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float dist = length(uv);
    if (dist > 0.5) discard;
    float falloff = exp(-dist * dist * 4.5);
    float boost = 1.0 + log(v_weight + 1.0) * 0.22;
    float strength = falloff * 0.038 * boost;
    gl_FragColor = vec4(strength, strength, strength, 1.0);
  }
`;

const COLOR_VS = `
  attribute vec2 a_corner;
  varying vec2 v_uv;
  void main() {
    v_uv = a_corner * 0.5 + 0.5;
    gl_Position = vec4(a_corner, 0.0, 1.0);
  }
`;

const COLOR_FS = `
  precision mediump float;
  varying vec2 v_uv;
  uniform sampler2D u_intensity;
  uniform vec2 u_texSize;
  uniform float u_norm;

  float sampleBlurred(vec2 uv) {
    vec2 px = 1.0 / u_texSize;
    float v = texture2D(u_intensity, uv).r * 0.28;
    v += texture2D(u_intensity, uv + px * vec2(1.0, 0.0)).r * 0.12;
    v += texture2D(u_intensity, uv - px * vec2(1.0, 0.0)).r * 0.12;
    v += texture2D(u_intensity, uv + px * vec2(0.0, 1.0)).r * 0.12;
    v += texture2D(u_intensity, uv - px * vec2(0.0, 1.0)).r * 0.12;
    v += texture2D(u_intensity, uv + px * vec2(1.0, 1.0)).r * 0.06;
    v += texture2D(u_intensity, uv + px * vec2(-1.0, 1.0)).r * 0.06;
    v += texture2D(u_intensity, uv + px * vec2(1.0, -1.0)).r * 0.06;
    v += texture2D(u_intensity, uv + px * vec2(-1.0, -1.0)).r * 0.06;
    return v;
  }

  vec3 heatGradient(float t) {
    t = clamp(t, 0.0, 1.0);
    // Sanad navy: pale slate → lighter → light → primary → hover.
    float band = floor(t * 5.0);
    if (band < 1.0) return vec3(0.910, 0.933, 0.949); // #E8EEF2 — few
    if (band < 2.0) return vec3(0.773, 0.831, 0.863); // #C5D4DC — some
    if (band < 3.0) return vec3(0.102, 0.290, 0.388); // #1A4A63 — moderate
    if (band < 4.0) return vec3(0.039, 0.149, 0.208); // #0A2635 — many
    return vec3(0.024, 0.094, 0.125);                   // #061820 — hotspot
  }

  void main() {
    float raw = sampleBlurred(v_uv);
    float v = clamp(raw / max(u_norm, 0.0001), 0.0, 1.0);
    if (v < 0.03) discard;
    // Snap to band so colors don't blur together.
    float banded = (floor(v * 5.0) + 0.5) / 5.0;
    vec3 color = heatGradient(banded);
    float alpha = 0.58 + banded * 0.34;
    gl_FragColor = vec4(color, alpha);
  }
`;

const DOT_VS = `
  attribute vec2 a_position;
  uniform vec2 u_resolution;
  uniform float u_size;
  void main() {
    vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    gl_PointSize = u_size;
  }
`;

const DOT_FS = `
  precision mediump float;
  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float dist = length(uv);
    if (dist > 0.5) discard;
    float core = 1.0 - smoothstep(0.22, 0.38, dist);
    float ring = smoothstep(0.38, 0.48, dist) * (1.0 - smoothstep(0.48, 0.5, dist));
    float alpha = core * 0.92 + ring * 0.98;
    vec3 fill = vec3(0.596, 0.122, 0.122); // brand primary
    vec3 stroke = vec3(1.0, 1.0, 1.0);
    vec3 color = mix(stroke, fill, core);
    gl_FragColor = vec4(color, alpha);
  }
`;

const HEAT_SCALE = 0.7;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const msg = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(msg || "Shader compile failed");
  }
  return shader;
}

function linkProgram(gl, vsSource, fsSource) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Program link failed");
  }
  return program;
}

function heatRadiusForZoom(zoom) {
  if (zoom >= 15) return 16;
  if (zoom >= 13) return 20;
  if (zoom >= 11) return 24;
  if (zoom >= 9) return 28;
  return 32;
}

function dotSizeForZoom(zoom) {
  if (zoom >= 15) return 1.5;
  if (zoom >= 13) return 1.35;
  if (zoom >= 11) return 1.2;
  return 1;
}

/**
 * @param {google.maps.Map} map
 * @param {{ heat?: { lat: number, lng: number, weight?: number }[], dots?: { lat: number, lng: number }[] }} data
 */
export function createHeatmapWebGLOverlay(map, data = {}) {
  const canvas = document.createElement("canvas");
  canvas.style.position = "absolute";
  canvas.style.pointerEvents = "none";

  let gl = null;
  let intensityProgram = null;
  let colorProgram = null;
  let dotProgram = null;
  let heatBuffer = null;
  let dotBuffer = null;
  let quadBuffer = null;
  let intensityTarget = null;

  let iPos = -1;
  let iWeight = -1;
  let iResolution = null;
  let iRadius = null;
  let cCorner = -1;
  let cIntensity = null;
  let cNorm = null;
  let cTexSize = null;
  let dPos = -1;
  let dResolution = null;
  let dSize = null;

  let heatPoints = data.heat || [];
  let dotPoints = data.dots || [];
  let heatProjected = new Float32Array(0);
  let dotProjected = new Float32Array(0);
  let heatCount = 0;
  let dotCount = 0;
  let rafId = null;
  let idleListener = null;
  let dragStartListener = null;
  let zoomListener = null;

  const overlay = new window.google.maps.OverlayView();

  function hideLayer() {
    canvas.style.opacity = "0";
  }

  function showLayer() {
    canvas.style.opacity = "1";
  }

  function ensureIntensityTarget(iw, ih) {
    if (intensityTarget?.iw === iw && intensityTarget?.ih === ih) return;

    if (intensityTarget) {
      gl.deleteFramebuffer(intensityTarget.fbo);
      gl.deleteTexture(intensityTarget.texture);
    }

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, iw, ih, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    intensityTarget = { fbo, texture, iw, ih };
  }

  function initGl() {
    if (gl) return true;
    gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) return false;

    intensityProgram = linkProgram(gl, INTENSITY_VS, INTENSITY_FS);
    colorProgram = linkProgram(gl, COLOR_VS, COLOR_FS);
    dotProgram = linkProgram(gl, DOT_VS, DOT_FS);

    iPos = gl.getAttribLocation(intensityProgram, "a_position");
    iWeight = gl.getAttribLocation(intensityProgram, "a_weight");
    iResolution = gl.getUniformLocation(intensityProgram, "u_resolution");
    iRadius = gl.getUniformLocation(intensityProgram, "u_radius");

    cCorner = gl.getAttribLocation(colorProgram, "a_corner");
    cIntensity = gl.getUniformLocation(colorProgram, "u_intensity");
    cNorm = gl.getUniformLocation(colorProgram, "u_norm");
    cTexSize = gl.getUniformLocation(colorProgram, "u_texSize");

    dPos = gl.getAttribLocation(dotProgram, "a_position");
    dResolution = gl.getUniformLocation(dotProgram, "u_resolution");
    dSize = gl.getUniformLocation(dotProgram, "u_size");

    heatBuffer = gl.createBuffer();
    dotBuffer = gl.createBuffer();
    quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    return true;
  }

  function updateLayout() {
    const projection = overlay.getProjection();
    if (!projection) return null;

    const bounds = map.getBounds();
    if (!bounds) return null;

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const nw = new window.google.maps.LatLng(ne.lat(), sw.lng());
    const se = new window.google.maps.LatLng(sw.lat(), ne.lng());

    const topLeft = projection.fromLatLngToDivPixel(nw);
    const bottomRight = projection.fromLatLngToDivPixel(se);
    if (!topLeft || !bottomRight) return null;

    const width = Math.max(1, Math.round(bottomRight.x - topLeft.x));
    const height = Math.max(1, Math.round(bottomRight.y - topLeft.y));

    canvas.style.left = `${topLeft.x}px`;
    canvas.style.top = `${topLeft.y}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    return { projection, topLeft, width, height };
  }

  function toPixel(projection, topLeft, lat, lng, sx, sy) {
    const pixel = projection.fromLatLngToDivPixel({ lat, lng });
    if (!pixel) return null;
    return {
      x: (pixel.x - topLeft.x) * sx,
      y: (pixel.y - topLeft.y) * sy,
    };
  }

  function projectHeat(layout) {
    const { projection, topLeft, width, height } = layout;
    const iw = Math.max(1, Math.round(width * HEAT_SCALE));
    const ih = Math.max(1, Math.round(height * HEAT_SCALE));
    const sx = iw / width;
    const sy = ih / height;

    const needed = heatPoints.length * 3;
    if (heatProjected.length < needed) {
      heatProjected = new Float32Array(Math.max(needed, heatProjected.length * 2 || 4096));
    }

    let count = 0;
    for (let i = 0; i < heatPoints.length; i++) {
      const p = heatPoints[i];
      const pt = toPixel(projection, topLeft, p.lat, p.lng, sx, sy);
      if (!pt) continue;
      const o = count * 3;
      heatProjected[o] = pt.x;
      heatProjected[o + 1] = pt.y;
      heatProjected[o + 2] = p.weight ?? 1;
      count += 1;
    }
    heatCount = count;
    return { iw, ih };
  }

  function projectDots(layout) {
    const { projection, topLeft, width, height } = layout;
    const needed = dotPoints.length * 2;
    if (dotProjected.length < needed) {
      dotProjected = new Float32Array(Math.max(needed, dotProjected.length * 2 || 8192));
    }

    let count = 0;
    for (let i = 0; i < dotPoints.length; i++) {
      const p = dotPoints[i];
      const pt = toPixel(projection, topLeft, p.lat, p.lng, 1, 1);
      if (!pt) continue;
      const o = count * 2;
      dotProjected[o] = pt.x;
      dotProjected[o + 1] = pt.y;
      count += 1;
    }
    dotCount = count;
  }

  function estimateNormPeak(count, maxWeight) {
    if (count <= 0) return 0.12;
    const w = maxWeight > 1 ? Math.log(maxWeight + 1) * 0.14 : 0;
    const weightFactor = Math.max(1, maxWeight) * 0.022;
    return Math.max(0.08, Math.min(0.38, 0.10 + count * 0.000015 + w + weightFactor));
  }

  function render() {
    rafId = null;
    const layout = updateLayout();
    if (!layout) return;

    if (!initGl()) return;

    const zoom = map.getZoom() || 11;
    const { width, height } = layout;

    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (heatPoints.length > 0) {
      const heatSize = projectHeat(layout);
      if (heatSize && heatCount > 0) {
        const { iw, ih } = heatSize;
        ensureIntensityTarget(iw, ih);

        gl.bindFramebuffer(gl.FRAMEBUFFER, intensityTarget.fbo);
        gl.viewport(0, 0, iw, ih);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(intensityProgram);
        gl.uniform2f(iResolution, iw, ih);
        gl.uniform1f(iRadius, heatRadiusForZoom(zoom) * HEAT_SCALE);

        gl.bindBuffer(gl.ARRAY_BUFFER, heatBuffer);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          heatProjected.subarray(0, heatCount * 3),
          gl.DYNAMIC_DRAW
        );
        gl.enableVertexAttribArray(iPos);
        gl.vertexAttribPointer(iPos, 2, gl.FLOAT, false, 12, 0);
        gl.enableVertexAttribArray(iWeight);
        gl.vertexAttribPointer(iWeight, 1, gl.FLOAT, false, 12, 8);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.drawArrays(gl.POINTS, 0, heatCount);

        let maxWeight = 1;
        for (let i = 0; i < heatCount; i++) {
          const w = heatProjected[i * 3 + 2];
          if (w > maxWeight) maxWeight = w;
        }
        const normPeak = estimateNormPeak(heatCount, maxWeight);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, width, height);

        gl.useProgram(colorProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, intensityTarget.texture);
        gl.uniform1i(cIntensity, 0);
        gl.uniform2f(cTexSize, iw, ih);
        gl.uniform1f(cNorm, normPeak);

        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.enableVertexAttribArray(cCorner);
        gl.vertexAttribPointer(cCorner, 2, gl.FLOAT, false, 0, 0);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }

    if (dotPoints.length > 0) {
      projectDots(layout);
      if (dotCount > 0) {
        gl.useProgram(dotProgram);
        gl.uniform2f(dResolution, width, height);
        gl.uniform1f(dSize, dotSizeForZoom(zoom));

        gl.bindBuffer(gl.ARRAY_BUFFER, dotBuffer);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          dotProjected.subarray(0, dotCount * 2),
          gl.DYNAMIC_DRAW
        );
        gl.enableVertexAttribArray(dPos);
        gl.vertexAttribPointer(dPos, 2, gl.FLOAT, false, 0, 0);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.POINTS, 0, dotCount);
      }
    }
  }

  function scheduleRender() {
    if (rafId != null) return;
    rafId = requestAnimationFrame(render);
  }

  overlay.onAdd = function onAdd() {
    overlay.getPanes()?.overlayLayer?.appendChild(canvas);
    idleListener = map.addListener("idle", () => {
      showLayer();
      scheduleRender();
    });
    dragStartListener = map.addListener("dragstart", hideLayer);
    zoomListener = map.addListener("zoom_changed", hideLayer);
    scheduleRender();
  };

  overlay.draw = function draw() {
    updateLayout();
  };

  overlay.onRemove = function onRemove() {
    if (rafId != null) cancelAnimationFrame(rafId);
    idleListener?.remove();
    dragStartListener?.remove();
    zoomListener?.remove();
    canvas.parentNode?.removeChild(canvas);
    if (gl) {
      if (heatBuffer) gl.deleteBuffer(heatBuffer);
      if (dotBuffer) gl.deleteBuffer(dotBuffer);
      if (quadBuffer) gl.deleteBuffer(quadBuffer);
      if (intensityTarget) {
        gl.deleteFramebuffer(intensityTarget.fbo);
        gl.deleteTexture(intensityTarget.texture);
      }
      if (intensityProgram) gl.deleteProgram(intensityProgram);
      if (colorProgram) gl.deleteProgram(colorProgram);
      if (dotProgram) gl.deleteProgram(dotProgram);
    }
    gl = null;
    intensityTarget = null;
  };

  overlay.setHeatPoints = function setHeatPoints(next) {
    heatPoints = next || [];
    scheduleRender();
  };

  overlay.setDotPoints = function setDotPoints(next) {
    dotPoints = next || [];
    scheduleRender();
  };

  overlay.setPoints = function setPoints(next) {
    heatPoints = next || [];
    scheduleRender();
  };

  return overlay;
}

export function attachHeatmapWebGLOverlay(map, data) {
  const overlay = createHeatmapWebGLOverlay(map, data);
  overlay.setMap(map);
  return overlay;
}
