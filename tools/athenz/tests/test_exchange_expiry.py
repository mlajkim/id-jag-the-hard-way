import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest


TOOLS = Path(__file__).resolve().parents[2]
SCOPE = "api:role.docs-getter api:role.mcp-accessor api:role.mcp-hub-accessor"
DOCUMENT = TOOLS.parent / "research/athenz/rfc8693_token_exchange/261027-expiry-security-check.md"

# This stand-in never opens identity files, signs a JWT, or makes a network request.
FIXTURE = r'''
import base64
import json
import os
from pathlib import Path
import sys

root = Path(os.environ["IDTHW_EXPIRY_FIXTURE_ROOT"])
state_path = root / "state.json"
state = json.loads(state_path.read_text())
command = Path(sys.argv[0]).name
scenario = os.environ.get("IDTHW_EXPIRY_SCENARIO", "sliding")

def save():
    state_path.write_text(json.dumps(state))

def encoded(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")

def jwt(claims):
    return encoded({"alg": "RS256", "typ": "at+jwt"}) + "." + encoded(claims) + ".not-a-signature"

def claims(value):
    part = value.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))

def emit(value):
    save()
    print(json.dumps(value))
    sys.exit(0)

if command == "date":
    assert sys.argv[1:] == ["+%s"]
    print(state["clock"])
    sys.exit(0)
if command == "sleep":
    state["clock"] += int(sys.argv[1])
    save()
    sys.exit(0)

assert command == "curl"
args = sys.argv[1:]
form = dict(args[i + 1].split("=", 1) for i, arg in enumerate(args) if arg == "--data-urlencode")
now = state["clock"]
grant = form.get("grant_type")
kind = "actor" if grant is None else "issue" if grant == "client_credentials" else "exchange"
source = claims(form["subject_token"]) if kind == "exchange" else None
call = {
    "kind": kind, "audience": form.get("audience"), "scope": form.get("scope"),
    "expires_in": form.get("expires_in"), "actor": form.get("actor"),
    "subject_jti": source["jti"] if source else None,
}
state["calls"].append(call)
if kind == "actor":
    emit({"id_token": jwt({"sub": form["client_id"], "exp": now + 3600})})

if kind == "exchange" and source["origin"] and now >= source["exp"] + 90:
    if scenario == "control_denied":
        emit({"code": 403, "message": "fixture role denied"})
    if scenario == "control_connection_error":
        save()
        print("curl: (7) fixture connection failed", file=sys.stderr)
        sys.exit(7)
if source and now >= source["exp"] + 60 and scenario != "original_never_expires":
    emit({"code": 400, "message": "Invalid subject token: Unable to parse token: Expired JWT"})

audience = form.get("audience", "api")
scope = [s.removeprefix(audience + ":role.") for s in form["scope"].split()]
state["issued"] += 1
body = {
    "sub": source["sub"] if source else "human.idjag-learner",
    "aud": audience, "scp": scope, "scope": " ".join(scope),
    "client_id": "api.mcp-hub" if source else "human.idjag-learner",
    "iat": now, "auth_time": now, "exp": now + int(form["expires_in"]),
    "jti": "fixture-" + str(state["issued"]), "origin": source is None,
}
if form.get("actor"):
    body["may_act"] = {"sub": form["actor"]}
if form.get("actor_token"):
    body["act"] = {"sub": claims(form["actor_token"])["sub"]}
    if source.get("act"):
        body["act"]["act"] = source["act"]
if source:
    if scenario == "parent_capped":
        body["exp"] = min(body["exp"], source["exp"])
    if scenario == "scope_loss":
        body["scp"] = body["scp"][:-1]
    if scenario == "standard_scope_loss":
        body["scope"] = " ".join(body["scp"][:-1])
    if scenario == "scope_reordered":
        body["scope"] = " ".join(reversed(body["scp"]))
        body["scp"] = list(reversed(body["scp"]))
    if scenario == "subject_changed":
        body["sub"] = "human.someone-else"
    if scenario == "audience_changed":
        body["aud"] = "other"
    if scenario == "actor_lost":
        body.pop("may_act", None)
    if scenario == "exchanger_changed" and not source["origin"]:
        body["client_id"] = "api.someone-else"
emit({"access_token": jwt(body), "expires_in": int(form["expires_in"]), "token_type": "Bearer"})
'''


class ExchangeExpiryTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="idthw-exchange-expiry-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.tools = self.root / "tools"
        (self.tools / "athenz").mkdir(parents=True)
        for name in ["check-exchange-expiry.sh", "fetch-access-token.sh", "exchange-access-token.sh", "fetch-actor-token.sh"]:
            shutil.copy2(TOOLS / "athenz" / name, self.tools / "athenz" / name)
        shutil.copy2(TOOLS / "color.sh", self.tools / "color.sh")
        port = self.tools / "port.sh"
        port.write_text("#!/bin/sh\nprintf '18443\\n'\n")
        port.chmod(0o755)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        for name in ["curl", "date", "sleep"]:
            executable = self.bin / name
            executable.write_text(f"#!{sys.executable}\n" + FIXTURE)
            executable.chmod(0o755)
        self.state = self.root / "state.json"
        self.reset()

    def reset(self):
        self.state.write_text(json.dumps({"clock": 2000000000, "issued": 0, "calls": []}))

    def calls(self):
        return json.loads(self.state.read_text())["calls"]

    def run_command(self, args, scenario="sliding"):
        return subprocess.run(
            args, cwd=self.root, capture_output=True, text=True, timeout=30,
            env={"PATH": f"{self.bin}:{os.environ['PATH']}", "IDTHW_EXPIRY_FIXTURE_ROOT": str(self.root),
                 "IDTHW_EXPIRY_SCENARIO": scenario},
        )

    def check(self, *extra, scenario="sliding"):
        return self.run_command([
            "bash", str(self.tools / "athenz/check-exchange-expiry.sh"),
            "missing-subject.crt", "missing-subject.key", "missing-hub.crt", "missing-hub.key", SCOPE,
            "--audience", "api", *extra,
        ], scenario=scenario)

    def assert_no_raw_fixture(self, result):
        self.assertNotIn("not-a-signature", result.stdout + result.stderr)

    def test_impersonation_follows_children_and_proves_original_expiry(self):
        result = self.check()
        self.assertEqual(0, result.returncode, result.stderr)
        calls = self.calls()
        self.assertEqual(1, sum(c["kind"] == "issue" for c in calls))
        exchanges = [c for c in calls if c["kind"] == "exchange"]
        self.assertEqual(14, len(exchanges))
        self.assertEqual("fixture-1", exchanges[0]["subject_jti"])
        self.assertEqual("fixture-2", exchanges[1]["subject_jti"])
        self.assertEqual("fixture-1", exchanges[-2]["subject_jti"])
        self.assertEqual("fixture-13", exchanges[-1]["subject_jti"])
        self.assertTrue(all(c["audience"] == "api" and c["scope"] == SCOPE and c["expires_in"] == "30" for c in calls))
        self.assertIn("Original token rejected specifically because it expired", result.stdout)
        self.assertIn("Child exchange succeeded after original token was rejected as expired", result.stdout)
        self.assert_no_raw_fixture(result)

    def test_delegation_keeps_self_actor_on_every_exchange(self):
        result = self.check("--actor", "api.mcp-hub", scenario="scope_reordered")
        self.assertEqual(0, result.returncode, result.stderr)
        calls = self.calls()
        self.assertEqual(1, sum(c["kind"] == "actor" for c in calls))
        self.assertTrue(all(c["actor"] == "api.mcp-hub" for c in calls if c["kind"] != "actor"))
        self.assert_no_raw_fixture(result)

    def test_rejection_or_connection_error_is_not_mistaken_for_expiry(self):
        for scenario in ["control_denied", "control_connection_error"]:
            with self.subTest(scenario=scenario):
                self.reset()
                result = self.check(scenario=scenario)
                self.assertNotEqual(0, result.returncode)
                self.assertNotIn("Original token rejected specifically because it expired", result.stdout)
                self.assertNotIn("Child exchange succeeded", result.stdout)
                self.assert_no_raw_fixture(result)

    def test_still_accepted_original_does_not_pass(self):
        result = self.check(scenario="original_never_expires")
        self.assertNotEqual(0, result.returncode)
        self.assertIn("Original still accepted", result.stderr)
        self.assertNotIn("Child exchange succeeded", result.stdout)
        self.assert_no_raw_fixture(result)

    def test_parent_expiry_cap_stops_the_check(self):
        result = self.check(scenario="parent_capped")
        self.assertNotEqual(0, result.returncode)
        self.assertIn("Expiry did not advance", result.stderr)
        self.assertEqual(2, len(self.calls()))

    def test_changed_authority_does_not_pass(self):
        for scenario in ["scope_loss", "standard_scope_loss", "subject_changed", "audience_changed", "exchanger_changed"]:
            with self.subTest(scenario=scenario):
                self.reset()
                result = self.check(scenario=scenario)
                self.assertNotEqual(0, result.returncode)
                self.assertIn("Child identity, audience, scopes, or actor claims changed", result.stderr)
                self.assert_no_raw_fixture(result)

    def test_missing_next_actor_stops_delegation(self):
        result = self.check("--actor", "api.mcp-hub", scenario="actor_lost")
        self.assertNotEqual(0, result.returncode)
        self.assertIn("actor claims changed", result.stderr)

    def test_lifetime_option_and_default_reach_both_http_helpers(self):
        for name, positional in [
            ("fetch-access-token.sh", ["missing.crt", "missing.key", SCOPE]),
            ("exchange-access-token.sh", ["missing.crt", "missing.key", "fixture-subject", SCOPE]),
        ]:
            for option, expected in [([], "3600"), (["--expires-in", "30"], "30")]:
                with self.subTest(name=name, option=option):
                    self.reset()
                    if name.startswith("exchange"):
                        issued = self.run_command(["bash", str(self.tools / "athenz/fetch-access-token.sh"),
                                                   "missing.crt", "missing.key", SCOPE])
                        self.assertEqual(0, issued.returncode, issued.stderr)
                        positional = ["missing.crt", "missing.key", issued.stdout.strip(), SCOPE]
                    result = self.run_command(["bash", str(self.tools / "athenz" / name), *positional, *option])
                    self.assertEqual(0, result.returncode, result.stderr)
                    self.assertEqual(expected, self.calls()[-1]["expires_in"])

    def test_invalid_lifetime_stops_before_http(self):
        for name, positional in [
            ("fetch-access-token.sh", ["missing.crt", "missing.key", SCOPE]),
            ("exchange-access-token.sh", ["missing.crt", "missing.key", "fixture-subject", SCOPE]),
        ]:
            for value in ["0", "-1", "1.5", "abc", "2147483648", "99999999999999999999"]:
                with self.subTest(name=name, value=value):
                    self.reset()
                    result = self.run_command(["bash", str(self.tools / "athenz" / name), *positional, "--expires-in", value])
                    self.assertNotEqual(0, result.returncode)
                    self.assertEqual([], self.calls())

    def test_document_token_blocks_are_independent(self):
        document = DOCUMENT.read_text()
        for number in [1, 2, 3, 4]:
            with self.subTest(step=number):
                self.reset()
                section = document.split(f"## Step {number}.", 1)[1].split("\n## ", 1)[0]
                block = re.search(r"```sh\n(.*?)\n```", section, re.S).group(1)
                result = self.run_command(["bash", "-c", block])
                self.assertEqual(0, result.returncode, result.stderr)
                self.assertEqual(1, sum(c["kind"] == "issue" for c in self.calls()))
                self.assert_no_raw_fixture(result)


if __name__ == "__main__":
    unittest.main()
