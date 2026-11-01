// Mechanical stand-in for the DSH baseline primitives. It preserves the public
// props this plugin composes (controlled open, title/summary, code, details,
// button) without copying native visuals; real GUI behavior remains upstream.
export const PRIMITIVES_ID = '@deepseek-ai/dsh-client-ui-primitives'

export function clientPrimitives(react) {
  const h = (...args) => react.createElement(...args)
  function DisclosureRow(props) {
    const toggle = () => { if (props.expandable !== false) props.onToggle?.() }
    return h('div', {
      'data-disclosure-row': 'true',
      'data-open': props.open ? 'true' : 'false',
      role: 'button',
      tabIndex: 0,
      onClick: toggle,
      onKeyDown: event => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        toggle()
      },
    },
    h('span', { 'data-disclosure-title': 'true' }, props.title),
    props.collapsedContent ?? null,
    props.open ? props.children : null)
  }
  const IconSparkleRegular = () => h('span', { 'aria-hidden': 'true', 'data-icon': 'sparkle' })
  const CodeBlock = props => h('pre', { 'data-code-block': props.lang ?? 'text' }, props.code)
  const JsonBlock = props => h('details', { 'data-json-block': props.label, open: props.defaultOpen === true },
    h('summary', null, props.label), h('pre', null, JSON.stringify(props.payload, null, 2)))
  const Button = props => h('button', { type: props.type ?? 'button', disabled: props.disabled, onClick: props.onClick }, props.children)
  return { Button, CodeBlock, DisclosureRow, IconSparkleRegular, JsonBlock }
}
