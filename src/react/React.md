# React Code — General Guidance

Best practices for react code.

## Code Structure
- avoid useEffect hook where possible. Use when async calls are needed, but for other cases really try to avoid
- try to make 1 file per components (grouped with its typescript prop types)
- try to split larger components into smaller ones
- prefer props which reflect the HTML's in-built attributes (e.g. use onChange instead of onToggle to describe the callback for updating state of a component equivalent to a checkbox)
- when declaring a function accepted via a prop, use the `on` prefix (e.g. `onChange`, `onToggle`, `onLastSeen`). When declaring that function use the `handle` prefix (e.g. `handleChange`, `handleToggle`). So inside a component define `handleX` callbacks which are then passed to children on `onX` props.
- When a component forwards props to a child component, use the child component's prop types (or a `Partial<>` of those) to describe the prop types of the parent component. Don't duplicate them if the intent is clearly to 'pass them on'.


## File Structure
- logic and components are typically of two types: context-full and context-free. The context-free ones are generic components which can be reused across different areas of the app as building-blocks. The context-full are generally specific to a certain app area. E.g. a component which renders a div + some styling to form a 'menu' is context-free, while a component which renders the menu for the Settings page is context-full. Typically, the context-full components should be built from context-free components.


## State
- prefer using a key on a component instead of manual empty of the internal state in case props change significantly.
