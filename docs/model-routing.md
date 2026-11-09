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

## Child agents

Profile-aware Workers and their descendants receive a task-scoped `personal_agent_delegate` tool. Its default inherits the immediate parent's current effective provider, model and reasoning effort, including an already-selected ModLens route. It reads the active request configuration rather than the model that happened to be the DSH default when the Agent object was constructed. Starting a child still creates an independent conversation; using the same model does not guarantee shared prefix-cache hits.

An explicit `model_profile` selects from the profile definitions saved when the Ticket was accepted. A new child resolves that profile once through the same native/ModLens resolver, while a resumed child keeps its model. Raw provider/model/effort overrides are excluded from the tool schema. Switching to a profile without a reasoning effort clears the parent's route-specific effort. `personal_agent_model_profiles` shows the saved choices; it does not expose unrelated global models.

The adapter delegates lifecycle, depth limits, parent notifications, cancellation and resource cleanup to `ctx.subagents.startActivation` using the native `spawn` provider. Its distinct name avoids colliding with native tools mounted directly in the Worker scope. Profile-aware Workers and descendants deny native `subagent` and `list_subagent_models` calls through a scoped tool guard, directing models to the managed tools. Legacy tasks without a captured model plan retain native delegation. It does not depend on the version-specific model-selection switch of DSH's bundled subagent tool. A durable DSH child-model allowlist on the Session or its ancestors remains an additional restriction on explicit selection. Without that additional list, the task's user-configured profiles are the allowed choices. Ordinary inheritance retains DSH's existing behavior. Stopping the task during preflight prevents publication of a new child.

Fixed system instructions describe inheritance, profile selection and image-read limitations. Profile details are read through tools rather than rewritten into the system prompt on every turn. Existing pre-profile tasks retain their old tool composition.

## Acceptance checks

- Select Basic for a new task and verify its saved effective route in the task page and Worker Session. Change the default to Advanced, append a message and restart the runtime; the existing selection must remain unchanged.
- Start with text, then send an image for the same task. Verify the same Worker handles the follow-up. A native image model reads the attachment directly; a text model's ModLens route converts it to evidence, including attachment images returned by tools.
- Delegate without a profile and verify the immediate parent's provider/model/effort. Explicitly choose another configured profile and verify its independent child Session. Confirm an unconfigured tier and a route forbidden by a DSH allowlist are rejected.
- Disable ModLens or its wrapper and verify affected new work reports a configuration failure without accepting a task, sending its acknowledgement or switching to a different model. Repair the configuration and retry the original candidate.
- Configure the real ModLens vision engine and perform a Feishu image round trip. Automated tests use synthetic vision evidence and do not authenticate a real engine or send messages to a real IM account.

See [ModLens setup](https://github.com/liustack/modlens/blob/main/docs/harness-setup.md) for engine configuration and supported provider discovery.
