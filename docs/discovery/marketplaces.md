# Marketplaces for WizBar — WZ22 / #44

Where WizBar v0.3 can be listed, and how. Public sources only, all read on
**2026-11-13**. Publication itself is #45 and needs Jake's go-ahead; nothing here
was submitted, tagged or released.

## BB Marketplace (`get-bb/marketplace`)

Source: the registry's [README](https://github.com/get-bb/marketplace/blob/7e3e12a26f610a539ef41dd25824d2fbff623b0e/README.md),
[v2 schema](https://github.com/get-bb/marketplace/blob/7e3e12a26f610a539ef41dd25824d2fbff623b0e/schema/marketplace-v2.schema.json),
[base file](https://github.com/get-bb/marketplace/blob/7e3e12a26f610a539ef41dd25824d2fbff623b0e/marketplace.base.json),
[build script](https://github.com/get-bb/marketplace/blob/7e3e12a26f610a539ef41dd25824d2fbff623b0e/scripts/build.mjs) and
[validate workflow](https://github.com/get-bb/marketplace/blob/7e3e12a26f610a539ef41dd25824d2fbff623b0e/.github/workflows/validate.yml),
at registry commit `7e3e12a26f610a539ef41dd25824d2fbff623b0e` (2026-11-12).

Submission rules the registry states:

- **Entry file.** Fork the registry and add one `entries/<plugin-id>.json`; the
  file name equals the entry `id`. The `id` must not start with `bb--` or be in
  `reserved-plugin-ids.json`. Required fields: `id`, `displayName`,
  `description`, `icon`, `author`, `source`.
- **Source.** A public Git repository or an npm package. A Git source may set a
  `subdir`, and either a `ref` or a semver `range`; a `range` uses the plugin
  repository's release tags, `<tagPrefix>vX.Y.Z`. A source, name or brand
  change needs a new marketplace pull request.
- **Category.** One primary `category` from `marketplace.base.json`, required
  for new entries, plus up to three `secondaryCategories`. `thread-management`
  is "Find, identify, organize, or archive threads." T3 Sidebar is listed there.
- **Icon.** A named icon (`^[A-Za-z][A-Za-z0-9]*$`) or a local or `getbb.app`
  image.
- **Screenshots.** Up to six, each in `screenshots/<plugin-id>/`, PNG, JPEG or
  WebP, at most 2 MiB, **at least 1200 px wide**. Optional.
- **Overview.** Optional `overview/<plugin-id>.md`, UTF-8, at most 4000
  characters; headings, lists, code and absolute `https` links only, no raw
  HTML, images, tables, footnotes or task lists.
- **Author.** `author.github` identifies the owner for later entry changes; no
  email address.
- **Checks and review.** CI runs `npm ci`, `npm run build` (schema and source
  validation), `npm test`, `npm run gate:v1` and `npm run check`, which also
  checks each remote source: for a `range`, that a `<tagPrefix>vX.Y.Z` tag
  exists. Then **a maintainer reviews the source and the plugin behaviour.**
- **Installs.** BB installs nothing automatically; each user installs and
  updates each plugin.

### WizBar's draft

[`marketplace/wizbar.json`](../../marketplace/wizbar.json) and
[`marketplace/overview/wizbar.md`](../../marketplace/overview/wizbar.md) are
the draft for #45. In the registry they become `entries/wizbar.json` and
`overview/wizbar.md`. The source is this repository, `subdir: wizbar`,
`range: ^0.3.0` and `tagPrefix: wizbar/`, so the release tag #45 makes is
`wizbar/v0.3.0` (the form T3 Sidebar's `t3sidebar/v0.1.0` uses). The draft has
no screenshots; #45 adds the sanitised ones from the live check (#9).

Checked on 2026-11-13 in a scratch clone of the registry at the commit above,
with the two files copied in and committed locally (the build reads the
entry's first commit); nothing was pushed:

| Check | Result |
| --- | --- |
| `npm run build` (v1 and v2 schemas, overview rules) | Pass: 591 entries built; the v2 document holds the overview |
| `npm test` | Pass: 47 of 47 |
| `npm run gate:v1` | Pass: one new entry |
| `npm run check` (remote source) | Not run: no `wizbar/v*` tag exists yet (`git ls-remote` found none). It runs on the entry pull request in #45, after the tag |

## Cloudroom

Sources: [docs](https://www.cloudroom.dev/docs), [FAQ](https://www.cloudroom.dev/docs/faq),
[sitemap](https://www.cloudroom.dev/sitemap.xml), [changelog](https://www.cloudroom.dev/changelog)
and every docs page the sitemap lists, read 2026-11-13.

- **No separate catalog or submission process was found.** No docs page
  describes a plugin catalog, marketplace or submission. The only docs mention
  of plugins is the [Cloud Credits page](https://www.cloudroom.dev/docs/cloud-credits),
  which lists "plugins and skills" among things that use 0 credits.
  `/docs/plugins` and `/marketplace` return 404.
- **The BB Marketplace remains available inside Cloudroom.** Changelog version 41
  (2026-09-23): "BB Marketplace remains available with its original authors
  and attribution."
- So the BB listing is the one known route to both apps.

## Not known

- **Open question for Cloudroom: is there a Cloudroom catalog of its own?** No
  public source says so either way. #45 asks Cloudroom and records the answer.
- Whether a BB Marketplace entry shows and installs inside Cloudroom exactly as
  in the BB app. Changelog version 41 says the marketplace remains available;
  an install from each app is observed in #45.
- Whether the maintainer review accepts the entry. No public source states its
  criteria beyond "the source and the plugin behavior".
- Who is the entry's `author.github`. The draft names the `openwizdev`
  organisation, which owns the source. The registry uses it to identify the
  owner for later changes; whether the pull request must come from that
  account is not stated. #45 settles it with the go-ahead.
- The registry can change before #45. Re-run its checks on the entry pull request.
