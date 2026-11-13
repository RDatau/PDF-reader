/**
 * PDF Text & Paragraph Extractor
 * 
 * Intelligently reconstructs structured lines and paragraphs from PDF.js getTextContent()
 * by analyzing spatial coordinates, font heights, vertical line spacing, indentation,
 * and punctuation cues.
 */

export interface TextExtractionOptions {
  pageView?: number[]; // PDF.js page.view: [xMin, yMin, xMax, yMax]
  docTitle?: string;
  neighborTopTexts?: string[];
  neighborBottomTexts?: string[];
  skipHeadersFooters?: boolean;
  skipChapterHeadings?: boolean;
  customIgnoredLines?: string[];
}

export interface TextExtractionResult {
  paragraphs: string[];
  fullText: string;
  ttsParagraphs: string[];
  ttsText: string;
  filteredHeaders: string[];
  topLines: string[];
  bottomLines: string[];
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

function normalizeEdgeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function stripEdgePageNumbers(text: string): string {
  return normalizeEdgeText(text)
    .replace(/^[-–—•|\[\]()\s]*\d{1,5}[-–—•|\[\]()\s]+/, "")
    .replace(/[-–—•|\[\]()\s]+\d{1,5}[-–—•|\[\]()\s]*$/, "")
    .replace(/\b(halaman|hal\.?|hlm\.?|page|p\.?)\s*\d+(\s*(of|dari|\/)\s*\d+)?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isStandalonePageNumber(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 40) return false;
  if (/^[-–—•|\[\]()\s]*\d{1,5}[-–—•|\[\]()\s]*$/.test(trimmed)) return true;
  if (/^(halaman|hal\.?|hlm\.?|page|p\.?)\s*\d+(\s*(of|dari|\/)\s*\d+)?$/i.test(trimmed)) return true;
  if (/^\d{1,4}\s*\/\s*\d{1,4}$/.test(trimmed)) return true;
  return false;
}

function normalizeDocTitle(docTitle?: string): string {
  if (!docTitle) return "";
  return docTitle
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function assembleLinesFromItems(items: RawTextItem[]): AssembledLine[] {
  const sortedItems = [...items].sort((a, b) => {
    const yA = a.transform[5];
    const yB = b.transform[5];
    const yDiff = yB - yA;
    if (Math.abs(yDiff) <= 3.0) {
      return a.transform[4] - b.transform[4];
    }
    return yDiff;
  });

  const lines: AssembledLine[] = [];
  let currentLineItems: RawTextItem[] = [];
  let currentLineY = sortedItems[0].transform[5];
  let currentLineHeight = sortedItems[0].height || Math.abs(sortedItems[0].transform[3] || 11);

  const assembleLine = (itemsInLine: RawTextItem[]): AssembledLine => {
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

  return lines.filter((l) => l.text.length > 0);
}

/**
 * Lightweight extractor for top/bottom edge lines of adjacent pages (for cross-page header/footer detection).
 */
export function extractPageEdgeLines(textContent: any): { topLines: string[]; bottomLines: string[] } {
  if (!textContent || !Array.isArray(textContent.items) || textContent.items.length === 0) {
    return { topLines: [], bottomLines: [] };
  }
  const items: RawTextItem[] = textContent.items.filter(
    (it: any): it is RawTextItem =>
      it &&
      typeof it.str === "string" &&
      it.str.trim().length > 0 &&
      Array.isArray(it.transform) &&
      it.transform.length >= 6
  );
  if (items.length === 0) return { topLines: [], bottomLines: [] };

  const cleanLines = assembleLinesFromItems(items);
  return {
    topLines: cleanLines.slice(0, 2).map((l) => l.text),
    bottomLines: cleanLines.slice(-2).map((l) => l.text),
  };
}

function buildParagraphsFromLines(
  linesToCluster: AssembledLine[],
  medianSpacing: number,
  baseLeftMargin: number,
  maxLineWidth: number,
  medianHeight: number
): string[] {
  if (linesToCluster.length === 0) return [];

  const paragraphs: string[] = [];
  let currentParagraph = linesToCluster[0].text;

  for (let i = 0; i < linesToCluster.length - 1; i++) {
    const curr = linesToCluster[i];
    const next = linesToCluster[i + 1];
    const deltaY = curr.y - next.y;

    const isLargeVerticalGap =
      deltaY >= medianSpacing * 1.32 || deltaY >= curr.height * 1.55;

    const endsWithTerminalPunctuation = /[.?!:;"”’)]\s*$/.test(curr.text);
    const nextLineIsIndented = next.x - baseLeftMargin >= 9;
    const currLineIsShort = curr.width < maxLineWidth * 0.72;

    const isHeadingTransition =
      curr.height >= medianHeight * 1.25 ||
      next.height >= medianHeight * 1.25 ||
      Math.abs(curr.height - next.height) >= 3.0;

    const isListMarker = /^([•\-\*\–—◦]|(\(?\d+[\.\)]|\(?[a-zA-Z][\.\)]))\s+/.test(next.text);
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

  return paragraphs;
}

function isHeadingParagraph(paragraph: string): boolean {
  const trimmed = paragraph.trim();
  if (!trimmed || trimmed.length > 90) return false;
  if (/[.?!…]["”’)]*\s*$/.test(trimmed)) return false;
  return (
    /^[A-Z0-9\s:—–-]+$/.test(trimmed) ||
    /^(bab|chapter|bagian|part|section|pasal)\s+([0-9]+|[ivxlcdm]+)\b/i.test(trimmed) ||
    trimmed.split(/\s+/).length <= 10
  );
}

/**
 * Extracts structured paragraphs and clean formatted text from PDF.js page text content,
 * plus a filtered TTS version that strips running headers (PDF/chapter titles in page headers),
 * page numbers/footers, and optionally chapter headings.
 */
export function extractStructuredTextFromPdfPage(
  textContent: any,
  options: TextExtractionOptions = {}
): TextExtractionResult {
  const emptyResult: TextExtractionResult = {
    paragraphs: [],
    fullText: "",
    ttsParagraphs: [],
    ttsText: "",
    filteredHeaders: [],
    topLines: [],
    bottomLines: [],
    wordCount: 0,
  };

  if (!textContent || !Array.isArray(textContent.items) || textContent.items.length === 0) {
    return emptyResult;
  }

  const skipHeadersFooters = options.skipHeadersFooters ?? true;
  const skipChapterHeadings = options.skipChapterHeadings ?? false;
  const customIgnored = (options.customIgnoredLines || [])
    .map((s) => normalizeEdgeText(s))
    .filter((s) => s.length > 0);

  const items: RawTextItem[] = textContent.items.filter(
    (it: any): it is RawTextItem =>
      it &&
      typeof it.str === "string" &&
      Array.isArray(it.transform) &&
      it.transform.length >= 6
  );

  if (items.length === 0) {
    return emptyResult;
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
      const filteredHeaders: string[] = [];
      const ttsParagraphs = directParagraphs.filter((p, idx) => {
        const norm = normalizeEdgeText(p);
        if (customIgnored.some((ig) => norm === ig || norm.includes(ig))) {
          filteredHeaders.push(p);
          return false;
        }
        if (skipHeadersFooters && (idx === 0 || idx === directParagraphs.length - 1) && isStandalonePageNumber(p)) {
          filteredHeaders.push(p);
          return false;
        }
        if (skipChapterHeadings && isHeadingParagraph(p)) {
          filteredHeaders.push(p);
          return false;
        }
        return true;
      });
      const safeTtsParagraphs = ttsParagraphs.length > 0 ? ttsParagraphs : directParagraphs;
      return {
        paragraphs: directParagraphs,
        fullText,
        ttsParagraphs: safeTtsParagraphs,
        ttsText: safeTtsParagraphs.join("\n\n"),
        filteredHeaders,
        topLines: directParagraphs.slice(0, 2),
        bottomLines: directParagraphs.slice(-2),
        wordCount,
      };
    }
  }

  // 1 & 2. Assemble sorted lines
  const cleanLines = assembleLinesFromItems(items);
  if (cleanLines.length === 0) {
    return emptyResult;
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

  // 4. Full paragraphs for visual display & AI context
  const paragraphs = buildParagraphsFromLines(
    cleanLines,
    medianSpacing,
    baseLeftMargin,
    maxLineWidth,
    medianHeight
  );
  const fullText = paragraphs.join("\n\n");
  const wordCount = fullText.split(/\s+/).filter(Boolean).length;

  // 5. Filter running headers, chapter titles in page header, footers/page numbers for TTS
  const pageView = Array.isArray(options.pageView) && options.pageView.length >= 4 ? options.pageView : null;
  const minLineY = Math.min(...cleanLines.map((l) => l.y));
  const maxLineY = Math.max(...cleanLines.map((l) => l.y));
  const pageBottom = pageView ? Math.min(pageView[1], pageView[3]) : Math.max(0, minLineY - 50);
  const pageTop = pageView ? Math.max(pageView[1], pageView[3]) : maxLineY + 60;
  const pageHeight = Math.max(200, pageTop - pageBottom);

  const normDocTitle = normalizeDocTitle(options.docTitle);
  const neighborTopSet = new Set(
    (options.neighborTopTexts || [])
      .map((t) => stripEdgePageNumbers(t))
      .filter((t) => t.length >= 2)
  );
  const neighborBottomSet = new Set(
    (options.neighborBottomTexts || [])
      .map((t) => stripEdgePageNumbers(t))
      .filter((t) => t.length >= 2)
  );

  const matchesTitleOrNeighbor = (lineText: string, neighborSet: Set<string>): boolean => {
    const norm = normalizeEdgeText(lineText);
    const stripped = stripEdgePageNumbers(lineText);
    if (stripped.length >= 2 && neighborSet.has(stripped)) {
      return true;
    }
    if (normDocTitle.length >= 4 && stripped.length >= 4) {
      if (stripped === normDocTitle || normDocTitle.includes(stripped) || stripped.includes(normDocTitle)) {
        return true;
      }
    }
    if (norm.length >= 2 && customIgnored.some((ig) => norm === ig || norm.includes(ig))) {
      return true;
    }
    return false;
  };

  const filteredHeaders: string[] = [];
  const keptLines: AssembledLine[] = [];

  for (let i = 0; i < cleanLines.length; i++) {
    const line = cleanLines[i];
    const norm = normalizeEdgeText(line.text);

    // Always skip user-specified custom ignored phrases
    if (customIgnored.length > 0 && customIgnored.some((ig) => norm === ig || norm.includes(ig))) {
      filteredHeaders.push(line.text);
      continue;
    }

    if (skipHeadersFooters && cleanLines.length > 1) {
      const distFromTop = pageTop - line.y;
      const distFromBottom = line.y - pageBottom;
      const inTopZone = i <= 1 && distFromTop <= pageHeight * 0.16;
      const inBottomZone = i >= cleanLines.length - 2 && distFromBottom <= pageHeight * 0.15;

      const isShortLine = line.text.length <= 105 && line.width < maxLineWidth * 0.85;
      const endsWithSentencePunct = /[.?!…]["”’)]*\s*$/.test(line.text);
      const isChapterLabel = /^(bab|chapter|bagian|part|section|pasal)\s+([0-9]+|[ivxlcdm]+)\b/i.test(line.text);
      const isShortNonSentence = isShortLine && (!endsWithSentencePunct || isChapterLabel);

      if (inTopZone) {
        const nextLine = cleanLines[i + 1];
        const gapBelow = nextLine ? line.y - nextLine.y : 0;
        const hasLargeGapBelow = nextLine ? gapBelow >= Math.max(medianSpacing * 1.4, line.height * 1.65) : false;
        const isRightOrCenterAligned = line.x - baseLeftMargin >= 32;
        const isTopMarginEdge = distFromTop <= pageHeight * 0.095;

        const isHeader =
          isStandalonePageNumber(line.text) ||
          matchesTitleOrNeighbor(line.text, neighborTopSet) ||
          (isShortNonSentence && (hasLargeGapBelow || isRightOrCenterAligned || isTopMarginEdge));

        if (isHeader) {
          filteredHeaders.push(line.text);
          continue;
        }
      }

      if (inBottomZone) {
        const prevLine = cleanLines[i - 1];
        const gapAbove = prevLine ? prevLine.y - line.y : 0;
        const hasLargeGapAbove = prevLine ? gapAbove >= Math.max(medianSpacing * 1.4, line.height * 1.65) : false;
        const isBottomMarginEdge = distFromBottom <= pageHeight * 0.085;

        const isFooter =
          isStandalonePageNumber(line.text) ||
          matchesTitleOrNeighbor(line.text, neighborBottomSet) ||
          (isShortNonSentence && (hasLargeGapAbove || isBottomMarginEdge) && line.height <= medianHeight * 1.05);

        if (isFooter) {
          filteredHeaders.push(line.text);
          continue;
        }
      }
    }

    keptLines.push(line);
  }

  // Fallback: never return 0 kept lines if the whole page consisted only of title/header text
  const finalTtsLines = keptLines.length > 0 ? keptLines : cleanLines;
  let ttsParagraphs = buildParagraphsFromLines(
    finalTtsLines,
    medianSpacing,
    baseLeftMargin,
    maxLineWidth,
    medianHeight
  );

  if (skipChapterHeadings && ttsParagraphs.length > 1) {
    const bodyOnly = ttsParagraphs.filter((p) => {
      if (isHeadingParagraph(p)) {
        filteredHeaders.push(p);
        return false;
      }
      return true;
    });
    if (bodyOnly.length > 0) {
      ttsParagraphs = bodyOnly;
    }
  }

  const ttsText = ttsParagraphs.join("\n\n");

  return {
    paragraphs,
    fullText,
    ttsParagraphs,
    ttsText,
    filteredHeaders,
    topLines: cleanLines.slice(0, 2).map((l) => l.text),
    bottomLines: cleanLines.slice(-2).map((l) => l.text),
    wordCount,
  };
}
