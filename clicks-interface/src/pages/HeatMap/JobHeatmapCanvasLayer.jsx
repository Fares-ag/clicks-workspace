import { useEffect, useRef } from "react";
import { useGoogleMap } from "@react-google-maps/api";
import { attachHeatmapWebGLOverlay } from "./heatmapWebGLOverlay";

/** Smooth heat gradient + tiny blue job dots — reference-style overlay. */
function JobHeatmapCanvasLayer({ heatPoints, dotPoints }) {
  const map = useGoogleMap();
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!map || !window.google?.maps) return undefined;

    overlayRef.current = attachHeatmapWebGLOverlay(map, {
      heat: heatPoints,
      dots: dotPoints,
    });

    return () => {
      overlayRef.current?.setMap(null);
      overlayRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    overlayRef.current?.setHeatPoints(heatPoints);
  }, [heatPoints]);

  useEffect(() => {
    overlayRef.current?.setDotPoints(dotPoints);
  }, [dotPoints]);

  return null;
}

export default JobHeatmapCanvasLayer;
