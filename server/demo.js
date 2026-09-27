// Demo project: a hand-built skill tree for the Transformer paper, plus one prebaked
// lesson so the whole loop can be experienced without an API key.

const DEMO_NODES = [
  // baseline
  { id: 'algebra_functions', name: 'Algebra & Functions', level: 0, core: false, branch: 'algebra', blurb: 'Manipulating expressions, functions and their graphs — the language everything below is written in.', prereqs: [] },
  { id: 'vectors_basics', name: 'Vectors (intro)', level: 0, core: false, branch: 'linear algebra', blurb: 'Arrows with magnitude and direction; adding and scaling them.', prereqs: [] },
  { id: 'probability_basics', name: 'Basic Probability', level: 0, core: false, branch: 'probability & statistics', blurb: 'Chances between 0 and 1 that sum to 1 over all outcomes.', prereqs: [] },
  { id: 'trigonometry', name: 'Trigonometry', level: 0, core: false, branch: 'trigonometry', blurb: 'Sine and cosine waves — later reused to encode word positions.', prereqs: [] },
  // learnable
  { id: 'linear_algebra', name: 'Matrices & Matrix Multiplication', level: 1, core: false, branch: 'linear algebra', blurb: 'Organizing numbers into grids and combining them — the single most-used operation in deep learning.', used_in_paper: 'Every projection in the model is a matrix multiplication: the queries, keys and values are computed as Q = XW_Q, K = XW_K, V = XW_V (Section 3.2.1), and the attention formula itself is built from the matrix product QK^T.', prereqs: ['vectors_basics', 'algebra_functions'] },
  { id: 'derivatives_gradients', name: 'Derivatives & Gradients', level: 1, core: false, branch: 'calculus', blurb: 'How fast a function changes, and in which direction it increases fastest — needed to train anything.', used_in_paper: 'The entire model is trained by following gradients of the loss; the scaling factor 1/√d_k in attention (Section 3.2.1) exists specifically to keep softmax gradients from vanishing.', prereqs: ['algebra_functions'] },
  { id: 'probability_distributions', name: 'Probability Distributions', level: 1, core: false, branch: 'probability & statistics', blurb: 'Assigning probabilities over many options at once, e.g. over every word in a vocabulary.', used_in_paper: 'The decoder output is a probability distribution over the vocabulary, and attention weights themselves form a distribution over positions in the sequence.', prereqs: ['probability_basics'] },
  { id: 'dot_product_similarity', name: 'Dot Product as Similarity', level: 1, core: false, branch: 'linear algebra', blurb: 'One multiplication that measures how aligned two vectors are — the heart of attention scores.', used_in_paper: 'The paper names its mechanism "Scaled Dot-Product Attention": relevance between a query and a key is literally their dot product q·k, computed for all pairs at once as QK^T.', prereqs: ['linear_algebra'] },
  { id: 'gradient_descent', name: 'Gradient Descent', level: 1, core: false, branch: 'optimization', blurb: 'Repeatedly nudging parameters downhill on a loss surface to make a model better.', used_in_paper: 'Training (Section 5.3) uses the Adam optimizer — a refined gradient descent — with a custom learning-rate warmup schedule over 100k+ steps.', prereqs: ['derivatives_gradients'] },
  { id: 'softmax_function', name: 'Softmax', level: 1, core: false, branch: 'probability & statistics', blurb: 'Turning any list of scores into a clean probability distribution — used for attention weights and output words.', used_in_paper: 'Attention(Q,K,V) = softmax(QK^T/√d_k)V — softmax converts raw dot-product scores into the attention weights that mix the values; it also produces the final word probabilities.', prereqs: ['probability_distributions', 'algebra_functions'] },
  { id: 'neural_networks_basics', name: 'Neural Networks', level: 1, core: false, branch: 'machine learning', blurb: 'Stacks of matrix multiplications and simple nonlinearities that can approximate complex functions.', used_in_paper: 'Each encoder/decoder layer contains a position-wise feed-forward network FFN(x) = max(0, xW₁+b₁)W₂+b₂ (Section 3.3) applied identically at every position.', prereqs: ['linear_algebra', 'gradient_descent'] },
  { id: 'backpropagation', name: 'Backpropagation', level: 1, core: false, branch: 'machine learning', blurb: 'The chain rule, organized: how networks compute gradients through many layers.', used_in_paper: 'Residual connections around every sub-layer (Section 3.1) exist to keep backpropagated gradients healthy through the 6-layer stacks; the whole architecture is shaped by trainability.', prereqs: ['neural_networks_basics', 'derivatives_gradients'] },
  { id: 'word_embeddings', name: 'Word Embeddings', level: 1, core: false, branch: 'machine learning', blurb: 'Representing words as vectors so that similar words point in similar directions.', used_in_paper: 'Input and output tokens are mapped to d_model=512 dimensional vectors by learned embeddings (Section 3.4), shared with the pre-softmax projection.', prereqs: ['dot_product_similarity', 'neural_networks_basics'] },
  { id: 'sequence_modeling', name: 'Sequence Modeling', level: 1, core: false, branch: 'machine learning', blurb: 'The task of predicting/transforming ordered data (like sentences), and why order makes it hard.', used_in_paper: 'The paper\'s task is sequence transduction (machine translation, WMT 2014); its whole point is doing this without the recurrent networks that previously dominated the task.', prereqs: ['neural_networks_basics'] },
  { id: 'attention_mechanism', name: 'Attention', level: 1, core: false, branch: 'machine learning', blurb: 'Letting a model look back over all inputs and weight them by relevance, computed with dot products and softmax.', used_in_paper: 'Attention is the paper\'s only sequence-mixing operation — used encoder-side, decoder-side (masked), and between encoder and decoder (Section 3.2.3).', prereqs: ['dot_product_similarity', 'softmax_function', 'word_embeddings'] },
  { id: 'positional_encoding', name: 'Positional Encoding', level: 1, core: false, branch: 'trigonometry', blurb: 'Sine/cosine patterns added to embeddings so a model without recurrence still knows word order.', used_in_paper: 'PE(pos,2i) = sin(pos/10000^(2i/d)) and cos for odd dims (Section 3.5): sinusoids of different frequencies are added to embeddings so the order-blind attention can still use position.', prereqs: ['trigonometry', 'sequence_modeling'] },
  { id: 'self_attention', name: 'Self-Attention & Multi-Head', level: 1, core: false, branch: 'machine learning', blurb: 'A sequence attending to itself with queries, keys and values — in several parallel "heads".', used_in_paper: 'Section 3.2.2: 8 parallel heads, each projecting to d_k=64, attend to different relationship types simultaneously; their outputs are concatenated and re-projected.', prereqs: ['attention_mechanism'] },
  { id: 'transformer_architecture', name: 'The Transformer', level: 1, core: true, branch: 'machine learning', blurb: 'The paper\'s contribution: an architecture built purely from self-attention, positional encodings and feed-forward layers — no recurrence.', used_in_paper: 'This IS the paper: 6 encoder + 6 decoder layers of multi-head attention + feed-forward blocks, trained on WMT 2014, reaching state-of-the-art BLEU at a fraction of the training cost.', prereqs: ['self_attention', 'positional_encoding', 'backpropagation'] }
];

// The real paper. arXiv's licence lets arXiv distribute it, not us, so the reader
// embeds the official PDF from arxiv.org and the project stores PaperQuest's own
// study guide (below) as the paper's text.
const DEMO_PAPER = {
  title: 'Attention Is All You Need',
  authors: 'Vaswani, Shazeer, Parmar, Uszkoreit, Jones, Gomez, Kaiser & Polosukhin · NeurIPS 2017',
  pages: 15,
  pdfUrl: 'https://arxiv.org/pdf/1706.03762v7',
  sourceUrl: 'https://arxiv.org/abs/1706.03762'
};

const DEMO_PAPER_MD = String.raw`# Attention Is All You Need — study guide

*Vaswani, Shazeer, Parmar, Uszkoreit, Jones, Gomez, Kaiser & Polosukhin · NeurIPS 2017 · [arXiv:1706.03762](https://arxiv.org/abs/1706.03762)*

> PaperQuest demo. **Read** opens the original paper from arXiv; this page is PaperQuest's own study guide to it, the text the map, summary and cheatsheet were built from.

## 1. The problem
Machine translation turns one sequence (a sentence) into another. In 2017 the strongest systems were recurrent networks (RNNs and LSTMs). They read a sentence one token at a time and carry a hidden state forward, which costs two things:
- **No parallelism inside a sentence.** Step t waits for step t−1, so long sequences train slowly on GPUs.
- **Long paths between words.** Information from the first word has to survive many steps to reach the last, so long-range dependencies are hard to learn.

Attention already helped RNNs look back over the whole input. The paper asks what happens if attention is the *only* mechanism.

## 2. The idea: the Transformer
An encoder–decoder model with no recurrence and no convolution. Each layer mixes information across positions with **self-attention**, then transforms every position on its own with a small feed-forward network.
- **Encoder:** a stack of N = 6 identical layers, each with a multi-head self-attention sub-layer and a position-wise feed-forward sub-layer.
- **Decoder:** another N = 6 layers with a third sub-layer that attends over the encoder's output. Its self-attention is **masked**, so position i sees only earlier positions and cannot peek at the words it is about to predict.
- Every sub-layer sits inside a **residual connection** followed by **layer normalization**, LayerNorm(x + Sublayer(x)). All layers output vectors of size $d_{model} = 512$.

## 3. Scaled dot-product attention
Each position produces a query, a key and a value by multiplying its vector with learned matrices. Stacked over all positions they form $Q$, $K$ and $V$:

$$\text{Attention}(Q,K,V) = \text{softmax}\left(\frac{QK^\top}{\sqrt{d_k}}\right)V$$

- $QK^\top$ scores every query against every key with a dot product: a grid of similarities.
- Dividing by $\sqrt{d_k}$ stops the scores growing with the vector size. Large scores push softmax into a flat region where gradients nearly vanish.
- Softmax turns each row of scores into weights that sum to 1, and the output is the weighted average of the values.

## 4. Multi-head attention
Instead of one attention over 512-wide vectors, the model runs $h = 8$ attentions in parallel on smaller projections ($d_k = d_v = 64$), concatenates them and projects back:

$$\text{MultiHead}(Q,K,V) = \text{Concat}(\text{head}_1,\dots,\text{head}_h)\,W^O,\quad \text{head}_i = \text{Attention}(QW_i^Q, KW_i^K, VW_i^V)$$

Heads can specialise (one follows syntax, another nearby words) for about the cost of one full-width head. Attention appears three times: encoder self-attention, masked decoder self-attention, and encoder–decoder attention, where queries come from the decoder and keys and values from the encoder.

## 5. Feed-forward layers, embeddings and positions
- **Position-wise feed-forward network:** $\text{FFN}(x) = \max(0, xW_1 + b_1)W_2 + b_2$, applied to each position separately, inner width $d_{ff} = 2048$.
- **Embeddings:** tokens become learned 512-dimensional vectors. The input embeddings, output embeddings and the final pre-softmax projection share one weight matrix.
- **Positional encoding:** attention ignores word order, so a position signal is added to every embedding:

$$PE_{(pos,2i)} = \sin\left(pos / 10000^{2i/d_{model}}\right),\qquad PE_{(pos,2i+1)} = \cos\left(pos / 10000^{2i/d_{model}}\right)$$

Each dimension is a sine or cosine of a different wavelength, so a fixed offset between positions becomes a linear relationship the model can learn. Learned position embeddings scored about the same; the authors kept sinusoids because they may extend to longer sequences.

## 6. Why self-attention?
Per layer, for sequence length n and vector width d:

| Layer type | Work per layer | Sequential steps | Longest path between two words |
|---|---|---|---|
| Self-attention | $O(n^2 \cdot d)$ | $O(1)$ | $O(1)$ |
| Recurrent | $O(n \cdot d^2)$ | $O(n)$ | $O(n)$ |
| Convolutional | $O(k \cdot n \cdot d^2)$ | $O(1)$ | $O(\log_k n)$ |

Self-attention links every pair of words in one step and parallelises fully. It is cheaper than recurrence whenever the sentence is shorter than the vector width, which is the usual case in translation.

## 7. Training
- **Data:** WMT 2014 English→German (about 4.5M sentence pairs, byte-pair encoding, roughly 37k shared tokens) and English→French (36M sentences, 32k word-pieces).
- **Hardware:** one machine with 8 NVIDIA P100 GPUs. The base model trained for 100k steps (about 12 hours), the big model for 300k steps (about 3.5 days).
- **Optimizer:** Adam ($\beta_1 = 0.9$, $\beta_2 = 0.98$, $\epsilon = 10^{-9}$). The learning rate rises linearly for the first 4,000 steps, then decays with the inverse square root of the step number.
- **Regularization:** dropout 0.1 on every sub-layer output and on the embedding sums, plus label smoothing 0.1, which costs a little perplexity but improves BLEU.

## 8. Results
- English→German: the big Transformer reached **28.4 BLEU**, over 2 BLEU above the best earlier results, ensembles included.
- English→French: **41.8 BLEU**, a new single-model state of the art, at a fraction of earlier models' training cost.
- With little tuning, the same architecture also did well on English constituency parsing, a sign that it generalises beyond translation.

## 9. Why it matters
The Transformer became the backbone of modern AI: BERT, the GPT family, vision transformers and today's large language models all reuse the blocks above.

## Concepts to know first
Bottom-up, as mapped in this project: vectors and matrices → matrix multiplication → dot product as similarity → probability distributions → softmax → derivatives and gradient descent → neural networks and backpropagation → word embeddings → sequence modeling → attention → self-attention and multi-head attention, plus trigonometry for positional encoding → **the Transformer**.
`;

const DEMO_SUMMARY = String.raw`## TL;DR
The Transformer drops recurrence for attention: every word looks at every other word in one parallel step. It set new translation records while training far faster than recurrent models.

## Key ideas
- **Attention only.** No RNNs or convolutions, just stacked self-attention and feed-forward layers.
- **Scaled dot-product attention.** $\text{softmax}(QK^\top/\sqrt{d_k})\,V$ weights each value by how well its key matches the query.
- **Multi-head attention.** Eight smaller attentions run in parallel, so the model tracks several relationships at once.
- **Positional encoding.** Sine and cosine signals restore the word order that attention alone ignores.
- **Residuals and layer norm** around every sub-layer keep the 6-layer stacks trainable.

## How it works
The encoder turns the source sentence into context-aware vectors. The decoder writes the translation one token at a time, attending to its own earlier outputs (masked) and to the encoder's vectors.

## Results
28.4 BLEU on WMT 2014 English→German and 41.8 BLEU on English→French, the best reported in 2017, after 12 hours (base model) to 3.5 days (big model) on 8 GPUs.

## Why it matters
It is the architecture behind BERT, GPT and today's large language models.
`;

const DEMO_CHEATSHEET = String.raw`## Core formulas
| Idea | Formula |
|---|---|
| Scaled dot-product attention | $\text{softmax}(QK^\top/\sqrt{d_k})\,V$ |
| Multi-head attention | $\text{Concat}(\text{head}_1,\dots,\text{head}_8)\,W^O$ |
| Feed-forward layer | $\max(0, xW_1 + b_1)W_2 + b_2$ |
| Sub-layer wrapper | $\text{LayerNorm}(x + \text{Sublayer}(x))$ |
| Positional encoding | $\sin(pos/10000^{2i/d})$ on even dims, $\cos$ on odd |
| Softmax | $\text{softmax}(z)_i = e^{z_i} / \sum_j e^{z_j}$ |
| Gradient descent | $\theta \leftarrow \theta - \eta\,\nabla_\theta L$ |
| Matrix product entry | $(AB)_{ij} = \sum_k A_{ik}B_{kj}$ |

## Key numbers (base model)
N = 6 layers per stack · $d_{model} = 512$ · $h = 8$ heads · $d_k = d_v = 64$ · $d_{ff} = 2048$ · dropout 0.1 · 4,000 warm-up steps

## Build-up path
Matrices → dot product → softmax → attention → multi-head self-attention → plus positional encoding → **Transformer**

## Remember
- Divide by $\sqrt{d_k}$: big dot products saturate softmax and kill the gradients.
- The decoder masks future positions so it cannot see the answer.
- Attention is order-blind; positional encodings put the order back.
- Self-attention gives an $O(1)$ path between any two words and runs in parallel, but its cost grows as $n^2$.
`;

const DEMO_LESSON_LINEAR_ALGEBRA = {
  lesson: `## Why this matters

Every single computation inside the Transformer — the paper at the top of this tree — is built from one operation: **matrix multiplication**. Attention scores? A matrix product. Turning words into predictions? A matrix product. If you get comfortable with matrices now, the rest of this tree becomes arithmetic you already know, just organized well.

## From vectors to matrices

You already know a vector: a list of numbers like $v = (2, 1)$, drawn as an arrow. A **matrix** is simply several vectors stacked into a grid. For example

$$A = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}$$

is a $2 \\times 2$ matrix: 2 rows, 2 columns. You can read its rows as two vectors, or its columns as two vectors — both views get used constantly.

**Matrix × vector** is the key move. To compute $Av$, take the dot of each *row* of $A$ with $v$:

$$Av = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}\\begin{pmatrix} 2 \\\\ 1 \\end{pmatrix} = \\begin{pmatrix} 1\\cdot 2 + 2\\cdot 1 \\\\ 3\\cdot 2 + 4\\cdot 1 \\end{pmatrix} = \\begin{pmatrix} 4 \\\\ 10 \\end{pmatrix}$$

So a matrix is best thought of not as a grid of numbers but as a **machine that transforms vectors**: in goes $(2,1)$, out comes $(4,10)$. Rotations, stretches, projections — all are matrices.

## Matrix × matrix

Multiplying two matrices $AB$ just means: apply machine $B$, then machine $A$. Entry-by-entry, the value in row $i$, column $j$ of $AB$ is the dot product of row $i$ of $A$ with column $j$ of $B$. One consequence you should test yourself on: the shapes must be compatible — an $(m \\times n)$ matrix times an $(n \\times p)$ matrix gives an $(m \\times p)$ result. The inner numbers must match.

Order matters: $AB \\ne BA$ in general. "Rotate then stretch" is not "stretch then rotate."

## Worked example

A tiny "embedding table": suppose each of 3 words is a row vector of length 2:

$$E = \\begin{pmatrix} 0 & 1 \\\\ 1 & 0 \\\\ 1 & 1 \\end{pmatrix}$$

Multiply by a weight matrix $W = \\begin{pmatrix} 2 & 0 \\\\ 0 & 3 \\end{pmatrix}$. Then $EW$ is $(3\\times 2)(2 \\times 2) \\to 3 \\times 2$:

$$EW = \\begin{pmatrix} 0 & 3 \\\\ 2 & 0 \\\\ 2 & 3 \\end{pmatrix}$$

One multiplication transformed *all three words at once*. That's the trick deep learning leans on: matrices process whole batches in parallel — exactly why the Transformer, built purely from matrix ops, trains so fast on GPUs.

## Common misconception

"Matrix multiplication is just multiplying matching cells." No — that element-wise product exists but is a different operation. True matrix multiplication is **rows dotted with columns**, which is what lets a matrix act as a transformation rather than a spreadsheet of independent numbers.

## What this unlocks

- **Dot Product as Similarity** — the row-times-column move, studied on its own, becomes attention's scoring rule.
- **Neural Networks** — layers are literally matrix multiplications with a squish in between.
- Every formula in the Transformer paper, like $QK^T$, will read as "a grid of dot products" instead of hieroglyphics.`,
  quiz: [
    {
      q: 'A matrix of shape (4 × 2) is multiplied by a matrix of shape (2 × 3). What is the shape of the result?',
      options: ['4 × 3', '2 × 2', '4 × 2', 'It is not defined'],
      answer: 0,
      why: 'Inner dimensions (2 and 2) must match and cancel; the outer dimensions 4 and 3 remain: (4 × 2)(2 × 3) → 4 × 3.'
    },
    {
      q: 'The entry in row 2, column 1 of the product AB equals…',
      options: [
        'the dot product of row 2 of A with column 1 of B',
        'the product of entry (2,1) of A and entry (2,1) of B',
        'the dot product of column 2 of A with row 1 of B',
        'the sum of row 2 of A'
      ],
      answer: 0,
      why: 'Matrix multiplication is rows-of-the-left dotted with columns-of-the-right.'
    },
    {
      q: 'Best mental model of a matrix, for deep learning purposes?',
      options: [
        'A machine that transforms vectors',
        'A table for storing data only',
        'A single large number',
        'A list of equations with no geometric meaning'
      ],
      answer: 0,
      why: 'Multiplying by a matrix maps input vectors to output vectors — rotation, stretching, projection. Networks chain such machines.'
    },
    {
      q: 'Why does AB ≠ BA in general?',
      options: [
        'Because applying transformation B then A differs from applying A then B',
        'Because matrices contain different numbers',
        'It is false — matrix multiplication is commutative',
        'Because the matrices must first be inverted'
      ],
      answer: 0,
      why: 'Matrix products compose transformations, and composition order matters (rotate-then-stretch ≠ stretch-then-rotate).'
    }
  ],
  cached: true,
  demo: true
};

// ---------------- sample career paths (tour, no AI) ----------------
// Career maps are the tools and skills job postings ask for, not courses. "concepts"
// links a tool to the knowledge-graph concepts it rests on (ids from DEMO_NODES).
const CAREER_TOOLS = {
  python: { name: 'Python', level: 0, branch: 'languages & tools', blurb: 'The default language for data and ML work: scripts, notebooks and services.', role: 'Every model, pipeline and experiment in the job is written in Python.' },
  git: { name: 'Git & GitHub', level: 0, branch: 'engineering practices', blurb: 'Version control with branches, pull requests and code review.', role: 'All code and experiment configs ship through reviewed pull requests.' },
  sql: { name: 'SQL', level: 0, branch: 'data', blurb: 'Querying and joining tables in databases and warehouses.', role: 'Pulling training data and metrics out of the warehouse (BigQuery, Snowflake, Postgres).' },
  linux_cli: { name: 'Linux & the command line', level: 0, branch: 'infrastructure', blurb: 'Shell, SSH, processes and files on the servers where work runs.', role: 'Training jobs run on remote Linux GPU machines driven from a terminal.' },
  numpy_pandas: { name: 'NumPy & pandas', tier: 'novice', branch: 'data', prereqs: ['python'], concepts: ['linear_algebra'], blurb: 'Fast arrays and dataframes for cleaning, reshaping and analysing data.', role: 'Cleaning datasets and building features before any training run.' },
  data_visualization: { name: 'Data visualization (Matplotlib, Tableau)', tier: 'novice', branch: 'analysis', prereqs: ['numpy_pandas'], blurb: 'Charts and dashboards that make results readable.', role: 'Explaining findings and model behaviour to the team and stakeholders.' },
  scikit_learn: { name: 'scikit-learn', tier: 'intermediate', branch: 'ML frameworks', prereqs: ['numpy_pandas'], concepts: ['gradient_descent', 'probability_distributions'], blurb: 'Classic ML models, pipelines and cross-validation behind one API.', role: 'Fast baselines such as logistic regression and gradient boosting before any deep model.' },
  ab_testing: { name: 'A/B testing & experiment design', tier: 'intermediate', branch: 'analysis', prereqs: ['numpy_pandas', 'sql'], concepts: ['probability_distributions'], blurb: 'Designing experiments and testing whether a change really moved a metric.', role: 'Deciding whether a product or model change actually helped users.' },
  pytorch: { name: 'PyTorch', tier: 'intermediate', branch: 'ML frameworks', prereqs: ['numpy_pandas'], concepts: ['neural_networks_basics', 'backpropagation', 'gradient_descent'], blurb: 'The most-used deep learning framework: tensors, autograd and training loops.', role: 'Writing, training and debugging neural networks day to day.' },
  tensorflow_keras: { name: 'TensorFlow / Keras', tier: 'intermediate', branch: 'ML frameworks', prereqs: ['numpy_pandas'], concepts: ['neural_networks_basics'], blurb: 'Google\'s deep learning stack, common in production and on-device models.', role: 'Maintaining existing production models and TFLite deployments.' },
  jax: { name: 'JAX', tier: 'advanced', branch: 'ML frameworks', prereqs: ['numpy_pandas'], concepts: ['derivatives_gradients', 'linear_algebra'], blurb: 'NumPy-style arrays with automatic differentiation and XLA compilation.', role: 'Fast research prototypes and large-scale TPU training.' },
  hugging_face: { name: 'Hugging Face Transformers', tier: 'intermediate', branch: 'ML frameworks', prereqs: ['pytorch'], concepts: ['transformer_architecture', 'self_attention', 'word_embeddings'], blurb: 'Library and hub of pretrained Transformer models, tokenizers and datasets.', role: 'Fine-tuning and serving pretrained language and vision models.' },
  experiment_tracking: { name: 'Experiment tracking (MLflow, W&B)', tier: 'novice', branch: 'MLOps & cloud', prereqs: ['pytorch', 'git'], blurb: 'Logging each run\'s config, metrics and artifacts.', role: 'Keeping every result reproducible and comparable across the team.' },
  docker: { name: 'Docker', tier: 'novice', branch: 'MLOps & cloud', prereqs: ['linux_cli'], blurb: 'Packaging code and dependencies into containers that run the same everywhere.', role: 'Every training job and model server ships as a container image.' },
  rest_apis: { name: 'Model serving APIs (FastAPI)', tier: 'intermediate', branch: 'software engineering', prereqs: ['python', 'docker'], blurb: 'Putting a model behind an HTTP endpoint with validation and batching.', role: 'Exposing models to the product as low-latency services.' },
  llm_apps: { name: 'LLM APIs, RAG & vector databases', tier: 'advanced', branch: 'ML frameworks', prereqs: ['hugging_face', 'rest_apis'], concepts: ['attention_mechanism', 'word_embeddings', 'dot_product_similarity'], blurb: 'Building on large language models with prompting, retrieval and embedding search.', role: 'Shipping chat, search and agent features on top of LLMs.' },
  cloud_ml: { name: 'Cloud ML (AWS SageMaker, GCP Vertex AI)', tier: 'intermediate', branch: 'MLOps & cloud', prereqs: ['docker', 'linux_cli'], blurb: 'Managed GPUs, training jobs and hosted endpoints.', role: 'Running training at scale and hosting production endpoints.' },
  kubernetes: { name: 'Kubernetes', tier: 'advanced', branch: 'MLOps & cloud', prereqs: ['docker'], blurb: 'Orchestrating containers across a cluster.', role: 'Scaling model servers and batch jobs up and down with demand.' },
  data_pipelines: { name: 'Data pipelines (Airflow, Spark)', tier: 'intermediate', branch: 'data', prereqs: ['sql', 'numpy_pandas'], blurb: 'Scheduled jobs that move and transform data at scale.', role: 'Refreshing training data and features on a schedule.' },
  testing_ci: { name: 'Testing & CI/CD (pytest, GitHub Actions)', tier: 'novice', branch: 'engineering practices', prereqs: ['git', 'python'], blurb: 'Automated tests and pipelines that check every change.', role: 'Catching broken code and data before it reaches production.' },
  distributed_training: { name: 'GPU & distributed training (CUDA, DDP)', tier: 'advanced', branch: 'ML frameworks', prereqs: ['pytorch', 'linux_cli'], concepts: ['linear_algebra'], blurb: 'Training across many GPUs with mixed precision and sharding.', role: 'Training models too large or slow for a single GPU.' },
  model_evaluation: { name: 'Model evaluation & error analysis', tier: 'intermediate', branch: 'analysis', prereqs: ['scikit_learn'], concepts: ['probability_distributions', 'softmax_function'], blurb: 'Choosing metrics, slicing errors and comparing models fairly.', role: 'Deciding when a model is good enough to ship.' },
  paper_writing: { name: 'Reading & writing papers (LaTeX, arXiv)', tier: 'intermediate', branch: 'research', prereqs: ['git'], blurb: 'Following the literature and writing results up clearly.', role: 'Turning experiments into papers and keeping up with arXiv.' },
  train_finetune: { name: 'Train & fine-tune deep models', tier: 'advanced', branch: 'ML frameworks', prereqs: ['pytorch', 'hugging_face', 'model_evaluation'], concepts: ['transformer_architecture', 'backpropagation'], blurb: 'Turning data into a model that beats the baseline.', role: 'The core of the job: training, tuning and fine-tuning models.' },
  mlops_deployment: { name: 'MLOps: deploy & monitor models', tier: 'advanced', branch: 'MLOps & cloud', prereqs: ['rest_apis', 'cloud_ml', 'experiment_tracking', 'testing_ci'], blurb: 'Rolling models out, monitoring them for drift and retraining.', role: 'Owning models in production end to end.' },
  predictive_modeling: { name: 'Predictive modeling', tier: 'advanced', branch: 'analysis', prereqs: ['scikit_learn', 'model_evaluation'], concepts: ['probability_distributions'], blurb: 'Forecasting and classification models that drive decisions.', role: 'Building the churn, demand and risk models the business relies on.' },
  product_analytics: { name: 'Product analytics & insight', tier: 'advanced', branch: 'analysis', prereqs: ['ab_testing', 'data_visualization', 'sql'], blurb: 'Turning data into decisions and clear recommendations.', role: 'Answering "what should we build next?" with evidence.' },
  research_prototyping: { name: 'Research prototyping & ablations', tier: 'advanced', branch: 'research', prereqs: ['pytorch', 'experiment_tracking', 'distributed_training'], concepts: ['transformer_architecture', 'self_attention'], blurb: 'Implementing new ideas fast and testing which parts matter.', role: 'Running the experiments behind a paper or product breakthrough.' }
};

// [id, importance, core?] — critical: in most postings; important: common; optional: nice to have.
const DEMO_CAREER_FIELDS = { 'AI / Machine Learning Engineer': 'machine learning engineering', 'Data Scientist': 'data science', 'Research Scientist (ML)': 'machine learning research' };
const DEMO_CAREERS = {
  'AI / Machine Learning Engineer': [
    ['python', 'critical'], ['git', 'critical'], ['sql', 'important'], ['linux_cli', 'important'],
    ['numpy_pandas', 'critical'], ['scikit_learn', 'important'], ['pytorch', 'critical'], ['tensorflow_keras', 'optional'],
    ['hugging_face', 'important'], ['llm_apps', 'important'], ['experiment_tracking', 'important'], ['docker', 'critical'],
    ['rest_apis', 'important'], ['cloud_ml', 'important'], ['kubernetes', 'optional'], ['data_pipelines', 'optional'],
    ['testing_ci', 'important'], ['model_evaluation', 'critical'], ['train_finetune', 'critical', true], ['mlops_deployment', 'critical', true]
  ],
  'Data Scientist': [
    ['python', 'critical'], ['sql', 'critical'], ['git', 'important'],
    ['numpy_pandas', 'critical'], ['data_visualization', 'critical'], ['scikit_learn', 'critical'], ['ab_testing', 'critical'],
    ['model_evaluation', 'important'], ['data_pipelines', 'important'], ['pytorch', 'optional'], ['experiment_tracking', 'optional'],
    ['cloud_ml', 'optional'], ['predictive_modeling', 'critical', true], ['product_analytics', 'critical', true]
  ],
  'Research Scientist (ML)': [
    ['python', 'critical'], ['git', 'important'], ['linux_cli', 'important'],
    ['numpy_pandas', 'critical'], ['pytorch', 'critical'], ['jax', 'optional'], ['hugging_face', 'important'],
    ['experiment_tracking', 'important'], ['distributed_training', 'important'], ['scikit_learn', 'optional'], ['model_evaluation', 'critical'],
    ['paper_writing', 'critical'], ['llm_apps', 'optional'], ['train_finetune', 'critical', true], ['research_prototyping', 'critical', true]
  ]
};

// A career's skills as graph nodes (the shape runCareerGraph produces), without AI.
function demoCareerSkills(name) {
  const { sanitizeGraph } = require('./graphUtil');
  const picks = DEMO_CAREERS[name] || DEMO_CAREERS['AI / Machine Learning Engineer'];
  const ids = new Set(picks.map(([id]) => id));
  const raw = picks.map(([id, , core]) => {
    const t = CAREER_TOOLS[id];
    return { id, name: t.name, level: t.level === 0 ? 0 : 1, core: !!core, tier: t.tier || '', branch: t.branch, blurb: t.blurb, prereqs: (t.prereqs || []).filter((p) => ids.has(p)) };
  });
  const extra = new Map(picks.map(([id, importance]) => [id, importance]));
  return sanitizeGraph(raw).map((n) => ({
    ...n,
    importance: extra.get(n.id) || 'important',
    roleNote: CAREER_TOOLS[n.id].role,
    concepts: CAREER_TOOLS[n.id].concepts || []
  })).map((n) => { delete n.usedInPaper; delete n.forNewPaper; return n; });
}

// The demo project: the real paper (embedded from arXiv), a prepared map, one saved
// refresher, a summary and a cheatsheet. Used by "Try the demo" and the guided tour.
function createDemoProject(name) {
  const store = require('./store');
  const { sanitizeGraph } = require('./graphUtil');
  const p = store.createProject(name || DEMO_PAPER.title, 'paper');
  const paperId = store.id();
  store.savePaperFiles(p.id, paperId, 'attention-is-all-you-need.md', Buffer.from(DEMO_PAPER_MD), DEMO_PAPER_MD);
  const now = Date.now();
  p.papers.push({ id: paperId, name: DEMO_PAPER.title, title: DEMO_PAPER.title, authors: DEMO_PAPER.authors, pages: DEMO_PAPER.pages, pdfUrl: DEMO_PAPER.pdfUrl, sourceUrl: DEMO_PAPER.sourceUrl, addedAt: now, analyzed: true, summarizedAt: now });
  p.nodes = sanitizeGraph(DEMO_NODES.map((n) => ({ ...n, sources: [paperId] })));
  for (const n of p.nodes) {
    n.usage = n.usedInPaper ? { [paperId]: n.usedInPaper } : {};
    delete n.usedInPaper;
    delete n.forNewPaper;
  }
  p.field = 'machine learning';
  p.demo = true;
  store.saveProject(p);
  store.savePaperSummary(p.id, paperId, { markdown: DEMO_SUMMARY, generatedAt: now, demo: true });
  store.saveCheatsheet(p.id, { markdown: DEMO_CHEATSHEET, generatedAt: now, concepts: p.nodes.length, demo: true });
  store.saveLesson(p.id, 'linear_algebra', DEMO_LESSON_LINEAR_ALGEBRA);
  store.logEvent(p.id, 'project_created', { name: p.name });
  store.logEvent(p.id, 'paper_added', { paper: DEMO_PAPER.title });
  return p;
}

module.exports = { DEMO_NODES, DEMO_PAPER, DEMO_PAPER_MD, DEMO_SUMMARY, DEMO_CHEATSHEET, DEMO_LESSON_LINEAR_ALGEBRA, DEMO_CAREERS, DEMO_CAREER_FIELDS, CAREER_TOOLS, demoCareerSkills, createDemoProject };
