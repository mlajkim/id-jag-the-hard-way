#!/usr/bin/env python3
"""Expected manifests for the existing-ZTS walkthrough's verifier; no cluster operations."""

import copy

ZTS_NAME = "athenz-zts-server"
CONF_NAME = "idthw-java-crypki-conf"
CODE_NAME = "idthw-java-crypki-code"
CA_NAME = "idthw-java-crypki-ca"
PROPERTIES = {
    "athenz.zts.cert_signer_factory_class": "com.yahoo.athenz.zts.cert.impl.crypki.JavaCrypkiCertSignerFactory",
    "athenz.zts.java_crypki_factory_class": "io.github.mlajkim.idthw.crypki.LocalFileKmsSignerFactory",
    "athenz.crypki.kms.key_id": "default-ca",
    "athenz.crypki.kms.signing_algorithm": "SHA256withRSA",
    "athenz.crypki.kms.ca_cert_path": "/var/run/idthw-crypki/default-ca.crt",
    "athenz.crypki.kms.ca_cert_map_path": "/etc/idthw-crypki/ca-map.json",
    "idthw.crypki.key_dir": "/var/run/idthw-crypki",
    "athenz.zts.x509_ca_cert_fname": "",
    "athenz.zts.x509_ca_cert_keyid_fname": "",
    "athenz.zts.certsign_provider_keys_fname": "",
    "athenz.zts.resp_x509_signer_certs": "true",
    "athenz.zts.svc_cert_signer_key_id_list": "default-ca",
}


def render(deployment, configmap):
    if deployment.get("metadata", {}).get("name") != ZTS_NAME:
        raise ValueError("Expected the baseline athenz-zts-server deployment")
    if not deployment["metadata"].get("uid"):
        raise ValueError("The baseline snapshot must include the Deployment UID")
    for resource in (deployment, configmap):
        if resource.get("metadata", {}).get("namespace", "athenz") != "athenz":
            raise ValueError("This lab supports the local athenz namespace only")

    updated = copy.deepcopy(deployment)
    spec = updated["spec"]
    pod = spec["template"]["spec"]
    containers = pod["containers"]
    if len(containers) != 1 or containers[0]["name"] != "athenz-zts-server":
        raise ValueError("Expected one athenz-zts-server container for the walkthrough's mount patches")
    volumes = pod.get("volumes", [])
    container = containers[0]
    if container.get("envFrom"):
        raise ValueError("Review envFrom for signer overrides before using this lab")
    option_names = {"JAVA_OPTS", "JAVA_TOOL_OPTIONS", "JDK_JAVA_OPTIONS", "_JAVA_OPTIONS"}
    options = list(container.get("command", [])) + list(container.get("args", []))
    for entry in container.get("env", []):
        if entry["name"] in option_names:
            if "valueFrom" in entry:
                raise ValueError("Review indirect Java options before using this lab")
            options.append(entry.get("value", ""))
    if any("-D" + key in option for option in options for key in PROPERTIES):
        raise ValueError("Java options already override a lab signer property; review the source deployment")

    conf_volumes = [v for v in volumes if v["name"] == "athenz-zts-conf"]
    if len(conf_volumes) != 1 or conf_volumes[0].get("configMap", {}).get("name") != configmap["metadata"]["name"]:
        raise ValueError("The source ConfigMap must match the athenz-zts-conf volume")
    if configmap["metadata"]["name"] == CONF_NAME:
        raise ValueError("The baseline already selects the lab ConfigMap; preserve the original snapshot")
    mounts = container.setdefault("volumeMounts", [])
    if not any(m.get("name") == "athenz-zts-conf" and m.get("mountPath") == "/opt/athenz/zts/conf/zts_server" for m in mounts):
        raise ValueError("Expected the baseline ZTS configuration directory mount")
    if any(v["name"] in {CODE_NAME, CA_NAME} for v in volumes):
        raise ValueError("Lab volumes already exist in the source deployment")
    lab_paths = {"/opt/athenz/zts/lib/jars/idthw-java-crypki-lab.jar", "/etc/idthw-crypki/ca-map.json",
                 "/var/run/idthw-crypki"}
    if any(m.get("mountPath") in lab_paths for m in mounts):
        raise ValueError("A lab mount path is already in use; preserve the existing configuration")
    if not any(p.get("name") == "https" and p.get("containerPort") == 4443 for p in container.get("ports", [])):
        raise ValueError("Expected the baseline https port 4443")

    # Reuse the default CA by referencing the existing Secrets, without copying their contents.
    for name, filename, mount_path in (
        ("athenz-zts-keys", "ca.private.pem", "/opt/athenz/zts/var/keys"),
        ("athenz-zts-certs", "selfsign.ca.cert.pem", "/opt/athenz/zts/var/certs"),
    ):
        volume = next((v for v in volumes if v["name"] == name), {})
        secret = volume.get("secret", {})
        if secret.get("secretName") != name or not any(
            item.get("key") == filename and item.get("path") == filename for item in secret.get("items", [])
        ):
            raise ValueError("Expected the baseline CA Secret reference and file mapping for " + name)
        if not any(m.get("name") == name and m.get("mountPath") == mount_path for m in mounts):
            raise ValueError("Expected the baseline CA volume mount for " + name)

    # Change only the configuration reference and mounts on the existing pod template.
    conf_volumes[0]["configMap"]["name"] = CONF_NAME
    volumes.extend([
        {"name": CODE_NAME, "configMap": {"name": CODE_NAME, "defaultMode": 0o644}},
        {"name": CA_NAME, "projected": {"defaultMode": 0o444, "sources": [
            {"secret": {"name": "athenz-zts-keys", "items": [
                {"key": "ca.private.pem", "path": "default.key"}]}},
            {"secret": {"name": "athenz-zts-certs", "items": [
                {"key": "selfsign.ca.cert.pem", "path": "default-ca.crt"}]}},
            {"secret": {"name": CA_NAME, "items": [
                {"key": "special.key", "path": "special.key"},
                {"key": "special-ca.crt", "path": "special-ca.crt"}]}},
        ]}},
    ])
    mounts.extend([
        {"name": CODE_NAME, "mountPath": "/opt/athenz/zts/lib/jars/idthw-java-crypki-lab.jar",
         "subPath": "idthw-java-crypki-lab.jar", "readOnly": True},
        {"name": CODE_NAME, "mountPath": "/etc/idthw-crypki/ca-map.json",
         "subPath": "ca-map.json", "readOnly": True},
        {"name": CA_NAME, "mountPath": "/var/run/idthw-crypki", "readOnly": True},
    ])
    data = copy.deepcopy(configmap.get("data", {}))
    if not isinstance(data.get("zts.properties"), str):
        raise ValueError("The source ConfigMap must contain zts.properties")
    # Java Properties uses the final occurrence of a key. Preserve unrelated source settings.
    data["zts.properties"] += "\n\n# IDTHW local Java Crypki lab\n" + "".join(
        f"{key}={value}\n" for key, value in PROPERTIES.items()
    )
    conf = {"apiVersion": "v1", "kind": "ConfigMap",
            "metadata": {"name": CONF_NAME, "namespace": "athenz"}, "data": data}
    if "binaryData" in configmap:
        conf["binaryData"] = copy.deepcopy(configmap["binaryData"])
    return {"apiVersion": "v1", "kind": "List", "items": [conf, updated]}


def template_patch(baseline, before, after):
    """Guard against replacement/concurrent edits, then change only the pod template."""
    return copy.deepcopy([
        {"op": "test", "path": "/metadata/uid", "value": baseline["metadata"]["uid"]},
        {"op": "test", "path": "/spec/template", "value": before["spec"]["template"]},
        {"op": "replace", "path": "/spec/template", "value": after["spec"]["template"]},
    ])


if __name__ == "__main__":
    # The old deploy.sh called this module to create a separate ZTS. Stop that path
    # before it can create resources; current setup commands live in the guide.
    raise SystemExit("Use the Java Crypki research guide to update the existing ZTS; this module is verification-only")
