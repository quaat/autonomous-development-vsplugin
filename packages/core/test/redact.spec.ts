import assert from 'node:assert/strict';
import { redactCredentials } from '../src/redact';

describe('redactCredentials', () => {
  it('strips user:password userinfo from a remote URL', () => {
    assert.equal(
      redactCredentials('https://alice:s3cr3t@github.com/acme/repo.git'),
      'https://<redacted>@github.com/acme/repo.git'
    );
  });

  it('strips bare username userinfo', () => {
    assert.equal(
      redactCredentials('ssh://git@example.com/acme/repo.git'),
      'ssh://<redacted>@example.com/acme/repo.git'
    );
  });

  it('redacts every occurrence in a multi-URL string', () => {
    assert.equal(
      redactCredentials('a https://u:p@h.test/x and b http://v:q@i.test/y'),
      'a https://<redacted>@h.test/x and b http://<redacted>@i.test/y'
    );
  });

  it('leaves a credential-free URL untouched', () => {
    assert.equal(
      redactCredentials('https://github.com/acme/repo.git'),
      'https://github.com/acme/repo.git'
    );
  });

  it('leaves non-URL text untouched', () => {
    assert.equal(redactCredentials('no url here'), 'no url here');
  });
});
