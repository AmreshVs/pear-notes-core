# Notices

Pear Notes core is source-available under the PolyForm Strict License 1.0.0 (see `LICENSE`). It uses third-party software and, through the apps, downloads on-device AI models, each under its own license.

## On-device AI models

Models are not part of this repository or the app package. When the user turns on an on-device AI feature, the app downloads the model through the QVAC SDK registry (https://qvac.tether.io).

| Model                                       | Used for                                                | License                                                |
| ------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------ |
| Whisper tiny and base                       | Voice typing and transcription, Lite and Standard tiers | MIT                                                    |
| Silero VAD 5.1.2                            | Voice activity detection                                | MIT                                                    |
| NVIDIA Parakeet TDT 0.6B v3                 | Voice typing and transcription, Best tier               | CC-BY-4.0                                              |
| EasyOCR Latin recognizer and CRAFT detector | Extract text                                            | Apache-2.0 (recognizer), MIT (detector)                |
| Qwen3 0.6B, 1.7B, 4B, 8B                    | Summaries, titles, writing tools, Ask                   | Apache-2.0                                             |
| Qwen3.5 0.8B multimodal                     | Describe images; Extract text, Best tier                | Apache-2.0                                             |
| EmbeddingGemma 300M                         | Vault search index                                      | Gemma Terms of Use (https://ai.google.dev/gemma/terms) |
| Bergamot translation models                 | Translate                                               | MPL-2.0                                                |

Parakeet TDT is provided by NVIDIA under CC-BY-4.0. Gemma is provided under and subject to the Gemma Terms of Use; use of EmbeddingGemma must follow the Gemma Prohibited Use Policy (https://ai.google.dev/gemma/prohibited_use_policy).

## Software dependencies

Direct dependencies and their licenses are listed below. Each package, and each of its own dependencies, includes its license in `node_modules/<package>/`.

The Pear and Holepunch runtime (Bare, Autobase, Hypercore, Hyperswarm, HyperDB and related modules) is licensed under Apache-2.0.

| Package                 | Version | License    |
| ----------------------- | ------- | ---------- |
| @reduxjs/toolkit        | 2.12.0  | MIT        |
| autobase                | 7.28.2  | Apache-2.0 |
| b4a                     | 1.9.0   | Apache-2.0 |
| bare-crypto             | 1.15.3  | Apache-2.0 |
| bare-os                 | 3.9.3   | Apache-2.0 |
| blind-encryption-sodium | 3.0.0   | Apache-2.0 |
| blind-pairing           | 2.3.1   | Apache-2.0 |
| clsx                    | 2.1.1   | MIT        |
| compact-encoding        | 3.5.2   | Apache-2.0 |
| corestore               | 7.12.6  | MIT        |
| encryption-encoding     | 1.0.3   | Apache-2.0 |
| flat-tree               | 1.13.0  | MIT        |
| framed-stream           | 1.0.1   | MIT        |
| hrpc                    | 4.3.1   | Apache-2.0 |
| hyperbee                | 2.27.3  | MIT        |
| hypercore               | 11.35.4 | MIT        |
| hypercore-blob-server   | 1.15.0  | Apache-2.0 |
| hypercore-crypto        | 3.6.1   | MIT        |
| hyperdb                 | 6.9.0   | Apache-2.0 |
| hyperdrive              | 13.3.4  | Apache-2.0 |
| hyperschema             | 1.26.2  | Apache-2.0 |
| hyperswarm              | 4.17.2  | MIT        |
| pear-pipe               | 1.0.6   | Apache-2.0 |
| protomux                | 3.10.1  | MIT        |
| protomux-wakeup         | 2.9.0   | Apache-2.0 |
| react-redux             | 9.3.0   | MIT        |
| ready-resource          | 1.2.0   | MIT        |
| redux-saga              | 1.5.1   | MIT        |
| rocksdb-native          | 3.18.1  | Apache-2.0 |
| sodium-universal        | 5.0.1   | MIT        |
| streamx                 | 2.28.1  | MIT        |
| tailwind-merge          | 3.7.0   | MIT        |
