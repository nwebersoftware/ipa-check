import { readZip, readEntry } from './zip.mjs';
import { parsePlist } from './plist.mjs';

const INFO_RE = /^Payload\/[^/]+\.app\/Info\.plist$/;
const PRIVACY_RE = /^Payload\/[^/]+\.app\/PrivacyInfo\.xcprivacy$/;
const PROVISION_RE = /^Payload\/[^/]+\.app\/embedded\.mobileprovision$/;

function finish(checks) {
  const failed = checks.filter((c) => c.severity === 'fail' && !c.ok);
  const warned = checks.filter((c) => c.severity === 'warn' && !c.ok);
  return { ok: failed.length === 0, checks, failed, warned };
}

/** Audit an .ipa for common App Store submission pitfalls. */
export function checkIpa(buf, opts = {}) {
  const checks = [];
  const add = (id, severity, ok, detail) => checks.push({ id, severity, ok, detail });

  let zip;
  try {
    zip = readZip(buf);
  } catch (e) {
    add('ipa', 'fail', false, `not a valid .ipa: ${e.message}`);
    return finish(checks);
  }

  const infoPath = zip.entries.map((e) => e.name).find((n) => INFO_RE.test(n));
  if (!infoPath) {
    add('info-plist', 'fail', false, 'no Payload/*.app/Info.plist found (is this an .ipa?)');
    return finish(checks);
  }

  let info;
  try {
    info = parsePlist(readEntry(zip, infoPath));
  } catch (e) {
    add('info-plist', 'fail', false, `could not parse Info.plist: ${e.message}`);
    return finish(checks);
  }
  add('info-plist', 'fail', true, `parsed ${infoPath}`);

  const id = info.CFBundleIdentifier;
  add('bundle-id', 'fail', typeof id === 'string' && id.length > 0, id ? id : 'CFBundleIdentifier missing');

  const short = info.CFBundleShortVersionString;
  add('version', 'fail', typeof short === 'string' && short.length > 0, short ? short : 'CFBundleShortVersionString missing (the user-facing version)');

  const build = info.CFBundleVersion;
  const buildOk = typeof build === 'string' && /^[0-9]+(\.[0-9]+)*$/.test(build);
  add(
    'build-number',
    'fail',
    buildOk,
    build ? `${build}${buildOk ? '' : '  ← must be period-separated integers'}` : 'CFBundleVersion missing',
  );

  if (opts.bundleId) {
    add('bundle-id-match', 'fail', id === opts.bundleId, `expected ${opts.bundleId}, got ${id ?? '—'}`);
  }

  const enc = info.ITSAppUsesNonExemptEncryption;
  add(
    'encryption-key',
    'warn',
    enc !== undefined,
    enc !== undefined
      ? `ITSAppUsesNonExemptEncryption = ${enc}`
      : 'ITSAppUsesNonExemptEncryption missing — App Store Connect will ask about export compliance',
  );

  const hasPrivacy = zip.entries.some((e) => PRIVACY_RE.test(e.name));
  add(
    'privacy-manifest',
    'warn',
    hasPrivacy,
    hasPrivacy ? 'PrivacyInfo.xcprivacy present' : 'PrivacyInfo.xcprivacy missing (iOS 17+ apps usually need one)',
  );

  const families = Array.isArray(info.UIDeviceFamily) ? info.UIDeviceFamily : [];
  if (families.includes(2)) {
    const o = info['UISupportedInterfaceOrientations~ipad'];
    const all = Array.isArray(o) && o.length >= 4;
    add(
      'ipad-orientations',
      'warn',
      all,
      all ? `${o.length} iPad orientations declared` : 'iPad is supported but UISupportedInterfaceOrientations~ipad is not all four — Apple may reject',
    );
  }

  const icon = info.CFBundleIconName || info.CFBundleIcons;
  add('icon', 'warn', Boolean(icon), icon ? 'icon key present' : 'no CFBundleIconName / CFBundleIcons key');

  const minOs = info.MinimumOSVersion;
  add('min-os', 'warn', Boolean(minOs), minOs ? `MinimumOSVersion ${minOs}` : 'MinimumOSVersion missing');

  const prov = zip.entries.some((e) => PROVISION_RE.test(e.name));
  add('provisioning', 'info', true, prov ? 'embedded.mobileprovision present' : 'no embedded.mobileprovision (expected for App Store / TestFlight archives)');

  return finish(checks);
}

export function formatReport(report, label = '') {
  const out = ['ipa-check — App Store submission audit'];
  if (label) out.push(`artifact: ${label}`);
  out.push('');
  for (const c of report.checks) {
    const mark = c.severity === 'info' ? '·' : c.ok ? '✓' : c.severity === 'fail' ? '✗' : '!';
    out.push(`${mark} ${c.id}  ${c.detail}`);
  }
  out.push('');
  if (report.ok) out.push(report.warned.length ? `PASS (${report.warned.length} warning${report.warned.length > 1 ? 's' : ''})` : 'PASS — no issues found.');
  else out.push(`FAIL — ${report.failed.length} blocking issue${report.failed.length > 1 ? 's' : ''}.`);
  return out.join('\n');
}
