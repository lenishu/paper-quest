# The story behind PaperQuest

## Inspiration

PaperQuest started with a question I kept asking myself: **How do I turn everything I'm reading and learning into knowledge I can actually use?**

I entered college as a physics major, moved into mathematics, and began exploring artificial intelligence, high-performance computing, quantum computing, and quantitative finance. As my interests evolved, I accumulated research papers, course materials, notes, and project ideas. Connecting those resources and figuring out what to learn next became increasingly difficult.

Learning happens across classes, projects, hackathons, clubs, and independent exploration. Each experience adds knowledge, but the connections often stay scattered across documents, folders, and memory. I wanted a tool that could reveal those connections, identify missing foundations, and turn ambitious goals into achievable next steps. That became PaperQuest.

## What it does

PaperQuest turns complex documents into connected learning paths. Users organize PDF and Markdown documents into projects, then explore maps of the concepts involved and the prerequisites needed to understand them.

A starting point could be a research paper with unfamiliar methods, a legal text with terminology to study, a complex project brief, personal notes, or coursework. The current prompts and prepared demo focus on technical and STEM material; broader document domains are part of the direction we want to develop further.

Within a project, users can explore prerequisite maps, open focused refreshers, test their understanding with quizzes, and save notes and progress. Shared concepts connect learning across projects. An interactive knowledge graph brings those relationships together, while career paths help users connect their learning with professional interests, resumes, and job descriptions.

Google sign-in connects users to their hosted workspaces. Approved developer accounts can share selected learning content through a read-only judge access key, so reviewers can explore the showcase without a Google account. A guided demo walks through the learning journey using *Attention Is All You Need* as one example.

## How we built it

We built the interface with **React and Vite**, supported by a **Node.js and Express** backend. **3d-force-graph and Three.js** power the interactive 3D knowledge graph, with **Canvas and SVG** supporting 2D maps and prerequisite views.

The document pipeline uses **PDF.js** to extract text from PDFs and also accepts Markdown. A provider-independent AI layer supports **Google Gemini, Anthropic Claude, OpenAI, and other compatible services**. It identifies concepts, proposes prerequisite relationships, and generates refreshers, quizzes, summaries, and career material. Server-side graph validation turns model output into usable learning structures. **React Markdown and KaTeX** render the resulting text and mathematical notation.

The application is deployed on **Vercel**, with **Snowflake Postgres** providing persistent storage through the PostgreSQL `pg` driver. Hosted workspace snapshots are compressed and encrypted with **AES-256-GCM**. Database connections use TLS with Snowflake's account-specific root certificate. Revision checks protect concurrent saves, and caching reduces repeated transfers of unchanged workspaces.

**Vercel Functions and `waitUntil`** run document and AI work after the initial response, while the interface checks job progress. **Google Identity Services and Google's authentication library** support account selection and server-side ID-token verification. Secure HTTP-only cookies maintain sessions, and server-side checks control developer access and judge sharing.

We used the **Node.js test runner and PGlite** to check authentication, workspace isolation, sharing, document processing, and PostgreSQL storage behavior. AI-assisted development helped us iterate on implementation, debugging, and deployment.

## Challenges we ran into

A central challenge was turning a document into a meaningful learning sequence. Identifying important terms is only part of the task: the map also needs to show how concepts depend on one another and where a learner can begin.

Documents vary in structure, formatting, terminology, and assumed background knowledge. Extracting readable text while handling equations and preserving useful context required careful work. Connecting concepts across projects added another challenge: recognizing shared knowledge while retaining each document's context and the user's progress.

Hosting introduced practical constraints around long-running requests, persistent storage, database transfer limits, and account recovery. Moving the production database to Snowflake Postgres required verified TLS, a dedicated application login, and a checked recovery backup. We also added caching to reduce repeated downloads of unchanged workspace data.

Finally, we needed a first experience that was easy to explore. The guided demo includes prepared learning content so users can try the core workflow before configuring an AI provider.

## Accomplishments that we're proud of

We built a working journey from an uploaded document to a concept map, focused refreshers, and a clearer next learning step. Users can move between individual document maps and a combined knowledge graph, then relate that learning to possible career directions.

We prepared and verified a recovery backup containing **nine original projects, 31 documents, and 27 saved lessons**, giving us a concrete collection for exploring connections across subjects.

The Snowflake deployment passed **53 automated tests**, followed by live checks for project persistence, workspace isolation, and Markdown and PDF uploads. The guided demo and read-only judge showcase make the experience easier to explore and demonstrate.

## What's next for PaperQuest

- **A source-grounded learning agent:** Build an agent harness that answers questions across documents, retrieves supporting passages, explains connections, and suggests next steps with citations.
- **Learning toward a chosen goal:** Let users define an outcome, such as understanding a topic, completing a course, or building a project, and create a manageable sequence of milestones.
- **Broader document support:** Improve handling of non-STEM material and add imports for slide decks, web resources, document collections, and learning-platform materials.
- **Adaptive learning plans:** Adjust recommendations based on demonstrated understanding, available time, and changing interests.
- **Evidence behind each skill:** Connect knowledge nodes to the documents, completed projects, and assessments that support them.
- **Collaborative learning spaces:** Help study groups, project teams, and mentors build and explore shared knowledge maps.
