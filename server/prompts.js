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

const CAREER_SCHEMA = `Return STRICT JSON only (no prose outside JSON), exactly this shape:
{
  "career_title": "cleaned-up name of the career/role",
  "field": "short field label, e.g. machine learning engineering",
  "nodes": [
    {
      "id": "snake_case_canonical_id",
      "name": "Human-Readable Skill Name",
      "level": 0,
      "core": false,
      "tier": "novice | intermediate | advanced",
      "branch": "skill category, e.g. programming, machine learning, math & statistics, data engineering, infrastructure & mlops, software engineering, soft skills",
      "importance": "critical | important | optional",
      "blurb": "1-2 plain sentences: what this skill is and what it lets you do.",
      "used_in_role": "1-2 specific sentences: how this skill is actually used day-to-day in this role.",
      "prereqs": ["id_of_prerequisite_skill"]
    }
  ]
}

EVERY node object MUST include ALL of these keys, non-empty (never omit a key):
- "branch" and "importance": always required.
- "tier": required on learnable nodes — one of "novice", "intermediate", "advanced".
- "prereqs": required on EVERY learnable node — a non-empty array of 1-4 ids that exist in this same "nodes" list. Foundation nodes (level 0) use "prereqs": [].
- "used_in_role": required on every node.`;

const CAREER_RULES = `How to think about the skills graph:
Identify the skills someone must have to work in this role — technical tools, methods, theory, and the small number of soft skills that genuinely gate the job. Arrange them as a prerequisite network: edges express how a skill builds on simpler skills (e.g. deep learning builds on machine-learning fundamentals and linear algebra; model deployment builds on programming and cloud basics).

Rules:
- "level": 0 marks 2-4 FOUNDATION skills the graph grows from (e.g. programming basics, high-school math). Everything else uses "level": 1.
- Add 14-22 learnable (level 1) skills covering the realistic core of the role — not an exhaustive encyclopedia.
- Mark 1-3 nodes "core": true — the defining skills of this role. They sit at the top and must list prereqs.
- CRITICAL — build a real hierarchy, not a flat list: every learnable skill MUST list 1-4 "prereqs" by id; the graph must be a connected DAG several layers deep.
- "importance": "critical" = you will not get hired without it; "important" = expected of a solid candidate; "optional" = nice-to-have or specialization.
- "tier" is difficulty for a strong STEM student: "novice" = absorbable in days, "intermediate" = solid undergraduate depth, "advanced" = specialized/graduate machinery.
- "id" must be a canonical snake_case name for the skill (e.g. "linear_algebra", "model_deployment", "sql") so the same skill matches across careers and papers — this exact naming is used to detect what the user already knows.
- Each node is one learnable skill (one course-module of effort), not an entire discipline.`;

function careerSkillsMessages(careerName) {
  return [
    {
      role: 'system',
      content: `You are a veteran hiring manager and curriculum designer. You map the prerequisite skill graphs behind technical careers ("what must I learn, in what order, to do this job?"). You respond with strict JSON.`
    },
    {
      role: 'user',
      content: `TASK: Build the prerequisite skills graph for the career below — the important skills required in this field, from foundations up to the role's defining skills.

CAREER: "${careerName}"

${CAREER_RULES}

${CAREER_SCHEMA}`
    }
  ];
}

function careerJdMergeMessages(existingSkills, jdMd, jdName) {
  const existing = (existingSkills || []).map((n) => ({
    id: n.id, name: n.name, level: n.level, core: !!n.core,
    branch: n.branch || '', importance: n.importance || 'important', prereqs: n.prereqs
  }));
  const hasExisting = existing.length > 0;
  return [
    {
      role: 'system',
      content: `You are a veteran hiring manager maintaining a career skills graph. You extend existing graphs without breaking them. You respond with strict JSON.`
    },
    {
      role: 'user',
      content: `${hasExisting ? `The career already has this skills graph:
${JSON.stringify(existing, null, 1)}

TASK: A job description is being added (below). Return the FULL MERGED graph:
- KEEP every existing node with its exact "id" (you may adjust "importance" up if the JD demands it, add prereq edges, or improve a blurb).
- REUSE existing ids whenever the JD needs the same skill — never duplicate a skill under a new id.
- ADD at most 12 new nodes for skills this JD requires that are missing.
- On nodes this JD explicitly requires, ground "used_in_role" in the JD's actual wording.` : `TASK: Build the prerequisite skills graph for the role in the job description below — the skills required, from foundations up to the role's defining skills.`}

${CAREER_RULES}

${CAREER_SCHEMA}

JOB DESCRIPTION (${jdName}):
"""
${truncateDoc(jdMd, 25000, 4000)}
"""`
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

module.exports = { conceptExtractionMessages, conceptMergeMessages, lessonMessages, lessonAskMessages, truncateDoc, BASELINE, careerSkillsMessages, careerJdMergeMessages, resumeSkillsMessages };
