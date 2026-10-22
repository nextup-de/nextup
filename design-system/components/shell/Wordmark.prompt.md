The NextUp logo - always one of the supplied files, never redrawn, recoloured or masked.
```jsx
<Wordmark base="../../assets/brand/" height={28} />                     {/* app bar */}
<Wordmark base="assets/brand/" layout="stacked" height={120} />          {/* splash, empty pages */}
<Wordmark base="assets/brand/" tone="blue-white" height={40} />          {/* on dark */}
<Wordmark base="assets/brand/" layout="mark" tone="blue" height={24} />  {/* favicon-size spots */}
```
- Files: `nextup-{horizontal,stacked}-{blue,black,white,blue-white}.png`, `nextup-mark-{blue,black,white}.png`, plus `nextup-icon-{blue,black,white}.svg` (the mark as vector). All trimmed to the artwork, transparent.
- "blue" = blue mark + black name. Blue is #1286fc. 28px tall in the app bar, 44px on login.
