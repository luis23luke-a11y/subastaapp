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
  const fiabilidad = confianza == null || confianza === 0
    ? { texto: "sin respaldo en el texto", clase: "malo" }
    : confianza >= 0.85
      ? { texto: `respaldo alto · ${pct(confianza)}`, clase: "bueno" }
      : confianza >= 0.6
        ? { texto: `respaldo medio · ${pct(confianza)}`, clase: "aviso" }
        : { texto: `respaldo bajo · ${pct(confianza)}`, clase: "malo" };

  return (
    <div className="evidencia">
      <div className="ev-cab">
        <span className="ev-tit">{titulo}</span>
        <span className={`ev-val ${tono === "neutro" ? "" : tono}`}>{valor}</span>
      </div>
      {cita ? (
        <blockquote className="ev-cita">“{cita}”</blockquote>
      ) : (
        <p className="ev-pie">El anuncio no dice nada de esto. No es que no lo haya: es que no consta.</p>
      )}
      <p className="ev-pie">
        <span className={fiabilidad.clase}>{fiabilidad.texto}</span>
        {origen === "modelo" ? " · revisado con modelo de lenguaje" : origen ? " · extraído por reglas" : ""}
      </p>
    </div>
  );
}
