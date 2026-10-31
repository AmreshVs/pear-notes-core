# Pear Notes core

`@pear-notes/core` is the shared engine behind Pear Notes for iOS, Android, macOS, Windows and Linux. It holds the encrypted vault, peer-to-peer sync and pairing, the backend that the apps talk to over RPC, and the Redux store both apps share.

The apps are in [pear-notes-mobile](https://github.com/AmreshVs/pear-notes-mobile) and [pear-notes-desktop](https://github.com/AmreshVs/pear-notes-desktop). Website and downloads: https://amreshvs.github.io/pear-notes/

## Source-available, not open source

This repository is published so you can read and audit how Pear Notes stores, encrypts and syncs your notes. It is licensed under the [PolyForm Strict License 1.0.0](LICENSE): you may read and study the code for non-commercial purposes, but you may not modify it, redistribute it, or use it in an app. The name, logo and icon are covered separately by [TRADEMARK.md](TRADEMARK.md).

Pull requests aren't accepted. For security issues, see [SECURITY.md](SECURITY.md).

## How it works

- **Vault.** Each vault is an [Autobase](https://github.com/holepunchto/autobase) with a HyperDB view. Every linked device is a writer. Blocks are encrypted with the vault key, which is stored sealed on disk, unlocked by an entropy value kept in the platform keychain.
- **Sync and pairing.** Devices find each other over [Hyperswarm](https://github.com/holepunchto/hyperswarm) and link with [blind-pairing](https://github.com/holepunchto/blind-pairing) invites that expire. Replication is limited to the vault's current writers, so a removed device stops receiving updates.
- **Attachments.** Files live in a Hyperdrive per vault, encrypted with a key derived from the vault key (vaults created before September 2026 keep their original unencrypted drive). They are served to the app over a loopback server guarded by a per-process secret.
- **Locked notes.** With a lock password set, locked notes and their files are encrypted with keys derived from it (Argon2id, XChaCha20-Poly1305), so other devices without the password can't read them.
- **Backups.** Exports are encrypted with a backup password.
- **Runtime.** The backend runs on [Bare](https://github.com/holepunchto/bare): in a worklet on mobile, and in a sidecar process on desktop. The apps call it over HRPC.

## Layout

| Path       | What it is                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `backend/` | The Bare backend: `NoteBase` (vault, sync, pairing), `notesApi`, the RPC entry point `main.js`, encryption, search and storage |
| `store/`   | The Redux store shared by both apps: slices, sagas, and services (including on-device AI)                                      |
| `spec/`    | HRPC and HyperDB schemas, and the generated encodings                                                                          |
| `types/`   | Generated TypeScript declarations                                                                                              |
| `tests/`   | Brittle tests. Tests that open a vault run on a local DHT testnet                                                              |
| `evals/`   | Evaluation harnesses for the on-device AI prompts. The images are synthetic, drawn from `evals/vision/cases.mjs`               |

## Development

Requires Node 24 and [Bare](https://github.com/holepunchto/bare).

| Command                               | What it does                                                    |
| ------------------------------------- | --------------------------------------------------------------- |
| `npm run test:fast`                   | Pure-logic tests, under a second                                |
| `npm test`                            | The full suite                                                  |
| `npm run test:store`                  | Store tests (Node)                                              |
| `npm run lint`                        | ESLint                                                          |
| `npm run type-check`                  | TypeScript check                                                |
| `npm run schema`, `npm run schema:db` | Regenerate the HRPC and HyperDB encodings after a schema change |

## License

Copyright 2025–2026 Amresh Vs. Licensed under the [PolyForm Strict License 1.0.0](LICENSE). Third-party software and models are listed in [NOTICE.md](NOTICE.md).
