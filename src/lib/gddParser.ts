export interface ParsedGdd {
  pitch: string;
  usp: string;
  pillars: Array<{ name: string; text: string }>;
  mechanics: Array<{ name: string; text: string }>;
  scope: { essential: string; nice: string; out: string };
  story: Array<{ label: string; text: string }>;
  art: { images: number };
  overview: Record<string, string>;
  recognized: number;
  completeness: {
    filled: number;
    total: number;
    sections: Array<{ key: string; label: string; heading: string; filled: boolean; found: boolean }>;
    missing: string[];
  };
  syncedAt: string;
}

interface GddSection {
  title: string;
  lines: string[];
}

interface ParsedItem {
  name: string;
  text: string;
}

const aliases: Record<string, string[]> = {
  pitch: ['elevator pitch'],
  usp: ['unique selling point / the twist', 'unique selling point', 'the twist', 'o diferencial', 'diferencial do jogo'],
  pillars: ['design pillars', 'pilares de design'],
  mechanics: ['core system mechanics', 'mecanicas principais'],
  scope: ['scope', 'escopo'],
  story: ['story elements', 'elementos da historia', 'sinopse'],
  art: ['supplemental art', 'arte de apoio'],
  overview: ['game overview', 'ficha tecnica']
};

const requiredSections = [
  ['pitch', 'Elevator pitch', 'Elevator Pitch'],
  ['usp', 'Diferencial', 'Unique Selling Point / The Twist'],
  ['pillars', 'Pilares de design', 'Design Pillars'],
  ['mechanics', 'Mecânicas principais', 'Core System Mechanics'],
  ['scope', 'Escopo e tamanho', 'Scope'],
  ['story', 'Elementos da história', 'Story Elements'],
  ['art', 'Arte de apoio', 'Supplemental Art']
] as const;

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[*_`#]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const unescapeMarkdown = (value: string) => value.replace(/\\([\[\]_#>\-.!()*`])/g, '$1');

const isGuidance = (line: string) => {
  const value = line.trim();
  return /^\*\*\*[^*]+\*\*\*\s*\*/.test(value)
    || /^\*[^*].*[^*]\*$/.test(value)
    || /^_[^_].*[^_]_$/.test(value);
};

const stripPlaceholders = (value: string) => value.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();

const hasRealText = (value: string) => stripPlaceholders(value).replace(/[*_\-:–—|]/g, '').trim().length >= 3;

function splitSections(markdown: string): GddSection[] {
  const sections: GddSection[] = [];
  let current: GddSection = { title: '', lines: [] };
  for (const rawLine of markdown.replace(/\r/g, '').split('\n')) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(rawLine);
    if (heading) {
      sections.push(current);
      current = { title: unescapeMarkdown(heading[2].replace(/\*\*/g, '').trim()), lines: [] };
    } else {
      current.lines.push(rawLine);
    }
  }
  sections.push(current);
  return sections;
}

const contentLines = (section: GddSection) => section.lines
  .map(unescapeMarkdown)
  .filter(line => line.trim() && !isGuidance(line));

function parseItem(line: string): ParsedItem {
  const value = line.replace(/^\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?/, '').trim();
  const boldLabel = /^\*\*(.+?)\*\*\s*(?:[-:\u2013\u2014]\s*)?(.*)$/.exec(value);
  if (boldLabel) return { name: boldLabel[1].replace(/[:\s]+$/, '').trim(), text: boldLabel[2].trim() };
  const label = /^([^:\-\u2013\u2014]{2,40})\s*[:\-\u2013\u2014]\s+(.+)$/.exec(value);
  if (label) return { name: label[1].trim(), text: label[2].trim() };
  return { name: '', text: value };
}

const itemFilled = (item: ParsedItem) => item.text.trim()
  ? hasRealText(item.text)
  : hasRealText(item.name);

function parseItems(section: GddSection) {
  return contentLines(section)
    .filter(line => !/^\s*\|/.test(line))
    .map(parseItem)
    .filter(itemFilled);
}

function parseTable(section: GddSection) {
  const result: Record<string, string> = {};
  for (const line of contentLines(section)) {
    if (!/^\s*\|/.test(line) || /^\s*\|\s*:?-+/.test(line)) continue;
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.replace(/\*\*/g, '').trim());
    if (cells.length >= 2 && cells[0] && stripPlaceholders(cells[1]).length > 0) result[cells[0]] = cells[1];
  }
  return result;
}

export function parseGdd(markdown: string): ParsedGdd {
  const sections = splitSections(markdown || '');
  const byKey: Record<string, GddSection> = {};
  for (const section of sections) {
    const title = normalize(section.title);
    const key = Object.entries(aliases).find(([, names]) => names.includes(title))?.[0];
    if (key && !byKey[key]) byKey[key] = section;
  }

  const result: Omit<ParsedGdd, 'recognized' | 'completeness' | 'syncedAt'> = {
    pitch: byKey.pitch ? contentLines(byKey.pitch).filter(hasRealText).join('\n\n') : '',
    usp: byKey.usp ? contentLines(byKey.usp).filter(hasRealText).join('\n\n') : '',
    pillars: byKey.pillars ? parseItems(byKey.pillars).map(item => ({ name: item.name, text: item.text })) : [],
    mechanics: byKey.mechanics ? parseItems(byKey.mechanics).map(item => ({ name: item.name, text: item.text })) : [],
    scope: { essential: '', nice: '', out: '' },
    story: byKey.story ? parseItems(byKey.story).map(item => ({ label: item.name, text: item.text })) : [],
    art: { images: byKey.art ? (byKey.art.lines.join('\n').match(/!\[[^\]]*\]\([^)]+\)|<img\b/g) || []).length : 0 },
    overview: byKey.overview ? parseTable(byKey.overview) : {}
  };

  if (byKey.scope) {
    for (const item of parseItems(byKey.scope)) {
      const name = normalize(item.name);
      if (name.startsWith('essencial')) result.scope.essential = item.text;
      else if (name.startsWith('desejavel')) result.scope.nice = item.text;
      else if (name.startsWith('fora')) result.scope.out = item.text;
    }
  }

  const filledMap: Record<string, boolean> = {
    pitch: hasRealText(result.pitch),
    usp: hasRealText(result.usp),
    pillars: result.pillars.length > 0,
    mechanics: result.mechanics.length > 0,
    scope: Boolean(result.scope.essential || result.scope.nice || result.scope.out),
    story: result.story.length > 0,
    art: result.art.images > 0
  };
  const completeness = requiredSections.map(([key, label, heading]) => ({
    key,
    label,
    heading,
    filled: Boolean(filledMap[key]),
    found: Boolean(byKey[key])
  }));
  const filled = completeness.filter(section => section.filled).length;

  return {
    ...result,
    recognized: completeness.filter(section => section.found).length,
    completeness: {
      filled,
      total: completeness.length,
      sections: completeness,
      missing: completeness.filter(section => !section.filled).map(section => section.label)
    },
    syncedAt: new Date().toISOString()
  };
}
