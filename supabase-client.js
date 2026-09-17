/* NEXO Ideas — cliente Supabase.
   La anon key es pública por diseño (protegida por RLS, no por secreto) —
   ver nota de seguridad en la spec. Reemplaza los dos valores de abajo con
   los del Task 1, paso 5 (Settings → API en tu proyecto Supabase). */
(function () {
  "use strict";
  var SUPABASE_URL = "https://cqjuqlrjidzulefeupqy.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxanVxbHJqaWR6dWxlZmV1cHF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0OTcxMTQsImV4cCI6MjEwMjA3MzExNH0.QxXV-PLREwxc2rJKs5TSNR81-u5I8o_AnSaHxz7ZaJE";
  window.NEXO_DB = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
