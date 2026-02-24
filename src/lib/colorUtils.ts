/**
 * Color conversion and naming for the admin color picker.
 */

export function hslToHex(h: number, s: number, l: number): string {
  h = h % 360;
  if (h < 0) h += 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const clean = hex.replace(/^#/, "");
  if (clean.length !== 6 && clean.length !== 3) {
    return { h: 0, s: 0, l: 50 };
  }
  let r: number, g: number, b: number;
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16) / 255;
    g = parseInt(clean[1] + clean[1], 16) / 255;
    b = parseInt(clean[2] + clean[2], 16) / 255;
  } else {
    r = parseInt(clean.slice(0, 2), 16) / 255;
    g = parseInt(clean.slice(2, 4), 16) / 255;
    b = parseInt(clean.slice(4, 6), 16) / 255;
  }
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
    }
    h *= 360;
    return { h, s: s * 100, l: l * 100 };
  }
  return { h: 0, s: 0, l: l * 100 };
}

/** Nomes de cores comuns para sugerir a partir do hex (nome em inglês para comparação por distância). */
const NAMED_COLORS: { name: string; hex: string }[] = [
  { name: "Lavanda", hex: "#E6E6FA" },
  { name: "Lilás", hex: "#C8A2C8" },
  { name: "Roxo", hex: "#800080" },
  { name: "Vermelho", hex: "#FF0000" },
  { name: "Rosa", hex: "#FFC0CB" },
  { name: "Azul", hex: "#0000FF" },
  { name: "Ciano", hex: "#00FFFF" },
  { name: "Verde", hex: "#008000" },
  { name: "Lima", hex: "#00FF00" },
  { name: "Amarelo", hex: "#FFFF00" },
  { name: "Laranja", hex: "#FFA500" },
  { name: "Coral", hex: "#FF7F50" },
  { name: "Salmão", hex: "#FA8072" },
  { name: "Bordô", hex: "#800020" },
  { name: "Vinho", hex: "#722F37" },
  { name: "Preto", hex: "#000000" },
  { name: "Branco", hex: "#FFFFFF" },
  { name: "Cinza", hex: "#808080" },
  { name: "Marrom", hex: "#8B4513" },
  { name: "Bege", hex: "#F5F5DC" },
  { name: "Nude", hex: "#E3C6A8" },
  { name: "Dourado", hex: "#FFD700" },
  { name: "Prata", hex: "#C0C0C0" },
  { name: "Oliva", hex: "#808000" },
  { name: "Turquesa", hex: "#40E0D0" },
  { name: "Menta", hex: "#98FF98" },
];

function colorDistance(hex1: string, hex2: string): number {
  const parse = (h: string) => {
    const x = h.replace(/^#/, "");
    return [
      parseInt(x.slice(0, 2), 16),
      parseInt(x.slice(2, 4), 16),
      parseInt(x.slice(4, 6), 16),
    ];
  };
  const [r1, g1, b1] = parse(hex1);
  const [r2, g2, b2] = parse(hex2);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/** Retorna o nome da cor mais próxima do hex ou null se não houver boa correspondência. */
export function getClosestColorName(hex: string, maxDistance = 120): string | null {
  const normalized = hex.startsWith("#") ? hex : `#${hex}`;
  if (normalized.length !== 7) return null;
  let best: { name: string; dist: number } | null = null;
  for (const { name, hex: ref } of NAMED_COLORS) {
    const dist = colorDistance(normalized, ref);
    if (dist <= maxDistance && (!best || dist < best.dist)) {
      best = { name, dist };
    }
  }
  return best?.name ?? null;
}
