---
Datum: 2026-03-30
tags:
  - AI
  - vibeCoding
---
# Prompt Template (Hybrid: English + Swedish Context)

<!--
Detta är en generell mall för att skriva instruktioner till en AI i markdown.
Struktur och instruktioner är på engelska.
Kontext skrivs på svenska där det är naturligt.
Optimerad för att bygga webbapplikationer.
-->
## Goal
<!--
Beskriv tydligt vad som ska uppnås.
Fokusera på slutresultatet ("definition of done").
-->
Skapa en webbapp för att planera en gudstjänstordning innehållande allt från musik, textläsning, pålysningar och övrig information. Bibelverser och psalmer ska gå att välja från en databas. Det ska finnas en funktion för att maila ut en PDF-export till alla ansvariga.
## Context
<!--
Beskriv relevant bakgrund.
Här kan du skriva på svenska.
Inkludera system, tech stack, begränsningar och vad som redan finns.
-->
Söndagsgudstjänster i Gislaveds frikyrkoförsamling planeras av en mötesledare varje vecka, ett uppdrag som alternerar på en rad personer. Utöver mötesledaren är det en rad inblandade så som ljudtekniker, projektoransvarig, predikant, musiker, textläsare, servicegrupp etc. Alla dessa behöver ta del av gudstjänstplaneringen när den är klar. Planeringen innehåller bibeltexter, psalmer och sånger, predikan, pålysningar och övriga punkter. 
## Role
You are a senior fullstack engineer with strong experience in modern web development.
You prioritize clean architecture, maintainability, and pragmatic solutions.
You write clear, production-ready code and avoid unnecessary complexity.
## Design
The design should be clean, modern, and minimal.
Prioritize usability, clarity, and consistency across the interface.
Use generous whitespace and clear visual hierarchy.
### Design Principles
- Keep UI simple and intuitive
- Use consistent spacing, typography, and component patterns
- Avoid unnecessary visual noise
- Prefer accessibility and readability over aesthetics
### Color Palette (Gislaveds frikyrkoförsamling)
- Primary: # 8DAF3F
- Primary Dark: # 6F8F2F
- Secondary Light: # AFCB6A
- Secondary Muted: # 9FAF8C
- Text: # 1A1A1A
- Background: # F2F2F2
- Surface: # FFFFFF
### Logo
- gff_logga.jpg
### Typography
- Primary: Calibri (Regular, Medium, Bold)
- Fallback: Arial
- Use bold for headings and regular for body text
### UI Guidelines
- Use a light background with subtle contrast between surface and background
- Use yellow (#ffb300) sparingly for primary actions and highlights
- Prefer calm, desaturated tones for larger surfaces
- Use subtle shadows and borders for separation
- Ensure responsive design (mobile-first)
- Maintain a warm but professional and technical feel
## Instructions
### General
1. Clarify assumptions if needed
2. Design the overall architecture
3. Define the main components and structure
4. Suggest data models and state management
5. Define API endpoints or data flow (if applicable)
6. Provide example implementation
7. Explain key technical decisions briefly
### Functions
1. Lägg till/ta bort/ändra mötespunkt
	1. Databas med bibelord (Bibel2000)
	2. Databas med Psalmer och sånger (sångbok)
2. Exportera till PDF
	1. Följ designstrategi inklusive logga
	2. Inkludera datum, mötespunkter, ansvariga och eventuell andra väsentliga delar
3. E-posta PDF-filen till ansvariga personer
	1. Använd e-postmallen "[[mailTemplate]]"
## Output Format
- Comunicate in swedish
- Use markdown
- Structure the response with clear headings
- Include code blocks for all code
- Separate explanation and implementation clearly
- Keep explanations concise and focused on decisions
## Constraints
- Do not overengineer the solution
- Prefer simple and maintainable approaches
- Use common and well-supported patterns
- Avoid unnecessary dependencies
- Assume a modern web stack unless specified otherwise
- Don't build a solution for saving historic plans for now
## Quality Criteria
- Clean and readable code
- Logical and scalable structure
- Production-ready (not just examples)
- Minimal but sufficient explanation
- Consistent naming and patterns
## Avoid
- Overly abstract or theoretical solutions
- Unnecessary complexity
- Long generic explanations
- Mixing multiple architectural styles without reason
- Placeholder or incomplete code
## Meta
If something is unclear or missing, ask clarifying questions before providing a full solution. For example if the solution should benefit of a database in Supabase.
## Input
<!--
Om du skickar med dynamisk input (t.ex. JSON, kod, data), placera det här.
Separera tydligt från instruktionerna.
-->

```json
{
  
}