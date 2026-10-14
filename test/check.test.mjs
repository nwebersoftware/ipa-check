import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32 } from 'node:zlib';

import { checkIpa, formatReport } from '../src/check.mjs';

function makeZip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const data = Buffer.from(f.data);
    const crc = crc32(data) >>> 0;
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(data.length, 18);
    lfh.writeUInt32LE(data.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    parts.push(lfh, nameBuf, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += lfh.length + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBuf, eocd]);
}

function infoPlist({ build = '7' } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.example.demo</string>
  <key>CFBundleShortVersionString</key><string>1.0.0</string>
  <key>CFBundleVersion</key><string>${build}</string>
  <key>MinimumOSVersion</key><string>15.1</string>
  <key>CFBundleIconName</key><string>AppIcon</string>
</dict></plist>`;
}

test('passes a well-formed ipa', () => {
  const ipa = makeZip([
    { name: 'Payload/Demo.app/Info.plist', data: infoPlist() },
    { name: 'Payload/Demo.app/PrivacyInfo.xcprivacy', data: '<plist/>' },
  ]);
  const report = checkIpa(ipa);
  assert.equal(report.ok, true);
  assert.match(formatReport(report), /PASS/);
});

test('fails when CFBundleVersion is missing', () => {
  const bad = infoPlist().replace(/<key>CFBundleVersion<\/key><string>7<\/string>/, '');
  const ipa = makeZip([{ name: 'Payload/Demo.app/Info.plist', data: bad }]);
  const report = checkIpa(ipa);
  assert.equal(report.ok, false);
  assert.ok(report.failed.some((c) => c.id === 'build-number'));
});

test('flags a non-integer build number', () => {
  const ipa = makeZip([{ name: 'Payload/Demo.app/Info.plist', data: infoPlist({ build: '1.beta' }) }]);
  const report = checkIpa(ipa);
  assert.ok(report.failed.some((c) => c.id === 'build-number'));
});

test('warns when the privacy manifest is missing', () => {
  const ipa = makeZip([{ name: 'Payload/Demo.app/Info.plist', data: infoPlist() }]);
  const report = checkIpa(ipa);
  assert.ok(report.warned.some((c) => c.id === 'privacy-manifest'));
});

test('--bundle-id mismatch fails', () => {
  const ipa = makeZip([{ name: 'Payload/Demo.app/Info.plist', data: infoPlist() }]);
  const report = checkIpa(ipa, { bundleId: 'com.other.app' });
  assert.equal(report.ok, false);
});
