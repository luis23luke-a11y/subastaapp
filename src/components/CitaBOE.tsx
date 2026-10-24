// La cita que exigen las condiciones de reutilizacion de la Agencia Estatal
// BOE (aviso legal, condicion cuarta): para productos derivados, «Basado en
// datos de la Agencia Estatal Boletín Oficial del Estado» con enlace a boe.es.
// No es decoracion: es la condicion de la licencia que permite usar los datos.

export default function CitaBOE({ className = "" }: { className?: string }) {
  return (
    <p className={className}>
      Basado en datos de la{" "}
      <a href="https://www.boe.es" target="_blank" rel="noreferrer" className="underline">
        Agencia Estatal Boletín Oficial del Estado
      </a>
    </p>
  );
}
