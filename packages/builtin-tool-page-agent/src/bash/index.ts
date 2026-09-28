import {
  diffLiteXMLBlocks,
  type EditorRuntime,
  formatModifyNodesResult,
  parseLiteXMLBlocks,
} from '@lobechat/editor-runtime';
import type { CommandName } from 'just-bash';

import type { BashState } from '../types';

const DOC_XML = '/doc.xml';
const DOC_MD = '/doc.md';
const TITLE = '/title';
const OUTLINE = '/.meta/outline';

const ALLOWED_COMMANDS: CommandName[] = [
  'awk',
  'basename',
  'cat',
  'cp',
  'cut',
  'diff',
  'dirname',
  'echo',
  'egrep',
  'false',
  'fgrep',
  'find',
  'grep',
  'head',
  'help',
  'ls',
  'mkdir',
  'mv',
  'printf',
  'pwd',
  'rg',
  'rm',
  'sed',
  'sort',
  'tail',
  'tee',
  'touch',
  'tr',
  'tree',
  'true',
  'uniq',
  'wc',
  'which',
];

const STUB_COMMANDS = ['python3', 'python', 'pip', 'node', 'nodejs', 'perl', 'ruby', 'php'];

const AVAILABLE_HINT = `Available: ${ALLOWED_COMMANDS.join(' ')}`;

const MAX_OUTPUT_BYTES = 1024 * 1024;
// Stays well under the 30s edit-lock lease the server holds around a call.
const MAX_EXECUTION_MS = 10_000;

const buildOutline = (xml: string) => {
  const blocks = parseLiteXMLBlocks(xml);
  if (typeof blocks === 'string' || blocks.length === 0) return '';

  return `${blocks
    .map(({ id, tag, text }) => `${id ?? '-'} ${tag} ${text.slice(0, 80)}`.trim())
    .join('\n')}\n`;
};

const MIN_SIZE_LIMIT = 2 * 1024 * 1024;

const isTooLarge = (next: string, previous: string) =>
  next.length > Math.max(4 * previous.length, MIN_SIZE_LIMIT);

const readIfExists = async (
  fs: { exists: (path: string) => Promise<boolean>; readFile: (path: string) => Promise<string> },
  path: string,
) => ((await fs.exists(path)) ? fs.readFile(path) : undefined);

export const runPageBash = async (
  runtime: EditorRuntime,
  command: string,
): Promise<{ content: string; state: BashState }> => {
  const { Bash, defineCommand } = await import('just-bash');

  const {
    markdown = '',
    metadata: { title },
    xml = '',
  } = runtime.getPageContentContext('both');
  const outline = buildOutline(xml);

  const bash = new Bash({
    commands: ALLOWED_COMMANDS,
    customCommands: STUB_COMMANDS.map((name) =>
      defineCommand(name, async () => ({
        exitCode: 127,
        stderr: `${name} is not available in this workspace. Edit the page with shell text tools.\n${AVAILABLE_HINT}\n`,
        stdout: '',
      })),
    ),
    cwd: '/',
    // Defense-in-depth patches process-wide globals for the duration of exec, so
    // host code sharing the process (Next's async hooks, React's scheduler) hits
    // violations, and one thrown inside an async hook crashes the server. It only
    // guards JS/Python evaluation, which the command whitelist never exposes.
    defenseInDepth: false,
    executionLimitProfile: 'hardened',
    executionLimits: { maxExecutionTimeMs: MAX_EXECUTION_MS, maxOutputSize: MAX_OUTPUT_BYTES },
    files: {
      [DOC_MD]: markdown,
      [DOC_XML]: xml,
      [OUTLINE]: outline,
      [TITLE]: `${title}\n`,
    },
  });
  await bash.fs.mkdir('/tmp', { recursive: true });
  const pathsBefore = new Set(bash.fs.getAllPaths());

  const output: string[] = [];
  const finish = (changed: boolean, exitCode: number, success: boolean) => {
    const content = output.filter(Boolean).join('\n') || '(no output)';
    return { content, state: { changed, exitCode, success } };
  };

  let exitCode: number;
  let hitLimit: boolean;
  try {
    const result = await bash.exec(command);
    exitCode = result.exitCode;
    hitLimit = exitCode === 126 && result.stderr.includes('executionLimits');
    output.push(result.stdout.trimEnd(), result.stderr.trimEnd());
  } catch (error) {
    output.push(`Command aborted: ${(error as Error).message}`, 'Nothing was written.');
    return finish(false, 1, false);
  }
  if (exitCode !== 0) output.push(`exit ${exitCode}`);

  const nextXml = await readIfExists(bash.fs, DOC_XML);
  const nextMarkdown = await readIfExists(bash.fs, DOC_MD);
  const nextTitleFile = await readIfExists(bash.fs, TITLE);
  const nextOutline = await readIfExists(bash.fs, OUTLINE);

  const warnings: string[] = [];
  for (const [path, next] of [
    [DOC_XML, nextXml],
    [DOC_MD, nextMarkdown],
    [TITLE, nextTitleFile],
  ] as const) {
    if (next === undefined) warnings.push(`warning: ${path} was deleted; ignored.`);
  }
  if (nextOutline !== outline) warnings.push(`warning: ${OUTLINE} is read-only; ignored.`);
  const strayPaths = bash.fs
    .getAllPaths()
    .filter((path) => !pathsBefore.has(path) && path !== '/tmp' && !path.startsWith('/tmp/'));
  if (strayPaths.length > 0) {
    warnings.push(
      `warning: only /tmp is writable scratch space; ignored ${strayPaths.join(', ')}.`,
    );
  }
  output.push(...warnings);

  const xmlChanged = nextXml !== undefined && nextXml !== xml;
  const markdownChanged = nextMarkdown !== undefined && nextMarkdown !== markdown;
  const nextTitle = nextTitleFile?.replace(/\r?\n$/, '');
  const titleChanged = nextTitle !== undefined && nextTitle !== title;

  const reject = (reason: string) => {
    output.push(`Nothing was written: ${reason}`);
    return finish(false, exitCode, false);
  };

  if (hitLimit) {
    return reject('the command hit an execution limit. Split the work into smaller commands.');
  }
  if (
    (xmlChanged && isTooLarge(nextXml!, xml)) ||
    (markdownChanged && isTooLarge(nextMarkdown!, markdown))
  ) {
    return reject('the edited page is too large compared with the current one.');
  }
  if (xmlChanged && markdownChanged) {
    return reject(`${DOC_XML} and ${DOC_MD} were both modified. Edit one of them per call.`);
  }
  if (titleChanged && (!nextTitle!.trim() || /[\r\n]/.test(nextTitle!))) {
    return reject(`${TITLE} must hold a single non-empty line.`);
  }

  const diff = xmlChanged ? diffLiteXMLBlocks(xml, nextXml!) : undefined;
  if (diff && !diff.ok) return reject(`${DOC_XML} ${diff.reason}.`);

  let changed = false;

  if (markdownChanged) {
    const result = await runtime.initPage({ extractTitle: false, markdown: nextMarkdown! });
    output.push(`${DOC_MD}: page replaced (${result.nodeCount} blocks).`);
    changed = true;
  } else if (diff?.ok && diff.operations.length === 0) {
    output.push(`${DOC_XML}: no block changes detected.`);
  } else if (diff?.ok) {
    const result = await runtime.modifyNodes({ operations: diff.operations });
    const { inserted, modified, removed } = diff.summary;
    output.push(
      `${DOC_XML}: ${modified} modified, ${inserted} inserted, ${removed} removed; changes await the user's review.`,
      formatModifyNodesResult(result),
    );
    changed = result.successCount > 0;
  }

  if (titleChanged) {
    await runtime.editTitle({ title: nextTitle!.trim() });
    output.push(`${TITLE}: renamed to "${nextTitle!.trim()}".`);
    changed = true;
  }

  if (changed) {
    const refreshed = buildOutline(runtime.getPageContentContext('xml').xml ?? '');
    output.push(`${OUTLINE} (ids refreshed; use these from now on):\n${refreshed}`);
  }

  return finish(changed, exitCode, true);
};
