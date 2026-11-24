// main.ts — post-x-promote-make-your-own-bounty-01 entry (Node 22, stdlib only).
//
// The entry is the X post itself: one post of your own on X that quotes
// make.fun's make-your-own-bounty post
// (https://x.com/makefunai/status/2124915864336236646) or links to it, with a
// photo of its own attached, make.fun or the @makefunai tag and your play code
// in its text; POST.json at the repository root names that post's address.
// This program does two things, both deterministic (two runs write the same
// bytes): it draws the post's photo (promo.png) into the output directory,
// and it copies POST.json from the repository root to the output directory,
// where the gate reads it.
//
// The photo: the make.fun ghost floats beside a "NEW BOUNTY" card, under the
// headline MAKE YOUR OWN BOUNTY — post a task, set the reward, agents
// compete, winners get paid. Everything is drawn in code: no network, no
// downloaded images, no wall clock.
//
// Locally:
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
// In the grader the defaults apply: bot dir /bot, output dir /output.

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// NOTE: POST.json is written by hand after the post is up on X — it holds
// {"url": "https://x.com/<handle>/status/<id>"} and nothing else. This
// program never invents the address; it only copies the file.
const botDir = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const W = 1024;
const H = 1024;
const buf = Buffer.alloc(W * H * 4); // RGBA, opaque

function hex(c: string): [number, number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

type RGBA = [number, number, number, number];

function px(x: number, y: number, c: RGBA): void {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
}

function fillRect(x0: number, y0: number, x1: number, y1: number, c: RGBA): void {
  for (let y = Math.max(0, y0 | 0); y <= Math.min(H - 1, y1 | 0); y++)
    for (let x = Math.max(0, x0 | 0); x <= Math.min(W - 1, x1 | 0); x++) px(x, y, c);
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function lerpColor(c1: RGBA, c2: RGBA, t: number): RGBA {
  return [lerp(c1[0], c2[0], t) | 0, lerp(c1[1], c2[1], t) | 0, lerp(c1[2], c2[2], t) | 0, 255];
}

// ---- PNG encoder (stdlib only) ----
let CRC_TABLE: Int32Array | null = null;
function crc32(b: Buffer): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function pngBytes(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0;
    buf.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- 5x7 bitmap font (glyphs as 7 rows of 5) ----
const FONT: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#..##', '#.#.#', '##..#', '#...#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '...#.', '..#..', '..#..', '..#..'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '(': ['...##', '..#..', '.#...', '.#...', '.#...', '..#..', '...##'],
  ')': ['##...', '..#..', '...#.', '...#.', '...#.', '..#..', '##...'],
  $: ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '#.##.', '#..##'],
  a: ['.....', '.....', '.###.', '....#', '.####', '#...#', '.###.'],
  e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.###.'],
  f: ['..##.', '.#...', '.#...', '####.', '.#...', '.#...', '.#...'],
  k: ['.....', '.....', '#..#.', '#.#..', '##...', '#.#..', '#..#.'],
  m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#.#.#'],
  n: ['.....', '.....', '.##..', '#..#.', '#..#.', '#..#.', '#..#.'],
  o: ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.'],
  p: ['.....', '.....', '.##..', '#..#.', '#..#.', '####.', '#....'],
  r: ['.....', '.....', '#.##.', '##..#', '#....', '#....', '#....'],
  s: ['.....', '.....', '.####', '#....', '.###.', '....#', '####.'],
  u: ['.....', '.....', '#...#', '#...#', '#...#', '#..##', '.##.#'],
  w: ['.....', '.....', '#...#', '#...#', '#.#.#', '#.#.#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

function textWidth(str: string, scale: number): number {
  return str.length * 6 * scale - scale;
}

// Draw text with a thick outline for legibility. `x` is the left edge.
function drawTextLeft(str: string, x: number, y: number, scale: number, color: RGBA, outline: RGBA): void {
  const off = Math.max(2, Math.round(scale / 3));
  const draw = (col: RGBA, dx: number, dy: number): void => {
    let gx = x + dx;
    for (const ch of str) {
      const g = FONT[ch] || FONT[' '];
      for (let r = 0; r < 7; r++)
        for (let c = 0; c < 5; c++)
          if (g[r][c] === '#') fillRect(gx + c * scale, y + dy + r * scale, gx + (c + 1) * scale - 1, y + dy + (r + 1) * scale - 1, col);
      gx += 6 * scale;
    }
  };
  draw(outline, -off, 0); draw(outline, off, 0); draw(outline, 0, -off); draw(outline, 0, off);
  draw(color, 0, 0);
}

// Draw text centred on cx, top edge at y.
function drawText(str: string, cx: number, y: number, scale: number, color: RGBA, outline: RGBA): void {
  drawTextLeft(str, Math.round(cx - textWidth(str, scale) / 2), y, scale, color, outline);
}

// ---- shapes ----
function fillCircle(cx: number, cy: number, r: number, c: RGBA): void {
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++)
      if (x * x + y * y <= r * r) px(cx + x, cy + y, c);
}

function fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGBA): void {
  for (let y = -ry; y <= ry; y++)
    for (let x = -rx; x <= rx; x++)
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) px(cx + x, cy + y, c);
}

// Thick line: stamp circles along the segment.
function thickLine(x0: number, y0: number, x1: number, y1: number, w: number, c: RGBA): void {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillCircle(Math.round(x0 + dx * t), Math.round(y0 + dy * t), Math.max(1, Math.round(w / 2)), c);
  }
}

// Filled polygon, scanline even-odd.
function fillPoly(pts: [number, number][], c: RGBA): void {
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + (y - y0) * (x1 - x0) / (y1 - y0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) px(x, y, c);
  }
}

// Four-pointed sparkle (the ghost's eyes).
function sparkle(cx: number, cy: number, R: number, r: number, c: RGBA): void {
  const pts: [number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const ang = (Math.PI / 4) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? R : r;
    pts.push([cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)]);
  }
  fillPoly(pts, c);
}

// Five-pointed star (the coin's star).
function star5(cx: number, cy: number, R: number, r: number, c: RGBA): void {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? R : r;
    pts.push([cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)]);
  }
  fillPoly(pts, c);
}

// ---- palette ----
const INK = hex('#14081f');      // near-black purple
const WHITE = hex('#ffffff');
const MAGENTA = hex('#ff2e88');  // make.fun coin magenta
const MAGENTA_LT = hex('#ff5da2');
const GOLD = hex('#ffe9a8');

// ---- scene ----
// Background: deep purple gradient, darker at the top, magenta glow low.
const BG_TOP = hex('#1b0b33'), BG_MID = hex('#3d1157'), BG_LOW = hex('#7a1e63');
for (let y = 0; y < H; y++) {
  const t = y / H;
  const c = t < 0.5 ? lerpColor(BG_TOP, BG_MID, t * 2) : lerpColor(BG_MID, BG_LOW, (t - 0.5) * 2);
  for (let x = 0; x < W; x++) px(x, y, c);
}
// Stars.
const STAR_SEED: [number, number][] = [[90, 60], [180, 34], [420, 80], [520, 40], [950, 90], [880, 40], [640, 55], [300, 110], [120, 260], [930, 300], [60, 420], [980, 480]];
for (const [sx, sy] of STAR_SEED) fillCircle(sx, sy, 2, WHITE);
// Small magenta coins with white stars, floating.
function miniCoin(cx: number, cy: number, r: number): void {
  fillCircle(cx, cy, r, INK);
  fillCircle(cx, cy, r - 3, MAGENTA);
  star5(cx, cy, Math.round(r * 0.62), Math.round(r * 0.26), WHITE);
}
miniCoin(120, 700, 30);
miniCoin(930, 700, 26);
miniCoin(505, 700, 20);

// ---- headline ----
drawText('MAKE YOUR OWN', 512, 48, 9, WHITE, INK);
drawText('BOUNTY', 512, 150, 11, MAGENTA, INK);

// ---- the make.fun ghost: white, thick black outline, sparkle eyes,
//      a round little hand holding a magenta coin with a white star ----
const GX = 310; // ghost centre x
const GY = 320; // ghost top y
// Shadow on the ground: it floats.
fillEllipse(GX, 700, 110, 16, hex('#0e0618'));
function ghostBody(cx: number, cy: number, w: number, h: number, c: RGBA): void {
  // Rounded top, straight sides, wavy three-scallop bottom.
  fillEllipse(cx, cy + w / 2, w / 2, w / 2, c);
  fillRect(cx - w / 2, cy + w / 2, cx + w / 2, cy + h - 26, c);
  for (let i = 0; i < 3; i++) {
    const sx = cx - w / 2 + (i + 0.5) * (w / 3);
    fillCircle(sx, cy + h - 26, w / 6, c);
  }
}
ghostBody(GX, GY, 250, 300, INK);
ghostBody(GX, GY, 236, 288, WHITE);
// Sparkle eyes.
sparkle(GX - 48, GY + 130, 30, 9, INK);
sparkle(GX + 48, GY + 130, 30, 9, INK);
// Little smile, drawn as a thick arc.
let prevSx: number | null = null, prevSy: number | null = null;
for (let a = 0; a <= 16; a++) {
  const t = (a / 16) * Math.PI;
  const sx = Math.round(GX + 34 * Math.cos(t)), sy = Math.round(GY + 182 + 16 * Math.sin(t));
  if (prevSx !== null && prevSy !== null) thickLine(prevSx, prevSy, sx, sy, 4, INK);
  prevSx = sx; prevSy = sy;
}
// Magenta coin with a white star, held in the round little hand:
// the coin is drawn first, the hand overlaps its edge, so it reads as held.
fillCircle(GX - 172, GY + 200, 58, INK);
fillCircle(GX - 172, GY + 200, 52, MAGENTA);
fillCircle(GX - 172, GY + 200, 44, MAGENTA_LT);
star5(GX - 172, GY + 200, 34, 14, WHITE);
// Round little hand, reaching out to the left, gripping the coin's edge.
fillCircle(GX - 118, GY + 206, 26, INK);
fillCircle(GX - 118, GY + 206, 20, WHITE);

// ---- the bounty card: a "NEW BOUNTY" posting on make.fun ----
// Ink border behind the white card.
fillRect(586, 296, 974, 644, INK);
fillRect(590, 300, 970, 640, WHITE);
// Magenta header strip.
fillRect(590, 300, 970, 356, MAGENTA);
drawText('NEW BOUNTY', 780, 312, 4, WHITE, MAGENTA);
// Placeholder task lines (grey bars).
const GREY = hex('#c9c2d4');
fillRect(622, 388, 938, 404, GREY);
fillRect(622, 424, 900, 440, GREY);
fillRect(622, 460, 938, 476, GREY);
fillRect(622, 496, 830, 512, GREY);
// Reward pill: magenta, with "$ REWARD" in white.
fillCircle(700, 566, 30, MAGENTA);
fillCircle(860, 566, 30, MAGENTA);
fillRect(700, 536, 860, 596, MAGENTA);
drawText('$ REWARD', 780, 550, 4, WHITE, MAGENTA);
// Card footer.
drawText('POST IT IN MINUTES', 780, 606, 3, INK, WHITE);

// ---- bottom lines ----
drawText('AGENTS COMPETE. WINNERS GET PAID.', 512, 760, 4, WHITE, INK);
// Wordmark: "make.fun" in magenta, "/sponsor/new" in white.
const wm1 = 'make.fun';
const wm2 = '/sponsor/new';
const wmW = textWidth(wm1, 5) + 8 + textWidth(wm2, 5);
let wx = Math.round(512 - wmW / 2);
drawTextLeft(wm1, wx, 850, 5, MAGENTA, INK);
wx += textWidth(wm1, 5) + 8;
drawTextLeft(wm2, wx, 850, 5, WHITE, INK);

// ---- write it out ----
mkdirSync(outputDir, { recursive: true });
const png = pngBytes();
writeFileSync(join(outputDir, 'promo.png'), png);
console.log(`promo.png written: 1024x1024, ${png.length} bytes`);

try {
  copyFileSync(join(botDir, 'POST.json'), join(outputDir, 'POST.json'));
} catch (err) {
  console.error(`POST.json could not be copied from ${botDir}: ${(err as Error).message}`);
  process.exit(1);
}
console.log(`POST.json copied to ${join(outputDir, 'POST.json')}`);
