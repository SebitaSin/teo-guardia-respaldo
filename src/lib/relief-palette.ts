// Recolorea la imagen de relieve (PNG con paleta) sin bajar datos nuevos: cada índice
// de la paleta es una altura respecto del km 0 ("levels" en capas.json), así que
// cambiar la escala de color es reescribir sólo los bloques PLTE y tRNS del PNG.

export type Stop = [number, string];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** 13 franjas, de más bajo a más alto: azul → verde (nivel del km 0) → rojo. */
export const BANDAS = ["#1e3a8a", "#1d4ed8", "#3b82f6", "#0ea5e9", "#06b6d4", "#14b8a6", "#22c55e", "#84cc16", "#facc15", "#f59e0b", "#f97316", "#ef4444", "#991b1b"];

/** Color de cada altura: cada franja abarca `paso` metros; la del medio (verde) contiene al km 0. Opacidad pareja, sin aclarar. */
export function reliefPalette(levels: number[], paso: number) {
  const rgb = levels.map((level) => rgbOf(BANDAS[6 + Math.max(-6, Math.min(6, Math.round(level / paso)))]));
  const alpha = levels.map(() => 150);
  return { rgb, alpha };
}

/** Devuelve el mismo PNG con la paleta nueva. */
export function repaintPng(png: Uint8Array, levels: number[], paso: number): Uint8Array<ArrayBuffer> {
  const { rgb, alpha } = reliefPalette(levels, paso);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const parts: Uint8Array[] = [png.subarray(0, 8)];
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  let p = 8;
  while (p + 8 <= png.length) {
    const len = view.getUint32(p);
    const type = String.fromCharCode(png[p + 4], png[p + 5], png[p + 6], png[p + 7]);
    const end = p + 12 + len;
    if (type === "PLTE") {
      const data = new Uint8Array(len);
      rgb.forEach((c, i) => { if (3 * i + 2 < len) data.set(c, 3 * i); });
      parts.push(chunk("PLTE", data));
    } else if (type === "tRNS") {
      // Los índices que no son alturas (fuera del departamento) quedan transparentes.
      const data = new Uint8Array(len);
      data.set(alpha.slice(0, len));
      parts.push(chunk("tRNS", data));
    } else parts.push(png.subarray(p, end));
    p = end;
  }
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let o = 0;
  for (const part of parts) { out.set(part, o); o += part.length; }
  return out;
}
