/**
 * PDF Text & Paragraph Extractor
 * 
 * Intelligently reconstructs structured lines and paragraphs from PDF.js getTextContent()
 * by analyzing spatial coordinates, font heights, vertical line spacing, indentation,
 * and punctuation cues.
 */

export interface TextExtractionResult {
  paragraphs: string[];
  fullText: string;
  wordCount: number;
}

interface RawTextItem {
  str: string;
  dir?: string;
  width?: number;
  height?: number;
  transform: [number, number, number, number, number, number];
  hasEOL?: boolean;
}

interface AssembledLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hasEOL: boolean;
}

/**
 * Extracts structured paragraphs and clean formatted text from PDF.js page text content.
 */
export function extractStructuredTextFromPdfPage(textContent: any): TextExtractionResult {
  if (!textContent || !Array.isArray(textContent.items) || textContent.items.length === 0) {
    return { paragraphs: [], fullText: "", wordCount: 0 };
  }

  // Filter valid string items that contain coordinate transforms
  const items: RawTextItem[] = textContent.items.filter(
    (it: any): it is RawTextItem =>
      it &&
      typeof it.str === "string" &&
      Array.isArray(it.transform) &&
      it.transform.length >= 6
  );

  if (items.length === 0) {
    return { paragraphs: [], fullText: "", wordCount: 0 };
  }

  // If text already has explicit multi-paragraph breaks inside item.str, preserve them
  const hasEmbeddedParagraphs = items.some((it) => it.str.includes("\n\n"));
  if (hasEmbeddedParagraphs) {
    const rawCombined = items.map((it) => it.str).join("");
    const directParagraphs = rawCombined
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter((p) => p.length > 0);

    if (directParagraphs.length > 1) {
      const fullText = directParagraphs.join("\n\n");
      const wordCount = fullText.split(/\s+/).filter(Boolean).length;
      return { paragraphs: directParagraphs, fullText, wordCount };
    }
  }

  // 1. Sort items primarily by Y descending (top-to-bottom) and X ascending (left-to-right)
  const sortedItems = [...items].sort((a, b) => {
    const yA = a.transform[5];
    const yB = b.transform[5];
    const yDiff = yB - yA;
    // If baseline difference is negligible (< 3.0pt), treat as same line and sort by X
    if (Math.abs(yDiff) <= 3.0) {
      return a.transform[4] - b.transform[4];
    }
    return yDiff;
  });

  // 2. Group items into lines
  const lines: AssembledLine[] = [];
  let currentLineItems: RawTextItem[] = [];
  let currentLineY = sortedItems[0].transform[5];
  let currentLineHeight = sortedItems[0].height || Math.abs(sortedItems[0].transform[3] || 11);

  const assembleLine = (itemsInLine: RawTextItem[]): AssembledLine => {
    // Sort left to right
    const sorted = [...itemsInLine].sort((a, b) => a.transform[4] - b.transform[4]);
    let text = "";
    let lastRight = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let totalHeight = 0;
    let hasEOL = false;

    for (let i = 0; i < sorted.length; i++) {
      const it = sorted[i];
      const x = it.transform[4];
      const w = it.width || 0;
      const h = it.height || Math.abs(it.transform[3] || 11);
      const str = it.str;

      if (x < minX) minX = x;
      if (x + w > maxX) maxX = x + w;
      totalHeight += h;
      if (it.hasEOL) hasEOL = true;

      if (i === 0) {
        text = str;
      } else {
        const gap = x - lastRight;
        const endsWithSpace = /\s$/.test(text);
        const startsWithSpace = /^\s/.test(str);

        // If there is an optical gap (> 1.8pt) and neither side already has whitespace
        if (!endsWithSpace && !startsWithSpace && gap > 1.8) {
          text += " " + str;
        } else {
          text += str;
        }
      }
      lastRight = x + w;
    }

    return {
      text: text.trim(),
      x: minX === Infinity ? 0 : minX,
      y: itemsInLine[0].transform[5],
      width: maxX > minX ? maxX - minX : 0,
      height: totalHeight / itemsInLine.length,
      hasEOL,
    };
  };

  for (const item of sortedItems) {
    const itemY = item.transform[5];
    const itemH = item.height || Math.abs(item.transform[3] || 11);
    const lineTolerance = Math.max(3.0, currentLineHeight * 0.35);

    if (currentLineItems.length === 0) {
      currentLineItems.push(item);
      currentLineY = itemY;
      currentLineHeight = itemH;
    } else if (Math.abs(itemY - currentLineY) <= lineTolerance) {
      currentLineItems.push(item);
    } else {
      lines.push(assembleLine(currentLineItems));
      currentLineItems = [item];
      currentLineY = itemY;
      currentLineHeight = itemH;
    }
  }

  if (currentLineItems.length > 0) {
    lines.push(assembleLine(currentLineItems));
  }

  // Filter out empty lines
  const cleanLines = lines.filter((l) => l.text.length > 0);
  if (cleanLines.length === 0) {
    return { paragraphs: [], fullText: "", wordCount: 0 };
  }

  // 3. Compute statistical baseline metrics for the page
  const verticalDeltas: number[] = [];
  for (let i = 0; i < cleanLines.length - 1; i++) {
    const diff = cleanLines[i].y - cleanLines[i + 1].y;
    if (diff > 2 && diff < 80) {
      verticalDeltas.push(diff);
    }
  }
  verticalDeltas.sort((a, b) => a - b);
  const medianSpacing =
    verticalDeltas.length > 0
      ? verticalDeltas[Math.floor(verticalDeltas.length / 2)]
      : 16;

  const xPositions = cleanLines.map((l) => Math.round(l.x)).sort((a, b) => a - b);
  const baseLeftMargin = xPositions[Math.floor(xPositions.length * 0.25)] || cleanLines[0].x;
  const maxLineWidth = Math.max(...cleanLines.map((l) => l.width), 250);

  const fontHeights = cleanLines.map((l) => l.height).sort((a, b) => a - b);
  const medianHeight = fontHeights[Math.floor(fontHeights.length / 2)] || 11;

  // 4. Cluster lines into distinct paragraphs
  const paragraphs: string[] = [];
  let currentParagraph = cleanLines[0].text;

  for (let i = 0; i < cleanLines.length - 1; i++) {
    const curr = cleanLines[i];
    const next = cleanLines[i + 1];
    const deltaY = curr.y - next.y; // positive since curr is above next

    // Heuristics for paragraph break:
    // a) Significant vertical gap (more than regular line height leading)
    const isLargeVerticalGap =
      deltaY >= medianSpacing * 1.32 || deltaY >= curr.height * 1.55;

    // b) Sentence ending punctuation (. ? ! : ” ")
    const endsWithTerminalPunctuation = /[.?!:;"”’)]\s*$/.test(curr.text);

    // c) Next line has paragraph indentation (at least 9pt from left baseline)
    const nextLineIsIndented = next.x - baseLeftMargin >= 9;

    // d) Current line is significantly shorter than regular column width (typical paragraph terminus)
    const currLineIsShort = curr.width < maxLineWidth * 0.72;

    // e) Heading or title style transition (distinct font size increase or decrease)
    const isHeadingTransition =
      curr.height >= medianHeight * 1.25 ||
      next.height >= medianHeight * 1.25 ||
      Math.abs(curr.height - next.height) >= 3.0;

    // f) Next line starts with bullet or numbering list marker (•, -, 1., (a), etc.)
    const isListMarker = /^([•\-\*\–—◦]|(\(?\d+[\.\)]|\(?[a-zA-Z][\.\)]))\s+/.test(next.text);

    // g) PDF.js signaled EOL and there is a noticeable gap
    const isEolBreak = curr.hasEOL && deltaY >= medianSpacing * 1.2;

    const isNewParagraph =
      isLargeVerticalGap ||
      (endsWithTerminalPunctuation && (nextLineIsIndented || currLineIsShort || deltaY >= medianSpacing * 1.15)) ||
      isHeadingTransition ||
      isListMarker ||
      isEolBreak;

    if (isNewParagraph) {
      if (currentParagraph.trim()) {
        paragraphs.push(currentParagraph.trim());
      }
      currentParagraph = next.text;
    } else {
      // Continuation of current paragraph:
      // Handle word hyphenation at line end (e.g. "perkembang-" and "an")
      if (/([a-zA-Z]{2,})-$/.test(currentParagraph) && /^[a-zA-Z]/.test(next.text)) {
        currentParagraph = currentParagraph.slice(0, -1) + next.text;
      } else {
        currentParagraph += " " + next.text;
      }
    }
  }

  if (currentParagraph.trim()) {
    paragraphs.push(currentParagraph.trim());
  }

  const fullText = paragraphs.join("\n\n");
  const wordCount = fullText.split(/\s+/).filter(Boolean).length;

  return {
    paragraphs,
    fullText,
    wordCount,
  };
}
