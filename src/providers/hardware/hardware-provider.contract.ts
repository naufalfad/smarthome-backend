/**
 * PHASE 6: FUTURE HARDWARE PROVIDER CONTRACTS & ARCHITECTURAL ABSTRACTION
 * 
 * IMPORTANT ARCHITECTURAL BOUNDARY:
 * This file defines the formal contract, interfaces, and specifications for FUTURE
 * hardware providers (e.g. ESP32, MQTT, Zigbee, HTTP Webhooks).
 * 
 * STRICT PHASE 6 CONSTRAINT:
 * Physical hardware providers are NOT implemented or activated in Phase 6.
 * No hardware credentials, physical networking, or fake connections are created here.
 * This contract establishes the blueprint ensuring future hardware can be plugged in
 * without modifying the Device Management Layer or Frontend.
 */

import {
  IDeviceProvider,
  StandardizedDeviceCommand,
  DeviceCommandResult,
  DeviceProviderState,
  ProviderStatus,
  ProviderHealthCheck,
} from '../device-provider.types.js';

export interface HardwareConnectionConfig {
  host?: string;
  port?: number;
  protocol?: 'mqtt' | 'mqtts' | 'http' | 'https' | 'coap' | 'ws';
  clientId?: string;
  topicPrefix?: string;
  timeoutMs?: number;
  reconnectIntervalMs?: number;
}

export interface Esp32HardwareConfig extends HardwareConnectionConfig {
  macAddress?: string;
  firmwareVersion?: string;
  ipAddress?: string;
  gpioPins?: Record<string, number>;
}

export interface MqttHardwareConfig extends HardwareConnectionConfig {
  brokerUrl: string;
  baseTopic: string;
  qos?: 0 | 1 | 2;
  keepalive?: number;
}

/**
 * Contract that all future physical hardware providers must implement.
 */
export interface IHardwareProvider extends IDeviceProvider {
  readonly isHardware: true;

  /**
   * Hardware connection parameters
   */
  readonly connectionConfig: HardwareConnectionConfig;

  /**
   * Ping / heartbeat test to the physical gateway or broker
   */
  pingGateway(): Promise<{ latencyMs: number; isReachable: boolean }>;

  /**
   * Provision a newly discovered physical device into the smart home
   */
  provisionDevice?(
    deviceId: string,
    hardwareMetadata: Record<string, any>
  ): Promise<boolean>;
}

/**
 * ARCHITECTURAL SPECIFICATION: Future ESP32 Provider Blueprint
 * 
 * When implemented in future phases:
 * 1. The Esp32DeviceProvider will connect via MQTT broker or local HTTP REST server.
 * 2. On physical device boot, the ESP32 sends a broadcast discovery message to `homie/device-id` or `smarthome/devices/<mac>`.
 * 3. The provider maps incoming sensor payloads (e.g. DHT22 temperature/humidity) to `StandardizedTelemetryPoint`.
 * 4. The provider forwards telemetry to `DeviceManagementService.recordTelemetry()`.
 * 5. Device commands (e.g. `SET_POWER`) are serialized into JSON and published to `smarthome/devices/<mac>/command/set`.
 */
export abstract class BaseFutureHardwareProvider implements IHardwareProvider {
  abstract readonly providerType: string;
  abstract readonly name: string;
  readonly isHardware: true = true;
  abstract readonly connectionConfig: HardwareConnectionConfig;

  async initialize(): Promise<void> {
    throw new Error(
      `[HardwareAbstraction] Provider '${this.providerType}' is a physical hardware provider specification and is NOT active in Phase 6. All devices in Phase 6 run via VirtualDeviceProvider.`
    );
  }

  async start(): Promise<void> {
    throw new Error(
      `[HardwareAbstraction] Cannot start physical provider '${this.providerType}'. Physical hardware integration is reserved for future phases.`
    );
  }

  async stop(): Promise<void> {
    // No-op for dormant specification
  }

  async getDeviceState(deviceId: string): Promise<DeviceProviderState> {
    throw new Error(
      `[HardwareAbstraction] Device '${deviceId}' requires physical provider '${this.providerType}', which is not enabled. No silent fallback to simulator.`
    );
  }

  async executeCommand(
    deviceId: string,
    command: StandardizedDeviceCommand
  ): Promise<DeviceCommandResult> {
    throw new Error(
      `[HardwareAbstraction] Cannot execute command '${command.commandType}' on physical device '${deviceId}': Hardware provider '${this.providerType}' is not active.`
    );
  }

  getStatus(): ProviderStatus {
    return {
      providerType: this.providerType,
      name: this.name,
      isInitialized: false,
      isRunning: false,
      isHardware: true,
      managedDevicesCount: 0,
      activeErrors: 0,
      metadata: {
        note: 'Specification contract only. Physical connection not enabled in Phase 6.',
      },
    };
  }

  async healthCheck(): Promise<ProviderHealthCheck> {
    return {
      providerType: this.providerType,
      isHealthy: false,
      message: `Physical hardware provider '${this.providerType}' is not active in Phase 6.`,
      timestamp: new Date(),
    };
  }

  async pingGateway(): Promise<{ latencyMs: number; isReachable: boolean }> {
    return { latencyMs: -1, isReachable: false };
  }
}

