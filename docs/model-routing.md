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

## Three profiles

Execution settings contain Basic, Standard and Advanced profiles. Enable the profiles you need, select a default, and configure each profile's provider, model, reasoning effort and short selection guidance. An enabled profile with empty model fields deliberately inherits the DSH default, captured as an explicit model when a task is accepted. Disabled profiles are never offered to the router. Check model routes before saving; this check makes no model inference request and reports engine authentication as unverified.

Main and IM routers read `personal_agent_model_profiles`. New-task decisions through `personal_agent_route`, `personal_agent_submit` and `personal_agent_eval_decide` accept `model_profile: basic | standard | advanced`. Omission selects the default. Attaching an existing task cannot select a new profile. The selected effective route and the enabled profile definitions are saved with the Ticket before its acknowledgement or dispatch. A concurrent model-settings edit cancels that preflight without creating a task. Repeating acceptance retains the original task and model.

New task Workers take their model from the saved Ticket selection. IM account models apply to conversation routing, not the task Worker; newly created IM dialogue Sessions also resolve image capabilities. Existing Main and dialogue Sessions are not switched. The task page shows the initial model; later manual changes remain visible in the DSH Session's own model selector and event log.

## Upgrade behavior

New task acceptance now requires ModLens to be loaded even when the selected profile uses native vision. The UI, Main history, delivery ledger and already-running native-model Sessions remain available when that dependency is missing. A text-model task whose provider disappears reports an execution error; it never falls back to a different provider or expensive default.

Old executor settings are read as the Standard profile without rewriting stored settings. The legacy `executor.model` is retained for pre-profile Tickets. Tickets that already have a DSH model selection keep it, and older Tickets without a profile continue through the legacy initialization path. No historical messages or task inputs are replayed as new work. `Ticket.modelPlan` is an additive field in the existing JSON record; absent means legacy behavior, and present records are validated before new Session initialization. Existing SQL tables and released DSH Session event definitions are unchanged.

See [ModLens setup](https://github.com/liustack/modlens/blob/main/docs/harness-setup.md) for engine configuration and supported provider discovery.
