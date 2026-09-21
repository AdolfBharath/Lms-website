const SUPABASE_URL = "https://agrzjwnsapbanbvgbwkh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_jrJRXGYEYpixwOAUS6kIWA_ccT4jZs6";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@jenovate.in";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Temp@12345";
const MENTOR_EMAIL = process.env.MENTOR_EMAIL || "mentor1@gmail.com";
const STUDENT_EMAIL = process.env.STUDENT_EMAIL || "student1@gmail.com";

function authHeaders(token = "") {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json"
  };
}

async function fetchSupabase(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.error_description || data?.error || response.statusText);
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

async function login(email, password) {
  const data = await fetchSupabase("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email, password })
  });
  return data.access_token;
}

function filterEq(column, value) {
  return `${encodeURIComponent(column)}=eq.${encodeURIComponent(value)}`;
}

async function selectRows(token, table, query = "", select = "*") {
  const suffix = query ? `&${query}` : "";
  return fetchSupabase(`/rest/v1/${table}?select=${encodeURIComponent(select)}${suffix}`, {
    headers: authHeaders(token)
  });
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""));
}

function missingColumn(error) {
  const message = String(error?.message || "");
  const quoted = message.match(/'([^']+)' column|column '([^']+)'|Could not find the '([^']+)' column/i);
  if (quoted) return quoted[1] || quoted[2] || quoted[3] || "";
  return message.match(/column ([a-zA-Z0-9_]+) does not exist/i)?.[1] || "";
}

async function writeFirstWorking(token, table, payload, id = "", select = "*", optionalKeys = []) {
  let writePayload = compact(payload);
  let keys = [...optionalKeys];
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const path = id
        ? `/rest/v1/${table}?${filterEq("id", id)}&select=${encodeURIComponent(select)}`
        : `/rest/v1/${table}?select=${encodeURIComponent(select)}`;
      const data = await fetchSupabase(path, {
        method: id ? "PATCH" : "POST",
        headers: { ...authHeaders(token), Prefer: "return=representation" },
        body: JSON.stringify(writePayload)
      });
      return Array.isArray(data) ? data[0] : data;
    } catch (error) {
      lastError = error;
      const missing = missingColumn(error);
      const key = missing || keys.find((item) => Object.hasOwn(writePayload, item));
      if (!key) throw error;
      delete writePayload[key];
      keys = keys.filter((item) => item !== key);
    }
  }
  throw lastError || new Error(`Unable to write ${table}.`);
}

const driveLink = (id) => `https://drive.google.com/file/d/${id}/view?usp=sharing`;
const lecture = (number, id, size, label = String(number)) => ({ number, label, id, size, drive_link: driveLink(id) });

const rawLectures = {
  ai: [
    lecture(1, "16Hvh3Of_4NAHnW9Du3WnCxM-Vv-KrV3L", 169640240),
    lecture(2, "1GSVLlxAfjb_gvm9H90pwlmmQ13NVmKN4", 137730619),
    lecture(3, "1woKD9ovah9rbt0XSainuQFZwurKKQGkU", 78232887, "3A"),
    lecture(3.5, "15r6NQRegje0v-ocFn6nRmJ3fWVhXn_EL", 46262840, "3B"),
    lecture(4, "1aAQG-33PYSGVnx8zjv1M-Ja0JDQGcQej", 114824816),
    lecture(5, "1hanksNoF-CKY9vrUVLRBzO3U-yEJ89HQ", 112127940),
    lecture(6, "1_pl3er_YFf_xvRTRXDJSDiL5k5wMCJhV", 203200934),
    lecture(7, "16ZMJ0i_92oyxWGLCJ0jJI4rB9iengAeJ", 168047085),
    lecture(8, "1PWCeLPfH9jdOQYB88GqENcHmNCUX8Lck", 219982938),
    lecture(9, "14wBBmeJuQG8sg2QrfqE6-INSrR15DgCw", 233705728),
    lecture(10, "1TTnHg4chYQw1wZml4sP_WKZmw2ZL7S9t", 127670800),
    lecture(11, "1sTnhG0gCixft8fNNNJcOkeHRFM4t_Hse", 162920412),
    lecture(12, "1zhQoYPU-jlDsQz8SII7TtA91OOUjZDj-", 176726824),
    lecture(13, "10O6nmPsDe6bDFEFWgd-GQ2GbsAZeV4Qn", 154490954),
    lecture(14, "1zRwxRelJcP3NXmsTk65RSgOGBAKkOwAO", 105602288),
    lecture(15, "1RtERF1X8gZnK1hfemfp-B5WVsAVwTpaU", 159143675),
    lecture(16, "1lMN11z5IPlNi0r_aOIA416rb_kxzJ_nQ", 176131369),
    lecture(17, "1Rtcx-iXvGw5c8h6Sc8Jg0DDb1zYs5-Fd", 111778047),
    lecture(18, "1hg8fsphkhP3W0wUpcgfwwfR5C1tvPOBy", 164407493),
    lecture(19, "135_MBagqGJiTs0bGUkq_MDvVXkK3iBqi", 141850006),
    lecture(20, "1zMsyhwOttsKzsU0eFy-lYtx2JTvdsKFN", 116159612),
    lecture(21, "1Yy0-Me_26szEOZryiA41zVvVi546sUaT", 124207819),
    lecture(22, "1IZ68j61sJTSvUSIz3VVgksoTjg1bayDR", 159294768),
    lecture(23, "1oemX9DhqYcAtFRShZ9swQWrMHMW-UOq8", 118013914),
    lecture(24, "101eQBclmbZ2eogTuzh5zINjSaBKvRCdw", 108035292),
    lecture(25, "1uQeUyEPfVom5zwJIiLbzXQsQh5n1Iwa2", 205624956),
    lecture(26, "1_r-02LZqGYCEIDfEvjn1lnYRZndOo4J0", 198410214)
  ],
  autocad: [
    lecture(1, "1UvKwkfJruYM7ygrynTlh3wRLZJvdT_xw", 58182438),
    lecture(2, "10orW5hpfZBZhvA3jTsEnJ46s5Rz6ENPj", 82972385),
    lecture(3, "1P5EOJ98RidPAjS3T0Pvy7_aM7Xs0iLkA", 96765574),
    lecture(4, "1Gq-a4mv6bwT9mK-MNXNVA67VR5dN6ads", 78959182),
    lecture(5, "1wFz7_UM1q5ajWBqf02Q_ytTr38ixo-wV", 64301354),
    lecture(6, "194tW5s-4HgK_dtqGuXGAUf3AQ-23cnvX", 72035423),
    lecture(7, "1VrDWYvXFuU_f83U4Jt5lIuosND61WG5c", 82983981),
    lecture(8, "1LoxJSK3hB2t0SsRyOwTMbTX-nWRnEIUu", 88716076),
    lecture(9, "1cw73lTgiMYfgDApSk4V3UCqSxplbwiqO", 92226097),
    lecture(10, "18foucp5oc3SZPyau_KkG4vWrXNbRnA1o", 99048805),
    lecture(11, "16V8-5hurFj1DV9c82LJ3hFJApCs6fSVW", 98637183),
    lecture(12, "12OVwPU7LIwvZtA5vMi_LyXdpPl7nptS4", 82995477),
    lecture(13, "1WTAC1yr6bLYxYNOy-AgK1XJ45YScu97_", 88543637)
  ],
  ba: [
    lecture(1, "1XiKJbkXetF2e2yhRYbNQ_RmFxx9D2CRp", 88690954),
    lecture(2, "1D87RG_UH5dBMTplzUiJYuVTQTPKip-4U", 65700869),
    lecture(3, "1fQSCqv603qjkAFuwMlbGOw5JT3ZXsNqd", 76420432),
    lecture(4, "1UCz4qxuwrdCWvh2fGUzyEFPM0Fy-ML-z", 64188204),
    lecture(5, "1GNGGZyjKw6gY7624M3xpRjaXxH0vWZZ5", 53404180),
    lecture(6, "1rCBXKoM5wmbKsDwMCylmM1f9VPe5P_Zd", 57332531),
    lecture(7, "15meVqa78SDb8mlU3iV2MMcaMR97Gz-e4", 319962866),
    lecture(8, "15v7V18BFm2a3WUMKw4v_-RgtlScBtMp2", 79478704),
    lecture(9, "1PKilb8H1sMaBuzItkqa4N8yQN19Q1nHU", 127420512),
    lecture(10, "15j4cQsEzz2LrMjssIaBj9ayaSG1YnW_m", 55146487),
    lecture(11, "1PRPH12x6tJiTM0WA3GN6Y_UVfAQ7gnhv", 111302270),
    lecture(12, "1HazraUDj5cO0Z4ZrISn6-jyiFAWFBZHa", 84711064),
    lecture(13, "1wv-XxkMuo064pgswF4VRaX8FBr0OTZrS", 80834737),
    lecture(14, "1lVB9DwEftNY_SqSnj9ILlsWCX28eZguD", 140026985),
    lecture(15, "15fIzpqTQ_NaJBcGotS1jzPVqNB0n1lGY", 96119278),
    lecture(16, "18jffMJV68RstaUwgduQurNe03KVhqbjz", 164820941),
    lecture(17, "1dLjHQe8CULVkCgLSnak0enEVseGVFXbe", 170201902),
    lecture(18, "1xeSAWmIr-LErmAEO7HLrDVK8VMEgEmwq", 71928040),
    lecture(19, "1FGNDb1g6qmkaM5nmNKN99deZ2oIMFxQA", 76057443),
    lecture(20, "1eK-by9PoPSfXU3HibfNZoOqhiUmv2gz0", 49794581),
    lecture(21, "1v71qRY87TqnVC_zZzNEdexZUYXP03590", 90572877),
    lecture(22, "16tNcgwsqw6jJuXs3VV-C8EWV_g6QWDXD", 90572877),
    lecture(23, "1OsgB5sOJ7DnYwOd53Kxo2MtEZxVCrd6D", 94399864),
    lecture(24, "1N8OZYUDCv093bAkhSqfLNbu1OZn_BZLi", 77107034),
    lecture(25, "1CFVTi0xf3IoCC5Xm17yCV9mYNkTEllRQ", 61082900),
    lecture(26, "1dA8h6-uSrxkCLOKxhTM6L4292idY0WDm", 73623352),
    lecture(27, "1FViOuEPX-xhn7QtddeEnp3vYJwcKQPsg", 92385494)
  ],
  cyber: [
    lecture(1, "1KgTQyf0-gKCbbiiGwI78VqDQb_S-dm_f", 91430554),
    lecture(2, "16q0tm34ddn2fg1Qxiux2mQPRr2XxrqM8", 121029463),
    lecture(3, "1IzHfn8Nhb3TFPH6W0b9QltJcf-go9P-p", 131984215),
    lecture(4, "1dO8NFqkcg1AoqDtXwEpEjSwlkKvmFwQW", 101466615),
    lecture(5, "12jGtn9TjmvgvsbM9Ls0MBeyWhWZKvkK5", 89216113),
    lecture(6, "1abEQ-91xpiQTqekMDch7WlJUqHz-5yrn", 17211512),
    lecture(7, "1RioEBWhdT-kmjaL3QxGL6p4DsDc4pNo6", 83613775),
    lecture(8, "1OZBoRKRGzp1eUJyPzJHVdCHchhK-1eeV", 119866356),
    lecture(9, "1kCjfvaNyGtp9_twnWcc9b3Z12U0dNX_Z", 98358008),
    lecture(10, "1r_Juiac036ov1z8CYnUSttpimghd3y3A", 70017183),
    lecture(11, "16jkBa9POWGxXr-hHTCAlDNnsVw5n4T6W", 121342664),
    lecture(12, "1j9cUXOmAeFM4sYnyt2f0Bumd_qpRnZvm", 63822553),
    lecture(13, "1KZWxOXbM_-WP6voqSPGPcR3iJslRUSQt", 85566752),
    lecture(14, "1sRUd-X7xIGP4g4qg5MeGtimUnaTqt9ZD", 101599267),
    lecture(15, "1oBCfOK6YqH3GUujRuqjeS1IiRMKBWPQt", 66148320),
    lecture(16, "1YaS01Q8dy9UJBBP_mFAzJwG-HZCSORYr", 71509145),
    lecture(17, "1V4d0zMDU8Sp3udvVv5gI2VdvflufNPdC", 99991067),
    lecture(18, "1DbyDEkv16Sd9hXkqssin4B-4QEPkJtwn", 110593787),
    lecture(19, "1hRtm3oMPJ4DGgjJpNEaLfz1qt6fbuBkc", 64313213)
  ],
  hrm: [
    lecture(1, "1JBHXBiFR8KpFBBe95_O0YEGuJugZ59kV", 50218314),
    lecture(2, "13ySDMeVgQs68InmHRVaIJsk1h4-SMd1V", 55707659),
    lecture(3, "1fetkLK-ZQcP-Iv1M2IoSoNyd4uiQfZKY", 52399935),
    lecture(4, "14xOshhoXO-zGdbcuWWoFB_rRrgvfECCg", 46735886),
    lecture(5, "1p4tOHztV4JJ0uTMYJ0J2fr-aQRggbUJZ", 52385815),
    lecture(6, "15xMxjySnXCgb7P9wnBIMy3ZJkE7q6KGE", 52805706),
    lecture(7, "1VvobeorE1omScMz_-Ky_f5sPTxaQFHkw", 53088039),
    lecture(8, "16-ePhczXfxnjTUtfemLHJ_mxBe9FPBUp", 45525882),
    lecture(9, "1zypEb89jS6mQ4evgVIS8585uSE4ppFp2", 38061882),
    lecture(10, "1SpFKfeBP_wnbOIdwThOV1sRITUPxgDro", 50938960),
    lecture(11, "1o1cSJMz4RRKqPLEZxFuteVWOSFByJ8_b", 49564089),
    lecture(12, "1-RgDOqn6L_qsotmn5il1aLrGw3uEBve2", 53410726),
    lecture(13, "1g6C8U9MEFBNADZwtohqCgw2nTntIpiDu", 47814547),
    lecture(14, "1wu-mrzPXPQkg0s5aXEPxg_J41msrWZCN", 56151932),
    lecture(15, "1nUigEiCCaJLL9umHcNlrrNkhfLUDBxNB", 65435010),
    lecture(16, "1CRAip3-dwYJPK1iYx_rg7DbJsXe7oSRv", 47385140),
    lecture(17, "1LQ9vBtYlY99k4SzYLtm71lR4QbKHNCKX", 54270057),
    lecture(18, "1SuA9l4hh7rNe4SDjlN70_qgmwjeHzIMv", 52664624),
    lecture(19, "1ZjkIrqt28Isf5QRWXSi-oqrf-EX91_KA", 52219106)
  ]
};

const courseSpecs = [
  {
    key: "ai",
    title: "Artificial Intelligence and Machine Learning",
    lookupTitles: ["Artificial Intelligence"],
    category: "Artificial Intelligence & Data Science",
    thumbnail_url: "course/2. Artificial Intelligence & Data Science/ai.webp",
    price: 7999,
    difficulty: "Beginner to Intermediate",
    description: "Build a strong AI foundation with guided video lessons, practical checkpoints, module quizzes, and a final assessment that connects core AI ideas to real product and workplace use cases.",
    lessonFocus: [
      "AI foundations and everyday intelligent systems",
      "intelligent agents, goals, and environments",
      "problem formulation for AI solutions",
      "AI use cases across products and operations",
      "state space search and decision paths",
      "uninformed and informed search strategies",
      "logic-based reasoning for AI systems",
      "knowledge representation and inference",
      "machine learning workflow and datasets",
      "supervised learning and prediction tasks",
      "feature selection and model inputs",
      "training, validation, and testing",
      "model performance and generalization",
      "neural network building blocks",
      "layers, weights, and activation flow",
      "training loops and error reduction",
      "deep learning patterns for complex data",
      "optimization and practical tuning",
      "natural language processing basics",
      "computer vision and image-based AI",
      "embeddings and semantic similarity",
      "generative AI concepts and prompt quality",
      "AI product thinking and human review",
      "bias, fairness, and responsible AI",
      "AI deployment planning",
      "monitoring AI systems after launch",
      "capstone roadmap for an AI/ML portfolio project"
    ],
    modules: [
      ["Foundation & AI Thinking", [1, 4], ["AI definition", "intelligent agents", "problem solving", "real-world AI use cases"]],
      ["Search, Logic & Knowledge Representation", [5, 8], ["search strategies", "state spaces", "logic", "knowledge representation"]],
      ["Machine Learning Foundations", [9, 13], ["training data", "supervised learning", "model evaluation", "features", "generalization"]],
      ["Neural Networks & Deep Learning", [14, 18], ["neurons", "layers", "training loops", "deep learning", "optimization"]],
      ["NLP, Vision & Generative AI", [19, 23], ["natural language processing", "computer vision", "embeddings", "generative AI", "prompts"]],
      ["Responsible AI, Deployment & Capstone", [24, 27], ["bias", "ethics", "deployment", "monitoring", "capstone planning"]]
    ]
  },
  {
    key: "autocad",
    title: "AutoCAD",
    category: "Design & Creative Arts",
    thumbnail_url: "course/6. Design & Creative Arts/hyundai-motor-group-V1DFo8C4JPA.jpg",
    price: 6999,
    difficulty: "Beginner Friendly",
    description: "Learn AutoCAD from setup to clean professional drawings, with focused lessons on precision drafting, editing, layers, annotation, plotting, and a final skills quiz.",
    lessonFocus: [
      "AutoCAD interface, workspace, and drawing setup",
      "units, coordinates, and navigation control",
      "basic drawing commands for clean geometry",
      "object snaps and precision drafting habits",
      "modify tools for editing drawing elements",
      "trim, extend, offset, and construction accuracy",
      "layer setup and drawing organization",
      "dimensions and annotation standards",
      "blocks and reusable drawing components",
      "clean drafting workflow for project sheets",
      "layouts, model space, and paper space",
      "viewports, scaling, and plot setup",
      "final drawing review and professional output"
    ],
    modules: [
      ["Interface, Setup & Drawing Basics", [1, 3], ["workspace setup", "units", "navigation", "line tools", "drawing basics"]],
      ["Precision Drafting & Editing Tools", [4, 6], ["object snaps", "modify tools", "trim", "offset", "accurate drafting"]],
      ["Layers, Annotation & Blocks", [7, 10], ["layers", "dimensions", "text annotation", "blocks", "drawing organization"]],
      ["Layouts, Plotting & Practical Workflow", [11, 13], ["layouts", "viewports", "plot settings", "drawing review", "delivery workflow"]]
    ]
  },
  {
    key: "ba",
    title: "Business Analysis",
    category: "Business, Finance & Marketing",
    thumbnail_url: "course/5. Business, Finance & Marketing/scott-graham-5fNmWej4tAA.webp",
    price: 7999,
    difficulty: "Beginner to Intermediate",
    description: "Master the business analyst workflow from stakeholder discovery to requirements, process mapping, agile delivery, data-backed decisions, and change-ready final recommendations.",
    lessonFocus: [
      "business analyst role and project value",
      "stakeholder types and communication needs",
      "business goals, problems, and outcomes",
      "scope definition and project context",
      "elicitation methods for real requirements",
      "interviews, workshops, and question design",
      "BRD structure and business requirements",
      "FRD structure and functional requirements",
      "acceptance criteria and requirement quality",
      "process mapping fundamentals",
      "gap analysis and current-state review",
      "root cause analysis for business problems",
      "workflow improvement and future-state design",
      "agile mindset for business analysts",
      "writing clear user stories",
      "backlog refinement and prioritization",
      "solution evaluation and validation",
      "stakeholder sign-off and change control",
      "data analysis for business decisions",
      "KPIs and success metrics",
      "dashboard and report interpretation",
      "insight storytelling for stakeholders",
      "decision support and recommendation framing",
      "strategy alignment for BA work",
      "change management basics",
      "presentation and communication of findings",
      "capstone BA case study and final recommendation"
    ],
    modules: [
      ["BA Role, Stakeholders & Business Context", [1, 4], ["business analyst role", "stakeholder mapping", "business goals", "problem framing"]],
      ["Requirements Elicitation & Documentation", [5, 9], ["elicitation", "requirements", "BRD", "FRD", "acceptance criteria"]],
      ["Process Mapping & Analysis Techniques", [10, 13], ["process maps", "gap analysis", "root cause analysis", "workflow improvement"]],
      ["Agile, User Stories & Solution Evaluation", [14, 18], ["agile", "user stories", "backlog", "solution evaluation", "prioritization"]],
      ["Data, Reporting & Decision Support", [19, 23], ["data analysis", "dashboards", "KPIs", "reporting", "decision support"]],
      ["Strategy, Change & Capstone Practice", [24, 27], ["strategy alignment", "change management", "communication", "capstone", "recommendation"]]
    ]
  },
  {
    key: "cyber",
    title: "Cyber Security",
    category: "Cyber Security, Cloud & DevOps",
    thumbnail_url: "course/3. Cyber Security, Cloud & DevOps/glen-carrie-Ls1Npp-C-P8.webp",
    price: 7999,
    difficulty: "Beginner to Intermediate",
    description: "Build a practical cyber security foundation across threats, networks, scanning, access control, web risks, incident response, and a final security-readiness assessment.",
    lessonFocus: [
      "cyber security fundamentals and threat landscape",
      "CIA triad, security goals, and risk thinking",
      "network basics for security analysis",
      "IP addressing, ports, and protocols",
      "common attacks and attacker workflow",
      "security tools setup and lab orientation",
      "network scanning and service discovery",
      "vulnerability identification workflow",
      "password, authentication, and access risks",
      "malware concepts and social engineering",
      "web application security basics",
      "OWASP risks and secure validation",
      "firewalls, VPNs, and perimeter defense",
      "logging, monitoring, and detection",
      "incident response process",
      "security policies and compliance basics",
      "hardening endpoints and accounts",
      "security reporting and remediation planning",
      "final cyber security project review"
    ],
    modules: [
      ["Security Foundations & Risk Thinking", [1, 4], ["CIA triad", "threat landscape", "network basics", "risk thinking"]],
      ["Scanning, Vulnerabilities & Access Risks", [5, 9], ["attacker workflow", "security tools", "network scanning", "vulnerability discovery", "authentication risks"]],
      ["Web Security, Defense & Monitoring", [10, 14], ["malware", "social engineering", "web security", "OWASP risks", "firewalls", "monitoring"]],
      ["Incident Response, Hardening & Reporting", [15, 19], ["incident response", "policies", "endpoint hardening", "remediation reports", "security project"]]
    ]
  },
  {
    key: "hrm",
    title: "Human Resource Management",
    category: "Business, Finance & Marketing",
    thumbnail_url: "course/5. Business, Finance & Marketing/kelly-sikkema-xoU52jUVUXA.webp",
    price: 6999,
    difficulty: "Beginner Friendly",
    description: "Learn the HR workflow from workforce planning and hiring to onboarding, performance, compensation, employee relations, compliance, and people-operations strategy.",
    lessonFocus: [
      "HRM role and people operations overview",
      "workforce planning and HR objectives",
      "job analysis and role clarity",
      "recruitment channels and hiring funnel",
      "screening resumes and shortlisting candidates",
      "interview planning and selection methods",
      "onboarding experience and documentation",
      "training needs and employee development",
      "performance management cycles",
      "feedback, appraisal, and goal setting",
      "compensation structure and payroll basics",
      "benefits, rewards, and retention drivers",
      "employee engagement and workplace culture",
      "employee relations and conflict handling",
      "HR policies and workplace compliance",
      "HR analytics and people metrics",
      "talent management and succession planning",
      "HR strategy for business growth",
      "final HRM case study and action plan"
    ],
    modules: [
      ["HR Foundations & Workforce Planning", [1, 4], ["HRM role", "workforce planning", "job analysis", "recruitment funnel"]],
      ["Hiring, Onboarding & Development", [5, 8], ["resume screening", "interviews", "onboarding", "training needs"]],
      ["Performance, Rewards & Engagement", [9, 13], ["performance management", "appraisal", "compensation", "benefits", "employee engagement"]],
      ["Employee Relations, Compliance & HR Strategy", [14, 19], ["employee relations", "HR policies", "compliance", "HR analytics", "talent strategy", "case study"]]
    ]
  }
];

function estimateMinutes(size) {
  const mb = size / 1024 / 1024;
  return Math.max(18, Math.min(80, Math.round(mb / 3)));
}

function minutesToDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours ? `${hours}:${String(mins).padStart(2, "0")}:00` : `${mins}:00`;
}

function totalDurationLabel(minutes, lessons) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `Estimated ${hours} hours ${mins} minutes / ${lessons} video lessons + final quiz`;
}

function lessonsFor(spec, range, topics) {
  const [start, end] = range;
  const courseLectures = rawLectures[spec.key].slice().sort((a, b) => a.number - b.number);
  return rawLectures[spec.key]
    .filter((item) => item.number >= start && item.number <= end)
    .map((item, index) => {
      const globalIndex = courseLectures.findIndex((lectureItem) => lectureItem.id === item.id);
      const focus = spec.lessonFocus?.[globalIndex] || topics[index % topics.length];
      return {
        id: `${spec.key}-lesson-${String(item.label).toLowerCase()}`,
        title: `Lecture ${item.label}: ${focus}`,
        description: `This session focuses on ${focus}. Learners should watch for the main workflow, note the key decisions shown in the recording, and revise the related quiz points before moving ahead.`,
        content_type: "video",
        duration: minutesToDuration(estimateMinutes(item.size)),
        order_index: index + 1,
        video_drive_link: item.drive_link,
        drive_link: item.drive_link
      };
    });
}

const questionTemplates = [
  (topic, title) => [`In ${title}, what is the best way to start working with ${topic}?`, "Connect it to a clear learner goal or business problem", "Skip planning and memorize tool names", "Use it only at the end of the project", "Avoid measuring the result"],
  (topic) => [`Why is ${topic} important in practical work?`, "It helps convert concepts into a usable decision or output", "It removes the need for review", "It guarantees every answer is correct", "It only matters for theory"],
  (topic) => [`Which action shows good understanding of ${topic}?`, "Explaining when and why it should be used", "Copying a definition without context", "Ignoring the project requirement", "Choosing tools before understanding the goal"],
  (topic) => [`What should learners check after applying ${topic}?`, "Whether the result matches the objective and constraints", "Whether the task can be skipped", "Whether the title sounds advanced", "Whether all steps are hidden"],
  (topic) => [`A common mistake while learning ${topic} is to:`, "Use it without understanding the problem it solves", "Practice with examples", "Ask for feedback", "Compare outputs against requirements"],
  (topic) => [`Which habit improves mastery of ${topic}?`, "Practice, review mistakes, and connect the idea to examples", "Avoid hands-on work", "Depend only on shortcuts", "Stop after watching one clip"],
  (topic) => [`When ${topic} is used well, the outcome should be:`, "Clear, explainable, and useful for the next step", "Random and undocumented", "Harder to review", "Separated from the project goal"],
  (topic) => [`What is the strongest sign that ${topic} has been understood?`, "The learner can apply it to a new scenario", "The learner remembers only the spelling", "The learner avoids examples", "The learner skips validation"],
  (topic) => [`Before finalizing work related to ${topic}, what should be done?`, "Review assumptions, quality, and completeness", "Delete all notes", "Avoid stakeholder or mentor feedback", "Change the goal midway"],
  (topic) => [`How should ${topic} be documented in a learner project?`, "With purpose, steps taken, and final outcome", "As a vague one-line note", "Only as a screenshot", "Without mentioning decisions"],
  (topic) => [`Which option best supports teamwork around ${topic}?`, "Shared terminology, clear examples, and visible decisions", "Private notes only", "Changing requirements silently", "No review process"],
  (topic) => [`If results from ${topic} look weak, the next move is to:`, "Recheck inputs, assumptions, and method", "Ignore the issue", "Submit without review", "Remove evidence from the project"],
  (topic) => [`What makes ${topic} portfolio-ready?`, "A clear problem, method, output, and reflection", "A title with no explanation", "Unverified claims", "Only a copied answer"],
  (topic) => [`Which measure helps learners improve at ${topic}?`, "Compare attempts against a rubric or expected result", "Avoid feedback", "Use the same answer for every task", "Focus only on speed"],
  (topic) => [`The best final outcome for ${topic} should be:`, "Accurate enough to explain, review, and improve", "Attractive but unsupported", "Hidden from the learner", "Unrelated to course objectives"]
];

function makeQuiz(courseKey, moduleIndex, title, topics, isFinal = false) {
  const pool = Array.from({ length: 15 }, (_, index) => topics[index % topics.length]);
  return {
    id: `${courseKey}-${isFinal ? "final" : `module-${moduleIndex}`}-quiz`,
    title: isFinal ? "Final Course Quiz" : `${title} Quiz`,
    pass_marks: isFinal ? 10 : 9,
    random_count: 15,
    max_attempts: 3,
    timer_minutes: isFinal ? 25 : 20,
    status: "published",
    questions: pool.map((topic, index) => {
      const [question, optionA, optionB, optionC, optionD] = questionTemplates[index](topic, title);
      return {
        id: `${courseKey}-${isFinal ? "final" : `m${moduleIndex}`}-q${String(index + 1).padStart(2, "0")}`,
        question,
        option_a: optionA,
        option_b: optionB,
        option_c: optionC,
        option_d: optionD,
        answer: "A",
        marks: 1
      };
    })
  };
}

function buildCourse(spec, mentorName) {
  const lessonCount = rawLectures[spec.key].length;
  const totalMinutes = rawLectures[spec.key].reduce((sum, item) => sum + estimateMinutes(item.size), 0);
  const modules = spec.modules.map(([title, range, topics], index) => ({
    id: `${spec.key}-module-${index + 1}`,
    title: `Module ${index + 1}: ${title}`,
    description: `This module builds confidence in ${topics.slice(0, 3).join(", ")} through separate recorded lessons, practical revision points, and a focused quiz.`,
    type: "Recorded Video Lessons",
    order_index: index + 1,
    lessons: lessonsFor(spec, range, topics),
    quiz: makeQuiz(spec.key, index + 1, title, topics)
  }));
  const finalTopics = spec.modules.flatMap(([, , topics]) => topics).slice(0, 15);
  modules.push({
    id: `${spec.key}-final-assessment`,
    title: `Module ${modules.length + 1}: Final Course Assessment`,
    description: "A full-course quiz that checks the important ideas from every module before the learner completes the course.",
    type: "Final Course Quiz",
    order_index: modules.length + 1,
    lessons: [],
    quiz: makeQuiz(spec.key, modules.length + 1, "Full Course Review", finalTopics, true)
  });

  return {
    title: spec.title,
    lookupTitles: spec.lookupTitles || [],
    description: spec.description,
    category: spec.category,
    duration: totalDurationLabel(totalMinutes, lessonCount),
    module_type: "Recorded video + module quiz + final quiz",
    instructor_name: mentorName || "mentor1",
    thumbnail_url: spec.thumbnail_url,
    image_url: spec.thumbnail_url,
    rating: "4.8",
    price: spec.price,
    difficulty: spec.difficulty,
    modules,
    status: "Published",
    is_featured: true,
    is_my_course: false,
    created_by_admin: true,
    quiz_pass_score: 9
  };
}

async function upsertCourse(adminToken, content, mentor) {
  const lookupTitles = [content.title, ...(content.lookupTitles || [])];
  const { lookupTitles: _lookupTitles, ...coursePayload } = content;
  let existingByTitle = [];
  for (const title of lookupTitles) {
    existingByTitle = await selectRows(adminToken, "courses", filterEq("title", title), "*").catch(() => []);
    if (existingByTitle.length) break;
  }
  const course = await writeFirstWorking(
    adminToken,
    "courses",
    { ...coursePayload, mentor_id: mentor?.id, updated_at: new Date().toISOString() },
    existingByTitle[0]?.id || "",
    "*",
    ["thumbnail_url", "image_url", "mentor_id", "created_by_admin", "updated_at", "difficulty", "module_type", "is_featured", "is_my_course", "quiz_pass_score", "rating", "price"]
  );

  const existingBatches = await selectRows(adminToken, "batches", filterEq("course_id", course.id), "*").catch(() => []);
  const batch = await writeFirstWorking(adminToken, "batches", {
    name: `${content.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-batch`,
    course_id: course.id,
    mentor_id: mentor?.id,
    capacity: 35,
    enroll_limit: 35,
    smart_waitlist: true,
    status: "active",
    start_date: new Date().toISOString().slice(0, 10),
    progress: 0,
    enrolled_count: 1
  }, existingBatches[0]?.id || "", "*", ["mentor_id", "enroll_limit", "smart_waitlist", "progress", "enrolled_count", "start_date"]);

  return { course, batch };
}

async function enrollUser(adminToken, user, course, batch) {
  if (!user?.id) return null;
  const rows = await selectRows(adminToken, "user_courses", `${filterEq("user_id", user.id)}&${filterEq("course_id", course.id)}`, "*").catch(() => []);
  const enrollment = await writeFirstWorking(adminToken, "user_courses", {
    user_id: user.id,
    student_id: user.id,
    learner_id: user.id,
    course_id: course.id,
    batch_id: batch?.id,
    status: "active",
    created_at: new Date().toISOString()
  }, rows[0]?.id || "", "*", ["student_id", "learner_id", "batch_id", "status", "created_at"]);

  const courseIds = Array.isArray(user.course_ids) ? user.course_ids : [];
  user.course_ids = [...new Set([...courseIds.map(String), String(course.id)])];
  if (user.role === "student" && !user.batch_id) user.batch_id = batch?.id || null;
  await writeFirstWorking(adminToken, "users", {
    batch_id: user.batch_id || null,
    course_ids: user.course_ids
  }, user.id, "*", ["batch_id", "course_ids"]);
  return enrollment;
}

async function main() {
  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const [mentor] = await selectRows(adminToken, "users", filterEq("email", MENTOR_EMAIL), "*").catch(() => []);
  const [student] = await selectRows(adminToken, "users", filterEq("email", STUDENT_EMAIL), "*").catch(() => []);
  if (!mentor) throw new Error(`Mentor not found: ${MENTOR_EMAIL}`);
  if (!student) throw new Error(`Student not found: ${STUDENT_EMAIL}`);

  const results = [];
  for (const spec of courseSpecs) {
    const content = buildCourse(spec, mentor.name);
    const { course, batch } = await upsertCourse(adminToken, content, mentor);
    await enrollUser(adminToken, mentor, course, batch);
    await enrollUser(adminToken, student, course, batch);
    results.push({
      id: course.id,
      title: course.title,
      duration: course.duration,
      batch: batch?.name || null,
      modules: content.modules.length,
      videoLessons: content.modules.reduce((sum, module) => sum + module.lessons.length, 0),
      quizQuestions: content.modules.reduce((sum, module) => sum + module.quiz.questions.length, 0)
    });
  }

  console.log(JSON.stringify({
    updated: true,
    assigned: { mentor: mentor.email, student: student.email },
    courses: results
  }, null, 2));
}

main().catch((error) => {
  console.error(error.details || error);
  process.exitCode = 1;
});
