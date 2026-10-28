"use client";

import { useMemo, useState } from "react";
import { calcularCostes, SUPUESTOS_POR_DEFECTO } from "@/lib/costes";
import { eur, pct } from "@/lib/formato";
import type { Situacion, TipoSubasta } from "@/lib/tipos";

export interface DatosCalculadora {
  valorSubasta: number;
  comunidad: string | null;
  tipoSubasta: TipoSubasta;
  situacion: Situacion;
  cargasSubsisten: number | null;
  m2: number | null;
  valorMercado: number | null;
  cuotaPropiedad: number | null;
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flabel" style={{ marginBottom: 0 }}>{etiqueta}</span>
      {children}
    </label>
  );
}

export default function Calculadora({ datos }: { datos: DatosCalculadora }) {
  const [puja, setPuja] = useState(datos.valorSubasta);
  const [reformaPorM2, setReforma] = useState(SUPUESTOS_POR_DEFECTO.reformaPorM2);
  const [costeDesalojo, setDesalojo] = useState(SUPUESTOS_POR_DEFECTO.costeDesalojo);
  const [comisionVenta, setComision] = useState(0);
  const [valorMercado, setValorMercado] = useState(datos.valorMercado ?? 0);

  const resultado = useMemo(
    () =>
      calcularCostes({
        puja,
        comunidad: datos.comunidad,
        tipoSubasta: datos.tipoSubasta,
        situacion: datos.situacion,
        cargasSubsisten: datos.cargasSubsisten,
        m2: datos.m2,
        valorMercado: valorMercado > 0 ? valorMercado : null,
        cuotaPropiedad: datos.cuotaPropiedad,
        supuestos: { reformaPorM2, costeDesalojo, comisionVenta: comisionVenta / 100 },
      }),
    [puja, valorMercado, reformaPorM2, costeDesalojo, comisionVenta, datos],
  );

  const tonoMargen =
    resultado.margenPct == null ? "text-tinta3"
      : resultado.margenPct >= 0.2 ? "text-bueno"
      : resultado.margenPct >= 0 ? "text-aviso"
      : "text-malo";

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Tu puja">
          <input type="number" min={0} step={500} value={puja} inputMode="numeric"
                 onChange={(e) => setPuja(Number(e.target.value))} />
        </Campo>
        <Campo etiqueta="Valor de mercado">
          <input type="number" min={0} step={1000} value={valorMercado} inputMode="numeric"
                 onChange={(e) => setValorMercado(Number(e.target.value))} />
        </Campo>
        <Campo etiqueta="Reforma por m²">
          <input type="number" min={0} step={25} value={reformaPorM2} inputMode="numeric"
                 onChange={(e) => setReforma(Number(e.target.value))} />
        </Campo>
        <Campo etiqueta="Coste de desalojo">
          <input type="number" min={0} step={500} value={costeDesalojo} inputMode="numeric"
                 onChange={(e) => setDesalojo(Number(e.target.value))} />
        </Campo>
        <div className="sm:col-span-2">
          <Campo etiqueta={`Comisión de venta si revendes (${comisionVenta} %)`}>
            <input type="range" min={0} max={6} step={0.5} value={comisionVenta}
                   onChange={(e) => setComision(Number(e.target.value))} />
          </Campo>
        </div>
      </div>

      <table className="tabla">
        <tbody>
          {resultado.partidas.map((p) => (
            <tr key={p.concepto}>
              <td>
                {p.concepto}
                {p.estimado && <span className="ml-2 text-xs text-tinta3">estimado</span>}
                {p.nota && <p className="m-0 text-xs text-tinta3">{p.nota}</p>}
              </td>
              <td className="num">{eur(p.importe)}</td>
            </tr>
          ))}
          <tr className="total">
            <td>Coste total de adquisición</td>
            <td className="num">{eur(resultado.costeTotal)}</td>
          </tr>
          <tr>
            <td>
              Margen sobre el valor de mercado
              {resultado.valorMercadoAjustado != null &&
                resultado.valorMercadoAjustado !== resultado.valorMercado && (
                  <p className="m-0 text-xs text-tinta3">
                    Ajustado a la cuota de propiedad: {eur(resultado.valorMercadoAjustado)}
                  </p>
                )}
            </td>
            <td className={`num font-extrabold ${tonoMargen}`}>
              {eur(resultado.margen)} {resultado.margenPct != null && `(${pct(resultado.margenPct)})`}
            </td>
          </tr>
          <tr>
            <td className="text-tinta3">Depósito para poder pujar</td>
            <td className="num">{eur(resultado.deposito)}</td>
          </tr>
        </tbody>
      </table>

      <p className="ficha-nota" style={{ marginTop: 0 }}>{resultado.reglas.nota}</p>

      {resultado.avisos.length > 0 && (
        <ul className="aviso-caja" style={{ marginTop: 0 }}>
          {resultado.avisos.map((a) => <li key={a}><span>{a}</span></li>)}
        </ul>
      )}

      <p className="ficha-nota" style={{ marginTop: 0 }}>
        Cálculo orientativo con supuestos editables. No es asesoramiento jurídico ni fiscal:
        verifica el ITP, las cargas y la situación posesoria antes de pujar.
      </p>
    </div>
  );
}
