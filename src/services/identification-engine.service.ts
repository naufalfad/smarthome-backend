/**
 * Phase 4 — Rule-Based Identification Engine
 * Provides deterministic classification, suggestions, and validation for GLB scene nodes.
 */

export type IdentifiedNodeType = 'ROOM' | 'OBJECT' | 'ANCHOR';
export type IdentificationStatus = 'UNIDENTIFIED' | 'SUGGESTED' | 'IDENTIFIED' | 'NEEDS_REVIEW';

// ---------------------------------------------------------------------------
// 1. Category Definitions & Display Mappings
// ---------------------------------------------------------------------------

export const ROOM_CATEGORIES = [
  'LIVING_ROOM',
  'BEDROOM',
  'MASTER_BEDROOM',
  'KITCHEN',
  'DINING_ROOM',
  'BATHROOM',
  'MASTER_BATHROOM',
  'HOME_OFFICE',
  'GARAGE',
  'HALLWAY',
  'LAUNDRY_ROOM',
  'BALCONY',
  'STORAGE_ROOM',
  'OTHER',
  'UNKNOWN',
] as const;
export type RoomCategory = typeof ROOM_CATEGORIES[number];

export const OBJECT_CATEGORIES = [
  // Smart Devices
  'SMART_AC',
  'SMART_LIGHTING',
  'SMART_DOOR_LOCK',
  'SMART_SENSOR_TEMPERATURE',
  'SMART_SENSOR_AIR_QUALITY',
  'OTHER_SMART_DEVICE',
  // Furniture
  'SOFA',
  'TABLE',
  'CHAIR',
  'BED',
  'CABINET',
  'WARDROBE',
  'TV',
  'REFRIGERATOR',
  'OTHER_FURNITURE',
  // Building Components
  'DOOR',
  'WINDOW',
  'WALL',
  'FLOOR_SURFACE',
  'CEILING',
  'STAIRCASE',
  'OTHER_BUILDING_COMPONENT',
  // Other
  'DECORATION',
  'UNKNOWN',
] as const;
export type ObjectCategory = typeof OBJECT_CATEGORIES[number];

export const ANCHOR_CATEGORIES = [
  'TEMPERATURE_HUMIDITY',
  'AIR_QUALITY',
  'OTHER_SENSOR',
  'UNKNOWN',
] as const;
export type AnchorCategory = typeof ANCHOR_CATEGORIES[number];

export const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  // Rooms
  LIVING_ROOM: 'Living Room',
  BEDROOM: 'Bedroom',
  MASTER_BEDROOM: 'Master Bedroom',
  KITCHEN: 'Kitchen',
  DINING_ROOM: 'Dining Room',
  BATHROOM: 'Bathroom',
  MASTER_BATHROOM: 'Master Bathroom',
  HOME_OFFICE: 'Home Office',
  GARAGE: 'Garage',
  HALLWAY: 'Hallway',
  LAUNDRY_ROOM: 'Laundry Room',
  BALCONY: 'Balcony',
  STORAGE_ROOM: 'Storage Room',
  OTHER: 'Other Room',

  // Smart Devices
  SMART_AC: 'Smart Air Conditioner',
  SMART_LIGHTING: 'Smart Lighting',
  SMART_DOOR_LOCK: 'Smart Door Lock',
  SMART_SENSOR_TEMPERATURE: 'Smart Temperature Sensor',
  SMART_SENSOR_AIR_QUALITY: 'Smart Air Quality Sensor',
  OTHER_SMART_DEVICE: 'Other Smart Device',

  // Furniture
  SOFA: 'Sofa',
  TABLE: 'Table',
  CHAIR: 'Chair',
  BED: 'Bed',
  CABINET: 'Cabinet',
  WARDROBE: 'Wardrobe',
  TV: 'Television',
  REFRIGERATOR: 'Refrigerator',
  OTHER_FURNITURE: 'Other Furniture',

  // Building Components
  DOOR: 'Door',
  WINDOW: 'Window',
  WALL: 'Wall',
  FLOOR_SURFACE: 'Floor Surface',
  CEILING: 'Ceiling',
  STAIRCASE: 'Staircase',
  OTHER_BUILDING_COMPONENT: 'Other Building Component',

  // Anchors
  TEMPERATURE_HUMIDITY: 'Temperature & Humidity Sensor Anchor',
  AIR_QUALITY: 'Air Quality Sensor Anchor',
  OTHER_SENSOR: 'Other Sensor Anchor',

  // Common
  DECORATION: 'Decoration',
  UNKNOWN: 'Unknown',
};

// ---------------------------------------------------------------------------
// 2. Category Validation Per Node Type
// ---------------------------------------------------------------------------

export function isCategoryValidForNodeType(nodeType: IdentifiedNodeType, category: string): boolean {
  if (category === 'UNKNOWN') return true;
  switch (nodeType) {
    case 'ROOM':
      return ROOM_CATEGORIES.includes(category as RoomCategory);
    case 'OBJECT':
      return OBJECT_CATEGORIES.includes(category as ObjectCategory);
    case 'ANCHOR':
      return ANCHOR_CATEGORIES.includes(category as AnchorCategory);
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// 3. Rule-Based Suggestion Engine
// ---------------------------------------------------------------------------

export interface SuggestionResult {
  nodeType: IdentifiedNodeType;
  suggestedCategory: string;
  suggestedDisplayName: string;
  isRecognized: boolean;
}

/**
 * Clean up node name into natural readable words
 */
function humanizeNodeName(name: string, prefixToRemove: string): string {
  let cleaned = name;
  if (cleaned.toUpperCase().startsWith(prefixToRemove)) {
    cleaned = cleaned.substring(prefixToRemove.length);
  }
  // Replace underscores and hyphens with spaces
  cleaned = cleaned.replace(/[_-]+/g, ' ').trim();
  // Capitalize each word
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Generates rule-based category & display name suggestions from node name pattern
 */
export function generateSuggestion(nodeName: string): SuggestionResult {
  const upper = nodeName.toUpperCase();

  // 1. IoT Anchors (Prefix ANCHOR_)
  if (upper.startsWith('ANCHOR_') || upper.includes('_ANCHOR_') || upper.endsWith('_ANCHOR')) {
    const humanName = humanizeNodeName(nodeName, 'ANCHOR_');

    if (upper.includes('TEMP') || upper.includes('HUMID') || upper.includes('THERMO')) {
      return {
        nodeType: 'ANCHOR',
        suggestedCategory: 'TEMPERATURE_HUMIDITY',
        suggestedDisplayName: `${humanName} (Temp/Humidity)`,
        isRecognized: true,
      };
    }
    if (upper.includes('AIR') || upper.includes('CO2') || upper.includes('PM25') || upper.includes('GAS')) {
      return {
        nodeType: 'ANCHOR',
        suggestedCategory: 'AIR_QUALITY',
        suggestedDisplayName: `${humanName} (Air Quality)`,
        isRecognized: true,
      };
    }
    if (upper.includes('OTHER') || upper.includes('SENSOR') || upper.includes('BEACON') || upper.includes('TAG')) {
      return {
        nodeType: 'ANCHOR',
        suggestedCategory: 'OTHER_SENSOR',
        suggestedDisplayName: `${humanName} (Sensor)`,
        isRecognized: true,
      };
    }

    return {
      nodeType: 'ANCHOR',
      suggestedCategory: 'UNKNOWN',
      suggestedDisplayName: humanName || nodeName,
      isRecognized: false,
    };
  }

  // 2. Rooms (Prefix ROOM_)
  if (upper.startsWith('ROOM_') || upper.includes('_ROOM_')) {
    const humanName = humanizeNodeName(nodeName, 'ROOM_');

    if (upper.includes('MASTER_BED') || upper.includes('BEDROOM_MASTER') || upper.includes('MAIN_BED')) {
      return {
        nodeType: 'ROOM',
        suggestedCategory: 'MASTER_BEDROOM',
        suggestedDisplayName: humanName.includes('Master') ? humanName : `Master ${humanName}`,
        isRecognized: true,
      };
    }
    if (upper.includes('BEDROOM') || upper.includes('BED_ROOM') || upper.includes('BED')) {
      return {
        nodeType: 'ROOM',
        suggestedCategory: 'BEDROOM',
        suggestedDisplayName: humanName,
        isRecognized: true,
      };
    }
    if (upper.includes('MASTER_BATH') || upper.includes('BATHROOM_MASTER')) {
      return {
        nodeType: 'ROOM',
        suggestedCategory: 'MASTER_BATHROOM',
        suggestedDisplayName: humanName.includes('Master') ? humanName : `Master ${humanName}`,
        isRecognized: true,
      };
    }
    if (upper.includes('BATHROOM') || upper.includes('BATH') || upper.includes('TOILET') || upper.includes('WC')) {
      return {
        nodeType: 'ROOM',
        suggestedCategory: 'BATHROOM',
        suggestedDisplayName: humanName,
        isRecognized: true,
      };
    }
    if (upper.includes('LIVING')) {
      return {
        nodeType: 'ROOM',
        suggestedCategory: 'LIVING_ROOM',
        suggestedDisplayName: humanName.toLowerCase().includes('room') ? humanName : `${humanName} Room`,
        isRecognized: true,
      };
    }
    if (upper.includes('KITCHEN') || upper.includes('PANTRY')) {
      return {
        nodeType: 'ROOM',
        suggestedCategory: 'KITCHEN',
        suggestedDisplayName: humanName,
        isRecognized: true,
      };
    }
    if (upper.includes('DINING')) {
      return {
        nodeType: 'ROOM',
        suggestedCategory: 'DINING_ROOM',
        suggestedDisplayName: humanName.toLowerCase().includes('room') ? humanName : `${humanName} Room`,
        isRecognized: true,
      };
    }
    if (upper.includes('OFFICE') || upper.includes('STUDY') || upper.includes('WORK')) {
      return {
        nodeType: 'ROOM',
        suggestedCategory: 'HOME_OFFICE',
        suggestedDisplayName: humanName,
        isRecognized: true,
      };
    }
    if (upper.includes('GARAGE') || upper.includes('CARPORT')) {
      return {
        nodeType: 'ROOM',
        suggestedCategory: 'GARAGE',
        suggestedDisplayName: humanName,
        isRecognized: true,
      };
    }
    if (upper.includes('HALLWAY') || upper.includes('CORRIDOR') || upper.includes('HALL')) {
      return {
        nodeType: 'ROOM',
        suggestedCategory: 'HALLWAY',
        suggestedDisplayName: humanName,
        isRecognized: true,
      };
    }
    if (upper.includes('LAUNDRY')) {
      return {
        nodeType: 'ROOM',
        suggestedCategory: 'LAUNDRY_ROOM',
        suggestedDisplayName: humanName.toLowerCase().includes('room') ? humanName : `${humanName} Room`,
        isRecognized: true,
      };
    }
    if (upper.includes('BALCONY') || upper.includes('TERRACE') || upper.includes('PATIO')) {
      return {
        nodeType: 'ROOM',
        suggestedCategory: 'BALCONY',
        suggestedDisplayName: humanName,
        isRecognized: true,
      };
    }
    if (upper.includes('STORAGE') || upper.includes('STORE') || upper.includes('CLOSET')) {
      return {
        nodeType: 'ROOM',
        suggestedCategory: 'STORAGE_ROOM',
        suggestedDisplayName: humanName.toLowerCase().includes('room') ? humanName : `${humanName} Room`,
        isRecognized: true,
      };
    }

    return {
      nodeType: 'ROOM',
      suggestedCategory: 'OTHER',
      suggestedDisplayName: humanName || nodeName,
      isRecognized: false,
    };
  }

  // 3. Objects (Prefix OBJ_)
  const humanName = humanizeNodeName(nodeName, 'OBJ_');

  // Smart Devices
  if (upper.includes('OBJ_AC') || upper.includes('AIRCON') || upper.includes('HVAC')) {
    return {
      nodeType: 'OBJECT',
      suggestedCategory: 'SMART_AC',
      suggestedDisplayName: humanName.includes('Ac') ? humanName.replace(/\bAc\b/g, 'Air Conditioner') : `${humanName} AC`,
      isRecognized: true,
    };
  }
  if (upper.includes('OBJ_LIGHT') || upper.includes('LAMP') || upper.includes('LIGHTING') || upper.includes('CHANDELIER')) {
    return {
      nodeType: 'OBJECT',
      suggestedCategory: 'SMART_LIGHTING',
      suggestedDisplayName: humanName,
      isRecognized: true,
    };
  }
  if (upper.includes('OBJ_LOCK') || upper.includes('DOORLOCK') || upper.includes('SMARTLOCK')) {
    return {
      nodeType: 'OBJECT',
      suggestedCategory: 'SMART_DOOR_LOCK',
      suggestedDisplayName: humanName,
      isRecognized: true,
    };
  }
  if (upper.includes('SENSOR_TEMP') || upper.includes('TEMP_SENSOR')) {
    return {
      nodeType: 'OBJECT',
      suggestedCategory: 'SMART_SENSOR_TEMPERATURE',
      suggestedDisplayName: humanName,
      isRecognized: true,
    };
  }
  if (upper.includes('SENSOR_AIR') || upper.includes('AIR_SENSOR')) {
    return {
      nodeType: 'OBJECT',
      suggestedCategory: 'SMART_SENSOR_AIR_QUALITY',
      suggestedDisplayName: humanName,
      isRecognized: true,
    };
  }

  // Furniture
  if (upper.includes('SOFA') || upper.includes('COUCH')) {
    return {
      nodeType: 'OBJECT',
      suggestedCategory: 'SOFA',
      suggestedDisplayName: humanName,
      isRecognized: true,
    };
  }
  if (upper.includes('TABLE') || upper.includes('DESK')) {
    return {
      nodeType: 'OBJECT',
      suggestedCategory: 'TABLE',
      suggestedDisplayName: humanName,
      isRecognized: true,
    };
  }
  if (upper.includes('CHAIR') || upper.includes('STOOL') || upper.includes('ARMCHAIR')) {
    return {
      nodeType: 'OBJECT',
      suggestedCategory: 'CHAIR',
      suggestedDisplayName: humanName,
      isRecognized: true,
    };
  }
  if (upper.includes('BED') && !upper.includes('ROOM')) {
    return {
      nodeType: 'OBJECT',
      suggestedCategory: 'BED',
      suggestedDisplayName: humanName,
      isRecognized: true,
    };
  }
  if (upper.includes('CABINET') || upper.includes('DRAWER') || upper.includes('SHELF')) {
    return {
      nodeType: 'OBJECT',
      suggestedCategory: 'CABINET',
      suggestedDisplayName: humanName,
      isRecognized: true,
    };
  }
  if (upper.includes('WARDROBE') || upper.includes('CLOSET')) {
    return {
      nodeType: 'OBJECT',
      suggestedCategory: 'WARDROBE',
      suggestedDisplayName: humanName,
      isRecognized: true,
    };
  }
  if (upper.includes('TV') || upper.includes('TELEVISION') || upper.includes('SCREEN')) {
    return {
      nodeType: 'OBJECT',
      suggestedCategory: 'TV',
      suggestedDisplayName: humanName,
      isRecognized: true,
    };
  }
  if (upper.includes('REFRIGERATOR') || upper.includes('FRIDGE')) {
    return {
      nodeType: 'OBJECT',
      suggestedCategory: 'REFRIGERATOR',
      suggestedDisplayName: humanName,
      isRecognized: true,
    };
  }

  // Building Components
  if (upper.includes('DOOR') && !upper.includes('LOCK')) {
    return {
      nodeType: 'OBJECT',
      suggestedCategory: 'DOOR',
      suggestedDisplayName: humanName,
      isRecognized: true,
    };
  }
  if (upper.includes('WINDOW')) {
    return {
      nodeType: 'OBJECT',
      suggestedCategory: 'WINDOW',
      suggestedDisplayName: humanName,
      isRecognized: true,
    };
  }
  if (upper.includes('WALL')) {
    return {
      nodeType: 'OBJECT',
      suggestedCategory: 'WALL',
      suggestedDisplayName: humanName,
      isRecognized: true,
    };
  }
  if (upper.includes('FLOOR') && !upper.includes('ROOM')) {
    return {
      nodeType: 'OBJECT',
      suggestedCategory: 'FLOOR_SURFACE',
      suggestedDisplayName: humanName,
      isRecognized: true,
    };
  }
  if (upper.includes('CEILING') || upper.includes('ROOF')) {
    return {
      nodeType: 'OBJECT',
      suggestedCategory: 'CEILING',
      suggestedDisplayName: humanName,
      isRecognized: true,
    };
  }
  if (upper.includes('STAIR') || upper.includes('STAIRCASE')) {
    return {
      nodeType: 'OBJECT',
      suggestedCategory: 'STAIRCASE',
      suggestedDisplayName: humanName,
      isRecognized: true,
    };
  }

  // Fallback for objects
  return {
    nodeType: 'OBJECT',
    suggestedCategory: 'UNKNOWN',
    suggestedDisplayName: humanName || nodeName,
    isRecognized: false,
  };
}

/**
 * Creates deterministic stable node identifier: `${houseModelId}:${nodeName}`
 */
export function createStableNodeId(houseModelId: string, nodeName: string): string {
  return `${houseModelId}:${nodeName}`;
}

