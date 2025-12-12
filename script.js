let map;
let marker;

const OVERLAY_SOURCE_ID = "site-overlays";
const OVERLAY_CIRCLE_05_ID = "circle-05km-fill";
const OVERLAY_CIRCLE_1_ID = "circle-1km-fill";
const OVERLAY_CIRCLE_05_LINE_ID = "circle-05km-line";
const OVERLAY_CIRCLE_1_LINE_ID = "circle-1km-line";
const OVERLAY_CROSS_ID = "cross-lines";

document.addEventListener("DOMContentLoaded", function () {
  setupProj4();
  setupInputTypeUI();
  setupThemeToggle();
  setupMapFullscreen();
  initializeMapLibre();
  setupBasemapSwitcher();
  calculate(); // initial run
});

/* --------------------------
   Theme toggle (persist)
-------------------------- */
function setupThemeToggle() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("theme", theme); } catch (_) {}
    updateIcon();
  }

  function updateIcon() {
    const theme = document.documentElement.getAttribute("data-theme") || "light";
    const ic = btn.querySelector(".theme-ic");
    if (ic) ic.textContent = (theme === "dark") ? "☀" : "☾";
  }

  function initialTheme() {
    try {
      const saved = localStorage.getItem("theme");
      if (saved === "dark" || saved === "light") return saved;
    } catch (_) {}
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  }

  btn.addEventListener("click", function () {
    const cur = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(cur === "dark" ? "light" : "dark");
  });

  applyTheme(initialTheme());
}

/* --------------------------
   Fullscreen map toggle
-------------------------- */
function setupMapFullscreen() {
  const btn = document.getElementById("mapFullscreenBtn");
  const wrap = document.getElementById("mapWrap");
  if (!btn || !wrap) return;

  function setBtn(isFs) {
    btn.textContent = isFs ? "Exit full screen" : "Full screen";
  }

  function resizeSoon() {
    if (!map) return;
    setTimeout(() => map.resize(), 150);
  }

  function isNativeFs() {
    return !!document.fullscreenElement;
  }

  btn.addEventListener("click", function () {
    if (wrap.requestFullscreen && document.exitFullscreen) {
      if (isNativeFs()) document.exitFullscreen();
      else wrap.requestFullscreen();
      return;
    }
    document.body.classList.toggle("map-is-fullscreen");
    setBtn(document.body.classList.contains("map-is-fullscreen"));
    resizeSoon();
  });

  document.addEventListener("fullscreenchange", function () {
    setBtn(isNativeFs());
    resizeSoon();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && document.body.classList.contains("map-is-fullscreen")) {
      document.body.classList.remove("map-is-fullscreen");
      setBtn(false);
      resizeSoon();
    }
  });

  setBtn(false);
}

/* --------------------------
   UI panels
-------------------------- */
function setupInputTypeUI() {
  const inputType = document.getElementById("inputType");
  inputType.addEventListener("change", updateInputPanels);
  updateInputPanels();
}

function updateInputPanels() {
  const type = document.getElementById("inputType").value;

  document.getElementById("panelAddress").classList.toggle("hidden", type !== "address");
  document.getElementById("panelLonLat").classList.toggle("hidden", type !== "lonlat");

  const isLambert = (type === "lambert72" || type === "lambert2008");
  document.getElementById("panelLambert").classList.toggle("hidden", !isLambert);

  const lambertLabel = document.getElementById("lambert_input_label");
  if (lambertLabel) lambertLabel.textContent = (type === "lambert2008") ? "Lambert 2008" : "Lambert 72";
}

/* --------------------------
   Proj4 defs
-------------------------- */
function setupProj4() {
  if (typeof proj4 === "undefined") {
    console.warn("Proj4 not loaded. Lambert conversion will not work.");
    return;
  }

  proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs +type=crs");

  // Lambert 72 (EPSG:31370)
  proj4.defs(
    "EPSG:31370",
    "+proj=lcc +lat_0=90 +lon_0=4.36748666666667 +lat_1=51.1666672333333 +lat_2=49.8333339 +x_0=150000.013 +y_0=5400088.438 +ellps=intl +towgs84=-106.8686,52.2978,-103.7239,0.3366,-0.457,1.8422,-1.2747 +units=m +no_defs +type=crs"
  );

  // Lambert 2008 (EPSG:3812)
  proj4.defs(
    "EPSG:3812",
    "+proj=lcc +lat_0=50.797815 +lon_0=4.35921583333333 +lat_1=49.8333333333333 +lat_2=51.1666666666667 +x_0=649328 +y_0=665262 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs"
  );
}

function wgs84ToLambert(latitude, longitude, crs) {
  const out = proj4("EPSG:4326", crs, [longitude, latitude]);
  return { x: out[0], y: out[1], crs };
}

function lambertToWgs84(x, y, crs) {
  const out = proj4(crs, "EPSG:4326", [x, y]);
  return { longitude: out[0], latitude: out[1] };
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/* --------------------------
   MapLibre: raster styles
-------------------------- */
function rasterStyle(name) {
  let tiles, attribution;
  if (name === "cartoDark") {
    tiles = ["https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"];
    attribution = "© OpenStreetMap contributors © CARTO";
  } else if (name === "osm") {
    tiles = ["https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png"];
    attribution = "© OpenStreetMap contributors";
  } else {
    tiles = ["https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"];
    attribution = "© OpenStreetMap contributors © CARTO";
  }

  return {
    version: 8,
    sources: {
      "raster-tiles": {
        type: "raster",
        tiles,
        tileSize: 256,
        attribution
      }
    },
    layers: [
      { id: "raster", type: "raster", source: "raster-tiles" }
    ]
  };
}

function initializeMapLibre() {
  const mapEl = document.getElementById("map");
  if (typeof maplibregl === "undefined") {
    if (mapEl) {
      mapEl.innerHTML = `<div style="padding:16px;font-family:Inter,Arial;line-height:1.4;">
        Map failed to load (MapLibre not available). Check CDN access.
      </div>`;
    }
    return;
  }

  const initialLat = 50.8503;
  const initialLng = 4.3517;

  map = new maplibregl.Map({
    container: "map",
    style: rasterStyle("cartoLight"),
    center: [initialLng, initialLat],
    zoom: 13,
    attributionControl: true
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");

  // Marker
  marker = new maplibregl.Marker({ draggable: true })
    .setLngLat([initialLng, initialLat])
    .addTo(map);

  marker.on("drag", () => {
    const p = marker.getLngLat();
    updateOverlays(p.lng, p.lat);
  });

  marker.on("dragend", () => {
    const p = marker.getLngLat();
    applyResolvedCoordinates(p.lat, p.lng, null);
  });

  map.on("load", () => {
    addOverlayLayers(initialLng, initialLat);
  });
}

function setupBasemapSwitcher() {
  const sel = document.getElementById("basemapSelect");
  if (!sel) return;
  sel.addEventListener("change", () => {
    if (!map) return;

    const p = marker ? marker.getLngLat() : null;
    const currentOverlays = getOverlayGeoJSON(p ? p.lng : 4.3517, p ? p.lat : 50.8503);

    map.setStyle(rasterStyle(sel.value));
    map.once("styledata", () => {
      // After style switch, re-add overlays
      map.once("load", () => {
        addOverlayLayers(p ? p.lng : 4.3517, p ? p.lat : 50.8503, currentOverlays);
      });
    });
  });
}

/* --------------------------
   Geo helpers for overlays
-------------------------- */
function destinationPoint(lng, lat, bearingDeg, distM) {
  const R = 6378137;
  const br = bearingDeg * Math.PI / 180;
  const φ1 = lat * Math.PI / 180;
  const λ1 = lng * Math.PI / 180;
  const δ = distM / R;

  const sinφ1 = Math.sin(φ1), cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ), cosδ = Math.cos(δ);

  const φ2 = Math.asin(sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(br));
  const λ2 = λ1 + Math.atan2(Math.sin(br) * sinδ * cosφ1, cosδ - sinφ1 * Math.sin(φ2));

  const lng2 = ((λ2 * 180 / Math.PI) + 540) % 360 - 180;
  const lat2 = φ2 * 180 / Math.PI;
  return [lng2, lat2];
}

function circlePolygon(lng, lat, radiusM, steps = 72) {
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const br = (i / steps) * 360;
    coords.push(destinationPoint(lng, lat, br, radiusM));
  }
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [coords] },
    properties: { radius: radiusM }
  };
}

function crossLines(lng, lat, halfLenM) {
  const n = destinationPoint(lng, lat, 0, halfLenM);
  const s = destinationPoint(lng, lat, 180, halfLenM);
  const e = destinationPoint(lng, lat, 90, halfLenM);
  const w = destinationPoint(lng, lat, 270, halfLenM);

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { kind: "ns" },
        geometry: { type: "LineString", coordinates: [s, n] }
      },
      {
        type: "Feature",
        properties: { kind: "ew" },
        geometry: { type: "LineString", coordinates: [w, e] }
      }
    ]
  };
}

function getOverlayGeoJSON(lng, lat) {
  const circles = {
    type: "FeatureCollection",
    features: [
      circlePolygon(lng, lat, 500),
      circlePolygon(lng, lat, 1000)
    ]
  };

  const cross = crossLines(lng, lat, 1100);

  return { circles, cross };
}

function addOverlayLayers(lng, lat, reuseData) {
  const data = reuseData || getOverlayGeoJSON(lng, lat);

  if (map.getSource("circles-src")) map.removeSource("circles-src");
  if (map.getSource("cross-src")) map.removeSource("cross-src");

  // remove layers if exist (style switch)
  [OVERLAY_CIRCLE_05_ID, OVERLAY_CIRCLE_1_ID, OVERLAY_CIRCLE_05_LINE_ID, OVERLAY_CIRCLE_1_LINE_ID, OVERLAY_CROSS_ID]
    .forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });

  map.addSource("circles-src", { type: "geojson", data: data.circles });
  map.addSource("cross-src", { type: "geojson", data: data.cross });

  // circle fills
  map.addLayer({
    id: OVERLAY_CIRCLE_05_ID,
    type: "fill",
    source: "circles-src",
    filter: ["==", ["get", "radius"], 500],
    paint: { "fill-color": "rgba(255,0,0,0.06)" }
  });

  map.addLayer({
    id: OVERLAY_CIRCLE_1_ID,
    type: "fill",
    source: "circles-src",
    filter: ["==", ["get", "radius"], 1000],
    paint: { "fill-color": "rgba(255,0,0,0.04)" }
  });

  // circle outlines
  map.addLayer({
    id: OVERLAY_CIRCLE_05_LINE_ID,
    type: "line",
    source: "circles-src",
    filter: ["==", ["get", "radius"], 500],
    paint: { "line-color": "rgba(255,0,0,0.65)", "line-width": 1 }
  });

  map.addLayer({
    id: OVERLAY_CIRCLE_1_LINE_ID,
    type: "line",
    source: "circles-src",
    filter: ["==", ["get", "radius"], 1000],
    paint: { "line-color": "rgba(255,0,0,0.55)", "line-width": 1 }
  });

  // cross
  map.addLayer({
    id: OVERLAY_CROSS_ID,
    type: "line",
    source: "cross-src",
    paint: { "line-color": "rgba(255,0,0,0.65)", "line-width": 1 }
  });
}

function updateOverlays(lng, lat) {
  if (!map) return;
  const data = getOverlayGeoJSON(lng, lat);
  const s1 = map.getSource("circles-src");
  const s2 = map.getSource("cross-src");
  if (s1) s1.setData(data.circles);
  if (s2) s2.setData(data.cross);
}

/* --------------------------
   MAIN calculate
-------------------------- */
function calculate() {
  const inputType = document.getElementById("inputType").value;

  if (inputType === "address") return calculateFromAddress();
  if (inputType === "lonlat") return calculateFromLonLat();
  if (inputType === "lambert72") return calculateFromLambert("EPSG:31370");
  if (inputType === "lambert2008") return calculateFromLambert("EPSG:3812");
}

function calculateFromAddress() {
  const address = document.getElementById("address").value;
  if (!address || !address.trim()) return alert("Please enter an address.");

  const url = "https://nominatim.openstreetmap.org/search?q=" +
    encodeURIComponent(address) +
    "&format=json&addressdetails=1";

  fetch(url)
    .then(r => r.json())
    .then(data => {
      if (!data || !data.length) return alert("Your address is not correct. Please try again.");
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      applyResolvedCoordinates(lat, lng, null);
    })
    .catch(err => console.error(err));
}

function calculateFromLonLat() {
  const lng = parseFloat(String(document.getElementById("lon_input").value).replace(",", "."));
  const lat = parseFloat(String(document.getElementById("lat_input").value).replace(",", "."));

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return alert("Please enter valid longitude and latitude.");
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return alert("Longitude/Latitude out of range.");

  applyResolvedCoordinates(lat, lng, null);
}

function calculateFromLambert(crs) {
  if (typeof proj4 === "undefined") return alert("Lambert conversion is unavailable (Proj4js not loaded).");

  const x = parseFloat(String(document.getElementById("lambert_x_input").value).replace(",", "."));
  const y = parseFloat(String(document.getElementById("lambert_y_input").value).replace(",", "."));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return alert("Please enter valid Lambert X and Y.");

  const wgs = lambertToWgs84(x, y, crs);
  applyResolvedCoordinates(wgs.latitude, wgs.longitude, { x, y, crs });
}

function applyResolvedCoordinates(lat, lng, lambertDisplay) {
  setText("latitude_inline", Number.isFinite(lat) ? lat.toFixed(6) : "—");
  setText("longitude_inline", Number.isFinite(lng) ? lng.toFixed(6) : "—");

  if (typeof proj4 !== "undefined") {
    if (!lambertDisplay) lambertDisplay = wgs84ToLambert(lat, lng, "EPSG:31370");

    setText("lambert_crs_inline", lambertDisplay.crs === "EPSG:3812" ? "Lambert 2008" : "Lambert 72");
    setText("lambert_x_inline", (Math.round(lambertDisplay.x * 1000) / 1000));
    setText("lambert_y_inline", (Math.round(lambertDisplay.y * 1000) / 1000));
  }

  if (marker && map) {
    marker.setLngLat([lng, lat]);
    map.jumpTo({ center: [lng, lat] });
    updateOverlays(lng, lat);
  }

  calculateElevation(lat, lng);
  calculateAllDirectons(lat, lng);
}

/* --------------------------
   Elevation sampling
-------------------------- */
function calculateAllDirectons(lat, lng) {
  const north05 = destinationPoint(lng, lat, 0, 500);
  const south05 = destinationPoint(lng, lat, 180, 500);
  const east05 = destinationPoint(lng, lat, 90, 500);
  const west05 = destinationPoint(lng, lat, 270, 500);

  const north1 = destinationPoint(lng, lat, 0, 1000);
  const south1 = destinationPoint(lng, lat, 180, 1000);
  const east1 = destinationPoint(lng, lat, 90, 1000);
  const west1 = destinationPoint(lng, lat, 270, 1000);

  calculateElevationForDirection("north_05km", north05[1], north05[0]);
  calculateElevationForDirection("south_05km", south05[1], south05[0]);
  calculateElevationForDirection("east_05km", east05[1], east05[0]);
  calculateElevationForDirection("west_05km", west05[1], west05[0]);

  calculateElevationForDirection("north_1km", north1[1], north1[0]);
  calculateElevationForDirection("south_1km", south1[1], south1[0]);
  calculateElevationForDirection("east_1km", east1[1], east1[0]);
  calculateElevationForDirection("west_1km", west1[1], west1[0]);
}

function calculateElevationForDirection(direction, lat, lng) {
  const apiUrl = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`;

  fetch(apiUrl)
    .then(r => r.json())
    .then(data => {
      if (data.elevation && data.elevation.length > 0) {
        document.getElementById(`elevation_${direction}`).textContent = `${data.elevation[0]}`;
        calculateTotalElevation();
      } else {
        document.getElementById(`elevation_${direction}`).textContent = "Data not available";
      }
    })
    .catch(err => console.error(err));
}

function calculateElevation(lat, lng) {
  const apiUrl = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`;

  fetch(apiUrl)
    .then(r => r.json())
    .then(data => {
      if (data.elevation && data.elevation.length > 0) {
        document.getElementById("elevation").textContent = `${data.elevation[0]}`;
        calculateTotalElevation();
      } else {
        document.getElementById("elevation").textContent = "Data not available";
      }
    })
    .catch(err => console.error(err));
}

/* --------------------------
   Orography factor + colored comment
-------------------------- */
function calculateTotalElevation() {
  const eN05 = parseFloat(document.getElementById("elevation_north_05km").textContent);
  const eN1 = parseFloat(document.getElementById("elevation_north_1km").textContent);
  const eS05 = parseFloat(document.getElementById("elevation_south_05km").textContent);
  const eS1 = parseFloat(document.getElementById("elevation_south_1km").textContent);
  const eE05 = parseFloat(document.getElementById("elevation_east_05km").textContent);
  const eE1 = parseFloat(document.getElementById("elevation_east_1km").textContent);
  const eW05 = parseFloat(document.getElementById("elevation_west_05km").textContent);
  const eW1 = parseFloat(document.getElementById("elevation_west_1km").textContent);
  const eC = parseFloat(document.getElementById("elevation").textContent);

  if (![eN05, eN1, eS05, eS1, eE05, eE1, eW05, eW1, eC].every(Number.isFinite)) return;

  const sum1km = eN1 + eS1 + eE1 + eW1;
  const sum05km = eN05 + eS05 + eE05 + eW05;

  let towerHeight = parseFloat(document.getElementById("height").value);
  if (!Number.isFinite(towerHeight)) towerHeight = 30;

  const Am = 1 / 10 * (2 * eC + sum1km + sum05km);
  const DeltaAc = eC - Am;

  let OrographyFactor = (towerHeight > 10)
    ? 1 + 0.004 * DeltaAc * Math.exp(-0.014 * (towerHeight - 10))
    : 1 + 0.004 * DeltaAc;

  OrographyFactor = Math.ceil(OrographyFactor * 100) / 100;
  document.getElementById("orography_factor").textContent = OrographyFactor.toFixed(2);

  const commentEl = document.getElementById("orography_factor_comment");
  commentEl.classList.remove("comment-good", "comment-bad");

  if (OrographyFactor <= 1.0) {
    commentEl.textContent = "Site is considered flat. Standard pieces may be used";
    commentEl.classList.add("comment-good");
  } else if (OrographyFactor > 1.15) {
    commentEl.textContent = "Site is NOT flat. A detailed analysis is required. Standard pieces may not be used without an individual stability study.";
    commentEl.classList.add("comment-bad");
  } else {
    commentEl.textContent = "Site is NOT flat. Standard pieces may not be used without an individual stability study.";
    commentEl.classList.add("comment-bad");
  }
}
