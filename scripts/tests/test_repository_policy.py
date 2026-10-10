"""Regression tests for the repository gate: no network or real credentials."""
from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from scripts import check_repo_policy as policy


class PolicyGateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.before_root = policy.ROOT
        self.before_errors = policy.ERRORS
        self.temp = tempfile.TemporaryDirectory()
        policy.ROOT = Path(self.temp.name)
        policy.ERRORS = []
        src = self.before_root / ".agents/skills"
        target = policy.ROOT / ".agents/skills"
        shutil.copytree(src, target)

    def tearDown(self) -> None:
        policy.ROOT = self.before_root
        policy.ERRORS = self.before_errors
        self.temp.cleanup()

    def test_phase_perimeter_docs_are_mandatory(self) -> None:
        required = {
            "docs/phases/ROADMAP.md",
            "docs/CODEX_REVIEW.md",
            "docs/SECURITY_PERIMETER.md",
            "docs/superpowers/specs/2026-10-10-phase1-perimeter-design.md",
            "docs/superpowers/plans/2026-10-10-phase1-perimeter.md",
        }
        self.assertTrue(required.issubset(set(policy.REQUIRED)),
                        f"Mandatory phase docs missing: {sorted(required - set(policy.REQUIRED))}")

    def test_phase3_contract_and_split_strict_type_checks_are_required(self) -> None:
        required = {
            "docs/PHASE3_SETUP.md",
            "docs/superpowers/specs/2026-10-10-phase3-auth-design.md",
            "docs/superpowers/plans/2026-10-10-phase3-auth.md",
            "tsconfig.auth.json",
            "tsconfig.mcp.json",
        }
        self.assertTrue(required.issubset(set(policy.REQUIRED)),
                        f"Phase 3 documents/checks missing: {sorted(required - set(policy.REQUIRED))}")

    def test_oauth_typecheck_shortcut_is_rejected(self) -> None:
        policy.verify_phase3_typecheck({"typecheck": "tsc -p tsconfig.json --noEmit"})
        self.assertTrue(any("strict auth + MCP + combined TS" in e for e in policy.ERRORS))

    def test_upstream_pins_match_verbatim_vendor_files(self) -> None:
        policy.verify_skills()
        self.assertEqual([], policy.ERRORS)

    def test_tampered_upstream_skill_is_rejected(self) -> None:
        target = policy.ROOT / ".agents/skills/test-driven-development/SKILL.md"
        target.write_text(target.read_text(encoding="utf-8") + "\n# unauthorized edit\n", encoding="utf-8")
        policy.verify_skills()
        self.assertTrue(any("Vendored upstream blob changed" in x for x in policy.ERRORS))

    def test_git_blob_has_correct_sha1_construction(self) -> None:
        self.assertEqual("f2ba8f84ab5c1bce84a7b441cb1959cfc7093b7f",
                         policy.git_blob(b"abc"))

    def test_source_outside_src_requires_lockfile_and_tsconfig(self) -> None:
        source = policy.ROOT / "packages/adapter/index.ts"
        source.parent.mkdir(parents=True)
        source.write_text("export const value = 1;\n", encoding="utf-8")
        policy.verify_application()
        self.assertTrue(any("package-lock.json" in x for x in policy.ERRORS))
        self.assertTrue(any("tsconfig.json" in x for x in policy.ERRORS))

    def test_documentation_only_stage_must_not_be_mislabeled(self) -> None:
        policy.verify_application()
        self.assertEqual([], policy.ERRORS)

    def test_suppression_cannot_sneak_through_with_valid_scaffold(self) -> None:
        source = policy.ROOT / "src/main.ts"
        source.parent.mkdir(parents=True)
        source.write_text("// @ts-nocheck\nexport const value = 1;\n", encoding="utf-8")
        scripts = {k: "node ./scripts/run-" + k + ".mjs"
                   for k in ("format:check", "lint", "typecheck", "test", "build")}
        (policy.ROOT / "package.json").write_text(json.dumps({"scripts": scripts}), encoding="utf-8")
        (policy.ROOT / "package-lock.json").write_text("{}", encoding="utf-8")
        (policy.ROOT / "eslint.config.js").write_text("export default [];\n", encoding="utf-8")
        flags = {name: True for name in ("strict", "noUncheckedIndexedAccess",
                 "exactOptionalPropertyTypes", "noImplicitOverride", "noFallthroughCasesInSwitch")}
        (policy.ROOT / "tsconfig.json").write_text(
            json.dumps({"compilerOptions": flags}), encoding="utf-8")
        policy.verify_application()
        self.assertTrue(any("TypeScript checking suppressed" in x for x in policy.ERRORS))


if __name__ == "__main__":
    unittest.main()
