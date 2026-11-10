# Screenshot comparison

Evidence class: real Chromium renders of the synthetic fixture. These are not screenshots of an installed plugin or live host. The generated target is `../target.png`; its prompt and content packet are in `../target-brief.md`. The final PNGs are captured at 390 × 844 and 1440 × 900, 1× CSS scale and reduced motion. The capture manifest records readiness and page widths; source hashes bind the files used for capture.

The fixture reads actual package metadata and loads the actual SDK app registration. Its empty list is the real `ThreadInbox` through the SDK app harness with synthetic empty inputs. The surrounding metadata cards and lightning outline are evidence scaffolding, not a product screen or proof of the host's icon rendering.

Both PNGs were opened and inspected after capture. At both widths the WizBar name, OpenWiz attribution, package and namespace match the target packet. No content clips or extends beyond the viewport. Phone heading wraps naturally; desktop cards remain in a centered 720px column. Empty state, 24px title, spacing and dark surfaces remain legible. There are no thread names, identifiers, personal details or machine metadata.

Differences from the concept are deliberate: the existing project picker appears because the actual empty-list component renders it; the target omitted it. The fixture does not hide that control or change the plugin to match the drawing. The preview label explicitly distinguishes fixture evidence from the app. The target's filled lightning graphic is represented by an outline; actual host rendering of canonical `Zap` remains Unverified. The concept's larger text and illustrative column sizes were normalized to the brief's CSS dimensions.

Browser-computed values confirmed system-ui/sans-serif and loaded fonts, primary text #f1f3f5, subdued text #b9c0ca, panel #20242b and control edge #718399. WCAG 2 relative sRGB luminance contrast:

| Pair | Ratio | Fixture result |
| --- | --- | --- |
| Primary / panel | 14.00:1 | Above 4.5:1 text threshold |
| Subdued / panel | 8.49:1 | Above 4.5:1 text threshold |
| Subdued / ground #14161a | 9.88:1 | Above 4.5:1 text threshold |
| Control edge / panel | 4.01:1 | Above 3:1 control threshold |

An earlier fixture edge measured 2.89:1; only its preview control edge was increased before the final capture. This did not edit plugin styling. The card separator stays #616b7a, distinct from the stronger control boundary. No overlay obstructs either screenshot. No new focus or interaction behavior is added. Open menus, native host controls, live host styling, co-installation and activation are Unverified; these screenshots do not replace the existing behavior tests or #9's live acceptance.
