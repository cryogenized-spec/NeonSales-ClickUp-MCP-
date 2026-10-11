import { describe, expect, it } from "vitest";
import {
  oauthUserIdForGitHub,
  parseStaffAllowlist,
  requireActivePrincipal,
} from "../src/auth/staff.js";

describe("active staff isolation and scope validation", () => {
  it("accepts one to four distinct stable numeric GitHub identities", () => {
    expect([...parseStaffAllowlist("11, 22,33, 44")]).toEqual(["11", "22", "33", "44"]);
  });

  it.each(["", "0", "001", "-4", "1,1", "1,2,3,4,5", "a,2", "9007199254740992", "3,,4"])(
    "rejects malformed staff allowlist %s",
    (value) => {
      expect(() => parseStaffAllowlist(value)).toThrow();
    },
  );

  it("accepts only an independently authenticated and currently allowlisted identity", () => {
    expect(
      requireActivePrincipal({ userId: "github:22" }, "github_22", ["mcp:read"], "11,22"),
    ).toEqual({
      subject: "github:22",
      githubId: "22",
      scopes: ["mcp:read"],
    });
    expect(() =>
      requireActivePrincipal({ userId: "github:22" }, "github_23", ["mcp:read"], "22"),
    ).toThrow();
    expect(() =>
      requireActivePrincipal({ userId: "github:22" }, "github_22", ["mcp:write"], "22"),
    ).toThrow();
    expect(() =>
      requireActivePrincipal({ userId: "github:22" }, "github_22", ["mcp:read"], "11"),
    ).toThrow();
  });

  it("uses a colon-free, canonical OAuth grant ID while preserving the GitHub principal", () => {
    expect(oauthUserIdForGitHub("256972168")).toBe("github_256972168");
    expect(oauthUserIdForGitHub("256972168")).not.toContain(":");
    for (const bad of ["", "0", "001", "1:2", "name", "9007199254740992"]) {
      expect(() => oauthUserIdForGitHub(bad)).toThrow();
    }
    expect(() =>
      requireActivePrincipal({ userId: "github:22" }, "github:22", ["mcp:read"], "22"),
    ).toThrow();
    expect(
      requireActivePrincipal({ userId: "github:22" }, "github_22", ["mcp:read"], "22"),
    ).toEqual({ subject: "github:22", githubId: "22", scopes: ["mcp:read"] });
  });

  it("isolates four concurrent authenticated requests without any shared principal", async () => {
    const requests = ["11", "22", "33", "44"].map(async (id) =>
      requireActivePrincipal(
        { userId: "github:" + id },
        "github_" + id,
        ["mcp:read"],
        "11,22,33,44",
      ),
    );
    const principals = await Promise.all(requests);
    expect(principals.map((p) => p.subject)).toEqual([
      "github:11",
      "github:22",
      "github:33",
      "github:44",
    ]);
    expect(new Set(principals.map((p) => p.subject)).size).toBe(4);
  });
});
