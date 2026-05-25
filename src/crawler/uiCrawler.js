import { launchClassroomContext, saveStorageState } from '../auth/playwrightSession.js';
import { normalizeCourse } from '../parsers/classroom.js';

function courseIdFromHref(href) {
  const match = href.match(/\/c\/([^/?#]+)/);
  return match?.[1] || href;
}

export async function crawlViaUi({ logger, activeConfig }) {
  logger?.info?.('Discovering Classroom course links through Playwright UI fallback');
  const context = await launchClassroomContext({ config: activeConfig, headless: activeConfig.headless });
  const page = context.pages()[0] || (await context.newPage());

  try {
    await page.goto('https://classroom.google.com/', { waitUntil: 'networkidle' });

    const courses = await page.$$eval("a[href*='/c/']", (anchors) => {
      const seen = new Set();
      return anchors
        .map((anchor) => ({
          href: anchor.href,
          text: anchor.innerText || anchor.getAttribute('aria-label') || ''
        }))
        .filter((item) => {
          if (!item.href || seen.has(item.href)) return false;
          seen.add(item.href);
          return true;
        });
    });

    await saveStorageState(context, activeConfig);

    return {
      courses: courses.map((course) =>
        normalizeCourse({
          id: courseIdFromHref(course.href),
          name: course.text.split('\n')[0] || course.href,
          alternateLink: course.href
        })
      ),
      topics: [],
      materials: [],
      attachments: []
    };
  } finally {
    await context.close();
  }
}
