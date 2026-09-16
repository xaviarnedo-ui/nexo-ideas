-- Categorías
insert into categorias (nombre, color_acento, orden) values
  ('Objetivos y herramientas', '#0d9488', 1),
  ('Conceptos clave',          '#4f46e5', 2),
  ('Referentes',               '#9333ea', 3),
  ('Libros',                   '#d97706', 4),
  ('Investigación/evidencia',  '#e11d48', 5);

-- Ideas
insert into ideas (titulo, categoria_id, estado) values
  ('Decatlón con objetivos organizados por franjas de edad',
   (select id from categorias where nombre = 'Objetivos y herramientas'), 'suelta'),
  ('Lista de 50 objetivos para poder hacer a los 75 años',
   (select id from categorias where nombre = 'Objetivos y herramientas'), 'suelta'),
  ('Deterioro del VO2max y masa muscular con la edad',
   (select id from categorias where nombre = 'Objetivos y herramientas'), 'suelta'),
  ('Salud mitocondrial y flexibilidad metabólica',
   (select id from categorias where nombre = 'Conceptos clave'), 'suelta'),
  ('Picos de glucosa',
   (select id from categorias where nombre = 'Conceptos clave'), 'suelta'),
  ('Ayuno',
   (select id from categorias where nombre = 'Conceptos clave'), 'suelta'),
  ('Suplementación (creatina, omega-3, magnesio)',
   (select id from categorias where nombre = 'Conceptos clave'), 'suelta'),
  ('Beneficios del entrenamiento en zona 2',
   (select id from categorias where nombre = 'Conceptos clave'), 'suelta'),
  ('Sensibilidad a la insulina según el momento del día',
   (select id from categorias where nombre = 'Conceptos clave'), 'suelta'),
  ('Iñigo San Millán',
   (select id from categorias where nombre = 'Referentes'), 'suelta'),
  ('Peter Attia',
   (select id from categorias where nombre = 'Referentes'), 'suelta'),
  ('Odile Fernández',
   (select id from categorias where nombre = 'Referentes'), 'suelta'),
  ('Estimula tu nervio vago (Antonio Valenzuela)',
   (select id from categorias where nombre = 'Libros'), 'suelta'),
  ('Sin límites (Peter Attia)',
   (select id from categorias where nombre = 'Libros'), 'suelta'),
  ('PNI en deporte de élite (revisión)',
   (select id from categorias where nombre = 'Investigación/evidencia'), 'suelta');

update ideas set cuerpo =
  'Síndrome de sobreentrenamiento, inmunidad de mucosas (IgA salival), estrés psicológico y riesgo de lesión, intervenciones mente-cuerpo, eje intestino-cerebro-inmunidad, salud mental e inflamación, sueño, y glucemia/picos de glucosa en deportistas.'
where titulo = 'PNI en deporte de élite (revisión)';

-- Notas de "Sin límites"
insert into notas (idea_id, contenido, fuente_titulo, fuente_autor, fuente_ref) values
  ((select id from ideas where titulo = 'Sin límites (Peter Attia)'),
   'Sueño y resistencia a la insulina (estudio de Eve Van Cauter).',
   'Sin límites', 'Peter Attia', null),
  ((select id from ideas where titulo = 'Sin límites (Peter Attia)'),
   'Sueño y enfermedad cardiovascular: eje cortisol/sistema nervioso simpático y grelina/leptina.',
   'Sin límites', 'Peter Attia', null);

-- Etiquetas de ejemplo
insert into etiquetas (nombre) values ('sueño'), ('insulina');

insert into idea_etiquetas (idea_id, etiqueta_id) values
  ((select id from ideas where titulo = 'Picos de glucosa'),
   (select id from etiquetas where nombre = 'insulina')),
  ((select id from ideas where titulo = 'Sensibilidad a la insulina según el momento del día'),
   (select id from etiquetas where nombre = 'insulina')),
  ((select id from ideas where titulo = 'Sensibilidad a la insulina según el momento del día'),
   (select id from etiquetas where nombre = 'sueño')),
  ((select id from ideas where titulo = 'Sin límites (Peter Attia)'),
   (select id from etiquetas where nombre = 'sueño'));

-- Nexos de ejemplo
insert into nexos (idea_id_a, idea_id_b) values
  ((select id from ideas where titulo = 'Picos de glucosa'),
   (select id from ideas where titulo = 'Sensibilidad a la insulina según el momento del día')),
  ((select id from ideas where titulo = 'Sensibilidad a la insulina según el momento del día'),
   (select id from ideas where titulo = 'Sin límites (Peter Attia)'));
