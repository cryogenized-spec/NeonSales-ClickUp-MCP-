import { describe, expect, it, vi } from "vitest";
import { exchangeGithubIdentity, githubAuthorizeUrl, pkceChallenge } from "../src/auth/github.js";

describe("upstream GitHub OAuth identity", () => {
  it("creates an upstream redirect bound to state, callback and PKCE S256", async () => {
    const challenge = await pkceChallenge("abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklm");
    const url = githubAuthorizeUrl("client-id", "server-stored-state", challenge, "https://mcp.example.com/github/callback");
    expect(url.origin).toBe("https://github.com");
    expect(url.searchParams.get("state")).toBe("server-stored-state");
    expect(url.searchParams.get("redirect_uri")).toBe("https://mcp.example.com/github/callback");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(challenge);
  });

  it("exchanges an authorization code and obtains stable authenticated GitHub ID", async () => {
    const calls: string[] = [];
    const mockedFetch = vi.fn(async (url: RequestInfo | URL) => {
      calls.push(String(url));
      if (String(url).includes("access_token")) {
        return Response.json({ access_token: "upstream-token", token_type: "bearer" });
      }
      return Response.json({ id: 67890, login: "staff-member" });
    });
    const identity = await exchangeGithubIdentity({
      clientId: "client-id", clientSecret: "never-log", code: "one-use-code",
      verifier: "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklm",
      callbackUrl: "https://mcp.example.com/github/callback",
    }, mockedFetch);
    expect(identity).toEqual({ githubId: "67890" });
    expect(calls).toEqual([
      "https://github.com/login/oauth/access_token",
      "https://api.github.com/user",
    ]);
  });

  it.each([
    [Response.json({ error: "bad_verification_code" }), "reject"],
    [Response.json({ access_token: null }), "reject"],
    [new Response("{}", { status: 503 }), "reject"],
  ])("rejects invalid upstream code exchange without issuing identity", async (tokenResponse) => {
    const mockedFetch = vi.fn().mockResolvedValue(tokenResponse);
    await expect(exchangeGithubIdentity({
      clientId: "id", clientSecret: "secret", code: "bad", verifier: "verifier",
      callbackUrl: "https://mcp.example.com/github/callback",
    }, mockedFetch)).rejects.toThrow();
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects identity responses without a valid immutable numeric user id", async () => {
    const mockedFetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ access_token: "token" }))
      .mockResolvedValueOnce(Response.json({ id: "impersonated", login: "boss" }));
    await expect(exchangeGithubIdentity({
      clientId: "id", clientSecret: "secret", code: "code", verifier: "verifier",
      callbackUrl: "https://mcp.example.com/github/callback",
    }, mockedFetch)).rejects.toThrow();
  });
});
