Numbers in cards: `Tile` for one stat under a hairline, `Stats` for a row of them in one box.
```jsx
<Tile v="€120k" l="expected upside / yr" />
<Stats items={[{v:"7",l:"on your desk"},{v:"2",l:"past the 5-day promise",hot:true},{v:"2.4 d",l:"median time to answer"}]} />
```
- `hot` turns the number red (#ff3b30) - only for something late.
