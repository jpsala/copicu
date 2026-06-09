---
id: product-register
status: active
kind: explanation
triggers:
  - product register
  - brand personality
  - design principles
  - anti-references
  - audience
primary_refs:
  - ../PROJECT.md
  - ./product-direction.md
  - ./ui-surface-architecture.md
---

# Product Register

Compact product and design brief for Copicu.

This is not a separate source of truth from `docs/PROJECT.md`. It is the product-register view used when UI/product work needs a quick reminder of audience, tone, anti-references and design principles.

## Register

product

## Users

Power desktop users who copy and reuse text, code, URLs, HTML, and images throughout the day. They work in focused local workflows and need a fast keyboard-first clipboard tool that stays out of the way.

## Product Purpose

Copicu is a local clipboard intelligence layer inspired by CopyQ. It captures, searches, previews, edits, copies, and pastes clipboard history with reliable native behavior, structured metadata, SQLite persistence, and a path toward typed actions, personal plugins, and privacy-aware AI.

Success means the picker opens quickly, search stays responsive at large history sizes, keyboard activation is predictable, paste-to-previous-window is reliable, and private clipboard data is handled conservatively.

## Brand Personality

Fast, discreet, precise. The interface should feel like a serious local tool, not a marketing site or decorative dashboard.

## Anti-References

Do not make this look like a landing page, promotional SaaS UI, generic card-heavy dashboard, decorative AI interface, or a clone of CopyQ's Qt visuals. Avoid heavy decoration, oversized hero typography, noisy motion, and explanatory UI copy that slows down expert workflows.

## Design Principles

- Keyboard-first by default: primary flows must work without leaving the keyboard.
- Preview-first density: show useful content and metadata without wasting vertical space.
- Native reliability over feature breadth: clipboard, focus, shortcuts, tray, and paste behavior take priority.
- Privacy is visible and conservative: never expose payloads in logs, examples, or debug surfaces by default.
- Extensible through typed host primitives: UI, actions, shortcuts, and future plugins should reuse the same stable operations.

## Accessibility And Inclusion

Target accessible product UI defaults: readable contrast, visible focus states, reduced-motion support, and responsive behavior for narrow picker windows. Motion should communicate state and never block content visibility.
