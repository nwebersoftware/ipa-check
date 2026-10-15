# ipa-check

[![npm](https://img.shields.io/npm/v/%40njweber%2Fipa-check)](https://www.npmjs.com/package/@njweber/ipa-check) [![downloads](https://img.shields.io/npm/dm/%40njweber%2Fipa-check)](https://www.npmjs.com/package/@njweber/ipa-check) [![CI](https://github.com/nwebersoftware/ipa-check/actions/workflows/ci.yml/badge.svg)](https://github.com/nwebersoftware/ipa-check/actions/workflows/ci.yml)


**Audit an iOS `.ipa` for common App Store submission pitfalls** — dependency-free, runs anywhere Node runs.

Point it at a built `.ipa` and it tells you what will trip you up *before* App Store Connect does: a
missing build number, the export-compliance prompt, the missing privacy manifest, iPad orientation
gaps, and more.

- **Zero dependencies** (its own ZIP reader + XML/binary `Info.plist` parser)
- **Exits non-zero on blocking issues** → drop it into CI
- No Mac, no Xcode, no `plutil` required

## Usage

```bash
npx @njweber/ipa-check ./build/YourApp.ipa
npx @njweber/ipa-check ./YourApp.ipa --bundle-id com.example.yourapp
```

```
ipa-check — App Store submission audit
artifact: ./YourApp.ipa

✓ info-plist  parsed Payload/YourApp.app/Info.plist
✓ bundle-id  com.example.yourapp
✓ version  1.2.0
✓ build-number  42
! encryption-key  ITSAppUsesNonExemptEncryption missing — App Store Connect will ask about export compliance
! privacy-manifest  PrivacyInfo.xcprivacy missing (iOS 17+ apps usually need one)

PASS (2 warnings)
```

Exit codes: `0` ok (warnings allowed) · `1` blocking issue · `2` bad input.

## What it checks

| Check | Severity | Why |
| --- | --- | --- |
| `info-plist` | fail | must be a real `.ipa` with `Payload/*.app/Info.plist` |
| `bundle-id` | fail | `CFBundleIdentifier` must exist |
| `version` | fail | `CFBundleShortVersionString` (user-facing version) |
| `build-number` | fail | `CFBundleVersion` must be period-separated integers |
| `encryption-key` | warn | `ITSAppUsesNonExemptEncryption` avoids the export-compliance prompt |
| `privacy-manifest` | warn | `PrivacyInfo.xcprivacy` is expected on iOS 17+ |
| `ipad-orientations` | warn | iPad apps need all four orientations or Apple rejects |
| `icon` | warn | `CFBundleIconName` / `CFBundleIcons` present |
| `min-os` | warn | `MinimumOSVersion` present |

## CI

```yaml
- run: npx @njweber/ipa-check ./build/YourApp.ipa
```

## Sibling

[`store-check`](https://github.com/nwebersoftware/store-check) — the same idea for Android (the
Google Play 16 KB page-size requirement).

More notes: <https://booleanbuild.com>.

## GitHub Action

```yaml
- uses: nwebersoftware/ipa-check@main
  with:
    path: build/YourApp.ipa
    # bundle-id: com.example.yourapp
```

## Follow along

More of this at **https://booleanbuild.com** — the tools hub, plus write-ups on store
rejections, CI, build gates, and shipping TestFlight builds without EAS. New posts land
roughly twice a month. Subscribe: https://booleanbuild.com/#subscribe

## License

MIT.
