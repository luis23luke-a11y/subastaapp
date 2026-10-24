-- ---------------------------------------------------------------------------
-- 005  Trazabilidad de la extraccion
--
-- Cada campo extraido del texto libre guarda la frase literal que lo justifica
-- y la regla que lo decidio. Sin eso, la ficha dice "ocupado" y el usuario no
-- tiene forma de contrastarlo: se lo cree o no se lo cree. Con la frase
-- delante, decide el.
-- ---------------------------------------------------------------------------

alter table lote add column if not exists cargas_evidencia text;
alter table lote add column if not exists situacion_evidencia text;
alter table lote add column if not exists extraccion_regla text;
-- 'reglas' o 'modelo': quien decidio, para poder medir a cada uno por separado.
alter table lote add column if not exists extraccion_origen text;
alter table lote add column if not exists extraccion_revisada timestamptz;

create index if not exists lote_necesita_revision_ix
  on lote (confianza_extraccion)
  where confianza_extraccion is not null and confianza_extraccion < 0.6;
