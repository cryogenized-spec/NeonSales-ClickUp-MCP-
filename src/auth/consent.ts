interface ConsentDisplay {
  readonly clientName: string;
  readonly clientDomain?: string | undefined;
  readonly redirectHost: string;
  readonly redirectIsLoopback: boolean;
  readonly scope: readonly string[];
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => "&#" + char.charCodeAt(0) + ";");
}

/** Browser binding, CSRF and frame headers are supplied by beginConsent(); this escapes the page. */
export function renderConsentPage(details: ConsentDisplay, handle: string): string {
  const name = escapeHtml(details.clientName);
  const origin = details.clientDomain
    ? "Published by " + escapeHtml(details.clientDomain) + "."
    : "This application's name is self-declared and has not been independently verified.";
  const scopes = details.scope
    .map(
      (scope) =>
        '<label><input name="scope" type="checkbox" checked value="' +
        escapeHtml(scope) +
        '"> ' +
        escapeHtml(scope) +
        "</label>",
    )
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>NeonSales OAuth consent</title></head><body>
<h1>Allow ${name} to connect?</h1>
<p>${origin}</p>
<p>Access would be returned to <strong>${escapeHtml(details.redirectHost)}</strong>.</p>
${details.redirectIsLoopback ? "<p><strong>This sends access to an app on your computer.</strong></p>" : ""}
<p>Only proceed if you initiated this connection.</p>
<form method="post" action="/authorize">
<input type="hidden" name="handle" value="${escapeHtml(handle)}">
${scopes}
<button name="decision" value="approve">Allow</button>
<button name="decision" value="deny">Deny</button>
</form></body></html>`;
}

/** RED-phase implementation: intentionally incomplete until the adversarial test fails. */
export function validatedReadOnlyScopes(submitted: string[]): string[] {
  return submitted;
}
