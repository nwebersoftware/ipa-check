import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseXmlPlist, parseBinaryPlist, parsePlist } from '../src/plist.mjs';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>com.example.demo</string>
  <key>CFBundleShortVersionString</key><string>1.0.0</string>
  <key>CFBundleVersion</key><string>7</string>
  <key>UIDeviceFamily</key><array><integer>1</integer><integer>2</integer></array>
  <key>ITSAppUsesNonExemptEncryption</key><false/>
</dict>
</plist>`;

test('parses an XML Info.plist', () => {
  const p = parseXmlPlist(XML);
  assert.equal(p.CFBundleIdentifier, 'com.example.demo');
  assert.equal(p.CFBundleShortVersionString, '1.0.0');
  assert.equal(p.CFBundleVersion, '7');
  assert.deepEqual(p.UIDeviceFamily, [1, 2]);
  assert.equal(p.ITSAppUsesNonExemptEncryption, false);
});

test('parses a binary plist (bplist00)', () => {
  const trailer = Buffer.alloc(32);
  trailer[6] = 1; // offsetIntSize
  trailer[7] = 1; // objRefSize
  trailer.writeBigUInt64BE(5n, 8); // numObjects
  trailer.writeBigUInt64BE(0n, 16); // topObject
  trailer.writeBigUInt64BE(22n, 24); // offsetTableOffset
  const buf = Buffer.concat([
    Buffer.from('bplist00', 'latin1'),
    Buffer.from([0xd2, 0x01, 0x03, 0x02, 0x04]), // dict: keys [a, b], values [hi, 42]
    Buffer.from([0x51, 0x61]), // "a"
    Buffer.from([0x52, 0x68, 0x69]), // "hi"
    Buffer.from([0x51, 0x62]), // "b"
    Buffer.from([0x10, 0x2a]), // int 42
    Buffer.from([0x08, 0x0d, 0x0f, 0x12, 0x14]), // offset table
    trailer,
  ]);
  assert.deepEqual(parseBinaryPlist(buf), { a: 'hi', b: 42 });
});

test('dispatches on the bplist00 magic', () => {
  assert.equal(parsePlist(Buffer.from(XML)).CFBundleVersion, '7');
});
