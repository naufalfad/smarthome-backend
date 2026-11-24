import { prisma } from './db.service.js';
import { AutomationEngine } from '../automation/automation.engine.js';
import { DeviceManagementService } from './device-management.service.js';
import { AppError } from '../middlewares/error.middleware.js';

export interface EnvironmentalMetric {
  value: number | null;
  unit: string;
  updatedAt: Date | null;
  status: 'NORMAL' | 'WARNING' | 'UNAVAILABLE';
  deviceName?: string | null;
  thresholdGuide?: string;
}

export interface HouseOverviewData {
  houseSummary: {
    id: string;
    name: string;
    address: string | null;
    propertyType: string;
    hasPhysicalIot: boolean;
    setupStatus: string;
    customerId: string | null;
    clientName: string | null;
    publishStatus: string;
    totalFloors: number;
    totalRooms: number;
    totalDevices: number;
    activeDevices: number;
    offlineDevices: number;
    automationStatus: {
      isRunning: boolean;
      activeRulesCount: number;
      totalRulesCount: number;
      lastTriggeredAt: Date | null;
    };
  };
  environmental: {
    temperature: EnvironmentalMetric;
    humidity: EnvironmentalMetric;
    aqi: EnvironmentalMetric;
    pm25: EnvironmentalMetric;
    pm10: EnvironmentalMetric;
  };
  deviceSummary: {
    lighting: { category: string; label: string; total: number; active: number; devices: any[] };
    climate: { category: string; label: string; total: number; active: number; devices: any[] };
    security: { category: string; label: string; total: number; active: number; devices: any[] };
    sensors: { category: string; label: string; total: number; active: number; devices: any[] };
  };
  quickStats: {
    totalDevices: number;
    activeDevices: number;
    warningSensorsCount: number;
    activeAutomationsCount: number;
  };
}

export interface DashboardActivityItem {
  id: string;
  type: 'MANUAL_COMMAND' | 'AUTOMATION_TRIGGER';
  title: string;
  description: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'PROCESSING' | 'SKIPPED' | 'PARTIAL_SUCCESS';
  timestamp: Date;
  source: 'USER_MANUAL' | 'AUTOMATION';
  deviceId?: string | null;
  deviceName?: string | null;
  roomName?: string | null;
  payload?: any;
  errorMessage?: string | null;
}

export class DashboardService {
  /**
   * Evaluates environmental metrics based on standard health thresholds
   */
  private static evaluateThreshold(
    metricType: string,
    value: number | null
  ): 'NORMAL' | 'WARNING' | 'UNAVAILABLE' {
    if (value === null || value === undefined || isNaN(value)) {
      return 'UNAVAILABLE';
    }

    switch (metricType) {
      case 'temperature':
        // Normal indoor comfort: 18°C - 28°C
        return value >= 18 && value <= 28 ? 'NORMAL' : 'WARNING';
      case 'humidity':
        // Normal relative indoor humidity: 35% - 70%
        return value >= 35 && value <= 70 ? 'NORMAL' : 'WARNING';
      case 'aqi':
        // Good/Moderate: <= 100, Warning/Unhealthy: > 100
        return value <= 100 ? 'NORMAL' : 'WARNING';
      case 'pm25':
        // Safe: <= 35 µg/m³, Warning: > 35 µg/m³
        return value <= 35 ? 'NORMAL' : 'WARNING';
      case 'pm10':
        // Safe: <= 50 µg/m³, Warning: > 50 µg/m³
        return value <= 50 ? 'NORMAL' : 'WARNING';
      default:
        return 'NORMAL';
    }
  }

  /**
   * Resolves and verifies that targetId exists.
   * PHASE 4: Unsafe global fallback `prisma.house.findFirst()` is permanently removed.
   * Requires an explicit targetId; throws AppError(400) if missing or AppError(404) if not found.
   */
  static async resolveHouseId(targetId?: string): Promise<string> {
    if (!targetId || typeof targetId !== 'string' || !targetId.trim()) {
      throw new AppError("Parameter 'houseId' wajib disertakan.", 400);
    }
    const cleanId = targetId.trim();
    const house = await prisma.house.findUnique({
      where: { id: cleanId },
      select: { id: true },
    });
    if (!house) {
      throw new AppError(`House dengan ID '${cleanId}' tidak ditemukan di sistem.`, 404);
    }
    return house.id;
  }

  /**
   * 1. GET /api/dashboard/overview
   * Comprehensive aggregation of house, environmental sensors, categorized devices, and automation engine.
   */
  static async getOverview(houseId?: string): Promise<HouseOverviewData> {
    const resolvedId = await this.resolveHouseId(houseId);

    const house = await prisma.house.findUnique({
      where: { id: resolvedId },
      include: {
        customer: {
          select: { id: true, fullName: true },
        },
        floors: {
          include: {
            rooms: { where: { isActive: true } },
          },
        },
        devices: {
          include: {
            catalogItem: true,
            room: true,
            floor: true,
            telemetry: {
              orderBy: { timestamp: 'desc' },
              take: 5,
            },
          },
        },
      },
    });

    if (!house) {
      throw new Error(`House with id '${resolvedId}' not found.`);
    }

    const floors = house.floors || [];
    const roomsCount = floors.reduce((acc, f) => acc + (f.rooms?.length || 0), 0);
    const devices = house.devices || [];

    // Classify devices as active/offline
    let activeDevices = 0;
    let offlineDevices = 0;

    devices.forEach((d) => {
      const cfg = (d.configuration as Record<string, any>) || {};
      const isPowerOn = d.status === 'ON' || d.status === 'ONLINE' || d.status === 'LOCKED' || cfg.power === true;
      const isOffline = d.status === 'OFFLINE' || d.connectionStatus === 'OFFLINE';

      if (isOffline) {
        offlineDevices++;
      } else if (isPowerOn) {
        activeDevices++;
      }
    });

    // Environmental Telemetry Aggregation
    // Fetch latest telemetry record for each metric in this house
    const sensorDeviceIds = devices
      .filter((d) => {
        const cat = d.catalogItem?.category || '';
        const type = d.type || '';
        return (
          cat === 'SENSORS' ||
          cat === 'CLIMATE' ||
          type.includes('SENSOR') ||
          type.includes('THERMOSTAT') ||
          type.includes('AIR')
        );
      })
      .map((d) => d.id);

    const getLatestMetric = async (metricType: string, defaultUnit: string, guide: string): Promise<EnvironmentalMetric> => {
      if (sensorDeviceIds.length === 0) {
        return {
          value: null,
          unit: defaultUnit,
          updatedAt: null,
          status: 'UNAVAILABLE',
          deviceName: null,
          thresholdGuide: guide,
        };
      }

      const telemetry = await prisma.deviceTelemetry.findFirst({
        where: {
          deviceId: { in: sensorDeviceIds },
          metricType,
        },
        orderBy: { timestamp: 'desc' },
        include: {
          device: { select: { name: true } },
        },
      });

      if (!telemetry || telemetry.value === null || telemetry.value === undefined) {
        return {
          value: null,
          unit: defaultUnit,
          updatedAt: null,
          status: 'UNAVAILABLE',
          deviceName: null,
          thresholdGuide: guide,
        };
      }

      return {
        value: Math.round(telemetry.value * 10) / 10,
        unit: telemetry.unit || defaultUnit,
        updatedAt: telemetry.timestamp,
        status: this.evaluateThreshold(metricType, telemetry.value),
        deviceName: telemetry.device?.name || null,
        thresholdGuide: guide,
      };
    };

    const [tempMetric, humMetric, aqiMetric, pm25Metric, pm10Metric] = await Promise.all([
      getLatestMetric('temperature', '°C', 'Standar kenyamanan: 18°C - 28°C'),
      getLatestMetric('humidity', '%', 'Standar kenyamanan: 35% - 70%'),
      getLatestMetric('aqi', 'AQI', 'Standar udara bersih: ≤ 100 AQI'),
      getLatestMetric('pm25', 'µg/m³', 'Standar partikel halus: ≤ 35 µg/m³'),
      getLatestMetric('pm10', 'µg/m³', 'Standar partikel debu: ≤ 50 µg/m³'),
    ]);

    // Count warning sensors
    const environmentalMetrics = [tempMetric, humMetric, aqiMetric, pm25Metric, pm10Metric];
    const warningSensorsCount = environmentalMetrics.filter((m) => m.status === 'WARNING').length;

    // Device Category Aggregations
    const lightingDevices: any[] = [];
    const climateDevices: any[] = [];
    const securityDevices: any[] = [];
    const sensorDevices: any[] = [];

    devices.forEach((d) => {
      const cat = (d.catalogItem?.category || '').toUpperCase();
      const type = (d.type || '').toUpperCase();

      if (cat === 'LIGHTING' || type.includes('LIGHT') || type.includes('DIMMER')) {
        lightingDevices.push(d);
      } else if (cat === 'CLIMATE' || type.includes('AC') || type.includes('THERMOSTAT')) {
        climateDevices.push(d);
      } else if (cat === 'SECURITY' || type.includes('LOCK') || type.includes('CAMERA')) {
        securityDevices.push(d);
      } else {
        sensorDevices.push(d);
      }
    });

    const isDeviceActive = (d: any) => {
      const cfg = (d.configuration as Record<string, any>) || {};
      return d.status === 'ON' || d.status === 'ONLINE' || d.status === 'LOCKED' || cfg.power === true;
    };

    const deviceSummary = {
      lighting: {
        category: 'LIGHTING',
        label: 'Lighting',
        total: lightingDevices.length,
        active: lightingDevices.filter(isDeviceActive).length,
        devices: lightingDevices,
      },
      climate: {
        category: 'CLIMATE',
        label: 'Climate Control',
        total: climateDevices.length,
        active: climateDevices.filter(isDeviceActive).length,
        devices: climateDevices,
      },
      security: {
        category: 'SECURITY',
        label: 'Security',
        total: securityDevices.length,
        active: securityDevices.filter(isDeviceActive).length,
        devices: securityDevices,
      },
      sensors: {
        category: 'SENSORS',
        label: 'Environmental Sensors',
        total: sensorDevices.length,
        active: sensorDevices.filter((d) => d.status !== 'OFFLINE' && d.connectionStatus !== 'OFFLINE').length,
        devices: sensorDevices,
      },
    };

    // Automation Engine Status
    const engine = AutomationEngine.getInstance();
    let engineStatus: any = { isRunning: true };
    try {
      engineStatus = await engine.getStatus();
    } catch {
      // Fallback if engine is idle
    }

    const totalRulesCount = await prisma.automationRule.count({
      where: { OR: [{ houseId: resolvedId }, { houseId: null }] },
    });
    const activeRulesCount = await prisma.automationRule.count({
      where: {
        enabled: true,
        OR: [{ houseId: resolvedId }, { houseId: null }],
      },
    });

    const latestExecution = await prisma.automationExecution.findFirst({
      where: {
        rule: {
          OR: [{ houseId: resolvedId }, { houseId: null }],
        },
      },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true },
    });

    return {
      houseSummary: {
        id: house.id,
        name: house.name,
        address: house.address ?? null,
        propertyType: house.propertyType || 'HOUSE',
        hasPhysicalIot: house.hasPhysicalIot ?? true,
        setupStatus: house.setupStatus || 'DRAFT',
        customerId: house.customerId ?? null,
        clientName: house.customer?.fullName || house.clientName,
        publishStatus: house.publishStatus || 'DRAFT',
        totalFloors: floors.length,
        totalRooms: roomsCount,
        totalDevices: devices.length,
        activeDevices,
        offlineDevices,
        automationStatus: {
          isRunning: engineStatus.isRunning ?? true,
          activeRulesCount,
          totalRulesCount,
          lastTriggeredAt: latestExecution?.startedAt || null,
        },
      },
      environmental: {
        temperature: tempMetric,
        humidity: humMetric,
        aqi: aqiMetric,
        pm25: pm25Metric,
        pm10: pm10Metric,
      },
      deviceSummary,
      quickStats: {
        totalDevices: devices.length,
        activeDevices,
        warningSensorsCount,
        activeAutomationsCount: activeRulesCount,
      },
    };
  }

  /**
   * 2. GET /api/dashboard/floors
   * Retrieves floor plans and metadata for the house.
   */
  static async getFloors(houseId?: string) {
    const resolvedId = await this.resolveHouseId(houseId);

    const floors = await prisma.floor.findMany({
      where: { houseId: resolvedId },
      orderBy: { levelNumber: 'asc' },
      include: {
        floorPlan: true,
        rooms: {
          where: { isActive: true },
          select: { id: true, name: true, type: true, color: true },
        },
        devices: {
          select: { id: true, name: true, type: true, status: true, roomId: true },
        },
      },
    });

    return floors.map((f) => ({
      id: f.id,
      name: f.name,
      levelNumber: f.levelNumber,
      floorPlan: f.floorPlan
        ? {
          id: f.floorPlan.id,
          name: f.floorPlan.name,
          imagePath: f.floorPlan.imagePath,
          imageWidth: f.floorPlan.imageWidth,
          imageHeight: f.floorPlan.imageHeight,
          viewBoxWidth: f.floorPlan.viewBoxWidth,
          viewBoxHeight: f.floorPlan.viewBoxHeight,
          backgroundOpacity: f.floorPlan.backgroundOpacity,
          isBackgroundVisible: f.floorPlan.isBackgroundVisible,
        }
        : null,
      roomCount: f.rooms.length,
      deviceCount: f.devices.length,
      rooms: f.rooms,
    }));
  }

  /**
   * 3. GET /api/dashboard/rooms
   * Room-based monitoring: details, assigned devices, and environmental sensor readings.
   */
  static async getRooms(houseId?: string, floorId?: string) {
    const resolvedId = await this.resolveHouseId(houseId);

    const whereClause: any = {
      isActive: true,
      floorRel: { houseId: resolvedId },
    };

    if (floorId) {
      whereClause.floorId = floorId;
    }

    const rooms = await prisma.room.findMany({
      where: whereClause,
      include: {
        floorRel: { select: { id: true, name: true, levelNumber: true } },
        devices: {
          include: {
            catalogItem: true,
            telemetry: {
              orderBy: { timestamp: 'desc' },
              take: 3,
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return rooms.map((r) => {
      const roomDevices = r.devices || [];

      // Extract temperature and humidity readings if present
      let currentTemp: number | null = null;
      let currentHum: number | null = null;

      roomDevices.forEach((dev) => {
        const cfg = (dev.configuration as Record<string, any>) || {};
        if (cfg.temperature !== undefined) currentTemp = cfg.temperature;
        if (cfg.humidity !== undefined) currentHum = cfg.humidity;

        dev.telemetry?.forEach((t) => {
          if (t.metricType === 'temperature' && t.value !== null && currentTemp === null) {
            currentTemp = t.value;
          }
          if (t.metricType === 'humidity' && t.value !== null && currentHum === null) {
            currentHum = t.value;
          }
        });
      });

      return {
        id: r.id,
        name: r.name,
        type: r.type,
        floor: r.floor,
        floorId: r.floorId,
        floorName: r.floorRel?.name || `Lantai ${r.floor}`,
        color: r.color || '#3B82F6',
        polygonCoordinates: r.polygonCoordinates,
        areaSquareMeters: r.areaSquareMeters,
        deviceCount: roomDevices.length,
        environmental: {
          temperature: currentTemp !== null ? Math.round(currentTemp * 10) / 10 : null,
          humidity: currentHum !== null ? Math.round(currentHum * 10) / 10 : null,
        },
        devices: roomDevices.map((d) => ({
          id: d.id,
          name: d.name,
          type: d.type,
          status: d.status,
          category: d.catalogItem?.category || 'OTHER',
          configuration: d.configuration,
          normalizedX: d.normalizedX,
          normalizedY: d.normalizedY,
        })),
      };
    });
  }

  /**
   * 4. GET /api/dashboard/devices
   * Retrieves devices with optional filtering by floor, room, or category.
   */
  static async getDevices(
    houseId?: string,
    floorId?: string,
    roomId?: string,
    category?: string
  ) {
    const resolvedId = await this.resolveHouseId(houseId);

    const where: any = { houseId: resolvedId };
    if (floorId) where.floorId = floorId;
    if (roomId) where.roomId = roomId;

    const devices = await prisma.device.findMany({
      where,
      include: {
        catalogItem: true,
        room: true,
        floor: true,
        telemetry: {
          orderBy: { timestamp: 'desc' },
          take: 5,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (category && category !== 'ALL') {
      return devices.filter((d) => {
        const cat = d.catalogItem?.category?.toUpperCase();
        return cat === category.toUpperCase();
      });
    }

    return devices;
  }

  /**
   * 5. GET /api/dashboard/activities
   * Combined chronological activity stream of device commands and automation triggers.
   */
  static async getActivities(houseId?: string, limit: number = 30): Promise<DashboardActivityItem[]> {
    const resolvedId = await this.resolveHouseId(houseId);

    // 1. Fetch recent Device Commands for this house
    const commands = await prisma.deviceCommand.findMany({
      where: {
        device: { houseId: resolvedId },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        device: {
          select: {
            id: true,
            name: true,
            room: { select: { name: true } },
            manualRoomName: true,
          },
        },
      },
    });

    // 2. Fetch recent Automation Executions
    const automations = await prisma.automationExecution.findMany({
      where: {
        rule: {
          OR: [{ houseId: resolvedId }, { houseId: null }],
        },
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: {
        rule: { select: { id: true, name: true, triggerType: true } },
      },
    });

    // 3. Format and unify activities
    const activities: DashboardActivityItem[] = [];

    commands.forEach((cmd) => {
      const payload = (cmd.payload as Record<string, any>) || {};
      const deviceName = cmd.device?.name || 'Perangkat IoT';
      const roomName = cmd.device?.room?.name || cmd.device?.manualRoomName || 'Ruangan';

      let title = `${deviceName}: Perintah ${cmd.commandType}`;
      let description = `Status: ${cmd.status}`;

      if (cmd.commandType === 'SET_POWER') {
        const pwr = payload.power ?? payload.status;
        title = `${deviceName} ${pwr === true || pwr === 'ON' ? 'dinyalakan' : 'dimatikan'}`;
        description = `Kontrol daya di ${roomName}`;
      } else if (cmd.commandType === 'LOCK' || cmd.commandType === 'UNLOCK') {
        title = `${deviceName} ${cmd.commandType === 'LOCK' ? 'dikunci' : 'dibuka kuncinya'}`;
        description = `Perubahan keamanan di ${roomName}`;
      } else if (cmd.commandType === 'SET_TEMPERATURE') {
        title = `${deviceName} diatur ke ${payload.temperature ?? payload.targetTemperature}°C`;
        description = `Pengaturan suhu ruangan di ${roomName}`;
      } else if (cmd.commandType === 'SET_BRIGHTNESS') {
        title = `Kecerahan ${deviceName} diatur ke ${payload.brightness}%`;
        description = `Penyesuaian pencahayaan di ${roomName}`;
      }

      activities.push({
        id: `cmd-${cmd.id}`,
        type: 'MANUAL_COMMAND',
        title,
        description,
        status: cmd.status as any,
        timestamp: cmd.createdAt,
        source: 'USER_MANUAL',
        deviceId: cmd.deviceId,
        deviceName,
        roomName,
        payload: cmd.payload,
        errorMessage: cmd.errorMessage,
      });
    });

    automations.forEach((exec) => {
      const ruleName = exec.rule?.name || 'Aturan Otomasi';
      const results = Array.isArray(exec.executionResult) ? exec.executionResult : [];
      const actionCount = results.length;

      activities.push({
        id: `auto-${exec.id}`,
        type: 'AUTOMATION_TRIGGER',
        title: `Otomasi '${ruleName}' dijalankan`,
        description:
          actionCount > 0
            ? `${actionCount} tindakan perangkat berhasil dieksekusi secara otomatis`
            : `Evaluasi kondisi terpenuhi (${exec.status})`,
        status: exec.status as any,
        timestamp: exec.startedAt,
        source: 'AUTOMATION',
        payload: exec.triggerData,
        errorMessage: exec.errorMessage,
      });
    });

    // 4. Sort descending by timestamp and trim to limit
    activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return activities.slice(0, limit);
  }

  /**
   * 6. GET /api/dashboard/automation-summary
   * Active automation rules and recent execution history.
   */
  static async getAutomationSummary(houseId?: string) {
    const resolvedId = await this.resolveHouseId(houseId);

    const rules = await prisma.automationRule.findMany({
      where: {
        OR: [{ houseId: resolvedId }, { houseId: null }],
      },
      orderBy: [{ enabled: 'desc' }, { priority: 'desc' }],
    });

    const recentExecutions = await prisma.automationExecution.findMany({
      where: {
        rule: {
          OR: [{ houseId: resolvedId }, { houseId: null }],
        },
      },
      orderBy: { startedAt: 'desc' },
      take: 15,
      include: {
        rule: { select: { id: true, name: true } },
      },
    });

    const activeCount = rules.filter((r) => r.enabled).length;
    const inactiveCount = rules.filter((r) => !r.enabled).length;

    // Resolve target devices for each rule
    const deviceIds = new Set<string>();
    rules.forEach((r) => {
      const actions = (r.actions as any[]) || [];
      actions.forEach((a) => {
        if (a.deviceId) deviceIds.add(a.deviceId);
      });
    });

    const targetDevices = await prisma.device.findMany({
      where: { id: { in: Array.from(deviceIds) } },
      select: { id: true, name: true, type: true },
    });

    const deviceMap = new Map(targetDevices.map((d) => [d.id, d]));

    const formattedRules = rules.map((r) => {
      const actions = (r.actions as any[]) || [];
      const conditions = (r.conditions as any[]) || [];

      const targetList = actions
        .map((a) => deviceMap.get(a.deviceId)?.name || 'Perangkat')
        .filter((v, i, self) => self.indexOf(v) === i);

      return {
        id: r.id,
        name: r.name,
        description: r.description,
        enabled: r.enabled,
        priority: r.priority,
        triggerType: r.triggerType,
        conditionCount: conditions.length,
        actionCount: actions.length,
        targetDevices: targetList,
        lastTriggeredAt: r.lastTriggeredAt,
        lastExecutionStatus: r.lastExecutionStatus,
        executionCount: r.executionCount,
      };
    });

    return {
      activeCount,
      inactiveCount,
      totalCount: rules.length,
      rules: formattedRules,
      recentExecutions,
    };
  }

  /**
   * 7. POST /api/dashboard/devices/:deviceId/control
   * Device control center via Phase 6 standardized command pipeline.
   */
  static async controlDevice(deviceId: string, commandType: string, payload?: any) {
    return DeviceManagementService.executeCommand(deviceId, {
      commandType,
      payload,
    });
  }
}

