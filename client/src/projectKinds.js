// What a project holds. Every kind grows the same concept map; the kind sets the
// wording here and tells the analysis prompt what material it reads (server/store.js
// PROJECT_KINDS and prompts.js KIND_NOTES must list the same ids).
export const PROJECT_KINDS = [
  { id: 'paper', icon: '📄', label: 'Research paper', material: 'Papers', add: 'Add paper', hint: 'Map the prerequisites of one or more research papers.' },
  { id: 'class', icon: '🏫', label: 'Class', material: 'Class material', add: 'Add notes or slides', hint: 'Lecture notes, slides and problem sets for a class you are taking.' },
  { id: 'course', icon: '🎓', label: 'Course', material: 'Course material', add: 'Add course material', hint: 'An online course or a textbook, chapter by chapter.' },
  { id: 'club', icon: '🤝', label: 'Club', material: 'Club material', add: 'Add club material', hint: 'Guides, meeting notes and reading lists for a club or team.' },
  { id: 'hackathon', icon: '⚡', label: 'Hackathon', material: 'Hackathon material', add: 'Add brief or docs', hint: 'The challenge brief, API docs and the tools your team needs.' },
  { id: 'notes', icon: '📝', label: 'Notes', material: 'Notes', add: 'Add notes', hint: 'Your own notes: see what they cover and what they build on.' }
];

export const kindOf = (id) => PROJECT_KINDS.find((k) => k.id === id) || PROJECT_KINDS[0];
