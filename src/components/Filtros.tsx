import { TIPOS_BIEN, ETIQUETA_TIPO_BIEN, type TipoBien } from "@/lib/tipos";
import type { Filtro } from "@/lib/filtros";

// Formulario GET: el filtro vive en la URL, asi que cualquier busqueda es
// enlazable y es exactamente lo que despues se guarda como alerta.

const campo =
  "w-full rounded-lg border border-linea bg-fondo px-2.5 py-1.5 text-sm outline-none focus:border-acento focus:ring-1 focus:ring-acento";
const etiqueta = "text-xs font-medium text-apagado";

export default function Filtros({
  filtro, provincias,
}: {
  filtro: Filtro;
  provincias: Array<{ provincia: string; n: number }>;
}) {
  const tiposElegidos = new Set<TipoBien>(filtro.tipo_bien ?? []);

  return (
    <form method="get" action="/buscar" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className={etiqueta} htmlFor="q">Municipio, calle o referencia</label>
        <input id="q" name="q" defaultValue={filtro.q ?? ""} className={campo} placeholder="Castellón, Mayor, SUB-..." />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={etiqueta} htmlFor="provincia">Provincia</label>
        <select id="provincia" name="provincia" defaultValue={filtro.provincia ?? ""} className={campo}>
          <option value="">Todas</option>
          {provincias.map((p) => (
            <option key={p.provincia} value={p.provincia}>{p.provincia} ({p.n})</option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className={etiqueta}>Tipo de inmueble</legend>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {TIPOS_BIEN.map((t) => (
            <label key={t} className="cursor-pointer">
              <input
                type="checkbox" name="tipo_bien" value={t} defaultChecked={tiposElegidos.has(t)}
                className="peer sr-only"
              />
              <span className="rounded-full border border-linea px-2.5 py-1 text-xs peer-checked:border-acento peer-checked:bg-acento peer-checked:text-white">
                {ETIQUETA_TIPO_BIEN[t]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <label className={etiqueta} htmlFor="precio_min">Precio desde</label>
          <input id="precio_min" name="precio_min" type="number" min={0} step={1000}
                 defaultValue={filtro.precio_min ?? ""} className={campo} placeholder="0" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={etiqueta} htmlFor="precio_max">hasta</label>
          <input id="precio_max" name="precio_max" type="number" min={0} step={1000}
                 defaultValue={filtro.precio_max ?? ""} className={campo} placeholder="Sin límite" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <label className={etiqueta} htmlFor="m2_min">m² mínimos</label>
          <input id="m2_min" name="m2_min" type="number" min={0} step={5}
                 defaultValue={filtro.m2_min ?? ""} className={campo} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={etiqueta} htmlFor="eur_m2_max">€/m² máximo</label>
          <input id="eur_m2_max" name="eur_m2_max" type="number" min={0} step={50}
                 defaultValue={filtro.eur_m2_max ?? ""} className={campo} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={etiqueta} htmlFor="margen_min">Margen bruto mínimo</label>
        <select id="margen_min" name="margen_min" defaultValue={filtro.margen_min ?? ""} className={campo}>
          <option value="">Cualquiera</option>
          <option value="0">Positivo</option>
          <option value="0.1">10% o más</option>
          <option value="0.2">20% o más</option>
          <option value="0.3">30% o más</option>
          <option value="0.4">40% o más</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={etiqueta} htmlFor="situacion">Situación posesoria</label>
        <select id="situacion" name="situacion" defaultValue={filtro.situacion?.[0] ?? ""} className={campo}>
          <option value="">Cualquiera</option>
          <option value="libre">Solo libres</option>
          <option value="ocupado">Solo ocupados</option>
          <option value="desconocido">Sin determinar</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={etiqueta} htmlFor="dias_max">Cierran en</label>
        <select id="dias_max" name="dias_max" defaultValue={filtro.dias_max ?? ""} className={campo}>
          <option value="">Cualquier fecha</option>
          <option value="7">7 días</option>
          <option value="15">15 días</option>
          <option value="30">30 días</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="sin_cargas" value="true" defaultChecked={filtro.sin_cargas ?? false}
               className="size-4 rounded border-linea" />
        Sin cargas que subsistan
      </label>

      {filtro.bbox && <input type="hidden" name="bbox" value={filtro.bbox} />}
      <input type="hidden" name="orden" value={filtro.orden} />

      <div className="flex gap-2">
        <button type="submit" className="flex-1 rounded-lg bg-acento px-3 py-2 text-sm font-medium text-white hover:opacity-90">
          Buscar
        </button>
        <a href="/buscar" className="rounded-lg border border-linea px-3 py-2 text-sm text-apagado hover:text-texto">
          Limpiar
        </a>
      </div>
    </form>
  );
}
