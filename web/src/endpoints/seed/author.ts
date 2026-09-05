/**
 * The byline and biography the site ships with.
 *
 * There is one Author by design, so this is a property of the site rather than
 * of an Article — setting it per Article would be ten copies of one fact. The
 * values live in the `author` global so they are editable without a deploy;
 * these are what the site falls back to before anyone has edited them.
 *
 * The biography answers "who is behind hrizonmedia", not "who wrote this
 * one" — a reader asking it is deciding whether to buy from us.
 */
export const defaultAuthor = {
  biography:
    'hrizonmedia is a secure video platform. Customers upload video; we encrypt it, store it, deliver it, and issue DRM licences so it plays on approved devices and nowhere else. These Articles come out of that work.',
  name: 'hrizonmedia',
}
