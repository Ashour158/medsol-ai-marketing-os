import { z } from 'zod';

export const ModelRequestSchema = z.object({
  organizationId: z.string().min(1),
  correlationId: z.string().min(1),
  agentId: z.string().min(1),
  purpose: z.string().min(3).max(200),
  input: z.string().min(1).max(32000),
  maxOutputTokens: z.number().int().min(1).max(4096),
  timeoutMs: z.number().int().min(100).max(30000),
  estimatedCostMicros: z.number().int().min(0).max(100000000)
}).strict();
export type ModelRequest = z.infer<typeof ModelRequestSchema>;
export const ModelResultSchema = z.object({
  text: z.string().max(65536),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  actualCostMicros: z.number().int().nonnegative(),
  model: z.string().min(1).max(120)
}).strict();
export type ModelResult = z.infer<typeof ModelResultSchema>;
export interface ModelAdapter {
  complete(request: ModelRequest, signal: AbortSignal): Promise<ModelResult>;
}
export class ModelGatewayError extends Error {
  constructor(message: string) { super(message); this.name = 'ModelGatewayError'; }
}
export function assertModelResult(request: ModelRequest, result: unknown): ModelResult {
  const parsed = ModelResultSchema.parse(result);
  if (parsed.outputTokens > request.maxOutputTokens) throw new ModelGatewayError('Provider exceeded output token limit');
  if (parsed.actualCostMicros > request.estimatedCostMicros) throw new ModelGatewayError('Provider exceeded reserved cost');
  return parsed;
}
export class BoundedModelGateway {
  constructor(private readonly adapter: ModelAdapter) {}
  async complete(raw: unknown): Promise<ModelResult> {
    const request = ModelRequestSchema.parse(raw);
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.adapter.complete(request, controller.signal).then(result => assertModelResult(request, result)),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => { controller.abort(); reject(new ModelGatewayError('Model execution timed out')); }, request.timeoutMs);
        })
      ]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      controller.abort();
    }
  }
}
export class DisabledModelAdapter implements ModelAdapter {
  async complete(): Promise<ModelResult> {
    throw new ModelGatewayError('Model provider is disabled until explicitly configured');
  }
}
