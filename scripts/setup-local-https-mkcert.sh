#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="$ROOT_DIR/.certs"
CERT_FILE="$CERT_DIR/localhost.pem"
KEY_FILE="$CERT_DIR/localhost-key.pem"

if ! command -v mkcert >/dev/null 2>&1; then
  echo "mkcert が見つかりません。"
  echo "macOS: brew install mkcert nss"
  exit 1
fi

mkdir -p "$CERT_DIR"

mkcert -install
mkcert -cert-file "$CERT_FILE" -key-file "$KEY_FILE" localhost 127.0.0.1 ::1

echo "証明書を生成しました:"
echo "  $CERT_FILE"
echo "  $KEY_FILE"
echo
echo "次を実行してください:"
echo "  docker-compose -f docker-compose.yml -f docker-compose.build-https-mkcert.yml up -d --build"
