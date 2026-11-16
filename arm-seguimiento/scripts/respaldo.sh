#!/usr/bin/env bash
# Respaldo del sistema: la base de datos y los documentos de la ficha clínica.
#
# Uso:   scripts/respaldo.sh
# Lee backend/.env (DB_*, ARCHIVOS_DIR y RESPALDOS_DIR). Deja en RESPALDOS_DIR dos archivos con la fecha:
#   db-AAAAMMDD-HHMM.sql.gz        base de datos completa (con sus reglas de auditoría)
#   archivos-AAAAMMDD-HHMM.tar.gz  documentos adjuntos de las fichas
# Borra los respaldos de más de 14 días. Los respaldos contienen datos de salud: la carpeta queda solo para el dueño.
#
# Programarlo todos los días, por ejemplo con cron:  30 2 * * *  /ruta/arm-seguimiento/scripts/respaldo.sh
# Un respaldo que vive solo en el mismo computador no protege de una falla del disco: copie la carpeta a un disco externo.
set -euo pipefail

raiz="$(cd "$(dirname "$0")/.." && pwd)"
cd "$raiz/backend"
[ -f .env ] || { echo "No existe backend/.env" >&2; exit 1; }

# Lee una variable de .env sin ejecutar el archivo (las claves pueden tener caracteres especiales).
leer() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true; }

DB_HOST="$(leer DB_HOST)"; DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="$(leer DB_PORT)"; DB_PORT="${DB_PORT:-3306}"
DB_USER="$(leer DB_USER)"; DB_PASS="$(leer DB_PASS)"; DB_NAME="$(leer DB_NAME)"
ARCHIVOS="$(leer ARCHIVOS_DIR)"; ARCHIVOS="${ARCHIVOS:-./archivos}"
DESTINO="$(leer RESPALDOS_DIR)"; DESTINO="${DESTINO:-./respaldos}"
[ -n "$DB_USER" ] && [ -n "$DB_NAME" ] || { echo "Faltan DB_USER o DB_NAME en backend/.env" >&2; exit 1; }

volcar="$(command -v mariadb-dump || command -v mysqldump || true)"
[ -n "$volcar" ] || { echo "No se encontró mariadb-dump ni mysqldump" >&2; exit 1; }

umask 077
mkdir -p "$DESTINO"
fecha="$(date +%Y%m%d-%H%M)"

# La clave va por variable de entorno, no por la línea de comandos (donde otros usuarios la verían).
MYSQL_PWD="$DB_PASS" "$volcar" --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" \
  --single-transaction --routines --triggers "$DB_NAME" | gzip > "$DESTINO/db-$fecha.sql.gz"

if [ -d "$ARCHIVOS" ]; then
  tar -czf "$DESTINO/archivos-$fecha.tar.gz" -C "$(dirname "$ARCHIVOS")" "$(basename "$ARCHIVOS")"
fi

# Verifica que el volcado no quedó vacío o cortado.
gzip -t "$DESTINO/db-$fecha.sql.gz"
find "$DESTINO" -type f \( -name 'db-*.sql.gz' -o -name 'archivos-*.tar.gz' \) -mtime +14 -delete
echo "Respaldo listo en $DESTINO ($fecha)"
