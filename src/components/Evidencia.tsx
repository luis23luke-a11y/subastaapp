import { pct } from "@/lib/formato";

// Un campo extraido del texto, con la frase del anuncio que lo justifica.
// Sin la cita delante, el usuario solo puede creerse lo que le decimos; con
// ella, decide el. Es la diferencia entre una herramienta y un oraculo.

export default function Evidencia({
  titulo, valor, tono = "neutro", cita, confianza, origen,
}: {
  titulo: string;
  valor: string;
  tono?: "neutro" | "bueno" | "aviso" | "malo";
  cita: string | null;
  confianza: number | null;
  origen: string | null;
}) {
  const color = {
    neutro: "text-texto", bueno: "text-bueno", aviso: "text-aviso", malo: "text-malo",
  }[tono];

  const fiabilidad = confianza == null || confianza === 0
    ? { texto: "sin respaldo en el texto", clase: "text-malo" }
    : confianza >= 0.85
      ? { texto: `respaldo alto · ${pct(confianza)}`, clase: "text-bueno" }
      : confianza >= 0.6
        ? { texto: `respaldo medio · ${pct(confianza)}`, clase: "text-aviso" }
        : { texto: `respaldo bajo · ${pct(confianza)}`, clase: "text-malo" };

  return (
    <div className="flex flex-col gap-1.5 border-t border-linea py-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs text-apagado">{titulo}</span>
        <span className={`text-sm font-medium ${color}`}>{valor}</span>
      </div>
      {cita ? (
        <blockquote className="border-l-2 border-linea pl-3 text-xs italic leading-relaxed text-apagado">
          “{cita}”
        </blockquote>
      ) : (
        <p className="text-xs text-apagado">
          El anuncio no dice nada de esto. No es que no lo haya: es que no consta.
        </p>
      )}
      <p className="text-[11px] text-apagado">
        <span className={fiabilidad.clase}>{fiabilidad.texto}</span>
        {origen === "modelo" ? " · revisado con modelo de lenguaje" : origen ? " · extraído por reglas" : ""}
      </p>
    </div>
  );
}
