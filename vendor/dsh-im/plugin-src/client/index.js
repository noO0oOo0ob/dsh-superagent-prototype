/** Message-center shell copied from dsh-im's page entry; host registration and unsupported providers removed. */
import { h } from './i18n.js';
import { FeishuLogoGlyph } from './channel-logos.js';

export function MessagingShell({ label, navigationLabel, channelLabel, children }) {
  return h('section', { className: 'spa-im-page', 'data-embedded': 'true', 'aria-label': label },
    h('div', { className: 'spa-im-layout' },
      h('nav', { className: 'spa-im-rail', role: 'tablist', 'aria-label': navigationLabel },
        h('button', {
          type: 'button', role: 'tab', id: 'spa-im-tab-feishu', className: 'spa-im-channel',
          'aria-selected': true, 'aria-controls': 'spa-im-panel-feishu',
        },
        h('span', { className: 'spa-im-logo spa-im-logoFeishu' }, h(FeishuLogoGlyph)),
        h('span', { className: 'spa-im-channelCopy' }, h('strong', null, channelLabel)))),
      h('div', { className: 'spa-im-divider', 'aria-hidden': true }),
      h('div', { className: 'spa-im-panel', role: 'tabpanel', id: 'spa-im-panel-feishu',
        'aria-labelledby': 'spa-im-tab-feishu', tabIndex: 0 }, children)));
}
