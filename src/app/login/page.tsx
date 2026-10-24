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

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ enviado?: string; error?: string }>;
}) {
  const { enviado, error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12">
      <div className="rounded-xl border border-linea bg-panel p-6 shadow-sm">
        <h1 className="text-xl font-medium">Acceso</h1>
        <p className="mt-2 text-sm text-apagado">
          Herramienta de uso interno. El acceso es por invitación: si tu correo está
          dado de alta, recibirás un enlace de un solo uso.
        </p>

        {enviado ? (
          <p className="mt-6 rounded-lg border border-linea bg-fondo p-4 text-sm">
            Si ese correo está dado de alta, el enlace ya está en camino. Caduca en 20 minutos.
          </p>
        ) : (
          <form action={pedirAcceso} className="mt-6 flex flex-col gap-3">
            <label className="text-sm font-medium" htmlFor="email">Correo electrónico</label>
            <input
              id="email" name="email" type="email" required autoComplete="email"
              placeholder="tu@correo.es"
              className="rounded-lg border border-linea bg-fondo px-3 py-2 text-sm outline-none focus:border-acento focus:ring-1 focus:ring-acento"
            />
            <button
              type="submit"
              className="rounded-lg bg-acento px-3 py-2 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-acento focus:ring-offset-2"
            >
              Enviar enlace de acceso
            </button>
          </form>
        )}

        {error === "token" && (
          <p className="mt-4 text-sm text-malo">
            Ese enlace ya se ha usado o ha caducado. Pide uno nuevo.
          </p>
        )}
      </div>
    </main>
  );
}
