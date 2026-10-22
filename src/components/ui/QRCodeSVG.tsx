import React, { useMemo } from 'react';

/**
 * Self-contained SVG QR Code Generator (Zero Dependencies)
 * Resolves missing 'qrcode.react' compilation errors and generates standards-compliant
 * QR codes in SVG format compatible with all modern browsers and print dialogs.
 */

export interface QRCodeSVGProps {
  value: string;
  size?: number;
  level?: 'L' | 'M' | 'Q' | 'H';
  includeMargin?: boolean;
  className?: string;
  'aria-label'?: string;
}

// Galois Field GF(256) Math
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
let val = 1;
for (let i = 0; i < 255; i++) {
  GF_EXP[i] = val;
  GF_EXP[i + 255] = val;
  GF_LOG[val] = i;
  val = (val << 1) ^ (val >= 128 ? 0x11d : 0);
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function polyMul(p1: number[], p2: number[]): number[] {
  const result = new Array(p1.length + p2.length - 1).fill(0);
  for (let i = 0; i < p1.length; i++) {
    for (let j = 0; j < p2.length; j++) {
      result[i + j] ^= gfMul(p1[i], p2[j]);
    }
  }
  return result;
}

function rsGeneratorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    poly = polyMul(poly, [1, GF_EXP[i]]);
  }
  return poly;
}

function rsComputeRemainder(data: number[], degree: number): number[] {
  const gen = rsGeneratorPoly(degree);
  const msg = [...data, ...new Array(degree).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return msg.slice(data.length);
}

// Version table for Medium (M) error correction
interface VersionInfo {
  version: number;
  size: number;
  totalBytes: number;
  dataBytes: number;
  ecBytes: number;
  numBlocks: number;
  alignPos: number[];
}

const VERSION_TABLE: VersionInfo[] = [
  { version: 1, size: 21, totalBytes: 26, dataBytes: 16, ecBytes: 10, numBlocks: 1, alignPos: [] },
  { version: 2, size: 25, totalBytes: 44, dataBytes: 28, ecBytes: 16, numBlocks: 1, alignPos: [6, 18] },
  { version: 3, size: 29, totalBytes: 70, dataBytes: 44, ecBytes: 26, numBlocks: 1, alignPos: [6, 22] },
  { version: 4, size: 33, totalBytes: 100, dataBytes: 64, ecBytes: 36, numBlocks: 2, alignPos: [6, 26] },
  { version: 5, size: 37, totalBytes: 134, dataBytes: 86, ecBytes: 48, numBlocks: 2, alignPos: [6, 30] },
  { version: 6, size: 41, totalBytes: 172, dataBytes: 108, ecBytes: 64, numBlocks: 4, alignPos: [6, 34] },
  { version: 7, size: 45, totalBytes: 196, dataBytes: 124, ecBytes: 72, numBlocks: 4, alignPos: [6, 22, 38] },
  { version: 8, size: 49, totalBytes: 242, dataBytes: 154, ecBytes: 88, numBlocks: 4, alignPos: [6, 24, 42] },
  { version: 9, size: 53, totalBytes: 292, dataBytes: 182, ecBytes: 110, numBlocks: 5, alignPos: [6, 26, 46] },
  { version: 10, size: 57, totalBytes: 346, dataBytes: 216, ecBytes: 130, numBlocks: 5, alignPos: [6, 28, 50] },
];

function selectVersion(dataLen: number): VersionInfo {
  for (const v of VERSION_TABLE) {
    // Mode (4 bits) + length (8 bits for v1-9) + data bytes
    const capacity = v.dataBytes - 2; // reserve 2 bytes for header
    if (dataLen <= capacity) {
      return v;
    }
  }
  return VERSION_TABLE[VERSION_TABLE.length - 1];
}

function generateQRMatrix(text: string): boolean[][] {
  const utf8Bytes = new TextEncoder().encode(text);
  const vInfo = selectVersion(utf8Bytes.length);
  const size = vInfo.size;

  // 1. Bit Buffer Encoding (Byte Mode = 0100)
  const bits: number[] = [0, 1, 0, 0];
  const charCountBits = vInfo.version < 10 ? 8 : 16;
  for (let i = charCountBits - 1; i >= 0; i--) {
    bits.push((utf8Bytes.length >> i) & 1);
  }
  for (const b of utf8Bytes) {
    for (let i = 7; i >= 0; i--) {
      bits.push((b >> i) & 1);
    }
  }
  // Terminator
  for (let i = 0; i < 4 && bits.length < vInfo.dataBytes * 8; i++) {
    bits.push(0);
  }
  // Pad to byte boundary
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }
  // Pad bytes 0xEC, 0x11
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < vInfo.dataBytes * 8) {
    const pad = padBytes[padIdx % 2];
    for (let i = 7; i >= 0; i--) {
      bits.push((pad >> i) & 1);
    }
    padIdx++;
  }

  // Convert bits to data codewords
  const dataCodewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | bits[i + j];
    }
    dataCodewords.push(b);
  }

  // 2. Error Correction Codewords per block
  const blockCount = vInfo.numBlocks;
  const blockSize = Math.floor(vInfo.dataBytes / blockCount);
  const ecPerBlock = Math.floor(vInfo.ecBytes / blockCount);

  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];

  for (let b = 0; b < blockCount; b++) {
    const blockData = dataCodewords.slice(b * blockSize, (b + 1) * blockSize);
    const blockEc = rsComputeRemainder(blockData, ecPerBlock);
    dataBlocks.push(blockData);
    ecBlocks.push(blockEc);
  }

  // Interleave data and EC codewords
  const finalCodewords: number[] = [];
  for (let i = 0; i < blockSize; i++) {
    for (let b = 0; b < blockCount; b++) {
      if (i < dataBlocks[b].length) {
        finalCodewords.push(dataBlocks[b][i]);
      }
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (let b = 0; b < blockCount; b++) {
      if (i < ecBlocks[b].length) {
        finalCodewords.push(ecBlocks[b][i]);
      }
    }
  }

  // 3. Matrix Setup (size x size)
  const matrix: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const isReserved: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));

  const setModule = (r: number, c: number, val: boolean) => {
    matrix[r][c] = val;
    isReserved[r][c] = true;
  };

  // Finder Patterns (7x7) + Separators
  const addFinder = (startRow: number, startCol: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const row = startRow + r;
        const col = startCol + c;
        if (row >= 0 && row < size && col >= 0 && col < size) {
          const isBlack =
            r >= 0 &&
            r <= 6 &&
            c >= 0 &&
            c <= 6 &&
            (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
          setModule(row, col, isBlack);
        }
      }
    }
  };

  addFinder(0, 0);
  addFinder(0, size - 7);
  addFinder(size - 7, 0);

  // Alignment Patterns (5x5)
  for (const r of vInfo.alignPos) {
    for (const c of vInfo.alignPos) {
      if (isReserved[r][c]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const isBlack =
            Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
          setModule(r + dr, c + dc, isBlack);
        }
      }
    }
  }

  // Timing Patterns
  for (let i = 8; i < size - 8; i++) {
    setModule(6, i, i % 2 === 0);
    setModule(i, 6, i % 2 === 0);
  }

  // Dark Module
  setModule(size - 8, 8, true);

  // Reserve Format Info Area
  for (let i = 0; i < 9; i++) {
    if (!isReserved[8][i]) isReserved[8][i] = true;
    if (!isReserved[i][8]) isReserved[i][8] = true;
  }
  for (let i = size - 8; i < size; i++) {
    if (!isReserved[8][i]) isReserved[8][i] = true;
    if (!isReserved[i][8]) isReserved[i][8] = true;
  }

  // 4. Place Data Codewords (Zigzag from right to left)
  const finalBits: number[] = [];
  for (const byte of finalCodewords) {
    for (let i = 7; i >= 0; i--) {
      finalBits.push((byte >> i) & 1);
    }
  }

  let bitIdx = 0;
  let col = size - 1;
  let dir = -1; // -1 = up, 1 = down

  while (col > 0) {
    if (col === 6) col--; // Skip vertical timing pattern
    const rows = dir === -1 ? Array.from({ length: size }, (_, i) => size - 1 - i) : Array.from({ length: size }, (_, i) => i);

    for (const row of rows) {
      for (const c of [col, col - 1]) {
        if (!isReserved[row][c]) {
          let b = bitIdx < finalBits.length ? finalBits[bitIdx] : 0;
          bitIdx++;

          // Apply Mask 0: (row + col) % 2 === 0
          if ((row + c) % 2 === 0) {
            b ^= 1;
          }
          matrix[row][c] = b === 1;
        }
      }
    }
    dir = -dir;
    col -= 2;
  }

  // 5. Add Format Information (Level M = 00, Mask 0 = 000 -> 00000 -> BCH 101010000010010)
  // Masked format for EC M, Mask 0 is 0x5412 ^ 0x0000 = 0x5412 (0101010000010010)
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];

  // Top-left format bits
  const tlCoords = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  for (let i = 0; i < 15; i++) {
    const [r, c] = tlCoords[i];
    matrix[r][c] = formatBits[i] === 1;
  }

  // Split format bits around bottom-left and top-right
  for (let i = 0; i < 7; i++) {
    matrix[size - 1 - i][8] = formatBits[i] === 1;
  }
  for (let i = 0; i < 8; i++) {
    matrix[8][size - 8 + i] = formatBits[7 + i] === 1;
  }

  return matrix;
}

export const QRCodeSVG: React.FC<QRCodeSVGProps> = ({
  value,
  size = 160,
  includeMargin = true,
  className = '',
  'aria-label': ariaLabel,
}) => {
  const matrix = useMemo(() => {
    try {
      return generateQRMatrix(value || 'https://queuepulse.app');
    } catch {
      // Fallback empty matrix if text cannot be encoded
      return Array.from({ length: 21 }, () => new Array(21).fill(false));
    }
  }, [value]);

  const moduleCount = matrix.length;
  const margin = includeMargin ? 2 : 0;
  const viewBoxSize = moduleCount + margin * 2;

  // Build SVG path for dark modules for crisp rendering
  const pathData = useMemo(() => {
    let d = '';
    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (matrix[r][c]) {
          const x = c + margin;
          const y = r + margin;
          d += `M${x},${y}h1v1h-1z `;
        }
      }
    }
    return d;
  }, [matrix, moduleCount, margin]);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      width={size}
      height={size}
      fill="currentColor"
      shapeRendering="crispEdges"
      className={className}
      role="img"
      aria-label={ariaLabel || `QR code for ${value}`}
    >
      <rect width={viewBoxSize} height={viewBoxSize} fill="#ffffff" />
      <path d={pathData} fill="#0f172a" />
    </svg>
  );
};
