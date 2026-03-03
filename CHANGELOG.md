## [0.5.2](https://github.com/Serraniel/Sweetfolio/compare/v0.5.1...v0.5.2) (2026-03-03)


### Bug Fixes

* **changelog:** parse patch version headings in changelog page ([a6acafd](https://github.com/Serraniel/Sweetfolio/commit/a6acafd689460201f5d4a425d3b1d63a152fddf4))
* **ci:** allow self-approved PRs from collaborators in merge queue ([fa6f920](https://github.com/Serraniel/Sweetfolio/commit/fa6f9204898954788be0e7fcf5622205079658a0))
* **ci:** check reviews array directly in merge queue approval check ([0d6d2d5](https://github.com/Serraniel/Sweetfolio/commit/0d6d2d5108ad3f54e5bbb161cfcae5a6f02c13d9))
* **ci:** continue merging remaining PRs when one fails in merge queue ([3eff26e](https://github.com/Serraniel/Sweetfolio/commit/3eff26eafb35fd96b54427afd879f6ce4452f890))
* **ci:** handle bot authors in merge queue review check ([486dcb7](https://github.com/Serraniel/Sweetfolio/commit/486dcb747cc6fd64e3e46d54ed30b5f02eda6bc8))
* **ci:** use GITHUB_TOKEN for dependabot auto-approve workflow ([e1b9cc7](https://github.com/Serraniel/Sweetfolio/commit/e1b9cc7d44bb50cb8f03818220b0602ce4bdf021))
* **deps:** override cookie to 0.7.0 to resolve security advisory ([e05ce75](https://github.com/Serraniel/Sweetfolio/commit/e05ce75599771cde94a8c8b57b770ba87adaa784))
* **release:** deduplicate changelog entries from merge queue commits ([dd5ac67](https://github.com/Serraniel/Sweetfolio/commit/dd5ac678fc9ae1a3d881b72293d0288888bc5e2d)), closes [#N](https://github.com/Serraniel/Sweetfolio/issues/N)


### Chores

* add conventional commit prefixes to dependabot config ([6957237](https://github.com/Serraniel/Sweetfolio/commit/69572377e5a386945ea084cadcace4c6beb24a15))


### Continuous Integration

* add scheduled merge queue retry every 6 hours ([4bcf508](https://github.com/Serraniel/Sweetfolio/commit/4bcf508d11d3a740ecf03c4b230da5a4a2599948))

## [0.5.1](https://github.com/Serraniel/Sweetfolio/compare/v0.5.0...v0.5.1) (2026-03-02)


### Bug Fixes

* **charts:** prevent range init effect from overriding user selection ([b51e204](https://github.com/Serraniel/Sweetfolio/commit/b51e204fb2d720496df5380ba8753f9f94416229))
* **charts:** prevent range init from overriding user 'all' selection ([#36](https://github.com/Serraniel/Sweetfolio/issues/36)) ([f6a6c2a](https://github.com/Serraniel/Sweetfolio/commit/f6a6c2aee37c90dd7fa0ead8453446c440d65050))
* **compare:** use asset slugs instead of GUIDs in compare URLs ([ffd11db](https://github.com/Serraniel/Sweetfolio/commit/ffd11dbc1a3bfe212ccc29142ed1c77792bcf1e1))
* **compare:** use asset slugs instead of GUIDs in compare URLs ([#37](https://github.com/Serraniel/Sweetfolio/issues/37)) ([c63d074](https://github.com/Serraniel/Sweetfolio/commit/c63d074275e875ed347de21f995eb219300d446a))
* resolve version 0.0.0 in npm dev by reading git tags ([#35](https://github.com/Serraniel/Sweetfolio/issues/35)) ([4ca46d8](https://github.com/Serraniel/Sweetfolio/commit/4ca46d878e9438444c25aeb8f8cbb6f2f75686f0))
* resolve version 0.0.0 in npm dev by reading git tags at build time ([d5aa344](https://github.com/Serraniel/Sweetfolio/commit/d5aa344533593048cf6fb7bc127c54945a1ecd51))

# [0.5.0](https://github.com/Serraniel/Sweetfolio/compare/v0.4.0...v0.5.0) (2026-03-01)


### Bug Fixes

* changelog sticky sidebar, version injection, and release note dedup ([c0f2e2a](https://github.com/Serraniel/Sweetfolio/commit/c0f2e2a178944f795e703bd663605570dec171fe))
* changelog sticky sidebar, version injection, and release note dedup ([#29](https://github.com/Serraniel/Sweetfolio/issues/29)) ([a459b1d](https://github.com/Serraniel/Sweetfolio/commit/a459b1d073d2606a14058b2fbba658664dbd65f4)), closes [#N](https://github.com/Serraniel/Sweetfolio/issues/N)
* **charts:** stabilize correlation matrix hover and add click-to-compare ([29a10c9](https://github.com/Serraniel/Sweetfolio/commit/29a10c9cc608f0e792f544916c2b199565b8aa95))
* **charts:** stabilize correlation matrix hover and add click-to-compare ([#27](https://github.com/Serraniel/Sweetfolio/issues/27)) ([6e7b946](https://github.com/Serraniel/Sweetfolio/commit/6e7b9461aa425c1ff4352327d1e300dd5d199c3a))
* **compare:** disable invalid time periods in metrics comparison ([d1e9ad8](https://github.com/Serraniel/Sweetfolio/commit/d1e9ad82e66c58af9f6711041ed693edbd498b1f))
* **compare:** disable invalid time periods in metrics comparison ([#26](https://github.com/Serraniel/Sweetfolio/issues/26)) ([48ded3e](https://github.com/Serraniel/Sweetfolio/commit/48ded3e5fdce04eac99461cd4252607ecb6eb031))


### Features

* **nav:** reorder navigation and nest Compare under Assets ([0b4f4ca](https://github.com/Serraniel/Sweetfolio/commit/0b4f4caea3430502c5919de1cdac1b2d2da1ccb5))
* **nav:** reorder navigation and nest Compare under Assets ([#28](https://github.com/Serraniel/Sweetfolio/issues/28)) ([3fa8acb](https://github.com/Serraniel/Sweetfolio/commit/3fa8acb6e9989c82166ff066464bff768457bdb0))

# [0.4.0](https://github.com/Serraniel/Sweetfolio/compare/v0.3.1...v0.4.0) (2026-03-01)


### Bug Fixes

* **io:** resolve export memory explosion and main thread blocking ([4bad956](https://github.com/Serraniel/Sweetfolio/commit/4bad9560794ed3a6abf08aa5a084cc0721566a1b))
* **io:** resolve type errors in migrations and import wizard ([6ab8f87](https://github.com/Serraniel/Sweetfolio/commit/6ab8f876afae4f7225ea59522240890b34537dac))
* **io:** stream export from IndexedDB one record at a time ([c95ef65](https://github.com/Serraniel/Sweetfolio/commit/c95ef652bc7b81bf97c5dfed9902e8acf0fff6f9))
* **io:** strip bulky data and serialize scope-by-scope for lean export ([8ba431c](https://github.com/Serraniel/Sweetfolio/commit/8ba431c8d025f887a752e35f6e1b821ad19fbce4))
* **io:** unwrap Svelte 5 proxies before IndexedDB writes and skip identical conflicts ([92d5fc3](https://github.com/Serraniel/Sweetfolio/commit/92d5fc3e0460a961e497cc113882af89a34d56bc))
* **io:** use single footer snippet in ImportWizard for reliable rendering ([b6c4260](https://github.com/Serraniel/Sweetfolio/commit/b6c4260ce87df334c4e10603f1fb5095a29398c0)), closes [#snippet](https://github.com/Serraniel/Sweetfolio/issues/snippet)
* **io:** zero-accumulation export with File System Access API fallback ([c8f4823](https://github.com/Serraniel/Sweetfolio/commit/c8f4823fb067eaba319cef6557158591604d24c0))
* **simulation:** show currency warning icon regardless of selection ([bd1df36](https://github.com/Serraniel/Sweetfolio/commit/bd1df36ba75237d32361c839259bf45734b1e038))
* **test:** use distinct data in currency conflict test ([3e7bf9f](https://github.com/Serraniel/Sweetfolio/commit/3e7bf9faa8d805132b5eecebc34d34ca619bb58c))


### Features

* add cross-rate derivation and rate merging utilities ([460c007](https://github.com/Serraniel/Sweetfolio/commit/460c007c6be3149144d7bc017a3f22abb9874a72))
* add crypto ticker support to asset identifier lookup ([#13](https://github.com/Serraniel/Sweetfolio/issues/13)) ([a8ee1ab](https://github.com/Serraniel/Sweetfolio/commit/a8ee1ab43e687b825fb6e2529ba2399194568d88))
* add currency auto-fetch store with ECB integration ([2817797](https://github.com/Serraniel/Sweetfolio/commit/28177974d6ca232bc92a360b5f70a464950e869e))
* add CurrencyFetchToast component for exchange rate progress ([bc4f76c](https://github.com/Serraniel/Sweetfolio/commit/bc4f76c72efa621ec6213811f739e816e677e8f4))
* add hint about automatic ECB currency fetching in settings ([45e4f28](https://github.com/Serraniel/Sweetfolio/commit/45e4f28a01d1e6cacfe9b977aa4adcdc317ec133))
* **assets:** add crypto ticker support to identifier lookup UI ([b5e35cf](https://github.com/Serraniel/Sweetfolio/commit/b5e35cf1d070cae08acf2561c267bb4a1d137e00))
* auto-fetch currency exchange rates from ECB ([#15](https://github.com/Serraniel/Sweetfolio/issues/15)) ([b8d3fae](https://github.com/Serraniel/Sweetfolio/commit/b8d3fae69f1ace3a317f880d6bb0b764b6ba3dea))
* **crypto:** use Onvista as primary crypto data source with CoinGecko fallback ([b09d90a](https://github.com/Serraniel/Sweetfolio/commit/b09d90a84ed8e976510daee4e5358dde52671a9a))
* **fetchers:** add CoinGecko fetcher for crypto price data ([04f41c5](https://github.com/Serraniel/Sweetfolio/commit/04f41c5ee77fb89c84a09be6008140b80b9d26ad))
* **io:** add barrel export ([9866811](https://github.com/Serraniel/Sweetfolio/commit/9866811b53839a05155eb6da853c4bcf9b4e8bed))
* **io:** add conflict detection for import ([d59db61](https://github.com/Serraniel/Sweetfolio/commit/d59db6140d48fb4c83d41207cac96033bcf692c9))
* **io:** add data import/export with streaming export ([#14](https://github.com/Serraniel/Sweetfolio/issues/14)) ([f95f226](https://github.com/Serraniel/Sweetfolio/commit/f95f226f593733e5f7563c5a3e88429556253e8e))
* **io:** add export builder ([2e74913](https://github.com/Serraniel/Sweetfolio/commit/2e7491354661e896de5f71e7b7334a6c554e0ee7))
* **io:** add export modal component ([f69411a](https://github.com/Serraniel/Sweetfolio/commit/f69411ab2a62905e4be8ab643d640c6b5478f4ec))
* **io:** add export schema types and validation ([f48b657](https://github.com/Serraniel/Sweetfolio/commit/f48b657b417bef90c53ce1a17dc0e720296cb751))
* **io:** add file download helper ([15b333d](https://github.com/Serraniel/Sweetfolio/commit/15b333dda99a4c6eed0e40b3860666490edd447e))
* **io:** add import apply logic with conflict resolution ([5df9913](https://github.com/Serraniel/Sweetfolio/commit/5df9913d86a779af334dc3bb3c8f304cdef70aad))
* **io:** add import file parser with validation and migration ([8836292](https://github.com/Serraniel/Sweetfolio/commit/883629214e9d949a562c13b885622b02d5def8d9))
* **io:** add import wizard with scope selection and conflict resolution ([0b4de78](https://github.com/Serraniel/Sweetfolio/commit/0b4de78ac70d11f9c313359f6c75f36e6a078d5d))
* **io:** add version migration system ([d9e97ae](https://github.com/Serraniel/Sweetfolio/commit/d9e97aefd196f9408ba6121a1305d25738ef8fc6))
* **io:** bump export schema to v2 with classification migration ([0eb811e](https://github.com/Serraniel/Sweetfolio/commit/0eb811ef1cae9026e6410bdf849de4147206f947))
* **io:** wire import/export into settings page ([6e83f44](https://github.com/Serraniel/Sweetfolio/commit/6e83f442484030e5b443c413e691926cb481ef4c))
* **scraper:** add fetchByTicker for crypto ticker lookup ([65222e8](https://github.com/Serraniel/Sweetfolio/commit/65222e89e2edd22f15792bab5f1862c5668cf003))
* **scraper:** add validateTicker for crypto ticker detection ([c52c39b](https://github.com/Serraniel/Sweetfolio/commit/c52c39bbb40c7be1fa0d225a975e3673f822bb24))
* **simulation:** convert asset prices to preferred currency ([6e7bf35](https://github.com/Serraniel/Sweetfolio/commit/6e7bf3529b47d7aabf43023897276025fb6e43b3))
* wire up auto currency fetch triggers (startup, settings, refresh, import) ([fb97db1](https://github.com/Serraniel/Sweetfolio/commit/fb97db19076975fecef77578dc5069e3d52a0177))

## [0.3.1](https://github.com/Serraniel/Sweetfolio/compare/v0.3.0...v0.3.1) (2026-03-01)


### Bug Fixes

* **ci:** prevent merge queue comment feedback loop ([eb78414](https://github.com/Serraniel/Sweetfolio/commit/eb78414f45c0bcfbca786d5c658d7c300bba40a0))
* **ci:** prevent merge queue comment feedback loop ([#25](https://github.com/Serraniel/Sweetfolio/issues/25)) ([9692f4d](https://github.com/Serraniel/Sweetfolio/commit/9692f4d9b7036938a43705cedc15f0443604de88))

# [0.3.0](https://github.com/Serraniel/Sweetfolio/compare/v0.2.0...v0.3.0) (2026-03-01)


### Bug Fixes

* **changelog:** show version headings and add per-release sections ([1cad6bf](https://github.com/Serraniel/Sweetfolio/commit/1cad6bff4fcae1a486af82c062066f8f145ee201))
* **changelog:** show version headings and split into per-release cards ([#10](https://github.com/Serraniel/Sweetfolio/issues/10)) ([dd5f458](https://github.com/Serraniel/Sweetfolio/commit/dd5f45816c3d2aeee6792267d5c96512604d6a94))
* **charts:** prevent tooltip text from overflowing its container ([52ea681](https://github.com/Serraniel/Sweetfolio/commit/52ea681072e892e403e0d1764a3571b97720d655))
* **docker:** inject release version via build arg ([18f8c2a](https://github.com/Serraniel/Sweetfolio/commit/18f8c2af15a898ac1b29a159edbf4b9200cf9b8f))
* **docker:** inject release version via build arg ([#9](https://github.com/Serraniel/Sweetfolio/issues/9)) ([dabb04c](https://github.com/Serraniel/Sweetfolio/commit/dabb04cb283775bba217e954f1594d4a35d0ed37))
* **e2e:** update comparison tests to use IndexedDB version 2 ([7a69f33](https://github.com/Serraniel/Sweetfolio/commit/7a69f3347139210d30510dbbd72a8ac02c721dcb))
* Monte Carlo zero-allocation bug + UX enhancements ([#21](https://github.com/Serraniel/Sweetfolio/issues/21)) ([8c815ff](https://github.com/Serraniel/Sweetfolio/commit/8c815ff3746c21ab548738e872e445760d378ade))
* **settings:** constrain benchmark dropdown width and hide number spinners ([0f3117d](https://github.com/Serraniel/Sweetfolio/commit/0f3117da2242b5fb38cd6493d3e463929fea07e8))
* **settings:** use text input with numeric validation for risk-free rate ([127fb28](https://github.com/Serraniel/Sweetfolio/commit/127fb2850574999d68e7ebd1296bd03d4224d822))
* **sharing:** add visual feedback to copy-to-clipboard button ([ddcaa53](https://github.com/Serraniel/Sweetfolio/commit/ddcaa53a5f4cac3542088ddc9150f6c01a3cd523))
* **simulation:** exclude 0% allocation assets when saving as portfolio ([b6071fc](https://github.com/Serraniel/Sweetfolio/commit/b6071fc8c4aa28a018a758b001bc6fbbccb8c810))
* **ui:** ensure Metric column header stays left-aligned ([2beef76](https://github.com/Serraniel/Sweetfolio/commit/2beef7628a7f05b35f477c55250072deb9d2d912))
* **ui:** right-align period column headers in metrics table ([e28d37f](https://github.com/Serraniel/Sweetfolio/commit/e28d37fa5fa07f4017b7d4d6435e3397d8789d15))


### Features

* add asset comparison view with metrics table, charts, and add/remove controls ([76686b0](https://github.com/Serraniel/Sweetfolio/commit/76686b084e697c33918986f3f9e9aadd0f457c4b))
* add asset comparison view with metrics table, charts, and add/remove controls ([#12](https://github.com/Serraniel/Sweetfolio/issues/12)) ([d4bb791](https://github.com/Serraniel/Sweetfolio/commit/d4bb79153b960e2fc79cc966d7ac9fb6a7ca1dea))
* add Playwright screenshot & video capture for comparison feature demo ([4148545](https://github.com/Serraniel/Sweetfolio/commit/41485458c0b17024b2524c5c4ca031e4c081d9ee))
* **charts:** default price chart to MAX range when available ([53e7f4a](https://github.com/Serraniel/Sweetfolio/commit/53e7f4a8c90cc5deb334546bbdd16f86b8634c1c))
* **migration:** strip zero-weight allocations from existing portfolios ([d453d5b](https://github.com/Serraniel/Sweetfolio/commit/d453d5b25cedbed76c43f6cc765ccc3789b2ca36))
* **sharing:** add per-asset share button, share icons, and Web Share API ([ce2dcfd](https://github.com/Serraniel/Sweetfolio/commit/ce2dcfddebf60143b32bb24b7ebca78ee45e8d0b))
* **sharing:** add URL-based portfolio and asset sharing ([a515b95](https://github.com/Serraniel/Sweetfolio/commit/a515b95df406885ee32ce68544029200879cf06a))
* **sharing:** split button with copy-to-clipboard and OS share ([e258507](https://github.com/Serraniel/Sweetfolio/commit/e2585071e8fe63ec51bbe9be0aea48e56427ae92))
* **simulation:** add Open link after saving simulation as portfolio ([f23bbad](https://github.com/Serraniel/Sweetfolio/commit/f23bbad24a13e5e6bf13fa30716e7ae7271f9c4f))
* **ui:** add info tooltips to financial metrics table ([9a2a31c](https://github.com/Serraniel/Sweetfolio/commit/9a2a31c062b05b82acb877c2dabb72dadfb00b96))
* **ui:** improve allocation chart UX ([f65ba87](https://github.com/Serraniel/Sweetfolio/commit/f65ba87fad6dca5f5971f7d08756e92b3299acfe))
* URL-based sharing for portfolios and assets ([#17](https://github.com/Serraniel/Sweetfolio/issues/17)) ([b9c1b8b](https://github.com/Serraniel/Sweetfolio/commit/b9c1b8bf59daf6b03ac4f7126c7e932e7493a7a5))


### Reverts

* remove demo screenshots from repository ([6ae4cc7](https://github.com/Serraniel/Sweetfolio/commit/6ae4cc78322313a9864a19e50f4235154be58223))

# [0.2.0](https://github.com/Serraniel/Sweetfolio/compare/v0.1.0...v0.2.0) (2026-03-01)


### Features

* **ci:** add DIY merge queue via GitHub Actions ([fcc1cdd](https://github.com/Serraniel/Sweetfolio/commit/fcc1cddcac11421ec49f695f3658b742b5334392))

# [0.1.0](https://github.com/Serraniel/Sweetfolio/compare/v0.0.0...v0.1.0) (2026-03-01)


### Bug Fixes

* add focus-visible style and localStorage error handling to LocalStorageHint ([c5d88ae](https://github.com/Serraniel/Sweetfolio/commit/c5d88aeaa84a6184307f090cac28f4e1159a5fe8))
* address code review findings across codebase ([8bf74ed](https://github.com/Serraniel/Sweetfolio/commit/8bf74eda0058e99a23f668cecfe970149955b522))
* address code review findings for asset classification ([32ae216](https://github.com/Serraniel/Sweetfolio/commit/32ae21647d1f578accf8bd7223b9d9d1900bcbbe))
* **assets:** capture identifier at fetch time and add try/finally ([8bacf9c](https://github.com/Serraniel/Sweetfolio/commit/8bacf9cfab894dd01cab853e62432b825245d474))
* **assets:** handle missing classification on legacy assets ([bd86699](https://github.com/Serraniel/Sweetfolio/commit/bd86699b0b5bb85418d3c948b409782098c46122))
* **assets:** unwrap Svelte 5 proxy before IndexedDB storage ([53bdfad](https://github.com/Serraniel/Sweetfolio/commit/53bdfad23e7f8cc35b8b35f0142753f61d2c824d))
* benchmark legend, light-mode outline, inspector UX improvements ([27eddb0](https://github.com/Serraniel/Sweetfolio/commit/27eddb0691211d6b590a34cf9af0253a2adb11c4))
* **charts:** format large percentages with compact suffixes on y-axis ([f9ab3f4](https://github.com/Serraniel/Sweetfolio/commit/f9ab3f46f054bad5ff7db7d56a7a5b0a8f74e680))
* **charts:** handle single-asset donut chart rendering ([ca8d212](https://github.com/Serraniel/Sweetfolio/commit/ca8d2121428a468feb752980819fb3a190dd17ad))
* **charts:** stabilize legend by disabling live value updates on hover ([0f987fc](https://github.com/Serraniel/Sweetfolio/commit/0f987fcc970f501146b3ed38a109e1d1d40e47cb))
* **charts:** use WCAG luminance-based text color in correlation heatmap ([47a26b6](https://github.com/Serraniel/Sweetfolio/commit/47a26b60c3db496e2e9ec5170129ce34063d1675))
* **db:** prevent concurrent IndexedDB open requests during init ([86f48aa](https://github.com/Serraniel/Sweetfolio/commit/86f48aab852afeaf863c8af58842ebe9aef4f4c8))
* draw frontier line behind dots so dots overlap the line ([f56380d](https://github.com/Serraniel/Sweetfolio/commit/f56380df33ee553a1df135e66d9f7847a2fce7a0))
* **footer:** serve license locally instead of linking to repository ([3ca477e](https://github.com/Serraniel/Sweetfolio/commit/3ca477e7e23e9c04fb22a6edb8be2d10b7ec847f))
* **footer:** show version always, add dot separators and license link ([2a4248c](https://github.com/Serraniel/Sweetfolio/commit/2a4248c4651ef153f1f29015d1047d92d5cfd146))
* guard against division by zero in maxDrawdown when peak is 0 ([a6cb6be](https://github.com/Serraniel/Sweetfolio/commit/a6cb6be40a31626d53b0e494150487984e323032))
* handle large simulations (500k+) without crashing ([811756d](https://github.com/Serraniel/Sweetfolio/commit/811756dfadabe56e2b42ea2dd002d0f0ac566d3c))
* handle multi-file CSV drag-and-drop by processing all files sequentially ([bbc80d0](https://github.com/Serraniel/Sweetfolio/commit/bbc80d0dc547481fddd2c4c5843c25028962ddd0))
* improve Monte Carlo simulation accuracy and add data quality warnings ([ae29e60](https://github.com/Serraniel/Sweetfolio/commit/ae29e6086309fc290d5b16ec42bd9c8565bdef5a))
* improve scatter chart UX with distinct asset colors and click fix ([4ab3964](https://github.com/Serraniel/Sweetfolio/commit/4ab39646ae447658dd89c5fa96217a26661bdb66))
* load currencies during app init, remove redundant onMount call ([3a1e493](https://github.com/Serraniel/Sweetfolio/commit/3a1e493778b7aaf93076b576257bc67d27d09c6b))
* **onvista:** update API response parsing for search and snapshot endpoints ([c2a2a76](https://github.com/Serraniel/Sweetfolio/commit/c2a2a767ffda541f41a91219c95d7bd6c0804c66))
* **onvista:** use raw entityType for chart history URL path ([aacd6e9](https://github.com/Serraniel/Sweetfolio/commit/aacd6e9ef4d2d32baa8d0eeb4a3af4695eec4e7c))
* **parser:** German thousand-separated integers misdetected as dot-decimal ([8fd0210](https://github.com/Serraniel/Sweetfolio/commit/8fd0210a5953db395244d791b74b77ed81a3d8da))
* prevent Math.log(0) = -Infinity in Monte Carlo weight generation ([c44453f](https://github.com/Serraniel/Sweetfolio/commit/c44453f97c290c99f2f400f76880bca4a5f6fc5d))
* resolve type narrowing issue in dashboard correlation labels ([9fc3f60](https://github.com/Serraniel/Sweetfolio/commit/9fc3f605e7553b78b80921bca9edb9b8a548aee9))
* revert SVG to simple format for image viewer compatibility ([1612e78](https://github.com/Serraniel/Sweetfolio/commit/1612e787a3ba58cd36a2b49ee98ce55b4b47e164))
* **simulation:** show rendering indicator until chart actually paints ([cf0b8b0](https://github.com/Serraniel/Sweetfolio/commit/cf0b8b063ae06989c1f405325af954b2741fcfa3))
* skip non-positive prices with warnings instead of inserting silent 0 ([d7223c8](https://github.com/Serraniel/Sweetfolio/commit/d7223c85fbe5e58bc4667abaafd7c495fe8c3d9a))
* skip weekends in forwardFillPrices to avoid inflating data points ([c26b8ad](https://github.com/Serraniel/Sweetfolio/commit/c26b8adf3efcef6efd2473835e851bffa1d281a5))
* **storage:** reopen IndexedDB when cached instance has stale version ([e0381a8](https://github.com/Serraniel/Sweetfolio/commit/e0381a8a6181b374c10128b6e2c7fa2e497b8dc8))
* **tests:** add classification field to test fixtures ([5230cd4](https://github.com/Serraniel/Sweetfolio/commit/5230cd43c29e8f187ae5114789381f9c06b682c1))
* **tests:** resolve type errors in migration runner tests ([39b1562](https://github.com/Serraniel/Sweetfolio/commit/39b15620ba9f511d46e558e99bff69b458099839))
* use sample statistics (N-1) by default for variance, stddev, covariance ([29faec1](https://github.com/Serraniel/Sweetfolio/commit/29faec1e557d8b4ea597c02637ae0552195a7a8b))
* use trading days (252) for annualized return to match volatility ([972c30a](https://github.com/Serraniel/Sweetfolio/commit/972c30a6a3fbdc6b3d5c97e57086fbf75b791f14))


### Features

* add asset metadata editing UI (ISIN, WKN, name, currency) ([a427458](https://github.com/Serraniel/Sweetfolio/commit/a427458a4e2825785382e7a664b3a3e5ac9b82c3))
* add auto-import mode that skips modal for confident CSV formats ([d35087d](https://github.com/Serraniel/Sweetfolio/commit/d35087d71c65b8d98791834da385157bef7aab85))
* add auto-refresh store with staleness detection ([d0e3d4a](https://github.com/Serraniel/Sweetfolio/commit/d0e3d4a57b764357fb0751e87faa2fc0e9b56ca6))
* add auto-refresh toggle to settings page ([9ca3574](https://github.com/Serraniel/Sweetfolio/commit/9ca3574a68e67cea03aa6fe2c77cc215daf1815a))
* add conflict resolution modal for price data conflicts ([4217d00](https://github.com/Serraniel/Sweetfolio/commit/4217d00a0385a3166f599a47d28e23a8c7079bb1))
* add correlation matrix to dashboard ([a7fc42c](https://github.com/Serraniel/Sweetfolio/commit/a7fc42ce3f9fe7ba8ab305c9c17b8f6bc929fe8f))
* add currency pair upload UI in settings ([77641a0](https://github.com/Serraniel/Sweetfolio/commit/77641a0847517c7d41a9b5d89a5863931a0a5787))
* add data source and import settings to settings page ([dffb1fb](https://github.com/Serraniel/Sweetfolio/commit/dffb1fb241e7be245f17da709fc3540eac52c46e))
* add ECB exchange rate fetcher ([18e4f00](https://github.com/Serraniel/Sweetfolio/commit/18e4f007122350e0a077d921be6f63139e1aa6eb))
* add footer with GitHub link and build-time version ([420d3a6](https://github.com/Serraniel/Sweetfolio/commit/420d3a661828248eb56dbd8f7dcea7d1d926f1cf))
* add in-app changelog page with footer link ([f3dcaeb](https://github.com/Serraniel/Sweetfolio/commit/f3dcaeb70ce20657a336c081c11b7151c30ef3e5))
* add lastRefreshedAt field to Asset type ([553dfed](https://github.com/Serraniel/Sweetfolio/commit/553dfedf6808b71424146af861fcdc1ca4f70442))
* add license compliance check and third-party notices page ([5e99ff3](https://github.com/Serraniel/Sweetfolio/commit/5e99ff3a7db8a8d9821e9fa1a846393fecec62e4))
* add LocalStorageHint dismissable banner component ([3044904](https://github.com/Serraniel/Sweetfolio/commit/304490476d9ab5b8942c38a76c1ee845325ddadb))
* add Onvista fetcher for ISIN/WKN price data lookup ([0e54362](https://github.com/Serraniel/Sweetfolio/commit/0e54362e34ddabd2fda6c31981fe4119b69abed3))
* add portfolio editing UI and enhanced detail page ([0bd9881](https://github.com/Serraniel/Sweetfolio/commit/0bd988175cf9da66000cccfe67c65f0b1fe5f0e3))
* add price merge utility with conflict detection ([f3b2668](https://github.com/Serraniel/Sweetfolio/commit/f3b266899d6f10fbf439bff3eee299a5e27541b5))
* add Save as Portfolio button in Monte Carlo inspector ([0d45f9d](https://github.com/Serraniel/Sweetfolio/commit/0d45f9dca856932c30f3475bdd84c3202b15f95b))
* add Sweetfolio product logo with flowing twin-tail strands and pink S-curve ([bee448e](https://github.com/Serraniel/Sweetfolio/commit/bee448e5293b7e336a893c50743566f0842bc730))
* **alphavantage:** add Alpha Vantage price data fetcher ([b4b624f](https://github.com/Serraniel/Sweetfolio/commit/b4b624f4e2d52e7a9e2a6703e31dc0be5846dc89))
* **asset-detail:** add classification to edit modal ([4ffcae3](https://github.com/Serraniel/Sweetfolio/commit/4ffcae31cbf361cbde30d8a205f1c9f16fd2baed))
* **assets:** add classification badges and filter to asset list ([aa6dc7d](https://github.com/Serraniel/Sweetfolio/commit/aa6dc7d6d47294bf8ddfe145a0db5c91c5f1c50d))
* **assets:** add identifier lookup UI for ISIN/WKN fetch ([e10be17](https://github.com/Serraniel/Sweetfolio/commit/e10be17e214665d561354805d6401da3ebc9cccd))
* **assets:** add Price Data section with table, pagination, inline edit, and re-parse ([f4ee034](https://github.com/Serraniel/Sweetfolio/commit/f4ee0340269fa78e23388765337ea341a64be21f))
* **assets:** include classification when creating assets ([c73a0ee](https://github.com/Serraniel/Sweetfolio/commit/c73a0ee335cc086a80a1946d9ea314e7637c4c2d))
* **assets:** store raw CSV text at import time for re-parsing ([81b0f76](https://github.com/Serraniel/Sweetfolio/commit/81b0f76262f6f0c8a4ac46d391ff0d6cafdb1850))
* auto-resolve asset names from ISIN/WKN in filenames ([9a77ef8](https://github.com/Serraniel/Sweetfolio/commit/9a77ef85ba710f9e0e40edb505f2b4dac4650ba5))
* **charts:** add chart components with uPlot ([0a51452](https://github.com/Serraniel/Sweetfolio/commit/0a51452c15e2de045b72d4ce964341d6ccb0fcdd))
* **charts:** add empty state handling, responsive sizing, and missing CSS variable ([0ab83de](https://github.com/Serraniel/Sweetfolio/commit/0ab83de62dc54597ce771010b7ec2f5b2fbee649))
* **charts:** enhance time range filters with smart disabling and new options ([09d947c](https://github.com/Serraniel/Sweetfolio/commit/09d947c8f7f7a9aa0075c78614d446463af55276))
* **charts:** merge Price History and Performance into unified chart ([3264503](https://github.com/Serraniel/Sweetfolio/commit/3264503df581ed02d38408fe63e09d77547b1609))
* **db:** migrate to v3 with classification field and index ([63b65c9](https://github.com/Serraniel/Sweetfolio/commit/63b65c94bad0fde6a8558baba45c9d2a384034da))
* **fetchers:** map Onvista entity types to asset classification ([b13c877](https://github.com/Serraniel/Sweetfolio/commit/b13c877e7ad7fbf6c3e0f89bbaceb91f96fb7526))
* **fetchers:** return classification from Onvista data source ([c3356ea](https://github.com/Serraniel/Sweetfolio/commit/c3356eaa7087ddfe0f7fa7f73d35031283efa083))
* implement full UI layer with theming, layout, and all pages ([9ca15ad](https://github.com/Serraniel/Sweetfolio/commit/9ca15ad8fd036347749ccc3db1d2b23498103b02))
* implement global benchmark feature with UI across all pages ([a5dccc7](https://github.com/Serraniel/Sweetfolio/commit/a5dccc76d89e78a0e93edf81c562779d6fc7fe72))
* **import:** add classification dropdown to CSV import modal ([7d5d0fa](https://github.com/Serraniel/Sweetfolio/commit/7d5d0fa70bb6cd4f2dcc202181c72ffffb9f5359))
* integrate local storage hint into shell layout ([bb069bb](https://github.com/Serraniel/Sweetfolio/commit/bb069bbcb3b555768cbc4b6c21d7f61439eeeeba))
* **license:** embed license as in-app page instead of static file ([d641a97](https://github.com/Serraniel/Sweetfolio/commit/d641a97c6d5962fd943173eda1d91c96d2ac1161))
* **migrations:** add classify-assets-v1 migration ([c09438b](https://github.com/Serraniel/Sweetfolio/commit/c09438bca3b4b9be3b5ae840a1d0e458cbe71e3c))
* **migrations:** add migration runner with registry and progress store ([7c02a79](https://github.com/Serraniel/Sweetfolio/commit/7c02a796884c7f924fb349fd2921e28a43ea6b30))
* **migrations:** add MigrationToast component with progress bar ([19fd215](https://github.com/Serraniel/Sweetfolio/commit/19fd21589c9a907d4b29f8b189d68e3cb3aefd45))
* **migrations:** wire up migration runner and toast in app init ([4d15ac7](https://github.com/Serraniel/Sweetfolio/commit/4d15ac786dd6f9bca8e4f434806f8bcaa5e12e44))
* **portfolios:** make allocation percentage an editable input ([bd24209](https://github.com/Serraniel/Sweetfolio/commit/bd242096fd1ca99d2bd4e544c791241856df35a7))
* **scraper:** pass through classification from data sources ([eedfd73](https://github.com/Serraniel/Sweetfolio/commit/eedfd739b497bc18841ba5149b348260c712d082))
* **scraper:** register Alpha Vantage as fallback data source ([93714ad](https://github.com/Serraniel/Sweetfolio/commit/93714ad7100dd93fc619fffd884f5d4d97b2d94c))
* **settings:** add data source dropdown, API key hints, and test connection ([67cdfac](https://github.com/Serraniel/Sweetfolio/commit/67cdfac3779239b240d03b935c7262eec2943b0d))
* **simulation:** add hover interactions for asset markers in scatter chart ([0ab88fc](https://github.com/Serraniel/Sweetfolio/commit/0ab88fc6a48a35748297fd6e9784e637cedf6e64))
* **types:** add AssetClassification type to Asset interface ([df6f9ac](https://github.com/Serraniel/Sweetfolio/commit/df6f9ac7dab699b9de20ff6fbaf3b68151da9574))
* wire auto-refresh into startup and add progress toast ([80d3137](https://github.com/Serraniel/Sweetfolio/commit/80d31377500424119570b65bd29b1789ec711b44))
* wire currency conversion into calc worker, add rebalancing engine, create scraper stub ([a178e87](https://github.com/Serraniel/Sweetfolio/commit/a178e875824310d03e282617a0b859fb5cad0516))
* wire MVP — connect all pages to stores, workers, and IndexedDB ([2fc14fe](https://github.com/Serraniel/Sweetfolio/commit/2fc14fe5a42daf2df4475dc299f6d02e11cc253b))


### Performance Improvements

* **charts:** batch scatter dots into single canvas path ([6ce307b](https://github.com/Serraniel/Sweetfolio/commit/6ce307b5271fd64eee18de3312bff9802eef47c0))
* **simulation:** use Transferable typed arrays for zero-copy worker transfer ([ee3cbd4](https://github.com/Serraniel/Sweetfolio/commit/ee3cbd413a95e40e461d7f66e31ab403e8bd9990))

# Changelog

All notable changes to this project will be automatically documented here by [semantic-release](https://github.com/semantic-release/semantic-release).
