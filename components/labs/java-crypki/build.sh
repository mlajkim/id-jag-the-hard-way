#!/usr/bin/env bash
set -euo pipefail

_crypki_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${_crypki_dir}/../../../tools/color.sh"

mkdir -p "${_crypki_dir}/target"
_crypki_artifact=$(mktemp "${_crypki_dir}/target/build.XXXXXX")
info "Compiling the local signer with the ZTS container's JDK and Athenz APIs..."
info "Testing production CA-map/default resolution without loading keys or certificates..."
if ! tar --no-xattrs -C "${_crypki_dir}" -cf - \
  LocalFileKmsSignerFactory.java LocalMappingTest.java ca-map.json \
  | kubectl --context kind-kind -n athenz exec -i deploy/athenz-zts-server -c athenz-zts-server -- \
    sh -c '
      set -eu
      crypki_build=$(mktemp -d)
      tar -xf - -C "${crypki_build}"
      mkdir "${crypki_build}/classes" "${crypki_build}/test-classes"
      env -u JDK_JAVA_OPTIONS -u JAVA_TOOL_OPTIONS -u _JAVA_OPTIONS javac --release 17 \
        -cp "/athenz/plugins/athenz-plugins.jar:/opt/athenz/zts/lib/jars/*" \
        -d "${crypki_build}/classes" "${crypki_build}/LocalFileKmsSignerFactory.java"
      env -u JDK_JAVA_OPTIONS -u JAVA_TOOL_OPTIONS -u _JAVA_OPTIONS javac --release 17 \
        -cp "/opt/athenz/zts/lib/jars/*" \
        -d "${crypki_build}/test-classes" "${crypki_build}/LocalMappingTest.java"
      env -u JDK_JAVA_OPTIONS -u JAVA_TOOL_OPTIONS -u _JAVA_OPTIONS java \
        -cp "${crypki_build}/test-classes:/opt/athenz/zts/lib/jars/*" \
        io.github.mlajkim.idthw.crypki.LocalMappingTest "${crypki_build}/ca-map.json" >&2
      jar --create --file "${crypki_build}/idthw-java-crypki-lab.jar" -C "${crypki_build}/classes" .
      cat "${crypki_build}/idthw-java-crypki-lab.jar"
    ' > "${_crypki_artifact}"; then
  fatal "Build failed; diagnostics are above and the partial artifact is retained"
fi

if [[ -e "${_crypki_dir}/target/idthw-java-crypki-lab.jar" ]]; then
  _crypki_previous=$(mktemp -d "${_crypki_dir}/target/previous.XXXXXX")
  mv "${_crypki_dir}/target/idthw-java-crypki-lab.jar" "${_crypki_previous}/"
  info "Preserved the previous JAR in ${_crypki_previous}"
fi
mv "${_crypki_artifact}" "${_crypki_dir}/target/idthw-java-crypki-lab.jar"
ok "Built components/labs/java-crypki/target/idthw-java-crypki-lab.jar"
