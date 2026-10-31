"""Synthetic manifests only: no cluster, credential files, or live ConfigMaps."""

import copy
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

module_spec = importlib.util.spec_from_file_location("render_lab", Path(__file__).with_name("render-lab.py"))
lab = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(lab)
verifier_spec = importlib.util.spec_from_file_location("verify_manifests", Path(__file__).with_name("verify-manifests.py"))
verifier = importlib.util.module_from_spec(verifier_spec)
verifier_spec.loader.exec_module(verifier)


class RenderLabTest(unittest.TestCase):
    def setUp(self):
        self.deployment = {
            "apiVersion": "apps/v1", "kind": "Deployment",
            "metadata": {"name": "athenz-zts-server", "namespace": "athenz", "uid": "synthetic-zts-uid",
                         "resourceVersion": "100", "labels": {"app": "original"}},
            "spec": {
                "replicas": 2,
                "strategy": {"type": "RollingUpdate", "rollingUpdate": {"maxSurge": 1, "maxUnavailable": 0}},
                "selector": {"matchLabels": {"app": "original"}},
                "template": {
                    "metadata": {"labels": {"app": "original", "keep": "this"},
                                 "annotations": {"example.org/config": "retain-this"}},
                    "spec": {
                        "serviceAccountName": "original-zts",
                        "initContainers": [{"name": "original-init", "image": "example/init:test"}],
                        "containers": [{"name": "athenz-zts-server", "image": "example/zts:test",
                                        "ports": [{"name": "https", "containerPort": 4443}],
                                        "env": [{"name": "JAVA_OPTS", "value": "-Xmx512m"}],
                                        "readinessProbe": {"tcpSocket": {"port": "https"}},
                                        "volumeMounts": [
                                            {"name": "athenz-zts-conf", "mountPath": "/opt/athenz/zts/conf/zts_server"},
                                            {"name": "athenz-zts-keys", "mountPath": "/opt/athenz/zts/var/keys"},
                                            {"name": "athenz-zts-certs", "mountPath": "/opt/athenz/zts/var/certs"},
                                        ]}],
                        "volumes": [
                            {"name": "athenz-zts-conf", "configMap": {"name": "source-conf"}},
                            {"name": "athenz-zts-keys", "secret": {"secretName": "athenz-zts-keys", "items": [
                                {"key": "ca.private.pem", "path": "ca.private.pem"}]}},
                            {"name": "athenz-zts-certs", "secret": {"secretName": "athenz-zts-certs", "items": [
                                {"key": "selfsign.ca.cert.pem", "path": "selfsign.ca.cert.pem"}]}},
                        ],
                    },
                },
            },
        }
        self.configmap = {"apiVersion": "v1", "kind": "ConfigMap",
                          "metadata": {"name": "source-conf", "namespace": "athenz"}, "data": {
            "zts.properties": "athenz.zts.cert_signer_factory_class=example.OldFactory\nathenz.zts.x509_ca_cert_fname=/example/old-ca\n",
            "other.setting": "retain-this",
        }, "binaryData": {"synthetic-note": "bm90LWEtdG9rZW4="}}

    def test_existing_deployment_and_service_routing_are_preserved(self):
        original = copy.deepcopy((self.deployment, self.configmap))
        conf, deployment = lab.render(self.deployment, self.configmap)["items"]
        self.assertEqual(original, (self.deployment, self.configmap))
        self.assertEqual(self.deployment["metadata"], deployment["metadata"])
        self.assertEqual(self.deployment["spec"]["selector"], deployment["spec"]["selector"])
        self.assertEqual(self.deployment["spec"]["template"]["metadata"], deployment["spec"]["template"]["metadata"])

        # Reversing only the intended reference/mount changes must recover every
        # original field, including TLS mounts, image, probes, replicas and strategy.
        pod = deployment["spec"]["template"]["spec"]
        self.assertEqual(conf["metadata"]["name"], pod["volumes"][0]["configMap"]["name"])
        pod["volumes"][0]["configMap"]["name"] = "source-conf"
        pod["volumes"] = [v for v in pod["volumes"] if v["name"] not in {lab.CODE_NAME, lab.CA_NAME}]
        mounts = pod["containers"][0]["volumeMounts"]
        pod["containers"][0]["volumeMounts"] = [m for m in mounts if m["name"] not in {lab.CODE_NAME, lab.CA_NAME}]
        self.assertEqual(self.deployment, deployment)
        self.assertEqual("retain-this", conf["data"]["other.setting"])
        self.assertEqual(self.configmap["binaryData"], conf["binaryData"])
        self.assertTrue(conf["data"]["zts.properties"].startswith(self.configmap["data"]["zts.properties"]))
        properties = dict(line.split("=", 1) for line in conf["data"]["zts.properties"].splitlines() if "=" in line)
        self.assertEqual(lab.PROPERTIES, properties)

    def test_existing_storage_and_network_settings_are_retained(self):
        pod = self.deployment["spec"]["template"]["spec"]
        pod["volumes"].extend([
            {"name": "storage", "persistentVolumeClaim": {"claimName": "existing"}},
            {"name": "host-files", "hostPath": {"path": "/example"}},
        ])
        pod["hostNetwork"] = True
        pod["containers"][0]["ports"][0]["hostPort"] = 4443
        rendered = lab.render(self.deployment, self.configmap)["items"][1]["spec"]["template"]["spec"]
        self.assertEqual(pod["volumes"][1:], rendered["volumes"][1:-2])
        self.assertTrue(rendered["hostNetwork"])
        self.assertEqual(4443, rendered["containers"][0]["ports"][0]["hostPort"])

    def test_default_ca_reuses_existing_secrets_and_only_special_ca_uses_lab_secret(self):
        deployment = lab.render(self.deployment, self.configmap)["items"][1]
        volumes = deployment["spec"]["template"]["spec"]["volumes"]
        projected = next(v for v in volumes if v["name"] == lab.CA_NAME)["projected"]
        self.assertEqual(0o444, projected["defaultMode"])
        sources = {source["secret"]["name"]: source["secret"]["items"] for source in projected["sources"]}
        self.assertEqual([{"key": "ca.private.pem", "path": "default.key"}], sources["athenz-zts-keys"])
        self.assertEqual([{"key": "selfsign.ca.cert.pem", "path": "default-ca.crt"}], sources["athenz-zts-certs"])
        self.assertEqual({"special.key", "special-ca.crt"}, {item["key"] for item in sources[lab.CA_NAME]})

    def test_missing_or_changed_baseline_ca_references_are_rejected(self):
        for change in ("secret", "entry", "mount"):
            with self.subTest(change=change):
                deployment = copy.deepcopy(self.deployment)
                pod = deployment["spec"]["template"]["spec"]
                if change == "secret":
                    pod["volumes"][1]["secret"]["secretName"] = "another-ca"
                elif change == "entry":
                    pod["volumes"][1]["secret"]["items"] = []
                else:
                    pod["containers"][0]["volumeMounts"][1]["mountPath"] = "/another-directory"
                with self.assertRaisesRegex(ValueError, "baseline CA"):
                    lab.render(deployment, self.configmap)

    def test_java_override_cannot_silently_select_original_signer(self):
        for change in (
            {"env": [{"name": "JDK_JAVA_OPTIONS", "value": "-Dathenz.zts.cert_signer_factory_class=example.OldFactory"}]},
            {"args": ["-Dathenz.crypki.kms.key_id=another-ca"]},
            {"env": [{"name": "JAVA_OPTS", "valueFrom": {"configMapKeyRef": {"name": "options", "key": "jvm"}}}]},
            {"envFrom": [{"configMapRef": {"name": "options"}}]},
        ):
            with self.subTest(change=change):
                deployment = copy.deepcopy(self.deployment)
                deployment["spec"]["template"]["spec"]["containers"][0].update(change)
                with self.assertRaises(ValueError):
                    lab.render(deployment, self.configmap)

    def test_existing_lab_or_colliding_mounts_are_rejected(self):
        conf, deployment = lab.render(self.deployment, self.configmap)["items"]
        with self.assertRaisesRegex(ValueError, "already selects"):
            lab.render(deployment, conf)
        self.deployment["spec"]["template"]["spec"]["containers"][0]["volumeMounts"].append(
            {"name": "other", "mountPath": "/var/run/idthw-crypki"})
        with self.assertRaisesRegex(ValueError, "mount path is already in use"):
            lab.render(self.deployment, self.configmap)

    def test_snapshot_uid_is_required(self):
        self.deployment["metadata"].pop("uid")
        with self.assertRaisesRegex(ValueError, "Deployment UID"):
            lab.render(self.deployment, self.configmap)

    def test_properties_file_matches_verifier_expectations(self):
        properties = Path(__file__).with_name("crypki.properties").read_text()
        self.assertEqual(lab.PROPERTIES, dict(line.split("=", 1) for line in properties.splitlines() if "=" in line))

    def patch_locally(self, deployment, patch, success=True):
        # --local uses a synthetic context with no credentials or reachable API.
        with tempfile.TemporaryDirectory(prefix="crypki-local-patch-") as directory:
            config = Path(directory) / "config.json"
            config.write_text(json.dumps({
                "apiVersion": "v1", "kind": "Config", "users": [],
                "clusters": [{"name": "unused", "cluster": {"server": "http://127.0.0.1:1"}}],
                "contexts": [{"name": "kind-kind", "context": {"cluster": "unused"}}],
            }))
            result = subprocess.run([
                shutil.which("kubectl"), "--context", "kind-kind", "patch", "--local", "-f", "-",
                "--type=json", "--patch", json.dumps(patch), "-o", "json",
            ], input=json.dumps(deployment), text=True, capture_output=True,
                env={"KUBECONFIG": str(config)}, timeout=20)
        if success:
            self.assertEqual(0, result.returncode, result.stderr)
            return json.loads(result.stdout)
        self.assertNotEqual(0, result.returncode)
        self.assertIn("test failed", result.stderr.lower())

    @unittest.skipUnless(shutil.which("kubectl"), "kubectl is needed for local JSON Patch checks")
    def test_update_and_restore_use_only_the_existing_pod_template(self):
        deployment = lab.render(self.deployment, self.configmap)["items"][1]
        patch = lab.template_patch(self.deployment, self.deployment, deployment)
        restore = lab.template_patch(self.deployment, deployment, self.deployment)
        applied = self.patch_locally(self.deployment, patch)
        self.assertEqual(deployment, applied)
        restored = self.patch_locally(applied, restore)
        self.assertEqual(self.deployment, restored)

    @unittest.skipUnless(shutil.which("kubectl"), "kubectl is needed for local JSON Patch checks")
    def test_update_and_restore_refuse_changed_templates_or_replaced_deployments(self):
        deployment = lab.render(self.deployment, self.configmap)["items"][1]
        for before, after in ((self.deployment, deployment), (deployment, self.deployment)):
            patch = lab.template_patch(self.deployment, before, after)
            for change in ("uid", "template"):
                with self.subTest(direction=after["spec"]["template"]["spec"]["volumes"][0], change=change):
                    changed = copy.deepcopy(before)
                    if change == "uid":
                        changed["metadata"]["uid"] = "recreated-deployment"
                    else:
                        changed["spec"]["template"]["metadata"]["annotations"]["later-edit"] = "retain-this"
                    self.patch_locally(changed, patch, success=False)

    @unittest.skipUnless(shutil.which("kubectl"), "kubectl is needed for local JSON Patch checks")
    def test_scale_and_status_updates_survive_apply_and_restore(self):
        deployment = lab.render(self.deployment, self.configmap)["items"][1]
        changed = copy.deepcopy(self.deployment)
        changed["spec"]["replicas"] = 3
        changed["metadata"]["resourceVersion"] = "101"
        changed["status"] = {"readyReplicas": 3}
        applied = self.patch_locally(changed, lab.template_patch(self.deployment, self.deployment, deployment))
        self.assertEqual(3, applied["spec"]["replicas"])
        restored = self.patch_locally(applied, lab.template_patch(self.deployment, deployment, self.deployment))
        self.assertEqual(changed, restored)

    def test_verifier_rejects_changed_manifests_and_unguarded_patches(self):
        conf, deployment = lab.render(self.deployment, self.configmap)["items"]
        files = {
            "source-deployment.json": self.deployment, "source-configmap.json": self.configmap,
            "configmap.json": conf, "deployment.json": deployment,
            "deployment-patch.json": lab.template_patch(self.deployment, self.deployment, deployment),
            "restore-patch.json": lab.template_patch(self.deployment, deployment, self.deployment),
        }
        with tempfile.TemporaryDirectory(prefix="crypki-synthetic-") as directory:
            state = Path(directory)
            for filename, resource in files.items():
                (state / filename).write_text(json.dumps(resource))
            with contextlib.redirect_stdout(io.StringIO()):
                verifier.verify(state)
            for filename in ("configmap.json", "deployment.json", "deployment-patch.json", "restore-patch.json"):
                with self.subTest(filename=filename):
                    changed = copy.deepcopy(files[filename])
                    if isinstance(changed, list):
                        changed.pop(0)
                    else:
                        changed["metadata"]["name"] = "unintended-resource"
                    (state / filename).write_text(json.dumps(changed))
                    with contextlib.redirect_stdout(io.StringIO()), self.assertRaisesRegex(ValueError, filename):
                        verifier.verify(state)
                    (state / filename).write_text(json.dumps(files[filename]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
