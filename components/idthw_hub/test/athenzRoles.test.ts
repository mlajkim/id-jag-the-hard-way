import assert from "node:assert/strict"
import test from "node:test"
import {
  isSelectableAthenzDirectRole,
  parseSelectableAthenzRoleList,
} from "../features/permissions/lib/athenzRoles.ts"

test("lists only selectable direct roles from an Athenz domain", () => {
  assert.deepEqual(parseSelectableAthenzRoleList({
    names: [
      "docs-poster",
      "docs-getter-exchanger",
      "api:role.docs-deleter",
      "admin",
      "docs-getter-jag-exchanger",
      "zts_instance_launch_provider",
      "docs-getter",
      "docs-getter",
    ],
  }, "api"), [
    "docs-deleter",
    "docs-getter",
    "docs-poster",
  ])
})

test("identifies generated and administrative roles as non-selectable", () => {
  assert.equal(isSelectableAthenzDirectRole("admin"), false)
  assert.equal(isSelectableAthenzDirectRole("docs-getter-exchanger"), false)
  assert.equal(isSelectableAthenzDirectRole("docs-getter-jag-exchanger"), false)
  assert.equal(isSelectableAthenzDirectRole("zts_instance_launch_provider"), false)
  assert.equal(isSelectableAthenzDirectRole("docs-getter"), true)
})

test("rejects malformed Athenz role lists", () => {
  assert.throws(() => parseSelectableAthenzRoleList({}, "api"), /invalid role list/)
  assert.throws(() => parseSelectableAthenzRoleList({ names: [""] }, "api"), /invalid role name/)
  assert.throws(
    () => parseSelectableAthenzRoleList({ names: ["other:role.docs-getter"] }, "api"),
    /invalid role name/,
  )
})
