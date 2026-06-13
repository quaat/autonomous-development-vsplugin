/**
 * Credential redaction shared by every surface that may display or log a value
 * originating from run-state (remote URLs especially). Strips `user:pass@host`
 * and bare `://user@host` userinfo from URL-shaped strings, replacing the
 * userinfo with `<redacted>`. Defense-in-depth: the controller already redacts
 * recorded remotes, but the extension must never reintroduce a secret into the
 * view model, the webview, or the output channel.
 */
export function redactCredentials(text: string): string {
  return text.replace(/([a-zA-Z][\w+.-]*:\/\/)[^/@\s]+@/g, '$1<redacted>@');
}
