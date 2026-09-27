"use client";
// Pilot request form. Validation runs here first, with our own messages under each field, and
// again in the server action (src/server/actions/pilot.ts), which saves a real request as a
// PilotRequest row. With no database it falls back to a pre-filled mailto: draft. The privacy
// policy describes both - keep them in sync.
import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import {
  readPilotRequest,
  validatePilotRequest,
  type PilotErrors,
  type PilotField,
  type PilotRequest,
} from "@/features/pilot/request";
import { requestPilot, type PilotState } from "@/server/actions/pilot";
import styles from "./ContactForm.module.css";

type Props = { to: string };

const EMPTY: PilotRequest = { name: "", company: "", email: "", decision: "", council: "not sure", message: "" };

export function ContactForm({ to }: Props) {
  const [state, submit, pending] = useActionState<PilotState, FormData>(requestPilot, { status: "idle" });
  const [values, setValues] = useState<PilotRequest>(EMPTY);
  const [errors, setErrors] = useState<PilotErrors>({});
  const formRef = useRef<HTMLFormElement>(null);

  // The server had the last word: show its messages, keep what was typed. Adjusted during render
  // (the React-sanctioned way to derive state from a prop), not in an effect.
  const [seen, setSeen] = useState<PilotState>(state);
  if (state !== seen) {
    setSeen(state);
    if (state.status === "invalid") {
      setValues(state.values);
      setErrors(state.errors);
    } else if (state.status === "failed") {
      setValues(state.values);
    }
  }

  useEffect(() => {
    if (state.status === "invalid") focusFirstError(formRef.current, state.errors);
    else if (state.status === "mailto") window.location.href = state.href;
  }, [state]);

  function set(field: PilotField, value: string) {
    const next = { ...values, [field]: value } as PilotRequest;
    setValues(next);
    // A field that was wrong turns right the moment it is fixed - no waiting for the next submit.
    if (errors[field]) setErrors({ ...errors, [field]: validatePilotRequest(readPilotRequest(next))[field] });
  }

  function touch(field: PilotField) {
    const msg = validatePilotRequest(readPilotRequest(values))[field];
    if (msg !== errors[field]) setErrors({ ...errors, [field]: msg });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const found = validatePilotRequest(readPilotRequest(values));
    setErrors(found);
    if (Object.keys(found).length > 0) {
      e.preventDefault();
      focusFirstError(e.currentTarget, found);
    }
  }

  if (state.status === "sent") {
    return (
      <div className={styles.sent} role="status">
        <span className={styles.sentMark} aria-hidden="true">
          <svg viewBox="0 0 20 20"><path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <h3>Request received.</h3>
        <p>
          We reply to <strong>{state.email}</strong> within two working days - the promise applies to us too.
          Day 1 is a twenty-minute call with your department head; we suggest times in the reply.
        </p>
        <p className={styles.sentNote}>
          Nothing to do until then. If something changes, write to <a href={`mailto:${to}`}>{to}</a>.
        </p>
      </div>
    );
  }

  const a11y = (f: PilotField) =>
    errors[f] ? { "aria-invalid": true as const, "aria-describedby": `${f}-error` } : {};

  return (
    <form ref={formRef} className={styles.form} action={submit} onSubmit={onSubmit} noValidate>
      <div className={styles.two}>
        <Field id="name" label="Your name" error={errors.name}>
          <input className="nh-input" id="name" name="name" type="text" autoComplete="name" value={values.name}
            onChange={(e) => set("name", e.target.value)} onBlur={() => touch("name")} {...a11y("name")} />
        </Field>
        <Field id="company" label="Company" error={errors.company}>
          <input className="nh-input" id="company" name="company" type="text" autoComplete="organization" value={values.company}
            onChange={(e) => set("company", e.target.value)} onBlur={() => touch("company")} {...a11y("company")} />
        </Field>
      </div>
      <Field id="email" label="Work e-mail" hint="So we can reply. Not used for anything else." error={errors.email}>
        <input className="nh-input" id="email" name="email" type="email" autoComplete="email" placeholder="you@company.com" value={values.email}
          onChange={(e) => set("email", e.target.value)} onBlur={() => touch("email")} {...a11y("email")} />
      </Field>
      <Field id="decision" label="The decision that keeps waiting" hint="One recurring decision type. Approving a tool, signing off a clause, answering a data request." error={errors.decision}>
        <input className="nh-input" id="decision" name="decision" type="text" placeholder="e.g. approving a tool under €5k" value={values.decision}
          onChange={(e) => set("decision", e.target.value)} onBlur={() => touch("decision")} {...a11y("decision")} />
      </Field>
      <Field id="council" label="Do you have a works council?" hint="Changes nothing about the pilot - only about who we talk to first.">
        <select className="nh-input nh-select" id="council" name="council" value={values.council} onChange={(e) => set("council", e.target.value)}>
          <option value="no">No</option>
          <option value="yes">Yes</option>
          <option value="not sure">Not sure</option>
        </select>
      </Field>
      <Field id="message" label="Anything else" error={errors.message}>
        <textarea className="nh-input nh-textarea" id="message" name="message" rows={4} value={values.message}
          onChange={(e) => set("message", e.target.value)} onBlur={() => touch("message")} {...a11y("message")} />
      </Field>

      {/* Honeypot: a real visitor never sees this; a form-filling bot fills it and is dropped server-side. */}
      <div className={styles.trap} aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {state.status === "failed" ? (
        <p className={styles.failed} role="alert">
          The request could not be saved just now. Nothing was lost - what you typed is still here. Try again in a
          moment, or send it to <a href={`mailto:${to}`}>{to}</a>.
        </p>
      ) : null}

      <Button type="submit" variant="accent" block disabled={pending}>
        {pending ? "Sending…" : "Request the pilot"}
      </Button>

      <p className={styles.privacy}>
        Stored only to reply to you, then deleted once the pilot is set up or declined. <Link href="/privacy">Privacy policy</Link>.
      </p>
    </form>
  );
}

const ORDER: PilotField[] = ["name", "company", "email", "decision", "council", "message"];

function focusFirstError(form: HTMLFormElement | null, errors: PilotErrors) {
  const first = ORDER.find((f) => errors[f]);
  if (!first || !form) return;
  const el = form.elements.namedItem(first);
  if (el instanceof HTMLElement) el.focus();
}
