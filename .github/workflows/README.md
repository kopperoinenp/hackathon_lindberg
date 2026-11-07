# Code quality workflow

[Code quality](quality.yml) runs on pushes and pull requests. It installs the
locked JavaScript dependencies and pinned Python tooling, then runs `pnpm check`.
The job uses synthetic data and provider fakes for automated checks.

See [Quality checks](../../QUALITY.md) for local setup and individual commands.
