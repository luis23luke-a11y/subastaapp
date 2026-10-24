import assert from "node:assert/strict";
import { test } from "node:test";
import { calcularCostes, honorariosNotaria, REGLAS } from "../src/lib/costes";

const importe = (r: ReturnType<typeof calcularCostes>, trozo: string) =>
  r.partidas.find((p) => p.concepto.includes(trozo))?.importe;

test("el ITP sale del tipo de la comunidad", () => {
  const madrid = calcularCostes({ puja: 100_000, comunidad: "Comunidad de Madrid" });
  const valencia = calcularCostes({ puja: 100_000, comunidad: "Comunidad Valenciana" });
  assert.equal(importe(madrid, "ITP"), 6_000);
  assert.equal(importe(valencia, "ITP"), 10_000);
});

test("sin comunidad conocida se aplica el tipo mas alto, no el mas bajo", () => {
  const r = calcularCostes({ puja: 100_000, comunidad: null });
  assert.equal(importe(r, "ITP"), 10_000);
  assert.ok(r.avisos.some((a) => a.includes("ITP")));
});

test("las cargas que subsisten entran en el coste total", () => {
  const sin = calcularCostes({ puja: 100_000, comunidad: "Murcia", cargasSubsisten: 0 });
  const con = calcularCostes({ puja: 100_000, comunidad: "Murcia", cargasSubsisten: 25_000 });
  assert.equal(con.costeTotal - sin.costeTotal, 25_000);
});

test("un inmueble ocupado cuesta mas que uno libre y avisa", () => {
  const base = { puja: 100_000, comunidad: "Murcia", cargasSubsisten: 0 } as const;
  const libre = calcularCostes({ ...base, situacion: "libre" });
  const ocupado = calcularCostes({ ...base, situacion: "ocupado" });
  const incierto = calcularCostes({ ...base, situacion: "desconocido" });

  assert.ok(ocupado.costeTotal > libre.costeTotal);
  // Lo desconocido provisiona la mitad: ni se ignora ni se castiga entero.
  assert.ok(incierto.costeTotal > libre.costeTotal);
  assert.ok(incierto.costeTotal < ocupado.costeTotal);
  assert.ok(ocupado.avisos.some((a) => a.includes("ocupado")));
});

test("el margen descuenta todos los costes, no solo la puja", () => {
  const r = calcularCostes({
    puja: 100_000, comunidad: "Comunidad de Madrid", situacion: "libre",
    cargasSubsisten: 0, valorMercado: 200_000, m2: null,
    supuestos: { reformaPorM2: 0 },
  });
  assert.equal(r.margen, 200_000 - r.costeTotal);
  assert.ok(r.costeTotal > 100_000, "el coste tiene que ser mayor que la puja");
  assert.ok((r.margenPct ?? 0) < 0.5, "el margen no puede ser el bruto sobre la puja");
});

test("una cuota indivisa reduce el valor de mercado y avisa", () => {
  const r = calcularCostes({
    puja: 50_000, comunidad: "Murcia", situacion: "libre", cargasSubsisten: 0,
    valorMercado: 200_000, cuotaPropiedad: 0.5, supuestos: { reformaPorM2: 0 },
  });
  assert.equal(r.valorMercadoAjustado, 100_000);
  assert.ok(r.avisos.some((a) => a.includes("cuota")));
});

test("la comision de venta se descuenta del valor, no se suma al coste", () => {
  const base = {
    puja: 100_000, comunidad: "Murcia", situacion: "libre" as const,
    cargasSubsisten: 0, valorMercado: 200_000,
  };
  const sin = calcularCostes({ ...base, supuestos: { reformaPorM2: 0 } });
  const con = calcularCostes({ ...base, supuestos: { reformaPorM2: 0, comisionVenta: 0.03 } });
  assert.equal(sin.costeTotal, con.costeTotal);
  assert.equal((sin.margen ?? 0) - (con.margen ?? 0), 6_000);
});

test("sin valor de mercado no se inventa un margen", () => {
  const r = calcularCostes({ puja: 100_000, comunidad: "Murcia" });
  assert.equal(r.margen, null);
  assert.equal(r.margenPct, null);
});

test("el deposito es el porcentaje de las reglas del tipo de subasta", () => {
  const r = calcularCostes({ puja: 120_000, tipoSubasta: "judicial" });
  assert.equal(r.deposito, 120_000 * REGLAS.judicial.deposito);
});

test("los aranceles se mueven con el valor pero tienen suelo y techo", () => {
  assert.equal(honorariosNotaria(0), 0);
  assert.ok(honorariosNotaria(10_000) >= 400);
  assert.ok(honorariosNotaria(50_000_000) <= 3_000);
  assert.ok(honorariosNotaria(300_000) > honorariosNotaria(100_000));
});
