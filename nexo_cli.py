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
    for linea in ruta.read_text().splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        clave, _, valor = linea.partition("=")
        valores[clave.strip()] = valor.strip()
    return valores


ENV = leer_env()
BASE = ENV["SUPABASE_URL"].rstrip("/") + "/rest/v1"
HEADERS = {
    "apikey": ENV["SUPABASE_ANON_KEY"],
    "Authorization": "Bearer " + ENV["SUPABASE_ANON_KEY"],
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


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    accion, tabla = sys.argv[1], sys.argv[2]
    if accion == "listar":
        resultado = listar(tabla)
    elif accion == "crear":
        resultado = crear(tabla, json.loads(sys.argv[3]))
    elif accion == "actualizar":
        resultado = actualizar(tabla, sys.argv[3], json.loads(sys.argv[4]))
    elif accion == "borrar":
        resultado = borrar(tabla, sys.argv[3])
    else:
        sys.exit(__doc__)
    print(json.dumps(resultado, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
