/** Exercise typed publications and serialized document triggers through the real Runtime. */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { startRuntime, feishu, MEMBER } from './fixtures/host.ts';
import { FeishuDocuments } from '../src/messaging/feishu-documents.ts';

const event = (reply, extras = {}) => ({ event_id: `event-${reply}`, is_mentioned: true, comment_id: `comment-${reply}`, reply_id: reply,
  notice_meta: { file_type: 'docx', file_token: 'doc1', from_user_id: { open_id: MEMBER } }, ...extras });
async function fixture() {
  const h = await startRuntime();
  const task = await h.acceptedTicket(feishu('doc1', 'Fix the existing typo'));
  const api = vi.fn(async (_bot, _fingerprint, request) => {
    if (request.url === '/open-apis/docx/v1/documents') return { document: { document_id: 'doc1' } };
    if (request.url.endsWith('/convert')) return { first_level_block_ids: ['text'], blocks: [{ block_id: 'text', block_type: 2, text: { elements: [{ text_run: { content: 'Plan' } }] } }] };
    if (request.url.endsWith('/raw_content')) return { content: 'Current document text' };
    if (request.method === 'GET' && request.url.includes('/comments/')) {
      const reply = request.url.split('comment-')[1];
      return { quote: 'Selected paragraph', reply_list: { replies: [{ reply_id: reply, user_id: MEMBER, content: { elements: [{ type: 'text_run', text_run: { text: `Question ${reply}` } }] } }] } };
    }
    if (request.url.endsWith('/replies')) return { reply_id: 'bot-reply' };
    if (request.url.endsWith('/metas/batch_query')) return { metas: [{ doc_token: 'doc1', url: 'https://tenant.feishu.cn/docx/doc1' }] };
    return {};
  });
  h.runtime.nativeFeishu = { documentRequest: api, accounts: () => [{ id: 'bot', fingerprint: 'fingerprint', channel: 'feishu' }], allowsCommand: () => true, close: async () => {} };
  await writeFile(join(task.ticket.execution.directory, 'plan.md'), '# Plan');
  const artifact = await h.runTool(task.sessionId, 'personal_agent_artifact', { path: 'plan.md', title: 'Plan' });
  await h.runTool(task.sessionId, 'personal_agent_report', { state: 'ready', summary: 'Plan', publication: { mode: 'publish', blocks: [{ type: 'text', text: 'Initial answer' }] } });
  await h.runtime.idle();
  h.agents.get(task.sessionId).status = 'idle';
  const message = { id: 'document-delivery', ticketId: task.ticket.id, kind: 'notice', text: 'Plan', channel: task.trigger.channel };
  await h.runtime.documents.publish('bot', 'fingerprint', { actorId: MEMBER, conversationId: 'oc_team', messageId: 'om_doc1' }, message, { type: 'file', artifactId: artifact.artifact_id });
  return { ...h, task, api, message };
}
it('binds comments to their Worker, serializes concurrent requests, and freezes the result destination independently of model arguments', async () => {
  const h = await fixture();
  try {
    const docs = h.runtime.documents;
    await Promise.all([docs.receive('bot', 'fingerprint', event('r1')), docs.receive('bot', 'fingerprint', event('r1'))]);
    await docs.receive('bot', 'fingerprint', event('r2'));
    expect(docs.pending()).toHaveLength(2);
    expect(docs.pending().every(item => item.state === 'queued')).toBe(true);
    docs.pass(); await h.runtime.idle();
    const active = docs.pending().find(item => item.state === 'active');
    expect(active).toBeDefined();
    expect(active.trigger.channel.address.replyId).toBe('r1');
    expect(docs.pending().filter(item => item.state === 'queued')).toHaveLength(1);
    expect(JSON.parse(active.trigger.text)).toMatchObject({ document: 'Current document text', quote: 'Selected paragraph' });
    expect(h.runtime.store.triggers.disposition(active.id).fanout).toContain(h.task.ticket.id);
    expect(() => h.runtime.engine.receive({ ...active.trigger, text: 'forged' })).toThrow('not authorized');
    const ack = await h.runTool(h.task.sessionId, 'personal_agent_ack', { trigger_id: h.task.trigger.id, text: '正在修改。' });
    expect(ack.trigger_id).toBe(active.id);
    await h.runTool(h.task.sessionId, 'personal_agent_report', { state: 'ready', summary: 'First reply', reply_to_trigger_id: h.task.trigger.id,
      publication: { mode: 'publish', blocks: [{ type: 'text', text: 'Answer one' }] } });
    const result = h.runtime.results.list(h.task.ticket.id).find(item => item.summary === 'First reply');
    expect(result.channel).toEqual(active.trigger.channel);
    await h.runtime.idle(); await h.runtime.pump(); await h.runtime.idle();
    const sends = h.api.mock.calls.filter(([, , request]) => request.method === 'POST' && request.url.endsWith('/replies'));
    expect(sends.some(([, , request]) => request.url.includes(`/comments/${active.trigger.channel.address.commentId}/replies`) && JSON.stringify(request.data).includes('Answer one'))).toBe(true);
    h.agents.get(h.task.sessionId).status = 'idle';
    docs.pass(); await h.runtime.idle(); docs.pass(); await h.runtime.idle();
    const next = docs.pending().find(item => item.state === 'active');
    expect(next).toBeDefined(); expect(next.id).not.toBe(active.id);
    await h.runTool(h.task.sessionId, 'personal_agent_report', { state: 'ready', summary: 'Second reply', publication: { mode: 'publish', blocks: [{ type: 'text', text: 'Answer two' }] } });
    expect(h.runtime.results.list(h.task.ticket.id).find(item => item.summary === 'Second reply').channel).toEqual(next.trigger.channel);
    await h.runtime.idle();
  } finally { await h.stop(); }
});
it('ignores unbound docs, other senders, stale accounts, nonmentions and human-stopped tasks', async () => {
  const h = await fixture();
  try {
    const docs = h.runtime.documents;
    await docs.receive('bot', 'stale', event('r1'));
    await docs.receive('bot', 'fingerprint', event('r1', { is_mentioned: false }));
    await docs.receive('bot', 'fingerprint', event('r1', { notice_meta: { file_type: 'docx', file_token: 'other', from_user_id: { open_id: MEMBER } } }));
    await docs.receive('bot', 'fingerprint', event('r1', { notice_meta: { file_type: 'docx', file_token: 'doc1', from_user_id: { open_id: 'someone-else' } } }));
    expect(docs.pending()).toEqual([]);
    await docs.receive('bot', 'fingerprint', event('r1'));
    h.runtime.nativeFeishu.allowsCommand = () => false;
    docs.pass();
    expect(docs.pending()[0].state).toBe('rejected');
    h.runtime.nativeFeishu.allowsCommand = () => true;
    await docs.receive('bot', 'fingerprint', event('r2'));
    docs.pass(); await h.runtime.idle();
    h.runtime.engine.stopTicket(h.task.ticket.id);
    await docs.receive('bot', 'fingerprint', event('r3'));
    expect(docs.pending()).toHaveLength(2);
  } finally { await h.stop(); }
});
