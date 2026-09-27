// All LLM prompts live here.

const BASELINE = `The learner is a strong high-school student with competition-level mathematical
maturity — trained for math olympiads (regional level, not national). Assume ALREADY MASTERED and
never re-teach as its own node: algebra, functions & graphs, trigonometry, exponents & logarithms,
coordinate and Euclidean geometry, basic vectors, complex numbers, sequences & series, counting and
basic probability, single-variable limits and the basics of differentiation and integration,
mathematical induction, and rigorous proof-writing. Also high-school physics (Newtonian mechanics,
energy, waves, basic electricity & magnetism). This is a capable reader: calibrate difficulty to
someone who finds routine undergraduate math easy.`;

function truncateDoc(md, head = 45000, tail = 8000) {
  if (!md) return '';
  if (md.length <= head + tail) return md;
  return md.slice(0, head) + '\n\n[... middle of document truncated ...]\n\n' + md.slice(-tail);
}

const GRAPH_SCHEMA = `Return STRICT JSON only (no prose outside JSON), exactly this shape:
{
  "paper_title": "cleaned-up title of the paper",
  "field": "short field label, e.g. machine learning",
  "nodes": [
    {
      "id": "snake_case_canonical_id",
      "name": "Human-Readable Name",
      "level": 0,
      "core": false,
      "tier": "novice | intermediate | advanced",
      "branch": "branch of math/science this tool belongs to, e.g. linear algebra, calculus, probability & statistics, optimization, information theory, discrete math, quantum mechanics, computer science",
      "blurb": "1-2 plain sentences: what this concept is, in general. Write any math as KaTeX inside $...$ (e.g. $Q = XW_Q$, $\\\\sqrt{d_k}$) — never bare symbols or \\\\(..\\\\).",
      "used_in_paper": "2-3 specific sentences: HOW and WHERE this paper uses this concept/tool — which method, equation, definition, proof or section relies on it. Math as KaTeX inside $...$.",
      "prereqs": ["id_of_prerequisite"]
    }
  ]
}

EVERY node object MUST include ALL of these keys, non-empty (never omit a key, never leave it blank):
- "branch": always required — the field the tool comes from.
- "tier": always required on learnable nodes — one of "novice", "intermediate", "advanced".
- "prereqs": required on EVERY learnable node — a non-empty array of 1-4 ids that exist in this same "nodes" list. Baseline nodes (level 0) use "prereqs": [].
- "used_in_paper": required on EVERY node — grounded in the actual paper text.
A node missing "prereqs", "branch" or "used_in_paper" is INVALID output.`;

const GRAPH_EXAMPLE = `EXAMPLE of the required shape and level of detail (for a different paper about the Transformer — imitate this structure, do NOT reuse its content):
{
  "paper_title": "Attention Is All You Need",
  "field": "machine learning",
  "nodes": [
    { "id": "vectors", "name": "Vectors", "level": 0, "core": false, "branch": "linear algebra",
      "blurb": "Ordered lists of numbers you can add and scale.", "used_in_paper": "Every token is represented as an embedding vector fed into the model.", "prereqs": [] },
    { "id": "matrix_multiplication", "name": "Matrix Multiplication", "level": 1, "core": false, "tier": "novice", "branch": "linear algebra",
      "blurb": "Combining matrices to transform vectors.", "used_in_paper": "The query, key and value projections Q=XW_Q, K=XW_K, V=XW_V are matrix multiplications (Section 3.2).", "prereqs": ["vectors"] },
    { "id": "softmax", "name": "Softmax", "level": 1, "core": false, "tier": "novice", "branch": "probability & statistics",
      "blurb": "Turns a vector of scores into a probability distribution.", "used_in_paper": "Attention weights are softmax(QK^T/sqrt(d_k)) in Eq. 1.", "prereqs": ["exponents_and_logarithms"] },
    { "id": "scaled_dot_product_attention", "name": "Scaled Dot-Product Attention", "level": 1, "core": true, "tier": "advanced", "branch": "machine learning",
      "blurb": "A mechanism that weighs values by the similarity of queries and keys.", "used_in_paper": "The paper's central mechanism, defined in Eq. 1 and Section 3.2.1.", "prereqs": ["matrix_multiplication", "softmax"] }
  ]
}`;

const GRAPH_RULES = `How to think about the graph:
First identify the mathematical TOOLS and concepts the paper actually uses (in its definitions, equations, methods and proofs) and which BRANCH of mathematics/science each tool comes from. Then, using your knowledge of how branches of mathematics interrelate, arrange them as a prerequisite network/hierarchy: edges express how a tool builds on simpler tools (e.g. optimization builds on calculus; attention scores build on linear algebra and probability). The result is a layered map: high-school baseline at the bottom, the paper's core idea at the top, and a chain of prerequisites connecting them.

Rules for the graph:
- "level": 0 marks BASELINE nodes: pick 3-6 high-school topics (from the baseline above) that this tree actually grows from. They are assumed known and have "prereqs": []. Everything else uses "level": 1.
- Add 12-22 learnable (level 1) nodes: the concepts someone must learn, in prerequisite order, to genuinely understand the paper's core ideas.
- Mark 1-3 nodes with "core": true — the paper's own central concept(s)/contribution. These sit at the top of the tree and must themselves list prereqs.
- CRITICAL — build a real hierarchy, not a flat list: every learnable node MUST list 1-4 "prereqs" by id. Simpler learnable concepts point down to baseline ids; more advanced concepts point to the intermediate learnable ids they build on; core nodes point to the most advanced learnable ids. The graph must be a connected DAG (no cycles) where every learnable node is reachable from a baseline node, and it should be several layers deep — NOT every node hanging directly off the baseline.
- Assign each learnable node a "tier" calibrated to the competition-trained high-schooler above:
  • "novice" — a tool a strong student absorbs in one sitting; standard early-undergraduate material. Matrix multiplication, dot products, basic gradients, the softmax, elementary probability → ALWAYS novice, never intermediate.
  • "intermediate" — solid undergraduate depth: eigen-decomposition, multivariable Taylor expansion, convex functions, vector/matrix norms.
  • "advanced" — graduate or specialized machinery the paper leans on: the spectral theorem applied to operators, Lipschitz-smoothness bounds, quantum observables, measure-theoretic or proof-heavy results. Core nodes are "advanced".
  Err toward "novice" whenever a bright undergraduate would find it routine.
- "id" must be a canonical, universally-standard snake_case name for the concept (e.g. "linear_algebra", "gradient_descent", "fourier_transform") — NOT paper-specific phrasing — so the same concept matches across different papers. Only core nodes may have paper-specific ids.
- Each node must be a learnable chunk (one focused lesson), not an entire field.
- Blurbs must NOT summarize the paper; they say what the concept is in general. "used_in_paper" is where paper-specific detail goes — ground it in the actual text (name the method/equation/section that uses the tool).
- Prefer widely-taught, standard concepts for everything below the core.`;

function conceptExtractionMessages(paperMd, paperName) {
  return [
    {
      role: 'system',
      content: `You are an expert curriculum designer. You build prerequisite skill trees ("what must I learn, in what order?") that take a learner from a high-school baseline up to understanding a specific research paper. You respond with strict JSON.`
    },
    {
      role: 'user',
      content: `${BASELINE}

TASK: Read the paper below. Identify the concept skill tree a learner needs in order to understand it.

${GRAPH_RULES}

${GRAPH_SCHEMA}

${GRAPH_EXAMPLE}

PAPER (${paperName}) — converted from PDF, may contain extraction noise:
"""
${truncateDoc(paperMd)}
"""`
    }
  ];
}

function conceptMergeMessages(existingNodes, paperMd, paperName) {
  const existing = existingNodes.map((n) => ({
    id: n.id,
    name: n.name,
    level: n.level,
    core: !!n.core,
    branch: n.branch || '',
    blurb: n.blurb,
    prereqs: n.prereqs
  }));
  return [
    {
      role: 'system',
      content: `You are an expert curriculum designer maintaining a prerequisite skill tree for a project that contains several papers. You extend existing trees without breaking them. You respond with strict JSON.`
    },
    {
      role: 'user',
      content: `${BASELINE}

The project already has this concept graph:
${JSON.stringify(existing, null, 1)}

TASK: A new paper is being added to the project (below). Return the FULL MERGED graph:
- KEEP every existing node with its exact "id" (you may improve a blurb, add prereq edges, or add "core": true where appropriate).
- REUSE existing ids whenever the new paper needs the same concept — never rename or duplicate a concept under a new id.
- ADD at most 15 new nodes for concepts the new paper needs that are missing.
- On every node (existing or new) that the NEW paper needs, set "for_new_paper": true AND provide "used_in_paper" describing how the NEW paper uses it.

${GRAPH_RULES}

${GRAPH_SCHEMA}
(each node may additionally carry "for_new_paper": true/false)

${GRAPH_EXAMPLE}

NEW PAPER (${paperName}):
"""
${truncateDoc(paperMd, 40000, 6000)}
"""`
    }
  ];
}

function lessonMessages({ node, masteredNames, paperTitles, field, usageText }) {
  const isCore = !!node.core;
  const papers = paperTitles.length ? paperTitles.map((t) => `"${t}"`).join(', ') : 'the papers in this project';
  const mastered = masteredNames.length ? masteredNames.join('; ') : '(only the high-school baseline so far)';
  const usageNote = usageText ? `\nHow the paper(s) use this concept: ${usageText}` : '';

  const coreExtra = isCore
    ? `
This is a CORE node — the paper's own central concept. Write a SYNTHESIS lesson:
explain the paper's concept itself, explicitly weaving in the mastered concepts (name them where they slot in),
and end with a section "## You're ready to read the paper" that maps the typical sections of ${papers} to the concepts the learner now has.`
    : '';

  return [
    {
      role: 'system',
      content: `You are a brilliant, warm teacher. You teach exactly one concept at a time, building only on what the learner already knows. You respond with strict JSON.`
    },
    {
      role: 'user',
      content: `${BASELINE}

Additionally, the learner has ALREADY MASTERED: ${mastered}

TEACH THIS CONCEPT: "${node.name}"${node.branch ? ` (branch: ${node.branch})` : ''} — ${node.blurb}
Context: this is one node in a skill tree whose goal is understanding ${papers}${field ? ` (field: ${field})` : ''}.${usageNote}${coreExtra}

Requirements for the lesson (markdown string):
- 500-900 words. Use "##" section headings.
- Structure: a hook (why this matters on the road to the paper) → core intuition (analogy welcome) → one small worked example → a common misconception → "## What this unlocks" recap (2-3 bullets).
- Build ONLY on the baseline + mastered concepts listed above. Do not assume anything else.
- Math is rendered with KaTeX: use $...$ for inline and $$...$$ for display math.
- Do NOT summarize the paper; teach the concept.

Requirements for the quiz:
- ${isCore ? 5 : 4} multiple-choice questions testing understanding (not trivia), each with exactly 4 options and one correct answer.
- Make distractors plausible; "why" explains the correct answer in 1-2 sentences.

Return STRICT JSON only:
{
  "lesson": "markdown string",
  "quiz": [
    { "q": "question text", "options": ["A", "B", "C", "D"], "answer": 0, "why": "explanation" }
  ]
}`
    }
  ];
}

// ---------------- career path ----------------
// A career map lists the TOOLS and SKILLS job postings ask for (Python, PyTorch,
// Docker, SQL, A/B testing…), never school courses. Each tool links back to the
// learner's knowledge-graph concepts it puts to work ("concepts").

const CAREER_SCHEMA = `Return STRICT JSON only (no prose outside JSON), exactly this shape:
{
  "career_title": "the standard job title for this role",
  "field": "short field label, e.g. machine learning engineering",
  "nodes": [
    {
      "id": "snake_case_canonical_id",
      "name": "Tool or Skill Name",
      "level": 0,
      "core": false,
      "tier": "novice | intermediate | advanced",
      "branch": "category, e.g. languages & tools, ML frameworks, data, MLOps & cloud, software engineering, analysis, domain skills",
      "importance": "critical | important | optional",
      "blurb": "1-2 plain sentences: what this tool or skill is and what it lets you do.",
      "used_in_role": "1-2 specific sentences: how people in this role use it day to day.",
      "concepts": ["knowledge_graph_concept_id"],
      "prereqs": ["id_of_prerequisite_skill"]
    }
  ]
}

EVERY node object MUST include ALL of these keys (never omit a key):
- "branch", "importance" and "used_in_role": always required, non-empty.
- "tier": required on learnable nodes — one of "novice", "intermediate", "advanced".
- "prereqs": required on EVERY learnable node — a non-empty array of 1-4 ids that exist in this same "nodes" list. Foundation nodes (level 0) use "prereqs": [].
- "concepts": always present; [] when no knowledge-graph concept applies.`;

const CAREER_RULES = `What belongs in the map:
List the concrete TOOLS and SKILLS that most job postings for this role ask for, as they appear under "Requirements" and "Nice to have": programming languages, frameworks and libraries, platforms and cloud services, databases and data tools, and named practices (e.g. "Python", "PyTorch", "Docker", "SQL", "AWS SageMaker", "A/B testing", "CI/CD", "REST APIs"). Group tools that postings list together into one node (e.g. "NumPy & pandas", "Experiment tracking (MLflow, W&B)").
NOT courses or school subjects: never make nodes like "Linear Algebra", "Calculus", "Statistics", "Intro to Machine Learning" or "Data Structures". Theory goes in "concepts", not in nodes.
Arrange the tools as a prerequisite network: an edge means "learn this first" (PyTorch builds on NumPy & pandas; Kubernetes builds on Docker; model serving builds on Python and Docker).

Rules:
- "level": 0 marks 2-4 FOUNDATION tools everything grows from (e.g. Python, Git, SQL, Linux). Everything else uses "level": 1.
- Add 14-22 learnable (level 1) tools and skills that MOST postings for this role require. No encyclopedia.
- Mark 1-3 nodes "core": true: the role-defining capabilities (e.g. "Deploy & monitor models" for an ML engineer). They sit at the top and must list prereqs.
- CRITICAL: build a real hierarchy, not a flat list. Every learnable node MUST list 1-4 "prereqs" by id, and the graph must be a connected DAG several layers deep.
- "importance": "critical" = in most postings for this role; "important" = common; "optional" = nice to have or a specialization.
- "tier" is difficulty for a strong STEM student: "novice" = usable within days, "intermediate" = weeks of practice, "advanced" = months or real project experience.
- "id" must be the canonical snake_case name of the tool or skill (e.g. "python", "pytorch", "docker", "sql", "kubernetes") so it matches across careers, resumes and job descriptions.
- "concepts": ids from the learner's KNOWLEDGE GRAPH (listed below, when present) that this tool puts to work, e.g. PyTorch uses ["backpropagation", "gradient_descent"]. Use only ids from that list.`;

// The learner's knowledge graph (concepts from their projects), for prompts.
function knowledgeBlock(knowledge) {
  const list = (knowledge || []).slice(0, 150);
  if (!list.length) return 'THE LEARNER\'S KNOWLEDGE GRAPH: empty so far (use "concepts": [] everywhere).';
  return 'THE LEARNER\'S KNOWLEDGE GRAPH (concepts studied in PaperQuest: id — name — state):\n' +
    list.map((k) => `- ${k.id} — ${k.name} — ${k.state || 'studying'}`).join('\n');
}

function careerSkillsMessages(careerName, { interest = '', knowledge = [] } = {}) {
  return [
    {
      role: 'system',
      content: 'You are a veteran technical hiring manager. You know exactly which tools and skills job postings for each role require, and in what order people learn them. You respond with strict JSON.'
    },
    {
      role: 'user',
      content: `TASK: Build the career map for the role below: the tools and skills most job postings for it require, from foundation tools up to the role's defining capabilities.

${careerName ? `CAREER: "${careerName}"` : 'CAREER: not chosen yet. Pick the one standard job title that best fits the learner\'s interest and knowledge graph, return it as "career_title", and map that role.'}
${interest ? `THE LEARNER'S INTEREST (tailor specialisations and optional nodes to it): "${interest}"` : ''}

${CAREER_RULES}

${knowledgeBlock(knowledge)}

${CAREER_SCHEMA}`
    }
  ];
}

function careerJdMergeMessages(existingSkills, jdMd, jdName, { knowledge = [] } = {}) {
  const existing = (existingSkills || []).map((n) => ({
    id: n.id, name: n.name, level: n.level, core: !!n.core,
    branch: n.branch || '', importance: n.importance || 'important', prereqs: n.prereqs
  }));
  const hasExisting = existing.length > 0;
  return [
    {
      role: 'system',
      content: 'You are a veteran technical hiring manager maintaining a career map of tools and skills. You extend existing maps without breaking them. You respond with strict JSON.'
    },
    {
      role: 'user',
      content: `${hasExisting ? `The career already has this map:
${JSON.stringify(existing, null, 1)}

TASK: A job description is being added (below). Return the FULL MERGED map:
- KEEP every existing node with its exact "id" (you may raise "importance" if the JD demands it, add prereq edges, or improve a blurb).
- REUSE existing ids whenever the JD asks for the same tool or skill. Never duplicate one under a new id.
- ADD at most 12 new nodes for tools or skills this JD requires that are missing.
- On nodes this JD explicitly requires, ground "used_in_role" in the JD's wording.` : `TASK: Build the career map for the role in the job description below: the tools and skills it requires, from foundation tools up to the role's defining capabilities.`}

Also return, at the top level next to "nodes", "jd_skill_ids": the ids of EVERY node this job description asks for (required or nice to have), existing or new.

${CAREER_RULES}

${knowledgeBlock(knowledge)}

${CAREER_SCHEMA}

JOB DESCRIPTION (${jdName}):
"""
${truncateDoc(jdMd, 25000, 4000)}
"""`
    }
  ];
}

// Suggest roles from what the learner has studied (and an optional interest).
function careerSuggestMessages({ knowledge = [], interest = '' } = {}) {
  return [
    {
      role: 'system',
      content: 'You are a career advisor for students in technical fields. You match what someone has studied to real, commonly posted job titles. You respond with strict JSON.'
    },
    {
      role: 'user',
      content: `TASK: Suggest 5 career roles that fit this learner.
- Use real job titles that appear in postings (e.g. "Machine Learning Engineer", "Data Scientist", "Quantitative Researcher", "Robotics Software Engineer").
- Base the fit on the knowledge graph: which studied concepts the role actually uses.
- ${interest ? `The learner's interest is "${interest}". At least 3 suggestions must match it.` : 'No interest was given; rely on the knowledge graph.'}

Return STRICT JSON only:
{ "suggestions": [ { "title": "Job title", "why": "one sentence naming 2-3 of the learner's concepts the role uses", "matched_concepts": ["concept_id"], "starter_tools": ["Tool", "Tool", "Tool"] } ] }

${knowledgeBlock(knowledge)}`
    }
  ];
}

// ---------------- project kinds, summaries, cheatsheets ----------------

// Tells the analysis prompt what kind of material a non-paper project holds.
const KIND_NOTES = {
  class: 'This project is a CLASS the learner is taking. The uploaded files are course material (lecture notes, slides, problem sets, a syllabus). Map what a student must know to follow the class; the "core" nodes are the main topics it teaches. Wherever the instructions say "paper", read "this course material".',
  course: 'This project is a COURSE (for example an online course or a textbook). The uploaded files are its material. Map the prerequisites up to the course\'s main topics, which are the "core" nodes. Wherever the instructions say "paper", read "this course material".',
  club: 'This project is a CLUB or team activity. The uploaded files are club material (meeting notes, guides, competition rules, reading lists). Map the concepts a member needs; the "core" nodes are what the club works on. Wherever the instructions say "paper", read "this club material".',
  hackathon: 'This project is a HACKATHON. The uploaded files describe the challenge, the tools or APIs, and the team\'s notes. Map the concepts and techniques the team needs to build it; the "core" nodes are the project\'s key technical pieces. Wherever the instructions say "paper", read "this hackathon material".',
  notes: 'This project holds the learner\'s own NOTES. Map the concepts the notes cover and what is needed to understand them; the "core" nodes are the notes\' main ideas. Wherever the instructions say "paper", read "these notes".'
};
function projectKindNote(kind) {
  return KIND_NOTES[kind] || '';
}

function paperSummaryMessages(md, name, kind) {
  const what = !kind || kind === 'paper' ? 'paper' : 'material';
  return [
    {
      role: 'system',
      content: 'You are a precise research explainer. You summarise documents faithfully, in your own words, for a strong student. You respond with strict JSON.'
    },
    {
      role: 'user',
      content: `TASK: Summarise the ${what} below for a learner.

Return STRICT JSON only: { "title": "cleaned-up title", "summary_md": "markdown" }

"summary_md" uses exactly these sections, each short:
## TL;DR (2 sentences)
## Key ideas (3-6 bullets with bold lead words)
## How it works (one paragraph on the method, mechanism or main argument)
## Results (the main findings, claims or takeaways, with any numbers the text gives)
## Why it matters (1-2 sentences)
Rules: write in your own words and never copy sentences from the text; state only what the text supports; use $...$ for inline math and $$...$$ for display math; no preamble.

DOCUMENT (${name}), converted from PDF, may contain extraction noise:
"""
${truncateDoc(md, 40000, 6000)}
"""`
    }
  ];
}

function cheatsheetMessages({ name, kind, field, nodes, lessonText }) {
  const concepts = (nodes || []).filter((n) => n.level !== 0).map((n) => ({
    name: n.name, core: !!n.core, branch: n.branch || '', blurb: n.blurb || '',
    used: String(Object.values(n.usage || {})[0] || '').slice(0, 300)
  }));
  return [
    {
      role: 'system',
      content: 'You write one-page study cheatsheets: dense, accurate and easy to scan. You respond with strict JSON.'
    },
    {
      role: 'user',
      content: `TASK: Write a one-page cheatsheet for the ${kind && kind !== 'paper' ? kind : 'paper'} project "${name}"${field ? ` (field: ${field})` : ''}, covering the concept map below.

Return STRICT JSON only: { "cheatsheet_md": "markdown" }

"cheatsheet_md" has these sections:
## Core formulas (a markdown table "| Idea | Formula |" with the 5-10 most important formulas, math in $...$; if the topic has no formulas, call the section "## Key rules" and list rules instead)
## Key definitions (one line each for the most important concepts)
## Build-up path (the concepts in learning order with arrows, ending at the core)
## Remember (3-6 bullets: common pitfalls and the reason behind each)
Stay under about 450 words. Use only standard, correct facts.

CONCEPT MAP:
${JSON.stringify(concepts, null, 1)}
${lessonText ? `\nSAVED LESSON EXCERPTS:\n${lessonText}` : ''}`
    }
  ];
}

function resumeSkillsMessages(resumeMd) {
  return [
    {
      role: 'system',
      content: `You are a precise resume parser. You extract the skills a resume actually evidences. You respond with strict JSON.`
    },
    {
      role: 'user',
      content: `TASK: Read the resume below and list every skill it EVIDENCES — programming languages, tools, frameworks, methods, theory, and domain knowledge. Include a skill only if the resume shows real exposure (used in a job, project, degree or certification), not aspiration. Use canonical, widely-understood names (e.g. "Python", "Linear Algebra", "Docker", "Machine Learning Fundamentals").

Return STRICT JSON only:
{ "skills": ["Skill Name", "..."] }

RESUME — converted from PDF, may contain extraction noise:
"""
${truncateDoc(resumeMd, 20000, 3000)}
"""`
    }
  ];
}

// ---------------- lesson Q&A ----------------

// Follow-up questions asked from inside an open refresher. `chat` is the stored
// thread (oldest first); prior turns are replayed as real assistant messages so a
// reasoning provider can carry its `reasoning_details` forward (see llm.js).
// mode 'source' asks for provenance instead of an explanation.
function lessonAskMessages({ node, lesson, chat, question, mode, paperTitles, field }) {
  const papers = (paperTitles || []).length ? paperTitles.map((t) => `"${t}"`).join(', ') : 'the papers in this project';
  const sourceMode = mode === 'source';

  const messages = [
    {
      role: 'system',
      content: `You are the same warm, precise teacher who wrote the refresher below. You answer follow-up questions about it for a learner whose baseline is a strong high-school student. You respond with strict JSON.`
    },
    {
      role: 'user',
      content: `${BASELINE}

CONCEPT: "${node.name}"${node.branch ? ` (branch: ${node.branch})` : ''} — ${node.blurb || ''}
This concept is a step toward understanding ${papers}${field ? ` (field: ${field})` : ''}.

THE REFRESHER THE LEARNER IS READING:
"""
${String(lesson || '').slice(0, 9000)}
"""

Answer the learner's follow-up questions about this refresher. Reply to each with STRICT JSON only:
{
  "question": "the learner's question, paraphrased into one clear, self-contained sentence",
  "answer": "markdown answer",
  "sources": ["Author, \\"Title\\" (year) — what to look at, and why"]
}

Rules for every answer:
- "question" restates what they asked in your own words — specific, one sentence, no preamble. If their question is vague, paraphrase it into the sharpest reading of what they likely meant.
- "answer": 80-250 words of markdown, building only on the baseline and this refresher. Use "##" headings only if the answer really needs two parts. Math is KaTeX: $...$ inline, $...$ display.
- "sources": textbooks, canonical papers, lecture notes. Cite only real, well-known works you are confident exist; never invent a title, author or DOI. Say so in the answer if you are unsure. Use [] when a source adds nothing.
- If the question is off-topic, answer briefly and steer back to the concept.`
    },
    {
      role: 'assistant',
      content: '{"question":"Ready — what would you like to ask about this refresher?","answer":"Ask away.","sources":[]}'
    }
  ];

  for (const turn of chat || []) {
    messages.push({ role: 'user', content: turn.raw || turn.question || '' });
    messages.push({
      role: 'assistant',
      content: JSON.stringify({ question: turn.question || '', answer: turn.answer || '', sources: turn.sources || [] }),
      ...(turn.reasoningDetails ? { reasoning_details: turn.reasoningDetails } : {})
    });
  }

  messages.push({
    role: 'user',
    content: sourceMode
      ? `Where does this come from? Give the sources a learner should read to verify and go deeper${question ? `, focused on: ${question}` : ' for this concept as taught above'}. Fill "sources" with 2-4 real, canonical works and use "answer" to say what each one covers and in what order to read them.`
      : String(question)
  });

  return messages;
}

module.exports = {
  conceptExtractionMessages, conceptMergeMessages, lessonMessages, lessonAskMessages, truncateDoc, BASELINE,
  careerSkillsMessages, careerJdMergeMessages, careerSuggestMessages, resumeSkillsMessages,
  projectKindNote, paperSummaryMessages, cheatsheetMessages
};
