/**
 * PHASE 6: VIRTUAL DEVICE INTEGRATION ARCHITECTURE & HARDWARE ABSTRACTION
 * Device Provider Layer Types & Contracts
 */

export type ProviderType = 'VIRTUAL' | 'ESP32' | 'MQTT' | 'HTTP' | string;

export type DeviceConnectionStatus = 'ONLINE' | 'OFFLINE' | 'UNKNOWN';

export type CommandStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';

export type StandardizedCommandType =
  | 'SET_POWER'
  | 'SET_BRIGHTNESS'
  | 'SET_TEMPERATURE'
  | 'SET_MODE'
  | 'SET_FAN_SPEED'
  | 'LOCK'
  | 'UNLOCK'
  | 'TOGGLE_POWER'
  | 'TOGGLE_LOCK'
  | 'SET_CONFIG'
  | 'CUSTOM';

export interface StandardizedDeviceCommand {
  id?: string;
  deviceId: string;
  commandType: StandardizedCommandType | string;
  payload: Record<string, any>;
  timestamp?: Date;
}

export interface DeviceCommandResult {
  commandId: string;
  deviceId: string;
  status: 'SUCCESS' | 'FAILED';
  appliedConfig: Record<string, any>;
  resultingStatus: string;
  errorMessage?: string;
  completedAt: Date;
}

export interface StandardizedTelemetryPoint {
  deviceId: string;
  providerType: string;
  metricType: string;
  value?: number | null;
  stringValue?: string | null;
  unit?: string | null;
  timestamp: Date;
  isSimulated: boolean;
  data?: Record<string, any>;
}

export interface DeviceProviderState {
  deviceId: string;
  providerType: string;
  connectionStatus: DeviceConnectionStatus;
  status: string;
  configuration: Record<string, any>;
  lastSeenAt: Date;
  isSimulated: boolean;
  metadata?: Record<string, any>;
}

export interface ProviderStatus {
  providerType: string;
  name: string;
  isInitialized: boolean;
  isRunning: boolean;
  isHardware: boolean;
  managedDevicesCount: number;
  activeErrors: number;
  lastError?: string | null;
  startedAt?: Date | null;
  metadata?: Record<string, any>;
}

export interface ProviderHealthCheck {
  providerType: string;
  isHealthy: boolean;
  message: string;
  timestamp: Date;
  details?: Record<string, any>;
}

/**
 * Standard Hardware-Agnostic Device Provider Interface
 * All device implementations (Virtual, future MQTT, future ESP32) must satisfy this contract.
 */
export interface IDeviceProvider {
  readonly providerType: string;
  readonly name: string;
  readonly isHardware: boolean;

  /**
   * Initializes internal resources, schemas, or network clients
   */
  initialize(): Promise<void>;

  /**
   * Starts provider background operations, subscriptions, or ticks
   */
  start(): Promise<void>;

  /**
   * Stops provider gracefully and cleans up running handles
   */
  stop(): Promise<void>;

  /**
   * Retrieves runtime state and telemetry for a device managed by this provider
   */
  getDeviceState(deviceId: string): Promise<DeviceProviderState>;

  /**
   * Executes a standardized command onto a target device
   */
  executeCommand(
    deviceId: string,
    command: StandardizedDeviceCommand
  ): Promise<DeviceCommandResult>;

  /**
   * Reports provider operational metrics and status
   */
  getStatus(): ProviderStatus;

  /**
   * Performs an instant health check
   */
  healthCheck(): Promise<ProviderHealthCheck>;
}

