import {
  Mat3, Quat, Vec3,
  dot, mv, normalize, qAngle, qAxisAngle, qFromTo, qMatrix, qMul, qNorm, qSlerp, randUnit,
} from "./dice_math";
import { fadeOutSound, playSound } from "./sounds";

// ---------- Colors ----------
const COLORS = {
  body: [255, 71, 87] as Vec3,
  pip: [255, 255, 255] as Vec3,
  confetti: ["#ff4757", "#ffa502", "#2ed573", "#1e90ff", "#ff6348", "#eccc68"],
};

// ---------- World settings (1 unit = the smaller canvas side) ----------
const HALF = 0.11; // half the edge length of the cube
const BOUND_X = 0.37; // table walls
const BOUND_Y = 0.31;
const GRAVITY = 12;
const TILT = 0.38; // camera tilt (radians)
const COS_T = Math.cos(TILT);
const SIN_T = Math.sin(TILT);
const CAM_D = 2.6; // camera distance (perspective strength)
const CAM_POS: Vec3 = [0, CAM_D * SIN_T, CAM_D * COS_T];
const LIGHT = normalize([-0.45, -0.55, 1]);
const SHADOW_DIR: Vec3 = [0.3, 0.35, -1]; // direction light travels (z = -1)
const SUBSTEPS = 6;

// ---------- Dice geometry (opposite faces add up to 7) ----------
type Face = { n: Vec3; u: Vec3; v: Vec3; value: number };

const FACES: Face[] = [
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], value: 1 },
  { n: [0, 0, -1], u: [1, 0, 0], v: [0, -1, 0], value: 6 },
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], value: 2 },
  { n: [-1, 0, 0], u: [0, -1, 0], v: [0, 0, 1], value: 5 },
  { n: [0, 1, 0], u: [-1, 0, 0], v: [0, 0, 1], value: 3 },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], value: 4 },
];

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

const CORNERS: Vec3[] = [];
for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) CORNERS.push([sx * HALF, sy * HALF, sz * HALF]);

type Particle = {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  color: string;
  life: number;
  rotation: number;
  rs: number; // rotation speed (degrees / frame)
  g: number; // gravity (px / frame²)
};

type Point = [number, number];

function convexHull(input: Point[]): Point[] {
  const pts = input.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const crossZ = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point[] = [];
  const upper: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && crossZ(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && crossZ(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function rgb(c: Vec3, k: number): string {
  const ch = (v: number) => Math.round(Math.min(255, v * k));
  return `rgb(${ch(c[0])},${ch(c[1])},${ch(c[2])})`;
}

/**
 * A single 3D die on a small table, drawn onto a canvas.
 * Call `roll()` to throw it; the promise resolves with the face that ends up on top.
 */
export class DiceScene {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly resizeObserver: ResizeObserver;
  private canvasW = 0;
  private canvasH = 0;

  private pos: Vec3 = [0, 0, HALF];
  private vel: Vec3 = [0, 0, 0];
  private omega: Vec3 = [0, 0, 0];
  private q: Quat = [1, 0, 0, 0];

  private isRolling = false;
  private settling = false;
  private settleTarget: Quat = [1, 0, 0, 0];
  private rollTime = 0;
  private resolveRoll: ((value: number) => void) | null = null;
  private particles: Particle[] = [];
  private frameId = 0;
  private lastTs = 0;
  private destroyed = false;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly sizeSource: HTMLElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to draw the dice: canvas context is unavailable.");
    this.ctx = ctx;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(sizeSource);
    this.reset();
  }

  get rolling(): boolean {
    return this.isRolling;
  }

  /** Stop animating and release observers */
  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    this.resolveRoll = null;
  }

  reset() {
    this.pos = [0, 0, HALF];
    this.vel = [0, 0, 0];
    this.omega = [0, 0, 0];
    // Face 6 up, slightly turned so it looks 3D
    this.q = qMul(qAxisAngle([0, 0, 1], 0.4), [0, 1, 0, 0]);
    this.isRolling = false;
    this.settling = false;
    this.particles = [];
    this.draw();
  }

  roll(): Promise<number> {
    return new Promise((resolve) => {
      if (this.isRolling || this.destroyed) return;
      this.resolveRoll = resolve;
      this.isRolling = true;
      this.settling = false;
      this.rollTime = 0;
      this.particles = [];

      // Scoop the dice up and toss it, roughly toward the middle of the table
      const toCenter = normalize([
        -this.pos[0] + (Math.random() - 0.5) * 0.7,
        -this.pos[1] + (Math.random() - 0.5) * 0.7,
        0,
      ]);
      const speed = 1.1 + Math.random() * 0.8;
      this.vel = [toCenter[0] * speed, toCenter[1] * speed, 2.3 + Math.random() * 0.6];
      const axis = randUnit();
      const spin = 16 + Math.random() * 10;
      this.omega = [axis[0] * spin, axis[1] * spin, axis[2] * spin];

      this.startLoop();
    });
  }

  // ---------- Canvas sizing ----------
  private resize() {
    this.canvasW = this.sizeSource.clientWidth;
    this.canvasH = this.sizeSource.clientHeight;
    if (!this.canvasW || !this.canvasH) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.canvasW * dpr);
    this.canvas.height = Math.round(this.canvasH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  private topFace(): { face: Face; worldNormal: Vec3 } {
    const m = qMatrix(this.q);
    let best = FACES[0];
    let bestZ = -Infinity;
    let bestN: Vec3 = [0, 0, 1];
    for (const f of FACES) {
      const nw = mv(m, f.n);
      if (nw[2] > bestZ) {
        bestZ = nw[2];
        best = f;
        bestN = nw;
      }
    }
    return { face: best, worldNormal: bestN };
  }

  // ---------- Physics ----------
  private step(dt: number): boolean {
    if (!this.settling) {
      this.vel[2] -= GRAVITY * dt;
      // Integrate rotation: q' = 0.5 * omega * q
      const dq = qMul([0, this.omega[0], this.omega[1], this.omega[2]], this.q);
      this.q = qNorm([
        this.q[0] + 0.5 * dq[0] * dt,
        this.q[1] + 0.5 * dq[1] * dt,
        this.q[2] + 0.5 * dq[2] * dt,
        this.q[3] + 0.5 * dq[3] * dt,
      ]);
    } else {
      this.q = qSlerp(this.q, this.settleTarget, 1 - Math.exp(-14 * dt));
      this.vel[0] *= Math.exp(-10 * dt);
      this.vel[1] *= Math.exp(-10 * dt);
      this.vel[2] = Math.min(this.vel[2], 0) - GRAVITY * dt;
    }

    for (let i = 0; i < 3; i++) this.pos[i] += this.vel[i] * dt;

    // Extent of the rotated cube
    const m = qMatrix(this.q);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity;
    for (const c of CORNERS) {
      const w = mv(m, c);
      minX = Math.min(minX, w[0]); maxX = Math.max(maxX, w[0]);
      minY = Math.min(minY, w[1]); maxY = Math.max(maxY, w[1]);
      minZ = Math.min(minZ, w[2]);
    }

    // Floor
    let contact = false;
    if (this.pos[2] + minZ <= 0.0005) {
      this.pos[2] = -minZ;
      contact = true;
      if (this.vel[2] < 0) {
        const impact = -this.vel[2];
        if (impact > 0.35 && !this.settling) {
          // Bounce: lose energy, kick the spin a little
          this.vel[2] = impact * 0.38;
          this.vel[0] *= 0.82;
          this.vel[1] *= 0.82;
          const kick = randUnit();
          for (let i = 0; i < 3; i++) this.omega[i] = this.omega[i] * 0.7 + kick[i] * impact * 2.2;
        } else {
          this.vel[2] = 0;
        }
      }
      if (!this.settling) {
        // Sliding friction
        const f = Math.exp(-2.6 * dt);
        this.vel[0] *= f;
        this.vel[1] *= f;
        // Tumble in the direction of travel (rolling), yaw spin dies out
        const k = Math.min(1, 7 * dt);
        this.omega[0] += (-this.vel[1] / HALF - this.omega[0]) * k;
        this.omega[1] += (this.vel[0] / HALF - this.omega[1]) * k;
        this.omega[2] *= Math.exp(-3 * dt);
      }
    }

    // Walls
    if (this.pos[0] + maxX > BOUND_X) { this.pos[0] = BOUND_X - maxX; if (this.vel[0] > 0) this.wallHit(0); }
    if (this.pos[0] + minX < -BOUND_X) { this.pos[0] = -BOUND_X - minX; if (this.vel[0] < 0) this.wallHit(0); }
    if (this.pos[1] + maxY > BOUND_Y) { this.pos[1] = BOUND_Y - maxY; if (this.vel[1] > 0) this.wallHit(1); }
    if (this.pos[1] + minY < -BOUND_Y) { this.pos[1] = -BOUND_Y - minY; if (this.vel[1] < 0) this.wallHit(1); }

    return contact;
  }

  private wallHit(axis: 0 | 1) {
    this.vel[axis] = -this.vel[axis] * 0.55;
    this.omega[2] += (Math.random() - 0.5) * 10;
    const kick = randUnit();
    for (let i = 0; i < 3; i++) this.omega[i] += kick[i] * 3;
  }

  private updatePhysics(dt: number) {
    let contact = false;
    for (let i = 0; i < SUBSTEPS; i++) contact = this.step(dt / SUBSTEPS) || contact;
    this.rollTime += dt;

    const speed = Math.hypot(this.vel[0], this.vel[1]);
    const spin = Math.hypot(this.omega[0], this.omega[1], this.omega[2]);

    if (!this.settling && contact && ((this.rollTime > 0.6 && speed < 0.22 && spin < 7) || this.rollTime > 4)) {
      // Tip over onto the face that is closest to pointing up
      const { worldNormal } = this.topFace();
      this.settleTarget = qNorm(qMul(qFromTo(worldNormal, [0, 0, 1]), this.q));
      this.settling = true;
      this.omega = [0, 0, 0];
    }

    if (this.settling && qAngle(this.q, this.settleTarget) < 0.004 && speed < 0.02) {
      this.q = this.settleTarget;
      this.vel = [0, 0, 0];
      this.finishRoll();
    }
  }

  private finishRoll() {
    this.isRolling = false;
    this.settling = false;
    const value = this.topFace().face.value;
    const sp = this.project([this.pos[0], this.pos[1], this.pos[2] + HALF]);
    this.createParticles(sp[0], sp[1]);
    if (this.resolveRoll) {
      this.resolveRoll(value);
      this.resolveRoll = null;
    }
  }

  // ---------- Rendering ----------
  /** World point -> [screenX, screenY, cameraDepth, perspectiveScale] */
  private project(p: Vec3): [number, number, number, number] {
    const yc = p[1] * COS_T - p[2] * SIN_T;
    const zc = p[1] * SIN_T + p[2] * COS_T;
    const s = CAM_D / (CAM_D - zc);
    const m = Math.min(this.canvasW, this.canvasH);
    return [this.canvasW / 2 + p[0] * s * m, this.canvasH / 2 + 0.04 * m + yc * s * m, zc, s];
  }

  private drawShadow(m: Mat3) {
    const ctx = this.ctx;
    const pts = CORNERS.map((c): Point => {
      const w = mv(m, c);
      const p: Vec3 = [this.pos[0] + w[0], this.pos[1] + w[1], this.pos[2] + w[2]];
      const t = p[2];
      const f = this.project([p[0] + SHADOW_DIR[0] * t, p[1] + SHADOW_DIR[1] * t, 0]);
      return [f[0], f[1]];
    });
    const hull = convexHull(pts);
    const height = Math.max(0, this.pos[2] - HALF);
    const alpha = 0.22 * Math.max(0.35, 1 - height * 2.5);
    const blur = Math.min(this.canvasW, this.canvasH) * (0.012 + height * 0.06);

    ctx.save();
    ctx.filter = `blur(${blur.toFixed(1)}px)`;
    ctx.fillStyle = `rgba(12, 74, 110, ${alpha})`;
    ctx.beginPath();
    hull.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawCube(m: Mat3) {
    const ctx = this.ctx;
    const unitPx = Math.min(this.canvasW, this.canvasH);
    const faces: { f: Face; nw: Vec3; at: (a: number, b: number, lift?: number) => Vec3; depth: number; scale: number }[] = [];

    for (const f of FACES) {
      const nw = mv(m, f.n);
      const center: Vec3 = [this.pos[0] + nw[0] * HALF, this.pos[1] + nw[1] * HALF, this.pos[2] + nw[2] * HALF];
      const toCam: Vec3 = [CAM_POS[0] - center[0], CAM_POS[1] - center[1], CAM_POS[2] - center[2]];
      if (dot(nw, toCam) <= 0) continue; // facing away

      const uw = mv(m, f.u);
      const vw = mv(m, f.v);
      const at = (a: number, b: number, lift = 1): Vec3 => [
        this.pos[0] + nw[0] * HALF * lift + (uw[0] * a + vw[0] * b) * HALF,
        this.pos[1] + nw[1] * HALF * lift + (uw[1] * a + vw[1] * b) * HALF,
        this.pos[2] + nw[2] * HALF * lift + (uw[2] * a + vw[2] * b) * HALF,
      ];
      const pc = this.project(center);
      faces.push({ f, nw, at, depth: pc[2], scale: pc[3] });
    }
    faces.sort((a, b) => a.depth - b.depth); // far faces first

    for (const face of faces) {
      const light = 0.52 + 0.48 * Math.max(0, dot(face.nw, LIGHT));
      const quad = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as Point[]).map(([a, b]) => this.project(face.at(a * 0.93, b * 0.93)));

      // Body: thick round-joined stroke gives soft, rounded edges
      ctx.fillStyle = ctx.strokeStyle = rgb(COLORS.body, light);
      ctx.lineJoin = "round";
      ctx.lineWidth = HALF * unitPx * face.scale * 0.16;
      ctx.beginPath();
      quad.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Pips
      ctx.fillStyle = rgb(COLORS.pip, Math.min(1, light + 0.2));
      for (const [pa, pb] of PIPS[face.f.value]) {
        ctx.beginPath();
        for (let k = 0; k <= 16; k++) {
          const ang = (k / 16) * Math.PI * 2;
          const a = pa * 0.5 + Math.cos(ang) * 0.21;
          const b = pb * 0.5 + Math.sin(ang) * 0.21;
          const p = this.project(face.at(a, b, 1.002));
          if (k) ctx.lineTo(p[0], p[1]);
          else ctx.moveTo(p[0], p[1]);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  private createParticles(x: number, y: number) {
    const k = Math.min(this.canvasW, this.canvasH) / 400;
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (Math.random() * 8 + 4) * k;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3 * k,
        size: (Math.random() * 10 + 5) * k,
        color: COLORS.confetti[Math.floor(Math.random() * COLORS.confetti.length)],
        life: 1.0,
        rotation: Math.random() * 360,
        rs: (Math.random() - 0.5) * 10,
        g: 0.2 * k,
      });
    }
  }

  private drawParticles() {
    const ctx = this.ctx;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.g;
      p.life -= 0.015;
      p.rotation += p.rs;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      if (i % 2 === 0) {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private draw() {
    if (!this.canvasW || !this.canvasH) return;
    this.ctx.clearRect(0, 0, this.canvasW, this.canvasH);
    const m = qMatrix(this.q);
    this.drawShadow(m);
    this.drawCube(m);
    this.drawParticles();
  }

  // ---------- Loop ----------
  private loop = (ts: number) => {
    if (this.destroyed) return;
    const dt = Math.min((ts - this.lastTs) / 1000, 1 / 30);
    this.lastTs = ts;
    if (this.isRolling) this.updatePhysics(dt);
    this.draw();
    if (this.isRolling || this.particles.length) {
      this.frameId = requestAnimationFrame(this.loop);
    } else {
      this.frameId = 0;
    }
  };

  private startLoop() {
    if (this.frameId) return;
    this.frameId = requestAnimationFrame((ts) => {
      this.lastTs = ts;
      this.frameId = requestAnimationFrame(this.loop);
    });
  }
}

// ==========================================
// DICE ROLL POP-UP
// ==========================================

function injectDiceStyles() {
  if (document.getElementById("dice-popup-styles")) return;
  const style = document.createElement("style");
  style.id = "dice-popup-styles";
  style.textContent = `
    .dice-modal-enter { animation: diceBounceIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
    .dice-modal-exit { animation: diceFadeOut 0.3s ease-in forwards; }
    @keyframes diceBounceIn {
      0% { transform: scale(0.5); opacity: 0; }
      80% { transform: scale(1.05); opacity: 1; }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes diceFadeOut { to { transform: scale(0.9); opacity: 0; } }
  `;
  document.head.appendChild(style);
}

/**
 * Shows a modal with a 3D die. The player rolls by clicking the die or pressing Space.
 * `onRolled` fires as soon as the die settles; the pop-up closes itself shortly after.
 */
export function showDiceRollPopup(
  container: HTMLElement,
  playerName: string,
  onRolled: (value: number) => void
) {
  injectDiceStyles();

  const overlay = document.createElement("div");
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(12, 74, 110, 0.6)",
    backdropFilter: "blur(4px)",
    zIndex: "10",
  });

  const modal = document.createElement("div");
  modal.className = "dice-modal-enter";
  Object.assign(modal.style, {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "min(420px, 90vw)",
    padding: "24px",
    boxSizing: "border-box",
    backgroundColor: "#fff",
    border: "8px solid #7dd3fc",
    borderRadius: "40px",
    boxShadow: "0 25px 50px rgba(0, 0, 0, 0.25)",
    fontFamily: "Arial, sans-serif",
    textAlign: "center",
  });

  const title = document.createElement("h2");
  title.textContent = `${playerName}'s turn`;
  Object.assign(title.style, { margin: "0 0 4px 0", fontSize: "24px", color: "#0ea5e9" });

  const hint = document.createElement("div");
  hint.textContent = "Click the dice or press Space!";
  Object.assign(hint.style, { fontSize: "16px", color: "#64748b", marginBottom: "8px" });

  const resultText = document.createElement("div");
  resultText.textContent = "Roll the dice to get your steps";
  Object.assign(resultText.style, { minHeight: "28px", marginBottom: "12px", fontSize: "20px", fontWeight: "bold", color: "#f59e0b" });

  const canvasContainer = document.createElement("div");
  Object.assign(canvasContainer.style, {
    position: "relative",
    width: "100%",
    aspectRatio: "1 / 1",
    backgroundColor: "#f0f9ff",
    border: "4px dashed #bae6fd",
    borderRadius: "24px",
    overflow: "hidden",
    cursor: "pointer",
    boxSizing: "border-box",
  });

  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block" });

  canvasContainer.appendChild(canvas);
  modal.append(title, hint, resultText, canvasContainer);
  overlay.appendChild(modal);
  container.appendChild(overlay);

  const scene = new DiceScene(canvas, canvasContainer);
  let hasRolled = false;

  const close = () => {
    modal.className = "dice-modal-exit";
    setTimeout(() => {
      scene.destroy();
      overlay.remove();
    }, 300);
  };

  const triggerRoll = async () => {
    if (hasRolled) return;
    hasRolled = true;
    window.removeEventListener("keydown", handleKeyDown);
    canvasContainer.style.cursor = "default";
    resultText.textContent = "Rolling...";

    const rollSound = playSound("roll");
    const value = await scene.roll();
    fadeOutSound(rollSound);
    resultText.textContent = `You rolled ${value}! Move ${value} step${value === 1 ? "" : "s"}. 🎉`;
    onRolled(value);
    // Let the confetti play before closing
    setTimeout(close, 1200);
  };

  function handleKeyDown(e: KeyboardEvent) {
    if (e.code === "Space") {
      e.preventDefault();
      triggerRoll();
    }
  }

  canvasContainer.addEventListener("click", triggerRoll);
  window.addEventListener("keydown", handleKeyDown);
}
