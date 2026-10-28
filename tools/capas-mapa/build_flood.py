"""Zonas inundables ESTIMADAS por relieve para el oasis de San Rafael (no es mapa oficial).
Uso: python build_flood.py <carpeta con dem/> <carpeta public/mapa>   (correr después de build_layers.py)

Con el modelo Copernicus GLO-30 (incluye árboles y techos):
- vías de escurrimiento: celdas que juntan el agua de 10 km² o más (acumulación de flujo D8);
- franja baja: terreno a menos de 1,5 m por encima de la vía de escurrimiento más cercana (HAND);
- bajos: depresiones cerradas de 0,5 m o más de profundidad y 2 ha o más, donde el agua se junta.
No incluye canales de riego, desagües ni obras: sirve para ver por dónde baja y dónde se junta el agua.
"""
import json, math, sys, numpy as np, rasterio
from rasterio.windows import from_bounds
from scipy.ndimage import gaussian_filter, label, map_coordinates
from skimage.measure import approximate_polygon
from PIL import Image
if not hasattr(np, "in1d"): np.in1d = lambda a, b, **k: np.isin(a, b, **k)  # pysheds con numpy 2
from pysheds.grid import Grid

BASE, OUT = sys.argv[1], sys.argv[2]
CW, CE, CS, CN = -68.60, -68.10, -34.78, -34.46   # mismo recorte que el relieve de la ciudad
CANAL_KM2, HAND_M, BAJO_M, BAJO_HA = 10.0, 1.5, 0.5, 2.0

src = rasterio.open(f"{BASE}/dem/cop_S35_W069.tif")
win = from_bounds(CW, CS, CE, CN, src.transform).round_offsets().round_lengths()
dem = gaussian_filter(src.read(1, window=win).astype("float64"), 1.0)
tr = src.window_transform(win)
prof = src.profile.copy(); prof.update(width=dem.shape[1], height=dem.shape[0], transform=tr, dtype="float32", count=1, compress=None, tiled=False, nodata=-9999)
tmp = f"{BASE}/flood_dem.tif"
with rasterio.open(tmp, "w", **prof) as dst: dst.write(dem.astype("float32"), 1)

grid = Grid.from_raster(tmp); d = grid.read_raster(tmp)
filled = grid.fill_depressions(grid.fill_pits(d)); flat = grid.resolve_flats(filled)
fdir = grid.flowdir(flat); acc = grid.accumulation(fdir)
px = tr.a; lat0, lon0 = tr.f, tr.c
cell_km2 = (px * 111320 * math.cos(math.radians(-34.62))) * (px * 111320) / 1e6
canal = acc > CANAL_KM2 / cell_km2
hand = np.asarray(grid.compute_hand(fdir, flat, canal), dtype="float64")
depth = np.asarray(filled, dtype="float64") - np.asarray(d, dtype="float64")
acc = np.asarray(acc, dtype="float64"); canal = np.asarray(canal, dtype=bool); fdir = np.asarray(fdir)

lab, _ = label(depth >= BAJO_M)
sizes = np.bincount(lab.ravel()) * cell_km2 * 100
bajo = (sizes >= BAJO_HA)[lab] & (lab > 0)
franja = (hand < HAND_M) & ~bajo
print("franja baja %", round(100 * franja.mean(), 1), "bajos", int(((sizes >= BAJO_HA)[1:]).sum()), "km2 bajos", round(bajo.sum() * cell_km2, 2))

# imagen (misma geometría que relieve.png): 0 transparente, 1 franja baja, 2 bajo
def merc_y(la): return math.log(math.tan(math.pi / 4 + math.radians(la) / 2))
H, W = dem.shape
top, bot, right = lat0, lat0 - H * px, lon0 + W * px
OW = 1200; OH = int(round(OW * abs(merc_y(top) - merc_y(bot)) / math.radians(right - lon0)))
ys = np.linspace(merc_y(top), merc_y(bot), OH); lats = np.degrees(2 * np.arctan(np.exp(ys)) - math.pi / 2)
rows = (top - lats) / (top - bot) * H - 0.5; cols = (np.arange(OW) + 0.5) / OW * W - 0.5
rr, cc = np.meshgrid(rows, cols, indexing="ij")
clase = np.zeros(dem.shape, np.uint8); clase[franja] = 1; clase[bajo] = 2
img = map_coordinates(clase, [rr, cc], order=0, mode="nearest").astype(np.uint8)
im = Image.fromarray(img, "P"); im.putpalette([0, 0, 0, 59, 130, 246, 220, 38, 38] + [0] * 759)
im.save(f"{OUT}/inundable.png", optimize=True, transparency=bytes([0, 110, 170]))

# altura sobre la vía de escurrimiento más cercana, para el clic (90 m, decímetros)
gh = np.where(np.isfinite(hand), hand, 3200.0)[::3, ::3]  # sin vía de escurrimiento aguas abajo: valor alto
np.clip(np.round(gh * 10), 0, 32000).astype("<i2").tofile(f"{OUT}/hand.bin")

# vías de escurrimiento como líneas (de cabecera o confluencia hasta la confluencia siguiente)
OFF = {64: (-1, 0), 128: (-1, 1), 1: (0, 1), 2: (1, 1), 4: (1, 0), 8: (1, -1), 16: (0, -1), 32: (-1, -1)}
idx = np.argwhere(canal)
down = {}
for r, c in idx:
    o = OFF.get(int(fdir[r, c]))
    if not o: continue
    r2, c2 = r + o[0], c + o[1]
    if 0 <= r2 < H and 0 <= c2 < W and canal[r2, c2]: down[(r, c)] = (r2, c2)
up = {}
for a, b in down.items(): up[b] = up.get(b, 0) + 1
starts = [tuple(p) for p in idx if up.get(tuple(p), 0) != 1]
feats = []
for s in starts:
    line = [s]; cur = s
    while cur in down:
        cur = down[cur]; line.append(cur)
        if up.get(cur, 0) != 1: break
    if len(line) < 3: continue
    arr = approximate_polygon(np.array(line, float), tolerance=0.8)
    km2 = acc[line[-1]] * cell_km2
    feats.append({"type": "Feature", "properties": {"km2": round(float(km2), 1)}, "geometry": {"type": "LineString",
                  "coordinates": [[round(lon0 + (c + 0.5) * px, 5), round(lat0 - (r + 0.5) * px, 5)] for r, c in arr]}})
json.dump({"type": "FeatureCollection", "features": feats}, open(f"{OUT}/cauces.json", "w"), separators=(",", ":"))
print("tramos", len(feats))

meta_path = f"{OUT}/capas.json"
meta = json.load(open(meta_path))
meta["inundable"] = {
    "png": "inundable.png", "bounds": {"north": top, "south": bot, "west": lon0, "east": right}, "cauces": "cauces.json",
    "hand": {"bin": "hand.bin", "w": gh.shape[1], "h": gh.shape[0], "north": top, "west": lon0, "paso": px * 3, "factor": 0.1},
    "criterio": f"Vías de escurrimiento: juntan el agua de {CANAL_KM2:g} km² o más. Franja baja: menos de {HAND_M:g} m por encima de la vía más cercana. Bajos: depresiones de {BAJO_M:g} m o más y {BAJO_HA:g} ha o más.",
}
json.dump(meta, open(meta_path, "w"), ensure_ascii=False, separators=(",", ":"))
print("listo")
