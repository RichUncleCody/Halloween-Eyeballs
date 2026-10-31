// GLSL for the eyeball. One full-screen pass: skin + lids + a shaded,
// rotating eyeball with a procedural iris, and a pile of supernatural modes
// (fire, frost, galaxy, spiral, void, eclipse...) driven by uniforms.

export const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const FRAG = `
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform float uInner;
uniform float uScale;
uniform vec2 uOffset;
uniform vec2 uGaze;
uniform float uUpper;
uniform float uLower;
uniform float uTilt;
uniform float uBlink;
uniform float uPupil;
uniform float uSeed;

uniform vec3 uSclera;
uniform float uVeins;
uniform vec3 uVeinColor;
uniform float uBlood;
uniform vec3 uIrisA;
uniform vec3 uIrisB;
uniform float uIrisGlow;
uniform float uLimbus;
uniform vec3 uPupilColor;
uniform float uPupilGlow;
uniform float uSlit;
uniform float uBar;
uniform vec3 uSkin;
uniform float uSkinAlpha;
uniform vec3 uKeyColor;
uniform float uKey;
uniform vec3 uKeyDir;
uniform float uAmbient;
uniform float uFire;
uniform vec3 uFireA;
uniform vec3 uFireB;
uniform float uFireIris;
uniform float uSpiral;
uniform vec3 uSpiralA;
uniform vec3 uSpiralB;
uniform float uGalaxy;
uniform float uMilky;
uniform float uFrost;
uniform float uEclipse;
uniform float uRainbow;
uniform float uHue;
uniform float uVoid;
uniform float uElectric;
uniform float uGlow;
uniform vec3 uGlowColor;
uniform float uVignette;
uniform float uGlitch;
uniform float uMany;
uniform float uManySync;
uniform float uGoogly;
uniform vec2 uGoogPos;
uniform float uMembrane;
uniform float uFade;

#define PI 3.14159265
const float IRIS = 0.49;
const float SIN_IRIS = 0.4706;

// ---------------------------------------------------------------- noise
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }

float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = hash13(i), b = hash13(i + vec3(1.0, 0.0, 0.0));
  float c = hash13(i + vec3(0.0, 1.0, 0.0)), d = hash13(i + vec3(1.0, 1.0, 0.0));
  float e = hash13(i + vec3(0.0, 0.0, 1.0)), f1 = hash13(i + vec3(1.0, 0.0, 1.0));
  float g = hash13(i + vec3(0.0, 1.0, 1.0)), h = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, f1, u.x), mix(g, h, u.x), u.y), u.z);
}
float fbm2(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * noise2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s;
}
float fbm3(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * noise3(p); p = p * 2.02 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s;
}

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

vec3 fireRamp(float t) {
  vec3 c = mix(vec3(0.0), uFireA * 0.7, smoothstep(0.0, 0.35, t));
  c = mix(c, uFireA, smoothstep(0.3, 0.55, t));
  c = mix(c, uFireB, smoothstep(0.5, 0.8, t));
  return mix(c, vec3(1.0, 0.97, 0.9), smoothstep(0.82, 1.0, t));
}

float stars(vec2 p, float density) {
  vec2 cell = floor(p);
  vec2 f = fract(p) - 0.5 - (hash22(cell) - 0.5) * 0.7;
  float h = hash12(cell + 7.3);
  float on = step(1.0 - density, h);
  float tw = 0.6 + 0.4 * sin(uTime * (1.5 + h * 3.0) + h * 40.0);
  return on * tw * smoothstep(0.09, 0.0, length(f)) * (0.4 + 0.6 * fract(h * 13.7));
}

float voronoiEdge(vec2 p) {
  vec2 n = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = hash22(n + g);
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return d2 - d1;
}

// ----------------------------------------------------------------- lids
vec2 lidCurves(float x) {
  float w = max(1.0 - x * x, 0.0);
  float yU = uUpper * pow(w, 0.62) * (1.0 - 0.10 * x * uInner);
  yU -= uTilt * w * (0.34 * x * uInner + 0.22 * (1.0 - abs(uInner)) * w);
  float yL = -uLower * pow(w, 0.78) * (1.0 + 0.07 * x * uInner);
  float yC = -0.10 * pow(w, 0.8);
  if (uGoogly > 0.001) {
    float g = sqrt(max(0.4356 - x * x, 0.0));
    yU = mix(yU, g, uGoogly);
    yL = mix(yL, -g, uGoogly);
    yC = mix(yC, 0.0, uGoogly);
  }
  yU = max(yU, yL);
  return vec2(mix(yU, yC, uBlink), mix(yL, yC, uBlink));
}

// ------------------------------------------------------------ many eyes
vec4 manyEyes(vec2 p) {
  vec2 g = p * 5.2 + vec2(uSeed * 1.37, uSeed * 0.71);
  g.x += step(1.0, mod(floor(g.y), 2.0)) * 0.5;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash12(id + 17.0), h2 = hash12(id + 91.0), h3 = hash12(id + 33.0);
  if (h2 < 0.28) return vec4(0.0);
  float sz = mix(0.17, 0.42, h * h);
  vec2 off = (hash22(id) - 0.5) * (0.9 - sz * 2.0);
  vec2 lp = (f - off) / sz;
  float rot = (h3 - 0.5) * 0.6;
  lp = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * lp;
  float appear = smoothstep(h3 * 0.5, h3 * 0.5 + 0.35, uMany);
  float ph = fract(uTime * (0.12 + 0.12 * h) + h2 * 7.0);
  float bl = smoothstep(0.0, 0.025, ph) * (1.0 - smoothstep(0.035, 0.07, ph));
  float open = appear * (1.0 - bl);
  float w = max(1.0 - lp.x * lp.x, 0.0);
  float yU = 0.5 * open * pow(w, 0.7);
  float yL = -0.42 * open * pow(w, 0.8);
  float m = smoothstep(0.0, 0.07, min(yU - lp.y, lp.y - yL)) * step(abs(lp.x), 1.0);
  vec2 wander = vec2(noise2(vec2(uTime * 0.35, h * 50.0)), noise2(vec2(uTime * 0.35 + 5.0, h * 50.0))) - 0.5;
  vec2 gz = mix(wander * 1.6, uGaze * 1.3, uManySync);
  vec2 ic = clamp(gz, -0.8, 0.8) * vec2(0.55, 0.4);
  float d = length(lp - ic);
  float ang = atan(lp.y - ic.y, lp.x - ic.x);
  vec3 c = vec3(0.9, 0.85, 0.78) * (1.0 - 0.6 * smoothstep(0.3, 1.0, length(lp)));
  vec3 iris = mix(uIrisB, uIrisA, smoothstep(0.44, 0.08, d)) * (0.6 + 0.6 * noise2(vec2(ang * 5.0, d * 9.0) + h * 20.0));
  c = mix(c, iris, smoothstep(0.46, 0.42, d));
  c = mix(c, vec3(0.01), smoothstep(0.19, 0.16, d));
  c += uIrisA * uIrisGlow * 0.5 * smoothstep(0.46, 0.2, d);
  c += vec3(0.9) * smoothstep(0.09, 0.0, length(lp - ic - vec2(-0.12, 0.14)));
  c *= mix(0.35, 1.0, smoothstep(0.0, 0.22, yU - lp.y));
  return vec4(c, m);
}

// ------------------------------------------------------------- eyeball
vec3 eyeball(vec2 e, float dTop, float dBot, float px) {
  float r2 = dot(e, e);
  float zq = sqrt(max(1.0 - r2, 0.0));
  vec3 n = r2 < 1.0 ? vec3(e, zq) : normalize(vec3(e, 0.0));

  float yaw = uGaze.x, pitch = uGaze.y;
  vec3 f = vec3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch));
  vec3 rt = normalize(vec3(f.z, 0.0, -f.x));
  vec3 up = cross(f, rt);
  vec3 loc = vec3(dot(n, rt), dot(n, up), dot(n, f));
  float th = acos(clamp(loc.z, -1.0, 1.0));
  float ir = th / IRIS;
  vec2 ip = loc.xy / SIN_IRIS;

  vec3 L = normalize(uKeyDir);
  float diff = max(dot(n, L), 0.0);
  vec3 lightC = vec3(uAmbient * 0.30) + uKeyColor * uKey * (0.22 + 0.78 * diff);

  // --- sclera
  vec3 sc = uSclera;
  sc = mix(sc, sc * vec3(0.97, 0.78, 0.74), smoothstep(IRIS * 1.3, 1.45, th) * 0.75);
  vec3 vp = loc * 4.2 + uSeed;
  vec3 wp = vec3(noise3(vp * 1.4), noise3(vp * 1.4 + 7.0), noise3(vp * 1.4 + 13.0)) - 0.5;
  float v1 = 1.0 - abs(noise3(vp + wp * 1.3) * 2.0 - 1.0);
  float v2 = 1.0 - abs(noise3(vp * 2.4 + wp * 2.2 + 3.0) * 2.0 - 1.0);
  float vmask = smoothstep(IRIS * mix(1.9, 1.02, uVeins), IRIS * mix(3.1, 1.5, uVeins), th);
  float veins = (pow(v1, 16.0) * 0.95 + pow(v2, 22.0) * 0.7) * vmask * (0.45 + 1.3 * uVeins);
  sc = mix(sc, uVeinColor, clamp(veins, 0.0, 1.0) * 0.9);
  if (uBlood > 0.001) {
    float bn = fbm3(loc * 3.0 + uSeed);
    sc = mix(sc, vec3(0.5, 0.03, 0.02) * (0.55 + 0.7 * bn), uBlood * smoothstep(0.25, 0.6, bn + uBlood * 0.45));
  }
  if (uGalaxy > 0.001) {
    vec3 sp = vec3(0.02, 0.02, 0.07) + vec3(0.12, 0.05, 0.22) * fbm3(loc * 3.0 + uTime * 0.05);
    sp += vec3(stars(loc.xy * 40.0 + loc.z * 13.0, 0.08));
    sc = mix(sc, sp, uGalaxy);
  }

  // --- pupil shape
  float pupilR = mix(uPupil, 0.97, uEclipse);
  float sx = mix(1.0, 4.2, uSlit) * mix(1.0, 0.62, uBar);
  float sy = mix(1.0, 0.66, uSlit) * mix(1.0, 2.7, uBar);
  float k = mix(2.0, 3.6, uBar);
  float pd = pow(pow(abs(ip.x * sx), k) + pow(abs(ip.y * sy), k), 1.0 / k);
  float aaI = 2.0 * px / SIN_IRIS;
  float pupilM = smoothstep(pupilR + aaI, pupilR - aaI, pd);

  // --- iris
  float rr = clamp((ir - pupilR * 0.92) / max(1.0 - pupilR * 0.92, 0.05), 0.0, 1.0);
  float ang = atan(ip.y, ip.x);
  vec2 cs = vec2(cos(ang), sin(ang));
  float f1 = noise3(vec3(cs * 15.0, rr * 2.2 + uSeed));
  float f2 = noise3(vec3(cs * 44.0, rr * 4.5 + uSeed + 5.0));
  float fib = f1 * 0.6 + f2 * 0.4;
  float crypt = smoothstep(0.66, 0.86, noise3(vec3(cs * 9.0, rr * 5.0 + uSeed + 9.0))) * smoothstep(0.15, 0.4, rr) * (1.0 - smoothstep(0.7, 0.95, rr));
  float collR = 0.3 + 0.08 * (noise3(vec3(cs * 4.0, uSeed + 2.0)) - 0.5);
  float collar = exp(-pow((rr - collR) / 0.06, 2.0));
  vec3 ic = mix(uIrisA, uIrisB, smoothstep(0.16, 0.78, rr + (fib - 0.5) * 0.3));
  ic *= 0.45 + 1.05 * fib;
  ic = mix(ic, uIrisA * 1.3, collar * 0.45);
  ic *= 1.0 - crypt * 0.35;
  ic *= mix(1.0, 0.5, 1.0 - smoothstep(0.0, 0.12, rr));
  ic *= mix(1.0, 0.15, smoothstep(0.8, 1.0, ir) * uLimbus);
  vec3 iEmit = ic * uIrisGlow;

  if (uFireIris > 0.001) {
    float fl = fbm3(vec3(cs * 2.6, rr * 2.4 - uTime * 1.5));
    fl = clamp(fl * 1.6 - 0.2 + (1.0 - rr) * 0.4, 0.0, 1.0);
    vec3 fc = fireRamp(fl);
    ic = mix(ic, fc * 0.5, uFireIris);
    iEmit = mix(iEmit, fc * 1.3, uFireIris);
  }
  if (uSpiral > 0.001) {
    float s = sin(ang * 3.0 + log(max(ir, 0.03)) * 9.0 - uTime * 4.0);
    vec3 spc = mix(uSpiralA, uSpiralB, smoothstep(-0.3, 0.3, s));
    ic = mix(ic, spc * 0.4, uSpiral);
    iEmit = mix(iEmit, spc, uSpiral);
  }
  if (uGalaxy > 0.001) {
    float a2 = ang - uTime * 0.25;
    float arms = 0.5 + 0.5 * sin(2.0 * a2 + log(max(ir, 0.04)) * 6.0);
    vec2 gq = vec2(cos(a2), sin(a2)) * ir * 3.0;
    float neb = fbm2(gq + uSeed);
    vec3 gc = mix(vec3(0.04, 0.02, 0.14), vec3(0.42, 0.16, 0.7), neb) * (0.4 + 0.9 * arms);
    gc += vec3(1.0, 0.55, 0.85) * pow(neb, 3.0) * arms * 1.5;
    gc += vec3(stars(ip * 26.0 + floor(uTime * 0.0), 0.1)) * 1.5;
    gc += vec3(1.0, 0.85, 0.6) * exp(-max(ir - pupilR, 0.0) * 9.0) * 0.6;
    ic = mix(ic, gc * 0.3, uGalaxy);
    iEmit = mix(iEmit, gc, uGalaxy);
  }
  if (uRainbow > 0.001) {
    float hue = fract(ang / (2.0 * PI) * 2.0 + rr * 0.7 - uTime * 0.12 + uHue);
    vec3 rc = hsv2rgb(vec3(hue, 0.85, 1.0)) * (0.45 + 0.85 * fib);
    ic = mix(ic, rc * 0.5, uRainbow);
    iEmit = mix(iEmit, rc * 0.85, uRainbow);
  }
  if (uElectric > 0.001) {
    float arc = 1.0 - abs(noise3(vec3(cs * 3.0, rr * 3.0 + uTime * 6.0)) * 2.0 - 1.0);
    float arc2 = 1.0 - abs(noise3(vec3(cs * 7.0, rr * 5.0 - uTime * 9.0) + 4.0) * 2.0 - 1.0);
    vec3 ec = vec3(0.6, 0.88, 1.0) * (pow(arc, 12.0) * 2.2 + pow(arc2, 18.0) * 1.5);
    ic = mix(ic, vec3(0.08, 0.25, 0.6) * (0.5 + fib), uElectric * 0.85);
    iEmit += ec * uElectric;
  }
  if (uMilky > 0.001) {
    float m = 0.72 + 0.25 * fbm2(ip * 3.5 + uSeed);
    ic = mix(ic, vec3(0.74, 0.76, 0.73) * m, uMilky * 0.88);
    iEmit *= 1.0 - uMilky;
  }

  // --- pupil colour / glow
  vec3 pc = uPupilColor;
  vec3 pEmit = uPupilColor * uPupilGlow;
  pc = mix(pc, vec3(0.46, 0.48, 0.47), uMilky * 0.75);
  pEmit *= 1.0 - uMilky * 0.8;

  float irisM = smoothstep(1.035, 0.965, ir);
  vec3 alb = mix(sc, ic, irisM);
  alb = mix(alb, pc, pupilM);
  vec3 emit = iEmit * irisM * (1.0 - pupilM) + pEmit * pupilM;

  if (uVoid > 0.001) {
    alb = mix(alb, vec3(0.004), uVoid * (1.0 - pupilM));
    emit *= 1.0 - uVoid * (1.0 - pupilM);
  }
  if (uGalaxy > 0.001) {
    emit += vec3(1.0, 0.72, 0.45) * exp(-abs(pd - pupilR) * 28.0) * uGalaxy * 1.3;
  }
  if (uEclipse > 0.001) {
    float rays = fbm3(vec3(cs * 4.0, uTime * 0.45));
    float outside = max(pd - pupilR, 0.0);
    float corona = exp(-outside * mix(26.0, 6.0, rays * rays)) * (1.0 - pupilM);
    alb = mix(alb, alb * 0.12, uEclipse * (1.0 - pupilM));
    emit += mix(vec3(1.0, 0.5, 0.15), vec3(1.0, 0.95, 0.8), corona) * corona * uEclipse * 2.2;
  }

  // --- lighting
  vec3 col = alb * lightC;
  float ao = mix(0.22, 1.0, smoothstep(1.0, 0.42, sqrt(r2)));
  float lidSh = mix(0.3, 1.0, smoothstep(0.0, 0.17, dTop)) * mix(0.62, 1.0, smoothstep(0.0, 0.06, dBot));
  col *= ao * lidSh;
  col += emit * mix(0.55, 1.0, lidSh);

  // --- cornea: a smaller sphere bulging over the iris
  vec3 cc = f * 0.4;
  vec2 dq = e - cc.xy;
  float disc = 0.4536 - dot(dq, dq);
  vec3 nc = n;
  float onC = 0.0;
  if (disc > 0.0) {
    float zc = cc.z + sqrt(disc);
    if (zc > zq) { nc = normalize(vec3(e, zc) - cc); onC = smoothstep(0.0, 0.05, zc - zq); }
  }
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(nc, H), 0.0), 260.0) * mix(0.35, 1.7, onC);
  float sheen = pow(max(dot(n, H), 0.0), 60.0) * 0.05;
  vec3 R = reflect(vec3(0.0, 0.0, -1.0), nc);
  vec2 w = (R.xy - vec2(-0.34, 0.44)) / vec2(0.21, 0.16);
  float win = smoothstep(1.0, 0.7, max(abs(w.x), abs(w.y)));
  win *= 1.0 - 0.75 * clamp(smoothstep(0.07, 0.02, abs(w.x)) + smoothstep(0.07, 0.02, abs(w.y)), 0.0, 1.0);
  col += uKeyColor * uKey * (spec + sheen + win * 0.32 * onC) * lidSh;
  col += vec3(0.05) * pow(1.0 - clamp(nc.z, 0.0, 1.0), 3.0) * uKey;

  // --- nictitating membrane (sweeps in from the inner corner)
  if (uMembrane > 0.001) {
    float dir = abs(uInner) > 0.5 ? uInner : 1.0;
    float xm = e.x * dir;
    float edge = 1.05 - 2.3 * uMembrane + 0.5 * e.y * e.y;
    float m = smoothstep(edge - 0.04, edge + 0.04, xm);
    vec3 mc = vec3(0.7, 0.66, 0.55) * (0.8 + 0.3 * noise2(e * 12.0)) * lightC;
    col = mix(col, mc + emit * 0.25, m * 0.8);
  }

  // --- googly mode: a flat plastic disc with a loose black pupil
  if (uGoogly > 0.001) {
    float rg = length(e) / 0.66;
    vec3 g = vec3(0.97) * (1.0 - 0.28 * smoothstep(0.55, 1.0, rg));
    float pg = length(e - uGoogPos);
    g = mix(g, vec3(0.015), smoothstep(0.335 + px, 0.335 - px, pg));
    g += vec3(1.0) * smoothstep(0.14, 0.0, length((e - vec2(-0.26, 0.3)) * vec2(1.0, 1.4))) * 0.9;
    g += vec3(0.5) * smoothstep(0.04, 0.0, abs(rg - 0.94)) * 0.35;
    col = mix(col, g * (0.45 + 0.55 * uKey * uKeyColor), uGoogly);
  }
  return col;
}

// ----------------------------------------------------------------- skin
vec3 skinShade(vec2 p, vec2 e, float dTop, float dBot, float open) {
  float up = max(-dTop, 0.0);
  float lo = max(-dBot, 0.0);
  float inCorner = (1.0 - smoothstep(0.84, 1.0, abs(e.x))) * (1.0 - uGoogly);
  float aboveU = step(dTop, 0.0) * step(0.0, e.y + 0.02);
  float belowL = step(dBot, 0.0) * step(e.y, 0.02);

  float wr = fbm2(vec2(e.x * 2.4, e.y * 6.5) + uSeed);
  float fine = noise2(vec2(e.x * 7.0, e.y * 26.0) + uSeed * 3.0);
  float pores = noise2(p * 160.0);
  vec3 c = uSkin * (0.55 + 0.55 * wr + 0.12 * fine + 0.06 * pores);

  // upper lid is a rounded fold that catches light; crease above it
  float bulgeU = smoothstep(0.0, 0.05, up) * exp(-up * 5.0) * aboveU;
  float bulgeL = smoothstep(0.0, 0.04, lo) * exp(-lo * 8.0) * belowL;
  c *= 0.62 + (0.75 * bulgeU + 0.4 * bulgeL) * inCorner;
  float w = max(1.0 - e.x * e.x, 0.0);
  float creaseY = (uUpper + 0.22) * pow(w, 0.6);
  float crease = exp(-pow((e.y - creaseY) / 0.05, 2.0)) * step(0.0, e.y) * aboveU * smoothstep(0.0, 0.3, w);
  c *= 1.0 - 0.55 * crease;
  // moist, flesh-coloured lid margins
  float mU = (1.0 - smoothstep(0.0, 0.032, up)) * aboveU;
  float mL = (1.0 - smoothstep(0.0, 0.026, lo)) * belowL;
  vec3 rim = uSkin * vec3(1.9, 1.05, 0.95) + vec3(0.035, 0.0, 0.0);
  c = mix(c, rim, max(mU, mL) * 0.75 * inCorner);
  c += vec3(0.6) * exp(-pow((lo - 0.008) / 0.005, 2.0)) * belowL * 0.18 * inCorner;
  c *= mix(1.0, 0.55, exp(-up * 40.0) * aboveU * (1.0 - mU));

  // light
  vec3 nrm = normalize(vec3(e.x * 0.25, clamp(e.y * 1.4, -1.0, 1.0), 1.0));
  float diff = max(dot(nrm, normalize(uKeyDir)), 0.0);
  c *= vec3(uAmbient * 0.3) + uKeyColor * uKey * (0.22 + 0.6 * diff);

  // falloff into darkness around the eye
  float d = length(e * vec2(0.8, 1.3));
  c *= smoothstep(1.7, 0.5, d);

  if (uGalaxy > 0.001) {
    vec3 space = vec3(0.005, 0.0, 0.02);
    float neb = fbm2(p * 2.2 + vec2(uTime * 0.01, 0.0) + uSeed);
    space += mix(vec3(0.05, 0.0, 0.12), vec3(0.25, 0.05, 0.3), neb) * smoothstep(0.35, 0.85, neb);
    space += vec3(0.1, 0.25, 0.5) * pow(fbm2(p * 4.0 - uSeed), 4.0);
    space += vec3(stars(p * 90.0, 0.08) + stars(p * 210.0 + 3.0, 0.15) * 0.6);
    c = mix(c, space, uGalaxy);
  }
  if (uSpiral > 0.001) {
    float rings = sin(length(p - uOffset) * 34.0 - uTime * 5.0 + atan(p.y, p.x) * 1.0);
    c += uSpiralB * smoothstep(0.6, 1.0, rings) * 0.16 * uSpiral;
  }
  c += uGlowColor * uGlow * exp(-max(-open, 0.0) * 4.5) * 0.85;
  c += uIrisA * uIrisGlow * 0.18 * exp(-max(-open, 0.0) * 14.0);
  return c;
}

// --------------------------------------------------------------- layers
vec4 fireLayer(vec2 p, float open, float inside) {
  vec2 fp = vec2(p.x * 2.4, p.y * 1.6 - uTime * 1.4);
  float n1 = fbm2(fp + uSeed);
  float n2 = fbm2(fp * 2.0 + vec2(n1 * 1.7, -uTime * 0.9));
  float h = p.y + 0.5;
  float around = exp(-max(-open, 0.0) * 9.0) * 0.45 * (0.5 + n1);
  float shape = smoothstep(0.28, 0.78, n2) * 1.15 - h * 1.75 + 0.18 + around;
  float t = clamp(shape * 1.25 * uFire, 0.0, 1.0);
  float a = smoothstep(0.04, 0.3, t) * (1.0 - inside * 0.92);
  return vec4(fireRamp(t * 0.82), a);
}

vec4 frostLayer(vec2 p, float inside) {
  float aspect = uRes.x / uRes.y;
  float bd = min(0.5 * aspect - abs(p.x), 0.5 - abs(p.y));
  float reach = uFrost * 0.3;
  float n = fbm2(p * 6.5 + uSeed);
  float m = smoothstep(reach + 0.03, reach - 0.12, bd + (n - 0.5) * 0.3);
  vec2 q = p * 13.0 + vec2(fbm2(p * 4.0 + uSeed), fbm2(p * 4.0 + 3.0)) * 3.0;
  float r1 = pow(1.0 - abs(noise2(q) * 2.0 - 1.0), 10.0);
  float r2 = pow(1.0 - abs(noise2(q * 2.3 + 5.0) * 2.0 - 1.0), 14.0);
  float ve = smoothstep(0.05, 0.0, voronoiEdge(p * 7.0 + n * 2.0)) * 0.3;
  vec3 fc = vec3(0.7, 0.85, 1.0) * (0.2 + 0.4 * n) + vec3(0.93, 0.97, 1.0) * (r1 * 0.75 + r2 * 0.5 + ve);
  float a = m * (0.5 + 0.45 * clamp(r1 + r2 + ve, 0.0, 1.0)) * (1.0 - inside * 0.35);
  return vec4(fc, a);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 p = (frag - 0.5 * uRes) / uRes.y;
  float band = 0.0;
  if (uGlitch > 0.001) {
    float t = floor(uTime * 14.0);
    float b = floor(p.y * 22.0 + hash11(t) * 7.0);
    band = step(1.0 - 0.42 * uGlitch, hash12(vec2(b, t)));
    p.x += band * (hash12(vec2(b, t + 3.0)) - 0.5) * 0.32 * uGlitch;
    p.y += (hash11(t * 1.7) - 0.5) * 0.02 * uGlitch;
  }
  vec2 e = (p - uOffset) / uScale;
  float px = 1.0 / (uRes.y * uScale);

  float dx = 0.004;
  vec2 Y = lidCurves(e.x);
  vec2 sl = (lidCurves(e.x + dx) - lidCurves(e.x - dx)) / (2.0 * dx);
  float dTop = (Y.x - e.y) / sqrt(1.0 + sl.x * sl.x);
  float dBot = (e.y - Y.y) / sqrt(1.0 + sl.y * sl.y);
  float open = min(dTop, dBot);
  float inside = smoothstep(0.0, 2.0 * px, open) * step(abs(e.x), 1.0);
  // continuous (if rough) distance to the opening, for glows
  float openV = min(Y.x - e.y, e.y - Y.y) - max(abs(e.x) - 1.0, 0.0) * 0.8;

  vec3 col = skinShade(p, e, Y.x - e.y, e.y - Y.y, openV);
  if (inside > 0.0) col = mix(col, eyeball(e, dTop, dBot, px), inside);

  if (uMany > 0.001) {
    vec4 me = manyEyes(p);
    col = mix(col, me.rgb, me.a * (1.0 - inside));
  }
  if (uFire > 0.001) {
    vec4 fl = fireLayer(p, openV, inside);
    col = mix(col, fl.rgb, fl.a);
  }
  if (uElectric > 0.001) {
    float a1 = 1.0 - abs(noise2(p * 4.5 + vec2(uTime * 2.7, uSeed)) * 2.0 - 1.0);
    float a2 = 1.0 - abs(noise2(p * 7.0 - vec2(uSeed, uTime * 3.3)) * 2.0 - 1.0);
    float flick = step(0.35, hash11(floor(uTime * 9.0)));
    float arcs = (pow(a1, 40.0) + pow(a2, 50.0)) * flick * (1.0 - inside * 0.6);
    col += vec3(0.55, 0.82, 1.0) * arcs * uElectric * 1.6;
  }
  if (uFrost > 0.001) {
    vec4 fr = frostLayer(p, inside);
    col = mix(col, fr.rgb, fr.a);
  }

  float vig = smoothstep(1.3, 0.22, length(p * vec2(0.62, 1.0)));
  col *= mix(1.0, vig, uVignette);
  col *= 1.0 - uFade;

  if (uGlitch > 0.001) {
    col += (hash12(frag + fract(uTime * 7.0) * 100.0) - 0.5) * 0.28 * uGlitch;
    col *= 1.0 - 0.2 * uGlitch * step(0.5, fract(frag.y * 0.5));
    col.rb += band * uGlitch * vec2(0.18, -0.06);
  }

  vec3 over = max(col - 0.8, 0.0);
  col = min(col, vec3(0.8)) + over / (1.0 + over / 0.2);
  col += (hash12(frag) - 0.5) / 255.0;
  float a = mix(uSkinAlpha, 1.0, inside);
  gl_FragColor = vec4(max(col, 0.0) * a, a);
}
`;
