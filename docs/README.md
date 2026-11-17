# ModelPing documentation

[Project introduction and usage](../README.md) · [简体中文](./README.zh-CN.md)

The root README covers the product, deployment quick starts (including the Cloudflare one-click button), and everyday usage. This directory contains development, testing, detailed deployment/configuration references, and maintenance.

| Document                                                  | Contents                                                                                      |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [Development and maintenance](./development.md)           | Local setup, project structure, commands, CI, tests and screenshot refresh                    |
| [Deployment, configuration and security](./deployment.md) | Node, Docker, Workers, Vercel, environment variables, storage and public-instance precautions |
| [Credential decoding reference](./credential-decoding.md) | Supported formats, local data handling, input limits and JWT limitations                      |
| [Model catalog integration](./model-catalog.md)           | Runtime availability, snapshot APIs, explicit sync and model-selection behavior               |
| [Model-selection workflow](./model-selection-workflow.md) | Layout and interaction contract for model search and request settings (Chinese)               |
| [Screenshot review](./design-qa.md)                       | Reproducible capture, fixture boundaries and visual-review scope                              |

Public documents are explicitly allowed by `.gitignore`. Local/private development notes are not part of this published documentation set. Source-level styling contracts remain next to the implementation in the [design-system reference](../web/design-system/README.md).
