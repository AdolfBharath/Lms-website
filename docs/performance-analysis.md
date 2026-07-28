# LMS Frontend Performance Analysis

Generated before optimization.

## Scope

The current app is still the existing HTML/CSS/vanilla JavaScript LMS, served through a minimal Next.js compatibility layer. The goal is to keep the UI, routing, Supabase/auth/business logic, and behavior unchanged while improving delivery performance.

## Largest JavaScript/CSS Files

- `assets/vendor/three.global.js`: about 2.0 MB
- `student.css`: about 734 KB
- `student.js`: about 296 KB
- `styles.css`: about 244 KB
- `admin.js`: about 186 KB
- `mentor.js`: about 178 KB
- `admin.css`: about 150 KB
- `mentor-new.css`: about 142 KB
- `assets/vendor/supabase-2.49.4.js`: about 116 KB
- `script.js`: about 93 KB
- `course-detail.js`: about 82 KB

## Largest Image Assets

Several course images are very large for web delivery:

- `course/7. Healthcare & Human Sciences/accuray-MFSEP2g4YS0.jpg`: about 10.3 MB
- `course/6. Design & Creative Arts/declan-sun-sni5HCfs1RM.jpg`: about 9.3 MB
- `course/4. Engineering & Emerging Technologies/adi-goldstein-EUsVwEOsblE.jpg`: about 8.8 MB
- `course/1. Technology & Software Development/chris-ried-ieic5Tq8YMk.jpg`: about 7.5 MB
- `course/1. Technology & Software Development/code.jpg`: about 7.5 MB

## Asset Totals

- PNG/JPG/JPEG assets outside excluded build/vendor folders: 246 files, about 285 MB
- WebP/AVIF assets outside excluded build/vendor folders: 55 files, about 4.4 MB

## Bottlenecks Identified

- Very large image payloads dominate potential page weight.
- Some images lack lazy loading, async decoding, and intrinsic dimensions.
- Role dashboards use large single CSS and JS files.
- Large vendor assets should not be loaded unless the page actually needs them.
- Static assets need long-lived immutable caching when served through the Next compatibility layer.

## Safe Optimizations Applied

- Add automatic HTML image enhancement at render time:
  - Adds `loading="lazy"` to images after the first two images.
  - Adds `decoding="async"` to images.
  - Adds intrinsic `width` and `height` where metadata can be read.
  - Uses optimized `.webp` sibling assets when available.
- Add a local image optimization script that creates `.webp` siblings while preserving originals.
- Strengthen static cache headers for CSS, JS, image, video, PDF, and font assets.
- Add production performance scripts without changing the development workflow.

## Remaining Bottlenecks

- Full unused CSS/JS removal requires page-by-page coverage because removing selectors/functions blindly could break the LMS.
- Large dashboard JS files still contain tightly coupled legacy DOM logic.
- The biggest image savings require converting more JPG/PNG files and updating references or enabling automatic sibling WebP use.
