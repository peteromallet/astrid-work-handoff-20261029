import { debugConfig } from './debugConfig';

const CHANNEL_FLAGS = {
  cache: 'tasksPaneDebug',
  render: 'renderLogging',
} as const;

type DebugChannel = keyof typeof CHANNEL_FLAGS;
type DebugFlag = Parameters<typeof debugConfig.isEnabled>[0];

const overrides: Partial<Record<DebugChannel, boolean>> = {};

const isDev = Boolean(import.meta.env.DEV);

function channelFlag(channel: DebugChannel): DebugFlag {
  return CHANNEL_FLAGS[channel];
}

function isChannelEnabled(channel: DebugChannel): boolean {
  if (!isDev) {
    return false;
  }

  const override = overrides[channel];
  if (override !== undefined) {
    return override;
  }

  return debugConfig.isEnabled(channelFlag(channel));
}

function shouldLog(channel: DebugChannel, force: boolean): boolean {
  return force ? isDev : isChannelEnabled(channel);
}

function withTag(channel: DebugChannel, message: string): string {
  return `[${channel}] ${message}`;
}

export function enableDebugChannel(channel: DebugChannel): void {
  overrides[channel] = true;
}

export function disableDebugChannel(channel: DebugChannel): void {
  overrides[channel] = false;
}

export function resetDebugChannel(channel: DebugChannel): void {
  delete overrides[channel];
}

export function debugChannelEnabled(channel: DebugChannel): boolean {
  return isChannelEnabled(channel);
}

export function debugLog(
  channel: DebugChannel,
  message: string,
  data?: unknown,
  force: boolean = false,
): void {
  if (!shouldLog(channel, force)) {
    return;
  }

  if (data === undefined) {
    console.log(withTag(channel, message));
    return;
  }

  console.log(withTag(channel, message), data);
}

export function debugWarn(
  channel: DebugChannel,
  message: string,
  data?: unknown,
  force: boolean = false,
): void {
  if (!shouldLog(channel, force)) {
    return;
  }

  if (data === undefined) {
    console.warn(withTag(channel, message));
    return;
  }

  console.warn(withTag(channel, message), data);
}
