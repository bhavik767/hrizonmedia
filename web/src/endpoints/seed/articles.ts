import type { Payload } from 'payload'

/* ---------- lexical helpers ---------- */

const t = (text: string, format = 0) => ({
  type: 'text',
  detail: 0,
  format,
  mode: 'normal',
  style: '',
  text,
  version: 1,
})

const para = (text: string) => ({
  type: 'paragraph',
  children: [t(text)],
  direction: 'ltr' as const,
  format: '' as const,
  indent: 0,
  textFormat: 0,
  version: 1,
})

const h2 = (text: string) => ({
  type: 'heading',
  children: [t(text)],
  direction: 'ltr' as const,
  format: '' as const,
  indent: 0,
  tag: 'h2',
  version: 1,
})

const doc = (children: unknown[]) => ({
  root: {
    type: 'root',
    children,
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
    version: 1,
  },
})

const body = (lede: string, sections: [string, string][]) =>
  doc([para(lede), ...sections.flatMap(([head, note]) => [h2(head), para(note)])])

/* ---------- content ---------- */

export type LaunchArticle = {
  category: string
  lede: string
  meta: string
  sections: [string, string][]
  slug: string
  title: string
}

/**
 * The ten Articles the site launches with. They are working drafts and are the
 * Author's to finish; the reading experience accommodates them rather than the
 * other way round, which is why the suite renders every one of them.
 */
export const launchArticles: LaunchArticle[] = [
  {
    slug: 'stop-students-downloading-course-videos',
    title: 'How to stop students downloading your course videos',
    category: 'Piracy problems',
    meta: 'Every method for stopping course video downloads, from disabling right-click to studio DRM, and exactly how each one gets defeated.',
    lede: 'You spent months recording a course, and within weeks it is circulating in a group chat you were never invited to. This guide walks through every method people use to stop it, in order of how well they actually work, and is honest about where each one fails.',
    sections: [
      ['Why disabling right-click does nothing', 'It stops nobody. The file is still requested by the browser, and any developer console or extension retrieves it in seconds. Worth stating plainly because it is still sold as a feature.'],
      ['Hidden and obfuscated URLs', 'Security through obscurity. The moment one person shares the URL, everyone has it, and browser extensions surface these automatically.'],
      ['Signed and expiring URLs', 'A genuine improvement: links die after a set window. But the video itself is unprotected once fetched, so a single download during the valid window is permanent.'],
      ['AES-128 encrypted streaming', 'Now the file on disk is unreadable. The catch is that the decryption key travels to the browser in the clear, and tools that grab it are a search away.'],
      ['Studio DRM: Widevine, FairPlay and PlayReady', 'The key never reaches the browser unprotected. Decryption happens inside hardware the operating system will not let ordinary software read from. This is the first rung that a determined attacker cannot simply step over.'],
      ['Watermarking: catching the leak you cannot prevent', 'Burning the viewer identity into the picture does not stop a leak, it tells you who leaked it. In practice, telling students their name will appear on screen prevents more sharing than any technical control.'],
      ['What to actually do', 'Match the control to the value of the content and the sophistication of who wants it. Most creators are over-protected against casual sharing and under-protected against organised resale.'],
    ],
  },
  {
    slug: 'course-resold-on-telegram',
    title: 'Your course is being resold on Telegram. Here is what actually works.',
    category: 'Piracy problems',
    meta: 'Practical steps when your paid course appears on Telegram or a piracy forum, including takedowns, watermarking, and what prevents it recurring.',
    lede: 'Someone sends you a screenshot: your entire course, sold for a fraction of your price, in a channel with four thousand members. Here is what to do this week, and what to change so it does not happen again.',
    sections: [
      ['First, do not panic-email the seller', 'Direct contact usually confirms the content is worth stealing and rarely results in removal. Document first.'],
      ['Document everything before it disappears', 'Screenshots with visible URLs, channel names, timestamps and pricing. You will need this for every takedown route, and it vanishes once you make noise.'],
      ['How Telegram takedowns actually work', 'Telegram responds to copyright reports for public channels via a specific abuse address, with mixed results. Expect partial success and be prepared to repeat.'],
      ['DMCA where there is a host to serve', 'Effective against indexed sites, mirrors and cloud storage links. Largely ineffective against closed messaging channels, which is why prevention matters more here.'],
      ['Find out who leaked it', 'Dynamic watermarking stamps each viewer with their own identifier. When a copy surfaces, the leak has a name — which turns an unsolvable problem into an account you can close.'],
      ['Stop the rip at the source', 'Takedowns are reactive and unbounded in cost. DRM prevents the download that makes redistribution possible in the first place.'],
      ['What to tell your existing students', 'A short, calm notice that videos are now individually watermarked deters far more sharing than a threatening one.'],
    ],
  },
  {
    slug: 'can-you-stop-screen-recording',
    title: 'Can you stop someone screen-recording your videos?',
    category: 'Piracy problems',
    meta: 'An honest look at whether screen recording can be blocked, what DRM genuinely prevents, and where the protection ends.',
    lede: 'The short answer is: on phones and protected browsers, largely yes. On a determined desktop attacker, no. Anyone who tells you otherwise is selling you something, so here is where the line actually falls.',
    sections: [
      ['What hardware DRM genuinely blocks', 'When protected playback is active, the operating system refuses to hand the decoded frames to capture software. Recordings come out black. This is real and it works.'],
      ['Where it holds: mobile and protected browsers', 'iOS and Android enforce this at the system level, and Safari and Edge honour it for protected content. The majority of your students fall here.'],
      ['Where it leaks: desktop browsers and virtual machines', 'Chrome on desktop is weaker, and a virtual machine or a modified build changes the calculus entirely. Assume a technical adversary gets a copy.'],
      ['The analogue hole nobody can close', 'A phone camera pointed at a screen defeats every DRM system ever built. Quality is poor and watermarks survive, which is precisely why watermarking complements DRM rather than competing with it.'],
      ['So what is DRM actually for?', 'It converts casual, effortless copying into deliberate, degraded, traceable copying. That shifts the economics enough to matter, and that is the honest claim.'],
      ['How to talk about this with customers', 'Overpromising here is the fastest way to lose trust. Saying plainly what is and is not prevented is a competitive advantage in a market full of absolute claims.'],
    ],
  },
  {
    slug: 'unlisted-youtube-vimeo-not-private',
    title: 'Unlisted YouTube and Vimeo links are not private. Here is why.',
    category: 'Piracy problems',
    meta: 'What unlisted and password-protected video links really protect against, how they leak, and when you need something stronger.',
    lede: 'Unlisted means not listed. It does not mean private, protected, or restricted. If you are hosting a paid course on unlisted links, this is what you are actually relying on.',
    sections: [
      ['What "unlisted" actually means', 'The video is excluded from search and your channel page. Anyone holding the URL has full access, forever, with no account required.'],
      ['How the link escapes', 'Shared screens, forwarded emails, browser history on shared machines, and the page source of your own course platform. One leak is permanent.'],
      ['Why browser extensions defeat it instantly', 'Download extensions read the manifest the player itself requests. Nothing about an unlisted video resists this — it was never designed to.'],
      ['Password-protected Vimeo and domain locking', 'A real step up, and enough for low-value content. Both are still client-side controls around an unencrypted file.'],
      ['When this is genuinely fine', 'Free lead magnets, webinar replays, internal updates. Not everything needs protecting, and paying for DRM on a free preview is waste.'],
      ['When it is not', 'Anything you charge for, anything with a resale market, anything under licence from someone else.'],
    ],
  },
  {
    slug: 'vdocipher-alternatives-for-course-creators',
    title: 'VdoCipher alternatives for course creators',
    category: 'Comparisons',
    meta: 'An honest comparison of secure video hosting options for course creators, including where each one is genuinely the better choice.',
    lede: 'VdoCipher is the best-known name in video DRM, and for some buyers it is the right answer. This compares the realistic alternatives on the things that actually differ, and says plainly where we are not the better option.',
    sections: [
      ['What you are actually comparing', 'DRM support, watermarking, player quality, integration coverage, pricing model and support responsiveness. Most comparison articles skip the last two, which are what people leave over.'],
      ['VdoCipher', 'The incumbent. Holds Widevine certification directly rather than through a reseller, has the deepest integration library, and prices accordingly. If certification lineage matters to your procurement process, they are the safer choice and we will say so.'],
      ['DoveRunner (formerly PallyCon)', 'Enterprise-focused multi-DRM with strong forensic watermarking. Capable, but heavier than most course creators need.'],
      ['Muvi and Gumlet', 'Broader video platforms where security is one feature among many. Good if you want an all-in-one OTT stack, less focused if DRM is your actual problem.'],
      ['Bunny Stream and api.video', 'Excellent, inexpensive video infrastructure with encryption but not full studio DRM. The right answer when your risk is casual sharing rather than organised resale.'],
      ['EncryptStream', 'Multi-DRM through a licensing partner, dynamic watermarking, and pricing aimed at individual creators rather than enterprises. We resell DRM licences rather than holding certification directly — worth knowing when you compare.'],
      ['How to choose without overbuying', 'Start from what you are defending against. Most creators need less than the enterprise tier and more than an unlisted link.'],
    ],
  },
  {
    slug: 'what-video-drm-actually-costs',
    title: 'What video DRM actually costs',
    category: 'Comparisons',
    meta: 'A breakdown of real video DRM pricing: storage, bandwidth, encoding and licence fees, with worked examples at different student counts.',
    lede: 'Pricing in this market is deliberately vague, which is why so many people search for it and find nothing useful. Here is what drives the cost, and what you would actually pay at three realistic scales.',
    sections: [
      ['The four things you pay for', 'Storage, bandwidth, encoding, and DRM licence requests. Bandwidth dominates for almost everyone, and it is the one most pricing pages bury.'],
      ['Why bandwidth is the number that matters', 'A one-hour course video at reasonable quality is roughly a gigabyte of delivery per full view. Multiply by students, then by rewatches, which people forget.'],
      ['What a DRM licence request costs', 'A licence is issued per playback session, not per video. High rewatch rates change your bill more than library size does.'],
      ['Worked example: 100 students', 'Small library, modest delivery. At this scale most platforms cost less than a single refund, and the decision is about convenience rather than money.'],
      ['Worked example: 1,000 students', 'Bandwidth becomes the dominant line item. This is where per-gigabyte pricing differences start to matter more than headline plan prices.'],
      ['Worked example: 10,000 students', 'Volume pricing and commitments become negotiable. Also the point where a percentage of piracy losses genuinely exceeds the protection cost.'],
      ['The questions to ask before signing', 'Overage rates, whether encoding is charged separately, what happens at renewal, and whether support is included or extra.'],
    ],
  },
  {
    slug: 'drm-encryption-signed-urls-which-do-you-need',
    title: 'DRM, encryption and signed URLs: which do you actually need?',
    category: 'Comparisons',
    meta: 'The difference between signed URLs, AES encryption and studio DRM, and how to tell which level your content actually requires.',
    lede: 'These three get used interchangeably by vendors, and they are not the same thing. Understanding the difference is what stops you overpaying for protection you do not need, or underprotecting content that matters.',
    sections: [
      ['Signed URLs: access control, not protection', 'Controls who can request the file and for how long. Once delivered, the file is ordinary and portable.'],
      ['AES-128 encryption: protection with an exposed key', 'The stored and delivered video is unreadable without a key — but the key is handed to the browser to do its job. That is the weakness, and it is not a subtle one.'],
      ['Why encryption alone is not DRM', 'DRM is not defined by encryption. It is defined by the licence exchange that keeps the key out of reach, and by the hardware that decrypts without exposing frames. Vendors blur this deliberately.'],
      ['Studio DRM: Widevine, FairPlay, PlayReady', 'Three ecosystems, one per platform family. Supporting all three is what "multi-DRM" means, and it is table stakes rather than a differentiator.'],
      ['Choosing by threat, not by fear', 'Free content needs nothing. Paid content with casual sharing risk needs signed URLs and watermarking. Content with an active resale market needs DRM.'],
      ['A short decision table', 'Match your answer to what you are defending against, what it costs you when it leaks, and how technical the people taking it are.'],
    ],
  },
  {
    slug: 'protect-course-videos-wordpress-learndash',
    title: 'Protecting course videos in WordPress and LearnDash',
    category: 'Platform guides',
    meta: 'A practical guide to securing course videos in a WordPress and LearnDash site, including what LearnDash protects and what it does not.',
    lede: 'LearnDash controls who can reach a lesson page. It does not control what happens to the video once that page loads. This guide covers the gap and how to close it.',
    sections: [
      ['What LearnDash actually protects', 'Course enrolment, lesson sequencing and page access. All of it is access control at the page level, which is a different problem from video protection.'],
      ['Where the video is still exposed', 'If the lesson embeds a plain file or an unlisted link, enrolment gates the page and nothing gates the video. The URL works for anyone who has it.'],
      ['Setting up protected embeds', 'Replacing the embed with a protected player, and where the embed code goes in a LearnDash lesson.'],
      ['Restricting playback to your domain', 'Domain locking stops your embed working when copied to another site. Straightforward, and catches the most common form of theft.'],
      ['Adding viewer watermarks', 'Passing the logged-in user identity into the player so each stream is individually identifiable.'],
      ['Testing that it actually works', 'Open the lesson in a logged-out private window, try a download extension, and check the network tab. If you can retrieve the file, so can a student.'],
    ],
  },
  {
    slug: 'secure-video-in-moodle',
    title: 'Secure video in Moodle: a practical setup guide',
    category: 'Platform guides',
    meta: 'How to add download-protected, watermarked video to Moodle, written for administrators who inherited the installation.',
    lede: 'Moodle handles enrolment and grading well and video security barely at all. For institutions putting lecture recordings and exam preparation material online, that gap is the whole problem.',
    sections: [
      ['Why the default file resource is not enough', 'Uploading video as a course file serves it directly to any enrolled user, and the file is retrievable and shareable from that point on.'],
      ['Where protected video fits in a Moodle course', 'As an embedded activity or label, replacing the file resource. Enrolment still gates the page; the player now gates the video.'],
      ['Passing student identity to the player', 'Moodle user variables can populate a dynamic watermark, so every stream carries the viewer name or ID.'],
      ['Working with cohorts and large enrolments', 'Considerations for institutions running thousands of concurrent students, particularly around licence request volume during exam periods.'],
      ['Accessibility and captions', 'Protected playback must not break screen readers or caption tracks. Check this before rollout, not after a complaint.'],
      ['Rollout checklist for administrators', 'Pilot with one course, verify on the devices your students actually use, then expand.'],
    ],
  },
  {
    slug: 'teachable-thinkific-kajabi-video-protection',
    title: 'Teachable, Thinkific and Kajabi: how protected are your videos really?',
    category: 'Platform guides',
    meta: 'What video protection Teachable, Thinkific and Kajabi actually provide, where each falls short, and what to do about it.',
    lede: 'All three hosted course platforms advertise secure video. All three mean roughly the same thing by it, and it is less than most creators assume. Here is what each actually does.',
    sections: [
      ['What these platforms have in common', 'Signed or expiring URLs, referrer restrictions, and no studio DRM. Adequate against a curious student, not against someone with an extension installed.'],
      ['Teachable', 'What its video protection covers, and what happens to a lesson video once a student has the page open.'],
      ['Thinkific', 'Similar posture, with differences in how embeds and custom domains are handled.'],
      ['Kajabi', 'Broader marketing platform, comparable video protection, and the same underlying limitation.'],
      ['The common gap', 'None of them prevent the download itself, and none identify who leaked a copy. Those are the two things that matter once a course has resale value.'],
      ['Adding protection without leaving your platform', 'All three allow custom embeds, so protected video can be added without migrating your course, checkout or student data.'],
      ['A note on accuracy', 'These platforms change their features. This page is dated and updated rather than rewritten — check the date at the top before relying on it.'],
    ],
  },
]

/**
 * Creates any of the launch Articles that are not already there, and the three
 * categories they belong to. Existing Articles are left alone: they may carry
 * edits the Author has made since.
 */
/** The slug the Categories collection would generate from a title. */
export const categorySlug = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export async function seedLaunchArticles(payload: Payload): Promise<void> {
  const categoryIds: Record<string, number | string> = {}

  for (const title of [...new Set(launchArticles.map((article) => article.category))]) {
    const existing = await payload.find({
      collection: 'categories',
      limit: 1,
      where: { title: { equals: title } },
    })

    categoryIds[title] = existing.docs.length
      ? existing.docs[0]!.id
      : (
          await payload.create({
            collection: 'categories',
            context: { disableRevalidate: true },
            data: { slug: categorySlug(title), title },
          })
        ).id
  }

  for (const [index, article] of launchArticles.entries()) {
    const existing = await payload.find({
      collection: 'posts',
      limit: 1,
      where: { slug: { equals: article.slug } },
    })

    if (existing.docs.length) continue

    await payload.create({
      collection: 'posts',
      context: { disableRevalidate: true },
      data: {
        _status: 'published',
        categories: [categoryIds[article.category]!] as number[],
        content: body(article.lede, article.sections) as never,
        meta: { description: article.meta, title: article.title },
        publishedAt: new Date(
          Date.now() - (launchArticles.length - index) * 86_400_000,
        ).toISOString(),
        slug: article.slug,
        title: article.title,
      },
    })
  }
}
