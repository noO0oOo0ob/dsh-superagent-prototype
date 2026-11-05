# Worker models and ModLens

Super Personal Agent uses ModLens as its image adapter for text-only models. The initial compatibility target is `@liustack/modlens@3.27.2`. Install it with the DSH plugin manager in the same profile as this plugin, enable it, and configure its vision engine in the ModLens plugin settings. Installing an npm dependency alone does not activate a DSH plugin.

Model resolution reads the provider's declared `inputModalities`. Native image models keep their original provider. Text-only models use the corresponding registered ModLens provider with the same model ID and reasoning effort. Unknown capabilities and unavailable routes produce explicit errors; the resolver never chooses another model. The label `(modlens vision)` is a display name, not part of the model ID.

ModLens normally discovers DeepSeek, GLM and MiMo families. To admit other text models, override the existing `modlens` plugin configuration in the active DSH profile rather than inserting another instance:

```yaml
- id: modlens
  config:
    families: ['*']
    discover: ['your-provider-id']
```

Use registered provider IDs in `discover`, preserving other existing configuration. `families: ['*']` requires explicit text-only metadata. The default wrapper ID is `modlens-<provider>`, except `deepseek-official` uses `deepseek-modlens`. An installation with a custom `providerId` must supply that ID to the resolver. The wrapper is validated against the live model registry; naming alone does not establish availability.

The dependency check confirms the native `modlens_read_image` tool is loaded. It does not authenticate the configured vision engine or claim an image was read. Verify the engine separately with a real image in a test conversation before relying on image-dependent results. Image evidence can be incomplete or fail; the Worker must report that limitation instead of guessing.

The resolver returns a serializable original/effective model pair. Task dispatch persists that choice before creating a Worker. Existing Session selections remain authoritative: appending an image, resuming, retrying or changing defaults must not silently replace the model. ModLens converts image blocks at request time, including images inside tool results, while DSH keeps the original attachments in its Session log.

See [ModLens setup](https://github.com/liustack/modlens/blob/main/docs/harness-setup.md) for engine configuration and supported provider discovery.
