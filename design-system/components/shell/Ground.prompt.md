Render once behind the whole app; the shell and pages paint no background of their own on top.
```jsx
<Ground />
<div style={{position:"relative",height:300,overflow:"hidden"}}><Ground contained /></div>
```
- Blobs #bfd6f8 / #d0e4fb / #c3d8f9 / #ddeafc, blur 72px, 18-26s drift; grain 18% multiply; dots rgb(60 100 170) at 20%.
