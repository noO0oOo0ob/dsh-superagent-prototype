/** Model tool definitions independent of resource readers and application composition. */
import { z } from 'zod'

export interface Tool<S extends z.ZodType = z.ZodType> {
  name: string
  description: string
  schema: S
  execute: (args: z.infer<S>, signal: AbortSignal) => Promise<unknown>
}
export type RegisterTool = <S extends z.ZodType>(name: string, description: string, schema: S, execute: Tool<S>['execute']) => void
/** Erase the argument type after pairing a handler with its parser; Session registration validates arguments before execution. */
export const tool = <S extends z.ZodType>(definition: Tool<S>): Tool => definition as Tool

/** Remove Zod's non-enumerable Standard Schema methods before DSH snapshots the model-visible JSON schema. */
export const toolParameters = (schema: z.ZodType) => ({ ...z.toJSONSchema(schema) })
