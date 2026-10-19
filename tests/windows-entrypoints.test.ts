import { it, expect } from 'vitest';
import fs from 'node:fs';

// A checkout may hide LF-only Git blobs through core.autocrlf. GitHub ZIPs
// contain the committed bytes, so Windows command files must retain CRLF.
for (const name of ['Install-Local.cmd', 'Start-Local.cmd', 'Stop-Local.cmd', 'Create-DesktopShortcut.cmd', 'Connect-Phone.cmd', 'Set-LanFirewall.cmd']) {
  it(`${name} remains executable after downloading a GitHub ZIP`, () => {
    const bytes = fs.readFileSync(name);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
    expect(text).toContain('\r\n');
    expect(text.replaceAll('\r\n', '')).not.toContain('\n');
    expect(fs.readFileSync('.gitattributes', 'utf8')).toMatch(/^\*\.cmd -text(?:\s|$)/m);
  });
}
