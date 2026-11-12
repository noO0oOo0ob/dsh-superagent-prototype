/** Native Feishu account lifecycle and platform transport; no installed dsh-im service is used. */
import * as Lark from '@larksuiteoapi/node-sdk';
import { createHash } from 'node:crypto';
import { mkdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { MultiBotDshFeishuController } from '../../vendor/dsh-im/src/channels/feishu/multi-bot-controller.mjs';
import { PluginConfigStore } from '../../vendor/dsh-im/src/channels/feishu/plugin-config-store.mjs';
import { StateStore } from '../../vendor/dsh-im/src/channels/feishu/state-store.mjs';
import { FeishuRuntime } from '../../vendor/dsh-im/src/channels/feishu/feishu-runtime.mjs';
import { verifyFeishuApp } from '../../vendor/dsh-im/src/channels/feishu/feishu-app.mjs';
import { extractInboundMessage } from '../../vendor/dsh-im/src/channels/feishu/message-utils.mjs';
import { normalizeExternalText, ExclusiveInboundConsumers } from '../../vendor/dsh-im/src/channels/feishu/external-consumer.mjs';
import { createFeishuRpcHandler } from '../../vendor/dsh-im/plugin-src/host/channels/feishu/rpc.mjs';
import { ConnectionSupervisor } from '../../vendor/dsh-im/plugin-src/host/channels/feishu/connection-supervisor.mjs';
import { BotWorkspaceStore, createWorkspaceAwareController } from '../../vendor/dsh-im/src/channels/shared/bot-workspace-store.mjs';
import { createAccessPolicy, createAccessPolicyScope, evaluateAccessPolicy } from '../../vendor/dsh-im/src/channels/shared/access-policy.mjs';
import { listAgentPresetCatalog } from '../../vendor/dsh-im/src/channels/shared/agent-preset.mjs';
import { normalizeModelCatalog } from '../../vendor/dsh-im/src/channels/shared/model-setting.mjs';
import { readExternalHistory } from '../../vendor/dsh-im/src/channels/feishu/history-reader.mjs';
import { NATIVE_SLASH_COMMAND_MANIFEST } from '../../vendor/dsh-im/src/channels/feishu/slash-command-panel.mjs';
import { createFeishuWebSocketAgent } from './feishu-proxy.mjs';
import { providerMessageIdsFor } from '../../vendor/dsh-im/src/channels/shared/semantic/delivery.mjs';

const failure = (code, outcome = 'failed', cause) => Object.assign(new Error(code, cause ? { cause } : undefined), { code, outcome });
const fingerprint = config => createHash('sha256').update(JSON.stringify({ provider: 'feishu', domain: config.domain, appId: config.appId, botOpenId: config.botOpenId })).digest('hex');
const uuid = id => createHash('sha256').update(id).digest('hex').slice(0, 32);
const policyFor = config => {
  const owners = config.ownerOpenIds.filter(id => id !== '*');
  const scope = config.ownerOpenIds.includes('*')
    ? createAccessPolicyScope({ mode: 'open', open: { defaultCanExecuteCommands: true, commandPermissionOverrides: [] }, allowlist: { users: [] } })
    : createAccessPolicyScope({ mode: 'allowlist', open: { defaultCanExecuteCommands: false, commandPermissionOverrides: [] }, allowlist: { users: owners.map(id => ({ id, canExecuteCommands: true })) } });
  return createAccessPolicy({ direct: scope, group: scope });
};

/** Normalize all supported message kinds while retaining the original reply identity. */
export function normalizeNativeMessage(raw, config) {
  if (!raw?.message) return null;
  const content = JSON.parse(raw.message.content || '{}');
  const localized = raw.message.message_type === 'post' && !Array.isArray(content.content) ? content.zh_cn ?? content.en_us ?? content : content;
  const parsed = extractInboundMessage({ ...raw, message: { ...raw.message, content: JSON.stringify(localized) } }, null);
  const resources = [];
  if (raw.message.message_type === 'image' && content.image_key) resources.push({ kind: 'image', key: content.image_key });
  if (['file', 'audio', 'media'].includes(raw.message.message_type) && content.file_key)
    resources.push({ kind: raw.message.message_type === 'media' ? 'video' : raw.message.message_type, key: content.file_key, fileName: content.file_name });
  if (raw.message.message_type === 'post') {
    const walk = value => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') {
        if (value.tag === 'img' && typeof value.image_key === 'string') resources.push({ kind: 'image', key: value.image_key });
        else Object.values(value).forEach(walk);
      }
    };
    walk(content);
  }
  const text = parsed?.content || (resources.length ? resources.map(item => `[${item.kind}: ${item.fileName || item.key}]`).join('\n') : '');
  if (!text.trim()) return null;
  const event = normalizeExternalText({ ...raw, message: { ...raw.message, message_type: 'text', content: JSON.stringify({ text }) } },
    { botId: config.id, appId: config.appId, botOpenId: config.botOpenId, fingerprint: fingerprint(config) });
  const tenantId = raw.tenant_key ?? raw.header?.tenant_key ?? raw.sender?.tenant_key;
  const groupScope = event?.conversation.kind === 'group' && typeof tenantId === 'string' && tenantId.length > 0 && tenantId.length <= 512
    ? { tenantId, groupId: event.conversation.id } : undefined;
  return event ? { ...event, ...(groupScope ? { groupScope } : {}), channel: config.domain === 'lark' ? 'lark' : 'feishu', messageType: raw.message.message_type, resources } : null;
}

/** Construct an independently stored account controller and its Personal Agent adapter. */
export async function createNativeFeishu({ context, stateDir, lifetime, logger = console, onAccounts, onCard, onDocumentComment, sdk = Lark, Runtime = FeishuRuntime }) {
  const credentials = context.get?.('credentials') ?? context.credentials;
  if (!credentials) throw new Error('DSH credentials service is unavailable');
  const root = join(stateDir, 'connectors', 'feishu');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const configStore = await new PluginConfigStore(join(root, 'accounts.json')).load();
  const saveBot = configStore.saveBot.bind(configStore);
  configStore.saveBot = value => saveBot({ ...value, consumerMode: 'external-consumer' });
  await mkdir(join(stateDir, 'conversations'), { recursive: true, mode: 0o700 });
  const conversationRoot = await realpath(join(stateDir, 'conversations'));
  const workspaces = await new BotWorkspaceStore(join(root, 'settings.json'), { defaultWorkspace: conversationRoot, ungroupedWorkspace: conversationRoot }).load();
  const states = new Map(), runtimes = new Map(), consumers = new ExclusiveInboundConsumers();
  let closed = false, closing;
  const stateFor = async bot => {
    const id = typeof bot === 'string' ? bot : bot.id;
    if (!states.has(id)) states.set(id, new StateStore(join(root, 'bots', id, 'state.json')).load());
    return states.get(id);
  };
  const harness = {
    ensureRunning: async ({ signal } = {}) => { signal?.throwIfAborted(); if (closed) throw failure('consumer-unavailable'); return true; },
    ensureWorkspace: async path => { await mkdir(path, { recursive: true }); return { path }; },
  };
  const modelCatalog = async () => {
    const providers = context.llm?.listProviders?.() ?? [];
    const groups = [], failures = [];
    for (const provider of providers) {
      try { groups.push({ id: provider.id, name: provider.name ?? provider.id, models: await context.llm.listModels(provider.id) }); }
      catch { failures.push({ id: provider.id, message: 'Model catalog unavailable' }); }
    }
    return normalizeModelCatalog({ groups, failures });
  };
  const proxyAgent = createFeishuWebSocketAgent(process.env);
  const botSettings = id => ({ workspace: workspaces.workspaceFor(id), model: workspaces.modelFor(id), agentPreset: workspaces.agentPresetFor(id),
    contextEnhancement: workspaces.contextEnhancementFor(id), accessPolicy: workspaces.accessPolicyFor(id), conversationDirectory: workspaces.conversationDirectoryFor(id) });
  const core = new MultiBotDshFeishuController({ credentials, configStore, logger,
    secretRefForBot: id => `SPA_FEISHU_SECRET_${id.toUpperCase()}`,
    registerApp: options => sdk.registerApp(options),
    verifyApp: options => verifyFeishuApp({ ...options, httpInstance: sdk.defaultHttpInstance }),
    createRuntime: async ({ botId, config, appSecret, repair }) => {
      await workspaces.ensure(botId, { initialAccessPolicy: policyFor(config) });
      const runtime = new Runtime({ lark: sdk, consumerMode: 'external-consumer', botId, appId: config.appId, appSecret,
        domain: config.domain, botOpenId: config.botOpenId, ownerOpenIds: config.ownerOpenIds, harness, state: await stateFor(botId), repair,
        slashManifest: NATIVE_SLASH_COMMAND_MANIFEST, groupResponseMode: config.groupResponseMode, mentionTopicReply: config.mentionTopicReply, slashPanel: config.slashPanel, logger,
        wsAgent: proxyAgent,
        nativeCallbacks: { onCard: async raw => onCard?.(botId, raw), onDocumentComment: async raw => {
          const current = configStore.getBot(botId);
          if (closed || runtimes.get(botId) !== runtime || !current || fingerprint(current) !== fingerprint(config)) throw failure('account-changed');
          if (raw.app_id && raw.app_id !== current.appId) return;
          if (!raw.is_mentioned || raw.notice_meta?.to_user_id?.open_id !== current.botOpenId
            || raw.notice_meta?.from_user_id?.open_id === current.botOpenId) return;
          await onDocumentComment?.(botId, fingerprint(current), raw);
        } },
        acceptExternal: async (raw, { signal } = {}) => {
          if (closed || runtimes.get(botId) !== runtime) throw failure('consumer-unavailable');
          const current = configStore.getBot(botId);
          if (!current || fingerprint(current) !== fingerprint(config)) throw failure('account-changed');
          const event = normalizeNativeMessage(raw, current);
          if (!event) return { accepted: true };
          if (!service.allowsInbound(event)) return { accepted: true };
          return consumers.accept(botId, { ...event, settings: botSettings(botId) }, signal);
        },
      });
      runtimes.set(botId, runtime);
      return runtime;
    },
  });
  const controller = createWorkspaceAwareController(core, { workspaces, harness, stateFor,
    agentPresetCatalog: () => listAgentPresetCatalog(context), modelCatalog });
  const rpc = createFeishuRpcHandler(controller);
  const accounts = () => configStore.list().map(config => ({ id: config.id, fingerprint: fingerprint(config), channel: config.domain === 'lark' ? 'lark' : 'feishu' }));
  const syncAccounts = async () => { if (!closed) await onAccounts?.(accounts()); };
  const supervisor = new ConnectionSupervisor({ controller: { status: () => controller.status(), initialize: async () => { const result = await controller.initialize(); await syncAccounts(); return result; } }, harness, logger });
  const service = {
    contractVersion: 1, inboundVersion: 1,
    allowsInbound(event) {
      const current = configStore.getBot(event.botId);
      if (closed || lifetime.aborted || !current || fingerprint(current) !== event.fingerprint) return false;
      return current.ownerOpenIds.includes(event.actor.id) || evaluateAccessPolicy(workspaces.accessPolicyFor(event.botId), {
        conversationType: event.conversation.kind === 'dm' ? 'direct' : 'group', senderIds: [event.actor.id], isCommand: /^\s*\//.test(event.text),
      }).allowed;
    },
    listBots: async () => accounts().map(item => ({ botId: item.id, channel: item.channel })),
    describeBot: async id => ({ ...await core.describeDeliveryAccount(id), channel: configStore.getBot(id)?.domain === 'lark' ? 'lark' : 'feishu' }),
    consumeInbound: async (id, options) => {
      const account = await core.describeDeliveryAccount(id);
      if (account.account.fingerprint !== options.expectedFingerprint) throw failure('account-changed');
      return consumers.register(id, { fingerprint: options.expectedFingerprint, onEvent: options.onEvent, signal: options.signal });
    },
    replyOwner: (id, route, options) => core.withNativeRoute(id, route, async ({ client }) => {
      if (!route.parentId) return 'unknown';
      const response = await client.im.v1.message.get({ path: { message_id: route.parentId } });
      options.signal?.throwIfAborted();
      const parent = response?.data?.items?.find(item => item.message_id === route.parentId);
      if (response?.code || !parent || parent.deleted || parent.chat_id !== route.conversationId) return 'unknown';
      if (parent.sender?.sender_type === 'user') return 'user';
      if (parent.sender?.sender_type !== 'app' || parent.sender?.id_type !== 'app_id') return 'unknown';
      return parent.sender.id === configStore.getBot(id)?.appId ? 'self' : 'other';
    }, { ...options, readOnly: true }),
    replyChecked: async (id, route, text, options) => {
      await handle.sendPart(id, route, { type: 'text', text, format: options.format ?? 'plain' },
        { ...options, id: uuid(JSON.stringify([id, route, text])), uploaded() {} });
      return { sent: true };
    },
    historyChecked: (id, route, query, options) => core.withNativeRoute(id, route, ({ client }) => {
      const config = configStore.getBot(id);
      return readExternalHistory(client, { botId: id, appId: config.appId, botOpenId: config.botOpenId, fingerprint: fingerprint(config) }, route, query, options.signal);
    }, options),
  };
  const handle = {
    service, accounts, botSettings,
    documentRequest(botId, expectedFingerprint, request, signal) {
      if (!/^\/open-apis\/(docx|drive)\/v1\//.test(request.url)) throw failure('invalid-document-api');
      return core.withNativeDocument(botId, async client => {
        let response;
        try { response = await client.request({ ...request, signal: signal ? AbortSignal.any([signal, lifetime]) : lifetime }); }
        catch (cause) {
          const code = cause?.response?.data?.code;
          if (typeof code === 'number' && code !== 0) throw failure(`feishu-${code}`, 'failed', cause);
          throw failure('document-outcome-unknown', 'unknown', cause);
        }
        if (response?.code) throw failure(`feishu-${response.code}`, 'failed');
        return response?.data;
      }, { expectedFingerprint, signal: signal ? AbortSignal.any([signal, lifetime]) : lifetime });
    },
    allowsCommand(botId, expectedFingerprint, actorId, kind) {
      const current = configStore.getBot(botId);
      if (closed || lifetime.aborted || !current || fingerprint(current) !== expectedFingerprint) return false;
      return current.ownerOpenIds.includes(actorId) || evaluateAccessPolicy(workspaces.accessPolicyFor(botId),
        { conversationType: kind === 'group' ? 'group' : 'direct', senderIds: [actorId], isCommand: true }).allowed;
    },
    async start() { supervisor.start(); await supervisor.ready; await syncAccounts(); },
    async rpc(endpoint, payload, signal) { const result = await rpc(endpoint, payload, signal); await syncAccounts(); return result; },
    async prepareDialogue(botId, conversationKey, expectedFingerprint) {
      const current = configStore.getBot(botId);
      if (!current || fingerprint(current) !== expectedFingerprint) throw failure('account-changed');
      if (!workspaces.conversationDirectoryFor(botId).enabled) return workspaces.workspaceFor(botId);
      const directoryKey = `${conversationKey}:${createHash('sha256').update(workspaces.workspaceFor(botId)).digest('hex').slice(0, 16)}`;
      const prepared = await workspaces.prepareConversationDirectory(botId, directoryKey, { explicitNew: true });
      if (prepared?.warning) throw failure('workspace-prepare-failed');
      return prepared?.workspace ?? workspaces.conversationWorkspaceFor(botId, directoryKey);
    },
    async readResource(botId, route, key, options) {
      options = { ...options, signal: AbortSignal.any([lifetime, options.signal]) };
      return core.withNativeRoute(botId, route, async ({ client, message }) => {
        const current = configStore.getBot(botId);
        const raw = { event_id: route.messageId, app_id: current.appId, sender: { sender_type: 'user', sender_id: { open_id: route.actorId } },
          message: { message_id: route.messageId, chat_id: route.conversationId, chat_type: message.chat_type === 'group' ? 'group' : 'p2p',
            message_type: message.msg_type, content: message.body?.content, create_time: message.create_time } };
        const normalized = normalizeNativeMessage(raw, current);
        const resource = normalized?.resources.find(item => item.key === key);
        if (!resource) throw failure('resource-not-in-message');
        const response = await client.im.v1.messageResource.get({ path: { message_id: route.messageId, file_key: key },
          params: { type: resource.kind === 'image' ? 'image' : 'file' } });
        const stream = response?.getReadableStream?.();
        if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') throw failure('resource-download-failed');
        const abort = () => stream.destroy?.(options.signal.reason);
        options.signal.addEventListener('abort', abort, { once: true });
        const chunks = []; let size = 0;
        try {
          options.signal.throwIfAborted();
          for await (const chunk of stream) {
            options.signal.throwIfAborted();
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            size += bytes.length;
            if (size > options.maxBytes) throw failure('resource-too-large');
            chunks.push(bytes);
          }
          options.signal.throwIfAborted();
          return Buffer.concat(chunks);
        } finally { options.signal.removeEventListener('abort', abort); stream.destroy?.(); }
      }, options);
    },
    async validateRoute(botId, route, options) { await core.withNativeRoute(botId, route, async () => {}, options); },
    async sendPart(botId, route, block, options) {
      const send = async ({ client, channel, message }) => {
        const current = configStore.getBot(botId);
        const mentioned = message.mentions?.some(item => (item.id?.open_id ?? item.id) === current.botOpenId);
        const replyInThread = !!route.threadId || (options.conversationKind === 'group' && mentioned && current.mentionTopicReply !== false);
        if (block.type === 'image' || block.type === 'file') {
          const artifact = options.file;
          if (!artifact) throw failure('artifact-unavailable');
          try {
            const sent = await channel[block.type === 'image' ? 'sendImage' : 'sendFile'](route.conversationId,
              { artifactId: block.artifactId, deliveryKey: options.id, fileName: artifact.file.fileName, mediaType: artifact.file.mediaType, size: artifact.file.size,
                bytes: artifact.bytes, resourceKey: options.resourceKey, onUploaded: options.uploaded },
              { replyTo: route.messageId, signal: options.signal, replyInThread: !!replyInThread });
            return { providerMessageIds: providerMessageIdsFor(sent) };
          } catch (error) {
            const safe = ['artifact-permission-required', 'artifact-too-large', 'artifact-empty', 'artifact-provider-rejected', 'artifact-rate-limited', 'artifact-provider-failed'];
            let interrupted = options.signal?.aborted;
            for (let cause = error; cause && !interrupted; cause = cause.cause) interrupted = cause.name === 'AbortError' || cause.name === 'TimeoutError';
            throw failure(typeof error.code === 'string' ? error.code : 'file-outcome-unknown', !interrupted && safe.includes(error.code) ? 'failed' : 'unknown', error);
          }
        }
        let msg_type, content;
        if (block.type === 'text') {
          msg_type = block.format === 'markdown' ? 'post' : 'text';
          content = block.format === 'markdown' ? { zh_cn: { content: [[{ tag: 'md', text: block.text }]] } } : { text: block.text };
        } else if (block.type === 'link') { msg_type = 'post'; content = { zh_cn: { content: [[{ tag: 'a', text: block.label, href: block.url }]] } }; }
        else if (block.type === 'card') {
          msg_type = 'interactive'; content = { header: { title: { tag: 'plain_text', content: block.title } }, elements: [
            { tag: 'div', text: { tag: 'lark_md', content: block.text } },
            ...(block.actions.length ? [{ tag: 'action', actions: block.actions.map(action => ({ tag: 'button', text: { tag: 'plain_text', content: action.label }, value: { spaAction: action.actionId } })) }] : [])] };
        } else throw failure(`unsupported-${block.type}`, 'unsupported');
        let response;
        try { response = await client.im.v1.message.reply({ path: { message_id: route.messageId }, data: { msg_type, content: JSON.stringify(content), uuid: uuid(options.id), reply_in_thread: !!replyInThread } }); }
        catch (error) { throw failure('message-outcome-unknown', 'unknown', error); }
        if (response?.code) throw failure(`feishu-${response.code}`, Number(response.code) === 230049 ? 'unknown' : 'failed');
        const ids = providerMessageIdsFor(response);
        if (!ids.length) throw failure('message-outcome-unknown', 'unknown');
        return { providerMessageIds: ids };
      };
      const result = await core.withNativeRoute(botId, route, send, options);
      runtimes.get(botId)?.recordNativeReply?.();
      return result;
    },
    close() {
      if (closing) return closing;
      closed = true;
      closing = (async () => { await supervisor.close(); try { await controller.close(); } finally { proxyAgent?.destroy?.(); } })();
      return closing;
    },
  };
  lifetime.addEventListener('abort', () => { void handle.close().catch(error => logger.warn('Native Feishu close failed: %s', error?.code ?? 'unknown')); }, { once: true });
  return handle;
}
