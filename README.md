# QUACK SHOT 🦆

A gesture-controlled, neo-retro remake of the Duck Hunt arcade formula. Aim with
your webcam-tracked hand and fire with a pinch — or just use the **mouse** (click
to fire) or **spacebar**. Fully original assets; not affiliated with Nintendo.

## ▶️ Play

**https://isnadomar404.github.io/quack-shot-play/**

> Hand tracking needs camera permission. No camera? Mouse and spacebar work as
> permanent fallbacks — the game is fully playable without a webcam.

## Controls

| Input | Aim | Fire |
| --- | --- | --- |
| Hand (webcam) | Index fingertip | Pinch (thumb + index) |
| Mouse | Cursor | Click |
| Keyboard | Cursor (follows mouse) | Spacebar |

Press `C` on the title screen to (re)calibrate hand tracking.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
```

Built with Vite + Phaser 3 + TypeScript, MediaPipe `tasks-vision` HandLandmarker
for tracking. See `CLAUDE.md` and `PLAN.md` for architecture and conventions.

## Deploy

Pushing to `main` triggers the GitHub Actions workflow in
`.github/workflows/deploy.yml`, which builds and publishes to GitHub Pages.
