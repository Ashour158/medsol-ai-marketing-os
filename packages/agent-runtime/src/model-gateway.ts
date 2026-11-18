export type ModelRequest = { organizationId: string; correlationId: string; agentId: string; purpose: string; input: string; maxOutputTokens: number; timeoutMs: number; estimatedCostMicros: number };
export type ModelResult = { text: string; inputTokens: number; outputTokens: number; actualCostMicros: number; model: string };
export interface ModelAdapter { complete(request: ModelRequest, signal: AbortSignal): Promise<ModelResult> }
export class ModelGatewayError extends Error { constructor(message: string) { super(message); this.name = 'ModelGatewayError'; } }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ModelGatewayError('Structured object required');
  return value as Record<string, unknown>;
}
function string(value: unknown, name: string, min: number, max: number): string {
  if (typeof value !== 'string' || value.length < min || value.length > max) throw new ModelGatewayError('Invalid ' + name);
  return value;
}
function integer(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new ModelGatewayError('Invalid ' + name);
  return value;
}
function exactKeys(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).some(k => !keys.includes(k))) throw new ModelGatewayError('Unexpected structured field');
}
export const ModelRequestSchema = { parse(raw: unknown): ModelRequest {
  const v = object(raw);
  exactKeys(v, ['organizationId','correlationId','agentId','purpose','input','maxOutputTokens','timeoutMs','estimatedCostMicros']);
  return {
    organizationId: string(v.organizationId,'organizationId',1,200),
    correlationId: string(v.correlationId,'correlationId',1,200),
    agentId: string(v.agentId,'agentId',1,200),
    purpose: string(v.purpose,'purpose',3,200),
    input: string(v.input,'input',1,32000),
    maxOutputTokens: integer(v.maxOutputTokens,'maxOutputTokens',1,4096),
    timeoutMs: integer(v.timeoutMs,'timeoutMs',100,30000),
    estimatedCostMicros: integer(v.estimatedCostMicros,'estimatedCostMicros',0,100000000)
  };
} };
export const ModelResultSchema = { parse(raw: unknown): ModelResult {
  const v = object(raw);
  exactKeys(v, ['text','inputTokens','outputTokens','actualCostMicros','model']);
  return {
    text: string(v.text,'text',0,65536),
    inputTokens: integer(v.inputTokens,'inputTokens',0,100000000),
    outputTokens: integer(v.outputTokens,'outputTokens',0,100000000),
    actualCostMicros: integer(v.actualCostMicros,'actualCostMicros',0,1000000000),
    model: string(v.model,'model',1,120)
  };
} };
export function assertModelResult(request: ModelRequest, raw: unknown): ModelResult {
  const parsed = ModelResultSchema.parse(raw);
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
  async complete(): Promise<ModelResult> { throw new ModelGatewayError('Model provider is disabled until explicitly configured'); }
}
