// GLSL for Lantern Valley. One shared atmosphere (sky tone, fog, grade) so the
// ground melts into the sky and every material agrees on light and colour.
// Every animated input is a uniform set from world time; shaders keep no state.

export const LIGHT_COUNT = 6;

export const COMMON = /* glsl */ `
uniform float uTime;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uHalo;
uniform vec3 uDuskColor;
uniform vec3 uDuskDir;
uniform float uDusk;
uniform float uFogDensity;
uniform float uFogBoost;
uniform float uFogFalloff;
uniform float uFarFog;
uniform float uExposure;
uniform vec2 uResolution;
uniform vec3 uLightPos[${LIGHT_COUNT}];
uniform vec3 uLightCol[${LIGHT_COUNT}];

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm3(vec2 p) {
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  float s = 0.5 * vnoise(p);
  p = m * p;
  s += 0.25 * vnoise(p);
  p = m * p;
  s += 0.125 * vnoise(p);
  return s / 0.875;
}

float fbm4(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = m * p;
    a *= 0.5;
  }
  return s / 0.9375;
}

// The sky's gradient with a broad glow toward the moon: the colour of the fog,
// and what the water reflects.
vec3 skyGradient(vec3 dir) {
  float e = dir.y;
  vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.03, 0.85, e), 0.6));
  float c = max(dot(dir, uMoonDir), 0.0);
  col += uHalo * pow(c, 12.0) * 0.16;
  vec2 hd = normalize(dir.xz + vec2(1e-5));
  float dusk = max(dot(hd, normalize(uDuskDir.xz)), 0.0);
  col += uDuskColor * uDusk * pow(dusk, 3.0) * exp(-max(e, 0.0) * 7.0);
  return col;
}

// The full sky tone without clouds or the disc: adds the moon's tight glow.
vec3 skyBase(vec3 dir) {
  float c = max(dot(dir, uMoonDir), 0.0);
  return skyGradient(dir) + uHalo * pow(c, 60.0) * 0.4 + uMoonColor * pow(c, 260.0) * 0.55;
}

// Cloud cover in a direction (0..1). Shared by the sky and the stars.
float cloudCover(vec3 dir) {
  if (dir.y <= 0.0) return 0.0;
  vec2 uv = dir.xz / (dir.y + 0.16);
  uv = uv * 0.5 + vec2(uTime * 0.0105, uTime * 0.0042) + vec2(3.7, 1.3);
  float n = fbm3(uv);
  float cover = smoothstep(0.5, 0.7, n);
  // a clear window around the moon
  float c = dot(dir, uMoonDir);
  cover *= mix(0.25, 1.0, smoothstep(0.9965, 0.975, c));
  return cover * smoothstep(0.0, 0.14, dir.y);
}

float fogAmount(vec3 wp) {
  vec3 d = wp - cameraPosition;
  float L = length(d);
  float y0 = max(cameraPosition.y, 0.0);
  float y1 = max(wp.y, 0.0);
  float h0 = exp(-y0 / uFogFalloff);
  float h1 = exp(-y1 / uFogFalloff);
  float dy = y1 - y0;
  float avg = abs(dy) > 0.05 ? uFogFalloff * (h0 - h1) / dy : h0;
  float tau = L * (uFogDensity + uFogBoost * clamp(avg, 0.0, 1.0));
  // far away the air thickens fast, so the edge of the world is never seen
  float far = max(L - 900.0, 0.0) * 0.0012 * uFarFog;
  return 1.0 - exp(-tau - far * far);
}

vec3 fogTone(vec3 wp) {
  vec3 dir = normalize(wp - cameraPosition);
  dir.y = max(dir.y, 0.0) * 0.6;
  return skyGradient(normalize(dir));
}

vec3 applyFog(vec3 col, vec3 wp) {
  return mix(col, fogTone(wp), fogAmount(wp));
}

vec3 warmLight(vec3 wp, vec3 n) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < ${LIGHT_COUNT}; i++) {
    vec3 d = uLightPos[i] - wp;
    float r2 = dot(d, d);
    if (r2 > 3600.0) continue;
    float window = 1.0 - r2 / 3600.0;
    float att = window * window / (1.0 + r2 * 0.06);
    float nl = max(dot(n, d * inversesqrt(r2 + 1e-4)), 0.0) * 0.75 + 0.25;
    sum += uLightCol[i] * att * nl;
  }
  return sum;
}
`;

// Fragment-only helpers (gl_FragCoord).
export const FRAG_COMMON = /* glsl */ `
float vignette() {
  vec2 q = gl_FragCoord.xy / uResolution - 0.5;
  q.x *= uResolution.x / uResolution.y;
  return 1.0 - 0.38 * smoothstep(0.25, 1.05, length(q));
}

vec3 tonemap(vec3 c) {
  c *= uExposure;
  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
}

vec3 grade(vec3 c) {
  vec3 g = tonemap(c) * vignette();
  // gentle cool lift in the shadows
  g += vec3(0.004, 0.009, 0.018) * (1.0 - g);
  g += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  return g;
}

`;

// ---------------------------------------------------------------------------
// Faceted world material (terrain, trees, houses, stones, bridge, mountains).

export const WORLD_VERT = /* glsl */ `
uniform float uMoonLight;
uniform vec3 uHemiSky;
uniform vec3 uHemiGround;
uniform float uRim;
varying vec3 vColor;
// Faces are flat (every vertex of a triangle carries the face normal), so lighting
// and fog are evaluated per vertex: identical facets, a fraction of the fill cost
// in software GL.
void main() {
  vec4 p = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    n = mat3(instanceMatrix) * n;
  #endif
  vec4 wp = modelMatrix * p;
  n = normalize(mat3(modelMatrix) * n);
  vec3 toCam = cameraPosition - wp.xyz;
  // face the viewer: exact for planar faces, so winding never matters
  if (dot(n, toCam) < 0.0) n = -n;
  vec3 v = normalize(toCam);
  vec3 albedo = vec3(1.0);
  #ifdef USE_COLOR
    albedo *= color.rgb;
  #endif
  #ifdef USE_INSTANCING_COLOR
    albedo *= instanceColor;
  #endif
  float ndl = max(dot(n, uMoonDir), 0.0);
  vec3 hemi = mix(uHemiGround, uHemiSky, n.y * 0.5 + 0.5);
  // a soft moonlit rim on faces turned away from the viewer, toward the moon
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * max(dot(-v, uMoonDir) * 0.5 + 0.5, 0.0) * uRim;
  vec3 light = hemi + uMoonColor * (uMoonLight * ndl + rim) + warmLight(wp.xyz, n);
  vColor = applyFog(albedo * light, wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const WORLD_FRAG = /* glsl */ `
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(grade(vColor), 1.0);
}
`;

// Self-lit warm surfaces: windows, lantern paper.
export const EMISSIVE_VERT = /* glsl */ `
uniform vec3 uGlow;
uniform float uGradient;
varying vec3 vColor;
void main() {
  vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
  #endif
  vec4 wp = modelMatrix * p;
  vec3 c = uGlow;
  #ifdef USE_COLOR
    c *= color.rgb;
  #endif
  #ifdef USE_INSTANCING_COLOR
    c *= instanceColor;
  #endif
  // lantern paper is brightest near the flame at the bottom
  c *= mix(1.0, mix(1.35, 0.55, clamp(position.y + 0.5, 0.0, 1.0)), uGradient);
  vColor = applyFog(c, wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const EMISSIVE_FRAG = /* glsl */ `
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(grade(vColor), 1.0);
}
`;

// ---------------------------------------------------------------------------
// Sky dome: gradient, moon, drifting clouds.

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 wp = vec4(position + cameraPosition, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w;
}
`;

export const SKY_FRAG = /* glsl */ `
uniform float uMoonRadius;
uniform float uPixelAngle;
uniform vec3 uMeteorHead;
uniform vec3 uMeteorTail;
uniform float uMeteorGlow;
uniform vec3 uMoonDisc;
uniform vec3 uCloudDark;
uniform vec3 uCloudLit;
varying vec3 vDir;
void main() {
  vec3 dir = normalize(vDir);
  vec3 col = skyBase(dir);

  // the moon
  float c = clamp(dot(dir, uMoonDir), -1.0, 1.0);
  float edge = uPixelAngle * 1.2;
  if (c > cos(uMoonRadius + edge)) {
    float disc = 1.0 - smoothstep(uMoonRadius - edge, uMoonRadius + edge, acos(c));
    vec3 right = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, uMoonDir);
    vec2 mp = vec2(dot(dir, right), dot(dir, up)) / sin(uMoonRadius);
    float r2 = clamp(dot(mp, mp), 0.0, 1.0);
    float limb = sqrt(1.0 - r2);
    float maria = fbm4(mp * 1.7 + vec2(4.1, 2.3));
    float shade = 1.0 - 0.3 * smoothstep(0.46, 0.66, maria) - 0.08 * smoothstep(0.6, 0.8, fbm4(mp * 4.0 + 9.0));
    vec3 m = uMoonDisc * shade * mix(0.78, 1.0, pow(limb, 0.35));
    col = mix(col, m, disc);
  }

  // a shooting star: a thin streak along a great circle, brightest at its head
  if (uMeteorGlow > 0.0) {
    vec3 axis = normalize(cross(uMeteorTail, uMeteorHead));
    float off = abs(dot(dir, axis));
    float span = acos(clamp(dot(uMeteorTail, uMeteorHead), -1.0, 1.0));
    float along = acos(clamp(dot(uMeteorTail, dir), -1.0, 1.0)) / max(span, 1e-4);
    bool between = dot(cross(uMeteorTail, dir), axis) > 0.0 && dot(cross(dir, uMeteorHead), axis) > 0.0;
    float w = uPixelAngle * 1.1;
    float streak = between ? exp(-(off * off) / (w * w)) * along * along : 0.0;
    float head = exp(-pow(acos(clamp(dot(dir, uMeteorHead), -1.0, 1.0)) / (w * 2.2), 2.0));
    col += vec3(0.85, 0.92, 1.0) * uMeteorGlow * (streak * 1.6 + head * 2.4);
  }

  // clouds
  float cover = cloudCover(dir);
  if (cover > 0.0) {
    vec2 uv = dir.xz / (dir.y + 0.16);
    uv = uv * 0.5 + vec2(uTime * 0.0105, uTime * 0.0042) + vec2(3.7, 1.3);
    float thick = vnoise(uv * 2.3 + 7.0) * 0.65 + vnoise(uv * 5.1 + 3.0) * 0.35;
    float nearMoon = pow(max(c, 0.0), 96.0);
    float edgeLight = (1.0 - smoothstep(0.0, 0.85, cover));
    vec3 cloud = mix(uCloudDark, uCloudLit, 0.2 + 0.4 * thick);
    // moonlight catches the thin edges of clouds near the moon
    cloud += uMoonColor * nearMoon * (0.08 + 0.5 * edgeLight);
    cloud += uHalo * pow(max(c, 0.0), 8.0) * 0.05;
    col = mix(col, cloud, cover * 0.92);
  }
  gl_FragColor = vec4(grade(col), 1.0);
}
`;

// ---------------------------------------------------------------------------
// Stars: crisp pixel points; the brightest draw as tiny pixel sparkles.

export const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aBright;
attribute float aPhase;
attribute float aSpark;
attribute float aAppear;
uniform float uPixelScale;
uniform float uNight;
varying float vBright;
varying float vSpark;
varying float vSize;
void main() {
  vec3 dir = normalize(position);
  vec4 wp = vec4(cameraPosition + dir * 2600.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w * 0.99999;
  float tw = 0.72 + 0.28 * sin(uTime * (0.9 + aPhase * 1.7) + aPhase * 40.0);
  float cloud = cloudCover(dir);
  float moon = smoothstep(0.995, 0.93, dot(dir, uMoonDir));
  float horizon = smoothstep(0.02, 0.22, dir.y);
  float appear = smoothstep(aAppear, aAppear + 0.25, uNight);
  vBright = aBright * tw * (1.0 - cloud) * moon * horizon * appear;
  float s = floor(aSize * uPixelScale + 0.5);
  vSpark = (aSpark > 0.5 && s >= 4.0) ? 1.0 : 0.0;
  vSize = max(s, 1.0);
  gl_PointSize = vSize;
}
`;

export const STAR_FRAG = /* glsl */ `
varying float vBright;
varying float vSpark;
varying float vSize;
void main() {
  if (vBright < 0.003) discard;
  float b = vBright;
  if (vSpark > 0.5) {
    vec2 p = abs(floor(gl_PointCoord * vSize) - floor(vSize * 0.5));
    float arm = (p.x < 0.5 || p.y < 0.5) ? 1.0 : 0.0;
    float centre = (p.x < 0.5 && p.y < 0.5) ? 1.0 : (max(p.x, p.y) < 1.5 ? 0.55 : 0.3);
    b *= arm * centre;
    if (b <= 0.0) discard;
  }
  vec3 col = vec3(0.88, 0.92, 1.0) * min(b * 1.35, 1.0);
  gl_FragColor = vec4(col * vignette(), 1.0);
}
`;

// ---------------------------------------------------------------------------
// Glows: camera-facing soft lights for lanterns, windows and fireflies.
// uMirror = 1 draws the same lights as reflections lying on the water.

export const GLOW_VERT = /* glsl */ `
attribute vec2 corner;
attribute vec3 iPos;
attribute float iSize;
attribute vec3 iColor;
uniform float uMinPx;
uniform float uMirror;
uniform float uLift;
uniform float uFadeDist;
varying vec2 vUv;
varying vec3 vColor;
void main() {
  vec3 colr = iColor * (1.0 - fogAmount(iPos));
  float camDist = length(iPos - cameraPosition);
  colr *= 1.0 - smoothstep(uFadeDist * 0.6, uFadeDist, camDist);
  vUv = corner;
  if (uMirror > 0.5) {
    // the light's reflection, lying flat on the water where the mirrored ray meets it
    vec3 m = vec3(iPos.x, -iPos.y, iPos.z);
    vec3 d = m - cameraPosition;
    vec3 w = cameraPosition + d * (cameraPosition.y / max(cameraPosition.y - m.y, 1e-3));
    vec2 flat2 = w.xz - cameraPosition.xz;
    float horiz = max(length(flat2), 1e-3);
    vec3 fwd = vec3(flat2.x, 0.0, flat2.y) / horiz;
    vec3 side = vec3(-fwd.z, 0.0, fwd.x);
    float width = iSize * length(w - cameraPosition) / max(length(d), 1e-3);
    vec4 mc = viewMatrix * vec4(w, 1.0);
    float pxPerUnit = projectionMatrix[1][1] * uResolution.y * 0.5 / max(-mc.z, 0.05);
    float grow = max(1.0, uMinPx / max(width * pxPerUnit, 1e-4));
    width *= grow;
    colr /= grow * grow;
    float sinA = cameraPosition.y / length(w - cameraPosition);
    float len = min(width * 2.2 / max(sinA, 0.02), horiz * 0.6);
    vec3 p = w + side * corner.x * width + fwd * corner.y * len;
    p.y = 0.03;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    vColor = colr * 0.24;
    return;
  }
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  float size = iSize;
  float dist = max(-mv.z, 0.05);
  // pull the sprite toward the camera so walls do not cut it in half
  float lift = min(uLift + size, dist * 0.5);
  float pull = (dist - lift) / dist;
  mv.xyz *= pull;
  size *= pull;
  dist *= pull;
  float pxPerUnit = projectionMatrix[1][1] * uResolution.y * 0.5 / dist;
  float grow = max(1.0, uMinPx / max(size * pxPerUnit, 1e-4));
  size *= grow;
  colr /= grow * grow;
  mv.xy += corner * size;
  gl_Position = projectionMatrix * mv;
  vColor = colr;
}
`;

export const GLOW_FRAG = /* glsl */ `
uniform float uMirror;
uniform float uCore;
uniform float uGlowHalo;
uniform float uCover;
varying vec2 vUv;
varying vec3 vColor;
void main() {
  float d2 = dot(vUv, vUv);
  if (d2 >= 1.0) discard;
  float fall = (1.0 - d2) * (1.0 - d2);
  float core = exp(-d2 * uCore);
  float halo = exp(-d2 * 3.5) * uGlowHalo;
  float k = (core + halo) * fall;
  if (uMirror > 0.5) {
    // a soft vertical streak broken by ripples
    float streak = exp(-vUv.x * vUv.x * 7.0) * exp(-vUv.y * vUv.y * 2.2);
    float ripple = 0.6 + 0.4 * sin(vUv.y * 11.0 - uTime * 1.9);
    k = streak * ripple * (1.0 - d2);
  }
  vec3 c = vColor * k * uExposure;
  // compress, then grade like the rest of the frame
  c = 1.0 - exp(-c);
  c = pow(c, vec3(1.0 / 2.2)) * vignette();
  // premultiplied: a lantern's core covers the sky behind it, so it stays warm
  float a = clamp(max(c.r, max(c.g, c.b)) * uCover, 0.0, 1.0);
  gl_FragColor = vec4(c, a);
}
`;

// ---------------------------------------------------------------------------
// Water: sky reflection with ripples, the moon's glitter path, warm reflections.

export const WATER_VERT = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const WATER_FRAG = /* glsl */ `
uniform vec3 uDeep;
uniform vec4 uSplash[2];
varying vec3 vWorldPos;

vec2 waveGrad(vec2 p, vec2 dir, float freq, float amp, float speed) {
  float ph = dot(p, dir) * freq + uTime * speed;
  return dir * (cos(ph) * freq * amp);
}

void main() {
  vec3 wp = vWorldPos;
  vec3 toCam = cameraPosition - wp;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  // irregular ripples: a few wave trains, bent by slow noise so they never read as stripes
  vec2 p = wp.xz;
  vec2 warp = vec2(vnoise(p * 0.045 + vec2(uTime * 0.02, 0.0)), vnoise(p * 0.045 + vec2(7.3, uTime * 0.017))) * 9.0;
  vec2 q = p + warp;
  vec2 g = vec2(0.0);
  g += waveGrad(q, normalize(vec2(0.83, 0.55)), 0.42, 0.05, 0.9);
  g += waveGrad(q, normalize(vec2(-0.47, 0.88)), 0.77, 0.032, 1.25);
  g += waveGrad(q, normalize(vec2(0.15, -0.99)), 1.31, 0.02, 1.7);
  g += waveGrad(q, normalize(vec2(-0.93, -0.36)), 2.23, 0.011, 2.3);
  g += waveGrad(q, normalize(vec2(0.6, -0.8)), 3.7, 0.006, 3.1);
  float calm = 0.55 + 0.75 * vnoise(p * 0.08 + vec2(uTime * 0.03, uTime * 0.011));
  g *= calm;
  // rings spreading from a splash: (x, z, start time, strength)
  for (int i = 0; i < 2; i++) {
    float age = uTime - uSplash[i].z;
    if (age <= 0.0 || age > 7.0) continue;
    vec2 d = p - uSplash[i].xy;
    float r = length(d) + 1e-3;
    float front = 0.35 + age * 1.7;
    float band = (r - front) / 0.9;
    float wave = cos((r - front) * 7.0) * exp(-band * band) * exp(-age * 0.45) * uSplash[i].w / (1.0 + r * 0.25);
    g += (d / r) * wave * 0.9;
  }
  float fade = 1.0 / (1.0 + dist * 0.015);
  vec3 N = normalize(vec3(-g.x * fade, 1.0, -g.y * fade));
  vec3 R = reflect(-V, N);
  R.y = max(R.y, 0.0);
  R = normalize(R);
  vec3 refl = skyGradient(R);
  // the far hills and trees hide the low sky in the reflection
  refl *= mix(0.16, 1.0, smoothstep(0.03, 0.2, R.y));
  float c = max(dot(R, uMoonDir), 0.0);
  refl += uMoonColor * (pow(c, 1600.0) * 7.0 + pow(c, 220.0) * 0.8);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 col = mix(uDeep, refl, clamp(fres, 0.0, 1.0));
  col += uDeep * 0.6 * (1.0 - fres);
  col = applyFog(col, wp);
  gl_FragColor = vec4(grade(col), 1.0);
}
`;
