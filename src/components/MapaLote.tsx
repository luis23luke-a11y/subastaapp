"use client";

import { useEffect, useRef } from "react";
import { Map as MapaGL, Marker, NavigationControl, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// El mapa de un solo inmueble, en su ficha. La precision manda: con referencia
// catastral o portal exacto se acerca a la manzana; con solo la calle, al
// barrio; con solo el municipio, al pueblo entero y con un halo alrededor del
// punto, porque un punto exacto pintado en el centro del pueblo seria mentir.

const ESTILO_MAPA = process.env.NEXT_PUBLIC_ESTILO_MAPA
  ?? "https://tiles.openfreemap.org/styles/liberty";

setWorkerUrl("/mapa/maplibre-gl-worker.mjs");

const ZOOM: Record<string, number> = { catastral: 16.5, portal: 16.5, via: 15, municipio: 12.5 };

export default function MapaLote({
  lat, lon, precision,
}: {
  lat: number;
  lon: number;
  precision: string | null;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaGL | null>(null);
  const aproximado = precision === "municipio" || precision === "via";

  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    const m = new MapaGL({
      container: contenedor.current,
      style: ESTILO_MAPA,
      center: [lon, lat],
      zoom: ZOOM[precision ?? ""] ?? 14,
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    mapa.current = m;

    m.on("load", () => {
      if (aproximado) {
        // Un halo del tamaño aproximado de la zona, para que se vea que el
        // punto no es exacto.
        m.addSource("halo", {
          type: "geojson",
          data: { type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: {} },
        });
        m.addLayer({
          id: "halo", type: "circle", source: "halo",
          paint: {
            "circle-radius": precision === "municipio" ? 90 : 40,
            "circle-color": "#ED4D03", "circle-opacity": 0.12,
            "circle-stroke-color": "#ED4D03", "circle-stroke-width": 1.5, "circle-stroke-opacity": 0.6,
          },
        });
      }
      new Marker({ color: aproximado ? "#ED4D03" : "#111113" }).setLngLat([lon, lat]).addTo(m);
    });

    return () => { m.remove(); mapa.current = null; };
    // El inmueble no cambia mientras la ficha esta abierta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={contenedor} className="h-full w-full" />;
}
