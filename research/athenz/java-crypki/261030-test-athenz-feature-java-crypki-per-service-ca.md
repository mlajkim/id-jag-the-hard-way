# Goal

Learn how the existing `athenz-zts-server` chooses a certificate authority by adding a Java Crypki signer, keeping its current CA as the default, and applying one new CA to a domain with subdomain and service exceptions.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Step 1. Understand how ZTS selects the CA](#step-1-understand-how-zts-selects-the-ca)
- [Step 2. Understand the provided CA mapping](#step-2-understand-the-provided-ca-mapping)
- [Step 3. Build the local signer factory](#step-3-build-the-local-signer-factory)
- [Step 4. Reuse the existing default CA](#step-4-reuse-the-existing-default-ca)
- [Step 5. Create the special CA](#step-5-create-the-special-ca)
- [Step 6. Create the crypki-lab domain](#step-6-create-the-crypki-lab-domain)
- [Step 7. Select the special CA at the domain level](#step-7-select-the-special-ca-at-the-domain-level)
- [Step 8. Create a subdomain for the default-CA case](#step-8-create-a-subdomain-for-the-default-ca-case)
- [Step 9. Leave the subdomain signer unset](#step-9-leave-the-subdomain-signer-unset)
- [Step 10. Register the three service identities](#step-10-register-the-three-service-identities)
- [Step 11. Allow the instance provider to launch these services](#step-11-allow-the-instance-provider-to-launch-these-services)
- [Step 12. Override the CA for one service](#step-12-override-the-ca-for-one-service)
- [Step 13. Read back the selection inputs](#step-13-read-back-the-selection-inputs)
- [Step 14. Keep a private copy of the baseline configuration](#step-14-keep-a-private-copy-of-the-baseline-configuration)
- [Step 15. Configure Java Crypki and its default signer](#step-15-configure-java-crypki-and-its-default-signer)
- [Step 16. Point the existing ZTS at the Crypki configuration](#step-16-point-the-existing-zts-at-the-crypki-configuration)
- [Step 17. Make the compiled adapter and CA map available to ZTS](#step-17-make-the-compiled-adapter-and-ca-map-available-to-zts)
- [Step 18. Mount the existing default CA and the new special CA](#step-18-mount-the-existing-default-ca-and-the-new-special-ca)
- [Step 19. Prepare the update and restoration patches](#step-19-prepare-the-update-and-restoration-patches)
- [Step 20. Apply the configuration to the existing ZTS](#step-20-apply-the-configuration-to-the-existing-zts)
- [Step 21. Prepare the certificate verifier](#step-21-prepare-the-certificate-verifier)
- [Step 22. Issue with the default CA](#step-22-issue-with-the-default-ca)
- [Step 23. Issue with the domain CA](#step-23-issue-with-the-domain-ca)
- [Step 24. Issue with the service override](#step-24-issue-with-the-service-override)
- [Clean-up 1. Restore the original ZTS signer](#clean-up-1-restore-the-original-zts-signer)

<!-- /TOC -->

<details>
<summary>Last checked on Oct 31, 2026 — 🟡 Factory build and existing-ZTS manifest checks passed; live issuance pending</summary>

| # | Date | Confirmed Working |
|---|---|---|
| 1 | Oct 30, 2026 | ✅ Previous helper-based build compiled against v1.12.48 ZTS libraries and passed the real Crypki configuration checks |
| 2 | Oct 31, 2026 | ✅ The factory build script compiled the adapter with `javac 27` and `--release 17`; real CA-map/default-resolution checks passed without accessing credentials |
| 3 | Oct 31, 2026 | ✅ Historical separate-ZTS version: ConfigMap/Deployment/Service assembly and six isolation/CA-wiring tests passed on synthetic inputs; this does not verify the existing-ZTS procedure below |
| 4 | Oct 31, 2026 | ✅ The previous guide revision's 37 command/result pairs, shell syntax, links, and displayed source passed checks; earlier certificate-verifier checks covered 12 control-flow cases with mocked OpenSSL output |
| 5 | Oct 31, 2026 | ✅ Twelve existing-ZTS preservation, CA-wiring, and update/restoration tests passed; the guide's six local manifest-assembly blocks matched the verifier on synthetic inputs, with no cluster or credential access |
| 6 | Oct 31, 2026 | ✅ Ten documented service/role/membership/policy helper calls and eight service-helper context/compatibility/error cases passed with mocked requests; no cluster or credentials were accessed |
| 7 | Oct 31, 2026 | ✅ The system metadata setter and domain/service readers passed 41 mocked execution cases, including the three updates, five independent read-back checks, failure handling, and existing local behavior; all 41 command/result pairs passed shell syntax and pairing checks without cluster or credential access |
| 8 | Oct 31, 2026 | 🟡 Existing-CA reuse, special-CA preparation, ZMS registration, the live Deployment update/restoration, issuance, and certificate verification still require an operator run |

The observed baseline uses `ghcr.io/ctyano/athenz-zts-server:v1.12.48`, the `KeyStoreCertSignerFactory`, and OpenSSL 3.5.8 in `athenz-cli`. This guide changes that existing Deployment to `JavaCrypkiCertSignerFactory` and rolls its pods; its current signing CA remains the default.

This exercise targets Java Crypki from #3468 and the CA/backend-key mapping from #3498. Domain/service signer metadata and service-over-domain precedence already existed. The local adapter replaces cloud KMS operations with file-backed RSA signing; AWS/GCP IAM, cloud APIs, PKCS#11/HSM integration, and certificate refresh are outside this test. Compilation and configuration checks do not prove certificate issuance.

LY AI Policy rule 1 prevents the authoring agent from reading or copying credential material, including disposable keys, tokens, and certificates. Credential-dependent commands below are for the operator and show **expected results**, not observed successes. The [policy documentation](https://github.com/secdev-whc/ai-cli-hardening) describes the managed settings and user-run removal procedure. The Oct 30 helper results are historical evidence; they do not verify this revised end-to-end procedure.

</details>

# Prerequisites

This tutorial requires the following to be completed:

1. Complete the main [ID-JAG The Hard Way lab](https://github.com/mlajkim/id-jag-the-hard-way)
1. Have the local `kind-kind` context with `athenz-zms-server`, `athenz-zts-server`, and `athenz-cli` running in namespace `athenz`, with the lab admin identity and `sys.auth.zts` instance provider available
1. Have Bash, `kubectl`, `jq`, `tar`, and Python 3 on the host; use the existing container JDK, `zts-svccert`, `curl`, `jq`, and OpenSSL 3
1. Run host commands from the **IDTHW repository root** using Bash

# Steps

Here is the procedure to get to the goals.

## Step 1. Understand how ZTS selects the CA

The three issuance requests omit `x509CertSignerKeyId`. ZTS chooses the service setting first, then the domain setting, then the configured default:

| Service | Domain signer ID | Service signer ID | Expected issuing CA |
|---|---|---|---|
| `crypki-lab.api` | `special-ca` | Unset | New special CA |
| `crypki-lab.default.api` | Unset | Unset | Existing default CA |
| `crypki-lab.override` | `special-ca` | `default-ca` | Existing default CA |

`default-ca` is the lab signer ID for the CA already configured by the Athenz manifest. `special-ca` is the only new CA. `crypki-lab.default` is a subdomain whose own signer setting will be cleared; `override` is a service inside the parent domain.

The supplied [LocalFileKmsSignerFactory.java](../../../components/labs/java-crypki/LocalFileKmsSignerFactory.java) connects Java Crypki to RSA keys mounted from Kubernetes Secrets, so this local exercise can run without a cloud KMS. Java Crypki constructs the certificates, and its `KmsCaCertificateStore` resolves the signer ID to the backend key and CA certificate.

The existing `KeyStoreCertSigner` uses one CA/key pair and ignores the signer ID, so the map needs a signer that supports it. The build step compiles the supplied factory into a plugin JAR; the existing ZTS image loads it after a rollout. For example, `special-ca` resolves to backend ID `special`, which selects `special.key`; the factory checks that this key matches the mapped CA certificate before using it.

## Step 2. Understand the provided CA mapping

Read the provided [ca-map.json](../../../components/labs/java-crypki/ca-map.json) to understand how each Athenz signer ID maps to a backend key and CA certificate path. This file is already included in the repository; the next step validates it during the build. The backend IDs deliberately differ from the signer IDs:

```json
{
  "default-ca": {
    "keyId": "default",
    "caCertPath": "/var/run/idthw-crypki/default-ca.crt"
  },
  "special-ca": {
    "keyId": "special",
    "caCertPath": "/var/run/idthw-crypki/special-ca.crt"
  }
}
```

| Athenz signer ID | Mapped backend ID | Local signing key | CA certificate in ZTS |
|---|---|---|---|
| `default-ca` | `default` | `/var/run/idthw-crypki/default.key` | `/var/run/idthw-crypki/default-ca.crt` |
| `special-ca` | `special` | `/var/run/idthw-crypki/special.key` | `/var/run/idthw-crypki/special-ca.crt` |

The default paths are aliases supplied by the projected volume: `default.key` refers to the existing `ca.private.pem`, and `default-ca.crt` refers to the existing `selfsign.ca.cert.pem`.

## Step 3. Build the local signer factory

ZTS loads the factory from a JAR. Use [build.sh](../../../components/labs/java-crypki/build.sh) to build it with the running ZTS container's JDK and libraries, so the compiled class matches the Athenz APIs used by this lab.

The script performs three operations:

1. Compile the supplied [factory source](../../../components/labs/java-crypki/LocalFileKmsSignerFactory.java) with `--release 17`
1. Run [LocalMappingTest.java](../../../components/labs/java-crypki/LocalMappingTest.java) against the CA map to check both signer-to-backend mappings and default selection; its dummy backend throws if the check attempts signing or key/certificate access
1. Package the factory into `components/labs/java-crypki/target/idthw-java-crypki-lab.jar`

Run this command from the IDTHW repository root. The script selects `kind-kind` explicitly and prints compilation or configuration-check failures:

```sh
bash components/labs/java-crypki/build.sh
```

```sh
# Captured output — Oct 31, 2026; timestamped library log and previous-JAR path omitted
#   ·  Compiling the local signer with the ZTS container's JDK and Athenz APIs...
#   ·  Testing production CA-map/default resolution without loading keys or certificates...
# PASS: real KmsCaCertificateStore maps both signer IDs to distinct backend IDs and CA paths
# PASS: real KmsCrypkiSigner resolves defaults and preserves an explicit signer ID
# PASS: real CrypkiRequestFactory.forKms uses the configured default
# No key, certificate, signing operation, or cloud API was accessed by these tests
#   ✔  Built components/labs/java-crypki/target/idthw-java-crypki-lab.jar
```

The later [adapter mount step](#step-17-make-the-compiled-adapter-and-ca-map-available-to-zts) puts this JAR into a ConfigMap and mounts it on the existing ZTS's classpath. Updating `athenz-zts-server` then restarts its pods to load the factory. This command only builds the JAR; CA preparation and configuration are separate steps below.

Run the same build command after changing the Java source. A successful rebuild preserves the previous JAR under `target/previous.*`; a failed compilation or configuration check leaves the previous JAR in place and retains the partial build artifact for inspection.

## Step 4. Reuse the existing default CA

The baseline [ZTS manifest](../../../athenz_dist/kubernetes/athenz-zts-server/kustomize/deployment.yaml) already mounts its signing key from `athenz-zts-keys/ca.private.pem` and its CA certificate from `athenz-zts-certs/selfsign.ca.cert.pem`. The lab uses that same pair as `default-ca`; the projected volume added later exposes it as `default.key` and `default-ca.crt` for the adapter.

The following credential-dependent commands are operator-run. Copy only the existing CA certificate into the CLI pod so the verifier can compare returned certificates with this exact CA. The signing key stays in its existing Secret:

```sh
(
  set -euo pipefail
  kubectl --context kind-kind -n athenz exec deploy/athenz-zts-server -c athenz-zts-server -- \
    tar -C /opt/athenz/zts/var/certs -cf - selfsign.ca.cert.pem \
    | kubectl --context kind-kind -n athenz exec -i deploy/athenz-cli -- sh -eu -c '
      umask 077
      mkdir /tmp/idthw-java-crypki-ca
      tar -xf - -C /tmp/idthw-java-crypki-ca
      mv /tmp/idthw-java-crypki-ca/selfsign.ca.cert.pem /tmp/idthw-java-crypki-ca/default-ca.crt
      openssl x509 -in /tmp/idthw-java-crypki-ca/default-ca.crt -noout -subject -issuer -fingerprint -sha256
      printf "Saved the existing default CA certificate for verification\n"
    '
)
```

```sh
# Expected result — certificate transfer has not been run; existing subject, issuer, and fingerprint omitted
# Saved the existing default CA certificate for verification
```

This creates a private reference copy, preserving the existing CA's key, subject, and validity period. The directory creation fails if an earlier lab run already exists.

## Step 5. Create the special CA

Create the one new CA used by `crypki-lab`: an independent RSA key and a root certificate valid for seven days. A different subject makes the issuer easy to recognize; its different key is what makes the two trust chains independent.

```sh
kubectl --context kind-kind -n athenz exec -i deploy/athenz-cli -- sh -eu <<'SH'
umask 077
cd /tmp/idthw-java-crypki-ca
if [ -e special.key ] || [ -e special-ca.crt ]; then
  printf 'Stop: special CA files already exist; preserve the previous run\n' >&2
  exit 1
fi
openssl genrsa -traditional -out special.key 2048
openssl req -new -x509 -sha256 -days 7 \
  -key special.key -subj '/O=IDTHW Crypki Lab/CN=IDTHW Special CA' \
  -addext 'basicConstraints=critical,CA:TRUE,pathlen:0' \
  -addext 'keyUsage=critical,keyCertSign,cRLSign' \
  -out special-ca.crt
openssl verify -check_ss_sig -no-CApath -no-CAstore -CAfile special-ca.crt special-ca.crt
openssl x509 -in special-ca.crt -noout -subject -issuer -fingerprint -sha256
SH
```

```sh
# Expected result — CA creation has not been run; generated SHA-256 fingerprint omitted
# special-ca.crt: OK
# subject=O=IDTHW Crypki Lab, CN=IDTHW Special CA
# issuer=O=IDTHW Crypki Lab, CN=IDTHW Special CA
```

The adapter checks that the signing keys are RSA and match their CA certificates when used. The existing default key stays in its original Secret; only this new special CA pair will be copied to the host. The existing ZTS keeps its server TLS identity and client-authentication trust.

## Step 6. Create the crypki-lab domain

Create the top-level domain with the existing [create-tld.sh](../../../tools/athenz/create-tld.sh) helper. It uses the main lab's local ZMS endpoint and host-side admin files, so keep the ZMS port-forward running. The next step assigns `special-ca` to this domain.

```sh
bash tools/athenz/create-tld.sh crypki-lab
```

```sh
# Expected result — command not yet run; domain does not already exist
#   ·  Creating TLD: crypki-lab...
#   ✔  TLD created: crypki-lab
```

If the domain already exists, the helper prints `✔  TLD already exists: crypki-lab` and skips creation.

## Step 7. Select the special CA at the domain level

Use [set-system-meta.sh](../../../tools/athenz/set-system-meta.sh) to bind `crypki-lab` to `special-ca`. Pass the JSON field name `x509CertSignerKeyId`; the helper encodes the value and uses the lowercase path attribute `x509certsignerkeyid`. It runs through the `athenz-cli` pod in the selected context. Updating this system setting requires the lab admin's system privileges.

Set the domain signer. Services without their own signer setting will inherit this value:

```sh
bash tools/athenz/set-system-meta.sh --context kind-kind \
  crypki-lab x509CertSignerKeyId special-ca
```

```sh
# Expected result — request not yet run
#   ·  Setting system metadata crypki-lab: {"x509CertSignerKeyId":"special-ca"}...
#
# HTTP 204
#   ✔  System metadata set: crypki-lab x509CertSignerKeyId
```

## Step 8. Create a subdomain for the default-CA case

Create `crypki-lab.default` with the existing [create-subdomain.sh](../../../tools/athenz/create-subdomain.sh) helper, passing the parent `crypki-lab` first and the short name `default` second. Keep the main lab's ZMS port-forward running. ZMS copies the parent's current signer setting when creating a subdomain, so a new subdomain initially receives `special-ca`. The next step clears that copied setting.

```sh
bash tools/athenz/create-subdomain.sh crypki-lab default
```

```sh
# Expected result — command not yet run; subdomain does not already exist
#   ·  Creating Subdomain: crypki-lab.default...
#   ✔  Subdomain created: crypki-lab.default
```

If the subdomain already exists, the helper prints `✔  Subdomain already exists: crypki-lab.default` and skips creation. Continue to Step 9 to clear its signer setting.

## Step 9. Leave the subdomain signer unset

Set the subdomain's signer metadata to JSON `null` with the same helper's `--json` option. This removes its copied CA selection, so a service with no override uses the configured default. ZTS reads the service's own domain record at issuance time; it does not search parent domains for another signer setting. Resetting an existing system-metadata value also requires the corresponding delete permission, which is why this step uses the lab system admin.

```sh
bash tools/athenz/set-system-meta.sh --context kind-kind --json \
  crypki-lab.default x509CertSignerKeyId null
```

```sh
# Expected result — request not yet run
#   ·  Setting system metadata crypki-lab.default: {"x509CertSignerKeyId":null}...
#
# HTTP 204
#   ✔  System metadata set: crypki-lab.default x509CertSignerKeyId
```

## Step 10. Register the three service identities

Register each identity with [create-service.sh](../../../tools/athenz/create-service.sh). Omit its optional public-key argument for this instance-registration-token flow; the helper registers the service name through `athenz-cli`. `--context kind-kind` selects the lab cluster explicitly.

`crypki-lab.default.api` will use the existing default CA because both its service and subdomain signer settings are unset:

```sh
bash tools/athenz/create-service.sh --context kind-kind crypki-lab.default api
```

```sh
# Expected result — command not yet run
#   ·  Registering Service: crypki-lab.default.api...
#   ✔  Service registered: crypki-lab.default.api
```

`crypki-lab.api` will use the special CA configured on its domain:

```sh
bash tools/athenz/create-service.sh --context kind-kind crypki-lab api
```

```sh
# Expected result — command not yet run
#   ·  Registering Service: crypki-lab.api...
#   ✔  Service registered: crypki-lab.api
```

`crypki-lab.override` will explicitly select the existing default CA at the service level in Step 12:

```sh
bash tools/athenz/create-service.sh --context kind-kind crypki-lab override
```

```sh
# Expected result — command not yet run
#   ·  Registering Service: crypki-lab.override...
#   ✔  Service registered: crypki-lab.override
```

If a service already exists, the helper reports `Service already registered` and skips creation. Step 13 checks the stored signer settings before issuance.

## Step 11. Allow the instance provider to launch these services

A service name alone does not authorize certificate issuance. The `sys.auth.zts` instance provider needs a role and a policy granting `launch` on the service resource. The role answers who may act; the policy states which action and resource that role may use.

Use [create-role.sh](../../../tools/athenz/create-role.sh), [add-role-member.sh](../../../tools/athenz/add-role-member.sh), and [add-policy.sh](../../../tools/athenz/add-policy.sh) for these operations. Keep the main lab's ZMS port-forward running. The policy helper accepts a resource relative to the domain, such as `service.api`, and adds the domain prefix.

Create the provider role in `crypki-lab.default`:

```sh
bash tools/athenz/create-role.sh crypki-lab.default crypki-lab-provider
```

```sh
# Expected result — command not yet run
#   ·  Creating Role: crypki-lab.default:role.crypki-lab-provider...
#   ✔  Role created: crypki-lab.default:role.crypki-lab-provider
```

Add `sys.auth.zts` to `crypki-lab.default:role.crypki-lab-provider`:

```sh
bash tools/athenz/add-role-member.sh crypki-lab.default crypki-lab-provider sys.auth.zts
```

```sh
# Expected result — command not yet run
#   ·  Adding Member sys.auth.zts to Role: crypki-lab.default:role.crypki-lab-provider...
#   ✔  sys.auth.zts  →  crypki-lab.default:role.crypki-lab-provider
```

Grant that role `launch` on `crypki-lab.default:service.api`:

```sh
bash tools/athenz/add-policy.sh crypki-lab.default crypki-lab-provider launch service.api
```

```sh
# Expected result — command not yet run
#   ·  Creating Policy: crypki-lab.default:policy.crypki-lab-provider_launch_service_api...
#   ✔  Policy created: crypki-lab.default:policy.crypki-lab-provider_launch_service_api
```

Create the provider role in `crypki-lab`:

```sh
bash tools/athenz/create-role.sh crypki-lab crypki-lab-provider
```

```sh
# Expected result — command not yet run
#   ·  Creating Role: crypki-lab:role.crypki-lab-provider...
#   ✔  Role created: crypki-lab:role.crypki-lab-provider
```

Add `sys.auth.zts` to `crypki-lab:role.crypki-lab-provider`:

```sh
bash tools/athenz/add-role-member.sh crypki-lab crypki-lab-provider sys.auth.zts
```

```sh
# Expected result — command not yet run
#   ·  Adding Member sys.auth.zts to Role: crypki-lab:role.crypki-lab-provider...
#   ✔  sys.auth.zts  →  crypki-lab:role.crypki-lab-provider
```

Grant that role `launch` on `crypki-lab:service.api`:

```sh
bash tools/athenz/add-policy.sh crypki-lab crypki-lab-provider launch service.api
```

```sh
# Expected result — command not yet run
#   ·  Creating Policy: crypki-lab:policy.crypki-lab-provider_launch_service_api...
#   ✔  Policy created: crypki-lab:policy.crypki-lab-provider_launch_service_api
```

Grant that role `launch` on `crypki-lab:service.override`:

```sh
bash tools/athenz/add-policy.sh crypki-lab crypki-lab-provider launch service.override
```

```sh
# Expected result — command not yet run
#   ·  Creating Policy: crypki-lab:policy.crypki-lab-provider_launch_service_override...
#   ✔  Policy created: crypki-lab:policy.crypki-lab-provider_launch_service_override
```

The role and membership helpers skip entries that already exist. The policy helper creates one named policy per role/action/resource combination, so the parent domain has separate policies for `api` and `override`.

## Step 12. Override the CA for one service

Give only `crypki-lab.override` its own signer setting with `--service override`. ZTS checks the service before its domain, so `default-ca` will take precedence over the domain's `special-ca`:

```sh
bash tools/athenz/set-system-meta.sh --context kind-kind --service override \
  crypki-lab x509CertSignerKeyId default-ca
```

```sh
# Expected result — request not yet run
#   ·  Setting system metadata crypki-lab.override: {"x509CertSignerKeyId":"default-ca"}...
#
# HTTP 204
#   ✔  System metadata set: crypki-lab.override x509CertSignerKeyId
```

## Step 13. Read back the selection inputs

Check the stored metadata before issuing anything. Each command below uses [show-domain.sh](../../../tools/athenz/show-domain.sh) or [show-service.sh](../../../tools/athenz/show-service.sh) to read one record through the `kind-kind` CLI pod, prints its signer metadata, and fails if its name or signer differs from the expected value. Each block is independent.

Confirm that the subdomain's copied signer selection was cleared:

```sh
_crypki_record=$(bash tools/athenz/show-domain.sh --context kind-kind crypki-lab.default) &&
  printf '%s\n' "${_crypki_record}" | jq -cse '
    if length == 1 then .[0] else error("Expected one domain record") end
    | {name, x509CertSignerKeyId: (.x509CertSignerKeyId // null)}
    | if .name == "crypki-lab.default" and .x509CertSignerKeyId == null
      then . else error("Unexpected signer metadata for crypki-lab.default") end
  '
```

```sh
# Expected result — metadata inspection has not been run
#   ·  Showing domain crypki-lab.default...
# {"name":"crypki-lab.default","x509CertSignerKeyId":null}
```

Confirm that the subdomain's API has no service override, so it can use the existing default CA:

```sh
_crypki_record=$(bash tools/athenz/show-service.sh --context kind-kind crypki-lab.default api) &&
  printf '%s\n' "${_crypki_record}" | jq -cse '
    if length == 1 then .[0] else error("Expected one service record") end
    | (.service // .) | {name, x509CertSignerKeyId: (.x509CertSignerKeyId // null)}
    | if .name == "crypki-lab.default.api" and .x509CertSignerKeyId == null
      then . else error("Unexpected signer metadata for crypki-lab.default.api") end
  '
```

```sh
# Expected result — metadata inspection has not been run
#   ·  Showing service crypki-lab.default.api...
# {"name":"crypki-lab.default.api","x509CertSignerKeyId":null}
```

Confirm that the parent domain selects the special CA:

```sh
_crypki_record=$(bash tools/athenz/show-domain.sh --context kind-kind crypki-lab) &&
  printf '%s\n' "${_crypki_record}" | jq -cse '
    if length == 1 then .[0] else error("Expected one domain record") end
    | {name, x509CertSignerKeyId: (.x509CertSignerKeyId // null)}
    | if .name == "crypki-lab" and .x509CertSignerKeyId == "special-ca"
      then . else error("Unexpected signer metadata for crypki-lab") end
  '
```

```sh
# Expected result — metadata inspection has not been run
#   ·  Showing domain crypki-lab...
# {"name":"crypki-lab","x509CertSignerKeyId":"special-ca"}
```

Confirm that its API has no service override and inherits that domain selection:

```sh
_crypki_record=$(bash tools/athenz/show-service.sh --context kind-kind crypki-lab api) &&
  printf '%s\n' "${_crypki_record}" | jq -cse '
    if length == 1 then .[0] else error("Expected one service record") end
    | (.service // .) | {name, x509CertSignerKeyId: (.x509CertSignerKeyId // null)}
    | if .name == "crypki-lab.api" and .x509CertSignerKeyId == null
      then . else error("Unexpected signer metadata for crypki-lab.api") end
  '
```

```sh
# Expected result — metadata inspection has not been run
#   ·  Showing service crypki-lab.api...
# {"name":"crypki-lab.api","x509CertSignerKeyId":null}
```

Confirm that the override service explicitly selects the existing default CA:

```sh
_crypki_record=$(bash tools/athenz/show-service.sh --context kind-kind crypki-lab override) &&
  printf '%s\n' "${_crypki_record}" | jq -cse '
    if length == 1 then .[0] else error("Expected one service record") end
    | (.service // .) | {name, x509CertSignerKeyId: (.x509CertSignerKeyId // null)}
    | if .name == "crypki-lab.override" and .x509CertSignerKeyId == "default-ca"
      then . else error("Unexpected signer metadata for crypki-lab.override") end
  '
```

```sh
# Expected result — metadata inspection has not been run
#   ·  Showing service crypki-lab.override...
# {"name":"crypki-lab.override","x509CertSignerKeyId":"default-ca"}
```

## Step 14. Keep a private copy of the baseline configuration

Save the existing Deployment and its ZTS ConfigMap before changing the signer. The following steps prepare a modified configuration and mounts for this same Deployment. Its original ConfigMap stays available, and the saved pod template provides the restoration path. These snapshots can contain sensitive configuration; keep them in the ignored `.state/` directory:

```sh
(
  set -euo pipefail
  umask 077
  mkdir -p components/labs/java-crypki/.state
  mkdir components/labs/java-crypki/.state/manual-deployment
  kubectl --context kind-kind -n athenz get deployment athenz-zts-server -o json \
    > components/labs/java-crypki/.state/manual-deployment/source-deployment.json
  _crypki_conf=$(jq -er '.spec.template.spec.volumes[] | select(.name == "athenz-zts-conf") | .configMap.name' \
    components/labs/java-crypki/.state/manual-deployment/source-deployment.json)
  kubectl --context kind-kind -n athenz get configmap "${_crypki_conf}" -o json \
    > components/labs/java-crypki/.state/manual-deployment/source-configmap.json
  printf 'Saved baseline configuration under .state/manual-deployment\n'
)
```

```sh
# Expected result — configuration capture has not been run
# Saved baseline configuration under .state/manual-deployment
```

Run the read-only [manifest verifier](../../../components/labs/java-crypki/verify-manifests.py). It checks the existing configuration and CA Secret references, the container layout used by the mount patches, and Java options that could override the signer properties. It writes no manifests and makes no Kubernetes requests:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 components/labs/java-crypki/verify-manifests.py \
  components/labs/java-crypki/.state/manual-deployment --baseline-only
```

```sh
# Expected result — the live baseline check has not been run
# PASS: baseline has the expected ZTS mounts, CA Secret references, and no conflicting Java signer options
```

## Step 15. Configure Java Crypki and its default signer

This is the complete [crypki.properties](../../../components/labs/java-crypki/crypki.properties). The first setting selects Java Crypki; the second selects the Java adapter compiled earlier. The KMS settings give it a default signer, algorithm, and CA map. `idthw.crypki.key_dir` tells the adapter where the projected CA files will be mounted:

```properties
athenz.zts.cert_signer_factory_class=com.yahoo.athenz.zts.cert.impl.crypki.JavaCrypkiCertSignerFactory
athenz.zts.java_crypki_factory_class=io.github.mlajkim.idthw.crypki.LocalFileKmsSignerFactory
athenz.crypki.kms.key_id=default-ca
athenz.crypki.kms.signing_algorithm=SHA256withRSA
athenz.crypki.kms.ca_cert_path=/var/run/idthw-crypki/default-ca.crt
athenz.crypki.kms.ca_cert_map_path=/etc/idthw-crypki/ca-map.json
idthw.crypki.key_dir=/var/run/idthw-crypki
athenz.zts.x509_ca_cert_fname=
athenz.zts.x509_ca_cert_keyid_fname=
athenz.zts.certsign_provider_keys_fname=
athenz.zts.resp_x509_signer_certs=true
athenz.zts.svc_cert_signer_key_id_list=default-ca
```

The three empty CA-bundle settings matter: an inherited bundle could make ZTS return the baseline CA even after Crypki signs with a new CA. With `athenz.zts.resp_x509_signer_certs=true`, the response uses the selected Crypki CA.

`athenz.zts.svc_cert_signer_key_id_list=default-ca` limits direct request selections. Domain metadata still selects `special-ca` for `crypki-lab`. This allowlist alone does not bind a CA to a tenant; the three issuance cases below test metadata selection and precedence.

Prepare `idthw-java-crypki-conf` from a copy of the current configuration, appending these properties to `zts.properties`. The existing Deployment will select this ConfigMap; the original ConfigMap remains available for restoration. Java Properties uses the final occurrence of a key, so unrelated settings remain intact. `set -C` makes file creation fail if a previous copy already exists:

```sh
(
  set -euo pipefail
  set -C
  umask 077
  jq --rawfile overrides components/labs/java-crypki/crypki.properties '
    {apiVersion: "v1", kind: "ConfigMap",
     metadata: {name: "idthw-java-crypki-conf", namespace: "athenz"}, data: .data}
    + (if has("binaryData") then {binaryData: .binaryData} else {} end)
    | .data["zts.properties"] += "\n\n# IDTHW local Java Crypki lab\n" + $overrides
  ' components/labs/java-crypki/.state/manual-deployment/source-configmap.json \
    > components/labs/java-crypki/.state/manual-deployment/configmap.json
  printf 'Wrote configmap.json with the Java Crypki settings\n'
)
```

```sh
# Expected result — live configuration preparation has not been run
# Wrote configmap.json with the Java Crypki settings
```

## Step 16. Point the existing ZTS at the Crypki configuration

Change the configuration reference in a local copy of `athenz-zts-server`. Keep its image, selector, pod labels, replica count, rollout strategy, TLS mounts, and health probes. The existing Service will continue selecting these pods at the same address:

```sh
(
  set -euo pipefail
  set -C
  umask 077
  jq '
    (.spec.template.spec.volumes[] | select(.name == "athenz-zts-conf") | .configMap.name)
      = "idthw-java-crypki-conf"
  ' components/labs/java-crypki/.state/manual-deployment/source-deployment.json \
    > components/labs/java-crypki/.state/manual-deployment/deployment-base.json
  printf 'Prepared athenz-zts-server with the Crypki ConfigMap\n'
)
```

```sh
# Expected result — local Deployment preparation has not been run
# Prepared athenz-zts-server with the Crypki ConfigMap
```

## Step 17. Make the compiled adapter and CA map available to ZTS

The JAR contains the Java class ZTS will load. The JSON map connects each logical signer ID to its backend key ID and certificate path. Put these two non-secret files into a ConfigMap:

```sh
kubectl --context kind-kind -n athenz create configmap idthw-java-crypki-code \
  --from-file=idthw-java-crypki-lab.jar=components/labs/java-crypki/target/idthw-java-crypki-lab.jar \
  --from-file=ca-map.json=components/labs/java-crypki/ca-map.json
```

```sh
# Expected result — code ConfigMap creation has not been run
# configmap/idthw-java-crypki-code created
```

Add that volume to the local Deployment document. Mount the JAR inside ZTS's existing classpath and the map at the path used by `crypki.properties`. `subPath` mounts each file separately, preserving the other JARs in the directory. Mode `420` is decimal `0644`; making this Kubernetes default explicit keeps the restoration comparison stable. `--local` changes only the document on disk:

```sh
(
  set -euo pipefail
  set -C
  umask 077
  kubectl --context kind-kind patch --local \
    -f components/labs/java-crypki/.state/manual-deployment/deployment-base.json \
    --type=json --patch '[
      {"op":"add","path":"/spec/template/spec/volumes/-","value":{
        "name":"idthw-java-crypki-code","configMap":{"name":"idthw-java-crypki-code","defaultMode":420}}},
      {"op":"add","path":"/spec/template/spec/containers/0/volumeMounts/-","value":{
        "name":"idthw-java-crypki-code","mountPath":"/opt/athenz/zts/lib/jars/idthw-java-crypki-lab.jar",
        "subPath":"idthw-java-crypki-lab.jar","readOnly":true}},
      {"op":"add","path":"/spec/template/spec/containers/0/volumeMounts/-","value":{
        "name":"idthw-java-crypki-code","mountPath":"/etc/idthw-crypki/ca-map.json",
        "subPath":"ca-map.json","readOnly":true}}
    ]' -o json > components/labs/java-crypki/.state/manual-deployment/deployment-code.json
  printf 'Added the adapter JAR and CA map mounts\n'
)
```

```sh
# Expected result — live Deployment preparation has not been run
# Added the adapter JAR and CA map mounts
```

## Step 18. Mount the existing default CA and the new special CA

Only the new `special-ca` pair needs a new Secret. Copy those two files from `athenz-cli` into a private host directory; the verifier keeps using the original pod files:

```sh
(
  set -euo pipefail
  umask 077
  mkdir -p components/labs/java-crypki/.state
  mkdir components/labs/java-crypki/.state/ca
  kubectl --context kind-kind -n athenz exec deploy/athenz-cli -- \
    tar -C /tmp/idthw-java-crypki-ca -cf - special.key special-ca.crt \
    | tar -xf - -C components/labs/java-crypki/.state/ca
  chmod 600 components/labs/java-crypki/.state/ca/{special.key,special-ca.crt}
  printf 'Saved the special CA pair under .state/ca\n'
)
```

```sh
# Expected result — CA transfer has not been run
# Saved the special CA pair under .state/ca
```

Create the lab Secret with only the special CA's signing key and certificate:

```sh
kubectl --context kind-kind -n athenz create secret generic idthw-java-crypki-ca \
  --from-file=special.key=components/labs/java-crypki/.state/ca/special.key \
  --from-file=special-ca.crt=components/labs/java-crypki/.state/ca/special-ca.crt
```

```sh
# Expected result — CA Secret creation has not been run
# secret/idthw-java-crypki-ca created
```

A projected volume puts selected entries from the existing Secrets and the new Secret into one directory. Its `items` entries give the existing default CA the filenames expected by the adapter, without copying its key into the lab Secret:

| Secret entry | File under `/var/run/idthw-crypki` | Purpose |
|---|---|---|
| `athenz-zts-keys/ca.private.pem` | `default.key` | Existing default CA signing key |
| `athenz-zts-certs/selfsign.ca.cert.pem` | `default-ca.crt` | Existing default CA certificate |
| `idthw-java-crypki-ca/special.key` | `special.key` | New special CA signing key |
| `idthw-java-crypki-ca/special-ca.crt` | `special-ca.crt` | New special CA certificate |

Add that projection to the local Deployment document. The baseline verifier checks these Secret references and paths before this step. JSON uses decimal `292` for mode `0444`, allowing the container's ZTS user to read the mounted files:

```sh
(
  set -euo pipefail
  set -C
  umask 077
  kubectl --context kind-kind patch --local \
    -f components/labs/java-crypki/.state/manual-deployment/deployment-code.json \
    --type=json --patch '[
      {"op":"add","path":"/spec/template/spec/volumes/-","value":{
        "name":"idthw-java-crypki-ca",
        "projected":{"defaultMode":292,"sources":[
          {"secret":{"name":"athenz-zts-keys","items":[
            {"key":"ca.private.pem","path":"default.key"}]}},
          {"secret":{"name":"athenz-zts-certs","items":[
            {"key":"selfsign.ca.cert.pem","path":"default-ca.crt"}]}},
          {"secret":{"name":"idthw-java-crypki-ca","items":[
            {"key":"special.key","path":"special.key"},
            {"key":"special-ca.crt","path":"special-ca.crt"}]}}
        ]}}},
      {"op":"add","path":"/spec/template/spec/containers/0/volumeMounts/-","value":{
        "name":"idthw-java-crypki-ca","mountPath":"/var/run/idthw-crypki","readOnly":true}}
    ]' -o json > components/labs/java-crypki/.state/manual-deployment/deployment.json
  printf 'Prepared the existing default CA and new special CA mounts\n'
)
```

```sh
# Expected result — live Deployment preparation has not been run
# Prepared the existing default CA and new special CA mounts
```

## Step 19. Prepare the update and restoration patches

Only the pod template needs to change. Build a JSON Patch that first checks the Deployment's UID and original pod template, then replaces the template with the prepared version. The checks stop the update if the Deployment was recreated or someone changed its template after the snapshot. Other fields, such as the current replica count, are not submitted:

```sh
(
  set -euo pipefail
  set -C
  umask 077
  jq --slurpfile before components/labs/java-crypki/.state/manual-deployment/source-deployment.json '
    [
      {op: "test", path: "/metadata/uid", value: $before[0].metadata.uid},
      {op: "test", path: "/spec/template", value: $before[0].spec.template},
      {op: "replace", path: "/spec/template", value: .spec.template}
    ]
  ' components/labs/java-crypki/.state/manual-deployment/deployment.json \
    > components/labs/java-crypki/.state/manual-deployment/deployment-patch.json
  printf 'Prepared the existing ZTS update patch\n'
)
```

```sh
# Expected result — patch preparation has not been run
# Prepared the existing ZTS update patch
```

Prepare the reverse patch now. It expects the lab template and restores the original one, including the original ConfigMap reference and mounts. Its guards also protect template changes made after the lab update:

```sh
(
  set -euo pipefail
  set -C
  umask 077
  jq --slurpfile after components/labs/java-crypki/.state/manual-deployment/deployment.json '
    [
      {op: "test", path: "/metadata/uid", value: .metadata.uid},
      {op: "test", path: "/spec/template", value: $after[0].spec.template},
      {op: "replace", path: "/spec/template", value: .spec.template}
    ]
  ' components/labs/java-crypki/.state/manual-deployment/source-deployment.json \
    > components/labs/java-crypki/.state/manual-deployment/restore-patch.json
  printf 'Prepared the original ZTS restoration patch\n'
)
```

```sh
# Expected result — patch preparation has not been run
# Prepared the original ZTS restoration patch
```

## Step 20. Apply the configuration to the existing ZTS

Check the prepared ConfigMap, Deployment document, and both patches. The verifier checks the signer properties and mounts, preservation of the existing Deployment identity and unrelated settings, and the update/restoration guards:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 components/labs/java-crypki/verify-manifests.py \
  components/labs/java-crypki/.state/manual-deployment
```

```sh
# Expected result — verification against live configuration has not been run
# PASS: baseline has the expected ZTS mounts, CA Secret references, and no conflicting Java signer options
# PASS: configmap.json matches the existing-ZTS walkthrough
# PASS: deployment.json matches the existing-ZTS walkthrough
# PASS: deployment-patch.json matches the existing-ZTS walkthrough
# PASS: restore-patch.json matches the existing-ZTS walkthrough
```

Create the prepared ConfigMap, then patch `athenz-zts-server`. Changing its pod template starts a rollout, so the replacement pods load the factory and CA map. `kubectl create` stops if that ConfigMap name is already in use:

```sh
kubectl --context kind-kind -n athenz create \
  -f components/labs/java-crypki/.state/manual-deployment/configmap.json &&
kubectl --context kind-kind -n athenz patch deployment athenz-zts-server --type=json \
  --patch-file components/labs/java-crypki/.state/manual-deployment/deployment-patch.json &&
kubectl --context kind-kind -n athenz rollout status deployment/athenz-zts-server --timeout=180s
```

```sh
# Expected result — deployment update has not been run; changing rollout progress omitted
# configmap/idthw-java-crypki-conf created
# deployment.apps/athenz-zts-server patched
# deployment "athenz-zts-server" successfully rolled out
```

The existing Service continues serving `https://athenz-zts-server.athenz:4443`. The following requests use that address directly. Services with no service/domain signer selection use the same default CA key and certificate as before; `crypki-lab.api` selects the new special CA.

If the rollout fails, stop here and use the [restoration step](#clean-up-1-restore-the-original-zts-signer). A failed JSON Patch test means the saved template no longer matches; review the change before rebuilding a patch.

## Step 21. Prepare the certificate verifier

The repeated certificate assertions use [verify-certificate.sh](../../../components/labs/java-crypki/verify-certificate.sh). It accepts an existing response directory, service name, and expected CA, and checks the CN, returned CA fingerprint, trust under the intended and returned CAs, and rejection by the other CA. It does not create keys, request tokens, issue certificates, or deploy anything.

Its complete source is shown here; this is a file listing, not a command to paste into the host shell:

```shell
#!/bin/sh
# Operator-run inside athenz-cli: verify an existing response; never request an identity.
set -eu

_crypki_verifier_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "${_crypki_verifier_dir}/color.sh"
[ "$#" -eq 3 ] || fatal "Usage: $0 <response-directory> <domain.service> <expected-ca>"
_crypki_run=$1
_crypki_name=$2
_crypki_expected=$3
case "${_crypki_name}/${_crypki_expected}" in
  crypki-lab.default.api/default-ca|crypki-lab.override/default-ca) _crypki_wrong=special-ca ;;
  crypki-lab.api/special-ca) _crypki_wrong=default-ca ;;
  *) fatal "Use one of the three service/CA combinations in the research guide" ;;
esac
cd "${_crypki_run}"

_crypki_cn=$(openssl x509 -in service.crt -noout -subject -nameopt RFC2253 \
  | sed 's/^subject=//' | tr ',' '\n' | sed -n 's/^CN=//p')
[ "${_crypki_cn}" = "${_crypki_name}" ] || fatal "Issued certificate CN does not match ${_crypki_name}"
openssl x509 -in service.crt -noout -subject -issuer -fingerprint -sha256
_crypki_expected_fp=$(openssl x509 -in "/tmp/idthw-java-crypki-ca/${_crypki_expected}.crt" \
  -noout -fingerprint -sha256)
_crypki_wrong_fp=$(openssl x509 -in "/tmp/idthw-java-crypki-ca/${_crypki_wrong}.crt" \
  -noout -fingerprint -sha256)
_crypki_returned_fp=$(openssl x509 -in returned-ca.crt -noout -fingerprint -sha256)
[ "${_crypki_expected_fp}" != "${_crypki_wrong_fp}" ] || fatal "The two lab CAs are identical"
[ "$(grep -c '^-----BEGIN CERTIFICATE-----$' returned-ca.crt)" -eq 1 ] \
  || fatal "Expected exactly one returned CA certificate"
[ "${_crypki_expected_fp}" = "${_crypki_returned_fp}" ] \
  || fatal "ZTS returned a different CA; check global/provider CA-bundle overrides on athenz-zts-server"
ok "Returned CA fingerprint matches ${_crypki_expected}"

info "Verifying with ${_crypki_expected} as the only trusted CA..."
openssl verify -no-CApath -no-CAstore \
  -CAfile "/tmp/idthw-java-crypki-ca/${_crypki_expected}.crt" service.crt
openssl verify -no-CApath -no-CAstore -CAfile returned-ca.crt service.crt

info "Verifying that ${_crypki_wrong} rejects this certificate..."
_crypki_verify_status=0
openssl verify -no-CApath -no-CAstore \
  -CAfile "/tmp/idthw-java-crypki-ca/${_crypki_wrong}.crt" service.crt \
  > wrong-ca.log 2>&1 || _crypki_verify_status=$?
cat wrong-ca.log
if [ "${_crypki_verify_status}" -ne 2 ] \
  || ! grep -q '^error 20 at 0 depth lookup: unable to get local issuer certificate$' wrong-ca.log; then
  fatal "Expected OpenSSL error 20 with exit status 2; a different failure does not pass this test"
fi
ok "PASS: ${_crypki_name} -> ${_crypki_expected}; returned CA matches; ${_crypki_wrong} rejected (error 20)"
info "Private request/response files remain in athenz-cli: $(pwd)"
```

Copy the verifier and the shared status-output functions into a fresh directory in `athenz-cli`. The CA references are the existing default certificate copied into the CLI pod and the new special certificate created there:

```sh
(
  set -euo pipefail
  tar --no-xattrs -cf - -C components/labs/java-crypki verify-certificate.sh -C ../../../tools color.sh \
    | kubectl --context kind-kind -n athenz exec -i deploy/athenz-cli -- sh -eu -c '
      umask 077
      mkdir /tmp/idthw-crypki-verifier
      tar -xf - -C /tmp/idthw-crypki-verifier
      printf "Installed certificate verification code\n"
    '
)
```

```sh
# Expected result — verifier installation has not been run
# Installed certificate verification code
```

## Step 22. Issue with the default CA

Issue for `crypki-lab.default.api`, whose subdomain and service signer settings are both unset. The result must match the existing default CA, even though the parent `crypki-lab` selects `special-ca`. The full sequence creates the private key and CSR, obtains an instance-registration token, posts the CSR and attestation to the existing ZTS, and saves the returned certificates. The final line runs only the certificate assertions.

CSR creation and requests run in the same CLI pod so the `sys.auth.zts` provider can match the IP SAN to the caller IP. Each block below defines all of its variables and obtains its own one-use token. No hostname extension or DNS resolver setup is required:

```sh
kubectl --context kind-kind -n athenz exec -i deploy/athenz-cli -- sh -eu <<'SH'
umask 077
_crypki_domain=crypki-lab.default
_crypki_service=api
_crypki_expected=default-ca
_crypki_run=$(mktemp -d /tmp/idthw-java-crypki.XXXXXX)
_crypki_instance="crypki-$(date -u +%Y%m%d%H%M%S)-$$"
_crypki_ip=$(hostname -i | awk '{print $1}')
printf '%s\n' "${_crypki_ip}" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' \
  || { printf 'An IPv4 CLI pod address is required\n' >&2; exit 1; }
cd "${_crypki_run}"

# Create the service key, then put its public key and identity in a CSR.
openssl genrsa -traditional -out service.key 2048
zts-svccert -csr -private-key service.key \
  -domain "${_crypki_domain}" -service "${_crypki_service}" \
  -provider sys.auth.zts -instance "${_crypki_instance}" \
  -ip "${_crypki_ip}" -dns-domain zts.athenz.cloud > request.csr

# Send requests directly to the existing ZTS Service.
set -- --silent --show-error --noproxy '*' --connect-timeout 10 --max-time 45 \
  --cacert /etc/ssl/certs/ca-certificates.crt \
  --header 'Content-Type: application/json'
# Authenticate as the lab admin to obtain this instance's registration token.
_crypki_status=$(curl "$@" --request GET \
  --cert /var/run/athenz/athenz_admin.cert.pem --key /var/run/athenz/athenz_admin.private.pem \
  --output registration-token.json --write-out '%{http_code}' \
  "https://athenz-zts-server.athenz:4443/zts/v1/instance/sys.auth.zts/${_crypki_domain}/${_crypki_service}/${_crypki_instance}/token")
printf 'ZTS GET instance token -> HTTP %s\n' "${_crypki_status}"
if [ "${_crypki_status}" != 200 ]; then
  jq '{code, message}' registration-token.json
  exit 1
fi
jq -e --arg domain "${_crypki_domain}" --arg service "${_crypki_service}" \
  '.provider == "sys.auth.zts" and .domain == $domain and .service == $service
   and (.attestationData | type == "string" and length > 0)' registration-token.json >/dev/null \
  || { printf 'Unexpected registration-token response\n' >&2; exit 1; }

# Submit the CSR and attestation; ZTS chooses the signer from metadata.
jq -n --arg domain "${_crypki_domain}" --arg service "${_crypki_service}" \
  --rawfile csr request.csr --slurpfile token registration-token.json \
  '{provider: "sys.auth.zts", domain: $domain, service: $service,
    attestationData: $token[0].attestationData, csr: $csr, expiryTime: 30}' > registration-request.json
_crypki_status=$(curl "$@" --request POST --data-binary @registration-request.json \
  --output identity.json --write-out '%{http_code}' \
  https://athenz-zts-server.athenz:4443/zts/v1/instance)
printf 'ZTS POST instance -> HTTP %s\n' "${_crypki_status}"
if [ "${_crypki_status}" != 201 ]; then
  jq '{code, message}' identity.json
  exit 1
fi
jq -e --arg name "${_crypki_domain}.${_crypki_service}" \
  '.name == $name and (.x509Certificate | type == "string" and length > 0)
   and (.x509CertificateSigner | type == "string" and length > 0)' identity.json >/dev/null \
  || { printf 'Missing certificate/signer or unexpected service identity\n' >&2; exit 1; }
jq -r '.x509Certificate' identity.json > service.crt
jq -r '.x509CertificateSigner' identity.json > returned-ca.crt

# Check the issued identity and both the accepted and rejected trust chains.
sh /tmp/idthw-crypki-verifier/verify-certificate.sh \
  "${_crypki_run}" "${_crypki_domain}.${_crypki_service}" "${_crypki_expected}"
SH
```

```sh
# Expected result — live issuance is pending; generated metadata and private paths omitted
# ZTS GET instance token -> HTTP 200
# ZTS POST instance -> HTTP 201
#   ✔  Returned CA fingerprint matches default-ca
#   ·  Verifying with default-ca as the only trusted CA...
# service.crt: OK
# service.crt: OK
#   ·  Verifying that special-ca rejects this certificate...
# error 20 at 0 depth lookup: unable to get local issuer certificate
# error service.crt: verification failed
#   ✔  PASS: crypki-lab.default.api -> default-ca; returned CA matches; special-ca rejected (error 20)
```

The verifier prints subject/issuer/fingerprint metadata and complete OpenSSL diagnostics. Generated values and private directory names vary and are omitted from the expected output. Keys, tokens, CSRs, and certificate PEMs stay in private files. The negative assertion requires both OpenSSL error 20 and exit status 2; a different failure does not pass. `-no-CApath -no-CAstore` excludes additional system trust.

## Step 23. Issue with the domain CA

Repeat the complete request for `crypki-lab.api`. Its service signer is unset, so it must inherit `special-ca` from the domain. The request still omits `x509CertSignerKeyId`:

```sh
kubectl --context kind-kind -n athenz exec -i deploy/athenz-cli -- sh -eu <<'SH'
umask 077
_crypki_domain=crypki-lab
_crypki_service=api
_crypki_expected=special-ca
_crypki_run=$(mktemp -d /tmp/idthw-java-crypki.XXXXXX)
_crypki_instance="crypki-$(date -u +%Y%m%d%H%M%S)-$$"
_crypki_ip=$(hostname -i | awk '{print $1}')
printf '%s\n' "${_crypki_ip}" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' \
  || { printf 'An IPv4 CLI pod address is required\n' >&2; exit 1; }
cd "${_crypki_run}"

# Create the service key, then put its public key and identity in a CSR.
openssl genrsa -traditional -out service.key 2048
zts-svccert -csr -private-key service.key \
  -domain "${_crypki_domain}" -service "${_crypki_service}" \
  -provider sys.auth.zts -instance "${_crypki_instance}" \
  -ip "${_crypki_ip}" -dns-domain zts.athenz.cloud > request.csr

# Send requests directly to the existing ZTS Service.
set -- --silent --show-error --noproxy '*' --connect-timeout 10 --max-time 45 \
  --cacert /etc/ssl/certs/ca-certificates.crt \
  --header 'Content-Type: application/json'
# Authenticate as the lab admin to obtain this instance's registration token.
_crypki_status=$(curl "$@" --request GET \
  --cert /var/run/athenz/athenz_admin.cert.pem --key /var/run/athenz/athenz_admin.private.pem \
  --output registration-token.json --write-out '%{http_code}' \
  "https://athenz-zts-server.athenz:4443/zts/v1/instance/sys.auth.zts/${_crypki_domain}/${_crypki_service}/${_crypki_instance}/token")
printf 'ZTS GET instance token -> HTTP %s\n' "${_crypki_status}"
if [ "${_crypki_status}" != 200 ]; then
  jq '{code, message}' registration-token.json
  exit 1
fi
jq -e --arg domain "${_crypki_domain}" --arg service "${_crypki_service}" \
  '.provider == "sys.auth.zts" and .domain == $domain and .service == $service
   and (.attestationData | type == "string" and length > 0)' registration-token.json >/dev/null \
  || { printf 'Unexpected registration-token response\n' >&2; exit 1; }

# Submit the CSR and attestation; ZTS chooses the signer from metadata.
jq -n --arg domain "${_crypki_domain}" --arg service "${_crypki_service}" \
  --rawfile csr request.csr --slurpfile token registration-token.json \
  '{provider: "sys.auth.zts", domain: $domain, service: $service,
    attestationData: $token[0].attestationData, csr: $csr, expiryTime: 30}' > registration-request.json
_crypki_status=$(curl "$@" --request POST --data-binary @registration-request.json \
  --output identity.json --write-out '%{http_code}' \
  https://athenz-zts-server.athenz:4443/zts/v1/instance)
printf 'ZTS POST instance -> HTTP %s\n' "${_crypki_status}"
if [ "${_crypki_status}" != 201 ]; then
  jq '{code, message}' identity.json
  exit 1
fi
jq -e --arg name "${_crypki_domain}.${_crypki_service}" \
  '.name == $name and (.x509Certificate | type == "string" and length > 0)
   and (.x509CertificateSigner | type == "string" and length > 0)' identity.json >/dev/null \
  || { printf 'Missing certificate/signer or unexpected service identity\n' >&2; exit 1; }
jq -r '.x509Certificate' identity.json > service.crt
jq -r '.x509CertificateSigner' identity.json > returned-ca.crt

# Check the issued identity and both the accepted and rejected trust chains.
sh /tmp/idthw-crypki-verifier/verify-certificate.sh \
  "${_crypki_run}" "${_crypki_domain}.${_crypki_service}" "${_crypki_expected}"
SH
```

```sh
# Expected result — live issuance is pending; generated metadata and private paths omitted
# ZTS GET instance token -> HTTP 200
# ZTS POST instance -> HTTP 201
#   ✔  Returned CA fingerprint matches special-ca
#   ·  Verifying with special-ca as the only trusted CA...
# service.crt: OK
# service.crt: OK
#   ·  Verifying that default-ca rejects this certificate...
# error 20 at 0 depth lookup: unable to get local issuer certificate
# error service.crt: verification failed
#   ✔  PASS: crypki-lab.api -> special-ca; returned CA matches; default-ca rejected (error 20)
```

## Step 24. Issue with the service override

Issue for `crypki-lab.override`. The domain still selects `special-ca`, but this service selects `default-ca`. Only the service metadata changes the selection; the request has the same shape as the other two cases:

```sh
kubectl --context kind-kind -n athenz exec -i deploy/athenz-cli -- sh -eu <<'SH'
umask 077
_crypki_domain=crypki-lab
_crypki_service=override
_crypki_expected=default-ca
_crypki_run=$(mktemp -d /tmp/idthw-java-crypki.XXXXXX)
_crypki_instance="crypki-$(date -u +%Y%m%d%H%M%S)-$$"
_crypki_ip=$(hostname -i | awk '{print $1}')
printf '%s\n' "${_crypki_ip}" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' \
  || { printf 'An IPv4 CLI pod address is required\n' >&2; exit 1; }
cd "${_crypki_run}"

# Create the service key, then put its public key and identity in a CSR.
openssl genrsa -traditional -out service.key 2048
zts-svccert -csr -private-key service.key \
  -domain "${_crypki_domain}" -service "${_crypki_service}" \
  -provider sys.auth.zts -instance "${_crypki_instance}" \
  -ip "${_crypki_ip}" -dns-domain zts.athenz.cloud > request.csr

# Send requests directly to the existing ZTS Service.
set -- --silent --show-error --noproxy '*' --connect-timeout 10 --max-time 45 \
  --cacert /etc/ssl/certs/ca-certificates.crt \
  --header 'Content-Type: application/json'
# Authenticate as the lab admin to obtain this instance's registration token.
_crypki_status=$(curl "$@" --request GET \
  --cert /var/run/athenz/athenz_admin.cert.pem --key /var/run/athenz/athenz_admin.private.pem \
  --output registration-token.json --write-out '%{http_code}' \
  "https://athenz-zts-server.athenz:4443/zts/v1/instance/sys.auth.zts/${_crypki_domain}/${_crypki_service}/${_crypki_instance}/token")
printf 'ZTS GET instance token -> HTTP %s\n' "${_crypki_status}"
if [ "${_crypki_status}" != 200 ]; then
  jq '{code, message}' registration-token.json
  exit 1
fi
jq -e --arg domain "${_crypki_domain}" --arg service "${_crypki_service}" \
  '.provider == "sys.auth.zts" and .domain == $domain and .service == $service
   and (.attestationData | type == "string" and length > 0)' registration-token.json >/dev/null \
  || { printf 'Unexpected registration-token response\n' >&2; exit 1; }

# Submit the CSR and attestation; ZTS chooses the signer from metadata.
jq -n --arg domain "${_crypki_domain}" --arg service "${_crypki_service}" \
  --rawfile csr request.csr --slurpfile token registration-token.json \
  '{provider: "sys.auth.zts", domain: $domain, service: $service,
    attestationData: $token[0].attestationData, csr: $csr, expiryTime: 30}' > registration-request.json
_crypki_status=$(curl "$@" --request POST --data-binary @registration-request.json \
  --output identity.json --write-out '%{http_code}' \
  https://athenz-zts-server.athenz:4443/zts/v1/instance)
printf 'ZTS POST instance -> HTTP %s\n' "${_crypki_status}"
if [ "${_crypki_status}" != 201 ]; then
  jq '{code, message}' identity.json
  exit 1
fi
jq -e --arg name "${_crypki_domain}.${_crypki_service}" \
  '.name == $name and (.x509Certificate | type == "string" and length > 0)
   and (.x509CertificateSigner | type == "string" and length > 0)' identity.json >/dev/null \
  || { printf 'Missing certificate/signer or unexpected service identity\n' >&2; exit 1; }
jq -r '.x509Certificate' identity.json > service.crt
jq -r '.x509CertificateSigner' identity.json > returned-ca.crt

# Check the issued identity and both the accepted and rejected trust chains.
sh /tmp/idthw-crypki-verifier/verify-certificate.sh \
  "${_crypki_run}" "${_crypki_domain}.${_crypki_service}" "${_crypki_expected}"
SH
```

```sh
# Expected result — live issuance is pending; generated metadata and private paths omitted
# ZTS GET instance token -> HTTP 200
# ZTS POST instance -> HTTP 201
#   ✔  Returned CA fingerprint matches default-ca
#   ·  Verifying with default-ca as the only trusted CA...
# service.crt: OK
# service.crt: OK
#   ·  Verifying that special-ca rejects this certificate...
# error 20 at 0 depth lookup: unable to get local issuer certificate
# error service.crt: verification failed
#   ✔  PASS: crypki-lab.override -> default-ca; returned CA matches; special-ca rejected (error 20)
```

All three PASS results are required to claim that the issuance matrix passed. Save only status lines and decoded metadata in the verification record. Each request asks for a 30-minute certificate and creates fresh private files in the CLI pod. Crypki/ZTS cache CA certificates, so replacing a CA file requires restarting `athenz-zts-server` before another comparison.

## Clean-up 1. Restore the original ZTS signer

When finished, apply the reverse patch prepared in Step 19. This rolls the existing Deployment back to its saved pod template, which selects the original ConfigMap and signer. The original configuration and CA Secrets were retained throughout the exercise:

```sh
kubectl --context kind-kind -n athenz patch deployment athenz-zts-server --type=json \
  --patch-file components/labs/java-crypki/.state/manual-deployment/restore-patch.json &&
kubectl --context kind-kind -n athenz rollout status deployment/athenz-zts-server --timeout=180s
```

```sh
# Expected result — restoration has not been run; changing rollout progress omitted
# deployment.apps/athenz-zts-server patched
# deployment "athenz-zts-server" successfully rolled out
```

ZTS keeps running at the same Service address. The restored signer uses the existing CA for issuance; the special-CA selection exercise ends here. The lab ConfigMaps, special-CA Secret, domains, policies, and private files remain available for inspection. If the guard rejects the patch because the pod template changed since Step 20, review those later changes before restoring.

Files under `/tmp` in `athenz-cli` are lost if that pod is replaced. The host `.state/ca/` retains the special CA pair, and the default CA remains in the original Kubernetes Secrets.

# Reference

- [Athenz #3468 — Java Crypki](https://github.com/AthenZ/athenz/pull/3468)
- [Athenz #3498 — Per-key CA certificate mapping](https://github.com/AthenZ/athenz/pull/3498)
- [ZTS service-over-domain signer selection](https://github.com/AthenZ/athenz/blob/v1.12.48/servers/zts/src/main/java/com/yahoo/athenz/zts/ZTSImpl.java#L5625)
- [Existing single-CA KeyStoreCertSigner](https://github.com/AthenZ/athenz/blob/v1.12.48/servers/zts/src/main/java/com/yahoo/athenz/zts/cert/impl/KeyStoreCertSigner.java)
- [Java Crypki factory loading](https://github.com/AthenZ/athenz/blob/v1.12.48/servers/zts/src/main/java/com/yahoo/athenz/zts/cert/impl/crypki/JavaCrypkiCertSignerFactory.java)
- [KmsCaCertificateStore](https://github.com/AthenZ/athenz/blob/v1.12.48/libs/java/crypki/src/main/java/com/yahoo/athenz/crypki/kms/KmsCaCertificateStore.java)
- [KmsCrypkiSigner](https://github.com/AthenZ/athenz/blob/v1.12.48/libs/java/crypki/src/main/java/com/yahoo/athenz/crypki/kms/KmsCrypkiSigner.java)
- [ZTS returned CA-bundle selection](https://github.com/AthenZ/athenz/blob/v1.12.48/servers/zts/src/main/java/com/yahoo/athenz/zts/cert/InstanceCertManager.java#L819)
- [ZMS domain endpoints and status codes](https://github.com/AthenZ/athenz/blob/v1.12.48/core/zms/src/main/rdl/Domain.rdli)
- [ZMS service and system-metadata endpoints](https://github.com/AthenZ/athenz/blob/v1.12.48/core/zms/src/main/rdl/ServiceIdentity.rdli)
- [ZMS role endpoints](https://github.com/AthenZ/athenz/blob/v1.12.48/core/zms/src/main/rdl/Role.rdli)
- [ZMS policy endpoints](https://github.com/AthenZ/athenz/blob/v1.12.48/core/zms/src/main/rdl/Policy.rdli)
- [ZMS system metadata attribute](https://github.com/AthenZ/athenz/blob/v1.12.48/servers/zms/src/main/java/com/yahoo/athenz/zms/ZMSConsts.java#L228)
- [ZMS subdomain signer-metadata copy at creation](https://github.com/AthenZ/athenz/blob/v1.12.48/servers/zms/src/main/java/com/yahoo/athenz/zms/ZMSImpl.java#L2215)
- [ZMS domain signer-metadata reset](https://github.com/AthenZ/athenz/blob/v1.12.48/servers/zms/src/main/java/com/yahoo/athenz/zms/DBService.java#L5026)
