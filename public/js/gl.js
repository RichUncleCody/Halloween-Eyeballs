// Thin WebGL wrapper: one full-screen triangle, uniforms set from a flat object.

import { VERT, FRAG } from './shader.js';

export class EyeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.scale = 1;
    this.maxPixels = 2.4e6;
    this.lost = false;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.init(); });
    this.init();
  }

  init() {
    const opts = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
    const gl = this.canvas.getContext('webgl2', opts) || this.canvas.getContext('webgl', opts);
    if (!gl) throw new Error('WebGL is not available in this browser');
    this.gl = gl;
    const prog = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]]) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error('Shader compile failed: ' + gl.getShaderInfoLog(sh));
      }
      gl.attachShader(prog, sh);
    }
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('Shader link failed: ' + gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    this.prog = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.locs = {};
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i);
      this.locs[info.name] = { loc: gl.getUniformLocation(prog, info.name), type: info.type };
    }
  }

  resize() {
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = c.clientWidth * dpr * this.scale;
    let h = c.clientHeight * dpr * this.scale;
    const px = w * h;
    if (px > this.maxPixels) { const k = Math.sqrt(this.maxPixels / px); w *= k; h *= k; }
    w = Math.max(16, Math.round(w)); h = Math.max(16, Math.round(h));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return [w, h];
  }

  render(u) {
    if (this.lost) return;
    const gl = this.gl;
    const [w, h] = this.resize();
    gl.viewport(0, 0, w, h);
    u.res = [w, h];
    for (const k in u) {
      const name = 'u' + k[0].toUpperCase() + k.slice(1);
      const l = this.locs[name];
      if (!l) continue;
      const v = u[k];
      if (typeof v === 'number') gl.uniform1f(l.loc, v);
      else if (v.length === 2) gl.uniform2f(l.loc, v[0], v[1]);
      else if (v.length === 3) gl.uniform3f(l.loc, v[0], v[1], v[2]);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
