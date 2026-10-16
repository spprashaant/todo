#!/usr/bin/env bash
# Creates the release signing key for the Android app, once, on the owner's machine:
#   release.keystore              at the repo root (git-ignored)   RSA 4096, 10000 days, alias "todos"
#   release.keystore.base64.txt   the same, base64, for the ANDROID_KEYSTORE_BASE64 secret (git-ignored)
#   android/keystore.properties   lets a local `./gradlew assembleRelease` sign (git-ignored)
# Passwords are prompted for and handed to keytool through the environment, never on a command line.
# Then it prints the `gh secret set` commands for the release job in .github/workflows/android.yml.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEYSTORE="$ROOT/release.keystore"
B64="$ROOT/release.keystore.base64.txt"
PROPS="$ROOT/android/keystore.properties"
ALIAS="todos"
DNAME="${KEYSTORE_DNAME:-CN=Todos, O=coderlog.dev}"

die() { echo "error: $*" >&2; exit 1; }
command -v keytool >/dev/null 2>&1 || die "keytool not found: install a JDK (it ships with Android Studio too) and put its bin on PATH"
[ -e "$KEYSTORE" ] && die "$KEYSTORE already exists. A key that signed a published build must never be replaced: move it away on purpose first."
[ -d "$ROOT/android" ] || die "no android/ directory next to this script's parent; run from the repo"

read -r -s -p "Keystore password (8+ characters): " STORE_PASS; echo
read -r -s -p "Repeat keystore password: " STORE_PASS2; echo
[ "$STORE_PASS" = "$STORE_PASS2" ] || die "the keystore passwords differ"
[ "${#STORE_PASS}" -ge 8 ] || die "the keystore password must be at least 8 characters"
read -r -s -p "Key password (Enter to use the keystore password): " KEY_PASS; echo
if [ -z "$KEY_PASS" ]; then KEY_PASS="$STORE_PASS"; else
  read -r -s -p "Repeat key password: " KEY_PASS2; echo
  [ "$KEY_PASS" = "$KEY_PASS2" ] || die "the key passwords differ"
  [ "${#KEY_PASS}" -ge 8 ] || die "the key password must be at least 8 characters"
fi

umask 077
export TODOS_STORE_PASS="$STORE_PASS" TODOS_KEY_PASS="$KEY_PASS"
keytool -genkeypair -v \
  -keystore "$KEYSTORE" -storetype PKCS12 \
  -alias "$ALIAS" -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "$DNAME" \
  -storepass:env TODOS_STORE_PASS -keypass:env TODOS_KEY_PASS
unset TODOS_STORE_PASS TODOS_KEY_PASS

base64 < "$KEYSTORE" | tr -d '\n' > "$B64"
{
  echo "# Release signing for android/app/build.gradle. Git-ignored: never commit this file."
  echo "storeFile=../release.keystore"
  echo "storePassword=$STORE_PASS"
  echo "keyAlias=$ALIAS"
  echo "keyPassword=$KEY_PASS"
} > "$PROPS"
unset STORE_PASS STORE_PASS2 KEY_PASS KEY_PASS2

cat <<MSG

Written (all three are git-ignored):
  $KEYSTORE
  $B64
  $PROPS

Add the four GitHub secrets for the release job. Each command reads its value from a file or from what you
type (paste it, then Enter and Ctrl-D), so no password lands in your shell history:

  gh secret set ANDROID_KEYSTORE_BASE64 < release.keystore.base64.txt
  gh secret set ANDROID_KEYSTORE_PASSWORD        # then type the keystore password
  gh secret set ANDROID_KEY_PASSWORD             # then type the key password
  gh secret set ANDROID_KEY_ALIAS                # then type: $ALIAS

Afterwards delete release.keystore.base64.txt if you don't want a second copy lying around.

########################################################################################
#  BACK UP release.keystore AND BOTH PASSWORDS SOMEWHERE OUTSIDE THIS REPOSITORY NOW.  #
#  (a password manager plus an encrypted drive, for example)                           #
#  Without them no update to the published app can ever be signed again.              #
########################################################################################
MSG
