/** Parsers for the free-text item and contact boxes on the job form. */

/** "2 x Skypanel S60 (0.25 m3, 22 kg)" per line. */
export function parseItemLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(\d+)\s*[x×]\s*([^()]+?)\s*(?:\((.*)\))?\s*$/i);
      const quantity = m ? Number(m[1]) : 1;
      const name = m ? m[2].trim() : line.replace(/\(.*\)$/, "").trim();
      const extra = m?.[3] ?? "";
      const vol = extra.match(/([\d.]+)\s*m3/i);
      const wt = extra.match(/([\d.]+)\s*kg/i);
      return { name, quantity, volumeM3: vol ? Number(vol[1]) : null, weightKg: wt ? Number(wt[1]) : null, isService: /\b(delivery|collection|transport|labour|service)\b/i.test(name) };
    });
}

/** "Name, phone, email, role" per line. */
export function parseContactLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", phone = "", email = "", role = ""] = line.split(",").map((s) => s.trim());
      return { name, phone, email, role: role || undefined };
    })
    .filter((c) => c.name);
}

