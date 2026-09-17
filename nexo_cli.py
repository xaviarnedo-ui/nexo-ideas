#!/usr/bin/env python3
"""CLI para que Claude lea/escriba la base de datos de NEXO Ideas desde
sesiones de Claude Code, sin pasar por la interfaz web. Solo librería
estándar (sin pip install). Lee SUPABASE_URL y SUPABASE_ANON_KEY de .env
(junto a este script).

Uso:
  python3 nexo_cli.py listar ideas
  python3 nexo_cli.py crear ideas '{"titulo":"...", "categoria_id":"..."}'
  python3 nexo_cli.py actualizar ideas <id> '{"estado":"validada"}'
  python3 nexo_cli.py borrar notas <id>
  python3 nexo_cli.py desetiquetar <idea_id> <etiqueta_id>
"""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ORDEN = {"categorias": "orden", "ideas": "created_at", "notas": "created_at", "nexos": "created_at"}


def leer_env():
    ruta = Path(__file__).parent / ".env"
    valores = {}
    try:
        texto = ruta.read_text()
    except FileNotFoundError:
        sys.exit(
            "No encuentro " + str(ruta) + ".\n"
            "Créalo copiando la plantilla:  cp .env.example .env\n"
            "y pon dentro tus SUPABASE_URL y SUPABASE_ANON_KEY reales."
        )
    for linea in texto.splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        clave, _, valor = linea.partition("=")
        valores[clave.strip()] = valor.strip()
    return valores


def requerir(env, clave):
    try:
        return env[clave]
    except KeyError:
        sys.exit("Falta " + clave + " en el archivo .env (mira .env.example).")


ENV = leer_env()
BASE = requerir(ENV, "SUPABASE_URL").rstrip("/") + "/rest/v1"
ANON_KEY = requerir(ENV, "SUPABASE_ANON_KEY")
HEADERS = {
    "apikey": ANON_KEY,
    "Authorization": "Bearer " + ANON_KEY,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def peticion(metodo, ruta, cuerpo=None):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(BASE + ruta, data=datos, method=metodo, headers=HEADERS)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        sys.exit("Error " + str(e.code) + ": " + e.read().decode())
    # HTTPError hereda de URLError, así que este except va después: aquí
    # caen los fallos de red (sin conexión, DNS, URL de Supabase mal puesta)
    except urllib.error.URLError as e:
        sys.exit(
            "No se pudo conectar con Supabase (" + BASE + "): " + str(e.reason) + "\n"
            "Revisa la conexión y el SUPABASE_URL del .env."
        )


def listar(tabla):
    ruta = "/" + tabla + "?select=*"
    if ORDEN.get(tabla):
        ruta += "&order=" + ORDEN[tabla]
    return peticion("GET", ruta)


def crear(tabla, cuerpo):
    return peticion("POST", "/" + tabla, cuerpo)


def actualizar(tabla, id_, cambios):
    return peticion("PATCH", "/" + tabla + "?id=eq." + id_, cambios)


def borrar(tabla, id_):
    return peticion("DELETE", "/" + tabla + "?id=eq." + id_)


def desetiquetar(idea_id, etiqueta_id):
    """idea_etiquetas no tiene columna id: se filtra por su pk compuesta."""
    ruta = "/idea_etiquetas?idea_id=eq." + idea_id + "&etiqueta_id=eq." + etiqueta_id
    return peticion("DELETE", ruta)


def cargar_json(texto):
    try:
        return json.loads(texto)
    except json.JSONDecodeError as e:
        sys.exit(
            "El argumento no es JSON válido (" + str(e) + "):\n"
            "  " + texto + "\n"
            "Va entre comillas simples, con comillas dobles dentro. Ejemplo:\n"
            "  python3 nexo_cli.py crear notas '{\"idea_id\":\"...\", \"contenido\":\"...\"}'"
        )


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    accion = sys.argv[1]
    try:
        if accion == "listar":
            resultado = listar(sys.argv[2])
        elif accion == "crear":
            resultado = crear(sys.argv[2], cargar_json(sys.argv[3]))
        elif accion == "actualizar":
            resultado = actualizar(sys.argv[2], sys.argv[3], cargar_json(sys.argv[4]))
        elif accion == "borrar":
            resultado = borrar(sys.argv[2], sys.argv[3])
        elif accion == "desetiquetar":
            resultado = desetiquetar(sys.argv[2], sys.argv[3])
        else:
            sys.exit(__doc__)
    except IndexError:
        sys.exit("Faltan argumentos para '" + accion + "'.\n" + __doc__)
    print(json.dumps(resultado, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
