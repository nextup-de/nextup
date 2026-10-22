Form-level button (login, settings, dialogs) - black for the one action that moves things forward, white ghost for the alternative. For toolbars and cards use `PillButton`.
```jsx
<Button>Log in</Button>
<Button variant="ghost" block>Continue with Microsoft</Button>
<Button size="sm">Answer T. Vogel</Button>
```
- `variant`: primary (black) | ghost (white, hairline) | fill (grey). `size`: md 44px / sm 34px. `block` fills the width.
- Inter 15/600, 8px corners. Press scale(.98); disabled 40%. Never blue-filled - blue is for state.
