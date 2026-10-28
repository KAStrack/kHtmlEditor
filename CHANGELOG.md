# Changelog

All notable changes to kHtmlEditor are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses semantic
versioning.

## [Unreleased]

### Added
- Project scaffolding: TypeScript, esbuild build, Vitest unit tests, Playwright e2e tests.

### Decisions / assumptions
- Zero runtime dependencies; own schema-driven HTML sanitiser.
- iframe-based editing surface (TinyMCE classic mode); `inline` mode planned post-1.0.
- Global name `kHtmlEditor`; optional `khtmleditor.tinymce-shim.js` aliases `window.tinymce`/`window.tinyMCE`.

### Known issues
- (none yet)
