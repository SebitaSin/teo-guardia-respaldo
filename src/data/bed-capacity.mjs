// Capacidad física de UCO confirmada por Sebastián el 26/10/2026.
export function ucoBedKey(value) {
  const match = /^(?:C(?:AMA)?[\s/.-]*)?0*([1-6])$/i.exec(String(value ?? "").trim());
  return match?.[1] ?? null;
}

/** Una fila por cama física. La fila vista en la foto prevalece sobre el arrastre anterior. */
export function applyBedCapacity(beds, slug) {
  const out = [];
  const uco = new Map();
  for (const bed of beds) {
    if ((slug ?? bed.slug) !== "uco") { out.push(bed); continue; }
    const key = ucoBedKey(bed.cama);
    if (!key) continue;
    const index = uco.get(key);
    if (index === undefined) { uco.set(key, out.length); out.push(bed); }
    else if (bed.visto === true && out[index].visto !== true) out[index] = bed;
  }
  return out;
}
