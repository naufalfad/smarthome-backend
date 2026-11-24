import {
  IDeviceProvider,
  ProviderType,
  ProviderStatus,
  ProviderHealthCheck,
} from './device-provider.types.js';
import { VirtualDeviceProvider } from './virtual/virtual-device.provider.js';

/**
 * PHASE 6: VIRTUAL DEVICE PROVIDER REGISTRY
 * Central registry managing all device providers and provider selection logic.
 */
export class DeviceProviderRegistry {
  private static instance: DeviceProviderRegistry;
  private providers: Map<string, IDeviceProvider> = new Map();
  private isInitialized = false;

  private constructor() {
    // Automatically register default Virtual Device Provider
    this.registerProvider(new VirtualDeviceProvider());
  }

  public static getInstance(): DeviceProviderRegistry {
    if (!DeviceProviderRegistry.instance) {
      DeviceProviderRegistry.instance = new DeviceProviderRegistry();
    }
    return DeviceProviderRegistry.instance;
  }

  /**
   * Registers a provider instance into the central registry
   */
  public registerProvider(provider: IDeviceProvider): void {
    const key = provider.providerType.toUpperCase();
    this.providers.set(key, provider);
    console.log(`🔌 [DeviceProviderRegistry] Registered provider: ${provider.name} (${key})`);
  }

  /**
   * Retrieves a specific provider by type with strict validation
   * Enforces NO SILENT FALLBACK to simulator!
   */
  public getProvider(providerType: string): IDeviceProvider {
    const normalized = (providerType || 'VIRTUAL').trim().toUpperCase();
    const provider = this.providers.get(normalized);

    if (!provider) {
      throw new Error(
        `[DeviceProviderRegistry] Provider '${providerType}' tidak tersedia atau belum terkonfigurasi pada sistem ini. Tidak ada fallback diam-diam ke simulator.`
      );
    }

    return provider;
  }

  /**
   * Resolves the appropriate provider for an IoT device instance
   */
  public getProviderForDevice(device: {
    id: string;
    providerType?: string | null;
  }): IDeviceProvider {
    const type = device.providerType || 'VIRTUAL';
    return this.getProvider(type);
  }

  /**
   * Retrieves list of all registered providers
   */
  public getAllProviders(): IDeviceProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Checks if a provider type is registered and active
   */
  public hasProvider(providerType: string): boolean {
    return this.providers.has(providerType.toUpperCase());
  }

  /**
   * Initializes all registered providers
   */
  public async initializeAll(): Promise<void> {
    if (this.isInitialized) return;

    for (const provider of this.providers.values()) {
      try {
        await provider.initialize();
      } catch (err: any) {
        console.error(
          `❌ [DeviceProviderRegistry] Failed to initialize provider '${provider.providerType}':`,
          err.message
        );
      }
    }
    this.isInitialized = true;
  }

  /**
   * Starts all registered providers
   */
  public async startAll(): Promise<void> {
    if (!this.isInitialized) {
      await this.initializeAll();
    }

    for (const provider of this.providers.values()) {
      try {
        await provider.start();
      } catch (err: any) {
        console.error(
          `❌ [DeviceProviderRegistry] Failed to start provider '${provider.providerType}':`,
          err.message
        );
      }
    }
  }

  /**
   * Stops all registered providers gracefully
   */
  public async stopAll(): Promise<void> {
    for (const provider of this.providers.values()) {
      try {
        await provider.stop();
      } catch (err: any) {
        console.error(
          `⚠️ [DeviceProviderRegistry] Error stopping provider '${provider.providerType}':`,
          err.message
        );
      }
    }
    this.isInitialized = false;
  }

  /**
   * Collects statuses across all registered providers
   */
  public getAllStatuses(): ProviderStatus[] {
    return Array.from(this.providers.values()).map((p) => p.getStatus());
  }

  /**
   * Runs health checks across all registered providers
   */
  public async getOverallHealth(): Promise<Record<string, ProviderHealthCheck>> {
    const healthMap: Record<string, ProviderHealthCheck> = {};
    for (const [key, provider] of this.providers.entries()) {
      try {
        healthMap[key] = await provider.healthCheck();
      } catch (err: any) {
        healthMap[key] = {
          providerType: key,
          isHealthy: false,
          message: `Health check execution error: ${err.message}`,
          timestamp: new Date(),
        };
      }
    }
    return healthMap;
  }
}

