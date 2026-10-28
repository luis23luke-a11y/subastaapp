import Marca from "@/components/Marca";
import { crearTokenAcceso } from "@/lib/auth";
import { enviarCorreo } from "@/lib/correo";

export const dynamic = "force-dynamic";

async function pedirAcceso(datos: FormData) {
  "use server";
  const email = String(datos.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return;

  const token = await crearTokenAcceso(email);
  // Si el email no esta invitado no se envia nada y no se dice: la respuesta es
  // identica en los dos casos para no revelar quien es cliente.
  if (token) {
    const base = process.env.URL_BASE ?? "http://localhost:3000";
    await enviarCorreo({
      a: email,
      asunto: "Tu enlace de acceso",
      texto: `Entra con este enlace, válido 20 minutos y de un solo uso:\n\n${base}/acceso?token=${token}\n`,
    });
  }
}

// La puerta: el mismo panel de acceso que Maqro ES, con el correo en vez de
// una clave. Quien no esta invitado recibe exactamente la misma pantalla.

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ enviado?: string; error?: string }>;
}) {
  const { enviado, error } = await searchParams;

  return (
    <>
      <header className="top">
        <div className="wrap">
          <span className="brand">
            <Marca />
            <span className="brand-txt">
              Subastas
              <small>Inmuebles del Portal de Subastas del BOE</small>
            </span>
          </span>
        </div>
      </header>

      <main className="wrap" style={{ maxWidth: 760 }}>
        <div className="panel" style={{ marginBlock: 28 }}>
          <div className="panel-in">
            <p className="eyebrow">Acceso</p>
            <h1 className="sec">Escribe tu correo</h1>
            <p className="lede">
              Es una herramienta de uso privado, por invitación. Si tu correo está dado de alta
              te mandamos un enlace de un solo uso que vale 20 minutos.
            </p>

            {enviado ? (
              <div className="aviso-caja" style={{ marginTop: 0 }}>
                <p style={{ margin: 0 }}>
                  Si ese correo está dado de alta, el enlace ya está en camino. Caduca en 20 minutos.
                </p>
              </div>
            ) : (
              <form action={pedirAcceso}>
                <div className="field">
                  <label htmlFor="email">Correo electrónico</label>
                  <input id="email" name="email" type="email" required autoComplete="email"
                         placeholder="tu@correo.es" autoFocus />
                </div>
                <div className="actions">
                  <button type="submit" className="btn primary">Enviar el enlace</button>
                  {error === "token" && (
                    <span className="nota mala">Ese enlace ya se ha usado o ha caducado. Pide uno nuevo.</span>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      </main>

      <footer className="foot">
        <div className="wrap">
          <p>Datos orientativos procedentes de fuentes públicas. No es asesoramiento jurídico ni fiscal.</p>
        </div>
      </footer>
    </>
  );
}
