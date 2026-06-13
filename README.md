# The Fixing Bath

A single-purpose website: a scroll-driven 3D animation of a developed photo
being lifted out of a photo-fixing bath — the final wet step of film
development. Scrolling down raises the print out of the liquid; scrolling up
lowers it back in. Scrolling is the only interaction.

**Live:** https://enyineer.github.io/photoanim/

## Bring your own photo

The photo texture is replaceable at runtime via a query parameter — no
upload UI:

```
https://enyineer.github.io/photoanim/?photo=https://example.com/my-image.jpg
```

The image must be CORS-readable (`Access-Control-Allow-Origin`). If it
isn't, or the URL is broken, the bundled default print is used instead.

## How it works

- **Pure-function physics core** (`src/physics/`): buoyancy & displacement
  (Archimedes), meniscus/contact-line wetting (capillary length, wall-climb
  height, exponential profile), Jeffreys film drainage and Nusselt runoff
  flux, evaporative wet-to-dry transition, Tate's-law droplet detachment
  with Harkins–Brown correction, deep-water dispersion for ripples, and the
  scroll→lift timeline. Every function is deterministic and side-effect
  free, fully decoupled from rendering.
- **Tests** (`src/physics/__tests__/`): 160+ Vitest assertions covering
  conservation (drip mass balance), monotonicity (drainage, drying,
  submersion), boundary conditions, physical bounds and numeric stability,
  plus an end-to-end 60 fps simulation of the full lift.
- **Render layer** (`src/scene/`): React Three Fiber + custom GLSL. The
  water surface and the print's wet sheen are GPU shaders that evaluate the
  same formulas as the physics core; every governing parameter arrives as a
  uniform computed by the tested pure functions each frame.
- **Performance & accessibility**: tessellation, ripple count, droplet
  count, pixel ratio and ambient motion degrade on low-power devices
  (`useQuality`), drei's `AdaptiveDpr` reacts to frame-rate regressions,
  and `prefers-reduced-motion` disables all motion that isn't directly
  scroll-driven.

## Development

```sh
npm install
npm run dev        # local dev server
npm test           # physics test suite
npm run lint       # eslint
npm run typecheck  # tsc
npm run build      # production build (dist/)
```

## Deployment

Pushes to the deploy branches trigger `.github/workflows/deploy.yml`, which
lints, tests, builds and publishes `dist/` to GitHub Pages (Actions
source — the workflow enables Pages on first run).
