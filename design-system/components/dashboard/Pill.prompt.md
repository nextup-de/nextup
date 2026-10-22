Small status label on cards and rows - the colour carries meaning, never decoration.
```jsx
<Pill tone="accent">Awaiting decision</Pill>
<Pill tone="ok">Answered: yes</Pill>
<Pill tone="ink">Live</Pill>
<Pill tone={StatusTone("Building")}>Being built</Pill>
```
- accent (amber #9a5300 on #fff1dc) = waiting on someone; ok = a result; ink = live; grey/soft = in work or a neutral tag; ghost = quiet text. Same look as `Badge` - prefer Badge in new work.
