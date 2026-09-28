import type { AgentHookMatcher } from '@lobechat/types';
import { isRecord } from '@lobechat/utils/object';

/** Matcher patterns are validated at registration/restoration; no stateful RegExp flags. */
export function matchesHook(matcher: AgentHookMatcher | undefined, event: unknown): boolean {
  if (!matcher) return true;
  if (!isRecord(event)) return false;
  return (['identifier', 'apiName'] as const).every((key) => {
    const pattern = matcher[key];
    if (!pattern || pattern === '*') return true;
    return typeof event[key] === 'string' && new RegExp(pattern).test(event[key]);
  });
}
