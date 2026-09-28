import { escapeXmlAttr, escapeXmlContent } from '@lobechat/prompts';
import { isRecord } from '@lobechat/utils/object';

import { BaseProcessor } from '../base/BaseProcessor';
import type { PipelineContext } from '../types';

/** Project persisted hook guidance onto its tool result, never user/system messages. */
export class ToolHookContextProvider extends BaseProcessor {
  readonly name = 'ToolHookContextProvider';

  protected async doProcess(context: PipelineContext): Promise<PipelineContext> {
    const result = this.cloneContext(context);
    result.messages = result.messages.map((message) => {
      if (message.role !== 'tool') return message;
      const preparation = message.pluginState?.hookPreparation;
      if (!isRecord(preparation) || !Array.isArray(preparation.additionalContexts)) return message;
      const seen = new Set<string>(
        (message.meta?.toolHookContextIds as string[] | undefined) ?? [],
      );
      const additions: string[] = [];
      for (const fragment of preparation.additionalContexts) {
        if (
          !isRecord(fragment) ||
          typeof fragment.hookId !== 'string' ||
          typeof fragment.text !== 'string'
        )
          continue;
        const key = JSON.stringify([message.id, message.tool_call_id, fragment.hookId]);
        if (seen.has(key)) continue;
        seen.add(key);
        additions.push(
          `<tool_hook_context hook="${escapeXmlAttr(fragment.hookId)}">${escapeXmlContent(fragment.text)}</tool_hook_context>`,
        );
      }
      if (!additions.length) return message;
      const text = additions.join('\n');
      return {
        ...message,
        content:
          typeof message.content === 'string'
            ? `${message.content}\n\n${text}`
            : [...(message.content ?? []), { text, type: 'text' as const }],
        meta: { ...message.meta, toolHookContextIds: [...seen] },
      };
    });
    return this.markAsExecuted(result);
  }
}
