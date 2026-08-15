const GOOGLE_MAPS_BASE = "https://maps.googleapis.com/maps/api";

function getMapsKey() {
  return (process.env.GOOGLE_MAPS_API_KEY || "").trim();
}

async function proxyGoogleMaps(path, query) {
  const key = getMapsKey();
  if (!key) {
    const err = new Error("Maps API not configured on server");
    err.status = 503;
    throw err;
  }

  const params = new URLSearchParams({ ...query, key });
  const url = `${GOOGLE_MAPS_BASE}${path}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`Google Maps API returned ${res.status}`);
    err.status = 502;
    throw err;
  }
  return res.json();
}

exports.getDirections = async (req, res) => {
  try {
    const { origin, destination, mode = "driving" } = req.query;
    if (!origin || !destination) {
      return res.status(400).json({ error: "origin and destination are required" });
    }
    const data = await proxyGoogleMaps("/directions/json", {
      origin: String(origin),
      destination: String(destination),
      mode: String(mode),
    });
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({
      error: err.message || "Directions request failed",
    });
  }
};

exports.geocode = async (req, res) => {
  try {
    const { address, latlng, region = "qa" } = req.query;
    if (!address && !latlng) {
      return res.status(400).json({ error: "address or latlng is required" });
    }
    const query = { region: String(region) };
    if (latlng) query.latlng = String(latlng);
    else query.address = String(address);
    const data = await proxyGoogleMaps("/geocode/json", query);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({
      error: err.message || "Geocode request failed",
    });
  }
};
