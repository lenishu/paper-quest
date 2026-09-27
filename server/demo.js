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

const DEMO_PAPER_MD = `# Attention Is All You Need (demo entry)

This demo project is built around the 2017 Transformer paper by Vaswani et al.

The paper proposes a sequence-to-sequence architecture that removes recurrence and
convolutions entirely, relying on a self-attention mechanism to relate all positions
of a sequence to each other in parallel. Positional information is injected through
sinusoidal encodings, and the model is trained end-to-end with backpropagation.

Replace this demo with your own PDFs: create a new project and drop papers in.
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

module.exports = { DEMO_NODES, DEMO_PAPER_MD, DEMO_LESSON_LINEAR_ALGEBRA };
