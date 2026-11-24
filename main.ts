// main.ts — entry for post-x-promote-make-your-own-bounty-01 (Node 22).
//
// What this program is for
// ------------------------
// The deliverable of this bounty is a single post on X quoting make.fun's
// "make your own bounty" announcement
// (https://x.com/makefunai/status/2124915864336236646), with an attached
// photo, the make.fun name (or the @makefunai tag) and the entrant's play
// code in the text. POST.json, at the repository root, records that post's
// URL: {"url": "https://x.com/<handle>/status/<id>"} and nothing else.
//
// Running this file produces the two outputs the grader inspects:
//   1. promo.png — the post's photo, rendered from scratch by the drawing
//      stages below and written into the output directory;
//   2. POST.json — copied verbatim from the bot directory.
// POST.json itself is authored by hand once the real post exists; this
// program only forwards it and never fabricates a URL.
//
// Both outputs are pure functions of this source: no network access, no
// clock reads, no randomness — repeated runs emit identical bytes.
//
// Local run:
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
// Grader defaults: bot dir /bot, output dir /output.

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// ---- run configuration --------------------------------------------------

interface RunPaths {
  botDir: string;
  outputDir: string;
}

function readRunPaths(env: Record<string, string | undefined>): RunPaths {
  return {
    botDir: env.MAKEFUN_BOT_DIR ?? '/bot',
    outputDir: env.MAKEFUN_OUTPUT_DIR ?? '/output',
  };
}

const paths = readRunPaths(process.env);

// ---- framebuffer ----------------------------------------------------------
// One flat RGBA buffer spans the whole 1024x1024 canvas. Alpha is pinned
// to fully opaque everywhere, so a pixel is effectively an RGB triple with
// a constant 255 riding in the alpha slot.

const CANVAS_W = 1024;
const CANVAS_H = 1024;
const frame = Buffer.alloc(CANVAS_W * CANVAS_H * 4);

type Rgba = [number, number, number, number];

function parseHexColor(css: string): Rgba {
  const value = parseInt(css.slice(1), 16);
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  return [red, green, blue, 255];
}

function plotPixel(x: number, y: number, color: Rgba): void {
  const xi = x | 0;
  const yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= CANVAS_W || yi >= CANVAS_H) return;
  const offset = (yi * CANVAS_W + xi) * 4;
  frame[offset] = color[0];
  frame[offset + 1] = color[1];
  frame[offset + 2] = color[2];
  frame[offset + 3] = 255;
}

// Filled rectangle between two corners, clipped to the canvas.
function paintRect(xFrom: number, yFrom: number, xTo: number, yTo: number, color: Rgba): void {
  const top = Math.max(0, yFrom | 0);
  const bottom = Math.min(CANVAS_H - 1, yTo | 0);
  const left = Math.max(0, xFrom | 0);
  const right = Math.min(CANVAS_W - 1, xTo | 0);
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) plotPixel(x, y, color);
  }
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mixColor(first: Rgba, second: Rgba, t: number): Rgba {
  return [
    mix(first[0], second[0], t) | 0,
    mix(first[1], second[1], t) | 0,
    mix(first[2], second[2], t) | 0,
    255,
  ];
}

// ---- PNG encoding (built on node:zlib only) -----------------------------
// The encoder emits a minimal truecolor-with-alpha PNG: the signature,
// an IHDR chunk, one IDAT chunk holding the zlib stream of filter-0
// scanlines, and the closing IEND. Chunk CRCs use the standard PNG
// polynomial, table-driven, built lazily on first use.

const CRC_POLY = 0xedb88320;
let crcTable: Int32Array | null = null;

function buildCrcTable(): Int32Array {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let entry = n;
    for (let k = 0; k < 8; k++) {
      entry = (entry & 1) !== 0 ? CRC_POLY ^ (entry >>> 1) : entry >>> 1;
    }
    table[n] = entry;
  }
  return table;
}

function crc32Of(bytes: Buffer): number {
  if (crcTable === null) crcTable = buildCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const chunkBuf = Buffer.alloc(12 + data.length);
  chunkBuf.writeUInt32BE(data.length, 0);
  chunkBuf.write(type, 4, 'ascii');
  data.copy(chunkBuf, 8);
  const crc = crc32Of(chunkBuf.subarray(4, 8 + data.length));
  chunkBuf.writeUInt32BE(crc, 8 + data.length);
  return chunkBuf;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function encodeFrameAsPng(): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(CANVAS_W, 0);
  header.writeUInt32BE(CANVAS_H, 4);
  header[8] = 8;  // bit depth
  header[9] = 6;  // colour type: truecolor with alpha
  header[10] = 0; // compression method
  header[11] = 0; // filter method
  header[12] = 0; // no interlace

  // Lay the framebuffer out as scanlines, each prefixed with filter byte 0.
  const rowBytes = 1 + CANVAS_W * 4;
  const scanlines = Buffer.alloc(CANVAS_H * rowBytes);
  for (let y = 0; y < CANVAS_H; y++) {
    const rowStart = y * rowBytes;
    scanlines[rowStart] = 0;
    frame.copy(scanlines, rowStart + 1, y * CANVAS_W * 4, (y + 1) * CANVAS_W * 4);
  }

  const idat = deflateSync(scanlines, { level: 9 });
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- 5x7 bitmap typeface --------------------------------------------------
// Each glyph is seven strings of five characters; '#' marks a filled cell.
// The table covers exactly the characters the scene's copy uses.
const GLYPHS: Record<string, string[]> = {
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

function measureText(text: string, scale: number): number {
  // Each glyph occupies a 5-unit cell plus a 1-unit gap; the gap after the
  // final character is not part of the measured width.
  return text.length * 6 * scale - scale;
}

// Stamp a string with its left edge at x and its top edge at y. The string
// is drawn five times: four offset passes in the outline colour (left,
// right, up, down) and one final pass in the face colour — together they
// produce the thick outline that keeps the copy legible over the scene.
function stampTextLeft(text: string, x: number, y: number, scale: number, face: Rgba, outline: Rgba): void {
  const outlineStep = Math.max(2, Math.round(scale / 3));
  const stampPass = (color: Rgba, dx: number, dy: number): void => {
    let cursorX = x + dx;
    for (const ch of text) {
      const glyph = GLYPHS[ch] || GLYPHS[' '];
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (glyph[row][col] === '#') {
            paintRect(
              cursorX + col * scale,
              y + dy + row * scale,
              cursorX + (col + 1) * scale - 1,
              y + dy + (row + 1) * scale - 1,
              color,
            );
          }
        }
      }
      cursorX += 6 * scale;
    }
  };
  stampPass(outline, -outlineStep, 0);
  stampPass(outline, outlineStep, 0);
  stampPass(outline, 0, -outlineStep);
  stampPass(outline, 0, outlineStep);
  stampPass(face, 0, 0);
}

// Stamp a string centred horizontally on centreX, top edge at y.
function stampTextCentred(text: string, centreX: number, y: number, scale: number, face: Rgba, outline: Rgba): void {
  const leftEdge = Math.round(centreX - measureText(text, scale) / 2);
  stampTextLeft(text, leftEdge, y, scale, face, outline);
}

// ---- shape primitives -----------------------------------------------------

function paintDisc(centreX: number, centreY: number, radius: number, color: Rgba): void {
  const radiusSq = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radiusSq) plotPixel(centreX + dx, centreY + dy, color);
    }
  }
}

function paintEllipse(centreX: number, centreY: number, radiusX: number, radiusY: number, color: Rgba): void {
  const rxSq = radiusX * radiusX;
  const rySq = radiusY * radiusY;
  for (let dy = -radiusY; dy <= radiusY; dy++) {
    for (let dx = -radiusX; dx <= radiusX; dx++) {
      if ((dx * dx) / rxSq + (dy * dy) / rySq <= 1) plotPixel(centreX + dx, centreY + dy, color);
    }
  }
}

// A thick segment is drawn by stamping a disc at every step along it.
function paintThickSegment(xFrom: number, yFrom: number, xTo: number, yTo: number, width: number, color: Rgba): void {
  const deltaX = xTo - xFrom;
  const deltaY = yTo - yFrom;
  const steps = Math.max(Math.abs(deltaX), Math.abs(deltaY), 1);
  const stampRadius = Math.max(1, Math.round(width / 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    paintDisc(Math.round(xFrom + deltaX * t), Math.round(yFrom + deltaY * t), stampRadius, color);
  }
}

// Filled polygon via a scanline even-odd fill: for each row, gather the
// edge crossings, sort them, and fill between consecutive pairs.
function paintPolygon(points: [number, number][], color: Rgba): void {
  let topY = Infinity;
  let bottomY = -Infinity;
  for (const [, py] of points) {
    if (py < topY) topY = py;
    if (py > bottomY) bottomY = py;
  }
  for (let y = Math.ceil(topY); y <= Math.floor(bottomY); y++) {
    const crossings: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[(i + 1) % points.length];
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        crossings.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      }
    }
    crossings.sort((a, b) => a - b);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      for (let x = Math.ceil(crossings[k]); x <= Math.floor(crossings[k + 1]); x++) {
        plotPixel(x, y, color);
      }
    }
  }
}

// Regular star polygon: vertexCount vertices alternating between the
// outer and inner radius, with the first vertex pointing straight up.
// Eight vertices give the four-pointed sparkle (the ghost's eyes); ten
// give the five-pointed star (the coins' emblem).
function paintStar(centreX: number, centreY: number, vertexCount: number, outerRadius: number, innerRadius: number, color: Rgba): void {
  const points: [number, number][] = [];
  for (let i = 0; i < vertexCount; i++) {
    const angle = (Math.PI / (vertexCount / 2)) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    points.push([centreX + radius * Math.cos(angle), centreY + radius * Math.sin(angle)]);
  }
  paintPolygon(points, color);
}

// ---- palette ----
const INK = parseHexColor('#14081f');      // near-black purple
const WHITE = parseHexColor('#ffffff');
const MAGENTA = parseHexColor('#ff2e88');  // make.fun coin magenta
const MAGENTA_LT = parseHexColor('#ff5da2');
const GOLD = parseHexColor('#ffe9a8');

// ---- scene, stage 1: backdrop ---------------------------------------------
// Deep purple gradient (darker at the top, magenta glow low), a fixed
// star field, and small magenta coins drifting at the sides.

const SKY_TOP = parseHexColor('#1b0b33');
const SKY_MID = parseHexColor('#3d1157');
const SKY_LOW = parseHexColor('#7a1e63');

// A small floating coin: ink rim, magenta face, white star emblem.
function paintMiniCoin(centreX: number, centreY: number, radius: number): void {
  paintDisc(centreX, centreY, radius, INK);
  paintDisc(centreX, centreY, radius - 3, MAGENTA);
  paintStar(centreX, centreY, 10, Math.round(radius * 0.62), Math.round(radius * 0.26), WHITE);
}

function paintBackdrop(): void {
  // Two-segment gradient: top -> mid across the upper half of the canvas,
  // then mid -> low across the lower half.
  for (let y = 0; y < CANVAS_H; y++) {
    const t = y / CANVAS_H;
    const rowColor = t < 0.5
      ? mixColor(SKY_TOP, SKY_MID, t * 2)
      : mixColor(SKY_MID, SKY_LOW, (t - 0.5) * 2);
    for (let x = 0; x < CANVAS_W; x++) plotPixel(x, y, rowColor);
  }

  // Star positions are constants, so the sky is identical on every run.
  const starPositions: [number, number][] = [
    [90, 60], [180, 34], [420, 80], [520, 40], [950, 90], [880, 40],
    [640, 55], [300, 110], [120, 260], [930, 300], [60, 420], [980, 480],
  ];
  for (const [starX, starY] of starPositions) paintDisc(starX, starY, 2, WHITE);

  paintMiniCoin(120, 700, 30);
  paintMiniCoin(930, 700, 26);
  paintMiniCoin(505, 700, 20);
}

paintBackdrop();

// ---- scene, stage 2: headline ---------------------------------------------

stampTextCentred('MAKE YOUR OWN', 512, 48, 9, WHITE, INK);
stampTextCentred('BOUNTY', 512, 150, 11, MAGENTA, INK);

// ---- scene, stage 3: the make.fun ghost -----------------------------------
// White body with a thick ink outline and sparkle eyes; one round hand
// holds up a magenta coin marked with a white star.

const GHOST_X = 310; // ghost centre x
const GHOST_Y = 320; // ghost top y

function ghostSilhouette(centreX: number, topY: number, width: number, height: number, color: Rgba): void {
  // Domed head (an ellipse), straight sides, and a wavy bottom hem made
  // of three scallops.
  paintEllipse(centreX, topY + width / 2, width / 2, width / 2, color);
  paintRect(centreX - width / 2, topY + width / 2, centreX + width / 2, topY + height - 26, color);
  for (let i = 0; i < 3; i++) {
    const scallopX = centreX - width / 2 + (i + 0.5) * (width / 3);
    paintDisc(scallopX, topY + height - 26, width / 6, color);
  }
}

function drawGhost(): void {
  // Ground shadow first — the ghost floats above it.
  paintEllipse(GHOST_X, 700, 110, 16, parseHexColor('#0e0618'));

  // The ink silhouette is slightly larger than the white body laid over
  // it, which is what leaves the thick outline visible.
  ghostSilhouette(GHOST_X, GHOST_Y, 250, 300, INK);
  ghostSilhouette(GHOST_X, GHOST_Y, 236, 288, WHITE);

  // Sparkle eyes.
  paintStar(GHOST_X - 48, GHOST_Y + 130, 8, 30, 9, INK);
  paintStar(GHOST_X + 48, GHOST_Y + 130, 8, 30, 9, INK);

  // Smile: a shallow arc stroked as a chain of short thick segments.
  let prevX: number | null = null;
  let prevY: number | null = null;
  for (let step = 0; step <= 16; step++) {
    const t = (step / 16) * Math.PI;
    const sx = Math.round(GHOST_X + 34 * Math.cos(t));
    const sy = Math.round(GHOST_Y + 182 + 16 * Math.sin(t));
    if (prevX !== null && prevY !== null) paintThickSegment(prevX, prevY, sx, sy, 4, INK);
    prevX = sx;
    prevY = sy;
  }

  // The coin is painted before the hand so the hand overlaps its rim and
  // reads as gripping it.
  paintDisc(GHOST_X - 172, GHOST_Y + 200, 58, INK);
  paintDisc(GHOST_X - 172, GHOST_Y + 200, 52, MAGENTA);
  paintDisc(GHOST_X - 172, GHOST_Y + 200, 44, MAGENTA_LT);
  paintStar(GHOST_X - 172, GHOST_Y + 200, 10, 34, 14, WHITE);

  // Round little hand, reaching out to the left.
  paintDisc(GHOST_X - 118, GHOST_Y + 206, 26, INK);
  paintDisc(GHOST_X - 118, GHOST_Y + 206, 20, WHITE);
}

drawGhost();

// ---- scene, stage 4: the bounty card ---------------------------------------
// A mock "NEW BOUNTY" posting on make.fun: white card on an ink frame,
// magenta header strip, grey placeholder bars standing in for the task
// text, a magenta reward pill, and a one-line footer.

function drawBountyCard(): void {
  paintRect(586, 296, 974, 644, INK);   // frame
  paintRect(590, 300, 970, 640, WHITE); // card face

  paintRect(590, 300, 970, 356, MAGENTA); // header strip
  stampTextCentred('NEW BOUNTY', 780, 312, 4, WHITE, MAGENTA);

  const PLACEHOLDER = parseHexColor('#c9c2d4');
  paintRect(622, 388, 938, 404, PLACEHOLDER);
  paintRect(622, 424, 900, 440, PLACEHOLDER);
  paintRect(622, 460, 938, 476, PLACEHOLDER);
  paintRect(622, 496, 830, 512, PLACEHOLDER);

  // Reward pill: two end discs with the bar between them.
  paintDisc(700, 566, 30, MAGENTA);
  paintDisc(860, 566, 30, MAGENTA);
  paintRect(700, 536, 860, 596, MAGENTA);
  stampTextCentred('$ REWARD', 780, 550, 4, WHITE, MAGENTA);

  stampTextCentred('POST IT IN MINUTES', 780, 606, 3, INK, WHITE);
}

drawBountyCard();

// ---- scene, stage 5: footer lines ------------------------------------------

stampTextCentred('AGENTS COMPETE. WINNERS GET PAID.', 512, 760, 4, WHITE, INK);

// Wordmark: "make.fun" in magenta followed by "/sponsor/new" in white,
// the pair centred on the canvas as a single unit.
const wordmarkLeft = 'make.fun';
const wordmarkRight = '/sponsor/new';
const wordmarkWidth = measureText(wordmarkLeft, 5) + 8 + measureText(wordmarkRight, 5);
let wordmarkX = Math.round(512 - wordmarkWidth / 2);
stampTextLeft(wordmarkLeft, wordmarkX, 850, 5, MAGENTA, INK);
wordmarkX += measureText(wordmarkLeft, 5) + 8;
stampTextLeft(wordmarkRight, wordmarkX, 850, 5, WHITE, INK);

// ---- emit the outputs -------------------------------------------------------

function emitOutputs(): void {
  mkdirSync(paths.outputDir, { recursive: true });

  const png = encodeFrameAsPng();
  writeFileSync(join(paths.outputDir, 'promo.png'), png);
  console.log(`promo.png written: 1024x1024, ${png.length} bytes`);

  const postSource = join(paths.botDir, 'POST.json');
  const postTarget = join(paths.outputDir, 'POST.json');
  try {
    copyFileSync(postSource, postTarget);
  } catch (err) {
    console.error(`POST.json could not be copied from ${paths.botDir}: ${(err as Error).message}`);
    process.exit(1);
  }
  console.log(`POST.json copied to ${postTarget}`);
}

emitOutputs();
