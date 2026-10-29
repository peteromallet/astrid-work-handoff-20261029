import { beforeEach, describe, expect, it } from 'vitest';
import { createExtensionSettingsService } from '@/sdk/extensionSettingsService';
import type { ExtensionManifest } from '@/sdk/manifest';
import { createFakeAppStateApi, installTestSettingsStore } from '@/test/settingsStoreHarness';
import { clearExtensionSettings } from './diagnosticCollectionSync';
import { createRuntimeSettingsBacking, extensionSettingsGroup } from './extensionSettingsBacking';

const manifest = { id: 'acme.tool', settingsDefaults: { theme: 'light' } } as unknown as ExtensionManifest;

beforeEach(() => localStorage.clear());

describe('extension settings in the Runtime', () => {
  it('names the group ext.<id> with the id made key-safe', () => {
    expect(extensionSettingsGroup('acme.tool')).toBe('ext.acme.tool');
    expect(extensionSettingsGroup('Acme Tool/Pro')).toBe('ext.acme-tool-pro');
    expect(extensionSettingsGroup('x'.repeat(100))).toHaveLength(64);
  });

  it('saves a setting to the Runtime record ext.<id> and reads it back through the service', async () => {
    const { store, fake } = installTestSettingsStore();
    const { service } = createExtensionSettingsService('acme.tool', manifest, { backing: createRuntimeSettingsBacking('acme.tool') });

    service.set('theme', 'dark');
    expect(service.get('theme')).toBe('dark');
    expect(service.keys()).toContain('theme');
    await store.flush();
    await store.flush();

    expect(fake.record('ext.acme.tool').content).toEqual({ theme: 'dark' });
  });

  it('imports the old astrid.ext.<id>.* browser keys once and removes them', async () => {
    localStorage.setItem('astrid.ext.acme.tool.theme', JSON.stringify('dark'));
    const { store, fake } = installTestSettingsStore();
    const { service } = createExtensionSettingsService('acme.tool', manifest, { backing: createRuntimeSettingsBacking('acme.tool') });

    expect(service.get('theme')).toBe('dark');
    await store.flush();
    await store.flush();

    expect(fake.record('ext.acme.tool').content).toEqual({ theme: 'dark' });
    expect(localStorage.getItem('astrid.ext.acme.tool.theme')).toBeNull();
  });

  it('delete removes the key from the Runtime record and does not come back from a legacy key', async () => {
    const fake = createFakeAppStateApi();
    fake.writeElsewhere('ext.acme.tool', { theme: 'dark', size: 3 });
    const { store } = installTestSettingsStore(fake);
    const { service } = createExtensionSettingsService('acme.tool', manifest, { backing: createRuntimeSettingsBacking('acme.tool') });
    await store.flush();

    service.delete('theme');
    await store.flush();
    await store.flush();

    expect(fake.record('ext.acme.tool').content).toEqual({ size: 3 });
    expect(service.get('theme')).toBe('light');
  });

  it('notifies subscribers when another tab changes the record', async () => {
    const fake = createFakeAppStateApi();
    const { store } = installTestSettingsStore(fake);
    const { service } = createExtensionSettingsService('acme.tool', manifest, { backing: createRuntimeSettingsBacking('acme.tool') });
    await store.flush();
    let calls = 0;
    service.subscribe(() => { calls += 1; });

    fake.writeElsewhere('ext.acme.tool', { theme: 'dark' });
    await store.refresh();

    expect(calls).toBe(1);
    expect(service.get('theme')).toBe('dark');
  });

  it('clearExtensionSettings (uninstall or reset) erases the record, and a service disposing does not', async () => {
    const fake = createFakeAppStateApi();
    fake.writeElsewhere('ext.acme.tool', { theme: 'dark' });
    const { store } = installTestSettingsStore(fake);
    const { service, dispose } = createExtensionSettingsService('acme.tool', manifest, { backing: createRuntimeSettingsBacking('acme.tool') });
    await store.flush();

    dispose();
    await store.flush();
    expect(fake.record('ext.acme.tool').content).toEqual({ theme: 'dark' });
    expect(service.get('theme')).toBe('dark');

    clearExtensionSettings('acme.tool');
    await store.flush();
    await store.flush();
    expect(fake.record('ext.acme.tool').content).toEqual({});
  });
});
