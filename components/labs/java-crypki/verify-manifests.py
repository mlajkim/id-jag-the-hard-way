#!/usr/bin/env python3
"""Operator-run checks only. Never print configuration contents or create resources."""

import argparse
import importlib.util
import json
from pathlib import Path
import sys


def verify(state, baseline_only=False):
    spec = importlib.util.spec_from_file_location("crypki_manifest_checks", Path(__file__).with_name("render-lab.py"))
    checks = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(checks)
    with (state / "source-deployment.json").open() as dep, (state / "source-configmap.json").open() as conf:
        baseline = json.load(dep)
        configmap, deployment = checks.render(baseline, json.load(conf))["items"]
    print("PASS: baseline has the expected ZTS mounts, CA Secret references, and no conflicting Java signer options")
    if baseline_only:
        return
    expected = {
        "configmap.json": configmap,
        "deployment.json": deployment,
        "deployment-patch.json": checks.template_patch(baseline, baseline, deployment),
        "restore-patch.json": checks.template_patch(baseline, deployment, baseline),
    }
    for filename, resource in expected.items():
        with (state / filename).open() as source:
            actual = json.load(source)
        if actual != resource:
            raise ValueError(f"{filename} differs from the expected existing-ZTS configuration")
        print(f"PASS: {filename} matches the existing-ZTS walkthrough")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("state", type=Path)
    parser.add_argument("--baseline-only", action="store_true")
    args = parser.parse_args()
    try:
        verify(args.state, args.baseline_only)
    except (OSError, ValueError, KeyError, TypeError, StopIteration) as error:
        # Omit parser/source values: these inputs can contain sensitive configuration.
        if isinstance(error, json.JSONDecodeError):
            print("FAIL: a manifest or configuration snapshot is not valid JSON", file=sys.stderr)
        elif isinstance(error, (KeyError, TypeError, StopIteration)):
            print("FAIL: unexpected manifest structure; inspect the private files locally", file=sys.stderr)
        else:
            print(f"FAIL: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
