/**
 * Curated list of public hardware companies, focused on the four pillars
 * the user requested: GPU/AI accelerators, CPU, Storage/Memory, and Network.
 *
 * Most are listed on NASDAQ; a few foundational names (TSMC, ASML, HPE)
 * are NYSE-listed but are inseparable from any serious hardware coverage.
 *
 * Tickers use Yahoo Finance conventions (US tickers as-is).
 *
 * Chinese names use the most commonly used translations in mainland China
 * (英伟达 for NVIDIA, 台积电 for TSMC, etc.). Where there is no widely-used
 * Chinese name (Lumentum, Credo, Ciena, NetApp, Pure Storage), the English
 * name is kept verbatim to avoid inventing a translation.
 */

export type HardwareCategory =
  | 'GPU/AI'
  | 'CPU'
  | 'Storage'
  | 'Memory'
  | 'Network'
  | 'Semi Equipment'
  | 'Foundry'
  | 'Systems'
  | 'Analog/Embedded';

export interface HardwareStock {
  symbol: string;
  name: string;
  /** Chinese name. Falls back to English when no widely-used translation exists. */
  nameZh: string;
  exchange: 'NASDAQ' | 'NYSE';
  category: HardwareCategory;
  /** Optional short blurb shown as a tooltip / secondary label. */
  blurb?: string;
}

export const HARDWARE_STOCKS: HardwareStock[] = [
  // ── GPU / AI Accelerators ────────────────────────────────────────────────
  { symbol: 'NVDA', name: 'NVIDIA',                 nameZh: '英伟达',       exchange: 'NASDAQ', category: 'GPU/AI',         blurb: 'Datacenter GPUs, CUDA, AI accelerators' },
  { symbol: 'AMD',  name: 'Advanced Micro Devices', nameZh: '超威半导体',   exchange: 'NASDAQ', category: 'GPU/AI',         blurb: 'Instinct MI3xx/MI4xx, Radeon, EPYC' },
  { symbol: 'AVGO', name: 'Broadcom',               nameZh: '博通',         exchange: 'NASDAQ', category: 'GPU/AI',         blurb: 'Custom ASICs, AI networking silicon' },
  { symbol: 'MRVL', name: 'Marvell Technology',     nameZh: '美满电子',     exchange: 'NASDAQ', category: 'GPU/AI',         blurb: 'Custom AI ASIC, optical DSPs' },

  // ── CPU ──────────────────────────────────────────────────────────────────
  { symbol: 'INTC', name: 'Intel',                  nameZh: '英特尔',       exchange: 'NASDAQ', category: 'CPU',            blurb: 'x86 CPUs, Foundry, Gaudi' },
  { symbol: 'ARM',  name: 'Arm Holdings',           nameZh: '安谋控股',     exchange: 'NASDAQ', category: 'CPU',            blurb: 'CPU IP, Neoverse, mobile/server' },
  { symbol: 'QCOM', name: 'Qualcomm',               nameZh: '高通',         exchange: 'NASDAQ', category: 'CPU',            blurb: 'Snapdragon, Oryon CPUs, modems' },
  { symbol: 'AAPL', name: 'Apple',                  nameZh: '苹果',         exchange: 'NASDAQ', category: 'CPU',            blurb: 'Apple Silicon (M-series, A-series)' },

  // ── Memory ───────────────────────────────────────────────────────────────
  { symbol: 'MU',   name: 'Micron Technology',      nameZh: '美光科技',     exchange: 'NASDAQ', category: 'Memory',         blurb: 'DRAM, NAND, HBM3E/HBM4' },

  // ── Storage ──────────────────────────────────────────────────────────────
  { symbol: 'STX',  name: 'Seagate Technology',     nameZh: '希捷科技',     exchange: 'NASDAQ', category: 'Storage',        blurb: 'HDD, HAMR, Exos' },
  { symbol: 'WDC',  name: 'Western Digital',        nameZh: '西部数据',     exchange: 'NASDAQ', category: 'Storage',        blurb: 'HDD post-flash spinoff' },
  { symbol: 'SNDK', name: 'SanDisk',                nameZh: '闪迪',         exchange: 'NASDAQ', category: 'Storage',        blurb: 'NAND/SSD spinoff from WDC' },
  { symbol: 'NTAP', name: 'NetApp',                 nameZh: 'NetApp',       exchange: 'NASDAQ', category: 'Storage',        blurb: 'Enterprise storage systems' },
  { symbol: 'PSTG', name: 'Pure Storage',           nameZh: 'Pure Storage', exchange: 'NYSE',   category: 'Storage',        blurb: 'All-flash arrays, DirectFlash' },

  // ── Network ──────────────────────────────────────────────────────────────
  { symbol: 'CSCO', name: 'Cisco Systems',          nameZh: '思科',         exchange: 'NASDAQ', category: 'Network',        blurb: 'Switching, routing, Silicon One' },
  { symbol: 'ANET', name: 'Arista Networks',        nameZh: 'Arista 网络',  exchange: 'NYSE',   category: 'Network',        blurb: 'Datacenter switching, EOS' },
  { symbol: 'CIEN', name: 'Ciena',                  nameZh: 'Ciena',        exchange: 'NYSE',   category: 'Network',        blurb: 'Optical transport, coherent DSP' },
  { symbol: 'LITE', name: 'Lumentum',               nameZh: 'Lumentum',     exchange: 'NASDAQ', category: 'Network',        blurb: 'Optical/photonic components, 800G/1.6T' },
  { symbol: 'NTGR', name: 'NETGEAR',                nameZh: '网件',         exchange: 'NASDAQ', category: 'Network',        blurb: 'SMB/consumer networking' },
  { symbol: 'EXTR', name: 'Extreme Networks',       nameZh: '极进网络',     exchange: 'NASDAQ', category: 'Network',        blurb: 'Enterprise switching/wireless' },
  { symbol: 'CRDO', name: 'Credo Technology',       nameZh: 'Credo',        exchange: 'NASDAQ', category: 'Network',        blurb: 'High-speed connectivity, AECs' },
  { symbol: 'NOK',  name: 'Nokia',                  nameZh: '诺基亚',       exchange: 'NYSE',   category: 'Network',        blurb: 'Mobile/optical, ex-Infinera' },
  { symbol: 'ERIC', name: 'Ericsson',               nameZh: '爱立信',       exchange: 'NASDAQ', category: 'Network',        blurb: 'RAN, 5G networking' },

  // ── Semi Equipment ───────────────────────────────────────────────────────
  { symbol: 'AMAT', name: 'Applied Materials',      nameZh: '应用材料',     exchange: 'NASDAQ', category: 'Semi Equipment', blurb: 'Deposition, etch, ion implant' },
  { symbol: 'LRCX', name: 'Lam Research',           nameZh: '泛林集团',     exchange: 'NASDAQ', category: 'Semi Equipment', blurb: 'Etch and deposition' },
  { symbol: 'KLAC', name: 'KLA Corp',               nameZh: '科磊',         exchange: 'NASDAQ', category: 'Semi Equipment', blurb: 'Process control, inspection' },
  { symbol: 'ASML', name: 'ASML Holding',           nameZh: '阿斯麦',       exchange: 'NASDAQ', category: 'Semi Equipment', blurb: 'EUV/DUV lithography' },
  { symbol: 'TER',  name: 'Teradyne',               nameZh: '泰瑞达',       exchange: 'NASDAQ', category: 'Semi Equipment', blurb: 'Semiconductor test, robotics' },

  // ── Foundry ──────────────────────────────────────────────────────────────
  { symbol: 'TSM',  name: 'Taiwan Semiconductor',   nameZh: '台积电',       exchange: 'NYSE',   category: 'Foundry',        blurb: 'Leading-edge foundry (N3/N2)' },

  // ── Systems / OEMs ───────────────────────────────────────────────────────
  { symbol: 'DELL', name: 'Dell Technologies',      nameZh: '戴尔',         exchange: 'NYSE',   category: 'Systems',        blurb: 'AI servers, PowerEdge' },
  { symbol: 'SMCI', name: 'Super Micro Computer',   nameZh: '美超微',       exchange: 'NASDAQ', category: 'Systems',        blurb: 'GPU servers, liquid-cooled racks' },
  { symbol: 'HPE',  name: 'Hewlett Packard Ent.',   nameZh: '慧与',         exchange: 'NYSE',   category: 'Systems',        blurb: 'ProLiant/Cray, Juniper integration' },
  { symbol: 'HPQ',  name: 'HP Inc.',                nameZh: '惠普',         exchange: 'NYSE',   category: 'Systems',        blurb: 'PCs, printers, peripherals' },
  { symbol: 'IBM',  name: 'IBM',                    nameZh: 'IBM',          exchange: 'NYSE',   category: 'Systems',        blurb: 'Mainframes, Power, storage' },

  // ── Analog / Embedded (datapath glue around hardware) ────────────────────
  { symbol: 'TXN',  name: 'Texas Instruments',      nameZh: '德州仪器',     exchange: 'NASDAQ', category: 'Analog/Embedded', blurb: 'Analog, embedded processing' },
  { symbol: 'ADI',  name: 'Analog Devices',         nameZh: '亚德诺',       exchange: 'NASDAQ', category: 'Analog/Embedded', blurb: 'High-performance analog, DSP' },
  { symbol: 'MCHP', name: 'Microchip Technology',   nameZh: '微芯科技',     exchange: 'NASDAQ', category: 'Analog/Embedded', blurb: 'MCUs, mixed-signal, FPGAs' },
  { symbol: 'ON',   name: 'ON Semiconductor',       nameZh: '安森美',       exchange: 'NASDAQ', category: 'Analog/Embedded', blurb: 'Power, sensing, automotive Si' },
];

export const HARDWARE_CATEGORIES: HardwareCategory[] = [
  'GPU/AI',
  'CPU',
  'Memory',
  'Storage',
  'Network',
  'Semi Equipment',
  'Foundry',
  'Systems',
  'Analog/Embedded',
];

/**
 * Coarser groupings used for the filter UI.
 *
 * The fine-grained category (GPU/AI vs CPU) stays useful inside the per-row
 * chip so users still see the precise type at a glance. But for filtering,
 * five buttons read much better than nine — and most users think in these
 * coarser buckets anyway ("show me everything semiconductor-equipment-ish",
 * not "show me Foundry separately from Semi Equipment").
 */
export type CategoryGroup =
  | 'GPU/CPU'
  | 'Memory/Storage'
  | 'Network'
  | 'Semi/Foundry'
  | 'Systems';

export const CATEGORY_GROUPS: Record<CategoryGroup, HardwareCategory[]> = {
  'GPU/CPU': ['GPU/AI', 'CPU'],
  'Memory/Storage': ['Memory', 'Storage'],
  'Network': ['Network'],
  'Semi/Foundry': ['Semi Equipment', 'Analog/Embedded', 'Foundry'],
  'Systems': ['Systems'],
};

export const CATEGORY_GROUP_ORDER: CategoryGroup[] = [
  'GPU/CPU',
  'Memory/Storage',
  'Network',
  'Semi/Foundry',
  'Systems',
];

/** Reverse lookup: which group does this fine-grained category belong to? */
export function groupOfCategory(c: HardwareCategory): CategoryGroup {
  for (const group of CATEGORY_GROUP_ORDER) {
    if (CATEGORY_GROUPS[group].includes(c)) return group;
  }
  // Should never hit — the type system enforces all categories are covered.
  return 'Systems';
}

/**
 * Render a company name as "中文 - English" when a Chinese name is available,
 * regardless of UI language. Falls back to just the English name when there
 * is no distinct Chinese translation (e.g. IBM, Lumentum, Ciena).
 */
export function formatCompanyName(stock: HardwareStock): string {
  if (stock.nameZh && stock.nameZh !== stock.name) {
    return `${stock.nameZh} - ${stock.name}`;
  }
  return stock.name;
}

/**
 * Short label for the in-row category chip. Keeps the column narrow.
 * The long form is still used in the filter button bar.
 */
const CATEGORY_SHORT: Record<HardwareCategory, string> = {
  'GPU/AI': 'GPU',
  'CPU': 'CPU',
  'Memory': 'Mem',
  'Storage': 'Stor',
  'Network': 'Net',
  'Semi Equipment': 'SemiEq',
  'Foundry': 'Fab',
  'Systems': 'Sys',
  'Analog/Embedded': 'Analog',
};

export function shortCategoryLabel(c: HardwareCategory): string {
  return CATEGORY_SHORT[c] ?? c;
}
