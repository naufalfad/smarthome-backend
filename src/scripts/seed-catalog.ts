import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

export interface CatalogItemDefinition {
  id: string;
  name: string;
  category: 'LIVING_ROOM' | 'BEDROOM' | 'KITCHEN' | 'BATHROOM' | 'GENERAL';
  slug: string;
  defaultWidth: number;
  defaultHeight: number;
  description: string;
  svgContent: string;
}

export const CATALOG_ITEMS: CatalogItemDefinition[] = [
  // ==================== LIVING ROOM ====================
  {
    id: 'catalog-living-sofa',
    name: '3-Seater Sofa',
    category: 'LIVING_ROOM',
    slug: 'sofa-3-seater',
    defaultWidth: 160,
    defaultHeight: 80,
    description: 'Modern 3-seater living room sofa with cushioned backrest and padded armrests',
    svgContent: `<svg viewBox="0 0 160 80" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="156" height="76" rx="10" fill="#E2E8F0" stroke="#64748B" stroke-width="2.5"/>
  <!-- Backrest -->
  <rect x="6" y="6" width="148" height="20" rx="6" fill="#CBD5E1" stroke="#64748B" stroke-width="2"/>
  <!-- Left Armrest -->
  <rect x="6" y="26" width="18" height="48" rx="5" fill="#CBD5E1" stroke="#64748B" stroke-width="2"/>
  <!-- Right Armrest -->
  <rect x="136" y="26" width="18" height="48" rx="5" fill="#CBD5E1" stroke="#64748B" stroke-width="2"/>
  <!-- 3 Seat Cushions -->
  <rect x="27" y="28" width="33" height="44" rx="4" fill="#F1F5F9" stroke="#94A3B8" stroke-width="1.5"/>
  <rect x="63" y="28" width="34" height="44" rx="4" fill="#F1F5F9" stroke="#94A3B8" stroke-width="1.5"/>
  <rect x="100" y="28" width="33" height="44" rx="4" fill="#F1F5F9" stroke="#94A3B8" stroke-width="1.5"/>
</svg>`,
  },
  {
    id: 'catalog-living-coffee-table',
    name: 'Coffee Table',
    category: 'LIVING_ROOM',
    slug: 'coffee-table',
    defaultWidth: 90,
    defaultHeight: 50,
    description: 'Rectangular low coffee table with rounded corners and center decorative surface',
    svgContent: `<svg viewBox="0 0 90 50" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="3" width="84" height="44" rx="8" fill="#F8FAFC" stroke="#64748B" stroke-width="2.5"/>
  <rect x="10" y="10" width="70" height="30" rx="4" fill="#E2E8F0" stroke="#94A3B8" stroke-width="1.5" stroke-dasharray="3 2"/>
  <rect x="25" y="16" width="22" height="18" rx="2" fill="#CBD5E1" stroke="#94A3B8" stroke-width="1"/>
  <rect x="52" y="19" width="16" height="12" rx="2" fill="#E0E7FF" stroke="#818CF8" stroke-width="1"/>
</svg>`,
  },
  {
    id: 'catalog-living-tv',
    name: 'Ultra-thin TV Screen',
    category: 'LIVING_ROOM',
    slug: 'widescreen-tv',
    defaultWidth: 120,
    defaultHeight: 22,
    description: 'Wall-mounted or stand widescreen OLED television display',
    svgContent: `<svg viewBox="0 0 120 22" xmlns="http://www.w3.org/2000/svg">
  <!-- Screen panel -->
  <rect x="2" y="3" width="116" height="8" rx="2" fill="#1E293B" stroke="#0F172A" stroke-width="1.5"/>
  <!-- Bezel highlight -->
  <line x1="8" y1="7" x2="112" y2="7" stroke="#475569" stroke-width="1"/>
  <!-- Base stand -->
  <rect x="42" y="11" width="36" height="8" rx="2" fill="#94A3B8" stroke="#64748B" stroke-width="1.5"/>
  <!-- Power indicator dot -->
  <circle cx="60" cy="11" r="1.5" fill="#3B82F6"/>
</svg>`,
  },
  {
    id: 'catalog-living-tv-cabinet',
    name: 'TV Media Cabinet',
    category: 'LIVING_ROOM',
    slug: 'tv-media-cabinet',
    defaultWidth: 140,
    defaultHeight: 45,
    description: 'Long low-profile media credenza console with storage compartments',
    svgContent: `<svg viewBox="0 0 140 45" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="136" height="41" rx="4" fill="#F1F5F9" stroke="#64748B" stroke-width="2"/>
  <line x1="47" y1="2" x2="47" y2="43" stroke="#94A3B8" stroke-width="1.5"/>
  <line x1="93" y1="2" x2="93" y2="43" stroke="#94A3B8" stroke-width="1.5"/>
  <!-- Center open shelf for receiver/console -->
  <rect x="52" y="8" width="36" height="27" rx="2" fill="#E2E8F0" stroke="#CBD5E1" stroke-width="1"/>
  <!-- Knobs -->
  <circle cx="24" cy="22" r="2.5" fill="#64748B"/>
  <circle cx="116" cy="22" r="2.5" fill="#64748B"/>
</svg>`,
  },
  {
    id: 'catalog-living-armchair',
    name: 'Living Armchair',
    category: 'LIVING_ROOM',
    slug: 'living-armchair',
    defaultWidth: 75,
    defaultHeight: 75,
    description: 'Comfortable single lounge armchair with rounded back and wide armrests',
    svgContent: `<svg viewBox="0 0 75 75" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="3" width="69" height="69" rx="12" fill="#E2E8F0" stroke="#64748B" stroke-width="2"/>
  <!-- Curved backrest -->
  <path d="M 10 18 Q 37.5 8 65 18 L 65 26 Q 37.5 16 10 26 Z" fill="#CBD5E1" stroke="#64748B" stroke-width="1.5"/>
  <!-- Armrests -->
  <rect x="6" y="26" width="12" height="42" rx="4" fill="#CBD5E1" stroke="#64748B" stroke-width="1.5"/>
  <rect x="57" y="26" width="12" height="42" rx="4" fill="#CBD5E1" stroke="#64748B" stroke-width="1.5"/>
  <!-- Cushion -->
  <rect x="20" y="27" width="35" height="40" rx="6" fill="#F8FAFC" stroke="#94A3B8" stroke-width="1.5"/>
</svg>`,
  },
  {
    id: 'catalog-living-bookshelf',
    name: 'Bookshelf Unit',
    category: 'LIVING_ROOM',
    slug: 'bookshelf-unit',
    defaultWidth: 100,
    defaultHeight: 35,
    description: 'Freestanding wooden bookshelf with vertical book partitions visible from above',
    svgContent: `<svg viewBox="0 0 100 35" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="96" height="31" rx="3" fill="#F8FAFC" stroke="#64748B" stroke-width="2"/>
  <!-- Vertical dividers -->
  <line x1="26" y1="2" x2="26" y2="33" stroke="#94A3B8" stroke-width="1.5"/>
  <line x1="50" y1="2" x2="50" y2="33" stroke="#94A3B8" stroke-width="1.5"/>
  <line x1="74" y1="2" x2="74" y2="33" stroke="#94A3B8" stroke-width="1.5"/>
  <!-- Books indication lines -->
  <rect x="5" y="6" width="4" height="21" fill="#60A5FA"/>
  <rect x="11" y="6" width="5" height="21" fill="#F87171"/>
  <rect x="18" y="6" width="4" height="21" fill="#FBBF24"/>
  <rect x="30" y="6" width="6" height="21" fill="#34D399"/>
  <rect x="38" y="6" width="5" height="21" fill="#A78BFA"/>
  <rect x="54" y="6" width="7" height="21" fill="#94A3B8"/>
  <rect x="63" y="6" width="5" height="21" fill="#F472B6"/>
  <rect x="78" y="6" width="6" height="21" fill="#38BDF8"/>
  <rect x="86" y="6" width="5" height="21" fill="#FBBF24"/>
</svg>`,
  },

  // ==================== BEDROOM ====================
  {
    id: 'catalog-bed-single',
    name: 'Single Bed',
    category: 'BEDROOM',
    slug: 'single-bed',
    defaultWidth: 90,
    defaultHeight: 150,
    description: 'Standard single bed with headboard, pillow, and folded comforter',
    svgContent: `<svg viewBox="0 0 90 150" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="3" width="84" height="144" rx="6" fill="#F8FAFC" stroke="#64748B" stroke-width="2.5"/>
  <!-- Headboard -->
  <rect x="3" y="3" width="84" height="14" rx="3" fill="#94A3B8" stroke="#64748B" stroke-width="2"/>
  <!-- Pillow -->
  <rect x="20" y="24" width="50" height="26" rx="6" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.5"/>
  <path d="M 32 37 Q 45 42 58 37" stroke="#CBD5E1" stroke-width="1.5" fill="none"/>
  <!-- Blanket Fold -->
  <rect x="6" y="62" width="78" height="80" rx="4" fill="#E2E8F0" stroke="#94A3B8" stroke-width="1.5"/>
  <line x1="6" y1="62" x2="84" y2="62" stroke="#64748B" stroke-width="2"/>
</svg>`,
  },
  {
    id: 'catalog-bed-double',
    name: 'Double Queen Bed',
    category: 'BEDROOM',
    slug: 'double-bed',
    defaultWidth: 150,
    defaultHeight: 160,
    description: 'Queen size double bed with twin pillows, headboard, and layered duvet',
    svgContent: `<svg viewBox="0 0 150 160" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="3" width="144" height="154" rx="8" fill="#F8FAFC" stroke="#64748B" stroke-width="2.5"/>
  <!-- Headboard -->
  <rect x="3" y="3" width="144" height="16" rx="4" fill="#94A3B8" stroke="#64748B" stroke-width="2"/>
  <!-- Left & Right Pillows -->
  <rect x="16" y="26" width="52" height="30" rx="6" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.5"/>
  <rect x="82" y="26" width="52" height="30" rx="6" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.5"/>
  <path d="M 30 41 Q 42 46 54 41" stroke="#CBD5E1" stroke-width="1.5" fill="none"/>
  <path d="M 96 41 Q 108 46 120 41" stroke="#CBD5E1" stroke-width="1.5" fill="none"/>
  <!-- Duvet -->
  <rect x="8" y="70" width="134" height="82" rx="6" fill="#E2E8F0" stroke="#94A3B8" stroke-width="2"/>
  <line x1="8" y1="70" x2="142" y2="70" stroke="#64748B" stroke-width="2"/>
  <!-- Duvet fold pattern -->
  <path d="M 20 110 Q 75 125 130 110" stroke="#CBD5E1" stroke-width="1.5" fill="none"/>
</svg>`,
  },
  {
    id: 'catalog-bed-wardrobe',
    name: 'Clothes Wardrobe',
    category: 'BEDROOM',
    slug: 'clothes-wardrobe',
    defaultWidth: 130,
    defaultHeight: 60,
    description: 'Spacious clothes wardrobe closet with sliding doors and interior hanger section',
    svgContent: `<svg viewBox="0 0 130 60" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="126" height="56" rx="4" fill="#F1F5F9" stroke="#64748B" stroke-width="2.5"/>
  <!-- Hanging rail with hangers -->
  <line x1="8" y1="20" x2="122" y2="20" stroke="#94A3B8" stroke-width="2"/>
  <path d="M 22 14 L 30 20 L 22 26" stroke="#CBD5E1" stroke-width="1.5" fill="none"/>
  <path d="M 46 14 L 54 20 L 46 26" stroke="#CBD5E1" stroke-width="1.5" fill="none"/>
  <path d="M 70 14 L 78 20 L 70 26" stroke="#CBD5E1" stroke-width="1.5" fill="none"/>
  <path d="M 94 14 L 102 20 L 94 26" stroke="#CBD5E1" stroke-width="1.5" fill="none"/>
  <!-- Sliding door tracks -->
  <line x1="2" y1="44" x2="68" y2="44" stroke="#64748B" stroke-width="2"/>
  <line x1="62" y1="50" x2="128" y2="50" stroke="#64748B" stroke-width="2"/>
</svg>`,
  },
  {
    id: 'catalog-bed-nightstand',
    name: 'Bedside Table',
    category: 'BEDROOM',
    slug: 'bedside-nightstand',
    defaultWidth: 45,
    defaultHeight: 45,
    description: 'Compact bedside nightstand with lamp circle and top surface',
    svgContent: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="41" height="41" rx="4" fill="#F8FAFC" stroke="#64748B" stroke-width="2"/>
  <!-- Table lamp base & shade -->
  <circle cx="22.5" cy="22.5" r="12" fill="#FEF08A" stroke="#EAB308" stroke-width="1.5"/>
  <circle cx="22.5" cy="22.5" r="4" fill="#CA8A04"/>
  <!-- Edge detail -->
  <line x1="5" y1="36" x2="40" y2="36" stroke="#CBD5E1" stroke-width="1"/>
</svg>`,
  },
  {
    id: 'catalog-bed-dressing-table',
    name: 'Dressing Table & Mirror',
    category: 'BEDROOM',
    slug: 'dressing-table',
    defaultWidth: 90,
    defaultHeight: 45,
    description: 'Vanity dressing table with mirror bracket and matching stool',
    svgContent: `<svg viewBox="0 0 90 45" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="86" height="41" rx="4" fill="#F1F5F9" stroke="#64748B" stroke-width="2"/>
  <!-- Mirror bar against wall -->
  <rect x="8" y="4" width="74" height="6" rx="2" fill="#93C5FD" stroke="#3B82F6" stroke-width="1.5"/>
  <!-- Perfume/cosmetics bottles -->
  <circle cx="20" cy="22" r="3.5" fill="#F472B6"/>
  <rect x="30" y="18" width="8" height="8" rx="2" fill="#C084FC"/>
  <!-- Stool -->
  <rect x="34" y="32" width="22" height="10" rx="3" fill="#E2E8F0" stroke="#64748B" stroke-width="1.5"/>
</svg>`,
  },

  // ==================== KITCHEN ====================
  {
    id: 'catalog-kitchen-refrigerator',
    name: 'Double-door Refrigerator',
    category: 'KITCHEN',
    slug: 'refrigerator-double-door',
    defaultWidth: 70,
    defaultHeight: 70,
    description: 'French door modern refrigerator with stainless steel handles and hinge pins',
    svgContent: `<svg viewBox="0 0 70 70" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="66" height="66" rx="5" fill="#E2E8F0" stroke="#64748B" stroke-width="2.5"/>
  <!-- Interior cooling shelf line -->
  <line x1="35" y1="4" x2="35" y2="66" stroke="#94A3B8" stroke-width="1.5"/>
  <!-- Door split line and handle bevels -->
  <rect x="30" y="58" width="4" height="9" rx="1.5" fill="#475569"/>
  <rect x="36" y="58" width="4" height="9" rx="1.5" fill="#475569"/>
  <!-- Top vents -->
  <line x1="8" y1="8" x2="62" y2="8" stroke="#CBD5E1" stroke-width="1"/>
  <line x1="8" y1="12" x2="62" y2="12" stroke="#CBD5E1" stroke-width="1"/>
</svg>`,
  },
  {
    id: 'catalog-kitchen-cabinet',
    name: 'Kitchen Counter Cabinet',
    category: 'KITCHEN',
    slug: 'kitchen-counter-cabinet',
    defaultWidth: 80,
    defaultHeight: 60,
    description: 'Modular kitchen base cabinet with countertop surface and front overhang edge',
    svgContent: `<svg viewBox="0 0 80 60" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="76" height="56" rx="3" fill="#F8FAFC" stroke="#64748B" stroke-width="2"/>
  <!-- Countertop edge line -->
  <line x1="2" y1="50" x2="78" y2="50" stroke="#94A3B8" stroke-width="1.5"/>
  <!-- Drawer handle -->
  <rect x="26" y="53" width="28" height="3" rx="1" fill="#64748B"/>
  <!-- Cutting board accent -->
  <rect x="12" y="10" width="30" height="24" rx="3" fill="#FED7AA" stroke="#F97316" stroke-width="1"/>
</svg>`,
  },
  {
    id: 'catalog-kitchen-dining-table',
    name: 'Dining Table',
    category: 'KITCHEN',
    slug: 'dining-table-6p',
    defaultWidth: 140,
    defaultHeight: 80,
    description: 'Rectangular solid wood dining table for 6 persons with table placemats',
    svgContent: `<svg viewBox="0 0 140 80" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="3" width="134" height="74" rx="6" fill="#FDFBF7" stroke="#78350F" stroke-width="2.5"/>
  <!-- Center runner -->
  <rect x="14" y="24" width="112" height="32" rx="3" fill="#FEF3C7" stroke="#D97706" stroke-width="1"/>
  <!-- 6 Placemats -->
  <rect x="18" y="7" width="28" height="14" rx="2" fill="#E2E8F0" stroke="#CBD5E1" stroke-width="1"/>
  <rect x="56" y="7" width="28" height="14" rx="2" fill="#E2E8F0" stroke="#CBD5E1" stroke-width="1"/>
  <rect x="94" y="7" width="28" height="14" rx="2" fill="#E2E8F0" stroke="#CBD5E1" stroke-width="1"/>
  <rect x="18" y="59" width="28" height="14" rx="2" fill="#E2E8F0" stroke="#CBD5E1" stroke-width="1"/>
  <rect x="56" y="59" width="28" height="14" rx="2" fill="#E2E8F0" stroke="#CBD5E1" stroke-width="1"/>
  <rect x="94" y="59" width="28" height="14" rx="2" fill="#E2E8F0" stroke="#CBD5E1" stroke-width="1"/>
</svg>`,
  },
  {
    id: 'catalog-kitchen-dining-chair',
    name: 'Dining Chair',
    category: 'KITCHEN',
    slug: 'dining-chair',
    defaultWidth: 45,
    defaultHeight: 45,
    description: 'Padded dining chair with ergonomic curved backrest contour',
    svgContent: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="3" width="39" height="39" rx="6" fill="#F1F5F9" stroke="#64748B" stroke-width="2"/>
  <!-- Backrest curve -->
  <path d="M 6 8 Q 22.5 3 39 8 L 39 15 Q 22.5 10 6 15 Z" fill="#CBD5E1" stroke="#64748B" stroke-width="1.5"/>
  <!-- Seat cushion inner -->
  <rect x="8" y="16" width="29" height="23" rx="4" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1"/>
</svg>`,
  },
  {
    id: 'catalog-kitchen-stove',
    name: '4-Burner Stove Cooktop',
    category: 'KITCHEN',
    slug: 'stove-cooktop',
    defaultWidth: 65,
    defaultHeight: 60,
    description: 'Modern induction / gas cooktop with 4 burners and front control dials',
    svgContent: `<svg viewBox="0 0 65 60" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="61" height="56" rx="4" fill="#0F172A" stroke="#334155" stroke-width="2"/>
  <!-- 4 Burners -->
  <circle cx="18" cy="18" r="9" fill="#1E293B" stroke="#EF4444" stroke-width="1.5"/>
  <circle cx="18" cy="18" r="4" fill="#EF4444"/>
  <circle cx="47" cy="18" r="11" fill="#1E293B" stroke="#F59E0B" stroke-width="1.5"/>
  <circle cx="47" cy="18" r="5" fill="#F59E0B"/>
  <circle cx="18" cy="38" r="11" fill="#1E293B" stroke="#F59E0B" stroke-width="1.5"/>
  <circle cx="18" cy="38" r="5" fill="#F59E0B"/>
  <circle cx="47" cy="38" r="8" fill="#1E293B" stroke="#3B82F6" stroke-width="1.5"/>
  <circle cx="47" cy="38" r="3.5" fill="#3B82F6"/>
  <!-- Control dials at bottom -->
  <line x1="4" y1="50" x2="61" y2="50" stroke="#334155" stroke-width="1"/>
  <circle cx="14" cy="54" r="2" fill="#94A3B8"/>
  <circle cx="26" cy="54" r="2" fill="#94A3B8"/>
  <circle cx="39" cy="54" r="2" fill="#94A3B8"/>
  <circle cx="51" cy="54" r="2" fill="#94A3B8"/>
</svg>`,
  },
  {
    id: 'catalog-kitchen-sink',
    name: 'Kitchen Sink & Basin',
    category: 'KITCHEN',
    slug: 'kitchen-sink-basin',
    defaultWidth: 75,
    defaultHeight: 50,
    description: 'Stainless steel kitchen sink with basin bowl, drain basket, and swivel faucet',
    svgContent: `<svg viewBox="0 0 75 50" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="71" height="46" rx="4" fill="#F1F5F9" stroke="#64748B" stroke-width="2"/>
  <!-- Main basin -->
  <rect x="7" y="7" width="44" height="36" rx="5" fill="#E2E8F0" stroke="#94A3B8" stroke-width="1.5"/>
  <!-- Drain -->
  <circle cx="29" cy="25" r="4.5" fill="#CBD5E1" stroke="#64748B" stroke-width="1"/>
  <!-- Draining board grooves -->
  <line x1="56" y1="11" x2="68" y2="11" stroke="#CBD5E1" stroke-width="1.5"/>
  <line x1="56" y1="18" x2="68" y2="18" stroke="#CBD5E1" stroke-width="1.5"/>
  <line x1="56" y1="25" x2="68" y2="25" stroke="#CBD5E1" stroke-width="1.5"/>
  <line x1="56" y1="32" x2="68" y2="32" stroke="#CBD5E1" stroke-width="1.5"/>
  <line x1="56" y1="39" x2="68" y2="39" stroke="#CBD5E1" stroke-width="1.5"/>
  <!-- Faucet -->
  <circle cx="29" cy="4" r="3" fill="#64748B"/>
  <line x1="29" y1="4" x2="29" y2="14" stroke="#475569" stroke-width="2.5" stroke-linecap="round"/>
</svg>`,
  },

  // ==================== BATHROOM ====================
  {
    id: 'catalog-bath-toilet',
    name: 'Bathroom Toilet',
    category: 'BATHROOM',
    slug: 'bathroom-toilet',
    defaultWidth: 45,
    defaultHeight: 65,
    description: 'Standard flush water closet toilet with tank and elongated bowl',
    svgContent: `<svg viewBox="0 0 45 65" xmlns="http://www.w3.org/2000/svg">
  <!-- Water Cistern Tank at Top -->
  <rect x="3" y="3" width="39" height="18" rx="3" fill="#F8FAFC" stroke="#64748B" stroke-width="2"/>
  <circle cx="22.5" cy="8" r="2.5" fill="#CBD5E1" stroke="#94A3B8" stroke-width="1"/>
  <!-- Toilet Bowl -->
  <path d="M 8 21 C 8 45 12 61 22.5 61 C 33 61 37 45 37 21 Z" fill="#FFFFFF" stroke="#64748B" stroke-width="2"/>
  <!-- Inner water pool -->
  <ellipse cx="22.5" cy="40" rx="9" ry="12" fill="#E0F2FE" stroke="#38BDF8" stroke-width="1.5"/>
</svg>`,
  },
  {
    id: 'catalog-bath-wash-basin',
    name: 'Vanity Wash Basin',
    category: 'BATHROOM',
    slug: 'vanity-wash-basin',
    defaultWidth: 60,
    defaultHeight: 45,
    description: 'Ceramic countertop wash basin with hot/cold mixer faucet and drain hole',
    svgContent: `<svg viewBox="0 0 60 45" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="56" height="41" rx="5" fill="#F8FAFC" stroke="#64748B" stroke-width="2"/>
  <!-- Oval Sink Bowl -->
  <ellipse cx="30" cy="24" rx="22" ry="14" fill="#F1F5F9" stroke="#94A3B8" stroke-width="1.5"/>
  <!-- Drain -->
  <circle cx="30" cy="24" r="3" fill="#64748B"/>
  <!-- Faucet -->
  <circle cx="30" cy="5" r="3" fill="#64748B"/>
  <line x1="30" y1="5" x2="30" y2="12" stroke="#475569" stroke-width="2.5" stroke-linecap="round"/>
</svg>`,
  },
  {
    id: 'catalog-bath-shower',
    name: 'Square Shower Enclosure',
    category: 'BATHROOM',
    slug: 'shower-enclosure',
    defaultWidth: 80,
    defaultHeight: 80,
    description: 'Walk-in square shower cabin with glass walls, showerhead, and tile drain lines',
    svgContent: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="76" height="76" rx="4" fill="#F0FDF4" stroke="#16A34A" stroke-width="2"/>
  <!-- Glass enclosure walls -->
  <line x1="78" y1="2" x2="78" y2="78" stroke="#059669" stroke-width="2.5"/>
  <line x1="2" y1="78" x2="78" y2="78" stroke="#059669" stroke-width="2.5"/>
  <!-- Drain grate -->
  <circle cx="40" cy="40" r="6" fill="#CBD5E1" stroke="#64748B" stroke-width="1.5"/>
  <circle cx="40" cy="40" r="2" fill="#64748B"/>
  <!-- Diagonal slope floor lines -->
  <line x1="8" y1="8" x2="34" y2="34" stroke="#BBF7D0" stroke-width="1.5"/>
  <line x1="72" y1="8" x2="46" y2="34" stroke="#BBF7D0" stroke-width="1.5"/>
  <line x1="8" y1="72" x2="34" y2="46" stroke="#BBF7D0" stroke-width="1.5"/>
  <line x1="72" y1="72" x2="46" y2="46" stroke="#BBF7D0" stroke-width="1.5"/>
  <!-- Shower head at top left corner -->
  <circle cx="14" cy="14" r="5" fill="#3B82F6"/>
</svg>`,
  },

  // ==================== GENERAL ====================
  {
    id: 'catalog-gen-desk',
    name: 'Work / Study Desk',
    category: 'GENERAL',
    slug: 'work-study-desk',
    defaultWidth: 110,
    defaultHeight: 60,
    description: 'Spacious office work desk with laptop workspace and side drawer pedestal',
    svgContent: `<svg viewBox="0 0 110 60" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="106" height="56" rx="4" fill="#F8FAFC" stroke="#64748B" stroke-width="2"/>
  <!-- Drawer unit on right -->
  <line x1="82" y1="2" x2="82" y2="58" stroke="#94A3B8" stroke-width="1.5"/>
  <circle cx="96" cy="30" r="2.5" fill="#64748B"/>
  <!-- Laptop in center -->
  <rect x="36" y="16" width="32" height="24" rx="2" fill="#E2E8F0" stroke="#475569" stroke-width="1.5"/>
  <rect x="42" y="20" width="20" height="14" rx="1" fill="#3B82F6"/>
  <!-- Cable hole -->
  <circle cx="16" cy="14" r="3" fill="#94A3B8"/>
</svg>`,
  },
  {
    id: 'catalog-gen-chair',
    name: 'Swivel Office Chair',
    category: 'GENERAL',
    slug: 'swivel-office-chair',
    defaultWidth: 55,
    defaultHeight: 55,
    description: 'Ergonomic swivel task chair with 5-star base and cushioned armrests',
    svgContent: `<svg viewBox="0 0 55 55" xmlns="http://www.w3.org/2000/svg">
  <!-- 5-star caster base spokes -->
  <line x1="27.5" y1="27.5" x2="27.5" y2="5" stroke="#94A3B8" stroke-width="2"/>
  <line x1="27.5" y1="27.5" x2="49" y2="20" stroke="#94A3B8" stroke-width="2"/>
  <line x1="27.5" y1="27.5" x2="41" y2="46" stroke="#94A3B8" stroke-width="2"/>
  <line x1="27.5" y1="27.5" x2="14" y2="46" stroke="#94A3B8" stroke-width="2"/>
  <line x1="27.5" y1="27.5" x2="6" y2="20" stroke="#94A3B8" stroke-width="2"/>
  <!-- Seat cushion -->
  <circle cx="27.5" cy="27.5" r="16" fill="#3B82F6" stroke="#1D4ED8" stroke-width="2"/>
  <!-- Curved lumbar backrest -->
  <path d="M 12 14 Q 27.5 8 43 14 L 43 20 Q 27.5 14 12 20 Z" fill="#1E293B" stroke="#0F172A" stroke-width="1.5"/>
  <!-- Left and right armrests -->
  <rect x="7" y="22" width="6" height="15" rx="2" fill="#475569"/>
  <rect x="42" y="22" width="6" height="15" rx="2" fill="#475569"/>
</svg>`,
  },
  {
    id: 'catalog-gen-cabinet',
    name: 'Storage Cabinet',
    category: 'GENERAL',
    slug: 'storage-cabinet',
    defaultWidth: 80,
    defaultHeight: 40,
    description: 'Double-door universal storage cabinet with center meeting stile',
    svgContent: `<svg viewBox="0 0 80 40" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="76" height="36" rx="3" fill="#F1F5F9" stroke="#64748B" stroke-width="2"/>
  <line x1="40" y1="2" x2="40" y2="38" stroke="#94A3B8" stroke-width="1.5"/>
  <circle cx="36" cy="20" r="2.5" fill="#64748B"/>
  <circle cx="44" cy="20" r="2.5" fill="#64748B"/>
</svg>`,
  },
  {
    id: 'catalog-gen-door',
    name: 'Single Interior Door',
    category: 'GENERAL',
    slug: 'architectural-door-swing',
    defaultWidth: 80,
    defaultHeight: 80,
    description: 'Architectural top-view door opening with 90-degree swing path arc',
    svgContent: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <!-- Wall jamb anchors -->
  <rect x="2" y="2" width="8" height="12" fill="#334155"/>
  <rect x="70" y="2" width="8" height="12" fill="#334155"/>
  <!-- Door leaf open at 90 deg -->
  <rect x="2" y="14" width="6" height="62" rx="1.5" fill="#94A3B8" stroke="#475569" stroke-width="1.5"/>
  <!-- 90 degree trajectory arc -->
  <path d="M 8 76 A 68 68 0 0 0 76 8" stroke="#3B82F6" stroke-width="1.5" stroke-dasharray="4 3" fill="none"/>
</svg>`,
  },
  {
    id: 'catalog-gen-window',
    name: 'Double Window',
    category: 'GENERAL',
    slug: 'architectural-window',
    defaultWidth: 100,
    defaultHeight: 25,
    description: 'Wall window opening with dual glass panes and outer architectural frame',
    svgContent: `<svg viewBox="0 0 100 25" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="96" height="21" rx="2" fill="#F8FAFC" stroke="#64748B" stroke-width="2"/>
  <!-- Left and right wall cut indicators -->
  <line x1="12" y1="2" x2="12" y2="23" stroke="#334155" stroke-width="2.5"/>
  <line x1="88" y1="2" x2="88" y2="23" stroke="#334155" stroke-width="2.5"/>
  <!-- Glass panes -->
  <line x1="16" y1="9" x2="52" y2="9" stroke="#38BDF8" stroke-width="2"/>
  <line x1="48" y1="16" x2="84" y2="16" stroke="#38BDF8" stroke-width="2"/>
  <!-- Window sill projection -->
  <line x1="8" y1="23" x2="92" y2="23" stroke="#475569" stroke-width="1.5"/>
</svg>`,
  },
  {
    id: 'catalog-gen-plant',
    name: 'Potted Monstera Plant',
    category: 'GENERAL',
    slug: 'potted-monstera-plant',
    defaultWidth: 60,
    defaultHeight: 60,
    description: 'Decorative potted indoor botanical plant with radiating lush green leaves',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
  <!-- Pot in center -->
  <circle cx="30" cy="30" r="10" fill="#B45309" stroke="#78350F" stroke-width="1.5"/>
  <circle cx="30" cy="30" r="7" fill="#451A03"/>
  <!-- Radiating Monstera leaves -->
  <path d="M 30 20 C 22 10 20 4 30 2 C 40 4 38 10 30 20 Z" fill="#22C55E" stroke="#15803D" stroke-width="1"/>
  <path d="M 40 30 C 50 22 56 20 58 30 C 56 40 50 38 40 30 Z" fill="#16A34A" stroke="#15803D" stroke-width="1"/>
  <path d="M 30 40 C 38 50 40 56 30 58 C 20 56 22 50 30 40 Z" fill="#22C55E" stroke="#15803D" stroke-width="1"/>
  <path d="M 20 30 C 10 38 4 40 2 30 C 4 20 10 22 20 30 Z" fill="#16A34A" stroke="#15803D" stroke-width="1"/>
  <path d="M 37 23 C 48 16 52 12 50 20 C 48 24 42 27 37 23 Z" fill="#4ADE80" stroke="#15803D" stroke-width="1"/>
  <path d="M 23 37 C 12 44 8 48 10 40 C 12 36 18 33 23 37 Z" fill="#4ADE80" stroke="#15803D" stroke-width="1"/>
</svg>`,
  },
  {
    id: 'catalog-gen-lamp',
    name: 'Standing Floor Lamp',
    category: 'GENERAL',
    slug: 'standing-floor-lamp',
    defaultWidth: 45,
    defaultHeight: 45,
    description: 'Contemporary circular standing floor lamp with diffused warm shade',
    svgContent: `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg">
  <!-- Tripod legs -->
  <line x1="22.5" y1="22.5" x2="6" y2="38" stroke="#64748B" stroke-width="2"/>
  <line x1="22.5" y1="22.5" x2="39" y2="38" stroke="#64748B" stroke-width="2"/>
  <line x1="22.5" y1="22.5" x2="22.5" y2="6" stroke="#64748B" stroke-width="2"/>
  <!-- Circular Shade -->
  <circle cx="22.5" cy="22.5" r="14" fill="#FEF08A" stroke="#F59E0B" stroke-width="2"/>
  <!-- Bulb element -->
  <circle cx="22.5" cy="22.5" r="4" fill="#EAB308"/>
</svg>`,
  },
];

async function main() {
  console.log('🌱 Seeding 2D Object Catalog Assets...');

  // 1. Ensure assets directory exists
  const assetsDir = path.join(process.cwd(), 'assets', 'catalog');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  // 2. Write SVG files to disk and upsert to database
  for (const item of CATALOG_ITEMS) {
    const filePath = path.join(assetsDir, `${item.slug}.svg`);
    fs.writeFileSync(filePath, item.svgContent, 'utf-8');

    const relativeAssetPath = `assets/catalog/${item.slug}.svg`;

    await prisma.objectCatalogItem.upsert({
      where: { id: item.id },
      update: {
        name: item.name,
        category: item.category,
        assetPath: relativeAssetPath,
        svgContent: item.svgContent,
        defaultWidth: item.defaultWidth,
        defaultHeight: item.defaultHeight,
        description: item.description,
        isActive: true,
      },
      create: {
        id: item.id,
        name: item.name,
        category: item.category,
        assetPath: relativeAssetPath,
        svgContent: item.svgContent,
        defaultWidth: item.defaultWidth,
        defaultHeight: item.defaultHeight,
        description: item.description,
        isActive: true,
      },
    });
  }

  console.log(`✅ Successfully seeded ${CATALOG_ITEMS.length} 2D Object Catalog assets.`);

  // 3. Ensure a default House and Floors exist for seamless out-of-the-box user experience
  const houseCount = await prisma.house.count();
  if (houseCount === 0) {
    console.log('🏠 Creating default House and Floors...');
    const house = await prisma.house.create({
      data: {
        name: 'Villa Sentosa',
        description: 'Modern 2-Story Residence with Interactive Smart Home System',
        floors: {
          create: [
            {
              name: 'Lantai 1 (Ground Floor)',
              levelNumber: 1,
              floorPlan: {
                create: {
                  name: 'Ground Floor Interactive Plan',
                  viewBoxWidth: 1600,
                  viewBoxHeight: 1000,
                },
              },
            },
            {
              name: 'Lantai 2 (Upper Floor)',
              levelNumber: 2,
              floorPlan: {
                create: {
                  name: 'Upper Floor Interactive Plan',
                  viewBoxWidth: 1600,
                  viewBoxHeight: 1000,
                },
              },
            },
          ],
        },
      },
      include: {
        floors: {
          include: {
            floorPlan: true,
          },
        },
      },
    });
    console.log(`✅ Default House created with ID: ${house.id} (${house.floors.length} floors)`);
  } else {
    console.log(`ℹ️ Existing houses found (${houseCount}). Preserving existing house entities.`);
  }
}

main()
  .catch((err) => {
    console.error('❌ Error seeding catalog:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

