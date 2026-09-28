import type { EditorRuntime } from '@lobechat/editor-runtime';
import type { BuiltinToolResult, ToolAfterCallContext } from '@lobechat/types';
import { BaseExecutor } from '@lobechat/types';
import debug from 'debug';

import { runPageBash } from '../../bash';
import type { BashArgs } from '../../types';
import { PageAgentIdentifier } from '../../types';

const log = debug('lobe-page-agent:executor');

const PageAgentApiName = {
  bash: 'bash',
} as const;

const getRuntimeDebugSnapshot = (runtime: EditorRuntime) => {
  const candidate = runtime as EditorRuntime & {
    getDebugSnapshot?: () => unknown;
  };

  return candidate.getDebugSnapshot?.();
};

const PAGE_EDITOR_NOT_MOUNTED_MESSAGE =
  'Page editor is not currently mounted. This topic was started in the page editor, but the editor is not active in the current view. ' +
  'Do not retry bash here — it requires a mounted editor. ' +
  'To read or modify the topic document, use lobe-agent-documents (readDocument / replaceDocumentContent / modifyNodes).';

class PageAgentExecutor extends BaseExecutor<typeof PageAgentApiName> {
  readonly identifier = PageAgentIdentifier;
  protected readonly apiEnum = PageAgentApiName;

  private runtime: EditorRuntime;

  constructor(runtime: EditorRuntime) {
    super();
    this.runtime = runtime;
  }

  // Runs the page shell in the renderer when the client runtime executes tools
  // locally; gateway runs go through the server runtime instead.
  bash = async ({ command }: BashArgs): Promise<BuiltinToolResult> => {
    // scope is topic-bound, not route-bound: navigating away from the page
    // editor keeps scope==='page' on the same topic, so without this guard the
    // LLM could still edit a stale editor ref.
    if (!this.runtime.isReady()) {
      console.warn('[PageAgentToolCall] blocked: editor not mounted', {
        runtime: getRuntimeDebugSnapshot(this.runtime),
      });
      return {
        content: PAGE_EDITOR_NOT_MOUNTED_MESSAGE,
        error: {
          body: {
            apiName: PageAgentApiName.bash,
            code: 'PAGE_EDITOR_NOT_MOUNTED',
            kind: 'replan',
            runtime: getRuntimeDebugSnapshot(this.runtime),
          },
          message: PAGE_EDITOR_NOT_MOUNTED_MESSAGE,
          type: 'PageEditorNotMounted',
        },
        success: false,
      };
    }

    try {
      // No documentId in state: the mounted editor already holds these edits and
      // saves them itself; revalidating would let a stale server row win.
      const { content, state } = await runPageBash(this.runtime, command);
      return { content, state, success: true };
    } catch (error) {
      const err = error as Error;
      console.error('[PageAgentToolCall] bash:error', err);
      return {
        error: { body: error, message: err.message, type: 'PluginServerError' },
        success: false,
      };
    }
  };

  // Revalidating the editor SWR key routes the saved row through
  // DocumentStore.reconcileRemote, the single place that decides whether the
  // mounted editor adopts it; pushing a snapshot into the editor here would
  // hydrate twice and mark the store dirty in between.
  onAfterCall = async ({ apiName, result }: ToolAfterCallContext): Promise<void> => {
    if (!result.success || apiName !== PageAgentApiName.bash) return;

    const state = result.state as { changed?: unknown; documentId?: unknown } | undefined | null;
    if (state?.changed !== true) return;
    const documentId = typeof state.documentId === 'string' ? state.documentId : undefined;
    if (!documentId) return;

    try {
      const { invalidateDocumentMutation } = await import('@/services/document/invalidation');
      await invalidateDocumentMutation({ documentId });
    } catch (error) {
      log('[PageAgentExecutor] document revalidation failed', error);
    }
  };
}

export { PageAgentExecutor };
