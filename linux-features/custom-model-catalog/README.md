# Custom Model Catalog

This local integration keeps the configured GPT-5.6 relay models visible in
the Codex Desktop model picker. The app server remains the source of model
metadata and availability; this feature only extends the renderer allowlist.

Enable `custom-model-catalog` in `linux-features/features.json`, then rebuild
the generated app. No provider URL or API credential is stored in this
feature.

Run its tests with:

```bash
node --test linux-features/custom-model-catalog/test.js
```
