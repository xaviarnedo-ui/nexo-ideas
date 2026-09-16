/* NEXO Ideas — cliente Supabase.
   La anon key es pública por diseño (protegida por RLS, no por secreto) —
   ver nota de seguridad en la spec. Reemplaza los dos valores de abajo con
   los del Task 1, paso 5 (Settings → API en tu proyecto Supabase). */
(function () {
  "use strict";
  var SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
  var SUPABASE_ANON_KEY = "TU-ANON-KEY";
  window.NEXO_DB = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
