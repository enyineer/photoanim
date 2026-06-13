/**
 * GLSL for the water surface and the photo print. The formulas here mirror
 * the tested pure functions in src/physics (waves.ts, meniscus.ts,
 * runoff.ts, wetting.ts); every governing parameter arrives as a uniform
 * computed by that core each frame — the shaders only evaluate the same
 * curves per-vertex/per-fragment for visual continuity.
 */

export const MAX_RIPPLES = 16;

export const waterVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uGravity;
  // xyz: amplitude, wavelength, direction; w: phase
  uniform vec4 uAmbient[3];
  // x, z: source position; z component: start time; w: amplitude
  uniform vec4 uRipples[${MAX_RIPPLES}];
  uniform float uRippleWavelength;
  uniform float uRippleDamping;
  // x: photo half width, y: photo plane z, z: meniscus rise, w: capillary length
  uniform vec4 uMeniscus;
  uniform float uPierce;

  varying vec3 vWorldPos;
  varying vec3 vNormal;

  const float PI = 3.141592653589793;

  // waves.ts: ambientWaveHeight — deep-water dispersion w = sqrt(g k)
  float ambientHeight(vec2 p) {
    float h = 0.0;
    for (int i = 0; i < 3; i++) {
      float amp = uAmbient[i].x;
      float lambda = max(uAmbient[i].y, 1e-6);
      float dir = uAmbient[i].z;
      float k = 2.0 * PI / lambda;
      float omega = sqrt(uGravity * k);
      float along = p.x * cos(dir) + p.y * sin(dir);
      h += amp * sin(k * along - omega * uTime + uAmbient[i].w);
    }
    return h;
  }

  // waves.ts: rippleHeight — expanding damped wave packet
  float rippleHeight(vec2 p, vec4 src) {
    float age = uTime - src.z;
    if (age < 0.0 || src.w <= 0.0) return 0.0;
    float lambda = max(uRippleWavelength, 1e-6);
    float r = length(p - src.xy);
    float k = 2.0 * PI / lambda;
    float c = sqrt(uGravity * lambda / (2.0 * PI));
    float packet = r - c * age;
    float env = src.w * exp(-uRippleDamping * age)
      * exp(-(packet * packet) / (2.0 * lambda * lambda))
      / sqrt(1.0 + r / lambda);
    return env * cos(k * packet);
  }

  // meniscus.ts: meniscusProfile — exponential climb toward the photo edge.
  // The rise height comes from the physics core (dynamic meniscus); the
  // decay length is widened ~3x for presentation, because the true
  // capillary length (~2.4 mm) is finer than the water-plane tessellation
  // and would vanish between vertices.
  float meniscusHeight(vec2 p) {
    if (uPierce <= 0.0) return 0.0;
    vec2 a = vec2(-uMeniscus.x, uMeniscus.y);
    vec2 b = vec2(uMeniscus.x, uMeniscus.y);
    vec2 ab = b - a;
    float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
    float d = length(p - (a + ab * t));
    float decay = max(uMeniscus.w * 3.0, 0.009);
    return uMeniscus.z * 2.0 * exp(-d / decay) * uPierce;
  }

  float surfaceHeight(vec2 p) {
    float h = ambientHeight(p);
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      h += rippleHeight(p, uRipples[i]);
    }
    return h + meniscusHeight(p);
  }

  void main() {
    // The plane is rotated -90° about X, so local (x, y) maps to world (x, -z)
    // and local +z maps to world +y. Work in world xz for all the physics.
    vec2 p = vec2(position.x, -position.y);
    float h = surfaceHeight(p);

    float eps = 0.004;
    float hx = surfaceHeight(p + vec2(eps, 0.0));
    float hz = surfaceHeight(p + vec2(0.0, eps));
    // World-space normal from the height-field gradient.
    vNormal = normalize(vec3(-(hx - h), eps, -(hz - h)));

    vec3 displaced = position + vec3(0.0, 0.0, h); // local +z is world up
    vec4 world = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const waterFragmentShader = /* glsl */ `
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uSkyColor;
  uniform vec3 uLightDir;
  uniform float uSpecStrength;

  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);

    float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);
    fresnel = clamp(fresnel, 0.04, 1.0);

    // Slope-based shading: wave flanks reveal the deeper liquid.
    float facing = clamp(n.y, 0.0, 1.0);
    vec3 body = mix(uDeepColor, uShallowColor, facing * facing);
    vec3 color = mix(body, uSkyColor, fresnel);

    // Key-light specular glints on the ripples.
    vec3 halfDir = normalize(normalize(uLightDir) + viewDir);
    float spec = pow(max(dot(n, halfDir), 0.0), 140.0) * uSpecStrength;
    color += spec * vec3(1.0, 0.95, 0.85);

    gl_FragColor = vec4(color, 0.94);
  }
`;

export const photoVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const photoFragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uMapAspect;      // texture width / height, for cover-fit
  uniform vec2 uSize;            // photo width/height (m)
  uniform float uWaterline;      // waterline in photo-local m above bottom edge
  uniform float uLiftRef;        // smoothed lift speed (m/s), > 0
  uniform float uStillTime;      // extra exposure accumulated while holding still (s)
  uniform float uMeniscusRise;   // meniscus.ts: rise height (m)
  uniform float uPierce;         // 1 while piercing the surface, bridge factor after
  uniform float uFilmH0;         // runoff.ts: entrained film thickness (m)
  uniform float uDryH;           // wetting.ts: visually-dry threshold (m)
  uniform float uViscosity;
  uniform float uDensity;
  uniform float uGravity;
  uniform float uStreakOffset;   // integral of runoff.ts sheet speed, in UV
  uniform vec3 uLightDir;
  uniform float uBorder;         // white print border as a UV inset

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  // wetting.ts: exposureTimeFromKinematics
  float exposureTime(float yLocal) {
    float heightAbove = yLocal - max(uWaterline, 0.0);
    if (heightAbove <= 0.0) return 0.0;
    return heightAbove / max(uLiftRef, 1e-4) + uStillTime;
  }

  // runoff.ts: filmThickness — Jeffreys drainage h = sqrt(mu y / (rho g t))
  float filmThickness(float yLocal, float t) {
    if (t <= 0.0) return uFilmH0;
    float distFromTop = max(uSize.y - yLocal, 0.0);
    if (distFromTop <= 0.0) return 0.0;
    float h = sqrt(uViscosity * distFromTop / max(uDensity * uGravity * t, 1e-9));
    return min(h, uFilmH0);
  }

  // wetting.ts: wetnessFromFilm — sqrt ramp between dry and saturated film
  float wetnessFromFilm(float h) {
    float t = clamp((h - uDryH) / max(uFilmH0 - uDryH, 1e-9), 0.0, 1.0);
    return sqrt(t);
  }

  void main() {
    float yLocal = vUv.y * uSize.y;
    bool submerged = yLocal <= uWaterline;

    // White print border around the image area.
    vec2 inset = vec2(uBorder);
    vec2 imgUv = (vUv - inset) / (1.0 - 2.0 * inset);
    bool isBorder = any(lessThan(imgUv, vec2(0.0))) || any(greaterThan(imgUv, vec2(1.0)));

    // Cover-fit the texture inside the bordered image area.
    float areaAspect = uSize.x / uSize.y;
    if (uMapAspect > areaAspect) {
      imgUv.x = 0.5 + (imgUv.x - 0.5) * (areaAspect / uMapAspect);
    } else {
      imgUv.y = 0.5 + (imgUv.y - 0.5) * (uMapAspect / areaAspect);
    }

    vec3 albedo = isBorder
      ? vec3(0.93, 0.91, 0.87)
      : texture2D(uMap, clamp(imgUv, 0.0, 1.0)).rgb;

    // Runoff streaks: vertical noise bands sliding down at the sheet speed.
    float streak = noise(vec2(vUv.x * 42.0, vUv.y * 6.0 + uStreakOffset));
    streak = smoothstep(0.35, 0.9, streak);

    float exposure = exposureTime(yLocal);
    float film = filmThickness(yLocal, exposure);
    float wet = submerged ? 1.0 : wetnessFromFilm(film);
    // Streaks keep channels of the film wetter a little longer.
    wet = clamp(wet + (1.0 - wet) * streak * 0.35 * wetnessFromFilm(film * 1.6), 0.0, 1.0);

    // wetting.ts: glossFromWetness — a continuous film keeps its mirror
    // sheen until it is nearly gone.
    float glossW = 1.0 - pow(1.0 - wet, 3.0);

    // Wet emulsion darkens strongly; the paper border less so.
    float darken = isBorder ? mix(1.0, 0.78, wet) : mix(1.0, 0.6, wet);
    vec3 wetAlbedo = albedo * darken;
    // Submerged: the fixer tints and softens the image.
    if (submerged) {
      wetAlbedo = mix(wetAlbedo, wetAlbedo * vec3(0.82, 0.86, 0.8) + vec3(0.02, 0.03, 0.02), 0.45);
    }

    // Lighting: lambert + gloss that follows the wetness (gelatin sheen).
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 lightDir = normalize(uLightDir);
    float diffuse = max(dot(n, lightDir), 0.0);
    vec3 color = wetAlbedo * (0.42 + 0.62 * diffuse);

    // Perturb the normal with the streak field so the sheen breaks up.
    vec3 nWet = normalize(n + vec3((streak - 0.5) * 0.22 * wet, 0.0, 0.0));
    vec3 halfDir = normalize(lightDir + viewDir);
    float gloss = pow(max(dot(nWet, halfDir), 0.0), mix(8.0, 110.0, glossW));
    color += gloss * mix(0.02, 0.55, glossW) * vec3(1.0, 0.97, 0.9);

    // Near-saturated film is a continuous liquid sheet: add a tight mirror
    // lobe and a faint vertical sheen so the just-emerged region clearly
    // reads as a sheet of water sliding off.
    float sheet = smoothstep(0.6, 0.92, wet) * (submerged ? 0.0 : 1.0);
    float mirror = pow(max(dot(nWet, halfDir), 0.0), 240.0);
    color += mirror * sheet * 0.7 * vec3(1.0, 0.98, 0.92);
    color += sheet * 0.06 * vec3(0.9, 0.95, 1.0);

    // The bright clinging line where the bath surface meets the print
    // (meniscus.ts contact-line region). Width follows the dynamic rise
    // with a floor so it stays visible at viewing distance.
    if (uPierce > 0.0 && uMeniscusRise > 0.0) {
      float sigma = max(uMeniscusRise * 1.5, 0.0045);
      float d = yLocal - uWaterline;
      float band = exp(-(d * d) / (2.0 * sigma * sigma));
      // Brighter just above the waterline (the dragged-up meniscus film).
      float crest = exp(-pow((d - sigma * 0.6) / sigma, 2.0));
      color += band * uPierce * vec3(0.28, 0.27, 0.24);
      color += crest * uPierce * 0.35 * vec3(1.0, 0.98, 0.9);
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;
