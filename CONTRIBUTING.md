# Contributing to Turingate

Thanks for helping. This repository holds the **open-source client side** of [Turingate](https://reverse-captcha.onrender.com): the `turingate` npm package (CLI, MCP server, pass verification, x402 paywall), the browser widget, the Python and Go verifiers, the no-code integrations, the benchmark harness, and the pass format spec.

The Turingate service itself (challenge generation, scoring, reputation, and billing) is not open source, so pull requests can't change it. If you've found a problem with the hosted service, open an issue and we'll take it from there.

## Ways to help

- **Report a bug:** open an issue with the bug report template.
- **Suggest a feature:** open an issue with the feature request template.
- **Add an integration:** a plugin for a platform we don't cover yet (see `integrations/`).
- **Add a verifier:** a pass verifier in another language that follows [SPEC.md](SPEC.md).
- **Improve the docs:** fix typos, unclear steps, or missing examples.
- **Benchmark an agent:** run `bench/` against your agent and share the results.

## Development setup

You need Node 20 or newer. The npm package has no dependencies.

```bash
git clone https://github.com/rudraneel93/turingate-sdk
cd turingate-sdk/packages/turingate
npm test
```

Other parts of the repo:

| Path | How to test |
|---|---|
| `packages/turingate` | `npm test` |
| `integrations/cloudflare-gate` | `npm test` |
| `verify/python` | `python -m pytest` |
| `verify/go` | `go test ./...` |
| `integrations/wordpress` | Install the plugin on a local WordPress, for example with Docker |

## Pull requests

1. Fork the repo and create a branch from `main`.
2. Keep each change focused, and add or update tests for any behaviour change.
3. **Add no runtime dependencies** to `packages/turingate`; staying dependency-free is a core feature.
4. Make sure all the tests pass.
5. Fill in the pull request template.

## Security issues

Please don't open public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).

## Licence

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE). Everyone taking part must follow the [Code of Conduct](CODE_OF_CONDUCT.md).
