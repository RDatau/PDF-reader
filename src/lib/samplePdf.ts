/**
 * Generates a clean, valid 4-page PDF document for immediate testing
 * of reading, text-to-speech, night mode, and voice conversation.
 */
export function generateSamplePdfArrayBuffer(): ArrayBuffer {
  const pagesContent = [
    {
      title: "The Art of Deep Reading in the Digital Age",
      subtitle: "Chapter 1: The Sanctuary of Quiet Attention",
      paragraphs: [
        "Reading is not merely the decoding of graphic symbols into verbal equivalents; it is an intimate communion between minds across centuries and geography. When we open a book or scroll through a well-crafted document, we invite another consciousness to inhabit our thoughts.",
        "In our modern accelerated environment, sustained concentration has become both a rare luxury and a profound competitive advantage. Deep reading trains the cognitive faculties to hold complex multidimensional ideas in working memory, fostering empathy, analytical rigor, and contemplative stillness.",
        "To cultivate deep reading, one must establish an environment free from notifications and visual clutter. Adjusting your lighting, shifting into a soothing night mode, and allowing text-to-speech narration can transform reading from an effortful chore into an effortless flow state.",
        "Try using the Read Aloud feature now with either Gemini Flash Voice or your device's native voice. Listen to the rhythm of the sentences while following the highlighted words.",
      ],
    },
    {
      title: "Night Mode and Visual Ergonomics",
      subtitle: "Chapter 2: Protecting Circadian Rhythms",
      paragraphs: [
        "Light is the primary zeitgeber—the external synchronizer that entrains the human biological clock. High-energy visible blue light, prevalent in standard digital displays, suppresses the natural production of melatonin in the pineal gland, signaling daylight to the brain even at midnight.",
        "Night reading modes mitigate this strain through deliberate contrast management. By shifting from glaring high-luminance white canvases to warm charcoal, deep slate, or amber sepia, the pupil can dilate naturally, reducing ocular fatigue and dry-eye symptoms during prolonged evening study sessions.",
        "In this reader, you can choose between four bespoke visual themes: Classic Light for bright daylight, Night Mode for pitch-dark environments, Sepia for warm ambient lamplight, and Midnight Slate for balanced modern contrast.",
        "Combine your preferred theme with the Screen Dimmer slider in the upper toolbar to dial in the exact optical luminance for your surroundings.",
      ],
    },
    {
      title: "Voice Interfaces and Dual-Code Learning",
      subtitle: "Chapter 3: The Power of Audio-Visual Processing",
      paragraphs: [
        "Cognitive psychologist Allan Paivio formulated Dual-Coding Theory, demonstrating that the human mind processes verbal information through two separate yet interconnected channels: auditory and visual. When both channels are engaged concurrently, memory retention and comprehension skyrocket.",
        "Listening to text read aloud while visually scanning the sentences reinforces syntactic structure, enhances vocabulary acquisition for non-native readers, and helps identify subtle emotional inflections that silent scanning might miss.",
        "With Gemini 3.1 Flash TTS, speech synthesis transitions from mechanical monotone to dynamic, expressive prose that breathes life into technical manuals, historical narratives, and academic research alike.",
        "You can pause, resume, adjust playback speed up to 2.0x, or switch between Gemini AI voices and offline device synthesis at any time.",
      ],
    },
    {
      title: "Interactive Inquiry & Live AI Dialogue",
      subtitle: "Chapter 4: Beyond Passive Consumption",
      paragraphs: [
        "The ultimate goal of reading is comprehension, critique, and integration. Passive readers let words wash over them; active readers question assumptions, demand evidence, and probe implications.",
        "Our built-in Live Voice Assistant powered by Gemini 3.1 Flash Live allows you to converse naturally about whatever page you are examining. Tap the microphone button in the toolbar to speak with the AI in real time.",
        "Ask questions like: 'What is the main argument of this chapter?', 'Can you summarize the circadian rhythm findings?', or 'Quiz me on Paivio\\'s dual-coding theory.'",
        "Your offline documents remain completely private and stored securely within your browser's local sandbox, ready whenever inspiration strikes.",
      ],
    },
  ];

  // Helper to escape PDF text
  const escapePdfText = (str: string) =>
    str.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  const objects: string[] = [];
  const addObject = (content: string): number => {
    objects.push(content);
    return objects.length; // 1-based index
  };

  // 1: Catalog
  // 2: Pages
  // 3: Font F1 (Helvetica)
  // 4: Font F2 (Helvetica-Bold)
  // Page objects & Content objects follow

  const fontRef1 = 3;
  const fontRef2 = 4;
  const pageRefs: number[] = [];

  // Placeholder indices
  addObject(""); // 1: Catalog
  addObject(""); // 2: Pages
  addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`); // 3
  addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`); // 4

  for (let i = 0; i < pagesContent.length; i++) {
    const data = pagesContent[i];
    let stream = "BT\n";

    // Header Title
    stream += `/F2 20 Tf 50 730 Td (${escapePdfText(data.title)}) Tj\n`;
    // Subtitle
    stream += `/F2 13 Tf 0 -26 Td (${escapePdfText(data.subtitle)}) Tj\n`;

    // Horizontal decorative line
    // Paragraphs
    let currentYOffset = -35;
    for (const p of data.paragraphs) {
      // Split paragraph into lines of ~68 characters
      const words = p.split(" ");
      let currentLine = "";
      const lines: string[] = [];

      for (const w of words) {
        if ((currentLine + " " + w).trim().length > 68) {
          lines.push(currentLine.trim());
          currentLine = w;
        } else {
          currentLine += (currentLine ? " " : "") + w;
        }
      }
      if (currentLine) lines.push(currentLine.trim());

      stream += `/F1 11 Tf 0 ${currentYOffset} Td\n`;
      currentYOffset = -18;
      for (let j = 0; j < lines.length; j++) {
        if (j > 0) stream += `0 -16 Td\n`;
        stream += `(${escapePdfText(lines[j])}) Tj\n`;
      }
      currentYOffset = -22;
    }

    // Page footer
    stream += `0 -40 Td /F1 9 Tf (Page ${i + 1} of ${pagesContent.length} - Offline PDF Reader & AI Assistant) Tj\n`;
    stream += "ET\n";

    const streamLen = stream.length;
    const contentObjIdx = addObject(`<< /Length ${streamLen} >>\nstream\n${stream}endstream`);
    const pageObjIdx = addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents ${contentObjIdx} 0 R /Resources << /Font << /F1 ${fontRef1} 0 R /F2 ${fontRef2} 0 R >> >> >>`
    );
    pageRefs.push(pageObjIdx);
  }

  // Update 1: Catalog
  objects[0] = `<< /Type /Catalog /Pages 2 0 R >>`;

  // Update 2: Pages
  const kidsStr = pageRefs.map((ref) => `${ref} 0 R`).join(" ");
  objects[1] = `<< /Type /Pages /Kids [${kidsStr}] /Count ${pageRefs.length} >>`;

  // Build final PDF string
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += `0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    const offsetStr = String(offsets[i]).padStart(10, "0");
    pdf += `${offsetStr} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  // Convert string to ArrayBuffer
  const buffer = new ArrayBuffer(pdf.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < pdf.length; i++) {
    view[i] = pdf.charCodeAt(i) & 0xff;
  }
  return buffer;
}
