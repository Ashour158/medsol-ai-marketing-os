/**
 * R3-K deterministic defense-in-depth for agent-visible human-curated text.
 * This is a deliberately conservative indicator check, NOT a substitute for
 * prompt-injection red-teaming or robust LLM instruction/data separation.
 * The only authoritative owner of content approval remains MarketingLearningService.
 */
const ROLE_MARKER=/(?:^|\n)\s*(?:#{1,5}\s*)?(?:system|developer|assistant|tool)(?:\s+(?:role|instructions?|message))?\s*[:：]/i;
const SPECIAL_ROLE=/<\|(?:im_start|im_end|system|developer|assistant|tool)\|>|\[(?:im_start|im_end|inst|\/inst|sys)\]|<\/?\s*(?:system|developer|assistant|tool)\s*>/i;
const OVERRIDE_INSTRUCTION=/\b(?:ignore|disregard|override|forget|bypass|drop|disable)\b.{0,120}\b(?:previous|prior|above|system|developer|safety|all|policy|policies|security|rules?|instructions?|guardrails?)\b/i;
const REQUEST_SECRETS=/\b(?:send|post|upload|exfiltrate|leak|reveal|extract|print|dump|forward)\b.{0,140}\b(?:api\s*keys?|access\s*tokens?|credentials?|secrets?|passwords?|private\s*keys?|system\s*prompts?|developer\s*messages?)\b/i;
const TOOL_EXFIL=/\b(?:curl|wget|fetch|powershell|invoke-webrequest)\b\s+https?:\/\//i;
const DIRECT_EXEC=/\b(?:execute|run|call|invoke)\b.{0,120}\b(?:tool|terminal|shell|bash|command|mcp|a2a)\b.{0,120}\b(?:now|immediately|without\s+approval|secretly|silently)\b/i;
const FAKE_AUTHORITY=/\b(?:trusted\s+system|administrator|root\s+override|developer\s+override|priority\s+zero|new\s+system\s+prompt)\b.{0,120}\b(?:instruction|override|obey|permission|authorization|follow|higher\s+priority)\b/i;
export type AgentContentRisk=
 'ROLE_SPOOF'|'SPECIAL_ROLE_DELIMITER'|'OVERRIDE_DIRECTIVE'|
 'SECRET_EXTRACTION'|'UNAUTHORIZED_TOOL_DISPATCH'|
 'EXECUTION_INSTRUCTION'|'FAKE_AUTHORITY';
/** No material leaves this process. Inspect an isolated maximum 24KB field. */
export function agentContentRisks(value:unknown):AgentContentRisk[]{
 if(typeof value!=='string'||value.length>24000)return['FAKE_AUTHORITY'];
 // Normalization catches fullwidth characters, hidden-word separators and
 // control-character encoded role delimiters, without mutating evidence.
 const normalized=value.normalize('NFKC')
  .replace(/[\u200b-\u200d\u2060\ufeff]/g,'')
  .replace(/\r/g,'\n')
  .replace(/[ \t]+/g,' ');
 const found:AgentContentRisk[]=[];
 if(ROLE_MARKER.test(normalized))found.push('ROLE_SPOOF');
 if(SPECIAL_ROLE.test(normalized))found.push('SPECIAL_ROLE_DELIMITER');
 if(OVERRIDE_INSTRUCTION.test(normalized))found.push('OVERRIDE_DIRECTIVE');
 if(REQUEST_SECRETS.test(normalized))found.push('SECRET_EXTRACTION');
 if(TOOL_EXFIL.test(normalized))found.push('UNAUTHORIZED_TOOL_DISPATCH');
 if(DIRECT_EXEC.test(normalized))found.push('EXECUTION_INSTRUCTION');
 if(FAKE_AUTHORITY.test(normalized))found.push('FAKE_AUTHORITY');
 return found;
}
export function safeForAgentEvidence(value:unknown):boolean{
 return agentContentRisks(value).length===0;
}
