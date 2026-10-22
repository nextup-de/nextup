Wraps any input with its label and a single line under it - a hint, or an error that replaces the hint.
```jsx
<Field id="email" label="Work email" hint="We will take you to your company's login.">
  <Input id="email" placeholder="you@company.com" />
</Field>
<Field id="code" label="Your login code" error="Enter your personal login code.">
  <Input id="code" invalid />
</Field>
```
- Errors are plain sentences that say what to do ("Enter your personal login code. Your team leader has it.").
