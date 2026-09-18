const mentorImages = [
  "assets/img/instructor/instructor04.png",
  "assets/img/instructor/instructor01.png",
  "assets/img/instructor/instructor03.png",
  "assets/img/instructor/instructor02.png",
  "assets/img/instructor/instructor_two01.png",
  "assets/img/instructor/instructor_two02.png"
];

const mentorProfilesByName = {
  "Karthik Raman": mentorImages[1],
  "Vignesh Iyer": mentorImages[0],
  "Aravind Subramanian": mentorImages[1],
  "Aditya Shetty": mentorImages[0],
  "Rahul Nambiar": mentorImages[1],
  "Suresh Narayanan": mentorImages[0],
  "Priya Nair": mentorImages[3],
  "Lakshmi Menon": mentorImages[2],
  "Meera Krishnan": mentorImages[4],
  "Nithya Srinivasan": mentorImages[3],
  "Ananya Rao": mentorImages[4],
  "Devika Raghavan": mentorImages[2],
  "Anjali Nair": mentorImages[3],
  "Sneha Varghese": mentorImages[2],
  "Nandita Iyer": mentorImages[2],
  "Dr. Kavya Menon": mentorImages[4],
  "Ishaan Prakash": mentorImages[1],
  "Riya Menon": mentorImages[2]
};

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

const courseSupportImagesBySlug = {
  "javascript-imagination": ["course/1. Technology & Software Development/st.avif", "course/1. Technology & Software Development/we.avif"],
  "react-frontend-bootcamp": ["course/1. Technology & Software Development/mk.avif", "course/1. Technology & Software Development/we.avif"],
  "python-data-analytics": ["course/1. Technology & Software Development/mk.avif", "course/1. Technology & Software Development/st.avif"],
  "graphic-design-beginners": ["course/6. Design & Creative Arts/premium_photo-1661412864160-e0.avif", "course/6. Design & Creative Arts/premium_photo-172362970.avif"],
  "ui-ux-mobile-sprint": ["course/6. Design & Creative Arts/premium_photo-1661310081873-.avif", "course/6. Design & Creative Arts/premium_photo-172362970.avif"],
  "brand-identity-masterclass": ["course/6. Design & Creative Arts/premium_photo-1661310081873-.avif", "course/6. Design & Creative Arts/premium_photo-1661412864160-e0.avif"],
  "facebook-digital-marketing": ["course/5. Business, Finance & Marketing/premium_photo-1661604346220-5208d18cb34e.avif", "course/5. Business, Finance & Marketing/premium_photo-1681488262364.avif"],
  "social-ads-content-strategy": ["course/5. Business, Finance & Marketing/premium_photo-1661443781814.avif", "course/5. Business, Finance & Marketing/premium_photo-1681488262364.avif"],
  "financial-analyst-investing": ["course/5. Business, Finance & Marketing/premium_photo-1664476794112.avif", "course/5. Business, Finance & Marketing/premium_photo-1681487767138.avif"],
  "personal-finance-students": ["course/5. Business, Finance & Marketing/premium_photo-1663040328859.avif", "course/7. Healthcare & Human Sciences/importance-of-.webp"],
  "startup-business-strategy": ["course/5. Business, Finance & Marketing/premium_photo-1681487767138.avif", "course/5. Business, Finance & Marketing/premium_photo-1726804880693-8fcdd773ce80.avif"],
  "product-management-fundamentals": ["course/5. Business, Finance & Marketing/premium_photo-1733328013343.avif", "course/5. Business, Finance & Marketing/ishant-mishra-osWDvhPlGLU.jpg"],
  "team-leadership-communication": ["course/5. Business, Finance & Marketing/premium_photo-1726812103168-6ad609e53f94.avif", "course/5. Business, Finance & Marketing/ishant-mishra-osWDvhPlGLU.jpg"],
  "wellness-productivity-system": ["course/7. Healthcare & Human Sciences/importance-of-.webp", "course/7. Healthcare & Human Sciences/ux-788002_640.webp"],
  "ai-tools-study-career": ["course/2. Artificial Intelligence & Data Science/premium_photo-1725907643701.avif", "course/2. Artificial Intelligence & Data Science/re.avif"],
  "cyber-security-basics": ["course/3. Cyber Security, Cloud & DevOps/istockphoto-1556021855.jpg", "course/3. Cyber Security, Cloud & DevOps/istockphoto-2196516183-612x612.jpg"],
  "photography-visual-storytelling": ["course/6. Design & Creative Arts/hyundai-motor-group-V1DFo8C4JPA.jpg", "course/6. Design & Creative Arts/premium_photo-1661771683263.avif"]
};

const courseAssetFilePattern = /^(?:development|graphicDesign|marketing|Finance|business|management|lifestyle|aitool|cyber|photo)\d\.jpg$/;

const resolveLocalAssetPath = (src) => {
  const value = String(src || "").trim();
  if (!value || /^(?:[a-z]+:)?\/\//i.test(value) || value.startsWith("/") || value.includes("/")) return value;
  if (courseAssetFilePattern.test(value)) return `course/${value}`;
  if (value === "whatsapp-logo.png") return `logos/${value}`;
  return value;
};

const mentorImageBySlug = {
  "javascript-imagination": mentorImages[0],
  "graphic-design-beginners": mentorImages[1],
  "facebook-digital-marketing": mentorImages[2],
  "financial-analyst-investing": mentorImages[3],
  "react-frontend-bootcamp": mentorImages[4],
  "python-data-analytics": mentorImages[5],
  "ui-ux-mobile-sprint": mentorImages[0],
  "brand-identity-masterclass": mentorImages[1],
  "social-ads-content-strategy": mentorImages[2],
  "startup-business-strategy": mentorImages[3],
  "product-management-fundamentals": mentorImages[4],
  "personal-finance-students": mentorImages[5],
  "wellness-productivity-system": mentorImages[0],
  "team-leadership-communication": mentorImages[1],
  "ai-tools-study-career": mentorImages[2],
  "cyber-security-basics": mentorImages[3],
  "photography-visual-storytelling": mentorImages[4]
};

const courseSeeds = {
  "javascript-imagination": {
    title: "Learning JavaScript With Imagination",
    category: "Development",
    mentor: "Karthik Raman",
    price: "INR 5,999",
    rating: "4.8",
    image: "assets/img/courses/course_thumb01.jpg",
    mentorImage: mentorImages[0],
    summary: "Turn JavaScript fundamentals into playful browser experiences, interactive components, and a polished frontend portfolio project.",
    modules: 8,
    hours: "22.5",
    learners: "540+",
    level: "Beginner to Intermediate",
    score: "96%",
    curriculumHeading: "Write JavaScript that feels alive.",
    curriculumIntro: "Start with the language, then use it to build interactions that respond clearly to real users.",
    lessons: [
      ["JavaScript Thinking", "Variables, functions, arrays, and objects through visual mini challenges."],
      ["DOM and Interaction", "Build menus, filters, forms, and stateful components without a framework."],
      ["Creative Frontend Project", "Combine data, animation, and accessibility into a complete browser experience."]
    ],
    projects: ["Interactive Story Builder", "Smart Course Discovery App"],
    bio: "Arjun is a Bengaluru-based frontend engineer who has helped early-career developers build reliable interfaces for consumer products.",
    experience: "9+ Years Frontend",
    credential: "Former Product Engineering Lead",
    community: ["NK", "The DOM exercises finally made event handling click for me.", "PS", "Arjun's review helped me simplify my project code before publishing it."]
  },
  "graphic-design-beginners": {
    title: "The Complete Graphic Design for Beginners",
    category: "Graphic Design",
    mentor: "Nandita Iyer",
    price: "INR 5,999",
    rating: "4.5",
    image: "assets/img/courses/course_thumb02.jpg",
    mentorImage: mentorImages[2],
    summary: "Learn the foundations of visual communication and create confident layouts, brand assets, and presentation-ready design work.",
    modules: 7,
    hours: "18",
    learners: "420+",
    level: "Beginner Friendly",
    score: "94%",
    curriculumHeading: "Build your visual design instincts.",
    curriculumIntro: "Understand why designs work before moving into practical tools and polished compositions.",
    lessons: [
      ["Design Foundations", "Use hierarchy, balance, contrast, and spacing to make ideas easier to understand."],
      ["Color and Typography", "Choose type and color systems that support a clear visual voice."],
      ["Portfolio Composition", "Create a complete campaign layout and present your design decisions."]
    ],
    projects: ["Festival Campaign Kit", "Modern Editorial Poster"],
    bio: "Nandita is a Mumbai-based visual designer known for building identity systems and campaigns for education and lifestyle brands.",
    experience: "10+ Years Design",
    credential: "Brand and Editorial Specialist",
    community: ["RA", "The typography breakdown changed how I look at every poster.", "SM", "My final campaign looks much more professional after the critique."]
  },
  "facebook-digital-marketing": {
    title: "Learning Digital Marketing on Facebook",
    category: "Marketing",
    mentor: "Lakshmi Menon",
    price: "INR 5,999",
    rating: "4.3",
    image: "assets/img/courses/course_thumb03.jpg",
    mentorImage: mentorImages[2],
    summary: "Plan, launch, and improve Facebook campaigns using audience research, creative testing, and practical performance analysis.",
    modules: 6,
    hours: "16.5",
    learners: "380+",
    level: "Campaign Ready",
    score: "92%",
    curriculumHeading: "Turn attention into measurable growth.",
    curriculumIntro: "Learn how strategy, creative, targeting, and reporting work together inside a real campaign.",
    lessons: [
      ["Audience and Offer", "Define customer segments and shape an offer that earns attention."],
      ["Creative Testing", "Develop campaign creatives and run structured message experiments."],
      ["Campaign Optimization", "Read performance data and make confident budget decisions."]
    ],
    projects: ["Local Brand Campaign Plan", "Ad Performance Dashboard"],
    bio: "Priya is a Kochi-based growth marketer who has managed paid social campaigns for startups, creators, and direct-to-consumer brands.",
    experience: "8+ Years Growth",
    credential: "Paid Social Strategy Lead",
    community: ["AK", "The audience worksheet stopped me from guessing who my customer is.", "DV", "I used the testing framework in my internship campaign this week."]
  },
  "financial-analyst-investing": {
    title: "Financial Analyst Training & Investing Course",
    category: "Finance",
    mentor: "Vignesh Iyer",
    price: "INR 5,999",
    rating: "4.8",
    image: "assets/img/courses/course_thumb04.jpg",
    mentorImage: mentorImages[1],
    summary: "Develop financial analysis skills with practical statements, valuation methods, investment research, and risk-aware decision making.",
    modules: 9,
    hours: "26",
    learners: "610+",
    level: "Analyst Track",
    score: "97%",
    curriculumHeading: "Read the story behind the numbers.",
    curriculumIntro: "Move from financial statements to informed investment analysis using repeatable analyst workflows.",
    lessons: [
      ["Financial Statements", "Connect income statements, balance sheets, and cash flow reports."],
      ["Valuation Fundamentals", "Use ratios, comparable companies, and discounted cash flow concepts."],
      ["Investment Research", "Write a concise investment note supported by evidence and risk analysis."]
    ],
    projects: ["Company Valuation Workbook", "Investment Research Note"],
    bio: "Rohan is a Pune-based finance professional who has trained analysts in equity research, valuation, and business performance reporting.",
    experience: "11+ Years Finance",
    credential: "Equity Research Mentor",
    community: ["VS", "The statement linking exercise made financial reports much less intimidating.", "TG", "Rohan's feedback made my valuation assumptions more realistic."]
  },
  "react-frontend-bootcamp": {
    title: "React Frontend Bootcamp for Career Projects",
    category: "Development",
    mentor: "Karthik Raman",
    price: "INR 5,999",
    rating: "4.7",
    image: "assets/img/courses/course_thumb01.jpg",
    mentorImage: mentorImages[0],
    summary: "Build modern React applications with reusable components, clean state management, API integration, and portfolio-ready polish.",
    modules: 10,
    hours: "31",
    learners: "490+",
    level: "Career Bootcamp",
    score: "95%",
    curriculumHeading: "Ship React projects with confidence.",
    curriculumIntro: "Learn component thinking, application state, and production patterns by building complete interfaces.",
    lessons: [
      ["Component Architecture", "Break complex screens into reusable, maintainable component systems."],
      ["State and Data", "Handle forms, filters, API data, loading states, and errors clearly."],
      ["Production Portfolio App", "Build, refine, and present a complete React product experience."]
    ],
    projects: ["Student Analytics Dashboard", "Collaborative Task Manager"],
    bio: "Karthik is a Chennai-based software engineer who has led frontend teams building SaaS and learning products.",
    experience: "10+ Years React",
    credential: "Frontend Architecture Lead",
    community: ["AP", "The component planning method saved me hours on my capstone.", "JG", "My project finally has proper loading and error states."]
  },
  "python-data-analytics": {
    title: "Python Data Analytics From Zero",
    category: "Development",
    mentor: "Meera Krishnan",
    price: "INR 5,999",
    rating: "4.6",
    image: "assets/img/courses/course_thumb04.jpg",
    mentorImage: mentorImages[2],
    summary: "Use Python, pandas, and visualization to clean real datasets, answer useful questions, and communicate insights clearly.",
    modules: 8,
    hours: "24",
    learners: "570+",
    level: "Beginner Data Track",
    score: "95%",
    curriculumHeading: "Find useful answers in messy data.",
    curriculumIntro: "Learn a practical analysis workflow from importing a dataset to presenting a clear recommendation.",
    lessons: [
      ["Python for Analysis", "Work with data types, functions, notebooks, and reusable analysis steps."],
      ["Cleaning and Exploration", "Use pandas to prepare data and discover patterns worth investigating."],
      ["Insight Storytelling", "Create visualizations and explain what the data means for a decision."]
    ],
    projects: ["Sales Performance Analysis", "Student Outcome Dashboard"],
    bio: "Meera is a Hyderabad-based data analyst who has built reporting systems for operations, education, and customer growth teams.",
    experience: "8+ Years Analytics",
    credential: "Python and BI Mentor",
    community: ["KS", "I cleaned my first real CSV without feeling lost.", "NR", "The storytelling section helped me explain charts in interviews."]
  },
  "ui-ux-mobile-sprint": {
    title: "UI UX Design Sprint for Mobile Apps",
    category: "Graphic Design",
    mentor: "Anjali Nair",
    price: "INR 5,999",
    rating: "4.9",
    image: "assets/img/courses/course_thumb02.jpg",
    mentorImage: mentorImages[3],
    summary: "Research, structure, prototype, and test a mobile product experience using a focused UI/UX design sprint.",
    modules: 8,
    hours: "21",
    learners: "450+",
    level: "Portfolio Sprint",
    score: "98%",
    curriculumHeading: "Design mobile flows people understand.",
    curriculumIntro: "Go from a real user problem to a tested mobile prototype with a clear design rationale.",
    lessons: [
      ["User Problem Framing", "Turn assumptions into research questions and useful user insights."],
      ["Flows and Wireframes", "Structure tasks, navigation, and screens before styling begins."],
      ["Prototype and Test", "Create a polished prototype and improve it with usability feedback."]
    ],
    projects: ["Campus Companion App", "Personal Finance Mobile Flow"],
    bio: "Aisha is a Bengaluru-based product designer who has worked on mobile experiences for fintech and consumer technology teams.",
    experience: "9+ Years Product Design",
    credential: "Mobile UX Specialist",
    community: ["AN", "The user flow exercise fixed the biggest problem in my app.", "RK", "Aisha's critique made my prototype feel far more intentional."]
  },
  "brand-identity-masterclass": {
    title: "Brand Identity Design Masterclass",
    category: "Graphic Design",
    mentor: "Devika Raghavan",
    price: "INR 5,999",
    rating: "4.4",
    image: "assets/img/courses/course_thumb03.jpg",
    mentorImage: mentorImages[2],
    summary: "Create a distinctive brand identity with strategy, visual direction, logo thinking, and a usable brand system.",
    modules: 7,
    hours: "19",
    learners: "330+",
    level: "Creative Masterclass",
    score: "93%",
    curriculumHeading: "Build brands with a reason behind every choice.",
    curriculumIntro: "Connect audience, positioning, and visual design into an identity that can grow consistently.",
    lessons: [
      ["Brand Strategy", "Define audience, personality, positioning, and the central brand idea."],
      ["Visual Direction", "Explore typography, color, imagery, and logo routes with purpose."],
      ["Identity System", "Document a flexible system that works across real touchpoints."]
    ],
    projects: ["Cafe Brand Identity", "Creator Brand Guidelines"],
    bio: "Devika is an Ahmedabad-based brand designer who creates identity systems for emerging businesses and cultural projects.",
    experience: "9+ Years Branding",
    credential: "Independent Brand Consultant",
    community: ["MN", "The strategy phase stopped me from jumping straight into logos.", "ST", "My guidelines now explain how the brand should actually be used."]
  },
  "social-ads-content-strategy": {
    title: "Social Media Ads and Content Strategy",
    category: "Marketing",
    mentor: "Sneha Varghese",
    price: "INR 5,999",
    rating: "4.6",
    image: "assets/img/courses/course_thumb03.jpg",
    mentorImage: mentorImages[3],
    summary: "Build a content system that combines organic storytelling, paid distribution, and clear performance goals.",
    modules: 6,
    hours: "15",
    learners: "360+",
    level: "Growth Track",
    score: "94%",
    curriculumHeading: "Create content with a job to do.",
    curriculumIntro: "Plan consistent content, adapt ideas across platforms, and improve campaigns with useful metrics.",
    lessons: [
      ["Content Positioning", "Choose themes and formats that fit the audience and brand voice."],
      ["Campaign Production", "Turn one strong idea into a practical multi-platform content plan."],
      ["Measure and Improve", "Use meaningful metrics to refine creative and distribution choices."]
    ],
    projects: ["30-Day Content System", "Paid Social Creative Test"],
    bio: "Sneha is a Delhi-based content strategist who has helped education, wellness, and lifestyle brands grow engaged audiences.",
    experience: "8+ Years Content",
    credential: "Social Growth Strategist",
    community: ["PR", "My content calendar finally has a clear purpose.", "AG", "The metrics lesson helped me stop chasing likes."]
  },
  "startup-business-strategy": {
    title: "Startup Business Strategy for Beginners",
    category: "Business",
    mentor: "Suresh Narayanan",
    price: "INR 5,999",
    rating: "4.5",
    image: "assets/img/courses/course_thumb04.jpg",
    mentorImage: mentorImages[1],
    summary: "Turn a startup idea into a testable business model using customer discovery, positioning, and practical launch planning.",
    modules: 7,
    hours: "18.5",
    learners: "410+",
    level: "Founder Basics",
    score: "94%",
    curriculumHeading: "Move from idea to evidence.",
    curriculumIntro: "Learn how founders reduce uncertainty before spending time and money on the wrong solution.",
    lessons: [
      ["Customer Discovery", "Identify a real problem and speak with the people who experience it."],
      ["Business Model Design", "Map value, channels, revenue, cost, and critical assumptions."],
      ["Launch Experiment", "Design a small test that measures interest and improves the idea."]
    ],
    projects: ["Lean Business Model", "Startup Validation Plan"],
    bio: "Vikram is a Gurugram-based startup advisor who has supported student founders and early-stage product teams.",
    experience: "12+ Years Startups",
    credential: "Founder and Incubator Mentor",
    community: ["HJ", "The interview guide helped me get honest customer feedback.", "RM", "I changed my idea after the validation exercise, which saved me months."]
  },
  "product-management-fundamentals": {
    title: "Product Management Fundamentals",
    category: "Management",
    mentor: "Ananya Rao",
    price: "INR 5,999",
    rating: "4.8",
    image: "assets/img/courses/course_thumb01.jpg",
    mentorImage: mentorImages[3],
    summary: "Learn how product managers discover problems, prioritize opportunities, define outcomes, and guide teams toward useful releases.",
    modules: 9,
    hours: "25",
    learners: "520+",
    level: "Product Track",
    score: "97%",
    curriculumHeading: "Make product decisions with clarity.",
    curriculumIntro: "Practice the core product workflow from user insight to roadmap and measurable release outcome.",
    lessons: [
      ["Product Discovery", "Find valuable problems through research, evidence, and opportunity framing."],
      ["Prioritization and Roadmaps", "Choose what matters using outcomes, constraints, and trade-offs."],
      ["Release and Learning", "Define success metrics and learn from how users respond after launch."]
    ],
    projects: ["Product Opportunity Brief", "Outcome-Based Roadmap"],
    bio: "Ananya is a Bengaluru-based product leader who has worked across SaaS, education technology, and consumer applications.",
    experience: "11+ Years Product",
    credential: "Senior Product Leader",
    community: ["VK", "The opportunity brief made my case study much stronger.", "DI", "I finally understand the difference between outputs and outcomes."]
  },
  "personal-finance-students": {
    title: "Personal Finance for Students",
    category: "Finance",
    mentor: "Nithya Srinivasan",
    price: "INR 5,999",
    rating: "4.4",
    image: "assets/img/courses/course_thumb04.jpg",
    mentorImage: mentorImages[2],
    summary: "Build money habits for student life with budgeting, saving, responsible credit, and beginner-friendly investing principles.",
    modules: 5,
    hours: "10",
    learners: "690+",
    level: "Student Essentials",
    score: "93%",
    curriculumHeading: "Make your money choices less stressful.",
    curriculumIntro: "Create a simple system for spending, saving, and planning without complicated financial jargon.",
    lessons: [
      ["Know Your Cash Flow", "Track income and expenses, then build a realistic student budget."],
      ["Save and Protect", "Create emergency savings and understand common financial risks."],
      ["Start Investing Wisely", "Learn long-term investing basics and avoid high-risk shortcuts."]
    ],
    projects: ["Monthly Student Budget", "First Investment Plan"],
    bio: "Neha is a Jaipur-based financial educator who makes money management practical for students and first-time earners.",
    experience: "7+ Years Education",
    credential: "Personal Finance Coach",
    community: ["SA", "I found three expenses I could reduce without feeling deprived.", "NP", "The investing lesson was clear and did not feel intimidating."]
  },
  "wellness-productivity-system": {
    title: "Wellness and Productivity System",
    category: "Life Style",
    mentor: "Dr. Kavya Menon",
    price: "INR 5,999",
    rating: "4.2",
    image: "assets/img/courses/course_thumb02.jpg",
    mentorImage: mentorImages[3],
    summary: "Create a sustainable study and work rhythm using energy management, focus design, reflection, and realistic habit building.",
    modules: 5,
    hours: "11.5",
    learners: "300+",
    level: "Personal Growth",
    score: "91%",
    curriculumHeading: "Be productive without burning out.",
    curriculumIntro: "Design a personal system that protects energy, improves focus, and adapts when life changes.",
    lessons: [
      ["Energy Before Time", "Understand how sleep, breaks, and environment shape your capacity."],
      ["Focus and Planning", "Use simple planning methods to reduce overload and distraction."],
      ["Sustainable Habits", "Build routines that survive busy weeks and imperfect days."]
    ],
    projects: ["Personal Energy Audit", "Four-Week Focus System"],
    bio: "Kavya is a Bengaluru-based wellbeing educator who works with students and young professionals on sustainable performance.",
    experience: "8+ Years Wellbeing",
    credential: "Behavior Change Educator",
    community: ["MS", "The energy audit explained why my old schedule never worked.", "VP", "I am studying more consistently with fewer late nights."]
  },
  "team-leadership-communication": {
    title: "Team Leadership and Communication",
    category: "Management",
    mentor: "Rahul Nambiar",
    price: "INR 5,999",
    rating: "4.7",
    image: "assets/img/courses/course_thumb01.jpg",
    mentorImage: mentorImages[1],
    summary: "Lead student and early-career teams with clearer communication, useful feedback, confident meetings, and healthy accountability.",
    modules: 7,
    hours: "17",
    learners: "350+",
    level: "Emerging Leader",
    score: "95%",
    curriculumHeading: "Help teams do their best work.",
    curriculumIntro: "Practice the communication habits that build trust, alignment, and progress in real group work.",
    lessons: [
      ["Leadership Foundations", "Understand responsibility, trust, motivation, and situational leadership."],
      ["Clear Team Communication", "Run meetings, set expectations, and reduce avoidable confusion."],
      ["Feedback and Conflict", "Handle difficult conversations with empathy and directness."]
    ],
    projects: ["Team Working Agreement", "Leadership Communication Playbook"],
    bio: "Rahul is a Mumbai-based leadership facilitator who has coached project teams, campus leaders, and new managers.",
    experience: "13+ Years Leadership",
    credential: "Team Development Coach",
    community: ["KR", "Our project meetings are shorter and much clearer now.", "AD", "The feedback framework made a difficult conversation easier."]
  },
  "ai-tools-study-career": {
    title: "AI Tools for Study and Career Workflows",
    category: "AI Tools",
    mentor: "Ishaan Prakash",
    price: "INR 5,999",
    rating: "4.9",
    image: "assets/img/courses/course_thumb02.jpg",
    mentorImage: mentorImages[0],
    summary: "Use AI tools responsibly to research, organize learning, improve writing, automate repetitive work, and prepare for careers.",
    modules: 8,
    hours: "20",
    learners: "760+",
    level: "Future Skills",
    score: "98%",
    curriculumHeading: "Use AI as a thoughtful collaborator.",
    curriculumIntro: "Build practical workflows that improve quality and save time while keeping your own judgment in control.",
    lessons: [
      ["Prompting for Clear Thinking", "Frame tasks, provide context, and evaluate AI responses critically."],
      ["Study and Research Workflows", "Summarize, compare, quiz, and organize information responsibly."],
      ["Career Automation", "Create repeatable workflows for writing, analysis, and job preparation."]
    ],
    projects: ["AI Study Companion", "Career Workflow Automation Kit"],
    bio: "Ishaan is a Bengaluru-based AI product educator who helps students use emerging tools with practical judgment and responsible habits.",
    experience: "8+ Years Technology",
    credential: "AI Workflow Specialist",
    community: ["TM", "The evaluation checklist stopped me from trusting weak answers.", "RS", "My research workflow is faster and much more organized."]
  },
  "cyber-security-basics": {
    title: "Cyber Security Basics for Beginners",
    category: "Cyber Security",
    mentor: "Aditya Shetty",
    price: "INR 5,999",
    rating: "4.6",
    image: "assets/img/courses/course_thumb04.jpg",
    mentorImage: mentorImages[0],
    summary: "Understand common digital threats, protect accounts and devices, and build a beginner-friendly foundation in cyber security.",
    modules: 7,
    hours: "19.5",
    learners: "440+",
    level: "Security Foundations",
    score: "95%",
    curriculumHeading: "Think like a defender.",
    curriculumIntro: "Learn how everyday attacks work and apply practical controls that reduce real security risk.",
    lessons: [
      ["Threats and Attack Paths", "Recognize phishing, malware, weak authentication, and social engineering."],
      ["Device and Account Defense", "Use secure configuration, access control, and recovery planning."],
      ["Security Investigation", "Review simple evidence and communicate a useful incident response."]
    ],
    projects: ["Personal Security Audit", "Beginner Incident Response Report"],
    bio: "Aditya is a Bengaluru-based security analyst who has supported awareness, risk assessment, and defensive operations programs.",
    experience: "9+ Years Security",
    credential: "Cyber Defense Analyst",
    community: ["AG", "I updated my account security the same day as the lesson.", "PK", "The incident exercise made security feel practical instead of mysterious."]
  },
  "photography-visual-storytelling": {
    title: "Photography and Visual Storytelling",
    category: "Photography",
    mentor: "Riya Menon",
    price: "INR 5,999",
    rating: "4.5",
    image: "assets/img/courses/course_thumb03.jpg",
    mentorImage: mentorImages[2],
    summary: "Create stronger photographs by combining light, composition, observation, editing, and a clear visual story.",
    modules: 6,
    hours: "14",
    learners: "320+",
    level: "Creative Practice",
    score: "94%",
    curriculumHeading: "Make photographs that say something.",
    curriculumIntro: "Train your eye, use available light, and sequence images into a story viewers can feel.",
    lessons: [
      ["Seeing and Composition", "Use framing, perspective, and visual rhythm to guide attention."],
      ["Light and Mood", "Work with natural light and simple editing to shape emotion."],
      ["Photo Story Development", "Plan, shoot, select, and present a cohesive visual narrative."]
    ],
    projects: ["A Day in My City", "Portrait Story Series"],
    bio: "Riya is a Delhi-based photographer and visual storyteller whose work focuses on people, places, and everyday culture.",
    experience: "9+ Years Photography",
    credential: "Editorial Visual Storyteller",
    community: ["SJ", "The composition exercises made my photos feel much more intentional.", "AM", "Riya's edit notes helped me remove weak images from my series."]
  }
};

const marketplaceDomainGroups = [
  {
    category: "Technology & Software Development",
    courses: [
      "Programming in Python",
      "Programming in Java",
      "DSA with Python",
      "Front-End Web Development",
      "Full-Stack Web Development",
      "Android Development"
    ]
  },
  {
    category: "Artificial Intelligence & Data",
    courses: [
      "Artificial Intelligence",
      "AI (Agentic & Generative)",
      "Machine Learning",
      "Data Science",
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
      "Embedded Systems",
      "VLSI",
      "Robotics",
      "Hybrid Electric Vehicle",
      "Nanotechnology"
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
      "Operation & Supply Chain Management",
      "Product & Project Management",
      "Stock Marketing"
    ]
  },
  {
    category: "Design & Creative Arts",
    courses: ["UI/UX", "Graphic Designing", "AutoCAD", "Car Design"]
  },
  {
    category: "Healthcare & Human Sciences",
    courses: ["Medical Coding", "Clinical Trials & Research", "Psychology"]
  }
];

const marketplaceImagePools = {
  "Technology & Software Development": [
    "course/1. Technology & Software Development/mk.avif",
    "course/1. Technology & Software Development/st.avif",
    "course/1. Technology & Software Development/we.avif",
    "course/1. Technology & Software Development/premium_photo-1720287601920-.avif",
    "course/1. Technology & Software Development/fotis-fotopoulos-6sAl6aQ4OWI.jpg",
    "course/1. Technology & Software Development/hossain-khan-UP3SMQSoNsM.jpg"
  ],
  "Artificial Intelligence & Data": [
    "course/2. Artificial Intelligence & Data Science/premium_photo-.avif",
    "course/2. Artificial Intelligence & Data Science/premium_photo-1725907643701.avif",
    "course/2. Artificial Intelligence & Data Science/br.jpg",
    "course/2. Artificial Intelligence & Data Science/ji.avif",
    "course/2. Artificial Intelligence & Data Science/yhn.jpg"
  ],
  "Cyber Security & Infrastructure": [
    "course/3. Cyber Security, Cloud & DevOps/gettyimages.jpg",
    "course/3. Cyber Security, Cloud & DevOps/istockphoto-952067022.jpg",
    "course/3. Cyber Security, Cloud & DevOps/gettyimages.jpg"
  ],
  "Engineering & Emerging Technologies": [
    "course/4. Engineering & Emerging Technologies/premium_photo.avif",
    "course/4. Engineering & Emerging Technologies/premium_photo-1681010317789.avif",
    "course/4. Engineering & Emerging Technologies/ghu.jpg",
    "course/4. Engineering & Emerging Technologies/david-leveque-GpNOhig3LSU.jpg",
    "course/4. Engineering & Emerging Technologies/premium_photo.avif",
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
    "course/5. Business, Finance & Marketing/anne-nygard-x07ELaNFt34.jpg"
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
    "course/7. Healthcare & Human Sciences/psychology.webp"
  ]
};

const toolCatalog = {
  "Technology & Software Development": [
    ["VS Code", "Code editor", "code.visualstudio.com"],
    ["GitHub", "Version control", "github.com"],
    ["React", "Frontend UI", "react.dev"],
    ["Node.js", "Backend APIs", "nodejs.org"],
    ["MongoDB", "Databases", "mongodb.com"],
    ["AWS", "Cloud deploy", "aws.amazon.com"]
  ],
  "Artificial Intelligence & Data": [
    ["Python", "Data coding", "python.org"],
    ["Jupyter", "Notebooks", "jupyter.org"],
    ["Pandas", "Analysis", "pandas.pydata.org"],
    ["TensorFlow", "ML models", "tensorflow.org"],
    ["Tableau", "Dashboards", "tableau.com"],
    ["SQL", "Data queries", "mysql.com"]
  ],
  "Cyber Security & Infrastructure": [
    ["Linux", "Security labs", "linux.org"],
    ["Wireshark", "Network analysis", "wireshark.org"],
    ["Nmap", "Scanning", "nmap.org"],
    ["Docker", "Containers", "docker.com"],
    ["AWS", "Cloud security", "aws.amazon.com"],
    ["GitHub", "Secure repos", "github.com"]
  ],
  "Engineering & Emerging Technologies": [
    ["Arduino", "Prototyping", "arduino.cc"],
    ["MATLAB", "Simulation", "mathworks.com"],
    ["AutoCAD", "Design drafting", "autodesk.com"],
    ["Fusion 360", "3D modeling", "autodesk.com/products/fusion-360"],
    ["Python", "Automation", "python.org"],
    ["IoT Cloud", "Connected systems", "arduino.cc/en/software"]
  ],
  "Business, Management & Finance": [
    ["Excel", "Modeling", "microsoft.com"],
    ["Power BI", "Reporting", "powerbi.microsoft.com"],
    ["Notion", "Planning", "notion.so"],
    ["Canva", "Campaigns", "canva.com"],
    ["Google Ads", "Growth", "ads.google.com"],
    ["HubSpot", "CRM", "hubspot.com"]
  ],
  "Design & Creative Arts": [
    ["Figma", "UI design", "figma.com"],
    ["Adobe XD", "Prototypes", "adobe.com/products/xd.html"],
    ["Photoshop", "Visuals", "adobe.com/products/photoshop.html"],
    ["Illustrator", "Vector design", "adobe.com/products/illustrator.html"],
    ["Canva", "Fast layouts", "canva.com"],
    ["AutoCAD", "Drafting", "autodesk.com/products/autocad"]
  ],
  "Healthcare & Human Sciences": [
    ["Excel", "Records", "microsoft.com"],
    ["SPSS", "Research stats", "ibm.com/spss"],
    ["PubMed", "Literature", "pubmed.ncbi.nlm.nih.gov"],
    ["Notion", "Case notes", "notion.so"],
    ["Google Forms", "Surveys", "google.com/forms/about"],
    ["Tableau", "Health dashboards", "tableau.com"]
  ],
  "AI Tools": [
    ["ChatGPT", "AI workflows", "chatgpt.com"],
    ["Notion AI", "Study systems", "notion.so"],
    ["Canva AI", "Creative work", "canva.com"],
    ["Zapier", "Automation", "zapier.com"],
    ["Google Gemini", "Research", "gemini.google.com"],
    ["Gamma", "Presentations", "gamma.app"]
  ]
};

const toolSetsBySlug = {
  "programming-in-python": [["Python", "Core programming", "python.org"], ["PyCharm", "Python IDE", "jetbrains.com/pycharm"], ["Jupyter", "Practice notebooks", "jupyter.org"], ["GitHub", "Version control", "github.com"], ["SQLite", "Local databases", "sqlite.org"], ["Replit", "Cloud practice", "replit.com"]],
  "programming-in-java": [["Java", "OOP programming", "java.com"], ["IntelliJ IDEA", "Java IDE", "jetbrains.com/idea"], ["Maven", "Build tools", "maven.apache.org"], ["JUnit", "Testing", "junit.org"], ["GitHub", "Version control", "github.com"], ["Spring", "App basics", "spring.io"]],
  "dsa-with-python": [["Python", "Problem solving", "python.org"], ["Jupyter", "Dry runs", "jupyter.org"], ["LeetCode", "Practice", "leetcode.com"], ["HackerRank", "Challenges", "hackerrank.com"], ["GitHub", "Solutions repo", "github.com"], ["VS Code", "Code editor", "code.visualstudio.com"]],
  "front-end-web-development": [["HTML5", "Page structure", "developer.mozilla.org"], ["CSS3", "Styling", "developer.mozilla.org"], ["JavaScript", "Interactivity", "javascript.com"], ["React", "Frontend UI", "react.dev"], ["Figma", "Design handoff", "figma.com"], ["Netlify", "Deployment", "netlify.com"]],
  "full-stack-web-development": [["VS Code", "Code editor", "code.visualstudio.com"], ["GitHub", "Version control", "github.com"], ["React", "Frontend UI", "react.dev"], ["Node.js", "Backend APIs", "nodejs.org"], ["MongoDB", "Databases", "mongodb.com"], ["AWS", "Cloud deploy", "aws.amazon.com"]],
  "android-development": [["Android Studio", "App IDE", "developer.android.com"], ["Kotlin", "Android coding", "kotlinlang.org"], ["Java", "Core language", "java.com"], ["Firebase", "Backend services", "firebase.google.com"], ["Figma", "App UI", "figma.com"], ["GitHub", "Version control", "github.com"]],
  "artificial-intelligence": [["Python", "AI coding", "python.org"], ["Jupyter", "Experiments", "jupyter.org"], ["TensorFlow", "Deep learning", "tensorflow.org"], ["PyTorch", "Model building", "pytorch.org"], ["Google Colab", "Cloud notebooks", "colab.research.google.com"], ["Kaggle", "Datasets", "kaggle.com"]],
  "ai-agentic-and-generative": [["ChatGPT", "Prompt workflows", "chatgpt.com"], ["LangChain", "AI agents", "langchain.com"], ["OpenAI", "Model APIs", "openai.com"], ["Pinecone", "Vector search", "pinecone.io"], ["Hugging Face", "AI models", "huggingface.co"], ["Zapier", "Automation", "zapier.com"]],
  "machine-learning": [["Python", "ML coding", "python.org"], ["Scikit-learn", "ML basics", "scikit-learn.org"], ["Pandas", "Data prep", "pandas.pydata.org"], ["NumPy", "Arrays", "numpy.org"], ["Jupyter", "Notebooks", "jupyter.org"], ["Kaggle", "Datasets", "kaggle.com"]],
  "data-science": [["Python", "Data coding", "python.org"], ["Jupyter", "Notebooks", "jupyter.org"], ["Pandas", "Analysis", "pandas.pydata.org"], ["TensorFlow", "ML models", "tensorflow.org"], ["Tableau", "Dashboards", "tableau.com"], ["SQL", "Data queries", "mysql.com"]],
  "data-analysis": [["Excel", "Analysis basics", "microsoft.com"], ["SQL", "Data queries", "mysql.com"], ["Power BI", "Reports", "powerbi.microsoft.com"], ["Tableau", "Dashboards", "tableau.com"], ["Python", "Automation", "python.org"], ["Google Sheets", "Collaboration", "google.com/sheets/about"]],
  "cyber-security-and-ethical-hacking": [["Kali Linux", "Security labs", "kali.org"], ["Wireshark", "Network analysis", "wireshark.org"], ["Nmap", "Scanning", "nmap.org"], ["Burp Suite", "Web testing", "portswigger.net"], ["Metasploit", "Exploit labs", "metasploit.com"], ["OWASP", "Web security", "owasp.org"]],
  "cloud-computing": [["AWS", "Cloud services", "aws.amazon.com"], ["Azure", "Cloud platform", "azure.microsoft.com"], ["Google Cloud", "Cloud platform", "cloud.google.com"], ["Docker", "Containers", "docker.com"], ["Kubernetes", "Orchestration", "kubernetes.io"], ["Terraform", "Infrastructure", "terraform.io"]],
  "devops": [["GitHub Actions", "CI/CD", "github.com"], ["Docker", "Containers", "docker.com"], ["Kubernetes", "Orchestration", "kubernetes.io"], ["Jenkins", "Automation", "jenkins.io"], ["Terraform", "Infrastructure", "terraform.io"], ["AWS", "Cloud deploy", "aws.amazon.com"]],
  "internet-of-things-iot": [["Arduino", "Prototyping", "arduino.cc"], ["Raspberry Pi", "Edge devices", "raspberrypi.com"], ["MQTT", "IoT messaging", "mqtt.org"], ["ThingSpeak", "IoT analytics", "thingspeak.com"], ["Python", "Automation", "python.org"], ["AWS IoT", "Cloud IoT", "aws.amazon.com/iot"]],
  "embedded-systems": [["Arduino", "Microcontrollers", "arduino.cc"], ["STM32", "Embedded boards", "st.com"], ["Keil", "Embedded IDE", "keil.com"], ["Proteus", "Simulation", "labcenter.com"], ["C", "Firmware basics", "iso.org"], ["GitHub", "Version control", "github.com"]],
  "vlsi": [["Cadence", "EDA workflow", "cadence.com"], ["Synopsys", "Chip design", "synopsys.com"], ["Verilog", "HDL design", "verilog.com"], ["ModelSim", "Simulation", "eda.sw.siemens.com"], ["MATLAB", "Modeling", "mathworks.com"], ["Linux", "EDA systems", "linux.org"]],
  "robotics": [["ROS", "Robot software", "ros.org"], ["Arduino", "Control boards", "arduino.cc"], ["Python", "Automation", "python.org"], ["MATLAB", "Simulation", "mathworks.com"], ["Gazebo", "Robot simulation", "gazebosim.org"], ["Fusion 360", "3D design", "autodesk.com/products/fusion-360"]],
  "hybrid-electric-vehicle": [["MATLAB", "Simulation", "mathworks.com"], ["Simulink", "Systems modeling", "mathworks.com/products/simulink"], ["AutoCAD", "Design drafting", "autodesk.com/products/autocad"], ["Ansys", "Simulation", "ansys.com"], ["Excel", "Calculations", "microsoft.com"], ["Python", "Data analysis", "python.org"]],
  "nanotechnology": [["MATLAB", "Modeling", "mathworks.com"], ["Python", "Data analysis", "python.org"], ["OriginPro", "Graphing", "originlab.com"], ["ImageJ", "Image analysis", "imagej.net"], ["Excel", "Lab data", "microsoft.com"], ["PubMed", "Research", "pubmed.ncbi.nlm.nih.gov"]],
  "digital-marketing": [["Google Ads", "Paid search", "ads.google.com"], ["Meta Business", "Social ads", "business.facebook.com"], ["Google Analytics", "Measurement", "analytics.google.com"], ["Canva", "Creatives", "canva.com"], ["HubSpot", "CRM", "hubspot.com"], ["Mailchimp", "Email", "mailchimp.com"]],
  "human-resource-management": [["LinkedIn", "Recruiting", "linkedin.com"], ["Excel", "HR data", "microsoft.com"], ["Notion", "Policies", "notion.so"], ["Google Forms", "Surveys", "google.com/forms/about"], ["Slack", "Team comms", "slack.com"], ["Canva", "Internal comms", "canva.com"]],
  "finance": [["Excel", "Financial models", "microsoft.com"], ["Power BI", "Reports", "powerbi.microsoft.com"], ["Tally", "Accounting", "tallysolutions.com"], ["QuickBooks", "Bookkeeping", "quickbooks.intuit.com"], ["TradingView", "Markets", "tradingview.com"], ["Google Sheets", "Collaboration", "google.com/sheets/about"]],
  "startup-and-entrepreneurship": [["Notion", "Startup OS", "notion.so"], ["Canva", "Pitch design", "canva.com"], ["Google Workspace", "Collaboration", "workspace.google.com"], ["Stripe", "Payments", "stripe.com"], ["HubSpot", "CRM", "hubspot.com"], ["Figma", "Prototype", "figma.com"]],
  "business-analysis": [["Excel", "Analysis", "microsoft.com"], ["Power BI", "Dashboards", "powerbi.microsoft.com"], ["Tableau", "Visualization", "tableau.com"], ["Jira", "Requirements", "atlassian.com/software/jira"], ["Miro", "Process maps", "miro.com"], ["SQL", "Data queries", "mysql.com"]],
  "operation-and-supply-chain-management": [["Excel", "Planning", "microsoft.com"], ["SAP", "ERP basics", "sap.com"], ["Power BI", "Operations reports", "powerbi.microsoft.com"], ["Trello", "Workflow boards", "trello.com"], ["Google Sheets", "Trackers", "google.com/sheets/about"], ["Notion", "Documentation", "notion.so"]],
  "product-and-project-management": [["Jira", "Agile boards", "atlassian.com/software/jira"], ["Notion", "Product docs", "notion.so"], ["Miro", "Workshops", "miro.com"], ["Figma", "Design reviews", "figma.com"], ["Trello", "Task flow", "trello.com"], ["Google Analytics", "Product metrics", "analytics.google.com"]],
  "stock-marketing": [["TradingView", "Charting", "tradingview.com"], ["Excel", "Portfolio sheets", "microsoft.com"], ["Google Finance", "Market data", "google.com/finance"], ["Screener", "Stock research", "screener.in"], ["Power BI", "Reports", "powerbi.microsoft.com"], ["Notion", "Trade journal", "notion.so"]],
  "ui-ux": [["Figma", "UI design", "figma.com"], ["Adobe XD", "Prototypes", "adobe.com/products/xd.html"], ["Photoshop", "Visuals", "adobe.com/products/photoshop.html"], ["Illustrator", "Vector design", "adobe.com/products/illustrator.html"], ["Canva", "Fast layouts", "canva.com"], ["AutoCAD", "Drafting", "autodesk.com/products/autocad"]],
  "graphic-designing": [["Photoshop", "Image editing", "adobe.com/products/photoshop.html"], ["Illustrator", "Vector design", "adobe.com/products/illustrator.html"], ["Canva", "Social designs", "canva.com"], ["Figma", "Layout systems", "figma.com"], ["Behance", "Portfolio", "behance.net"], ["Google Fonts", "Typography", "fonts.google.com"]],
  "autocad": [["AutoCAD", "2D drafting", "autodesk.com/products/autocad"], ["Fusion 360", "3D modeling", "autodesk.com/products/fusion-360"], ["SketchUp", "3D layouts", "sketchup.com"], ["Excel", "Material lists", "microsoft.com"], ["Canva", "Presentation boards", "canva.com"], ["Google Drive", "File sharing", "drive.google.com"]],
  "car-design": [["Fusion 360", "3D modeling", "autodesk.com/products/fusion-360"], ["AutoCAD", "Drafting", "autodesk.com/products/autocad"], ["Blender", "Concept models", "blender.org"], ["Photoshop", "Render polish", "adobe.com/products/photoshop.html"], ["Illustrator", "Line work", "adobe.com/products/illustrator.html"], ["Behance", "Portfolio", "behance.net"]],
  "medical-coding": [["ICD-10", "Code systems", "cms.gov"], ["Excel", "Code records", "microsoft.com"], ["PubMed", "Reference", "pubmed.ncbi.nlm.nih.gov"], ["Google Sheets", "Trackers", "google.com/sheets/about"], ["Notion", "Study notes", "notion.so"], ["AAPC", "Coding practice", "aapc.com"]],
  "clinical-trials-and-research": [["PubMed", "Literature", "pubmed.ncbi.nlm.nih.gov"], ["SPSS", "Research stats", "ibm.com/spss"], ["Excel", "Trial data", "microsoft.com"], ["Google Forms", "Survey data", "google.com/forms/about"], ["Tableau", "Study dashboards", "tableau.com"], ["Notion", "Protocol notes", "notion.so"]],
  "psychology": [["SPSS", "Research stats", "ibm.com/spss"], ["Google Forms", "Surveys", "google.com/forms/about"], ["Excel", "Data coding", "microsoft.com"], ["PubMed", "Research", "pubmed.ncbi.nlm.nih.gov"], ["Notion", "Case notes", "notion.so"], ["Canva", "Psychoeducation", "canva.com"]]
};

const faviconUrl = (domain) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain || "jenovate.com")}&sz=64`;

const marketplaceMentorsByCategory = {
  "Technology & Software Development": ["Karthik Raman", "Vignesh Iyer", "Aravind Subramanian", "Aditya Shetty", "Rahul Nambiar", "Suresh Narayanan"],
  "Artificial Intelligence & Data": ["Meera Krishnan", "Nithya Srinivasan", "Priya Nair", "Ananya Rao", "Devika Raghavan"],
  "Cyber Security & Infrastructure": ["Aditya Shetty", "Vignesh Iyer", "Karthik Raman"],
  "Engineering & Emerging Technologies": ["Aravind Subramanian", "Rahul Nambiar", "Suresh Narayanan", "Vignesh Iyer"],
  "Business, Management & Finance": ["Lakshmi Menon", "Suresh Narayanan", "Nithya Srinivasan", "Rahul Nambiar", "Devika Raghavan"],
  "Design & Creative Arts": ["Priya Nair", "Anjali Nair", "Devika Raghavan", "Lakshmi Menon"],
  "Healthcare & Human Sciences": ["Dr. Kavya Menon", "Meera Krishnan", "Nithya Srinivasan"]
};

const mentorForMarketplaceCourse = (category, index) => {
  const mentors = marketplaceMentorsByCategory[category] || ["Karthik Raman", "Priya Nair"];
  return mentors[index % mentors.length];
};

const toolInitials = (name) => String(name)
  .replace(/[^a-z0-9\s.+#-]/gi, "")
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0])
  .join("")
  .toUpperCase() || "JT";

const toolsForCourse = (course, courseSlug = slug) => {
  if (toolSetsBySlug[courseSlug]) return toolSetsBySlug[courseSlug];
  if (/ai tools/i.test(course.title)) return toolCatalog["AI Tools"];
  return toolCatalog[course.category] || toolCatalog["Technology & Software Development"];
};

const slugifyCourse = (title) => String(title)
  .toLowerCase()
  .replace(/&/g, "and")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const buildMarketplaceSeed = (title, category, index) => {
  const images = marketplaceImagePools[category] || ["course/1. Technology & Software Development/mk.avif"];
  const image = images[index % images.length];
  const supportImages = images.filter((item) => item !== image).slice(0, 2);
  const mentor = mentorForMarketplaceCourse(category, index);

  return {
    title,
    category,
    mentor,
    price: "INR 5,999",
    rating: "4.8",
    image,
    mentorImage: mentorProfilesByName[mentor] || mentorImages[index % mentorImages.length],
    summary: `Build practical ${title.toLowerCase()} skills through guided lessons, portfolio tasks, and mentor-led career preparation.`,
    modules: 8,
    hours: "24",
    learners: "500+",
    level: "Career Track",
    score: "96%",
    curriculumHeading: `Learn ${title} with practical outcomes.`,
    curriculumIntro: `Move from foundations to applied work through a structured ${category.toLowerCase()} roadmap.`,
    lessons: [
      [`${title} Foundations`, "Understand core concepts, common tools, and the workflow used by professionals."],
      ["Applied Practice", "Work through guided exercises, scenarios, and checkpoints that turn theory into skill."],
      ["Portfolio Project", "Complete a practical project that demonstrates your learning and readiness."]
    ],
    projects: [`${title} Capstone`, "Career-Ready Portfolio Case Study"],
    bio: "The Jenovate mentor team combines industry practice with structured learning support for early-career learners.",
    experience: "Industry-Led Training",
    credential: `${category} Mentors`,
    community: ["JN", "The roadmap made the topic feel clear and practical.", "SV", "The project helped me show my skills with confidence."],
    supportImages: supportImages.length >= 2 ? supportImages : ["course/1. Technology & Software Development/st.avif", "course/1. Technology & Software Development/we.avif"]
  };
};

marketplaceDomainGroups.forEach((group) => {
  group.courses.forEach((title, index) => {
    const slug = slugifyCourse(title);
    courseSeeds[slug] = buildMarketplaceSeed(title, group.category, index);
    courseSupportImagesBySlug[slug] = courseSeeds[slug].supportImages;
  });
});

const params = new URLSearchParams(window.location.search);
const slug = params.get("course") || "javascript-imagination";
const course = courseSeeds[slug] || courseSeeds["javascript-imagination"];
course.image = resolveLocalAssetPath(courseImageBySlug[slug] || course.image);
course.mentorImage = mentorProfilesByName[course.mentor] || mentorImageBySlug[slug] || course.mentorImage;
const supportImages = (courseSupportImagesBySlug[slug] || ["course/1. Technology & Software Development/st.avif", "course/1. Technology & Software Development/we.avif"]).map(resolveLocalAssetPath);
const curriculumImages = [course.image, ...supportImages];
const projectImages = [course.image, ...supportImages];
const marketplaceCourseInrPrice = 5999;
const courseInrRate = 83;
const marketplaceCourseUsdPrice = 65;

const setText = (id, value) => {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
};

const setImage = (id, src, alt) => {
  const node = document.getElementById(id);
  if (!node) return;
  node.src = resolveLocalAssetPath(src);
  node.alt = alt;
};

const formatPrice = () => {
  try {
    if (localStorage.getItem("jenovate-course-currency") === "USD") {
      return `$${marketplaceCourseUsdPrice.toFixed(2)}`;
    }
  } catch {
    // Browser storage can be unavailable; INR remains the default.
  }
  return `INR ${marketplaceCourseInrPrice.toLocaleString("en-IN")}`;
};

const renderCurriculum = () => {
  const grid = document.getElementById("curriculumGrid");
  if (!grid) return;
  grid.innerHTML = course.lessons.map(([title, description], index) => `
    <article class="curriculum-card">
      <img src="${curriculumImages[index]}" alt="${title}" loading="lazy" decoding="async">
      <span>Module ${String(index + 1).padStart(2, "0")}</span>
      <h3>${title}</h3>
      <p>${description}</p>
    </article>
  `).join("");
};

const renderRoadmap = () => {
  const list = document.getElementById("roadmapList");
  if (!list) return;
  const periods = ["Week 1-2", "Week 3-5", "Week 6-8"];
  list.innerHTML = course.lessons.map(([title, description], index) => `
    <article>
      <b>${String(index + 1).padStart(2, "0")}</b>
      <div>
        <span>${periods[index]}</span>
        <h3>Phase ${index + 1}: ${title}</h3>
        <p>${description}</p>
      </div>
    </article>
  `).join("");
};

const renderProjects = () => {
  const grid = document.getElementById("outcomeGrid");
  if (!grid) return;
  grid.innerHTML = course.projects.map((title, index) => `
    <article>
      <img src="${index === 0 ? course.image : projectImages[index]}" alt="${title}" loading="lazy" decoding="async">
      <div><span>Project ${String(index + 1).padStart(2, "0")}</span><h3>${title}</h3></div>
    </article>
  `).join("");
};

const renderTools = () => {
  const grid = document.getElementById("toolsGrid");
  if (!grid) return;
  const tools = toolsForCourse(course);
  grid.innerHTML = tools.map(([name, purpose, domain], index) => `
    <article class="tool-card">
      <span class="tool-logo tool-logo-${index % 6}">
        <span class="tool-logo-fallback" aria-hidden="true">${toolInitials(name)}</span>
        <img src="${faviconUrl(domain)}" alt="${name} logo" loading="lazy" decoding="async" onload="this.closest('.tool-logo')?.classList.add('has-logo')" onerror="this.hidden=true">
      </span>
      <div>
        <h3>${name}</h3>
        <p>${purpose}</p>
      </div>
    </article>
  `).join("");
};

document.title = `${course.title} - Jenovate`;
setText("courseTitle", course.title);
setText("courseCategory", course.category);
setText("courseAuthor", course.mentor);
setText("courseSummary", course.summary);
setText("courseRatingBadge", course.rating);
setText("courseRatingText", `(${course.rating} Reviews)`);
setText("courseFactRating", course.rating);
setText("courseModuleCount", String(course.modules).padStart(2, "0"));
setText("courseHours", `${course.hours}h`);
setText("courseHoursLine", `${course.hours} Hours`);
setText("courseLevelLine", course.level);
setText("courseLearners", course.learners);
setText("masteryScore", course.score);
setText("curriculumHeading", course.curriculumHeading);
setText("curriculumIntro", course.curriculumIntro);
setText("roadmapHeading", `A clear path through ${course.category.toLowerCase()}.`);
setText("roadmapIntro", `Each phase builds toward a useful ${course.projects[0].toLowerCase()} and a confident final presentation.`);
setText("certificateText", `Complete the ${course.category.toLowerCase()} roadmap and earn verified proof of your work.`);
setText("outcomesHeading", `Build ${course.projects[0]} and more.`);
setText("outcomesIntro", `Create practical ${course.category.toLowerCase()} work that demonstrates what you can do.`);
setText("toolsHeading", `Tools used in ${course.title}.`);
setText("toolsIntro", `Learn the practical platforms, editors, and workflow tools commonly used in ${course.category.toLowerCase()} roles.`);
setText("communityLearners", `${course.learners} learners active`);
setText("communityInitialOne", course.community[0]);
setText("communityMessageOne", course.community[1]);
setText("communityInitialTwo", course.community[2]);
setText("communityMessageTwo", course.community[3]);
setText("coursePrice", formatPrice());
setText("benefitOne", `${course.hours}+ hours of structured lessons`);
setText("benefitTwo", `${course.projects.length} portfolio-ready projects`);
setText("benefitThree", `Feedback from ${course.mentor}`);
setText("benefitFour", `Verified ${course.category} certificate`);
setText("mentorName", course.mentor);
setText("mentorBio", course.bio);
setText("mentorExperience", course.experience);
setText("mentorCredential", course.credential);
setImage("courseHeroImage", course.image, course.title);
setImage("courseMentorAvatar", course.mentorImage, course.mentor);
setImage("mentorPortrait", course.mentorImage, course.mentor);
document.getElementById("courseHeroImage")?.setAttribute("fetchpriority", "high");
document.getElementById("mentorPortrait")?.setAttribute("loading", "lazy");
renderCurriculum();
renderRoadmap();
renderProjects();
renderTools();

const enrollLink = document.getElementById("masterclassEnroll");
if (enrollLink) enrollLink.href = `login.html?course=${encodeURIComponent(slug)}`;
