export const FEISHU_STYLE_ID = "spa-native-im-feishu-settings";

const CSS = String.raw`
.spa-feishu-page {
  --spa-feishu-accent: var(--dsw-alias-state-business-primary, #3370ff);
  --spa-feishu-success: var(--dsw-alias-state-success-primary, #20a162);
  --spa-feishu-warning: var(--dsw-alias-state-warn-primary, #d97706);
  --spa-feishu-error: var(--dsw-alias-state-error-primary, #d54941);
  box-sizing: border-box;
  width: 100%;
  max-width: 860px;
  color: var(--dsw-alias-label-primary, #1f2329);
  display: flex;
  flex-direction: column;
  container-type: inline-size;
  gap: 18px;
  padding: 2px 0 24px;
}

.spa-feishu-page *, .spa-feishu-page *::before, .spa-feishu-page *::after { box-sizing: border-box; }

.spa-feishu-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.spa-feishu-headingCopy { min-width: 0; }
.spa-feishu-heading h2, .spa-feishu-heading p, .spa-feishu-card h3, .spa-feishu-card p { margin: 0; }

.spa-feishu-eyebrow {
  color: var(--dsw-alias-label-tertiary, #8f959e);
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  letter-spacing: .08em;
  text-transform: uppercase;
  margin-bottom: 3px;
}

.spa-feishu-heading h2 {
  font-size: 20px;
  line-height: 28px;
  font-weight: 650;
  letter-spacing: -.015em;
}

.spa-feishu-heading p {
  max-width: 540px;
  color: var(--dsw-alias-label-secondary, #646a73);
  font-size: 13px;
  line-height: 20px;
  margin-top: 5px;
  white-space: nowrap;
}

.spa-feishu-headingTools {
  width: 100%;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: nowrap;
  gap: 8px;
}

.spa-feishu-totalBadge {
  min-height: 28px;
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  border-radius: 999px;
  padding: 4px 10px;
  color: var(--dsw-alias-label-secondary, #646a73);
  background: var(--dsw-alias-bg-module-platform, #f2f3f5);
  font-size: 11px;
  line-height: 16px;
  white-space: nowrap;
}

.spa-feishu-totalBadge strong { color: var(--spa-feishu-success); font-size: 13px; }

.spa-feishu-card {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2, #dee0e3);
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-3, #fff);
  box-shadow: var(--dsw-shadow-lv1, 0 3px 12px rgba(31, 35, 41, .05));
}

.spa-feishu-card::before {
  content: "";
  pointer-events: none;
  position: absolute;
  inset: 0 0 auto;
  height: 88px;
  background:
    radial-gradient(circle at 86% -35%, color-mix(in srgb, var(--spa-feishu-accent) 18%, transparent), transparent 68%);
  opacity: .85;
}

.spa-feishu-cardBody { position: relative; padding: 24px; }

.spa-feishu-intro {
  min-height: 250px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 172px;
  gap: 32px;
  align-items: center;
}

.spa-feishu-introCopy { max-width: 500px; }

.spa-feishu-stateLabel {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--dsw-alias-label-secondary, #646a73);
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  margin-bottom: 13px;
}

.spa-feishu-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dsw-alias-label-tertiary, #8f959e);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--dsw-alias-label-tertiary, #8f959e) 12%, transparent);
}

.spa-feishu-dot[data-tone="success"] {
  background: var(--spa-feishu-success);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--spa-feishu-success) 13%, transparent);
}

.spa-feishu-dot[data-tone="warning"] {
  background: var(--spa-feishu-warning);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--spa-feishu-warning) 13%, transparent);
}

.spa-feishu-dot[data-tone="error"] {
  background: var(--spa-feishu-error);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--spa-feishu-error) 13%, transparent);
}

.spa-feishu-intro h3 {
  font-size: 24px;
  line-height: 34px;
  font-weight: 650;
  letter-spacing: -.02em;
}

.spa-feishu-introCopy > p {
  max-width: 490px;
  color: var(--dsw-alias-label-secondary, #646a73);
  font-size: 14px;
  line-height: 23px;
  margin-top: 8px;
}

.spa-feishu-note {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  color: var(--dsw-alias-label-tertiary, #8f959e);
  font-size: 12px;
  line-height: 18px;
  margin-top: 16px;
}

.spa-feishu-note svg { flex: none; margin-top: 1px; }

.spa-feishu-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 22px;
}

.spa-feishu-button {
  appearance: none;
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid var(--dsw-alias-border-l2, #dee0e3);
  border-radius: 8px;
  padding: 7px 13px;
  color: var(--dsw-alias-label-primary, #1f2329);
  background: var(--dsw-alias-bg-layer-1, #fff);
  font: inherit;
  font-size: 13px;
  font-weight: 550;
  line-height: 20px;
  text-decoration: none;
  cursor: pointer;
  transition: background .15s var(--ds-ease-in-out, ease), border-color .15s var(--ds-ease-in-out, ease), transform .15s var(--ds-ease-in-out, ease);
}

.spa-feishu-button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, #f2f3f5);
  border-color: var(--dsw-alias-border-l1, #c9cdd4);
}

.spa-feishu-button:active:not(:disabled) { transform: translateY(1px); }

.spa-feishu-button:focus-visible, .spa-feishu-link:focus-visible {
  outline: 2px solid var(--spa-feishu-accent);
  outline-offset: 2px;
}

.spa-feishu-button:disabled { cursor: not-allowed; opacity: .55; }

.spa-feishu-button[data-kind="primary"] {
  border-color: var(--spa-feishu-accent);
  color: #fff;
  background: var(--spa-feishu-accent);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--spa-feishu-accent) 24%, transparent);
}

.spa-feishu-button[data-kind="primary"]:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--spa-feishu-accent) 86%, #000);
  background: color-mix(in srgb, var(--spa-feishu-accent) 90%, #000);
}

.spa-feishu-button[data-kind="danger"] { color: var(--spa-feishu-error); }
.spa-feishu-button[data-size="small"] { min-height: 32px; padding: 5px 10px; font-size: 12px; }
.spa-feishu-bindButton { flex: none; white-space: nowrap; }

.spa-feishu-provisionCard {
  border-color: color-mix(in srgb, var(--spa-feishu-accent) 32%, var(--dsw-alias-border-l2, #dee0e3));
}

.spa-feishu-markStage {
  position: relative;
  width: 156px;
  height: 156px;
  display: grid;
  place-items: center;
  justify-self: end;
}

.spa-feishu-markStage::before, .spa-feishu-markStage::after {
  content: "";
  position: absolute;
  border-radius: 50%;
}

.spa-feishu-markStage::before {
  inset: 12px;
  border: 1px solid color-mix(in srgb, var(--spa-feishu-accent) 18%, var(--dsw-alias-border-l2, #dee0e3));
  background: color-mix(in srgb, var(--spa-feishu-accent) 4%, var(--dsw-alias-bg-layer-1, #fff));
}

.spa-feishu-markStage::after {
  inset: 0;
  border: 1px dashed color-mix(in srgb, var(--spa-feishu-accent) 16%, transparent);
  animation: spa-feishu-rotate 18s linear infinite;
}

.spa-feishu-brandMark {
  position: relative;
  z-index: 1;
  width: 68px;
  height: 68px;
  display: grid;
  place-items: center;
  border-radius: 20px;
  color: #fff;
  background: var(--spa-feishu-accent);
  box-shadow: 0 12px 28px color-mix(in srgb, var(--spa-feishu-accent) 28%, transparent);
}

.spa-feishu-qrLayout {
  display: grid;
  grid-template-columns: 236px minmax(0, 1fr);
  align-items: center;
  gap: 32px;
}

.spa-feishu-qrColumn { min-width: 0; }

.spa-feishu-qrFrame {
  position: relative;
  width: 222px;
  height: 222px;
  display: grid;
  place-items: center;
  border: 1px solid var(--dsw-alias-border-l2, #dee0e3);
  border-radius: 14px;
  padding: 13px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(31, 35, 41, .07);
}

.spa-feishu-qrFrame::before, .spa-feishu-qrFrame::after {
  content: "";
  position: absolute;
  width: 24px;
  height: 24px;
  border-color: var(--spa-feishu-accent);
  border-style: solid;
}

.spa-feishu-qrFrame::before { inset: -3px auto auto -3px; border-width: 2px 0 0 2px; border-radius: 5px 0 0; }
.spa-feishu-qrFrame::after { inset: auto -3px -3px auto; border-width: 0 2px 2px 0; border-radius: 0 0 5px; }
.spa-feishu-qrFrame img { width: 100%; height: 100%; display: block; object-fit: contain; }

.spa-feishu-qrFallback {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: var(--spa-feishu-accent);
  background: #f7f9ff;
  text-align: center;
  padding: 20px;
}

.spa-feishu-qrFallback span { display: block; color: #646a73; font-size: 12px; line-height: 18px; margin-top: 8px; }

.spa-feishu-expiredOverlay {
  position: absolute;
  inset: 10px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  color: #1f2329;
  background: rgba(255, 255, 255, .94);
  backdrop-filter: blur(3px);
  font-size: 13px;
  font-weight: 600;
  text-align: center;
}

.spa-feishu-countdown {
  width: 222px;
  color: var(--dsw-alias-label-tertiary, #8f959e);
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  line-height: 17px;
  margin-top: 11px;
}

.spa-feishu-countdownTop { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.spa-feishu-progress { height: 3px; overflow: hidden; border-radius: 99px; background: var(--dsw-alias-bg-module-platform, #f2f3f5); margin-top: 6px; }
.spa-feishu-progress > span { display: block; width: var(--spa-feishu-progress, 100%); height: 100%; border-radius: inherit; background: var(--spa-feishu-accent); transition: width 1s linear; }

.spa-feishu-qrCopy h3 { font-size: 20px; line-height: 29px; font-weight: 650; }
.spa-feishu-qrCopy > p { color: var(--dsw-alias-label-secondary, #646a73); font-size: 13px; line-height: 21px; margin-top: 7px; }

.spa-feishu-steps { counter-reset: spa-feishu-step; display: flex; flex-direction: column; gap: 11px; margin: 20px 0 0; padding: 0; list-style: none; }
.spa-feishu-steps li { counter-increment: spa-feishu-step; display: grid; grid-template-columns: 23px minmax(0, 1fr); align-items: start; gap: 9px; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: 19px; }
.spa-feishu-steps li::before { content: counter(spa-feishu-step); width: 21px; height: 21px; display: grid; place-items: center; border: 1px solid var(--dsw-alias-border-l2, #dee0e3); border-radius: 50%; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-1, #fff); font-size: 10px; font-weight: 650; }

.spa-feishu-connecting { min-height: 292px; display: grid; place-items: center; text-align: center; padding: 36px 24px; }
.spa-feishu-connectingCopy { max-width: 430px; }
.spa-feishu-orbit { position: relative; width: 86px; height: 86px; display: grid; place-items: center; margin: 0 auto 22px; }
.spa-feishu-orbit::before, .spa-feishu-orbit::after { content: ""; position: absolute; border-radius: 50%; }
.spa-feishu-orbit::before { inset: 3px; border: 1px solid color-mix(in srgb, var(--spa-feishu-accent) 24%, transparent); animation: spa-feishu-pulse 1.8s var(--ds-ease-in-out, ease) infinite; }
.spa-feishu-orbit::after { inset: 0; border: 2px solid transparent; border-top-color: var(--spa-feishu-accent); animation: spa-feishu-rotate 1.2s linear infinite; }
.spa-feishu-orbitCore { width: 50px; height: 50px; display: grid; place-items: center; border-radius: 16px; color: var(--spa-feishu-accent); background: color-mix(in srgb, var(--spa-feishu-accent) 9%, var(--dsw-alias-bg-layer-1, #fff)); }
.spa-feishu-connecting h3 { font-size: 20px; line-height: 29px; }
.spa-feishu-connecting p { color: var(--dsw-alias-label-secondary, #646a73); font-size: 13px; line-height: 21px; margin-top: 7px; }
.spa-feishu-connectingCompact { min-height: 248px; }

.spa-feishu-inlineError {
  min-height: 190px;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  align-content: center;
  gap: 15px;
  padding: 28px;
}

.spa-feishu-inlineError h3 { font-size: 17px; line-height: 25px; margin: 0; }
.spa-feishu-inlineError p { color: var(--dsw-alias-label-secondary, #646a73); font-size: 13px; line-height: 21px; margin-top: 5px; overflow-wrap: anywhere; }

.spa-feishu-listSection { display: flex; flex-direction: column; gap: 10px; }
.spa-feishu-listHeading { min-height: 28px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 2px; }
.spa-feishu-listHeading h3 { font-size: 14px; line-height: 22px; font-weight: 650; margin: 0; }
.spa-feishu-botList { display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 0; list-style: none; }
.spa-feishu-botList > li { min-width: 0; }
.spa-feishu-botCard:focus { outline: none; }
.spa-feishu-botCard:focus-visible { outline: 2px solid var(--spa-feishu-accent); outline-offset: 2px; }

.spa-feishu-connectedTop { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.spa-feishu-botIdentity { min-width: 0; display: flex; align-items: center; gap: 13px; }
.spa-feishu-avatar { flex: none; width: 48px; height: 48px; display: grid; place-items: center; overflow: hidden; border: 1px solid var(--dsw-alias-border-l2, #e5e6eb); border-radius: 14px; background: var(--dsw-alias-bg-layer-1, #fff); box-shadow: 0 1px 3px rgb(31 35 41 / 7%); }
.spa-feishu-botName { min-width: 0; }
.spa-feishu-botName h3 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 17px; line-height: 24px; font-weight: 650; }
.spa-feishu-botName p { overflow: hidden; color: var(--dsw-alias-label-tertiary, #8f959e); font-family: var(--ds-font-family-code, monospace); font-size: 12px; line-height: 18px; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; }

.spa-feishu-healthPill { flex: none; display: inline-flex; align-items: center; gap: 7px; min-height: 28px; border-radius: 999px; padding: 4px 10px; color: var(--spa-feishu-success); background: color-mix(in srgb, var(--spa-feishu-success) 10%, transparent); font-size: 12px; font-weight: 600; line-height: 18px; }
.spa-feishu-healthPill[data-health="degraded"], .spa-feishu-healthPill[data-health="checking"], .spa-feishu-healthPill[data-health="connecting"] { color: var(--spa-feishu-warning); background: color-mix(in srgb, var(--spa-feishu-warning) 10%, transparent); }
.spa-feishu-healthPill[data-health="offline"], .spa-feishu-healthPill[data-health="error"] { color: var(--spa-feishu-error); background: color-mix(in srgb, var(--spa-feishu-error) 10%, transparent); }


.spa-feishu-responseMode { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) max-content; align-items: center; column-gap: 10px; row-gap: 5px; margin-top: 6px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1, #eef0f3); border-radius: 9px; background: var(--dsw-alias-bg-module-platform, #f7f8fa); }
.spa-feishu-responseModeHeader { display: contents; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: normal; }
.spa-feishu-responseModeHeader > span:first-child { grid-column: 1; grid-row: 1; white-space: nowrap; }
.spa-feishu-responseModeStatus { grid-column: 2; grid-row: 1; color: var(--dsw-alias-label-tertiary, #8f959e); font-size: 12px; white-space: nowrap; }
.spa-feishu-responseModeSelect { min-width: 0; width: 100%; grid-column: 1 / -1; grid-row: 2; height: 32px; padding: 0 30px 0 9px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 7px; color: var(--dsw-alias-label-primary, #1f2329); background-color: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 12px; cursor: pointer; transition: border-color .16s ease, box-shadow .16s ease, background-color .16s ease; }
.spa-feishu-responseModeSelect:hover:not(:disabled) { border-color: color-mix(in srgb, var(--spa-feishu-accent) 45%, var(--dsw-alias-border-l2, #dfe1e5)); }
.spa-feishu-responseModeSelect:focus-visible { outline: none; border-color: var(--spa-feishu-accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--spa-feishu-accent) 16%, transparent); }
.spa-feishu-responseModeSelect:disabled { cursor: not-allowed; opacity: .55; }
.spa-feishu-responseModeHelp { grid-column: 1 / -1; grid-row: 3; color: var(--dsw-alias-label-tertiary, #8f959e); font-size: 11px; line-height: 1.45; }
.spa-feishu-responseModePermissionAction { grid-column: 1 / -1; grid-row: 4; display: flex; justify-content: flex-start; margin-top: 2px; }
.spa-feishu-responseModePermissionButton { min-height: 28px; padding: 3px 9px; color: var(--spa-feishu-accent); border-color: color-mix(in srgb, var(--spa-feishu-accent) 30%, var(--dsw-alias-border-l2, #dfe1e5)); background: var(--dsw-alias-bg-layer-1, #fff); }
.spa-feishu-responseModePermissionButton:hover:not(:disabled) { background: color-mix(in srgb, var(--spa-feishu-accent) 7%, transparent); }
.spa-feishu-responseModeError { grid-column: 1 / -1; grid-row: 5; color: var(--spa-feishu-error); font-size: 12px; line-height: 1.4; margin: 0; }

.spa-feishu-botProvision {
  position: relative;
  margin-top: 14px;
  scroll-margin-block: 20px;
  animation: spa-feishu-revealProvision .2s var(--ds-ease-out, ease-out) both;
}
.spa-feishu-botProvision:focus { outline: none; }
.spa-feishu-botProvision:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--spa-feishu-accent) 75%, transparent);
  outline-offset: 3px;
  border-radius: 12px;
}
.spa-feishu-botProvision > .spa-feishu-provisionCard {
  border-radius: 11px;
  box-shadow: none;
  background: color-mix(in srgb, var(--spa-feishu-accent) 2.5%, var(--dsw-alias-bg-layer-3, #fff));
}
.spa-feishu-botProvision .spa-feishu-cardBody { padding: 18px; }
.spa-feishu-botProvision .spa-feishu-qrLayout {
  grid-template-columns: 184px minmax(0, 1fr);
  align-items: start;
  gap: 24px;
}
.spa-feishu-botProvision .spa-feishu-qrFrame { width: 176px; height: 176px; padding: 10px; border-radius: 11px; }
.spa-feishu-botProvision .spa-feishu-countdown { width: 176px; }
.spa-feishu-botProvision .spa-feishu-qrCopy h3 { font-size: 18px; line-height: 26px; }
.spa-feishu-botProvision .spa-feishu-steps { gap: 8px; margin-top: 14px; }
.spa-feishu-botProvision .spa-feishu-actions { margin-top: 16px; }
.spa-feishu-botProvision .spa-feishu-inlineError { min-height: 160px; padding: 22px; }

.spa-feishu-connectedFooter { display: flex; align-items: center; justify-content: space-between; gap: 15px; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--dsw-alias-border-l1, #eef0f3); }
.spa-feishu-healthSummary { min-width: 0; color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: 18px; }
.spa-feishu-healthSummary[data-error="true"] { color: var(--spa-feishu-error); }
.spa-feishu-botActions { position: relative; flex: none; width: 100%; flex-wrap: wrap; gap: 8px; margin-top: 0; justify-content: flex-end; }
.spa-feishu-botActions .spa-feishu-button { flex: none; white-space: nowrap; }
.spa-feishu-botActions .spa-feishu-repairButton { color: var(--spa-feishu-accent); border-color: color-mix(in srgb, var(--spa-feishu-accent) 35%, var(--dsw-alias-border-l2, #dee0e3)); }
.spa-feishu-botActions .spa-feishu-repairButton:hover:not(:disabled) { background: color-mix(in srgb, var(--spa-feishu-accent) 7%, transparent); }
.spa-feishu-repairAction { display: inline-flex; }
.spa-feishu-repairTooltip {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  z-index: 40;
  width: min(330px, 100%);
  display: grid;
  gap: 3px;
  padding: 9px 10px;
  border: 1px solid var(--dsw-alias-border-l2, #dfe1e5);
  border-radius: 8px;
  color: var(--dsw-alias-label-primary, #1f2329);
  background: var(--dsw-alias-bg-layer-3, #fff);
  box-shadow: 0 10px 28px rgb(31 35 41 / 16%);
  opacity: 0;
  visibility: hidden;
  transform: translateY(3px);
  pointer-events: none;
  transition: opacity .15s ease, transform .15s ease, visibility .15s ease;
}
.spa-feishu-repairTooltip strong { font-size: 12px; line-height: 17px; font-weight: 650; }
.spa-feishu-repairTooltip > span { color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 17px; font-weight: 400; overflow-wrap: anywhere; }
.spa-feishu-repairAction:hover .spa-feishu-repairTooltip,
.spa-feishu-repairAction:focus-within .spa-feishu-repairTooltip { opacity: 1; visibility: visible; transform: translateY(0); }

.spa-feishu-confirm {
  border-top: 1px solid var(--dsw-alias-border-l2, #dee0e3);
  background: color-mix(in srgb, var(--spa-feishu-error) 4%, var(--dsw-alias-bg-module-platform, #f7f8fa));
  padding: 17px 24px 20px;
}
.spa-feishu-confirm:focus { outline: none; }
.spa-feishu-confirm h4 { font-size: 13px; line-height: 20px; margin: 0; }
.spa-feishu-confirm p { color: var(--dsw-alias-label-secondary, #646a73); font-size: 12px; line-height: 19px; margin: 4px 0 0; }
.spa-feishu-confirm .spa-feishu-actions { margin-top: 12px; }

.spa-feishu-error { min-height: 252px; display: grid; grid-template-columns: 44px minmax(0, 1fr); align-content: center; gap: 15px; padding: 30px; }
.spa-feishu-errorIcon { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 13px; color: var(--spa-feishu-error); background: color-mix(in srgb, var(--spa-feishu-error) 9%, transparent); }
.spa-feishu-error h3 { font-size: 17px; line-height: 25px; }
.spa-feishu-error p { color: var(--dsw-alias-label-secondary, #646a73); font-size: 13px; line-height: 21px; margin-top: 5px; overflow-wrap: anywhere; }
.spa-feishu-errorCode { display: inline-block; color: var(--dsw-alias-label-tertiary, #8f959e); font-family: var(--ds-font-family-code, monospace); font-size: 11px; margin-top: 7px; }

.spa-feishu-statusNotice {
  display: flex;
  align-items: center;
  gap: 9px;
  border: 1px solid color-mix(in srgb, var(--spa-feishu-warning) 28%, var(--dsw-alias-border-l2, #dee0e3));
  border-radius: 10px;
  padding: 9px 11px;
  color: var(--dsw-alias-label-secondary, #646a73);
  background: color-mix(in srgb, var(--spa-feishu-warning) 5%, var(--dsw-alias-bg-layer-1, #fff));
  font-size: 12px;
  line-height: 18px;
}
.spa-feishu-statusNotice > svg { flex: none; color: var(--spa-feishu-warning); }
.spa-feishu-statusNotice > span { min-width: 0; flex: 1; overflow-wrap: anywhere; }

.spa-feishu-skeleton { min-height: 260px; padding: 28px; }
.spa-feishu-skeletonLine { height: 12px; border-radius: 999px; background: linear-gradient(90deg, var(--dsw-alias-bg-module-platform, #f2f3f5), color-mix(in srgb, var(--dsw-alias-label-tertiary, #8f959e) 10%, transparent), var(--dsw-alias-bg-module-platform, #f2f3f5)); background-size: 220% 100%; animation: spa-feishu-shimmer 1.5s linear infinite; }
.spa-feishu-skeletonLine:nth-child(1) { width: 92px; }
.spa-feishu-skeletonLine:nth-child(2) { width: 44%; height: 22px; margin-top: 23px; }
.spa-feishu-skeletonLine:nth-child(3) { width: 72%; margin-top: 14px; }
.spa-feishu-skeletonLine:nth-child(4) { width: 58%; margin-top: 9px; }
.spa-feishu-skeletonBox { width: 138px; height: 38px; border-radius: 8px; background: var(--dsw-alias-bg-module-platform, #f2f3f5); margin-top: 28px; }

.spa-feishu-visuallyHidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

@keyframes spa-feishu-rotate { to { transform: rotate(360deg); } }
@keyframes spa-feishu-pulse { 0%, 100% { transform: scale(.9); opacity: .45; } 50% { transform: scale(1.08); opacity: 1; } }
@keyframes spa-feishu-shimmer { to { background-position: -220% 0; } }
@keyframes spa-feishu-revealProvision { from { opacity: 0; transform: translateY(-5px); } }

@container (max-width: 620px) {
  .spa-feishu-headingTools { gap: 6px; }
  .spa-feishu-headingTools .spa-feishu-totalBadge { padding-inline: 8px; }
  .spa-feishu-headingTools .spa-feishu-bindButton { padding-inline: 10px; }
}

@media (max-width: 680px) {
  .spa-feishu-intro { grid-template-columns: minmax(0, 1fr); }
  .spa-feishu-markStage { display: none; }
  .spa-feishu-qrLayout { grid-template-columns: minmax(0, 1fr); justify-items: center; }
  .spa-feishu-botProvision .spa-feishu-qrLayout { grid-template-columns: minmax(0, 1fr); }
  .spa-feishu-qrCopy { width: 100%; }
  .spa-feishu-connectedTop { align-items: flex-start; flex-direction: column; }
  .spa-feishu-inlineError { grid-template-columns: minmax(0, 1fr); padding: 20px; }
  .spa-feishu-statusNotice { align-items: flex-start; flex-wrap: wrap; }
  .spa-feishu-cardBody { padding: 20px; }
}

@media (prefers-reduced-motion: reduce) {
  .spa-feishu-page *, .spa-feishu-page *::before, .spa-feishu-page *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: .01ms !important; }
}
`;

export function installFeishuStyles() {
  if (typeof document === "undefined") {
    return () => {};
  }

  const existing = document.querySelector(
    `style[data-plugin-css="${FEISHU_STYLE_ID}"]`,
  );
  if (existing) {
    return () => {};
  }

  const style = document.createElement("style");
  style.dataset.plugin = "dsh-super-personal-agent";
  style.dataset.pluginCss = FEISHU_STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);

  return () => {
    style.remove();
  };
}
