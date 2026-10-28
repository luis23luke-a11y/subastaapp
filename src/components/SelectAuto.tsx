"use client";

import type { SelectHTMLAttributes } from "react";

// Un desplegable que envia su formulario al cambiar, para que elegir una
// provincia o un orden no obligue a pulsar «Buscar». Funciona tambien con el
// atributo form="…", que es como los campos de la fila superior pertenecen al
// formulario del panel lateral.

export default function SelectAuto(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      onChange={(e) => {
        props.onChange?.(e);
        e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}
