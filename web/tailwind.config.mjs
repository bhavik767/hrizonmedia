/** @type {import('tailwindcss').Config} */

/*
 * Prose is where most of an Article's text lives, so the typography plugin has
 * to read from the brand tokens rather than its own neutral defaults —
 * otherwise the body copy silently keeps the template's greys in both themes.
 */
const prose = {
  '--tw-prose-body': 'var(--foreground)',
  '--tw-prose-bold': 'var(--heading)',
  '--tw-prose-bullets': 'var(--caption)',
  '--tw-prose-captions': 'var(--caption)',
  '--tw-prose-code': 'var(--heading)',
  '--tw-prose-counters': 'var(--caption)',
  '--tw-prose-headings': 'var(--heading)',
  '--tw-prose-hr': 'var(--border)',
  '--tw-prose-links': 'var(--link)',
  '--tw-prose-quote-borders': 'var(--border)',
  '--tw-prose-quotes': 'var(--heading)',
  '--tw-prose-td-borders': 'var(--border)',
  '--tw-prose-th-borders': 'var(--border)',
}

const headings = {
  h1: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-h1)',
    fontWeight: '800',
    letterSpacing: '-0.03em',
    lineHeight: '1.02',
    marginBottom: '0.25em',
  },
  h2: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-h2)',
    fontWeight: '800',
    letterSpacing: '-0.02em',
    lineHeight: '1.1',
  },
  h3: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--text-h3)',
    fontWeight: '700',
    letterSpacing: '-0.01em',
    lineHeight: '1.25',
  },
}

const config = {
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: [
            {
              ...prose,
              ...headings,
              // The brand book caps a paragraph at roughly 65 characters.
              maxWidth: '65ch',
              code: {
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-mono)',
              },
              pre: {
                fontFamily: 'var(--font-mono)',
              },
            },
          ],
        },
      },
    },
  },
}

export default config
