export const IM_STYLE_ID = 'spa-native-im-settings';

const CSS = String.raw`
.spa-im-conversationDirectorySettings { max-width: 720px; }
.spa-im-conversationDirectoryForm { margin: 18px 0; padding: 16px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; }
.spa-im-conversationDirectoryForm h3 { margin: 0 0 12px; font-size: 15px; }
.spa-im-conversationDirectoryField { display: flex; align-items: center; gap: 12px; margin: 12px 0; font-size: 13px; }
.spa-im-conversationDirectoryField > span { min-width: 72px; }
.spa-im-conversationDirectoryField input, .spa-im-conversationDirectoryField select { max-width: 100%; min-width: 0; padding: 7px 9px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 6px; font: inherit; color: inherit; background: var(--dsw-alias-bg-layer-1, #fff); }
.spa-im-sidebarIcon { display: block; flex: none; }
.spa-im-pluginOpen { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; padding: 7px 14px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 13px; line-height: 20px; cursor: pointer; }
.spa-im-pluginOpen:hover { background: var(--dsw-alias-interactive-bg-hover, #f7f8fa); }
.spa-im-pluginOpen:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #3370ff); outline-offset: 3px; }
.spa-im-pluginPage { height: 100%; min-height: 0; overflow: auto; box-sizing: border-box; padding: 24px clamp(16px, 4vw, 48px) 32px; color: var(--dsw-alias-label-primary, #1f2329); }
.spa-im-pluginPageContent { max-width: 1080px; margin: 0 auto; }
@media (pointer: coarse) { .spa-im-pluginOpen { min-height: 44px; } }
.spa-im-connectionDiagnostic { min-width: 0; width: 100%; color: var(--dsw-alias-label-secondary, #646a73); overflow-wrap: anywhere; font-size: 13px; line-height: 1.6; }
.spa-im-connectionDiagnostic[data-warning="true"] { color: var(--dsw-alias-state-warn-primary, #d97706); }
.spa-im-connectionDiagnostic p { margin: 4px 0; }
.spa-im-connectionDiagnostic button { border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 6px; padding: 6px 10px; color: inherit; background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; cursor: pointer; }
.spa-im-connectionDiagnostic button:focus-visible, .spa-im-connectionDiagnostic summary:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #3370ff); outline-offset: 2px; }

.spa-im-aliasName { display: flex; align-items: center; gap: 4px; min-width: 0; }
.spa-im-aliasName h3 { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spa-im-aliasName h3:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #3370ff); outline-offset: 2px; border-radius: 3px; }
.spa-im-botNameTooltip { position: fixed; z-index: 1000; box-sizing: border-box; width: max-content; max-width: min(320px, calc(100vw - 16px)); padding: 6px 9px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 7px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-3, #fff); box-shadow: 0 8px 24px rgb(31 35 41 / 14%); font: 500 12px/18px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; white-space: normal; overflow-wrap: anywhere; pointer-events: none; animation: spa-im-botNameTooltip-in .15s ease; }
@keyframes spa-im-botNameTooltip-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .spa-im-botNameTooltip { animation: none; } }
.spa-im-aliasEntry { display: inline-flex; flex: none; }
.spa-im-aliasEdit { display: grid; place-items: center; width: 28px; height: 28px; padding: 4px; border: 0; border-radius: 5px; color: var(--dsw-alias-label-tertiary, #8f959e); background: transparent; cursor: pointer; }
.spa-im-aliasEdit svg { opacity: .55; transition: opacity .15s ease; }
.spa-im-aliasName:hover .spa-im-aliasEdit:not(:disabled) svg, .spa-im-aliasEdit:focus-visible svg { opacity: 1; }
.spa-im-aliasEdit:hover:not(:disabled), .spa-im-aliasEdit:focus-visible { color: var(--dsw-alias-state-business-primary, #3370ff); background: var(--dsw-alias-interactive-bg-hover, #f7f8fa); }
.spa-im-aliasDialog { box-sizing: border-box; width: min(380px, calc(100% - 32px)); max-height: calc(100dvh - 32px); overflow-y: auto; padding: 22px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 12px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-3, #fff); box-shadow: 0 12px 36px rgb(0 0 0 / 18%); font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.spa-im-aliasDialog * { box-sizing: border-box; }
.spa-im-aliasDialog::backdrop { background: rgb(15 17 21 / 30%); }
.spa-im-aliasHeader { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 18px; }
.spa-im-aliasHeader h3 { margin: 0; font-size: 16px; }
.spa-im-aliasDialog button { font: inherit; cursor: pointer; }
.spa-im-aliasDialog .spa-im-aliasClose { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--dsw-alias-label-secondary, #646a73); font-size: 20px; }
.spa-im-aliasOriginal { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 10px 12px; margin-bottom: 18px; border-radius: 6px; background: var(--dsw-alias-bg-layer-2, #f5f6f7); overflow-wrap: anywhere; }
.spa-im-aliasOriginal > span:first-child { flex: none; color: var(--dsw-alias-label-secondary, #646a73); }
.spa-im-aliasDialog label { display: block; margin-bottom: 7px; }
.spa-im-aliasDialog input { width: 100%; min-height: 38px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 6px; color: inherit; background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; }
.spa-im-aliasHelp { margin: 8px 0 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; }
.spa-im-aliasError { color: var(--dsw-alias-state-danger-primary, #c53030); overflow-wrap: anywhere; }
.spa-im-aliasFooter { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; margin-top: 24px; }
.spa-im-aliasRestore { padding: 4px 0; border: 0; color: var(--dsw-alias-state-business-primary, #3370ff); background: transparent; }
.spa-im-aliasActions { display: flex; gap: 8px; margin-left: auto; }
.spa-im-aliasActions button { padding: 7px 14px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 6px; color: inherit; background: var(--dsw-alias-bg-layer-1, #fff); }
.spa-im-aliasActions .spa-im-aliasSave { color: #fff; border-color: var(--dsw-alias-state-business-primary, #3370ff); background: var(--dsw-alias-state-business-primary, #3370ff); }
.spa-im-aliasEdit:disabled, .spa-im-aliasDialog button:disabled, .spa-im-aliasDialog input:disabled { opacity: .55; cursor: not-allowed; }
.spa-im-aliasEdit:focus-visible, .spa-im-aliasDialog button:focus-visible, .spa-im-aliasDialog input:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #3370ff); outline-offset: 2px; }
@media (pointer: coarse) { .spa-im-aliasEdit, .spa-im-aliasDialog button { min-width: 44px; min-height: 44px; } .spa-im-aliasDialog input { font-size: 16px; } }
.spa-im-page {
  --spa-im-blue: var(--dsw-alias-state-business-primary, #3370ff);
  --spa-im-blue-soft: color-mix(in srgb, var(--spa-im-blue) 9%, transparent);
  width: 100%;
  max-width: 1080px;
  padding: 2px 0 30px;
  color: var(--dsw-alias-label-primary, #1f2329);
  box-sizing: border-box;
}
.spa-im-page *, .spa-im-page *::before, .spa-im-page *::after { box-sizing: border-box; }
.spa-im-title { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 0 0 18px; }
.spa-im-brand { min-width: 0; width: max-content; max-width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; margin: -2px -6px; padding: 2px 6px; border-radius: 8px; }
.spa-im-brandHeading { display: flex; align-items: baseline; gap: 8px; white-space: nowrap; }
.spa-im-brandName { color: var(--dsw-alias-label-primary, #1f2329); font-size: 20px; line-height: 24px; font-weight: 800; letter-spacing: .04em; }
.spa-im-brandVersion { color: var(--dsw-alias-label-tertiary, #8f959e); font: 500 10px/16px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0; }
.spa-im-title p { margin: 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: 18px; font-weight: 500; white-space: nowrap; }
.spa-im-titleActions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.spa-im-updateButton { min-height: 30px; display: inline-flex; align-items: center; justify-content: center; gap: 3px; padding: 5px 10px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 12px; line-height: 18px; font-weight: 560; cursor: pointer; }
.spa-im-updateButton:hover:not(:disabled) { border-color: #aeb3bb; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-interactive-bg-hover, #f7f8fa); }
.spa-im-updateButton:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #3370ff); outline-offset: 2px; }
.spa-im-updateButton:disabled { opacity: .55; cursor: default; }
.spa-im-updateAction { position: relative; display: inline-flex; flex: none; }
.spa-im-updateTrigger { width: 30px; height: 30px; flex: none; padding: 0; }
.spa-im-updateTrigger svg { display: block; }
.spa-im-updateBackdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 24px; background: rgb(15 17 21 / 42%); }
.spa-im-updateBackdrop, .spa-im-updateBackdrop * { box-sizing: border-box; }
.spa-im-updateDialog { width: min(480px, 100%); max-height: calc(100vh - 48px); overflow-y: auto; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 16px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-3, #fff); box-shadow: 0 20px 70px rgb(0 0 0 / 20%); text-align: left; }
.spa-im-updateDialog:focus { outline: none; }
.spa-im-updateDialog h3 { margin: 22px 24px 8px; font-size: 18px; line-height: 25px; font-weight: 680; }
.spa-im-updateDescription { margin: 0 24px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 13px; line-height: 20px; }
.spa-im-updateBody { padding: 18px 24px 20px; }
.spa-im-updateVersions { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 8px 18px; margin: 0 0 18px; font-size: 12px; line-height: 18px; }
.spa-im-updateVersions dt { color: var(--dsw-alias-label-secondary, #646a73); }
.spa-im-updateVersions dd { min-width: 0; margin: 0; overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.spa-im-updateStatus { padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l1, #eef0f3); border-radius: 10px; background: var(--dsw-alias-bg-layer-1, #f7f8fa); font-size: 13px; line-height: 20px; }
.spa-im-updateStatus strong { font-weight: 600; }
.spa-im-updateStatus p { margin: 6px 0 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: 19px; overflow-wrap: anywhere; }
.spa-im-updateStatusError { border-color: color-mix(in srgb, var(--dsw-alias-state-danger-primary, #d92d20) 25%, var(--dsw-alias-border-l2, #dfe1e5)); }
.spa-im-updateHint, .spa-im-updateError { margin: 12px 0 0; font-size: 12px; line-height: 19px; overflow-wrap: anywhere; }
.spa-im-updateHint { color: var(--dsw-alias-label-secondary, #646a73); }
.spa-im-updateError { color: var(--dsw-alias-state-danger-primary, #d92d20); }
.spa-im-updateManual { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
.spa-im-updateManualHeading { margin: 0; font-size: 13px; line-height: 20px; font-weight: 600; }
.spa-im-updateManualHint { margin: 8px 0 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: 19px; }
.spa-im-updateCommandRow { display: flex; align-items: center; gap: 8px; margin-top: 10px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; background: var(--dsw-alias-bg-layer-1, #f7f8fa); }
.spa-im-updateCommand { display: block; flex: 1; width: 100%; min-width: 0; padding: 0; resize: none; border: 0; color: var(--dsw-alias-label-primary, #1f2329); background: transparent; font: 12px/19px ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
.spa-im-updateCommand:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #3370ff); outline-offset: 2px; }
.spa-im-updateCopy { display: inline-flex; flex: 0 0 28px; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px; color: var(--dsw-alias-label-secondary, #646a73); background: transparent; cursor: pointer; }
.spa-im-updateCopy:hover:not(:disabled) { color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-interactive-bg-hover, #eef0f3); }
.spa-im-updateCopy:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #3370ff); outline-offset: 2px; }
.spa-im-updateCopy:disabled { opacity: .55; cursor: default; }
.spa-im-updateCopyCopied { color: var(--dsw-alias-state-success-primary, #20a162); }
.spa-im-updateFooter { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; padding: 14px 24px; border-top: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
.spa-im-updateFooter .spa-im-updateButton:first-child { margin-right: auto; }
.spa-im-updatePrimary, .spa-im-updatePrimary:hover:not(:disabled) { border-color: var(--dsw-alias-state-business-primary, #3370ff); color: #fff; background: var(--dsw-alias-state-business-primary, #3370ff); }
.spa-im-githubAction { position: relative; display: inline-flex; flex: none; }
.spa-im-githubLink { width: 30px; height: 30px; display: grid; place-items: center; flex: none; padding: 0; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-bg-layer-1, #fff); text-decoration: none; transition: border-color .15s ease, color .15s ease, background .15s ease; }
.spa-im-githubLink svg { display: block; }
.spa-im-githubLink:hover { border-color: #aeb3bb; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-interactive-bg-hover, #f7f8fa); }
.spa-im-githubLink:focus-visible { outline: 2px solid color-mix(in srgb, var(--spa-im-blue) 70%, white); outline-offset: 2px; }
.spa-im-updateTooltip, .spa-im-githubTooltip { position: absolute; top: calc(100% + 8px); right: 0; z-index: 20; width: max-content; max-width: min(220px, 80vw); padding: 6px 9px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 7px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-3, #fff); box-shadow: 0 8px 24px rgb(31 35 41 / 14%); font-size: 11px; line-height: 16px; font-weight: 500; white-space: nowrap; opacity: 0; visibility: hidden; transform: translateY(-3px); pointer-events: none; transition: opacity .15s ease, transform .15s ease, visibility .15s ease; }
.spa-im-updateAction:hover .spa-im-updateTooltip, .spa-im-updateTrigger:focus-visible + .spa-im-updateTooltip, .spa-im-githubAction:hover .spa-im-githubTooltip, .spa-im-githubAction:focus-within .spa-im-githubTooltip { opacity: 1; visibility: visible; transform: translateY(0); }
.spa-im-generalSettingsAction { position: relative; display: inline-flex; flex: none; }
.spa-im-generalSettingsButton { width: 30px; height: 30px; display: grid; place-items: center; flex: none; padding: 0; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-bg-layer-1, #fff); cursor: pointer; transition: border-color .15s ease, color .15s ease, background .15s ease, box-shadow .15s ease; }
.spa-im-generalSettingsButton svg { display: block; }
.spa-im-generalSettingsButton:hover { border-color: #aeb3bb; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-interactive-bg-hover, #f7f8fa); }
.spa-im-generalSettingsButton[aria-current="page"] { border-color: color-mix(in srgb, var(--spa-im-blue) 42%, var(--dsw-alias-border-l2, #dfe1e5)); color: var(--spa-im-blue); background: var(--spa-im-blue-soft); }
.spa-im-generalSettingsButton:focus-visible { outline: 2px solid color-mix(in srgb, var(--spa-im-blue) 70%, white); outline-offset: 2px; }
.spa-im-generalSettingsTooltip { position: absolute; top: calc(100% + 8px); right: 0; z-index: 20; width: max-content; padding: 6px 9px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 7px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-3, #fff); box-shadow: 0 8px 24px rgb(31 35 41 / 14%); font-size: 11px; line-height: 16px; font-weight: 500; white-space: nowrap; opacity: 0; visibility: hidden; transform: translateY(-3px); pointer-events: none; transition: opacity .15s ease, transform .15s ease, visibility .15s ease; }
.spa-im-generalSettingsAction:hover .spa-im-generalSettingsTooltip, .spa-im-generalSettingsButton:focus-visible + .spa-im-generalSettingsTooltip { opacity: 1; visibility: visible; transform: translateY(0); }
.spa-im-generalSettingsButton[aria-current="page"] + .spa-im-generalSettingsTooltip { opacity: 0; visibility: hidden; transform: translateY(-3px); }
.spa-im-layout { display: grid; grid-template-columns: 174px 1px minmax(0, 1fr); gap: 24px; align-items: start; }
.spa-im-rail { display: grid; align-content: start; gap: 8px; padding: 0 4px 1px 1px; }
.spa-im-channel { width: 100%; min-height: 48px; display: grid; grid-template-columns: 30px minmax(0, 1fr); align-items: center; gap: 10px; padding: 8px 12px; border: 1px solid var(--dsw-alias-border-l2, #eef0f3); border-radius: 14px; color: inherit; background: var(--dsw-alias-bg-layer-3, #fff); box-shadow: 0 2px 8px rgb(31 35 41 / 3%); font: inherit; text-align: left; cursor: pointer; transition: border-color .16s ease, background .16s ease, box-shadow .16s ease; }
.spa-im-channel:hover { border-color: color-mix(in srgb, var(--spa-im-blue) 25%, var(--dsw-alias-border-l2, #eef0f3)); background: color-mix(in srgb, var(--spa-im-blue) 2%, var(--dsw-alias-bg-layer-3, #fff)); box-shadow: 0 5px 16px rgb(31 35 41 / 5%); }
.spa-im-channel[aria-selected="true"] { border-color: color-mix(in srgb, var(--spa-im-blue) 43%, var(--dsw-alias-border-l2, #dfe1e5)); color: var(--spa-im-blue); background: color-mix(in srgb, var(--spa-im-blue) 12%, var(--dsw-alias-bg-layer-3, #fff)); box-shadow: 0 3px 12px rgb(51 112 255 / 7%); }
.spa-im-channel:focus-visible { outline: none; border-color: color-mix(in srgb, var(--spa-im-blue) 72%, var(--dsw-alias-border-l2, #dfe1e5)); box-shadow: 0 0 0 1px color-mix(in srgb, var(--spa-im-blue) 24%, transparent) inset, 0 3px 12px rgb(51 112 255 / 7%); }
.spa-im-logo { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 9px; box-shadow: 0 1px 3px rgb(31 35 41 / 7%); }
.spa-im-logo svg { display: block; width: 20px; height: 20px; }
.spa-im-logoWeixin { color: white; background: #07c160; }
.spa-im-logoWeixin svg { width: 19px; height: 19px; }
.spa-im-logoFeishu { background: white; border: 1px solid var(--dsw-alias-border-l2, #e5e6eb); }
.spa-im-logoFeishu svg { width: 28px; height: 28px; }
.spa-im-logoDingtalk { color: white; background: #1677ff; }
.spa-im-logoDingtalk svg { width: 24px; height: 24px; }
.spa-im-logoQq { color: white; background: #1677ff; }
.spa-im-logoQq svg { width: 21px; height: 21px; }
.spa-im-logoWecom { background: white; border: 1px solid var(--dsw-alias-border-l2, #e5e6eb); }
.spa-im-logoWecom svg { width: 22px; height: 22px; }
.spa-im-logoTelegram { color: white; background: #229ed9; }
.spa-im-logoTelegram svg { width: 21px; height: 21px; }
.spa-im-logoOffice { color: white; background: linear-gradient(145deg, #12213f, #3964fe); }
.spa-im-logoOffice svg { width: 23px; height: 23px; }
.spa-im-logoDiscord { color: white; background: #5865f2; }
.spa-im-logoDiscord svg { width: 21px; height: 21px; }
.spa-im-logoSlack { background: linear-gradient(145deg, #fff, #f8fafb); border: 1px solid #e5e6eb; }
.spa-im-logoSlack svg { width: 21px; height: 21px; }
.spa-im-logoWhatsapp { color: white; background: #25d366; }
.spa-im-logoIMessage { color: white; background: linear-gradient(180deg, #5bf675 0%, #28d944 50%, #0fbd2c 100%); box-shadow: inset 0 1px 1px rgb(255 255 255 / 45%), 0 1px 3px rgb(31 35 41 / 12%); }
.spa-im-logoIMessage svg { width: 23px; height: 23px; }
.spa-im-logoWhatsapp svg { width: 21px; height: 21px; }
.spa-im-channelCopy { min-width: 0; display: grid; }
.spa-im-channelCopy strong { overflow: hidden; color: inherit; font-size: 14px; line-height: 20px; font-weight: 680; text-overflow: ellipsis; white-space: nowrap; }
.spa-im-channelNote { overflow: hidden; color: var(--dsw-alias-label-tertiary, #8f959e); font-size: 10px; line-height: 13px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.spa-im-divider { width: 1px; align-self: stretch; background: var(--dsw-alias-border-l1, #eef0f3); }
.spa-im-panel { min-width: 0; container-type: inline-size; }
.spa-im-loopbackRecovery { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 0 0 14px; padding: 14px 16px; border: 1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d97706) 30%, var(--dsw-alias-border-l2, #dfe1e5)); border-radius: 12px; color: var(--dsw-alias-label-primary, #1f2329); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d97706) 8%, var(--dsw-alias-bg-layer-1, #fff)); }
.spa-im-loopbackRecoveryCopy { min-width: 0; }
.spa-im-loopbackRecoveryCopy strong { display: block; font-size: 14px; line-height: 20px; font-weight: 650; }
.spa-im-loopbackRecoveryCopy p { margin: 3px 0 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: 18px; }
.spa-im-loopbackRecoveryCopy code { display: block; overflow: hidden; margin-top: 5px; color: var(--dsw-alias-label-secondary, #646a73); font: 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
.spa-im-loopbackRecoveryAction { flex: none; min-height: 34px; display: inline-flex; align-items: center; justify-content: center; padding: 0 12px; border: 1px solid #1677ff; border-radius: 8px; color: #fff; background: #1677ff; font: inherit; font-size: 13px; font-weight: 560; white-space: nowrap; cursor: pointer; }
.spa-im-loopbackRecoveryAction:hover { border-color: #0958d9; background: #0958d9; }
.spa-im-loopbackRecoveryAction:focus-visible { outline: 2px solid color-mix(in srgb, #1677ff 62%, white); outline-offset: 2px; }
.spa-im-panel .spa-feishu-page, .spa-im-panel .dxw-page, .spa-im-panel .ddt-page, .spa-im-panel .dqq-page, .spa-im-panel .dwecom-page, .spa-im-panel .dsl-page, .spa-im-panel .dwa-page { width: 100%; max-width: none; padding: 0 0 24px; }
.spa-im-panel .spa-feishu-heading, .spa-im-panel .dxw-heading, .spa-im-panel .ddt-heading { justify-content: flex-end; }
.spa-im-panel .spa-feishu-headingTools, .spa-im-panel .dxw-tools, .spa-im-panel .ddt-tools { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) max-content; align-items: center; justify-content: stretch; gap: 8px; }
.spa-im-panel .spa-im-bindActions { min-width: 0; display: flex; align-items: center; flex-wrap: nowrap; gap: 8px; }
.spa-im-panel .spa-im-bindActions > button { min-width: 0; }
.spa-im-panel .spa-feishu-headingTools .spa-im-scanButton, .spa-im-panel .dxw-tools .spa-im-scanButton, .spa-im-panel .ddt-tools .spa-im-scanButton { flex: none; min-height: 34px; display: inline-flex; align-items: center; justify-content: center; justify-self: start; gap: 6px; padding: 0 10px; border: 1px solid #1677ff; border-radius: 8px; color: #fff; background: #1677ff; box-shadow: none; font: inherit; font-size: 13px; font-weight: 560; white-space: nowrap; }
.spa-im-panel .spa-feishu-headingTools .spa-im-scanButton:hover:not(:disabled), .spa-im-panel .dxw-tools .spa-im-scanButton:hover:not(:disabled), .spa-im-panel .ddt-tools .spa-im-scanButton:hover:not(:disabled) { border-color: #0958d9; background: #0958d9; }
.spa-im-panel .spa-im-credentialButton { flex: none; min-height: 34px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 10px; border: 1px solid #86909c; border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); box-shadow: 0 1px 2px rgb(31 35 41 / 5%); font: inherit; font-size: 13px; font-weight: 560; line-height: normal; white-space: nowrap; }
.spa-im-panel .spa-im-actionIcon { width: 15px; height: 15px; flex: 0 0 15px; }
.spa-im-panel .spa-im-credentialButton:hover:not(:disabled) { border-color: #4e5969; background: var(--dsw-alias-interactive-bg-hover, #f7f8fa); }
.spa-im-panel .spa-im-credentialButton[aria-pressed="true"] { border-color: #4e5969; background: var(--dsw-alias-bg-module-platform, #f2f3f5); box-shadow: inset 0 0 0 1px rgb(78 89 105 / 8%); }
.spa-im-panel .spa-feishu-headingTools .spa-im-onlineBadge, .spa-im-panel .dxw-tools .spa-im-onlineBadge, .spa-im-panel .ddt-tools .spa-im-onlineBadge { min-height: 30px; display: inline-flex; align-items: center; justify-self: end; gap: 0; padding: 0 11px; border: 0; border-radius: 999px; color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-bg-module-platform, #f2f3f5); font: inherit; font-size: 12px; font-weight: 400; line-height: normal; white-space: nowrap; }
.spa-im-panel .spa-im-channelPage { min-width: 0; width: 100%; max-width: none; display: flex; flex-direction: column; gap: 12px; padding: 0 0 24px; color: var(--dsw-alias-label-primary, #1f2329); box-sizing: border-box; }
.spa-im-panel .spa-im-surfaceCard { position: relative; overflow: hidden; border: 1px solid var(--dsw-alias-border-l2, #e5e6eb); border-radius: 14px; background: var(--dsw-alias-bg-layer-1, #fff); box-shadow: 0 1px 2px rgb(31 35 41 / 3%); }
.spa-im-panel .spa-im-surfaceCard::before { display: none; }
.spa-im-panel .spa-im-surfaceBody { padding: 24px; }
.spa-im-panel .spa-im-credentialPanel { display: grid; gap: 18px; padding: 20px; }
.spa-im-panel .spa-im-credentialTitle { margin: 0; color: var(--dsw-alias-label-primary, #1f2329); font-size: 17px; line-height: 1.35; font-weight: 650; }
.spa-im-panel .spa-im-credentialForm { min-width: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 12px; }
.spa-im-panel .spa-im-credentialFormSingle { grid-template-columns: minmax(0, 1fr); }
.spa-im-panel .spa-im-credentialField { min-width: 0; display: grid; gap: 7px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: normal; font-weight: 560; }
.spa-im-panel .spa-im-credentialField input { width: 100%; min-width: 0; height: 38px; padding: 0 11px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; outline: none; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; transition: border-color .16s ease, box-shadow .16s ease; }
.spa-im-panel .spa-im-credentialField input:focus { border-color: #4e5969; box-shadow: 0 0 0 3px rgb(78 89 105 / 10%); }
.spa-im-panel .spa-im-credentialField input::placeholder { color: var(--dsw-alias-label-tertiary, #8f959e); font-family: inherit; }
.spa-im-panel .spa-im-credentialError, .spa-im-panel .spa-im-credentialActions { grid-column: 1 / -1; }
.spa-im-panel .spa-im-credentialError { margin: 0; color: var(--dsw-alias-state-error-primary, #d54941); font-size: 12px; line-height: 1.5; }
.spa-im-panel .spa-im-credentialActions { margin-top: 0; }
.spa-im-panel .spa-im-listSection { min-width: 0; width: 100%; max-width: 100%; display: flex; flex-direction: column; gap: 0; }
.spa-im-panel .spa-im-listHeading { min-height: 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 0 0 6px; padding: 0; }
.spa-im-panel .spa-im-listHeading h3 { margin: 0; color: var(--dsw-alias-label-primary, #1f2329); font-size: 14px; line-height: normal; font-weight: 650; }
.spa-im-panel .spa-im-listTitle { min-width: 0; display: inline-flex; align-items: center; gap: 6px; }
.spa-im-panel .spa-im-channelHelp { position: relative; display: inline-flex; flex: none; }
.spa-im-panel .spa-im-channelHelpButton { width: 17px; height: 17px; display: grid; place-items: center; padding: 0; border: 1px solid color-mix(in srgb, #1677ff 28%, var(--dsw-alias-border-l2, #dfe1e5)); border-radius: 50%; color: #1677ff; background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 11px; line-height: 1; font-weight: 700; cursor: help; transition: border-color .15s ease, color .15s ease, background .15s ease, box-shadow .15s ease; }
.spa-im-panel .spa-im-channelHelpButton:hover { border-color: #1677ff; color: #0f5fce; background: color-mix(in srgb, #1677ff 8%, var(--dsw-alias-bg-layer-1, #fff)); }
.spa-im-panel .spa-im-channelHelpButton:focus-visible { outline: none; border-color: #1677ff; box-shadow: 0 0 0 3px color-mix(in srgb, #1677ff 16%, transparent); }
.spa-im-panel .spa-im-channelTooltip { position: absolute; top: calc(100% + 7px); left: 0; z-index: 30; width: max-content; max-width: min(280px, calc(100vw - 48px)); display: flex; align-items: baseline; gap: 5px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-bg-layer-3, #fff); box-shadow: 0 10px 28px rgb(31 35 41 / 16%); font-size: 11px; line-height: 16px; font-weight: 400; white-space: normal; opacity: 0; visibility: hidden; transform: translateY(-3px); pointer-events: none; transition: opacity .15s ease, transform .15s ease, visibility .15s ease; }
.spa-im-panel .spa-im-channelTooltip strong { color: var(--dsw-alias-label-primary, #1f2329); font-weight: 600; white-space: nowrap; }
.spa-im-panel .spa-im-channelHelp:hover .spa-im-channelTooltip, .spa-im-panel .spa-im-channelHelp:focus-within .spa-im-channelTooltip { opacity: 1; visibility: visible; transform: translateY(0); }
.spa-im-panel .spa-im-botList { min-width: 0; width: 100%; max-width: 100%; display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin: 0; padding: 0; list-style: none; }
.spa-im-panel .spa-im-botList > li { min-width: 0; max-width: 100%; }
.spa-im-panel .spa-im-loadingView { padding: 38px; color: var(--dsw-alias-label-secondary, #646a73); text-align: center; }
.spa-im-panel .spa-im-loadingView h3 { margin: 0 0 7px; color: var(--dsw-alias-label-primary, #1f2329); font-size: 17px; line-height: normal; font-weight: 650; }
.spa-im-panel .spa-im-loadingView p { margin: 0; line-height: 1.6; }
.spa-im-panel .spa-im-spinner { width: 24px; height: 24px; margin: 0 auto 13px; border: 3px solid var(--dsw-alias-border-l2, #e6e8eb); border-top-color: #1677ff; border-radius: 50%; animation: spa-im-spin .8s linear infinite; }
@keyframes spa-im-spin { to { transform: rotate(360deg); } }
.spa-im-panel .spa-im-emptyView { min-height: 230px; display: grid; grid-template-columns: minmax(0, 1fr) 180px; align-items: center; gap: 30px; }
.spa-im-panel .spa-im-emptyCopy { min-width: 0; }
.spa-im-panel .spa-im-emptyCopy h3 { margin: 8px 0; color: var(--dsw-alias-label-primary, #1f2329); font-size: 18px; line-height: 1.35; font-weight: 650; }
.spa-im-panel .spa-im-emptyCopy > p { max-width: 560px; margin: 0; color: var(--dsw-alias-label-secondary, #646a73); line-height: 1.65; }
.spa-im-panel .spa-im-emptyBrand { width: 110px; height: 110px; display: grid; place-items: center; justify-self: center; border-radius: 28px; box-shadow: 0 18px 45px rgb(22 119 255 / 18%); }
.spa-im-panel .spa-im-stateLabel { display: inline-flex; align-items: center; gap: 8px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: normal; font-weight: 600; }
.spa-im-panel .spa-im-stateDot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--dsw-alias-label-tertiary, #8f959e); box-shadow: none; }
.spa-im-panel .spa-im-stateDot[data-tone="success"] { background: var(--dsw-alias-state-success-primary, #20a162); }
.spa-im-panel .spa-im-stateDot[data-tone="warning"] { background: var(--dsw-alias-state-warn-primary, #d97706); }
.spa-im-panel .spa-im-stateDot[data-tone="error"] { background: var(--dsw-alias-state-error-primary, #d54941); }
.spa-im-panel .spa-im-viewActions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
.spa-im-panel .spa-im-viewActions .spa-feishu-button, .spa-im-panel .spa-im-viewActions .dxw-button, .spa-im-panel .spa-im-viewActions .ddt-button { min-height: 34px; padding: 0 13px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); box-shadow: none; font: inherit; font-size: 13px; font-weight: 560; line-height: normal; white-space: nowrap; }
.spa-im-panel .spa-im-viewActions .spa-feishu-button[data-kind="primary"], .spa-im-panel .spa-im-viewActions .dxw-button[data-kind="primary"], .spa-im-panel .spa-im-viewActions .ddt-button[data-kind="primary"] { border-color: #1677ff; color: #fff; background: #1677ff; box-shadow: none; }
.spa-im-panel .spa-im-viewActions .spa-feishu-button[data-kind="danger"], .spa-im-panel .spa-im-viewActions .dxw-button[data-kind="danger"], .spa-im-panel .spa-im-viewActions .ddt-button[data-kind="danger"] { color: var(--dsw-alias-state-error-primary, #d54941); }
.spa-im-panel .spa-im-qrLayout { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 34px; align-items: start; }
.spa-im-panel .spa-im-qrColumn { width: 100%; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.spa-im-panel .spa-im-qrFrame { position: relative; width: min(270px, 100%); height: auto; aspect-ratio: 1; display: grid; place-items: center; overflow: hidden; padding: 10px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 16px; background: #fff; }
.spa-im-panel .spa-im-qrFrame::before { content: ""; position: absolute; inset: 7px; z-index: 0; border: 1px solid color-mix(in srgb, #1677ff 16%, var(--dsw-alias-border-l2, #dfe1e5)); border-radius: 12px; pointer-events: none; }
.spa-im-panel .spa-im-qrFrame::after { display: none; }
.spa-im-panel .spa-im-qrFrame img { position: relative; z-index: 1; width: 100%; height: 100%; display: block; object-fit: contain; }
.spa-im-panel .spa-im-qrFallback { position: relative; z-index: 1; display: grid; place-items: center; gap: 8px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 13px; line-height: 1.5; text-align: center; }
.spa-im-panel .spa-im-qrExpired { position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; padding: 20px; color: var(--dsw-static-neutral-bluish-1000, #0f1115); background: rgb(255 255 255 / 92%); font-size: 15px; line-height: 1.6; font-weight: 650; text-align: center; white-space: pre-line; backdrop-filter: blur(3px); }
.spa-im-panel .spa-im-countdown { width: min(270px, 100%); margin: 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: normal; }
.spa-im-panel .spa-im-countdownTop { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
.spa-im-panel .spa-im-countdownTop strong { color: var(--dsw-alias-label-primary, #1f2329); font-weight: 650; }
.spa-im-panel .spa-im-progress { height: 4px; overflow: hidden; margin: 0; border-radius: 99px; background: var(--dsw-alias-bg-module-platform, #eef0f3); }
.spa-im-panel .spa-im-progress span { display: block; width: var(--spa-feishu-progress, var(--dxw-progress, var(--ddt-progress, 0%))); height: 100%; border-radius: inherit; background: #1677ff; transition: width .25s linear; }
.spa-im-panel .spa-im-qrCopy { min-width: 0; overflow-wrap: anywhere; }
.spa-im-panel .spa-im-qrCopy h3 { margin: 9px 0 8px; color: var(--dsw-alias-label-primary, #1f2329); font-size: 18px; line-height: 1.35; font-weight: 650; }
.spa-im-panel .spa-im-qrCopy > p { margin: 0; color: var(--dsw-alias-label-secondary, #646a73); line-height: 1.65; }
.spa-im-panel .spa-im-steps { margin: 18px 0 16px; padding: 0; list-style: none; counter-reset: spa-im-step; }
.spa-im-panel .spa-im-steps li { position: relative; min-height: 28px; display: flex; align-items: center; padding: 5px 0 5px 36px; color: var(--dsw-alias-label-secondary, #646a73); line-height: 1.5; counter-increment: spa-im-step; }
.spa-im-panel .spa-im-steps li::before { content: counter(spa-im-step); position: absolute; left: 0; top: 4px; width: 25px; height: 25px; display: grid; place-items: center; border-radius: 8px; color: #4d93f8; background: color-mix(in srgb, #1677ff 16%, var(--dsw-alias-bg-layer-1, #fff)); font-size: 12px; font-weight: 650; }
.spa-im-panel .spa-im-specialView { padding: 32px; text-align: center; }
.spa-im-panel .spa-im-statusNotice { display: flex; align-items: flex-start; gap: 10px; padding: 13px 15px; border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #d54941) 22%, var(--dsw-alias-border-l2, #dfe1e5)); border-radius: 10px; color: var(--dsw-alias-state-error-primary, #d54941); background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d54941) 8%, var(--dsw-alias-bg-layer-1, #fff)); font-size: 13px; line-height: 1.5; }
.spa-im-panel .spa-im-inlineError { display: flex; align-items: flex-start; flex-direction: column; gap: 10px; padding: 22px; color: var(--dsw-alias-state-error-primary, #d54941); background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d54941) 8%, var(--dsw-alias-bg-layer-1, #fff)); }
.spa-im-panel .spa-im-inlineError > div { min-width: 0; }
.spa-im-panel .spa-im-inlineError h3 { margin: 0; color: inherit; font-size: 17px; line-height: 1.35; font-weight: 650; }
.spa-im-panel .spa-im-inlineError p { margin: 7px 0 0; color: inherit; line-height: 1.6; }
.spa-im-panel .spa-im-confirm { padding: 18px 24px; border-top: 1px solid var(--dsw-alias-border-l1, #eef0f3); background: var(--dsw-alias-interactive-bg-hover, #f7f8fa); }
.spa-im-panel .spa-im-confirm strong, .spa-im-panel .spa-im-confirm h4 { margin: 0; color: var(--dsw-alias-label-primary, #1f2329); font-size: 14px; line-height: 1.4; font-weight: 650; }
.spa-im-panel .spa-im-confirm p { margin: 7px 0 0; color: var(--dsw-alias-label-secondary, #646a73); line-height: 1.6; }
.spa-im-panel .spa-im-cardFooter { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 6px; border-top: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
.spa-im-panel .spa-im-workspace { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) max-content; align-items: center; column-gap: 10px; row-gap: 4px; margin-top: 6px; padding: 6px 10px; border: 1px solid var(--dsw-alias-border-l1, #eef0f3); border-radius: 9px; background: var(--dsw-alias-bg-module-platform, #f7f8fa); }
.spa-im-panel .spa-im-workspaceHeader { display: contents; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: normal; }
.spa-im-panel .spa-im-workspaceHeader > span { grid-column: 1; grid-row: 1; white-space: nowrap; }
.spa-im-panel .spa-im-workspaceEdit { grid-column: 2; grid-row: 1; padding: 0; border: 0; color: #1677ff; background: transparent; font: inherit; font-weight: 560; white-space: nowrap; cursor: pointer; }
.spa-im-panel .spa-im-workspaceEdit:disabled { cursor: not-allowed; opacity: .55; }
.spa-im-panel .spa-im-workspacePath { min-width: 0; max-width: 100%; grid-column: 1 / -1; grid-row: 2; display: block; overflow: hidden; color: var(--dsw-alias-label-primary, #1f2329); font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; white-space: normal; }
.spa-im-panel .spa-im-preset { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) max-content; align-items: center; column-gap: 10px; row-gap: 4px; margin-top: 6px; padding: 6px 10px; border: 1px solid var(--dsw-alias-border-l1, #eef0f3); border-radius: 9px; background: var(--dsw-alias-bg-module-platform, #f7f8fa); }
.spa-im-panel .spa-im-presetHeader { position: relative; min-width: 0; grid-column: 1 / -1; grid-row: 1; display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: normal; }
.spa-im-panel .spa-im-presetTitle { min-width: 0; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.spa-im-panel .spa-im-presetHelp { display: inline-flex; align-items: center; flex: none; }
.spa-im-panel .spa-im-presetHelpButton { width: 17px; height: 17px; display: grid; place-items: center; padding: 0; border: 1px solid color-mix(in srgb, #1677ff 28%, var(--dsw-alias-border-l2, #dfe1e5)); border-radius: 50%; color: #1677ff; background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 11px; line-height: 1; font-weight: 700; cursor: help; transition: border-color .15s ease, color .15s ease, background .15s ease, box-shadow .15s ease; }
.spa-im-panel .spa-im-presetHelpButton:hover { border-color: #1677ff; color: #0f5fce; background: color-mix(in srgb, #1677ff 8%, var(--dsw-alias-bg-layer-1, #fff)); }
.spa-im-panel .spa-im-presetHelpButton:focus-visible { outline: none; border-color: #1677ff; box-shadow: 0 0 0 3px color-mix(in srgb, #1677ff 16%, transparent); }
.spa-im-panel .spa-im-presetTooltip { position: absolute; top: calc(100% + 7px); left: 0; z-index: 30; width: min(320px, 100%); padding: 9px 10px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-3, #fff); box-shadow: 0 10px 28px rgb(31 35 41 / 16%); font-size: 11px; line-height: 16px; font-weight: 400; overflow-wrap: anywhere; white-space: normal; opacity: 0; visibility: hidden; transform: translateY(-3px); pointer-events: none; transition: opacity .15s ease, transform .15s ease, visibility .15s ease; }
.spa-im-panel .spa-im-presetHelp:hover .spa-im-presetTooltip, .spa-im-panel .spa-im-presetHelp:focus-within .spa-im-presetTooltip { opacity: 1; visibility: visible; transform: translateY(0); }
.spa-im-panel .spa-im-presetStatus { grid-column: 2; grid-row: 1; color: var(--dsw-alias-label-tertiary, #8f959e); font-size: 12px; white-space: nowrap; }
.spa-im-panel .spa-im-presetSelect { min-width: 0; max-width: 100%; grid-column: 1 / -1; grid-row: 2; height: 30px; padding: 0 8px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 7px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 12px; }
.spa-im-panel .spa-im-presetSelect:disabled { cursor: not-allowed; opacity: .55; }
.spa-im-panel .spa-im-modelSetting { display: block; padding: 8px 4px 4px; }
.spa-im-modelSetting > .spa-im-presetHeader { padding: 0 6px 6px; }
.spa-im-modelRow { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 40px; padding: 6px 10px; border: 0; border-radius: 10px; background: transparent; color: var(--dsw-alias-label-primary, #1f2329); font: inherit; font-size: 14px; line-height: 22px; text-align: left; cursor: pointer; }
.spa-im-modelRowLabel { flex: none; }
.spa-im-modelValue { flex: 1; min-width: 0; overflow: hidden; color: var(--dsw-alias-label-tertiary, #81858c); text-overflow: ellipsis; white-space: nowrap; text-align: right; }
.spa-im-modelChevron { flex: none; color: var(--dsw-alias-label-tertiary, #81858c); }
.spa-im-modelRow:hover:not(:disabled), .spa-im-modelOption:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, #eceef1); }
.spa-im-modelRow:focus-visible, .spa-im-modelOption:focus-visible { outline: 2px solid var(--dsw-alias-border-l3, #1677ff); outline-offset: -2px; }
.spa-im-modelRow:disabled, .spa-im-modelOption:disabled { opacity: .55; cursor: default; }
/* In-flow lists avoid clipping by collapsed-card and settings scroll containers. */
.spa-im-modelMenu { max-height: 280px; overflow-y: auto; margin: 4px; padding: 4px; border: 1px solid var(--dsw-alias-border-l2, #e5e6eb); border-radius: 12px; background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-3, #fff)); color: var(--dsw-alias-label-primary, #1f2329); scrollbar-width: thin; }
.spa-im-modelGroupTitle { padding: 7px 8px 3px; color: var(--dsw-alias-label-tertiary, #81858c); font-size: 12px; line-height: 18px; font-weight: 500; }
.spa-im-modelOption { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 38px; padding: 6px 8px; border: 0; border-radius: 10px; background: transparent; color: inherit; text-align: left; font: inherit; cursor: pointer; }
.spa-im-modelOptionCopy { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 2px; }
.spa-im-modelOptionName { font-size: 14px; line-height: 20px; font-weight: 500; overflow-wrap: anywhere; }
.spa-im-modelDescription { color: var(--dsw-alias-label-tertiary, #81858c); font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
.spa-im-modelCheck { flex: 0 0 18px; text-align: center; }
.spa-im-modelHint { margin: 4px 10px 6px; color: var(--dsw-alias-label-tertiary, #81858c); font-size: 11px; line-height: 17px; }
.spa-im-panel .spa-im-presetError { grid-column: 1 / -1; grid-row: 3; margin: 0; color: var(--dsw-alias-state-error-primary, #d54941); font-size: 12px; line-height: 1.4; }
.spa-im-contextEntry { width: 100%; min-height: 40px; display: grid; grid-template-columns: 16px minmax(0, 1fr) max-content 16px; align-items: center; gap: 9px; margin: 10px 0; padding: 8px 11px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-module-platform, #f7f8fa); font: inherit; font-size: 13px; line-height: 20px; text-align: left; cursor: pointer; }
.spa-im-contextEntry:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, #eef0f3); }
.spa-im-contextEntry > svg { color: var(--dsw-alias-label-secondary, #646a73); }
.spa-im-contextLabel { min-width: 0; font-weight: 500; overflow-wrap: anywhere; }
.spa-im-contextStatus { padding: 2px 7px; border-radius: 5px; color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-bg-layer-1, #fff); font-size: 11px; line-height: 16px; font-weight: 400; white-space: nowrap; }
.spa-im-contextStatus[data-active="true"] { color: var(--dsw-alias-state-business-primary, #3370ff); background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #3370ff) 10%, var(--dsw-alias-bg-layer-1, #fff)); }
.spa-im-contextBackdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 12px; background: rgb(15 17 21 / 42%); }
.spa-im-contextBackdrop, .spa-im-contextBackdrop *, .spa-im-contextBackdrop *::before, .spa-im-contextBackdrop *::after { box-sizing: border-box; }
.spa-im-contextDialog { width: min(450px, 100%); min-width: 0; max-height: calc(100vh - 24px); max-height: calc(100dvh - 24px); overflow-y: auto; padding: 16px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 12px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-3, #fff); box-shadow: 0 20px 70px rgb(0 0 0 / 20%); font-size: 13px; line-height: 1.5; text-align: left; }
.spa-im-contextDialog:focus { outline: none; }
.spa-im-contextHeader, .spa-im-contextEditorHeader { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.spa-im-contextHeader { position: relative; }
.spa-im-contextHeaderTitle { min-width: 0; display: inline-flex; align-items: center; gap: 6px; }
.spa-im-contextHeader h3 { margin: 0; font-size: 15px; line-height: 22px; font-weight: 500; }
.spa-im-contextHeaderTooltip { width: min(340px, calc(100vw - 72px)); }
.spa-im-contextClose { width: 30px; height: 30px; flex: none; display: grid; place-items: center; padding: 0; border: 0; border-radius: 6px; color: var(--dsw-alias-label-secondary, #646a73); background: transparent; cursor: pointer; }
.spa-im-contextClose:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, #eef0f3); }
.spa-im-contextTabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px; margin-top: 14px; padding: 3px; border: 1px solid var(--dsw-alias-border-l1, #eef0f3); border-radius: 8px; background: var(--dsw-alias-bg-module-platform, #f7f8fa); }
.spa-im-contextTab { min-width: 0; min-height: 34px; padding: 5px 12px; border: 0; border-radius: 6px; color: var(--dsw-alias-label-secondary, #646a73); background: transparent; font: inherit; font-weight: 500; cursor: pointer; transition: color .15s ease, background .15s ease, box-shadow .15s ease; }
.spa-im-contextTab:hover:not(:disabled):not([aria-selected="true"]) { color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-interactive-bg-hover, #eef0f3); }
.spa-im-contextTab[aria-selected="true"] { color: var(--dsw-alias-state-business-primary, #3370ff); background: var(--dsw-alias-bg-layer-1, #fff); box-shadow: 0 1px 3px rgb(31 35 41 / 12%); }
.spa-im-contextTabPanel[hidden] { display: none; }
.spa-im-contextSection { min-width: 0; margin: 0; padding: 0; border: 0; }
.spa-im-contextScope { margin-top: 10px; padding: 12px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 9px; background: var(--dsw-alias-bg-layer-1, #fff); }
.spa-im-contextScopeBlock { margin-top: 12px; }
.spa-im-contextLegend { position: relative; display: inline-flex; align-items: center; gap: 6px; }
.spa-im-contextSwitchRow { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 34px; cursor: pointer; }
.spa-im-contextSwitchLabel { min-width: 0; display: inline-flex; align-items: baseline; gap: 5px; flex-wrap: wrap; }
.spa-im-contextUnavailable { color: var(--dsw-alias-label-tertiary, #8f959e); font-size: 11px; line-height: 16px; font-weight: 400; }
.spa-im-contextSwitch { appearance: none; flex: none; width: 32px; height: 19px; margin: 0; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 12px; background: var(--dsw-alias-interactive-bg-hover, #eef0f3); cursor: pointer; }
.spa-im-contextSwitch::before { content: ""; display: block; width: 13px; height: 13px; margin: 2px; border-radius: 50%; background: var(--dsw-alias-label-secondary, #646a73); }
.spa-im-contextSwitch:checked { border-color: var(--dsw-alias-state-business-primary, #3370ff); background: var(--dsw-alias-state-business-primary, #3370ff); }
.spa-im-contextSwitch:checked::before { transform: translateX(13px); background: #fff; }
.spa-im-contextFields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px 12px; }
.spa-im-contextField { position: relative; min-width: 0; min-height: 30px; display: flex; align-items: center; gap: 6px; }
.spa-im-contextField input { flex: none; width: 14px; height: 14px; margin: 0; accent-color: var(--dsw-alias-state-business-primary, #3370ff); }
.spa-im-contextFieldText { min-width: 0; display: grid; grid-template-columns: max-content max-content; align-items: center; column-gap: 5px; overflow-wrap: anywhere; }
.spa-im-contextFieldName { min-width: 0; line-height: 17px; cursor: pointer; }
.spa-im-contextFieldKey { min-width: 0; grid-column: 1 / -1; color: var(--dsw-alias-label-tertiary, #8f959e); font: 10px/14px ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; cursor: pointer; }
.spa-im-contextFieldHelp { position: static; }
.spa-im-contextFieldHelpButton { width: 16px; height: 16px; font-size: 10px; }
.spa-im-contextTooltip.spa-im-contextFieldTooltip { top: calc(100% + 6px); right: 0; left: auto; width: min(280px, calc(100vw - 72px)); }
.spa-im-contextField:nth-child(odd) .spa-im-contextFieldTooltip { right: auto; left: 0; }
.spa-im-contextEditorHeader { position: relative; flex-wrap: wrap; }
.spa-im-contextEditorTitle { min-width: 0; display: inline-flex; align-items: center; gap: 6px; }
.spa-im-contextEditorTitle > label { font-weight: 500; }
.spa-im-contextHelp { display: inline-flex; align-items: center; flex: none; }
.spa-im-contextHelpButton { width: 18px; height: 18px; display: grid; place-items: center; padding: 0; border: 1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary, #3370ff) 30%, var(--dsw-alias-border-l2, #dfe1e5)); border-radius: 50%; color: var(--dsw-alias-state-business-primary, #3370ff); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 11px; line-height: 1; font-weight: 700; cursor: help; transition: border-color .15s ease, color .15s ease, background .15s ease, box-shadow .15s ease; }
.spa-im-contextHelpButton:hover:not(:disabled) { border-color: var(--dsw-alias-state-business-primary, #3370ff); background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #3370ff) 8%, var(--dsw-alias-bg-layer-1, #fff)); }
.spa-im-contextTooltip { position: absolute; top: calc(100% + 7px); left: 0; z-index: 30; width: min(330px, calc(100vw - 72px)); display: grid; gap: 5px; padding: 10px 11px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-3, #fff); box-shadow: 0 10px 28px rgb(31 35 41 / 16%); font-size: 11px; line-height: 16px; font-weight: 400; overflow-wrap: anywhere; white-space: normal; opacity: 0; visibility: hidden; transform: translateY(-3px); pointer-events: none; transition: opacity .15s ease, transform .15s ease, visibility .15s ease; }
.spa-im-contextTooltip strong { font-weight: 600; }
.spa-im-contextTooltipExample { padding: 7px 8px; border-radius: 6px; background: var(--dsw-alias-bg-module-platform, #f7f8fa); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; }
.spa-im-contextTooltip.spa-im-contextLegendTooltip { width: min(350px, calc(100vw - 72px)); }
.spa-im-contextTooltip.spa-im-contextGuidanceTooltip { top: auto; bottom: calc(100% + 7px); width: min(380px, calc(100vw - 72px)); max-height: calc(100dvh - 48px); overflow-y: auto; }
.spa-im-contextHelp:hover .spa-im-contextTooltip, .spa-im-contextHelp:focus-within .spa-im-contextTooltip { opacity: 1; visibility: visible; transform: translateY(0); pointer-events: auto; }
.spa-im-contextTextActions { display: flex; gap: 10px; margin-left: auto; }
.spa-im-contextTextActions button { min-height: 30px; padding: 4px 0; border: 0; border-radius: 4px; color: var(--dsw-alias-state-business-primary, #3370ff); background: transparent; font: inherit; font-size: 12px; cursor: pointer; }
.spa-im-contextTextActions button:hover:not(:disabled) { text-decoration: underline; }
.spa-im-contextGuidance textarea { display: block; width: 100%; min-height: 88px; margin-top: 7px; padding: 9px 10px; resize: vertical; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 7px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-module-platform, #f7f8fa); font: inherit; font-size: 12px; line-height: 1.6; }
.spa-im-contextGuidance textarea::placeholder { color: var(--dsw-alias-label-tertiary, #8f959e); opacity: 1; }
.spa-im-contextHint { margin: 5px 0 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 1.5; overflow-wrap: anywhere; }
.spa-im-contextError { margin: 12px 0 0; color: var(--dsw-alias-state-error-primary, #d54941); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.spa-im-contextFooter { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.spa-im-contextFooter button { min-height: 34px; padding: 6px 15px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 7px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; cursor: pointer; }
.spa-im-contextFooter button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, #eef0f3); }
.spa-im-contextFooter .spa-im-contextSave, .spa-im-contextFooter .spa-im-contextSave:hover:not(:disabled) { border-color: var(--dsw-alias-state-business-primary, #3370ff); color: #fff; background: var(--dsw-alias-state-business-primary, #3370ff); }
.spa-im-contextEntry:focus-visible, .spa-im-contextDialog button:focus-visible, .spa-im-contextDialog input:focus-visible, .spa-im-contextDialog textarea:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #3370ff); outline-offset: 2px; }
.spa-im-contextEntry:disabled, .spa-im-contextDialog button:disabled, .spa-im-contextDialog input:disabled, .spa-im-contextDialog textarea:disabled { opacity: .55; cursor: not-allowed; }
@media (pointer: coarse) {
  .spa-im-contextEntry, .spa-im-contextTab, .spa-im-contextClose, .spa-im-contextFooter button, .spa-im-contextTextActions button, .spa-im-contextField, .spa-im-contextSwitchRow { min-height: 44px; }
  .spa-im-contextClose, .spa-im-contextTextActions button { min-width: 44px; }
  .spa-im-contextGuidance textarea { font-size: 16px; }
}
.spa-im-directoryPickerBackdrop { --spa-im-blue: var(--dsw-alias-state-business-primary, #3370ff); --spa-im-blue-soft: color-mix(in srgb, var(--spa-im-blue) 9%, transparent); position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 24px; background: rgb(15 17 21 / 42%); backdrop-filter: blur(3px); }
.spa-im-directoryPickerBackdrop, .spa-im-directoryPickerBackdrop *, .spa-im-directoryPickerBackdrop *::before, .spa-im-directoryPickerBackdrop *::after { box-sizing: border-box; }
.spa-im-directoryPicker { width: min(720px, 100%); height: min(620px, calc(100vh - 48px)); min-height: 420px; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; overflow: hidden; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 18px; outline: none; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); box-shadow: 0 24px 72px rgb(15 17 21 / 24%); }
.spa-im-directoryPickerHeader { min-width: 0; padding: 22px 24px 17px; border-bottom: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
.spa-im-directoryPickerHeader h3 { margin: 0 0 14px; color: var(--dsw-alias-label-primary, #1f2329); font-size: 20px; line-height: 1.35; font-weight: 680; }
.spa-im-directoryPickerHeader > p { margin: 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 13px; }
.spa-im-directoryCrumbs { min-width: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 4px; color: var(--dsw-alias-label-tertiary, #8f959e); }
.spa-im-directoryCrumbs button { max-width: 210px; overflow: hidden; padding: 3px 5px; border: 0; border-radius: 6px; color: var(--dsw-alias-label-secondary, #646a73); background: transparent; font: inherit; font-size: 12px; line-height: 18px; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.spa-im-directoryCrumbs button:hover:not(:disabled) { color: var(--spa-im-blue); background: var(--spa-im-blue-soft); }
.spa-im-directoryCrumbs button[aria-current="page"] { color: var(--dsw-alias-label-primary, #1f2329); font-weight: 650; }
.spa-im-directoryCrumbs button:focus-visible, .spa-im-directoryPathInput:focus-visible, .spa-im-directoryPathControl button:focus-visible, .spa-im-directoryList button:focus-visible, .spa-im-directoryPickerActions button:focus-visible { outline: 2px solid color-mix(in srgb, var(--spa-im-blue) 65%, white); outline-offset: 1px; }
.spa-im-directoryCrumbSeparator { flex: none; font-size: 12px; }
.spa-im-directoryPathForm { display: grid; gap: 7px; margin-top: 14px; }
.spa-im-directoryPathMeta { min-width: 0; display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.spa-im-directoryPathMeta label { flex: none; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; font-weight: 650; }
.spa-im-directoryPathMeta span { min-width: 0; overflow: hidden; color: var(--dsw-alias-label-tertiary, #8f959e); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.spa-im-directoryPathControl { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) max-content; gap: 8px; }
.spa-im-directoryPathInput { min-width: 0; height: 38px; padding: 0 11px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font: 12px ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace; line-height: 38px; }
.spa-im-directoryPathInput::placeholder { color: var(--dsw-alias-label-tertiary, #8f959e); }
.spa-im-directoryPathInput:hover:not(:disabled) { border-color: var(--dsw-alias-border-l3, #bbbfc4); }
.spa-im-directoryPathInput:focus { border-color: var(--spa-im-blue); }
.spa-im-directoryPathInput[aria-invalid="true"] { border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d54941) 62%, var(--dsw-alias-border-l2, #dfe1e5)); }
.spa-im-directoryPathControl button { min-height: 38px; padding: 0 14px; border: 1px solid color-mix(in srgb, var(--spa-im-blue) 30%, var(--dsw-alias-border-l2, #dfe1e5)); border-radius: 8px; color: var(--spa-im-blue); background: var(--spa-im-blue-soft); font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; }
.spa-im-directoryPathControl button:hover:not(:disabled) { border-color: color-mix(in srgb, var(--spa-im-blue) 48%, var(--dsw-alias-border-l2, #dfe1e5)); background: color-mix(in srgb, var(--spa-im-blue) 13%, transparent); }
.spa-im-directoryPathInput:disabled, .spa-im-directoryPathControl button:disabled { cursor: not-allowed; opacity: .55; }
.spa-im-directoryPickerBody { min-height: 0; overflow-y: auto; padding: 14px 16px; scrollbar-width: thin; scrollbar-color: var(--dsw-alias-border-l2, #dfe1e5) transparent; }
.spa-im-directoryList { display: grid; gap: 3px; margin: 0; padding: 0; list-style: none; }
.spa-im-directoryList button { width: 100%; min-height: 46px; display: grid; grid-template-columns: 24px minmax(0, 1fr) 18px; align-items: center; gap: 10px; padding: 7px 11px; border: 0; border-radius: 9px; color: var(--dsw-alias-label-primary, #1f2329); background: transparent; font: inherit; text-align: left; cursor: pointer; }
.spa-im-directoryList button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, #f7f8fa); }
.spa-im-directoryList button:disabled, .spa-im-directoryCrumbs button:disabled { cursor: wait; opacity: .55; }
.spa-im-directoryFolder { width: 24px; height: 24px; display: grid; place-items: center; color: var(--dsw-alias-label-secondary, #646a73); }
.spa-im-directoryFolder svg { width: 22px; height: 22px; }
.spa-im-directoryName { min-width: 0; overflow: hidden; font-size: 14px; line-height: 20px; text-overflow: ellipsis; white-space: nowrap; }
.spa-im-directoryChevron { width: 18px; height: 18px; display: grid; place-items: center; color: var(--dsw-alias-label-tertiary, #8f959e); }
.spa-im-directoryChevron svg { width: 17px; height: 17px; }
.spa-im-directoryPickerState { min-height: 210px; display: grid; place-content: center; justify-items: center; gap: 10px; color: var(--dsw-alias-label-secondary, #646a73); text-align: center; }
.spa-im-directoryPickerState p { margin: 0; font-size: 13px; line-height: 1.6; }
.spa-im-directoryPickerSpinner { width: 24px; height: 24px; border: 3px solid var(--dsw-alias-border-l2, #e6e8eb); border-top-color: var(--spa-im-blue); border-radius: 50%; animation: spa-im-spin .8s linear infinite; }
.spa-im-directoryPickerError { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 8px 0 0; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #d54941) 22%, var(--dsw-alias-border-l2, #dfe1e5)); border-radius: 8px; color: var(--dsw-alias-state-error-primary, #d54941); background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d54941) 7%, var(--dsw-alias-bg-layer-1, #fff)); font-size: 12px; line-height: 1.5; }
.spa-im-directoryPickerError button { flex: none; padding: 4px 8px; border: 0; border-radius: 6px; color: inherit; background: transparent; font: inherit; font-weight: 650; cursor: pointer; }
.spa-im-directoryPickerTruncated { margin: 10px 4px 0; color: var(--dsw-alias-label-tertiary, #8f959e); font-size: 12px; line-height: 1.5; }
.spa-im-directoryPickerFooter { display: grid; grid-template-columns: max-content minmax(0, 1fr) max-content; align-items: center; gap: 14px; padding: 16px 20px; border-top: 1px solid var(--dsw-alias-border-l1, #eef0f3); background: var(--dsw-alias-bg-layer-1, #fff); }
.spa-im-directoryHidden { display: inline-flex; align-items: center; gap: 7px; padding: 2px 0; border: 0; color: var(--dsw-alias-label-secondary, #646a73); background: transparent; font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer; }
.spa-im-directoryHidden:focus-visible { outline: 2px solid color-mix(in srgb, var(--spa-im-blue) 65%, white); outline-offset: 2px; }
.spa-im-directoryHidden:disabled { cursor: not-allowed; opacity: .52; }
.spa-im-directoryHiddenBox { position: relative; width: 15px; height: 15px; flex: 0 0 15px; border: 1px solid var(--dsw-alias-border-l2, #c9cdd4); border-radius: 4px; background: var(--dsw-alias-bg-layer-1, #fff); }
.spa-im-directoryHidden[aria-pressed="true"] .spa-im-directoryHiddenBox { border-color: var(--spa-im-blue); background: var(--spa-im-blue); }
.spa-im-directoryHidden[aria-pressed="true"] .spa-im-directoryHiddenBox::after { content: ""; position: absolute; left: 4px; top: 1px; width: 4px; height: 8px; border: solid white; border-width: 0 2px 2px 0; transform: rotate(45deg); }
.spa-im-directoryPickerNotice { min-width: 0; margin: 0; color: var(--dsw-alias-label-tertiary, #8f959e); font-size: 11px; line-height: 1.45; text-align: right; }
.spa-im-directoryPickerActions { display: flex; gap: 8px; }
.spa-im-directoryPickerActions button { min-height: 36px; padding: 0 14px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 13px; font-weight: 560; white-space: nowrap; cursor: pointer; }
.spa-im-directoryPickerActions .spa-im-directoryPickerPrimary { border-color: var(--spa-im-blue); color: #fff; background: var(--spa-im-blue); }
.spa-im-directoryPickerActions button:hover:not(:disabled) { filter: brightness(.97); }
.spa-im-directoryPickerActions button:disabled { cursor: not-allowed; opacity: .52; }
.spa-im-panel .spa-im-cardSummary { min-width: 0; color: var(--dsw-alias-label-secondary, #646a73); font: inherit; font-size: 12px; font-weight: 400; line-height: normal; overflow-wrap: anywhere; white-space: normal; }
.spa-im-panel .spa-im-cardFooterLayout { min-width: 0; width: 100%; display: flex; flex-direction: column; align-items: stretch; gap: 9px; }
.spa-im-panel .spa-im-cardFooterLayout > .spa-im-cardActions { align-self: stretch; }
.spa-im-panel .spa-im-cardFeedback { width: 100%; padding: 8px 10px; border-radius: 8px; color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-bg-module-platform, #f7f8fa); font: inherit; font-size: 12px; font-weight: 400; line-height: 18px; overflow-wrap: anywhere; white-space: normal; }
.spa-im-panel .spa-im-cardActions { flex: none; width: 100%; display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin: 0; }
.spa-im-panel .spa-im-cardActions .spa-im-cardAction { flex: none; min-height: 32px; padding: 0 11px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 13px; font-weight: 560; line-height: normal; white-space: nowrap; }
.spa-im-panel .spa-im-cardActions .spa-im-cardAction:hover:not(:disabled) { border-color: #aeb3bb; background: var(--dsw-alias-interactive-bg-hover, #f7f8fa); }
.spa-im-panel .spa-im-cardActions .spa-im-cardAction[data-kind="danger"] { color: var(--dsw-alias-state-error-primary, #d54941); }
/* Header tooltips may extend beyond the card; the collapsible body clips its own content. */
.spa-im-panel .spa-im-botCard { position: relative; min-width: 0; width: 100%; max-width: 100%; overflow: visible; border: 1px solid var(--dsw-alias-border-l2, #e5e6eb); border-radius: 14px; background: var(--dsw-alias-bg-layer-1, #fff); box-shadow: 0 1px 2px rgb(31 35 41 / 3%); }
.spa-im-panel .spa-im-botCard::before { display: none; }
.spa-im-panel .spa-im-botCardBody { position: relative; min-width: 0; width: 100%; max-width: 100%; padding: 12px 8px; }
.spa-im-collapsibleAccount { min-width: 0; display: flex; flex-direction: column; }
.spa-im-collapsibleHead { min-width: 0; display: flex; align-items: center; gap: 4px; cursor: pointer; user-select: none; -webkit-user-select: none; }
.spa-im-collapsibleHeaderContent { min-width: 0; flex: 1 1 auto; display: flex; align-items: center; }
/* Keep the original header footprint; center both icons with equal side space. */
.spa-im-accountSettingsToggle { flex: none; width: 45px; height: 32px; display: inline-flex; gap: 5px; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 8px; color: var(--dsw-alias-state-business-primary, #3370ff); background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #3370ff) 8%, var(--dsw-alias-bg-layer-1, #fff)); cursor: pointer; }
.spa-im-accountSettingsToggle > svg { flex: none; display: block; }
.spa-im-accountSettingsToggle:hover { background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #3370ff) 14%, var(--dsw-alias-bg-layer-1, #fff)); }
.spa-im-accountSettingsToggle:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #3370ff); outline-offset: 2px; }
.spa-im-collapsibleChevron { width: 12px; height: 16px; transition: transform .22s cubic-bezier(.4, 0, .2, 1); transform-origin: 50% 50%; }
.spa-im-accountSettingsToggle[aria-expanded="true"] .spa-im-collapsibleChevron { transform: rotate(180deg); }
.spa-im-accountSettingsHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--dsw-alias-border-l2, #e5e6eb); color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; }
/* Animate height without measuring content; hide collapsed controls from focus and accessibility. */
.spa-im-collapsibleBody { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .22s cubic-bezier(.4, 0, .2, 1); }
.spa-im-collapsibleAccount.is-open > .spa-im-collapsibleBody { grid-template-rows: 1fr; }
.spa-im-collapsibleBodyInner { min-height: 0; overflow: hidden; }
.spa-im-collapsibleAccount:not(.is-open) .spa-im-collapsibleBodyInner { visibility: hidden; }
/* Reclaim horizontal spacing for names while keeping status on the same row,
   including when a channel's mobile stylesheet requests a column layout. */
.spa-im-panel .spa-im-botCardTop { min-width: 0; width: 100%; max-width: 100%; display: flex; flex-direction: row; flex-wrap: nowrap; align-items: flex-start; justify-content: space-between; gap: 6px; }
.spa-im-panel .spa-im-botIdentity { min-width: 0; flex: 1 1 0; display: flex; align-items: center; gap: 6px; }
.spa-im-panel .spa-im-botAvatar { flex: none; width: 38px; height: 38px; display: grid; place-items: center; overflow: hidden; border-radius: 11px; box-shadow: none; }
.spa-im-panel .spa-im-botAvatar svg { width: 27px; height: 27px; }
.spa-im-panel .spa-im-botName { min-width: 0; flex: 1; }
.spa-im-panel .spa-im-aliasName { gap: 2px; }
.spa-im-panel .spa-im-botName h3 { overflow: hidden; margin: 0; color: var(--dsw-alias-label-primary, #1f2329); font-size: 15px; font-weight: 650; line-height: normal; text-overflow: ellipsis; white-space: nowrap; }
.spa-im-panel .spa-im-botName p { overflow: hidden; margin: 4px 0 0; color: var(--dsw-alias-label-secondary, #646a73); font: 12px ui-monospace, SFMono-Regular, monospace; line-height: normal; text-overflow: ellipsis; white-space: nowrap; }
.spa-im-panel .spa-im-botCardTools { flex: none; display: flex; align-items: flex-start; gap: 4px; }
.spa-im-panel .spa-im-botHealthGroup { min-width: 0; max-width: 100%; flex: none; display: grid; justify-items: end; gap: 5px; }
.spa-im-panel .spa-im-botCard .spa-im-botHealth { flex: none; min-height: 0; display: inline-flex; align-items: center; gap: 7px; padding: 0; border: 0; border-radius: 0; color: var(--dsw-alias-label-secondary, #646a73); background: transparent; font: inherit; font-size: 12px; font-weight: 400; line-height: normal; white-space: nowrap; }
.spa-im-panel .spa-im-lastChecked { display: inline-flex; align-items: baseline; gap: 4px; color: var(--dsw-alias-label-tertiary, #8f959e); font: inherit; font-size: 11px; font-weight: 400; line-height: normal; white-space: nowrap; }
.spa-im-panel .spa-im-botCard .spa-im-healthDot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: #aeb3bb; box-shadow: none; }
.spa-im-panel .spa-im-botCard .spa-im-healthDot[data-tone="success"] { background: var(--dsw-alias-state-success-primary, #20a162); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-success-primary, #20a162) 14%, transparent); }
.spa-im-panel .spa-im-botCard .spa-im-healthDot[data-tone="warning"] { background: var(--dsw-alias-state-warn-primary, #d97706); }
.spa-im-panel .spa-im-botCard .spa-im-healthDot[data-tone="error"] { background: var(--dsw-alias-state-error-primary, #d54941); }
.spa-im-botSettingsAction { position: relative; flex: none; display: inline-flex; }
.spa-im-botSettingsButton { min-height: 32px; display: inline-flex; align-items: center; gap: 6px; padding: 0 6px; border: 0; border-radius: 8px; color: var(--dsw-alias-state-business-primary, #3370ff); background: transparent; font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer; transition: color .15s ease, background .15s ease; }
.spa-im-botSettingsButton:hover { color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-interactive-bg-hover, #eef0f3); }
.spa-im-botSettingsButton:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #3370ff); outline-offset: 2px; }
.spa-im-moreSettingsChevron { width: 6px; height: 6px; margin-right: 2px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(-45deg); }
.spa-im-deliveryPage { min-width: 0; display: grid; }
.spa-im-deliveryHeader { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.spa-im-botSettingsTabsBar { min-width: 0; display: flex; align-items: center; gap: 4px; margin-top: 10px; border-bottom: 1px solid var(--dsw-alias-border-l2, #dfe1e5); }
.spa-im-botSettingsTabs { min-width: 0; flex: 1; overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: none; }
.spa-im-botSettingsTabs::-webkit-scrollbar { display: none; }
.spa-im-botSettingsTabsList { width: max-content; min-width: 100%; display: flex; align-items: flex-end; gap: 24px; }
.spa-im-botSettingsScroll { flex: 0 0 30px; width: 30px; height: 32px; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary, #646a73); cursor: pointer; }
.spa-im-botSettingsScroll:hover:not(:disabled) { color: var(--dsw-alias-state-business-primary, #3370ff); background: var(--dsw-alias-interactive-bg-hover, #eef0f3); }
.spa-im-botSettingsScroll:disabled { opacity: .3; cursor: default; }
.spa-im-botSettingsScroll:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #3370ff); outline-offset: -2px; }
.spa-im-botSettingsTab { position: relative; min-height: 38px; flex: none; display: inline-flex; align-items: center; justify-content: center; padding: 6px 2px 9px; border: 0; color: var(--dsw-alias-label-secondary, #646a73); background: transparent; font: inherit; font-size: 13px; line-height: 20px; font-weight: 560; white-space: nowrap; cursor: pointer; transition: color .15s ease; }
.spa-im-botSettingsTab::after { content: ''; position: absolute; right: 0; bottom: -1px; left: 0; height: 2px; border-radius: 2px 2px 0 0; background: transparent; transform: scaleX(.45); transition: background .15s ease, transform .15s ease; }
.spa-im-botSettingsTab:hover:not([aria-selected="true"]) { color: var(--dsw-alias-label-primary, #1f2329); }
.spa-im-botSettingsTab[aria-selected="true"] { color: var(--dsw-alias-state-business-primary, #3370ff); font-weight: 650; }
.spa-im-botSettingsTab[aria-selected="true"]::after { background: var(--dsw-alias-state-business-primary, #3370ff); transform: scaleX(1); }
.spa-im-botSettingsTab:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #3370ff); outline-offset: -2px; border-radius: 5px; }
.spa-im-botSettingsTabPanel { min-width: 0; display: grid; gap: 14px; padding-top: 14px; }
.spa-im-feishuGroupSettings { min-width: 0; display: grid; gap: 14px; }
.spa-im-feishuGroupControls { min-width: 0; display: grid; gap: 12px; }
.spa-im-feishuGroupControl { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; padding: 16px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 12px; background: var(--dsw-alias-bg-layer-3, #fff); }
.spa-im-feishuGroupControlHeader { position: relative; min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.spa-im-feishuGroupControlHeader h3 { min-width: 0; margin: 0; color: var(--dsw-alias-label-primary, #1f2329); font-size: 14px; line-height: 21px; font-weight: 650; }
.spa-im-feishuGroupControlStatus { flex: none; color: var(--dsw-alias-label-tertiary, #8f959e); font-size: 11px; line-height: 17px; }
.spa-im-feishuGroupSelect { min-width: 0; width: 100%; height: 38px; padding: 0 34px 0 11px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 13px; line-height: 38px; cursor: pointer; transition: border-color .15s ease, box-shadow .15s ease; }
.spa-im-feishuGroupSelect:hover:not(:disabled) { border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary, #3370ff) 42%, var(--dsw-alias-border-l2, #dfe1e5)); }
.spa-im-feishuGroupSelect:focus-visible { outline: none; border-color: var(--dsw-alias-state-business-primary, #3370ff); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary, #3370ff) 15%, transparent); }
.spa-im-feishuGroupSelect:disabled { cursor: not-allowed; opacity: .55; }
.spa-im-feishuGroupHelp { margin: -2px 0 0; color: var(--dsw-alias-label-tertiary, #8f959e); font-size: 12px; line-height: 19px; }
.spa-im-feishuVoiceForm { min-width: 0; display: grid; gap: 10px; }
.spa-im-feishuVoiceField { min-width: 0; display: grid; gap: 5px; }
.spa-im-feishuVoiceLabel { color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: 18px; }
.spa-im-feishuVoiceInput { min-width: 0; width: 100%; height: 36px; padding: 0 11px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 13px; line-height: 36px; transition: border-color .15s ease, box-shadow .15s ease; }
.spa-im-feishuVoiceInput:hover:not(:disabled) { border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary, #3370ff) 42%, var(--dsw-alias-border-l2, #dfe1e5)); }
.spa-im-feishuVoiceInput:focus-visible { outline: none; border-color: var(--dsw-alias-state-business-primary, #3370ff); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary, #3370ff) 15%, transparent); }
.spa-im-feishuVoiceInput:disabled { cursor: not-allowed; opacity: .55; }
.spa-im-feishuVoiceActions { display: flex; justify-content: flex-start; }
.spa-im-feishuVoiceSave { height: 34px; padding: 0 15px; border: 1px solid var(--dsw-alias-state-business-primary, #3370ff); border-radius: 8px; color: var(--dsw-alias-state-business-primary, #3370ff); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 13px; line-height: 32px; cursor: pointer; transition: border-color .15s ease, color .15s ease, background .15s ease; }
.spa-im-feishuVoiceSave:hover:not(:disabled) { color: #0f5fce; border-color: #0f5fce; background: color-mix(in srgb, #3370ff 6%, var(--dsw-alias-bg-layer-1, #fff)); }
.spa-im-feishuVoiceSave:disabled { cursor: not-allowed; opacity: .55; }
.spa-im-feishuGroupPermissionAction { display: flex; justify-content: flex-start; }
.spa-im-feishuGroupPermissionAction .spa-im-deliveryButton { color: var(--dsw-alias-state-business-primary, #3370ff); border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary, #3370ff) 30%, var(--dsw-alias-border-l2, #dfe1e5)); }
.spa-im-feishuGroupError, .spa-im-feishuGroupRefreshError { margin: 0; padding: 9px 11px; border-radius: 8px; font-size: 12px; line-height: 18px; }
.spa-im-feishuGroupError, .spa-im-feishuGroupRefreshError { color: var(--dsw-alias-state-error-primary, #d54941); background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d54941) 7%, var(--dsw-alias-bg-layer-1, #fff)); }
.spa-im-feishuPanelList { display: grid; gap: 7px; margin: 0; padding: 0; list-style: none; }
.spa-im-feishuPanelRow { min-width: 0; display: grid; grid-template-columns: max-content minmax(0, 1fr) max-content; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1, #eef0f3); border-radius: 9px; background: var(--dsw-alias-bg-module-platform, #f7f8fa); }
.spa-im-feishuPanelIndex { min-width: 18px; color: var(--dsw-alias-label-tertiary, #8f959e); font-size: 11px; line-height: 17px; text-align: right; }
.spa-im-feishuPanelCommand { min-width: 0; color: var(--dsw-alias-label-primary, #1f2329); font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
.spa-im-feishuPanelRowActions, .spa-im-feishuPanelAdd { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.spa-im-feishuPanelRow .spa-im-deliveryButton { min-height: 28px; padding: 0 9px; font-size: 12px; }
.spa-im-feishuPanelAdd { margin-top: 2px; }
.spa-im-feishuPanelAdd .spa-im-feishuGroupSelect { flex: 1 1 220px; width: auto; }
.spa-im-feishuPanelFooter { display: flex; justify-content: flex-start; }
.spa-im-feishuGroupAuthorization { min-width: 0; display: grid; grid-template-columns: 184px minmax(0, 1fr); align-items: start; gap: 24px; padding: 18px; border: 1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary, #3370ff) 30%, var(--dsw-alias-border-l2, #dfe1e5)); border-radius: 12px; background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #3370ff) 2.5%, var(--dsw-alias-bg-layer-3, #fff)); }
.spa-im-feishuGroupAuthorizationState { min-height: 126px; grid-template-columns: 32px minmax(0, 1fr); align-items: center; }
.spa-im-feishuGroupAuthorizationState h3, .spa-im-feishuGroupAuthorizationError h3, .spa-im-feishuGroupAuthorizationCopy h3 { margin: 0; color: var(--dsw-alias-label-primary, #1f2329); font-size: 16px; line-height: 24px; font-weight: 650; }
.spa-im-feishuGroupAuthorizationState p, .spa-im-feishuGroupAuthorizationError p, .spa-im-feishuGroupAuthorizationCopy > p { margin: 5px 0 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: 19px; }
.spa-im-feishuGroupSpinner { width: 24px; height: 24px; border: 3px solid var(--dsw-alias-border-l2, #dfe1e5); border-top-color: var(--dsw-alias-state-business-primary, #3370ff); border-radius: 50%; animation: spa-im-spin .8s linear infinite; }
.spa-im-feishuGroupAuthorizationError { grid-template-columns: minmax(0, 1fr) max-content; align-items: center; border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d54941) 28%, var(--dsw-alias-border-l2, #dfe1e5)); background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d54941) 4%, var(--dsw-alias-bg-layer-3, #fff)); }
.spa-im-feishuGroupAuthorizationError code { display: inline-block; margin-top: 6px; color: var(--dsw-alias-label-tertiary, #8f959e); font: 11px/17px ui-monospace, SFMono-Regular, Menlo, monospace; }
.spa-im-feishuGroupQrColumn { min-width: 0; }
.spa-im-feishuGroupQrFrame { position: relative; width: 176px; height: 176px; display: grid; place-items: center; padding: 10px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 11px; background: #fff; box-shadow: 0 6px 18px rgb(31 35 41 / 7%); }
.spa-im-feishuGroupQrFrame img { width: 100%; height: 100%; display: block; object-fit: contain; }
.spa-im-feishuGroupQrFallback { width: 100%; height: 100%; display: grid; place-content: center; justify-items: center; gap: 7px; border-radius: 7px; color: var(--dsw-alias-state-business-primary, #3370ff); background: #f7f9ff; text-align: center; }
.spa-im-feishuGroupQrFallback span { color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 17px; }
.spa-im-feishuGroupQrExpired { position: absolute; inset: 10px; display: grid; place-content: center; gap: 2px; border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: rgb(255 255 255 / 94%); backdrop-filter: blur(3px); text-align: center; }
.spa-im-feishuGroupQrExpired span { font-size: 13px; line-height: 20px; font-weight: 650; }
.spa-im-feishuGroupQrExpired small { color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 17px; }
.spa-im-feishuGroupCountdown { width: 176px; display: grid; grid-template-columns: minmax(0, 1fr) max-content; gap: 5px 10px; margin-top: 9px; color: var(--dsw-alias-label-tertiary, #8f959e); font-size: 11px; line-height: 17px; font-variant-numeric: tabular-nums; }
.spa-im-feishuGroupCountdown strong { color: var(--dsw-alias-label-secondary, #646a73); font-weight: 600; }
.spa-im-feishuGroupProgress { grid-column: 1 / -1; height: 3px; overflow: hidden; border-radius: 99px; background: var(--dsw-alias-bg-module-platform, #f2f3f5); }
.spa-im-feishuGroupProgress > span { display: block; height: 100%; border-radius: inherit; background: var(--dsw-alias-state-business-primary, #3370ff); transition: width 1s linear; }
.spa-im-feishuGroupAuthorizationCopy { min-width: 0; }
.spa-im-feishuGroupAuthorizationEyebrow { display: block; margin-bottom: 7px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 17px; font-weight: 600; }
.spa-im-feishuGroupAuthorizationCopy ol { display: grid; gap: 6px; margin: 13px 0 0; padding-left: 18px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 18px; }
.spa-im-feishuGroupAuthorizationActions { display: flex; align-items: center; justify-content: flex-start; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.spa-im-feishuGroupAuthorizationLink { text-decoration: none; }
.spa-im-deliveryDocsLink { min-height: 30px; flex: none; display: inline-flex; align-items: center; gap: 4px; padding: 5px 8px; border-radius: 7px; color: var(--dsw-alias-state-business-primary, #3370ff); font-size: 12px; line-height: 18px; text-decoration: none; white-space: nowrap; }
.spa-im-deliveryDocsLink:hover { background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #3370ff) 8%, transparent); }
.spa-im-deliveryDocsLink:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #3370ff); outline-offset: 2px; }
.spa-im-deliveryButton { min-height: 30px; display: inline-flex; align-items: center; justify-content: center; padding: 5px 10px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 12px; line-height: 18px; cursor: pointer; }
.spa-im-deliveryButton:hover:not(:disabled) { border-color: #aeb3bb; background: var(--dsw-alias-interactive-bg-hover, #eef0f3); }
.spa-im-deliveryButton:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #3370ff); outline-offset: 2px; }
.spa-im-deliveryButton:disabled { opacity: .5; cursor: not-allowed; }
.spa-im-deliveryButton[data-kind="primary"] { border-color: var(--dsw-alias-state-business-primary, #3370ff); color: #fff; background: var(--dsw-alias-state-business-primary, #3370ff); }
.spa-im-deliveryButton[data-kind="danger"] { color: var(--dsw-alias-state-error-primary, #d54941); }
.spa-im-deliveryBack { flex: none; border-color: transparent; background: transparent; }
.spa-im-deliveryIdentity, .spa-im-deliveryTargets { min-width: 0; padding: 16px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 12px; background: var(--dsw-alias-bg-layer-3, #fff); }
.spa-im-deliveryIdentityHeading { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.spa-im-deliveryBotName, .spa-im-deliverySectionHeading h3 { min-width: 0; overflow: hidden; margin: 0; font-size: 15px; line-height: 22px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.spa-im-deliveryIdentity > div:first-child p, .spa-im-deliverySectionHeading p { margin: 2px 0 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: 18px; }
.spa-im-deliveryBotId { min-width: 0; display: grid; grid-template-columns: max-content minmax(0, 1fr) max-content; align-items: center; gap: 10px; margin-top: 12px; padding: 10px 12px; border-radius: 9px; background: var(--dsw-alias-bg-module-platform, #f7f8fa); }
.spa-im-deliveryBotId > span { color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; }
.spa-im-deliveryBotId code { min-width: 0; overflow: hidden; font: 12px/18px ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
.spa-im-deliverySectionHeading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.spa-im-deliveryState { margin-top: 14px; padding: 24px 16px; border: 1px dashed var(--dsw-alias-border-l2, #dfe1e5); border-radius: 10px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: 19px; text-align: center; }
.spa-im-deliveryState p { margin: 5px 0; }
.spa-im-deliveryEmpty strong { color: var(--dsw-alias-label-primary, #1f2329); font-size: 13px; }
.spa-im-targetList { display: grid; gap: 10px; margin: 14px 0 0; padding: 0; list-style: none; }
.spa-im-targetRow { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) max-content; gap: 8px 14px; padding: 13px; border: 1px solid var(--dsw-alias-border-l1, #eef0f3); border-radius: 10px; background: var(--dsw-alias-bg-layer-1, #fff); }
.spa-im-targetSummary { min-width: 0; }
.spa-im-targetTitle { min-width: 0; display: flex; align-items: center; gap: 7px; }
.spa-im-targetTitle strong { overflow: hidden; font-size: 13px; line-height: 20px; font-weight: 620; text-overflow: ellipsis; white-space: nowrap; }
.spa-im-targetTitle span { flex: none; padding: 1px 6px; border-radius: 5px; color: var(--dsw-alias-state-business-primary, #3370ff); background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #3370ff) 9%, transparent); font-size: 10px; line-height: 16px; }
.spa-im-targetSummary code { display: block; overflow: hidden; margin-top: 3px; color: var(--dsw-alias-label-secondary, #646a73); font: 11px/17px ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
.spa-im-targetActions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
.spa-im-targetSessionSync { grid-column: 1 / -1; min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 9px; border-top: 1px solid var(--dsw-alias-border-l1, #eef0f3); cursor: pointer; }
.spa-im-targetSessionSyncCopy { min-width: 0; display: grid; gap: 1px; }
.spa-im-targetSessionSyncCopy strong { color: var(--dsw-alias-label-primary, #1f2329); font-size: 12px; line-height: 18px; font-weight: 600; }
.spa-im-targetSessionSyncCopy small { color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 17px; }
.spa-im-targetSessionSync input { width: 16px; height: 16px; flex: none; margin: 0; accent-color: var(--dsw-alias-state-business-primary, #3370ff); }
.spa-im-targetSessionSync:has(input:disabled) { cursor: default; }
.spa-im-targetFeedback { grid-column: 1 / -1; margin: 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 17px; }
.spa-im-targetFeedback[data-tone="success"] { color: var(--dsw-alias-state-success-primary, #20a162); }
.spa-im-targetFeedback[data-tone="error"], .spa-im-targetFormError { color: var(--dsw-alias-state-error-primary, #d54941); }
.spa-im-targetDeleteConfirm { grid-column: 1 / -1; padding: 10px 12px; border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d54941) 7%, var(--dsw-alias-bg-layer-1, #fff)); }
.spa-im-targetDeleteConfirm p { margin: 0 0 8px; font-size: 12px; line-height: 18px; }
.spa-im-targetSuggestions { margin-top: 14px; padding: 14px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 10px; background: var(--dsw-alias-bg-module-platform, #f7f8fa); }
.spa-im-targetSuggestionHeading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.spa-im-targetSuggestionHeading h3 { margin: 0; font-size: 14px; line-height: 21px; }
.spa-im-targetSuggestionHeading p { margin: 2px 0 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 17px; }
.spa-im-targetSuggestionState { margin-top: 12px; padding: 18px 12px; border: 1px dashed var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: 18px; text-align: center; }
.spa-im-targetSuggestionState p { margin: 4px 0; }
.spa-im-targetSuggestionState strong { color: var(--dsw-alias-label-primary, #1f2329); }
.spa-im-targetSuggestionField { min-width: 0; display: grid; gap: 5px; margin-top: 12px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 16px; }
.spa-im-targetSuggestionField select { width: 100%; min-width: 0; height: 38px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 12px; cursor: pointer; }
.spa-im-targetSuggestionField select:focus { outline: 2px solid color-mix(in srgb, var(--dsw-alias-state-business-primary, #3370ff) 28%, transparent); border-color: var(--dsw-alias-state-business-primary, #3370ff); }
.spa-im-targetForm { margin-top: 14px; padding: 14px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 10px; background: var(--dsw-alias-bg-module-platform, #f7f8fa); }
.spa-im-targetFormHeading h3 { margin: 0; font-size: 14px; line-height: 21px; }
.spa-im-targetFormHeading p { margin: 2px 0 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 17px; }
.spa-im-targetFormGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px 12px; margin-top: 12px; }
.spa-im-targetField { min-width: 0; display: grid; align-content: start; gap: 5px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 16px; }
.spa-im-targetField input, .spa-im-targetField select { width: 100%; min-width: 0; height: 34px; padding: 0 9px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 7px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 12px; }
.spa-im-targetField input:focus, .spa-im-targetField select:focus { outline: 2px solid color-mix(in srgb, var(--dsw-alias-state-business-primary, #3370ff) 28%, transparent); border-color: var(--dsw-alias-state-business-primary, #3370ff); }
.spa-im-targetField input[readonly] { color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-bg-module-platform, #f7f8fa); }
.spa-im-targetFormError { margin: 10px 0 0; font-size: 12px; line-height: 18px; }
.spa-im-targetFormActions { display: flex; justify-content: flex-end; gap: 7px; margin-top: 12px; }
.spa-im-dsBotForm { margin-top: 20px; }
.spa-im-dsBotForm .spa-im-targetFormGrid { grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); margin-top: 0; gap: 16px; }
.spa-im-dsBotForm .spa-im-targetFormActions { margin-top: 16px; }
.spa-im-targetRow.spa-im-dsBotBinding { grid-template-columns: minmax(0, 1fr) max-content; align-items: center; }
.spa-im-dsBotDestination { margin: 3px 0 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
.spa-im-dsBotNotice { margin: 20px 0 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: 20px; }
.spa-im-dsBotNotice p { margin: 0 0 10px; }
.spa-im-dsBotSettings > .spa-im-targetFeedback { margin-top: 12px; }
.spa-im-dsBotAvatar { display: block; flex: none; object-fit: cover; border-radius: 5px; }
.spa-im-dsBotBoundIdentity { display: flex; align-items: center; gap: 10px; min-width: 0; }
.spa-im-dsBotPicker { position: relative; min-width: 0; }
.spa-im-dsBotPickerTrigger { display: flex; align-items: center; gap: 8px; width: 100%; height: 34px; padding: 0 9px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 7px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.spa-im-dsBotPickerName { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spa-im-dsBotPickerTrigger:focus-visible { outline: 2px solid color-mix(in srgb, var(--dsw-alias-state-business-primary, #3370ff) 28%, transparent); border-color: var(--dsw-alias-state-business-primary, #3370ff); }
.spa-im-dsBotPickerTrigger:disabled { opacity: .5; cursor: not-allowed; }
.spa-im-dsBotOptions { position: absolute; z-index: 20; inset: calc(100% + 5px) 0 auto; max-height: 240px; overflow-y: auto; padding: 4px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 9px; background: var(--dsw-alias-bg-layer-1, #fff); box-shadow: 0 5px 18px rgb(0 0 0 / 10%); }
.spa-im-dsBotOptions > button { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 36px; padding: 5px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-primary, #1f2329); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.spa-im-dsBotOptions > button[data-active="true"] { background: var(--dsw-alias-interactive-bg-hover, #eef0f3); }
.spa-im-dsBotOptions > button[aria-selected="true"] { color: var(--dsw-alias-state-business-primary, #3370ff); }
.spa-im-accessPage { min-width: 0; display: grid; gap: 14px; }
.spa-im-accessScene { position: relative; min-width: 0; margin: 0; padding: 16px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 12px; background: var(--dsw-alias-bg-layer-3, #fff); }
.spa-im-accessScene > legend { padding: 0 6px; color: var(--dsw-alias-label-primary, #1f2329); font-size: 15px; line-height: 22px; font-weight: 650; }
.spa-im-accessLegendContent { display: inline-flex; align-items: center; gap: 6px; }
.spa-im-panel .spa-im-accessLegendHelp { position: static; }
.spa-im-accessLegendHelp .spa-im-channelTooltip { top: 20px; right: auto; left: 16px; width: min(320px, calc(100% - 32px)); max-width: none; }
.spa-im-accessControls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.spa-im-accessControls[data-mode="allowlist"] { grid-template-columns: minmax(0, 1fr); }
.spa-im-accessField { min-width: 0; display: grid; align-content: start; gap: 5px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 16px; }
.spa-im-accessField input, .spa-im-accessField select { width: 100%; min-width: 0; height: 36px; padding: 0 9px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 7px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 12px; }
.spa-im-accessField textarea { width: 100%; min-width: 0; padding: 7px 9px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 7px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 12px; line-height: 18px; resize: vertical; }
.spa-im-accessField textarea:focus { outline: 2px solid color-mix(in srgb, var(--dsw-alias-state-business-primary, #3370ff) 28%, transparent); border-color: var(--dsw-alias-state-business-primary, #3370ff); }
.spa-im-accessField textarea:disabled { opacity: .6; }
.spa-im-groupTriggerValue { color: var(--dsw-alias-label-primary, #1f2329); font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
.spa-im-accessField input:focus, .spa-im-accessField select:focus { outline: 2px solid color-mix(in srgb, var(--dsw-alias-state-business-primary, #3370ff) 28%, transparent); border-color: var(--dsw-alias-state-business-primary, #3370ff); }
.spa-im-accessUsers { min-width: 0; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
.spa-im-accessUsersHeading { position: relative; min-width: 0; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.spa-im-accessUsersHeading > div { min-width: 0; }
.spa-im-accessUsersTitle { display: inline-flex; align-items: center; gap: 6px; }
.spa-im-accessUsersHeading strong { color: var(--dsw-alias-label-primary, #1f2329); font-size: 13px; line-height: 20px; font-weight: 620; }
.spa-im-accessUsersHeading p { margin: 2px 0 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 17px; }
.spa-im-panel .spa-im-accessUsersHelp { position: static; }
.spa-im-accessUsersHelp .spa-im-channelTooltip { top: calc(100% + 7px); right: auto; left: 0; width: min(320px, 100%); max-width: none; }
.spa-im-accessAddUser { width: 32px; height: 32px; min-height: 32px; flex: 0 0 32px; padding: 0; font-size: 20px; line-height: 1; }
.spa-im-accessUsersEmpty { margin-top: 10px; padding: 15px 12px; border: 1px dashed var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-tertiary, #8f959e); font-size: 12px; line-height: 18px; text-align: center; }
.spa-im-accessUserList { display: grid; gap: 9px; margin: 10px 0 0; padding: 0; list-style: none; }
.spa-im-accessUserRow { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(145px, 180px) max-content; align-items: end; gap: 10px; padding: 11px; border: 1px solid var(--dsw-alias-border-l1, #eef0f3); border-radius: 9px; background: var(--dsw-alias-bg-module-platform, #f7f8fa); }
.spa-im-accessDeleteUser { margin-bottom: 1px; }
.spa-im-accessUnsupported { padding: 18px 14px; border: 1px dashed var(--dsw-alias-border-l2, #dfe1e5); border-radius: 9px; color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-bg-module-platform, #f7f8fa); text-align: center; }
.spa-im-accessUnsupported strong { color: var(--dsw-alias-label-primary, #1f2329); font-size: 13px; line-height: 20px; }
.spa-im-accessUnsupported p { margin: 4px 0 0; font-size: 12px; line-height: 18px; }
.spa-im-accessState { padding: 11px 13px; border: 1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d97706) 24%, var(--dsw-alias-border-l2, #dfe1e5)); border-radius: 9px; color: var(--dsw-alias-state-warn-primary, #d97706); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d97706) 7%, var(--dsw-alias-bg-layer-1, #fff)); font-size: 12px; line-height: 18px; }
.spa-im-accessFeedback { margin: 0; padding: 10px 12px; border-radius: 8px; color: var(--dsw-alias-label-secondary, #646a73); background: var(--dsw-alias-bg-module-platform, #f7f8fa); font-size: 12px; line-height: 18px; }
.spa-im-accessFeedback[data-tone="success"] { color: var(--dsw-alias-state-success-primary, #20a162); }
.spa-im-accessFeedback[data-tone="error"] { color: var(--dsw-alias-state-error-primary, #d54941); }
.spa-im-accessActions { display: flex; justify-content: flex-end; }
.spa-im-botGeneralSettings { min-width: 0; }
.spa-im-botGeneralList { min-width: 0; display: grid; }
.spa-im-botGeneralRow { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) max-content; align-items: center; gap: 24px; padding: 16px 0; border-bottom: 1px solid var(--dsw-alias-border-l2, #dfe1e5); }
.spa-im-botGeneralRow:last-child { border-bottom: 0; }
.spa-im-botGeneralPanelRow { border-bottom: 0; }
.spa-im-botGeneralText { min-width: 0; display: grid; gap: 4px; }
.spa-im-botGeneralTitle { color: var(--dsw-alias-label-primary, #1f2329); font-size: 14px; line-height: 22px; font-weight: 400; }
.spa-im-botGeneralHelp { margin: 0; color: var(--dsw-alias-label-tertiary, #8f959e); font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
.spa-im-botGeneralPanelHelp { padding-bottom: 16px; border-bottom: 1px solid var(--dsw-alias-border-l2, #dfe1e5); }
.spa-im-botGeneralControl { position: relative; min-width: 0; max-width: 100%; justify-self: end; color: var(--dsw-alias-label-primary, #1f2329); }
.spa-im-botGeneralControl select, .spa-im-groupHistoryInput { display: block; min-width: 104px; max-width: 100%; height: 36px; padding: 0 36px 0 14px; border: 0; border-radius: 10px; color: inherit; background: var(--dsw-alias-bg-module-platform, #f5f6f7); font: inherit; font-size: 14px; line-height: 22px; appearance: none; }
.spa-im-botGeneralControl select { cursor: pointer; }
.spa-im-sidebarSettings { border-bottom: 1px solid var(--dsw-alias-border-l2, #dfe1e5); }
.spa-im-sidebarSettings .spa-im-botGeneralRow { border-bottom: 0; }
.spa-im-sidebarHeading { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; }
.spa-im-sidebarFeedback { display: flex; align-items: center; gap: 12px; padding-bottom: 16px; }
.spa-im-sidebarFeedback .spa-im-accessFeedback { flex: 1; min-width: 0; }
/* Native option popups do not inherit the select's painted background on
   Windows. Set both colors so dark Host text never lands on a light popup. */
.spa-im-sidebarSelect option { color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-3, #fff); }
.spa-im-botGeneralControl select:hover:not(:disabled), .spa-im-groupHistoryInput:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, #eef0f3); }
.spa-im-botGeneralControl select:focus-visible, .spa-im-groupHistoryInput:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #3370ff); outline-offset: 2px; }
.spa-im-botGeneralControl select:disabled, .spa-im-groupHistoryInput:disabled { opacity: .5; cursor: not-allowed; }
.spa-im-botGeneralControl svg { position: absolute; top: 50%; right: 12px; transform: translateY(-50%); pointer-events: none; }
.spa-im-botGeneralControl .spa-im-contextSwitch { display: block; }
.spa-im-botGeneralControl .spa-im-contextSwitch:disabled { opacity: .5; cursor: not-allowed; }
.spa-im-botGeneralControl .spa-im-contextSwitch:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary, #3370ff); outline-offset: 3px; }
.spa-im-botGeneralActions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; padding-top: 16px; }
.spa-im-generalSettingsPage { min-width: 0; display: grid; }
.spa-im-generalSettingsHeader { min-width: 0; margin: 0 0 8px; }
.spa-im-generalSettingsHeader h2 { margin: 0; color: var(--dsw-alias-label-primary, #1f2329); font-size: 18px; line-height: 25px; font-weight: 680; }
.spa-im-generalSettingsTabsBar { min-width: 0; border-bottom: 1px solid var(--dsw-alias-border-l2, #dfe1e5); }
.spa-im-generalSettingsTabs { min-width: 0; display: flex; align-items: flex-end; gap: 24px; overflow-x: auto; scrollbar-width: none; }
.spa-im-generalSettingsTabs::-webkit-scrollbar { display: none; }
.spa-im-generalSettingsTab { position: relative; min-height: 38px; flex: none; display: inline-flex; align-items: center; justify-content: center; padding: 6px 2px 9px; border: 0; color: var(--dsw-alias-label-secondary, #646a73); background: transparent; font: inherit; font-size: 13px; line-height: 20px; font-weight: 560; white-space: nowrap; cursor: pointer; transition: color .15s ease; }
.spa-im-generalSettingsTab::after { content: ''; position: absolute; right: 0; bottom: -1px; left: 0; height: 2px; border-radius: 2px 2px 0 0; background: transparent; transform: scaleX(.45); transition: background .15s ease, transform .15s ease; }
.spa-im-generalSettingsTab:hover:not([aria-selected="true"]) { color: var(--dsw-alias-label-primary, #1f2329); }
.spa-im-generalSettingsTab[aria-selected="true"] { color: var(--spa-im-blue); font-weight: 650; }
.spa-im-generalSettingsTab[aria-selected="true"]::after { background: var(--spa-im-blue); transform: scaleX(1); }
.spa-im-generalSettingsTab:focus-visible { outline: 2px solid var(--spa-im-blue); outline-offset: -2px; border-radius: 5px; }
.spa-im-generalSettingsTabPanel { min-width: 0; padding-top: 14px; }
.spa-im-groupHistoryControl { width: 104px; }
.spa-im-groupHistoryInput { box-sizing: border-box; width: 100%; appearance: textfield; }
.spa-im-groupHistoryInput::-webkit-inner-spin-button, .spa-im-groupHistoryInput::-webkit-outer-spin-button { margin: 0; appearance: none; }
.spa-im-groupHistoryUnit { position: absolute; top: 50%; right: 14px; transform: translateY(-50%); color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: 18px; pointer-events: none; }
.spa-im-deliveryButton.spa-im-groupHistorySave { min-width: 58px; min-height: 36px; border-radius: 10px; }
.spa-im-groupHistoryFeedback { margin-top: 12px; }

.spa-im-globalSection { min-width: 0; padding: 14px 16px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 12px; background: var(--dsw-alias-bg-layer-3, #fff); }
.spa-im-globalSection + .spa-im-globalSection { margin-top: 12px; }
.spa-im-imageSettings { container-type: inline-size; }
.spa-im-imageSettings .spa-im-globalHead { position: relative; }
.spa-im-imageSettings .spa-im-globalTtlHelp { position: static; }
.spa-im-globalTtlTooltip.spa-im-imageSettingsTooltip { width: min(320px, 100%); max-width: none; color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 17px; white-space: normal; overflow-wrap: anywhere; }
.spa-im-imageSettingsFields { min-width: 0; display: grid; gap: 12px; margin-top: 12px; }
.spa-im-imageSettingsField { min-width: 0; display: grid; grid-template-columns: minmax(0, 220px) minmax(0, 160px); align-items: center; gap: 6px 16px; }
.spa-im-imageSettingsField label { min-width: 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 13px; line-height: 20px; overflow-wrap: anywhere; }
.spa-im-imageSettingsField .spa-im-globalTtlInput { width: 100%; min-width: 0; }
.spa-im-imageSettingsActions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.spa-im-globalInline.spa-im-imageSettingsFeedback { margin: 10px 0 0; }
@container (max-width: 380px) {
  .spa-im-imageSettingsField { grid-template-columns: minmax(0, 1fr); }
}
.spa-im-globalHead { min-width: 0; display: flex; align-items: center; }
.spa-im-globalHeadTitle { min-width: 0; display: inline-flex; align-items: center; gap: 6px; }
.spa-im-globalHead h3 { min-width: 0; overflow: hidden; margin: 0; color: var(--dsw-alias-label-primary, #1f2329); font-size: 15px; line-height: 22px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.spa-im-globalTtlHelp { position: relative; display: inline-flex; flex: none; }
.spa-im-globalTtlTooltip { position: absolute; top: calc(100% + 7px); left: 0; z-index: 30; width: max-content; max-width: min(280px, calc(100vw - 48px)); padding: 9px 10px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; background: var(--dsw-alias-bg-layer-3, #fff); box-shadow: 0 10px 28px rgb(31 35 41 / 16%); opacity: 0; visibility: hidden; transform: translateY(-3px); pointer-events: none; transition: opacity .15s ease, transform .15s ease, visibility .15s ease; }
.spa-im-globalTtlHelp:hover .spa-im-globalTtlTooltip, .spa-im-globalTtlHelpButton:focus-visible + .spa-im-globalTtlTooltip { opacity: 1; visibility: visible; transform: translateY(0); }
.spa-im-globalTtlHints { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.spa-im-globalTtlHints li { min-width: 0; display: flex; align-items: baseline; gap: 8px; }
.spa-im-globalTtlHints code { flex: none; min-width: 44px; padding: 0 6px; border-radius: 5px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-module-platform, #f7f8fa); font: 10px/16px ui-monospace, SFMono-Regular, Menlo, monospace; text-align: center; }
.spa-im-globalTtlHints span { min-width: 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 16px; }
.spa-im-globalTtlRow { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; margin-top: 12px; }
.spa-im-globalTtlInput { width: min(160px, 100%); min-width: 110px; max-width: 160px; flex: 1 1 130px; height: 34px; padding: 0 11px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; transition: border-color .16s ease, box-shadow .16s ease; }
.spa-im-globalTtlInput:hover:not(:disabled) { border-color: var(--dsw-alias-border-l3, #bbbfc4); }
.spa-im-globalTtlInput:focus { outline: none; border-color: var(--spa-im-blue); box-shadow: 0 0 0 3px color-mix(in srgb, var(--spa-im-blue) 14%, transparent); }
.spa-im-globalTtlInput[aria-invalid="true"] { border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d54941) 62%, var(--dsw-alias-border-l2, #dfe1e5)); }
.spa-im-globalTtlInput:disabled { cursor: not-allowed; opacity: .55; }
.spa-im-globalSaveButton { min-width: 58px; min-height: 34px; }
.spa-im-globalSweepAction { position: relative; display: inline-flex; flex: none; margin-left: auto; }
.spa-im-globalSweepButton { flex: none; }
.spa-im-globalSweepConfirm { position: absolute; top: calc(100% + 8px); right: 0; z-index: 35; width: 218px; padding: 11px 12px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 9px; background: var(--dsw-alias-bg-layer-3, #fff); box-shadow: 0 12px 30px rgb(31 35 41 / 18%); }
.spa-im-globalSweepConfirm p { margin: 0; color: var(--dsw-alias-label-primary, #1f2329); font-size: 12px; line-height: 18px; }
.spa-im-globalSweepConfirmActions { display: flex; justify-content: flex-end; gap: 7px; margin-top: 10px; }
.spa-im-deliveryButton.spa-im-globalSweepConfirmButton { border-color: var(--dsw-alias-state-error-primary, #d54941); color: #fff; background: var(--dsw-alias-state-error-primary, #d54941); }
.spa-im-deliveryButton.spa-im-globalSweepConfirmButton:hover:not(:disabled) { border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d54941) 82%, #000); background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d54941) 88%, #000); }
.spa-im-globalInline { flex: 1 0 100%; min-width: 0; margin: 2px 0 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 16px; overflow-wrap: anywhere; }
.spa-im-globalInline[data-tone="error"] { color: var(--dsw-alias-state-error-primary, #d54941); }
.spa-im-panel .spa-im-botCard .spa-im-cardFooter { margin-top: 0; }
.spa-im-panel .ddt-headingCopy { display: none; }
.spa-im-panel .ddt-qrFrame, .spa-im-panel .ddt-countdown { width: min(270px, 100%); }
@container (max-width: 680px) {
  .spa-im-panel .spa-feishu-headingTools, .spa-im-panel .dxw-tools, .spa-im-panel .ddt-tools { gap: 6px; }
  .spa-im-panel .spa-im-bindActions { gap: 6px; }
  .spa-im-panel .spa-feishu-headingTools .spa-im-scanButton, .spa-im-panel .dxw-tools .spa-im-scanButton, .spa-im-panel .ddt-tools .spa-im-scanButton, .spa-im-panel .spa-im-credentialButton { gap: 5px; padding-inline: 8px; font-size: 12px; }
  .spa-im-panel .spa-im-actionIcon { width: 13px; height: 13px; flex-basis: 13px; }
  .spa-im-panel .spa-feishu-headingTools .spa-im-onlineBadge, .spa-im-panel .dxw-tools .spa-im-onlineBadge, .spa-im-panel .ddt-tools .spa-im-onlineBadge { padding-inline: 8px; font-size: 11px; }
  .spa-im-panel .spa-im-credentialForm { grid-template-columns: minmax(0, 1fr); }
  .spa-im-panel .spa-im-credentialError, .spa-im-panel .spa-im-credentialActions { grid-column: auto; }
  .spa-im-panel .spa-im-emptyView { min-height: 0; grid-template-columns: minmax(0, 1fr); }
  .spa-im-panel .spa-im-emptyBrand { display: none; }
  .spa-im-panel .spa-im-qrLayout { grid-template-columns: minmax(0, 1fr); justify-items: center; gap: 24px; }
  .spa-im-panel .spa-im-qrColumn { width: 100%; min-width: 0; }
  .spa-im-panel .spa-im-qrCopy { width: 100%; min-width: 0; overflow-wrap: anywhere; }
  .spa-im-panel .ddt-qrLayout { grid-template-columns: minmax(0, 1fr); justify-items: center; gap: 24px; }
  .spa-im-panel .ddt-qrColumn { width: 100%; min-width: 0; }
  .spa-im-panel .ddt-qrCopy { width: 100%; min-width: 0; overflow-wrap: anywhere; }
  .spa-im-targetRow { grid-template-columns: minmax(0, 1fr); }
  .spa-im-targetActions { justify-content: flex-start; }
  .spa-im-targetFormGrid { grid-template-columns: minmax(0, 1fr); }
  .spa-im-targetSuggestionHeading { align-items: stretch; flex-direction: column; }
  .spa-im-accessControls { grid-template-columns: minmax(0, 1fr); }
  .spa-im-accessUserRow { grid-template-columns: minmax(0, 1fr); }
  .spa-im-accessDeleteUser { justify-self: start; }
  .spa-im-feishuGroupAuthorization { grid-template-columns: minmax(0, 1fr); justify-items: center; }
  .spa-im-feishuGroupAuthorizationCopy { width: 100%; }
  .spa-im-feishuGroupAuthorizationState { grid-template-columns: 32px minmax(0, 1fr); justify-items: stretch; }
  .spa-im-feishuGroupAuthorizationError { justify-items: stretch; }
}
@media (max-width: 840px) {
  .spa-im-title { align-items: flex-start; }
  .spa-im-layout { grid-template-columns: minmax(0, 1fr); gap: 18px; }
  .spa-im-rail { grid-template-columns: repeat(2, minmax(0, 1fr)); padding-right: 1px; }
  .spa-im-divider { display: none; }
  .spa-im-channel { min-height: 48px; }
}
@media (max-width: 560px) {
  .spa-im-title { flex-direction: column; gap: 10px; }
  .spa-im-title p { white-space: normal; }
  .spa-im-titleActions { justify-content: flex-start; }
  .spa-im-updateBackdrop { padding: 12px; }
  .spa-im-updateDialog { max-height: calc(100vh - 24px); }
  .spa-im-updateDialog h3 { margin: 18px 18px 8px; }
  .spa-im-updateDescription { margin: 0 18px; }
  .spa-im-updateBody { padding: 16px 18px; }
  .spa-im-updateFooter { padding: 12px 18px; }
  .spa-im-githubTooltip { right: auto; left: 0; }
  .spa-im-rail { grid-template-columns: minmax(0, 1fr); }
  .spa-im-loopbackRecovery { align-items: stretch; flex-direction: column; gap: 12px; }
  .spa-im-loopbackRecoveryAction { width: 100%; }
  .spa-im-deliverySectionHeading { align-items: stretch; flex-direction: column; }
  .spa-im-botSettingsTabsList { gap: 18px; }
  .spa-im-deliveryBotId { grid-template-columns: minmax(0, 1fr) max-content; }
  .spa-im-deliveryBotId > span { grid-column: 1 / -1; }
  .spa-im-targetActions .spa-im-deliveryButton { flex: 1 1 auto; }
  .spa-im-accessActions .spa-im-deliveryButton { width: 100%; }
  .spa-im-feishuGroupAuthorizationActions .spa-im-deliveryButton { flex: 1 1 auto; }
  .spa-im-directoryPickerBackdrop { padding: 10px; }
  .spa-im-directoryPicker { height: calc(100vh - 20px); min-height: 0; border-radius: 14px; }
  .spa-im-directoryPickerHeader { padding: 18px 17px 14px; }
  .spa-im-directoryPickerHeader h3 { font-size: 18px; }
  .spa-im-directoryPathMeta span { display: none; }
  .spa-im-directoryPickerBody { padding: 10px; }
  .spa-im-directoryPickerFooter { grid-template-columns: minmax(0, 1fr) max-content; gap: 10px; padding: 13px 14px; }
  .spa-im-directoryPickerNotice { grid-column: 1 / -1; grid-row: 1; text-align: left; }
}
@media (prefers-reduced-motion: reduce) {
  .spa-im-page * { transition-duration: .01ms !important; }
  .spa-im-directoryPickerSpinner { animation-duration: 1.8s; }
  .spa-im-collapsibleBody, .spa-im-collapsibleChevron { transition: none !important; }
}
/* Delivery-sync settings (General settings -> Delivery tab) */
.spa-im-deliverySyncSettings { container-type: inline-size; }
.spa-im-deliverySyncSettings .spa-im-globalHead { position: relative; }
.spa-im-deliverySyncSettings .spa-im-globalTtlHelp { position: static; }
.spa-im-globalTtlTooltip.spa-im-deliverySyncTooltip { width: min(360px, 100%); max-width: none; color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 17px; white-space: normal; overflow-wrap: anywhere; }
.spa-im-deliverySyncFields { min-width: 0; display: grid; gap: 16px; margin-top: 12px; }
.spa-im-deliverySyncField { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 200px); align-items: start; gap: 8px 16px; }
.spa-im-deliverySyncLabel { min-width: 0; display: grid; gap: 4px; }
.spa-im-deliverySyncLabel > label { color: var(--dsw-alias-label-primary, #1f2329); font-size: 14px; line-height: 22px; }
.spa-im-deliverySyncCheckLabel { display: flex; align-items: center; gap: 8px; }
.spa-im-deliverySyncCheckLabel input[type="checkbox"] { width: 18px; height: 18px; margin: 0; accent-color: var(--dsw-alias-state-business-primary, #3370ff); }
.spa-im-deliverySyncHelp { margin: 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
.spa-im-deliverySyncIcon { min-width: 0; display: grid; gap: 4px; }
.spa-im-deliverySyncFields .spa-im-globalTtlInput { width: 100%; min-width: 0; }
.spa-im-deliverySyncFeedback { margin: 10px 0 0; }
@container (max-width: 460px) { .spa-im-deliverySyncField { grid-template-columns: minmax(0, 1fr); } }
`;

export function installImStyles() {
  if (typeof document === 'undefined') return () => {};
  const existing = document.querySelector(`style[data-plugin-css="${IM_STYLE_ID}"]`);
  if (existing) return () => {};
  const style = document.createElement('style');
  style.dataset.plugin = 'dsh-super-personal-agent';
  style.dataset.pluginCss = IM_STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => style.remove();
}
