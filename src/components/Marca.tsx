// Isotipo de Subastas: una casa en tinta con la puerta en el naranja de Gorex,
// el mismo del logotipo de Maqro ES, para que las dos apps se vean de la
// misma familia. Va en linea, sin fichero aparte, para que el color de la
// tinta siga al modo oscuro con la misma clase que en Maqro.

export default function Marca({ className = "isotipo" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path className="iso-tinta" d="M16 2.5 2.5 14.2h4.2V29h18.6V14.2h4.2L16 2.5Zm0 4.1 9.2 8V25.6H6.8V14.6l9.2-8Z" />
      <rect className="iso-naranja" x="12.6" y="17.2" width="6.8" height="8.4" rx="1.4" />
    </svg>
  );
}
