/** Host-generated card actions are single-use requests scoped to account, sender and context generation. */
import { z } from 'zod'
import { key, type Trigger } from '../core/index.ts'
import { family } from '../kv.ts'
import type { Store } from '../app/store.ts'
import type { Conversations } from './conversations.ts'
import type { MessageDelivery } from './delivery.ts'
const Action = z.object({ version: z.literal(1), id: z.string(), triggerId: z.string(), command: z.enum(['new', 'tasks', 'status', 'help']),
  used: z.boolean().default(false) }).strict()
const actions = family<z.infer<typeof Action>>('personal-message-action:')
const Callback = z.object({ operator: z.object({ open_id: z.string() }).passthrough(),
  context: z.object({ open_message_id: z.string(), open_chat_id: z.string() }).passthrough(),
  action: z.object({ value: z.object({ spaAction: z.string() }).passthrough() }).passthrough() }).passthrough()
/** Validates single-use card callbacks against persisted source and delivery records. */
export class MessageActions {
  constructor(private readonly store: Store, private readonly conversations: Conversations, private readonly deliveries: MessageDelivery,
    private readonly authorize: (trigger: Trigger) => boolean) {}
  menu(trigger: Trigger): { label: string; actionId: string }[] {
    return ([['tasks', '查看任务'], ['status', '状态'], ['new', '新对话'], ['help', '帮助']] as const).map(([command, label]) => {
      const id = key('message-action-v1', trigger.id, command)
      if (!this.store.get(actions(id))) this.store.set(actions(id), { version: 1, id, triggerId: trigger.id, command, used: false })
      return { label, actionId: id }
    })
  }
  /** Validate the platform callback against both its original source and the actual card delivery receipt. */
  receive(botId: string, raw: unknown, run: (trigger: Trigger) => void): { toast: { type: 'success' | 'error' | 'info'; content: string } } {
    const parsed = Callback.safeParse(raw)
    if (!parsed.success) return { toast: { type: 'error', content: '此卡片操作不可用。' } }
    const event = parsed.data, id = event.action.value.spaAction, value = this.store.get(actions(id))
    if (!value) return { toast: { type: 'error', content: '此卡片操作已失效。' } }
    const action = Action.parse(value), trigger = this.store.triggers.get(action.triggerId)
    if (!trigger || trigger.meta.botId !== botId || trigger.actor.id !== event.operator.open_id || trigger.meta.conversationId !== event.context.open_chat_id)
      return { toast: { type: 'error', content: '只有发起此菜单的人能操作。' } }
    if (!this.authorize(trigger)) return { toast: { type: 'error', content: '当前账号或命令权限已变更，请联系机器人管理员。' } }
    const conversation = this.conversations.forTrigger(trigger)
    if (!conversation || conversation.generation !== trigger.meta.dialogueGeneration)
      return { toast: { type: 'error', content: '对话已更新，请重新发送 /menu。' } }
    const sent = this.deliveries.list().some(receipt => receipt.source === trigger.source && receipt.parts.some(part =>
      part.block.type === 'card' && part.block.actions.some(item => item.actionId === id) && part.providerMessageIds.includes(event.context.open_message_id)))
    if (!sent) return { toast: { type: 'error', content: '无法确认此卡片的投递记录，请重新发送命令。' } }
    if (action.used) return { toast: { type: 'info', content: '此操作已接收，请勿重复提交。' } }
    this.store.atomic(() => {
      run({ ...trigger, id: key('card-command-v1', id), text: `/${action.command}`, at: new Date().toISOString(),
        meta: { ...trigger.meta, virtual: true, cardActionId: id, command: true } })
      this.store.set(actions(id), { ...action, used: true })
    })
    return { toast: { type: 'success', content: '已接收，回复将发送到当前会话。' } }
  }
}
