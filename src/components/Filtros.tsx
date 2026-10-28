import { TIPOS_BIEN, ETIQUETA_TIPO_BIEN, type TipoBien } from "@/lib/tipos";
import type { Filtro } from "@/lib/filtros";

// El panel lateral de filtros. Es un formulario GET: el filtro vive en la URL,
// asi que cualquier busqueda es enlazable y es exactamente lo que despues se
// guarda como alerta. La busqueda por texto, la provincia y el orden estan en
// la fila superior del listado y pertenecen a este mismo formulario por su id.

export const ID_FORMULARIO = "filtros";

export default function Filtros({ filtro }: { filtro: Filtro }) {
  const tiposElegidos = new Set<TipoBien>(filtro.tipo_bien ?? []);

  return (
    <form id={ID_FORMULARIO} method="get" action="/buscar">
      <p className="lat-tit">Tipo de inmueble</p>
      <div className="chips">
        {TIPOS_BIEN.map((t) => (
          <label key={t} className="chip">
            <input type="checkbox" name="tipo_bien" value={t} defaultChecked={tiposElegidos.has(t)} />
            {ETIQUETA_TIPO_BIEN[t]}
          </label>
        ))}
      </div>

      <p className="lat-tit">Precio de salida</p>
      <div className="lat-fila">
        <input name="precio_min" type="number" min={0} step={1000} inputMode="numeric"
               defaultValue={filtro.precio_min ?? ""} placeholder="Desde" aria-label="Precio desde" />
        <input name="precio_max" type="number" min={0} step={1000} inputMode="numeric"
               defaultValue={filtro.precio_max ?? ""} placeholder="Hasta" aria-label="Precio hasta" />
      </div>

      <p className="lat-tit">Superficie y precio por metro</p>
      <div className="lat-fila">
        <input name="m2_min" type="number" min={0} step={5} inputMode="numeric"
               defaultValue={filtro.m2_min ?? ""} placeholder="m² mínimos" aria-label="Metros cuadrados mínimos" />
        <input name="eur_m2_max" type="number" min={0} step={50} inputMode="numeric"
               defaultValue={filtro.eur_m2_max ?? ""} placeholder="€/m² máximo" aria-label="Euros por metro máximo" />
      </div>

      <p className="lat-tit">Margen bruto mínimo</p>
      <select name="margen_min" defaultValue={filtro.margen_min ?? ""} aria-label="Margen bruto mínimo">
        <option value="">Cualquiera</option>
        <option value="0">Positivo</option>
        <option value="0.1">10 % o más</option>
        <option value="0.2">20 % o más</option>
        <option value="0.3">30 % o más</option>
        <option value="0.4">40 % o más</option>
      </select>

      <p className="lat-tit">Situación posesoria</p>
      <select name="situacion" defaultValue={filtro.situacion?.[0] ?? ""} aria-label="Situación posesoria">
        <option value="">Cualquiera</option>
        <option value="libre">Solo libres</option>
        <option value="ocupado">Solo ocupados</option>
        <option value="desconocido">Sin determinar</option>
      </select>

      <p className="lat-tit">Cierran en</p>
      <select name="dias_max" defaultValue={filtro.dias_max ?? ""} aria-label="Cierran en">
        <option value="">Cualquier fecha</option>
        <option value="7">7 días</option>
        <option value="15">15 días</option>
        <option value="30">30 días</option>
      </select>

      <label className="lat-check">
        <input type="checkbox" name="sin_cargas" value="true" defaultChecked={filtro.sin_cargas ?? false} />
        Sin cargas que subsistan
      </label>

      {filtro.bbox && <input type="hidden" name="bbox" value={filtro.bbox} />}

      <div className="lat-acc">
        <button type="submit" className="btn primary">Buscar</button>
        <a href="/buscar" className="btn">Limpiar</a>
      </div>
    </form>
  );
}
