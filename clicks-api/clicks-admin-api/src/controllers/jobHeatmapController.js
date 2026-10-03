const Job = require("../models/Job");
const mongoose = require("mongoose");
const { getCachedPayload } = require("../../../clicks-shared/utils/payloadCache");

const NEARBY_LIMIT = 50;
const HOTSPOT_TOP = 5;
const MAX_VIEWPORT_POINTS = 2000;

function gridForZoom(zoom) {
  const z = Number(zoom) || 11;
  if (z >= 15) return 0.0005;
  if (z >= 13) return 0.0012;
  if (z >= 11) return 0.004;
  if (z >= 9) return 0.008;
  return 0.015;
}

/** Fewer dots when zoomed out — heat layer carries density at low zoom. */
function maxDotsForZoom(zoom) {
  const z = Number(zoom) || 11;
  if (z < 11) return 0;
  if (z < 13) return 800;
  if (z < 15) return 1800;
  return 3000;
}

function parseViewportBounds(query) {
  const north = Number(query.north);
  const south = Number(query.south);
  const east = Number(query.east);
  const west = Number(query.west);
  if (![north, south, east, west].every(Number.isFinite)) return null;
  if (north <= south || east <= west) return null;
  const padLat = (north - south) * 0.12;
  const padLng = (east - west) * 0.12;
  return {
    north: north + padLat,
    south: south - padLat,
    east: east + padLng,
    west: west - padLng,
  };
}

function buildHeatmapFilter(query) {
  const filter = {};
  const { from, to, status, jobType, source } = query;

  if (from || to) {
    filter.dateTime = {};
    if (from) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) filter.dateTime.$gte = d;
    }
    if (to) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) filter.dateTime.$lte = d;
    }
    if (!Object.keys(filter.dateTime).length) delete filter.dateTime;
  }

  if (status) filter.job_status = String(status);
  if (jobType) filter.jobType = String(jobType);
  if (source && mongoose.Types.ObjectId.isValid(source)) {
    filter.source = source;
  }

  return filter;
}

function hasCoordinatesFilter() {
  return {
    "locationCoordinates.coordinates.0": { $exists: true },
    "locationCoordinates.coordinates.1": { $exists: true },
  };
}

const HEATMAP_TZ = "Asia/Qatar";

function parseHour(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 23) return null;
  return Math.floor(n);
}

/** Filter jobs by local hour-of-day (Qatar time). Supports overnight ranges. */
function buildTimeOfDayFilter(hourFrom, hourTo) {
  const start = parseHour(hourFrom);
  const end = parseHour(hourTo);
  if (start == null && end == null) return null;

  const from = start ?? 0;
  const to = end ?? 23;
  const hourPart = {
    $hour: { date: "$dateTime", timezone: HEATMAP_TZ },
  };

  let rangeExpr;
  if (from <= to) {
    rangeExpr = {
      $and: [{ $gte: [hourPart, from] }, { $lte: [hourPart, to] }],
    };
  } else {
    rangeExpr = {
      $or: [{ $gte: [hourPart, from] }, { $lte: [hourPart, to] }],
    };
  }

  return {
    $expr: {
      $and: [{ $ne: ["$dateTime", null] }, rangeExpr],
    },
  };
}

function combineFilters(...filters) {
  const parts = filters.filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0];
  return { $and: parts };
}

/**
 * GET /api/jobs/heatmap
 */
async function getJobHeatmap(req, res) {
  try {
    const baseFilter = buildHeatmapFilter(req.query);
    const timeFilter = buildTimeOfDayFilter(req.query.hourFrom, req.query.hourTo);
    const gridSize = gridForZoom(req.query.zoom);
    const dotLimit = maxDotsForZoom(req.query.zoom);
    const viewport = parseViewportBounds(req.query);

    const withCoords = combineFilters(
      baseFilter,
      hasCoordinatesFilter(),
      timeFilter,
      viewport
        ? {
            locationCoordinates: {
              $geoWithin: {
                $box: [
                  [viewport.west, viewport.south],
                  [viewport.east, viewport.north],
                ],
              },
            },
          }
        : null
    );

    const statsBaseMatch = combineFilters(baseFilter, timeFilter);

    const projectStage = {
      $project: {
        lat: { $arrayElemAt: ["$locationCoordinates.coordinates", 1] },
        lng: { $arrayElemAt: ["$locationCoordinates.coordinates", 0] },
        dateTime: 1,
      },
    };

    const validCoordStage = {
      $match: {
        lat: { $type: "number" },
        lng: { $type: "number" },
      },
    };

    const pointsPipeline = [
      { $match: withCoords },
      projectStage,
      validCoordStage,
      {
        $group: {
          _id: {
            gx: { $floor: { $divide: ["$lat", gridSize] } },
            gy: { $floor: { $divide: ["$lng", gridSize] } },
          },
          count: { $sum: 1 },
          latSum: { $sum: "$lat" },
          lngSum: { $sum: "$lng" },
        },
      },
      {
        $project: {
          lat: { $divide: ["$latSum", "$count"] },
          lng: { $divide: ["$lngSum", "$count"] },
          weight: "$count",
          _id: 0,
        },
      },
      { $limit: MAX_VIEWPORT_POINTS },
    ];

    const hotspotPipeline = [
      { $match: withCoords },
      projectStage,
      validCoordStage,
      {
        $group: {
          _id: {
            gx: { $floor: { $divide: ["$lat", gridSize * 2] } },
            gy: { $floor: { $divide: ["$lng", gridSize * 2] } },
          },
          count: { $sum: 1 },
          latSum: { $sum: "$lat" },
          lngSum: { $sum: "$lng" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: HOTSPOT_TOP },
      {
        $project: {
          lat: { $divide: ["$latSum", "$count"] },
          lng: { $divide: ["$lngSum", "$count"] },
          count: 1,
          gx: "$_id.gx",
          gy: "$_id.gy",
          _id: 0,
        },
      },
    ];

    // Dots need the popup metadata, so they get their own projection: the
    // shared projectStage drops everything except lat/lng/dateTime, and a
    // second $project after it cannot resurrect fields that are already gone.
    const dotProjectStage = {
      $project: {
        lat: { $arrayElemAt: ["$locationCoordinates.coordinates", 1] },
        lng: { $arrayElemAt: ["$locationCoordinates.coordinates", 0] },
        clientName: 1,
        issue: 1,
        dateTime: 1,
        job_status: 1,
        jobType: 1,
      },
    };

    const dotPipeline =
      dotLimit > 0
        ? [
            { $match: withCoords },
            dotProjectStage,
            validCoordStage,
            { $limit: dotLimit },
          ]
        : null;

    const statsPipeline = [
      { $match: statsBaseMatch },
      {
        $facet: {
          plotted: [
            { $match: hasCoordinatesFilter() },
            { $count: "n" },
          ],
          missing: [
            {
              $match: {
                $or: [
                  { locationCoordinates: { $exists: false } },
                  { "locationCoordinates.coordinates.0": { $exists: false } },
                ],
              },
            },
            { $count: "n" },
          ],
          dates: [
            { $match: hasCoordinatesFilter() },
            {
              $group: {
                _id: null,
                dateMin: { $min: "$dateTime" },
                dateMax: { $max: "$dateTime" },
              },
            },
          ],
        },
      },
    ];

    const cacheKey = `clicks:admin:payload:heatmap:${JSON.stringify({
      north: req.query.north,
      south: req.query.south,
      east: req.query.east,
      west: req.query.west,
      zoom: req.query.zoom,
      hourFrom: req.query.hourFrom,
      hourTo: req.query.hourTo,
      status: req.query.status,
      from: req.query.from,
      to: req.query.to,
    })}`;
    const payload = await getCachedPayload(cacheKey, 20000, async () => {
      const [aggregated, dotJobs, hotspotCells, statsFacet] = await Promise.all([
        Job.aggregate(pointsPipeline),
        dotPipeline ? Job.aggregate(dotPipeline) : Promise.resolve([]),
        Job.aggregate(hotspotPipeline),
        Job.aggregate(statsPipeline),
      ]);

      const statsBlock = statsFacet[0] || {};
      const plotted = statsBlock.plotted?.[0]?.n ?? 0;
      const missingCoordinates = statsBlock.missing?.[0]?.n ?? 0;
      const dateBounds = statsBlock.dates ?? [];

      const points = aggregated.map((cell) => ({
        lat: cell.lat,
        lng: cell.lng,
        weight: cell.weight,
      }));

      const dots = dotJobs.map((job) => ({
        _id: job._id,
        lat: job.lat,
        lng: job.lng,
        clientName: job.clientName,
        issue: job.issue,
        dateTime: job.dateTime,
        job_status: job.job_status,
        jobType: job.jobType,
      }));

      const hotspots = hotspotCells.map((cell) => {
        const cellSize = gridSize * 2;
        const minLat = cell.gx * cellSize;
        const minLng = cell.gy * cellSize;
        return {
          lat: cell.lat,
          lng: cell.lng,
          count: cell.count,
          bounds: {
            south: minLat,
            west: minLng,
            north: minLat + cellSize,
            east: minLng + cellSize,
          },
        };
      });

      return {
        points,
        dots,
        hotspots,
        stats: {
          totalMatched: plotted + missingCoordinates,
          plotted,
          missingCoordinates,
          visibleCells: points.length,
          visibleDots: dots.length,
          gridSize,
          dateMin: dateBounds[0]?.dateMin?.toISOString?.() ?? null,
          dateMax: dateBounds[0]?.dateMax?.toISOString?.() ?? null,
          hourFrom: parseHour(req.query.hourFrom),
          hourTo: parseHour(req.query.hourTo),
          timezone: HEATMAP_TZ,
        },
      };
    });
    res.json(payload);
  } catch (err) {
    console.error("getJobHeatmap failed:", err);
    res.status(500).json({ message: "Failed to fetch heatmap data", error: err.message });
  }
}

/**
 * GET /api/jobs/nearby
 */
async function getJobsNearby(req, res) {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Math.min(Math.max(Number(req.query.radiusKm) || 1, 0.1), 25);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: "lat and lng are required" });
    }

    const baseFilter = buildHeatmapFilter(req.query);
    const timeFilter = buildTimeOfDayFilter(req.query.hourFrom, req.query.hourTo);
    const radiusRadians = radiusKm / 6378.1;

    const geoFilter = combineFilters(baseFilter, timeFilter, {
      locationCoordinates: {
        $geoWithin: {
          $centerSphere: [[lng, lat], radiusRadians],
        },
      },
    });

    const [jobs, total] = await Promise.all([
      Job.find(geoFilter)
        .select(
          "clientName issue dateTime job_status location price jobType clientMobileNumber"
        )
        .sort({ dateTime: -1 })
        .limit(NEARBY_LIMIT)
        .lean(),
      Job.countDocuments(geoFilter),
    ]);

    res.json({
      jobs,
      total,
      center: { lat, lng },
      radiusKm,
    });
  } catch (err) {
    console.error("getJobsNearby failed:", err);
    res.status(500).json({ message: "Failed to fetch nearby jobs", error: err.message });
  }
}

module.exports = {
  getJobHeatmap,
  getJobsNearby,
};
