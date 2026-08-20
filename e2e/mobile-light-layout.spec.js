import { test, expect } from '@playwright/test';

const MOBILE_VIEWPORT = { width: 375, height: 812 };
const HORIZONTAL_TOLERANCE_PX = 1;
const MINIMUM_TEXT_CONTRAST = 4.5;
const LARGE_TEXT_CONTRAST = 3;

const PUBLIC_ROUTES = [
  { path: '/', label: 'home' },
  { path: '/blog', label: 'blog' },
  { path: '/knowledge', label: 'knowledge' },
  { path: '/architecture', label: 'architecture' },
  { path: '/mcp', label: 'MCP gateway' }
];

async function visitInLightMode(page, route) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });

  await expect(page.locator('html')).toHaveClass(/(^|\s)light(\s|$)/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('#root > *').first()).toBeVisible();

  // Let route-level lazy imports and initial data requests settle without making
  // the regression suite depend on a permanently idle network connection.
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);

  // Web fonts can change wrapping after the application has rendered.
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });

  // Motion is not part of this static layout assertion. Disabling it avoids
  // flagging an element while it is deliberately moving into its final position.
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
    `
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
}

async function collectMobileDiagnostics(page) {
  return page.evaluate(({ tolerance, normalTextContrast, largeTextContrast }) => {
    const viewportWidth = window.innerWidth;
    const exemptContentSelector = 'pre, code, .sr-only, .overflow-x-auto';

    const parseColor = (value) => {
      const rgbMatch = value.match(/^rgba?\(([^)]+)\)$/i);
      if (rgbMatch) {
        const parts = rgbMatch[1].split(/[\s,/]+/).filter(Boolean).map(Number);
        if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;

        return {
          red: parts[0],
          green: parts[1],
          blue: parts[2],
          alpha: Number.isNaN(parts[3]) ? 1 : (parts[3] ?? 1)
        };
      }

      // Tailwind v4 serializes several palette colors as oklch(), even when
      // getComputedStyle() is queried. Convert that browser value to sRGB
      // before calculating WCAG contrast.
      const oklchMatch = value.match(/^oklcha?\(([^)]+)\)$/i);
      if (!oklchMatch) return null;

      const [rawChannels, rawAlpha] = oklchMatch[1].split('/').map((part) => part.trim());
      const channels = rawChannels.split(/[\s,]+/).filter(Boolean);
      if (channels.length < 3) return null;

      const parseChannel = (channel) => {
        const numeric = Number.parseFloat(channel);
        if (Number.isNaN(numeric)) return null;
        return channel.endsWith('%') ? numeric / 100 : numeric;
      };

      const lightness = parseChannel(channels[0]);
      const chroma = parseChannel(channels[1]);
      const hue = Number.parseFloat(channels[2]);
      const alpha = rawAlpha ? parseChannel(rawAlpha) : 1;
      if ([lightness, chroma, hue, alpha].some((channel) => channel === null || Number.isNaN(channel))) {
        return null;
      }

      const radians = hue * (Math.PI / 180);
      const a = chroma * Math.cos(radians);
      const b = chroma * Math.sin(radians);
      const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
      const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
      const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
      const toSrgb = (linear) => {
        const gamma = linear <= 0.0031308
          ? 12.92 * linear
          : 1.055 * linear ** (1 / 2.4) - 0.055;
        return Math.min(1, Math.max(0, gamma)) * 255;
      };

      return {
        red: toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        green: toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        blue: toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
        alpha
      };
    };

    const blend = (foreground, background) => {
      const alpha = foreground.alpha;
      return {
        red: foreground.red * alpha + background.red * (1 - alpha),
        green: foreground.green * alpha + background.green * (1 - alpha),
        blue: foreground.blue * alpha + background.blue * (1 - alpha),
        alpha: 1
      };
    };

    const relativeLuminance = ({ red, green, blue }) => {
      const toLinear = (channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };

      return 0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue);
    };

    const contrastRatio = (foreground, background) => {
      const foregroundLuminance = relativeLuminance(foreground);
      const backgroundLuminance = relativeLuminance(background);
      const lighter = Math.max(foregroundLuminance, backgroundLuminance);
      const darker = Math.min(foregroundLuminance, backgroundLuminance);
      return (lighter + 0.05) / (darker + 0.05);
    };

    const isVisible = (element) => {
      for (let current = element; current; current = current.parentElement) {
        const style = window.getComputedStyle(current);
        if (
          style.display === 'none'
          || style.visibility === 'hidden'
          || Number(style.opacity) === 0
        ) {
          return false;
        }
      }

      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const hasIntentionalHorizontalScroll = (element) => {
      if (element.closest(exemptContentSelector)) return true;

      for (let current = element; current; current = current.parentElement) {
        const overflowX = window.getComputedStyle(current).overflowX;
        if (overflowX === 'auto' || overflowX === 'scroll') return true;
      }

      return false;
    };

    const elementLabel = (element) => {
      const tag = element.tagName.toLowerCase();
      const id = element.id ? `#${element.id}` : '';
      const classes = Array.from(element.classList).slice(0, 3).map((className) => `.${className}`).join('');
      return `${tag}${id}${classes}`;
    };

    const rootBackground = parseColor(window.getComputedStyle(document.documentElement).backgroundColor);
    const backgroundFor = (element) => {
      if (!rootBackground) return null;

      const ancestry = [];
      for (let current = element; current && current !== document.documentElement; current = current.parentElement) {
        ancestry.unshift(current);
      }

      return ancestry.reduce((background, current) => {
        const color = parseColor(window.getComputedStyle(current).backgroundColor);
        return color && color.alpha > 0 ? blend(color, background) : background;
      }, rootBackground);
    };

    const overflowingElements = [];
    const contrastIssues = [];

    for (const element of document.body.querySelectorAll('*')) {
      if (!isVisible(element)) continue;

      const rect = element.getBoundingClientRect();
      const position = window.getComputedStyle(element).position;
      const isNormalFlowElement = position !== 'absolute' && position !== 'fixed';
      if (isNormalFlowElement
        && !hasIntentionalHorizontalScroll(element)
        && (rect.left < -tolerance || rect.right > viewportWidth + tolerance)) {
        overflowingElements.push({
          element: elementLabel(element),
          left: Math.round(rect.left * 10) / 10,
          right: Math.round(rect.right * 10) / 10,
          width: Math.round(rect.width * 10) / 10
        });
      }

      const directText = Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent.trim())
        .join(' ')
        .trim();
      const controlText = element.matches('input, textarea, select')
        ? (element.value || element.placeholder || '')
        : '';

      if (!directText && !controlText) continue;
      if (element.closest('.sr-only') || element.getAttribute('aria-hidden') === 'true') continue;
      if (element.classList.contains('material-symbols-outlined')) continue;
      if (element.matches('[disabled], [aria-disabled="true"]')) continue;

      const foreground = parseColor(window.getComputedStyle(element).color);
      const background = backgroundFor(element);
      if (!foreground || !background) continue;

      const effectiveForeground = foreground.alpha < 1 ? blend(foreground, background) : foreground;
      const fontSize = Number.parseFloat(window.getComputedStyle(element).fontSize);
      const fontWeight = Number.parseInt(window.getComputedStyle(element).fontWeight, 10);
      const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
      const minimumContrast = isLargeText ? largeTextContrast : normalTextContrast;
      const ratio = contrastRatio(effectiveForeground, background);

      if (ratio + 0.01 < minimumContrast) {
        contrastIssues.push({
          element: elementLabel(element),
          text: (directText || controlText).replace(/\s+/g, ' ').slice(0, 80),
          contrast: Number(ratio.toFixed(2)),
          minimumContrast
        });
      }
    }

    const scrollingElement = document.scrollingElement || document.documentElement;
    return {
      viewportWidth,
      rootScrollWidths: {
        documentElement: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        scrollingElement: scrollingElement.scrollWidth
      },
      overflowingElements: overflowingElements.slice(0, 25),
      overflowCount: overflowingElements.length,
      contrastIssues: contrastIssues.slice(0, 25),
      contrastIssueCount: contrastIssues.length
    };
  }, {
    tolerance: HORIZONTAL_TOLERANCE_PX,
    normalTextContrast: MINIMUM_TEXT_CONTRAST,
    largeTextContrast: LARGE_TEXT_CONTRAST
  });
}

test.describe('Mobile light-theme layout regression', () => {
  test.use({
    viewport: MOBILE_VIEWPORT,
    colorScheme: 'light'
  });

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      window.localStorage.setItem('cyber_theme', 'light');
    });
  });

  for (const route of PUBLIC_ROUTES) {
    test(`${route.label} remains readable and within a 375px viewport`, async ({ page }) => {
      await visitInLightMode(page, route.path);
      const diagnostics = await collectMobileDiagnostics(page);
      const maximumRootScrollWidth = Math.max(...Object.values(diagnostics.rootScrollWidths));

      expect.soft(
        maximumRootScrollWidth,
        `${route.path} must not create page-level horizontal scrolling: ${JSON.stringify(diagnostics.rootScrollWidths)}`
      ).toBeLessThanOrEqual(diagnostics.viewportWidth + HORIZONTAL_TOLERANCE_PX);

      expect.soft(
        diagnostics.overflowCount,
        `${route.path} has visible elements outside the viewport: ${JSON.stringify(diagnostics.overflowingElements)}`
      ).toBe(0);

      expect(
        diagnostics.contrastIssueCount,
        `${route.path} has low-contrast visible light-theme text: ${JSON.stringify(diagnostics.contrastIssues)}`
      ).toBe(0);
    });
  }
});
