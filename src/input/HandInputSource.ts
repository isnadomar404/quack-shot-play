import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { DISPLAY, HAND } from "../config/tuning";
import { settings } from "../config/settings";
import type { InputSource, InputState } from "./InputSource";
import { AimCalibration, type Vec2 } from "./calibration";
import { OneEuro2D } from "./oneEuro";
import { PinchDetector } from "./pinchDetector";

/**
 * HandInputSource — webcam hand-tracking behind the InputSource interface.
 * Aim = index fingertip; fire = **pinch** (thumb tip onto index tip, V2). The
 * legacy finger-gun detector stays available behind HAND.FIRE_GESTURE. This is
 * the ONLY place camera/MediaPipe specifics live; scenes read game-space
 * {x, y, isFiring} exactly as they do from the mouse.
 *
 * Architecture honoured: inference runs off the render path. MediaPipe
 * tasks-vision has no LIVE_STREAM mode, so we drive the synchronous
 * detectForVideo() from requestVideoFrameCallback (a cadence independent of the
 * render rAF). The cursor is One-Euro smoothed.
 *
 * Position latch (pinch mode): on the pinch-down edge the reported cursor is
 * frozen at that frame's smoothed position and stays frozen until the fingers
 * re-open, so the finger curl can't drag the shot off target.
 *
 * start() REJECTS if the camera is denied/absent or the model fails to load —
 * GameScene catches that and falls back to the mouse (mouse is permanent).
 */

// MediaPipe hand landmark indices used here.
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;

export interface HandStatus {
  /** Camera + model are up and the pump is running. */
  active: boolean;
  /** A hand is currently detected. */
  handPresent: boolean;
  /** Ready to fire (un-pinched / thumb cocked up). */
  armed: boolean;
  /** Inference frames per second (tracking-quality proxy). */
  fps: number;
  /** HandLandmarker confidence 0..1 (drives the tracking-quality dot). */
  confidence: number;
  /** True once the 4-corner calibration rectangle is set. */
  calibrated: boolean;
  /** Corners captured so far in an in-progress trace (0..4). */
  corners: number;
}

type RVFCVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export class HandInputSource implements InputSource {
  private video: RVFCVideo | null = null;
  private stream: MediaStream | null = null;
  private landmarker: HandLandmarker | null = null;
  private running = false;
  private rvfcHandle: number | null = null;
  private rafHandle: number | null = null;
  private lastTs = -1;

  private readonly calib = new AimCalibration();
  private readonly filter = new OneEuro2D(
    () => settings.minCutoff(),
    () => HAND.ONE_EURO_BETA,
    HAND.ONE_EURO_DCUTOFF,
  );

  private readonly pinch = new PinchDetector();

  // Shared state between the inference pump and poll() / status.
  /** Live smoothed cursor — always tracks the fingertip (the crosshair reads
   *  this, so it never freezes). */
  private cursor: Vec2 = { x: DISPLAY.WIDTH / 2, y: DISPLAY.HEIGHT / 2 };
  /** Shot location latched at the pinch-down frame so the finger curl can't
   *  drag the shot. Only the SHOT uses this — never the visible cursor. */
  private shotPos: Vec2 = { x: DISPLAY.WIDTH / 2, y: DISPLAY.HEIGHT / 2 };
  /** Latest raw normalized fingertip (for corner-trace calibration capture). */
  private rawTip: Vec2 = { x: 0.5, y: 0.5 };
  private firedSinceLastPoll = false;
  private armed = true; // finger-gun re-arm flag
  private downCount = 0;
  private handPresent = false;
  private confidence = 0;
  private missingFrames: number = HAND.LOST_AFTER_MISSING_FRAMES;

  // Inference fps (tracking-quality readout).
  private inferences = 0;
  private lastFpsAt = 0;
  private infFps = 0;

  async start(): Promise<void> {
    // 1) Camera. getUserMedia rejects on denial / no device → propagate so the
    //    scene can fall back to mouse.
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: HAND.CAM_WIDTH,
        height: HAND.CAM_HEIGHT,
        facingMode: "user",
      },
      audio: false,
    });

    const video = document.createElement("video") as RVFCVideo;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    this.styleSelfView(video);
    document.body.appendChild(video);
    video.srcObject = this.stream;
    await video.play();
    this.video = video;

    // 2) Model. Try GPU, fall back to CPU; rethrow if neither loads.
    const fileset = await FilesetResolver.forVisionTasks(HAND.WASM_BASE);
    this.landmarker = await this.createLandmarker(fileset);

    // 3) Pump inference off the render path.
    this.lastFpsAt = performance.now();
    this.running = true;
    this.startPump();
  }

  private async createLandmarker(
    fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  ): Promise<HandLandmarker> {
    const base = {
      runningMode: "VIDEO" as const,
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    };
    try {
      return await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND.MODEL_URL, delegate: "GPU" },
        ...base,
      });
    } catch {
      return await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND.MODEL_URL, delegate: "CPU" },
        ...base,
      });
    }
  }

  private startPump(): void {
    const video = this.video;
    const landmarker = this.landmarker;
    if (!video || !landmarker) return;

    const detect = (): void => {
      if (!this.running) return;
      if (video.readyState >= 2) {
        let ts = performance.now();
        if (ts <= this.lastTs) ts = this.lastTs + 1;
        this.lastTs = ts;
        this.onResult(landmarker.detectForVideo(video, ts));
      }
    };

    if (video.requestVideoFrameCallback) {
      const pump = (): void => {
        if (!this.running) return;
        detect();
        this.rvfcHandle = video.requestVideoFrameCallback?.(pump) ?? null;
      };
      this.rvfcHandle = video.requestVideoFrameCallback(pump);
    } else {
      const loop = (): void => {
        if (!this.running) return;
        detect();
        this.rafHandle = requestAnimationFrame(loop);
      };
      this.rafHandle = requestAnimationFrame(loop);
    }
  }

  /** Gesture processing — runs once per inference result. */
  private onResult(res: HandLandmarkerResult): void {
    const now = performance.now();
    this.inferences++;
    if (now - this.lastFpsAt >= 1000) {
      this.infFps = Math.round((this.inferences * 1000) / (now - this.lastFpsAt));
      this.inferences = 0;
      this.lastFpsAt = now;
    }

    const lm = res.landmarks?.[0];
    if (!lm) {
      // Re-arm on hand loss so a stale "down" can't drop a shot when it returns.
      this.armed = true;
      this.downCount = 0;
      this.pinch.reset();
      if (this.missingFrames < HAND.LOST_AFTER_MISSING_FRAMES) {
        this.missingFrames++;
      }
      if (this.missingFrames >= HAND.LOST_AFTER_MISSING_FRAMES) {
        this.handPresent = false;
        this.confidence = 0;
        this.filter.reset();
      }
      return;
    }
    this.missingFrames = 0;
    this.handPresent = true;
    // Handedness classification score is the available confidence proxy.
    this.confidence = res.handedness?.[0]?.[0]?.score ?? 1;

    const idxTip = lm[INDEX_TIP];
    this.rawTip = { x: idxTip.x, y: idxTip.y };
    const handSize = dist(lm[WRIST], lm[MIDDLE_MCP]) || 1e-4;

    // Aim: map fingertip → game-space, then One-Euro smooth (the live cursor).
    const mapped = this.calib.map({ x: idxTip.x, y: idxTip.y });
    const live = this.filter.filter(mapped.x, mapped.y, now);

    if (settings.fireGesture() === "pinch") {
      const normDist = PinchDetector.normalizedDistance(
        lm[THUMB_TIP],
        idxTip,
        handSize,
      );
      // The cursor ALWAYS tracks the live smoothed position, so the crosshair
      // never freezes after a shot (smooth feel). Only the shot location is
      // latched, at the pinch-down frame, so the finger curl can't drag it.
      this.cursor = live;
      if (this.pinch.update(normDist)) {
        this.shotPos = { x: live.x, y: live.y };
        this.firedSinceLastPoll = true;
      }
      return;
    }

    // Finger-gun (alternate): no latch; angle at the index MCP between index + thumb.
    this.cursor = live;
    const indexExtended =
      dist(idxTip, lm[INDEX_MCP]) / handSize > HAND.INDEX_EXTENDED_RATIO;
    const thumbAngle = angleDeg(lm[INDEX_MCP], idxTip, lm[THUMB_TIP]);

    if (thumbAngle > HAND.THUMB_UP_DEG) {
      this.armed = true; // thumb cocked back up → ready again
      this.downCount = 0;
    }
    if (indexExtended && this.armed && thumbAngle < HAND.THUMB_DOWN_DEG) {
      this.downCount++;
      if (this.downCount >= HAND.FIRE_HOLD_FRAMES) {
        this.armed = false; // one shot per cock; must re-arm
        this.downCount = 0;
        this.firedSinceLastPoll = true;
      }
    } else if (thumbAngle >= HAND.THUMB_DOWN_DEG) {
      this.downCount = 0;
    }
  }

  poll(): InputState {
    const isFiring = this.firedSinceLastPoll;
    this.firedSinceLastPoll = false;
    // On the firing frame, report the latched shot location; otherwise the live
    // cursor, so the crosshair keeps tracking smoothly between shots.
    const pos = isFiring ? this.shotPos : this.cursor;
    return { x: pos.x, y: pos.y, isFiring };
  }

  stop(): void {
    this.running = false;
    if (this.video) {
      if (this.rvfcHandle !== null) {
        this.video.cancelVideoFrameCallback?.(this.rvfcHandle);
      }
      this.video.srcObject = null;
      this.video.remove();
      this.video = null;
    }
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    this.rvfcHandle = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.landmarker?.close();
    this.landmarker = null;
  }

  /** Recalibrate: recentre the aim mapping on the current hand position. */
  recenter(): void {
    this.calib.recenter();
  }

  /** Begin a fresh 4-corner calibration trace (the tutorial). */
  beginCalibration(): void {
    this.calib.beginCornerCapture();
  }

  /** Capture the current fingertip as the next corner. Returns count (1..4). */
  captureCorner(): number {
    return this.calib.captureCorner(this.rawTip);
  }

  isCalibrated(): boolean {
    return this.calib.isRectCalibrated();
  }

  getStatus(): HandStatus {
    return {
      active: this.running,
      handPresent: this.handPresent,
      armed: this.armed,
      fps: this.infFps,
      confidence: this.confidence,
      calibrated: this.calib.isRectCalibrated(),
      corners: this.calib.cornerCount(),
    };
  }

  /** Small mirrored self-view bottom-right so the user can see tracking. */
  private styleSelfView(video: HTMLVideoElement): void {
    Object.assign(video.style, {
      position: "fixed",
      right: "10px",
      bottom: "10px",
      width: "160px",
      height: "120px",
      transform: "scaleX(-1)",
      border: "2px solid #566c86",
      borderRadius: "6px",
      background: "#000",
      opacity: "0.85",
      zIndex: "9999",
      pointerEvents: "none",
    } satisfies Partial<CSSStyleDeclaration>);
  }
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Angle (degrees) at `from` between the vectors from→a and from→b. */
function angleDeg(from: Vec2, a: Vec2, b: Vec2): number {
  const ax = a.x - from.x;
  const ay = a.y - from.y;
  const bx = b.x - from.x;
  const by = b.y - from.y;
  const dot = ax * bx + ay * by;
  const mag = Math.hypot(ax, ay) * Math.hypot(bx, by) || 1e-6;
  return (Math.acos(Math.min(1, Math.max(-1, dot / mag))) * 180) / Math.PI;
}
