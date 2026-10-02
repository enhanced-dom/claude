# Code — General Guidance

Best practices for code.

## Code formatting
- preffer imports from relative paths if importing from same folder or subfolder.
- never import from a parent index.ts or the current index.ts (in the current folder) unless the file is a test file, or a storybook file. We should avoid circular imports.


## Styling
- use css variables where possible
- avoid px values. Most dimensions are a calc(some_spacing_variable * 2 + Xch) or calc(some_spacing_variable * 2 + Xrm) or some calc based on the line height. Other dimensions are based on a percentage of the parent's dimensions or vh/vw units (or their variants).
- try to avoid z-index 'solutions' for visibility. Leverage the CSS stacking 'context' instead.


## File Structure
- use file suffixes to describe the file type. E.g. `MyStatusBar.component.tsx`, `MyStatusBar.styles.pcss`, `MyStatusBar.test.tsx`.
- group the files in the same folder, and treat the folder as a 'module' (i.e. imports should be `from './mymodule'` not `from './mymodule/MyFile'`). Each module is thought of as an opaque boundary, exposing to the outside only what needs exposing. This means that most modules need an `index.ts` file to describe exports. Preffer named exports. Don't make a folder for one file. The component inside the module should have the same name as the module (e.g. folder `MyBar` has files `MyBar.component.tsx`, `MyIcon.component.tsx`, `index.ts` inside).
- place modules close to the place where they are used. If a module is used by multiple consumers, place it in the common 'parent'. There are exceptions, when we e.g. designate a 'context-free components' folder via an alias, in which case we'll treat that as our design system implementation.


## Documentation
- do not document what the code is doing verbatim (classnames, tables, function names, parameter types). These are already included in the code.
- write comments for cavias (exceptions, pitfalls, scenarios not covered etc).
- don't write long comments.
- comments from files closer to the root folder should typically not reference files deeper in the subfolders.
- context files are of several categories: a) high-level functionality description, b) technical implementation details, c) implementation status (during e.g. multi-plase implementation), d) test plans or test implementation


## Testing
- test corner cases, as well as happy flows
- tests should have labels by which they can be referenced in the documentation. E.g. 'USER_TESTS-1', 'USER_TESTS-2', etc. Test description should not include 'the steps', but should include what is being tested e.g. 'ensure user appears as logged out when their token expired' instead of step-by-step test description.


## Typing
- if types are coming from the backend, use those instead of making duplicates on the frontend
- use enums rather than magical strings. Except for the boundary with 3rd party packages who have typings described as string values.
- preffer enum value instead of boolean, especially if multiple booleans are needed to interpret the state. Prefer lists of enum values if the behavior is cummulative.
- avoid casts (i.e. `someValue as SomeType`) as much as possible. Sometimes they will be needed, but most times they are a smell.
- avoid non-null assertion operator. Make better types and guards
- avoid ;() structure. do some more constants if some casting is needed.


## HTML elements / components
- try to stick to the HTML standard namings (e.g. disabled instead of "isDisabled" for an attribute describing whether the component is disabled or not and e.g. "onChange" instead of "onToggle").