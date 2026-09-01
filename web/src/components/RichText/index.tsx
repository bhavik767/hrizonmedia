import { MediaBlock } from '@/blocks/MediaBlock/Component'
import {
  DefaultNodeTypes,
  SerializedBlockNode,
  SerializedLinkNode,
  type DefaultTypedEditorState,
} from '@payloadcms/richtext-lexical'
import {
  JSXConvertersFunction,
  LinkJSXConverter,
  RichText as ConvertRichText,
} from '@payloadcms/richtext-lexical/react'

import { CodeBlock, CodeBlockProps } from '@/blocks/Code/Component'

import type {
  BannerBlock as BannerBlockProps,
  CallToActionBlock as CTABlockProps,
  FaqBlock as FaqBlockProps,
  KeyTakeawaysBlock as KeyTakeawaysBlockProps,
  MediaBlock as MediaBlockProps,
} from '@/payload-types'
import type { RenderedAnchors } from '@/utilities/articleHeadings'

import { BannerBlock } from '@/blocks/Banner/Component'
import { CallToActionBlock } from '@/blocks/CallToAction/Component'
import { FaqBlock } from '@/blocks/Faq/Component'
import { KeyTakeawaysBlock } from '@/blocks/KeyTakeaways/Component'
import { documentPath } from '@/utilities/routes'
import { cn } from '@/utilities/ui'
import { renderedAnchors } from '@/utilities/articleHeadings'

type NodeTypes =
  | DefaultNodeTypes
  | SerializedBlockNode<
      | BannerBlockProps
      | CodeBlockProps
      | CTABlockProps
      | FaqBlockProps
      | KeyTakeawaysBlockProps
      | MediaBlockProps
    >

const internalDocToHref = ({ linkNode }: { linkNode: SerializedLinkNode }) => {
  const { value, relationTo } = linkNode.fields.doc!
  if (typeof value !== 'object') {
    throw new Error('Expected value to be an object')
  }
  return documentPath(relationTo, String(value.slug))
}

/**
 * Headings carry the same anchors the table of contents points at. Both come
 * from one walk over the same document, so the two cannot drift: the contents
 * is not told what the body rendered, it derives it.
 */
const buildJsxConverters =
  ({ blocks, headings }: RenderedAnchors): JSXConvertersFunction<NodeTypes> =>
  ({ defaultConverters }) => ({
    ...defaultConverters,
    heading: ({ childIndex, node, nodesToJSX, parent }) => {
      const Tag = node.tag
      const id = parent?.type === 'root' ? headings[childIndex] : undefined

      return (
        <Tag className="scroll-mt-28" id={id}>
          {nodesToJSX({ nodes: node.children })}
        </Tag>
      )
    },
    ...LinkJSXConverter({ internalDocToHref }),
    blocks: {
      banner: ({ node }) => <BannerBlock className="col-start-2 mb-4" {...node.fields} />,
      mediaBlock: ({ node }) => (
        <MediaBlock
          className="col-start-1 col-span-3"
          imgClassName="m-0"
          {...node.fields}
          captionClassName="mx-auto max-w-[48rem]"
          enableGutter={false}
          disableInnerContainer={true}
        />
      ),
      code: ({ node }) => <CodeBlock className="col-start-2" {...node.fields} />,
      cta: ({ node }) => <CallToActionBlock {...node.fields} />,
      faq: ({ childIndex, node }) => (
        <FaqBlock
          anchor={blocks[childIndex]?.heading}
          questionAnchors={blocks[childIndex]?.questions}
          {...node.fields}
        />
      ),
      keyTakeaways: ({ childIndex, node }) => (
        <KeyTakeawaysBlock anchor={blocks[childIndex]?.heading} {...node.fields} />
      ),
    },
  })

type Props = {
  data: DefaultTypedEditorState
  enableGutter?: boolean
  enableProse?: boolean
} & React.HTMLAttributes<HTMLDivElement>

export default function RichText(props: Props) {
  const { className, enableProse = true, enableGutter = true, ...rest } = props
  return (
    <ConvertRichText
      converters={buildJsxConverters(renderedAnchors(props.data))}
      className={cn(
        'payload-richtext',
        {
          container: enableGutter,
          'max-w-none': !enableGutter,
          // No `prose-invert`: the prose variables are already wired to the
          // brand tokens, which switch with the theme themselves.
          'mx-auto prose': enableProse,
        },
        className,
      )}
      {...rest}
    />
  )
}
