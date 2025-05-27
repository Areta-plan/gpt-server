# Homerose Project

This repository contains a Node.js server and utilities for collecting training samples and fine-tuning a GPT model.  The main helper is `scripts/watch_and_finetune.js`, which watches the `training_samples/` directory, builds JSONL files, runs a fine‑tune job and synchronizes the results back to GitHub.

## Requirements

- Node.js
- An OpenAI API key (`OPENAI_API_KEY`)
- GitHub credentials for pushing/pulling changes

Install dependencies with:

```bash
npm install
```

Create a `.env` file with at least the following variables:

```bash
OPENAI_API_KEY=your-openai-key
GITHUB_REPO=your-name/your-repo.git
GITHUB_TOKEN=github-personal-token
# Optional overrides
GITHUB_REMOTE=origin
GITHUB_BRANCH=main
```

## Running `watch_and_finetune.js`

The script can be invoked directly:

```bash
node scripts/watch_and_finetune.js
```

It schedules a cron job that pulls from the configured remote every five minutes using `--rebase`:

```javascript
cron.schedule('*/5 * * * *', async () => {
  await git.pull(
    process.env.GITHUB_REMOTE || 'origin',
    process.env.GITHUB_BRANCH || 'master',
    { '--rebase': 'true' }
  );
});
```

The environment variables `GITHUB_TOKEN`, `GITHUB_REMOTE` and `GITHUB_BRANCH` must be set so the auto pull and push steps work correctly.

### Example

```bash
GITHUB_TOKEN=ghp_xxxxxx \
GITHUB_REMOTE=origin \
GITHUB_BRANCH=main \
node scripts/watch_and_finetune.js
```

When running, the watcher rebuilds the JSONL training data, performs a fine‑tune, commits the results and keeps the local repo up to date with `git pull --rebase`.