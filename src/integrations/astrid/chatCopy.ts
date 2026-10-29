/** Chat setup, new chat choices and fixed-session model words, kept together for the chat words pass. */
export const AGENT_CHAT_COPY = {
  setupTitle: 'How do you want Astrid to think?',
  setupHint: 'You can switch later from the + menu.',
  astridAgent: "Astrid's agent",
  astridSubtitle: 'Use your OpenRouter, ChatGPT or Claude account',
  computerSubtitle: (name: string) => `Use ${name} on this computer`,
  anotherAgent: 'Another agent',
  anotherAgentSubtitle: 'Use a different agent, like Gemini CLI or OpenCode',
  anotherAgentTerminal: 'Use it from your terminal',
  anotherAgentTerminalHint: 'Run your agent in a terminal and ask it to use Astrid. Edits, tasks and generations show up right here.',
  anotherAgentInstruction: (command: string) => `Use Astrid to edit my video project. Run "${command} --help" to see what it can do.`,
  copyAgentInstruction: 'Copy instruction for your agent',
  anotherAgentIntegration: 'Or build an integration so it chats right here',
  anotherAgentIntegrationHint: "Your coding agent can add it to Astrid's chat. Copy this prompt into it.",
  anotherAgentIntegrationShort: 'Build an integration',
  copyIntegrationPrompt: 'Copy a prompt to build the integration',
  copyIntegrationPromptShort: 'Copy prompt',
  copyAgentInstructionShort: 'Copy instruction',
  integrationPromptCopied: 'Prompt copied',
  ready: 'Ready',
  checkSignIn: 'Check sign-in',
  signIn: 'Sign in',
  notInstalled: 'Not installed',
  setUp: 'Set up',
  setupPlaceholder: (name: string) => `Set up ${name} to keep chatting`,
  setupOnHost: (name: string) => `${name} needs setting up on the computer running this chat.`,
  back: 'Back',
  waitingForAgent: (name: string) => `Waiting for ${name}…`,
  waitingForSignIn: 'Waiting for you to sign in…',
  gettingReady: (name: string) => `Getting ${name} ready…`,
  firstTime: 'The first time can take a minute.',
  movesOnByItself: 'This moves on by itself.',
  runInTerminal: 'Run in a terminal:',
  setupDone: (name: string) => `✓ ${name} is set up.`,
  firstMessage: 'Send your first message.',
  tryAgain: 'Try again',
  agentStopped: (name: string) => `${name} stopped before it was ready. Try again.`,
  openRouterRecommendation: 'We recommend OpenRouter: one key, every major model, pay as you go.',
  openRouterKey: 'OpenRouter key',
  keyAlreadySaved: 'An OpenRouter key is saved. Enter a replacement to change it.',
  openRouterPlaceholder: 'sk-or-…',
  saveKey: 'Save',
  connecting: 'Saving…',
  connect: 'Connect',
  getOpenRouterKey: 'Get a key at openrouter.ai/keys',
  keyPrivacy: 'Your key goes straight to Astrid on this computer.',
  checkingKey: 'Checking your key…',
  invalidKey: "OpenRouter didn't accept that key.",
  emptyKey: 'Paste your OpenRouter key first.',
  providerUnreachable: "Couldn't reach OpenRouter. Check your connection and try again.",
  keySaveFailed: "Couldn't save that key. Try again.",
  keyServiceOutdated: 'Update Astrid on your computer to connect a key here, or use /login below.',
  alternativeSignIn: 'Already have ChatGPT, Claude or Copilot? Use that instead',
  alternativeInstruction: 'Start Astrid in a terminal, type /login, then pick ChatGPT, Claude or Copilot.',
  loadingModels: 'Loading models…',
  searchModels: 'Search models',
  useModel: (name: string) => `Use ${name}`,
  fixedModel: 'To use another model, start a new chat.',
  useAgentDefault: "Use the agent's default model",
  noModels: 'No models available.',
  modelsFailed: 'Could not load models.',
  thinkingUsage: 'Use `/thinking <level>` to update this session.',
  terminalTitle: 'You can also talk to Astrid from your terminal',
  terminalExample: 'make the intro two seconds shorter',
  terminalResult: (projectName?: string | null) => `Updated "${projectName?.trim() || 'your project'}"`,
  terminalShowsUp: 'Edits, tasks and generations show up right here.',
  terminalSameKey: 'Uses the same sign-in as here.',
  terminalPicture: 'Example terminal session',
  terminalCopy: 'Copy terminal command',
  terminalDismiss: 'Close',
  terminalMenu: 'Use from your terminal',
  selectProjectToReadModel: "Select a project to read this chat's model.",
};

export const AGENT_INTEGRATION_PROMPT = `Add my agent to Astrid's in-app chat. Use the existing local-agent integration.
First identify which agent I use and check its ACP support and sign-in commands.
Work in these repositories, reading their instructions before changing code:
- github.com/banodoco/astrid-agent (local chat service and agent launching)
- github.com/banodoco/astrid-app (chat setup card and agent identity)

An integration lets Astrid start the agent and exchange ACP messages over stdio.
The agent must speak ACP directly or through an adapter; an interactive CLI alone is insufficient.
Claude Code and Codex use pinned adapters launched with bun x --bun.
Hermes speaks ACP directly via hermes acp.
Keep diagnostic output on stderr so stdout stays an ACP JSON-RPC stream.
Reuse the existing host for sessions, streamed replies, tools, permissions and cancellation.

Worked example: Hermes is a complete integration to copy. It speaks ACP natively (hermes acp)
and has a sign-in probe, setup steps, a skill harness, an icon and tests. Mirror every place it appears:
- in astrid-agent: git grep -n -i hermes -- astrid/chat astrid/skills ':!*.mjs'
- in astrid-app: git grep -n -i hermes -- src tests/e2e
If your agent needs an ACP adapter instead, mirror Codex (git grep -n -i codex-acp in astrid-agent).

Make the changes in this order:
1. In astrid-agent/astrid/chat/localAgents.ts, add a stable agent id to localAgentIdSchema
   and an entry to LOCAL_AGENT_TABLE with its name, install and sign-in commands.
   Supply the right commands for macOS/Linux and Windows in the table's existing format.
   Extend sessionAgentId so saved sessions retain the new agent's namespace.
2. In astrid-agent/astrid/chat/astrid-local-agents.ts, add CLI discovery and a sign-in probe.
   Follow the existing login-shell PATH and Windows executable handling.
   Report signed-in, signed-out or unknown honestly; probe failures must stay unknown.
   Return the existing state, line and structured setup steps for the new agent.
3. Add its launch path in localAgentLaunch in that same file.
   If it needs an adapter, pin it in astrid/chat/astrid-local-agent-adapters.ts.
   Follow the existing bun x --bun adapters or the native hermes acp launch.
   Read astrid/chat/astrid-local-agent-host.ts and astrid/chat/acpProcessHost.ts.
   Preserve session namespacing and Astrid context injection; adapt only where necessary.
   Keep not-installed, sign-in-required and missing-runtime errors actionable.
4. If the agent supports skills, add its harness under astrid/skills/harnesses/,
   register it in astrid/skills/harnesses/__init__.py, and wire its harness and terminal
   command into astrid/chat/astrid-local-agent-skills.ts. Honor its config-home override.
   Follow the existing best-effort sync and report skillSynced honestly.
   If it has no skill support, keep skillSynced false and retain host context injection.
5. In astrid-app/src/integrations/astrid/localAgents.ts, extend LOCAL_AGENT_TABLE;
   LOCAL_AGENT_IDS and localAgentIdSchema derive from it. In
   src/tools/video-editor/components/AgentChat/agentIdentity.tsx, add its icon;
   agentNames derives from the table. The setup card uses the service's setup data.

Keep older apps and older services working: new payload fields must be optional.
Keep the existing line/state fallback and tolerate unknown response fields.
Do not introduce required fields or change existing agent ids or session ids.

Test the integration rather than only testing the new table entry:
- Add fake CLI discovery/sign-in cases to astrid/chat/astrid-local-agents.test.ts:
  absent, signed in, signed out, unknown and timeout; cover OS-specific commands.
- Extend astrid/chat/astrid-local-agent-host.test.ts with a fake CLI and fake ACP
  adapter/native process, following its fixtures. Exercise initialization, a session,
  a streamed reply, permissions, cancellation and namespaced session ids.
- Test skill sync if a harness was added. Do not use real credentials in fixtures.
- In astrid-agent run bun test ./astrid/chat, then bun run build:chat
  and bun run check:chat-bundle. Include the rebuilt chat bundle.
- In astrid-app run npx vitest run src/tools/video-editor/components/AgentChat
  and npx tsc -p tsconfig.app.json --noEmit.
- Extend tests/e2e/fake-runtime/acp.ts and tests/e2e/agent-setup.spec.ts for the new agent.
  Run the setup card against the fake runtime with Playwright:
  npx playwright test tests/e2e/agent-setup.spec.ts --project=chromium-desktop.
  npm run dev:agent-setup also starts the fake setup environment for manual inspection.
- Finally run npm run dev:local against the real local runtime and chat service.
  Pick the new agent in the setup card, send "hi" and receive a reply.
  Ask it to make a timeline edit and confirm the edit appears in the app.
  Stop the processes you started and report any checks you could not complete.

Once it works end to end (the real run above passes), open a pull request on each repo you touched
(github.com/banodoco/astrid-agent and github.com/banodoco/astrid-app) so everyone can use it.
In each PR: what the agent is, how it signs in, the tests you ran with their results,
and a screenshot of the setup card and a reply in the chat.`;
