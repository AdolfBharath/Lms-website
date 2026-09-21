import { readFile } from "node:fs/promises";

const courseImages = new Map(Object.entries({
  "programming-in-python": "course/1. Technology & Software Development/code.jpg",
  "programming-in-java": "course/1. Technology & Software Development/chris-ried-ieic5Tq8YMk.jpg",
  "dsa-with-python": "course/1. Technology & Software Development/boitumelo-mZ-vSMus7zM.webp",
  "software-engineering": "course/1. Technology & Software Development/christopher-gower-m_HRfLhgABo.jpg",
  "front-end-web-development": "course/1. Technology & Software Development/fahim-muntashir-v-FOvoL3o.webp",
  "full-stack-web-development": "course/1. Technology & Software Development/premium_photo-1720287601920-.avif",
  "senior-sde-interview-prep": "course/1. Technology & Software Development/fotis-fotopoulos-6sAl6aQ4OWI.jpg",
  "full-stack-developer-portfolio": "course/1. Technology & Software Development/premium_photo-1733266868.avif",
  "android-development": "course/1. Technology & Software Development/hossain-khan-UP3SMQSoNsM.webp",
  "artificial-intelligence": "course/2. Artificial Intelligence & Data Science/ai.jpg",
  "artificial-intelligence-and-machine-learning": "course/2. Artificial Intelligence & Data Science/carlos-gil-AsxOJcsaR4g.jpg",
  "ai-agentic-and-generative": "course/2. Artificial Intelligence & Data Science/clarisse-croset--tikpxRBcsA.webp",
  "machine-learning": "course/2. Artificial Intelligence & Data Science/steve-a-johnson-WhAQMsdRKMI.jpg",
  "data-science": "course/2. Artificial Intelligence & Data Science/ji.avif",
  "data-engineering-with-sql-and-cloud": "course/2. Artificial Intelligence & Data Science/jonathan-kemper-MMUzS5Qzuus.webp",
  "data-analytics-with-power-bi": "course/2. Artificial Intelligence & Data Science/yhn.webp",
  "data-analysis": "course/2. Artificial Intelligence & Data Science/nnii.avif",
  "cyber-security-and-ethical-hacking": "course/3. Cyber Security, Cloud & DevOps/premium_photoegsd.avif",
  "cloud-computing": "course/3. Cyber Security, Cloud & DevOps/glen-carrie-Ls1Npp-C-P8.webp",
  "devops": "course/3. Cyber Security, Cloud & DevOps/kevin-horvat-Pyjp2zmxuLk.webp",
  "internet-of-things-iot": "course/4. Engineering & Emerging Technologies/premium_photo-1681010317789.avif",
  "iot-and-robotics": "course/4. Engineering & Emerging Technologies/ray-rui-SyzQ5aByJnE.webp",
  "embedded-systems": "course/4. Engineering & Emerging Technologies/jeswin-thomas--Cm7hnp4WOg.webp",
  "vlsi": "course/4. Engineering & Emerging Technologies/adi-goldstein-EUsVwEOsblE.webp",
  "robotics": "course/4. Engineering & Emerging Technologies/alex-knight-2EJCSULRwC8-.webp",
  "hybrid-electric-vehicle": "course/4. Engineering & Emerging Technologies/thisisengineering-omrpeqLz6Po.webp",
  "nanotechnology": "course/4. Engineering & Emerging Technologies/marius-masalar-CyFBmFEsytU.webp",
  "digital-marketing": "course/5. Business, Finance & Marketing/social-sail-Uno9TGPs4pc.webp",
  "human-resource-management": "course/5. Business, Finance & Marketing/scott-graham-5fNmWej4tAA.webp",
  "finance": "course/5. Business, Finance & Marketing/anne-nygard-x07ELaNFt34.webp",
  "startup-and-entrepreneurship": "course/5. Business, Finance & Marketing/lala-azizli-OFZUaeYKP3k.webp",
  "business-analysis": "course/5. Business, Finance & Marketing/mirea-mazzei-d1Lp7juy6JU.webp",
  "operation-and-supply-chain-management": "course/5. Business, Finance & Marketing/shutter-speed-BQ9usyzHx_w.jpg",
  "e-commerce-operations-management": "course/5. Business, Finance & Marketing/premium_photo-1681488262364.avif",
  "product-and-project-management": "course/5. Business, Finance & Marketing/photo-1590103514966.avif",
  "stock-marketing": "course/5. Business, Finance & Marketing/premium_photo-1663040328859.avif",
  "ui-ux": "course/6. Design & Creative Arts/ux-store-jJT2r2n7lYA.webp",
  "graphic-designing": "course/6. Design & Creative Arts/premium_photo-1661310081873-.avif",
  "autocad": "course/6. Design & Creative Arts/grove-brands-RDfZRXZH2Kc.webp",
  "car-design": "course/6. Design & Creative Arts/hyundai-motor-group-V1DFo8C4JPA.jpg",
  "medical-coding": "course/7. Healthcare & Human Sciences/accuray-MFSEP2g4YS0.webp",
  "clinical-trials-and-research": "course/7. Healthcare & Human Sciences/piron-guillaume-y5hQCIn1c6o.webp",
  "psychology": "course/7. Healthcare & Human Sciences/psychology.webp",
  "counselling-psychology-practice": "course/7. Healthcare & Human Sciences/metaphor-bipolar-disorder-mind-mental-dou.webp",
  "clinical-psychology-basics": "course/7. Healthcare & Human Sciences/importance-of-.webp",
  "rehabilitation-psychology": "course/7. Healthcare & Human Sciences/premium_photo-1699387204388.avif"
}));

const aliasBySlug = new Map([
  ["iot", "internet-of-things-iot"],
  ["internet-of-things", "internet-of-things-iot"],
  ["ui-and-ux", "ui-ux"],
  ["stock-marketing-1", "stock-marketing"],
  ["cyber-security", "cyber-security-and-ethical-hacking"],
  ["data-structures-and-algorithms", "dsa-with-python"],
  ["embedded-system", "embedded-systems"],
  ["generative-ai", "ai-agentic-and-generative"]
]);

const env = await loadEnv();
const courses = await request("courses?select=id,title,thumbnail_url,image_url,deleted_at&order=title.asc");
const report = { scanned: courses.length, updated: 0, unchanged: 0, skippedDeleted: 0, missingImageMap: [] };

for (const course of courses) {
  if (course.deleted_at) {
    report.skippedDeleted += 1;
    continue;
  }
  const slug = canonicalSlug(course.title);
  const image = courseImages.get(slug);
  if (!image) {
    report.missingImageMap.push(String(course.title || course.id || "Untitled course"));
    continue;
  }
  if (course.thumbnail_url === image && course.image_url === image) {
    report.unchanged += 1;
    continue;
  }
  await request(`courses?id=eq.${encodeURIComponent(course.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ thumbnail_url: image, image_url: image })
  });
  report.updated += 1;
}

console.log(JSON.stringify(report, null, 2));

async function loadEnv() {
  const source = await readFile(".env.local", "utf8");
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  const url = values.SUPABASE_URL || values.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = values.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Missing Supabase URL or service-role key in .env.local");
  return { url: url.replace(/\/$/, ""), serviceKey };
}

async function request(path, options = {}) {
  const response = await fetch(`${env.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`Supabase request failed: ${response.status} ${await response.text()}`);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function canonicalSlug(value) {
  const slug = slugify(value);
  return aliasBySlug.get(slug) || slug;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\(iot\)/g, "iot")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
