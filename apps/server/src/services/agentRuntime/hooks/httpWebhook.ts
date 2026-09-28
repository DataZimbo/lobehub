import { ssrfSafeFetch } from '@lobechat/ssrf-safe-fetch';
import type { ToolCallHookExecutionResult } from '@lobechat/types';
import {
  AGENT_HOOK_RESPONSE_MAX_BYTES,
  agentHookWebhookSchema,
  parseToolCallHookResponse,
} from '@lobechat/types';

import { OtelQstashClient } from '@/libs/qstash';

import type { AgentHookWebhook } from './types';

class HookHttpError extends Error {
  constructor(
    public readonly code:
      | 'configuration'
      | 'http_error'
      | 'invalid_response'
      | 'network_error'
      | 'response_too_large'
      | 'timeout',
  ) {
    super(`Hook HTTP request failed: ${code}`);
    this.name = 'HookHttpError';
  }
}

function resolveUrl(url: string): string {
  try {
    const resolved = new URL(url, process.env.INTERNAL_APP_URL || process.env.APP_URL || undefined);
    if (
      !['http:', 'https:'].includes(resolved.protocol) ||
      resolved.username ||
      resolved.password
    ) {
      throw new Error('Invalid webhook configuration');
    }
    return resolved.href;
  } catch {
    throw new HookHttpError('configuration');
  }
}

function isApplicationOrigin(url: string): boolean {
  return [process.env.INTERNAL_APP_URL, process.env.APP_URL].some((base) => {
    if (!base) return false;
    try {
      return new URL(base).origin === new URL(url).origin;
    } catch {
      return false;
    }
  });
}

/** Only explicitly allowlisted variables are expanded; errors never contain their values. */
export function resolveWebhookHeaders(webhook: AgentHookWebhook): Record<string, string> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const allowed = new Set(webhook.allowedEnvVars ?? []);
  try {
    for (const [name, template] of Object.entries(webhook.headers ?? {})) {
      if (
        /^(?:host|content-length|connection|transfer-encoding|trailer|upgrade|proxy-.*|sec-.*|upstash-.*)$/i.test(
          name,
        )
      ) {
        throw new Error('Invalid webhook configuration');
      }
      const value = template.replaceAll(/\$\{([^}]*)\}/g, (_, variable: string) => {
        if (!allowed.has(variable) || process.env[variable] === undefined)
          throw new Error('Invalid webhook configuration');
        return process.env[variable]!;
      });
      if (value.includes('${') || /[\r\n\0]/.test(value))
        throw new Error('Invalid webhook configuration');
      headers.set(name, value);
    }
    return Object.fromEntries(headers.entries());
  } catch {
    throw new HookHttpError('configuration');
  }
}

async function fetchBody(
  webhook: AgentHookWebhook,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const timeout = AbortSignal.timeout(Math.ceil((webhook.timeout ?? 30) * 1000));
  const combinedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    combinedSignal.throwIfAborted();
    const response = await ssrfSafeFetch(
      resolveUrl(webhook.url),
      {
        body: JSON.stringify(payload),
        headers: resolveWebhookHeaders(webhook),
        method: 'POST',
        redirect: 'error',
        signal: combinedSignal,
      },
      { maxContentLength: AGENT_HOOK_RESPONSE_MAX_BYTES + 1 },
    );
    combinedSignal.throwIfAborted();
    if (response.status < 200 || response.status >= 300) throw new HookHttpError('http_error');
    const body = await response.arrayBuffer();
    combinedSignal.throwIfAborted();
    if (body.byteLength > AGENT_HOOK_RESPONSE_MAX_BYTES)
      throw new HookHttpError('response_too_large');
    return body;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeout.aborted) throw new HookHttpError('timeout');
    if (error instanceof HookHttpError) throw error;
    throw new HookHttpError('network_error');
  }
}

/** Notification transport. A control config must never be sent through a response-ignoring path. */
export async function deliverWebhook(
  webhook: AgentHookWebhook,
  payload: Record<string, unknown>,
): Promise<void> {
  const parsed = agentHookWebhookSchema.safeParse(webhook);
  if (!parsed.success || webhook.responseHandling === 'toolCall')
    throw new HookHttpError('configuration');
  if (webhook.delivery !== 'qstash') {
    await fetchBody(webhook, payload);
    return;
  }

  const url = resolveUrl(webhook.url);
  const headers = resolveWebhookHeaders(webhook);
  try {
    if (!process.env.QSTASH_TOKEN) throw new HookHttpError('configuration');
    const client = new OtelQstashClient({ token: process.env.QSTASH_TOKEN });
    await client.publishJSON({
      body: payload,
      headers: {
        ...headers,
        ...(isApplicationOrigin(url) &&
          process.env.VERCEL_AUTOMATION_BYPASS_SECRET && {
            'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
          }),
      },
      timeout: webhook.timeout ?? 30,
      url,
    });
  } catch {
    // Do not log the SDK error: it may contain destination headers or remote response text.
    if (webhook.fallback === 'none') throw new HookHttpError('network_error');
    await fetchBody(webhook, payload);
  }
}

/**
 * C1 preparation primitive. No retries, side effects on tools, or application of decisions.
 * The caller supplies the full authoritative event and handles cancellation before onError.
 */
export async function executeToolCallWebhook(
  webhook: AgentHookWebhook,
  payload: Record<string, unknown>,
  options: { signal?: AbortSignal } = {},
): Promise<ToolCallHookExecutionResult> {
  if (options.signal?.aborted) return { status: 'cancelled' };
  const parsed = agentHookWebhookSchema.safeParse(webhook);
  if (!parsed.success || webhook.responseHandling !== 'toolCall') {
    return { code: 'configuration', status: 'error' };
  }
  try {
    const body = await fetchBody(parsed.data, payload, options.signal);
    if (options.signal?.aborted) return { status: 'cancelled' };
    try {
      return parseToolCallHookResponse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    } catch {
      return { code: 'invalid_response', status: 'error' };
    }
  } catch (error) {
    if (options.signal?.aborted) return { status: 'cancelled' };
    return { code: error instanceof HookHttpError ? error.code : 'network_error', status: 'error' };
  }
}
