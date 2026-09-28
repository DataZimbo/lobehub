import type { BuiltinToolManifest } from '@lobechat/types';

import { systemPrompt } from './systemRole';
import { DocumentApiName, PageAgentIdentifier } from './types';

export const PageAgentManifest: BuiltinToolManifest = {
  api: [
    {
      description:
        'Run a shell command in a sandboxed workspace that holds only the current page. Read the page with cat/grep, edit /doc.xml in place (sed, awk, heredoc), write /doc.md to replace the whole page, or write /title to rename it. Every call starts from the latest page; only /tmp is scratch space.',
      name: DocumentApiName.bash,
      parameters: {
        properties: {
          command: {
            description:
              'Shell command to run. Files: /doc.xml (LiteXML, editable), /doc.md (Markdown, writing it replaces the page), /title, /.meta/outline (read-only), /tmp (scratch).',
            type: 'string',
          },
        },
        required: ['command'],
        type: 'object',
      },
    },
  ],
  identifier: PageAgentIdentifier,
  meta: {
    avatar: '📄',
    description: 'Read and edit the current page with shell commands',
    readme:
      'Read and edit the current page through a sandboxed shell: grep and sed over the page as LiteXML, rewrite it from Markdown, or rename it.',
    title: 'Document',
  },
  systemRole: systemPrompt,
  type: 'builtin',
};
