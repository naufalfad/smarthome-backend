/**
 * Mathematical and stochastic helper generators for realistic IoT simulation
 */

export function roundTo(val: number, decimals: number = 1): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Simulates smooth random walk with optional central pull (mean-reverting Ornstein-Uhlenbeck style drift)
 */
export function brownianDrift(
  current: number,
  min: number,
  max: number,
  maxStep: number = 0.2,
  target?: number,
  pullStrength: number = 0.05
): number {
  // Random jitter between -maxStep and +maxStep
  const jitter = (Math.random() * 2 - 1) * maxStep;
  let next = current + jitter;

  // Gentle pull towards target if provided
  if (target !== undefined) {
    const diff = target - next;
    next += diff * pullStrength;
  }

  return clamp(roundTo(next, 2), min, max);
}

/**
 * Realistic convergence of room temperature towards target temperature (AC cooling / heating)
 */
export function calculateClimateConvergence(
  currentTemp: number,
  targetTemp: number,
  mode: 'COOL' | 'HEAT' | 'AUTO' | 'FAN' | 'DRY' | string,
  fanSpeedOrMultiplier: number | string = 1.0,
  ambientTemp: number = 29.0
): number {
  let fanSpeedMultiplier = 1.0;
  if (typeof fanSpeedOrMultiplier === 'string') {
    const s = fanSpeedOrMultiplier.toUpperCase();
    fanSpeedMultiplier = s === 'HIGH' ? 1.4 : s === 'LOW' ? 0.7 : 1.0;
  } else if (typeof fanSpeedOrMultiplier === 'number') {
    fanSpeedMultiplier = fanSpeedOrMultiplier;
  }

  if (mode === 'FAN') {
    // Fan mode: does not cool below ambient, gently drifts towards ambient
    return brownianDrift(currentTemp, 18, 35, 0.1, ambientTemp, 0.04);
  }

  let effectiveTarget = targetTemp;
  if (mode === 'AUTO') {
    effectiveTarget = targetTemp;
  } else if (mode === 'DRY') {
    // Dry mode cools mildly while dehumidifying
    effectiveTarget = Math.max(24, targetTemp);
  }

  const diff = effectiveTarget - currentTemp;

  // Thermostat deadband: within ±0.1°C, gently oscillate around target
  if (Math.abs(diff) <= 0.15) {
    return brownianDrift(currentTemp, effectiveTarget - 0.2, effectiveTarget + 0.2, 0.08, effectiveTarget, 0.15);
  }

  // Realistic temperature step per tick (0.15°C to 0.35°C scaled by fan speed)
  const baseStep = 0.22 * fanSpeedMultiplier;
  const step = Math.min(Math.abs(diff), baseStep);

  let nextTemp = currentTemp;
  if (diff < 0) {
    // Cooling
    nextTemp -= step;
  } else {
    // Heating
    nextTemp += step;
  }

  // Add realistic micro-flutter (±0.04°C)
  nextTemp += (Math.random() * 2 - 1) * 0.04;

  return roundTo(clamp(nextTemp, 16.0, 35.0), 1);
}

/**
 * Realistic Ambient Drift towards outdoor / ambient temperature when AC is OFF
 */
export function calculateAmbientDrift(
  currentTemp: number,
  ambientTemp: number = 29.0,
  insulationFactor: number = 0.03
): number {
  const diff = ambientTemp - currentTemp;
  if (Math.abs(diff) <= 0.2) {
    return brownianDrift(currentTemp, ambientTemp - 0.3, ambientTemp + 0.3, 0.06, ambientTemp, 0.08);
  }
  const step = Math.sign(diff) * Math.min(Math.abs(diff), 0.12 * (1 - insulationFactor));
  const next = currentTemp + step + (Math.random() * 2 - 1) * 0.03;
  return roundTo(clamp(next, 16.0, 36.0), 1);
}

/**
 * Correlated Air Quality Metrics Generation (AQI, PM2.5, PM10)
 */
export function generateAirQualityMetrics(currentAqi: number = 35): {
  aqi: number;
  pm25: number;
  pm10: number;
} {
  // Moderate baseline drift between 22 and 60 AQI
  const nextAqi = Math.round(brownianDrift(currentAqi, 18, 65, 1.5, 36, 0.04));

  // Physical correlation: PM2.5 is typically ~30-40% of AQI scale in clean-to-moderate indoor air
  const basePm25 = nextAqi * 0.34;
  const pm25 = Math.max(1, roundTo(basePm25 + (Math.random() * 2 - 1) * 0.8, 1));

  // PM10 is typically ~70-85% of AQI scale
  const basePm10 = nextAqi * 0.78;
  const pm10 = Math.max(2, roundTo(basePm10 + (Math.random() * 2 - 1) * 1.5, 1));

  return {
    aqi: nextAqi,
    pm25,
    pm10,
  };
}
