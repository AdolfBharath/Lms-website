const categoryButton = document.querySelector("#categoryButton");
const searchForm = document.querySelector("#courseSearch");
const searchInput = document.querySelector("#searchInput");
const categoryLabel = categoryButton?.querySelector(".category-label");
const studentFormUrl = "form-engine/index.html?category=student_registration";
const launchpadFormUrl = "form-engine/index.html?category=launchpad_purchase";

const courseDirectory = [
  {
    title: "Learning JavaScript With Imagination",
    category: "Development",
    author: "Karthik Raman",
    slug: "javascript-imagination",
    price: "INR 5,999",
    rating: "4.6",
    image: "assets/img/courses/course_thumb01.jpg",
    tone: "orange",
    level: "Expert",
    badge: "JS Pro",
    keywords: "javascript web development frontend coding"
  },
  {
    title: "The Complete Graphic Design for Beginners",
    category: "Graphic Design",
    author: "Nandita Iyer",
    slug: "graphic-design-beginners",
    price: "INR 5,999",
    rating: "4.5",
    image: "assets/img/courses/course_thumb02.jpg",
    tone: "green",
    level: "Beginner",
    badge: "Crush Course",
    keywords: "graphic design beginner creative visual"
  },
  {
    title: "Learning Digital Marketing on Facebook",
    category: "Marketing",
    author: "Lakshmi Menon",
    slug: "facebook-digital-marketing",
    price: "INR 5,999",
    rating: "4.3",
    image: "assets/img/courses/course_thumb03.jpg",
    tone: "pink",
    level: "Marketing",
    badge: "Pro Expert",
    keywords: "digital marketing facebook social media ads"
  },
  {
    title: "Financial Analyst Training & Investing Course",
    category: "Finance",
    author: "Vignesh Iyer",
    slug: "financial-analyst-investing",
    price: "INR 5,999",
    rating: "4.7",
    image: "assets/img/courses/course_thumb04.jpg",
    tone: "blue",
    level: "Financial",
    badge: "Crush Course",
    keywords: "business finance investing analyst money"
  },
  {
    title: "React Frontend Bootcamp for Career Projects",
    category: "Development",
    author: "Aravind Subramanian",
    slug: "react-frontend-bootcamp",
    price: "INR 5,999",
    rating: "4.7",
    image: "assets/img/courses/course_thumb01.jpg",
    tone: "purple",
    level: "Frontend",
    badge: "Project Track",
    keywords: "react frontend javascript portfolio web development"
  },
  {
    title: "Python Data Analytics From Zero",
    category: "Development",
    author: "Meera Krishnan",
    slug: "python-data-analytics",
    price: "INR 5,999",
    rating: "4.6",
    image: "assets/img/courses/course_thumb04.jpg",
    tone: "cyan",
    level: "Python",
    badge: "Data Skills",
    keywords: "python data analytics pandas dashboard"
  },
  {
    title: "UI UX Design Sprint for Mobile Apps",
    category: "Graphic Design",
    author: "Anjali Nair",
    slug: "ui-ux-mobile-sprint",
    price: "INR 5,999",
    rating: "4.9",
    image: "assets/img/courses/course_thumb02.jpg",
    tone: "green",
    level: "UI UX",
    badge: "Portfolio",
    keywords: "ui ux app design figma product"
  },
  {
    title: "Brand Identity Design Masterclass",
    category: "Graphic Design",
    author: "Devika Raghavan",
    slug: "brand-identity-masterclass",
    price: "INR 5,999",
    rating: "4.4",
    image: "assets/img/courses/course_thumb03.jpg",
    tone: "amber",
    level: "Branding",
    badge: "Creative",
    keywords: "branding logo identity design visual"
  },
  {
    title: "Social Media Ads and Content Strategy",
    category: "Marketing",
    author: "Sneha Varghese",
    slug: "social-ads-content-strategy",
    price: "INR 5,999",
    rating: "4.6",
    image: "assets/img/courses/course_thumb03.jpg",
    tone: "pink",
    level: "Ads",
    badge: "Growth",
    keywords: "ads content strategy instagram facebook marketing"
  },
  {
    title: "Startup Business Strategy for Beginners",
    category: "Business",
    author: "Suresh Narayanan",
    slug: "startup-business-strategy",
    price: "INR 5,999",
    rating: "4.5",
    image: "assets/img/courses/course_thumb04.jpg",
    tone: "blue",
    level: "Business",
    badge: "Founder",
    keywords: "business startup strategy entrepreneurship"
  },
  {
    title: "Product Management Fundamentals",
    category: "Management",
    author: "Ananya Rao",
    slug: "product-management-fundamentals",
    price: "INR 5,999",
    rating: "4.5",
    image: "assets/img/courses/course_thumb01.jpg",
    tone: "purple",
    level: "PM",
    badge: "Roadmap",
    keywords: "product management roadmap agile leadership"
  },
  {
    title: "Personal Finance for Students",
    category: "Finance",
    author: "Nithya Srinivasan",
    slug: "personal-finance-students",
    price: "INR 5,999",
    rating: "4.4",
    image: "assets/img/courses/course_thumb04.jpg",
    tone: "blue",
    level: "Money",
    badge: "Basics",
    keywords: "personal finance students budgeting saving investing"
  },
  {
    title: "Wellness and Productivity System",
    category: "Life Style",
    author: "Dr. Kavya Menon",
    slug: "wellness-productivity-system",
    price: "INR 5,999",
    rating: "4.2",
    image: "assets/img/courses/course_thumb02.jpg",
    tone: "teal",
    level: "Lifestyle",
    badge: "Habits",
    keywords: "life style wellness productivity habits focus"
  },
  {
    title: "Team Leadership and Communication",
    category: "Management",
    author: "Rahul Nambiar",
    slug: "team-leadership-communication",
    price: "INR 5,999",
    rating: "4.7",
    image: "assets/img/courses/course_thumb01.jpg",
    tone: "orange",
    level: "Leader",
    badge: "Teams",
    keywords: "management communication leadership team"
  },
  {
    title: "AI Tools for Study and Career Workflows",
    category: "AI Tools",
    author: "Ishaan Prakash",
    slug: "ai-tools-study-career",
    price: "INR 5,999",
    rating: "4.9",
    image: "assets/img/courses/course_thumb02.jpg",
    tone: "violet",
    level: "AI",
    badge: "Smart Work",
    keywords: "ai tools prompt automation study career productivity"
  },
  {
    title: "Cyber Security Basics for Beginners",
    category: "Cyber Security",
    author: "Aditya Shetty",
    slug: "cyber-security-basics",
    price: "INR 5,999",
    rating: "4.6",
    image: "assets/img/courses/course_thumb04.jpg",
    tone: "navy",
    level: "Security",
    badge: "Beginner",
    keywords: "cyber security network hacking safety beginner"
  },
  {
    title: "Photography and Visual Storytelling",
    category: "Photography",
    author: "Riya Menon",
    slug: "photography-visual-storytelling",
    price: "INR 5,999",
    rating: "4.5",
    image: "assets/img/courses/course_thumb03.jpg",
    tone: "rose",
    level: "Photo",
    badge: "Creative",
    keywords: "photography visual storytelling camera creative"
  }
];

const courseImageBySlug = {
  "javascript-imagination": "course/1. Technology & Software Development/mk.avif",
  "react-frontend-bootcamp": "course/1. Technology & Software Development/st.avif",
  "python-data-analytics": "course/1. Technology & Software Development/we.avif",
  "graphic-design-beginners": "course/6. Design & Creative Arts/premium_photo-1661310081873-.avif",
  "ui-ux-mobile-sprint": "course/6. Design & Creative Arts/premium_photo-1661412864160-e0.avif",
  "brand-identity-masterclass": "course/6. Design & Creative Arts/premium_photo-172362970.avif",
  "facebook-digital-marketing": "course/5. Business, Finance & Marketing/premium_photo-1661443781814.avif",
  "social-ads-content-strategy": "course/5. Business, Finance & Marketing/premium_photo-1661604346220-5208d18cb34e.avif",
  "financial-analyst-investing": "course/5. Business, Finance & Marketing/premium_photo-1663040328859.avif",
  "personal-finance-students": "course/5. Business, Finance & Marketing/premium_photo-1664476794112.avif",
  "startup-business-strategy": "course/5. Business, Finance & Marketing/photo-1590103514966.avif",
  "product-management-fundamentals": "course/5. Business, Finance & Marketing/premium_photo-1726812103168-6ad609e53f94.avif",
  "team-leadership-communication": "course/5. Business, Finance & Marketing/premium_photo-1733328013343.avif",
  "wellness-productivity-system": "course/7. Healthcare & Human Sciences/psychology.webp",
  "ai-tools-study-career": "course/2. Artificial Intelligence & Data Science/premium_photo-.avif",
  "cyber-security-basics": "course/3. Cyber Security, Cloud & DevOps/gettyimages.jpg",
  "photography-visual-storytelling": "course/6. Design & Creative Arts/premium_photo-1737597230774.avif"
};

const courseAssetFilePattern = /^(?:development|graphicDesign|marketing|Finance|business|management|lifestyle|aitool|cyber|photo)\d\.jpg$/;

const resolveLocalAssetPath = (src) => {
  const value = String(src || "").trim();
  if (!value || /^(?:[a-z]+:)?\/\//i.test(value) || value.startsWith("/") || value.includes("/")) return value;
  if (courseAssetFilePattern.test(value)) return `course/${value}`;
  if (value === "whatsapp-logo.png") return "assets/img/icons/whatsapp-logo.svg";
  return value;
};

const marketplaceDomainGroups = [
  {
    category: "Technology & Software Development",
    courses: [
      "Programming in Python",
      "Programming in Java",
      "DSA with Python",
      "Software Engineering",
      "Front-End Web Development",
      "Full-Stack Web Development"
    ]
  },
  {
    category: "Artificial Intelligence & Data",
    courses: [
      "Artificial Intelligence",
      "Artificial Intelligence and Machine Learning",
      "AI (Agentic & Generative)",
      "Machine Learning",
      "Data Analysis"
    ]
  },
  {
    category: "Cyber Security & Infrastructure",
    courses: [
      "Cyber Security & Ethical Hacking",
      "Cloud Computing",
      "DevOps"
    ]
  },
  {
    category: "Engineering & Emerging Technologies",
    courses: [
      "Internet of Things (IoT)",
      "IoT & Robotics",
      "Embedded Systems",
      "VLSI",
      "Hybrid Electric Vehicle"
    ]
  },
  {
    category: "Business, Management & Finance",
    courses: [
      "Digital Marketing",
      "Human Resource Management",
      "Finance",
      "Startup & Entrepreneurship",
      "Business Analysis",
      "Stock Marketing"
    ]
  },
  {
    category: "Design & Creative Arts",
    courses: ["UI/UX", "AutoCAD"]
  },
  {
    category: "Healthcare & Human Sciences",
    courses: ["Medical Coding", "Psychology"]
  }
];

const marketplaceImagePools = {
  "Technology & Software Development": [
    "course/1. Technology & Software Development/mk.avif",
    "course/1. Technology & Software Development/st.avif",
    "course/1. Technology & Software Development/we.avif",
    "course/1. Technology & Software Development/premium_photo-1720287601920-.avif",
    "course/1. Technology & Software Development/fotis-fotopoulos-6sAl6aQ4OWI.jpg",
    "course/1. Technology & Software Development/hossain-khan-UP3SMQSoNsM.jpg",
    "course/1. Technology & Software Development/chris-ried-ieic5Tq8YMk.jpg",
    "course/1. Technology & Software Development/christopher-gower-m_HRfLhgABo.jpg"
  ],
  "Artificial Intelligence & Data": [
    "course/2. Artificial Intelligence & Data Science/premium_photo-.avif",
    "course/2. Artificial Intelligence & Data Science/premium_photo-1725907643701.avif",
    "course/2. Artificial Intelligence & Data Science/br.jpg",
    "course/2. Artificial Intelligence & Data Science/ji.avif",
    "course/2. Artificial Intelligence & Data Science/yhn.jpg",
    "course/2. Artificial Intelligence & Data Science/ai.jpg",
    "course/2. Artificial Intelligence & Data Science/carlos-gil-AsxOJcsaR4g.jpg"
  ],
  "Cyber Security & Infrastructure": [
    "course/3. Cyber Security, Cloud & DevOps/premium_photoegsd.avif",
    "course/3. Cyber Security, Cloud & DevOps/istockphoto-1556021855.jpg",
    "course/3. Cyber Security, Cloud & DevOps/glen-carrie-Ls1Npp-C-P8.jpg",
    "course/3. Cyber Security, Cloud & DevOps/kevin-horvat-Pyjp2zmxuLk.jpg",
    "course/3. Cyber Security, Cloud & DevOps/markus-winkler-dFVa5T9LE8o.jpg",
    "course/3. Cyber Security, Cloud & DevOps/premium_photo-1733306493254.avif"
  ],
  "Engineering & Emerging Technologies": [
    "course/4. Engineering & Emerging Technologies/premium_photo.avif",
    "course/4. Engineering & Emerging Technologies/premium_photo-1681010317789.avif",
    "course/4. Engineering & Emerging Technologies/ghu.jpg",
    "course/4. Engineering & Emerging Technologies/david-leveque-GpNOhig3LSU.jpg",
    "course/4. Engineering & Emerging Technologies/simon-kadula-8gr6bObQLOI.jpg",
    "course/4. Engineering & Emerging Technologies/marius-masalar-CyFBmFEsytU.jpg"
  ],
  "Business, Management & Finance": [
    "course/5. Business, Finance & Marketing/social-sail-Uno9TGPs4pc.jpg",
    "course/5. Business, Finance & Marketing/vitaly-gariev-pg2eJwNVpvY.jpg",
    "course/5. Business, Finance & Marketing/kelly-sikkema-xoU52jUVUXA.jpg",
    "course/5. Business, Finance & Marketing/lala-azizli-OFZUaeYKP3k.jpg",
    "course/5. Business, Finance & Marketing/premium_photo-1661443781814.avif",
    "course/5. Business, Finance & Marketing/shutter-speed-BQ9usyzHx_w.jpg",
    "course/5. Business, Finance & Marketing/photo-1590103514966.avif",
    "course/5. Business, Finance & Marketing/anne-nygard-x07ELaNFt34.jpg",
    "course/5. Business, Finance & Marketing/mario-gogh-VBLHICVh-lI.jpg"
  ],
  "Design & Creative Arts": [
    "course/6. Design & Creative Arts/premium_photo-1661310081873-.avif",
    "course/6. Design & Creative Arts/andy-brown-8dgFq8Vbelo.jpg",
    "course/6. Design & Creative Arts/grove-brands-RDfZRXZH2Kc.jpg",
    "course/6. Design & Creative Arts/hyundai-motor-group-V1DFo8C4JPA.jpg"
  ],
  "Healthcare & Human Sciences": [
    "course/7. Healthcare & Human Sciences/psychology.webp",
    "course/7. Healthcare & Human Sciences/national-cancer-institute-NFvdKIhxYlU.jpg",
    "course/7. Healthcare & Human Sciences/importance-of-.webp",
    "course/7. Healthcare & Human Sciences/piron-guillaume-y5hQCIn1c6o.jpg",
    "course/7. Healthcare & Human Sciences/premium_photo-1690297732590.avif",
    "course/7. Healthcare & Human Sciences/metaphor-bipolar-disorder-mind-mental-dou.webp"
  ]
};
const marketplaceImageBySlug = {
  "javascript-imagination": "course/1. Technology & Software Development/mk.avif",
  "react-frontend-bootcamp": "course/1. Technology & Software Development/st.avif",
  "python-data-analytics": "course/2. Artificial Intelligence & Data Science/yhn.jpg",
  "graphic-design-beginners": "course/6. Design & Creative Arts/premium_photo-1661310081873-.avif",
  "ui-ux-mobile-sprint": "course/6. Design & Creative Arts/ux-store-jJT2r2n7lYA.jpg",
  "brand-identity-masterclass": "course/6. Design & Creative Arts/andy-brown-8dgFq8Vbelo.jpg",
  "facebook-digital-marketing": "course/5. Business, Finance & Marketing/social-sail-Uno9TGPs4pc.jpg",
  "social-ads-content-strategy": "course/5. Business, Finance & Marketing/premium_photo-1661604346220-5208d18cb34e.avif",
  "financial-analyst-investing": "course/5. Business, Finance & Marketing/anne-nygard-x07ELaNFt34.jpg",
  "personal-finance-students": "course/5. Business, Finance & Marketing/kelly-sikkema-xoU52jUVUXA.jpg",
  "startup-business-strategy": "course/5. Business, Finance & Marketing/lala-azizli-OFZUaeYKP3k.jpg",
  "product-management-fundamentals": "course/5. Business, Finance & Marketing/photo-1590103514966.avif",
  "team-leadership-communication": "course/5. Business, Finance & Marketing/premium_photo-1664476794112.avif",
  "wellness-productivity-system": "course/7. Healthcare & Human Sciences/premium_photo-1690297732590.avif",
  "ai-tools-study-career": "course/2. Artificial Intelligence & Data Science/premium_photo-.avif",
  "cyber-security-basics": "course/3. Cyber Security, Cloud & DevOps/premium_photoegsd.avif",
  "photography-visual-storytelling": "course/6. Design & Creative Arts/premium_photo-1737597230774.avif",
  "programming-in-python": "course/1. Technology & Software Development/code.jpg",
  "programming-in-java": "course/1. Technology & Software Development/chris-ried-ieic5Tq8YMk.jpg",
  "dsa-with-python": "course/1. Technology & Software Development/boitumelo-mZ-vSMus7zM.webp",
  "software-engineering": "course/1. Technology & Software Development/christopher-gower-m_HRfLhgABo.jpg",
  "front-end-web-development": "course/1. Technology & Software Development/fahim-muntashir-v-FOvoL3o.webp",
  "full-stack-web-development": "course/1. Technology & Software Development/premium_photo-1720287601920-.avif",
  "senior-sde-interview-prep": "course/1. Technology & Software Development/fotis-fotopoulos-6sAl6aQ4OWI.jpg",
  "full-stack-developer-portfolio": "course/1. Technology & Software Development/premium_photo-1720287601920-.avif",
  "android-development": "course/1. Technology & Software Development/hossain-khan-UP3SMQSoNsM.jpg",
  "artificial-intelligence": "course/2. Artificial Intelligence & Data Science/ai.jpg",
  "artificial-intelligence-and-machine-learning": "course/2. Artificial Intelligence & Data Science/carlos-gil-AsxOJcsaR4g.jpg",
  "ai-agentic-and-generative": "course/2. Artificial Intelligence & Data Science/clarisse-croset--tikpxRBcsA.webp",
  "machine-learning": "course/2. Artificial Intelligence & Data Science/steve-a-johnson-WhAQMsdRKMI.jpg",
  "data-science": "course/2. Artificial Intelligence & Data Science/ji.avif",
  "data-engineering-with-sql-and-cloud": "course/2. Artificial Intelligence & Data Science/jonathan-kemper-MMUzS5Qzuus.jpg",
  "data-analytics-with-power-bi": "course/2. Artificial Intelligence & Data Science/yhn.jpg",
  "data-analysis": "course/2. Artificial Intelligence & Data Science/nnii.avif",
  "cyber-security-and-ethical-hacking": "course/3. Cyber Security, Cloud & DevOps/premium_photoegsd.avif",
  "cloud-computing": "course/3. Cyber Security, Cloud & DevOps/glen-carrie-Ls1Npp-C-P8.webp",
  "devops": "course/3. Cyber Security, Cloud & DevOps/kevin-horvat-Pyjp2zmxuLk.webp",
  "internet-of-things-iot": "course/4. Engineering & Emerging Technologies/premium_photo-1681010317789.avif",
  "iot-and-robotics": "course/4. Engineering & Emerging Technologies/ray-rui-SyzQ5aByJnE.jpg",
  "embedded-systems": "course/4. Engineering & Emerging Technologies/jeswin-thomas--Cm7hnp4WOg.jpg",
  "vlsi": "course/4. Engineering & Emerging Technologies/adi-goldstein-EUsVwEOsblE.jpg",
  "robotics": "course/4. Engineering & Emerging Technologies/ray-rui-SyzQ5aByJnE.jpg",
  "hybrid-electric-vehicle": "course/4. Engineering & Emerging Technologies/thisisengineering-omrpeqLz6Po.webp",
  "nanotechnology": "course/4. Engineering & Emerging Technologies/marius-masalar-CyFBmFEsytU.jpg",
  "digital-marketing": "course/5. Business, Finance & Marketing/social-sail-Uno9TGPs4pc.jpg",
  "human-resource-management": "course/5. Business, Finance & Marketing/scott-graham-5fNmWej4tAA.webp",
  "finance": "course/5. Business, Finance & Marketing/anne-nygard-x07ELaNFt34.jpg",
  "startup-and-entrepreneurship": "course/5. Business, Finance & Marketing/lala-azizli-OFZUaeYKP3k.jpg",
  "business-analysis": "course/5. Business, Finance & Marketing/mirea-mazzei-d1Lp7juy6JU.webp",
  "operation-and-supply-chain-management": "course/5. Business, Finance & Marketing/shutter-speed-BQ9usyzHx_w.jpg",
  "e-commerce-operations-management": "course/5. Business, Finance & Marketing/premium_photo-1681488262364.avif",
  "product-and-project-management": "course/5. Business, Finance & Marketing/photo-1590103514966.avif",
  "stock-marketing": "course/5. Business, Finance & Marketing/premium_photo-1663040328859.avif",
  "ui-ux": "course/6. Design & Creative Arts/ux-store-jJT2r2n7lYA.jpg",
  "graphic-designing": "course/6. Design & Creative Arts/premium_photo-1661310081873-.avif",
  "autocad": "course/6. Design & Creative Arts/grove-brands-RDfZRXZH2Kc.jpg",
  "car-design": "course/6. Design & Creative Arts/hyundai-motor-group-V1DFo8C4JPA.jpg",
  "medical-coding": "course/7. Healthcare & Human Sciences/accuray-MFSEP2g4YS0.jpg",
  "clinical-trials-and-research": "course/7. Healthcare & Human Sciences/piron-guillaume-y5hQCIn1c6o.jpg",
  "psychology": "course/7. Healthcare & Human Sciences/psychology.webp",
  "counselling-psychology-practice": "course/7. Healthcare & Human Sciences/metaphor-bipolar-disorder-mind-mental-dou.webp",
  "clinical-psychology-basics": "course/7. Healthcare & Human Sciences/importance-of-.webp",
  "rehabilitation-psychology": "course/7. Healthcare & Human Sciences/premium_photo-1699387204388.avif"
};
const marketplaceTones = ["orange", "green", "pink", "blue", "purple", "cyan", "amber", "teal", "violet", "navy", "rose"];
const marketplaceRatings = ["4.6", "4.3", "4.8", "4.5", "4.9", "4.2", "4.7", "4.4", "4.1"];
const marketplaceMentorsByCategory = {
  "Technology & Software Development": ["Rahul Singh", "Tanishq", "Aravind Subramanian", "Aditya Shetty", "Suresh Narayanan"],
  "Artificial Intelligence & Data": ["Surya R", "Tanya D", "Meera Krishnan", "Ananya Rao", "Devika Raghavan"],
  "Cyber Security & Infrastructure": ["Aditya Shetty", "Suresh Narayanan", "Rahul Singh"],
  "Engineering & Emerging Technologies": ["Aravind Subramanian", "Surya R", "Rahul Nambiar", "Suresh Narayanan"],
  "Business, Management & Finance": ["Ravindra", "Lakshmi Menon", "Nithya Srinivasan", "Rahul Nambiar", "Devika Raghavan"],
  "Design & Creative Arts": ["Anjali Nair", "Devika Raghavan", "Lakshmi Menon"],
  "Healthcare & Human Sciences": ["Archana S", "Muskan", "Suvidha Sharma", "Dr. Kavya Menon", "Meera Krishnan"]
};
const marketplaceMentorByCourse = {
  "senior-sde-interview-prep": "Rahul Singh",
  "full-stack-developer-portfolio": "Tanishq",
  "software-engineering": "Tanishq",
  "artificial-intelligence-and-machine-learning": "Surya R",
  "iot-and-robotics": "Aravind Subramanian",
  "data-engineering-with-sql-and-cloud": "Surya R",
  "data-analytics-with-power-bi": "Tanya D",
  "e-commerce-operations-management": "Ravindra",
  "human-resource-management": "mentor1",
  "counselling-psychology-practice": "Archana S",
  "clinical-psychology-basics": "Muskan",
  "rehabilitation-psychology": "Suvidha Sharma"
};

const marketplaceCourseOverrides = {
  "programming-in-python": {
    tone: "blue"
  },
  "programming-in-java": {
    tone: "teal"
  },
  "dsa-with-python": {
    tone: "purple"
  },
  "front-end-web-development": {
    tone: "orange"
  },
  "human-resource-management": {
    author: "mentor1",
    rating: "4.8",
    tone: "amber",
    level: "3 Modules",
    badge: "10 Videos",
    keywords: "human resource management strategic HRM workforce planning job analysis job design recruitment selection performance appraisal compensation change management 10 videos module quiz"
  }
};

const mentorForMarketplaceCourse = (category, index, title = "") => {
  const slug = slugifyCourse(title);
  if (marketplaceMentorByCourse[slug]) return marketplaceMentorByCourse[slug];
  const mentors = marketplaceMentorsByCategory[category] || ["Aravind Subramanian", "Anjali Nair"];
  return mentors[index % mentors.length];
};

const slugifyCourse = (title) => String(title)
  .toLowerCase()
  .replace(/&/g, "and")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const coursesTemporarilyDisabled = false;
const marketplaceCourses = coursesTemporarilyDisabled ? [] : marketplaceDomainGroups.flatMap((group) => {
  const images = marketplaceImagePools[group.category] || ["course/1. Technology & Software Development/mk.avif"];
  return group.courses.map((title, index) => {
    const slug = slugifyCourse(title);
    return {
      title,
      category: group.category,
      author: mentorForMarketplaceCourse(group.category, index, title),
      slug,
      price: "INR 5,999",
      rating: marketplaceRatings[(group.category.length + title.length + index) % marketplaceRatings.length],
      image: marketplaceImageBySlug[slug] || images[index % images.length],
      tone: marketplaceTones[index % marketplaceTones.length],
      level: group.category.split(/[,&]/)[0].trim(),
      badge: "Career Track",
      keywords: `${title} ${group.category} internship training career skills`,
      ...(marketplaceCourseOverrides[slug] || {})
    };
  });
});

courseDirectory.splice(0, courseDirectory.length, ...marketplaceCourses);

courseDirectory.forEach((course) => {
  course.image = resolveLocalAssetPath(courseImageBySlug[course.slug] || course.image);
});

const courseCategories = ["All", ...new Set(courseDirectory.map((course) => course.category))];
let selectedCourseCategory = "All";
const courseCurrencyKey = "jenovate-course-currency";
const courseInrRate = 83;
const marketplaceCourseInrPrice = 5999;
const marketplaceCourseUsdPrice = 65;
const coursePriceOverrides = {};

const readCourseCurrency = () => {
  return "INR";
};

const saveCourseCurrency = (currency) => {
  try {
    localStorage.setItem(courseCurrencyKey, currency);
  } catch {
    // Storage can be blocked in private browsing; the toggle still works for the session.
  }
};

let selectedCourseCurrency = readCourseCurrency();

const normalize = (value) => String(value || "").trim().toLowerCase();
const courseSearchText = (course) => normalize(`${course.title} ${course.category} ${course.author} ${course.keywords || ""}`);

const currentCourseCards = () => [...document.querySelectorAll(".course-card")];

const courseInrAmount = (course) => coursePriceOverrides[course?.slug] || marketplaceCourseInrPrice;

const formatCoursePrice = (course, currency = selectedCourseCurrency) => {
  const inr = courseInrAmount(course);
  if (currency === "USD") {
    return `$${marketplaceCourseUsdPrice.toFixed(2)}`;
  }
  return `INR ${inr.toLocaleString("en-IN")}`;
};

const updateCourseCurrencyButtons = () => {
  document.querySelectorAll("[data-course-currency] [data-currency]").forEach((button) => {
    const active = button.dataset.currency === selectedCourseCurrency;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
};

const updateCoursePrices = () => {
  document.querySelectorAll("[data-course-price]").forEach((priceNode) => {
    const course = courseBySlug(priceNode.dataset.coursePrice);
    if (course) priceNode.textContent = formatCoursePrice(course);
  });
};

const initCourseCurrencyToggle = () => {
  const switcher = document.querySelector("[data-course-currency]");
  if (!switcher) return;

  switcher.addEventListener("click", (event) => {
    const button = event.target.closest("[data-currency]");
    if (!button || !switcher.contains(button)) return;
    selectedCourseCurrency = button.dataset.currency === "INR" ? "INR" : "USD";
    saveCourseCurrency(selectedCourseCurrency);
    updateCourseCurrencyButtons();
    updateCoursePrices();
  });

  updateCourseCurrencyButtons();
};

const courseCategoryCount = (category) => {
  return courseDirectory.filter((course) => course.category === category).length;
};

const categoryIconClass = (category) => ({
  "Technology & Software Development": "code",
  "Artificial Intelligence & Data": "ai",
  "Cyber Security & Infrastructure": "shield",
  "Engineering & Emerging Technologies": "briefcase",
  "Business, Management & Finance": "briefcase",
  "Design & Creative Arts": "pen",
  "Security & Infrastructure": "shield",
  "Healthcare & Human Sciences": "users",
  "Graphic Design": "pen",
  "Finance": "finance",
  "Development": "code",
  "Marketing": "mail",
  "Life Style": "bag",
  "Management": "users",
  "Business": "briefcase",
  "AI Tools": "ai",
  "Cyber Security": "shield",
  "Photography": "camera"
}[category] || "code");

const categoryVisuals = {
  "Technology & Software Development": {
    image: "assets/categories/Tech.webp",
    tone: "blue"
  },
  "Artificial Intelligence & Data": {
    image: "assets/categories/ai.webp",
    tone: "purple"
  },
  "Cyber Security & Infrastructure": {
    image: "assets/categories/cyber.webp",
    tone: "orange"
  },
  "Engineering & Emerging Technologies": {
    image: "assets/categories/enginerring.webp",
    tone: "green"
  },
  "Business, Management & Finance": {
    image: "assets/categories/bussiness.webp",
    tone: "green"
  },
  "Design & Creative Arts": {
    image: "assets/categories/design.webp",
    tone: "pink"
  },
  "Healthcare & Human Sciences": {
    image: "assets/categories/healthcare.webp",
    tone: "purple"
  }
};

const renderCategoryCarousel = () => {
  const carousel = document.querySelector(".category-carousel");
  if (!carousel) return;
  carousel.innerHTML = `
    <button class="arrow left" type="button" aria-label="Previous category" data-category-prev></button>
    <div class="category-track" data-category-track>
      ${courseCategories.filter((category) => category !== "All").map((category) => {
        const visual = categoryVisuals[category] || categoryVisuals["Technology & Software Development"];
        const count = courseCategoryCount(category);
        return `
        <button class="category-item category-${visual.tone}" type="button" data-search-category="${category}">
          <span class="category-art" aria-hidden="true">
            <img src="${visual.image}" alt="" loading="lazy" decoding="async">
          </span>
          <span class="category-count">${count} ${count === 1 ? "Course" : "Courses"}</span>
          <h3>${category}</h3>
          <span class="category-explore">Enroll <b aria-hidden="true">&rarr;</b></span>
        </button>
      `;
      }).join("")}
    </div>
    <button class="arrow right" type="button" aria-label="Next category" data-category-next></button>
  `;
};

const initCategoryCardTilt = () => {
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const motionOK = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!finePointer || !motionOK) return;

  document.querySelectorAll(".category-item").forEach((card) => {
    if (card.dataset.tiltReady === "true") return;
    card.dataset.tiltReady = "true";

    card.addEventListener("pointerenter", () => {
      card.classList.add("category-tilting");
    });

    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const xRatio = (x - centerX) / centerX;
      const yRatio = (y - centerY) / centerY;
      const rotateX = yRatio * -10;
      const rotateY = xRatio * 12;
      const shadowX = xRatio * -18;
      const shadowY = yRatio * -12;

      card.style.setProperty("--category-rx", `${rotateX.toFixed(2)}deg`);
      card.style.setProperty("--category-ry", `${rotateY.toFixed(2)}deg`);
      card.style.setProperty("--category-glare-x", `${((x / rect.width) * 100).toFixed(1)}%`);
      card.style.setProperty("--category-glare-y", `${((y / rect.height) * 100).toFixed(1)}%`);
      card.style.setProperty("--category-glare-opacity", ".64");
      card.style.setProperty("--category-shadow", `${shadowX.toFixed(1)}px ${34 + shadowY}px 76px rgba(32, 28, 69, .18)`);
    });

    card.addEventListener("pointerleave", () => {
      card.classList.remove("category-tilting");
      card.style.removeProperty("--category-rx");
      card.style.removeProperty("--category-ry");
      card.style.removeProperty("--category-glare-x");
      card.style.removeProperty("--category-glare-y");
      card.style.removeProperty("--category-glare-opacity");
      card.style.removeProperty("--category-shadow");
    });
  });
};

const initPremiumCategoryCards = () => {
  const track = document.getElementById("pcatTrack");
  if (track && track.dataset.autoScrollReady !== "true") {
    track.dataset.autoScrollReady = "true";
    [...track.children].forEach((item) => {
      const clone = item.cloneNode(true);
      clone.classList.add("pcat-clone");
      clone.setAttribute("aria-hidden", "true");
      clone.removeAttribute("data-pcat");
      clone.removeAttribute("data-search-category");
      clone.querySelectorAll("a, button").forEach((node) => {
        node.setAttribute("tabindex", "-1");
      });
      track.appendChild(clone);
    });
  }

  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const motionOK = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!finePointer || !motionOK) return;

  document.querySelectorAll(".pcat-wrap").forEach((wrap) => {
    if (wrap.dataset.pcatTiltReady === "true") return;
    const card = wrap.querySelector(".pcat-glass");
    if (!card) return;

    wrap.dataset.pcatTiltReady = "true";
    const artWrap = card.querySelector(".pcat-art-wrap");

    const resetTilt = () => {
      card.classList.remove("pcat-tilting");
      card.style.removeProperty("--pcat-rx");
      card.style.removeProperty("--pcat-ry");
      card.style.removeProperty("--pcat-glare-x");
      card.style.removeProperty("--pcat-glare-y");
      card.style.removeProperty("--pcat-glare-op");
      card.style.boxShadow = "";
      if (artWrap) artWrap.style.animationPlayState = "";
    };

    wrap.addEventListener("pointerenter", () => {
      if (artWrap) artWrap.style.animationPlayState = "paused";
      card.classList.add("pcat-tilting");
    });

    wrap.addEventListener("pointermove", (event) => {
      const rect = wrap.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const xRatio = (x - centerX) / centerX;
      const yRatio = (y - centerY) / centerY;
      const rotateY = xRatio * 14;
      const rotateX = yRatio * -10;
      const shadowX = xRatio * -16;
      const shadowY = 32 + (yRatio * -12);

      card.classList.add("pcat-tilting");
      card.style.setProperty("--pcat-rx", `${rotateX.toFixed(2)}deg`);
      card.style.setProperty("--pcat-ry", `${rotateY.toFixed(2)}deg`);
      card.style.setProperty("--pcat-glare-x", `${((x / rect.width) * 100).toFixed(1)}%`);
      card.style.setProperty("--pcat-glare-y", `${((y / rect.height) * 100).toFixed(1)}%`);
      card.style.setProperty("--pcat-glare-op", ".46");
      card.style.boxShadow = `${shadowX.toFixed(1)}px ${shadowY.toFixed(1)}px 70px -18px rgba(30,25,70,.2), inset 0 1px 0 rgba(255,255,255,.9)`;
    });

    wrap.addEventListener("pointerleave", resetTilt);
    wrap.addEventListener("pointercancel", resetTilt);
    wrap.addEventListener("blur", resetTilt, true);
  });
};

const courseDetailHref = (course) => `course-detail.html?course=${encodeURIComponent(course.slug)}`;

const courseIconLabel = (course) => {
  const title = String(course.title || "").toLowerCase();
  if (title.includes("java")) return "J";
  if (title.includes("dsa") || title.includes("data")) return "↗";
  if (title.includes("front-end") || title.includes("web") || title.includes("programming") || title.includes("software")) return "</>";
  if (title.includes("ai") || title.includes("artificial")) return "AI";
  return "↗";
};

const courseReviewCount = (course, index = 0) => {
  const featuredReviews = {
    "programming-in-python": 128,
    "programming-in-java": 96,
    "dsa-with-python": 87,
    "front-end-web-development": 112
  };
  return featuredReviews[course.slug] || 86 + ((course.title.length + index * 13) % 48);
};

const courseTitleMarkup = (course) => course.title;
const publicImageFallback = "assets/img/logo/favicon.png";

const courseCardMarkup = (course, index = 0) => `
  <article class="course-card ${course.tone || "blue"}" data-course-category="${course.category}" data-course-slug="${course.slug}" data-course-url="${courseDetailHref(course)}" role="link" tabindex="0" aria-label="Open ${course.title} details">
    <div class="course-visual">
      <img src="${resolveLocalAssetPath(course.image)}" alt="${course.title}" width="320" height="180" loading="${index < 4 ? "eager" : "lazy"}" decoding="async" fetchpriority="${index < 4 ? "high" : "low"}" onerror="this.onerror=null;this.src='${publicImageFallback}';">
      <span class="course-visual-tag">Career Track</span>
      <span class="course-visual-chip" aria-hidden="true"></span>
      <span class="course-visual-icon" data-course-icon="${courseIconLabel(course)}" aria-hidden="true"></span>
    </div>
    <div class="course-meta">
      <span>${course.level || course.category}</span>
      <b>&#9733; ${course.rating} <em>(${courseReviewCount(course, index)})</em></b>
    </div>
    <h3>${courseTitleMarkup(course)}</h3>
    <p class="course-mentor"><span aria-hidden="true"></span>Mentor: ${course.author}</p>
    <div class="course-bottom">
      <a href="${courseDetailHref(course)}" data-course-enroll="${course.slug}">Enroll Now <span aria-hidden="true">&rarr;</span></a>
      <strong data-course-price="${course.slug}">${formatCoursePrice(course)}</strong>
    </div>
  </article>
`;

const renderCourseCards = () => {
  const grid = document.querySelector(".course-grid");
  if (!grid) return;
  grid.innerHTML = courseDirectory.map(courseCardMarkup).join("");
};

const renderCourseTabs = () => {
  const tabs = document.querySelector(".tabs");
  if (!tabs) return;
  tabs.innerHTML = courseCategories.map((category) => `
    <button class="${category === selectedCourseCategory ? "active" : ""}" type="button" data-course-filter="${category}">
      ${category === "All" ? "All Courses" : category}
    </button>
  `).join("");
};

const ensureCourseTabScroller = () => {
  const tabs = document.querySelector(".tabs");
  if (!tabs) return;
  tabs.classList.add("tabs-inline-scroll");
  if (tabs.closest(".course-tab-shell")) return;

  const shell = document.createElement("div");
  shell.className = "course-tab-shell";
  shell.innerHTML = `
    <button class="course-tab-arrow left" type="button" aria-label="Scroll course categories left"></button>
    <button class="course-tab-arrow right" type="button" aria-label="Scroll course categories right"></button>
  `;
  tabs.parentNode.insertBefore(shell, tabs);
  shell.insertBefore(tabs, shell.querySelector(".course-tab-arrow.right"));

  const updateTabArrows = () => {
    const maxScroll = Math.max(0, tabs.scrollWidth - tabs.clientWidth - 2);
    shell.classList.toggle("is-scrollable", maxScroll > 0);
  };

  tabs.addEventListener("scroll", updateTabArrows, { passive: true });
  window.addEventListener("resize", updateTabArrows);
  window.requestAnimationFrame(updateTabArrows);
};

const ensureMentorCardScroller = () => {
  const strip = document.querySelector(".mentor-card-strip");
  if (!strip || strip.closest(".mentor-scroll-shell")) return;

  const shell = document.createElement("div");
  shell.className = "mentor-scroll-shell";
  shell.innerHTML = `
    <button class="mentor-scroll-arrow left" type="button" aria-label="Scroll mentors left"></button>
    <button class="mentor-scroll-arrow right" type="button" aria-label="Scroll mentors right"></button>
  `;

  strip.parentNode.insertBefore(shell, strip);
  shell.insertBefore(strip, shell.querySelector(".mentor-scroll-arrow.right"));

  const scrollMentors = (direction) => {
    const distance = Math.max(220, Math.round(strip.clientWidth * 0.68));
    strip.scrollBy({ left: direction * distance, behavior: "smooth" });
  };

  shell.querySelector(".mentor-scroll-arrow.left")?.addEventListener("click", () => scrollMentors(-1));
  shell.querySelector(".mentor-scroll-arrow.right")?.addEventListener("click", () => scrollMentors(1));
};

const syncCourseCardsWithDirectory = () => {
  currentCourseCards().forEach((card) => {
    const title = card.querySelector("h3")?.textContent?.trim() || "";
    const matched = courseDirectory.find((course) => normalize(course.title) === normalize(title));
    if (!matched) return;
    card.dataset.courseCategory ||= matched.category;
    card.dataset.courseSlug ||= matched.slug;
    card.tabIndex = 0;
  });
};

const courseMatches = (course, query, category) => {
  const matchesCategory = category === "All" || normalize(course.category) === normalize(category);
  const matchesQuery = !query || courseSearchText(course).includes(normalize(query));
  return matchesCategory && matchesQuery;
};

const courseBySlug = (slug) => courseDirectory.find((course) => course.slug === slug);

const matchingCourses = (query = searchInput?.value || "", category = selectedCourseCategory) => {
  return courseDirectory.filter((course) => courseMatches(course, query, category));
};

const setCategoryLabel = (category) => {
  selectedCourseCategory = category;
  if (categoryLabel) categoryLabel.textContent = category === "All" ? "Categories" : category;
  document.querySelectorAll("[data-search-category]").forEach((item) => {
    const active = normalize(item.dataset.searchCategory) === normalize(category);
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-course-filter]").forEach((button) => {
    button.classList.toggle("active", normalize(button.dataset.courseFilter) === normalize(category));
  });
  const activeTab = document.querySelector(".tabs button.active");
  activeTab?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
};

const cssEscape = (value) => {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
};

const scrollToCourses = () => {
  const coursesSection = document.querySelector("#courses");
  coursesSection?.scrollIntoView({ behavior: "smooth", block: "start" });
};

const selectCourseCategory = (category, { scroll = false, focusFirst = false } = {}) => {
  const resolvedCategory = courseCategories.find((item) => normalize(item) === normalize(category)) || "All";
  setCategoryLabel(resolvedCategory);
  if (searchInput) searchInput.value = "";
  applyCourseFilter({ scroll, focusFirst });
  closeCourseSearchPanels();
};

const highlightCourseCard = (slug) => {
  const card = document.querySelector(`.course-card[data-course-slug="${cssEscape(slug)}"]`);
  if (!card) return;
  card.classList.add("course-card-selected");
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => card.classList.remove("course-card-selected"), 1800);
};

const applyCourseFilter = ({ scroll = false, focusFirst = false } = {}) => {
  const previousScrollY = window.scrollY;
  const cards = currentCourseCards();
  const query = searchInput?.value || "";

  const matches = matchingCourses(query, selectedCourseCategory);
  const visibleSlugs = new Set(matches.map((course) => course.slug));
  const noResults = document.querySelector("[data-course-empty]");

  cards.forEach((card) => {
    const visible = visibleSlugs.has(card.dataset.courseSlug);
    card.classList.toggle("is-hidden", !visible);
    card.hidden = !visible;
  });

  document.querySelectorAll(".tabs button").forEach((button) => {
    const filter = button.dataset.courseFilter || button.textContent.trim().replace(" Courses", "");
    button.classList.toggle("active", selectedCourseCategory === "All"
      ? normalize(filter) === "all"
      : normalize(filter) === normalize(selectedCourseCategory));
  });

  if (noResults) noResults.hidden = matches.length > 0;
  renderSearchResults(matches, query);

  if (scroll) scrollToCourses();
  if (focusFirst && matches[0]) highlightCourseCard(matches[0].slug);
  if (!scroll && !focusFirst) {
    window.requestAnimationFrame(() => window.scrollTo({ top: previousScrollY, left: 0, behavior: "auto" }));
  }
};

const navigateToCourse = (course) => {
  if (!course) return;
  const onHomePage = Boolean(document.querySelector("#courses"));
  const params = new URLSearchParams();
  params.set("course", course.slug);
  params.set("category", course.category);

  if (!onHomePage) {
    window.location.href = `index.html?${params.toString()}#courses`;
    return;
  }

  setCategoryLabel(course.category);
  if (searchInput) searchInput.value = course.title;
  applyCourseFilter({ scroll: true });
  highlightCourseCard(course.slug);
  closeCourseSearchPanels();
};

const openCourseDetail = (course) => {
  if (!course) return;
  window.location.href = courseDetailHref(course);
};

const buildCategoryMenu = () => {
  if (!searchForm || searchForm.querySelector(".category-menu")) return;

  const menu = document.createElement("div");
  menu.className = "category-menu";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;
  menu.innerHTML = courseCategories.map((category) => `
    <button type="button" role="option" data-search-category="${category}" aria-selected="${category === selectedCourseCategory}">
      <span>${category.slice(0, 2).toUpperCase()}</span>
      ${category === "All" ? "All Categories" : category}
    </button>
  `).join("");
  categoryButton?.after(menu);

  menu.addEventListener("click", (event) => {
    const option = event.target.closest("[data-search-category]");
    if (!option) return;
    setCategoryLabel(option.dataset.searchCategory);
    menu.querySelectorAll("[data-search-category]").forEach((button) => {
      button.setAttribute("aria-selected", String(button === option));
    });
    categoryButton?.setAttribute("aria-expanded", "false");
    menu.hidden = true;
    applyCourseFilter({ scroll: false });
    searchInput?.focus();
    window.setTimeout(() => renderSearchResults(matchingCourses(), searchInput?.value || ""), 0);
  });
};

const buildSearchResults = () => {
  if (!searchForm || searchForm.querySelector(".search-results")) return;
  const results = document.createElement("div");
  results.className = "search-results";
  results.setAttribute("role", "listbox");
  results.hidden = true;
  searchForm.append(results);
};

const renderSearchResults = (courses = matchingCourses(), query = searchInput?.value || "") => {
  const results = searchForm?.querySelector(".search-results");
  if (!results) return;
  const shouldShow = document.activeElement === searchInput && (query.trim() || selectedCourseCategory !== "All");
  const visible = courses.slice(0, 6);

  results.hidden = !shouldShow;
  results.innerHTML = visible.length ? visible.map((course) => `
    <button type="button" role="option" data-course-result="${course.slug}">
      <img src="${resolveLocalAssetPath(course.image)}" alt="" width="56" height="56" loading="lazy" decoding="async" fetchpriority="low" onerror="this.onerror=null;this.src='${publicImageFallback}';">
      <span>${course.category}</span>
      <strong>${course.title}</strong>
      <small>Mentor: ${course.author}</small>
      <b>${formatCoursePrice(course)}</b>
    </button>
  `).join("") : `
    <div class="search-empty">
      <strong>No courses found</strong>
      <small>Try another category or search word.</small>
    </div>
  `;
};

const closeCourseSearchPanels = () => {
  categoryButton?.setAttribute("aria-expanded", "false");
  const menu = searchForm?.querySelector(".category-menu");
  const results = searchForm?.querySelector(".search-results");
  if (menu) menu.hidden = true;
  if (results) results.hidden = true;
};

const initCourseSearch = () => {
  if (!searchForm || !categoryButton || !searchInput) return;
  renderCategoryCarousel();
  initCategoryCardTilt();
  renderCourseTabs();
  ensureCourseTabScroller();
  renderCourseCards();
  initCourseCurrencyToggle();
  updateCoursePrices();
  syncCourseCardsWithDirectory();
  buildCategoryMenu();
  buildSearchResults();

  const courseGrid = document.querySelector(".course-grid");
  if (courseGrid && !document.querySelector("[data-course-empty]")) {
    courseGrid.insertAdjacentHTML("afterend", `
      <div class="course-empty-state" data-course-empty hidden>
        <strong>No matching courses yet</strong>
        <span>Try all categories or a different keyword.</span>
      </div>
    `);
  }

  categoryButton.addEventListener("click", () => {
    const menu = searchForm.querySelector(".category-menu");
    if (!menu) return;
    const expanded = categoryButton.getAttribute("aria-expanded") === "true";
    categoryButton.setAttribute("aria-expanded", String(!expanded));
    menu.hidden = expanded;
    searchForm.querySelector(".search-results")?.setAttribute("hidden", "");
  });

  searchInput.addEventListener("input", () => applyCourseFilter());
  searchInput.addEventListener("focus", () => renderSearchResults(matchingCourses(), searchInput.value));

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const match = matchingCourses()[0];
    if (match) navigateToCourse(match);
  });

  searchForm.addEventListener("click", (event) => {
    const result = event.target.closest("[data-course-result]");
    if (!result) return;
    navigateToCourse(courseBySlug(result.dataset.courseResult));
  });

  document.querySelectorAll(".tabs button").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const category = button.dataset.courseFilter || button.textContent.trim().replace(" Courses", "");
      setCategoryLabel(category || "All");
      if (searchInput) searchInput.value = "";
      applyCourseFilter({ scroll: false });
    });
  });

  document.querySelector(".course-tab-arrow.left")?.addEventListener("click", (event) => {
    event.preventDefault();
    const tabs = document.querySelector(".tabs");
    if (!tabs) return;
    if (tabs.scrollLeft <= 2) {
      tabs.scrollTo({ left: tabs.scrollWidth, behavior: "smooth" });
      return;
    }
    tabs.scrollBy({ left: -300, behavior: "smooth" });
  });

  document.querySelector(".course-tab-arrow.right")?.addEventListener("click", (event) => {
    event.preventDefault();
    const tabs = document.querySelector(".tabs");
    if (!tabs) return;
    const maxScroll = Math.max(0, tabs.scrollWidth - tabs.clientWidth - 2);
    if (tabs.scrollLeft >= maxScroll) {
      tabs.scrollTo({ left: 0, behavior: "smooth" });
      return;
    }
    tabs.scrollBy({ left: 300, behavior: "smooth" });
  });

  document.querySelectorAll(".category-item").forEach((item) => {
    const category = item.dataset.searchCategory || item.querySelector("h3")?.textContent?.trim();
    item.addEventListener("click", (event) => {
      event.preventDefault();
      selectCourseCategory(category || "All", { scroll: true, focusFirst: true });
    });
  });

  const slideCategoryTrack = (direction) => {
    document.querySelector("[data-category-track]")?.scrollBy({
      left: direction * 260,
      behavior: "smooth"
    });
  };

  document.querySelector("[data-category-prev]")?.addEventListener("click", (event) => {
    event.preventDefault();
    slideCategoryTrack(-1);
  });
  document.querySelector("[data-category-next]")?.addEventListener("click", (event) => {
    event.preventDefault();
    slideCategoryTrack(1);
  });

  currentCourseCards().forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("a, button")) return;
      const course = courseBySlug(card.dataset.courseSlug);
      openCourseDetail(course);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      const course = courseBySlug(card.dataset.courseSlug);
      openCourseDetail(course);
    });
  });

  document.addEventListener("click", (event) => {
    const categoryCard = event.target.closest("[data-pcat]");
    if (!categoryCard) return;
    event.preventDefault();
    const category = categoryCard.dataset.searchCategory || categoryCard.querySelector("h3")?.textContent?.trim();
    selectCourseCategory(category || "All", { scroll: true, focusFirst: true });
  });

  document.addEventListener("click", (event) => {
    if (!searchForm.contains(event.target)) closeCourseSearchPanels();
  });

  const params = new URLSearchParams(window.location.search);
  const requestedCategory = params.get("category");
  const requestedCourse = params.get("course");
  if (requestedCategory && courseCategories.some((category) => normalize(category) === normalize(requestedCategory))) {
    setCategoryLabel(courseCategories.find((category) => normalize(category) === normalize(requestedCategory)));
  }
  if (requestedCourse) {
    const course = courseBySlug(requestedCourse);
    if (course) {
      setCategoryLabel(course.category);
      if (searchInput) searchInput.value = course.title;
      applyCourseFilter();
      window.setTimeout(() => highlightCourseCard(course.slug), 250);
      return;
    }
  }
  applyCourseFilter();
};

const motionOK = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const revealGroups = [
  [".section-title", "zoom-in"],
  [".hero-copy", "from-left"],
  [".category-item", "zoom-in"],
  [".video-blob", "from-left"],
  [".about-copy", "from-right"],
  [".course-card", "zoom-in"],
  [".subscribe-person", "from-left"],
  [".subscribe h2", "from-right"],
  [".subscribe-form", "from-right"],
  [".instructor-copy", "from-left"],
  [".instructor-grid article", "zoom-in"],
  [".stats div", "zoom-in"],
  [".faq-art", "from-left"],
  [".faq-copy", "from-right"],
  [".ambassador-copy", "from-left"],
  [".ambassador-dashboard", "from-right"],
  [".amb-card", "zoom-in"],
  [".reward-card", "zoom-in"],
  [".about-feature-card", "zoom-in"],
  [".story-heading", "zoom-in"],
  [".story-grid > div", "zoom-in"],
  [".story-media > *", "zoom-in"],
  [".home-testimonials .section-title", "zoom-in"],
  [".about-careers > div", "zoom-in"],
  [".dream-cta > *", "zoom-in"],
  [".journey-features article", "zoom-in"],
  [".earn-card", "zoom-in"],
  [".campus-step", "zoom-in"],
  [".campus-review-card", "zoom-in"],
  [".campus-cta > *", "zoom-in"],
  [".apply-cards article", "zoom-in"],
  [".news-grid article", "zoom-in"],
  [".footer-main > div", "zoom-in"],
];

if (motionOK) {
  revealGroups.forEach(([selector, variant]) => {
    document.querySelectorAll(selector).forEach((element, index) => {
      element.classList.add("reveal", variant);
      element.style.setProperty("--reveal-delay", `${Math.min(index * 90, 420)}ms`);
    });
  });

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      entry.target.classList.toggle("is-visible", entry.isIntersecting);
    });
  }, { threshold: 0.14, rootMargin: "-6% 0px -8% 0px" });

  document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));
} else {
  document.querySelectorAll(".reveal").forEach((element) => element.classList.add("is-visible"));
}

const navLinks = [...document.querySelectorAll(".nav a[href^='#']")];
const navTargets = navLinks
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);
const parallaxElements = motionOK
  ? [...document.querySelectorAll(".banner-dots, .line-shape, .about-shape, .student-group")]
  : [];

const initSkillMapReaction = () => {
  const map = document.querySelector(".skill-map");
  if (!map || !motionOK) return;

  let frame = null;
  const current = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
  let isAnimating = false;

  const render = () => {
    current.x += (target.x - current.x) * 0.12;
    current.y += (target.y - current.y) * 0.12;

    map.style.setProperty("--map-ry", `${current.x * 5}deg`);
    map.style.setProperty("--map-rx", `${current.y * -4}deg`);
    map.style.setProperty("--float-x", `${current.x * 7}px`);
    map.style.setProperty("--float-y", `${current.y * 6}px`);

    if (Math.abs(target.x - current.x) > 0.005 || Math.abs(target.y - current.y) > 0.005) {
      frame = window.requestAnimationFrame(render);
    } else {
      isAnimating = false;
    }
  };

  const startMotion = () => {
    if (isAnimating) return;
    isAnimating = true;
    frame = window.requestAnimationFrame(render);
  };

  const setMapMotion = (clientX, clientY) => {
    const rect = map.getBoundingClientRect();
    target.x = Math.max(-1, Math.min(1, ((clientX - rect.left) / rect.width - 0.5) * 2));
    target.y = Math.max(-1, Math.min(1, ((clientY - rect.top) / rect.height - 0.5) * 2));
    startMotion();
  };

  const resetMapMotion = () => {
    target.x = 0;
    target.y = 0;
    startMotion();
  };

  map.addEventListener("pointermove", (event) => setMapMotion(event.clientX, event.clientY));
  map.addEventListener("pointerleave", resetMapMotion);
};

const setActiveNav = () => {
  if (!navLinks.length || !navTargets.length) return;

  const scrollPosition = window.scrollY + 150;
  let activeId = navTargets[0]?.id;

  navTargets.forEach((section) => {
    if (section.offsetTop <= scrollPosition) {
      activeId = section.id;
    }
  });

  navLinks.forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === `#${activeId}`);
  });
};

const updateScrollEffects = () => {
  const previousY = Number(document.body.dataset.scrollY || 0);
  document.body.classList.toggle("scroll-up", window.scrollY < previousY);
  document.body.classList.toggle("scroll-down", window.scrollY >= previousY);
  document.body.dataset.scrollY = String(window.scrollY);

  if (parallaxElements.length) {
    const y = Math.min(window.scrollY * 0.08, 42);
    parallaxElements.forEach((element, index) => {
      const direction = index % 2 === 0 ? 1 : -1;
      element.style.setProperty("--parallax-y", `${y * direction}px`);
      element.classList.add("parallax-soft");
    });
  }

  setActiveNav();
};

let ticking = false;
window.addEventListener("scroll", () => {
  if (!ticking) {
    window.requestAnimationFrame(() => {
      updateScrollEffects();
      ticking = false;
    });
    ticking = true;
  }
}, { passive: true });

const animateNumber = (element) => {
  const raw = element.dataset.value || element.textContent;
  const suffix = raw.replace(/[0-9]/g, "");
  const target = Number.parseInt(raw.replace(/\D/g, ""), 10);
  if (!Number.isFinite(target)) return;

  const duration = 1100;
  const start = performance.now();

  const frame = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = `${Math.round(target * eased)}${suffix}`;

    if (progress < 1) {
      window.requestAnimationFrame(frame);
    } else {
      element.textContent = raw;
      element.classList.add("counter-pop");
    }
  };

  window.requestAnimationFrame(frame);
};

document.querySelectorAll(".stats strong").forEach((stat) => {
  stat.dataset.value = stat.textContent;
});

const statsObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.querySelectorAll("strong").forEach(animateNumber);
      statsObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.45 });

const stats = document.querySelector(".stats");
if (stats) statsObserver.observe(stats);


const initMentorShowcase = () => {
  const section = document.querySelector(".mentor-showcase");
  if (!section) return;
  ensureMentorCardScroller();

  const mentorDetails = {
    "Rahul Singh": {
      role: "Senior Software Development Engineer",
      logo: "assets/img/company-logos/amazon.svg",
      logoAlt: "Amazon",
      image: "assets/img/mentors/rahul-singh-sm.jpg",
      rating: "4.9",
      reviews: "128",
      sessions: "142",
      note: "Guides learners through backend systems, interview prep, and production-grade software thinking."
    },
    "Archana S": {
      role: "Sr. Psychologist",
      logo: "assets/img/company-logos/nimhans.svg",
      logoAlt: "NIMHANS",
      image: "assets/img/mentors/archana-s-sm.jpg",
      rating: "4.8",
      reviews: "96",
      sessions: "96",
      note: "Supports learners with psychology foundations, counselling practice, and case-based mental health learning."
    },
    "Surya R": {
      role: "Data Engineer",
      logo: "assets/img/company-logos/hcl.svg",
      logoAlt: "HCL",
      image: "assets/img/mentors/surya-r-sm.jpg",
      rating: "4.7",
      reviews: "80",
      sessions: "80",
      note: "Helps learners understand SQL pipelines, cloud data workflows, and practical engineering habits."
    },
    "Tanya D": {
      role: "Data Analyst",
      logo: "assets/img/company-logos/adobe.svg",
      logoAlt: "Adobe",
      image: "assets/img/mentors/tanya-d-sm.jpg",
      rating: "4.8",
      reviews: "110",
      sessions: "110",
      note: "Mentors students in analytics thinking, dashboard storytelling, and clean data interpretation."
    },
    "Ravindra": {
      role: "Operations Lead",
      logo: "assets/img/company-logos/flipkart.svg",
      logoAlt: "Flipkart",
      image: "assets/img/mentors/ravindra-sm.jpg",
      rating: "4.7",
      reviews: "72",
      sessions: "72",
      note: "Brings marketplace operations, process planning, and team execution lessons into live sessions."
    },
    "Muskan": {
      role: "Psychologist",
      logo: "assets/img/company-logos/apollo.svg",
      logoAlt: "Apollo",
      image: "assets/img/mentors/muskan-sm.jpg",
      rating: "4.8",
      reviews: "90",
      sessions: "90",
      note: "Guides psychology learners through client-centred basics, observation, and applied case discussion."
    },
    "Tanishq": {
      role: "Full Stack Developer",
      logo: "assets/img/company-logos/infosys.svg",
      logoAlt: "Infosys",
      image: "assets/img/mentors/tanishq-sm.jpg",
      rating: "4.7",
      reviews: "88",
      sessions: "88",
      note: "Supports learners in frontend, backend, portfolio projects, and developer workflow fundamentals."
    },
    "Suvidha Sharma": {
      role: "Rehab Counsellor",
      logo: "assets/img/company-logos/rehab-centre.svg",
      logoAlt: "Rehab Centre",
      image: "assets/img/mentors/suvidha-sharma-sm.jpg",
      rating: "4.9",
      reviews: "99",
      sessions: "99",
      note: "Teaches psychology and rehabilitation concepts with patient, practical, real-world examples."
    }
  };

  const fields = {
    name: section.querySelector("[data-feature-mentor-name]"),
    role: section.querySelector("[data-feature-mentor-role]"),
    logo: section.querySelector("[data-feature-mentor-logo]"),
    rating: section.querySelector("[data-feature-mentor-rating]"),
    reviews: section.querySelector("[data-feature-mentor-reviews]"),
    sessions: section.querySelector("[data-feature-mentor-sessions]"),
    note: section.querySelector("[data-feature-mentor-note]"),
    image: section.querySelector("[data-feature-mentor-image]")
  };

  const activateMentor = (card) => {
    const name = card.querySelector("h3")?.textContent?.trim();
    const detail = mentorDetails[name];
    if (!detail) return;

    fields.name.textContent = name;
    fields.role.textContent = detail.role;
    fields.logo.src = detail.logo;
    fields.logo.alt = detail.logoAlt;
    fields.rating.textContent = detail.rating;
    fields.reviews.textContent = `(${detail.reviews} reviews)`;
    fields.sessions.textContent = detail.sessions;
    fields.note.textContent = detail.note;
    fields.image.src = detail.image;
    fields.image.alt = name;

    section.querySelectorAll(".mentor-tile").forEach((tile) => tile.classList.toggle("is-active", tile === card));
    section.querySelector(".mentor-feature-wide")?.classList.remove("is-swapping");
    requestAnimationFrame(() => section.querySelector(".mentor-feature-wide")?.classList.add("is-swapping"));
  };

  section.querySelectorAll(".mentor-tile").forEach((card) => {
    card.addEventListener("click", () => activateMentor(card));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activateMentor(card);
      }
    });
  });
};
const initFlyingReviews = () => {
  const wall = document.querySelector("[data-flying-reviews]");
  if (!wall) return;

  const rows = [...wall.querySelectorAll(".flying-review-row")];
  rows.forEach((row) => {
    row.innerHTML += row.innerHTML;
  });

  let shift = 0;
  let startX = 0;
  let startShift = 0;
  let isDragging = false;

  const setShift = (value) => {
    shift = Math.max(-420, Math.min(420, value));
    rows.forEach((row, index) => {
      const direction = row.classList.contains("reverse") ? -1 : 1;
      row.style.setProperty("--review-shift", `${shift * direction}px`);
      row.style.animationDuration = "58s";
    });
  };

  wall.addEventListener("pointerdown", (event) => {
    isDragging = true;
    startX = event.clientX;
    startShift = shift;
    wall.classList.add("is-dragging");
    wall.setPointerCapture?.(event.pointerId);
  });

  wall.addEventListener("pointermove", (event) => {
    if (!isDragging) return;
    setShift(startShift + event.clientX - startX);
  });

  const endDrag = (event) => {
    if (!isDragging) return;
    isDragging = false;
    wall.classList.remove("is-dragging");
    wall.releasePointerCapture?.(event.pointerId);
  };

  wall.addEventListener("pointerup", endDrag);
  wall.addEventListener("pointercancel", endDrag);
  wall.addEventListener("pointerleave", endDrag);
  wall.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
    event.preventDefault();
    setShift(shift - event.deltaY * 0.35);
  }, { passive: false });
};

const initCampusStepper = () => {
  document.querySelectorAll("[data-campus-stepper]").forEach((stepper) => {
    const indicators = [...stepper.querySelectorAll("[data-step-indicator]")];
    const connectors = [...stepper.querySelectorAll("[data-step-connector]")];
    const panels = [...stepper.querySelectorAll("[data-step-panel]")];
    const backButton = stepper.querySelector("[data-step-back]");
    const nextButton = stepper.querySelector("[data-step-next]");
    const total = panels.length;
    let current = Math.max(1, Math.min(total, Number(stepper.dataset.initialStep || 1)));
    let direction = 1;

    const setStep = (nextStep) => {
      const bounded = Math.max(1, Math.min(total, nextStep));
      direction = bounded >= current ? 1 : -1;
      current = bounded;
      stepper.dataset.currentStep = String(current);

      indicators.forEach((indicator) => {
        const step = Number(indicator.dataset.stepIndicator);
        indicator.classList.toggle("active", step === current);
        indicator.classList.toggle("complete", step < current);
        indicator.setAttribute("aria-selected", String(step === current));
      });

      connectors.forEach((connector) => {
        connector.classList.toggle("complete", Number(connector.dataset.stepConnector) < current);
      });

      panels.forEach((panel) => {
        const active = Number(panel.dataset.stepPanel) === current;
        panel.classList.toggle("active", active);
        panel.style.setProperty("--step-direction", direction);
      });

      if (backButton) backButton.disabled = current === 1;
      if (nextButton) nextButton.textContent = current === total ? "Complete" : "Next";
    };

    indicators.forEach((indicator) => {
      indicator.addEventListener("click", () => setStep(Number(indicator.dataset.stepIndicator)));
    });

    backButton?.addEventListener("click", () => setStep(current - 1));
    nextButton?.addEventListener("click", () => {
      if (current === total) {
        stepper.classList.add("completed-pulse");
        window.setTimeout(() => stepper.classList.remove("completed-pulse"), 650);
        return;
      }
      setStep(current + 1);
    });

    setStep(current);
  });
};

const courseRange = document.querySelector("#courseRange");
const orderRange = document.querySelector("#orderRange");
const courseValue = document.querySelector("#courseValue");
const orderValue = document.querySelector("#orderValue");
const earningAmount = document.querySelector("#earningAmount");

const formatIndianCurrency = (value) => {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "INR",
  }).format(value).replace(".00", "");
};

const updateEarnings = () => {
  if (!courseRange || !orderRange || !earningAmount) return;

  const courses = Number(courseRange.value);
  const order = Number(orderRange.value);
  const commissionRate = 0.08;
  const projected = Math.round(courses * order * commissionRate);

  courseValue.textContent = courses;
  orderValue.textContent = order;
  earningAmount.textContent = `${formatIndianCurrency(projected)}*`;
};

const launchpadPlans = {
  basics: {
    name: "Jenovate Basics",
    kicker: "Enrollment Open For 2026 Basics Plan",
    title: "Start Strong With One Focused Launchpad.",
    description: "Choose one mentor-led program and build real proof through live sessions, case studies, projects, certificates, and community support.",
    price: "INR 5,999",
    ribbon: "Focused Starter Plan",
    cardDescription: "Access one selected program with mentor-led learning, portfolio projects, certification, and lifetime community access.",
    checks: [
      "Access to 1 selected program",
      "Live mentor-led sessions",
      "Real-time case studies",
    ],
    cardItems: [
      "1 selected curriculum",
      "Portfolio-worthy projects",
      "Certificate and badges",
      "Lifetime community access",
    ],
    weeks: "12",
    tracks: "1",
    projects: "4",
    formCta: "Unlock Basics Access",
    finalTitle: "Build One Skill Properly.",
    finalCopy: "Start with a focused launchpad and graduate with mentor-reviewed proof.",
    sectionKicker: "Choose One Track",
    sectionTitle: "Pick Your Focused Basics Track",
    sectionCopy: "Basics gives you one selected program, so start with the discipline you want to build first.",
    toolsTitle: "Core Tools For Your Selected Track",
    tools: ["VS Code", "GitHub", "Notion", "Figma Basics", "Python Basics", "Portfolio Docs"],
    courses: [
      {
        theme: "blue",
        img: "course/1. Technology & Software Development/mk.avif",
        href: "course-detail.html?course=full-stack-web-development",
        label: "Option 01",
        title: "Web Development Starter",
        copy: "HTML, CSS, JavaScript, responsive layouts, and one deployable project.",
        cta: "Choose Track",
      },
      {
        theme: "green",
        img: "course/2. Artificial Intelligence & Data Science/premium_photo-1725907643701.avif",
        href: "course-detail.html?course=data-science",
        label: "Option 02",
        title: "Data Science Starter",
        copy: "Python, spreadsheets, analytics thinking, and beginner-friendly dashboards.",
        cta: "Choose Track",
      },
      {
        theme: "purple",
        img: "course/6. Design & Creative Arts/premium_photo-1661310081873-.avif",
        href: "course-detail.html?course=ui-ux",
        label: "Option 03",
        title: "UI/UX Starter",
        copy: "Research, wireframes, visual polish, and one clickable product prototype.",
        cta: "Choose Track",
      },
    ],
  },
  pro: {
    name: "Jenovate Pro",
    kicker: "Enrollment Open For 2026 Pro Plan",
    title: "Tailor Your Top 3 Programs With Mentor Support.",
    description: "Combine multiple programs, advanced real-world projects, mentor doubt-solving, career guidance, priority support, and free masterclasses.",
    price: "INR 7,999",
    ribbon: "Popular Flexible Plan",
    cardDescription: "Tailor up to three programs with advanced projects, roadmap guidance, priority support, and mentor-led growth.",
    checks: [
      "Everything in Basics, plus multi-program access",
      "Advanced real-world portfolio projects",
      "Career guidance with priority support",
    ],
    cardItems: [
      "Top 3 program access",
      "Mentor doubt-solving sessions",
      "Career guidance and roadmap",
      "Free masterclasses",
    ],
    weeks: "18",
    tracks: "3",
    projects: "9",
    formCta: "Unlock Pro Access",
    finalTitle: "Shape Your Own Skill Stack.",
    finalCopy: "Pick the programs that fit your goals and move with guided mentorship.",
    sectionKicker: "Choose Any 3 Programs",
    sectionTitle: "Build A Custom Pro Stack",
    sectionCopy: "Pro is made for learners who want a serious multi-skill path without taking every program at once.",
    toolsTitle: "Tools Added In Pro",
    tools: ["VS Code", "React.js", "Node.js", "MongoDB", "Figma", "GitHub", "Tableau", "Prompt Systems", "Career Roadmap"],
    courses: [
      {
        theme: "blue",
        img: "course/1. Technology & Software Development/mk.avif",
        href: "course-detail.html?course=full-stack-web-development",
        label: "Program 01",
        title: "Full Stack Web Development",
        copy: "Frontend, backend, database, deployment, and portfolio-grade web apps.",
        cta: "Explore",
      },
      {
        theme: "green",
        img: "course/2. Artificial Intelligence & Data Science/premium_photo-1725907643701.avif",
        href: "course-detail.html?course=data-science",
        label: "Program 02",
        title: "Data Science",
        copy: "Python, analytics, machine learning foundations, and real-world data projects.",
        cta: "Explore",
      },
      {
        theme: "purple",
        img: "course/6. Design & Creative Arts/premium_photo-1661310081873-.avif",
        href: "course-detail.html?course=ui-ux",
        label: "Program 03",
        title: "UI/UX Design",
        copy: "Product thinking, user research, wireframes, design systems, and prototypes.",
        cta: "Explore",
      },
      {
        theme: "amber",
        img: "course/4. Engineering & Emerging Technologies/premium_photo-1681010317789.avif",
        href: "course-detail.html?course=ai-tools-study-career",
        label: "Optional Swap",
        title: "AI Tools For Career",
        copy: "Prompting, automation, workflow design, and smart productivity systems.",
        cta: "Swap In",
      },
    ],
  },
  advanced: {
    name: "Jenovate Advanced",
    kicker: "Enrollment Open For 2026 Advanced Plan",
    title: "One Price. Every Skill. The Ultimate Developer Bundle.",
    description: "Master full stack development, data science, UI/UX, and AI tools together with unlimited program access, 1:1 mentor guidance, resume support, and simulations.",
    price: "INR 11,999",
    ribbon: "Most Complete Plan",
    cardDescription: "Full access to all launchpad programs, mentor guidance, live classes, resume optimization, simulations, and placement-focused support.",
    checks: [
      "Unlimited program access across launchpads",
      "1:1 mentor guidance and expert resume review",
      "On-demand live classes and simulation exercises",
    ],
    cardItems: [
      "Unlimited curriculums",
      "Resume and LinkedIn optimization",
      "On-demand live classes",
      "Simulation exercises",
    ],
    weeks: "24",
    tracks: "All",
    projects: "12",
    formCta: "Unlock Advanced Access",
    finalTitle: "Master Everything. Stop Choosing.",
    finalCopy: "Join focused learners in the all-in-one program today.",
    sectionKicker: "Unlimited Access",
    sectionTitle: "Everything Included In Advanced",
    sectionCopy: "Advanced opens the full Launchpad ecosystem with every major track, career support, simulations, and mentor guidance.",
    toolsTitle: "Complete Tool Stack",
    tools: ["VS Code", "React.js", "Node.js", "MongoDB", "AWS", "Figma", "GitHub", "Tableau", "Notion", "AI Prompting", "Resume Toolkit", "LinkedIn Optimization"],
    courses: [
      {
        theme: "blue",
        img: "course/1. Technology & Software Development/mk.avif",
        href: "course-detail.html?course=full-stack-web-development",
        label: "01",
        title: "Web Development",
        copy: "Front-end fundamentals, backend architecture, and portfolio-ready deployment.",
        cta: "Explore Course",
      },
      {
        theme: "green",
        img: "course/2. Artificial Intelligence & Data Science/premium_photo-1725907643701.avif",
        href: "course-detail.html?course=data-science",
        label: "02",
        title: "Data Science",
        copy: "Python, analytics, machine learning basics, and practical data projects.",
        cta: "Explore Course",
      },
      {
        theme: "purple",
        img: "course/6. Design & Creative Arts/premium_photo-1661310081873-.avif",
        href: "course-detail.html?course=ui-ux",
        label: "03",
        title: "UI/UX Design",
        copy: "Research, wireframes, visual systems, and clickable product prototypes.",
        cta: "Explore Course",
      },
      {
        theme: "amber",
        img: "course/4. Engineering & Emerging Technologies/premium_photo-1681010317789.avif",
        href: "course-detail.html?course=ai-tools-study-career",
        label: "04",
        title: "AI Tools",
        copy: "Prompting, automation, productivity workflows, and smart career systems.",
        cta: "Explore Course",
      },
    ],
  },
};

const formatLaunchpadPrice = (value, currency) => {
  const amount = String(value);
  return currency === "INR" ? `\u20b9${amount}` : `$${amount}`;
};

const toolIconMap = {
  "VS Code": "VS",
  "GitHub": "GH",
  "Notion": "N",
  "Figma Basics": "F",
  "Figma": "F",
  "Python Basics": "Py",
  "Portfolio Docs": "PD",
  "React.js": "R",
  "Node.js": "N",
  "MongoDB": "M",
  "Tableau": "T",
  "Prompt Systems": "AI",
  "Career Roadmap": "CR",
  "AWS": "AWS",
  "AI Prompting": "AI",
  "Resume Toolkit": "CV",
  "LinkedIn Optimization": "in"
};

const escapeSvgText = (value) => String(value ?? "").replace(/[&<>"]/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;"
}[char]));

const logoSlug = (value) => String(value || "")
  .toLowerCase()
  .replace(/&/g, "and")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const brandLogoMarkup = (name, compact = false) => {
  const label = escapeSvgText(name);
  const slug = logoSlug(name);
  const viewBox = compact ? "0 0 44 36" : "0 0 64 64";
  const scale = compact ? "translate(4 0) scale(.62)" : "";
  const wrap = (inner, bg = "#ffffff") => `<svg class="tool-logo-svg" xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${label} logo"><title>${label} logo</title><rect width="${compact ? 44 : 64}" height="${compact ? 36 : 64}" rx="${compact ? 9 : 16}" fill="${bg}"/>${compact ? `<g transform="${scale}">${inner}</g>` : inner}</svg>`;

  if (slug.includes("visual-studio") || slug.includes("vs-code") || slug === "vscode") {
    return wrap(`<path d="M48 11 24 25 14 17 9 20v24l5 3 10-8 24 14 7-4V15l-7-4Zm0 13v16L31 32l17-8ZM16 26l6 6-6 6V26Z" fill="#007ACC"/>`, "#eef6ff");
  }
  if (slug.includes("react")) {
    return wrap(`<circle cx="32" cy="32" r="5" fill="#149ECA"/><ellipse cx="32" cy="32" rx="24" ry="9" fill="none" stroke="#149ECA" stroke-width="4"/><ellipse cx="32" cy="32" rx="24" ry="9" fill="none" stroke="#149ECA" stroke-width="4" transform="rotate(60 32 32)"/><ellipse cx="32" cy="32" rx="24" ry="9" fill="none" stroke="#149ECA" stroke-width="4" transform="rotate(120 32 32)"/>`, "#edfaff");
  }
  if (slug.includes("node")) {
    return wrap(`<path d="M32 9 51 20v24L32 55 13 44V20L32 9Z" fill="#68A063"/><path d="M25 42V24h8c7 0 11 4 11 9s-4 9-11 9h-8Zm6-5h2c3 0 5-1 5-4s-2-4-5-4h-2v8Z" fill="#fff"/>`, "#ecf8ef");
  }
  if (slug.includes("mongo")) {
    return wrap(`<path d="M34 8c10 10 12 23 5 35-3 5-6 8-7 13-1-5-4-8-7-13-7-12-5-25 5-35l2-2 2 2Z" fill="#47A248"/><path d="M32 15v41" stroke="#2f6f35" stroke-width="3" stroke-linecap="round"/>`, "#eefaf0");
  }
  if (slug.includes("github")) {
    return wrap(`<path d="M32 10c-12 0-22 10-22 22 0 10 6 18 15 21 1 0 2-1 2-2v-5c-6 1-8-3-8-3-1-3-3-4-3-4-2-1 0-1 0-1 3 0 5 3 5 3 2 4 6 3 7 2 0-2 1-3 2-4-5-1-10-3-10-11 0-2 1-5 3-6 0-1-1-4 0-7 0 0 3-1 8 3 2-1 5-1 7 0 5-4 8-3 8-3 1 3 0 6 0 7 2 1 3 4 3 6 0 8-5 10-10 11 1 1 2 3 2 6v6c0 1 1 2 2 2 9-3 15-11 15-21 0-12-10-22-22-22Z" fill="#24292f"/>`, "#f6f8fa");
  }
  if (slug.includes("figma")) {
    return wrap(`<circle cx="27" cy="17" r="8" fill="#F24E1E"/><circle cx="37" cy="17" r="8" fill="#FF7262"/><circle cx="27" cy="32" r="8" fill="#A259FF"/><circle cx="37" cy="32" r="8" fill="#1ABCFE"/><circle cx="27" cy="47" r="8" fill="#0ACF83"/>`, "#fff7f2");
  }
  if (slug.includes("aws")) {
    return wrap(`<text x="32" y="31" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="900" fill="#252F3E">AWS</text><path d="M21 39c8 5 17 5 26 0" fill="none" stroke="#FF9900" stroke-width="4" stroke-linecap="round"/><path d="M44 38h7l-4 6" fill="none" stroke="#FF9900" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`, "#fff8ea");
  }
  if (slug.includes("azure")) {
    return wrap(`<path d="M33 9 17 46h13l4-9 12 9H58L39 9h-6Zm2 16 7 14-9-6 2-8Z" fill="#0078D4"/>`, "#eef7ff");
  }
  if (slug.includes("google-cloud")) {
    return wrap(`<path d="M23 42h23a10 10 0 0 0 1-20 17 17 0 0 0-32 6 8 8 0 0 0 8 14Z" fill="none" stroke="#4285F4" stroke-width="6" stroke-linecap="round"/><path d="M15 32c0-5 4-10 9-11" stroke="#34A853" stroke-width="6" stroke-linecap="round"/><path d="M45 22c3 0 6 2 8 5" stroke="#FBBC05" stroke-width="6" stroke-linecap="round"/><path d="M23 42h8" stroke="#EA4335" stroke-width="6" stroke-linecap="round"/>`, "#f7fbff");
  }
  if (slug.includes("docker")) {
    return wrap(`<path d="M16 31h7v-7h8v7h7v-7h8v7h5c-2 13-11 19-23 19-8 0-14-4-17-11 4 0 6-2 8-5h-3v-3Zm8 0h7v7h-7v-7Zm-8 0h7v7h-7v-7Zm16 0h7v7h-7v-7Zm8 0h7v7h-7v-7Z" fill="#2496ED"/>`, "#eef8ff");
  }
  if (slug.includes("kubernetes")) {
    return wrap(`<path d="M32 8 52 20v24L32 56 12 44V20L32 8Z" fill="#326CE5"/><circle cx="32" cy="32" r="10" fill="none" stroke="#fff" stroke-width="4"/><path d="M32 17v10M32 37v10M17 32h10M37 32h10M22 22l7 7M35 35l7 7M42 22l-7 7M29 35l-7 7" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`, "#eef4ff");
  }
  if (slug.includes("terraform")) {
    return wrap(`<path d="M15 17 29 25v16l-14-8V17Z" fill="#7B42BC"/><path d="M31 25 45 17v16l-14 8V25Z" fill="#5C4EE5"/><path d="M31 43 45 35v16l-14 8V43Z" fill="#3B2F82"/><path d="M31 9 45 17l-14 8-14-8 14-8Z" fill="#9D7CE2"/>`, "#f4efff");
  }
  if (slug.includes("tableau")) {
    return wrap(`<g stroke-width="3" stroke-linecap="round"><path d="M32 14v10M27 19h10" stroke="#4E79A7"/><path d="M18 27v9M14 32h9" stroke="#F28E2B"/><path d="M46 27v9M42 32h9" stroke="#E15759"/><path d="M32 40v10M27 45h10" stroke="#76B7B2"/><path d="M32 28v8M28 32h8" stroke="#59A14F"/></g>`, "#f7fbff");
  }
  if (slug.includes("notion")) {
    return wrap(`<rect x="16" y="14" width="33" height="37" rx="3" fill="#fff" stroke="#111" stroke-width="4"/><path d="M22 22h7l12 18V22h5v28h-6L28 31v19h-6V22Z" fill="#111"/>`, "#f7f7f7");
  }
  if (slug.includes("linkedin")) {
    return wrap(`<rect x="14" y="14" width="36" height="36" rx="6" fill="#0A66C2"/><circle cx="24" cy="25" r="4" fill="#fff"/><path d="M20 31h8v17h-8V31Zm13 0h7v3c1-2 3-4 7-4 6 0 9 4 9 11v7h-8v-7c0-3-1-5-4-5s-4 2-4 5v7h-7V31Z" fill="#fff"/>`, "#eef6ff");
  }
  if (slug.includes("prompt") || slug.includes("ai")) {
    return wrap(`<path d="M32 10 36 25l15 4-15 4-4 15-4-15-15-4 15-4 4-15Z" fill="#7C3AED"/><circle cx="47" cy="18" r="4" fill="#F59E0B"/><circle cx="18" cy="47" r="4" fill="#06B6D4"/>`, "#f7f0ff");
  }
  if (slug.includes("resume") || slug.includes("career") || slug.includes("portfolio-doc")) {
    return wrap(`<path d="M20 10h19l9 9v35H20V10Z" fill="#fff" stroke="#475467" stroke-width="4"/><path d="M39 10v10h9" fill="none" stroke="#475467" stroke-width="4"/><path d="M26 30h16M26 38h20M26 46h13" stroke="#2258F4" stroke-width="4" stroke-linecap="round"/>`, "#f4f7fb");
  }
  if (slug.includes("kali")) {
    return wrap(`<path d="M32 9 51 18v13c0 12-8 20-19 24-11-4-19-12-19-24V18l19-9Z" fill="#367BF0"/><path d="M22 35c7-13 17-11 22-4-7-2-13 0-17 8l8 2-15 6 2-12Z" fill="#fff"/>`, "#eef5ff");
  }
  if (slug.includes("wireshark")) {
    return wrap(`<path d="M16 40c8-23 24-28 36-16-9-1-16 4-22 16h18c-4 7-11 11-20 11-7 0-12-4-12-11Z" fill="#1679C4"/><path d="M21 40h31" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`, "#eef8ff");
  }
  if (slug.includes("nmap")) {
    return wrap(`<circle cx="32" cy="32" r="20" fill="none" stroke="#2563EB" stroke-width="4"/><circle cx="32" cy="32" r="10" fill="none" stroke="#2563EB" stroke-width="3"/><path d="M32 12v40M12 32h40" stroke="#2563EB" stroke-width="3"/><circle cx="41" cy="23" r="4" fill="#06B6D4"/>`, "#eef6ff");
  }
  if (slug.includes("burp")) {
    return wrap(`<path d="M23 14h16c8 0 12 4 12 10 0 4-2 7-6 9 5 2 7 5 7 9 0 7-5 11-13 11H23V14Zm9 15h6c3 0 5-1 5-4s-2-4-5-4h-6v8Zm0 17h7c3 0 5-2 5-5s-2-5-5-5h-7v10Z" fill="#FF6633"/>`, "#fff2ed");
  }
  if (slug.includes("owasp") || slug.includes("zap")) {
    return wrap(`<path d="M35 8 17 36h13l-2 20 19-29H34l1-19Z" fill="#F5A400"/><path d="M18 18c5-5 14-8 24-4" fill="none" stroke="#111827" stroke-width="3" stroke-linecap="round"/>`, "#fff8e6");
  }
  if (slug.includes("python")) {
    return wrap(`<path d="M32 11c-10 0-14 4-14 11v6h18v4H17c-6 0-10 4-10 11s5 10 12 10h7v-8c0-7 4-11 11-11h9c6 0 10-4 10-11S49 11 32 11Z" fill="#3776AB"/><path d="M32 53c10 0 14-4 14-11v-6H28v-4h19c6 0 10-4 10-11S52 11 45 11h-7v8c0 7-4 11-11 11h-9c-6 0-10 4-10 11s7 12 24 12Z" fill="#FFD43B"/><circle cx="27" cy="20" r="2" fill="#fff"/><circle cx="37" cy="44" r="2" fill="#111"/>`, "#f4f8ff");
  }
  if (slug.includes("java")) {
    return wrap(`<path d="M26 42h18c0 7-4 11-12 11s-12-4-12-11h6Z" fill="#E76F00"/><path d="M22 36h24" stroke="#5382A1" stroke-width="4" stroke-linecap="round"/><path d="M28 14c8 7-7 9 2 17M38 11c7 8-8 11 0 19" fill="none" stroke="#E76F00" stroke-width="4" stroke-linecap="round"/>`, "#fff7ef");
  }
  if (slug.includes("html")) {
    return wrap(`<path d="M16 11h32l-3 38-13 4-13-4-3-38Z" fill="#E34F26"/><path d="M24 23h17l-1 6H30l1 5h9l-1 10-7 2-7-2-.5-6h6l.2 2 2 .5 2-.5.3-3H24l-1-14Z" fill="#fff"/>`, "#fff1ec");
  }
  if (slug.includes("css")) {
    return wrap(`<path d="M16 11h32l-3 38-13 4-13-4-3-38Z" fill="#1572B6"/><path d="M24 23h17l-.5 6H30l-.3 4h10l-1 11-7 2-7-2-.5-6h6l.2 2 2 .5 2-.5.3-3H24l1-14Z" fill="#fff"/>`, "#eef6ff");
  }
  if (slug.includes("javascript")) {
    return wrap(`<rect x="13" y="13" width="38" height="38" rx="4" fill="#F7DF1E"/><path d="M25 43c3 2 8 2 8-3V25h-6v14c0 2-1 2-3 1l1 3Zm12-1c2 2 6 3 10 1 4-2 4-8-1-10l-3-1c-2-1-2-2 0-2 1 0 3 1 4 2l3-4c-3-3-8-4-12-1-4 3-3 8 2 10l3 1c2 1 2 2 0 2-2 1-4 0-6-2l-3 4Z" fill="#111"/>`, "#fffbe8");
  }
  return wrap(`<rect x="17" y="18" width="30" height="24" rx="5" fill="#2258F4" opacity=".14"/><path d="M22 25h20M22 32h14M22 39h20" stroke="#2258F4" stroke-width="4" stroke-linecap="round"/><circle cx="47" cy="18" r="6" fill="#12B76A"/>`, "#f5f8ff");
};

const launchpadToolLogoMarkup = (tool) => brandLogoMarkup(tool, true);

const slugifyTool = (tool) => String(tool || "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const planFormValueMap = {
  basics: "Basics",
  pro: "Pro",
  advanced: "Advanced"
};

const initLaunchpadPricing = () => {
  const planPage = document.querySelector(".launchpad-plan-page, .home-plan-preview");
  if (!planPage) return;

  const buttons = document.querySelectorAll("[data-launchpad-currency]");
  const prices = document.querySelectorAll("[data-price]");
  let currency = "INR";

  const setCurrency = (nextCurrency) => {
    currency = nextCurrency === "USD" ? "USD" : "INR";
    buttons.forEach((button) => {
      const active = button.dataset.launchpadCurrency === currency;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    prices.forEach((price) => {
      price.textContent = formatLaunchpadPrice(price.dataset[currency.toLowerCase()], currency);
    });
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => setCurrency(button.dataset.launchpadCurrency));
  });

  document.querySelectorAll("[data-plan-card][data-plan-href]").forEach((card) => {
    const openPlan = () => {
      window.location.href = card.dataset.planHref;
    };

    card.addEventListener("click", (event) => {
      if (event.target.closest("a, button")) return;
      openPlan();
    });

    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openPlan();
    });
  });

  setCurrency("INR");
};

const initLaunchpadPlanDetails = () => {
  const detailPage = document.querySelector(".launchpad-detail-page");
  if (!detailPage) return;

  const params = new URLSearchParams(window.location.search);
  const selectedKey = launchpadPlans[params.get("plan")] ? params.get("plan") : "advanced";
  const plan = launchpadPlans[selectedKey];

  const setText = (selector, text) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = text;
  };
  const renderList = (selector, items) => {
    const list = document.querySelector(selector);
    if (!list) return;
    list.innerHTML = items.map((item) => `<li>${item}</li>`).join("");
  };
  const renderTools = () => {
    const container = document.querySelector("[data-plan-tools]");
    if (!container) return;
    container.innerHTML = plan.tools.map((tool) => {
      const icon = toolIconMap[tool] || tool.slice(0, 2).toUpperCase();
      return `<span data-tool-icon="${icon}" data-tool="${slugifyTool(tool)}">${launchpadToolLogoMarkup(tool)}${tool}</span>`;
    }).join("");
  };
  const renderCourses = () => {
    const container = document.querySelector("[data-plan-courses]");
    if (!container) return;
    container.innerHTML = plan.courses.map((course) => `
      <a class="launchpad-card ${course.theme}" href="${course.href}">
        <img src="${course.img}" alt="" loading="lazy" decoding="async">
        <span>${course.label}</span>
        <h3>${course.title}</h3>
        <p>${course.copy}</p>
        <b>${course.cta}</b>
      </a>
    `).join("");
  };
  const updatePlanLinks = () => {
    document.querySelectorAll(".plan-link").forEach((link) => {
      const active = link.href.includes(`plan=${selectedKey}`);
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
    });
  };

  document.title = `${plan.name} | Jenovate Launchpad`;
  setText("[data-plan-kicker]", plan.kicker);
  setText("[data-plan-title]", plan.title);
  setText("[data-plan-description]", plan.description);
  setText("[data-plan-price]", plan.price);
  setText("[data-plan-ribbon]", plan.ribbon);
  setText("[data-plan-card-name]", plan.name);
  setText("[data-plan-card-price]", plan.price);
  setText("[data-plan-card-description]", plan.cardDescription);
  setText("[data-plan-weeks]", plan.weeks);
  setText("[data-plan-tracks]", plan.tracks);
  setText("[data-plan-projects]", plan.projects);
  setText("[data-plan-form-cta]", plan.formCta);
  setText("[data-plan-final-title]", plan.finalTitle);
  setText("[data-plan-final-copy]", plan.finalCopy);
  setText("[data-selected-plan-label]", `Viewing ${plan.name}`);
  setText("[data-plan-section-kicker]", plan.sectionKicker);
  setText("[data-plan-section-title]", plan.sectionTitle);
  setText("[data-plan-section-copy]", plan.sectionCopy);
  setText("[data-plan-tools-title]", plan.toolsTitle);
  renderList("[data-plan-checks]", plan.checks);
  renderList("[data-plan-card-list]", plan.cardItems);
  renderTools();
  renderCourses();
  updatePlanLinks();

  const planFormUrl = `${launchpadFormUrl}&plan=${encodeURIComponent(planFormValueMap[selectedKey] || plan.name)}`;
  const interest = document.querySelector("[data-plan-interest]");
  if (interest) interest.value = planFormValueMap[selectedKey] || plan.name;

  document.querySelectorAll(".launchpad-form-link").forEach((link) => {
    link.href = planFormUrl;
  });

  const inlineForm = document.querySelector(".launchpad-form");
  inlineForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(inlineForm);
    const target = new URL(planFormUrl, window.location.href);
    const fieldMap = {
      student_name: "student_name",
      email: "email",
      phone: "phone",
      plan: "plan"
    };

    Object.entries(fieldMap).forEach(([queryKey, formKey]) => {
      const value = String(formData.get(formKey) || "").trim();
      if (value) target.searchParams.set(queryKey, value);
    });

    window.location.href = target.href;
  }, { once: true });
};

[courseRange, orderRange].forEach((input) => {
  input?.addEventListener("input", updateEarnings);
});

updateEarnings();
initPremiumCategoryCards();
initCourseSearch();
initSkillMapReaction();
initFlyingReviews();
initMentorShowcase();
initCampusStepper();
initLaunchpadPricing();
initLaunchpadPlanDetails();
updateScrollEffects();

document.querySelectorAll(".login").forEach((button) => {
  button.addEventListener("click", () => {
    window.location.href = "login.html";
  });
});

const initJoinModal = () => {
  if (!document.querySelector(".join-us")) return;

  document.querySelectorAll(".join-us").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const href = button.getAttribute("href") || "";
      if (button.dataset.formTarget === "student") {
        window.location.href = studentFormUrl;
        return;
      }
      if (href && !href.startsWith("#")) {
        window.location.href = href;
        return;
      }
      if (href.startsWith("#")) {
        const target = document.querySelector(href);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          history.replaceState(null, "", href);
          return;
        }
      }
      window.location.href = studentFormUrl;
    });
  });
};

initJoinModal();
