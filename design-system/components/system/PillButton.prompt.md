The new system's button. Black is the one action; grey fill for the alternatives; white when it sits on the Ground; outline once it's done.
```jsx
<PillButton icon={<Icon name="sort" size={14} width={2.2} />}>Most supported</PillButton>
<PillButton variant="light" icon={<Icon name="pin" size={14} width={2.2} />}>All sites</PillButton>
<PillButton size="sm" icon={<Icon name="up" size={13} width={2.6} />} count={0}>Support</PillButton>
<PillButton size="sm" variant="outline" icon={<Icon name="check" size={13} width={2.6} />}>Published</PillButton>
```
- Corners 8px, Inter 13/600. Press scale(.97). Disabled 40%. Never blue-filled - blue is for state, not buttons.
