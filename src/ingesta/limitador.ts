// Limitador de ritmo. Cuando el adaptador apunte a una fuente real, el ritmo
// lento no es una cortesia: es lo que evita que te bloqueen la IP.

export interface Limitador {
  /** Se resuelve cuando toca hacer la siguiente peticion. */
  turno(): Promise<void>;
  /** Peticiones hechas desde que arranco. */
  hechas(): number;
}

export function crearLimitador(msEntrePeticiones: number): Limitador {
  let siguiente = 0;
  let cuenta = 0;

  return {
    async turno() {
      cuenta++;
      const ahora = Date.now();
      const espera = Math.max(0, siguiente - ahora);
      siguiente = Math.max(ahora, siguiente) + msEntrePeticiones;
      if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    },
    hechas: () => cuenta,
  };
}
