// Envio de correo con una sola puerta de salida, para poder cambiar de
// proveedor sin tocar el resto. Sin API key configurada, el enlace se imprime
// por consola: es lo que permite trabajar en local sin dar de alta nada.

export interface Correo {
  a: string;
  asunto: string;
  texto: string;
}

export async function enviarCorreo(correo: Correo): Promise<void> {
  const clave = process.env.RESEND_API_KEY;
  if (!clave) {
    console.info(
      `\n[correo no enviado: falta RESEND_API_KEY]\n  para: ${correo.a}\n  asunto: ${correo.asunto}\n${correo.texto}\n`,
    );
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${clave}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.CORREO_REMITENTE ?? "acceso@localhost",
      to: [correo.a],
      subject: correo.asunto,
      text: correo.texto,
    }),
  });
  if (!res.ok) throw new Error(`Resend respondio ${res.status}: ${await res.text()}`);
}
