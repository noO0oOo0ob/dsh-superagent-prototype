/** Native Feishu uses copied platform code with a local SDK, never the installed IM plugin. */
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';
import { createNativeFeishu, normalizeNativeMessage } from '../src/connectors/native-feishu.mjs';
import { nativeDelivery, prepareFeishuBlocks } from '../src/connectors/native-delivery.ts';
import { MessageDelivery, deliveryState } from '../src/messaging/delivery.ts';
import { nativeConnectorConfigs } from '../src/connectors/native-accounts.ts';
import { Store } from '../src/app/store.ts';

const cleanup = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); });
const raw = (content = { text: 'Hello' }, type = 'text', extra = {}) => ({ event_id: 'event-1', app_id: 'cli_test',
  sender: { sender_type: 'user', sender_id: { open_id: 'ou_user' } }, message: { message_id: 'om_1', chat_id: 'oc_chat',
    chat_type: 'p2p', message_type: type, create_time: '1793788800000', content: JSON.stringify(content), ...extra } });
const config = { id: 'bot_test', appId: 'cli_test', botOpenId: 'ou_bot', domain: 'feishu' };
const route = { messageId: 'om_1', conversationId: 'oc_chat', actorId: 'ou_user' };

async function fixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'spa-native-'));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const lifetime = new AbortController(), secrets = new Map(), dispatchers = [], registrations = [];
  const reply = vi.fn(async () => ({ code: 0, data: { message_id: `om_out_${reply.mock.calls.length}` } }));
  const get = vi.fn(async () => ({ code: 0, data: { items: [{ message_id: 'om_1', chat_id: 'oc_chat', msg_type: 'text',
    body: { content: JSON.stringify({ text: 'Hello' }) }, create_time: '1793788800000',
    sender: { sender_type: 'user', id_type: 'open_id', id: 'ou_user' } }] } }));
  const createFile = vi.fn(async () => ({ code: 0, data: { file_key: 'uploaded_file' } }));
  const createImage = vi.fn(async () => ({ code: 0, data: { image_key: 'uploaded_image' } }));
  const client = { im: { v1: { message: { reply, get, list: vi.fn(async () => ({ code: 0, data: { items: [], has_more: false } })) },
    file: { create: createFile }, image: { create: createImage },
    messageResource: { get: vi.fn(async () => ({ getReadableStream: () => Readable.from([Buffer.from('attachment')]) })) } } } };
  const sdk = { Domain: { Feishu: 'feishu', Lark: 'lark' }, LoggerLevel: { info: 1 },
    Client: class { constructor() { return client; } },
    EventDispatcher: class { register(handlers) { dispatchers.push(handlers); return this; } },
    WSClient: class { constructor(options) { this.options = options; } async start() { this.options.onReady(); } close() {} },
    defaultHttpInstance: { request: vi.fn(async request => request.url.includes('tenant_access_token')
      ? { code: 0, tenant_access_token: 'fake-token' }
      : request.url.includes('/bot/v3/info') ? { code: 0, bot: { open_id: 'ou_bot', bot_name: 'Test', activate_status: 1 } }
      : { code: 0, data: { items: [] } }) },
    registerApp: options => new Promise((resolve, reject) => { registrations.push({ options, resolve, reject });
      options.signal?.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      options.onQRCodeReady({ url: 'https://accounts.feishu.cn/test-qr', expireIn: 60 }); }),
  };
  const context = { credentials: { resolve: async ref => secrets.has(ref) ? { value: secrets.get(ref), source: 'file' } : undefined,
    set: async (ref, value) => { secrets.set(ref, value); }, unset: async ref => { secrets.delete(ref); } } };
  const accountsChanged = vi.fn();
  const native = await createNativeFeishu({ context, stateDir: root, lifetime: lifetime.signal, sdk, ...(options.Runtime ? { Runtime: options.Runtime } : {}), onAccounts: accountsChanged,
    logger: { info() {}, warn() {}, error() {}, debug() {} } });
  cleanup.push(() => native.close());
  await native.start();
  const bind = async (domain = 'feishu') => {
    const result = await native.rpc('bot.bind-credentials', { appId: 'cli_test', appSecret: 'private-test-secret', domain });
    expect(result).toMatchObject({ ok: true });
    expect(JSON.stringify(result)).not.toContain('private-test-secret');
    return native.accounts()[0];
  };
  return { root, lifetime, secrets, native, bind, sdk, client, dispatchers, registrations, accountsChanged, reply, get, createFile, createImage };
}

it('normalizes text, rich text with images, files and cards without inventing account identity', () => {
  expect(normalizeNativeMessage(raw(), config)).toMatchObject({ text: 'Hello', reply: route, messageType: 'text' });
  expect(normalizeNativeMessage(raw({ zh_cn: { title: 'Report', content: [[{ tag: 'text', text: 'Summary' }, { tag: 'img', image_key: 'img_1' }]] } }, 'post'), config))
    .toMatchObject({ text: expect.stringContaining('Summary'), resources: [{ kind: 'image', key: 'img_1' }] });
  expect(normalizeNativeMessage(raw({ file_key: 'f', file_name: 'a.pdf' }, 'file'), config)).toMatchObject({ resources: [{ kind: 'file', key: 'f', fileName: 'a.pdf' }] });
  expect(normalizeNativeMessage(raw({ elements: [{ tag: 'markdown', content: 'Card text' }] }, 'interactive'), config)?.text).toContain('Card text');
  expect(() => normalizeNativeMessage({ ...raw(), app_id: 'cli_other' }, config)).toThrow('account-changed');
  expect(normalizeNativeMessage({ ...raw(), sender: { sender_type: 'app' } }, config)).toBeNull();
});

it('binds native credentials, exposes redacted settings, consumes one inlet and removes the account', async () => {
  const h = await fixture(), account = await h.bind();
  expect([...h.secrets.keys()][0]).toMatch(/^SPA_FEISHU_SECRET_/);
  const saved = JSON.parse(await readFile(join(h.root, 'connectors/feishu/accounts.json'), 'utf8'));
  expect(JSON.stringify(saved)).toContain('external-consumer');
  expect(JSON.stringify(saved)).not.toContain('private-test-secret');
  const onEvent = vi.fn(async () => ({ accepted: true }));
  const options = { expectedFingerprint: account.fingerprint, signal: h.lifetime.signal, onEvent };
  const release = await h.native.service.consumeInbound(account.id, options);
  await expect(h.native.service.consumeInbound(account.id, options)).rejects.toThrow('consumer-conflict');
  await h.dispatchers.at(-1)['im.message.receive_v1'](raw());
  expect(onEvent).toHaveBeenCalledTimes(1);
  expect(onEvent.mock.calls[0][0]).toMatchObject({ text: 'Hello', botId: account.id, settings: { workspace: expect.any(String) } });
  release();
  await expect(h.dispatchers.at(-1)['im.message.receive_v1'](raw())).rejects.toThrow('consumer-unavailable');
  const result = await h.native.rpc('bot.delete', { botId: account.id, confirm: true });
  expect(result).toMatchObject({ ok: true });
  expect(h.native.accounts()).toEqual([]);
  expect(h.secrets.size).toBe(0);
});

it('provisions a QR account through the same native controller and retains owner policy', async () => {
  const h = await fixture();
  const qr = await h.native.rpc('provision.begin', { locale: 'zh-CN' });
  expect(qr.ok).toBe(true);
  expect(qr.value.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
  h.registrations[0].resolve({ client_id: 'cli_test', client_secret: 'private-qr-secret', user_info: { open_id: 'ou_owner', tenant_brand: 'feishu' } });
  await vi.waitFor(() => expect(h.native.accounts()).toHaveLength(1));
  const account = h.native.accounts()[0];
  const policy = h.native.botSettings(account.id).accessPolicy;
  expect(policy.direct.mode).toBe('allowlist');
  const onEvent = vi.fn(async () => ({ accepted: true }));
  await h.native.service.consumeInbound(account.id, { expectedFingerprint: account.fingerprint, signal: h.lifetime.signal, onEvent });
  await h.dispatchers.at(-1)['im.message.receive_v1'](raw());
  expect(onEvent).not.toHaveBeenCalled();
});

it('publishes ordered text, image and file; retry reuses upload and skips delivered parts', async () => {
  const h = await fixture(), account = await h.bind('lark');
  const store = new Store(join(h.root, 'delivery.sqlite')); cleanup.push(() => store.close());
  const ledger = new MessageDelivery(store);
  nativeDelivery(h.native, ledger, { materialize: async id => ({ bytes: Buffer.from(id), file: { fileName: id === 'image' ? 'chart.png' : 'report.md', mediaType: id === 'image' ? 'image/png' : 'text/markdown', size: id.length } }) });
  const message = { id: 'report', text: 'Ready', kind: 'notice', channel: { source: 'native', thread: 'chat', address: { botId: account.id } },
    blocks: [{ type: 'text', text: 'Ready', format: 'markdown' }, { type: 'image', artifactId: 'image' }, { type: 'file', artifactId: 'file' }] };
  const options = { expectedFingerprint: account.fingerprint, signal: h.lifetime.signal };
  h.reply.mockImplementation(async request => request.data.msg_type === 'file'
    ? { code: 230020 } : { code: 0, data: { message_id: `om_${request.data.msg_type}` } });
  await expect(h.native.service.deliverChecked(account.id, route, message, options)).rejects.toThrow('not completely');
  expect(deliveryState(ledger.get('report'))).toBe('partial');
  expect(h.reply.mock.calls.map(([r]) => r.data.msg_type)).toEqual(['post', 'image', 'file']);
  h.reply.mockResolvedValue({ code: 0, data: { message_id: 'om_file' } });
  await h.native.service.deliverChecked(account.id, route, message, options);
  await h.native.service.deliverChecked(account.id, route, message, options);
  expect(h.reply).toHaveBeenCalledTimes(4);
  expect(h.createFile).toHaveBeenCalledTimes(1);
  expect(h.createImage).toHaveBeenCalledTimes(1);
  expect(h.reply.mock.calls[2][0].data.uuid).toBe(h.reply.mock.calls[3][0].data.uuid);
  expect(deliveryState(ledger.get('report'))).toBe('sent');
});

it('checks the original account, sender and conversation before platform sends', async () => {
  const h = await fixture(), account = await h.bind();
  const block = { type: 'text', text: 'Hello', format: 'plain' };
  const options = { expectedFingerprint: account.fingerprint, signal: h.lifetime.signal, id: 'p', uploaded() {} };
  await expect(h.native.sendPart(account.id, route, block, { ...options, expectedFingerprint: '0'.repeat(64) })).rejects.toThrow('account-changed');
  await expect(h.native.sendPart(account.id, { ...route, conversationId: 'oc_other' }, block, options)).rejects.toThrow('stale-route');
  await expect(h.native.sendPart(account.id, { ...route, actorId: 'ou_other' }, block, options)).rejects.toThrow('stale-route');
  expect(h.reply).not.toHaveBeenCalled();
  const page = await h.native.service.historyChecked(account.id, route, { scope: 'nearby', limit: 20 }, options);
  expect(page).toMatchObject({ events: expect.any(Array), hasMore: true, nextCursor: expect.any(String) });
});

it('splits mixed text without breaking code points and keeps media captions in order', () => {
  expect(prepareFeishuBlocks([{ type: 'text', text: '😀AB', format: 'plain' }, { type: 'file', artifactId: 'f', caption: 'CD' }], 2))
    .toEqual([{ type: 'text', text: '😀A', format: 'plain' }, { type: 'text', text: 'B', format: 'plain' },
      { type: 'text', text: 'CD', format: 'markdown' }, { type: 'file', artifactId: 'f', caption: 'CD' }]);
});

it('keeps uncertain text and aborted file sends blocked instead of automatically replaying them', async () => {
  const h = await fixture(), account = await h.bind();
  const store = new Store(join(h.root, 'uncertain.sqlite')); cleanup.push(() => store.close());
  const ledger = new MessageDelivery(store);
  nativeDelivery(h.native, ledger, { materialize: async () => ({ bytes: Buffer.from('file'), file: { fileName: 'report.md', mediaType: 'text/markdown', size: 4 } }) });
  const options = { expectedFingerprint: account.fingerprint, signal: h.lifetime.signal };
  const channel = { source: 'native', thread: 'chat', address: {} };
  h.reply.mockResolvedValue({ code: 230049 });
  const text = { id: 'uncertain', text: 'Ready', kind: 'notice', channel };
  await expect(h.native.service.deliverChecked(account.id, route, text, options)).rejects.toThrow();
  await expect(h.native.service.deliverChecked(account.id, route, text, options)).rejects.toThrow();
  expect(h.reply).toHaveBeenCalledTimes(1);
  expect(ledger.get('uncertain').parts[0].state).toBe('unknown');
  h.reply.mockRejectedValue(new DOMException('Aborted while sending', 'AbortError'));
  const file = { id: 'aborted', text: '', kind: 'notice', channel, blocks: [{ type: 'file', artifactId: 'file' }] };
  await expect(h.native.service.deliverChecked(account.id, route, file, options)).rejects.toThrow();
  await expect(h.native.service.deliverChecked(account.id, route, file, options)).rejects.toThrow();
  expect(h.reply).toHaveBeenCalledTimes(2);
  expect(ledger.get('aborted').parts[0].state).toBe('unknown');
});
it('keeps an existing native account restricted after status refresh and reconnect', () => {
  const previous = { id: 'native-bot-one', botId: 'bot_one', fingerprint: 'a'.repeat(64), enabled: false, intake: 'restricted',
    conversations: [{ id: 'private', kind: 'dm', listen: 'mentions' }], allowedSenders: ['alice'] };
  expect(nativeConnectorConfigs([previous], [{ id: 'bot_one', fingerprint: previous.fingerprint, channel: 'feishu' }])).toEqual([{ ...previous, provider: 'feishu', channel: 'feishu' }]);
});

it('awaits the same close operation after lifetime abort until the account runtime has stopped', async () => {
  const stopped = Promise.withResolvers(), started = Promise.withResolvers();
  class SlowRuntime {
    status = { ready: true, harnessReachable: true, feishuLongConnectionState: 'connected' };
    async start() {}
    async stop() { started.resolve(); await stopped.promise; }
  }
  const h = await fixture({ Runtime: SlowRuntime }); await h.bind();
  h.lifetime.abort(); await started.promise;
  const closing = h.native.close();
  expect(h.native.close()).toBe(closing);
  let done = false; void closing.then(() => { done = true; });
  await Promise.resolve(); expect(done).toBe(false);
  stopped.resolve(); await closing; expect(done).toBe(true);
});


it('downloads only a resource still attached to the checked source and enforces byte limits', async () => {
  const h = await fixture(), account = await h.bind();
  h.get.mockResolvedValue({ code: 0, data: { items: [{ message_id: 'om_1', chat_id: 'oc_chat', msg_type: 'file',
    body: { content: JSON.stringify({ file_key: 'file_original', file_name: 'report.md' }) }, create_time: '1793788800000',
    sender: { sender_type: 'user', id_type: 'open_id', id: 'ou_user' } }] } });
  const options = { expectedFingerprint: account.fingerprint, signal: h.lifetime.signal, maxBytes: 100 };
  expect((await h.native.readResource(account.id, route, 'file_original', options)).toString()).toBe('attachment');
  await expect(h.native.readResource(account.id, route, 'invented', options)).rejects.toThrow('resource-not-in-message');
  await expect(h.native.readResource(account.id, route, 'file_original', { ...options, maxBytes: 4 })).rejects.toThrow('resource-too-large');
  expect(h.client.im.v1.messageResource.get).toHaveBeenCalledTimes(2);
});


it('aborts an active download when the plugin lifetime ends before closing its account queue', async () => {
  const h = await fixture(), account = await h.bind(), stream = new Readable({ read() {} });
  h.get.mockResolvedValue({ code: 0, data: { items: [{ message_id: 'om_1', chat_id: 'oc_chat', msg_type: 'file',
    body: { content: JSON.stringify({ file_key: 'file_original', file_name: 'report.md' }) }, create_time: '1793788800000',
    sender: { sender_type: 'user', id_type: 'open_id', id: 'ou_user' } }] } });
  h.client.im.v1.messageResource.get.mockResolvedValue({ getReadableStream: () => stream });
  const operation = h.native.readResource(account.id, route, 'file_original', { expectedFingerprint: account.fingerprint,
    signal: new AbortController().signal, maxBytes: 100 });
  const stopped = expect(operation).rejects.toThrow();
  await vi.waitFor(() => expect(h.client.im.v1.messageResource.get).toHaveBeenCalled());
  h.lifetime.abort();
  await stopped;
  await h.native.close();
  expect(stream.destroyed).toBe(true);
});


it('prepares configured conversation directories and registers only native task commands', async () => {
  const h = await fixture(), account = await h.bind();
  const changed = await h.native.rpc('bot.conversation-directory.set', { botId: account.id,
    config: { enabled: true, strategy: 'per-conversation', prefix: 'chat-' } });
  expect(changed).toMatchObject({ ok: true });
  const one = await h.native.prepareDialogue(account.id, 'conversation-one', account.fingerprint);
  expect(one).toContain('chat-');
  expect(await h.native.prepareDialogue(account.id, 'conversation-one', account.fingerprint)).toBe(one);
  expect(await h.native.prepareDialogue(account.id, 'conversation-two', account.fingerprint)).not.toBe(one);
  await expect(h.native.prepareDialogue(account.id, 'conversation-one', 'wrong')).rejects.toThrow('account-changed');
  const { NATIVE_SLASH_COMMAND_MANIFEST, normalizeSlashPanelConfig } = await import('../vendor/dsh-im/src/channels/feishu/slash-command-panel.mjs');
  const commands = NATIVE_SLASH_COMMAND_MANIFEST.map(item => item.command);
  expect(commands).toEqual(expect.arrayContaining(['new', 'tasks', 'result', 'retry', 'steer', 'stop']));
  expect(commands).not.toContain('session');
  expect(normalizeSlashPanelConfig({ mode: 'custom', order: ['tasks', 'result'] }).order).toEqual(['tasks', 'result']);
});

it('applies group mention topic settings to native text, image and file replies', async () => {
  const h = await fixture(), account = await h.bind();
  h.get.mockResolvedValue({ code: 0, data: { items: [{ message_id: 'om_1', chat_id: 'oc_chat', msg_type: 'text',
    body: { content: '{"text":"@bot hello"}' }, mentions: [{ id: 'ou_bot' }],
    sender: { sender_type: 'user', id_type: 'open_id', id: 'ou_user' } }] } });
  const options = { expectedFingerprint: account.fingerprint, signal: h.lifetime.signal, id: 'topic-test', conversationKind: 'group', uploaded() {},
    file: { bytes: Buffer.from('test'), file: { fileName: 'test.txt', mediaType: 'text/plain', size: 4 } } };
  for (const enabled of [true, false]) {
    expect(await h.native.rpc('bot.mention-topic-reply.set', { botId: account.id, mentionTopicReply: enabled })).toMatchObject({ ok: true });
    for (const block of [{ type: 'text', text: 'Hello', format: 'plain' }, { type: 'image', artifactId: 'image' }, { type: 'file', artifactId: 'file' }]) {
      await h.native.sendPart(account.id, route, block, options);
      expect(!!h.reply.mock.calls.at(-1)[0].data.reply_in_thread).toBe(enabled);
    }
  }
});

it('uses the new account workspace after conversation directory isolation is turned off', async () => {
  const h = await fixture(), account = await h.bind();
  await h.native.rpc('bot.conversation-directory.set', { botId: account.id, config: { enabled: true, strategy: 'per-conversation', prefix: 'chat-' } });
  const old = await h.native.prepareDialogue(account.id, 'conversation-one', account.fingerprint);
  await h.native.rpc('bot.conversation-directory.set', { botId: account.id, config: { enabled: false, strategy: 'per-conversation', prefix: 'chat-' } });
  const { realpath, mkdir } = await import('node:fs/promises');
  const next = join(await realpath(h.root), 'new-root'); await mkdir(next);
  expect(await h.native.rpc('bot.workspace.set', { botId: account.id, workspace: next })).toMatchObject({ ok: true });
  expect(await h.native.prepareDialogue(account.id, 'conversation-one', account.fingerprint)).toBe(next);
  expect(next).not.toBe(old);
  await h.native.rpc('bot.conversation-directory.set', { botId: account.id, config: { enabled: true, strategy: 'per-conversation', prefix: 'chat-' } });
  const resumed = await h.native.prepareDialogue(account.id, 'conversation-one', account.fingerprint);
  expect(resumed.startsWith(`${next}/`)).toBe(true);
  expect(resumed).not.toBe(old);
});

it('rechecks command permission and account identity for card callbacks', async () => {
  const h = await fixture(), account = await h.bind();
  expect(h.native.allowsCommand(account.id, account.fingerprint, 'ou_user', 'dm')).toBe(true);
  const denied = { mode: 'allowlist', allowlist: { users: [] }, open: { defaultCanExecuteCommands: false, commandPermissionOverrides: [] } };
  expect(await h.native.rpc('bot.access-policy.set', { botId: account.id, policy: { direct: denied, group: denied } })).toMatchObject({ ok: true });
  expect(h.native.allowsCommand(account.id, account.fingerprint, 'ou_user', 'dm')).toBe(false);
  expect(h.native.allowsCommand(account.id, 'old-account', 'ou_user', 'group')).toBe(false);
});

it('verifies a parent sender with the current app instead of assuming every parent belongs to it', async () => {
  const h = await fixture(), account = await h.bind();
  const source = { message_id: 'om_1', chat_id: 'oc_chat', parent_id: 'parent', sender: { sender_type: 'user', id_type: 'open_id', id: 'ou_user' } };
  let parent = { message_id: 'parent', chat_id: 'oc_chat', sender: { sender_type: 'app', id_type: 'app_id', id: 'cli_other' } };
  h.get.mockImplementation(async request => ({ code: 0, data: { items: [request.path.message_id === 'om_1' ? source : parent] } }));
  const original = { ...route, parentId: 'parent' }, options = { expectedFingerprint: account.fingerprint, signal: h.lifetime.signal };
  await expect(h.native.service.replyOwner(account.id, original, options)).resolves.toBe('other');
  parent = { ...parent, sender: { sender_type: 'app', id_type: 'app_id', id: 'cli_test' } };
  await expect(h.native.service.replyOwner(account.id, original, options)).resolves.toBe('self');
  parent = { ...parent, chat_id: 'another' };
  await expect(h.native.service.replyOwner(account.id, original, options)).resolves.toBe('unknown');
  const incoming = raw({ text: 'hello group' }, 'text', { chat_type: 'group' });
  expect(normalizeNativeMessage({ ...incoming, tenant_key: 'tenant' }, config).groupScope).toEqual({ tenantId: 'tenant', groupId: 'oc_chat' });
  expect(normalizeNativeMessage(incoming, config).groupScope).toBeUndefined();
});

it.each(['original', 'parent'])('releases the native account queue when the %s message lookup is cancelled', async stage => {
  const h = await fixture(), account = await h.bind(), pending = Promise.withResolvers(), signal = new AbortController();
  const source = { message_id: 'om_1', chat_id: 'oc_chat', parent_id: 'parent', sender: { sender_type: 'user', id_type: 'open_id', id: 'ou_user' } };
  const parent = { message_id: 'parent', chat_id: 'oc_chat', sender: { sender_type: 'app', id_type: 'app_id', id: 'cli_test' } };
  const blocked = stage === 'original' ? 'om_1' : 'parent';
  h.get.mockImplementation(request => request.path.message_id === blocked ? pending.promise : Promise.resolve({ code: 0, data: { items: [source] } }));
  const original = { ...route, parentId: 'parent' };
  const checking = h.native.service.replyOwner(account.id, original, { expectedFingerprint: account.fingerprint, signal: signal.signal });
  const rejected = expect(checking).rejects.toThrow();
  await vi.waitFor(() => expect(h.get.mock.calls.some(([request]) => request.path.message_id === blocked)).toBe(true));
  signal.abort(); await rejected;
  h.get.mockImplementation(async request => ({ code: 0, data: { items: [request.path.message_id === 'om_1' ? source : parent] } }));
  await expect(h.native.service.replyOwner(account.id, original, { expectedFingerprint: account.fingerprint, signal: h.lifetime.signal })).resolves.toBe('self');
  pending.reject(new Error('late SDK rejection'));
  await expect(h.native.rpc('bot.delete', { botId: account.id, confirm: true })).resolves.toMatchObject({ ok: true });
});
