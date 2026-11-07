/**
 * Qatar service-area check. Generous bbox so Doha / Lusail / Wakrah pins pass
 * and obvious overseas pins (e.g. NYC) fail with OUTSIDE_COVERAGE.
 */
const QATAR_BOUNDS = {
  minLat: 24.4,
  maxLat: 26.4,
  minLng: 50.6,
  maxLng: 51.75,
};

function isInQatar(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return (
    latitude >= QATAR_BOUNDS.minLat &&
    latitude <= QATAR_BOUNDS.maxLat &&
    longitude >= QATAR_BOUNDS.minLng &&
    longitude <= QATAR_BOUNDS.maxLng
  );
}

function coverageError(message = "This location is outside Clicks coverage") {
  const err = new Error(message);
  err.status = 400;
  err.code = "OUTSIDE_COVERAGE";
  return err;
}

function assertInQatar(lat, lng) {
  if (!isInQatar(lat, lng)) {
    throw coverageError();
  }
}

module.exports = {
  QATAR_BOUNDS,
  isInQatar,
  assertInQatar,
  coverageError,
};
