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

const campo =
  "w-full rounded-lg border border-linea bg-fondo px-2.5 py-1.5 text-sm outline-none focus:border-acento focus:ring-1 focus:ring-acento";

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
    resultado.margenPct == null ? "text-apagado"
      : resultado.margenPct >= 0.2 ? "text-bueno"
      : resultado.margenPct >= 0 ? "text-aviso"
      : "text-malo";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-apagado">
          Tu puja
          <input type="number" min={0} step={500} value={puja} className={campo}
                 onChange={(e) => setPuja(Number(e.target.value))} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-apagado">
          Valor de mercado
          <input type="number" min={0} step={1000} value={valorMercado} className={campo}
                 onChange={(e) => setValorMercado(Number(e.target.value))} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-apagado">
          Reforma por m²
          <input type="number" min={0} step={25} value={reformaPorM2} className={campo}
                 onChange={(e) => setReforma(Number(e.target.value))} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-apagado">
          Coste de desalojo
          <input type="number" min={0} step={500} value={costeDesalojo} className={campo}
                 onChange={(e) => setDesalojo(Number(e.target.value))} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-apagado sm:col-span-2">
          Comisión de venta si revendes ({comisionVenta}%)
          <input type="range" min={0} max={6} step={0.5} value={comisionVenta}
                 onChange={(e) => setComision(Number(e.target.value))} />
        </label>
      </div>

      <table className="w-full text-sm">
        <tbody>
          {resultado.partidas.map((p) => (
            <tr key={p.concepto} className="border-b border-linea">
              <td className="py-1.5 pr-2">
                {p.concepto}
                {p.estimado && <span className="ml-1 text-[11px] text-apagado">estimado</span>}
                {p.nota && <p className="text-[11px] text-apagado">{p.nota}</p>}
              </td>
              <td className="cifra py-1.5 text-right tabular-nums">{eur(p.importe)}</td>
            </tr>
          ))}
          <tr className="border-b-2 border-linea font-medium">
            <td className="py-2">Coste total de adquisición</td>
            <td className="cifra py-2 text-right">{eur(resultado.costeTotal)}</td>
          </tr>
          <tr>
            <td className="py-2">
              Margen sobre el valor de mercado
              {resultado.valorMercadoAjustado != null &&
                resultado.valorMercadoAjustado !== resultado.valorMercado && (
                  <p className="text-[11px] text-apagado">
                    Ajustado a la cuota de propiedad: {eur(resultado.valorMercadoAjustado)}
                  </p>
                )}
            </td>
            <td className={`cifra py-2 text-right font-medium ${tonoMargen}`}>
              {eur(resultado.margen)} {resultado.margenPct != null && `(${pct(resultado.margenPct)})`}
            </td>
          </tr>
          <tr>
            <td className="py-1.5 text-apagado">Depósito para poder pujar</td>
            <td className="cifra py-1.5 text-right">{eur(resultado.deposito)}</td>
          </tr>
        </tbody>
      </table>

      <p className="text-xs text-apagado">{resultado.reglas.nota}</p>

      {resultado.avisos.length > 0 && (
        <ul className="flex flex-col gap-1.5 rounded-lg border border-aviso/30 bg-aviso/5 p-3 text-xs">
          {resultado.avisos.map((a) => (
            <li key={a} className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-aviso" />
              <span>{a}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-apagado">
        Cálculo orientativo con supuestos editables. No es asesoramiento jurídico ni fiscal:
        verifica el ITP, las cargas y la situación posesoria antes de pujar.
      </p>
    </div>
  );
}
