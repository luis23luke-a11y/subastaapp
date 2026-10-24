"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MapaGL, NavigationControl, Popup, LngLatBounds, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export interface Punto {
  lote_id: number;
  lat: number;
  lon: number;
  valor_subasta: number | null;
  municipio: string | null;
  bien_tipo: string | null;
  precision_geo: string | null;
}

const TESELAS = process.env.NEXT_PUBLIC_TESELAS ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATRIBUCION = process.env.NEXT_PUBLIC_TESELAS_ATRIBUCION ?? "&copy; OpenStreetMap";
// Un estilo sin "glyphs" no admite ninguna capa de texto: MapLibre lanza un
// error de validacion y el mapa entero se queda en blanco. Hace falta aunque
// las teselas sean raster.
const GLIFOS = process.env.NEXT_PUBLIC_GLIFOS
  ?? "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";
const FUENTE_MAPA = process.env.NEXT_PUBLIC_FUENTE_MAPA ?? "Noto Sans Regular";

// MapLibre 6 arranca su worker desde un fichero aparte y calcula la URL con
// import.meta.url, que bajo webpack no lleva a ningun sitio: sin esto el mapa
// pinta las teselas pero ningun punto. scripts/worker-mapa.ts copia el fichero
// a public/mapa/ antes de arrancar y de construir.
setWorkerUrl("/mapa/maplibre-gl-worker.mjs");

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency", currency: "EUR", maximumFractionDigits: 0, notation: "compact",
});

/** Estilo raster minimo. En produccion hay que cambiar las teselas: la
 *  politica de uso de OpenStreetMap no admite trafico de produccion. */
const estilo = {
  version: 8 as const,
  glyphs: GLIFOS,
  sources: {
    base: {
      type: "raster" as const,
      tiles: [TESELAS],
      tileSize: 256,
      attribution: ATRIBUCION,
    },
  },
  layers: [{ id: "base", type: "raster" as const, source: "base" }],
};

export default function Mapa({ puntos, bboxActual }: { puntos: Punto[]; bboxActual?: string }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaGL | null>(null);
  const [encuadre, setEncuadre] = useState<string | null>(null);

  useEffect(() => {
    if (!contenedor.current || mapa.current) return;

    const m = new MapaGL({
      container: contenedor.current,
      style: estilo,
      center: [-3.7, 40.2],
      zoom: 4.6,
      attributionControl: { compact: true },
    });
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    mapa.current = m;

    m.on("load", () => {
      m.addSource("lotes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterRadius: 44,
        clusterMaxZoom: 12,
      });

      m.addLayer({
        id: "grupos", type: "circle", source: "lotes", filter: ["has", "point_count"],
        paint: {
          "circle-color": "#20567a",
          "circle-opacity": 0.85,
          "circle-radius": ["step", ["get", "point_count"], 14, 10, 19, 50, 25],
        },
      });
      m.addLayer({
        id: "grupos-texto", type: "symbol", source: "lotes", filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": [FUENTE_MAPA],
          "text-size": 11,
        },
        paint: { "text-color": "#ffffff" },
      });
      m.addLayer({
        id: "puntos", type: "circle", source: "lotes", filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 6,
          "circle-color": ["case", ["==", ["get", "aproximado"], true], "#a16207", "#20567a"],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
        },
      });

      m.on("click", "grupos", (ev) => {
        const rasgo = m.queryRenderedFeatures(ev.point, { layers: ["grupos"] })[0];
        if (!rasgo) return;
        const fuente = m.getSource("lotes") as GeoJSONSource;
        void fuente.getClusterExpansionZoom(rasgo.properties!.cluster_id as number)
          .then((z) => m.easeTo({ center: (rasgo.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z }));
      });

      m.on("click", "puntos", (ev) => {
        const rasgo = ev.features?.[0];
        if (!rasgo) return;
        const props = rasgo.properties as Record<string, unknown>;
        const coords = (rasgo.geometry as GeoJSON.Point).coordinates as [number, number];
        const precio = props.valor_subasta ? EUR.format(Number(props.valor_subasta)) : "sin precio";
        new Popup({ offset: 10, closeButton: false })
          .setLngLat(coords)
          .setHTML(
            `<div style="font:13px/1.4 system-ui">
               <strong>${String(props.municipio ?? "Sin localizar")}</strong><br>
               ${precio}${props.aproximado ? " · ubicación aproximada" : ""}<br>
               <a href="/lote/${String(props.lote_id)}" style="color:#20567a">Ver ficha</a>
             </div>`,
          )
          .addTo(m);
      });

      for (const capa of ["grupos", "puntos"]) {
        m.on("mouseenter", capa, () => { m.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", capa, () => { m.getCanvas().style.cursor = ""; });
      }
    });

    const anotarEncuadre = () => {
      const b = m.getBounds();
      setEncuadre(
        [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
          .map((v) => v.toFixed(4)).join(","),
      );
    };
    m.on("moveend", anotarEncuadre);

    return () => { m.remove(); mapa.current = null; };
  }, []);

  // Los puntos cambian cuando cambia el filtro.
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;

    const pintar = () => {
      const fuente = m.getSource("lotes") as GeoJSONSource | undefined;
      if (!fuente) return;
      fuente.setData({
        type: "FeatureCollection",
        features: puntos.map((p) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
          properties: {
            lote_id: p.lote_id,
            municipio: p.municipio,
            valor_subasta: p.valor_subasta,
            bien_tipo: p.bien_tipo,
            aproximado: p.precision_geo === "municipio" || p.precision_geo === "via",
          },
        })),
      });

      if (puntos.length > 0 && !bboxActual) {
        const limites = puntos.reduce(
          (b, p) => b.extend([p.lon, p.lat]),
          new LngLatBounds([puntos[0]!.lon, puntos[0]!.lat], [puntos[0]!.lon, puntos[0]!.lat]),
        );
        m.fitBounds(limites, { padding: 40, maxZoom: 13, duration: 0 });
      }
    };

    if (m.isStyleLoaded()) pintar();
    else m.once("load", pintar);
  }, [puntos, bboxActual]);

  const enlaceZona = () => {
    if (!encuadre) return;
    const qs = new URLSearchParams(window.location.search);
    qs.set("bbox", encuadre);
    qs.delete("pagina");
    window.location.search = qs.toString();
  };

  return (
    <div className="relative h-[22rem] w-full overflow-hidden rounded-xl border border-linea">
      {/* El CSS de MapLibre impone position:relative a este elemento, asi que
          no se puede posicionar con inset-0: se quedaria sin altura. */}
      <div ref={contenedor} className="h-full w-full" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-linea bg-panel/95 px-3 py-1.5 text-xs shadow-sm">
          <span className="text-apagado">
            {puntos.length} {puntos.length === 1 ? "lote localizado" : "lotes localizados"}
          </span>
          <button onClick={enlaceZona} className="font-medium text-acento underline disabled:opacity-40" disabled={!encuadre}>
            Buscar en esta zona
          </button>
          {bboxActual && (
            <a href={quitarBbox()} className="text-apagado underline">quitar zona</a>
          )}
        </div>
      </div>
    </div>
  );
}

function quitarBbox(): string {
  if (typeof window === "undefined") return "/buscar";
  const qs = new URLSearchParams(window.location.search);
  qs.delete("bbox");
  qs.delete("pagina");
  return `/buscar?${qs.toString()}`;
}
