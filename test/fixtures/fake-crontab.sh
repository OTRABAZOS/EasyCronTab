#!/bin/sh
# crontab falso para tests: lee/escribe $FAKE_CRONTAB_FILE en vez del crontab real.
# Uso: EASYCRONTAB_CRONTAB_BIN=test/fixtures/fake-crontab.sh FAKE_CRONTAB_FILE=/tmp/x crontab -l | crontab -
[ -n "$FAKE_CRONTAB_FILE" ] || { echo "FAKE_CRONTAB_FILE no definido" >&2; exit 2; }
case "$1" in
  -l)
    if [ -f "$FAKE_CRONTAB_FILE" ]; then cat "$FAKE_CRONTAB_FILE"; else echo "no crontab for $(id -un)" >&2; exit 1; fi ;;
  -)
    cat > "$FAKE_CRONTAB_FILE" ;;
  *)
    echo "fake-crontab: opción no soportada: $1" >&2; exit 2 ;;
esac
