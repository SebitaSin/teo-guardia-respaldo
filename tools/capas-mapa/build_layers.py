"""Genera las capas del mapa de GUARDIA: antenas, cobertura, relieve respecto del km 0 (ciudad y departamento),
curvas de nivel, sombreado de laderas y flechas de escurrimiento.

Uso: python build_layers.py <carpeta con dem/ y ant/> <carpeta de salida public/mapa>
Fuentes: Copernicus GLO-30 y GLO-90 (ESA; modelo de superficie: incluye árboles y techos),
límite del departamento de OpenStreetMap (relación 3006740), antenas del zip recibido el 14/10/2026.
"""
import glob, json, math, sys, numpy as np, rasterio
from rasterio.merge import merge
from PIL import Image, ImageDraw
from matplotlib.path import Path
from scipy.ndimage import gaussian_filter, map_coordinates
from skimage.measure import find_contours, approximate_polygon

BASE, OUT = sys.argv[1], sys.argv[2]
KM0 = (-34.6162441, -68.3298888)  # nodo OSM donde se cruzan San Martín, Yrigoyen, Mitre y El Libertador
MLAT = 111320.0

# ---------- paleta común (la app la recolorea con la barra de escala) ----------
STOPS = [(-150, (8, 29, 88)), (-80, (37, 52, 148)), (-40, (34, 94, 168)), (-20, (65, 145, 198)), (-8, (127, 205, 230)),
         (-2, (215, 238, 245)), (0, (245, 245, 240)), (2, (252, 245, 210)), (8, (254, 227, 145)), (20, (254, 196, 79)),
         (40, (254, 153, 41)), (80, (217, 95, 14)), (150, (153, 52, 4))]
LEVELS = np.unique(np.concatenate([np.arange(-400, -80, 16), np.arange(-80, -20, 2), np.arange(-20, 20.01, 0.5), np.arange(22, 80, 2),
                                   np.arange(80, 300, 6), np.arange(300, 1000, 20), np.arange(1000, 4800, 250)]))
assert len(LEVELS) <= 254, len(LEVELS)
FUERA = 254  # índice transparente (fuera del departamento)
ESCALA_INICIAL = 150

def palette(escala):
    xs = np.array([s[0] for s in STOPS], float) / 150
    t = np.clip(LEVELS / escala, -1, 1)
    rgb = np.stack([np.interp(t, xs, [s[1][k] for s in STOPS]) for k in range(3)], -1).round().astype(int)
    alpha = (np.minimum(0.58, 0.30 + np.abs(t) / (8 / 150) * 0.28) * 255).round().astype(int)
    return rgb, alpha

def save_relief(rel, mask, path):
    idx = np.clip(np.searchsorted(LEVELS, rel), 0, len(LEVELS) - 1).astype(np.uint8)
    if mask is not None: idx[~mask] = FUERA
    rgb, alpha = palette(ESCALA_INICIAL)
    im = Image.fromarray(idx, "P"); im.putpalette(rgb.flatten().tolist() + [0] * (768 - 3 * len(LEVELS)))
    trns = alpha.tolist() + [0] * (FUERA + 1 - len(LEVELS))
    im.save(path, transparency=bytes(trns))  # sin optimize: el índice tiene que seguir siendo el de LEVELS

# ---------- utilidades de proyección ----------
def merc_y(la): return math.log(math.tan(math.pi / 4 + math.radians(la) / 2))
def merc_h(lat_top, lat_bot, lon_span, w): return int(round(w * abs(merc_y(lat_top) - merc_y(lat_bot)) / math.radians(lon_span)))
def to_mercator(arr, lat_top, lat_bot, out_w, out_h, order=1):
    ys = np.linspace(merc_y(lat_top), merc_y(lat_bot), out_h)
    lats = np.degrees(2 * np.arctan(np.exp(ys)) - math.pi / 2)
    rows = (lat_top - lats) / (lat_top - lat_bot) * arr.shape[0] - 0.5
    cols = (np.arange(out_w) + 0.5) / out_w * arr.shape[1] - 0.5
    rr, cc = np.meshgrid(rows, cols, indexing="ij")
    return map_coordinates(arr, [rr, cc], order=order, mode="nearest")
def sample(arr, lat, lng, ox, oy, step):
    return float(map_coordinates(arr, [[(oy - lat) / step - 0.5], [(lng - ox) / step - 0.5]], order=1)[0])
def gradient_m(arr, step_deg, lat):
    gy, gx = np.gradient(arr)
    return gx / (step_deg * MLAT * math.cos(math.radians(lat))), -gy / (step_deg * MLAT)  # m/m hacia el E y hacia el N
def arrow(lat, lng, ex, nn, min_pct):
    pct = math.hypot(ex, nn) * 100
    if pct < min_pct: return None
    return {"type": "Feature", "properties": {"dir": round((math.degrees(math.atan2(-ex, -nn)) + 360) % 360), "pct": round(pct, 2)},
            "geometry": {"type": "Point", "coordinates": [round(lng, 4), round(lat, 4)]}}
def dump(obj, name): json.dump(obj, open(f"{OUT}/{name}", "w"), ensure_ascii=False, separators=(",", ":"))

# ---------- ciudad (30 m) ----------
src = rasterio.open(f"{BASE}/dem/cop_S35_W069.tif")
dem = src.read(1).astype("float64")
CW, CE, CS, CN = -68.60, -68.10, -34.78, -34.46
c0, r0 = ~src.transform * (CW, CN); c1, r1 = ~src.transform * (CE, CS)
r0, r1, c0, c1 = int(r0), int(r1), int(c0), int(c1)
city = dem[r0:r1, c0:c1]
lon0, lat0 = src.transform * (c0, r0)
px = src.transform.a
smooth1 = gaussian_filter(city, 1.0)
km0_elev = sample(smooth1, *KM0, lon0, lat0, px)
rel_city = smooth1 - km0_elev
c_top, c_bot, c_right = lat0, lat0 - city.shape[0] * px, lon0 + city.shape[1] * px
save_relief(to_mercator(rel_city, c_top, c_bot, 1200, merc_h(c_top, c_bot, c_right - lon0, 1200)), None, f"{OUT}/relieve.png")
gcity = rel_city[::3, ::3]
np.round(gcity * 10).astype("<i2").tofile(f"{OUT}/alturas.bin")
print("km0", round(km0_elev, 1))

smooth3 = gaussian_filter(city, 3.0) - km0_elev
curvas = []
for lev in range(-150, 205, 5):
    for line in find_contours(smooth3, lev):
        if len(line) < 12: continue
        line = approximate_polygon(line, tolerance=0.35)
        curvas.append({"type": "Feature", "properties": {"d": lev}, "geometry": {"type": "LineString",
                       "coordinates": [[round(lon0 + (c + 0.5) * px, 5), round(lat0 - (r + 0.5) * px, 5)] for r, c in line]}})
dump({"type": "FeatureCollection", "features": curvas}, "curvas.json")

ex_c, nn_c = gradient_m(gaussian_filter(city, 10.0), px, -34.62)
fl_city = [a for lat in np.arange(CN - 0.005, CS, -0.010) for lng in np.arange(CW + 0.006, CE, 0.012)
           if (a := arrow(lat, lng, sample(ex_c, lat, lng, lon0, lat0, px), sample(nn_c, lat, lng, lon0, lat0, px), 0.15))]
dump({"type": "FeatureCollection", "features": fl_city}, "pendientes.json")

def flow_field(ex, nn, step, name):
    f = np.stack([ex[::step, ::step], nn[::step, ::step]], -1)
    np.clip(np.round(f * 10000), -32767, 32767).astype("<i2").tofile(f"{OUT}/{name}")
    return f.shape[1], f.shape[0]
fc_w, fc_h = flow_field(ex_c, nn_c, 6, "flujo-ciudad.bin")

# ---------- departamento (90 m) ----------
nom = json.load(open(f"{BASE}/depto_nominatim.json"))["features"][0]
ring = np.array(nom["geometry"]["coordinates"][0])
contorno = approximate_polygon(ring, tolerance=0.002)
DW, DE, DS, DN = -70.26, -66.74, -36.01, -34.09
srcs = [rasterio.open(f) for f in sorted(glob.glob(f"{BASE}/dem/g90_S3[567]_W0[67][0-9].tif"))]
mos, tr = merge(srcs, bounds=(DW, DS, DE, DN))
d90 = mos[0].astype("float64"); g = 1 / 1200
d_top, d_left = tr.f, tr.c
d_bot, d_right = d_top - d90.shape[0] * g, d_left + d90.shape[1] * g
rel_d = gaussian_filter(d90, 0.7) - km0_elev
OW = 2400; OH = merc_h(d_top, d_bot, d_right - d_left, OW)
mask_img = Image.new("L", (OW, OH), 0)
pts = [((lng - d_left) / (d_right - d_left) * OW, (merc_y(d_top) - merc_y(lat)) / (merc_y(d_top) - merc_y(d_bot)) * OH) for lng, lat in ring]
ImageDraw.Draw(mask_img).polygon(pts, fill=255)
mask = np.array(mask_img) > 0
hole = np.zeros_like(mask)
x0 = int(round((lon0 - d_left) / (d_right - d_left) * OW)); x1 = int(round((c_right - d_left) / (d_right - d_left) * OW))
y0 = int(round((merc_y(d_top) - merc_y(c_top)) / (merc_y(d_top) - merc_y(d_bot)) * OH)); y1 = int(round((merc_y(d_top) - merc_y(c_bot)) / (merc_y(d_top) - merc_y(d_bot)) * OH))
hole[y0:y1, x0:x1] = True
save_relief(to_mercator(rel_d, d_top, d_bot, OW, OH), mask & ~hole, f"{OUT}/relieve-depto.png")
gd = rel_d[::5, ::5]
np.round(gd).astype("<i2").tofile(f"{OUT}/alturas-depto.bin")
print("depto", d90.shape, "rel", round(rel_d.min()), round(rel_d.max()), "png", OW, OH)

# sombreado de laderas (luz del noroeste a 45°): sombra en gris oscuro, luz en blanco suave
ex_d, nn_d = gradient_m(gaussian_filter(d90, 1.0), g, -35.0)
n = np.sqrt(ex_d ** 2 + nn_d ** 2 + 1)
az, alt = math.radians(315), math.radians(45)
shade = (-ex_d * math.sin(az) * math.cos(alt) - nn_d * math.cos(az) * math.cos(alt) + math.sin(alt)) / n
dlt = to_mercator(shade - math.sin(alt), d_top, d_bot, OW, OH)
sidx = np.zeros(dlt.shape, np.uint8)
sh = np.clip(-dlt * 2.2, 0, 0.55); hl = np.clip(dlt * 1.6, 0, 0.35)
sidx[dlt < -0.01] = (1 + np.round(sh[dlt < -0.01] / 0.55 * 39)).astype(np.uint8)
sidx[dlt > 0.01] = (41 + np.round(hl[dlt > 0.01] / 0.35 * 39)).astype(np.uint8)
sidx[~mask] = 0
spal = [0, 0, 0] + [17, 24, 39] * 40 + [255, 255, 255] * 40
strns = [0] + [round((i + 1) / 40 * 0.55 * 255) for i in range(40)] + [round((i + 1) / 40 * 0.35 * 255) for i in range(40)]
im = Image.fromarray(sidx, "P"); im.putpalette(spal + [0] * (768 - len(spal))); im.save(f"{OUT}/sombra-depto.png", optimize=True, transparency=bytes(strns))

ex_s, nn_s = gradient_m(gaussian_filter(d90, 12.0), g, -35.0)
poly = Path(ring)
fl_depto = []
for lat in np.arange(DN - 0.02, DS, -0.04):
    for lng in np.arange(DW + 0.02, DE, 0.045):
        if not poly.contains_point((lng, lat)): continue
        a = arrow(lat, lng, sample(ex_s, lat, lng, d_left, d_top, g), sample(nn_s, lat, lng, d_left, d_top, g), 0.1)
        if a:
            if CW <= lng <= CE and CS <= lat <= CN: a["properties"]["c"] = 1
            fl_depto.append(a)
dump({"type": "FeatureCollection", "features": fl_depto}, "pendientes-depto.json")
ex_f, nn_f = gradient_m(gaussian_filter(d90, 8.0), g, -35.0)
fd_w, fd_h = flow_field(ex_f, nn_f, 10, "flujo-depto.bin")
print("flechas ciudad", len(fl_city), "depto", len(fl_depto), "curvas", len(curvas))

# ---------- antenas y cobertura ----------
data = json.load(open(f"{BASE}/ant/antenas_san_rafael.json"))
vsrc = [rasterio.open(f) for f in sorted(glob.glob(f"{BASE}/dem/g90_*.tif"))]
VW, VE, VS, VN = -71.0, -66.0, -37.0, -34.0
vmos, vtr = merge(vsrc, bounds=(VW, VS, VE, VN))
v90 = vmos[0].astype("float64")
def elev90(lat, lng): return sample(v90, lat, lng, VW, VN, g)
def elev_site(lat, lng):
    if CW <= lng <= CE and CS <= lat <= CN: return sample(smooth1, lat, lng, lon0, lat0, px)
    return elev90(lat, lng)

def hata_radius_m(hb, f=850.0, hm=1.5, mapl=135.0):
    lf, lh = math.log10(f), math.log10(hb)
    a = (1.1 * lf - 0.7) * hm - (1.56 * lf - 0.8)
    L0 = 69.55 + 26.16 * lf - 13.82 * lh - a - 2 * math.log10(f / 28) ** 2 - 5.4
    return 1000 * 10 ** ((mapl - L0) / (44.9 - 6.55 * lh))

def viewshed(lat, lng, mast=6.0, target=1.5):
    H, Wd = v90.shape
    r0 = int((VN - lat) / g); c0 = int((lng - VW) / g)
    h0 = v90[max(0, r0 - 3):r0 + 4, max(0, c0 - 3):c0 + 4].max() + mast
    vis = np.zeros(v90.shape, bool); vis[r0, c0] = True
    kR = 4 / 3 * 6371000.0
    per = [(0, c) for c in range(Wd)] + [(H - 1, c) for c in range(Wd)] + [(r, 0) for r in range(H)] + [(r, Wd - 1) for r in range(H)]
    for rt, ct in per:
        k = max(abs(rt - r0), abs(ct - c0))
        t = np.arange(1, k + 1) / k
        rr = np.rint(r0 + (rt - r0) * t).astype(int); cc = np.rint(c0 + (ct - c0) * t).astype(int)
        d = np.hypot((cc - c0) * g * MLAT * np.cos(np.radians(VN - rr * g)), (rr - r0) * g * MLAT)
        e = v90[rr, cc] - d * d / (2 * kR)
        ang = (e - h0) / d
        prev = np.maximum.accumulate(np.concatenate([[-np.inf], ang[:-1]]))
        vis[rr, cc] |= ((e + target - h0) / d) >= prev
    return vis, h0 - mast

out_towers = []
for t in data["towers"]:
    o = dict(t)
    o["lat_archivo"], o["lng_archivo"] = t["lat"], t["lng"]
    o["ubicacion"] = "Boletín Municipal 2022" if t["category"] in ("celular", "infra") else "archivo recibido (sin fuente de coordenadas)"
    o["ubicacion_estado"] = "dato"
    if t["id"] == "vhf_diamante":
        e = elev90(t["lat"], t["lng"])
        o["lat"], o["lng"] = -34.6375, -69.0858
        o["ubicacion_estado"] = "inferida"
        o["ubicacion"] = (f"El punto del archivo ({t['lat']}, {t['lng']}) está a {e:.0f} m, no en una cumbre. "
                          "El único pico de ~2.350 m en 40 km (la altura que indica el archivo) está en -34.6375, -69.0858. Confirmar con Defensa Civil o el Radio Club.")
    if t["id"] == "vhf_nevado":
        o["ubicacion_estado"] = "verificada por relieve"
        o["ubicacion"] = "El punto coincide con la cumbre del Cerro Nevado en el modelo de relieve."
    el = elev_site(o["lat"], o["lng"])
    o["terreno_m"] = round(el)
    o["vs_km0_m"] = round(el - km0_elev)
    if t["category"] in ("celular", "infra") and t.get("height_m"):
        hb = max(float(t["height_m"]), 15.0)
        o["cobertura"] = {"tipo": "radio", "radio_m": round(hata_radius_m(hb), -1),
                          "modelo": f"Okumura-Hata suburbano, 850 MHz, celular en la calle, pérdida máx. 135 dB, antena a {hb:.0f} m"
                                    + (" (la estructura informada mide menos: se usó 15 m; altura real sobre el edificio desconocida)" if float(t["height_m"]) < 15 else "")
                                    + (". A1 Torres: sólo si aloja antenas celulares (no se sabe cuáles)" if t["category"] == "infra" else "")}
    elif t["category"] == "radio_emergencia":
        vis, top = viewshed(o["lat"], o["lng"])
        o["terreno_m"] = round(top); o["vs_km0_m"] = round(top - km0_elev)
        small = vis.reshape(vis.shape[0] // 3, 3, vis.shape[1] // 3, 3).max(axis=(1, 3)).astype(float)
        merc = to_mercator(small, VN, VS, small.shape[1], merc_h(VN, VS, VE - VW, small.shape[1]), order=0) > 0.5
        im = Image.fromarray(merc.astype(np.uint8), "P"); im.putpalette([0, 0, 0, 22, 163, 74] + [0] * 762)
        im.save(f"{OUT}/vista-{t['id']}.png", optimize=True, transparency=0)
        o["cobertura"] = {"tipo": "vista", "png": f"vista-{t['id']}.png", "bounds": {"north": VN, "south": VS, "west": VW, "east": VE},
                          "modelo": "Línea de vista desde la cumbre (mástil supuesto de 6 m) a un handy a 1,5 m, con curvatura terrestre (k=4/3). Es requisito, no garantía de enlace."}
        o["ve_km0"] = bool(vis[int((VN - KM0[0]) / g), int((KM0[1] - VW) / g)])
    else:
        o["cobertura"] = None
    o["respaldo_estado"] = "genérico" if t["category"] == "celular" else ("informado" if t["category"] == "radio_emergencia" else "desconocido")
    out_towers.append(o)

yy, xx = np.mgrid[0:d90.shape[0]:10, 0:d90.shape[1]:10]
inside = poly.contains_points(np.c_[d_left + (xx.ravel() + 0.5) * g, d_top - (yy.ravel() + 0.5) * g]).reshape(xx.shape)
sub = rel_d[::10, ::10][inside]
rango = {"min": round(float(sub.min())), "max": round(float(sub.max()))}
print("rango departamento respecto del km 0", rango)

dump({
    "generado": "2026-10-18",
    "km0": {"lat": KM0[0], "lng": KM0[1], "elev_m": round(km0_elev, 1), "nombre": "Km 0 (San Martín, Yrigoyen, Mitre y El Libertador)"},
    "paleta": {"levels": [round(float(v), 1) for v in LEVELS], "stops": [[s[0], "#%02x%02x%02x" % s[1]] for s in STOPS], "inicial": ESCALA_INICIAL},
    "ciudad": {"png": "relieve.png", "bounds": {"north": c_top, "south": c_bot, "west": lon0, "east": c_right},
               "grilla": {"bin": "alturas.bin", "w": gcity.shape[1], "h": gcity.shape[0], "north": c_top, "west": lon0, "paso": px * 3, "factor": 0.1},
               "fuente": "Copernicus GLO-30 (ESA), 30 m"},
    "depto": {"png": "relieve-depto.png", "sombra": "sombra-depto.png", "bounds": {"north": d_top, "south": d_bot, "west": d_left, "east": d_right},
              "grilla": {"bin": "alturas-depto.bin", "w": gd.shape[1], "h": gd.shape[0], "north": d_top, "west": d_left, "paso": g * 5, "factor": 1},
              "contorno": [[round(float(x), 4), round(float(y), 4)] for x, y in contorno], "fuente": "Copernicus GLO-90 (ESA), 90 m; límite: OpenStreetMap"},
    "rango": rango,
    "pendientes": {"curvas": "curvas.json", "flujo": {
        "ciudad": {"bin": "flujo-ciudad.bin", "w": fc_w, "h": fc_h, "north": lat0 - 0.5 * px, "west": lon0 + 0.5 * px, "paso": px * 6},
        "depto": {"bin": "flujo-depto.bin", "w": fd_w, "h": fd_h, "north": d_top - 0.5 * g, "west": d_left + 0.5 * g, "paso": g * 10}}},
    "antenas": {"fuente": data["meta"], "lista": out_towers},
}, "capas.json")
print("listo")
